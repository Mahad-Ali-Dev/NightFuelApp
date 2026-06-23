/**
 * exercises-index.test.tsx
 *
 * Render-state coverage for the Exercise Library hub (`app/(exercises)/index.tsx`)
 * — the screen converted to the Aurora GlassCard primitive in the
 * aurora-coverage pass. No other suite mounts this screen, so this pins its two
 * primary render branches against a regression:
 *
 *   (a) GRID branch — when a category filter is active (so `showBrowse` is
 *       false) and the library query resolves a non-empty list, the two-column
 *       <FlatList> renders one GlassCard-wrapped card PER exercise (the mocked
 *       items' names), and the search row (the "Search exercises..." field +
 *       the "Muscles" control) renders alongside it. Tapping a card pushes to
 *       `/(exercises)/<id>` — confirming the GlassCard wrap left the
 *       TouchableOpacity press handler intact.
 *
 *   (b) BROWSE branch — with no filter active (`showBrowse` true) the category
 *       cards render (Gym / Home / Cardio / Recovery) and tapping one drives the
 *       screen into a category filter (the back/clear "… EXERCISES" affordance
 *       appears) — i.e. the category row renders with the mocked catalog data
 *       and its onPress state branch is unchanged.
 *
 * Additive + render-only: NEW test file only; the screen is exercised through a
 * mocked `useQuery` holder (the same hoisted-holder idiom as
 * exercise-detail.test.tsx) so the populated / browse branches are driven
 * deterministically without a network or a real QueryClient.
 *
 * Mock conventions mirror the sibling screen suites (exercise-detail /
 * shifts-index / analytics):
 *   - expo-router exposes a hoisted `mockPush`; `useLocalSearchParams` is a
 *     mutable holder so each test picks the initial category (grid) or none
 *     (browse).
 *   - `@/api/exercises` `searchLibrary` is stubbed (never invoked — useQuery is
 *     mocked — it only satisfies the import graph / avoids the axios client).
 *   - `@tanstack/react-query` useQuery reads a mutable `mockLibrary` holder.
 *   - `@/components/SafeBlurView` is a passthrough View so the REAL GlassCard
 *     (kept real) mounts its frosted fill + children without expo-blur's native
 *     module.
 *   - expo-image / expo-linear-gradient → passthrough Views; @expo/vector-icons
 *     → plain <Text>; safe-area insets fixed; expo-status-bar inert; the
 *     `(tabs)/_layout` import stubbed to just `{ TAB_BAR_H }` so the real tab
 *     navigator never loads.
 */

// ── jest.mock hoisting block (runs ABOVE the imports) ────────────────────────

// expo-router: `push` is a hoisted `mock`-prefixed holder so the card-tap case
// can assert exactly where the grid item navigated. `useLocalSearchParams`
// reads a mutable holder so a test can seed the initial `category` (forcing the
// grid branch) or leave it empty (the browse branch). The `mock` prefix lets
// babel-plugin-jest-hoist allow the factory to close over these holders.
const mockPush = jest.fn();
const mockParams: { category?: string } = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));

// Controlled state for the ['exercise-library', …] query — each test mutates
// this holder before render() to drive the populated grid. `enabled` is ignored
// (the screen's own filter state still gates the visible branch). `mock`-prefix
// satisfies babel-plugin-jest-hoist.
type LibraryState = { data: any; isLoading: boolean; isFetching: boolean };
const mockLibrary: LibraryState = { data: undefined, isLoading: false, isFetching: false };
const mockRefetch = jest.fn();
jest.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    data: mockLibrary.data,
    isLoading: mockLibrary.isLoading,
    isFetching: mockLibrary.isFetching,
    refetch: mockRefetch,
  }),
}));

// The library search call — statically imported by the screen. useQuery is
// mocked above so this is never actually invoked; the stub only satisfies the
// import graph (and keeps the real axios client out of the render).
jest.mock('@/api/exercises', () => ({ searchLibrary: jest.fn() }));

// SafeBlurView → passthrough View so the REAL GlassCard (kept real) mounts its
// frosted fill + children without expo-blur's native module.
jest.mock('@/components/SafeBlurView', () => {
  const RN = require('react-native');
  return { SafeBlurView: ({ children, ...rest }: any) => <RN.View {...rest}>{children}</RN.View> };
});

// expo-image ships a native loader; passthrough View so the card art mounts.
jest.mock('expo-image', () => {
  const RN = require('react-native');
  return { Image: (props: any) => <RN.View {...props} /> };
});

// expo-linear-gradient ships a native module; passthrough so the card scrim +
// category-tile fills mount on the jest renderer.
jest.mock('expo-linear-gradient', () => {
  const RN = require('react-native');
  return { LinearGradient: (props: any) => <RN.View {...props} /> };
});

// Decorative glyphs → plain <Text> surfacing the icon name (mirrors the suite).
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

// expo-status-bar renders nothing in the tree under test.
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

// _layout stub: the screen only needs the TAB_BAR_H constant from it. Mocking it
// keeps the real tab navigator (expo-router <Tabs>, reanimated, auth store) out
// of the render.
jest.mock('../../app/(tabs)/_layout', () => ({ TAB_BAR_H: 72 }));

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
import ExerciseLibraryScreen from '../../app/(exercises)/index';

function renderScreen() {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      <ExerciseLibraryScreen />
    </ThemeContext.Provider>,
  );
}

// A small populated library — only the fields the grid card reads.
const EXERCISES = [
  { id: 'ex-1', name: 'Barbell Bench Press', bodyPart: 'Chest', equipment: 'barbell' },
  { id: 'ex-2', name: 'Pull Up', muscleGroup: 'Back', equipment: 'body weight' },
];

describe('ExerciseLibraryScreen — render-state coverage', () => {
  beforeEach(() => {
    mockLibrary.data = undefined;
    mockLibrary.isLoading = false;
    mockLibrary.isFetching = false;
    mockRefetch.mockClear();
    mockPush.mockClear();
    delete mockParams.category;
  });

  // ── (a) GRID branch — a card per exercise + the search row ─────────────────
  it('with a category active and a populated library, renders a GlassCard card per exercise and the search row, and a card tap pushes to /(exercises)/<id>', () => {
    // Seed an initial category so `showBrowse` is false on first render → the
    // two-column FlatList grid path is taken.
    mockParams.category = 'gym';
    mockLibrary.data = EXERCISES;

    renderScreen();

    // One card per mocked exercise (the FlatList renderItem identity).
    expect(screen.getByText('Barbell Bench Press')).toBeTruthy();
    expect(screen.getByText('Pull Up')).toBeTruthy();

    // The search row renders alongside the grid: the search field placeholder
    // and the "Muscles" control are both present.
    expect(screen.getByPlaceholderText('Search exercises...')).toBeTruthy();
    expect(screen.getByLabelText('Muscles')).toBeTruthy();

    // The header reflects the populated result count (not the browse copy).
    expect(screen.getByText('2 exercises found')).toBeTruthy();

    // Tapping a card navigates to its detail route — the GlassCard wrap left the
    // TouchableOpacity press handler intact.
    fireEvent.press(screen.getByText('Barbell Bench Press'));
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith('/(exercises)/ex-1');
  });

  // ── (b) BROWSE branch — category cards render + drive a category filter ────
  it('with no filter active, renders the category cards and tapping one drives a category filter', () => {
    // No category param and no library data → `showBrowse` is true → the browse
    // ScrollView with the category cards renders.
    renderScreen();

    // The browse header copy and the category catalog tiles render.
    expect(screen.getByText('Browse by category')).toBeTruthy();
    expect(screen.getByText('Gym')).toBeTruthy();
    expect(screen.getByText('Home')).toBeTruthy();
    expect(screen.getByText('Cardio')).toBeTruthy();
    expect(screen.getByText('Recovery')).toBeTruthy();

    // A muscle chip labelled "Chest" renders. The Zeitra redesign surfaces the
    // muscle filter in TWO places (the top snapping chip carousel AND the
    // "Browse by Muscle" grid), so assert at least one rather than exactly one.
    expect(screen.getAllByText('Chest').length).toBeGreaterThan(0);

    // Tapping the Gym category drives the screen into a category filter: the
    // clear/back "GYM EXERCISES" affordance appears (state branch unchanged).
    fireEvent.press(screen.getByLabelText('Gym exercises'));
    expect(screen.getByText('GYM EXERCISES')).toBeTruthy();
    // …and the browse copy is gone now that a filter is active.
    expect(screen.queryByText('Browse by category')).toBeNull();
  });
});
