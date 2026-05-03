
import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { registerSchema, loginSchema, refreshTokenSchema } from './schemas';
import { AuthService } from './auth.service';

export const authRoutes: FastifyPluginAsync<{ authService: AuthService }> = async (fastify, opts) => {
    const service = opts.authService;

    fastify.withTypeProvider<ZodTypeProvider>().post(
        '/register',
        {
            schema: {
                body: registerSchema,
            },
        },
        async (request, reply) => {
            try {
                const result = await service.register(request.body);
                reply.code(201).send(result);
            } catch (err: any) {
                request.log.error(err);
                reply.code(400).send({ error: err.message });
            }
        }
    );

    fastify.withTypeProvider<ZodTypeProvider>().post(
        '/login',
        {
            schema: {
                body: loginSchema,
            },
        },
        async (request, reply) => {
            try {
                const result = await service.login(request.body);
                reply.send(result);
            } catch (err: any) {
                request.log.error(err);
                reply.code(401).send({ error: err.message });
            }
        }
    );

    fastify.withTypeProvider<ZodTypeProvider>().post(
        '/refresh',
        {
            schema: {
                body: refreshTokenSchema,
            },
        },
        async (request, reply) => {
            try {
                const result = await service.refreshToken(request.body);
                reply.send(result);
            } catch (err: any) {
                request.log.error(err);
                reply.code(401).send({ error: err.message });
            }
        }
    );

    fastify.withTypeProvider<ZodTypeProvider>().post(
        '/logout',
        {
            onRequest: [(fastify as any).authenticate],
            schema: {
                body: refreshTokenSchema,
            },
        },
        async (request, reply) => {
            try {
                await service.logout(request.body.refreshToken);
                reply.code(204).send();
            } catch (err: any) {
                request.log.error(err);
                reply.code(400).send({ error: err.message });
            }
        }
    );

    fastify.withTypeProvider<ZodTypeProvider>().get(
        '/me',
        {
            onRequest: [(fastify as any).authenticate],
        },
        async (request, reply) => {
            // @ts-ignore
            const userId = request.user.userId;
            const user = await service.getUserProfile(userId);
            if (!user) {
                reply.code(404).send({ error: 'User not found' });
                return;
            }
            // Exclude password hash
            const { passwordHash, ...profile } = user;
            return profile;
        }
    );
};
