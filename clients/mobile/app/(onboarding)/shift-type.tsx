import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
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
        <View style={styles.container}>
            <ScrollView contentContainerStyle={{ padding: spacing.xl }}>
                <Text style={[typography.display, { color: colors.text.primary, marginBottom: spacing.sm }]}>
                    What is your <Text style={{ color: colors.accent.coral }}>primary goal</Text>?
                </Text>
                <Text style={[typography.body, { color: colors.text.secondary, marginBottom: spacing['2xl'] }]}>
                    Choose the objective that best describes what you want to achieve with NightFuel.
                </Text>

                <View style={{ gap: spacing.md }}>
                    {GOALS.map((option) => {
                        const isSelected = goal === option.value;
                        return (
                            <TouchableOpacity
                                key={option.value}
                                activeOpacity={0.8}
                                onPress={() => setGoal(option.value as FitnessGoal)}
                            >
                                <Card
                                    variant={isSelected ? 'elevated' : 'default'}
                                    style={[
                                        styles.card,
                                        isSelected && { borderColor: colors.accent.coral, borderWidth: 1 }
                                    ]}
                                >
                                    <View style={styles.cardHeader}>
                                        <View style={[styles.iconContainer, { backgroundColor: `${colors.accent.coral}20` }]}>
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
                </View>
            </ScrollView>

            <View style={[styles.footer, { paddingHorizontal: spacing.xl, paddingBottom: spacing['2xl'] }]}>
                <Button
                    title="Continue"
                    iconRight={<Ionicons name="arrow-forward" size={20} color="#fff" />}
                    onPress={handleNext}
                    disabled={!goal}
                    fullWidth
                />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
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
