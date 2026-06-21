/**
 * Regression suite — F35 #12: the POST /v1/progress/ai-usage telemetry sink is
 * a server-to-server-only endpoint and must be guarded by the shared
 * X-Internal-Token check (it was previously UNAUTHENTICATED — anyone who could
 * reach it could poison the AI cost-telemetry table with a forged userId/tokens).
 *
 * What this proves, end-to-end through the REAL route (`progressRoutes` from
 * src/routes.ts) wired exactly like production (zod validator + serializer +
 * shared error handler):
 *   1. NO X-Internal-Token            -> 404 (route hidden; handler never runs).
 *   2. WRONG X-Internal-Token         -> 404.
 *   3. CORRECT X-Internal-Token       -> reaches the handler (201) and the body
 *                                        (incl. the new optional costUsd/model
 *                                        fields the ai-pipeline now sends) validates.
 *
 * We import the real route module (no import-time side effects — only
 * src/index.ts opens DB/Redis) and inject a stub ProgressService so logAiUsage
 * never touches Prisma. The guard 404s match the shared not-found shape, so a
 * probe can't distinguish a guarded-but-present route from an absent one.
 */
import Fastify, { FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { registerFastifyErrorHandler } from '@nightfuel/config';
import { progressRoutes } from '../src/routes';

const INTERNAL_TOKEN = 'test-internal-token-at-least-16-chars';

// Valid sink payload (UUID userId per the route's body schema).
const VALID_BODY = {
    userId: '11111111-1111-1111-1111-111111111111',
    action: 'chat-stream',
    provider: 'anthropic',
    promptTokens: 1000,
    completionTokens: 500,
    totalTokens: 1500,
    // F35 #11: the optional cost/model the ai-pipeline now computes per call.
    costUsd: 0.0035,
    model: 'claude-haiku-4-5-20251001',
};

function buildApp(logAiUsage: (data: any) => Promise<any>): FastifyInstance {
    const app = Fastify({ logger: false });
    const silentLogger = { error: () => {}, warn: () => {}, info: () => {} } as any;
    registerFastifyErrorHandler(app, silentLogger);
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);

    // The full progressRoutes plugin registers other routes that use the
    // `authenticate` preHandler (decorated in src/index.ts). Decorate a no-op so
    // the plugin loads; /ai-usage itself uses the internal-token guard, not this.
    app.decorate('authenticate', async () => {});

    const fakeService = { logAiUsage } as any;
    app.register(async (instance) => {
        await progressRoutes(instance as any, {
            progressService: fakeService,
            internalServiceToken: INTERNAL_TOKEN,
        });
    }, { prefix: '/v1/progress' });

    return app;
}

describe('progress-service /ai-usage — internal-token guard (F35 #12)', () => {
    let app: FastifyInstance;
    let calls: any[];

    beforeAll(async () => {
        calls = [];
        app = buildApp(async (data: any) => {
            calls.push(data);
            return { id: 'log-1', ...data };
        });
        await app.ready();
    });

    afterAll(async () => {
        await app.close();
    });

    beforeEach(() => {
        calls.length = 0;
    });

    it('404s without an X-Internal-Token (handler never runs)', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/progress/ai-usage',
            payload: VALID_BODY,
        });
        expect(res.statusCode).toBe(404);
        expect(calls).toHaveLength(0); // sink was never reached
    });

    it('404s with a wrong X-Internal-Token (handler never runs)', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/progress/ai-usage',
            headers: { 'x-internal-token': 'wrong-token' },
            payload: VALID_BODY,
        });
        expect(res.statusCode).toBe(404);
        expect(calls).toHaveLength(0);
    });

    it('reaches the handler (201) with the correct X-Internal-Token, incl. costUsd/model', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/progress/ai-usage',
            headers: { 'x-internal-token': INTERNAL_TOKEN },
            payload: VALID_BODY,
        });
        expect(res.statusCode).toBe(201);
        expect(calls).toHaveLength(1);
        expect(calls[0].userId).toBe(VALID_BODY.userId);
        expect(calls[0].totalTokens).toBe(1500);
    });

    it('rejects a malformed body (non-UUID userId) with 400 even when authenticated', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/progress/ai-usage',
            headers: { 'x-internal-token': INTERNAL_TOKEN },
            payload: { ...VALID_BODY, userId: 'not-a-uuid' },
        });
        expect(res.statusCode).toBe(400);
        expect(calls).toHaveLength(0);
    });
});
