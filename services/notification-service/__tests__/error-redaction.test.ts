/**
 * Regression suite — notification-service GLOBAL ERROR HANDLER no-leak contract.
 *
 * Background: the previous handler shipped `message: error.message ?? 'An
 * unexpected error occurred'` straight to the client, so a Prisma exception
 * leaked query fragments, table names, and conn-string hostnames to any caller
 * that could trigger a 500. notification-service now converges onto the SAME
 * shared redactor every other service uses — `registerFastifyErrorHandler`
 * (backed by the pure `buildErrorResponse`) from @nightfuel/config: the 5xx
 * body is a fixed generic, and the <500 body only reflects `error.message`
 * when `error.validation` is truthy (i.e. a Fastify-generated user-facing
 * message).
 *
 * This suite locks the redaction contract in permanently. It boots a tiny
 * Fastify app wired with the REAL shared handler (no hand-written mirror), then
 * exercises a deliberately leaky thrown error and asserts the response body
 * does NOT contain any of the high-risk substrings ('Prisma', 'stack', 'at /',
 * or 'localhost') and DOES contain the generic 'An unexpected error occurred'
 * copy the shared redactor emits. If anyone widens the surface again (e.g.
 * re-adds `message: error.message` on the 5xx branch, or reflects err.stack),
 * this file goes red.
 *
 * We exercise the shared helper directly rather than importing src/index.ts
 * because that module starts a real Prisma client + Redis bus + socket.io
 * bootstrap at import time and cannot be loaded in a unit test. The expected
 * positive bodies are derived from `buildErrorResponse` so the test tracks the
 * single source of truth instead of a duplicated literal.
 */
import Fastify, { FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { registerFastifyErrorHandler, buildErrorResponse } from '@nightfuel/config';
import { notificationRoutes } from '../src/routes';

// Same leaky string the previous handler used to reflect — every substring
// here is an attack signal the redactor MUST strip.
const LEAKY_THROWN_MESSAGE =
    'Prisma raw stack frame at /etc/passwd localhost:5432';

/**
 * Builds a tiny Fastify app wired with the REAL shared error handler
 * (`registerFastifyErrorHandler` from @nightfuel/config) — the exact same
 * code path src/index.ts now installs. It also mounts:
 *   - GET /boom → throws LEAKY_THROWN_MESSAGE (drives the 5xx branch)
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

    // Install the SHARED handler (not a hand-written mirror) so this suite
    // exercises the single source of truth. A no-op logger stub satisfies the
    // helper's pino Logger param without emitting noise — the production code
    // still logs the full error server-side via its real logger.
    registerFastifyErrorHandler(app, {
        error: () => {},
        info: () => {},
        warn: () => {},
        fatal: () => {},
        debug: () => {},
        trace: () => {},
    } as any);

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
            // The wire body equals exactly what the shared pure redactor emits
            // for a thrown (non-statusCode) error — fixed generic, no leak.
            expect(res.json()).toEqual({
                error: 'InternalServerError',
                message: 'An unexpected error occurred',
                statusCode: 500,
            });
            expect(res.json()).toEqual(
                buildErrorResponse(new Error(LEAKY_THROWN_MESSAGE)).body,
            );
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

        it('500 body DOES contain the shared generic "An unexpected error occurred" copy (positive #7)', async () => {
            // Converged onto the shared redactor: the fixed 5xx copy is now
            // 'An unexpected error occurred' (buildErrorResponse). This is the
            // ONLY message text allowed to surface on a 500 — it carries no
            // internal detail, so asserting its presence is safe and locks the
            // generic-copy contract.
            const res = await app.inject({ method: 'GET', url: '/boom' });
            expect(res.body).toContain('An unexpected error occurred');
        });
    });

    describe('<500 branch reflects validation messages only', () => {
        it('Fastify validation error: message IS reflected verbatim (user-facing & safe)', async () => {
            const res = await app.inject({ method: 'GET', url: '/bad-validation' });

            expect(res.statusCode).toBe(400);
            // buildErrorResponse reflects the validation message and adds a
            // statusCode field to the body.
            expect(res.json()).toEqual({
                error: 'FastifyError',
                message: "body should have required property 'token'",
                statusCode: 400,
            });
        });

        it('Non-validation 4xx error: message is replaced with generic "Bad request"', async () => {
            const res = await app.inject({ method: 'GET', url: '/bad-internal' });

            expect(res.statusCode).toBe(400);
            // Non-validation 4xx → generic 'Bad request' body, plus the
            // statusCode field buildErrorResponse appends.
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
 * Pin the REAL shared redaction contract — `buildErrorResponse`
 * (packages/config/src/server.ts), imported via @nightfuel/config.
 *
 * The describe above proves the SHARED handler is wired into this service and
 * redacts correctly over the wire. THIS block goes one level deeper: it pins
 * the pure decision function directly, so a drift in `buildErrorResponse`
 * itself — e.g. someone flips the 5xx branch back to `message: error.message`,
 * or stops redacting non-validation 4xx — turns notification-service's suite
 * red too, exactly like the 13 other shared-family redaction suites. Because we
 * import and exercise the genuine helper (not a hand-mirrored copy), there is
 * no local shape that could silently diverge from production.
 *
 * The structured `logger.error(...)` inside `registerFastifyErrorHandler` still
 * captures the full error (stack, Prisma text, conn-string fragments)
 * server-side; only the WIRE body is redacted. These assertions deliberately do
 * NOT weaken that — they pin the redacted public body, never the logged cause.
 */
describe('notification-service redaction — drives the real @nightfuel/config shared handler', () => {
    describe('buildErrorResponse pure contract (the single source of truth)', () => {
        it('5xx: returns the fixed generic body, never err.message / err.stack', () => {
            // A 5xx carrying a (would-be-leaky) message AND a stack hint: both
            // must be dropped in favour of the fixed generic copy.
            const res = buildErrorResponse({
                statusCode: 500,
                message: 'x',
                stack: 'y',
            });
            expect(res.body).toEqual({
                error: 'InternalServerError',
                message: 'An unexpected error occurred',
                statusCode: 500,
            });
            // Neither the raw message nor the stack hint may appear anywhere in
            // the redacted body.
            expect(JSON.stringify(res.body)).not.toContain('"x"');
            expect(JSON.stringify(res.body)).not.toContain('y');
        });

        it('validation 4xx: reflects the (safe, user-facing) error.message', () => {
            // Fastify validation errors carry user-facing schema copy that is
            // safe to surface — the redactor reflects it verbatim.
            const res = buildErrorResponse({
                statusCode: 400,
                validation: [{}],
                name: 'FastifyError',
                message: "body should have required property 'token'",
            });
            expect(res.body.message).toBe("body should have required property 'token'");
            // Full body for completeness — error.name preserved, statusCode echoed.
            expect(res.body).toEqual({
                error: 'FastifyError',
                message: "body should have required property 'token'",
                statusCode: 400,
            });
        });

        it('non-validation 4xx: redacts err.message to the generic "Bad request"', () => {
            // A non-validation 4xx whose message is a conn-string-shaped leak:
            // the redactor must replace it with the fixed generic.
            const res = buildErrorResponse({
                statusCode: 400,
                name: 'InternalError',
                message: 'connect ECONNREFUSED 127.0.0.1:5432',
            });
            expect(res.body.message).toBe('Bad request');
            expect(res.body).toEqual({
                error: 'InternalError',
                message: 'Bad request',
                statusCode: 400,
            });
            // The conn-string fragments in the input must not survive redaction.
            expect(JSON.stringify(res.body)).not.toContain('ECONNREFUSED');
            expect(JSON.stringify(res.body)).not.toContain('127.0.0.1');
            expect(JSON.stringify(res.body)).not.toContain('5432');
        });
    });

    describe('re-asserted through the registered app (shared handler on the wire)', () => {
        let app: FastifyInstance;

        beforeAll(async () => {
            app = buildApp();
            await app.ready();
        });

        afterAll(async () => {
            await app.close();
        });

        it('500 → "An unexpected error occurred" / "InternalServerError"', async () => {
            const res = await app.inject({ method: 'GET', url: '/boom' });
            expect(res.statusCode).toBe(500);
            expect(res.json()).toEqual({
                error: 'InternalServerError',
                message: 'An unexpected error occurred',
                statusCode: 500,
            });
        });

        it('validation 4xx → reflects error.message', async () => {
            const res = await app.inject({ method: 'GET', url: '/bad-validation' });
            expect(res.statusCode).toBe(400);
            expect(res.json()).toEqual({
                error: 'FastifyError',
                message: "body should have required property 'token'",
                statusCode: 400,
            });
        });

        it('non-validation 4xx → "Bad request"', async () => {
            const res = await app.inject({ method: 'GET', url: '/bad-internal' });
            expect(res.statusCode).toBe(400);
            expect(res.json()).toEqual({
                error: 'InternalError',
                message: 'Bad request',
                statusCode: 400,
            });
        });

        it('raw err.message / .stack / "Prisma" / "5432" never appear in any body', async () => {
            // Sweep every redactor branch (5xx, validation 4xx, non-validation
            // 4xx) and assert none of the high-risk fragments leak on the wire.
            for (const url of ['/boom', '/bad-validation', '/bad-internal']) {
                const res = await app.inject({ method: 'GET', url });
                expect(res.body).not.toContain(LEAKY_THROWN_MESSAGE);
                expect(res.body).not.toContain('connect ECONNREFUSED 127.0.0.1:5432');
                expect(res.body).not.toContain('Prisma');
                expect(res.body).not.toContain('stack');
                expect(res.body).not.toContain('5432');
                expect(res.body).not.toContain('localhost');
                expect(res.body).not.toContain('at /');
            }
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
