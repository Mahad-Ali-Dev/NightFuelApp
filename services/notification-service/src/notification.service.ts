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
                ...(body.shiftAlertEnabled !== undefined && {
                    shiftAlertEnabled: body.shiftAlertEnabled,
                }),
                ...(body.planReadyEnabled !== undefined && {
                    planReadyEnabled: body.planReadyEnabled,
                }),
                ...(body.adherenceAlertEnabled !== undefined && {
                    adherenceAlertEnabled: body.adherenceAlertEnabled,
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
}
