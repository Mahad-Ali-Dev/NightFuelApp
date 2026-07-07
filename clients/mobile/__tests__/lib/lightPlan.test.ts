/**
 * Tests for computeLightPlan — the pure Light-Exposure Coaching math in
 * src/lib/lightPlan.ts. It maps a shift's ISO start/end timestamps to two light
 * windows: when to SEEK bright light and when to AVOID light (the pre-sleep
 * blue-blocker lead).
 *
 * computeLightPlan deliberately routes through computeShiftTransition rather
 * than re-deriving any instants, so the two modules stay in lockstep. These
 * tests PIN that relationship bit-identically:
 *
 *   - seekLight        === computeShiftTransition(shift).brightLightWindow
 *   - avoidLight.end   === computeShiftTransition(shift).sleepWindow.start
 *   - avoidLight.start === sleepWindow.start - 2h   (BLUE_BLOCKER_LEAD_HOURS)
 *                         and is strictly before avoidLight.end
 *
 * If a future edit drifts the OFFSETS, the brightLightWindow, or the blue-
 * blocker lead in EITHER module without the other, these equalities break and
 * the suite turns RED — exactly the regression fence the card relies on.
 *
 * Like shiftTransition.test.ts, the function is pure (no React / native /
 * network / Date.now), so it needs no mocks. Timestamps are expressed in UTC so
 * the absolute-instant arithmetic is deterministic regardless of the machine's
 * timezone.
 *
 * Headline cases:
 *   1. a day shift          (start and end on the same calendar day)
 *   2. an overnight shift   (end on the NEXT calendar day — the night-worker case)
 *   3. purity               (repeated calls produce equal instants)
 *   4. malformed timestamps (missing / unparseable → throws, never NaN windows)
 */
import { computeLightPlan } from '@/lib/lightPlan';
import { computeShiftTransition } from '@/lib/shiftTransition';

const HOUR = 3_600_000;

describe('computeLightPlan', () => {
  describe('day shift (07:00 → 19:00 same calendar day)', () => {
    const START = '2026-01-02T07:00:00.000Z';
    const END = '2026-01-02T19:00:00.000Z';

    const shift = { startTime: START, endTime: END };
    const p = () => computeLightPlan(shift);

    test('every returned field is a valid Date (never NaN)', () => {
      const { seekLight, avoidLight } = p();
      for (const d of [seekLight.start, seekLight.end, avoidLight.start, avoidLight.end]) {
        expect(d).toBeInstanceOf(Date);
        expect(Number.isNaN(d.getTime())).toBe(false);
      }
    });

    test('seekLight === computeShiftTransition.brightLightWindow (start & end instants identical)', () => {
      const { seekLight } = p();
      const { brightLightWindow } = computeShiftTransition(shift);
      expect(seekLight.start.getTime()).toBe(brightLightWindow.start.getTime());
      expect(seekLight.end.getTime()).toBe(brightLightWindow.end.getTime());
    });

    test('avoidLight.end === sleepWindow.start (locks the dim-down to the sleep opportunity)', () => {
      const { avoidLight } = p();
      const { sleepWindow } = computeShiftTransition(shift);
      expect(avoidLight.end.getTime()).toBe(sleepWindow.start.getTime());
    });

    test('avoidLight.start === sleepWindow.start - 2h and is strictly before avoidLight.end', () => {
      const { avoidLight } = p();
      const { sleepWindow } = computeShiftTransition(shift);
      expect(avoidLight.start.getTime()).toBe(sleepWindow.start.getTime() - 2 * HOUR);
      expect(avoidLight.start.getTime()).toBeLessThan(avoidLight.end.getTime());
      // The window is exactly the 2h blue-blocker lead.
      expect(avoidLight.end.getTime() - avoidLight.start.getTime()).toBe(2 * HOUR);
    });
  });

  describe('overnight shift (22:00 → 06:00 the NEXT calendar day)', () => {
    // The end wall-clock time (06:00) is *earlier* than the start (22:00) and
    // lands on the following date. Because the offsets are absolute-instant Date
    // math, crossing midnight needs no special-casing — the ISO timestamps
    // already encode the correct day. We assert with absolute-instant getTime()
    // math so the equalities hold across the midnight boundary.
    const START = '2026-06-13T22:00:00.000Z';
    const END = '2026-06-14T06:00:00.000Z';
    const startMs = new Date(START).getTime();
    const endMs = new Date(END).getTime();

    const shift = { startTime: START, endTime: END };
    const p = () => computeLightPlan(shift);

    test('every returned field is a valid Date (never NaN)', () => {
      const { seekLight, avoidLight } = p();
      for (const d of [seekLight.start, seekLight.end, avoidLight.start, avoidLight.end]) {
        expect(d).toBeInstanceOf(Date);
        expect(Number.isNaN(d.getTime())).toBe(false);
      }
    });

    test('seekLight === brightLightWindow (sits at the start of the night shift)', () => {
      const { seekLight } = p();
      const { brightLightWindow } = computeShiftTransition(shift);
      expect(seekLight.start.getTime()).toBe(brightLightWindow.start.getTime());
      expect(seekLight.end.getTime()).toBe(brightLightWindow.end.getTime());
      // Anchored to the shift start (22:00) … start + 2h (00:00 next day).
      expect(seekLight.start.getTime()).toBe(startMs);
      expect(seekLight.end.getTime()).toBe(startMs + 2 * HOUR);
    });

    test('avoidLight straddles the morning after clock-out and ends exactly at sleepWindow.start', () => {
      const { avoidLight } = p();
      const { sleepWindow } = computeShiftTransition(shift);
      // sleepWindow.start = end + 1h = 07:00 on 2026-06-14.
      expect(avoidLight.end.getTime()).toBe(sleepWindow.start.getTime());
      expect(avoidLight.end.getTime()).toBe(endMs + 1 * HOUR);
      // 2h dim-down lead → opens at 05:00 on 2026-06-14.
      expect(avoidLight.start.getTime()).toBe(endMs + 1 * HOUR - 2 * HOUR);
      expect(avoidLight.start.getTime()).toBe(endMs - 1 * HOUR);
      expect(avoidLight.start.getTime()).toBeLessThan(avoidLight.end.getTime());
      // Belt-and-braces on the absolute instants across midnight.
      expect(avoidLight.start.toISOString()).toBe('2026-06-14T05:00:00.000Z');
      expect(avoidLight.end.toISOString()).toBe('2026-06-14T07:00:00.000Z');
    });
  });

  describe('purity', () => {
    const shift = { startTime: '2026-06-13T22:00:00.000Z', endTime: '2026-06-14T06:00:00.000Z' };

    test('repeated calls produce equal instants', () => {
      const a = computeLightPlan(shift);
      const b = computeLightPlan(shift);
      expect(a.seekLight.start.getTime()).toBe(b.seekLight.start.getTime());
      expect(a.seekLight.end.getTime()).toBe(b.seekLight.end.getTime());
      expect(a.avoidLight.start.getTime()).toBe(b.avoidLight.start.getTime());
      expect(a.avoidLight.end.getTime()).toBe(b.avoidLight.end.getTime());
    });
  });

  describe('malformed / missing timestamps', () => {
    // computeLightPlan inherits computeShiftTransition's throw-on-malformed-ISO
    // contract (it does not re-parse), so the failure mode is a loud throw the
    // card can catch — never a silent Invalid Date that would render NaN windows.
    test('throws when startTime is an empty string', () => {
      expect(() => computeLightPlan({ startTime: '', endTime: '2026-06-14T06:00:00.000Z' })).toThrow(
        /startTime/,
      );
    });

    test('throws when endTime is unparseable garbage', () => {
      expect(() =>
        computeLightPlan({ startTime: '2026-06-13T22:00:00.000Z', endTime: 'not-a-date' }),
      ).toThrow(/endTime/);
    });

    test('throws when a field is missing entirely (cast past the compile-time type)', () => {
      // Exercise the runtime guard against a malformed object (e.g. a partial
      // API response) — deliberately bypass the compile-time type with a cast.
      expect(() => computeLightPlan({ startTime: '2026-06-13T22:00:00.000Z' } as any)).toThrow(
        /endTime/,
      );
    });

    test('never returns NaN windows — it throws instead', () => {
      expect(() => computeLightPlan({ startTime: 'garbage', endTime: 'garbage' })).toThrow();
    });
  });
});
