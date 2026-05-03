import { EventBus } from '@nightfuel/events';
import {
    NightFuelEvent,
    Channels,
    UserRegisteredPayload,
    CircadianProfileComputedPayload,
    ProgressUpdatedPayload,
    StreakUpdatedPayload,
    SleepLoggedPayload
} from '@nightfuel/types';
import { createLogger } from '@nightfuel/config';
import { UserService } from './user.service';

const logger = createLogger('user-service:events');

/**
 * Wire up all Redis Durable Stream subscriptions for the user-service.
 */
export const setupEventSubscribers = (eventBus: EventBus, userService: UserService): void => {
    // ── auth:user-registered ────────────────────────────────────────────────
    eventBus.subscribeDurable<UserRegisteredPayload>({
        stream: Channels.Auth.UserRegistered,
        group: 'user-service',
        handler: async (event: NightFuelEvent<UserRegisteredPayload>) => {
            const { userId, payload, correlationId } = event;
            logger.info({ userId, correlationId, role: payload.role }, 'Received user-registered event');

            try {
                const displayName = payload.displayName?.trim() || 'User';
                await userService.createProfileFromRegistration({
                    userId,
                    displayName,
                    email: payload.email,
                    timezone: payload.timezone,
                    role: payload.role,
                    region: payload.region,
                });
                logger.info({ userId, correlationId }, 'Profile provisioning complete');
            } catch (error) {
                logger.error({ userId, correlationId, error }, 'Failed to provision user profile');
                throw error;
            }
        }
    });

    // ── circadian:profile-computed ───────────────────────────────────────────
    eventBus.subscribeDurable<CircadianProfileComputedPayload>({
        stream: Channels.Circadian.ProfileComputed,
        group: 'user-service',
        handler: async (event: NightFuelEvent<CircadianProfileComputedPayload>) => {
            const { userId, payload } = event;
            try {
                await userService.updateUserStatus(userId, {
                    circadianPeakTime: payload.cortisolPeak,
                    circadianLowTime: payload.melatoninOnset,
                    lastUpdatedBy: 'circadian-engine',
                });
            } catch (error) {
                logger.error({ userId, error }, 'Failed to update user status from circadian event');
                throw error;
            }
        }
    });

    // ── progress:daily-updated ────────────────────────────────────────────────
    eventBus.subscribeDurable<ProgressUpdatedPayload>({
        stream: Channels.Progress.DailyUpdated,
        group: 'user-service',
        handler: async (event: NightFuelEvent<ProgressUpdatedPayload>) => {
            const { userId, payload } = event;
            try {
                await userService.updateUserStatus(userId, {
                    adherenceRate: payload.isAdherent ? 100 : 0,
                    lastUpdatedBy: 'progress-service',
                });
            } catch (error) {
                logger.error({ userId, error }, 'Failed to update user status from progress event');
                throw error;
            }
        }
    });

    // ── progress:streak-updated ──────────────────────────────────────────────
    eventBus.subscribeDurable<StreakUpdatedPayload>({
        stream: Channels.Progress.StreakUpdated,
        group: 'user-service',
        handler: async (event: NightFuelEvent<StreakUpdatedPayload>) => {
            const { userId, payload } = event;
            try {
                await userService.updateUserStatus(userId, {
                    currentStreak: payload.currentStreak,
                    lastUpdatedBy: 'progress-service',
                });
            } catch (error) {
                logger.error({ userId, error }, 'Failed to update user status from streak event');
                throw error;
            }
        }
    });

    // ── sleep:session-logged ──────────────────────────────────────────────────
    eventBus.subscribeDurable<SleepLoggedPayload>({
        stream: Channels.Sleep.SessionLogged,
        group: 'user-service',
        handler: async (event: NightFuelEvent<SleepLoggedPayload>) => {
            const { userId, payload } = event;
            try {
                // Simplified fatigue calculation: Inverse of quality (50%) and alignment (50%)
                const quality = payload.quality ?? 5; // 0-10
                const alignment = payload.circadianAlignmentScore ?? 70; // 0-100
                const fatigueScore = Math.max(0, 100 - (quality * 10 * 0.5 + alignment * 0.5));

                await userService.updateUserStatus(userId, {
                    fatigueScore,
                    lastUpdatedBy: 'sleep-service',
                });
            } catch (error) {
                logger.error({ userId, error }, 'Failed to update user status from sleep event');
                throw error;
            }
        }
    });

    logger.info('user-service: event subscribers registered');
};
