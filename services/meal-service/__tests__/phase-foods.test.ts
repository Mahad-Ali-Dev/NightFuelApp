/**
 * Locking suite — the cycle "best foods for your phase" feature.
 *
 *   Service:  MealService.getPhaseFoods(phase, limit) maps each cycle phase to
 *             ONE focus micronutrient and returns the foods richest in it,
 *             ordered by that column DESC, capped at `limit`, with the right
 *             focusNutrient + non-prescriptive rationale.
 *   Route:    GET /v1/meals/phase-foods?phase=MENSTRUAL returns those foods (200,
 *             sorted by ironMg desc) with the contract shape; an invalid/unknown
 *             phase is rejected with 400; `limit` clamps to 1..12.
 *
 * The service suite drives the REAL service (src/meal.service.ts) with a tiny
 * in-memory Prisma stub that emulates the exact findMany contract getPhaseFoods
 * relies on (where {focus: {not:null}}, orderBy {focus:'desc'}, take) — the same
 * import-only isolation the sibling suites use. The route suite mirrors
 * food-image-exposure.test.ts: only `mealRoutes` is imported, a mock service is
 * injected via DI, and a real Bearer token opens the JWT auth gate.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import jwt from 'jsonwebtoken';
import { MealService, PHASE_NUTRIENT_MAP } from '../src/meal.service';
import { mealRoutes } from '../src/routes';

// ── A small fixture catalogue with a spread of ironMg values (some null) ──────
function catalogue() {
    return [
        { id: 'a', name: 'Lentils',     ironMg: 3.3,  magnesiumMg: 36,  zincMg: 1.3, folateMcg: 181 },
        { id: 'b', name: 'Spinach',     ironMg: 2.7,  magnesiumMg: 79,  zincMg: 0.5, folateMcg: 194 },
        { id: 'c', name: 'Tofu',        ironMg: 5.4,  magnesiumMg: 58,  zincMg: 1.6, folateMcg: 19  },
        { id: 'd', name: 'White Bread', ironMg: null, magnesiumMg: 23,  zincMg: 0.7, folateMcg: 137 },
        { id: 'e', name: 'Apple',       ironMg: 0.12, magnesiumMg: 5,   zincMg: 0.04, folateMcg: 3  },
    ];
}

// In-memory Prisma stub implementing exactly the findMany shape getPhaseFoods
// uses: a single-column `{ [col]: { not: null } }` where, a single-column
// `{ [col]: 'desc' }` orderBy, and `take`.
function buildService() {
    const prisma: any = {
        foodItem: {
            findMany: async ({ where, orderBy, take }: any) => {
                const [whereCol] = Object.keys(where ?? {});
                const [orderCol] = Object.keys(orderBy ?? {});
                let rows = catalogue();
                if (whereCol) {
                    // emulate { [col]: { not: null } }
                    rows = rows.filter((r: any) => r[whereCol] !== null && r[whereCol] !== undefined);
                }
                if (orderCol) {
                    const dir = orderBy[orderCol] === 'desc' ? -1 : 1;
                    rows = [...rows].sort((x: any, y: any) => (x[orderCol] - y[orderCol]) * dir);
                }
                return typeof take === 'number' ? rows.slice(0, take) : rows;
            },
        },
    };
    const eventBus: any = { publish: async () => {} };
    return new MealService(prisma, eventBus, { PLAN_SERVICE_URL: 'http://plan-service' });
}

describe('MealService.getPhaseFoods (pure ranking against a Prisma stub)', () => {
    it('MENSTRUAL focuses on ironMg, sorted desc, excluding null-iron foods', async () => {
        const svc = buildService();
        const res = await svc.getPhaseFoods('MENSTRUAL', 6);

        expect(res.phase).toBe('MENSTRUAL');
        expect(res.focusNutrient).toBe('ironMg');
        expect(res.focusLabel).toBe('Iron');
        expect(res.rationale).toBe(PHASE_NUTRIENT_MAP.MENSTRUAL.rationale);

        // White Bread (null ironMg) is excluded; the rest are iron-desc.
        const iron = res.foods.map((f: any) => f.ironMg);
        expect(iron).toEqual([5.4, 3.3, 2.7, 0.12]);
        expect(res.foods.map((f: any) => f.name)).not.toContain('White Bread');
    });

    it('is case-insensitive on the phase name', async () => {
        const svc = buildService();
        const res = await svc.getPhaseFoods('menstrual', 6);
        expect(res.focusNutrient).toBe('ironMg');
        expect(res.foods[0].name).toBe('Tofu'); // highest ironMg
    });

    it('maps each of the four phases to its focus nutrient + label', async () => {
        const svc = buildService();
        expect((await svc.getPhaseFoods('FOLLICULAR', 6)).focusNutrient).toBe('folateMcg');
        expect((await svc.getPhaseFoods('FOLLICULAR', 6)).focusLabel).toBe('Folate');
        expect((await svc.getPhaseFoods('OVULATORY', 6)).focusNutrient).toBe('zincMg');
        expect((await svc.getPhaseFoods('OVULATORY', 6)).focusLabel).toBe('Zinc');
        expect((await svc.getPhaseFoods('LUTEAL', 6)).focusNutrient).toBe('magnesiumMg');
        expect((await svc.getPhaseFoods('LUTEAL', 6)).focusLabel).toBe('Magnesium');
    });

    it('clamps limit to 1..12 and defaults to 6', async () => {
        const svc = buildService();
        // take=2 -> two richest-iron foods
        expect((await svc.getPhaseFoods('MENSTRUAL', 2)).foods.map((f: any) => f.name)).toEqual(['Tofu', 'Lentils']);
        // absurd/zero/negative limits are clamped to >=1 (never an empty take)
        expect((await svc.getPhaseFoods('MENSTRUAL', 0)).foods.length).toBeGreaterThanOrEqual(1);
        expect((await svc.getPhaseFoods('MENSTRUAL', -5)).foods.length).toBeGreaterThanOrEqual(1);
    });

    it('returns a clearly-shaped empty result for an unknown phase (no throw)', async () => {
        const svc = buildService();
        const res = await svc.getPhaseFoods('UNKNOWN', 6);
        expect(res.foods).toEqual([]);
        expect(res.focusNutrient).toBeNull();
    });

    it('keeps every rationale non-prescriptive (no medical-claim verbs)', () => {
        // Guards the wellness framing: rationales must not assert treatment/cure.
        const banned = /\b(cure|treat|treats|diagnos|prevent disease|medical)\b/i;
        for (const spec of Object.values(PHASE_NUTRIENT_MAP)) {
            expect(spec.rationale).not.toMatch(banned);
        }
    });
});

// ── Route-level (HTTP) suite ──────────────────────────────────────────────────

const JWT_SECRET = 'test-jwt-secret-at-least-32-chars-long-000';
const USER_ID = '55555555-5555-4555-8555-555555555555';
const VALID = jwt.sign({ id: USER_ID }, JWT_SECRET, { expiresIn: '1h' });
const AUTH = { authorization: `Bearer ${VALID}` };

// Foods already in ironMg-desc order, as getPhaseFoods would return them.
const IRON_FOODS = [
    { id: 'c', name: 'Tofu', ironMg: 5.4 },
    { id: 'a', name: 'Lentils', ironMg: 3.3 },
    { id: 'b', name: 'Spinach', ironMg: 2.7 },
];

function buildMockService() {
    return {
        searchFoods: jest.fn<any>().mockResolvedValue([]),
        getFoodById: jest.fn<any>().mockResolvedValue(null),
        getPhaseFoods: jest.fn<any>().mockResolvedValue({
            phase: 'MENSTRUAL',
            focusNutrient: 'ironMg',
            focusLabel: 'Iron',
            rationale: PHASE_NUTRIENT_MAP.MENSTRUAL.rationale,
            foods: IRON_FOODS,
        }),
        listFoodGroups: jest.fn<any>().mockResolvedValue([]),
        logMeal: jest.fn<any>().mockResolvedValue({}),
        getMealLogs: jest.fn<any>().mockResolvedValue([]),
        generateGroceryList: jest.fn<any>().mockResolvedValue({}),
        getRecipes: jest.fn<any>().mockResolvedValue([]),
        getRecipe: jest.fn<any>().mockResolvedValue(null),
        createRecipe: jest.fn<any>().mockResolvedValue({}),
        getFastingLogs: jest.fn<any>().mockResolvedValue([]),
        startFasting: jest.fn<any>().mockResolvedValue({}),
        endFasting: jest.fn<any>().mockResolvedValue({}),
    };
}

type MockService = ReturnType<typeof buildMockService>;

async function buildApp(svc: MockService): Promise<FastifyInstance> {
    const app = Fastify({ logger: false });
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
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

describe('GET /v1/meals/phase-foods (route)', () => {
    let app: FastifyInstance;
    let svc: MockService;

    beforeEach(async () => {
        svc = buildMockService();
        app = await buildApp(svc);
    });
    afterEach(async () => {
        await app.close();
    });

    it('phase=MENSTRUAL returns foods sorted by ironMg desc with focusNutrient + rationale', async () => {
        const res = await app.inject({ method: 'GET', url: '/phase-foods?phase=MENSTRUAL', headers: AUTH });

        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.phase).toBe('MENSTRUAL');
        expect(body.focusNutrient).toBe('ironMg');
        expect(body.focusLabel).toBe('Iron');
        expect(body.rationale).toBe(PHASE_NUTRIENT_MAP.MENSTRUAL.rationale);
        // Foods are present and iron-desc.
        const iron = body.foods.map((f: any) => f.ironMg);
        expect(iron).toEqual([...iron].sort((a, b) => b - a));
        expect(iron).toEqual([5.4, 3.3, 2.7]);

        // The route uppercased the phase before calling the service.
        expect(svc.getPhaseFoods).toHaveBeenCalledWith('MENSTRUAL', 6);
    });

    it('is case-insensitive (lower-case phase still resolves)', async () => {
        const res = await app.inject({ method: 'GET', url: '/phase-foods?phase=menstrual', headers: AUTH });
        expect(res.statusCode).toBe(200);
        expect(svc.getPhaseFoods).toHaveBeenCalledWith('MENSTRUAL', 6);
    });

    it('clamps limit to its 1..12 ceiling at the route', async () => {
        const ok = await app.inject({ method: 'GET', url: '/phase-foods?phase=LUTEAL&limit=3', headers: AUTH });
        expect(ok.statusCode).toBe(200);
        expect(svc.getPhaseFoods).toHaveBeenCalledWith('LUTEAL', 3);

        // limit above the ceiling is rejected by the schema (.max(12)) -> 400.
        const tooBig = await app.inject({ method: 'GET', url: '/phase-foods?phase=LUTEAL&limit=99', headers: AUTH });
        expect(tooBig.statusCode).toBe(400);
    });

    it('rejects an unknown/invalid phase with 400', async () => {
        const bad = await app.inject({ method: 'GET', url: '/phase-foods?phase=BANANA', headers: AUTH });
        expect(bad.statusCode).toBe(400);
        expect(svc.getPhaseFoods).not.toHaveBeenCalled();

        const missing = await app.inject({ method: 'GET', url: '/phase-foods', headers: AUTH });
        expect(missing.statusCode).toBe(400);
    });

    it('requires auth (401 without a token)', async () => {
        const res = await app.inject({ method: 'GET', url: '/phase-foods?phase=MENSTRUAL' });
        expect(res.statusCode).toBe(401);
    });
});
