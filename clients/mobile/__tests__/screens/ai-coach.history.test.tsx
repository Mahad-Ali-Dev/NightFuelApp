/**
 * ai-coach.history.test.tsx
 *
 * Screen-level coverage for the Ria AI-coach PERSISTED-HISTORY LOAD states —
 * `app/(modals)/ai-coach.tsx`.
 *
 * The screen loads the persisted Ria transcript via `historyQuery`
 * (['ria-messages'] → getRiaMessages) and, until that settles, must show an
 * honest affordance — never a misleading "empty thread"/seeded greeting and
 * never a PERPETUAL spinner. This suite pins the three load outcomes:
 *
 *   - LOADING: while getRiaMessages is in flight the screen shows a loading
 *     affordance (an ActivityIndicator) and does NOT render the seeded Ria
 *     greeting or the quick-question chips (no false "brand-new conversation");
 *   - ERROR (the VERIFIED gap): when getRiaMessages REJECTS, the screen renders a
 *     retryable inline error — "Couldn't load your conversation" inside a
 *     GlassCard with a "Retry" control — instead of spinning forever or showing
 *     the greeting. Pressing Retry fires getRiaMessages again (a refetch), and on
 *     a now-successful load the error clears and the transcript/greeting renders;
 *   - EMPTY (brand-new conversation): when getRiaMessages resolves to [], the
 *     screen seeds the explicit Ria greeting (the "I'm Ria" empty copy), NOT an
 *     error and NOT a perpetual spinner;
 *   - QUOTA/429 UNCHANGED: a fallback sendRiaMessage 429 still flips the composer
 *     into the locked Upgrade state and surfaces NO Alert — the history error
 *     branch does not regress the quota contract.
 *
 * Additive + verify-only: NEW test file only; it authors no production change.
 * Mock conventions mirror the sibling `ai-coach.quota.test.tsx` /
 * `ai-coach.transcript.test.tsx`: reanimated/gesture-handler stubbed, the stream
 * path forced to error so the fallback mutation runs, and the persisted history
 * supplied through the getRiaMessages mock — here driven into resolve / reject /
 * pending so every load outcome is exercised against the real query.
 */

import React from 'react';
import { Alert } from 'react-native';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import {
  ThemeContext,
  getThemeColors,
  typography,
  spacing,
  borderRadius,
  shadows,
} from '@/theme';

// ── Hoisted mock holders (mirror ai-coach.quota.test.tsx) ─────────────────────

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
}));

// The history loader is a jest.fn whose implementation each test sets to model
// the three outcomes: resolve([...]) / reject(err) / a never-settling promise
// (pending). The screen's historyQuery calls it; with retry:false on the test
// QueryClient a rejection surfaces isError after a single attempt.
const mockGetRiaMessages = jest.fn();
const mockSendRia = jest.fn();

jest.mock('@/api/chat', () => ({
  getRiaMessages: (...args: any[]) => mockGetRiaMessages(...args),
  sendRiaMessage: (...args: any[]) => mockSendRia(...args),
}));

// Force the streaming path to fail with no usable tokens so any send funnels
// into the fallback sendRiaMessage (the path that surfaces the 429 quota state).
jest.mock('@/api/ai', () => ({
  streamChat: (_payload: any, handlers: any) => {
    setTimeout(() => handlers.onError('unavailable', ''), 0);
    return () => undefined;
  },
}));

jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1', name: 'Sam Tester', email: 's@e.co' } }),
}));

jest.mock('@/api/client', () => ({
  apiClient: { get: jest.fn(() => Promise.resolve({ data: { data: null } })), post: jest.fn() },
}));

// Rate limit always allows (so a send isn't blocked client-side).
jest.mock('@/hooks/useRateLimit', () => ({
  useRateLimit: () => ({ canCall: () => true, recordCall: jest.fn(), retryAfterSec: 0, callsRemaining: 99 }),
}));

jest.mock('@/lib/sentry', () => ({ captureException: jest.fn() }));

// Decorative glyphs → plain text so labels/icons are assertable.
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

// Stub reanimated to its shipped jest mock (no worklets under test).
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

// GestureDetector → passthrough; Gesture.Tap() → a chainable no-op stub whose
// terminal .onEnd(fn) captures the tap handler so a fireEvent.press on the
// rendered node still invokes it. The Retry control + chips/send button are all
// GestureDetector-driven, so this is what makes them pressable under jest.
jest.mock('react-native-gesture-handler', () => {
  const RN = require('react-native');
  const chain: any = new Proxy(() => chain, { get: () => () => chain });
  return {
    GestureDetector: ({ children }: any) => <RN.View>{children}</RN.View>,
    Gesture: { Tap: () => chain },
  };
});

// SafeBlurView (used by GlassCard) → passthrough View so children render.
jest.mock('@/components/SafeBlurView', () => {
  const RN = require('react-native');
  return { SafeBlurView: ({ children }: any) => <RN.View>{children}</RN.View> };
});

// react-query: real QueryClientProvider so useQuery/useMutation behave; history
// is supplied through the getRiaMessages mock above.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Import the screen AFTER the mocks are registered.
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
});

// ── Loading: a loading affordance, never a false "empty thread" ───────────────

describe('ai-coach screen — history loading', () => {
  it('shows a loading affordance and NOT the seeded greeting while history is in flight', async () => {
    const { ActivityIndicator } = require('react-native');
    // Never-settling promise → historyQuery stays isLoading (and never errors).
    mockGetRiaMessages.mockReturnValue(new Promise<never>(() => { /* pending */ }));

    renderScreen();

    // The spinner is rendered (the screen's loading affordance under jest exposes
    // the ActivityIndicator host component).
    await waitFor(() => expect(screen.UNSAFE_getAllByType(ActivityIndicator).length).toBeGreaterThan(0));

    // No false "brand-new conversation" while loading: the seeded Ria greeting
    // (the misleading empty-thread signal) must NOT be on screen until the load
    // settles — `hasLoaded` only flips in the success effect.
    expect(screen.queryByText(/I'm Ria/)).toBeNull();
    // And not the error state either.
    expect(screen.queryByText("Couldn't load your conversation")).toBeNull();
  });
});

// ── Error: honest, retryable inline error (the VERIFIED gap) ──────────────────

describe('ai-coach screen — history load error → retryable inline error', () => {
  it('renders a retryable error (not a perpetual spinner, not the seeded greeting) when history load FAILS', async () => {
    const { ActivityIndicator } = require('react-native');
    // First load rejects (network/parse/5xx) → isError.
    mockGetRiaMessages.mockRejectedValue(new Error('Network Error'));

    renderScreen();

    // The honest error copy appears…
    await waitFor(() => expect(screen.getByText("Couldn't load your conversation")).toBeTruthy());
    expect(screen.getByText('Check your connection and try again.')).toBeTruthy();
    // …with a Retry control…
    expect(screen.getByText('Retry')).toBeTruthy();
    expect(screen.getByLabelText('Retry loading your conversation')).toBeTruthy();

    // …and it is NOT a perpetual spinner and NOT the seeded greeting.
    expect(screen.UNSAFE_queryAllByType(ActivityIndicator).length).toBe(0);
    expect(screen.queryByText(/I'm Ria/)).toBeNull();
    // Quick-question chips (the brand-new-conversation prompts) stay hidden too.
    expect(screen.queryByText('Why am I tired today?')).toBeNull();

    // getRiaMessages was attempted exactly once so far (retry:false).
    expect(mockGetRiaMessages).toHaveBeenCalledTimes(1);
  });

  it('Retry fires a getRiaMessages refetch; a now-successful load clears the error and shows the greeting', async () => {
    // First call rejects; the refetch resolves to an empty history.
    mockGetRiaMessages
      .mockRejectedValueOnce(new Error('Network Error'))
      .mockResolvedValueOnce([]);

    renderScreen();

    await waitFor(() => expect(screen.getByText("Couldn't load your conversation")).toBeTruthy());
    expect(mockGetRiaMessages).toHaveBeenCalledTimes(1);

    // Press Retry → refetch → second getRiaMessages call.
    fireEvent.press(screen.getByText('Retry'));
    await waitFor(() => expect(mockGetRiaMessages).toHaveBeenCalledTimes(2));

    // On the successful refetch the error clears and the brand-new-conversation
    // greeting renders (history resolved []).
    await waitFor(() => expect(screen.getByText(/I'm Ria/)).toBeTruthy());
    expect(screen.queryByText("Couldn't load your conversation")).toBeNull();
  });
});

// ── Empty: brand-new conversation → explicit Ria greeting ─────────────────────

describe('ai-coach screen — empty history → seeded greeting', () => {
  it('seeds the explicit Ria greeting (not an error, not a perpetual spinner) when history is []', async () => {
    const { ActivityIndicator } = require('react-native');
    mockGetRiaMessages.mockResolvedValue([]);

    renderScreen();

    // The brand-new-conversation greeting (the "I'm Ria" empty copy) renders…
    await waitFor(() => expect(screen.getByText(/I'm Ria/)).toBeTruthy());
    // …and the personalised first-name salutation lands.
    expect(screen.getByText(/Hi Sam/)).toBeTruthy();

    // Neither the error state nor a lingering spinner.
    expect(screen.queryByText("Couldn't load your conversation")).toBeNull();
    expect(screen.UNSAFE_queryAllByType(ActivityIndicator).length).toBe(0);
  });
});

// ── Quota/429 contract unchanged by the new error branch ──────────────────────

describe('ai-coach screen — daily-quota 429 still flips the composer (no Alert)', () => {
  it('on a fallback 429 ai_quota_exceeded shows the Upgrade CTA, routes to premium, and never Alerts', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    // History loads empty → greeting; the fallback send rejects with the 429 body.
    mockGetRiaMessages.mockResolvedValue([]);
    mockSendRia.mockRejectedValue({
      response: { status: 429, data: { error: 'ai_quota_exceeded', limit: 5, plan: 'free', resetsAt: '2099-01-02T00:00:00.000Z' } },
    });

    renderScreen();

    await waitFor(() => expect(screen.getByText(/I'm Ria/)).toBeTruthy());

    // Tap a quick-question chip → send → stream errors → fallback 429.
    fireEvent.press(screen.getByText('Why am I tired today?'));

    // The locked composer CTA + the inline upgrade card both appear…
    await waitFor(() => expect(screen.getByText('Daily AI limit reached — Upgrade')).toBeTruthy());
    expect(screen.getByText('Daily AI limit reached')).toBeTruthy();

    // …pressing the composer CTA routes to premium (only that)…
    fireEvent.press(screen.getByText('Daily AI limit reached — Upgrade'));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/(modals)/premium'));
    expect(mockPush.mock.calls.every(([r]) => r === '/(modals)/premium')).toBe(true);

    // …and NO Alert was ever raised on the 429 path (the no-Alert contract).
    expect(alertSpy).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });
});
