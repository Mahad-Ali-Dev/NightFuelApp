import { z } from 'zod';

// ---------------------------------------------------------------------------
// Query param schemas
// ---------------------------------------------------------------------------

export const historyQuerySchema = z.object({
    days: z.coerce.number().int().min(1).max(90).default(7),
});

export const statsQuerySchema = z.object({
    days: z.coerce.number().int().min(1).max(365).default(30),
});

// ---------------------------------------------------------------------------
// Response schemas
// ---------------------------------------------------------------------------

export const dailyProgressResponseSchema = z.object({
    id: z.string().uuid(),
    userId: z.string().uuid(),
    date: z.date(),
    caloriesTarget: z.number().nullable(),
    caloriesActual: z.number(),
    proteinTarget: z.number().nullable(),
    proteinActual: z.number(),
    carbsTarget: z.number().nullable(),
    carbsActual: z.number(),
    fatTarget: z.number().nullable(),
    fatActual: z.number(),
    mealsLogged: z.number().int(),
    isAdherent: z.boolean(),
    fatigueScore: z.number().int().nonnegative(),
    hydrationActual: z.number(),
    stepCount: z.number().int().nonnegative(),
    source: z.string(),
    supplementsLogged: z.any().nullable(),
    lightExposureCompleted: z.boolean(),
    planId: z.string().nullable(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
});

export const streakResponseSchema = z.object({
    currentStreak: z.number().int().nonnegative(),
    longestStreak: z.number().int().nonnegative(),
    lastAdherentDate: z.date().nullable(),
});

export const statsResponseSchema = z.object({
    daysTracked: z.number().int().nonnegative(),
    daysWithTarget: z.number().int().nonnegative(),
    adherentDays: z.number().int().nonnegative(),
    adherencePercent: z.number().min(0).max(100),
    avgCaloriesActual: z.number().nonnegative(),
    avgCaloriesTarget: z.number().nonnegative().nullable(),
    avgProteinActual: z.number().nonnegative(),
    avgCarbsActual: z.number().nonnegative(),
    avgFatActual: z.number().nonnegative(),
    totalMealsLogged: z.number().int().nonnegative(),
});

export const weeklyStatsResponseSchema = z.object({
    summary: statsResponseSchema,
    chartData: z.array(z.object({
        date: z.string(),
        caloriesActual: z.number(),
        caloriesTarget: z.number().nullable(),
        isAdherent: z.boolean(),
        fatigueScore: z.number(),
        weightKg: z.number().nullable(),
        stepCount: z.number()
    }))
});

// ---------------------------------------------------------------------------
// Inferred TS types
// ---------------------------------------------------------------------------

export type HistoryQuery = z.infer<typeof historyQuerySchema>;
export type StatsQuery = z.infer<typeof statsQuerySchema>;
export type DailyProgressResponse = z.infer<typeof dailyProgressResponseSchema>;
export type StreakResponse = z.infer<typeof streakResponseSchema>;
export type StatsResponse = z.infer<typeof statsResponseSchema>;
