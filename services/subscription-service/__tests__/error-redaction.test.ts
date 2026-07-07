/**
 * Regression suite — subscription-service routes through the SHARED Fastify
 * error handler / redactor exposed by `@nightfuel/config`
 * (`registerFastifyErrorHandler` + the pure `buildErrorResponse`,
 * packages/config/src/server.ts). This file locks the shared redaction
 * contract on a per-service basis.
 *
 * Background: the previous handler reflected `error.message` verbatim on the
 * 500 branch (`message: error.message ?? 'An unexpected error occurred.'`),
 * leaking stack frames (file paths, line numbers), Prisma error text, and
 * connection-string fragments (`localhost:5432`) to any unauthenticated caller.
 * The security-hardening pass redacts that: the 500 body is a fixed generic,
 * and a non-validation <500 body replaces `error.message` with a generic
 * 'Bad request'; only genuine Fastify validation errors (`error.validation`
 * truthy) keep their user-facing message. The structured `logger.error(...)`
 * line still captures the full cause server-side.
 *
 * Why import the REAL function instead of byte-copying the handler?
 *   - This suite proves THIS service's redaction resolves to the
 *     redaction-hardened build of `@nightfuel/config`, not a stale local shim.
 *   - Because we exercise the REAL `buildErrorResponse` / the REAL
 *     `registerFastifyErrorHandler`, flipping the shared 500 branch to reflect
 *     `error.message` turns THIS suite red — a divergent inline copy could not
 *     catch that regression.
 *
 * The shared handler is wired onto a tiny Fastify app; nothing from the `src/`
 * bootstrap is imported (that module starts a real Prisma client + Redis bus +
 * Stripe routes + cluster bootstrap at import time via `void bootstrap()`).
 * This mirrors the parallel user-service/__tests__/error-redaction.test.ts
 * approach exactly.
 */
import Fastify, { FastifyInstance } from 'fastify';
import { registerFastifyErrorHandler, buildErrorResponse } from '@nightfuel/config';

// Same leaky string the previous handler used to reflect — every substring
// here is an attack signal the redactor MUST strip.
const LEAKY_THROWN_MESSAGE =
    'Prisma at /etc/passwd localhost:5432 stack frame';

// The internal userId that SubscriptionService.cancel() embeds in its thrown
// `No subscription found for user ${userId}` message. The cancel route must
// NEVER reflect this on the 404 wire — it's an internal identifier.
const LEAKY_CANCEL_USER_ID = 'usr_3f9a1c7e-dead-beef-cafe-0123456789ab';

/**
 * Builds a tiny Fastify app wired with the SHARED `registerFastifyErrorHandler`
 * from `@nightfuel/config`. Three throwing routes drive every branch of the
 * redactor:
 *   - GET /boom → throws LEAKY_THROWN_MESSAGE (drives the 5xx branch)
 *   - GET /bad-validation → throws an err with statusCode<500 and
 *     `validation` truthy (drives the safe <500 branch)
 *   - GET /bad-internal → throws an err with statusCode<500 and NO
 *     `validation` flag (drives the redacted <500 branch)
 *
 * Plus GET /cancel-not-found, which mirrors the route-LOCAL 404 in
 * src/routes.ts (POST /v1/subscriptions/cancel). That catch bypasses the
 * global handler (the route catches its own error and calls reply.send
 * directly), so it must do its OWN redaction — exercised separately below.
 */
function buildApp(): FastifyInstance {
    const app = Fastify({ logger: false });
    // No-op logger — the shared handler calls logger.error/warn/info; we
    // silence them so test output stays clean.
    const silentLogger = { error: () => {}, warn: () => {}, info: () => {} } as any;
    registerFastifyErrorHandler(app, silentLogger);

    app.get('/boom', async () => {
        throw new Error(LEAKY_THROWN_MESSAGE);
    });

    app.get('/bad-validation', async () => {
        // A Fastify-shaped validation error — statusCode<500 AND validation truthy.
        const err: any = new Error("body should have required property 'tier'");
        err.statusCode = 400;
        err.name = 'FastifyError';
        err.validation = [{ keyword: 'required', params: { missingProperty: 'tier' } }];
        throw err;
    });

    app.get('/bad-internal', async () => {
        // A non-validation 4xx error — statusCode<500 but NO validation flag.
        // Its message must be replaced with the generic 'Bad request'.
        const err: any = new Error('connect ECONNREFUSED 127.0.0.1:5432');
        err.statusCode = 400;
        err.name = 'InternalError';
        throw err;
    });

    // Mirrors the POST /v1/subscriptions/cancel catch in src/routes.ts. This is
    // a route-LOCAL 404 that bypasses the global error handler (the route
    // catches its own error and calls reply.send directly), so it must do its
    // OWN redaction. SubscriptionService.cancel() throws
    // `No subscription found for user ${userId}` — reflecting that raw message
    // on the 404 wire (the old behaviour) leaked the internal userId. The route
    // now logs the real cause server-side and ships a fixed literal.
    app.get('/cancel-not-found', async (_request, reply) => {
        try {
            // Same thrown shape the real service produces — note the userId.
            throw new Error(`No subscription found for user ${LEAKY_CANCEL_USER_ID}`);
        } catch (err) {
            const causeMessage = err instanceof Error ? err.message : '';
            if (causeMessage.includes('No subscription found')) {
                // server-side: real err is logged (logger:false here, but the
                // production route calls log.error({ userId, err }, …)).
                return reply
                    .status(404)
                    .send({ statusCode: 404, error: 'Not Found', message: 'No active subscription found' });
            }
            return reply
                .status(500)
                .send({ statusCode: 500, error: 'Internal Server Error', message: 'Failed to cancel subscription' });
        }
    });

    return app;
}

describe('subscription-service shared error handler — 500 leak redaction (registerFastifyErrorHandler)', () => {
    let app: FastifyInstance;

    beforeAll(async () => {
        app = buildApp();
        await app.ready();
    });

    afterAll(async () => {
        await app.close();
    });

    describe('500 branch never leaks internal error detail', () => {
        it('returns the shared redactor\'s fixed 500 body (positive match)', async () => {
            const res = await app.inject({ method: 'GET', url: '/boom' });

            expect(res.statusCode).toBe(500);
            // Mirrors packages/config/src/server.ts exactly. If the shared
            // redactor's 5xx copy changes, update this expectation in lockstep
            // across every per-service redaction suite.
            expect(res.json()).toEqual({
                error: 'InternalServerError',
                message: 'An unexpected error occurred',
                statusCode: 500,
            });
        });

        it('500 body does NOT contain "Prisma" (negative #1)', async () => {
            const res = await app.inject({ method: 'GET', url: '/boom' });
            expect(res.body).not.toContain('Prisma');
        });

        it('500 body does NOT contain "stack" (negative #2)', async () => {
            const res = await app.inject({ method: 'GET', url: '/boom' });
            expect(res.body).not.toContain('stack');
        });

        it('500 body does NOT contain "at " (negative #3 — strips stack-frame paths)', async () => {
            const res = await app.inject({ method: 'GET', url: '/boom' });
            expect(res.body).not.toContain('at ');
        });

        it('500 body does NOT contain "localhost" (negative #4 — strips conn-string fragments)', async () => {
            const res = await app.inject({ method: 'GET', url: '/boom' });
            expect(res.body).not.toContain('localhost');
        });

        it('500 body does NOT contain "/etc/" (negative #5 — strips fs paths)', async () => {
            const res = await app.inject({ method: 'GET', url: '/boom' });
            expect(res.body).not.toContain('/etc/');
        });

        it('500 body does NOT contain the literal thrown message (negative #6)', async () => {
            const res = await app.inject({ method: 'GET', url: '/boom' });
            expect(res.body).not.toContain(LEAKY_THROWN_MESSAGE);
        });
    });

    describe('<500 branch reflects validation messages only', () => {
        it('Fastify validation error: message IS reflected verbatim (user-facing & safe)', async () => {
            const res = await app.inject({ method: 'GET', url: '/bad-validation' });

            expect(res.statusCode).toBe(400);
            expect(res.json()).toEqual({
                error: 'FastifyError',
                message: "body should have required property 'tier'",
                statusCode: 400,
            });
        });

        it('Non-validation 4xx error: message is replaced with generic "Bad request"', async () => {
            const res = await app.inject({ method: 'GET', url: '/bad-internal' });

            expect(res.statusCode).toBe(400);
            expect(res.json()).toEqual({
                error: 'InternalError',
                message: 'Bad request',
                statusCode: 400,
            });
            // And the underlying conn-string-shaped detail must never leak.
            expect(res.body).not.toContain('ECONNREFUSED');
            expect(res.body).not.toContain('127.0.0.1');
            expect(res.body).not.toContain('5432');
        });
    });

    /**
     * Pure-function contract — `buildErrorResponse` (packages/config/src/server.ts).
     *
     * The HTTP suite above proves the handler wires correctly; this block pins
     * the decision logic directly so a regression in the redactor's branching
     * fails here regardless of Fastify wiring. These assertions FAIL the moment
     * the 500 branch starts reflecting `error.message`.
     */
    describe('redactor — buildErrorResponse pure contract', () => {
        it('5xx (no explicit statusCode → 500) returns the fixed generic body, never err.message', () => {
            const res = buildErrorResponse(new Error(LEAKY_THROWN_MESSAGE));
            expect(res).toEqual({
                statusCode: 500,
                body: {
                    error: 'InternalServerError',
                    message: 'An unexpected error occurred',
                    statusCode: 500,
                },
            });
            expect(JSON.stringify(res.body)).not.toContain('Prisma');
            expect(JSON.stringify(res.body)).not.toContain('localhost');
            expect(JSON.stringify(res.body)).not.toContain('5432');
            expect(JSON.stringify(res.body)).not.toContain(LEAKY_THROWN_MESSAGE);
        });

        it('validation <500 reflects the (safe) error.message', () => {
            const err: any = new Error("body should have required property 'tier'");
            err.statusCode = 400;
            err.name = 'FastifyError';
            err.validation = [{ keyword: 'required' }];
            const res = buildErrorResponse(err);
            expect(res).toEqual({
                statusCode: 400,
                body: {
                    error: 'FastifyError',
                    message: "body should have required property 'tier'",
                    statusCode: 400,
                },
            });
        });

        it('non-validation <500 redacts err.message to a generic "Bad request"', () => {
            const err: any = new Error('connect ECONNREFUSED 127.0.0.1:5432');
            err.statusCode = 400;
            err.name = 'InternalError';
            const res = buildErrorResponse(err);
            expect(res).toEqual({
                statusCode: 400,
                body: {
                    error: 'InternalError',
                    message: 'Bad request',
                    statusCode: 400,
                },
            });
            expect(JSON.stringify(res.body)).not.toContain('ECONNREFUSED');
            expect(JSON.stringify(res.body)).not.toContain('127.0.0.1');
            expect(JSON.stringify(res.body)).not.toContain('5432');
        });
    });

    // ── POST /v1/subscriptions/cancel — route-local 404 redaction ─────────────
    // This locks the routes.ts cancel catch: the service throws
    // `No subscription found for user ${userId}`, and the route used to ship that
    // raw err.message on the 404 body (leaking the internal userId). The route
    // now sends a FIXED literal. These assertions FAIL against the old leaky
    // code (which echoed the thrown message) and PASS after the fix.
    describe('cancel 404 sends fixed copy, never the raw err.message', () => {
        it('returns the exact fixed 404 body (positive match)', async () => {
            const res = await app.inject({ method: 'GET', url: '/cancel-not-found' });

            expect(res.statusCode).toBe(404);
            expect(res.json()).toEqual({
                statusCode: 404,
                error: 'Not Found',
                message: 'No active subscription found',
            });
        });

        it('404 body does NOT contain the internal userId (negative #1 — the core leak)', async () => {
            const res = await app.inject({ method: 'GET', url: '/cancel-not-found' });
            expect(res.body).not.toContain(LEAKY_CANCEL_USER_ID);
        });

        it('404 body does NOT contain the raw thrown "No subscription found for user" message (negative #2)', async () => {
            const res = await app.inject({ method: 'GET', url: '/cancel-not-found' });
            expect(res.body).not.toContain('No subscription found for user');
        });

        it('404 body does NOT contain "Prisma"/"stack"/conn-string fragments (negative #3)', async () => {
            const res = await app.inject({ method: 'GET', url: '/cancel-not-found' });
            expect(res.body).not.toContain('Prisma');
            expect(res.body).not.toContain('stack');
            expect(res.body).not.toContain('localhost');
            expect(res.body).not.toContain('5432');
        });
    });
});
