// ─── Zeitra Shared Enums ──────────────────────────────────────────────────
// Previously expected from @nightfuel/types (package not published).
// Keep values in sync with the backend Prisma enums.

export const ShiftType = {
    FIXED_NIGHT: 'FIXED_NIGHT',
    ROTATING: 'ROTATING',
    SPLIT: 'SPLIT',
    IRREGULAR: 'IRREGULAR',
    TWELVE_HOUR: 'TWELVE_HOUR',
} as const;
export type ShiftType = typeof ShiftType[keyof typeof ShiftType];

export const ActivityLevel = {
    SEDENTARY: 'SEDENTARY',
    LIGHTLY_ACTIVE: 'LIGHTLY_ACTIVE',
    MODERATELY_ACTIVE: 'MODERATELY_ACTIVE',
    VERY_ACTIVE: 'VERY_ACTIVE',
    EXTREMELY_ACTIVE: 'EXTREMELY_ACTIVE',
} as const;
export type ActivityLevel = typeof ActivityLevel[keyof typeof ActivityLevel];

export const FitnessGoal = {
    FAT_LOSS: 'FAT_LOSS',
    MUSCLE_GAIN: 'MUSCLE_GAIN',
    MAINTENANCE: 'MAINTENANCE',
    ENDURANCE: 'ENDURANCE',
    GENERAL_HEALTH: 'GENERAL_HEALTH',
} as const;
export type FitnessGoal = typeof FitnessGoal[keyof typeof FitnessGoal];

export const ExperienceLevel = {
    BEGINNER: 'BEGINNER',
    INTERMEDIATE: 'INTERMEDIATE',
    ADVANCED: 'ADVANCED',
    ATHLETE: 'ATHLETE',
} as const;
export type ExperienceLevel = typeof ExperienceLevel[keyof typeof ExperienceLevel];

export const LifestyleType = {
    NIGHT_SHIFT_WORKER: 'NIGHT_SHIFT_WORKER',
    OFFICE_WORKER: 'OFFICE_WORKER',
    STUDENT: 'STUDENT',
    ATHLETE: 'ATHLETE',
    FREELANCER: 'FREELANCER',
} as const;
export type LifestyleType = typeof LifestyleType[keyof typeof LifestyleType];

export const DietaryPreference = {
    NONE: 'NONE',
    VEGETARIAN: 'VEGETARIAN',
    VEGAN: 'VEGAN',
    KETO: 'KETO',
    HALAL: 'HALAL',
    GLUTEN_FREE: 'GLUTEN_FREE',
} as const;
export type DietaryPreference = typeof DietaryPreference[keyof typeof DietaryPreference];

export const DietMode = {
    BALANCED: 'BALANCED',
    MASS_GAIN: 'MASS_GAIN',
    CUTTING: 'CUTTING',
    BUDGET: 'BUDGET',
    ACNE_SAFE: 'ACNE_SAFE',
    RAMADAN: 'RAMADAN',
} as const;
export type DietMode = typeof DietMode[keyof typeof DietMode];

export const HealthCondition = {
    ACNE: 'ACNE',
    INJURIES: 'INJURIES',
    ALLERGIES: 'ALLERGIES',
    DIABETES: 'DIABETES',
    HYPERTENSION: 'HYPERTENSION',
} as const;
export type HealthCondition = typeof HealthCondition[keyof typeof HealthCondition];
