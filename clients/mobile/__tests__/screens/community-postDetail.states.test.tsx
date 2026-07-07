/**
 * community-postDetail.states.test.tsx
 *
 * Screen-level coverage for the load-bearing states of the COMMENTS list on the
 * community post-detail screen — `app/(community)/[postId].tsx`.
 *
 * That screen already had honest three-state handling for the POST itself (a
 * loading skeleton and an error / not-found EmptyState). The COMMENTS useQuery,
 * however, destructured only `data` (defaulted `[]`) + `refetch`, so while the
 * comments were fetching — or if getComments FAILED — the section silently fell
 * through to the "No comments yet" EmptyState: an error masquerading as an honest
 * empty thread. The paired source change pulls `isLoading` + `isError` from the
 * comments query and renders FOUR mutually-exclusive branches (ternary-null only,
 * never `x && …`, since an empty list / 0 length is falsy-renderable):
 *
 *   - loading  → comment-row SKELETONS (an accessible "Loading comments"
 *     progressbar handle), with NO "No comments yet" copy and NO fabricated rows;
 *   - error    → a RETRYABLE EmptyState ("Couldn't load comments", action
 *     "Try Again" wired to the comments query's refetch) — NOT the "No comments
 *     yet" copy, and the filled comment list absent;
 *   - empty    → the explicit "No comments yet" EmptyState (and no comment rows);
 *   - loaded   → the real comment rows (author + body) with accessible labels.
 *
 * Every test resolves the POST query (isLoading=false, isError=false, a real
 * post) so the screen is past its own post-level skeleton/error guards and the
 * assertions ride purely on the COMMENTS branch — the remaining bare branch this
 * item closes. This file is DISJOINT from `community.test.tsx` /
 * `community.feed.states.test.tsx` (which own the feed screens) — it is the only
 * suite that drives `[postId].tsx`.
 *
 * Behaviour-pinning, not just rendering: the error test proves the retry wiring
 * (pressing "Try Again" RE-INVOKES the comments refetch exactly once), and the
 * loaded test asserts the real comment author + body render — so the coverage is
 * provably tied to the comments query's real state, not to a static tree.
 *
 * Mock conventions mirror the sibling screen suites (community.test.tsx /
 * community.feed.states.test.tsx / dashboard.errorStates.test.tsx): a hoisted
 * `mock`-prefixed react-query stub branches on queryKey[0] (the `mock` prefix is
 * what babel-plugin-jest-hoist lets the hoisted factory close over). `@/api/
 * community` is fully mocked so the real axios client never loads; expo-router's
 * useLocalSearchParams + useRouter, expo-image / expo-linear-gradient /
 * expo-status-bar / @expo/vector-icons / react-native-safe-area-context, and the
 * imageUrl trust-gate are all stubbed. The `@/components/ui` barrel is left REAL
 * so the assertions ride on the actual EmptyState copy + the real Skeleton, and
 * the EmptyState's coral Button surfaces its label as plain <Text>, so
 * `fireEvent.press(getByText('Try Again'))` drives its onAction.
 *
 * Additive + behaviour-safe: NEW test file paired with the comments three-state
 * change to app/(community)/[postId].tsx.
 */

// ── jest.mock hoisting block (runs ABOVE the imports) ────────────────────────

// expo-router: the screen reads the route param via useLocalSearchParams and
// navigates back via useRouter().back. `mockBack` is a hoisted `mock`-prefixed
// holder so a test could assert a back-navigation; `postId` is pinned to 'p1'.
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: mockBack, replace: jest.fn() }),
  useLocalSearchParams: () => ({ postId: 'p1' }),
}));

// Controlled state for the two queries the screen drives. The POST query is held
// RESOLVED in every test (a real post, not loading, not error) so the screen is
// past its post-level skeleton/error guards and we exercise only the COMMENTS
// branch. The COMMENTS holder is what each test mutates BEFORE render() to drive
// the loading / error / empty / loaded branch (the factory reads it at
// call-time). `mockCommentsRefetch` is the spy the error branch's "Try Again"
// must RE-INVOKE.
type QueryState = { data: any; isLoading: boolean; isError: boolean };
const mockPost: QueryState = {
  data: {
    id: 'p1',
    userId: 'u1',
    author: { id: 'a1', name: 'Sam' },
    content: 'the original post body',
    createdAt: '2026-06-13T00:00:00.000Z',
    likes: 2,
    commentsCount: 1,
  },
  isLoading: false,
  isError: false,
};
const mockComments: QueryState = { data: undefined, isLoading: false, isError: false };
const mockPostRefetch = jest.fn();
const mockCommentsRefetch = jest.fn();

// react-query: branch useQuery on queryKey[0]. ['post', …] reads the POST holder;
// ['post-comments', …] reads the COMMENTS holder + exposes its refetch spy.
// useMutation (the addComment mutation) returns an inert mutate spy — no test
// drives a comment submission, it only needs to satisfy the screen's wiring.
// useQueryClient is a no-op invalidate (the submit path is untouched here).
jest.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    const key = queryKey[0];
    if (key === 'post') {
      return {
        data: mockPost.data,
        isLoading: mockPost.isLoading,
        isError: mockPost.isError,
        refetch: mockPostRefetch,
      };
    }
    if (key === 'post-comments') {
      return {
        data: mockComments.data,
        isLoading: mockComments.isLoading,
        isError: mockComments.isError,
        refetch: mockCommentsRefetch,
      };
    }
    return { data: undefined, isLoading: false, isError: false, refetch: jest.fn() };
  },
  useMutation: () => ({ mutate: jest.fn(), isPending: false, isError: false, reset: jest.fn() }),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

// API module the screen statically imports — stub to plain jest.fns so axios
// (via @/api/client) never loads. useQuery / useMutation are fully stubbed above,
// so these are never actually invoked; they only satisfy the import graph. `Post`
// and `Comment` are type-only imports (erased by Babel), so no runtime export is
// needed for them.
jest.mock('@/api/community', () => ({
  getPostById: jest.fn(),
  getComments: jest.fn(),
  addComment: jest.fn(),
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
// passthrough View so the screen's send-button gradient (and the EmptyState's
// primary Button gradient) mount on the jest renderer.
jest.mock('expo-linear-gradient', () => {
  const RN = require('react-native');
  return { LinearGradient: (props: any) => <RN.View {...props} /> };
});

// expo-status-bar renders nothing in the tree under test.
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

// expo-image ships a native module; the post/comment avatars only render for a
// (trusted) URL — our fixtures omit URLs, so this is a defensive passthrough.
jest.mock('expo-image', () => {
  const RN = require('react-native');
  return { Image: (props: any) => <RN.View {...props} /> };
});

// imageUrl trust-gate is pure, but stub to a passthrough so the screen's
// safeImageUri() calls are deterministic regardless of the real allowlist.
jest.mock('@/lib/imageUrl', () => ({
  safeImageUri: (uri?: string | null) => uri ?? undefined,
}));

// date-fns: the post + comment rows format createdAt via formatDistanceToNow —
// pin it to a constant so the rendered timestamp is deterministic and tz-agnostic.
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
import PostDetailScreen from '../../app/(community)/[postId]';

function renderScreen() {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      <PostDetailScreen />
    </ThemeContext.Provider>,
  );
}

// A single populated comment for the loaded-branch case. `userId` is required by
// the Comment type; no avatar URL so the expo-image stub stays inert.
const COMMENT = {
  id: 'c1',
  userId: 'cu1',
  author: { name: 'Riley' },
  text: 'great post, thanks for sharing!',
  createdAt: '2026-06-13T00:00:00.000Z',
};

describe('PostDetailScreen — comments loading / error / empty / loaded states', () => {
  beforeEach(() => {
    // POST stays RESOLVED across the suite so we always exercise the comments
    // branch (never the screen's own post skeleton/error).
    mockPost.isLoading = false;
    mockPost.isError = false;
    // COMMENTS reset to a neutral, non-loading, non-error baseline; each test
    // sets the branch it needs.
    mockComments.data = undefined;
    mockComments.isLoading = false;
    mockComments.isError = false;
    mockPostRefetch.mockClear();
    mockCommentsRefetch.mockClear();
    mockBack.mockClear();
  });

  // ── (i) comments loading → skeletons, no empty copy, no fabricated rows ─────
  test('comments loading → comment skeleton(s), and NO "No comments yet" / no fabricated rows', () => {
    mockComments.isLoading = true;
    mockComments.data = undefined;

    expect(() => renderScreen()).not.toThrow();

    // The post resolved, so the screen is past its own guards — the post body is
    // on screen and the COMMENTS section is what we're asserting.
    expect(screen.getByText('the original post body')).toBeTruthy();

    // The comments loading branch mounts its skeleton scaffold, surfaced via the
    // accessible "Loading comments" progressbar handle…
    expect(screen.getByLabelText('Loading comments')).toBeTruthy();

    // …and NONE of the empty / error copy is in the tree, and no fabricated
    // comment row leaked through (the loaded fixture's body is absent).
    expect(screen.queryByText('No comments yet')).toBeNull();
    expect(screen.queryByText("Couldn't load comments")).toBeNull();
    expect(screen.queryByText('Try Again')).toBeNull();
    expect(screen.queryByText('great post, thanks for sharing!')).toBeNull();

    // The honest skeleton replaced any bare spinner: there is no ActivityIndicator
    // host component anywhere in the comments loading state.
    expect(screen.UNSAFE_queryByType(require('react-native').ActivityIndicator)).toBeNull();
  });

  // ── (ii) comments error → retryable EmptyState wired to the comments refetch ─
  test('comments error → "Couldn\'t load comments" retryable EmptyState whose Try Again re-invokes the comments refetch (and NOT shown as empty)', () => {
    mockComments.isError = true;
    mockComments.data = undefined;

    renderScreen();

    // The post still renders (its query resolved), proving we are on the comments
    // branch — not the screen's post-level error EmptyState.
    expect(screen.getByText('the original post body')).toBeTruthy();

    // The honest connection-error copy is present…
    expect(screen.getByText("Couldn't load comments")).toBeTruthy();
    // …and it is NOT dressed up as an honest empty thread, nor are any rows shown.
    expect(screen.queryByText('No comments yet')).toBeNull();
    expect(screen.queryByText('great post, thanks for sharing!')).toBeNull();
    // The loading scaffold is absent too (error and loading are mutually exclusive).
    expect(screen.queryByLabelText('Loading comments')).toBeNull();

    // The retry action (EmptyState's primary Button, label "Try Again") RE-INVOKES
    // the COMMENTS query's refetch — exactly once — and never the post's refetch.
    fireEvent.press(screen.getByText('Try Again'));
    expect(mockCommentsRefetch).toHaveBeenCalledTimes(1);
    expect(mockPostRefetch).not.toHaveBeenCalled();
  });

  // ── (iii) resolved-but-empty comments → honest empty state ──────────────────
  test('comments [] → explicit "No comments yet" EmptyState and no comment rows', () => {
    mockComments.data = [];

    renderScreen();

    expect(screen.getByText('the original post body')).toBeTruthy();

    // The explicit zero-data copy is present…
    expect(screen.getByText('No comments yet')).toBeTruthy();
    // …and the screen does NOT fall through to the error or loaded copy, and the
    // loading scaffold is absent.
    expect(screen.queryByText("Couldn't load comments")).toBeNull();
    expect(screen.queryByText('great post, thanks for sharing!')).toBeNull();
    expect(screen.queryByLabelText('Loading comments')).toBeNull();
  });

  // ── (iv) loaded → real comment rows render with accessible labels ───────────
  test('comments populated → real comment rows (author + body), no edge-state copy', () => {
    mockComments.data = [COMMENT];

    renderScreen();

    // The post + the real comment content render (proving the loaded branch, not
    // an EmptyState or the skeleton, is on screen).
    expect(screen.getByText('the original post body')).toBeTruthy();
    expect(screen.getByText('great post, thanks for sharing!')).toBeTruthy();
    expect(screen.getByText('Riley')).toBeTruthy();

    // …and none of the loading / error / empty copy is present.
    expect(screen.queryByText('No comments yet')).toBeNull();
    expect(screen.queryByText("Couldn't load comments")).toBeNull();
    expect(screen.queryByLabelText('Loading comments')).toBeNull();

    // The send control keeps its accessible label (the comment input bar is
    // rendered in the loaded branch and its wiring is untouched by this item).
    expect(screen.getByRole('button', { name: 'Send message' })).toBeTruthy();
  });
});
