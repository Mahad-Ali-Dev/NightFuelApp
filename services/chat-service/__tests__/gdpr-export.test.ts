/**
 * GDPR data-export regression suite — GET /v1/chat/internal/user/:userId/export.
 *
 * Read-only counterpart of the purge. Two guarantees are locked in here:
 *   1. GUARD — the route is server-to-server-only, behind the SAME internal-token
 *      guard the purge uses. Without the X-Internal-Token header (or with the
 *      wrong one) it MUST answer 404 (the stock not-found body), never revealing
 *      the route exists, and ChatService.exportUser is NEVER invoked.
 *   2. EXPORT — with the correct X-Internal-Token, the handler returns the user's
 *      rows across the SAME three user-owned tables the purge covers
 *      (coach_profiles, conversations, messages), keyed by table name, and only
 *      the target user's rows (others are excluded).
 *
 * Layers mirror the purge suite:
 *   • SERVICE — the real ChatService.exportUser runs against a tiny in-memory
 *     Prisma fake (no DB in CI). It proves the actual read semantics: messages by
 *     sender_id, conversations where the user is EITHER participant, the user's
 *     coach profile — and that OTHER users' rows are NOT returned. It also proves
 *     the export table set EXACTLY matches the purge table set (sync invariant)
 *     and that no secret/credential-looking field leaks into the output.
 *   • REST — the genuine `routes` plugin (mock ChatService) proves the guard and
 *     the 200 body wiring.
 */
import { describe, it, expect, afterEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import fastifyWebsocket from '@fastify/websocket';
import routes from '../src/routes';
import { ChatService } from '../src/chat.service';

const JWT_SECRET = 'test-secret-of-at-least-32-chars-long';
const INTERNAL_TOKEN = 'internal-shared-secret-token-xyz';

// ── In-memory Prisma fake (export slice) ─────────────────────────────────────────
// Implements just what ChatService.exportUser touches: findMany on coachProfile /
// conversation / message with the exact `where` shapes exportUser builds, plus the
// message orderBy(createdAt desc) + take bound.
function makeFakePrisma(seed?: {
    coachProfiles?: any[];
    conversations?: any[];
    messages?: any[];
}) {
    const state = {
        coachProfiles: seed?.coachProfiles ? [...seed.coachProfiles] : [],
        conversations: seed?.conversations ? [...seed.conversations] : [],
        messages: seed?.messages ? [...seed.messages] : [],
    };

    const prisma: any = {
        coachProfile: {
            findMany: ({ where }: any) =>
                Promise.resolve(state.coachProfiles.filter((r) => r.userId === where.userId)),
        },
        conversation: {
            findMany: ({ where }: any) =>
                Promise.resolve(
                    state.conversations.filter((r) =>
                        where.OR.some(
                            (c: any) =>
                                (c.participantA && r.participantA === c.participantA) ||
                                (c.participantB && r.participantB === c.participantB),
                        ),
                    ),
                ),
        },
        message: {
            findMany: ({ where, orderBy, take }: any) => {
                let rows = state.messages.filter((r) => r.senderId === where.senderId);
                if (orderBy?.createdAt === 'desc') {
                    rows = [...rows].sort(
                        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
                    );
                }
                if (typeof take === 'number') rows = rows.slice(0, take);
                return Promise.resolve(rows);
            },
        },
    };

    // The export/erasure-sync test also drives the real purgeUser, so the fake
    // additionally supports the deleteMany + $transaction slice purgeUser needs.
    const deleteFrom = (rows: any[], pred: (r: any) => boolean) => {
        const before = rows.length;
        const kept = rows.filter((r) => !pred(r));
        rows.length = 0;
        rows.push(...kept);
        return { count: before - kept.length };
    };
    prisma.message.deleteMany = ({ where }: any) =>
        Promise.resolve(deleteFrom(state.messages, (r) => r.senderId === where.senderId));
    prisma.conversation.deleteMany = ({ where }: any) =>
        Promise.resolve(
            deleteFrom(state.conversations, (r) =>
                where.OR.some(
                    (c: any) =>
                        (c.participantA && r.participantA === c.participantA) ||
                        (c.participantB && r.participantB === c.participantB),
                ),
            ),
        );
    prisma.coachProfile.deleteMany = ({ where }: any) =>
        Promise.resolve(deleteFrom(state.coachProfiles, (r) => r.userId === where.userId));
    prisma.$transaction = (ops: Promise<any>[]) => Promise.all(ops);

    return { prisma, state };
}

/** Build a fresh app wired like src/index.ts, with the internal token set. */
async function buildApp(chatService: any, internalServiceToken = INTERNAL_TOKEN): Promise<FastifyInstance> {
    const app = Fastify({ logger: false });
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    await app.register(fastifyWebsocket as any);
    await app.register(routes as any, { chatService, jwtSecret: JWT_SECRET, internalServiceToken });
    await app.ready();
    return app;
}

describe('ChatService.exportUser (service layer, real logic vs fake Prisma)', () => {
    it('returns ONLY the target user rows across all three tables, keyed by table name', async () => {
        const { prisma } = makeFakePrisma({
            coachProfiles: [
                { userId: 'victim', specialty: 'sleep', bio: 'hi', hourlyRate: 10 },
                { userId: 'other', specialty: 'diet', bio: 'no', hourlyRate: 20 },
            ],
            conversations: [
                { id: 'c1', participantA: 'victim', participantB: 'other' }, // victim is A
                { id: 'c2', participantA: 'other', participantB: 'victim' }, // victim is B
                { id: 'c3', participantA: 'other', participantB: 'third' }, // unrelated
            ],
            messages: [
                { id: 'm1', senderId: 'victim', text: 'a', createdAt: '2026-01-01T00:00:00Z' },
                { id: 'm2', senderId: 'victim', text: 'b', createdAt: '2026-01-02T00:00:00Z' },
                { id: 'm3', senderId: 'other', text: 'c', createdAt: '2026-01-03T00:00:00Z' },
            ],
        });
        const svc = new ChatService(prisma as any);

        const out = await svc.exportUser('victim');

        // Only the victim's coach profile, both their conversations, both their messages.
        expect(out.coach_profiles.map((c: any) => c.userId)).toEqual(['victim']);
        expect(out.conversations.map((c: any) => c.id).sort()).toEqual(['c1', 'c2']);
        expect(out.messages.map((m: any) => m.id).sort()).toEqual(['m1', 'm2']);
        // Unrelated user's rows are NOT present anywhere in the export.
        const serialized = JSON.stringify(out);
        expect(serialized).not.toContain('m3');
        expect(serialized).not.toContain('"userId":"other"');
    });

    it('export table set EXACTLY matches the purge table set (export/erasure sync)', async () => {
        const { prisma } = makeFakePrisma();
        const svc = new ChatService(prisma as any);

        const purgeTables = Object.keys(await svc.purgeUser('nobody')).sort();
        const exportTables = Object.keys(await svc.exportUser('nobody'))
            .filter((k) => k !== '_meta')
            .sort();

        expect(exportTables).toEqual(purgeTables);
        expect(exportTables).toEqual(['coach_profiles', 'conversations', 'messages']);
    });

    it('does NOT leak any secret/credential-looking field (no password/token/secret/key)', async () => {
        const { prisma } = makeFakePrisma({
            coachProfiles: [{ userId: 'victim', specialty: 'sleep', bio: 'hi', hourlyRate: 10 }],
            conversations: [{ id: 'c1', participantA: 'victim', participantB: 'other' }],
            messages: [{ id: 'm1', senderId: 'victim', text: 'hello', createdAt: '2026-01-01T00:00:00Z' }],
        });
        const svc = new ChatService(prisma as any);

        const out = await svc.exportUser('victim');
        const serialized = JSON.stringify(out).toLowerCase();

        for (const forbidden of ['password', 'passwordhash', 'token', 'secret', 'apikey', 'privatekey']) {
            expect(serialized).not.toContain(forbidden);
        }
    });

    it('returns empty arrays (no throw) for a user with no rows — read-only & idempotent', async () => {
        const { prisma } = makeFakePrisma({ coachProfiles: [{ userId: 'someone-else' }] });
        const svc = new ChatService(prisma as any);

        const first = await svc.exportUser('ghost');
        const second = await svc.exportUser('ghost');

        expect(first.coach_profiles).toEqual([]);
        expect(first.conversations).toEqual([]);
        expect(first.messages).toEqual([]);
        // Repeatable: identical output for unchanged data.
        expect(second).toEqual(first);
    });

    it('bounds the messages table and flags truncation when over the cap', async () => {
        // Seed exactly cap+1 messages; exportUser asks for cap+1 (take) and slices to cap.
        const cap = 50_000;
        const messages = Array.from({ length: cap + 1 }, (_, i) => ({
            id: `m${i}`,
            senderId: 'victim',
            text: 't',
            createdAt: new Date(2026, 0, 1, 0, 0, i).toISOString(),
        }));
        const { prisma } = makeFakePrisma({ messages });
        const svc = new ChatService(prisma as any);

        const out = await svc.exportUser('victim');

        expect(out.messages.length).toBe(cap);
        expect(out._meta.messagesTruncated).toBe(true);
        expect(out._meta.messageLimit).toBe(cap);
    });
});

describe('GET /v1/chat/internal/user/:userId/export (route + internal-token guard)', () => {
    let app: FastifyInstance;

    afterEach(async () => {
        if (app) await app.close();
    });

    it('404s without the X-Internal-Token header and NEVER calls exportUser', async () => {
        const exportUser = jest.fn(() =>
            Promise.resolve({ coach_profiles: [], conversations: [], messages: [], _meta: { messagesTruncated: false, messageLimit: 50000 } }),
        );
        app = await buildApp({ exportUser });

        const res = await app.inject({ method: 'GET', url: '/v1/chat/internal/user/victim/export' });

        expect(res.statusCode).toBe(404);
        expect(res.json()).toEqual({ statusCode: 404, error: 'Not Found', message: 'Route not found' });
        expect(exportUser).not.toHaveBeenCalled();
    });

    it('404s with a WRONG X-Internal-Token and NEVER calls exportUser', async () => {
        const exportUser = jest.fn(() =>
            Promise.resolve({ coach_profiles: [], conversations: [], messages: [], _meta: { messagesTruncated: false, messageLimit: 50000 } }),
        );
        app = await buildApp({ exportUser });

        const res = await app.inject({
            method: 'GET',
            url: '/v1/chat/internal/user/victim/export',
            headers: { 'x-internal-token': 'wrong-token' },
        });

        expect(res.statusCode).toBe(404);
        expect(exportUser).not.toHaveBeenCalled();
    });

    it('returns the user data across the expected tables WITH the correct token', async () => {
        const data = {
            coach_profiles: [{ userId: 'victim', specialty: 'sleep' }],
            conversations: [{ id: 'c1', participantA: 'victim', participantB: 'other' }],
            messages: [{ id: 'm1', senderId: 'victim', text: 'hi' }],
            _meta: { messagesTruncated: false, messageLimit: 50000 },
        };
        const exportUser = jest.fn(() => Promise.resolve(data));
        app = await buildApp({ exportUser });

        const res = await app.inject({
            method: 'GET',
            url: '/v1/chat/internal/user/victim/export',
            headers: { 'x-internal-token': INTERNAL_TOKEN },
        });

        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({ userId: 'victim', data });
        // Keyed by the SAME table names the purge deletes.
        expect(Object.keys(res.json().data).filter((k) => k !== '_meta').sort()).toEqual([
            'coach_profiles',
            'conversations',
            'messages',
        ]);
        expect(exportUser).toHaveBeenCalledTimes(1);
        expect(exportUser).toHaveBeenCalledWith('victim');
    });

    it('returns 200 with empty tables for a user that has no rows (idempotent over REST)', async () => {
        const exportUser = jest.fn(() =>
            Promise.resolve({ coach_profiles: [], conversations: [], messages: [], _meta: { messagesTruncated: false, messageLimit: 50000 } }),
        );
        app = await buildApp({ exportUser });

        const res = await app.inject({
            method: 'GET',
            url: '/v1/chat/internal/user/ghost/export',
            headers: { 'x-internal-token': INTERNAL_TOKEN },
        });

        expect(res.statusCode).toBe(200);
        expect(res.json().data.messages).toEqual([]);
    });
});
