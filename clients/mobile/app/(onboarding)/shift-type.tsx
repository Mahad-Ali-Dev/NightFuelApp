import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import Animated, {
    FadeInDown,
    useSharedValue,
    useAnimatedStyle,
    withTiming,
} from 'react-native-reanimated';
import { useTheme } from '@/theme';
import { CtaButton, GlassCard } from '@/components/ui';
import { withAlpha } from '@/theme/utils';
import { GoalRecommendationRail, type GoalRailItem } from '@/components/GoalRecommendationRail';
import { useOnboardingStore } from '@/store/onboardingStore';
import { FitnessGoal } from '@/types/enums';
import { Ionicons } from '@expo/vector-icons';

// Reanimated-driven Pressable so each goal row's press feedback rides a spring
// (transform only) — matching the rest of the onboarding card language.
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Each goal carries the mockup row anatomy: an emoji glyph (icon-square), a
// title and a one-line "time range"-style sub-label. The Ionicons `icon` is
// retained for the recommendation rail (which still renders medallion glyphs).
const GOALS = [
    { value: FitnessGoal.FAT_LOSS, label: 'Fat Loss', emoji: '⚖️', icon: 'flame', description: 'Lose weight and body fat' },
    { value: FitnessGoal.MUSCLE_GAIN, label: 'Muscle Gain', emoji: '💪', icon: 'barbell', description: 'Build size and strength' },
    { value: FitnessGoal.MAINTENANCE, label: 'Maintenance', emoji: '🔁', icon: 'body', description: 'Maintain current weight' },
    { value: FitnessGoal.ENDURANCE, label: 'Endurance', emoji: '🔋', icon: 'walk', description: 'Improve stamina and performance' },
    { value: FitnessGoal.GENERAL_HEALTH, label: 'General Health', emoji: '❤️', icon: 'heart', description: 'Optimal well-being' },
];

// "Popular with shift workers" recommended-goals rail. A curated subset of the
// same GOALS entries (identical `value`s) so tapping a rail card drives the very
// same selection state as the list — the chosen goal can be set from either.
const RECOMMENDED_GOAL_VALUES: FitnessGoal[] = [
    FitnessGoal.FAT_LOSS,
    FitnessGoal.GENERAL_HEALTH,
    FitnessGoal.MUSCLE_GAIN,
];
const RECOMMENDED_GOALS: GoalRailItem[] = RECOMMENDED_GOAL_VALUES
    .map((v) => GOALS.find((g) => g.value === v))
    .filter((g): g is (typeof GOALS)[number] => g != null)
    .map((g) => ({ ...g, icon: g.icon as keyof typeof Ionicons.glyphMap }));

export default function GoalsScreen() {
    const { colors, typography, spacing } = useTheme();
    const router = useRouter();
    const { data, updateData } = useOnboardingStore();

    const [goal, setGoal] = useState<FitnessGoal | null>(data.fitnessGoal);

    // Single tap-to-toggle handler shared by BOTH the recommended rail and the
    // list so selecting / clearing a goal behaves identically from either
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
                contentContainerStyle={{ paddingTop: spacing.xl, paddingBottom: spacing['2xl'] }}
                showsVerticalScrollIndicator={false}
            >
                {/* Big heading — the mockup's "When do you usually work?" hero.
                    The authoritative "STEP X OF N" progress bar lives in the
                    onboarding layout header, so the screen leads straight with
                    the question + supporting line. */}
                <Animated.View
                    entering={FadeInDown.duration(420)}
                    style={{ paddingHorizontal: spacing.xl, marginBottom: spacing.xl }}
                >
                    <Text style={[typography.display, { color: colors.text.primary }]}>
                        What's your <Text style={{ color: colors.accent.coral }}>primary goal</Text>?
                    </Text>
                    <Text style={[typography.body, { color: colors.text.secondary, marginTop: spacing.sm }]}>
                        We'll shape your meals, training and recovery around the objective that matters most to you.
                    </Text>
                </Animated.View>

                {/* Recommended-goals carousel — a horizontal snapping rail that
                    drives the SAME selection state as the list below. */}
                <GoalRecommendationRail
                    title="POPULAR WITH SHIFT WORKERS"
                    items={RECOMMENDED_GOALS}
                    selectedValue={goal}
                    onSelect={(value) => handleSelect(value as FitnessGoal)}
                    edgePadding={spacing.xl}
                />

                <View style={{ paddingHorizontal: spacing.xl, marginBottom: spacing.sm }}>
                    <Text style={[typography.overline, { color: colors.text.tertiary }]}>
                        ALL GOALS
                    </Text>
                </View>

                <View style={{ paddingHorizontal: spacing.xl }}>
                    {GOALS.map((option, index) => (
                        <Animated.View
                            key={option.value}
                            entering={FadeInDown.delay(120 + index * 60).duration(420)}
                        >
                            <SelectRow
                                emoji={option.emoji}
                                label={option.label}
                                sublabel={option.description}
                                selected={goal === option.value}
                                accessibilityLabel={`${option.label}. ${option.description}`}
                                onPress={() => handleSelect(option.value as FitnessGoal)}
                            />
                        </Animated.View>
                    ))}
                </View>

                {/* Toggle-off affordance hint — surfaces that tapping the active
                    row clears it, so the CTA greying out isn't a surprise. */}
                {goal != null && (
                    <Animated.View
                        entering={FadeInDown.duration(280)}
                        style={[styles.clearHintRow, { paddingHorizontal: spacing.xl, marginTop: spacing.md }]}
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
                    icon="arrow-forward"
                    size="lg"
                    onPress={handleNext}
                    disabled={!goal}
                />
            </View>
        </View>
    );
}

// ── SelectRow ────────────────────────────────────────────────────────────────
// The mockup's full-width selectable row: a frosted GlassCard with a rounded-
// square emoji tile on the left, a title + one-line sub-label in the middle, and
// (when selected) a lime check medallion on the right. Selected = lime hairline
// ring + soft glow + lime-filled emoji tile; colour is never the only signal
// (the check badge + bolder title shift too). Pure presentation — forwards
// press + a11y so the screen keeps every handler.
function SelectRow({
    emoji,
    label,
    sublabel,
    selected,
    onPress,
    accessibilityLabel,
}: {
    emoji: string;
    label: string;
    sublabel?: string;
    selected: boolean;
    onPress: () => void;
    accessibilityLabel?: string;
}) {
    const { colors, typography, spacing, borderRadius, shadows } = useTheme();
    const scale = useSharedValue(1);
    const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

    return (
        <AnimatedPressable
            onPress={onPress}
            onPressIn={() => {
                scale.value = withTiming(0.97, { duration: 110 });
            }}
            onPressOut={() => {
                scale.value = withTiming(1, { duration: 140 });
            }}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={accessibilityLabel ?? label}
            style={[styles.rowWrap, pressStyle]}
        >
            <GlassCard
                radius={borderRadius.xl}
                glow={selected ? colors.accent.coral : undefined}
                style={[
                    styles.rowCard,
                    {
                        // Constant border width (1.5) — only the colour changes on
                        // select, so a neighbour row never reflows by 0.5px.
                        borderColor: selected ? colors.accent.coral : withAlpha(colors.text.primary, 0.1),
                        borderWidth: 1.5,
                    },
                ]}
            >
                <View style={[styles.rowBody, { padding: spacing.lg }]}>
                    <View
                        style={[
                            styles.emojiTile,
                            {
                                backgroundColor: selected
                                    ? withAlpha(colors.accent.coral, 0.22)
                                    : colors.background.tertiary,
                                borderColor: selected
                                    ? withAlpha(colors.accent.coral, 0.4)
                                    : withAlpha(colors.text.primary, 0.06),
                            },
                        ]}
                    >
                        <Text style={styles.emojiGlyph} maxFontSizeMultiplier={1.2}>
                            {emoji}
                        </Text>
                    </View>

                    <View style={styles.rowText}>
                        <Text
                            style={[
                                typography.subhead,
                                { color: selected ? colors.text.primary : colors.text.primary },
                            ]}
                            numberOfLines={1}
                        >
                            {label}
                        </Text>
                        {sublabel ? (
                            <Text
                                style={[typography.caption, { color: colors.text.secondary, marginTop: 2 }]}
                                numberOfLines={1}
                            >
                                {sublabel}
                            </Text>
                        ) : null}
                    </View>

                    {selected ? (
                        <View style={[styles.checkMedallion, { backgroundColor: colors.accent.coral }, shadows.glow(colors.accent.coral)]}>
                            <Ionicons name="checkmark" size={15} color={colors.text.inverse} />
                        </View>
                    ) : (
                        <View style={[styles.emptyDot, { borderColor: colors.border.light }]} />
                    )}
                </View>
            </GlassCard>
        </AnimatedPressable>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    rowWrap: {
        marginBottom: 13,
    },
    rowCard: {
        // Row, not square — the mockup's compact list item.
    },
    rowBody: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
    },
    emojiTile: {
        width: 46,
        height: 46,
        borderRadius: 14,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    emojiGlyph: {
        fontSize: 23,
    },
    rowText: {
        flex: 1,
    },
    checkMedallion: {
        width: 26,
        height: 26,
        borderRadius: 13,
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyDot: {
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 1.5,
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
