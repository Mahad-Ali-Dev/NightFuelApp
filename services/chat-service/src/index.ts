import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { PrismaClient } from './generated/prisma';
import { createLogger, loadConfig, connectWithRetry, registerGlobalProcessHandlers, registerFastifyErrorHandler } from '@nightfuel/config';
import { z } from 'zod';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyWebsocket from '@fastify/websocket';
import { RedisEventBus } from '@nightfuel/events';
import { ChatService } from './chat.service';
import routes from './routes';

const envSchema = z.object({
    CHAT_PORT: z.string().default('3014'),
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    REDIS_URL: z.string().url(),
    // Resolves the caller's plan for the Ria daily-AI quota. Defaulted so a
    // missing env doesn't fail boot; the service degrades to plan=free if the
    // subscription-service is unreachable (see chat.service resolvePlan).
    SUBSCRIPTION_SERVICE_URL: z.string().url().default('http://subscription-service:3015'),
    // Comma-separated list of allowed web origins. Optional: when unset we fail
    // CLOSED with an empty allowlist (no cross-origin browser access) rather than
    // reflecting the request origin. Never use '*' with credentials.
    CORS_ORIGIN: z.string().optional(),
});

const config = loadConfig(envSchema);
const logger = createLogger('chat-service');
const prisma = new PrismaClient();
const eventBus = new RedisEventBus(config.REDIS_URL);

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

// Global IP-cap on every request — including the GET that initiates the
// /v1/chat/ws upgrade — so a hostile client can't churn through expensive
// JWT verifies / DB writes from a single IP. Stays generous enough for a
// normal phone client (a few polls + the upgrade) and is layered on top of
// the per-socket token bucket inside the WS handler.
//
// max:60/min (was 10) — 10/min false-trips legitimate users who share one
// egress IP behind cellular-carrier and hospital/corporate NAT. 60/min keeps
// abuse protection (the per-socket token bucket, 8KB frame cap, and 5-min
// idle close in routes.ts remain the real floor) without punishing NAT'd
// clients.
//
// keyGenerator stays IP-based: the JWT is only verified INSIDE the WS route
// handler (routes.ts) — i.e. AFTER this pre-handler limiter has already run —
// so no authenticated user-id is cleanly resolvable here. Keying by user-id
// would force this limiter to verify the token itself, duplicating the very
// crypto cost the IP cap exists to bound and re-opening the attack surface on
// unauthenticated input. IP keying remains correct; see risks for the NAT
// trade-off this still carries.
fastify.register(fastifyRateLimit, {
    max: 60,
    timeWindow: '1 minute',
    keyGenerator: (req) => req.ip,
});

// @fastify/websocket types conflict with ZodTypeProvider — cast to any
fastify.register(fastifyWebsocket as any);

fastify.get('/health', async () => {
    return { status: 'ok', service: 'chat-service' };
});

const chatService = new ChatService(prisma, eventBus);
fastify.register(routes, { chatService, jwtSecret: config.JWT_SECRET });


const start = async () => {
    try {
        await connectWithRetry(prisma, logger);
        logger.info('Connected to Database');

        await fastify.listen({ port: parseInt(config.CHAT_PORT), host: '0.0.0.0' });
        logger.info(`Chat Service running on port ${config.CHAT_PORT}`);
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
