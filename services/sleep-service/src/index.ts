import 'dotenv/config';
import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import fastifyJwt from '@fastify/jwt';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyRateLimit from '@fastify/rate-limit';
import { PrismaClient } from './generated/prisma';
import { RedisEventBus } from '@nightfuel/events';
import { createLogger, loadConfig, connectWithRetry, registerGlobalProcessHandlers, registerFastifyErrorHandler, sendUnauthorized } from '@nightfuel/config';
import { z } from 'zod';
import { SleepService } from './sleep.service';
import {
    HealthSyncService,
    healthSyncSchema,
} from './health-sync.service';

const envSchema = z.object({
    SLEEP_PORT: z.string().default('3012'),
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    REDIS_URL: z.string().url(),
});

const config = loadConfig(envSchema);
const logger = createLogger('sleep-service');
const prisma = new PrismaClient();
const eventBus = new RedisEventBus(config.REDIS_URL);
const sleepSvc = new SleepService(prisma, eventBus);
// HealthSyncService persists raw samples into health_samples (via prisma) and
// materializes sleep samples THROUGH sleepSvc.createSession — so synced sleep
// reuses the exact same sleep.session-logged → state-service twin path as a
// manual log (no new event, no materializer change).
//
// The third arg is the per-night idempotency reader: on a replay/re-sync, a night
// that already has a SleepSession is skipped (no re-insert, no twin re-fire).
const sleepSessionReader = {
    countNightSessions: (userId: string, nightStart: Date, nightEnd: Date) =>
        prisma.sleepSession.count({
            where: { userId, startTime: { gte: nightStart, lt: nightEnd } },
        }),
};
const healthSyncSvc = new HealthSyncService(prisma as any, sleepSvc, sleepSessionReader);

const fastify = Fastify({ logger: false });
registerGlobalProcessHandlers(logger);
registerFastifyErrorHandler(fastify, logger);
fastify.setValidatorCompiler(validatorCompiler);
fastify.setSerializerCompiler(serializerCompiler);

fastify.register(fastifyHelmet);
fastify.register(fastifyRateLimit, { max: 200, timeWindow: '1 minute' });
fastify.register(fastifyCors, {
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
});
fastify.register(fastifyJwt, { secret: config.JWT_SECRET });

fastify.decorate('authenticate', async (request: any, reply: any) => {
    try {
        await request.jwtVerify();
    } catch (err) {
        return sendUnauthorized(reply, request, err);
    }
});

// ── Shared schemas ─────────────────────────────────────────────────────────────
// All write bodies are bounded: additive upper bounds + positivity only, so
// valid app payloads stay valid while absurd/abusive values (a 9999-quality
// score, a million disturbances, a megabyte of notes, or a free-text `source`
// blob spread blind into Prisma) are rejected with a clean 400 instead of
// reaching the DB. `quality` 1-10 and the preference numeric ranges were
// already bounded; this closes `disturbances` (no max before) and `source`
// (unbounded free text before).

// A night can have at most this many recorded disturbances. Generous upper
// bound — far beyond any real night — that still blocks integer-overflow abuse.
const MAX_DISTURBANCES = 1000;
// `source` is a short device/integration tag (e.g. 'MANUAL', 'APPLE_HEALTH').
const MAX_SOURCE_LEN = 60;

const createSessionSchema = z.object({
    startTime: z.string().datetime(),
    endTime: z.string().datetime().optional().nullable(),
    quality: z.number().int().min(1).max(10).optional().nullable(),
    disturbances: z.number().int().min(0).max(MAX_DISTURBANCES).optional(),
    source: z.string().max(MAX_SOURCE_LEN).optional(),
    circadianSleepStart: z.string().datetime().optional().nullable(),
    circadianSleepEnd: z.string().datetime().optional().nullable(),
    notes: z.string().max(2000).optional().nullable(),
});

const updateSessionSchema = z.object({
    endTime: z.string().datetime().optional(),
    quality: z.number().int().min(1).max(10).optional(),
    disturbances: z.number().int().min(0).max(MAX_DISTURBANCES).optional(),
    notes: z.string().max(2000).optional(),
});

const preferencesSchema = z.object({
    targetDuration: z.number().int().min(60).max(720).optional(),
    windDownDuration: z.number().int().min(0).max(120).optional(),
    temperatureTarget: z.number().min(15).max(30).optional().nullable(),
});

// ── Health-sync (watch / wearable ingestion) schema ─────────────────────────────
// The POST /v1/sleep/health-sync body schema is the SHARED `healthSyncSchema`
// imported from ./health-sync.service (D3) — ONE definition used by both this
// deployed route and the route regression test, so the test can never validate a
// stale copy. It is a user-AUTHENTICATED batch endpoint: the userId is taken from
// the verified JWT, NEVER the body (no IDOR). The schema is size-capped and each
// numeric field is range-checked PER KIND so a poisoned value can never reach the
// DB or the digital twin.

// ── Routes ─────────────────────────────────────────────────────────────────────

fastify.get('/health', async () => ({ status: 'ok', service: 'sleep-service' }));

// GET /v1/sleep?limit=30
fastify.withTypeProvider<ZodTypeProvider>().get('/v1/sleep', {
    onRequest: [(fastify as any).authenticate],
    schema: { querystring: z.object({ limit: z.coerce.number().int().min(1).max(365).default(30) }) },
}, async (request, reply) => {
    try {
        const userId = (request.user as any).userId ?? (request.user as any).id;
        const { limit } = request.query;
        return reply.send(await sleepSvc.listSessions(userId, limit));
    } catch (err: any) {
        logger.error(err);
        return reply.code(500).send({ error: 'An unexpected error occurred' });
    }
});

// GET /v1/sleep/quality — derived sleep-quality summary (empty-safe).
// Static path → Fastify's router matches it before the /:id param route.
fastify.get('/v1/sleep/quality', {
    onRequest: [(fastify as any).authenticate],
}, async (request, reply) => {
    try {
        const userId = (request.user as any).userId ?? (request.user as any).id;
        return reply.send(await sleepSvc.getQuality(userId));
    } catch (err: any) {
        logger.error(err);
        return reply.code(500).send({ error: 'An unexpected error occurred' });
    }
});

// GET /v1/sleep/analytics — derived analytics + 7-day chart data (empty-safe).
fastify.get('/v1/sleep/analytics', {
    onRequest: [(fastify as any).authenticate],
}, async (request, reply) => {
    try {
        const userId = (request.user as any).userId ?? (request.user as any).id;
        return reply.send(await sleepSvc.getAnalytics(userId));
    } catch (err: any) {
        logger.error(err);
        return reply.code(500).send({ error: 'An unexpected error occurred' });
    }
});

// GET /v1/sleep/:id
fastify.withTypeProvider<ZodTypeProvider>().get('/v1/sleep/:id', {
    onRequest: [(fastify as any).authenticate],
    schema: { params: z.object({ id: z.string().uuid() }) },
}, async (request, reply) => {
    try {
        const userId = (request.user as any).userId ?? (request.user as any).id;
        const session = await sleepSvc.getSession(request.params.id, userId);
        if (!session) return reply.code(404).send({ error: 'Sleep session not found' });
        return reply.send(session);
    } catch (err: any) {
        logger.error(err);
        return reply.code(500).send({ error: 'An unexpected error occurred' });
    }
});

// POST /v1/sleep
fastify.withTypeProvider<ZodTypeProvider>().post('/v1/sleep', {
    onRequest: [(fastify as any).authenticate],
    schema: { body: createSessionSchema },
}, async (request, reply) => {
    try {
        const userId = (request.user as any).userId ?? (request.user as any).id;
        const session = await sleepSvc.createSession({ ...request.body, userId });
        return reply.code(201).send(session);
    } catch (err: any) {
        logger.error({ err, body: request.body, stack: err.stack }, 'POST /v1/sleep failed');
        return reply.code(500).send({ error: 'An unexpected error occurred' });
    }
});

// POST /v1/sleep/health-sync — INGEST a batch of wearable / health-app samples.
//
// User-authenticated and routed through nginx's existing `/v1/sleep` prefix (NOT
// an /internal route). AUTHZ: the userId is taken ONLY from the verified JWT, so
// a caller can ingest exclusively their OWN samples — there is no userId in the
// body to forge (no IDOR). The body is size-capped + per-sample bounded by
// healthSyncSchema before this handler runs. Sleep samples flow through the
// existing sleep.session-logged → state-service twin path; HRV/resting-HR refine
// the freshest sleep sample's quality/disturbances so they nudge fatigue too.
fastify.withTypeProvider<ZodTypeProvider>().post('/v1/sleep/health-sync', {
    onRequest: [(fastify as any).authenticate],
    schema: { body: healthSyncSchema },
}, async (request, reply) => {
    try {
        const userId = (request.user as any).userId ?? (request.user as any).id;
        const summary = await healthSyncSvc.ingest(userId, request.body.samples as any);
        return reply.code(201).send(summary);
    } catch (err: any) {
        logger.error({ err, stack: err?.stack }, 'POST /v1/sleep/health-sync failed');
        return reply.code(500).send({ error: 'An unexpected error occurred' });
    }
});

// PATCH /v1/sleep/:id — update end time / quality after waking up
fastify.withTypeProvider<ZodTypeProvider>().patch('/v1/sleep/:id', {
    onRequest: [(fastify as any).authenticate],
    schema: {
        params: z.object({ id: z.string().uuid() }),
        body: updateSessionSchema,
    },
}, async (request, reply) => {
    try {
        const userId = (request.user as any).userId ?? (request.user as any).id;
        const session = await sleepSvc.updateSession(request.params.id, userId, request.body);
        return reply.send(session);
    } catch (err: any) {
        logger.error(err);
        // Undefined-guard: a non-Error throw has no `.message`, so calling
        // `.includes` on it would itself throw and turn this 404 into an
        // unhandled 500. Only branch when the message is a real string, and
        // ALWAYS reply with the fixed copy — never echo err.message back to the
        // client (the raw message can carry Prisma/internal detail).
        if (typeof err?.message === 'string' && err.message.includes('not found')) {
            return reply.code(404).send({ error: 'Sleep session not found' });
        }
        return reply.code(500).send({ error: 'An unexpected error occurred' });
    }
});

// GET /v1/sleep/preferences
fastify.withTypeProvider<ZodTypeProvider>().get('/v1/sleep/preferences', {
    onRequest: [(fastify as any).authenticate],
}, async (request, reply) => {
    try {
        const userId = (request.user as any).userId ?? (request.user as any).id;
        return reply.send(await sleepSvc.getPreferences(userId));
    } catch (err: any) {
        logger.error(err);
        return reply.code(500).send({ error: 'An unexpected error occurred' });
    }
});

// PUT /v1/sleep/preferences
fastify.withTypeProvider<ZodTypeProvider>().put('/v1/sleep/preferences', {
    onRequest: [(fastify as any).authenticate],
    schema: { body: preferencesSchema },
}, async (request, reply) => {
    try {
        const userId = (request.user as any).userId ?? (request.user as any).id;
        return reply.send(await sleepSvc.updatePreferences(userId, request.body));
    } catch (err: any) {
        logger.error(err);
        return reply.code(500).send({ error: 'An unexpected error occurred' });
    }
});

// ── Startup ─────────────────────────────────────────────────────────────────────

const start = async () => {
    try {
        await connectWithRetry(prisma, logger);
        logger.info('sleep-service: connected to database');
        await fastify.listen({ port: parseInt(config.SLEEP_PORT), host: '0.0.0.0' });
        logger.info(`sleep-service listening on port ${config.SLEEP_PORT}`);
    } catch (err) {
        logger.error(err);
        process.exit(1);
    }
};

const shutdown = async () => {
    await fastify.close();
    await eventBus.disconnect();
    await prisma.$disconnect();
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

start();
