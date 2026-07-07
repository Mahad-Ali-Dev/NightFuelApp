/**
 * Suite — plan-service `GET /v1/plans/history` (src/routes.ts), the read path
 * behind the mobile "Plan History" list.
 *
 * The endpoint takes an OPTIONAL bounded `{ start, end }` date range (added for
 * P1 SECURITY CONSISTENCY so the aggregation endpoints are uniform with
 * shift-service / progress-service). Two contracts are locked here:
 *
 *   1. NO-PARAMS behaviour is unchanged. `GET /history` with no querystring
 *      still returns 200 and still calls PlanService.getPlanHistory exactly
 *      once — the server-side take:30 cap (asserted in plan.service unit
 *      coverage) is preserved because the route threads an empty range through.
 *
 *   2. A REVERSED range is rejected at the API boundary. `?start=2026-06-30&
 *      end=2026-06-01` fails the shared `isValidDateRange` cross-field guard and
 *      returns a 400 whose error is reported on `path: ['end']` — the field a
 *      client would adjust. The service is NEVER reached on the invalid path.
 *
 * The genuine `planRoutes` plugin is registered on a fresh Fastify instance
 * wired exactly like src/index.ts (fastify-type-provider-zod compilers +
 * @fastify/jwt + the `authenticate` decorator that delegates to
 * `sendUnauthorized`), so the route schemas validate and the auth gate is real.
 * PlanService is a lightweight stub — only the methods the history route touches
 * are present; getPlanHistory is a jest.fn() returning [] so the suite needs no
 * DB/Redis.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import fastifyJwt from '@fastify/jwt';
import { sendUnauthorized } from '@nightfuel/config';
import jwt from 'jsonwebtoken';
import { planRoutes } from '../src/routes';
import type { PlanService } from '../src/plan.service';

// Satisfies the service's JWT_SECRET.min(32) contract.
const JWT_SECRET = 'test-secret-of-at-least-32-chars-long';

const USER_ID = '11111111-1111-1111-1111-111111111111';

type MockPlanService = {
    getPlanHistory: ReturnType<typeof jest.fn>;
};

// Only the method exercised by GET /history is stubbed; the route never calls
// any other PlanService method, so a minimal stub keeps the harness DB-free.
function makeMockPlanService(): MockPlanService {
    return {
        getPlanHistory: jest.fn(() => Promise.resolve([] as unknown)),
    };
}

/**
 * Build a fresh app wired exactly like src/index.ts (minus the real DB/Redis):
 * Zod compilers, @fastify/jwt, the `authenticate` decorator, and the planRoutes
 * plugin mounted at the production `/v1/plans` prefix.
 */
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
            await planRoutes(instance, { planService: planService as unknown as PlanService });
        },
        { prefix: '/v1/plans' }
    );
    await app.ready();
    return app;
}

function validToken(userId: string = USER_ID): string {
    return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '1h' });
}

describe('plan-service GET /v1/plans/history', () => {
    let app: FastifyInstance;
    let planService: MockPlanService;

    beforeEach(async () => {
        planService = makeMockPlanService();
        app = await buildApp(planService);
    });

    afterEach(async () => {
        await app.close();
    });

    it('returns 200 and calls getPlanHistory once when no range params are supplied (unchanged behaviour)', async () => {
        const res = await app.inject({
            method: 'GET',
            url: '/v1/plans/history',
            headers: { authorization: `Bearer ${validToken()}` },
        });

        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual([]);

        // The no-params call still reaches the service exactly once — the
        // server-side take:30 cap is preserved.
        expect(planService.getPlanHistory).toHaveBeenCalledTimes(1);
        // Scoped to the verified JWT identity, never a client-supplied id.
        expect(planService.getPlanHistory.mock.calls[0][0]).toBe(USER_ID);
    });

    it('rejects a reversed range (start after end) with a 400 reported on path ["end"] and never reaches the service', async () => {
        const res = await app.inject({
            method: 'GET',
            url: '/v1/plans/history?start=2026-06-30&end=2026-06-01',
            headers: { authorization: `Bearer ${validToken()}` },
        });

        expect(res.statusCode).toBe(400);

        // The cross-field guard attaches its message to the `end` field so the
        // client surfaces it where it would adjust. With the default Fastify
        // validation handler, fastify-type-provider-zod serialises the ZodError
        // issues into `message` as a JSON string; parse it back and assert the
        // offending path is exactly ['end'] (not merely that 'end' appears in
        // the error copy).
        const body = res.json() as any;
        const issues = JSON.parse(body.message) as Array<{ path: unknown[] }>;
        expect(Array.isArray(issues)).toBe(true);
        expect(issues.some((i) => Array.isArray(i.path) && i.path.length === 1 && i.path[0] === 'end')).toBe(true);

        // The invalid range must be rejected at the boundary — the service is
        // never queried.
        expect(planService.getPlanHistory).not.toHaveBeenCalled();
    });

    it('requires a valid Bearer token — 401 and the service is never queried', async () => {
        const res = await app.inject({
            method: 'GET',
            url: '/v1/plans/history',
        });

        expect(res.statusCode).toBe(401);
        expect(planService.getPlanHistory).not.toHaveBeenCalled();
    });
});
