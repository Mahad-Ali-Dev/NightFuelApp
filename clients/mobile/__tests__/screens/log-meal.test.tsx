/**
 * log-meal.test.tsx
 *
 * Render + behaviour lock on `app/(meals)/log-meal.tsx` — the build-a-plate meal
 * logger reached from the nutrition tab (and from a food/recipe/barcode deep
 * link). The screen lets you pick a meal type, search the food DB, stack items
 * onto a "plate", and log them all at once. After its static card surfaces were
 * migrated to the Aurora `GlassCard` primitive (the search box + the plate-total
 * macro summary), this suite pins the load-bearing branches so a regression
 * can't merge:
 *
 *   - Test A (empty plate): with no prefill and an empty search box, the screen
 *     is on its empty branch — the "Build your plate" EmptyState renders and the
 *     footer "LOG MEAL" CtaButton is DISABLED (no silent empty log).
 *   - Test B (queued item → plate + macro GlassCard): given a `foodId` param,
 *     the screen prefills ONE plate item from getFoodById; "Your Plate", the
 *     queued item name, and the macro summary (KCAL/PROTEIN/CARBS/FAT) all
 *     render — i.e. the plate + the macro GlassCard mounted with live totals.
 *   - Test C (search drives results, enabled when sq.length>2): typing >2 chars
 *     into the search TextInput updates the controlled query so the ['meal-search']
 *     branch returns rows; the result rows render (accessibilityLabel "Add <name>")
 *     and tapping one adds it to the plate.
 *   - Test D (CTA logs when plate non-empty): with a prefilled plate the footer
 *     "LOG MEAL" CtaButton is enabled; pressing it calls logM.mutate, and the
 *     captured mutationFn forwards the built payload (mealType + non-empty
 *     foodItems) to the mocked logMeal.
 *   - Test E (success refreshes BOTH progress rings): the captured onSuccess
 *     routes through the shared invalidateMealAndProgress(qc) helper, so a
 *     successful log invalidates ['meal-logs'] + ['daily-progress'] (the Nutrition
 *     tab ring) AND ['today-progress'] (the dashboard ring) — pinning that a meal
 *     logged here can't leave the dashboard ring stale — then navigates to the
 *     nutrition tab.
 *
 * Mock conventions mirror the sibling `(meals)` suite (log-planned-meal.test) +
 * the GlassCard render suites (hydration.test):
 *   - `expo-router` exposes a hoisted `mockPush`/`mockBack` and a mutable
 *     `mockParams` holder read by useLocalSearchParams (each test sets it before
 *     render()).
 *   - `@tanstack/react-query` is stubbed: useQuery branches on queryKey[0]
 *     (['log-food'] drives the prefill; ['meal-search'] drives the search rows
 *     via a mutable `mockSearchState` holder); useMutation captures the passed
 *     `mutationFn` into a holder so a test can invoke it and inspect the args
 *     handed to the mocked `logMeal`, and returns `mutate`/`isPending:false`.
 *   - `@/api/meals` is mocked so the real axios client never loads; `logMeal` is
 *     the spy under assertion (searchFoods / getFoodById / getRecipe exist only
 *     to satisfy the import graph — useQuery is fully stubbed).
 *   - `@/components/SafeBlurView` is a passthrough View so the REAL GlassCard
 *     (kept real, via the @/components/ui barrel) mounts its frosted fill +
 *     children — the assertions ride on the actual search-box / plate / macro
 *     content inside it.
 *   - decorative glyphs, expo-image, expo-linear-gradient, safe-area insets and
 *     the status bar are stubbed the same way as the rest of the screen suites.
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
//   ['log-food']    → the foodId prefill (a mutable holder; Test B/D set data).
//   ['meal-search'] → the food search rows (a mutable holder; Test C sets data).
// useMutation captures the screen's mutationFn so Test D can invoke the real
// payload builder and inspect what it forwards to the (mocked) logMeal; isPending
// is fixed false so the CTA renders its label, not the spinner.
type QueryState = { data: any; isLoading: boolean; isError: boolean };
const mockFoodState: QueryState = { data: undefined, isLoading: false, isError: false };
const mockSearchState: QueryState = { data: undefined, isLoading: false, isError: false };
const mockMutationFn: { current: null | ((payload?: unknown) => unknown) } = { current: null };
// Capture the mutation's onSuccess so a test can drive the success path and
// observe the cache invalidation + navigation it performs.
const mockOnSuccess: { current: null | ((data?: unknown) => unknown) } = { current: null };
const mockMutate = jest.fn();
// A stable invalidateQueries spy shared by every useQueryClient() call in a
// render, so a test can assert the exact set of query keys the success handler
// invalidates (via the shared invalidateMealAndProgress helper, kept REAL below).
const mockInvalidateQueries = jest.fn();
const mockQueryClient = { invalidateQueries: mockInvalidateQueries };
jest.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    const key = queryKey[0];
    if (key === 'log-food') {
      return { data: mockFoodState.data, isLoading: mockFoodState.isLoading, isError: mockFoodState.isError, refetch: jest.fn() };
    }
    if (key === 'meal-search') {
      return { data: mockSearchState.data, isLoading: mockSearchState.isLoading, isError: mockSearchState.isError, refetch: jest.fn() };
    }
    // ['log-recipe'] and any other key — idle/empty (disabled in the screen).
    return { data: undefined, isLoading: false, isError: false, refetch: jest.fn() };
  },
  useMutation: ({ mutationFn, onSuccess }: { mutationFn: (payload?: unknown) => unknown; onSuccess?: (data?: unknown) => unknown }) => {
    mockMutationFn.current = mutationFn;
    mockOnSuccess.current = onSuccess ?? null;
    return { mutate: mockMutate, isPending: false };
  },
  useQueryClient: () => mockQueryClient,
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
// frosted fill + children (the search box + the macro summary) without
// expo-blur's native module.
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

// A prefill food (resolved by getFoodById from a `foodId` deep link).
const PREFILL_FOOD = { id: 'food-1', name: 'Grilled Chicken', calories: 220, protein: 40, carbs: 0, fat: 5 };
// A food-search result row (returned by the ['meal-search'] query).
const SEARCH_FOODS = [{ id: 'srch-1', name: 'Brown Rice', calories: 215, protein: 5, carbs: 45, fat: 2 }];

describe('LogMealScreen', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockBack.mockClear();
    mockMutate.mockClear();
    mockLogMeal.mockClear();
    mockInvalidateQueries.mockClear();
    mockMutationFn.current = null;
    mockOnSuccess.current = null;
    mockParams.current = {};
    mockFoodState.data = undefined;
    mockFoodState.isLoading = false;
    mockFoodState.isError = false;
    mockSearchState.data = undefined;
    mockSearchState.isLoading = false;
    mockSearchState.isError = false;
  });

  // ── Test A: empty plate → EmptyState + disabled CTA ───────────────────────
  test('empty plate: renders the "Build your plate" empty state and a disabled LOG MEAL CTA', () => {
    expect(() => renderScreen()).not.toThrow();

    // Honest empty state for the no-plate / no-search case.
    expect(screen.getByText('Build your plate')).toBeTruthy();

    // Footer CTA is present but disabled (plate is empty) — pressing it is a no-op.
    const cta = screen.getByRole('button', { name: 'Log meal' });
    fireEvent.press(cta);
    expect(mockMutate).not.toHaveBeenCalled();
  });

  // ── Test B: queued item → plate + macro GlassCard ─────────────────────────
  test('queued item: a foodId prefill renders the plate row and the macro summary card', () => {
    mockParams.current = { foodId: 'food-1' };
    mockFoodState.data = PREFILL_FOOD;

    renderScreen();

    // The plate mounted with the prefilled item.
    expect(screen.getByText('Your Plate')).toBeTruthy();
    expect(screen.getByText('Grilled Chicken')).toBeTruthy();

    // The macro GlassCard mounted with the four live-total stat columns.
    expect(screen.getByText('KCAL')).toBeTruthy();
    expect(screen.getByText('PROTEIN')).toBeTruthy();
    expect(screen.getByText('CARBS')).toBeTruthy();
    expect(screen.getByText('FAT')).toBeTruthy();

    // The empty state is gone once there's a plate item.
    expect(screen.queryByText('Build your plate')).toBeNull();
  });

  // ── Test C: search drives results (enabled when sq.length>2), tap adds ─────
  test('search: typing >2 chars surfaces result rows, and tapping one adds it to the plate', () => {
    // The screen gates the search query on sq.length > 2; once that holds, the
    // ['meal-search'] branch returns rows.
    mockSearchState.data = SEARCH_FOODS;

    renderScreen();

    // Typing into the search box updates the controlled value (sq) — use a >2
    // char term so the result list renders.
    const input = screen.getByPlaceholderText('Search food...');
    fireEvent.changeText(input, 'rice');

    // The result row renders with its add-affordance accessibility label.
    const addRow = screen.getByRole('button', { name: 'Add Brown Rice' });
    expect(addRow).toBeTruthy();

    // Tapping it adds the food to the plate (the plate section now mounts).
    fireEvent.press(addRow);
    expect(screen.getByText('Your Plate')).toBeTruthy();
    expect(screen.getByText('Brown Rice')).toBeTruthy();
  });

  // ── Test D: CTA logs when the plate is non-empty ──────────────────────────
  test('confirm: with a non-empty plate, pressing LOG MEAL calls the mutation and logs the built payload', () => {
    mockParams.current = { foodId: 'food-1' };
    mockFoodState.data = PREFILL_FOOD;

    renderScreen();

    const cta = screen.getByRole('button', { name: 'Log meal' });
    fireEvent.press(cta);

    // The CTA fires the mutation (handleLog → logM.mutate) with the built payload.
    expect(mockMutate).toHaveBeenCalledTimes(1);
    const payload = mockMutate.mock.calls[0]![0] as {
      mealType: string;
      foodItems: Array<{ name: string; calories: number; protein: number }>;
    };
    // Default meal type (BREAKFAST) + a single line derived from the prefill.
    expect(payload.mealType).toBe('BREAKFAST');
    expect(payload.foodItems).toHaveLength(1);
    expect(payload.foodItems[0]!.name).toBe('Grilled Chicken');
    expect(payload.foodItems[0]!.calories).toBe(220);
    expect(payload.foodItems[0]!.protein).toBe(40);

    // And the mutationFn forwards that payload straight to the (mocked) logMeal.
    expect(mockMutationFn.current).toBeTruthy();
    mockMutationFn.current!(payload as any);
    expect(mockLogMeal).toHaveBeenCalledTimes(1);
    expect(mockLogMeal.mock.calls[0]![0]).toBe(payload);
  });

  // ── Test E: a successful log refreshes BOTH progress rings ────────────────
  // The onSuccess handler routes through the shared invalidateMealAndProgress(qc)
  // helper (kept REAL), so it must invalidate the per-day meal list AND BOTH
  // calorie rings: ['daily-progress'] (the Nutrition tab) and ['today-progress']
  // (the dashboard). This locks the split-brain fix — a meal logged here can no
  // longer leave the dashboard ring stale — and that it still navigates to the
  // nutrition tab afterward.
  test('success: invalidates meal-logs + BOTH progress rings (daily-progress & today-progress) then navigates', () => {
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

    // And it still routes the user to the nutrition tab.
    expect(mockPush).toHaveBeenCalledWith('/(tabs)/nutrition');
  });
});
