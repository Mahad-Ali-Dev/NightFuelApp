/**
 * Cross-helper circadian-engine INTEGRITY self-test (anchor ↔ light ↔ reminders).
 *
 * The circadian coach surfaces ONE shift's transition through three shipped
 * helpers that all route back to the same `computeShiftTransition` math + the
 * same `OFFSETS`:
 *
 *   - computeShiftTransition (src/lib/shiftTransition.ts) — the base anchors
 *     (sleepWindow / caffeineCutoff / brightLightWindow) and the single source
 *     of OFFSETS.
 *   - computeAnchorSleep     (src/lib/circadian/anchorSleep.ts) — the fixed
 *     core-sleep block; `anchor.start === sleepWindow.start`.
 *   - computeLightPlan       (src/lib/lightPlan.ts) — the light windows;
 *     `seekLight === brightLightWindow` and `avoidLight.end === sleepWindow.start`.
 *   - buildShiftReminders    (src/hooks/useCircadianReminders.ts) — the LOCAL
 *     notifications: `nf-anchor-sleep` at `sleepWindow.start`, `nf-avoid-light`
 *     at `sleepWindow.start − BLUE_BLOCKER_LEAD_HOURS`, `nf-bright-light` at
 *     `brightLightWindow.start`.
 *
 * Each of those helpers re-derives its instants independently (the hook even
 * INLINES the Date arithmetic rather than calling computeLightPlan /
 * computeAnchorSleep, to stay pure). That independence is exactly the drift
 * risk: nothing at the type level forces `buildShiftReminders` to keep agreeing
 * with `computeLightPlan`, or `computeAnchorSleep` to keep agreeing with
 * `computeShiftTransition`, once someone edits a single OFFSETS value,
 * ANCHOR_SLEEP_HOURS, or BLUE_BLOCKER_LEAD_HOURS.
 *
 * This suite binds ALL THREE helpers (plus the base engine) to ONE shared fixed
 * shift and asserts they agree on the EXACT UTC instants (compared via
 * getTime()). The point is a single, loud tripwire across the whole engine
 * triangle:
 *
 *   ┌─ ANCHORS ──────────────────────────────────────────────────────────────┐
 *   │  computeShiftTransition(shift).sleepWindow.start                          │
 *   │     === computeAnchorSleep(shift).anchor.start          (anchor opens)    │
 *   │     === computeLightPlan(shift).avoidLight.end          (blue-blocker end)│
 *   │     === nf-anchor-sleep reminder instant                                  │
 *   │                                                                           │
 *   │  computeShiftTransition(shift).brightLightWindow.start                    │
 *   │     === computeLightPlan(shift).seekLight.start         (seek-light open) │
 *   │     === nf-bright-light reminder instant                                  │
 *   │                                                                           │
 *   │  computeLightPlan(shift).avoidLight.start               (blue-blocker on) │
 *   │     === nf-avoid-light reminder instant                                   │
 *   └───────────────────────────────────────────────────────────────────────┘
 *
 * ANTI-DRIFT CONTRACT (the reason this file exists): changing ANY SINGLE one of
 *   - OFFSETS.sleepStartAfterEnd / OFFSETS.brightLightStartAfterStart (or any
 *     other OFFSETS value an instant below depends on) in src/lib/shiftTransition.ts,
 *   - ANCHOR_SLEEP_HOURS in src/lib/circadian/anchorSleep.ts,  (*)
 *   - BLUE_BLOCKER_LEAD_HOURS in src/lib/lightPlan.ts,
 * in ISOLATION MUST turn this suite RED — whether the edit drifts ONE helper away
 * from the others (caught by the relative cross-helper equalities) OR moves the
 * whole triangle in lockstep (caught because every shared instant is ALSO pinned
 * to a hard-coded documented literal that is NOT derived from those constants, so
 * the timeline shifts off the contract). The named constants are additionally
 * pinned to their documented magnitudes in a dedicated block, so a value edit
 * fails with a message that names the offending constant.
 *
 *   (*) ANCHOR_SLEEP_HOURS sets `anchor.end`; the hook uses it only in the
 *       reminder body string. We pin `anchor.end === anchor.start +
 *       ANCHOR_SLEEP_HOURS` so the core-block LENGTH can't silently change
 *       without this suite noticing, even though it doesn't move a notification
 *       instant.
 *
 * This is a NEW, test-ONLY file. It imports only the shipped lib/hook helpers and
 * owns no source file. It is DISTINCT from lightPlanReminderParity.test.ts (which
 * pins the card↔reminder pairs); this file's job is the cross-helper TRIANGLE —
 * the transitive equalities that tie the anchor, the light plan, the base engine,
 * and the reminders into one story.
 *
 * Every helper here is pure (no React / native / network / Date.now), so the
 * suite needs no mocks. Fixtures are UTC so the absolute-instant arithmetic is
 * deterministic regardless of the machine timezone, and we assert with getTime()
 * so equalities hold across a midnight boundary. Both an overnight shift (end on
 * the NEXT calendar day) and a same-day day shift are covered, because the
 * offsets are absolute-instant math — never wall-clock — so the triangle must
 * close in both cases.
 */
import { computeShiftTransition, OFFSETS, type ShiftLike } from '@/lib/shiftTransition';
import { computeAnchorSleep, ANCHOR_SLEEP_HOURS } from '@/lib/circadian/anchorSleep';
import { computeLightPlan, BLUE_BLOCKER_LEAD_HOURS } from '@/lib/lightPlan';
import { buildShiftReminders } from '@/hooks/useCircadianReminders';

const HOUR = 3_600_000;

/** Resolve a single planned reminder's fire instant (in ms) by id, asserting it exists. */
function reminderInstant(shift: ShiftLike, id: string): number {
  const r = buildShiftReminders(shift).find((x) => x.id === id);
  expect(r).toBeDefined();
  return r!.date.getTime();
}

/**
 * The DOCUMENTED contract instants for one shift, as hard-coded UTC literals.
 *
 * These are deliberately LITERALS, not values re-derived from OFFSETS /
 * ANCHOR_SLEEP_HOURS / BLUE_BLOCKER_LEAD_HOURS. That is the whole anti-drift
 * mechanism: OFFSETS is a SHARED constant imported by the engine, both helpers,
 * AND the hook, so editing (say) `sleepStartAfterEnd` moves all of them together
 * — they'd stay internally consistent and a comparison against OFFSETS would
 * still pass. Pinning the documented wall-clock instants instead means any single
 * isolated edit to those constants shifts the whole engine triangle AWAY from the
 * contract and turns this suite RED.
 */
interface ContractInstants {
  /** sleepWindow.start === anchor.start === avoidLight.end === nf-anchor-sleep (end + 1h). */
  sleepOpen: string;
  /** avoidLight.start === nf-avoid-light (sleepOpen − BLUE_BLOCKER_LEAD_HOURS). */
  avoidLightStart: string;
  /** seekLight.start === brightLightWindow.start === nf-bright-light (shift start + 0h). */
  seekLightStart: string;
  /** anchor.end (sleepOpen + ANCHOR_SLEEP_HOURS) — pins the core-block LENGTH. */
  anchorEnd: string;
}

/**
 * Run the full cross-helper triangle for ONE shared shift against its documented
 * contract instants. Called for both an overnight and a day-shift fixture so the
 * same agreement is proven for each.
 *
 * Two layers of assertion, both required:
 *   1. RELATIVE — the four producers (engine, anchorSleep, lightPlan, reminders)
 *      agree with EACH OTHER (catches a helper-local derivation drift, e.g.
 *      avoidLight.end no longer tracking sleepWindow.start).
 *   2. ABSOLUTE — every shared instant equals the hard-coded documented literal
 *      (catches an isolated edit to a SHARED constant, which would move the whole
 *      triangle in lockstep and slip past the relative layer alone).
 */
function assertEngineTriangle(shift: ShiftLike, expected: ContractInstants): void {
  const transition = computeShiftTransition(shift);
  const { anchor } = computeAnchorSleep(shift);
  const { seekLight, avoidLight } = computeLightPlan(shift);

  const ms = (iso: string) => new Date(iso).getTime();
  const sleepOpenMs = ms(expected.sleepOpen);

  // ── Layer 1: the producers agree with each other ──────────────────────────
  // (a) computeAnchorSleep.anchor.start === computeShiftTransition.sleepWindow.start
  expect(anchor.start.getTime()).toBe(transition.sleepWindow.start.getTime());
  // (c) nf-anchor-sleep reminder instant === computeAnchorSleep.anchor.start
  expect(reminderInstant(shift, 'nf-anchor-sleep')).toBe(anchor.start.getTime());
  // (b) computeLightPlan.avoidLight.end === computeShiftTransition.sleepWindow.start
  expect(avoidLight.end.getTime()).toBe(transition.sleepWindow.start.getTime());
  // (d) nf-avoid-light reminder instant === computeLightPlan.avoidLight.start
  expect(reminderInstant(shift, 'nf-avoid-light')).toBe(avoidLight.start.getTime());
  // (e) computeLightPlan.seekLight.start === computeShiftTransition.brightLightWindow.start
  //     === nf-bright-light reminder instant (one transitive triple).
  expect(seekLight.start.getTime()).toBe(transition.brightLightWindow.start.getTime());
  expect(reminderInstant(shift, 'nf-bright-light')).toBe(seekLight.start.getTime());

  // ── Layer 2: every shared instant equals its documented literal ────────────
  // The keystone "sleep opens" instant: four independent views collapse onto the
  // single documented value (end + 1h). An isolated edit to OFFSETS.sleepStartAfterEnd
  // moves all four off this literal at once → RED.
  expect(transition.sleepWindow.start.getTime()).toBe(sleepOpenMs);
  expect(anchor.start.getTime()).toBe(sleepOpenMs);
  expect(avoidLight.end.getTime()).toBe(sleepOpenMs);
  expect(reminderInstant(shift, 'nf-anchor-sleep')).toBe(sleepOpenMs);

  // avoidLight.start / nf-avoid-light pinned to the documented literal: an isolated
  // edit to BLUE_BLOCKER_LEAD_HOURS (lightPlan AND the hook both consume it) shifts
  // both off this value → RED. The literal is sleepOpen − BLUE_BLOCKER_LEAD_HOURS.
  expect(avoidLight.start.getTime()).toBe(ms(expected.avoidLightStart));
  expect(reminderInstant(shift, 'nf-avoid-light')).toBe(ms(expected.avoidLightStart));
  // Cross-check the lead matches the constant's documented magnitude (defence in depth).
  expect(sleepOpenMs - ms(expected.avoidLightStart)).toBe(BLUE_BLOCKER_LEAD_HOURS * HOUR);

  // seek-light open pinned to the documented literal (shift start + 0h): an isolated
  // edit to OFFSETS.brightLightStartAfterStart moves engine + lightPlan + reminder
  // off this value → RED.
  expect(seekLight.start.getTime()).toBe(ms(expected.seekLightStart));
  expect(reminderInstant(shift, 'nf-bright-light')).toBe(ms(expected.seekLightStart));

  // The fixed core-sleep block LENGTH: anchor.end pinned to the documented literal
  // (sleepOpen + ANCHOR_SLEEP_HOURS). This is the one constant that moves anchor.end
  // but no notification instant — an isolated edit to ANCHOR_SLEEP_HOURS → RED.
  expect(anchor.end.getTime()).toBe(ms(expected.anchorEnd));
  expect(anchor.end.getTime() - anchor.start.getTime()).toBe(ANCHOR_SLEEP_HOURS * HOUR);

  // ── F8 anti-regression: the 4h anchor sits strictly WITHIN the ~8h window ────
  // This is the invariant AnchorSleepCard now relies on to show a truthful "4h
  // core" primary row plus a wider "Full sleep window" context line. anchor.start
  // === sleepWindow.start is already pinned above (Layer 1 (a)); here we pin the
  // CLOSING edge and the strict LENGTH ordering so the card's primary 4h block can
  // never silently widen back to the 8h window (the original three-way drift),
  // for BOTH fixtures.
  expect(anchor.end.getTime()).toBeLessThanOrEqual(transition.sleepWindow.end.getTime());
  expect(anchor.end.getTime() - anchor.start.getTime()).toBeLessThan(
    transition.sleepWindow.end.getTime() - transition.sleepWindow.start.getTime(),
  );

  // ── F8 anti-regression: the nf-anchor-sleep COPY states ANCHOR_SLEEP_HOURS ───
  // The reminder body coaches "hold this {N}h core-sleep window"; the card's
  // primary label says "(4h core)". Parse the digit out of the shipped body and
  // pin it to ANCHOR_SLEEP_HOURS so the copy, the constant, and the card stay one
  // story — an edit to either the constant or the body text → RED.
  const anchorReminder = buildShiftReminders(shift).find((r) => r.id === 'nf-anchor-sleep');
  expect(anchorReminder).toBeDefined();
  const bodyHours = anchorReminder!.body.match(/(\d+)h/);
  expect(bodyHours).not.toBeNull();
  expect(Number(bodyHours![1])).toBe(ANCHOR_SLEEP_HOURS);
}

describe('circadian engine integrity (anchor ↔ light ↔ reminders) — shared shift', () => {
  describe('overnight shift (22:00 → 06:00 the NEXT calendar day)', () => {
    // The shared fixed overnight shift from the work-item: end is on the next
    // calendar day, exercising the night-worker case across midnight.
    const SHIFT: ShiftLike = {
      startTime: '2026-06-13T22:00:00.000Z',
      endTime: '2026-06-14T06:00:00.000Z',
    };
    // Documented contract instants (hard literals, NOT derived from the consts):
    //   sleepOpen        = end + 1h                        → 07:00 next day
    //   avoidLightStart  = sleepOpen − 2h (blue-blocker)   → 05:00 next day
    //   seekLightStart   = start + 0h                      → 22:00 (shift start)
    //   anchorEnd        = sleepOpen + 4h (anchor length)  → 11:00 next day
    const EXPECTED: ContractInstants = {
      sleepOpen: '2026-06-14T07:00:00.000Z',
      avoidLightStart: '2026-06-14T05:00:00.000Z',
      seekLightStart: '2026-06-13T22:00:00.000Z',
      anchorEnd: '2026-06-14T11:00:00.000Z',
    };

    test('all four helpers agree on the exact UTC instants', () => {
      assertEngineTriangle(SHIFT, EXPECTED);
    });
  });

  describe('day shift (07:00 → 19:00 same calendar day)', () => {
    // The offsets are absolute-instant Date math, not wall-clock, so the triangle
    // must ALSO close for a same-day shift — guards against a regression that
    // only happened to line up across a midnight boundary.
    const SHIFT: ShiftLike = {
      startTime: '2026-01-02T07:00:00.000Z',
      endTime: '2026-01-02T19:00:00.000Z',
    };
    // Same documented contract, same-day fixture:
    //   sleepOpen = 20:00, avoidLightStart = 18:00, seekLightStart = 07:00,
    //   anchorEnd = 00:00 the NEXT day (sleepOpen 20:00 + 4h).
    const EXPECTED: ContractInstants = {
      sleepOpen: '2026-01-02T20:00:00.000Z',
      avoidLightStart: '2026-01-02T18:00:00.000Z',
      seekLightStart: '2026-01-02T07:00:00.000Z',
      anchorEnd: '2026-01-03T00:00:00.000Z',
    };

    test('all four helpers agree on the exact UTC instants', () => {
      assertEngineTriangle(SHIFT, EXPECTED);
    });
  });

  describe('engine constants are pinned to their documented magnitudes', () => {
    // The literal contract instants above encode these exact offsets/lengths.
    // Pinning the named constants directly turns an isolated VALUE edit into a
    // RED test that names the offending constant — complementing the instant
    // assertions, which catch the same edit via the shifted timeline. This is
    // also where the imported OFFSETS symbol is anchored: change any of these and
    // the contract literals above would no longer describe the engine's output.
    test('OFFSETS match the contract the fixtures encode', () => {
      expect(OFFSETS.sleepStartAfterEnd).toBe(1); // sleepWindow.start = end + 1h
      expect(OFFSETS.brightLightStartAfterStart).toBe(0); // seekLight.start = start + 0h
    });

    test('BLUE_BLOCKER_LEAD_HOURS and ANCHOR_SLEEP_HOURS match the contract', () => {
      expect(BLUE_BLOCKER_LEAD_HOURS).toBe(2); // avoidLight.start = sleepOpen − 2h
      expect(ANCHOR_SLEEP_HOURS).toBe(4); // anchor.end = sleepOpen + 4h
    });
  });
});
