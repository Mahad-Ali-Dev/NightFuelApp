/**
 * ppgSignal.ts — the PURE signal-processing core of camera heart-rate (PPG).
 *
 * Camera photoplethysmography: with the torch ON and a fingertip over the lens,
 * each captured frame is red-saturated and its average red/luma brightness rises
 * and falls with the blood-volume pulse. Averaging that channel per frame yields
 * a 1-D time series whose fundamental frequency IS the heart rate. This module
 * turns that noisy series into a BPM + an honest confidence.
 *
 * ── Why this file imports NOTHING native ──────────────────────────────────────
 * Deliberately zero imports (no react-native, no vision-camera, no react). It is
 * plain data→data math, so the jest gate (babel-jest, no native modules) can
 * exercise it directly — exactly the purity boundary the backend uses for its
 * twin mapping (services/sleep-service/health-sync.service.ts) and the app uses
 * for its circadian math. The native camera seam (src/lib/ppg/ppgCamera.ts +
 * src/components/ppg/PpgCameraView.tsx) feeds samples IN; this module owns the
 * algorithm and nothing else.
 *
 * ── Honesty mandate ───────────────────────────────────────────────────────────
 * Camera PPG is a consumer-grade ESTIMATE (±3–8 BPM at rest, unreliable during
 * motion). This module NEVER fabricates a plausible number from noise: a short,
 * flat, or irregular signal returns `quality: 'poor'` (and often `bpm: null`) so
 * the UI can say "couldn't get a reliable reading, try again" instead of showing
 * a made-up value. Confidence is derived from beat regularity + beat count, not
 * asserted.
 *
 * Pipeline (all in the sample domain, robust to the camera's ~30fps cadence):
 *   1. estimate sample rate from timestamps (median Δt),
 *   2. band-pass = detrend (subtract a long moving average → drop baseline drift)
 *      then smooth (short moving average → drop high-freq sensor noise),
 *   3. detect peaks above a dynamic threshold with a physiological refractory gap,
 *   4. BPM = 60 / median(inter-beat interval), and
 *   5. confidence from IBI regularity × beat sufficiency.
 */

/** One PPG sample: `t` is a monotonic timestamp in ms, `v` the frame's mean red/luma. */
export interface PpgSample {
  t: number;
  v: number;
}

/** Coarse trust bucket the UI branches on. `poor` → show "try again", never a number. */
export type PpgQuality = 'good' | 'fair' | 'poor';

/** The result of {@link estimateBpm}. */
export interface BpmEstimate {
  /** Beats per minute, or null when no reliable rate could be determined. */
  bpm: number | null;
  /** 0–1 trust score derived from beat regularity + count (never asserted). */
  confidence: number;
  /** Bucketed confidence. `poor` means the UI must NOT present a BPM. */
  quality: PpgQuality;
  /** Number of beats (peaks) detected in the window. */
  beats: number;
  /** Estimated sample rate (Hz) from the timestamps. */
  sampleRateHz: number;
}

// ── Physiological + algorithm bounds ─────────────────────────────────────────
/** Slowest rate we'll report (bpm). Below this a "beat" is almost certainly drift. */
export const MIN_BPM = 40;
/** Fastest rate we'll report (bpm). Above this peaks are noise, not pulses. */
export const MAX_BPM = 210;
/** Min plausible inter-beat interval (s) — the refractory gap ⇒ MAX_BPM ceiling. */
const MIN_IBI_S = 60 / MAX_BPM; // ≈ 0.286 s
/** Max plausible inter-beat interval (s) ⇒ MIN_BPM floor. */
const MAX_IBI_S = 60 / MIN_BPM; // = 1.5 s
/** Fallback sample rate when timestamps are unusable (typical camera cadence). */
const DEFAULT_FS_HZ = 30;
/** Confidence at/above which a reading is trustworthy enough to present. */
export const GOOD_CONFIDENCE = 0.6;
/** Confidence below which the reading is rejected outright (show "try again"). */
export const POOR_CONFIDENCE = 0.35;
/** Beats needed for FULL beat-sufficiency credit (≈ a 10–15 s clean capture). */
const BEATS_FOR_FULL_CREDIT = 9;

// ─────────────────────────────────────────────────────────────────────────────
// Small numeric helpers (kept local so the module stays dependency-free)
// ─────────────────────────────────────────────────────────────────────────────

/** Keep only finite numbers. */
function finiteOnly(xs: number[]): number[] {
  return xs.filter((x) => Number.isFinite(x));
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  let s = 0;
  for (const x of xs) s += (x - m) * (x - m);
  return Math.sqrt(s / (xs.length - 1));
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/**
 * Centered simple moving average with a shrinking window at the edges (so the
 * ends aren't dragged toward zero). `win` is the full window width in samples;
 * a `win <= 1` returns a copy unchanged.
 */
export function movingAverage(xs: number[], win: number): number[] {
  const n = xs.length;
  if (n === 0) return [];
  const w = Math.max(1, Math.floor(win));
  if (w <= 1) return xs.slice();
  const half = Math.floor(w / 2);
  // Prefix sums → O(n) regardless of window width.
  const prefix = new Array<number>(n + 1);
  prefix[0] = 0;
  for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i]! + xs[i]!;
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - half);
    const hi = Math.min(n - 1, i + half);
    out[i] = (prefix[hi + 1]! - prefix[lo]!) / (hi - lo + 1);
  }
  return out;
}

/**
 * Band-pass a raw PPG value series for the ~0.7–3.5 Hz cardiac band:
 *   detrend  = xs − movingAverage(xs, longWin)   (high-pass: drops baseline wander)
 *   smoothed = movingAverage(detrend, shortWin)   (low-pass: drops sensor noise)
 * Window widths are derived from the sample rate so the pass-band is stable
 * across devices/frame rates. Exported so the live-capture UI can render a clean
 * waveform from the same filter the estimator uses.
 */
export function bandpassFilter(values: number[], sampleRateHz: number): number[] {
  if (values.length === 0) return [];
  const fs = sampleRateHz > 0 ? sampleRateHz : DEFAULT_FS_HZ;
  // long window ≈ 2 s → high-pass cutoff ≈ 0.5 Hz (preserves ≥ 30 bpm).
  const longWin = Math.max(3, Math.round(fs * 2.0));
  // short window ≈ 0.12 s → light low-pass, knocks down high-freq jitter.
  const shortWin = Math.max(2, Math.round(fs * 0.12));
  const baseline = movingAverage(values, longWin);
  const detrended = values.map((v, i) => v - baseline[i]!);
  return movingAverage(detrended, shortWin);
}

/**
 * Detect heartbeat peaks in a zero-mean band-passed signal. A peak is a local
 * maximum above `k·σ`; peaks closer than `refractory` samples are resolved by
 * keeping the taller (greedy, amplitude-first) so a single beat can't register
 * twice. Returns the accepted peak indices in time order.
 */
export function detectPeaks(signal: number[], sampleRateHz: number): number[] {
  const n = signal.length;
  if (n < 3) return [];
  const sd = stdev(signal);
  if (sd === 0) return []; // perfectly flat ⇒ no pulse (e.g. finger not on lens)
  const threshold = 0.5 * sd; // signal is ~zero-mean; real peaks clear ~0.5σ
  const fs = sampleRateHz > 0 ? sampleRateHz : DEFAULT_FS_HZ;
  const refractory = Math.max(1, Math.round(fs * MIN_IBI_S));

  // 1) all local maxima above threshold
  const candidates: number[] = [];
  for (let i = 1; i < n - 1; i++) {
    const v = signal[i]!;
    if (v > threshold && v >= signal[i - 1]! && v > signal[i + 1]!) candidates.push(i);
  }
  if (candidates.length === 0) return [];

  // 2) greedily accept tallest-first, rejecting any within the refractory gap
  const byAmpDesc = [...candidates].sort((a, b) => signal[b]! - signal[a]!);
  const accepted: number[] = [];
  for (const idx of byAmpDesc) {
    if (accepted.every((a) => Math.abs(a - idx) >= refractory)) accepted.push(idx);
  }
  return accepted.sort((a, b) => a - b);
}

/**
 * Estimate the sample rate (Hz) from timestamps via the median inter-sample gap
 * (median resists the odd dropped/duplicated frame). Falls back to
 * {@link DEFAULT_FS_HZ} when there are too few samples or the gaps are unusable.
 */
export function estimateSampleRate(samples: PpgSample[]): number {
  if (samples.length < 2) return DEFAULT_FS_HZ;
  const dts: number[] = [];
  for (let i = 1; i < samples.length; i++) {
    const dt = samples[i]!.t - samples[i - 1]!.t;
    if (Number.isFinite(dt) && dt > 0) dts.push(dt);
  }
  if (dts.length === 0) return DEFAULT_FS_HZ;
  const medDtMs = median(dts);
  if (!Number.isFinite(medDtMs) || medDtMs <= 0) return DEFAULT_FS_HZ;
  const fs = 1000 / medDtMs;
  // Guard against absurd rates from clock glitches.
  return clamp(fs, 5, 120);
}

const POOR: BpmEstimate = { bpm: null, confidence: 0, quality: 'poor', beats: 0, sampleRateHz: 0 };

/**
 * Estimate BPM from a window of PPG samples. Returns a bounded confidence and a
 * quality bucket; `quality: 'poor'` (and usually `bpm: null`) means the signal
 * wasn't good enough and the UI must ask the user to try again rather than show
 * a fabricated number.
 */
export function estimateBpm(samples: PpgSample[]): BpmEstimate {
  const clean = samples.filter((s) => Number.isFinite(s?.t) && Number.isFinite(s?.v));
  if (clean.length < 8) return POOR;

  const fs = estimateSampleRate(clean);
  const values = clean.map((s) => s.v);
  const filtered = bandpassFilter(values, fs);
  const peaks = detectPeaks(filtered, fs);

  if (peaks.length < 3) {
    return { bpm: null, confidence: 0, quality: 'poor', beats: peaks.length, sampleRateHz: fs };
  }

  // Inter-beat intervals (s), keeping only physiologically plausible ones.
  const allIbis: number[] = [];
  for (let i = 1; i < peaks.length; i++) allIbis.push((peaks[i]! - peaks[i - 1]!) / fs);
  const ibis = allIbis.filter((x) => x >= MIN_IBI_S && x <= MAX_IBI_S);

  if (ibis.length < 2) {
    return { bpm: null, confidence: 0, quality: 'poor', beats: peaks.length, sampleRateHz: fs };
  }

  const medIbi = median(ibis);
  const bpmRaw = 60 / medIbi;
  const bpm = Math.round(clamp(bpmRaw, MIN_BPM, MAX_BPM));

  // Confidence = regularity × beat-sufficiency.
  //  - regularity: low IBI coefficient-of-variation ⇒ steady pulse (real HRV is
  //    small, ~0.02–0.15; motion/noise inflates it). CV≈0 → 1, CV≥0.35 → 0.
  //  - sufficiency: enough beats to trust the median; ramps to 1 by ~9 beats.
  //  - plausibility: the median must sit in [MIN_BPM, MAX_BPM]; if it was clamped
  //    the underlying rate was out of range → treat as unreliable.
  const m = mean(ibis);
  const cv = m > 0 ? stdev(ibis) / m : 1;
  const regularity = clamp(1 - cv / 0.35, 0, 1);
  const sufficiency = clamp(ibis.length / (BEATS_FOR_FULL_CREDIT - 1), 0, 1);
  const inRange = bpmRaw >= MIN_BPM && bpmRaw <= MAX_BPM;
  const confidence = inRange ? clamp(0.6 * regularity + 0.4 * sufficiency, 0, 1) : 0;

  const quality: PpgQuality =
    confidence >= GOOD_CONFIDENCE ? 'good' : confidence >= POOR_CONFIDENCE ? 'fair' : 'poor';

  return {
    bpm: quality === 'poor' ? null : bpm,
    confidence,
    quality,
    beats: peaks.length,
    sampleRateHz: fs,
  };
}
