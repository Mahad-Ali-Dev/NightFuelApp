import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { PrismaClient } from './generated/prisma';
import { RedisEventBus } from '@nightfuel/events';
import { createLogger, loadConfig, connectWithRetry, registerGlobalProcessHandlers, registerFastifyErrorHandler, sendUnauthorized } from '@nightfuel/config';
import { z } from 'zod';
import { PlanService } from './plan.service';
import { PlanWorker } from './worker';
import { planRoutes } from './routes';
import { setupEventSubscribers } from './events';
import fastifyJwt from '@fastify/jwt';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyRateLimit from '@fastify/rate-limit';

const envSchema = z.object({
    PLAN_PORT: z.string().default('3005'),
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    AI_PIPELINE_URL: z.string().url(),
    USER_SERVICE_URL: z.string().url(),
    // Resolves the caller's plan for the AI daily-generation quota on
    // POST /v1/plans/generate. Defaulted so a missing env doesn't fail boot;
    // the route degrades to plan=free if the subscription-service is
    // unreachable. routes.ts reads process.env.SUBSCRIPTION_SERVICE_URL
    // directly (mirroring chat-service), so this entry just validates/defaults
    // the value at boot — no other index.ts wiring is required.
    SUBSCRIPTION_SERVICE_URL: z.string().url().default('http://subscription-service:3015'),
    STATE_SERVICE_URL: z.string().url(),
    DECISION_ENGINE_URL: z.string().url(),
    MEAL_SERVICE_URL: z.string().url(),
    EXERCISE_SERVICE_URL: z.string().url(),
    REDIS_URL: z.string().url(),
});

const config = loadConfig(envSchema);
const logger = createLogger('plan-service');
const prisma = new PrismaClient();
const eventBus = new RedisEventBus(config.REDIS_URL);
const planService = new PlanService(
    prisma,
    eventBus,
    {
        AI_PIPELINE_URL: config.AI_PIPELINE_URL,
        USER_SERVICE_URL: config.USER_SERVICE_URL,
        STATE_SERVICE_URL: config.STATE_SERVICE_URL,
        DECISION_ENGINE_URL: config.DECISION_ENGINE_URL,
        MEAL_SERVICE_URL: config.MEAL_SERVICE_URL,
        EXERCISE_SERVICE_URL: config.EXERCISE_SERVICE_URL,
    }
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
    return { status: 'ok', service: 'plan-service' };
});

fastify.register(async (instance) => {
    await planRoutes(instance, { planService });
}, { prefix: '/v1/plans' });

const start = async () => {
    try {
        await connectWithRetry(prisma, logger);
        logger.info('Connected to Database');

        await setupEventSubscribers(eventBus, planService);
        logger.info('Subscribed to event bus');

        const worker = new PlanWorker(planService, { USER_SERVICE_URL: config.USER_SERVICE_URL });
        worker.start();
        logger.info('Background worker started');

        await fastify.listen({ port: parseInt(config.PLAN_PORT), host: '0.0.0.0' });
        logger.info(`Plan Service running on port ${config.PLAN_PORT}`);
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
