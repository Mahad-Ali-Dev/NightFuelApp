/**
 * GDPR data-export regression suite — GET /v1/sleep/internal/user/:userId/export.
 *
 * Read-only counterpart of the purge (gdpr-purge.test.ts). Two guarantees:
 *   1. GUARD — the route is server-to-server-only, behind the SAME
 *      makeInternalAuthGuard the purge uses. Without the X-Internal-Token header
 *      (or with the wrong one) it MUST answer 404 (the stock not-found body),
 *      never revealing the route exists, and SleepService.exportUser is NEVER
 *      invoked.
 *   2. EXPORT — with the correct X-Internal-Token, the handler returns the user's
 *      rows across the SAME user-owned tables the purge covers (sleep_sessions,
 *      sleep_preferences, health_samples), keyed by table name, and ONLY the
 *      target user's rows (others are excluded).
 *
 * Layers mirror the purge suite:
 *   • SERVICE — the real SleepService.exportUser runs against a tiny in-memory
 *     Prisma fake (no DB in CI). It proves the actual read semantics (rows by
 *     user_id across the three tables, other users excluded), that the export
 *     table set EXACTLY matches the purge table set (sync invariant), that no
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
import { SleepService } from '../src/sleep.service';

const INTERNAL_TOKEN = 'internal-shared-secret-token-xyz';

// The export table set MUST equal the purge table set.
const EXPORT_TABLES = ['health_samples', 'sleep_preferences', 'sleep_sessions'];

// ── In-memory Prisma fake (export + purge slice) ─────────────────────────────────
// Implements just what SleepService.exportUser touches: findMany on sleepSession /
// sleepPreference / healthSample with the exact `where: { userId }` + orderBy +
// take shapes exportUser builds. Also provides deleteMany + a sequential
// $transaction so the sync-invariant test can call the real purgeUser against the
// same fake.
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
        sleepSession: {
            findMany: (args: any) => findByUser(state.sleepSessions, args, 'startTime'),
            deleteMany: ({ where }: any) => Promise.resolve(deleteFrom(state.sleepSessions, where.userId)),
        },
        sleepPreference: {
            // exportUser reads preferences with no orderBy/take (at most one row).
            findMany: (args: any) => findByUser(state.sleepPreferences, args),
            deleteMany: ({ where }: any) => Promise.resolve(deleteFrom(state.sleepPreferences, where.userId)),
        },
        healthSample: {
            findMany: (args: any) => findByUser(state.healthSamples, args, 'startTime'),
            deleteMany: ({ where }: any) => Promise.resolve(deleteFrom(state.healthSamples, where.userId)),
        },
        $transaction: (ops: Promise<any>[]) => Promise.all(ops),
    };

    return { prisma, state };
}

// A no-op EventBus — exportUser never publishes.
const noopEventBus: any = { publish: jest.fn(), subscribe: jest.fn() };

/**
 * Build a Fastify app reproducing the EXACT route wiring from src/index.ts:
 * the real makeInternalAuthGuard preHandler + the inline GET handler. The service
 * is injected so the REST layer can use a mock.
 */
async function buildApp(sleepSvc: any, internalServiceToken = INTERNAL_TOKEN): Promise<FastifyInstance> {
    const app = Fastify({ logger: false });
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);

    const internalAuth = makeInternalAuthGuard(internalServiceToken);

    app.withTypeProvider<ZodTypeProvider>().get('/v1/sleep/internal/user/:userId/export', {
        preHandler: internalAuth,
        schema: { params: z.object({ userId: z.string().uuid() }) },
    }, async (request, reply) => {
        const { userId } = request.params as { userId: string };
        try {
            const data = await sleepSvc.exportUser(userId);
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

describe('SleepService.exportUser (service layer, real logic vs fake Prisma)', () => {
    it('returns ONLY the target user rows across all three tables, keyed by table name', async () => {
        const { prisma } = makeFakePrisma({
            sleepSessions: [
                { id: 's1', userId: VICTIM, startTime: '2026-01-02T00:00:00Z', quality: 8 },
                { id: 's2', userId: VICTIM, startTime: '2026-01-01T00:00:00Z', quality: 6 },
                { id: 's3', userId: OTHER, startTime: '2026-01-03T00:00:00Z', quality: 9 },
            ],
            sleepPreferences: [
                { id: 'p1', userId: VICTIM, targetDuration: 480 },
                { id: 'p2', userId: OTHER, targetDuration: 420 },
            ],
            healthSamples: [
                { id: 'h1', userId: VICTIM, kind: 'hrv', startTime: '2026-01-02T00:00:00Z', value: 55 },
                { id: 'h2', userId: VICTIM, kind: 'steps', startTime: '2026-01-01T00:00:00Z', value: 8000 },
                { id: 'h3', userId: OTHER, kind: 'steps', startTime: '2026-01-03T00:00:00Z', value: 9000 },
            ],
        });
        const svc = new SleepService(prisma as any, noopEventBus);

        const out = await svc.exportUser(VICTIM);

        // Newest-first ordering preserved; only the victim's rows.
        expect(out.sleep_sessions.map((r: any) => r.id)).toEqual(['s1', 's2']);
        expect(out.sleep_preferences.map((r: any) => r.id)).toEqual(['p1']);
        expect(out.health_samples.map((r: any) => r.id)).toEqual(['h1', 'h2']);

        // No other user's rows leak anywhere in the export.
        const serialized = JSON.stringify(out);
        expect(serialized).not.toContain('"id":"s3"');
        expect(serialized).not.toContain('"id":"p2"');
        expect(serialized).not.toContain('"id":"h3"');
        expect(serialized).not.toContain(`"userId":"${OTHER}"`);
    });

    it('export table set EXACTLY matches the purge table set (export/erasure sync)', async () => {
        const { prisma } = makeFakePrisma();
        const svc = new SleepService(prisma as any, noopEventBus);

        const purgeTables = Object.keys(await svc.purgeUser('nobody')).sort();
        const exportTables = Object.keys(await svc.exportUser('nobody'))
            .filter((k) => k !== '_meta')
            .sort();

        expect(exportTables).toEqual(purgeTables);
        expect(exportTables).toEqual(EXPORT_TABLES);
    });

    it('does NOT leak any secret/credential-looking field (no password/token/secret/key)', async () => {
        // None of the sleep tables hold a credential column; this locks that in so
        // any future schema change that adds one (and forgets to strip it) fails.
        const { prisma } = makeFakePrisma({
            sleepSessions: [{ id: 's1', userId: VICTIM, startTime: '2026-01-01T00:00:00Z', quality: 7, disturbances: 1, source: 'APPLE_HEALTH', notes: 'slept well' }],
            sleepPreferences: [{ id: 'p1', userId: VICTIM, targetDuration: 480, windDownDuration: 30, temperatureTarget: 19 }],
            healthSamples: [{ id: 'h1', userId: VICTIM, kind: 'hrv', startTime: '2026-01-01T00:00:00Z', value: 55, unit: 'ms' }],
        });
        const svc = new SleepService(prisma as any, noopEventBus);

        const out = await svc.exportUser(VICTIM);
        const serialized = JSON.stringify(out).toLowerCase();

        for (const forbidden of [
            'password',
            'passwordhash',
            'token',
            'secret',
            'apikey',
            'privatekey',
            'rawkey',
            'credential',
        ]) {
            expect(serialized).not.toContain(forbidden);
        }
    });

    it('returns empty arrays (no throw) for a user with no rows — read-only & idempotent', async () => {
        const { prisma, state } = makeFakePrisma({ sleepSessions: [{ id: 's3', userId: OTHER }] });
        const svc = new SleepService(prisma as any, noopEventBus);

        const first = await svc.exportUser(GHOST);
        const second = await svc.exportUser(GHOST);

        expect(first.sleep_sessions).toEqual([]);
        expect(first.sleep_preferences).toEqual([]);
        expect(first.health_samples).toEqual([]);
        // Repeatable: identical output for unchanged data, and nothing was deleted.
        expect(second).toEqual(first);
        expect(state.sleepSessions.map((r) => r.id)).toEqual(['s3']);
    });

    it('bounds the per-user log tables and flags truncation when over the cap', async () => {
        const cap = 50_000;
        const mkSamples = (n: number) =>
            Array.from({ length: n }, (_, i) => ({
                id: `h${i}`,
                userId: VICTIM,
                kind: 'steps',
                startTime: new Date(2026, 0, 1, 0, 0, i).toISOString(),
                value: i,
            }));
        const { prisma } = makeFakePrisma({ healthSamples: mkSamples(cap + 1) });
        const svc = new SleepService(prisma as any, noopEventBus);

        const out = await svc.exportUser(VICTIM);

        expect(out.health_samples.length).toBe(cap);
        expect(out._meta.healthSamplesTruncated).toBe(true);
        expect(out._meta.sleepSessionsTruncated).toBe(false);
        expect(out._meta.rowLimit).toBe(cap);
    });
});

describe('GET /v1/sleep/internal/user/:userId/export (route + internal-token guard)', () => {
    let app: FastifyInstance;

    const emptyExport = () =>
        Promise.resolve({
            sleep_sessions: [],
            sleep_preferences: [],
            health_samples: [],
            _meta: { sleepSessionsTruncated: false, healthSamplesTruncated: false, rowLimit: 50000 },
        });

    afterEach(async () => {
        if (app) await app.close();
    });

    it('404s without the X-Internal-Token header and NEVER calls exportUser', async () => {
        const exportUser = jest.fn(emptyExport);
        app = await buildApp({ exportUser });

        const res = await app.inject({ method: 'GET', url: `/v1/sleep/internal/user/${VICTIM}/export` });

        expect(res.statusCode).toBe(404);
        expect(res.json()).toEqual({ statusCode: 404, error: 'Not Found', message: 'Route not found' });
        expect(exportUser).not.toHaveBeenCalled();
    });

    it('404s with a WRONG X-Internal-Token and NEVER calls exportUser', async () => {
        const exportUser = jest.fn(emptyExport);
        app = await buildApp({ exportUser });

        const res = await app.inject({
            method: 'GET',
            url: `/v1/sleep/internal/user/${VICTIM}/export`,
            headers: { 'x-internal-token': 'wrong-token' },
        });

        expect(res.statusCode).toBe(404);
        expect(exportUser).not.toHaveBeenCalled();
    });

    it('returns the user data across the expected tables WITH the correct token', async () => {
        const data = {
            sleep_sessions: [{ id: 's1', userId: VICTIM, quality: 8, source: 'MANUAL', notes: 'ok' }],
            sleep_preferences: [{ id: 'p1', userId: VICTIM, targetDuration: 480 }],
            health_samples: [{ id: 'h1', userId: VICTIM, kind: 'hrv', value: 55 }],
            _meta: { sleepSessionsTruncated: false, healthSamplesTruncated: false, rowLimit: 50000 },
        };
        const exportUser = jest.fn(() => Promise.resolve(data));
        app = await buildApp({ exportUser });

        const res = await app.inject({
            method: 'GET',
            url: `/v1/sleep/internal/user/${VICTIM}/export`,
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
            url: `/v1/sleep/internal/user/${GHOST}/export`,
            headers: { 'x-internal-token': INTERNAL_TOKEN },
        });

        expect(res.statusCode).toBe(200);
        expect(res.json().data.sleep_sessions).toEqual([]);
        expect(res.json().data.sleep_preferences).toEqual([]);
        expect(res.json().data.health_samples).toEqual([]);
    });

    it('an empty/unset INTERNAL_SERVICE_TOKEN fails CLOSED: every request 404s', async () => {
        const exportUser = jest.fn(emptyExport);
        app = await buildApp({ exportUser }, ''); // guard built with empty expected token

        const res = await app.inject({
            method: 'GET',
            url: `/v1/sleep/internal/user/${VICTIM}/export`,
            headers: { 'x-internal-token': '' },
        });

        expect(res.statusCode).toBe(404);
        expect(exportUser).not.toHaveBeenCalled();
    });
});
