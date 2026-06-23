/**
 * circadian.test.tsx
 *
 * Render + behaviour coverage for the Aurora-restyled Circadian tab
 * (`app/(tabs)/circadian.tsx`). The screen had zero render tests, so a silent
 * restyle could break its navigation without a single suite turning red. This
 * file pins the load-bearing behaviours so future restyle rounds can't regress
 * them:
 *
 *   - Test A (loading): while ['current-shift'] is `isLoading`, the screen
 *     mounts its skeleton scaffold ONLY — the "Circadian"/"Optimizer" hero and
 *     the metric values are NOT in the tree yet.
 *   - Test B (no shift): with no active shift, the "No shift to sync to"
 *     EmptyState renders and its primary CtaButton ("Schedule a shift") deep-
 *     links to '/(tabs)/schedule' (exactly once).
 *   - Test C (populated → AI Protocol): with an active shift, switching to the
 *     "AI Protocol" tab renders the meal timeline; pressing a meal row's
 *     "Log this" pushes the '/(meals)/log-planned-meal' confirm screen with the
 *     slot's mealType + serialized plan params (the one-tap plan→meal flow that
 *     replaced the old data-less "Swap → build-plate" action).
 *
 *   - Test group D (HELPER PARITY — the entrainment.ts single-source-of-truth):
 *     the screen now consumes the shared `entrainmentAdvice` /
 *     `deriveWindowsFromShift` helpers instead of an inline ternary + inline
 *     endTime±h arithmetic. These tests assert that adoption is honest:
 *       • for a present shift with NO circadianModel, the four biological-window
 *         tiles equal `deriveWindowsFromShift(shift)` output (so the inline math
 *         can't drift back in);
 *       • the advice copy equals `entrainmentAdvice(score)` for score>=80, a
 *         finite score<80, and `null` (so the inline advice ternary can't drift);
 *       • a malformed shift ISO can NEVER crash the screen (the helper THROWS;
 *         the screen's try/catch falls back to the '--:--' placeholders).
 *
 *   - Test group E (QUOTA UX — the shipped 429 split, mutation-driven):
 *     the "Regenerate" action drives the METERED plan-service path; on the
 *     SHARED `429 { error:'ai_quota_exceeded', … }` the screen flips into the
 *     distinct "Daily AI limit reached" upgrade block whose CtaButton routes to
 *     '/(modals)/premium' — and CRITICALLY does NOT raise a destructive
 *     `Alert.alert`. Any other failure takes the retryable "Generation failed"
 *     Try-Again path (also no Alert). The real `parseAiQuotaError` does the
 *     429-vs-generic discrimination here (jest.requireActual).
 *
 * Mock conventions mirror the sibling `(tabs)` screen suites
 * (nutrition.errorStates / dashboard.errorStates), the hoisted-`mockPush`
 * holder in shift-detail.test.tsx, and the `alertSpy` posture in
 * planner.quota.test.tsx:
 *
 *   - `@tanstack/react-query` is stubbed and branches on queryKey[0]: a mutable
 *     `mockCurrentShift` holder drives ['current-shift'] (so each test picks the
 *     loading / no-shift / populated branch before render); a mutable
 *     `mockCircadianModel` holder drives ['circadian-model'] (undefined → the
 *     screen uses its shift-based window estimates; `{ entrainmentScore }` →
 *     the model-present score path for the advice-parity cases). `useMutation`
 *     is a controllable stub: it CAPTURES the screen's onMutate/onSuccess/onError
 *     config and exposes a `mutate` that synchronously runs onMutate then either
 *     onSuccess or onError(<configured error>) — so the screen's REAL onError
 *     logic (parseAiQuotaError → setQuota/setGenError) is exercised without
 *     pulling in real react-query. `isPending` is forced false so the timeline
 *     (and the notices) render rather than the GeneratingSteps loader.
 *   - `expo-router` exposes a hoisted `mockPush` so the deep-links can be
 *     asserted by route + arity.
 *   - `../../app/(tabs)/_layout` is stubbed to just `{ TAB_BAR_H }`.
 *   - `@/api/ai` delegates to the REAL implementation (jest.requireActual) so
 *     the genuine `parseAiQuotaError` does the 429-vs-generic discrimination; its
 *     leaf deps (`@/api/client`, `@/lib/sentry`) are mocked so no axios/env or
 *     native Sentry subtree loads. The other api modules (`@/api/shifts`,
 *     `@/api/plans`, `@/api/circadian`) are plain jest.fns — useQuery/useMutation
 *     are stubbed, so these queryFns/mutationFns are never invoked.
 *   - decorative glyphs, safe-area insets, the linear gradient and the status
 *     bar are stubbed the same way as the rest of the screen suites.
 *
 * The `@/components/ui` barrel is deliberately left REAL: the assertions ride on
 * the actual CtaButton (its accessibilityRole="button" + label) and EmptyState
 * copy, and the real GlassCard / Skeleton / GeneratingSteps render fine under the
 * gradient/icon/blur stubs above. The REAL `@/lib/circadian/entrainment` is also
 * imported directly so the parity assertions compare against the source of truth.
 */

// ── jest.mock hoisting block (runs ABOVE the imports) ────────────────────────

// expo-router: `push` is a hoisted `mock`-prefixed holder (the prefix lets
// babel-plugin-jest-hoist allow the factory to close over it) so each test can
// assert exactly which route — and with what arity — the screen navigated to.
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
}));

// Controlled state for the ['current-shift'] query. Each test mutates this
// holder BEFORE render() to pick the loading / no-shift / populated branch.
// Read at call-time inside the useQuery stub so the chosen branch is honoured.
type ShiftState = { data: any; isLoading: boolean };
const mockCurrentShift: ShiftState = { data: undefined, isLoading: false };

// Controlled state for the ['circadian-model'] query. `undefined` → the screen
// falls back to the shift-based window estimate (the deriveWindowsFromShift
// path); an object → the model-present branch (used to drive an entrainment
// score for the advice-parity cases).
const mockCircadianModel: { data: any } = { data: undefined };

// Controllable mutation outcome. `mode:'idle'` → mutate is a no-op (Tests A–D
// never (re)generate). `mode:'error'` → mutate runs onMutate then onError(err).
// `mode:'success'` → mutate runs onMutate then onSuccess. The screen's REAL
// onError (parseAiQuotaError → setQuota/setGenError) runs against `err`.
// `data` is the RESOLVED plan the screen reads as `plan` (the useMutation
// result's `data`). The screen renders the AI Protocol timeline ONLY when
// `plan.meals` is a non-empty array — there is no fabricated fallback — so the
// populated case must supply a real plan here (the plan-service `meals` wire
// shape, normalized in api/plans.ts; the screen never reads `plan.items`). Left
// undefined ⇒ the honest "No protocol yet" empty state.
type MutationOutcome = { mode: 'idle' | 'error' | 'success'; err?: unknown; data?: unknown };
const mockMutation: MutationOutcome = { mode: 'idle' };

// react-query: branch on queryKey[0]. ['current-shift'] / ['circadian-model']
// read the mutable holders above. useMutation captures the screen's lifecycle
// config and returns a `mutate` that drives it synchronously per mockMutation.
// isPending is forced false → the timeline + notices render (not the loader).
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
  useMutation: (config: any) => ({
    data: mockMutation.data,
    isPending: false,
    mutate: () => {
      config?.onMutate?.();
      if (mockMutation.mode === 'error') {
        config?.onError?.(mockMutation.err);
      } else if (mockMutation.mode === 'success') {
        config?.onSuccess?.(undefined);
      }
    },
  }),
}));

// api modules the screen statically imports. `@/api/ai` → the REAL module (so
// parseAiQuotaError is genuine), with its leaf deps mocked below so the axios
// client / native sentry never load. The metered `@/api/plans` generatePlan and
// the query fns are plain jest.fns — never invoked (useQuery/useMutation stubbed).
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
// Mocking it keeps the real tab navigator (expo-router <Tabs>, auth store,
// SafeBlurView) out of the render entirely.
jest.mock('../../app/(tabs)/_layout', () => ({ TAB_BAR_H: 64 }));

// Decorative glyphs → plain <Text> surfacing the icon name (mirrors the rest of
// the suite). Otherwise pulls in expo-font → expo-asset.
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
// passthrough View so the screen's (and CtaButton's) gradients mount.
jest.mock('expo-linear-gradient', () => {
  const RN = require('react-native');
  return { LinearGradient: (props: any) => <RN.View {...props} /> };
});

// expo-status-bar renders nothing in the tree under test.
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

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
// The REAL helper — parity assertions compare the rendered copy/windows against
// the single source of truth, so any drift (copy edit, flipped threshold, math
// change) turns this suite RED rather than passing on a hand-copied string.
import { entrainmentAdvice, deriveWindowsFromShift } from '@/lib/circadian/entrainment';
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

// A fixed active night shift for the populated case. Its id/type are what the
// (stubbed) plan mutation would key on; only their presence + stability matter.
const ACTIVE_SHIFT = {
  id: 's1',
  type: 'night',
  startTime: '2026-06-13T22:00:00.000Z',
  endTime: '2026-06-14T06:00:00.000Z',
};

// A REAL AI plan as the screen consumes it: `plan.meals` is a non-empty array of
// the plan-service wire shape (api/plans.ts PlanMeal: { time, label, description,
// macros:{...} }). The first meal's label "Pre-Shift Breakfast" resolves to the
// BREAKFAST slot (break/morning regex in mealTypeFromSlot), and its macros object
// feeds normalizePlannedMeal so the "Log <title>" CTA serializes plannedMacros +
// suggestedFoods into the log-planned-meal params. The screen never reads
// `plan.items`; there is no fabricated fallback timeline.
const PLAN_WITH_BREAKFAST = {
  meals: [
    {
      time: '20:00',
      label: 'Pre-Shift Breakfast',
      description: 'Slow-digesting protein before the shift',
      macros: { protein: 40, carbs: 20, fat: 15, calories: 415 },
    },
    {
      time: '00:30',
      label: 'Midnight Dinner',
      description: 'Lean protein + veg',
      macros: { protein: 35, carbs: 30, fat: 12, calories: 368 },
    },
  ],
};

let alertSpy: jest.SpyInstance;

describe('CircadianScreen', () => {
  beforeEach(() => {
    mockCurrentShift.data = undefined;
    mockCurrentShift.isLoading = false;
    mockCircadianModel.data = undefined;
    mockMutation.mode = 'idle';
    mockMutation.err = undefined;
    mockMutation.data = undefined;
    mockPush.mockClear();
    // The shipped UX replaced a destructive Alert with inline GlassCard notices;
    // spy so the quota/error tests can assert Alert.alert is NEVER raised.
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  // ── Test A: loading → skeleton scaffold only ──────────────────────────────
  test('loading: mounts the skeleton scaffold with no hero text or metric values', () => {
    mockCurrentShift.isLoading = true;

    expect(() => renderScreen()).not.toThrow();

    // The loading branch returns the skeleton scaffold ONLY — the hero copy and
    // the biological-window metric labels/values are not in the tree yet.
    expect(screen.queryByText('Circadian')).toBeNull();
    expect(screen.queryByText('Optimizer')).toBeNull();
    expect(screen.queryByText('Biological Windows')).toBeNull();
    expect(screen.queryByText('Melatonin Onset')).toBeNull();
    expect(screen.queryByText('Caffeine Cutoff')).toBeNull();
    expect(screen.queryByText('Entrainment Score')).toBeNull();

    // Nothing was pressed, so the screen fired no navigation on mount.
    expect(mockPush).not.toHaveBeenCalled();
  });

  // ── Test B: no shift → EmptyState + CtaButton deep-link ───────────────────
  test('no shift: renders the "No shift to sync to" EmptyState and the CtaButton deep-links to /(tabs)/schedule', () => {
    mockCurrentShift.data = undefined;
    mockCurrentShift.isLoading = false;

    renderScreen();

    // The honest zero-data EmptyState (not the metric grid).
    expect(screen.getByText('No shift to sync to')).toBeTruthy();
    expect(screen.queryByText('Biological Windows')).toBeNull();

    // The primary CTA is the Aurora CtaButton: accessibilityRole="button" whose
    // accessible name is its "Schedule a shift" label.
    const cta = screen.getByRole('button', { name: /Schedule a shift/ });
    fireEvent.press(cta);

    // It deep-links to the schedule tab — exactly once, with that single arg
    // (a stray 2nd param would silently change the deep-link target).
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith('/(tabs)/schedule');
  });

  // ── Test C: populated → AI Protocol tab → "Log this" push ─────────────────
  test('populated: switching to the AI Protocol tab and pressing a meal "Log this" pushes /(meals)/log-planned-meal with the slot params', () => {
    mockCurrentShift.data = ACTIVE_SHIFT;
    mockCurrentShift.isLoading = false;
    // A REAL generated plan (the screen has NO fabricated fallback — see
    // PLAN_WITH_BREAKFAST). Its first meal is a BREAKFAST slot, so the timeline's
    // first "Log" button carries mealType BREAKFAST. Without this the protocol
    // tab honestly renders the "No protocol yet" empty state.
    mockMutation.data = PLAN_WITH_BREAKFAST;

    renderScreen();

    // The profile hub is the default tab; the no-shift EmptyState must be gone
    // and the metric grid present for a populated shift.
    expect(screen.queryByText('No shift to sync to')).toBeNull();
    expect(screen.getByText('Biological Windows')).toBeTruthy();

    // Switch to the "AI Protocol" tab (accessibilityRole="tab", named by its
    // child text). With a real non-empty plan present, its meal timeline renders.
    fireEvent.press(screen.getByRole('tab', { name: /AI Protocol/ }));
    expect(screen.getByText("Today's Protocol")).toBeTruthy();

    // Each meal row exposes a "Log <title>" button (the one-tap plan→meal CTA
    // that replaced "Swap"). Press the first one and assert it opens the
    // log-planned-meal confirm screen, carrying the slot's mealType plus a
    // serialized `plan` param (macros/foods) so the screen renders prefilled.
    const logButtons = screen.getAllByRole('button', { name: /^Log / });
    expect(logButtons.length).toBeGreaterThan(0);
    fireEvent.press(logButtons[0]!);

    expect(mockPush).toHaveBeenCalledTimes(1);
    const arg = mockPush.mock.calls[0]![0] as { pathname: string; params: Record<string, string> };
    expect(arg.pathname).toBe('/(meals)/log-planned-meal');
    // The plan's first meal is the BREAKFAST slot.
    expect(arg.params.mealType).toBe('BREAKFAST');
    // `plan` is a JSON string carrying the planned macros + suggested foods.
    expect(typeof arg.params.plan).toBe('string');
    expect(() => JSON.parse(arg.params.plan!)).not.toThrow();
    const parsedPlan = JSON.parse(arg.params.plan!);
    expect(parsedPlan).toHaveProperty('plannedMacros');
    expect(parsedPlan).toHaveProperty('suggestedFoods');
  });

  // ── Test group D: helper parity (entrainment.ts single source of truth) ────
  describe('entrainment helper parity', () => {
    // (D1) The four biological-window tiles render EXACTLY what
    // deriveWindowsFromShift(shift) returns — proving the inline endTime±h math
    // was replaced by the shared helper (no drift between the two).
    test('no-model fallback: the four window tiles equal deriveWindowsFromShift(shift)', () => {
      mockCurrentShift.data = ACTIVE_SHIFT;
      mockCircadianModel.data = undefined; // force the no-model fallback branch

      renderScreen();

      // Source of truth — same call the screen now makes (no options ⇒ helper
      // defaults), so the expected strings are equal by construction regardless
      // of the jest locale.
      const w = deriveWindowsFromShift({
        startTime: ACTIVE_SHIFT.startTime,
        endTime: ACTIVE_SHIFT.endTime,
      });

      // Each tile label is present, and each helper-derived value renders at
      // least once. We use getAllByText (length >= 1) rather than getByText for
      // the values because two windows can format to the SAME HH:MM string in
      // some timezones (e.g. insulinStart === peakTemp, both anchored at
      // startTime) — a collision must not make the parity assertion throw.
      expect(screen.getAllByText('Melatonin Onset')[0]).toBeTruthy();
      expect(screen.getAllByText(w.melatoninStart).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Caffeine Cutoff')[0]).toBeTruthy();
      expect(screen.getAllByText(w.caffeineCutoff).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Insulin Peak')[0]).toBeTruthy();
      expect(screen.getAllByText('Peak Temp')[0]).toBeTruthy();
      // insulinStart and peakTemp are both anchored at startTime → identical
      // string; assert that exact value renders for BOTH tiles.
      expect(w.peakTemp).toBe(w.insulinStart);
      expect(screen.getAllByText(w.insulinStart).length).toBeGreaterThanOrEqual(2);
    });

    // (D2) A malformed shift ISO must NOT crash the screen: deriveWindowsFromShift
    // THROWS on it, and the screen's try/catch falls back to the '--:--' tiles.
    test('no-model fallback: a malformed shift ISO never throws and shows the --:-- placeholders', () => {
      mockCurrentShift.data = { id: 'bad', type: 'night', startTime: 'not-a-date', endTime: '' };
      mockCircadianModel.data = undefined;

      expect(() => renderScreen()).not.toThrow();

      // The grid still renders (populated branch), with the placeholder values.
      expect(screen.getByText('Biological Windows')).toBeTruthy();
      // All four tiles fall back to '--:--' → at least four occurrences.
      expect(screen.getAllByText('--:--').length).toBeGreaterThanOrEqual(4);
    });

    // (D3) The advice copy equals entrainmentAdvice(score) for the three branches:
    // a high score (>=80, model-present), a finite low score (<80, model-present),
    // and no score (null, the no-model fallback). Asserting against the helper's
    // return value (not a hand-copied string) pins the single source of truth.
    test('advice copy equals entrainmentAdvice(score): score>=80', () => {
      mockCurrentShift.data = ACTIVE_SHIFT;
      mockCircadianModel.data = { entrainmentScore: 88 };

      renderScreen();

      const expected = entrainmentAdvice(88);
      expect(expected).toBe(
        'Good alignment. Try getting 15m of sunlight upon waking to improve this score.',
      );
      expect(screen.getByText(expected)).toBeTruthy();
    });

    test('advice copy equals entrainmentAdvice(score): a finite score < 80', () => {
      mockCurrentShift.data = ACTIVE_SHIFT;
      mockCircadianModel.data = { entrainmentScore: 42 };

      renderScreen();

      const expected = entrainmentAdvice(42);
      expect(expected).toBe('Room for improvement. Focus on consistent sleep/wake times.');
      expect(screen.getByText(expected)).toBeTruthy();
    });

    test('advice copy equals entrainmentAdvice(score): null (no model / no score)', () => {
      mockCurrentShift.data = ACTIVE_SHIFT;
      mockCircadianModel.data = undefined; // no-model fallback ⇒ entrainmentScore null

      renderScreen();

      const expected = entrainmentAdvice(null);
      expect(expected).toBe('Log more shifts to calculate your score.');
      expect(screen.getByText(expected)).toBeTruthy();
    });
  });

  // ── Test group E: shipped 429 quota UX (Upgrade CTA vs Alert) ──────────────
  describe('daily-AI-limit quota UX', () => {
    // Reach the AI Protocol tab where the Regenerate action + the notices live.
    function gotoProtocolTab() {
      expect(screen.getByText('Biological Windows')).toBeTruthy();
      fireEvent.press(screen.getByRole('tab', { name: /AI Protocol/ }));
      expect(screen.getByText("Today's Protocol")).toBeTruthy();
    }

    // (E1) A 429 ai_quota_exceeded → the distinct upgrade block whose CtaButton
    // routes to '/(modals)/premium' — and NO destructive Alert.alert.
    test('a 429 ai_quota_exceeded renders the Upgrade CTA (routes to premium) and does NOT call Alert.alert', () => {
      mockCurrentShift.data = ACTIVE_SHIFT;
      mockMutation.mode = 'error';
      mockMutation.err = {
        response: {
          status: 429,
          data: { error: 'ai_quota_exceeded', limit: 5, plan: 'free', resetsAt: '2099-01-02T00:00:00.000Z' },
        },
      };

      renderScreen();
      gotoProtocolTab();

      // Kick off a (re)generation → the stubbed mutate runs the screen's real
      // onError(parseAiQuotaError → setQuota).
      fireEvent.press(screen.getByRole('button', { name: /Regenerate protocol/ }));

      // The distinct upgrade block appears (NOT the generic error / Alert).
      expect(screen.getByText('Daily AI limit reached')).toBeTruthy();
      expect(screen.getByText(/used all 5 of your free daily AI plans/i)).toBeTruthy();
      expect(screen.queryByText('Generation failed')).toBeNull();
      // The destructive Alert is gone — the quota case is an inline GlassCard.
      expect(alertSpy).not.toHaveBeenCalled();

      // Press the Upgrade CtaButton → routes to the premium modal, only that.
      const upgrade = screen.getByRole('button', { name: /Upgrade to remove the daily AI limit/ });
      fireEvent.press(upgrade);

      expect(mockPush).toHaveBeenCalledTimes(1);
      expect(mockPush).toHaveBeenCalledWith('/(modals)/premium');
    });

    // (E2) A generic failure → the retryable "Generation failed" Try-Again
    // notice (NOT the upgrade CTA, and — critically — no Alert).
    test('a generic rejection renders the retryable "Generation failed" Try-Again notice, NOT the upgrade CTA, and no Alert', () => {
      mockCurrentShift.data = ACTIVE_SHIFT;
      mockMutation.mode = 'error';
      mockMutation.err = { response: { status: 500, data: { message: 'Internal error' } } };

      renderScreen();
      gotoProtocolTab();

      fireEvent.press(screen.getByRole('button', { name: /Regenerate protocol/ }));

      // The retryable inline error — with a Try Again action — appears.
      expect(screen.getByText('Generation failed')).toBeTruthy();
      expect(screen.getByRole('button', { name: /Try again/ })).toBeTruthy();

      // NOT the upgrade state, no navigation, no Alert.
      expect(screen.queryByText('Daily AI limit reached')).toBeNull();
      expect(screen.queryByRole('button', { name: /Upgrade to remove the daily AI limit/ })).toBeNull();
      expect(mockPush).not.toHaveBeenCalled();
      expect(alertSpy).not.toHaveBeenCalled();
    });
  });

  // ── Test group F: entrainment-score resolution (line-300 dual-key read) ────
  // Pins the `resolvedEntrainmentScore` resolution the screen renders into the
  // Entrainment Score gauge:
  //   resolvedEntrainmentScore = profileMetrics?.entrainmentScore
  //                            ?? circadianModel?.entrainmentScore ?? null
  // This is a BINDING test for the score number itself (group D pins the advice
  // COPY + the window tiles; this group pins the rendered NUMBER and its '--'
  // placeholder). It turns RED if the resolution rebinds to a stray/phantom
  // field (e.g. the old untyped `(circadianModel as any)?.score`, which no
  // producer ever sets) instead of the model's real `entrainmentScore`.
  describe('entrainment score resolution', () => {
    // The gauge renders the resolved score and a "/100" suffix as children of the
    // SAME outer <Text>, so RNTL's text content for that node is the CONCATENATION
    // ("73/100"). We assert that composite (exact match) — it uniquely identifies
    // the score gauge ("/100" appears nowhere else) and binds to the rendered
    // number, turning RED if the resolution rebinds to a stray/phantom field.
    test('model-present: renders the resolved entrainment score number', () => {
      mockCurrentShift.data = ACTIVE_SHIFT;
      mockCircadianModel.data = { entrainmentScore: 73 };

      renderScreen();

      expect(screen.getByText('24-Hour Body Clock')).toBeTruthy();
      // 73 resolves off the model (via profileMetrics' model-present branch); a
      // rebind to a non-existent key would render the "--/100" placeholder here.
      expect(screen.getByText('73/100')).toBeTruthy();
      expect(screen.queryByText('--/100')).toBeNull();
    });

    // (F2) Model-present score of 0 still renders "0/100" (NOT the placeholder):
    // the resolution uses `??` (nullish), so a falsy-but-valid 0 is preserved and
    // is NOT swallowed into the '--' placeholder. Guards the rendering-no-falsy
    // rule — a `||` regression would render "--/100" and fail this.
    test('model-present: a zero score renders "0", not the placeholder', () => {
      mockCurrentShift.data = ACTIVE_SHIFT;
      mockCircadianModel.data = { entrainmentScore: 0 };

      renderScreen();

      expect(screen.getByText('24-Hour Body Clock')).toBeTruthy();
      expect(screen.getByText('0/100')).toBeTruthy();
      expect(screen.queryByText('--/100')).toBeNull();
    });

    // (F3) Model-absent (no circadianModel, present shift) → profileMetrics'
    // no-model fallback yields a null score AND circadianModel?.entrainmentScore
    // is undefined, so the resolution collapses to null → the gauge renders the
    // "--/100" placeholder. (The four window tiles use the distinct '--:--'
    // placeholder string, and here render real HH:MM values anyway.)
    test('model-absent: renders the "--" placeholder when no score resolves', () => {
      mockCurrentShift.data = ACTIVE_SHIFT;
      mockCircadianModel.data = undefined; // no model ⇒ no score anywhere

      renderScreen();

      expect(screen.getByText('24-Hour Body Clock')).toBeTruthy();
      expect(screen.getByText('--/100')).toBeTruthy();
      expect(screen.queryByText('73/100')).toBeNull();
    });
  });
});
