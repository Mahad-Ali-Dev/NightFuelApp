import { z } from 'zod';

// ── Profile update ────────────────────────────────────────────────────────────

export const updateProfileSchema = z.object({
    displayName: z.string().min(2).max(64).optional(),
    avatarUrl: z.string().url().nullable().optional(),
    dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),

    // ⚡ Coerce input to number if it comes as string
    heightCm: z.coerce.number().positive().max(300).nullable().optional(),
    weightKg: z.coerce.number().positive().max(600).nullable().optional(),

    biologicalSex: z.enum(['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY']).nullable().optional(),
    timezone: z.string().min(1).max(64).optional(),
    region: z.enum(['us', 'eu', 'ap']).optional(),
});

// ── Preferences update ────────────────────────────────────────────────────────
export const updatePreferencesSchema = z.object({
    primaryGoal: z
        .enum(['ENERGY', 'WEIGHT_LOSS', 'MUSCLE_GAIN', 'SLEEP_QUALITY', 'GENERAL_HEALTH'])
        .optional(),
    dietaryPreference: z
        .enum(['NONE', 'ANY', 'VEGETARIAN', 'VEGAN', 'PESCATARIAN', 'KETO', 'PALEO', 'HALAL', 'KOSHER'])
        .optional(),
    targetCalories: z.number().positive().max(10000).nullable().optional(),
    targetProteinG: z.number().nonnegative().max(500).nullable().optional(),
    targetCarbsG: z.number().nonnegative().max(1000).nullable().optional(),
    targetFatG: z.number().nonnegative().max(500).nullable().optional(),
    activityLevel: z
        .enum(['SEDENTARY', 'LIGHTLY_ACTIVE', 'MODERATELY_ACTIVE', 'VERY_ACTIVE', 'EXTRA_ACTIVE'])
        .optional(),
    experienceLevel: z
        .enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'ATHLETE'])
        .optional(),
    lifestyleType: z
        .enum(['STUDENT', 'OFFICE', 'OFFICE_WORKER', 'NIGHT_SHIFT', 'ATHLETE', 'OTHER'])
        .optional(),
    sleepWindowStart: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
    sleepWindowEnd: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
    allergies: z.array(z.string().min(1).max(64)).max(20).optional(),
    healthConditions: z.array(z.string().min(1).max(64)).max(20).optional(),
    dietMode: z
        .enum(['BUDGET', 'ACNE_SAFE', 'RAMADAN', 'MASS_GAIN', 'CUTTING', 'BALANCED'])
        .optional(),
    isInjurySafeMode: z.boolean().optional(),
    workoutEnvironment: z.enum(['HOME', 'GYM', 'HYBRID']).optional(),
    availableEquipment: z.array(z.string()).optional(),
    workoutDurationPreference: z.number().int().min(10).max(180).optional(),
    splitPreference: z.enum(['PPL', 'BRO_SPLIT', 'FULL_BODY']).optional(),
    isBodybuilderMode: z.boolean().optional(),
});

// ── Onboarding advance ────────────────────────────────────────────────────────
export const updateOnboardingSchema = z.object({
    step: z.number().int().min(0).max(20),
    completed: z.boolean(),
});

// ── Exported inferred types ───────────────────────────────────────────────────
export type UpdateProfileBody = z.infer<typeof updateProfileSchema>;
export type UpdatePreferencesBody = z.infer<typeof updatePreferencesSchema>;
export type UpdateOnboardingBody = z.infer<typeof updateOnboardingSchema>;
