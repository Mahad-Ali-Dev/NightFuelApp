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
  deriveEntrainmentScore,
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

/**
 * `deriveEntrainmentScore(signals)` — the genuine, pure score SOURCE that item
 * 3's hook can import (mirrors the api-layer melatonin-onset vs shift-end
 * alignment math in src/api/circadian.ts so the standalone helper and
 * `CircadianModel.entrainmentScore` can never drift). 0h gap → 100, decaying
 * linearly to a 0 floor by ~6h of drift, clamped to [0, 100].
 *
 * Rules pinned here:
 *   • state-ground-truth.md — the score is a DERIVED value computed on demand
 *     from the ground-truth signals (onset vs shift end), never stored state;
 *     these tests assert it re-derives identically rather than caching.
 *   • js-hoist-intl.md — the helper allocates no Intl/Date; same input → same
 *     finite number with no hidden per-call state (the determinism cases lock
 *     this).
 *
 * Pure (no React / native / network / Date.now), so the suite needs no mocks.
 * Expected scores are hand-derived from the (verified) formula
 *   round(100 * max(0, 1 - circularGap/360)), clamped to [0,100].
 */
describe('deriveEntrainmentScore', () => {
  describe('good alignment → high score (>= GOOD_ALIGNMENT_THRESHOLD)', () => {
    test('a 0h gap (onset exactly at shift end) scores 100', () => {
      // Tightest possible anchor: melatonin onset coincides with clock-out.
      const score = deriveEntrainmentScore({ melatoninOnset: '22:00', shiftEnd: '22:00' });
      expect(score).toBe(100);
      expect(score! >= GOOD_ALIGNMENT_THRESHOLD).toBe(true);
    });

    test('a small (30m) gap still clears the good-alignment threshold', () => {
      // 1 - 30/360 = 0.9166… → round → 92, which is >= 80.
      const score = deriveEntrainmentScore({ melatoninOnset: '06:30', shiftEnd: '06:00' });
      expect(score).toBe(92);
      expect(score! >= GOOD_ALIGNMENT_THRESHOLD).toBe(true);
    });

    test('the 24h dial wraps — 23:30 vs 00:30 is a 60m gap (83), not 23h', () => {
      // circular gap, not linear |a-b|: 1380 vs 30 → min(1350, 90) = 60 → 83.
      expect(deriveEntrainmentScore({ melatoninOnset: '23:30', shiftEnd: '00:30' })).toBe(83);
    });
  });

  describe('medium alignment → finite score strictly below the threshold', () => {
    test('a 90m gap scores 75 (finite, < 80)', () => {
      // 1 - 90/360 = 0.75 → 75.
      const score = deriveEntrainmentScore({ melatoninOnset: '07:30', shiftEnd: '06:00' });
      expect(score).toBe(75);
      expect(Number.isFinite(score)).toBe(true);
      expect(score! < GOOD_ALIGNMENT_THRESHOLD).toBe(true);
    });

    test('a 3h gap scores 50 (finite, well below threshold)', () => {
      // 1 - 180/360 = 0.5 → 50.
      const score = deriveEntrainmentScore({ melatoninOnset: '06:00', shiftEnd: '03:00' });
      expect(score).toBe(50);
      expect(score! < GOOD_ALIGNMENT_THRESHOLD).toBe(true);
    });

    test('a gap at/beyond the ~6h floor clamps to a finite 0 (NOT null)', () => {
      // 6h gap → exactly the floor → 0; a larger gap stays clamped at 0. 0 is a
      // genuine finite score (room-for-improvement), never the null "no data".
      expect(deriveEntrainmentScore({ melatoninOnset: '00:00', shiftEnd: '06:00' })).toBe(0);
      expect(deriveEntrainmentScore({ melatoninOnset: '13:00', shiftEnd: '06:00' })).toBe(0);
    });
  });

  describe('accepts minutes-since-midnight numbers as well as "HH:MM" strings', () => {
    test('numeric minutes produce the same score as the equivalent clock string', () => {
      // 06:00 = 360 min, 07:30 = 450 min → same 90m gap → 75 either way.
      const fromStrings = deriveEntrainmentScore({ melatoninOnset: '07:30', shiftEnd: '06:00' });
      const fromMinutes = deriveEntrainmentScore({ melatoninOnset: 450, shiftEnd: 360 });
      expect(fromMinutes).toBe(fromStrings);
      expect(fromMinutes).toBe(75);
    });

    test('a 0 minute (midnight) is a VALID signal, not treated as missing', () => {
      // 00:00 → 0 minutes must parse as midnight, not be rejected as falsy.
      expect(deriveEntrainmentScore({ melatoninOnset: 0, shiftEnd: 0 })).toBe(100);
    });
  });

  describe('insufficient input → null (never a fabricated number)', () => {
    test('null / undefined input is null', () => {
      expect(deriveEntrainmentScore(null)).toBeNull();
      expect(deriveEntrainmentScore(undefined)).toBeNull();
    });

    test('an empty object (no signals) is null', () => {
      expect(deriveEntrainmentScore({})).toBeNull();
    });

    test('only one signal present is null (needs BOTH onset and shift end)', () => {
      expect(deriveEntrainmentScore({ melatoninOnset: '06:00' })).toBeNull();
      expect(deriveEntrainmentScore({ shiftEnd: '06:00' })).toBeNull();
    });

    test('an explicitly null/undefined signal is treated as missing', () => {
      expect(deriveEntrainmentScore({ melatoninOnset: null, shiftEnd: '06:00' })).toBeNull();
      expect(deriveEntrainmentScore({ melatoninOnset: '06:00', shiftEnd: undefined })).toBeNull();
    });
  });

  describe('malformed input → null, and NEVER throws', () => {
    test('garbage clock strings return null instead of throwing', () => {
      expect(() => deriveEntrainmentScore({ melatoninOnset: 'not-a-time', shiftEnd: '06:00' })).not.toThrow();
      expect(deriveEntrainmentScore({ melatoninOnset: 'not-a-time', shiftEnd: '06:00' })).toBeNull();
      expect(deriveEntrainmentScore({ melatoninOnset: '06:00', shiftEnd: '99:99' })).toBeNull();
      expect(deriveEntrainmentScore({ melatoninOnset: '6', shiftEnd: '06:00' })).toBeNull();
    });

    test('NaN / Infinity numeric signals return null instead of throwing', () => {
      expect(() => deriveEntrainmentScore({ melatoninOnset: NaN, shiftEnd: 360 })).not.toThrow();
      expect(deriveEntrainmentScore({ melatoninOnset: NaN, shiftEnd: 360 })).toBeNull();
      expect(deriveEntrainmentScore({ melatoninOnset: Infinity, shiftEnd: 360 })).toBeNull();
      // Out-of-dial minutes (>= 1440 or negative) are rejected, not wrapped.
      expect(deriveEntrainmentScore({ melatoninOnset: 1440, shiftEnd: 360 })).toBeNull();
      expect(deriveEntrainmentScore({ melatoninOnset: -1, shiftEnd: 360 })).toBeNull();
    });

    test('wrong-typed signals (boolean / object) return null, not a throw', () => {
      expect(() => deriveEntrainmentScore({ melatoninOnset: true as any, shiftEnd: 360 })).not.toThrow();
      expect(deriveEntrainmentScore({ melatoninOnset: true as any, shiftEnd: 360 })).toBeNull();
      expect(deriveEntrainmentScore({ melatoninOnset: {} as any, shiftEnd: 360 })).toBeNull();
    });
  });

  describe('always finite and clamped to [0, 100] when a number is returned', () => {
    test('a sweep of valid inputs never escapes the [0,100] band', () => {
      for (let onset = 0; onset < 1440; onset += 37) {
        for (let end = 0; end < 1440; end += 53) {
          const s = deriveEntrainmentScore({ melatoninOnset: onset, shiftEnd: end });
          expect(s).not.toBeNull();
          expect(Number.isFinite(s)).toBe(true);
          expect(s! >= 0 && s! <= 100).toBe(true);
        }
      }
    });
  });

  describe('is pure / deterministic — same input twice → equal output', () => {
    test('repeated calls with the same signals return an identical score', () => {
      const input = { melatoninOnset: '07:30', shiftEnd: '06:00' };
      expect(deriveEntrainmentScore(input)).toBe(deriveEntrainmentScore(input));
    });

    test('repeated calls on insufficient input are stably null', () => {
      expect(deriveEntrainmentScore({})).toBe(deriveEntrainmentScore({}));
      expect(deriveEntrainmentScore({ melatoninOnset: 'bad', shiftEnd: 'bad' }))
        .toBe(deriveEntrainmentScore({ melatoninOnset: 'bad', shiftEnd: 'bad' }));
    });
  });
});
