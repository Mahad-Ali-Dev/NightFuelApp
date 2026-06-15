import { PrismaClient, Prisma } from './generated/prisma';
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

const ADHERENCE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const ADHERENCE_MAX_SAMPLES = 100; // safety cap so the JSON column can't grow unbounded

interface AdherenceSample {
    at: string; // ISO8601
    adherent: boolean;
}

/** Parse the stored JSON column defensively (it may be null, a string, or already an array). */
function parseSamples(raw: unknown): AdherenceSample[] {
    let value = raw;
    if (typeof value === 'string') {
        try { value = JSON.parse(value); } catch { return []; }
    }
    if (!Array.isArray(value)) return [];
    return value.filter(
        (s): s is AdherenceSample =>
            !!s && typeof s.at === 'string' && typeof s.adherent === 'boolean'
    );
}

/** Append the new sample, drop anything older than 7 days, and return the windowed mean. */
function rollWindow(
    existing: AdherenceSample[],
    sample: AdherenceSample,
    now: number
): { samples: AdherenceSample[]; mean: number } {
    const cutoff = now - ADHERENCE_WINDOW_MS;
    const samples = [...existing, sample]
        .filter((s) => {
            const t = Date.parse(s.at);
            return !Number.isNaN(t) && t >= cutoff;
        })
        .slice(-ADHERENCE_MAX_SAMPLES);
    const mean = samples.length
        ? samples.reduce((acc, s) => acc + (s.adherent ? 1 : 0), 0) / samples.length
        : 0;
    return { samples, mean };
}

export class StateMaterializer {
    constructor(private prisma: PrismaClient) { }

    async handleMealLogged(event: NightFuelEvent<MealLoggedPayload>) {
        const { userId, payload } = event;
        logger.info({ userId, mealLogId: payload.mealLogId }, 'Processing meal log event');

        // Read-modify-write of the rolling adherence window. Per-user events are
        // processed sequentially by the stream consumer group, so this is race-safe.
        const existing = await this.prisma.userState.findUnique({
            where: { userId },
            select: { adherenceSamples: true },
        });

        const now = Date.now();
        const sample: AdherenceSample = {
            at: payload.loggedAt ?? new Date(now).toISOString(),
            adherent: payload.isAdherent,
        };
        const { samples, mean } = rollWindow(
            parseSamples(existing?.adherenceSamples),
            sample,
            now
        );

        await this.prisma.userState.upsert({
            where: { userId },
            create: {
                userId,
                last7DaysAdherence: mean,
                adherenceSamples: samples as unknown as Prisma.InputJsonValue,
                lastEventId: event.eventId,
            },
            update: {
                last7DaysAdherence: mean,
                adherenceSamples: samples as unknown as Prisma.InputJsonValue,
                lastEventId: event.eventId,
                lastProcessedAt: new Date(now),
            },
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
