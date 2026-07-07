/**
 * community.counts.test.tsx
 *
 * Counter-robustness coverage for the Aurora community TAB feed —
 * `app/(tabs)/community.tsx` (the live "Feed" tab). This file is DISJOINT from
 * its sibling suites and owns ONE guarantee: the rendered like / comment /
 * challenge-participant COUNTERS are clamped through the module-scope `safeCount`
 * helper, so a missing / NaN / negative count — from an in-flight optimistic
 * write or a partial backend payload — surfaces as `0` and NEVER leaks
 * 'NaN' / 'undefined' / a negative number into a row (and never crashes it):
 *
 *   - `community.feed.states.test.tsx` owns the loading / error / empty / loaded
 *     branches + the OPTIMISTIC-like lifecycle (instant bump / rollback / reconcile);
 *   - `community-feed.robustness.test.tsx` owns the refresh-in-flight guard,
 *     interactive-row a11y, and the VALID zero-count (`likes: 0`) no-crash case;
 *   - `community.test.tsx` targets the SEPARATE `(community)/index.tsx` sub-screen;
 *   - THIS file pins what those don't: an INVALID counter (undefined / NaN / -3)
 *     renders '0' (both the visible <Text> AND the screen-reader label that
 *     pluralizes off it), the row does not crash, a VALID counter renders
 *     identically, the challenge strip's `participants` is clamped the same way,
 *     and a normal optimistic like on a valid post still increments (proving the
 *     clamp did not break the real increment path).
 *
 * The counters live INSIDE <Text> and the image guard is a ternary-null, so the
 * crash this pins against is the raw-falsy-outside-<Text> leak
 * (rendering-no-falsy-and) combined with a NaN/undefined/negative slipping
 * through — `safeCount` floors a valid positive and clamps everything else to 0.
 * `safeCount` is module-scope (hoisted), NOT a per-row closure, so the memoized
 * PostItem / challenge-card callbacks keep stable identity (list-performance-callbacks).
 *
 * ── Why the react-query stub here is STATEFUL ────────────────────────────────
 *   Most cases only SET the feed holder + assert synchronously, but the final
 *   optimistic-increment case needs a genuine cache round-trip (onMutate bumps the
 *   cached `likes`, the render re-reads it). So — mirroring
 *   `community.feed.states.test.tsx` — `useQuery(['community-feed'])` reads a
 *   mutable holder + registers a re-render subscriber, `useMutation(opts)` runs the
 *   REAL onMutate/onError/onSettled lifecycle against that holder, and
 *   `useQueryClient` is the cache API over the same holder. `@/api/community` is
 *   fully mocked so the real axios client never loads; the `@/components/ui` barrel
 *   + the real GlassCard are kept REAL (SafeBlurView → passthrough) so the
 *   assertions ride on the real surfaces + a11y. Social/like migrations are
 *   unapplied, so everything stays mocked (no live DB).
 *
 * Additive + behaviour-safe: NEW test file paired with the hoisted finite/clamp
 * guard on the like & comment (& participant) counters in app/(tabs)/community.tsx.
 * Cites react-native-skills: rendering-no-falsy-and, list-performance-callbacks.
 */

// ── jest.mock hoisting block (runs ABOVE the imports) ────────────────────────

// expo-router: `push` is a hoisted `mock`-prefixed holder so a test can assert
// the comment control navigates. `back`/`replace` are benign no-ops.
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
}));

// Controlled state for the ['community-feed'] query — each test mutates this
// holder BEFORE render() (the factory reads it at call-time). It is ALSO the
// backing store the stateful query client reads/writes, so the optimistic
// onMutate bump lands here and re-renders the feed.
type FeedState = { data: any; isLoading: boolean; isError: boolean };
const mockFeed: FeedState = { data: undefined, isLoading: false, isError: false };
const mockRefetch = jest.fn();

// Re-render fan-out: each mounted `useQuery` registers a force-update dispatch
// here; the stateful client calls `mockNotify()` after a cache write so the feed
// re-reads `mockFeed.data` (the optimistic bump becomes visible). Harmless for
// the synchronous clamp cases — they render once and never trigger a write.
const mockListeners = new Set<() => void>();
const mockNotify = () => {
  mockListeners.forEach((fn) => fn());
};

// Active-challenges strip — driven per-test. The strip is gated on
// `challenges && challenges.length > 0`, so an empty array hides it (the
// PostItem-counter cases set it empty; the participants case populates it).
let mockChallenges: any[] = [];

// The like mutation's `mutate` spy — proves the like wiring passes THIS post's id.
const mockLikeMutate = jest.fn();

// The like API call the mutationFn invokes — defaults to a resolved success so
// the optimistic-increment case settles cleanly.
const mockLikePost = jest.fn((..._args: any[]) => Promise.resolve(true));

// react-query: a STATEFUL stub (mirrors community.feed.states.test.tsx).
// `useQuery(['community-feed'])` reads the mutable holder + registers a re-render
// subscriber; `useMutation(opts)` runs the real onMutate/onError/onSettled
// lifecycle against the holder (so the optimistic bump actually happens);
// `useQueryClient` is the cache API over that same holder. Branching on
// queryKey[0] keeps the challenges query inert (it reads the strip array directly).
jest.mock('@tanstack/react-query', () => {
  const React = require('react');

  const getFeedData = () => mockFeed.data;
  const setFeedData = (updater: any) => {
    mockFeed.data = typeof updater === 'function' ? updater(mockFeed.data) : updater;
    mockNotify();
  };

  const queryClient = {
    cancelQueries: jest.fn(() => Promise.resolve()),
    getQueryData: (key: readonly unknown[]) => (key[0] === 'community-feed' ? getFeedData() : undefined),
    setQueryData: (key: readonly unknown[], updater: any) => {
      if (key[0] === 'community-feed') setFeedData(updater);
    },
    invalidateQueries: jest.fn(() => {
      mockNotify();
      return Promise.resolve();
    }),
  };

  return {
    useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
      const [, forceTick] = React.useReducer((x: number) => x + 1, 0);
      React.useEffect(() => {
        mockListeners.add(forceTick);
        return () => {
          mockListeners.delete(forceTick);
        };
      }, []);

      const key = queryKey[0];
      if (key === 'community-feed') {
        return {
          data: mockFeed.data,
          isLoading: mockFeed.isLoading,
          isError: mockFeed.isError,
          isFetching: false,
          refetch: mockRefetch,
        };
      }
      if (key === 'community-challenges') {
        return { data: mockChallenges, isLoading: false, isError: false, isFetching: false, refetch: jest.fn() };
      }
      return { data: undefined, isLoading: false, isError: false, isFetching: false, refetch: jest.fn() };
    },
    useMutation: (opts: any) => {
      const mutate = (variables: any) => {
        mockLikeMutate(variables);
        Promise.resolve()
          .then(() => opts?.onMutate?.(variables))
          .then((ctx: any) =>
            Promise.resolve()
              .then(() => opts?.mutationFn?.(variables))
              .then(
                (data: any) => {
                  opts?.onSuccess?.(data, variables, ctx);
                  opts?.onSettled?.(data, null, variables, ctx);
                },
                (err: any) => {
                  opts?.onError?.(err, variables, ctx);
                  opts?.onSettled?.(undefined, err, variables, ctx);
                },
              ),
          );
      };
      return { mutate, isPending: false, isError: false, reset: jest.fn() };
    },
    useQueryClient: () => queryClient,
  };
});

// API module the screen statically imports — stub so axios (via @/api/client)
// never loads. `likePost` delegates to the mutable spy; getFeed / getChallenges
// are never invoked (useQuery is stubbed) and only satisfy the import graph.
// `Post` is a type-only import (erased by Babel), so no runtime export is needed.
jest.mock('@/api/community', () => ({
  getFeed: jest.fn(),
  likePost: (...args: any[]) => mockLikePost(...args),
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
// gradient (and the EmptyState's primary Button gradient) mount on the renderer.
jest.mock('expo-linear-gradient', () => {
  const RN = require('react-native');
  return { LinearGradient: (props: any) => <RN.View {...props} /> };
});

// expo-status-bar renders nothing in the tree under test.
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

// expo-image ships a native module — passthrough View. The counter fixtures omit
// image/avatar URLs (the source's `post.imageUrl ? <Image/> : null` ternary
// yields null), so this stub stays inert.
jest.mock('expo-image', () => {
  const RN = require('react-native');
  return { Image: (props: any) => <RN.View {...props} /> };
});

// GlassCard wraps a SafeBlurView (expo-blur native). Replace SafeBlurView with a
// passthrough View — forwarding props — so the real GlassCard (the feed-card +
// challenge-card surfaces) mounts cleanly and its children + a11y props survive.
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
import { render, fireEvent, screen, act, within } from '@testing-library/react-native';
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

// Drain the optimistic mutation's microtask chain (onMutate → mutationFn →
// onSuccess → onSettled). The stateful useMutation stub runs the lifecycle across
// several `.then` hops; awaiting a few microtask ticks settles every resulting
// React state update INSIDE the surrounding act() (silences the act warning).
const flushMicrotasks = async () => {
  for (let i = 0; i < 6; i++) {
    await Promise.resolve();
  }
};

// A single populated post. `userId` is required by the Post type; no image/avatar
// URL so the expo-image stub stays inert. Counts are overridden per-test.
const POST = {
  id: 'p1',
  userId: 'u1',
  author: { id: 'a1', name: 'Sam' },
  content: 'hello world',
  createdAt: '2026-06-13T00:00:00.000Z',
  likes: 2,
  commentsCount: 3,
};

// The exact like-counter <Text> node: the heart control's value Text renders just
// the clamped number (the a11y label "Like, <n> likes" lives on the wrapping
// TouchableOpacity). We resolve it via the like button's accessible label and read
// the numeric Text inside it, so we assert the VISIBLE counter, not the label.
function likeButton() {
  return screen.getByRole('button', { name: /^Like,/ });
}
function commentButton() {
  return screen.getByRole('button', { name: /^Comment,/ });
}

describe('CommunityTab — counter clamp (safeCount): missing / NaN / negative → 0', () => {
  beforeEach(() => {
    mockFeed.data = undefined;
    mockFeed.isLoading = false;
    mockFeed.isError = false;
    mockChallenges = [];
    mockListeners.clear();
    mockRefetch.mockClear();
    mockLikeMutate.mockClear();
    mockLikePost.mockClear();
    mockLikePost.mockImplementation(() => Promise.resolve(true));
    mockPush.mockClear();
  });

  // ── (1) INVALID like counts (undefined / NaN / -3) render '0', no crash ─────
  // Each value is the exact shape that would otherwise leak 'undefined' / 'NaN' /
  // a negative into the heart row. safeCount clamps every one to 0: the visible
  // <Text> reads '0' and the a11y label reads "Like, 0 likes" (the label
  // pluralizes off the SAME clamped value). render() must not throw.
  test.each([
    ['undefined', undefined],
    ['NaN', NaN],
    ['-3', -3],
  ])('an invalid like count (%s) renders 0 and never crashes the row', (_label, badValue) => {
    mockFeed.data = [{ ...POST, likes: badValue, commentsCount: 3 }];

    expect(() => renderScreen()).not.toThrow();

    // The like control exists, carries the clamped a11y label, and its visible
    // counter reads exactly '0' — never 'NaN' / 'undefined' / '-3'.
    const like = likeButton();
    expect(like.props.accessibilityLabel).toBe('Like, 0 likes');
    expect(within(like).getByText('0')).toBeTruthy();

    // The raw bad value never appears anywhere in the tree.
    expect(screen.queryByText('NaN')).toBeNull();
    expect(screen.queryByText('undefined')).toBeNull();
    expect(screen.queryByText('-3')).toBeNull();

    // It is the loaded post (the comment count is valid), NOT an EmptyState.
    expect(screen.getByText('hello world')).toBeTruthy();
    expect(screen.queryByText('No posts yet')).toBeNull();
  });

  // ── (2) INVALID comment counts (undefined / NaN / -3) render '0', no crash ──
  // Same guard on the comment counter. The like count is valid here so the only
  // clamped node is the comment one.
  test.each([
    ['undefined', undefined],
    ['NaN', NaN],
    ['-3', -3],
  ])('an invalid comment count (%s) renders 0 and never crashes the row', (_label, badValue) => {
    mockFeed.data = [{ ...POST, likes: 2, commentsCount: badValue }];

    expect(() => renderScreen()).not.toThrow();

    const comment = commentButton();
    expect(comment.props.accessibilityLabel).toBe('Comment, 0 comments');
    expect(within(comment).getByText('0')).toBeTruthy();

    expect(screen.queryByText('NaN')).toBeNull();
    expect(screen.queryByText('undefined')).toBeNull();
    expect(screen.queryByText('-3')).toBeNull();

    expect(screen.getByText('hello world')).toBeTruthy();
  });

  // ── (3) BOTH counters invalid at once → both clamp to 0, still no crash ─────
  // A partial payload could drop BOTH counts; the row must still render with two
  // '0' counters and accurate labels.
  test('a row with BOTH like and comment counts invalid renders 0/0 and does not crash', () => {
    mockFeed.data = [{ ...POST, likes: NaN, commentsCount: undefined }];

    expect(() => renderScreen()).not.toThrow();

    expect(likeButton().props.accessibilityLabel).toBe('Like, 0 likes');
    expect(commentButton().props.accessibilityLabel).toBe('Comment, 0 comments');
    // Two clamped '0' counters in the action row (one heart, one comment).
    expect(within(likeButton()).getByText('0')).toBeTruthy();
    expect(within(commentButton()).getByText('0')).toBeTruthy();
  });

  // ── (4) VALID counts render IDENTICALLY (clamp is a no-op on good data) ─────
  // safeCount floors a positive and passes it through, so a valid post is
  // unchanged: counts render verbatim and the labels pluralize correctly. Pins
  // that the guard did NOT alter the happy path.
  test('valid like / comment counts render identically (clamp is a no-op on good data)', () => {
    mockFeed.data = [{ ...POST, likes: 5, commentsCount: 1 }];

    renderScreen();

    // Visible counters render verbatim.
    expect(within(likeButton()).getByText('5')).toBeTruthy();
    expect(within(commentButton()).getByText('1')).toBeTruthy();

    // Labels are state-accurate (plural for 5, SINGULAR for 1).
    expect(likeButton().props.accessibilityLabel).toBe('Like, 5 likes');
    expect(commentButton().props.accessibilityLabel).toBe('Comment, 1 comment');
  });

  // ── (5) Challenge strip: invalid `participants` clamps to 0 the same way ────
  // The strip renders "{safeCount(chall.participants)} in" with the same value
  // echoed in the card's a11y label ("… participating"). A NaN participant count
  // surfaces as "0 in" — never "NaN in" — and the strip mounts.
  test('challenge strip clamps an invalid participants count to 0 (visible text + label)', () => {
    // Feed empty so the strip is the only counter source under test here.
    mockFeed.data = [];
    mockChallenges = [{ id: 'c1', title: 'Step Challenge', description: '', participants: NaN }];

    expect(() => renderScreen()).not.toThrow();

    // Visible strip caption is clamped ('{n} in'), not 'NaN in'.
    expect(screen.getByText('0 in')).toBeTruthy();
    expect(screen.queryByText('NaN in')).toBeNull();

    // The card's a11y label echoes the SAME clamped value ('… participating').
    expect(screen.getByRole('button', { name: 'Step Challenge, 0 participating' })).toBeTruthy();
  });

  // ── (5b) Challenge strip: VALID participants render identically ─────────────
  test('challenge strip renders a valid participants count identically', () => {
    mockFeed.data = [];
    mockChallenges = [{ id: 'c1', title: 'Step Challenge', description: '', participants: 42 }];

    renderScreen();

    expect(screen.getByText('42 in')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Step Challenge, 42 participating' })).toBeTruthy();
  });

  // ── (6) A normal optimistic like on a VALID post still increments ───────────
  // The clamp guards the RENDER only — it must not break the real increment path.
  // Pressing like on a valid post (likes: 2) optimistically bumps the cached count
  // to 3, and the clamped render reflects 2 → 3. Proves safeCount(post.likes) is
  // transparent to a valid optimistic write (Math.floor(3) === 3).
  test('a normal optimistic like on a valid post still increments (2 → 3)', async () => {
    // Hold the network call pending so the only count change comes from the
    // OPTIMISTIC onMutate write, never a settled response.
    mockLikePost.mockImplementation(() => new Promise(() => {}));
    mockFeed.data = [{ ...POST, likes: 2, commentsCount: 3 }];

    renderScreen();

    // Ground truth before the tap.
    expect(within(likeButton()).getByText('2')).toBeTruthy();
    expect(likeButton().props.accessibilityLabel).toBe('Like, 2 likes');

    // Tap the heart — onMutate bumps the cache; flush the microtasks the stub runs
    // the lifecycle on (the request stays pending, so onSettled never fires).
    await act(async () => {
      fireEvent.press(likeButton());
      await flushMicrotasks();
    });

    // The clamped render reflects the optimistic +1: 3, both visibly and in the
    // label — and the mutation was driven with THIS post's id.
    expect(within(likeButton()).getByText('3')).toBeTruthy();
    expect(likeButton().props.accessibilityLabel).toBe('Like, 3 likes');
    expect(mockLikeMutate).toHaveBeenCalledTimes(1);
    expect(mockLikeMutate).toHaveBeenCalledWith('p1');
  });
});
