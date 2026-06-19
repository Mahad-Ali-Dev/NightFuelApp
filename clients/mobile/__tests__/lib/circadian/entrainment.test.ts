/**
 * Tests for the pure circadian-entrainment helpers in
 * src/lib/circadian/entrainment.ts.
 *
 * Two things are pinned here:
 *
 *   1. `entrainmentAdvice(score)` — the score-gauge advice copy. These tests
 *      lock the three EXACT strings the circadian screen renders and the >=80 /
 *      <80 / null branch boundaries, so the copy can't drift when a future
 *      sprint wires the screen to call this helper.
 *
 *   2. `deriveWindowsFromShift(shift)` — the biological-window fallback math
 *      (melatonin = end + 1h, caffeine = end − 6h, insulin = start, peakTemp =
 *      start). These tests assert the exact absolute instants for a fixed input
 *      clock and the exact formatted clock strings under a fixed locale +
 *      `timeZone: 'UTC'` (so the assertions are machine-independent).
 *
 * Both functions are pure (no React / native / network / Date.now), so the
 * suite needs no mocks. Timestamps are expressed in UTC.
 */
import {
  entrainmentAdvice,
  deriveWindowsFromShift,
  ENTRAINMENT_ADVICE,
  GOOD_ALIGNMENT_THRESHOLD,
  WINDOW_OFFSETS,
} from '@/lib/circadian/entrainment';

const HOUR = 3_600_000;

// The three advice strings copied VERBATIM from circadian.tsx's score-gauge
// ternary (the entrainmentScore advice block). If anyone edits the screen copy
// without updating the helper (or vice-versa), these literals break loudly.
const GOOD = 'Good alignment. Try getting 15m of sunlight upon waking to improve this score.';
const IMPROVE = 'Room for improvement. Focus on consistent sleep/wake times.';
const NONE = 'Log more shifts to calculate your score.';

describe('entrainmentAdvice', () => {
  test('the exported ENTRAINMENT_ADVICE strings match the screen copy verbatim', () => {
    expect(ENTRAINMENT_ADVICE.good).toBe(GOOD);
    expect(ENTRAINMENT_ADVICE.improve).toBe(IMPROVE);
    expect(ENTRAINMENT_ADVICE.none).toBe(NONE);
  });

  test('the good-alignment threshold is 80', () => {
    expect(GOOD_ALIGNMENT_THRESHOLD).toBe(80);
  });

  describe('null score → log-more-shifts copy', () => {
    test('returns the exact "log more shifts" string for null', () => {
      expect(entrainmentAdvice(null)).toBe(NONE);
    });
  });

  describe('finite score >= 80 → good-alignment copy', () => {
    test('exactly 80 (the boundary) is "good alignment"', () => {
      // The screen uses `>= 80`, so 80 itself is the GOOD branch, not improve.
      expect(entrainmentAdvice(80)).toBe(GOOD);
    });

    test('above 80 is "good alignment"', () => {
      expect(entrainmentAdvice(81)).toBe(GOOD);
      expect(entrainmentAdvice(95)).toBe(GOOD);
      expect(entrainmentAdvice(100)).toBe(GOOD);
    });
  });

  describe('finite score < 80 → room-for-improvement copy', () => {
    test('just below the boundary (79) is "room for improvement"', () => {
      expect(entrainmentAdvice(79)).toBe(IMPROVE);
    });

    test('a low/zero score is "room for improvement", never "log more shifts"', () => {
      // 0 is a finite score (not null), so it must NOT fall through to the
      // null-only "log more shifts" copy.
      expect(entrainmentAdvice(0)).toBe(IMPROVE);
      expect(entrainmentAdvice(50)).toBe(IMPROVE);
    });
  });

  test('is pure — repeated calls return the same string', () => {
    expect(entrainmentAdvice(80)).toBe(entrainmentAdvice(80));
    expect(entrainmentAdvice(10)).toBe(entrainmentAdvice(10));
    expect(entrainmentAdvice(null)).toBe(entrainmentAdvice(null));
  });
});

describe('deriveWindowsFromShift', () => {
  // Fixed input clock — an overnight shift (22:00 → 06:00 next calendar day),
  // the night-worker case. UTC so the instant math is deterministic.
  const START = '2026-06-13T22:00:00.000Z';
  const END = '2026-06-14T06:00:00.000Z';
  const startMs = new Date(START).getTime();
  const endMs = new Date(END).getTime();

  // Format deterministically: explicit locale + UTC so the clock strings don't
  // depend on the machine's timezone.
  const UTC_OPTS = { locale: 'en-US', timeOptions: { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' } as const };
  const d = () => deriveWindowsFromShift({ startTime: START, endTime: END }, UTC_OPTS);

  test('the exported WINDOW_OFFSETS mirror the screen fallback (end+1h, end−6h, start, start)', () => {
    expect(WINDOW_OFFSETS.melatoninAfterEnd).toBe(1);
    expect(WINDOW_OFFSETS.caffeineBeforeEnd).toBe(-6);
    expect(WINDOW_OFFSETS.insulinAfterStart).toBe(0);
    expect(WINDOW_OFFSETS.peakTempAfterStart).toBe(0);
  });

  describe('exact instants for the fixed input clock', () => {
    test('melatoninStart = endTime + 1h', () => {
      expect(d().instants.melatoninStart.getTime()).toBe(endMs + 1 * HOUR);
      expect(d().instants.melatoninStart.toISOString()).toBe('2026-06-14T07:00:00.000Z');
    });

    test('caffeineCutoff = endTime − 6h', () => {
      expect(d().instants.caffeineCutoff.getTime()).toBe(endMs - 6 * HOUR);
      expect(d().instants.caffeineCutoff.toISOString()).toBe('2026-06-14T00:00:00.000Z');
    });

    test('insulinStart = startTime', () => {
      expect(d().instants.insulinStart.getTime()).toBe(startMs);
      expect(d().instants.insulinStart.toISOString()).toBe('2026-06-13T22:00:00.000Z');
    });

    test('peakTemp = startTime (same anchor as insulinStart)', () => {
      expect(d().instants.peakTemp.getTime()).toBe(startMs);
      expect(d().instants.peakTemp.toISOString()).toBe('2026-06-13T22:00:00.000Z');
    });
  });

  describe('exact formatted clock strings (locale en-US, UTC)', () => {
    test('melatoninStart formats to 07:00 AM', () => {
      expect(d().melatoninStart).toBe('07:00 AM');
    });

    test('caffeineCutoff formats to 12:00 AM (midnight, the next day)', () => {
      expect(d().caffeineCutoff).toBe('12:00 AM');
    });

    test('insulinStart formats to 10:00 PM', () => {
      expect(d().insulinStart).toBe('10:00 PM');
    });

    test('peakTemp formats to 10:00 PM', () => {
      expect(d().peakTemp).toBe('10:00 PM');
    });
  });

  describe('a day shift (07:00 → 19:00 same calendar day)', () => {
    const DAY_START = '2026-01-02T07:00:00.000Z';
    const DAY_END = '2026-01-02T19:00:00.000Z';
    const dayStartMs = new Date(DAY_START).getTime();
    const dayEndMs = new Date(DAY_END).getTime();
    const day = () => deriveWindowsFromShift({ startTime: DAY_START, endTime: DAY_END }, UTC_OPTS);

    test('instants follow the same offsets regardless of wall-clock window', () => {
      expect(day().instants.melatoninStart.getTime()).toBe(dayEndMs + 1 * HOUR); // 20:00
      expect(day().instants.caffeineCutoff.getTime()).toBe(dayEndMs - 6 * HOUR); // 13:00
      expect(day().instants.insulinStart.getTime()).toBe(dayStartMs); // 07:00
      expect(day().instants.peakTemp.getTime()).toBe(dayStartMs); // 07:00
    });

    test('formats to the expected day-shift clock strings', () => {
      expect(day().melatoninStart).toBe('08:00 PM');
      expect(day().caffeineCutoff).toBe('01:00 PM');
      expect(day().insulinStart).toBe('07:00 AM');
      expect(day().peakTemp).toBe('07:00 AM');
    });
  });

  test('accepts Date inputs as well as ISO strings (same result)', () => {
    const fromStrings = deriveWindowsFromShift({ startTime: START, endTime: END }, UTC_OPTS);
    const fromDates = deriveWindowsFromShift({ startTime: new Date(START), endTime: new Date(END) }, UTC_OPTS);
    expect(fromDates.instants.melatoninStart.getTime()).toBe(fromStrings.instants.melatoninStart.getTime());
    expect(fromDates.instants.caffeineCutoff.getTime()).toBe(fromStrings.instants.caffeineCutoff.getTime());
    expect(fromDates.instants.insulinStart.getTime()).toBe(fromStrings.instants.insulinStart.getTime());
    expect(fromDates.instants.peakTemp.getTime()).toBe(fromStrings.instants.peakTemp.getTime());
  });

  test('is pure — repeated calls produce equal instants', () => {
    const a = d();
    const b = d();
    expect(a.instants.melatoninStart.getTime()).toBe(b.instants.melatoninStart.getTime());
    expect(a.instants.caffeineCutoff.getTime()).toBe(b.instants.caffeineCutoff.getTime());
    expect(a.instants.insulinStart.getTime()).toBe(b.instants.insulinStart.getTime());
    expect(a.instants.peakTemp.getTime()).toBe(b.instants.peakTemp.getTime());
  });

  describe('malformed timestamps throw (never NaN/"Invalid Date" anchors)', () => {
    test('throws when startTime is an empty string', () => {
      expect(() => deriveWindowsFromShift({ startTime: '', endTime: END })).toThrow(/startTime/);
    });

    test('throws when endTime is unparseable garbage', () => {
      expect(() => deriveWindowsFromShift({ startTime: START, endTime: 'not-a-date' })).toThrow(/endTime/);
    });

    test('throws when a field is missing entirely', () => {
      expect(() => deriveWindowsFromShift({ startTime: START } as any)).toThrow(/endTime/);
    });

    test('throws on an Invalid Date instance rather than emitting NaN', () => {
      expect(() => deriveWindowsFromShift({ startTime: new Date('nope'), endTime: END })).toThrow(/startTime/);
    });
  });
});
