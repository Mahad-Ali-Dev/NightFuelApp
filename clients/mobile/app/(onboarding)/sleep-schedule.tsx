import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { useOnboardingStore } from '@/store/onboardingStore';
import { Ionicons } from '@expo/vector-icons';
import { ShiftType, ActivityLevel, ExperienceLevel, LifestyleType, HealthCondition } from '@/types/enums';

const ACTIVITY_LEVELS = [
    { value: ActivityLevel.SEDENTARY, label: 'Sedentary' },
    { value: ActivityLevel.LIGHTLY_ACTIVE, label: 'Light' },
    { value: ActivityLevel.MODERATELY_ACTIVE, label: 'Moderate' },
    { value: ActivityLevel.VERY_ACTIVE, label: 'Very Active' },
    { value: ActivityLevel.EXTREMELY_ACTIVE, label: 'Extreme' },
];

const EXPERIENCE_LEVELS = [
    { value: ExperienceLevel.BEGINNER, label: 'Beginner' },
    { value: ExperienceLevel.INTERMEDIATE, label: 'Intermediate' },
    { value: ExperienceLevel.ADVANCED, label: 'Advanced' },
    { value: ExperienceLevel.ATHLETE, label: 'Athlete' },
];

const LIFESTYLE_TYPES = [
    { value: LifestyleType.NIGHT_SHIFT_WORKER, label: 'Night Shift' },
    { value: LifestyleType.OFFICE_WORKER, label: 'Office/Day' },
    { value: LifestyleType.STUDENT, label: 'Student' },
    { value: LifestyleType.ATHLETE, label: 'Athlete' },
    { value: LifestyleType.FREELANCER, label: 'Freelancer' },
];

const SHIFT_TYPES = [
    { value: ShiftType.FIXED_NIGHT, label: 'Fixed Night' },
    { value: ShiftType.ROTATING, label: 'Rotating' },
    { value: ShiftType.SPLIT, label: 'Split' },
    { value: ShiftType.IRREGULAR, label: 'Irregular' },
];

const HEALTH_CONDITIONS = [
    { value: HealthCondition.ACNE, label: 'Acne' },
    { value: HealthCondition.INJURIES, label: 'Injuries' },
    { value: HealthCondition.ALLERGIES, label: 'Allergies' },
    { value: HealthCondition.DIABETES, label: 'Diabetes' },
    { value: HealthCondition.HYPERTENSION, label: 'Hypertension' },
];

export default function LifestyleScreen() {
    const { colors, typography, spacing, borderRadius } = useTheme();
    const router = useRouter();
    const { data, updateData } = useOnboardingStore();

    const [shiftType, setShiftType] = useState<ShiftType | null>(data.shiftType);
    const [lifestyle, setLifestyle] = useState<LifestyleType | null>(data.lifestyleType);
    const [experience, setExperience] = useState<ExperienceLevel | null>(data.experienceLevel);
    const [activity, setActivity] = useState<ActivityLevel | null>(data.activityLevel);
    const [startHour, setStartHour] = useState(data.sleepWindowStart || '08:00');
    const [endHour, setEndHour] = useState(data.sleepWindowEnd || '16:00');
    const [conditions, setConditions] = useState<HealthCondition[]>(data.healthConditions || []);

    const toggleCondition = (cond: HealthCondition) => {
        if (conditions.includes(cond)) {
            setConditions(conditions.filter(c => c !== cond));
        } else {
            setConditions([...conditions, cond]);
        }
    };

    const handleNext = () => {
        updateData({
            shiftType,
            lifestyleType: lifestyle,
            experienceLevel: experience,
            activityLevel: activity,
            sleepWindowStart: startHour,
            sleepWindowEnd: endHour,
            healthConditions: conditions,
        });
        router.push('/(onboarding)/dietary-needs');
    };

    const isValid = shiftType && lifestyle && experience && activity && startHour && endHour;

    const SelectionGroup = ({ label, options, selected, onSelect, horizontal = false }: any) => (
        <View style={{ marginBottom: spacing.lg }}>
            <Text style={[typography.subhead, { color: colors.text.secondary, marginBottom: spacing.sm }]}>{label}</Text>
            <View style={[styles.optionsRow, horizontal && { flexWrap: 'wrap' }]}>
                {options.map((opt: any) => (
                    <TouchableOpacity
                        key={opt.value}
                        onPress={() => onSelect(opt.value)}
                        style={[
                            styles.chip,
                            { backgroundColor: colors.background.secondary, borderRadius: borderRadius.full },
                            selected === opt.value && { backgroundColor: colors.accent.coral }
                        ]}
                    >
                        <Text style={[typography.caption, { color: selected === opt.value ? '#fff' : colors.text.primary }]}>
                            {opt.label}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>
        </View>
    );

    return (
        <View style={styles.container}>
            <ScrollView contentContainerStyle={{ padding: spacing.xl }}>
                <Text style={[typography.display, { color: colors.text.primary, marginBottom: spacing.sm }]}>
                    Your <Text style={{ color: colors.accent.coral }}>Lifestyle</Text>
                </Text>

                <SelectionGroup label="Shift Work Pattern" options={SHIFT_TYPES} selected={shiftType} onSelect={setShiftType} horizontal />
                <SelectionGroup label="Primary Lifestyle" options={LIFESTYLE_TYPES} selected={lifestyle} onSelect={setLifestyle} horizontal />
                <SelectionGroup label="Training Experience" options={EXPERIENCE_LEVELS} selected={experience} onSelect={setExperience} horizontal />
                <SelectionGroup label="Activity Level" options={ACTIVITY_LEVELS} selected={activity} onSelect={setActivity} horizontal />

                <Text style={[typography.subhead, { color: colors.text.secondary, marginBottom: spacing.sm }]}>Sleep Window</Text>
                <View style={styles.row}>
                    <View style={{ flex: 1 }}>
                        <Input label="Bedtime" placeholder="08:00" value={startHour} onChangeText={setStartHour} />
                    </View>
                    <View style={{ width: spacing.md }} />
                    <View style={{ flex: 1 }}>
                        <Input label="Wake Up" placeholder="16:00" value={endHour} onChangeText={setEndHour} />
                    </View>
                </View>

                <View style={{ height: spacing.lg }} />

                <Text style={[typography.subhead, { color: colors.text.secondary, marginBottom: spacing.sm }]}>Health Conditions (Optional)</Text>
                <View style={[styles.optionsRow, { flexWrap: 'wrap' }]}>
                    {HEALTH_CONDITIONS.map((opt) => (
                        <TouchableOpacity
                            key={opt.value}
                            onPress={() => toggleCondition(opt.value)}
                            style={[
                                styles.chip,
                                { backgroundColor: colors.background.secondary, borderRadius: borderRadius.full },
                                conditions.includes(opt.value) && { backgroundColor: colors.accent.cyan + '40', borderColor: colors.accent.cyan, borderWidth: 1 }
                            ]}
                        >
                            <Text style={[typography.caption, { color: conditions.includes(opt.value) ? colors.accent.cyan : colors.text.primary }]}>
                                {opt.label}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

                <View style={{ height: 100 }} />
            </ScrollView>

            <View style={[styles.footer, { paddingHorizontal: spacing.xl, paddingBottom: Platform.OS === 'ios' ? spacing['3xl'] : spacing['2xl'] }]}>
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
    optionsRow: {
        flexDirection: 'row',
        gap: 8,
    },
    chip: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        justifyContent: 'center',
        alignItems: 'center',
    },
    footer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: 'rgba(0,0,0,0.8)',
        paddingTop: 16,
    }
});
