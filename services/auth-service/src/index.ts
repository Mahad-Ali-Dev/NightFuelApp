import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { PrismaClient } from './generated/prisma';
import { RedisEventBus } from '@nightfuel/events';
import { createLogger, loadConfig, bootstrapCluster, connectWithRetry, registerGlobalProcessHandlers, registerFastifyErrorHandler } from '@nightfuel/config';
import { z } from 'zod';
import { AuthService } from './auth.service';
import { authRoutes } from './routes';
import { setupEventSubscribers } from './events';
import fastifyJwt from '@fastify/jwt';
import fastifyCors from '@fastify/cors';

const envSchema = z.object({
    AUTH_PORT: z.string().default('3001'),
    JWT_SECRET: z.string(),
    REDIS_URL: z.string().url(),
});

const config = loadConfig(envSchema);
const logger = createLogger('auth-service');

const prisma = new PrismaClient();
const eventBus = new RedisEventBus(config.REDIS_URL);
const authService = new AuthService(prisma, eventBus, { JWT_SECRET: config.JWT_SECRET });

const fastify = Fastify({ logger: false });
registerGlobalProcessHandlers(logger);
registerFastifyErrorHandler(fastify, logger);

// Register Zod validation
fastify.setValidatorCompiler(validatorCompiler);
fastify.setSerializerCompiler(serializerCompiler);

fastify.withTypeProvider<ZodTypeProvider>();

// Register CORS — allow the web client origin
fastify.register(fastifyCors, {
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
});

// Register JWT
fastify.register(fastifyJwt, {
    secret: config.JWT_SECRET,
});

// Decorator for protected routes
fastify.decorate('authenticate', async (request: any, reply: any) => {
    try {
        await request.jwtVerify();
    } catch (err) {
        reply.send(err);
    }
});

fastify.get('/health', async () => {
    return { status: 'ok', service: 'auth-service' };
});

// Register routes
fastify.register(async (instance) => {
    await authRoutes(instance, { authService });
}, { prefix: '/v1/auth' });

const start = async () => {
    try {
        await connectWithRetry(prisma, logger);
        logger.info('Connected to Database');

        // Register event subscribers
        setupEventSubscribers(eventBus, prisma);
        logger.info('Event subscribers registered');

        await fastify.listen({ port: parseInt(config.AUTH_PORT), host: '0.0.0.0' });
        logger.info(`Auth Service running on port ${config.AUTH_PORT}`);
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

bootstrapCluster({
    logger,
    serviceName: 'auth-service',
    port: parseInt(config.AUTH_PORT),
    startServer: start
});
