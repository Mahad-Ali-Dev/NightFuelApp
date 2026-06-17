import { apiClient } from './client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A user-scheduled training session, surfaced on the Training Calendar's
 * "Scheduled Sessions" list. Mirrors the shift-service `ScheduledSession`
 * Prisma model (services/shift-service/prisma/schema.prisma); Date fields
 * arrive as ISO strings over the wire.
 */
export interface ScheduledSession {
  id: string;
  userId: string;
  title: string;
  scheduledAt: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  /**
   * OPTIONAL uuid of the shift this session is linked to, or `null`/absent when
   * unlinked. The CREATE side ((performance)/calendar.tsx) attaches it via the
   * optional `shiftId` payload field; the field is kept optional here so both
   * existing consumers AND the `200 []` body returned while the user-gated
   * scheduled_sessions migration (notably its `shiftId` COLUMN) is un-run still
   * type-check. Drives {@link getScheduledSessionsForShift}.
   */
  shiftId?: string | null;
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

/**
 * Fetch the signed-in user's scheduled training sessions.
 *
 * The backend (shift-service `/v1/training`) returns `200 []` while the
 * user-gated scheduled_sessions migration is un-run, so callers can render an
 * honest empty state without special-casing a missing endpoint. The `/v1`
 * prefix policy is handled by the {@link apiClient} interceptor.
 */
export async function getScheduledSessions(): Promise<ScheduledSession[]> {
  const { data } = await apiClient.get<ScheduledSession[]>(
    '/v1/training/scheduled-sessions',
  );
  return data;
}

/**
 * Request body for {@link createScheduledSession}. Mirrors the shift-service
 * `createScheduledSessionSchema` (services/shift-service/src/training.routes.ts):
 * `title` 1-200 chars, `scheduledAt` a full ISO-8601 datetime, `notes` an
 * optional ≤2000-char string, and `shiftId` an OPTIONAL uuid linking the
 * session to one of the caller's OWN shifts. `userId` is never sent — the
 * backend injects it from the verified JWT.
 */
export interface CreateScheduledSessionPayload {
  title: string;
  scheduledAt: string;
  notes?: string;
  shiftId?: string;
}

/**
 * Create a scheduled training session.
 *
 * POSTs to `/v1/training/scheduled-sessions` and resolves with the created
 * row. The caller is responsible for omitting `shiftId` when no shift is
 * linked (the backend contract treats it as strictly optional and rejects a
 * non-uuid value). Errors are NOT swallowed here so a caller's mutation can
 * classify them — notably a `503` while the user-gated scheduled_sessions
 * migration is un-run on the VPS.
 */
export async function createScheduledSession(
  payload: CreateScheduledSessionPayload,
): Promise<ScheduledSession> {
  const { data } = await apiClient.post<ScheduledSession>(
    '/v1/training/scheduled-sessions',
    payload,
  );
  return data;
}

/**
 * Fetch only the caller's scheduled sessions linked to a given `shiftId`.
 *
 * This is the inverse of the CREATE-side shift link (a session is attached to a
 * shift via the optional `shiftId` payload field in {@link createScheduledSession});
 * it is the data dependency for the shift-detail screen's "sessions on this
 * shift" section. There is NO dedicated shift-scoped endpoint — this reuses the
 * SAME `GET /v1/training/scheduled-sessions` read as {@link getScheduledSessions}
 * and filters client-side, so it inherits that endpoint's contract:
 *
 *   - While the user-gated scheduled_sessions migration is un-run on the VPS,
 *     the backend answers `200 []` (a missing table OR a missing `shiftId`
 *     column degrades to an empty list server-side — see
 *     services/shift-service/src/training.routes.ts). This read therefore
 *     degrades to an honest empty list: it MUST NOT special-case a missing
 *     endpoint and MUST NOT throw on `[]`.
 *   - A non-array body is treated defensively as "no sessions" (returns `[]`)
 *     rather than throwing, so a transiently malformed payload can't crash the
 *     shift-detail screen.
 *
 * Real HTTP failures (network error, 4xx/5xx) are NOT swallowed — they
 * propagate from {@link getScheduledSessions} so the screen's error branch can
 * surface a retry. Only the `[]`/non-array body degrades silently.
 */
export async function getScheduledSessionsForShift(
  shiftId: string,
): Promise<ScheduledSession[]> {
  const data = await getScheduledSessions();
  if (!Array.isArray(data)) return [];
  return data.filter((s) => s.shiftId === shiftId);
}
