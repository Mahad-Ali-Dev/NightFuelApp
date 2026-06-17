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
