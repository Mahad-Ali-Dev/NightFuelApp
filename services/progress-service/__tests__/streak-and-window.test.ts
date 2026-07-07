/**
 * Regression suite — progress-service STREAK-FRESHNESS + N-DAY-WINDOW invariants
 * (src/progress.service.ts: getStreak, getProgressHistory, getStats,
 * getBodyMetricsHistory).
 *
 * This is deliberately separate from stats-finite.test.ts (which locks the
 * finite-ness invariant inside getStats) and input-bounds.test.ts (which locks
 * the route-level `days` clamps). Neither covers the two correctness bugs locked
 * here:
 *
 *   1. STREAK FRESHNESS — getStreak used to return the stored row verbatim, so a
 *      currentStreak went stale after a break: a user on a 5-day streak who then
 *      logged nothing for a week still read currentStreak=5. updateStreak only
 *      advances on a positive adherence event, so it can never *reset* a broken
 *      run at write time. getStreak now recomputes the live current streak at
 *      read time: the streak is only alive if lastAdherentDate is today or
 *      yesterday (UTC date-only); otherwise currentStreak collapses to 0.
 *      longestStreak (a historical high-water mark) is never reset. This mirrors
 *      the anchor logic in clients/mobile/src/lib/streaks.ts.
 *
 *   2. N-DAY WINDOW — getProgressHistory / getStats / getBodyMetricsHistory each
 *      built their `since` lower bound with `setUTCDate(getUTCDate() - N)` then
 *      filtered `date >= since`, which spans N+1 calendar days (today + the
 *      previous N). They now subtract (N-1) so a request for N days covers
 *      EXACTLY N days (today + the previous N-1). We assert this by capturing the
 *      `gte` bound handed to Prisma and counting the inclusive day-span to today.
 *
 * Like stats-finite.test.ts, this imports src/progress.service.ts directly (it is
 * a pure class module that opens no DB/Redis at import time) and drives it with a
 * fake PrismaClient + minimal fake EventBus/config — the read paths under test
 * publish nothing and read no config.
 */
import { ProgressService } from '../src/progress.service';

const DAY_MS = 24 * 60 * 60 * 1000;

/** UTC date-only (midnight) for a Date — mirrors the service's toUtcDateOnly. */
function utcDateOnly(d: Date): Date {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

const fakeEventBus: any = { publish: async () => {} };
const fakeConfig: any = { USER_SERVICE_URL: 'http://user-service.invalid' };

// ── getStreak — streak-freshness invariant ──────────────────────────────────
describe('progress-service getStreak — recomputes a stale current streak after a break', () => {
    function makeServiceWithStreak(streakRow: any): ProgressService {
        const fakePrisma: any = {
            streak: { findUnique: async () => streakRow },
        };
        return new ProgressService(fakePrisma, fakeEventBus, fakeConfig);
    }

    const today = utcDateOnly(new Date());
    const yesterday = new Date(today.getTime() - DAY_MS);

    it('no streak row → zero defaults', async () => {
        const svc = makeServiceWithStreak(null);
        const res = await svc.getStreak('user-1');
        expect(res).toEqual({ currentStreak: 0, longestStreak: 0, lastAdherentDate: null });
    });

    it('lastAdherentDate is today → current streak is preserved (alive)', async () => {
        const svc = makeServiceWithStreak({
            currentStreak: 5,
            longestStreak: 9,
            lastAdherentDate: today,
        });
        const res = await svc.getStreak('user-1');
        expect(res.currentStreak).toBe(5);
        expect(res.longestStreak).toBe(9);
    });

    it('lastAdherentDate is yesterday → current streak is preserved (still alive)', async () => {
        const svc = makeServiceWithStreak({
            currentStreak: 5,
            longestStreak: 9,
            lastAdherentDate: yesterday,
        });
        const res = await svc.getStreak('user-1');
        expect(res.currentStreak).toBe(5);
        expect(res.longestStreak).toBe(9);
    });

    it('BREAK: lastAdherentDate is older than yesterday → current streak resets to 0, longest unchanged', async () => {
        // 7 days ago: the run is broken even though the stored row still says 5.
        const sevenDaysAgo = new Date(today.getTime() - 7 * DAY_MS);
        const svc = makeServiceWithStreak({
            currentStreak: 5,
            longestStreak: 9,
            lastAdherentDate: sevenDaysAgo,
        });
        const res = await svc.getStreak('user-1');
        expect(res.currentStreak).toBe(0);
        // longestStreak is a historical high-water mark — never reset on read.
        expect(res.longestStreak).toBe(9);
        // The raw lastAdherentDate is passed through unchanged for the client.
        expect(res.lastAdherentDate).toBe(sevenDaysAgo);
    });

    it('BREAK at exactly 2 days ago (day before yesterday) → current streak resets to 0', async () => {
        const twoDaysAgo = new Date(today.getTime() - 2 * DAY_MS);
        const svc = makeServiceWithStreak({
            currentStreak: 3,
            longestStreak: 3,
            lastAdherentDate: twoDaysAgo,
        });
        const res = await svc.getStreak('user-1');
        expect(res.currentStreak).toBe(0);
        expect(res.longestStreak).toBe(3);
    });

    it('null lastAdherentDate on an existing row → current streak resets to 0 (no live anchor)', async () => {
        const svc = makeServiceWithStreak({
            currentStreak: 4,
            longestStreak: 8,
            lastAdherentDate: null,
        });
        const res = await svc.getStreak('user-1');
        expect(res.currentStreak).toBe(0);
        expect(res.longestStreak).toBe(8);
    });
});

// ── N-day window — exactly N days, not N+1 ──────────────────────────────────
describe('progress-service N-day window — a request for N days covers exactly N days', () => {
    /**
     * Capture the `gte` lower bound a query method hands to Prisma's findMany on
     * the given delegate, then count the inclusive calendar-day span between that
     * bound and today. A correct inclusive N-day window yields exactly N.
     */
    function inclusiveDaySpan(gte: Date): number {
        const today = utcDateOnly(new Date());
        const since = utcDateOnly(gte);
        return Math.round((today.getTime() - since.getTime()) / DAY_MS) + 1;
    }

    function makeCapturingService(delegateName: string): {
        svc: ProgressService;
        getCapturedGte: () => Date;
    } {
        let capturedGte: Date | undefined;
        const findMany = async (args: any) => {
            capturedGte = args.where.date?.gte ?? args.where.recordedAt?.gte;
            return [];
        };
        const fakePrisma: any = { [delegateName]: { findMany } };
        const svc = new ProgressService(fakePrisma, fakeEventBus, fakeConfig);
        return {
            svc,
            getCapturedGte: () => {
                if (!capturedGte) throw new Error('findMany was not called');
                return capturedGte;
            },
        };
    }

    const CASES = [1, 7, 30, 90];

    describe('getProgressHistory', () => {
        for (const n of CASES) {
            it(`days=${n} → inclusive window spans exactly ${n} day(s)`, async () => {
                const { svc, getCapturedGte } = makeCapturingService('dailyProgress');
                await svc.getProgressHistory('user-1', n);
                expect(inclusiveDaySpan(getCapturedGte())).toBe(n);
            });
        }
    });

    describe('getStats', () => {
        // getStats reads many columns off the rows; an empty result set hits the
        // daysTracked===0 early return, but findMany (and its gte) still fires.
        for (const n of CASES) {
            it(`days=${n} → inclusive window spans exactly ${n} day(s)`, async () => {
                const { svc, getCapturedGte } = makeCapturingService('dailyProgress');
                await svc.getStats('user-1', n);
                expect(inclusiveDaySpan(getCapturedGte())).toBe(n);
            });
        }
    });

    describe('getBodyMetricsHistory', () => {
        for (const n of CASES) {
            it(`days=${n} → inclusive window spans exactly ${n} day(s)`, async () => {
                const { svc, getCapturedGte } = makeCapturingService('bodyMetrics');
                await svc.getBodyMetricsHistory('user-1', n);
                expect(inclusiveDaySpan(getCapturedGte())).toBe(n);
            });
        }
    });
});

// ── avgCaloriesTarget — excludes 0 targets (same predicate as daysWithTarget) ─
describe('progress-service getStats — avgCaloriesTarget ignores non-positive targets', () => {
    interface FakeRow {
        caloriesActual: number;
        proteinActual: number;
        carbsActual: number;
        fatActual: number;
        hydrationActual: number;
        caloriesTarget: number | null;
        mealsLogged: number;
        isAdherent: boolean;
    }

    function makeService(rows: FakeRow[]): ProgressService {
        const fakePrisma: any = { dailyProgress: { findMany: async () => rows } };
        return new ProgressService(fakePrisma, fakeEventBus, fakeConfig);
    }

    const base = {
        caloriesActual: 0,
        proteinActual: 0,
        carbsActual: 0,
        fatActual: 0,
        hydrationActual: 0,
        mealsLogged: 0,
        isAdherent: false,
    };

    it('a 0 target does not drag the average down — averaged over > 0 targets only', async () => {
        const svc = makeService([
            { ...base, caloriesTarget: 2000 },
            { ...base, caloriesTarget: 0 }, // not a real target → excluded
        ]);
        const stats = await svc.getStats('user-1', 7);
        // Average over the single positive target (2000), NOT (2000+0)/2 = 1000.
        expect(stats.avgCaloriesTarget).toBe(2000);
        // daysWithTarget already used the > 0 predicate; the average now matches it.
        expect(stats.daysWithTarget).toBe(1);
    });

    it('all targets are 0 → avgCaloriesTarget is null (no real targets), not 0', async () => {
        const svc = makeService([
            { ...base, caloriesTarget: 0 },
            { ...base, caloriesTarget: 0 },
        ]);
        const stats = await svc.getStats('user-1', 7);
        expect(stats.avgCaloriesTarget).toBeNull();
        expect(stats.daysWithTarget).toBe(0);
    });
});
