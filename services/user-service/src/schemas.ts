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

    // ── Menstrual-cycle tracking inputs ──────────────────────────────────────
    // Raw user inputs persisted on UserProfile. lastPeriodStartDate uses the SAME
    // YYYY-MM-DD regex string as dateOfBirth (parsed to UTC midnight DateTime).
    // Bounds mirror the computeCyclePhase gate so out-of-gate values are still
    // storable (they just resolve to UNKNOWN) — the gate, not the schema, is the
    // safety boundary.
    cycleTrackingEnabled: z.boolean().optional(),
    lastPeriodStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    avgCycleLengthDays: z.coerce.number().int().min(15).max(60).nullable().optional(),
    avgPeriodLengthDays: z.coerce.number().int().min(1).max(14).nullable().optional(),
    cycleRegularity: z.enum(['REGULAR', 'IRREGULAR', 'UNKNOWN']).nullable().optional(),
    hormonalContraception: z.boolean().optional(),
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

// ── Privacy update ──────────────────────────────────────────────────────────
// Backing the PATCH /v1/users/me account-visibility toggle. Kept separate from
// updateProfileSchema so the social public/private contract is the sole owner of
// the isPrivate field (consumed by community-service & chat-service).
export const updatePrivacySchema = z.object({ isPrivate: z.boolean().optional() });

// ── Period logging ────────────────────────────────────────────────────────────
// Backs POST /v1/users/me/cycle/period. startDate is required; endDate optional.
// Both use the same YYYY-MM-DD regex as dateOfBirth / lastPeriodStartDate (parsed
// to UTC-midnight Date). A superset .refine guards endDate >= startDate.
export const logPeriodSchema = z
    .object({
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    })
    .refine((b) => !b.endDate || b.endDate >= b.startDate, {
        message: 'endDate must be on or after startDate',
        path: ['endDate'],
    });

// ── Cycle forecast query ────────────────────────────────────────────────────
// Backs GET /v1/users/me/cycle/forecast. `months` is the half-window size in
// months around today (default 1 -> roughly the current month +/- a month).
export const cycleForecastQuerySchema = z.object({
    months: z.coerce.number().int().min(1).max(6).optional(),
});

// ── Exported inferred types ───────────────────────────────────────────────────
export type UpdateProfileBody = z.infer<typeof updateProfileSchema>;
export type UpdatePreferencesBody = z.infer<typeof updatePreferencesSchema>;
export type UpdateOnboardingBody = z.infer<typeof updateOnboardingSchema>;
export type UpdatePrivacyBody = z.infer<typeof updatePrivacySchema>;
export type LogPeriodBody = z.infer<typeof logPeriodSchema>;
export type CycleForecastQuery = z.infer<typeof cycleForecastQuerySchema>;

// ── Waitlist (public, marketing site) ─────────────────────────────────────────
export const waitlistJoinSchema = z.object({
    email: z.string().trim().toLowerCase().email().max(254),
    // Optional attribution tag from the site (e.g. "landing-finalcta").
    source: z.string().trim().max(64).optional(),
});
export type WaitlistJoinBody = z.infer<typeof waitlistJoinSchema>;

// ── Cycle symptoms (per-day quick log) ────────────────────────────────────────
export const logSymptomsSchema = z
    .object({
        // Calendar day (YYYY-MM-DD). Defaults to "today" at the service layer.
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        mood: z.number().int().min(1).max(5).optional(),
        cramps: z.number().int().min(0).max(3).optional(),
        energy: z.number().int().min(1).max(5).optional(),
        flow: z.enum(['NONE', 'SPOTTING', 'LIGHT', 'MEDIUM', 'HEAVY']).optional(),
        notes: z.string().trim().max(280).optional(),
    })
    .refine(
        (b) => b.mood != null || b.cramps != null || b.energy != null || b.flow != null || !!b.notes,
        { message: 'Log at least one symptom field' }
    );
export type LogSymptomsBody = z.infer<typeof logSymptomsSchema>;

export const symptomsQuerySchema = z.object({
    // How many days back to return (default 35 ≈ one cycle + margin).
    days: z.coerce.number().int().min(1).max(120).optional(),
});
export type SymptomsQuery = z.infer<typeof symptomsQuerySchema>;
