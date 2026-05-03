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
  app.decorate(
    'authenticate',
    async function authenticate(request: any, reply: any) {
      try {
        await request.jwtVerify();
      } catch (err) {
        reply.status(401).send({
          statusCode: 401,
          error: 'Unauthorized',
          message: 'A valid Bearer token is required.',
        });
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
  app.setErrorHandler((error, request, reply) => {
    const statusCode = error.statusCode ?? 500;
    rootLogger.error(
      { err: error, url: request.url, method: request.method },
      'index: unhandled route error',
    );
    reply.status(statusCode).send({
      statusCode,
      error: error.name ?? 'Internal Server Error',
      message: error.message ?? 'An unexpected error occurred.',
    });
  });

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
