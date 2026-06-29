/**
 * profile.errorStates.test.tsx
 *
 * Honest-state coverage for the rebuilt You/Profile tab — `app/(tabs)/profile.tsx`.
 *
 * The 1:1 mockup rebuild dropped the old circadian-phase card, cycle tracker,
 * fatigue/adherence pills and the per-pill "Unavailable / Retry" affordance. What
 * REMAINS load-bearing is the honest-state contract on the stat row + level badge:
 * a FAILED secondary fetch must render '—' (Streak / Days) and "LVL —", NEVER the
 * misleading '0' / 'LVL 1' a genuinely-zeroed brand-new user would show. A real
 * zeroed user (queries succeed with zeros) still shows '0' / 'LVL 1'.
 *
 * Harness mirrors the sibling dashboard/nutrition suites: a per-queryKey useQuery
 * stub the tests drive, with the api/native modules stubbed so nothing touches
 * axios or native code.
 */

// ── jest.mock hoisting block (runs ABOVE the imports) ────────────────────────
type QState = { data: any; isLoading: boolean; isError: boolean };
const mockProfile: QState = { data: { displayName: 'Test User' }, isLoading: false, isError: false };
const mockStatus: QState = { data: undefined, isLoading: false, isError: false };
const mockStats: QState = { data: undefined, isLoading: false, isError: false };
const mockStreak: QState = { data: undefined, isLoading: false, isError: false };

jest.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    const key = queryKey[0];
    if (key === 'my-profile') return { data: mockProfile.data, isLoading: mockProfile.isLoading, isError: mockProfile.isError, refetch: jest.fn() };
    if (key === 'my-status') return { data: mockStatus.data, isLoading: mockStatus.isLoading, isError: mockStatus.isError, refetch: jest.fn() };
    if (key === 'profile-weekly-stats') return { data: mockStats.data, isLoading: mockStats.isLoading, isError: mockStats.isError, refetch: jest.fn() };
    if (key === 'profile-streak') return { data: mockStreak.data, isLoading: mockStreak.isLoading, isError: mockStreak.isError, refetch: jest.fn() };
    return { data: undefined, isLoading: false, isError: false, refetch: jest.fn() };
  },
}));

jest.mock('@/api/profile', () => ({ getMyProfile: jest.fn(), getStatus: jest.fn() }));
jest.mock('@/api/progress', () => ({ getWeeklyStats: jest.fn(), getStreak: jest.fn() }));
jest.mock('@/api/exercises', () => ({ getRecent: jest.fn(() => Promise.resolve([])) }));
// profile.tsx imports TAB_BAR_H from (tabs)/_layout, which pulls in the Ria FAB +
// AsyncStorage at module load — unmocked, that throws and the suite fails to even
// load (same fix the dashboard tests already carry). Stub the constant.
jest.mock('../../app/(tabs)/_layout', () => ({ TAB_BAR_H: 64 }));

jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { name: 'Test User', role: 'user', shiftType: 'night' }, logout: jest.fn() }),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));

jest.mock('@expo/vector-icons', () => {
  const { Text: RNText } = require('react-native');
  return { Ionicons: ({ name }: { name?: string }) => <RNText>{`icon:${name ?? ''}`}</RNText> };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));

jest.mock('expo-image', () => {
  const RN = require('react-native');
  return { Image: (props: any) => <RN.View {...props} /> };
});

jest.mock('expo-linear-gradient', () => {
  const RN = require('react-native');
  return { LinearGradient: (props: any) => <RN.View {...props} /> };
});

jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

// ── Imports (run AFTER the hoisted mocks above) ──────────────────────────────
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import {
  ThemeContext,
  getThemeColors,
  typography,
  spacing,
  borderRadius,
  shadows,
} from '@/theme';
import ProfileScreen from '../../app/(tabs)/profile';

function renderScreen() {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      <ProfileScreen />
    </ThemeContext.Provider>,
  );
}

describe('ProfileScreen — honest stat-row + level state', () => {
  beforeEach(() => {
    mockProfile.data = { displayName: 'Test User' };
    mockProfile.isLoading = false; mockProfile.isError = false;
    mockStatus.data = undefined; mockStatus.isLoading = false; mockStatus.isError = false;
    mockStats.data = undefined; mockStats.isLoading = false; mockStats.isError = false;
    mockStreak.data = undefined; mockStreak.isLoading = false; mockStreak.isError = false;
  });

  test('renders the core scaffold (name, sections, menu) without crashing', () => {
    expect(() => renderScreen()).not.toThrow();
    expect(screen.getByText('Test User')).toBeTruthy();
    expect(screen.getByText('Achievements')).toBeTruthy();
    expect(screen.getByText('Consistency')).toBeTruthy();
    expect(screen.getByText('Appearance & theme')).toBeTruthy();
    expect(screen.getByText('Notifications')).toBeTruthy();
    expect(screen.getByText('Account & settings')).toBeTruthy();
  });

  test('errored stats + streak → honest "—" (Streak / Days) + "LVL —", NOT "0" / "LVL 1"', () => {
    mockStats.isError = true;
    mockStreak.isError = true;
    renderScreen();

    // Honest dashes, not fake zeros.
    expect(screen.getByLabelText('Streak, —')).toBeTruthy();
    expect(screen.getByLabelText('Days, —')).toBeTruthy();
    expect(screen.getByText('LVL —')).toBeTruthy();
    expect(screen.getByLabelText('Level unavailable')).toBeTruthy();
    // The misleading healthy-zeroed values must be ABSENT.
    expect(screen.queryByText('LVL 1')).toBeNull();
    expect(screen.queryByLabelText('Streak, 0')).toBeNull();
  });

  test('genuinely zeroed user (queries succeed with zeros) shows "0" / "LVL 1"', () => {
    mockStats.data = { daysLogged: 0 };
    mockStreak.data = { current: 0, longest: 0 };
    renderScreen();

    expect(screen.getByLabelText('Streak, 0')).toBeTruthy();
    expect(screen.getByLabelText('Days, 0')).toBeTruthy();
    expect(screen.getByText('LVL 1')).toBeTruthy();
    expect(screen.getByLabelText('Level 1')).toBeTruthy();
    // No error dashes in the stat row.
    expect(screen.queryByLabelText('Streak, —')).toBeNull();
    expect(screen.queryByText('LVL —')).toBeNull();
  });

  test('real data → level + streak derive correctly (42 days logged → LVL 7)', () => {
    mockStats.data = { daysLogged: 42 };
    mockStreak.data = { current: 12, longest: 30 };
    renderScreen();

    expect(screen.getByText('LVL 7')).toBeTruthy(); // floor(42/7)+1
    expect(screen.getByLabelText('Streak, 12')).toBeTruthy();
    expect(screen.getByLabelText('Days, 42')).toBeTruthy();
  });
});
