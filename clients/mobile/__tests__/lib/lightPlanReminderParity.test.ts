/**
 * Card ↔ notification parity fence for the Light-Exposure plan.
 *
 * The LightPlanCard renders two light windows from `computeLightPlan`
 * (src/lib/lightPlan.ts): "Seek bright light" (seekLight) and "Avoid light /
 * blue-blockers" (avoidLight). `buildShiftReminders` (src/hooks/useCircadianReminders.ts)
 * schedules two corresponding LOCAL notifications — `nf-bright-light` and
 * `nf-avoid-light` — that MUST fire at the exact instants the card advertises,
 * so the card and the notifications tell ONE story.
 *
 * The AnchorSleepCard renders a fixed core-sleep block from `computeAnchorSleep`
 * (src/lib/circadian/anchorSleep.ts), and `buildShiftReminders` schedules the
 * corresponding `nf-anchor-sleep` LOCAL notification that MUST fire at the
 * instant that block OPENS, so that card and its notification also tell ONE story.
 *
 * This suite pins those relationships BIT-IDENTICALLY:
 *
 *   nf-bright-light.date.getTime() === computeLightPlan(shift).seekLight.start.getTime()
 *   nf-avoid-light.date.getTime()  === computeLightPlan(shift).avoidLight.start.getTime()
 *   nf-anchor-sleep.date.getTime() === computeAnchorSleep(shift).anchor.start.getTime()
 *
 * `buildShiftReminders` deliberately computes `nf-avoid-light` and
 * `nf-anchor-sleep` via direct Date arithmetic (end + (sleepStartAfterEnd −
 * BLUE_BLOCKER_LEAD_HOURS)h and end + sleepStartAfterEnd h respectively) rather
 * than calling `computeLightPlan` / `computeAnchorSleep`, to keep the function
 * pure (no throw on malformed ISO). These equalities are the lock that guarantees
 * the derivations stay equal by VALUE — if anyone tweaks the blue-blocker lead,
 * the OFFSETS, or the brightLightWindow in EITHER module without the other, this
 * suite turns RED.
 *
 * Both `buildShiftReminders`, `computeLightPlan` and `computeAnchorSleep` are pure
 * (no React / native / network / Date.now), so this needs no mocks. Timestamps are UTC so the
 * absolute-instant arithmetic is deterministic regardless of the machine's
 * timezone, and we assert with getTime() so the equalities hold across midnight.
 */
import { buildShiftReminders } from '@/hooks/useCircadianReminders';
import { computeLightPlan } from '@/lib/lightPlan';
import { computeAnchorSleep } from '@/lib/circadian/anchorSleep';

function reminderDate(shift: { startTime: string; endTime: string }, id: string): Date {
  const r = buildShiftReminders(shift).find((x) => x.id === id);
  expect(r).toBeDefined();
  return r!.date;
}

describe('LightPlanCard ↔ circadian-reminder parity', () => {
  describe('overnight shift (22:00 → 06:00 the NEXT calendar day)', () => {
    const SHIFT = { startTime: '2026-06-13T22:00:00.000Z', endTime: '2026-06-14T06:00:00.000Z' };

    test('nf-avoid-light fires at computeLightPlan(shift).avoidLight.start (bit-identical)', () => {
      const { avoidLight } = computeLightPlan(SHIFT);
      expect(reminderDate(SHIFT, 'nf-avoid-light').getTime()).toBe(avoidLight.start.getTime());
    });

    test('nf-bright-light still fires at computeLightPlan(shift).seekLight.start (bit-identical)', () => {
      const { seekLight } = computeLightPlan(SHIFT);
      expect(reminderDate(SHIFT, 'nf-bright-light').getTime()).toBe(seekLight.start.getTime());
    });

    test('nf-anchor-sleep fires at computeAnchorSleep(shift).anchor.start (bit-identical)', () => {
      const { anchor } = computeAnchorSleep(SHIFT);
      expect(reminderDate(SHIFT, 'nf-anchor-sleep').getTime()).toBe(anchor.start.getTime());
    });
  });

  describe('day shift (07:00 → 19:00 same calendar day)', () => {
    // Offsets are absolute-instant Date math, not wall-clock, so the parity must
    // also hold for a same-day shift — guards against a regression that only
    // happened to line up across a midnight boundary.
    const SHIFT = { startTime: '2026-01-02T07:00:00.000Z', endTime: '2026-01-02T19:00:00.000Z' };

    test('nf-avoid-light fires at avoidLight.start and nf-bright-light at seekLight.start', () => {
      const { seekLight, avoidLight } = computeLightPlan(SHIFT);
      expect(reminderDate(SHIFT, 'nf-avoid-light').getTime()).toBe(avoidLight.start.getTime());
      expect(reminderDate(SHIFT, 'nf-bright-light').getTime()).toBe(seekLight.start.getTime());
    });

    test('nf-anchor-sleep fires at computeAnchorSleep(shift).anchor.start (bit-identical)', () => {
      const { anchor } = computeAnchorSleep(SHIFT);
      expect(reminderDate(SHIFT, 'nf-anchor-sleep').getTime()).toBe(anchor.start.getTime());
    });
  });
});
