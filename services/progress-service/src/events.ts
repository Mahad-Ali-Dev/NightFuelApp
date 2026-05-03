import { EventBus } from '@nightfuel/events';
import {
    Channels,
    MealLoggedPayload,
    NightFuelEvent,
    PlanGeneratedPayload,
    UserStatusUpdatedPayload,
} from '@nightfuel/types';
import { createLogger } from '@nightfuel/config';
import { ProgressService } from './progress.service';

const logger = createLogger('progress-service:events');

/**
 * Wire up all Redis Pub/Sub subscriptions for the progress-service.
 *
 * Channels subscribed:
 *   - nightfuel:meal:meal-logged    → accumulate macro actuals + recompute adherence
 *   - nightfuel:plan:plan-generated → set calorie/macro targets for the plan date
 */
export const setupEventSubscribers = async (
    eventBus: EventBus,
    progressService: ProgressService,
): Promise<void> => {
    // ── meal:meal-logged ──────────────────────────────────────────────────────
    eventBus.subscribeDurable<MealLoggedPayload>({
        stream: Channels.Meal.MealLogged,
        group: 'progress-service',
        handler: async (event: NightFuelEvent<MealLoggedPayload>) => {
            const { userId, payload, correlationId, eventId } = event;
            logger.info({ userId, correlationId, eventId }, 'Received meal:meal-logged');

            try {
                await progressService.handleMealLogged({
                    userId,
                    payload: {
                        mealLogId: payload.mealLogId,
                        totalCalories: payload.totalCalories,
                        totalProtein: payload.totalProtein,
                        totalCarbs: payload.totalCarbs,
                        totalFat: payload.totalFat,
                        mealType: payload.mealType,
                        loggedAt: payload.loggedAt,
                    },
                });
                logger.info({ userId, correlationId }, 'meal-logged processed');
            } catch (err) {
                logger.error({ err, userId, correlationId }, 'Failed to process meal-logged');
                throw err; // Rethrow to avoid XACKing and allow retry
            }
        }
    });

    // ── plan:plan-generated ───────────────────────────────────────────────────
    eventBus.subscribeDurable<PlanGeneratedPayload>({
        stream: Channels.Plan.PlanGenerated,
        group: 'progress-service',
        handler: async (event: NightFuelEvent<PlanGeneratedPayload>) => {
            const { userId, payload, correlationId, eventId } = event;
            logger.info({ userId, correlationId, eventId }, 'Received plan:plan-generated');

            try {
                await progressService.handlePlanGenerated({
                    userId,
                    payload: {
                        planId: payload.planId,
                        userId,
                        date: payload.planDate,
                        caloriesTarget: payload.calorieTarget,
                        proteinTarget: payload.proteinTargetG,
                        carbsTarget: payload.carbsTargetG,
                        fatTarget: payload.fatTargetG,
                    },
                });
                logger.info({ userId, correlationId }, 'plan-generated processed');
            } catch (err) {
                logger.error({ err, userId, correlationId }, 'Failed to process plan-generated');
                throw err;
            }
        }
    });

    // ── user:status-updated ───────────────────────────────────────────────────
    eventBus.subscribeDurable<UserStatusUpdatedPayload>({
        stream: Channels.User.StatusUpdated,
        group: 'progress-service',
        handler: async (event: NightFuelEvent<UserStatusUpdatedPayload>) => {
            const { userId, payload, correlationId, eventId } = event;
            logger.info({ userId, correlationId, eventId }, 'Received user:status-updated');

            try {
                await progressService.handleStatusUpdated({
                    userId,
                    payload
                });
                logger.info({ userId, correlationId }, 'status-updated processed');
            } catch (err) {
                logger.error({ err, userId, correlationId }, 'Failed to process status-updated');
                throw err;
            }
        }
    });

    logger.info('progress-service: event subscribers registered');
};
