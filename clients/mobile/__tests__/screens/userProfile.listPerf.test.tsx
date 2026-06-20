/**
 * userProfile.listPerf.test.tsx
 *
 * LIST-PERFORMANCE pin for the Aurora public user-profile posts list —
 * `app/(community)/userProfile.tsx`.
 *
 * The posts list was refactored from an inline `posts.map(...)` Card into a
 * module-scope React.memo'd `PostRow` that takes ONLY primitives + ONE hoisted
 * `onOpen(postId)` press callback (react-native-skills: list-performance-callbacks,
 * list-performance-function-references, list-performance-inline-objects,
 * list-performance-item-memo). This suite is the behaviour contract for that perf
 * pass: the populated list must render the SAME real rows with accessible content,
 * and tapping a row must route to the canonical post-detail route /(community)/<id>.
 *
 * It is DISJOINT from userProfile.test.tsx (which pins the privacy-lock edge state):
 * here we assert the UNLOCKED, POPULATED list path and the row-tap navigation that
 * the memo refactor introduced, plus a guard that the locked/empty/error branches are
 * unaffected (no post rows, no router navigation).
 *
 * The 3 social migrations are UNAPPLIED / user-gated, so there is NO live-DB
 * dependency: `@/api/users` + `@/api/community` are fully mocked and
 * `@tanstack/react-query` is stubbed so the screen never touches axios. Mock
 * conventions mirror the sibling screen suites (the hoisted `mock`-prefixed holder
 * pattern so babel-plugin-jest-hoist allows the factory to close over the holder,
 * the `expo-status-bar` render-nothing stub, and gradient/image/icon passthroughs).
 * The `@/components/ui` barrel is left REAL so assertions ride on the actual
 * CtaButton a11y, the glass Card, and EmptyState copy.
 */

// ── jest.mock hoisting block (runs ABOVE the imports) ────────────────────────

// expo-router: a fixed userId param + a router whose `push` is a STABLE hoisted
// spy so the row-tap navigation target can be asserted. `useLocalSearchParams`
// must return the id the three queries are keyed on.
const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ userId: 'u1' }),
  useRouter: () => ({ push: mockPush, back: mockBack, replace: jest.fn() }),
}));

// Controlled state for the three queries — each test mutates these holders BEFORE
// render() (the factory reads them at call-time).
//
//  - mockProfile.data is the ['public-profile'] query value. The screen reads
//    `profileResp?.data?.data || profileResp?.data`, so we model the axios-style
//    envelope: { data: <profileBody> }.
//  - mockPosts.data is the ['user-posts'] value (a Post[]).
//  - mockSocial.data is the ['user-social'] value ({ isFollowing, followers,
//    following }).
type QueryState = { data: any; isLoading: boolean; isError: boolean };
const mockProfile: QueryState = { data: undefined, isLoading: false, isError: false };
const mockPosts: QueryState = { data: undefined, isLoading: false, isError: false };
const mockSocial: { data: any } = { data: undefined };

// The follow mutation's `mutate` spy (benign — the list tests don't press it).
const mockFollowMutate = jest.fn();

// react-query: branch useQuery on queryKey[0]. useMutation returns the follow
// spy; the screen's onError rollback only needs a stable object.
jest.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    const key = queryKey[0];
    if (key === 'public-profile') {
      return {
        data: mockProfile.data,
        isLoading: mockProfile.isLoading,
        isError: mockProfile.isError,
        refetch: jest.fn(),
      };
    }
    if (key === 'user-posts') {
      return {
        data: mockPosts.data,
        isLoading: mockPosts.isLoading,
        isError: mockPosts.isError,
        refetch: jest.fn(),
      };
    }
    if (key === 'user-social') {
      return { data: mockSocial.data };
    }
    return { data: undefined, isLoading: false, isError: false, refetch: jest.fn() };
  },
  useMutation: () => ({ mutate: mockFollowMutate, isPending: false, isError: false, reset: jest.fn() }),
}));

// API modules the screen statically imports — stub to plain jest.fns so axios
// (via @/api/client) never loads. useQuery / useMutation are fully stubbed above,
// so these are never actually invoked; they only satisfy the import graph.
jest.mock('@/api/users', () => ({
  getPublicProfile: jest.fn(),
}));
jest.mock('@/api/community', () => ({
  getUserPosts: jest.fn(),
  getUserSocial: jest.fn(),
  followUser: jest.fn(),
  unfollowUser: jest.fn(),
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
// CtaButton + the glass Card + the avatar/post images mount on the jest renderer.
jest.mock('expo-linear-gradient', () => {
  const RN = require('react-native');
  return { LinearGradient: (props: any) => <RN.View {...props} /> };
});
jest.mock('expo-image', () => {
  const RN = require('react-native');
  return { Image: (props: any) => <RN.View {...props} /> };
});

// expo-status-bar renders nothing in the tree under test.
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

// date-fns: each post card formats createdAt via formatDistanceToNow — pin it to a
// constant so the rendered timestamp is deterministic and tz-agnostic.
jest.mock('date-fns', () => ({
  formatDistanceToNow: () => '1 hour',
}));

// ── Imports (run AFTER the hoisted mocks above) ──────────────────────────────
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import {
  ThemeContext,
  getThemeColors,
  typography,
  spacing,
  borderRadius,
  shadows,
} from '@/theme';
import UserProfileScreen from '../../app/(community)/userProfile';

function renderScreen() {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      <UserProfileScreen />
    </ThemeContext.Provider>,
  );
}

// Two posts so we can assert the list renders ONE row per post with stable keys.
// `userId` is required by the Post type; no imageUrl keeps the expo-image stub inert.
const POSTS = [
  {
    id: 'p1',
    userId: 'u1',
    content: 'First public post body',
    createdAt: '2026-06-13T00:00:00.000Z',
    likes: 0,
    commentsCount: 0,
  },
  {
    id: 'p2',
    userId: 'u1',
    content: 'Second public post body',
    createdAt: '2026-06-14T00:00:00.000Z',
    likes: 0,
    commentsCount: 0,
  },
];

// A PUBLIC profile so the posts list (not the locked panel) renders.
const PUBLIC_PROFILE = { data: { userId: 'u1', displayName: 'Sam Public', isPrivate: false, bio: 'open bio' } };

describe('UserProfileScreen — posts list performance refactor', () => {
  beforeEach(() => {
    mockProfile.data = undefined;
    mockProfile.isLoading = false;
    mockProfile.isError = false;
    mockPosts.data = undefined;
    mockPosts.isLoading = false;
    mockPosts.isError = false;
    mockSocial.data = undefined;
    mockFollowMutate.mockClear();
    mockPush.mockClear();
    mockBack.mockClear();
  });

  // ── (i) POPULATED — the memoized rows render identical content ─────────────
  test('populated list renders one accessible row per post with the same body + timestamp', () => {
    mockProfile.data = PUBLIC_PROFILE;
    mockSocial.data = { isFollowing: false, followers: 9, following: 2 };
    mockPosts.data = POSTS;

    renderScreen();

    // The unlocked "Posts" section is present (the section header is unlocked-only,
    // so the locked branch never reaches here).
    expect(screen.queryByText('This account is private')).toBeNull();
    expect(screen.getAllByText('Posts').length).toBeGreaterThanOrEqual(2);

    // Each post body renders as real, readable content (output unchanged by the
    // inline → PostRow extraction).
    expect(screen.getByText('First public post body')).toBeTruthy();
    expect(screen.getByText('Second public post body')).toBeTruthy();

    // The timestamp line still formats via formatDistanceToNow (pinned to '1 hour') —
    // one "<distance> ago" line per row, i.e. one per post.
    expect(screen.getAllByText('1 hour ago')).toHaveLength(POSTS.length);
  });

  // ── (ii) ROW TAP — routes to the canonical post-detail route ───────────────
  test('tapping a post row routes to /(community)/<id> via the hoisted onOpen handler', () => {
    mockProfile.data = PUBLIC_PROFILE;
    mockSocial.data = { isFollowing: false, followers: 9, following: 2 };
    mockPosts.data = POSTS;

    renderScreen();

    // Each PostRow wraps its glass Card in a TouchableOpacity (accessibilityRole
    // "button") whose only child text is the post body — so pressing the element
    // that contains the body fires the row's onOpen(post.id).
    fireEvent.press(screen.getByText('First public post body'));
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith('/(community)/p1');

    // A SECOND row routes to ITS OWN id — proof the single hoisted onOpen is
    // re-bound per row to the correct post id (stable callback, per-id target).
    fireEvent.press(screen.getByText('Second public post body'));
    expect(mockPush).toHaveBeenCalledTimes(2);
    expect(mockPush).toHaveBeenLastCalledWith('/(community)/p2');
  });

  // ── (iii) EMPTY — no rows, no navigation ───────────────────────────────────
  test('empty posts → friendly EmptyState, no rows, no navigation', () => {
    mockProfile.data = PUBLIC_PROFILE;
    mockSocial.data = { isFollowing: false, followers: 9, following: 2 };
    mockPosts.data = [];

    renderScreen();

    expect(screen.getByText('No posts yet')).toBeTruthy();
    // The post bodies are absent and nothing is tappable to route.
    expect(screen.queryByText('First public post body')).toBeNull();
    expect(mockPush).not.toHaveBeenCalled();
  });

  // ── (iv) ERROR — error EmptyState, no rows ─────────────────────────────────
  test('posts error → "Couldn\'t load posts" EmptyState, no rows rendered', () => {
    mockProfile.data = PUBLIC_PROFILE;
    mockSocial.data = { isFollowing: false, followers: 9, following: 2 };
    mockPosts.isError = true;
    mockPosts.data = undefined;

    renderScreen();

    expect(screen.getByText("Couldn't load posts")).toBeTruthy();
    expect(screen.queryByText('First public post body')).toBeNull();
    expect(mockPush).not.toHaveBeenCalled();
  });

  // ── (v) LOCKED — private + not-following hides the list entirely ───────────
  test('private + not-following → locked panel, no post rows, no navigation', () => {
    mockProfile.data = { data: { userId: 'u1', displayName: 'Ava Locked', isPrivate: true, bio: 'secret bio' } };
    mockSocial.data = { isFollowing: false, followers: 5, following: 3 };
    // Even if posts arrive, the LOCKED branch must not render them.
    mockPosts.data = POSTS;

    renderScreen();

    expect(screen.getByText('This account is private')).toBeTruthy();
    // No post rows leak into the locked panel.
    expect(screen.queryByText('First public post body')).toBeNull();
    expect(screen.queryByText('Second public post body')).toBeNull();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
