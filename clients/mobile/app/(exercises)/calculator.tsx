import React, { useState, useMemo, useEffect } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
    KeyboardAvoidingView, Platform, Pressable, Dimensions,
} from 'react-native';

import { useRouter } from 'expo-router';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { logOneRepMax } from '@/api/exercises';
import { GlassCard, CtaButton } from '@/components/ui';
import { StatusBar } from 'expo-status-bar';
import { BarChart } from 'react-native-gifted-charts';
import Svg, { Circle } from 'react-native-svg';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { shadows } from '@/theme/shadows';
import { withAlpha } from '@/theme/utils';

const { width } = Dimensions.get('window');

// Diameter of the hero progress ring. The lime is now a real stroked SVG arc
// (not a flat radial band): RING_SIZE is the outer box, RING_STROKE the band.
const RING_SIZE = 224;
const RING_STROKE = 10;

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

    // Zone drop-off chart data: estimated load (estimated1RM × pct/100) at each
    // %1RM band. The 100% / top bar is anchored in brand-primary lime; the rest
    // recede to cyan so the hero 1RM reads as the primary accent (matching the
    // analytics screen, where lime carries the headline data and cyan is
    // secondary). Reversed so %1RM rises left→right toward the 100% lime anchor.
    const zoneChartData = useMemo(() => {
        if (estimated1RM <= 0) return [];
        return [...ZONES].reverse().map((zone) => {
            const isTop = zone.pct === 100;
            return {
                value: safe((estimated1RM * zone.pct) / 100),
                label: `${zone.pct}%`,
                frontColor: isTop ? colors.accent.coral : withAlpha(colors.accent.cyan, 0.85),
                gradientColor: isTop ? colors.accent.coralDark : colors.accent.cyan,
                topLabelComponent: () => (
                    <Text style={[typography.caption, { color: colors.text.tertiary, fontSize: 9 }]}>
                        {safe((estimated1RM * zone.pct) / 100)}
                    </Text>
                ),
            };
        });
    }, [estimated1RM, colors, typography]);

    // Ring fill fraction: the active formula's estimate against the top of the
    // three formulas, so the lime arc reads as "how this estimate compares" and
    // is always a full sweep when this formula is the highest. Guarded /0.
    const ringMax = Math.max(results.epley, results.brzycki, results.lander, 1);
    const ringProgress = estimated1RM > 0 ? Math.min(1, estimated1RM / ringMax) : 0;
    const ringRadius = (RING_SIZE - RING_STROKE) / 2;
    const ringCircumference = 2 * Math.PI * ringRadius;
    const ringOffset = ringCircumference - ringProgress * ringCircumference;

    // The server's POST /v1/exercises/1rm schema requires weightKg AND
    // estimated1RMKg to be z.number().positive() — a 0 is rejected with a 400.
    // estimated1RM collapses to 0 whenever `safe` clamps a non-finite/negative
    // formula output (Brzycki/Lander at reps >= 37), and w is 0 for a blank
    // weight, so guard the SAVE on both: a non-positive value can never be POSTed.
    const canSave = w > 0 && estimated1RM > 0;

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
                <Text style={[typography.h3, { color: colors.text.primary }]}>1RM Calculator</Text>
                <View style={{ width: 40 }} />
            </View>

            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={{ flex: 1 }}
            >
                <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 100 }}>
                    {/* Input Card */}
                    <Animated.View entering={FadeInDown.duration(400).springify().damping(18).mass(0.7)}>
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
                                    accessibilityLabel="Weight in kilograms"
                                    accessibilityHint="Enter the weight you lifted, in kilograms"
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
                                    accessibilityLabel="Repetitions"
                                    accessibilityHint="Enter how many reps you completed at this weight"
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
                            accessibilityLabel="Exercise name"
                        />
                      </View>
                      </GlassCard>
                    </Animated.View>

                    {/* Result Ring — a real stroked lime arc (react-native-svg)
                        rather than a flat radial band, so the hero element reads
                        as a premium progress ring. The whole value announces as
                        one phrase to a screen reader. */}
                    <Animated.View
                        entering={FadeInDown.delay(60).duration(400).springify().damping(18).mass(0.7)}
                        style={styles.resultContainer}
                    >
                        <View
                            accessible
                            accessibilityRole="text"
                            accessibilityLabel={`Estimated one-rep max ${estimated1RM} kilograms`}
                            style={[styles.resultRing, shadows.glow(colors.accent.coral)]}
                        >
                            <Svg
                                width={RING_SIZE}
                                height={RING_SIZE}
                                style={StyleSheet.absoluteFill}
                                importantForAccessibility="no-hide-descendants"
                            >
                                {/* Track */}
                                <Circle
                                    cx={RING_SIZE / 2}
                                    cy={RING_SIZE / 2}
                                    r={ringRadius}
                                    stroke={colors.border.default}
                                    strokeWidth={RING_STROKE}
                                    fill="none"
                                />
                                {/* Lime progress arc */}
                                <Circle
                                    cx={RING_SIZE / 2}
                                    cy={RING_SIZE / 2}
                                    r={ringRadius}
                                    stroke={colors.accent.coral}
                                    strokeWidth={RING_STROKE}
                                    fill="none"
                                    strokeDasharray={ringCircumference}
                                    strokeDashoffset={ringOffset}
                                    strokeLinecap="round"
                                    transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
                                />
                            </Svg>
                            <View
                                style={[styles.resultCircle, { backgroundColor: colors.background.secondary }]}
                                importantForAccessibility="no-hide-descendants"
                            >
                                <Text style={[typography.overline, { color: colors.text.secondary }]}>ESTIMATED 1RM</Text>
                                <Text style={[typography.statLarge, { color: colors.text.primary, marginVertical: 4 }]}>
                                    {estimated1RM}
                                </Text>
                                <Text style={[typography.subhead, { color: colors.text.secondary, fontWeight: 'bold' }]}>KILOGRAMS</Text>
                            </View>
                        </View>
                    </Animated.View>

                    {/* Formula Selector */}
                    <Animated.View
                        entering={FadeInDown.delay(120).duration(400).springify().damping(18).mass(0.7)}
                        style={[styles.formulaRow, { backgroundColor: colors.background.tertiary, borderRadius: borderRadius.xl }]}
                    >
                        {(Object.keys(formulas) as Array<keyof typeof formulas>).map((f, idx) => (
                            <Animated.View
                                key={f}
                                entering={FadeInDown.delay(140 + idx * 40).duration(360)}
                                style={styles.formulaCell}
                            >
                                <Pressable
                                    onPress={() => setActiveFormula(f)}
                                    hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                                    accessibilityRole="button"
                                    accessibilityState={{ selected: activeFormula === f }}
                                    accessibilityLabel={`${f} formula, ${results[f]} kilograms${activeFormula === f ? ', selected' : ''}`}
                                    style={({ pressed }) => [
                                        styles.formulaBtn,
                                        activeFormula === f && { backgroundColor: withAlpha(colors.accent.coral, 0.18), borderRadius: borderRadius.lg, borderWidth: 1, borderColor: withAlpha(colors.accent.coral, 0.4) },
                                        pressed && { transform: [{ scale: 0.96 }], opacity: 0.9 },
                                    ]}
                                >
                                    <Text style={[styles.formulaText, { color: activeFormula === f ? colors.accent.coral : colors.text.tertiary }]}>
                                        {f.toUpperCase()}
                                    </Text>
                                    <Text style={[styles.formulaVal, { color: activeFormula === f ? colors.accent.coral : colors.text.secondary }]}>
                                        {results[f]}kg
                                    </Text>
                                </Pressable>
                            </Animated.View>
                        ))}
                    </Animated.View>

                    <CtaButton
                        label="SAVE TO RECORDS"
                        icon="trophy"
                        size="lg"
                        loading={saveMutation.isPending}
                        disabled={!canSave}
                        accessibilityLabel="Save to records"
                        // Guard the mutation itself too (not just the disabled
                        // Pressable): a non-positive weight/estimate would 400 on
                        // the server's z.number().positive() body schema.
                        onPress={() => { if (canSave) saveMutation.mutate(); }}
                        style={[styles.saveBtn, { borderRadius: borderRadius.xl, marginTop: 24 }]}
                    />

                    {/* Inline hint when the SAVE is guarded off — explains why the
                        button is disabled (a non-positive weight or estimate the
                        server's positive() body schema would reject). Ternary-null
                        per rendering-no-falsy-and. */}
                    {!canSave ? (
                        <Text
                            accessibilityLiveRegion="polite"
                            style={[typography.caption, { color: colors.accent.amber, textAlign: 'center', marginTop: spacing.sm }]}
                        >
                            Enter a weight and reps that give a 1RM above 0 to save.
                        </Text>
                    ) : null}

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
                    <Animated.View entering={FadeInDown.delay(180).duration(400).springify().damping(18).mass(0.7)}>
                        <Text style={[typography.heading, { color: colors.text.primary, marginTop: spacing['2xl'], marginBottom: spacing.md }]}>
                            Training Zones
                        </Text>
                    </Animated.View>

                    {/* Zone drop-off chart — the % load curve across %1RM bands,
                        lime-anchored at 100% with cyan receding. Empty/zero state
                        when there's no estimate yet. */}
                    <Animated.View entering={FadeInDown.delay(220).duration(400).springify().damping(18).mass(0.7)}>
                        <GlassCard intensity={40} radius={borderRadius['2xl']} style={{ marginBottom: spacing.md }}>
                            <View style={styles.chartCard}>
                                <View style={styles.chartHeader}>
                                    <View>
                                        <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: 'bold' }]}>Load by %1RM</Text>
                                        <Text style={[typography.caption, { color: colors.text.secondary }]}>Estimated kg at each intensity</Text>
                                    </View>
                                    <Ionicons name="barbell-outline" size={20} color={colors.accent.coral} />
                                </View>

                                {zoneChartData.length > 0 ? (
                                    <>
                                        <View style={{ alignItems: 'center', marginTop: spacing.sm }}>
                                            <BarChart
                                                data={zoneChartData}
                                                width={width - 96}
                                                height={150}
                                                barWidth={16}
                                                spacing={14}
                                                initialSpacing={12}
                                                roundedTop
                                                showGradient
                                                noOfSections={4}
                                                yAxisThickness={0}
                                                xAxisThickness={0}
                                                rulesColor={colors.border.default}
                                                yAxisTextStyle={{ color: colors.text.secondary, fontSize: 10 }}
                                                xAxisLabelTextStyle={{ color: colors.text.secondary, fontSize: 10 }}
                                                isAnimated
                                            />
                                        </View>
                                        {/* Legend — color is never the only signal (labelled). */}
                                        <View style={styles.legendRow}>
                                            <View style={styles.legendItem}>
                                                <View style={[styles.legendDot, { backgroundColor: colors.accent.coral }]} />
                                                <Text style={[typography.caption, { color: colors.text.secondary }]}>100% (1RM)</Text>
                                            </View>
                                            <View style={styles.legendItem}>
                                                <View style={[styles.legendDot, { backgroundColor: colors.accent.cyan }]} />
                                                <Text style={[typography.caption, { color: colors.text.secondary }]}>Sub-max zones</Text>
                                            </View>
                                        </View>
                                    </>
                                ) : (
                                    <View style={styles.emptyChart}>
                                        <Ionicons name="bar-chart-outline" size={36} color={colors.text.tertiary} />
                                        <Text style={[typography.caption, { color: colors.text.secondary, marginTop: spacing.sm, textAlign: 'center' }]}>
                                            Enter a weight and reps to see your zones
                                        </Text>
                                    </View>
                                )}
                            </View>
                        </GlassCard>
                    </Animated.View>

                    <GlassCard intensity={40} radius={borderRadius['2xl']}>
                        {ZONES.map((zone, idx) => {
                            const isTop = zone.pct === 100;
                            return (
                                <Animated.View
                                    key={zone.pct}
                                    entering={FadeInDown.delay(260 + idx * 35).duration(340)}
                                    style={[styles.zoneRow, idx < ZONES.length - 1 && { borderBottomColor: colors.border.default, borderBottomWidth: 1 }]}
                                >
                                    <View style={styles.zoneLeft}>
                                        <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: 'bold' }]}>{zone.pct}%</Text>
                                        <Text style={[typography.caption, { color: colors.text.secondary }]}>{zone.label}</Text>
                                    </View>
                                    <View style={styles.zoneRight}>
                                        {/* Top (100%) zone is the 1RM anchor → brand-primary lime; the
                                            sub-max zones recede to secondary cyan. */}
                                        <Text style={[typography.statTiny, { color: isTop ? colors.accent.coral : colors.accent.cyan, fontSize: 18, fontWeight: isTop ? '800' : '600' }]}>
                                            {safe(estimated1RM * zone.pct / 100)}kg
                                        </Text>
                                        <Text style={[typography.caption, { color: colors.text.secondary, fontSize: 10 }]}>~{zone.reps} reps</Text>
                                    </View>
                                </Animated.View>
                            );
                        })}
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
    formulaCell: { flex: 1 },
    // paddingVertical 14 + two text lines (10/14) → ~48pt effective target
    // (>=44pt min); hitSlop on the Pressable extends it further.
    formulaBtn: { alignItems: 'center', justifyContent: 'center', paddingVertical: 14 },
    formulaText: { fontSize: 10, fontWeight: 'bold', marginBottom: 2 },
    formulaVal: { fontSize: 14, fontWeight: '800' },
    // Layout (height/flex/align) is owned by the CtaButton primitive (size="lg"
    // → minHeight 56 + paddingVertical 16); this only carries radius + top gap.
    saveBtn: {},
    // Zone drop-off chart
    chartCard: { padding: 20 },
    chartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    emptyChart: { height: 150, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
    legendRow: { flexDirection: 'row', justifyContent: 'center', gap: 20, marginTop: 12 },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    legendDot: { width: 8, height: 8, borderRadius: 4 },
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
