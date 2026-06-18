/**
 * Regression suite — progress-service derived-stats FINITE-NESS invariant
 * (src/progress.service.ts: getStats).
 *
 * This is deliberately separate from error-redaction.test.ts (the shared
 * Fastify 5xx handler). That suite cannot cover the invariant locked here,
 * which lives INSIDE getStats rather than in a route:
 *
 *   FINITE-NESS — getStats computes adherencePercent and every avg* field by
 *   division/reduction over DailyProgress rows. A poisoned or zero-denominator
 *   intermediate could surface NaN/Infinity into statsResponseSchema
 *   (schemas.ts: adherencePercent is z.number().min(0).max(100); the avgs are
 *   .nonnegative()), which would fail serialization or leak a non-finite
 *   number. getStats now wraps each division-derived field in a local
 *   `finite(x, fallback=0)` helper (mirrors sleep-service's
 *   Number.isFinite-guarded sub-scores), so any non-finite value can only ever
 *   collapse to a safe default — it can never reach the response. We assert
 *   every numeric field is Number.isFinite, and that a normal history still
 *   yields the SAME numbers as the pre-hardening arithmetic.
 *
 * Why this can import src/ when error-redaction.test.ts can't: progress.service.ts
 * is a pure class module — unlike src/index.ts it opens NO DB/Redis connection
 * at import time. We drive it with a fake PrismaClient (getStats only calls
 * dailyProgress.findMany) plus a minimal fake EventBus and config object;
 * getStats publishes nothing and reads no config, so no real infra is required.
 */
import { ProgressService } from '../src/progress.service';

// A row shape loose enough for getStats: it reads caloriesTarget, isAdherent,
// caloriesActual/proteinActual/carbsActual/fatActual and mealsLogged off each row.
interface FakeRow {
    caloriesActual: number;
    proteinActual: number;
    carbsActual: number;
    fatActual: number;
    caloriesTarget: number | null;
    mealsLogged: number;
    isAdherent: boolean;
}

/**
 * Build a ProgressService whose dailyProgress.findMany resolves to `rows`.
 * Every other Prisma method is a never-called stub — getStats only calls
 * findMany. The EventBus + config are minimal fakes the read path never touches.
 */
function makeService(rows: FakeRow[]): ProgressService {
    const fakePrisma: any = {
        dailyProgress: {
            findMany: async () => rows,
        },
    };
    const fakeEventBus: any = { publish: async () => {} };
    const fakeConfig: any = { USER_SERVICE_URL: 'http://user-service.invalid' };
    return new ProgressService(fakePrisma, fakeEventBus, fakeConfig);
}

const USER = 'user-1';

describe('progress-service getStats — finite-ness invariant', () => {
    it('Case A: empty history → documented zero-defaults (never NaN/Infinity)', async () => {
        const svc = makeService([]);
        const stats = await svc.getStats(USER, 30);

        // The daysTracked===0 early-return block yields these exact zero-defaults.
        expect(stats).toEqual({
            daysTracked: 0,
            daysWithTarget: 0,
            adherentDays: 0,
            adherencePercent: 0,
            avgCaloriesActual: 0,
            avgCaloriesTarget: null,
            avgProteinActual: 0,
            avgCarbsActual: 0,
            avgFatActual: 0,
            totalMealsLogged: 0,
        });

        // Every numeric field is finite (avgCaloriesTarget is intentionally null).
        expect(Number.isFinite(stats.adherencePercent)).toBe(true);
        expect(Number.isFinite(stats.avgCaloriesActual)).toBe(true);
        expect(Number.isFinite(stats.avgProteinActual)).toBe(true);
        expect(Number.isFinite(stats.avgCarbsActual)).toBe(true);
        expect(Number.isFinite(stats.avgFatActual)).toBe(true);
        expect(stats.avgCaloriesTarget).toBeNull();
    });

    it('Case B: normal history → every field finite and identical to pre-hardening arithmetic', async () => {
        // Three days: two with a calorie target (one adherent), one with no
        // target. Hand-computed expectations below match getStats exactly.
        const svc = makeService([
            { caloriesActual: 2000, proteinActual: 150, carbsActual: 200, fatActual: 70, caloriesTarget: 2000, mealsLogged: 3, isAdherent: true },
            { caloriesActual: 1000, proteinActual: 100, carbsActual: 100, fatActual: 30, caloriesTarget: 2200, mealsLogged: 2, isAdherent: false },
            { caloriesActual: 2400, proteinActual: 200, carbsActual: 250, fatActual: 90, caloriesTarget: null, mealsLogged: 4, isAdherent: false },
        ]);
        const stats = await svc.getStats(USER, 30);

        // Counts: 3 days tracked, 2 with a target, 1 adherent.
        // adherencePercent = round((1/2)*100*10)/10 = 50
        // avgCaloriesActual = round(((2000+1000+2400)/3)*10)/10 = 1800
        // avgCaloriesTarget = round(((2000+2200)/2)*10)/10 = 2100  (null targets excluded)
        // avgProteinActual = round((450/3)*10)/10 = 150
        // avgCarbsActual   = round((550/3)*10)/10 = 183.3
        // avgFatActual     = round((190/3)*10)/10 = 63.3
        // totalMealsLogged = 3+2+4 = 9
        expect(stats).toEqual({
            daysTracked: 3,
            daysWithTarget: 2,
            adherentDays: 1,
            adherencePercent: 50,
            avgCaloriesActual: 1800,
            avgCaloriesTarget: 2100,
            avgProteinActual: 150,
            avgCarbsActual: 183.3,
            avgFatActual: 63.3,
            totalMealsLogged: 9,
        });

        // Finite-ness invariant: every numeric field (including avgCaloriesTarget,
        // which is non-null here) is finite — never NaN/Infinity.
        expect(Number.isFinite(stats.adherencePercent)).toBe(true);
        expect(Number.isFinite(stats.avgCaloriesActual)).toBe(true);
        expect(Number.isFinite(stats.avgCaloriesTarget as number)).toBe(true);
        expect(Number.isFinite(stats.avgProteinActual)).toBe(true);
        expect(Number.isFinite(stats.avgCarbsActual)).toBe(true);
        expect(Number.isFinite(stats.avgFatActual)).toBe(true);

        // statsResponseSchema bounds hold: adherencePercent within [0,100],
        // every avg* nonnegative.
        expect(stats.adherencePercent).toBeGreaterThanOrEqual(0);
        expect(stats.adherencePercent).toBeLessThanOrEqual(100);
        expect(stats.avgCaloriesActual).toBeGreaterThanOrEqual(0);
        expect(stats.avgProteinActual).toBeGreaterThanOrEqual(0);
        expect(stats.avgCarbsActual).toBeGreaterThanOrEqual(0);
        expect(stats.avgFatActual).toBeGreaterThanOrEqual(0);
    });
});
