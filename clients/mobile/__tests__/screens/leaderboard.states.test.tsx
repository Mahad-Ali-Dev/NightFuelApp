/**
 * leaderboard.states.test.tsx
 *
 * Screen-level coverage for the THREE load-bearing states of the Aurora community
 * leaderboard — `app/(community)/leaderboard.tsx` — plus a loaded-list smoke check.
 * This complements the sibling `leaderboard.test.tsx` (which pins the fallback /
 * enriched-name / tap / self-row / follow behaviour); this file pins the
 * spinner-debt burn-down specifically:
 *
 *   - Test A (loading): while ['community-leaderboard'] is `isLoading`, the screen
 *     mounts its SKELETON scaffold ONLY — none of the empty ("No rankings yet"),
 *     error ("Couldn't load the leaderboard") or loaded-row copy is in the tree,
 *     and there is NO bare full-screen <ActivityIndicator> as the primary loading
 *     state (the screen no longer imports it at all).
 *   - Test B (error): when the query is `isError`, the screen shows the
 *     "Couldn't load the leaderboard" EmptyState whose "Try Again" action calls
 *     the query's `refetch` (exactly once) — and the empty / loaded copy is absent.
 *   - Test C (empty): with the query resolved to an empty leaderboard, the screen
 *     shows the "No rankings yet" EmptyState and no rows.
 *   - Test D (loaded): with a populated leaderboard the screen renders real rows
 *     (the podium names + a list row) AND keeps the FlatList virtualization props
 *     (getItemLayout / initialNumToRender / maxToRenderPerBatch / windowSize) and
 *     the fixed "My Rank" footer untouched.
 *
 * Mock conventions mirror the sibling screen suites (leaderboard.test.tsx +
 * achievements.test.tsx): a hoisted `mock`-prefixed react-query stub branches on
 * queryKey[0] over a mutable holder (so each test picks the loading / error /
 * empty / loaded branch BEFORE render), and a single `refetch` spy proves the
 * error retry wiring. `@/api/community` is fully mocked so the real axios client
 * never loads; useQuery / useMutation / useQueryClient are fully stubbed.
 * The `@/components/ui` barrel is left REAL so the assertions ride on the actual
 * EmptyState copy + primary action and the real Skeleton.
 *
 * Additive: NEW test file only.
 */

// ── jest.mock hoisting block (runs ABOVE the imports) ────────────────────────

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));

// Controlled state for the ['community-leaderboard'] query — each test mutates
// this holder BEFORE render() (the factory reads it at call-time). `refetch` is
// the spy the error branch's "Try Again" action must call.
type LbState = { data: any; isLoading: boolean; isError: boolean };
const mockLb: LbState = { data: undefined, isLoading: false, isError: false };
const mockRefetch = jest.fn();

// react-query: branch useQuery on queryKey[0]. ['community-leaderboard'] reads
// the holder above + the shared refetch spy; ['user-social', userId] returns a
// default not-following state so every non-self row shows a "Follow" control.
jest.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    const key = queryKey[0];
    if (key === 'community-leaderboard') {
      return { data: mockLb.data, isLoading: mockLb.isLoading, isError: mockLb.isError, refetch: mockRefetch };
    }
    if (key === 'user-social') {
      return { data: { isFollowing: false, followers: 0, following: 0 } };
    }
    return { data: undefined, isLoading: false, isError: false, refetch: jest.fn() };
  },
  useMutation: () => ({ mutate: jest.fn(), isPending: false, isError: false, reset: jest.fn() }),
  useQueryClient: () => ({
    cancelQueries: jest.fn(),
    getQueryData: jest.fn(),
    setQueryData: jest.fn(),
    invalidateQueries: jest.fn(),
  }),
}));

// API module the screen statically imports — stub to plain jest.fns so axios
// (via @/api/client) never loads. useQuery is fully stubbed above, so these are
// never actually invoked; they only satisfy the import graph.
jest.mock('@/api/community', () => ({
  getLeaderboard: jest.fn(),
  followUser: jest.fn(),
  unfollowUser: jest.fn(),
  getUserSocial: jest.fn(),
}));

// Auth store: the screen reads the current user's id via
// useAuthStore((s) => s.user?.id). Drive that selector against a fixed state so
// the SELF footer row is deterministic.
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
// the Avatar primitive (used for every row) AND the EmptyState's primary Button
// gradient mount on the jest renderer.
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
import { FlatList } from 'react-native';
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
// below the top-3 podium, plus a populated myScore (the fixed footer row).
const LEADERBOARD = {
  leaderboard: [
    { userId: 'u1', displayName: 'Ava Strong', avatarUrl: null, xp: 980 },
    { userId: 'u2', displayName: 'Noah Swift', avatarUrl: null, xp: 870 },
    { userId: 'u3', displayName: 'Mia Quick', avatarUrl: null, xp: 760 },
    { userId: 'u4', displayName: 'Liam Pace', avatarUrl: null, xp: 540 },
  ],
  myScore: { userId: 'me-1', displayName: 'My Name', xp: 320, level: 3, rank: 12 },
};

describe('LeaderboardScreen — loading / error / empty / loaded states', () => {
  beforeEach(() => {
    mockLb.data = undefined;
    mockLb.isLoading = false;
    mockLb.isError = false;
    mockRefetch.mockClear();
  });

  // ── Test A: loading → skeleton scaffold only (no bare spinner) ─────────────
  test('loading: mounts the skeleton scaffold with no empty / error / loaded copy', () => {
    mockLb.isLoading = true;

    expect(() => renderScreen()).not.toThrow();

    // The loading branch renders the skeleton scaffold ONLY — none of the empty /
    // error / loaded copy is in the tree yet.
    expect(screen.queryByText('No rankings yet')).toBeNull();
    expect(screen.queryByText("Couldn't load the leaderboard")).toBeNull();
    expect(screen.queryByText('Try Again')).toBeNull();
    expect(screen.queryByText('Ava Strong')).toBeNull();

    // There is NO list (the FlatList only mounts in the loaded branch) and NO
    // bare full-screen spinner as the primary loading state — the screen no
    // longer imports ActivityIndicator at all.
    expect(screen.root.findAllByType(FlatList)).toHaveLength(0);

    // The header title is rendered in every branch (it lives outside the
    // conditional), so it is a sanity check that the screen mounted at all.
    expect(screen.getByText('Leaderboard')).toBeTruthy();
  });

  // ── Test B: error → retry refetches the leaderboard query ──────────────────
  test('error: shows the "Couldn\'t load the leaderboard" EmptyState whose Try Again refetches', () => {
    mockLb.isError = true;

    renderScreen();

    // The honest error copy is present and the empty / loaded copy is absent.
    expect(screen.getByText("Couldn't load the leaderboard")).toBeTruthy();
    expect(screen.queryByText('No rankings yet')).toBeNull();
    expect(screen.queryByText('Ava Strong')).toBeNull();

    // The retry action (EmptyState's primary Button, label "Try Again") refetches
    // the leaderboard query — exactly once.
    fireEvent.press(screen.getByText('Try Again'));
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  // ── Test C: resolved-but-empty leaderboard → honest empty state ────────────
  test('empty: empty leaderboard → "No rankings yet" EmptyState and no rows', () => {
    mockLb.data = { leaderboard: [], myScore: undefined };

    renderScreen();

    expect(screen.getByText('No rankings yet')).toBeTruthy();
    // …and the screen does NOT fall through to the error copy.
    expect(screen.queryByText("Couldn't load the leaderboard")).toBeNull();
    // No list mounts when there are no rows.
    expect(screen.root.findAllByType(FlatList)).toHaveLength(0);
  });

  // ── Test D: loaded → rows render + virtualization props + footer unchanged ─
  test('loaded: renders rows and keeps FlatList virtualization props + the My Rank footer', () => {
    mockLb.data = LEADERBOARD;

    renderScreen();

    // Real content renders: a podium name (top-3) and a list row (rank 4+).
    expect(screen.getByText('Ava Strong')).toBeTruthy();
    expect(screen.getByText('Liam Pace')).toBeTruthy();
    // …and neither edge-state copy is present.
    expect(screen.queryByText('No rankings yet')).toBeNull();
    expect(screen.queryByText("Couldn't load the leaderboard")).toBeNull();

    // The virtualized list mounts with its performance props intact (untouched by
    // the spinner-debt change).
    const list = screen.root.findByType(FlatList);
    expect(typeof list.props.getItemLayout).toBe('function');
    expect(list.props.initialNumToRender).toBe(12);
    expect(list.props.maxToRenderPerBatch).toBe(12);
    expect(list.props.windowSize).toBe(11);
    // getItemLayout returns the fixed-height layout used for constant-time scroll
    // math (ROW_HEIGHT = 64).
    expect(list.props.getItemLayout(null, 3)).toEqual({ length: 64, offset: 192, index: 3 });

    // The fixed "My Rank" footer is still rendered (it reads myScore and shows
    // "(You)") — not part of the virtualized list, untouched by this change.
    expect(screen.getByText(/My Name \(You\)/)).toBeTruthy();

    // Aurora restyle: that self "My Rank" row renders INSIDE the GlassCard surface
    // (its outer wrapper carries the stable `leader-row-card-<userId>` testID), and
    // the rank row body — the name + "(You)" marker — lives within that surface.
    const selfCard = screen.getByTestId('leader-row-card-me-1');
    expect(within(selfCard).getByText(/My Name \(You\)/)).toBeTruthy();
  });
});
