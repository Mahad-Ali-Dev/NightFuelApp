import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
    FadeInDown,
    useSharedValue,
    useAnimatedStyle,
    withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { typography } from '@/theme';
import { useThemedPalette, type ThemedPalette } from '@/theme/useThemedPalette';
import { CtaButton } from '@/components/ui';
import { useOnboardingStore } from '@/store/onboardingStore';
import { FitnessGoal } from '@/types/enums';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Design palette is now theme-derived via useThemedPalette() inside each
// component; styles read it through the makeStyles(D) factory below, so this
// onboarding step recolors with the selected theme.

// Single-select primary goal. The friendly labels stay mapped to the real
// FitnessGoal enum the onboarding store persists (no data-model change), each
// with an emoji glyph standing in for the mockup's goal-*.png tile art.
const GOALS = [
    { value: FitnessGoal.MUSCLE_GAIN, label: 'Build muscle', emoji: '💪', description: 'Build size and strength' },
    { value: FitnessGoal.ENDURANCE, label: 'More energy on shift', emoji: '🔋', description: 'Improve stamina and stay sharp' },
    { value: FitnessGoal.FAT_LOSS, label: 'Lose fat', emoji: '⚖️', description: 'Lose weight and body fat' },
    { value: FitnessGoal.GENERAL_HEALTH, label: 'Stay consistent', emoji: '❤️', description: 'Optimal day-to-day well-being' },
    { value: FitnessGoal.MAINTENANCE, label: 'Maintain weight', emoji: '🔁', description: 'Hold your current shape' },
];

export default function GoalsScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { data, updateData } = useOnboardingStore();
    const D = useThemedPalette();
    const styles = useMemo(() => makeStyles(D), [D]);

    const [goal, setGoal] = useState<FitnessGoal | null>(data.fitnessGoal);

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
        <View style={[styles.container, { backgroundColor: D.bg }]}>
            <StatusBar style="light" />
            <ScrollView
                contentContainerStyle={{ paddingTop: insets.top + 14, paddingBottom: 130 }}
                showsVerticalScrollIndicator={false}
            >
                {/* Heading — the mockup's "What brings you to Zeitra?" hero. The
                    STEP X OF N progress bar lives in the onboarding layout header. */}
                <Animated.View entering={FadeInDown.duration(420)} style={styles.head}>
                    <Text style={styles.title}>What brings you{'\n'}to Zeitra?</Text>
                    <Text style={styles.sub}>Pick the goal that matters most — we'll shape your plan around it.</Text>
                </Animated.View>

                <View style={styles.list}>
                    {GOALS.map((option, index) => (
                        <Animated.View key={option.value} entering={FadeInDown.delay(80 + index * 55).duration(420)}>
                            <SelectRow
                                emoji={option.emoji}
                                label={option.label}
                                selected={goal === option.value}
                                accessibilityLabel={`${option.label}. ${option.description}`}
                                onPress={() => handleSelect(option.value as FitnessGoal)}
                            />
                        </Animated.View>
                    ))}
                </View>
            </ScrollView>

            {/* Bottom CTA over a fade-to-bg scrim (mockup). */}
            <LinearGradient colors={['transparent', D.bg]} locations={[0, 0.32]} style={[styles.footer, { paddingBottom: insets.bottom + 18 }]}>
                <CtaButton label="Continue" icon="arrow-forward" size="lg" flat onPress={handleNext} disabled={!goal} />
            </LinearGradient>
        </View>
    );
}

// ── SelectRow — flat opaque list item; selected = lime hairline + glow +
//    graphite gradient + lime check medallion (mockup .opt / .sel / .ck). ──
function SelectRow({
    emoji,
    label,
    selected,
    onPress,
    accessibilityLabel,
}: {
    emoji: string;
    label: string;
    selected: boolean;
    onPress: () => void;
    accessibilityLabel?: string;
}) {
    const D = useThemedPalette();
    const styles = useMemo(() => makeStyles(D), [D]);
    const scale = useSharedValue(1);
    const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

    return (
        <AnimatedPressable
            onPress={onPress}
            onPressIn={() => { scale.value = withTiming(0.98, { duration: 110 }); }}
            onPressOut={() => { scale.value = withTiming(1, { duration: 140 }); }}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={accessibilityLabel ?? label}
            style={[styles.rowWrap, pressStyle]}
        >
            <View style={[styles.row, selected ? styles.rowSel : styles.rowFlat]}>
                {selected && (
                    <LinearGradient colors={[D.selA, D.selB]} start={{ x: 0, y: 0 }} end={{ x: 0.8, y: 1 }} style={StyleSheet.absoluteFillObject} />
                )}
                <View style={styles.tile}>
                    <Text style={styles.emoji} maxFontSizeMultiplier={1.2}>{emoji}</Text>
                </View>
                <Text style={styles.rowLabel} numberOfLines={1}>{label}</Text>
                {selected ? (
                    <View style={styles.check}><Ionicons name="checkmark" size={16} color={D.ink} /></View>
                ) : (
                    <View style={styles.empty} />
                )}
            </View>
        </AnimatedPressable>
    );
}

const makeStyles = (D: ThemedPalette) => StyleSheet.create({
    container: { flex: 1 },
    head: { paddingHorizontal: 20, marginBottom: 4 },
    title: [typography.display, { color: D.text, fontSize: 27, fontWeight: '700', lineHeight: 31, letterSpacing: -0.6 }] as any,
    sub: [typography.body, { color: D.muted, fontSize: 15, lineHeight: 22, marginTop: 10 }] as any,
    list: { paddingHorizontal: 20, marginTop: 14 },

    rowWrap: { marginTop: 12 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 15, overflow: 'hidden' },
    rowFlat: { backgroundColor: D.card, borderWidth: 1, borderColor: D.border },
    rowSel: {
        backgroundColor: D.card, borderWidth: 1.5, borderColor: D.lime,
        shadowColor: D.lime, shadowOpacity: 0.27, shadowRadius: 14, shadowOffset: { width: 0, height: 0 }, elevation: 5,
    },
    tile: { width: 46, height: 46, borderRadius: 13, backgroundColor: D.tile, alignItems: 'center', justifyContent: 'center' },
    emoji: { fontSize: 23 },
    rowLabel: [typography.subhead, { flex: 1, color: D.text, fontSize: 16, fontWeight: '600', letterSpacing: -0.2 }] as any,
    check: { width: 26, height: 26, borderRadius: 13, backgroundColor: D.lime, alignItems: 'center', justifyContent: 'center' },
    empty: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: D.emptyBd },

    footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 18, paddingHorizontal: 20 },
});
