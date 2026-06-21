/**
 * onboarding-cycle-basics.test.tsx
 *
 * Screen-level coverage for the OPT-IN menstrual-cycle step (F25) —
 * app/(onboarding)/cycle-basics.tsx. Pins the track-first, skippable contract:
 *
 *   - SKIPPABLE: Continue is ALWAYS enabled (the step is opt-in). With tracking
 *     OFF, pressing Continue persists cycleTrackingEnabled:false and advances to
 *     shift-type — no cycle data required.
 *
 *   - OPT-IN REVEAL: the detail fields (last-period date, lengths, regularity,
 *     hormonal toggle) are hidden until the opt-in toggle is enabled.
 *
 *   - DISCLAIMER: the "wellness estimate, not medical advice" note is always shown.
 *
 *   - PERSIST ON ENABLE: enabling tracking + advancing writes
 *     cycleTrackingEnabled:true to the onboarding store and routes to shift-type.
 *
 * Mock conventions mirror onboarding-metrics-goals.test.tsx.
 *
 * Additive: NEW test file only.
 */

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
}));

const mockUpdateData = jest.fn();
const mockStore: { data: any; updateData: jest.Mock } = {
  data: {},
  updateData: mockUpdateData,
};
jest.mock('@/store/onboardingStore', () => ({
  useOnboardingStore: () => mockStore,
}));

jest.mock('@expo/vector-icons', () => {
  const { Text: RNText } = require('react-native');
  return {
    Ionicons: ({ name }: { name?: string }) => <RNText>{`icon:${name ?? ''}`}</RNText>,
  };
});

jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

jest.mock('expo-linear-gradient', () => {
  const RN = require('react-native');
  return { LinearGradient: (props: any) => <RN.View {...props} /> };
});

jest.mock('@/components/SafeBlurView', () => {
  const RN = require('react-native');
  return { SafeBlurView: ({ children, ...props }: any) => <RN.View {...props}>{children}</RN.View> };
});

jest.mock('@react-native-community/datetimepicker', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: (props: Record<string, unknown>) => <View {...props} /> };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));

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
import CycleBasicsScreen from '../../app/(onboarding)/cycle-basics';

function renderWithTheme(node: React.ReactElement) {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      {node}
    </ThemeContext.Provider>,
  );
}

function continueButton() {
  return screen.getByLabelText('Continue');
}
function isDisabled(node: any): boolean {
  return node.props.accessibilityState?.disabled === true;
}

describe('CycleBasicsScreen (onboarding F25) — opt-in, skippable, disclaimer', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockUpdateData.mockClear();
    mockStore.data = {};
  });

  test('the wellness-estimate disclaimer is always shown', () => {
    renderWithTheme(<CycleBasicsScreen />);
    expect(screen.getByText(/wellness estimate, not medical advice/i)).toBeTruthy();
  });

  test('Continue is ALWAYS enabled and skipping (tracking off) advances to shift-type', () => {
    renderWithTheme(<CycleBasicsScreen />);

    const cta = continueButton();
    // Opt-in: never blocks the user.
    expect(isDisabled(cta)).toBe(false);

    fireEvent.press(cta);

    // Persists the opt-out and proceeds — no cycle data needed.
    expect(mockUpdateData).toHaveBeenCalledTimes(1);
    expect(mockUpdateData.mock.calls[0][0]).toMatchObject({ cycleTrackingEnabled: false });
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith('/(onboarding)/shift-type');
  });

  test('detail fields are HIDDEN until tracking is enabled, then revealed', () => {
    renderWithTheme(<CycleBasicsScreen />);

    // Hidden by default (opt-in off).
    expect(screen.queryByLabelText('Avg cycle length (days)')).toBeNull();

    // Toggle on.
    fireEvent(screen.getByLabelText('Enable cycle tracking'), 'valueChange', true);

    // Now the detail fields are visible.
    expect(screen.getByLabelText('Avg cycle length (days)')).toBeTruthy();
    expect(screen.getByLabelText('Avg period length (days)')).toBeTruthy();
  });

  test('enabling tracking + advancing persists cycleTrackingEnabled:true and routes to shift-type', () => {
    renderWithTheme(<CycleBasicsScreen />);

    fireEvent(screen.getByLabelText('Enable cycle tracking'), 'valueChange', true);
    fireEvent.changeText(screen.getByLabelText('Avg cycle length (days)'), '30');
    fireEvent.changeText(screen.getByLabelText('Avg period length (days)'), '6');

    fireEvent.press(continueButton());

    expect(mockUpdateData).toHaveBeenCalledTimes(1);
    expect(mockUpdateData.mock.calls[0][0]).toMatchObject({
      cycleTrackingEnabled: true,
      avgCycleLengthDays: 30,
      avgPeriodLengthDays: 6,
    });
    expect(mockPush).toHaveBeenCalledWith('/(onboarding)/shift-type');
  });
});
