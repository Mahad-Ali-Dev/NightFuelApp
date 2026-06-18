import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme';
import { CtaButton, GlassCard } from '@/components/ui';
import { Card } from '@/components/ui/Card';
import { shadows } from '@/theme/shadows';
import { withAlpha } from '@/theme/utils';
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
        <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
            <StatusBar style="light" />
            <ScrollView contentContainerStyle={{ padding: spacing.xl }}>
                <Text style={[typography.display, { color: colors.text.primary, marginBottom: spacing.sm }]}>
                    Work <Text style={{ color: colors.accent.cyan }}>Environment</Text>
                </Text>
                <Text style={[typography.body, { color: colors.text.secondary, marginBottom: spacing['2xl'] }]}>
                    How active is your shift? We use this to calculate your total daily energy expenditure (TDEE).
                </Text>

                <GlassCard style={[styles.optionsPanel, { padding: spacing.md, gap: spacing.md }]}>
                    {LIFESTYLES.map((l) => {
                        const isSelected = lifestyle === l.value;
                        return (
                            <TouchableOpacity key={l.value} onPress={() => setLifestyle(lifestyle === l.value ? null : (l.value as ActivityLevel))} activeOpacity={0.85} accessibilityRole="button" accessibilityState={{ selected: isSelected }} accessibilityLabel={l.label}>
                                <Card
                                    variant={isSelected ? 'elevated' : 'glass'}
                                    style={[
                                        styles.envCard,
                                        isSelected && { borderColor: colors.accent.cyan, borderWidth: 1.5, ...shadows.glow(colors.accent.cyan) }
                                    ]}
                                >
                                    <View style={styles.contentRow}>
                                        <View style={[styles.iconBox, { backgroundColor: isSelected ? withAlpha(colors.accent.cyan, 0.16) : colors.background.tertiary }]}>
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
                                            <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 4 }]}>
                                                {l.desc}
                                            </Text>
                                        </View>
                                        {isSelected && <Ionicons name="checkmark-circle" size={24} color={colors.accent.cyan} />}
                                    </View>
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
                    disabled={!lifestyle}
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
        // GlassCard panel wrapping the work-environment options; per-row Card
        // glow/borders stay intact inside the Aurora frosted container.
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
