/**
 * meal-log-detail.test.tsx
 *
 * Coverage for the LOGGED-MEAL DETAIL screen (app/(meals)/meal-log/[id].tsx).
 *
 * The Nutrition hub's "Today's Meals" rows are now tappable and navigate here
 * with the full MealLog serialized as a `log` JSON param (there is no per-id
 * meal-log endpoint — getMealLogs returns a whole day). The screen decodes that
 * param and renders:
 *
 *   - a header card: meal-type title + total calories + the macro split rings;
 *   - one row per foodItem (name, quantity, per-item calories + P/C/F macros);
 *   - a Micronutrients section that AGGREGATES the optional micros now persisted
 *     on each foodItem (FoodItemMicros: fiber/sugar/saturatedFat/transFat [g],
 *     minerals + vitaminC/vitaminB6/cholesterol [mg], vitaminA/D/B12/folate [µg]),
 *     SUMMING each present micro across items and showing ONLY the present ones —
 *     and which is OMITTED ENTIRELY when no item carries any micro.
 *
 * This suite pins:
 *   1. a meal WITH micros → its items render AND the aggregated micro section
 *      shows the SUMMED present values (and skips micros absent across all items);
 *   2. a macro-only meal → items render but NO micronutrient section at all;
 *   3. a missing/garbled `log` param → the honest "couldn't open" state (no crash).
 *
 * Mock conventions mirror the sibling barcode-scanner.micros suite: expo-router
 * exposes a mutable `mockParams` holder + back spy; @/components/ui is kept REAL
 * except GlassCard (→ a testID passthrough so panels can be grabbed without
 * expo-blur); PressableScale → a plain Pressable; MacroRings → a label-surfacing
 * stub (it pulls `colors` from the theme module directly, not context); native
 * leaves (vector-icons / safe-area / status-bar / linear-gradient) are stubbed.
 */

const mockBack = jest.fn();
const mockPush = jest.fn();
// Mutable param holder — each test sets the route params before render.
const mockParams: { current: Record<string, unknown> } = { current: {} };
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: mockPush, navigate: jest.fn() }),
  useLocalSearchParams: () => mockParams.current,
}));

// Keep the ui barrel REAL except GlassCard → a testID-bearing passthrough so the
// micros / items panels can be grabbed without mounting SafeBlurView/expo-blur.
jest.mock('@/components/ui', () => {
  const actual = jest.requireActual('@/components/ui');
  const RN = require('react-native');
  return {
    ...actual,
    GlassCard: ({ children, ...props }: any) => (
      <RN.View {...props}>{children}</RN.View>
    ),
  };
});

jest.mock('@/components/ui/PressableScale', () => {
  const RN = require('react-native');
  return { PressableScale: ({ children, ...props }: any) => <RN.Pressable {...props}>{children}</RN.Pressable> };
});

// MacroRings reads the theme `colors` from the module (not context) + renders
// SVG; stub it to a leaf that surfaces each ring's label so the macro split is
// assertable without react-native-svg.
jest.mock('@/components/nutrition/MacroRings', () => {
  const RN = require('react-native');
  return {
    MacroRings: ({ protein, carbs, fat }: any) => (
      <RN.View testID="macro-rings">
        <RN.Text>{protein?.label}</RN.Text>
        <RN.Text>{carbs?.label}</RN.Text>
        <RN.Text>{fat?.label}</RN.Text>
      </RN.View>
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

jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

jest.mock('expo-linear-gradient', () => {
  const RN = require('react-native');
  return { LinearGradient: ({ children, ...props }: any) => <RN.View {...props}>{children}</RN.View> };
});

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import {
  ThemeContext,
  getThemeColors,
  typography,
  spacing,
  borderRadius,
  shadows,
} from '@/theme';
import MealLogDetailScreen from '../../app/(meals)/meal-log/[id]';

function renderScreen() {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      <MealLogDetailScreen />
    </ThemeContext.Provider>,
  );
}

// A logged meal whose TWO items each carry a mix of micros. Iron appears on BOTH
// (0.4 + 1.6 = 2.0) so aggregation across items is exercised; sodium appears on
// one item only (120); calcium on the other only (90). magnesium/zinc/vitaminC
// etc. are absent across ALL items → must be omitted.
const MEAL_WITH_MICROS = {
  id: 'm1',
  userId: 'u1',
  mealType: 'BREAKFAST',
  totalCalories: 540,
  totalProtein: 32,
  totalCarbs: 48,
  totalFat: 18,
  loggedAt: '2026-06-25T08:30:00.000Z',
  foodItems: [
    {
      foodId: 'f1',
      name: 'Greek Yogurt',
      quantity: 1,
      calories: 150,
      protein: 15,
      carbs: 8,
      fat: 5,
      // micros on item 1
      iron: 0.4,
      sodium: 120,
      vitaminB12: 0.75, // µg
      fiber: 0,
    },
    {
      foodId: 'f2',
      name: 'Oats & Berries',
      quantity: 2,
      calories: 390,
      protein: 17,
      carbs: 40,
      fat: 13,
      // micros on item 2
      iron: 1.6,
      calcium: 90,
      fiber: 6, // g
    },
  ],
};

// A macro-only meal (e.g. a manually-added plate) — items present, but NO micros
// on any item → no micronutrient section at all.
const MEAL_NO_MICROS = {
  id: 'm2',
  userId: 'u1',
  mealType: 'LUNCH',
  totalCalories: 700,
  totalProtein: 50,
  totalCarbs: 60,
  totalFat: 22,
  loggedAt: '2026-06-25T12:15:00.000Z',
  // Item kcal (695) is intentionally distinct from the meal total (700) so the
  // per-item calorie assertion can't collide with the header hero numeral.
  foodItems: [
    { foodId: 'f3', name: 'Chicken & Rice', quantity: 1, calories: 695, protein: 50, carbs: 60, fat: 22 },
  ],
};

describe('MealLogDetailScreen', () => {
  beforeEach(() => {
    mockBack.mockClear();
    mockPush.mockClear();
    mockParams.current = {};
  });

  test('a meal WITH micros: header + food items + AGGREGATED micros (summed across items, absent ones omitted)', () => {
    mockParams.current = { id: 'm1', log: JSON.stringify(MEAL_WITH_MICROS) };
    renderScreen();

    // Header — meal-type title (no "Log" copy) + total calories + the macro rings.
    expect(screen.getAllByText('Breakfast').length).toBeGreaterThan(0);
    expect(screen.getByText('540')).toBeTruthy(); // total kcal hero
    expect(screen.getByTestId('macro-rings')).toBeTruthy();
    expect(screen.getByText('Protein')).toBeTruthy();
    expect(screen.getByText('Carbs')).toBeTruthy();
    expect(screen.getByText('Fat')).toBeTruthy();

    // Food items — each item's name + its per-item calories render.
    expect(screen.getByText('Greek Yogurt')).toBeTruthy();
    expect(screen.getByText('Oats & Berries')).toBeTruthy();
    expect(screen.getByText('150')).toBeTruthy();
    expect(screen.getByText('390')).toBeTruthy();
    // Two itemized rows rendered.
    expect(screen.getAllByTestId('meal-item-row').length).toBe(2);

    // Micronutrients section present, AGGREGATED across the two items.
    expect(screen.getByTestId('meal-micros-card')).toBeTruthy();
    expect(screen.getByText('Micronutrients')).toBeTruthy();

    // Iron summed across BOTH items: 0.4 + 1.6 = 2.0 → "2".
    expect(screen.getByText('Iron')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    // Sodium present on one item only (120).
    expect(screen.getByText('Sodium')).toBeTruthy();
    expect(screen.getByText('120')).toBeTruthy();
    // Calcium present on the other item only (90).
    expect(screen.getByText('Calcium')).toBeTruthy();
    expect(screen.getByText('90')).toBeTruthy();
    // Fiber (secondary macro, g) summed: 0 + 6 = 6.
    expect(screen.getByText('Fiber')).toBeTruthy();
    expect(screen.getByText('6')).toBeTruthy();
    // Vitamin B12 (µg) present on one item: 0.75 → one-decimal "0.8".
    expect(screen.getByText('Vitamin B12')).toBeTruthy();
    expect(screen.getByText('0.8')).toBeTruthy();
    // Units appear (g for fiber, mg for minerals, µg for B12).
    expect(screen.getAllByText('mg').length).toBeGreaterThan(0);
    expect(screen.getAllByText('µg').length).toBeGreaterThan(0);

    // Micros absent across ALL items are omitted entirely.
    expect(screen.queryByText('Magnesium')).toBeNull();
    expect(screen.queryByText('Zinc')).toBeNull();
    expect(screen.queryByText('Vitamin C')).toBeNull();
    expect(screen.queryByText('Potassium')).toBeNull();
    expect(screen.queryByText('Phosphorus')).toBeNull();
  });

  test('a macro-only meal: food items render but NO micronutrient section', () => {
    mockParams.current = { id: 'm2', log: JSON.stringify(MEAL_NO_MICROS) };
    renderScreen();

    // Items render — the header hero shows the meal total (700), the row shows
    // the item's own kcal (695); both distinct numerals present.
    expect(screen.getByText('Chicken & Rice')).toBeTruthy();
    expect(screen.getByText('700')).toBeTruthy(); // total kcal hero
    expect(screen.getByText('695')).toBeTruthy(); // item kcal
    expect(screen.getAllByTestId('meal-item-row').length).toBe(1);

    // No micronutrient section at all.
    expect(screen.queryByTestId('meal-micros-card')).toBeNull();
    expect(screen.queryByText('Micronutrients')).toBeNull();
  });

  test('a missing/garbled log param renders the honest "couldn\'t open" state (no crash)', () => {
    // No `log` param at all.
    mockParams.current = { id: 'm3' };
    renderScreen();

    expect(screen.getByText("Couldn't open this meal")).toBeTruthy();
    // No header card / items / micros leak through on the failure path.
    expect(screen.queryByTestId('macro-rings')).toBeNull();
    expect(screen.queryByTestId('meal-item-row')).toBeNull();
    expect(screen.queryByTestId('meal-micros-card')).toBeNull();

    // Its "Go Back" action returns.
    fireEvent.press(screen.getByText('Go Back'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});
