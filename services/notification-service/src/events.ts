import { EventBus } from '@nightfuel/events';
import {
    NightFuelEvent,
    Channels,
    PlanGeneratedPayload,
    ShiftCreatedPayload,
    MealLoggedPayload,
    ExerciseLoggedPayload,
    SleepLoggedPayload,
    StreakUpdatedPayload,
    ProgressUpdatedPayload,
} from '@nightfuel/types';
import { createLogger } from '@nightfuel/config';
import { NotificationService } from './notification.service';

const logger = createLogger('notification-service:events');

// ─── Helper ───────────────────────────────────────────────────────────────────

/** Push a persisted notification to the user's real-time room if Socket.IO is ready */
function broadcastToUser(fastify: any, userId: string, notification: any): void {
    if (notification && fastify?.io) {
        fastify.io.to(`user:${userId}`).emit('notification:new', notification);
    }
}

// ─── Subscriber setup ─────────────────────────────────────────────────────────

/**
 * Register all event subscribers on the provided EventBus.
 * Every subscriber is wrapped in try/catch — a failure must never crash the process.
 */
export function setupEventSubscribers(
    eventBus: EventBus,
    notificationService: NotificationService,
    fastify: any,
): void {
    // ── plan:plan-generated → PLAN_READY ─────────────────────────────────────
    eventBus.subscribeDurable<PlanGeneratedPayload>({
        stream: Channels.Plan.PlanGenerated,
        group: 'notification-service',
        handler: async (event: NightFuelEvent<PlanGeneratedPayload>) => {
            const { userId, payload, eventId } = event;
            if (!userId) return;
            try {
                const dateLabel = (payload.planDate ?? '').split('T')[0] || 'today';
                const n = await notificationService.createNotificationIfEnabled({
                    userId,
                    type: 'PLAN_READY',
                    title: 'Your NightFuel plan is ready!',
                    body: `Your AI-powered plan for ${dateLabel} is ready. Tap to view.`,
                    data: { planId: payload.planId, planDate: dateLabel, eventId },
                });
                broadcastToUser(fastify, userId, n);
                logger.info({ userId, planDate: dateLabel }, 'PLAN_READY notification sent');
            } catch (err) {
                logger.error({ err, eventId }, 'Failed to send PLAN_READY notification');
                throw err;
            }
        }
    });

    // ── shift:shift-created → SHIFT_ALERT ────────────────────────────────────
    eventBus.subscribeDurable<ShiftCreatedPayload>({
        stream: Channels.Shift.ShiftCreated,
        group: 'notification-service',
        handler: async (event: NightFuelEvent<ShiftCreatedPayload>) => {
            const { userId, payload, eventId } = event;
            if (!userId) return;
            try {
                const dateLabel = payload.shiftDate?.split('T')[0] ?? 'today';
                const n = await notificationService.createNotificationIfEnabled({
                    userId,
                    type: 'SHIFT_ALERT',
                    title: 'Shift logged',
                    body: `Shift for ${dateLabel} saved. Your plan is being generated...`,
                    data: { shiftDate: dateLabel, shiftType: payload.shiftType, eventId },
                });
                broadcastToUser(fastify, userId, n);
                logger.info({ userId, shiftDate: dateLabel }, 'SHIFT_ALERT notification sent');
            } catch (err) {
                logger.error({ err, eventId }, 'Failed to send SHIFT_ALERT notification');
                throw err;
            }
        }
    });

    // ── meal:meal-logged → MEAL_REMINDER ─────────────────────────────────────
    eventBus.subscribeDurable<MealLoggedPayload>({
        stream: Channels.Meal.MealLogged,
        group: 'notification-service',
        handler: async (event: NightFuelEvent<MealLoggedPayload>) => {
            const { userId, payload, eventId } = event;
            if (!userId) return;
            try {
                const n = await notificationService.createNotificationIfEnabled({
                    userId,
                    type: 'MEAL_REMINDER',
                    title: 'Meal logged',
                    body: `${payload.totalCalories} kcal recorded — ${payload.mealsLogged ?? 'a'} meal(s) logged today.`,
                    data: { mealLogId: payload.mealLogId, mealType: payload.mealType, eventId },
                });
                broadcastToUser(fastify, userId, n);
                logger.info({ userId, mealLogId: payload.mealLogId }, 'MEAL_REMINDER notification sent');
            } catch (err) {
                logger.error({ err, eventId }, 'Failed to send MEAL_REMINDER notification');
                throw err;
            }
        }
    });

    // ── exercise:workout-logged → WORKOUT_REMINDER ───────────────────────────
    eventBus.subscribeDurable<ExerciseLoggedPayload>({
        stream: Channels.Exercise.WorkoutLogged,
        group: 'notification-service',
        handler: async (event: NightFuelEvent<ExerciseLoggedPayload>) => {
            const { userId, payload, eventId } = event;
            if (!userId) return;
            try {
                const n = await notificationService.createNotificationIfEnabled({
                    userId,
                    type: 'WORKOUT_REMINDER',
                    title: 'Workout complete!',
                    body: `${payload.title} (${payload.durationMins} min) logged. Great work!`,
                    data: { workoutId: payload.workoutId, type: payload.type, eventId },
                });
                broadcastToUser(fastify, userId, n);
                logger.info({ userId, workoutId: payload.workoutId }, 'WORKOUT_REMINDER notification sent');
            } catch (err) {
                logger.error({ err, eventId }, 'Failed to send WORKOUT_REMINDER notification');
                throw err;
            }
        }
    });

    // ── sleep:session-logged → SLEEP_REMINDER ────────────────────────────────
    eventBus.subscribeDurable<SleepLoggedPayload>({
        stream: Channels.Sleep.SessionLogged,
        group: 'notification-service',
        handler: async (event: NightFuelEvent<SleepLoggedPayload>) => {
            const { userId, payload, eventId } = event;
            if (!userId || !payload.durationMins) return; // Only notify once session has end time
            try {
                const hrs = Math.floor(payload.durationMins / 60);
                const mins = payload.durationMins % 60;
                const score = payload.circadianAlignmentScore;
                const alignText = score !== null && score !== undefined
                    ? ` Circadian alignment: ${score}/100.`
                    : '';
                const n = await notificationService.createNotificationIfEnabled({
                    userId,
                    type: 'SLEEP_REMINDER',
                    title: 'Sleep session recorded',
                    body: `You slept ${hrs}h ${mins}m (quality: ${payload.quality ?? '?'}/10).${alignText}`,
                    data: { sleepSessionId: payload.sleepSessionId, durationMins: payload.durationMins, eventId },
                });
                broadcastToUser(fastify, userId, n);
                logger.info({ userId, sleepSessionId: payload.sleepSessionId }, 'SLEEP_REMINDER notification sent');
            } catch (err) {
                logger.error({ err, eventId }, 'Failed to send SLEEP_REMINDER notification');
                throw err;
            }
        }
    });

    // ── progress:streak-updated → STREAK_UPDATE ──────────────────────────────
    eventBus.subscribeDurable<StreakUpdatedPayload>({
        stream: Channels.Progress.StreakUpdated,
        group: 'notification-service',
        handler: async (event: NightFuelEvent<StreakUpdatedPayload>) => {
            const { userId, payload, eventId } = event;
            if (!userId) return;
            try {
                const isNewRecord = payload.isNewRecord;
                const n = await notificationService.createNotificationIfEnabled({
                    userId,
                    type: 'STREAK_UPDATE',
                    title: isNewRecord
                        ? `New streak record: ${payload.currentStreak} days!`
                        : `${payload.currentStreak}-day streak!`,
                    body: isNewRecord
                        ? `You've hit a new personal best — ${payload.longestStreak} days of adherence!`
                        : `Keep it up! You've been adherent for ${payload.currentStreak} consecutive days.`,
                    data: {
                        currentStreak: payload.currentStreak,
                        longestStreak: payload.longestStreak,
                        isNewRecord,
                        eventId,
                    },
                });
                broadcastToUser(fastify, userId, n);
                logger.info({ userId, currentStreak: payload.currentStreak, isNewRecord }, 'STREAK_UPDATE notification sent');
            } catch (err) {
                logger.error({ err, eventId }, 'Failed to send STREAK_UPDATE notification');
                throw err;
            }
        }
    });

    // ── progress:daily-updated → ADHERENCE_ALERT (when adherent) ─────────────
    eventBus.subscribeDurable<ProgressUpdatedPayload>({
        stream: Channels.Progress.DailyUpdated,
        group: 'notification-service',
        handler: async (event: NightFuelEvent<ProgressUpdatedPayload>) => {
            const { userId, payload, eventId } = event;
            if (!userId || !payload.isAdherent) return; // Only celebrate adherence, not failures
            try {
                const pct = payload.calorieTarget > 0
                    ? Math.round((payload.calorieActual / payload.calorieTarget) * 100)
                    : 0;
                const n = await notificationService.createNotificationIfEnabled({
                    userId,
                    type: 'ADHERENCE_ALERT',
                    title: "You're on track today!",
                    body: `You've hit ${pct}% of your calorie goal — great adherence!`,
                    data: { date: payload.date, pct, eventId },
                });
                broadcastToUser(fastify, userId, n);
                logger.info({ userId, date: payload.date, pct }, 'ADHERENCE_ALERT notification sent');
            } catch (err) {
                logger.error({ err, eventId }, 'Failed to send ADHERENCE_ALERT notification');
                throw err;
            }
        }
    });

    const subscribedChannels = [
        Channels.Plan.PlanGenerated,
        Channels.Shift.ShiftCreated,
        Channels.Meal.MealLogged,
        Channels.Exercise.WorkoutLogged,
        Channels.Sleep.SessionLogged,
        Channels.Progress.StreakUpdated,
        Channels.Progress.DailyUpdated,
    ];

    logger.info({ channels: subscribedChannels }, 'notification-service: all event subscribers registered');
}
