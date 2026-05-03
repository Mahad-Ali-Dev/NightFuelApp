import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { DecisionEngine, DecisionInputSchema } from './engine';

export async function decisionRoutes(fastify: FastifyInstance) {
    const engine = new DecisionEngine();
    const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();

    typedFastify.post('/compute-params', {
        schema: {
            body: DecisionInputSchema,
        },
    }, async (request, reply) => {
        const output = engine.computeParams(request.body);
        return output;
    });
}
