import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Switch, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '@/theme';
import { useCycleAccents } from '@/theme/useCycleAccents';
import { GlassCard } from '@/components/ui';
import { withAlpha } from '@/theme/utils';
import {
    getCycleSymptoms,
    getCycleForecast,
    logCycleSymptoms,
    updateCycleHealth,
    type CycleSymptomEntry,
    type OvulationTest,
    type CycleHealthBody,
} from '@/api/cycle';

/**
 * FertilityLogCard — advanced fertility logging + the BBT chart (Period P3).
 *
 * Three signals fertility-charters track, logged onto today's symptom row (same
 * per-day upsert the SymptomQuickLogCard uses, so they merge cleanly):
 *   • BBT   — basal body temperature in °C, a fine 0.05-step stepper across the
 *             35.5–37.5 waking-temp band (a rise sustained after ovulation).
 *   • Weight — body weight in kg (a 0.1-step stepper), a gentle daily trend.
 *   • LH test — the ovulation-predictor-kit result as Positive / Negative chips.
 *
 * Plus a BBT COVERLINE CHART built from plain Views (no chart library — mirrors
 * CycleStatsCard's bar idiom): each logged bbt is a dot positioned by temperature
 * within the min…max band over the trailing 60 days, with a faint horizontal
 * "coverline" at the running average. Honest-empty until at least 3 bbt points
 * exist — a line means nothing with one or two readings.
 *
 * Also hosts CONCEPTION MODE — a toggle that PATCHes
 * /v1/users/me/cycle/health { tryingToConceive } (initial value read from the
 * profile row the screen already fetched, passed in via props). When ON, it
 * surfaces a "fertile window" highlight from the forecast (fertileWindow /
 * predictedOvulationDate) and lifts the LH-test row to the top as the primary
 * signal for the day.
 *
 * Coral period accent, matching the screen's sensitive lower-contrast styling.
 * Everything here is a wellness ESTIMATE — never a diagnosis or a contraceptive /
 * conception guarantee (the screen's MedicalDisclaimer covers this).
 */

// The coral period accent is theme-aware — see useCycleAccents (dark #FF7A90,
// darkened on light); sourced per-render in every component below.

// BBT stepper band (°C). Waking basal temps sit in this range; 0.05 steps match
// the resolution of a basal thermometer.
const BBT_MIN = 35.5;
const BBT_MAX = 37.5;
const BBT_STEP = 0.05;
const BBT_DEFAULT = 36.5; // a sensible mid-band starting point when nothing's logged

// Weight stepper (kg) — a gentle 0.1-step range, never a target/goal.
const WEIGHT_MIN = 30;
const WEIGHT_MAX = 250;
const WEIGHT_STEP = 0.1;
const WEIGHT_DEFAULT = 65;

// How far back to pull for the BBT chart, and the floor before a line means much.
const BBT_WINDOW_DAYS = 60;
const MIN_BBT_POINTS = 3;

const LH_OPTIONS: Array<{ v: OvulationTest; label: string; icon: string }> = [
    { v: 'POSITIVE', label: 'Positive', icon: 'add-circle-outline' },
    { v: 'NEGATIVE', label: 'Negative', icon: 'remove-circle-outline' },
];

const todayKey = () => new Date().toISOString().slice(0, 10);

/** Round to the step's precision so float math doesn't drift (e.g. 36.6500001). */
function roundTo(value: number, step: number): number {
    const inv = 1 / step;
    return Math.round(value * inv) / inv;
}

/** Format a °C reading to one decimal for display. */
function fmtBbt(v: number): string {
    return v.toFixed(2).replace(/0$/, '').replace(/\.$/, ''); // 36.50 → 36.5, 36.55 → 36.55
}

/** A single BBT chart point: temperature + which day it came from. */
interface BbtPoint {
    date: string; // YYYY-MM-DD
    bbt: number;  // °C
}

/** Pull the logged BBT points from the symptom window, oldest → newest. */
function bbtPoints(entries: CycleSymptomEntry[]): BbtPoint[] {
    return entries
        .map((e) => ({ date: (e.date ?? '').slice(0, 10), bbt: e.bbt }))
        .filter((p): p is BbtPoint => typeof p.bbt === 'number' && p.bbt > 0 && !!p.date)
        // Window is newest-first; reverse to a natural left→right timeline.
        .reverse();
}

export interface FertilityLogCardProps {
    /** Persisted flag from GET /v1/users/me — is conception mode currently on? */
    tryingToConceive?: boolean;
}

export function FertilityLogCard({ tryingToConceive }: FertilityLogCardProps) {
    const { colors, typography, borderRadius } = useTheme();
    const { coral: CORAL, lime: LIME } = useCycleAccents();
    const queryClient = useQueryClient();

    // Trailing symptom window — seeds today's controls AND feeds the BBT chart.
    // Uses the same ['cycle-symptoms'] key family the logger invalidates, but a
    // distinct 60-day window key so it can coexist with the logger's 35-day cache.
    const symptomsQuery = useQuery({
        queryKey: ['cycle-symptoms', BBT_WINDOW_DAYS],
        queryFn: () => getCycleSymptoms(BBT_WINDOW_DAYS),
    });

    // Conception mode reads the forecast for the fertile-window highlight (only
    // fetched while the mode is ON — off, the highlight isn't shown).
    const conceptionOn = tryingToConceive === true;
    const forecastQuery = useQuery({
        queryKey: ['cycle-forecast', 1],
        queryFn: () => getCycleForecast(1),
        enabled: conceptionOn,
    });

    // Today's stored row (if any) seeds the controls. Match on the date rather
    // than trusting the newest-first ordering.
    const todays: CycleSymptomEntry | undefined = useMemo(
        () => symptomsQuery.data?.symptoms.find((s) => (s.date ?? '').slice(0, 10) === todayKey()),
        [symptomsQuery.data],
    );

    // ── Local controls ───────────────────────────────────────────────────────────
    const [bbt, setBbt] = useState<number | null>(null);
    const [weight, setWeight] = useState<number | null>(null);
    const [lh, setLh] = useState<OvulationTest | null>(null);

    // Seed once from today's row when it arrives. `seeded` guards in-progress edits
    // against a background refetch clobbering them.
    const [seeded, setSeeded] = useState(false);
    useEffect(() => {
        if (seeded || !todays) return;
        setSeeded(true);
        setBbt(typeof todays.bbt === 'number' ? todays.bbt : null);
        setWeight(typeof todays.weight === 'number' ? todays.weight : null);
        setLh(todays.ovulationTest ?? null);
    }, [todays, seeded]);

    const save = useMutation({
        mutationFn: () =>
            logCycleSymptoms({
                date: todayKey(),
                ...(bbt != null ? { bbt } : {}),
                ...(weight != null ? { weight } : {}),
                ...(lh != null ? { ovulationTest: lh } : {}),
            }),
        onError: (err: any) => {
            Alert.alert('Error', err?.response?.data?.message ?? err?.message ?? 'Could not save today');
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['cycle-symptoms'] });
        },
    });

    // Conception-mode toggle → PATCH tryingToConceive; re-read the merged profile.
    const conception = useMutation({
        mutationFn: (body: CycleHealthBody) => updateCycleHealth(body),
        onError: (err: any) => {
            Alert.alert('Error', err?.response?.data?.message ?? err?.message ?? 'Could not update');
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['my-profile'] });
        },
    });

    const points = useMemo(() => bbtPoints(symptomsQuery.data?.symptoms ?? []), [symptomsQuery.data]);

    // "Dirty" = the user set at least one of the three signals worth saving.
    const dirty = bbt != null || weight != null || lh != null;
    const savedToday =
        !!todays && (todays.bbt != null || todays.weight != null || todays.ovulationTest != null) && !save.isPending;

    // The LH-test row is the primary signal in conception mode → render it first.
    const lhRow = (
        <View style={styles.section}>
            <View style={styles.sectionHead}>
                <Text style={[typography.bodySm, styles.sectionLabel, { color: colors.text.secondary }]}>
                    LH ovulation test
                </Text>
                {conceptionOn ? (
                    <View style={[styles.pill, { backgroundColor: withAlpha(LIME, 0.16) }]}>
                        <Text style={[typography.caption, { color: LIME }]}>Key signal</Text>
                    </View>
                ) : null}
            </View>
            <View style={styles.chips}>
                {LH_OPTIONS.map((o) => {
                    const active = lh === o.v;
                    return (
                        <Pressable
                            key={o.v}
                            onPress={() => setLh(active ? null : o.v)}
                            accessibilityRole="button"
                            accessibilityState={{ selected: active }}
                            accessibilityLabel={`LH ovulation test: ${o.label}`}
                            style={[
                                styles.lhChip,
                                {
                                    backgroundColor: active ? withAlpha(CORAL, 0.18) : 'transparent',
                                    borderColor: active ? CORAL : colors.border.light,
                                },
                            ]}
                        >
                            <Ionicons
                                name={o.icon as any}
                                size={16}
                                color={active ? CORAL : colors.text.tertiary}
                                style={styles.chipIcon}
                            />
                            <Text
                                style={[
                                    typography.bodySm,
                                    { color: active ? colors.text.primary : colors.text.secondary },
                                ]}
                            >
                                {o.label}
                            </Text>
                        </Pressable>
                    );
                })}
            </View>
        </View>
    );

    return (
        <GlassCard radius={borderRadius['2xl']} style={styles.card} testID="fertility-log-card">
            <View style={styles.inner}>
                <View style={styles.header}>
                    <Ionicons name="thermometer-outline" size={18} color={CORAL} />
                    <Text style={[typography.overline, styles.headerLabel, { color: colors.text.secondary }]}>
                        FERTILITY LOG
                    </Text>
                </View>

                {/* ── Conception mode toggle ─────────────────────────────────────── */}
                <View style={styles.conceptionRow}>
                    <View style={styles.conceptionText}>
                        <Text style={[typography.subtitle, { color: colors.text.primary }]}>Trying to conceive</Text>
                        <Text style={[typography.caption, { color: colors.text.tertiary }]}>
                            Highlights your estimated fertile window and puts LH tests front and centre.
                        </Text>
                    </View>
                    <Switch
                        value={conceptionOn}
                        onValueChange={(next) => conception.mutate({ tryingToConceive: next })}
                        trackColor={{ false: colors.border.light, true: withAlpha(LIME, 0.5) }}
                        thumbColor={conceptionOn ? LIME : undefined}
                        accessibilityLabel="Trying to conceive"
                    />
                </View>

                {/* ── Fertile-window highlight (conception mode only) ────────────── */}
                {conceptionOn ? (
                    <FertileWindowHighlight
                        loading={forecastQuery.isLoading}
                        fertileWindow={forecastQuery.data?.fertileWindow ?? null}
                        predictedOvulationDate={forecastQuery.data?.predictedOvulationDate ?? null}
                    />
                ) : null}

                {/* In conception mode the LH row leads (primary signal); otherwise it
                    sits after the temperature/weight steppers with the rest. */}
                {conceptionOn ? lhRow : null}

                {/* ── BBT stepper (°C, 0.05 steps) ───────────────────────────────── */}
                <StepperField
                    label="Basal body temperature"
                    value={bbt}
                    placeholder={BBT_DEFAULT}
                    unit="°C"
                    min={BBT_MIN}
                    max={BBT_MAX}
                    step={BBT_STEP}
                    format={fmtBbt}
                    onChange={setBbt}
                    accessibilityUnit="degrees Celsius"
                />

                {/* ── Weight stepper (kg, 0.1 steps) ─────────────────────────────── */}
                <StepperField
                    label="Weight"
                    value={weight}
                    placeholder={WEIGHT_DEFAULT}
                    unit="kg"
                    min={WEIGHT_MIN}
                    max={WEIGHT_MAX}
                    step={WEIGHT_STEP}
                    format={(v) => v.toFixed(1)}
                    onChange={setWeight}
                    accessibilityUnit="kilograms"
                />

                {/* Non-conception mode keeps the LH row down here with the others. */}
                {!conceptionOn ? lhRow : null}

                {/* ── Save ────────────────────────────────────────────────────────── */}
                <Pressable
                    onPress={() => { if (dirty && !save.isPending) save.mutate(); }}
                    disabled={!dirty || save.isPending}
                    accessibilityRole="button"
                    accessibilityLabel="Save today's fertility log"
                    style={({ pressed }) => [
                        styles.saveBtn,
                        {
                            backgroundColor: dirty ? CORAL : withAlpha(CORAL, 0.25),
                            opacity: pressed ? 0.85 : 1,
                        },
                    ]}
                >
                    <Text style={[typography.bodyMedium, { color: colors.text.inverse, fontWeight: '700' }]}>
                        {save.isPending ? 'Saving…' : savedToday ? 'Update today' : 'Save today'}
                    </Text>
                </Pressable>

                {save.isError ? (
                    <Text style={[typography.caption, { color: colors.error, marginTop: 8, textAlign: 'center' }]}>
                        Couldn't save — try again.
                    </Text>
                ) : savedToday ? (
                    <Text style={[typography.caption, { color: colors.text.tertiary, marginTop: 8, textAlign: 'center' }]}>
                        Logged for today — tap to adjust anytime.
                    </Text>
                ) : null}

                {/* ── BBT coverline chart (Views only) ───────────────────────────── */}
                <View style={styles.chartBlock}>
                    <Text style={[typography.caption, styles.blockLabel, { color: colors.text.tertiary }]}>
                        BBT · LAST {BBT_WINDOW_DAYS} DAYS
                    </Text>
                    {points.length >= MIN_BBT_POINTS ? (
                        <BbtChart points={points} />
                    ) : (
                        <Text style={[typography.bodySm, { color: colors.text.secondary }]}>
                            Log your waking temperature for a few days and your BBT curve — with a coverline at your
                            average — will show up here.
                        </Text>
                    )}
                </View>

                <Text style={[typography.caption, { color: colors.text.tertiary, marginTop: 14 }]}>
                    BBT, weight and LH signals are personal estimates, not medical metrics.
                </Text>
            </View>
        </GlassCard>
    );
}

/**
 * The fertile-window highlight shown in conception mode. Reads the forecast's
 * fertileWindow (start/end) + predictedOvulationDate and renders them as a soft
 * lime banner — an ESTIMATE, framed as such. Honest states: a gentle "not enough
 * data yet" while loading or when the forecast can't offer a window.
 */
function FertileWindowHighlight({
    loading,
    fertileWindow,
    predictedOvulationDate,
}: {
    loading: boolean;
    fertileWindow: { start: string; end: string } | null;
    predictedOvulationDate: string | null;
}) {
    const { colors, typography } = useTheme();
    const { lime: LIME } = useCycleAccents();

    const body = loading
        ? 'Estimating your fertile window…'
        : fertileWindow
            ? `${fmtRange(fertileWindow.start, fertileWindow.end)}${
                  predictedOvulationDate ? ` · ovulation around ${fmtDay(predictedOvulationDate)}` : ''
              }`
            : 'Log a couple of cycles and your estimated fertile window will appear here.';

    return (
        <View style={[styles.fertileBox, { backgroundColor: withAlpha(LIME, 0.1), borderColor: withAlpha(LIME, 0.3) }]}>
            <View style={styles.fertileHead}>
                <Ionicons name="sparkles-outline" size={15} color={LIME} />
                <Text style={[typography.captionMedium, styles.fertileTitle, { color: LIME }]}>
                    ESTIMATED FERTILE WINDOW
                </Text>
            </View>
            <Text style={[typography.bodySm, { color: colors.text.secondary }]}>{body}</Text>
        </View>
    );
}

/**
 * A labelled +/- stepper for a decimal reading (BBT / weight). A big current
 * value (or a muted placeholder + "Tap + to log" when unset) flanked by two round
 * coral controls — the same idiom as SymptomQuickLogCard's water stepper, adapted
 * for fractional steps. First tap on either control seeds from the placeholder.
 */
function StepperField({
    label,
    value,
    placeholder,
    unit,
    min,
    max,
    step,
    format,
    onChange,
    accessibilityUnit,
}: {
    label: string;
    value: number | null;
    placeholder: number;
    unit: string;
    min: number;
    max: number;
    step: number;
    format: (v: number) => string;
    onChange: (v: number) => void;
    accessibilityUnit: string;
}) {
    const { colors, typography } = useTheme();
    const has = value != null;
    const shown = has ? value! : placeholder;

    const bump = (dir: 1 | -1) => {
        // First interaction seeds from the placeholder; subsequent ones step.
        const base = has ? value! : placeholder;
        const next = roundTo(Math.min(max, Math.max(min, base + dir * step)), step);
        onChange(next);
    };

    return (
        <View style={styles.section}>
            <Text style={[typography.bodySm, styles.sectionLabel, { color: colors.text.secondary }]}>{label}</Text>
            <View style={styles.stepperRow}>
                <StepperButton
                    icon="remove"
                    accessibilityLabel={`Lower ${label}`}
                    disabled={has && value! <= min}
                    onPress={() => bump(-1)}
                />
                <View style={styles.stepperValue}>
                    <Text
                        style={[
                            typography.statSmall,
                            { color: has ? colors.text.primary : colors.text.tertiary },
                        ]}
                        accessibilityLabel={has ? `${format(shown)} ${accessibilityUnit}` : `${label} not logged`}
                    >
                        {format(shown)}
                        <Text style={[typography.caption, { color: colors.text.tertiary }]}> {unit}</Text>
                    </Text>
                    {!has ? (
                        <Text style={[typography.caption, { color: colors.text.tertiary }]}>Tap + to log</Text>
                    ) : null}
                </View>
                <StepperButton
                    icon="add"
                    accessibilityLabel={`Raise ${label}`}
                    disabled={has && value! >= max}
                    onPress={() => bump(1)}
                />
            </View>
        </View>
    );
}

/** Round +/- control for the steppers; coral-tinted, dims when at a bound. */
function StepperButton({
    icon,
    onPress,
    disabled,
    accessibilityLabel,
}: {
    icon: 'add' | 'remove';
    onPress: () => void;
    disabled?: boolean;
    accessibilityLabel: string;
}) {
    const { colors } = useTheme();
    const { coral: CORAL } = useCycleAccents();
    return (
        <Pressable
            onPress={() => { if (!disabled) onPress(); }}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            style={({ pressed }) => [
                styles.stepperBtn,
                {
                    backgroundColor: withAlpha(CORAL, disabled ? 0.08 : 0.16),
                    borderColor: withAlpha(CORAL, disabled ? 0.2 : 0.4),
                    opacity: pressed ? 0.85 : 1,
                },
            ]}
        >
            <Ionicons name={icon} size={20} color={disabled ? colors.text.tertiary : CORAL} />
        </Pressable>
    );
}

/**
 * BBT coverline chart — plain Views, no chart library. Each logged reading is a
 * coral dot positioned vertically by temperature within the [min−pad … max+pad]
 * band, laid oldest → newest across the plot width. A faint horizontal
 * "coverline" marks the running average temperature — the fertility-charting
 * convention for spotting the post-ovulation thermal shift (dots that sit above
 * the line). Purely a visual aid, never a prediction.
 */
function BbtChart({ points }: { points: BbtPoint[] }) {
    const { colors, typography } = useTheme();
    const { coral: CORAL } = useCycleAccents();

    const temps = points.map((p) => p.bbt);
    const rawMin = Math.min(...temps);
    const rawMax = Math.max(...temps);
    // Pad the band a touch so the extreme dots don't hug the very edge, and guard
    // the degenerate all-equal case (span 0) with a small default window.
    const span = rawMax - rawMin;
    const pad = span > 0 ? span * 0.15 : 0.2;
    const lo = rawMin - pad;
    const hi = rawMax + pad;
    const range = hi - lo || 1;

    // Coverline = mean temperature, mapped into the plot the same way as the dots.
    const avg = temps.reduce((a, b) => a + b, 0) / temps.length;
    const avgFrac = (avg - lo) / range; // 0 (bottom) … 1 (top)
    const coverlineBottom = Math.round(avgFrac * CHART_PLOT_H);

    return (
        <View style={styles.chartWrap}>
            {/* Left axis: high / avg / low labels. */}
            <View style={styles.axis}>
                <Text style={[typography.caption, styles.axisText, { color: colors.text.tertiary }]}>
                    {fmtBbt(roundTo(hi, 0.05))}
                </Text>
                <Text style={[typography.caption, styles.axisText, { color: colors.text.tertiary }]}>
                    {fmtBbt(roundTo(avg, 0.05))}
                </Text>
                <Text style={[typography.caption, styles.axisText, { color: colors.text.tertiary }]}>
                    {fmtBbt(roundTo(lo, 0.05))}
                </Text>
            </View>

            {/* Plot: dots positioned by temperature, with the coverline behind them. */}
            <View style={[styles.plot, { height: CHART_PLOT_H }]} accessibilityLabel="Basal body temperature chart with an average coverline">
                {/* Faint coverline at the running average. */}
                <View
                    pointerEvents="none"
                    style={[
                        styles.coverline,
                        { bottom: coverlineBottom, backgroundColor: withAlpha(CORAL, 0.35) },
                    ]}
                />
                <View style={styles.dotsRow}>
                    {points.map((p, i) => {
                        const frac = (p.bbt - lo) / range;
                        const bottom = Math.round(frac * CHART_PLOT_H) - DOT / 2;
                        const aboveLine = p.bbt >= avg;
                        return (
                            <View key={`${p.date}-${i}`} style={styles.dotCol}>
                                <View
                                    style={[
                                        styles.dot,
                                        {
                                            bottom,
                                            backgroundColor: aboveLine ? CORAL : withAlpha(CORAL, 0.45),
                                            borderColor: withAlpha(CORAL, 0.7),
                                        },
                                    ]}
                                />
                            </View>
                        );
                    })}
                </View>
            </View>
        </View>
    );
}

// Chart geometry (px).
const CHART_PLOT_H = 120;
const DOT = 9;

// ── Small date helpers (local, display-only) ────────────────────────────────────

/** 'YYYY-MM-DD' → "Jun 17" (local, display-only). Falls back to the raw string. */
function fmtDay(iso: string): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!m) return iso;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** A compact "Jun 14 – Jun 19" range for the fertile-window banner. */
function fmtRange(start: string, end: string): string {
    return `${fmtDay(start)} – ${fmtDay(end)}`;
}

const styles = StyleSheet.create({
    card: { marginTop: 12 },
    inner: { padding: 18 },
    header: { flexDirection: 'row', alignItems: 'center' },
    headerLabel: { marginLeft: 8, letterSpacing: 1, flex: 1 },
    // Conception-mode toggle row.
    conceptionRow: { flexDirection: 'row', alignItems: 'center', marginTop: 14 },
    conceptionText: { flex: 1, marginRight: 12 },
    // Fertile-window banner.
    fertileBox: { marginTop: 14, padding: 12, borderRadius: 12, borderWidth: 1 },
    fertileHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
    fertileTitle: { marginLeft: 6, letterSpacing: 0.8 },
    // Grouped sub-sections sit under a slim divider so the form reads as blocks.
    section: {
        marginTop: 4,
        marginBottom: 12,
        paddingTop: 12,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: 'rgba(255,255,255,0.06)',
    },
    sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
    sectionLabel: { marginBottom: 10 },
    pill: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, marginBottom: 10 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    lhChip: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 9,
    },
    chipIcon: { marginRight: 6 },
    // Steppers — two round coral controls flanking the current reading.
    stepperRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    stepperBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    stepperValue: { flex: 1, alignItems: 'center' },
    // Chart.
    chartBlock: {
        marginTop: 20,
        paddingTop: 16,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: 'rgba(255,255,255,0.06)',
    },
    blockLabel: { letterSpacing: 1, marginBottom: 12 },
    chartWrap: { flexDirection: 'row' },
    // Left axis column — high / avg / low, space-between over the plot height.
    axis: { width: 42, height: CHART_PLOT_H, justifyContent: 'space-between', paddingRight: 6 },
    axisText: { fontSize: 10, textAlign: 'right' },
    plot: { flex: 1, position: 'relative', justifyContent: 'flex-end' },
    coverline: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth * 2, borderRadius: 1 },
    dotsRow: { flexDirection: 'row', alignItems: 'flex-end', height: CHART_PLOT_H },
    dotCol: { flex: 1, height: CHART_PLOT_H, position: 'relative' },
    dot: {
        position: 'absolute',
        alignSelf: 'center',
        width: DOT,
        height: DOT,
        borderRadius: DOT / 2,
        borderWidth: 1,
    },
    saveBtn: {
        marginTop: 8,
        alignItems: 'center',
        borderRadius: 14,
        paddingVertical: 12,
    },
});

export default FertilityLogCard;
