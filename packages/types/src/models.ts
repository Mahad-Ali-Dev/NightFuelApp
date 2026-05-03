// ─── User & Auth ─────────────────────────────────────────────────────────────

export interface User {
    id: string;
    email: string;
    displayName: string;
    avatarUrl?: string | null;
    timezone: string;
    locale: string;
    region: string;
    role: string; // Enum Role
    createdAt: Date;
    updatedAt: Date;
}

export interface UserProfile {
    id: string;
    userId: string;
    displayName: string;
    avatarUrl?: string | null;
    dateOfBirth?: Date | null;
    heightCm?: number | null;
    weightKg?: number | null;
    biologicalSex?: string | null;
    timezone: string;
    onboardingCompleted: boolean;
    onboardingStep: number;
    createdAt: Date;
    updatedAt: Date;
}

export interface UserPreferences {
    id: string;
    userId: string;
    primaryGoal: string;           // Enum FitnessGoal
    dietaryPreference: string;     // Enum DietaryPreference
    targetCalories?: number | null;
    targetProteinG?: number | null;
    targetCarbsG?: number | null;
    targetFatG?: number | null;
    activityLevel: string;         // Enum ActivityLevel
    experienceLevel: string;       // Enum ExperienceLevel
    lifestyleType: string;         // Enum LifestyleType
    sleepWindowStart?: string | null;
    sleepWindowEnd?: string | null;
    allergies: string[];
    healthConditions: string[];
    dietMode: string;              // Enum DietMode
    workoutEnvironment?: string | null;  // Enum WorkoutEnvironment: HOME, GYM, HYBRID
    availableEquipment: string[];        // Array of Enum Equipment: DUMBBELLS, BARBELL, etc.
    isBodybuilderMode: boolean;
    isInjurySafeMode: boolean;
    workoutDurationPreference: number;   // 20, 40, 60
    splitPreference: string;             // Enum SplitType: PPL, BRO_SPLIT, etc.
    updatedAt: Date;
}

export interface CoachProfile {
    id: string;
    userId: string;
    specializations: string[];     // e.g. ['nutrition', 'strength', 'night-shift']
    bio?: string | null;
    certifications: string[];
    isAvailable: boolean;
    monthlyRateUsd?: number | null;
    createdAt: Date;
    updatedAt: Date;
}

export interface CoachClientRelation {
    id: string;
    coachUserId: string;
    clientUserId: string;
    status: string;                // Enum CoachRelationStatus
    startedAt: Date;
    endedAt?: Date | null;
    createdAt: Date;
}

// ─── Shift ───────────────────────────────────────────────────────────────────

export interface Shift {
    id: string;
    userId: string;
    shiftDate: Date;
    startTime: Date;
    endTime: Date;
    shiftType: string;             // Enum ShiftType
    sleepWindowStart?: string | null;
    sleepWindowEnd?: string | null;
    workIntensity?: string | null; // Enum WorkIntensity
    commuteMinutes?: number | null;
    isDayOff: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export interface RotationPattern {
    id: string;
    userId: string;
    patternName: string;
    cycleDays: number;
    pattern: unknown;              // JSON array of shift descriptors
    isActive: boolean;
    createdAt: Date;
}

// ─── Circadian & Plans ────────────────────────────────────────────────────────

export interface CircadianProfile {
    userId: string;
    shiftId: string;
    computedAt: string;
    sleepStart: string;
    sleepEnd: string;
    caffeineWindowStart: string;
    caffeineWindowEnd: string;
    exerciseWindowStart: string;
    exerciseWindowEnd: string;
    mealWindows: MealWindow[];
    melatoninOnset: string;
    cortisolPeak: string;
    insulinSensitivityPeak: string;
}

export interface MealWindow {
    mealType: string;              // 'pre-shift' | 'main' | 'recovery' | 'light'
    startTime: string;
    endTime: string;
    recommendedCaloriePct: number;
    notes: string;
}

export interface DayPlan {
    id: string;
    userId: string;
    planDate: Date;
    shiftId?: string | null;
    circadianProfileId?: string | null;
    planVersion: number;
    plan: unknown;                 // JSON — structured plan from ai-pipeline
    generationModel: string;
    generationLatencyMs?: number | null;
    generationTokens?: number | null;
    userRating?: number | null;
    status: string;                // Enum PlanStatus
    createdAt: Date;
    updatedAt: Date;
}

// ─── Meals ────────────────────────────────────────────────────────────────────

export interface FoodItem {
    id: string;
    name: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number;
    sugar: number;
    sodiumMg: number;
    servingSize: string;
    glycemicIndex?: number | null;
    isVegan: boolean;
    isGlutenFree: boolean;
    isHalal: boolean;
    region?: string | null;
    cuisineTags: string[];
    source: string;            // 'FOODB' | 'OPENFOODFACTS' | 'CUSTOM'
    foodGroup?: string | null;
    createdAt: Date;
    updatedAt: Date;
}

export interface MealLog {
    id: string;
    userId: string;
    loggedAt: Date;
    mealType: string;              // Enum MealType
    foodItems: unknown;            // JSON array of logged foods
    totalCalories: number;
    totalProtein: number;
    totalCarbs: number;
    totalFat: number;
    isAdherent: boolean;
    createdAt: Date;
    updatedAt: Date;
}

// ─── Exercise ────────────────────────────────────────────────────────────────

export interface Workout {
    id: string;
    userId: string;
    type: string;                  // Enum WorkoutType
    title: string;
    durationMins: number;
    intensity: string;             // Enum WorkoutIntensity
    splitType?: string | null;     // Enum SplitType
    muscleGroups: string[];
    caloriesBurned?: number | null;
    notes?: string | null;
    completedAt: Date;
    createdAt: Date;
    exercises: ExerciseSet[];
}

export interface ExerciseSet {
    id: string;
    workoutId: string;
    name: string;
    muscleGroup: string;
    sets?: number | null;
    reps?: number | null;
    weightKg?: number | null;
    distanceKm?: number | null;
    durationSecs?: number | null;
    restSecs?: number | null;
    order: number;
}

export interface WorkoutPlan {
    id: string;
    userId: string;
    planName: string;
    splitType: string;             // Enum SplitType
    weeklyFrequency: number;
    durationWeeks: number;
    days: WorkoutDay[];
    isActive: boolean;
    generatedBy: string;           // 'ai' | 'coach' | 'user'
    createdAt: Date;
    updatedAt: Date;
}

export interface WorkoutDay {
    dayOfWeek: number;             // 0=Sunday, 6=Saturday
    focus: string;                 // e.g. 'Push', 'Pull', 'Legs', 'Rest'
    estimatedDurationMins: number;
    exercises: PlannedExercise[];
}

export interface PlannedExercise {
    name: string;
    muscleGroup: string;
    sets: number;
    reps: string;                  // e.g. '8-12' or '5'
    restSecs: number;
    notes?: string;
}

// ─── Sleep ────────────────────────────────────────────────────────────────────

export interface SleepSession {
    id: string;
    userId: string;
    startTime: Date;
    endTime?: Date | null;
    durationMins?: number | null;
    quality?: number | null;       // 1-10
    disturbances: number;
    source: string;                // Enum SleepSource
    circadianAlignmentScore?: number | null; // 0-100, computed from circadian profile
    notes?: string | null;
    createdAt: Date;
}

export interface SleepInsight {
    userId: string;
    periodStart: Date;
    periodEnd: Date;
    avgDurationMins: number;
    avgQuality: number;
    avgAlignmentScore: number;
    totalSessions: number;
    recommendation: string;
}

// ─── Progress & Tracking ──────────────────────────────────────────────────────

export interface DailyProgress {
    id: string;
    userId: string;
    date: Date;
    calorieTarget: number;
    calorieActual: number;
    proteinTargetG: number;
    proteinActualG: number;
    carbsTargetG: number;
    carbsActualG: number;
    fatTargetG: number;
    fatActualG: number;
    mealsLogged: number;
    isAdherent: boolean;
    planId?: string | null;
    createdAt: Date;
    updatedAt: Date;
}

export interface Streak {
    id: string;
    userId: string;
    currentStreak: number;
    longestStreak: number;
    lastAdherentDate?: Date | null;
}

export interface BodyMetrics {
    id: string;
    userId: string;
    measuredAt: Date;
    weightKg?: number | null;
    bodyFatPct?: number | null;
    muscleMassKg?: number | null;
    waistCm?: number | null;
    hipCm?: number | null;
    chestCm?: number | null;
    armCm?: number | null;
    thighCm?: number | null;
    bmi?: number | null;
    notes?: string | null;
    createdAt: Date;
}

export interface StrengthLog {
    id: string;
    userId: string;
    exerciseName: string;
    loggedAt: Date;
    bestSetWeightKg: number;
    bestSetReps: number;
    estimatedOneRepMax: number;    // Brzycki formula
    createdAt: Date;
}

export interface WeeklyReport {
    userId: string;
    weekStart: Date;
    weekEnd: Date;
    avgDailyCalories: number;
    avgProteinG: number;
    adherencePct: number;
    workoutsCompleted: number;
    avgSleepDurationMins: number;
    avgSleepQuality: number;
    weightChangeDelta?: number | null;
    aiInsights: string;
    generatedAt: Date;
}

// ─── Notifications ────────────────────────────────────────────────────────────

export interface Notification {
    id: string;
    userId: string;
    type: string;                  // Enum NotificationType
    title: string;
    body: string;
    data?: unknown;
    isRead: boolean;
    createdAt: Date;
}

// ─── Chat / AI Assistant ──────────────────────────────────────────────────────

export interface ChatMessage {
    id: string;
    conversationId: string;
    userId: string;
    role: string;                  // 'user' | 'assistant'
    content: string;
    tokensUsed?: number | null;
    createdAt: Date;
}

export interface ConversationThread {
    id: string;
    userId: string;
    title?: string | null;
    lastMessageAt: Date;
    messageCount: number;
    createdAt: Date;
}

// ─── Subscriptions ────────────────────────────────────────────────────────────

export interface Subscription {
    id: string;
    userId: string;
    tier: string;                  // Enum SubscriptionTier
    status: string;                // Enum SubStatus
    currentPeriodStart: Date;
    currentPeriodEnd?: Date | null;
    cancelAtPeriodEnd: boolean;
    stripeCustomerId?: string | null;
    stripeSubId?: string | null;
    createdAt: Date;
    updatedAt: Date;
}
