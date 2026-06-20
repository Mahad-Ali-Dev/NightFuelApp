/**
 * Finite/clamp guard tests for the Nutrition hub's macro dashboard
 * (`app/(tabs)/nutrition.tsx`).
 *
 * The screen feeds a calorie-ring fraction and a set of macro-bar ratios that
 * are DERIVED from two reads: daily-progress (targets) and meal-logs (consumed).
 * A bad log total (NaN from an upstream parse) or an over-target day must never
 * push an out-of-range / non-finite fraction into the SHARED CircularProgress
 * (used by 7 screens — it is not edited; the clamp/coercion live in nutrition's
 * computation), and the "KCAL LEFT" / consumed-line text must stay a safe finite
 * number (never `NaN`, never a wild negative).
 *
 * Mirrors __tests__/screens/nutrition.errorStates.test.tsx's harness: it mocks
 * `@tanstack/react-query`'s `useQuery` keyed on `queryKey[0]` so each query can
 * be driven independently, and stubs the same native/router/api modules so the
 * graph loads without native code. ADDITIONALLY it mocks the shared
 * `@/components/ui/CircularProgress` to a probe that records the exact `progress`
 * prop it receives — that is the value the clamp must keep in [0,1] and finite.
 * The probe is a test double; the real CircularProgress is untouched.
 *
 * react-native-skills applied:
 *  - rendering-no-falsy-and: the guards keep the ring/remaining numerals finite
 *    so they can't surface a bare falsy/`NaN` next to text; this suite pins that
 *    the rendered numeral is a real number string in every degenerate case.
 *  - js-hoist-intl: the screen has no per-render Intl formatter (plain template
 *    strings / Math.round); these tests assert no NaN leaks from that path.
 *  - list-performance-inline-objects: MacroItem stays a memoized leaf fed
 *    primitives (label/current/target/color/unit); the suite reads its rendered
 *    bar-fill width to confirm a finite `%` without changing that contract.
 */
import React from 'react';
import { View } from 'react-native';
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

// Mutable per-key query state table the tests set BEFORE renderScreen().
// Defaults = everything resolved & benign so a test only sets the keys it cares
// about (same convention as the errorStates suite).
const mockState: Record<string, QState> = {};

function resetQueryState() {
  mockState['nutrition-plan'] = { data: { meals: [] }, isLoading: false, isError: false };
  mockState['meal-logs'] = { data: [], isLoading: false, isError: false };
  mockState['daily-progress'] = { data: {}, isLoading: false, isError: false };
  mockState['fasting-logs'] = { data: [], isLoading: false, isError: false };
}
resetQueryState();

jest.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    const key = String(queryKey[0]);
    const s = mockState[key] ?? {};
    return { data: s.data, isLoading: !!s.isLoading, isError: !!s.isError, refetch: jest.fn() };
  },
  useMutation: () => ({ mutate: jest.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

// ── CircularProgress probe ───────────────────────────────────────────────────
// The screen imports CircularProgress from '@/components/ui/CircularProgress'
// (NOT the barrel). Replace it with a leaf that records every `progress` value
// it is rendered with, and exposes the latest via a testID + accessibilityValue.
// This is a test double — the real shared component is never edited. We assert
// the clamp/coercion in nutrition.tsx by reading exactly what it forwards here.
const mockProgressValues: number[] = [];
jest.mock('@/components/ui/CircularProgress', () => {
  const RN = require('react-native');
  return {
    CircularProgress: ({ progress }: { progress: number }) => {
      mockProgressValues.push(progress);
      // Stringify deterministically so the test can read the exact number back
      // (RN serializes accessibilityValue.text). NaN/Infinity stringify to
      // "NaN"/"Infinity", which would FAIL the finite assertions below — that is
      // the point: a leak is visible, not silently swallowed.
      return (
        <RN.View
          testID="ring"
          accessibilityValue={{ text: String(progress) }}
        />
      );
    },
  };
});

// ── ui barrel: keep everything real except Skeleton (assertable) — matches the
// errorStates harness so the EmptyState/GlassCard copy is the genuine module. ──
jest.mock('@/components/ui', () => {
  const actual = jest.requireActual('@/components/ui');
  const RN = require('react-native');
  return {
    ...actual,
    Skeleton: (props: any) => <RN.View testID="skeleton" {...props} />,
  };
});

// api modules stubbed (useQuery is mocked, so queryFns never run — only need to
// be importable so the real axios client / env config never loads).
jest.mock('@/api/plans', () => ({ getPlanByDate: jest.fn() }));
jest.mock('@/api/meals', () => ({ getMealLogs: jest.fn(), getFastingLogs: jest.fn() }));
jest.mock('@/api/progress', () => ({ getToday: jest.fn() }));

jest.mock('../../app/(tabs)/_layout', () => ({ TAB_BAR_H: 64 }));

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

jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

// Import AFTER the mocks are registered.
import NutritionHubScreen from '../../app/(tabs)/nutrition';

function renderScreen() {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      <NutritionHubScreen />
    </ThemeContext.Provider>,
  );
}

// The latest fraction the ring received (the value the clamp must bound). The
// ring always renders in the loaded state these tests drive, so the probe array
// is non-empty here (non-null assertion mirrors the Skeleton suite's `views[0]!`
// under noUncheckedIndexedAccess).
function latestRingFraction(): number {
  return mockProgressValues[mockProgressValues.length - 1]!;
}

// Recursively flatten an RN style prop (array | object | falsy) to one object —
// same helper shape as __tests__/components/ui/Skeleton.test.tsx.
function flatten(style: unknown): Record<string, unknown> {
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flatten));
  return (style as Record<string, unknown>) ?? {};
}

// Read every macro bar-fill width as a numeric percent. MacroItem renders the
// fill as an inner View whose flattened style has BOTH a '%' width and
// height '100%' (styles.barFill) — a signature the track background (fixed
// numeric height 6, width '100%') does NOT share. There are exactly three
// (Protein / Carbs / Fat). Uses UNSAFE_getAllByType(View) + flatten, the same
// proven pattern as the Skeleton suite (no react-test-renderer findAll).
function macroBarWidthPercents(): number[] {
  const out: number[] = [];
  for (const node of screen.UNSAFE_getAllByType(View)) {
    const flat = flatten(node.props.style);
    const width = flat.width;
    if (typeof width === 'string' && width.endsWith('%') && flat.height === '100%') {
      out.push(parseFloat(width.replace('%', '')));
    }
  }
  return out;
}

describe('NutritionHubScreen — calorie-ring + macro finite/clamp guards', () => {
  beforeEach(() => {
    mockProgressValues.length = 0;
    resetQueryState();
  });

  // ── (1) BASELINE: a valid day renders the expected ring fraction + numerals.
  // This is the reference the degenerate cases must not be able to corrupt.
  test('valid day: ring fraction = consumed/target, remaining + consumed numerals exact', () => {
    mockState['daily-progress'] = {
      data: { caloriesTarget: 2000, proteinTarget: 100, carbsTarget: 200, fatTarget: 80 },
      isLoading: false,
      isError: false,
    };
    mockState['meal-logs'] = {
      data: [{ totalCalories: 500, totalProtein: 25, totalCarbs: 50, totalFat: 20 }],
      isLoading: false,
      isError: false,
    };
    renderScreen();

    // 500 / 2000 = 0.25, in range and exact.
    expect(latestRingFraction()).toBeCloseTo(0.25, 5);
    // Remaining = 2000 - 500 = 1500; consumed line = "consumed 500 / target 2000".
    expect(screen.getByText('1500')).toBeTruthy();
    expect(screen.getByText('consumed 500 / target 2000 kcal')).toBeTruthy();
    // Macro bars: 25/100, 50/200, 20/80 → 25%, 25%, 25% (all finite, in range).
    const widths = macroBarWidthPercents();
    expect(widths.length).toBe(3);
    widths.forEach((w) => {
      expect(Number.isFinite(w)).toBe(true);
      expect(w).toBeGreaterThanOrEqual(0);
      expect(w).toBeLessThanOrEqual(100);
    });
  });

  // ── (2) consumed = NaN: a NaN total in a log must NOT poison the ring,
  // the remaining numeral, or the macro bars.
  test('consumed = NaN: ring fraction is finite 0, remaining = full target, no NaN text', () => {
    mockState['daily-progress'] = {
      data: { caloriesTarget: 2000, proteinTarget: 100, carbsTarget: 200, fatTarget: 80 },
      isLoading: false,
      isError: false,
    };
    // A log whose totals are all NaN (e.g. a failed upstream parse).
    mockState['meal-logs'] = {
      data: [{ totalCalories: NaN, totalProtein: NaN, totalCarbs: NaN, totalFat: NaN }],
      isLoading: false,
      isError: false,
    };
    renderScreen();

    const f = latestRingFraction();
    expect(Number.isFinite(f)).toBe(true);
    // finiteNum(NaN) = 0 → 0 / 2000 = 0.
    expect(f).toBe(0);
    expect(f).toBeGreaterThanOrEqual(0);
    expect(f).toBeLessThanOrEqual(1);

    // Remaining is the FULL target (2000 - 0), never "NaN".
    expect(screen.getByText('2000')).toBeTruthy();
    expect(screen.queryByText('NaN')).toBeNull();
    // Consumed line reads 0 consumed, not NaN.
    expect(screen.getByText('consumed 0 / target 2000 kcal')).toBeTruthy();

    // Macro bars all finite and 0 (NaN current → 0 width), never "NaN%".
    const widths = macroBarWidthPercents();
    expect(widths.length).toBe(3);
    widths.forEach((w) => {
      expect(Number.isFinite(w)).toBe(true);
      expect(w).toBe(0);
    });
  });

  // ── (3) OVER-TARGET: consumed > target must clamp the ring fraction to exactly
  // 1 (never the raw >1 ratio) and keep remaining at a safe 0 (never wild
  // negative), and the macro bars clamp to 100%.
  test('over-target day: ring fraction clamps to 1, remaining = 0 (never negative)', () => {
    mockState['daily-progress'] = {
      data: { caloriesTarget: 2000, proteinTarget: 100, carbsTarget: 200, fatTarget: 80 },
      isLoading: false,
      isError: false,
    };
    // Way over every target.
    mockState['meal-logs'] = {
      data: [{ totalCalories: 5000, totalProtein: 400, totalCarbs: 900, totalFat: 300 }],
      isLoading: false,
      isError: false,
    };
    renderScreen();

    const f = latestRingFraction();
    expect(Number.isFinite(f)).toBe(true);
    // 5000 / 2000 = 2.5 → clamped to 1 (NOT 2.5).
    expect(f).toBe(1);

    // Remaining = Math.max(0, 2000 - 5000) = 0 — never a wild negative like -3000.
    expect(screen.getByText('0')).toBeTruthy();
    expect(screen.queryByText('-3000')).toBeNull();
    // Consumed line still shows the REAL consumed (5000), only the ring is clamped.
    expect(screen.getByText('consumed 5000 / target 2000 kcal')).toBeTruthy();

    // Every macro bar clamps to 100% (not 400%, 450%, 375%).
    const widths = macroBarWidthPercents();
    expect(widths.length).toBe(3);
    widths.forEach((w) => expect(w).toBe(100));
  });

  // ── (4) target undefined/empty data: with no daily-progress payload the
  // screen falls back to its built-in targets (caloriesTarget || 2400, etc.);
  // the ring + bars must still be finite and in range, never NaN. (The targets
  // default rather than going to 0, so the fraction is a safe small number.)
  test('undefined target data: ring fraction stays finite + in [0,1], no NaN leaks', () => {
    // daily-progress resolves to {} (default) → caloriesTarget undefined → 2400.
    mockState['daily-progress'] = { data: undefined, isLoading: false, isError: false };
    // A normal log so consumed is a real number against the defaulted target.
    mockState['meal-logs'] = {
      data: [{ totalCalories: 600, totalProtein: 40, totalCarbs: 50, totalFat: 20 }],
      isLoading: false,
      isError: false,
    };
    renderScreen();

    const f = latestRingFraction();
    expect(Number.isFinite(f)).toBe(true);
    expect(f).toBeGreaterThanOrEqual(0);
    expect(f).toBeLessThanOrEqual(1);
    // 600 / 2400 (default) = 0.25.
    expect(f).toBeCloseTo(0.25, 5);
    // No NaN anywhere in the dashboard.
    expect(screen.queryByText('NaN')).toBeNull();
    // Remaining against the default target: 2400 - 600 = 1800.
    expect(screen.getByText('1800')).toBeTruthy();

    const widths = macroBarWidthPercents();
    expect(widths.length).toBe(3);
    widths.forEach((w) => {
      expect(Number.isFinite(w)).toBe(true);
      expect(w).toBeGreaterThanOrEqual(0);
      expect(w).toBeLessThanOrEqual(100);
    });
  });

  // ── (5) MIXED degenerate logs: several logs where SOME totals are NaN — the
  // finite ones must still sum (the NaN ones contribute 0), so a single bad log
  // can't wipe out the rest of the day or push a NaN into the ring.
  test('mixed logs (some NaN totals): finite totals still sum; ring + numerals stay finite', () => {
    mockState['daily-progress'] = {
      data: { caloriesTarget: 2000, proteinTarget: 100, carbsTarget: 200, fatTarget: 80 },
      isLoading: false,
      isError: false,
    };
    mockState['meal-logs'] = {
      data: [
        { totalCalories: 400, totalProtein: 30, totalCarbs: 40, totalFat: 10 },
        { totalCalories: NaN, totalProtein: NaN, totalCarbs: NaN, totalFat: NaN },
        { totalCalories: 300, totalProtein: 20, totalCarbs: 35, totalFat: 15 },
      ],
      isLoading: false,
      isError: false,
    };
    renderScreen();

    const f = latestRingFraction();
    expect(Number.isFinite(f)).toBe(true);
    // (400 + 0 + 300) / 2000 = 700/2000 = 0.35 — the NaN log added 0, not poison.
    expect(f).toBeCloseTo(0.35, 5);
    // Remaining = 2000 - 700 = 1300, finite.
    expect(screen.getByText('1300')).toBeTruthy();
    // Consumed line sums only the finite logs.
    expect(screen.getByText('consumed 700 / target 2000 kcal')).toBeTruthy();
    expect(screen.queryByText('NaN')).toBeNull();

    const widths = macroBarWidthPercents();
    expect(widths.length).toBe(3);
    widths.forEach((w) => expect(Number.isFinite(w)).toBe(true));
  });

  // ── (6) IDENTICAL-RENDER guarantee: a valid day renders the SAME ring fraction
  // and numerals whether or not the day also contains a degenerate (NaN) log
  // appended — proving the guard is transparent to valid data (does not alter a
  // legitimate fraction) while neutralizing the bad addend.
  test('valid day renders identical ring/numerals with vs without an extra NaN log', () => {
    const target = { caloriesTarget: 2000, proteinTarget: 100, carbsTarget: 200, fatTarget: 80 };
    const goodLog = { totalCalories: 500, totalProtein: 25, totalCarbs: 50, totalFat: 20 };

    // Pass A: just the good log.
    mockState['daily-progress'] = { data: target, isLoading: false, isError: false };
    mockState['meal-logs'] = { data: [goodLog], isLoading: false, isError: false };
    const a = renderScreen();
    const fractionA = latestRingFraction();
    expect(a.getByText('1500')).toBeTruthy();
    a.unmount();

    // Pass B: the same good log PLUS a NaN log (which must contribute 0).
    mockProgressValues.length = 0;
    mockState['meal-logs'] = {
      data: [goodLog, { totalCalories: NaN, totalProtein: NaN, totalCarbs: NaN, totalFat: NaN }],
      isLoading: false,
      isError: false,
    };
    renderScreen();
    const fractionB = latestRingFraction();

    // Identical fraction and remaining numeral — the NaN log is invisible.
    expect(fractionB).toBeCloseTo(fractionA, 6);
    expect(fractionB).toBeCloseTo(0.25, 5);
    expect(screen.getByText('1500')).toBeTruthy();
    expect(screen.getByText('consumed 500 / target 2000 kcal')).toBeTruthy();
  });
});
