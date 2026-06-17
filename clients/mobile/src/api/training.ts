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
