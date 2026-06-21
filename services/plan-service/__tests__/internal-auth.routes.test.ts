/**
 * Suite — plan-service `GET /v1/plans/internal/active/:userId` (src/routes.ts),
 * the server-to-server-only route meal-service uses to fetch a user's active
 * plan for the grocery list.
 *
 * F34 #5 locks the in-service internal-token guard (makeInternalAuthGuard) wired
 * into planRoutes via `internalServiceToken`:
 *
 *   1. NO X-Internal-Token            -> 404 (route hidden; service NOT reached).
 *   2. WRONG X-Internal-Token         -> 404.
 *   3. CORRECT X-Internal-Token       -> reaches the handler (200 with the plan).
 *
 * The 404 is deliberate (matches the nginx edge): a probe can't tell a guarded
 * internal route from a missing path. The genuine planRoutes plugin is mounted
 * on a fresh Fastify wired like src/index.ts; PlanService is a minimal stub so
 * the suite needs no DB/Redis.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import fastifyJwt from '@fastify/jwt';
import { sendUnauthorized } from '@nightfuel/config';
import { planRoutes } from '../src/routes';
import type { PlanService } from '../src/plan.service';

const JWT_SECRET = 'test-secret-of-at-least-32-chars-long';
const INTERNAL_TOKEN = 'plan-internal-token-value';
const USER_ID = '11111111-1111-1111-1111-111111111111';

type MockPlanService = {
    getPlanByDate: ReturnType<typeof jest.fn>;
};

function makeMockPlanService(): MockPlanService {
    return {
        getPlanByDate: jest.fn(() => Promise.resolve({ id: 'plan-1', userId: USER_ID })),
    };
}

async function buildApp(planService: MockPlanService): Promise<FastifyInstance> {
    const app = Fastify({ logger: false });
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    await app.register(fastifyJwt, { secret: JWT_SECRET });
    app.decorate('authenticate', async (request: any, reply: any) => {
        try {
            await request.jwtVerify();
        } catch (err) {
            return sendUnauthorized(reply, request, err);
        }
    });
    await app.register(
        async (instance) => {
            await planRoutes(instance, {
                planService: planService as unknown as PlanService,
                internalServiceToken: INTERNAL_TOKEN,
            });
        },
        { prefix: '/v1/plans' }
    );
    await app.ready();
    return app;
}

describe('plan-service GET /v1/plans/internal/active/:userId — internal-token guard', () => {
    let app: FastifyInstance;
    let planService: MockPlanService;

    beforeEach(async () => {
        planService = makeMockPlanService();
        app = await buildApp(planService);
    });

    afterEach(async () => {
        await app.close();
    });

    const url = `/v1/plans/internal/active/${USER_ID}?date=2026-06-20`;

    it('404s without an X-Internal-Token header (service never reached)', async () => {
        const res = await app.inject({ method: 'GET', url });
        expect(res.statusCode).toBe(404);
        expect(planService.getPlanByDate).not.toHaveBeenCalled();
    });

    it('404s with a wrong X-Internal-Token (service never reached)', async () => {
        const res = await app.inject({
            method: 'GET',
            url,
            headers: { 'x-internal-token': 'wrong-token' },
        });
        expect(res.statusCode).toBe(404);
        expect(planService.getPlanByDate).not.toHaveBeenCalled();
    });

    it('reaches the handler (200) with the correct X-Internal-Token', async () => {
        const res = await app.inject({
            method: 'GET',
            url,
            headers: { 'x-internal-token': INTERNAL_TOKEN },
        });
        expect(res.statusCode).toBe(200);
        expect(planService.getPlanByDate).toHaveBeenCalledTimes(1);
    });
});
