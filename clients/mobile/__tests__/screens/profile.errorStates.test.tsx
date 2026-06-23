/**
 * profile.errorStates.test.tsx
 *
 * Screen-level honest-state coverage for the Profile tab —
 * `app/(tabs)/profile.tsx`.
 *
 * The Profile tab drives one PRIMARY query (['my-profile'] via getMyProfile,
 * gates the skeleton) plus THREE secondary queries whose failures used to be
 * masked as a healthy zeroed brand-new user:
 *
 *   - ['my-status']            → FATIGUE / ADHERENCE pills + the CIRCADIAN PHASE card
 *   - ['profile-weekly-stats'] → the "Level N" line
 *   - ['profile-streak']       → the STREAK pill
 *
 * This suite pins the two findings the hardening item fixes:
 *
 *  (F4 — honest-state) When a secondary query is in its ERROR state the render
 *  must NOT coalesce to the misleading '0%' / '0d' / 'Level 1' a healthy zeroed
 *  new user would show. Instead the affected stat pills render '—' + an
 *  "Unavailable" / Retry affordance whose press calls that query's refetch, and
 *  the Level line reads "Level —". Distinct from a GENUINELY zeroed new user
 *  (all queries succeed with zeros) — which still shows '0%' / '0d' / 'Level 1'.
 *
 *  (F7 — contract-drift) When status resolves WITHOUT a circadianPhase (no
 *  service returns that field), the CIRCADIAN PHASE card renders the honest
 *  '—' empty fallback — NOT a fabricated 'WAKE'.
 *
 * Mock conventions mirror the sibling `dashboard.errorStates.test.tsx`
 * (per-queryKey useQuery stub with distinct refetch spies) and
 * `subscription.test.tsx` (real @/components/ui barrel + SafeBlurView
 * passthrough so GlassCard / CtaButton mount on the jest renderer). No live-DB
 * / network: react-query is fully stubbed, so the api modules never touch axios.
 */

// ── jest.mock hoisting block (runs ABOVE the imports) ────────────────────────

// Per-query controlled state. Each test mutates these holders BEFORE render()
// (the factory reads them at call-time). refetch spies are asserted on press.
type QState = { data: any; isLoading: boolean; isError: boolean };
const mockProfile: QState = { data: { displayName: 'Test User', occupation: 'Member' }, isLoading: false, isError: false };
const mockStatus: QState = { data: undefined, isLoading: false, isError: false };
const mockStats: QState = { data: undefined, isLoading: false, isError: false };
const mockStreak: QState = { data: undefined, isLoading: false, isError: false };

const mockRefetchStatus = jest.fn();
const mockRefetchStats = jest.fn();
const mockRefetchStreak = jest.fn();

jest.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    const key = queryKey[0];
    if (key === 'my-profile') {
      return { data: mockProfile.data, isLoading: mockProfile.isLoading, isError: mockProfile.isError, refetch: jest.fn() };
    }
    if (key === 'my-status') {
      return { data: mockStatus.data, isLoading: mockStatus.isLoading, isError: mockStatus.isError, refetch: mockRefetchStatus };
    }
    if (key === 'profile-weekly-stats') {
      return { data: mockStats.data, isLoading: mockStats.isLoading, isError: mockStats.isError, refetch: mockRefetchStats };
    }
    if (key === 'profile-streak') {
      return { data: mockStreak.data, isLoading: mockStreak.isLoading, isError: mockStreak.isError, refetch: mockRefetchStreak };
    }
    return { data: undefined, isLoading: false, isError: false, refetch: jest.fn() };
  },
}));

// The api modules the screen statically imports — stub to plain jest.fns so
// axios (via @/api/client) never loads. useQuery is fully stubbed above, so
// these are never actually invoked; they only satisfy the import graph.
jest.mock('@/api/profile', () => ({ getMyProfile: jest.fn(), getStatus: jest.fn() }));
jest.mock('@/api/progress', () => ({ getWeeklyStats: jest.fn(), getStreak: jest.fn() }));

// Auth hook — benign user; logout is an inert spy.
jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { name: 'Test User', role: 'USER' }, logout: jest.fn() }),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));

// Decorative glyphs → plain <Text> surfacing the icon name (mirrors the suite).
jest.mock('@expo/vector-icons', () => {
  const { Text: RNText } = require('react-native');
  return {
    Ionicons: ({ name }: { name?: string }) => <RNText>{`icon:${name ?? ''}`}</RNText>,
  };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));

jest.mock('expo-image', () => {
  const RN = require('react-native');
  return { Image: (props: any) => <RN.View {...props} /> };
});

// expo-linear-gradient ships a native module — passthrough so the cover wash
// and CtaButton gradient mount on the jest renderer.
jest.mock('expo-linear-gradient', () => {
  const RN = require('react-native');
  return { LinearGradient: (props: any) => <RN.View {...props} /> };
});

// GlassCard wraps a SafeBlurView (expo-blur native). Passthrough so GlassCard /
// the stat pills mount cleanly regardless of the Android<12 blur fallback.
jest.mock('@/components/SafeBlurView', () => {
  const RN = require('react-native');
  return { SafeBlurView: ({ children, ...props }: any) => <RN.View {...props}>{children}</RN.View> };
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
import ProfileScreen from '../../app/(tabs)/profile';

function renderScreen() {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      <ProfileScreen />
    </ThemeContext.Provider>,
  );
}

describe('ProfileScreen — honest secondary-query state (F4 + F7)', () => {
  beforeEach(() => {
    mockProfile.data = { displayName: 'Test User', occupation: 'Member' };
    mockProfile.isLoading = false;
    mockProfile.isError = false;

    mockStatus.data = undefined;
    mockStatus.isLoading = false;
    mockStatus.isError = false;

    mockStats.data = undefined;
    mockStats.isLoading = false;
    mockStats.isError = false;

    mockStreak.data = undefined;
    mockStreak.isLoading = false;
    mockStreak.isError = false;

    mockRefetchStatus.mockClear();
    mockRefetchStats.mockClear();
    mockRefetchStreak.mockClear();
  });

  // ── F4 — errored secondary queries render honest '—' / Retry, NOT zeros ────
  test('all three secondary queries errored → honest indicators, NOT "0%"/"0d"/"Level 1"', () => {
    mockStatus.isError = true;
    mockStats.isError = true;
    mockStreak.isError = true;

    renderScreen();

    // The misleading healthy-zeroed values must NOT appear when the fetch FAILED.
    // (The stat value + '%' unit render as split <Text> nodes; a healthy zero
    // would surface a literal '0' value — assert it's absent from the pills.)
    expect(screen.queryByLabelText('FATIGUE 0%')).toBeNull();
    expect(screen.queryByLabelText('ADHERENCE 0%')).toBeNull();
    expect(screen.queryByText('0d')).toBeNull();
    expect(screen.queryByLabelText('Level 1')).toBeNull();

    // Instead each affected pill surfaces the honest '—' + "Unavailable" + Retry.
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2); // FATIGUE + ADHERENCE + STREAK pills
    expect(screen.getAllByText('Unavailable').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Retry').length).toBeGreaterThanOrEqual(2);

    // The level badge reads honestly as "LVL —" (a11y "Level unavailable"),
    // not "LVL 1".
    expect(screen.getByText('LVL —')).toBeTruthy();
    expect(screen.getByLabelText('Level unavailable')).toBeTruthy();
  });

  test('pressing a stat pill Retry calls that query\'s refetch (and only that one)', () => {
    mockStatus.isError = true; // FATIGUE + ADHERENCE pills (both refetch status)
    mockStreak.isError = true; // STREAK pill (refetch streak)

    renderScreen();

    // The STREAK pill's retry affordance — its a11y label names the stat.
    const streakRetry = screen.getByLabelText('STREAK unavailable, tap to retry');
    fireEvent.press(streakRetry);
    expect(mockRefetchStreak).toHaveBeenCalledTimes(1);
    expect(mockRefetchStats).not.toHaveBeenCalled();
  });

  // ── F4 — a GENUINELY zeroed new user (queries OK) still shows zeros ─────────
  test('genuinely zeroed new user (queries succeed) shows "0%"/"0d"/"Level 1", NOT the error state', () => {
    mockStatus.data = { fatigueScore: 0, adherenceScore: 0, lastUpdated: '' };
    mockStats.data = { daysLogged: 0 };
    mockStreak.data = { current: 0, longest: 0, lastActiveDate: '' };

    renderScreen();

    // Honest zeroed state — distinct from the error state above. The FATIGUE +
    // ADHERENCE pills render value '0' + '%' as split nodes; assert via their
    // combined accessible labels.
    expect(screen.getByLabelText('FATIGUE 0%')).toBeTruthy();
    expect(screen.getByLabelText('ADHERENCE 0%')).toBeTruthy();
    expect(screen.getByText('0d')).toBeTruthy();
    expect(screen.getByText('LVL 1')).toBeTruthy();
    expect(screen.getByLabelText('Level 1')).toBeTruthy();
    // …and the error affordances are absent.
    expect(screen.queryByText('Unavailable')).toBeNull();
    expect(screen.queryByText('Retry')).toBeNull();
  });

  // ── F7 — absent circadianPhase renders the honest '—', NOT a fabricated 'WAKE' ─
  test('status resolves without circadianPhase → CIRCADIAN PHASE card shows "—", not "WAKE"', () => {
    // The shape getStatus() now returns when the backend omits the field
    // (circadianPhase undefined — no `?? 'WAKE'` fabrication).
    mockStatus.data = { fatigueScore: 12, adherenceScore: 80, lastUpdated: '' };

    renderScreen();

    expect(screen.getByText('CIRCADIAN PHASE')).toBeTruthy();
    // The card must NOT show the fabricated 'WAKE' that was hard-stuck for all.
    expect(screen.queryByText('WAKE')).toBeNull();
    // The honest empty fallback renders instead.
    expect(screen.getByText('—')).toBeTruthy();
  });
});

// F29 fix: the cycle-tracker entry (card + "View Cycle Tracker" link) must gate on
// the actual profile fields, NOT status.cyclePhase — the server returns 'UNKNOWN'
// (never null) for any status row, so a cyclePhase-based gate leaked the cycle UI
// to males / opted-out users.
describe('ProfileScreen — cycle tracker entry is FEMALE + opt-in gated', () => {
  test('non-female / non-tracking user (cyclePhase "UNKNOWN") sees NO cycle tracker link', () => {
    mockProfile.data = { displayName: 'T', biologicalSex: 'MALE', cycleTrackingEnabled: false };
    mockStatus.data = { cyclePhase: 'UNKNOWN' }; // server returns UNKNOWN, not null
    mockStats.data = undefined;
    mockStreak.data = undefined;

    renderScreen();

    expect(screen.queryByText(/View Cycle Tracker/i)).toBeNull();
  });

  test('female + tracking-enabled user sees the cycle tracker link', () => {
    mockProfile.data = { displayName: 'T', biologicalSex: 'FEMALE', cycleTrackingEnabled: true };
    mockStatus.data = { cyclePhase: 'FOLLICULAR' };
    mockStats.data = undefined;
    mockStreak.data = undefined;

    renderScreen();

    expect(screen.queryByText(/View Cycle Tracker/i)).toBeTruthy();
  });
});
