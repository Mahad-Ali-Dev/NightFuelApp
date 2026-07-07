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
    // ── SMTP (password-reset email delivery) ────────────────────────────────
    // All OPTIONAL so the service still boots without mail creds (dev/test).
    // When SMTP_HOST is set, forgotPassword() sends a real reset email via
    // nodemailer; when it is unset the service logs a clearly-marked DEV
    // fallback containing the reset link instead, so the flow stays testable
    // without creds. OWNER: set these in production for real email delivery.
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.string().optional(),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    SMTP_FROM: z.string().optional(),
    // Base URL the password-reset link points at (the mobile/web reset screen).
    // Falls back to the production marketing reset page when unset.
    APP_RESET_URL: z.string().optional(),
    // ── Social sign-in (Google + Apple) ─────────────────────────────────────
    // All OPTIONAL for graceful degradation: when the creds are absent, the
    // corresponding /oauth/* route returns a clean 503 ("... is not configured")
    // instead of crashing. GOOGLE_CLIENT_IDS is a comma-separated allowlist of
    // accepted Google OAuth client IDs (the audience the ID token must target —
    // typically the web + iOS + Android client IDs). APPLE_CLIENT_ID is the
    // audience for Apple identity tokens (defaults to the app bundle id
    // com.zeitra.app inside oauth.ts). The oauth.ts helpers read these directly
    // from process.env, so they are declared here only to document + validate
    // them at boot (no crash when unset).
    GOOGLE_CLIENT_IDS: z.string().optional(),
    APPLE_CLIENT_ID: z.string().optional(),
});

const config = loadConfig(envSchema);
const logger = createLogger('auth-service');

const prisma = new PrismaClient();
const eventBus = new RedisEventBus(config.REDIS_URL);
const authService = new AuthService(prisma, eventBus, {
    JWT_SECRET: config.JWT_SECRET,
    smtp: {
        host: config.SMTP_HOST,
        port: config.SMTP_PORT,
        user: config.SMTP_USER,
        password: config.SMTP_PASSWORD,
        from: config.SMTP_FROM,
    },
    appResetUrl: config.APP_RESET_URL,
});

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
