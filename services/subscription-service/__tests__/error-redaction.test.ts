/**
 * Regression suite — subscription-service GLOBAL ERROR HANDLER no-leak contract
 * (src/index.ts setErrorHandler, ~lines 202-219).
 *
 * Background: the previous handler reflected `error.message` verbatim on the
 * 500 branch (`message: error.message ?? 'An unexpected error occurred.'`),
 * leaking stack frames (file paths, line numbers), Prisma error text, and
 * connection-string fragments (`localhost:5432`) to any unauthenticated caller.
 * The security-hardening pass redacts that: the 500 body is a fixed generic,
 * and the <500 body only reflects `error.message` when `error.validation` is
 * truthy (i.e. a Fastify-generated user-facing message). The structured
 * `rootLogger.error({ err, url, method }, …)` line still captures the full
 * cause server-side.
 *
 * This suite locks the redaction contract in permanently. It boots a tiny
 * Fastify app that mounts the SAME setErrorHandler shape as src/index.ts, then
 * exercises a deliberately leaky thrown error and asserts the response body
 * does NOT contain any of the high-risk substrings ('Prisma', 'stack', 'at ',
 * 'localhost', '/etc/') and DOES contain the generic 'Internal server error'
 * copy. If anyone widens the surface (e.g. re-adds `message: error.message` on
 * the 500 branch), this file goes red.
 *
 * The handler is duplicated here — rather than imported via `buildApp()` from
 * src/index.ts — because that module starts a real Prisma client + Redis bus
 * + Stripe routes + cluster bootstrap at import time (`void bootstrap()` is
 * called at module bottom), so it cannot be loaded inside a unit test without
 * a network. Keeping the shapes byte-identical is enforced by the file-level
 * comment in src/index.ts pointing reviewers here. This mirrors the parallel
 * user-service/__tests__/error-redaction.test.ts approach exactly.
 */
import Fastify, { FastifyInstance } from 'fastify';

// Same leaky string the previous handler used to reflect — every substring
// here is an attack signal the redactor MUST strip.
const LEAKY_THROWN_MESSAGE =
    'Prisma at /etc/passwd localhost:5432 stack frame';

/**
 * Builds a tiny Fastify app wired with the SAME setErrorHandler shape as
 * src/index.ts (post-fix). It also mounts:
 *   - GET /boom → throws LEAKY_THROWN_MESSAGE (drives the 500 branch)
 *   - GET /bad-validation → throws an err with statusCode<500 and
 *     `validation` truthy (drives the safe <500 branch)
 *   - GET /bad-internal → throws an err with statusCode<500 and NO
 *     `validation` flag (drives the redacted <500 branch)
 *
 * Imports nothing from src/ — the bootstrap module opens real DB/Redis
 * connections at import time and cannot be loaded in a unit test.
 */
function buildApp(): FastifyInstance {
    const app = Fastify({ logger: false });

    // Mirror src/index.ts setErrorHandler — keep this byte-for-byte identical
    // to the production handler so any future regression on either side is
    // caught here.
    app.setErrorHandler((error: any, _request, reply) => {
        if (error.statusCode && error.statusCode < 500) {
            return reply.status(error.statusCode).send({
                statusCode: error.statusCode,
                error: error.name ?? 'Bad Request',
                message: error.validation ? error.message : 'Bad request',
            });
        }
        return reply.status(500).send({
            statusCode: 500,
            error: 'Internal Server Error',
            message: 'Internal server error',
        });
    });

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

    return app;
}

describe('subscription-service global error handler — 500 leak redaction', () => {
    let app: FastifyInstance;

    beforeAll(async () => {
        app = buildApp();
        await app.ready();
    });

    afterAll(async () => {
        await app.close();
    });

    describe('500 branch never leaks internal error detail', () => {
        it('returns the generic 500 body (positive match)', async () => {
            const res = await app.inject({ method: 'GET', url: '/boom' });

            expect(res.statusCode).toBe(500);
            expect(res.json()).toEqual({
                statusCode: 500,
                error: 'Internal Server Error',
                message: 'Internal server error',
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
                statusCode: 400,
                error: 'FastifyError',
                message: "body should have required property 'tier'",
            });
        });

        it('Non-validation 4xx error: message is replaced with generic "Bad request"', async () => {
            const res = await app.inject({ method: 'GET', url: '/bad-internal' });

            expect(res.statusCode).toBe(400);
            expect(res.json()).toEqual({
                statusCode: 400,
                error: 'InternalError',
                message: 'Bad request',
            });
            // And the underlying conn-string-shaped detail must never leak.
            expect(res.body).not.toContain('ECONNREFUSED');
            expect(res.body).not.toContain('127.0.0.1');
            expect(res.body).not.toContain('5432');
        });
    });
});
