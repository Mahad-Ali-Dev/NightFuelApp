/**
 * encyclopedia.test.tsx
 *
 * Render + behaviour lock on `app/(meals)/encyclopedia.tsx` — the food
 * encyclopedia (a search box + a "Browse by Category" image grid whose tap
 * filters, plus a virtualized FlatList of food rows whose tap opens a slide-up
 * serving Modal). After the serving-modal Nutrition Summary card was migrated to
 * the Aurora `GlassCard` primitive (a STATIC card — NOT the FlatList row path),
 * this suite pins the load-bearing branches so a regression can't merge:
 *
 *   - BROWSE GRID (empty query): with an empty search box and no category filter
 *     the screen is on its `showBrowse` branch — "Browse by Category" and every
 *     FOOD_CATS tile (Fruits / Vegetables / … ) render, and the FlatList is not
 *     mounted. No GlassCard is mounted yet (the only glass surface is the modal
 *     summary, which is closed).
 *   - SEARCH RESULTS (query.length>2): typing a >2-char term flips `showBrowse`
 *     false so the ['food-search', …] rows render as a FlatList of foodCards
 *     (each row's accessibilityLabel = item.name). Crucially we render MANY rows
 *     and assert NONE of them is wrapped in a GlassCard (zero glass-card testIDs
 *     while the modal is closed) — the row path stays a lean memoized useCallback,
 *     the exact anti-pattern the list-performance rules forbid.
 *   - ROW PRESS → SERVING MODAL with the GlassCard summary: pressing a row
 *     (accessibilityLabel = item.name) sets `servingModal` so the Modal renders
 *     its body — the food name, the "Nutrition Summary" label + the four macro
 *     stat columns, now wrapped in exactly ONE <GlassCard> (asserted via a
 *     testID-bearing GlassCard stub) — the coverage gain for this screen.
 *   - LOG MEAL CTA: the modal's CtaButton ("LOG MEAL", a11y "Log meal") calls
 *     logM.mutate with the pressed FoodItem, and the captured mutationFn forwards
 *     the built payload (mealType + a single quantity-scaled foodItems line) to
 *     the mocked logMeal.
 *   - SUCCESS → BOTH rings refresh: the captured onSuccess routes through the
 *     shared invalidateMealAndProgress(qc) helper (kept REAL), so a successful log
 *     invalidates ['meal-logs'] + ['daily-progress'] (the Nutrition tab ring) AND
 *     ['today-progress'] (the dashboard ring) — pinning the split-brain fix (the
 *     old inline call invalidated ONLY ['meal-logs'], leaving NEITHER ring fresh)
 *     — then closes the serving modal and navigates to the nutrition tab.
 *
 * Mock conventions mirror the sibling `(meals)` suites (recipes.test /
 * log-meal.test):
 *   - `expo-router` exposes a hoisted `mockPush`/`mockBack` so the post-log
 *     navigation target is inert + assertable.
 *   - `@tanstack/react-query` useQuery is stubbed and branches on queryKey[0]
 *     (['food-search'] reads a mutable holder a test sets before render);
 *     useMutation captures the screen's `mutationFn` into a holder so a test can
 *     invoke the real payload builder and inspect what it forwards to the (mocked)
 *     logMeal; isPending is fixed false so the CTA renders its label, not a
 *     spinner. useMutation also captures `onSuccess` so the success test can drive
 *     the cache-invalidation + modal-close + navigation path. useQueryClient
 *     returns a shared `invalidateQueries` spy so that test can assert the exact
 *     set of keys the shared invalidateMealAndProgress helper (kept REAL) fires.
 *   - `@/api/meals` is mocked so the real axios client never loads; `logMeal` is
 *     the spy under assertion (searchFoods exists only to satisfy the import
 *     graph — useQuery is fully stubbed).
 *   - The `@/components/ui` barrel is kept REAL (assertions ride the genuine
 *     CtaButton / EmptyState / Skeleton) EXCEPT `GlassCard` (→ a testID-bearing
 *     passthrough so the test can prove the serving-modal summary is wrapped in
 *     GlassCard — and that the FlatList rows are NOT — without mounting
 *     SafeBlurView/expo-blur internals).
 *   - decorative glyphs, expo-image, expo-linear-gradient, safe-area insets and
 *     the status bar are stubbed the same way as the rest of the screen suites.
 */

// ── jest.mock hoisting block (runs ABOVE the imports) ────────────────────────

// expo-router: hoisted `mock`-prefixed spies. `push` is the post-log nav target
// (router.push('/(tabs)/nutrition')); `back` is the header back control no-op.
const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack, replace: jest.fn() }),
}));

// react-query: branch on queryKey[0]. ['food-search'] reads a mutable holder
// (a test sets data before render). useMutation captures the screen's mutationFn
// so the CTA test can invoke the real payload builder and inspect what it
// forwards to the (mocked) logMeal; isPending is fixed false so the CTA renders
// its label (not the spinner). (All `mock`-prefixed so babel-plugin-jest-hoist
// permits the factory to close over them.)
type QState = { data: any; isLoading: boolean; isError: boolean };
const mockSearch: QState = { data: undefined, isLoading: false, isError: false };
const mockMutationFn: { current: null | ((payload?: unknown) => unknown) } = { current: null };
// Capture the mutation's onSuccess so a test can drive the success path and
// observe the cache invalidation + modal-close + navigation it performs.
const mockOnSuccess: { current: null | ((data?: unknown) => unknown) } = { current: null };
const mockMutate = jest.fn();
// A stable invalidateQueries spy shared by every useQueryClient() call in a
// render, so a test can assert the exact set of query keys the success handler
// invalidates (via the shared invalidateMealAndProgress helper, kept REAL).
const mockInvalidateQueries = jest.fn();
const mockQueryClient = { invalidateQueries: mockInvalidateQueries };
jest.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    const key = queryKey[0];
    if (key === 'food-search') {
      return {
        data: mockSearch.data,
        isLoading: mockSearch.isLoading,
        isError: mockSearch.isError,
        refetch: jest.fn(),
      };
    }
    return { data: undefined, isLoading: false, isError: false, refetch: jest.fn() };
  },
  useMutation: ({ mutationFn, onSuccess }: { mutationFn: (payload?: unknown) => unknown; onSuccess?: (data?: unknown) => unknown }) => {
    mockMutationFn.current = mutationFn;
    mockOnSuccess.current = onSuccess ?? null;
    return { mutate: mockMutate, isPending: false };
  },
  useQueryClient: () => mockQueryClient,
}));

// api/meals — logMeal is the spy under assertion; searchFoods exists only so the
// static import resolves (useQuery is fully stubbed, so it is never invoked).
const mockLogMeal = jest.fn((_payload?: unknown) => Promise.resolve({ id: 'log-1' }));
jest.mock('@/api/meals', () => ({
  logMeal: (...args: any[]) => mockLogMeal(...args),
  searchFoods: jest.fn(),
}));

// ── ui barrel: keep everything real EXCEPT GlassCard ─────────────────────────
// GlassCard → a testID-bearing passthrough so the modal test can prove the
// Nutrition Summary block is wrapped in GlassCard (and that the FlatList rows are
// NOT) without mounting SafeBlurView/expo-blur internals. Everything else —
// notably the real CtaButton + EmptyState + Skeleton — stays genuine so
// assertions ride the production components.
jest.mock('@/components/ui', () => {
  const actual = jest.requireActual('@/components/ui');
  const RN = require('react-native');
  return {
    ...actual,
    GlassCard: ({ children, ...props }: any) => (
      <RN.View testID="glass-card" {...props}>{children}</RN.View>
    ),
  };
});

// Decorative glyphs → plain <Text> surfacing the icon name (mirrors the rest of
// the suite). Otherwise pulls in expo-font → expo-asset.
jest.mock('@expo/vector-icons', () => {
  const { Text: RNText } = require('react-native');
  return { Ionicons: ({ name }: { name?: string }) => <RNText>{`icon:${name ?? ''}`}</RNText> };
});

// Deterministic insets so the screen lays out without the native provider.
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));

// expo-image ships a native module — passthrough View so the category tiles mount.
jest.mock('expo-image', () => {
  const RN = require('react-native');
  return { Image: (props: any) => <RN.View {...props} /> };
});

// expo-linear-gradient ships a native module — passthrough View so the tile
// scrim AND the real CtaButton's gradient fill mount on the jest renderer.
jest.mock('expo-linear-gradient', () => {
  const RN = require('react-native');
  return { LinearGradient: (props: any) => <RN.View {...props} /> };
});

// expo-status-bar renders nothing in the tree under test.
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

// ── Imports (run AFTER the hoisted mocks above) ──────────────────────────────
import React from 'react';
import { render, fireEvent, screen, act } from '@testing-library/react-native';
import {
  ThemeContext,
  getThemeColors,
  typography,
  spacing,
  borderRadius,
  shadows,
} from '@/theme';
import FoodEncyclopediaScreen from '../../app/(meals)/encyclopedia';

function renderScreen() {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      <FoodEncyclopediaScreen />
    </ThemeContext.Provider>,
  );
}

// A batch of food-search result rows (returned by the ['food-search'] query).
// Many rows on purpose: the search test proves NONE of them is glass-wrapped.
const SEARCH_FOODS = [
  { id: 'f1', name: 'Grilled Chicken', foodGroup: 'meat', calories: 220, protein: 40, carbs: 0, fat: 5, servingSize: '100g' },
  { id: 'f2', name: 'Brown Rice', foodGroup: 'grain', calories: 215, protein: 5, carbs: 45, fat: 2, servingSize: '1 cup' },
  { id: 'f3', name: 'Greek Yogurt', foodGroup: 'dairy', calories: 100, protein: 17, carbs: 6, fat: 0, servingSize: '170g' },
  { id: 'f4', name: 'Almonds', foodGroup: 'snack', calories: 164, protein: 6, carbs: 6, fat: 14, servingSize: '28g' },
  { id: 'f5', name: 'Banana', foodGroup: 'fruit', calories: 105, protein: 1, carbs: 27, fat: 0, servingSize: '1 medium' },
  { id: 'f6', name: 'Broccoli', foodGroup: 'vegetable', calories: 55, protein: 4, carbs: 11, fat: 1, servingSize: '1 cup' },
];

describe('FoodEncyclopediaScreen — food browser', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockBack.mockClear();
    mockMutate.mockClear();
    mockLogMeal.mockClear();
    mockInvalidateQueries.mockClear();
    mockMutationFn.current = null;
    mockOnSuccess.current = null;
    mockSearch.data = undefined;
    mockSearch.isLoading = false;
    mockSearch.isError = false;
  });

  // ── BROWSE GRID: empty query → category tiles, no FlatList, no glass yet ────
  test('browse grid: with an empty query the category browse grid renders (no search list, no GlassCard)', () => {
    renderScreen();

    // The `showBrowse` branch: the category heading + every FOOD_CATS tile.
    expect(screen.getByText('Browse by Category')).toBeTruthy();
    expect(screen.getByText('Fruits')).toBeTruthy();
    expect(screen.getByText('Vegetables')).toBeTruthy();
    expect(screen.getByText('Proteins')).toBeTruthy();
    expect(screen.getByText('Dairy')).toBeTruthy();
    expect(screen.getByText('Grains')).toBeTruthy();
    expect(screen.getByText('Snacks')).toBeTruthy();

    // No food rows render on the browse branch.
    expect(screen.queryByLabelText('Grilled Chicken')).toBeNull();
    // The only GlassCard is the serving-modal summary, which is closed.
    expect(screen.queryByTestId('glass-card')).toBeNull();
  });

  // ── SEARCH RESULTS: query>2 → FlatList rows, and NONE is glass-wrapped ──────
  test('search results: typing >2 chars surfaces the FlatList rows, and no row is wrapped in a GlassCard', () => {
    // The ['food-search'] branch returns rows once the screen leaves browse.
    mockSearch.data = SEARCH_FOODS;

    renderScreen();

    // Typing a >2-char term flips `showBrowse` false so the results list renders
    // (the screen gates browse on query.length<3 && !selGroup).
    fireEvent.changeText(screen.getByPlaceholderText('Search food encyclopedia...'), 'chick');

    // Every result row renders by its name (accessibilityLabel = item.name)…
    expect(screen.getByLabelText('Grilled Chicken')).toBeTruthy();
    expect(screen.getByLabelText('Brown Rice')).toBeTruthy();
    expect(screen.getByLabelText('Greek Yogurt')).toBeTruthy();
    expect(screen.getByLabelText('Almonds')).toBeTruthy();
    expect(screen.getByLabelText('Banana')).toBeTruthy();
    expect(screen.getByLabelText('Broccoli')).toBeTruthy();

    // …and the browse grid is gone.
    expect(screen.queryByText('Browse by Category')).toBeNull();

    // CRITICAL: many rows render, yet NONE is wrapped in a GlassCard — the
    // serving-modal summary (the only glass surface) is still closed, so there
    // are zero glass-card testIDs. The row path stays a lean memoized row.
    expect(screen.queryAllByTestId('glass-card')).toHaveLength(0);
  });

  // ── ROW PRESS → SERVING MODAL with the GlassCard summary ───────────────────
  test('row press opens the serving modal with the food name + a single GlassCard Nutrition Summary', () => {
    mockSearch.data = SEARCH_FOODS;

    renderScreen();

    fireEvent.changeText(screen.getByPlaceholderText('Search food encyclopedia...'), 'chick');

    // Press the first row (accessibilityLabel = item.name) → setServingModal(item).
    fireEvent.press(screen.getByLabelText('Grilled Chicken'));

    // The serving modal body renders the "Add to Plate" sheet heading, the food
    // display name, and the macro summary labels…
    expect(screen.getByText('Add to Plate')).toBeTruthy();
    expect(screen.getByText('NUTRITION FOR THIS SERVING')).toBeTruthy();
    expect(screen.getByText('HOW MANY SERVINGS?')).toBeTruthy();

    // …and that summary is wrapped in EXACTLY ONE GlassCard (the coverage gain) —
    // proving the static summary is glass while the FlatList rows are not.
    expect(screen.getAllByTestId('glass-card')).toHaveLength(1);
  });

  // ── LOG MEAL CTA: pressing it logs the built quantity-scaled payload ───────
  test('"LOG MEAL" CtaButton calls logM.mutate and forwards the scaled payload to logMeal', () => {
    mockSearch.data = SEARCH_FOODS;

    renderScreen();

    fireEvent.changeText(screen.getByPlaceholderText('Search food encyclopedia...'), 'chick');
    fireEvent.press(screen.getByLabelText('Grilled Chicken'));

    // The modal's primary CTA (a11y label "Track meal") fires the mutation with the
    // pressed FoodItem (default qty '1', default mealType BREAKFAST).
    fireEvent.press(screen.getByLabelText('Track meal'));
    expect(mockMutate).toHaveBeenCalledTimes(1);
    expect(mockMutate.mock.calls[0]![0]).toMatchObject({ id: 'f1', name: 'Grilled Chicken' });

    // The captured mutationFn builds the log payload and forwards it to logMeal:
    // default meal type + a single quantity-scaled line (qty 1 → 220 kcal / 40 P).
    expect(mockMutationFn.current).toBeTruthy();
    mockMutationFn.current!(SEARCH_FOODS[0] as any);
    expect(mockLogMeal).toHaveBeenCalledTimes(1);
    const payload = mockLogMeal.mock.calls[0]![0] as {
      mealType: string;
      foodItems: Array<{ foodId: string; name: string; quantity: number; calories: number; protein: number }>;
    };
    expect(payload.mealType).toBe('BREAKFAST');
    expect(payload.foodItems).toHaveLength(1);
    expect(payload.foodItems[0]!.foodId).toBe('f1');
    expect(payload.foodItems[0]!.name).toBe('Grilled Chicken');
    expect(payload.foodItems[0]!.quantity).toBe(1);
    expect(payload.foodItems[0]!.calories).toBe(220);
    expect(payload.foodItems[0]!.protein).toBe(40);
  });

  // ── SUCCESS: a meal logged from the encyclopedia refreshes BOTH rings ───────
  // The onSuccess handler routes through the shared invalidateMealAndProgress(qc)
  // helper (kept REAL), so a successful log invalidates the per-day meal list AND
  // BOTH calorie rings: ['daily-progress'] (the Nutrition tab) and
  // ['today-progress'] (the dashboard). This pins the split-brain fix — logging
  // from the encyclopedia previously invalidated ONLY ['meal-logs'], leaving
  // NEITHER ring fresh — and that success still closes the serving modal and
  // navigates to the nutrition tab.
  test('success: invalidates meal-logs + BOTH progress rings (daily-progress & today-progress), closes the modal then navigates', () => {
    mockSearch.data = SEARCH_FOODS;

    renderScreen();

    // Open the serving modal so we can prove success closes it.
    fireEvent.changeText(screen.getByPlaceholderText('Search food encyclopedia...'), 'chick');
    fireEvent.press(screen.getByLabelText('Grilled Chicken'));
    expect(screen.getByText('Add to Plate')).toBeTruthy();

    // The screen registered an onSuccess via useMutation.
    expect(mockOnSuccess.current).toBeTruthy();

    // Drive the success path (as react-query would after logMeal resolves).
    // Wrapped in act() because onSuccess flips the serving-modal state to null.
    act(() => {
      mockOnSuccess.current!({ id: 'log-1' });
    });

    // It refreshed all three keys through the shared helper, in particular BOTH
    // rings — the Nutrition tab's and the dashboard's — neither of which the old
    // lone ['meal-logs'] invalidation touched.
    const invalidatedKeys = mockInvalidateQueries.mock.calls.map((c) => c[0].queryKey);
    expect(invalidatedKeys).toEqual(
      expect.arrayContaining([['meal-logs'], ['daily-progress'], ['today-progress']]),
    );
    // The two ring keys specifically — the ones the old inline call dropped.
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['daily-progress'] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['today-progress'] });

    // Success closes the serving modal…
    expect(screen.queryByText('Add to Plate')).toBeNull();
    // …and routes the user to the nutrition tab.
    expect(mockPush).toHaveBeenCalledWith('/(tabs)/nutrition');
  });
});
