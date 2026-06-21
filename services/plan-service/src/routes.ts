
import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { PlanService } from './plan.service';
import { getPlanParamsSchema, getPlanResponseSchema, generatePlanBodySchema, storePlanBodySchema, createProtocolSchema, updateProtocolSchema, getPlanHistoryQuerySchema } from './schemas';
import { createLogger, assertWithinDailyLimit, AI_LIMITS, AI_QUOTA_EXCEEDED, resolvePlan, makeInternalAuthGuard } from '@nightfuel/config';

const logger = createLogger('plan-service:routes');

// ── AI daily-generation quota (route-level only) ────────────────────────────────
// POST /v1/plans/generate runs the paid AI plan pipeline, so it is metered with
// the SAME shared policy chat-service uses for Ria (@nightfuel/config: AI_LIMITS /
// assertWithinDailyLimit / AI_QUOTA_EXCEEDED). The gate lives in the ROUTE handler
// ONLY — generateAndStorePlan() is also invoked SYSTEM-side by worker.ts
// (checkAndRegenerate) and events.ts (circadian:profile-computed) with no user
// request, and those auto-generation paths MUST stay unblocked or daily plans
// silently stop. They never reach this file, so they are never gated.
const INTERNAL_REQUEST_TIMEOUT_MS = 3_000;
const DEFAULT_SUBSCRIPTION_SERVICE_URL = 'http://subscription-service:3015';

// resolvePlan centralized into @nightfuel/config; the shared token mints {userId,
// sub} — a compatible superset (subscription-service reads only userId/id), so
// chat's old role:'SYSTEM'/no-sub and exercise/plan's sub/no-role both reduce to
// behavior-identical at /me. The shared fn mints via jwtSecret and strips the
// trailing slash itself, so DEFAULT_SUBSCRIPTION_SERVICE_URL stays only as the
// fallback value and this route no longer reaches into (fastify as any).jwt.

export const planRoutes = async (fastify: FastifyInstance, opts: { planService: PlanService; internalServiceToken?: string }) => {
    const { planService } = opts;

    // F34 #5: guard the server-to-server-only /internal/* route. Constant-time
    // X-Internal-Token check; 404s on missing/wrong token (matches the nginx
    // edge). meal-service (the sole caller) sends the header.
    const internalAuth = makeInternalAuthGuard(opts.internalServiceToken);

    // GET /v1/plans/:date — fetch stored plan for a specific date
    fastify.withTypeProvider<ZodTypeProvider>().get(
        '/:date',
        {
            onRequest: [(fastify as any).authenticate],
            schema: {
                params: getPlanParamsSchema,
            },
        },
        async (request, reply) => {
            try {
                // @ts-ignore
                const userId = request.user.userId;
                const plan = await planService.getPlanByDate(userId, request.params.date);
                if (!plan) {
                    return reply.code(404).send({ error: 'No plan found for this date' });
                }
                return reply.send(plan);
            } catch (err: any) {
                logger.error(err);
                return reply.code(500).send({ error: 'An unexpected error occurred' });
            }
        }
    );

    // POST /v1/plans/generate — manually trigger plan generation + persistence
    fastify.withTypeProvider<ZodTypeProvider>().post(
        '/generate',
        {
            onRequest: [(fastify as any).authenticate],
            schema: {
                body: generatePlanBodySchema,
            },
        },
        async (request, reply) => {
            try {
                // @ts-ignore
                const userId = request.user.userId;

                // ── AI daily-generation quota gate (ROUTE ONLY) ──────────────
                // Enforced HERE, before any AI work, so a user can't exhaust the
                // paid plan pipeline. The SYSTEM auto-generation callers
                // (worker.ts checkAndRegenerate, events.ts circadian handler)
                // call planService.generateAndStorePlan directly and never pass
                // through this handler, so they are intentionally NOT gated.
                //
                // NOTE: the mobile client circadian.tsx can trigger plan
                // generation and will now receive 429
                // { error: 'ai_quota_exceeded', ... } once a user hits their
                // daily cap. circadian.tsx is intentionally NOT edited this
                // sprint — surfacing/handling that 429 in the client is a
                // separate work-item.
                const plan_tier = await resolvePlan({
                    userId,
                    jwtSecret: process.env.JWT_SECRET ?? '',
                    subscriptionServiceUrl: process.env.SUBSCRIPTION_SERVICE_URL ?? DEFAULT_SUBSCRIPTION_SERVICE_URL,
                    timeoutMs: INTERNAL_REQUEST_TIMEOUT_MS,
                });
                const now = new Date();
                // Count this user's ROUTE-AI plans created since UTC midnight.
                // The chosen persistence table is DayPlan (prisma.dayPlan), but a
                // raw rowcount would over-count: generateAndStorePlan is also run
                // SYSTEM-side (worker.ts checkAndRegenerate, events.ts circadian
                // handler) and the manual /store path writes rows too — none of
                // those consume the user's paid daily quota. Only this /generate
                // route passes aiGenerated:true into the create, so we scope the
                // count to aiGenerated:true and those auto-gen / store rows stay
                // uncounted. We count INLINE via the prisma client on the
                // PlanService instance; the field is compile-time private, hence
                // the cast.
                const startOfUtcDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
                const usedToday: number = await (planService as any).prisma.dayPlan.count({
                    where: { userId, aiGenerated: true, createdAt: { gte: startOfUtcDay } },
                });
                const limit = AI_LIMITS[plan_tier].generations;
                const q = assertWithinDailyLimit({ usedToday, limit, now });
                if (!q.allowed) {
                    // 429 BEFORE generateAndStorePlan / any AI fetch — shared
                    // over-cap wire contract (identical to chat-service Ria).
                    return reply.code(429).send({ error: AI_QUOTA_EXCEEDED, limit, plan: plan_tier, resetsAt: q.resetsAt });
                }

                const { date, circadianProfile, profile, shiftId, shiftType } = request.body as any;
                // Accept either `circadianProfile` (frontend) or `profile` (legacy event-driven flow)
                const resolvedProfile = circadianProfile ?? profile ?? {};

                const plan = await planService.generateAndStorePlan(
                    resolvedProfile,
                    userId,
                    date,
                    shiftId ?? null,
                    shiftType ?? 'ROTATING',
                    true // aiGenerated: route-triggered AI generation IS counted toward the daily cap
                );
                return reply.code(201).send(plan);
            } catch (err: any) {
                logger.error(err);
                return reply.code(500).send({ error: 'An unexpected error occurred' });
            }
        }
    );

    // POST /v1/plans/store — persist a pre-generated plan (no AI call, frontend has already done it)
    fastify.withTypeProvider<ZodTypeProvider>().post(
        '/store',
        {
            onRequest: [(fastify as any).authenticate],
            schema: {
                body: storePlanBodySchema,
            },
        },
        async (request, reply) => {
            try {
                // @ts-ignore
                const userId = request.user.userId;
                const { date, structuredPlan, shiftId, shiftType, providerUsed, tokensUsed } = request.body as any;

                const plan = await planService.storePlan(
                    structuredPlan,
                    userId,
                    date,
                    shiftId ?? null,
                    shiftType ?? 'ROTATING',
                    providerUsed ?? 'openai',
                    tokensUsed ?? null,
                );
                return reply.code(201).send(plan);
            } catch (err: any) {
                logger.error(err);
                return reply.code(500).send({ error: 'An unexpected error occurred' });
            }
        }
    );

    // GET /v1/plans/history — list the authenticated user's plans, OPTIONALLY
    // bounded to a [start,end] date range. With no params the behaviour is
    // unchanged (server caps at take:30); the range is validated by the shared
    // bound helper (a reversed/over-span range → 400 on path ['end']).
    fastify.withTypeProvider<ZodTypeProvider>().get(
        '/history',
        {
            onRequest: [(fastify as any).authenticate],
            schema: {
                querystring: getPlanHistoryQuerySchema,
            },
        },
        async (request, reply) => {
            try {
                // @ts-ignore
                const userId = request.user.userId;
                const plans = await planService.getPlanHistory(userId, request.query);
                return reply.send(plans);
            } catch (err: any) {
                logger.error(err);
                return reply.code(500).send({ error: 'An unexpected error occurred' });
            }
        }
    );

    // POST /v1/plans/:id/rate — submit a 1-5 star rating for a plan
    fastify.withTypeProvider<ZodTypeProvider>().post(
        '/:id/rate',
        {
            onRequest: [(fastify as any).authenticate],
            schema: {
                params: z.object({ id: z.string().uuid() }),
                body: z.object({ rating: z.number().int().min(1).max(5) }),
            },
        },
        async (request, reply) => {
            try {
                // @ts-ignore
                const userId = request.user.userId;
                const { id } = request.params as { id: string };
                const { rating } = request.body as { rating: number };
                await planService.ratePlan(id, userId, rating);
                return reply.code(200).send({ success: true });
            } catch (err: any) {
                logger.error(err);
                // Preserve a safe 404 for the business "not found" case; use a
                // fixed message (never echo raw err.message) and guard the
                // .includes() against a missing message. Everything else → 500.
                if (typeof err?.message === 'string' && err.message.includes('not found')) {
                    return reply.code(404).send({ error: 'Plan not found' });
                }
                return reply.code(500).send({ error: 'An unexpected error occurred' });
            }
        }
    );

    // ── GET /v1/plans/internal/active/:userId ────────────────────────────────────
    // Internal endpoint for other services to fetch a user's active plan.
    fastify.withTypeProvider<ZodTypeProvider>().get(
        '/internal/active/:userId',
        {
            preHandler: internalAuth,
            schema: {
                params: z.object({ userId: z.string().uuid() }),
                querystring: z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }),
            },
        },
        async (request, reply) => {
            try {
                const { userId } = request.params;
                const { date: queryDate } = request.query;
                const date = queryDate ?? new Date().toISOString().split('T')[0];

                const plan = await planService.getPlanByDate(userId, date);
                if (!plan) {
                    return reply.code(404).send({ error: `No active plan found for ${date}` });
                }
                return reply.code(200).send(plan);
            } catch (err: any) {
                request.log.error(err);
                return reply.code(500).send({ error: 'Internal server error' });
            }
        }
    );

    // ── Protocol Template Routes ──────────────────────────────────────────

    // POST /v1/plans/protocols — Create a new protocol template
    fastify.withTypeProvider<ZodTypeProvider>().post(
        '/protocols',
        {
            onRequest: [(fastify as any).authenticate],
            schema: {
                body: createProtocolSchema,
            },
        },
        async (request, reply) => {
            try {
                // @ts-ignore
                const creatorId = request.user.userId;
                const protocol = await planService.createProtocolTemplate(creatorId, request.body);
                return reply.code(201).send(protocol);
            } catch (err: any) {
                logger.error(err);
                return reply.code(500).send({ error: 'An unexpected error occurred' });
            }
        }
    );

    // GET /v1/plans/protocols — List protocols (own + public)
    fastify.withTypeProvider<ZodTypeProvider>().get(
        '/protocols',
        {
            onRequest: [(fastify as any).authenticate],
        },
        async (request, reply) => {
            try {
                // @ts-ignore
                const creatorId = request.user.userId;
                const protocols = await planService.getProtocolTemplates(creatorId);
                return reply.send(protocols);
            } catch (err: any) {
                logger.error(err);
                return reply.code(500).send({ error: 'An unexpected error occurred' });
            }
        }
    );

    // GET /v1/plans/protocols/:id — Get protocol by ID
    fastify.withTypeProvider<ZodTypeProvider>().get(
        '/protocols/:id',
        {
            onRequest: [(fastify as any).authenticate],
            schema: {
                params: z.object({ id: z.string().uuid() }),
            },
        },
        async (request, reply) => {
            try {
                // @ts-ignore
                const creatorId = request.user.userId;
                const { id } = request.params;
                const protocol = await planService.getProtocolTemplateById(id, creatorId);
                return reply.send(protocol);
            } catch (err: any) {
                logger.error(err);
                // Guard .includes() against a missing message; messages are
                // fixed copy ('Not found' / 'Forbidden') so nothing raw leaks.
                const isNotFound = typeof err?.message === 'string' && err.message.includes('not found');
                return isNotFound ? reply.code(404).send({ error: 'Not found' }) : reply.code(403).send({ error: 'Forbidden' });
            }
        }
    );

    // PATCH /v1/plans/protocols/:id — Update protocol
    fastify.withTypeProvider<ZodTypeProvider>().patch(
        '/protocols/:id',
        {
            onRequest: [(fastify as any).authenticate],
            schema: {
                params: z.object({ id: z.string().uuid() }),
                body: updateProtocolSchema,
            },
        },
        async (request, reply) => {
            try {
                // @ts-ignore
                const creatorId = request.user.userId;
                const { id } = request.params;
                const protocol = await planService.updateProtocolTemplate(id, creatorId, request.body);
                return reply.send(protocol);
            } catch (err: any) {
                logger.error(err);
                // Guard .includes() against a missing message; messages are
                // fixed copy ('Not found' / 'Forbidden') so nothing raw leaks.
                const isNotFound = typeof err?.message === 'string' && err.message.includes('not found');
                return isNotFound ? reply.code(404).send({ error: 'Not found' }) : reply.code(403).send({ error: 'Forbidden' });
            }
        }
    );

    // DELETE /v1/plans/protocols/:id — Delete protocol
    fastify.withTypeProvider<ZodTypeProvider>().delete(
        '/protocols/:id',
        {
            onRequest: [(fastify as any).authenticate],
            schema: {
                params: z.object({ id: z.string().uuid() }),
            },
        },
        async (request, reply) => {
            try {
                // @ts-ignore
                const creatorId = request.user.userId;
                const { id } = request.params;
                await planService.deleteProtocolTemplate(id, creatorId);
                return reply.code(204).send();
            } catch (err: any) {
                logger.error(err);
                // Guard .includes() against a missing message; messages are
                // fixed copy ('Not found' / 'Forbidden') so nothing raw leaks.
                const isNotFound = typeof err?.message === 'string' && err.message.includes('not found');
                return isNotFound ? reply.code(404).send({ error: 'Not found' }) : reply.code(403).send({ error: 'Forbidden' });
            }
        }
    );
};
