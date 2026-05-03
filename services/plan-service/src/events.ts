import { EventBus } from '@nightfuel/events';
import { Channels, CircadianProfileComputedPayload, NightFuelEvent } from '@nightfuel/types';
import { createLogger } from '@nightfuel/config';
import { PlanService } from './plan.service';

const logger = createLogger('plan-service:events');

export const setupEventSubscribers = async (eventBus: EventBus, planService: PlanService): Promise<void> => {
    // ── circadian:profile-computed ────────────────────────────────────────────
    // Emitted by circadian-engine after a shift is created or updated.
    // We use the computed profile to automatically generate a day plan so the
    // user's plan is ready before they open the app.
    eventBus.subscribe<CircadianProfileComputedPayload>(
        Channels.Circadian.ProfileComputed,
        async (event: NightFuelEvent<CircadianProfileComputedPayload>) => {
            const { userId, payload, correlationId } = event;
            logger.info(
                { userId, shiftId: payload.shiftId, shiftDate: payload.shiftDate, correlationId },
                'Received circadian:profile-computed — triggering plan generation'
            );

            try {
                // shiftDate from the payload is the canonical date for the plan
                const planDate = payload.shiftDate ?? new Date().toISOString().split('T')[0];

                await planService.generateAndStorePlan(
                    payload,
                    userId,
                    planDate,
                    payload.shiftId ?? null,
                );

                logger.info({ userId, planDate }, 'Plan auto-generated from circadian profile');
            } catch (err) {
                // Non-fatal: user can manually trigger POST /v1/plans/generate
                logger.error(
                    { err, userId, shiftId: payload.shiftId },
                    'Auto plan generation failed — user can retry via /generate endpoint'
                );
            }
        }
    );

    logger.info('plan-service: event subscribers registered');
};
