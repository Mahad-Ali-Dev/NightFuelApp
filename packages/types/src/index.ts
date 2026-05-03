export * from './events';
export * from './models';

// ─── Auth & Roles ─────────────────────────────────────────────────────────────

export enum Role {
    USER = 'USER',
    COACH = 'COACH',
    TRAINER = 'TRAINER',
    NUTRITIONIST = 'NUTRITIONIST',
    DIETITIAN = 'DIETITIAN',
    ADMIN = 'ADMIN',
    SUPERADMIN = 'SUPERADMIN',
}

export enum CoachRelationStatus {
    PENDING = 'PENDING',
    ACTIVE = 'ACTIVE',
    PAUSED = 'PAUSED',
    ENDED = 'ENDED',
}

// ─── Subscriptions ────────────────────────────────────────────────────────────

export enum SubscriptionTier {
    FREE = 'FREE',
    PRO = 'PRO',
    PREMIUM = 'PREMIUM',
    ENTERPRISE = 'ENTERPRISE',
}

export enum SubStatus {
    ACTIVE = 'ACTIVE',
    CANCELLED = 'CANCELLED',
    PAST_DUE = 'PAST_DUE',
    TRIALING = 'TRIALING',
}

// ─── Shifts ───────────────────────────────────────────────────────────────────

export enum ShiftType {
    FIXED_NIGHT = 'FIXED_NIGHT',
    ROTATING = 'ROTATING',
    SPLIT = 'SPLIT',
    IRREGULAR = 'IRREGULAR',
    TWELVE_HOUR = 'TWELVE_HOUR',
}

export enum WorkIntensity {
    SEDENTARY = 'SEDENTARY',
    MODERATE = 'MODERATE',
    DEMANDING = 'DEMANDING',
}

// ─── Plans ────────────────────────────────────────────────────────────────────

export enum PlanStatus {
    DRAFT = 'DRAFT',
    PUBLISHED = 'PUBLISHED',
    ACTIVE = 'ACTIVE',
    ADJUSTED = 'ADJUSTED',
    SUPERSEDED = 'SUPERSEDED',
    INVALIDATED = 'INVALIDATED',
    EXPIRED = 'EXPIRED',
    DELETED = 'DELETED',
}

// ─── Meals ────────────────────────────────────────────────────────────────────

export enum MealType {
    BREAKFAST = 'BREAKFAST',
    LUNCH = 'LUNCH',
    DINNER = 'DINNER',
    SNACK = 'SNACK',
    PRE_WORKOUT = 'PRE_WORKOUT',
    POST_WORKOUT = 'POST_WORKOUT',
    PRE_SHIFT = 'PRE_SHIFT',
    POST_SHIFT = 'POST_SHIFT',
}

export enum DietaryPreference {
    NONE = 'NONE',
    VEGETARIAN = 'VEGETARIAN',
    VEGAN = 'VEGAN',
    KETO = 'KETO',
    HALAL = 'HALAL',
    GLUTEN_FREE = 'GLUTEN_FREE',
}

export enum DietMode {
    BALANCED = 'BALANCED',
    BUDGET = 'BUDGET',
    ACNE_SAFE = 'ACNE_SAFE',
    RAMADAN = 'RAMADAN',
    MASS_GAIN = 'MASS_GAIN',
    CUTTING = 'CUTTING',
}

export enum HealthCondition {
    ACNE = 'ACNE',
    INJURIES = 'INJURIES',
    ALLERGIES = 'ALLERGIES',
    DIABETES = 'DIABETES',
    HYPERTENSION = 'HYPERTENSION',
}

// ─── Fitness Goals & Lifestyle ────────────────────────────────────────────────

export enum FitnessGoal {
    MUSCLE_GAIN = 'MUSCLE_GAIN',
    FAT_LOSS = 'FAT_LOSS',
    MAINTENANCE = 'MAINTENANCE',
    ENDURANCE = 'ENDURANCE',
    STRENGTH = 'STRENGTH',
    GENERAL_HEALTH = 'GENERAL_HEALTH',
}

export enum ActivityLevel {
    SEDENTARY = 'SEDENTARY',
    LIGHTLY_ACTIVE = 'LIGHTLY_ACTIVE',
    MODERATELY_ACTIVE = 'MODERATELY_ACTIVE',
    VERY_ACTIVE = 'VERY_ACTIVE',
    EXTREMELY_ACTIVE = 'EXTREMELY_ACTIVE',
}

export enum ExperienceLevel {
    BEGINNER = 'BEGINNER',
    INTERMEDIATE = 'INTERMEDIATE',
    ADVANCED = 'ADVANCED',
    ATHLETE = 'ATHLETE',
}

export enum LifestyleType {
    STUDENT = 'STUDENT',
    OFFICE_WORKER = 'OFFICE_WORKER',
    NIGHT_SHIFT_WORKER = 'NIGHT_SHIFT_WORKER',
    ATHLETE = 'ATHLETE',
    STAY_AT_HOME = 'STAY_AT_HOME',
    FREELANCER = 'FREELANCER',
}

// ─── Exercise & Workouts ──────────────────────────────────────────────────────

export enum WorkoutType {
    STRENGTH = 'STRENGTH',
    CARDIO = 'CARDIO',
    HIIT = 'HIIT',
    MOBILITY = 'MOBILITY',
    SPORTS = 'SPORTS',
    YOGA = 'YOGA',
}

export enum WorkoutIntensity {
    LOW = 'LOW',
    MODERATE = 'MODERATE',
    HIGH = 'HIGH',
    MAX = 'MAX',
}

export enum SplitType {
    FULL_BODY = 'FULL_BODY',
    UPPER_LOWER = 'UPPER_LOWER',
    PUSH_PULL_LEGS = 'PUSH_PULL_LEGS',
    BRO_SPLIT = 'BRO_SPLIT',
    ARNOLD_SPLIT = 'ARNOLD_SPLIT',
    CUSTOM = 'CUSTOM',
}

export enum MuscleGroup {
    CHEST = 'CHEST',
    BACK = 'BACK',
    SHOULDERS = 'SHOULDERS',
    BICEPS = 'BICEPS',
    TRICEPS = 'TRICEPS',
    LEGS = 'LEGS',
    GLUTES = 'GLUTES',
    CORE = 'CORE',
    CALVES = 'CALVES',
    FULL_BODY = 'FULL_BODY',
}

// ─── Sleep ────────────────────────────────────────────────────────────────────

export enum SleepSource {
    MANUAL = 'MANUAL',
    APPLE_WATCH = 'APPLE_WATCH',
    OURA = 'OURA',
    FITBIT = 'FITBIT',
    GARMIN = 'GARMIN',
}

// ─── Notifications ────────────────────────────────────────────────────────────

export enum NotificationType {
    MEAL_REMINDER = 'MEAL_REMINDER',
    WORKOUT_REMINDER = 'WORKOUT_REMINDER',
    SLEEP_REMINDER = 'SLEEP_REMINDER',
    WATER_REMINDER = 'WATER_REMINDER',
    PLAN_READY = 'PLAN_READY',
    STREAK_UPDATE = 'STREAK_UPDATE',
    WEEKLY_REPORT = 'WEEKLY_REPORT',
    COACH_MESSAGE = 'COACH_MESSAGE',
    PLAN_STALE = 'PLAN_STALE',
    GOAL_ACHIEVED = 'GOAL_ACHIEVED',
    SHIFT_ALERT = 'SHIFT_ALERT',
    ADHERENCE_ALERT = 'ADHERENCE_ALERT',
}
