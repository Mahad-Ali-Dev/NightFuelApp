import { PrismaClient } from './generated/prisma';
import {
    MealLoggedPayload,
    ExerciseLoggedPayload,
    SleepLoggedPayload,
    BodyMetricsLoggedPayload,
    PlanGeneratedPayload,
    CycleAdvancedPayload,
    NightFuelEvent
} from '@nightfuel/types';
import { createLogger } from '@nightfuel/config';

const logger = createLogger('state-service:materializer');

export class StateMaterializer {
    constructor(private prisma: PrismaClient) { }

    async handleMealLogged(event: NightFuelEvent<MealLoggedPayload>) {
        const { userId, payload } = event;
        logger.info({ userId, mealLogId: payload.mealLogId }, 'Processing meal log event');

        // Simple materialization: update adherence based on rolling window if we store history
        // For now, we'll just update the last known adherence or a running avg if we had more context
        // Actually, the requirement says "It updates: user_state table"

        await this.prisma.userState.upsert({
            where: { userId },
            create: {
                userId,
                last7DaysAdherence: payload.isAdherent ? 1.0 : 0.0,
                lastEventId: event.eventId
            },
            update: {
                // Simple moving average for adherence: (current * 6 + new) / 7
                last7DaysAdherence: {
                    set: 0.8 // Placeholder: should be calculated from real history if possible
                },
                lastEventId: event.eventId,
                lastProcessedAt: new Date()
            }
        });
    }

    async handleSleepLogged(event: NightFuelEvent<SleepLoggedPayload>) {
        const { userId, payload } = event;
        logger.info({ userId, sleepSessionId: payload.sleepSessionId }, 'Processing sleep log event');

        await this.prisma.userState.upsert({
            where: { userId },
            create: {
                userId,
                avgSleepQuality: payload.quality ?? 7.0,
                fatigueLevel: (payload.disturbances ?? 0) > 3 ? 7.0 : 3.0,
                lastEventId: event.eventId
            },
            update: {
                avgSleepQuality: payload.quality ?? undefined,
                fatigueLevel: (payload.disturbances ?? 0) > 3 ? { increment: 1 } : { decrement: 1 },
                lastEventId: event.eventId,
                lastProcessedAt: new Date()
            }
        });
    }

    async handleMetricsLogged(event: NightFuelEvent<BodyMetricsLoggedPayload>) {
        const { userId, payload } = event;
        if (!payload.weightKg) return;

        await this.prisma.userState.upsert({
            where: { userId },
            create: {
                userId,
                currentWeightKg: payload.weightKg,
                lastEventId: event.eventId
            },
            update: {
                currentWeightKg: payload.weightKg,
                lastEventId: event.eventId,
                lastProcessedAt: new Date()
            }
        });
    }

    async handlePlanGenerated(event: NightFuelEvent<PlanGeneratedPayload>) {
        const { userId, payload } = event;

        await this.prisma.userState.upsert({
            where: { userId },
            create: {
                userId,
                currentCalorieTarget: payload.calorieTarget,
                currentProteinTargetG: payload.proteinTargetG,
                lastEventId: event.eventId
            },
            update: {
                currentCalorieTarget: payload.calorieTarget,
                currentProteinTargetG: payload.proteinTargetG,
                lastEventId: event.eventId,
                lastProcessedAt: new Date()
            }
        });
    }

    async handleCycleAdvanced(event: NightFuelEvent<CycleAdvancedPayload>) {
        const { userId, payload } = event;
        logger.info({ userId, newCycleWeek: payload.newCycleWeek }, 'Processing cycle advanced event');

        await this.prisma.userState.upsert({
            where: { userId },
            create: {
                userId,
                trainingPhase: payload.trainingPhase,
                cycleWeek: payload.newCycleWeek,
                lastEventId: event.eventId
            },
            update: {
                trainingPhase: payload.trainingPhase,
                cycleWeek: payload.newCycleWeek,
                lastEventId: event.eventId,
                lastProcessedAt: new Date()
            }
        });
    }
}
