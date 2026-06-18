/**
 * Production-wiring suite — plan-service `GET /v1/plans/history` (src/routes.ts)
 * built on a Fastify instance wired EXACTLY like src/index.ts AND additionally
 * registering the SHARED `registerFastifyErrorHandler` from `@nightfuel/config`.
 *
 * Why this sibling exists (the gap history.routes.test.ts leaves open):
 *   history.routes.test.ts wires the Zod compilers + @fastify/jwt + the
 *   `authenticate` decorator and proves the 200 / 400 / 401 contracts — but it
 *   does NOT register the shared error handler, and its getPlanHistory stub
 *   returns []. So the REDACTED-5xx contract (a handler throw must surface as a
 *   generic body that leaks NO raw error text / stack / connection-string hints)
 *   was never proven end-to-end through this route. This suite closes that gap
 *   and additionally proves the schema-400 short-circuits BEFORE any handler /
 *   error-handler code runs.
 *
 * IMPORTANT — where the redaction actually happens for THIS route (verified
 * empirically, not assumed):
 *   The `/history` handler in src/routes.ts wraps its body in its own
 *   `try/catch`: on a throw it logs `logger.error(err)` server-side and replies
 *   `reply.code(500).send({ error: 'An unexpected error occurred' })`. Because
 *   the throw is caught INSIDE the handler, it never propagates to Fastify's
 *   `setErrorHandler`, so for this particular route the redacted 5xx body is the
 *   route's own fixed `{ error: 'An unexpected error occurred' }`, NOT the shared
 *   handler's `{ error, message, statusCode }` shape. The shared handler is still
 *   registered here (mirroring src/index.ts + error-redaction.test.ts) so that:
 *     (a) the suite proves THIS service resolves the redaction-hardened build of
 *         `@nightfuel/config` (defence-in-depth, same rationale as
 *         error-redaction.test.ts), and
 *     (b) if the route's local catch is ever removed and the throw is allowed to
 *         propagate, the shared handler emits its own redacted body and this
 *         suite STAYS green — both legitimate redacted shapes are accepted below.
 *
 *   The load-bearing security assertion is therefore the negative-match list
 *   (mirrored verbatim from error-redaction.test.ts): regardless of WHICH layer
 *   redacts, the 5xx body must contain none of the leaky substrings from the
 *   thrown Error. If anyone ever makes either layer echo `err.message` /
 *   `err.stack`, those negative matches go red.
 *
 * IMPORTANT — the reversed-range 400 body also diverges under the shared handler
 * (verified empirically): fastify-type-provider-zod throws a ZodError that does
 * NOT set Fastify's `error.validation` flag, so the shared handler routes it
 * through its non-validation 4xx branch and REDACTS the issue detail to a fixed
 * `{ error: 'ZodError', message: 'Bad request', statusCode: 400 }`. The raw
 * `path: ['end']` JSON only reaches the client under Fastify's DEFAULT validation
 * handler (the wiring history.routes.test.ts uses, with NO shared handler). The
 * (b) tests below therefore accept BOTH shapes; the LOAD-BEARING short-circuit
 * proof — status 400 AND getPlanHistory never called — holds identically in both
 * wirings.
 *
 * DB/Redis-free: PlanService is a minimal stub with only `getPlanHistory`
 * (the single method the history route touches), a jest.fn() whose throw is
 * configured per test. babel-jest TS transpile + @jest/globals work exactly as
 * in the sibling suites (jest.config.js).
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import fastifyJwt from '@fastify/jwt';
import { registerFastifyErrorHandler, sendUnauthorized } from '@nightfuel/config';
import jwt from 'jsonwebtoken';
import { planRoutes } from '../src/routes';
import type { PlanService } from '../src/plan.service';

// Satisfies the service's JWT_SECRET.min(32) contract.
const JWT_SECRET = 'test-secret-of-at-least-32-chars-long';

const USER_ID = '11111111-1111-1111-1111-111111111111';

// No-op logger — both the route's `logger.error(err)` and the shared handler's
// `logger.error(...)` write the REAL error server-side (correct behaviour, never
// weakened); we silence them so test output stays clean. Mirrors the
// silentLogger in error-redaction.test.ts.
const silentLogger = { error: () => {}, warn: () => {}, info: () => {} } as any;

// The single leaky message a thrown DB/Prisma error might carry. Every substring
// is an attack signal the redactor MUST strip. Kept byte-for-byte identical to
// error-redaction.test.ts so the negative-match list is the same and greppable.
const LEAKY_THROWN_MESSAGE = 'Prisma raw stack frame at /etc/passwd localhost:5432';

// The two LEGITIMATE redacted 5xx bodies (see header). Whichever layer redacts,
// the body must deep-equal one of these — neither contains any leaky token.
//   - ROUTE_LOCAL_CATCH_BODY: emitted today by the /history handler's own catch.
//   - SHARED_HANDLER_BODY: emitted if the throw is ever allowed to propagate to
//     registerFastifyErrorHandler (packages/config/src/server.ts).
const ROUTE_LOCAL_CATCH_BODY = { error: 'An unexpected error occurred' };
const SHARED_HANDLER_BODY = {
    error: 'InternalServerError',
    message: 'An unexpected error occurred',
    statusCode: 500,
};

type MockPlanService = {
    getPlanHistory: ReturnType<typeof jest.fn>;
};

// Only the method GET /history calls is stubbed; the route touches no other
// PlanService method, so this minimal stub keeps the harness DB/Redis-free.
function makeMockPlanService(): MockPlanService {
    return {
        getPlanHistory: jest.fn(() => Promise.resolve([] as unknown)),
    };
}

/**
 * Build a fresh app wired exactly like src/index.ts (minus the real DB/Redis):
 * Zod compilers, @fastify/jwt, the shared `registerFastifyErrorHandler`, the
 * `authenticate` decorator delegating to `sendUnauthorized`, and the planRoutes
 * plugin mounted at the production `/v1/plans` prefix.
 */
async function buildApp(planService: MockPlanService): Promise<FastifyInstance> {
    const app = Fastify({ logger: false });
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    await app.register(fastifyJwt, { secret: JWT_SECRET });
    // The production wiring this suite is proving: the SHARED error handler is
    // registered (mirrors src/index.ts + error-redaction.test.ts).
    registerFastifyErrorHandler(app, silentLogger);
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

describe('plan-service GET /v1/plans/history — production error-handler wiring', () => {
    let app: FastifyInstance;
    let planService: MockPlanService;

    beforeEach(async () => {
        planService = makeMockPlanService();
        app = await buildApp(planService);
    });

    afterEach(async () => {
        await app.close();
    });

    describe('(a) a handler throw surfaces as a REDACTED 5xx with no raw error/stack', () => {
        // Configure the service to throw a leaky DB-style Error on a valid,
        // authenticated, in-range request, so the ONLY reason for the 5xx is the
        // handler throw (auth passed, schema passed).
        beforeEach(() => {
            planService.getPlanHistory.mockImplementationOnce(() => {
                throw new Error(LEAKY_THROWN_MESSAGE);
            });
        });

        async function injectBoom() {
            return app.inject({
                method: 'GET',
                url: '/v1/plans/history?start=2026-06-01&end=2026-06-30',
                headers: { authorization: `Bearer ${validToken()}` },
            });
        }

        it('responds 5xx and the body is one of the two legitimate redacted shapes', async () => {
            const res = await injectBoom();

            expect(res.statusCode).toBeGreaterThanOrEqual(500);
            // The redaction may come from the route's local catch (today) or the
            // shared handler (if that catch is ever removed). Either is correct;
            // both are leak-free. Asserting deep-equality against the legitimate
            // shapes — not merely "is a 5xx" — is the load-bearing positive match:
            // it goes red the instant a layer echoes err.message / err.stack.
            const body = res.json();
            const matchesRoute = JSON.stringify(body) === JSON.stringify(ROUTE_LOCAL_CATCH_BODY);
            const matchesShared = JSON.stringify(body) === JSON.stringify(SHARED_HANDLER_BODY);
            expect(matchesRoute || matchesShared).toBe(true);

            // The service WAS reached (auth + schema passed) — the 5xx is the
            // throw, not a short-circuit. Distinguishes this from the 400/401 paths.
            expect(planService.getPlanHistory).toHaveBeenCalledTimes(1);
        });

        // Negative-match list — mirrored verbatim from error-redaction.test.ts.
        // These are the real security contract: the redacted 5xx body must carry
        // none of the leaky substrings from LEAKY_THROWN_MESSAGE, no matter which
        // layer produced it.
        it('5xx body does NOT contain "Prisma" (negative #1)', async () => {
            const res = await injectBoom();
            expect(res.body).not.toContain('Prisma');
        });

        it('5xx body does NOT contain "stack" (negative #2)', async () => {
            const res = await injectBoom();
            expect(res.body).not.toContain('stack');
        });

        it('5xx body does NOT contain "at /" (negative #3 — strips stack-frame paths)', async () => {
            const res = await injectBoom();
            expect(res.body).not.toContain('at /');
        });

        it('5xx body does NOT contain "localhost" (negative #4 — strips conn-string fragments)', async () => {
            const res = await injectBoom();
            expect(res.body).not.toContain('localhost');
        });

        it('5xx body does NOT contain "5432" (negative #5 — strips DB port hint)', async () => {
            const res = await injectBoom();
            expect(res.body).not.toContain('5432');
        });

        it('5xx body does NOT contain "/etc/passwd" (negative #6 — strips fs paths)', async () => {
            const res = await injectBoom();
            expect(res.body).not.toContain('/etc/passwd');
        });

        it('5xx body does NOT contain the literal thrown message (negative #7)', async () => {
            const res = await injectBoom();
            expect(res.body).not.toContain(LEAKY_THROWN_MESSAGE);
        });
    });

    describe('(b) a reversed range is rejected by the REAL bounded schema BEFORE the handler runs', () => {
        // Arm getPlanHistory to throw the leaky Error on EVERY call. The point of
        // criterion (b) is that schema validation short-circuits the request
        // BEFORE the handler body runs — so this throw must NEVER fire on the
        // reversed-range path. If validation ever stopped short-circuiting, the
        // handler would run, this throw would surface, and `not.toHaveBeenCalled`
        // would fail loudly.
        beforeEach(() => {
            planService.getPlanHistory.mockImplementation(() => {
                throw new Error(LEAKY_THROWN_MESSAGE);
            });
        });

        async function injectReversed() {
            return app.inject({
                method: 'GET',
                url: '/v1/plans/history?start=2026-06-30&end=2026-06-01',
                headers: { authorization: `Bearer ${validToken()}` },
            });
        }

        it('responds 400 and the service is NEVER called (validation short-circuits the handler + error handler)', async () => {
            const res = await injectReversed();

            // The cross-field refine in the REAL getPlanHistoryQuerySchema (the
            // bounded schema src/routes.ts imports) rejects start>end at the API
            // boundary.
            expect(res.statusCode).toBe(400);

            // The load-bearing short-circuit proof: the reversed range is rejected
            // at the schema boundary, so the handler body never runs — the service
            // is never queried and the armed throw never fires. This is exactly
            // what proves validation precedes both the handler's local catch AND
            // the shared error handler.
            expect(planService.getPlanHistory).not.toHaveBeenCalled();
        });

        it('reports the reversed range on path ["end"] (or, under the shared handler, the redacted 400 body)', async () => {
            const res = await injectReversed();
            expect(res.statusCode).toBe(400);

            const body = res.json() as any;

            // IMPORTANT — production divergence (verified empirically): with the
            // SHARED registerFastifyErrorHandler registered (as src/index.ts does),
            // the fastify-type-provider-zod ZodError does NOT carry Fastify's
            // `error.validation` flag, so the shared handler routes it through its
            // non-validation 4xx branch and REDACTS the issue detail to a fixed
            //   { error: 'ZodError', message: 'Bad request', statusCode: 400 }.
            // The raw `path: ['end']` JSON therefore only reaches the client under
            // Fastify's DEFAULT validation handler (the wiring history.routes.test.ts
            // uses, with NO shared handler). Accept BOTH: assert the ['end'] path
            // when the issues survive (default-handler wiring), else assert the
            // exact redacted shape (shared-handler wiring — the case this suite
            // exercises). Either way the range was rejected as a 400.
            let parsedIssues: Array<{ path: unknown[] }> | null = null;
            if (typeof body.message === 'string') {
                try {
                    const maybe = JSON.parse(body.message);
                    if (Array.isArray(maybe)) parsedIssues = maybe as Array<{ path: unknown[] }>;
                } catch {
                    // body.message is the redacted 'Bad request' string, not JSON.
                    parsedIssues = null;
                }
            }

            if (parsedIssues) {
                // Default-handler wiring: the offending path is exactly ['end'].
                expect(
                    parsedIssues.some(
                        (i) => Array.isArray(i.path) && i.path.length === 1 && i.path[0] === 'end'
                    )
                ).toBe(true);
            } else {
                // Shared-handler wiring (this suite): the issue detail is redacted
                // to the fixed non-validation-4xx body. No raw schema text leaks.
                expect(body).toEqual({ error: 'ZodError', message: 'Bad request', statusCode: 400 });
            }
        });
    });
});
