/**
 * GDPR purge regression suite — DELETE /v1/state/internal/user/:userId.
 *
 * Two guarantees are locked in here:
 *   1. GUARD — the route is server-to-server-only. Without the X-Internal-Token
 *      header (or with the wrong one) it MUST answer 404 (the stock not-found
 *      body), never revealing the route exists, and purgeUser is NEVER invoked.
 *   2. PURGE — with the correct X-Internal-Token, the handler permanently deletes
 *      EVERY row owned by :userId across this service's user-owned tables
 *      (user_states — the ONLY user-keyed table in state-service) and returns a
 *      per-table deletedCounts summary. Idempotence is proved by purging a user
 *      with no rows (zero counts, still 200) and by re-purging.
 *
 * Layers, mirroring the sleep-service GDPR suite:
 *   • SERVICE — the real purgeUser (src/purge.ts) runs against a tiny in-memory
 *     Prisma fake (no DB in CI). It proves the actual delete semantics: rows are
 *     deleted by user_id and OTHER users' rows survive.
 *   • REST — the genuine makeInternalAuthGuard preHandler (the SAME guard
 *     src/index.ts mounts) wraps a tiny app reproducing the route handler with a
 *     mock purge fn, proving the guard and the 200 summary wiring.
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
import { purgeUser } from '../src/purge';

const INTERNAL_TOKEN = 'internal-shared-secret-token-xyz';

const VICTIM = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';
const GHOST = '33333333-3333-3333-3333-333333333333';

// ── In-memory Prisma fake (purge slice) ─────────────────────────────────────────
// Implements just what purgeUser touches: a $transaction that runs an array of
// deleteMany promises, and deleteMany on userState with the exact
// `where: { userId }` shape.
function makeFakePrisma(seed?: { userStates?: any[] }) {
    const state = {
        userStates: seed?.userStates ? [...seed.userStates] : [],
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
        userState: { deleteMany: ({ where }: any) => Promise.resolve(deleteFrom(state.userStates, byUserId(where))) },
        // purgeUser passes an array of deleteMany promises (already started).
        // Resolve them in order and return the results array, exactly like
        // Prisma's sequential-array $transaction.
        $transaction: (ops: Promise<any>[]) => Promise.all(ops),
    };

    return { prisma, state };
}

/**
 * Build a Fastify app reproducing the EXACT route wiring from src/index.ts:
 * the real makeInternalAuthGuard preHandler + the inline DELETE handler. The
 * purge fn is injected so the REST layer can use a mock (the service layer is
 * exercised separately above).
 */
async function buildApp(purgeFn: any, internalServiceToken = INTERNAL_TOKEN): Promise<FastifyInstance> {
    const app = Fastify({ logger: false });
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);

    const internalAuth = makeInternalAuthGuard(internalServiceToken);

    app.withTypeProvider<ZodTypeProvider>().delete('/v1/state/internal/user/:userId', {
        preHandler: internalAuth,
        schema: { params: z.object({ userId: z.string().min(1).max(64) }) },
    }, async (request, reply) => {
        const { userId } = request.params as { userId: string };
        try {
            const deletedCounts = await purgeFn(userId);
            return reply.code(200).send({ userId, deletedCounts });
        } catch (err: any) {
            request.log.error({ err, userId }, 'GDPR purge failed');
            return reply.code(500).send({ error: 'Internal server error' });
        }
    });

    await app.ready();
    return app;
}

describe('purgeUser (service layer, real logic vs fake Prisma)', () => {
    it('deletes ONLY the target user rows from user_states, leaving other users intact', async () => {
        const { prisma, state } = makeFakePrisma({
            userStates: [{ id: 's1', userId: VICTIM }, { id: 's3', userId: OTHER }],
        });

        const counts = await purgeUser(prisma as any, VICTIM);

        expect(counts).toEqual({ user_states: 1 });
        // Other users' rows survive.
        expect(state.userStates.map((r) => r.id)).toEqual(['s3']);
    });

    it('is idempotent: purging a user with no rows returns zero counts (no throw), and re-purge is safe', async () => {
        const { prisma } = makeFakePrisma({ userStates: [{ id: 's3', userId: OTHER }] });

        const first = await purgeUser(prisma as any, GHOST);
        const second = await purgeUser(prisma as any, GHOST); // re-purge is safe

        expect(first).toEqual({ user_states: 0 });
        expect(second).toEqual({ user_states: 0 });
    });
});

describe('DELETE /v1/state/internal/user/:userId (route + internal-token guard)', () => {
    let app: FastifyInstance;

    afterEach(async () => {
        if (app) await app.close();
    });

    it('404s without the X-Internal-Token header and NEVER calls purgeUser', async () => {
        const purgeFn = jest.fn(() => Promise.resolve({ user_states: 0 }));
        app = await buildApp(purgeFn);

        const res = await app.inject({ method: 'DELETE', url: `/v1/state/internal/user/${VICTIM}` });

        expect(res.statusCode).toBe(404);
        expect(res.json()).toEqual({ statusCode: 404, error: 'Not Found', message: 'Route not found' });
        expect(purgeFn).not.toHaveBeenCalled();
    });

    it('404s with a WRONG X-Internal-Token and NEVER calls purgeUser', async () => {
        const purgeFn = jest.fn(() => Promise.resolve({ user_states: 0 }));
        app = await buildApp(purgeFn);

        const res = await app.inject({
            method: 'DELETE',
            url: `/v1/state/internal/user/${VICTIM}`,
            headers: { 'x-internal-token': 'wrong-token' },
        });

        expect(res.statusCode).toBe(404);
        expect(purgeFn).not.toHaveBeenCalled();
    });

    it('purges the user and returns a deletedCounts summary WITH the correct token', async () => {
        const purgeFn = jest.fn(() => Promise.resolve({ user_states: 1 }));
        app = await buildApp(purgeFn);

        const res = await app.inject({
            method: 'DELETE',
            url: `/v1/state/internal/user/${VICTIM}`,
            headers: { 'x-internal-token': INTERNAL_TOKEN },
        });

        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({
            userId: VICTIM,
            deletedCounts: { user_states: 1 },
        });
        expect(purgeFn).toHaveBeenCalledTimes(1);
        expect(purgeFn).toHaveBeenCalledWith(VICTIM);
    });

    it('returns 200 with zero counts for a user that has no rows (idempotent over REST)', async () => {
        const purgeFn = jest.fn(() => Promise.resolve({ user_states: 0 }));
        app = await buildApp(purgeFn);

        const res = await app.inject({
            method: 'DELETE',
            url: `/v1/state/internal/user/${GHOST}`,
            headers: { 'x-internal-token': INTERNAL_TOKEN },
        });

        expect(res.statusCode).toBe(200);
        expect(res.json().deletedCounts).toEqual({ user_states: 0 });
    });

    it('an empty/unset INTERNAL_SERVICE_TOKEN fails CLOSED: every request 404s', async () => {
        const purgeFn = jest.fn(() => Promise.resolve({ user_states: 0 }));
        app = await buildApp(purgeFn, ''); // guard built with empty expected token

        const res = await app.inject({
            method: 'DELETE',
            url: `/v1/state/internal/user/${VICTIM}`,
            headers: { 'x-internal-token': '' },
        });

        expect(res.statusCode).toBe(404);
        expect(purgeFn).not.toHaveBeenCalled();
    });
});
