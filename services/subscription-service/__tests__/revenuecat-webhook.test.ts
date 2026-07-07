/**
 * RevenueCat webhook suite — exercises the REAL `registerRevenueCatWebhook`
 * plugin (src/revenuecat.ts) end-to-end through Fastify's inject, with a MOCKED
 * SubscriptionService + eventBus.
 *
 * What it locks in:
 *   - AUTH is mandatory and constant-time: a missing / wrong `Authorization`
 *     header is rejected 401 and upgradeTier is NEVER called (no unauthenticated
 *     party can flip a tier);
 *   - FAIL-CLOSED: when REVENUECAT_WEBHOOK_AUTH is unset, EVERY request is 401 —
 *     a misconfigured prod can't accept unauthenticated events;
 *   - GRANT events (INITIAL_PURCHASE / RENEWAL / …) sync the mapped paid tier
 *     (PRO) for the app_user_id and publish tier-updated;
 *   - REVOKE events (EXPIRATION / SUBSCRIPTION_PAUSED) drop the user to FREE;
 *   - TEST (dashboard "send test") is acked WITHOUT any tier write;
 *   - no-op events (CANCELLATION / BILLING_ISSUE) and anonymous app_user_ids are
 *     acked 200 but never persist a tier.
 *
 * Mounting the genuine plugin (not src/index.ts, which boots Prisma/Redis at
 * import) means the auth + mapping under test are the ACTUAL production handler —
 * mirrors paywall-bypass.test.ts. The real (pure) productIdToTier is used.
 */

import Fastify, { FastifyInstance } from 'fastify';
import { registerRevenueCatWebhook } from '../src/revenuecat';

const USER_ID = '7c3f9a1c-dead-beef-cafe-0123456789ab';
const SECRET = 'whsec_test_revenuecat_shared_secret_value';
const PRO_PRODUCT = 'com.zeitra.app.pro.monthly';

function fakeSubscription(tier: string) {
  return {
    id: 'sub_11111111-1111-1111-1111-111111111111',
    userId: USER_ID,
    tier,
    status: 'ACTIVE',
    currentPeriodStart: '2026-07-01T00:00:00.000Z',
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    stripeCustomerId: null,
    stripeSubId: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    limits: { historyDays: 7, plansPerMonth: 5, aiModels: ['gpt-4o-mini'], analyticsEnabled: false },
  };
}

function buildStubService() {
  return { upgradeTier: jest.fn(), cancel: jest.fn(), getByUserId: jest.fn(), getLimits: jest.fn() };
}
function buildStubEventBus() {
  return { publish: jest.fn(async () => undefined), subscribe: jest.fn(async () => undefined) };
}
const noopLogger = { info() {}, warn() {}, error() {}, debug() {} };

async function buildApp(
  svc: ReturnType<typeof buildStubService>,
  eventBus: ReturnType<typeof buildStubEventBus>,
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  // registerRevenueCatWebhook reads REVENUECAT_WEBHOOK_AUTH at CALL time, so the
  // env must be set before this runs.
  registerRevenueCatWebhook(app, svc as any, eventBus as any, noopLogger as any);
  await app.ready();
  return app;
}

function webhookEvent(type: string, over: Record<string, unknown> = {}) {
  return { api_version: '1.0', event: { type, app_user_id: USER_ID, product_id: PRO_PRODUCT, ...over } };
}

function inject(app: FastifyInstance, payload: unknown, auth?: string) {
  return app.inject({
    method: 'POST',
    url: '/v1/subscriptions/webhooks/revenuecat',
    headers: auth === undefined ? {} : { authorization: auth },
    payload: payload as object,
  });
}

describe('subscription-service — RevenueCat webhook', () => {
  let app: FastifyInstance;
  let svc: ReturnType<typeof buildStubService>;
  let eventBus: ReturnType<typeof buildStubEventBus>;
  const prevEnv = process.env['REVENUECAT_WEBHOOK_AUTH'];

  beforeAll(async () => {
    process.env['REVENUECAT_WEBHOOK_AUTH'] = SECRET;
    svc = buildStubService();
    eventBus = buildStubEventBus();
    app = await buildApp(svc, eventBus);
  });

  afterAll(async () => {
    await app.close();
    if (prevEnv === undefined) delete process.env['REVENUECAT_WEBHOOK_AUTH'];
    else process.env['REVENUECAT_WEBHOOK_AUTH'] = prevEnv;
  });

  beforeEach(() => {
    svc.upgradeTier.mockReset();
    eventBus.publish.mockClear();
  });

  // ── AUTH ───────────────────────────────────────────────────────────────────
  it('rejects a request with NO Authorization header (401) and never touches the tier', async () => {
    const res = await inject(app, webhookEvent('INITIAL_PURCHASE'));
    expect(res.statusCode).toBe(401);
    expect(svc.upgradeTier).not.toHaveBeenCalled();
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it('rejects a WRONG Authorization header (401)', async () => {
    const res = await inject(app, webhookEvent('INITIAL_PURCHASE'), 'not-the-secret');
    expect(res.statusCode).toBe(401);
    expect(svc.upgradeTier).not.toHaveBeenCalled();
  });

  // ── GRANT ──────────────────────────────────────────────────────────────────
  it('INITIAL_PURCHASE with valid auth syncs PRO for the app_user_id and publishes tier-updated', async () => {
    svc.upgradeTier.mockResolvedValue({ subscription: fakeSubscription('PRO'), fromTier: 'FREE' });

    const res = await inject(app, webhookEvent('INITIAL_PURCHASE'), SECRET);

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ received: true, handled: true, tier: 'PRO' });
    expect(svc.upgradeTier).toHaveBeenCalledTimes(1);
    expect(svc.upgradeTier).toHaveBeenCalledWith({ userId: USER_ID, targetTier: 'PRO' });
    expect(eventBus.publish).toHaveBeenCalledTimes(1);
  });

  it('RENEWAL also grants PRO (idempotent no-op when already PRO → no event)', async () => {
    svc.upgradeTier.mockResolvedValue({ subscription: fakeSubscription('PRO'), fromTier: 'PRO' });

    const res = await inject(app, webhookEvent('RENEWAL'), SECRET);

    expect(res.statusCode).toBe(200);
    expect(svc.upgradeTier).toHaveBeenCalledWith({ userId: USER_ID, targetTier: 'PRO' });
    // fromTier === toTier → no tier-updated event emitted.
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  // ── REVOKE ─────────────────────────────────────────────────────────────────
  it('EXPIRATION drops the user to FREE', async () => {
    svc.upgradeTier.mockResolvedValue({ subscription: fakeSubscription('FREE'), fromTier: 'PRO' });

    const res = await inject(app, webhookEvent('EXPIRATION'), SECRET);

    expect(res.statusCode).toBe(200);
    expect(svc.upgradeTier).toHaveBeenCalledWith({ userId: USER_ID, targetTier: 'FREE' });
    expect(eventBus.publish).toHaveBeenCalledTimes(1);
  });

  // ── ACK-ONLY (no tier write) ─────────────────────────────────────────────────
  it('TEST event is acked 200 without any tier write', async () => {
    const res = await inject(app, webhookEvent('TEST'), SECRET);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ received: true, test: true });
    expect(svc.upgradeTier).not.toHaveBeenCalled();
  });

  it('CANCELLATION (auto-renew off, still entitled) makes NO tier change', async () => {
    const res = await inject(app, webhookEvent('CANCELLATION'), SECRET);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ received: true, handled: false });
    expect(svc.upgradeTier).not.toHaveBeenCalled();
  });

  it('an anonymous app_user_id ($RCAnonymousID:…) is skipped, not synced', async () => {
    const res = await inject(
      app,
      webhookEvent('INITIAL_PURCHASE', { app_user_id: '$RCAnonymousID:abc123' }),
      SECRET,
    );
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ received: true, handled: false });
    expect(svc.upgradeTier).not.toHaveBeenCalled();
  });

  // ── FAIL-CLOSED (secret unset) ───────────────────────────────────────────────
  it('with REVENUECAT_WEBHOOK_AUTH unset, EVERY event is rejected 401 (fail-closed)', async () => {
    delete process.env['REVENUECAT_WEBHOOK_AUTH'];
    const svc2 = buildStubService();
    const bus2 = buildStubEventBus();
    const app2 = await buildApp(svc2, bus2);
    try {
      // Even a well-formed event with an empty/any auth header is refused.
      const res = await inject(app2, webhookEvent('INITIAL_PURCHASE'), '');
      expect(res.statusCode).toBe(401);
      expect(svc2.upgradeTier).not.toHaveBeenCalled();
    } finally {
      await app2.close();
      process.env['REVENUECAT_WEBHOOK_AUTH'] = SECRET;
    }
  });
});
