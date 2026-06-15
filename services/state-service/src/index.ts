import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { PrismaClient } from './generated/prisma';
import { RedisEventBus } from '@nightfuel/events';
import { createLogger, loadConfig, connectWithRetry, registerGlobalProcessHandlers, registerFastifyErrorHandler } from '@nightfuel/config';
import { z } from 'zod';
import { setupEventSubscribers } from './events';
import { StateMaterializer } from './materializer';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';

const envSchema = z.object({
    STATE_PORT: z.string().default('3015'),
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    REDIS_URL: z.string().url(),
});

const config = loadConfig(envSchema);
const logger = createLogger('state-service');
const prisma = new PrismaClient();
const eventBus = new RedisEventBus(config.REDIS_URL);
const materializer = new StateMaterializer(prisma);

const fastify = Fastify({ logger: false });
registerGlobalProcessHandlers(logger);
registerFastifyErrorHandler(fastify, logger);

fastify.setValidatorCompiler(validatorCompiler);
fastify.setSerializerCompiler(serializerCompiler);
fastify.withTypeProvider<ZodTypeProvider>();

fastify.register(fastifyHelmet);
fastify.register(fastifyCors, { origin: true });

fastify.get('/health', async () => {
    return { status: 'ok', service: 'state-service' };
});

fastify.get('/v1/state/:userId', async (request, reply) => {
    const { userId } = request.params as { userId: string };
    const state = await prisma.userState.findUnique({ where: { userId } });
    if (!state) {
        return reply.status(404).send({ error: 'User state not found' });
    }
    return state;
});


const start = async () => {
    try {
        await connectWithRetry(prisma, logger);
        logger.info('Connected to Database');

        await setupEventSubscribers(eventBus, materializer);
        logger.info('Subscribed to event bus');

        await fastify.listen({ port: parseInt(config.STATE_PORT), host: '0.0.0.0' });
        logger.info(`State Service running on port ${config.STATE_PORT}`);
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
