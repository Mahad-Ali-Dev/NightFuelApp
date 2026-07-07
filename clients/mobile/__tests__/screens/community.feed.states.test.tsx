/**
 * community.feed.states.test.tsx
 *
 * Screen-level coverage for the load-bearing states of the Aurora community
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
 * ── Optimistic-like coverage (Tests F/G/H) ───────────────────────────────────
 *   The like control is now OPTIMISTIC (TanStack onMutate/onError/onSettled). The
 *   ['community-feed'] react-query CACHE is the single ground truth for the feed
 *   (state-ground-truth.md): onMutate bumps the tapped post's `likes` in the
 *   cached array (the heart count moves INSTANTLY, before the network returns) and
 *   snapshots the prior cache; onError writes that snapshot back (rolling the count
 *   to its true value) and surfaces a brief NON-destructive inline notice INSTEAD
 *   of the old destructive Alert.alert; onSettled invalidates to reconcile. The
 *   rendered count is DERIVED from the cache — never stored separately — so these
 *   tests assert the cache-driven render:
 *     - F: pressing like increments the rendered count BEFORE the mutation resolves;
 *     - G: on mutationFn rejection the count rolls back to its prior value, an
 *          inline notice appears, and Alert.alert is NEVER called (alertSpy);
 *     - H: on success the optimistic value reconciles with NO double-count (the
 *          count lands on prior+1, not prior+2).
 *
 * ── Aurora CtaButton coverage note (HONEST SKIP) ─────────────────────────────
 *   This screen already adopts GlassCard everywhere (FeedSkeleton, the challenge
 *   cards, the composer row, PostItem AND the new like-failure notice) so it
 *   ALREADY counts toward GlassCard coverage. There is NO valid CtaButton target
 *   on (tabs)/community.tsx: the composer "What's on your mind?" row is an
 *   INTENTIONAL GlassCard-wrapped glass row (kept as-is), the two header controls
 *   (Leaderboard / Messages) are NEUTRAL icon buttons, the PostItem
 *   like/comment/share controls are icon-only, the like-failure notice is a
 *   dismiss-on-tap GlassCard (NOT a coral CTA), and the two create-post EmptyState
 *   actions are the EmptyState primitive's OWN coral Button — there is no coral
 *   primary TouchableOpacity+Text anywhere. Adopting CtaButton here would
 *   MANUFACTURE a coral CTA the design does not have, which is forbidden, so no
 *   coral CTA is added; check-no-inline-cta / check-no-inline-glass stay GREEN
 *   because the source has no inline-glass card (it uses GlassCard) and no
 *   inline coral-CTA gradient (both guards skip __tests__/).
 *
 * Behaviour-pinning, not just rendering: the error test proves the retry wiring
 * (refetch), Tests F/G/H prove the optimistic like mutation (instant bump,
 * rollback, reconcile), and Test E proves the create-post destination — so this
 * coverage is provably tied to the feed's real mutations and navigation.
 *
 * Mock conventions mirror the sibling screen suites (challenges.states.test.tsx +
 * community.test.tsx + requests.test.tsx + dashboard.cta.test.tsx): a hoisted
 * `mock`-prefixed react-query stub branches on queryKey[0]. To exercise the
 * OPTIMISTIC lifecycle deterministically (without a live DB — the social like
 * migration is unapplied so this stays MOCKED), the stub is STATEFUL: the
 * ['community-feed'] query reads a single mutable cache holder, `useMutation`
 * runs the real onMutate/onError/onSettled you pass it, and `useQueryClient`'s
 * getQueryData/setQueryData/cancelQueries/invalidateQueries operate on that same
 * holder and re-render every mounted query subscriber. This keeps the A–E branch
 * cases byte-identical (they only ever SET the holder + assert synchronously)
 * while letting F/G/H drive a genuine cache round-trip. `@/api/community` is fully
 * mocked so the real axios client never loads; `likePost` delegates to a mutable
 * spy each optimistic test resolves or rejects. The `@/components/ui` barrel is
 * left REAL so the assertions ride on the actual EmptyState copy + the real
 * Skeleton / SkeletonCard / GlassCard, and `@/components/SafeBlurView` is a
 * passthrough so the real GlassCard mounts.
 *
 * Additive + behaviour-safe: this EXTENDS the existing suite and is the test file
 * paired with the optimistic-like change to app/(tabs)/community.tsx.
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
// holder BEFORE render() (the factory reads it at call-time). It is ALSO the
// backing store the stateful query client reads/writes (getQueryData /
// setQueryData), so the optimistic onMutate write and the onError rollback both
// land here and re-render the feed. `refetch` is the spy the error branch's
// "Try Again" action must RE-INVOKE.
type FeedState = { data: any; isLoading: boolean; isError: boolean };
const mockFeed: FeedState = { data: undefined, isLoading: false, isError: false };
const mockRefetch = jest.fn();

// Re-render fan-out: each mounted `useQuery` registers a force-update dispatch
// here; the stateful client calls `mockNotify()` after any cache write so the
// feed re-reads `mockFeed.data` (the optimistic bump / rollback becomes visible).
// Harmless for the synchronous A–E branch cases — they render once and never
// trigger a write.
const mockListeners = new Set<() => void>();
const mockNotify = () => {
  mockListeners.forEach((fn) => fn());
};

// Active-challenges strip kept empty so the tests focus on the feed branches
// (an empty array makes the screen render no challenge cards — the strip is
// gated on `challenges && challenges.length > 0`).
const mockChallenges: any[] = [];

// The like mutation's `mutate` spy — asserted in Test D to prove the like wiring
// passes THIS post's id through. The stateful useMutation below calls it first
// (before running the real lifecycle) so the call-count/arg assertions hold.
const mockLikeMutate = jest.fn();

// The like API call the mutationFn invokes — a mutable spy each optimistic test
// resolves (success/reconcile) or rejects (rollback). Defaults to a resolved
// success so the loaded-branch Test D press settles cleanly.
const mockLikePost = jest.fn((..._args: any[]) => Promise.resolve(true));

// react-query: a STATEFUL stub. `useQuery(['community-feed'])` reads the mutable
// holder + registers a re-render subscriber; `useMutation(opts)` runs the real
// onMutate/onError/onSettled lifecycle against the holder (so the optimistic
// bump, rollback and reconcile actually happen); `useQueryClient` is the cache
// API over that same holder. Branching on queryKey[0] keeps the challenges query
// inert.
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
      // Reconcile = re-render against the cache's current (already-reconciled)
      // value; the component never double-bumps, so the count stays put.
      mockNotify();
      return Promise.resolve();
    }),
  };

  return {
    useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
      // Force-update subscription so cache writes re-render this consumer.
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
          refetch: mockRefetch,
        };
      }
      if (key === 'community-challenges') {
        return { data: mockChallenges, isLoading: false, isError: false, refetch: jest.fn() };
      }
      return { data: undefined, isLoading: false, isError: false, refetch: jest.fn() };
    },
    useMutation: (opts: any) => {
      const mutate = (variables: any) => {
        // Record the call first so Test D's call-count/arg assertions hold even
        // before the async lifecycle settles.
        mockLikeMutate(variables);
        // Run the production optimistic lifecycle: onMutate (instant bump +
        // snapshot) → mutationFn → onError(rollback) / onSuccess → onSettled.
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

// API module the screen statically imports — stub to plain jest.fns so axios
// (via @/api/client) never loads. `likePost` delegates to the mutable spy so the
// optimistic tests control success vs failure; getFeed / getChallenges are never
// invoked (useQuery is stubbed) and only satisfy the import graph. `Post` is a
// type-only import (erased by Babel), so no runtime export is needed.
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
// surface, the loading skeleton's card placeholders AND the like-failure notice)
// mounts cleanly and its accessibility props survive.
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
import { Alert } from 'react-native';
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

// Drain the optimistic mutation's microtask chain (onMutate → mutationFn →
// onSuccess/onError → onSettled). The stateful useMutation stub runs the
// lifecycle across several `.then` hops; awaiting a few microtask ticks settles
// every resulting React state update INSIDE the surrounding act(), so no update
// escapes the act boundary (silences the "not wrapped in act" warning).
const flushMicrotasks = async () => {
  for (let i = 0; i < 6; i++) {
    await Promise.resolve();
  }
};

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

let alertSpy: jest.SpyInstance;

describe('CommunityTab — feed loading / error / empty / loaded states', () => {
  beforeEach(() => {
    mockFeed.data = undefined;
    mockFeed.isLoading = false;
    mockFeed.isError = false;
    mockListeners.clear();
    mockRefetch.mockClear();
    mockLikeMutate.mockClear();
    mockLikePost.mockClear();
    mockLikePost.mockImplementation(() => Promise.resolve(true));
    mockPush.mockClear();
    // Spy on the destructive Alert so the optimistic-error test can prove it is
    // NEVER called (the failure is now a NON-destructive inline notice).
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    alertSpy.mockRestore();
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
    // a sanity check that the screen mounted at all. The tab's screen header was
    // re-skinned to the "Crew" mockup (the tab-bar label in _layout.tsx is
    // unchanged); this asserts the on-screen title.
    expect(screen.getByText('Crew')).toBeTruthy();
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
  test('loaded: renders the real post content/author, no edge-state copy, and the like button still calls mutate(postId)', async () => {
    mockFeed.data = [POST];

    renderScreen();

    // The post content + author render (proving the loaded branch, not an
    // EmptyState or the skeleton, is on screen). The author name now also appears
    // as the story-strip caption for the same member, so we assert >= 1 match
    // (getAllByText) rather than a single exclusive node.
    expect(screen.getByText('hello world')).toBeTruthy();
    expect(screen.getAllByText('Sam').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('No posts yet')).toBeNull();
    expect(screen.queryByText("Couldn't load the feed")).toBeNull();
    expect(screen.queryByLabelText('Loading the feed')).toBeNull();

    // The like button (accessibilityLabel "Like, <n> likes") still calls the
    // mutation with THIS post's id. Drain the optimistic lifecycle inside act so
    // the trailing onSettled reconcile doesn't update state outside the boundary.
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: /^Like,/ }));
      await flushMicrotasks();
    });
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
    expect(screen.getByText('Share your progress…')).toBeTruthy();
    expect(screen.queryByText('No posts yet')).toBeNull();

    fireEvent.press(screen.getByLabelText('Create a post'));

    // The composer's create-post destination is provably unchanged by this
    // coverage change: exactly one push, to the create-post modal route.
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith('/(modals)/create-post');
  });

  // ── Test F: optimistic increment BEFORE the mutation resolves ──────────────
  // The like is optimistic: onMutate bumps the cached post's `likes` immediately,
  // so the rendered count moves from 2 → 3 the instant the heart is tapped —
  // before likePost (kept pending here) ever resolves. The count is DERIVED from
  // the ['community-feed'] cache (state-ground-truth.md), so the bump is a pure
  // cache write reflected on the next render.
  test('optimistic: pressing like increments the rendered count before the mutation resolves', async () => {
    // Keep the network call pending for the whole test so the only count change
    // can come from the OPTIMISTIC onMutate write, never from a settled response.
    mockLikePost.mockImplementation(() => new Promise(() => {}));
    mockFeed.data = [POST];

    renderScreen();

    // Ground truth before the tap: 2 likes (the like control surfaces the count
    // in its a11y label, an unambiguous handle).
    expect(screen.getByRole('button', { name: 'Like, 2 likes' })).toBeTruthy();

    // Tap the heart — onMutate bumps the cache; flush the microtasks the stub
    // runs onMutate on (the request stays pending, so onSettled never fires),
    // then assert the optimistic value.
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Like, 2 likes' }));
      await flushMicrotasks();
    });

    // The rendered count optimistically incremented to 3 with the request still
    // in flight (likePost never resolved) — no network round-trip was awaited.
    expect(screen.getByRole('button', { name: 'Like, 3 likes' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Like, 2 likes' })).toBeNull();

    // No failure surfaced (the request is merely pending) and the destructive
    // Alert is never used by the optimistic path.
    expect(screen.queryByText("Couldn't like that post. Please try again.")).toBeNull();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  // ── Test G: rollback on error + Alert NEVER called ─────────────────────────
  // When likePost rejects, onError writes the pre-tap snapshot back to the cache
  // (the count rolls 3 → 2, its true value) and surfaces a brief NON-destructive
  // inline notice. The old destructive Alert.alert is gone — alertSpy proves it.
  test('rollback: a like failure reverts the count to its prior value, shows an inline notice, and NEVER calls Alert.alert', async () => {
    mockLikePost.mockImplementation(() => Promise.reject(new Error('boom')));
    mockFeed.data = [POST];

    renderScreen();

    expect(screen.getByRole('button', { name: 'Like, 2 likes' })).toBeTruthy();

    // Tap → optimistic bump to 3, then the rejection rolls it back to 2. Flush
    // all the lifecycle microtasks (onMutate → mutationFn reject → onError →
    // onSettled) inside act so React applies every resulting state update.
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Like, 2 likes' }));
      await flushMicrotasks();
    });

    // The count is back to its pre-tap ground truth (the optimistic +1 was reverted).
    expect(screen.getByRole('button', { name: 'Like, 2 likes' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Like, 3 likes' })).toBeNull();

    // The failure is surfaced as a NON-destructive inline notice (role "alert")…
    expect(screen.getByText("Couldn't like that post. Please try again.")).toBeTruthy();
    // …and the old destructive Alert.alert is NEVER called.
    expect(alertSpy).not.toHaveBeenCalled();
  });

  // ── Test H: reconcile on success → no double-count ─────────────────────────
  // On success the optimistic +1 stands and onSettled invalidates to reconcile.
  // The component never bumps a second time, so the count lands on prior+1 (3),
  // NOT prior+2 (4) — proving there is no double-count once the cache reconciles.
  test('reconcile: on a successful like the optimistic value settles with no double-count', async () => {
    mockLikePost.mockImplementation(() => Promise.resolve(true));
    mockFeed.data = [POST];

    renderScreen();

    expect(screen.getByRole('button', { name: 'Like, 2 likes' })).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Like, 2 likes' }));
      await flushMicrotasks();
    });

    // After the success + onSettled reconcile, the count is exactly prior+1…
    expect(screen.getByRole('button', { name: 'Like, 3 likes' })).toBeTruthy();
    // …and crucially NOT prior+2 (no double-count from a second bump on success).
    expect(screen.queryByRole('button', { name: 'Like, 4 likes' })).toBeNull();

    // A successful like surfaces no failure notice and never touches Alert.
    expect(screen.queryByText("Couldn't like that post. Please try again.")).toBeNull();
    expect(alertSpy).not.toHaveBeenCalled();
  });
});
