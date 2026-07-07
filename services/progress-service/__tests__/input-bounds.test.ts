/**
 * Regression suite — progress-service QUERY INPUT-BOUNDS hardening (the `days`
 * clamps on GET /history, /stats, /metrics), exercised end-to-end through the
 * REAL validation pipeline.
 *
 * This is deliberately separate from the existing error-redaction.test.ts:
 *   - error-redaction.test.ts locks the SHARED 5xx/4xx redaction contract on a
 *     handful of THROWING routes — it proves the handler strips internals, but
 *     never drives a query-bound REJECTION (no validator in that suite).
 *
 * What THIS suite proves, which nothing else does: that an out-of-range /
 * non-numeric `days` is rejected with a real HTTP 400 *through the same
 * machinery the service wires in production* — `setValidatorCompiler(
 * validatorCompiler)` + `setSerializerCompiler(serializerCompiler)` from
 * `fastify-type-provider-zod` feeding the SHARED `registerFastifyErrorHandler`
 * from `@nightfuel/config` — AND that the rejected 400 body is redacted (no
 * stack, no Prisma/DB internals, no filesystem path) and well-formed, WHILE a
 * representative in-range request (and the exact inclusive upper edge) still
 * succeeds with the coerced `days`. In other words: the bounds only tighten the
 * rejected surface; they never change valid behaviour.
 *
 * Why we mount a tiny app instead of importing src/index.ts:
 *   - The service bootstrap module (src/index.ts) opens real DB/Redis
 *     connections at import time and cannot be loaded in a unit test — the same
 *     constraint documented at the top of error-redaction.test.ts and shared by
 *     the sleep-service input-bounds suite this file is modelled on.
 *   - So we mount a Fastify app wired EXACTLY like the service's request path
 *     (same validator/serializer compilers, same shared error handler) and
 *     attach GET /history, /stats, /metrics with the three query schemas copied
 *     verbatim from src/schemas.ts + routes.ts. The `authenticate` preHandler is
 *     intentionally omitted (auth is locked by the shared 401 guard, not here)
 *     so injected requests reach the validator directly without JWT plumbing.
 *
 * On "redacted body" vs the Zod field path: a Zod validation failure surfaces a
 * 400 whose `error.validation` flag is truthy, so the shared handler reflects
 * its message — that is user-facing SCHEMA copy (it names the `days` field and
 * the rule it broke) and is intentionally preserved. What MUST NOT appear is
 * internal leakage: a stack trace, a stack-frame path ("at /"), an in-container
 * source path ("/app/src"), Prisma/Prisma-error text ("Prisma", "P2025"), or a
 * DB connection-string fragment ("localhost", "5432"). The negative-match list
 * below mirrors the sibling redaction suites verbatim so the leak-signal surface
 * is identical and grep-able across services.
 */
import Fastify, { FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { registerFastifyErrorHandler } from '@nightfuel/config';
import { z } from 'zod';

// ── Schemas copied verbatim from src/schemas.ts + routes.ts (cannot import the
//    service — see header). Keep these byte-for-byte in lockstep:
//      - historyQuerySchema / statsQuerySchema → src/schemas.ts
//      - metricsQuerySchema  → the inline querystring at routes.ts:209-210
//    If a bound changes in the service, change it here too. ──────────────────────
const historyQuerySchema = z.object({
    days: z.coerce.number().int().min(1).max(90).default(7),
});

const statsQuerySchema = z.object({
    days: z.coerce.number().int().min(1).max(365).default(30),
});

const metricsQuerySchema = z.object({
    days: z.coerce.number().int().min(1).max(365).default(90),
});

/**
 * Build a Fastify app wired EXACTLY like the service's request path:
 *   - validatorCompiler / serializerCompiler from fastify-type-provider-zod
 *   - the SHARED registerFastifyErrorHandler from @nightfuel/config (with a
 *     no-op logger so the handler's logger.error side effect stays quiet)
 *   - GET /history | /stats | /metrics, each gated by its query schema, whose
 *     handler just echoes the validated { days } as 200 JSON.
 * The handlers do NO I/O — a rejected request never reaches them (the validator
 * short-circuits to the shared error handler first), and an accepted request
 * echoes the coerced `days` so valid behaviour is observable.
 */
function buildApp(): FastifyInstance {
    const app = Fastify({ logger: false });
    const silentLogger = { error: () => {}, warn: () => {}, info: () => {} } as any;
    registerFastifyErrorHandler(app, silentLogger);
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);

    app.get('/history', { schema: { querystring: historyQuerySchema } }, async (request, reply) => {
        const { days } = request.query as { days: number };
        return reply.code(200).send({ days });
    });

    app.get('/stats', { schema: { querystring: statsQuerySchema } }, async (request, reply) => {
        const { days } = request.query as { days: number };
        return reply.code(200).send({ days });
    });

    app.get('/metrics', { schema: { querystring: metricsQuerySchema } }, async (request, reply) => {
        const { days } = request.query as { days: number };
        return reply.code(200).send({ days });
    });

    return app;
}

// The three bound-gated routes under test, with their inclusive max so the
// rejection + acceptance assertions can iterate uniformly.
const ROUTES: ReadonlyArray<{ name: string; url: string; max: number }> = [
    { name: '/history', url: '/history', max: 90 },
    { name: '/stats', url: '/stats', max: 365 },
    { name: '/metrics', url: '/metrics', max: 365 },
];

// Every fragment a redacted 400 body MUST NOT contain — identical leak-signal
// list to error-redaction.test.ts / the sleep-service input-bounds suite so the
// negative surface is uniform and easy to grep across services. NOTE: the Zod
// field NAME ("days") is legitimate user-facing schema copy and is NOT in this
// list — only genuine internal-leak signals are. 'stack' covers both a raw
// stack trace and any 'stack frame' text.
const LEAK_SIGNALS = ['stack', 'at /', '/app/src', '/etc/passwd', 'Prisma', 'P2025', 'localhost', '5432'];

function expectRedacted400Body(body: string): void {
    for (const signal of LEAK_SIGNALS) {
        expect(body).not.toContain(signal);
    }
}

// Out-of-bounds / non-numeric `days` values that every route must reject. 99999
// clears even the most permissive cap (365); 0 and -1 fall under min(1); 'abc'
// coerces to NaN, which fails .int().
const REJECTED_DAYS: ReadonlyArray<string> = ['0', '-1', '99999', 'abc'];

describe('progress-service input-bounds — out-of-range / non-numeric `days` is rejected 400 (redacted)', () => {
    let app: FastifyInstance;

    beforeAll(async () => {
        app = buildApp();
        await app.ready();
    });

    afterAll(async () => {
        await app.close();
    });

    // ── Rejection: each out-of-bounds `days` 400s on EACH route, via the real
    //    validator + the SHARED error handler. ───────────────────────────────────
    describe('rejection — every route rejects out-of-bounds / non-numeric days with a 400', () => {
        for (const { name, url } of ROUTES) {
            for (const days of REJECTED_DAYS) {
                it(`GET ${name}?days=${days} → 400`, async () => {
                    const res = await app.inject({ method: 'GET', url: `${url}?days=${days}` });
                    expect(res.statusCode).toBe(400);
                });
            }
        }
    });

    // ── Acceptance: a representative in-range request returns 200 with the COERCED
    //    days, and the exact INCLUSIVE upper edge passes. ──────────────────────────
    describe('acceptance — a valid in-range days returns 200 with the coerced value', () => {
        it('GET /history?days=7 → 200 with coerced days=7 (string query coerced to number)', async () => {
            const res = await app.inject({ method: 'GET', url: '/history?days=7' });
            expect(res.statusCode).toBe(200);
            // z.coerce.number() turns the "7" query string into the number 7.
            expect(res.json()).toEqual({ days: 7 });
        });

        it('GET /metrics?days=365 → 200 (inclusive upper edge passes — bound is <= max, not < max)', async () => {
            const res = await app.inject({ method: 'GET', url: '/metrics?days=365' });
            expect(res.statusCode).toBe(200);
            expect(res.json()).toEqual({ days: 365 });
        });

        it('GET /stats?days=365 → 200 (inclusive upper edge passes — bound is <= max, not < max)', async () => {
            const res = await app.inject({ method: 'GET', url: '/stats?days=365' });
            expect(res.statusCode).toBe(200);
            expect(res.json()).toEqual({ days: 365 });
        });

        it('GET /history?days=90 → 200 (inclusive upper edge passes on the tighter 90-day cap)', async () => {
            const res = await app.inject({ method: 'GET', url: '/history?days=90' });
            expect(res.statusCode).toBe(200);
            expect(res.json()).toEqual({ days: 90 });
        });
    });

    // ── Redaction of the rejection body — leaks NO internals AND is well-formed
    //    JSON whose key-set is EXACTLY { error, message, statusCode }. ─────────────
    describe('redaction — the rejected 400 body leaks no internals and is the shared-handler shape', () => {
        it('the 400 body leaks NO stack / Prisma / DB-internals / fs-path (redacted)', async () => {
            // days=99999 over-bounds every route; use /history as the representative.
            const res = await app.inject({ method: 'GET', url: '/history?days=99999' });
            expect(res.statusCode).toBe(400);
            expectRedacted400Body(res.body);
        });

        it('the 400 body is well-formed JSON whose key-set is EXACTLY { error, message, statusCode }', async () => {
            const res = await app.inject({ method: 'GET', url: '/history?days=99999' });
            expect(res.statusCode).toBe(400);
            const json = res.json();
            // The shared handler reflects a genuine validation error's message but
            // pins statusCode to the 4xx and exposes only these three keys.
            expect(json.statusCode).toBe(400);
            expect(typeof json.message).toBe('string');
            expect(Object.keys(json).sort()).toEqual(['error', 'message', 'statusCode']);
        });

        it('a non-numeric (abc) rejection is ALSO redacted + well-formed across every route', async () => {
            for (const { url } of ROUTES) {
                const res = await app.inject({ method: 'GET', url: `${url}?days=abc` });
                expect(res.statusCode).toBe(400);
                expectRedacted400Body(res.body);
                expect(Object.keys(res.json()).sort()).toEqual(['error', 'message', 'statusCode']);
            }
        });
    });
});
