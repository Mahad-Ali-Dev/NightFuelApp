import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/theme';
import { CtaButton } from '@/components/ui';
import { withAlpha } from '@/theme/utils';
import { OptimizationRing } from '@/components/OptimizationRing';
import { OnboardingStepHeader } from '@/components/OnboardingStepHeader';
import { useOnboardingStore } from '@/store/onboardingStore';
import { getOnboardingStep } from '@/utils/onboardingSteps';
import { Ionicons } from '@expo/vector-icons';

type AiLevel = 'low' | 'medium' | 'high';

// Brand is LOCKED to a single accent (softened lime). The selection chrome is
// always lime; intensity is conveyed by the ring fill % + the icon, NOT by a
// second/third hue. `intensity` keys a within-the-lime-family shade (dark →
// base) so the cards still read as a deliberate ramp without breaking the
// one-accent system.
type AiIntensity = 'primary' | 'strong' | 'soft';

interface AiLevelDef {
    value: AiLevel;
    label: string;
    desc: string;
    icon: keyof typeof Ionicons.glyphMap;
    intensity: AiIntensity;
    ring: number; // 0–1 fill the hero arc animates to
    percent: string; // numeral shown in the ring center
}

// On-brand intensity ramp. `intensity` keys the selected card's icon tint to a
// shade WITHIN the lime family (selection border/glow/check stay the brand lime
// for every level); the real intensity cue is the ring fill % + the icon.
// Keyed by level so the active entry resolves with no `undefined` under
// noUncheckedIndexedAccess.
const AI_LEVEL_MAP: Record<AiLevel, AiLevelDef> = {
    high: {
        value: 'high',
        label: 'Maximum Optimization',
        desc: 'Strict meal timing, precise caffeine cutoffs, dynamic lighting alerts',
        icon: 'flash',
        intensity: 'primary',
        ring: 1,
        percent: '100',
    },
    medium: {
        value: 'medium',
        label: 'Balanced Approach',
        desc: 'Core circadian principles with flexibility for social life and cravings',
        icon: 'leaf',
        intensity: 'strong',
        ring: 0.7,
        percent: '70',
    },
    low: {
        value: 'low',
        label: 'Gentle Guidance',
        desc: 'Just tracking and basic recommendations without strict rules',
        icon: 'water',
        intensity: 'soft',
        ring: 0.4,
        percent: '40',
    },
};

// Render order: most → least intensive.
const AI_LEVELS: AiLevelDef[] = [AI_LEVEL_MAP.high, AI_LEVEL_MAP.medium, AI_LEVEL_MAP.low];

export default function AIOptimizationScreen() {
    const { colors, typography, spacing } = useTheme();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { data, updateData } = useOnboardingStore();

    const [aiLevel, setAiLevel] = useState<AiLevel>(data.aiOptimizationLevel || 'medium');

    // This route is NOT registered in the onboarding _layout's <Stack>, so it
    // does NOT inherit the shared header (back + STEP X OF N + bar). To stay
    // consistent with every sibling onboarding screen we render the same header
    // in-screen (OnboardingStepHeader), deriving the step from the SAME shared
    // util the layout uses (getOnboardingStep) so the counter, percentage and
    // bar can't drift. AI setup is the final collection beat before the summary,
    // so it reports against the last visible collection route ('dietary-needs').
    const { current: stepNumber, total: totalSteps, fraction } = getOnboardingStep(
        'dietary-needs',
        data.biologicalSex,
    );

    const handleNext = () => {
        updateData({ aiOptimizationLevel: aiLevel });
        router.push('/(onboarding)/profile-summary');
    };

    // Selecting a level reinforces the "watch your plan recalibrate" promise
    // with a light selection haptic (non-blocking; ignored on web / unsupported).
    const handleSelect = (level: AiLevel) => {
        if (level !== aiLevel) {
            Haptics.selectionAsync().catch(() => {});
        }
        setAiLevel(level);
    };

    const active = AI_LEVEL_MAP[aiLevel];
    // Selection chrome is ALWAYS the brand lime (one-accent system). Intensity
    // is read from the ring fill % + the icon, not from the hue.
    const activeColor = colors.accent.coral;
    // Within-the-lime-family icon tint per intensity — keeps the cards reading
    // as a ramp while every selection affordance stays brand lime.
    const intensityTint: Record<AiIntensity, string> = {
        primary: colors.accent.coral,
        strong: colors.accent.coral,
        soft: colors.accent.coralDark,
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
            <StatusBar style="light" />

            {/* Self-contained step header (this orphaned route doesn't inherit the
                shared layout header): back control + the authoritative
                "STEP X OF N" counter, live %, and the brand ProgressBar. Respects
                the top safe-area inset, so the hero never sits under the status bar. */}
            <OnboardingStepHeader
                title="AI Setup"
                step={stepNumber}
                total={totalSteps}
                fraction={fraction}
                onBack={() => router.back()}
            />

            <ScrollView
                contentContainerStyle={{ paddingTop: spacing.xl, paddingBottom: spacing['2xl'] }}
                showsVerticalScrollIndicator={false}
            >
                {/* Hero — the "we're tuning your plan" value moment. Spring entrance
                    for the brand's premium feel. */}
                <Animated.View
                    entering={FadeInDown.duration(420).springify().damping(16)}
                    style={{ paddingHorizontal: spacing.xl, marginBottom: spacing.lg }}
                >
                    <Text
                        accessibilityRole="header"
                        style={[typography.overline, { color: activeColor, marginBottom: spacing.sm }]}
                    >
                        POWERED BY COACH RIA
                    </Text>
                    <Text
                        accessibilityRole="header"
                        style={[typography.display, { color: colors.text.primary, marginBottom: spacing.sm }]}
                    >
                        Tune your <Text style={{ color: activeColor }}>AI plan</Text>
                    </Text>
                    <Text style={[typography.body, { color: colors.text.secondary }]}>
                        How deeply should Coach Ria optimize your schedule? Adjust the intensity and watch your
                        plan recalibrate.
                    </Text>
                </Animated.View>

                {/* Animated optimization ring — fills to the selected intensity. */}
                <Animated.View
                    entering={FadeInDown.delay(100).duration(460).springify().damping(16)}
                    style={{ marginTop: spacing.sm, marginBottom: spacing.xl }}
                    accessibilityRole="image"
                    accessibilityLabel={`Optimization intensity ${active.percent} percent: ${active.label}`}
                >
                    <OptimizationRing
                        progress={active.ring}
                        color={activeColor}
                        value={active.percent}
                        unit="Optimized"
                        caption="Plan intensity"
                    />
                    <Text
                        style={[
                            typography.captionMedium,
                            { color: colors.text.tertiary, textAlign: 'center', marginTop: spacing.md },
                        ]}
                    >
                        {active.label}
                    </Text>
                </Animated.View>

                {/* Intensity selection cards — premium shift-type style, lime-selected. */}
                <View style={{ paddingHorizontal: spacing.xl, marginBottom: spacing.md }}>
                    <Text
                        accessibilityRole="header"
                        style={[typography.overline, { color: colors.text.tertiary }]}
                    >
                        CHOOSE YOUR INTENSITY
                    </Text>
                </View>

                <View style={{ paddingHorizontal: spacing.xl, gap: spacing.md }}>
                    {AI_LEVELS.map((level, index) => {
                        const isSelected = aiLevel === level.value;
                        // Selection chrome (border / glow / check) is ALWAYS brand
                        // lime; only the icon tint steps within the lime family.
                        const iconColor = intensityTint[level.intensity];
                        return (
                            <Animated.View
                                key={level.value}
                                entering={FadeInDown.delay(160 + index * 50).duration(420).springify().damping(16)}
                            >
                                <Pressable
                                    onPress={() => handleSelect(level.value)}
                                    accessibilityRole="button"
                                    accessibilityState={{ selected: isSelected }}
                                    accessibilityLabel={level.label}
                                    accessibilityHint={level.desc}
                                    style={({ pressed }) => [
                                        styles.levelCard,
                                        {
                                            backgroundColor: isSelected
                                                ? withAlpha(activeColor, 0.1)
                                                : colors.background.secondary,
                                            borderColor: isSelected
                                                ? activeColor
                                                : withAlpha(colors.text.primary, 0.08),
                                            borderWidth: isSelected ? 1.5 : 1,
                                        },
                                        isSelected ? shadowGlow(activeColor) : null,
                                        pressed ? styles.pressed : null,
                                    ]}
                                >
                                    <View
                                        style={[
                                            styles.iconBox,
                                            {
                                                backgroundColor: withAlpha(iconColor, isSelected ? 0.18 : 0.1),
                                                borderColor: withAlpha(iconColor, isSelected ? 0.5 : 0.2),
                                            },
                                        ]}
                                    >
                                        <Ionicons name={level.icon} size={22} color={iconColor} />
                                    </View>

                                    <View style={styles.levelText}>
                                        <Text
                                            style={[
                                                typography.subhead,
                                                { color: colors.text.primary, marginBottom: 3 },
                                            ]}
                                            numberOfLines={1}
                                        >
                                            {level.label}
                                        </Text>
                                        <Text
                                            style={[typography.caption, { color: colors.text.secondary }]}
                                            numberOfLines={2}
                                        >
                                            {level.desc}
                                        </Text>
                                    </View>

                                    {/* Selected affordance — ink-on-lime check, else a hollow ring. */}
                                    {isSelected ? (
                                        <View style={[styles.check, { backgroundColor: activeColor }]}>
                                            <Ionicons
                                                name="checkmark"
                                                size={16}
                                                color={colors.text.inverse}
                                            />
                                        </View>
                                    ) : (
                                        <View
                                            style={[
                                                styles.checkEmpty,
                                                { borderColor: withAlpha(colors.text.primary, 0.2) },
                                            ]}
                                        />
                                    )}
                                </Pressable>
                            </Animated.View>
                        );
                    })}
                </View>
            </ScrollView>

            <View
                style={[
                    styles.footer,
                    {
                        paddingTop: spacing.lg,
                        paddingHorizontal: spacing.xl,
                        paddingBottom: Math.max(insets.bottom, spacing.lg) + spacing.sm,
                        borderTopColor: withAlpha(colors.text.primary, 0.06),
                        backgroundColor: colors.background.primary,
                    },
                ]}
            >
                <CtaButton
                    label="Build My Profile"
                    icon="sparkles"
                    size="lg"
                    onPress={handleNext}
                />
            </View>
        </View>
    );
}

// Subtle premium halo on the selected card (mirrors shadows.glow — kept inline so
// the screen never imports the theme shadows module directly).
function shadowGlow(color: string) {
    return {
        shadowColor: color,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.16,
        shadowRadius: 9,
        elevation: 4,
    } as const;
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    levelCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderRadius: 18,
        gap: 14,
    },
    pressed: {
        transform: [{ scale: 0.97 }],
    },
    iconBox: {
        width: 44,
        height: 44,
        borderRadius: 14,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    levelText: {
        flex: 1,
    },
    check: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    checkEmpty: {
        width: 28,
        height: 28,
        borderRadius: 14,
        borderWidth: 1.5,
    },
    footer: {
        borderTopWidth: 1,
    },
});
