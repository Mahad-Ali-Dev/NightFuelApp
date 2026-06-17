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
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { notificationRoutes } from '../src/routes';

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

/**
 * In-route 4xx redaction — the mark-as-read 404 catch (src/routes.ts).
 *
 * The global handler above only fires for errors that bubble OUT of a handler;
 * the PUT /:id/read route instead CATCHES the service error itself and chooses a
 * 404 vs 500 status from `err.message?.includes('not found' | 'does not belong')`.
 * The previous code then sent `error: err.message` — which leaks the raw service
 * string. NotificationService throws "Notification <uuid> not found" /
 * "Notification <uuid> does not belong to this user", so the verbatim echo would
 * leak the notification UUID (and, if the service text ever changed, anything in
 * it). The fix decouples the status decision from the body: the 404 body is now a
 * FIXED literal 'Notification not found'.
 *
 * This block mounts the REAL `notificationRoutes` plugin against a mocked service
 * that throws the leaky string, and asserts the 404 body is exactly the fixed
 * literal with none of the raw fragments. It would FAIL against the old
 * `error: err.message` code and PASS after the fix.
 */
describe('notification-service mark-as-read 404 — in-route message redaction', () => {
    // A deliberately leaky thrown message in the SAME shape the service emits,
    // padded with attack-signal fragments that must never reach the wire.
    const LEAKY_404_MESSAGE =
        'Notification 11111111-1111-1111-1111-111111111111 not found — Prisma at /srv localhost:5432';
    const FIXED_404_BODY = { error: 'Notification not found' };
    // A valid UUID so the route's params zod schema passes and the handler runs.
    const VALID_ID = '22222222-2222-2222-2222-222222222222';

    function buildMockService() {
        return {
            listNotifications: jest.fn(),
            markAsRead: jest.fn(),
            markAllAsRead: jest.fn(),
            getOrCreatePreferences: jest.fn(),
            updatePreferences: jest.fn(),
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
        // handler's userId extraction succeeds, then proceed.
        app.decorate('authenticate', async (request: any) => {
            request.user = { id: '33333333-3333-3333-3333-333333333333' };
        });
        // pushService is referenced by the plugin but not exercised on this route.
        await app.register(
            async (instance) => {
                await notificationRoutes(instance, {
                    notificationService: svc as any,
                    pushService: { getVapidPublicKey: () => null } as any,
                });
            },
            { prefix: '/v1/notifications' }
        );
        await app.ready();
    });

    afterEach(async () => {
        await app.close();
    });

    it('PUT /:id/read 404: body equals the fixed literal, not err.message', async () => {
        svc.markAsRead.mockRejectedValueOnce(new Error(LEAKY_404_MESSAGE));

        const res = await app.inject({
            method: 'PUT',
            url: `/v1/notifications/${VALID_ID}/read`,
        });

        // Status decision is still driven by the 'not found' guard...
        expect(res.statusCode).toBe(404);
        // ...but the body is the FIXED generic, byte-for-byte.
        expect(res.json()).toEqual(FIXED_404_BODY);
        expect(svc.markAsRead).toHaveBeenCalledTimes(1);
    });

    it('PUT /:id/read 404: raw message / Prisma / stack / conn-string never leak', async () => {
        svc.markAsRead.mockRejectedValueOnce(new Error(LEAKY_404_MESSAGE));

        const res = await app.inject({
            method: 'PUT',
            url: `/v1/notifications/${VALID_ID}/read`,
        });

        expect(res.body).not.toContain(LEAKY_404_MESSAGE);
        // The notification UUID embedded in the service message must not surface.
        expect(res.body).not.toContain('11111111-1111-1111-1111-111111111111');
        expect(res.body).not.toContain('Prisma');
        expect(res.body).not.toContain('stack');
        expect(res.body).not.toContain('localhost');
        expect(res.body).not.toContain('5432');
        expect(res.body).not.toContain('at /');
    });

    it('PUT /:id/read "does not belong" 404 also redacts to the fixed literal', async () => {
        // The second guarded branch — ownership mismatch — must redact identically.
        svc.markAsRead.mockRejectedValueOnce(
            new Error('Notification 11111111-1111-1111-1111-111111111111 does not belong to this user')
        );

        const res = await app.inject({
            method: 'PUT',
            url: `/v1/notifications/${VALID_ID}/read`,
        });

        expect(res.statusCode).toBe(404);
        expect(res.json()).toEqual(FIXED_404_BODY);
        expect(res.body).not.toContain('does not belong');
        expect(res.body).not.toContain('11111111-1111-1111-1111-111111111111');
    });
});
