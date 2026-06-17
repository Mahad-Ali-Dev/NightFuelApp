/**
 * Regression suite — user-service routes through the SHARED Fastify error
 * handler / redactor exposed by `@nightfuel/config`
 * (`registerFastifyErrorHandler` + the pure `buildErrorResponse`,
 * packages/config/src/server.ts). This file locks the shared redaction
 * contract on a per-service basis.
 *
 * Background: the previous handler reflected `error.message` and `error.stack`
 * verbatim on the 500 branch, leaking stack frames (file paths, line numbers),
 * Prisma error text, and connection-string fragments (`localhost:5432`) to any
 * unauthenticated caller. P0 security items #3/#4 redact that: the 500 body is
 * a fixed generic, and a non-validation <500 body replaces `error.message`
 * with a generic 'Bad request'; only genuine Fastify validation errors
 * (`error.validation` truthy) keep their user-facing message.
 *
 * Why import the REAL function instead of byte-copying the handler?
 *   - This suite proves THIS service's redaction resolves to the
 *     redaction-hardened build of `@nightfuel/config`, not a stale local shim.
 *   - Because we exercise the REAL `buildErrorResponse` / the REAL
 *     `registerFastifyErrorHandler`, flipping the shared 500 branch to reflect
 *     `error.message` turns THIS suite red — a divergent inline copy could not
 *     catch that regression.
 *
 * Implementation notes:
 *   - The shared handler is imported directly and wired onto a tiny Fastify
 *     app. Nothing from `src/` index bootstrap is touched — that module opens
 *     real DB/Redis connections at import time and cannot be loaded in a unit
 *     test. (The in-route 404 block below DOES mount the real `userRoutes`
 *     plugin against a fully-mocked service.)
 *   - The injected logger is a no-op so the handler's `logger.error(...)` side
 *     effect is silenced in test output.
 *   - Assertions mirror the CURRENT shared redactor output (see
 *     packages/config/src/server.ts):
 *       * 5xx body: `{ error: 'InternalServerError', message: 'An unexpected
 *         error occurred', statusCode: 500 }` — fixed copy, no error.message
 *         or stack escapes.
 *       * validation <500 body: `{ error: error.name, message: error.message,
 *         statusCode }` — message reflected (safe schema copy).
 *       * non-validation <500 body: `{ error: error.name, message: 'Bad
 *         request', statusCode }` — message redacted.
 */
import Fastify, { FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { registerFastifyErrorHandler, buildErrorResponse } from '@nightfuel/config';
import { userRoutes } from '../src/routes';

// Same leaky string the previous handler used to reflect — every substring
// here is an attack signal the redactor MUST strip. Use the same string across
// every per-service redaction suite so the negative-match list is identical
// and easy to grep for.
const LEAKY_THROWN_MESSAGE =
    'Prisma raw stack frame at /etc/passwd localhost:5432';

/**
 * Builds a tiny Fastify app wired with the SHARED `registerFastifyErrorHandler`
 * from `@nightfuel/config`. Three throwing routes drive every branch of the
 * redactor:
 *   - GET /boom → throws LEAKY_THROWN_MESSAGE (drives the 5xx branch)
 *   - GET /bad-validation → throws an err with statusCode<500 and
 *     `validation` truthy (drives the safe <500 branch)
 *   - GET /bad-internal → throws an err with statusCode<500 and NO
 *     `validation` flag (drives the redacted <500 branch)
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
        const err: any = new Error("body should have required property 'email'");
        err.statusCode = 400;
        err.name = 'FastifyError';
        err.validation = [{ keyword: 'required', params: { missingProperty: 'email' } }];
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

describe('user-service shared error handler — 500 leak redaction (registerFastifyErrorHandler)', () => {
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

        it('500 body does NOT contain "at /" (negative #3 — strips stack-frame paths)', async () => {
            const res = await app.inject({ method: 'GET', url: '/boom' });
            expect(res.body).not.toContain('at /');
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
    });

    describe('<500 branch reflects validation messages only', () => {
        it('Fastify validation error: message IS reflected verbatim (user-facing & safe)', async () => {
            const res = await app.inject({ method: 'GET', url: '/bad-validation' });

            expect(res.statusCode).toBe(400);
            expect(res.json()).toEqual({
                error: 'FastifyError',
                message: "body should have required property 'email'",
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
});

/**
 * Pure-function contract — `buildErrorResponse` (packages/config/src/server.ts).
 *
 * The HTTP suite above proves the handler wires correctly; this block pins the
 * decision logic directly so a regression in the redactor's branching fails
 * here regardless of Fastify wiring. These assertions FAIL the moment the 500
 * branch starts reflecting `error.message`.
 */
describe('user-service redactor — buildErrorResponse pure contract', () => {
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

    it('explicit 5xx statusCode is preserved with the fixed generic body', () => {
        const err: any = new Error(LEAKY_THROWN_MESSAGE);
        err.statusCode = 503;
        const res = buildErrorResponse(err);
        expect(res).toEqual({
            statusCode: 503,
            body: {
                error: 'InternalServerError',
                message: 'An unexpected error occurred',
                statusCode: 503,
            },
        });
        expect(JSON.stringify(res.body)).not.toContain(LEAKY_THROWN_MESSAGE);
    });

    it('validation <500 reflects the (safe) error.message', () => {
        const err: any = new Error("body should have required property 'email'");
        err.statusCode = 400;
        err.name = 'FastifyError';
        err.validation = [{ keyword: 'required' }];
        const res = buildErrorResponse(err);
        expect(res).toEqual({
            statusCode: 400,
            body: {
                error: 'FastifyError',
                message: "body should have required property 'email'",
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

/**
 * In-route 4xx redaction — the per-route 404 catch branches (src/routes.ts).
 *
 * The global handler above only fires for errors that bubble OUT of a handler.
 * Several user routes instead CATCH the service error and pick a 404 status from
 * `err.message === 'Profile not found'` / `err.message.includes('not found')`,
 * then previously sent `error: err.message` straight back. UserService throws
 * generic strings today, but echoing err.message verbatim is the leak vector the
 * brief flags: any future change to the thrown text (or a Prisma error matching
 * the loose `.includes('not found')` guard on the preferences route) would reach
 * the client. The fix decouples the status decision from the body — each 404 now
 * sends a FIXED literal.
 *
 * This block mounts the REAL `userRoutes` plugin against a mocked service that
 * throws a leaky message, and asserts the 404 body is exactly the fixed literal
 * with none of the raw fragments. It would FAIL against the old
 * `error: err.message` code and PASS after the fix. UserService is fully mocked,
 * so no DB/Redis is touched.
 */
describe('user-service in-route 404 branches — message redaction', () => {
    // The PUT /me/preferences guard is the loose `.includes('not found')` one, so
    // a Prisma-shaped "...not found..." string would have matched and leaked.
    const LEAKY_PREFS_MESSAGE =
        'Record to update not found — Prisma at /srv/app localhost:5432';

    function buildMockService() {
        return {
            getProfileWithPreferences: jest.fn(),
            getStatus: jest.fn(),
            updateProfile: jest.fn(),
            getPreferences: jest.fn(),
            updatePreferences: jest.fn(),
            updateOnboarding: jest.fn(),
            getStudents: jest.fn(),
            assignProtocol: jest.fn(),
            getAdminStats: jest.fn(),
            getAdminUsers: jest.fn(),
            toggleBanUser: jest.fn(),
            getAllUsersInternal: jest.fn(),
        };
    }

    let app: FastifyInstance;
    let svc: ReturnType<typeof buildMockService>;

    beforeEach(async () => {
        svc = buildMockService();
        app = Fastify({ logger: false });
        app.setValidatorCompiler(validatorCompiler);
        app.setSerializerCompiler(serializerCompiler);
        // Stand-in for the real `authenticate` decorator: attach a user so the
        // shared extractUserId() succeeds and the handler proceeds to the service.
        app.decorate('authenticate', async (request: any) => {
            request.user = { userId: '33333333-3333-3333-3333-333333333333', role: 'USER' };
        });
        await app.register(
            async (instance) => {
                await userRoutes(instance, { userService: svc as any });
            },
            { prefix: '/v1/users' }
        );
        await app.ready();
    });

    afterEach(async () => {
        await app.close();
    });

    it('PUT /me 404: body is the fixed "Profile not found" literal, not err.message', async () => {
        // updateProfile throws the exact-match 'Profile not found' string; the
        // route must reply with the fixed literal (here it happens to equal the
        // thrown text, but the route no longer ECHOES err.message — proven below
        // by the preferences route where the thrown text differs).
        svc.updateProfile.mockRejectedValueOnce(new Error('Profile not found'));

        const res = await app.inject({
            method: 'PUT',
            url: '/v1/users/me',
            payload: { displayName: 'Updated Name' },
        });

        expect(res.statusCode).toBe(404);
        expect(res.json()).toEqual({ error: 'Profile not found' });
    });

    it('PUT /me/preferences 404: leaky "...not found..." is replaced by the fixed literal', async () => {
        // This is the strongest assertion: the loose `.includes('not found')`
        // guard still selects 404, but the body must be the FIXED literal —
        // NOT the raw Prisma-shaped thrown message. Fails against `error: err.message`.
        svc.updatePreferences.mockRejectedValueOnce(new Error(LEAKY_PREFS_MESSAGE));

        const res = await app.inject({
            method: 'PUT',
            url: '/v1/users/me/preferences',
            payload: { primaryGoal: 'GENERAL_HEALTH' },
        });

        expect(res.statusCode).toBe(404);
        expect(res.json()).toEqual({ error: 'Preferences not found' });
        // Hard guard: none of the raw fragments may reach the wire.
        expect(res.body).not.toContain(LEAKY_PREFS_MESSAGE);
        expect(res.body).not.toContain('Prisma');
        expect(res.body).not.toContain('stack');
        expect(res.body).not.toContain('localhost');
        expect(res.body).not.toContain('5432');
        expect(res.body).not.toContain('at /');
        expect(res.body).not.toContain('Record to update');
    });
});
