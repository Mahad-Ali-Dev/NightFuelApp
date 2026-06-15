/**
 * shiftTransition.ts
 *
 * Pure, dependency-free circadian "shift transition" math.
 *
 * Given the user's next upcoming (or just-logged) shift — its ISO `startTime`
 * and `endTime` — this derives the three readiness anchors a shift worker cares
 * about when planning the wind-down *after* clocking out:
 *
 *   - `sleepWindow`     — when to be asleep (the recovery opportunity)
 *   - `caffeineCutoff`  — the last sensible time for caffeine
 *   - `brightLightWindow` — when to seek bright light to anchor alertness
 *
 * The offsets intentionally mirror the local-reminder anchors in
 * `buildShiftReminders` (src/hooks/useCircadianReminders.ts) so the coach card
 * and the scheduled notifications tell the same story:
 *
 *   buildShiftReminders                    computeShiftTransition
 *   ──────────────────────────────────     ────────────────────────────────
 *   nf-caffeine-cutoff = end - 6h     ◄──►  caffeineCutoff      = end - 6h
 *   nf-winddown        = end + 1h     ◄──►  sleepWindow.start   = end + 1h
 *   nf-log-sleep       = end + 9h     ◄──►  sleepWindow.end     = end + 9h
 *
 * `brightLightWindow` (start … start + 2h) is the card's own additive guidance:
 * for a night worker, bright light early in the shift helps hold alertness and
 * delays the post-shift melatonin onset.
 *
 * IMPORTANT: this module is deliberately standalone and pure. It does NOT import
 * the `useCircadianReminders` hook (which pulls in expo-notifications, the auth
 * store, and network calls) — keeping the lib free of React / native / I/O deps
 * so it stays trivially unit-testable and safe to import anywhere.
 *
 * All arithmetic is absolute-instant Date math (getTime + hour offsets), exactly
 * like `buildShiftReminders`, so an overnight shift whose `endTime` is on the
 * next calendar day (end < start in wall-clock terms) is handled naturally — the
 * ISO timestamps already encode the correct day, and the offsets just add hours.
 */

const HOUR_MS = 3_600_000;

/** Hour offsets relative to the shift's start/end instants. Mirrors buildShiftReminders. */
const OFFSETS = {
  /** Last call for caffeine: 6h before the shift ends (== nf-caffeine-cutoff). */
  caffeineCutoffBeforeEnd: -6,
  /** Sleep opportunity opens 1h after clock-out (== nf-winddown). */
  sleepStartAfterEnd: 1,
  /** Sleep opportunity closes 9h after clock-out (== nf-log-sleep); ~8h in bed. */
  sleepEndAfterEnd: 9,
  /** Bright-light anchoring opens at clock-in. */
  brightLightStartAfterStart: 0,
  /** Bright-light anchoring runs for the first 2h of the shift. */
  brightLightEndAfterStart: 2,
} as const;

export interface ShiftLike {
  /** ISO-8601 timestamp for shift start (e.g. "2026-06-13T22:00:00.000Z"). */
  startTime: string;
  /** ISO-8601 timestamp for shift end. May be on the next calendar day. */
  endTime: string;
}

export interface ShiftTransition {
  /** Recommended sleep window (recovery opportunity) after the shift. */
  sleepWindow: { start: Date; end: Date };
  /** The last sensible moment for caffeine before the shift ends. */
  caffeineCutoff: Date;
  /** When to seek bright light to anchor alertness during the shift. */
  brightLightWindow: { start: Date; end: Date };
}

/** Add a whole-hour offset to a base instant, returning a fresh Date. */
function offsetHours(base: Date, hours: number): Date {
  return new Date(base.getTime() + hours * HOUR_MS);
}

/**
 * Parse an ISO-8601 timestamp into a valid Date, or throw on anything
 * unparseable (empty string, garbage, missing field). Mirrors the defensive
 * "reject malformed input" posture in streaks.ts rather than silently producing
 * an `Invalid Date` that would propagate NaN into every anchor.
 */
function parseInstant(value: string, field: keyof ShiftLike): Date {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`computeShiftTransition: missing ${field}`);
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`computeShiftTransition: invalid ${field} "${value}"`);
  }
  return d;
}

/**
 * Compute the circadian transition anchors for a single shift.
 *
 * Pure: no React, no network, no `Date.now()` — the result depends only on the
 * shift's ISO timestamps, so repeated calls yield equal instants and it is
 * fully deterministic regardless of the device timezone.
 *
 * @param shift the shift's ISO `startTime` / `endTime`
 * @throws if either timestamp is missing or unparseable
 */
export function computeShiftTransition(shift: ShiftLike): ShiftTransition {
  const start = parseInstant(shift.startTime, 'startTime');
  const end = parseInstant(shift.endTime, 'endTime');

  return {
    caffeineCutoff: offsetHours(end, OFFSETS.caffeineCutoffBeforeEnd),
    sleepWindow: {
      start: offsetHours(end, OFFSETS.sleepStartAfterEnd),
      end: offsetHours(end, OFFSETS.sleepEndAfterEnd),
    },
    brightLightWindow: {
      start: offsetHours(start, OFFSETS.brightLightStartAfterStart),
      end: offsetHours(start, OFFSETS.brightLightEndAfterStart),
    },
  };
}
