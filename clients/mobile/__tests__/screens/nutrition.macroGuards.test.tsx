/**
 * Finite/clamp guard tests for the rebuilt Meals screen's macro rings
 * (`app/(tabs)/nutrition.tsx`).
 *
 * The screen feeds four macro-ring fractions (Protein / Carbs / Fat / Water)
 * DERIVED from two reads — daily-progress (targets) + meal-logs (consumed). A bad
 * log total (NaN from an upstream parse) or an over-target day must never push an
 * out-of-range / non-finite fraction into the SHARED CircularProgress (used by
 * many screens — it is not edited; the clamp/coercion live in the screen's
 * `ringFor`/`finiteNum`). The "consumed / target kcal" header must stay finite.
 *
 * Harness: mocks `@tanstack/react-query`'s useQuery keyed on queryKey[0] so each
 * query is driven independently, and replaces `@/components/ui/CircularProgress`
 * with a probe recording every `progress` value it receives — that is the value
 * the clamp must keep finite + in [0,1]. The probe is a test double; the real
 * shared component is untouched. The previous calorie-ring/macro-bar dashboard
 * was removed in the 1:1 mockup rebuild, so this suite now pins the four rings.
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

// CircularProgress probe — records every `progress` fraction the screen forwards.
const mockProgressValues: number[] = [];
jest.mock('@/components/ui/CircularProgress', () => {
  const RN = require('react-native');
  return {
    CircularProgress: ({ progress, children }: { progress: number; children?: any }) => {
      mockProgressValues.push(progress);
      return <RN.View testID="ring" accessibilityValue={{ text: String(progress) }}>{children}</RN.View>;
    },
  };
});

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

// Import AFTER the mocks are registered.
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

describe('MealsScreen — macro-ring finite/clamp guards', () => {
  beforeEach(() => {
    mockProgressValues.length = 0;
    resetQueryState();
  });

  test('valid day: each ring fraction = consumed/target, finite and in [0,1]; kcal header shows consumed', () => {
    mockState['daily-progress'] = {
      data: { caloriesTarget: 2000, proteinTarget: 100, carbsTarget: 200, fatTarget: 80 },
      isLoading: false, isError: false,
    };
    mockState['meal-logs'] = {
      data: [{ totalCalories: 500, totalProtein: 25, totalCarbs: 50, totalFat: 20 }],
      isLoading: false, isError: false,
    };
    renderScreen();

    // Four rings rendered: Protein 25/100, Carbs 50/200, Fat 20/80 → 0.25 each; Water 0 (no hydration data).
    expect(mockProgressValues.length).toBe(4);
    mockProgressValues.forEach((f) => {
      expect(Number.isFinite(f)).toBe(true);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThanOrEqual(1);
    });
    expect(mockProgressValues[0]).toBeCloseTo(0.25, 5); // protein
    // kcal header — consumed 500 of 2,000 (locale-formatted).
    expect(screen.getByText('500')).toBeTruthy();
  });

  test('consumed = NaN: every ring fraction is a finite 0 (no NaN/Infinity leaks)', () => {
    mockState['daily-progress'] = {
      data: { caloriesTarget: 2000, proteinTarget: 100, carbsTarget: 200, fatTarget: 80 },
      isLoading: false, isError: false,
    };
    mockState['meal-logs'] = {
      data: [{ totalCalories: NaN, totalProtein: NaN, totalCarbs: NaN, totalFat: NaN }],
      isLoading: false, isError: false,
    };
    renderScreen();

    expect(mockProgressValues.length).toBe(4);
    mockProgressValues.forEach((f) => {
      expect(Number.isFinite(f)).toBe(true);
      expect(f).toBe(0); // finiteNum(NaN)=0 → 0/target = 0
    });
  });

  test('over-target day: fractions clamp to 1 (never > 1)', () => {
    mockState['daily-progress'] = {
      data: { caloriesTarget: 2000, proteinTarget: 100, carbsTarget: 200, fatTarget: 80 },
      isLoading: false, isError: false,
    };
    // Way over every target.
    mockState['meal-logs'] = {
      data: [{ totalCalories: 9999, totalProtein: 999, totalCarbs: 999, totalFat: 999 }],
      isLoading: false, isError: false,
    };
    renderScreen();

    expect(mockProgressValues[0]).toBe(1); // protein clamped
    mockProgressValues.forEach((f) => expect(f).toBeLessThanOrEqual(1));
  });
});
