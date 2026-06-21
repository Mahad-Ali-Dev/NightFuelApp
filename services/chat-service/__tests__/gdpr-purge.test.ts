/**
 * GDPR purge regression suite — DELETE /v1/chat/internal/user/:userId.
 *
 * Two guarantees are locked in here:
 *   1. GUARD — the route is server-to-server-only. Without the X-Internal-Token
 *      header (or with the wrong one) it MUST answer 404 (the stock not-found
 *      body), never revealing the route exists, and the ChatService.purgeUser
 *      method is NEVER invoked.
 *   2. PURGE — with the correct X-Internal-Token, the handler permanently deletes
 *      EVERY row owned by :userId across all three user-owned tables
 *      (coach_profiles, conversations, messages) and returns a per-table
 *      deletedCounts summary. Idempotence is proved by purging a user with no
 *      rows (all-zero counts, still 200) and by re-purging.
 *
 * Layers, mirroring the rest of this service's suites:
 *   • SERVICE — the real ChatService.purgeUser runs against a tiny in-memory
 *     Prisma fake (no DB in CI). It proves the actual delete semantics: messages
 *     by sender_id, conversations where the user is EITHER participant, the
 *     user's coach profile — and that OTHER users' rows survive.
 *   • REST — the genuine `routes` plugin (mock ChatService) proves the guard and
 *     the 200 summary wiring.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import fastifyWebsocket from '@fastify/websocket';
import routes from '../src/routes';
import { ChatService } from '../src/chat.service';

const JWT_SECRET = 'test-secret-of-at-least-32-chars-long';
const INTERNAL_TOKEN = 'internal-shared-secret-token-xyz';

// ── In-memory Prisma fake (purge slice) ─────────────────────────────────────────
// Implements just what ChatService.purgeUser touches: a $transaction that runs an
// array of deleteMany promises, and deleteMany on message / conversation /
// coachProfile with the exact `where` shapes purgeUser builds.
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

    const deleteFrom = (rows: any[], pred: (r: any) => boolean) => {
        const before = rows.length;
        const kept = rows.filter((r) => !pred(r));
        rows.length = 0;
        rows.push(...kept);
        return { count: before - kept.length };
    };

    const prisma: any = {
        message: {
            deleteMany: ({ where }: any) =>
                Promise.resolve(deleteFrom(state.messages, (r) => r.senderId === where.senderId)),
        },
        conversation: {
            deleteMany: ({ where }: any) =>
                Promise.resolve(
                    deleteFrom(state.conversations, (r) =>
                        where.OR.some(
                            (c: any) =>
                                (c.participantA && r.participantA === c.participantA) ||
                                (c.participantB && r.participantB === c.participantB),
                        ),
                    ),
                ),
        },
        coachProfile: {
            deleteMany: ({ where }: any) =>
                Promise.resolve(deleteFrom(state.coachProfiles, (r) => r.userId === where.userId)),
        },
        // ChatService.purgeUser passes an array of deleteMany promises. Resolve
        // them in order (the operations have already started) and return the
        // results array, exactly like Prisma's sequential-array $transaction.
        $transaction: (ops: Promise<any>[]) => Promise.all(ops),
    };

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

describe('ChatService.purgeUser (service layer, real logic vs fake Prisma)', () => {
    it('deletes ONLY the target user rows across all three tables, leaving others', async () => {
        const { prisma, state } = makeFakePrisma({
            coachProfiles: [{ userId: 'victim' }, { userId: 'other' }],
            conversations: [
                { id: 'c1', participantA: 'victim', participantB: 'other' }, // victim is A
                { id: 'c2', participantA: 'other', participantB: 'victim' }, // victim is B
                { id: 'c3', participantA: 'other', participantB: 'third' }, // unrelated
            ],
            messages: [
                { id: 'm1', senderId: 'victim' },
                { id: 'm2', senderId: 'victim' },
                { id: 'm3', senderId: 'other' },
            ],
        });
        const svc = new ChatService(prisma as any);

        const counts = await svc.purgeUser('victim');

        expect(counts).toEqual({ coach_profiles: 1, conversations: 2, messages: 2 });
        // Other users' rows survive.
        expect(state.coachProfiles).toEqual([{ userId: 'other' }]);
        expect(state.conversations.map((c) => c.id)).toEqual(['c3']);
        expect(state.messages.map((m) => m.id)).toEqual(['m3']);
    });

    it('is idempotent: purging a user with no rows returns all-zero counts (no throw)', async () => {
        const { prisma } = makeFakePrisma({
            coachProfiles: [{ userId: 'someone-else' }],
        });
        const svc = new ChatService(prisma as any);

        const first = await svc.purgeUser('ghost');
        const second = await svc.purgeUser('ghost'); // re-purge is safe

        expect(first).toEqual({ coach_profiles: 0, conversations: 0, messages: 0 });
        expect(second).toEqual({ coach_profiles: 0, conversations: 0, messages: 0 });
    });
});

describe('DELETE /v1/chat/internal/user/:userId (route + internal-token guard)', () => {
    let app: FastifyInstance;

    afterEach(async () => {
        if (app) await app.close();
    });

    it('404s without the X-Internal-Token header and NEVER calls purgeUser', async () => {
        const purgeUser = jest.fn(() => Promise.resolve({ coach_profiles: 0, conversations: 0, messages: 0 }));
        app = await buildApp({ purgeUser });

        const res = await app.inject({ method: 'DELETE', url: '/v1/chat/internal/user/victim' });

        expect(res.statusCode).toBe(404);
        expect(res.json()).toEqual({ statusCode: 404, error: 'Not Found', message: 'Route not found' });
        expect(purgeUser).not.toHaveBeenCalled();
    });

    it('404s with a WRONG X-Internal-Token and NEVER calls purgeUser', async () => {
        const purgeUser = jest.fn(() => Promise.resolve({ coach_profiles: 0, conversations: 0, messages: 0 }));
        app = await buildApp({ purgeUser });

        const res = await app.inject({
            method: 'DELETE',
            url: '/v1/chat/internal/user/victim',
            headers: { 'x-internal-token': 'wrong-token' },
        });

        expect(res.statusCode).toBe(404);
        expect(purgeUser).not.toHaveBeenCalled();
    });

    it('purges the user and returns a deletedCounts summary WITH the correct token', async () => {
        const purgeUser = jest.fn(() =>
            Promise.resolve({ coach_profiles: 1, conversations: 2, messages: 5 }),
        );
        app = await buildApp({ purgeUser });

        const res = await app.inject({
            method: 'DELETE',
            url: '/v1/chat/internal/user/victim',
            headers: { 'x-internal-token': INTERNAL_TOKEN },
        });

        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({
            userId: 'victim',
            deletedCounts: { coach_profiles: 1, conversations: 2, messages: 5 },
        });
        expect(purgeUser).toHaveBeenCalledTimes(1);
        expect(purgeUser).toHaveBeenCalledWith('victim');
    });

    it('returns 200 with zero counts for a user that has no rows (idempotent over REST)', async () => {
        const purgeUser = jest.fn(() =>
            Promise.resolve({ coach_profiles: 0, conversations: 0, messages: 0 }),
        );
        app = await buildApp({ purgeUser });

        const res = await app.inject({
            method: 'DELETE',
            url: '/v1/chat/internal/user/ghost',
            headers: { 'x-internal-token': INTERNAL_TOKEN },
        });

        expect(res.statusCode).toBe(200);
        expect(res.json().deletedCounts).toEqual({ coach_profiles: 0, conversations: 0, messages: 0 });
    });
});
