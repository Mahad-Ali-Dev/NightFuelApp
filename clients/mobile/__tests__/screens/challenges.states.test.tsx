/**
 * challenges.states.test.tsx
 *
 * Screen-level coverage for the THREE load-bearing states of the Aurora community
 * challenges screen — `app/(community)/challenges.tsx` (the join + inline
 * progress-logger surface). The screen drives the ['community-challenges'] query
 * (getChallenges) and renders four mutually exclusive branches inside its
 * ScrollView: a loading SKELETON scaffold, a retryable ERROR state, an honest
 * EMPTY state, and the populated challenge cards. This suite pins the spinner-debt
 * burn-down specifically:
 *
 *   - Test A (loading): while the query is `isLoading`, the screen mounts its
 *     SKELETON card scaffold ONLY — none of the empty ("No active challenges"),
 *     error ("Couldn't load challenges") or loaded challenge copy is in the tree,
 *     and there is NO bare full-screen <ActivityIndicator> as the primary loading
 *     state (the only remaining ActivityIndicator is the inline submit-button
 *     spinner, which is gated behind a joined+expanded card and never mounts here).
 *   - Test B (error): when the query is `isError`, the screen shows the
 *     "Couldn't load challenges" EmptyState whose "Try Again" action calls the
 *     query's `refetch` (exactly once) — and the empty / loaded copy is absent.
 *   - Test C (empty): with the query resolved to `[]`, the screen shows the
 *     "No active challenges" EmptyState and no challenge cards.
 *   - Test D (loaded): with a populated list the screen renders the real challenge
 *     title — and neither edge-state copy is present.
 *
 * Mock conventions mirror the sibling screen suites (achievements.test.tsx +
 * community.test.tsx): a hoisted `mock`-prefixed react-query stub branches on
 * queryKey[0] over a mutable holder (so each test picks the loading / error /
 * empty / loaded branch BEFORE render), and a single `refetch` spy proves the
 * error retry wiring. `@/api/community` is fully mocked so the real axios client
 * never loads; useMutation / useQueryClient are benign stubs (the join / progress
 * mutations are untouched by this change). The `@/components/ui` barrel is left
 * REAL so the assertions ride on the actual EmptyState copy + primary action and
 * the real Skeleton / SkeletonCard.
 *
 * Additive: NEW test file only.
 */

// ── jest.mock hoisting block (runs ABOVE the imports) ────────────────────────

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));

// Controlled state for the ['community-challenges'] query — each test mutates
// this holder BEFORE render() (the factory reads it at call-time). `refetch` is
// the spy the error branch's "Try Again" action must call.
type ChState = { data: any; isLoading: boolean; isError: boolean };
const mockCh: ChState = { data: undefined, isLoading: false, isError: false };
const mockRefetch = jest.fn();

// react-query: branch useQuery on queryKey[0]. ['community-challenges'] reads the
// holder above + the shared refetch spy. useMutation returns benign spies (the
// join / progress mutations are not exercised by these state tests).
jest.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    const key = queryKey[0];
    if (key === 'community-challenges') {
      return { data: mockCh.data, isLoading: mockCh.isLoading, isError: mockCh.isError, refetch: mockRefetch };
    }
    return { data: undefined, isLoading: false, isError: false, refetch: jest.fn() };
  },
  useMutation: () => ({ mutate: jest.fn(), isPending: false, isError: false, reset: jest.fn() }),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

// API module the screen statically imports — stub to plain jest.fns so axios
// (via @/api/client) never loads. useQuery / useMutation are fully stubbed above,
// so these are never actually invoked; they only satisfy the import graph.
jest.mock('@/api/community', () => ({
  getChallenges: jest.fn(),
  joinChallenge: jest.fn(),
  updateChallengeProgress: jest.fn(),
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

// expo-linear-gradient ships a native module — passthrough View so the
// EmptyState's primary Button gradient mounts on the jest renderer.
jest.mock('expo-linear-gradient', () => {
  const RN = require('react-native');
  return { LinearGradient: (props: any) => <RN.View {...props} /> };
});

// expo-status-bar renders nothing in the tree under test.
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

// The Aurora restyle wraps each challenge card (and the loading skeleton card) in
// the GlassCard primitive, which renders a SafeBlurView (expo-blur native) fill.
// Replace SafeBlurView with a passthrough View — preserving its forwarded props
// (notably the outer wrapper's testID) — so GlassCard mounts deterministically on
// the jest renderer regardless of the Android<12 blur fallback branch.
jest.mock('@/components/SafeBlurView', () => {
  const RN = require('react-native');
  return { SafeBlurView: ({ children, ...props }: any) => <RN.View {...props}>{children}</RN.View> };
});

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
import ChallengesScreen from '../../app/(community)/challenges';

function renderScreen() {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      <ChallengesScreen />
    </ThemeContext.Provider>,
  );
}

// A small fixed set of challenges. Only the shape (id/title/description/
// participants) matters to the render; `myProgress` undefined => not joined.
const CHALLENGES = [
  { id: 'c1', title: '10k Steps a Day', description: 'Walk 10,000 steps daily for a week', participants: 128 },
  { id: 'c2', title: 'Early Riser', description: 'Wake before 6am five days running', participants: 64 },
];

describe('ChallengesScreen — loading / error / empty / loaded states', () => {
  beforeEach(() => {
    mockCh.data = undefined;
    mockCh.isLoading = false;
    mockCh.isError = false;
    mockRefetch.mockClear();
  });

  // ── Test A: loading → skeleton scaffold only (no bare spinner) ─────────────
  test('loading: mounts the skeleton scaffold with no empty / error / loaded copy', () => {
    mockCh.isLoading = true;

    expect(() => renderScreen()).not.toThrow();

    // The loading branch renders the skeleton card scaffold ONLY — none of the
    // empty / error / loaded copy is in the tree yet.
    expect(screen.queryByText('No active challenges')).toBeNull();
    expect(screen.queryByText("Couldn't load challenges")).toBeNull();
    expect(screen.queryByText('Try Again')).toBeNull();
    expect(screen.queryByText('10k Steps a Day')).toBeNull();

    // The header title is rendered in every branch (it lives outside the
    // conditional), so it is a sanity check that the screen mounted at all.
    expect(screen.getByText('Community Challenges')).toBeTruthy();
  });

  // ── Test B: error → retry refetches the challenges query ───────────────────
  test('error: shows the "Couldn\'t load challenges" EmptyState whose Try Again refetches', () => {
    mockCh.isError = true;

    renderScreen();

    // The honest error copy is present and the empty / loaded copy is absent.
    expect(screen.getByText("Couldn't load challenges")).toBeTruthy();
    expect(screen.queryByText('No active challenges')).toBeNull();
    expect(screen.queryByText('10k Steps a Day')).toBeNull();

    // The retry action (EmptyState's primary Button, label "Try Again") refetches
    // the challenges query — exactly once.
    fireEvent.press(screen.getByText('Try Again'));
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  // ── Test C: resolved-but-empty list → honest empty state ───────────────────
  test('empty: challenges [] → "No active challenges" EmptyState and no cards', () => {
    mockCh.data = [];

    renderScreen();

    expect(screen.getByText('No active challenges')).toBeTruthy();
    // …and the screen does NOT fall through to the error or loaded copy.
    expect(screen.queryByText("Couldn't load challenges")).toBeNull();
    expect(screen.queryByText('10k Steps a Day')).toBeNull();
  });

  // ── Test D: loaded → real challenge cards render inside the GlassCard surface ─
  test('loaded: renders the real challenge titles and no edge-state copy', () => {
    mockCh.data = CHALLENGES;

    renderScreen();

    expect(screen.getByText('10k Steps a Day')).toBeTruthy();
    expect(screen.getByText('Early Riser')).toBeTruthy();
    // …and neither edge-state copy is present.
    expect(screen.queryByText('No active challenges')).toBeNull();
    expect(screen.queryByText("Couldn't load challenges")).toBeNull();
  });

  // ── Test E: loaded → each card body lives INSIDE the new GlassCard surface ───
  // Aurora restyle: every challenge card is now wrapped in the GlassCard primitive
  // whose outer wrapper carries the stable `challenge-card-<id>` testID. This pins
  // the surface conversion — the card's title (the body copy) renders WITHIN that
  // glass surface, not as a loose sibling — without touching the join/log handlers
  // or the loading / error / empty branches asserted above.
  test('loaded: each challenge card renders inside its GlassCard surface', () => {
    mockCh.data = CHALLENGES;

    renderScreen();

    const firstCard = screen.getByTestId('challenge-card-c1');
    expect(within(firstCard).getByText('10k Steps a Day')).toBeTruthy();

    const secondCard = screen.getByTestId('challenge-card-c2');
    expect(within(secondCard).getByText('Early Riser')).toBeTruthy();

    // One GlassCard surface per challenge in the populated list.
    expect(screen.getAllByTestId(/^challenge-card-/)).toHaveLength(CHALLENGES.length);
  });
});
