/**
 * healthSyncMap.ts
 *
 * The PURE mapping core of the on-device health-sync adapter. It contains ZERO
 * native imports (no @kingstinct/react-native-healthkit, no
 * react-native-health-connect, no react-native) so it is fully unit-testable on
 * the jest gate with realistic fixtures. `healthSyncNative.ts` calls into here
 * with the RAW platform sample arrays it reads from HealthKit / Health Connect,
 * and this module turns them into the normalized `HealthSample[]` that gets
 * POSTed to `/v1/sleep/health-sync`.
 *
 * Three responsibilities, all pure data→data transforms:
 *
 *   1. SLEEP NORMALIZATION (D2) — collapse a fragmented HealthKit night (many
 *      per-stage category segments) into ONE session per night, and normalize
 *      the Android one-SleepSession-per-night shape to the same model. Sum the
 *      asleep time; count awakenings → disturbances.
 *
 *   2. QUALITY SYNTHESIS (D1) — real platform sleep carries NO quality. Derive a
 *      BASELINE 0–10 quality for each night from sleep efficiency (asleep /
 *      in-bed) when that can be computed, otherwise fall back to the manual-log
 *      default of 7. Without this the backend's autonomic refinement is a dead
 *      no-op (it has nothing to move) and fatigue can't be nudged.
 *
 *   3. INCREMENTAL / MOST-RECENT-NIGHT TWIN FEED (D2) — only the most-recent
 *      night (and only nights strictly AFTER the persisted lastSyncedAt) is
 *      emitted as a live `kind:'sleep'` sample that the backend materializes into
 *      a `sleep.session-logged` twin event. Older nights in the 7-day lookback
 *      are NOT re-emitted, so:
 *        - a daily syncer produces ~one twin sleep event per day (matching manual
 *          logging), instead of fanning out 7 events per sync; and
 *        - repeated syncs of the same window do NOT re-fire the same events
 *          (double-count), because the window is bounded by lastSyncedAt.
 *      Non-sleep samples (steps / HR / HRV / resting-HR / energy / workout) are
 *      passed through unchanged — they are archived and HRV/resting-HR feed the
 *      autonomic refinement; they are never re-materialized as twin events.
 */

import type { HealthSample } from '../api/health';

/** Manual-log default quality (sleep-service createSession / materializer use 7). */
export const DEFAULT_SLEEP_QUALITY = 7;
/** Quality is on a 0–10 scale; never emit below 1 (decision-engine requires ≥1). */
export const MIN_SLEEP_QUALITY = 1;
export const MAX_SLEEP_QUALITY = 10;

const MS_PER_HOUR = 60 * 60 * 1000;
/**
 * Gap (ms) below which two adjacent HealthKit asleep segments are considered the
 * SAME night. 3h comfortably bridges intra-night awake gaps / stage boundaries
 * while still splitting a genuine separate nap or the next night.
 */
const SAME_NIGHT_GAP_MS = 3 * MS_PER_HOUR;

const clampQuality = (q: number): number =>
  Math.round(Math.min(MAX_SLEEP_QUALITY, Math.max(MIN_SLEEP_QUALITY, q)));

/**
 * Apple HealthKit sleepAnalysis category `value`s. asleep* values count as time
 * actually asleep; `inBed` is the in-bed envelope; `awake` is a mid-night
 * awakening (an awakening → a disturbance).
 *   0 inBed · 1 asleepUnspecified · 2 awake · 3 asleepCore · 4 asleepDeep · 5 asleepREM
 */
const HK_SLEEP = {
  inBed: 0,
  asleepUnspecified: 1,
  awake: 2,
  asleepCore: 3,
  asleepDeep: 4,
  asleepREM: 5,
} as const;
const HK_ASLEEP_VALUES = new Set<number>([
  HK_SLEEP.asleepUnspecified,
  HK_SLEEP.asleepCore,
  HK_SLEEP.asleepDeep,
  HK_SLEEP.asleepREM,
]);

/** A raw HealthKit sleepAnalysis category sample (subset we use). */
export interface RawHkSleepSample {
  startDate: string | number | Date;
  endDate?: string | number | Date | null;
  value: number;
}

/** A raw Health Connect SleepSession record (subset we use). */
export interface RawHcSleepSession {
  startTime: string;
  endTime?: string | null;
  /** Optional per-stage breakdown; when present, `awake` stages → disturbances. */
  stages?: Array<{ stage?: number | string; startTime?: string; endTime?: string }>;
}

/** A normalized one-per-night sleep session, before it becomes a HealthSample. */
export interface NormalizedSleepNight {
  /** Night window start (earliest segment start). ISO-8601. */
  startTime: string;
  /** Night window end (latest segment end). ISO-8601. */
  endTime: string | null;
  /** Synthesized 0–10 baseline quality (efficiency-derived or default). */
  quality: number;
  /** Awakening count → disturbances. */
  disturbances: number;
}

const toMs = (d: string | number | Date | null | undefined): number => {
  if (d == null) return NaN;
  if (d instanceof Date) return d.getTime();
  if (typeof d === 'number') return d;
  return Date.parse(d);
};

const isFiniteMs = (n: number): boolean => Number.isFinite(n);

/**
 * Synthesize a baseline quality from sleep efficiency (asleep / in-bed time).
 * Efficiency 85%+ ≈ 9, 75% ≈ 7, 65% ≈ 5, degrading linearly; clamped to 1..10.
 * When in-bed time is unknown/zero we cannot compute efficiency → default 7.
 */
export function synthesizeQuality(asleepMs: number, inBedMs: number): number {
  if (!isFiniteMs(asleepMs) || asleepMs <= 0) return DEFAULT_SLEEP_QUALITY;
  if (!isFiniteMs(inBedMs) || inBedMs <= 0) return DEFAULT_SLEEP_QUALITY;
  const efficiency = Math.min(1, asleepMs / inBedMs);
  // Map efficiency 0.55..0.95 → quality ~4..10 (linear), centered so 0.85→~9.
  const q = 4 + (efficiency - 0.55) * (6 / 0.4);
  return clampQuality(q);
}

/**
 * Collapse RAW HealthKit per-stage sleep category samples into ONE session per
 * night. Contiguous/overlapping segments separated by < SAME_NIGHT_GAP_MS are
 * grouped; asleep segments sum to asleep time; `inBed` segments (and the overall
 * envelope) give in-bed time for efficiency; `awake` segments count as
 * awakenings → disturbances. Returns nights sorted chronologically (oldest→newest).
 */
export function collapseHealthKitNights(raw: RawHkSleepSample[]): NormalizedSleepNight[] {
  const segs = (raw ?? [])
    .map((s) => ({ start: toMs(s.startDate), end: toMs(s.endDate ?? s.startDate), value: s.value }))
    .filter((s) => isFiniteMs(s.start) && isFiniteMs(s.end) && s.end >= s.start)
    .sort((a, b) => a.start - b.start);
  if (segs.length === 0) return [];

  type Seg = (typeof segs)[number];
  const first = segs[0]!;
  const groups: Seg[][] = [];
  let current: Seg[] = [first];
  let groupEnd = first.end;
  for (let i = 1; i < segs.length; i++) {
    const seg = segs[i]!;
    if (seg.start - groupEnd <= SAME_NIGHT_GAP_MS) {
      current.push(seg);
      groupEnd = Math.max(groupEnd, seg.end);
    } else {
      groups.push(current);
      current = [seg];
      groupEnd = seg.end;
    }
  }
  groups.push(current);

  return groups.map((g) => {
    const start = Math.min(...g.map((s) => s.start));
    const end = Math.max(...g.map((s) => s.end));
    let asleepMs = 0;
    let inBedMs = 0;
    let awakenings = 0;
    for (const s of g) {
      const dur = s.end - s.start;
      if (HK_ASLEEP_VALUES.has(s.value)) asleepMs += dur;
      else if (s.value === HK_SLEEP.inBed) inBedMs += dur;
      else if (s.value === HK_SLEEP.awake) awakenings += 1;
    }
    // If no explicit inBed segments, the night envelope IS the in-bed time.
    if (inBedMs <= 0) inBedMs = end - start;
    // If only inBed (no asleep stages, older devices), treat envelope as asleep.
    if (asleepMs <= 0) asleepMs = end - start;
    return {
      startTime: new Date(start).toISOString(),
      endTime: new Date(end).toISOString(),
      quality: synthesizeQuality(asleepMs, inBedMs),
      disturbances: awakenings,
    };
  });
}

/** Health Connect stage codes for "awake" (string or numeric forms seen in the wild). */
const HC_AWAKE_STAGES = new Set<unknown>([1, 'STAGE_TYPE_AWAKE', 'awake', 'AWAKE']);

/**
 * Normalize RAW Health Connect SleepSession records (already one-per-night) into
 * the SAME NormalizedSleepNight model. Asleep time = sum of non-awake stages if a
 * stage breakdown exists, else the whole session window; awake stages →
 * disturbances. Returns nights sorted chronologically (oldest→newest).
 */
export function normalizeHealthConnectNights(raw: RawHcSleepSession[]): NormalizedSleepNight[] {
  const nights: NormalizedSleepNight[] = [];
  for (const r of raw ?? []) {
    const start = toMs(r.startTime);
    const end = toMs(r.endTime ?? r.startTime);
    if (!isFiniteMs(start) || !isFiniteMs(end) || end < start) continue;
    const inBedMs = end - start;
    let asleepMs = inBedMs;
    let awakenings = 0;
    if (Array.isArray(r.stages) && r.stages.length > 0) {
      asleepMs = 0;
      for (const st of r.stages) {
        const ss = toMs(st.startTime);
        const se = toMs(st.endTime);
        const dur = isFiniteMs(ss) && isFiniteMs(se) && se >= ss ? se - ss : 0;
        if (HC_AWAKE_STAGES.has(st.stage)) awakenings += 1;
        else asleepMs += dur;
      }
      if (asleepMs <= 0) asleepMs = inBedMs;
    }
    nights.push({
      startTime: new Date(start).toISOString(),
      endTime: new Date(end).toISOString(),
      quality: synthesizeQuality(asleepMs, inBedMs),
      disturbances: awakenings,
    });
  }
  return nights.sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime));
}

/**
 * Decide which normalized nights feed the LIVE twin (become `kind:'sleep'`
 * samples that materialize a sleep.session-logged event), given the persisted
 * `lastSyncedAt`. Returns ONLY the most-recent night, and only if it is strictly
 * AFTER lastSyncedAt (so repeated syncs of the same window don't re-fire it).
 *
 * Rationale (D2): collapsing to one session/night already removes intra-night
 * fan-out; restricting the LIVE feed to the single freshest, not-yet-synced night
 * removes the per-night fan-out + the repeated-sync double-count, so a daily
 * syncer behaves like one manual sleep log per day.
 */
export function selectLiveSleepNights(
  nights: NormalizedSleepNight[],
  lastSyncedAt: string | null,
): NormalizedSleepNight[] {
  if (nights.length === 0) return [];
  const sorted = [...nights].sort(
    (a, b) => Date.parse(a.startTime) - Date.parse(b.startTime),
  );
  const latest = sorted[sorted.length - 1]!;
  const cutoff = lastSyncedAt ? Date.parse(lastSyncedAt) : NaN;
  if (Number.isFinite(cutoff) && Date.parse(latest.startTime) <= cutoff) {
    // Already synced this night (or older) on a previous run — no live event.
    return [];
  }
  return [latest];
}

/** Turn a normalized night into the on-the-wire sleep HealthSample. */
export function sleepNightToSample(
  night: NormalizedSleepNight,
  source: HealthSample['source'],
): HealthSample {
  return {
    kind: 'sleep',
    source,
    startTime: night.startTime,
    endTime: night.endTime,
    quality: clampQuality(night.quality),
    disturbances: night.disturbances,
  };
}

/**
 * Build the LIVE sleep HealthSamples for HealthKit raw input: collapse → select
 * most-recent-not-yet-synced night → wire sample. Pure; no native imports.
 */
export function mapHealthKitSleepSamples(
  raw: RawHkSleepSample[],
  lastSyncedAt: string | null,
): HealthSample[] {
  const nights = collapseHealthKitNights(raw);
  return selectLiveSleepNights(nights, lastSyncedAt).map((n) =>
    sleepNightToSample(n, 'apple_health'),
  );
}

/**
 * Build the LIVE sleep HealthSamples for Health Connect raw input: normalize →
 * select most-recent-not-yet-synced night → wire sample. Pure; no native imports.
 */
export function mapHealthConnectSleepSamples(
  raw: RawHcSleepSession[],
  lastSyncedAt: string | null,
): HealthSample[] {
  const nights = normalizeHealthConnectNights(raw);
  return selectLiveSleepNights(nights, lastSyncedAt).map((n) =>
    sleepNightToSample(n, 'google_fit'),
  );
}
