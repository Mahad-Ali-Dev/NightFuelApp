/**
 * GDPR data-export regression suite — GET /v1/meals/internal/user/:userId/export.
 *
 * Read-only counterpart of the purge (gdpr-purge.test.ts). Two guarantees:
 *   1. GUARD — the route is server-to-server-only, behind the SAME
 *      makeInternalAuthGuard the purge uses. Without the X-Internal-Token header
 *      (or with the wrong one) it MUST answer 404 (the stock not-found body),
 *      never revealing the route exists, and MealService.exportUser is NEVER
 *      invoked.
 *   2. EXPORT — with the correct X-Internal-Token, the handler returns the user's
 *      rows across the SAME user-owned tables the purge covers (meal_logs,
 *      fasting_logs), keyed by table name, and ONLY the target user's rows
 *      (others are excluded).
 *
 * Layers mirror the purge suite:
 *   • SERVICE — the real MealService.exportUser runs against a tiny in-memory
 *     Prisma fake (no DB in CI). It proves the actual read semantics (rows by
 *     user_id across the two tables, other users excluded), that the export table
 *     set EXACTLY matches the purge table set (sync invariant), that no
 *     secret/credential-looking field leaks, and that the per-table row cap bounds
 *     the payload.
 *   • REST — the genuine makeInternalAuthGuard preHandler (the SAME guard
 *     src/index.ts mounts) wraps a tiny app reproducing the route handler with a
 *     mock service, proving the guard and the 200 body wiring.
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
import { MealService } from '../src/meal.service';

const INTERNAL_TOKEN = 'internal-shared-secret-token-xyz';

// The export table set MUST equal the purge table set (meal_logs, fasting_logs).
const EXPORT_TABLES = ['fasting_logs', 'meal_logs'];

// ── In-memory Prisma fake (export slice) ─────────────────────────────────────────
// Implements just what MealService.exportUser touches: findMany on mealLog /
// fastingLog with the exact `where: { userId }` + orderBy + take shapes exportUser
// builds. Also provides deleteMany + a sequential $transaction so the
// sync-invariant test can call the real purgeUser against the same fake.
function makeFakePrisma(seed?: { mealLogs?: any[]; fastingLogs?: any[] }) {
    const state = {
        mealLogs: seed?.mealLogs ? [...seed.mealLogs] : [],
        fastingLogs: seed?.fastingLogs ? [...seed.fastingLogs] : [],
    };

    // exportUser builds `where: { userId }`; a row matches only when its userId
    // strictly equals the target, exactly like Postgres `WHERE user_id = $1`.
    const findByUser = (rows: any[], { where, orderBy, take }: any, sortKey?: string) => {
        let out = rows.filter((r) => r.userId === where.userId);
        if (sortKey && orderBy?.[sortKey] === 'desc') {
            out = [...out].sort(
                (a, b) => new Date(b[sortKey]).getTime() - new Date(a[sortKey]).getTime(),
            );
        }
        if (typeof take === 'number') out = out.slice(0, take);
        return Promise.resolve(out);
    };

    const deleteFrom = (rows: any[], userId: string) => {
        const before = rows.length;
        const kept = rows.filter((r) => r.userId !== userId);
        rows.length = 0;
        rows.push(...kept);
        return { count: before - kept.length };
    };

    const prisma: any = {
        mealLog: {
            findMany: (args: any) => findByUser(state.mealLogs, args, 'loggedAt'),
            deleteMany: ({ where }: any) => Promise.resolve(deleteFrom(state.mealLogs, where.userId)),
        },
        fastingLog: {
            findMany: (args: any) => findByUser(state.fastingLogs, args, 'startTime'),
            deleteMany: ({ where }: any) => Promise.resolve(deleteFrom(state.fastingLogs, where.userId)),
        },
        $transaction: (ops: Promise<any>[]) => Promise.all(ops),
    };

    return { prisma, state };
}

// A no-op EventBus — exportUser never publishes.
const noopEventBus: any = { publish: jest.fn(), subscribe: jest.fn() };
const noopConfig = { PLAN_SERVICE_URL: 'http://plan', INTERNAL_SERVICE_TOKEN: INTERNAL_TOKEN };

/**
 * Build a Fastify app reproducing the EXACT route wiring from src/index.ts:
 * the real makeInternalAuthGuard preHandler + the inline GET handler. The service
 * is injected so the REST layer can use a mock.
 */
async function buildApp(mealSvc: any, internalServiceToken = INTERNAL_TOKEN): Promise<FastifyInstance> {
    const app = Fastify({ logger: false });
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);

    const internalAuth = makeInternalAuthGuard(internalServiceToken);

    app.withTypeProvider<ZodTypeProvider>().get('/v1/meals/internal/user/:userId/export', {
        preHandler: internalAuth,
        schema: { params: z.object({ userId: z.string().uuid() }) },
    }, async (request, reply) => {
        const { userId } = request.params as { userId: string };
        try {
            const data = await mealSvc.exportUser(userId);
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

describe('MealService.exportUser (service layer, real logic vs fake Prisma)', () => {
    it('returns ONLY the target user rows across both tables, keyed by table name', async () => {
        const { prisma } = makeFakePrisma({
            mealLogs: [
                { id: 'm1', userId: VICTIM, mealType: 'LUNCH', loggedAt: '2026-01-02T00:00:00Z', foodItems: [{ name: 'rice' }] },
                { id: 'm2', userId: VICTIM, mealType: 'DINNER', loggedAt: '2026-01-01T00:00:00Z', foodItems: [{ name: 'dal' }] },
                { id: 'm3', userId: OTHER, mealType: 'SNACK', loggedAt: '2026-01-03T00:00:00Z', foodItems: [] },
            ],
            fastingLogs: [
                { id: 'f1', userId: VICTIM, status: 'COMPLETED', startTime: '2026-01-01T00:00:00Z' },
                { id: 'f2', userId: OTHER, status: 'ACTIVE', startTime: '2026-01-02T00:00:00Z' },
            ],
        });
        const svc = new MealService(prisma as any, noopEventBus, noopConfig);

        const out = await svc.exportUser(VICTIM);

        // Newest-first ordering preserved; only the victim's rows.
        expect(out.meal_logs.map((r: any) => r.id)).toEqual(['m1', 'm2']);
        expect(out.fasting_logs.map((r: any) => r.id)).toEqual(['f1']);

        // No other user's rows leak anywhere in the export.
        const serialized = JSON.stringify(out);
        expect(serialized).not.toContain('"id":"m3"');
        expect(serialized).not.toContain('"id":"f2"');
        expect(serialized).not.toContain(`"userId":"${OTHER}"`);
    });

    it('export table set EXACTLY matches the purge table set (export/erasure sync)', async () => {
        const { prisma } = makeFakePrisma();
        const svc = new MealService(prisma as any, noopEventBus, noopConfig);

        const purgeTables = Object.keys(await svc.purgeUser('nobody')).sort();
        const exportTables = Object.keys(await svc.exportUser('nobody'))
            .filter((k) => k !== '_meta')
            .sort();

        expect(exportTables).toEqual(purgeTables);
        expect(exportTables).toEqual(EXPORT_TABLES);
    });

    it('does NOT leak any secret/credential-looking field (no password/token/secret/key)', async () => {
        const { prisma } = makeFakePrisma({
            mealLogs: [{ id: 'm1', userId: VICTIM, mealType: 'LUNCH', loggedAt: '2026-01-01T00:00:00Z', foodItems: [{ name: 'rice' }], totalCalories: 300 }],
            fastingLogs: [{ id: 'f1', userId: VICTIM, status: 'ACTIVE', startTime: '2026-01-01T00:00:00Z', targetHours: 16 }],
        });
        const svc = new MealService(prisma as any, noopEventBus, noopConfig);

        const out = await svc.exportUser(VICTIM);
        const serialized = JSON.stringify(out).toLowerCase();

        for (const forbidden of [
            'password',
            'passwordhash',
            'token',
            'secret',
            'apikey',
            'privatekey',
            'credential',
        ]) {
            expect(serialized).not.toContain(forbidden);
        }
    });

    it('returns empty arrays (no throw) for a user with no rows — read-only & idempotent', async () => {
        const { prisma, state } = makeFakePrisma({ mealLogs: [{ id: 'm3', userId: OTHER }] });
        const svc = new MealService(prisma as any, noopEventBus, noopConfig);

        const first = await svc.exportUser(GHOST);
        const second = await svc.exportUser(GHOST);

        expect(first.meal_logs).toEqual([]);
        expect(first.fasting_logs).toEqual([]);
        // Repeatable: identical output for unchanged data, and nothing was deleted.
        expect(second).toEqual(first);
        expect(state.mealLogs.map((r) => r.id)).toEqual(['m3']);
    });

    it('bounds each per-user table and flags truncation when over the cap', async () => {
        const cap = 50_000;
        const mkMeals = (n: number) =>
            Array.from({ length: n }, (_, i) => ({
                id: `m${i}`,
                userId: VICTIM,
                mealType: 'SNACK',
                loggedAt: new Date(2026, 0, 1, 0, 0, i).toISOString(),
                foodItems: [],
            }));
        const { prisma } = makeFakePrisma({ mealLogs: mkMeals(cap + 1) });
        const svc = new MealService(prisma as any, noopEventBus, noopConfig);

        const out = await svc.exportUser(VICTIM);

        expect(out.meal_logs.length).toBe(cap);
        expect(out._meta.mealLogsTruncated).toBe(true);
        expect(out._meta.fastingLogsTruncated).toBe(false);
        expect(out._meta.rowLimit).toBe(cap);
    });
});

describe('GET /v1/meals/internal/user/:userId/export (route + internal-token guard)', () => {
    let app: FastifyInstance;

    const emptyExport = () =>
        Promise.resolve({
            meal_logs: [],
            fasting_logs: [],
            _meta: { mealLogsTruncated: false, fastingLogsTruncated: false, rowLimit: 50000 },
        });

    afterEach(async () => {
        if (app) await app.close();
    });

    it('404s without the X-Internal-Token header and NEVER calls exportUser', async () => {
        const exportUser = jest.fn(emptyExport);
        app = await buildApp({ exportUser });

        const res = await app.inject({ method: 'GET', url: `/v1/meals/internal/user/${VICTIM}/export` });

        expect(res.statusCode).toBe(404);
        expect(res.json()).toEqual({ statusCode: 404, error: 'Not Found', message: 'Route not found' });
        expect(exportUser).not.toHaveBeenCalled();
    });

    it('404s with a WRONG X-Internal-Token and NEVER calls exportUser', async () => {
        const exportUser = jest.fn(emptyExport);
        app = await buildApp({ exportUser });

        const res = await app.inject({
            method: 'GET',
            url: `/v1/meals/internal/user/${VICTIM}/export`,
            headers: { 'x-internal-token': 'wrong-token' },
        });

        expect(res.statusCode).toBe(404);
        expect(exportUser).not.toHaveBeenCalled();
    });

    it('returns the user data across the expected tables WITH the correct token', async () => {
        const data = {
            meal_logs: [{ id: 'm1', userId: VICTIM, mealType: 'LUNCH', foodItems: [{ name: 'rice' }] }],
            fasting_logs: [{ id: 'f1', userId: VICTIM, status: 'COMPLETED' }],
            _meta: { mealLogsTruncated: false, fastingLogsTruncated: false, rowLimit: 50000 },
        };
        const exportUser = jest.fn(() => Promise.resolve(data));
        app = await buildApp({ exportUser });

        const res = await app.inject({
            method: 'GET',
            url: `/v1/meals/internal/user/${VICTIM}/export`,
            headers: { 'x-internal-token': INTERNAL_TOKEN },
        });

        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({ userId: VICTIM, data });
        // Keyed by the SAME table names the purge deletes.
        expect(Object.keys(res.json().data).filter((k) => k !== '_meta').sort()).toEqual(EXPORT_TABLES);
        expect(exportUser).toHaveBeenCalledTimes(1);
        expect(exportUser).toHaveBeenCalledWith(VICTIM);
    });

    it('returns 200 with empty tables for a user that has no rows (idempotent over REST)', async () => {
        const exportUser = jest.fn(emptyExport);
        app = await buildApp({ exportUser });

        const res = await app.inject({
            method: 'GET',
            url: `/v1/meals/internal/user/${GHOST}/export`,
            headers: { 'x-internal-token': INTERNAL_TOKEN },
        });

        expect(res.statusCode).toBe(200);
        expect(res.json().data.meal_logs).toEqual([]);
        expect(res.json().data.fasting_logs).toEqual([]);
    });

    it('an empty/unset INTERNAL_SERVICE_TOKEN fails CLOSED: every request 404s', async () => {
        const exportUser = jest.fn(emptyExport);
        app = await buildApp({ exportUser }, ''); // guard built with empty expected token

        const res = await app.inject({
            method: 'GET',
            url: `/v1/meals/internal/user/${VICTIM}/export`,
            headers: { 'x-internal-token': '' },
        });

        expect(res.statusCode).toBe(404);
        expect(exportUser).not.toHaveBeenCalled();
    });
});
