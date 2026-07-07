/**
 * Regression suite — subscription-service IAP RECEIPT REPLAY / SHARING lockdown
 * (CRITICAL #1) on POST /v1/subscriptions/iap/validate, exercised end-to-end
 * through the REAL `subscriptionRoutes` plugin.
 *
 * Background (the vulnerability this suite locks shut):
 *   The validate route verified an Apple/Google receipt and then called
 *   upgradeTier() WITHOUT ever binding the receipt to a user or deduping it. So a
 *   single valid receipt (Apple's stable originalTransactionId) could be replayed
 *   by an UNLIMITED number of accounts — buy once, share the receipt, everyone
 *   gets PRO/PREMIUM/ENTERPRISE for free.
 *
 *   The fix: before granting any tier, the route calls
 *   subscriptionService.bindIapTransaction({ originalTransactionId, userId, ... }).
 *   The IAPTransaction table's @unique on originalTransactionId binds a receipt to
 *   exactly ONE account. A second, DIFFERENT user submitting the SAME receipt gets
 *   status 'conflict' → HTTP 409 receipt_already_redeemed and upgradeTier is NEVER
 *   called. The original owner re-validating gets 'reaffirmed' and is upgraded
 *   idempotently.
 *
 * Why mount the REAL plugin (not src/index.ts): src/index.ts bootstraps a real
 * Prisma/Redis/cluster at import time and cannot load in a unit test — the same
 * constraint documented atop the sibling suites. We mount the genuine
 * `subscriptionRoutes` with a MOCKED service + eventBus so the route's binding
 * branch is the ACTUAL production handler. `iap-validator` is mocked so the verify
 * step is deterministic and offline.
 */

jest.mock('../src/iap-validator', () => ({
    validateAppleReceipt: jest.fn(),
    validateGoogleReceipt: jest.fn(),
    productIdToTier: jest.fn(),
}));

import Fastify, { FastifyInstance } from 'fastify';
import { subscriptionRoutes } from '../src/routes';
import { validateAppleReceipt, productIdToTier } from '../src/iap-validator';

const mockValidateApple = validateAppleReceipt as jest.Mock;
const mockProductIdToTier = productIdToTier as jest.Mock;

const USER_A = 'aaaaaaaa-dead-beef-cafe-0123456789ab'; // the buyer
const USER_B = 'bbbbbbbb-dead-beef-cafe-0123456789ab'; // the receipt thief
const KNOWN_PRODUCT_ID = 'com.zeitra.app.pro.monthly';
const ORIGINAL_TX_ID = '1000000999888777'; // Apple's stable id the receipt carries

function fakeSubscription(tier: string, userId: string) {
    return {
        id: 'sub_11111111-1111-1111-1111-111111111111',
        userId,
        tier,
        status: 'ACTIVE',
        currentPeriodStart: '2026-06-20T00:00:00.000Z',
        currentPeriodEnd: '2026-12-31T00:00:00.000Z',
        cancelAtPeriodEnd: false,
        stripeCustomerId: null,
        stripeSubId: null,
        createdAt: '2026-06-20T00:00:00.000Z',
        updatedAt: '2026-06-20T00:00:00.000Z',
        limits: { historyDays: 90, plansPerMonth: 30, aiModels: ['gpt-4o'], analyticsEnabled: true },
    };
}

function buildStubService() {
    return {
        upgradeTier: jest.fn(),
        cancel: jest.fn(),
        getByUserId: jest.fn(),
        getLimits: jest.fn(),
        bindIapTransaction: jest.fn(),
    };
}

function buildStubEventBus() {
    return {
        publish: jest.fn(async () => undefined),
        subscribe: jest.fn(async () => undefined),
    };
}

// Build an app whose stub `authenticate` attaches a CONFIGURABLE userId, so the
// same app can act as user A then user B.
async function buildApp(
    svc: ReturnType<typeof buildStubService>,
    eventBus: ReturnType<typeof buildStubEventBus>,
    currentUser: { id: string },
): Promise<FastifyInstance> {
    const app = Fastify({ logger: false });
    app.decorate('authenticate', async (request: any) => {
        request.user = { id: currentUser.id };
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

describe('subscription-service IAP receipt binding — one receipt upgrades exactly one account', () => {
    let app: FastifyInstance;
    let svc: ReturnType<typeof buildStubService>;
    let eventBus: ReturnType<typeof buildStubEventBus>;
    const currentUser = { id: USER_A };

    function iapBody(overrides: Record<string, unknown> = {}) {
        return { platform: 'ios', receipt: 'base64-receipt-blob', productId: KNOWN_PRODUCT_ID, ...overrides };
    }

    beforeAll(async () => {
        svc = buildStubService();
        eventBus = buildStubEventBus();
        app = await buildApp(svc, eventBus, currentUser);
    });

    afterAll(async () => {
        await app.close();
    });

    beforeEach(() => {
        svc.upgradeTier.mockReset();
        svc.bindIapTransaction.mockReset();
        eventBus.publish.mockClear();
        mockValidateApple.mockReset();
        mockProductIdToTier.mockReset();

        // The same valid PRO receipt for both users — same stable transaction id.
        mockProductIdToTier.mockReturnValue('PRO');
        mockValidateApple.mockResolvedValue({
            valid: true,
            tier: 'PRO',
            productId: KNOWN_PRODUCT_ID,
            expiresAt: '2026-12-31T00:00:00.000Z',
            originalTransactionId: ORIGINAL_TX_ID,
        });
    });

    it('first user to redeem the receipt is bound and upgraded (status "bound")', async () => {
        currentUser.id = USER_A;
        svc.bindIapTransaction.mockResolvedValue({ status: 'bound' });
        svc.upgradeTier.mockResolvedValue({ subscription: fakeSubscription('PRO', USER_A), fromTier: 'FREE' });

        const res = await app.inject({ method: 'POST', url: '/v1/subscriptions/iap/validate', payload: iapBody() });

        expect(res.statusCode).toBe(200);
        expect(res.json()).toMatchObject({ valid: true, tier: 'PRO' });
        expect(svc.bindIapTransaction).toHaveBeenCalledWith({
            originalTransactionId: ORIGINAL_TX_ID,
            userId: USER_A,
            platform: 'ios',
            productId: KNOWN_PRODUCT_ID,
            tier: 'PRO',
        });
        expect(svc.upgradeTier).toHaveBeenCalledTimes(1);
        expect(svc.upgradeTier).toHaveBeenCalledWith({ userId: USER_A, targetTier: 'PRO' });
    });

    it('a SECOND, DIFFERENT user submitting the SAME receipt is rejected with 409 and is NEVER upgraded', async () => {
        currentUser.id = USER_B;
        // The binding ledger reports the receipt already belongs to user A.
        svc.bindIapTransaction.mockResolvedValue({ status: 'conflict', boundUserId: USER_A });

        const res = await app.inject({ method: 'POST', url: '/v1/subscriptions/iap/validate', payload: iapBody() });

        expect(res.statusCode).toBe(409);
        expect(res.json()).toEqual({
            valid: false,
            errorCode: 'receipt_already_redeemed',
            errorMessage: 'This receipt has already been redeemed by another account',
        });
        // The core lockdown: the thief's account is never elevated.
        expect(svc.upgradeTier).not.toHaveBeenCalled();
        expect(eventBus.publish).not.toHaveBeenCalled();
        // And the 409 body never leaks who owns the receipt.
        expect(res.body).not.toContain(USER_A);
    });

    it('the original owner re-validating the same receipt is re-affirmed (idempotent) and upgraded', async () => {
        currentUser.id = USER_A;
        svc.bindIapTransaction.mockResolvedValue({ status: 'reaffirmed' });
        svc.upgradeTier.mockResolvedValue({ subscription: fakeSubscription('PRO', USER_A), fromTier: 'PRO' });

        const res = await app.inject({ method: 'POST', url: '/v1/subscriptions/iap/validate', payload: iapBody() });

        expect(res.statusCode).toBe(200);
        expect(res.json()).toMatchObject({ valid: true, tier: 'PRO' });
        expect(svc.upgradeTier).toHaveBeenCalledTimes(1);
    });

    it('a verified receipt with NO stable transaction id is refused (cannot be deduped → cannot be granted)', async () => {
        currentUser.id = USER_A;
        mockValidateApple.mockResolvedValue({
            valid: true,
            tier: 'PRO',
            productId: KNOWN_PRODUCT_ID,
            expiresAt: '2026-12-31T00:00:00.000Z',
            // originalTransactionId intentionally absent
        });

        const res = await app.inject({ method: 'POST', url: '/v1/subscriptions/iap/validate', payload: iapBody() });

        expect(res.statusCode).toBe(200);
        expect(res.json()).toMatchObject({ valid: false, errorCode: 'invalid_receipt' });
        expect(svc.bindIapTransaction).not.toHaveBeenCalled();
        expect(svc.upgradeTier).not.toHaveBeenCalled();
    });
});
