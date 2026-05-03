import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useOnboardingStore } from '@/store/onboardingStore';
import { DietaryPreference, DietMode } from '@/types/enums';
import { Ionicons } from '@expo/vector-icons';

const PREFERENCES = [
    { value: DietaryPreference.NONE, label: 'No Restrictions', icon: 'restaurant' },
    { value: DietaryPreference.VEGETARIAN, label: 'Vegetarian', icon: 'leaf' },
    { value: DietaryPreference.VEGAN, label: 'Vegan', icon: 'nutrition' },
    { value: DietaryPreference.KETO, label: 'Keto', icon: 'apps' },
    { value: DietaryPreference.HALAL, label: 'Halal', icon: 'moon' },
    { value: DietaryPreference.GLUTEN_FREE, label: 'Gluten Free', icon: 'close-circle' },
];

const MODES = [
    { value: DietMode.BALANCED, label: 'Balanced', description: 'Standard healthy focus' },
    { value: DietMode.MASS_GAIN, label: 'Mass Gain', description: 'Surplus for building' },
    { value: DietMode.CUTTING, label: 'Cutting', description: 'Deficit for fat loss' },
    { value: DietMode.BUDGET, label: 'Budget', description: 'Walllet friendly meals' },
    { value: DietMode.ACNE_SAFE, label: 'Acne Safe', description: 'Skin health focus' },
    { value: DietMode.RAMADAN, label: 'Ramadan', description: 'Fasting friendly' },
];

export default function NutritionScreen() {
    const { colors, typography, spacing } = useTheme();
    const router = useRouter();
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

    return (
        <View style={styles.container}>
            <ScrollView contentContainerStyle={{ padding: spacing.xl }}>
                <Text style={[typography.display, { color: colors.text.primary, marginBottom: spacing.sm }]}>
                    Your <Text style={{ color: colors.accent.cyan }}>Nutrition</Text>
                </Text>

                <Text style={[typography.heading, { color: colors.text.primary, marginTop: spacing.md, marginBottom: spacing.md }]}>
                    Dietary Preference
                </Text>
                <View style={{ gap: spacing.sm }}>
                    {PREFERENCES.map((d) => {
                        const isSelected = preference === d.value;
                        return (
                            <TouchableOpacity key={d.value} onPress={() => setPreference(d.value as DietaryPreference)} activeOpacity={0.8}>
                                <Card
                                    variant={isSelected ? 'elevated' : 'default'}
                                    style={[
                                        styles.optionCard,
                                        isSelected && { borderColor: colors.accent.cyan, borderWidth: 1 }
                                    ]}
                                >
                                    <Ionicons name={d.icon as any} size={20} color={isSelected ? colors.accent.cyan : colors.text.secondary} />
                                    <Text style={[typography.subhead, { color: isSelected ? colors.text.primary : colors.text.secondary, marginLeft: spacing.md }]}>
                                        {d.label}
                                    </Text>
                                    {isSelected && <Ionicons name="checkmark-circle" size={24} color={colors.accent.cyan} style={{ marginLeft: 'auto' }} />}
                                </Card>
                            </TouchableOpacity>
                        )
                    })}
                </View>

                <Text style={[typography.heading, { color: colors.text.primary, marginTop: spacing.xl, marginBottom: spacing.md }]}>
                    Diet Mode
                </Text>
                <View style={{ gap: spacing.sm }}>
                    {MODES.map((m) => {
                        const isSelected = mode === m.value;
                        return (
                            <TouchableOpacity key={m.value} onPress={() => setMode(m.value as DietMode)} activeOpacity={0.8}>
                                <Card
                                    variant={isSelected ? 'elevated' : 'default'}
                                    style={[
                                        styles.optionCard,
                                        isSelected && { borderColor: colors.accent.cyan, borderWidth: 1 }
                                    ]}
                                >
                                    <View>
                                        <Text style={[typography.subhead, { color: isSelected ? colors.text.primary : colors.text.secondary }]}>
                                            {m.label}
                                        </Text>
                                        <Text style={[typography.caption, { color: colors.text.secondary }]}>
                                            {m.description}
                                        </Text>
                                    </View>
                                    {isSelected && <Ionicons name="checkmark-circle" size={24} color={colors.accent.cyan} style={{ marginLeft: 'auto' }} />}
                                </Card>
                            </TouchableOpacity>
                        )
                    })}
                </View>

                <View style={{ height: 100 }} />
            </ScrollView>

            <View style={[styles.footer, { paddingHorizontal: spacing.xl, paddingBottom: spacing['2xl'] }]}>
                <Button
                    title="Continue"
                    iconRight={<Ionicons name="arrow-forward" size={20} color="#fff" />}
                    onPress={handleNext}
                    disabled={!isValid}
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
    optionCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
    },
    footer: {
        paddingTop: 16,
    }
});
