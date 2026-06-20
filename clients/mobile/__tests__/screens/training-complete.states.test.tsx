/**
 * training-complete.states.test.tsx
 *
 * Screen-level coverage for the honest empty / 0-safe states of the Training
 * Summary screen — `app/training/complete.tsx`. The screen receives
 * elapsed/volume/kcal as route params from the active-workout `handleEnd`
 * (workout.tsx). On the normal finish path those are finite strings and the
 * screen renders three formatted stat cards (Volume / Time / Burn). But the
 * same route is reachable as a RAW DEEP LINK, a COLD RELOAD, or an ABORTED
 * FINISH where the params are absent or garbage — and previously the screen
 * silently rendered three zeroed cards (or, for a non-numeric param, risked a
 * fabricated value leaking into a Text node). The screen now derives
 *
 *   hasAnyMetric = Number.isFinite(elapsedSeconds)
 *                  && (elapsedSeconds > 0 || totalVolume > 0 || totalKcal > 0)
 *
 * and branches via ternary-null: the three glass stat cards when there is a
 * real metric, otherwise an honest "No session data" EmptyState above the
 * (untouched) cyan Return-to-Dashboard CTA. This suite pins that gap:
 *
 *   - Test A (valid params → formatted metrics): elapsed/volume/kcal present
 *     and finite → the three formatted stats render (Volume kg / Time / Burn
 *     kcal) and the empty-state copy is absent.
 *   - Test B (garbage param → no NaN leak, EmptyState renders): a non-numeric
 *     volume with the other params absent → NO "NaN"/"undefined" text leaks
 *     into the tree, the stat labels are gone, the honest "No session data"
 *     EmptyState renders, and the screen still mounts.
 *   - Test C (all params absent → EmptyState renders): a bare mount (raw deep
 *     link) → the EmptyState renders, no NaN/undefined leaks, screen mounts.
 *   - Test D (Return CTA routes): pressing "Return to Dashboard" dismisses the
 *     stack and `router.replace('/(tabs)')` exactly once, and invalidates the
 *     active-session caches — the navigation contract is intact on BOTH the
 *     valid and the empty mount.
 *
 * Mock conventions mirror the sibling state suites (log-meal.numericGuard +
 * training-workout.states): expo-router exposes a hoisted router (replace /
 * dismissAll spies) + a mutable `mockParams` holder; `useQueryClient` is a
 * benign stub carrying an `invalidateQueries` spy. The REAL `@/components/ui`
 * barrel + `@/theme` mount, so the assertions ride on the actual EmptyState
 * copy and the real glass `Card`. Decorative glyphs / expo-linear-gradient /
 * insets / status bar are stubbed the usual way (no native module loads).
 *
 * Additive: NEW test file only.
 */

// ── jest.mock hoisting block (runs ABOVE the imports) ────────────────────────

const mockReplace = jest.fn();
const mockDismissAll = jest.fn();
// Mutable param holder — each test sets the deep-link params before render.
const mockParams: { current: Record<string, string> } = { current: {} };
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, dismissAll: mockDismissAll, push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => mockParams.current,
}));

// The screen only uses useQueryClient (to invalidate the active-session caches
// on return). A benign stub carrying the invalidate spy is all that's needed.
const mockInvalidate = jest.fn();
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidate }),
}));

// Decorative glyphs → plain <Text> surfacing the icon name.
jest.mock('@expo/vector-icons', () => {
  const { Text: RNText } = require('react-native');
  return { Ionicons: ({ name }: { name?: string }) => <RNText>{`icon:${name ?? ''}`}</RNText> };
});

// Deterministic insets so the screen lays out without the native provider.
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));

// expo-linear-gradient ships a native module; the celebratory scrim, the glass
// Card fill, and the cyan Return CTA all use it → passthrough View so the REAL
// Card / CTA mount on the jest renderer.
jest.mock('expo-linear-gradient', () => {
  const RN = require('react-native');
  return { LinearGradient: ({ children, ...rest }: any) => <RN.View {...rest}>{children}</RN.View> };
});

// expo-status-bar renders nothing in the tree under test.
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

// ── Imports (run AFTER the hoisted mocks above) ──────────────────────────────
import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react-native';
import { ThemeContext, getThemeColors, typography, spacing, borderRadius, shadows } from '@/theme';
import WorkoutCompleteScreen from '../../app/training/complete';

function renderScreen() {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      <WorkoutCompleteScreen />
    </ThemeContext.Provider>,
  );
}

describe('WorkoutCompleteScreen — honest empty / 0-safe summary states', () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockDismissAll.mockClear();
    mockInvalidate.mockClear();
    mockParams.current = {};
  });

  // ── Test A: valid params → the three formatted metrics render ───────────────
  // The realistic finish path: a finite elapsed plus positive volume/kcal. The
  // three glass stat cards render their formatted values, and the honest
  // empty-state copy is NOT in the tree.
  test('valid params render the three formatted metrics (no empty state)', () => {
    // elapsed 125s → "2m 5s"; volume 500 → "500" kg; kcal 320 → "320" kcal.
    // (Values chosen with no thousands-grouping so toLocaleString is locale-stable.)
    mockParams.current = { elapsed: '125', volume: '500', kcal: '320' };

    expect(() => renderScreen()).not.toThrow();

    // The three stat labels + their formatted values are present.
    expect(screen.getByText('Volume')).toBeTruthy();
    expect(screen.getByText('Time')).toBeTruthy();
    expect(screen.getByText('Burn')).toBeTruthy();
    expect(screen.getByText('2m 5s')).toBeTruthy();
    // Volume / Burn numbers live in a composite Text (value + a nested unit
    // <Text>), so they are matched as a substring; the unit suffix sits in its
    // own single-child <Text> and is matched exactly.
    expect(screen.getByText(/^500/)).toBeTruthy();
    expect(screen.getByText('kg')).toBeTruthy();
    expect(screen.getByText(/^320/)).toBeTruthy();
    expect(screen.getByText('kcal')).toBeTruthy();

    // The honest empty-state branch is NOT taken on the valid path.
    expect(screen.queryByText('No session data')).toBeNull();
    // …and nothing fabricated leaked.
    expect(screen.queryByText(/NaN/)).toBeNull();
    expect(screen.queryByText(/undefined/)).toBeNull();
  });

  // ── Test B: a garbage param → no NaN leak, honest EmptyState renders ────────
  // A non-numeric `volume` with the other two params absent is the
  // aborted-finish / tampered-deep-link shape. `hasAnyMetric` is false (elapsed
  // absent → 0, volume parses to NaN→0 via Math.max, kcal absent → 0), so the
  // screen takes the EmptyState branch — and crucially NO "NaN"/"undefined"
  // string leaks into any Text node.
  test('garbage volume param: no NaN/undefined leaks and the "No session data" EmptyState renders', () => {
    mockParams.current = { volume: 'abc' };

    expect(() => renderScreen()).not.toThrow();

    // No fabricated value leaked into the tree.
    expect(screen.queryByText(/NaN/)).toBeNull();
    expect(screen.queryByText(/undefined/)).toBeNull();

    // The stat cards are NOT rendered (the empty branch is taken instead).
    expect(screen.queryByText('Volume')).toBeNull();
    expect(screen.queryByText('Time')).toBeNull();
    expect(screen.queryByText('Burn')).toBeNull();

    // The honest empty state is present (the real EmptyState copy).
    expect(screen.getByText('No session data')).toBeTruthy();

    // The screen still mounts its primary chrome — the Return CTA is present.
    expect(screen.getByText('Return to Dashboard')).toBeTruthy();
  });

  // ── Test C: all params absent → honest EmptyState renders ───────────────────
  // A raw deep link / cold reload with NO params at all. Same honest-states
  // contract: EmptyState renders, nothing fabricated leaks, the screen mounts.
  test('all params absent (raw deep link): renders the EmptyState and mounts cleanly', () => {
    mockParams.current = {};

    expect(() => renderScreen()).not.toThrow();

    expect(screen.getByText('No session data')).toBeTruthy();
    expect(screen.queryByText('Volume')).toBeNull();
    expect(screen.queryByText(/NaN/)).toBeNull();
    expect(screen.queryByText(/undefined/)).toBeNull();

    // Primary chrome still mounts.
    expect(screen.getByText('Return to Dashboard')).toBeTruthy();
  });

  // ── Test D: the Return-to-Dashboard CTA routes correctly ────────────────────
  // The navigation contract must be intact on BOTH the valid and the empty
  // mount: pressing the CTA dismisses the stack, replaces to '/(tabs)' exactly
  // once, and invalidates the active-session caches (so the dashboard refetches
  // a clean state). This is the same handler regardless of which metric branch
  // rendered, so we assert it on both.
  test('Return CTA dismisses the stack, replaces to /(tabs) once, and invalidates the session caches (valid mount)', () => {
    mockParams.current = { elapsed: '125', volume: '500', kcal: '320' };

    renderScreen();

    fireEvent.press(screen.getByText('Return to Dashboard'));

    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)');
    expect(mockDismissAll).toHaveBeenCalledTimes(1);
    // Both active-session caches are invalidated so the dashboard reloads clean.
    expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ['active-session'] });
    expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ['workout-active-session'] });
  });

  test('Return CTA still routes correctly on the empty (no-data) mount', () => {
    mockParams.current = {};

    renderScreen();

    fireEvent.press(screen.getByText('Return to Dashboard'));

    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)');
    expect(mockDismissAll).toHaveBeenCalledTimes(1);
  });
});
