/**
 * Regression suite — subscription-service STRIPE WEBHOOK signature-failure
 * no-leak contract (src/stripe.ts, the constructEvent catch block ~line 240).
 *
 * Background: the previous catch block reflected the raw Stripe error verbatim
 * on the 400 branch:
 *
 *     return reply.status(400).send({ error: `Webhook Error: ${message}` });
 *
 * where `message` is whatever `stripe.webhooks.constructEvent()` throws — e.g.
 * "No signatures found matching the expected signature for payload …,
 * timestamp=…". The webhook route has NO authentication (it is verified by the
 * Stripe-Signature header instead), so this echoed Stripe's signature-
 * verification internals on the wire to *any* unauthenticated caller of
 * POST /v1/subscriptions/webhook — a textbook information-disclosure leak. The
 * security-hardening pass ships a fixed, redacted body and keeps the real cause
 * logged server-side via `logger.warn({ message }, …)`.
 *
 * This suite locks that contract in permanently. Unlike error-redaction.test.ts
 * (which duplicates the global handler because src/index.ts bootstraps a real
 * DB/Redis/cluster at import time), `registerStripeRoutes` is a pure function
 * with no import-time side effects, so we mount the REAL route here and drive a
 * forged Stripe-Signature through it. We mock only the `stripe` module so
 * `constructEvent` throws a controllable, sentinel-bearing error — the route,
 * its catch, its `logger.warn`, and its `reply` are all the production code.
 *
 * The sentinel below ('whsec_SENTINEL_LEAK_0xDEADBEEF …') is a secret-shaped
 * string we force into the thrown message; the test asserts it (and Stripe's
 * realistic 'No signatures found' / 'timestamp' phrasing, and the old
 * 'Webhook Error:' prefix, and stack fragments) NEVER appears in the 400 body,
 * which must deep-equal the fixed redacted shape. These assertions FAIL against
 * the old leaky code (which echoed `Webhook Error: ${message}`) and PASS after
 * the fix. This file is disjoint from error-redaction.test.ts and does not
 * touch routes.ts.
 */

// The exact internal message the old catch block would have echoed verbatim.
// Every fragment here is an attack signal the redactor MUST strip from the wire:
//   - a secret-shaped sentinel,
//   - Stripe's real "No signatures found …" phrasing,
//   - a "timestamp=" hint,
//   - a fake stack frame ("at ").
const SENTINEL_LEAK_MESSAGE =
    'whsec_SENTINEL_LEAK_0xDEADBEEF No signatures found matching expected ' +
    'signature for payload, timestamp=1718323200\n    at constructEvent ' +
    '(/srv/subscription-service/node_modules/stripe/lib/Webhooks.js:42:13)';

// ── Mock the `stripe` module ────────────────────────────────────────────────
// `import Stripe from 'stripe'` resolves to this mock's default export. The
// mocked constructor returns an object whose `webhooks.constructEvent` throws a
// StripeSignatureVerificationError-shaped error carrying SENTINEL_LEAK_MESSAGE,
// so we exercise the real catch block deterministically without a network or a
// genuinely-forged HMAC. `checkout.sessions.create` etc. are unused by the
// webhook path but stubbed so the constructed instance is well-formed.
const mockConstructEvent = jest.fn(() => {
    const err = new Error(SENTINEL_LEAK_MESSAGE);
    err.name = 'StripeSignatureVerificationError';
    throw err;
});

jest.mock('stripe', () => {
    return jest.fn().mockImplementation(() => ({
        webhooks: { constructEvent: mockConstructEvent },
        checkout: { sessions: { create: jest.fn() } },
        accounts: { create: jest.fn() },
        accountLinks: { create: jest.fn() },
    }));
});

import Fastify, { FastifyInstance } from 'fastify';
import { registerStripeRoutes } from '../src/stripe';

const WEBHOOK_PATH = '/v1/subscriptions/webhook';

// The fixed, redacted body the hardened catch block must ship — identical for
// both the forged-signature path and the missing-signature path.
const FIXED_REDACTED_BODY = {
    statusCode: 400,
    error: 'Bad Request',
    message: 'Webhook signature verification failed',
};

// A no-op logger matching the pino surface `registerStripeRoutes` touches.
// (We assert behaviour on the wire, not the log; the production route still
// calls logger.warn({ message }, …) so the real cause stays server-side.)
function makeStubLogger(): any {
    return { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
}

// SubscriptionService is never reached on the signature-failure path (the route
// returns 400 before any service call), so an empty stub is sufficient.
function makeStubService(): any {
    return {};
}

/**
 * Boots a tiny Fastify app and mounts the REAL `registerStripeRoutes`. The
 * webhook route reads `STRIPE_WEBHOOK_SECRET` at registration time, so we set
 * it before constructing the app and mount inside the helper.
 */
function buildApp(): FastifyInstance {
    const app = Fastify({ logger: false });
    // `registerStripeRoutes` registers the checkout/coach routes with
    // `{ preHandler: [fastify.authenticate] }`. In production src/index.ts
    // decorates that via @fastify/jwt BEFORE calling registerStripeRoutes; here
    // we mirror the contract with a no-op decorator so route *registration*
    // succeeds. The webhook route under test has NO preHandler, so this stub is
    // never invoked on the path we exercise — it only satisfies Fastify's
    // "preHandler hook should be a function" validation for the sibling routes.
    app.decorate('authenticate', async function authenticate() {
        /* no-op: never reached on the public webhook path */
    });
    registerStripeRoutes(app, makeStubService(), makeStubLogger());
    return app;
}

describe('subscription-service Stripe webhook — signature-failure leak redaction', () => {
    let app: FastifyInstance;
    const prevWebhookSecret = process.env['STRIPE_WEBHOOK_SECRET'];
    const prevSecretKey = process.env['STRIPE_SECRET_KEY'];

    beforeAll(async () => {
        // A non-empty webhook secret so the route reaches constructEvent (rather
        // than short-circuiting on the missing-secret branch). The value is
        // irrelevant — constructEvent is mocked to throw.
        process.env['STRIPE_WEBHOOK_SECRET'] = 'whsec_test_secret_value';
        // A non-placeholder key so isStripeConfigured() is true (defensive; the
        // webhook path does not gate on it, but keeps the instance "configured").
        process.env['STRIPE_SECRET_KEY'] = 'sk_test_not_a_placeholder';
        app = buildApp();
        await app.ready();
    });

    afterAll(async () => {
        await app.close();
        if (prevWebhookSecret === undefined) delete process.env['STRIPE_WEBHOOK_SECRET'];
        else process.env['STRIPE_WEBHOOK_SECRET'] = prevWebhookSecret;
        if (prevSecretKey === undefined) delete process.env['STRIPE_SECRET_KEY'];
        else process.env['STRIPE_SECRET_KEY'] = prevSecretKey;
    });

    describe('forged Stripe-Signature → 400 body is fully redacted', () => {
        async function injectForged() {
            return app.inject({
                method: 'POST',
                url: WEBHOOK_PATH,
                headers: {
                    'content-type': 'application/json',
                    // A present-but-bogus signature so the route does NOT take the
                    // missing-signature branch and instead calls constructEvent,
                    // which the mock makes throw SENTINEL_LEAK_MESSAGE.
                    'stripe-signature': 't=1718323200,v1=deadbeefdeadbeefdeadbeefdeadbeef',
                },
                payload: JSON.stringify({ id: 'evt_test', type: 'checkout.session.completed' }),
            });
        }

        it('responds 400 (signature verification rejected)', async () => {
            const res = await injectForged();
            expect(res.statusCode).toBe(400);
        });

        it('body deep-equals the fixed redacted shape (positive match)', async () => {
            const res = await injectForged();
            expect(res.json()).toEqual(FIXED_REDACTED_BODY);
        });

        it('body does NOT contain the secret-shaped sentinel (negative #1 — the core leak)', async () => {
            const res = await injectForged();
            expect(res.body).not.toContain('whsec_SENTINEL_LEAK_0xDEADBEEF');
            expect(res.body).not.toContain(SENTINEL_LEAK_MESSAGE);
        });

        it('body does NOT contain the old "Webhook Error:" prefix (negative #2)', async () => {
            const res = await injectForged();
            expect(res.body).not.toContain('Webhook Error:');
        });

        it('body does NOT contain Stripe\'s "No signatures found" phrasing (negative #3)', async () => {
            const res = await injectForged();
            expect(res.body).not.toContain('No signatures found');
        });

        it('body does NOT contain a "timestamp" hint (negative #4)', async () => {
            const res = await injectForged();
            expect(res.body).not.toContain('timestamp');
        });

        it('body does NOT contain stack-frame fragments (negative #5)', async () => {
            const res = await injectForged();
            expect(res.body).not.toContain('at ');
            expect(res.body).not.toContain('node_modules');
            expect(res.body).not.toContain('.js:');
        });

        it('still routed through the real constructEvent (sanity: the mock was hit)', async () => {
            mockConstructEvent.mockClear();
            await injectForged();
            expect(mockConstructEvent).toHaveBeenCalledTimes(1);
        });
    });

    describe('missing Stripe-Signature → 400 with the pre-existing fixed body', () => {
        // NOTE: the missing-signature branch (src/stripe.ts ~line 227) is its own
        // pre-existing redacted response and is intentionally left byte-identical
        // by this change — it ships the SHORT shape `{ error: 'Webhook signature
        // verification failed' }`, not the full statusCode/error/message body the
        // constructEvent catch now uses. We assert that exact shape so this test
        // would catch any future drift in EITHER branch.
        const MISSING_SIG_BODY = { error: 'Webhook signature verification failed' };

        async function injectNoSignature() {
            return app.inject({
                method: 'POST',
                url: WEBHOOK_PATH,
                headers: { 'content-type': 'application/json' },
                payload: JSON.stringify({ id: 'evt_test', type: 'checkout.session.completed' }),
            });
        }

        it('responds 400 with the fixed body and never reaches constructEvent', async () => {
            mockConstructEvent.mockClear();
            const res = await injectNoSignature();

            expect(res.statusCode).toBe(400);
            expect(res.json()).toEqual(MISSING_SIG_BODY);
            // The missing-signature branch short-circuits before verification.
            expect(mockConstructEvent).not.toHaveBeenCalled();
        });

        it('missing-signature body leaks no sentinel / Stripe internals either', async () => {
            const res = await injectNoSignature();
            expect(res.body).not.toContain('whsec_SENTINEL_LEAK_0xDEADBEEF');
            expect(res.body).not.toContain('Webhook Error:');
            expect(res.body).not.toContain('No signatures found');
        });
    });
});
