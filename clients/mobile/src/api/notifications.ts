import { apiClient } from './client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Notification {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  data?: Record<string, unknown>;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

/** Fetch all notifications for the current user. */
export async function getAll(): Promise<Notification[]> {
  const { data } = await apiClient.get<{ data: Notification[]; count: number }>('/v1/notifications/');
  return data.data ?? [];
}

/** Mark a notification as read. */
export async function markRead(id: string): Promise<Notification> {
  const { data } = await apiClient.put<Notification>(`/v1/notifications/${id}/read`);
  return data;
}

// ── Notification Preferences ──────────────────────────────────────────────────
// Field names exactly match the notification-service Prisma schema + Zod schemas.

export interface NotificationPreferences {
  workoutReminderEnabled: boolean;
  mealReminderEnabled: boolean;
  shiftAlertEnabled: boolean;
  planReadyEnabled: boolean;
  adherenceAlertEnabled: boolean;
  sleepReminderEnabled: boolean;
  streakUpdateEnabled: boolean;
  weeklyReportEnabled: boolean;
  coachMessageEnabled: boolean;
  quietHoursStart: string; // "HH:MM" 24-hour e.g. "22:00"
  quietHoursEnd: string;   // "HH:MM" 24-hour e.g. "07:00"
}

const DEFAULT_PREFERENCES: NotificationPreferences = {
  workoutReminderEnabled: true,
  mealReminderEnabled: true,
  shiftAlertEnabled: true,
  planReadyEnabled: true,
  adherenceAlertEnabled: true,
  sleepReminderEnabled: true,
  streakUpdateEnabled: true,
  weeklyReportEnabled: true,
  coachMessageEnabled: true,
  quietHoursStart: '22:00',
  quietHoursEnd: '07:00',
};

/** Get notification preferences from backend (falls back to sensible defaults). */
export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  try {
    const { data } = await apiClient.get<NotificationPreferences>('/v1/notifications/preferences');
    return { ...DEFAULT_PREFERENCES, ...data };
  } catch {
    // Fallback: return defaults (user may not have a preference row yet)
    return DEFAULT_PREFERENCES;
  }
}

/** Save notification preferences (partial update — only changed fields needed). */
export async function saveNotificationPreferences(
  prefs: Partial<NotificationPreferences>,
): Promise<void> {
  await apiClient.put('/v1/notifications/preferences', prefs);
}
