/**
 * Regression suite — shift-service INPUT-BOUNDS hardening (src/schemas.ts write
 * + list-query schemas), exercised end-to-end through the REAL validation
 * pipeline.
 *
 * This is the CONFIRM counterpart to the existing shift-service suites:
 *   - schemas.test.ts            calls the schemas DIRECTLY via safeParse.
 *   - list-shifts.routes.test.ts proves the WIRED GET /v1/shifts route enforces
 *     the bounded date-range schema (reversed / >366-day) before the DB.
 *   - error-redaction.test.ts    locks the SHARED 5xx/4xx redaction contract.
 *
 * None of them proves what THIS suite proves: that an out-of-range / over-long /
 * cross-field-invalid field is rejected with a real HTTP 400 *through the same
 * machinery the service wires in production* — `setValidatorCompiler(validatorCompiler)`
 * + `setSerializerCompiler(serializerCompiler)` from `fastify-type-provider-zod`
 * feeding the SHARED `registerFastifyErrorHandler` from `@nightfuel/config` —
 * using the REAL schema EXPORTS (no re-declaration), AND that the 400 body is
 * redacted (no stack, no Prisma/DB internals, no filesystem path), WHILE a
 * representative INCLUSIVE-boundary request still parses OK. In other words: the
 * bounds only tighten the rejected surface; they never change valid behaviour at
 * the boundary.
 *
 * Why we import the REAL schemas instead of re-declaring them (unlike the
 * sleep-service template, whose write schemas live inline in src/index.ts and
 * cannot be imported without booting the DB):
 *   - shift-service's bounds live in a standalone, side-effect-free module
 *     (src/schemas.ts) that opens NO DB/Redis at import time. So we import the
 *     genuine `createShiftSchema` / `updateShiftSchema` / `getShiftsRouteQuerySchema`
 *     and mount them — there is zero risk of the test drifting out of lockstep
 *     with production, because it IS the production schema under test.
 *
 * Why we mount a tiny app instead of importing src/index.ts:
 *   - The service bootstrap module (src/index.ts) opens real DB/Redis
 *     connections at import time and cannot be loaded in a unit test — the same
 *     constraint documented at the top of error-redaction.test.ts /
 *     list-shifts.routes.test.ts.
 *   - So we mount a Fastify app wired EXACTLY like src/index.ts's request path
 *     (same validator/serializer compilers, same shared error handler) and
 *     attach POST/PATCH/GET routes whose schemas are the REAL exports. The
 *     `authenticate` onRequest hook is intentionally omitted (auth is locked by
 *     the shared 401 guard / error-redaction suite, not here) so injected
 *     requests reach the validator directly without JWT plumbing — mirroring how
 *     list-shifts.routes.test.ts stubs auth to focus purely on the bound.
 *
 * On "redacted body" vs the Zod field path: a Zod validation failure surfaces a
 * 400 whose message names the offending field/rule — that is user-facing SCHEMA
 * copy and is intentionally preserved (it is how the client learns what to fix).
 * What MUST NOT appear is internal leakage: a stack trace, a stack-frame path
 * ("at /"), Prisma/DB-engine text, a DB connection-string fragment, or a server
 * filesystem path. The negative-match list below mirrors the sibling redaction
 * suites verbatim so the leak-signal surface is identical and grep-able across
 * services.
 */
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { registerFastifyErrorHandler } from '@nightfuel/config';
import { z } from 'zod';
import { ShiftType } from '@nightfuel/types';
import {
    createShiftSchema,
    updateShiftSchema,
    getShiftsRouteQuerySchema,
} from '../src/schemas';

// The documented commute cap (~10h), kept as a named constant so each boundary
// case reads unambiguously against the schema's own `.max(600)`.
const MAX_COMMUTE_MINUTES = 600;

// The documented date-range cap (~1 leap year). Mirrors MAX_QUERY_RANGE_DAYS in
// src/schemas.ts / @nightfuel/config so the boundary cases read against a named
// value, not a magic number.
const MAX_QUERY_RANGE_DAYS = 366;

// Returns the YYYY-MM-DD that is `n` whole days after the given YYYY-MM-DD,
// computed in UTC to match the schema's deterministic `+ 'T00:00:00.000Z'`
// parsing — no host-timezone drift. (Same helper as schemas.test.ts.)
function addUtcDays(date: string, n: number): string {
    const dt = new Date(date + 'T00:00:00.000Z');
    dt.setUTCDate(dt.getUTCDate() + n);
    return dt.toISOString().slice(0, 10);
}

// A deterministic, DB-free shift shape the valid-path POST handler echoes back.
// We only need a STABLE shape to prove the valid response is unchanged by the
// bounds; we don't touch Prisma. The handler returns this verbatim so the test
// can assert the exact keys + values.
const VALID_SHIFT = {
    id: '11111111-1111-1111-1111-111111111111',
    userId: 'user-1',
    shiftDate: '2026-06-17',
    startTime: '2026-06-17T09:00:00.000Z',
    endTime: '2026-06-17T17:00:00.000Z',
    shiftType: ShiftType.FIXED_NIGHT,
    isDayOff: false,
    commuteMinutes: 30,
};

// A leaky string we POST as a free-text-looking field on the rejected path. If
// the validator/handler ever echoed the rejected INPUT back in the error body,
// this internal-looking text would ride out — the negative matches prove it
// doesn't. Every fragment here is a known leak signal mirrored from the sibling
// redaction suites. (We attach it as `shiftDate`, which is also malformed for
// the YYYY-MM-DD regex, so it independently drives a 400.)
const LEAKY_BAD_INPUT =
    'Prisma at /app/src/shift.service.ts localhost:5432 /etc/passwd P2025 stack frame!!';

/**
 * Build a Fastify app wired EXACTLY like src/index.ts's request path:
 *   - validatorCompiler / serializerCompiler from fastify-type-provider-zod
 *   - the SHARED registerFastifyErrorHandler from @nightfuel/config (with a
 *     no-op logger so the handler's logger.error side effect stays quiet)
 *   - POST  /v1/shifts        { body: createShiftSchema }            → 201 + VALID_SHIFT
 *   - PATCH /v1/shifts/:id     { params: uuid, body: updateShiftSchema } → 200
 *   - GET   /v1/shifts         { querystring: getShiftsRouteQuerySchema } → 200
 * The route schemas are the REAL exports. The handlers do NO I/O — a rejected
 * request never reaches them (the validator short-circuits to the shared error
 * handler first), and an accepted request just echoes a fixed shape so valid
 * behaviour is observable.
 */
function buildApp(): FastifyInstance {
    const app = Fastify({ logger: false });
    const silentLogger = { error: () => {}, warn: () => {}, info: () => {} } as any;
    registerFastifyErrorHandler(app, silentLogger);
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);

    app.post('/v1/shifts', { schema: { body: createShiftSchema } }, async (_request, reply) => {
        // Valid body only — bounds rejected before we get here. Echo the fixed
        // shape so the test can assert the valid response is unchanged.
        return reply.code(201).send(VALID_SHIFT);
    });

    app.patch(
        '/v1/shifts/:id',
        { schema: { params: z.object({ id: z.string().uuid() }), body: updateShiftSchema } },
        async (request, reply) => {
            return reply.code(200).send({ ...VALID_SHIFT, ...(request.body as object) });
        }
    );

    app.get('/v1/shifts', { schema: { querystring: getShiftsRouteQuerySchema } }, async (_request, reply) => {
        // Valid range only — reversed / over-cap ranges rejected before we get
        // here. Echo a fixed empty list so the valid path is observable.
        return reply.code(200).send([]);
    });

    return app;
}

// Every fragment a redacted 400 body MUST NOT contain — identical leak-signal
// list to error-redaction.test.ts (and the sleep-service template) so the
// negative surface is uniform and easy to grep across services. NOTE: the Zod
// field NAME / rule is legitimate user-facing schema copy and is NOT in this
// list — only genuine internal-leak signals are.
const LEAK_SIGNALS = ['stack', 'at /', '/app/src', '/etc/passwd', 'Prisma', 'P2025', 'localhost', '5432'];

function expectRedacted400Body(body: string): void {
    for (const signal of LEAK_SIGNALS) {
        expect(body).not.toContain(signal);
    }
}

// A well-formed base create payload with endTime strictly after startTime and an
// in-bounds commute. Each rejection test clones-and-overrides only the field
// under examination so the *reason* a payload fails is never in doubt.
function baseCreate(overrides: Record<string, unknown> = {}) {
    return {
        shiftDate: '2026-06-17',
        startTime: '2026-06-17T09:00:00.000Z',
        endTime: '2026-06-17T17:00:00.000Z',
        shiftType: ShiftType.FIXED_NIGHT,
        isDayOff: false,
        commuteMinutes: 30,
        ...overrides,
    };
}

describe('shift-service input-bounds — out-of-range / cross-field-invalid fields are rejected 400 (redacted)', () => {
    let app: FastifyInstance;

    beforeAll(async () => {
        app = buildApp();
        await app.ready();
    });

    afterAll(async () => {
        await app.close();
    });

    // ── Rejection cases (each must 400 through the REAL schema + shared handler) ──

    it('POST /v1/shifts rejects negative commuteMinutes (-1) with a 400', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/shifts',
            payload: baseCreate({ commuteMinutes: -1 }),
        });
        expect(res.statusCode).toBe(400);
    });

    it('POST /v1/shifts rejects commuteMinutes above the 600 cap (601) with a 400', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/shifts',
            payload: baseCreate({ commuteMinutes: MAX_COMMUTE_MINUTES + 1 }),
        });
        expect(res.statusCode).toBe(400);
    });

    it('POST /v1/shifts rejects an absurd commuteMinutes (10_000_000) the old unbounded schema accepted', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/shifts',
            payload: baseCreate({ commuteMinutes: 10_000_000 }),
        });
        expect(res.statusCode).toBe(400);
    });

    it('POST /v1/shifts rejects endTime equal to startTime (must be strictly after) with a 400', async () => {
        const sameInstant = '2026-06-17T09:00:00.000Z';
        const res = await app.inject({
            method: 'POST',
            url: '/v1/shifts',
            payload: baseCreate({ startTime: sameInstant, endTime: sameInstant }),
        });
        expect(res.statusCode).toBe(400);
    });

    it('POST /v1/shifts rejects endTime before startTime with a 400', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/shifts',
            payload: baseCreate({
                startTime: '2026-06-17T17:00:00.000Z',
                endTime: '2026-06-17T09:00:00.000Z',
            }),
        });
        expect(res.statusCode).toBe(400);
    });

    it('PATCH /v1/shifts/:id rejects endTime <= startTime when BOTH are supplied with a 400', async () => {
        const res = await app.inject({
            method: 'PATCH',
            url: '/v1/shifts/11111111-1111-1111-1111-111111111111',
            payload: {
                startTime: '2026-06-17T17:00:00.000Z',
                endTime: '2026-06-17T09:00:00.000Z',
            },
        });
        expect(res.statusCode).toBe(400);
    });

    it('PATCH /v1/shifts/:id still caps commuteMinutes above 600 (601) on a partial update with a 400', async () => {
        const res = await app.inject({
            method: 'PATCH',
            url: '/v1/shifts/11111111-1111-1111-1111-111111111111',
            payload: { commuteMinutes: MAX_COMMUTE_MINUTES + 1 },
        });
        expect(res.statusCode).toBe(400);
    });

    it('GET /v1/shifts rejects a reversed range (end before start) with a 400', async () => {
        const res = await app.inject({
            method: 'GET',
            url: '/v1/shifts?start=2026-06-30&end=2026-06-01',
        });
        expect(res.statusCode).toBe(400);
    });

    it('GET /v1/shifts rejects a span just over the 366-day cap (start + 367 days) with a 400', async () => {
        const start = '2026-06-01';
        const res = await app.inject({
            method: 'GET',
            url: `/v1/shifts?start=${start}&end=${addUtcDays(start, MAX_QUERY_RANGE_DAYS + 1)}`,
        });
        expect(res.statusCode).toBe(400);
    });

    it('GET /v1/shifts rejects an absurd multi-decade range (> 366 days) the old unbounded schema accepted', async () => {
        const res = await app.inject({
            method: 'GET',
            url: '/v1/shifts?start=2000-01-01&end=2030-01-01',
        });
        expect(res.statusCode).toBe(400);
    });

    // ── Redaction of the rejection body ─────────────────────────────────────────

    it('the 400 body leaks NO stack / Prisma / DB-internals / fs-path (redacted)', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/shifts',
            // The internal-looking, malformed `shiftDate` is the rejected input;
            // if the error body ever echoed the input verbatim, these signals
            // would appear — they must not.
            payload: baseCreate({ shiftDate: LEAKY_BAD_INPUT }),
        });
        expect(res.statusCode).toBe(400);
        expectRedacted400Body(res.body);
    });

    it('the 400 body does NOT contain the literal leaky rejected input', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/shifts',
            payload: baseCreate({ shiftDate: LEAKY_BAD_INPUT }),
        });
        expect(res.body).not.toContain(LEAKY_BAD_INPUT);
    });

    it('the 400 body is well-formed JSON carrying a 400 statusCode (shared-handler shape)', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/shifts',
            payload: baseCreate({ commuteMinutes: MAX_COMMUTE_MINUTES + 1 }),
        });
        expect(res.statusCode).toBe(400);
        const json = res.json();
        // The shared handler reflects a genuine validation error's message but
        // pins statusCode to 400 and exposes only { error, message, statusCode }.
        expect(json.statusCode).toBe(400);
        expect(typeof json.message).toBe('string');
        expect(Object.keys(json).sort()).toEqual(['error', 'message', 'statusCode']);
    });

    // ── INCLUSIVE-boundary acceptance (the bounds only tighten the rejected set) ──

    it('POST /v1/shifts accepts commuteMinutes exactly 0 (lower inclusive bound) with 201', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/shifts',
            payload: baseCreate({ commuteMinutes: 0 }),
        });
        expect(res.statusCode).toBe(201);
        expect(res.json()).toEqual(VALID_SHIFT);
    });

    it('POST /v1/shifts accepts commuteMinutes exactly 600 (upper inclusive bound) with 201', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/shifts',
            payload: baseCreate({ commuteMinutes: MAX_COMMUTE_MINUTES }),
        });
        // The upper edge is INCLUSIVE — it must pass, proving the bound is
        // `<= 600`, not `< 600` (valid behaviour preserved at the boundary).
        expect(res.statusCode).toBe(201);
    });

    it('POST /v1/shifts accepts endTime exactly one ms after startTime with 201', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/shifts',
            payload: baseCreate({
                startTime: '2026-06-17T09:00:00.000Z',
                endTime: '2026-06-17T09:00:00.001Z',
            }),
        });
        // endTime > startTime is satisfied by a single millisecond — the strict
        // inequality must accept the smallest valid gap.
        expect(res.statusCode).toBe(201);
    });

    it('PATCH /v1/shifts/:id accepts a single-field commuteMinutes patch (no endTime>startTime invariant when a time is absent) with 200', async () => {
        const res = await app.inject({
            method: 'PATCH',
            url: '/v1/shifts/11111111-1111-1111-1111-111111111111',
            payload: { commuteMinutes: 45 },
        });
        // A partial patch with neither time present must NOT trip the cross-field
        // refine — it can only run when BOTH times are supplied.
        expect(res.statusCode).toBe(200);
        expect(res.json().commuteMinutes).toBe(45);
    });

    it('GET /v1/shifts accepts a span of exactly 366 days (upper inclusive bound) with 200', async () => {
        const start = '2026-06-01';
        const res = await app.inject({
            method: 'GET',
            url: `/v1/shifts?start=${start}&end=${addUtcDays(start, MAX_QUERY_RANGE_DAYS)}`,
        });
        // The 366-day span is INCLUSIVE — it must pass, proving the cap is
        // `<= 366`, not `< 366`.
        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual([]);
    });

    it('GET /v1/shifts accepts a normal one-month range with 200 (bound does not over-reject)', async () => {
        const res = await app.inject({
            method: 'GET',
            url: '/v1/shifts?start=2026-06-01&end=2026-06-30',
        });
        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual([]);
    });
});
