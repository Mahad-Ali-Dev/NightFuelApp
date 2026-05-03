
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { MealService } from './meal.service';
import { mealSearchParamsSchema, mealSearchResponseSchema, logMealBodySchema, logMealResponseSchema, getMealLogsQuerySchema } from './schemas';
import { z } from 'zod';

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
                region:       z.string().optional(),
                foodGroup:    z.string().optional(),
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
        const { mealType, foodItems } = request.body;

        const mealLog = await mealService.logMeal(userId, mealType, foodItems);
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
            request.log.error(err);
            return reply.status(400).send({ error: err.message });
        }
    });

    // ── Recipes ───────────────────────────────────────────────────────────────

    fastify.get('/recipes', {
        schema: { querystring: z.object({ tags: z.string().optional(), limit: z.coerce.number().default(20) }) },
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
                description:    z.string().optional(),
                prepTimeMins:   z.number().int().min(0).default(0),
                cookTimeMins:   z.number().int().min(0).default(0),
                servings:       z.number().int().min(1).default(1),
                calories:       z.number().min(0).default(0),
                protein:        z.number().min(0).default(0),
                carbs:          z.number().min(0).default(0),
                fat:            z.number().min(0).default(0),
                ingredients:    z.array(z.object({
                    name:   z.string().min(1),
                    amount: z.string().min(1),
                    unit:   z.string().optional(),
                })).default([]),
                instructions:   z.array(z.string().min(1)).default([]),
                tags:           z.array(z.string()).default([]),
                image:          z.string().url().optional(),
            }),
        },
        preHandler: [(fastify as any).authenticate]
    }, async (request, reply) => {
        return reply.code(201).send(await mealService.createRecipe(request.body));
    });

    // ── Fasting ───────────────────────────────────────────────────────────────

    fastify.get('/fasting', {
        schema: { querystring: z.object({ limit: z.coerce.number().default(10) }) },
        preHandler: [(fastify as any).authenticate]
    }, async (request, reply) => {
        const userId = (request.user as any).id || (request.user as any).userId;
        const { limit } = request.query as any;
        return reply.send(await mealService.getFastingLogs(userId, limit));
    });

    fastify.post('/fasting/start', {
        schema: { body: z.object({ targetHours: z.number().min(1).default(16) }) },
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
            return reply.code(400).send({ error: err.message });
        }
    });
};
