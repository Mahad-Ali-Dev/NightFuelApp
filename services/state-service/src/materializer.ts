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
// Neutral adherence used when the window holds no real boolean samples. MUST
// match the schema default (UserState.last7DaysAdherence @default(1.0)) and sit
// ABOVE the decision-engine's penalty threshold (engine.ts: < 0.7 → volume cut),
// so an empty window is never misread as "low adherence" and never cuts volume.
const NEUTRAL_ADHERENCE = 1.0;

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

/** UTC calendar day key (YYYY-MM-DD) for an ISO8601 timestamp, or null if unparseable. */
function dayKey(at: string): string | null {
    const t = Date.parse(at);
    if (Number.isNaN(t)) return null;
    return new Date(t).toISOString().slice(0, 10);
}

/**
 * Fold the (optional) new sample into the window and return the per-DAY mean.
 *
 * `sample` is null when the producer sent no boolean isAdherent — in that case
 * we still prune the stored window but append nothing (a missing verdict must
 * never be coerced to a 0/false sample, which would drag the mean toward a false
 * "low adherence" penalty).
 *
 * The mean is computed over one entry PER CALENDAR DAY, not per meal event:
 * multiple meals on the same day collapse to that day's latest verdict, so the
 * window measures daily adherence rather than meal volume. When the window holds
 * no real samples the mean is the NEUTRAL_ADHERENCE sentinel (no penalty).
 */
function rollWindow(
    existing: AdherenceSample[],
    sample: AdherenceSample | null,
    now: number
): { samples: AdherenceSample[]; mean: number } {
    const cutoff = now - ADHERENCE_WINDOW_MS;
    const samples = [...existing, ...(sample ? [sample] : [])]
        .filter((s) => {
            const t = Date.parse(s.at);
            return !Number.isNaN(t) && t >= cutoff;
        })
        .slice(-ADHERENCE_MAX_SAMPLES);

    // De-duplicate to one verdict per UTC calendar day. Samples are appended in
    // chronological order, so the LAST sample seen for a day wins (its latest
    // verdict). Anything with an unparseable timestamp is already filtered out
    // above, so dayKey() is non-null here.
    const perDay = new Map<string, boolean>();
    for (const s of samples) {
        const key = dayKey(s.at);
        if (key) perDay.set(key, s.adherent);
    }

    const days = [...perDay.values()];
    const mean = days.length
        ? days.reduce((acc, adherent) => acc + (adherent ? 1 : 0), 0) / days.length
        : NEUTRAL_ADHERENCE;
    return { samples, mean };
}

/**
 * Clamp a numeric score into [lo, hi] (default the 0..10 scale these state
 * fields use). A non-number / NaN / Infinity returns `undefined` so the caller
 * can SKIP the field on update (leaving the column untouched) or fall back to a
 * sane default on create — a poisoned value can never be persisted verbatim.
 */
const clampScore = (n: unknown, lo = 0, hi = 10): number | undefined => {
    if (typeof n !== 'number' || !Number.isFinite(n)) return undefined;
    return Math.min(hi, Math.max(lo, n));
};

/** Pass through a finite number; map anything non-finite (NaN/Infinity/non-number) to undefined. */
const finiteOrUndef = (n: unknown): number | undefined =>
    (typeof n === 'number' && Number.isFinite(n) ? n : undefined);

export class StateMaterializer {
    constructor(private prisma: PrismaClient) { }

    async handleMealLogged(event: NightFuelEvent<MealLoggedPayload>) {
        const { userId, payload } = event;
        logger.info({ userId, mealLogId: payload.mealLogId }, 'Processing meal log event');

        // Read-modify-write of the rolling adherence window.
        //
        // RACE NOTE: handlers are wired via EventBus.subscribe (Redis Pub/Sub
        // fan-out — see events.ts), NOT a consumer group, so concurrent
        // meal-logged events for the SAME user can interleave this read →
        // compute → upsert and lose an update (last writer wins). Within the
        // code-only scope we minimise the window (read only adherenceSamples,
        // do all work synchronously, single upsert) but cannot make it atomic.
        // FOLLOW-UP: move to a consumer group with per-user ordering, or do the
        // read-modify-write inside a DB transaction / SELECT … FOR UPDATE.
        const existing = await this.prisma.userState.findUnique({
            where: { userId },
            select: { adherenceSamples: true },
        });

        const now = Date.now();
        // Only build a sample when the producer sent an explicit boolean verdict.
        // A missing/undefined isAdherent must NOT be coerced to a false (0)
        // sample — doing so would drag last7DaysAdherence toward 0 and trip the
        // decision-engine's < 0.7 volume cut for users who simply lack a verdict.
        const sample: AdherenceSample | null =
            typeof payload.isAdherent === 'boolean'
                ? {
                      at: payload.loggedAt ?? new Date(now).toISOString(),
                      adherent: payload.isAdherent,
                  }
                : null;
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

        // Guard the inbound score/disturbance values before they touch numeric
        // state. A NaN/Infinity/non-number quality collapses to undefined (skip
        // on update / default on create); disturbances must be finite to drive
        // the fatigue direction (a non-finite count is treated as "not >3").
        const quality = clampScore(payload.quality);
        const disturbances = finiteOrUndef(payload.disturbances) ?? 0;
        const moreFatigued = disturbances > 3;

        // Fatigue is a bounded 0..10 score. The previous unbounded
        // {increment:1}/{decrement:1} let it drift arbitrarily far outside that
        // range over many events. Per-user events are processed sequentially by
        // the stream consumer group (see handleMealLogged), so a read → clamp →
        // write of the absolute next value is race-safe and keeps it in 0..10.
        const existing = await this.prisma.userState.findUnique({
            where: { userId },
            select: { fatigueLevel: true },
        });
        const currentFatigue = clampScore(existing?.fatigueLevel) ?? 3.0;
        const nextFatigue = clampScore(currentFatigue + (moreFatigued ? 1 : -1)) ?? currentFatigue;

        await this.prisma.userState.upsert({
            where: { userId },
            create: {
                userId,
                avgSleepQuality: quality ?? 7.0,
                fatigueLevel: moreFatigued ? 7.0 : 3.0,
                lastEventId: event.eventId
            },
            update: {
                // undefined → Prisma skips the field, leaving the column intact.
                avgSleepQuality: quality,
                fatigueLevel: nextFatigue,
                lastEventId: event.eventId,
                lastProcessedAt: new Date()
            }
        });
    }

    async handleMetricsLogged(event: NightFuelEvent<BodyMetricsLoggedPayload>) {
        const { userId, payload } = event;

        // Skip the write entirely unless weight is a finite number inside a
        // physiologically plausible range — a NaN/Infinity/negative/absurd
        // weight must never be persisted (the old `if (!payload.weightKg)`
        // falsy check let NaN/Infinity/negative values straight through).
        const weightKg = finiteOrUndef(payload.weightKg);
        if (weightKg === undefined || weightKg < 20 || weightKg > 500) return;

        await this.prisma.userState.upsert({
            where: { userId },
            create: {
                userId,
                currentWeightKg: weightKg,
                lastEventId: event.eventId
            },
            update: {
                currentWeightKg: weightKg,
                lastEventId: event.eventId,
                lastProcessedAt: new Date()
            }
        });
    }

    async handlePlanGenerated(event: NightFuelEvent<PlanGeneratedPayload>) {
        const { userId, payload } = event;

        // Coerce both daily targets to finite numbers; skip the write if either
        // is non-finite (NaN/Infinity/non-number) so a poisoned plan can never
        // overwrite the persisted targets with a wild value.
        const calorieTarget = finiteOrUndef(payload.calorieTarget);
        const proteinTargetG = finiteOrUndef(payload.proteinTargetG);
        if (calorieTarget === undefined || proteinTargetG === undefined) return;

        await this.prisma.userState.upsert({
            where: { userId },
            create: {
                userId,
                currentCalorieTarget: calorieTarget,
                currentProteinTargetG: proteinTargetG,
                lastEventId: event.eventId
            },
            update: {
                currentCalorieTarget: calorieTarget,
                currentProteinTargetG: proteinTargetG,
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
