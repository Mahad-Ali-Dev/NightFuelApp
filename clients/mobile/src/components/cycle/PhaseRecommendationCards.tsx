import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme';
import { GlassCard } from '@/components/ui';
import { withAlpha } from '@/theme/utils';
import type { UserStatus } from '@/api/profile';

/**
 * PhaseRecommendationCards — the "Tuned to your phase today" section: two compact
 * recommendation cards (a TRAINING card + a NUTRITION card), each an icon + a
 * bold title + a one-line piece of advice, tuned to the user's estimated phase.
 *
 * PRESENTATIONAL + DERIVED: the per-phase copy below mirrors the deterministic
 * plan modifiers the rest of the app already applies for each phase (the
 * decision-engine eases training volume ~10% in MENSTRUAL/LUTEAL and nudges
 * calories ~5% in LUTEAL; the AI prompt carries the same per-phase nutrition /
 * workout-type guidance). It is wellness guidance, not medical/dietary advice,
 * and stays gentle + non-prescriptive to match that conservative tuning. No new
 * network call, hook, mutation or navigation.
 *
 * GATED LIKE the other cycle cards: renders NOTHING for null/undefined (tracking
 * never enabled) or 'UNKNOWN' (tracking on, no estimate) — only a concrete phase
 * gets advice, so we never tune to a phase we don't actually estimate.
 *
 * The two accent hues mirror the screen: the TRAINING card leads with the brand
 * lime, the NUTRITION card with the coral period accent.
 */

type Phase = NonNullable<UserStatus['cyclePhase']>;
type ConcretePhase = Exclude<Phase, 'UNKNOWN'>;

// Coral period/cycle accent (the brand `accent.coral` token resolves to LIME
// post-rebrand, so coral is an explicit literal here).
const CORAL = '#FF7A90';
const LIME = '#A8CC3C';

interface PhaseRec {
    training: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string };
    nutrition: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string };
}

/** Per-phase training + nutrition advice (one bold title + one line each). */
const PHASE_RECS: Record<ConcretePhase, PhaseRec> = {
    MENSTRUAL: {
        training: {
            icon: 'walk-outline',
            title: 'Move gently',
            body: 'Energy may dip. Favor lighter, lower-impact sessions and rest when you need it.',
        },
        nutrition: {
            icon: 'nutrition-outline',
            title: 'Replenish iron',
            body: 'Lean on iron-rich foods and steady warm meals to support recovery.',
        },
    },
    FOLLICULAR: {
        training: {
            icon: 'barbell-outline',
            title: 'Push your strength',
            body: 'Estrogen is rising — energy and recovery climb. A great window for heavy lifts and PRs.',
        },
        nutrition: {
            icon: 'restaurant-outline',
            title: 'Eat for energy',
            body: 'Lean protein and complex carbs to fuel training. Keep iron up after your period.',
        },
    },
    OVULATORY: {
        training: {
            icon: 'flame-outline',
            title: 'Go for intensity',
            body: 'Strength tends to peak now — a good day for higher-intensity efforts.',
        },
        nutrition: {
            icon: 'leaf-outline',
            title: 'Fuel the peak',
            body: 'Balanced meals with plenty of vegetables and protein to match the high output.',
        },
    },
    LUTEAL: {
        training: {
            icon: 'pulse-outline',
            title: 'Ease toward recovery',
            body: 'A natural wind-down. Taper volume, keep things steady, and prioritize good sleep.',
        },
        nutrition: {
            icon: 'cafe-outline',
            title: 'Steady your cravings',
            body: 'Complex carbs and a small calorie bump can smooth energy and curb cravings.',
        },
    },
};

export interface PhaseRecommendationCardsProps {
    /** Derived cycle phase from GET /v1/users/me/status. Gated to concrete phases. */
    phase?: UserStatus['cyclePhase'];
}

export function PhaseRecommendationCards({ phase }: PhaseRecommendationCardsProps) {
    const { colors, typography, borderRadius } = useTheme();

    // GATE: only concrete phases get advice (null/undefined/'UNKNOWN' → nothing).
    if (phase == null || phase === 'UNKNOWN') return null;
    const recs = PHASE_RECS[phase as ConcretePhase];

    return (
        <View style={styles.wrap} testID="phase-recommendation-cards">
            <Text style={[typography.h3, styles.heading, { color: colors.text.primary }]}>
                Tuned to your phase today
            </Text>

            <RecCard
                accent={LIME}
                icon={recs.training.icon}
                title={recs.training.title}
                body={recs.training.body}
                radius={borderRadius.xl}
            />
            <RecCard
                accent={CORAL}
                icon={recs.nutrition.icon}
                title={recs.nutrition.title}
                body={recs.nutrition.body}
                radius={borderRadius.xl}
                style={{ marginTop: 11 }}
            />

            <Text style={[typography.caption, { color: colors.text.tertiary, marginTop: 10 }]}>
                General wellness guidance, not medical or dietary advice.
            </Text>
        </View>
    );
}

/** A single recommendation card: tinted icon disc + bold title + advice line. */
function RecCard({
    accent,
    icon,
    title,
    body,
    radius,
    style,
}: {
    accent: string;
    icon: keyof typeof Ionicons.glyphMap;
    title: string;
    body: string;
    radius: number;
    style?: object;
}) {
    const { colors, typography } = useTheme();
    return (
        <GlassCard radius={radius} style={[styles.card, style]}>
            <View
                style={styles.cardInner}
                accessible
                accessibilityLabel={`${title}. ${body}`}
            >
                <View
                    style={[
                        styles.iconDisc,
                        { backgroundColor: withAlpha(accent, 0.14), borderColor: withAlpha(accent, 0.28) },
                    ]}
                >
                    <Ionicons name={icon} size={22} color={accent} />
                </View>
                <View style={styles.cardText}>
                    <Text style={[typography.bodyMedium, { color: colors.text.primary, fontWeight: '600' }]}>
                        {title}
                    </Text>
                    <Text style={[typography.bodySm, { color: colors.text.secondary, marginTop: 3 }]}>
                        {body}
                    </Text>
                </View>
            </View>
        </GlassCard>
    );
}

const styles = StyleSheet.create({
    wrap: { marginTop: 18 },
    heading: { marginBottom: 12 },
    card: {},
    cardInner: { flexDirection: 'row', alignItems: 'flex-start', padding: 14, gap: 13 },
    iconDisc: {
        width: 42,
        height: 42,
        borderRadius: 12,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
    },
    cardText: { flex: 1 },
});

export default PhaseRecommendationCards;
