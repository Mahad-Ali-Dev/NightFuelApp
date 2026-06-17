/**
 * Render tests for the dashboard's <ShiftTransitionCard /> integration.
 *
 * The dashboard at `app/(tabs)/index.tsx` mounts ShiftTransitionCard between the
 * UP NEXT meal card and the SLEEP+HYDRATION mini-card row. The card owns its
 * own loading / error / empty / populated branches off the parent's
 * `useQuery({ queryKey: ['current-shift'] })`. These four tests pin down the
 * exact render for each branch by mocking JUST the current-shift query and
 * leaving every other query in a stable, non-loading, non-erroring state so
 * each assertion is local to ShiftTransitionCard.
 *
 * Mocks (kept minimal — this is a heavy full-screen):
 *  - `@tanstack/react-query` useQuery → branches by queryKey:
 *      ['current-shift']   → driven by `currentShiftState` (per-test override)
 *      ['today-plan']      → benign success: { meals: [] }
 *      ['today-progress']  → benign success: { hydrationActual: 0 }
 *      (everything else)   → benign success
 *    useMutation + useQueryClient → no-op stubs so addWater() and pull-to-
 *    refresh don't crash.
 *  - `@/api/shifts.getCurrent` → the controllable query fn; per-test it returns
 *    a never-resolving / rejected / null / shaped promise.
 *  - expo-router useRouter, react-native-safe-area-context, @expo/vector-icons,
 *    expo-image are stubbed the same way the rest of the suite does (see
 *    training.test.tsx and ExerciseDemo.test.tsx).
 *  - `WeeklyRecap` and `ActivityHeatmap` are stubbed to empty hosts — they
 *    own their own queries we don't want to drag in.
 */
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

// ── Controlled current-shift query state ──────────────────────────────────────
// The factory below references `mockShiftState` lazily, so per-test mutation of
// this object is picked up on the next render. `mock` name prefix is required
// for jest's out-of-scope hoisting rule.
type ShiftState = {
  data: any;
  isLoading: boolean;
  isError: boolean;
};
const mockShiftState: ShiftState = {
  data: null,
  isLoading: false,
  isError: false,
};
const mockShiftRefetch = jest.fn();

jest.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    const key = queryKey[0];
    if (key === 'current-shift') {
      return {
        data: mockShiftState.data,
        isLoading: mockShiftState.isLoading,
        isError: mockShiftState.isError,
        refetch: mockShiftRefetch,
      };
    }
    if (key === 'today-plan') {
      return {
        data: { meals: [] },
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      };
    }
    if (key === 'today-progress') {
      return {
        data: { hydrationActual: 0, hydrationMl: 0 },
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      };
    }
    // exercise-counts / weekly-stats / anything else — benign empty success.
    return { data: undefined, isLoading: false, isError: false, refetch: jest.fn() };
  },
  useMutation: () => ({ mutate: jest.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

jest.mock('@/api/shifts', () => ({
  getCurrent: jest.fn(),
}));

jest.mock('@/api/plans', () => ({
  getToday: jest.fn(),
}));

jest.mock('@/api/progress', () => ({
  getToday: jest.fn(),
  logHydration: jest.fn(),
}));

jest.mock('@/api/exercises', () => ({
  searchLibrary: jest.fn(),
}));

// expo-router: stub useRouter; the dashboard only calls .push().
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

// Decorative glyphs; stub to plain text so the icon name is asserted as text.
jest.mock('@expo/vector-icons', () => {
  const { Text: RNText } = require('react-native');
  return {
    Ionicons: ({ name }: { name?: string }) => <RNText>{`icon:${name ?? ''}`}</RNText>,
  };
});

// Deterministic insets so the screen lays out without the native provider.
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));

// expo-image's <Image> uses a native loader; replace it with a passthrough View.
jest.mock('expo-image', () => {
  const RN = require('react-native');
  return { Image: (props: any) => <RN.View {...props} /> };
});

// Auth store: provide a stable user object so the header renders happily.
jest.mock('@/store/authStore', () => ({
  useAuthStore: () => ({ user: { name: 'Test User' } }),
}));

// Sub-components we don't want to drag in — each owns its own query + native
// pieces. Stub to empty hosts so the dashboard mounts without them.
jest.mock('@/components/WeeklyRecap', () => {
  const RN = require('react-native');
  return { WeeklyRecap: () => <RN.View testID="weekly-recap-stub" /> };
});
jest.mock('@/components/ActivityHeatmap', () => {
  const RN = require('react-native');
  return { ActivityHeatmap: () => <RN.View testID="activity-heatmap-stub" /> };
});

// Import AFTER the mocks are registered.
import DashboardScreen from '../../app/(tabs)/index';

function renderScreen() {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      <DashboardScreen />
    </ThemeContext.Provider>,
  );
}

describe('Dashboard — ShiftTransitionCard integration', () => {
  beforeEach(() => {
    // Reset per-test state to a neutral baseline; each test sets what it needs.
    mockShiftState.data = null;
    mockShiftState.isLoading = false;
    mockShiftState.isError = false;
    mockShiftRefetch.mockClear();
  });

  test('(a) loading → renders ShiftTransitionCard skeleton with the "Next shift transition" header marker', () => {
    mockShiftState.isLoading = true;
    renderScreen();
    // The Header text ("Next shift transition") is rendered in every branch of
    // ShiftTransitionCard, including loading. What pins down the LOADING-state
    // skeleton is the combined absence of every other branch's distinctive
    // content:
    //   - no empty-state subtitle ("Log a shift to see your transition plan")
    //   - no error "Retry" button
    //   - no populated anchor labels ("Recommended sleep", "Caffeine cutoff",
    //     "Bright light") — those only render once the shift is resolved.
    expect(screen.getByText('Next shift transition')).toBeTruthy();
    expect(screen.queryByText('Log a shift to see your transition plan')).toBeNull();
    expect(screen.queryByText('Retry')).toBeNull();
    expect(screen.queryByText('Recommended sleep')).toBeNull();
    expect(screen.queryByText('Caffeine cutoff')).toBeNull();
    expect(screen.queryByText('Bright light')).toBeNull();
  });

  test('(b) error → renders the error message and a Retry button', () => {
    mockShiftState.isError = true;
    renderScreen();
    expect(screen.getByText('Next shift transition')).toBeTruthy();
    // The error branches of BOTH shift-driven cards (ShiftTransitionCard and
    // LightPlanCard — both fed off the same ['current-shift'] query) render a
    // <Button title="Retry" />, so there are two on the errored dashboard.
    const retries = screen.getAllByText('Retry');
    expect(retries.length).toBeGreaterThanOrEqual(1);
  });

  test('(c) resolves null (no upcoming shift) → renders the empty state subtitle', () => {
    mockShiftState.data = null;
    renderScreen();
    expect(screen.getByText('Next shift transition')).toBeTruthy();
    // ShiftTransitionCard's empty branch uses an EmptyState with this subtitle.
    expect(screen.getByText('Log a shift to see your transition plan')).toBeTruthy();
  });

  test('(d) resolves a real shift → renders the formatted anchor times', () => {
    // Anchor math (from shiftTransition.ts):
    //   caffeineCutoff = end - 6h
    //   sleepWindow    = end + 1h … end + 9h
    //   brightLight    = start    … start + 2h
    // Pick a fixed UTC end timestamp and assert that the formatted local-time
    // string for the caffeine cutoff (end - 6h) renders. Using a deterministic
    // Intl.DateTimeFormat call against the SAME instant means our expected
    // string matches whatever the test runner's tz is, so the test is portable.
    const start = new Date('2026-06-13T22:00:00.000Z');
    const end = new Date('2026-06-14T06:00:00.000Z');
    const caffeineCutoff = new Date(end.getTime() - 6 * 3_600_000);
    const expected = caffeineCutoff.toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    });

    mockShiftState.data = {
      id: 'shift-1',
      userId: 'u1',
      type: 'night',
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      timezone: 'UTC',
      createdAt: start.toISOString(),
      updatedAt: start.toISOString(),
    };
    renderScreen();

    expect(screen.getByText('Next shift transition')).toBeTruthy();
    // The caffeine cutoff anchor row prints just the formatted time string.
    expect(screen.getByText(expected)).toBeTruthy();
    // And — defensively — the empty-state subtitle must NOT be present.
    expect(screen.queryByText('Log a shift to see your transition plan')).toBeNull();
  });
});
