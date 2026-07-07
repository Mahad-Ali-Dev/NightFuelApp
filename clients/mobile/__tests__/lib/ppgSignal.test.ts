/**
 * Unit tests for the pure PPG DSP core (src/lib/ppg/ppgSignal.ts).
 *
 * We synthesize known-BPM signals (pulse sine + slow baseline drift + bounded
 * deterministic noise) and assert the estimator recovers the rate within a few
 * BPM at high confidence — and, just as importantly, that flat / too-short /
 * non-periodic signals are honestly rejected as `poor` (never a fabricated BPM).
 */
import {
  estimateBpm,
  bandpassFilter,
  detectPeaks,
  estimateSampleRate,
  movingAverage,
  MIN_BPM,
  MAX_BPM,
  GOOD_CONFIDENCE,
  type PpgSample,
} from '@/lib/ppg/ppgSignal';

/** Deterministic ±0.5 pseudo-noise (seeded LCG) so tests never flake. */
function makeNoise(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff;
    return s / 0x7fffffff - 0.5;
  };
}

/** Build a synthetic PPG window at `bpm` (pulse + baseline wander + noise). */
function synth(
  bpm: number,
  opts: { fs?: number; seconds?: number; amp?: number; noise?: number; seed?: number } = {},
): PpgSample[] {
  const { fs = 30, seconds = 15, amp = 3, noise = 0.3, seed = 7 } = opts;
  const f = bpm / 60;
  const rand = makeNoise(seed);
  const n = Math.round(fs * seconds);
  const out: PpgSample[] = [];
  for (let i = 0; i < n; i++) {
    const tSec = i / fs;
    const dc = 180 + 4 * Math.sin(2 * Math.PI * 0.05 * tSec); // slow baseline wander
    const pulse = amp * Math.sin(2 * Math.PI * f * tSec);
    out.push({ t: i * (1000 / fs), v: dc + pulse + noise * rand() });
  }
  return out;
}

describe('estimateBpm — recovers known rates', () => {
  it.each([48, 60, 72, 100, 132, 168])('recovers %d bpm within tolerance', (bpm) => {
    const est = estimateBpm(synth(bpm));
    expect(est.bpm).not.toBeNull();
    expect(Math.abs((est.bpm as number) - bpm)).toBeLessThanOrEqual(5);
    expect(est.confidence).toBeGreaterThanOrEqual(GOOD_CONFIDENCE);
    expect(est.quality).toBe('good');
  });

  it('reports a plausible sample rate for a 30fps capture', () => {
    const est = estimateBpm(synth(72, { fs: 30 }));
    expect(est.sampleRateHz).toBeGreaterThan(25);
    expect(est.sampleRateHz).toBeLessThan(35);
  });

  it('clamps/keeps the reported BPM within physiological bounds', () => {
    const est = estimateBpm(synth(72));
    expect(est.bpm).toBeGreaterThanOrEqual(MIN_BPM);
    expect(est.bpm).toBeLessThanOrEqual(MAX_BPM);
  });
});

describe('estimateBpm — honest rejection (no fabricated numbers)', () => {
  it('rejects a perfectly flat signal (finger not on lens) as poor', () => {
    const flat: PpgSample[] = Array.from({ length: 450 }, (_, i) => ({ t: i * 33.3, v: 200 }));
    const est = estimateBpm(flat);
    expect(est.quality).toBe('poor');
    expect(est.bpm).toBeNull();
  });

  it('rejects a too-short window as poor', () => {
    const est = estimateBpm(synth(72, { seconds: 0.15 }));
    expect(est.quality).toBe('poor');
    expect(est.bpm).toBeNull();
  });

  it('rejects an empty input as poor', () => {
    expect(estimateBpm([]).quality).toBe('poor');
    expect(estimateBpm([]).bpm).toBeNull();
  });

  it('does not report high confidence for non-periodic noise', () => {
    const rand = makeNoise(99);
    const noisy: PpgSample[] = Array.from({ length: 450 }, (_, i) => ({
      t: i * 33.3,
      v: 180 + 30 * rand(),
    }));
    const est = estimateBpm(noisy);
    expect(est.confidence).toBeLessThan(GOOD_CONFIDENCE);
    expect(est.quality).not.toBe('good');
  });
});

describe('helpers', () => {
  it('movingAverage of a constant series is unchanged', () => {
    const out = movingAverage([5, 5, 5, 5, 5], 3);
    out.forEach((v) => expect(v).toBeCloseTo(5, 6));
  });

  it('movingAverage with win<=1 returns a copy', () => {
    const input = [1, 2, 3];
    const out = movingAverage(input, 1);
    expect(out).toEqual(input);
    expect(out).not.toBe(input);
  });

  it('bandpassFilter removes the DC offset (near-zero mean)', () => {
    const values = synth(72).map((s) => s.v);
    const filtered = bandpassFilter(values, 30);
    const avg = filtered.reduce((a, b) => a + b, 0) / filtered.length;
    expect(Math.abs(avg)).toBeLessThan(0.5);
  });

  it('detectPeaks finds ~one peak per pulse period on a clean sine', () => {
    // 72 bpm over 15 s ≈ 18 beats.
    const values = synth(72).map((s) => s.v);
    const peaks = detectPeaks(bandpassFilter(values, 30), 30);
    expect(peaks.length).toBeGreaterThanOrEqual(15);
    expect(peaks.length).toBeLessThanOrEqual(21);
  });

  it('detectPeaks returns nothing for a flat signal', () => {
    expect(detectPeaks([1, 1, 1, 1, 1], 30)).toEqual([]);
  });

  it('estimateSampleRate derives ~30 Hz from 33ms-spaced timestamps', () => {
    const samples: PpgSample[] = Array.from({ length: 60 }, (_, i) => ({ t: i * 33.3, v: 0 }));
    expect(estimateSampleRate(samples)).toBeGreaterThan(28);
    expect(estimateSampleRate(samples)).toBeLessThan(32);
  });

  it('estimateSampleRate falls back for degenerate input', () => {
    expect(estimateSampleRate([])).toBe(30);
    expect(estimateSampleRate([{ t: 0, v: 0 }])).toBe(30);
  });
});
