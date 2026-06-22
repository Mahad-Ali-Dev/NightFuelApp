import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme';
import { CtaButton, DateTimeField, GlassCard } from '@/components/ui';
import { shadows } from '@/theme/shadows';
import { withAlpha } from '@/theme/utils';
import { useOnboardingStore } from '@/store/onboardingStore';
import { ShiftType, ActivityLevel, ExperienceLevel, LifestyleType, HealthCondition } from '@/types/enums';
import { isValidTime } from '@/utils/validation';

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

    const startHourError = startHour.length > 0 && !isValidTime(startHour)
        ? 'Enter a valid time as HH:MM'
        : undefined;
    const endHourError = endHour.length > 0 && !isValidTime(endHour)
        ? 'Enter a valid time as HH:MM'
        : undefined;

    // Single live-region summary of whichever sleep-window inline errors are
    // currently active. The DateTimeField renders its OWN color-only per-field
    // error text (no alert role), so this sibling node is the accessible
    // announcement: a polite alert a screen reader speaks when bedtime/wake
    // becomes invalid. Reuses the already-computed *Error strings — no
    // duplicate validation. Mirrors metrics-goals.tsx.
    const validationSummary = [startHourError, endHourError]
        .filter(Boolean)
        .join('. ');

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

    const isValid =
        !!shiftType &&
        !!lifestyle &&
        !!experience &&
        !!activity &&
        isValidTime(startHour) &&
        isValidTime(endHour);

    const SelectionGroup = ({ label, options, selected, onSelect, horizontal = false }: any) => (
        <View style={{ marginBottom: spacing.xl }}>
            <Text style={[typography.overline, { color: colors.text.secondary, marginBottom: spacing.md }]}>{label}</Text>
            <View style={[styles.optionsRow, horizontal && { flexWrap: 'wrap' }]}>
                {options.map((opt: any) => {
                    const active = selected === opt.value;
                    return (
                        <TouchableOpacity
                            key={opt.value}
                            activeOpacity={0.85}
                            onPress={() => onSelect(active ? null : opt.value)}
                            accessibilityRole="button"
                            accessibilityState={{ selected: active }}
                            accessibilityLabel={opt.label}
                            style={[
                                styles.chip,
                                { backgroundColor: colors.background.secondary, borderRadius: borderRadius.full, borderWidth: 1, borderColor: colors.border.default },
                                active && { backgroundColor: colors.accent.coral, borderColor: colors.accent.coral, ...shadows.glow(colors.accent.coral) }
                            ]}
                        >
                            <Text style={[typography.captionMedium, { color: active ? colors.text.primary : colors.text.secondary }]}>
                                {opt.label}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>
        </View>
    );

    return (
        <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
            <StatusBar style="light" />
            <ScrollView contentContainerStyle={{ padding: spacing.xl }}>
                <Text style={[typography.display, { color: colors.text.primary, marginBottom: spacing.sm }]}>
                    Your <Text style={{ color: colors.accent.coral }}>Lifestyle</Text>
                </Text>
                <Text style={[typography.body, { color: colors.text.secondary, marginBottom: spacing['2xl'] }]}>
                    These signals let us align your meal timing and recovery with how you actually live and work.
                </Text>

                <SelectionGroup label="Shift Work Pattern" options={SHIFT_TYPES} selected={shiftType} onSelect={setShiftType} horizontal />
                <SelectionGroup label="Primary Lifestyle" options={LIFESTYLE_TYPES} selected={lifestyle} onSelect={setLifestyle} horizontal />
                <SelectionGroup label="Training Experience" options={EXPERIENCE_LEVELS} selected={experience} onSelect={setExperience} horizontal />
                <SelectionGroup label="Activity Level" options={ACTIVITY_LEVELS} selected={activity} onSelect={setActivity} horizontal />

                <Text style={[typography.overline, { color: colors.text.secondary, marginBottom: spacing.md }]}>Sleep Window</Text>
                <View style={styles.row}>
                    <View style={{ flex: 1 }}>
                        <DateTimeField mode="time" label="Bedtime" value={startHour} onChange={setStartHour} error={startHourError} />
                    </View>
                    <View style={{ width: spacing.md }} />
                    <View style={{ flex: 1 }}>
                        <DateTimeField mode="time" label="Wake Up" value={endHour} onChange={setEndHour} error={endHourError} />
                    </View>
                </View>

                {validationSummary ? (
                    <Text
                        accessible
                        accessibilityRole="alert"
                        accessibilityLiveRegion="polite"
                        accessibilityLabel={validationSummary}
                        style={[
                            typography.caption,
                            { color: colors.error, marginTop: spacing.md },
                        ]}
                    >
                        {validationSummary}
                    </Text>
                ) : null}

                <View style={{ height: spacing.lg }} />

                <Text style={[typography.overline, { color: colors.text.secondary, marginBottom: spacing.md }]}>Health Conditions (Optional)</Text>
                <GlassCard style={[styles.optionsPanel, { padding: spacing.md }]}>
                    <View style={[styles.optionsRow, { flexWrap: 'wrap' }]}>
                        {HEALTH_CONDITIONS.map((opt) => {
                            const active = conditions.includes(opt.value);
                            return (
                                <TouchableOpacity
                                    key={opt.value}
                                    activeOpacity={0.85}
                                    onPress={() => toggleCondition(opt.value)}
                                    accessibilityRole="button"
                                    accessibilityState={{ selected: active }}
                                    accessibilityLabel={opt.label}
                                    style={[
                                        styles.chip,
                                        { backgroundColor: colors.background.secondary, borderRadius: borderRadius.full, borderWidth: 1, borderColor: colors.border.default },
                                        active && { backgroundColor: withAlpha(colors.accent.cyan, 0.16), borderColor: colors.accent.cyan }
                                    ]}
                                >
                                    <Text style={[typography.captionMedium, { color: active ? colors.accent.cyan : colors.text.secondary }]}>
                                        {opt.label}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </GlassCard>

                <View style={{ height: 100 }} />
            </ScrollView>

            <View style={[styles.footer, { backgroundColor: withAlpha(colors.background.primary, 0.92), borderTopColor: colors.border.default, paddingHorizontal: spacing.xl, paddingBottom: Platform.OS === 'ios' ? spacing['3xl'] : spacing['2xl'] }]}>
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
    optionsRow: {
        flexDirection: 'row',
        gap: 8,
    },
    optionsPanel: {
        // GlassCard panel wrapping the health-condition chips; the chips keep
        // their own pill borders/selected fill inside the Aurora frosted panel.
    },
    chip: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        justifyContent: 'center',
        alignItems: 'center',
    },
    footer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        borderTopWidth: StyleSheet.hairlineWidth,
        paddingTop: 16,
    }
});
