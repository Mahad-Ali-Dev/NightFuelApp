/**
 * dashboard.cta.test.tsx
 *
 * Locks the DASHBOARD's PRIMARY call-to-action: the UP NEXT meal card's shared
 * <CtaButton label="Log Meal" /> (app/(tabs)/index.tsx) must navigate to the
 * nutrition tab — `router.push('/(tabs)/nutrition')` — and to NOTHING ELSE.
 *
 * The dashboard renders that CtaButton ONLY inside the `nextMeal` branch of the
 * UP NEXT section (planError ? … : planLoading ? … : nextMeal ? <GlassCard>…
 * <CtaButton label="Log Meal" …/> … : <empty>). So this suite drives the
 * ['today-plan'] query to a plan carrying one meal — which makes getNextMeal()
 * resolve non-null — so the UP NEXT GlassCard and its primary CtaButton render;
 * every OTHER query (['current-shift'] / ['today-progress'] / ['exercise-counts'])
 * resolves to benign data so no sibling section throws or steals the assertion.
 *
 * Disambiguation — there are TWO button-role nodes named "Log Meal" on the
 * dashboard: this PRIMARY CtaButton (icon="checkmark") AND the static QUICK
 * ACTIONS "Log Meal" image tile (icon="restaurant"). Both happen to route to
 * '/(tabs)/nutrition', but this test pins the PRIMARY CTA specifically: it picks
 * the "Log Meal" button whose subtree carries the checkmark glyph (rendered as
 * the text `icon:checkmark` by the @expo/vector-icons stub), which is uniquely
 * the CtaButton. A regression that drops the CTA, relabels it, or changes its
 * destination/arity turns this RED.
 *
 * Navigation is asserted through a hoisted `mockPush` holder (the `mock` prefix
 * lets babel-plugin-jest-hoist allow the hoisted factory to close over it).
 * Mock conventions mirror the sibling screen suites (dashboard.shiftTransition /
 * shift-detail) and do NOT modify app/(tabs)/index.tsx.
 */

// ── jest.mock hoisting block (runs ABOVE the imports) ────────────────────────

// expo-router: `push` is a hoisted `mock`-prefixed holder so the test can assert
// exactly where (and with what arity) the CTA navigated. `back`/`replace` are
// benign no-ops the dashboard's other controls call.
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
}));

// The single meal that drives the UP NEXT card. getNextMeal() returns the first
// meal whose time is in the future, else falls back to the first sorted meal —
// so ANY one meal with a valid time makes `nextMeal` non-null and renders the
// UP NEXT GlassCard + its primary "Log Meal" CtaButton. Macros present so the
// macro pills render too (purely incidental to the CTA assertion).
const MOCK_MEAL = {
  time: '08:00',
  label: 'Power Breakfast',
  description: 'Eggs, oats, and berries to anchor the post-shift window.',
  macros: { protein: 40, carbs: 60, fat: 18, calories: 560 },
};
const MOCK_PLAN = {
  id: 'plan-1',
  userId: 'u-1',
  date: '2026-06-18',
  meals: [MOCK_MEAL],
  supplements: [],
  hydrationTargetMl: 2500,
  createdAt: '2026-06-18T00:00:00.000Z',
};

// react-query: branch on queryKey[0]. ['today-plan'] returns the one-meal plan
// (so the UP NEXT CtaButton renders); ['current-shift'] / ['today-progress'] /
// ['exercise-counts'] return benign, non-loading, non-erroring data so every
// other dashboard section renders without throwing or stealing the assertion.
// useMutation (addWater) + useQueryClient (pull-to-refresh) are benign no-ops.
// (`mock`-prefixed holders satisfy babel-plugin-jest-hoist.)
jest.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    const key = queryKey[0];
    if (key === 'today-plan') {
      return { data: MOCK_PLAN, isLoading: false, isError: false, refetch: jest.fn() };
    }
    if (key === 'current-shift') {
      return {
        data: {
          id: 'shift-1',
          userId: 'u-1',
          type: 'night',
          startTime: '2026-06-18T22:00:00.000Z',
          endTime: '2026-06-19T06:00:00.000Z',
          timezone: 'UTC',
          createdAt: '2026-06-18T00:00:00.000Z',
          updatedAt: '2026-06-18T00:00:00.000Z',
        },
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      };
    }
    if (key === 'today-progress') {
      return {
        data: { hydrationActual: 0, hydrationMl: 0 },
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      };
    }
    if (key === 'exercise-counts') {
      return { data: {}, isLoading: false, isError: false, refetch: jest.fn() };
    }
    // Anything else — benign empty success.
    return { data: undefined, isLoading: false, isError: false, refetch: jest.fn() };
  },
  useMutation: () => ({ mutate: jest.fn(), isPending: false, isError: false, reset: jest.fn() }),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

// API modules the dashboard statically imports — stub to plain jest.fns so axios
// (via @/api/client) never loads. useQuery is fully stubbed above, so these are
// never actually invoked; they only satisfy the import graph.
jest.mock('@/api/shifts', () => ({ getCurrent: jest.fn() }));
jest.mock('@/api/plans', () => ({ getToday: jest.fn() }));
jest.mock('@/api/progress', () => ({ getToday: jest.fn(), logHydration: jest.fn() }));
jest.mock('@/api/exercises', () => ({ searchLibrary: jest.fn() }));

// Auth store: a stable user so the header (greeting + initials) renders happily.
jest.mock('@/store/authStore', () => ({
  useAuthStore: () => ({ user: { name: 'Test User' } }),
}));

// Decorative glyphs → plain <Text> surfacing the icon name (mirrors the rest of
// the suite). This is also the disambiguation hook: the primary CtaButton's
// `icon="checkmark"` renders as the text `icon:checkmark`, which uniquely
// distinguishes it from the QUICK ACTIONS "Log Meal" tile (icon="restaurant").
jest.mock('@expo/vector-icons', () => {
  const { Text: RNText } = require('react-native');
  return {
    Ionicons: ({ name }: { name?: string }) => <RNText>{`icon:${name ?? ''}`}</RNText>,
  };
});

// expo-linear-gradient ships a native module; replace <LinearGradient> with a
// passthrough View so the dashboard's gradients mount on the jest renderer.
jest.mock('expo-linear-gradient', () => {
  const RN = require('react-native');
  return { LinearGradient: (props: any) => <RN.View {...props} /> };
});

// expo-image's <Image> uses a native loader; replace it with a passthrough View.
jest.mock('expo-image', () => {
  const RN = require('react-native');
  return { Image: (props: any) => <RN.View {...props} /> };
});

// Deterministic insets so the screen lays out without the native provider.
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));

// Child sections we don't want to drag in — each owns its own query + native
// pieces. Stub to no-op host Views so the dashboard mounts without them. The
// home cards are DEFAULT exports; CaffeineTimerTile / WeeklyRecap /
// ActivityHeatmap are NAMED exports — stub each in its own shape.
jest.mock('@/components/home/ShiftTransitionCard', () => {
  const RN = require('react-native');
  return { __esModule: true, default: () => <RN.View testID="shift-transition-stub" /> };
});
jest.mock('@/components/home/LightPlanCard', () => {
  const RN = require('react-native');
  return { __esModule: true, default: () => <RN.View testID="light-plan-stub" /> };
});
jest.mock('@/components/home/CaffeineTimerTile', () => {
  const RN = require('react-native');
  return { CaffeineTimerTile: () => <RN.View testID="caffeine-timer-stub" /> };
});
jest.mock('@/components/WeeklyRecap', () => {
  const RN = require('react-native');
  return { WeeklyRecap: () => <RN.View testID="weekly-recap-stub" /> };
});
jest.mock('@/components/ActivityHeatmap', () => {
  const RN = require('react-native');
  return { ActivityHeatmap: () => <RN.View testID="activity-heatmap-stub" /> };
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
import DashboardScreen from '../../app/(tabs)/index';

function renderScreen() {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      <DashboardScreen />
    </ThemeContext.Provider>,
  );
}

/**
 * Resolve the dashboard's PRIMARY "Log Meal" CtaButton (NOT the QUICK ACTIONS
 * tile that shares the name). Both expose role=button + name "Log Meal"; the
 * primary CTA is the one whose subtree carries the checkmark glyph (the
 * @expo/vector-icons stub renders `icon="checkmark"` as the text
 * `icon:checkmark`), which is uniquely the CtaButton.
 */
function getPrimaryLogMealCta() {
  const buttons = screen.getAllByRole('button', { name: 'Log Meal' });
  const cta = buttons.find((b) => within(b).queryByText('icon:checkmark') != null);
  if (!cta) {
    throw new Error(
      `Expected a primary "Log Meal" CtaButton (with the checkmark glyph) among ${buttons.length} "Log Meal" button(s)`,
    );
  }
  return cta;
}

describe('Dashboard — primary "Log Meal" CTA', () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  test('the UP NEXT card renders the primary "Log Meal" CtaButton', () => {
    renderScreen();

    // The UP NEXT meal card is present. "UP NEXT" is unique to that card's
    // badge; the meal name "Power Breakfast" also appears in the 24H SCHEDULE
    // timeline (same plan meal), so we assert it via getAllByText (>=1) rather
    // than pinning a single occurrence.
    expect(screen.getByText('UP NEXT')).toBeTruthy();
    expect(screen.getAllByText('Power Breakfast').length).toBeGreaterThanOrEqual(1);

    // …and the primary CTA resolves uniquely (checkmark glyph in its subtree).
    const cta = getPrimaryLogMealCta();
    expect(cta).toBeTruthy();
    expect(String(cta.props.accessibilityLabel)).toBe('Log Meal');
  });

  test('pressing the primary "Log Meal" CTA pushes /(tabs)/nutrition with NO stray param', () => {
    renderScreen();

    const cta = getPrimaryLogMealCta();
    fireEvent.press(cta);

    // Navigates to the nutrition tab…
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith('/(tabs)/nutrition');

    // …and with EXACTLY one argument — a stray 2nd param (params object) would
    // silently change the deep-link target, so we lock the arity to one.
    expect(mockPush.mock.calls[0]).toHaveLength(1);
    expect(mockPush.mock.calls[0][0]).toBe('/(tabs)/nutrition');
  });
});
