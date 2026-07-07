/**
 * leaderboard.test.tsx
 *
 * Screen-level coverage for the Aurora community leaderboard —
 * `app/(community)/leaderboard.tsx`.
 *
 * That screen drives the ['community-leaderboard'] query (getLeaderboard), a
 * per-row ['user-social', userId] query (getUserSocial) and a per-row follow
 * MUTATION (followUser / unfollowUser) behind an optimistic toggle, renders the
 * enriched displayName/avatar from the API, makes every row tappable
 * (-> /(community)/userProfile?userId=<id>) and suppresses the Follow control on
 * the current user's own row. This suite pins exactly that behaviour so a
 * refactor can't silently regress it:
 *
 *   - FALLBACK: a row with no displayName/name renders the literal 'Athlete'
 *     (the OLD 'Zeitra Member' fallback must be gone);
 *   - ENRICHED: a row WITH a displayName renders that real name;
 *   - TAP: pressing a list row pushes '/(community)/userProfile?userId=<id>';
 *   - SELF: the current user's row shows "(You)" and renders NO Follow control,
 *     while a non-self row DOES render a Follow control;
 *   - FOLLOW: pressing a row's Follow control calls the (imported, item-5-owned)
 *     follow mutation's mutate().
 *
 * Additive + verify-only: NEW test file only; the screen is untouched. Mock
 * conventions mirror the sibling screen suites (community.test.tsx) — the hoisted
 * `mock`-prefixed holder pattern so babel-plugin-jest-hoist allows the hoisted
 * factory to close over the holder.
 */

// ── jest.mock hoisting block (runs ABOVE the imports) ────────────────────────

// expo-router: `push` is a hoisted `mock`-prefixed holder so each test can
// assert exactly which route a tapped row navigated to.
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
}));

// Controlled state for the ['community-leaderboard'] query — each test mutates
// this holder BEFORE render() (the factory reads it at call-time).
type LbState = { data: any; isLoading: boolean };
const mockLb: LbState = { data: undefined, isLoading: false };

// The follow mutation's `mutate` spy. The screen calls toggle.mutate() from a
// row's Follow control, so asserting on this proves the follow wiring.
const mockToggleMutate = jest.fn();

// react-query: branch useQuery on queryKey[0]. ['community-leaderboard'] reads
// the holder above; ['user-social', userId] returns a default not-following
// state so every non-self row shows a "Follow" control. useMutation returns the
// toggle spy; useQueryClient is a benign stub the optimistic onMutate calls.
jest.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    const key = queryKey[0];
    if (key === 'community-leaderboard') {
      return { data: mockLb.data, isLoading: mockLb.isLoading };
    }
    if (key === 'user-social') {
      return { data: { isFollowing: false, followers: 0, following: 0 } };
    }
    return { data: undefined, isLoading: false };
  },
  useMutation: () => ({ mutate: mockToggleMutate, isPending: false, isError: false, reset: jest.fn() }),
  useQueryClient: () => ({
    cancelQueries: jest.fn(),
    getQueryData: jest.fn(),
    setQueryData: jest.fn(),
    invalidateQueries: jest.fn(),
  }),
}));

// API module the screen statically imports — stub to plain jest.fns so axios
// (via @/api/client) never loads. useQuery / useMutation are fully stubbed
// above, so these are never actually invoked; they only satisfy the import graph.
jest.mock('@/api/community', () => ({
  getLeaderboard: jest.fn(),
  followUser: jest.fn(),
  unfollowUser: jest.fn(),
  getUserSocial: jest.fn(),
}));

// Auth store: the screen reads the current user's id via
// useAuthStore((s) => s.user?.id). Drive that selector against a fixed state so
// the SELF row is deterministic.
jest.mock('@/store/authStore', () => ({
  useAuthStore: (selector: (s: any) => unknown) => selector({ user: { id: 'me-1' } }),
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

// expo-image / expo-linear-gradient ship native modules — passthrough Views so
// the Avatar primitive (used for every row) mounts on the jest renderer.
jest.mock('expo-image', () => {
  const RN = require('react-native');
  return { Image: (props: any) => <RN.View {...props} /> };
});
jest.mock('expo-linear-gradient', () => {
  const RN = require('react-native');
  return { LinearGradient: (props: any) => <RN.View {...props} /> };
});

// imageUrl trust-gate → passthrough so avatar URLs are deterministic.
jest.mock('@/lib/imageUrl', () => ({
  safeImageUri: (uri?: string | null) => uri ?? undefined,
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
import LeaderboardScreen from '../../app/(community)/leaderboard';

function renderScreen() {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      <LeaderboardScreen />
    </ThemeContext.Provider>,
  );
}

// A leaderboard with > 3 entries so there is at least one LIST row (rank 4+)
// below the top-3 podium. The authenticated user ('me-1') appears ONLY in
// myScore (the fixed footer row), not in the ranked array, so each self/other
// row is unambiguous in the tree. Row #5 has NO name → exercises the 'Athlete'
// fallback; row #4 ('Liam Pace') carries a real displayName for tap/follow.
const LEADERBOARD = {
  leaderboard: [
    { userId: 'u1', displayName: 'Ava Strong', avatarUrl: null, xp: 980 },
    { userId: 'u2', displayName: 'Noah Swift', avatarUrl: null, xp: 870 },
    { userId: 'u3', displayName: 'Mia Quick', avatarUrl: null, xp: 760 },
    { userId: 'u4', displayName: 'Liam Pace', avatarUrl: null, xp: 540 },
    { userId: 'u5', xp: 410 }, // no displayName → 'Athlete'
  ],
  myScore: { userId: 'me-1', displayName: 'My Name', xp: 320, level: 3 },
};

describe('LeaderboardScreen', () => {
  beforeEach(() => {
    mockLb.data = undefined;
    mockLb.isLoading = false;
    mockPush.mockClear();
    mockToggleMutate.mockClear();
  });

  // ── (i) empty → "No rankings yet" EmptyState ───────────────────────────────
  test('no leaderboard → "No rankings yet" EmptyState', () => {
    mockLb.data = { leaderboard: [], myScore: undefined };

    renderScreen();

    expect(screen.getByText('No rankings yet')).toBeTruthy();
  });

  // ── (ii) the 'Athlete' fallback renders; 'Zeitra Member' is gone ───────────
  test("list row with no name renders 'Athlete' (not 'Zeitra Member')", () => {
    mockLb.data = LEADERBOARD;

    renderScreen();

    expect(screen.getByText('Athlete')).toBeTruthy();
    expect(screen.queryByText('Zeitra Member')).toBeNull();
    // …and a real enriched displayName renders too.
    expect(screen.getByText('Liam Pace')).toBeTruthy();
  });

  // ── (iii) tapping a list row navigates to that user's profile ──────────────
  test('tapping a row pushes /(community)/userProfile?userId=<id>', () => {
    mockLb.data = LEADERBOARD;

    renderScreen();

    fireEvent.press(screen.getByRole('button', { name: /View Liam Pace's profile/ }));
    expect(mockPush).toHaveBeenCalledWith('/(community)/userProfile?userId=u4');
  });

  // ── (iv) self row hides the Follow control; non-self row shows it ──────────
  test('self row shows "(You)" and no Follow control; non-self row has Follow', () => {
    mockLb.data = LEADERBOARD;

    renderScreen();

    // The SELF footer row (myScore = 'me-1', isSelf) is always rendered. It shows
    // "(You)" and exposes NO Follow control for the current user.
    expect(screen.getByText(/My Name \(You\)/)).toBeTruthy();
    expect(screen.queryByTestId('follow-btn-me-1')).toBeNull();

    // A non-self list row DOES expose a per-row Follow control, labelled with the
    // member's name for screen readers.
    const liamFollow = screen.getByTestId('follow-btn-u4');
    expect(liamFollow).toBeTruthy();
    expect(liamFollow.props.accessibilityLabel).toBe('Follow Liam Pace');
  });

  // ── (v) pressing a row's Follow control fires the toggle mutation ──────────
  test("pressing a non-self row's Follow control calls the toggle mutation", () => {
    mockLb.data = LEADERBOARD;

    renderScreen();

    fireEvent.press(screen.getByTestId('follow-btn-u4'));
    expect(mockToggleMutate).toHaveBeenCalledTimes(1);
  });

  // ── (vi) the self "My Rank" row renders inside the Aurora GlassCard surface ─
  // The Aurora restyle wraps the self (isSelf) row in a GlassCard whose outer
  // wrapper carries a stable `leader-row-card-<userId>` testID. This pins that
  // the highlighted self row is rendered INSIDE that glass surface — and that
  // tapping the row from within the surface still navigates to the profile, so
  // the surface wrapper changed nothing about the row's behaviour.
  test('self row renders inside the GlassCard surface and stays tappable', () => {
    mockLb.data = LEADERBOARD;

    renderScreen();

    // The self footer row (myScore = 'me-1') is wrapped in the GlassCard surface.
    const selfCard = screen.getByTestId('leader-row-card-me-1');
    // The rank row body — its name + "(You)" marker — renders INSIDE that surface.
    expect(within(selfCard).getByText(/My Name \(You\)/)).toBeTruthy();
    // …and the tappable row still lives inside the surface and navigates on press.
    fireEvent.press(within(selfCard).getByRole('button', { name: /View My Name's profile/ }));
    expect(mockPush).toHaveBeenCalledWith('/(community)/userProfile?userId=me-1');

    // A NON-self list row is NOT wrapped in a glass surface (no card testID) — the
    // restyle is scoped to the self highlight, leaving plain rows untouched.
    expect(screen.queryByTestId('leader-row-card-u4')).toBeNull();
  });
});
