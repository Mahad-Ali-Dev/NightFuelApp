/**
 * Tests for src/api/notifications.ts.
 *
 * Focus: the `data.data` unwrap in getAll(), the markRead() PUT path, and the
 * preferences get (defaults-merge + fallback-on-error) / save behaviour.
 */

jest.mock('@/api/client', () => ({
  apiClient: {
    get: jest.fn(),
    put: jest.fn(),
  },
}));

import {
  getAll,
  markRead,
  getNotificationPreferences,
  saveNotificationPreferences,
  type Notification,
} from '@/api/notifications';
import { apiClient } from '@/api/client';

const mockedGet = apiClient.get as jest.Mock;
const mockedPut = apiClient.put as jest.Mock;

const sampleNotification: Notification = {
  id: 'n_1',
  userId: 'u_1',
  type: 'PLAN_READY',
  title: 'Your plan is ready',
  body: 'Tap to view tonight’s plan.',
  isRead: false,
  createdAt: '2026-06-13T22:00:00.000Z',
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getAll', () => {
  test('unwraps the { data, count } envelope and returns the inner array', async () => {
    mockedGet.mockResolvedValueOnce({
      data: { data: [sampleNotification], count: 1 },
    });

    const result = await getAll();

    expect(mockedGet).toHaveBeenCalledWith('/v1/notifications/');
    expect(result).toEqual([sampleNotification]);
  });

  test('returns [] when the inner data field is missing/null', async () => {
    mockedGet.mockResolvedValueOnce({ data: { count: 0 } });

    const result = await getAll();

    expect(result).toEqual([]);
  });

  test('surfaces the server `isRead` field (not `read`) on each notification', async () => {
    // The notification-service serialises the read flag as `isRead`
    // (notificationResponseSchema). getAll() passes the row through verbatim, so
    // the read state must be reachable via `isRead` — guards against the field
    // silently reverting to `read`, which would always read back undefined.
    mockedGet.mockResolvedValueOnce({
      data: { data: [{ ...sampleNotification, isRead: true }], count: 1 },
    });

    const [n] = await getAll();

    expect(n.isRead).toBe(true);
  });
});

describe('markRead', () => {
  test('PUTs to the /{id}/read path and returns the updated notification', async () => {
    const updated = { ...sampleNotification, isRead: true };
    mockedPut.mockResolvedValueOnce({ data: updated });

    const result = await markRead('n_1');

    expect(mockedPut).toHaveBeenCalledWith('/v1/notifications/n_1/read');
    expect(result.isRead).toBe(true);
  });

  test('interpolates arbitrary ids into the URL path', async () => {
    mockedPut.mockResolvedValueOnce({ data: sampleNotification });

    await markRead('abc-123');

    expect(mockedPut).toHaveBeenCalledWith('/v1/notifications/abc-123/read');
  });
});

describe('getNotificationPreferences', () => {
  test('merges server values over the defaults', async () => {
    // Server only returns a subset; everything else should fall back to default.
    mockedGet.mockResolvedValueOnce({
      data: { workoutReminderEnabled: false, quietHoursStart: '23:30' },
    });

    const prefs = await getNotificationPreferences();

    expect(mockedGet).toHaveBeenCalledWith('/v1/notifications/preferences');
    // Overridden by server:
    expect(prefs.workoutReminderEnabled).toBe(false);
    expect(prefs.quietHoursStart).toBe('23:30');
    // Untouched defaults:
    expect(prefs.mealReminderEnabled).toBe(true);
    expect(prefs.quietHoursEnd).toBe('07:00');
  });

  test('falls back to the full default set when the request throws', async () => {
    mockedGet.mockRejectedValueOnce(new Error('no preference row'));

    const prefs = await getNotificationPreferences();

    // A representative spread of the defaults — proves we returned them, not {}.
    expect(prefs.workoutReminderEnabled).toBe(true);
    expect(prefs.coachMessageEnabled).toBe(true);
    expect(prefs.quietHoursStart).toBe('22:00');
    expect(prefs.quietHoursEnd).toBe('07:00');
  });
});

describe('saveNotificationPreferences', () => {
  test('PUTs the partial preference patch to /preferences', async () => {
    mockedPut.mockResolvedValueOnce({ data: {} });

    await saveNotificationPreferences({ sleepReminderEnabled: false });

    expect(mockedPut).toHaveBeenCalledWith('/v1/notifications/preferences', {
      sleepReminderEnabled: false,
    });
  });
});
