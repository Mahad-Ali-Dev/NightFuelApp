import { apiClient } from './client';

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

/** Compute the circadian profile for the given shift parameters. */
export async function compute(
  payload: CircadianComputePayload,
): Promise<CircadianComputeResponse> {
  const { data } = await apiClient.post<CircadianComputeResponse>(
    '/v1/circadian/compute',
    payload,
  );
  return data;
}

/** Retrieve the latest persisted circadian model. */
export async function getModel(): Promise<CircadianModel> {
  const { data } = await apiClient.get<CircadianModel>('/v1/circadian/model');
  return data;
}
