import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { useTheme, colors as palette } from '@/theme';
import { CtaButton, GlassCard } from '@/components/ui';
import { Card } from '@/components/ui/Card';
import { shadows } from '@/theme/shadows';
import { withAlpha } from '@/theme/utils';
import { useOnboardingStore } from '@/store/onboardingStore';
import { Ionicons } from '@expo/vector-icons';

const AI_LEVELS = [
    {
        value: 'high',
        label: 'Maximum Optimization',
        desc: 'Strict meal timing, precise caffeine cutoffs, dynamic lighting alerts',
        icon: 'flash',
        color: palette.accent.purple // Purple coach color
    },
    {
        value: 'medium',
        label: 'Balanced Approach',
        desc: 'Core circadian principles with flexibility for social life and cravings',
        icon: 'leaf',
        color: palette.accent.cyan // Cyan
    },
    {
        value: 'low',
        label: 'Gentle Guidance',
        desc: 'Just tracking and basic recommendations without strict rules',
        icon: 'water',
        color: palette.accent.blue // Blue
    },
];

export default function AIOptimizationScreen() {
    const { colors, typography, spacing } = useTheme();
    const router = useRouter();
    const { data, updateData } = useOnboardingStore();

    const [aiLevel, setAiLevel] = useState<'low' | 'medium' | 'high'>(data.aiOptimizationLevel || 'medium');

    const handleNext = () => {
        updateData({ aiOptimizationLevel: aiLevel });
        router.push('/(onboarding)/profile-summary');
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
            <StatusBar style="light" />
            <ScrollView contentContainerStyle={{ padding: spacing.xl }}>
                <Text style={[typography.display, { color: colors.text.primary, marginBottom: spacing.sm }]}>
                    AI <Text style={{ color: colors.accent.purple }}>Optimization</Text>
                </Text>
                <Text style={[typography.body, { color: colors.text.secondary, marginBottom: spacing['2xl'] }]}>
                    How deeply should Coach Ria optimize your schedule?
                </Text>

                <GlassCard style={[styles.optionsPanel, { padding: spacing.md, gap: spacing.md }]}>
                    {AI_LEVELS.map((level) => {
                        const isSelected = aiLevel === level.value;
                        return (
                            <TouchableOpacity key={level.value} onPress={() => setAiLevel(level.value as any)} activeOpacity={0.85} accessibilityRole="button" accessibilityState={{ selected: isSelected }} accessibilityLabel={level.label} accessibilityHint={level.desc}>
                                <Card
                                    variant={isSelected ? 'elevated' : 'glass'}
                                    style={[
                                        styles.levelCard,
                                        isSelected && { borderColor: level.color, borderWidth: 1.5, ...shadows.glow(level.color) }
                                    ]}
                                >
                                    <View style={styles.cardHeader}>
                                        <View style={[styles.iconBox, { backgroundColor: withAlpha(level.color, 0.14) }]}>
                                            <Ionicons name={level.icon as any} size={24} color={level.color} />
                                        </View>
                                        {isSelected && <Ionicons name="checkmark-circle" size={24} color={level.color} />}
                                    </View>
                                    <Text style={[
                                        typography.heading,
                                        { color: colors.text.primary, marginBottom: 8 }
                                    ]}>
                                        {level.label}
                                    </Text>
                                    <Text style={[typography.caption, { color: colors.text.secondary }]}>
                                        {level.desc}
                                    </Text>
                                </Card>
                            </TouchableOpacity>
                        )
                    })}
                </GlassCard>
            </ScrollView>

            <View style={[styles.footer, { paddingHorizontal: spacing.xl, paddingBottom: spacing['2xl'] }]}>
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

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    optionsPanel: {
        // GlassCard panel wrapping the AI-level options; per-row Card glow/borders
        // stay intact inside the Aurora frosted container.
    },
    levelCard: {
        padding: 20,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 16,
    },
    iconBox: {
        width: 48,
        height: 48,
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
    },
    footer: {
        paddingTop: 16,
    }
});
