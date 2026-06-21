import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { PrismaClient } from './generated/prisma';
import { RedisEventBus } from '@nightfuel/events';
import { createLogger, loadConfig, connectWithRetry, registerGlobalProcessHandlers, registerFastifyErrorHandler, makeInternalAuthGuard } from '@nightfuel/config';
import { z } from 'zod';
import { setupEventSubscribers } from './events';
import { StateMaterializer } from './materializer';
import { purgeUser } from './purge';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';

const envSchema = z.object({
    STATE_PORT: z.string().default('3015'),
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    REDIS_URL: z.string().url(),
    // Comma-separated list of allowed web origins. Optional: when unset we fail
    // CLOSED with an empty allowlist (no cross-origin browser access) rather than
    // reflecting the request origin. Never use '*' with credentials.
    CORS_ORIGIN: z.string().optional(),
    // F34 #5 / GDPR purge: shared token required (as X-Internal-Token) on the
    // server-to-server-only /v1/state/internal/* routes. Defaulted so boot never
    // breaks; the guard fails CLOSED on an empty/wrong token (every request 404s
    // until the token is set), matching user-service / plan-service / sleep-service.
    INTERNAL_SERVICE_TOKEN: z.string().default(''),
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
// Explicit allowlist from CORS_ORIGIN (comma-separated). When unset the list is
// empty, so the browser is told no cross-origin is allowed (fail CLOSED). Never
// '*' and never reflect the request origin.
const corsOrigins = config.CORS_ORIGIN
    ? config.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean)
    : [];
fastify.register(fastifyCors, { origin: corsOrigins });

fastify.get('/health', async () => {
    return { status: 'ok', service: 'state-service' };
});

// F34 #5 / GDPR purge: guard the server-to-server-only /v1/state/internal/*
// routes with the shared INTERNAL_SERVICE_TOKEN (X-Internal-Token header). An
// unset/empty token fails CLOSED (every request 404s until the token is set).
const internalAuth = makeInternalAuthGuard(config.INTERNAL_SERVICE_TOKEN);

// ── DELETE /v1/state/internal/user/:userId (GDPR purge) ─────────────────────────
// Server-to-server only (nginx 404s /v1/<svc>/internal/* at the edge; the
// internalAuth preHandler additionally requires X-Internal-Token). PERMANENTLY
// erases EVERY state-service row owned by :userId. This service has exactly ONE
// user-owned table (user_states, keyed by user_id). IDEMPOTENT: purging a user
// with no rows returns 200 with zero counts; purging twice is safe (deleteMany
// never throws on zero rows). Returns a per-table deletedCounts summary.
fastify.withTypeProvider<ZodTypeProvider>().delete('/v1/state/internal/user/:userId', {
    preHandler: internalAuth,
    schema: { params: z.object({ userId: z.string().min(1).max(64) }) },
}, async (request, reply) => {
    const { userId } = request.params;
    try {
        const deletedCounts = await purgeUser(prisma, userId);
        return reply.code(200).send({ userId, deletedCounts });
    } catch (err: any) {
        request.log.error({ err, userId }, 'GDPR purge failed');
        return reply.code(500).send({ error: 'Internal server error' });
    }
});

fastify.get(
    '/v1/state/:userId',
    {
        // Bound the path param BEFORE it reaches Prisma: an empty or oversized
        // userId now 400s via the registered shared error handler instead of
        // hitting an unbounded findUnique. 64 chars comfortably covers a UUID
        // / cuid while rejecting absurd inputs.
        schema: { params: z.object({ userId: z.string().min(1).max(64) }) },
    },
    async (request, reply) => {
        const { userId } = request.params as { userId: string };
        const state = await prisma.userState.findUnique({ where: { userId } });
        if (!state) {
            return reply.status(404).send({ error: 'User state not found' });
        }
        return state;
    },
);


const start = async () => {
    try {
        await connectWithRetry(prisma, logger);
        logger.info('Connected to Database');

        await setupEventSubscribers(eventBus, materializer);
        logger.info('Subscribed to event bus');

        await fastify.listen({ port: parseInt(config.STATE_PORT), host: '0.0.0.0' });
        logger.info(`State Service running on port ${config.STATE_PORT}`);
    } catch (err) {
        // Log only the message, never the raw error object — a thrown
        // connection error can carry the DB/Redis connection string.
        logger.error({ err: err instanceof Error ? err.message : 'unknown' }, 'startup failed');
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
        // Same redaction rationale as start(): never dump the raw error object.
        logger.error({ err: err instanceof Error ? err.message : 'unknown' }, 'Error during shutdown');
        process.exit(1);
    }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start();
