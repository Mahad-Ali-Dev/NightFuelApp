/**
 * lightPlan.ts
 *
 * Pure, dependency-free derivation of a shift worker's Light-Exposure Coaching
 * plan: the two light windows that matter when transitioning around a shift.
 *
 *   - `seekLight`  — when to SEEK bright light. This is exactly the existing
 *     `brightLightWindow` from `computeShiftTransition` (start … start + 2h):
 *     for a night worker, bright light early in the shift holds alertness and
 *     pushes the body clock in the night-worker direction (delaying the
 *     post-shift melatonin onset).
 *   - `avoidLight` — when to AVOID light (blue-blocker / dim-down window). A
 *     ~2h lead ending exactly at `sleepWindow.start`, because post-shift
 *     melatonin can rise and pre-sleep light exposure would suppress it and
 *     delay sleep onset. So `avoidLight.end === sleepWindow.start` and
 *     `avoidLight.start` is strictly before it.
 *
 * This module deliberately REUSES `computeShiftTransition` rather than
 * re-deriving any instants, so the light windows stay in lockstep with the
 * existing shift anchors and OFFSETS. The only new number introduced here is the
 * documented `BLUE_BLOCKER_LEAD_HOURS` pre-sleep lead — there are no other magic
 * numbers.
 *
 * Because it routes through `computeShiftTransition`, it inherits that function's
 * throw-on-malformed-ISO behaviour: a missing or unparseable timestamp throws
 * (the same contract the coach card relies on) rather than silently producing an
 * `Invalid Date` / NaN. We intentionally do NOT re-parse the ISO ourselves.
 *
 * IMPORTANT: like `shiftTransition.ts`, this module is standalone and pure. It
 * does NOT import React / native / expo, does NOT call `Date.now()`, and does NOT
 * perform any I/O — so the result depends only on the shift's ISO timestamps,
 * making it fully deterministic and trivially unit-testable.
 *
 * All arithmetic is absolute-instant Date math (getTime + hour offset), exactly
 * like `computeShiftTransition` / `buildShiftReminders`, so an overnight shift
 * whose `endTime` falls on the next calendar day (e.g. 22:00 → 06:00) is handled
 * naturally — the ISO timestamps already encode the correct day, and subtracting
 * the lead in milliseconds yields the correct absolute instant.
 */

import { computeShiftTransition, type ShiftLike } from './shiftTransition';

const HOUR_MS = 3_600_000;

/**
 * Pre-sleep "avoid light" lead, in hours, ending at `sleepWindow.start`.
 *
 * This is the one new number this module introduces (everything else is reused
 * from `computeShiftTransition`). It models the blue-blocker / dim-down window a
 * shift worker should observe before the recovery sleep: as post-shift melatonin
 * begins to rise, light exposure in this window would suppress it and push sleep
 * onset later, so the coach advises avoiding bright/blue light for ~2h before
 * `sleepWindow.start`.
 */
export const BLUE_BLOCKER_LEAD_HOURS = 2;

export interface LightPlan {
  /** When to SEEK bright light (== the shift's `brightLightWindow`). */
  seekLight: { start: Date; end: Date };
  /** When to AVOID light: a ~2h blue-blocker lead ending at `sleepWindow.start`. */
  avoidLight: { start: Date; end: Date };
}

/**
 * Derive the Light-Exposure Coaching plan for a single shift.
 *
 * Pure: no React, no network, no `Date.now()` — the result depends only on the
 * shift's ISO timestamps, so repeated calls yield equal instants and it is fully
 * deterministic regardless of the device timezone.
 *
 * `seekLight` is the existing `brightLightWindow` (same instants). `avoidLight`
 * is the `BLUE_BLOCKER_LEAD_HOURS` window immediately preceding the sleep
 * opportunity, so `avoidLight.end === sleepWindow.start` and `avoidLight.start`
 * is strictly earlier.
 *
 * @param shift the shift's ISO `startTime` / `endTime`
 * @throws if either timestamp is missing or unparseable (re-thrown from
 *   `computeShiftTransition`, never silently NaN)
 */
export function computeLightPlan(shift: ShiftLike): LightPlan {
  // Re-throws on malformed/missing ISO exactly like the card path — do not
  // re-parse the ISO here; rely on computeShiftTransition's contract.
  const t = computeShiftTransition(shift);

  const sleepStart = t.sleepWindow.start;

  return {
    // Hold alertness / push the body clock the night-worker direction.
    seekLight: t.brightLightWindow,
    // ~2h pre-sleep blue-blocker window, ending exactly at sleepWindow.start.
    avoidLight: {
      start: new Date(sleepStart.getTime() - BLUE_BLOCKER_LEAD_HOURS * HOUR_MS),
      end: sleepStart,
    },
  };
}
