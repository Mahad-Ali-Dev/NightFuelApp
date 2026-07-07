/**
 * Regression suite — subscription-service STRIPE DOWNGRADE-ON-CANCEL (HIGH #4) on
 * the REAL `registerStripeRoutes` (src/stripe.ts).
 *
 * Background (the vulnerability this suite locks shut):
 *   checkout.sessions.create set metadata only on the Checkout SESSION, not on the
 *   Subscription. customer.subscription.updated/deleted deliver the SUBSCRIPTION
 *   object, whose metadata was therefore empty — so those handlers could not
 *   resolve the userId and NEVER downgraded. A cancelled/expired user kept their
 *   paid tier forever.
 *
 *   The fix passes `subscription_data: { metadata: { userId, tier } }` to
 *   checkout.sessions.create, so Stripe stamps userId onto the Subscription. The
 *   updated (status canceled) and deleted webhooks read sub.metadata.userId and
 *   downgrade that user to FREE via upgradeTier({ targetTier: 'FREE' }).
 *
 * `registerStripeRoutes` is a pure function with no import-time side effects, so we
 * mount the REAL routes and mock only the `stripe` module: checkout.sessions.create
 * is a jest.fn whose ARGS we assert, and webhooks.constructEvent returns a
 * controlled Subscription event so the real handler + the real SubscriptionService
 * stub run end-to-end (the webhook handler runs via setImmediate, so we await a tick).
 */

const mockSessionsCreate = jest.fn(async () => ({ id: 'cs_test_123', url: 'https://checkout.stripe.test/cs_test_123' }));
const mockConstructEvent = jest.fn();

jest.mock('stripe', () => {
    return jest.fn().mockImplementation(() => ({
        webhooks: { constructEvent: mockConstructEvent },
        checkout: { sessions: { create: mockSessionsCreate } },
        accounts: { create: jest.fn() },
        accountLinks: { create: jest.fn() },
    }));
});

import Fastify, { FastifyInstance } from 'fastify';

// PRICE_IDS in src/stripe.ts is read at MODULE LOAD from process.env, so the
// price env var must be set BEFORE the module is required — otherwise checkout
// 400s on an "unconfigured tier". ES `import` is hoisted above plain statements,
// so we set the env here and pull the module in via require (NOT hoisted) to
// guarantee ordering. (isStripeConfigured() reads env lazily, so the secret key
// can be set later in beforeAll.)
process.env['STRIPE_PRICE_PRO'] = 'price_pro_test';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { registerStripeRoutes } = require('../src/stripe') as typeof import('../src/stripe');

const USER_ID = '7c3f9a1c-dead-beef-cafe-0123456789ab';
const WEBHOOK_PATH = '/v1/subscriptions/webhook';
const CHECKOUT_PATH = '/v1/subscriptions/checkout';

function makeStubLogger(): any {
    return { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
}

function makeStubService() {
    return {
        upgradeTier: jest.fn(async () => ({ subscription: {}, fromTier: 'PRO' })),
        cancel: jest.fn(async () => ({})),
        updateStripeIds: jest.fn(async () => undefined),
    };
}

// Wait for the setImmediate-scheduled webhook handler to run.
function flushAsync(): Promise<void> {
    return new Promise((resolve) => setImmediate(resolve));
}

describe('subscription-service Stripe — subscription_data.metadata + downgrade on cancel (HIGH #4)', () => {
    let app: FastifyInstance;
    let svc: ReturnType<typeof makeStubService>;
    const prevWebhookSecret = process.env['STRIPE_WEBHOOK_SECRET'];
    const prevSecretKey = process.env['STRIPE_SECRET_KEY'];

    beforeAll(async () => {
        process.env['STRIPE_WEBHOOK_SECRET'] = 'whsec_test_secret_value';
        process.env['STRIPE_SECRET_KEY'] = 'sk_test_not_a_placeholder';

        svc = makeStubService();
        app = Fastify({ logger: false });
        app.decorate('authenticate', async (request: any) => {
            request.user = { id: USER_ID };
        });
        registerStripeRoutes(app, svc as any, makeStubLogger());
        await app.ready();
    });

    afterAll(async () => {
        await app.close();
        if (prevWebhookSecret === undefined) delete process.env['STRIPE_WEBHOOK_SECRET']; else process.env['STRIPE_WEBHOOK_SECRET'] = prevWebhookSecret;
        if (prevSecretKey === undefined) delete process.env['STRIPE_SECRET_KEY']; else process.env['STRIPE_SECRET_KEY'] = prevSecretKey;
        delete process.env['STRIPE_PRICE_PRO'];
    });

    beforeEach(() => {
        mockSessionsCreate.mockClear();
        mockConstructEvent.mockReset();
        svc.upgradeTier.mockClear();
        svc.cancel.mockClear();
    });

    it('checkout passes subscription_data.metadata.userId so the Subscription carries the owner', async () => {
        const res = await app.inject({
            method: 'POST',
            url: CHECKOUT_PATH,
            payload: { tier: 'PRO' },
        });

        expect(res.statusCode).toBe(200);
        expect(mockSessionsCreate).toHaveBeenCalledTimes(1);
        const arg = mockSessionsCreate.mock.calls[0][0] as any;
        // The fix: metadata on the Subscription object, not only the Session.
        expect(arg.subscription_data).toBeDefined();
        expect(arg.subscription_data.metadata.userId).toBe(USER_ID);
        expect(arg.subscription_data.metadata.tier).toBe('PRO');
        // Session-level metadata is still present (used by checkout.session.completed).
        expect(arg.metadata.userId).toBe(USER_ID);
    });

    it('customer.subscription.deleted downgrades the user resolved from sub.metadata.userId to FREE', async () => {
        mockConstructEvent.mockReturnValue({
            id: 'evt_del',
            type: 'customer.subscription.deleted',
            data: { object: { id: 'sub_123', metadata: { userId: USER_ID }, status: 'canceled' } },
        });

        const res = await app.inject({
            method: 'POST',
            url: WEBHOOK_PATH,
            headers: { 'content-type': 'application/json', 'stripe-signature': 't=1,v1=deadbeef' },
            payload: JSON.stringify({ id: 'evt_del' }),
        });

        expect(res.statusCode).toBe(200);
        await flushAsync();

        expect(svc.upgradeTier).toHaveBeenCalledWith({ userId: USER_ID, targetTier: 'FREE' });
    });

    it('customer.subscription.updated (status canceled) downgrades the right user to FREE', async () => {
        mockConstructEvent.mockReturnValue({
            id: 'evt_upd',
            type: 'customer.subscription.updated',
            data: {
                object: {
                    id: 'sub_123',
                    metadata: { userId: USER_ID },
                    status: 'canceled',
                    items: { data: [{ price: { id: 'price_pro_test' } }] },
                },
            },
        });

        const res = await app.inject({
            method: 'POST',
            url: WEBHOOK_PATH,
            headers: { 'content-type': 'application/json', 'stripe-signature': 't=1,v1=deadbeef' },
            payload: JSON.stringify({ id: 'evt_upd' }),
        });

        expect(res.statusCode).toBe(200);
        await flushAsync();

        expect(svc.upgradeTier).toHaveBeenCalledWith({ userId: USER_ID, targetTier: 'FREE' });
    });

    it('customer.subscription.deleted with NO userId metadata does NOT downgrade anyone (and logs)', async () => {
        mockConstructEvent.mockReturnValue({
            id: 'evt_del_nometa',
            type: 'customer.subscription.deleted',
            data: { object: { id: 'sub_456', metadata: {}, status: 'canceled' } },
        });

        const res = await app.inject({
            method: 'POST',
            url: WEBHOOK_PATH,
            headers: { 'content-type': 'application/json', 'stripe-signature': 't=1,v1=deadbeef' },
            payload: JSON.stringify({ id: 'evt_del_nometa' }),
        });

        expect(res.statusCode).toBe(200);
        await flushAsync();

        expect(svc.upgradeTier).not.toHaveBeenCalled();
    });
});
