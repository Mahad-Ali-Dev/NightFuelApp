import 'dotenv/config';
import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import fastifyJwt from '@fastify/jwt';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyRateLimit from '@fastify/rate-limit';
import { PrismaClient } from './generated/prisma';
import { RedisEventBus } from '@nightfuel/events';
import { createLogger, loadConfig, connectWithRetry, registerGlobalProcessHandlers, registerFastifyErrorHandler } from '@nightfuel/config';
import { z } from 'zod';
import { SleepService } from './sleep.service';

const envSchema = z.object({
    SLEEP_PORT: z.string().default('3012'),
    JWT_SECRET: z.string().min(1),
    REDIS_URL: z.string().url(),
});

const config = loadConfig(envSchema);
const logger = createLogger('sleep-service');
const prisma = new PrismaClient();
const eventBus = new RedisEventBus(config.REDIS_URL);
const sleepSvc = new SleepService(prisma, eventBus);

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
        reply.send(err);
    }
});

// ── Shared schemas ─────────────────────────────────────────────────────────────

const createSessionSchema = z.object({
    startTime: z.string().datetime(),
    endTime: z.string().datetime().optional().nullable(),
    quality: z.number().int().min(1).max(10).optional().nullable(),
    disturbances: z.number().int().min(0).optional(),
    source: z.string().optional(),
    circadianSleepStart: z.string().datetime().optional().nullable(),
    circadianSleepEnd: z.string().datetime().optional().nullable(),
    notes: z.string().max(1000).optional().nullable(),
});

const updateSessionSchema = z.object({
    endTime: z.string().datetime().optional(),
    quality: z.number().int().min(1).max(10).optional(),
    disturbances: z.number().int().min(0).optional(),
    notes: z.string().max(1000).optional(),
});

const preferencesSchema = z.object({
    targetDuration: z.number().int().min(60).max(720).optional(),
    windDownDuration: z.number().int().min(0).max(120).optional(),
    temperatureTarget: z.number().min(15).max(30).optional().nullable(),
});

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
        return reply.code(500).send({ error: err.message });
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
        return reply.code(500).send({ error: err.message });
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
        return reply.code(500).send({ error: err.message });
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
        const status = err.message.includes('not found') ? 404 : 500;
        return reply.code(status).send({ error: err.message });
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
        return reply.code(500).send({ error: err.message });
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
        return reply.code(500).send({ error: err.message });
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
