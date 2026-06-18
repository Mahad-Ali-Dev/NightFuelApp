import { z } from 'zod';
import { isValidDateRange, RANGE_REVERSED_MSG } from '@nightfuel/config';

// Calendar date in YYYY-MM-DD form. Enforced at the API boundary so a malformed or
// empty date returns 400 instead of reaching `new Date(date)` → Invalid Date → a
// Prisma validation error surfacing as 500. Matches the internal route's convention.
const dateString = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be in YYYY-MM-DD format');

export const getPlanParamsSchema = z.object({
    date: dateString,
});

// GET /history — OPTIONAL bounded date range. Both `start` and `end` are optional
// so the no-params call keeps its original behaviour (server caps at take:30). When
// BOTH are supplied the cross-field guard rejects a reversed/over-span range using
// the SHARED helper from @nightfuel/config (the same math shift-service and
// progress-service bound their range endpoints with) — no copy-pasted parse here.
// The reversed-range message is attached to path ['end'] so a client surfaces it on
// the field it would adjust, matching the shared helper's convention.
export const getPlanHistoryQuerySchema = z
    .object({
        start: dateString.optional(),
        end: dateString.optional(),
    })
    .refine(
        (d) => d.start === undefined || d.end === undefined || isValidDateRange(d.start, d.end),
        { message: RANGE_REVERSED_MSG, path: ['end'] }
    );

export const getPlanResponseSchema = z.object({
    id: z.string().uuid(),
    userId: z.string(),
    planDate: z.date(),
    planVersion: z.number(),
    plan: z.any(), // JSONB
    generationModel: z.string(),
    generationTokens: z.number().nullable(),
    status: z.string(),
    createdAt: z.date(),
    updatedAt: z.date()
}).nullable();

// POST /store — accept a pre-generated plan from the frontend (no AI call)
export const storePlanBodySchema = z.object({
    userId: z.string().uuid().optional(),
    date: dateString,
    shiftId: z.string().uuid().optional(),
    shiftType: z.string().optional(),
    structuredPlan: z.record(z.any()),
    providerUsed: z.string().optional(),
    tokensUsed: z.number().int().nullish(),
});

export const generatePlanBodySchema = z.object({
    userId: z.string().uuid().optional(), // Ignored — authoritative userId comes from JWT
    date: dateString,
    shiftId: z.string().uuid().optional(),
    shiftType: z.string().optional(),
    circadianProfile: z.record(z.any()).optional(), // Full circadian profile from the engine
    profile: z.record(z.any()).optional(),          // Alias for circadianProfile (legacy)
    preferences: z.record(z.any()).optional(),
});

export const createProtocolSchema = z.object({
    name: z.string().min(3).max(100),
    description: z.string().max(500).optional(),
    parameters: z.object({
        calories: z.number().int().min(500).max(10000),
        protein_g: z.number().int().min(50).max(1000),
        volume_modifier: z.number().min(0.1).max(2.0),
        deload: z.boolean().default(false),
        training_split: z.string().optional(),
    }),
    isPublic: z.boolean().default(false),
});

export const updateProtocolSchema = createProtocolSchema.partial();
