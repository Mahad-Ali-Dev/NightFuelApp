/**
 * Render + interaction tests for the Training hub screen
 * (`app/(tabs)/training.tsx`).
 *
 * These tests VERIFY already-shipped behaviour — no source change accompanies
 * them. They pin down the screen's error/offline handling for the routines
 * query.
 *
 * IMPORTANT — one query, two tabs: both the TRAINING tab and the MY PLAN tab
 * read the SAME `routinesQ = useQuery({ queryKey:['routines'] })` (training.tsx
 * line 50). So a single `isError` branch covers BOTH tabs:
 *   - TRAINING tab  → a TouchableOpacity reading "Couldn't load routines" whose
 *     press calls `routinesQ.refetch()` (lines 110-115).
 *   - MY PLAN tab   → an <EmptyState title="Couldn't load your plan" /> with a
 *     "Try Again" action that calls `routinesQ.refetch()` (lines 148-155).
 * There is no second, separately-failing routines query to cover. The active-
 * session query is independent and mocked benign here.
 *
 * We also assert the error branch is mutually exclusive with the empty-state
 * "create routine" CTA: when the query is erroring we must show Retry, never the
 * "New Routine" / "Create Routine" call-to-action (which would mask the failure
 * and offer a dead-end create flow against an unreachable backend).
 *
 * Mocks (kept minimal — this is a heavy full-screen):
 *  - `@tanstack/react-query` useQuery → returns a controlled
 *    `{ isError:true, isLoading:false, data:undefined, refetch }` for the
 *    routines query, and a benign empty result for the active-session query.
 *  - `./_layout` (the tab navigator) → a stub that only re-exports the
 *    `TAB_BAR_H` constant training.tsx imports, so we don't drag in expo-router
 *    `<Tabs>`, the auth store, or the blur tab bar.
 *  - `expo-router` (useRouter / useFocusEffect), `@expo/vector-icons`,
 *    `react-native-safe-area-context`, and `@/api/exercises` are stubbed so the
 *    module graph loads without native code or a real API client.
 *  - `expo-image`, `expo-blur`, `expo-linear-gradient` pass through under
 *    jest-expo (see Button.test.tsx) and need no mock.
 */
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

// ── react-query: drive the routines query into its error state ───────────────
// Shared refetch spies so the tests can assert the Retry actions call them. The
// `mock` name prefix is what lets the hoisted jest.mock() factory reference them
// (jest only allows out-of-scope vars whose names start with "mock").
const mockRoutinesRefetch = jest.fn();
const mockSessionRefetch = jest.fn();

jest.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    if (queryKey[0] === 'routines') {
      return { data: undefined, isLoading: false, isError: true, refetch: mockRoutinesRefetch };
    }
    // active-session (and anything else) — benign, non-erroring, no data.
    return { data: undefined, isLoading: false, isError: false, refetch: mockSessionRefetch };
  },
}));

// ── _layout stub: training.tsx only needs the TAB_BAR_H constant from it ──────
// Mocking it keeps the real tab navigator (expo-router <Tabs>, auth store,
// SafeBlurView) out of the render entirely.
jest.mock('../../app/(tabs)/_layout', () => ({ TAB_BAR_H: 72 }));

// ── expo-router: stub the two hooks training.tsx calls ───────────────────────
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  // Run the focus effect's callback once (it calls sessionQ.refetch()), matching
  // how expo-router fires it on focus — harmless against the mocked query.
  useFocusEffect: (cb: () => void | (() => void)) => {
    const cleanup = cb();
    if (typeof cleanup === 'function') cleanup();
  },
}));

// Decorative glyphs; stub to plain text (avoids expo-font → expo-asset).
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

// The screen imports query fns + the Routine type from here; stub the fns so the
// real API client (axios + env config) never loads. useQuery is mocked above, so
// these are never actually invoked — they just need to be importable.
jest.mock('@/api/exercises', () => ({
  getRoutines: jest.fn(),
  getActiveSession: jest.fn(),
}));

// Import AFTER the mocks are registered.
import TrainingHubScreen from '../../app/(tabs)/training';

function renderScreen() {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      <TrainingHubScreen />
    </ThemeContext.Provider>,
  );
}

/** Switch from the default TRAINING tab to the MY PLAN tab. */
function goToMyPlan() {
  fireEvent.press(screen.getByText('MY PLAN'));
}

describe('TrainingHubScreen — routines query error branch', () => {
  beforeEach(() => {
    mockRoutinesRefetch.mockClear();
    mockSessionRefetch.mockClear();
  });

  describe('TRAINING tab (default)', () => {
    test('shows the "Couldn\'t load routines" offline card, not the create-routine CTA', () => {
      renderScreen();
      // Error copy from the TRAINING tab's inline TouchableOpacity (lines 110-115).
      expect(screen.getByText("Couldn't load routines")).toBeTruthy();
      expect(screen.getByText('Tap to try again')).toBeTruthy();
      // The empty-state "New Routine" create CTA must NOT show while erroring.
      expect(screen.queryByText('New Routine')).toBeNull();
    });

    test('pressing the offline card calls routinesQ.refetch()', () => {
      renderScreen();
      fireEvent.press(screen.getByText("Couldn't load routines"));
      expect(mockRoutinesRefetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('MY PLAN tab (shares the same routinesQ)', () => {
    test('shows the "Couldn\'t load your plan" Try Again EmptyState, not the create-routine CTA', () => {
      renderScreen();
      goToMyPlan();
      // EmptyState error copy from the MY PLAN tab (lines 148-155).
      expect(screen.getByText("Couldn't load your plan")).toBeTruthy();
      expect(screen.getByText('Try Again')).toBeTruthy();
      // Neither the "No Routines Yet" empty state nor its "Create Routine" CTA
      // should render while the shared query is erroring.
      expect(screen.queryByText('No Routines Yet')).toBeNull();
      expect(screen.queryByText('Create Routine')).toBeNull();
    });

    test('pressing "Try Again" calls routinesQ.refetch()', () => {
      renderScreen();
      goToMyPlan();
      fireEvent.press(screen.getByText('Try Again'));
      expect(mockRoutinesRefetch).toHaveBeenCalledTimes(1);
    });
  });

  test('both tabs surface the SAME routines error (one query, two error UIs)', () => {
    renderScreen();
    // TRAINING tab error UI present on mount.
    expect(screen.getByText("Couldn't load routines")).toBeTruthy();
    // Switch to MY PLAN — the same underlying error now renders its EmptyState.
    goToMyPlan();
    expect(screen.getByText("Couldn't load your plan")).toBeTruthy();
  });
});
