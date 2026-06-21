import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { PrismaClient } from './generated/prisma';
import { RedisEventBus } from '@nightfuel/events';
import { createLogger, loadConfig, connectWithRetry, registerGlobalProcessHandlers, registerFastifyErrorHandler, sendUnauthorized } from '@nightfuel/config';
import { z } from 'zod';
import { ProgressService } from './progress.service';
import { progressRoutes } from './routes';
import { setupEventSubscribers } from './events';
import fastifyJwt from '@fastify/jwt';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyRateLimit from '@fastify/rate-limit';

const envSchema = z.object({
    PROGRESS_PORT: z.string().default('3007'),
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    REDIS_URL: z.string().url(),
    USER_SERVICE_URL: z.string().url(),
    AI_PIPELINE_URL: z.string().url().optional(),
    // F22 #8: shared token for the server-to-server call to ai-pipeline
    // (X-Internal-Token). Defaulted so boot doesn't break; prod must set it.
    INTERNAL_SERVICE_TOKEN: z.string().default(''),
});

const config = loadConfig(envSchema);
const logger = createLogger('progress-service');
const prisma = new PrismaClient();
const eventBus = new RedisEventBus(config.REDIS_URL);
const progressService = new ProgressService(
    prisma,
    eventBus,
    {
        USER_SERVICE_URL: config.USER_SERVICE_URL,
        AI_PIPELINE_URL: config.AI_PIPELINE_URL,
        INTERNAL_SERVICE_TOKEN: config.INTERNAL_SERVICE_TOKEN,
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
    timeWindow: '1 minute',
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

declare module 'fastify' {
    export interface FastifyInstance {
        authenticate: any;
    }
}

fastify.get('/health', async () => {
    return { status: 'ok', service: 'progress-service' };
});

fastify.register(async (instance) => {
    await progressRoutes(instance, { progressService });
}, { prefix: '/v1/progress' });

const start = async () => {
    try {
        await connectWithRetry(prisma, logger);
        logger.info('Connected to Database');

        await setupEventSubscribers(eventBus, progressService);
        logger.info('Subscribed to event bus');

        await fastify.listen({ port: parseInt(config.PROGRESS_PORT), host: '0.0.0.0' });
        logger.info(`Progress Service running on port ${config.PROGRESS_PORT}`);
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
