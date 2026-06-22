
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { MealService } from './meal.service';
import { mealSearchParamsSchema, mealSearchResponseSchema, logMealBodySchema, logMealResponseSchema, getMealLogsQuerySchema } from './schemas';
import { z } from 'zod';

// ── Input upper bounds ──────────────────────────────────────────────────────
// Generous caps so every currently-valid app payload still passes; only
// absurd/abusive values are rejected with the standard 400. Mirrors the named
// `MAX_*` style in sleep-service/src/index.ts and the .max() bounds in
// exercise-service/src/index.ts.
const MAX_FILTER_LEN = 120;        // food-search region / foodGroup filter string
const MAX_RECIPE_DESC_LEN = 2000;  // recipe description free text
const MAX_INGREDIENTS = 100;       // ingredients per recipe
const MAX_INGREDIENT_NAME_LEN = 200; // a single ingredient's name
const MAX_INGREDIENT_AMOUNT_LEN = 60; // a single ingredient's amount (e.g. "1 1/2")
const MAX_INGREDIENT_UNIT_LEN = 40;  // a single ingredient's unit (e.g. "tablespoons")
const MAX_INSTRUCTIONS = 100;      // instruction steps per recipe
const MAX_INSTRUCTION_LEN = 1000;  // a single instruction step
const MAX_TAGS = 50;               // tags per recipe
const MAX_TAG_LEN = 60;            // a single tag

export const mealRoutes: FastifyPluginAsyncZod<{ mealService: MealService }> = async (fastify, options) => {
    const { mealService } = options;

    // ── Food Library (FoodDB + Open Food Facts) ───────────────────────────────

    /**
     * GET /v1/meals/search
     * Search food items from the local FoodDB-seeded library.
     * Works like ExerciseDB library — instant, no API cost, offline-capable.
     *
     * Query params:
     *   q           — search term (name or food group)
     *   foodGroup   — filter by group: 'Vegetables', 'Fruits', 'Aquatic foods', ...
     *   isVegan     — 'true' | 'false'
     *   isGlutenFree — 'true' | 'false'
     *   isHalal     — 'true' | 'false'
     *   source      — 'FOODB' | 'OPENFOODFACTS' | 'CUSTOM'
     *   limit       — max results (default 20, max 50)
     */
    fastify.get('/search', {
        schema: {
            querystring: z.object({
                q:            z.string().min(1).max(100),
                region:       z.string().max(MAX_FILTER_LEN).optional(),
                foodGroup:    z.string().max(MAX_FILTER_LEN).optional(),
                isVegan:      z.enum(['true', 'false']).optional(),
                isGlutenFree: z.enum(['true', 'false']).optional(),
                isHalal:      z.enum(['true', 'false']).optional(),
                source:       z.enum(['FOODB', 'OPENFOODFACTS', 'CUSTOM']).optional(),
                limit:        z.coerce.number().min(1).max(50).default(20),
            }),
        },
        preHandler: [(fastify as any).authenticate]
    }, async (request, reply) => {
        const { q, region, foodGroup, isVegan, isGlutenFree, isHalal, source, limit } = request.query as any;
        const results = await mealService.searchFoods(q, {
            region,
            foodGroup,
            isVegan:      isVegan      !== undefined ? isVegan === 'true'      : undefined,
            isGlutenFree: isGlutenFree !== undefined ? isGlutenFree === 'true' : undefined,
            isHalal:      isHalal      !== undefined ? isHalal === 'true'      : undefined,
            source,
            limit,
        });
        return reply.status(200).send(results);
    });

    /**
     * GET /v1/meals/food/:id
     * Get a single food item by ID.
     */
    fastify.get('/food/:id', {
        schema: { params: z.object({ id: z.string().uuid() }) },
        preHandler: [(fastify as any).authenticate]
    }, async (request, reply) => {
        const { id } = request.params as any;
        const food = await mealService.getFoodById(id);
        if (!food) return reply.code(404).send({ error: 'Food not found' });
        return reply.send(food);
    });

    /**
     * GET /v1/meals/food-groups
     * List all available food groups (for filter UI dropdowns).
     * Returns: ['Aquatic foods', 'Baking goods', 'Fruits', ...]
     */
    fastify.get('/food-groups', {
        preHandler: [(fastify as any).authenticate]
    }, async (_request, reply) => {
        return reply.send(await mealService.listFoodGroups());
    });

    fastify.post('/log', {
        schema: {
            body: logMealBodySchema,
            response: {
                201: logMealResponseSchema
            }
        },
        preHandler: [(fastify as any).authenticate]
    }, async (request, reply) => {
        const userId = (request.user as any).id || (request.user as any).userId;
        const { mealType, foodItems, planMealId, idempotencyKey } = request.body;

        // Idempotency key (HIGH #6): prefer the validated body field, then fall
        // back to the standard `Idempotency-Key` request header so clients can
        // supply it either way. A retry/double-tap re-sending the same key for
        // the same user is deduped by the service onto the existing row.
        const headerKey = request.headers['idempotency-key'];
        const idemKey = idempotencyKey
            ?? (typeof headerKey === 'string' && headerKey.length > 0 && headerKey.length <= 200
                ? headerKey
                : undefined);

        // planMealId is optional (validated by logMealBodySchema); when present
        // it links this log to the planned protocol slot it was logged from.
        const mealLog = await mealService.logMeal(userId, mealType, foodItems, planMealId, idemKey);
        return reply.status(201).send(mealLog as any);
    });

    // GET /logs — return meal history for the authenticated user, optionally filtered by date
    fastify.get('/logs', {
        schema: {
            querystring: getMealLogsQuerySchema,
        },
        preHandler: [(fastify as any).authenticate]
    }, async (request, reply) => {
        const userId = (request.user as any).id || (request.user as any).userId;
        const { date, limit } = request.query;

        const logs = await mealService.getMealLogs(userId, date, limit);
        return reply.status(200).send(logs as any);
    });

    // ── GET /v1/meals/grocery-list ────────────────────────────────────────────
    // Generates a grocery list based on the user's active plan.
    fastify.get('/grocery-list', {
        schema: {
            querystring: z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }),
        },
        preHandler: [(fastify as any).authenticate]
    }, async (request, reply) => {
        try {
            const userId = (request.user as any).id || (request.user as any).userId;
            const { date } = request.query as { date?: string };
            const list = await mealService.generateGroceryList(userId, date);
            return reply.status(200).send(list);
        } catch (err: any) {
            // Redaction: the wrapped err.message can carry a raw upstream/fetch
            // error (plan-service URL, network detail). Log it server-side and
            // return a fixed, non-leaky business message. Status unchanged (400).
            request.log.error(err);
            return reply.status(400).send({ error: 'Could not find an active plan to generate a grocery list from.' });
        }
    });

    // ── Recipes ───────────────────────────────────────────────────────────────

    fastify.get('/recipes', {
        // Bound the free-form tag string and clamp limit to a sane range so it
        // can't reach Prisma `take` as a negative or absurd value.
        schema: { querystring: z.object({ tags: z.string().max(100).optional(), limit: z.coerce.number().int().min(1).max(100).default(20) }) },
        preHandler: [(fastify as any).authenticate]
    }, async (request, reply) => {
        const { tags, limit } = request.query as any;
        return reply.send(await mealService.getRecipes({ tags }, limit));
    });

    fastify.get('/recipes/:id', {
        schema: { params: z.object({ id: z.string().uuid() }) },
        preHandler: [(fastify as any).authenticate]
    }, async (request, reply) => {
        const { id } = request.params as any;
        const recipe = await mealService.getRecipe(id);
        if (!recipe) return reply.code(404).send({ error: 'Not found' });
        return reply.send(recipe);
    });

    fastify.post('/recipes', {
        schema: {
            body: z.object({
                title:          z.string().min(1).max(200),
                description:    z.string().max(MAX_RECIPE_DESC_LEN).optional(),
                prepTimeMins:   z.number().int().min(0).default(0),
                cookTimeMins:   z.number().int().min(0).default(0),
                servings:       z.number().int().min(1).default(1),
                calories:       z.number().min(0).default(0),
                protein:        z.number().min(0).default(0),
                carbs:          z.number().min(0).default(0),
                fat:            z.number().min(0).default(0),
                ingredients:    z.array(z.object({
                    name:   z.string().min(1).max(MAX_INGREDIENT_NAME_LEN),
                    amount: z.string().min(1).max(MAX_INGREDIENT_AMOUNT_LEN),
                    unit:   z.string().max(MAX_INGREDIENT_UNIT_LEN).optional(),
                })).max(MAX_INGREDIENTS).default([]),
                instructions:   z.array(z.string().min(1).max(MAX_INSTRUCTION_LEN)).max(MAX_INSTRUCTIONS).default([]),
                tags:           z.array(z.string().max(MAX_TAG_LEN)).max(MAX_TAGS).default([]),
                image:          z.string().url().optional(),
            }),
        },
        preHandler: [(fastify as any).authenticate]
    }, async (request, reply) => {
        return reply.code(201).send(await mealService.createRecipe(request.body));
    });

    // ── Fasting ───────────────────────────────────────────────────────────────

    fastify.get('/fasting', {
        schema: { querystring: z.object({ limit: z.coerce.number().int().min(1).max(100).default(10) }) },
        preHandler: [(fastify as any).authenticate]
    }, async (request, reply) => {
        const userId = (request.user as any).id || (request.user as any).userId;
        const { limit } = request.query as any;
        return reply.send(await mealService.getFastingLogs(userId, limit));
    });

    fastify.post('/fasting/start', {
        // Upper bound: a fasting target above ~1 week (168h) is not plausible.
        schema: { body: z.object({ targetHours: z.number().min(1).max(168).default(16) }) },
        preHandler: [(fastify as any).authenticate]
    }, async (request, reply) => {
        const userId = (request.user as any).id || (request.user as any).userId;
        const { targetHours } = request.body as any;
        return reply.code(201).send(await mealService.startFasting(userId, targetHours));
    });

    fastify.post('/fasting/end', {
        preHandler: [(fastify as any).authenticate]
    }, async (request, reply) => {
        const userId = (request.user as any).id || (request.user as any).userId;
        try {
            return reply.send(await mealService.endFasting(userId));
        } catch (err: any) {
            // The only user-facing error here is the "no active fast" business
            // case; preserve that safe copy and redact anything unexpected.
            request.log.error(err);
            if (typeof err?.message === 'string' && err.message.includes('No active fast')) {
                return reply.code(400).send({ error: 'No active fast found' });
            }
            return reply.code(500).send({ error: 'An unexpected error occurred' });
        }
    });
};
