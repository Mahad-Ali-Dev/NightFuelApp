/**
 * Unit suite — exercise-service heatmap scan bound (src/exercise.service.ts).
 *
 * getHeatmap() previously ran `prisma.workout.findMany({ where: { userId } })`
 * with NO take and NO date window — an unbounded DB scan over every workout a
 * user has ever logged (the same class S16/S17 fixed for shift/plan ranges),
 * which also skews currentStreak/longestStreak over an ever-growing set. The
 * fix bounds the query to a rolling MAX_QUERY_RANGE_DAYS (366-day) trailing
 * window via `completedAt: { gte: cutoff }`.
 *
 * This suite proves the bound is correct WITHOUT a database, mirroring the
 * existing pure-helper style (computeStreaks). It imports the REAL exports —
 * `isWithinHeatmapWindow` (the pure mirror of the Prisma `gte` cutoff) and the
 * already-exported `computeStreaks` — from src/exercise.service.ts and injects
 * a fixed `nowMs` / `todayKey`, so nothing instantiates a PrismaClient (the
 * client is only constructed inside the ExerciseService constructor, never at
 * import). Two properties are locked:
 *
 *   (a) Out-of-window exclusion — a workout dated just over 366 days before a
 *       fixed `nowMs` is excluded (isWithinHeatmapWindow === false), and
 *       feeding ONLY out-of-window day-keys to computeStreaks (as the windowed
 *       findMany would, after the DB filters them out) yields a zeroed current
 *       streak — i.e. an ancient run no longer inflates today's streak.
 *   (b) In-window preservation — a within-window consecutive run ending at
 *       `todayKey` produces an unchanged currentStreak / longestStreak, so the
 *       366-day bound does not alter real-data results. 366 days fully contains
 *       any current/longest streak ending today or yesterday.
 */
import { computeStreaks, isWithinHeatmapWindow } from '../src/exercise.service';

// The shared 366-day cap (~1 leap year). Mirrors MAX_QUERY_RANGE_DAYS in
// @nightfuel/config — the default used by isWithinHeatmapWindow / the getHeatmap
// Prisma cutoff. Re-declared locally so the test asserts the concrete number and
// stays DB-/import-free of the runtime config build.
const MAX_QUERY_RANGE_DAYS = 366;
const MS_PER_DAY = 86_400_000;

// A fixed, timezone-independent "now" so the trailing-window math is
// deterministic across CI hosts (UTC midnight, matching how getHeatmap derives
// day-keys from completedAt.toISOString()).
const NOW_ISO = '2026-06-18T00:00:00.000Z';
const NOW_MS = Date.parse(NOW_ISO);
const TODAY_KEY = NOW_ISO.split('T')[0]; // '2026-06-18'

/** UTC YYYY-MM-DD `days` whole days before NOW_MS (negative = before). */
const keyDaysBeforeNow = (days: number): string =>
    new Date(NOW_MS - days * MS_PER_DAY).toISOString().split('T')[0];

describe('isWithinHeatmapWindow — rolling 366-day bound', () => {
    it('excludes a workout dated just OVER 366 days before now', () => {
        // 367 whole days back → strictly older than the cutoff → out of window.
        const tooOld = new Date(NOW_MS - (MAX_QUERY_RANGE_DAYS + 1) * MS_PER_DAY).toISOString();
        expect(isWithinHeatmapWindow(tooOld, NOW_MS)).toBe(false);
    });

    it('includes a workout exactly AT the 366-day cutoff boundary (gte)', () => {
        // The Prisma filter is `gte: cutoff`, so the cutoff instant itself is in.
        const atBoundary = new Date(NOW_MS - MAX_QUERY_RANGE_DAYS * MS_PER_DAY).toISOString();
        expect(isWithinHeatmapWindow(atBoundary, NOW_MS)).toBe(true);
    });

    it('includes a workout completed exactly now and one day inside the window', () => {
        expect(isWithinHeatmapWindow(NOW_ISO, NOW_MS)).toBe(true);
        const oneDayInside = new Date(
            NOW_MS - (MAX_QUERY_RANGE_DAYS - 1) * MS_PER_DAY,
        ).toISOString();
        expect(isWithinHeatmapWindow(oneDayInside, NOW_MS)).toBe(true);
    });

    it('honours an explicit smaller windowDays override', () => {
        // 10 days back is within 366 but outside a 7-day window.
        const tenDaysBack = new Date(NOW_MS - 10 * MS_PER_DAY).toISOString();
        expect(isWithinHeatmapWindow(tenDaysBack, NOW_MS)).toBe(true);
        expect(isWithinHeatmapWindow(tenDaysBack, NOW_MS, 7)).toBe(false);
    });
});

describe('getHeatmap streak bound — out-of-window day-keys (post-filter)', () => {
    it('a run of out-of-window days yields a zeroed currentStreak', () => {
        // Simulate what the windowed findMany returns: an old 3-day consecutive
        // run, all dated > 366 days ago. After the DB applies `gte: cutoff` these
        // rows are gone, but even if they were present they are far older than
        // yesterday, so computeStreaks reports NO current streak.
        const oldRun = [
            keyDaysBeforeNow(400),
            keyDaysBeforeNow(399),
            keyDaysBeforeNow(398),
        ];
        // Sanity: every key is genuinely outside the 366-day window.
        for (const key of oldRun) {
            expect(isWithinHeatmapWindow(`${key}T00:00:00.000Z`, NOW_MS)).toBe(false);
        }

        const { currentStreak, longestStreak } = computeStreaks(oldRun, TODAY_KEY);
        expect(currentStreak).toBe(0); // ancient run does not inflate today's streak
        expect(longestStreak).toBe(3); // the old run's own length is still measured
    });

    it('an empty (fully filtered-out) set yields zeroed streaks', () => {
        const { currentStreak, longestStreak } = computeStreaks([], TODAY_KEY);
        expect(currentStreak).toBe(0);
        expect(longestStreak).toBe(0);
    });
});

describe('getHeatmap streak bound — in-window run is preserved', () => {
    it('a consecutive run ending at todayKey keeps currentStreak === longestStreak', () => {
        // A 5-day consecutive run ending today, all comfortably inside 366 days —
        // exactly the rows the windowed query keeps. The bound must NOT alter the
        // streak result for this real-data case.
        const inWindowRun = [
            keyDaysBeforeNow(4),
            keyDaysBeforeNow(3),
            keyDaysBeforeNow(2),
            keyDaysBeforeNow(1),
            keyDaysBeforeNow(0), // == TODAY_KEY
        ];
        expect(inWindowRun[inWindowRun.length - 1]).toBe(TODAY_KEY);
        for (const key of inWindowRun) {
            expect(isWithinHeatmapWindow(`${key}T00:00:00.000Z`, NOW_MS)).toBe(true);
        }

        const { currentStreak, longestStreak } = computeStreaks(inWindowRun, TODAY_KEY);
        expect(currentStreak).toBe(5);
        expect(longestStreak).toBe(5);
    });

    it('a run ending YESTERDAY still counts as the current streak', () => {
        // computeStreaks counts a streak ending today OR yesterday so it is not
        // reported broken before today's workout is logged.
        const endingYesterday = [
            keyDaysBeforeNow(3),
            keyDaysBeforeNow(2),
            keyDaysBeforeNow(1), // yesterday
        ];
        const { currentStreak, longestStreak } = computeStreaks(endingYesterday, TODAY_KEY);
        expect(currentStreak).toBe(3);
        expect(longestStreak).toBe(3);
    });
});
