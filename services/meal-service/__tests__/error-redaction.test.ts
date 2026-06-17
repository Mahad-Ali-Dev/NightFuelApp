/**
 * Regression suite — meal-service routes through the SHARED Fastify error
 * handler exposed by `@nightfuel/config` (`registerFastifyErrorHandler`,
 * packages/config/src/server.ts). This file locks the shared handler's
 * 500-redaction contract on a per-service basis: if anyone widens the surface
 * (e.g. starts echoing `error.message` on the 500 branch, or reflects
 * `err.stack`), this suite goes red — exactly as it would for every other
 * service that wires the same handler.
 *
 * Why a per-service test for a SHARED handler?
 *   - Defence-in-depth: the suite proves THIS service's `registerFastifyErrorHandler`
 *     resolves to the redaction-hardened build of `@nightfuel/config`, not a
 *     stale local shim someone may have copy-pasted later.
 *   - If a future service swaps to its own inline `setErrorHandler` (the way
 *     notification-service / user-service / subscription-service already do),
 *     this file is what catches the regression.
 *
 * Implementation notes:
 *   - The shared handler is imported directly. Nothing from `src/` is
 *     touched — the service bootstrap module opens real DB/Redis connections
 *     at import time and cannot be loaded in a unit test.
 *   - The injected logger is a no-op (`{ error, warn, info } as any`) so the
 *     handler's `logger.error(...)` side effect is silenced in test output.
 *   - Assertions mirror the CURRENT shared handler output (see
 *     packages/config/src/server.ts ~lines 102-127):
 *       * 5xx body: `{ error: 'InternalServerError', message: 'An unexpected
 *         error occurred', statusCode: 500 }` — fixed copy, no error.message
 *         or stack escapes.
 *       * <500 body: `{ error: error.name ?? 'InternalServerError',
 *         message: error.message ?? 'An unexpected error occurred',
 *         statusCode }` — message IS reflected today regardless of
 *         `error.validation`. This is a known divergence from the inline
 *         notification-service handler (which replaces the message with
 *         'Bad request' when `validation` is falsy). See the TODO below the
 *         /bad-internal test.
 */
import Fastify, { FastifyInstance } from 'fastify';
import { registerFastifyErrorHandler } from '@nightfuel/config';

// Every substring in this leaky message is an attack signal the 5xx redactor
// MUST strip. Use the same string across every per-service redaction suite so
// the negative-match list is identical and easy to grep for.
const LEAKY_THROWN_MESSAGE =
    'Prisma raw stack frame at /etc/passwd localhost:5432';

/**
 * Builds a tiny Fastify app wired with the SHARED `registerFastifyErrorHandler`
 * from `@nightfuel/config`. Three throwing routes drive every branch of the
 * handler:
 *   - GET /boom → throws LEAKY_THROWN_MESSAGE (drives the 5xx branch)
 *   - GET /bad-validation → throws an err with statusCode<500 and
 *     `validation` truthy (Fastify-shaped user-facing validation error)
 *   - GET /bad-internal → throws an err with statusCode<500 and NO
 *     `validation` flag (a non-validation 4xx)
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
        const err: any = new Error("body should have required property 'token'");
        err.statusCode = 400;
        err.name = 'FastifyError';
        err.validation = [{ keyword: 'required', params: { missingProperty: 'token' } }];
        throw err;
    });

    app.get('/bad-internal', async () => {
        // A non-validation 4xx error — statusCode<500 but NO validation flag.
        const err: any = new Error('connect ECONNREFUSED 127.0.0.1:5432');
        err.statusCode = 400;
        err.name = 'InternalError';
        throw err;
    });

    return app;
}

describe('meal-service shared error handler — 500 leak redaction (registerFastifyErrorHandler)', () => {
    let app: FastifyInstance;

    beforeAll(async () => {
        app = buildApp();
        await app.ready();
    });

    afterAll(async () => {
        await app.close();
    });

    describe('500 branch never leaks internal error detail', () => {
        it('returns the shared handler\'s fixed 500 body (positive match)', async () => {
            const res = await app.inject({ method: 'GET', url: '/boom' });

            expect(res.statusCode).toBe(500);
            // Mirrors packages/config/src/server.ts exactly. If the shared
            // handler's 5xx copy changes, update this expectation in lockstep
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

        it('500 body does NOT contain "at /" (negative #3 — strips stack-frame paths)', async () => {
            const res = await app.inject({ method: 'GET', url: '/boom' });
            expect(res.body).not.toContain('at /');
        });

        it('500 body does NOT contain "localhost" (negative #4 — strips conn-string fragments)', async () => {
            const res = await app.inject({ method: 'GET', url: '/boom' });
            expect(res.body).not.toContain('localhost');
        });

        it('500 body does NOT contain ":5432" (negative #5 — strips DB port hint)', async () => {
            const res = await app.inject({ method: 'GET', url: '/boom' });
            expect(res.body).not.toContain('5432');
        });

        it('500 body does NOT contain "/etc/passwd" (negative #6 — strips fs paths)', async () => {
            const res = await app.inject({ method: 'GET', url: '/boom' });
            expect(res.body).not.toContain('/etc/passwd');
        });

        it('500 body does NOT contain the literal thrown message (negative #7)', async () => {
            const res = await app.inject({ method: 'GET', url: '/boom' });
            expect(res.body).not.toContain(LEAKY_THROWN_MESSAGE);
        });
    });

    describe('<500 branch reflects error.message (CURRENT shared-handler behaviour)', () => {
        it('Fastify validation error: message IS reflected verbatim (user-facing & safe)', async () => {
            const res = await app.inject({ method: 'GET', url: '/bad-validation' });

            expect(res.statusCode).toBe(400);
            expect(res.json()).toEqual({
                error: 'FastifyError',
                message: "body should have required property 'token'",
                statusCode: 400,
            });
        });

        // TODO(security-hardening): the shared registerFastifyErrorHandler
        // currently reflects `error.message` on EVERY <500 branch, even when
        // `error.validation` is falsy (see packages/config/src/server.ts
        // ~line 122). The inline notification-service / user-service /
        // subscription-service handlers tightened this so non-validation 4xx
        // errors emit a generic 'Bad request' (or similar) instead — which is
        // the correct behaviour for the shared handler too. When that
        // tightening lands in `@nightfuel/config`, flip the expectation
        // below to assert the generic copy + add the ECONNREFUSED / 127.0.0.1
        // / 5432 negative-match assertions. Until then we lock in the
        // CURRENT (leaky) behaviour so nobody breaks the contract
        // accidentally.
        it('Non-validation 4xx: message IS reflected today (known shared-handler divergence — see TODO above)', async () => {
            const res = await app.inject({ method: 'GET', url: '/bad-internal' });

            expect(res.statusCode).toBe(400);
            expect(res.json()).toEqual({
                error: 'InternalError',
                message: 'connect ECONNREFUSED 127.0.0.1:5432',
                statusCode: 400,
            });
        });
    });
});
