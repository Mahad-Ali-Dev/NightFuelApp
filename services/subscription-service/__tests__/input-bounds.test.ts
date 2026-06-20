/**
 * Regression suite — subscription-service INPUT-BOUNDS + redaction hardening on
 * the authenticated write surface (src/routes.ts), exercised end-to-end through
 * the REAL `subscriptionRoutes` plugin.
 *
 * This is deliberately ADDITIVE and DISJOINT from the two existing
 * subscription-service suites — neither proves what THIS suite proves:
 *   - error-redaction.test.ts          locks the SHARED 5xx/<500 redaction
 *                                      contract against synthetic throwing routes
 *                                      AND re-mirrors the cancel-404 literal on a
 *                                      stand-in route (it never mounts routes.ts).
 *   - stripe-webhook-redaction.test.ts locks the Stripe webhook signature-failure
 *                                      no-leak contract on src/stripe.ts.
 * THIS suite raises request-bounds coverage on the GENUINE route plugin: that an
 * out-of-enum / empty / unknown input is rejected with a real HTTP 400 (and the
 * relevant service / IAP function is NOT invoked), that valid input is NOT a 400
 * (and the service IS invoked once), and that the cancel no-subscription branch
 * ships the fixed 404 literal without ever leaking the raw internal userId.
 *
 * Why mount the REAL `subscriptionRoutes` plugin (not src/index.ts):
 *   - The service bootstrap module (src/index.ts) opens a real Prisma client +
 *     Redis bus + Stripe routes + cluster bootstrap at import time (via
 *     `void bootstrap()`) and cannot be loaded in a unit test — the same
 *     constraint documented atop error-redaction.test.ts.
 *   - So we mount a Fastify app and register the genuine
 *     `subscriptionRoutes(fastify, { subscriptionService, eventBus })` with a
 *     MOCKED service + eventBus, meaning the body schemas + the in-route
 *     productId/cancel branching under test are the ACTUAL production code, not a
 *     re-declared copy that could silently drift.
 *
 * Validation wiring note: unlike the plan/notification input-bounds suites (whose
 * routes validate via `fastify-type-provider-zod`), subscription-service's routes
 * declare NATIVE Fastify JSON-schema `body` blocks (the `enum` / `minLength`
 * constraints in src/routes.ts) plus, on /upgrade, a manual
 * `UpgradeBodySchema.safeParse`. So bad tier/platform/receipt/productId is
 * rejected by Fastify's DEFAULT (Ajv) validator BEFORE the handler runs — we do
 * NOT register a zod validatorCompiler here, exactly mirroring production.
 *
 * `iap-validator` is mocked so `validateAppleReceipt` / `validateGoogleReceipt`
 * are controllable jest.fns and `productIdToTier` (re-exported into routes.ts as
 * `iapProductIdToTier`) is forced per-test — this lets us prove the
 * "unknown productId → 400 product_id_mismatch BEFORE Apple/Google" short-circuit
 * without a network call, and the "known productId + matching verified tier →
 * not 400" happy path deterministically.
 */

// ── Mock the iap-validator module ────────────────────────────────────────────
// routes.ts imports { validateAppleReceipt, validateGoogleReceipt,
// productIdToTier as iapProductIdToTier } from './iap-validator'. The real
// validators hit Apple/Google over the network (and read APPLE_SHARED_SECRET /
// GOOGLE_PLAY_SERVICE_ACCOUNT_JSON); we replace all three with jest.fns so the
// route's own branching is the code under test, deterministically and offline.
jest.mock('../src/iap-validator', () => ({
    validateAppleReceipt: jest.fn(),
    validateGoogleReceipt: jest.fn(),
    productIdToTier: jest.fn(),
}));

import Fastify, { FastifyInstance } from 'fastify';
import { subscriptionRoutes } from '../src/routes';
import {
    validateAppleReceipt,
    validateGoogleReceipt,
    productIdToTier,
} from '../src/iap-validator';

// Typed handles to the mocked module fns.
const mockValidateApple = validateAppleReceipt as jest.Mock;
const mockValidateGoogle = validateGoogleReceipt as jest.Mock;
const mockProductIdToTier = productIdToTier as jest.Mock;

// A syntactically-valid UUID the stub `authenticate` attaches as request.user.id.
// It doubles as the value the service embeds in its thrown
// `No subscription found for user ${userId}` message — the redaction assertions
// below prove this exact string never appears on the cancel 404 wire.
const USER_ID = '7c3f9a1c-dead-beef-cafe-0123456789ab';

// A real, mapped product ID (mirrors PRODUCT_ID_TO_TIER in src/iap-validator.ts
// and clients/mobile/src/lib/iap.ts). Well-formed AND known → passes the
// productId short-circuit so the validator mock is reached.
const KNOWN_PRODUCT_ID = 'com.zeitra.app.pro.monthly';
// A well-formed but UNKNOWN SKU — non-empty (so it clears minLength) yet maps to
// no tier, driving the product_id_mismatch 400 BEFORE any Apple/Google call.
const UNKNOWN_PRODUCT_ID = 'com.zeitra.app.bogus.lifetime';

// Minimal valid Subscription-shaped object the mocked upgradeTier resolves with.
// Only `id` is read by the route (for the tier-updated event); the rest mirror
// the real response shape so an accidental serialization tighten would surface.
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
        limits: { historyDays: 90, plansPerMonth: 30, aiModels: ['gpt-4o'], analyticsEnabled: true },
    };
}

// Mocked SubscriptionService — only the four methods the routes call. Each is a
// jest.fn so we can assert call counts (e.g. "valid → called once", "bad input →
// NOT called") and control the cancel rejection branch.
function buildStubService() {
    return {
        upgradeTier: jest.fn(),
        cancel: jest.fn(),
        getByUserId: jest.fn(),
        getLimits: jest.fn(),
    };
}

// Mocked EventBus — publishTierUpdated calls eventBus.publish(...). It is fired
// "void" (non-blocking, non-fatal) by the route; a resolved stub keeps it inert.
function buildStubEventBus() {
    return {
        publish: jest.fn(async () => undefined),
        subscribe: jest.fn(async () => undefined),
    };
}

/**
 * Build a Fastify app that mounts the GENUINE `subscriptionRoutes` plugin with
 * the mocked service + eventBus.
 *
 *   - `authenticate` is decorated BEFORE registration (the routes reference
 *     `(fastify as any).authenticate` in their `preHandler` at registration
 *     time) and attaches `request.user = { id: USER_ID }` so the handler's
 *     extractUserId() succeeds — auth itself is locked by the shared 401 guard /
 *     error-redaction suite, not here.
 *   - No zod validatorCompiler is set: these routes validate via native Fastify
 *     JSON-schema, exactly as production does.
 */
async function buildApp(
    svc: ReturnType<typeof buildStubService>,
    eventBus: ReturnType<typeof buildStubEventBus>,
): Promise<FastifyInstance> {
    const app = Fastify({ logger: false });

    // Stand-in for the real @fastify/jwt-backed decorator: attach a user and
    // proceed. Must exist before subscriptionRoutes registers (preHandler refs).
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

describe('subscription-service input-bounds — genuine routes reject bad input + redact (mocked service/eventBus/iap)', () => {
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
        // Reset call history + implementations between tests so call-count
        // assertions ("not called" / "called once") are independent.
        svc.upgradeTier.mockReset();
        svc.cancel.mockReset();
        svc.getByUserId.mockReset();
        svc.getLimits.mockReset();
        eventBus.publish.mockClear();
        mockValidateApple.mockReset();
        mockValidateGoogle.mockReset();
        mockProductIdToTier.mockReset();
    });

    // ── POST /v1/subscriptions/upgrade — tier enum bound ────────────────────────
    describe('POST /v1/subscriptions/upgrade — tier enum', () => {
        it('rejects a tier outside the enum ("GOLD") with a 400 and never calls upgradeTier', async () => {
            const res = await app.inject({
                method: 'POST',
                url: '/v1/subscriptions/upgrade',
                payload: { tier: 'GOLD' },
            });
            expect(res.statusCode).toBe(400);
            expect(svc.upgradeTier).not.toHaveBeenCalled();
        });

        it('rejects a missing tier with a 400 and never calls upgradeTier', async () => {
            const res = await app.inject({
                method: 'POST',
                url: '/v1/subscriptions/upgrade',
                payload: {},
            });
            expect(res.statusCode).toBe(400);
            expect(svc.upgradeTier).not.toHaveBeenCalled();
        });

        it('accepts a valid tier ("PRO"): NOT a 400 and calls upgradeTier exactly once', async () => {
            // fromTier === target so the route does not even attempt to publish,
            // but the eventBus stub is inert regardless.
            svc.upgradeTier.mockResolvedValue({ subscription: fakeSubscription('PRO'), fromTier: 'PRO' });

            const res = await app.inject({
                method: 'POST',
                url: '/v1/subscriptions/upgrade',
                payload: { tier: 'PRO' },
            });

            expect(res.statusCode).not.toBe(400);
            expect(res.statusCode).toBe(200);
            expect(svc.upgradeTier).toHaveBeenCalledTimes(1);
            expect(svc.upgradeTier).toHaveBeenCalledWith({ userId: USER_ID, targetTier: 'PRO' });
        });
    });

    // ── POST /v1/subscriptions/iap/validate — platform / receipt / productId ────
    describe('POST /v1/subscriptions/iap/validate — bounds + productId short-circuit', () => {
        // A representative, in-bounds body the rejection tests selectively break.
        function validIapBody(overrides: Record<string, unknown> = {}) {
            return {
                platform: 'ios',
                receipt: 'base64-receipt-blob',
                productId: KNOWN_PRODUCT_ID,
                ...overrides,
            };
        }

        it('rejects an out-of-enum platform ("windows") with a 400 before touching productId/Apple/Google', async () => {
            const res = await app.inject({
                method: 'POST',
                url: '/v1/subscriptions/iap/validate',
                payload: validIapBody({ platform: 'windows' }),
            });
            expect(res.statusCode).toBe(400);
            // Native-schema rejection short-circuits before the handler body runs.
            expect(mockProductIdToTier).not.toHaveBeenCalled();
            expect(mockValidateApple).not.toHaveBeenCalled();
            expect(mockValidateGoogle).not.toHaveBeenCalled();
        });

        it('rejects an empty receipt with a 400 (minLength 1) and never validates the receipt', async () => {
            const res = await app.inject({
                method: 'POST',
                url: '/v1/subscriptions/iap/validate',
                payload: validIapBody({ receipt: '' }),
            });
            expect(res.statusCode).toBe(400);
            expect(mockValidateApple).not.toHaveBeenCalled();
            expect(mockValidateGoogle).not.toHaveBeenCalled();
        });

        it('rejects an empty productId with a 400 (minLength 1)', async () => {
            const res = await app.inject({
                method: 'POST',
                url: '/v1/subscriptions/iap/validate',
                payload: validIapBody({ productId: '' }),
            });
            expect(res.statusCode).toBe(400);
            expect(mockProductIdToTier).not.toHaveBeenCalled();
        });

        it('rejects a missing required field (no platform) with a 400', async () => {
            const body = validIapBody();
            delete (body as Record<string, unknown>).platform;
            const res = await app.inject({
                method: 'POST',
                url: '/v1/subscriptions/iap/validate',
                payload: body,
            });
            expect(res.statusCode).toBe(400);
        });

        it('rejects an unknown-but-well-formed productId with 400 errorCode "product_id_mismatch" BEFORE Apple/Google', async () => {
            // productId clears minLength but maps to no tier → the in-route
            // defense-in-depth short-circuit fires before any verifyReceipt call.
            mockProductIdToTier.mockReturnValue(null);

            const res = await app.inject({
                method: 'POST',
                url: '/v1/subscriptions/iap/validate',
                payload: validIapBody({ productId: UNKNOWN_PRODUCT_ID }),
            });

            expect(res.statusCode).toBe(400);
            expect(res.json()).toEqual({
                valid: false,
                errorCode: 'product_id_mismatch',
                errorMessage: `Unknown product ${UNKNOWN_PRODUCT_ID}`,
            });
            // The whole point of the short-circuit: Apple/Google are never hit.
            expect(mockValidateApple).not.toHaveBeenCalled();
            expect(mockValidateGoogle).not.toHaveBeenCalled();
        });

        it('accepts a known productId whose verified tier matches: NOT a 400 (200 valid) and upgrades once', async () => {
            mockProductIdToTier.mockReturnValue('PRO');
            // Apple returns a verified PRO receipt matching the claimed product.
            mockValidateApple.mockResolvedValue({
                valid: true,
                tier: 'PRO',
                productId: KNOWN_PRODUCT_ID,
                expiresAt: '2026-12-31T00:00:00.000Z',
            });
            svc.upgradeTier.mockResolvedValue({ subscription: fakeSubscription('PRO'), fromTier: 'FREE' });

            const res = await app.inject({
                method: 'POST',
                url: '/v1/subscriptions/iap/validate',
                payload: validIapBody({ platform: 'ios', productId: KNOWN_PRODUCT_ID }),
            });

            expect(res.statusCode).not.toBe(400);
            expect(res.statusCode).toBe(200);
            expect(res.json()).toMatchObject({ valid: true, tier: 'PRO' });
            // The verified receipt drove a single tier persist.
            expect(mockValidateApple).toHaveBeenCalledTimes(1);
            expect(svc.upgradeTier).toHaveBeenCalledTimes(1);
            expect(svc.upgradeTier).toHaveBeenCalledWith({ userId: USER_ID, targetTier: 'PRO' });
        });
    });

    // ── POST /v1/subscriptions/cancel — no-subscription redaction ───────────────
    describe('POST /v1/subscriptions/cancel — redacted 404 / 500', () => {
        it('no-subscription branch → 404 with the EXACT fixed literal, never the raw userId', async () => {
            // The real service throws this shape; the route catches it and ships a
            // fixed literal instead of echoing the userId-bearing message.
            svc.cancel.mockRejectedValue(new Error(`No subscription found for user ${USER_ID}`));

            const res = await app.inject({
                method: 'POST',
                url: '/v1/subscriptions/cancel',
                payload: {},
            });

            expect(res.statusCode).toBe(404);
            expect(res.json()).toEqual({
                statusCode: 404,
                error: 'Not Found',
                message: 'No active subscription found',
            });
            // The core leak: the internal userId must NOT appear on the wire.
            expect(res.body).not.toContain(USER_ID);
            // Nor the raw thrown phrasing that carried it.
            expect(res.body).not.toContain('No subscription found for user');
        });

        it('a generic failure → 500 that does NOT echo err.message', async () => {
            // A different (non-"No subscription found") error drives the 500 branch.
            // Every fragment here is an internal-leak signal the route must strip.
            const LEAKY = 'connect ECONNREFUSED 127.0.0.1:5432 at cancel (/app/src/subscription.service.ts:280)';
            svc.cancel.mockRejectedValue(new Error(LEAKY));

            const res = await app.inject({
                method: 'POST',
                url: '/v1/subscriptions/cancel',
                payload: {},
            });

            expect(res.statusCode).toBe(500);
            expect(res.json()).toEqual({
                statusCode: 500,
                error: 'Internal Server Error',
                message: 'Failed to cancel subscription',
            });
            // The route ships a fixed generic — none of the cause leaks.
            expect(res.body).not.toContain(LEAKY);
            expect(res.body).not.toContain('ECONNREFUSED');
            expect(res.body).not.toContain('127.0.0.1');
            expect(res.body).not.toContain('5432');
            expect(res.body).not.toContain('/app/src');
            expect(res.body).not.toContain('at cancel');
        });

        it('a valid cancel → 200 (service called once) — bounds/redaction never block the happy path', async () => {
            svc.cancel.mockResolvedValue(fakeSubscription('PRO'));

            const res = await app.inject({
                method: 'POST',
                url: '/v1/subscriptions/cancel',
                payload: {},
            });

            expect(res.statusCode).toBe(200);
            expect(res.json()).toMatchObject({ success: true });
            expect(svc.cancel).toHaveBeenCalledTimes(1);
            expect(svc.cancel).toHaveBeenCalledWith({ userId: USER_ID });
        });
    });
});
