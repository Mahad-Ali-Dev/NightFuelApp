/**
 * nextShift.ts
 *
 * Pure, dependency-free "next upcoming shift" selection + countdown formatting.
 *
 * The dashboard's SHIFT COUNTDOWN HERO answers "when does my CURRENT shift end?"
 * (and "Rest Mode" when none). It says NOTHING about the *next* shift. This
 * module supplies the two pure helpers a "Next shift" card needs:
 *
 *   - `getNextShift(shifts, now)` — pick the shift whose `startTime` is the
 *     soonest instant STRICTLY AFTER `now` (the user's next clock-in), or null.
 *   - `formatStartsIn(target, now)` — the absolute-instant "Xh Ym" countdown to
 *     that start (the SAME `floor((target − now) / 60000)` math the dashboard's
 *     getCountdown uses, kept as the single source of truth for this card).
 *
 * Both are pure: no React, no native, no I/O, and no implicit `Date.now()` —
 * `now` is always injected — so they are deterministic regardless of the device
 * timezone and trivially unit-testable. Selection and formatting use
 * absolute-instant Date math (`getTime()`), exactly like
 * `computeShiftTransition` (src/lib/shiftTransition.ts), so an overnight shift
 * whose ISO timestamps cross midnight needs no special-casing.
 *
 * DEFENSIVE PARSING: a shift whose `startTime` is empty / missing / an
 * unparseable "Invalid Date" is silently SKIPPED rather than throwing — mirroring
 * the "reject malformed input" posture of `parseInstant` in shiftTransition.ts,
 * but here we degrade to "ignore this row" because a single bad shift in the list
 * must never blow up the picker (the api/shifts.list payload is a wide ±366d
 * window that may contain stragglers).
 */

const MINUTE_MS = 60_000;

/**
 * The minimal shift shape this module needs. `api/shifts.Shift` is a structural
 * superset (it also carries id/userId/endTime/timezone/…), so a `Shift` is
 * assignable to `ShiftLike` and callers can pass the API type directly.
 */
export interface ShiftLike {
  /** Human label for the shift kind, e.g. "night" / "day" / "evening". */
  type: string;
  /** ISO-8601 timestamp for shift start (e.g. "2026-06-13T22:00:00.000Z"). */
  startTime: string;
}

/**
 * Parse a shift's `startTime` into a finite epoch-ms instant, or `null` when it
 * is missing / empty / unparseable. Pure and total — never throws — so a single
 * malformed row in `getNextShift`'s input is skipped, not fatal.
 */
function startInstantMs(shift: ShiftLike | null | undefined): number | null {
  const value = shift?.startTime;
  if (typeof value !== 'string' || value.trim() === '') return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Return the user's NEXT upcoming shift: the one whose `startTime` is the
 * soonest instant strictly AFTER `now`, or `null` when none qualifies.
 *
 * - Shifts already started/past (startTime <= now) are excluded.
 * - Shifts with an empty / missing / Invalid-Date `startTime` are skipped
 *   (never throw).
 * - On an exact tie (two shifts share the soonest future start instant) the
 *   first such shift in input order wins — a stable, deterministic choice.
 *
 * Pure: the result depends only on the inputs (no `Date.now()`), so for a fixed
 * `now` repeated calls return the same shift.
 *
 * @param shifts the candidate shifts (e.g. api/shifts.list()'s ±366d window)
 * @param now    the reference instant ("now") to compare start times against
 */
export function getNextShift<T extends ShiftLike>(
  shifts: readonly T[] | null | undefined,
  now: Date,
): T | null {
  if (!Array.isArray(shifts) || shifts.length === 0) return null;
  const nowMs = now.getTime();
  if (Number.isNaN(nowMs)) return null;

  let best: T | null = null;
  let bestMs = Infinity;
  for (const shift of shifts) {
    const ms = startInstantMs(shift);
    if (ms === null) continue; // skip malformed rows
    if (ms <= nowMs) continue; // strictly AFTER now
    if (ms < bestMs) {
      bestMs = ms;
      best = shift;
    }
  }
  return best;
}

/**
 * Format the time remaining until `target` as a compact `"Xh Ym"` string, using
 * absolute-instant Date math — the SAME `floor((target − now) / 60000)` the
 * dashboard's `getCountdown` uses, so the "Next shift" card and the hero speak
 * the same countdown language from one helper (no duplicated math).
 *
 * Returns `null` when `target`/`now` is an Invalid Date or when `target` is not
 * strictly in the future (<= now) — i.e. there is nothing to count down to — so
 * the caller can render a clean fallback rather than "0h 0m" or "NaNh NaNm".
 */
export function formatStartsIn(target: Date, now: Date): string | null {
  const targetMs = target.getTime();
  const nowMs = now.getTime();
  if (Number.isNaN(targetMs) || Number.isNaN(nowMs)) return null;
  const diffMs = targetMs - nowMs;
  if (diffMs <= 0) return null;
  const minutes = Math.floor(diffMs / MINUTE_MS);
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
