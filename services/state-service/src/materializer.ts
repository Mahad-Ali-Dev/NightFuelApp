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

    /**
     * Run a read → compute → write for ONE user's row atomically, with an
     * idempotency guard, for the two handlers that do a real read-modify-write
     * (adherence window + fatigue step). The other handlers are blind
     * last-writer-wins overwrites and need neither.
     *
     * CONCURRENCY: handlers are wired via EventBus.subscribe (Redis Pub/Sub
     * fan-out — see events.ts + packages/events/redis-event-bus.ts, which
     * dispatches every message to all handlers with Promise.all), NOT a Redis
     * consumer group. So two events for the SAME user (concurrent OR an
     * immediate redelivery) can interleave a plain read → compute → upsert and
     * lose an update / double-apply a step. We close that window by:
     *   (1) DEDUP — taking a row lock, then skipping when the incoming
     *       event.eventId equals the row's stored lastEventId (catches an
     *       immediate redelivery of the last event).
     *   (2) LOCK — doing the read + compute + upsert inside a single
     *       $transaction, with a `SELECT … FOR UPDATE` on the user's row so a
     *       concurrent handler for the same user blocks until we commit, then
     *       reads our committed value. The lock only exists once the row does;
     *       the FIRST event for a brand-new user has no row to lock, so two
     *       truly-simultaneous first events race the insert — the loser hits the
     *       unique(userId) constraint (P2002) and we retry ONCE, which now finds
     *       (and locks) the row the winner committed.
     *
     * The single-event path is unchanged: lock is uncontended, dedup never
     * matches (lastEventId differs), compute sees the same `existing` it would
     * have read before, and the same upsert runs — identical results.
     *
     * `compute` receives the locked row (or null on first insert) and returns
     * the create/update data; returning null means "skip the write".
     *
     * RESIDUAL RISK: correctness here relies on the DB enforcing row locks
     * (Postgres FOR UPDATE) — true ordering across the whole stream would still
     * require a per-user consumer group; this localized change makes each
     * same-user update atomic and de-duplicates immediate redelivery, but does
     * not impose a global event order.
     */
    private async runLockedUpsert(
        userId: string,
        eventId: string,
        select: Prisma.UserStateSelect,
        compute: (
            existing: Record<string, any> | null,
        ) => { create: Prisma.UserStateCreateInput; update: Prisma.UserStateUpdateInput } | null,
    ): Promise<void> {
        // Always read lastEventId too, so the dedup guard can compare it.
        const lockSelect: Prisma.UserStateSelect = { ...select, lastEventId: true };

        const attempt = async (): Promise<void> => {
            await this.prisma.$transaction(async (tx: any) => {
                // Lock the user's row FOR UPDATE if it exists. Parameterised raw
                // query (tagged template) — userId is bound, never interpolated.
                const locked = (await tx.$queryRaw(
                    Prisma.sql`SELECT 1 FROM "user_states" WHERE "user_id" = ${userId} FOR UPDATE`,
                )) as unknown[];

                // Read the current row *inside* the lock so we observe the
                // committed state of any handler that just released the lock.
                const existing = locked.length
                    ? await tx.userState.findUnique({ where: { userId }, select: lockSelect })
                    : null;

                // DEDUP: an immediate redelivery of the same event is a no-op.
                if (existing && existing.lastEventId === eventId) {
                    logger.info({ userId, eventId }, 'Duplicate event skipped (matches lastEventId)');
                    return;
                }

                const data = compute(existing);
                if (!data) return; // handler chose to skip the write

                await tx.userState.upsert({
                    where: { userId },
                    create: data.create,
                    update: data.update,
                });
            });
        };

        try {
            await attempt();
        } catch (err: any) {
            // P2002 = two first-events for a brand-new user raced the insert (no
            // row existed to lock). Retry once: the row now exists, so this
            // attempt locks it and folds in our update on top of the winner's.
            if (err?.code === 'P2002') {
                await attempt();
                return;
            }
            throw err;
        }
    }

    async handleMealLogged(event: NightFuelEvent<MealLoggedPayload>) {
        const { userId, payload } = event;
        logger.info({ userId, mealLogId: payload.mealLogId }, 'Processing meal log event');

        const now = Date.now();
        // Read-modify-write of the rolling adherence window, made race-safe and
        // idempotent by runLockedUpsert (row lock + lastEventId dedup).
        await this.runLockedUpsert(
            userId,
            event.eventId,
            { adherenceSamples: true },
            (existing) => {
                // Only build a sample when the producer sent an explicit boolean
                // verdict. A missing/undefined isAdherent must NOT be coerced to
                // a false (0) sample — doing so would drag last7DaysAdherence
                // toward 0 and trip the decision-engine's < 0.7 volume cut for
                // users who simply lack a verdict.
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
                    now,
                );

                return {
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
                };
            },
        );
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
        // range over many events. We read → step ±1 → clamp the absolute next
        // value to keep it in 0..10.
        //
        // Per-user events are NOT processed sequentially: handlers fire off Redis
        // Pub/Sub (EventBus.subscribe), not a consumer group, so concurrent /
        // redelivered sleep events for the same user could otherwise double-step
        // or lose this read-modify-write. runLockedUpsert makes the read+write
        // atomic (row lock) and idempotent (lastEventId dedup), so the step is
        // applied exactly once against the committed current value.
        await this.runLockedUpsert(
            userId,
            event.eventId,
            { fatigueLevel: true },
            (existing) => {
                const currentFatigue = clampScore(existing?.fatigueLevel) ?? 3.0;
                const nextFatigue =
                    clampScore(currentFatigue + (moreFatigued ? 1 : -1)) ?? currentFatigue;

                return {
                    create: {
                        userId,
                        avgSleepQuality: quality ?? 7.0,
                        fatigueLevel: moreFatigued ? 7.0 : 3.0,
                        lastEventId: event.eventId,
                    },
                    update: {
                        // undefined → Prisma skips the field, leaving the column intact.
                        avgSleepQuality: quality,
                        fatigueLevel: nextFatigue,
                        lastEventId: event.eventId,
                        lastProcessedAt: new Date(),
                    },
                };
            },
        );
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
