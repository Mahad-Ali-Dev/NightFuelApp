import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { SubscriptionService } from './subscription.service';
import type { EventBus } from './events';
import { publishTierUpdated } from './events';
import { sendUnauthorizedPayload, makeInternalAuthGuard } from '@nightfuel/config';
import {
  TIER_CATALOGUE,
  UpgradeBodySchema,
  type UpgradeBody,
  type SubscriptionTier,
} from './schemas';
import {
  validateAppleReceipt,
  validateGoogleReceipt,
  productIdToTier as iapProductIdToTier,
} from './iap-validator';

// ─────────────────────────────────────────────────────────────────────────────
// Helper — extract userId from the JWT payload attached by @fastify/jwt.
// The JWT payload shape differs across services, so we check both `.id` and
// `.userId` as instructed.
// ─────────────────────────────────────────────────────────────────────────────

function extractUserId(request: FastifyRequest): string {
  // @ts-ignore – request.user is unknown; intentional per project rules
  const user = request.user as any;
  const userId: string | undefined = user?.id ?? user?.userId;

  if (!userId || typeof userId !== 'string') {
    throw new Error('JWT payload does not contain a valid user id');
  }

  return userId;
}

// ─────────────────────────────────────────────────────────────────────────────
// Plugin
// ─────────────────────────────────────────────────────────────────────────────

interface RoutesPluginOptions {
  subscriptionService: SubscriptionService;
  eventBus: EventBus;
  /**
   * Shared server-to-server token (INTERNAL_SERVICE_TOKEN) gating the
   * /v1/subscriptions/internal/* routes. Optional so existing callers/tests that
   * don't exercise internal routes keep working; when unset the guard fails
   * CLOSED (every internal request 404s).
   */
  internalServiceToken?: string;
}

export async function subscriptionRoutes(
  fastify: FastifyInstance,
  options: RoutesPluginOptions,
): Promise<void> {
  const { subscriptionService, eventBus } = options;

  // ── Internal-token guard (F34 #5 / F35a pattern) ────────────────────────────
  // Constant-time X-Internal-Token check for the server-to-server-only
  // /internal/* routes below; 404s on a missing/wrong token (mirrors the nginx
  // edge) so a probe can't distinguish a guarded route from a missing one.
  const internalAuth = makeInternalAuthGuard(options.internalServiceToken);
  // Cast: fastify.log is FastifyBaseLogger; events.ts expects pino.Logger — both are structurally compatible at runtime.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const log = fastify.log as any;

  // ── GET /v1/subscriptions/tiers ────────────────────────────────────────────
  // Public — no auth required.
  fastify.get(
    '/v1/subscriptions/tiers',
    {
      schema: {
        description: 'List all available subscription tiers with feature descriptions.',
        tags: ['subscriptions'],
        response: {
          200: {
            type: 'object',
            properties: {
              tiers: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    tier: { type: 'string' },
                    displayName: { type: 'string' },
                    priceUsdMonthly: { type: ['number', 'null'] },
                    description: { type: 'string' },
                    features: { type: 'array', items: { type: 'string' } },
                    limits: {
                      type: 'object',
                      properties: {
                        historyDays: { type: 'number' },
                        plansPerMonth: { type: 'number' },
                        aiModels: { type: 'array', items: { type: 'string' } },
                        analyticsEnabled: { type: 'boolean' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      return reply.status(200).send({ tiers: TIER_CATALOGUE });
    },
  );

  // ── GET /v1/subscriptions/me ───────────────────────────────────────────────
  fastify.get(
    '/v1/subscriptions/me',
    {
      preHandler: [(fastify as any).authenticate],
      schema: {
        description: "Retrieve the authenticated user's current subscription including tier limits.",
        tags: ['subscriptions'],
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              userId: { type: 'string' },
              tier: { type: 'string' },
              status: { type: 'string' },
              currentPeriodStart: { type: 'string' },
              currentPeriodEnd: { type: ['string', 'null'] },
              cancelAtPeriodEnd: { type: 'boolean' },
              stripeCustomerId: { type: ['string', 'null'] },
              stripeSubId: { type: ['string', 'null'] },
              createdAt: { type: 'string' },
              updatedAt: { type: 'string' },
              limits: {
                type: 'object',
                properties: {
                  historyDays: { type: 'number' },
                  plansPerMonth: { type: 'number' },
                  aiModels: { type: 'array', items: { type: 'string' } },
                  analyticsEnabled: { type: 'boolean' },
                },
              },
            },
          },
          401: {
            type: 'object',
            properties: {
              statusCode: { type: 'number' },
              error: { type: 'string' },
              message: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      let userId: string;
      try {
        userId = extractUserId(request);
      } catch (err) {
        log.warn({ err }, 'routes: failed to extract userId from JWT');
        return sendUnauthorizedPayload(reply, request, err);
      }

      try {
        const subscription = await subscriptionService.getByUserId(userId);
        return reply.status(200).send(subscription);
      } catch (err) {
        log.error({ userId, err }, 'routes: GET /me – unexpected error');
        return reply.status(500).send({ statusCode: 500, error: 'Internal Server Error', message: 'Failed to retrieve subscription' });
      }
    },
  );

  // ── GET /v1/subscriptions/me/limits ───────────────────────────────────────
  fastify.get(
    '/v1/subscriptions/me/limits',
    {
      preHandler: [(fastify as any).authenticate],
      schema: {
        description: 'Returns feature limits and usage context for the current tier.',
        tags: ['subscriptions'],
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: 'object',
            properties: {
              tier: { type: 'string' },
              status: { type: 'string' },
              limits: {
                type: 'object',
                properties: {
                  historyDays: { type: 'number' },
                  plansPerMonth: { type: 'number' },
                  aiModels: { type: 'array', items: { type: 'string' } },
                  analyticsEnabled: { type: 'boolean' },
                },
              },
              usageContext: {
                type: 'object',
                properties: {
                  historyDaysLabel: { type: 'string' },
                  plansPerMonthLabel: { type: 'string' },
                  isUnlimitedHistory: { type: 'boolean' },
                  isUnlimitedPlans: { type: 'boolean' },
                },
              },
            },
          },
          401: {
            type: 'object',
            properties: {
              statusCode: { type: 'number' },
              error: { type: 'string' },
              message: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      let userId: string;
      try {
        userId = extractUserId(request);
      } catch (err) {
        log.warn({ err }, 'routes: failed to extract userId from JWT');
        return sendUnauthorizedPayload(reply, request, err);
      }

      try {
        const limits = await subscriptionService.getLimits(userId);
        return reply.status(200).send(limits);
      } catch (err) {
        log.error({ userId, err }, 'routes: GET /me/limits – unexpected error');
        return reply.status(500).send({ statusCode: 500, error: 'Internal Server Error', message: 'Failed to retrieve limits' });
      }
    },
  );

  // ── POST /v1/subscriptions/upgrade ────────────────────────────────────────
  fastify.post(
    '/v1/subscriptions/upgrade',
    {
      preHandler: [(fastify as any).authenticate],
      schema: {
        description: 'Upgrade or change the subscription tier for the authenticated user.',
        tags: ['subscriptions'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['tier'],
          properties: {
            tier: {
              type: 'string',
              enum: ['FREE', 'PRO', 'PREMIUM', 'ENTERPRISE'],
              description: 'Target subscription tier.',
            },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              message: { type: 'string' },
              subscription: { type: 'object' },
            },
          },
          400: {
            type: 'object',
            properties: {
              statusCode: { type: 'number' },
              error: { type: 'string' },
              message: { type: 'string' },
            },
          },
          401: {
            type: 'object',
            properties: {
              statusCode: { type: 'number' },
              error: { type: 'string' },
              message: { type: 'string' },
            },
          },
          402: {
            type: 'object',
            properties: {
              statusCode: { type: 'number' },
              error: { type: 'string' },
              message: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      let userId: string;
      try {
        userId = extractUserId(request);
      } catch (err) {
        log.warn({ err }, 'routes: failed to extract userId from JWT');
        return sendUnauthorizedPayload(reply, request, err);
      }

      // Validate body with Zod manually (fastify-type-provider-zod is registered
      // at app level; here we do an explicit parse for belt-and-suspenders safety).
      const parseResult = UpgradeBodySchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: parseResult.error.issues.map((i) => i.message).join(', '),
        });
      }

      const { tier } = parseResult.data as UpgradeBody;

      // SECURITY (paywall / revenue bypass): this route is authenticated but
      // performs NO payment verification, so it must never grant a PAID tier.
      // Elevation to a paid plan (PRO / PREMIUM / ENTERPRISE) is only legitimate
      // via the verified purchase flows — POST /v1/subscriptions/iap/validate
      // (Apple/Google receipt validation) or the Stripe webhook. Both of those
      // call subscriptionService.upgradeTier() directly after verifying payment;
      // this client-callable path is restricted to the safe transition: FREE
      // (downgrade / cancel). Any attempt to set a paid tier here is rejected so
      // a user cannot grant themselves a free upgrade.
      if (tier !== 'FREE') {
        log.warn({ userId, tier }, 'routes: POST /upgrade – rejected paid-tier elevation without verified purchase');
        return reply.status(402).send({
          statusCode: 402,
          error: 'payment_required',
          message: 'Paid plans require a verified purchase',
        });
      }

      try {
        const { subscription, fromTier } = await subscriptionService.upgradeTier({
          userId,
          targetTier: tier as SubscriptionTier,
        });

        // Publish tier-updated event asynchronously (non-blocking, non-fatal).
        if (fromTier !== tier) {
          void publishTierUpdated(eventBus, log, {
            userId,
            fromTier: fromTier ?? null,
            toTier: tier,
            subscriptionId: subscription.id,
          });
        }

        return reply.status(200).send({
          success: true,
          message: `Subscription updated to ${tier}`,
          subscription,
        });
      } catch (err) {
        log.error({ userId, tier, err }, 'routes: POST /upgrade – unexpected error');
        return reply.status(500).send({ statusCode: 500, error: 'Internal Server Error', message: 'Failed to upgrade subscription' });
      }
    },
  );

  // ── POST /v1/subscriptions/cancel ─────────────────────────────────────────
  fastify.post(
    '/v1/subscriptions/cancel',
    {
      preHandler: [(fastify as any).authenticate],
      schema: {
        description: "Schedule the authenticated user's subscription for cancellation at period end.",
        tags: ['subscriptions'],
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              message: { type: 'string' },
              subscription: { type: 'object' },
            },
          },
          401: {
            type: 'object',
            properties: {
              statusCode: { type: 'number' },
              error: { type: 'string' },
              message: { type: 'string' },
            },
          },
          404: {
            type: 'object',
            properties: {
              statusCode: { type: 'number' },
              error: { type: 'string' },
              message: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      let userId: string;
      try {
        userId = extractUserId(request);
      } catch (err) {
        log.warn({ err }, 'routes: failed to extract userId from JWT');
        return sendUnauthorizedPayload(reply, request, err);
      }

      try {
        const subscription = await subscriptionService.cancel({ userId });
        return reply.status(200).send({
          success: true,
          message: 'Subscription will be cancelled at the end of the current billing period.',
          subscription,
        });
      } catch (err) {
        // Branch on the cause, but NEVER reflect err.message on the wire — the
        // service throws `No subscription found for user ${userId}`, which would
        // leak the internal userId. Log the real cause server-side, ship a fixed
        // human-readable literal to the client.
        const causeMessage = err instanceof Error ? err.message : '';

        if (causeMessage.includes('No subscription found')) {
          log.error({ userId, err }, 'routes: POST /cancel – no active subscription');
          return reply
            .status(404)
            .send({ statusCode: 404, error: 'Not Found', message: 'No active subscription found' });
        }

        log.error({ userId, err }, 'routes: POST /cancel – unexpected error');
        return reply.status(500).send({ statusCode: 500, error: 'Internal Server Error', message: 'Failed to cancel subscription' });
      }
    },
  );

  // ── POST /v1/subscriptions/iap/validate ───────────────────────────────────
  // Apple guideline 3.1.1 + Google Play policy: server-side validation of an
  // IAP receipt is REQUIRED. The mobile client submits the receipt; we hit
  // Apple verifyReceipt or Google Play Developer API; on success, we flip the
  // user's tier and respond with the new state.
  fastify.post(
    '/v1/subscriptions/iap/validate',
    {
      preHandler: [(fastify as any).authenticate],
      schema: {
        description: 'Validate an iOS / Android IAP receipt and update the user\'s tier.',
        tags: ['subscriptions'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['platform', 'receipt', 'productId'],
          properties: {
            platform: { type: 'string', enum: ['ios', 'android'] },
            receipt: { type: 'string', minLength: 1 },
            productId: { type: 'string', minLength: 1 },
            transactionId: { type: 'string' },
            originalTransactionId: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              valid: { type: 'boolean' },
              tier: { type: 'string' },
              currentPeriodEnd: { type: 'string' },
              errorCode: { type: 'string' },
              errorMessage: { type: 'string' },
            },
          },
          // CRITICAL #1: a receipt already redeemed by another account.
          409: {
            type: 'object',
            properties: {
              valid: { type: 'boolean' },
              errorCode: { type: 'string' },
              errorMessage: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      let userId: string;
      try {
        userId = extractUserId(request);
      } catch (err) {
        log.warn({ err }, 'routes: failed to extract userId from JWT');
        return sendUnauthorizedPayload(reply, request, err);
      }

      const { platform, receipt, productId } = request.body as {
        platform: 'ios' | 'android';
        receipt: string;
        productId: string;
        transactionId?: string;
        originalTransactionId?: string;
      };

      // Defense in depth: require the claimed product ID to map to a known
      // tier BEFORE we hit Apple/Google. Saves a verifyReceipt round-trip on
      // garbage input and prevents an attacker from spamming Apple with
      // unknown SKUs.
      const claimedTier = iapProductIdToTier(productId);
      if (!claimedTier) {
        return reply.status(400).send({
          valid: false,
          errorCode: 'product_id_mismatch',
          errorMessage: `Unknown product ${productId}`,
        });
      }

      try {
        const result =
          platform === 'ios'
            ? await validateAppleReceipt(receipt)
            : await validateGoogleReceipt(receipt, productId);

        if (!result.valid || !result.tier) {
          return reply.status(200).send({
            valid: false,
            errorCode: result.errorCode,
            errorMessage: result.errorMessage,
          });
        }

        // Verified tier from Apple/Google MUST match the productId the
        // client asked us about. Mismatch = potential receipt-replay
        // attack (an old PRO receipt being submitted for a PREMIUM call).
        if (result.tier !== claimedTier) {
          log.warn({ userId, claimedTier, verifiedTier: result.tier }, 'IAP claimed tier mismatch');
          return reply.status(200).send({
            valid: false,
            errorCode: 'product_id_mismatch',
            errorMessage: 'Receipt does not match claimed product',
          });
        }

        // SECURITY (CRITICAL #1 — receipt replay / sharing): bind the verified
        // receipt to exactly ONE account before granting any tier. The stable
        // cross-renewal id (Apple originalTransactionId / Google orderId) keys
        // the binding. If the same receipt was already redeemed by a DIFFERENT
        // user, reject — one valid receipt must never upgrade unlimited accounts.
        const originalTransactionId = result.originalTransactionId;
        if (!originalTransactionId) {
          // A verified receipt with no stable id can't be deduped safely — refuse
          // rather than grant an unbindable (replayable) upgrade.
          log.warn({ userId, platform }, 'IAP verified receipt missing originalTransactionId — refusing to bind');
          return reply.status(200).send({
            valid: false,
            errorCode: 'invalid_receipt',
            errorMessage: 'Receipt is missing a stable transaction identifier',
          });
        }

        const binding = await subscriptionService.bindIapTransaction({
          originalTransactionId,
          userId,
          platform,
          productId,
          tier: result.tier as SubscriptionTier,
        });

        if (binding.status === 'conflict') {
          log.warn(
            { userId, originalTransactionId },
            'IAP receipt already redeemed by another account — rejecting replay',
          );
          return reply.status(409).send({
            valid: false,
            errorCode: 'receipt_already_redeemed',
            errorMessage: 'This receipt has already been redeemed by another account',
          });
        }

        // status is 'bound' (first redemption) or 'reaffirmed' (same user
        // re-validating). Both proceed to upgradeTier; upgradeTier is itself
        // idempotent (no-op when already on the target tier).

        // Persist the new tier. upgradeTier emits the tier-updated event
        // for the rest of the system (notification-service, user-service, etc.).
        const { subscription, fromTier } = await subscriptionService.upgradeTier({
          userId,
          targetTier: result.tier as SubscriptionTier,
        });

        if (fromTier !== result.tier) {
          void publishTierUpdated(eventBus, log, {
            userId,
            fromTier: fromTier ?? null,
            toTier: result.tier,
            subscriptionId: subscription.id,
          });
        }

        return reply.status(200).send({
          valid: true,
          tier: result.tier,
          currentPeriodEnd: result.expiresAt,
        });
      } catch (err) {
        log.error({ err, userId, platform }, 'IAP validation failed');
        return reply.status(500).send({
          valid: false,
          errorCode: 'server_error',
          errorMessage: 'Could not validate receipt',
        });
      }
    },
  );

  // ── DELETE /v1/subscriptions/internal/user/:userId (GDPR purge) ────────────
  // Server-to-server only (nginx 404s /v1/<svc>/internal/* at the edge; the
  // internalAuth preHandler additionally requires X-Internal-Token, 404ing on a
  // missing/wrong token so a probe can't tell a guarded route from a missing one).
  // PERMANENTLY erases EVERY subscription-service row owned by :userId across ALL
  // THREE user-owned tables (subscriptions, subscription_events, iap_transactions
  // — each via user_id). IDEMPOTENT: purging a user with no rows returns 200 with
  // zero counts; purging twice is safe (deleteMany never throws on zero rows).
  // SubscriptionService.purgeUser wraps the deletes in a $transaction and returns
  // a per-table deletedCounts summary.
  fastify.delete(
    '/v1/subscriptions/internal/user/:userId',
    {
      preHandler: internalAuth,
      schema: {
        description: 'GDPR: permanently delete all of this user\'s subscription-service data.',
        tags: ['internal'],
        params: {
          type: 'object',
          required: ['userId'],
          properties: { userId: { type: 'string', minLength: 1 } },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              userId: { type: 'string' },
              deletedCounts: {
                type: 'object',
                properties: {
                  subscriptions: { type: 'number' },
                  subscription_events: { type: 'number' },
                  iap_transactions: { type: 'number' },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { userId } = request.params as { userId: string };
      try {
        const deletedCounts = await subscriptionService.purgeUser(userId);
        return reply.status(200).send({ userId, deletedCounts });
      } catch (err) {
        log.error({ userId, err }, 'routes: DELETE /internal/user – GDPR purge failed');
        return reply
          .status(500)
          .send({ statusCode: 500, error: 'Internal Server Error', message: 'Failed to purge user data' });
      }
    },
  );

  // ── Health check (internal) ────────────────────────────────────────────────
  fastify.get(
    '/health',
    {
      schema: {
        description: 'Service health check.',
        tags: ['system'],
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              service: { type: 'string' },
              timestamp: { type: 'string' },
            },
          },
        },
      },
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      return reply.status(200).send({
        status: 'ok',
        service: 'subscription-service',
        timestamp: new Date().toISOString(),
      });
    },
  );
}
