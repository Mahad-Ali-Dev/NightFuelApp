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
 * Dates are calendar-day strings in `YYYY-MM-DD` form (the same shape the rest
 * of the app uses via `new Date().toISOString().slice(0, 10)`). All arithmetic
 * is done in UTC day-numbers so it is immune to local timezone / DST shifts.
 */

const MS_PER_DAY = 86_400_000;

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
 * @param dates active calendar days as `YYYY-MM-DD` strings (any order)
 * @param today the reference "today" as a `YYYY-MM-DD` string
 */
export function computeStreaks(dates: string[], today: string): { current: number; longest: number } {
  const todayNum = toDayNumber(today);

  // Collect the unique, valid day-numbers.
  const days = new Set<number>();
  for (const d of dates) {
    const n = toDayNumber(d);
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
