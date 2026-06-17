/**
 * Regression suite — sleep-service INLINE route hardening (src/index.ts).
 *
 * This is deliberately separate from error-redaction.test.ts (which locks the
 * SHARED `registerFastifyErrorHandler` 5xx contract). That suite cannot cover
 * the bug fixed here because the leak lived in an INLINE per-route catch, not
 * in the shared handler:
 *
 *   PATCH /v1/sleep/:id  catch  (src/index.ts)
 *     BEFORE:  if (err.message.includes('not found'))
 *                  return reply.code(404).send({ error: err.message });
 *     Two defects:
 *       1. `err.message.includes(...)` throws a TypeError when a non-Error
 *          value is thrown (err.message === undefined) — turning the intended
 *          404 into an UNHANDLED 500 (caught by the shared handler).
 *       2. `{ error: err.message }` echoes the RAW thrown message to the
 *          client — a Prisma / internal string can leak verbatim.
 *     AFTER:   if (typeof err?.message === 'string' && err.message.includes('not found'))
 *                  return reply.code(404).send({ error: 'Sleep session not found' });
 *
 * Why replicate the catch instead of importing src/:
 *   - The service bootstrap module (src/index.ts) opens real DB/Redis
 *     connections at import time and cannot be loaded in a unit test (the
 *     same constraint documented in error-redaction.test.ts).
 *   - So we mount a tiny Fastify app whose PATCH handler reproduces the EXACT
 *     hardened catch shape from src/index.ts and assert it (a) returns the
 *     fixed 404 copy, (b) leaks no internal detail, and (c) does NOT 500 on a
 *     non-Error throw. Assertions are written so they FAIL against the old
 *     leaky/un-guarded code and PASS against the fix.
 *
 * The write-schema block re-declares createSessionSchema / updateSessionSchema
 * verbatim from src/index.ts (same reason — index.ts can't be imported) and
 * proves an accepted payload passes while an over-bound one is rejected.
 */
import Fastify, { FastifyInstance } from 'fastify';
import { z } from 'zod';

// The real updateSession() in src/sleep.service.ts throws exactly this when the
// row is absent — the inline catch keys off the 'not found' substring. We reuse
// the literal so the test tracks the real thrown message.
const SERVICE_NOT_FOUND_MESSAGE = 'Sleep session not found';

// A raw thrown message carrying internal detail that MUST NOT reach the client
// if the catch ever echoes err.message again. Includes the 'not found' trigger
// substring so it also exercises the 404 branch — proving the response uses the
// FIXED copy, not this string.
const LEAKY_NOT_FOUND_MESSAGE =
    'Prisma P2025 record not found at /app/src/sleep.service.ts localhost:5432';

// ── Schemas copied verbatim from src/index.ts (cannot import — see header) ──────
const MAX_DISTURBANCES = 1000;
const MAX_SOURCE_LEN = 60;

const createSessionSchema = z.object({
    startTime: z.string().datetime(),
    endTime: z.string().datetime().optional().nullable(),
    quality: z.number().int().min(1).max(10).optional().nullable(),
    disturbances: z.number().int().min(0).max(MAX_DISTURBANCES).optional(),
    source: z.string().max(MAX_SOURCE_LEN).optional(),
    circadianSleepStart: z.string().datetime().optional().nullable(),
    circadianSleepEnd: z.string().datetime().optional().nullable(),
    notes: z.string().max(2000).optional().nullable(),
});

const updateSessionSchema = z.object({
    endTime: z.string().datetime().optional(),
    quality: z.number().int().min(1).max(10).optional(),
    disturbances: z.number().int().min(0).max(MAX_DISTURBANCES).optional(),
    notes: z.string().max(2000).optional(),
});

/**
 * A tiny Fastify app reproducing the hardened PATCH /v1/sleep/:id catch shape.
 * The `?throw=` query selects which value the handler throws so one app can
 * drive every branch:
 *   - throw=notfound  → Error('Sleep session not found')  (real service throw)
 *   - throw=leaky     → Error(LEAKY_NOT_FOUND_MESSAGE)    (internal detail + 'not found')
 *   - throw=nonerror  → throws a plain object (no .message) — the case that
 *                       used to TypeError and 500 before the typeof guard
 *   - throw=other     → Error('boom')  (non-'not found' → 500 generic)
 */
function buildApp(): FastifyInstance {
    const app = Fastify({ logger: false });
    const silentLogger = { error: () => {}, warn: () => {}, info: () => {} } as any;

    app.patch('/v1/sleep/:id', async (request, reply) => {
        try {
            const which = (request.query as any)?.throw;
            if (which === 'notfound') throw new Error(SERVICE_NOT_FOUND_MESSAGE);
            if (which === 'leaky') throw new Error(LEAKY_NOT_FOUND_MESSAGE);
            // eslint-disable-next-line no-throw-literal
            if (which === 'nonerror') throw { code: 'P2025', detail: 'record not found' };
            if (which === 'other') throw new Error('boom');
            return reply.send({ ok: true });
        } catch (err: any) {
            // EXACT hardened catch from src/index.ts — keep in lockstep.
            silentLogger.error(err);
            if (typeof err?.message === 'string' && err.message.includes('not found')) {
                return reply.code(404).send({ error: 'Sleep session not found' });
            }
            return reply.code(500).send({ error: 'An unexpected error occurred' });
        }
    });

    return app;
}

describe('sleep-service inline PATCH /v1/sleep/:id — 404 leak redaction & undefined-guard', () => {
    let app: FastifyInstance;

    beforeAll(async () => {
        app = buildApp();
        await app.ready();
    });

    afterAll(async () => {
        await app.close();
    });

    it('returns a clean fixed 404 body for a real "not found" throw (positive match)', async () => {
        const res = await app.inject({ method: 'PATCH', url: '/v1/sleep/abc?throw=notfound' });
        expect(res.statusCode).toBe(404);
        // Fixed copy — exactly what the hardened handler sends.
        expect(res.json()).toEqual({ error: 'Sleep session not found' });
    });

    it('404 body for a LEAKY "not found" throw is the FIXED copy, not the raw message', async () => {
        const res = await app.inject({ method: 'PATCH', url: '/v1/sleep/abc?throw=leaky' });
        expect(res.statusCode).toBe(404);
        // The old code did `{ error: err.message }` and would have echoed the
        // leaky string verbatim; the fix replaces it with the fixed copy.
        expect(res.json()).toEqual({ error: 'Sleep session not found' });
    });

    // Negative-match assertions — each would FAIL against the old `error: err.message`.
    it('404 body does NOT contain "Prisma"', async () => {
        const res = await app.inject({ method: 'PATCH', url: '/v1/sleep/abc?throw=leaky' });
        expect(res.body).not.toContain('Prisma');
    });

    it('404 body does NOT contain "P2025"', async () => {
        const res = await app.inject({ method: 'PATCH', url: '/v1/sleep/abc?throw=leaky' });
        expect(res.body).not.toContain('P2025');
    });

    it('404 body does NOT contain "stack" or a stack-frame path', async () => {
        const res = await app.inject({ method: 'PATCH', url: '/v1/sleep/abc?throw=leaky' });
        expect(res.body).not.toContain('stack');
        expect(res.body).not.toContain('at /');
        expect(res.body).not.toContain('/app/src');
    });

    it('404 body does NOT contain "localhost" or the DB port hint', async () => {
        const res = await app.inject({ method: 'PATCH', url: '/v1/sleep/abc?throw=leaky' });
        expect(res.body).not.toContain('localhost');
        expect(res.body).not.toContain('5432');
    });

    it('404 body does NOT contain the literal leaky thrown message', async () => {
        const res = await app.inject({ method: 'PATCH', url: '/v1/sleep/abc?throw=leaky' });
        expect(res.body).not.toContain(LEAKY_NOT_FOUND_MESSAGE);
    });

    it('a NON-Error throw (no .message) yields a clean 500, NOT an unhandled crash', async () => {
        // Before the `typeof err?.message === 'string'` guard, `err.message.includes`
        // threw a TypeError here and the route 500'd via the shared handler with a
        // DIFFERENT (InternalServerError) shape. The guard makes this a controlled
        // generic 500 from THIS catch.
        const res = await app.inject({ method: 'PATCH', url: '/v1/sleep/abc?throw=nonerror' });
        expect(res.statusCode).toBe(500);
        expect(res.json()).toEqual({ error: 'An unexpected error occurred' });
        expect(res.body).not.toContain('record not found');
    });

    it('a non-"not found" Error yields the generic 500 (does NOT masquerade as 404)', async () => {
        const res = await app.inject({ method: 'PATCH', url: '/v1/sleep/abc?throw=other' });
        expect(res.statusCode).toBe(500);
        expect(res.json()).toEqual({ error: 'An unexpected error occurred' });
    });
});

describe('sleep-service inline write schemas — bounds enforced', () => {
    it('accepts a valid createSession payload', () => {
        const parsed = createSessionSchema.safeParse({
            startTime: '2026-06-17T22:30:00.000Z',
            endTime: '2026-06-18T06:30:00.000Z',
            quality: 8,
            disturbances: 2,
            source: 'MANUAL',
            notes: 'Slept well.',
        });
        expect(parsed.success).toBe(true);
    });

    it('rejects an over-bound createSession payload (quality 9999 + 5000 disturbances)', () => {
        const parsed = createSessionSchema.safeParse({
            startTime: '2026-06-17T22:30:00.000Z',
            quality: 9999,
            disturbances: 5000,
        });
        expect(parsed.success).toBe(false);
    });

    it('rejects createSession notes longer than the 2000-char cap', () => {
        const parsed = createSessionSchema.safeParse({
            startTime: '2026-06-17T22:30:00.000Z',
            notes: 'x'.repeat(2001),
        });
        expect(parsed.success).toBe(false);
    });

    it('accepts a valid updateSession payload', () => {
        const parsed = updateSessionSchema.safeParse({ quality: 7, disturbances: 1 });
        expect(parsed.success).toBe(true);
    });

    it('rejects an over-bound updateSession payload (disturbances above MAX)', () => {
        const parsed = updateSessionSchema.safeParse({ disturbances: MAX_DISTURBANCES + 1 });
        expect(parsed.success).toBe(false);
    });
});
