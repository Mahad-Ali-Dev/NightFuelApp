import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { PrismaClient } from './generated/prisma';
import { RedisEventBus } from '@nightfuel/events';
import { createLogger, loadConfig, connectWithRetry, registerGlobalProcessHandlers, registerFastifyErrorHandler, sendUnauthorized, makeInternalAuthGuard } from '@nightfuel/config';
import { z } from 'zod';
import { MealService } from './meal.service';
import { mealRoutes } from './routes';
import fastifyJwt from '@fastify/jwt';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyRateLimit from '@fastify/rate-limit';

const envSchema = z.object({
    MEAL_PORT: z.string().default('3006'),
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    REDIS_URL: z.string().url(),
    PLAN_SERVICE_URL: z.string().url(),
    // F34 #5: shared token sent as X-Internal-Token on the s2s call to
    // plan-service /v1/plans/internal/active/:userId. Defaulted so boot doesn't
    // break; plan-service's guard rejects an empty/wrong token.
    INTERNAL_SERVICE_TOKEN: z.string().default(''),
});

const config = loadConfig(envSchema);
const logger = createLogger('meal-service');
const prisma = new PrismaClient();
const eventBus = new RedisEventBus(config.REDIS_URL);
const mealService = new MealService(
    prisma,
    eventBus,
    { PLAN_SERVICE_URL: config.PLAN_SERVICE_URL, INTERNAL_SERVICE_TOKEN: config.INTERNAL_SERVICE_TOKEN }
);

const fastify = Fastify({ logger: false });
registerGlobalProcessHandlers(logger);
registerFastifyErrorHandler(fastify, logger);

fastify.setValidatorCompiler(validatorCompiler);
fastify.setSerializerCompiler(serializerCompiler);
fastify.withTypeProvider<ZodTypeProvider>();

fastify.register(fastifyHelmet);

fastify.register(fastifyRateLimit, {
    max: 100,
    timeWindow: '1 minute'
});

fastify.register(fastifyCors, {
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
});

fastify.register(fastifyJwt, {
    secret: config.JWT_SECRET,
});

fastify.decorate('authenticate', async (request: any, reply: any) => {
    try {
        await request.jwtVerify();
    } catch (err) {
        return sendUnauthorized(reply, request, err);
    }
});

fastify.get('/health', async () => {
    return { status: 'ok', service: 'meal-service' };
});

// F34 #5 / GDPR purge: guard the server-to-server-only /v1/meals/internal/*
// routes with the shared INTERNAL_SERVICE_TOKEN (X-Internal-Token header). An
// unset/empty token fails CLOSED (every request 404s until the token is set).
const internalAuth = makeInternalAuthGuard(config.INTERNAL_SERVICE_TOKEN);

// ── DELETE /v1/meals/internal/user/:userId (GDPR purge) ─────────────────────────
// Server-to-server only (nginx 404s /v1/<svc>/internal/* at the edge; the
// internalAuth preHandler additionally requires X-Internal-Token). PERMANENTLY
// erases EVERY meal-service row owned by :userId across both user-owned tables
// (meal_logs, fasting_logs). food_items / recipes are shared library data with no
// per-user ownership and are left untouched. IDEMPOTENT: purging a user with no
// rows returns 200 with zero counts; purging twice is safe (deleteMany never
// throws on zero rows). Returns a per-table deletedCounts summary.
fastify.withTypeProvider<ZodTypeProvider>().delete('/v1/meals/internal/user/:userId', {
    preHandler: internalAuth,
    schema: { params: z.object({ userId: z.string().uuid() }) },
}, async (request, reply) => {
    const { userId } = request.params;
    try {
        const deletedCounts = await mealService.purgeUser(userId);
        return reply.code(200).send({ userId, deletedCounts });
    } catch (err: any) {
        request.log.error({ err, userId }, 'GDPR purge failed');
        return reply.code(500).send({ error: 'Internal server error' });
    }
});

fastify.register(async (instance) => {
    await mealRoutes(instance, { mealService });
}, { prefix: '/v1/meals' });

const start = async () => {
    try {
        await connectWithRetry(prisma, logger);
        logger.info('Connected to Database');

        await fastify.listen({ port: parseInt(config.MEAL_PORT), host: '0.0.0.0' });
        logger.info(`Meal Service running on port ${config.MEAL_PORT}`);
    } catch (err) {
        logger.error(err);
        process.exit(1);
    }
};

const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutdown signal received');
    try {
        await fastify.close();
        await eventBus.disconnect();
        await prisma.$disconnect();
        logger.info('Graceful shutdown complete');
        process.exit(0);
    } catch (err) {
        logger.error(err, 'Error during shutdown');
        process.exit(1);
    }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start();
