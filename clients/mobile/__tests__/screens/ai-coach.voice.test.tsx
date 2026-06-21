/**
 * ai-coach.voice.test.tsx
 *
 * Screen-level coverage for the OPT-IN voice module wired into the Ria AI-coach
 * composer — `app/(modals)/ai-coach.tsx`.
 *
 * The voice adapter (`@/lib/voice`) is MOCKED here (the gate never loads native
 * STT/TTS) so we can drive the state machine deterministically and assert the
 * wiring without any native package:
 *
 *   - MIC TOGGLES LISTENING: tapping the mic requests permission then starts a
 *     listening session (idle → listening); tapping again commits (stop).
 *   - FINAL → sendMessage: a final transcript delivered by the adapter is fed to
 *     the EXISTING send path, producing a user bubble with the spoken text and
 *     kicking off the stream.
 *   - REPLY → speak(): when "Ria speaks replies" is ON, completing Ria's reply
 *     (stream onDone) calls the adapter's speak() with the reply text.
 *   - UNAVAILABLE → DISABLED: when the adapter reports STT/TTS unavailable, the
 *     mic shows an honest disabled "needs dev build" state and never listens.
 *   - TEXT-ONLY UNCHANGED: typing + Send still works exactly as before, with no
 *     speak() call when voice is unused (default OFF).
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

// ── Hoisted mock holders ──────────────────────────────────────────────────────

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
}));

const mockHistory: { data: any; isLoading: boolean } = { data: [], isLoading: false };
const mockSendRia = jest.fn((..._args: any[]) => Promise.resolve({ reply: 'Non-stream reply.' }));

jest.mock('@/api/chat', () => ({
  getRiaMessages: jest.fn(() => Promise.resolve(mockHistory.data)),
  sendRiaMessage: (...args: any[]) => mockSendRia(...args),
}));

// Controllable stream: capture the handlers so a test can drive onToken/onDone.
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

// ── The voice adapter mock — the key seam under test ──────────────────────────
// A mutable, `mock`-prefixed adapter object so each test can configure
// availability and capture the handlers passed to startListening.
const mockVoiceAdapter: any = {
  __available: true,
  __listenHandlers: null,
  isSTTAvailable: jest.fn(() => mockVoiceAdapter.__available),
  isTTSAvailable: jest.fn(() => mockVoiceAdapter.__available),
  requestPermission: jest.fn(() => Promise.resolve(true)),
  startListening: jest.fn((handlers: any) => {
    mockVoiceAdapter.__listenHandlers = handlers;
    handlers.onStart?.();
  }),
  stop: jest.fn(() => {
    // Emulate the engine committing a final on stop.
    mockVoiceAdapter.__listenHandlers?.onFinal?.('committed by stop');
  }),
  abort: jest.fn(),
  speak: jest.fn((_t: string, opts: any) => opts?.onDone?.()),
  stopSpeaking: jest.fn(),
};

jest.mock('@/lib/voice', () => ({
  getVoiceAdapter: () => mockVoiceAdapter,
}));
// voice.types is pure TS — use the real module (no native imports).
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
  // A Tap gesture that records its onEnd so we can fire it from a press, and
  // whose .enabled(false) suppresses the handler (mirrors the real disabled mic).
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
      // Wrap children in a pressable host that fires the gesture's onEnd when
      // enabled — so fireEvent.press(...) drives the same path as a real tap.
      // We LIFT the child's a11y props (role/label/state/testID) onto the
      // Pressable and STRIP them from the child clone, so each control exposes a
      // SINGLE accessible node (no duplicate "Send"/"mic-button" matches).
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
  mockVoiceAdapter.__available = true;
  mockVoiceAdapter.__listenHandlers = null;
  mockVoiceAdapter.requestPermission.mockResolvedValue(true);
  mockStreamHandlers.current = null;
});

/** Wait until the empty-state composer (text-only path) has mounted. */
async function waitForComposer() {
  await waitFor(() => expect(screen.getByLabelText('Send')).toBeTruthy());
}

describe('ai-coach voice — mic toggles listening', () => {
  it('tapping the mic requests permission and starts a listening session', async () => {
    renderScreen();
    await waitForComposer();

    const mic = screen.getByTestId('mic-button');
    await act(async () => { fireEvent.press(mic); });

    await waitFor(() => expect(mockVoiceAdapter.requestPermission).toHaveBeenCalledTimes(1));
    expect(mockVoiceAdapter.startListening).toHaveBeenCalledTimes(1);
    // The live "Listening…" affordance appears once onStart fired.
    await waitFor(() => expect(screen.getByText('Listening…')).toBeTruthy());
  });

  it('tapping the mic again while listening commits the utterance (stop)', async () => {
    renderScreen();
    await waitForComposer();

    const mic = screen.getByTestId('mic-button');
    await act(async () => { fireEvent.press(mic); }); // start
    await waitFor(() => expect(mockVoiceAdapter.startListening).toHaveBeenCalled());

    await act(async () => { fireEvent.press(mic); }); // commit
    expect(mockVoiceAdapter.stop).toHaveBeenCalledTimes(1);
  });
});

describe('ai-coach voice — final transcript feeds the existing send path', () => {
  it('a final transcript calls sendMessage (user bubble + stream started)', async () => {
    renderScreen();
    await waitForComposer();

    const mic = screen.getByTestId('mic-button');
    await act(async () => { fireEvent.press(mic); });
    await waitFor(() => expect(mockVoiceAdapter.__listenHandlers).toBeTruthy());

    // The adapter delivers a final transcript — the screen must send it.
    await act(async () => {
      mockVoiceAdapter.__listenHandlers.onFinal('how does my sleep look');
    });

    // The spoken text shows as the user's bubble…
    await waitFor(() => expect(screen.getByText('how does my sleep look')).toBeTruthy());
    // …and the existing stream send path was kicked off (handlers captured).
    expect(mockStreamHandlers.current).toBeTruthy();
  });
});

describe('ai-coach voice — reply completion speaks when enabled', () => {
  it('calls speak() with the reply text on stream onDone when "Ria speaks replies" is ON', async () => {
    renderScreen();
    await waitForComposer();

    // Turn ON "Ria speaks replies".
    const toggle = screen.getByTestId('speak-toggle');
    await act(async () => { fireEvent.press(toggle); });

    // Send via voice final → starts the stream.
    const mic = screen.getByTestId('mic-button');
    await act(async () => { fireEvent.press(mic); });
    await waitFor(() => expect(mockVoiceAdapter.__listenHandlers).toBeTruthy());
    await act(async () => { mockVoiceAdapter.__listenHandlers.onFinal('hello ria'); });
    await waitFor(() => expect(mockStreamHandlers.current).toBeTruthy());

    // Drive the stream to completion with a reply.
    await act(async () => {
      mockStreamHandlers.current.onToken('Get some morning light.');
      mockStreamHandlers.current.onDone();
    });

    await waitFor(() => expect(mockVoiceAdapter.speak).toHaveBeenCalled());
    expect(mockVoiceAdapter.speak.mock.calls[0][0]).toContain('Get some morning light.');
  });

  it('does NOT speak when "Ria speaks replies" is OFF (default)', async () => {
    renderScreen();
    await waitForComposer();

    const mic = screen.getByTestId('mic-button');
    await act(async () => { fireEvent.press(mic); });
    await waitFor(() => expect(mockVoiceAdapter.__listenHandlers).toBeTruthy());
    await act(async () => { mockVoiceAdapter.__listenHandlers.onFinal('hi'); });
    await waitFor(() => expect(mockStreamHandlers.current).toBeTruthy());

    await act(async () => {
      mockStreamHandlers.current.onToken('A reply.');
      mockStreamHandlers.current.onDone();
    });

    expect(mockVoiceAdapter.speak).not.toHaveBeenCalled();
  });
});

describe('ai-coach voice — unavailable shows an honest disabled state', () => {
  it('when STT/TTS are unavailable, the mic is disabled and never listens', async () => {
    mockVoiceAdapter.__available = false;
    renderScreen();
    await waitForComposer();

    const mic = screen.getByTestId('mic-button');
    // Honest a11y label + disabled state.
    expect(mic.props.accessibilityState?.disabled).toBe(true);
    expect(screen.getByLabelText(/needs a dev build/i)).toBeTruthy();
    // The honest hint is shown instead of the toggle.
    expect(screen.getByText('Voice needs a dev build')).toBeTruthy();

    await act(async () => { fireEvent.press(mic); });
    expect(mockVoiceAdapter.requestPermission).not.toHaveBeenCalled();
    expect(mockVoiceAdapter.startListening).not.toHaveBeenCalled();
  });
});

describe('ai-coach voice — text-only chat path is unchanged', () => {
  it('typing + Send works and never calls speak() when voice is unused', async () => {
    renderScreen();
    await waitForComposer();

    const input = screen.getByPlaceholderText('Ask Ria about your shift protocol...');
    fireEvent.changeText(input, 'plain typed message');

    const send = screen.getByLabelText('Send');
    await act(async () => { fireEvent.press(send); });

    // The typed message becomes the user bubble and the stream send path runs.
    await waitFor(() => expect(screen.getByText('plain typed message')).toBeTruthy());
    expect(mockStreamHandlers.current).toBeTruthy();

    // Voice was never used → no speak (default OFF), no listening.
    expect(mockVoiceAdapter.speak).not.toHaveBeenCalled();
    expect(mockVoiceAdapter.startListening).not.toHaveBeenCalled();
  });
});
