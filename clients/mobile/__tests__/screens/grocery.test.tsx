/**
 * grocery.test.tsx
 *
 * Render + behaviour lock on `app/(meals)/grocery.tsx` — the weekly grocery list
 * (a backend `getGroceryList` plan section + a local AsyncStorage-backed custom
 * list, with an Add-Item slide-up Modal). Pins the load-bearing behaviours the
 * Aurora GlassCard-coverage change touched, plus the surrounding query / storage
 * / state contract it must NOT have regressed:
 *
 *   - LOADING: while the ['grocery-list'] query is loading, the screen renders
 *     its Skeleton placeholders (and none of the list chrome).
 *   - EMPTY: with the query resolved to an empty list AND no stored custom items,
 *     the screen renders the EmptyState ("List is empty") with its "Add Item" CTA.
 *   - LOADED: with backend plan items resolved, the summary bar — now wrapped in a
 *     <GlassCard> (asserted via a testID-bearing GlassCard stub), the coverage
 *     gain for this screen — renders the item count, and every plan item renders
 *     by its name in a plain item row.
 *   - ADD MODAL: pressing the FAB ("Add") opens the slide-up Modal whose sheet is
 *     a <GlassCard> wrapping the "Add Grocery Item" header + inputs + category
 *     chips + the "ADD TO LIST" CtaButton (a11y "Add to list").
 *   - ITEM TOGGLE: a stored custom item renders as a check-off row; pressing it
 *     reaches toggleCustomItem, which persists the toggled list via
 *     AsyncStorage.setItem (the handler is unchanged — we assert it's reachable).
 *
 * Mock conventions mirror the sibling screen suites (recipes / nutrition.error
 * States / exercise-detail / log-planned-meal):
 *   - `@tanstack/react-query` useQuery is stubbed and branches on queryKey[0]:
 *     ['grocery-list'] reads a mutable holder so a test that mutates it before
 *     render() sees its branch.
 *   - `@/api/meals` is mocked (getGroceryList spy) so the real axios client never
 *     loads; useQuery is mocked so the queryFn is never invoked — it only
 *     satisfies the import graph.
 *   - `@react-native-async-storage/async-storage` is mocked so the on-mount
 *     `loadItems()` resolves deterministically and `saveItems()` is observable.
 *   - `expo-router` exposes a hoisted `mockBack` so the header back control is a
 *     benign no-op.
 *   - The `@/components/ui` barrel is kept REAL (assertions ride the genuine
 *     CtaButton / EmptyState) EXCEPT `Skeleton` (→ a testID-bearing View so the
 *     loading state is assertable — the real one is an unlabelled Animated.View)
 *     and `GlassCard` (→ a testID-bearing passthrough so the test can prove the
 *     summary bar + modal sheet are wrapped in GlassCard without asserting on
 *     blur internals).
 *   - decorative glyphs, expo-linear-gradient, safe-area insets and the status
 *     bar are stubbed the same way as the rest of the screen suites.
 */

// ── jest.mock hoisting block (runs ABOVE the imports) ────────────────────────

// expo-router: hoisted `mock`-prefixed spy for the header back control (a benign
// no-op in these cases).
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: mockBack, replace: jest.fn() }),
}));

// Controlled state for the single grocery-list query. Each test drives a branch
// by mutating the holder before render(). (All `mock`-prefixed so
// babel-plugin-jest-hoist permits the factory to close over it.)
type QState = { data: any; isLoading: boolean; isError: boolean; error?: any };
const mockGrocery: QState = { data: undefined, isLoading: false, isError: false, error: undefined };
const mockRefetch = jest.fn();

jest.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    if (queryKey[0] === 'grocery-list') {
      return {
        data: mockGrocery.data,
        isLoading: mockGrocery.isLoading,
        isError: mockGrocery.isError,
        error: mockGrocery.error,
        refetch: mockRefetch,
      };
    }
    return { data: undefined, isLoading: false, isError: false, refetch: jest.fn() };
  },
}));

// api/meals — the queryFn is never invoked (useQuery is mocked above); this spy
// only satisfies the screen's static import so the real axios client never loads.
jest.mock('@/api/meals', () => ({
  getGroceryList: jest.fn(),
}));

// AsyncStorage — the on-mount loadItems() reads from getItem; saveItems() writes
// via setItem. A mutable `mockStored` holder lets a test seed the stored custom
// list; setItem is a spy so the toggle/persist path is observable.
const mockStored: { value: string | null } = { value: null };
const mockSetItem = jest.fn((_key: string, _value: string) => Promise.resolve());
// The setItem wrapper defers the `mockSetItem` lookup to call-time: babel-jest
// hoists this jest.mock factory ABOVE the `const mockSetItem` initializer, so a
// direct `setItem: mockSetItem` would capture it while still `undefined`. The
// arrow re-reads the (by then initialized) spy on each call and forwards the
// concrete (key, value) args — no `any[]` spread, so strict mode is satisfied.
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(mockStored.value)),
  setItem: (key: string, value: string) => mockSetItem(key, value),
}));

// ── ui barrel: keep everything real EXCEPT Skeleton + GlassCard ──────────────
// Skeleton → a testID-bearing View so the loading branch is assertable (the real
// Skeleton is an unlabelled Animated.View). GlassCard → a testID-bearing
// passthrough so the loaded/modal tests can prove the summary bar + modal sheet
// are wrapped in GlassCard (without mounting SafeBlurView/expo-blur internals).
// Everything else — notably the real CtaButton + EmptyState — stays genuine so
// assertions ride the production components.
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

// expo-linear-gradient ships a native module — passthrough View so the FAB's
// coral gradient mounts.
jest.mock('expo-linear-gradient', () => {
  const RN = require('react-native');
  return { LinearGradient: (props: any) => <RN.View {...props} /> };
});

// expo-status-bar renders nothing in the tree under test.
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

// ── Imports (run AFTER the hoisted mocks above) ──────────────────────────────
import React from 'react';
import { render, fireEvent, screen, waitFor } from '@testing-library/react-native';
import {
  ThemeContext,
  getThemeColors,
  typography,
  spacing,
  borderRadius,
  shadows,
} from '@/theme';
import GroceryListScreen from '../../app/(meals)/grocery';

function renderScreen() {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      <GroceryListScreen />
    </ThemeContext.Provider>,
  );
}

// Backend plan items for the LOADED case. The screen reads `data.list`, each
// entry rendering by its `name`.
const PLAN_RESPONSE = {
  list: [
    { name: 'Chicken Breast', amount: '500', unit: 'g' },
    { name: 'Brown Rice', amount: '1', unit: 'kg' },
  ],
};

// One stored custom item for the toggle case (the AsyncStorage payload shape
// loadItems() parses).
const STORED_ITEMS = [
  {
    id: 'custom-1',
    name: 'Almond Milk',
    quantity: '2',
    category: 'Dairy & Eggs',
    checked: false,
    addedAt: '2026-01-01T00:00:00.000Z',
  },
];

describe('GroceryListScreen — weekly grocery list', () => {
  beforeEach(() => {
    mockBack.mockClear();
    mockRefetch.mockClear();
    mockSetItem.mockClear();
    mockGrocery.data = undefined;
    mockGrocery.isLoading = false;
    mockGrocery.isError = false;
    mockGrocery.error = undefined;
    mockStored.value = null;
  });

  // ── LOADING: query loading → Skeleton placeholders, no list chrome ─────────
  test('LOADING: renders Skeleton placeholders while the grocery list loads', () => {
    mockGrocery.isLoading = true;

    renderScreen();

    // The loading branch renders a summary skeleton + per-section skeletons.
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThanOrEqual(1);
    // No summary GlassCard while loading.
    expect(screen.queryByTestId('glass-card')).toBeNull();
    // Header chrome still renders.
    expect(screen.getByText('Grocery List')).toBeTruthy();
  });

  // ── EMPTY: empty backend list + no stored items → EmptyState ───────────────
  test('EMPTY: renders the empty state when the list is empty and nothing is stored', async () => {
    mockGrocery.data = { list: [] };
    mockStored.value = null;

    renderScreen();

    // The on-mount loadItems() resolves (no stored items) — the empty branch
    // shows its title + the "Add Item" CTA.
    await waitFor(() => expect(screen.getByText('List is empty')).toBeTruthy());
    expect(screen.getByText('Add Item')).toBeTruthy();
    // No summary GlassCard in the empty state.
    expect(screen.queryByTestId('glass-card')).toBeNull();
  });

  // ── LOADED: backend plan items → summary GlassCard + item rows ─────────────
  test('LOADED: renders the summary GlassCard and a row for each plan item', async () => {
    mockGrocery.data = PLAN_RESPONSE;

    renderScreen();

    // The summary bar is wrapped in a GlassCard (the coverage gain).
    await waitFor(() => expect(screen.getAllByTestId('glass-card').length).toBeGreaterThanOrEqual(1));
    // Summary count = customItems (0) + planItems (2).
    expect(screen.getByText('2 items')).toBeTruthy();
    // Each plan item renders by name.
    expect(screen.getByText('Chicken Breast')).toBeTruthy();
    expect(screen.getByText('Brown Rice')).toBeTruthy();
    // Loading skeletons are gone in the loaded state.
    expect(screen.queryByTestId('skeleton')).toBeNull();
  });

  // ── ADD MODAL: FAB opens the slide-up sheet (GlassCard) with the CtaButton ─
  test('pressing the FAB opens the Add-Item GlassCard sheet with the "ADD TO LIST" CtaButton', async () => {
    mockGrocery.data = PLAN_RESPONSE;

    renderScreen();

    await waitFor(() => expect(screen.getByText('2 items')).toBeTruthy());

    // Press the FAB (accessibilityLabel "Add") → setShowAddModal(true).
    fireEvent.press(screen.getByLabelText('Add'));

    // The modal sheet renders the header + the "ADD TO LIST" CtaButton (a11y
    // label "Add to list"), and the sheet itself is a GlassCard.
    expect(screen.getByText('Add Grocery Item')).toBeTruthy();
    expect(screen.getByLabelText('Add to list')).toBeTruthy();
    // The modal sheet GlassCard is now mounted alongside the summary GlassCard
    // (≥2 glass surfaces once the modal is open).
    expect(screen.getAllByTestId('glass-card').length).toBeGreaterThanOrEqual(2);
  });

  // ── ITEM TOGGLE: a stored custom item toggles → toggleCustomItem persists ──
  test('toggling a stored custom item reaches toggleCustomItem and persists via AsyncStorage', async () => {
    mockGrocery.data = { list: [] };
    // Seed one stored custom item so loadItems() hydrates a check-off row.
    mockStored.value = JSON.stringify(STORED_ITEMS);

    renderScreen();

    // After the on-mount loadItems() resolves, the custom item row renders
    // (accessibilityLabel = item.name) inside its category section.
    const row = await screen.findByLabelText('Almond Milk');
    expect(row).toBeTruthy();
    // The summary GlassCard is present (1 stored item → "1 items").
    expect(screen.getByText('1 items')).toBeTruthy();

    // Toggle the item → toggleCustomItem → saveItems → AsyncStorage.setItem with
    // the toggled list (the handler is unchanged; we assert it's reachable).
    fireEvent.press(row);

    await waitFor(() => expect(mockSetItem).toHaveBeenCalled());
    const lastCall = mockSetItem.mock.calls[mockSetItem.mock.calls.length - 1] as any[];
    const persisted = JSON.parse(lastCall[1]);
    expect(persisted[0].id).toBe('custom-1');
    expect(persisted[0].checked).toBe(true);
  });
});
