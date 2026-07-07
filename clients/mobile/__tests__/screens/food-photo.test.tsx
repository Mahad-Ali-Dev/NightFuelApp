/**
 * food-photo.test.tsx
 *
 * Coverage for the POINT-AT-A-PLATE photo food-recognition screen in
 * app/(modals)/food-photo.tsx. The screen takes a photo via expo-camera's
 * CameraView (takePictureAsync), POSTs the base64 to the /food-vision gateway
 * (through the `recognizeFoodPhoto` seam in @/api/meals), and renders the SAME
 * result card the barcode scanner uses — name, a calorie hero, the 3 macro
 * cells, and a "Micronutrients" GlassCard panel of the PRESENT (finite) micros —
 * PLUS an honest "AI ESTIMATE · {confidence}%" badge and the model's portion
 * note (because the numbers are a photo estimate, not a label reading).
 *
 * What this suite pins:
 *   - a confident result renders the AI-estimate badge + confidence %, the
 *     dish name, the portion note, and the Micronutrients panel listing each
 *     PRESENT micro (value + unit), SKIPPING the null/absent ones.
 *   - "Add to Meal" threads the SAME deep-link params as the barcode scanner:
 *     name + the 4 headline macros, plus the present micros serialized as ONE
 *     `barcodeMicros` JSON param (so a photo estimate persists through the
 *     identical addToMeal → log-meal path).
 *   - a no_food response shows a recoverable Alert (no result card), and a
 *     low_confidence response likewise — the camera stays usable.
 *
 * Mock conventions mirror barcode-scanner.micros.test.tsx: expo-router exposes
 * hoisted navigate/back spies; @/api/meals is mocked so `recognizeFoodPhoto` is
 * the seam each test drives; @/components/ui is kept REAL except GlassCard (→ a
 * testID passthrough so the panel can be grabbed without expo-blur); CtaButton /
 * PressableScale / vector-icons / safe-area / status-bar are stubbed. The mocked
 * CameraView is a forwardRef exposing takePictureAsync() (resolving a fake
 * base64) so the shutter press → capture() runs deterministically. Alert.alert
 * is spied so the error paths can be asserted without a real dialog.
 */

const mockNavigate = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ navigate: mockNavigate, back: mockBack, push: jest.fn() }),
}));

// The /food-vision gateway seam. recognizeFoodPhoto resolves a VisionRecognizeResult;
// each test sets what it returns (a food, or an error token). The module also
// exports types/consts the screen imports, but only the function is called.
const mockRecognize = jest.fn();
jest.mock('@/api/meals', () => ({
  recognizeFoodPhoto: (...args: any[]) => mockRecognize(...args),
}));

// expo-camera: render past the permission gate (granted) and expose a CameraView
// that forwards a ref carrying takePictureAsync (→ a fake base64). The permissions
// hook returns [perm, request] like the real one.
const mockTakePicture = jest.fn();
jest.mock('expo-camera', () => {
  const RN = require('react-native');
  const React = require('react');
  return {
    useCameraPermissions: () => [{ granted: true, canAskAgain: true }, jest.fn()],
    CameraView: React.forwardRef((_props: any, ref: any) => {
      React.useImperativeHandle(ref, () => ({
        takePictureAsync: (...args: any[]) => mockTakePicture(...args),
      }));
      return null;
    }),
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
import { Alert } from 'react-native';
import { render, fireEvent, screen, waitFor } from '@testing-library/react-native';
import {
  ThemeContext,
  getThemeColors,
  typography,
  spacing,
  borderRadius,
  shadows,
} from '@/theme';
import FoodPhotoModal from '../../app/(modals)/food-photo';

function renderScreen() {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      <FoodPhotoModal />
    </ThemeContext.Provider>,
  );
}

// A confident vision result WITH a mix of present + absent micros, matching the
// EXACT field names the /food-vision gateway emits (mirrors /food-search's
// parseProduct → FoodNutrition).
const VISION_FOOD = {
  name: 'Grilled Chicken Salad',
  calories: 320,
  protein: 34,
  carbs: 12.4,
  fat: 14,
  fiber: 4,
  sugar: 5.1,
  saturatedFat: 3.2,
  // Minerals (mg)
  sodium: 480,
  calcium: 90,
  iron: 2.1,
  potassium: 620,
  // absent ones — must be SKIPPED.
  magnesium: undefined,
  phosphorus: undefined,
  zinc: undefined,
  // Vitamins + cholesterol
  vitaminC: 18,    // mg
  vitaminA: 210,   // µg
  cholesterol: 95, // mg
  vitaminD: undefined,
  vitaminB6: undefined,
  vitaminB12: undefined,
  folate: undefined,
};

// Trigger the shutter: find the capture PressableScale and press it. The mocked
// CameraView ref resolves takePictureAsync → a fake base64 frame.
async function fireCapture() {
  mockTakePicture.mockResolvedValue({ base64: 'ZmFrZS1qcGVn' }); // "fake-jpeg"
  fireEvent.press(screen.getByLabelText('Capture plate photo'));
}

describe('FoodPhotoModal — photo plate recognition', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockBack.mockClear();
    mockRecognize.mockReset();
    mockTakePicture.mockReset();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    (Alert.alert as jest.Mock).mockRestore?.();
  });

  test('a confident result shows the AI-estimate badge + confidence %, the dish, the portion note, and the Micronutrients panel (present rows only, nulls skipped)', async () => {
    mockRecognize.mockResolvedValue({
      food: VISION_FOOD,
      confidence: 0.82,
      portionNote: '~1 plate, 350g',
    });
    renderScreen();

    await fireCapture();

    // The result card resolved with the dish name + the honest AI-estimate badge.
    expect(await screen.findByText('Grilled Chicken Salad')).toBeTruthy();
    expect(screen.getByText('AI ESTIMATE · 82%')).toBeTruthy();
    // Portion note shown verbatim.
    expect(screen.getByText('~1 plate, 350g')).toBeTruthy();

    // The shared Micronutrients panel with each PRESENT micro, value + unit.
    expect(screen.getByTestId('micronutrients-card')).toBeTruthy();
    expect(screen.getByText('Micronutrients')).toBeTruthy();
    expect(screen.getByText('Per serving · estimated')).toBeTruthy();

    // Minerals (mg) present — the < 10 keep one decimal, ≥ 10 round whole.
    expect(screen.getByText('Sodium')).toBeTruthy();
    expect(screen.getByText('480')).toBeTruthy();
    expect(screen.getByText('Iron')).toBeTruthy();
    expect(screen.getByText('2.1')).toBeTruthy();
    expect(screen.getByText('Potassium')).toBeTruthy();
    expect(screen.getByText('620')).toBeTruthy();

    // Vitamins + cholesterol present.
    expect(screen.getByText('Vitamin C')).toBeTruthy();
    expect(screen.getByText('Vitamin A')).toBeTruthy();
    expect(screen.getByText('Cholesterol')).toBeTruthy();
    expect(screen.getByText('95')).toBeTruthy();

    // Units appear — at least one mg and one µg.
    expect(screen.getAllByText('mg').length).toBeGreaterThan(0);
    expect(screen.getAllByText('µg').length).toBeGreaterThan(0);

    // The absent micros are skipped — their labels never render.
    expect(screen.queryByText('Magnesium')).toBeNull();
    expect(screen.queryByText('Phosphorus')).toBeNull();
    expect(screen.queryByText('Zinc')).toBeNull();
    expect(screen.queryByText('Vitamin D')).toBeNull();
    expect(screen.queryByText('Vitamin B6')).toBeNull();
    expect(screen.queryByText('Vitamin B12')).toBeNull();
    expect(screen.queryByText('Folate')).toBeNull();
  });

  test('Add to Meal threads name + the 4 macros AND the present micros as a barcodeMicros JSON param (same path as the barcode scanner)', async () => {
    mockRecognize.mockResolvedValue({
      food: VISION_FOOD,
      confidence: 0.82,
      portionNote: '~1 plate, 350g',
    });
    renderScreen();

    await fireCapture();
    expect(await screen.findByText('Grilled Chicken Salad')).toBeTruthy();

    // Press the (stubbed) CtaButton "Add to Meal".
    fireEvent.press(screen.getByLabelText('Add Grilled Chicken Salad to meal'));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledTimes(1));
    const arg = mockNavigate.mock.calls[0]![0] as { pathname: string; params: Record<string, string> };
    expect(arg.pathname).toBe('/(meals)/log-meal');

    // The 4 headline macros, threaded exactly as the barcode scanner does.
    expect(arg.params.barcodeName).toBe('Grilled Chicken Salad');
    expect(arg.params.barcodeCalories).toBe('320');
    expect(arg.params.barcodeProtein).toBe('34');
    expect(arg.params.barcodeCarbs).toBe('12.4');
    expect(arg.params.barcodeFat).toBe('14');

    // The present micros are serialized into ONE barcodeMicros JSON param; the
    // absent ones are NOT included, and the JSON parses back to the present set.
    const microsJson = arg.params.barcodeMicros;
    expect(microsJson).toBeTruthy();
    const micros = JSON.parse(microsJson as string);
    expect(micros.sodium).toBe(480);
    expect(micros.iron).toBe(2.1);
    expect(micros.cholesterol).toBe(95);
    expect(micros.fiber).toBe(4);          // secondary macro forwarded too
    expect(micros).not.toHaveProperty('magnesium');
    expect(micros).not.toHaveProperty('zinc');
  });

  test('a no_food response shows a recoverable alert and NO result card', async () => {
    mockRecognize.mockResolvedValue({ food: null, error: 'no_food' });
    renderScreen();

    await fireCapture();

    await waitFor(() => expect(Alert.alert).toHaveBeenCalledTimes(1));
    expect((Alert.alert as jest.Mock).mock.calls[0][0]).toBe('No food found');
    // No result card / micros panel rendered.
    expect(screen.queryByTestId('micronutrients-card')).toBeNull();
    expect(screen.queryByText('Add to Meal')).toBeNull();
  });

  test('a low_confidence response shows a recoverable alert (camera stays usable)', async () => {
    mockRecognize.mockResolvedValue({ food: null, error: 'low_confidence', confidence: 0.12 });
    renderScreen();

    await fireCapture();

    await waitFor(() => expect(Alert.alert).toHaveBeenCalledTimes(1));
    expect((Alert.alert as jest.Mock).mock.calls[0][0]).toBe('Not quite sure');
    // The shutter is still present afterwards — the camera remains usable.
    expect(screen.getByLabelText('Capture plate photo')).toBeTruthy();
  });
});
