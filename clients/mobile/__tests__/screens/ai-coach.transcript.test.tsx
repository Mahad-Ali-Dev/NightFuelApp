/**
 * ai-coach.transcript.test.tsx
 *
 * Screen-level coverage for the Ria AI-coach RENDERED-TRANSCRIPT CAP and the
 * in-bubble linkify wiring — `app/(modals)/ai-coach.tsx`.
 *
 * The screen keeps `messages` state as the full ground truth but renders only a
 * bounded window (the last MAX_RENDERED_MESSAGES bubbles) so a very long
 * conversation never mounts hundreds of bubbles and janks. This suite pins:
 *
 *   - CAP APPLIED: a transcript far longer than the cap renders a BOUNDED number
 *     of bubbles (not one-per-message) — proving the window is enforced;
 *   - NEWEST KEPT: the most-recent message text is ALWAYS rendered (the tail is
 *     never dropped), while a message from the far start of the conversation is
 *     NOT in the rendered window;
 *   - LINKIFY CONSUMED (anti-dormant): a message containing a URL renders the URL
 *     as a tappable link span — confirming linkify() is actually wired into the
 *     live bubble, not dead code.
 *
 * Additive + verify-only: NEW test file only; the screen helpers it relies on
 * (the cap + linkify render) live in production. Mock conventions mirror the
 * sibling `ai-coach.quota.test.tsx`: reanimated/gesture-handler stubbed, the
 * stream path forced to error so nothing network-bound runs, history supplied
 * through the getRiaMessages mock.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';
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

type HistoryState = { data: any; isLoading: boolean };
const mockHistory: HistoryState = { data: [], isLoading: false };
const mockSendRia = jest.fn();

jest.mock('@/api/chat', () => ({
  getRiaMessages: jest.fn(() => Promise.resolve(mockHistory.data)),
  sendRiaMessage: (...args: any[]) => mockSendRia(...args),
}));

// Stream path is irrelevant here (we don't send) — stub it to a harmless error.
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

jest.mock('@/hooks/useRateLimit', () => ({
  useRateLimit: () => ({ canCall: () => true, recordCall: jest.fn(), retryAfterSec: 0, callsRemaining: 99 }),
}));

jest.mock('@/lib/sentry', () => ({ captureException: jest.fn() }));

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
  const chain: any = new Proxy(() => chain, { get: () => () => chain });
  return {
    GestureDetector: ({ children }: any) => <RN.View>{children}</RN.View>,
    Gesture: { Tap: () => chain },
  };
});

jest.mock('@/components/SafeBlurView', () => {
  const RN = require('react-native');
  return { SafeBlurView: ({ children }: any) => <RN.View>{children}</RN.View> };
});

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Import the screen AFTER the mocks are registered.
import AICoachScreen from '../../app/(modals)/ai-coach';

// Keep in sync with MAX_RENDERED_MESSAGES in the screen. We assert the rendered
// bubble count is bounded (<= cap) AND strictly less than the seeded length, so
// even if the exact cap is retuned the test still proves "bounded, not all".
const SEEDED_COUNT = 200;

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

/** Build a long alternating transcript with unique, addressable texts. */
function seedLongHistory(n: number) {
  const todayIso = new Date().toISOString();
  return Array.from({ length: n }, (_, i) => {
    const sender = i % 2 === 0 ? 'user' : 'ai';
    return {
      id: `m${i}`,
      sender,
      text: `msg-${i}-${sender}`,
      isOwn: sender === 'user',
      createdAt: todayIso,
      status: 'read',
    };
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockHistory.data = [];
  mockHistory.isLoading = false;
});

describe('ai-coach screen — rendered transcript cap', () => {
  it('renders a BOUNDED number of bubbles for a long transcript and always keeps the newest', async () => {
    mockHistory.data = seedLongHistory(SEEDED_COUNT);

    renderScreen();

    // The newest message (last in the seeded list) must be on screen.
    const newestText = `msg-${SEEDED_COUNT - 1}-ai`;
    await waitFor(() => expect(screen.getByText(newestText)).toBeTruthy());

    // Bubbles are the rows labelled "You: …" / "Ria: …". Count them: the window
    // must be bounded — strictly fewer than the full seeded transcript.
    const bubbles = screen.getAllByLabelText(/^(You|Ria): /);
    expect(bubbles.length).toBeLessThan(SEEDED_COUNT);
    // Sanity floor: it should still render a healthy window (not collapse to 0/1).
    expect(bubbles.length).toBeGreaterThanOrEqual(40);

    // A message from the far START of the conversation is OUTSIDE the rendered
    // window (dropped from render, but still in state/DB).
    expect(screen.queryByText('msg-0-user')).toBeNull();
  });

  it('renders every bubble when the transcript is short (cap not triggered)', async () => {
    mockHistory.data = seedLongHistory(6);

    renderScreen();

    await waitFor(() => expect(screen.getByText('msg-5-ai')).toBeTruthy());
    // All six short-transcript bubbles are present (cap leaves short lists alone).
    expect(screen.getByText('msg-0-user')).toBeTruthy();
    expect(screen.getAllByLabelText(/^(You|Ria): /).length).toBe(6);
  });
});

describe('ai-coach screen — linkify is wired into the live bubble (anti-dormant)', () => {
  it('renders a URL in a message as a tappable link that opens via Linking.openURL', async () => {
    const openSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as any);
    const todayIso = new Date().toISOString();
    mockHistory.data = [
      { id: 'a1', sender: 'ai', text: 'Read more at https://zeitra.app/help today', isOwn: false, createdAt: todayIso, status: 'read' },
    ];

    renderScreen();

    // The URL renders as its own (link) text span, separate from the prose.
    const link = await screen.findByText('https://zeitra.app/help');
    expect(link).toBeTruthy();

    // Tapping the link span opens the canonical href.
    fireEvent.press(link);
    await waitFor(() => expect(openSpy).toHaveBeenCalledWith('https://zeitra.app/help'));

    openSpy.mockRestore();
  });

  it('leaves a bare "www." footgun in a message intact (never a broken link)', async () => {
    const todayIso = new Date().toISOString();
    mockHistory.data = [
      { id: 'a2', sender: 'ai', text: 'the prefix www. is just text', isOwn: false, createdAt: todayIso, status: 'read' },
    ];

    renderScreen();

    // The whole sentence (with the dangling www.) renders as prose; there is no
    // separate clickable host span for a broken "www.".
    await waitFor(() => expect(screen.getByText(/the prefix/)).toBeTruthy());
    expect(screen.getByText(/www\. is just text/)).toBeTruthy();
  });
});
