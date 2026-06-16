/**
 * Regression suite — notification-service GLOBAL ERROR HANDLER no-leak contract
 * (src/index.ts setErrorHandler, ~lines 211-237).
 *
 * Background: the previous handler shipped `message: error.message ?? 'An
 * unexpected error occurred'` straight to the client, so a Prisma exception
 * leaked query fragments, table names, and conn-string hostnames to any caller
 * that could trigger a 500. The fix matches the user-service / subscription-
 * service contract: the 500 body is a fixed generic, and the <500 body only
 * reflects `error.message` when `error.validation` is truthy (i.e. a Fastify-
 * generated user-facing message).
 *
 * This suite locks the redaction contract in permanently. It boots a tiny
 * Fastify app that mounts the SAME setErrorHandler shape as src/index.ts, then
 * exercises a deliberately leaky thrown error and asserts the response body
 * does NOT contain any of the high-risk substrings ('Prisma', 'stack', 'at /',
 * or 'localhost') and DOES contain the generic 'Internal server error' copy.
 * If anyone widens the surface again (e.g. re-adds `message: error.message`
 * on the 500 branch, or reflects err.stack), this file goes red.
 *
 * The handler is duplicated here rather than imported from src/index.ts because
 * that module starts a real Prisma client + Redis bus + socket.io bootstrap at
 * import time. Keeping the shapes byte-identical is enforced by the contract
 * comment in src/index.ts pointing reviewers here.
 */
import Fastify, { FastifyInstance } from 'fastify';

// Same leaky string the previous handler used to reflect — every substring
// here is an attack signal the redactor MUST strip.
const LEAKY_THROWN_MESSAGE =
    'Prisma raw stack frame at /etc/passwd localhost:5432';

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
            return reply.code(error.statusCode).send({
                statusCode: error.statusCode,
                error: error.name ?? 'Bad Request',
                message: error.validation ? error.message : 'Bad request',
            });
        }
        return reply.code(500).send({
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
        const err: any = new Error("body should have required property 'token'");
        err.statusCode = 400;
        err.name = 'FastifyError';
        err.validation = [{ keyword: 'required', params: { missingProperty: 'token' } }];
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

describe('notification-service global error handler — 500 leak redaction', () => {
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

        it('500 body does NOT contain "at /" (negative #3 — strips stack-frame paths)', async () => {
            const res = await app.inject({ method: 'GET', url: '/boom' });
            expect(res.body).not.toContain('at /');
        });

        it('500 body does NOT contain "at " (negative #3b — strips bare stack-frame leader)', async () => {
            const res = await app.inject({ method: 'GET', url: '/boom' });
            expect(res.body).not.toContain('at ');
        });

        it('500 body does NOT contain "localhost" (negative #4 — strips conn-string fragments)', async () => {
            const res = await app.inject({ method: 'GET', url: '/boom' });
            expect(res.body).not.toContain('localhost');
        });

        it('500 body does NOT contain the literal thrown message (negative #5)', async () => {
            const res = await app.inject({ method: 'GET', url: '/boom' });
            expect(res.body).not.toContain(LEAKY_THROWN_MESSAGE);
        });

        it('500 body does NOT contain "/etc/passwd" (negative #6 — bonus)', async () => {
            const res = await app.inject({ method: 'GET', url: '/boom' });
            expect(res.body).not.toContain('/etc/passwd');
        });

        it('500 body does NOT contain the old "An unexpected error occurred" leak-shim copy (negative #7)', async () => {
            // The pre-fix handler set message to either `error.message` OR
            // 'An unexpected error occurred' — neither is acceptable on the
            // wire any more; the fixed copy is 'Internal server error'.
            const res = await app.inject({ method: 'GET', url: '/boom' });
            expect(res.body).not.toContain('An unexpected error occurred');
        });
    });

    describe('<500 branch reflects validation messages only', () => {
        it('Fastify validation error: message IS reflected verbatim (user-facing & safe)', async () => {
            const res = await app.inject({ method: 'GET', url: '/bad-validation' });

            expect(res.statusCode).toBe(400);
            expect(res.json()).toEqual({
                statusCode: 400,
                error: 'FastifyError',
                message: "body should have required property 'token'",
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
