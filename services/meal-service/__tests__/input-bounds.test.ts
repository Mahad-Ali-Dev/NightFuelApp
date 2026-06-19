/**
 * Schema-lock regression for the input bounds hardened on meal-service's
 * previously-unbounded WRITE/QUERY inputs (src/routes.ts + src/schemas.ts):
 *
 *   GET  /search        region / foodGroup    z.string().max(120)
 *   POST /recipes       description           z.string().max(2000)
 *   POST /recipes       ingredients[]         z.array(...).max(100)
 *   POST /recipes       ingredient.name       z.string().min(1).max(200)
 *   POST /recipes       ingredient.amount     z.string().min(1).max(60)
 *   POST /recipes       ingredient.unit       z.string().max(40)
 *   POST /recipes       instructions[]        z.array(z.string().min(1).max(1000)).max(100)
 *   POST /recipes       tags[]                z.array(z.string().max(60)).max(50)
 *   POST /log           foodItems[].name      z.string().min(1).max(200)
 *
 * Every request below carries a VALID Bearer token, so the auth gate is open and
 * any 400 originates from the zod schema, NOT from auth. We additionally assert
 * the service mock is NOT invoked on a rejected (400) request — proving the
 * validation short-circuits before the service layer runs — and that a
 * representative VALID payload for each newly-bounded field still reaches the
 * service unchanged.
 *
 * The third block locks the redaction contract: an internal throw from the
 * service layer flows through the SHARED `registerFastifyErrorHandler`
 * (@nightfuel/config) and yields ONLY the fixed generic 5xx body — no raw
 * err.message / stack escapes. Mirrors the LEAKY_THROWN_MESSAGE negative-match
 * pattern in error-redaction.test.ts.
 *
 * Isolation: only `mealRoutes` (src/routes.ts) is imported — never src/index.ts,
 * whose bootstrap opens real DB/Redis at import time. `authenticate` is decorated
 * here exactly the way index.ts wires it (a JWT verify), using a real Bearer
 * token so the gate is genuinely exercised, matching community-service's
 * input-bounds.test.ts conventions.
 */
import Fastify, { FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { registerFastifyErrorHandler } from '@nightfuel/config';
import jwt from 'jsonwebtoken';
import { mealRoutes } from '../src/routes';

const JWT_SECRET = 'test-jwt-secret-at-least-32-chars-long-000';
const USER_ID = '44444444-4444-4444-8444-444444444444';
const VALID = jwt.sign({ id: USER_ID }, JWT_SECRET, { expiresIn: '1h' });
const AUTH = { authorization: `Bearer ${VALID}` };

// Caps under test, kept as named constants so each boundary case reads
// unambiguously against the schema's own `.max(...)`.
const MAX_FILTER_LEN = 120;
const MAX_RECIPE_DESC_LEN = 2000;
const MAX_INGREDIENTS = 100;
const MAX_INGREDIENT_NAME_LEN = 200;
const MAX_INGREDIENT_AMOUNT_LEN = 60;
const MAX_INGREDIENT_UNIT_LEN = 40;
const MAX_INSTRUCTIONS = 100;
const MAX_INSTRUCTION_LEN = 1000;
const MAX_TAGS = 50;
const MAX_FOOD_NAME_LEN = 200;

// Every substring in this leaky message is an attack signal the 5xx redactor
// MUST strip. Same string used across the per-service redaction suites.
const LEAKY_THROWN_MESSAGE =
    'Prisma raw stack frame at /etc/passwd localhost:5432';

// A row matching logMealResponseSchema so the 201 reply serializes cleanly on
// the valid path (the route's response schema validates the send body).
function mealLogRow() {
    return {
        id: 'meal-log-1',
        userId: USER_ID,
        loggedAt: new Date('2026-06-20T12:00:00.000Z'),
        mealType: 'BREAKFAST',
        totalCalories: 150,
        totalProtein: 5,
        totalCarbs: 27,
        totalFat: 3,
        isAdherent: true,
    };
}

function buildMockService() {
    return {
        searchFoods: jest.fn().mockResolvedValue([]),
        getFoodById: jest.fn().mockResolvedValue(null),
        listFoodGroups: jest.fn().mockResolvedValue([]),
        logMeal: jest.fn().mockResolvedValue(mealLogRow()),
        getMealLogs: jest.fn().mockResolvedValue([]),
        generateGroceryList: jest.fn().mockResolvedValue({ userId: USER_ID, planId: 'p', date: 'd', list: [] }),
        getRecipes: jest.fn().mockResolvedValue([]),
        getRecipe: jest.fn().mockResolvedValue(null),
        createRecipe: jest.fn().mockResolvedValue({ id: 'recipe-1', title: 'ok' }),
        getFastingLogs: jest.fn().mockResolvedValue([]),
        startFasting: jest.fn().mockResolvedValue({ id: 'fast-1' }),
        endFasting: jest.fn().mockResolvedValue({ id: 'fast-1' }),
    };
}

type MockService = ReturnType<typeof buildMockService>;

async function buildApp(svc: MockService): Promise<FastifyInstance> {
    const app = Fastify({ logger: false });
    // Shared error handler — drives the redaction contract on internal throws.
    const silentLogger = { error: () => {}, warn: () => {}, info: () => {} } as any;
    registerFastifyErrorHandler(app, silentLogger);

    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);

    // `mealRoutes` itself does NOT decorate `authenticate` (src/index.ts does);
    // wire it here the same way — a JWT verify with a 401 on failure — so the
    // gate is real and `request.user` is populated for /log.
    app.decorate('authenticate', async (request: any, reply: any) => {
        try {
            const token = (request.headers.authorization as string | undefined)?.replace('Bearer ', '');
            if (!token) throw new Error('Missing token');
            request.user = jwt.verify(token, JWT_SECRET);
        } catch {
            return reply.code(401).send({ error: 'Unauthorized' });
        }
    });

    await app.register(mealRoutes as any, { mealService: svc as any });
    await app.ready();
    return app;
}

// A representative, fully in-bounds recipe body. Tests clone-and-override only
// the field under examination so the reason a payload passes or fails is never
// in doubt.
function baseRecipe(overrides: Record<string, unknown> = {}) {
    return {
        title: 'Overnight Oats',
        description: 'A simple make-ahead breakfast.',
        ingredients: [{ name: 'Rolled oats', amount: '1/2', unit: 'cup' }],
        instructions: ['Combine oats and milk.', 'Refrigerate overnight.'],
        tags: ['breakfast', 'vegan'],
        ...overrides,
    };
}

describe('meal-service input bounds (valid token, schema-lock)', () => {
    let app: FastifyInstance;
    let svc: MockService;

    beforeEach(async () => {
        svc = buildMockService();
        app = await buildApp(svc);
    });

    afterEach(async () => {
        await app.close();
    });

    // ── GET /search — region / foodGroup .max(120) ───────────────────────────
    describe('GET /search region/foodGroup bound (max 120)', () => {
        it('region of 121 chars -> 400 and searchFoods NOT called', async () => {
            const res = await app.inject({
                method: 'GET',
                url: `/search?q=apple&region=${'a'.repeat(MAX_FILTER_LEN + 1)}`,
                headers: AUTH,
            });
            expect(res.statusCode).toBe(400);
            expect(svc.searchFoods).not.toHaveBeenCalled();
        });

        it('foodGroup of 121 chars -> 400 and searchFoods NOT called', async () => {
            const res = await app.inject({
                method: 'GET',
                url: `/search?q=apple&foodGroup=${'a'.repeat(MAX_FILTER_LEN + 1)}`,
                headers: AUTH,
            });
            expect(res.statusCode).toBe(400);
            expect(svc.searchFoods).not.toHaveBeenCalled();
        });

        it('representative region/foodGroup (well within 120) -> 200 and searchFoods called', async () => {
            const res = await app.inject({
                method: 'GET',
                url: '/search?q=apple&region=Italy&foodGroup=Fruits',
                headers: AUTH,
            });
            expect(res.statusCode).toBe(200);
            expect(svc.searchFoods).toHaveBeenCalledTimes(1);
        });

        it('region at the 120-char boundary -> not 400 (reaches service)', async () => {
            const res = await app.inject({
                method: 'GET',
                url: `/search?q=apple&region=${'a'.repeat(MAX_FILTER_LEN)}`,
                headers: AUTH,
            });
            expect(res.statusCode).not.toBe(400);
            expect(svc.searchFoods).toHaveBeenCalledTimes(1);
        });
    });

    // ── POST /recipes — description .max(2000) ───────────────────────────────
    describe('POST /recipes description bound (max 2000)', () => {
        it('description of 2001 chars -> 400 and createRecipe NOT called', async () => {
            const res = await app.inject({
                method: 'POST',
                url: '/recipes',
                headers: AUTH,
                payload: baseRecipe({ description: 'a'.repeat(MAX_RECIPE_DESC_LEN + 1) }),
            });
            expect(res.statusCode).toBe(400);
            expect(svc.createRecipe).not.toHaveBeenCalled();
        });

        it('description of exactly 2000 chars -> not 400 (reaches service)', async () => {
            const res = await app.inject({
                method: 'POST',
                url: '/recipes',
                headers: AUTH,
                payload: baseRecipe({ description: 'a'.repeat(MAX_RECIPE_DESC_LEN) }),
            });
            expect(res.statusCode).not.toBe(400);
            expect(svc.createRecipe).toHaveBeenCalledTimes(1);
        });
    });

    // ── POST /recipes — ingredients array + field caps ───────────────────────
    describe('POST /recipes ingredients bounds', () => {
        it('101 ingredients -> 400 and createRecipe NOT called', async () => {
            const ingredients = Array.from({ length: MAX_INGREDIENTS + 1 }, (_, i) => ({
                name: `ing-${i}`,
                amount: '1',
                unit: 'cup',
            }));
            const res = await app.inject({
                method: 'POST',
                url: '/recipes',
                headers: AUTH,
                payload: baseRecipe({ ingredients }),
            });
            expect(res.statusCode).toBe(400);
            expect(svc.createRecipe).not.toHaveBeenCalled();
        });

        it('ingredient name of 201 chars -> 400 and createRecipe NOT called', async () => {
            const res = await app.inject({
                method: 'POST',
                url: '/recipes',
                headers: AUTH,
                payload: baseRecipe({ ingredients: [{ name: 'a'.repeat(MAX_INGREDIENT_NAME_LEN + 1), amount: '1', unit: 'cup' }] }),
            });
            expect(res.statusCode).toBe(400);
            expect(svc.createRecipe).not.toHaveBeenCalled();
        });

        it('ingredient amount of 61 chars -> 400 and createRecipe NOT called', async () => {
            const res = await app.inject({
                method: 'POST',
                url: '/recipes',
                headers: AUTH,
                payload: baseRecipe({ ingredients: [{ name: 'Oats', amount: 'a'.repeat(MAX_INGREDIENT_AMOUNT_LEN + 1), unit: 'cup' }] }),
            });
            expect(res.statusCode).toBe(400);
            expect(svc.createRecipe).not.toHaveBeenCalled();
        });

        it('ingredient unit of 41 chars -> 400 and createRecipe NOT called', async () => {
            const res = await app.inject({
                method: 'POST',
                url: '/recipes',
                headers: AUTH,
                payload: baseRecipe({ ingredients: [{ name: 'Oats', amount: '1', unit: 'a'.repeat(MAX_INGREDIENT_UNIT_LEN + 1) }] }),
            });
            expect(res.statusCode).toBe(400);
            expect(svc.createRecipe).not.toHaveBeenCalled();
        });

        it('100 ingredients with boundary-length name/amount/unit -> not 400 (reaches service)', async () => {
            const ingredients = Array.from({ length: MAX_INGREDIENTS }, () => ({
                name: 'a'.repeat(MAX_INGREDIENT_NAME_LEN),
                amount: 'a'.repeat(MAX_INGREDIENT_AMOUNT_LEN),
                unit: 'a'.repeat(MAX_INGREDIENT_UNIT_LEN),
            }));
            const res = await app.inject({
                method: 'POST',
                url: '/recipes',
                headers: AUTH,
                payload: baseRecipe({ ingredients }),
            });
            expect(res.statusCode).not.toBe(400);
            expect(svc.createRecipe).toHaveBeenCalledTimes(1);
        });
    });

    // ── POST /recipes — instructions array + per-step length ─────────────────
    describe('POST /recipes instructions bounds', () => {
        it('101 instruction steps -> 400 and createRecipe NOT called', async () => {
            const instructions = Array.from({ length: MAX_INSTRUCTIONS + 1 }, (_, i) => `step ${i}`);
            const res = await app.inject({
                method: 'POST',
                url: '/recipes',
                headers: AUTH,
                payload: baseRecipe({ instructions }),
            });
            expect(res.statusCode).toBe(400);
            expect(svc.createRecipe).not.toHaveBeenCalled();
        });

        it('an instruction step of 1001 chars -> 400 and createRecipe NOT called', async () => {
            const res = await app.inject({
                method: 'POST',
                url: '/recipes',
                headers: AUTH,
                payload: baseRecipe({ instructions: ['a'.repeat(MAX_INSTRUCTION_LEN + 1)] }),
            });
            expect(res.statusCode).toBe(400);
            expect(svc.createRecipe).not.toHaveBeenCalled();
        });

        it('100 steps each at the 1000-char boundary -> not 400 (reaches service)', async () => {
            const instructions = Array.from({ length: MAX_INSTRUCTIONS }, () => 'a'.repeat(MAX_INSTRUCTION_LEN));
            const res = await app.inject({
                method: 'POST',
                url: '/recipes',
                headers: AUTH,
                payload: baseRecipe({ instructions }),
            });
            expect(res.statusCode).not.toBe(400);
            expect(svc.createRecipe).toHaveBeenCalledTimes(1);
        });
    });

    // ── POST /recipes — tags array + per-tag length ──────────────────────────
    describe('POST /recipes tags bounds', () => {
        it('51 tags -> 400 and createRecipe NOT called', async () => {
            const tags = Array.from({ length: MAX_TAGS + 1 }, (_, i) => `tag-${i}`);
            const res = await app.inject({
                method: 'POST',
                url: '/recipes',
                headers: AUTH,
                payload: baseRecipe({ tags }),
            });
            expect(res.statusCode).toBe(400);
            expect(svc.createRecipe).not.toHaveBeenCalled();
        });

        it('a tag of 61 chars -> 400 and createRecipe NOT called', async () => {
            const res = await app.inject({
                method: 'POST',
                url: '/recipes',
                headers: AUTH,
                payload: baseRecipe({ tags: ['a'.repeat(61)] }),
            });
            expect(res.statusCode).toBe(400);
            expect(svc.createRecipe).not.toHaveBeenCalled();
        });

        it('a representative tagged recipe -> not 400 (reaches service unchanged)', async () => {
            const res = await app.inject({
                method: 'POST',
                url: '/recipes',
                headers: AUTH,
                payload: baseRecipe(),
            });
            expect(res.statusCode).not.toBe(400);
            expect(svc.createRecipe).toHaveBeenCalledTimes(1);
            // The valid body reached the service intact (tags preserved).
            expect(svc.createRecipe).toHaveBeenCalledWith(
                expect.objectContaining({ tags: ['breakfast', 'vegan'] }),
            );
        });
    });

    // ── POST /log — foodItems[].name .max(200) ───────────────────────────────
    describe('POST /log foodItems name bound (max 200)', () => {
        function logBody(name: string) {
            return {
                mealType: 'BREAKFAST',
                foodItems: [{ name, quantity: 1, calories: 150, protein: 5, carbs: 27, fat: 3 }],
            };
        }

        it('foodItems name of 201 chars -> 400 and logMeal NOT called', async () => {
            const res = await app.inject({
                method: 'POST',
                url: '/log',
                headers: AUTH,
                payload: logBody('a'.repeat(MAX_FOOD_NAME_LEN + 1)),
            });
            expect(res.statusCode).toBe(400);
            expect(svc.logMeal).not.toHaveBeenCalled();
        });

        it('empty foodItems name -> 400 (min 1) and logMeal NOT called', async () => {
            const res = await app.inject({
                method: 'POST',
                url: '/log',
                headers: AUTH,
                payload: logBody(''),
            });
            expect(res.statusCode).toBe(400);
            expect(svc.logMeal).not.toHaveBeenCalled();
        });

        it('foodItems name of exactly 200 chars -> 201 (reaches service)', async () => {
            const res = await app.inject({
                method: 'POST',
                url: '/log',
                headers: AUTH,
                payload: logBody('a'.repeat(MAX_FOOD_NAME_LEN)),
            });
            expect(res.statusCode).toBe(201);
            expect(svc.logMeal).toHaveBeenCalledTimes(1);
        });

        it('a representative meal log -> 201 and response shape unchanged', async () => {
            const res = await app.inject({
                method: 'POST',
                url: '/log',
                headers: AUTH,
                payload: logBody('Oatmeal'),
            });
            expect(res.statusCode).toBe(201);
            expect(svc.logMeal).toHaveBeenCalledTimes(1);
            // Response body still serializes to the unchanged logMealResponseSchema.
            const body = res.json();
            expect(body).toMatchObject({
                id: 'meal-log-1',
                userId: USER_ID,
                mealType: 'BREAKFAST',
                totalCalories: 150,
                isAdherent: true,
            });
        });
    });

    // ── 401 sanity: a 400 above is from the schema, not auth ─────────────────
    it('no token -> 401 (proves the bounds tests above pass because of a VALID token)', async () => {
        const res = await app.inject({ method: 'POST', url: '/recipes', payload: baseRecipe() });
        expect(res.statusCode).toBe(401);
    });
});

// ── Internal-throw redaction: fixed generic 5xx only ─────────────────────────
describe('meal-service internal throw -> shared generic 5xx (no raw leak)', () => {
    let app: FastifyInstance;
    let svc: MockService;

    beforeEach(async () => {
        svc = buildMockService();
        // The service layer throws a message dense with internal/attack signals;
        // the shared handler must replace it with the fixed generic body.
        svc.logMeal.mockRejectedValue(new Error(LEAKY_THROWN_MESSAGE));
        app = await buildApp(svc);
    });

    afterEach(async () => {
        await app.close();
    });

    const validLog = {
        mealType: 'BREAKFAST',
        foodItems: [{ name: 'Oatmeal', quantity: 1, calories: 150, protein: 5, carbs: 27, fat: 3 }],
    };

    it('returns the shared handler\'s fixed 500 body (positive match)', async () => {
        const res = await app.inject({ method: 'POST', url: '/log', headers: AUTH, payload: validLog });
        expect(res.statusCode).toBe(500);
        expect(res.json()).toEqual({
            error: 'InternalServerError',
            message: 'An unexpected error occurred',
            statusCode: 500,
        });
    });

    it('500 body does NOT leak any internal detail from the thrown error', async () => {
        const res = await app.inject({ method: 'POST', url: '/log', headers: AUTH, payload: validLog });
        // Negative-match list mirrors error-redaction.test.ts.
        expect(res.body).not.toContain(LEAKY_THROWN_MESSAGE);
        expect(res.body).not.toContain('Prisma');
        expect(res.body).not.toContain('stack');
        expect(res.body).not.toContain('at /');
        expect(res.body).not.toContain('localhost');
        expect(res.body).not.toContain('5432');
        expect(res.body).not.toContain('/etc/passwd');
    });
});
