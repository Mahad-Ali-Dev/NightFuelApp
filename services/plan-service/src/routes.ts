
import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { PlanService } from './plan.service';
import { getPlanParamsSchema, getPlanResponseSchema, generatePlanBodySchema, storePlanBodySchema, createProtocolSchema, updateProtocolSchema } from './schemas';
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
                return reply.code(500).send({ error: err.message });
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
                return reply.code(500).send({ error: err.message });
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
                return reply.code(500).send({ error: err.message });
            }
        }
    );

    // GET /v1/plans/history — list all plans for the authenticated user
    fastify.withTypeProvider<ZodTypeProvider>().get(
        '/history',
        {
            onRequest: [(fastify as any).authenticate],
        },
        async (request, reply) => {
            try {
                // @ts-ignore
                const userId = request.user.userId;
                const plans = await planService.getPlanHistory(userId);
                return reply.send(plans);
            } catch (err: any) {
                logger.error(err);
                return reply.code(500).send({ error: err.message });
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
                const status = err.message.includes('not found') ? 404 : 500;
                return reply.code(status).send({ error: err.message });
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
                return reply.code(500).send({ error: err.message });
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
                return reply.code(500).send({ error: err.message });
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
                const status = err.message.includes('not found') ? 404 : 403;
                return reply.code(status).send({ error: err.message });
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
                const status = err.message.includes('not found') ? 404 : 403;
                return reply.code(status).send({ error: err.message });
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
                const status = err.message.includes('not found') ? 404 : 403;
                return reply.code(status).send({ error: err.message });
            }
        }
    );
};
