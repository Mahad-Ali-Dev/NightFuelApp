import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { PrismaClient } from './generated/prisma';
import { createLogger, loadConfig, connectWithRetry, registerGlobalProcessHandlers, registerFastifyErrorHandler } from '@nightfuel/config';
import { z } from 'zod';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyWebsocket from '@fastify/websocket';
import { ChatService } from './chat.service';
import routes from './routes';

const envSchema = z.object({
    CHAT_PORT: z.string().default('3014'),
    JWT_SECRET: z.string(),
});

const config = loadConfig(envSchema);
const logger = createLogger('chat-service');
const prisma = new PrismaClient();

const fastify = Fastify({ logger: false });
registerGlobalProcessHandlers(logger);
registerFastifyErrorHandler(fastify, logger);

fastify.setValidatorCompiler(validatorCompiler);
fastify.setSerializerCompiler(serializerCompiler);
fastify.withTypeProvider<ZodTypeProvider>();

fastify.register(fastifyHelmet);
fastify.register(fastifyCors, { origin: true });
// @fastify/websocket types conflict with ZodTypeProvider — cast to any
fastify.register(fastifyWebsocket as any);

fastify.get('/health', async () => {
    return { status: 'ok', service: 'chat-service' };
});

const chatService = new ChatService(prisma);
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
