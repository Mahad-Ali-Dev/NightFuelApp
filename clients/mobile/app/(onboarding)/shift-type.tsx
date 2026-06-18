import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme';
import { Card } from '@/components/ui/Card';
import { CtaButton, GlassCard } from '@/components/ui';
import { shadows } from '@/theme/shadows';
import { withAlpha } from '@/theme/utils';
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

export default function GoalsScreen() {
    const { colors, typography, spacing } = useTheme();
    const router = useRouter();
    const { data, updateData } = useOnboardingStore();

    const [goal, setGoal] = useState<FitnessGoal | null>(data.fitnessGoal);

    const handleNext = () => {
        if (goal) {
            updateData({ fitnessGoal: goal });
            router.push('/(onboarding)/sleep-schedule');
        }
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
            <StatusBar style="light" />
            <ScrollView contentContainerStyle={{ padding: spacing.xl }}>
                <Text style={[typography.display, { color: colors.text.primary, marginBottom: spacing.sm }]}>
                    What is your <Text style={{ color: colors.accent.coral }}>primary goal</Text>?
                </Text>
                <Text style={[typography.body, { color: colors.text.secondary, marginBottom: spacing['2xl'] }]}>
                    Choose the objective that best describes what you want to achieve with NightFuel.
                </Text>

                <GlassCard style={[styles.optionsPanel, { padding: spacing.md, gap: spacing.md }]}>
                    {GOALS.map((option) => {
                        const isSelected = goal === option.value;
                        return (
                            <TouchableOpacity
                                key={option.value}
                                activeOpacity={0.85}
                                onPress={() => setGoal(goal === option.value ? null : (option.value as FitnessGoal))}
                                accessibilityRole="button"
                                accessibilityState={{ selected: isSelected }}
                                accessibilityLabel={option.label}
                            >
                                <Card
                                    variant={isSelected ? 'elevated' : 'glass'}
                                    style={[
                                        styles.card,
                                        isSelected && { borderColor: colors.accent.coral, borderWidth: 1.5, ...shadows.glow(colors.accent.coral) }
                                    ]}
                                >
                                    <View style={styles.cardHeader}>
                                        <View style={[styles.iconContainer, { backgroundColor: withAlpha(colors.accent.coral, 0.14) }]}>
                                            <Ionicons name={option.icon as any} size={24} color={colors.accent.coral} />
                                        </View>
                                        {isSelected && (
                                            <View style={styles.checkmark}>
                                                <Ionicons name="checkmark-circle" size={24} color={colors.accent.cyan} />
                                            </View>
                                        )}
                                    </View>
                                    <Text style={[typography.heading, { color: colors.text.primary, marginBottom: spacing.xs }]}>
                                        {option.label}
                                    </Text>
                                    <Text style={[typography.body, { color: colors.text.secondary }]}>
                                        {option.description}
                                    </Text>
                                </Card>
                            </TouchableOpacity>
                        )
                    })}
                </GlassCard>
            </ScrollView>

            <View style={[styles.footer, { paddingHorizontal: spacing.xl, paddingBottom: spacing['2xl'] }]}>
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
    optionsPanel: {
        // GlassCard panel wrapping the goal options; per-row Card glow/borders
        // stay intact, the panel just gives the Aurora frosted container.
    },
    card: {
        padding: 20,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 16,
    },
    iconContainer: {
        width: 48,
        height: 48,
        borderRadius: 24,
        justifyContent: 'center',
        alignItems: 'center',
    },
    checkmark: {
        alignSelf: 'center',
    },
    footer: {
        paddingTop: 16,
    }
});
