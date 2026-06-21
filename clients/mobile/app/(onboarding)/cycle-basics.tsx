import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme';
import { Input } from '@/components/ui/Input';
import { CtaButton, DateTimeField, GlassCard } from '@/components/ui';
import { Card } from '@/components/ui/Card';
import { shadows } from '@/theme/shadows';
import { withAlpha } from '@/theme/utils';
import { useOnboardingStore } from '@/store/onboardingStore';
import { Ionicons } from '@expo/vector-icons';

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

export default function CycleBasicsScreen() {
    const { colors, typography, spacing } = useTheme();
    const router = useRouter();
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
    // is nothing to gate on. (If a typed value is out of range we still allow
    // continue: the inline alert communicates it, and the value persists as-is
    // only when within range — out-of-range typed values are surfaced, not sent.)
    const blockingError = enabled && Boolean(lastPeriodError || cycleError || periodError);

    return (
        <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
            <StatusBar style="light" />
            <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing['2xl'] }}>
                <Text style={[typography.display, { color: colors.text.primary, marginBottom: spacing.sm }]}>
                    Cycle <Text style={{ color: colors.accent.coral }}>tracking</Text>
                </Text>
                <Text style={[typography.body, { color: colors.text.secondary, marginBottom: spacing.xl }]}>
                    Optional. If you turn this on, Zeitra can show an estimate of your current cycle phase. You can skip this and continue without it.
                </Text>

                {/* Wellness-estimate disclaimer — plain, non-judgmental, always visible. */}
                <GlassCard
                    radius={16}
                    style={[styles.disclaimer, { borderColor: withAlpha(colors.accent.coral, 0.22) }]}
                >
                    <View style={styles.disclaimerRow}>
                        <Ionicons name="information-circle-outline" size={18} color={colors.accent.coral} />
                        <Text style={[typography.caption, { color: colors.text.secondary, flex: 1, marginLeft: spacing.sm }]}>
                            This is a wellness estimate, not medical advice.
                        </Text>
                    </View>
                </GlassCard>

                {/* OPT-IN toggle. Default off. */}
                <GlassCard radius={16} style={[styles.toggleCard, { padding: spacing.md }]}>
                    <View style={styles.toggleRow}>
                        <View style={{ flex: 1, marginRight: spacing.md }}>
                            <Text style={[typography.heading, { color: colors.text.primary }]}>Enable cycle tracking</Text>
                            <Text style={[typography.caption, { color: colors.text.secondary }]}>
                                Off by default. Turn on to add the optional details below.
                            </Text>
                        </View>
                        <Switch
                            value={enabled}
                            onValueChange={setEnabled}
                            accessibilityLabel="Enable cycle tracking"
                            accessibilityRole="switch"
                            trackColor={{ false: colors.border.default, true: colors.accent.coral }}
                            thumbColor={colors.text.primary}
                        />
                    </View>
                </GlassCard>

                {enabled ? (
                    <View>
                        <View style={{ height: spacing.xl }} />
                        <DateTimeField
                            mode="date"
                            label="First day of your last period"
                            value={lastPeriod}
                            onChange={setLastPeriod}
                            error={lastPeriodError}
                            maximumDate={new Date()}
                        />

                        <View style={{ height: spacing.md }} />

                        <View style={styles.row}>
                            <View style={{ flex: 1 }}>
                                <Input
                                    label="Avg cycle length (days)"
                                    accessibilityLabel="Avg cycle length (days)"
                                    placeholder="28"
                                    value={cycleLen}
                                    onChangeText={setCycleLen}
                                    keyboardType="numeric"
                                    maxLength={CYCLE_LENGTH_MAX_LENGTH}
                                    error={cycleError}
                                />
                            </View>
                            <View style={{ width: spacing.md }} />
                            <View style={{ flex: 1 }}>
                                <Input
                                    label="Avg period length (days)"
                                    accessibilityLabel="Avg period length (days)"
                                    placeholder="5"
                                    value={periodLen}
                                    onChangeText={setPeriodLen}
                                    keyboardType="numeric"
                                    maxLength={CYCLE_LENGTH_MAX_LENGTH}
                                    error={periodError}
                                />
                            </View>
                        </View>

                        <View style={{ height: spacing.xl }} />
                        <Text style={[typography.overline, { color: colors.text.secondary, marginBottom: spacing.md }]}>
                            How regular is your cycle?
                        </Text>

                        <GlassCard style={[styles.optionsPanel, { padding: spacing.md, gap: spacing.sm }]}>
                            {REGULARITY_OPTIONS.map((opt) => {
                                const isSelected = regularity === opt.value;
                                return (
                                    <TouchableOpacity
                                        key={opt.value}
                                        activeOpacity={0.85}
                                        onPress={() => setRegularity(regularity === opt.value ? null : opt.value)}
                                        accessibilityRole="button"
                                        accessibilityState={{ selected: isSelected }}
                                        accessibilityLabel={opt.label}
                                    >
                                        <Card
                                            variant={isSelected ? 'elevated' : 'glass'}
                                            style={[
                                                styles.optionCard,
                                                isSelected && { borderColor: colors.accent.coral, borderWidth: 1.5, ...shadows.glow(colors.accent.coral) },
                                            ]}
                                        >
                                            <Ionicons
                                                name={opt.icon as any}
                                                size={22}
                                                color={isSelected ? colors.accent.coral : colors.text.secondary}
                                            />
                                            <View style={{ marginLeft: spacing.md, flex: 1 }}>
                                                <Text style={[typography.subhead, { color: isSelected ? colors.text.primary : colors.text.secondary }]}>
                                                    {opt.label}
                                                </Text>
                                                <Text style={[typography.caption, { color: colors.text.secondary }]}>
                                                    {opt.description}
                                                </Text>
                                            </View>
                                            {isSelected && <Ionicons name="checkmark-circle" size={20} color={colors.accent.coral} />}
                                        </Card>
                                    </TouchableOpacity>
                                );
                            })}
                        </GlassCard>

                        <View style={{ height: spacing.xl }} />
                        <GlassCard radius={16} style={[styles.toggleCard, { padding: spacing.md }]}>
                            <View style={styles.toggleRow}>
                                <View style={{ flex: 1, marginRight: spacing.md }}>
                                    <Text style={[typography.heading, { color: colors.text.primary }]}>Hormonal contraception</Text>
                                    <Text style={[typography.caption, { color: colors.text.secondary }]}>
                                        If you use it, we just track — no phase estimate is shown.
                                    </Text>
                                </View>
                                <Switch
                                    value={hormonal}
                                    onValueChange={setHormonal}
                                    accessibilityLabel="Hormonal contraception"
                                    accessibilityRole="switch"
                                    trackColor={{ false: colors.border.default, true: colors.accent.coral }}
                                    thumbColor={colors.text.primary}
                                />
                            </View>
                        </GlassCard>

                        {validationSummary ? (
                            <Text
                                accessible
                                accessibilityRole="alert"
                                accessibilityLiveRegion="polite"
                                accessibilityLabel={validationSummary}
                                style={[typography.caption, { color: colors.error, marginTop: spacing.md }]}
                            >
                                {validationSummary}
                            </Text>
                        ) : null}
                    </View>
                ) : null}
            </ScrollView>

            <View style={[styles.footer, { paddingHorizontal: spacing.xl, paddingBottom: spacing['2xl'] }]}>
                <CtaButton
                    label="Continue"
                    size="lg"
                    onPress={handleNext}
                    disabled={blockingError}
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
        marginBottom: 16,
    },
    disclaimerRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    toggleCard: {
        // GlassCard frosted container for the opt-in / hormonal toggles.
    },
    toggleRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    optionsPanel: {
        // GlassCard panel wrapping the regularity options; per-row Card
        // glow/borders stay intact inside the Aurora frosted container.
    },
    optionCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
    },
    footer: {
        paddingTop: 16,
    },
});
