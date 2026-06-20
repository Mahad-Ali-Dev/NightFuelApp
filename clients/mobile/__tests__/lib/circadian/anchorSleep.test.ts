/**
 * Tests for the pure rotating-shift ANCHOR-SLEEP helper in
 * src/lib/circadian/anchorSleep.ts.
 *
 * `computeAnchorSleep(shift)` derives the fixed CORE-sleep block a rotating-shift
 * worker holds constant across a rotation. It REUSES `computeShiftTransition`
 * (so it never re-derives offsets or re-parses ISO), opening the anchor exactly
 * at the recovery-sleep window's start and running it for `ANCHOR_SLEEP_HOURS`.
 *
 * What's pinned here:
 *   (a) exact UTC anchor instants for a fixed overnight shift (via getTime());
 *   (b) the "held constant" stabilizing property — anchor.start ===
 *       computeShiftTransition(shift).sleepWindow.start AND the anchor duration
 *       === ANCHOR_SLEEP_HOURS*HOUR — across two DIFFERENT shift lengths;
 *   (c) malformed / missing ISO throws (inherited from computeShiftTransition);
 *   (d) OFFSETS lockstep — anchor.start === end + OFFSETS.sleepStartAfterEnd*HOUR,
 *       so an offset edit breaks this test loudly.
 *
 * The helper is pure (no React / native / network / Date.now), so the suite
 * needs no mocks. Timestamps are expressed in UTC for deterministic instant
 * math (the assertions compare absolute getTime() values, which are
 * timezone-independent).
 */
import { computeAnchorSleep, ANCHOR_SLEEP_HOURS } from '@/lib/circadian/anchorSleep';
import { computeShiftTransition, OFFSETS } from '@/lib/shiftTransition';

const HOUR = 3_600_000;

describe('computeAnchorSleep', () => {
  // The one new constant: the fixed core-sleep block length.
  test('ANCHOR_SLEEP_HOURS is the fixed 4h core block', () => {
    expect(ANCHOR_SLEEP_HOURS).toBe(4);
  });

  describe('(a) exact UTC anchor instants for a fixed overnight shift', () => {
    // Night worker: 22:00 → 06:00 next calendar day (end < start in wall-clock).
    const START = '2026-06-13T22:00:00.000Z';
    const END = '2026-06-14T06:00:00.000Z';
    const endMs = new Date(END).getTime();
    const a = () => computeAnchorSleep({ startTime: START, endTime: END });

    test('anchor.start === sleepWindow.start === endTime + 1h', () => {
      // sleepStartAfterEnd is +1h after clock-out.
      expect(a().anchor.start.getTime()).toBe(endMs + 1 * HOUR);
      expect(a().anchor.start.toISOString()).toBe('2026-06-14T07:00:00.000Z');
    });

    test('anchor.end === anchor.start + ANCHOR_SLEEP_HOURS (== endTime + 5h)', () => {
      expect(a().anchor.end.getTime()).toBe(endMs + (1 + ANCHOR_SLEEP_HOURS) * HOUR);
      expect(a().anchor.end.toISOString()).toBe('2026-06-14T11:00:00.000Z');
    });
  });

  describe('(b) stabilizing property — core block held constant across shift lengths', () => {
    // Two shifts of DIFFERENT length pin that the anchor block is the same fixed
    // duration and is always anchored to the recovery-sleep opening, regardless
    // of how long the shift itself runs.
    const SHIFTS = [
      // 8h overnight shift.
      { startTime: '2026-06-13T22:00:00.000Z', endTime: '2026-06-14T06:00:00.000Z' },
      // 12h day shift (different length, different calendar day).
      { startTime: '2026-01-02T07:00:00.000Z', endTime: '2026-01-02T19:00:00.000Z' },
    ];

    test('anchor.start === computeShiftTransition(shift).sleepWindow.start for both', () => {
      for (const shift of SHIFTS) {
        const { anchor } = computeAnchorSleep(shift);
        const { sleepWindow } = computeShiftTransition(shift);
        expect(anchor.start.getTime()).toBe(sleepWindow.start.getTime());
      }
    });

    test('anchor duration === ANCHOR_SLEEP_HOURS*HOUR for both (constant block)', () => {
      for (const shift of SHIFTS) {
        const { anchor } = computeAnchorSleep(shift);
        expect(anchor.end.getTime() - anchor.start.getTime()).toBe(ANCHOR_SLEEP_HOURS * HOUR);
      }
    });

    test('the core block sits strictly within the ~8h sleepWindow (anchor.end <= sleepWindow.end)', () => {
      for (const shift of SHIFTS) {
        const { anchor } = computeAnchorSleep(shift);
        const { sleepWindow } = computeShiftTransition(shift);
        // start is the window opening; end never spills past the window close.
        expect(anchor.start.getTime()).toBe(sleepWindow.start.getTime());
        expect(anchor.end.getTime()).toBeLessThanOrEqual(sleepWindow.end.getTime());
        // And the anchor is genuinely SHORTER than the full window.
        expect(anchor.end.getTime()).toBeLessThan(sleepWindow.end.getTime());
      }
    });

    test('is pure — repeated calls produce equal instants', () => {
      const shift = SHIFTS[0]!;
      const x = computeAnchorSleep(shift);
      const y = computeAnchorSleep(shift);
      expect(x.anchor.start.getTime()).toBe(y.anchor.start.getTime());
      expect(x.anchor.end.getTime()).toBe(y.anchor.end.getTime());
    });
  });

  describe('(c) malformed / missing ISO throws (inherited from computeShiftTransition)', () => {
    test('throws on malformed start and empty end', () => {
      expect(() => computeAnchorSleep({ startTime: 'nope', endTime: '' } as any)).toThrow();
    });

    test('throws when endTime is unparseable garbage', () => {
      expect(() =>
        computeAnchorSleep({ startTime: '2026-06-13T22:00:00.000Z', endTime: 'not-a-date' }),
      ).toThrow(/endTime/);
    });

    test('throws when a field is missing entirely', () => {
      expect(() => computeAnchorSleep({ startTime: '2026-06-13T22:00:00.000Z' } as any)).toThrow(/endTime/);
    });
  });

  describe('(d) OFFSETS lockstep — an offset edit breaks this test', () => {
    const START = '2026-06-13T22:00:00.000Z';
    const END = '2026-06-14T06:00:00.000Z';
    const endMs = new Date(END).getTime();

    test('anchor.start === end + OFFSETS.sleepStartAfterEnd * HOUR', () => {
      const { anchor } = computeAnchorSleep({ startTime: START, endTime: END });
      expect(anchor.start.getTime()).toBe(endMs + OFFSETS.sleepStartAfterEnd * HOUR);
    });

    test('anchor.end === end + (OFFSETS.sleepStartAfterEnd + ANCHOR_SLEEP_HOURS) * HOUR', () => {
      const { anchor } = computeAnchorSleep({ startTime: START, endTime: END });
      expect(anchor.end.getTime()).toBe(endMs + (OFFSETS.sleepStartAfterEnd + ANCHOR_SLEEP_HOURS) * HOUR);
    });
  });
});
