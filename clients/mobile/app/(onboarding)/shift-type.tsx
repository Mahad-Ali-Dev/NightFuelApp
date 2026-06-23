import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTheme } from '@/theme';
import { CtaButton } from '@/components/ui';
import { withAlpha } from '@/theme/utils';
import { GoalGridCard } from '@/components/GoalGridCard';
import { GoalRecommendationRail, type GoalRailItem } from '@/components/GoalRecommendationRail';
import { useOnboardingStore } from '@/store/onboardingStore';
import { FitnessGoal } from '@/types/enums';
import { Ionicons } from '@expo/vector-icons';

const GOALS = [
    { value: FitnessGoal.FAT_LOSS, label: 'Fat Loss', icon: 'flame', description: 'Lose weight and body fat' },
    { value: FitnessGoal.MUSCLE_GAIN, label: 'Muscle Gain', icon: 'barbell', description: 'Build size and strength' },
    { value: FitnessGoal.MAINTENANCE, label: 'Maintenance', icon: 'body', description: 'Maintain current weight' },
    { value: FitnessGoal.ENDURANCE, label: 'Endurance', icon: 'walk', description: 'Improve stamina and performance' },
    { value: FitnessGoal.GENERAL_HEALTH, label: 'General Health', icon: 'heart', description: 'Optimal well-being' },
];

// "Popular with shift workers" recommended-goals rail. A curated subset of the
// same GOALS entries (identical `value`s) so tapping a rail card drives the very
// same selection state as the grid — the chosen goal can be set from either.
const RECOMMENDED_GOAL_VALUES: FitnessGoal[] = [
    FitnessGoal.FAT_LOSS,
    FitnessGoal.GENERAL_HEALTH,
    FitnessGoal.MUSCLE_GAIN,
];
const RECOMMENDED_GOALS: GoalRailItem[] = RECOMMENDED_GOAL_VALUES
    .map((v) => GOALS.find((g) => g.value === v))
    .filter((g): g is (typeof GOALS)[number] => g != null)
    .map((g) => ({ ...g, icon: g.icon as keyof typeof Ionicons.glyphMap }));

// This screen is the Goals decision (the first goal the user sets), surfaced as
// the hero "01". The denominator mirrors the onboarding layout's logic: the
// FEMALE flow inserts the conditional cycle step, making 5 visible steps; every
// other path has 4. Derived (not hardcoded) so the big numeral stays honest.
const STEP_NUMBER = 1;
const BASE_TOTAL_STEPS = 4;
const FEMALE_TOTAL_STEPS = 5;

export default function GoalsScreen() {
    const { colors, typography, spacing } = useTheme();
    const router = useRouter();
    const { data, updateData } = useOnboardingStore();

    const [goal, setGoal] = useState<FitnessGoal | null>(data.fitnessGoal);

    // FEMALE users get the extra conditional cycle step (5 total); all other
    // paths have 4 — matching the onboarding layout's "STEP X OF N" denominator.
    const totalSteps = data.biologicalSex === 'FEMALE' ? FEMALE_TOTAL_STEPS : BASE_TOTAL_STEPS;

    // Single tap-to-toggle handler shared by BOTH the recommended rail and the
    // grid so selecting / clearing a goal behaves identically from either
    // surface. Re-tapping the active goal clears it (CTA disables) — the
    // "Tap again to clear" hint below makes that affordance discoverable.
    const handleSelect = (value: FitnessGoal) => {
        setGoal((current) => (current === value ? null : value));
    };

    const handleNext = () => {
        if (goal) {
            updateData({ fitnessGoal: goal });
            router.push('/(onboarding)/sleep-schedule');
        }
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
            <StatusBar style="light" />
            <ScrollView
                contentContainerStyle={{ paddingTop: spacing['3xl'], paddingBottom: spacing['2xl'] }}
                showsVerticalScrollIndicator={false}
            >
                <Animated.View
                    entering={FadeInDown.duration(420)}
                    style={{ paddingHorizontal: spacing.xl, marginBottom: spacing['2xl'] }}
                >
                    {/* Hero step numeral — the brand's "large bold numerals" signature.
                        Promotes the buried overline step number to a high-contrast
                        lime hero "01", with a muted "/ NN" total beside the eyebrow. */}
                    <View style={[styles.eyebrowRow, { gap: spacing.md }]}>
                        <Text style={[typography.display, styles.heroNumeral, { color: colors.accent.coral }]}>
                            {String(STEP_NUMBER).padStart(2, '0')}
                        </Text>
                        <View style={styles.eyebrowTextBlock}>
                            <Text style={[typography.h3, { color: colors.text.tertiary }]}>
                                / {String(totalSteps).padStart(2, '0')}
                            </Text>
                            <Text style={[typography.overline, { color: colors.accent.coral }]}>
                                YOUR GOAL
                            </Text>
                        </View>
                    </View>
                    <Text style={[typography.display, { color: colors.text.primary, marginTop: spacing.md, marginBottom: spacing.sm }]}>
                        What is your <Text style={{ color: colors.accent.coral }}>primary goal</Text>?
                    </Text>
                    <Text style={[typography.body, { color: colors.text.secondary }]}>
                        Choose the objective that best describes what you want to achieve with Zeitra.
                    </Text>
                </Animated.View>

                {/* Recommended-goals carousel — a horizontal snapping rail that
                    drives the SAME selection state as the grid below. */}
                <GoalRecommendationRail
                    title="POPULAR WITH SHIFT WORKERS"
                    items={RECOMMENDED_GOALS}
                    selectedValue={goal}
                    onSelect={(value) => handleSelect(value as FitnessGoal)}
                    edgePadding={spacing.xl}
                />

                <View style={{ paddingHorizontal: spacing.xl, marginBottom: spacing.md }}>
                    <Text style={[typography.overline, { color: colors.text.tertiary }]}>
                        ALL GOALS
                    </Text>
                </View>

                <View style={[styles.grid, { paddingHorizontal: spacing.xl }]}>
                    {GOALS.map((option, index) => {
                        const isSelected = goal === option.value;
                        const isLastOdd = index === GOALS.length - 1 && GOALS.length % 2 === 1;
                        return (
                            <Animated.View
                                key={option.value}
                                entering={FadeInDown.delay(120 + index * 70).duration(440)}
                                style={[styles.gridItem, { marginBottom: spacing.lg }, isLastOdd && styles.gridItemFull]}
                            >
                                <GoalGridCard
                                    label={option.label}
                                    description={option.description}
                                    icon={option.icon as keyof typeof Ionicons.glyphMap}
                                    selected={isSelected}
                                    accessibilityLabel={`${option.label}. ${option.description}`}
                                    onPress={() => handleSelect(option.value as FitnessGoal)}
                                />
                            </Animated.View>
                        );
                    })}
                </View>

                {/* Toggle-off affordance hint — surfaces that tapping the active
                    tile clears it, so the CTA greying out isn't a surprise. */}
                {goal != null && (
                    <Animated.View
                        entering={FadeInDown.duration(280)}
                        style={[styles.clearHintRow, { paddingHorizontal: spacing.xl, marginTop: spacing.xs }]}
                    >
                        <Ionicons name="information-circle-outline" size={14} color={colors.text.tertiary} />
                        <Text style={[typography.caption, { color: colors.text.tertiary }]}>
                            Tap your selected goal again to clear it.
                        </Text>
                    </Animated.View>
                )}
            </ScrollView>

            <View
                style={[
                    styles.footer,
                    {
                        paddingTop: spacing.lg,
                        paddingHorizontal: spacing.xl,
                        paddingBottom: spacing['2xl'],
                        borderTopColor: withAlpha(colors.text.primary, 0.06),
                        backgroundColor: colors.background.primary,
                    },
                ]}
            >
                <CtaButton
                    label="Continue"
                    size="lg"
                    onPress={handleNext}
                    disabled={!goal}
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
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
    },
    gridItem: {
        width: '48%',
    },
    gridItemFull: {
        width: '100%',
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
