/**
 * NightFuel – subscription-service
 *
 * Fastify v4 microservice responsible for managing user subscription tiers,
 * status, and feature limits.
 *
 * Port:    3010  (SUB_PORT env)
 * DB:      SUB_DATABASE_URL / SUB_DIRECT_URL (Supabase / PgBouncer)
 * Cache:   REDIS_URL  (Upstash Redis via ioredis)
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import { PrismaClient } from './generated/prisma';
import Redis from 'ioredis';
import pino from 'pino';
import { sendUnauthorized, registerFastifyErrorHandler } from '@nightfuel/config';

import { SubscriptionService } from './subscription.service';
import { subscriptionRoutes } from './routes';
import { setupEventSubscribers, type EventBus } from './events';
import { registerStripeRoutes } from './stripe';



// ─────────────────────────────────────────────────────────────────────────────
// Environment validation
// ─────────────────────────────────────────────────────────────────────────────

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const PORT = parseInt(process.env['SUB_PORT'] ?? '3010', 10);
const JWT_SECRET = requireEnv('JWT_SECRET');
const REDIS_URL = requireEnv('REDIS_URL');
const LOG_LEVEL = process.env['LOG_LEVEL'] ?? 'info';

// ─────────────────────────────────────────────────────────────────────────────
// Logger (pino — used both as the root logger and passed into Fastify)
// ─────────────────────────────────────────────────────────────────────────────

const rootLogger = pino({
  level: LOG_LEVEL,
  transport:
    process.env['NODE_ENV'] !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } }
      : undefined,
});

// ─────────────────────────────────────────────────────────────────────────────
// Redis EventBus adapter
// Wraps ioredis in the EventBus interface so the application layer stays
// decoupled from the underlying transport.
// ─────────────────────────────────────────────────────────────────────────────

function buildEventBus(redis: Redis): EventBus {
  // Separate subscriber client — ioredis requires a dedicated connection for
  // SUBSCRIBE / PSUBSCRIBE commands.
  const subClient = redis.duplicate();

  return {
    async subscribe(channel: string, handler: (message: string) => void | Promise<void>): Promise<void> {
      await subClient.subscribe(channel);
      subClient.on('message', (ch: string, message: string) => {
        if (ch === channel) {
          void handler(message);
        }
      });
    },

    async publish(channel: string, payload: Record<string, unknown>): Promise<void> {
      await redis.publish(channel, JSON.stringify(payload));
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// buildApp
// ─────────────────────────────────────────────────────────────────────────────

export async function buildApp(): Promise<ReturnType<typeof Fastify>> {
  // ── Fastify instance ────────────────────────────────────────────────────────
  const app = Fastify({
    logger: rootLogger,
    ajv: {
      customOptions: {
        strict: false,          // Allow additional properties in schemas
        coerceTypes: 'array',   // Coerce query-string arrays
        useDefaults: true,
      },
    },
    trustProxy: true,           // Behind Railway / nginx reverse proxy
  });

  // ── Security plugins ────────────────────────────────────────────────────────
  await app.register(helmet, {
    contentSecurityPolicy: false, // Disabled for JSON API services
  });

  await app.register(cors, {
    origin: process.env['CORS_ORIGIN']?.split(',') ?? '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  await app.register(rateLimit, {
    max: 120,          // 120 requests
    timeWindow: '1m',  // per minute per IP
    errorResponseBuilder(_request, context) {
      return {
        statusCode: 429,
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Retry after ${context.after}.`,
      };
    },
  });

  // ── JWT ─────────────────────────────────────────────────────────────────────
  await app.register(jwt, {
    secret: JWT_SECRET,
    sign: { expiresIn: '15m' },
  });

  // Decorate `fastify.authenticate` — a preHandler that verifies the Bearer token.
  // The shared `sendUnauthorized` helper (packages/config/src/auth-errors.ts) is
  // the only place that owns the 401 body — keeping it canonical avoids per-service
  // drift and stops jwtVerify()'s typed FST_JWT_* error shapes from leaking on the
  // wire. The real cause is logged via `request.log.error` inside the helper.
  app.decorate(
    'authenticate',
    async function authenticate(request: any, reply: any) {
      try {
        await request.jwtVerify();
      } catch (err) {
        return sendUnauthorized(reply, request, err);
      }
    },
  );

  // ── Prisma ──────────────────────────────────────────────────────────────────
  const prisma = new PrismaClient({
    log: LOG_LEVEL === 'debug' ? ['query', 'info', 'warn', 'error'] : ['warn', 'error'],
  });

  app.addHook('onClose', async () => {
    await prisma.$disconnect();
    rootLogger.info('index: Prisma disconnected');
  });

  // ── Redis ───────────────────────────────────────────────────────────────────
  const redis = new Redis(REDIS_URL, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: false,
  });

  redis.on('error', (err: Error) => {
    rootLogger.error({ err }, 'index: Redis connection error');
  });

  redis.on('connect', () => {
    rootLogger.info('index: Redis connected');
  });

  app.addHook('onClose', async () => {
    await redis.quit();
    rootLogger.info('index: Redis disconnected');
  });

  // ── Service layer ───────────────────────────────────────────────────────────
  const subscriptionService = new SubscriptionService(prisma, rootLogger);
  const eventBus = buildEventBus(redis);

  // ── Event subscribers ───────────────────────────────────────────────────────
  await setupEventSubscribers(eventBus, subscriptionService, rootLogger);

  // ── Routes ──────────────────────────────────────────────────────────────────
  await app.register(subscriptionRoutes, { subscriptionService, eventBus });

  // ── Stripe Checkout + Webhook routes ────────────────────────────────────────
  registerStripeRoutes(app, subscriptionService, rootLogger);

  // ── Global error handler ────────────────────────────────────────────────────
  // Converged onto the shared @nightfuel/config redactor (wraps the pure
  // buildErrorResponse — see __tests__/error-redaction.test.ts for the locked
  // shape). Contract:
  //   • The structured logger.error line inside the helper STILL captures the
  //     full error object server-side (stack, Prisma details, conn-string
  //     fragments).
  //   • On the wire we NEVER reflect error.message or error.stack on the 500
  //     branch — it returns a fixed generic body.
  //   • On the <500 branch we reflect error.message only for Fastify-generated
  //     validation errors; every other 4xx gets the generic 'Bad request'.
  // The cast reconciles this service's pino `Logger` (resolved from the
  // root-hoisted pino) with the structurally-identical one @nightfuel/config
  // was compiled against (its own nested pino copy — the monorepo dep-nesting
  // gotcha). pino's self-referential `child`/`onChild` generics make the two
  // nominally distinct across the module boundary, so we cast to the helper's
  // own expected parameter type. Runtime is unchanged — the helper only ever
  // calls logger.error(obj, msg), which rootLogger fully supports.
  registerFastifyErrorHandler(
    app,
    rootLogger as unknown as Parameters<typeof registerFastifyErrorHandler>[1],
  );

  // ── 404 handler ─────────────────────────────────────────────────────────────
  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      statusCode: 404,
      error: 'Not Found',
      message: `Route ${request.method} ${request.url} not found.`,
    });
  });

  return app;
}

// ─────────────────────────────────────────────────────────────────────────────
// Bootstrap
// ─────────────────────────────────────────────────────────────────────────────

async function bootstrap(): Promise<void> {
  let app: Awaited<ReturnType<typeof buildApp>> | undefined;

  const shutdown = async (signal: string): Promise<void> => {
    rootLogger.info({ signal }, 'index: shutdown signal received');
    if (app) {
      await app.close();
    }
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('uncaughtException', (err) => {
    rootLogger.fatal({ err }, 'index: uncaughtException – shutting down');
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    rootLogger.fatal({ reason }, 'index: unhandledRejection – shutting down');
    process.exit(1);
  });

  try {
    app = await buildApp();

    await app.listen({ port: PORT, host: '0.0.0.0' });

    rootLogger.info(
      { port: PORT, env: process.env['NODE_ENV'] ?? 'development' },
      'index: subscription-service is listening',
    );
  } catch (err) {
    rootLogger.fatal({ err }, 'index: failed to start subscription-service');
    process.exit(1);
  }
}

void bootstrap();
