import 'dotenv/config';
import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import fastifyJwt from '@fastify/jwt';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyRateLimit from '@fastify/rate-limit';
import { z } from 'zod';
import { PrismaClient } from './generated/prisma';
import { RedisEventBus } from '@nightfuel/events';
import { createLogger, loadConfig, sendUnauthorized } from '@nightfuel/config';
import { NotificationService } from './notification.service';
import { PushService } from './push.service';
import { notificationRoutes } from './routes';
import { setupEventSubscribers } from './events';
import fastifySocketIO from 'fastify-socket.io';

// ---------------------------------------------------------------------------
// Environment validation
// Extends the base schema (NODE_ENV, LOG_LEVEL, REDIS_URL, DATABASE_URL)
// with service-specific variables.
// ---------------------------------------------------------------------------
const envSchema = z.object({
    NOTIF_PORT: z.string().default('3008'),
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    // Override: the notification service uses NOTIF_DATABASE_URL as primary,
    // but @nightfuel/config baseEnvSchema requires DATABASE_URL to be present.
    // Both are in .env, so this is satisfied automatically.
    NOTIF_DATABASE_URL: z.string().url(),
    NOTIF_DIRECT_URL: z.string().url(),
});

const config = loadConfig(envSchema);
const logger = createLogger('notification-service') as any;

// ---------------------------------------------------------------------------
// Infrastructure
// ---------------------------------------------------------------------------
const prisma = new PrismaClient({
    datasources: {
        db: {
            url: config.NOTIF_DATABASE_URL,
        },
    },
    log: config.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['warn', 'error'],
});

const eventBus = new RedisEventBus(config.REDIS_URL);
const notificationService = new NotificationService(prisma);
const pushService = new PushService(prisma, logger);

// ---------------------------------------------------------------------------
// Fastify instance
// ---------------------------------------------------------------------------
const fastify = Fastify({
    // We wire our own pino logger via @nightfuel/config; Fastify's built-in
    // logger is disabled to avoid duplicate log streams.
    logger: false,
});

// Zod type-provider wiring
fastify.setValidatorCompiler(validatorCompiler);
fastify.setSerializerCompiler(serializerCompiler);
fastify.withTypeProvider<ZodTypeProvider>();

// ---------------------------------------------------------------------------
// Plugin registration
// ---------------------------------------------------------------------------

// Security headers
fastify.register(fastifyHelmet, {
    contentSecurityPolicy: false, // APIs don't serve HTML
});

// CORS — allow the web client and local dev origins
fastify.register(fastifyCors, {
    origin: [
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'http://localhost:8081', // Expo dev server
    ],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
});

// Rate limiting — global, per IP
fastify.register(fastifyRateLimit, {
    global: true,
    max: 200,
    timeWindow: '1 minute',
    errorResponseBuilder: (_request, context) => ({
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Retry after ${context.after}`,
        statusCode: 429,
    }),
});

// JWT — all protected routes use fastify.authenticate as a preHandler
fastify.register(fastifyJwt, {
    secret: config.JWT_SECRET,
});

// Socket.io integration
fastify.register(fastifySocketIO, {
    cors: {
        origin: [
            'http://localhost:3000',
            'http://127.0.0.1:3000',
            'http://localhost:8081',
        ],
        methods: ['GET', 'POST'],
        credentials: true,
    },
});

// Reusable authenticate decorator (consistent with other NightFuel services)
fastify.decorate('authenticate', async (request: any, reply: any) => {
    try {
        await request.jwtVerify();
    } catch (err) {
        return sendUnauthorized(reply, request, err);
    }
});

// Socket connection handler
fastify.ready((err) => {
    if (err) throw err;

    (fastify as any).io.on('connection', async (socket: any) => {
        const token = socket.handshake.auth.token || socket.handshake.headers['authorization']?.split(' ')[1];

        if (!token) {
            logger.warn('Socket connection attempt without token');
            socket.disconnect();
            return;
        }

        try {
            const decoded = fastify.jwt.verify(token) as any;
            const userId = decoded.userId;

            if (!userId) {
                logger.warn('Invalid socket token — userId missing');
                socket.disconnect();
                return;
            }

            // Join a private room for this user
            socket.join(`user:${userId}`);
            logger.info({ userId, socketId: socket.id }, 'User joined real-time notification room');

            socket.on('disconnect', () => {
                logger.info({ userId, socketId: socket.id }, 'User disconnected from real-time room');
            });
        } catch (err: any) {
            if (err.code === 'FAST_JWT_EXPIRED') {
                logger.warn({ socketId: socket.id }, 'Socket authentication failed — token expired');
            } else {
                logger.error({ err }, 'Socket authentication failed');
            }
            socket.disconnect();
        }
    });
});

// ---------------------------------------------------------------------------
// Health check (unauthenticated)
// ---------------------------------------------------------------------------
fastify.get('/health', async (_request, reply) => {
    let dbOk = false;
    try {
        await prisma.$queryRaw`SELECT 1`;
        dbOk = true;
    } catch {
        dbOk = false;
    }

    const status = dbOk ? 'ok' : 'degraded';
    reply.code(dbOk ? 200 : 503).send({
        status,
        service: 'notification-service',
        timestamp: new Date().toISOString(),
        db: dbOk ? 'connected' : 'error',
    });
});

// ---------------------------------------------------------------------------
// Route registration
// All notification routes are prefixed with /v1/notifications
// ---------------------------------------------------------------------------
fastify.register(
    async (instance) => {
        await notificationRoutes(instance, { notificationService, pushService });
    },
    { prefix: '/v1/notifications' },
);

// ---------------------------------------------------------------------------
// Global error handler
// ---------------------------------------------------------------------------
// Redaction contract (mirrors user-service/src/index.ts setErrorHandler — see
// __tests__/error-redaction.test.ts for the locked-in shape):
//   • The structured `logger.error` line below STILL captures the full error
//     object server-side (stack, Prisma details, conn-string fragments).
//   • On the wire we NEVER reflect `error.message` or `error.stack` on the 500
//     branch — it just returns the fixed generic 'Internal server error'.
//   • On the <500 branch we reflect `error.message` only when `error.validation`
//     is truthy (i.e. a Fastify-generated user-facing schema error); every other
//     4xx gets the generic 'Bad request' so internal error.message can't leak.
fastify.setErrorHandler((error, request, reply) => {
    logger.error(
        {
            err: error,
            url: request.url,
            method: request.method,
            statusCode: error.statusCode,
        },
        'Unhandled request error',
    );

    if (error.statusCode && error.statusCode < 500) {
        return reply.code(error.statusCode).send({
            statusCode: error.statusCode,
            error: error.name ?? 'Bad Request',
            message: error.validation ? error.message : 'Bad request',
        });
    }

    return reply.code(500).send({
        statusCode: 500,
        error: 'Internal Server Error',
        message: 'Internal server error',
    });
});

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------
const start = async (): Promise<void> => {
    try {
        // Connect to Postgres
        await prisma.$connect();
        logger.info('Connected to PostgreSQL (notification-service)');

        // Set up Redis event subscribers
        // Each subscriber is internally wrapped in try/catch — see events.ts
        setupEventSubscribers(eventBus, notificationService, fastify);
        logger.info('Redis event subscribers active');

        // Start HTTP server
        const port = parseInt(config.NOTIF_PORT, 10);
        await fastify.listen({ port, host: '0.0.0.0' });
        logger.info({ port }, 'Notification service listening');
    } catch (err) {
        logger.error(err, 'Fatal error during startup — shutting down');
        process.exit(1);
    }
};

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------
const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Received shutdown signal — closing gracefully');
    try {
        await fastify.close();
        await prisma.$disconnect();
        await eventBus.disconnect();
        logger.info('Clean shutdown complete');
        process.exit(0);
    } catch (err) {
        logger.error(err, 'Error during graceful shutdown');
        process.exit(1);
    }
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('uncaughtException', (err) => {
    logger.error(err, 'Uncaught exception — shutting down');
    process.exit(1);
});
process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'Unhandled promise rejection — shutting down');
    process.exit(1);
});

start();
