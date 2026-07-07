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
// Push-subscription input bounds (reusable)
// ---------------------------------------------------------------------------
// These cap the previously UNBOUNDED write surface on the push handlers so an
// oversized / poisoned payload can never be persisted. Lengths are generous
// upper bounds — they accept every realistic real-world value and only reject
// abuse, so valid behaviour is unchanged.

/**
 * Expo push token, e.g. `ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]`.
 * Real tokens are ~40-50 chars; 256 is a safe cap that never rejects a valid
 * dev or production token. We deliberately ship the length cap WITHOUT a
 * shape regex so legitimate (and occasionally non-standard dev) tokens are
 * never spuriously rejected — the cap alone closes the unbounded-write hole.
 */
export const expoPushTokenSchema = z.string().min(1).max(256);

/**
 * Web Push endpoint URL (the push-service URL the browser hands us). It must
 * be a valid URL and is capped at 2048 chars (a conventional safe URL ceiling).
 */
export const webPushEndpointSchema = z.string().url().max(2048);

/**
 * Web Push key material (p256dh / auth). Base64url-encoded values are short;
 * 512 is a generous cap that accepts every valid key while bounding the write.
 */
export const webPushKeySchema = z.string().min(1).max(512);

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
