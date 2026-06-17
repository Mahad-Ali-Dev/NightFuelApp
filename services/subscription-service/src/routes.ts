import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { SubscriptionService } from './subscription.service';
import type { EventBus } from './events';
import { publishTierUpdated } from './events';
import { sendUnauthorizedPayload } from '@nightfuel/config';
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
}

export async function subscriptionRoutes(
  fastify: FastifyInstance,
  options: RoutesPluginOptions,
): Promise<void> {
  const { subscriptionService, eventBus } = options;
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
        const message = err instanceof Error ? err.message : 'Failed to cancel subscription';

        if (message.includes('No subscription found')) {
          return reply.status(404).send({ statusCode: 404, error: 'Not Found', message });
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
