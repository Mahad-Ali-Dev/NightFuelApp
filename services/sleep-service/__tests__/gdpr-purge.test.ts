/**
 * GDPR purge regression suite — DELETE /v1/sleep/internal/user/:userId.
 *
 * Two guarantees are locked in here:
 *   1. GUARD — the route is server-to-server-only. Without the X-Internal-Token
 *      header (or with the wrong one) it MUST answer 404 (the stock not-found
 *      body), never revealing the route exists, and SleepService.purgeUser is
 *      NEVER invoked.
 *   2. PURGE — with the correct X-Internal-Token, the handler permanently deletes
 *      EVERY row owned by :userId across all three user-owned tables
 *      (sleep_sessions, sleep_preferences, health_samples) and returns a
 *      per-table deletedCounts summary. Idempotence is proved by purging a user
 *      with no rows (all-zero counts, still 200) and by re-purging.
 *
 * Layers, mirroring the meal-service GDPR suite:
 *   • SERVICE — the real SleepService.purgeUser runs against a tiny in-memory
 *     Prisma fake (no DB in CI). It proves the actual delete semantics: rows are
 *     deleted by user_id across the three tables and OTHER users' rows survive.
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
import { SleepService } from '../src/sleep.service';

const INTERNAL_TOKEN = 'internal-shared-secret-token-xyz';

// ── In-memory Prisma fake (purge slice) ─────────────────────────────────────────
// Implements just what SleepService.purgeUser touches: a $transaction that runs
// an array of deleteMany promises, and deleteMany on sleepSession /
// sleepPreference / healthSample with the exact `where: { userId }` shape.
function makeFakePrisma(seed?: {
    sleepSessions?: any[];
    sleepPreferences?: any[];
    healthSamples?: any[];
}) {
    const state = {
        sleepSessions: seed?.sleepSessions ? [...seed.sleepSessions] : [],
        sleepPreferences: seed?.sleepPreferences ? [...seed.sleepPreferences] : [],
        healthSamples: seed?.healthSamples ? [...seed.healthSamples] : [],
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
        sleepSession: { deleteMany: ({ where }: any) => Promise.resolve(deleteFrom(state.sleepSessions, byUserId(where))) },
        sleepPreference: { deleteMany: ({ where }: any) => Promise.resolve(deleteFrom(state.sleepPreferences, byUserId(where))) },
        healthSample: { deleteMany: ({ where }: any) => Promise.resolve(deleteFrom(state.healthSamples, byUserId(where))) },
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
async function buildApp(sleepSvc: any, internalServiceToken = INTERNAL_TOKEN): Promise<FastifyInstance> {
    const app = Fastify({ logger: false });
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);

    const internalAuth = makeInternalAuthGuard(internalServiceToken);

    app.withTypeProvider<ZodTypeProvider>().delete('/v1/sleep/internal/user/:userId', {
        preHandler: internalAuth,
        schema: { params: z.object({ userId: z.string().uuid() }) },
    }, async (request, reply) => {
        const { userId } = request.params as { userId: string };
        try {
            const deletedCounts = await sleepSvc.purgeUser(userId);
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

describe('SleepService.purgeUser (service layer, real logic vs fake Prisma)', () => {
    it('deletes ONLY the target user rows across all three tables, leaving other users intact', async () => {
        const { prisma, state } = makeFakePrisma({
            sleepSessions: [{ id: 's1', userId: VICTIM }, { id: 's2', userId: VICTIM }, { id: 's3', userId: OTHER }],
            sleepPreferences: [{ id: 'p1', userId: VICTIM }, { id: 'p2', userId: OTHER }],
            healthSamples: [{ id: 'h1', userId: VICTIM }, { id: 'h2', userId: VICTIM }, { id: 'h3', userId: VICTIM }, { id: 'h4', userId: OTHER }],
        });
        const svc = new SleepService(prisma as any, noopEventBus);

        const counts = await svc.purgeUser(VICTIM);

        expect(counts).toEqual({ sleep_sessions: 2, sleep_preferences: 1, health_samples: 3 });
        // Other users' rows survive.
        expect(state.sleepSessions.map((r) => r.id)).toEqual(['s3']);
        expect(state.sleepPreferences.map((r) => r.id)).toEqual(['p2']);
        expect(state.healthSamples.map((r) => r.id)).toEqual(['h4']);
    });

    it('is idempotent: purging a user with no rows returns all-zero counts (no throw), and re-purge is safe', async () => {
        const { prisma } = makeFakePrisma({ sleepSessions: [{ id: 's3', userId: OTHER }] });
        const svc = new SleepService(prisma as any, noopEventBus);

        const first = await svc.purgeUser(GHOST);
        const second = await svc.purgeUser(GHOST); // re-purge is safe

        const zero = { sleep_sessions: 0, sleep_preferences: 0, health_samples: 0 };
        expect(first).toEqual(zero);
        expect(second).toEqual(zero);
    });
});

describe('DELETE /v1/sleep/internal/user/:userId (route + internal-token guard)', () => {
    let app: FastifyInstance;

    afterEach(async () => {
        if (app) await app.close();
    });

    it('404s without the X-Internal-Token header and NEVER calls purgeUser', async () => {
        const purgeUser = jest.fn(() => Promise.resolve({ sleep_sessions: 0, sleep_preferences: 0, health_samples: 0 }));
        app = await buildApp({ purgeUser });

        const res = await app.inject({ method: 'DELETE', url: `/v1/sleep/internal/user/${VICTIM}` });

        expect(res.statusCode).toBe(404);
        expect(res.json()).toEqual({ statusCode: 404, error: 'Not Found', message: 'Route not found' });
        expect(purgeUser).not.toHaveBeenCalled();
    });

    it('404s with a WRONG X-Internal-Token and NEVER calls purgeUser', async () => {
        const purgeUser = jest.fn(() => Promise.resolve({ sleep_sessions: 0, sleep_preferences: 0, health_samples: 0 }));
        app = await buildApp({ purgeUser });

        const res = await app.inject({
            method: 'DELETE',
            url: `/v1/sleep/internal/user/${VICTIM}`,
            headers: { 'x-internal-token': 'wrong-token' },
        });

        expect(res.statusCode).toBe(404);
        expect(purgeUser).not.toHaveBeenCalled();
    });

    it('purges the user and returns a deletedCounts summary WITH the correct token', async () => {
        const purgeUser = jest.fn(() => Promise.resolve({ sleep_sessions: 7, sleep_preferences: 1, health_samples: 42 }));
        app = await buildApp({ purgeUser });

        const res = await app.inject({
            method: 'DELETE',
            url: `/v1/sleep/internal/user/${VICTIM}`,
            headers: { 'x-internal-token': INTERNAL_TOKEN },
        });

        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({
            userId: VICTIM,
            deletedCounts: { sleep_sessions: 7, sleep_preferences: 1, health_samples: 42 },
        });
        expect(purgeUser).toHaveBeenCalledTimes(1);
        expect(purgeUser).toHaveBeenCalledWith(VICTIM);
    });

    it('returns 200 with zero counts for a user that has no rows (idempotent over REST)', async () => {
        const purgeUser = jest.fn(() => Promise.resolve({ sleep_sessions: 0, sleep_preferences: 0, health_samples: 0 }));
        app = await buildApp({ purgeUser });

        const res = await app.inject({
            method: 'DELETE',
            url: `/v1/sleep/internal/user/${GHOST}`,
            headers: { 'x-internal-token': INTERNAL_TOKEN },
        });

        expect(res.statusCode).toBe(200);
        expect(res.json().deletedCounts).toEqual({ sleep_sessions: 0, sleep_preferences: 0, health_samples: 0 });
    });

    it('an empty/unset INTERNAL_SERVICE_TOKEN fails CLOSED: every request 404s', async () => {
        const purgeUser = jest.fn(() => Promise.resolve({ sleep_sessions: 0, sleep_preferences: 0, health_samples: 0 }));
        app = await buildApp({ purgeUser }, ''); // guard built with empty expected token

        const res = await app.inject({
            method: 'DELETE',
            url: `/v1/sleep/internal/user/${VICTIM}`,
            headers: { 'x-internal-token': '' },
        });

        expect(res.statusCode).toBe(404);
        expect(purgeUser).not.toHaveBeenCalled();
    });
});
