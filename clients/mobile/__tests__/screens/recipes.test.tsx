/**
 * recipes.test.tsx
 *
 * Render + behaviour lock on `app/(meals)/recipes.tsx` — the "Ria's Kitchen"
 * recipe browser (a tag-filtered grid of image tiles whose tap opens a slide-up
 * detail Modal). Pins the load-bearing behaviours the Aurora GlassCard-coverage
 * change touched, plus the surrounding query/nav/state contract it must NOT have
 * regressed:
 *
 *   - LOADING: while the ['recipes', …] list query is loading, the screen renders
 *     its 3 Skeleton placeholders (and none of the recipe tiles).
 *   - LOADED: with recipes resolved, every tile renders by its `r.title`.
 *   - TILE PRESS → DETAIL MODAL: pressing a tile (accessibilityLabel = r.title)
 *     sets detailId so the ['recipe-detail', id] query enables; with the detail
 *     resolved the Modal body renders the recipe title AND the PREP/COOK/KCAL
 *     summary, now wrapped in a <GlassCard> (asserted via a testID-bearing
 *     GlassCard stub) — the coverage gain for this screen.
 *   - LOG AS MEAL: the detail modal's CtaButton ("LOG AS MEAL", a11y "Log as
 *     meal") pushes to '/(meals)/log-meal' with the recipe id as `recipeId` and
 *     closes the modal.
 *   - FILTER CHIP: pressing a tag chip toggles `selTag` (the list query re-keys
 *     to that tag), and the chip reports accessibilityState.selected.
 *
 * Mock conventions mirror the sibling screen suites (nutrition.errorStates /
 * exercise-detail / log-planned-meal):
 *   - `@tanstack/react-query` useQuery is stubbed and branches on queryKey[0]:
 *     ['recipes'] reads a mutable list holder (and records the queryKey it was
 *     called with so the filter test can prove the re-key); ['recipe-detail']
 *     reads a mutable detail holder. Both are read at call-time so a test that
 *     mutates a holder before render() sees its branch.
 *   - `@/api/meals` is mocked (getRecipes/getRecipe spies) so the real axios
 *     client never loads; useQuery is mocked so the queryFns are never invoked —
 *     they only satisfy the import graph.
 *   - `expo-router` exposes a hoisted `mockPush`/`mockBack` so the CTA's
 *     navigation target is assertable.
 *   - The `@/components/ui` barrel is kept REAL (assertions ride the genuine
 *     CtaButton / EmptyState) EXCEPT `Skeleton` (→ a testID-bearing View so the
 *     loading state is assertable — the real one is an unlabelled Animated.View)
 *     and `GlassCard` (→ a testID-bearing passthrough so the test can prove the
 *     summary block is wrapped in GlassCard without asserting on blur internals).
 *   - decorative glyphs, expo-image, expo-linear-gradient, safe-area insets and
 *     the status bar are stubbed the same way as the rest of the screen suites.
 */

// ── jest.mock hoisting block (runs ABOVE the imports) ────────────────────────

// expo-router: hoisted `mock`-prefixed spies so the "LOG AS MEAL" case can
// assert exactly where (and with what params) the CtaButton navigated. `back`
// is the header back control's benign no-op.
const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack, replace: jest.fn() }),
}));

// Controlled state for the two queries the screen issues. Each test drives a
// branch by mutating the relevant holder before render().
//   - mockRecipes  → the ['recipes', selTag] list query
//   - mockDetail   → the ['recipe-detail', detailId] detail query
// `mockRecipeKeys` records every queryKey the list query was called with so the
// filter-chip test can prove the re-key to the selected tag. (All `mock`-prefixed
// so babel-plugin-jest-hoist permits the factory to close over them.)
type QState = { data: any; isLoading: boolean; isError: boolean };
const mockRecipes: QState = { data: undefined, isLoading: false, isError: false };
const mockDetail: QState = { data: undefined, isLoading: false, isError: false };
const mockRecipeKeys: { current: ReadonlyArray<unknown>[] } = { current: [] };

jest.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    const key = queryKey[0];
    if (key === 'recipes') {
      mockRecipeKeys.current.push(queryKey);
      return {
        data: mockRecipes.data,
        isLoading: mockRecipes.isLoading,
        isError: mockRecipes.isError,
        refetch: jest.fn(),
      };
    }
    if (key === 'recipe-detail') {
      return {
        data: mockDetail.data,
        isLoading: mockDetail.isLoading,
        isError: mockDetail.isError,
        refetch: jest.fn(),
      };
    }
    return { data: undefined, isLoading: false, isError: false, refetch: jest.fn() };
  },
}));

// api/meals — the queryFns are never invoked (useQuery is mocked above); these
// spies only satisfy the screen's static import so the real axios client never
// loads.
jest.mock('@/api/meals', () => ({
  getRecipes: jest.fn(),
  getRecipe: jest.fn(),
}));

// ── ui barrel: keep everything real EXCEPT Skeleton + GlassCard ──────────────
// Skeleton → a testID-bearing View so the loading branch is assertable (the real
// Skeleton is an unlabelled Animated.View). GlassCard → a testID-bearing
// passthrough so the detail test can prove the PREP/COOK/KCAL summary is wrapped
// in GlassCard (without mounting SafeBlurView/expo-blur internals). Everything
// else — notably the real CtaButton + EmptyState — stays genuine so assertions
// ride the production components.
jest.mock('@/components/ui', () => {
  const actual = jest.requireActual('@/components/ui');
  const RN = require('react-native');
  return {
    ...actual,
    Skeleton: (props: any) => <RN.View testID="skeleton" {...props} />,
    GlassCard: ({ children, ...props }: any) => (
      <RN.View testID="glass-card" {...props}>{children}</RN.View>
    ),
  };
});

// Decorative glyphs → plain <Text> surfacing the icon name (mirrors the rest of
// the suite). Otherwise pulls in expo-font → expo-asset.
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

// expo-image ships a native module — passthrough View so the tile background +
// modal hero image mount on the jest renderer.
jest.mock('expo-image', () => {
  const RN = require('react-native');
  return { Image: (props: any) => <RN.View {...props} /> };
});

// expo-linear-gradient ships a native module — passthrough View so the tile's
// scrim gradient mounts.
jest.mock('expo-linear-gradient', () => {
  const RN = require('react-native');
  return { LinearGradient: (props: any) => <RN.View {...props} /> };
});

// expo-status-bar renders nothing in the tree under test.
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

// ── Imports (run AFTER the hoisted mocks above) ──────────────────────────────
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
import RecipesScreen from '../../app/(meals)/recipes';

function renderScreen() {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      <RecipesScreen />
    </ThemeContext.Provider>,
  );
}

// Two recipes for the LOADED list. Minimal shape — only the fields the tile
// renders (title + macro/time badges).
const RECIPES = [
  { id: 'r1', title: 'Salmon Power Bowl', prepTimeMins: 10, cookTimeMins: 15, servings: 2, calories: 520, protein: 38, carbs: 22 },
  { id: 'r2', title: 'Keto Chili', prepTimeMins: 15, cookTimeMins: 40, servings: 4, calories: 610, protein: 42, carbs: 12 },
];

// A populated recipe detail used by the modal cases. Carries the summary stats
// (prep/cook/kcal — the GlassCard-wrapped block) plus the ingredient/instruction
// arrays the modal body iterates.
const DETAIL = {
  id: 'r1',
  title: 'Salmon Power Bowl',
  prepTimeMins: 10,
  cookTimeMins: 15,
  servings: 2,
  calories: 520,
  protein: 38,
  carbs: 22,
  fat: 24,
  ingredients: [{ name: 'Salmon fillet', amount: '150', unit: 'g' }],
  instructions: ['Sear the salmon.', 'Assemble the bowl.'],
};

describe('RecipesScreen — Ria\'s Kitchen browser', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockBack.mockClear();
    mockRecipes.data = undefined;
    mockRecipes.isLoading = false;
    mockRecipes.isError = false;
    mockDetail.data = undefined;
    mockDetail.isLoading = false;
    mockDetail.isError = false;
    mockRecipeKeys.current = [];
  });

  // ── LOADING: list query loading → Skeleton placeholders, no tiles ──────────
  test('LOADING: renders Skeleton placeholders while the recipe list loads', () => {
    mockRecipes.isLoading = true;

    renderScreen();

    // The loading branch renders three 220-tall Skeletons.
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThanOrEqual(3);
    // No recipe tiles while loading.
    expect(screen.queryByText('Salmon Power Bowl')).toBeNull();
    // Header chrome still renders.
    expect(screen.getByText("Ria's Kitchen")).toBeTruthy();
  });

  // ── LOADED: each recipe tile renders by its title ──────────────────────────
  test('LOADED: renders a tile for each recipe by r.title', () => {
    mockRecipes.data = RECIPES;

    renderScreen();

    expect(screen.getByText('Salmon Power Bowl')).toBeTruthy();
    expect(screen.getByText('Keto Chili')).toBeTruthy();
    // Loading skeletons are gone in the loaded state.
    expect(screen.queryByTestId('skeleton')).toBeNull();
    // The detail modal is not mounted until a tile is pressed.
    expect(screen.queryByTestId('glass-card')).toBeNull();
  });

  // ── TILE PRESS → DETAIL MODAL with the GlassCard summary ───────────────────
  test('tile press opens the detail modal with the recipe title + GlassCard PREP/COOK/KCAL summary', () => {
    mockRecipes.data = RECIPES;
    // The detail query is resolved so that, once detailId is set by the tap, the
    // modal renders its loaded body.
    mockDetail.data = DETAIL;

    renderScreen();

    // Press the first tile (accessibilityLabel = r.title) → setDetailId('r1').
    fireEvent.press(screen.getByLabelText('Salmon Power Bowl'));

    // The detail modal body renders the recipe title (the display heading) and
    // the PREP / COOK / KCAL summary labels…
    expect(screen.getByText('PREP')).toBeTruthy();
    expect(screen.getByText('COOK')).toBeTruthy();
    expect(screen.getByText('KCAL')).toBeTruthy();
    // …and that summary is wrapped in a GlassCard (the coverage gain).
    expect(screen.getByTestId('glass-card')).toBeTruthy();
    // The modal also renders the Ingredients/Instructions sections + the CTA.
    expect(screen.getByText('Ingredients')).toBeTruthy();
    expect(screen.getByText('Instructions')).toBeTruthy();
  });

  // ── LOG AS MEAL: CtaButton routes to /(meals)/log-meal with the recipe id ──
  test('"LOG AS MEAL" CtaButton pushes to /(meals)/log-meal with the recipe id as recipeId', () => {
    mockRecipes.data = RECIPES;
    mockDetail.data = DETAIL;

    renderScreen();

    // Open the detail modal, then press the CTA (a11y label "Log as meal").
    fireEvent.press(screen.getByLabelText('Salmon Power Bowl'));
    fireEvent.press(screen.getByLabelText('Log as meal'));

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(meals)/log-meal',
      params: { recipeId: 'r1' },
    });
  });

  // ── FILTER CHIP: toggles selTag → list query re-keys to the selected tag ───
  test('a filter chip toggles selTag and re-queries the recipe list for that tag', () => {
    mockRecipes.data = RECIPES;

    renderScreen();

    // The initial list query is keyed on the default 'all' tag.
    expect(mockRecipeKeys.current.some((k) => k[1] === 'all')).toBe(true);

    // Press the "High Protein" chip (accessibilityLabel = its label).
    fireEvent.press(screen.getByLabelText('High Protein'));

    // The chip now reports selected, and the list query has re-keyed to the
    // 'high-protein' tag (proving setSelTag drove the re-query).
    expect(screen.getByLabelText('High Protein').props.accessibilityState).toMatchObject({
      selected: true,
    });
    expect(mockRecipeKeys.current.some((k) => k[1] === 'high-protein')).toBe(true);
  });
});
