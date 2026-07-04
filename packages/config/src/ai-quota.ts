// ── Shared AI daily-quota policy ───────────────────────────────────────────────
// Every paid AI endpoint (Ria chat messages today, AI generations next) must
// gate on ONE source of truth or the per-plan limits and the over-cap wire
// contract drift between services. The limit table, the pure "are we within the
// daily cap?" helper, and the 429 response body all live here, in
// @nightfuel/config — a dependency-light package (zod/pino/dotenv only) whose
// `tsc -b --force` build runs in the gate BEFORE the backend tests, so every
// service can import the built policy.
//
// The numbers are lifted verbatim from chat-service's existing Ria quota
// (services/chat-service/src/chat.service.ts): riaMessages default free:5 /
// pro:20, parsed once at module load from AI_FREE_DAILY / AI_PRO_DAILY. This
// module ADDS the generations row (free:3 / pro:30) the brief dictates and the
// shared wire contract, without weakening any limit.
//
// This module imports NOTHING at runtime (no zod, no Fastify, no Prisma, no
// service code). It reads process.env once at load — matching chat-service's
// parse-at-load — and is otherwise pure: the limit math is a plain table lookup
// and the helper takes its clock as a parameter (no Date.now() inside), so it is
// trivially testable and timezone-deterministic.

/** A subscriber's billing tier as the AI policy sees it. Lowercase to match the
 *  resolved `plan` chat-service already returns from resolvePlan (tier 'FREE' ->
 *  'free', anything else -> 'pro'); the over-cap body carries this same value. */
export type AiPlan = 'free' | 'pro';

/** A metered AI capability. `riaMessages` is the user's own daily Ria sends (the
 *  cap chat-service already enforces); `generations` is the daily AI-generation
 *  budget (e.g. plan/recipe generation) gated by the same policy; `scans` is the
 *  daily food-scan budget (AI meal-photo recognition + product barcode lookups),
 *  gated by the same policy on the web food gateway. */
export type AiFeature = 'riaMessages' | 'generations' | 'scans';

/**
 * Read a non-negative integer limit from the environment, falling back to a
 * compile-time default.
 *
 * Returns `fallback` when the variable is unset (`parseInt(undefined, 10)` is
 * `NaN`) OR set to a non-numeric value — guarded explicitly with
 * `Number.isNaN` so a typo like `AI_FREE_DAILY=lots` degrades to the documented
 * default rather than poisoning the limit table with `NaN` (where every
 * `usedToday < NaN` comparison is `false` and would wrongly block all users).
 *
 * I/O-light on purpose: a single `parseInt`, no zod, no schema — the heavier
 * env validation lives in env.ts; these tuning knobs only need a safe integer.
 *
 * @param name     The environment variable name (e.g. `'AI_FREE_DAILY'`).
 * @param fallback The default used when `name` is unset or non-numeric.
 * @returns        The parsed integer, or `fallback`.
 */
function intFromEnv(name: string, fallback: number): number {
    const parsed = parseInt(process.env[name] ?? '', 10);
    return Number.isNaN(parsed) ? fallback : parsed;
}

/**
 * Per-plan, per-feature daily caps — the single source of truth every paid AI
 * endpoint imports. Computed ONCE at module load (like chat-service's
 * AI_FREE_DAILY / AI_PRO_DAILY) so the cost is paid a single time per process
 * and the table is then a constant lookup.
 *
 * Defaults (when the matching env var is unset/non-numeric):
 *   free  → { riaMessages: 5,  generations: 3,  scans: 3  }
 *   pro   → { riaMessages: 20, generations: 30, scans: 30 }
 *
 * Env overrides (ops can tune without a redeploy):
 *   AI_FREE_DAILY             → free.riaMessages
 *   AI_PRO_DAILY              → pro.riaMessages
 *   AI_FREE_GENERATIONS_DAILY → free.generations
 *   AI_PRO_GENERATIONS_DAILY  → pro.generations
 *   AI_FREE_SCANS_DAILY       → free.scans
 *   AI_PRO_SCANS_DAILY        → pro.scans
 */
export const AI_LIMITS: Record<AiPlan, Record<AiFeature, number>> = {
    free: {
        riaMessages: intFromEnv('AI_FREE_DAILY', 5),
        generations: intFromEnv('AI_FREE_GENERATIONS_DAILY', 3),
        scans: intFromEnv('AI_FREE_SCANS_DAILY', 3),
    },
    pro: {
        riaMessages: intFromEnv('AI_PRO_DAILY', 20),
        generations: intFromEnv('AI_PRO_GENERATIONS_DAILY', 30),
        scans: intFromEnv('AI_PRO_SCANS_DAILY', 30),
    },
};

/** Number of milliseconds in one whole UTC day — the quota reset interval.
 *  Named so the reset math reads intent-first instead of repeating 86_400_000. */
const MS_PER_DAY = 86400000;

/** Outcome of a daily-quota check: whether another use is allowed right now, how
 *  many uses remain in the current UTC day, and when the window resets. */
export interface DailyLimitResult {
    /** `true` iff `usedToday < limit` — i.e. at least one use remains. */
    allowed: boolean;
    /** Uses left in the current UTC day, floored at 0 (never negative). */
    remaining: number;
    /** ISO timestamp of the next UTC midnight, when the count resets. */
    resetsAt: string;
}

/**
 * Pure daily-limit predicate, mirroring chat-service's checkRiaQuota math but
 * with ZERO I/O and ZERO ambient clock: the caller supplies `usedToday`, the
 * applicable `limit` (from {@link AI_LIMITS}), and the current instant `now`.
 *
 * Deterministic for a fixed `now` — there is NO `Date.now()` inside, so a test
 * can pin the clock and assert an exact `resetsAt`. The reset boundary is the
 * next UTC midnight derived from `now`:
 *
 *   startOfUtcDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
 *   resetsAt      = new Date(startOfUtcDay + MS_PER_DAY).toISOString()
 *
 * Because `startOfUtcDay` truncates to 00:00:00.000Z, an `now` that is itself
 * exactly UTC midnight rolls forward a full day (resetsAt is the FOLLOWING
 * midnight, never `now` itself) — the same forward-looking reset chat-service
 * returns.
 *
 * `allowed` is `usedToday < limit` (so the Nth use is permitted when N-1 are
 * already spent and blocked once `usedToday` reaches `limit`); `remaining` is
 * `Math.max(0, limit - usedToday)` so an over-count can never report a negative
 * balance.
 *
 * @param args.usedToday Count of uses already consumed since UTC midnight.
 * @param args.limit     The applicable per-plan/feature cap (from AI_LIMITS).
 * @param args.now       The current instant; the reset is derived from its UTC date.
 * @returns              `{ allowed, remaining, resetsAt }` — see {@link DailyLimitResult}.
 */
export function assertWithinDailyLimit({
    usedToday,
    limit,
    now,
}: {
    usedToday: number;
    limit: number;
    now: Date;
}): DailyLimitResult {
    // UTC-midnight boundary — quotas reset at 00:00 UTC, identical to
    // chat-service.checkRiaQuota. Derived from `now` (no Date.now()) so the
    // result is fully determined by the inputs.
    const startOfUtcDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const resetsAt = new Date(startOfUtcDay + MS_PER_DAY).toISOString();

    return {
        allowed: usedToday < limit,
        remaining: Math.max(0, limit - usedToday),
        resetsAt,
    };
}

// ── Over-cap wire contract ──────────────────────────────────────────────────────
// The shared shape of the 429 response every paid AI endpoint returns once the
// daily cap is hit. chat-service already emits exactly this body
// (`{ error: 'ai_quota_exceeded', limit, plan, resetsAt }`); exporting the
// literal + interface here lets every producer and consumer agree on one
// contract instead of re-typing the string per service.

/** The stable `error` discriminant in an over-cap 429 body. Frozen as a literal
 *  type via `as const` so `AiQuotaExceededBody.error` is the exact string, not
 *  the widened `string`. Byte-for-byte identical to chat-service's existing
 *  429 error code so no client has to special-case a second spelling. */
export const AI_QUOTA_EXCEEDED = 'ai_quota_exceeded' as const;

/**
 * The 429 response body a paid AI endpoint returns when the caller has reached
 * their daily cap. Mirrors chat-service's existing over-cap reply so the REST
 * contract is shared, not duplicated:
 *
 *   { error: 'ai_quota_exceeded', limit, plan, resetsAt }
 *
 * @property error    Always {@link AI_QUOTA_EXCEEDED} — the stable discriminant.
 * @property limit    The cap the caller hit (from {@link AI_LIMITS}).
 * @property plan     The caller's resolved plan (see {@link AiPlan}).
 * @property resetsAt ISO timestamp of the next UTC midnight, when the cap resets.
 */
export interface AiQuotaExceededBody {
    error: typeof AI_QUOTA_EXCEEDED;
    limit: number;
    plan: AiPlan;
    resetsAt: string;
}
