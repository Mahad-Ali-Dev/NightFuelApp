
import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { PlanService } from './plan.service';
import { getPlanParamsSchema, getPlanResponseSchema, generatePlanBodySchema, storePlanBodySchema, createProtocolSchema, updateProtocolSchema, getPlanHistoryQuerySchema } from './schemas';
import { createLogger } from '@nightfuel/config';

const logger = createLogger('plan-service:routes');

export const planRoutes = async (fastify: FastifyInstance, opts: { planService: PlanService }) => {
    const { planService } = opts;

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
                const { date, circadianProfile, profile, shiftId, shiftType } = request.body as any;
                // Accept either `circadianProfile` (frontend) or `profile` (legacy event-driven flow)
                const resolvedProfile = circadianProfile ?? profile ?? {};

                const plan = await planService.generateAndStorePlan(
                    resolvedProfile,
                    userId,
                    date,
                    shiftId ?? null,
                    shiftType ?? 'ROTATING'
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
