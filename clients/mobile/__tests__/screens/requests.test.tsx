/**
 * requests.test.tsx
 *
 * Screen-level coverage for the Aurora message-requests inbox —
 * `app/(community)/requests.tsx` (Instagram-DM-style incoming requests).
 *
 * That screen drives ONE query (['chat-requests'] via getMessageRequests) and
 * two optimistic mutations (acceptRequest / declineRequest), and renders three
 * distinct branches: a loading skeleton, an HONEST EMPTY state (no pending
 * requests), and an ERROR state whose retry is the coral `CtaButton` primitive
 * wired to the query's `refetch`. F1 built the screen but it had no screen-level
 * edge-state test. This suite pins the two states the hardening item calls out:
 *
 *   - EMPTY branch: getMessageRequests resolves `[]` → the screen shows the
 *     "No message requests" EmptyState and renders NO request rows and NO error
 *     copy (it does NOT offer a false action on an honest-empty inbox);
 *   - ERROR branch: the query is `isError` → the screen shows the
 *     "Couldn't load requests" surface whose "Try Again" CtaButton calls the
 *     query's `refetch` — and only that (the empty copy is absent).
 *
 * The 3 social migrations are UNAPPLIED / user-gated, so there is NO live-DB
 * dependency here: `@/api/community` is fully mocked and `@tanstack/react-query`
 * is stubbed so the screen never touches axios or the network.
 *
 * This file is intentionally DISJOINT from `__tests__/screens/community.test.tsx`
 * (which covers only CommunityFeedScreen and is not edited) — different screen,
 * different filename.
 *
 * Mock conventions mirror the sibling screen suites — the hoisted `mock`-prefixed
 * holder pattern of `community.test.tsx` (the `mock` prefix lets
 * babel-plugin-jest-hoist allow the hoisted factory to close over the holder) and
 * the real-EmptyState / real-CtaButton press pattern (both surface their label as
 * plain <Text>, so `fireEvent.press(getByText(...))` and a role/name query drive
 * their press). The `@/components/ui` barrel is left REAL so the assertions ride
 * on the actual EmptyState copy and CtaButton a11y.
 */

// ── jest.mock hoisting block (runs ABOVE the imports) ────────────────────────

// expo-router: benign no-op router — this suite asserts query/refetch wiring, not
// navigation. `back`/`push`/`replace` are inert spies.
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));

// Controlled state for the ['chat-requests'] query — each test mutates this
// holder BEFORE render() (the factory reads it at call-time). `refetch` is the
// spy the error branch's "Try Again" CtaButton must call.
type RequestsState = { data: any; isLoading: boolean; isError: boolean };
const mockRequests: RequestsState = { data: undefined, isLoading: false, isError: false };
const mockRefetch = jest.fn();

// The accept / decline mutation `mutate` spy. Both the accept and decline
// mutations resolve to this same spy — the empty/error branches render no rows,
// so it is never expected to fire; asserting it stays clean proves no row action
// leaked from those states. (`mock`-prefixed so the hoisted factory may close
// over it.)
const mockMutate = jest.fn();

// react-query: ['chat-requests'] reads the mutable holder above. useMutation
// hands back the shared mutate spy; useQueryClient exposes the
// setQueryData/getQueryData the optimistic removeRow path calls.
jest.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    const key = queryKey[0];
    if (key === 'chat-requests') {
      return {
        data: mockRequests.data,
        isLoading: mockRequests.isLoading,
        isError: mockRequests.isError,
        refetch: mockRefetch,
      };
    }
    return { data: undefined, isLoading: false, isError: false, refetch: jest.fn() };
  },
  useMutation: () => ({ mutate: mockMutate, isPending: false, isError: false, reset: jest.fn() }),
  useQueryClient: () => ({
    setQueryData: jest.fn(),
    getQueryData: jest.fn(),
    cancelQueries: jest.fn(),
    invalidateQueries: jest.fn(),
  }),
}));

// API module the screen statically imports — stub to plain jest.fns so axios
// (via @/api/client → @/api/chat) never loads. useQuery / useMutation are fully
// stubbed above, so these are never actually invoked; they only satisfy the
// import graph. `MessageRequest` is a type-only import (erased by Babel).
jest.mock('@/api/community', () => ({
  getMessageRequests: jest.fn(),
  acceptRequest: jest.fn(),
  declineRequest: jest.fn(),
}));

// Decorative glyphs → plain <Text> surfacing the icon name (mirrors the suite).
jest.mock('@expo/vector-icons', () => {
  const { Text: RNText } = require('react-native');
  return {
    Ionicons: ({ name }: { name?: string }) => <RNText>{`icon:${name ?? ''}`}</RNText>,
  };
});

// Deterministic insets so the screen lays out without the native provider.
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));

// expo-linear-gradient / expo-image ship native modules — passthrough so the
// CtaButton (error retry) and Avatar (rows) primitives mount on the jest renderer.
jest.mock('expo-linear-gradient', () => {
  const RN = require('react-native');
  return { LinearGradient: (props: any) => <RN.View {...props} /> };
});
jest.mock('expo-image', () => {
  const RN = require('react-native');
  return { Image: (props: any) => <RN.View {...props} /> };
});

// GlassCard wraps a SafeBlurView (expo-blur native). Replace SafeBlurView with a
// passthrough View so GlassCard (the empty/error/row surface) mounts cleanly and
// deterministically regardless of the Android<12 blur fallback branch.
jest.mock('@/components/SafeBlurView', () => {
  const RN = require('react-native');
  return { SafeBlurView: ({ children, ...props }: any) => <RN.View {...props}>{children}</RN.View> };
});

// ── Imports (run AFTER the hoisted mocks above) ──────────────────────────────
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
import MessageRequestsScreen from '../../app/(community)/requests';

function renderScreen() {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      <MessageRequestsScreen />
    </ThemeContext.Provider>,
  );
}

describe('MessageRequestsScreen', () => {
  beforeEach(() => {
    mockRequests.data = undefined;
    mockRequests.isLoading = false;
    mockRequests.isError = false;
    mockRefetch.mockClear();
    mockMutate.mockClear();
  });

  // ── (i) honest EMPTY state — getMessageRequests resolves [] ────────────────
  test('empty [] → "No message requests" EmptyState with no rows and no error copy', () => {
    mockRequests.data = [];

    renderScreen();

    // The honest zero-data copy is present…
    expect(screen.getByText('No message requests')).toBeTruthy();
    // …and the error copy is NOT (this is the empty branch, not the error one).
    expect(screen.queryByText("Couldn't load requests")).toBeNull();
    // An honest-empty inbox offers NO action button, so there is no Try Again /
    // Accept / Decline control on screen.
    expect(screen.queryByText('Try Again')).toBeNull();
    expect(screen.queryByText('Accept')).toBeNull();
    expect(screen.queryByText('Decline')).toBeNull();
  });

  // ── (ii) ERROR state — retry CtaButton calls refetch (and only that) ───────
  test('error → "Couldn\'t load requests" surface whose Try Again CtaButton calls refetch', () => {
    mockRequests.isError = true;

    renderScreen();

    // The connection-error copy is present (not the empty copy)…
    expect(screen.getByText("Couldn't load requests")).toBeTruthy();
    expect(screen.queryByText('No message requests')).toBeNull();

    // …and the retry control is the coral CtaButton (accessibilityRole "button",
    // a11y label "Retry loading your message requests"), wired to the query's
    // refetch — pressing it calls refetch exactly once.
    const retry = screen.getByRole('button', { name: 'Retry loading your message requests' });
    expect(retry).toBeTruthy();

    fireEvent.press(retry);
    expect(mockRefetch).toHaveBeenCalledTimes(1);

    // The error branch renders no rows, so no accept/decline mutation fires.
    expect(mockMutate).not.toHaveBeenCalled();
  });
});
