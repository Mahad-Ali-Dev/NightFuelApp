/**
 * log-planned-meal.test.tsx
 *
 * Render + behaviour lock on `app/(meals)/log-planned-meal.tsx` — the one-tap
 * plan→meal confirm screen reached from the Circadian "AI Protocol" timeline.
 * Pins the three load-bearing behaviours:
 *
 *   - Test A (prefilled): given a serialized planned slot (mealType + planned
 *     macros + suggested foods), the screen renders the slot title, the
 *     suggested foods, and the meal-type label — i.e. it arrives PREFILLED.
 *   - Test B (confirm logs with planMealId): pressing "LOG THIS MEAL" calls the
 *     mutation, and the payload built for `meals.logMeal` carries the slot's
 *     `mealType`, the forwarded `planMealId`, and a non-empty `foodItems` array
 *     derived from the suggested foods.
 *   - Test C (macro-only slot): a slot with NO itemized foods but planned macros
 *     still lets the user log (CTA enabled, "No itemized foods" empty state), and
 *     the logged payload synthesizes a single line from the planned macros.
 *   - Test D (dual-ring invalidation): a successful planned-meal log routes its
 *     onSuccess through the shared invalidateMealAndProgress(qc) helper, so it
 *     refreshes the per-day meal list AND BOTH calorie rings — ['daily-progress']
 *     (Nutrition tab) and ['today-progress'] (dashboard) — then router.back()s.
 *     Locks the split-brain fix: the old inline pair dropped ['today-progress'],
 *     leaving the dashboard ring stale after logging a planned meal.
 *
 * Mock conventions mirror the sibling screen suites (circadian / exercise-detail):
 *   - `expo-router` exposes a hoisted `mockPush`/`mockBack` and a mutable
 *     `mockParams` holder read by useLocalSearchParams (each test sets it before
 *     render()).
 *   - `@tanstack/react-query` is stubbed: useQuery (the optional food search)
 *     returns an idle empty result; useMutation captures the passed `mutationFn`
 *     into a hoisted holder so a test can invoke it and inspect the args handed
 *     to the mocked `logMeal`.
 *   - `@/api/meals` is mocked so the real axios client never loads; `logMeal` is
 *     a spy whose calls are asserted.
 *   - decorative glyphs, expo-image, safe-area insets and the status bar are
 *     stubbed the same way as the rest of the screen suites. The `@/components/ui`
 *     barrel is left REAL (assertions ride the real CtaButton / EmptyState).
 */

// ── jest.mock hoisting block (runs ABOVE the imports) ────────────────────────

const mockPush = jest.fn();
const mockBack = jest.fn();
// Mutable param holder — each test sets the serialized planned slot before render.
const mockParams: { current: Record<string, string> } = { current: {} };
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack, replace: jest.fn() }),
  useLocalSearchParams: () => mockParams.current,
}));

// Capture the mutationFn so Test B/C can invoke the real log payload builder and
// inspect what it forwards to the (mocked) logMeal. isPending is fixed false so
// the CTA renders its label, not the spinner. The onSuccess is ALSO captured so
// Test D can drive the success path and observe the cache invalidation + nav.
const mockMutationFn: { current: null | (() => unknown) } = { current: null };
const mockOnSuccess: { current: null | ((data?: unknown) => unknown) } = { current: null };
const mockMutate = jest.fn();
// A stable invalidateQueries spy shared by every useQueryClient() call in a
// render, so Test D can assert the exact set of query keys the success handler
// invalidates (via the shared invalidateMealAndProgress helper, kept REAL).
const mockInvalidateQueries = jest.fn();
const mockQueryClient = { invalidateQueries: mockInvalidateQueries };
jest.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: undefined, isLoading: false, isError: false, refetch: jest.fn() }),
  useMutation: ({ mutationFn, onSuccess }: { mutationFn: () => unknown; onSuccess?: (data?: unknown) => unknown }) => {
    mockMutationFn.current = mutationFn;
    mockOnSuccess.current = onSuccess ?? null;
    return { mutate: mockMutate, isPending: false };
  },
  useQueryClient: () => mockQueryClient,
}));

// api/meals — logMeal is the spy under assertion; searchFoods is never invoked
// (useQuery is stubbed) but must exist so the static import resolves.
const mockLogMeal = jest.fn((_payload?: unknown) => Promise.resolve({ id: 'log-1' }));
jest.mock('@/api/meals', () => ({
  logMeal: (...args: any[]) => mockLogMeal(...args),
  searchFoods: jest.fn(),
}));

jest.mock('@expo/vector-icons', () => {
  const { Text: RNText } = require('react-native');
  return { Ionicons: ({ name }: { name?: string }) => <RNText>{`icon:${name ?? ''}`}</RNText> };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));

// expo-image ships a native module — passthrough View so thumbnails mount.
jest.mock('expo-image', () => {
  const RN = require('react-native');
  return { Image: (props: any) => <RN.View {...props} /> };
});

jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

// ── Imports (run AFTER the hoisted mocks above) ──────────────────────────────
import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react-native';
import { ThemeContext, getThemeColors, typography, spacing, borderRadius, shadows } from '@/theme';
import LogPlannedMealScreen from '../../app/(meals)/log-planned-meal';

function renderScreen() {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      <LogPlannedMealScreen />
    </ThemeContext.Provider>,
  );
}

// A planned slot WITH itemized suggested foods.
const SLOT_WITH_FOODS = {
  mealType: 'DINNER',
  title: 'Mid-Shift Fuel',
  planMealId: 'plan-meal-xyz',
  plan: JSON.stringify({
    plannedMacros: { protein: 30, carbs: 40, fat: 10, calories: 450 },
    suggestedFoods: [
      { name: 'Grilled Salmon', amount: '150g', calories: 280, protein: 34, carbs: 0, fat: 16 },
      { name: 'Quinoa', amount: '1 cup', calories: 220, protein: 8, carbs: 39, fat: 4 },
    ],
    macros: '30P / 40C / 10F',
  }),
};

// A macro-only slot (no itemized foods).
const SLOT_MACRO_ONLY = {
  mealType: 'BREAKFAST',
  title: 'Recovery Fast',
  planMealId: 'plan-meal-fast',
  plan: JSON.stringify({
    plannedMacros: { protein: 20, carbs: 10, fat: 5, calories: 175 },
    suggestedFoods: [],
    macros: 'Fasting Window',
  }),
};

describe('LogPlannedMealScreen', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockBack.mockClear();
    mockMutate.mockClear();
    mockLogMeal.mockClear();
    mockInvalidateQueries.mockClear();
    mockMutationFn.current = null;
    mockOnSuccess.current = null;
    mockParams.current = {};
  });

  // ── Test A: prefilled from the planned slot ───────────────────────────────
  test('prefilled: renders the slot title, meal-type label and suggested foods', () => {
    mockParams.current = SLOT_WITH_FOODS;

    expect(() => renderScreen()).not.toThrow();

    // Slot title + meal-type context line (now the standalone meal-type label
    // "Dinner" plus the "FROM YOUR PROTOCOL" header overline).
    expect(screen.getByText('Mid-Shift Fuel')).toBeTruthy();
    expect(screen.getByText('Dinner')).toBeTruthy();
    expect(screen.getByText('FROM YOUR PROTOCOL')).toBeTruthy();

    // Both suggested foods render (prefilled, included by default).
    expect(screen.getByText('Grilled Salmon')).toBeTruthy();
    expect(screen.getByText('Quinoa')).toBeTruthy();
  });

  // ── Test B: confirm logs with planMealId + derived foodItems ──────────────
  test('confirm: pressing the CTA logs with the slot mealType, planMealId and derived foodItems', () => {
    mockParams.current = SLOT_WITH_FOODS;
    renderScreen();

    const cta = screen.getByRole('button', { name: /Log this planned meal/ });
    fireEvent.press(cta);

    // The CTA fires the mutation.
    expect(mockMutate).toHaveBeenCalledTimes(1);

    // Invoke the captured mutationFn to drive the real payload builder, then
    // inspect what it forwarded to the mocked logMeal.
    expect(mockMutationFn.current).toBeTruthy();
    mockMutationFn.current!();

    expect(mockLogMeal).toHaveBeenCalledTimes(1);
    const payload = mockLogMeal.mock.calls[0]![0] as {
      mealType: string;
      planMealId?: string;
      foodItems: Array<{ name: string }>;
    };
    expect(payload.mealType).toBe('DINNER');
    expect(payload.planMealId).toBe('plan-meal-xyz');
    expect(payload.foodItems).toHaveLength(2);
    expect(payload.foodItems.map((f) => f.name)).toEqual(['Grilled Salmon', 'Quinoa']);
  });

  // ── Test C: macro-only slot still loggable, synthesizes one line ──────────
  test('macro-only: shows the "No itemized foods" state but still logs a synthesized line', () => {
    mockParams.current = SLOT_MACRO_ONLY;
    renderScreen();

    // Honest empty state for the no-foods case.
    expect(screen.getByText('No itemized foods')).toBeTruthy();

    // CTA is still enabled (there are macros to log) — pressing it logs a single
    // synthesized line from the planned macros, tagged with planMealId.
    const cta = screen.getByRole('button', { name: /Log this planned meal/ });
    fireEvent.press(cta);
    expect(mockMutate).toHaveBeenCalledTimes(1);

    mockMutationFn.current!();
    expect(mockLogMeal).toHaveBeenCalledTimes(1);
    const payload = mockLogMeal.mock.calls[0]![0] as {
      mealType: string;
      planMealId?: string;
      foodItems: Array<{ name: string; calories: number; protein: number }>;
    };
    expect(payload.mealType).toBe('BREAKFAST');
    expect(payload.planMealId).toBe('plan-meal-fast');
    // Exactly one synthesized line carrying the planned macros.
    expect(payload.foodItems).toHaveLength(1);
    expect(payload.foodItems[0]!.calories).toBe(175);
    expect(payload.foodItems[0]!.protein).toBe(20);
  });

  // ── Test D: a successful log refreshes BOTH progress rings ────────────────
  // The onSuccess handler routes through the shared invalidateMealAndProgress(qc)
  // helper (kept REAL), so logging a planned meal must invalidate the per-day meal
  // list AND BOTH calorie rings: ['daily-progress'] (the Nutrition tab) and
  // ['today-progress'] (the dashboard). This pins the split-brain fix — a planned
  // meal logged here can no longer leave the dashboard ring stale — and that it
  // still calls router.back() afterward.
  test('success: invalidates meal-logs + BOTH progress rings (daily-progress & today-progress) then navigates back', () => {
    mockParams.current = SLOT_WITH_FOODS;
    renderScreen();

    // The screen registered an onSuccess via useMutation.
    expect(mockOnSuccess.current).toBeTruthy();

    // Drive the success path (as react-query would after logMeal resolves).
    mockOnSuccess.current!({ id: 'log-1' });

    // It refreshed all three keys through the shared helper, in particular BOTH
    // rings — the Nutrition tab's and the dashboard's.
    const invalidatedKeys = mockInvalidateQueries.mock.calls.map((c) => c[0].queryKey);
    expect(invalidatedKeys).toEqual(
      expect.arrayContaining([['meal-logs'], ['daily-progress'], ['today-progress']]),
    );
    // The dashboard ring key specifically — the one the old inline call dropped.
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['today-progress'] });

    // And it still dismisses the confirm screen.
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});
