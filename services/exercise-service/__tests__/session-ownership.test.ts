/**
 * IDOR regression suite — exercise-service workout-SESSION ownership (src/index.ts
 * + src/exercise.service.ts).
 *
 * Before this fix, POST /v1/exercises/session/:id/exercise/log and
 * POST /v1/exercises/session/:id/end trusted ONLY the path :id and never checked
 * that the session belonged to the authenticated user, so user A could write a set
 * into — or end — user B's active workout session (a classic IDOR).
 *
 * The fix threads the authenticated userId into both service methods and scopes the
 * mutation to the caller's own row, mirroring the getWorkout/deleteWorkout
 * `{ id, userId }` filter already used elsewhere in this service:
 *   - endSession:        updateMany({ where: { id, userId } }) → null on count 0.
 *   - logSessionExercise: findFirst({ where: { id, userId } }) first → null when it
 *     isn't the caller's. Both routes answer 404 'Session not found' on null.
 *
 * Why this suite mirrors the route shape instead of importing src/ (the SAME
 * documented constraint as input-bounds.test.ts / inline-404-redaction.test.ts):
 *   - src/index.ts is the service bootstrap; it constructs a PrismaClient and a
 *     RedisEventBus and calls fastify.listen() at import time, so it cannot be
 *     loaded in a unit test. So — following the sibling convention — this file
 *     registers routes that mirror src/index.ts's two session-mutating routes 1:1
 *     (same params schema, same `logSessionExercise(id, userId, ...)` /
 *     `endSession(id, userId)` calls, same `if (!x) 404 'Session not found'`, same
 *     try/catch generic-500) onto a real Fastify app wired EXACTLY like
 *     src/index.ts's request path.
 *   - The service is mocked with an ownership-aware stub that reproduces the REAL
 *     service contract: it returns the mutated row ONLY when the session's owner
 *     matches the caller's userId, and null otherwise — exactly what the
 *     `{ id, userId }`-scoped Prisma queries do. A real Bearer token opens the auth
 *     gate so the 404 originates from the ownership check, NOT from auth.
 *
 * If the route handlers / service signatures in src change, this mirror (and the
 * assertions below) must change in lockstep — that lockstep is the whole point.
 */
import Fastify, { FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { registerFastifyErrorHandler } from '@nightfuel/config';
import jwt from 'jsonwebtoken';
import { z } from 'zod';

const JWT_SECRET = 'test-jwt-secret-at-least-32-chars-long-000';

// Owner of the session under test, and a different (attacker) user.
const OWNER_ID = '11111111-1111-8111-8111-111111111111';
const ATTACKER_ID = '22222222-2222-8222-8222-222222222222';

const OWNER_TOKEN = jwt.sign({ id: OWNER_ID }, JWT_SECRET, { expiresIn: '1h' });
const ATTACKER_TOKEN = jwt.sign({ id: ATTACKER_ID }, JWT_SECRET, { expiresIn: '1h' });
const OWNER_AUTH = { authorization: `Bearer ${OWNER_TOKEN}` };
const ATTACKER_AUTH = { authorization: `Bearer ${ATTACKER_TOKEN}` };

// A valid UUID for the path :id — the session that OWNER_ID owns.
const SESSION_ID = '33333333-3333-8333-8333-333333333333';

// Representative rows the ownership-aware stub returns on success — stable, concrete
// shapes the 201/200 assertions can lock onto.
const LOG_ROW = {
    id: 'log-1',
    sessionId: SESSION_ID,
    exerciseName: 'Barbell Bench Press',
    sets: 3,
    reps: 10,
    weightKg: 80,
    durationSecs: 0,
};
const ENDED_SESSION_ROW = {
    id: SESSION_ID,
    userId: OWNER_ID,
    status: 'completed',
};

// ── schema copied VERBATIM from src/index.ts (cannot import) ────────────────────
const logSessionExerciseSchema = z.object({
    exerciseName: z.string().min(1).max(120),
    sets: z.number().int().min(0).max(100).default(0),
    reps: z.number().int().min(0).max(1000).default(0),
    weightKg: z.number().min(0).max(1000).default(0),
    durationSecs: z.number().int().min(0).max(86400).default(0),
});

/**
 * Ownership-aware service stub: reproduces the REAL `{ id, userId }`-scoped service
 * contract. Both methods return their success row ONLY when the caller's userId is
 * the session owner; otherwise they return null (the IDOR guard), exactly like the
 * Prisma findFirst/updateMany filters in src/exercise.service.ts.
 */
function buildMockService() {
    return {
        logSessionExercise: jest.fn(
            async (sessionId: string, userId: string) =>
                sessionId === SESSION_ID && userId === OWNER_ID ? LOG_ROW : null,
        ),
        endSession: jest.fn(
            async (sessionId: string, userId: string) =>
                sessionId === SESSION_ID && userId === OWNER_ID ? ENDED_SESSION_ROW : null,
        ),
    };
}

type MockService = ReturnType<typeof buildMockService>;

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

    // Mirrors src/index.ts POST /v1/exercises/session/:id/exercise/log 1:1.
    app.withTypeProvider<ZodTypeProvider>().post('/v1/exercises/session/:id/exercise/log', {
        onRequest: [(app as any).authenticate],
        schema: {
            params: z.object({ id: z.string().uuid() }),
            body: logSessionExerciseSchema,
        },
    }, async (request: any, reply: any) => {
        try {
            const userId = (request.user as any).userId ?? (request.user as any).id;
            const { id } = request.params;
            const log = await svc.logSessionExercise(
                id,
                userId,
                request.body.exerciseName,
                request.body.sets,
                request.body.reps,
                request.body.weightKg,
                request.body.durationSecs,
            );
            if (!log) return reply.code(404).send({ error: 'Session not found' });
            return reply.code(201).send(log);
        } catch {
            return reply.code(500).send({ error: 'An unexpected error occurred' });
        }
    });

    // Mirrors src/index.ts POST /v1/exercises/session/:id/end 1:1.
    app.withTypeProvider<ZodTypeProvider>().post('/v1/exercises/session/:id/end', {
        onRequest: [(app as any).authenticate],
        schema: { params: z.object({ id: z.string().uuid() }) },
    }, async (request: any, reply: any) => {
        try {
            const userId = (request.user as any).userId ?? (request.user as any).id;
            const { id } = request.params;
            const session = await svc.endSession(id, userId);
            if (!session) return reply.code(404).send({ error: 'Session not found' });
            return reply.send(session);
        } catch {
            return reply.code(500).send({ error: 'An unexpected error occurred' });
        }
    });

    await app.ready();
    return app;
}

describe('exercise-service session ownership (IDOR guard) — log set', () => {
    let app: FastifyInstance;
    let svc: MockService;

    beforeEach(async () => {
        svc = buildMockService();
        app = await buildApp(svc);
    });

    afterEach(async () => {
        await app.close();
    });

    const VALID_BODY = { exerciseName: 'Barbell Bench Press', sets: 3, reps: 10, weightKg: 80 };

    it('no token -> 401 (proves later results turn on ownership, not a missing gate)', async () => {
        const res = await app.inject({
            method: 'POST',
            url: `/v1/exercises/session/${SESSION_ID}/exercise/log`,
            payload: VALID_BODY,
        });
        expect(res.statusCode).toBe(401);
        expect(svc.logSessionExercise).not.toHaveBeenCalled();
    });

    it('OWNER -> 201 and the set is written to their own session', async () => {
        const res = await app.inject({
            method: 'POST',
            url: `/v1/exercises/session/${SESSION_ID}/exercise/log`,
            headers: OWNER_AUTH,
            payload: VALID_BODY,
        });
        expect(res.statusCode).toBe(201);
        expect(res.json()).toEqual(LOG_ROW);
        // The authenticated userId is threaded into the service as the 2nd arg.
        expect(svc.logSessionExercise).toHaveBeenCalledTimes(1);
        expect(svc.logSessionExercise.mock.calls[0][0]).toBe(SESSION_ID);
        expect(svc.logSessionExercise.mock.calls[0][1]).toBe(OWNER_ID);
    });

    it('NON-OWNER -> 404 "Session not found" (cannot write into another user\'s session)', async () => {
        const res = await app.inject({
            method: 'POST',
            url: `/v1/exercises/session/${SESSION_ID}/exercise/log`,
            headers: ATTACKER_AUTH,
            payload: VALID_BODY,
        });
        expect(res.statusCode).toBe(404);
        expect(res.json()).toEqual({ error: 'Session not found' });
        // The attacker's id was passed through, and the ownership-scoped service
        // returned null — so NO write occurred against the owner's session.
        expect(svc.logSessionExercise).toHaveBeenCalledTimes(1);
        expect(svc.logSessionExercise.mock.calls[0][1]).toBe(ATTACKER_ID);
    });
});

describe('exercise-service session ownership (IDOR guard) — end session', () => {
    let app: FastifyInstance;
    let svc: MockService;

    beforeEach(async () => {
        svc = buildMockService();
        app = await buildApp(svc);
    });

    afterEach(async () => {
        await app.close();
    });

    it('no token -> 401 (proves later results turn on ownership, not a missing gate)', async () => {
        const res = await app.inject({
            method: 'POST',
            url: `/v1/exercises/session/${SESSION_ID}/end`,
        });
        expect(res.statusCode).toBe(401);
        expect(svc.endSession).not.toHaveBeenCalled();
    });

    it('OWNER -> 200 and their own session is ended', async () => {
        const res = await app.inject({
            method: 'POST',
            url: `/v1/exercises/session/${SESSION_ID}/end`,
            headers: OWNER_AUTH,
        });
        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual(ENDED_SESSION_ROW);
        expect(svc.endSession).toHaveBeenCalledTimes(1);
        expect(svc.endSession.mock.calls[0][0]).toBe(SESSION_ID);
        expect(svc.endSession.mock.calls[0][1]).toBe(OWNER_ID);
    });

    it('NON-OWNER -> 404 "Session not found" (cannot end another user\'s session)', async () => {
        const res = await app.inject({
            method: 'POST',
            url: `/v1/exercises/session/${SESSION_ID}/end`,
            headers: ATTACKER_AUTH,
        });
        expect(res.statusCode).toBe(404);
        expect(res.json()).toEqual({ error: 'Session not found' });
        expect(svc.endSession).toHaveBeenCalledTimes(1);
        expect(svc.endSession.mock.calls[0][1]).toBe(ATTACKER_ID);
    });
});
