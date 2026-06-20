/**
 * Regression suite — state-service INPUT-BOUNDS hardening on the
 * GET /v1/state/:userId path param (src/index.ts), exercised end-to-end through
 * the REAL validation pipeline.
 *
 * This is deliberately separate from the existing error-redaction.test.ts
 * (which locks the SHARED 5xx redaction contract). Neither that suite nor any
 * other proves what THIS one proves: that an over-long / empty `:userId` is
 * rejected with a real HTTP 400 *through the same machinery the service wires in
 * production* — `setValidatorCompiler(validatorCompiler)` +
 * `setSerializerCompiler(serializerCompiler)` from `fastify-type-provider-zod`
 * feeding the SHARED `registerFastifyErrorHandler` from `@nightfuel/config` —
 * BEFORE the param ever reaches Prisma's unbounded `findUnique`, WHILE a valid
 * id still flows to the handler unchanged (here, a DB-free 404 path). In other
 * words: the bound only tightens the rejected surface; it never changes valid
 * behaviour. The 400 body is also asserted redacted (no stack/Prisma/DB/fs
 * internals), mirroring the sibling redaction suites.
 *
 * Why we mount a tiny app instead of importing src/index.ts:
 *   - The service bootstrap module (src/index.ts) opens real DB/Redis
 *     connections at import time and cannot be loaded in a unit test — the same
 *     constraint documented at the top of error-redaction.test.ts.
 *   - So we mount a Fastify app wired EXACTLY like src/index.ts's request path
 *     (same validator/serializer compilers, same shared error handler) and
 *     attach the GET /v1/state/:userId route with the param schema copied
 *     verbatim from src/index.ts. The handler does NO real I/O — for a valid id
 *     it returns the same 404 the production handler returns when no state row
 *     exists, so the valid path is observable without a database.
 *
 * On "redacted body" vs the Zod field path: a Zod validation failure surfaces a
 * 400 whose message names the offending field ("userId") and the rule it broke
 * — that is user-facing SCHEMA copy and is intentionally preserved. What MUST
 * NOT appear is internal leakage: a stack trace, a stack-frame path ("at /"),
 * Prisma/DB-engine text, a DB connection-string fragment, or a server fs path.
 * The negative-match list mirrors the sibling redaction suites verbatim.
 */
import Fastify, { FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { registerFastifyErrorHandler } from '@nightfuel/config';
import { z } from 'zod';

// ── Schema copied verbatim from src/index.ts (cannot import — see header) ───────
// Keep this byte-for-byte in lockstep with the GET /v1/state/:userId route.
const userIdParamsSchema = z.object({ userId: z.string().min(1).max(64) });

// An over-long, internal-looking id: > the 64 cap AND carrying known leak
// signals. It MUST be a single URL path segment (no `/`), otherwise the extra
// segments wouldn't match the `:userId` route and Fastify would 404 as no-route
// instead of handing an over-long param to the validator. So we use the
// slash-free leak tokens (Prisma, localhost:5432, P2025, stack, passwd); if the
// validator/handler ever echoed the rejected INPUT back in the error body, this
// internal-looking text would ride out — the negative matches below prove it
// doesn't.
const LEAKY_OVERLONG_ID =
    'Prisma_localhost:5432_P2025_stack_frame_passwd_padding_padding_padding_padding!';

/**
 * Build a Fastify app wired EXACTLY like src/index.ts's request path:
 *   - validatorCompiler / serializerCompiler from fastify-type-provider-zod
 *   - the SHARED registerFastifyErrorHandler from @nightfuel/config (no-op
 *     logger so the handler's logger.error side effect stays quiet)
 *   - GET /v1/state/:userId { params: userIdParamsSchema }
 * A rejected param never reaches the handler (the validator short-circuits to
 * the shared error handler first); a valid id reaches the handler, which — with
 * no DB wired — returns the SAME 404 the production handler returns when no
 * state row exists. No Prisma is touched.
 */
function buildApp(): FastifyInstance {
    const app = Fastify({ logger: false });
    const silentLogger = { error: () => {}, warn: () => {}, info: () => {} } as any;
    registerFastifyErrorHandler(app, silentLogger);
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);

    app.get('/v1/state/:userId', { schema: { params: userIdParamsSchema } }, async (request, reply) => {
        // Mirrors src/index.ts: a valid id with no state row → 404. We do not
        // touch Prisma here; the bound is the unit under test, and the valid
        // path is observable via this fixed not-found shape.
        const { userId } = request.params as { userId: string };
        void userId;
        return reply.status(404).send({ error: 'User state not found' });
    });

    return app;
}

// Every fragment a redacted 400 body MUST NOT contain — identical leak-signal
// list to error-redaction.test.ts so the negative surface is uniform and
// grep-able across services. The Zod field NAME ("userId") is legitimate
// user-facing schema copy and is NOT in this list.
const LEAK_SIGNALS = ['stack', 'at /', '/app/src', '/etc/passwd', 'Prisma', 'P2025', 'localhost', '5432'];

function expectRedacted400Body(body: string): void {
    for (const signal of LEAK_SIGNALS) {
        expect(body).not.toContain(signal);
    }
}

describe('state-service input-bounds — GET /v1/state/:userId param is bounded before Prisma', () => {
    let app: FastifyInstance;

    beforeAll(async () => {
        app = buildApp();
        await app.ready();
    });

    afterAll(async () => {
        await app.close();
    });

    // ── Rejection cases (each must 400 through the validator + shared handler) ──

    it('rejects a 65-char userId (one over the 64 cap) with a 400', async () => {
        const res = await app.inject({ method: 'GET', url: `/v1/state/${'a'.repeat(65)}` });
        expect(res.statusCode).toBe(400);
    });

    it('rejects an 80-char leaky userId with a 400', async () => {
        const res = await app.inject({ method: 'GET', url: `/v1/state/${LEAKY_OVERLONG_ID}` });
        expect(res.statusCode).toBe(400);
    });

    it('rejects an empty userId at the schema level (min(1)) — JSON/route cannot carry a bare empty path segment', () => {
        // `GET /v1/state/` does not MATCH the :userId route (it 404s as no-route,
        // not via the validator), so to prove the `.min(1)` bound itself we
        // safeParse an empty value through the exact route schema — the same
        // technique sleep-service/input-bounds.test.ts uses for inputs the wire
        // cannot carry (e.g. a bare NaN).
        const parsed = userIdParamsSchema.safeParse({ userId: '' });
        expect(parsed.success).toBe(false);
    });

    // ── Redaction of the rejection body ─────────────────────────────────────────

    it('the 400 body leaks NO stack / Prisma / DB-internals / fs-path (redacted)', async () => {
        const res = await app.inject({ method: 'GET', url: `/v1/state/${LEAKY_OVERLONG_ID}` });
        expect(res.statusCode).toBe(400);
        expectRedacted400Body(res.body);
    });

    it('the 400 body does NOT contain the literal leaky rejected id', async () => {
        const res = await app.inject({ method: 'GET', url: `/v1/state/${LEAKY_OVERLONG_ID}` });
        expect(res.body).not.toContain(LEAKY_OVERLONG_ID);
    });

    it('the 400 body is well-formed JSON carrying a 400 statusCode (shared-handler shape)', async () => {
        const res = await app.inject({ method: 'GET', url: `/v1/state/${'a'.repeat(65)}` });
        expect(res.statusCode).toBe(400);
        const json = res.json();
        expect(json.statusCode).toBe(400);
        expect(typeof json.message).toBe('string');
        expect(Object.keys(json).sort()).toEqual(['error', 'message', 'statusCode']);
    });

    // ── Valid behaviour is UNCHANGED (the bound only tightens the rejected set) ──

    it('a valid userId flows past the validator to the handler (404 not-found path works)', async () => {
        const res = await app.inject({ method: 'GET', url: '/v1/state/user-1' });
        // Reached the handler (not a 400): the DB-free handler returns the same
        // 404 the production handler returns when no state row exists.
        expect(res.statusCode).toBe(404);
        expect(res.json()).toEqual({ error: 'User state not found' });
    });

    it('a valid userId at the exact 64-char upper edge still passes the validator (inclusive bound)', async () => {
        const res = await app.inject({ method: 'GET', url: `/v1/state/${'a'.repeat(64)}` });
        // The upper edge is INCLUSIVE — it must NOT 400 (proves the bound is
        // `<= 64`, not `< 64`). With no row it reaches the handler's 404.
        expect(res.statusCode).toBe(404);
    });
});
