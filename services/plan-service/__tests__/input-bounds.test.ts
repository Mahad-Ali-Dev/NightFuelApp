/**
 * Regression suite — plan-service INPUT-BOUNDS hardening (src/schemas.ts request
 * schemas), exercised at TWO layers: the REAL zod schemas in isolation
 * (`safeParse`) AND end-to-end through the SAME validation pipeline the service
 * wires in production (`setValidatorCompiler` + `setSerializerCompiler` from
 * `fastify-type-provider-zod` feeding the SHARED `registerFastifyErrorHandler`
 * from `@nightfuel/config`).
 *
 * This file is deliberately ADDITIVE and DISJOINT from the four existing
 * plan-service suites — none of them proves what THIS suite proves:
 *   - ai-quota-plan.test.ts            locks the AI-quota gating on /generate.
 *   - error-redaction.test.ts          locks the SHARED 5xx/4xx redaction contract
 *                                      against three synthetic throwing routes.
 *   - history.routes.test.ts           locks GET /history's 200/400/401 contract
 *                                      under Fastify's DEFAULT validation handler.
 *   - history-error-wiring.routes.test.ts locks GET /history's redacted-5xx +
 *                                      reversed-range-400 under the SHARED handler.
 * THIS suite raises request-bounds coverage on the schemas THEMSELVES
 * (getPlanParamsSchema / getPlanHistoryQuerySchema / storePlanBodySchema /
 * generatePlanBodySchema), proving an out-of-bounds field is rejected with a real
 * HTTP 400 through the production machinery AND that the 400 body is redacted (no
 * raw zod issue JSON, no stack, no Prisma/DB internals, no filesystem path),
 * WHILE valid/inclusive happy paths still parse OK and are NOT rejected.
 *
 * Why import the REAL schemas (unlike the sleep-service template, which copies its
 * write schemas verbatim because they live inline in src/index.ts):
 *   plan-service factors its request schemas into src/schemas.ts — a pure,
 *   I/O-free module (it imports only `zod` and two pure helpers from
 *   @nightfuel/config). So we import the genuine `getPlanParamsSchema`,
 *   `getPlanHistoryQuerySchema`, `storePlanBodySchema`, and
 *   `generatePlanBodySchema` directly and mount them on a tiny Fastify app wired
 *   EXACTLY like src/index.ts's request path. We never import src/index.ts (its
 *   bootstrap opens real DB/Redis at import time and cannot load in a unit test —
 *   the same constraint documented atop error-redaction.test.ts) and never touch
 *   Prisma. The `authenticate` onRequest hook is intentionally omitted (auth is
 *   locked by history.routes.test.ts's 401 case, not here) so injected requests
 *   reach the validator directly — mirroring how the sleep-service input-bounds
 *   template mounts its bare routes.
 *
 * IMPORTANT — the 400 body shape under the SHARED handler (verified empirically by
 * history-error-wiring.routes.test.ts and re-confirmed here):
 *   fastify-type-provider-zod throws a ZodError that does NOT set Fastify's
 *   `error.validation` flag. The shared `registerFastifyErrorHandler` therefore
 *   routes it through its NON-validation 4xx branch and REDACTS the issue detail
 *   to a fixed `{ error: 'ZodError', message: 'Bad request', statusCode: 400 }`.
 *   This is STRONGER redaction than the sleep/meal templates assert (those run
 *   under wirings where the field-name copy survives): here even the zod field
 *   path / issue JSON is stripped. The precise reversed-range message
 *   (RANGE_REVERSED_MSG) and its `path: ['end']` are asserted at the SCHEMA layer
 *   (Block A) where they are observable; the HTTP layer (Block B) proves the wire
 *   body is the redacted shape and leaks nothing.
 */
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { registerFastifyErrorHandler, RANGE_REVERSED_MSG } from '@nightfuel/config';
import { z } from 'zod';
import {
    getPlanParamsSchema,
    getPlanHistoryQuerySchema,
    storePlanBodySchema,
    generatePlanBodySchema,
} from '../src/schemas';

// A syntactically-valid UUID used wherever a body needs an in-bounds userId/shiftId.
const VALID_UUID = '11111111-1111-1111-1111-111111111111';

// A leaky string we attempt to smuggle through the `shiftType` field on a
// rejected store/generate body. If the validator/handler ever echoed the rejected
// INPUT back in the error body, this internal-looking text would ride out — the
// negative matches below prove it does not. Every fragment is a known leak signal
// mirrored from the sibling redaction suites.
const LEAKY_SHIFT_TYPE =
    'Prisma at /app/src/plan.service.ts localhost:5432 /etc/passwd P2025 stack frame';

// Every fragment a redacted 400 body MUST NOT contain — identical leak-signal list
// to error-redaction.test.ts / history-error-wiring.routes.test.ts so the negative
// surface is uniform and grep-able across services.
const LEAK_SIGNALS = ['stack', 'at /', '/app/src', '/etc/passwd', 'Prisma', 'P2025', 'localhost', '5432'];

function expectRedacted400Body(body: string): void {
    for (const signal of LEAK_SIGNALS) {
        expect(body).not.toContain(signal);
    }
}

/**
 * Build a Fastify app wired EXACTLY like src/index.ts's request path:
 *   - validatorCompiler / serializerCompiler from fastify-type-provider-zod
 *   - the SHARED registerFastifyErrorHandler from @nightfuel/config (with a
 *     no-op logger so the handler's logger.error side effect stays quiet)
 *   - GET  /v1/plans/:date        { params: getPlanParamsSchema }       → 200
 *   - GET  /v1/plans/history      { querystring: getPlanHistoryQuerySchema } → 200
 *   - POST /v1/plans/store        { body: storePlanBodySchema }         → 201
 *   - POST /v1/plans/generate     { body: generatePlanBodySchema }      → 201
 * The route handlers do NO I/O — a rejected request never reaches them (the
 * validator short-circuits to the shared error handler first), and an accepted
 * request just returns a fixed marker so "valid → not 400" is observable.
 */
function buildApp(): FastifyInstance {
    const app = Fastify({ logger: false });
    const silentLogger = { error: () => {}, warn: () => {}, info: () => {} } as any;
    registerFastifyErrorHandler(app, silentLogger);
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);

    app.get('/v1/plans/history', { schema: { querystring: getPlanHistoryQuerySchema } }, async (_req, reply) => {
        return reply.code(200).send({ ok: true });
    });

    // Registered AFTER /history so the literal route wins over the param route.
    app.get('/v1/plans/:date', { schema: { params: getPlanParamsSchema } }, async (_req, reply) => {
        return reply.code(200).send({ ok: true });
    });

    app.post('/v1/plans/store', { schema: { body: storePlanBodySchema } }, async (_req, reply) => {
        return reply.code(201).send({ ok: true });
    });

    app.post('/v1/plans/generate', { schema: { body: generatePlanBodySchema } }, async (_req, reply) => {
        return reply.code(201).send({ ok: true });
    });

    return app;
}

// A representative, fully in-bounds store body the valid-path test reuses.
function validStoreBody(overrides: Record<string, unknown> = {}) {
    return {
        userId: VALID_UUID,
        date: '2026-06-20',
        shiftId: VALID_UUID,
        shiftType: 'NIGHT',
        structuredPlan: { meals: [], notes: 'ok' },
        providerUsed: 'anthropic',
        tokensUsed: 1234,
        ...overrides,
    };
}

// A representative, fully in-bounds generate body the valid-path test reuses.
function validGenerateBody(overrides: Record<string, unknown> = {}) {
    return {
        userId: VALID_UUID,
        date: '2026-06-20',
        shiftId: VALID_UUID,
        shiftType: 'NIGHT',
        circadianProfile: { chronotype: 'intermediate' },
        preferences: { dietary: 'none' },
        ...overrides,
    };
}

// ── Block A — REAL schemas in isolation (precise message/path observable here) ──
// fastify-type-provider-zod REDACTS the issue detail at the HTTP layer (Block B),
// so the exact RANGE_REVERSED_MSG + path:['end'] and field-level rejections are
// asserted directly against the schema — the same `safeParse` discipline the
// sleep-service input-bounds template uses for its NaN case.
describe('plan-service input-bounds — REAL schemas reject out-of-bounds input (schema layer)', () => {
    // ── getPlanParamsSchema.date — YYYY-MM-DD regex ──────────────────────────
    it('getPlanParamsSchema rejects a malformed date (not YYYY-MM-DD)', () => {
        const parsed = getPlanParamsSchema.safeParse({ date: '2026/06/20' });
        expect(parsed.success).toBe(false);
    });

    it('getPlanParamsSchema rejects an empty date string', () => {
        const parsed = getPlanParamsSchema.safeParse({ date: '' });
        expect(parsed.success).toBe(false);
    });

    it('getPlanParamsSchema rejects a non-calendar shape (13-99-99) that the regex still admits but is malformed structurally', () => {
        // The regex is structural (\d{4}-\d{2}-\d{2}); a value like '2026-06-2'
        // (single-digit day) is the realistic malformed input a client sends.
        const parsed = getPlanParamsSchema.safeParse({ date: '2026-06-2' });
        expect(parsed.success).toBe(false);
    });

    it('getPlanParamsSchema ACCEPTS a valid YYYY-MM-DD date (inclusive happy path)', () => {
        const parsed = getPlanParamsSchema.safeParse({ date: '2026-06-20' });
        expect(parsed.success).toBe(true);
    });

    // ── Calendar-validity refine — the regex is structural; these pass the regex
    //    but are NOT real calendar dates. Before the .refine, '2026-13-01' /
    //    '2026-00-10' reached new Date(date) → Invalid Date → Prisma 500, and
    //    '2026-02-30' silently rolled forward to 2026-03-02 (wrong-day data). The
    //    round-trip refine rejects all three with a clean 400 at the boundary.
    it('getPlanParamsSchema rejects an out-of-range month (2026-13-01) — passes regex, not a calendar date', () => {
        const parsed = getPlanParamsSchema.safeParse({ date: '2026-13-01' });
        expect(parsed.success).toBe(false);
    });

    it('getPlanParamsSchema rejects a zero month (2026-00-10) — passes regex, not a calendar date', () => {
        const parsed = getPlanParamsSchema.safeParse({ date: '2026-00-10' });
        expect(parsed.success).toBe(false);
    });

    it('getPlanParamsSchema rejects an impossible day (2026-02-30) — would silently roll to Mar 2, must 400 not corrupt', () => {
        const parsed = getPlanParamsSchema.safeParse({ date: '2026-02-30' });
        expect(parsed.success).toBe(false);
    });

    // ── getPlanHistoryQuerySchema — optional bounded range ───────────────────
    it('getPlanHistoryQuerySchema rejects a reversed range with RANGE_REVERSED_MSG on path ["end"]', () => {
        const parsed = getPlanHistoryQuerySchema.safeParse({ start: '2026-06-30', end: '2026-06-01' });
        expect(parsed.success).toBe(false);
        if (parsed.success) throw new Error('unreachable — parse must fail on a reversed range');
        // The cross-field guard attaches its message to ['end'] (the field a
        // client would adjust), using the SHARED RANGE_REVERSED_MSG verbatim.
        const issue = parsed.error.issues.find(
            (i) => Array.isArray(i.path) && i.path.length === 1 && i.path[0] === 'end',
        );
        expect(issue).toBeDefined();
        expect(issue?.message).toBe(RANGE_REVERSED_MSG);
    });

    it('getPlanHistoryQuerySchema rejects a malformed start date', () => {
        const parsed = getPlanHistoryQuerySchema.safeParse({ start: 'not-a-date', end: '2026-06-30' });
        expect(parsed.success).toBe(false);
    });

    it('getPlanHistoryQuerySchema ACCEPTS the no-params call (both omitted → server-default behaviour preserved)', () => {
        const parsed = getPlanHistoryQuerySchema.safeParse({});
        expect(parsed.success).toBe(true);
    });

    it('getPlanHistoryQuerySchema ACCEPTS an equal start==end range (inclusive boundary)', () => {
        const parsed = getPlanHistoryQuerySchema.safeParse({ start: '2026-06-15', end: '2026-06-15' });
        expect(parsed.success).toBe(true);
    });

    it('getPlanHistoryQuerySchema ACCEPTS a normal start<end range', () => {
        const parsed = getPlanHistoryQuerySchema.safeParse({ start: '2026-06-01', end: '2026-06-30' });
        expect(parsed.success).toBe(true);
    });

    // ── storePlanBodySchema — uuid + date + record shapes ────────────────────
    it('storePlanBodySchema rejects a non-uuid userId', () => {
        const parsed = storePlanBodySchema.safeParse(validStoreBody({ userId: 'not-a-uuid' }));
        expect(parsed.success).toBe(false);
    });

    it('storePlanBodySchema rejects a malformed date', () => {
        const parsed = storePlanBodySchema.safeParse(validStoreBody({ date: '06-20-2026' }));
        expect(parsed.success).toBe(false);
    });

    it('storePlanBodySchema rejects a missing structuredPlan record', () => {
        const body = validStoreBody();
        delete (body as Record<string, unknown>).structuredPlan;
        const parsed = storePlanBodySchema.safeParse(body);
        expect(parsed.success).toBe(false);
    });

    it('storePlanBodySchema ACCEPTS a well-formed body (inclusive happy path)', () => {
        const parsed = storePlanBodySchema.safeParse(validStoreBody());
        expect(parsed.success).toBe(true);
    });

    it('storePlanBodySchema ACCEPTS a minimal body (only required date + structuredPlan)', () => {
        const parsed = storePlanBodySchema.safeParse({ date: '2026-06-20', structuredPlan: {} });
        expect(parsed.success).toBe(true);
    });

    // ── generatePlanBodySchema — uuid + date + record shapes ─────────────────
    it('generatePlanBodySchema rejects a non-uuid shiftId', () => {
        const parsed = generatePlanBodySchema.safeParse(validGenerateBody({ shiftId: 'not-a-uuid' }));
        expect(parsed.success).toBe(false);
    });

    it('generatePlanBodySchema rejects a malformed date', () => {
        const parsed = generatePlanBodySchema.safeParse(validGenerateBody({ date: '2026.06.20' }));
        expect(parsed.success).toBe(false);
    });

    it('generatePlanBodySchema ACCEPTS a well-formed body (inclusive happy path)', () => {
        const parsed = generatePlanBodySchema.safeParse(validGenerateBody());
        expect(parsed.success).toBe(true);
    });

    it('generatePlanBodySchema ACCEPTS a minimal body (only required date)', () => {
        const parsed = generatePlanBodySchema.safeParse({ date: '2026-06-20' });
        expect(parsed.success).toBe(true);
    });
});

// ── Block B — same schemas through the PRODUCTION pipeline (real HTTP 400 + redaction) ──
describe('plan-service input-bounds — out-of-bounds requests are rejected 400 (redacted) end-to-end', () => {
    let app: FastifyInstance;

    beforeAll(async () => {
        app = buildApp();
        await app.ready();
    });

    afterAll(async () => {
        await app.close();
    });

    // ── Rejection cases (each must 400 through the validator + shared handler) ──

    it('GET /v1/plans/:date rejects a malformed date param with a 400', async () => {
        const res = await app.inject({ method: 'GET', url: '/v1/plans/2026%2F06%2F20' });
        expect(res.statusCode).toBe(400);
    });

    it('GET /v1/plans/history rejects a reversed range (start after end) with a 400', async () => {
        const res = await app.inject({ method: 'GET', url: '/v1/plans/history?start=2026-06-30&end=2026-06-01' });
        expect(res.statusCode).toBe(400);
    });

    it('GET /v1/plans/history rejects a malformed start date with a 400', async () => {
        const res = await app.inject({ method: 'GET', url: '/v1/plans/history?start=nope&end=2026-06-30' });
        expect(res.statusCode).toBe(400);
    });

    it('POST /v1/plans/store rejects a non-uuid userId with a 400', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/plans/store',
            payload: validStoreBody({ userId: 'not-a-uuid' }),
        });
        expect(res.statusCode).toBe(400);
    });

    it('POST /v1/plans/store rejects a malformed date with a 400', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/plans/store',
            payload: validStoreBody({ date: '06-20-2026' }),
        });
        expect(res.statusCode).toBe(400);
    });

    it('POST /v1/plans/generate rejects a non-uuid shiftId with a 400', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/plans/generate',
            payload: validGenerateBody({ shiftId: 'not-a-uuid' }),
        });
        expect(res.statusCode).toBe(400);
    });

    it('POST /v1/plans/generate rejects a malformed date with a 400', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/plans/generate',
            payload: validGenerateBody({ date: '2026.06.20' }),
        });
        expect(res.statusCode).toBe(400);
    });

    // ── Redaction of the rejection body ─────────────────────────────────────────

    it('the reversed-range 400 body leaks NO stack / Prisma / DB-internals / fs-path (redacted)', async () => {
        const res = await app.inject({ method: 'GET', url: '/v1/plans/history?start=2026-06-30&end=2026-06-01' });
        expect(res.statusCode).toBe(400);
        expectRedacted400Body(res.body);
    });

    it('the malformed-date 400 body leaks NO internal detail (redacted)', async () => {
        const res = await app.inject({ method: 'GET', url: '/v1/plans/2026%2F06%2F20' });
        expect(res.statusCode).toBe(400);
        expectRedacted400Body(res.body);
    });

    it('the store-body 400 does NOT echo the leaky rejected input verbatim', async () => {
        // shiftType is unbounded copy; pair it with a bad uuid so the request is
        // rejected. If the error body ever echoed the input, LEAKY_SHIFT_TYPE
        // (and its leak signals) would appear — they must not.
        const res = await app.inject({
            method: 'POST',
            url: '/v1/plans/store',
            payload: validStoreBody({ userId: 'not-a-uuid', shiftType: LEAKY_SHIFT_TYPE }),
        });
        expect(res.statusCode).toBe(400);
        expect(res.body).not.toContain(LEAKY_SHIFT_TYPE);
        expectRedacted400Body(res.body);
    });

    it('the 400 body is the shared handler\'s fixed redacted shape (no raw zod issue JSON)', async () => {
        const res = await app.inject({ method: 'GET', url: '/v1/plans/history?start=2026-06-30&end=2026-06-01' });
        expect(res.statusCode).toBe(400);
        const json = res.json() as any;
        // Under the SHARED handler the ZodError has no `validation` flag, so it is
        // redacted to the fixed non-validation-4xx body — exactly as
        // history-error-wiring.routes.test.ts documents. The precise field path /
        // RANGE_REVERSED_MSG is asserted at the schema layer (Block A); here we
        // prove the WIRE body carries only { error, message, statusCode } and the
        // generic 'Bad request' message — no zod path, no field names leak.
        expect(json).toEqual({ error: 'ZodError', message: 'Bad request', statusCode: 400 });
        // RANGE_REVERSED_MSG is user-facing schema copy, but it MUST NOT survive on
        // the wire here because the shared handler redacted the issue detail.
        expect(res.body).not.toContain(RANGE_REVERSED_MSG);
    });

    // ── Valid / inclusive happy paths are NOT rejected (bounds only tighten) ────

    it('GET /v1/plans/:date with a valid YYYY-MM-DD param is NOT a 400 (200)', async () => {
        const res = await app.inject({ method: 'GET', url: '/v1/plans/2026-06-20' });
        expect(res.statusCode).toBe(200);
    });

    it('GET /v1/plans/history with NO params is NOT a 400 (200 — server-default behaviour preserved)', async () => {
        const res = await app.inject({ method: 'GET', url: '/v1/plans/history' });
        expect(res.statusCode).toBe(200);
    });

    it('GET /v1/plans/history with an equal start==end range is NOT a 400 (inclusive boundary)', async () => {
        const res = await app.inject({ method: 'GET', url: '/v1/plans/history?start=2026-06-15&end=2026-06-15' });
        expect(res.statusCode).toBe(200);
    });

    it('GET /v1/plans/history with a normal start<end range is NOT a 400', async () => {
        const res = await app.inject({ method: 'GET', url: '/v1/plans/history?start=2026-06-01&end=2026-06-30' });
        expect(res.statusCode).toBe(200);
    });

    it('POST /v1/plans/store with a well-formed body is NOT a 400 (201)', async () => {
        const res = await app.inject({ method: 'POST', url: '/v1/plans/store', payload: validStoreBody() });
        expect(res.statusCode).toBe(201);
    });

    it('POST /v1/plans/generate with a well-formed body is NOT a 400 (201)', async () => {
        const res = await app.inject({ method: 'POST', url: '/v1/plans/generate', payload: validGenerateBody() });
        expect(res.statusCode).toBe(201);
    });
});
