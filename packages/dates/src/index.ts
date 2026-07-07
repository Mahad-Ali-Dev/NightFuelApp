/**
 * @nightfuel/dates — timezone-aware day-key helpers.
 *
 * Streak features (exercise / progress / sleep / shift services) currently bucket
 * activity using `new Date(ts).toISOString().slice(0, 10)`, which is always the
 * UTC day. That breaks for users in non-UTC zones — a 23:30 ET workout on Dec 31
 * gets bucketed as Jan 1, silently ending a real-world streak.
 *
 * This package exposes two pure helpers:
 *  - `toLocalDayKey(date, tz)` — YYYY-MM-DD in the caller's IANA zone (DST-safe).
 *  - `toUTCDayKey(date)`        — YYYY-MM-DD in UTC (the existing slice(0,10) behavior).
 *
 * Implemented with `Intl.DateTimeFormat('en-CA', ...)` because the `en-CA` locale
 * emits `YYYY-MM-DD` natively — no manual padding / month-name parsing. Invalid
 * `tz` strings fall back to the UTC day key so a misconfigured user profile
 * cannot crash a service. ADDITIVE only; no service call-site has been migrated
 * (see follow-up sprint).
 */

/**
 * Format a date as YYYY-MM-DD in the given IANA time zone.
 *
 * @param date Either a `Date` instance or an ISO-8601 / RFC-3339 string.
 * @param tz   IANA zone identifier, e.g. `'America/New_York'`, `'Pacific/Auckland'`.
 *             Invalid zones fall back to UTC.
 * @returns    `YYYY-MM-DD` — always 10 chars, zero-padded.
 */
export function toLocalDayKey(date: Date | string, tz: string): string {
    const d = typeof date === 'string' ? new Date(date) : date;

    if (Number.isNaN(d.getTime())) {
        // Garbage in → empty key is worse than UTC fallback; mirror the existing
        // slice(0,10) shape on the epoch so callers get a deterministic value.
        return new Date(0).toISOString().slice(0, 10);
    }

    try {
        // en-CA → "2026-06-15" natively (no en-US "06/15/2026" parsing).
        const fmt = new Intl.DateTimeFormat('en-CA', {
            timeZone: tz,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        });
        return fmt.format(d);
    } catch {
        // Unknown / malformed tz → fall back to UTC day so a stale user profile
        // (e.g. "Foo/Bar" after a tz-rename) cannot 500 a streak endpoint.
        return toUTCDayKey(d);
    }
}

/**
 * Format a date as YYYY-MM-DD in UTC. This mirrors the existing
 * `new Date(ts).toISOString().slice(0, 10)` pattern so call-sites can pick
 * "UTC day" explicitly instead of relying on a side-effect of `.toISOString()`.
 *
 * @param date Either a `Date` instance or an ISO-8601 / RFC-3339 string.
 * @returns    `YYYY-MM-DD` UTC day.
 */
export function toUTCDayKey(date: Date | string): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (Number.isNaN(d.getTime())) {
        return new Date(0).toISOString().slice(0, 10);
    }
    return d.toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------------- *
 * Inter-shift recovery window (circadian fatigue primitive)
 * ------------------------------------------------------------------------- *
 * Shift workers chaining back-to-back rotations get dangerously short
 * turnarounds ("quick returns"). The gap between one shift ending and the
 * next starting is a well-known fatigue / safety signal, so we expose a
 * pure, bounded classifier the shift / plan services can read later.
 *
 * Thresholds (whole hours):
 *  - < 8h  → 'critical'. A turnaround under ~8h leaves no room for a normal
 *            sleep opportunity once commute + wind-down are subtracted; it is
 *            a recognised circadian red flag for accumulating sleep debt.
 *  - < 11h → 'tight'. 11h of daily rest is the common minimum-rest guidance
 *            (e.g. EU Working Time Directive daily rest). Below it is workable
 *            but leaves little recovery margin.
 *  - else  → 'adequate'.
 */

/** Turnarounds shorter than this many whole hours are flagged 'critical'. */
export const RECOVERY_CRITICAL_HOURS = 8;

/** Turnarounds shorter than this many whole hours (but >= critical) are 'tight'. */
export const RECOVERY_TIGHT_HOURS = 11;

/**
 * Upper sanity bound. A "recovery gap" longer than this is almost certainly a
 * data error (swapped rows, an open-ended shift, a stale record) rather than a
 * real inter-shift window, so we treat it as invalid instead of 'adequate'.
 */
const RECOVERY_MAX_HOURS = 14 * 24; // 14 days

export type RecoveryClassification = 'critical' | 'tight' | 'adequate' | 'invalid';

export interface ShiftRecoveryGap {
    /** Whole-hour gap between the shifts, floored. `-1` on invalid input. */
    hours: number;
    /** Bounded fatigue classification of the turnaround. */
    classification: RecoveryClassification;
}

/**
 * Compute the recovery window between a previous shift's end and the next
 * shift's start, returning the whole-hour gap plus a bounded fatigue
 * classification.
 *
 * Fail-safe like the day-key helpers: this NEVER throws. Unparseable inputs,
 * a reversed pair (next starts before previous ends), or an absurd multi-week
 * gap all return the sentinel `{ hours: -1, classification: 'invalid' }` so a
 * bad shift row can never crash a caller.
 *
 * Pure & deterministic: no `Date.now()`, no I/O. Inputs are parsed with
 * `Date.parse`, accepting full ISO-8601 / RFC-3339 datetime strings (the
 * package's UTC-parse style), so results are independent of host time zone.
 *
 * @param prevEndIso   ISO datetime the previous shift ended.
 * @param nextStartIso ISO datetime the next shift starts.
 */
export function shiftRecoveryGap(prevEndIso: string, nextStartIso: string): ShiftRecoveryGap {
    const invalid: ShiftRecoveryGap = { hours: -1, classification: 'invalid' };

    const prevMs = Date.parse(prevEndIso);
    const nextMs = Date.parse(nextStartIso);

    // Unparseable input → safe sentinel.
    if (Number.isNaN(prevMs) || Number.isNaN(nextMs)) {
        return invalid;
    }

    const diffMs = nextMs - prevMs;

    // Reversed pair (next shift starts before the previous one ended) is a
    // data error, not a zero-length break.
    if (diffMs < 0) {
        return invalid;
    }

    const hours = Math.floor(diffMs / 3_600_000); // whole hours

    // Absurdly long gap → almost certainly a bad row, not a real turnaround.
    if (hours > RECOVERY_MAX_HOURS) {
        return invalid;
    }

    let classification: RecoveryClassification;
    if (hours < RECOVERY_CRITICAL_HOURS) {
        classification = 'critical';
    } else if (hours < RECOVERY_TIGHT_HOURS) {
        classification = 'tight';
    } else {
        classification = 'adequate';
    }

    return { hours, classification };
}
