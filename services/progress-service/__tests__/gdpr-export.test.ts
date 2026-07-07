/**
 * GDPR data-export regression suite — GET /v1/progress/internal/user/:userId/export.
 *
 * Read-only counterpart of the purge (gdpr-purge.test.ts). It proves:
 *   1. GUARD — the route is server-to-server-only, behind the SAME
 *      makeInternalAuthGuard the purge uses. WITHOUT the X-Internal-Token header
 *      (or with the wrong one) it MUST answer 404 (never revealing the route
 *      exists) and ProgressService.exportUser is NEVER invoked.
 *   2. EXPORT — with the correct X-Internal-Token, the handler returns the user's
 *      rows across the SAME six user-owned tables the purge covers
 *      (daily_progress, streaks, body_metrics, ai_usage_logs, hydration_logs,
 *      performance_reports), keyed by table name, and ONLY the target user's rows.
 *   3. SYNC — the export table set EXACTLY matches the purge table set (so a
 *      subject-access request and an erasure cover the same data).
 *   4. SECURITY — this service's schema has NO secret/credential/token/raw-key
 *      columns, so nothing is scrubbed; the test asserts no secret-looking field
 *      name or value (password/token/secret/apikey/...) appears in the output,
 *      which is the progress-service analogue of the auth-service "no password/
 *      token hash in the export" guarantee.
 *   5. BOUND — each table is capped (read-only) and overflow is flagged in _meta.
 *
 * Layers mirror the purge suite:
 *   • SERVICE — the real ProgressService.exportUser runs against an in-memory
 *     Prisma fake (no DB in CI). It proves the actual read semantics, the
 *     export/erasure sync invariant, and the per-table cap.
 *   • REST — the genuine `progressRoutes` plugin (wired like src/index.ts) with a
 *     mock service, proving the guard and the 200 body wiring.
 */
import Fastify, { FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { registerFastifyErrorHandler } from '@nightfuel/config';
import { progressRoutes } from '../src/routes';
import { ProgressService } from '../src/progress.service';

const INTERNAL_TOKEN = 'test-internal-token-at-least-16-chars';
const VICTIM = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';
const GHOST = '33333333-3333-3333-3333-333333333333';

// The six user-owned tables the purge deletes / the export must read.
const EXPORT_TABLES = [
    'daily_progress',
    'streaks',
    'body_metrics',
    'ai_usage_logs',
    'hydration_logs',
    'performance_reports',
].sort();

// ── In-memory Prisma fake (export + purge slices) ───────────────────────────────
// Implements just what ProgressService.exportUser / purgeUser touch on each
// model: findMany (with where/orderBy/take) and deleteMany, plus a sequential
// $transaction so the real purgeUser can run against the same fake.
function makeFakePrisma(seed?: {
    dailyProgress?: any[];
    streak?: any[];
    bodyMetrics?: any[];
    aiUsageLog?: any[];
    hydrationLog?: any[];
    performanceReport?: any[];
}) {
    const state: Record<string, any[]> = {
        dailyProgress: seed?.dailyProgress ? [...seed.dailyProgress] : [],
        streak: seed?.streak ? [...seed.streak] : [],
        bodyMetrics: seed?.bodyMetrics ? [...seed.bodyMetrics] : [],
        aiUsageLog: seed?.aiUsageLog ? [...seed.aiUsageLog] : [],
        hydrationLog: seed?.hydrationLog ? [...seed.hydrationLog] : [],
        performanceReport: seed?.performanceReport ? [...seed.performanceReport] : [],
    };

    const findMany = (rows: any[]) => ({ where, orderBy, take }: any) => {
        let out = rows.filter((r) => r.userId === where.userId);
        if (orderBy) {
            const [key, dir] = Object.entries(orderBy)[0] as [string, string];
            out = [...out].sort((a, b) => {
                const av = new Date(a[key]).getTime();
                const bv = new Date(b[key]).getTime();
                return dir === 'desc' ? bv - av : av - bv;
            });
        }
        if (typeof take === 'number') out = out.slice(0, take);
        return Promise.resolve(out);
    };

    const deleteMany = (rows: any[]) => ({ where }: any) => {
        const before = rows.length;
        const kept = rows.filter((r) => r.userId !== where.userId);
        rows.length = 0;
        rows.push(...kept);
        return Promise.resolve({ count: before - kept.length });
    };

    const model = (rows: any[]) => ({ findMany: findMany(rows), deleteMany: deleteMany(rows) });

    const prisma: any = {
        dailyProgress: model(state.dailyProgress),
        streak: model(state.streak),
        bodyMetrics: model(state.bodyMetrics),
        aiUsageLog: model(state.aiUsageLog),
        hydrationLog: model(state.hydrationLog),
        performanceReport: model(state.performanceReport),
        $transaction: (ops: Promise<any>[]) => Promise.all(ops),
    };

    return { prisma, state };
}

function buildApp(service: any): FastifyInstance {
    const app = Fastify({ logger: false });
    const silentLogger = { error: () => {}, warn: () => {}, info: () => {} } as any;
    registerFastifyErrorHandler(app, silentLogger);
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);

    // Other progressRoutes use the `authenticate` decorator (set in src/index.ts);
    // decorate a no-op so the plugin loads. The export route uses the internal guard.
    app.decorate('authenticate', async () => {});

    app.register(async (instance) => {
        await progressRoutes(instance as any, {
            progressService: service,
            internalServiceToken: INTERNAL_TOKEN,
        });
    }, { prefix: '/v1/progress' });

    return app;
}

describe('ProgressService.exportUser (service layer, real logic vs fake Prisma)', () => {
    it('returns ONLY the target user rows across all six tables, keyed by table name', async () => {
        const { prisma } = makeFakePrisma({
            dailyProgress: [
                { id: 'd1', userId: VICTIM, date: '2026-01-02', caloriesActual: 2000 },
                { id: 'd2', userId: VICTIM, date: '2026-01-01', caloriesActual: 1800 },
                { id: 'd3', userId: OTHER, date: '2026-01-03', caloriesActual: 1500 },
            ],
            streak: [
                { id: 'st1', userId: VICTIM, currentStreak: 5, longestStreak: 9 },
                { id: 'st2', userId: OTHER, currentStreak: 1, longestStreak: 1 },
            ],
            bodyMetrics: [
                { id: 'b1', userId: VICTIM, weightKg: 80, recordedAt: '2026-01-02T00:00:00Z' },
                { id: 'b2', userId: OTHER, weightKg: 70, recordedAt: '2026-01-02T00:00:00Z' },
            ],
            aiUsageLog: [
                { id: 'a1', userId: VICTIM, action: 'weekly-audit', provider: 'anthropic', totalTokens: 1500, createdAt: '2026-01-02T00:00:00Z' },
                { id: 'a2', userId: OTHER, action: 'plan', provider: 'openai', totalTokens: 900, createdAt: '2026-01-02T00:00:00Z' },
            ],
            hydrationLog: [
                { id: 'h1', userId: VICTIM, amountMl: 500, date: '2026-01-02' },
                { id: 'h2', userId: OTHER, amountMl: 250, date: '2026-01-02' },
            ],
            performanceReport: [
                { id: 'r1', userId: VICTIM, weekRange: 'Jan 1-7', score: 88, summary: 'good', date: '2026-01-07' },
                { id: 'r2', userId: OTHER, weekRange: 'Jan 1-7', score: 50, summary: 'meh', date: '2026-01-07' },
            ],
        });
        const svc = new ProgressService(prisma as any, {} as any, {} as any);

        const out = await svc.exportUser(VICTIM);

        // daily_progress newest-first; only the victim's rows.
        expect(out.daily_progress.map((r: any) => r.id)).toEqual(['d1', 'd2']);
        expect(out.streaks.map((r: any) => r.id)).toEqual(['st1']);
        expect(out.body_metrics.map((r: any) => r.id)).toEqual(['b1']);
        expect(out.ai_usage_logs.map((r: any) => r.id)).toEqual(['a1']);
        expect(out.hydration_logs.map((r: any) => r.id)).toEqual(['h1']);
        expect(out.performance_reports.map((r: any) => r.id)).toEqual(['r1']);

        // No other user's rows leak anywhere in the export.
        const serialized = JSON.stringify(out);
        for (const otherId of ['d3', 'st2', 'b2', 'a2', 'h2', 'r2']) {
            expect(serialized).not.toContain(`"id":"${otherId}"`);
        }
        expect(serialized).not.toContain(`"userId":"${OTHER}"`);
    });

    it('export table set EXACTLY matches the purge table set (export/erasure sync)', async () => {
        const { prisma } = makeFakePrisma();
        const svc = new ProgressService(prisma as any, {} as any, {} as any);

        const purgeTables = Object.keys(await svc.purgeUser('nobody')).sort();
        const exportTables = Object.keys(await svc.exportUser('nobody'))
            .filter((k) => k !== '_meta')
            .sort();

        expect(exportTables).toEqual(purgeTables);
        expect(exportTables).toEqual(EXPORT_TABLES);
    });

    it('SECURITY: no secret/credential/token field name or value appears in the export', async () => {
        // progress-service stores only the user's own fitness telemetry — there are
        // NO password/token/secret/raw-key columns to scrub. This asserts that
        // invariant holds (the analogue of auth-service: no password/token hash in
        // the output) even if a future schema change adds a sensitive column.
        const { prisma } = makeFakePrisma({
            aiUsageLog: [
                { id: 'a1', userId: VICTIM, action: 'audit', provider: 'anthropic', promptTokens: 1, completionTokens: 2, totalTokens: 3, createdAt: '2026-01-01T00:00:00Z' },
            ],
            bodyMetrics: [{ id: 'b1', userId: VICTIM, weightKg: 80, recordedAt: '2026-01-01T00:00:00Z' }],
        });
        const svc = new ProgressService(prisma as any, {} as any, {} as any);

        const out = await svc.exportUser(VICTIM);

        const lower = JSON.stringify(out).toLowerCase();
        for (const forbidden of [
            'password',
            'passwordhash',
            'token"', // a literal token field; "totalTokens" is a count, not a secret
            'secret',
            'credential',
            'apikey',
            'api_key',
            'privatekey',
            'private_key',
            'rawkey',
        ]) {
            expect(lower).not.toContain(forbidden);
        }
        // The AI usage rows export token *counts* only, never any provider key.
        expect(out.ai_usage_logs[0].totalTokens).toBe(3);
    });

    it('returns empty tables (no throw) for a user with no rows — read-only & idempotent', async () => {
        const { prisma, state } = makeFakePrisma({
            dailyProgress: [{ id: 'd9', userId: OTHER, date: '2026-01-01' }],
            performanceReport: [{ id: 'r9', userId: OTHER, date: '2026-01-07' }],
        });
        const svc = new ProgressService(prisma as any, {} as any, {} as any);

        const first = await svc.exportUser(GHOST);
        const second = await svc.exportUser(GHOST);

        for (const t of EXPORT_TABLES) {
            expect((first as any)[t]).toEqual([]);
        }
        // Repeatable: identical output, and nothing was deleted.
        expect(second).toEqual(first);
        expect(state.dailyProgress.map((r) => r.id)).toEqual(['d9']);
        expect(state.performanceReport.map((r) => r.id)).toEqual(['r9']);
    });

    it('bounds each table and flags truncation when over the per-table cap', async () => {
        const cap = 50_000;
        const mkRows = (n: number) =>
            Array.from({ length: n }, (_, i) => ({
                id: `h${i}`,
                userId: VICTIM,
                amountMl: 100,
                date: new Date(2026, 0, 1, 0, 0, i).toISOString(),
            }));
        const { prisma } = makeFakePrisma({ hydrationLog: mkRows(cap + 5) });
        const svc = new ProgressService(prisma as any, {} as any, {} as any);

        const out = await svc.exportUser(VICTIM);

        expect(out.hydration_logs.length).toBe(cap);
        expect(out._meta.rowLimit).toBe(cap);
        expect(out._meta.truncated).toContain('hydration_logs');
    });
});

describe('GET /v1/progress/internal/user/:userId/export (route + internal-token guard)', () => {
    const emptyExport = () =>
        Promise.resolve({
            daily_progress: [],
            streaks: [],
            body_metrics: [],
            ai_usage_logs: [],
            hydration_logs: [],
            performance_reports: [],
            _meta: { rowLimit: 50000, truncated: [] },
        });

    it('404s WITHOUT an X-Internal-Token and NEVER calls exportUser', async () => {
        const exportUser = jest.fn(emptyExport);
        const app = buildApp({ exportUser });
        await app.ready();

        const res = await app.inject({
            method: 'GET',
            url: `/v1/progress/internal/user/${VICTIM}/export`,
        });

        expect(res.statusCode).toBe(404);
        expect(exportUser).not.toHaveBeenCalled();
        await app.close();
    });

    it('404s with a WRONG X-Internal-Token and NEVER calls exportUser', async () => {
        const exportUser = jest.fn(emptyExport);
        const app = buildApp({ exportUser });
        await app.ready();

        const res = await app.inject({
            method: 'GET',
            url: `/v1/progress/internal/user/${VICTIM}/export`,
            headers: { 'x-internal-token': 'wrong-token' },
        });

        expect(res.statusCode).toBe(404);
        expect(exportUser).not.toHaveBeenCalled();
        await app.close();
    });

    it('returns the user data across the expected tables WITH the correct token', async () => {
        const data = {
            daily_progress: [{ id: 'd1', userId: VICTIM, caloriesActual: 2000 }],
            streaks: [{ id: 'st1', userId: VICTIM, currentStreak: 5 }],
            body_metrics: [{ id: 'b1', userId: VICTIM, weightKg: 80 }],
            ai_usage_logs: [{ id: 'a1', userId: VICTIM, totalTokens: 1500 }],
            hydration_logs: [{ id: 'h1', userId: VICTIM, amountMl: 500 }],
            performance_reports: [{ id: 'r1', userId: VICTIM, score: 88 }],
            _meta: { rowLimit: 50000, truncated: [] },
        };
        const exportUser = jest.fn(() => Promise.resolve(data));
        const app = buildApp({ exportUser });
        await app.ready();

        const res = await app.inject({
            method: 'GET',
            url: `/v1/progress/internal/user/${VICTIM}/export`,
            headers: { 'x-internal-token': INTERNAL_TOKEN },
        });

        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body);
        expect(body.userId).toBe(VICTIM);
        expect(body.data).toEqual(data);
        // Keyed by the SAME table names the purge deletes.
        expect(Object.keys(body.data).filter((k) => k !== '_meta').sort()).toEqual(EXPORT_TABLES);
        expect(exportUser).toHaveBeenCalledTimes(1);
        expect(exportUser).toHaveBeenCalledWith(VICTIM);
        await app.close();
    });

    it('returns 200 with empty tables for a user that has no rows (idempotent over REST)', async () => {
        const exportUser = jest.fn(emptyExport);
        const app = buildApp({ exportUser });
        await app.ready();

        const res = await app.inject({
            method: 'GET',
            url: `/v1/progress/internal/user/${GHOST}/export`,
            headers: { 'x-internal-token': INTERNAL_TOKEN },
        });

        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body);
        for (const t of EXPORT_TABLES) {
            expect(body.data[t]).toEqual([]);
        }
        await app.close();
    });
});
