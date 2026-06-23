/**
 * achievements.test.tsx
 *
 * Screen-level coverage for the Aurora achievements screen —
 * `app/(community)/achievements.tsx` (XP/level card + earned-badge rail + the
 * full badge catalog grouped by tier). This is the COMMUNITY achievements screen
 * (badges/XP), NOT the circadian tab.
 *
 * The screen drives THREE queries — ['my-badges'] (getMyBadges), ['badge-catalog']
 * (getBadgeCatalog) and ['my-score'] (getUserScore) — and renders four mutually
 * exclusive branches: a loading SKELETON scaffold, a retryable ERROR state, an
 * honest EMPTY state (the catalog is empty), and the populated content. It had no
 * screen-level test, so a silent regression of any edge state would never turn a
 * suite red. This suite pins the load-bearing states the hardening item calls out:
 *
 *   - Test A (loading): while a gating query is `isLoading`, the screen mounts its
 *     skeleton scaffold ONLY — the XP-card copy ("CURRENT LEVEL"), the catalog
 *     heading ("All Badges") and the error/empty copy are NOT in the tree yet.
 *   - Test B (error): when a gating query is `isError`, the screen shows the
 *     "Couldn't load achievements" EmptyState whose "Try Again" action refetches
 *     ALL THREE queries (the badges + catalog + score refetch spies each fire
 *     exactly once) — and the empty/loaded copy is absent.
 *   - Test C (empty): with both gating queries resolved but the catalog `[]`, the
 *     screen shows the "No badges yet" EmptyState and renders NO tier section.
 *   - Test D (populated → a11y): with a catalog + earned badges, each badge tile
 *     exposes an accessibilityLabel summarizing its name + locked/unlocked (and
 *     earned-rail) state, so a screen reader announces one node per badge.
 *
 * Mock conventions mirror the sibling `(community)` / `(tabs)` screen suites
 * (requests.test.tsx + circadian.test.tsx): a hoisted `mock`-prefixed react-query
 * stub branches on queryKey[0] over three mutable holders (so each test picks the
 * loading / error / empty / populated branch BEFORE render), and a shared
 * per-query `refetch` spy proves the error retry wiring. `@/api/community` is
 * fully mocked (getMyBadges / getBadgeCatalog / getUserScore are plain jest.fns)
 * so the real axios client never loads; useQuery is fully stubbed, so the queryFns
 * are never invoked. expo-router / icons / gradient / safe-area / status-bar are
 * stubbed the same way as the rest of the suite.
 *
 * The `@/components/ui` barrel is deliberately left REAL: the assertions ride on
 * the actual EmptyState copy + its primary action and the real Skeleton /
 * SkeletonCard, which render fine under the gradient/icon stubs above.
 */

// ── jest.mock hoisting block (runs ABOVE the imports) ────────────────────────

// expo-router: benign no-op router — this suite asserts query/refetch wiring and
// a11y, not navigation. `back`/`push`/`replace` are inert spies.
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));

// Controlled per-query state. Each test mutates these holders BEFORE render()
// (the factory reads them at call-time). The three `refetch` spies are what the
// error branch's "Try Again" action must call (one per query).
type QueryState = { data: any; isLoading: boolean; isError: boolean };
const mockBadges: QueryState = { data: undefined, isLoading: false, isError: false };
const mockCatalog: QueryState = { data: undefined, isLoading: false, isError: false };
const mockScore: QueryState = { data: undefined, isLoading: false, isError: false };
// `mock`-prefixed so babel-plugin-jest-hoist allows the hoisted factory below to
// close over them. One spy per query so the error-retry can be asserted per query.
const mockRefetchBadges = jest.fn();
const mockRefetchCatalog = jest.fn();
const mockRefetchScore = jest.fn();

// react-query: branch on queryKey[0] over the three holders above. Each returns
// its own refetch spy so the error-state retry can be asserted per query.
jest.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    const key = queryKey[0];
    if (key === 'my-badges') {
      return { data: mockBadges.data, isLoading: mockBadges.isLoading, isError: mockBadges.isError, refetch: mockRefetchBadges };
    }
    if (key === 'badge-catalog') {
      return { data: mockCatalog.data, isLoading: mockCatalog.isLoading, isError: mockCatalog.isError, refetch: mockRefetchCatalog };
    }
    if (key === 'my-score') {
      return { data: mockScore.data, isLoading: mockScore.isLoading, isError: mockScore.isError, refetch: mockRefetchScore };
    }
    return { data: undefined, isLoading: false, isError: false, refetch: jest.fn() };
  },
}));

// API module the screen statically imports — stub to plain jest.fns so axios
// (via @/api/client) never loads. useQuery is fully stubbed above, so these are
// never actually invoked; they only satisfy the import graph. `Badge` is a
// type-only import (erased by Babel).
jest.mock('@/api/community', () => ({
  getMyBadges: jest.fn(),
  getBadgeCatalog: jest.fn(),
  getUserScore: jest.fn(),
}));

// Decorative glyphs → plain <Text> surfacing the icon name (mirrors the suite).
// Otherwise pulls in expo-font → expo-asset.
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
// passthrough View so the screen's xpCard/earned-card gradients AND the
// EmptyState's primary Button gradient mount on the jest renderer.
jest.mock('expo-linear-gradient', () => {
  const RN = require('react-native');
  return { LinearGradient: (props: any) => <RN.View {...props} /> };
});

// expo-status-bar renders nothing in the tree under test.
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

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
import AchievementsScreen from '../../app/(community)/achievements';

function renderScreen() {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      <AchievementsScreen />
    </ThemeContext.Provider>,
  );
}

// A small fixed catalog spanning two tiers, with one of them earned. Only the
// shape (id/key/name/tier/description/xpReward) matters to the render.
const CATALOG = [
  { id: 'b1', key: 'first-workout', name: 'First Workout', description: 'Log your first session', iconEmoji: '🏋️', tier: 'bronze', xpReward: 50 },
  { id: 'b2', key: 'night-owl', name: 'Night Owl', description: 'Train after midnight', iconEmoji: '🦉', tier: 'gold', xpReward: 200 },
];
const EARNED = [
  { id: 'b1', key: 'first-workout', name: 'First Workout', description: 'Log your first session', iconEmoji: '🏋️', tier: 'bronze', xpReward: 50 },
];
const SCORE = { userId: 'me', xp: 320, level: 3, xpForNextLevel: 600 };

describe('AchievementsScreen (community badges)', () => {
  beforeEach(() => {
    mockBadges.data = undefined; mockBadges.isLoading = false; mockBadges.isError = false;
    mockCatalog.data = undefined; mockCatalog.isLoading = false; mockCatalog.isError = false;
    mockScore.data = undefined; mockScore.isLoading = false; mockScore.isError = false;
    mockRefetchBadges.mockClear();
    mockRefetchCatalog.mockClear();
    mockRefetchScore.mockClear();
  });

  // ── Test A: loading → skeleton scaffold only ──────────────────────────────
  test('loading: mounts the skeleton scaffold with no XP-card / catalog / state copy', () => {
    mockCatalog.isLoading = true; // a gating query is loading

    expect(() => renderScreen()).not.toThrow();

    // The loading branch renders the skeleton scaffold ONLY — none of the
    // populated copy, and none of the empty/error copy, is in the tree yet.
    expect(screen.queryByText('CURRENT LEVEL')).toBeNull();
    expect(screen.queryByText('All Badges')).toBeNull();
    expect(screen.queryByText('Couldn\'t load achievements')).toBeNull();
    expect(screen.queryByText('No badges yet')).toBeNull();
    expect(screen.queryByText('Try Again')).toBeNull();

    // The header title is rendered in every branch (it lives outside the
    // conditional), so it is a sanity check that the screen mounted at all.
    expect(screen.getByText('Achievements')).toBeTruthy();
  });

  // ── Test B: error → retry refetches all three queries ─────────────────────
  test('error: shows the "Couldn\'t load achievements" EmptyState whose Try Again refetches badges + catalog + score', () => {
    mockBadges.isError = true; // a gating query failed

    renderScreen();

    // The honest error copy is present and the populated/empty copy is absent.
    expect(screen.getByText("Couldn't load achievements")).toBeTruthy();
    expect(screen.queryByText('CURRENT LEVEL')).toBeNull();
    expect(screen.queryByText('No badges yet')).toBeNull();

    // The retry action (EmptyState's primary Button, label "Try Again") refetches
    // ALL THREE queries — exactly once each.
    fireEvent.press(screen.getByText('Try Again'));
    expect(mockRefetchBadges).toHaveBeenCalledTimes(1);
    expect(mockRefetchCatalog).toHaveBeenCalledTimes(1);
    expect(mockRefetchScore).toHaveBeenCalledTimes(1);
  });

  // ── Test C: loaded-but-empty catalog → honest empty state ─────────────────
  test('empty: catalog [] → "No badges yet" EmptyState and no tier section', () => {
    mockBadges.data = [];
    mockCatalog.data = []; // resolved, but empty
    mockScore.data = SCORE;

    renderScreen();

    // The honest zero-data copy is present…
    expect(screen.getByText('No badges yet')).toBeTruthy();
    // …and the screen does NOT fall through to a blank 'All Badges' grid, nor the
    // error copy.
    expect(screen.queryByText('All Badges')).toBeNull();
    expect(screen.queryByText("Couldn't load achievements")).toBeNull();
  });

  // ── Test D: populated → per-badge accessibilityLabel ──────────────────────
  test('populated: each badge tile exposes an accessibilityLabel for its name + locked/unlocked state', () => {
    mockBadges.data = EARNED;
    mockCatalog.data = CATALOG;
    mockScore.data = SCORE;

    renderScreen();

    // Populated content (not an edge state).
    expect(screen.getByText('All Badges')).toBeTruthy();
    expect(screen.queryByText('No badges yet')).toBeNull();

    // The earned tile (First Workout, in both the earned rail and the catalog as
    // unlocked) and the locked catalog tile (Night Owl) each surface a single
    // a11y summary node.
    expect(screen.getByLabelText('First Workout badge, Bronze tier, earned')).toBeTruthy();
    expect(screen.getByLabelText('First Workout badge, unlocked')).toBeTruthy();
    expect(screen.getByLabelText('Night Owl badge, locked')).toBeTruthy();
  });
});
