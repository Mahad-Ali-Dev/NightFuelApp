/**
 * Tests for deriveEntrainmentScore — the standalone, pure entrainment/alignment
 * score in src/lib/circadian/entrainment.ts. It is the separately-importable
 * mirror of the PRIVATE score derivation in src/api/circadian.ts (surfaced as
 * `CircadianModel.entrainmentScore`), exposed so a hook/screen can derive a
 * score from already-extracted model signals without reaching into the API
 * layer. The two are intentionally byte-for-byte identical so they never drift.
 *
 * The function is pure (no React / native / network / Date.now), so it needs no
 * mocks. It maps the CIRCULAR clock gap (24h dial) between the model's
 * `melatoninOnset` and the shift's `shiftEnd` onto 0–100:
 *
 *   score = round(100 * max(0, 1 - gap / ENTRAINMENT_HALF_LIFE_MIN))   // 360 min
 *
 * so a 0h gap → 100, decaying linearly to a floor of 0 at ~6h of drift, then
 * clamped to [0, 100]. Either signal may be a `"HH:MM"` 24h clock string OR a
 * minutes-since-midnight number in [0, 1440); missing / malformed / NaN /
 * out-of-range input yields `null` (the function NEVER throws).
 *
 * Headline cases:
 *   1. null / undefined / empty / one-signal-missing      → null
 *   2. malformed strings / NaN / out-of-range numbers      → null
 *   3. valid gaps: 0h → 100, ~6h → 0, 3h → 50
 *   4. circular WRAP-AROUND: 23:30 vs 00:30 is a 60m gap (NOT 23h) → 83
 *   5. string↔minutes PARITY: "HH:MM" and equivalent minutes give an
 *      identical number
 *   6. universal invariants: every result is null OR a finite integer in
 *      [0, 100], and the function never throws on any tested input
 *   7. threshold boundary: a score exactly at GOOD_ALIGNMENT_THRESHOLD reads as
 *      "good alignment" via entrainmentAdvice (couples the score to the copy)
 */
import {
  deriveEntrainmentScore,
  GOOD_ALIGNMENT_THRESHOLD,
  entrainmentAdvice,
} from '@/lib/circadian/entrainment';

describe('deriveEntrainmentScore', () => {
  describe('insufficient input → null', () => {
    test('null / undefined / empty object', () => {
      expect(deriveEntrainmentScore(null)).toBeNull();
      expect(deriveEntrainmentScore(undefined)).toBeNull();
      expect(deriveEntrainmentScore({})).toBeNull();
    });

    test('one signal missing → null (cannot compute a gap from a single point)', () => {
      expect(deriveEntrainmentScore({ melatoninOnset: '06:00' })).toBeNull();
      expect(deriveEntrainmentScore({ shiftEnd: 360 })).toBeNull();
      // both null / undefined values explicitly
      expect(deriveEntrainmentScore({ melatoninOnset: null, shiftEnd: '06:00' })).toBeNull();
      expect(deriveEntrainmentScore({ melatoninOnset: '06:00', shiftEnd: undefined })).toBeNull();
    });
  });

  describe('malformed / NaN / out-of-range → null', () => {
    test('malformed clock strings → null', () => {
      expect(deriveEntrainmentScore({ melatoninOnset: 'nonsense', shiftEnd: '06:00' })).toBeNull();
      // 25:00 — hour out of [0,23]
      expect(deriveEntrainmentScore({ melatoninOnset: '25:00', shiftEnd: '06:00' })).toBeNull();
      // 06:60 — minute out of [0,59]
      expect(deriveEntrainmentScore({ melatoninOnset: '06:60', shiftEnd: '06:00' })).toBeNull();
      // shapes the HH:MM regex rejects
      expect(deriveEntrainmentScore({ melatoninOnset: '0600', shiftEnd: '06:00' })).toBeNull();
      expect(deriveEntrainmentScore({ melatoninOnset: '06:00:00', shiftEnd: '06:00' })).toBeNull();
      expect(deriveEntrainmentScore({ melatoninOnset: '', shiftEnd: '06:00' })).toBeNull();
    });

    test('NaN / out-of-range / non-finite numbers → null', () => {
      expect(deriveEntrainmentScore({ melatoninOnset: NaN, shiftEnd: 0 })).toBeNull();
      expect(deriveEntrainmentScore({ melatoninOnset: -5, shiftEnd: 0 })).toBeNull();
      // 1440 is out of the half-open dial [0, 1440)
      expect(deriveEntrainmentScore({ melatoninOnset: 1440, shiftEnd: 0 })).toBeNull();
      expect(deriveEntrainmentScore({ melatoninOnset: Infinity, shiftEnd: 0 })).toBeNull();
      expect(deriveEntrainmentScore({ melatoninOnset: -Infinity, shiftEnd: 0 })).toBeNull();
    });
  });

  describe('valid signals → score in [0, 100]', () => {
    test('0h gap → 100 (melatonin onset exactly at shift end)', () => {
      expect(deriveEntrainmentScore({ melatoninOnset: '06:00', shiftEnd: '06:00' })).toBe(100);
    });

    test('~6h gap → 0 (drift at/over the half-life floor)', () => {
      // 00:00 vs 06:00 = 360 min = ENTRAINMENT_HALF_LIFE_MIN → floor of 0
      expect(deriveEntrainmentScore({ melatoninOnset: '00:00', shiftEnd: '06:00' })).toBe(0);
    });

    test('3h gap → ~50 (round(100 * (1 - 180/360)))', () => {
      // 03:00 vs 06:00 = 180 min gap → exactly 50
      expect(deriveEntrainmentScore({ melatoninOnset: '03:00', shiftEnd: '06:00' })).toBe(
        Math.round(100 * (1 - 180 / 360)),
      );
      expect(deriveEntrainmentScore({ melatoninOnset: '03:00', shiftEnd: '06:00' })).toBe(50);
    });
  });

  describe('circular wrap-around (24h dial)', () => {
    test('23:30 vs 00:30 is a 60-minute gap, NOT 23h', () => {
      // 1410 vs 30 → raw |Δ| = 1380, circular gap = 1440 - 1380 = 60 min.
      // round(100 * (1 - 60/360)) = 83.
      const score = deriveEntrainmentScore({ melatoninOnset: '23:30', shiftEnd: '00:30' });
      expect(score).toBe(Math.round(100 * (1 - 60 / 360)));
      expect(score).toBe(83);
      // Guard against a naive |a - b| (which would be a 23h gap → 0): a 60-min
      // gap must land in the GOOD band, never a tiny number.
      expect(score).toBeGreaterThanOrEqual(80);
    });

    test('wrap is symmetric (00:30 vs 23:30 == 23:30 vs 00:30)', () => {
      expect(deriveEntrainmentScore({ melatoninOnset: '00:30', shiftEnd: '23:30' })).toBe(
        deriveEntrainmentScore({ melatoninOnset: '23:30', shiftEnd: '00:30' }),
      );
    });
  });

  describe('string ↔ minutes parity', () => {
    test('"HH:MM" and equivalent minutes give an identical score', () => {
      // 06:00 = 360 min, 07:00 = 420 min — both express a 60-minute gap.
      expect(deriveEntrainmentScore({ melatoninOnset: '06:00', shiftEnd: '07:00' })).toBe(
        deriveEntrainmentScore({ melatoninOnset: 360, shiftEnd: 420 }),
      );
    });

    test('mixed string/number for the two signals also matches', () => {
      expect(deriveEntrainmentScore({ melatoninOnset: '06:00', shiftEnd: 420 })).toBe(
        deriveEntrainmentScore({ melatoninOnset: 360, shiftEnd: '07:00' }),
      );
    });
  });

  describe('universal invariants over varied input', () => {
    // A table mixing valid (string & number, both gap directions, wrap-around,
    // boundary) and invalid (null / malformed / NaN / out-of-range) inputs. For
    // EVERY row the result must be null OR a finite integer in [0, 100], and the
    // call must NEVER throw.
    const cases: Array<Parameters<typeof deriveEntrainmentScore>[0]> = [
      null,
      undefined,
      {},
      { melatoninOnset: '06:00' },
      { shiftEnd: 360 },
      { melatoninOnset: 'nonsense', shiftEnd: '06:00' },
      { melatoninOnset: '25:00', shiftEnd: '06:00' },
      { melatoninOnset: '06:60', shiftEnd: '06:00' },
      { melatoninOnset: NaN, shiftEnd: 0 },
      { melatoninOnset: -5, shiftEnd: 0 },
      { melatoninOnset: 1440, shiftEnd: 0 },
      { melatoninOnset: Infinity, shiftEnd: 0 },
      { melatoninOnset: '06:00', shiftEnd: '06:00' },
      { melatoninOnset: '00:00', shiftEnd: '06:00' },
      { melatoninOnset: '03:00', shiftEnd: '06:00' },
      { melatoninOnset: '23:30', shiftEnd: '00:30' },
      { melatoninOnset: 0, shiftEnd: 0 },
      { melatoninOnset: 0, shiftEnd: 1439 },
      { melatoninOnset: 720, shiftEnd: 90 },
      { melatoninOnset: '12:00', shiftEnd: '00:00' },
      { melatoninOnset: 360, shiftEnd: 420 },
    ];

    test.each(cases)('result is null or a finite integer in [0, 100]: %p', (input) => {
      const score = deriveEntrainmentScore(input);
      if (score === null) {
        expect(score).toBeNull();
        return;
      }
      expect(Number.isInteger(score)).toBe(true);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    test('never throws on any tested input', () => {
      for (const input of cases) {
        expect(() => deriveEntrainmentScore(input)).not.toThrow();
      }
    });
  });

  describe('threshold ↔ entrainmentAdvice coupling', () => {
    test("a score exactly at GOOD_ALIGNMENT_THRESHOLD reads as 'good alignment'", () => {
      // Couple the score's GOOD threshold to the advice copy: a score at the
      // boundary must surface the good-alignment string, so neither the
      // threshold nor the >= comparison can drift away from the copy.
      expect(entrainmentAdvice(GOOD_ALIGNMENT_THRESHOLD)).toBe(
        'Good alignment. Try getting 15m of sunlight upon waking to improve this score.',
      );
    });

    test('a wrap-around 60m gap clears the GOOD threshold via the advice copy', () => {
      // The 23:30/00:30 wrap-around (83) is >= GOOD_ALIGNMENT_THRESHOLD, so it
      // too must read as good alignment — a behavioural tie between the
      // circular-gap math and the threshold copy.
      const score = deriveEntrainmentScore({ melatoninOnset: '23:30', shiftEnd: '00:30' });
      expect(score).not.toBeNull();
      expect(score as number).toBeGreaterThanOrEqual(GOOD_ALIGNMENT_THRESHOLD);
      expect(entrainmentAdvice(score)).toBe(
        'Good alignment. Try getting 15m of sunlight upon waking to improve this score.',
      );
    });
  });
});
