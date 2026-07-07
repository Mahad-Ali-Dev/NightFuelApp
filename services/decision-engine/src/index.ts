import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { createLogger, loadConfig, registerGlobalProcessHandlers, registerFastifyErrorHandler } from '@nightfuel/config';
import { z } from 'zod';
import { decisionRoutes } from './routes';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyRateLimit from '@fastify/rate-limit';

const envSchema = z.object({
    DECISION_ENGINE_PORT: z.string().default('3016'),
    // Enforce a >=32 char shared secret so a weak/short JWT_SECRET fails CLOSED
    // at boot (via loadConfig → process.exit) rather than booting silently on a
    // forgeable secret — mirrors auth-service (the token issuer) and the other
    // services in this group.
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    // Comma-separated list of allowed web origins. Optional: when unset we fail
    // CLOSED with an empty allowlist (no cross-origin browser access) rather than
    // reflecting the request origin. Never use '*' — that plus credentials is
    // forbidden by the browser and reflective origins defeat the same-origin policy.
    CORS_ORIGIN: z.string().optional(),
});

const config = loadConfig(envSchema);
const logger = createLogger('decision-engine');

const fastify = Fastify({ logger: false });
registerGlobalProcessHandlers(logger);
registerFastifyErrorHandler(fastify, logger);

fastify.setValidatorCompiler(validatorCompiler);
fastify.setSerializerCompiler(serializerCompiler);
fastify.withTypeProvider<ZodTypeProvider>();

fastify.register(fastifyHelmet);

fastify.register(fastifyRateLimit, {
    max: 100,
    timeWindow: '1 minute'
});

// Explicit allowlist from CORS_ORIGIN (comma-separated). When unset the list is
// empty, so the browser is told no cross-origin is allowed (fail CLOSED). Never
// '*' and never reflect the request origin.
const corsOrigins = config.CORS_ORIGIN
    ? config.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean)
    : [];

fastify.register(fastifyCors, {
    origin: corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
});

fastify.get('/health', async () => {
    return { status: 'ok', service: 'decision-engine' };
});

fastify.register(async (instance) => {
    await decisionRoutes(instance);
}, { prefix: '/v1/decision' });

const start = async () => {
    try {
        await fastify.listen({ port: parseInt(config.DECISION_ENGINE_PORT), host: '0.0.0.0' });
        logger.info(`Decision Engine running on port ${config.DECISION_ENGINE_PORT}`);
    } catch (err) {
        logger.error(err);
        process.exit(1);
    }
};

const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutdown signal received');
    try {
        await fastify.close();
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
