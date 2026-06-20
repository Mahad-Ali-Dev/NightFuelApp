/**
 * circadian.emptyPlan.test.tsx
 *
 * Honest "No protocol yet" EMPTY-STATE coverage for the Circadian planner's AI
 * Protocol tab (`app/(tabs)/circadian.tsx`).
 *
 * Background — the anti-pattern this pins shut: the `protocol` useMemo used to
 * ALWAYS return a hardcoded 5-row Wake/Activation/Mid/Caffeine/Recovery estimate
 * whenever the real AI `plan` was absent. A user who had never generated a plan
 * therefore saw a fully fabricated meal/workout timeline whose per-meal "Log
 * this" buttons pushed invented macros (e.g. {protein:40,carbs:20,fat:15}) into
 * the meal log. That fallback has been DELETED: with no real plan the screen now
 * renders ONLY the honest EmptyState ("No protocol yet") with a SINGLE CTA wired
 * to the EXISTING `generateAIPlan` mutation — and renders ZERO timeline rows /
 * ZERO "Log this" buttons. When the AI returns a real, non-empty plan the
 * existing timeline + per-meal "Log this" → '/(meals)/log-planned-meal' flow is
 * unchanged.
 *
 * This suite pins both branches (the acceptance for the work-item):
 *   (a) active shift + plan undefined/empty `meals` + isLoadingPlan false + no
 *       quota / no genError → the "No protocol yet" EmptyState is present, there
 *       are ZERO "Log this" buttons, and pressing the EmptyState CTA calls the
 *       screen's `generateAIPlan` mutation EXACTLY once.
 *   (b) a real plan (non-empty `meals`) → the timeline rows render and a meal
 *       row's "Log this" still pushes '/(meals)/log-planned-meal' with the slot
 *       params (the one-tap plan→meal flow is preserved).
 *
 * The plan-service returns the day plan as `plan.meals` (an array of
 * { time, label, description, macros:{...} }, normalized in api/plans.ts) — NEVER
 * `plan.items`. These mocks therefore present the REAL `meals` shape the screen
 * consumes; a mock that returned `items` would assert a contract the server never
 * produces.
 *
 * The case (a)-empty variant (plan present but `meals: []`) is also pinned so the
 * `>0` length guard — not merely "plan absent" — is what gates the EmptyState.
 *
 * Additive + verify-only: NEW test file only; the screen is exercised through its
 * real render branches.
 *
 * Mock conventions mirror the sibling `circadian.test.tsx`:
 *   - `@tanstack/react-query` is stubbed and branches on queryKey[0]: a mutable
 *     `mockCurrentShift` holder drives ['current-shift'] and a mutable
 *     `mockCircadianModel` holder drives ['circadian-model']. `useMutation` is a
 *     controllable stub whose `data` reads a mutable `mockMutation.data` holder
 *     (so a test can present a real plan) and whose `mutate` records each call on
 *     a hoisted `mockMutate` spy (so the CTA wiring is asserted by arity). The
 *     screen's REAL render logic (hasRealPlan / protocol useMemo / the EmptyState
 *     gate) runs against `mockMutation.data`. `isPending` reads `mockMutation`
 *     too (default false → the timeline / EmptyState render, not the loader).
 *   - `expo-router` exposes a hoisted `mockPush` so the "Log this" deep-link is
 *     asserted by route + arity.
 *   - `@/api/ai` delegates to the REAL implementation (jest.requireActual) so the
 *     genuine `parseAiQuotaError` loads; its leaf deps (`@/api/client`,
 *     `@/lib/sentry`) are mocked so no axios/env or native Sentry subtree loads.
 *     The other api modules are plain jest.fns — useQuery/useMutation are stubbed,
 *     so these queryFns/mutationFns are never invoked.
 *   - `../../app/(tabs)/_layout` is stubbed to just `{ TAB_BAR_H }`; decorative
 *     glyphs, safe-area insets, the linear gradient and the status bar are stubbed
 *     the same way as circadian.test.tsx.
 *
 * The `@/components/ui` barrel is deliberately left REAL so the assertions ride on
 * the actual EmptyState (its title/subtitle copy + the real Button CTA). The CTA
 * the EmptyState renders is the `Button` primitive, which exposes its label as
 * TEXT (no accessibilityRole), so it is pressed via its "Generate protocol" label
 * text — NOT getByRole. The "Log this" buttons DO carry accessibilityRole="button"
 * + an accessibilityLabel, so those are found by role.
 *
 * react-native-skills applied: rendering-no-falsy-and (the EmptyState branch is a
 * ternary-null, never an `&&` on a falsy value) and react-state-fallback /
 * state-ground-truth (hasRealPlan + protocol are DERIVED from the mutation's
 * ground-truth `data`, never fabricated on the empty branch).
 */

// ── jest.mock hoisting block (runs ABOVE the imports) ────────────────────────

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
}));

// Controlled state for the ['current-shift'] query. Each test mutates this
// holder BEFORE render() to pick the loading / no-shift / populated branch.
type ShiftState = { data: any; isLoading: boolean };
const mockCurrentShift: ShiftState = { data: undefined, isLoading: false };

// Controlled state for the ['circadian-model'] query. `undefined` → the screen
// falls back to the shift-based window estimate; an object → the model-present
// branch. These empty-state tests don't depend on the model, but the holder
// keeps the stub shape identical to circadian.test.tsx.
const mockCircadianModel: { data: any } = { data: undefined };

// Controllable mutation state. `data` is what `useMutation().data` returns — the
// screen's `plan`. `isPending` forces the loader on/off. `mockMutate` is the
// hoisted spy the screen's `generateAIPlan` resolves to, so the EmptyState CTA's
// wiring is asserted by call count.
const mockMutate = jest.fn();
const mockMutation: { data: any; isPending: boolean } = { data: undefined, isPending: false };

// react-query: branch on queryKey[0]. ['current-shift'] / ['circadian-model']
// read the mutable holders above. useMutation returns the mutable `data` /
// `isPending` and a `mutate` that is the hoisted spy — so the screen's real
// hasRealPlan / protocol / EmptyState-gate logic runs against `mockMutation.data`
// and pressing the CTA increments `mockMutate`.
jest.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    const key = queryKey[0];
    if (key === 'current-shift') {
      return { data: mockCurrentShift.data, isLoading: mockCurrentShift.isLoading };
    }
    if (key === 'circadian-model') {
      return { data: mockCircadianModel.data };
    }
    return { data: undefined, isLoading: false };
  },
  useMutation: () => ({
    data: mockMutation.data,
    isPending: mockMutation.isPending,
    mutate: mockMutate,
  }),
}));

// api modules the screen statically imports. `@/api/ai` → the REAL module (so
// parseAiQuotaError is genuine), with its leaf deps mocked below so the axios
// client / native sentry never load. The query/mutation fns are plain jest.fns —
// never invoked (useQuery/useMutation are stubbed above).
jest.mock('@/api/shifts', () => ({ getCurrent: jest.fn() }));
jest.mock('@/api/plans', () => ({ generatePlan: jest.fn() }));
jest.mock('@/api/ai', () => jest.requireActual('@/api/ai'));
jest.mock('@/api/client', () => ({
  apiClient: { get: jest.fn(), post: jest.fn() },
  getAccessToken: jest.fn(() => Promise.resolve(null)),
  resolveApiUrl: (p: string) => `http://test${p}`,
}));
jest.mock('@/lib/sentry', () => ({ captureException: jest.fn() }));
jest.mock('@/api/circadian', () => ({ getModel: jest.fn() }));

// _layout stub: circadian.tsx only needs the TAB_BAR_H constant from it.
jest.mock('../../app/(tabs)/_layout', () => ({ TAB_BAR_H: 64 }));

// Decorative glyphs → plain <Text> surfacing the icon name.
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
// passthrough View so the screen's (and Button's/CtaButton's) gradients mount.
jest.mock('expo-linear-gradient', () => {
  const RN = require('react-native');
  return { LinearGradient: (props: any) => <RN.View {...props} /> };
});

// expo-status-bar renders nothing in the tree under test.
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

// SafeBlurView (used by GlassCard) → passthrough View so children render.
jest.mock('@/components/SafeBlurView', () => {
  const RN = require('react-native');
  return { SafeBlurView: ({ children }: any) => <RN.View>{children}</RN.View> };
});

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
import CircadianScreen from '../../app/(tabs)/circadian';

function renderScreen() {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      <CircadianScreen />
    </ThemeContext.Provider>,
  );
}

// A fixed active night shift so the AI Protocol tab is reachable (the screen
// mounts on the Profile Hub tab; the timeline / EmptyState live on AI Protocol).
const ACTIVE_SHIFT = {
  id: 's1',
  type: 'night',
  startTime: '2026-06-13T22:00:00.000Z',
  endTime: '2026-06-14T06:00:00.000Z',
};

// Switch to the AI Protocol tab once the populated render has settled.
function gotoProtocolTab() {
  expect(screen.getByText('Biological Windows')).toBeTruthy();
  fireEvent.press(screen.getByRole('tab', { name: /AI Protocol/ }));
  expect(screen.getByText("Today's Protocol")).toBeTruthy();
}

describe('CircadianScreen — honest "No protocol yet" empty state', () => {
  beforeEach(() => {
    mockCurrentShift.data = ACTIVE_SHIFT;
    mockCurrentShift.isLoading = false;
    mockCircadianModel.data = undefined;
    mockMutation.data = undefined;
    mockMutation.isPending = false;
    mockMutate.mockClear();
    mockPush.mockClear();
  });

  // ── (a) no plan → EmptyState, ZERO "Log this", CTA fires generateAIPlan ─────
  test('no plan (active shift, not loading, no quota/genError): shows the EmptyState, ZERO "Log this" buttons, and its CTA calls generateAIPlan exactly once', () => {
    mockMutation.data = undefined; // the AI has produced no plan yet

    renderScreen();
    gotoProtocolTab();

    // The honest zero-data state — title + subtitle copy from the EmptyState.
    expect(screen.getByText('No protocol yet')).toBeTruthy();
    expect(
      screen.getByText("Generate today's circadian-timed meal & training plan."),
    ).toBeTruthy();

    // CRITICAL: NOT a single fabricated "Log this" button renders (they are
    // produced inside protocol.map, which is now empty on the no-plan branch).
    expect(screen.queryAllByRole('button', { name: /^Log / })).toHaveLength(0);

    // Pressing the EmptyState CTA drives the EXISTING generateAIPlan mutation
    // exactly once. The CTA is the Button primitive (label surfaced as text, no
    // role), so we press it by its "Generate protocol" label.
    const cta = screen.getByText('Generate protocol');
    fireEvent.press(cta);
    expect(mockMutate).toHaveBeenCalledTimes(1);

    // No navigation happens from the empty state (no "Log this" exists to push).
    expect(mockPush).not.toHaveBeenCalled();
  });

  // ── (a′) plan present but EMPTY meals → still the EmptyState (length>0 gate) ─
  test('plan present but with empty meals array still shows the EmptyState (the >0 length gate, not mere absence)', () => {
    mockMutation.data = { meals: [] };

    renderScreen();
    gotoProtocolTab();

    expect(screen.getByText('No protocol yet')).toBeTruthy();
    expect(screen.queryAllByRole('button', { name: /^Log / })).toHaveLength(0);
  });

  // ── (b) real plan → timeline renders + "Log this" pushes log-planned-meal ───
  test('real plan (non-empty meals): the timeline rows render and a meal "Log this" pushes /(meals)/log-planned-meal with the slot params', () => {
    // A real AI plan in the wire shape the plan-service returns (api/plans.ts
    // PlanMeal): { time, label, description, macros:{...} }. "Wake Fuel" maps to
    // the BREAKFAST slot via the wake/morning regex in mealTypeFromSlot.
    mockMutation.data = {
      meals: [
        { time: '07:00', label: 'Generated Wake Fuel', description: 'Protein + slow carbs', macros: { protein: 40, carbs: 20, fat: 15, calories: 415 } },
        { time: '12:00', label: 'Midday Lunch', description: 'Balanced plate', macros: { protein: 35, carbs: 45, fat: 18, calories: 482 } },
      ],
    };

    renderScreen();
    gotoProtocolTab();

    // The AI-generated timeline row renders; the EmptyState is NOT shown.
    expect(screen.getByText('Generated Wake Fuel')).toBeTruthy();
    expect(screen.queryByText('No protocol yet')).toBeNull();

    // The meal row exposes a "Log <title>" button; pressing it opens the
    // log-planned-meal confirm screen with the slot's mealType + a serialized
    // `plan` param (macros/foods) — the one-tap plan→meal flow, unchanged.
    const logButtons = screen.getAllByRole('button', { name: /^Log / });
    expect(logButtons.length).toBeGreaterThan(0);
    fireEvent.press(logButtons[0]!);

    expect(mockPush).toHaveBeenCalledTimes(1);
    const arg = mockPush.mock.calls[0]![0] as { pathname: string; params: Record<string, string> };
    expect(arg.pathname).toBe('/(meals)/log-planned-meal');
    // "Generated Wake Fuel" maps to the BREAKFAST slot (wake/morning regex).
    expect(arg.params.mealType).toBe('BREAKFAST');
    // `plan` is a JSON string carrying the planned macros + suggested foods.
    expect(typeof arg.params.plan).toBe('string');
    expect(() => JSON.parse(arg.params.plan!)).not.toThrow();
    const parsedPlan = JSON.parse(arg.params.plan!);
    expect(parsedPlan).toHaveProperty('plannedMacros');
    expect(parsedPlan).toHaveProperty('suggestedFoods');
  });
});
