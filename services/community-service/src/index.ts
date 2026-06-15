import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { PrismaClient } from './generated/prisma';
import { createLogger, loadConfig, connectWithRetry, registerGlobalProcessHandlers, registerFastifyErrorHandler } from '@nightfuel/config';
import { z } from 'zod';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import { CommunityService } from './community.service';
import { AuthorResolver } from './author-resolver';
import routes from './routes';

const envSchema = z.object({
    COMMUNITY_PORT: z.string().default('3013'),
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    USER_SERVICE_URL: z.string().default('http://user-service:3009'),
});

const config = loadConfig(envSchema);
const logger = createLogger('community-service');
const prisma = new PrismaClient();

const fastify = Fastify({ logger: false });
registerGlobalProcessHandlers(logger);
registerFastifyErrorHandler(fastify, logger);

fastify.setValidatorCompiler(validatorCompiler);
fastify.setSerializerCompiler(serializerCompiler);
fastify.withTypeProvider<ZodTypeProvider>();

fastify.register(fastifyHelmet);
fastify.register(fastifyCors, { origin: true });

fastify.get('/health', async () => {
    return { status: 'ok', service: 'community-service' };
});

const authorResolver = new AuthorResolver(config.JWT_SECRET, config.USER_SERVICE_URL);
const communityService = new CommunityService(prisma, authorResolver);
fastify.register(routes, { communityService, jwtSecret: config.JWT_SECRET });


const start = async () => {
    try {
        await connectWithRetry(prisma, logger);
        logger.info('Connected to Database');

        await fastify.listen({ port: parseInt(config.COMMUNITY_PORT), host: '0.0.0.0' });
        logger.info(`Community Service running on port ${config.COMMUNITY_PORT}`);
    } catch (err) {
        logger.error(err);
        process.exit(1);
    }
};

const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutdown signal received');
    try {
        await fastify.close();
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
