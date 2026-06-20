import { apiClient } from './client';
import { getCurrent as getCurrentShift } from './shifts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CircadianComputePayload {
  shiftType: string;
  shiftStart: string;
  shiftEnd: string;
  sleepStart?: string;
  sleepEnd?: string;
  lightExposure?: boolean;
  timezone?: string;
}

export interface CircadianPhase {
  phase: string;
  start: string;
  end: string;
  recommendation: string;
}

export interface CircadianComputeResponse {
  phases: CircadianPhase[];
  melatoninOnset: string;
  coreBodyTempMin: string;
  alertnessScore: number;
}

export interface CircadianModel {
  id: string;
  userId: string;
  phases: CircadianPhase[];
  melatoninOnset?: string;
  lastComputed: string;
  // Extended fields returned by some backend versions
  caffeineCutoff?: string;
  insulinPeak?: string;
  peakTemperature?: string;
  entrainmentScore?: number;
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------
// The engine exposes POST /v1/circadian/profile (takes a Shift, returns curves +
// windows). There is no /compute or persisted-/model endpoint, so the helpers
// below adapt /profile to the shapes the UI expects. getModel() computes a fresh
// profile from the user's current shift; if there is no shift it throws and the
// screen falls back to its own shift-based estimates.

function toEngineShift(s: any) {
  return {
    id: String(s?.id ?? 'live'),
    userId: String(s?.userId ?? 'me'),
    shiftDate: s?.shiftDate ?? (String(s?.startTime ?? '').slice(0, 10) || new Date().toISOString().slice(0, 10)),
    startTime: s?.startTime,
    endTime: s?.endTime,
    shiftType: String(s?.type ?? s?.shiftType ?? 'NIGHT').toUpperCase(),
    sleepWindowStart: s?.sleepWindowStart ?? null,
    sleepWindowEnd: s?.sleepWindowEnd ?? null,
    workIntensity: s?.workIntensity ?? 'MODERATE',
    commuteMinutes: s?.commuteMinutes ?? 30,
    isDayOff: s?.isDayOff ?? false,
  };
}

function extremeKey(curve: Record<string, number> | undefined, dir: 'max' | 'min'): string | undefined {
  if (!curve) return undefined;
  let bestK: string | undefined;
  let bestV = dir === 'max' ? -Infinity : Infinity;
  for (const [k, v] of Object.entries(curve)) {
    if (typeof v !== 'number') continue;
    if (dir === 'max' ? v > bestV : v < bestV) { bestV = v; bestK = k; }
  }
  return bestK;
}

/** Parse a local "HH:MM" clock string into minutes-since-midnight, or null. */
function clockToMinutes(hhmm: string | undefined): number | null {
  if (typeof hhmm !== 'string') return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** The shift's end-time as minutes-since-(local)-midnight, or null. */
function shiftEndMinutes(shift: any): number | null {
  const end = shift?.endTime;
  if (typeof end !== 'string' || end.trim() === '') return null;
  const d = new Date(end);
  if (Number.isNaN(d.getTime())) return null;
  return d.getHours() * 60 + d.getMinutes();
}

/** Smallest absolute gap (in minutes) between two clock times on a 24h dial. */
function circularGapMinutes(a: number, b: number): number {
  const raw = Math.abs(a - b) % 1440;
  return Math.min(raw, 1440 - raw);
}

/**
 * Derive a REAL circadian entrainment/alignment score (0–100) from the
 * /v1/circadian/profile response, or `undefined` when no honest signal exists.
 *
 * Biology: for a well-entrained shift worker, melatonin onset should fall close
 * to the END of the shift (the engine places `melatoninOnset` ~2h before the
 * inferred sleep window, which itself starts shortly after clock-out). The
 * tighter that gap, the better the body clock is anchored to the shift. We map
 * the circular clock gap between the engine's `melatoninOnset` and the shift's
 * end time onto 0–100: 0h gap → 100, and it decays to 0 by ~6h of drift.
 *
 * Honest by construction: we return a number ONLY when BOTH the engine's
 * melatoninOnset and the shift end are parseable. Any missing/malformed signal
 * yields `undefined` (the screen/card then shows the "log more shifts" copy),
 * never a fabricated value. Pure and null-safe — never throws.
 */
function deriveEntrainmentScore(profile: any, shift: any): number | undefined {
  const onset = clockToMinutes(profile?.melatoninOnset);
  const end = shiftEndMinutes(shift);
  if (onset == null || end == null) return undefined;

  const HALF_LIFE_MIN = 360; // ~6h of melatonin/shift-end drift → score floor.
  const gap = circularGapMinutes(onset, end);
  const score = Math.round(100 * Math.max(0, 1 - gap / HALF_LIFE_MIN));
  // Clamp defensively into [0, 100] (Math already bounds it, but be explicit).
  return Math.min(100, Math.max(0, score));
}

/** Compute the circadian profile for explicit shift parameters. */
export async function compute(
  payload: CircadianComputePayload,
): Promise<CircadianComputeResponse> {
  const { data } = await apiClient.post<any>('/v1/circadian/profile', toEngineShift({
    startTime: payload.shiftStart,
    endTime: payload.shiftEnd,
    shiftType: payload.shiftType,
    sleepWindowStart: payload.sleepStart,
    sleepWindowEnd: payload.sleepEnd,
  }));
  const phases: CircadianPhase[] = [];
  if (data.melatoninOnset) phases.push({ phase: 'Melatonin Onset', start: data.melatoninOnset, end: '', recommendation: 'Dim lights and avoid bright screens.' });
  (data.optimalExerciseWindows ?? []).forEach((w: any) => phases.push({ phase: 'Optimal Exercise', start: w.start, end: w.end, recommendation: 'Best window for training.' }));
  (data.insulinSensitivityWindows ?? []).forEach((w: any) => phases.push({ phase: 'Insulin Sensitivity', start: w.start, end: w.end, recommendation: 'Time your carbohydrates here.' }));
  return {
    phases,
    melatoninOnset: data.melatoninOnset ?? '',
    coreBodyTempMin: extremeKey(data.bodyTemperatureCurve, 'min') ?? '',
    alertnessScore: 0,
  };
}

/** Compute a fresh circadian model from the user's current shift. */
export async function getModel(): Promise<CircadianModel> {
  const shift = await getCurrentShift();
  if (!shift || !(shift as any).id) throw new Error('No active shift to compute a circadian model');
  const { data } = await apiClient.post<any>('/v1/circadian/profile', toEngineShift(shift));
  return {
    id: String(data.shiftId ?? 'live'),
    userId: String(data.userId ?? (shift as any).userId ?? 'me'),
    phases: [],
    melatoninOnset: data.melatoninOnset ?? undefined,
    lastComputed: new Date().toISOString(),
    caffeineCutoff: data.caffeineMetabolismWindow?.end ?? undefined,
    insulinPeak: (Array.isArray(data.insulinSensitivityWindows) && data.insulinSensitivityWindows[0]?.start) || undefined,
    peakTemperature: extremeKey(data.bodyTemperatureCurve, 'max'),
    // REAL entrainment score derived from the profile's melatoninOnset vs the
    // shift end (see deriveEntrainmentScore). `undefined` when no honest signal
    // is derivable — keeps the CircadianModel.entrainmentScore optional contract
    // intact so circadian.tsx's `?? null` read still compiles unchanged.
    entrainmentScore: deriveEntrainmentScore(data, shift),
  };
}
