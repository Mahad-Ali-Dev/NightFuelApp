/**
 * cycle-phase-card.test.tsx
 *
 * Coverage for the menstrual-cycle phase-display card (F25) —
 * src/components/CyclePhaseCard.tsx — rendered on the Profile tab. The card is
 * OPT-IN-aware and reads the derived `cyclePhase` from GET /v1/users/me/status.
 *
 * Pins the three honest states:
 *
 *   1. OPT-IN GATE: when `cyclePhase` is undefined (the user never enabled
 *      tracking, so the status row carries no phase) the card renders NOTHING.
 *
 *   2. CONCRETE PHASE: a real phase (e.g. 'FOLLICULAR') renders the phase label,
 *      a one-line tip, and the "not medical advice" wellness-estimate note.
 *
 *   3. UNKNOWN / tracking-only: 'UNKNOWN' renders an honest tracking-only state
 *      (no fabricated phase name) plus the disclaimer.
 *
 * Mock conventions mirror the onboarding screen suites: @/components/ui and
 * @/theme are left REAL so the assertions ride on the actual GlassCard; only the
 * native-only leaves (blur / icons) are stubbed to passthroughs.
 *
 * Additive: NEW test file only.
 */

// Decorative glyphs → plain <Text> surfacing the icon name.
jest.mock('@expo/vector-icons', () => {
  const { Text: RNText } = require('react-native');
  return {
    Ionicons: ({ name }: { name?: string }) => <RNText>{`icon:${name ?? ''}`}</RNText>,
  };
});

// GlassCard wraps the card in a SafeBlurView fill. Replace SafeBlurView with a
// passthrough View so the REAL GlassCard mounts deterministically.
jest.mock('@/components/SafeBlurView', () => {
  const RN = require('react-native');
  return { SafeBlurView: ({ children, ...props }: any) => <RN.View {...props}>{children}</RN.View> };
});

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
import { CyclePhaseCard } from '../../src/components/CyclePhaseCard';

function renderWithTheme(node: React.ReactElement) {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      {node}
    </ThemeContext.Provider>,
  );
}

describe('CyclePhaseCard (F25) — opt-in-aware phase display', () => {
  test('renders NOTHING when cyclePhase is undefined (user never enabled tracking)', () => {
    const { toJSON } = renderWithTheme(<CyclePhaseCard cyclePhase={undefined} />);
    expect(toJSON()).toBeNull();
  });

  test('renders the concrete phase, a tip, and the not-medical-advice note', () => {
    renderWithTheme(<CyclePhaseCard cyclePhase="FOLLICULAR" />);

    // Phase label is shown.
    expect(screen.getByText('Follicular')).toBeTruthy();
    // The "CYCLE PHASE" header is present.
    expect(screen.getByText('CYCLE PHASE')).toBeTruthy();
    // A one-line tip is rendered (non-empty body copy beyond the label/header).
    expect(screen.getByText(/energy often rises/i)).toBeTruthy();
    // The wellness-estimate disclaimer is always present.
    expect(screen.getByText(/not medical advice/i)).toBeTruthy();
  });

  test("UNKNOWN renders an honest tracking-only state with NO fabricated phase", () => {
    renderWithTheme(<CyclePhaseCard cyclePhase="UNKNOWN" />);

    // Tracking-only headline, not a fake phase name.
    expect(screen.getByText('Tracking on')).toBeTruthy();
    expect(screen.getByText(/enough information to estimate a phase/i)).toBeTruthy();
    // The disclaimer still shows.
    expect(screen.getByText(/not medical advice/i)).toBeTruthy();
    // It must NOT claim any concrete phase.
    expect(screen.queryByText('Menstrual')).toBeNull();
    expect(screen.queryByText('Follicular')).toBeNull();
    expect(screen.queryByText('Ovulatory')).toBeNull();
    expect(screen.queryByText('Luteal')).toBeNull();
  });
});
