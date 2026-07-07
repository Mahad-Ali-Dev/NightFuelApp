/**
 * ai-coach.quota.test.tsx
 *
 * Screen-level + pure-helper coverage for the Ria AI-coach daily-quota UX —
 * `app/(modals)/ai-coach.tsx`.
 *
 * The screen derives a "N left today" indicator from a local per-UTC-day tally
 * and, on a `POST /v1/chat/ria/send` 429 `{ error:'ai_quota_exceeded', limit,
 * plan, resetsAt }` (the chat-service quota contract), flips into a clean
 * "Daily AI limit reached — Upgrade" state whose CtaButton routes to
 * `/(modals)/premium`. This suite pins:
 *
 *   - PURE HELPERS (parseQuotaError / remainingToday / formatResetWindow /
 *     utcDayKey): the quota math the indicator + 429 handler rely on, driven
 *     directly so every branch is covered without a render;
 *   - 429 → UPGRADE STATE: when the fallback `sendRiaMessage` rejects with a 429
 *     ai_quota_exceeded body, the composer shows the locked upgrade CTA and
 *     pressing it pushes '/(modals)/premium' — and ONLY that route;
 *   - INDICATOR: with seeded history the header renders the remaining-today
 *     pill.
 *
 * Additive + verify-only: NEW test file only; the screen is untouched.
 *
 * Mock conventions mirror the sibling screen suites (the `mock`-prefixed hoisted
 * holders of community.test.tsx / active-workout.previousSet.test.tsx). The
 * stream path is forced to fail immediately so the screen falls back to the
 * mocked `sendRiaMessage`, which we reject with the 429 — exercising the exact
 * production quota path. react-native-reanimated + gesture-handler are stubbed
 * so the worklet-driven dots/press states render deterministically under jest.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import {
  ThemeContext,
  getThemeColors,
  typography,
  spacing,
  borderRadius,
  shadows,
} from '@/theme';

// ── Pure-helper imports (no render) ──────────────────────────────────────────
import {
  parseQuotaError,
  remainingToday,
  formatResetWindow,
  utcDayKey,
} from '../../app/(modals)/ai-coach';

// ── Hoisted mock holders ─────────────────────────────────────────────────────

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
}));

// History query holder + a mutable sendRiaMessage spy. The stream path always
// errors (see @/api/ai mock) so every send funnels into this fallback mutation.
type HistoryState = { data: any; isLoading: boolean };
const mockHistory: HistoryState = { data: [], isLoading: false };
const mockSendRia = jest.fn();

jest.mock('@/api/chat', () => ({
  getRiaMessages: jest.fn(() => Promise.resolve(mockHistory.data)),
  sendRiaMessage: (...args: any[]) => mockSendRia(...args),
}));

// Force the streaming path to fail with no usable tokens so the screen falls
// back to sendRiaMessage (the path that surfaces the 429 quota state).
jest.mock('@/api/ai', () => ({
  streamChat: (_payload: any, handlers: any) => {
    // Defer so the synchronous render completes first, then trigger fallback.
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

// Real-ish rate limit that always allows (so the send isn't blocked client-side).
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

// GestureDetector → passthrough; Gesture.Tap() → a chainable no-op stub. The
// composer's upgrade button is a CtaButton (plain Pressable), so it does NOT
// depend on this — but the typing dots / chips / send button do.
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

// react-query: real QueryClientProvider so useMutation/useQuery behave; history
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
  mockHistory.data = [];
  mockHistory.isLoading = false;
});

// ── Pure helpers ─────────────────────────────────────────────────────────────

describe('ai-coach quota helpers', () => {
  it('parseQuotaError recognises ONLY a 429 ai_quota_exceeded body', () => {
    const ok = parseQuotaError({ response: { status: 429, data: { error: 'ai_quota_exceeded', limit: 5, plan: 'free', resetsAt: '2099-01-02T00:00:00.000Z' } } });
    expect(ok).toEqual({ limit: 5, plan: 'free', resetsAt: '2099-01-02T00:00:00.000Z' });

    const pro = parseQuotaError({ response: { status: 429, data: { error: 'ai_quota_exceeded', limit: 20, plan: 'pro', resetsAt: 'x' } } });
    expect(pro).toEqual({ limit: 20, plan: 'pro', resetsAt: 'x' });

    // Not a quota error → null (so the caller shows a generic snag).
    expect(parseQuotaError({ response: { status: 500, data: {} } })).toBeNull();
    expect(parseQuotaError({ response: { status: 429, data: { error: 'too_many_requests' } } })).toBeNull();
    expect(parseQuotaError({ message: 'Network Error' })).toBeNull();
    expect(parseQuotaError(undefined)).toBeNull();
  });

  it('parseQuotaError falls back to the plan default when limit is absent/garbage', () => {
    expect(parseQuotaError({ response: { status: 429, data: { error: 'ai_quota_exceeded', plan: 'free' } } }))
      .toEqual({ limit: 5, plan: 'free', resetsAt: '' });
    expect(parseQuotaError({ response: { status: 429, data: { error: 'ai_quota_exceeded', plan: 'pro', limit: 'NaN' } } }))
      .toEqual({ limit: 20, plan: 'pro', resetsAt: '' });
  });

  it('remainingToday never goes negative', () => {
    expect(remainingToday(5, 0)).toBe(5);
    expect(remainingToday(5, 3)).toBe(2);
    expect(remainingToday(5, 5)).toBe(0);
    expect(remainingToday(5, 9)).toBe(0);
  });

  it('formatResetWindow renders a short window or a sensible fallback', () => {
    const now = new Date('2026-06-20T12:00:00.000Z');
    expect(formatResetWindow(new Date('2026-06-20T12:30:00.000Z').toISOString(), now)).toBe('in 30m');
    expect(formatResetWindow(new Date('2026-06-20T15:00:00.000Z').toISOString(), now)).toBe('in 3h');
    expect(formatResetWindow(new Date('2026-06-20T11:00:00.000Z').toISOString(), now)).toBe('soon');
    expect(formatResetWindow(null, now)).toBe('after midnight UTC');
  });

  it('utcDayKey is the UTC YYYY-MM-DD boundary', () => {
    expect(utcDayKey(new Date('2026-06-20T23:30:00.000Z'))).toBe('2026-06-20');
    expect(utcDayKey(new Date('2026-06-20T00:00:00.000Z'))).toBe('2026-06-20');
  });
});

// ── Screen: 429 → upgrade state ──────────────────────────────────────────────

describe('ai-coach screen — daily-quota 429 → upgrade state', () => {
  it('on a 429 ai_quota_exceeded shows the upgrade CTA and routes to /(modals)/premium', async () => {
    // Fallback send rejects with the exact chat-service 429 body.
    mockSendRia.mockRejectedValue({
      response: { status: 429, data: { error: 'ai_quota_exceeded', limit: 5, plan: 'free', resetsAt: '2099-01-02T00:00:00.000Z' } },
    });

    renderScreen();

    // Wait for the initial Ria greeting (history resolved empty → greeting).
    await waitFor(() => expect(screen.getByText(/I'm Ria/)).toBeTruthy());

    // Tap a quick-question chip → send → stream errors → fallback 429.
    fireEvent.press(screen.getByText('Why am I tired today?'));

    // The locked composer CTA + the inline upgrade card both appear.
    await waitFor(() => expect(screen.getByText('Daily AI limit reached — Upgrade')).toBeTruthy());
    expect(screen.getByText('Daily AI limit reached')).toBeTruthy();

    // Pressing the composer's upgrade CTA routes to the premium modal — only that.
    fireEvent.press(screen.getByText('Daily AI limit reached — Upgrade'));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/(modals)/premium'));
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush.mock.calls.every(([r]) => r === '/(modals)/premium')).toBe(true);
  });

  it('renders the "N left today" indicator once history is loaded', async () => {
    // Seed two user-authored messages dated today so the tally seeds to 2 → 3 left.
    const todayIso = new Date().toISOString();
    mockHistory.data = [
      { id: 'm1', sender: 'user', text: 'hey', isOwn: true, createdAt: todayIso, status: 'read' },
      { id: 'm2', sender: 'ai', text: 'hi', isOwn: false, createdAt: todayIso, status: 'read' },
      { id: 'm3', sender: 'user', text: 'again', isOwn: true, createdAt: todayIso, status: 'read' },
    ];

    renderScreen();

    // free default cap 5, used today 2 → 3 remaining. The redesigned pill is
    // value-dominant: the count ("3") and the word "LEFT" render in separate
    // <Text> nodes, so assert the count and the pill's accessibilityLabel
    // ("3 AI messages left today") rather than a combined string.
    await waitFor(() => expect(screen.getByText('3')).toBeTruthy());
    expect(screen.getByLabelText('3 AI messages left today')).toBeTruthy();
  });
});
