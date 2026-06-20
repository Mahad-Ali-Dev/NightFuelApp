/**
 * analytics.test.tsx
 *
 * Render coverage for the Aurora-restyled Insights tab (`app/(tabs)/analytics.tsx`).
 * The screen had ZERO render tests, so the GlassCard-coverage conversion (the four
 * card-shaped inline Views — the Sleep-vs-Performance chart card, the two stat
 * cards, and the Correlation card — became <GlassCard> wrappers) could regress its
 * content without a single suite turning red. This file pins the load-bearing
 * render behaviours so future restyle rounds can't silently break them:
 *
 *   - Test A (loaded): with the score query resolved and the progress/sleep
 *     analytics populated, the screen renders the key section/stat content that
 *     now lives INSIDE the converted GlassCards — 'Sleep vs. Performance' (chart
 *     card), 'PEAK FATIGUE' (stat card), and 'Correlation Score' (correlation
 *     card). Because we mock ONLY '@/components/SafeBlurView' (passthrough) and
 *     keep the REAL GlassCard from '@/components/ui', this also proves the real
 *     GlassCard primitive mounts and renders its children — i.e. the coverage
 *     conversion didn't drop any content. The score-loading Skeleton is NOT in
 *     the tree in this state.
 *   - Test B (score loading): while the ['my-score-analytics'] query isLoading,
 *     the XP/Level block is the Skeleton (asserted via the testID-bearing stub),
 *     and the XP card copy ('FITNESS LEVEL') is absent — but the rest of the
 *     screen (the chart card heading) still renders.
 *
 * Mock conventions mirror the sibling `(tabs)` screen suites
 * (nutrition.errorStates / circadian): the hoisted `mockPush` holder, the
 * `@tanstack/react-query` useQuery stub branching on queryKey[0], the
 * `@/components/ui` partial mock (everything REAL except a testID-bearing
 * Skeleton), and the decorative gradient/icon/insets/status-bar stubs.
 *
 *   - '@/hooks/useProgress' / '@/hooks/useSleep' are mocked directly (mutable
 *     holders) so the screen's chart + stat values come from fixtures and the
 *     hooks' internal react-query never runs.
 *   - '@/components/dashboard/useEntrainmentScore' is a plain stub returning a
 *     default-safe { score, shift } — the genuine entrainment hook is not under
 *     test here.
 *   - '@/components/dashboard/EntrainmentCard' is stubbed to a tiny passthrough
 *     so its own '@/lib/circadian/entrainment' + GlassCard subtree stays out of
 *     this render (the card has its own dedicated coverage in circadian.test.tsx).
 *   - '@/components/SafeBlurView' is a passthrough View so the REAL GlassCard
 *     (kept real via the '@/components/ui' partial mock) mounts its frosted fill
 *     without pulling expo-blur's native module.
 *   - '@/api/community' getUserScore is a jest.fn — useQuery is stubbed, so it is
 *     never invoked; it only needs to be importable.
 */

// ── jest.mock hoisting block (runs ABOVE the imports) ────────────────────────

// expo-router: hoisted `mock`-prefixed push holder so navigation can be asserted
// (the conversion is restyle-only — nav targets must be untouched — and these
// tests give the route pushes a home even though they don't press the cards).
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
}));

// Controlled state for the ['my-score-analytics'] score query. Each test mutates
// this BEFORE render() to pick the loaded vs loading branch. Read at call-time
// inside the useQuery stub so the chosen branch is honoured.
type ScoreState = { data: any; isLoading: boolean; isError: boolean };
const mockScore: ScoreState = { data: undefined, isLoading: false, isError: false };

// react-query: the ONLY direct useQuery consumer left in the screen is the
// score query (useProgress/useSleep/useEntrainmentScore are mocked directly
// below, so their internal queries never run). Branch on queryKey[0] and expose
// a refetch so the error-retry path stays importable. isError defaults false.
jest.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    if (queryKey[0] === 'my-score-analytics') {
      return {
        data: mockScore.data,
        isLoading: mockScore.isLoading,
        isError: mockScore.isError,
        refetch: jest.fn(),
      };
    }
    return { data: undefined, isLoading: false, isError: false, refetch: jest.fn() };
  },
}));

// Aggregated data hooks → mutable holders. The screen reads `weekly` (for the
// 7-day chart) and `analytics` (peak fatigue / deep sleep / correlation). Both
// default-safe so a missing field renders the placeholders.
const mockProgress: { weekly: any } = { weekly: undefined };
const mockSleep: { analytics: any } = { analytics: undefined };
jest.mock('@/hooks/useProgress', () => ({ useProgress: () => mockProgress }));
jest.mock('@/hooks/useSleep', () => ({ useSleep: () => mockSleep }));

// The genuine entrainment hook is not under test — a default-safe stub feeds the
// (stubbed) EntrainmentCard its two props.
jest.mock('@/components/dashboard/useEntrainmentScore', () => ({
  useEntrainmentScore: () => ({ score: null, shift: undefined }),
}));

// EntrainmentCard → tiny passthrough so its '@/lib/circadian/entrainment' +
// GlassCard subtree stays out of this render (covered by circadian.test.tsx).
jest.mock('@/components/dashboard/EntrainmentCard', () => {
  const { Text: RNText } = require('react-native');
  return { EntrainmentCard: () => <RNText>entrainment-card</RNText> };
});

// SafeBlurView → passthrough View so the REAL GlassCard (kept real below) mounts
// its frosted fill + children without expo-blur's native module.
jest.mock('@/components/SafeBlurView', () => {
  const RN = require('react-native');
  return { SafeBlurView: ({ children, ...rest }: any) => <RN.View {...rest}>{children}</RN.View> };
});

// ui barrel: keep everything REAL (so the real GlassCard / EmptyState mount)
// EXCEPT Skeleton, overridden to a testID-bearing View so the score-loading
// state is assertable (the real Skeleton renders no text + no testID).
jest.mock('@/components/ui', () => {
  const actual = jest.requireActual('@/components/ui');
  const RN = require('react-native');
  return {
    ...actual,
    Skeleton: (props: any) => <RN.View testID="skeleton" {...props} />,
  };
});

// api module the screen statically imports. useQuery is stubbed, so getUserScore
// is never invoked — it only needs to be importable (avoids the axios client).
jest.mock('@/api/community', () => ({ getUserScore: jest.fn() }));

// _layout stub: analytics.tsx only needs the TAB_BAR_H constant from it. Mocking
// it keeps the real tab navigator (expo-router <Tabs>, auth store) out of render.
jest.mock('../../app/(tabs)/_layout', () => ({ TAB_BAR_H: 64 }));

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

// expo-linear-gradient ships a native module; replace <LinearGradient> with a
// passthrough View so the screen's decorative gradients mount.
jest.mock('expo-linear-gradient', () => {
  const RN = require('react-native');
  return { LinearGradient: (props: any) => <RN.View {...props} /> };
});

// expo-status-bar renders nothing in the tree under test.
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

// ── Imports (run AFTER the hoisted mocks above) ──────────────────────────────
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import {
  ThemeContext,
  getThemeColors,
  typography,
  spacing,
  borderRadius,
  shadows,
} from '@/theme';
import AnalyticsScreen from '../../app/(tabs)/analytics';

function renderScreen() {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      <AnalyticsScreen />
    </ThemeContext.Provider>,
  );
}

// A populated weekly breakdown (7 days) so `hasData` is true and the chart's
// real bars render rather than the "No data yet" EmptyState.
const WEEKLY = {
  dailyBreakdown: Array.from({ length: 7 }, (_, i) => ({
    sleepQuality: 60 + i,
    alertnessScore: 50 + i,
  })),
};

// Populated sleep analytics so the stat cards show real values (and the deep-
// sleep delta ternary takes its truthy branch).
const ANALYTICS = {
  peakFatigueTime: '14:30',
  deepSleepDuration: '1h 45m',
  deepSleepDelta: 12,
  performanceCorrelation: 82,
};

const SCORE = { userId: 'me', xp: 1250, level: 5, xpForNextLevel: 1500 };

describe('AnalyticsScreen (Insights tab)', () => {
  beforeEach(() => {
    mockScore.data = undefined;
    mockScore.isLoading = false;
    mockScore.isError = false;
    mockProgress.weekly = undefined;
    mockSleep.analytics = undefined;
    mockPush.mockClear();
  });

  // ── Test A: loaded → the GlassCard-wrapped section/stat content renders ─────
  test('loaded: renders the chart, stat, and correlation content inside the real GlassCards', () => {
    mockScore.data = SCORE;
    mockScore.isLoading = false;
    mockProgress.weekly = WEEKLY;
    mockSleep.analytics = ANALYTICS;

    expect(() => renderScreen()).not.toThrow();

    // Content that now lives INSIDE the three converted GlassCards. Their
    // presence proves the real GlassCard (mounted via the SafeBlurView
    // passthrough) renders its children — the conversion dropped no content.
    expect(screen.getByText('Sleep vs. Performance')).toBeTruthy(); // chart card
    expect(screen.getByText('PEAK FATIGUE')).toBeTruthy();          // stat card
    expect(screen.getByText('Correlation Score')).toBeTruthy();     // correlation card

    // The populated stat/correlation values render too.
    expect(screen.getByText('14:30')).toBeTruthy();
    expect(screen.getByText('82%')).toBeTruthy();
    // The deep-sleep delta ternary (was `&&`, now `? … : null`) renders its
    // truthy branch for a non-null delta.
    expect(screen.getByText('+12m vs avg')).toBeTruthy();

    // Loaded state ⇒ the score-loading Skeleton is NOT mounted.
    expect(screen.queryByTestId('skeleton')).toBeNull();
    // Nothing was pressed → no navigation fired on mount.
    expect(mockPush).not.toHaveBeenCalled();
  });

  // ── Test B: score loading → Skeleton stands in for the XP card ──────────────
  test('score loading: renders the Skeleton in place of the XP card, with the rest of the screen intact', () => {
    mockScore.data = undefined;
    mockScore.isLoading = true;
    mockProgress.weekly = WEEKLY;
    mockSleep.analytics = ANALYTICS;

    renderScreen();

    // The XP/Level block is the loading Skeleton…
    expect(screen.getByTestId('skeleton')).toBeTruthy();
    // …so the XP card copy is absent, and the error path is not taken.
    expect(screen.queryByText('FITNESS LEVEL')).toBeNull();
    expect(screen.queryByText("Couldn't load your level")).toBeNull();

    // The rest of the screen (the chart card heading) still renders while the
    // score loads — the Skeleton only replaces the XP/Level block.
    expect(screen.getByText('Sleep vs. Performance')).toBeTruthy();
  });
});
