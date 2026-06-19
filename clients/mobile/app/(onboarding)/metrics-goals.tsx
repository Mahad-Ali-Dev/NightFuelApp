import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme';
import { Input } from '@/components/ui/Input';
import { CtaButton, DateTimeField, GlassCard } from '@/components/ui';
import { Card } from '@/components/ui/Card';
import { shadows } from '@/theme/shadows';
import { useOnboardingStore } from '@/store/onboardingStore';
import { Ionicons } from '@expo/vector-icons';

const SEX_OPTIONS = [
    { value: 'MALE', label: 'Male', icon: 'male' },
    { value: 'FEMALE', label: 'Female', icon: 'female' },
    { value: 'OTHER', label: 'Other', icon: 'person' },
    { value: 'PREFER_NOT_TO_SAY', label: 'Prefer not to say', icon: 'help-circle' },
];

export default function BiologicalDataScreen() {
    const { colors, typography, spacing, borderRadius } = useTheme();
    const router = useRouter();
    const { data, updateData } = useOnboardingStore();

    const [dob, setDob] = useState(data.dateOfBirth || '');
    const [weight, setWeight] = useState(data.weightKg?.toString() || '');
    const [height, setHeight] = useState(data.heightCm?.toString() || '');
    const [sex, setSex] = useState(data.biologicalSex);

    const isValidDob = (value: string): boolean => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
        // Parse at UTC midnight (trailing Z). Without it the string parses at
        // LOCAL midnight, and the toISOString() round-trip below converts to UTC,
        // landing on the PREVIOUS day for users ahead of UTC (e.g. GMT+5) — which
        // made every valid DOB fail and kept Continue disabled.
        const parsed = new Date(`${value}T00:00:00Z`);
        // Reject impossible dates (e.g. 2020-13-40 -> NaN, 2021-02-29 -> rolls over).
        if (Number.isNaN(parsed.getTime())) return false;
        if (value !== parsed.toISOString().slice(0, 10)) return false;
        return parsed.getTime() < Date.now();
    };

    const weightNum = parseFloat(weight);
    const heightNum = parseFloat(height);

    const dobError = dob.length > 0 && !isValidDob(dob)
        ? 'Enter a valid past date as YYYY-MM-DD'
        : undefined;
    const weightError = weight.length > 0 && !(weightNum > 0)
        ? 'Enter a weight greater than 0'
        : undefined;
    const heightError = height.length > 0 && !(heightNum > 0)
        ? 'Enter a height greater than 0'
        : undefined;

    const handleNext = () => {
        updateData({
            dateOfBirth: dob,
            weightKg: parseFloat(weight) || 0,
            heightCm: parseFloat(height) || 0,
            biologicalSex: sex as any,
        });
        router.push('/(onboarding)/shift-type');
    };

    const isValid =
        isValidDob(dob) && weightNum > 0 && heightNum > 0 && !!sex;

    return (
        <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
            <StatusBar style="light" />
            <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing['2xl'] }}>
                <Text style={[typography.display, { color: colors.text.primary, marginBottom: spacing.sm }]}>
                    Your <Text style={{ color: colors.accent.cyan }}>Biological Profile</Text>
                </Text>
                <Text style={[typography.body, { color: colors.text.secondary, marginBottom: spacing['2xl'] }]}>
                    We use this to calculate your personalized macro targets and caloric needs.
                </Text>

                <DateTimeField
                    mode="date"
                    label="Date of Birth"
                    value={dob}
                    onChange={setDob}
                    error={dobError}
                    maximumDate={new Date()}
                />

                <View style={{ height: spacing.md }} />

                <View style={styles.row}>
                    <View style={{ flex: 1 }}>
                        <Input
                            label="Weight (kg)"
                            placeholder="75"
                            value={weight}
                            onChangeText={setWeight}
                            keyboardType="numeric"
                            error={weightError}
                        />
                    </View>
                    <View style={{ width: spacing.md }} />
                    <View style={{ flex: 1 }}>
                        <Input
                            label="Height (cm)"
                            placeholder="180"
                            value={height}
                            onChangeText={setHeight}
                            keyboardType="numeric"
                            error={heightError}
                        />
                    </View>
                </View>

                <View style={{ height: spacing.xl }} />
                <Text style={[typography.overline, { color: colors.text.secondary, marginBottom: spacing.md }]}>
                    Biological Sex
                </Text>

                <GlassCard style={[styles.optionsPanel, { padding: spacing.md, gap: spacing.sm }]}>
                    {SEX_OPTIONS.map((s) => {
                        const isSelected = sex === s.value;
                        return (
                            <TouchableOpacity key={s.value} onPress={() => setSex(sex === s.value ? null : (s.value as any))} activeOpacity={0.85} accessibilityRole="button" accessibilityState={{ selected: isSelected }} accessibilityLabel={s.label}>
                                <Card
                                    variant={isSelected ? 'elevated' : 'glass'}
                                    style={[
                                        styles.optionCard,
                                        isSelected && { borderColor: colors.accent.cyan, borderWidth: 1.5, ...shadows.glow(colors.accent.cyan) }
                                    ]}
                                >
                                    <Ionicons
                                        name={s.icon as any}
                                        size={24}
                                        color={isSelected ? colors.accent.cyan : colors.text.secondary}
                                    />
                                    <Text style={[
                                        typography.subhead,
                                        { color: isSelected ? colors.text.primary : colors.text.secondary, marginLeft: spacing.md }
                                    ]}>
                                        {s.label}
                                    </Text>
                                    {isSelected && <Ionicons name="checkmark-circle" size={20} color={colors.accent.cyan} style={{ marginLeft: 'auto' }} />}
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
    row: {
        flexDirection: 'row',
    },
    optionsPanel: {
        // GlassCard panel wrapping the biological-sex options; per-row Card
        // glow/borders stay intact inside the Aurora frosted container.
    },
    optionCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 18,
    },
    footer: {
        paddingTop: 16,
    }
});
