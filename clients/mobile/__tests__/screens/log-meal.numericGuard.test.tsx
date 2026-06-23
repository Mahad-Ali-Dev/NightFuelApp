/**
 * log-meal.numericGuard.test.tsx
 *
 * NUTRITION P2 — numeric guard + honest empty/error states for the build-a-plate
 * meal logger (`app/(meals)/log-meal.tsx`). This is a SEPARATE suite from
 * `log-meal.test.tsx` (render/behaviour lock) and `nutrition.errorStates.test.tsx`
 * (the Nutrition hub) — distinct filename, distinct focus, same module.
 *
 * The screen multiplies a per-item quantity into calories/macros for BOTH the
 * on-plate totals (the macro GlassCard) AND the logMeal payload. Quantity is
 * button-driven (+/- 0.5, floored at 0.5) and macros can arrive from an
 * untrusted barcode deep-link (`Number(params.barcodeCalories ?? 0)`), so the
 * real risk is a non-finite/non-positive number reaching the macro math or the
 * payload and surfacing a FABRICATED value (NaN / a phantom calorie count). The
 * screen now guards that seam: macros are coerced finite (NaN → 0), a qty that
 * isn't a finite number > 0 contributes ZERO to the macro math, the +/- stepper
 * floors the live qty at 0.5, and the log path EXCLUDES any unusable-qty item —
 * firing nothing when the plate has no loggable entry.
 *
 * This suite pins the guarantees in the acceptance:
 *   - Test 1 (no fabricated macros from a NaN barcode): a barcode prefill whose
 *     calorie/macro params are non-numeric does NOT surface a "NaN" anywhere, and
 *     logging it forwards a payload whose macros are real finite numbers (0), not
 *     NaN — no fabricated number reaches logMeal.
 *   - Test 2 (qty can never go non-positive): from the seeded qty of 1, pressing
 *     "Decrease" repeatedly floors at 0.5 — the stepper never renders 0/negative,
 *     so a non-positive quantity can never be logged.
 *   - Test 3 (valid qty logs once with the expected computed macros): a foodId
 *     prefill (qty 1) logs exactly once; the built payload carries qty*calories /
 *     qty*protein etc., and the captured mutationFn forwards it straight to the
 *     mocked logMeal.
 *   - Test 4 (honest empty state, no silent log): with no prefill and an empty
 *     search the "Build your plate" EmptyState renders and pressing LOG MEAL does
 *     NOT call the mutation (empty plate → no-op).
 *   - Test 5 (failed search → retryable EmptyState): a search error surfaces the
 *     "Search failed" EmptyState and its "Try Again" action refetches EXACTLY
 *     once (no silent hang, no fabricated rows).
 *
 * Mock conventions mirror the sibling log-meal.test.tsx: expo-router exposes a
 * hoisted push/back + a mutable `mockParams` holder; @tanstack/react-query is
 * stubbed (useQuery branches on queryKey[0]; useMutation captures the mutationFn
 * + returns a `mutate` spy); @/api/meals is mocked so the real axios client never
 * loads (logMeal is the spy under assertion). The REAL GlassCard / EmptyState
 * mount (SafeBlurView → passthrough View); decorative glyphs / expo-image /
 * expo-linear-gradient / insets / status bar are stubbed the usual way.
 */

// ── jest.mock hoisting block (runs ABOVE the imports) ────────────────────────

const mockPush = jest.fn();
const mockBack = jest.fn();
// Mutable param holder — each test sets the deep-link params before render.
const mockParams: { current: Record<string, string> } = { current: {} };
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack, replace: jest.fn() }),
  useLocalSearchParams: () => mockParams.current,
}));

// react-query: branch on queryKey[0].
//   ['log-food']    → the foodId prefill (a mutable holder; tests set data).
//   ['meal-search'] → the food search rows / error (a mutable holder).
// Each query gets its OWN refetch spy so a test can prove the search "Try Again"
// calls searchQ.refetch exactly once. useMutation captures the screen's
// mutationFn so a test can invoke the real payload builder and inspect what it
// forwards to the (mocked) logMeal; isPending is fixed false so the CTA renders
// its label, not the spinner.
type QueryState = { data: any; isLoading: boolean; isError: boolean };
const mockFoodState: QueryState = { data: undefined, isLoading: false, isError: false };
const mockSearchState: QueryState = { data: undefined, isLoading: false, isError: false };
const mockSearchRefetch = jest.fn();
const mockMutationFn: { current: null | ((payload?: unknown) => unknown) } = { current: null };
const mockMutate = jest.fn();
jest.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    const key = queryKey[0];
    if (key === 'log-food') {
      return { data: mockFoodState.data, isLoading: mockFoodState.isLoading, isError: mockFoodState.isError, refetch: jest.fn() };
    }
    if (key === 'meal-search') {
      return { data: mockSearchState.data, isLoading: mockSearchState.isLoading, isError: mockSearchState.isError, refetch: mockSearchRefetch };
    }
    // ['log-recipe'] and any other key — idle/empty (disabled in the screen).
    return { data: undefined, isLoading: false, isError: false, refetch: jest.fn() };
  },
  useMutation: ({ mutationFn }: { mutationFn: (payload?: unknown) => unknown }) => {
    mockMutationFn.current = mutationFn;
    return { mutate: mockMutate, isPending: false };
  },
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

// api/meals — logMeal is the spy under assertion; the rest exist so the static
// import resolves (useQuery is fully stubbed, so they are never invoked).
const mockLogMeal = jest.fn((_payload?: unknown) => Promise.resolve({ id: 'log-1' }));
jest.mock('@/api/meals', () => ({
  logMeal: (...args: any[]) => mockLogMeal(...args),
  searchFoods: jest.fn(),
  getFoodById: jest.fn(),
  getRecipe: jest.fn(),
}));

// SafeBlurView → passthrough View so the REAL GlassCard (kept real) mounts its
// frosted fill + children without expo-blur's native module.
jest.mock('@/components/SafeBlurView', () => {
  const RN = require('react-native');
  return { SafeBlurView: ({ children, ...rest }: any) => <RN.View {...rest}>{children}</RN.View> };
});

jest.mock('@expo/vector-icons', () => {
  const { Text: RNText } = require('react-native');
  return { Ionicons: ({ name }: { name?: string }) => <RNText>{`icon:${name ?? ''}`}</RNText> };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));

// expo-image ships a native module — passthrough View so the meal-type tiles mount.
jest.mock('expo-image', () => {
  const RN = require('react-native');
  return { Image: (props: any) => <RN.View {...props} /> };
});

// expo-linear-gradient ships a native module; the meal-tile scrim → passthrough View.
jest.mock('expo-linear-gradient', () => {
  const RN = require('react-native');
  return { LinearGradient: (props: any) => <RN.View {...props} /> };
});

jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

// ── Imports (run AFTER the hoisted mocks above) ──────────────────────────────
import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react-native';
import { ThemeContext, getThemeColors, typography, spacing, borderRadius, shadows } from '@/theme';
import LogMealScreen from '../../app/(meals)/log-meal';

function renderScreen() {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      <LogMealScreen />
    </ThemeContext.Provider>,
  );
}

// A valid prefill food (resolved by getFoodById from a `foodId` deep link).
const PREFILL_FOOD = { id: 'food-1', name: 'Grilled Chicken', calories: 220, protein: 40, carbs: 10, fat: 5 };

describe('LogMealScreen — numeric guard + honest empty/error states', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockBack.mockClear();
    mockMutate.mockClear();
    mockLogMeal.mockClear();
    mockSearchRefetch.mockClear();
    mockMutationFn.current = null;
    mockParams.current = {};
    mockFoodState.data = undefined;
    mockFoodState.isLoading = false;
    mockFoodState.isError = false;
    mockSearchState.data = undefined;
    mockSearchState.isLoading = false;
    mockSearchState.isError = false;
  });

  // ── Test 1: a NaN-sourced barcode macro never surfaces a fabricated number ──
  // The barcode deep-link feeds macros through `Number(param)`, which is NaN for
  // a non-numeric param. The guard coerces each macro finite (NaN → 0), so the
  // plate's macro summary shows real numbers (never the string "NaN"), and the
  // logged payload carries finite 0 macros — not NaN — so nothing fabricated is
  // ever written.
  test('barcode prefill with non-numeric macros yields no fabricated NaN (totals 0, payload finite)', () => {
    mockParams.current = {
      barcodeName: 'Mystery Bar',
      barcodeCalories: 'not-a-number',
      barcodeProtein: '',
      barcodeCarbs: 'abc',
      barcodeFat: 'NaN',
    };

    renderScreen();

    // The barcode item mounted on the plate…
    expect(screen.getByText('Your Plate')).toBeTruthy();
    expect(screen.getByText('Mystery Bar')).toBeTruthy();

    // …but NOTHING renders the literal string "NaN" (no fabricated macro leaked
    // into any Text node).
    expect(screen.queryByText(/NaN/)).toBeNull();

    // The four macro stat columns are present and each is a finite number (0),
    // not NaN. (The MealMacroSummary renders a kcal hero + Protein/Carbs/Fat
    // macro rings with a numeric value each.)
    expect(screen.getAllByText('kcal').length).toBeGreaterThan(0);
    expect(screen.getByText('Protein')).toBeTruthy();

    // Logging the (coerced) item forwards a payload whose macros are finite — the
    // guard turned every NaN into 0, so logMeal never sees a fabricated number.
    const cta = screen.getByRole('button', { name: 'Log meal' });
    fireEvent.press(cta);
    expect(mockMutate).toHaveBeenCalledTimes(1);

    const payload = mockMutate.mock.calls[0]![0] as {
      foodItems: Array<{ name: string; quantity: number; calories: number; protein: number; carbs: number; fat: number }>;
    };
    expect(payload.foodItems).toHaveLength(1);
    const line = payload.foodItems[0]!;
    expect(line.name).toBe('Mystery Bar');
    // Every numeric field is finite (no NaN propagated) and the coerced macros are 0.
    for (const v of [line.quantity, line.calories, line.protein, line.carbs, line.fat]) {
      expect(Number.isFinite(v)).toBe(true);
    }
    expect(line.calories).toBe(0);
    expect(line.protein).toBe(0);
    expect(line.carbs).toBe(0);
    expect(line.fat).toBe(0);
    // qty stayed the seeded, usable 1.
    expect(line.quantity).toBe(1);
  });

  // ── Test 2: the qty stepper can never drive quantity non-positive ───────────
  // Starting from the seeded qty of 1, the "Decrease" button floors at 0.5 — so a
  // zero/negative quantity (which would fabricate or zero-out a log line) is
  // unreachable through the UI.
  test('decrease floors qty at 0.5 — quantity can never become 0 or negative', () => {
    mockParams.current = { foodId: 'food-1' };
    mockFoodState.data = PREFILL_FOOD;

    renderScreen();

    // Seeded at 1x.
    expect(screen.getByText('1x')).toBeTruthy();

    const dec = screen.getByRole('button', { name: 'Decrease' });
    fireEvent.press(dec); // 1 → 0.5
    expect(screen.getByText('0.5x')).toBeTruthy();

    // Press again and again — it must stay floored at 0.5, never 0 or negative.
    fireEvent.press(dec);
    fireEvent.press(dec);
    expect(screen.getByText('0.5x')).toBeTruthy();
    expect(screen.queryByText('0x')).toBeNull();
    expect(screen.queryByText('-0.5x')).toBeNull();

    // Logging now still produces a positive, finite quantity (0.5) — never 0/neg.
    fireEvent.press(screen.getByRole('button', { name: 'Log meal' }));
    expect(mockMutate).toHaveBeenCalledTimes(1);
    const payload = mockMutate.mock.calls[0]![0] as { foodItems: Array<{ quantity: number; calories: number }> };
    expect(payload.foodItems[0]!.quantity).toBe(0.5);
    expect(payload.foodItems[0]!.calories).toBe(110); // 220 * 0.5, a real computed macro
  });

  // ── Test 3: a valid qty logs exactly once with the expected computed macros ──
  test('valid plate logs once and forwards qty*macro to logMeal', () => {
    mockParams.current = { foodId: 'food-1' };
    mockFoodState.data = PREFILL_FOOD;

    renderScreen();

    const cta = screen.getByRole('button', { name: 'Log meal' });
    fireEvent.press(cta);

    // Fired exactly once.
    expect(mockMutate).toHaveBeenCalledTimes(1);
    const payload = mockMutate.mock.calls[0]![0] as {
      mealType: string;
      foodItems: Array<{ name: string; quantity: number; calories: number; protein: number; carbs: number; fat: number }>;
    };
    expect(payload.mealType).toBe('BREAKFAST');
    expect(payload.foodItems).toHaveLength(1);
    const line = payload.foodItems[0]!;
    // qty is 1, so each macro is exactly qty*serving — the expected computed value.
    expect(line.name).toBe('Grilled Chicken');
    expect(line.quantity).toBe(1);
    expect(line.calories).toBe(220);
    expect(line.protein).toBe(40);
    expect(line.carbs).toBe(10);
    expect(line.fat).toBe(5);

    // The captured mutationFn forwards that payload straight to the mocked logMeal.
    expect(mockMutationFn.current).toBeTruthy();
    mockMutationFn.current!(payload as any);
    expect(mockLogMeal).toHaveBeenCalledTimes(1);
    expect(mockLogMeal.mock.calls[0]![0]).toBe(payload);
  });

  // ── Test 4: honest empty state, and an empty plate never logs ───────────────
  test('empty plate renders the honest "Build your plate" state and pressing LOG MEAL is a no-op', () => {
    expect(() => renderScreen()).not.toThrow();

    // Honest empty copy (no entries) — the real EmptyState, not a hanging spinner.
    expect(screen.getByText('Build your plate')).toBeTruthy();
    expect(
      screen.getByText('Search for a food above to start adding items, then log them all at once.'),
    ).toBeTruthy();
    // No plate / macro chrome while empty.
    expect(screen.queryByText('Your Plate')).toBeNull();

    // The footer CTA is present (disabled) — pressing it must NOT log anything.
    const cta = screen.getByRole('button', { name: 'Log meal' });
    fireEvent.press(cta);
    expect(mockMutate).not.toHaveBeenCalled();
  });

  // ── Test 5: a failed search surfaces a retryable EmptyState (refetch once) ───
  // The screen gates the search on sq.length > 2; once that holds and the query
  // errors, the honest "Search failed" EmptyState renders, and its "Try Again"
  // action refetches the search query EXACTLY once (no silent hang, no fabricated
  // result rows).
  test('failed search renders the retryable EmptyState whose action refetches exactly once', () => {
    mockSearchState.isError = true; // the ['meal-search'] query is in its error state

    renderScreen();

    // Drive sq.length > 2 so the search branch is active.
    const input = screen.getByPlaceholderText('Search foods to add...');
    fireEvent.changeText(input, 'rice');

    // Honest, retryable error copy — NOT a spinner, NOT fabricated rows.
    expect(screen.getByText('Search failed')).toBeTruthy();
    expect(
      screen.getByText("Couldn't reach the food database. Check your connection and try again."),
    ).toBeTruthy();
    // The empty-plate "Build your plate" state is hidden once a search is active.
    expect(screen.queryByText('Build your plate')).toBeNull();

    // The action refetches the search query exactly once. (Query by text — the
    // EmptyState's primary Button surfaces its label as a Text node, mirroring
    // the sibling nutrition.errorStates suite's "Try Again" assertion.)
    const retry = screen.getByText('Try Again');
    expect(mockSearchRefetch).not.toHaveBeenCalled();
    fireEvent.press(retry);
    expect(mockSearchRefetch).toHaveBeenCalledTimes(1);
  });
});
