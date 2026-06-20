/**
 * Regression suite — decision-engine INPUT-BOUNDS hardening
 * (src/routes.ts `BoundedDecisionInputSchema`, exercised end-to-end through the
 * REAL validation pipeline that POST /v1/decision/compute-params wires in
 * production).
 *
 * This is deliberately separate from error-redaction.test.ts, which locks the
 * SHARED 5xx/4xx redaction contract on three synthetic throwing routes. None of
 * those routes proves what THIS suite proves: that an out-of-range / over-long /
 * NaN / unknown-field / oversized-array request to the compute-params route is
 * rejected with a real HTTP 400 *through the same machinery the service wires in
 * production* — `setValidatorCompiler(validatorCompiler)` +
 * `setSerializerCompiler(serializerCompiler)` from `fastify-type-provider-zod`
 * feeding the SHARED `registerFastifyErrorHandler` from `@nightfuel/config` —
 * AND that the 400 body is redacted (no stack, no Prisma/DB internals, no
 * filesystem path, and no echo of the rejected input), WHILE a representative
 * valid request still succeeds with the exact engine output it produced before
 * the bounds existed. In other words: the bounds only tighten the rejected
 * surface; they never change valid behaviour.
 *
 * Why mount a tiny app instead of importing src/index.ts:
 *   - The service bootstrap module (src/index.ts) calls fastify.listen() at
 *     import time and cannot be loaded in a unit test — the same constraint
 *     documented at the top of error-redaction.test.ts.
 *   - So we mount a Fastify app wired EXACTLY like src/index.ts's request path
 *     (same validator/serializer compilers, same shared error handler) and
 *     attach the SAME route handler shape src/routes.ts registers, importing the
 *     EXACT `BoundedDecisionInputSchema` the route validates against (no schema
 *     drift between test and runtime) and the REAL, pure `DecisionEngine` so the
 *     valid path runs the same deterministic computation as production.
 *
 * On "redacted body" vs the Zod field path: a Zod validation failure surfaces a
 * 400 whose Fastify message names the offending field path and the rule it broke
 * (e.g. ".../userId ... at most 128 character(s)") — that is user-facing SCHEMA
 * copy and is intentionally preserved (it is how the client learns what to fix).
 * What MUST NOT appear is internal leakage: a stack trace, a stack-frame path
 * ("at /"), Prisma/DB-engine text, a DB connection-string fragment, a server
 * filesystem path, OR the rejected input VALUE echoed back. The negative-match
 * list below mirrors the sibling redaction suites verbatim so the leak-signal
 * surface is identical and grep-able across services.
 *
 * decision-engine runs vitest WITHOUT globals, so describe/it/expect/beforeAll/
 * afterAll are imported explicitly (same as error-redaction.test.ts).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { registerFastifyErrorHandler } from '@nightfuel/config';
import { DecisionEngine } from '../src/engine';
import { BoundedDecisionInputSchema } from '../src/routes';

// A representative, fully in-range request — exactly what a well-formed client
// sends today. Used to prove the valid path is unchanged by the bounds.
const VALID_INPUT = {
    userState: {
        userId: 'user-1',
        currentWeightKg: 80,
        last7DaysAdherence: 0.9,
        avgSleepQuality: 8,
        fatigueLevel: 4,
        currentCalorieTarget: 2500,
        currentProteinTargetG: 180,
        trainingPhase: 'HYPERTROPHY' as const,
        cycleWeek: 2,
    },
    goal: 'MUSCLE_GAIN' as const,
};

// A leaky string we POST as the over-long `userId`. If the validator/handler ever
// echoed the rejected INPUT back in the error body, this internal-looking text
// would ride out — the negative matches prove it does not. It is >128 chars so it
// also drives the userId length-cap rejection. Every fragment is a known leak
// signal mirrored from the sibling redaction suites.
const LEAKY_OVERLONG_USER_ID =
    'Prisma at /app/src/engine.ts localhost:5432 /etc/passwd P2025 stack frame ' +
    'x'.repeat(120);

// Every fragment a redacted 400 body MUST NOT contain — identical leak-signal
// list to error-redaction.test.ts so the negative surface is uniform and easy to
// grep across services. NOTE: a Zod field PATH (e.g. "userId") is legitimate
// user-facing schema copy and is NOT in this list — only genuine internal-leak
// signals are.
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
 *   - POST /v1/decision/compute-params { body: BoundedDecisionInputSchema }
 *     → runs the REAL pure DecisionEngine and returns its output (mirrors
 *     src/routes.ts exactly). A rejected request never reaches the handler — the
 *     validator short-circuits to the shared error handler first.
 */
function buildApp(): FastifyInstance {
    const app = Fastify({ logger: false });
    const silentLogger = { error: () => {}, warn: () => {}, info: () => {} } as any;
    registerFastifyErrorHandler(app, silentLogger);
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);

    const engine = new DecisionEngine();
    app.withTypeProvider<ZodTypeProvider>().post(
        '/v1/decision/compute-params',
        { schema: { body: BoundedDecisionInputSchema } },
        async (request, reply) => {
            return reply.send(engine.computeParams(request.body));
        },
    );

    return app;
}

describe('decision-engine input-bounds — out-of-range / over-long / unknown-field / oversized-array input is rejected 400 (redacted)', () => {
    let app: FastifyInstance;

    beforeAll(async () => {
        app = buildApp();
        await app.ready();
    });

    afterAll(async () => {
        await app.close();
    });

    // ── Rejection cases (each must 400 through the validator + shared handler) ──

    it('rejects adherence above the 0..1 range (last7DaysAdherence: 5) with a 400', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/decision/compute-params',
            payload: { ...VALID_INPUT, userState: { ...VALID_INPUT.userState, last7DaysAdherence: 5 } },
        });
        expect(res.statusCode).toBe(400);
    });

    it('rejects avgSleepQuality above the 1..10 range (99) with a 400', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/decision/compute-params',
            payload: { ...VALID_INPUT, userState: { ...VALID_INPUT.userState, avgSleepQuality: 99 } },
        });
        expect(res.statusCode).toBe(400);
    });

    it('rejects a non-finite metric (currentCalorieTarget: Infinity is not valid JSON → null → 400)', async () => {
        // JSON has no Infinity literal; a real client cannot send a bare Infinity.
        // We assert the SCHEMA rejects it directly (z.number().max() rejects
        // ±Infinity and NaN), proving the bound closes the non-finite vector.
        const parsed = BoundedDecisionInputSchema.safeParse({
            ...VALID_INPUT,
            userState: { ...VALID_INPUT.userState, currentCalorieTarget: Infinity },
        });
        expect(parsed.success).toBe(false);
    });

    it('rejects a NaN metric (fatigueLevel: NaN) at the schema level', async () => {
        const parsed = BoundedDecisionInputSchema.safeParse({
            ...VALID_INPUT,
            userState: { ...VALID_INPUT.userState, fatigueLevel: NaN },
        });
        expect(parsed.success).toBe(false);
    });

    it('rejects an unknown extra field on userState (.strict) with a 400', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/decision/compute-params',
            payload: { ...VALID_INPUT, userState: { ...VALID_INPUT.userState, isAdmin: true } },
        });
        expect(res.statusCode).toBe(400);
    });

    it('rejects an unknown extra top-level field (.strict) with a 400', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/decision/compute-params',
            payload: { ...VALID_INPUT, injected: { drop: 'table' } },
        });
        expect(res.statusCode).toBe(400);
    });

    it('rejects an over-cap planHistory array (oversized payload) with a 400', async () => {
        const planHistory = Array.from({ length: 500 }, () => ({
            date: '2026-06-17T22:30:00.000Z',
            adherence: true,
        }));
        const res = await app.inject({
            method: 'POST',
            url: '/v1/decision/compute-params',
            payload: { ...VALID_INPUT, planHistory },
        });
        expect(res.statusCode).toBe(400);
    });

    it('rejects an invalid (non-ISO) planHistory date with a 400', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/decision/compute-params',
            payload: {
                ...VALID_INPUT,
                planHistory: [{ date: 'not-a-timestamp', adherence: true }],
            },
        });
        expect(res.statusCode).toBe(400);
    });

    it('rejects an over-long userId (length cap) with a 400', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/decision/compute-params',
            payload: { ...VALID_INPUT, userState: { ...VALID_INPUT.userState, userId: LEAKY_OVERLONG_USER_ID } },
        });
        expect(res.statusCode).toBe(400);
    });

    it('rejects an unrecognised trainingPhase enum value with a 400', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/decision/compute-params',
            payload: { ...VALID_INPUT, userState: { ...VALID_INPUT.userState, trainingPhase: 'YOLO' } },
        });
        expect(res.statusCode).toBe(400);
    });

    // ── Redaction of the rejection body ─────────────────────────────────────────

    it('the 400 body leaks NO stack / Prisma / DB-internals / fs-path (redacted)', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/decision/compute-params',
            // The over-long, internal-looking userId is the rejected input; if the
            // error body ever echoed the input verbatim, these signals would
            // appear — they must not.
            payload: { ...VALID_INPUT, userState: { ...VALID_INPUT.userState, userId: LEAKY_OVERLONG_USER_ID } },
        });
        expect(res.statusCode).toBe(400);
        expectRedacted400Body(res.body);
    });

    it('the 400 body does NOT contain the literal leaky rejected input', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/decision/compute-params',
            payload: { ...VALID_INPUT, userState: { ...VALID_INPUT.userState, userId: LEAKY_OVERLONG_USER_ID } },
        });
        expect(res.body).not.toContain(LEAKY_OVERLONG_USER_ID);
    });

    it('the 400 body is well-formed JSON carrying a 400 statusCode (shared-handler shape)', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/decision/compute-params',
            payload: { ...VALID_INPUT, userState: { ...VALID_INPUT.userState, avgSleepQuality: 99 } },
        });
        expect(res.statusCode).toBe(400);
        const json = res.json();
        // The shared handler reflects a genuine validation error's message but
        // pins statusCode to 400 and exposes only { error, message, statusCode }.
        expect(json.statusCode).toBe(400);
        expect(typeof json.message).toBe('string');
        expect(Object.keys(json).sort()).toEqual(['error', 'message', 'statusCode']);
    });

    // ── Valid behaviour is UNCHANGED (the bounds only tighten the rejected set) ──

    it('a representative valid request still succeeds 200 with the engine output it produced before', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/decision/compute-params',
            payload: VALID_INPUT,
        });
        expect(res.statusCode).toBe(200);
        // The bounded route runs the SAME pure engine the loose route did, so the
        // output must equal a direct engine call on the same input — proving the
        // bounds changed nothing for valid input.
        const expected = new DecisionEngine().computeParams(VALID_INPUT);
        expect(res.json()).toEqual(expected);
    });

    it('a valid request at the exact bound edges (adherence 1, sleep/fatigue 10, userId 128 chars) still succeeds 200', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/decision/compute-params',
            payload: {
                ...VALID_INPUT,
                userState: {
                    ...VALID_INPUT.userState,
                    userId: 'u'.repeat(128),
                    last7DaysAdherence: 1,
                    avgSleepQuality: 10,
                    fatigueLevel: 10,
                },
            },
        });
        // The boundaries are INCLUSIVE — they must pass (the bound is `<= max` /
        // `>= min`, not strict), so valid behaviour is preserved at the edge.
        expect(res.statusCode).toBe(200);
    });

    it('a valid request with a bounded planHistory still succeeds 200', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/decision/compute-params',
            payload: {
                ...VALID_INPUT,
                planHistory: [
                    { date: '2026-06-17T22:30:00.000Z', adherence: true, weightKg: 80 },
                    { date: '2026-06-18T22:30:00.000Z', adherence: false },
                ],
            },
        });
        expect(res.statusCode).toBe(200);
    });
});
