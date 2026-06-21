/**
 * ai-coach.interval-cleanup.test.tsx
 *
 * Regression coverage for LOW #7: the non-streaming fallback typing effect
 * (`streamText` in app/(modals)/ai-coach.tsx) creates a setInterval whose handle
 * used to be a LOCAL const and was never cleared on unmount — so a long reply
 * still typing when the screen closed left a timer alive that called setMessages
 * after unmount (setState-after-unmount).
 *
 * The fix stores the interval id in a ref and clears it in the existing unmount
 * cleanup (and at the start of a new turn). This suite drives the fallback path
 * (stream errors with no tokens → runFallback → sendRiaMessage onSuccess →
 * streamText starts the interval), then unmounts MID-TYPE and asserts:
 *   - clearInterval was called with the live interval id on unmount, and
 *   - advancing timers past unmount triggers NO further setMessages work (no
 *     "state update on an unmounted component" console error).
 *
 * Mock conventions mirror the sibling ai-coach.*.test.tsx suites.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import {
  ThemeContext,
  getThemeColors,
  typography,
  spacing,
  borderRadius,
  shadows,
} from '@/theme';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));

const mockHistory: { data: any; isLoading: boolean } = { data: [], isLoading: false };
// A long reply so the per-character typing interval is still running when we
// unmount (it advances 2 chars / TYPING_SPEED_MS tick).
const LONG_REPLY = 'x'.repeat(400);
const mockSendRia = jest.fn((..._args: any[]) => Promise.resolve({ reply: LONG_REPLY }));

jest.mock('@/api/chat', () => ({
  getRiaMessages: jest.fn(() => Promise.resolve(mockHistory.data)),
  sendRiaMessage: (...args: any[]) => mockSendRia(...args),
}));

// Stream stub: capture handlers so the test can force an immediate error with no
// tokens, which triggers the non-streaming fallback (the streamText path).
const mockStreamHandlers: { current: any } = { current: null };
const mockStreamStop = jest.fn();
jest.mock('@/api/ai', () => ({
  streamChat: (_payload: any, handlers: any) => {
    mockStreamHandlers.current = handlers;
    return mockStreamStop;
  },
}));

jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1', name: 'Sam Tester', email: 's@e.co' } }),
}));

jest.mock('@/api/client', () => ({
  apiClient: { get: jest.fn(() => Promise.resolve({ data: { data: null } })), post: jest.fn() },
}));

jest.mock('@/hooks/useRateLimit', () => ({
  useRateLimit: () => ({ canCall: () => true, recordCall: jest.fn(), retryAfterSec: 0, callsRemaining: 99 }),
}));

jest.mock('@/lib/sentry', () => ({ captureException: jest.fn() }));

const mockVoiceAdapter: any = {
  isSTTAvailable: jest.fn(() => false),
  isTTSAvailable: jest.fn(() => false),
  requestPermission: jest.fn(() => Promise.resolve(false)),
  startListening: jest.fn(),
  stop: jest.fn(),
  abort: jest.fn(),
  speak: jest.fn(),
  stopSpeaking: jest.fn(),
};
jest.mock('@/lib/voice', () => ({ getVoiceAdapter: () => mockVoiceAdapter }));
jest.unmock('@/lib/voice.types');

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

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

jest.mock('react-native-gesture-handler', () => {
  const RN = require('react-native');
  const React = require('react');
  function makeTap() {
    const state: any = { _onEnd: null, _enabled: true };
    const api: any = {
      enabled: (v: boolean) => { state._enabled = v; return api; },
      onBegin: () => api,
      onFinalize: () => api,
      onEnd: (cb: any) => { state._onEnd = cb; return api; },
      __state: state,
    };
    return api;
  }
  return {
    GestureDetector: ({ gesture, children }: any) => {
      const st = gesture?.__state;
      const childProps = children?.props ?? {};
      const stripped = children
        ? React.cloneElement(children, {
            accessibilityRole: undefined,
            accessibilityLabel: undefined,
            accessibilityState: undefined,
            testID: undefined,
          })
        : children;
      return (
        <RN.Pressable
          accessibilityRole={childProps.accessibilityRole}
          accessibilityLabel={childProps.accessibilityLabel}
          accessibilityState={childProps.accessibilityState}
          testID={childProps.testID}
          onPress={() => { if (st?._enabled && st?._onEnd) st._onEnd(); }}
        >
          {stripped}
        </RN.Pressable>
      );
    },
    Gesture: { Tap: () => makeTap() },
  };
});

jest.mock('@/components/SafeBlurView', () => {
  const RN = require('react-native');
  return { SafeBlurView: ({ children }: any) => <RN.View>{children}</RN.View> };
});

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AICoachScreen from '../../app/(modals)/ai-coach';

function renderScreen() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ThemeContext.Provider
        value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
      >
        <AICoachScreen />
      </ThemeContext.Provider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockHistory.data = [];
  mockHistory.isLoading = false;
  mockStreamHandlers.current = null;
});

async function waitForComposer() {
  await waitFor(() => expect(screen.getByLabelText('Send')).toBeTruthy());
}

describe('ai-coach — fallback typing interval is cleared on unmount (LOW #7)', () => {
  it('clears the streamText setInterval on unmount and fires no setState after', async () => {
    jest.useFakeTimers();
    const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    try {
      const { unmount } = renderScreen();
      // Flush the initial history query + effects.
      await act(async () => { await Promise.resolve(); jest.advanceTimersByTime(0); });
      await waitForComposer();

      // Type + send → primary stream starts (handlers captured).
      const inputField = screen.getByPlaceholderText('Ask Ria about your shift protocol...');
      await act(async () => { fireEvent.changeText(inputField, 'hello ria'); });
      await act(async () => { fireEvent.press(screen.getByLabelText('Send')); });
      await waitFor(() => expect(mockStreamHandlers.current).toBeTruthy());

      // Force the stream to error with NO tokens → transparent fallback to the
      // non-streaming sendRiaMessage path (whose onSuccess starts streamText).
      await act(async () => { mockStreamHandlers.current.onError('boom', ''); });
      // mutation.mutate resolves → onSuccess schedules streamText after 50ms.
      await act(async () => { await Promise.resolve(); await Promise.resolve(); });
      await act(async () => { jest.advanceTimersByTime(60); });

      // The typing interval is now running. Advance a little so it has ticked
      // but the LONG_REPLY is NOT yet fully typed (interval still alive).
      await act(async () => { jest.advanceTimersByTime(40); });

      const clearCallsBeforeUnmount = clearIntervalSpy.mock.calls.length;

      // Unmount MID-TYPE. The cleanup must clear the live interval.
      unmount();
      expect(clearIntervalSpy.mock.calls.length).toBeGreaterThan(clearCallsBeforeUnmount);

      // Advancing timers well past unmount must NOT produce a setState-after-
      // unmount React error (the timer is dead).
      await act(async () => { jest.advanceTimersByTime(5000); });
      const unmountStateErrors = consoleErrorSpy.mock.calls.filter((c) =>
        String(c[0]).includes('unmounted component') ||
        String(c[0]).includes("can't perform a React state update"),
      );
      expect(unmountStateErrors).toHaveLength(0);
    } finally {
      consoleErrorSpy.mockRestore();
      clearIntervalSpy.mockRestore();
      jest.useRealTimers();
    }
  });
});
