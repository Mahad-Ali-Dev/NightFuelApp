/**
 * Regression suite — notification-service INPUT-BOUNDS hardening on the push /
 * preferences write surface (src/routes.ts + src/schemas.ts), exercised
 * end-to-end through the REAL validation pipeline and the REAL route plugin.
 *
 * This is deliberately separate from the two existing notification-service
 * suites:
 *   - error-redaction.test.ts   locks the SHARED 5xx/<500 redaction contract
 *     AND the in-route mark-as-read 404 literal.
 *   - chat-message-sent.test.ts locks the realtime chat fan-out.
 *
 * None of them proves what THIS suite proves: that the push handlers'
 * previously UNBOUNDED string fields are now capped, so an over-long / poisoned
 * payload is rejected with a real HTTP 400 *through the same machinery the
 * service wires in production* — `setValidatorCompiler(validatorCompiler)` +
 * `setSerializerCompiler(serializerCompiler)` from `fastify-type-provider-zod`
 * feeding the SHARED `registerFastifyErrorHandler` from `@nightfuel/config` —
 * AND that the 400 body is redacted (no stack, no Prisma/DB internals, no
 * filesystem path, never the rejected input echoed back), WHILE a representative
 * valid request still succeeds with the exact same status + response shape as
 * before. In other words: the bounds only tighten the rejected surface; they
 * never change valid behaviour.
 *
 * Why we mount the REAL `notificationRoutes` plugin instead of importing
 * src/index.ts:
 *   - The service bootstrap module (src/index.ts) opens real DB/Redis/socket.io
 *     connections at import time and cannot be loaded in a unit test — the same
 *     constraint documented at the top of error-redaction.test.ts.
 *   - So we mount a Fastify app wired EXACTLY like src/index.ts's request path
 *     (same validator/serializer compilers, same shared error handler) and
 *     register the genuine `notificationRoutes` plugin — meaning the bound
 *     schemas under test are the ACTUAL ones the production routes use, not a
 *     re-declared copy that could silently drift. The `authenticate` onRequest
 *     decorator is stubbed to attach a user and proceed (mirroring the
 *     mark-as-read block in error-redaction.test.ts) so injected requests reach
 *     the validator directly without JWT plumbing — auth itself is locked by the
 *     shared 401 guard / error-redaction suite, not here.
 *   - The push/notification service deps are stubbed: a rejected request never
 *     reaches them (the validator short-circuits to the shared error handler
 *     first), and an accepted request just receives a fixed `{ id }` / `{ ok }`
 *     so the valid-path response is observable without touching Prisma.
 *
 * On "redacted body" vs the Zod field path: a Zod validation failure surfaces a
 * 400 whose message names the offending field (e.g. "expoPushToken") and the
 * rule it broke — that is user-facing SCHEMA copy and is intentionally
 * preserved (it is how the client learns what to fix). What MUST NOT appear is
 * internal leakage: a stack trace, a stack-frame path ("at /"), Prisma/DB-engine
 * text, a DB connection-string fragment, or a server filesystem path — and, for
 * an over-long input, the rejected input string echoed back verbatim. The
 * negative-match list below mirrors the sibling redaction suites verbatim so the
 * leak-signal surface is identical and grep-able across services.
 */
import Fastify, { FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { registerFastifyErrorHandler } from '@nightfuel/config';
import { notificationRoutes } from '../src/routes';

// A valid, realistic Expo token (~40 chars, well under the 256 cap) — proves a
// real-world subscribe payload passes unchanged.
const VALID_EXPO_TOKEN = 'ExponentPushToken[abcdefghijklmnopqrstuv]';
// A valid Web Push endpoint URL + short key material (the real-world shape).
const VALID_WEB_ENDPOINT = 'https://fcm.googleapis.com/fcm/send/abc123-DEF456_ghi789';
const VALID_P256DH = 'BNcRdreALRFXTkOOUHK1EtK2wtazd0v3z9g_';
const VALID_AUTH = 'tBHItJI5svbpez7KI4CCXg';

// Bounds under test — kept in lockstep with src/schemas.ts. If a cap there
// changes, change it here too.
const EXPO_TOKEN_MAX = 256;
const WEB_ENDPOINT_MAX = 2048;
const WEB_KEY_MAX = 512;
const UNSUBSCRIBE_ENDPOINT_MAX = 2048;

// A leaky string we POST as the over-long `expoPushToken`. If the
// validator/handler ever echoed the rejected INPUT back in the error body, this
// internal-looking text would ride out — the negative matches prove it doesn't.
// (It is 5000 chars, far over EXPO_TOKEN_MAX=256, so it also drives the
// length-cap rejection.) The fragment carries known leak signals mirrored from
// the sibling redaction suites.
const LEAKY_OVERLONG_TOKEN =
    'Prisma at /app/src/push.service.ts localhost:5432 /etc/passwd P2025 stack frame ' +
    'x'.repeat(5000);

// Stand-in stubs for the plugin deps. The valid-path handlers echo a fixed
// shape so the test can assert the response is unchanged; a rejected request
// never reaches these (the validator short-circuits first).
function buildStubPush() {
    return {
        getVapidPublicKey: () => 'stub-public-key',
        registerWebPush: jest.fn(async () => ({ id: 'web-sub-1' })),
        registerExpoPush: jest.fn(async () => ({ id: 'expo-sub-1' })),
        unregister: jest.fn(async () => undefined),
    };
}

function buildStubNotificationService() {
    return {
        listNotifications: jest.fn(),
        markAsRead: jest.fn(),
        markAllAsRead: jest.fn(),
        getOrCreatePreferences: jest.fn(),
        updatePreferences: jest.fn(),
    };
}

/**
 * Build a Fastify app wired EXACTLY like src/index.ts's request path:
 *   - validatorCompiler / serializerCompiler from fastify-type-provider-zod
 *   - the SHARED registerFastifyErrorHandler from @nightfuel/config (with a
 *     no-op logger so the handler's logger.error side effect stays quiet)
 *   - the GENUINE notificationRoutes plugin under prefix /v1/notifications, so
 *     the schemas under test are the production ones (no re-declared copy)
 *   - a stubbed `authenticate` decorator that attaches a user and proceeds
 *     (auth itself is locked by the shared 401 guard, not here)
 */
async function buildApp(
    push: ReturnType<typeof buildStubPush>,
    svc: ReturnType<typeof buildStubNotificationService>,
): Promise<FastifyInstance> {
    const app = Fastify({ logger: false });
    const silentLogger = {
        error: () => {},
        warn: () => {},
        info: () => {},
        fatal: () => {},
        debug: () => {},
        trace: () => {},
    } as any;
    registerFastifyErrorHandler(app, silentLogger);
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);

    // Stand-in for the real `authenticate` decorator: attach a user so the
    // handler's userId extraction succeeds, then proceed.
    app.decorate('authenticate', async (request: any) => {
        request.user = { id: '33333333-3333-3333-3333-333333333333' };
    });

    await app.register(
        async (instance) => {
            await notificationRoutes(instance, {
                notificationService: svc as any,
                pushService: push as any,
            });
        },
        { prefix: '/v1/notifications' },
    );

    await app.ready();
    return app;
}

// Every fragment a redacted 400 body MUST NOT contain — identical leak-signal
// list to error-redaction.test.ts so the negative surface is uniform and easy
// to grep across services. NOTE: the Zod field NAME (e.g. "expoPushToken") is
// legitimate user-facing schema copy and is NOT in this list — only genuine
// internal-leak signals are.
const LEAK_SIGNALS = ['stack', 'at /', '/app/src', '/etc/passwd', 'Prisma', 'P2025', 'localhost', '5432'];

function expectRedacted400Body(body: string): void {
    for (const signal of LEAK_SIGNALS) {
        expect(body).not.toContain(signal);
    }
}

describe('notification-service input-bounds — push handlers reject over-long / malformed payloads (redacted)', () => {
    let app: FastifyInstance;
    let push: ReturnType<typeof buildStubPush>;
    let svc: ReturnType<typeof buildStubNotificationService>;

    beforeAll(async () => {
        push = buildStubPush();
        svc = buildStubNotificationService();
        app = await buildApp(push, svc);
    });

    afterAll(async () => {
        await app.close();
    });

    // ── Valid path: realistic payloads still succeed unchanged ──────────────────

    it('POST /push/subscribe/expo accepts a valid realistic Expo token → 200 + { id }', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/notifications/push/subscribe/expo',
            payload: { expoPushToken: VALID_EXPO_TOKEN },
        });
        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({ id: 'expo-sub-1' });
        // The handler forwarded the (valid, in-bounds) token to the service
        // unchanged — bounds did not mutate the accepted value.
        expect(push.registerExpoPush).toHaveBeenCalledWith({
            userId: '33333333-3333-3333-3333-333333333333',
            expoPushToken: VALID_EXPO_TOKEN,
        });
    });

    it('POST /push/subscribe accepts a valid web-push payload → 200 + { id }', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/notifications/push/subscribe',
            payload: { endpoint: VALID_WEB_ENDPOINT, p256dh: VALID_P256DH, auth: VALID_AUTH },
        });
        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({ id: 'web-sub-1' });
    });

    it('DELETE /push/unsubscribe accepts a valid endpoint → 200 + { ok: true }', async () => {
        const res = await app.inject({
            method: 'DELETE',
            url: '/v1/notifications/push/unsubscribe',
            payload: { endpoint: VALID_WEB_ENDPOINT },
        });
        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({ ok: true });
    });

    it('a valid Expo token at the exact 256-char bound edge still succeeds 200 (inclusive cap)', async () => {
        // Build a token whose total length is EXACTLY EXPO_TOKEN_MAX — the upper
        // edge is INCLUSIVE, proving the bound is `<= max`, not `< max`.
        const prefix = 'ExponentPushToken[';
        const suffix = ']';
        const inner = 'a'.repeat(EXPO_TOKEN_MAX - prefix.length - suffix.length);
        const edgeToken = `${prefix}${inner}${suffix}`;
        expect(edgeToken.length).toBe(EXPO_TOKEN_MAX);

        const res = await app.inject({
            method: 'POST',
            url: '/v1/notifications/push/subscribe/expo',
            payload: { expoPushToken: edgeToken },
        });
        expect(res.statusCode).toBe(200);
    });

    it('a valid web-push payload at the exact key/endpoint bound edges still succeeds 200 (inclusive caps)', async () => {
        const edgeEndpoint = 'https://example.com/' + 'a'.repeat(WEB_ENDPOINT_MAX - 'https://example.com/'.length);
        expect(edgeEndpoint.length).toBe(WEB_ENDPOINT_MAX);
        const res = await app.inject({
            method: 'POST',
            url: '/v1/notifications/push/subscribe',
            payload: {
                endpoint: edgeEndpoint,
                p256dh: 'p'.repeat(WEB_KEY_MAX),
                auth: 'a'.repeat(WEB_KEY_MAX),
            },
        });
        expect(res.statusCode).toBe(200);
    });

    // ── Rejection cases (each must 400 through the validator + shared handler) ──

    it('POST /push/subscribe/expo rejects an over-long expoPushToken (5000 chars) with a 400', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/notifications/push/subscribe/expo',
            payload: { expoPushToken: 'x'.repeat(5000) },
        });
        expect(res.statusCode).toBe(400);
        // The over-long token never reached the service.
        expect(push.registerExpoPush).not.toHaveBeenCalledWith(
            expect.objectContaining({ expoPushToken: 'x'.repeat(5000) }),
        );
    });

    it('POST /push/subscribe/expo rejects an empty expoPushToken with a 400 (min(1) preserved)', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/notifications/push/subscribe/expo',
            payload: { expoPushToken: '' },
        });
        expect(res.statusCode).toBe(400);
    });

    it('POST /push/subscribe rejects an invalid (non-URL) endpoint with a 400', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/notifications/push/subscribe',
            payload: { endpoint: 'not-a-valid-url', p256dh: VALID_P256DH, auth: VALID_AUTH },
        });
        expect(res.statusCode).toBe(400);
    });

    it('POST /push/subscribe rejects an over-long endpoint (>2048 chars) with a 400', async () => {
        const overlong = 'https://example.com/' + 'a'.repeat(WEB_ENDPOINT_MAX + 100);
        const res = await app.inject({
            method: 'POST',
            url: '/v1/notifications/push/subscribe',
            payload: { endpoint: overlong, p256dh: VALID_P256DH, auth: VALID_AUTH },
        });
        expect(res.statusCode).toBe(400);
    });

    it('POST /push/subscribe rejects over-long key material (p256dh >512 chars) with a 400', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/notifications/push/subscribe',
            payload: {
                endpoint: VALID_WEB_ENDPOINT,
                p256dh: 'p'.repeat(WEB_KEY_MAX + 1),
                auth: VALID_AUTH,
            },
        });
        expect(res.statusCode).toBe(400);
    });

    it('DELETE /push/unsubscribe rejects an over-long endpoint (>2048 chars) with a 400', async () => {
        const overlong = 'a'.repeat(UNSUBSCRIBE_ENDPOINT_MAX + 100);
        const res = await app.inject({
            method: 'DELETE',
            url: '/v1/notifications/push/unsubscribe',
            payload: { endpoint: overlong },
        });
        expect(res.statusCode).toBe(400);
    });

    // ── Redaction of the rejection body ─────────────────────────────────────────

    it('the over-long-token 400 body leaks NO stack / Prisma / DB-internals / fs-path (redacted)', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/notifications/push/subscribe/expo',
            // The over-long, internal-looking token is the rejected input; if the
            // error body ever echoed the input verbatim, these signals would
            // appear — they must not.
            payload: { expoPushToken: LEAKY_OVERLONG_TOKEN },
        });
        expect(res.statusCode).toBe(400);
        expectRedacted400Body(res.body);
    });

    it('the over-long-token 400 body does NOT contain the literal leaky rejected input', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/notifications/push/subscribe/expo',
            payload: { expoPushToken: LEAKY_OVERLONG_TOKEN },
        });
        expect(res.body).not.toContain(LEAKY_OVERLONG_TOKEN);
    });

    it('the 400 body is well-formed JSON carrying a 400 statusCode (shared-handler shape)', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/notifications/push/subscribe/expo',
            payload: { expoPushToken: 'x'.repeat(5000) },
        });
        expect(res.statusCode).toBe(400);
        const json = res.json();
        // The shared handler reflects a genuine validation error's message but
        // pins statusCode to 400 and exposes only { error, message, statusCode }
        // — no stack / internal field. This is the SAME shape the sibling
        // error-redaction.test.ts locks.
        expect(json.statusCode).toBe(400);
        expect(typeof json.message).toBe('string');
        expect(Object.keys(json).sort()).toEqual(['error', 'message', 'statusCode']);
        // No internal-detail fields ride along on the 4xx body.
        expect(json).not.toHaveProperty('stack');
        expect(json).not.toHaveProperty('cause');
    });

    it('the invalid-endpoint 400 body is also redacted (no stack / internal detail)', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/notifications/push/subscribe',
            payload: { endpoint: 'not-a-valid-url', p256dh: VALID_P256DH, auth: VALID_AUTH },
        });
        expect(res.statusCode).toBe(400);
        expectRedacted400Body(res.body);
        const json = res.json();
        expect(Object.keys(json).sort()).toEqual(['error', 'message', 'statusCode']);
    });
});
