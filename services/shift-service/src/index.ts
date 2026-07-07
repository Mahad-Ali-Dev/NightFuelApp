import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { PrismaClient } from './generated/prisma';
import { RedisEventBus } from '@nightfuel/events';
import { createLogger, loadConfig, connectWithRetry, registerGlobalProcessHandlers, registerFastifyErrorHandler, sendUnauthorized, makeInternalAuthGuard } from '@nightfuel/config';
import { z } from 'zod';
import { ShiftService } from './shift.service';
import { shiftRoutes } from './routes';
import { trainingRoutes } from './training.routes';
import fastifyJwt from '@fastify/jwt';
import fastifyCors from '@fastify/cors';

const envSchema = z.object({
    SHIFT_PORT: z.string().default('3002'),
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    REDIS_URL: z.string().url(),
    // F35a / GDPR purge: shared server-to-server token used to authorize this
    // service's /v1/shifts/internal/* routes (sent as X-Internal-Token). Defaulted
    // so boot never breaks; an unset/empty token fails CLOSED (the guard 404s every
    // request until the token is set), mirroring user-service / plan-service.
    INTERNAL_SERVICE_TOKEN: z.string().default(''),
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
        return sendUnauthorized(reply, request, err);
    }
});

fastify.get('/health', async () => {
    return { status: 'ok', service: 'shift-service' };
});

// F34 #5 / GDPR purge (F35a): guard the server-to-server-only
// /v1/shifts/internal/* routes with the shared INTERNAL_SERVICE_TOKEN
// (X-Internal-Token header). An unset/empty token fails CLOSED — every request
// 404s until the token is set, indistinguishable from a route that doesn't exist.
const internalAuth = makeInternalAuthGuard(config.INTERNAL_SERVICE_TOKEN);

// ── DELETE /v1/shifts/internal/user/:userId (GDPR purge) ────────────────────────
// Server-to-server only (nginx 404s /v1/<svc>/internal/* at the edge; the
// internalAuth preHandler additionally requires X-Internal-Token). PERMANENTLY
// erases EVERY shift-service row owned by :userId across all three user-owned
// tables (shifts, rotation_patterns, scheduled_sessions). IDEMPOTENT: purging a
// user with no rows returns 200 with zero counts; purging twice is safe
// (deleteMany never throws on zero rows). Returns a per-table deletedCounts summary.
fastify.withTypeProvider<ZodTypeProvider>().delete('/v1/shifts/internal/user/:userId', {
    preHandler: internalAuth,
    schema: { params: z.object({ userId: z.string().uuid() }) },
}, async (request, reply) => {
    const { userId } = request.params;
    try {
        const deletedCounts = await shiftService.purgeUser(userId);
        return reply.code(200).send({ userId, deletedCounts });
    } catch (err: any) {
        request.log.error({ err, userId }, 'GDPR purge failed');
        return reply.code(500).send({ error: 'Internal server error' });
    }
});

// ── GET /v1/shifts/internal/user/:userId/export (GDPR data export) ───────────────
// READ-ONLY counterpart of the purge above (GDPR Right of Access). Behind the SAME
// internalAuth guard (404 without the X-Internal-Token; unset token fails CLOSED).
// READS and returns EVERY shift-service row owned by :userId across the SAME three
// user-owned tables the purge erases (shifts, rotation_patterns,
// scheduled_sessions), as a JSON object keyed by table name, so export and erasure
// stay in sync. IDEMPOTENT: a user with no rows returns empty tables, still 200; no
// writes ever occur. This service stores NO secrets/credentials, so every column is
// safe to emit verbatim (nothing to scrub).
fastify.withTypeProvider<ZodTypeProvider>().get('/v1/shifts/internal/user/:userId/export', {
    preHandler: internalAuth,
    schema: { params: z.object({ userId: z.string().uuid() }) },
}, async (request, reply) => {
    const { userId } = request.params;
    try {
        const data = await shiftService.exportUser(userId);
        return reply.code(200).send({ userId, data });
    } catch (err: any) {
        request.log.error({ err, userId }, 'GDPR export failed');
        return reply.code(500).send({ error: 'Internal server error' });
    }
});

// Register routes
fastify.register(async (instance) => {
    await shiftRoutes(instance, { shiftService });
}, { prefix: '/v1/shifts' });

// Scheduled-sessions routes for the mobile Training Calendar. Sibling of the
// shifts block above — reuses the same PrismaClient. Degrades to 200 [] while
// the user-gated scheduled_sessions migration is un-run (see training.routes.ts).
fastify.register(async (instance) => {
    await trainingRoutes(instance, { prisma });
}, { prefix: '/v1/training' });

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
