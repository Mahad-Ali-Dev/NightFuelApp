import React from 'react';
import { render } from '@testing-library/react-native';

// ── jest.mock hoisting block (runs ABOVE the imports) ────────────────────────
// Mirror the icon/glass mocks the other component+screen tests use so the card
// renders without the native @expo/vector-icons / glass surface modules.
jest.mock('@expo/vector-icons', () => {
    const { Text: RNText } = require('react-native');
    return { Ionicons: ({ name }: { name?: string }) => <RNText>{`icon:${name ?? ''}`}</RNText> };
});
jest.mock('@/components/ui', () => {
    const { View } = require('react-native');
    return { GlassCard: ({ children }: { children?: React.ReactNode }) => <View>{children}</View> };
});

import { CyclePhaseCard } from '@/components/CyclePhaseCard';

// The card must (1) stay opt-in (render nothing when the user never enabled
// tracking), (2) NOT claim a plan adjustment for UNKNOWN (no phase => no
// adjustment), and (3) surface the per-phase plan-impact line for a concrete
// phase so the otherwise-silent meal/workout nudge is legible.

describe('CyclePhaseCard', () => {
    it('renders nothing when cyclePhase is undefined (tracking never enabled)', () => {
        const { toJSON } = render(<CyclePhaseCard cyclePhase={undefined} />);
        expect(toJSON()).toBeNull();
    });

    it('UNKNOWN: shows the tracking-on state but NO plan-impact line', () => {
        const { queryByText } = render(<CyclePhaseCard cyclePhase="UNKNOWN" />);
        expect(queryByText('Tracking on')).toBeTruthy();
        // No plan adjustment is applied for UNKNOWN, so we must not claim one.
        expect(queryByText('YOUR PLAN TODAY')).toBeNull();
    });

    it('LUTEAL: surfaces the plan-impact line describing the real adjustment', () => {
        const { getByText } = render(<CyclePhaseCard cyclePhase="LUTEAL" />);
        expect(getByText('Luteal')).toBeTruthy();
        expect(getByText('YOUR PLAN TODAY')).toBeTruthy();
        // Wording must match the actual upstream modifiers: luteal bumps calories
        // and tapers training.
        expect(getByText(/calories nudged up/i)).toBeTruthy();
        expect(getByText(/recovery/i)).toBeTruthy();
        // Always carries the non-medical-advice disclaimer.
        expect(getByText(/not medical advice/i)).toBeTruthy();
    });

    it('MENSTRUAL: plan line reflects iron-rich food + eased training', () => {
        const { getByText } = render(<CyclePhaseCard cyclePhase="MENSTRUAL" />);
        expect(getByText('YOUR PLAN TODAY')).toBeTruthy();
        expect(getByText(/iron-rich foods/i)).toBeTruthy();
    });
});
