import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
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

    const handleNext = () => {
        updateData({
            dateOfBirth: dob,
            weightKg: parseFloat(weight) || 0,
            heightCm: parseFloat(height) || 0,
            biologicalSex: sex as any,
        });
        router.push('/(onboarding)/shift-type');
    };

    const isValid = dob && weight && height && sex;

    return (
        <View style={styles.container}>
            <ScrollView contentContainerStyle={{ padding: spacing.xl }}>
                <Text style={[typography.display, { color: colors.text.primary, marginBottom: spacing.sm }]}>
                    Your <Text style={{ color: colors.accent.cyan }}>Biological Profile</Text>
                </Text>
                <Text style={[typography.body, { color: colors.text.secondary, marginBottom: spacing['2xl'] }]}>
                    We use this to calculate your personalized macro targets and caloric needs.
                </Text>

                <Input
                    label="Date of Birth (YYYY-MM-DD)"
                    placeholder="1990-01-01"
                    value={dob}
                    onChangeText={setDob}
                    keyboardType="numeric"
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
                        />
                    </View>
                </View>

                <View style={{ height: spacing.xl }} />
                <Text style={[typography.heading, { color: colors.text.primary, marginBottom: spacing.md }]}>
                    Biological Sex
                </Text>

                <View style={{ gap: spacing.sm }}>
                    {SEX_OPTIONS.map((s) => {
                        const isSelected = sex === s.value;
                        return (
                            <TouchableOpacity key={s.value} onPress={() => setSex(sex === s.value ? null : (s.value as any))} activeOpacity={0.8}>
                                <Card
                                    variant={isSelected ? 'elevated' : 'default'}
                                    style={[
                                        styles.optionCard,
                                        isSelected && { borderColor: colors.accent.cyan, borderWidth: 1 }
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
                </View>
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
    row: {
        flexDirection: 'row',
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
