import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Switch, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme';
import { CtaButton, DateTimeField, GlassCard } from '@/components/ui';
import { withAlpha } from '@/theme/utils';
import { useOnboardingStore } from '@/store/onboardingStore';
import { Ionicons } from '@expo/vector-icons';
import {
    SectionLabel,
    ToggleRow,
    CycleLengthField,
    RegularityCard,
} from '@/components/CycleBasicsParts';

// Regularity options. UNKNOWN is a first-class, non-judgmental answer — the app
// just TRACKS in that case (and on hormonal contraception), it never fabricates
// a phase. REGULAR/IRREGULAR/UNKNOWN are the exact strings the F25 backend
// accepts (cycleRegularity).
const REGULARITY_OPTIONS = [
    { value: 'REGULAR', label: 'Regular', description: 'My cycle is fairly predictable', icon: 'checkmark-circle' },
    { value: 'IRREGULAR', label: 'Irregular', description: 'My cycle varies a lot', icon: 'shuffle' },
    { value: 'UNKNOWN', label: 'Not sure', description: "I'd rather just track for now", icon: 'help-circle' },
] as const;

// Hard caps on the raw characters the numeric length TextInputs accept. Backend
// ranges are avgCycleLengthDays 21-45 and avgPeriodLengthDays 1-10 — both at
// most two digits — so a 2-char cap stops a paste of an arbitrarily long string.
// The cap is passed additively through the shared Input's ...props spread; the
// shared Input is NOT modified.
export const CYCLE_LENGTH_MAX_LENGTH = 2;

// This is the CONDITIONAL FEMALE-only cycle step, inserted by metrics-goals
// between "About you" and "Your goal". The canonical "STEP X OF N" + progress
// bar is owned by the onboarding layout header (app/(onboarding)/_layout.tsx)
// and derived from the shared getOnboardingStep util — this screen deliberately
// does NOT render its own numeric step indicator, so the two can never disagree.

export default function CycleBasicsScreen() {
    const { colors, typography, spacing, borderRadius } = useTheme();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { data, updateData } = useOnboardingStore();

    const [enabled, setEnabled] = useState<boolean>(data.cycleTrackingEnabled ?? false);
    const [lastPeriod, setLastPeriod] = useState(data.lastPeriodStartDate || '');
    const [cycleLen, setCycleLen] = useState(data.avgCycleLengthDays?.toString() || '');
    const [periodLen, setPeriodLen] = useState(data.avgPeriodLengthDays?.toString() || '');
    const [regularity, setRegularity] = useState<'REGULAR' | 'IRREGULAR' | 'UNKNOWN' | null>(
        data.cycleRegularity ?? null,
    );
    const [hormonal, setHormonal] = useState<boolean>(data.hormonalContraception ?? false);

    const isValidYmd = (value: string): boolean => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
        // Parse at UTC midnight (trailing Z) so the toISOString() round-trip
        // doesn't shift to the previous day for users ahead of UTC — mirrors the
        // DOB guard in metrics-goals.tsx.
        const parsed = new Date(`${value}T00:00:00Z`);
        if (Number.isNaN(parsed.getTime())) return false;
        if (value !== parsed.toISOString().slice(0, 10)) return false;
        return parsed.getTime() <= Date.now();
    };

    const cycleNum = parseInt(cycleLen, 10);
    const periodNum = parseInt(periodLen, 10);

    // Inline validation only matters when tracking is ON. Empty fields are NOT
    // errors (they fall back to the backend defaults), so we only flag values the
    // user typed that fall outside the backend range.
    const lastPeriodError = enabled && lastPeriod.length > 0 && !isValidYmd(lastPeriod)
        ? 'Enter a valid past date as YYYY-MM-DD'
        : undefined;
    const cycleError = enabled && cycleLen.length > 0 && !(cycleNum >= 21 && cycleNum <= 45)
        ? 'Cycle length is usually 21-45 days'
        : undefined;
    const periodError = enabled && periodLen.length > 0 && !(periodNum >= 1 && periodNum <= 10)
        ? 'Period length is usually 1-10 days'
        : undefined;

    // Single polite live-region summary of the active inline errors (the shared
    // Input renders its own per-field error <Text> with no alert role; this
    // sibling node is the screen-reader announcement). Mirrors metrics-goals.tsx.
    const validationSummary = [lastPeriodError, cycleError, periodError]
        .filter(Boolean)
        .join('. ');

    const handleNext = () => {
        if (enabled) {
            // Persist what the user provided; leave untouched fields null so the
            // backend applies its defaults (28 / 5). Only collect the F25 fields.
            updateData({
                cycleTrackingEnabled: true,
                lastPeriodStartDate: lastPeriod.length > 0 ? lastPeriod : null,
                avgCycleLengthDays: Number.isNaN(cycleNum) ? null : cycleNum,
                avgPeriodLengthDays: Number.isNaN(periodNum) ? null : periodNum,
                cycleRegularity: regularity,
                hormonalContraception: hormonal,
            });
        } else {
            // Skippable: tracking off → record the opt-out and clear any fields a
            // user may have typed before toggling tracking back off.
            updateData({
                cycleTrackingEnabled: false,
                lastPeriodStartDate: null,
                avgCycleLengthDays: null,
                avgPeriodLengthDays: null,
                cycleRegularity: null,
                hormonalContraception: false,
            });
        }
        router.push('/(onboarding)/shift-type');
    };

    // Continue is ALWAYS enabled — the step is opt-in and skippable. Even when
    // tracking is on, all detail fields fall back to backend defaults, so there
    // is nothing to gate on. If a typed value is out of range we STILL allow
    // continue and rely on the inline live-region alert (validationSummary) to
    // communicate it: an out-of-range typed value is surfaced there, not sent.
    // (handleNext only persists a parsed numeric when it is a real number; the
    // store/backend ranges remain the final guard.) Keeping the CTA enabled here
    // matches this comment and avoids the low-contrast ink-on-dim-lime disabled
    // state with no reason shown at the button.

    const bottomPad = Math.max(insets.bottom, Platform.OS === 'ios' ? spacing['2xl'] : spacing.xl);

    return (
        <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
            <StatusBar style="light" />
            <ScrollView
                contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingTop: spacing.xl, paddingBottom: spacing['5xl'] }}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
            >
                {/* Hero — display heading (brand signature). No in-screen step
                    numeral: the canonical "STEP X OF N" + progress bar lives in the
                    layout header so the two progress systems can never desync. The
                    lime here is the SOFTENED primary (coralDark), minimal glow. */}
                <Animated.View entering={FadeInDown.duration(420)} style={{ marginBottom: spacing.xl }}>
                    <Text style={[typography.overline, { color: colors.accent.coralDark, marginBottom: spacing.sm }]}>
                        OPTIONAL
                    </Text>
                    <Text style={[typography.display, { color: colors.text.primary, marginBottom: spacing.sm }]}>
                        Cycle <Text style={{ color: colors.accent.coralDark }}>tracking</Text>
                    </Text>
                    <Text style={[typography.body, { color: colors.text.secondary }]}>
                        Turn this on and Zeitra can show an estimate of your current cycle phase. It is entirely optional — you can skip it and continue.
                    </Text>
                </Animated.View>

                {/* Wellness-estimate disclaimer — plain, non-judgmental, always visible. */}
                <Animated.View entering={FadeInDown.delay(70).duration(420).springify()} style={{ marginBottom: spacing.lg }}>
                    <GlassCard
                        radius={borderRadius.lg}
                        style={[styles.disclaimer, { borderColor: withAlpha(colors.accent.coral, 0.22) }]}
                    >
                        <View style={styles.disclaimerRow}>
                            <Ionicons name="shield-checkmark-outline" size={18} color={colors.accent.coral} />
                            <Text style={[typography.caption, { color: colors.text.secondary, flex: 1, marginLeft: spacing.sm }]}>
                                This is a wellness estimate, not medical advice. Your data stays private.
                            </Text>
                        </View>
                    </GlassCard>
                </Animated.View>

                {/* OPT-IN toggle. Default off. */}
                <Animated.View entering={FadeInDown.delay(130).duration(420).springify()}>
                    <GlassCard
                        radius={borderRadius.xl}
                        glow={enabled ? colors.accent.coral : undefined}
                        style={[
                            styles.optInCard,
                            { borderColor: enabled ? withAlpha(colors.accent.coral, 0.5) : withAlpha(colors.text.primary, 0.1) },
                        ]}
                    >
                        <View style={{ padding: spacing.lg }}>
                            <ToggleRow
                                title="Enable cycle tracking"
                                caption="Off by default. Turn on to add the optional details below."
                                control={
                                    <Switch
                                        value={enabled}
                                        onValueChange={setEnabled}
                                        accessibilityLabel="Enable cycle tracking"
                                        accessibilityRole="switch"
                                        trackColor={{ false: colors.border.default, true: colors.accent.coral }}
                                        thumbColor={colors.text.primary}
                                        ios_backgroundColor={colors.border.default}
                                    />
                                }
                            />
                        </View>
                    </GlassCard>
                </Animated.View>

                {enabled ? (
                    <View>
                        {/* Last period — framed in glass to match the input language. */}
                        <Animated.View entering={FadeInDown.delay(190).duration(380).springify()} style={{ marginTop: spacing.xl }}>
                            <SectionLabel icon="calendar-outline" label="Last Period" />
                            <GlassCard radius={borderRadius.xl} style={{ padding: spacing.lg }}>
                                {/* Field label rendered here (not via DateTimeField's own
                                    20px heading) so it shares the 15px bodyMedium weight of
                                    the CycleLengthField labels — one label scale per step. */}
                                <Text style={[typography.bodyMedium, { color: colors.text.secondary, marginBottom: spacing.sm }]}>
                                    First day of your last period
                                </Text>
                                <DateTimeField
                                    mode="date"
                                    value={lastPeriod}
                                    onChange={setLastPeriod}
                                    error={lastPeriodError}
                                    maximumDate={new Date()}
                                    accessibilityLabel="First day of your last period"
                                />
                            </GlassCard>
                        </Animated.View>

                        {/* Cycle + period lengths — two big tabular numeric fields. */}
                        <Animated.View entering={FadeInDown.delay(250).duration(380).springify()} style={{ marginTop: spacing.xl }}>
                            <SectionLabel icon="repeat-outline" label="Typical Lengths" />
                            <GlassCard radius={borderRadius.xl} style={{ padding: spacing.lg }}>
                                <View style={styles.row}>
                                    <CycleLengthField
                                        label="Cycle length"
                                        accessibilityLabel="Avg cycle length (days)"
                                        placeholder="28"
                                        value={cycleLen}
                                        onChangeText={setCycleLen}
                                        maxLength={CYCLE_LENGTH_MAX_LENGTH}
                                        error={cycleError}
                                    />
                                    <View style={{ width: spacing.md }} />
                                    <CycleLengthField
                                        label="Period length"
                                        accessibilityLabel="Avg period length (days)"
                                        placeholder="5"
                                        value={periodLen}
                                        onChangeText={setPeriodLen}
                                        maxLength={CYCLE_LENGTH_MAX_LENGTH}
                                        error={periodError}
                                    />
                                </View>
                            </GlassCard>
                        </Animated.View>

                        {/* Regularity — premium selection cards (track-first, no judgment). */}
                        <Animated.View entering={FadeInDown.delay(310).duration(380).springify()} style={{ marginTop: spacing.xl }}>
                            <SectionLabel icon="pulse-outline" label="How regular is your cycle?" />
                            <View style={{ gap: spacing.sm }}>
                                {REGULARITY_OPTIONS.map((opt) => (
                                    <RegularityCard
                                        key={opt.value}
                                        label={opt.label}
                                        description={opt.description}
                                        icon={opt.icon as keyof typeof Ionicons.glyphMap}
                                        selected={regularity === opt.value}
                                        onPress={() => setRegularity(regularity === opt.value ? null : opt.value)}
                                    />
                                ))}
                            </View>
                        </Animated.View>

                        {/* Hormonal contraception — when on, we just track (no phase est). */}
                        <Animated.View entering={FadeInDown.delay(370).duration(380).springify()} style={{ marginTop: spacing.xl }}>
                            <GlassCard radius={borderRadius.xl} style={styles.optInCard}>
                                <View style={{ padding: spacing.lg }}>
                                    <ToggleRow
                                        title="Hormonal contraception"
                                        caption="If you use it, we just track — no phase estimate is shown."
                                        control={
                                            <Switch
                                                value={hormonal}
                                                onValueChange={setHormonal}
                                                accessibilityLabel="Hormonal contraception"
                                                accessibilityRole="switch"
                                                trackColor={{ false: colors.border.default, true: colors.accent.coral }}
                                                thumbColor={colors.text.primary}
                                                ios_backgroundColor={colors.border.default}
                                            />
                                        }
                                    />
                                </View>
                            </GlassCard>
                        </Animated.View>

                        {validationSummary ? (
                            <Text
                                accessible
                                accessibilityRole="alert"
                                accessibilityLiveRegion="polite"
                                accessibilityLabel={validationSummary}
                                style={[typography.caption, { color: colors.error, marginTop: spacing.lg }]}
                            >
                                {validationSummary}
                            </Text>
                        ) : null}
                    </View>
                ) : null}
            </ScrollView>

            <View
                style={[
                    styles.footer,
                    {
                        backgroundColor: withAlpha(colors.background.primary, 0.92),
                        borderTopColor: colors.border.default,
                        paddingHorizontal: spacing.xl,
                        paddingBottom: bottomPad,
                    },
                ]}
            >
                <CtaButton
                    label="Continue"
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
    row: {
        flexDirection: 'row',
    },
    disclaimer: {
        borderWidth: 1,
        padding: 14,
    },
    disclaimerRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    optInCard: {
        // GlassCard frosted container for the opt-in / hormonal toggle rows.
    },
    footer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        borderTopWidth: StyleSheet.hairlineWidth,
        paddingTop: 16,
    },
});
