/**
 * measurementStore.ts — on-device history of camera-PPG heart-rate measurements.
 *
 * Camera readings ALSO flow to the server twin via `ingestHealthSamples` (kind
 * 'heartRate', source 'camera_ppg'), but there is no server-side HR-history READ
 * endpoint today, and the per-measurement TAG (resting / pre-/post-workout) isn't
 * part of the health-sample schema. So the browsable, tagged history lives here,
 * locally — self-contained, offline-friendly, and private to the device.
 *
 * Storage: one AsyncStorage key (`nf.hr.measurements`, matching the `nf.*`
 * convention used by src/lib/ble/bleManager.ts) holding a JSON array, newest
 * first, capped at {@link MAX_MEASUREMENTS}.
 *
 * Never-throw discipline (mirrors the storage helpers in bleManager): a corrupt
 * blob or a failed read resolves to `[]`; a failed write is swallowed. History is
 * a nicety, never a source of crashes.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PpgQuality } from './ppgSignal';

const STORAGE_KEY = 'nf.hr.measurements';
/** Keep history bounded — plenty for a personal log, cheap to read/parse. */
export const MAX_MEASUREMENTS = 100;

/** Context tag for a reading. `none` = untagged. */
export type MeasurementTag = 'resting' | 'pre-workout' | 'post-workout' | 'none';

/** Selectable tags for the UI picker (ordered), excluding the `none` default. */
export const MEASUREMENT_TAGS: { key: MeasurementTag; label: string }[] = [
  { key: 'resting', label: 'Resting' },
  { key: 'pre-workout', label: 'Pre-workout' },
  { key: 'post-workout', label: 'Post-workout' },
];

/** A saved camera-PPG measurement. */
export interface HrMeasurement {
  id: string;
  /** ISO-8601 timestamp of when the measurement completed. */
  ts: string;
  bpm: number;
  /** 0–1 confidence from the estimator at capture time. */
  confidence: number;
  quality: PpgQuality;
  tag: MeasurementTag;
  /** Always 'camera_ppg' — this store is camera-only. */
  source: 'camera_ppg';
}

/** The fields a caller supplies; id/ts/source are filled in by {@link addMeasurement}. */
export type NewMeasurement = Pick<HrMeasurement, 'bpm' | 'confidence' | 'quality' | 'tag'>;

/** Short, collision-resistant id (time + random suffix). Runtime-only, so Date/Math are fine. */
function genId(): string {
  return `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

/** Coerce an unknown parsed blob into a clean, bounded list (drops junk entries). */
function sanitize(raw: unknown): HrMeasurement[] {
  if (!Array.isArray(raw)) return [];
  const out: HrMeasurement[] = [];
  for (const r of raw) {
    if (
      r &&
      typeof r.id === 'string' &&
      typeof r.ts === 'string' &&
      typeof r.bpm === 'number' &&
      Number.isFinite(r.bpm)
    ) {
      out.push({
        id: r.id,
        ts: r.ts,
        bpm: r.bpm,
        confidence: typeof r.confidence === 'number' ? r.confidence : 0,
        quality: r.quality === 'good' || r.quality === 'fair' ? r.quality : 'poor',
        tag:
          r.tag === 'resting' || r.tag === 'pre-workout' || r.tag === 'post-workout'
            ? r.tag
            : 'none',
        source: 'camera_ppg',
      });
    }
  }
  return out.slice(0, MAX_MEASUREMENTS);
}

/** Read the history, newest first. Resolves to `[]` on any error (never throws). */
export async function listMeasurements(): Promise<HrMeasurement[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return sanitize(JSON.parse(raw));
  } catch {
    return [];
  }
}

/**
 * Prepend a new measurement and persist. Returns the updated (bounded) list so
 * the caller can update UI state without a second read. Swallows write errors
 * (returns the would-be list regardless).
 */
export async function addMeasurement(m: NewMeasurement): Promise<HrMeasurement[]> {
  const record: HrMeasurement = {
    id: genId(),
    ts: new Date().toISOString(),
    bpm: Math.round(m.bpm),
    confidence: m.confidence,
    quality: m.quality,
    tag: m.tag,
    source: 'camera_ppg',
  };
  const next = [record, ...(await listMeasurements())].slice(0, MAX_MEASUREMENTS);
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* history is best-effort — never block a saved reading on a storage failure */
  }
  return next;
}

/** Wipe all saved measurements. Idempotent; never throws. */
export async function clearMeasurements(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    /* idempotent */
  }
}
