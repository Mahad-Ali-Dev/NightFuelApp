/**
 * Tests for the useCircadianReminders effect — the scheduling/cancellation
 * orchestration around buildShiftReminders.
 *
 * All native + network boundaries are mocked:
 *   - expo-constants  -> control IS_EXPO_GO (appOwnership)
 *   - expo-notifications (lazy-required inside the effect) -> spy on schedule/cancel
 *   - @/api/shifts, @/api/notifications -> feed shift + prefs without a server
 *   - @/store/authStore -> control the logged-in user
 *
 * NOTE on the Expo-Go branch: IS_EXPO_GO is captured once at module load from
 * Constants.appOwnership, so the "expo" case is exercised in its own isolated
 * module registry (jest.isolateModules + a per-case appOwnership) rather than by
 * mutating it after import.
 */
import { renderHook, waitFor } from '@testing-library/react-native';

// ── Mock the lazily-required native module ────────────────────────────────────
const mockGetPermissions = jest.fn();
const mockGetAllScheduled = jest.fn();
const mockCancelScheduled = jest.fn();
const mockScheduleNotification = jest.fn();

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: (...a: unknown[]) => mockGetPermissions(...a),
  getAllScheduledNotificationsAsync: (...a: unknown[]) => mockGetAllScheduled(...a),
  cancelScheduledNotificationAsync: (...a: unknown[]) => mockCancelScheduled(...a),
  scheduleNotificationAsync: (...a: unknown[]) => mockScheduleNotification(...a),
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));

// ── Mock the API layer ────────────────────────────────────────────────────────
const mockGetCurrentShift = jest.fn();
const mockGetPrefs = jest.fn();
jest.mock('@/api/shifts', () => ({ getCurrent: (...a: unknown[]) => mockGetCurrentShift(...a) }));
jest.mock('@/api/notifications', () => ({
  getNotificationPreferences: (...a: unknown[]) => mockGetPrefs(...a),
}));

// ── Mock expo-constants (controls IS_EXPO_GO at module load) ───────────────────
// Default: NOT Expo Go, so the effect runs end-to-end.
jest.mock('expo-constants', () => ({ __esModule: true, default: { appOwnership: 'standalone' } }));

// ── Mock the auth store ────────────────────────────────────────────────────────
let mockUser: { id: string } | null = { id: 'user-1' };
jest.mock('@/store/authStore', () => ({
  useAuthStore: () => ({ user: mockUser }),
}));

// Imported AFTER the mocks above are registered.
import { useCircadianReminders } from '@/hooks/useCircadianReminders';

// A far-future shift so every reminder is comfortably > now + 60s.
function futureShift() {
  const start = new Date(Date.now() + 24 * 3_600_000); // +24h
  const end = new Date(start.getTime() + 8 * 3_600_000); // +8h
  return { startTime: start.toISOString(), endTime: end.toISOString() };
}

const grantedPerm = { status: 'granted' as const };

// The hook emits an informational `console.warn` under __DEV__ after scheduling.
// Silence it so the suite output stays clean; restored in afterAll.
let warnSpy: jest.SpyInstance;

beforeAll(() => {
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterAll(() => {
  warnSpy.mockRestore();
});

beforeEach(() => {
  jest.clearAllMocks();
  warnSpy.mockImplementation(() => {}); // clearAllMocks wipes the impl; re-silence
  mockUser = { id: 'user-1' };
  // Sensible defaults; individual tests override as needed.
  mockGetPermissions.mockResolvedValue(grantedPerm);
  mockGetAllScheduled.mockResolvedValue([]);
  mockCancelScheduled.mockResolvedValue(undefined);
  mockScheduleNotification.mockResolvedValue('sched-id');
  mockGetCurrentShift.mockResolvedValue(futureShift());
  mockGetPrefs.mockResolvedValue(null);
});

describe('useCircadianReminders', () => {
  test('schedules all seven reminders for a future shift when prefs allow', async () => {
    renderHook(() => useCircadianReminders());
    await waitFor(() => expect(mockScheduleNotification).toHaveBeenCalledTimes(7));

    // Each scheduled notification carries the reminder tag + a DATE trigger.
    for (const call of mockScheduleNotification.mock.calls) {
      const arg = call[0];
      expect(arg.content.data.nfReminderId).toEqual(expect.any(String));
      expect(arg.content.data.url).toBe('/(tabs)/circadian');
      expect(arg.trigger.type).toBe('date');
      expect(arg.trigger.date).toBeInstanceOf(Date);
    }

    // The tagged ids match buildShiftReminders' output set (now includes
    // 'nf-bright-light' as the reconciliation anchor with the coach card's
    // brightLightWindow, and 'nf-avoid-light' as the analogous anchor for the
    // card's avoidLight / blue-blocker window — see buildShiftReminders for the
    // source of truth).
    const ids = mockScheduleNotification.mock.calls.map((c) => c[0].content.data.nfReminderId).sort();
    expect(ids).toEqual(
      [
        'nf-avoid-light',
        'nf-bright-light',
        'nf-caffeine-cutoff',
        'nf-log-sleep',
        'nf-midshift-fuel',
        'nf-preshift-meal',
        'nf-winddown',
      ].sort(),
    );
  });

  test('does nothing when there is no logged-in user', async () => {
    mockUser = null;
    renderHook(() => useCircadianReminders());
    // Give any (incorrectly-fired) async work a tick to run.
    await new Promise((r) => setTimeout(r, 0));
    expect(mockGetPermissions).not.toHaveBeenCalled();
    expect(mockScheduleNotification).not.toHaveBeenCalled();
  });

  test('bails out when notification permission is not granted', async () => {
    mockGetPermissions.mockResolvedValue({ status: 'denied' });
    renderHook(() => useCircadianReminders());
    await waitFor(() => expect(mockGetPermissions).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(mockGetCurrentShift).not.toHaveBeenCalled();
    expect(mockScheduleNotification).not.toHaveBeenCalled();
  });

  test('does not schedule anything when there is no current shift', async () => {
    mockGetCurrentShift.mockResolvedValue(null);
    renderHook(() => useCircadianReminders());
    await waitFor(() => expect(mockGetCurrentShift).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(mockScheduleNotification).not.toHaveBeenCalled();
  });

  test('does not schedule when the shift is missing start/end timestamps', async () => {
    mockGetCurrentShift.mockResolvedValue({ id: 's1' }); // no startTime/endTime
    renderHook(() => useCircadianReminders());
    await waitFor(() => expect(mockGetCurrentShift).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(mockScheduleNotification).not.toHaveBeenCalled();
  });

  test('cancels previously-scheduled NightFuel reminders before re-scheduling', async () => {
    mockGetAllScheduled.mockResolvedValue([
      { identifier: 'old-1', content: { data: { nfReminderId: 'nf-winddown' } } },
      { identifier: 'old-2', content: { data: { nfReminderId: 'nf-log-sleep' } } },
      // Foreign notification (not ours) — must be left alone.
      { identifier: 'foreign', content: { data: { someOtherTag: true } } },
      { identifier: 'no-data', content: {} },
    ]);

    renderHook(() => useCircadianReminders());
    await waitFor(() => expect(mockScheduleNotification).toHaveBeenCalledTimes(7));

    expect(mockCancelScheduled).toHaveBeenCalledTimes(2);
    const cancelled = mockCancelScheduled.mock.calls.map((c) => c[0]).sort();
    expect(cancelled).toEqual(['old-1', 'old-2']);
    expect(cancelled).not.toContain('foreign');
    expect(cancelled).not.toContain('no-data');
  });

  test('skips reminders whose preference is explicitly disabled', async () => {
    // Disable meal reminders -> the two mealReminderEnabled reminders drop out,
    // leaving the five sleepReminderEnabled ones (including the 'nf-bright-light'
    // and 'nf-avoid-light' anchors, which both piggy-back on the sleep toggle).
    mockGetPrefs.mockResolvedValue({ mealReminderEnabled: false, sleepReminderEnabled: true });

    renderHook(() => useCircadianReminders());
    await waitFor(() => expect(mockScheduleNotification).toHaveBeenCalledTimes(5));

    const ids = mockScheduleNotification.mock.calls.map((c) => c[0].content.data.nfReminderId);
    expect(ids).not.toContain('nf-preshift-meal');
    expect(ids).not.toContain('nf-midshift-fuel');
    expect(ids).toEqual(
      expect.arrayContaining([
        'nf-bright-light',
        'nf-caffeine-cutoff',
        'nf-winddown',
        'nf-log-sleep',
        'nf-avoid-light',
      ]),
    );
  });

  test('skips reminders whose fire time is in the past', async () => {
    // A shift that already ended: start -10h, end -2h. Every derived time is
    // <= end + 9h... but pre-shift/mid/caffeine/wind-down are all in the past.
    // Only nf-log-sleep (end + 9h = +7h from now) remains in the future.
    const start = new Date(Date.now() - 10 * 3_600_000);
    const end = new Date(Date.now() - 2 * 3_600_000);
    mockGetCurrentShift.mockResolvedValue({
      startTime: start.toISOString(),
      endTime: end.toISOString(),
    });

    renderHook(() => useCircadianReminders());
    await waitFor(() => expect(mockScheduleNotification).toHaveBeenCalledTimes(1));
    expect(mockScheduleNotification.mock.calls[0][0].content.data.nfReminderId).toBe('nf-log-sleep');
  });

  test('swallows API errors and schedules nothing (best-effort)', async () => {
    mockGetCurrentShift.mockRejectedValue(new Error('network down'));
    mockGetPrefs.mockRejectedValue(new Error('network down'));
    renderHook(() => useCircadianReminders());
    await waitFor(() => expect(mockGetPermissions).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    // getCurrent rejected but is .catch(()=>null)'d -> treated as "no shift".
    expect(mockScheduleNotification).not.toHaveBeenCalled();
  });
});
