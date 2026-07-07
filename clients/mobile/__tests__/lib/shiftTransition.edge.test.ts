/**
 * shiftTransition.edge.test.ts — EDGE-CONTRACT tripwire for the shared engine.
 *
 * `computeShiftTransition` (src/lib/shiftTransition.ts) is the ROOT of the whole
 * circadian triangle: computeAnchorSleep, computeLightPlan, and buildShiftReminders
 * all re-derive their instants from the SAME `OFFSETS` and the same absolute-instant
 * Date math. The cross-helper TRIANGLE — that those four producers agree on the
 * shared instants (sleepWindow.start / brightLightWindow.start and the constants
 * that feed them) — is already pinned by circadianEngineParity.test.ts.
 *
 * This file is the COMPLEMENTARY, DISJOINT half: a dedicated edge-contract on the
 * BASE engine in isolation. It owns the parts the triangle test deliberately does
 * NOT assert, so the two suites never overlap:
 *
 *   1. THROW contract — `computeShiftTransition` must REJECT malformed input
 *      (missing / empty / unparseable times) by throwing, never silently emit an
 *      Invalid Date that propagates NaN into every anchor. (Not asserted anywhere
 *      else.)
 *   2. ALL THREE engine anchors pinned to hard UTC literals via getTime():
 *      caffeineCutoff, the FULL sleepWindow (start AND end), and the FULL
 *      brightLightWindow (start AND end). The triangle test only consumes
 *      sleepWindow.START and brightLightWindow.START; caffeineCutoff,
 *      sleepWindow.END, and brightLightWindow.END are pinned ONLY here.
 *   3. PURITY — repeated calls yield equal getTime() (no Date.now, no hidden state).
 *   4. ABSOLUTE-INSTANT math across a calendar boundary — a same-day day shift whose
 *      sleepWindow.end lands on the NEXT calendar day, proving wall-clock is never
 *      consulted.
 *   5. ALL FIVE OFFSETS magnitudes pinned. The triangle test pins only the two that
 *      feed shared instants (sleepStartAfterEnd, brightLightStartAfterStart); the
 *      other three (caffeineCutoffBeforeEnd, sleepEndAfterEnd, brightLightEndAfterStart)
 *      are pinned ONLY here, so an isolated edit to ANY offset fails loudly in one
 *      of the two suites.
 *
 * This is a NEW, test-ONLY file. It imports only the shipped lib helper + its
 * OFFSETS/type, owns no source file, modifies nothing, and does not touch
 * circadianEngineParity.test.ts. The engine is pure (no React / native / network /
 * Date.now), so the suite needs no mocks; fixtures are UTC so the absolute-instant
 * arithmetic is deterministic regardless of the machine timezone, and we assert
 * with getTime() so equalities hold across a midnight boundary.
 */
import { computeShiftTransition, OFFSETS, type ShiftLike } from '@/lib/shiftTransition';

const HOUR = 3_600_000;

describe('computeShiftTransition — edge contract (base engine, isolated)', () => {
  describe('throws on malformed input — never returns NaN / Invalid Date', () => {
    // The engine routes both fields through parseInstant, whose job is to reject
    // bad input LOUDLY rather than let `new Date(garbage)` become an Invalid Date
    // (getTime() === NaN) that would silently poison every downstream anchor.

    test('throws when startTime is missing', () => {
      // endTime present, startTime absent — the missing field must be named.
      expect(() => computeShiftTransition({ endTime: '2026-01-02T06:00:00Z' } as unknown as ShiftLike)).toThrow(
        /startTime/,
      );
    });

    test('throws when endTime is missing', () => {
      expect(() => computeShiftTransition({ startTime: '2026-01-01T22:00:00Z' } as unknown as ShiftLike)).toThrow(
        /endTime/,
      );
    });

    test('throws on empty-string startTime', () => {
      expect(() =>
        computeShiftTransition({ startTime: '', endTime: '2026-01-02T06:00:00Z' }),
      ).toThrow(/startTime/);
    });

    test('throws on empty-string endTime', () => {
      expect(() =>
        computeShiftTransition({ startTime: '2026-01-01T22:00:00Z', endTime: '' }),
      ).toThrow(/endTime/);
    });

    test('throws on a whitespace-only time (trimmed, treated as missing)', () => {
      expect(() =>
        computeShiftTransition({ startTime: '   ', endTime: '2026-01-02T06:00:00Z' }),
      ).toThrow(/startTime/);
    });

    test('throws on an unparseable ISO string ("nonsense")', () => {
      // The classic "Invalid Date" trap: new Date('nonsense').getTime() is NaN.
      // The engine must throw, naming the offending field and echoing the value.
      expect(() =>
        computeShiftTransition({ startTime: '2026-01-01T22:00:00Z', endTime: 'nonsense' }),
      ).toThrow(/endTime/);
    });

    test('never returns an object whose anchors carry NaN time', () => {
      // Belt-and-braces: assert the failure mode is a THROW, not a returned object
      // with NaN-bearing Dates. A regression that swapped throw → silent Invalid
      // Date would make this block (which expects a throw) go RED.
      let result: ReturnType<typeof computeShiftTransition> | undefined;
      try {
        result = computeShiftTransition({ startTime: 'nonsense', endTime: 'also-nonsense' });
      } catch {
        result = undefined;
      }
      expect(result).toBeUndefined();
    });
  });

  describe('overnight fixture (22:00 → 06:00 the NEXT calendar day) — exact UTC instants', () => {
    // A fixed UTC overnight shift: end is on the next calendar day, the night-worker
    // case. Every anchor is asserted via getTime() against a HARD UTC literal that is
    // NOT re-derived from OFFSETS — so an isolated offset edit shifts the engine off
    // these literals and turns the suite RED.
    const SHIFT: ShiftLike = {
      startTime: '2026-01-01T22:00:00.000Z',
      endTime: '2026-01-02T06:00:00.000Z',
    };
    // Documented contract instants (hard literals):
    //   caffeineCutoff          = end   − 6h → 2026-01-02T00:00:00Z
    //   sleepWindow.start       = end   + 1h → 2026-01-02T07:00:00Z
    //   sleepWindow.end         = end   + 9h → 2026-01-02T15:00:00Z
    //   brightLightWindow.start = start + 0h → 2026-01-01T22:00:00Z
    //   brightLightWindow.end   = start + 2h → 2026-01-02T00:00:00Z
    const EXPECTED = {
      caffeineCutoff: '2026-01-02T00:00:00.000Z',
      sleepStart: '2026-01-02T07:00:00.000Z',
      sleepEnd: '2026-01-02T15:00:00.000Z',
      brightStart: '2026-01-01T22:00:00.000Z',
      brightEnd: '2026-01-02T00:00:00.000Z',
    } as const;

    const ms = (iso: string) => new Date(iso).getTime();

    test('caffeineCutoff === end − 6h', () => {
      const { caffeineCutoff } = computeShiftTransition(SHIFT);
      expect(caffeineCutoff.getTime()).toBe(ms(EXPECTED.caffeineCutoff));
      // Cross-check the magnitude against the shift end directly (defence in depth).
      expect(ms(SHIFT.endTime) - caffeineCutoff.getTime()).toBe(6 * HOUR);
    });

    test('sleepWindow.start === end + 1h and sleepWindow.end === end + 9h', () => {
      const { sleepWindow } = computeShiftTransition(SHIFT);
      expect(sleepWindow.start.getTime()).toBe(ms(EXPECTED.sleepStart));
      expect(sleepWindow.end.getTime()).toBe(ms(EXPECTED.sleepEnd));
      // The ~8h in-bed window length the recovery card relies on.
      expect(sleepWindow.end.getTime() - sleepWindow.start.getTime()).toBe(8 * HOUR);
    });

    test('brightLightWindow.start === start + 0h and brightLightWindow.end === start + 2h', () => {
      const { brightLightWindow } = computeShiftTransition(SHIFT);
      expect(brightLightWindow.start.getTime()).toBe(ms(EXPECTED.brightStart));
      expect(brightLightWindow.end.getTime()).toBe(ms(EXPECTED.brightEnd));
      // Bright-light anchoring runs the first 2h of the shift.
      expect(brightLightWindow.end.getTime() - brightLightWindow.start.getTime()).toBe(2 * HOUR);
      // start + 0h means the window opens exactly at clock-in.
      expect(brightLightWindow.start.getTime()).toBe(ms(SHIFT.startTime));
    });

    test('is PURE — repeated calls yield equal instants (no Date.now / hidden state)', () => {
      const a = computeShiftTransition(SHIFT);
      const b = computeShiftTransition(SHIFT);
      expect(b.caffeineCutoff.getTime()).toBe(a.caffeineCutoff.getTime());
      expect(b.sleepWindow.start.getTime()).toBe(a.sleepWindow.start.getTime());
      expect(b.sleepWindow.end.getTime()).toBe(a.sleepWindow.end.getTime());
      expect(b.brightLightWindow.start.getTime()).toBe(a.brightLightWindow.start.getTime());
      expect(b.brightLightWindow.end.getTime()).toBe(a.brightLightWindow.end.getTime());
    });

    test('returns FRESH Date objects each call (caller can mutate without aliasing)', () => {
      // offsetHours builds a new Date per call; two calls must not share references,
      // so a consumer mutating one result can't corrupt a cached engine output.
      const a = computeShiftTransition(SHIFT);
      const b = computeShiftTransition(SHIFT);
      expect(b.sleepWindow.start).not.toBe(a.sleepWindow.start);
      expect(b.caffeineCutoff).not.toBe(a.caffeineCutoff);
    });
  });

  describe('day-shift fixture (07:00 → 19:00 same calendar day) — absolute-instant, crosses midnight', () => {
    // The offsets are absolute-instant Date math, never wall-clock. A same-day shift
    // whose sleepWindow.end (end + 9h) lands on the NEXT calendar day proves the
    // engine adds hours to the instant rather than clamping to the shift's own day.
    const SHIFT: ShiftLike = {
      startTime: '2026-03-10T07:00:00.000Z',
      endTime: '2026-03-10T19:00:00.000Z',
    };
    //   caffeineCutoff          = 19:00 − 6h → 2026-03-10T13:00:00Z (same day)
    //   sleepWindow.start       = 19:00 + 1h → 2026-03-10T20:00:00Z (same day)
    //   sleepWindow.end         = 19:00 + 9h → 2026-03-11T04:00:00Z (NEXT day)
    //   brightLightWindow.start = 07:00 + 0h → 2026-03-10T07:00:00Z
    //   brightLightWindow.end   = 07:00 + 2h → 2026-03-10T09:00:00Z
    const EXPECTED = {
      caffeineCutoff: '2026-03-10T13:00:00.000Z',
      sleepStart: '2026-03-10T20:00:00.000Z',
      sleepEnd: '2026-03-11T04:00:00.000Z',
      brightStart: '2026-03-10T07:00:00.000Z',
      brightEnd: '2026-03-10T09:00:00.000Z',
    } as const;

    const ms = (iso: string) => new Date(iso).getTime();

    test('all anchors hit their exact UTC literals', () => {
      const { caffeineCutoff, sleepWindow, brightLightWindow } = computeShiftTransition(SHIFT);
      expect(caffeineCutoff.getTime()).toBe(ms(EXPECTED.caffeineCutoff));
      expect(sleepWindow.start.getTime()).toBe(ms(EXPECTED.sleepStart));
      expect(sleepWindow.end.getTime()).toBe(ms(EXPECTED.sleepEnd));
      expect(brightLightWindow.start.getTime()).toBe(ms(EXPECTED.brightStart));
      expect(brightLightWindow.end.getTime()).toBe(ms(EXPECTED.brightEnd));
    });

    test('sleepWindow.end falls on the NEXT calendar day (UTC date rolls 10 → 11)', () => {
      const { sleepWindow } = computeShiftTransition(SHIFT);
      // Same-day shift, yet the close of the recovery window is the next UTC date.
      expect(sleepWindow.start.getUTCDate()).toBe(10);
      expect(sleepWindow.end.getUTCDate()).toBe(11);
      expect(sleepWindow.end.getUTCMonth()).toBe(2); // March (0-indexed)
    });
  });

  describe('OFFSETS magnitudes pinned to documented values', () => {
    // The literal contract instants in BOTH fixtures above encode these exact
    // offsets. Pinning each named magnitude directly turns an isolated VALUE edit
    // into a RED test naming the offending offset — complementing the instant
    // assertions (which catch the same edit via the shifted timeline).
    //
    // This is COMPLEMENTARY to circadianEngineParity.test.ts, NOT a duplicate: that
    // suite pins only the two offsets feeding shared cross-helper instants
    // (sleepStartAfterEnd, brightLightStartAfterStart). The other three
    // (caffeineCutoffBeforeEnd, sleepEndAfterEnd, brightLightEndAfterStart) feed
    // engine-only anchors and are pinned ONLY here — so an isolated edit to ANY of
    // the five fails loudly in one of the two suites.
    test('caffeineCutoffBeforeEnd === -6 (caffeineCutoff = end − 6h)', () => {
      expect(OFFSETS.caffeineCutoffBeforeEnd).toBe(-6);
    });

    test('sleepStartAfterEnd === 1 (sleepWindow.start = end + 1h)', () => {
      expect(OFFSETS.sleepStartAfterEnd).toBe(1);
    });

    test('sleepEndAfterEnd === 9 (sleepWindow.end = end + 9h → ~8h in bed)', () => {
      expect(OFFSETS.sleepEndAfterEnd).toBe(9);
    });

    test('brightLightStartAfterStart === 0 (brightLightWindow.start = start + 0h)', () => {
      expect(OFFSETS.brightLightStartAfterStart).toBe(0);
    });

    test('brightLightEndAfterStart === 2 (brightLightWindow.end = start + 2h)', () => {
      expect(OFFSETS.brightLightEndAfterStart).toBe(2);
    });
  });
});
