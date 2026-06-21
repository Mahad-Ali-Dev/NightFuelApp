/**
 * Regression suite — subscription-service PAYWALL / REVENUE-BYPASS lockdown on the
 * authenticated write surface (src/routes.ts), exercised end-to-end through the
 * REAL `subscriptionRoutes` plugin.
 *
 * Background (the vulnerability this suite locks shut):
 *   POST /v1/subscriptions/upgrade is authenticated but performed NO payment
 *   verification — it forwarded ANY requested tier straight into
 *   subscriptionService.upgradeTier(). So any logged-in user could POST
 *   { tier: 'ENTERPRISE' } and grant themselves a free, unlimited ENTERPRISE
 *   plan, bypassing the paywall entirely.
 *
 *   The fix restricts this client-callable path to the ONLY safe transition:
 *   FREE (downgrade / cancel). Elevation to a paid tier (PRO / PREMIUM /
 *   ENTERPRISE) is rejected with HTTP 402 { error: 'payment_required', ... }
 *   and upgradeTier() is never invoked, so the subscription can never be
 *   elevated through this route. Paid tiers may only be granted by the verified
 *   purchase flows: POST /v1/subscriptions/iap/validate (Apple/Google receipt
 *   validation) and the Stripe webhook — both already call upgradeTier()
 *   directly AFTER verifying payment, and are intentionally NOT exercised here.
 *
 * Why mount the REAL `subscriptionRoutes` plugin (not src/index.ts):
 *   - src/index.ts opens a real Prisma client + Redis bus + Stripe routes +
 *     cluster bootstrap at import time (via `void bootstrap()`) and cannot be
 *     loaded in a unit test — the same constraint documented atop
 *     error-redaction.test.ts / input-bounds.test.ts.
 *   - So we mount a Fastify app and register the genuine
 *     `subscriptionRoutes(fastify, { subscriptionService, eventBus })` with a
 *     MOCKED service + eventBus. That means the tier guard under test is the
 *     ACTUAL production handler, not a re-declared copy that could silently
 *     drift. If someone re-loosens /upgrade to forward paid tiers into
 *     upgradeTier(), these assertions go red.
 *
 * iap-validator is mocked only because routes.ts imports it at module load
 * (the real module reads APPLE_SHARED_SECRET / GOOGLE_PLAY_SERVICE_ACCOUNT_JSON
 * and would hit the network). This suite never calls the IAP route.
 */

// ── Mock the iap-validator module (import-time only; unused by this suite) ─────
jest.mock('../src/iap-validator', () => ({
    validateAppleReceipt: jest.fn(),
    validateGoogleReceipt: jest.fn(),
    productIdToTier: jest.fn(),
}));

import Fastify, { FastifyInstance } from 'fastify';
import { subscriptionRoutes } from '../src/routes';

// A syntactically-valid UUID the stub `authenticate` attaches as request.user.id.
const USER_ID = '7c3f9a1c-dead-beef-cafe-0123456789ab';

// The three PAID tiers a malicious client might try to self-grant for free.
const PAID_TIERS = ['PRO', 'PREMIUM', 'ENTERPRISE'] as const;

// Minimal valid Subscription-shaped object the mocked upgradeTier resolves with
// on the (allowed) FREE downgrade path. Only `id` is read by the route.
function fakeSubscription(tier: string) {
    return {
        id: 'sub_11111111-1111-1111-1111-111111111111',
        userId: USER_ID,
        tier,
        status: 'ACTIVE',
        currentPeriodStart: '2026-06-20T00:00:00.000Z',
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        stripeCustomerId: null,
        stripeSubId: null,
        createdAt: '2026-06-20T00:00:00.000Z',
        updatedAt: '2026-06-20T00:00:00.000Z',
        limits: { historyDays: 7, plansPerMonth: 5, aiModels: ['gpt-4o-mini'], analyticsEnabled: false },
    };
}

// Mocked SubscriptionService — only the methods the routes call. upgradeTier is
// the persistence primitive whose CALL COUNT proves the lockdown: it must NOT be
// reached on a paid-tier request, and must be reached exactly once on FREE.
function buildStubService() {
    return {
        upgradeTier: jest.fn(),
        cancel: jest.fn(),
        getByUserId: jest.fn(),
        getLimits: jest.fn(),
    };
}

function buildStubEventBus() {
    return {
        publish: jest.fn(async () => undefined),
        subscribe: jest.fn(async () => undefined),
    };
}

async function buildApp(
    svc: ReturnType<typeof buildStubService>,
    eventBus: ReturnType<typeof buildStubEventBus>,
): Promise<FastifyInstance> {
    const app = Fastify({ logger: false });

    // Stand-in for the @fastify/jwt-backed decorator: attach a user and proceed.
    // Must exist before subscriptionRoutes registers (preHandler refs it).
    app.decorate('authenticate', async (request: any) => {
        request.user = { id: USER_ID };
    });

    await app.register(async (instance) => {
        await subscriptionRoutes(instance, {
            subscriptionService: svc as any,
            eventBus: eventBus as any,
        });
    });

    await app.ready();
    return app;
}

describe('subscription-service paywall lockdown — POST /v1/subscriptions/upgrade cannot self-grant a paid tier', () => {
    let app: FastifyInstance;
    let svc: ReturnType<typeof buildStubService>;
    let eventBus: ReturnType<typeof buildStubEventBus>;

    beforeAll(async () => {
        svc = buildStubService();
        eventBus = buildStubEventBus();
        app = await buildApp(svc, eventBus);
    });

    afterAll(async () => {
        await app.close();
    });

    beforeEach(() => {
        svc.upgradeTier.mockReset();
        svc.cancel.mockReset();
        svc.getByUserId.mockReset();
        svc.getLimits.mockReset();
        eventBus.publish.mockClear();
    });

    // ── The core vulnerability: free user → ENTERPRISE must be rejected ─────────
    it('a free user POSTing { tier: "ENTERPRISE" } is rejected with 402 payment_required and upgradeTier is NEVER called', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/subscriptions/upgrade',
            payload: { tier: 'ENTERPRISE' },
        });

        expect(res.statusCode).toBe(402);
        expect(res.json()).toEqual({
            statusCode: 402,
            error: 'payment_required',
            message: 'Paid plans require a verified purchase',
        });
        // The lockdown: no tier persist happens, so the subscription stays FREE.
        expect(svc.upgradeTier).not.toHaveBeenCalled();
        // And no tier-updated event is emitted off an unverified elevation.
        expect(eventBus.publish).not.toHaveBeenCalled();
    });

    // ── Every paid tier is blocked, not just ENTERPRISE ─────────────────────────
    it.each(PAID_TIERS)('rejects self-granting paid tier "%s" with 402 and never calls upgradeTier', async (tier) => {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/subscriptions/upgrade',
            payload: { tier },
        });

        expect(res.statusCode).toBe(402);
        expect(res.json()).toMatchObject({ error: 'payment_required' });
        expect(svc.upgradeTier).not.toHaveBeenCalled();
    });

    it('the 402 body never echoes the requested paid tier as if it were applied', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/subscriptions/upgrade',
            payload: { tier: 'PREMIUM' },
        });
        expect(res.statusCode).toBe(402);
        // No "success":true / "Subscription updated to PREMIUM" — the request failed.
        expect(res.body).not.toContain('success');
        expect(res.body).not.toContain('Subscription updated');
    });

    // ── The safe transition still works: downgrade / cancel to FREE ─────────────
    it('downgrade to FREE still works: 200, success, and upgradeTier called exactly once with FREE', async () => {
        svc.upgradeTier.mockResolvedValue({ subscription: fakeSubscription('FREE'), fromTier: 'PRO' });

        const res = await app.inject({
            method: 'POST',
            url: '/v1/subscriptions/upgrade',
            payload: { tier: 'FREE' },
        });

        expect(res.statusCode).toBe(200);
        expect(res.json()).toMatchObject({ success: true, message: 'Subscription updated to FREE' });
        expect(svc.upgradeTier).toHaveBeenCalledTimes(1);
        expect(svc.upgradeTier).toHaveBeenCalledWith({ userId: USER_ID, targetTier: 'FREE' });
    });
});
