/**
 * Regression suite — state-service materializer FINITE/CLAMP hardening
 * (src/materializer.ts: handleSleepLogged, handleMetricsLogged,
 * handlePlanGenerated).
 *
 * This is deliberately separate from error-redaction.test.ts (shared Fastify
 * 5xx handler) and input-bounds.test.ts (GET /v1/state/:userId param bound).
 * Neither of those can cover the invariants locked here, all of which live
 * INSIDE the materializer methods that fold events into the userState row:
 *
 *   (1) FINITE quality — handleSleepLogged must never persist a NaN/Infinity/
 *       non-number `quality`: on create it falls back to the 7.0 default; on
 *       update the field is SKIPPED (Prisma leaves the column intact). An
 *       in-range quality is written verbatim; an out-of-range one is clamped
 *       into 0..10.
 *   (2) BOUNDED fatigue — fatigueLevel is a 0..10 score. The old unbounded
 *       {increment:1}/{decrement:1} could drift far outside that range over
 *       many events. The hardened path reads the current value, steps it ±1,
 *       and clamps to 0..10 — so it can never escape the scale even when the
 *       stored value is already at/over an edge (or itself poisoned).
 *   (3) FINITE + RANGED weight — handleMetricsLogged must SKIP the write
 *       entirely for a NaN/Infinity/negative/absurd weight (the old falsy
 *       `if (!payload.weightKg)` check let NaN/Infinity/negatives through). A
 *       sane weight is written verbatim.
 *   (4) FINITE plan targets — handlePlanGenerated must SKIP the write if either
 *       calorie/protein target is non-finite; finite targets are written.
 *
 * Why this can import src/ when error-redaction.test.ts can't: materializer.ts
 * is a pure class module — unlike src/index.ts it opens NO DB/Redis connection
 * at import time. We drive it with a fake PrismaClient that records every
 * upsert() arg and lets each test stage the `existing` row that findUnique
 * returns (used by the fatigue read-modify-write). This mirrors how
 * sleep-service/quality-score-finite.test.ts drives SleepService with a fake
 * Prisma.
 */
import { StateMaterializer } from '../src/materializer';

const USER = 'user-1';
const EVENT_ID = 'evt-1';

/** The args captured from a single prisma.userState.upsert(...) call. */
interface UpsertCall {
    where: { userId: string };
    create: Record<string, unknown>;
    update: Record<string, unknown>;
}

/**
 * Build a StateMaterializer over a fake PrismaClient that:
 *   - returns `existingRow` from userState.findUnique (the fatigue read path),
 *   - records every userState.upsert(args) into `calls`.
 * No real infra is touched — these are the only two Prisma methods the three
 * hardened handlers call.
 */
function makeMaterializer(existingRow: Record<string, unknown> | null = null) {
    const calls: UpsertCall[] = [];
    const fakePrisma: any = {
        userState: {
            findUnique: async () => existingRow,
            upsert: async (args: UpsertCall) => {
                calls.push(args);
                return {};
            },
        },
    };
    return { materializer: new StateMaterializer(fakePrisma), calls };
}

function sleepEvent(payload: Record<string, unknown>) {
    return { eventId: EVENT_ID, userId: USER, payload } as any;
}
function metricsEvent(payload: Record<string, unknown>) {
    return { eventId: EVENT_ID, userId: USER, payload } as any;
}
function planEvent(payload: Record<string, unknown>) {
    return { eventId: EVENT_ID, userId: USER, payload } as any;
}

describe('state-service materializer — handleSleepLogged finite/clamp quality', () => {
    it('a NaN quality is NOT written on update (field skipped → undefined)', async () => {
        const { materializer, calls } = makeMaterializer({ fatigueLevel: 3.0 });
        await materializer.handleSleepLogged(sleepEvent({ quality: NaN, disturbances: 0 }));

        expect(calls).toHaveLength(1);
        // undefined = Prisma skips the column; it is NEVER the literal NaN.
        expect(calls[0].update.avgSleepQuality).toBeUndefined();
        expect(Number.isNaN(calls[0].update.avgSleepQuality as any)).toBe(false);
        // The create branch's default must also be the safe fallback, not NaN.
        expect(calls[0].create.avgSleepQuality).toBe(7.0);
    });

    it('an Infinity quality is NOT written on update (field skipped)', async () => {
        const { materializer, calls } = makeMaterializer({ fatigueLevel: 3.0 });
        await materializer.handleSleepLogged(sleepEvent({ quality: Infinity, disturbances: 0 }));

        expect(calls[0].update.avgSleepQuality).toBeUndefined();
        expect(calls[0].create.avgSleepQuality).toBe(7.0);
    });

    it('an out-of-range quality (99) is CLAMPED into 0..10 (→ 10) on both branches', async () => {
        const { materializer, calls } = makeMaterializer({ fatigueLevel: 3.0 });
        await materializer.handleSleepLogged(sleepEvent({ quality: 99, disturbances: 0 }));

        expect(calls[0].update.avgSleepQuality).toBe(10);
        expect(calls[0].create.avgSleepQuality).toBe(10);
    });

    it('a negative quality (-5) is CLAMPED up to 0', async () => {
        const { materializer, calls } = makeMaterializer({ fatigueLevel: 3.0 });
        await materializer.handleSleepLogged(sleepEvent({ quality: -5, disturbances: 0 }));

        expect(calls[0].update.avgSleepQuality).toBe(0);
        expect(calls[0].create.avgSleepQuality).toBe(0);
    });

    it('a valid in-range quality (8) is written verbatim', async () => {
        const { materializer, calls } = makeMaterializer({ fatigueLevel: 3.0 });
        await materializer.handleSleepLogged(sleepEvent({ quality: 8, disturbances: 0 }));

        expect(calls[0].update.avgSleepQuality).toBe(8);
        expect(calls[0].create.avgSleepQuality).toBe(8);
    });

    it('a missing quality falls back to the 7.0 default on create and is skipped on update', async () => {
        const { materializer, calls } = makeMaterializer({ fatigueLevel: 3.0 });
        await materializer.handleSleepLogged(sleepEvent({ disturbances: 0 }));

        expect(calls[0].create.avgSleepQuality).toBe(7.0);
        expect(calls[0].update.avgSleepQuality).toBeUndefined();
    });
});

describe('state-service materializer — handleSleepLogged fatigue stays in 0..10', () => {
    it('high disturbances increments fatigue but never above 10 (already at 10 → stays 10)', async () => {
        const { materializer, calls } = makeMaterializer({ fatigueLevel: 10 });
        await materializer.handleSleepLogged(sleepEvent({ quality: 5, disturbances: 9 }));

        const next = calls[0].update.fatigueLevel as number;
        expect(typeof next).toBe('number');
        expect(next).toBeLessThanOrEqual(10);
        expect(next).toBe(10); // 10 + 1 clamped back to 10
    });

    it('low disturbances decrements fatigue but never below 0 (already at 0 → stays 0)', async () => {
        const { materializer, calls } = makeMaterializer({ fatigueLevel: 0 });
        await materializer.handleSleepLogged(sleepEvent({ quality: 5, disturbances: 0 }));

        const next = calls[0].update.fatigueLevel as number;
        expect(next).toBeGreaterThanOrEqual(0);
        expect(next).toBe(0); // 0 - 1 clamped back to 0
    });

    it('a normal step moves fatigue by exactly 1 within range', async () => {
        const { materializer, calls } = makeMaterializer({ fatigueLevel: 5 });
        await materializer.handleSleepLogged(sleepEvent({ quality: 5, disturbances: 9 }));

        expect(calls[0].update.fatigueLevel).toBe(6); // 5 + 1, in range
    });

    it('a poisoned stored fatigue (NaN) is recovered to a sane default before stepping', async () => {
        const { materializer, calls } = makeMaterializer({ fatigueLevel: NaN });
        await materializer.handleSleepLogged(sleepEvent({ quality: 5, disturbances: 0 }));

        const next = calls[0].update.fatigueLevel as number;
        // NaN stored → recovered to 3.0 default → 3.0 - 1 = 2; always finite & bounded.
        expect(Number.isFinite(next)).toBe(true);
        expect(next).toBeGreaterThanOrEqual(0);
        expect(next).toBeLessThanOrEqual(10);
        expect(next).toBe(2);
    });

    it('a non-finite disturbances does not crash and is treated as "not >3" (decrement)', async () => {
        const { materializer, calls } = makeMaterializer({ fatigueLevel: 5 });
        await materializer.handleSleepLogged(sleepEvent({ quality: 5, disturbances: Infinity }));

        // Infinity disturbances collapses to 0 (not >3) → fatigue decrements.
        expect(calls[0].update.fatigueLevel).toBe(4);
    });
});

describe('state-service materializer — handleMetricsLogged finite + ranged weight', () => {
    it('a NaN weight is NOT persisted (write skipped entirely)', async () => {
        const { materializer, calls } = makeMaterializer();
        await materializer.handleMetricsLogged(metricsEvent({ weightKg: NaN }));

        expect(calls).toHaveLength(0);
    });

    it('an Infinity weight is NOT persisted (write skipped)', async () => {
        const { materializer, calls } = makeMaterializer();
        await materializer.handleMetricsLogged(metricsEvent({ weightKg: Infinity }));

        expect(calls).toHaveLength(0);
    });

    it('a negative weight is NOT persisted (write skipped)', async () => {
        const { materializer, calls } = makeMaterializer();
        await materializer.handleMetricsLogged(metricsEvent({ weightKg: -50 }));

        expect(calls).toHaveLength(0);
    });

    it('an absurd weight (10000 kg) is NOT persisted (out of range, write skipped)', async () => {
        const { materializer, calls } = makeMaterializer();
        await materializer.handleMetricsLogged(metricsEvent({ weightKg: 10000 }));

        expect(calls).toHaveLength(0);
    });

    it('a missing weight is NOT persisted (write skipped)', async () => {
        const { materializer, calls } = makeMaterializer();
        await materializer.handleMetricsLogged(metricsEvent({}));

        expect(calls).toHaveLength(0);
    });

    it('a sane weight (82.5 kg) IS persisted verbatim on both branches', async () => {
        const { materializer, calls } = makeMaterializer();
        await materializer.handleMetricsLogged(metricsEvent({ weightKg: 82.5 }));

        expect(calls).toHaveLength(1);
        expect(calls[0].create.currentWeightKg).toBe(82.5);
        expect(calls[0].update.currentWeightKg).toBe(82.5);
    });
});

describe('state-service materializer — handlePlanGenerated finite targets', () => {
    it('a NaN calorieTarget skips the write entirely', async () => {
        const { materializer, calls } = makeMaterializer();
        await materializer.handlePlanGenerated(planEvent({ calorieTarget: NaN, proteinTargetG: 180 }));

        expect(calls).toHaveLength(0);
    });

    it('an Infinity proteinTargetG skips the write entirely', async () => {
        const { materializer, calls } = makeMaterializer();
        await materializer.handlePlanGenerated(planEvent({ calorieTarget: 2400, proteinTargetG: Infinity }));

        expect(calls).toHaveLength(0);
    });

    it('valid finite targets ARE written verbatim on both branches', async () => {
        const { materializer, calls } = makeMaterializer();
        await materializer.handlePlanGenerated(planEvent({ calorieTarget: 2400, proteinTargetG: 180 }));

        expect(calls).toHaveLength(1);
        expect(calls[0].create.currentCalorieTarget).toBe(2400);
        expect(calls[0].create.currentProteinTargetG).toBe(180);
        expect(calls[0].update.currentCalorieTarget).toBe(2400);
        expect(calls[0].update.currentProteinTargetG).toBe(180);
    });
});
