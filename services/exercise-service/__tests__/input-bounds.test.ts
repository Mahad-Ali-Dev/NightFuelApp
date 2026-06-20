/**
 * Wired-route input-bounds + 400-redaction CONFIRM for the exercise-service POST
 * WRITE endpoints (src/index.ts).
 *
 * Every other Node service ships an input-bounds suite that drives a representative
 * write body THROUGH THE REAL request pipeline; exercise-service had only
 * library-bounds.test.ts (a GET querystring) + inline-404-redaction.test.ts. Its
 * POST write routes — /v1/exercises (createWorkoutSchema), /v1/exercises/routines
 * (createRoutineSchema), /v1/exercises/1rm (logOneRepMaxSchema),
 * /v1/exercises/session/start (startSessionSchema),
 * /v1/exercises/session/:id/exercise/log (logSessionExerciseSchema) — were never
 * proven to reject an over-bound body through the pipeline AND to redact the 400.
 * This suite closes that gap.
 *
 * The write schemas in src/index.ts are ALREADY well-bounded (every field carries
 * .max()/.min()/positive()), so this is a CONFIRM, not a change: NO src/index.ts
 * edit is required. We pick POST /v1/exercises/1rm with logOneRepMaxSchema as the
 * representative route (the work-item's recommendation) — its body
 *   { exerciseName: z.string().min(1).max(120),
 *     weightKg:     z.number().positive().max(1000),
 *     estimated1RMKg: z.number().positive().max(1000) }
 * exercises an over-long string cap, an over-range numeric cap, and a cross-field
 * (positive) constraint, so a single route proves all three failure shapes.
 *
 * Why this suite copies the body schema + route shape VERBATIM instead of importing
 * src/ (the SAME documented constraint as library-bounds.test.ts /
 * error-redaction.test.ts / ai-quota-routine.test.ts):
 *   - src/index.ts is the service bootstrap; it constructs a PrismaClient and a
 *     RedisEventBus and calls fastify.listen() at import time, so it cannot be
 *     loaded in a unit test. So — following the sibling convention — this file
 *     copies the EXACT logOneRepMaxSchema and registers a route that mirrors
 *     src/index.ts's POST /v1/exercises/1rm (same body schema, same
 *     `logOneRepMax(userId, request.body)` call, same try/catch generic-500) onto
 *     a real Fastify app wired EXACTLY like src/index.ts's request path:
 *     `setValidatorCompiler(validatorCompiler)` + `setSerializerCompiler(
 *     serializerCompiler)` from fastify-type-provider-zod, and the SHARED
 *     `registerFastifyErrorHandler` from @nightfuel/config — so a zod body failure
 *     surfaces as a 400 through THAT handler, exactly as in prod.
 *   - `exerciseSvc.logOneRepMax` is mocked so the suite is hermetic (no DB), and a
 *     real Bearer token opens the auth gate so any 400 originates from the zod body
 *     schema, NOT from auth. This mirrors library-bounds.test.ts / community-service
 *     / meal-service input-bounds.test.ts conventions.
 *
 * If logOneRepMaxSchema in src/index.ts changes, this copy (and the assertions
 * below) must change in lockstep — that lockstep is the whole point of the
 * schema-lock.
 */
import Fastify, { FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { registerFastifyErrorHandler } from '@nightfuel/config';
import jwt from 'jsonwebtoken';
import { z } from 'zod';

const JWT_SECRET = 'test-jwt-secret-at-least-32-chars-long-000';
const USER_ID = '55555555-5555-8555-8555-555555555555';
const VALID = jwt.sign({ id: USER_ID }, JWT_SECRET, { expiresIn: '1h' });
const AUTH = { authorization: `Bearer ${VALID}` };

// The caps under test, named so each boundary case reads unambiguously against
// the schema's own `.max(...)`.
const MAX_NAME_LEN = 120;
const MAX_WEIGHT_KG = 1000;

// A representative 1RM row so the 201 reply body is a concrete, stable shape the
// "valid body parses OK" assertion can lock onto.
const ONE_RM_ROW = {
    id: '1rm-bench',
    userId: USER_ID,
    exerciseName: 'Barbell Bench Press',
    weightKg: 100,
    estimated1RMKg: 110,
};

function buildMockService() {
    return {
        // Returns a fixed row regardless of input, so the suite never touches a
        // database and the valid-body assertions are meaningful.
        logOneRepMax: jest.fn().mockResolvedValue(ONE_RM_ROW),
    };
}

type MockService = ReturnType<typeof buildMockService>;

// ── body schema copied VERBATIM from src/index.ts (cannot import) ───────────────
// weightKg / estimated1RMKg are positive and capped at 1000 kg; exerciseName is a
// bounded 1..120-char string.
const logOneRepMaxSchema = z.object({
    exerciseName: z.string().min(1).max(120),
    weightKg: z.number().positive().max(1000),
    estimated1RMKg: z.number().positive().max(1000),
});

async function buildApp(svc: MockService): Promise<FastifyInstance> {
    const app = Fastify({ logger: false });
    // Shared error handler — a zod body failure surfaces as a 400 through THIS
    // handler (the same one src/index.ts registers), exactly as in prod.
    const silentLogger = { error: () => {}, warn: () => {}, info: () => {} } as any;
    registerFastifyErrorHandler(app, silentLogger);

    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);

    // `authenticate` decorated the way src/index.ts wires it (a JWT verify with a
    // 401 on failure) so the gate is genuinely exercised and any 400 below is the
    // schema, not auth.
    app.decorate('authenticate', async (request: any, reply: any) => {
        try {
            const token = (request.headers.authorization as string | undefined)?.replace('Bearer ', '');
            if (!token) throw new Error('Missing token');
            request.user = jwt.verify(token, JWT_SECRET);
        } catch {
            return reply.code(401).send({ error: 'Unauthorized' });
        }
    });

    // Mirrors src/index.ts's POST /v1/exercises/1rm route 1:1: the verbatim body
    // schema + the identical handler body (same `logOneRepMax(userId, request.body)`
    // call, same 201, same try/catch generic-500).
    app.withTypeProvider<ZodTypeProvider>().post('/v1/exercises/1rm', {
        onRequest: [(app as any).authenticate],
        schema: { body: logOneRepMaxSchema },
    }, async (request: any, reply: any) => {
        try {
            const userId = (request.user as any).userId ?? (request.user as any).id;
            return reply.code(201).send(await svc.logOneRepMax(userId, request.body));
        } catch {
            return reply.code(500).send({ error: 'An unexpected error occurred' });
        }
    });

    await app.ready();
    return app;
}

describe('exercise-service write-body bounds (POST /v1/exercises/1rm, valid token, schema-lock)', () => {
    let app: FastifyInstance;
    let svc: MockService;

    beforeEach(async () => {
        svc = buildMockService();
        app = await buildApp(svc);
    });

    afterEach(async () => {
        await app.close();
    });

    // ── 401 sanity: a 400 below is from the schema, not auth ──────────────────
    it('no token -> 401 (proves the bounds tests pass because of a VALID token)', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/exercises/1rm',
            payload: { exerciseName: 'Bench Press', weightKg: 100, estimated1RMKg: 110 },
        });
        expect(res.statusCode).toBe(401);
        expect(svc.logOneRepMax).not.toHaveBeenCalled();
    });

    // ── (c) An inclusive-boundary valid body still parses OK (non-4xx) ────────
    describe('a valid / inclusive-boundary body reaches the service (non-4xx)', () => {
        it('a normal valid body -> 201 and reaches logOneRepMax with the body intact', async () => {
            const res = await app.inject({
                method: 'POST',
                url: '/v1/exercises/1rm',
                headers: AUTH,
                payload: { exerciseName: 'Barbell Bench Press', weightKg: 100, estimated1RMKg: 110 },
            });

            expect(res.statusCode).not.toBeGreaterThanOrEqual(400);
            expect(res.statusCode).toBe(201);
            // The body is exactly what the (mocked) service returned — the bounds
            // do not alter, drop, or reshape the payload.
            expect(res.json()).toEqual(ONE_RM_ROW);
            expect(svc.logOneRepMax).toHaveBeenCalledTimes(1);
            expect(svc.logOneRepMax).toHaveBeenCalledWith(
                USER_ID,
                { exerciseName: 'Barbell Bench Press', weightKg: 100, estimated1RMKg: 110 },
            );
        });

        it('weightKg & estimated1RMKg exactly at the 1000 boundary -> not 4xx (reaches the service)', async () => {
            const res = await app.inject({
                method: 'POST',
                url: '/v1/exercises/1rm',
                headers: AUTH,
                payload: { exerciseName: 'Deadlift', weightKg: MAX_WEIGHT_KG, estimated1RMKg: MAX_WEIGHT_KG },
            });

            expect(res.statusCode).not.toBe(400);
            expect(res.statusCode).toBe(201);
            expect(svc.logOneRepMax).toHaveBeenCalledTimes(1);
            expect(svc.logOneRepMax).toHaveBeenCalledWith(
                USER_ID,
                { exerciseName: 'Deadlift', weightKg: MAX_WEIGHT_KG, estimated1RMKg: MAX_WEIGHT_KG },
            );
        });

        it('exerciseName exactly at the 120-char boundary -> not 4xx (reaches the service)', async () => {
            const name = 'a'.repeat(MAX_NAME_LEN);
            const res = await app.inject({
                method: 'POST',
                url: '/v1/exercises/1rm',
                headers: AUTH,
                payload: { exerciseName: name, weightKg: 100, estimated1RMKg: 110 },
            });

            expect(res.statusCode).not.toBe(400);
            expect(res.statusCode).toBe(201);
            expect(svc.logOneRepMax).toHaveBeenCalledTimes(1);
            expect(svc.logOneRepMax).toHaveBeenCalledWith(
                USER_ID,
                expect.objectContaining({ exerciseName: name }),
            );
        });
    });

    // ── (a) An over-bound / cross-field-invalid body is rejected 400 ──────────
    describe('an over-bound / invalid write body yields 400 and the service is NOT called', () => {
        // One case per field-level bound — each must independently trip the schema.
        const cases: Array<[string, Record<string, unknown>]> = [
            ['weightKg above the 1000 cap (1001)', { exerciseName: 'Bench Press', weightKg: 1001, estimated1RMKg: 110 }],
            ['estimated1RMKg above the 1000 cap (1001)', { exerciseName: 'Bench Press', weightKg: 100, estimated1RMKg: 1001 }],
            ['exerciseName over the 120-char cap (121)', { exerciseName: 'a'.repeat(MAX_NAME_LEN + 1), weightKg: 100, estimated1RMKg: 110 }],
            ['exerciseName empty (below min 1)', { exerciseName: '', weightKg: 100, estimated1RMKg: 110 }],
            ['weightKg non-positive (0 fails positive())', { exerciseName: 'Bench Press', weightKg: 0, estimated1RMKg: 110 }],
            ['weightKg negative (fails positive())', { exerciseName: 'Bench Press', weightKg: -5, estimated1RMKg: 110 }],
            ['weightKg missing (required field absent)', { exerciseName: 'Bench Press', estimated1RMKg: 110 }],
            ['weightKg wrong type (string, not number)', { exerciseName: 'Bench Press', weightKg: 'heavy', estimated1RMKg: 110 }],
        ];

        it.each(cases)('%s -> 400 and logOneRepMax NOT called', async (_label, payload) => {
            const res = await app.inject({
                method: 'POST',
                url: '/v1/exercises/1rm',
                headers: AUTH,
                payload,
            });

            expect(res.statusCode).toBe(400);
            expect(svc.logOneRepMax).not.toHaveBeenCalled();
        });

        it('a far-over-bound weightKg (1e9) is still rejected 400 (the abuse vector this closes)', async () => {
            const res = await app.inject({
                method: 'POST',
                url: '/v1/exercises/1rm',
                headers: AUTH,
                payload: { exerciseName: 'Bench Press', weightKg: 1_000_000_000, estimated1RMKg: 110 },
            });

            expect(res.statusCode).toBe(400);
            expect(svc.logOneRepMax).not.toHaveBeenCalled();
        });

        it('a far-over-length exerciseName (multi-KB) is still rejected 400 (DoS / log-bloat vector)', async () => {
            const res = await app.inject({
                method: 'POST',
                url: '/v1/exercises/1rm',
                headers: AUTH,
                payload: { exerciseName: 'a'.repeat(50_000), weightKg: 100, estimated1RMKg: 110 },
            });

            expect(res.statusCode).toBe(400);
            expect(svc.logOneRepMax).not.toHaveBeenCalled();
        });
    });

    // ── (b) The 400 body is REDACTED via the shared handler ───────────────────
    // The thrown values below embed the same attack signals the shared 4xx/5xx
    // redactor strips elsewhere (see error-redaction.test.ts): even though a zod
    // validation 400 carries a user-facing message, the SERIALIZED 400 must never
    // surface a 'stack', a 'prisma' internal, or a filesystem-path-like fragment.
    describe('the 400 body leaks no internal detail (redaction reuse of error-redaction.test.ts style)', () => {
        // An exerciseName that is itself a leaky-looking string AND over the cap:
        // the field is rejected for length, and we assert the rejection body never
        // echoes the dangerous substrings back. Validates that an attacker can't use
        // the validation-error message as an exfiltration / reflection channel.
        const LEAKY_OVERLONG_NAME = `Prisma raw stack frame at /etc/passwd localhost:5432 ${'x'.repeat(MAX_NAME_LEN)}`;

        it('the 400 carries statusCode:400 and a string error (shared-handler shape)', async () => {
            const res = await app.inject({
                method: 'POST',
                url: '/v1/exercises/1rm',
                headers: AUTH,
                payload: { exerciseName: 'Bench Press', weightKg: 1001, estimated1RMKg: 110 },
            });

            expect(res.statusCode).toBe(400);
            const body = res.json();
            expect(body.statusCode).toBe(400);
            expect(typeof body.error).toBe('string');
            expect(svc.logOneRepMax).not.toHaveBeenCalled();
        });

        it('400 body does NOT contain "stack" (negative #1)', async () => {
            const res = await app.inject({
                method: 'POST',
                url: '/v1/exercises/1rm',
                headers: AUTH,
                payload: { exerciseName: LEAKY_OVERLONG_NAME, weightKg: 1001, estimated1RMKg: 110 },
            });
            expect(res.statusCode).toBe(400);
            expect(res.body).not.toContain('stack');
        });

        it('400 body does NOT contain "prisma"/"Prisma" (negative #2 — case-insensitive)', async () => {
            const res = await app.inject({
                method: 'POST',
                url: '/v1/exercises/1rm',
                headers: AUTH,
                payload: { exerciseName: LEAKY_OVERLONG_NAME, weightKg: 1001, estimated1RMKg: 110 },
            });
            expect(res.statusCode).toBe(400);
            expect(res.body.toLowerCase()).not.toContain('prisma');
        });

        it('400 body does NOT contain filesystem-path-like internals (negative #3)', async () => {
            const res = await app.inject({
                method: 'POST',
                url: '/v1/exercises/1rm',
                headers: AUTH,
                payload: { exerciseName: LEAKY_OVERLONG_NAME, weightKg: 1001, estimated1RMKg: 110 },
            });
            expect(res.statusCode).toBe(400);
            // Stack-frame path fragments, absolute fs paths, and DB conn hints — the
            // exact negative-match list reused from error-redaction.test.ts.
            expect(res.body).not.toContain('at /');
            expect(res.body).not.toContain('/etc/passwd');
            expect(res.body).not.toContain('/app/src');
            expect(res.body).not.toContain('localhost');
            expect(res.body).not.toContain('5432');
        });
    });
});
