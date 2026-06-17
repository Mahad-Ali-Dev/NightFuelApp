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
