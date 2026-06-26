/**
 * barcode-scanner.micros.test.tsx
 *
 * Coverage for the MICRONUTRIENT additions to the barcode scan-result card in
 * app/(modals)/barcode-scanner.tsx. The scanner resolves a product via the
 * /food-search gateway (whose `parseProduct` returns the FULL nutrition panel:
 * macros + a micro panel of minerals/vitamins/cholesterol). The mobile screen
 * previously kept only name + the 4 headline macros and DROPPED the micros; it
 * now widens its FoodResult to carry them and renders, under the macros:
 *
 *   - a "Micronutrients" GlassCard panel listing each PRESENT (non-null, finite)
 *     micro as a value + unit (mg / µg), in the canonical BARCODE_MICROS order,
 *     using the EXACT field names the backend emits (`iron` / `sodium` /
 *     `vitaminB12` / `phosphorus` / `vitaminA` / `cholesterol` …) — NOT the
 *     library `…Mg`/`…Mcg` vocabulary.
 *   - NOTHING extra when the product reports no micros (the common Open Food
 *     Facts case) — no panel, no empty card.
 *
 * Persistence note (asserted indirectly): the backend log-meal endpoint's body
 * schema only accepts macro fields, so micros are SCAN-RESULT-ONLY for now. The
 * `addToMeal` deep-link therefore still forwards only name + the 4 macros — this
 * suite pins that the micro values are NOT smuggled into the navigation params
 * (so we don't fabricate a persistence path the backend would strip).
 *
 * Mock conventions mirror the sibling screen suites (encyclopedia.micros /
 * log-meal.numericGuard): expo-router exposes hoisted navigate/back spies;
 * @/api/client is mocked so the real axios client never loads (its `get` is the
 * seam that returns the product); @/components/ui is kept REAL except GlassCard
 * (→ a testID passthrough so the panel can be grabbed without expo-blur); native
 * leaves (expo-camera / vector-icons / safe-area / status-bar) are stubbed. The
 * mocked CameraView renders a pressable that fires its `onBarcodeScanned` prop so
 * a scan can be triggered deterministically.
 */

const mockNavigate = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ navigate: mockNavigate, back: mockBack, push: jest.fn() }),
}));

// The /food-search gateway seam. apiClient.get resolves `{ food }`; each test
// sets the product (with whatever micro subset it wants) on this holder.
const mockApiGet = jest.fn();
jest.mock('@/api/client', () => ({
  apiClient: { get: (...args: any[]) => mockApiGet(...args) },
}));

// expo-camera: render past the permission gate (granted) and expose a pressable
// that invokes the screen's onBarcodeScanned so a scan is triggerable. The
// permissions hook returns [perm, request] like the real one.
jest.mock('expo-camera', () => {
  const RN = require('react-native');
  return {
    useCameraPermissions: () => [{ granted: true, canAskAgain: true }, jest.fn()],
    CameraView: ({ onBarcodeScanned }: any) => (
      <RN.Pressable
        accessibilityLabel="trigger-scan"
        onPress={() => onBarcodeScanned && onBarcodeScanned({ type: 'ean13', data: '0123456789012' })}
      />
    ),
  };
});

// Keep the ui barrel REAL except GlassCard → a testID-bearing passthrough so the
// micros panel can be grabbed without mounting SafeBlurView/expo-blur.
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

// CtaButton is reached via its own module path in the screen (not the barrel);
// stub it to a simple pressable that surfaces its label + fires onPress.
jest.mock('@/components/ui/CtaButton', () => {
  const RN = require('react-native');
  return {
    CtaButton: ({ label, onPress, accessibilityLabel }: any) => (
      <RN.Pressable accessibilityLabel={accessibilityLabel ?? label} onPress={onPress}>
        <RN.Text>{label}</RN.Text>
      </RN.Pressable>
    ),
  };
});

jest.mock('@/components/ui/PressableScale', () => {
  const RN = require('react-native');
  return { PressableScale: ({ children, ...props }: any) => <RN.Pressable {...props}>{children}</RN.Pressable> };
});

jest.mock('@expo/vector-icons', () => {
  const { Text: RNText } = require('react-native');
  return { Ionicons: ({ name }: { name?: string }) => <RNText>{`icon:${name ?? ''}`}</RNText> };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));

jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

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
import BarcodeScannerModal from '../../app/(modals)/barcode-scanner';

function renderScreen() {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      <BarcodeScannerModal />
    </ThemeContext.Provider>,
  );
}

// A product WITH a mix of present + null micros, matching the EXACT field names
// the /food-search gateway emits (parseProduct → FoodNutrition).
const PRODUCT_WITH_MICROS = {
  name: 'Greek Yogurt',
  calories: 97,
  protein: 9,
  carbs: 3.6,
  fat: 5,
  fiber: 0,
  sugar: 3.2,
  saturatedFat: 3.1,
  // Minerals (mg)
  sodium: 36,
  calcium: 110,
  iron: 0.4,
  potassium: 141,
  // null / absent ones — must be SKIPPED.
  magnesium: null,
  phosphorus: undefined,
  zinc: null,
  // Vitamins + cholesterol
  vitaminB12: 0.75, // µg
  vitaminA: 27,     // µg
  cholesterol: 13,  // mg
  vitaminC: null,
  vitaminD: null,
  vitaminB6: null,
  folate: null,
};

// A legacy/barcode product Open Food Facts reports with NO micro data at all.
const PRODUCT_NO_MICROS = {
  name: 'Plain Crackers',
  calories: 420,
  protein: 8,
  carbs: 70,
  fat: 12,
};

describe('BarcodeScannerModal — scan-result micronutrients', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockBack.mockClear();
    mockApiGet.mockReset();
  });

  test('a product WITH micros shows the Micronutrients panel, the present rows + units, and SKIPS nulls', async () => {
    mockApiGet.mockResolvedValue({ data: { food: PRODUCT_WITH_MICROS } });
    renderScreen();

    // Trigger a scan via the mocked CameraView pressable → lookup → result card.
    fireEvent.press(screen.getByLabelText('trigger-scan'));

    // The result card resolved with the product name + headline macros…
    expect(await screen.findByText('Greek Yogurt')).toBeTruthy();
    expect(screen.getByText('FOUND IN DATABASE')).toBeTruthy();

    // …and the new Micronutrients panel with each PRESENT micro, value + unit.
    expect(screen.getByTestId('micronutrients-card')).toBeTruthy();
    expect(screen.getByText('Micronutrients')).toBeTruthy();
    expect(screen.getByText('Per 100g')).toBeTruthy();

    // Minerals (mg) — present ones render; the < 10 values keep one decimal,
    // the ≥ 10 values round whole (formatMicroValue).
    expect(screen.getByText('Sodium')).toBeTruthy();
    expect(screen.getByText('36')).toBeTruthy();
    expect(screen.getByText('Calcium')).toBeTruthy();
    expect(screen.getByText('110')).toBeTruthy();
    expect(screen.getByText('Iron')).toBeTruthy();
    expect(screen.getByText('0.4')).toBeTruthy();
    expect(screen.getByText('Potassium')).toBeTruthy();
    expect(screen.getByText('141')).toBeTruthy();

    // Vitamins + cholesterol present.
    expect(screen.getByText('Vitamin B12')).toBeTruthy();
    expect(screen.getByText('0.8')).toBeTruthy(); // 0.75 → one decimal → "0.8"
    expect(screen.getByText('Vitamin A')).toBeTruthy();
    expect(screen.getByText('Cholesterol')).toBeTruthy();
    expect(screen.getByText('13')).toBeTruthy();

    // Units appear (mg for minerals/B12-is-µg etc.) — at least one mg and one µg.
    expect(screen.getAllByText('mg').length).toBeGreaterThan(0);
    expect(screen.getAllByText('µg').length).toBeGreaterThan(0);

    // The null / absent micros are skipped — their labels never render.
    expect(screen.queryByText('Magnesium')).toBeNull();
    expect(screen.queryByText('Phosphorus')).toBeNull();
    expect(screen.queryByText('Zinc')).toBeNull();
    expect(screen.queryByText('Vitamin C')).toBeNull();
    expect(screen.queryByText('Vitamin D')).toBeNull();
    expect(screen.queryByText('Vitamin B6')).toBeNull();
    expect(screen.queryByText('Folate')).toBeNull();
  });

  test('a product with NO micros renders the result card but NO Micronutrients panel', async () => {
    mockApiGet.mockResolvedValue({ data: { food: PRODUCT_NO_MICROS } });
    renderScreen();

    fireEvent.press(screen.getByLabelText('trigger-scan'));

    // Result card present (name + macros) but no micros panel at all.
    expect(await screen.findByText('Plain Crackers')).toBeTruthy();
    expect(screen.queryByTestId('micronutrients-card')).toBeNull();
    expect(screen.queryByText('Micronutrients')).toBeNull();
  });

  test('Add to Meal forwards only name + the 4 macros (micros are scan-result-only, never smuggled into nav params)', async () => {
    mockApiGet.mockResolvedValue({ data: { food: PRODUCT_WITH_MICROS } });
    renderScreen();

    fireEvent.press(screen.getByLabelText('trigger-scan'));
    expect(await screen.findByText('Greek Yogurt')).toBeTruthy();

    // Press the (stubbed) CtaButton "Add to Meal".
    fireEvent.press(screen.getByLabelText('Add Greek Yogurt to meal'));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledTimes(1));
    const arg = mockNavigate.mock.calls[0]![0] as { pathname: string; params: Record<string, string> };
    expect(arg.pathname).toBe('/(meals)/log-meal');

    // Exactly the macro params — and NO micro key (the backend log schema would
    // strip them, so the client must not fabricate a persistence path).
    expect(arg.params.barcodeName).toBe('Greek Yogurt');
    expect(arg.params.barcodeCalories).toBe('97');
    expect(arg.params).toHaveProperty('barcodeProtein');
    expect(arg.params).toHaveProperty('barcodeCarbs');
    expect(arg.params).toHaveProperty('barcodeFat');
    const paramKeys = Object.keys(arg.params);
    for (const micro of ['sodium', 'calcium', 'iron', 'vitaminB12', 'cholesterol', 'Sodium', 'Iron']) {
      expect(paramKeys.some((k) => k.toLowerCase().includes(micro.toLowerCase()))).toBe(false);
    }
  });
});
