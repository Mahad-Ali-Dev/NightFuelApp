/**
 * anchorSleep.ts
 *
 * Pure, dependency-free derivation of a rotating-shift worker's ANCHOR-SLEEP
 * block — the fixed core-sleep period a worker is advised to hold constant
 * across a rotation so the body clock keeps at least one stable sleep anchor
 * even as shift times drift.
 *
 *   - `anchor` — a fixed-length CORE-sleep block that opens exactly at the
 *     recovery-sleep opportunity (`computeShiftTransition(shift).sleepWindow.start`,
 *     i.e. 1h after clock-out) and runs for `ANCHOR_SLEEP_HOURS`. Because the
 *     full `sleepWindow` is ~8h wide (start … start + 8h) and the anchor block
 *     is only `ANCHOR_SLEEP_HOURS` (4h) long, the anchor sits entirely WITHIN
 *     the sleep window: `anchor.start === sleepWindow.start` and, by
 *     construction, `anchor.end <= sleepWindow.end`.
 *
 * The "anchor sleep" idea: rather than sleeping at a wildly different clock time
 * every rotation, a worker keeps a shorter CORE block anchored to a consistent
 * point relative to the shift (here, the opening of the recovery-sleep window).
 * Holding that core block constant gives the circadian system a stable cue while
 * the surrounding sleep is rearranged around the rotation.
 *
 * This module deliberately REUSES `computeShiftTransition` rather than
 * re-deriving any instants, so the anchor block stays in lockstep with the
 * existing shift anchors and OFFSETS — exactly like `lightPlan.ts` reuses it.
 * The only new number introduced here is the documented `ANCHOR_SLEEP_HOURS`
 * core-block length; there are no other magic numbers. In particular we do NOT
 * re-derive the offsets and do NOT re-parse the ISO ourselves.
 *
 * Because it routes through `computeShiftTransition`, it inherits that
 * function's throw-on-malformed-ISO behaviour: a missing or unparseable
 * timestamp throws (the same contract the coach card and `computeLightPlan`
 * rely on) rather than silently producing an `Invalid Date` / NaN.
 *
 * IMPORTANT: like `shiftTransition.ts` and `lightPlan.ts`, this module is
 * standalone and pure. It does NOT import React / native / expo, does NOT call
 * `Date.now()`, and does NOT perform any I/O — so the result depends only on the
 * shift's ISO timestamps, making it fully deterministic and trivially
 * unit-testable. Callers format the raw `Date` instants for display (e.g. with
 * `toLocaleTimeString` + the Intl-less HH:MM fallback `LightPlanCard` uses).
 *
 * All arithmetic is absolute-instant Date math (getTime + hour offset), exactly
 * like `computeShiftTransition` / `computeLightPlan`, so an overnight shift whose
 * `endTime` falls on the next calendar day (e.g. 22:00 → 06:00) is handled
 * naturally — the ISO timestamps already encode the correct day, and adding the
 * core-block length in milliseconds yields the correct absolute instant.
 */

import { computeShiftTransition, type ShiftLike } from '../shiftTransition';

const HOUR_MS = 3_600_000;

/**
 * Length, in hours, of the fixed CORE-sleep block held constant across a
 * rotation.
 *
 * This is the one new number this module introduces (everything else is reused
 * from `computeShiftTransition` / `OFFSETS`). The anchor block is intentionally
 * shorter than the full ~8h recovery `sleepWindow` (`sleepStartAfterEnd` …
 * `sleepEndAfterEnd`, i.e. 1h–9h after clock-out): a rotating-shift worker keeps
 * this 4h core anchored to a consistent point relative to the shift while the
 * surrounding sleep is rearranged around the rotation, so the body clock retains
 * a stable cue. Because it is shorter than the sleep window AND anchored to that
 * window's opening, the core block always sits strictly within `sleepWindow`.
 */
export const ANCHOR_SLEEP_HOURS = 4;

export interface AnchorSleep {
  /**
   * The fixed core-sleep block. `start` is exactly the recovery-sleep opening
   * (`computeShiftTransition(shift).sleepWindow.start`) and `end` is
   * `start + ANCHOR_SLEEP_HOURS`, so the block is held constant across a
   * rotation and, by construction, lies within the shift's `sleepWindow`
   * (`anchor.start === sleepWindow.start`, `anchor.end <= sleepWindow.end`).
   */
  anchor: { start: Date; end: Date };
}

/**
 * Derive the rotating-shift ANCHOR-SLEEP block for a single shift.
 *
 * Pure: no React, no network, no `Date.now()` — the result depends only on the
 * shift's ISO timestamps, so repeated calls yield equal instants and it is fully
 * deterministic regardless of the device timezone.
 *
 * The anchor opens at the recovery-sleep opportunity (`sleepWindow.start`, == 1h
 * after clock-out via `OFFSETS.sleepStartAfterEnd`) and runs for a fixed
 * `ANCHOR_SLEEP_HOURS`, so `anchor.start === sleepWindow.start` and
 * `anchor.end <= sleepWindow.end` (the core block sits within the ~8h window).
 *
 * @param shift the shift's ISO `startTime` / `endTime`
 * @throws if either timestamp is missing or unparseable (re-thrown from
 *   `computeShiftTransition`, never silently NaN)
 */
export function computeAnchorSleep(shift: ShiftLike): AnchorSleep {
  // Re-throws on malformed/missing ISO exactly like the card path and
  // computeLightPlan — do not re-parse the ISO here; rely on
  // computeShiftTransition's contract (which uses OFFSETS internally).
  const t = computeShiftTransition(shift);

  const start = t.sleepWindow.start;

  return {
    anchor: {
      // Fixed CORE block anchored to the recovery-sleep opening, held constant
      // across the rotation; strictly within sleepWindow since the block
      // (ANCHOR_SLEEP_HOURS) is shorter than the window (sleepEndAfterEnd −
      // sleepStartAfterEnd hours).
      start,
      end: new Date(start.getTime() + ANCHOR_SLEEP_HOURS * HOUR_MS),
    },
  };
}
