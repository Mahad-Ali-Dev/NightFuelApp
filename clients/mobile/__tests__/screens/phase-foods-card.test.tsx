/**
 * phase-foods-card.test.tsx
 *
 * Coverage for the "Best foods for your <phase> phase" card —
 * src/components/cycle/PhaseFoodsCard.tsx — rendered on the cycle screen below
 * the CyclePhaseCard. It calls GET /v1/meals/phase-foods for a CONCRETE phase
 * and renders the backend rationale + a horizontal scroll of food cards (image +
 * name + the focus-nutrient amount).
 *
 * Pins the gate + the happy path:
 *
 *   1. GATE — null / undefined phase → the card renders NOTHING (the user never
 *      enabled tracking, exactly like CyclePhaseCard refuses to fabricate).
 *   2. GATE — 'UNKNOWN' phase → also renders NOTHING (tracking on, no estimate);
 *      the endpoint has no focus nutrient for it, so we must not call it.
 *   3. CONCRETE phase → the heading, the verbatim rationale, every food name and
 *      its focus-nutrient amount ("Iron 6.4 mg") all render.
 *
 * Mock conventions mirror cycle-screen.test.tsx: @tanstack/react-query useQuery
 * branches on queryKey[0] off a mutable holder set per-test; @/api/meals is
 * stubbed so axios never loads; @/components/ui + @/theme stay REAL (assertions
 * ride the genuine GlassCard); only native leaves (blur/image/icons) are stubbed.
 *
 * Additive: NEW test file only.
 */

// Decorative glyphs → plain <Text> surfacing the icon name.
jest.mock('@expo/vector-icons', () => {
  const { Text: RNText } = require('react-native');
  return { Ionicons: ({ name }: { name?: string }) => <RNText>{`icon:${name ?? ''}`}</RNText> };
});

// GlassCard wraps the card in a SafeBlurView fill — passthrough so the REAL
// GlassCard mounts deterministically.
jest.mock('@/components/SafeBlurView', () => {
  const RN = require('react-native');
  return { SafeBlurView: ({ children, ...props }: any) => <RN.View {...props}>{children}</RN.View> };
});

// expo-image ships a native module — passthrough View so the food tiles mount.
jest.mock('expo-image', () => {
  const RN = require('react-native');
  return { Image: (props: any) => <RN.View {...props} /> };
});

// react-query: branch on queryKey[0]. ['phase-foods'] reads a mutable holder a
// test sets before render. The `enabled` flag is irrelevant to the stub — the
// card's own concrete-phase gate decides whether it even renders the query body.
const mockPhaseFoods: { data: any; isLoading: boolean; isError: boolean } = {
  data: undefined,
  isLoading: false,
  isError: false,
};
jest.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    if (queryKey[0] === 'phase-foods') {
      return {
        data: mockPhaseFoods.data,
        isLoading: mockPhaseFoods.isLoading,
        isError: mockPhaseFoods.isError,
        refetch: jest.fn(),
      };
    }
    return { data: undefined, isLoading: false, isError: false, refetch: jest.fn() };
  },
}));

// api/meals — getPhaseFoods exists only so the static import resolves (useQuery
// is fully stubbed, so it is never actually invoked).
jest.mock('@/api/meals', () => ({ getPhaseFoods: jest.fn() }));

import React from 'react';
import { render, screen } from '@testing-library/react-native';
import {
  ThemeContext,
  getThemeColors,
  typography,
  spacing,
  borderRadius,
  shadows,
} from '@/theme';
import { PhaseFoodsCard } from '../../src/components/cycle/PhaseFoodsCard';

function renderCard(node: React.ReactElement) {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      {node}
    </ThemeContext.Provider>,
  );
}

const MENSTRUAL_FOODS = {
  phase: 'MENSTRUAL',
  focusNutrient: 'ironMg',
  focusLabel: 'Iron',
  rationale: 'During your menstrual phase, iron-rich foods can support how you feel day to day.',
  foods: [
    { id: 'f1', name: 'Spinach', calories: 23, protein: 3, carbs: 4, fat: 0, servingSize: '100g', ironMg: 2.7, imageUrl: 'https://img/spinach.jpg' },
    { id: 'f2', name: 'Lentils', calories: 116, protein: 9, carbs: 20, fat: 0, servingSize: '100g', ironMg: 6.4, imageUrl: null },
    { id: 'f3', name: 'Pumpkin Seeds', calories: 559, protein: 30, carbs: 11, fat: 49, servingSize: '100g', ironMg: 8.8, imageUrl: 'https://img/seeds.jpg' },
  ],
};

beforeEach(() => {
  mockPhaseFoods.data = undefined;
  mockPhaseFoods.isLoading = false;
  mockPhaseFoods.isError = false;
});

describe('PhaseFoodsCard — gate', () => {
  test('renders NOTHING for an undefined phase (tracking never enabled)', () => {
    mockPhaseFoods.data = MENSTRUAL_FOODS; // even with data, the gate wins
    const { toJSON } = renderCard(<PhaseFoodsCard phase={undefined} />);
    expect(toJSON()).toBeNull();
  });

  test('renders NOTHING for a null phase', () => {
    const { toJSON } = renderCard(<PhaseFoodsCard phase={null} />);
    expect(toJSON()).toBeNull();
  });

  test("renders NOTHING for 'UNKNOWN' (tracking on, no estimate)", () => {
    mockPhaseFoods.data = MENSTRUAL_FOODS;
    const { toJSON } = renderCard(<PhaseFoodsCard phase="UNKNOWN" />);
    expect(toJSON()).toBeNull();
    // And the section testID is absent.
    expect(screen.queryByTestId('phase-foods-card')).toBeNull();
  });
});

describe('PhaseFoodsCard — concrete phase', () => {
  test('renders the heading, the verbatim rationale, and every food name + focus amount', () => {
    mockPhaseFoods.data = MENSTRUAL_FOODS;
    renderCard(<PhaseFoodsCard phase="MENSTRUAL" />);

    // Section mounted.
    expect(screen.getByTestId('phase-foods-card')).toBeTruthy();
    // Heading names the phase (upper-cased overline).
    expect(screen.getByText(/BEST FOODS FOR YOUR MENSTRUAL PHASE/i)).toBeTruthy();
    // The backend rationale is shown verbatim.
    expect(screen.getByText(MENSTRUAL_FOODS.rationale)).toBeTruthy();
    // Every food name renders.
    expect(screen.getByText('Spinach')).toBeTruthy();
    expect(screen.getByText('Lentils')).toBeTruthy();
    expect(screen.getByText('Pumpkin Seeds')).toBeTruthy();
    // The focus-nutrient amount (ironMg → "Iron x mg") renders per food.
    expect(screen.getByText('Iron 2.7 mg')).toBeTruthy();
    expect(screen.getByText('Iron 6.4 mg')).toBeTruthy();
    expect(screen.getByText('Iron 8.8 mg')).toBeTruthy();
    // Non-prescriptive footer is present.
    expect(screen.getByText(/not medical or dietary advice/i)).toBeTruthy();
  });

  test('renders an error message when the query errors (concrete phase)', () => {
    mockPhaseFoods.isError = true;
    renderCard(<PhaseFoodsCard phase="FOLLICULAR" />);

    // The card still mounts (heading present) and shows a graceful error line.
    expect(screen.getByText(/BEST FOODS FOR YOUR FOLLICULAR PHASE/i)).toBeTruthy();
    expect(screen.getByText(/couldn't load phase foods/i)).toBeTruthy();
  });
});
