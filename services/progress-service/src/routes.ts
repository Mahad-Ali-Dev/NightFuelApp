
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { makeInternalAuthGuard } from '@nightfuel/config';
import { ProgressService } from './progress.service';
import {
    historyQuerySchema,
    statsQuerySchema,
    dailyProgressResponseSchema,
    streakResponseSchema,
    statsResponseSchema,
    weeklyStatsResponseSchema,
} from './schemas';
import { z } from 'zod';

// 🔥 Global reusable error schema (FIX FOR TS2353)
const errorResponseSchema = z.object({
    error: z.string(),
});

export const progressRoutes: FastifyPluginAsyncZod<{
    progressService: ProgressService;
    internalServiceToken?: string;
}> = async (fastify, options) => {
    const { progressService } = options;

    // F35 #12: guard the server-to-server-only /ai-usage telemetry sink. Same
    // constant-time X-Internal-Token check the other internal routes use; 404s
    // on missing/wrong token. The Python ai-pipeline sends the header.
    const internalAuth = makeInternalAuthGuard(options.internalServiceToken);

    // -------------------------------------------------------------------------
    // GET /v1/progress/today
    // Returns today's DailyProgress snapshot for the authenticated user.
    // -------------------------------------------------------------------------
    fastify.get('/today', {
        schema: {
            response: {
                200: dailyProgressResponseSchema,
                500: errorResponseSchema, // ✅ FIX
            },
        },
        preHandler: [fastify.authenticate],
    }, async (request, reply) => {
        try {
            // @ts-ignore
            const userId: string =
                (request.user as any).id || (request.user as any).userId;

            const result = await progressService.getTodayProgress(userId);
            return reply.status(200).send(result as any);
        } catch (err: any) {
            request.log.error(err);
            // Redaction: never echo raw err.message (may carry DB/Prisma/stack
            // detail) on a 5xx. The real error is logged above; the client gets
            // a fixed, non-leaky string. Shape (`{ error: string }`) unchanged.
            return reply
                .status(500)
                .send({ error: 'Internal server error' });
        }
    });

    // -------------------------------------------------------------------------
    // GET /v1/progress/history?days=7
    // Returns the last N days of daily progress records (newest first).
    // -------------------------------------------------------------------------
    fastify.get('/history', {
        schema: {
            querystring: historyQuerySchema,
            response: {
                200: z.array(dailyProgressResponseSchema),
                500: errorResponseSchema, // ✅ FIX
            },
        },
        preHandler: [fastify.authenticate],
    }, async (request, reply) => {
        try {
            // @ts-ignore
            const userId: string =
                (request.user as any).id || (request.user as any).userId;

            const { days } = request.query as { days: number };
            const result = await progressService.getProgressHistory(userId, days);

            return reply.status(200).send(result as any);
        } catch (err: any) {
            request.log.error(err);
            // Redaction: never echo raw err.message (may carry DB/Prisma/stack
            // detail) on a 5xx. The real error is logged above; the client gets
            // a fixed, non-leaky string. Shape (`{ error: string }`) unchanged.
            return reply
                .status(500)
                .send({ error: 'Internal server error' });
        }
    });

    // -------------------------------------------------------------------------
    // GET /v1/progress/streak
    // Returns current and longest streak for the authenticated user.
    // -------------------------------------------------------------------------
    fastify.get('/streak', {
        schema: {
            response: {
                200: streakResponseSchema,
                500: errorResponseSchema, // ✅ FIX
            },
        },
        preHandler: [fastify.authenticate],
    }, async (request, reply) => {
        try {
            // @ts-ignore
            const userId: string =
                (request.user as any).id || (request.user as any).userId;

            const result = await progressService.getStreak(userId);
            return reply.status(200).send(result as any);
        } catch (err: any) {
            request.log.error(err);
            // Redaction: never echo raw err.message (may carry DB/Prisma/stack
            // detail) on a 5xx. The real error is logged above; the client gets
            // a fixed, non-leaky string. Shape (`{ error: string }`) unchanged.
            return reply
                .status(500)
                .send({ error: 'Internal server error' });
        }
    });

    // -------------------------------------------------------------------------
    // GET /v1/progress/stats?days=30
    // Returns aggregate adherence stats and average macros over the last N days.
    // -------------------------------------------------------------------------
    fastify.get('/stats', {
        schema: {
            querystring: statsQuerySchema,
            response: {
                200: statsResponseSchema,
                500: errorResponseSchema, // ✅ FIX
            },
        },
        preHandler: [fastify.authenticate],
    }, async (request, reply) => {
        try {
            // @ts-ignore
            const userId: string =
                (request.user as any).id || (request.user as any).userId;

            const { days } = request.query as { days: number };
            const result = await progressService.getStats(userId, days);

            return reply.status(200).send(result as any);
        } catch (err: any) {
            request.log.error(err);
            // Redaction: never echo raw err.message (may carry DB/Prisma/stack
            // detail) on a 5xx. The real error is logged above; the client gets
            // a fixed, non-leaky string. Shape (`{ error: string }`) unchanged.
            return reply
                .status(500)
                .send({ error: 'Internal server error' });
        }
    });

    // -------------------------------------------------------------------------
    // POST /v1/progress/metrics — log a body metrics snapshot
    // -------------------------------------------------------------------------
    fastify.post('/metrics', {
        schema: {
            body: z.object({
                // Additive upper bounds: positives were already required; cap at
                // physiologically plausible maxima so absurd/abusive values are
                // rejected with a 400 instead of being persisted. Realistic app
                // payloads stay valid.
                weightKg: z.number().positive().max(1000).optional(),
                bodyFatPct: z.number().min(1).max(70).optional(),
                muscleMassKg: z.number().positive().max(1000).optional(),
                waistCm: z.number().positive().max(500).optional(),
                hipsCm: z.number().positive().max(500).optional(),
                chestCm: z.number().positive().max(500).optional(),
                armsCm: z.number().positive().max(500).optional(),
                thighsCm: z.number().positive().max(500).optional(),
                calvesCm: z.number().positive().max(500).optional(),
                notes: z.string().max(500).optional(),
            }),
            response: {
                201: z.any(),
                500: errorResponseSchema, // ✅ FIX (optional but recommended)
            },
        },
        preHandler: [fastify.authenticate],
    }, async (request, reply) => {
        try {
            // @ts-ignore
            const userId: string =
                (request.user as any).id || (request.user as any).userId;

            const result = await progressService.logBodyMetrics(
                userId,
                request.body as any
            );

            return reply.status(201).send(result);
        } catch (err: any) {
            request.log.error(err);
            // Redaction: never echo raw err.message (may carry DB/Prisma/stack
            // detail) on a 5xx. The real error is logged above; the client gets
            // a fixed, non-leaky string. Shape (`{ error: string }`) unchanged.
            return reply
                .status(500)
                .send({ error: 'Internal server error' });
        }
    });

    // -------------------------------------------------------------------------
    // GET /v1/progress/metrics?days=90 — body metrics history
    // -------------------------------------------------------------------------
    fastify.get('/metrics', {
        schema: {
            querystring: z.object({
                days: z.coerce.number().int().min(1).max(365).default(90),
            }),
            response: {
                // IMPORTANT: result is an array, not a single object
                200: z.array(z.any()),
                500: errorResponseSchema,
            },
        },
        preHandler: [fastify.authenticate],
    }, async (request, reply) => {
        try {
            // @ts-ignore
            const userId: string =
                (request.user as any).id || (request.user as any).userId;

            const { days } = request.query as { days: number };
            const result = await progressService.getBodyMetricsHistory(
                userId,
                days
            );

            return reply.status(200).send(result as any[]);
        } catch (err: any) {
            request.log.error(err);
            // Redaction: never echo raw err.message (may carry DB/Prisma/stack
            // detail) on a 5xx. The real error is logged above; the client gets
            // a fixed, non-leaky string. Shape (`{ error: string }`) unchanged.
            return reply
                .status(500)
                .send({ error: 'Internal server error' });
        }
    });

    // -------------------------------------------------------------------------
    // GET /v1/progress/weekly-stats
    // Returns consolidated 7-day stats for charts.
    // -------------------------------------------------------------------------
    fastify.get('/weekly-stats', {
        schema: {
            response: {
                200: weeklyStatsResponseSchema,
                500: errorResponseSchema,
            },
        },
        preHandler: [fastify.authenticate],
    }, async (request, reply) => {
        try {
            // @ts-ignore
            const userId: string = (request.user as any).id || (request.user as any).userId;
            const result = await progressService.getWeeklyStats(userId);
            return reply.status(200).send(result);
        } catch (err: any) {
            request.log.error(err);
            // Redaction: generic 5xx body, no raw err.message leak (logged above).
            return reply.status(500).send({ error: 'Internal server error' });
        }
    });

    // -------------------------------------------------------------------------
    // GET /v1/progress/reports
    // Retrieves historical AI Performance Reports for the authenticated user.
    // -------------------------------------------------------------------------
    fastify.get('/reports', {
        schema: {
            response: {
                200: z.array(z.any()),
                500: errorResponseSchema,
            },
        },
        preHandler: [fastify.authenticate],
    }, async (request, reply) => {
        try {
            // @ts-ignore
            const userId: string = (request.user as any).id || (request.user as any).userId;
            const result = await progressService.getReports(userId);
            return reply.status(200).send(result);
        } catch (err: any) {
            request.log.error(err);
            // Redaction: generic 5xx body, no raw err.message leak (logged above).
            return reply.status(500).send({ error: 'Internal server error' });
        }
    });

    // -------------------------------------------------------------------------
    // POST /v1/progress/weekly-audit
    // Triggers an AI-generated coaching summary based on the last 7 days.
    // -------------------------------------------------------------------------
    fastify.post('/weekly-audit', {
        schema: {
            response: {
                200: z.any(),
                500: errorResponseSchema,
            },
        },
        preHandler: [fastify.authenticate],
    }, async (request, reply) => {
        try {
            // @ts-ignore
            const userId: string = (request.user as any).id || (request.user as any).userId;
            const result = await progressService.generateWeeklyAudit(userId);
            return reply.status(200).send(result);
        } catch (err: any) {
            request.log.error(err);
            // Redaction: generic 5xx body, no raw err.message leak (logged above).
            return reply.status(500).send({ error: 'Internal server error' });
        }
    });

    // -------------------------------------------------------------------------
    // POST /v1/progress/hydration
    // -------------------------------------------------------------------------
    fastify.post('/hydration', {
        schema: {
            // Upper bound: a single hydration log can't sanely exceed 20L (20000ml).
            // Caps an absurd value while keeping every realistic intake valid.
            body: z.object({ amount: z.number().positive().max(20000) }),
            response: {
                200: dailyProgressResponseSchema,
                500: errorResponseSchema,
            },
        },
        preHandler: [fastify.authenticate],
    }, async (request, reply) => {
        try {
            // @ts-ignore
            const userId: string = (request.user as any).id || (request.user as any).userId;
            const { amount } = request.body as { amount: number };
            const result = await progressService.logHydration(userId, amount);
            return reply.status(200).send(result as any);
        } catch (err: any) {
            request.log.error(err);
            // Redaction: generic 5xx body, no raw err.message leak (logged above).
            return reply.status(500).send({ error: 'Internal server error' });
        }
    });

    // -------------------------------------------------------------------------
    // POST /v1/progress/supplements
    // -------------------------------------------------------------------------
    fastify.post('/supplements', {
        schema: {
            body: z.object({ supplementName: z.string().min(1).max(200), isTaken: z.boolean() }),
            response: {
                200: dailyProgressResponseSchema,
                500: errorResponseSchema,
            },
        },
        preHandler: [fastify.authenticate],
    }, async (request, reply) => {
        try {
            // @ts-ignore
            const userId: string = (request.user as any).id || (request.user as any).userId;
            const { supplementName, isTaken } = request.body as { supplementName: string; isTaken: boolean };
            const result = await progressService.toggleSupplement(userId, supplementName, isTaken);
            return reply.status(200).send(result as any);
        } catch (err: any) {
            request.log.error(err);
            // Redaction: generic 5xx body, no raw err.message leak (logged above).
            return reply.status(500).send({ error: 'Internal server error' });
        }
    });

    // -------------------------------------------------------------------------
    // POST /v1/progress/light-exposure
    // -------------------------------------------------------------------------
    fastify.post('/light-exposure', {
        schema: {
            body: z.object({ completed: z.boolean() }),
            response: {
                200: dailyProgressResponseSchema,
                500: errorResponseSchema,
            },
        },
        preHandler: [fastify.authenticate],
    }, async (request, reply) => {
        try {
            // @ts-ignore
            const userId: string = (request.user as any).id || (request.user as any).userId;
            const { completed } = request.body as { completed: boolean };
            const result = await progressService.updateLightExposure(userId, completed);
            return reply.status(200).send(result as any);
        } catch (err: any) {
            request.log.error(err);
            // Redaction: generic 5xx body, no raw err.message leak (logged above).
            return reply.status(500).send({ error: 'Internal server error' });
        }
    });

    // -------------------------------------------------------------------------
    // POST /v1/progress/wearable/sync
    // Syncs steps from Apple Health / Google Fit
    // -------------------------------------------------------------------------
    fastify.post('/wearable/sync', {
        schema: {
            body: z.object({
                // Upper bound: ~200k steps/day is already far beyond any human
                // record; caps a poisoned wearable-sync payload. Source label bounded.
                steps: z.number().int().min(0).max(200000),
                source: z.string().min(1).max(60).optional().default('WEARABLE')
            }),
            response: {
                200: dailyProgressResponseSchema,
                500: errorResponseSchema,
            },
        },
        preHandler: [fastify.authenticate],
    }, async (request, reply) => {
        try {
            // @ts-ignore
            const userId: string = (request.user as any).id || (request.user as any).userId;
            const { steps, source } = request.body as { steps: number; source: string };
            const result = await progressService.logSteps(userId, steps, source);
            return reply.status(200).send(result as any);
        } catch (err: any) {
            request.log.error(err);
            // Redaction: generic 5xx body, no raw err.message leak (logged above).
            return reply.status(500).send({ error: 'Internal server error' });
        }
    });

    // -------------------------------------------------------------------------
    // POST /v1/progress/ai-usage
    // Internal Service Endpoint for tracking AI LLM cost telemetry
    // -------------------------------------------------------------------------
    fastify.post('/ai-usage', {
        schema: {
            body: z.object({
                // Server-to-server call from the Python AI pipeline. Tighten the
                // free-form fields: a UUID userId, bounded label strings, and a
                // sane upper bound on token counts so a malformed/poisoned call
                // can't write absurd values into the cost-telemetry table.
                userId: z.string().uuid(),
                action: z.string().min(1).max(120),
                provider: z.string().min(1).max(120),
                promptTokens: z.number().int().min(0).max(10_000_000),
                completionTokens: z.number().int().min(0).max(10_000_000),
                totalTokens: z.number().int().min(0).max(20_000_000),
                // F35 #11: optional cost/model the ai-pipeline now computes per
                // call. Accepted (and bounded) so the POST validates; not yet
                // persisted (no aiUsageLog columns — that needs a migration), so
                // logAiUsage continues to read only the six fields above.
                costUsd: z.number().min(0).max(1000).optional(),
                model: z.string().max(120).optional(),
            }),
            response: {
                201: z.any(),
                500: errorResponseSchema,
            },
        },
        // F35 #12: server-to-server only — guarded by the shared internal-token
        // check (was previously unauthenticated). The Python ai-pipeline sends
        // X-Internal-Token; missing/wrong token 404s before the handler runs.
        preHandler: internalAuth,
    }, async (request, reply) => {
        try {
            const body = request.body as any;
            const result = await progressService.logAiUsage(body);
            return reply.status(201).send(result);
        } catch (err: any) {
            request.log.error(err);
            // Redaction: generic 5xx body, no raw err.message leak (logged above).
            return reply.status(500).send({ error: 'Internal server error' });
        }
    });

    // -------------------------------------------------------------------------
    // DELETE /v1/progress/internal/user/:userId  (GDPR purge)
    // Server-to-server only (nginx 404s /v1/<svc>/internal/* at the edge; the
    // internalAuth preHandler additionally requires X-Internal-Token). PERMANENTLY
    // erases EVERY progress-service row owned by :userId across all six user-owned
    // tables (daily_progress, streaks, body_metrics, ai_usage_logs, hydration_logs,
    // performance_reports). IDEMPOTENT: purging a user with no rows returns 200
    // with zero counts; purging twice is safe (deleteMany never throws on zero
    // rows; the deletes run in one transaction). Returns a per-table
    // deletedCounts summary.
    // -------------------------------------------------------------------------
    fastify.delete('/internal/user/:userId', {
        preHandler: internalAuth,
    }, async (request, reply) => {
        const { userId } = request.params as { userId: string };
        try {
            const deletedCounts = await progressService.purgeUser(userId);
            return reply.status(200).send({ userId, deletedCounts });
        } catch (err: any) {
            request.log.error({ err, userId }, 'GDPR purge failed');
            // Redaction: generic 5xx body, no raw err.message leak (logged above).
            return reply.status(500).send({ error: 'Internal server error' });
        }
    });
};