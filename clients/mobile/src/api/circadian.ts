import { apiClient } from './client';
import { getCurrent as getCurrentShift } from './shifts';
import { deriveEntrainmentScore } from '@/lib/circadian/entrainment';

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

/** The shift's end-time as minutes-since-(local)-midnight, or null. */
function shiftEndMinutes(shift: any): number | null {
  const end = shift?.endTime;
  if (typeof end !== 'string' || end.trim() === '') return null;
  const d = new Date(end);
  if (Number.isNaN(d.getTime())) return null;
  return d.getHours() * 60 + d.getMinutes();
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
    // REAL entrainment score, derived by the SHARED helper in
    // src/lib/circadian/entrainment.ts (one math, one home — this module no
    // longer duplicates the formula). We map the engine signals onto its
    // EntrainmentSignals shape: the engine's `melatoninOnset` "HH:MM" string
    // passes straight through, and the shift end goes as minutes-since-midnight
    // (the helper accepts either form). The helper returns `number | null`; we
    // coerce `null -> undefined` to keep CircadianModel.entrainmentScore's
    // optional `?: number` contract intact, so circadian.tsx's `?? null` read
    // (app/(tabs)/circadian.tsx) still compiles unchanged.
    entrainmentScore: deriveEntrainmentScore({
      melatoninOnset: data.melatoninOnset,
      shiftEnd: shiftEndMinutes(shift),
    }) ?? undefined,
  };
}
