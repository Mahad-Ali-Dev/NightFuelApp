/**
 * RevenueCat webhook for NightFuel subscription-service.
 *
 * RevenueCat is the source of truth for store purchases (StoreKit / Play
 * Billing). The mobile app buys through the RevenueCat SDK; RevenueCat verifies
 * the receipt and then POSTs an event here so the BACKEND tier stays in sync and
 * server-enforced Pro features (AI quota, analytics, history) unlock/lock. The
 * client never tells us the tier — this webhook (authenticated by a shared
 * secret only RevenueCat knows) is authoritative.
 *
 * AUTH: RevenueCat sends the value configured in the dashboard
 * (Project → Integrations → Webhooks → "Authorization header value") as the
 * `Authorization` header on every request. We compare it constant-time to
 * `REVENUECAT_WEBHOOK_AUTH`. Unset ⇒ the route is mounted but rejects EVERYTHING
 * (fail CLOSED) so a misconfigured prod can never accept unauthenticated events.
 *
 * IDEMPOTENCY: RevenueCat retries non-2xx deliveries. upgradeTier() is a no-op
 * when already on the target tier, so replays are safe; we return 200 for every
 * handled / no-op / unknown event and reserve non-2xx for auth/parse failures.
 *
 * appUserID: the mobile app calls Purchases.logIn(user.id) (see
 * clients/mobile/src/lib/purchases/revenueCat.ts → configureRevenueCat), so
 * `event.app_user_id` IS our userId. Anonymous ids ($RCAnonymousID:…) — a
 * purchase before login — can't be mapped and are skipped (logged).
 */

import crypto from 'crypto';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Logger } from 'pino';
import type { SubscriptionService } from './subscription.service';
import { publishTierUpdated, type EventBus } from './events';
import { productIdToTier } from './iap-validator';
import type { SubscriptionTier } from './schemas';

// ── Event-type → action ───────────────────────────────────────────────────────
// https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields
//
// GRANT  → the entitlement is (still) active: set the paid tier.
// REVOKE → the entitlement ended: drop to FREE.
// Everything else (CANCELLATION = auto-renew off but still entitled until
// EXPIRATION; BILLING_ISSUE = grace period, keep access; TRANSFER / ALIAS /
// TEST / INVOICE_ISSUANCE) makes NO tier change — we log and 200 so RevenueCat
// doesn't retry.
const GRANT_EVENTS = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'PRODUCT_CHANGE',
  'NON_RENEWING_PURCHASE',
  'UNCANCELLATION',
  'SUBSCRIPTION_EXTENDED',
  'TEMPORARY_ENTITLEMENT_GRANT',
]);
const REVOKE_EVENTS = new Set([
  'EXPIRATION',
  'SUBSCRIPTION_PAUSED',
]);

interface RevenueCatEvent {
  type?: string;
  app_user_id?: string;
  original_app_user_id?: string;
  product_id?: string;
  entitlement_ids?: string[];
}

/** Constant-time secret comparison (length-safe via SHA-256 pre-hash). */
function secretsMatch(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a, 'utf8').digest();
  const hb = crypto.createHash('sha256').update(b, 'utf8').digest();
  return crypto.timingSafeEqual(ha, hb);
}

/** An app_user_id we can map to a NightFuel user (i.e. not a pre-login anon id). */
function isMappableUserId(id: string | undefined): id is string {
  return typeof id === 'string' && id.length > 0 && !id.startsWith('$RCAnonymousID:');
}

export function registerRevenueCatWebhook(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fastify: FastifyInstance | any,
  subscriptionService: SubscriptionService,
  eventBus: EventBus,
  logger: Logger,
): void {
  const authToken = process.env['REVENUECAT_WEBHOOK_AUTH'] ?? '';
  if (!authToken) {
    logger.warn(
      '[revenuecat] REVENUECAT_WEBHOOK_AUTH not set — webhook mounted but REJECTS all events (fail-closed). Set it (and the same value in the RevenueCat dashboard) to enable.',
    );
  }

  fastify.post(
    '/v1/subscriptions/webhooks/revenuecat',
    {
      // No JWT: the caller is RevenueCat, authenticated by the shared header
      // secret below (not a user bearer token). Keep the schema permissive —
      // RevenueCat sends many fields we don't model.
      schema: {
        description: 'RevenueCat subscription webhook — keeps the backend tier in sync with the store.',
        tags: ['internal'],
        body: {
          type: 'object',
          additionalProperties: true,
          properties: {
            event: { type: 'object', additionalProperties: true },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      // ── Auth (constant-time, fail-closed) ────────────────────────────────────
      const provided = request.headers['authorization'] ?? '';
      if (!authToken || typeof provided !== 'string' || !secretsMatch(provided, authToken)) {
        logger.warn('[revenuecat] webhook rejected: missing/invalid Authorization header');
        // 401 (not 404) — RevenueCat surfaces delivery failures in its dashboard,
        // and this route is documented, not secret.
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Invalid webhook signature' });
      }

      // This service registers a Stripe raw-body content-type parser scoped to any
      // route whose url contains "/webhook" — which includes THIS path — so
      // request.body can arrive as a raw Buffer instead of parsed JSON. Handle both.
      const rawBody = request.body as unknown;
      let body: { event?: RevenueCatEvent } | undefined;
      if (Buffer.isBuffer(rawBody)) {
        try {
          body = JSON.parse(rawBody.toString('utf8'));
        } catch {
          return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'Invalid JSON body' });
        }
      } else {
        body = rawBody as { event?: RevenueCatEvent } | undefined;
      }
      const event = body?.event;
      const type = event?.type;
      if (!event || !type) {
        return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'Missing event' });
      }

      // TEST is what the dashboard's "Send test event" button fires — ack it.
      if (type === 'TEST') {
        logger.info('[revenuecat] TEST event received — webhook auth OK');
        return reply.status(200).send({ received: true, test: true });
      }

      const isGrant = GRANT_EVENTS.has(type);
      const isRevoke = REVOKE_EVENTS.has(type);
      if (!isGrant && !isRevoke) {
        // CANCELLATION / BILLING_ISSUE / TRANSFER / ALIAS / INVOICE_ISSUANCE /
        // unknown: no tier change. Ack so RevenueCat doesn't retry.
        logger.info({ type }, '[revenuecat] event acknowledged, no tier change');
        return reply.status(200).send({ received: true, handled: false });
      }

      const userId = event.app_user_id;
      if (!isMappableUserId(userId)) {
        logger.warn({ type, app_user_id: userId }, '[revenuecat] unmappable app_user_id (anonymous / empty) — skipping');
        // Ack: retrying won't make an anonymous id mappable. The next post-login
        // event (RevenueCat re-sends on alias) will carry the real user id.
        return reply.status(200).send({ received: true, handled: false });
      }

      // Only the Pro entitlement exists today; map the product for forward-safety
      // and default grants to PRO. Revokes always drop to FREE.
      const targetTier: SubscriptionTier = isRevoke
        ? 'FREE'
        : productIdToTier(event.product_id ?? '') ?? 'PRO';

      try {
        const { subscription, fromTier } = await subscriptionService.upgradeTier({ userId, targetTier });
        if (fromTier !== targetTier) {
          void publishTierUpdated(eventBus, logger, {
            userId,
            fromTier: fromTier ?? null,
            toTier: targetTier,
            subscriptionId: subscription.id,
          });
          logger.info({ type, userId, fromTier, toTier: targetTier }, '[revenuecat] tier synced from webhook');
        } else {
          logger.info({ type, userId, tier: targetTier }, '[revenuecat] tier already correct (idempotent no-op)');
        }
        return reply.status(200).send({ received: true, handled: true, tier: targetTier });
      } catch (err) {
        logger.error({ err, type, userId }, '[revenuecat] failed to sync tier');
        // 500 so RevenueCat retries — a transient DB blip shouldn't silently drop
        // a real purchase.
        return reply.status(500).send({ statusCode: 500, error: 'Internal Server Error', message: 'Failed to process event' });
      }
    },
  );

  logger.info('[revenuecat] webhook route registered at POST /v1/subscriptions/webhooks/revenuecat');
}
