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

export const logMealBodySchema = z.object({
    mealType: z.enum(['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK']),
    foodItems: z.array(z.object({
        foodId: z.string().optional(), // Could be custom food without ID
        name: z.string(),
        quantity: z.number().min(0.01),
        calories: z.number().min(0),
        protein: z.number().min(0),
        carbs: z.number().min(0),
        fat: z.number().min(0)
    })).min(1, "Must include at least one food item")
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
    isAdherent: z.boolean()
});

// GET /logs — optional date filter, returns recent meal logs
export const getMealLogsQuerySchema = z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    limit: z.coerce.number().min(1).max(100).default(20),
});
