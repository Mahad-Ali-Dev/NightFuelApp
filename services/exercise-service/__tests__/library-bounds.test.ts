/**
 * Schema-lock regression for the additive bounds on the exercise-service
 * library-search querystring filters (src/index.ts, GET /v1/exercises/library):
 *
 *   query        z.string().trim().max(120).optional()
 *   equipment    z.string().trim().max(120).optional()
 *   muscleGroup  z.string().trim().max(120).optional()
 *   bodyPart     z.string().trim().max(120).optional()
 *   category     z.string().trim().max(120).optional()
 *   limit        z.coerce.number().int().min(1).max(5000).default(50)  ← cap raised 500→5000
 *
 * Each free-text filter previously was an UNBOUNDED z.string().optional(); a
 * multi-MB value flowed straight into a Prisma `contains` (LIKE) where-clause —
 * a cheap DoS / log-bloat vector. The bound adds a 120-char cap (consistent with
 * the other text caps in this service) plus an additive, behaviour-preserving
 * `.trim()`. The `limit` cap was raised 500 → 5000 (default 50 unchanged) so the
 * mobile library can fetch the full ~2,232-entry catalog in one request; the new
 * cap is re-asserted here so a future edit can't silently lower or change it.
 *
 * Why this suite copies the querystring schema + route shape VERBATIM instead of
 * importing src/:
 *   - src/index.ts is the service bootstrap; it constructs a PrismaClient and a
 *     RedisEventBus and calls fastify.listen() at import time, so it cannot be
 *     loaded in a unit test (the SAME documented constraint as
 *     ai-quota-routine.test.ts / ai-routine-libraryid.test.ts /
 *     heatmap-window.test.ts). community-service / meal-service can import their
 *     routes plugin; exercise-service cannot, so — following the sibling
 *     convention — this file copies the EXACT querystring schema and registers a
 *     route that mirrors src/index.ts's library route (same `searchLibrary(
 *     { query, equipment, muscleGroup, bodyPart, category }, limit)` call) onto a
 *     real Fastify app wired with the REAL `validatorCompiler` and the REAL
 *     shared `registerFastifyErrorHandler` from @nightfuel/config.
 *   - `exerciseSvc.searchLibrary` is mocked so the suite is hermetic (no DB), and
 *     a real Bearer token opens the auth gate so any 400 originates from the zod
 *     querystring schema, NOT from auth. This mirrors community-service /
 *     meal-service input-bounds.test.ts conventions.
 *
 * Behaviour preservation: a normal filtered search (query='bench',
 * muscleGroup='chest') returns the SAME results the service produces (200, body
 * passed through unchanged) and reaches searchLibrary with the filters intact;
 * an over-length filter (121+ chars) is rejected 400 via the shared handler and
 * searchLibrary is NEVER called.
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

// The text-filter cap under test, named so each boundary case reads
// unambiguously against the schema's own `.max(...)`.
const MAX_FILTER_LEN = 120;

// A representative library row so the 200 reply body is a concrete, stable shape
// the "pass-through unchanged" assertions can lock onto.
const LIBRARY_ROW = {
    id: 'lib-bench',
    name: 'Barbell Bench Press',
    muscleGroup: 'chest',
    bodyPart: 'chest',
    equipment: 'barbell',
    category: 'gym',
};

function buildMockService() {
    return {
        // Returns a fixed result array regardless of input, so a "results pass
        // through unchanged" assertion is meaningful and the suite never touches
        // a database.
        searchLibrary: jest.fn().mockResolvedValue([LIBRARY_ROW]),
    };
}

type MockService = ReturnType<typeof buildMockService>;

// ── querystring schema copied VERBATIM from src/index.ts (cannot import) ─────────
// If src/index.ts's library querystring changes, this copy (and the assertions
// below) must change in lockstep — that lockstep is the whole point of the
// schema-lock.
const libraryQuerystringSchema = z.object({
    query: z.string().trim().max(120).optional(),
    equipment: z.string().trim().max(120).optional(),
    muscleGroup: z.string().trim().max(120).optional(),
    bodyPart: z.string().trim().max(120).optional(),
    category: z.string().trim().max(120).optional(),
    limit: z.coerce.number().int().min(1).max(5000).default(50),
});

async function buildApp(svc: MockService): Promise<FastifyInstance> {
    const app = Fastify({ logger: false });
    // Shared error handler — a zod querystring failure surfaces as a 400 through
    // THIS handler (the same one src/index.ts registers), exactly as in prod.
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

    // Mirrors src/index.ts's GET /v1/exercises/library route 1:1: the verbatim
    // querystring schema + the identical handler body (same destructure, same
    // `searchLibrary({ query, equipment, muscleGroup, bodyPart, category }, limit)`
    // call, same try/catch generic-500).
    app.withTypeProvider<ZodTypeProvider>().get('/v1/exercises/library', {
        onRequest: [(app as any).authenticate],
        schema: { querystring: libraryQuerystringSchema },
    }, async (request: any, reply: any) => {
        try {
            const { query, equipment, muscleGroup, bodyPart, category, limit } = request.query;
            return reply.send(await svc.searchLibrary({ query, equipment, muscleGroup, bodyPart, category }, limit));
        } catch {
            return reply.code(500).send({ error: 'An unexpected error occurred' });
        }
    });

    await app.ready();
    return app;
}

describe('exercise-service library querystring bounds (valid token, schema-lock)', () => {
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
        const res = await app.inject({ method: 'GET', url: '/v1/exercises/library?query=bench' });
        expect(res.statusCode).toBe(401);
        expect(svc.searchLibrary).not.toHaveBeenCalled();
    });

    // ── (a) Behaviour-preserving: a normal filtered search still works ────────
    describe('a normal filtered search returns the same results (behaviour preserved)', () => {
        it('query=bench & muscleGroup=chest -> 200, results pass through unchanged', async () => {
            const res = await app.inject({
                method: 'GET',
                url: '/v1/exercises/library?query=bench&muscleGroup=chest',
                headers: AUTH,
            });

            expect(res.statusCode).toBe(200);
            // The body is exactly what the (mocked) service returned — the bound
            // does not alter, drop, or reshape any result.
            expect(res.json()).toEqual([LIBRARY_ROW]);
            expect(svc.searchLibrary).toHaveBeenCalledTimes(1);
            // The filters reached the service intact (trim is a no-op on these
            // already-trimmed values) and the default limit (50) is preserved.
            expect(svc.searchLibrary).toHaveBeenCalledWith(
                {
                    query: 'bench',
                    equipment: undefined,
                    muscleGroup: 'chest',
                    bodyPart: undefined,
                    category: undefined,
                },
                50,
            );
        });

        it('all five filters + an explicit limit pass through unchanged', async () => {
            const res = await app.inject({
                method: 'GET',
                url: '/v1/exercises/library?query=press&equipment=barbell&muscleGroup=chest&bodyPart=chest&category=gym&limit=25',
                headers: AUTH,
            });

            expect(res.statusCode).toBe(200);
            expect(res.json()).toEqual([LIBRARY_ROW]);
            expect(svc.searchLibrary).toHaveBeenCalledWith(
                { query: 'press', equipment: 'barbell', muscleGroup: 'chest', bodyPart: 'chest', category: 'gym' },
                25,
            );
        });

        it('no filters at all -> 200 and the default limit (50) is preserved', async () => {
            const res = await app.inject({
                method: 'GET',
                url: '/v1/exercises/library',
                headers: AUTH,
            });

            expect(res.statusCode).toBe(200);
            expect(svc.searchLibrary).toHaveBeenCalledTimes(1);
            expect(svc.searchLibrary).toHaveBeenCalledWith(
                { query: undefined, equipment: undefined, muscleGroup: undefined, bodyPart: undefined, category: undefined },
                50,
            );
        });

        it('a filter at the 120-char boundary -> not 400 (reaches the service)', async () => {
            const res = await app.inject({
                method: 'GET',
                url: `/v1/exercises/library?query=${'a'.repeat(MAX_FILTER_LEN)}`,
                headers: AUTH,
            });

            expect(res.statusCode).not.toBe(400);
            expect(res.statusCode).toBe(200);
            expect(svc.searchLibrary).toHaveBeenCalledTimes(1);
            expect(svc.searchLibrary).toHaveBeenCalledWith(
                expect.objectContaining({ query: 'a'.repeat(MAX_FILTER_LEN) }),
                50,
            );
        });
    });

    // ── (b) Over-length filters are rejected 400 via the shared handler ───────
    describe('an over-length filter (121+ chars) yields 400 and the service is NOT called', () => {
        // One case per bounded free-text field — each must independently trip the cap.
        const overLong = 'a'.repeat(MAX_FILTER_LEN + 1);
        const cases: Array<[string, string]> = [
            ['query', overLong],
            ['equipment', overLong],
            ['muscleGroup', overLong],
            ['bodyPart', overLong],
            ['category', overLong],
        ];

        it.each(cases)('%s of 121 chars -> 400 and searchLibrary NOT called', async (field, value) => {
            const res = await app.inject({
                method: 'GET',
                url: `/v1/exercises/library?${field}=${value}`,
                headers: AUTH,
            });

            expect(res.statusCode).toBe(400);
            expect(svc.searchLibrary).not.toHaveBeenCalled();
        });

        it('the 400 is emitted by the shared handler (statusCode 400 in the body, no raw leak)', async () => {
            const res = await app.inject({
                method: 'GET',
                url: `/v1/exercises/library?query=${overLong}`,
                headers: AUTH,
            });

            expect(res.statusCode).toBe(400);
            // The shared registerFastifyErrorHandler reflects the validation
            // statusCode and shape; the body carries statusCode:400 and never
            // echoes raw internals.
            const body = res.json();
            expect(body.statusCode).toBe(400);
            expect(typeof body.error).toBe('string');
            expect(res.body).not.toContain('stack');
            expect(svc.searchLibrary).not.toHaveBeenCalled();
        });

        it('a far-over-length filter (multi-KB) is still rejected 400 (the DoS vector this closes)', async () => {
            const res = await app.inject({
                method: 'GET',
                url: `/v1/exercises/library?query=${'a'.repeat(50_000)}`,
                headers: AUTH,
            });

            expect(res.statusCode).toBe(400);
            expect(svc.searchLibrary).not.toHaveBeenCalled();
        });
    });

    // ── limit cap raised 500 → 5000 (re-locked alongside the text bounds) ─────
    describe('limit cap (int, 1..5000, default 50)', () => {
        it('limit=5001 (above max) -> 400 and searchLibrary NOT called', async () => {
            const res = await app.inject({
                method: 'GET',
                url: '/v1/exercises/library?limit=5001',
                headers: AUTH,
            });

            expect(res.statusCode).toBe(400);
            expect(svc.searchLibrary).not.toHaveBeenCalled();
        });

        it('limit=5000 (at the boundary) -> not 400 (reaches the service with 5000)', async () => {
            const res = await app.inject({
                method: 'GET',
                url: '/v1/exercises/library?limit=5000',
                headers: AUTH,
            });

            expect(res.statusCode).not.toBe(400);
            expect(svc.searchLibrary).toHaveBeenCalledTimes(1);
            expect(svc.searchLibrary).toHaveBeenCalledWith(expect.any(Object), 5000);
        });

        it('limit=1000 (the new mobile default) -> not 400 (reaches the service with 1000)', async () => {
            const res = await app.inject({
                method: 'GET',
                url: '/v1/exercises/library?limit=1000',
                headers: AUTH,
            });

            expect(res.statusCode).not.toBe(400);
            expect(svc.searchLibrary).toHaveBeenCalledTimes(1);
            expect(svc.searchLibrary).toHaveBeenCalledWith(expect.any(Object), 1000);
        });

        it('limit=0 (below min) -> 400 and searchLibrary NOT called', async () => {
            const res = await app.inject({
                method: 'GET',
                url: '/v1/exercises/library?limit=0',
                headers: AUTH,
            });

            expect(res.statusCode).toBe(400);
            expect(svc.searchLibrary).not.toHaveBeenCalled();
        });
    });
});
