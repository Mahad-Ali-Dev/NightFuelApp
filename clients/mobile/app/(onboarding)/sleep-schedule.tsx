import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme';
import { CtaButton, DateTimeField, GlassCard } from '@/components/ui';
import { withAlpha } from '@/theme/utils';
import { SelectionChip } from '@/components/SelectionChip';
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

// This screen is the *Lifestyle* step. The onboarding layout's header owns the
// authoritative "STEP X OF N" counter + progress bar (derived from the route
// order, including the FEMALE-only conditional cycle step), so this screen no
// longer renders its own numeric step indicator — it would just duplicate the
// header. The hero keeps the "YOUR LIFESTYLE" overline + display heading only.

export default function LifestyleScreen() {
    const { colors, typography, spacing, borderRadius } = useTheme();
    const router = useRouter();
    const insets = useSafeAreaInsets();
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

    // Field-named copy WITH an explicit recovery path: state the expected
    // format and a concrete 24h example so the fix is obvious (forms guidance:
    // error below the field, with a recovery path).
    const startHourError = startHour.length > 0 && !isValidTime(startHour)
        ? 'Bedtime must be a valid 24h time, e.g. 23:30'
        : undefined;
    const endHourError = endHour.length > 0 && !isValidTime(endHour)
        ? 'Wake up must be a valid 24h time, e.g. 07:00'
        : undefined;

    // NOTE: no screen-level live-region summary here. DateTimeField already
    // renders its OWN role="alert" + polite live-region error text directly
    // below each field (DateTimeField.tsx), so the per-field alerts are the
    // single announcement surface — adding a second summary alert would make a
    // screen reader double-speak the same recovery message.

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

    // ── Premium section scaffolding ──────────────────────────────────────────
    // Single-choice chip group: bold overline label with a leading accent icon,
    // then a wrapping row of lime SelectionChips. Re-tapping the active chip
    // clears it (onSelect(null)) — preserving the original toggle behaviour.
    //
    // Motion: per the skill's "animate only 1–2 KEY elements per view" rule the
    // entrance lives on the hero + the FIRST group only; the remaining groups
    // and lower cards are wrapped in ONE parent Animated.View below, so the
    // screen settles fast and the motion reads as intentional, not a decorative
    // 7-element cascade. `animate` opts a single group into its own entrance.
    const SelectionGroup = ({
        label,
        icon,
        options,
        selected,
        onSelect,
        animate = false,
        delay = 0,
    }: {
        label: string;
        icon: keyof typeof Ionicons.glyphMap;
        options: { value: any; label: string }[];
        selected: any;
        onSelect: (v: any) => void;
        animate?: boolean;
        delay?: number;
    }) => {
        const Container: any = animate ? Animated.View : View;
        const containerProps = animate
            ? { entering: FadeInDown.delay(delay).duration(420).springify() }
            : {};
        return (
            <Container {...containerProps} style={{ marginBottom: spacing['2xl'] }}>
                <View style={styles.sectionLabelRow}>
                    <Ionicons name={icon} size={15} color={colors.accent.coral} style={{ marginRight: spacing.sm }} />
                    <Text style={[typography.overline, { color: colors.text.secondary }]}>{label}</Text>
                </View>
                <View style={styles.chipsWrap}>
                    {options.map((opt) => {
                        const active = selected === opt.value;
                        return (
                            <SelectionChip
                                key={opt.value}
                                label={opt.label}
                                selected={active}
                                accessibilityLabel={opt.label}
                                onPress={() => onSelect(active ? null : opt.value)}
                            />
                        );
                    })}
                </View>
            </Container>
        );
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
            <StatusBar style="light" />
            <ScrollView
                contentContainerStyle={{
                    paddingHorizontal: spacing.xl,
                    paddingTop: spacing.xl,
                    // Reserve clearance >= the floating footer's FULL height so
                    // the last card never hides behind the CTA. Footer ≈
                    // paddingTop(16) + CtaButton lg minHeight(56) + its own
                    // bottom padding (max(insets.bottom, 2xl)); we add a 3xl
                    // breathing gap on top of that.
                    paddingBottom:
                        spacing['3xl'] +
                        spacing.lg +
                        56 +
                        Math.max(insets.bottom, Platform.OS === 'ios' ? spacing['2xl'] : spacing.xl),
                }}
                showsVerticalScrollIndicator={false}
            >
                {/* Hero — the layout header already owns the "STEP X OF N"
                    counter + progress bar, so the hero no longer repeats the
                    numeric step indicator (avoids two competing counters). It
                    keeps only the single overline + large bold display heading
                    (brand signature). */}
                <Animated.View entering={FadeInDown.duration(420)} style={{ marginBottom: spacing['2xl'] }}>
                    <Text style={[typography.overline, { color: colors.accent.coral }]}>
                        YOUR LIFESTYLE
                    </Text>
                    <Text style={[typography.display, { color: colors.text.primary, marginTop: spacing.sm, marginBottom: spacing.sm }]}>
                        How you <Text style={{ color: colors.accent.coral }}>live & work</Text>
                    </Text>
                    <Text style={[typography.body, { color: colors.text.secondary }]}>
                        These signals let us align your meal timing and recovery with how you actually live and work.
                    </Text>
                </Animated.View>

                {/* KEY element #2: only the first group runs its own entrance. */}
                <SelectionGroup animate label="Shift Work Pattern" icon="moon-outline" options={SHIFT_TYPES} selected={shiftType} onSelect={setShiftType} delay={80} />

                {/* Everything below settles as ONE staggered unit (a single
                    Animated.View) rather than a per-section cascade, so the
                    motion reads as intentional. */}
                <Animated.View entering={FadeInDown.delay(140).duration(420).springify()}>
                    <SelectionGroup label="Primary Lifestyle" icon="briefcase-outline" options={LIFESTYLE_TYPES} selected={lifestyle} onSelect={setLifestyle} />
                    <SelectionGroup label="Training Experience" icon="barbell-outline" options={EXPERIENCE_LEVELS} selected={experience} onSelect={setExperience} />
                    <SelectionGroup label="Activity Level" icon="flame-outline" options={ACTIVITY_LEVELS} selected={activity} onSelect={setActivity} />

                    {/* Sleep window — the two native time pickers framed in a glass card. */}
                    <View style={{ marginBottom: spacing['2xl'] }}>
                        <View style={styles.sectionLabelRow}>
                            <Ionicons name="bed-outline" size={15} color={colors.accent.coral} style={{ marginRight: spacing.sm }} />
                            <Text style={[typography.overline, { color: colors.text.secondary }]}>Sleep Window</Text>
                        </View>
                        <GlassCard radius={borderRadius.xl} style={{ padding: spacing.lg }}>
                            <View style={styles.row}>
                                <View style={{ flex: 1 }}>
                                    <DateTimeField mode="time" label="Bedtime" value={startHour} onChange={setStartHour} error={startHourError} />
                                </View>
                                <View style={{ width: spacing.md }} />
                                <View style={{ flex: 1 }}>
                                    <DateTimeField mode="time" label="Wake Up" value={endHour} onChange={setEndHour} error={endHourError} />
                                </View>
                            </View>
                        </GlassCard>
                    </View>

                    {/* Health conditions — OPTIONAL multi-select. The cyan accent
                        marks it as secondary/optional; the inline caption makes
                        that distinction self-evident so colour isn't the only
                        signal of the different treatment. */}
                    <View>
                        <View style={styles.sectionLabelRow}>
                            <Ionicons name="medkit-outline" size={15} color={colors.accent.cyan} style={{ marginRight: spacing.sm }} />
                            <Text style={[typography.overline, { color: colors.text.secondary }]}>Health Conditions</Text>
                            <View style={[styles.optionalPill, { backgroundColor: withAlpha(colors.text.primary, 0.06), borderColor: colors.border.default }]}>
                                <Text style={[typography.caption, { color: colors.text.tertiary, fontSize: 10 }]}>OPTIONAL</Text>
                            </View>
                        </View>
                        <Text style={[typography.caption, { color: colors.text.tertiary, marginTop: -spacing.sm, marginBottom: spacing.md }]}>
                            Used only to tailor recovery — never shared.
                        </Text>
                        <GlassCard radius={borderRadius.xl} style={{ padding: spacing.lg }}>
                            <View style={styles.chipsWrap}>
                                {HEALTH_CONDITIONS.map((opt) => {
                                    const active = conditions.includes(opt.value);
                                    return (
                                        <SelectionChip
                                            key={opt.value}
                                            label={opt.label}
                                            selected={active}
                                            tone="soft"
                                            accent={colors.accent.cyan}
                                            accessibilityLabel={opt.label}
                                            onPress={() => toggleCondition(opt.value)}
                                        />
                                    );
                                })}
                            </View>
                        </GlassCard>
                    </View>
                </Animated.View>
            </ScrollView>

            <View style={[styles.footer, { backgroundColor: withAlpha(colors.background.primary, 0.92), borderTopColor: colors.border.default, paddingHorizontal: spacing.xl, paddingBottom: Math.max(insets.bottom, Platform.OS === 'ios' ? spacing['2xl'] : spacing.xl) }]}>
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
    sectionLabelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    optionalPill: {
        marginLeft: 8,
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 9999,
        borderWidth: 1,
    },
    row: {
        flexDirection: 'row',
    },
    chipsWrap: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
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
