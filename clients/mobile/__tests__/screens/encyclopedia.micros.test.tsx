/**
 * encyclopedia.micros.test.tsx
 *
 * Coverage for the NUTRIENTS additions to the food-detail serving modal in
 * app/(meals)/encyclopedia.tsx — pressing a food row opens the slide-up sheet,
 * which now renders, alongside the existing macro "Nutrition Summary":
 *
 *   - a "Micronutrients" sub-section listing each PRESENT (non-null, finite)
 *     micro as a labeled "<Label> <value> <unit>" row, with the unit derived
 *     from the field name (Mg→mg, Mcg→mcg) — and SKIPPING the null ones.
 *   - the food image (imageUrl) + the CC-BY-SA imageAttribution credit, shown
 *     only when present.
 *   - NOTHING extra for a legacy food that carries no micros (no Micronutrients
 *     section).
 *
 * Mock conventions mirror encyclopedia.test.tsx (the sibling suite): expo-router
 * spies; react-query useQuery branches on queryKey[0] off a mutable holder;
 * @/api/meals stubbed; @/components/ui kept REAL except GlassCard (→ testID
 * passthrough); native leaves stubbed.
 *
 * Additive: NEW test file only.
 */

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack, replace: jest.fn() }),
}));

type QState = { data: any; isLoading: boolean; isError: boolean };
const mockSearch: QState = { data: undefined, isLoading: false, isError: false };
const mockMutate = jest.fn();
const mockInvalidateQueries = jest.fn();
const mockQueryClient = { invalidateQueries: mockInvalidateQueries };
jest.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    if (queryKey[0] === 'food-search') {
      return {
        data: mockSearch.data,
        isLoading: mockSearch.isLoading,
        isError: mockSearch.isError,
        refetch: jest.fn(),
      };
    }
    return { data: undefined, isLoading: false, isError: false, refetch: jest.fn() };
  },
  useMutation: ({ mutationFn }: { mutationFn: (p?: unknown) => unknown }) => ({ mutate: mockMutate, isPending: false }),
  useQueryClient: () => mockQueryClient,
}));

const mockLogMeal = jest.fn((_p?: unknown) => Promise.resolve({ id: 'log-1' }));
jest.mock('@/api/meals', () => ({
  logMeal: (...args: any[]) => mockLogMeal(...args),
  searchFoods: jest.fn(),
}));

// Keep the ui barrel REAL except GlassCard → a testID-bearing passthrough so the
// micros section can be grabbed without mounting SafeBlurView/expo-blur.
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

jest.mock('expo-linear-gradient', () => {
  const RN = require('react-native');
  return { LinearGradient: (props: any) => <RN.View {...props} /> };
});

jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

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

// One food WITH a mix of present + null micros (and an image + attribution), and
// one legacy food with NO micros at all.
const FOODS = [
  {
    id: 'rich',
    name: 'Spinach',
    foodGroup: 'vegetable',
    calories: 23,
    protein: 3,
    carbs: 4,
    fat: 0,
    fiber: 2.2,
    sugar: 0.4,
    servingSize: '100g',
    imageUrl: 'https://img/spinach.jpg',
    imageAttribution: 'Photo by Jane Doe / Wikimedia, CC BY-SA 4.0',
    ironMg: 2.7,
    magnesiumMg: 79,
    vitaminCMg: 28.1,
    folateMcg: 194,
    // Explicit nulls — must be SKIPPED in the rendered list.
    calciumMg: null,
    potassiumMg: null,
    zincMg: null,
    vitaminB6Mg: null,
    vitaminB12Mcg: null,
    vitaminDMcg: null,
  },
  {
    id: 'legacy',
    name: 'Mystery Snack',
    foodGroup: 'snack',
    calories: 200,
    protein: 2,
    carbs: 25,
    fat: 10,
    servingSize: '1 bar',
    // no image, no attribution, no micros — a legacy FooDB row.
  },
];

describe('FoodEncyclopediaScreen — food-detail micronutrients', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockBack.mockClear();
    mockMutate.mockClear();
    mockLogMeal.mockClear();
    mockInvalidateQueries.mockClear();
    mockSearch.data = undefined;
    mockSearch.isLoading = false;
    mockSearch.isError = false;
  });

  test('a food WITH micros shows the Micronutrients section, the present rows, and SKIPS nulls', () => {
    mockSearch.data = FOODS;
    renderScreen();

    fireEvent.changeText(screen.getByPlaceholderText('Search food encyclopedia...'), 'spin');
    fireEvent.press(screen.getByLabelText('Spinach'));

    // The modal opened with the macro summary…
    expect(screen.getByText('Add to Plate')).toBeTruthy();
    expect(screen.getByText('NUTRITION FOR THIS SERVING')).toBeTruthy();

    // …and the new Micronutrients sub-section with each PRESENT micro, labeled
    // with the unit derived from the field name (Mg→mg, Mcg→mcg).
    expect(screen.getByTestId('micronutrients-card')).toBeTruthy();
    expect(screen.getByText('Micronutrients')).toBeTruthy();
    expect(screen.getByText('Iron')).toBeTruthy();
    expect(screen.getByText('2.7 mg')).toBeTruthy();
    expect(screen.getByText('Magnesium')).toBeTruthy();
    expect(screen.getByText('79 mg')).toBeTruthy();
    expect(screen.getByText('Vitamin C')).toBeTruthy();
    // 28.1 ≥ 10 → rounded whole by formatMicroValue → "28 mg".
    expect(screen.getByText('28 mg')).toBeTruthy();
    expect(screen.getByText('Folate')).toBeTruthy();
    expect(screen.getByText('194 mcg')).toBeTruthy();

    // The NULL micros are skipped — their labels never render.
    expect(screen.queryByText('Calcium')).toBeNull();
    expect(screen.queryByText('Potassium')).toBeNull();
    expect(screen.queryByText('Zinc')).toBeNull();
    expect(screen.queryByText('Vitamin B6')).toBeNull();
    expect(screen.queryByText('Vitamin B12')).toBeNull();
    expect(screen.queryByText('Vitamin D')).toBeNull();
  });

  test('the image attribution credit (CC-BY-SA) renders when an image is present', () => {
    mockSearch.data = FOODS;
    renderScreen();

    fireEvent.changeText(screen.getByPlaceholderText('Search food encyclopedia...'), 'spin');
    fireEvent.press(screen.getByLabelText('Spinach'));

    // The license requires showing the credit wherever the image renders.
    expect(screen.getByText('Photo by Jane Doe / Wikimedia, CC BY-SA 4.0')).toBeTruthy();
  });

  test('secondary macros (fiber + sugar) render when present', () => {
    mockSearch.data = FOODS;
    renderScreen();

    fireEvent.changeText(screen.getByPlaceholderText('Search food encyclopedia...'), 'spin');
    fireEvent.press(screen.getByLabelText('Spinach'));

    expect(screen.getByText('Fiber')).toBeTruthy();
    expect(screen.getByText('Sugar')).toBeTruthy();
  });

  test('a LEGACY food with no micros renders NO Micronutrients section', () => {
    mockSearch.data = FOODS;
    renderScreen();

    fireEvent.changeText(screen.getByPlaceholderText('Search food encyclopedia...'), 'myst');
    fireEvent.press(screen.getByLabelText('Mystery Snack'));

    // The modal opened (macro summary present) but there is NO micros section.
    expect(screen.getByText('Add to Plate')).toBeTruthy();
    expect(screen.getByText('NUTRITION FOR THIS SERVING')).toBeTruthy();
    expect(screen.queryByTestId('micronutrients-card')).toBeNull();
    expect(screen.queryByText('Micronutrients')).toBeNull();
    // No fiber/sugar either.
    expect(screen.queryByText('Fiber')).toBeNull();
    expect(screen.queryByText('Sugar')).toBeNull();
  });
});
