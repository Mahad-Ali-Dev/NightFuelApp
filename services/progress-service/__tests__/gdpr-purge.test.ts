/**
 * GDPR purge — DELETE /v1/progress/internal/user/:userId
 *
 * Proves, end-to-end through the REAL route module (`progressRoutes` from
 * src/routes.ts), wired exactly like production (zod validator + serializer +
 * shared error handler + the shared X-Internal-Token guard):
 *
 *   1. NO  X-Internal-Token  -> 404 (route hidden; purgeUser never runs).
 *   2. WRONG X-Internal-Token -> 404 (purgeUser never runs).
 *   3. CORRECT X-Internal-Token -> 200; purgeUser is invoked with the path
 *      :userId and the per-table deletedCounts summary is returned.
 *   4. IDEMPOTENT: a user with no rows returns 200 with all-zero counts, and
 *      a second purge is safe (deleteMany never throws on zero rows).
 *
 * Prisma is mocked: every deleteMany is a jest.fn returning a { count }, and
 * $transaction resolves the array of those results — the same shape the real
 * Prisma client returns for an array of deleteMany promises. No DB is touched.
 */
import Fastify, { FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { registerFastifyErrorHandler } from '@nightfuel/config';
import { progressRoutes } from '../src/routes';
import { ProgressService } from '../src/progress.service';

const INTERNAL_TOKEN = 'test-internal-token-at-least-16-chars';
const USER_ID = '11111111-1111-1111-1111-111111111111';

// The six user-owned models the purge must clear, in the schema's table order.
const MODELS = [
    'dailyProgress',
    'streak',
    'bodyMetrics',
    'aiUsageLog',
    'hydrationLog',
    'performanceReport',
] as const;

/**
 * Build a mock Prisma whose deleteMany on each user-owned model returns the
 * given per-model row count, and whose $transaction resolves the array of
 * those deleteMany results (mirroring real Prisma's array-of-operations form).
 */
function buildMockPrisma(counts: Record<string, number>) {
    const prisma: any = {};
    for (const m of MODELS) {
        prisma[m] = {
            deleteMany: jest.fn(async () => ({ count: counts[m] ?? 0 })),
        };
    }
    prisma.$transaction = jest.fn(async (ops: Promise<any>[]) => Promise.all(ops));
    return prisma;
}

function buildApp(service: ProgressService): FastifyInstance {
    const app = Fastify({ logger: false });
    const silentLogger = { error: () => {}, warn: () => {}, info: () => {} } as any;
    registerFastifyErrorHandler(app, silentLogger);
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);

    // Other progressRoutes use the `authenticate` decorator (set in src/index.ts);
    // decorate a no-op so the plugin loads. The purge route uses the internal guard.
    app.decorate('authenticate', async () => {});

    app.register(async (instance) => {
        await progressRoutes(instance as any, {
            progressService: service,
            internalServiceToken: INTERNAL_TOKEN,
        });
    }, { prefix: '/v1/progress' });

    return app;
}

describe('progress-service DELETE /internal/user/:userId — GDPR purge', () => {
    it('404s WITHOUT an X-Internal-Token (purgeUser never runs)', async () => {
        const prisma = buildMockPrisma({});
        const service = new ProgressService(prisma, {} as any, {} as any);
        const spy = jest.spyOn(service, 'purgeUser');
        const app = buildApp(service);
        await app.ready();

        const res = await app.inject({
            method: 'DELETE',
            url: `/v1/progress/internal/user/${USER_ID}`,
        });

        expect(res.statusCode).toBe(404);
        expect(spy).not.toHaveBeenCalled();
        expect(prisma.$transaction).not.toHaveBeenCalled();
        await app.close();
    });

    it('404s with a WRONG X-Internal-Token (purgeUser never runs)', async () => {
        const prisma = buildMockPrisma({});
        const service = new ProgressService(prisma, {} as any, {} as any);
        const spy = jest.spyOn(service, 'purgeUser');
        const app = buildApp(service);
        await app.ready();

        const res = await app.inject({
            method: 'DELETE',
            url: `/v1/progress/internal/user/${USER_ID}`,
            headers: { 'x-internal-token': 'wrong-token' },
        });

        expect(res.statusCode).toBe(404);
        expect(spy).not.toHaveBeenCalled();
        await app.close();
    });

    it('purges ALL user-owned tables with the correct token and returns deletedCounts', async () => {
        const counts = {
            dailyProgress: 30,
            streak: 1,
            bodyMetrics: 12,
            aiUsageLog: 7,
            hydrationLog: 90,
            performanceReport: 4,
        };
        const prisma = buildMockPrisma(counts);
        const service = new ProgressService(prisma, {} as any, {} as any);
        const app = buildApp(service);
        await app.ready();

        const res = await app.inject({
            method: 'DELETE',
            url: `/v1/progress/internal/user/${USER_ID}`,
            headers: { 'x-internal-token': INTERNAL_TOKEN },
        });

        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body);
        expect(body.userId).toBe(USER_ID);
        expect(body.deletedCounts).toEqual({
            daily_progress: 30,
            streaks: 1,
            body_metrics: 12,
            ai_usage_logs: 7,
            hydration_logs: 90,
            performance_reports: 4,
        });

        // Every user-owned model was scoped to THIS user only, inside one transaction.
        for (const m of MODELS) {
            expect(prisma[m].deleteMany).toHaveBeenCalledTimes(1);
            expect(prisma[m].deleteMany).toHaveBeenCalledWith({ where: { userId: USER_ID } });
        }
        expect(prisma.$transaction).toHaveBeenCalledTimes(1);
        await app.close();
    });

    it('is IDEMPOTENT: a user with no rows returns 200 with all-zero counts', async () => {
        const prisma = buildMockPrisma({}); // every deleteMany -> { count: 0 }
        const service = new ProgressService(prisma, {} as any, {} as any);
        const app = buildApp(service);
        await app.ready();

        const first = await app.inject({
            method: 'DELETE',
            url: `/v1/progress/internal/user/${USER_ID}`,
            headers: { 'x-internal-token': INTERNAL_TOKEN },
        });
        const second = await app.inject({
            method: 'DELETE',
            url: `/v1/progress/internal/user/${USER_ID}`,
            headers: { 'x-internal-token': INTERNAL_TOKEN },
        });

        expect(first.statusCode).toBe(200);
        expect(second.statusCode).toBe(200);
        expect(JSON.parse(first.body).deletedCounts).toEqual({
            daily_progress: 0,
            streaks: 0,
            body_metrics: 0,
            ai_usage_logs: 0,
            hydration_logs: 0,
            performance_reports: 0,
        });
        // Safe to call twice (deleteMany never throws on zero rows).
        expect(prisma.$transaction).toHaveBeenCalledTimes(2);
        await app.close();
    });
});
