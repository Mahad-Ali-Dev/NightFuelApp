import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '@/theme';
import { GlassCard } from '@/components/ui';
import { withAlpha } from '@/theme/utils';
import { Ionicons } from '@expo/vector-icons';
import type { UserStatus } from '@/api/profile';

type CyclePhase = NonNullable<UserStatus['cyclePhase']>;

/**
 * Honest, one-line tip per estimated phase. Deliberately non-prescriptive — the
 * underlying science is weak, so the copy stays as a gentle "you might…" rather
 * than instruction. UNKNOWN is handled separately as a tracking-only state.
 */
const PHASE_COPY: Record<Exclude<CyclePhase, 'UNKNOWN'>, { label: string; tip: string }> = {
    MENSTRUAL: { label: 'Menstrual', tip: 'Energy may dip — be gentle with yourself and rest if you need it.' },
    FOLLICULAR: { label: 'Follicular', tip: 'Energy often rises here — a good window for trying something new.' },
    OVULATORY: { label: 'Ovulatory', tip: 'You may feel your strongest — great for higher-intensity days.' },
    LUTEAL: { label: 'Luteal', tip: 'Wind-down phase — steady routines and good sleep can help.' },
};

export interface CyclePhaseCardProps {
    /** Phase from GET /v1/users/me/status. undefined => tracking never enabled. */
    cyclePhase?: UserStatus['cyclePhase'];
}

/**
 * Phase-display card for the menstrual-cycle tracker (F25).
 *
 * OPT-IN-AWARE: renders NOTHING when `cyclePhase` is undefined — i.e. the user
 * never enabled cycle tracking (the status row carries no phase). It only
 * appears for users who opted in.
 *
 * HONEST STATES:
 *  - 'UNKNOWN' → tracking-only state: we have tracking on but not enough info /
 *    the cycle is irregular / on hormonal contraception. We show NO fake phase,
 *    just a plain "we're tracking, no estimate yet" message.
 *  - a concrete phase → the phase name + a one-line, non-prescriptive tip.
 *
 * Always shows the "not medical advice" wellness-estimate note.
 */
export function CyclePhaseCard({ cyclePhase }: CyclePhaseCardProps) {
    const { colors, typography, borderRadius } = useTheme();

    // Opt-in gate: the field is absent for users who never enabled tracking.
    if (cyclePhase == null) return null;

    const isUnknown = cyclePhase === 'UNKNOWN';
    const copy = isUnknown ? null : PHASE_COPY[cyclePhase];

    return (
        <GlassCard
            glow={withAlpha(colors.accent.coral, 0.18)}
            radius={borderRadius['2xl']}
            style={styles.card}
        >
            <View style={styles.inner}>
                <View style={styles.header}>
                    <Ionicons name="ellipse-outline" size={18} color={colors.accent.coral} />
                    <Text style={[typography.overline, styles.label, { color: colors.text.secondary }]}>
                        CYCLE PHASE
                    </Text>
                </View>

                <Text style={[typography.h3, { color: colors.text.primary, marginTop: 10 }]}>
                    {isUnknown ? 'Tracking on' : copy!.label}
                </Text>

                <Text style={[typography.body, { color: colors.text.secondary, marginTop: 4 }]}>
                    {isUnknown
                        ? "We're tracking your cycle, but there isn't enough information to estimate a phase yet. If your cycle is irregular or you use hormonal contraception, we just track — no phase estimate."
                        : copy!.tip}
                </Text>

                <Text style={[typography.caption, { color: colors.text.tertiary, marginTop: 10 }]}>
                    This is a wellness estimate, not medical advice.
                </Text>
            </View>
        </GlassCard>
    );
}

const styles = StyleSheet.create({
    card: {
        marginTop: 12,
    },
    inner: {
        padding: 18,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    label: {
        marginLeft: 8,
        letterSpacing: 1,
    },
});

export default CyclePhaseCard;
