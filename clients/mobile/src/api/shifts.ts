import { apiClient } from './client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Shift {
  id: string;
  userId: string;
  type: string;
  startTime: string;
  endTime: string;
  timezone: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateShiftPayload {
  shiftType: string;
  shiftDate: string;
  startTime: string;
  endTime: string;
  timezone?: string;
}

export interface UpdateShiftPayload {
  shiftType?: string;
  shiftDate?: string;
  startTime?: string;
  endTime?: string;
  timezone?: string;
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

/** Fetch the user's current active shift (null when none is scheduled). */
export async function getCurrent(): Promise<Shift | null> {
  const { data } = await apiClient.get<any>('/v1/shifts/current');
  // Backend sends 204 (empty body) when there is no active shift, and persists
  // the kind under `shiftType` — normalise to `type` so the whole app can read
  // a single field without crashing on a missing `.type`.
  if (!data || typeof data !== 'object') return null;
  return { ...data, type: data.type ?? data.shiftType } as Shift;
}

/** Create a new shift. */
export async function create(payload: CreateShiftPayload): Promise<Shift> {
  const { data } = await apiClient.post<Shift>('/v1/shifts', payload);
  return data;
}

/** Update an existing shift. */
export async function update(
  id: string,
  payload: UpdateShiftPayload,
): Promise<Shift> {
  const { data } = await apiClient.put<Shift>(`/v1/shifts/${id}`, payload);
  return data;
}
