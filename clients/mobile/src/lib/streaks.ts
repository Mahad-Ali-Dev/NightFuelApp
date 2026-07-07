/**
 * streaks.ts
 *
 * Pure, dependency-free streak math for activity calendars.
 *
 * The mobile app normally *consumes* a server-computed streak (see
 * `progress.getStreak`), but it's useful to be able to derive the same numbers
 * on-device from a list of active dates — e.g. for an optimistic update, an
 * offline view, or the activity heatmap — without a round-trip. This module is
 * that pure core: no React, no network, no `Date.now()` (the caller passes
 * `today`), so it is fully deterministic and trivially testable.
 *
 * Inputs may be either calendar-day strings in `YYYY-MM-DD` form (the shape the
 * rest of the app uses via `new Date().toISOString().slice(0, 10)`) OR full
 * ISO-8601 timestamps. Day-bucketing is delegated to the canonical
 * `@nightfuel/dates` helpers so a night-shift activity logged after local
 * midnight buckets into the correct *local* calendar day instead of silently
 * rolling into the next UTC day:
 *   - When a `tz` (IANA zone) is supplied, ISO timestamps are bucketed with
 *     `toLocalDayKey(value, tz)` (DST-safe).
 *   - With no `tz`, ISO timestamps fall back to `toUTCDayKey(value)`, which is
 *     exactly the legacy `.slice(0, 10)` UTC behavior — so existing call sites
 *     that pass no `tz` keep behaving identically.
 * Values that are already a plain `YYYY-MM-DD` are passed through untouched, so
 * the day-string call path (and every existing test) is byte-for-byte unchanged.
 *
 * Once bucketed to day-keys, all run arithmetic is done in UTC day-numbers
 * (`toDayNumber`) so the consecutive-day math is immune to timezone / DST shifts.
 */
import { toLocalDayKey, toUTCDayKey } from '@nightfuel/dates';

const MS_PER_DAY = 86_400_000;

/** Matches a bare calendar day with no time component, e.g. `2026-06-16`. */
const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Reduce an input value to a `YYYY-MM-DD` day-key for bucketing.
 *
 * - A value that is already a bare `YYYY-MM-DD` (a calendar day, no time) is
 *   returned verbatim — this keeps the existing day-string call path, and all
 *   of its tests, completely unchanged.
 * - A value that parses as a real ISO-8601 timestamp is routed through the
 *   canonical `@nightfuel/dates` helpers: `toLocalDayKey` when a `tz` is given
 *   (so a 23:30 local / next-day-UTC night-shift activity lands on the correct
 *   local day), otherwise `toUTCDayKey` (the legacy UTC-slice behavior).
 * - Anything else (empty, `'not-a-date'`, non-string) is returned verbatim so
 *   the downstream `toDayNumber` rejects it and malformed entries stay ignored —
 *   the `@nightfuel/dates` helpers map garbage to a `1970-01-01` epoch sentinel,
 *   which we must NOT let masquerade as a real logged day.
 */
function toDayKey(value: string, tz?: string): string {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  // Already a bare calendar day (or empty): leave untouched for byte-for-byte
  // parity with the legacy day-string path.
  if (trimmed === '' || DAY_KEY_RE.test(trimmed)) return trimmed;
  // Only delegate to the day-key helpers for values that are genuinely parseable
  // dates; otherwise return as-is so toDayNumber treats it as malformed (rather
  // than the helpers' epoch fallback turning it into day 0).
  if (Number.isNaN(new Date(trimmed).getTime())) return trimmed;
  return tz ? toLocalDayKey(trimmed, tz) : toUTCDayKey(trimmed);
}

/**
 * Parse a `YYYY-MM-DD` calendar date into a UTC "day number" (whole days since
 * the Unix epoch). Returns null for anything that is not a real Y-M-D date, so
 * malformed/empty entries are skipped rather than corrupting the run math.
 */
function toDayNumber(date: string): number | null {
  if (typeof date !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const ms = Date.UTC(year, month - 1, day);
  const parsed = new Date(ms);
  // Reject overflow dates like 2026-02-30 (which JS would roll into March).
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return Math.floor(ms / MS_PER_DAY);
}

/**
 * Compute the current and longest activity streaks from a list of active dates.
 *
 * - `current` is the length of the unbroken run of consecutive days ending at
 *   `today`, OR at yesterday when today has not been logged yet (the streak is
 *   still "alive" until tomorrow). If the most recent activity is older than
 *   yesterday — a broken run — `current` is 0. Dates in the future relative to
 *   `today` never extend the current streak.
 * - `longest` is the longest run of consecutive calendar days anywhere in the
 *   set.
 *
 * Duplicate dates are de-duplicated; malformed entries are ignored. Empty input
 * (or an unparseable `today`) yields `{ current: 0, longest: 0 }`.
 *
 * @param dates active days as `YYYY-MM-DD` strings or ISO-8601 timestamps (any order)
 * @param today the reference "today" as a `YYYY-MM-DD` string or ISO-8601 timestamp
 * @param tz    optional IANA zone (e.g. `'America/New_York'`) used to bucket any
 *              ISO-timestamp inputs to their *local* calendar day. Omit it to keep
 *              the legacy UTC-day behavior; plain `YYYY-MM-DD` inputs ignore it.
 */
export function computeStreaks(
  dates: string[],
  today: string,
  tz?: string,
): { current: number; longest: number } {
  const todayNum = toDayNumber(toDayKey(today, tz));

  // Collect the unique, valid day-numbers, bucketing each input to its day-key
  // first (local-day when a tz is supplied, else UTC) so cross-midnight
  // night-shift activity lands on the correct calendar day.
  const days = new Set<number>();
  for (const d of dates) {
    const n = toDayNumber(toDayKey(d, tz));
    if (n !== null) days.add(n);
  }

  if (days.size === 0 || todayNum === null) {
    return { current: 0, longest: 0 };
  }

  const sorted = Array.from(days).sort((a, b) => a - b);

  // Longest run of consecutive days anywhere in the set.
  let longest = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i]! === sorted[i - 1]! + 1) {
      run += 1;
    } else {
      run = 1;
    }
    if (run > longest) longest = run;
  }

  // Current run: walk back day-by-day from the anchor. The anchor is `today` if
  // it was logged, else `yesterday` if it was logged (today simply not done yet),
  // otherwise the run is broken → current is 0.
  let anchor: number;
  if (days.has(todayNum)) {
    anchor = todayNum;
  } else if (days.has(todayNum - 1)) {
    anchor = todayNum - 1;
  } else {
    return { current: 0, longest };
  }

  let current = 0;
  let cursor = anchor;
  while (days.has(cursor)) {
    current += 1;
    cursor -= 1;
  }

  return { current, longest };
}
