/**
 * calculator.mathGuards.test.tsx
 *
 * Hardening proof for the 1RM math + save-status UX the Training 1RM Calculator
 * (`app/(exercises)/calculator.tsx`) owns. The screen estimates a one-rep max from
 * a weight + rep count via three formulas, then renders the active estimate in a
 * giant "ESTIMATED 1RM" numeral, in each formula-selector chip, and across every
 * Training-Zones row (estimated1RM × pct / 100). Two of the formulas divide by a
 * rep-dependent denominator that reaches zero / goes negative for large reps:
 *
 *   brzycki = w · (36 / (37 - r))        → 37 - r = 0 at r = 37 (Infinity), < 0 for r > 37
 *   lander  = 100w / (101.3 - 2.67123r)  → denominator ≤ 0 near r ≈ 38
 *
 * The pre-existing guards (`r <= 0`, `r === 1`) miss r >= 37, so reps=37 surfaced a
 * literal "Infinity" in the numeral / chip / every zone row, and reps>37 surfaced a
 * negative. The screen now routes every formula output AND each zone-row product
 * through a module-scope `safe` helper (Number.isFinite && > 0 ? Math.round : 0),
 * so a non-finite/negative estimate collapses to a finite 0 and a valid estimate
 * rounds exactly as Math.round did before.
 *
 * The save action also no longer uses a modal alert dialog: the success / failure
 * UX is an inline, accessibilityRole="alert" surface driven by the mutation's own
 * state, with a Retry (error) that re-fires the same mutation. The SAVE is ALSO
 * guarded against the server's POST /v1/exercises/1rm body schema, which requires
 * weightKg AND estimated1RMKg to be z.number().positive() (a 0 → 400): the shared
 * CtaButton is `disabled` (accessibilityState.disabled + a swallowed press) and the
 * onPress short-circuits whenever w <= 0 || estimated1RM <= 0, with an inline hint.
 * So the button is present + pressable only when the estimate is positive.
 *
 * This suite feeds the AT-RISK reps and asserts the OUTPUTS stay finite/clamped,
 * the SAVE fires ONLY for a positive estimate (and is guarded off — never POSTing a
 * 0 — at a clamped/blank one), the inline error surface renders (no modal alert
 * dialog) with a working Retry, and a normal rep count renders the SAME rounded
 * numbers as before:
 *
 *   1. reps=37 (Brzycki/Lander denominator hits 0) → no 'Infinity'/'NaN' anywhere
 *      in the numeral or the zone rows; every shown kg is finite & >= 0; with the
 *      ACTIVE formula on a positive estimate (Lander, 4058) the SAVE CtaButton is
 *      enabled and its press fires the mutation.
 *   2. reps=40 (> 37 → denominator negative) → same finite/clamped outputs, and with
 *      the active estimate clamped to 0 the SAVE is GUARDED OFF: the CtaButton reports
 *      accessibilityState.disabled, the inline hint shows, and the press never fires.
 *   2b. a blank WEIGHT (w <= 0) likewise guards the SAVE off regardless of reps.
 *   3. a simulated save FAILURE → the inline accessibilityRole="alert" surface
 *      renders the verbatim error copy (NOT a modal alert dialog), and its Retry
 *      re-invokes saveMutation.mutate().
 *   4. CONTROL — reps=5 renders the SAME rounded estimate + zone numbers the
 *      un-hardened math produced (the guard moved no well-formed value).
 *
 * Cites react-native-skills: rendering-no-falsy-and (the 1RM numeral / chips / zone
 * rows and the status surface must never leak a falsy 0 / NaN / Infinity into the
 * tree as bare text — the surface is rendered with ternary-null), state-ground-truth
 * (the status surface + the dismiss-by-navigation derive from the saveMutation
 * status — the single source of truth; this suite drives that state and reads only
 * the derived surface), rendering-text-in-text-component (every string the screen
 * shows is inside <Text>; this suite asserts on those Text nodes).
 *
 * Mock conventions: react-query is mocked directly (per the work-item) with a
 * hoisted, mutable `mockMutationState` + a `mockMutate` spy, so each test pins the
 * mutation's isPending/isError/isSuccess/error and observes mutate() calls without
 * a live client; @/api/exercises is fully mocked (logOneRepMax stubbed so axios
 * never loads); expo-router back is a hoisted holder. @/components/ui and @/theme
 * are the REAL modules (the screen's GlassCard / CtaButton render unstubbed), so
 * the status surface + CtaButton are exercised for real; only the native-backed
 * leaves (vector-icons / expo-linear-gradient / SafeBlurView / expo-status-bar /
 * safe-area) are stubbed so no native module loads.
 *
 * Additive: NEW test file only (owns no production source; touches no sibling suite
 * or the components it renders).
 */

// ── jest.mock hoisting block (runs ABOVE the imports) ────────────────────────

// expo-router: `back` is a hoisted holder (the success effect calls it; we only
// need it not to throw). push/replace are benign stubs.
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: mockBack, replace: jest.fn() }),
}));

// react-query mocked directly. `mockMutationState` is a mutable hoisted holder each
// test overwrites to pin the mutation status the screen reads (isPending /
// isError / isSuccess / error). `mockMutate` is the spy the screen's onPress and
// the inline Retry both call — asserting it fires proves the SAVE CtaButton and
// the Retry are wired to the real mutation. useMutation ignores its config here
// (we don't need the real onSuccess to run; the success branch is state-driven and
// covered by flipping isSuccess), and returns the holder + the spy.
const mockMutate = jest.fn();
let mockMutationState: {
  isPending: boolean;
  isError: boolean;
  isSuccess: boolean;
  error: unknown;
} = { isPending: false, isError: false, isSuccess: false, error: null };
jest.mock('@tanstack/react-query', () => ({
  useMutation: () => ({
    mutate: mockMutate,
    isPending: mockMutationState.isPending,
    isError: mockMutationState.isError,
    isSuccess: mockMutationState.isSuccess,
    error: mockMutationState.error,
  }),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

// API module the screen statically imports. logOneRepMax is stubbed so @/api/client
// (axios) never loads; the suite drives the mutation state directly, so its resolved
// value is irrelevant.
jest.mock('@/api/exercises', () => ({
  logOneRepMax: jest.fn().mockResolvedValue({ id: '1rm-1' }),
}));

// Decorative glyphs → plain <Text> surfacing the icon name (mirrors the sibling
// suites; lets the status surface's icons render without expo-font).
jest.mock('@expo/vector-icons', () => {
  const { Text: RNText } = require('react-native');
  return { Ionicons: ({ name }: { name?: string }) => <RNText>{`icon:${name ?? ''}`}</RNText> };
});

// Native-module-backed visuals → passthrough Views so no native module loads. The
// REAL GlassCard renders its children through SafeBlurView, which we stub to a
// View (GlassCard / CtaButton themselves stay the real @/components/ui modules).
jest.mock('expo-linear-gradient', () => {
  const RN = require('react-native');
  return { LinearGradient: (props: any) => <RN.View {...props} /> };
});
jest.mock('@/components/SafeBlurView', () => {
  const RN = require('react-native');
  return { SafeBlurView: (props: any) => <RN.View {...props} /> };
});
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));

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
import CalculatorScreen from '../../app/(exercises)/calculator';

// Toxic serialisations a non-finite / negative estimate would emit into a <Text>.
const INFINITY_RE = /Infinity/;
const NAN_RE = /NaN/;

function renderScreen() {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      <CalculatorScreen />
    </ThemeContext.Provider>,
  );
}

/**
 * Set the WEIGHT + REPS inputs. The screen seeds weight="100" and reps="5", so we
 * locate each controlled TextInput by its CURRENT display value (getByDisplayValue
 * returns the host input, and the two seed values are distinct so there is no
 * cross-match) and fire onChangeText to drive its setState. Reps is set FIRST so a
 * weight change can't shift the value the reps lookup keys on.
 */
function setInputs(weight: string, reps: string) {
  fireEvent.changeText(screen.getByDisplayValue('5'), reps);
  fireEvent.changeText(screen.getByDisplayValue('100'), weight);
}

/**
 * Every "<n>kg" Text the screen renders (the formula chips + the zone rows) must
 * be a finite, non-negative integer — never 'Infinity' / 'NaN' / negative. Returns
 * the parsed numbers so a caller can pin exact values.
 */
function expectAllKgFiniteNonNegative(): number[] {
  // Every "<value>kg" Text on the screen (the formula chips + the zone rows). The
  // node's children are a ['<value>', 'kg'] pair, so match on the trailing 'kg'
  // and read the numeric sibling. "KILOGRAMS" (uppercase, ends 'S') never matches.
  const kgNodes = screen.getAllByText(/kg$/);
  const values: number[] = [];
  for (const node of kgNodes) {
    // children is e.g. ['116', 'kg'] (a value + the literal unit) — flatten + strip.
    const raw = [].concat(node.props.children as any).join('');
    const numericPart = raw.replace(/kg$/, '');
    expect(raw).not.toMatch(INFINITY_RE);
    expect(raw).not.toMatch(NAN_RE);
    const n = Number(numericPart);
    expect(Number.isFinite(n)).toBe(true);
    expect(n).toBeGreaterThanOrEqual(0);
    values.push(n);
  }
  return values;
}

/**
 * Assert the big "ESTIMATED 1RM" numeral renders exactly `expected` and nothing
 * toxic. The numeral is the only Text whose flattened content is a BARE number
 * (the formula chips + zone rows render "<n>kg" / "<pct>%", never a lone number),
 * so an exact-string match pins it without climbing the tree. Also guards the two
 * toxic serialisations directly: getByText would throw if the numeral were
 * 'Infinity'/'NaN' and we asked for the number, so we additionally assert neither
 * toxic token exists anywhere.
 */
function expectNumeral(expected: number) {
  expect(screen.getByText(String(expected))).toBeTruthy();
  expect(screen.queryByText(INFINITY_RE)).toBeNull();
  expect(screen.queryByText(NAN_RE)).toBeNull();
}

beforeEach(() => {
  jest.clearAllMocks();
  mockMutationState = { isPending: false, isError: false, isSuccess: false, error: null };
});

describe('CalculatorScreen — 1RM divide-by-zero guards + inline save surface', () => {
  // ── 1: reps=37 (Brzycki/Lander denominator = 0) → no Infinity/NaN, CTA live ──
  test('reps=37 never renders Infinity/NaN in the numeral or zone rows; SAVE CtaButton present + pressable', () => {
    renderScreen();
    setInputs('100', '37');

    // The giant estimate numeral with the default active formula (Epley) is finite:
    // round(100·(1 + 37/30)) = round(223.33) = 223 — and nothing toxic leaks.
    expectNumeral(223);

    // Selecting Brzycki (whose denominator is EXACTLY 0 at r=37 → w·(36/0) =
    // Infinity pre-guard) must STILL show a finite chip + finite zone rows: the
    // `safe` guard collapses the Infinity to 0 rather than leaking it. So the
    // numeral and the Brzycki chip both read 0 here, and NO 'Infinity' appears.
    fireEvent.press(screen.getByLabelText('brzycki formula'));
    expectNumeral(0);
    const valuesB = expectAllKgFiniteNonNegative();
    expect(valuesB.length).toBeGreaterThan(0);

    // Lander at r=37: 10000/(101.3 - 2.67123·37) = round(4057.6) = 4058 — finite &
    // positive; still no toxic token leaks.
    fireEvent.press(screen.getByLabelText('lander formula'));
    expectNumeral(4058);
    expectAllKgFiniteNonNegative();

    // The primary SAVE is the shared CtaButton. The ACTIVE formula here is Lander
    // (estimated1RM=4058, weight=100) → both halves of the save guard pass, so the
    // button is ENABLED and pressing it fires the real mutation (proves it's wired,
    // not inert, when the estimate is positive).
    const saveCta = screen.getByLabelText('Save to records');
    expect(saveCta).toBeTruthy();
    expect(saveCta.props.accessibilityState?.disabled).toBe(false);
    fireEvent.press(saveCta);
    expect(mockMutate).toHaveBeenCalledTimes(1);
  });

  // ── 2: reps=40 (> 37 → denominator negative) → no Infinity/NaN/negative leak ──
  test('reps=40 (>37) never renders Infinity/NaN/negative; values finite >= 0; SAVE is guarded off at estimate=0', () => {
    renderScreen();
    setInputs('100', '40');

    // Brzycki at r=40 → 100·(36/(37-40)) = 100·(36/-3) = -1200 < 0 pre-guard. `safe`
    // clamps the negative estimate to 0 → the numeral reads 0 (never '-1200'), and
    // no toxic token / negative kg leaks anywhere.
    fireEvent.press(screen.getByLabelText('brzycki formula'));
    expectNumeral(0);

    // No "-<n>kg" negative anywhere (the guard clamps the negative estimate to 0).
    expect(screen.queryByText(/^-\d+(\.\d+)?kg$/)).toBeNull();
    const values = expectAllKgFiniteNonNegative();
    expect(values.every((v) => v >= 0)).toBe(true);

    // With the active estimate clamped to 0, the SAVE is GUARDED OFF: the server's
    // POST /v1/exercises/1rm body schema rejects a non-positive estimated1RMKg with
    // a 400, so the CtaButton reports accessibilityState.disabled and pressing it is
    // a no-op (the disabled Pressable swallows the press AND the onPress short-
    // circuits) — the mutation never fires. The inline hint explains why.
    const saveCta = screen.getByLabelText('Save to records');
    expect(saveCta).toBeTruthy();
    expect(saveCta.props.accessibilityState?.disabled).toBe(true);
    expect(screen.getByText('Enter a weight and reps that give a 1RM above 0 to save.')).toBeTruthy();
    fireEvent.press(saveCta);
    expect(mockMutate).not.toHaveBeenCalled();
  });

  // ── 2b: blank WEIGHT (w <= 0) also guards the SAVE off even with valid reps ───
  test('a blank weight guards the SAVE off (w <= 0) regardless of a valid estimate', () => {
    renderScreen();
    // Valid reps, but clear the weight → w = parseFloat('') || 0 = 0. Epley with
    // w=0 yields an estimate of 0 too, so BOTH halves of the guard (w > 0 &&
    // estimated1RM > 0) fail — the server's positive() weightKg would 400.
    setInputs('', '5');

    const saveCta = screen.getByLabelText('Save to records');
    expect(saveCta.props.accessibilityState?.disabled).toBe(true);
    fireEvent.press(saveCta);
    expect(mockMutate).not.toHaveBeenCalled();
  });

  // ── 3: a simulated save FAILURE renders the inline role="alert" surface + Retry ─
  test('a save failure renders the inline accessibilityRole="alert" surface (no modal alert) with a working Retry', () => {
    // Pin the mutation into its error state with a verbatim message the surface
    // must echo (mirrors the rejection shape the old onError read).
    mockMutationState = {
      isPending: false,
      isError: true,
      isSuccess: false,
      error: { response: { data: { message: 'Server exploded' } } },
    };

    renderScreen();
    setInputs('100', '5');

    // The inline alert surface is present with accessibilityLiveRegion="polite" and
    // carries the verbatim server message — NOT a modal alert dialog.
    const alerts = screen.UNSAFE_getAllByProps({ accessibilityRole: 'alert' });
    expect(alerts.length).toBeGreaterThan(0);
    const alertNode = alerts[0];
    expect(alertNode.props.accessibilityLiveRegion).toBe('polite');
    expect(within(alertNode).getByText("Couldn't save your record")).toBeTruthy();
    expect(within(alertNode).getByText('Server exploded')).toBeTruthy();

    // The primary SAVE CtaButton is STILL present + pressable in the error state.
    expect(screen.getByLabelText('Save to records')).toBeTruthy();

    // Retry re-invokes the same mutation (proves the inline recovery path is wired,
    // not cosmetic).
    const retry = screen.getByLabelText('Retry saving record');
    expect(retry).toBeTruthy();
    fireEvent.press(retry);
    expect(mockMutate).toHaveBeenCalledTimes(1);
  });

  // ── 4: CONTROL — reps=5 renders the identical rounded numbers ─────────────────
  // The hardening must move no well-formed value. With weight=100 reps=5 (the
  // screen's defaults), Epley = 100·(1 + 5/30) = 116.667 → round 117; the zone rows
  // are round(117 · pct/100). These are the exact numbers Math.round produced before
  // (`safe` rounds a finite positive identically), pinning the behaviour-preserve.
  test('reps=5 (defaults) renders the same rounded estimate and zone numbers as before', () => {
    renderScreen();
    // Leave the defaults (weight=100, reps=5, Epley active) — that is the control.

    // Epley estimate: round(100 * (1 + 5/30)) = round(116.666…) = 117.
    expectNumeral(117);

    // "117kg" appears in BOTH the Epley chip and the 100% zone row (117·100/100),
    // so there are >= 2 such nodes — getAllByText (getByText would throw on the
    // duplicate). The 60% row is round(117·0.6) = round(70.2) = 70 — unique.
    expect(screen.getAllByText('117kg').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('70kg')).toBeTruthy();   // 60% row: round(70.2)

    // Nothing toxic anywhere in the control render.
    expect(screen.queryByText(INFINITY_RE)).toBeNull();
    expect(screen.queryByText(NAN_RE)).toBeNull();
    expectAllKgFiniteNonNegative();

    // No save status surface is shown in the idle state (ternary-null).
    expect(screen.UNSAFE_queryAllByProps({ accessibilityRole: 'alert' }).length).toBe(0);
  });
});
