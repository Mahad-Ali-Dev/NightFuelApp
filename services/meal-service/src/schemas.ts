import { z } from 'zod';

export const mealSearchParamsSchema = z.object({
    q: z.string().min(3, "Query must be at least 3 characters"),
    region: z.string().optional()
});

export const mealSearchResponseSchema = z.array(z.object({
    id: z.string(),
    name: z.string(),
    calories: z.number(),
    protein: z.number(),
    carbs: z.number(),
    fat: z.number(),
    servingSize: z.string(),
    glycemicIndex: z.number().nullable(),
    isVegan: z.boolean(),
    isGlutenFree: z.boolean(),
    isHalal: z.boolean(),
    region: z.string().nullable(),
    cuisineTags: z.array(z.string())
}));

// Server-side upper bounds on a single logged food item. Without these, absurd
// values (e.g. quantity: 1e9, calories: 1e9) flow straight into the per-meal
// totals aggregation and the DB. The caps are generous enough for any real
// food entry while keeping a single item's contribution sane.
const MAX_QUANTITY = 10000;   // servings/grams for one item
const MAX_CALORIES = 20000;   // kcal for one item
const MAX_MACRO_GRAMS = 2000; // grams of protein / carbs / fat for one item
const MAX_FOOD_NAME_LEN = 200; // a single food item's display name (custom or library)

export const logMealBodySchema = z.object({
    mealType: z.enum(['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK']),
    foodItems: z.array(z.object({
        foodId: z.string().optional(), // Could be custom food without ID
        name: z.string().min(1).max(MAX_FOOD_NAME_LEN),
        quantity: z.number().min(0.01).max(MAX_QUANTITY),
        calories: z.number().min(0).max(MAX_CALORIES),
        protein: z.number().min(0).max(MAX_MACRO_GRAMS),
        carbs: z.number().min(0).max(MAX_MACRO_GRAMS),
        fat: z.number().min(0).max(MAX_MACRO_GRAMS)
    })).min(1, "Must include at least one food item"),
    // Optional provenance link: when a meal is logged straight from a planned
    // protocol slot (the circadian "Log this" flow), the client passes the
    // originating plan-meal id so the service can persist/echo it. Additive —
    // existing callers that omit it are unaffected. Bounded to keep an absurd
    // string out of the foodItems JSON it gets stamped onto.
    planMealId: z.string().max(200).optional()
});

export const logMealResponseSchema = z.object({
    id: z.string(),
    userId: z.string(),
    loggedAt: z.date(),
    mealType: z.string(),
    totalCalories: z.number(),
    totalProtein: z.number(),
    totalCarbs: z.number(),
    totalFat: z.number(),
    isAdherent: z.boolean(),
    // Echoed back when the meal was logged from a planned protocol slot, so the
    // client can correlate the new log with the plan item it came from.
    // Optional — undefined for ad-hoc (non-plan) logs.
    planMealId: z.string().optional()
});

// GET /logs — optional date filter, returns recent meal logs
export const getMealLogsQuerySchema = z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    limit: z.coerce.number().min(1).max(100).default(20),
});
