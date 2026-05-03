/**
 * Stripe integration for NightFuel subscription-service.
 *
 * Handles:
 *  - Checkout session creation (POST /v1/subscriptions/checkout)
 *  - Webhook event processing (POST /v1/subscriptions/webhook)
 *
 * When STRIPE_SECRET_KEY is missing or set to the placeholder, the checkout
 * endpoint returns 503 and webhooks return 400 — so the rest of the service
 * continues to work in local/dev environments without Stripe credentials.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import Stripe from 'stripe';
import type { SubscriptionService } from './subscription.service';
import type { Logger } from 'pino';

// ─── Price IDs — set these env vars in Railway / docker-compose ──────────────
const PRICE_IDS: Record<string, string | undefined> = {
  PRO: process.env['STRIPE_PRICE_PRO'],
  PREMIUM: process.env['STRIPE_PRICE_PREMIUM'],
  ENTERPRISE: process.env['STRIPE_PRICE_ENTERPRISE'],
};

function isStripeConfigured(): boolean {
  const key = process.env['STRIPE_SECRET_KEY'] ?? '';
  return key.length > 0 && !key.startsWith('sk_test_placeholder');
}

// ─── Register Stripe routes on the Fastify instance ──────────────────────────

export function registerStripeRoutes(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fastify: any,
  subscriptionService: SubscriptionService,
  logger: Logger,
): void {
  const stripeKey = process.env['STRIPE_SECRET_KEY'] ?? '';
  const webhookSecret = process.env['STRIPE_WEBHOOK_SECRET'] ?? '';

  if (!isStripeConfigured()) {
    logger.warn('[stripe] STRIPE_SECRET_KEY not configured — Stripe routes active but non-functional');
  }

  const stripe = new Stripe(stripeKey || 'sk_test_placeholder', {
    apiVersion: '2023-10-16',
  });

  // ── Webhook raw body parser ─────────────────────────────────────────────────
  // Stripe signature verification requires the raw request body.
  // We register a content-type parser scoped only to the webhook path.
  fastify.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (req: FastifyRequest, body: Buffer, done: (err: Error | null, body?: unknown) => void) => {
      if ((req as any).routeOptions?.url?.includes('/webhook')) {
        // Pass raw Buffer — do NOT JSON.parse
        done(null, body);
        return;
      }
      try {
        done(null, JSON.parse(body.toString('utf8')));
      } catch (err) {
        done(err as Error);
      }
    },
  );

  // ── POST /v1/subscriptions/checkout ────────────────────────────────────────
  fastify.post(
    '/v1/subscriptions/checkout',
    { preHandler: [(fastify as any).authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!isStripeConfigured()) {
        return reply.status(503).send({
          statusCode: 503,
          error: 'Service Unavailable',
          message: 'Payment processing is not yet configured. Contact support.',
        });
      }

      const user = (request as any).user as { id?: string; userId?: string };
      const userId = user?.id ?? user?.userId;
      if (!userId) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Invalid token' });
      }

      const body = request.body as { tier?: string; successUrl?: string; cancelUrl?: string };
      const { tier, successUrl, cancelUrl } = body;

      if (!tier || !PRICE_IDS[tier]) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: `Invalid or unconfigured tier: ${tier}. Valid options: PRO, PREMIUM, ENTERPRISE`,
        });
      }

      try {
        const session = await stripe.checkout.sessions.create({
          mode: 'subscription',
          line_items: [{ price: PRICE_IDS[tier]!, quantity: 1 }],
          metadata: { userId, tier },
          success_url:
            successUrl ??
            `${process.env['APP_URL'] ?? 'http://localhost:3000'}/settings/subscription?success=1`,
          cancel_url:
            cancelUrl ??
            `${process.env['APP_URL'] ?? 'http://localhost:3000'}/settings/subscription?cancelled=1`,
        });

        logger.info({ userId, tier, sessionId: session.id }, '[stripe] checkout session created');
        return reply.status(200).send({ checkoutUrl: session.url, sessionId: session.id });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        logger.error({ err: message, userId, tier }, '[stripe] checkout session creation failed');
        return reply.status(500).send({ statusCode: 500, error: 'Internal Server Error', message });
      }
    },
  );

  // ── POST /v1/subscriptions/coach/onboard ───────────────────────────────────
  fastify.post(
    '/v1/subscriptions/coach/onboard',
    { preHandler: [(fastify as any).authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!isStripeConfigured()) {
        return reply.status(503).send({ error: 'Stripe not configured' });
      }

      const user = (request as any).user as { id?: string; userId?: string };
      const userId = user?.id ?? user?.userId;
      if (!userId) return reply.status(401).send({ error: 'Unauthorized' });

      try {
        let connectId = await subscriptionService.getStripeConnectId(userId);

        if (!connectId) {
          const account = await stripe.accounts.create({
            type: 'express',
            metadata: { userId },
          });
          connectId = account.id;
          await subscriptionService.updateStripeConnectId(userId, connectId);
        }

        const appUrl = process.env['APP_URL'] ?? 'http://localhost:3000';
        const accountLink = await stripe.accountLinks.create({
          account: connectId,
          refresh_url: `${appUrl}/settings/coach?refresh=1`,
          return_url: `${appUrl}/settings/coach?success=1`,
          type: 'account_onboarding',
        });

        return reply.status(200).send({ onboardingUrl: accountLink.url });
      } catch (err: any) {
        logger.error({ err: err.message, userId }, '[stripe] connect onboarding failed');
        return reply.status(500).send({ error: err.message });
      }
    }
  );

  // ── POST /v1/subscriptions/coach/checkout ────────────────────────────────
  fastify.post(
    '/v1/subscriptions/coach/checkout',
    { preHandler: [(fastify as any).authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!isStripeConfigured()) return reply.status(503).send({ error: 'Stripe not configured' });

      const user = (request as any).user as { id?: string; userId?: string };
      const clientId = user?.id ?? user?.userId;
      if (!clientId) return reply.status(401).send({ error: 'Unauthorized' });

      const body = request.body as { coachId: string; amount: number; successUrl?: string; cancelUrl?: string };
      const { coachId, amount, successUrl, cancelUrl } = body;

      if (!coachId || !amount || amount < 500) { // Min 5.00
        return reply.status(400).send({ error: 'Invalid coachId or amount (min 500 cents)' });
      }

      const coachConnectId = await subscriptionService.getStripeConnectId(coachId);
      if (!coachConnectId) {
        return reply.status(400).send({ error: 'Coach has not set up Stripe payments.' });
      }

      try {
        // NightFuel takes a 10% platform fee
        const applicationFeeAmount = Math.round(amount * 0.10);

        const session = await stripe.checkout.sessions.create({
          mode: 'payment',
          payment_intent_data: {
            application_fee_amount: applicationFeeAmount,
            transfer_data: { destination: coachConnectId },
          },
          line_items: [{
            price_data: {
              currency: 'usd',
              product_data: { name: 'NightFuel Coaching Session' },
              unit_amount: amount,
            },
            quantity: 1,
          }],
          success_url: successUrl ?? `${process.env['APP_URL'] ?? 'http://localhost:3000'}/dashboard/coach?success=1`,
          cancel_url: cancelUrl ?? `${process.env['APP_URL'] ?? 'http://localhost:3000'}/dashboard/coach?cancelled=1`,
        });

        return reply.status(200).send({ checkoutUrl: session.url, sessionId: session.id });
      } catch (err: any) {
        logger.error({ err: err.message, clientId, coachId }, '[stripe] coach checkout failed');
        return reply.status(500).send({ error: 'Internal Server Error' });
      }
    }
  );

  // ── POST /v1/subscriptions/webhook ─────────────────────────────────────────
  // No authentication — verified by Stripe-Signature header instead.
  fastify.post(
    '/v1/subscriptions/webhook',
    { config: { rawBody: true } as any },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const sig = request.headers['stripe-signature'];

      if (!sig || !webhookSecret) {
        logger.warn('[stripe] webhook request missing signature or webhook secret not set');
        return reply.status(400).send({ error: 'Webhook signature verification failed' });
      }

      let event: Stripe.Event;
      try {
        event = stripe.webhooks.constructEvent(
          request.body as Buffer,
          sig as string,
          webhookSecret,
        );
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown';
        logger.warn({ message }, '[stripe] webhook signature verification failed');
        return reply.status(400).send({ error: `Webhook Error: ${message}` });
      }

      logger.info({ type: event.type, id: event.id }, '[stripe] webhook event received');

      // Process asynchronously — return 200 immediately to prevent Stripe retries.
      // Any errors are logged but not returned to Stripe.
      setImmediate(() => void handleStripeEvent(event, subscriptionService, stripe, logger));

      return reply.status(200).send({ received: true });
    },
  );
}

// ─── Event handler ────────────────────────────────────────────────────────────

async function handleStripeEvent(
  event: Stripe.Event,
  subscriptionService: SubscriptionService,
  stripe: Stripe,
  logger: Logger,
): Promise<void> {
  try {
    switch (event.type) {
      // ── Checkout completed → upgrade tier + store Stripe IDs ──────────────
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.['userId'];
        const tier = session.metadata?.['tier'];

        if (!userId || !tier) {
          logger.warn({ sessionId: session.id }, '[stripe] checkout.session.completed missing metadata');
          break;
        }

        await subscriptionService.upgradeTier({
          userId,
          targetTier: tier as any,
        });

        if (session.customer || session.subscription) {
          await subscriptionService.updateStripeIds(userId, {
            stripeCustomerId: (session.customer as string | null) ?? null,
            stripeSubId: (session.subscription as string | null) ?? null,
          });
        }

        logger.info({ userId, tier }, '[stripe] checkout.session.completed — tier upgraded');
        break;
      }

      // ── Subscription updated (plan change / renewal) ──────────────────────
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const userId = sub.metadata?.['userId'];

        if (!userId) {
          // Try to look up by stripeSubId
          logger.warn({ subId: sub.id }, '[stripe] customer.subscription.updated — no userId in metadata');
          break;
        }

        if (sub.status === 'active' || sub.status === 'trialing') {
          const priceId = (sub.items.data[0]?.price.id) ?? '';
          // Reverse map price ID → tier
          const tier = Object.entries(PRICE_IDS).find(([, pid]) => pid === priceId)?.[0];
          if (tier) {
            await subscriptionService.upgradeTier({ userId, targetTier: tier as any });
          }
        } else if (sub.status === 'past_due' || sub.status === 'unpaid') {
          logger.warn({ userId, status: sub.status }, '[stripe] subscription payment issue');
        }
        break;
      }

      // ── Subscription deleted (cancelled / expired) ────────────────────────
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const userId = sub.metadata?.['userId'];
        if (userId) {
          await subscriptionService.cancel({ userId });
          logger.info({ userId }, '[stripe] customer.subscription.deleted — subscription cancelled');
        }
        break;
      }

      // ── Payment failed ────────────────────────────────────────────────────
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        logger.warn(
          { customerId: invoice.customer, attemptCount: invoice.attempt_count },
          '[stripe] invoice.payment_failed',
        );
        // TODO: Emit event to notification-service to send payment failure email/push
        break;
      }

      default:
        logger.debug({ type: event.type }, '[stripe] unhandled event type — ignoring');
    }
  } catch (err) {
    logger.error({ err, eventType: event.type }, '[stripe] handleStripeEvent error');
  }
}
