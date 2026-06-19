// Tests for the shared AI daily-quota policy in @nightfuel/config.
//
// These lock the policy three services lean on: the per-plan limit TABLE (with
// chat-service's preserved free:5 / pro:20 riaMessages defaults plus the new
// generations row), the PURE assertWithinDailyLimit helper (deterministic for a
// fixed `now`, UTC-midnight reset, never-negative remaining), and the over-cap
// WIRE CONTRACT (the 'ai_quota_exceeded' literal + AiQuotaExceededBody shape).
//
// The primary import is the package entrypoint (NOT a deep src/ path) so this
// also asserts the acceptance contract that everything resolves through the
// built dist/index.js — exactly how a service would `import { ... } from
// '@nightfuel/config'`. The env-override group additionally re-requires the deep
// src module after mutating process.env + jest.resetModules(), because AI_LIMITS
// is computed ONCE at module load and only a fresh module sees a new env value.
import {
    AI_LIMITS,
    assertWithinDailyLimit,
    AI_QUOTA_EXCEEDED,
    type AiPlan,
    type AiFeature,
    type AiQuotaExceededBody,
} from '@nightfuel/config';

describe('AI_LIMITS — documented per-plan/feature shape + defaults', () => {
    // (1) The table has exactly the free/pro × riaMessages/generations shape with
    // the documented defaults. The riaMessages numbers (free:5, pro:20) are
    // chat-service's existing AI_FREE_DAILY / AI_PRO_DAILY fallbacks, preserved
    // verbatim; generations (free:3, pro:30) is the row this policy adds.
    it('has free{riaMessages:5,generations:3} and pro{riaMessages:20,generations:30} by default', () => {
        expect(AI_LIMITS).toEqual({
            free: { riaMessages: 5, generations: 3 },
            pro: { riaMessages: 20, generations: 30 },
        });
    });

    // Every cell is a finite number (not NaN) — a NaN limit would make every
    // `usedToday < limit` comparison false and silently block all users, the
    // exact failure intFromEnv's Number.isNaN guard exists to prevent.
    it('every limit is a finite, non-negative number', () => {
        const plans: AiPlan[] = ['free', 'pro'];
        const features: AiFeature[] = ['riaMessages', 'generations'];
        for (const plan of plans) {
            for (const feature of features) {
                const limit = AI_LIMITS[plan][feature];
                expect(Number.isFinite(limit)).toBe(true);
                expect(limit).toBeGreaterThanOrEqual(0);
            }
        }
    });
});

describe('AI_LIMITS — environment overrides (parse-at-load)', () => {
    // AI_LIMITS is frozen at module load, so each case mutates process.env, calls
    // jest.resetModules(), and re-requires the DEEP src module to observe the new
    // value. We snapshot/restore the four knobs so cases don't leak into each
    // other or into the static-import suites above.
    const KEYS = [
        'AI_FREE_DAILY',
        'AI_PRO_DAILY',
        'AI_FREE_GENERATIONS_DAILY',
        'AI_PRO_GENERATIONS_DAILY',
    ] as const;
    const saved: Record<string, string | undefined> = {};

    beforeEach(() => {
        for (const k of KEYS) saved[k] = process.env[k];
    });
    afterEach(() => {
        for (const k of KEYS) {
            if (saved[k] === undefined) delete process.env[k];
            else process.env[k] = saved[k];
        }
        jest.resetModules();
    });

    /** Re-import AI_LIMITS from the deep src module AFTER an env mutation. */
    function freshLimits(): typeof AI_LIMITS {
        jest.resetModules();
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        return (require('../src/ai-quota') as typeof import('../src/ai-quota')).AI_LIMITS;
    }

    it('a numeric override is parsed (AI_FREE_GENERATIONS_DAILY="1" -> 1)', () => {
        process.env.AI_FREE_GENERATIONS_DAILY = '1';
        const limits = freshLimits();
        expect(limits.free.generations).toBe(1);
        // Untouched knobs keep their defaults.
        expect(limits.free.riaMessages).toBe(5);
        expect(limits.pro.generations).toBe(30);
    });

    it('overrides every knob at once', () => {
        process.env.AI_FREE_DAILY = '7';
        process.env.AI_PRO_DAILY = '99';
        process.env.AI_FREE_GENERATIONS_DAILY = '2';
        process.env.AI_PRO_GENERATIONS_DAILY = '50';
        const limits = freshLimits();
        expect(limits).toEqual({
            free: { riaMessages: 7, generations: 2 },
            pro: { riaMessages: 99, generations: 50 },
        });
    });

    it('a non-numeric value falls back to the default (Number.isNaN guard)', () => {
        process.env.AI_FREE_GENERATIONS_DAILY = 'not-a-number';
        const limits = freshLimits();
        // parseInt('not-a-number') is NaN -> intFromEnv returns the fallback (3),
        // never NaN.
        expect(limits.free.generations).toBe(3);
        expect(Number.isNaN(limits.free.generations)).toBe(false);
    });

    it('an unset value falls back to the default', () => {
        delete process.env.AI_PRO_GENERATIONS_DAILY;
        const limits = freshLimits();
        expect(limits.pro.generations).toBe(30);
    });
});

describe('assertWithinDailyLimit — pure, deterministic, UTC-midnight reset', () => {
    // A mid-day fixed instant. Both the "under cap" and "at/over cap" cases below
    // reuse it so the only varying input is usedToday — proving allowed/remaining
    // are a pure function of (usedToday, limit) and resetsAt of `now` alone.
    const NOW = new Date('2026-06-19T13:45:30.000Z');
    const NEXT_MIDNIGHT = '2026-06-20T00:00:00.000Z';

    // (3) under cap: usedToday < limit -> allowed, remaining is the exact balance.
    it('allows and reports the exact remaining when usedToday < limit', () => {
        const res = assertWithinDailyLimit({ usedToday: 2, limit: 5, now: NOW });
        expect(res.allowed).toBe(true);
        expect(res.remaining).toBe(3); // limit - usedToday
        expect(res.resetsAt).toBe(NEXT_MIDNIGHT);
    });

    // The boundary just below the cap is still allowed with remaining 1 — mirrors
    // chat-service allowing the Nth send when N-1 are already spent.
    it('allows the last unit (usedToday === limit - 1) with remaining 1', () => {
        const res = assertWithinDailyLimit({ usedToday: 4, limit: 5, now: NOW });
        expect(res.allowed).toBe(true);
        expect(res.remaining).toBe(1);
    });

    // At the cap: blocked, and remaining is floored at 0.
    it('blocks at the cap (usedToday === limit) with remaining 0', () => {
        const res = assertWithinDailyLimit({ usedToday: 5, limit: 5, now: NOW });
        expect(res.allowed).toBe(false);
        expect(res.remaining).toBe(0);
        expect(res.resetsAt).toBe(NEXT_MIDNIGHT);
    });

    // Over the cap: still blocked and remaining NEVER goes negative (Math.max 0).
    it('blocks over the cap and never reports a negative remaining', () => {
        const res = assertWithinDailyLimit({ usedToday: 9, limit: 5, now: NOW });
        expect(res.allowed).toBe(false);
        expect(res.remaining).toBe(0); // Math.max(0, 5 - 9) === 0, not -4
    });

    // Determinism: the same inputs always yield byte-identical output (no ambient
    // Date.now() inside the helper).
    it('is deterministic for a fixed now (repeated calls are identical)', () => {
        const a = assertWithinDailyLimit({ usedToday: 1, limit: 5, now: NOW });
        const b = assertWithinDailyLimit({ usedToday: 1, limit: 5, now: NOW });
        expect(a).toEqual(b);
    });

    // resetsAt is always exactly the NEXT UTC midnight, in canonical ISO form,
    // for several fixed inputs across the day.
    it.each([
        ['2026-06-19T00:00:00.001Z', '2026-06-20T00:00:00.000Z'], // just after midnight
        ['2026-06-19T23:59:59.999Z', '2026-06-20T00:00:00.000Z'], // just before midnight
        ['2026-12-31T18:00:00.000Z', '2027-01-01T00:00:00.000Z'], // rolls the year
        ['2024-02-28T12:00:00.000Z', '2024-02-29T00:00:00.000Z'], // leap-day boundary
    ])('resetsAt for now=%s is the next UTC midnight %s', (nowIso, expected) => {
        const res = assertWithinDailyLimit({ usedToday: 0, limit: 5, now: new Date(nowIso) });
        expect(res.resetsAt).toBe(expected);
        // And it is canonical ISO (round-trips through Date).
        expect(new Date(res.resetsAt).toISOString()).toBe(res.resetsAt);
    });

    // An `now` that is EXACTLY UTC midnight must roll forward a FULL day — the
    // reset is the FOLLOWING midnight, never `now` itself (startOfUtcDay truncates
    // to 00:00:00.000Z, then + one whole day).
    it('an exact-midnight now rolls to the NEXT day (not now itself)', () => {
        const midnight = new Date('2026-06-19T00:00:00.000Z');
        const res = assertWithinDailyLimit({ usedToday: 0, limit: 5, now: midnight });
        expect(res.resetsAt).toBe('2026-06-20T00:00:00.000Z');
        expect(new Date(res.resetsAt).getTime()).toBeGreaterThan(midnight.getTime());
        // Exactly one whole UTC day ahead.
        expect(new Date(res.resetsAt).getTime() - midnight.getTime()).toBe(24 * 60 * 60 * 1000);
    });

    // resetsAt always lands on a true UTC midnight (all sub-day fields zero).
    it('resetsAt is always 00:00:00.000 UTC', () => {
        const res = assertWithinDailyLimit({ usedToday: 0, limit: 5, now: NOW });
        const d = new Date(res.resetsAt);
        expect(d.getUTCHours()).toBe(0);
        expect(d.getUTCMinutes()).toBe(0);
        expect(d.getUTCSeconds()).toBe(0);
        expect(d.getUTCMilliseconds()).toBe(0);
    });
});

describe('AI quota wire contract', () => {
    // (4) The error discriminant is the exact, stable string chat-service already
    // emits — no second spelling for a client to special-case.
    it('AI_QUOTA_EXCEEDED is the literal "ai_quota_exceeded"', () => {
        expect(AI_QUOTA_EXCEEDED).toBe('ai_quota_exceeded');
    });

    // A sample over-cap body type-checks against AiQuotaExceededBody (compile-time
    // assertion) AND matches the 429 shape chat-service returns (runtime assertion
    // on the same object). `error` is the literal type, so a typo would fail tsc.
    it('a sample AiQuotaExceededBody type-checks and matches the 429 shape', () => {
        const body: AiQuotaExceededBody = {
            error: AI_QUOTA_EXCEEDED,
            limit: AI_LIMITS.free.riaMessages,
            plan: 'free',
            resetsAt: '2026-06-20T00:00:00.000Z',
        };
        expect(body).toEqual({
            error: 'ai_quota_exceeded',
            limit: 5,
            plan: 'free',
            resetsAt: '2026-06-20T00:00:00.000Z',
        });
    });

    // The body composes cleanly with the pure helper for a 'pro' caller — the
    // limit/resetsAt that feed the 429 come straight from AI_LIMITS +
    // assertWithinDailyLimit, exactly how a route would build the response.
    it('composes with AI_LIMITS + assertWithinDailyLimit for an over-cap pro caller', () => {
        const plan: AiPlan = 'pro';
        const limit = AI_LIMITS[plan].riaMessages; // 20
        const now = new Date('2026-06-19T08:00:00.000Z');
        const check = assertWithinDailyLimit({ usedToday: limit, limit, now });
        expect(check.allowed).toBe(false);

        const body: AiQuotaExceededBody = {
            error: AI_QUOTA_EXCEEDED,
            limit,
            plan,
            resetsAt: check.resetsAt,
        };
        expect(body).toEqual({
            error: 'ai_quota_exceeded',
            limit: 20,
            plan: 'pro',
            resetsAt: '2026-06-20T00:00:00.000Z',
        });
    });
});
