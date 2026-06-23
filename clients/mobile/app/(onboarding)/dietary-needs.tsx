import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme';
import { CtaButton } from '@/components/ui';
import { withAlpha } from '@/theme/utils';
import { DietPrefChip } from '@/components/DietPrefChip';
import { DietModeCard } from '@/components/DietModeCard';
import { useOnboardingStore } from '@/store/onboardingStore';
import { getOnboardingStep } from '@/utils/onboardingSteps';
import { DietaryPreference, DietMode } from '@/types/enums';

const PREFERENCES: { value: DietaryPreference; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { value: DietaryPreference.NONE, label: 'No Restrictions', icon: 'restaurant' },
    { value: DietaryPreference.VEGETARIAN, label: 'Vegetarian', icon: 'leaf' },
    { value: DietaryPreference.VEGAN, label: 'Vegan', icon: 'nutrition' },
    { value: DietaryPreference.KETO, label: 'Keto', icon: 'apps' },
    { value: DietaryPreference.HALAL, label: 'Halal', icon: 'moon' },
    { value: DietaryPreference.GLUTEN_FREE, label: 'Gluten Free', icon: 'close-circle' },
];

const MODES: { value: DietMode; label: string; description: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { value: DietMode.BALANCED, label: 'Balanced', description: 'Standard healthy focus', icon: 'sync' },
    { value: DietMode.MASS_GAIN, label: 'Mass Gain', description: 'Surplus for building', icon: 'barbell' },
    { value: DietMode.CUTTING, label: 'Cutting', description: 'Deficit for fat loss', icon: 'flame' },
    { value: DietMode.BUDGET, label: 'Budget', description: 'Wallet-friendly meals', icon: 'wallet' },
    { value: DietMode.ACNE_SAFE, label: 'Acne Safe', description: 'Skin health focus', icon: 'sparkles' },
    { value: DietMode.RAMADAN, label: 'Ramadan', description: 'Fasting friendly', icon: 'moon' },
];

// This is the "Nutrition" step (route 'dietary-needs'). Its position is read
// from the SHARED onboarding-step util — the same source the layout header's
// progress bar uses — so the hero numeral and the header can never drift.
const ROUTE = 'dietary-needs';

export default function NutritionScreen() {
    const { colors, typography, spacing, borderRadius } = useTheme();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { data, updateData } = useOnboardingStore();

    const [preference, setPreference] = useState<DietaryPreference | null>(data.dietaryPreference || DietaryPreference.NONE);
    const [mode, setMode] = useState<DietMode | null>(data.dietMode);

    const handleNext = () => {
        updateData({
            dietaryPreference: preference,
            dietMode: mode
        });
        router.push('/(onboarding)/profile-summary');
    };

    const isValid = preference && mode;

    // Single source of truth — derived from the same util the header uses, so
    // the hero numeral and the header's "STEP X OF N" / progress bar always agree.
    const step = getOnboardingStep(ROUTE, data.biologicalSex);

    return (
        <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
            <StatusBar style="light" />
            <ScrollView
                contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingTop: spacing['2xl'] }}
                showsVerticalScrollIndicator={false}
            >
                {/* Hero header — large bold numeral step indicator + display title.
                    Mirrors the sibling Goals screen so the in-screen progress reads
                    as the brand's "large bold numeral" alongside the header bar. */}
                <Animated.View entering={FadeInDown.duration(420)} style={{ marginBottom: spacing['2xl'] }}>
                    <View style={styles.eyebrowRow}>
                        <Text style={[typography.display, styles.heroNumeral, { color: colors.accent.coral, fontVariant: ['tabular-nums'] }]}>
                            {String(step.current).padStart(2, '0')}
                        </Text>
                        <View style={[styles.eyebrowTextBlock, { marginLeft: spacing.md }]}>
                            {/* "STEP" label ties this hero numeral to the header's
                                "STEP X OF N" wording, so the two read as ONE progress
                                system (one accent, one phrasing) rather than two. */}
                            <Text style={[typography.overline, { color: colors.text.tertiary }]}>
                                STEP
                            </Text>
                            <Text style={[typography.h3, { color: colors.text.tertiary, fontVariant: ['tabular-nums'] }]}>
                                / {String(step.total).padStart(2, '0')}
                            </Text>
                            <Text style={[typography.overline, { color: colors.accent.coral }]}>
                                YOUR NUTRITION
                            </Text>
                        </View>
                    </View>
                    <Text style={[typography.display, { color: colors.text.primary, marginTop: spacing.md, marginBottom: spacing.sm }]}>
                        How do you <Text style={{ color: colors.accent.coral }}>eat</Text>?
                    </Text>
                    <Text style={[typography.body, { color: colors.text.secondary }]}>
                        Tell us your preferences so every plan respects your diet and goals.
                    </Text>
                </Animated.View>

                {/* ── Dietary Preference — multi-option grid of selection chips ── */}
                <Animated.View entering={FadeInDown.delay(120).duration(420)} style={[styles.sectionHeadRow, { marginBottom: spacing.md }]}>
                    <Text style={[typography.overline, { color: colors.text.tertiary }]}>
                        Dietary Preference
                    </Text>
                    <Ionicons name="restaurant-outline" size={14} color={colors.text.tertiary} />
                </Animated.View>
                <View style={styles.grid}>
                    {PREFERENCES.map((d, index) => {
                        const isSelected = preference === d.value;
                        return (
                            <Animated.View
                                key={d.value}
                                entering={FadeInDown.delay(160 + index * 40).duration(420)}
                                style={[styles.gridItem, { marginBottom: spacing.md }]}
                            >
                                <DietPrefChip
                                    label={d.label}
                                    icon={d.icon}
                                    selected={isSelected}
                                    accessibilityLabel={d.label}
                                    onPress={() => setPreference(preference === d.value ? null : (d.value as DietaryPreference))}
                                />
                            </Animated.View>
                        );
                    })}
                </View>

                {/* ── Diet Mode — full-width focus cards ── */}
                <Animated.View entering={FadeInDown.delay(220).duration(420)} style={[styles.sectionHeadRow, { marginTop: spacing.lg, marginBottom: spacing.md }]}>
                    <Text style={[typography.overline, { color: colors.text.tertiary }]}>
                        Diet Mode
                    </Text>
                    <Ionicons name="options-outline" size={14} color={colors.text.tertiary} />
                </Animated.View>
                <View style={{ gap: spacing.md }}>
                    {MODES.map((m, index) => {
                        const isSelected = mode === m.value;
                        return (
                            <Animated.View
                                key={m.value}
                                entering={FadeInDown.delay(260 + index * 40).duration(420)}
                            >
                                <DietModeCard
                                    label={m.label}
                                    description={m.description}
                                    icon={m.icon}
                                    selected={isSelected}
                                    accessibilityLabel={m.label}
                                    onPress={() => setMode(mode === m.value ? null : (m.value as DietMode))}
                                />
                            </Animated.View>
                        );
                    })}
                </View>

                {/* Toggle-off affordance hint — surfaces that re-tapping a chosen
                    card clears it, so the CTA disabling isn't a surprise. */}
                {isValid && (
                    <Animated.View entering={FadeInDown.duration(280)} style={[styles.clearHintRow, { marginTop: spacing.lg }]}>
                        <Ionicons name="information-circle-outline" size={14} color={colors.text.tertiary} />
                        <Text style={[typography.caption, { color: colors.text.tertiary }]}>
                            Tap a selected card again to clear it.
                        </Text>
                    </Animated.View>
                )}

                <View style={{ height: spacing['6xl'] }} />
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
                    label="Continue"
                    size="lg"
                    onPress={handleNext}
                    disabled={!isValid}
                />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    eyebrowRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    heroNumeral: {
        // Deliberate one-off hero display size — larger than typography.display
        // (36) so the step number reads as the brand's "large bold numeral".
        fontSize: 56,
        lineHeight: 60,
    },
    eyebrowTextBlock: {
        justifyContent: 'center',
    },
    sectionHeadRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
    },
    gridItem: {
        width: '48%',
    },
    clearHintRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    footer: {
        borderTopWidth: 1,
    },
});
