/**
 * GDPR purge regression suite — DELETE /v1/shifts/internal/user/:userId (F35a).
 *
 * Two guarantees are locked in here:
 *   1. GUARD — the route is server-to-server-only. Without the X-Internal-Token
 *      header (or with the wrong one) it MUST answer 404 (the stock not-found
 *      body), never revealing the route exists, and ShiftService.purgeUser is
 *      NEVER invoked. An empty/unset INTERNAL_SERVICE_TOKEN fails CLOSED.
 *   2. PURGE — with the correct X-Internal-Token, the handler permanently deletes
 *      EVERY row owned by :userId across all three user-owned tables (shifts,
 *      rotation_patterns, scheduled_sessions) and returns a per-table
 *      deletedCounts summary. Idempotence is proved by purging a user with no
 *      rows (all-zero counts, still 200) and by re-purging.
 *
 * Layers, mirroring the meal-service / exercise-service GDPR suites:
 *   • SERVICE — the real ShiftService.purgeUser runs against a tiny in-memory
 *     Prisma fake (no DB in CI). It proves the actual delete semantics: rows are
 *     deleted by user_id across the three tables, OTHER users' rows survive, and
 *     a P2021 on the un-run scheduled_sessions table degrades to a 0 count
 *     instead of failing the whole purge.
 *   • REST — the genuine makeInternalAuthGuard preHandler (the SAME guard
 *     src/index.ts mounts) wraps a tiny app reproducing the route handler with a
 *     mock service, proving the guard and the 200 summary wiring.
 *
 * Why not import src/index.ts directly: it opens real DB/Redis connections at
 * import time and cannot be loaded in a unit test. So the REST layer rebuilds the
 * exact route shape from src/index.ts.
 */
import { describe, it, expect, afterEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { makeInternalAuthGuard } from '@nightfuel/config';
import { ShiftService } from '../src/shift.service';

const INTERNAL_TOKEN = 'internal-shared-secret-token-xyz';

// ── In-memory Prisma fake (purge slice) ─────────────────────────────────────────
// Implements just what ShiftService.purgeUser touches: a $transaction that runs
// an array of deleteMany promises, and deleteMany on shift / rotationPattern /
// scheduledSession with the exact `where: { userId }` shape. `scheduledMissing`
// makes scheduledSession.deleteMany throw a Prisma P2021 to simulate the un-run
// scheduled_sessions migration.
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

    const deleteFrom = (rows: any[], pred: (r: any) => boolean) => {
        const before = rows.length;
        const kept = rows.filter((r) => !pred(r));
        rows.length = 0;
        rows.push(...kept);
        return { count: before - kept.length };
    };

    // purgeUser builds `where: { userId }`; a row matches only when its userId
    // strictly equals the target, exactly like Postgres `WHERE user_id = $1`.
    const byUserId = (where: any) => (r: any) => r.userId === where.userId;

    const prisma: any = {
        shift: { deleteMany: ({ where }: any) => Promise.resolve(deleteFrom(state.shifts, byUserId(where))) },
        rotationPattern: { deleteMany: ({ where }: any) => Promise.resolve(deleteFrom(state.rotationPatterns, byUserId(where))) },
        scheduledSession: {
            deleteMany: ({ where }: any) => {
                if (seed?.scheduledMissing) {
                    // Shape of the Prisma error raised when the table is absent
                    // (the user-gated 20260617000000_scheduled_sessions migration
                    // has not been run yet).
                    const err: any = new Error(
                        'The table `public.scheduled_sessions` does not exist in the current database.'
                    );
                    err.code = 'P2021';
                    return Promise.reject(err);
                }
                return Promise.resolve(deleteFrom(state.scheduledSessions, byUserId(where)));
            },
        },
        // purgeUser passes an array of deleteMany promises (already started).
        // Resolve them in order and return the results array, exactly like
        // Prisma's sequential-array $transaction.
        $transaction: (ops: Promise<any>[]) => Promise.all(ops),
    };

    return { prisma, state };
}

// A no-op EventBus — purgeUser never publishes, so the methods are never called.
const noopEventBus: any = { publish: jest.fn(), subscribe: jest.fn() };

/**
 * Build a Fastify app reproducing the EXACT route wiring from src/index.ts:
 * the real makeInternalAuthGuard preHandler + the inline DELETE handler. The
 * service is injected so the REST layer can use a mock (the service layer is
 * exercised separately above).
 */
async function buildApp(shiftSvc: any, internalServiceToken = INTERNAL_TOKEN): Promise<FastifyInstance> {
    const app = Fastify({ logger: false });
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);

    const internalAuth = makeInternalAuthGuard(internalServiceToken);

    app.withTypeProvider<ZodTypeProvider>().delete('/v1/shifts/internal/user/:userId', {
        preHandler: internalAuth,
        schema: { params: z.object({ userId: z.string().uuid() }) },
    }, async (request, reply) => {
        const { userId } = request.params as { userId: string };
        try {
            const deletedCounts = await shiftSvc.purgeUser(userId);
            return reply.code(200).send({ userId, deletedCounts });
        } catch (err: any) {
            request.log.error({ err, userId }, 'GDPR purge failed');
            return reply.code(500).send({ error: 'Internal server error' });
        }
    });

    await app.ready();
    return app;
}

const VICTIM = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';
const GHOST = '33333333-3333-3333-3333-333333333333';

describe('ShiftService.purgeUser (service layer, real logic vs fake Prisma)', () => {
    it('deletes ONLY the target user rows across all three tables, leaving other users intact', async () => {
        const { prisma, state } = makeFakePrisma({
            shifts: [{ id: 's1', userId: VICTIM }, { id: 's2', userId: VICTIM }, { id: 's3', userId: OTHER }],
            rotationPatterns: [{ id: 'r1', userId: VICTIM }, { id: 'r2', userId: OTHER }],
            scheduledSessions: [{ id: 'ss1', userId: VICTIM }, { id: 'ss2', userId: VICTIM }, { id: 'ss3', userId: OTHER }],
        });
        const svc = new ShiftService(prisma as any, noopEventBus);

        const counts = await svc.purgeUser(VICTIM);

        expect(counts).toEqual({ shifts: 2, rotation_patterns: 1, scheduled_sessions: 2 });
        // Other users' rows survive.
        expect(state.shifts.map((r) => r.id)).toEqual(['s3']);
        expect(state.rotationPatterns.map((r) => r.id)).toEqual(['r2']);
        expect(state.scheduledSessions.map((r) => r.id)).toEqual(['ss3']);
    });

    it('is idempotent: purging a user with no rows returns all-zero counts (no throw), and re-purge is safe', async () => {
        const { prisma } = makeFakePrisma({ shifts: [{ id: 's3', userId: OTHER }] });
        const svc = new ShiftService(prisma as any, noopEventBus);

        const first = await svc.purgeUser(GHOST);
        const second = await svc.purgeUser(GHOST); // re-purge is safe

        const zero = { shifts: 0, rotation_patterns: 0, scheduled_sessions: 0 };
        expect(first).toEqual(zero);
        expect(second).toEqual(zero);
    });

    it('tolerates the un-run scheduled_sessions table (Prisma P2021): purge still succeeds with a 0 scheduled count', async () => {
        const { prisma, state } = makeFakePrisma({
            shifts: [{ id: 's1', userId: VICTIM }],
            rotationPatterns: [{ id: 'r1', userId: VICTIM }],
            scheduledMissing: true, // scheduledSession.deleteMany rejects with P2021
        });
        const svc = new ShiftService(prisma as any, noopEventBus);

        const counts = await svc.purgeUser(VICTIM);

        // shifts + rotation_patterns are still purged; scheduled_sessions degrades to 0.
        expect(counts).toEqual({ shifts: 1, rotation_patterns: 1, scheduled_sessions: 0 });
        expect(state.shifts).toEqual([]);
        expect(state.rotationPatterns).toEqual([]);
    });
});

describe('DELETE /v1/shifts/internal/user/:userId (route + internal-token guard)', () => {
    let app: FastifyInstance;

    afterEach(async () => {
        if (app) await app.close();
    });

    it('404s without the X-Internal-Token header and NEVER calls purgeUser', async () => {
        const purgeUser = jest.fn(() => Promise.resolve({ shifts: 0, rotation_patterns: 0, scheduled_sessions: 0 }));
        app = await buildApp({ purgeUser });

        const res = await app.inject({ method: 'DELETE', url: `/v1/shifts/internal/user/${VICTIM}` });

        expect(res.statusCode).toBe(404);
        expect(res.json()).toEqual({ statusCode: 404, error: 'Not Found', message: 'Route not found' });
        expect(purgeUser).not.toHaveBeenCalled();
    });

    it('404s with a WRONG X-Internal-Token and NEVER calls purgeUser', async () => {
        const purgeUser = jest.fn(() => Promise.resolve({ shifts: 0, rotation_patterns: 0, scheduled_sessions: 0 }));
        app = await buildApp({ purgeUser });

        const res = await app.inject({
            method: 'DELETE',
            url: `/v1/shifts/internal/user/${VICTIM}`,
            headers: { 'x-internal-token': 'wrong-token' },
        });

        expect(res.statusCode).toBe(404);
        expect(purgeUser).not.toHaveBeenCalled();
    });

    it('purges the user and returns a deletedCounts summary WITH the correct token', async () => {
        const purgeUser = jest.fn(() => Promise.resolve({ shifts: 4, rotation_patterns: 1, scheduled_sessions: 3 }));
        app = await buildApp({ purgeUser });

        const res = await app.inject({
            method: 'DELETE',
            url: `/v1/shifts/internal/user/${VICTIM}`,
            headers: { 'x-internal-token': INTERNAL_TOKEN },
        });

        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({
            userId: VICTIM,
            deletedCounts: { shifts: 4, rotation_patterns: 1, scheduled_sessions: 3 },
        });
        expect(purgeUser).toHaveBeenCalledTimes(1);
        expect(purgeUser).toHaveBeenCalledWith(VICTIM);
    });

    it('returns 200 with zero counts for a user that has no rows (idempotent over REST)', async () => {
        const purgeUser = jest.fn(() => Promise.resolve({ shifts: 0, rotation_patterns: 0, scheduled_sessions: 0 }));
        app = await buildApp({ purgeUser });

        const res = await app.inject({
            method: 'DELETE',
            url: `/v1/shifts/internal/user/${GHOST}`,
            headers: { 'x-internal-token': INTERNAL_TOKEN },
        });

        expect(res.statusCode).toBe(200);
        expect(res.json().deletedCounts).toEqual({ shifts: 0, rotation_patterns: 0, scheduled_sessions: 0 });
    });

    it('an empty/unset INTERNAL_SERVICE_TOKEN fails CLOSED: every request 404s', async () => {
        const purgeUser = jest.fn(() => Promise.resolve({ shifts: 0, rotation_patterns: 0, scheduled_sessions: 0 }));
        app = await buildApp({ purgeUser }, ''); // guard built with empty expected token

        const res = await app.inject({
            method: 'DELETE',
            url: `/v1/shifts/internal/user/${VICTIM}`,
            headers: { 'x-internal-token': '' },
        });

        expect(res.statusCode).toBe(404);
        expect(purgeUser).not.toHaveBeenCalled();
    });
});
