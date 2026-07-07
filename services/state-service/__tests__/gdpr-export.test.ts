/**
 * GDPR data-export regression suite — GET /v1/state/internal/user/:userId/export.
 *
 * Read-only counterpart of the purge suite (gdpr-purge.test.ts). Two guarantees:
 *   1. GUARD — the route is server-to-server-only. Without the X-Internal-Token
 *      header (or with the wrong one, or with an empty expected token) it MUST
 *      answer 404 (the stock not-found body), never revealing the route exists,
 *      and exportUser is NEVER invoked.
 *   2. EXPORT — with the correct X-Internal-Token, the handler returns EVERY row
 *      owned by :userId across this service's user-owned tables (user_states — the
 *      ONLY user-keyed table in state-service), keyed by table name. A user with
 *      no row returns an empty array (idempotent, read-only).
 *
 * It also locks in the table set: exportUser must mirror purgeUser EXACTLY, so the
 * exported keys are asserted to equal the purge's deletedCounts keys.
 *
 * Layers, mirroring the purge suite:
 *   • SERVICE — the real exportUser (src/export.ts) runs against a tiny in-memory
 *     Prisma fake (no DB in CI). It proves the actual read semantics: only the
 *     target user's row(s) come back and OTHER users' rows are excluded.
 *   • REST — the genuine makeInternalAuthGuard preHandler (the SAME guard
 *     src/index.ts mounts) wraps a tiny app reproducing the route handler with a
 *     mock export fn, proving the guard and the 200 payload wiring.
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
import { exportUser } from '../src/export';
import { purgeUser } from '../src/purge';

const INTERNAL_TOKEN = 'internal-shared-secret-token-xyz';

const VICTIM = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';
const GHOST = '33333333-3333-3333-3333-333333333333';

// A representative user_states row. Mirrors the columns in prisma/schema.prisma —
// none of which is a secret/credential (all are the user's own metrics/state +
// bookkeeping), so the row is expected back verbatim.
const VICTIM_ROW = {
    id: 's1',
    userId: VICTIM,
    last7DaysAdherence: 0.85,
    adherenceSamples: [{ at: '2026-06-01T00:00:00.000Z', adherent: true }],
    avgSleepQuality: 7.5,
    fatigueLevel: 3.0,
    currentWeightKg: 80,
    targetWeightKg: 78,
    currentCalorieTarget: 2400,
    currentProteinTargetG: 180,
    trainingPhase: 'HYPERTROPHY',
    cycleWeek: 2,
    lastEventId: 'evt-123',
    lastProcessedAt: '2026-06-19T00:00:00.000Z',
    updatedAt: '2026-06-19T00:00:00.000Z',
};

// ── In-memory Prisma fake (export + purge slice) ─────────────────────────────────
// Implements just what exportUser/purgeUser touch: findMany / deleteMany on
// userState with the exact `where: { userId }` shape, and an array $transaction.
function makeFakePrisma(seed?: { userStates?: any[] }) {
    const state = {
        userStates: seed?.userStates ? [...seed.userStates] : [],
    };

    const byUserId = (where: any) => (r: any) => r.userId === where.userId;

    const deleteFrom = (rows: any[], pred: (r: any) => boolean) => {
        const before = rows.length;
        const kept = rows.filter((r) => !pred(r));
        rows.length = 0;
        rows.push(...kept);
        return { count: before - kept.length };
    };

    const prisma: any = {
        userState: {
            findMany: ({ where }: any) => Promise.resolve(state.userStates.filter(byUserId(where))),
            deleteMany: ({ where }: any) => Promise.resolve(deleteFrom(state.userStates, byUserId(where))),
        },
        $transaction: (ops: Promise<any>[]) => Promise.all(ops),
    };

    return { prisma, state };
}

/**
 * Build a Fastify app reproducing the EXACT route wiring from src/index.ts:
 * the real makeInternalAuthGuard preHandler + the inline GET export handler. The
 * export fn is injected so the REST layer can use a mock (the service layer is
 * exercised separately above).
 */
async function buildApp(exportFn: any, internalServiceToken = INTERNAL_TOKEN): Promise<FastifyInstance> {
    const app = Fastify({ logger: false });
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);

    const internalAuth = makeInternalAuthGuard(internalServiceToken);

    app.withTypeProvider<ZodTypeProvider>().get('/v1/state/internal/user/:userId/export', {
        preHandler: internalAuth,
        schema: { params: z.object({ userId: z.string().min(1).max(64) }) },
    }, async (request, reply) => {
        const { userId } = request.params as { userId: string };
        try {
            const data = await exportFn(userId);
            return reply.code(200).send({ userId, data });
        } catch (err: any) {
            request.log.error({ err, userId }, 'GDPR export failed');
            return reply.code(500).send({ error: 'Internal server error' });
        }
    });

    await app.ready();
    return app;
}

describe('exportUser (service layer, real logic vs fake Prisma)', () => {
    it('returns ONLY the target user row from user_states (other users excluded)', async () => {
        const { prisma } = makeFakePrisma({
            userStates: [VICTIM_ROW, { id: 's3', userId: OTHER }],
        });

        const data = await exportUser(prisma as any, VICTIM);

        expect(Object.keys(data)).toEqual(['user_states']);
        expect(data.user_states).toEqual([VICTIM_ROW]);
        // OTHER's row must not leak into VICTIM's export.
        expect(data.user_states.every((r: any) => r.userId === VICTIM)).toBe(true);
    });

    it('returns an empty array for a user with no rows (idempotent, read-only)', async () => {
        const { prisma, state } = makeFakePrisma({ userStates: [{ id: 's3', userId: OTHER }] });

        const first = await exportUser(prisma as any, GHOST);
        const second = await exportUser(prisma as any, GHOST); // read is idempotent

        expect(first).toEqual({ user_states: [] });
        expect(second).toEqual({ user_states: [] });
        // Read-only: the underlying store is untouched.
        expect(state.userStates.map((r) => r.id)).toEqual(['s3']);
    });

    it('exports the EXACT SAME table set the purge erases (export ⇄ erasure in sync)', async () => {
        const { prisma } = makeFakePrisma({ userStates: [VICTIM_ROW] });

        const exported = Object.keys(await exportUser(prisma as any, VICTIM)).sort();
        const purged = Object.keys(await purgeUser(prisma as any, VICTIM)).sort();

        expect(exported).toEqual(purged);
    });

    it('exposes NO secret/credential column — every exported field is user state or bookkeeping', async () => {
        const { prisma } = makeFakePrisma({ userStates: [VICTIM_ROW] });

        const data = await exportUser(prisma as any, VICTIM);
        const row = data.user_states[0];

        // No password/token/secret/raw-key field appears anywhere in the export.
        const SECRET_KEY = /(password|passwd|secret|token|credential|priv(ate)?[-_]?key|apikey|api[-_]?key|raw[-_]?key|p256dh|\bauth\b|\bkey\b)/i;
        for (const key of Object.keys(row)) {
            expect(SECRET_KEY.test(key)).toBe(false);
        }
        // lastEventId is an event-bus id (not a credential) and is allowed.
        expect(row.lastEventId).toBe('evt-123');
    });
});

describe('GET /v1/state/internal/user/:userId/export (route + internal-token guard)', () => {
    let app: FastifyInstance;

    afterEach(async () => {
        if (app) await app.close();
    });

    it('404s without the X-Internal-Token header and NEVER calls exportUser', async () => {
        const exportFn = jest.fn(() => Promise.resolve({ user_states: [] }));
        app = await buildApp(exportFn);

        const res = await app.inject({ method: 'GET', url: `/v1/state/internal/user/${VICTIM}/export` });

        expect(res.statusCode).toBe(404);
        expect(res.json()).toEqual({ statusCode: 404, error: 'Not Found', message: 'Route not found' });
        expect(exportFn).not.toHaveBeenCalled();
    });

    it('404s with a WRONG X-Internal-Token and NEVER calls exportUser', async () => {
        const exportFn = jest.fn(() => Promise.resolve({ user_states: [] }));
        app = await buildApp(exportFn);

        const res = await app.inject({
            method: 'GET',
            url: `/v1/state/internal/user/${VICTIM}/export`,
            headers: { 'x-internal-token': 'wrong-token' },
        });

        expect(res.statusCode).toBe(404);
        expect(exportFn).not.toHaveBeenCalled();
    });

    it('returns the user data keyed by table WITH the correct token', async () => {
        const exportFn = jest.fn(() => Promise.resolve({ user_states: [VICTIM_ROW] }));
        app = await buildApp(exportFn);

        const res = await app.inject({
            method: 'GET',
            url: `/v1/state/internal/user/${VICTIM}/export`,
            headers: { 'x-internal-token': INTERNAL_TOKEN },
        });

        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({
            userId: VICTIM,
            data: { user_states: [VICTIM_ROW] },
        });
        expect(exportFn).toHaveBeenCalledTimes(1);
        expect(exportFn).toHaveBeenCalledWith(VICTIM);
    });

    it('returns an empty user_states array for a user with no rows (idempotent over REST)', async () => {
        const exportFn = jest.fn(() => Promise.resolve({ user_states: [] }));
        app = await buildApp(exportFn);

        const res = await app.inject({
            method: 'GET',
            url: `/v1/state/internal/user/${GHOST}/export`,
            headers: { 'x-internal-token': INTERNAL_TOKEN },
        });

        expect(res.statusCode).toBe(200);
        expect(res.json().data).toEqual({ user_states: [] });
    });

    it('an empty/unset INTERNAL_SERVICE_TOKEN fails CLOSED: every request 404s', async () => {
        const exportFn = jest.fn(() => Promise.resolve({ user_states: [] }));
        app = await buildApp(exportFn, ''); // guard built with empty expected token

        const res = await app.inject({
            method: 'GET',
            url: `/v1/state/internal/user/${VICTIM}/export`,
            headers: { 'x-internal-token': '' },
        });

        expect(res.statusCode).toBe(404);
        expect(exportFn).not.toHaveBeenCalled();
    });
});
