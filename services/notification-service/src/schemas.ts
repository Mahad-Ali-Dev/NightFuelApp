import { z } from 'zod';

// ---------------------------------------------------------------------------
// Enum mirror — kept in sync with the Prisma enum NotificationType
// ---------------------------------------------------------------------------
export const NotificationTypeEnum = z.enum([
    'MEAL_REMINDER',
    'SHIFT_ALERT',
    'PLAN_READY',
    'ADHERENCE_ALERT',
    'STREAK_MILESTONE',
    'SYSTEM',
    'WORKOUT_REMINDER',
    'SLEEP_REMINDER',
    'STREAK_UPDATE',
    'WEEKLY_REPORT',
    'COACH_MESSAGE',
    'GOAL_ACHIEVED',
]);

export type NotificationTypeValue = z.infer<typeof NotificationTypeEnum>;

// ---------------------------------------------------------------------------
// Query schemas
// ---------------------------------------------------------------------------

/**
 * GET /v1/notifications
 * limit: max number of records to return (default 20, max 100)
 * unreadOnly: when "true" / true, filter to only unread records
 */
export const listNotificationsQuerySchema = z.object({
    limit: z
        .string()
        .optional()
        .transform((val) => (val !== undefined ? parseInt(val, 10) : 20))
        .pipe(z.number().int().min(1).max(100)),
    unreadOnly: z
        .string()
        .optional()
        .transform((val) => val === 'true')
        .pipe(z.boolean()),
});

export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;

// ---------------------------------------------------------------------------
// Param schemas
// ---------------------------------------------------------------------------

export const notificationIdParamSchema = z.object({
    id: z.string().uuid(),
});

export type NotificationIdParam = z.infer<typeof notificationIdParamSchema>;

// ---------------------------------------------------------------------------
// Preference schemas
// ---------------------------------------------------------------------------

/**
 * PUT /v1/notifications/preferences
 * All fields are optional — partial update semantics.
 * Time strings are validated as HH:MM (24-hour).
 */
const timeString = z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Must be HH:MM in 24-hour format');

export const updatePreferencesSchema = z.object({
    mealReminderEnabled: z.boolean().optional(),
    shiftAlertEnabled: z.boolean().optional(),
    planReadyEnabled: z.boolean().optional(),
    adherenceAlertEnabled: z.boolean().optional(),
    workoutReminderEnabled: z.boolean().optional(),
    sleepReminderEnabled: z.boolean().optional(),
    streakUpdateEnabled: z.boolean().optional(),
    weeklyReportEnabled: z.boolean().optional(),
    coachMessageEnabled: z.boolean().optional(),
    quietHoursStart: timeString.optional(),
    quietHoursEnd: timeString.optional(),
});

export type UpdatePreferencesBody = z.infer<typeof updatePreferencesSchema>;

// ---------------------------------------------------------------------------
// Response shapes (used for serialisation type-hints only)
// ---------------------------------------------------------------------------

export const notificationResponseSchema = z.object({
    id: z.string().uuid(),
    userId: z.string().uuid(),
    type: NotificationTypeEnum,
    title: z.string(),
    body: z.string(),
    data: z.unknown().nullable(),
    isRead: z.boolean(),
    createdAt: z.string().datetime(),
});

export type NotificationResponse = z.infer<typeof notificationResponseSchema>;

export const preferenceResponseSchema = z.object({
    id: z.string().uuid(),
    userId: z.string().uuid(),
    mealReminderEnabled: z.boolean(),
    shiftAlertEnabled: z.boolean(),
    planReadyEnabled: z.boolean(),
    adherenceAlertEnabled: z.boolean(),
    workoutReminderEnabled: z.boolean(),
    sleepReminderEnabled: z.boolean(),
    streakUpdateEnabled: z.boolean(),
    weeklyReportEnabled: z.boolean(),
    coachMessageEnabled: z.boolean(),
    quietHoursStart: z.string(),
    quietHoursEnd: z.string(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
});

export type PreferenceResponse = z.infer<typeof preferenceResponseSchema>;
