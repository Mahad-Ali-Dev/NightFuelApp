import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useOnboardingStore } from '@/store/onboardingStore';
import { ActivityLevel } from '@/types/enums';
import { Ionicons } from '@expo/vector-icons';

const LIFESTYLES = [
    {
        value: ActivityLevel.SEDENTARY,
        label: 'Sedentary',
        desc: 'Mostly sitting, desk work, driving',
        icon: 'desktop'
    },
    {
        value: ActivityLevel.LIGHTLY_ACTIVE,
        label: 'Lightly Active',
        desc: 'Some walking, light physical tasks',
        icon: 'walk'
    },
    {
        value: ActivityLevel.MODERATELY_ACTIVE,
        label: 'Moderately Active',
        desc: 'Frequent movement, nurse, retail',
        icon: 'medkit'
    },
    {
        value: ActivityLevel.VERY_ACTIVE,
        label: 'Very Active',
        desc: 'Heavy physical labor, construction, warehouse',
        icon: 'hammer'
    },
];

export default function EnvironmentScreen() {
    const { colors, typography, spacing } = useTheme();
    const router = useRouter();
    const { data, updateData } = useOnboardingStore();

    const [lifestyle, setLifestyle] = useState<ActivityLevel | null>(data.activityLevel);

    const handleNext = () => {
        updateData({ activityLevel: lifestyle });
        router.push('/(onboarding)/ai-optimization');
    };

    return (
        <View style={styles.container}>
            <ScrollView contentContainerStyle={{ padding: spacing.xl }}>
                <Text style={[typography.display, { color: colors.text.primary, marginBottom: spacing.sm }]}>
                    Work <Text style={{ color: colors.accent.cyan }}>Environment</Text>
                </Text>
                <Text style={[typography.body, { color: colors.text.secondary, marginBottom: spacing['2xl'] }]}>
                    How active is your shift? We use this to calculate your total daily energy expenditure (TDEE).
                </Text>

                <View style={{ gap: spacing.md }}>
                    {LIFESTYLES.map((l) => {
                        const isSelected = lifestyle === l.value;
                        return (
                            <TouchableOpacity key={l.value} onPress={() => setLifestyle(lifestyle === l.value ? null : (l.value as ActivityLevel))} activeOpacity={0.8}>
                                <Card
                                    variant={isSelected ? 'elevated' : 'default'}
                                    style={[
                                        styles.envCard,
                                        isSelected && { borderColor: colors.accent.cyan, borderWidth: 1 }
                                    ]}
                                >
                                    <View style={styles.contentRow}>
                                        <View style={[styles.iconBox, { backgroundColor: isSelected ? `${colors.accent.cyan}20` : colors.background.tertiary }]}>
                                            <Ionicons
                                                name={l.icon as any}
                                                size={24}
                                                color={isSelected ? colors.accent.cyan : colors.text.secondary}
                                            />
                                        </View>
                                        <View style={styles.textContainer}>
                                            <Text style={[
                                                typography.heading,
                                                { color: isSelected ? colors.text.primary : colors.text.secondary }
                                            ]}>
                                                {l.label}
                                            </Text>
                                            <Text style={[typography.caption, { color: colors.text.tertiary, marginTop: 4 }]}>
                                                {l.desc}
                                            </Text>
                                        </View>
                                        {isSelected && <Ionicons name="checkmark-circle" size={24} color={colors.accent.cyan} />}
                                    </View>
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
                    disabled={!lifestyle}
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
    envCard: {
        padding: 16,
    },
    contentRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    iconBox: {
        width: 48,
        height: 48,
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 16,
    },
    textContainer: {
        flex: 1,
    },
    footer: {
        paddingTop: 16,
    }
});
