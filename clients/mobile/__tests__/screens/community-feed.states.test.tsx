/**
 * community-feed.states.test.tsx
 *
 * Honest-three-state coverage for the Aurora community feed —
 * `app/(community)/index.tsx`. This file OWNS the Active-Challenges strip's
 * loading / empty / error / populated states (the bare falsy-`&&` branch that
 * had no loading affordance) AND re-pins the FEED list's four states so the
 * coverage change can't silently regress either surface.
 *
 * It is DISJOINT from its siblings:
 *   - `community.test.tsx` targets the SAME screen but pins the feed
 *     error/empty/populated branches + the screen's navigation contract (it
 *     drives the challenges query as an empty array, so it never exercises the
 *     strip's loading/populated states — which is exactly the gap this file
 *     closes);
 *   - `community.feed.states.test.tsx` / `community-feed.robustness.test.tsx`
 *     target the SEPARATE `app/(tabs)/community.tsx` tab screen (optimistic-like
 *     lifecycle + refresh-in-flight guard) — a different file entirely.
 *
 * ── The challenges strip is a three-state ternary-null chain ─────────────────
 *   The strip (rendering-no-falsy-and: a ternary-null chain, never `{x && …}`)
 *   has THREE mutually exclusive branches:
 *     - Test 1 (challenges loading): while the ['community-challenges'] query is
 *       `isLoading`, the strip renders a horizontal row of challenge-card
 *       SKELETONS only — surfaced via its accessible "Loading challenges"
 *       progressbar handle — and NO fabricated challenge cards (no "SEE ALL",
 *       no challenge title) are in the tree.
 *     - Test 2 (challenges empty []): the strip is HONESTLY ABSENT — the
 *       "ACTIVE CHALLENGES" header, the "SEE ALL" control and any challenge card
 *       are all gone (a quietly-absent secondary strip, never fabricated cards).
 *     - Test 3 (challenges error): same honest absence as empty — a failed
 *       challenges query does NOT fabricate cards and does NOT strand a
 *       perpetual skeleton (the loading branch is guarded by `!challengesError`).
 *     - Test 4 (challenges populated): the REAL strip renders one card per
 *       challenge, each an accessibilityRole="button" with a descriptive label
 *       ("<title>, <n> participating"), plus the "SEE ALL" button — and the
 *       loading skeleton handle is gone. Pressing a card / SEE ALL navigates to
 *       the challenges route (proving the cards are wired, not decor).
 *
 * ── The FEED list keeps its existing four states ─────────────────────────────
 *     - Test 5 (feed loading): the PostItem-shaped skeleton scaffold renders and
 *       none of the empty / error / loaded copy is present, and there is NO bare
 *       full-screen <ActivityIndicator>.
 *     - Test 6 (feed error): the "Couldn't load the feed" EmptyState renders and
 *       its "Try Again" action RE-INVOKES the feed query's refetch exactly once.
 *     - Test 7 (feed empty): feed [] → the "No posts yet" EmptyState renders.
 *     - Test 8 (feed populated): a real post row renders (content + author) and
 *       neither edge-state copy is present.
 *
 * The challenges-strip states and the feed states are driven INDEPENDENTLY (the
 * react-query stub branches on queryKey[0]), so each test fixes exactly one
 * surface's branch and asserts the OTHER stays inert — proving the two
 * three-state machines don't bleed into each other.
 *
 * Mock conventions mirror `community.test.tsx` (the sibling suite for this exact
 * screen): hoisted `mock`-prefixed holders the react-query factory closes over,
 * `@/api/community` fully stubbed so the real axios client never loads,
 * decorative glyphs → plain <Text>, and the `@/components/ui` barrel kept REAL
 * (with `@/components/SafeBlurView` a passthrough) so the assertions ride on the
 * real EmptyState copy + the real Skeleton / GlassCard. Additive + behaviour-safe
 * — NEW test file paired with the challenges-strip three-state change.
 */

// ── jest.mock hoisting block (runs ABOVE the imports) ────────────────────────

// expo-router: `push` is a hoisted `mock`-prefixed holder so a test can assert
// exactly which route a control navigated to. `back`/`replace` are no-ops.
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
}));

// Controlled state for the ['community-feed'] query — each feed test mutates this
// holder BEFORE render() (the factory reads it at call-time). `refetch` is the
// spy the error branch's "Try Again" must re-invoke.
type FeedState = { data: any; isLoading: boolean; isError: boolean };
const mockFeed: FeedState = { data: undefined, isLoading: false, isError: false };
const mockRefetch = jest.fn();

// Controlled state for the ['community-challenges'] query — the surface UNDER
// TEST. Each challenges test sets loading / error / data here so the strip's
// three-state ternary-null chain (loading skeleton → real strip → null) is
// exercised independently of the feed.
type ChallengesState = { data: any; isLoading: boolean; isError: boolean };
const mockChallenges: ChallengesState = { data: undefined, isLoading: false, isError: false };

// The like mutation's `mutate` spy (the feed-populated test presses like). The
// optimistic lifecycle is owned by the tab-screen suites — here a plain spy is
// enough to prove this screen still wires likeMutation.mutate(post.id).
const mockLikeMutate = jest.fn();

// react-query: branch useQuery on queryKey[0] so the feed and challenges queries
// read their OWN holders independently. useMutation returns the like spy;
// useQueryClient exposes an inert invalidateQueries (awaited in onRefresh).
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
      return {
        data: mockChallenges.data,
        isLoading: mockChallenges.isLoading,
        isError: mockChallenges.isError,
        refetch: jest.fn(),
      };
    }
    return { data: undefined, isLoading: false, isError: false, refetch: jest.fn() };
  },
  useMutation: () => ({ mutate: mockLikeMutate, isPending: false, isError: false, reset: jest.fn() }),
  useQueryClient: () => ({ invalidateQueries: jest.fn(() => Promise.resolve()) }),
}));

// API module the screen statically imports — stub to plain jest.fns so axios
// (via @/api/client) never loads. useQuery / useMutation are fully stubbed
// above, so these are never actually invoked; they only satisfy the import
// graph. `Post` is a type-only import (erased by Babel), so no runtime export is
// needed for it.
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

// Deterministic insets so the screen lays out without the native provider.
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));

// expo-linear-gradient ships a native module; replace <LinearGradient> with a
// passthrough View so the EmptyState's primary Button gradient mounts on the
// jest renderer.
jest.mock('expo-linear-gradient', () => {
  const RN = require('react-native');
  return { LinearGradient: (props: any) => <RN.View {...props} /> };
});

// expo-status-bar renders nothing in the tree under test.
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

// expo-image ships a native module; the post card's avatar / image only render
// for a populated post with a URL — our fixtures omit URLs, so this is a
// defensive passthrough.
jest.mock('expo-image', () => {
  const RN = require('react-native');
  return { Image: (props: any) => <RN.View {...props} /> };
});

// GlassCard (the feed-card surface + skeleton placeholders) wraps a SafeBlurView
// (expo-blur native). Replace SafeBlurView with a passthrough View — forwarding
// props — so the real GlassCard mounts deterministically and its children + a11y
// props survive. Mirrors the sibling community.test.tsx convention.
jest.mock('@/components/SafeBlurView', () => {
  const RN = require('react-native');
  return { SafeBlurView: ({ children, ...props }: any) => <RN.View {...props}>{children}</RN.View> };
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
import { ActivityIndicator } from 'react-native';
import { render, fireEvent, screen } from '@testing-library/react-native';
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

// A single populated post for the feed-populated case. `userId` is required by
// the Post type; no image/avatar URL so the expo-image stub stays inert.
const POST = {
  id: 'p1',
  userId: 'u1',
  author: { name: 'Sam' },
  content: 'hello world',
  createdAt: '2026-06-13T00:00:00.000Z',
  likes: 2,
  commentsCount: 1,
};

// Two real challenges for the challenges-populated case. `participants` flows
// into each card's descriptive a11y label.
const CHALLENGES = [
  { id: 'c1', title: '10k Steps', description: 'Walk 10k a day', participants: 42 },
  { id: 'c2', title: 'Dry January', description: 'No alcohol', participants: 17 },
];

describe('CommunityFeedScreen — Active-Challenges strip three-state', () => {
  beforeEach(() => {
    mockFeed.data = undefined;
    mockFeed.isLoading = false;
    mockFeed.isError = false;
    mockChallenges.data = undefined;
    mockChallenges.isLoading = false;
    mockChallenges.isError = false;
    mockRefetch.mockClear();
    mockLikeMutate.mockClear();
    mockPush.mockClear();
  });

  // ── Test 1: challenges LOADING → skeleton row, no fabricated cards ──────────
  test('challenges loading → renders challenge skeleton(s) and NO fabricated challenge cards', () => {
    mockChallenges.isLoading = true;
    // Resolve the feed so the screen's OTHER surface is in a stable, non-loading
    // branch — isolating this assertion to the challenges strip.
    mockFeed.data = [POST];

    expect(() => renderScreen()).not.toThrow();

    // The loading strip surfaces its accessible "Loading challenges" progressbar
    // handle (a stable handle that rides on the skeleton row, not shimmer internals).
    expect(screen.getByLabelText('Loading challenges')).toBeTruthy();

    // …and it does NOT fabricate challenge content: no "SEE ALL" control and no
    // challenge title leak into the loading state.
    expect(screen.queryByText('SEE ALL')).toBeNull();
    expect(screen.queryByText('10k Steps')).toBeNull();
    expect(screen.queryByLabelText('See all challenges')).toBeNull();

    // The feed surface (the screen's other half) rendered its populated post,
    // proving the two surfaces are driven independently.
    expect(screen.getByText('hello world')).toBeTruthy();
  });

  // ── Test 2: challenges EMPTY [] → strip honestly absent ────────────────────
  test('challenges empty [] → the strip is honestly absent (no header, no SEE ALL, no fabricated cards)', () => {
    mockChallenges.data = [];
    mockFeed.data = [POST];

    renderScreen();

    // A quietly-absent secondary strip: the section header, the SEE ALL control
    // and the loading handle are ALL gone — nothing is fabricated to fill it.
    expect(screen.queryByText('ACTIVE CHALLENGES')).toBeNull();
    expect(screen.queryByText('SEE ALL')).toBeNull();
    expect(screen.queryByLabelText('See all challenges')).toBeNull();
    expect(screen.queryByLabelText('Loading challenges')).toBeNull();

    // The feed still renders (the empty challenges strip didn't take the feed down).
    expect(screen.getByText('hello world')).toBeTruthy();
  });

  // ── Test 3: challenges ERROR → strip honestly absent (no stranded skeleton) ─
  test('challenges error → the strip is honestly absent and does NOT strand a perpetual skeleton', () => {
    mockChallenges.isError = true;
    // A real query can briefly report isLoading AND isError together; the loading
    // branch is guarded by `!challengesError`, so an errored query must NOT leave
    // a perpetual "Loading challenges" skeleton on screen.
    mockChallenges.isLoading = true;
    mockFeed.data = [POST];

    renderScreen();

    // No fabricated cards, no header, and crucially NO stranded loading handle.
    expect(screen.queryByText('ACTIVE CHALLENGES')).toBeNull();
    expect(screen.queryByText('SEE ALL')).toBeNull();
    expect(screen.queryByLabelText('Loading challenges')).toBeNull();
    expect(screen.queryByText('10k Steps')).toBeNull();

    // The feed surface is unaffected by the challenges error.
    expect(screen.getByText('hello world')).toBeTruthy();
  });

  // ── Test 4: challenges POPULATED → real cards w/ accessible button labels ───
  test('challenges populated → real challenge cards as accessible buttons + SEE ALL, no loading handle', () => {
    mockChallenges.data = CHALLENGES;
    mockFeed.data = [POST];

    renderScreen();

    // The real strip renders: header + the SEE ALL control as an accessible button…
    expect(screen.getByText('ACTIVE CHALLENGES')).toBeTruthy();
    const seeAll = screen.getByRole('button', { name: 'See all challenges' });
    expect(seeAll).toBeTruthy();

    // …and one card per challenge, each an accessibilityRole="button" with a
    // descriptive "<title>, <n> participating" label (not fabricated — driven by
    // the fixture's title + participants).
    const card1 = screen.getByRole('button', { name: '10k Steps, 42 participating' });
    const card2 = screen.getByRole('button', { name: 'Dry January, 17 participating' });
    expect(card1).toBeTruthy();
    expect(card2).toBeTruthy();

    // The loading skeleton handle is gone now that the data resolved.
    expect(screen.queryByLabelText('Loading challenges')).toBeNull();

    // The cards + SEE ALL are WIRED (not decor): each navigates to the challenges
    // route, proving the populated strip is interactive.
    fireEvent.press(card1);
    expect(mockPush).toHaveBeenCalledWith('/(community)/challenges');
    fireEvent.press(seeAll);
    expect(mockPush).toHaveBeenCalledWith('/(community)/challenges');
  });
});

describe('CommunityFeedScreen — feed loading / error / empty / populated states', () => {
  beforeEach(() => {
    mockFeed.data = undefined;
    mockFeed.isLoading = false;
    mockFeed.isError = false;
    // Keep the challenges strip inert (empty → honestly absent) so these tests
    // isolate the FEED list branches.
    mockChallenges.data = [];
    mockChallenges.isLoading = false;
    mockChallenges.isError = false;
    mockRefetch.mockClear();
    mockLikeMutate.mockClear();
    mockPush.mockClear();
  });

  // ── Test 5: feed LOADING → PostItem skeleton scaffold, no bare spinner ──────
  test('feed loading → mounts the post skeleton scaffold with no empty/error/loaded copy and no bare spinner', () => {
    mockFeed.isLoading = true;

    expect(() => renderScreen()).not.toThrow();

    // None of the edge-state / loaded copy is present while the feed loads…
    expect(screen.queryByText('No posts yet')).toBeNull();
    expect(screen.queryByText("Couldn't load the feed")).toBeNull();
    expect(screen.queryByText('Try Again')).toBeNull();
    expect(screen.queryByText('hello world')).toBeNull();

    // …and the honest skeleton scaffold replaced any bare full-screen spinner:
    // no ActivityIndicator host anywhere in the feed loading state.
    expect(screen.UNSAFE_queryByType(ActivityIndicator)).toBeNull();

    // The header title renders in every branch — a sanity check the screen mounted.
    // (Crew is the re-skinned header title; "Your night-shift people" is its subtitle.)
    expect(screen.getByText('Crew')).toBeTruthy();
  });

  // ── Test 6: feed ERROR → retryable EmptyState re-invokes refetch ───────────
  test('feed error → "Couldn\'t load the feed" EmptyState whose Try Again re-invokes refetch exactly once', () => {
    mockFeed.isError = true;

    renderScreen();

    // The honest error copy is present and the empty / loaded copy is absent.
    expect(screen.getByText("Couldn't load the feed")).toBeTruthy();
    expect(screen.queryByText('No posts yet')).toBeNull();
    expect(screen.queryByText('hello world')).toBeNull();

    // The retry action (EmptyState's primary Button, "Try Again") re-invokes the
    // feed query — exactly once — and fires no like.
    fireEvent.press(screen.getByText('Try Again'));
    expect(mockRefetch).toHaveBeenCalledTimes(1);
    expect(mockLikeMutate).not.toHaveBeenCalled();
  });

  // ── Test 7: feed EMPTY [] → honest empty state ─────────────────────────────
  test('feed empty [] → "No posts yet" EmptyState and no post rows', () => {
    mockFeed.data = [];

    renderScreen();

    expect(screen.getByText('No posts yet')).toBeTruthy();
    expect(screen.queryByText("Couldn't load the feed")).toBeNull();
    expect(screen.queryByText('hello world')).toBeNull();
  });

  // ── Test 8: feed POPULATED → real post rows render ─────────────────────────
  test('feed populated → renders the real post content/author and neither edge-state copy', () => {
    mockFeed.data = [POST];

    renderScreen();

    // The post content + author render (proving the loaded branch, not an
    // EmptyState or the skeleton, is on screen).
    expect(screen.getByText('hello world')).toBeTruthy();
    expect(screen.getByText('Sam')).toBeTruthy();
    expect(screen.queryByText('No posts yet')).toBeNull();
    expect(screen.queryByText("Couldn't load the feed")).toBeNull();

    // The like button still wires the like toggle for THIS post (the coverage
    // change left the feed's PostItem wiring intact). The like is now a TOGGLE, so
    // it calls mutate({ postId, currentlyLiked }); this post is not pre-liked.
    fireEvent.press(screen.getByRole('button', { name: /Like post/ }));
    expect(mockLikeMutate).toHaveBeenCalledTimes(1);
    expect(mockLikeMutate).toHaveBeenCalledWith({ postId: 'p1', currentlyLiked: false });
  });
});
