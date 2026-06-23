/**
 * build-plate.test.tsx
 *
 * Render + behaviour lock on `app/(modals)/build-plate.tsx` — the "Build Your
 * Plate" quick-logger reached from the nutrition tab. The screen lists a few
 * quick-add foods, lets you stack them onto a circular "plate" with a running
 * macro summary, and logs them all at once under the chosen meal type.
 *
 * This suite was created alongside the split-brain fix: build-plate used to
 * invalidate ['meal-logs'] + ['today-progress'] only, so a plate logged here
 * refreshed the DASHBOARD ring but left the Nutrition tab's ['daily-progress']
 * ring stale. The onSuccess handler now routes through the shared
 * invalidateMealAndProgress(qc) helper (kept REAL below) so BOTH rings refresh.
 * The tests pin the load-bearing branches:
 *
 *   - Test A (quick-add list): the ['foods-quick-add'] query rows render with
 *     their add-affordance accessibility labels, and the footer "Save Meal" CTA
 *     starts DISABLED (the plate is empty — no silent empty log).
 *   - Test B (add → plate + enabled CTA): tapping a quick-add row stacks it onto
 *     the plate ("Current Plate" + the item name mount) and the CTA enables;
 *     pressing it fires saveMutation.mutate.
 *   - Test C (mutationFn builds the payload): the captured mutationFn forwards a
 *     payload to the mocked logMeal carrying the default mealType (BREAKFAST)
 *     and a non-empty foodItems line derived from the added quick-add food.
 *   - Test D (success refreshes BOTH progress rings): the captured onSuccess
 *     routes through the shared invalidateMealAndProgress(qc) helper, so a
 *     successful log invalidates ['meal-logs'] + ['daily-progress'] (the
 *     Nutrition tab ring) AND ['today-progress'] (the dashboard ring) — the
 *     dual-key contract the old inline call broke — then router.back()s.
 *
 * Mock conventions mirror the sibling screen suites (log-meal / log-planned-meal):
 *   - `expo-router` exposes a hoisted `mockPush`/`mockBack` read by useRouter
 *     (build-plate navigates with router.back() on success).
 *   - `@tanstack/react-query` is stubbed: useQuery branches on queryKey[0]
 *     (['foods-quick-add'] drives the quick-add rows via a mutable holder);
 *     useMutation captures the passed `mutationFn` AND `onSuccess` into holders
 *     so a test can invoke them and inspect the args handed to the mocked
 *     `logMeal` / the cache keys invalidated, and returns `mutate`/`isPending`.
 *   - `@/api/meals` is mocked so the real axios client never loads; `logMeal` is
 *     the spy under assertion (searchFoods exists only to satisfy the import
 *     graph — useQuery is fully stubbed).
 *   - `@/utils/invalidateMealAndProgress` is kept REAL so the dual-key
 *     invalidation it performs is genuinely exercised by Test D (the spy lives
 *     on the fake query client the helper receives).
 *   - `@/components/SafeBlurView` is a passthrough View. build-plate's own glass
 *     `Card` rows render via expo-linear-gradient (mocked below), but importing
 *     `{ Skeleton, EmptyState }` from the `@/components/ui` barrel transitively
 *     evaluates GlassCard → SafeBlurView → expo-blur's native module; stubbing
 *     SafeBlurView keeps that import graph off the native blur (same guard the
 *     hydration / log-meal suites use). Decorative glyphs, safe-area insets,
 *     expo-linear-gradient (the glass Card fill + the primary Button's fill) and
 *     the status bar are stubbed the same way as the rest of the screen suites.
 */

// ── jest.mock hoisting block (runs ABOVE the imports) ────────────────────────

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack, replace: jest.fn() }),
}));

// react-query: branch on queryKey[0].
//   ['foods-quick-add'] → the quick-add rows (a mutable holder; tests set data).
// useMutation captures the screen's mutationFn so Test C can invoke the real
// payload builder and inspect what it forwards to the (mocked) logMeal, and its
// onSuccess so Test D can drive the success path; isPending is fixed false so
// the CTA renders its label, not the spinner.
type QueryState = { data: any; isLoading: boolean; isError: boolean };
const mockFoodsState: QueryState = { data: undefined, isLoading: false, isError: false };
const mockMutationFn: { current: null | ((payload?: unknown) => unknown) } = { current: null };
const mockOnSuccess: { current: null | ((data?: unknown) => unknown) } = { current: null };
const mockMutate = jest.fn();
// A stable invalidateQueries spy shared by every useQueryClient() call in a
// render, so Test D can assert the exact set of query keys the success handler
// invalidates (via the shared invalidateMealAndProgress helper, kept REAL below).
const mockInvalidateQueries = jest.fn();
const mockQueryClient = { invalidateQueries: mockInvalidateQueries };
jest.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    const key = queryKey[0];
    if (key === 'foods-quick-add') {
      return { data: mockFoodsState.data, isLoading: mockFoodsState.isLoading, isError: mockFoodsState.isError, refetch: jest.fn() };
    }
    // Any other key — idle/empty.
    return { data: undefined, isLoading: false, isError: false, refetch: jest.fn() };
  },
  useMutation: ({ mutationFn, onSuccess }: { mutationFn: (payload?: unknown) => unknown; onSuccess?: (data?: unknown) => unknown }) => {
    mockMutationFn.current = mutationFn;
    mockOnSuccess.current = onSuccess ?? null;
    return { mutate: mockMutate, isPending: false };
  },
  useQueryClient: () => mockQueryClient,
}));

// api/meals — logMeal is the spy under assertion; searchFoods is never invoked
// (useQuery is stubbed) but must exist so the static import resolves.
const mockLogMeal = jest.fn((_payload?: unknown) => Promise.resolve({ id: 'log-1' }));
jest.mock('@/api/meals', () => ({
  logMeal: (...args: any[]) => mockLogMeal(...args),
  searchFoods: jest.fn(),
}));

// SafeBlurView → passthrough View. The @/components/ui barrel (imported below
// for Skeleton/EmptyState) transitively pulls in GlassCard → SafeBlurView →
// expo-blur; stubbing it keeps that native module out of the render.
jest.mock('@/components/SafeBlurView', () => {
  const RN = require('react-native');
  return { SafeBlurView: ({ children, ...rest }: any) => <RN.View {...rest}>{children}</RN.View> };
});

jest.mock('@expo/vector-icons', () => {
  const { Text: RNText } = require('react-native');
  return { Ionicons: ({ name }: { name?: string }) => <RNText>{`icon:${name ?? ''}`}</RNText> };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));

// expo-linear-gradient ships a native module; the primary Button's fill → View.
jest.mock('expo-linear-gradient', () => {
  const RN = require('react-native');
  return { LinearGradient: (props: any) => <RN.View {...props} /> };
});

jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

// react-native-reanimated: the success "saved" beat now defers router.back()
// into a withTiming COMPLETION CALLBACK (runOnJS(router.back) inside the final
// timing of a withSequence/withDelay chain). The stock reanimated jest mock
// applies values but never invokes that callback, so the navigation would
// appear to never fire under test. This lightweight stub mirrors the runtime
// contract: withTiming invokes its completion callback with finished=true and
// runOnJS returns a function that calls through — so the success path's
// router.back() runs exactly as it does on-device. Animation primitives the
// screen uses (FadeIn*/Layout/useSharedValue/useAnimatedStyle) are passthrough.
jest.mock('react-native-reanimated', () => {
  const RN = require('react-native');
  const View = (props: any) => <RN.View {...props} />;
  const AnimatedView: any = View;
  AnimatedView.View = View;
  AnimatedView.Text = (props: any) => <RN.Text {...props} />;
  AnimatedView.createAnimatedComponent = (C: any) => C;
  const entering: any = new Proxy(() => entering, { get: () => () => entering });
  return {
    __esModule: true,
    default: AnimatedView,
    // Entering/exiting/layout transition builders → chainable no-ops.
    FadeIn: entering,
    FadeInDown: entering,
    FadeInUp: entering,
    Layout: entering,
    Easing: { out: () => () => 0, back: () => () => 0, cubic: () => 0, inOut: () => () => 0, linear: () => 0 },
    useSharedValue: (init: any) => ({ value: init }),
    useAnimatedStyle: (fn: any) => (typeof fn === 'function' ? fn() : {}),
    useAnimatedProps: (fn: any) => (typeof fn === 'function' ? fn() : {}),
    // A timing that fires its completion callback (the seam the success beat
    // hangs router.back() on), returning the target value.
    withTiming: (toValue: any, _config?: any, cb?: (finished: boolean) => void) => {
      if (typeof cb === 'function') cb(true);
      return toValue;
    },
    // Sequence/delay reduce to their final value so the inner withTiming's
    // callback above fires during construction.
    withSequence: (...steps: any[]) => steps[steps.length - 1],
    withDelay: (_ms: number, anim: any) => anim,
    // runOnJS returns a JS-thread caller — invoking it runs the wrapped fn.
    runOnJS: (fn: any) => (...args: any[]) => fn(...args),
  };
});

// ── Imports (run AFTER the hoisted mocks above) ──────────────────────────────
import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react-native';
import { ThemeContext, getThemeColors, typography, spacing, borderRadius, shadows } from '@/theme';
import BuildPlateScreen from '../../app/(modals)/build-plate';

function renderScreen() {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      <BuildPlateScreen />
    </ThemeContext.Provider>,
  );
}

// Two quick-add foods returned by the ['foods-quick-add'] query.
const QUICK_ADD_FOODS = [
  { id: 'food-1', name: 'Grilled Chicken', calories: 220, protein: 40, carbs: 0, fat: 5 },
  { id: 'food-2', name: 'Brown Rice', calories: 215, protein: 5, carbs: 45, fat: 2 },
];

describe('BuildPlateScreen', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockBack.mockClear();
    mockMutate.mockClear();
    mockLogMeal.mockClear();
    mockInvalidateQueries.mockClear();
    mockMutationFn.current = null;
    mockOnSuccess.current = null;
    mockFoodsState.data = undefined;
    mockFoodsState.isLoading = false;
    mockFoodsState.isError = false;
  });

  // ── Test A: quick-add list renders, CTA disabled with an empty plate ───────
  test('quick-add: renders the food rows and the footer Save Meal CTA starts disabled', () => {
    mockFoodsState.data = QUICK_ADD_FOODS;

    expect(() => renderScreen()).not.toThrow();

    // Both quick-add rows render with their add-affordance accessibility labels.
    expect(screen.getByRole('button', { name: 'Add Grilled Chicken to plate' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add Brown Rice to plate' })).toBeTruthy();

    // Footer CTA is present but disabled (the plate is empty) — pressing it is a
    // no-op, no silent empty log.
    fireEvent.press(screen.getByText('Save Meal'));
    expect(mockMutate).not.toHaveBeenCalled();
  });

  // ── Test B: adding a food stacks the plate and enables the CTA ─────────────
  test('add: tapping a quick-add row stacks the plate and enables the Save Meal CTA', () => {
    mockFoodsState.data = QUICK_ADD_FOODS;

    renderScreen();

    // Add the first quick-add food to the plate.
    fireEvent.press(screen.getByRole('button', { name: 'Add Grilled Chicken to plate' }));

    // The plate section mounts with the added item.
    expect(screen.getByText('On Your Plate')).toBeTruthy();

    // The CTA is now enabled — pressing it fires the save mutation.
    fireEvent.press(screen.getByText('Save Meal'));
    expect(mockMutate).toHaveBeenCalledTimes(1);
  });

  // ── Test C: the mutationFn builds the logMeal payload from the plate ───────
  test('confirm: the captured mutationFn forwards a built payload to logMeal', () => {
    mockFoodsState.data = QUICK_ADD_FOODS;

    renderScreen();

    // Add a food so the plate is non-empty, then fire the mutation.
    fireEvent.press(screen.getByRole('button', { name: 'Add Grilled Chicken to plate' }));
    fireEvent.press(screen.getByText('Save Meal'));
    expect(mockMutate).toHaveBeenCalledTimes(1);

    // Invoke the captured mutationFn to drive the real payload builder, then
    // inspect what it forwarded to the mocked logMeal.
    expect(mockMutationFn.current).toBeTruthy();
    mockMutationFn.current!();

    expect(mockLogMeal).toHaveBeenCalledTimes(1);
    const payload = mockLogMeal.mock.calls[0]![0] as {
      mealType: string;
      foodItems: Array<{ name: string; calories: number; protein: number }>;
    };
    // Default meal type (BREAKFAST) + a single line derived from the added food.
    expect(payload.mealType).toBe('BREAKFAST');
    expect(payload.foodItems).toHaveLength(1);
    expect(payload.foodItems[0]!.name).toBe('Grilled Chicken');
    expect(payload.foodItems[0]!.calories).toBe(220);
    expect(payload.foodItems[0]!.protein).toBe(40);
  });

  // ── Test D: a successful log refreshes BOTH progress rings ─────────────────
  // The onSuccess handler routes through the shared invalidateMealAndProgress(qc)
  // helper (kept REAL), so it must invalidate the per-day meal list AND BOTH
  // calorie rings: ['daily-progress'] (the Nutrition tab) and ['today-progress']
  // (the dashboard). This locks the split-brain fix — a plate logged here can no
  // longer leave the Nutrition tab ring stale — and that it still router.back()s.
  test('success: invalidates meal-logs + BOTH progress rings (daily-progress & today-progress) then navigates back', () => {
    renderScreen();

    // The screen registered an onSuccess via useMutation.
    expect(mockOnSuccess.current).toBeTruthy();

    // Drive the success path (as react-query would after logMeal resolves).
    mockOnSuccess.current!({ id: 'log-1' });

    // It refreshed all three keys through the shared helper, in particular BOTH
    // rings — the Nutrition tab's and the dashboard's.
    const invalidatedKeys = mockInvalidateQueries.mock.calls.map((c) => c[0].queryKey);
    expect(invalidatedKeys).toEqual(
      expect.arrayContaining([['meal-logs'], ['daily-progress'], ['today-progress']]),
    );
    // The Nutrition tab ring key specifically — the one the old inline pair dropped.
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['daily-progress'] });

    // And it still dismisses the modal afterward.
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});
