import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { PrismaClient } from './generated/prisma';
import { RedisEventBus } from '@nightfuel/events';
import { createLogger, loadConfig, connectWithRetry, registerGlobalProcessHandlers, registerFastifyErrorHandler } from '@nightfuel/config';
import { z } from 'zod';
import { ShiftService } from './shift.service';
import { shiftRoutes } from './routes';
import fastifyJwt from '@fastify/jwt';
import fastifyCors from '@fastify/cors';

const envSchema = z.object({
    SHIFT_PORT: z.string().default('3002'),
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    REDIS_URL: z.string().url(),
});

const config = loadConfig(envSchema);
const logger = createLogger('shift-service');

const prisma = new PrismaClient();
const eventBus = new RedisEventBus(config.REDIS_URL);
const shiftService = new ShiftService(prisma, eventBus);

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
    return { status: 'ok', service: 'shift-service' };
});

// Register routes
fastify.register(async (instance) => {
    await shiftRoutes(instance, { shiftService });
}, { prefix: '/v1/shifts' });

const start = async () => {
    try {
        await connectWithRetry(prisma, logger);
        logger.info('Connected to Database');

        await fastify.listen({ port: parseInt(config.SHIFT_PORT), host: '0.0.0.0' });
        logger.info(`Shift Service running on port ${config.SHIFT_PORT}`);
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
