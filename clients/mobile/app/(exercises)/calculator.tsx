import React, { useState, useMemo, useEffect } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
    KeyboardAvoidingView, Platform, Dimensions
} from 'react-native';

import { useRouter } from 'expo-router';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { logOneRepMax } from '@/api/exercises';
import { GlassCard, CtaButton } from '@/components/ui';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { shadows } from '@/theme/shadows';
import { withAlpha } from '@/theme/utils';

const { width } = Dimensions.get('window');

// ─── Formulas ───────────────────────────────────────────────────────────────

const formulas = {
    epley: (w: number, r: number) => w * (1 + r / 30),
    brzycki: (w: number, r: number) => w * (36 / (37 - r)),
    lander: (w: number, r: number) => (100 * w) / (101.3 - 2.67123 * r),
};

// Collapse a non-finite or non-positive formula output to 0, rounding finite
// positives. The Brzycki denominator (37 - r) hits 0 at reps=37 (→ Infinity) and
// goes negative for reps > 37; the Lander denominator (101.3 - 2.67123·r) crosses
// 0 near reps ≈ 38 likewise. Without this, those raw Infinity / negative values
// render verbatim in the giant 1RM numeral, the formula-selector chips and every
// zone-table row (estimated1RM × pct / 100). `safe` is the single chokepoint so a
// non-finite estimate can never leak into the tree as 'Infinity' / 'NaN' / a
// negative — it stays a finite integer ≥ 0. Behaviour-preserving for valid reps
// (a finite positive rounds exactly as Math.round did before).
const safe = (x: number): number => (Number.isFinite(x) && x > 0 ? Math.round(x) : 0);

const ZONES = [
    { pct: 100, label: 'Max Power', reps: '1' },
    { pct: 95, label: 'Power', reps: '2' },
    { pct: 90, label: 'Power/Strength', reps: '3' },
    { pct: 85, label: 'Strength', reps: '5' },
    { pct: 80, label: 'Strength/Hypertrophy', reps: '7-8' },
    { pct: 75, label: 'Hypertrophy', reps: '10' },
    { pct: 70, label: 'Hypertrophy/Endurance', reps: '12-15' },
    { pct: 60, label: 'Endurance', reps: '20+' },
];

export default function CalculatorScreen() {
    const { colors, typography, spacing, borderRadius } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const queryClient = useQueryClient();

    const [weight, setWeight] = useState('100');
    const [reps, setReps] = useState('5');
    const [exerciseName, setExerciseName] = useState('');
    const [activeFormula, setActiveFormula] = useState<keyof typeof formulas>('epley');

    const w = parseFloat(weight) || 0;
    const r = parseInt(reps) || 0;

    const results = useMemo(() => {
        if (w <= 0 || r <= 0) return { epley: 0, brzycki: 0, lander: 0 };
        if (r === 1) return { epley: w, brzycki: w, lander: w };
        // Route every formula through `safe`: at reps ≥ 37 the Brzycki/Lander
        // denominators reach ≤ 0, yielding Infinity / negative — `safe` collapses
        // those to 0 while rounding finite positives exactly as before.
        return {
            epley: safe(formulas.epley(w, r)),
            brzycki: safe(formulas.brzycki(w, r)),
            lander: safe(formulas.lander(w, r)),
        };
    }, [w, r]);

    const estimated1RM = results[activeFormula];

    const saveMutation = useMutation({
        mutationFn: () => logOneRepMax({
            exerciseName: exerciseName || 'Bench Press',
            weightKg: w,
            estimated1RMKg: estimated1RM,
        }),
        onSuccess: () => {
            // The 1RM list is read under two distinct query keys: ['exercise-1rm']
            // (analytics screen) and ['workout-1rm'] (useWorkout hook). Invalidate
            // both so the saved record refreshes everywhere it's shown. The "Saved"
            // status + the dismiss-by-navigation are now driven off the mutation's
            // own success state (the inline surface below + the effect), not a
            // modal alert dialog — keeping the single source of truth in saveMutation.
            queryClient.invalidateQueries({ queryKey: ['exercise-1rm'] });
            queryClient.invalidateQueries({ queryKey: ['workout-1rm'] });
        },
    });

    // Surface copy derived from the mutation's status (the single source of truth)
    // — no modal alert dialog. The error body mirrors the message the old onError
    // pulled from the rejection; the success copy mirrors the old "Saved" alert.
    const saveError = saveMutation.error as any;
    const saveErrorMessage =
        saveError?.response?.data?.message ?? saveError?.message ?? 'Something went wrong';

    // Pop back to the records list once the save lands. Done in an effect (not in
    // onSuccess) so the inline "Saved" status renders for a frame and the navigate
    // stays genuinely wired to saveMutation.isSuccess — the ground truth.
    useEffect(() => {
        if (saveMutation.isSuccess) {
            router.back();
        }
    }, [saveMutation.isSuccess, router]);

    return (
        <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
            <StatusBar style="light" />
            {/* Header */}
            <View style={[styles.header, { paddingTop: insets.top, borderBottomColor: colors.border.default }]}>
                <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
                </TouchableOpacity>
                <Text style={[typography.heading, { color: colors.text.primary, fontSize: 18 }]}>1RM Calculator</Text>
                <View style={{ width: 40 }} />
            </View>

            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={{ flex: 1 }}
            >
                <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 100 }}>
                    {/* Input Card */}
                    <GlassCard intensity={40} radius={borderRadius['2xl']}>
                      <View style={styles.card}>
                        <View style={styles.inputRow}>
                            <View style={styles.inputStack}>
                                <Text style={[typography.caption, { color: colors.text.secondary, marginBottom: 8 }]}>WEIGHT (KG)</Text>
                                <TextInput
                                    style={[styles.input, { color: colors.text.primary, backgroundColor: colors.background.tertiary, borderRadius: borderRadius.xl }]}
                                    keyboardType="numeric"
                                    value={weight}
                                    onChangeText={setWeight}
                                    placeholder="0"
                                    placeholderTextColor={colors.text.tertiary}
                                />
                            </View>
                            <View style={styles.inputStack}>
                                <Text style={[typography.caption, { color: colors.text.secondary, marginBottom: 8 }]}>REPS</Text>
                                <TextInput
                                    style={[styles.input, { color: colors.text.primary, backgroundColor: colors.background.tertiary, borderRadius: borderRadius.xl }]}
                                    keyboardType="numeric"
                                    value={reps}
                                    onChangeText={setReps}
                                    placeholder="0"
                                    placeholderTextColor={colors.text.tertiary}
                                />
                            </View>
                        </View>

                        <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 16, marginBottom: 8 }]}>EXERCISE</Text>
                        <TextInput
                            style={[styles.input, { color: colors.text.primary, backgroundColor: colors.background.tertiary, borderRadius: borderRadius.xl }]}
                            value={exerciseName}
                            onChangeText={setExerciseName}
                            placeholder="e.g. Bench Press"
                            placeholderTextColor={colors.text.tertiary}
                        />
                      </View>
                    </GlassCard>

                    {/* Result Circle */}
                    <View style={styles.resultContainer}>
                        <LinearGradient
                            colors={colors.gradients.coral}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={[styles.resultRing, shadows.glow(colors.accent.coral)]}
                        >
                            <View style={[styles.resultCircle, { backgroundColor: colors.background.secondary }]}>
                                <Text style={[typography.overline, { color: colors.text.secondary }]}>ESTIMATED 1RM</Text>
                                <Text style={[typography.statLarge, { color: colors.text.primary, marginVertical: 4 }]}>
                                    {estimated1RM}
                                </Text>
                                <Text style={[typography.subhead, { color: colors.text.secondary, fontWeight: 'bold' }]}>KILOGRAMS</Text>
                            </View>
                        </LinearGradient>
                    </View>

                    {/* Formula Selector */}
                    <View style={[styles.formulaRow, { backgroundColor: colors.background.tertiary, borderRadius: borderRadius.xl }]}>
                        {(Object.keys(formulas) as Array<keyof typeof formulas>).map(f => (
                            <TouchableOpacity
                                key={f}
                                onPress={() => setActiveFormula(f)}
                                activeOpacity={0.85}
                                accessibilityRole="button"
                                accessibilityState={{ selected: activeFormula === f }}
                                accessibilityLabel={`${f} formula`}
                                style={[styles.formulaBtn, activeFormula === f && { backgroundColor: withAlpha(colors.accent.coral, 0.18), borderRadius: borderRadius.lg, borderWidth: 1, borderColor: withAlpha(colors.accent.coral, 0.4) }]}
                            >
                                <Text style={[styles.formulaText, { color: activeFormula === f ? colors.accent.coral : colors.text.tertiary }]}>
                                    {f.toUpperCase()}
                                </Text>
                                <Text style={[styles.formulaVal, { color: activeFormula === f ? colors.accent.coral : colors.text.secondary }]}>
                                    {results[f]}kg
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    <CtaButton
                        label="SAVE TO RECORDS"
                        icon="trophy"
                        size="lg"
                        loading={saveMutation.isPending}
                        accessibilityLabel="Save to records"
                        onPress={() => saveMutation.mutate()}
                        style={[styles.saveBtn, { borderRadius: borderRadius.xl, marginTop: 24 }]}
                    />

                    {/* Save status — an inline, accessible surface driven by the
                        mutation's own state (no modal alert dialog). The error
                        variant carries a Retry that re-fires the same mutation; the
                        success variant announces "Saved" for the frame before the
                        effect pops back. Ternary-null per rendering-no-falsy-and. */}
                    {saveMutation.isError ? (
                        <GlassCard intensity={40} radius={borderRadius.xl} style={{ marginTop: spacing.md }}>
                            <View
                                accessible
                                accessibilityRole="alert"
                                accessibilityLiveRegion="polite"
                                style={[styles.statusBody, { borderColor: withAlpha(colors.accent.red, 0.4) }]}
                            >
                                <View style={styles.statusRow}>
                                    <Ionicons name="alert-circle" size={20} color={colors.accent.red} />
                                    <View style={styles.statusTextStack}>
                                        <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: '700' }]}>
                                            Couldn't save your record
                                        </Text>
                                        <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 2 }]}>
                                            {saveErrorMessage}
                                        </Text>
                                    </View>
                                </View>
                                <TouchableOpacity
                                    accessibilityRole="button"
                                    accessibilityLabel="Retry saving record"
                                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                    disabled={saveMutation.isPending}
                                    activeOpacity={0.85}
                                    onPress={() => saveMutation.mutate()}
                                    style={[styles.retryBtn, { borderColor: withAlpha(colors.accent.red, 0.5), borderRadius: borderRadius.lg }]}
                                >
                                    <Text style={[typography.captionMedium, { color: colors.accent.red, fontWeight: '700' }]}>Retry</Text>
                                </TouchableOpacity>
                            </View>
                        </GlassCard>
                    ) : saveMutation.isSuccess ? (
                        <GlassCard intensity={40} radius={borderRadius.xl} style={{ marginTop: spacing.md }}>
                            <View
                                accessible
                                accessibilityRole="alert"
                                accessibilityLiveRegion="polite"
                                style={[styles.statusBody, { borderColor: withAlpha(colors.accent.cyan, 0.4) }]}
                            >
                                <View style={styles.statusRow}>
                                    <Ionicons name="checkmark-circle" size={20} color={colors.accent.cyan} />
                                    <View style={styles.statusTextStack}>
                                        <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: '700' }]}>
                                            Saved
                                        </Text>
                                        <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 2 }]}>
                                            Your 1RM record has been saved successfully.
                                        </Text>
                                    </View>
                                </View>
                            </View>
                        </GlassCard>
                    ) : null}

                    {/* Zone Table */}
                    <Text style={[typography.heading, { color: colors.text.primary, marginTop: spacing['2xl'], marginBottom: spacing.md }]}>
                        Training Zones
                    </Text>
                    <GlassCard intensity={40} radius={borderRadius['2xl']}>
                        {ZONES.map((zone, idx) => (
                            <View key={zone.pct} style={[styles.zoneRow, idx < ZONES.length - 1 && { borderBottomColor: colors.border.default, borderBottomWidth: 1 }]}>
                                <View style={styles.zoneLeft}>
                                    <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: 'bold' }]}>{zone.pct}%</Text>
                                    <Text style={[typography.caption, { color: colors.text.secondary }]}>{zone.label}</Text>
                                </View>
                                <View style={styles.zoneRight}>
                                    <Text style={[typography.statTiny, { color: colors.accent.cyan, fontSize: 18 }]}>
                                        {safe(estimated1RM * zone.pct / 100)}kg
                                    </Text>
                                    <Text style={[typography.caption, { color: colors.text.secondary, fontSize: 10 }]}>~{zone.reps} reps</Text>
                                </View>
                            </View>
                        ))}
                    </GlassCard>
                </ScrollView>
            </KeyboardAvoidingView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1 },
    backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    card: { padding: 24 },
    inputRow: { flexDirection: 'row', gap: 16 },
    inputStack: { flex: 1 },
    input: { height: 56, paddingHorizontal: 16, fontSize: 20, fontWeight: 'bold', textAlign: 'center' },
    resultContainer: { alignItems: 'center', marginVertical: 30 },
    resultRing: { width: 224, height: 224, borderRadius: 112, alignItems: 'center', justifyContent: 'center' },
    resultCircle: { width: 208, height: 208, borderRadius: 104, alignItems: 'center', justifyContent: 'center' },
    formulaRow: { flexDirection: 'row', padding: 6, gap: 4, marginTop: 10 },
    formulaBtn: { flex: 1, alignItems: 'center', paddingVertical: 10 },
    formulaText: { fontSize: 10, fontWeight: 'bold', marginBottom: 2 },
    formulaVal: { fontSize: 14, fontWeight: '800' },
    saveBtn: { height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
    // Save-status surface (rendered inside a GlassCard, which owns no padding):
    // a hairline-tinted body holding the icon + copy and, on error, the Retry.
    statusBody: { padding: 16, borderWidth: 1, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    statusRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
    statusTextStack: { flex: 1 },
    retryBtn: { paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1 },
    zoneRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
    zoneLeft: { flex: 1 },
    zoneRight: { alignItems: 'flex-end' },
});
