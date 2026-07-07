/**
 * community-feed.robustness.test.tsx
 *
 * Robustness coverage for the Aurora community TAB feed —
 * `app/(tabs)/community.tsx` (the live "Feed" tab registered in
 * `app/(tabs)/_layout.tsx`). This file is DISJOINT from its sibling suites and
 * owns the refetch/refresh-in-flight + interactive-row-a11y guarantees:
 *
 *   - `community.feed.states.test.tsx` owns the loading / error / empty / loaded
 *     branches + the OPTIMISTIC-like lifecycle (instant bump / rollback / reconcile);
 *   - `community.test.tsx` targets the SEPARATE `(community)/index.tsx` sub-screen;
 *   - THIS file pins the parts those don't:
 *       (1) pull-to-refresh is GUARDED — a pull while a fetch is already in flight
 *           (`isFetching`) issues NO second getFeed (refetch is NOT re-invoked);
 *           and the inverse control — a pull when idle DOES refetch exactly once;
 *       (2) a FAILED feed surfaces a retry (the "Couldn't load the feed"
 *           EmptyState) whose action refetches EXACTLY once;
 *       (3) the interactive row controls (like / comment / open-profile) expose
 *           `accessibilityRole="button"` with STATE-ACCURATE labels reflecting
 *           their counts (and the like control carries `accessibilityState.selected`);
 *       (4) a zero-count + empty-media post renders with NO raw `0` / `''` outside
 *           a <Text> — i.e. render() does not throw (the `imageUrl` guard is a
 *           ternary-null, not a falsy `&&`, and every count lives inside <Text>).
 *
 * The tab is NOT pagination-based: it fetches a single page via getFeed(20) with
 * pull-to-refresh (no useInfiniteQuery / next-page query), so the robustness gap
 * is refresh-in-flight + a11y, NOT pagination — which is what this suite asserts.
 *
 * ── Why the react-query stub here is SIMPLER than the states suite's ──────────
 *   The optimistic like lifecycle is already proven in `community.feed.states`.
 *   This suite does NOT re-drive that — it needs only to (a) flip the feed query's
 *   `isFetching` / `isError` flags to exercise the guard + retry, and (b) render a
 *   populated post to read its a11y. So `useQuery` reads a mutable holder
 *   (including `isFetching`), `useMutation` is a benign `mutate` spy, and
 *   `useQueryClient` exposes inert cache spies. `@/api/community` is fully mocked
 *   so the real axios client never loads. The `@/components/ui` barrel + the real
 *   GlassCard / EmptyState are kept REAL (SafeBlurService → passthrough) so the
 *   assertions ride on the actual EmptyState copy and real surfaces — mirroring
 *   the sibling suites. Social/like migrations are unapplied, so everything stays
 *   mocked (no live DB).
 *
 * Additive + behaviour-safe: NEW test file paired with the refetch-in-flight
 * guard + a11y change to app/(tabs)/community.tsx. (community)/index.tsx untouched.
 */

// ── jest.mock hoisting block (runs ABOVE the imports) ────────────────────────

// expo-router: `push` is a hoisted `mock`-prefixed holder so a test can assert
// the open-profile / comment controls navigate. `back`/`replace` are no-ops.
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
}));

// Controlled state for the ['community-feed'] query — each test mutates this
// holder BEFORE render() (the factory reads it at call-time). `isFetching` is the
// react-query ground truth the refresh guard reads; `refetch` is the spy that
// both the guard test (must NOT be re-invoked mid-flight) and the retry test
// (must be invoked exactly once) assert on.
type FeedState = { data: any; isLoading: boolean; isError: boolean; isFetching: boolean };
const mockFeed: FeedState = { data: undefined, isLoading: false, isError: false, isFetching: false };
const mockRefetch = jest.fn(() => Promise.resolve({ data: mockFeed.data }));

// Active-challenges strip kept empty so the tests focus on the feed (the strip is
// gated on `challenges && challenges.length > 0`).
const mockChallenges: any[] = [];

// The like mutation's `mutate` spy — the screen calls likeMutation.mutate(post.id).
// This suite does not drive the optimistic lifecycle (the states suite does), so a
// plain spy suffices; recording it lets the a11y test stay focused on the label.
const mockLikeMutate = jest.fn();

// react-query: branch useQuery on queryKey[0]. ['community-feed'] reads the mutable
// holder (incl. `isFetching`) + the shared refetch spy; ['community-challenges'] is
// inert. useMutation returns the like spy. useQueryClient exposes inert cache spies
// (invalidateQueries is awaited inside onRefresh's Promise.all, so it resolves).
jest.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    const key = queryKey[0];
    if (key === 'community-feed') {
      return {
        data: mockFeed.data,
        isLoading: mockFeed.isLoading,
        isError: mockFeed.isError,
        isFetching: mockFeed.isFetching,
        refetch: mockRefetch,
      };
    }
    if (key === 'community-challenges') {
      return { data: mockChallenges, isLoading: false, isError: false, isFetching: false, refetch: jest.fn() };
    }
    return { data: undefined, isLoading: false, isError: false, isFetching: false, refetch: jest.fn() };
  },
  useMutation: () => ({ mutate: mockLikeMutate, isPending: false, isError: false, reset: jest.fn() }),
  useQueryClient: () => ({
    invalidateQueries: jest.fn(() => Promise.resolve()),
    cancelQueries: jest.fn(() => Promise.resolve()),
    getQueryData: jest.fn(),
    setQueryData: jest.fn(),
  }),
}));

// API module the screen statically imports — stub to plain jest.fns so axios (via
// @/api/client) never loads. useQuery / useMutation are stubbed above, so these are
// never actually invoked; they only satisfy the import graph. `Post` is a type-only
// import (erased by Babel), so no runtime export is needed.
jest.mock('@/api/community', () => ({
  getFeed: jest.fn(),
  likePost: jest.fn(),
  getChallenges: jest.fn(),
}));

// Decorative glyphs → plain <Text> surfacing the icon name (mirrors the suite).
jest.mock('@expo/vector-icons', () => {
  const { Text: RNText } = require('react-native');
  return {
    Ionicons: ({ name }: { name?: string }) => <RNText>{`icon:${name ?? ''}`}</RNText>,
  };
});

// useAuth → the re-skinned "Crew" header reads the current user for its profile
// avatar. Mock the hook directly (mirrors profile.errorStates.test.tsx) so the
// real authStore (→ expo-secure-store + the axios auth client) never loads.
jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'me', name: 'Test User', avatarUrl: null } }),
}));

// Deterministic insets so the screen lays out without the native provider.
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));

// expo-linear-gradient ships a native module — passthrough View so the screen's
// gradient (and the EmptyState's primary Button gradient) mount on the jest renderer.
jest.mock('expo-linear-gradient', () => {
  const RN = require('react-native');
  return { LinearGradient: (props: any) => <RN.View {...props} /> };
});

// expo-status-bar renders nothing in the tree under test.
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

// expo-image ships a native module — passthrough View. The zero-state robustness
// test drives an EMPTY-string imageUrl: the source's `post.imageUrl ? <Image/> : null`
// ternary yields null (no Image), so this stub stays inert there; a real imageUrl
// would mount it as a plain View.
jest.mock('expo-image', () => {
  const RN = require('react-native');
  return { Image: (props: any) => <RN.View {...props} /> };
});

// GlassCard wraps a SafeBlurView (expo-blur native). Replace SafeBlurView with a
// passthrough View — forwarding props — so the real GlassCard (the feed-card
// surface) mounts cleanly and its children + a11y props survive.
jest.mock('@/components/SafeBlurView', () => {
  const RN = require('react-native');
  return { SafeBlurView: ({ children, ...props }: any) => <RN.View {...props}>{children}</RN.View> };
});

// date-fns: pin formatDistanceToNow so the rendered timestamp is deterministic.
jest.mock('date-fns', () => ({
  formatDistanceToNow: () => '1 hour',
}));

// ── Imports (run AFTER the hoisted mocks above) ──────────────────────────────
import React from 'react';
import { RefreshControl } from 'react-native';
import { render, fireEvent, screen, act } from '@testing-library/react-native';
import {
  ThemeContext,
  getThemeColors,
  typography,
  spacing,
  borderRadius,
  shadows,
} from '@/theme';
import CommunityTab from '../../app/(tabs)/community';

function renderScreen() {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      <CommunityTab />
    </ThemeContext.Provider>,
  );
}

// Invoke the wired pull-to-refresh handler: grab the RefreshControl host the
// ScrollView mounts and call its real `onRefresh` prop (the screen's guarded
// `onRefresh`). Wrapped in act + flushed so the setRefreshing(true)/finally
// state updates settle inside the act boundary (no "not wrapped in act" warning).
async function pullToRefresh() {
  const rc = screen.UNSAFE_getByType(RefreshControl);
  await act(async () => {
    rc.props.onRefresh();
    // Drain the onRefresh microtask chain (Promise.all → finally setRefreshing).
    for (let i = 0; i < 4; i++) await Promise.resolve();
  });
}

// A single populated post for the a11y case. `userId` is required by the Post type;
// no image/avatar URL so the expo-image stub stays inert. likes=2, commentsCount=3
// are BOTH plural so the state-accurate label reads "…2 likes" / "…3 comments".
const POST = {
  id: 'p1',
  userId: 'u1',
  author: { id: 'a1', name: 'Sam' },
  content: 'hello world',
  createdAt: '2026-06-13T00:00:00.000Z',
  likes: 2,
  commentsCount: 3,
};

describe('CommunityTab — refetch/refresh-in-flight guard + interactive-row a11y', () => {
  beforeEach(() => {
    mockFeed.data = undefined;
    mockFeed.isLoading = false;
    mockFeed.isError = false;
    mockFeed.isFetching = false;
    mockRefetch.mockClear();
    mockRefetch.mockImplementation(() => Promise.resolve({ data: mockFeed.data }));
    mockLikeMutate.mockClear();
    mockPush.mockClear();
  });

  // ── (1a) GUARD: a pull while a fetch is in flight issues NO second fetch ────
  // With the feed query already `isFetching` (a refetch in flight), the guarded
  // onRefresh must early-return — refetch is NOT re-invoked, so no overlapping
  // getFeed is stacked.
  test('refresh while a fetch is already in flight does NOT issue a second fetch', async () => {
    mockFeed.data = [POST];
    mockFeed.isFetching = true; // a fetch is already running

    renderScreen();

    await pullToRefresh();

    // The guard short-circuited: the in-flight fetch was NOT joined by a second one.
    expect(mockRefetch).not.toHaveBeenCalled();
  });

  // ── (1b) CONTROL: a pull when idle DOES refetch exactly once ───────────────
  // The inverse of (1a) proves the guard is a true in-flight gate, not a blanket
  // disable: when nothing is in flight, one pull issues exactly one refetch.
  test('refresh when idle issues exactly one fetch', async () => {
    mockFeed.data = [POST];
    mockFeed.isFetching = false; // nothing in flight

    renderScreen();

    await pullToRefresh();

    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  // ── (1c) GUARD (re-entrancy): a pull DURING an in-progress refresh is a no-op ─
  // Distinct from (1a): there react-query's `isFetching` is already true; here it
  // is FALSE and the in-flight window is owned by the screen's LOCAL `refreshing`
  // flag. We hold the first refetch pending, let React flush the
  // `setRefreshing(true)` re-render (so the RefreshControl now carries the
  // post-update `onRefresh` closure that reads `refreshing===true`), then fire a
  // SECOND pull — which the local flag must short-circuit. Net: one fetch despite
  // two gestures, proving the guard also covers the local-flag window, not just
  // the react-query one.
  test('a pull fired during an in-progress refresh is guarded by the local flag (still one fetch)', async () => {
    mockFeed.data = [POST];
    mockFeed.isFetching = false; // the in-flight window is the LOCAL `refreshing` flag, not react-query's
    // Hold the first refetch pending so `refreshing` stays true across pull #2.
    let resolveRefetch: () => void = () => {};
    mockRefetch.mockImplementation(() => new Promise<{ data: any }>((res) => { resolveRefetch = () => res({ data: mockFeed.data }); }));

    renderScreen();

    // Pull #1 → guard passes (idle) → setRefreshing(true) → refetch (pending).
    await act(async () => {
      screen.UNSAFE_getByType(RefreshControl).props.onRefresh();
      // Let React flush the setRefreshing(true) re-render so the RefreshControl's
      // onRefresh prop is rebuilt against `refreshing===true`.
      await Promise.resolve();
    });
    expect(mockRefetch).toHaveBeenCalledTimes(1);

    // Pull #2 — re-grab the (rebuilt) RefreshControl handle so we invoke the
    // current onRefresh closure (the one that now sees refreshing===true). The
    // guard early-returns → no second refetch.
    await act(async () => {
      screen.UNSAFE_getByType(RefreshControl).props.onRefresh();
      await Promise.resolve();
    });
    expect(mockRefetch).toHaveBeenCalledTimes(1);

    // Drain: settle pull #1 so its finally{ setRefreshing(false) } runs inside act.
    await act(async () => {
      resolveRefetch();
      for (let i = 0; i < 4; i++) await Promise.resolve();
    });
  });

  // ── (2) ERROR → retry refetches EXACTLY once ───────────────────────────────
  // A failed feed load surfaces the honest "Couldn't load the feed" EmptyState
  // (not a blank "No posts yet"), and its "Try Again" action refetches once.
  test('a failed feed surfaces a retry that refetches exactly once', () => {
    mockFeed.isError = true;

    renderScreen();

    // Honest error copy present; the empty / loaded copy absent.
    expect(screen.getByText("Couldn't load the feed")).toBeTruthy();
    expect(screen.queryByText('No posts yet')).toBeNull();
    expect(screen.queryByText('hello world')).toBeNull();

    // The retry action (EmptyState primary Button, "Try Again") refetches once.
    fireEvent.press(screen.getByText('Try Again'));
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  // ── (3) A11Y: like / comment / open controls are state-accurate buttons ────
  // Each interactive row control exposes accessibilityRole="button" with a label
  // reflecting its count; the like control additionally carries accessibilityState
  // so a screen reader announces the toggle state. Counts here are plural (2 / 3).
  test('like / comment / open-profile controls expose role="button" with state-accurate labels', () => {
    mockFeed.data = [POST];

    renderScreen();

    // Like — role button, count-accurate label, AND a selected state (the toggle
    // ground truth, currently false since the feed Post has no per-viewer flag).
    const likeBtn = screen.getByRole('button', { name: 'Like, 2 likes' });
    expect(likeBtn).toBeTruthy();
    expect(likeBtn.props.accessibilityState).toEqual(expect.objectContaining({ selected: false }));

    // Comment — role button, count-accurate label.
    expect(screen.getByRole('button', { name: 'Comment, 3 comments' })).toBeTruthy();

    // Open profile — role button, identity-accurate label; pressing it navigates
    // to the author's profile route (proving the "open" control is wired, not decor).
    const openBtn = screen.getByRole('button', { name: "View Sam's profile" });
    expect(openBtn).toBeTruthy();
    fireEvent.press(openBtn);
    expect(mockPush).toHaveBeenCalledWith('/(community)/userProfile?userId=a1');

    // The like control still drives the like mutation with THIS post's id.
    fireEvent.press(likeBtn);
    expect(mockLikeMutate).toHaveBeenCalledWith('p1');

    // And the comment control navigates to the per-post detail route.
    fireEvent.press(screen.getByRole('button', { name: 'Comment, 3 comments' }));
    expect(mockPush).toHaveBeenCalledWith('/(community)/p1');
  });

  // ── (3b) A11Y: labels are SINGULAR at count===1 (state-accurate) ───────────
  // The labels pluralize off the count via a ternary, so a single like / comment
  // reads "1 like" / "1 comment" — not the ungrammatical "1 likes". Pins the
  // count===1 branch of the state-accurate label.
  test('like / comment labels read singular at a count of 1', () => {
    mockFeed.data = [{ ...POST, likes: 1, commentsCount: 1 }];

    renderScreen();

    expect(screen.getByRole('button', { name: 'Like, 1 like' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Comment, 1 comment' })).toBeTruthy();
    // And the plural forms are NOT used at count 1.
    expect(screen.queryByRole('button', { name: 'Like, 1 likes' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Comment, 1 comments' })).toBeNull();
  });

  // ── (4) NO raw 0 / '' rendered outside <Text> ──────────────────────────────
  // A post with zero counts AND an EMPTY-string content + imageUrl is the exact
  // shape that trips the falsy-`&&` crash (`post.imageUrl && <Image/>` would try
  // to render '' as a raw <View> child). The source uses a ternary-null for the
  // image and renders every count INSIDE <Text>, so render() must NOT throw and
  // the zero counts must surface (inside their Text nodes) as "0".
  test('a zero-count, empty-media post renders with no raw 0/"" outside <Text> (no crash)', () => {
    mockFeed.data = [{ ...POST, content: '', imageUrl: '', likes: 0, commentsCount: 0 }];

    // The crash this guards against throws AT render — so a clean render is the
    // assertion that no falsy primitive leaked outside a <Text>.
    expect(() => renderScreen()).not.toThrow();

    // The zero counts render as state-accurate plural labels ("0 likes" / "0
    // comments"), proving the counts live inside their <Text> a11y handles and the
    // post mounted (it's not an EmptyState — the feed is non-empty).
    expect(screen.getByRole('button', { name: 'Like, 0 likes' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Comment, 0 comments' })).toBeTruthy();

    // The empty-media post is NOT misread as a zero-data feed — the "No posts yet"
    // empty state is absent because the feed array is non-empty.
    expect(screen.queryByText('No posts yet')).toBeNull();
  });
});
