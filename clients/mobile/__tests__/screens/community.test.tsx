/**
 * community.test.tsx
 *
 * Screen-level coverage for the Aurora community feed — `app/(community)/index.tsx`.
 *
 * That screen drives TWO queries (['community-feed'] via getFeed, and
 * ['community-challenges'] via getChallenges), a like MUTATION (likePost), and
 * FOUR distinct router pushes (create-post modal, a per-post detail route, the
 * achievements screen, and the leaderboard screen) — yet had no screen-level
 * test. This suite pins the behaviour that matters so a refactor of the feed
 * surface can't silently regress it:
 *
 *   - ERROR branch: when the feed query is in error the screen shows the
 *     "Couldn't load the feed" EmptyState, and its "Try Again" CTA calls the
 *     feed query's refetch — and only that;
 *   - EMPTY branch: when the feed is `[]` the screen shows the "No posts yet"
 *     EmptyState, and its "Create a post" CTA pushes the create-post modal;
 *   - POPULATED branch: a real post renders; its like button calls
 *     likeMutation.mutate(postId) and its comment button pushes the per-post
 *     detail route '/(community)/<id>';
 *   - HEADER pushes: the Achievements / Leaderboard header buttons push their
 *     respective routes.
 *
 * Across the suite we observe >= 3 DISTINCT push targets
 * (/(modals)/create-post, /(community)/<postId>, /(community)/achievements,
 * /(community)/leaderboard), so the screen's navigation contract is locked.
 *
 * This file is intentionally distinct from `__tests__/api/community.test.ts`
 * (different directory — `screens/` vs `api/` — and a `.tsx` vs `.ts` suffix, so
 * there is no filename collision) which unit-tests the API client module rather
 * than the screen.
 *
 * Additive + verify-only: NEW test file only; the screen is untouched.
 *
 * Mock conventions mirror the sibling screen suites — the hoisted `mock`-prefixed
 * holder pattern of `__tests__/screens/shift-detail.test.tsx` (the `mock` prefix
 * lets babel-plugin-jest-hoist allow the hoisted factory to close over the
 * holder) and the real-`EmptyState`-press pattern of
 * `__tests__/screens/dashboard.errorStates.test.tsx` (the EmptyState's coral
 * Button surfaces its label as plain <Text>, so `fireEvent.press(getByText(...))`
 * drives its onAction).
 */

// ── jest.mock hoisting block (runs ABOVE the imports) ────────────────────────

// expo-router: `push` is a hoisted `mock`-prefixed holder so each test can
// assert exactly which route the screen navigated to (and tally distinct
// targets across the suite). `back`/`replace` are benign no-ops.
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
}));

// Controlled state for the ['community-feed'] query — each test drives the
// error / empty / populated branch by mutating this holder BEFORE render()
// (the factory reads it at call-time). `refetch` is the spy the error branch's
// "Try Again" must call.
type FeedState = {
  data: any;
  isLoading: boolean;
  isError: boolean;
};
const mockFeed: FeedState = {
  data: undefined,
  isLoading: false,
  isError: false,
};
const mockRefetch = jest.fn();

// Active-challenges strip: kept empty by default so the tests focus on the feed
// branches (an empty array makes the screen render no challenge cards — the
// strip is gated on `challenges && challenges.length > 0`). A test could mutate
// this, but none needs to.
const mockChallenges: any[] = [];

// The like mutation's `mutate` spy. The screen calls `likeMutation.mutate(post.id)`,
// so asserting on this with the post id proves the like wiring.
const mockLikeMutate = jest.fn();
// Captured so we could (defensively) assert the screen passed a mutationFn; the
// screen builds it from likePost(postId).
let capturedLikeMutationFn: ((postId: string) => unknown) | undefined;

// react-query: branch useQuery on queryKey[0]. ['community-feed'] reads the
// mutable holder above; ['community-challenges'] returns the challenges holder.
// useMutation returns the like spy and captures the passed mutationFn.
jest.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    const key = queryKey[0];
    if (key === 'community-feed') {
      return {
        data: mockFeed.data,
        isLoading: mockFeed.isLoading,
        isError: mockFeed.isError,
        refetch: mockRefetch,
      };
    }
    if (key === 'community-challenges') {
      return { data: mockChallenges, isLoading: false, isError: false, refetch: jest.fn() };
    }
    return { data: undefined, isLoading: false, isError: false, refetch: jest.fn() };
  },
  useMutation: ({ mutationFn }: { mutationFn?: (postId: string) => unknown } = {}) => {
    capturedLikeMutationFn = mutationFn;
    return { mutate: mockLikeMutate, isPending: false, isError: false, reset: jest.fn() };
  },
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

// API module the screen statically imports — stub to plain jest.fns so axios
// (via @/api/client) never loads. useQuery / useMutation are fully stubbed
// above, so these are never actually invoked; they only satisfy the import
// graph. `Post` is a type-only import (erased by Babel), so no runtime export
// is needed for it.
jest.mock('@/api/community', () => ({
  getFeed: jest.fn(),
  likePost: jest.fn(),
  getChallenges: jest.fn(),
}));

// Decorative glyphs → plain <Text> surfacing the icon name (mirrors the rest of
// the suite). Otherwise pulls in expo-font → expo-asset.
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

// expo-linear-gradient ships a native module; replace <LinearGradient> with a
// passthrough View so the screen's gradients (and the Card / Button primitives'
// gradient fills) mount on the jest renderer.
jest.mock('expo-linear-gradient', () => {
  const RN = require('react-native');
  return { LinearGradient: (props: any) => <RN.View {...props} /> };
});

// expo-image ships a native module; the post card's avatar / image only render
// for a populated post with a (trusted) URL — our fixtures omit URLs, so this is
// a defensive stub rendering nothing of substance.
jest.mock('expo-image', () => {
  const RN = require('react-native');
  return { Image: (props: any) => <RN.View {...props} /> };
});

// GlassCard (the post-card surface) wraps a SafeBlurView (expo-blur native).
// Replace SafeBlurView with a passthrough View — forwarding props and tagging it
// `glass-surface` — so the real GlassCard mounts deterministically (regardless of
// the Android<12 blur fallback branch) AND the test can grab the rendered glass
// surface to assert a post renders INSIDE it. Mirrors the sibling
// requests.test.tsx / community.feed.states.test.tsx convention.
jest.mock('@/components/SafeBlurView', () => {
  const RN = require('react-native');
  return {
    SafeBlurView: ({ children, ...props }: any) => (
      <RN.View testID="glass-surface" {...props}>{children}</RN.View>
    ),
  };
});

// imageUrl trust-gate is pure, but stub to a passthrough so the screen's
// safeImageUri() calls are deterministic regardless of the real allowlist.
jest.mock('@/lib/imageUrl', () => ({
  safeImageUri: (uri?: string | null) => uri ?? undefined,
}));

// date-fns: the post card formats createdAt via formatDistanceToNow — pin it to
// a constant so the rendered timestamp is deterministic and tz-agnostic.
jest.mock('date-fns', () => ({
  formatDistanceToNow: () => '1 hour',
}));

// ── Imports (run AFTER the hoisted mocks above) ──────────────────────────────
import React from 'react';
import { render, fireEvent, screen, within } from '@testing-library/react-native';
import {
  ThemeContext,
  getThemeColors,
  typography,
  spacing,
  borderRadius,
  shadows,
} from '@/theme';
import CommunityFeedScreen from '../../app/(community)/index';

function renderScreen() {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      <CommunityFeedScreen />
    </ThemeContext.Provider>,
  );
}

// A single populated post for the populated-branch cases. `userId` is required
// by the Post type; no image/avatar URL so the expo-image stub stays inert.
const POST = {
  id: 'p1',
  userId: 'u1',
  author: { name: 'Sam' },
  content: 'hi',
  createdAt: '2026-06-13T00:00:00.000Z',
  likes: 2,
  commentsCount: 1,
};

describe('CommunityFeedScreen', () => {
  beforeEach(() => {
    mockFeed.data = undefined;
    mockFeed.isLoading = false;
    mockFeed.isError = false;
    mockRefetch.mockClear();
    mockLikeMutate.mockClear();
    mockPush.mockClear();
    capturedLikeMutationFn = undefined;
  });

  // ── (i) feed error → retryable EmptyState wired to the feed refetch ────────
  test('feed error → "Couldn\'t load the feed" EmptyState whose Try Again calls refetch', () => {
    mockFeed.isError = true;

    renderScreen();

    // The connection-error copy is present (not the empty copy)…
    expect(screen.getByText("Couldn't load the feed")).toBeTruthy();
    expect(screen.queryByText('No posts yet')).toBeNull();

    // …and "Try Again" is wired to the feed query's refetch — and only that.
    fireEvent.press(screen.getByText('Try Again'));
    expect(mockRefetch).toHaveBeenCalledTimes(1);

    // The error branch renders no post + fires no like.
    expect(mockLikeMutate).not.toHaveBeenCalled();
  });

  // ── (ii) empty [] → honest empty EmptyState pushing the create-post modal ──
  test('empty [] → "No posts yet" EmptyState whose Create a post pushes the modal', () => {
    mockFeed.data = [];
    mockFeed.isError = false;

    renderScreen();

    // The honest zero-data copy is present (not the error copy)…
    expect(screen.getByText('No posts yet')).toBeTruthy();
    expect(screen.queryByText("Couldn't load the feed")).toBeNull();

    // …and its "Create a post" CTA navigates to the create-post modal route.
    fireEvent.press(screen.getByText('Create a post'));
    expect(mockPush).toHaveBeenCalledWith('/(modals)/create-post');
  });

  // ── (iii) populated → post renders; like + comment wiring ──────────────────
  test('populated → like button calls mutate(postId) and comment button pushes the post route', () => {
    mockFeed.data = [POST];

    renderScreen();

    // The post content + author render (proving the populated branch, not an
    // EmptyState, is on screen).
    expect(screen.getByText('hi')).toBeTruthy();
    expect(screen.getByText('Sam')).toBeTruthy();
    expect(screen.queryByText('No posts yet')).toBeNull();
    expect(screen.queryByText("Couldn't load the feed")).toBeNull();

    // …and the post card renders INSIDE the Aurora GlassCard surface — its body
    // copy + author both live within the single glass surface the loaded
    // single-post branch mounts (the skeletons only render while loading). This
    // pins the restyle: the inline Card was replaced by <GlassCard> without
    // moving the post content out of the card.
    const surface = screen.getByTestId('glass-surface');
    expect(within(surface).getByText('hi')).toBeTruthy();
    expect(within(surface).getByText('Sam')).toBeTruthy();

    // The like button (accessibilityLabel "Like post, <n> likes") calls the
    // like mutation with THIS post's id.
    fireEvent.press(screen.getByRole('button', { name: /Like post/ }));
    expect(mockLikeMutate).toHaveBeenCalledTimes(1);
    expect(mockLikeMutate).toHaveBeenCalledWith('p1');

    // The comment button (accessibilityLabel "Comment on post, <n> comments")
    // navigates to the per-post detail route.
    fireEvent.press(screen.getByRole('button', { name: /Comment on post/ }));
    expect(mockPush).toHaveBeenCalledWith('/(community)/p1');

    // Defensive: the screen handed react-query a real mutationFn (built from
    // likePost) — so the captured fn is callable.
    expect(typeof capturedLikeMutationFn).toBe('function');
  });

  // ── (iii-b) Aurora restyle: post card renders inside the GlassCard surface ──
  // Locks the restyle-only conversion of the feed post card from the inline
  // `<Card variant="glass">` to the Aurora `<GlassCard>` primitive (which owns
  // the radius + hairline + clip + Android<12 blur fallback): a loaded post's
  // body copy AND author must still render INSIDE the new glass surface, and the
  // like button must STILL wire likeMutation.mutate(postId). If a future edit
  // drops the GlassCard wrapper, moves the post content out of it, or unwires the
  // like handler, this test goes red.
  test('Aurora restyle: a loaded post renders inside the GlassCard surface and its like button still wires likeMutation.mutate', () => {
    mockFeed.data = [POST];

    renderScreen();

    // A GlassCard surface mounted for the loaded post (the skeleton surfaces only
    // render while loading, so in the single-post loaded branch there is exactly
    // one glass surface — the post card).
    const surface = screen.getByTestId('glass-surface');
    expect(surface).toBeTruthy();

    // The post's body copy + author render INSIDE that glass surface (the restyle
    // wrapped the same content, it did not relocate it).
    expect(within(surface).getByText('hi')).toBeTruthy();
    expect(within(surface).getByText('Sam')).toBeTruthy();

    // The like control still lives inside the glass surface and still drives the
    // like mutation with THIS post's id — the surface swap left the wiring intact.
    const likeBtn = within(surface).getByRole('button', { name: /Like post/ });
    fireEvent.press(likeBtn);
    expect(mockLikeMutate).toHaveBeenCalledTimes(1);
    expect(mockLikeMutate).toHaveBeenCalledWith('p1');
  });

  // ── (iv) header pushes → achievements + leaderboard ────────────────────────
  test('header buttons push the achievements and leaderboard routes', () => {
    // Branch is irrelevant for the header (it renders regardless); use the
    // populated branch so the screen is fully mounted.
    mockFeed.data = [POST];

    renderScreen();

    fireEvent.press(screen.getByRole('button', { name: 'Achievements' }));
    expect(mockPush).toHaveBeenCalledWith('/(community)/achievements');

    fireEvent.press(screen.getByRole('button', { name: 'Leaderboard' }));
    expect(mockPush).toHaveBeenCalledWith('/(community)/leaderboard');
  });

  // ── (v) >= 3 DISTINCT push targets observed across the screen ──────────────
  test('exposes at least 3 distinct navigation targets', () => {
    mockFeed.data = [POST];

    renderScreen();

    // Drive every distinct push the screen owns: comment (per-post detail),
    // create-post (the input row), achievements + leaderboard (header).
    fireEvent.press(screen.getByRole('button', { name: /Comment on post/ }));
    fireEvent.press(screen.getByRole('button', { name: 'Create a post' }));
    fireEvent.press(screen.getByRole('button', { name: 'Achievements' }));
    fireEvent.press(screen.getByRole('button', { name: 'Leaderboard' }));

    const targets = new Set(mockPush.mock.calls.map((c) => c[0]));
    expect(targets.size).toBeGreaterThanOrEqual(3);
    expect(targets).toContain('/(community)/p1');
    expect(targets).toContain('/(modals)/create-post');
    expect(targets).toContain('/(community)/achievements');
    expect(targets).toContain('/(community)/leaderboard');
  });
});
