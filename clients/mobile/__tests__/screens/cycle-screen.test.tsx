/**
 * cycle-screen.test.tsx
 *
 * Screen-level coverage for the dedicated cycle screen (F28) —
 * app/(performance)/cycle.tsx. The whole feature is GATED on the user having
 * cycle tracking enabled AND being female (read from GET /v1/users/me:
 * cycleTrackingEnabled + biologicalSex).
 *
 * Pins:
 *   1. NON-TRACKING / NON-FEMALE user → the feature is hidden: the "Cycle
 *      tracking is off" empty state renders and NONE of the calendar / log /
 *      history surfaces mount (no "LOG PERIOD" / "CYCLE HISTORY" copy).
 *   2. ELIGIBLE user (tracking on + female) → the calendar, the LOG PERIOD
 *      action, the CYCLE HISTORY card and the "not medical advice" disclaimer
 *      all render.
 *
 * Mock conventions mirror body-metrics: react-query useQuery branches on
 * queryKey[0] off a mutable holder set per-test BEFORE render; useMutation /
 * useQueryClient are benign; the API modules and child native leaves are stubbed.
 *
 * Additive: NEW test file only.
 */

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

jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

// MedicalDisclaimerBanner pulls in AsyncStorage (the first-run ack modal); mock
// it so the native module doesn't blow up the import graph.
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
}));

jest.mock('@/components/SafeBlurView', () => {
  const RN = require('react-native');
  return { SafeBlurView: ({ children, ...props }: any) => <RN.View {...props}>{children}</RN.View> };
});

jest.mock('expo-linear-gradient', () => {
  const RN = require('react-native');
  return { LinearGradient: (props: any) => <RN.View {...props} /> };
});

jest.mock('@/components/ui/DateTimeField', () => {
  const { Text: RNText } = require('react-native');
  return {
    DateTimeField: ({ value }: any) => <RNText>{value || ''}</RNText>,
    nowDateString: () => '2026-06-20',
    nowTimeString: () => '12:00',
  };
});

// Mutable holders the useQuery factory reads at call-time.
const mockProfile: { data: any; isLoading: boolean } = { data: undefined, isLoading: false };
const mockStatus: { data: any } = { data: undefined };
const mockForecast: { data: any; isLoading: boolean; isError: boolean } = { data: undefined, isLoading: false, isError: false };
const mockHistory: { data: any; isLoading: boolean; isError: boolean } = { data: undefined, isLoading: false, isError: false };

jest.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    const key = queryKey[0];
    if (key === 'my-profile') return { data: mockProfile.data, isLoading: mockProfile.isLoading, refetch: jest.fn() };
    if (key === 'my-status') return { data: mockStatus.data, isLoading: false, refetch: jest.fn() };
    if (key === 'cycle-forecast') return { data: mockForecast.data, isLoading: mockForecast.isLoading, isError: mockForecast.isError, refetch: jest.fn() };
    if (key === 'cycle-history') return { data: mockHistory.data, isLoading: mockHistory.isLoading, isError: mockHistory.isError, refetch: jest.fn() };
    return { data: undefined, isLoading: false, isError: false, refetch: jest.fn() };
  },
  useMutation: () => ({ mutate: jest.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

jest.mock('@/api/profile', () => ({ getMyProfile: jest.fn(), getStatus: jest.fn() }));
jest.mock('@/api/cycle', () => ({ getCycleForecast: jest.fn(), getCycleHistory: jest.fn(), logPeriod: jest.fn() }));

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
import CycleScreen from '../../app/(performance)/cycle';

function renderScreen() {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      <CycleScreen />
    </ThemeContext.Provider>,
  );
}

const now = new Date();
const Y = now.getUTCFullYear();
const M = now.getUTCMonth();
const FORECAST = {
  confidence: 'HIGH',
  trackingOnly: false,
  predictedNextPeriodStart: `${Y}-${String(M + 1).padStart(2, '0')}-28`,
  predictedOvulationDate: `${Y}-${String(M + 1).padStart(2, '0')}-14`,
  fertileWindow: null,
  days: [
    { date: `${Y}-${String(M + 1).padStart(2, '0')}-05`, phase: 'MENSTRUAL', confidence: 'HIGH', isPredictedFertile: false, isPredictedOvulation: false, isLogged: true },
  ],
  reason: 'ok',
};
const HISTORY = {
  cycles: [{ startDate: '2026-05-04', endDate: '2026-05-08', cycleLengthDays: 28, periodLengthDays: 5 }],
  averages: { avgCycleLengthDays: 28, avgPeriodLengthDays: 5, cycleLengthStdDev: null, cycleRegularity: 'REGULAR', loggedCycleCount: 2 },
};

beforeEach(() => {
  mockProfile.data = undefined;
  mockProfile.isLoading = false;
  mockStatus.data = undefined;
  mockForecast.data = undefined;
  mockForecast.isLoading = false;
  mockForecast.isError = false;
  mockHistory.data = undefined;
  mockHistory.isLoading = false;
  mockHistory.isError = false;
});

describe('CycleScreen (F28) — eligibility gate', () => {
  test('NON-tracking user sees no cycle UI (the feature is hidden)', () => {
    mockProfile.data = { cycleTrackingEnabled: false, biologicalSex: 'FEMALE' };
    renderScreen();

    expect(screen.getByTestId('cycle-not-enabled')).toBeTruthy();
    expect(screen.getByText(/cycle tracking is off/i)).toBeTruthy();
    // None of the feature surfaces mount.
    expect(screen.queryByText('LOG PERIOD')).toBeNull();
    expect(screen.queryByText('CYCLE HISTORY')).toBeNull();
  });

  test('NON-female user (tracking on) sees no cycle UI', () => {
    mockProfile.data = { cycleTrackingEnabled: true, biologicalSex: 'MALE' };
    renderScreen();

    expect(screen.getByTestId('cycle-not-enabled')).toBeTruthy();
    expect(screen.queryByText('LOG PERIOD')).toBeNull();
  });

  test('ELIGIBLE user (tracking on + female) sees calendar, log, history + disclaimer', () => {
    mockProfile.data = { cycleTrackingEnabled: true, biologicalSex: 'FEMALE' };
    mockStatus.data = { cyclePhase: 'FOLLICULAR' };
    mockForecast.data = FORECAST;
    mockHistory.data = HISTORY;
    renderScreen();

    expect(screen.queryByTestId('cycle-not-enabled')).toBeNull();
    // Feature surfaces present.
    expect(screen.getByText('LOG PERIOD')).toBeTruthy();
    expect(screen.getByText('CYCLE HISTORY')).toBeTruthy();
    // Calendar mounted (current month header).
    const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    expect(screen.getByText(new RegExp(`${MONTHS[M]} ${Y}`))).toBeTruthy();
    // Phase card reused.
    expect(screen.getByText('CYCLE PHASE')).toBeTruthy();
    // Wellness disclaimer present (both the phase card note and the screen-level
    // banner carry the "not medical advice" wording).
    expect(screen.getAllByText(/not medical advice/i).length).toBeGreaterThan(0);
  });
});
