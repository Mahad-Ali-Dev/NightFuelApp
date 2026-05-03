export interface NightFuelEvent<T = unknown> {
    eventId: string;
    eventType: string;
    producedAt: string;
    producerService: string;
    correlationId: string;
    userId: string;
    payload: T;
}

// ─── Event Payload Types ──────────────────────────────────────────────────────

export interface UserRegisteredPayload {
    email: string;
    displayName: string;
    role: string;
    timezone: string;
    region: string;
}

export interface UserOnboardingCompletedPayload {
    onboardingStep: number;
    completedAt: string;
}

export interface ShiftCreatedPayload {
    shiftId: string;
    shiftDate: string;
    startTime: string;
    endTime: string;
    shiftType: string;
    sleepWindowStart?: string | null;
    sleepWindowEnd?: string | null;
    workIntensity?: string | null;
    isDayOff: boolean;
}

export interface ShiftUpdatedPayload extends ShiftCreatedPayload { }

export interface CircadianProfileComputedPayload {
    shiftId: string;
    shiftDate: string;
    sleepStart: string;
    sleepEnd: string;
    caffeineWindowStart: string;
    caffeineWindowEnd: string;
    exerciseWindowStart: string;
    exerciseWindowEnd: string;
    melatoninOnset: string;
    cortisolPeak: string;
    insulinSensitivityPeak: string;
    mealWindows: Array<{
        mealType: string;
        startTime: string;
        endTime: string;
        recommendedCaloriePct: number;
        notes: string;
    }>;
}

export interface PlanGeneratedPayload {
    planId: string;
    planDate: string;
    shiftId?: string | null;
    calorieTarget: number;
    proteinTargetG: number;
    carbsTargetG: number;
    fatTargetG: number;
    generationModel: string;
    generationLatencyMs: number;
}

export interface MealLoggedPayload {
    mealLogId: string;
    loggedAt: string;
    mealType: string;
    totalCalories: number;
    totalProtein: number;
    totalCarbs: number;
    totalFat: number;
    isAdherent: boolean;
    mealsLogged?: number;
}

export interface ExerciseLoggedPayload {
    workoutId: string;
    type: string;
    title: string;
    durationMins: number;
    intensity: string;
    splitType?: string | null;
    caloriesBurned?: number | null;
    completedAt: string;
}

export interface SleepLoggedPayload {
    sleepSessionId: string;
    startTime: string;
    endTime?: string | null;
    durationMins?: number | null;
    quality?: number | null;
    disturbances: number;
    source: string;
    circadianAlignmentScore?: number | null;
}

export interface ProgressUpdatedPayload {
    date: string;
    calorieTarget: number;
    calorieActual: number;
    proteinActualG: number;
    carbsActualG: number;
    fatActualG: number;
    mealsLogged: number;
    isAdherent: boolean;
}

export interface UserStatusUpdatedPayload {
    fatigueScore: number;
    adherenceRate: number;
    currentStreak: number;
    circadianPeakTime?: string | null;
    circadianLowTime?: string | null;
    lastUpdatedBy: string;
}

export interface CycleAdvancedPayload {
    trainingPhase: string;
    newCycleWeek: number;
}

export interface StreakUpdatedPayload {
    currentStreak: number;
    longestStreak: number;
    lastAdherentDate: string;
    isNewRecord: boolean;
}

export interface BodyMetricsLoggedPayload {
    metricsId: string;
    measuredAt: string;
    weightKg?: number | null;
    bodyFatPct?: number | null;
    bmi?: number | null;
}

export interface NotificationSendPayload {
    type: string;
    title: string;
    body: string;
    data?: unknown;
}

export interface PlanRatingSubmittedPayload {
    planId: string;
    planDate: string;
    rating: number; // 1-5
}

// ─── Event Channels ───────────────────────────────────────────────────────────

export const Channels = {
    Auth: {
        UserRegistered: 'nightfuel:auth:user-registered',
        UserDeleted: 'nightfuel:auth:user-deleted',
    },
    User: {
        OnboardingCompleted: 'nightfuel:user:onboarding-completed',
        StatusUpdated: 'nightfuel:user:status-updated',
    },
    Shift: {
        ShiftCreated: 'nightfuel:shift:shift-created',
        ShiftUpdated: 'nightfuel:shift:shift-updated',
        ShiftDeleted: 'nightfuel:shift:shift-deleted',
    },
    Circadian: {
        ProfileComputed: 'nightfuel:circadian:profile-computed',
    },
    Plan: {
        GenerationRequested: 'nightfuel:plan:generation-requested',
        PlanGenerated: 'nightfuel:plan:plan-generated',
        RatingSubmitted: 'nightfuel:plan:rating-submitted',
    },
    Meal: {
        MealLogged: 'nightfuel:meal:meal-logged',
        MealDeleted: 'nightfuel:meal:meal-deleted',
    },
    Exercise: {
        WorkoutLogged: 'nightfuel:exercise:workout-logged',
        WorkoutDeleted: 'nightfuel:exercise:workout-deleted',
    },
    Sleep: {
        SessionLogged: 'nightfuel:sleep:session-logged',
        SessionUpdated: 'nightfuel:sleep:session-updated',
    },
    Progress: {
        DailyUpdated: 'nightfuel:progress:daily-updated',
        StreakUpdated: 'nightfuel:progress:streak-updated',
        MetricsLogged: 'nightfuel:progress:metrics-logged',
        WeeklyReport: 'nightfuel:progress:weekly-report',
        CycleAdvanced: 'nightfuel:progress:cycle-advanced',
    },
    Notification: {
        Send: 'nightfuel:notification:send',
    },
    Coach: {
        PlanAssigned: 'nightfuel:coach:plan-assigned',
        MessageSent: 'nightfuel:coach:message-sent',
    },
} as const;
