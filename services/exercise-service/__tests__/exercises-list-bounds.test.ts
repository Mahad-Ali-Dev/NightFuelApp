/**
 * Schema-lock regression for the GET /v1/exercises `limit` cap (src/index.ts).
 *
 *   limit  z.coerce.number().int().min(1).max(500).default(20)
 *
 * Sprint F19 production fix: this route capped `limit` at 100, but the mobile
 * activity heatmap calls getRecent(200) -> GET /v1/exercises?limit=200, so the
 * server rejected it with a 400 on every load (while GET /v1/exercises/library —
 * the same ExerciseDB-backed data — accepts up to 500). The cap is now 500, in
 * lockstep with the library route. These tests lock the 200 case (the exact
 * value the client sends) plus the 500 boundary so a future edit can't silently
 * lower the cap and re-break the heatmap.
 *
 * Same harness convention as library-bounds.test.ts: src/index.ts constructs a
 * PrismaClient + RedisEventBus and calls listen() at import time, so it cannot be
 * loaded in a unit test — this copies the querystring schema + route shape
 * VERBATIM onto a real Fastify app with the REAL validatorCompiler and shared
 * registerFastifyErrorHandler, mocks exerciseSvc.listWorkouts, and opens the auth
 * gate with a real Bearer token so any 400 originates from the schema, not auth.
 */
import Fastify, { FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { registerFastifyErrorHandler } from '@nightfuel/config';
import jwt from 'jsonwebtoken';
import { z } from 'zod';

const JWT_SECRET = 'test-jwt-secret-at-least-32-chars-long-000';
const USER_ID = '44444444-4444-4444-8444-444444444444';
const VALID = jwt.sign({ id: USER_ID }, JWT_SECRET, { expiresIn: '1h' });
const AUTH = { authorization: `Bearer ${VALID}` };

const WORKOUT_ROW = { id: 'w1', name: 'Push Day', createdAt: new Date().toISOString() };

function buildMockService() {
    return { listWorkouts: jest.fn().mockResolvedValue([WORKOUT_ROW]) };
}
type MockService = ReturnType<typeof buildMockService>;

// querystring schema copied VERBATIM from src/index.ts GET /v1/exercises — if that
// changes, this copy + the assertions must change in lockstep (that is the lock).
const listQuerystringSchema = z.object({
    limit: z.coerce.number().int().min(1).max(500).default(20),
});

async function buildApp(svc: MockService): Promise<FastifyInstance> {
    const app = Fastify({ logger: false });
    const silentLogger = { error: () => {}, warn: () => {}, info: () => {} } as any;
    registerFastifyErrorHandler(app, silentLogger);
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);

    app.decorate('authenticate', async (request: any, reply: any) => {
        try {
            const token = (request.headers.authorization as string | undefined)?.replace('Bearer ', '');
            if (!token) throw new Error('Missing token');
            request.user = jwt.verify(token, JWT_SECRET);
        } catch {
            return reply.code(401).send({ error: 'Unauthorized' });
        }
    });

    // Mirrors src/index.ts GET /v1/exercises 1:1 (same schema, same
    // listWorkouts(userId, limit) call, same try/catch generic-500).
    app.withTypeProvider<ZodTypeProvider>().get('/v1/exercises', {
        onRequest: [(app as any).authenticate],
        schema: { querystring: listQuerystringSchema },
    }, async (request: any, reply: any) => {
        try {
            const userId = (request.user as any).userId ?? (request.user as any).id;
            const { limit } = request.query;
            return reply.send(await svc.listWorkouts(userId, limit));
        } catch {
            return reply.code(500).send({ error: 'An unexpected error occurred' });
        }
    });

    await app.ready();
    return app;
}

describe('exercise-service GET /v1/exercises limit bound (int, 1..500, default 20)', () => {
    let app: FastifyInstance;
    let svc: MockService;

    beforeEach(async () => {
        svc = buildMockService();
        app = await buildApp(svc);
    });
    afterEach(async () => {
        await app.close();
    });

    it('no token -> 401 (proves the bounds tests pass because of a VALID token)', async () => {
        const res = await app.inject({ method: 'GET', url: '/v1/exercises?limit=200' });
        expect(res.statusCode).toBe(401);
        expect(svc.listWorkouts).not.toHaveBeenCalled();
    });

    // ── THE F19 REGRESSION: limit=200 (what the heatmap sends) must NOT 400 ──────
    it('limit=200 (the heatmap getRecent(200) value) -> 200, reaches listWorkouts with 200', async () => {
        const res = await app.inject({ method: 'GET', url: '/v1/exercises?limit=200', headers: AUTH });

        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual([WORKOUT_ROW]);
        expect(svc.listWorkouts).toHaveBeenCalledTimes(1);
        expect(svc.listWorkouts).toHaveBeenCalledWith(USER_ID, 200);
    });

    it('limit=500 (at the boundary) -> not 400 (reaches listWorkouts with 500)', async () => {
        const res = await app.inject({ method: 'GET', url: '/v1/exercises?limit=500', headers: AUTH });

        expect(res.statusCode).not.toBe(400);
        expect(svc.listWorkouts).toHaveBeenCalledWith(USER_ID, 500);
    });

    it('limit omitted -> default 20 reaches listWorkouts', async () => {
        const res = await app.inject({ method: 'GET', url: '/v1/exercises', headers: AUTH });

        expect(res.statusCode).toBe(200);
        expect(svc.listWorkouts).toHaveBeenCalledWith(USER_ID, 20);
    });

    it('limit=501 (above the new cap) -> 400 and listWorkouts NOT called', async () => {
        const res = await app.inject({ method: 'GET', url: '/v1/exercises?limit=501', headers: AUTH });

        expect(res.statusCode).toBe(400);
        expect(svc.listWorkouts).not.toHaveBeenCalled();
    });

    it('limit=0 (below min) -> 400 and listWorkouts NOT called', async () => {
        const res = await app.inject({ method: 'GET', url: '/v1/exercises?limit=0', headers: AUTH });

        expect(res.statusCode).toBe(400);
        expect(svc.listWorkouts).not.toHaveBeenCalled();
    });
});
