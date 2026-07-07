/**
 * coaches-browse.test.tsx
 *
 * Screen-level honest-state + finite-guard coverage for the Aurora "Find a Coach"
 * directory — `app/coaches/browse.tsx` (the coach surface under app/coaches/*).
 * Before this file the screen had NO test importing it; this pins the F15 coach
 * item's contract:
 *
 *   - Test A (error): when the ['coach-directory'] query is `isError`, the screen
 *     shows the "Couldn't load coaches" EmptyState whose "Try Again" action calls
 *     the query's `refetch` (exactly once) — NO blank screen, NO Alert.alert, and
 *     the empty / loaded copy is absent.
 *   - Test B (empty): with the query resolved to an empty directory ([]), the
 *     screen shows the "No coaches available" EmptyState and no coach rows.
 *   - Test C (finite-guard): a coach whose `rating` is NaN/undefined and whose
 *     `clients` is NaN renders NO literal "NaN" anywhere — the rating falls back
 *     to the honest "5.0" placeholder and the client count falls back to 0 (the
 *     derived numerics are guarded with Number.isFinite, so garbage never paints
 *     "NaN" into a <Text>).
 *   - Test D (loaded a11y wiring): a populated coach row exposes its "Message"
 *     control as an accessibilityRole="button" carrying a NON-EMPTY descriptive
 *     "Message <name>" label, and pressing it navigates to that coach's thread
 *     (proving the row is wired, not decor).
 *
 * Mock conventions mirror the sibling screen suites (leaderboard.states.test.tsx
 * + community-feed.states.test.tsx): a hoisted `mock`-prefixed react-query stub
 * branches on queryKey[0] over a mutable holder (so each test picks the error /
 * empty / loaded branch BEFORE render), and a single `refetch` spy proves the
 * error retry wiring. `@/api/chat` is fully mocked so the real axios client
 * (via @/api/client) never loads; useQuery is fully stubbed so the stubbed fn is
 * never actually invoked — it only satisfies the import graph. The
 * `@/components/ui` barrel + `@/theme` are kept REAL so the assertions ride on the
 * actual EmptyState copy + its primary Button and the real GlassCard.
 *
 * Additive: NEW test file only; paired with the finite-guard sweep on the screen.
 */

// ── jest.mock hoisting block (runs ABOVE the imports) ────────────────────────

// expo-router: `push` is a hoisted `mock`-prefixed holder so the loaded test can
// assert which route the Message control navigated to. `back`/`replace` are no-ops.
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
}));

// Controlled state for the ['coach-directory'] query — each test mutates this
// holder BEFORE render() (the factory reads it at call-time). `refetch` is the
// spy the error branch's "Try Again" action must call.
type DirState = { data: any; isLoading: boolean; isError: boolean };
const mockDir: DirState = { data: undefined, isLoading: false, isError: false };
const mockRefetch = jest.fn();

// react-query: branch useQuery on queryKey[0]. ['coach-directory'] reads the
// holder above + the shared refetch spy; anything else returns an inert default.
jest.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    const key = queryKey[0];
    if (key === 'coach-directory') {
      return { data: mockDir.data, isLoading: mockDir.isLoading, isError: mockDir.isError, refetch: mockRefetch };
    }
    return { data: undefined, isLoading: false, isError: false, refetch: jest.fn() };
  },
}));

// API module the screen statically imports — stub to a plain jest.fn so axios
// (via @/api/client) never loads. useQuery is fully stubbed above, so this is
// never actually invoked; it only satisfies the import graph.
jest.mock('@/api/chat', () => ({
  getCoachDirectory: jest.fn(),
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
// the avatar Image AND both the GlassCard (variant="glass") gradient and the
// EmptyState's primary Button gradient mount on the jest renderer.
jest.mock('expo-image', () => {
  const RN = require('react-native');
  return { Image: (props: any) => <RN.View {...props} /> };
});
jest.mock('expo-linear-gradient', () => {
  const RN = require('react-native');
  return { LinearGradient: ({ children, ...props }: any) => <RN.View {...props}>{children}</RN.View> };
});

// ── Imports (run AFTER the hoisted mocks above) ──────────────────────────────
import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, screen } from '@testing-library/react-native';
import {
  ThemeContext,
  getThemeColors,
  typography,
  spacing,
  borderRadius,
  shadows,
} from '@/theme';
import CoachesBrowseScreen from '../../app/coaches/browse';

function renderScreen() {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      <CoachesBrowseScreen />
    </ThemeContext.Provider>,
  );
}

// A single populated coach for the loaded case. No avatarUrl so the expo-image
// stub stays inert and the initial-letter fallback renders.
const COACH = {
  id: 'c1',
  name: 'Dr. Ria Vance',
  speciality: 'Shift-work circadian coaching',
  rating: 4.8,
  clients: 27,
};

describe('CoachesBrowseScreen — Find a Coach honest states + finite guards', () => {
  beforeEach(() => {
    mockDir.data = undefined;
    mockDir.isLoading = false;
    mockDir.isError = false;
    mockRefetch.mockClear();
    mockPush.mockClear();
  });

  // ── Test A: error → retryable EmptyState re-invokes refetch, no Alert/blank ─
  test('error: shows the "Couldn\'t load coaches" EmptyState whose Try Again refetches exactly once (no Alert, no blank)', () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockDir.isError = true;

    renderScreen();

    // The honest error copy is present and the empty / loaded copy is absent —
    // an EmptyState, not a blank screen.
    expect(screen.getByText("Couldn't load coaches")).toBeTruthy();
    expect(screen.queryByText('No coaches available')).toBeNull();
    expect(screen.queryByText('Dr. Ria Vance')).toBeNull();

    // The retry action (EmptyState's primary Button, label "Try Again") refetches
    // the directory query — exactly once — and the screen never popped an Alert.
    fireEvent.press(screen.getByText('Try Again'));
    expect(mockRefetch).toHaveBeenCalledTimes(1);
    expect(alertSpy).not.toHaveBeenCalled();

    // The header title renders in every branch — a sanity check the screen mounted.
    expect(screen.getByText('Find a Coach')).toBeTruthy();
    alertSpy.mockRestore();
  });

  // ── Test B: resolved-but-empty directory → honest empty state ──────────────
  test('empty: empty directory [] → "No coaches available" EmptyState and no coach rows', () => {
    mockDir.data = [];

    renderScreen();

    expect(screen.getByText('No coaches available')).toBeTruthy();
    // …and the screen does NOT fall through to the error copy or fabricate a row.
    expect(screen.queryByText("Couldn't load coaches")).toBeNull();
    expect(screen.queryByText('Dr. Ria Vance')).toBeNull();
  });

  // ── Test C: NaN/undefined rating + NaN clients → no literal "NaN" rendered ──
  test('finite-guard: a coach with NaN rating/clients renders NO "NaN" (5.0 + 0 fallbacks shown)', () => {
    // rating undefined (so coach.rating?.toFixed would be undefined, but a NaN
    // would have slipped past `|| '5.0'`); clients explicitly NaN (the bug:
    // `clients || 0` keeps 0 but NaN is falsy → 0, yet a stray non-zero NaN-ish
    // value like Number('x') must never paint "NaN"). We feed NaN for BOTH the
    // pre-toFixed rating path and clients to lock the Number.isFinite guard.
    mockDir.data = [
      { id: 'cNaN', name: 'Coach Garbled', speciality: 'Recovery', rating: NaN, clients: NaN },
    ];

    renderScreen();

    // The row mounted (its name + speciality render)…
    expect(screen.getByText('Coach Garbled')).toBeTruthy();
    expect(screen.getByText('Recovery')).toBeTruthy();

    // …but NO literal "NaN" leaked into any <Text>: the rating shows the honest
    // "5.0" placeholder and the client count shows "0 active clients".
    expect(screen.queryByText('NaN')).toBeNull();
    expect(screen.queryByText(/NaN/)).toBeNull();
    expect(screen.getByText('5.0')).toBeTruthy();
    expect(screen.getByText('• 0 active clients')).toBeTruthy();
  });

  // ── Test D: loaded → Message control is an accessible, labelled, wired button ─
  test('loaded: a coach row exposes accessibilityRole="button" + a non-empty "Message <name>" label that navigates', () => {
    mockDir.data = [COACH];

    renderScreen();

    // Real content renders and neither edge-state copy is present.
    expect(screen.getByText('Dr. Ria Vance')).toBeTruthy();
    expect(screen.queryByText("Couldn't load coaches")).toBeNull();
    expect(screen.queryByText('No coaches available')).toBeNull();

    // The Message control is exposed as an accessibility button with a non-empty
    // descriptive label naming THIS coach (not a bare "Message").
    const messageBtn = screen.getByRole('button', { name: `Message ${COACH.name}` });
    expect(messageBtn).toBeTruthy();
    expect(messageBtn.props.accessibilityLabel).toBe('Message Dr. Ria Vance');
    expect(String(messageBtn.props.accessibilityLabel).length).toBeGreaterThan(0);

    // The real rating + client count render unchanged for a finite coach (the
    // guard is transparent to good data — no fabrication).
    expect(screen.getByText('4.8')).toBeTruthy();
    expect(screen.getByText('• 27 active clients')).toBeTruthy();

    // The control is WIRED (not decor): pressing it opens this coach's thread.
    fireEvent.press(messageBtn);
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith(`/messages/${COACH.id}`);
  });
});
