/**
 * API-exposure suite — the food library endpoints must surface the Open Food
 * Facts photo columns (imageUrl + imageAttribution) on FoodItem responses, so
 * the mobile food library can render the product image and its required license
 * credit.
 *
 *   GET /search     -> each result carries imageUrl + imageAttribution
 *   GET /food/:id   -> the single food carries imageUrl + imageAttribution
 *
 * `searchFoods` uses an EXPLICIT Prisma `select` (src/meal.service.ts), so the
 * two columns only reach the client if they are named in that select — this
 * suite locks that. `getFoodById` returns the whole row (no select), so it is
 * asserted to pass the columns through too. The route has no response-schema
 * serializer on /search, so whatever the service returns is sent verbatim.
 *
 * Isolation mirrors input-bounds.test.ts: only `mealRoutes` is imported (never
 * src/index.ts, whose bootstrap opens real DB/Redis), a mock service is injected
 * via DI, and a real Bearer token opens the JWT auth gate.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import jwt from 'jsonwebtoken';
import { mealRoutes } from '../src/routes';

const JWT_SECRET = 'test-jwt-secret-at-least-32-chars-long-000';
const USER_ID = '55555555-5555-4555-8555-555555555555';
const FOOD_ID = '11111111-1111-4111-8111-111111111111';
const VALID = jwt.sign({ id: USER_ID }, JWT_SECRET, { expiresIn: '1h' });
const AUTH = { authorization: `Bearer ${VALID}` };

const IMAGE_URL = 'https://images.openfoodfacts.org/images/products/oat-milk.jpg';
const IMAGE_ATTR = 'Photo © Open Food Facts contributors, CC-BY-SA 3.0';

// A FoodItem row exactly as searchFoods' `select` projects it — including the
// two image columns this suite is guarding.
function foodRow(overrides: Record<string, unknown> = {}) {
    return {
        id: FOOD_ID,
        name: 'Barista Oat Milk',
        calories: 59,
        protein: 1.3,
        carbs: 7,
        fat: 2.8,
        fiber: 0.8,
        servingSize: '100ml',
        glycemicIndex: null,
        isVegan: true,
        isGlutenFree: true,
        isHalal: true,
        region: null,
        cuisineTags: [],
        source: 'OPENFOODFACTS',
        foodGroup: 'Beverages',
        imageUrl: IMAGE_URL,
        imageAttribution: IMAGE_ATTR,
        // Micronutrients — projected by searchFoods' explicit select, so they
        // must reach the client on each /search result.
        ironMg: 0.4,
        magnesiumMg: 12,
        calciumMg: 120,
        potassiumMg: 39,
        zincMg: 0.1,
        vitaminCMg: 0,
        vitaminB6Mg: 0,
        vitaminB12Mcg: 1.2,
        folateMcg: 4,
        vitaminDMcg: 1.1,
        ...overrides,
    };
}

function buildMockService() {
    return {
        searchFoods: jest.fn<any>().mockResolvedValue([foodRow()]),
        getFoodById: jest.fn<any>().mockResolvedValue(foodRow()),
        getPhaseFoods: jest.fn<any>().mockResolvedValue({ phase: 'MENSTRUAL', focusNutrient: 'ironMg', focusLabel: 'Iron', rationale: '', foods: [] }),
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

describe('meal-service food image exposure', () => {
    let app: FastifyInstance;
    let svc: MockService;

    beforeEach(async () => {
        svc = buildMockService();
        app = await buildApp(svc);
    });

    afterEach(async () => {
        await app.close();
    });

    it('GET /search returns imageUrl + imageAttribution on each result', async () => {
        const res = await app.inject({
            method: 'GET',
            url: '/search?q=oat',
            headers: AUTH,
        });

        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(Array.isArray(body)).toBe(true);
        expect(body).toHaveLength(1);
        expect(body[0]).toHaveProperty('imageUrl', IMAGE_URL);
        expect(body[0]).toHaveProperty('imageAttribution', IMAGE_ATTR);
    });

    it('GET /search carries the micronutrient fields (ironMg + magnesiumMg) on each result', async () => {
        const res = await app.inject({
            method: 'GET',
            url: '/search?q=oat',
            headers: AUTH,
        });

        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body[0]).toHaveProperty('ironMg', 0.4);
        expect(body[0]).toHaveProperty('magnesiumMg', 12);
    });

    it('GET /food/:id returns imageUrl + imageAttribution', async () => {
        const res = await app.inject({
            method: 'GET',
            url: `/food/${FOOD_ID}`,
            headers: AUTH,
        });

        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body).toHaveProperty('imageUrl', IMAGE_URL);
        expect(body).toHaveProperty('imageAttribution', IMAGE_ATTR);
    });
});
