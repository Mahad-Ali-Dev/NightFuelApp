/**
 * community.feed.states.test.tsx
 *
 * Screen-level coverage for the FOUR load-bearing states of the Aurora community
 * TAB feed — `app/(tabs)/community.tsx` (the primary Community tab: challenge
 * strip + create-post row + the post feed). This file owns the spinner-debt
 * burn-down for THAT screen specifically and is DISJOINT from:
 *   - `community.test.tsx`, which targets the `(community)/index.tsx` sub-screen;
 *   - `challenges.states.test.tsx` / `leaderboard.states.test.tsx` (item 4),
 *     which own `(community)/challenges.tsx` + `(community)/leaderboard.tsx`.
 * (NOTE for sequencing: if a sibling later claims `(tabs)/community.tsx`, fold
 * this coverage into item 4 instead — but as of this change the tab screen has
 * no other owner.)
 *
 * The tab screen drives the ['community-feed'] query (getFeed) and renders four
 * mutually exclusive branches inside its feed column:
 *
 *   - Test A (loading): while the feed query is `isLoading`, the screen mounts
 *     its PostItem-shaped SKELETON scaffold ONLY — none of the empty
 *     ("No posts yet"), error ("Couldn't load the feed") or loaded post copy is
 *     in the tree, and there is NO bare full-screen <ActivityIndicator> as the
 *     feed loading state. The skeleton exposes an accessible "Loading the feed"
 *     progressbar so the assertion rides on a stable handle, not shimmer internals.
 *   - Test B (error): when the feed query is `isError`, the screen shows the
 *     "Couldn't load the feed" EmptyState whose "Try Again" action RE-INVOKES the
 *     feed query's `refetch` (exactly once) — and the empty / loaded copy is absent.
 *   - Test C (empty): with the feed resolved to `[]`, the screen shows the
 *     "No posts yet" EmptyState and renders no post rows.
 *   - Test D (loaded): with a populated feed the screen renders the real post
 *     content + author — and neither edge-state copy is present.
 *   - Test E (create-post route): the PRIMARY create-post action — the glass
 *     composer "What's on your mind?" row (accessibilityLabel "Create a post")
 *     — still navigates to `/(modals)/create-post` and to NOTHING else. Driven
 *     with a POPULATED feed so the only "Create a post" handle in the tree is the
 *     composer (the "No posts yet" EmptyState — whose primary action shares that
 *     label — is NOT mounted in the loaded branch), pinning the composer's route
 *     unambiguously without matching the EmptyState's action.
 *
 * ── Aurora CtaButton coverage note (HONEST SKIP) ─────────────────────────────
 *   This screen already adopts GlassCard everywhere (FeedSkeleton, the challenge
 *   cards, the composer row, and PostItem) so it ALREADY counts toward GlassCard
 *   coverage. There is NO valid CtaButton target on (tabs)/community.tsx: the
 *   composer "What's on your mind?" row is an INTENTIONAL GlassCard-wrapped glass
 *   row (kept as-is), the two header controls (Leaderboard / Messages) are NEUTRAL
 *   icon buttons, the PostItem like/comment/share controls are icon-only, and the
 *   two create-post EmptyState actions are the EmptyState primitive's OWN coral
 *   Button — there is no coral primary TouchableOpacity+Text anywhere. Adopting
 *   CtaButton here would MANUFACTURE a coral CTA the design does not have, which is
 *   forbidden, so the screen file is LEFT UNCHANGED (empty source diff) and is
 *   intentionally NOT in this item's owned-files list. The honest deliverable is
 *   this render-presence + route-pinning test only; check-no-inline-cta /
 *   check-no-inline-glass stay GREEN because the untouched source has no inline
 *   coral-CTA gradient and no inline-glass card (both guards skip __tests__/).
 *
 * Behaviour-pinning, not just rendering: the error test proves the retry wiring
 * (refetch), Test D proves the like mutation is left intact (the like button
 * still calls likeMutation.mutate(postId)), and Test E proves the create-post
 * destination is unchanged — so this coverage change is provably non-destructive
 * to the feed's mutations and navigation.
 *
 * Mock conventions mirror the sibling screen suites (challenges.states.test.tsx +
 * community.test.tsx + dashboard.cta.test.tsx): a hoisted `mock`-prefixed
 * react-query stub branches on queryKey[0] over a mutable holder (so each test
 * picks the loading / error / empty / loaded branch BEFORE render), a single
 * `refetch` spy proves the error retry wiring, and a single hoisted `mockPush`
 * router spy proves the create-post destination. `@/api/community` is fully mocked so the real axios client
 * never loads; the like `useMutation` returns a `mutate` spy (the like mutation
 * is untouched by this change but asserted as still-wired in Test D). The
 * `@/components/ui` barrel is left REAL so the assertions ride on the actual
 * EmptyState copy + primary action and the real Skeleton / SkeletonCard, and
 * `@/components/SafeBlurView` is a passthrough so the real GlassCard mounts.
 *
 * Additive + behaviour-safe: this EXTENDS the existing suite (adds the create-post
 * route pin, Test E) and is the SOLE file changed by this item — the screen file
 * (app/(tabs)/community.tsx) is deliberately left UNCHANGED (honest CtaButton skip,
 * see the Aurora coverage note above), so the source diff for this item is empty.
 */

// ── jest.mock hoisting block (runs ABOVE the imports) ────────────────────────

// expo-router: `push` is a hoisted `mock`-prefixed holder (the `mock` prefix is
// what babel-plugin-jest-hoist allows the hoisted factory to close over) so a
// test can assert exactly where — and with what arity — a control navigated.
// The create-post route test (Test E) rides on this; `back`/`replace` are
// benign no-ops. Mirrors the dashboard.cta.test.tsx convention.
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
}));

// Controlled state for the ['community-feed'] query — each test mutates this
// holder BEFORE render() (the factory reads it at call-time). `refetch` is the
// spy the error branch's "Try Again" action must RE-INVOKE.
type FeedState = { data: any; isLoading: boolean; isError: boolean };
const mockFeed: FeedState = { data: undefined, isLoading: false, isError: false };
const mockRefetch = jest.fn();

// Active-challenges strip kept empty so the tests focus on the feed branches
// (an empty array makes the screen render no challenge cards — the strip is
// gated on `challenges && challenges.length > 0`).
const mockChallenges: any[] = [];

// The like mutation's `mutate` spy. The screen calls `likeMutation.mutate(post.id)`,
// so asserting on this with the post id proves the like wiring is intact.
const mockLikeMutate = jest.fn();

// react-query: branch useQuery on queryKey[0]. ['community-feed'] reads the
// mutable holder + the shared refetch spy; ['community-challenges'] returns the
// (empty) challenges holder. useMutation returns the like spy. useQueryClient is
// a benign stub (onRefresh / like onSuccess invalidate through it).
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
  useMutation: () => ({ mutate: mockLikeMutate, isPending: false, isError: false, reset: jest.fn() }),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

// API module the screen statically imports — stub to plain jest.fns so axios
// (via @/api/client) never loads. useQuery / useMutation are fully stubbed above,
// so these are never actually invoked; they only satisfy the import graph.
// `Post` is a type-only import (erased by Babel), so no runtime export is needed.
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

// expo-linear-gradient ships a native module — passthrough View so the screen's
// gradient (and the EmptyState's primary Button gradient) mount on the jest
// renderer.
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

// GlassCard wraps a SafeBlurView (expo-blur native). Replace SafeBlurView with a
// passthrough View — forwarding props — so the real GlassCard (the feed-card
// surface AND the loading skeleton's card placeholders) mounts cleanly and its
// accessibility props survive.
jest.mock('@/components/SafeBlurView', () => {
  const RN = require('react-native');
  return { SafeBlurView: ({ children, ...props }: any) => <RN.View {...props}>{children}</RN.View> };
});

// date-fns: the post card formats createdAt via formatDistanceToNow — pin it to
// a constant so the rendered timestamp is deterministic and tz-agnostic.
jest.mock('date-fns', () => ({
  formatDistanceToNow: () => '1 hour',
}));

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

// A single populated post for the loaded-branch case. `userId` is required by
// the Post type; no image/avatar URL so the expo-image stub stays inert.
const POST = {
  id: 'p1',
  userId: 'u1',
  author: { id: 'a1', name: 'Sam' },
  content: 'hello world',
  createdAt: '2026-06-13T00:00:00.000Z',
  likes: 2,
  commentsCount: 1,
};

describe('CommunityTab — feed loading / error / empty / loaded states', () => {
  beforeEach(() => {
    mockFeed.data = undefined;
    mockFeed.isLoading = false;
    mockFeed.isError = false;
    mockRefetch.mockClear();
    mockLikeMutate.mockClear();
    mockPush.mockClear();
  });

  // ── Test A: loading → skeleton scaffold only (no bare spinner) ─────────────
  test('loading: mounts the feed skeleton scaffold with no empty / error / loaded copy and no bare spinner', () => {
    mockFeed.isLoading = true;

    expect(() => renderScreen()).not.toThrow();

    // The loading branch renders the PostItem-shaped skeleton scaffold, surfaced
    // via its accessible "Loading the feed" progressbar handle…
    expect(screen.getByLabelText('Loading the feed')).toBeTruthy();

    // …and NONE of the empty / error / loaded copy is in the tree yet.
    expect(screen.queryByText('No posts yet')).toBeNull();
    expect(screen.queryByText("Couldn't load the feed")).toBeNull();
    expect(screen.queryByText('Try Again')).toBeNull();
    expect(screen.queryByText('hello world')).toBeNull();

    // The honest loading scaffold replaced the bare full-screen spinner: there is
    // no ActivityIndicator host component anywhere in the feed loading state.
    expect(screen.UNSAFE_queryByType(require('react-native').ActivityIndicator)).toBeNull();

    // The header title renders in every branch (it lives outside the conditional),
    // a sanity check that the screen mounted at all.
    expect(screen.getByText('Community')).toBeTruthy();
  });

  // ── Test B: error → retry RE-INVOKES the feed query ────────────────────────
  test('error: shows the "Couldn\'t load the feed" EmptyState whose Try Again re-invokes the feed refetch', () => {
    mockFeed.isError = true;

    renderScreen();

    // The honest error copy is present and the empty / loaded copy is absent.
    expect(screen.getByText("Couldn't load the feed")).toBeTruthy();
    expect(screen.queryByText('No posts yet')).toBeNull();
    expect(screen.queryByText('hello world')).toBeNull();

    // The retry action (EmptyState's primary Button, label "Try Again") re-invokes
    // the feed query — exactly once.
    fireEvent.press(screen.getByText('Try Again'));
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  // ── Test C: resolved-but-empty feed → honest empty state ───────────────────
  test('empty: feed [] → "No posts yet" EmptyState and no post rows', () => {
    mockFeed.data = [];

    renderScreen();

    expect(screen.getByText('No posts yet')).toBeTruthy();
    // …and the screen does NOT fall through to the error or loaded copy.
    expect(screen.queryByText("Couldn't load the feed")).toBeNull();
    expect(screen.queryByText('hello world')).toBeNull();
  });

  // ── Test D: loaded → post rows render + like mutation stays wired ──────────
  test('loaded: renders the real post content/author, no edge-state copy, and the like button still calls mutate(postId)', () => {
    mockFeed.data = [POST];

    renderScreen();

    // The post content + author render (proving the loaded branch, not an
    // EmptyState or the skeleton, is on screen).
    expect(screen.getByText('hello world')).toBeTruthy();
    expect(screen.getByText('Sam')).toBeTruthy();
    expect(screen.queryByText('No posts yet')).toBeNull();
    expect(screen.queryByText("Couldn't load the feed")).toBeNull();
    expect(screen.queryByLabelText('Loading the feed')).toBeNull();

    // The like mutation is provably untouched by this spinner-debt change: the
    // like button (accessibilityLabel "Like, <n> likes") still calls the mutation
    // with THIS post's id.
    fireEvent.press(screen.getByRole('button', { name: /^Like,/ }));
    expect(mockLikeMutate).toHaveBeenCalledTimes(1);
    expect(mockLikeMutate).toHaveBeenCalledWith('p1');
  });

  // ── Test E: create-post route unchanged → composer routes to the modal ─────
  // The PRIMARY create-post action is the GlassCard-wrapped composer row
  // ("What's on your mind?", accessibilityLabel "Create a post"). It is an
  // INTENTIONAL glass row (kept as-is — there is no coral CtaButton on this
  // screen), so this test pins its DESTINATION rather than its look: pressing it
  // must navigate to `/(modals)/create-post` and to nothing else. A POPULATED
  // feed is used on purpose so the only node carrying "Create a post" is the
  // composer — the "No posts yet" EmptyState (whose primary action shares that
  // label) is NOT mounted in the loaded branch — so the handle is unambiguous and
  // we never accidentally match the EmptyState's own action.
  test('create-post: the glass composer row still navigates to /(modals)/create-post (and nowhere else)', () => {
    mockFeed.data = [POST];

    renderScreen();

    // Loaded branch → the composer is the sole "Create a post" handle (its body
    // copy renders too), and the empty-state action that shares the label is absent.
    expect(screen.getByText("What's on your mind?")).toBeTruthy();
    expect(screen.queryByText('No posts yet')).toBeNull();

    fireEvent.press(screen.getByLabelText('Create a post'));

    // The composer's create-post destination is provably unchanged by this
    // coverage change: exactly one push, to the create-post modal route.
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith('/(modals)/create-post');
  });
});
