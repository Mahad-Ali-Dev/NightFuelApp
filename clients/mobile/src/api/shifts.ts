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

/** `YYYY-MM-DD` for a date offset from `now` by `days` (local calendar day). */
function isoDateOffset(days: number, now: Date = new Date()): string {
  const d = new Date(now);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * List the signed-in user's shifts.
 *
 * The backend GET `/v1/shifts` (services/shift-service/src/routes.ts) requires
 * `start`/`end` `YYYY-MM-DD` bounds (Zod-validated) AND caps the whole-day span
 * at MAX_QUERY_RANGE_DAYS (366, @nightfuel/config range-bounds), rejecting a
 * wider window with 400. So we pass roughly half a year either side of today
 * (-182..+183 = 365 whole days, inside the 366 cap) — still ample for a
 * shift-link picker and for the dashboard NextShiftCard, which only needs the
 * near future — without an unbounded scan. `userId` is ignored by the server
 * (it uses the JWT), so it is never sent. The kind is persisted under
 * `shiftType`; mirror getCurrent's normalisation onto `type` so callers read
 * one field. A non-array body degrades to `[]` rather than throwing.
 */
export async function list(): Promise<Shift[]> {
  const { data } = await apiClient.get<any[]>('/v1/shifts', {
    params: { start: isoDateOffset(-182), end: isoDateOffset(183) },
  });
  return Array.isArray(data)
    ? data.map((s) => ({ ...s, type: s.type ?? s.shiftType }) as Shift)
    : [];
}
