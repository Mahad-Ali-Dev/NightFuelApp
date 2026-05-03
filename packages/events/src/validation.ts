import { z } from 'zod';

export const WorkoutEnvironmentSchema = z.enum(['HOME', 'GYM', 'HYBRID']);
export const EquipmentSchema = z.enum(['DUMBBELLS', 'BARBELL', 'KETTLEBELL', 'BANDS', 'BENCH', 'RACK', 'CABLES']);
export const ExperienceLevelSchema = z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'ATHLETE']);
export const SplitTypeSchema = z.enum(['PPL', 'BRO_SPLIT', 'FULL_BODY', 'UPPER_LOWER', 'BODY_PART']);

export const UserPreferencesSchema = z.object({
    primaryGoal: z.string(),
    experienceLevel: ExperienceLevelSchema.default('BEGINNER'),
    workoutEnvironment: WorkoutEnvironmentSchema.default('GYM'),
    availableEquipment: z.array(z.string()).default([]),
    isBodybuilderMode: z.boolean().default(false),
    isInjurySafeMode: z.boolean().default(false),
    workoutDurationPreference: z.number().int().min(20).max(120).default(60),
    splitPreference: SplitTypeSchema.default('FULL_BODY'),
    dietaryPreference: z.string().default('ANY'),
    dietMode: z.string().default('BALANCED'),
    healthConditions: z.array(z.string()).default([]),
});

export type UserPreferencesInput = z.infer<typeof UserPreferencesSchema>;
