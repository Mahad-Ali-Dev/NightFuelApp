
import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { createShiftSchema, getShiftsRouteQuerySchema, updateShiftSchema } from './schemas';
import { ShiftService } from './shift.service';
import { z } from 'zod';

export const shiftRoutes = async (fastify: FastifyInstance, opts: { shiftService: ShiftService }) => {
    const service = opts.shiftService;

    fastify.withTypeProvider<ZodTypeProvider>().post(
        '/',
        {
            onRequest: [(fastify as any).authenticate],
            schema: {
                body: createShiftSchema,
            },
        },
        async (request, reply) => {
            try {
                // @ts-ignore
                const userId = request.user.userId;
                const result = await service.createShift(request.body, userId);
                reply.code(201).send(result);
            } catch (err: any) {
                // Redaction: createShift only ever surfaces Prisma/DB errors
                // here (the body is already Zod-validated upstream), so the raw
                // err.message must not reach the client. Logged server-side.
                request.log.error(err);
                reply.code(500).send({ error: 'An unexpected error occurred' });
            }
        }
    );

    fastify.withTypeProvider<ZodTypeProvider>().get(
        '/',
        {
            onRequest: [(fastify as any).authenticate],
            schema: {
                querystring: getShiftsRouteQuerySchema,
            },
        },
        async (request, reply) => {
            try {
                // @ts-ignore
                const userId = request.user.userId;
                const result = await service.getShifts(request.query, userId);
                reply.send(result);
            } catch (err: any) {
                // Redaction: structured server-side log only; generic client body.
                request.log.error(err);
                reply.code(500).send({ error: 'An unexpected error occurred' });
            }
        }
    );

    fastify.withTypeProvider<ZodTypeProvider>().get(
        '/current',
        {
            onRequest: [(fastify as any).authenticate],
        },
        async (request, reply) => {
            try {
                // @ts-ignore
                const userId = request.user.userId;
                const result = await service.getCurrentShift(userId);
                if (!result) {
                    reply.code(204).send(); // Or send an empty object, but 204 or null is fine. Let's send null.
                    return;
                }
                reply.send(result);
            } catch (err: any) {
                request.log.error(err);
                reply.code(500).send({ error: 'An unexpected error occurred' });
            }
        }
    );

    fastify.withTypeProvider<ZodTypeProvider>().get(
        '/:id',
        {
            onRequest: [(fastify as any).authenticate],
            schema: {
                params: z.object({ id: z.string().uuid() }),
            },
        },
        async (request, reply) => {
            try {
                // @ts-ignore
                const userId = request.user.userId;
                const result = await service.getShiftById(request.params.id, userId);
                if (!result) {
                    reply.code(404).send({ error: 'Shift not found' });
                    return;
                }
                reply.send(result);
            } catch (err: any) {
                request.log.error(err);
                reply.code(500).send({ error: 'An unexpected error occurred' });
            }
        }
    );

    fastify.withTypeProvider<ZodTypeProvider>().put(
        '/:id',
        {
            onRequest: [(fastify as any).authenticate],
            schema: {
                params: z.object({ id: z.string().uuid() }),
                body: updateShiftSchema,
            },
        },
        async (request, reply) => {
            try {
                // @ts-ignore
                const userId = request.user.userId;
                const result = await service.updateShift(request.params.id, userId, request.body);
                reply.send(result);
            } catch (err: any) {
                request.log.error(err);
                // Preserve the one safe business error (404); redact everything else.
                if (typeof err?.message === 'string' && err.message.includes('not found')) {
                    return reply.code(404).send({ error: 'Shift not found' });
                }
                reply.code(500).send({ error: 'An unexpected error occurred' });
            }
        }
    );

    fastify.withTypeProvider<ZodTypeProvider>().delete(
        '/:id',
        {
            onRequest: [(fastify as any).authenticate],
            schema: {
                params: z.object({ id: z.string().uuid() }),
            },
        },
        async (request, reply) => {
            try {
                // @ts-ignore
                const userId = request.user.userId;
                await service.deleteShift(request.params.id, userId);
                reply.code(204).send();
            } catch (err: any) {
                request.log.error(err);
                reply.code(500).send({ error: 'An unexpected error occurred' });
            }
        }
    );
};
