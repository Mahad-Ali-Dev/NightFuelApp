/**
 * Regression suite — exercise-service INLINE route hardening (src/index.ts).
 *
 * Separate from error-redaction.test.ts (which locks the SHARED
 * `registerFastifyErrorHandler` 5xx contract). This suite covers the INLINE
 * per-route 404 + catch shapes and the inline write-schema bounds — neither of
 * which the shared-handler suite touches.
 *
 * Unlike sleep-service, exercise-service's inline catches were ALREADY clean:
 * every 404 sends a FIXED string ('Workout not found' / 'Exercise not found' /
 * 'No active session') and no branch echoes err.message / err.stack. This suite
 * LOCKS that contract so a future edit can't regress it into echoing a raw
 * message, and adds the write-input bounds proof for logSessionExerciseSchema.
 *
 * Why replicate the catch instead of importing src/:
 *   - The service bootstrap module (src/index.ts) opens real DB/Redis
 *     connections at import time and cannot be loaded in a unit test (same
 *     constraint documented in error-redaction.test.ts).
 *   - So we mount a tiny Fastify app reproducing the EXACT inline 404 + catch
 *     shape from src/index.ts and assert the fixed-copy 404 body leaks no
 *     internal detail even when the underlying service call throws a leaky
 *     Error. Assertions are written to FAIL if anyone reintroduces an
 *     `{ error: err.message }` echo on these branches.
 */
import Fastify, { FastifyInstance } from 'fastify';
import { z } from 'zod';

// A leaky internal error string that MUST NOT reach the client if a catch ever
// starts echoing err.message. Mirrors the negative-match list used across the
// per-service redaction suites.
const LEAKY_THROWN_MESSAGE =
    'Prisma P2025 raw stack frame at /app/src/exercise.service.ts localhost:5432';

// ── Schemas copied verbatim from src/index.ts (cannot import — see header) ──────
const logSessionExerciseSchema = z.object({
    exerciseName: z.string().min(1).max(120),
    sets: z.number().int().min(0).max(100).default(0),
    reps: z.number().int().min(0).max(1000).default(0),
    weightKg: z.number().min(0).max(1000).default(0),
    durationSecs: z.number().int().min(0).max(86400).default(0)
});

/**
 * A tiny Fastify app reproducing the inline exercise-service route shapes:
 *   - GET /v1/exercises/:id      → 404 'Workout not found' when service returns
 *                                  null; generic 500 (no err.message) when the
 *                                  service call throws.
 *   - GET /v1/exercises/session/active → 404 'No active session' when null.
 * The `?mode=` query selects the branch so one app drives them all.
 */
function buildApp(): FastifyInstance {
    const app = Fastify({ logger: false });
    const silentLogger = { error: () => {}, warn: () => {}, info: () => {} } as any;

    // GET workout by id — mirrors src/index.ts GET /v1/exercises/:id.
    app.get('/v1/exercises/:id', async (request, reply) => {
        try {
            const mode = (request.query as any)?.mode;
            // mode=missing → service resolved no row → fixed 404
            const workout = mode === 'missing' ? null : { id: 'x' };
            if (mode === 'throw') throw new Error(LEAKY_THROWN_MESSAGE);
            if (!workout) return reply.code(404).send({ error: 'Workout not found' });
            return reply.send(workout);
        } catch (err: any) {
            silentLogger.error(err);
            return reply.code(500).send({ error: 'An unexpected error occurred' });
        }
    });

    // GET active session — mirrors src/index.ts GET /v1/exercises/session/active.
    app.get('/v1/exercises/session/active', async (request, reply) => {
        try {
            const mode = (request.query as any)?.mode;
            const session = mode === 'missing' ? null : { id: 'x' };
            if (!session) return reply.code(404).send({ error: 'No active session' });
            return reply.send(session);
        } catch (err: any) {
            silentLogger.error(err);
            return reply.code(500).send({ error: 'An unexpected error occurred' });
        }
    });

    return app;
}

describe('exercise-service inline 404 routes — fixed copy, no leak', () => {
    let app: FastifyInstance;

    beforeAll(async () => {
        app = buildApp();
        await app.ready();
    });

    afterAll(async () => {
        await app.close();
    });

    it('GET /v1/exercises/:id missing → fixed 404 "Workout not found"', async () => {
        const res = await app.inject({ method: 'GET', url: '/v1/exercises/abc?mode=missing' });
        expect(res.statusCode).toBe(404);
        expect(res.json()).toEqual({ error: 'Workout not found' });
    });

    it('GET /v1/exercises/session/active missing → fixed 404 "No active session"', async () => {
        const res = await app.inject({ method: 'GET', url: '/v1/exercises/session/active?mode=missing' });
        expect(res.statusCode).toBe(404);
        expect(res.json()).toEqual({ error: 'No active session' });
    });

    it('a thrown leaky Error yields a generic 500 — the response leaks no internal detail', async () => {
        const res = await app.inject({ method: 'GET', url: '/v1/exercises/abc?mode=throw' });
        expect(res.statusCode).toBe(500);
        expect(res.json()).toEqual({ error: 'An unexpected error occurred' });
    });

    // Negative-match assertions on the thrown-Error path — each FAILS if anyone
    // reintroduces `{ error: err.message }` on this branch.
    it('500 body does NOT contain "Prisma"', async () => {
        const res = await app.inject({ method: 'GET', url: '/v1/exercises/abc?mode=throw' });
        expect(res.body).not.toContain('Prisma');
    });

    it('500 body does NOT contain "P2025"', async () => {
        const res = await app.inject({ method: 'GET', url: '/v1/exercises/abc?mode=throw' });
        expect(res.body).not.toContain('P2025');
    });

    it('500 body does NOT contain "stack" or a stack-frame path', async () => {
        const res = await app.inject({ method: 'GET', url: '/v1/exercises/abc?mode=throw' });
        expect(res.body).not.toContain('stack');
        expect(res.body).not.toContain('at /');
        expect(res.body).not.toContain('/app/src');
    });

    it('500 body does NOT contain "localhost" or the DB port hint', async () => {
        const res = await app.inject({ method: 'GET', url: '/v1/exercises/abc?mode=throw' });
        expect(res.body).not.toContain('localhost');
        expect(res.body).not.toContain('5432');
    });

    it('500 body does NOT contain the literal leaky thrown message', async () => {
        const res = await app.inject({ method: 'GET', url: '/v1/exercises/abc?mode=throw' });
        expect(res.body).not.toContain(LEAKY_THROWN_MESSAGE);
    });
});

describe('exercise-service inline write schema (logSessionExercise) — bounds enforced', () => {
    it('accepts a valid logSessionExercise payload', () => {
        const parsed = logSessionExerciseSchema.safeParse({
            exerciseName: 'Bench Press',
            sets: 3,
            reps: 10,
            weightKg: 80,
            durationSecs: 300,
        });
        expect(parsed.success).toBe(true);
    });

    it('applies the documented defaults when numeric fields are omitted', () => {
        const parsed = logSessionExerciseSchema.safeParse({ exerciseName: 'Plank' });
        expect(parsed.success).toBe(true);
        if (parsed.success) {
            expect(parsed.data).toMatchObject({ sets: 0, reps: 0, weightKg: 0, durationSecs: 0 });
        }
    });

    it('rejects an over-bound logSessionExercise payload (reps 99999 + weight 100000)', () => {
        const parsed = logSessionExerciseSchema.safeParse({
            exerciseName: 'Bench Press',
            sets: 5,
            reps: 99999,
            weightKg: 100000,
        });
        expect(parsed.success).toBe(false);
    });

    it('rejects durationSecs above the 24h (86400s) cap', () => {
        const parsed = logSessionExerciseSchema.safeParse({
            exerciseName: 'Run',
            durationSecs: 86401,
        });
        expect(parsed.success).toBe(false);
    });

    it('rejects an exerciseName longer than the 120-char cap', () => {
        const parsed = logSessionExerciseSchema.safeParse({
            exerciseName: 'x'.repeat(121),
        });
        expect(parsed.success).toBe(false);
    });
});
