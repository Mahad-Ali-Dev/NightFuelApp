import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { SubscriptionService } from './subscription.service';
import type { EventBus } from './events';
import { publishTierUpdated } from './events';
import {
  TIER_CATALOGUE,
  UpgradeBodySchema,
  type UpgradeBody,
  type SubscriptionTier,
} from './schemas';

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
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Invalid token payload' });
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
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Invalid token payload' });
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
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Invalid token payload' });
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
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Invalid token payload' });
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
