/**
 * heart-rate-measure.test.tsx
 *
 * Screen-level coverage for the camera-PPG measurement screen
 * (app/(performance)/heart-rate-measure.tsx) under the GATE.
 *
 * On the gate (and in Expo Go) `react-native-vision-camera` is mapped to a stub
 * that exposes no camera API, so `isPpgSupported()` is false and the screen MUST
 * render its honest "needs the app build" state — never a camera preview and
 * never a fabricated BPM. This locks that honest fallback + the always-on
 * disclaimer + the BLE accuracy steer, mirroring the honest-fallback discipline
 * asserted for the Connected Devices screen (devices.test.tsx).
 *
 * (The camera capture + DSP paths are validated separately: the pure estimator in
 * __tests__/lib/ppgSignal.test.ts, the history store in measurementStore.test.ts;
 * the live camera itself is dev-build-only and can't run on the jest renderer.)
 */

// ── jest.mock hoisting block (runs ABOVE the imports) ────────────────────────
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useFocusEffect: jest.fn(),
}));

jest.mock('@expo/vector-icons', () => {
  const { Text: RNText } = require('react-native');
  return { Ionicons: ({ name }: { name?: string }) => <RNText>{`icon:${name ?? ''}`}</RNText> };
});

jest.mock('expo-linear-gradient', () => {
  const RN = require('react-native');
  return { LinearGradient: (props: any) => <RN.View {...props} /> };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));

jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
jest.mock('expo-keep-awake', () => ({ useKeepAwake: () => {} }));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning' },
}));

// The profile query + health ingest are irrelevant to the unsupported render;
// stub them so the screen doesn't pull in the axios client / query provider.
jest.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: undefined }) }));
jest.mock('@/api/profile', () => ({ getMyProfile: jest.fn() }));
jest.mock('@/api/health', () => ({ ingestHealthSamples: jest.fn() }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

// ── Imports (run AFTER the hoisted mocks above) ──────────────────────────────
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
import { isPpgSupported } from '@/lib/ppg/ppgCamera';
import HeartRateMeasureScreen from '../../app/(performance)/heart-rate-measure';

function renderScreen() {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      <HeartRateMeasureScreen />
    </ThemeContext.Provider>,
  );
}

describe('Camera Heart Rate screen (gate — camera unavailable)', () => {
  it('reports camera PPG unsupported under the vision-camera stub', () => {
    // Sanity: the availability probe is the gate the screen branches on.
    expect(isPpgSupported()).toBe(false);
  });

  it('renders the honest "needs the app build" state — no preview, no fabricated BPM', () => {
    renderScreen();

    // Header + honest unsupported messaging.
    expect(screen.getByText('Camera Heart Rate')).toBeTruthy();
    expect(screen.getByText('Camera measurement needs the app build')).toBeTruthy();

    // It never starts a measurement or shows a made-up reading in this state.
    expect(screen.queryByText('Start measurement')).toBeNull();
    expect(screen.queryByText('bpm')).toBeNull();
  });

  it('always shows the wellness-estimate disclaimer and the BLE accuracy steer', () => {
    renderScreen();

    expect(screen.getByText(/wellness estimate/i)).toBeTruthy();
    expect(screen.getByText(/not a medical device/i)).toBeTruthy();
    expect(screen.getByText('Want more accuracy? Connect a Bluetooth strap')).toBeTruthy();
  });
});
