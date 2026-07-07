/**
 * Circadian time helpers.
 * Utilities for calculating shift phases, melatonin windows,
 * cortisol peaks, and time-relative formatting.
 *
 * These are PURE functions: every output is derived solely from the arguments
 * (no hidden module state, no implicit reads beyond the optional `now` default).
 * They are also defensively bounded — malformed inputs (unparseable dates,
 * zero-length shifts, negative/huge meal counts, NaN durations) can reach them
 * from upstream callers, so each function clamps to a finite, in-range, non-
 * explosive result rather than emitting NaN / Infinity / an unbounded array.
 * For every VALID input the behaviour is byte-identical to the unguarded math.
 */

export type ShiftPhase = 'pre-shift' | 'early-shift' | 'mid-shift' | 'late-shift' | 'post-shift' | 'sleep-window';

/**
 * Upper bound on the number of meal windows we will ever generate. A clamp on
 * `mealCount` so a malformed/huge value can never produce an unbounded array.
 * Far above any realistic eating pattern (a few meals across one shift).
 */
const MAX_MEAL_WINDOWS = 12;

/**
 * Determine the current shift phase based on start/end times.
 *
 * Edge handling (does not affect valid inputs): if any of start/end/now are
 * unparseable (NaN epoch), we fall back to 'pre-shift' rather than NaN-comparing
 * (every `<`/`>` against NaN is false, which would silently leak through to
 * 'late-shift'). A non-positive duration (zero-length or inverted shift) is
 * resolved deterministically to 'late-shift' — `current` has, by construction,
 * already reached/passed `end` — instead of dividing by zero (0/0 = NaN).
 */
export function getShiftPhase(
    shiftStart: Date | string,
    shiftEnd: Date | string,
    now: Date = new Date(),
): ShiftPhase {
    const start = new Date(shiftStart).getTime();
    const end = new Date(shiftEnd).getTime();
    const current = now.getTime();

    // Unparseable date(s) → safe sentinel rather than NaN comparisons that all
    // read false and fall through to 'late-shift'.
    if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(current)) {
        return 'pre-shift';
    }

    const duration = end - start;

    if (current < start) return 'pre-shift';
    if (current > end) return 'post-shift';

    // Zero-length (start === end) or inverted (end < start) shift: progress is
    // undefined / would divide by zero. `current` is in [start, end] here, so
    // for a zero-length shift current === end — resolve to the end-of-shift
    // phase deterministically. (For valid duration > 0 this branch is never hit
    // and the math below is unchanged.)
    if (duration <= 0) return 'late-shift';

    const elapsed = current - start;
    const progress = elapsed / duration;

    if (progress < 0.25) return 'early-shift';
    if (progress < 0.75) return 'mid-shift';
    return 'late-shift';
}

/**
 * Calculate estimated melatonin onset time.
 * Typically 14–16 hours after wake time (dim light melatonin onset).
 */
export function estimateMelatoninOnset(wakeTime: Date | string): Date {
    const wake = new Date(wakeTime);
    return new Date(wake.getTime() + 14 * 60 * 60 * 1000); // +14h
}

/**
 * Calculate cortisol peak time.
 * Cortisol typically peaks ~30 min after waking (Cortisol Awakening Response).
 */
export function estimateCortisolPeak(wakeTime: Date | string): Date {
    const wake = new Date(wakeTime);
    return new Date(wake.getTime() + 30 * 60 * 1000); // +30 min
}

/**
 * Calculate caffeine cutoff time.
 * Caffeine has ~6h half-life; cutoff 8h before target sleep.
 */
export function calculateCaffeineCutoff(targetSleepTime: Date | string): Date {
    const sleep = new Date(targetSleepTime);
    return new Date(sleep.getTime() - 8 * 60 * 60 * 1000); // -8h
}

/**
 * Get optimal meal windows for a shift pattern.
 * Returns array of recommended meal times.
 *
 * Edge handling (does not affect valid inputs): `mealCount` is coerced to an
 * integer in [0, MAX_MEAL_WINDOWS] so a negative/fractional/huge value can never
 * produce an explosive or NaN-laden array; we return [] when the requested count
 * is <= 0 or when either shift date is unparseable (which would otherwise yield
 * `new Date(NaN)` entries). For a valid count and parseable dates the spacing
 * math is unchanged.
 */
export function getOptimalMealWindows(
    shiftStart: Date | string,
    shiftEnd: Date | string,
    mealCount: number = 3,
): Date[] {
    const start = new Date(shiftStart).getTime();
    const end = new Date(shiftEnd).getTime();

    // Unparseable shift boundary → no windows (never emit `new Date(NaN)`).
    if (!Number.isFinite(start) || !Number.isFinite(end)) return [];

    // Coerce to a bounded, non-negative integer count.
    const count = Math.max(0, Math.min(MAX_MEAL_WINDOWS, Math.floor(mealCount)));
    if (count <= 0) return [];

    const duration = end - start;
    const interval = duration / (count + 1);

    return Array.from({ length: count }, (_, i) =>
        new Date(start + interval * (i + 1)),
    );
}

/**
 * Format a remaining time as "Xh Ym".
 *
 * Edge handling (does not affect valid inputs): a non-finite `ms` (NaN /
 * Infinity, e.g. from a NaN-date subtraction upstream) collapses to '0m' just
 * like the existing `ms <= 0` guard, so the formatter never prints "NaNh NaNm".
 */
export function formatTimeRemaining(ms: number): string {
    if (!Number.isFinite(ms) || ms <= 0) return '0m';
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const mins = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
}

/**
 * Calculate alertness score (0-100) based on circadian phase.
 * Simplified model: lowest from 3-5 AM, highest noon-2 PM.
 *
 * Edge handling (does not affect valid inputs): an invalid `now` (getHours /
 * getMinutes return NaN for an unparseable Date) would propagate NaN through the
 * sinusoid and `Math.round(NaN)` stays NaN even after the [0,100] clamp, so we
 * short-circuit to a neutral 50. Valid inputs keep the existing sinusoid + clamp.
 */
export function estimateAlertness(now: Date = new Date()): number {
    const hour = now.getHours() + now.getMinutes() / 60;
    // Invalid Date → neutral midpoint rather than NaN.
    if (!Number.isFinite(hour)) return 50;
    // Sinusoidal model centered on ~14:00 (2 PM) peak
    const radians = ((hour - 14) / 24) * 2 * Math.PI;
    const raw = Math.cos(radians) * 50 + 50;
    return Math.round(Math.max(0, Math.min(100, raw)));
}
