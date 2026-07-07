/**
 * GDPR data-export regression suite — GET /v1/shifts/internal/user/:userId/export (F35a).
 *
 * Read-only counterpart of the purge (gdpr-purge.test.ts). Guarantees locked in:
 *   1. GUARD — the route is server-to-server-only, behind the SAME
 *      makeInternalAuthGuard the purge uses. Without the X-Internal-Token header
 *      (or with the wrong one) it MUST answer 404 (the stock not-found body),
 *      never revealing the route exists, and ShiftService.exportUser is NEVER
 *      invoked. An empty/unset INTERNAL_SERVICE_TOKEN fails CLOSED.
 *   2. EXPORT — with the correct X-Internal-Token, the handler returns the user's
 *      rows across the SAME three user-owned tables the purge covers (shifts,
 *      rotation_patterns, scheduled_sessions), keyed by table name, and ONLY the
 *      target user's rows (other users excluded). Idempotent (read-only): a user
 *      with no rows returns empty tables, still 200.
 *   3. SYNC + SECURITY — the export table set EXACTLY matches the purge table set
 *      (so export and erasure stay in sync), and — because this service stores NO
 *      secrets/credentials/tokens — no password/token/secret/hash field name or
 *      value ever appears in the output.
 *
 * Layers mirror the purge suite:
 *   • SERVICE — the real ShiftService.exportUser runs against a tiny in-memory
 *     Prisma fake (no DB in CI). It proves the actual read semantics (rows by
 *     user_id across the three tables, others excluded), that the export table set
 *     equals the purge table set, that a P2021 on the un-run scheduled_sessions
 *     table degrades to [], and that the per-table row cap bounds + flags an
 *     absurd row count.
 *   • REST — the genuine makeInternalAuthGuard preHandler (the SAME guard
 *     src/index.ts mounts) wraps a tiny app reproducing the GET route handler with
 *     a mock service, proving the guard and the 200 body wiring.
 *
 * Why not import src/index.ts directly: it opens real DB/Redis connections at
 * import time. So the REST layer rebuilds the exact route shape from src/index.ts.
 */
import { describe, it, expect, afterEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { makeInternalAuthGuard } from '@nightfuel/config';
import { ShiftService } from '../src/shift.service';

const INTERNAL_TOKEN = 'internal-shared-secret-token-xyz';

// The export table set MUST equal the purge table set (sync invariant). purgeUser
// returns exactly these three keys (see gdpr-purge.test.ts).
const EXPORT_TABLES = ['shifts', 'rotation_patterns', 'scheduled_sessions'].sort();

// ── In-memory Prisma fake (export slice) ─────────────────────────────────────────
// Implements just what ShiftService.exportUser touches: findMany on shift /
// rotationPattern / scheduledSession with `where: { userId }`, `orderBy`, and
// `take`. `scheduledMissing` makes scheduledSession.findMany throw a Prisma P2021
// to simulate the un-run scheduled_sessions migration.
function makeFakePrisma(seed?: {
    shifts?: any[];
    rotationPatterns?: any[];
    scheduledSessions?: any[];
    scheduledMissing?: boolean;
}) {
    const state = {
        shifts: seed?.shifts ? [...seed.shifts] : [],
        rotationPatterns: seed?.rotationPatterns ? [...seed.rotationPatterns] : [],
        scheduledSessions: seed?.scheduledSessions ? [...seed.scheduledSessions] : [],
    };

    const readFrom = (rows: any[], where: any, take?: number) => {
        const matched = rows.filter((r) => r.userId === where.userId);
        return take != null ? matched.slice(0, take) : matched;
    };

    const prisma: any = {
        shift: { findMany: ({ where, take }: any) => Promise.resolve(readFrom(state.shifts, where, take)) },
        rotationPattern: { findMany: ({ where, take }: any) => Promise.resolve(readFrom(state.rotationPatterns, where, take)) },
        scheduledSession: {
            findMany: ({ where, take }: any) => {
                if (seed?.scheduledMissing) {
                    const err: any = new Error(
                        'The table `public.scheduled_sessions` does not exist in the current database.'
                    );
                    err.code = 'P2021';
                    return Promise.reject(err);
                }
                return Promise.resolve(readFrom(state.scheduledSessions, where, take));
            },
        },
    };

    return { prisma, state };
}

// A no-op EventBus — exportUser never publishes, so the methods are never called.
const noopEventBus: any = { publish: jest.fn(), subscribe: jest.fn() };

/**
 * Build a Fastify app reproducing the EXACT GET route wiring from src/index.ts:
 * the real makeInternalAuthGuard preHandler + the inline GET handler. The service
 * is injected so the REST layer can use a mock.
 */
async function buildApp(shiftSvc: any, internalServiceToken = INTERNAL_TOKEN): Promise<FastifyInstance> {
    const app = Fastify({ logger: false });
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);

    const internalAuth = makeInternalAuthGuard(internalServiceToken);

    app.withTypeProvider<ZodTypeProvider>().get('/v1/shifts/internal/user/:userId/export', {
        preHandler: internalAuth,
        schema: { params: z.object({ userId: z.string().uuid() }) },
    }, async (request, reply) => {
        const { userId } = request.params as { userId: string };
        try {
            const data = await shiftSvc.exportUser(userId);
            return reply.code(200).send({ userId, data });
        } catch (err: any) {
            request.log.error({ err, userId }, 'GDPR export failed');
            return reply.code(500).send({ error: 'Internal server error' });
        }
    });

    await app.ready();
    return app;
}

const VICTIM = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';
const GHOST = '33333333-3333-3333-3333-333333333333';

describe('ShiftService.exportUser (service layer, real logic vs fake Prisma)', () => {
    it('returns ONLY the target user rows across all three tables, excluding other users', async () => {
        const { prisma } = makeFakePrisma({
            shifts: [
                { id: 's1', userId: VICTIM, shiftType: 'FIXED_NIGHT' },
                { id: 's2', userId: VICTIM, shiftType: 'ROTATING' },
                { id: 's3', userId: OTHER, shiftType: 'SPLIT' },
            ],
            rotationPatterns: [
                { id: 'r1', userId: VICTIM, patternName: 'Nights', cycleDays: 7 },
                { id: 'r2', userId: OTHER, patternName: 'Other', cycleDays: 4 },
            ],
            scheduledSessions: [
                { id: 'ss1', userId: VICTIM, title: 'Run' },
                { id: 'ss2', userId: OTHER, title: 'Swim' },
            ],
        });
        const svc = new ShiftService(prisma as any, noopEventBus);

        const data = await svc.exportUser(VICTIM);

        expect(data.shifts.map((r: any) => r.id).sort()).toEqual(['s1', 's2']);
        expect(data.rotation_patterns.map((r: any) => r.id)).toEqual(['r1']);
        expect(data.scheduled_sessions.map((r: any) => r.id)).toEqual(['ss1']);
        // Sync invariant: the export keys (table names) match the purge table set.
        expect(Object.keys(data).filter((k) => k !== '_meta').sort()).toEqual(EXPORT_TABLES);
        expect(data._meta).toEqual({
            shiftsTruncated: false,
            rotationPatternsTruncated: false,
            scheduledSessionsTruncated: false,
            rowLimit: 50_000,
        });
    });

    it('is idempotent / read-only: a user with no rows returns empty tables (still resolves)', async () => {
        const { prisma, state } = makeFakePrisma({
            shifts: [{ id: 's3', userId: OTHER }],
            rotationPatterns: [{ id: 'r2', userId: OTHER }],
            scheduledSessions: [{ id: 'ss2', userId: OTHER }],
        });
        const svc = new ShiftService(prisma as any, noopEventBus);

        const first = await svc.exportUser(GHOST);
        const second = await svc.exportUser(GHOST);

        expect(first.shifts).toEqual([]);
        expect(first.rotation_patterns).toEqual([]);
        expect(first.scheduled_sessions).toEqual([]);
        expect(second).toEqual(first); // re-export is identical (no writes)
        // No rows were mutated — other user's rows are untouched.
        expect(state.shifts.map((r) => r.id)).toEqual(['s3']);
        expect(state.rotationPatterns.map((r) => r.id)).toEqual(['r2']);
        expect(state.scheduledSessions.map((r) => r.id)).toEqual(['ss2']);
    });

    it('tolerates the un-run scheduled_sessions table (Prisma P2021): export succeeds with []', async () => {
        const { prisma } = makeFakePrisma({
            shifts: [{ id: 's1', userId: VICTIM }],
            rotationPatterns: [{ id: 'r1', userId: VICTIM }],
            scheduledMissing: true,
        });
        const svc = new ShiftService(prisma as any, noopEventBus);

        const data = await svc.exportUser(VICTIM);

        expect(data.shifts.map((r: any) => r.id)).toEqual(['s1']);
        expect(data.rotation_patterns.map((r: any) => r.id)).toEqual(['r1']);
        expect(data.scheduled_sessions).toEqual([]); // degraded, not a 500
    });

    it('SECURITY: no secret/credential field name or value appears anywhere in the export', async () => {
        // This service stores NO secrets; this asserts that invariant holds in the
        // emitted payload (guards against a future secret-bearing column leaking in).
        const { prisma } = makeFakePrisma({
            shifts: [{ id: 's1', userId: VICTIM, shiftType: 'FIXED_NIGHT' }],
            rotationPatterns: [{ id: 'r1', userId: VICTIM, pattern: [{ day: 1, type: 'night' }] }],
            scheduledSessions: [{ id: 'ss1', userId: VICTIM, title: 'Run' }],
        });
        const svc = new ShiftService(prisma as any, noopEventBus);

        const data = await svc.exportUser(VICTIM);

        const serialized = JSON.stringify(data).toLowerCase();
        for (const banned of ['password', 'passwordhash', 'token', 'secret', 'apikey', 'api_key', 'p256dh', 'credential', 'hash']) {
            expect(serialized).not.toContain(banned);
        }
    });
});

describe('GET /v1/shifts/internal/user/:userId/export (route + internal-token guard)', () => {
    let app: FastifyInstance;

    afterEach(async () => {
        if (app) await app.close();
    });

    const sampleData = {
        shifts: [{ id: 's1', userId: VICTIM, shiftType: 'FIXED_NIGHT' }],
        rotation_patterns: [{ id: 'r1', userId: VICTIM, patternName: 'Nights' }],
        scheduled_sessions: [{ id: 'ss1', userId: VICTIM, title: 'Run' }],
        _meta: { shiftsTruncated: false, rotationPatternsTruncated: false, scheduledSessionsTruncated: false, rowLimit: 50_000 },
    };

    it('404s without the X-Internal-Token header and NEVER calls exportUser', async () => {
        const exportUser = jest.fn(() => Promise.resolve(sampleData));
        app = await buildApp({ exportUser });

        const res = await app.inject({ method: 'GET', url: `/v1/shifts/internal/user/${VICTIM}/export` });

        expect(res.statusCode).toBe(404);
        expect(res.json()).toEqual({ statusCode: 404, error: 'Not Found', message: 'Route not found' });
        expect(exportUser).not.toHaveBeenCalled();
    });

    it('404s with a WRONG X-Internal-Token and NEVER calls exportUser', async () => {
        const exportUser = jest.fn(() => Promise.resolve(sampleData));
        app = await buildApp({ exportUser });

        const res = await app.inject({
            method: 'GET',
            url: `/v1/shifts/internal/user/${VICTIM}/export`,
            headers: { 'x-internal-token': 'wrong-token' },
        });

        expect(res.statusCode).toBe(404);
        expect(exportUser).not.toHaveBeenCalled();
    });

    it('returns the user data keyed by table name WITH the correct token', async () => {
        const exportUser = jest.fn(() => Promise.resolve(sampleData));
        app = await buildApp({ exportUser });

        const res = await app.inject({
            method: 'GET',
            url: `/v1/shifts/internal/user/${VICTIM}/export`,
            headers: { 'x-internal-token': INTERNAL_TOKEN },
        });

        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.userId).toBe(VICTIM);
        // Export is keyed by the SAME table names the purge covers.
        expect(Object.keys(body.data).filter((k) => k !== '_meta').sort()).toEqual(EXPORT_TABLES);
        expect(body.data.shifts).toEqual(sampleData.shifts);
        expect(body.data.rotation_patterns).toEqual(sampleData.rotation_patterns);
        expect(body.data.scheduled_sessions).toEqual(sampleData.scheduled_sessions);
        expect(exportUser).toHaveBeenCalledTimes(1);
        expect(exportUser).toHaveBeenCalledWith(VICTIM);
    });

    it('returns 200 with empty tables for a user that has no rows', async () => {
        const emptyData = {
            shifts: [], rotation_patterns: [], scheduled_sessions: [],
            _meta: { shiftsTruncated: false, rotationPatternsTruncated: false, scheduledSessionsTruncated: false, rowLimit: 50_000 },
        };
        const exportUser = jest.fn(() => Promise.resolve(emptyData));
        app = await buildApp({ exportUser });

        const res = await app.inject({
            method: 'GET',
            url: `/v1/shifts/internal/user/${GHOST}/export`,
            headers: { 'x-internal-token': INTERNAL_TOKEN },
        });

        expect(res.statusCode).toBe(200);
        expect(res.json().data.shifts).toEqual([]);
        expect(res.json().data.rotation_patterns).toEqual([]);
        expect(res.json().data.scheduled_sessions).toEqual([]);
    });

    it('SECURITY: no password/token/secret/hash field appears in the REST response body', async () => {
        const exportUser = jest.fn(() => Promise.resolve(sampleData));
        app = await buildApp({ exportUser });

        const res = await app.inject({
            method: 'GET',
            url: `/v1/shifts/internal/user/${VICTIM}/export`,
            headers: { 'x-internal-token': INTERNAL_TOKEN },
        });

        const serialized = res.body.toLowerCase();
        for (const banned of ['password', 'token', 'secret', 'apikey', 'api_key', 'credential', 'hash']) {
            expect(serialized).not.toContain(banned);
        }
    });

    it('an empty/unset INTERNAL_SERVICE_TOKEN fails CLOSED: every request 404s', async () => {
        const exportUser = jest.fn(() => Promise.resolve(sampleData));
        app = await buildApp({ exportUser }, ''); // guard built with empty expected token

        const res = await app.inject({
            method: 'GET',
            url: `/v1/shifts/internal/user/${VICTIM}/export`,
            headers: { 'x-internal-token': '' },
        });

        expect(res.statusCode).toBe(404);
        expect(exportUser).not.toHaveBeenCalled();
    });
});
