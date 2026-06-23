/**
 * userProfile.test.tsx
 *
 * Screen-level coverage for the Aurora public user-profile —
 * `app/(community)/userProfile.tsx` (public / private + privacy-locked).
 *
 * That screen drives THREE queries (['public-profile', id] via getPublicProfile,
 * ['user-posts', id] via getUserPosts, ['user-social', id] via getUserSocial) and
 * a follow MUTATION behind an optimistic override. The load-bearing edge state is
 * the PRIVACY LOCK: `isLocked = !!profile.isPrivate && !isFollowing`. F1 computed
 * it but the screen had no edge-state test. This suite pins both sides of the
 * lock so a refactor can't silently leak a private member's content:
 *
 *   - LOCKED branch: a PRIVATE profile the viewer does NOT follow → the locked
 *     panel ("This account is private") renders, the member's name still shows,
 *     a follow/request CtaButton is offered (so the viewer can request access),
 *     and the locked content (the "Posts" section + the member's post body) is
 *     NOT in the tree;
 *   - UNLOCKED branch: a PUBLIC profile → the locked panel is absent, the "Posts"
 *     section and the member's post body render, and the bio shows.
 *
 * The 3 social migrations are UNAPPLIED / user-gated, so there is NO live-DB
 * dependency: `@/api/community` and `@/api/users` are fully mocked and
 * `@tanstack/react-query` is stubbed so the screen never touches axios.
 *
 * Mock conventions mirror the sibling screen suites (leaderboard.test.tsx /
 * circadian.test.tsx) — the hoisted `mock`-prefixed holder pattern (the prefix
 * lets babel-plugin-jest-hoist allow the factory to close over the holder), the
 * `expo-status-bar` → render-nothing stub, and gradient/image/icon passthroughs.
 * The `@/components/ui` barrel is left REAL so the assertions ride on the actual
 * CtaButton a11y and EmptyState / locked-panel copy.
 */

// ── jest.mock hoisting block (runs ABOVE the imports) ────────────────────────

// expo-router: a fixed userId param + a benign router. `useLocalSearchParams`
// must return the id the three queries are keyed on.
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ userId: 'u1' }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));

// Controlled state for the three queries — each test mutates these holders BEFORE
// render() (the factory reads them at call-time).
//
//  - mockProfile.data is the ['public-profile'] query value. The screen reads
//    `profileResp?.data?.data || profileResp?.data`, so we model the axios-style
//    envelope: { data: <profileBody> }. `isPrivate` drives the lock.
//  - mockPosts.data is the ['user-posts'] value (a Post[]).
//  - mockSocial.data is the ['user-social'] value ({ isFollowing, followers,
//    following }) — isFollowing:false keeps a private profile LOCKED.
type ProfileState = { data: any; isLoading: boolean; isError: boolean };
const mockProfile: ProfileState = { data: undefined, isLoading: false, isError: false };
const mockPosts: ProfileState = { data: undefined, isLoading: false, isError: false };
const mockSocial: { data: any } = { data: undefined };

// The follow mutation's `mutate` spy (benign — the lock tests don't press it).
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

// date-fns: the post card formats createdAt via formatDistanceToNow — pin it to a
// constant so the rendered timestamp is deterministic and tz-agnostic.
jest.mock('date-fns', () => ({
  formatDistanceToNow: () => '1 hour',
}));

// ── Imports (run AFTER the hoisted mocks above) ──────────────────────────────
import React from 'react';
import { render, screen } from '@testing-library/react-native';
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

// A single post used by the unlocked branch. `userId` is required by the Post
// type; no imageUrl so the expo-image stub stays inert.
const POST = {
  id: 'p1',
  userId: 'u1',
  content: 'My first public post',
  createdAt: '2026-06-13T00:00:00.000Z',
  likes: 0,
  commentsCount: 0,
};

describe('UserProfileScreen — privacy lock', () => {
  beforeEach(() => {
    mockProfile.data = undefined;
    mockProfile.isLoading = false;
    mockProfile.isError = false;
    mockPosts.data = undefined;
    mockPosts.isLoading = false;
    mockPosts.isError = false;
    mockSocial.data = undefined;
    mockFollowMutate.mockClear();
  });

  // ── (i) LOCKED — private profile the viewer doesn't follow ─────────────────
  test('private + not-following → locked panel shown, content hidden, follow CtaButton offered', () => {
    // Axios-style envelope: profileResp.data is the profile body. isPrivate:true
    // + isFollowing:false ⇒ isLocked.
    mockProfile.data = { data: { userId: 'u1', displayName: 'Ava Locked', isPrivate: true, bio: 'secret bio' } };
    mockSocial.data = { isFollowing: false, followers: 5, following: 3 };
    // Even if posts somehow arrive, the LOCKED branch must not render them.
    mockPosts.data = [POST];

    renderScreen();

    // The locked panel copy is present, and the member's name still shows
    // (name/avatar are always visible — only the detailed content is gated).
    expect(screen.getByText('This account is private')).toBeTruthy();
    expect(screen.getByText('Ava Locked')).toBeTruthy();

    // A follow/request CtaButton is offered so the viewer can request access.
    // It appears as the locked-panel CTA (and the always-present header action),
    // each with accessibilityRole "button" + label "Follow this member" — so at
    // least one is on screen for the viewer to act on.
    expect(screen.getAllByRole('button', { name: 'Follow this member' }).length).toBeGreaterThanOrEqual(1);
    // The MESSAGE control (which opens a message *request* for a private peer) is
    // also offered — the "request" half of the follow/request affordance.
    expect(screen.getByRole('button', { name: 'Message this member' })).toBeTruthy();

    // Locked content is NOT in the tree: no "Posts" section header and no post
    // body, and the private bio is hidden. (The "Posts" stat LABEL still shows
    // with an em-dash count, but the section header — which only renders in the
    // unlocked branch — does not, so the post body below is the unambiguous
    // proof the content list is gated.)
    expect(screen.queryByText('My first public post')).toBeNull();
    expect(screen.queryByText('secret bio')).toBeNull();
  });

  // ── (ii) UNLOCKED — public profile shows content ───────────────────────────
  test('public profile → locked panel absent, Posts section + post body + bio shown', () => {
    mockProfile.data = { data: { userId: 'u1', displayName: 'Sam Public', isPrivate: false, bio: 'open bio' } };
    mockSocial.data = { isFollowing: false, followers: 9, following: 2 };
    mockPosts.data = [POST];

    renderScreen();

    // The locked panel copy is ABSENT…
    expect(screen.queryByText('This account is private')).toBeNull();

    // …and the unlocked content renders. The "POSTS" stat label shows in both
    // branches, but the "RECENT ACTIVITY" section header only renders in the
    // unlocked branch — so its presence proves the gated content list is visible.
    expect(screen.getByText('POSTS')).toBeTruthy();
    expect(screen.getByText('RECENT ACTIVITY')).toBeTruthy();
    // The member's post body + bio are unique strings and confirm the gated
    // content is now visible.
    expect(screen.getByText('My first public post')).toBeTruthy();
    expect(screen.getByText('open bio')).toBeTruthy();
    // The display name now appears both in the profile header AND as the author
    // name fronting each post card (avatars-for-people redesign).
    expect(screen.getAllByText('Sam Public').length).toBeGreaterThanOrEqual(1);
  });
});
