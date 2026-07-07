import { PrismaClient, DailyProgress, Streak } from './generated/prisma';
import { EventBus } from '@nightfuel/events';
import {
    Channels,
    ProgressUpdatedPayload,
    StreakUpdatedPayload,
    BodyMetricsLoggedPayload,
    NotificationSendPayload,
    CycleAdvancedPayload,
} from '@nightfuel/types';
import { createLogger } from '@nightfuel/config';
import { AdaptiveGoalOptimizer } from './utils/optimizer';
import CircuitBreaker from 'opossum';

const logger = createLogger('progress-service');

/**
 * Adherence threshold: a day is considered adherent if the user consumed
 * at least 80% of their calorie target. If no target is set, adherence
 * is always false (we cannot judge without a plan target).
 */
const ADHERENCE_CALORIE_THRESHOLD = 0.8;

export class ProgressService {
    /**
     * HIGH #3: circuit breaker guarding the weekly-audit AI call.
     *
     * generateWeeklyAudit() is invoked synchronously from the user-facing
     * POST /v1/progress/weekly-audit and hits ai-pipeline's *heaviest* (slow
     * quality-model) LLM endpoint. Previously this was a bare fetch() with no
     * timeout/breaker/retry, so an ai-pipeline brownout pinned Fastify workers
     * until the socket eventually died. We wrap the call in opossum — mirroring
     * plan-service's breaker (30s timeout, 50% error threshold, 30s reset) — so
     * a provider brownout sheds load fast (open breaker => instant fallback)
     * instead of hanging. The per-call AbortSignal.timeout inside
     * makeWeeklyAuditRequest is the inner bound; the breaker timeout is the
     * outer one.
     */
    private aiBreaker: CircuitBreaker;

    constructor(
        private prisma: PrismaClient,
        private eventBus: EventBus,
        private config: { USER_SERVICE_URL: string, AI_PIPELINE_URL?: string, INTERNAL_SERVICE_TOKEN?: string }
    ) {
        const breakerOptions = {
            timeout: 30000,           // 30s — the slow quality-model audit call
            errorThresholdPercentage: 50,
            resetTimeout: 30000
        };
        this.aiBreaker = new CircuitBreaker(this.makeWeeklyAuditRequest.bind(this), breakerOptions);
        // When the breaker is open (or a call times out) we fail fast: throwing
        // here surfaces to generateWeeklyAudit's catch, which logs and rethrows,
        // and the route returns the existing friendly 500 instead of hanging.
        this.aiBreaker.fallback(() => {
            throw new Error('AI Pipeline is currently unavailable (Circuit Breaker Tripped)');
        });
    }

    // ---------------------------------------------------------------------------
    // Internal helpers
    // ---------------------------------------------------------------------------

    /**
     * Compute whether a day's progress meets the adherence threshold.
     * Adherent = caloriesActual >= 80% of caloriesTarget (when target exists).
     */
    private computeIsAdherent(caloriesActual: number, caloriesTarget: number | null): boolean {
        if (caloriesTarget === null || caloriesTarget === undefined || caloriesTarget <= 0) {
            return false;
        }
        return caloriesActual >= caloriesTarget * ADHERENCE_CALORIE_THRESHOLD;
    }

    /**
     * Convert a JS Date or ISO string to a UTC midnight Date (date-only boundary).
     * Prisma @db.Date fields store only the date portion; comparing with this
     * ensures correct @unique([userId, date]) lookups.
     */
    private toUtcDateOnly(dateInput: Date | string): Date {
        const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
        return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    }

    /**
     * Update the Streak record for a user after their daily progress changes.
     *
     * Streak logic:
     *  - If today is adherent and yesterday was the lastAdherentDate → increment.
     *  - If today is adherent and there is no prior adherent day (or the gap > 1 day) → reset to 1.
     *  - If today is NOT adherent → do NOT decrement (streak only updates on positive adherence events).
     */
    private async updateStreak(userId: string, today: Date, isAdherent: boolean): Promise<void> {
        if (!isAdherent) return;

        const todayUtc = this.toUtcDateOnly(today);
        const yesterdayUtc = new Date(todayUtc.getTime() - 24 * 60 * 60 * 1000);
        const existing = await this.prisma.streak.findUnique({ where: { userId } });

        let newCurrent: number;
        let newLongest: number;

        if (!existing) {
            newCurrent = 1;
            newLongest = 1;
            await this.prisma.streak.create({
                data: { userId, currentStreak: 1, longestStreak: 1, lastAdherentDate: todayUtc },
            });
        } else {
            const lastDate = existing.lastAdherentDate ? this.toUtcDateOnly(existing.lastAdherentDate) : null;
            const isAlreadyToday = lastDate !== null && lastDate.getTime() === todayUtc.getTime();
            if (isAlreadyToday) return;

            const wasYesterday = lastDate !== null && lastDate.getTime() === yesterdayUtc.getTime();
            newCurrent = wasYesterday ? existing.currentStreak + 1 : 1;
            newLongest = Math.max(newCurrent, existing.longestStreak);

            await this.prisma.streak.update({
                where: { userId },
                data: { currentStreak: newCurrent, longestStreak: newLongest, lastAdherentDate: todayUtc },
            });
        }

        logger.info({ userId, newCurrent, newLongest }, 'Streak updated');

        const streakPayload: StreakUpdatedPayload = {
            currentStreak: newCurrent,
            longestStreak: newLongest,
            lastAdherentDate: todayUtc.toISOString(),
            isNewRecord: newCurrent > (existing?.longestStreak ?? 0),
        };

        await this.eventBus.publish<StreakUpdatedPayload>(Channels.Progress.StreakUpdated, {
            eventId: crypto.randomUUID(),
            eventType: 'progress.streak-updated',
            producedAt: new Date().toISOString(),
            producerService: 'progress-service',
            correlationId: crypto.randomUUID(),
            userId,
            payload: streakPayload,
        });
    }

    // ---------------------------------------------------------------------------
    // Event handlers (called from events.ts)
    // ---------------------------------------------------------------------------

    /**
     * Handle `nightfuel:meal:meal-logged`.
     * Accumulates macros into DailyProgress for the meal's date (today by default),
     * then recomputes adherence and updates the streak.
     */
    async handleMealLogged(event: {
        userId: string;
        payload: {
            mealLogId: string;
            totalCalories: number;
            totalProtein: number;
            totalCarbs: number;
            totalFat: number;
            mealType: string;
            loggedAt?: string;
        };
    }): Promise<void> {
        const { userId, payload } = event;
        const dateRaw = payload.loggedAt ?? new Date().toISOString();
        const date = this.toUtcDateOnly(dateRaw);

        logger.info(`Handling meal-logged event for user ${userId} on ${date.toISOString()}`);

        // Fetch existing record to accumulate (upsert with increment)
        const existing = await this.prisma.dailyProgress.findUnique({
            where: { userId_date: { userId, date } },
        });

        const caloriesActual = (existing?.caloriesActual ?? 0) + payload.totalCalories;
        const proteinActual = (existing?.proteinActual ?? 0) + payload.totalProtein;
        const carbsActual = (existing?.carbsActual ?? 0) + payload.totalCarbs;
        const fatActual = (existing?.fatActual ?? 0) + payload.totalFat;
        const mealsLogged = (existing?.mealsLogged ?? 0) + 1;

        const caloriesTarget = existing?.caloriesTarget ?? null;
        const isAdherent = this.computeIsAdherent(caloriesActual, caloriesTarget);

        const updated = await this.prisma.dailyProgress.upsert({
            where: { userId_date: { userId, date } },
            create: {
                userId,
                date,
                caloriesActual,
                proteinActual,
                carbsActual,
                fatActual,
                mealsLogged,
                isAdherent,
                caloriesTarget: existing?.caloriesTarget ?? null,
                proteinTarget: existing?.proteinTarget ?? null,
                carbsTarget: existing?.carbsTarget ?? null,
                fatTarget: existing?.fatTarget ?? null,
                planId: existing?.planId ?? null,
            },
            update: {
                caloriesActual,
                proteinActual,
                carbsActual,
                fatActual,
                mealsLogged,
                isAdherent,
            },
        });

        logger.info(
            { userId, date: date.toISOString(), caloriesActual, caloriesTarget, isAdherent },
            'DailyProgress updated after meal log',
        );

        // Publish progress.daily-updated so notification-service can act on it
        const progressPayload: ProgressUpdatedPayload = {
            date: date.toISOString().split('T')[0],
            calorieTarget: updated.caloriesTarget ?? 0,
            calorieActual: updated.caloriesActual,
            proteinActualG: updated.proteinActual,
            carbsActualG: updated.carbsActual,
            fatActualG: updated.fatActual,
            mealsLogged: updated.mealsLogged,
            isAdherent: updated.isAdherent,
        };

        await this.eventBus.publish<ProgressUpdatedPayload>(Channels.Progress.DailyUpdated, {
            eventId: crypto.randomUUID(),
            eventType: 'progress.daily-updated',
            producedAt: new Date().toISOString(),
            producerService: 'progress-service',
            correlationId: crypto.randomUUID(),
            userId,
            payload: progressPayload,
        });

        await this.updateStreak(userId, date, updated.isAdherent);
    }

    /**
     * Handle `nightfuel:plan:plan-generated`.
     * Sets calorie and macro targets on the DailyProgress record for the plan date.
     * Plan payload is expected to contain a `structuredPlan` or top-level macro fields.
     */
    async handlePlanGenerated(event: {
        userId: string;
        payload: {
            planId: string;
            userId: string;
            date: string;
            caloriesTarget?: number;
            proteinTarget?: number;
            carbsTarget?: number;
            fatTarget?: number;
            structuredPlan?: {
                totalCalories?: number;
                totalProtein?: number;
                totalCarbs?: number;
                totalFat?: number;
                caloriesTarget?: number;
                proteinTarget?: number;
                carbsTarget?: number;
                fatTarget?: number;
            };
        };
    }): Promise<void> {
        const { userId, payload } = event;
        const date = this.toUtcDateOnly(payload.date);

        // Extract targets from the plan payload — check both top-level and structuredPlan
        const sp = payload.structuredPlan ?? {};
        const caloriesTarget =
            payload.caloriesTarget ?? sp.caloriesTarget ?? sp.totalCalories ?? null;
        const proteinTarget =
            payload.proteinTarget ?? sp.proteinTarget ?? sp.totalProtein ?? null;
        const carbsTarget = payload.carbsTarget ?? sp.carbsTarget ?? sp.totalCarbs ?? null;
        const fatTarget = payload.fatTarget ?? sp.fatTarget ?? sp.totalFat ?? null;

        logger.info(
            `Handling plan-generated event for user ${userId} on ${date.toISOString()}: ` +
            `caloriesTarget=${caloriesTarget}`,
        );

        // Fetch existing actual values to recompute adherence against new target
        const existing = await this.prisma.dailyProgress.findUnique({
            where: { userId_date: { userId, date } },
        });

        const caloriesActual = existing?.caloriesActual ?? 0;
        const isAdherent = this.computeIsAdherent(
            caloriesActual,
            caloriesTarget,
        );

        await this.prisma.dailyProgress.upsert({
            where: { userId_date: { userId, date } },
            create: {
                userId,
                date,
                caloriesTarget,
                proteinTarget,
                carbsTarget,
                fatTarget,
                caloriesActual: 0,
                proteinActual: 0,
                carbsActual: 0,
                fatActual: 0,
                mealsLogged: 0,
                isAdherent,
                planId: payload.planId,
            },
            update: {
                caloriesTarget,
                proteinTarget,
                carbsTarget,
                fatTarget,
                planId: payload.planId,
                isAdherent,
            },
        });

        logger.info(`DailyProgress target set for user ${userId} on ${date.toISOString()}`);
    }

    /**
     * Handle `nightfuel:user:status-updated`.
     * Captures fatigue levels for historical trend tracking.
     */
    async handleStatusUpdated(event: {
        userId: string;
        payload: {
            fatigueScore: number;
            lastUpdatedBy: string;
        };
    }): Promise<void> {
        const { userId, payload } = event;
        const date = this.toUtcDateOnly(new Date());

        logger.info(`Handling status-updated for user ${userId} on ${date.toISOString()}`);

        await this.prisma.dailyProgress.upsert({
            where: { userId_date: { userId, date } },
            create: {
                userId,
                date,
                fatigueScore: payload.fatigueScore,
                caloriesActual: 0,
                proteinActual: 0,
                carbsActual: 0,
                fatActual: 0,
                mealsLogged: 0,
                isAdherent: false,
            },
            update: {
                fatigueScore: payload.fatigueScore,
            },
        });
    }

    // ---------------------------------------------------------------------------
    // Route handlers
    // ---------------------------------------------------------------------------

    /**
     * GET /v1/progress/today
     * Returns today's DailyProgress snapshot, creating an empty one if it doesn't exist.
     */
    async getTodayProgress(userId: string): Promise<DailyProgress> {
        const today = this.toUtcDateOnly(new Date());

        const record = await this.prisma.dailyProgress.upsert({
            where: { userId_date: { userId, date: today } },
            create: {
                userId,
                date: today,
                caloriesActual: 0,
                proteinActual: 0,
                carbsActual: 0,
                fatActual: 0,
                mealsLogged: 0,
                isAdherent: false,
            },
            update: {},
        });

        return record;
    }

    /**
     * GET /v1/progress/history?days=7
     * Returns the last N days of DailyProgress records, ordered newest first.
     * days defaults to 7, max 90.
     */
    async getProgressHistory(userId: string, days: number): Promise<DailyProgress[]> {
        const clampedDays = Math.min(Math.max(days, 1), 90);
        const since = new Date();
        // Inclusive N-day window: subtract (N-1) so the window spans exactly N
        // calendar days (today + the previous N-1), not N+1.
        since.setUTCDate(since.getUTCDate() - (clampedDays - 1));
        const sinceDate = this.toUtcDateOnly(since);

        return this.prisma.dailyProgress.findMany({
            where: {
                userId,
                date: { gte: sinceDate },
            },
            orderBy: { date: 'desc' },
        });
    }

    /**
     * GET /v1/progress/streak
     * Returns current and longest streak for the user.
     * If no streak record exists, returns zeroed defaults.
     *
     * The stored currentStreak only advances on a positive adherence event
     * (see updateStreak), so it can go stale after a break: a user who was on a
     * 5-day streak but logged nothing for a week still has currentStreak=5 in the
     * row. We recompute the *live* current streak at read time by anchoring on
     * lastAdherentDate (UTC date-only): the streak is only "alive" if the last
     * adherent day was today or yesterday — otherwise the run is broken and the
     * current streak is 0. This mirrors the on-device anchor logic in
     * clients/mobile/src/lib/streaks.ts (anchor = today or yesterday, else 0).
     * longestStreak is a historical high-water mark and is never reset here.
     */
    async getStreak(userId: string): Promise<{
        currentStreak: number;
        longestStreak: number;
        lastAdherentDate: Date | null;
    }> {
        const streak = await this.prisma.streak.findUnique({ where: { userId } });

        if (!streak) {
            return { currentStreak: 0, longestStreak: 0, lastAdherentDate: null };
        }

        const todayUtc = this.toUtcDateOnly(new Date());
        const yesterdayUtc = new Date(todayUtc.getTime() - 24 * 60 * 60 * 1000);
        const lastDate = streak.lastAdherentDate
            ? this.toUtcDateOnly(streak.lastAdherentDate)
            : null;

        // Anchor = today or yesterday, else the run is broken → currentStreak 0.
        const isAlive =
            lastDate !== null &&
            (lastDate.getTime() === todayUtc.getTime() ||
                lastDate.getTime() === yesterdayUtc.getTime());

        return {
            currentStreak: isAlive ? streak.currentStreak : 0,
            longestStreak: streak.longestStreak,
            lastAdherentDate: streak.lastAdherentDate,
        };
    }

    /**
     * POST /v1/progress/hydration
     * Increments the user's hydration count for the day.
     */
    async logHydration(userId: string, amount: number): Promise<DailyProgress> {
        const date = this.toUtcDateOnly(new Date());

        // Save detailed hydration log history
        try {
            if ((this.prisma as any).hydrationLog) {
                await (this.prisma as any).hydrationLog.create({
                    data: {
                        userId,
                        amountMl: amount,
                        date
                    }
                });
            }
        } catch (err) {
            logger.warn({ err }, 'Failed to save detailed hydration log, continuing with daily roll-up');
        }

        return this.prisma.dailyProgress.upsert({
            where: { userId_date: { userId, date } },
            create: {
                userId,
                date,
                hydrationActual: amount,
                caloriesActual: 0,
                proteinActual: 0,
                carbsActual: 0,
                fatActual: 0,
                mealsLogged: 0,
                isAdherent: false,
            },
            update: {
                hydrationActual: { increment: amount }
            }
        });
    }

    /**
     * POST /v1/progress/supplements
     * Toggles a supplement as taken/untaken.
     */
    async toggleSupplement(userId: string, supplementName: string, isTaken: boolean): Promise<DailyProgress> {
        const date = this.toUtcDateOnly(new Date());
        const existing = await this.prisma.dailyProgress.findUnique({
            where: { userId_date: { userId, date } }
        });

        let currentSupps = (existing?.supplementsLogged as any) || [];
        if (isTaken) {
            if (!currentSupps.includes(supplementName)) {
                currentSupps.push(supplementName);
            }
        } else {
            currentSupps = currentSupps.filter((s: string) => s !== supplementName);
        }

        return this.prisma.dailyProgress.upsert({
            where: { userId_date: { userId, date } },
            create: {
                userId,
                date,
                supplementsLogged: currentSupps,
                caloriesActual: 0,
                proteinActual: 0,
                carbsActual: 0,
                fatActual: 0,
                mealsLogged: 0,
                isAdherent: false,
            },
            update: {
                supplementsLogged: currentSupps
            }
        });
    }

    /**
     * POST /v1/progress/light-exposure
     * Marks circadian light exposure task as complete.
     */
    async updateLightExposure(userId: string, completed: boolean): Promise<DailyProgress> {
        const date = this.toUtcDateOnly(new Date());
        return this.prisma.dailyProgress.upsert({
            where: { userId_date: { userId, date } },
            create: {
                userId,
                date,
                lightExposureCompleted: completed,
                caloriesActual: 0,
                proteinActual: 0,
                carbsActual: 0,
                fatActual: 0,
                mealsLogged: 0,
                isAdherent: false,
            },
            update: {
                lightExposureCompleted: completed
            }
        });
    }

    /**
     * POST /v1/progress/steps
     * Updates the user's step count for the day.
     */
    async logSteps(userId: string, steps: number, source: string = 'MANUAL'): Promise<DailyProgress> {
        const date = this.toUtcDateOnly(new Date());
        return this.prisma.dailyProgress.upsert({
            where: { userId_date: { userId, date } },
            create: {
                userId,
                date,
                stepCount: steps,
                source,
                caloriesActual: 0,
                proteinActual: 0,
                carbsActual: 0,
                fatActual: 0,
                mealsLogged: 0,
                isAdherent: false,
            },
            update: {
                stepCount: steps,
                source
            }
        });
    }

    /**
     * GET /v1/progress/stats?days=30
     * Returns aggregate stats over the last N days:
     *   - adherencePercent: % of days where isAdherent = true (among days that had a target)
     *   - avgCaloriesActual / avgCaloriesTarget
     *   - avgProteinActual / avgCarbsActual / avgFatActual
     *   - totalMealsLogged
     *   - daysTracked
     */
    async getStats(
        userId: string,
        days: number,
    ): Promise<{
        daysTracked: number;
        daysWithTarget: number;
        adherentDays: number;
        adherencePercent: number;
        avgCaloriesActual: number;
        avgCaloriesTarget: number | null;
        avgProteinActual: number;
        avgCarbsActual: number;
        avgFatActual: number;
        avgHydrationActual: number;
        totalMealsLogged: number;
    }> {
        // Finite-ness invariant (mirrors sleep-service src/sleep.service.ts):
        // every field below is computed by division/reduction over DB rows, so a
        // poisoned or zero-denominator intermediate could surface NaN/Infinity
        // into statsResponseSchema (adherencePercent is .min(0).max(100); the
        // avgs are .nonnegative()) and fail serialization or leak a non-finite
        // number. Collapsing any non-finite value to a safe default keeps the
        // schema bounds intact. Behaviour-preserving: every real finite input
        // rounds/divides exactly as before — only a non-finite result changes.
        const finite = (x: number, fallback = 0) => (Number.isFinite(x) ? x : fallback);

        const clampedDays = Math.min(Math.max(days, 1), 365);
        const since = new Date();
        // Inclusive N-day window: subtract (N-1) so the window spans exactly N
        // calendar days (today + the previous N-1), not N+1.
        since.setUTCDate(since.getUTCDate() - (clampedDays - 1));
        const sinceDate = this.toUtcDateOnly(since);

        const records = await this.prisma.dailyProgress.findMany({
            where: {
                userId,
                date: { gte: sinceDate },
            },
        });

        const daysTracked = records.length;

        if (daysTracked === 0) {
            return {
                daysTracked: 0,
                daysWithTarget: 0,
                adherentDays: 0,
                adherencePercent: 0,
                avgCaloriesActual: 0,
                avgCaloriesTarget: null,
                avgProteinActual: 0,
                avgCarbsActual: 0,
                avgFatActual: 0,
                avgHydrationActual: 0,
                totalMealsLogged: 0,
            };
        }

        const daysWithTarget = records.filter(
            (r) => r.caloriesTarget !== null && r.caloriesTarget > 0,
        ).length;

        const adherentDays = records.filter((r) => r.isAdherent).length;

        const adherencePercent =
            daysWithTarget > 0
                ? finite(Math.round((adherentDays / daysWithTarget) * 100 * 10) / 10)
                : 0;

        const sum = (key: keyof typeof records[0]) =>
            records.reduce((acc, r) => acc + (Number(r[key]) || 0), 0);

        const totalCaloriesActual = sum('caloriesActual');
        const totalProteinActual = sum('proteinActual');
        const totalCarbsActual = sum('carbsActual');
        const totalFatActual = sum('fatActual');
        const totalHydrationActual = sum('hydrationActual');
        const totalMealsLogged = records.reduce((acc, r) => acc + r.mealsLogged, 0);

        // Average over the SAME predicate as daysWithTarget (caloriesTarget !==
        // null && > 0). A stored 0 target is not a real target and must not drag
        // the average down (or, if all targets were 0, produce a misleading 0
        // instead of null).
        const targetRecords = records.filter(
            (r) => r.caloriesTarget !== null && r.caloriesTarget > 0,
        );
        const avgCaloriesTarget =
            targetRecords.length > 0
                ? targetRecords.reduce((acc, r) => acc + (r.caloriesTarget ?? 0), 0) /
                targetRecords.length
                : null;

        return {
            daysTracked,
            daysWithTarget,
            adherentDays,
            adherencePercent,
            avgCaloriesActual: finite(Math.round((totalCaloriesActual / daysTracked) * 10) / 10),
            avgCaloriesTarget:
                avgCaloriesTarget !== null
                    ? finite(Math.round(avgCaloriesTarget * 10) / 10, 0)
                    : null,
            avgProteinActual: finite(Math.round((totalProteinActual / daysTracked) * 10) / 10),
            avgCarbsActual: finite(Math.round((totalCarbsActual / daysTracked) * 10) / 10),
            avgFatActual: finite(Math.round((totalFatActual / daysTracked) * 10) / 10),
            avgHydrationActual: finite(Math.round((totalHydrationActual / daysTracked) * 10) / 10),
            totalMealsLogged,
        };
    }

    // ---------------------------------------------------------------------------
    // Body metrics
    // ---------------------------------------------------------------------------

    /**
     * Log a body metrics snapshot (weight, body fat, measurements).
     * Publishes progress.metrics-logged for downstream consumers.
     */
    async logBodyMetrics(userId: string, data: {
        weightKg?: number | null;
        bodyFatPct?: number | null;
        muscleMassKg?: number | null;
        waistCm?: number | null;
        hipsCm?: number | null;
        chestCm?: number | null;
        armsCm?: number | null;
        thighsCm?: number | null;
        calvesCm?: number | null;
        notes?: string | null;
    }): Promise<any> {
        // Compute BMI if height is available — we fall back to weight-only
        const bmi = data.weightKg ? null : null; // Coach service will enrich with height

        const record = await (this.prisma as any).bodyMetrics.create({
            data: {
                userId,
                recordedAt: new Date(),
                bmi,
                ...data,
            },
        });

        const metricsPayload: BodyMetricsLoggedPayload = {
            metricsId: record.id,
            measuredAt: record.recordedAt.toISOString(),
            weightKg: data.weightKg ?? null,
            bodyFatPct: data.bodyFatPct ?? null,
            bmi: null,
        };

        await this.eventBus.publish<BodyMetricsLoggedPayload>(Channels.Progress.MetricsLogged, {
            eventId: crypto.randomUUID(),
            eventType: 'progress.metrics-logged',
            producedAt: new Date().toISOString(),
            producerService: 'progress-service',
            correlationId: crypto.randomUUID(),
            userId,
            payload: metricsPayload,
        });

        logger.info({ userId, metricsId: record.id }, 'Body metrics logged');
        return record;
    }

    async getBodyMetricsHistory(userId: string, days: number): Promise<any[]> {
        const clampedDays = Math.min(days, 365);
        const since = new Date();
        // Inclusive N-day window: subtract (N-1) so the window spans exactly N
        // calendar days (today + the previous N-1), not N+1.
        since.setUTCDate(since.getUTCDate() - (clampedDays - 1));
        return (this.prisma as any).bodyMetrics.findMany({
            where: { userId, recordedAt: { gte: since } },
            orderBy: { recordedAt: 'desc' },
        });
    }

    /**
     * runWeeklyOptimization
     * Triggers the AdaptiveGoalOptimizer for a user.
     * Usually called on a cron or after a weekly report is requested.
     */
    async runWeeklyOptimization(userId: string): Promise<any> {
        logger.info({ userId }, 'Running weekly goal optimization');

        // 1. Fetch preferences from user-service
        let preferences;
        try {
            const res = await fetch(`${this.config.USER_SERVICE_URL}/v1/users/internal/preferences/${userId}`, {
                // F34 #5: user-service /internal/* now requires the shared token.
                headers: { 'X-Internal-Token': this.config.INTERNAL_SERVICE_TOKEN ?? '' },
            });
            if (!res.ok) throw new Error('Could not fetch preferences');
            preferences = await res.json();
        } catch (err) {
            logger.error({ userId, err }, 'Optimization failed: Preferences unavailable');
            return { success: false, error: 'Preferences unavailable' };
        }

        // 2. Fetch last 7 days of progress
        const progress = await this.getProgressHistory(userId, 7);

        // 3. Fetch last 7 days of metrics
        const metrics = await this.getBodyMetricsHistory(userId, 7);

        // 4. Run Optimizer
        const result = AdaptiveGoalOptimizer.optimize(preferences as any, progress, metrics);

        if (!result || result.adjustmentMade === 0) {
            logger.info({ userId, reason: result?.reason }, 'No adjustment needed');
            return { success: true, adjustment: 0, reason: result?.reason };
        }

        // 5. Apply adjustment to user-service
        try {
            const updateRes = await fetch(`${this.config.USER_SERVICE_URL}/v1/users/internal/preferences/${userId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    // F34 #5: send the shared internal token (consistent with the
                    // GET above). NOTE: user-service does not currently define a
                    // PUT /internal/preferences route, so this call already 404s
                    // pre-F34 — see the summary's "could not secure" note.
                    'X-Internal-Token': this.config.INTERNAL_SERVICE_TOKEN ?? '',
                },
                body: JSON.stringify({ targetCalories: result.newCalorieTarget })
            });

            if (!updateRes.ok) throw new Error('Failed to update preferences in user-service');

            logger.info({ userId, ...result }, 'Applied weekly calorie adjustment');

            // 6. Notify user
            await this.eventBus.publish<NotificationSendPayload>(Channels.Notification.Send, {
                eventId: crypto.randomUUID(),
                eventType: 'notification.send',
                producedAt: new Date().toISOString(),
                producerService: 'progress-service',
                correlationId: crypto.randomUUID(),
                userId,
                payload: {
                    type: 'DAILY_GOAL_UPDATE',
                    title: 'Diet Optimization Applied',
                    body: `We've adjusted your daily target to ${result.newCalorieTarget} kcal. Reason: ${result.reason}`,
                    data: result
                }
            });

            // 7. Advance Cycle Week
            try {
                const stateRes = await fetch(`${(this as any).config.STATE_SERVICE_URL}/v1/state/${userId}`);
                if (stateRes.ok) {
                    const userState = await stateRes.json() as any;
                    let newWeek = (userState.cycleWeek || 1) + 1;
                    let phase = userState.trainingPhase || 'HYPERTROPHY';

                    // Simple logic: if week > 4, reset to 1 and potentially flip phase or stay in deload/prep
                    if (newWeek > 4) {
                        newWeek = 1;
                        // For now just keep same phase or flip-flop if we had more complex logic
                    }

                    await this.eventBus.publish<CycleAdvancedPayload>(Channels.Progress.CycleAdvanced, {
                        eventId: crypto.randomUUID(),
                        eventType: 'progress.cycle-advanced',
                        producedAt: new Date().toISOString(),
                        producerService: 'progress-service',
                        correlationId: crypto.randomUUID(),
                        userId,
                        payload: {
                            trainingPhase: phase,
                            newCycleWeek: newWeek
                        }
                    });
                    logger.info({ userId, newWeek }, 'Published cycle advancement event');
                }
            } catch (err) {
                logger.error({ userId, err }, 'Failed to trigger cycle advancement');
            }

            return { success: true, ...result };
        } catch (err) {
            logger.error({ userId, err }, 'Failed to apply optimization adjustment');
            return { success: false, error: 'Failed to apply adjustment' };
        }
    }

    /**
     * The raw HTTP call to ai-pipeline's weekly-audit endpoint, factored out so
     * the opossum breaker (this.aiBreaker) can wrap it. AbortSignal.timeout(30s)
     * bounds a single attempt so a stalled provider can't hold a Fastify worker;
     * the breaker's matching 30s timeout + 50%/30s open policy sheds load across
     * calls. Throws on non-2xx / timeout so the breaker records the failure.
     */
    private async makeWeeklyAuditRequest(userId: string, body: any): Promise<Record<string, any>> {
        const aiBaseUrl = (this as any).config.AI_PIPELINE_URL || 'http://localhost:8000';
        const response = await fetch(`${aiBaseUrl}/v1/ai/weekly-audit?userId=${userId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // F22 #8: authorize this server-to-server call to ai-pipeline.
                'X-Internal-Token': (this as any).config.INTERNAL_SERVICE_TOKEN ?? '',
            },
            body: JSON.stringify(body),
            // HIGH #3: bound a single attempt so an ai-pipeline brownout can't
            // hang this worker; the breaker's timeout is the outer guard.
            signal: AbortSignal.timeout(30000),
        });

        if (!response.ok) {
            const text = await response.text();
            logger.error({ userId, status: response.status, text }, 'AI pipeline audit failed');
            throw new Error('AI pipeline failed to generate audit');
        }

        return (await response.json()) as Record<string, any>;
    }

    /**
     * generateWeeklyAudit
     * Fetches historical data and preferences, calls the AI pipeline for a summary.
     */
    async generateWeeklyAudit(userId: string): Promise<any> {
        logger.info({ userId }, 'Generating weekly AI audit');

        // 1. Fetch preferences
        let preferences;
        try {
            const res = await fetch(`${this.config.USER_SERVICE_URL}/v1/users/internal/preferences/${userId}`, {
                // F34 #5: user-service /internal/* now requires the shared token.
                headers: { 'X-Internal-Token': this.config.INTERNAL_SERVICE_TOKEN ?? '' },
            });
            if (!res.ok) throw new Error('Could not fetch preferences');
            preferences = await res.json();
        } catch (err) {
            logger.error({ userId, err }, 'Weekly audit failed: Preferences unavailable');
            throw new Error('Preferences unavailable');
        }

        // 2. Fetch stats and history
        const stats = await this.getStats(userId, 7);
        const { chartData } = await this.getWeeklyStats(userId);

        // 3. Call AI Pipeline (through the circuit breaker — HIGH #3).
        try {
            // breaker.fire applies the 30s timeout + open-circuit fast-fail; on a
            // brownout it rejects immediately via the fallback instead of hanging.
            const audit = await this.aiBreaker.fire(userId, {
                userId,
                stats,
                history: chartData,
                preferences
            }) as Record<string, any>;

            // Generate a date range string for UI
            const today = new Date();
            const lastWeek = new Date(today);
            lastWeek.setDate(lastWeek.getDate() - 7);
            const weekRange = `${lastWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${today.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

            // Save to database
            const savedReport = await (this.prisma as any).performanceReport.create({
                data: {
                    userId,
                    weekRange: audit.weekRange || weekRange,
                    score: audit.score ?? 0,
                    summary: audit.summary ?? '',
                    highlights: audit.highlights ?? [],
                    improvements: audit.improvements ?? [],
                    focusArea: audit.focusArea ?? '',
                    date: this.toUtcDateOnly(new Date())
                }
            });

            logger.info({ userId }, 'Weekly audit generated successfully');
            return savedReport;
        } catch (err) {
            logger.error({ userId, err }, 'Failed to call AI pipeline for weekly audit');
            throw err;
        }
    }

    /**
     * getReports
     * Retrieves historical AI Performance Reports for the user
     */
    async getReports(userId: string): Promise<any[]> {
        return (this.prisma as any).performanceReport.findMany({
            where: { userId },
            orderBy: { date: 'desc' }
        });
    }

    /**
     * GET /v1/progress/weekly-stats
     * Returns consolidated 7-day stats for charts.
     */
    async getWeeklyStats(userId: string) {
        const history = await this.getProgressHistory(userId, 7);
        const metrics = await this.getBodyMetricsHistory(userId, 7);

        // Map into a flat structure for charts (reverse for chronological order)
        const chartData = [...history].reverse().map(day => {
            const dayMetrics = metrics.find(m =>
                this.toUtcDateOnly(m.recordedAt).getTime() === this.toUtcDateOnly(day.date).getTime()
            );

            return {
                date: day.date.toISOString().split('T')[0],
                caloriesActual: day.caloriesActual,
                caloriesTarget: day.caloriesTarget,
                isAdherent: day.isAdherent,
                fatigueScore: day.fatigueScore,
                weightKg: dayMetrics?.weightKg || null,
                stepCount: day.stepCount || 0
            };
        });

        return {
            summary: await this.getStats(userId, 7),
            chartData
        };
    }

    // ---------------------------------------------------------------------------
    // Telemetry
    // ---------------------------------------------------------------------------

    /**
     * POST /v1/progress/ai-usage
     * Saves AI token usage telemetry from the ai-pipeline.
     */
    async logAiUsage(data: {
        userId: string;
        action: string;
        provider: string;
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    }): Promise<any> {
        return (this.prisma as any).aiUsageLog.create({
            data: {
                userId: data.userId,
                action: data.action,
                provider: data.provider,
                promptTokens: data.promptTokens,
                completionTokens: data.completionTokens,
                totalTokens: data.totalTokens
            }
        });
    }

    // ---------------------------------------------------------------------------
    // GDPR purge — PERMANENTLY erase every progress-service row owned by userId.
    //
    // Backs DELETE /v1/progress/internal/user/:userId (server-to-server only,
    // guarded by the shared X-Internal-Token check). Covers ALL six user-owned
    // tables in this service's schema (every model carries a `user_id` column):
    //   daily_progress, streaks, body_metrics, ai_usage_logs, hydration_logs,
    //   performance_reports.
    //
    // IDEMPOTENT: deleteMany never throws on zero matched rows, so purging a user
    // with no data returns all-zero counts and purging twice is safe. The whole
    // set runs in a single $transaction so a partial failure rolls back (no
    // half-deleted user). Returns a per-table deletedCounts summary.
    // ---------------------------------------------------------------------------
    async purgeUser(userId: string): Promise<{
        daily_progress: number;
        streaks: number;
        body_metrics: number;
        ai_usage_logs: number;
        hydration_logs: number;
        performance_reports: number;
    }> {
        const p = this.prisma as any;
        const [
            dailyProgress,
            streaks,
            bodyMetrics,
            aiUsageLogs,
            hydrationLogs,
            performanceReports,
        ] = await p.$transaction([
            p.dailyProgress.deleteMany({ where: { userId } }),
            p.streak.deleteMany({ where: { userId } }),
            p.bodyMetrics.deleteMany({ where: { userId } }),
            p.aiUsageLog.deleteMany({ where: { userId } }),
            p.hydrationLog.deleteMany({ where: { userId } }),
            p.performanceReport.deleteMany({ where: { userId } }),
        ]);

        return {
            daily_progress: dailyProgress.count,
            streaks: streaks.count,
            body_metrics: bodyMetrics.count,
            ai_usage_logs: aiUsageLogs.count,
            hydration_logs: hydrationLogs.count,
            performance_reports: performanceReports.count,
        };
    }

    // ---------------------------------------------------------------------------
    // GDPR data export — READ every progress-service row owned by userId.
    //
    // Backs GET /v1/progress/internal/user/:userId/export (server-to-server only,
    // guarded by the SAME shared X-Internal-Token check the purge uses). The
    // read-only counterpart of purgeUser: it returns the user's rows across the
    // EXACT SAME six user-owned tables the purge clears, keyed by table name, so
    // export and erasure stay in sync (the gdpr-export test asserts the two key
    // sets are identical).
    //   daily_progress, streaks, body_metrics, ai_usage_logs, hydration_logs,
    //   performance_reports.
    //
    // SECURITY: this service's schema contains NO secret/credential/token/raw-key
    // columns in any of the six tables (every field is the user's own fitness
    // telemetry — macros, weight/measurements, streaks, AI token *counts*, etc.),
    // so there is nothing to scrub here. We still cap each table at ROW_LIMIT so a
    // pathological row count can't produce an unbounded payload; _meta flags any
    // table that was truncated.
    //
    // READ-ONLY & IDEMPOTENT: only findMany/findUnique are issued; a user with no
    // rows yields empty arrays (never throws), and repeated calls return identical
    // output without mutating anything.
    // ---------------------------------------------------------------------------
    async exportUser(userId: string): Promise<{
        daily_progress: any[];
        streaks: any[];
        body_metrics: any[];
        ai_usage_logs: any[];
        hydration_logs: any[];
        performance_reports: any[];
        _meta: { rowLimit: number; truncated: string[] };
    }> {
        // Per-table cap. Per-user fitness rows are small (one daily_progress row
        // per day, etc.), so 50k is far above any real user while still bounding a
        // pathological/abusive row count. take = ROW_LIMIT + 1 detects overflow.
        const ROW_LIMIT = 50_000;
        const p = this.prisma as any;

        const [
            dailyProgress,
            streaks,
            bodyMetrics,
            aiUsageLogs,
            hydrationLogs,
            performanceReports,
        ] = await p.$transaction([
            p.dailyProgress.findMany({
                where: { userId },
                orderBy: { date: 'desc' },
                take: ROW_LIMIT + 1,
            }),
            // Streak is unique per user (0-or-1 rows); findMany keeps the
            // by-table-array shape consistent with the rest of the export.
            p.streak.findMany({ where: { userId }, take: ROW_LIMIT + 1 }),
            p.bodyMetrics.findMany({
                where: { userId },
                orderBy: { recordedAt: 'desc' },
                take: ROW_LIMIT + 1,
            }),
            p.aiUsageLog.findMany({
                where: { userId },
                orderBy: { createdAt: 'desc' },
                take: ROW_LIMIT + 1,
            }),
            p.hydrationLog.findMany({
                where: { userId },
                orderBy: { date: 'desc' },
                take: ROW_LIMIT + 1,
            }),
            p.performanceReport.findMany({
                where: { userId },
                orderBy: { date: 'desc' },
                take: ROW_LIMIT + 1,
            }),
        ]);

        const truncated: string[] = [];
        const cap = (table: string, rows: any[]): any[] => {
            if (rows.length > ROW_LIMIT) {
                truncated.push(table);
                return rows.slice(0, ROW_LIMIT);
            }
            return rows;
        };

        return {
            daily_progress: cap('daily_progress', dailyProgress),
            streaks: cap('streaks', streaks),
            body_metrics: cap('body_metrics', bodyMetrics),
            ai_usage_logs: cap('ai_usage_logs', aiUsageLogs),
            hydration_logs: cap('hydration_logs', hydrationLogs),
            performance_reports: cap('performance_reports', performanceReports),
            _meta: { rowLimit: ROW_LIMIT, truncated },
        };
    }
}
