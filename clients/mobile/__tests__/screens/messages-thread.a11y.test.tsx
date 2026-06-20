/**
 * messages-thread.a11y.test.tsx
 *
 * Screen-level ACCESSIBILITY coverage for the unified chat thread —
 * `app/messages/[id].tsx` (the live 1:1 / Coach-Ria thread). The sibling
 * `messages-composer.test.tsx` pins the Send-affordance + a11y contract while
 * STUBBING <ChatBubble>; this suite is its complement — it mounts the REAL
 * <ChatBubble> and the REAL `@/components/ui` barrel so it can lock the three
 * a11y guarantees this work-item adds to the transcript itself:
 *
 *   1. SPEAKER-QUALIFIED BUBBLE LABELS — each rendered bubble body carries a
 *      `${speaker}: ${text}` accessibilityLabel so a screen reader can attribute
 *      every line: own rows announce "You: …"; peer rows announce
 *      "<peer displayName>: …" (the AI thread's "Coach Ria: …" when the peer is
 *      Ria). renderMessage derives `speaker = isMe ? 'You' : (peerName ?? 'Coach Ria')`.
 *
 *   2. GUARDED TIMESTAMP — the bubble time is produced by the hoisted
 *      `formatBubbleTime`, which returns '' for a missing/malformed ISO string. A
 *      row with a garbage `createdAt` must therefore render a BLANK timestamp and
 *      the literal "Invalid Date" must NEVER appear anywhere in the tree.
 *
 *   3. EMPTY-THREAD AFFORDANCE — zero messages renders the existing real
 *      `@/components/ui` <EmptyState> ("No messages yet" + a start-conversation
 *      subtitle), not a fabricated row.
 *
 * The 3 social migrations are UNAPPLIED / user-gated, so there is NO live-DB or
 * network dependency: `@/api/chat` is fully mocked (so axios via @/api/client
 * never loads) and `@tanstack/react-query` is stubbed per-queryKey so the screen
 * never touches the network. Mutable holders (`mock`-prefixed so
 * babel-plugin-jest-hoist allows the hoisted factory to close over them) let each
 * test drive the transcript + peer identity.
 *
 * Mock conventions mirror messages-composer.test.tsx, with TWO deliberate
 * differences: this suite does NOT stub <ChatBubble> (it asserts the real bubble
 * labels) and does NOT stub `@/components/ui` (it asserts the real EmptyState).
 * Only native leaves are neutralised (expo-linear-gradient / expo-image /
 * vector-icons / status-bar / SafeBlurView / reanimated / safe-area).
 *
 * react-native-skills exercised by the code under test:
 *   - js-hoist-intl: `formatBubbleTime` is hoisted to module scope (one helper,
 *     not a per-render formatter) and GUARDS NaN dates → '' (asserted here).
 *   - rendering-no-falsy-and: the empty-thread branch is a ternary-null
 *     (`!messages || length === 0 ? <EmptyState/> : <FlatList/>`), never
 *     `messages.length && <…>`, so a 0-length list can't leak a raw 0 — this
 *     suite drives that branch.
 *   - list-performance-inline-objects: the speaker label is passed to the
 *     memoized bubble as a single primitive string (no inline object), asserted
 *     indirectly via the rendered label.
 */

// ── jest.mock hoisting block (runs ABOVE the imports) ────────────────────────

// expo-router: a fixed conversationId param + an inert router.
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'target-user-1' }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));

// Mutable holders the per-queryKey useQuery stub reads. `mock`-prefixed so the
// hoisted jest.mock factory may close over them.
const mockConversation = { id: 'conv-1' };
// The peer entry for ['conversations'] — its displayName becomes the speaker name
// for peer bubbles ("Coach Ria: …"). Mutable so a test can clear it.
let mockConversationsData: any[] = [
  { id: 'conv-1', requestState: 'accepted', peer: { userId: 'ria-1', displayName: 'Coach Ria', avatarUrl: null } },
];
// The transcript rows. Mutable so each test sets its own (incl. an empty thread
// and a malformed-createdAt row).
let mockMessagesData: any[] = [];

jest.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    const key = queryKey[0];
    if (key === 'conversation') {
      return { data: mockConversation, isLoading: false, isError: false, refetch: jest.fn() };
    }
    if (key === 'messages') {
      return { data: mockMessagesData, isLoading: false, isError: false, refetch: jest.fn() };
    }
    if (key === 'conversations') {
      return { data: mockConversationsData, isLoading: false, isError: false, refetch: jest.fn() };
    }
    if (key === 'chat-requests') {
      return { data: [], isLoading: false, isError: false, refetch: jest.fn() };
    }
    return { data: undefined, isLoading: false, isError: false, refetch: jest.fn() };
  },
  useQueryClient: () => ({
    getQueryData: () => mockMessagesData,
    setQueryData: jest.fn(),
    invalidateQueries: jest.fn(),
    cancelQueries: jest.fn(),
  }),
}));

// The chat API the screen statically imports — fully stubbed so @/api/client
// (axios) never loads. createSocketConnection resolves a minimal socket stub.
const mockSocket = { on: jest.fn(), off: jest.fn(), emit: jest.fn(), disconnect: jest.fn() };
jest.mock('@/api/chat', () => ({
  getMessages: jest.fn(() => Promise.resolve(mockMessagesData)),
  startConversation: jest.fn(() => Promise.resolve(mockConversation)),
  getConversations: jest.fn(() => Promise.resolve(mockConversationsData)),
  getChatRequests: jest.fn(() => Promise.resolve([])),
  acceptChatRequest: jest.fn(() => Promise.resolve()),
  declineChatRequest: jest.fn(() => Promise.resolve()),
  markRead: jest.fn(() => Promise.resolve()),
  createSocketConnection: jest.fn(() => Promise.resolve(mockSocket)),
  sendMessageOverSocket: jest.fn(),
  emitTyping: jest.fn(),
}));

jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'me-1', name: 'Sam Tester', email: 's@e.co' } }),
}));

// Decorative glyphs → plain <Text> surfacing the icon name. The REAL EmptyState +
// ChatBubble render Ionicons; this keeps them assertable + skips the font loader.
jest.mock('@expo/vector-icons', () => {
  const { Text: RNText } = require('react-native');
  return { Ionicons: ({ name }: { name?: string }) => <RNText>{`icon:${name ?? ''}`}</RNText> };
});

// Deterministic insets so the screen lays out without the native provider.
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));

// expo-linear-gradient / expo-image ship native modules — passthrough so the
// bubble coral fill, Avatar, EmptyState CTA, and Send fill mount on jest.
jest.mock('expo-linear-gradient', () => {
  const RN = require('react-native');
  return { LinearGradient: (props: any) => <RN.View {...props} /> };
});
jest.mock('expo-image', () => {
  const RN = require('react-native');
  return { Image: (props: any) => <RN.View {...props} /> };
});

// expo-status-bar ships a native module — passthrough no-op.
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

// GlassCard (request banner) wraps a SafeBlurView (expo-blur native) — passthrough.
jest.mock('@/components/SafeBlurView', () => {
  const RN = require('react-native');
  return { SafeBlurView: ({ children, ...props }: any) => <RN.View {...props}>{children}</RN.View> };
});

// Stub reanimated to its shipped jest mock — the TypingRow dots are worklet-driven
// but not under test; this keeps the module-top hooks (useSharedValue etc.) inert.
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

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
import UnifiedChatScreen from '../../app/messages/[id]';

function renderScreen() {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      <UnifiedChatScreen />
    </ThemeContext.Provider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  // Restore the default peer (Coach Ria) before every test.
  mockConversationsData = [
    { id: 'conv-1', requestState: 'accepted', peer: { userId: 'ria-1', displayName: 'Coach Ria', avatarUrl: null } },
  ];
  mockMessagesData = [];
});

describe('messages/[id] — thread a11y (speaker labels · guarded timestamp · empty state)', () => {
  // ── (i) speaker-qualified bubble labels — "You: …" vs "Coach Ria: …" ─────────
  test('each bubble carries a speaker-qualified accessibility label', () => {
    mockMessagesData = [
      { id: 'm1', conversationId: 'conv-1', senderId: 'ria-1', text: 'How are you today?', createdAt: '2026-06-20T10:00:00.000Z', isOwn: false },
      { id: 'm2', conversationId: 'conv-1', senderId: 'me-1', text: 'Doing great, thanks!', createdAt: '2026-06-20T10:01:00.000Z', isOwn: true },
    ];
    renderScreen();

    // Peer row → "<peer displayName>: …" (the AI thread's "Coach Ria: …").
    expect(screen.getByLabelText('Coach Ria: How are you today?')).toBeTruthy();
    // Own row → "You: …".
    expect(screen.getByLabelText('You: Doing great, thanks!')).toBeTruthy();
    // The visible message text still renders.
    expect(screen.getByText('How are you today?')).toBeTruthy();
    expect(screen.getByText('Doing great, thanks!')).toBeTruthy();
  });

  test('peer label falls back to "Coach Ria" when the conversation has no peer meta', () => {
    // No conversations meta ⇒ peerName undefined ⇒ the screen falls back to the
    // honest default speaker name for the AI thread.
    mockConversationsData = [];
    mockMessagesData = [
      { id: 'm1', conversationId: 'conv-1', senderId: 'ria-1', text: 'Fallback hi', createdAt: '2026-06-20T10:00:00.000Z', isOwn: false },
    ];
    renderScreen();

    expect(screen.getByLabelText('Coach Ria: Fallback hi')).toBeTruthy();
  });

  // ── (ii) guarded timestamp — malformed createdAt never yields 'Invalid Date' ──
  test('a malformed createdAt renders a blank timestamp, never "Invalid Date"', () => {
    mockMessagesData = [
      { id: 'm1', conversationId: 'conv-1', senderId: 'ria-1', text: 'garbage time row', createdAt: 'not-a-real-date', isOwn: false },
      { id: 'm2', conversationId: 'conv-1', senderId: 'me-1', text: 'empty time row', createdAt: '', isOwn: true },
    ];
    renderScreen();

    // The hoisted formatBubbleTime guard collapses NaN/empty ISO → '' so the
    // literal 'Invalid Date' (what `new Date('x').toLocaleTimeString()` would
    // otherwise produce) appears NOWHERE in the tree.
    expect(screen.queryByText('Invalid Date')).toBeNull();
    // The rows themselves still render (the bad timestamp degrades to blank, it
    // does not drop the message) and stay speaker-attributed.
    expect(screen.getByText('garbage time row')).toBeTruthy();
    expect(screen.getByText('empty time row')).toBeTruthy();
    expect(screen.getByLabelText('Coach Ria: garbage time row')).toBeTruthy();
    expect(screen.getByLabelText('You: empty time row')).toBeTruthy();
  });

  test('a VALID createdAt still renders a non-empty time (the guard only catches bad input)', () => {
    mockMessagesData = [
      { id: 'm1', conversationId: 'conv-1', senderId: 'me-1', text: 'on time', createdAt: '2026-06-20T13:37:00.000Z', isOwn: true },
    ];
    renderScreen();
    expect(screen.queryByText('Invalid Date')).toBeNull();
    // Sanity: a real ISO produces a short HH:MM time containing a colon. We don't
    // pin the exact locale string (CI tz-agnostic) — only that a real time shows.
    expect(screen.getByText(/\d{1,2}:\d{2}/)).toBeTruthy();
  });

  // ── (iii) empty thread → the real start-conversation EmptyState ──────────────
  test('zero messages renders the real EmptyState start-conversation affordance', () => {
    mockMessagesData = [];
    renderScreen();

    // The honest empty state from `@/components/ui` (not a fabricated row).
    expect(screen.getByText('No messages yet')).toBeTruthy();
    expect(screen.getByText('Say hello — your first message starts the conversation.')).toBeTruthy();
    // No bubble labels exist when the thread is empty.
    expect(screen.queryByLabelText(/^You: /)).toBeNull();
    expect(screen.queryByLabelText(/^Coach Ria: /)).toBeNull();
  });
});
