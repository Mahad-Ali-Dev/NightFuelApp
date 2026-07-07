import { PrismaClient, Notification, NotificationPreference, NotificationType } from './generated/prisma';
import { createLogger } from '@nightfuel/config';
import { UpdatePreferencesBody, ListNotificationsQuery } from './schemas';

const logger = createLogger('notification-service');

// ---------------------------------------------------------------------------
// Payload types for creating notifications from event subscribers
// ---------------------------------------------------------------------------

export interface CreateNotificationInput {
    userId: string;
    type: NotificationType;
    title: string;
    body: string;
    data?: Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// NotificationService
// Single concern: all database interactions for notifications & preferences.
// Event subscribers call this service — they are responsible for formatting
// the title/body before calling createNotification().
// ---------------------------------------------------------------------------

export class NotificationService {
    constructor(private readonly prisma: PrismaClient) { }

    // -----------------------------------------------------------------------
    // Notifications
    // -----------------------------------------------------------------------

    /**
     * List notifications for a user.
     * Results are ordered by createdAt DESC (newest first).
     */
    async listNotifications(
        userId: string,
        query: ListNotificationsQuery,
    ): Promise<Notification[]> {
        return this.prisma.notification.findMany({
            where: {
                userId,
                ...(query.unreadOnly ? { isRead: false } : {}),
            },
            orderBy: { createdAt: 'desc' },
            take: query.limit,
        });
    }

    /**
     * Mark a single notification as read.
     * Throws if the notification does not belong to the requesting user.
     */
    async markAsRead(id: string, userId: string): Promise<Notification> {
        const existing = await this.prisma.notification.findUnique({
            where: { id },
        });

        if (!existing) {
            throw new Error(`Notification ${id} not found`);
        }

        if (existing.userId !== userId) {
            throw new Error(`Notification ${id} does not belong to this user`);
        }

        return this.prisma.notification.update({
            where: { id },
            data: { isRead: true },
        });
    }

    /**
     * Mark all unread notifications for a user as read.
     * Returns the count of updated records.
     */
    async markAllAsRead(userId: string): Promise<number> {
        const result = await this.prisma.notification.updateMany({
            where: { userId, isRead: false },
            data: { isRead: true },
        });

        logger.info({ userId, count: result.count }, 'Marked all notifications as read');
        return result.count;
    }

    /**
     * Create a new notification record.
     * This is called by event subscribers and internal logic alike.
     * The caller must check preferences BEFORE calling this if preference-
     * gating is desired (see createNotificationIfEnabled).
     */
    async createNotification(input: CreateNotificationInput): Promise<Notification> {
        const notification = await this.prisma.notification.create({
            data: {
                userId: input.userId,
                type: input.type,
                title: input.title,
                body: input.body,
                data: (input.data as any) ?? undefined,
                isRead: false,
            },
        });

        logger.debug(
            { notificationId: notification.id, userId: input.userId, type: input.type },
            'Notification created',
        );

        return notification;
    }

    /**
     * Create a notification only if the user's preference allows it.
     * For types without a direct preference flag (STREAK_MILESTONE, SYSTEM)
     * the notification is always created.
     *
     * If the user has no preference record yet, a default one is upserted
     * so subsequent reads have a stable document.
     */
    async createNotificationIfEnabled(input: CreateNotificationInput): Promise<Notification | null> {
        const prefs = await this.getOrCreatePreferences(input.userId);

        const enabled = this.isTypeEnabled(input.type, prefs);
        if (!enabled) {
            logger.debug(
                { userId: input.userId, type: input.type },
                'Notification suppressed by user preference',
            );
            return null;
        }

        return this.createNotification(input);
    }

    // -----------------------------------------------------------------------
    // Preferences
    // -----------------------------------------------------------------------

    /**
     * Fetch preferences for a user, creating defaults if none exist.
     */
    async getOrCreatePreferences(userId: string): Promise<NotificationPreference> {
        return this.prisma.notificationPreference.upsert({
            where: { userId },
            update: {},
            create: {
                userId,
                mealReminderEnabled:    true,
                workoutReminderEnabled: true,
                sleepReminderEnabled:   true,
                shiftAlertEnabled:      true,
                planReadyEnabled:       true,
                adherenceAlertEnabled:  true,
                streakUpdateEnabled:    true,
                weeklyReportEnabled:    true,
                coachMessageEnabled:    true,
                quietHoursStart:        '22:00',
                quietHoursEnd:          '07:00',
            },
        });
    }

    /**
     * Partial update of a user's notification preferences.
     * Only the provided fields are updated (Prisma partial update semantics).
     */
    async updatePreferences(
        userId: string,
        body: UpdatePreferencesBody,
    ): Promise<NotificationPreference> {
        // Ensure a preferences record exists before updating
        await this.getOrCreatePreferences(userId);

        const updated = await this.prisma.notificationPreference.update({
            where: { userId },
            data: {
                ...(body.mealReminderEnabled !== undefined && {
                    mealReminderEnabled: body.mealReminderEnabled,
                }),
                ...(body.workoutReminderEnabled !== undefined && {
                    workoutReminderEnabled: body.workoutReminderEnabled,
                }),
                ...(body.sleepReminderEnabled !== undefined && {
                    sleepReminderEnabled: body.sleepReminderEnabled,
                }),
                ...(body.shiftAlertEnabled !== undefined && {
                    shiftAlertEnabled: body.shiftAlertEnabled,
                }),
                ...(body.planReadyEnabled !== undefined && {
                    planReadyEnabled: body.planReadyEnabled,
                }),
                ...(body.adherenceAlertEnabled !== undefined && {
                    adherenceAlertEnabled: body.adherenceAlertEnabled,
                }),
                ...(body.streakUpdateEnabled !== undefined && {
                    streakUpdateEnabled: body.streakUpdateEnabled,
                }),
                ...(body.weeklyReportEnabled !== undefined && {
                    weeklyReportEnabled: body.weeklyReportEnabled,
                }),
                ...(body.coachMessageEnabled !== undefined && {
                    coachMessageEnabled: body.coachMessageEnabled,
                }),
                ...(body.quietHoursStart !== undefined && {
                    quietHoursStart: body.quietHoursStart,
                }),
                ...(body.quietHoursEnd !== undefined && {
                    quietHoursEnd: body.quietHoursEnd,
                }),
            },
        });

        logger.info({ userId }, 'Notification preferences updated');
        return updated;
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    private isTypeEnabled(type: NotificationType, prefs: NotificationPreference): boolean {
        switch (type) {
            case 'MEAL_REMINDER':
                return prefs.mealReminderEnabled;
            case 'WORKOUT_REMINDER':
                return prefs.workoutReminderEnabled;
            case 'SLEEP_REMINDER':
                return prefs.sleepReminderEnabled;
            case 'SHIFT_ALERT':
                return prefs.shiftAlertEnabled;
            case 'PLAN_READY':
                return prefs.planReadyEnabled;
            case 'ADHERENCE_ALERT':
                return prefs.adherenceAlertEnabled;
            case 'STREAK_UPDATE':
                return prefs.streakUpdateEnabled;
            case 'WEEKLY_REPORT':
                return prefs.weeklyReportEnabled;
            case 'COACH_MESSAGE':
                return prefs.coachMessageEnabled;
            // GOAL_ACHIEVED and SYSTEM are always delivered
            case 'GOAL_ACHIEVED':
            case 'SYSTEM':
            default:
                return true;
        }
    }

    // -----------------------------------------------------------------------
    // GDPR purge
    // -----------------------------------------------------------------------

    /**
     * PERMANENTLY delete EVERY notification-service row owned by `userId`.
     *
     * Covers all three user-owned tables in this service's schema
     * (notification_preferences, notifications, push_subscriptions), each keyed
     * by the `userId` (user_id) column. There are no relation-keyed tables in
     * this service, so every delete is a direct `user_id = :userId` match — no
     * other user's data is ever touched.
     *
     * IDEMPOTENT: `deleteMany` never throws on zero matched rows, so purging a
     * user with no rows returns all-zero counts and re-purging is safe. All
     * deletes run inside a single `$transaction` so the purge is all-or-nothing
     * (a mid-purge failure leaves no partially-erased user).
     */
    async purgeUser(userId: string): Promise<{
        notification_preferences: number;
        notifications: number;
        push_subscriptions: number;
    }> {
        const [preferences, notifications, pushSubscriptions] = await this.prisma.$transaction([
            this.prisma.notificationPreference.deleteMany({ where: { userId } }),
            this.prisma.notification.deleteMany({ where: { userId } }),
            this.prisma.pushSubscription.deleteMany({ where: { userId } }),
        ]);

        return {
            notification_preferences: preferences.count,
            notifications: notifications.count,
            push_subscriptions: pushSubscriptions.count,
        };
    }

    // -----------------------------------------------------------------------
    // GDPR data export (Right of Access — read-only counterpart of purgeUser)
    // -----------------------------------------------------------------------

    /**
     * READ (never write) EVERY notification-service row owned by `userId` and
     * return it as a JSON object keyed by table name.
     *
     * MIRRORS purgeUser EXACTLY: the returned key set
     * (notification_preferences, notifications, push_subscriptions) is the SAME
     * set of user-owned tables the purge erases, so export and erasure stay in
     * sync. Each table is matched by the `userId` (user_id) column only — no
     * other user's data is ever read.
     *
     * SECURITY — push_subscriptions carries Web Push *credentials*: the
     * `endpoint` URL embeds a per-subscription secret token, `auth` is the Web
     * Push auth secret, and `p256dh` is the client key. These are NOT the user's
     * personal data and re-exporting them would leak live push credentials, so
     * they are NEVER returned raw — each is summarized as a presence boolean
     * (`endpointPresent` / `authPresent` / `p256dhPresent`). Only the
     * non-secret descriptive columns (id, userId, platform, timestamps) are
     * returned verbatim.
     *
     * READ-ONLY & IDEMPOTENT: only findMany / findUnique run; calling it twice
     * yields identical output and never mutates state. BOUNDED: the
     * (potentially large) notifications table is capped at EXPORT_ROW_LIMIT rows
     * (newest first) so a pathological user cannot force an unbounded payload;
     * `_meta` flags whether the notifications table was truncated at the cap.
     * The preferences row (0-or-1, unique on userId) and push_subscriptions
     * (small, device-count bounded) are not capped.
     */
    async exportUser(userId: string): Promise<{
        notification_preferences: NotificationPreference[];
        notifications: Notification[];
        push_subscriptions: Array<{
            id: string;
            userId: string;
            platform: string;
            endpointPresent: boolean;
            authPresent: boolean;
            p256dhPresent: boolean;
            createdAt: Date;
            updatedAt: Date;
        }>;
        _meta: { notificationsTruncated: boolean; rowLimit: number };
    }> {
        const cap = EXPORT_ROW_LIMIT;

        const [preference, notifications, pushSubscriptions] = await Promise.all([
            this.prisma.notificationPreference.findUnique({ where: { userId } }),
            this.prisma.notification.findMany({
                where: { userId },
                orderBy: { createdAt: 'desc' },
                take: cap + 1,
            }),
            this.prisma.pushSubscription.findMany({
                where: { userId },
                orderBy: { createdAt: 'desc' },
            }),
        ]);

        const notificationsTruncated = notifications.length > cap;

        return {
            // 0-or-1 row; `userId` is @unique. Returned as an array so the shape
            // is uniform across tables and matches the purge's per-table model.
            notification_preferences: preference ? [preference] : [],
            notifications: notificationsTruncated ? notifications.slice(0, cap) : notifications,
            // SECRET-SCRUBBED: never emit endpoint / auth / p256dh raw — only a
            // presence flag plus the non-sensitive descriptive columns.
            push_subscriptions: pushSubscriptions.map((s) => ({
                id: s.id,
                userId: s.userId,
                platform: s.platform,
                endpointPresent: s.endpoint != null && s.endpoint.length > 0,
                authPresent: s.auth != null && s.auth.length > 0,
                p256dhPresent: s.p256dh != null && s.p256dh.length > 0,
                createdAt: s.createdAt,
                updatedAt: s.updatedAt,
            })),
            _meta: { notificationsTruncated, rowLimit: cap },
        };
    }
}

// Per-table row cap for the GDPR export. Generous enough that a real user's full
// notification history is returned, but bounds the payload so a pathological user
// cannot force an unbounded read. `take: cap + 1` lets exportUser detect (and
// flag) truncation at the cap.
const EXPORT_ROW_LIMIT = 50_000;
