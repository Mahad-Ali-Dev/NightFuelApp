import React, { useCallback } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme';
import { useCycleAccents } from '@/theme/useCycleAccents';
import { GlassCard } from '@/components/ui';
import { withAlpha } from '@/theme/utils';
import type { UserStatus } from '@/api/profile';

/**
 * PhaseCoachCard — the dedicated "Ria, tuned to your phase" section: makes the
 * app's EXISTING phase-aware coaching visible and actionable. The decision-
 * engine already eases training volume ~10% in MENSTRUAL/LUTEAL and nudges
 * calories ~5% in LUTEAL, and the AI prompt carries the same per-phase
 * guidance — but none of that was surfaced anywhere. This card states what Ria
 * adapts for TODAY's phase and hands the user a one-tap "Plan today with Ria"
 * CTA that opens the Ria chat modal with a phase-plan request PRE-FILLED (not
 * auto-sent — the user reviews and sends, which also respects the AI quota).
 *
 * GATED LIKE the other cycle cards: renders NOTHING for null/undefined
 * (tracking never enabled) or 'UNKNOWN' (no concrete estimate). Female-only by
 * construction — the whole cycle screen sits behind the profile gate.
 *
 * Wellness guidance, not medical advice — mirrors the conservative tone of
 * PhaseRecommendationCards (same disclaimer pattern lives on the screen).
 */

type Phase = NonNullable<UserStatus['cyclePhase']>;
type ConcretePhase = Exclude<Phase, 'UNKNOWN'>;

interface PhaseCoach {
    /** Human phase label used in copy + the prefilled prompt. */
    label: string;
    /** One-liner: what Ria adapts in this phase. */
    pitch: string;
    /** The pre-filled Ria request ("complete plan" = meals + workout). */
    prompt: string;
}

const PHASE_COACH: Record<ConcretePhase, PhaseCoach> = {
    MENSTRUAL: {
        label: 'menstrual',
        pitch: 'Ria eases training volume and plans warm, iron-forward meals around your shift.',
        prompt:
            "I'm in my menstrual phase today. Plan my full day: gentler workout (lower volume), plus meals with iron-rich, warm options and macros — timed to my shift.",
    },
    FOLLICULAR: {
        label: 'follicular',
        pitch: 'Energy is climbing — Ria programs strength progressions and fuels them properly.',
        prompt:
            "I'm in my follicular phase today. Plan my full day: a strength-focused workout that pushes progression, plus high-protein meals with macros — timed to my shift.",
    },
    OVULATORY: {
        label: 'ovulatory',
        pitch: 'Output tends to peak — Ria plans higher-intensity work and fuels the effort.',
        prompt:
            "I'm in my ovulatory phase today. Plan my full day: a higher-intensity workout while strength peaks, plus balanced high-output meals with macros — timed to my shift.",
    },
    LUTEAL: {
        label: 'luteal',
        pitch: 'Ria tapers volume ~10%, adds a small calorie bump, and steadies cravings.',
        prompt:
            "I'm in my luteal phase today. Plan my full day: a steadier tapered workout, plus meals with complex carbs and a small calorie bump to smooth cravings, with macros — timed to my shift.",
    },
};

export interface PhaseCoachCardProps {
    /** Derived cycle phase from GET /v1/users/me/status. Gated to concrete phases. */
    phase?: UserStatus['cyclePhase'];
}

export function PhaseCoachCard({ phase }: PhaseCoachCardProps) {
    const { colors, typography, borderRadius } = useTheme();
    const { coral: CORAL } = useCycleAccents();
    const router = useRouter();

    // Hooks run unconditionally (rules of hooks) — the render gate sits below.
    const coach =
        phase != null && phase !== 'UNKNOWN' ? PHASE_COACH[phase as ConcretePhase] : null;
    const openRia = useCallback(() => {
        if (!coach) return;
        router.push({
            pathname: '/(modals)/ai-coach',
            params: { prompt: coach.prompt },
        } as never);
    }, [router, coach]);

    // GATE: identical to the sibling cycle cards.
    if (!coach) return null;

    return (
        <View style={styles.wrap} testID="phase-coach-card">
            <Text style={[typography.h3, styles.heading, { color: colors.text.primary }]}>
                Ria, tuned to your phase
            </Text>

            <GlassCard radius={borderRadius.xl}>
                <View style={styles.inner}>
                    <View style={styles.row}>
                        <View
                            style={[
                                styles.iconDisc,
                                {
                                    backgroundColor: withAlpha(CORAL, 0.14),
                                    borderColor: withAlpha(CORAL, 0.28),
                                },
                            ]}
                        >
                            <Ionicons name="sparkles-outline" size={22} color={CORAL} />
                        </View>
                        <View style={styles.text}>
                            <Text
                                style={[
                                    typography.bodyMedium,
                                    { color: colors.text.primary, fontWeight: '600' },
                                ]}
                            >
                                Today: {coach.label} phase
                            </Text>
                            <Text
                                style={[typography.bodySm, { color: colors.text.secondary, marginTop: 3 }]}
                            >
                                {coach.pitch}
                            </Text>
                        </View>
                    </View>

                    <Pressable
                        onPress={openRia}
                        accessibilityRole="button"
                        accessibilityLabel={`Ask Ria to plan meals and a workout for your ${coach.label} phase`}
                        style={({ pressed }) => [
                            styles.cta,
                            {
                                backgroundColor: colors.accent.coral,
                                opacity: pressed ? 0.85 : 1,
                            },
                        ]}
                    >
                        <Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.text.inverse} />
                        <Text
                            style={[
                                typography.bodyMedium,
                                { color: colors.text.inverse, fontWeight: '700' },
                            ]}
                        >
                            Plan today with Ria
                        </Text>
                    </Pressable>
                </View>
            </GlassCard>
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: { marginTop: 18 },
    heading: { marginBottom: 12 },
    inner: { padding: 14 },
    row: { flexDirection: 'row', alignItems: 'flex-start', gap: 13 },
    iconDisc: {
        width: 42,
        height: 42,
        borderRadius: 12,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
    },
    text: { flex: 1 },
    cta: {
        marginTop: 14,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        borderRadius: 14,
        paddingVertical: 12,
    },
});

export default PhaseCoachCard;
