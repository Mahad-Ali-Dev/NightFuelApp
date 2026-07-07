/**
 * Graceful-degradation tests for the rebuilt Meals screen
 * (`app/(tabs)/nutrition.tsx`).
 *
 * The 1:1 mockup rebuild dropped the old nutrition hub's "Couldn't load … /
 * Retry" EmptyState pattern, the calorie dashboard, the logged-meals list, the
 * daily-plan grid, etc. The screen now degrades silently: data-dependent
 * sections (next-meal hero, macro rings) simply don't render when their query
 * errors; the static sections (Explore meals, Browse by food group) always show.
 * These tests pin that behaviour — no crash, no Retry UI.
 *
 * Harness: mocks `@tanstack/react-query`'s useQuery keyed on queryKey[0] (mutable
 * per-key state table) + the usual native/router/api stubs.
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

type QState = { data?: unknown; isLoading?: boolean; isError?: boolean };

const mockState: Record<string, QState> = {};
function resetQueryState() {
  mockState['nutrition-plan'] = { data: { meals: [] }, isLoading: false, isError: false };
  mockState['meal-logs'] = { data: [], isLoading: false, isError: false };
  mockState['daily-progress'] = { data: {}, isLoading: false, isError: false };
}
resetQueryState();

jest.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    const s = mockState[String(queryKey[0])] ?? {};
    return { data: s.data, isLoading: !!s.isLoading, isError: !!s.isError, refetch: jest.fn() };
  },
}));

jest.mock('@/api/plans', () => ({ getPlanByDate: jest.fn() }));
jest.mock('@/api/meals', () => ({ getMealLogs: jest.fn() }));
jest.mock('@/api/progress', () => ({ getToday: jest.fn() }));
jest.mock('../../app/(tabs)/_layout', () => ({ TAB_BAR_H: 64 }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }) }));
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
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

import MealsScreen from '../../app/(tabs)/nutrition';

function renderScreen() {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      <MealsScreen />
    </ThemeContext.Provider>,
  );
}

describe('MealsScreen — graceful degradation', () => {
  beforeEach(() => resetQueryState());

  test('renders the static scaffold without crashing when every query errors', () => {
    mockState['nutrition-plan'] = { data: undefined, isLoading: false, isError: true };
    mockState['meal-logs'] = { data: undefined, isLoading: false, isError: true };
    mockState['daily-progress'] = { data: undefined, isLoading: false, isError: true };

    expect(() => renderScreen()).not.toThrow();
    expect(screen.getByText('Meals')).toBeTruthy();
    expect(screen.getByText('Explore meals')).toBeTruthy();
    expect(screen.getByText('Browse by food group')).toBeTruthy();
  });

  test('shows NO error-retry UI (the rebuild has no Retry / "Couldn\'t load")', () => {
    mockState['daily-progress'] = { data: undefined, isLoading: false, isError: true };
    renderScreen();
    expect(screen.queryByText('Retry')).toBeNull();
    expect(screen.queryByText("Couldn't load your macros")).toBeNull();
  });

  test('hides data-dependent sections when their query errors', () => {
    mockState['daily-progress'] = { data: undefined, isLoading: false, isError: true };
    mockState['nutrition-plan'] = { data: undefined, isLoading: false, isError: true };
    renderScreen();
    // No progress → the macro card (its "Today's macros" header) is absent.
    expect(screen.queryByText("Today's macros")).toBeNull();
  });

  test('renders the macro card + food groups on a benign day', () => {
    mockState['daily-progress'] = {
      data: { caloriesTarget: 2000, proteinTarget: 100, carbsTarget: 200, fatTarget: 80 },
      isLoading: false, isError: false,
    };
    renderScreen();
    expect(screen.getByText("Today's macros")).toBeTruthy();
    expect(screen.getByText('Vegetables')).toBeTruthy(); // a food-group card (unique to that section)
  });
});
