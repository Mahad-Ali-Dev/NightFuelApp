import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { PrismaClient } from './generated/prisma';
import { RedisEventBus } from '@nightfuel/events';
import { createLogger, loadConfig, bootstrapCluster, connectWithRetry, registerGlobalProcessHandlers, registerFastifyErrorHandler, sendUnauthorized } from '@nightfuel/config';
import { z } from 'zod';
import { AuthService } from './auth.service';
import { authRoutes } from './routes';
import { setupEventSubscribers } from './events';
import fastifyJwt from '@fastify/jwt';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyRateLimit from '@fastify/rate-limit';

const envSchema = z.object({
    AUTH_PORT: z.string().default('3001'),
    // auth-service is the token *issuer*, so it sets the security floor for the
    // whole platform. A weak/short secret would let every access token be
    // forged, so we require >=32 chars and fail loudly at boot (via loadConfig)
    // rather than booting silently on a weak secret.
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    REDIS_URL: z.string().url(),
    // Comma-separated list of allowed web origins. Falls back to localhost dev
    // origins. Never use '*' here — credentials:true forbids a wildcard origin.
    CORS_ORIGINS: z.string().optional(),
    // F34 #5 / F35a: shared secret that the /v1/auth/internal/* routes verify via
    // the makeInternalAuthGuard preHandler (constant-time X-Internal-Token check).
    // Defaulted so boot doesn't break in dev/test; when empty the guard fails
    // closed (every /internal request 404s). Mirrors user-service / plan-service.
    INTERNAL_SERVICE_TOKEN: z.string().default(''),
});

const config = loadConfig(envSchema);
const logger = createLogger('auth-service');

const prisma = new PrismaClient();
const eventBus = new RedisEventBus(config.REDIS_URL);
const authService = new AuthService(prisma, eventBus, { JWT_SECRET: config.JWT_SECRET });

// trustProxy: behind nginx / the platform reverse proxy, so request.ip reflects
// the real client IP from X-Forwarded-For rather than the proxy's address. The
// credential routes key their per-route rate limit on request.ip (routes.ts), so
// without this every client would share the proxy's IP bucket (mirrors
// subscription-service's `trustProxy: true`).
const fastify = Fastify({ logger: false, trustProxy: true });
registerGlobalProcessHandlers(logger);
registerFastifyErrorHandler(fastify, logger);

// Register Zod validation
fastify.setValidatorCompiler(validatorCompiler);
fastify.setSerializerCompiler(serializerCompiler);

fastify.withTypeProvider<ZodTypeProvider>();

// Security headers — register before routes so every response is covered.
fastify.register(fastifyHelmet);

// Global rate limit — a generous ceiling across all routes; the auth-sensitive
// endpoints (login/register/forgot/reset) tighten this per-route in routes.ts.
fastify.register(fastifyRateLimit, {
    max: 100,
    timeWindow: '1 minute',
});

// Register CORS — allow the configured web client origins. Origins come from
// CORS_ORIGINS (comma-separated) when set, otherwise the localhost dev origins.
// credentials:true means we must never send a wildcard origin.
const corsOrigins = config.CORS_ORIGINS
    ? config.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
    : ['http://localhost:3000', 'http://127.0.0.1:3000'];

fastify.register(fastifyCors, {
    origin: corsOrigins,
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
    return { status: 'ok', service: 'auth-service' };
});

// Register routes
fastify.register(async (instance) => {
    await authRoutes(instance, { authService, internalServiceToken: config.INTERNAL_SERVICE_TOKEN });
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
