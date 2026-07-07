/**
 * useCircadianReminders Expo-Go behaviour.
 *
 * IS_EXPO_GO is captured once, at module load, from Constants.appOwnership.
 * Rather than fight the module registry to flip it after import, this file
 * mocks expo-constants with appOwnership === 'expo' from the very start, so the
 * hook is loaded in its Expo-Go configuration and must short-circuit.
 *
 * Local scheduled notifications are not delivered in Expo Go (SDK 53+), so the
 * effect should no-op: it must not even probe permissions or hit the API.
 */
import { renderHook } from '@testing-library/react-native';

// appOwnership 'expo' === running inside Expo Go.
jest.mock('expo-constants', () => ({ __esModule: true, default: { appOwnership: 'expo' } }));

const mockGetPermissions = jest.fn();
const mockScheduleNotification = jest.fn();
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: (...a: unknown[]) => mockGetPermissions(...a),
  getAllScheduledNotificationsAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  scheduleNotificationAsync: (...a: unknown[]) => mockScheduleNotification(...a),
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));

const mockGetCurrentShift = jest.fn();
jest.mock('@/api/shifts', () => ({ getCurrent: (...a: unknown[]) => mockGetCurrentShift(...a) }));
jest.mock('@/api/notifications', () => ({ getNotificationPreferences: jest.fn() }));

// A real, logged-in user — so the only reason to bail is the Expo-Go guard.
jest.mock('@/store/authStore', () => ({ useAuthStore: () => ({ user: { id: 'user-1' } }) }));

import { useCircadianReminders } from '@/hooks/useCircadianReminders';

describe('useCircadianReminders (inside Expo Go)', () => {
  test('no-ops: never probes permissions, the API, or schedules anything', async () => {
    renderHook(() => useCircadianReminders());
    await new Promise((r) => setTimeout(r, 0));

    expect(mockGetPermissions).not.toHaveBeenCalled();
    expect(mockGetCurrentShift).not.toHaveBeenCalled();
    expect(mockScheduleNotification).not.toHaveBeenCalled();
  });
});
