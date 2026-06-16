import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { PrismaClient } from './generated/prisma';
import { RedisEventBus } from '@nightfuel/events';
import { createLogger, loadConfig, bootstrapCluster, connectWithRetry, registerGlobalProcessHandlers, sendUnauthorized } from '@nightfuel/config';
import { z } from 'zod';
import { UserService } from './user.service';
import { userRoutes } from './routes';
import { setupEventSubscribers } from './events';
import fastifyJwt from '@fastify/jwt';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyRateLimit from '@fastify/rate-limit';

// ── Environment validation ────────────────────────────────────────────────────
const envSchema = z.object({
    USER_PORT: z.string().default('3009'),
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    USER_DATABASE_URL: z.string().url(),
    USER_DIRECT_URL: z.string().url(),
});

const config = loadConfig(envSchema);
const logger = createLogger('user-service');

// ── Infrastructure instantiation ──────────────────────────────────────────────
const prisma = new PrismaClient({
    datasources: {
        db: {
            url: config.USER_DATABASE_URL,
        },
    },
    log: [
        { level: 'warn', emit: 'event' },
        { level: 'error', emit: 'event' },
    ],
});

prisma.$on('warn' as never, (e: any) => logger.warn(e, 'Prisma warning'));
prisma.$on('error' as never, (e: any) => logger.error(e, 'Prisma error'));

const eventBus = new RedisEventBus(config.REDIS_URL);
const userService = new UserService(prisma, eventBus);

// ── Fastify setup ─────────────────────────────────────────────────────────────
const fastify = Fastify({ logger: false });
registerGlobalProcessHandlers(logger);

fastify.setValidatorCompiler(validatorCompiler);
fastify.setSerializerCompiler(serializerCompiler);
fastify.withTypeProvider<ZodTypeProvider>();

// ── Plugin registrations ──────────────────────────────────────────────────────
fastify.register(fastifyHelmet, {
    // Allow JSON responses — contentSecurityPolicy can be restrictive for APIs
    contentSecurityPolicy: false,
});

fastify.register(fastifyRateLimit, {
    max: 200,
    timeWindow: '1 minute',
    errorResponseBuilder: (_req, context) => ({
        error: 'Too many requests',
        retryAfter: context.after,
    }),
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

// ── JWT authenticate decorator ────────────────────────────────────────────────
fastify.decorate('authenticate', async (request: any, reply: any) => {
    try {
        await request.jwtVerify();
    } catch (err) {
        return sendUnauthorized(reply, request, err);
    }
});

// ── Health check ──────────────────────────────────────────────────────────────
fastify.get('/health', async () => {
    return { status: 'ok', service: 'user-service', timestamp: new Date().toISOString() };
});

// ── Route registration ────────────────────────────────────────────────────────
fastify.register(
    async (instance) => {
        await userRoutes(instance, { userService });
    },
    { prefix: '/v1/users' }
);

// ── Global error handler ──────────────────────────────────────────────────────
fastify.setErrorHandler((error, request, reply) => {
    logger.error(
        {
            err: error,
            url: request.url,
            method: request.method,
            body: request.body,
            params: request.params,
            query: request.query,
            user: request.user,
        },
        'Unhandled route error'
    );

    // Fastify validation errors have a statusCode of 400. Fastify-generated
    // validation messages are user-facing and safe to reflect; any other <500
    // error gets a generic string so internal error.message never leaks.
    if (error.statusCode && error.statusCode < 500) {
        return reply.code(error.statusCode).send({
            error: error.name,
            message: error.validation ? error.message : 'Bad request',
            statusCode: error.statusCode,
        });
    }

    // 500 branch: NEVER reflect error.message or error.stack on the wire — the
    // real cause is already in the structured `logger.error` above.
    return reply.code(500).send({
        statusCode: 500,
        error: 'Internal Server Error',
        message: 'Internal server error',
    });
});

// ── Bootstrap ────────────────────────────────────────────────────────────────
const start = async (): Promise<void> => {
    try {
        await connectWithRetry(prisma, logger);
        logger.info('Connected to user-service database');

        // Register event subscribers before accepting HTTP traffic
        setupEventSubscribers(eventBus, userService);
        logger.info('Redis event subscribers registered');

        const port = parseInt(config.USER_PORT, 10);
        await fastify.listen({ port, host: '0.0.0.0' });
        logger.info(`User Service running on port ${port}`);
    } catch (err) {
        logger.error(err, 'Failed to start user-service');
        process.exit(1);
    }
};

// ── Graceful shutdown ─────────────────────────────────────────────────────────
const shutdown = async (signal: string): Promise<void> => {
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
    serviceName: 'user-service',
    port: parseInt(config.USER_PORT),
    startServer: start
});
