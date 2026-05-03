import { z } from 'zod';

export const getPlanParamsSchema = z.object({
    date: z.string()
});

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
    date: z.string(),
    shiftId: z.string().uuid().optional(),
    shiftType: z.string().optional(),
    structuredPlan: z.record(z.any()),
    providerUsed: z.string().optional(),
    tokensUsed: z.number().int().nullish(),
});

export const generatePlanBodySchema = z.object({
    userId: z.string().uuid().optional(), // Ignored — authoritative userId comes from JWT
    date: z.string(),
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
