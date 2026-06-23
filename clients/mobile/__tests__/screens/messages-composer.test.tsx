/**
 * messages-composer.test.tsx
 *
 * Screen-level coverage for the DM-thread composer — `app/messages/[id].tsx`
 * (the live 1:1 direct-message thread; NOT the Ria AI composer, which is the
 * already-hardened `(modals)/ai-coach.tsx` with its own suite). F-build wired the
 * optimistic send + request lifecycle, then hardened the Send affordance so the
 * `disabled` prop, the coral fill, AND the screen-reader state all derive from ONE
 * guard — but the screen had no test. This suite pins exactly that send-input
 * bound + honest a11y contract:
 *
 *   - DISABLED (empty / whitespace-only input): the Send control reports
 *     accessibilityState.disabled === true, carries the honest
 *     "Send message, disabled" label, and pressing it does NOT reach the send
 *     path (sendMessageOverSocket is never called — the trim guard in handleSend
 *     short-circuits and the disabled TouchableOpacity swallows the press);
 *   - ENABLED (valid trimmed text): the control flips to
 *     accessibilityState.disabled === false + the "Send message" label, and a
 *     single press dispatches EXACTLY ONE socket send with the trimmed text;
 *   - INPUT BOUND: the message TextInput enforces maxLength={4000} (the
 *     chat-service bound — asserted via the prop, not re-invented).
 *
 * The 3 social migrations are UNAPPLIED / user-gated, so there is NO live-DB or
 * network dependency: `@/api/chat` is fully mocked (so axios via @/api/client
 * never loads) and `@tanstack/react-query` is stubbed per-queryKey so the screen
 * never touches the network. The socket is a hand-rolled on/off/emit/disconnect
 * stub resolved synchronously so the composer's send path is live under jest.
 *
 * Mock conventions mirror the sibling chat-domain suites — the hoisted
 * `mock`-prefixed holder pattern of `requests.test.tsx` (the `mock` prefix lets
 * babel-plugin-jest-hoist allow the hoisted factory to close over the holder) and
 * the real-`@/components/ui` barrel with native leaves (SafeBlurView /
 * expo-linear-gradient / expo-image / vector-icons / reanimated / safe-area)
 * neutralised, so the assertions ride on the ACTUAL Send TouchableOpacity props
 * (accessibilityState / accessibilityLabel / disabled / maxLength).
 *
 * react-native-skills applied:
 *   - rendering-no-falsy-and: the composer renders its fill via a ternary-null
 *     (never `inputText && <…>`), so an empty-string input can't leak a raw value
 *     into the tree — this suite drives the empty/whitespace branch to prove the
 *     disabled fill renders cleanly.
 *   - a11y disabled-state: a disabled control must surface
 *     accessibilityState.disabled (and an honest label) — asserted in BOTH states.
 */

// ── jest.mock hoisting block (runs ABOVE the imports) ────────────────────────

// expo-router: a fixed conversationId param + an inert router (this suite asserts
// the send path + a11y, not navigation).
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'target-user-1' }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));

// Controlled state for the FOUR queries the screen drives, keyed by queryKey[0]:
//   ['conversation', targetId]  → resolves the conversation { id } (loaded, ok)
//   ['messages', conversationId] → the transcript rows (one peer row → non-empty)
//   ['conversations']            → [] ⇒ meta undefined ⇒ requestState 'accepted'
//                                  ⇒ composer ENABLED (not a pending request)
//   ['chat-requests']            → [] ⇒ I am not the recipient of a request
const mockConversation = { data: { id: 'conv-1' } as any, isLoading: false, isError: false };
const mockMessages = {
  data: [
    { id: 'm1', conversationId: 'conv-1', senderId: 'peer-1', text: 'hey there', createdAt: '2026-06-20T10:00:00.000Z', isOwn: false },
  ] as any[],
  isLoading: false,
  isError: false,
};

jest.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    const key = queryKey[0];
    if (key === 'conversation') {
      return { data: mockConversation.data, isLoading: mockConversation.isLoading, isError: mockConversation.isError, refetch: jest.fn() };
    }
    if (key === 'messages') {
      return { data: mockMessages.data, isLoading: mockMessages.isLoading, isError: mockMessages.isError, refetch: jest.fn() };
    }
    if (key === 'conversations') {
      return { data: [], isLoading: false, isError: false, refetch: jest.fn() };
    }
    if (key === 'chat-requests') {
      return { data: [], isLoading: false, isError: false, refetch: jest.fn() };
    }
    return { data: undefined, isLoading: false, isError: false, refetch: jest.fn() };
  },
  // The screen reads/writes the transcript cache directly (optimistic upsert).
  // getQueryData returns the current rows so the 10s failed-fallback timer in
  // doSend can find the temp row if it ever runs; setQueryData is a no-op spy.
  useQueryClient: () => ({
    getQueryData: () => mockMessages.data,
    setQueryData: jest.fn(),
    invalidateQueries: jest.fn(),
    cancelQueries: jest.fn(),
  }),
}));

// The chat API the screen statically imports. Fully stubbed so @/api/client
// (axios) never loads. `sendMessageOverSocket` / `emitTyping` are the spies the
// assertions ride on; `createSocketConnection` resolves a hand-rolled socket so
// the composer's send path is live. Type-only exports (ChatMessage / RequestState)
// are erased by Babel.
const mockSendOverSocket = jest.fn();
const mockEmitTyping = jest.fn();
// A minimal socket.io-shaped stub: on/off register-detach, emit/disconnect inert.
const mockSocket = {
  on: jest.fn(),
  off: jest.fn(),
  emit: jest.fn(),
  disconnect: jest.fn(),
};
jest.mock('@/api/chat', () => ({
  getMessages: jest.fn(() => Promise.resolve(mockMessages.data)),
  startConversation: jest.fn(() => Promise.resolve(mockConversation.data)),
  getConversations: jest.fn(() => Promise.resolve([])),
  getChatRequests: jest.fn(() => Promise.resolve([])),
  acceptChatRequest: jest.fn(() => Promise.resolve()),
  declineChatRequest: jest.fn(() => Promise.resolve()),
  markRead: jest.fn(() => Promise.resolve()),
  createSocketConnection: jest.fn(() => Promise.resolve(mockSocket)),
  sendMessageOverSocket: (...args: any[]) => mockSendOverSocket(...args),
  emitTyping: (...args: any[]) => mockEmitTyping(...args),
}));

jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'me-1', name: 'Sam Tester', email: 's@e.co' } }),
}));

// ChatBubble pulls its own internals; it is not under test here. A tiny stub that
// surfaces the row text keeps the transcript render cheap + deterministic.
jest.mock('@/components/chat/ChatBubble', () => {
  const { Text: RNText } = require('react-native');
  return { ChatBubble: ({ text }: { text: string }) => <RNText>{text}</RNText> };
});

// Decorative glyphs → plain <Text> surfacing the icon name (mirrors the suite).
jest.mock('@expo/vector-icons', () => {
  const { Text: RNText } = require('react-native');
  return { Ionicons: ({ name }: { name?: string }) => <RNText>{`icon:${name ?? ''}`}</RNText> };
});

// Deterministic insets so the screen lays out without the native provider.
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));

// expo-linear-gradient / expo-image ship native modules — passthrough so the
// Send coral fill + Avatar (header) primitives mount on the jest renderer.
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

// GlassCard (request banner) wraps a SafeBlurView (expo-blur native). Replace it
// with a passthrough View so any GlassCard surface mounts cleanly.
jest.mock('@/components/SafeBlurView', () => {
  const RN = require('react-native');
  return { SafeBlurView: ({ children, ...props }: any) => <RN.View {...props}>{children}</RN.View> };
});

// Stub reanimated to its shipped jest mock — the TypingRow dots are worklet-driven
// but not under test; this keeps the module-top hooks (useSharedValue etc.) inert.
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

// ── Imports (run AFTER the hoisted mocks above) ──────────────────────────────
import React from 'react';
import { render, fireEvent, screen, waitFor } from '@testing-library/react-native';
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
});

describe('messages/[id] — DM composer send bound + honest a11y', () => {
  // ── (i) maxLength bound — the chat-service cap, asserted via the prop ───────
  test('the message TextInput enforces maxLength={4000}', () => {
    renderScreen();
    const input = screen.getByPlaceholderText('Message…');
    expect(input.props.maxLength).toBe(4000);
  });

  // ── (ii) DISABLED state — empty input keeps Send disabled + honest a11y, and
  //         pressing it does NOT reach the socket send path ────────────────────
  test('empty input: Send is disabled (a11y) and pressing it does not send', () => {
    renderScreen();

    // With no text, the Send control is disabled and announces the honest label.
    const send = screen.getByRole('button', { name: 'Send message, disabled' });
    expect(send.props.accessibilityState?.disabled).toBe(true);

    // Pressing the disabled control is a no-op — the send path never fires.
    fireEvent.press(send);
    expect(mockSendOverSocket).not.toHaveBeenCalled();
  });

  // ── (iii) DISABLED state — whitespace-only input is treated as empty ────────
  test('whitespace-only input keeps Send disabled and does not send', () => {
    renderScreen();

    const input = screen.getByPlaceholderText('Message…');
    fireEvent.changeText(input, '    ');

    // The trim guard means whitespace never enables the affordance.
    const send = screen.getByRole('button', { name: 'Send message, disabled' });
    expect(send.props.accessibilityState?.disabled).toBe(true);

    fireEvent.press(send);
    expect(mockSendOverSocket).not.toHaveBeenCalled();
  });

  // ── (iv) ENABLED state — valid trimmed text enables Send + dispatches once ──
  test('valid text enables Send (a11y) and a press dispatches exactly one socket send', async () => {
    renderScreen();

    // The socket is created in an async effect; wait until it is registered so the
    // optimistic send path takes the socket branch (not the failed fallback).
    await waitFor(() => expect(mockSocket.on).toHaveBeenCalled());

    const input = screen.getByPlaceholderText('Message…');
    fireEvent.changeText(input, 'hello world');

    // Now the control reads ENABLED: honest label flips + accessibilityState clears.
    const send = screen.getByRole('button', { name: 'Send message' });
    expect(send.props.accessibilityState?.disabled).toBe(false);

    // One press → exactly one socket send carrying the conversationId + the text.
    fireEvent.press(send);
    await waitFor(() => expect(mockSendOverSocket).toHaveBeenCalledTimes(1));
    expect(mockSendOverSocket).toHaveBeenCalledWith(mockSocket, 'conv-1', 'hello world');
  });

  // ── (v) ENABLED state — leading/trailing whitespace is trimmed before send ──
  test('text with surrounding whitespace sends the TRIMMED string', async () => {
    renderScreen();
    await waitFor(() => expect(mockSocket.on).toHaveBeenCalled());

    const input = screen.getByPlaceholderText('Message…');
    fireEvent.changeText(input, '  hi coach  ');

    // Padding still enables the control (there is real content to send)…
    const send = screen.getByRole('button', { name: 'Send message' });
    expect(send.props.accessibilityState?.disabled).toBe(false);

    // …and the dispatched text is trimmed (the same guard handleSend applies).
    fireEvent.press(send);
    await waitFor(() => expect(mockSendOverSocket).toHaveBeenCalledTimes(1));
    expect(mockSendOverSocket).toHaveBeenCalledWith(mockSocket, 'conv-1', 'hi coach');
  });
});
