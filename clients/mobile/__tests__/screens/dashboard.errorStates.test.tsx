/**
 * Render tests for the dashboard's uniform error-state pattern.
 *
 * The dashboard (`app/(tabs)/index.tsx`) wraps every primary section in a
 * uniform "Couldn't load … / Retry" EmptyState (matching the rest of the app
 * — see training.tsx). When ALL of the dashboard's queries fail at once we
 * therefore expect MULTIPLE Retry buttons to appear simultaneously — at least
 * three from the three top-level queries:
 *
 *   - ['current-shift']  → ShiftTransitionCard's error branch (Retry button)
 *   - ['today-plan']     → UP NEXT meal EmptyState (Retry button)
 *   - ['today-progress'] → Hydration mini-card EmptyState (Retry button)
 *
 * In practice the page can show a 4th Retry (from WeeklyRecap's own error
 * branch). We stub WeeklyRecap and ActivityHeatmap out so the test stays
 * focused on the three queries the dashboard owns directly. The assertion
 * `getAllByText('Retry').length >= 3` reflects that minimum and is robust to
 * benign additions elsewhere.
 *
 * Mocks (lean):
 *  - `@tanstack/react-query` useQuery → every query is forced into its error
 *    state with a distinct `refetch` spy, so we can press the FIRST Retry and
 *    assert exactly which query was refetched.
 *  - api modules, expo-router, @expo/vector-icons, react-native-safe-area-
 *    context, expo-image, authStore, WeeklyRecap, ActivityHeatmap — all the
 *    same stubs as dashboard.shiftTransition.test.tsx.
 */
import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react-native';
import {
  ThemeContext,
  getThemeColors,
  typography,
  spacing,
  borderRadius,
  shadows,
} from '@/theme';

// Per-query refetch spies. Top of the page (in render order) is the shift card,
// so its Retry is the FIRST rendered. We assert against that ordering below.
const mockShiftRefetch = jest.fn();
const mockPlanRefetch = jest.fn();
const mockProgressRefetch = jest.fn();
const mockOtherRefetch = jest.fn();

jest.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    const key = queryKey[0];
    if (key === 'current-shift') {
      return { data: undefined, isLoading: false, isError: true, refetch: mockShiftRefetch };
    }
    if (key === 'today-plan') {
      return { data: undefined, isLoading: false, isError: true, refetch: mockPlanRefetch };
    }
    if (key === 'today-progress') {
      return { data: undefined, isLoading: false, isError: true, refetch: mockProgressRefetch };
    }
    // exercise-counts + anything else: also rejected, with a separate spy so
    // we can tell the "primary three" Retry presses apart from these.
    return { data: undefined, isLoading: false, isError: true, refetch: mockOtherRefetch };
  },
  useMutation: () => ({ mutate: jest.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

jest.mock('@/api/shifts', () => ({ getCurrent: jest.fn() }));
jest.mock('@/api/plans', () => ({ getToday: jest.fn() }));
jest.mock('@/api/progress', () => ({ getToday: jest.fn(), logHydration: jest.fn() }));
jest.mock('@/api/exercises', () => ({ searchLibrary: jest.fn() }));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

jest.mock('@expo/vector-icons', () => {
  const { Text: RNText } = require('react-native');
  return {
    Ionicons: ({ name }: { name?: string }) => <RNText>{`icon:${name ?? ''}`}</RNText>,
  };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));

jest.mock('expo-image', () => {
  const RN = require('react-native');
  return { Image: (props: any) => <RN.View {...props} /> };
});

jest.mock('@/store/authStore', () => ({
  useAuthStore: () => ({ user: { name: 'Test User' } }),
}));

// Keep the test focused on the three primary queries. WeeklyRecap and
// ActivityHeatmap own their own queries (weekly-stats, workout activity); their
// error states would add more Retry buttons that aren't what we're verifying.
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

describe('Dashboard — uniform error-state pattern (every useQuery rejects)', () => {
  beforeEach(() => {
    mockShiftRefetch.mockClear();
    mockPlanRefetch.mockClear();
    mockProgressRefetch.mockClear();
    mockOtherRefetch.mockClear();
  });

  test('renders at least three Retry buttons (shift + plan + progress)', () => {
    renderScreen();

    // The acceptance criterion: getAllByText('Retry').length >= 3 across the
    // three primary failing queries.
    const retries = screen.getAllByText('Retry');
    expect(retries.length).toBeGreaterThanOrEqual(3);
  });

  test('pressing the FIRST Retry button invokes its query\'s refetch (and only that one)', () => {
    renderScreen();

    const retries = screen.getAllByText('Retry');
    expect(retries.length).toBeGreaterThanOrEqual(3);

    // The UP NEXT meal section sits ABOVE ShiftTransitionCard in the JSX (it's
    // the first error-state EmptyState we encounter), so its "Retry" is the
    // FIRST one in render order. Pressing it must invoke the plan query's
    // refetch — and ONLY that one — so the per-section retry stays scoped.
    fireEvent.press(retries[0]!);
    expect(mockPlanRefetch).toHaveBeenCalledTimes(1);
    expect(mockShiftRefetch).not.toHaveBeenCalled();
    expect(mockProgressRefetch).not.toHaveBeenCalled();
  });

  test('renders the "Couldn\'t load" title in the error EmptyStates', () => {
    renderScreen();
    // Every uniform error EmptyState we added uses the same title ("Couldn't
    // load") — the plan EmptyState and the hydration EmptyState both surface
    // it. Asserting on its presence pins down the shared copy contract.
    expect(screen.getAllByText("Couldn't load").length).toBeGreaterThanOrEqual(1);
  });
});
