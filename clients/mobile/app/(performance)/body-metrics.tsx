import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TextInput,
    ActivityIndicator, Alert, Dimensions, type TextStyle,
} from 'react-native';

import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getBodyMetrics, logBodyMetrics } from '@/api/progress';
import { Skeleton, EmptyState, GlassCard } from '@/components/ui';
import { CircularProgress } from '@/components/ui/CircularProgress';
import { WeightTrendChart } from '@/components/WeightTrendChart';
import { PressableScale } from '@/components/PressableScale';
import { CountUpText } from '@/components/CountUpText';
import { MetricsSavedToast } from '@/components/MetricsSavedToast';
import { withAlpha } from '@/theme/utils';
import { typography as typo } from '@/theme/typography';
import Animated, {
    FadeInDown, FadeIn, useSharedValue, useAnimatedStyle, withSequence, withTiming,
} from 'react-native-reanimated';

const { width } = Dimensions.get('window');

// House entrance recipe — staggered FadeInDown spring, matching the rest of the
// performance / exercises stacks (analytics.tsx / history.tsx). `i` indexes the
// stagger so sections cascade in on mount.
const enter = (i: number) => FadeInDown.delay(80 + i * 50).springify().damping(18).mass(0.7);

// Tabular figures for the changing numeric readouts (hero weight, delta, ring,
// measurement tiles). Barlow Condensed's proportional digits jitter in width as
// values change; tabular-nums locks each glyph to one cell so the numbers stay
// rock-steady. Applied inline — the shared typography tokens are off-limits.
const TABULAR: TextStyle = { fontVariant: ['tabular-nums'] };

// Consistency target for the momentum ring: distinct snapshots in the fetched
// window (getBodyMetrics(30)). Honest "are you showing up" signal — no invented
// goal weight the user never set.
const LOG_TARGET = 12;

// Client-side mirror of the user-service updateProfileSchema bounds
// (services/user-service/src/schemas.ts):
//   heightCm: z.coerce.number().positive().max(300)  → (0, 300]
//   weightKg: z.coerce.number().positive().max(600)  → (0, 600]
// Keep these IDENTICAL to the server. `.positive()` means strictly > 0, so 0 is
// rejected; NaN (a non-numeric entry) is rejected too. These are a fast, accessible
// pre-check — the server stays the source of truth.
export const HEIGHT_CM_MAX = 300;
export const WEIGHT_KG_MAX = 600;
// Body-fat is a percentage. The progress-service POST /v1/progress/metrics bounds
// it at z.number().min(1).max(70) (services/progress-service/src/routes.ts), so a
// value below 1 or above 70 gets a server 400. Mirror that EXACT range here as an
// honest pre-check — server stays the source of truth. Tape measurements are
// circumferences in cm, bounded generously (no human body part exceeds 300cm).
export const BODY_FAT_PCT_MIN = 1;
export const BODY_FAT_PCT_MAX = 70;
export const MEASUREMENT_CM_MAX = 300;

// Validate an OPTIONAL numeric field (empty string = "not provided" = valid, since
// the server marks every field .optional()). When provided it must parse to a finite
// number in [min, max]. `min` defaults to a strictly-positive lower edge (> 0) for
// the weight/cm fields whose server bound is `.positive()`; body fat passes
// `BODY_FAT_PCT_MIN` (= 1) to mirror its `.min(1)` server bound. Returns inline
// validation copy, or null when valid.
export function validateMeasurement(raw: string, max: number, label: string, min = 0): string | null {
    if (raw.trim() === '') return null; // optional — omitting it is fine
    const n = parseFloat(raw);
    if (!Number.isFinite(n) || n <= 0) {
        return `Enter a valid ${label} greater than 0.`;
    }
    if (n < min) {
        return `${label} must be at least ${min}.`;
    }
    if (n > max) {
        return `${label} must be ${max} or less.`;
    }
    return null;
}

// Finite-coercion for the payload: parse a provided field and ship it ONLY when it
// resolves to a finite, strictly-positive number. A non-numeric string (parseFloat
// → NaN) or a non-positive value drops to undefined instead of escaping to the API.
function toFiniteMeasurement(raw: string): number | undefined {
    if (raw.trim() === '') return undefined;
    const n = parseFloat(raw);
    return Number.isFinite(n) && n > 0 ? n : undefined;
}

const MeasurementInput = ({ label, value, onChange, placeholder, error }: any) => {
    const { colors, typography, borderRadius } = useTheme();
    const hasError = !!error;
    return (
        <View style={{ marginBottom: 16 }}>
            <Text style={[typography.captionMedium, { color: colors.text.secondary, marginBottom: 8 }]}>{label}</Text>
            <TextInput
                style={[styles.input, { color: colors.text.primary, backgroundColor: colors.background.tertiary, borderRadius: borderRadius.lg, borderColor: hasError ? colors.accent.red : colors.border.default }]}
                placeholder={placeholder}
                placeholderTextColor={colors.text.tertiary}
                keyboardType="numeric"
                value={value}
                onChangeText={onChange}
                accessibilityLabel={label}
            />
            {hasError ? (
                <Text
                    accessibilityRole="alert"
                    accessibilityLiveRegion="polite"
                    accessibilityLabel={error}
                    style={[typography.caption, { color: colors.accent.red, marginTop: 6 }]}
                >
                    {error}
                </Text>
            ) : null}
        </View>
    );
};

export default function BodyMetricsScreen() {
    const { colors, typography, spacing, borderRadius, shadows } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const queryClient = useQueryClient();

    const [weight, setWeight] = useState('');
    const [bodyFat, setBodyFat] = useState('');
    const [chest, setChest] = useState('');
    const [arm, setArm] = useState('');
    const [waist, setWaist] = useState('');
    const [hips, setHips] = useState('');
    const [thigh, setThigh] = useState('');
    const [calf, setCalf] = useState('');
    const [showAdvanced, setShowAdvanced] = useState(false);

    // ── Peak-end state ────────────────────────────────────────────────────────
    // A bumped key remounts the in-card affirmation toast on every successful
    // save (so its entrance re-runs); `milestoneToast` flags the one-time
    // "Consistency unlocked" beat when the momentum ring reaches LOG_TARGET.
    const [toastKey, setToastKey] = useState(0);
    const [showToast, setShowToast] = useState(false);
    const [milestoneToast, setMilestoneToast] = useState(false);
    // The value the hero numeral counts UP to after a save. While unset the hero
    // renders the static latest weight; on success it tweens 0 → new weight once.
    const [countUpTo, setCountUpTo] = useState<number | null>(null);
    // Captured at submit time so the success handler knows what was just logged
    // and whether this save crossed the consistency milestone.
    const submittedWeight = useRef<number | null>(null);
    const milestoneFired = useRef(false);

    // Hero glow pulse — a shared opacity that briefly blooms the lime halo behind
    // the weight numeral on a successful save. transform/opacity only, cheap.
    const glowPulse = useSharedValue(0);
    const glowStyle = useAnimatedStyle(() => ({ opacity: glowPulse.value }));

    // ScrollView handle so the empty-state CTA can bring the log form into view.
    const scrollRef = useRef<ScrollView>(null);
    const formY = useRef(0);
    const scrollToForm = () => scrollRef.current?.scrollTo({ y: Math.max(0, formY.current - 12), animated: true });

    const historyQuery = useQuery({
        queryKey: ['body-metrics'],
        queryFn: () => getBodyMetrics(30),
    });

    const mutation = useMutation({
        mutationFn: (payload: any) => logBodyMetrics(payload),
        // Keep the OS Alert for the FAILURE path only — the success path is now a
        // designed in-card peak (count-up + glow + affirmation toast) below.
        onError: (err: any) => { Alert.alert('Error', err?.response?.data?.message ?? err?.message ?? 'Something went wrong'); },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['body-metrics'] });
            // Did this save push us to / past the consistency target for the first
            // time? history.length is pre-invalidation (the just-saved row lands on
            // refetch), so +1 models the snapshot we just added.
            const crossed = !milestoneFired.current && history.length + 1 >= LOG_TARGET;
            if (crossed) milestoneFired.current = true;

            // Drive the celebratory beat: count the hero up to the saved weight,
            // bloom the glow, and (re)mount the affirmation toast.
            if (submittedWeight.current != null) setCountUpTo(submittedWeight.current);
            glowPulse.value = withSequence(
                withTiming(0.9, { duration: 260 }),
                withTiming(0, { duration: 620 }),
            );
            setMilestoneToast(crossed);
            setShowToast(true);
            setToastKey((k) => k + 1);

            setWeight('');
            setBodyFat('');
            setChest('');
            setArm('');
            setWaist('');
            setHips('');
            setThigh('');
            setCalf('');
        },
    });

    // Derived (never stored — see react-state-minimize): inline validation copy for
    // EVERY provided field, each mirroring its server bound. `hasErrors` gates the
    // Save control so we never fire a body-metrics PATCH the API will 400 — a
    // non-numeric entry (parseFloat → NaN) or out-of-range value blocks the save.
    const weightError = validateMeasurement(weight, WEIGHT_KG_MAX, 'weight');
    const bodyFatError = validateMeasurement(bodyFat, BODY_FAT_PCT_MAX, 'body fat %', BODY_FAT_PCT_MIN);
    const chestError = validateMeasurement(chest, MEASUREMENT_CM_MAX, 'chest');
    const armError = validateMeasurement(arm, MEASUREMENT_CM_MAX, 'arms');
    const waistError = validateMeasurement(waist, MEASUREMENT_CM_MAX, 'waist');
    const hipsError = validateMeasurement(hips, MEASUREMENT_CM_MAX, 'hips');
    const thighError = validateMeasurement(thigh, MEASUREMENT_CM_MAX, 'thighs');
    const calfError = validateMeasurement(calf, MEASUREMENT_CM_MAX, 'calves');
    const hasErrors =
        weightError !== null ||
        bodyFatError !== null ||
        chestError !== null ||
        armError !== null ||
        waistError !== null ||
        hipsError !== null ||
        thighError !== null ||
        calfError !== null;
    const saveDisabled = mutation.isPending || hasErrors;

    const handleLog = () => {
        if (!weight && !bodyFat && !chest && !arm && !waist && !hips && !thigh && !calf) return;
        // Block the mutation if any provided value is out of the server bounds —
        // even if a control somehow fires while invalid.
        if (hasErrors) return;
        // Finite-coerce every field: a NaN/non-positive parse drops to undefined
        // instead of shipping a bad value to the API (defence-in-depth behind the
        // hasErrors gate above).
        const weightKg = toFiniteMeasurement(weight);
        // Remember the just-submitted weight so the success handler can count the
        // hero numeral up to it (falls back to the latest known weight).
        submittedWeight.current = weightKg ?? (typeof latest?.weightKg === 'number' ? latest.weightKg : null);
        mutation.mutate({
            weightKg,
            bodyFatPct: toFiniteMeasurement(bodyFat),
            chestCm: toFiniteMeasurement(chest),
            armsCm: toFiniteMeasurement(arm),
            waistCm: toFiniteMeasurement(waist),
            hipsCm: toFiniteMeasurement(hips),
            thighsCm: toFiniteMeasurement(thigh),
            calvesCm: toFiniteMeasurement(calf),
        });
    };

    const history = historyQuery.data ?? [];
    const latest = history[0];

    // ── Derived hero figures (memoized; never stored) ────────────────────────
    // Weight trend line — chronological (history is newest-first), last 12 points.
    const weightSeries = useMemo(() => {
        return history
            .filter((m) => typeof m.weightKg === 'number' && Number.isFinite(m.weightKg))
            .slice(0, 12)
            .reverse()
            .map((m) => ({
                value: m.weightKg as number,
                label: new Date(m.recordedAt ?? m.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
            }));
    }, [history]);
    const firstPoint = weightSeries[0];
    const latestPoint = weightSeries[weightSeries.length - 1];

    // Δ vs the previous snapshot that carries a weight — drives the trend chip.
    const weightDelta = useMemo(() => {
        const ws = history
            .map((m) => m.weightKg)
            .filter((w): w is number => typeof w === 'number' && Number.isFinite(w));
        if (ws.length < 2) return null;
        return ws[0]! - ws[1]!;
    }, [history]);

    // Latest tape measurements → a 2-col grid (only the parts actually logged).
    const measurementTiles = useMemo(() => {
        const m = latest;
        if (!m) return [] as { key: string; label: string; value: number }[];
        const defs: { key: string; label: string; value: number | undefined }[] = [
            { key: 'chestCm', label: 'Chest', value: m.chestCm },
            { key: 'waistCm', label: 'Waist', value: m.waistCm },
            { key: 'hipsCm', label: 'Hips', value: m.hipsCm },
            { key: 'armsCm', label: 'Arms', value: m.armsCm },
            { key: 'thighsCm', label: 'Thighs', value: m.thighsCm },
            { key: 'calvesCm', label: 'Calves', value: m.calvesCm },
        ];
        return defs.filter(
            (d): d is { key: string; label: string; value: number } =>
                typeof d.value === 'number' && Number.isFinite(d.value),
        );
    }, [latest]);

    // Consistency momentum — distinct snapshots in the window vs LOG_TARGET.
    const logCount = history.length;
    const logProgress = Math.min(1, logCount / LOG_TARGET);

    const loading = historyQuery.isLoading;

    // Once the refetch lands the just-saved row, the live `latest.weightKg` is the
    // authoritative value again — release the one-shot count-up override so the
    // hero returns to its static (selectable, theme-coloured) numeral.
    const latestWeight = typeof latest?.weightKg === 'number' ? latest.weightKg : null;
    useEffect(() => {
        if (countUpTo !== null && latestWeight !== null && Math.round(latestWeight) === Math.round(countUpTo)) {
            setCountUpTo(null);
        }
    }, [latestWeight, countUpTo]);

    return (
        <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background.primary }]}>
            <StatusBar style="light" />
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.border.default }]}>
                <PressableScale hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={[styles.headerBtn, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
                    <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
                </PressableScale>
                <Text style={[typography.h3, { color: colors.text.primary }]}>Body Metrics</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView
                ref={scrollRef}
                contentContainerStyle={{ paddingBottom: insets.bottom + 140 }}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
            >
                {/* ── HERO: current weight numeral dominates, momentum ring beside it ── */}
                <Animated.View entering={enter(0)} style={{ paddingHorizontal: spacing.xl, marginTop: spacing.lg }}>
                    <GlassCard radius={borderRadius['2xl']} glow={withAlpha(colors.accent.coral, 0.5)}>
                        <View style={styles.heroBody}>
                            <View style={styles.heroLeft}>
                                <Text style={[typography.overline, { color: colors.text.tertiary }]}>Current Weight</Text>
                                <View style={styles.heroValueRow}>
                                    {/* Celebratory glow — blooms behind the numeral on a successful save. */}
                                    <Animated.View
                                        pointerEvents="none"
                                        style={[styles.heroGlow, { backgroundColor: withAlpha(colors.accent.coral, 0.5) }, glowStyle]}
                                    />
                                    {loading ? (
                                        <Skeleton width={132} height={56} radius={borderRadius.md} />
                                    ) : countUpTo !== null ? (
                                        <>
                                            {/* One-shot count-up to the just-saved weight (the PEAK). */}
                                            <CountUpText
                                                value={countUpTo}
                                                duration={760}
                                                accessibilityLabel={`${Math.round(countUpTo)} kilograms`}
                                                style={[styles.heroValue, TABULAR, { color: colors.text.primary }]}
                                            />
                                            <Text style={[styles.heroUnit, { color: colors.text.secondary }]}>kg</Text>
                                        </>
                                    ) : (
                                        <>
                                            <Text style={[styles.heroValue, TABULAR, { color: colors.text.primary }]}>
                                                {latest?.weightKg ?? '--'}
                                            </Text>
                                            <Text style={[styles.heroUnit, { color: colors.text.secondary }]}>kg</Text>
                                        </>
                                    )}
                                </View>

                                {/* Trend chip — direction by colour AND arrow (never colour alone). */}
                                {!loading && weightDelta !== null ? (
                                    (() => {
                                        const down = weightDelta < 0;
                                        const flat = weightDelta === 0;
                                        const tint = flat ? colors.text.tertiary : down ? colors.accent.cyan : colors.accent.amber;
                                        const icon = flat ? 'remove' : down ? 'arrow-down' : 'arrow-up';
                                        return (
                                            <View
                                                style={[styles.deltaChip, { backgroundColor: withAlpha(tint, 0.14) }]}
                                                accessibilityLabel={`${Math.abs(weightDelta).toFixed(1)} kilograms ${down ? 'down' : flat ? 'unchanged' : 'up'} since last entry`}
                                            >
                                                <Ionicons name={icon as any} size={13} color={tint} />
                                                <Text style={[typography.captionMedium, TABULAR, { color: tint, marginLeft: 3 }]}>
                                                    {Math.abs(weightDelta).toFixed(1)} kg
                                                </Text>
                                                <Text style={[typography.caption, { color: colors.text.tertiary, marginLeft: 5 }]}>
                                                    since last
                                                </Text>
                                            </View>
                                        );
                                    })()
                                ) : !loading ? (
                                    <Text style={[typography.caption, { color: colors.text.tertiary, marginTop: 8 }]}>
                                        Log again to see your trend
                                    </Text>
                                ) : null}
                            </View>

                            {/* Momentum ring — distinct snapshots logged in the window. Reads as
                                a progressbar so SR users hear the changing now/max, not a static image. */}
                            <View
                                accessibilityLabel={logCount >= LOG_TARGET ? 'Consistency unlocked: snapshot target reached' : `${logCount} of ${LOG_TARGET} snapshots logged`}
                                accessibilityRole="progressbar"
                                accessibilityValue={{ min: 0, max: LOG_TARGET, now: Math.min(logCount, LOG_TARGET) }}
                                style={!loading && logCount >= LOG_TARGET ? shadows.glow(colors.accent.coral) : undefined}
                            >
                                <CircularProgress
                                    size={92}
                                    strokeWidth={9}
                                    progress={logProgress}
                                    color={colors.accent.coral}
                                    trackColor={withAlpha(colors.accent.coral, 0.14)}
                                >
                                    <Text style={[styles.ringValue, TABULAR, { color: colors.text.primary }]}>{loading ? '--' : logCount}</Text>
                                    <Text style={[typography.overline, { color: colors.text.tertiary, fontSize: 9, letterSpacing: 1 }]}>LOGS</Text>
                                </CircularProgress>
                            </View>
                        </View>

                        {/* Secondary readout strip — body fat, subordinate to the weight hero. */}
                        <View style={[styles.heroStrip, { borderTopColor: colors.border.default }]}>
                            <View style={styles.heroStripItem}>
                                <Text style={[typography.overline, { color: colors.text.tertiary }]}>Body Fat</Text>
                                <Text style={[styles.stripValue, TABULAR, { color: colors.text.primary }]}>
                                    {loading ? '--' : (latest?.bodyFatPct ?? '--')}<Text style={[styles.stripUnit, { color: colors.text.secondary }]}>%</Text>
                                </Text>
                            </View>
                            <View style={[styles.heroStripDivider, { backgroundColor: colors.border.default }]} />
                            <View style={styles.heroStripItem}>
                                <Text style={[typography.overline, { color: colors.text.tertiary }]}>Last Logged</Text>
                                <Text style={[styles.stripValueSm, { color: colors.text.primary }]}>
                                    {loading || !latest ? '--' : new Date(latest.recordedAt ?? latest.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                </Text>
                            </View>
                        </View>
                    </GlassCard>
                </Animated.View>

                {/* ── Weight trend chart (lime area, gifted-charts) ──────────────────── */}
                <Animated.View entering={enter(1)} style={{ paddingHorizontal: spacing.xl, marginTop: spacing.lg }}>
                    <GlassCard radius={borderRadius['2xl']}>
                        <View style={styles.cardBody}>
                            <View style={styles.cardHeaderRow}>
                                <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: '700' }]}>Weight Trend</Text>
                                {/* Muted chrome — keeps the lime DATA LINE the sole lime anchor of this card. */}
                                <View style={[styles.headerBadge, { backgroundColor: withAlpha(colors.text.secondary, 0.1) }]}>
                                    <Ionicons name="trending-up" size={16} color={colors.text.secondary} />
                                </View>
                            </View>

                            {loading ? (
                                <View style={{ marginTop: 14 }}>
                                    <Skeleton width="100%" height={160} radius={borderRadius.lg} />
                                </View>
                            ) : weightSeries.length > 1 ? (
                                <Animated.View
                                    entering={FadeIn.duration(280)}
                                    style={{ marginTop: 14 }}
                                    accessibilityRole="image"
                                    accessibilityLabel={`Line chart of your body weight over the last ${weightSeries.length} snapshots, latest ${latestPoint?.value ?? ''} kilograms`}
                                >
                                    <WeightTrendChart
                                        values={weightSeries.map((p) => p.value)}
                                        width={width - 2 * spacing.xl - 36}
                                        height={150}
                                        color={colors.accent.coral}
                                        fillColor={colors.accent.coral}
                                        gridColor={withAlpha(colors.border.default, 0.6)}
                                        dotHaloColor={colors.background.secondary}
                                    />
                                    <View style={styles.trendAxis}>
                                        <Text style={[typography.caption, { color: colors.text.tertiary }]}>{firstPoint?.label ?? ''}</Text>
                                        <Text style={[typography.caption, { color: colors.text.secondary }]}>Latest</Text>
                                    </View>
                                </Animated.View>
                            ) : (
                                <View style={styles.chartEmpty}>
                                    <Ionicons name="pulse-outline" size={30} color={colors.text.tertiary} />
                                    <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 10, textAlign: 'center' }]}>
                                        Log a couple of weigh-ins to chart your trend
                                    </Text>
                                </View>
                            )}
                        </View>
                    </GlassCard>
                </Animated.View>

                {/* ── Measurements grid (latest tape circumferences) ─────────────────── */}
                <Animated.View entering={enter(2)} style={{ paddingHorizontal: spacing.xl, marginTop: spacing.lg }}>
                    <Text style={[typography.overline, { color: colors.text.tertiary, marginBottom: spacing.sm, marginLeft: 2 }]}>Latest Measurements</Text>
                    {loading ? (
                        <View style={styles.grid}>
                            {Array.from({ length: 4 }).map((_, i) => (
                                <View key={i} style={styles.gridCell}>
                                    <Skeleton width="100%" height={72} radius={borderRadius.lg} />
                                </View>
                            ))}
                        </View>
                    ) : measurementTiles.length > 0 ? (
                        <View style={styles.grid}>
                            {measurementTiles.map((tile) => (
                                <View key={tile.key} style={styles.gridCell}>
                                    <GlassCard radius={borderRadius.lg}>
                                        <View style={styles.tileBody}>
                                            <Text style={[styles.tileValue, TABULAR, { color: colors.text.primary }]}>
                                                {tile.value}<Text style={[styles.tileUnit, { color: colors.text.secondary }]}> cm</Text>
                                            </Text>
                                            <Text style={[typography.overline, { color: colors.text.tertiary }]}>{tile.label}</Text>
                                        </View>
                                    </GlassCard>
                                </View>
                            ))}
                        </View>
                    ) : (
                        <GlassCard radius={borderRadius.lg}>
                            <View style={styles.tapeHint}>
                                <Ionicons name="resize-outline" size={20} color={colors.text.tertiary} />
                                <Text style={[typography.caption, { color: colors.text.secondary, marginLeft: 10, flex: 1 }]}>
                                    Add tape measurements below to track chest, waist, arms and more.
                                </Text>
                            </View>
                        </GlassCard>
                    )}
                </Animated.View>

                {/* ── Log Form ───────────────────────────────────────────────────────── */}
                <Animated.View
                    entering={enter(3)}
                    onLayout={(e) => { formY.current = e.nativeEvent.layout.y; }}
                    style={{ paddingHorizontal: spacing.xl, marginTop: spacing.xl }}
                >
                    <GlassCard radius={borderRadius['2xl']} style={styles.form}>
                        <View style={styles.formBody}>
                        <Text style={[typography.h3, { color: colors.text.primary, marginBottom: 4 }]}>Log Today's Metrics</Text>
                        <Text style={[typography.caption, { color: colors.text.tertiary, marginBottom: 20 }]}>Capture a fresh snapshot to keep your trend honest.</Text>

                        <MeasurementInput label="Weight (kg)" value={weight} onChange={setWeight} placeholder="e.g. 82.5" error={weightError} />
                        <MeasurementInput label="Body Fat %" value={bodyFat} onChange={setBodyFat} placeholder="e.g. 15.2" error={bodyFatError} />

                        <PressableScale
                            accessibilityRole="button"
                            accessibilityLabel={showAdvanced ? 'Hide tape measurements' : 'Add tape measurements'}
                            accessibilityState={{ expanded: showAdvanced }}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            onPress={() => setShowAdvanced(!showAdvanced)}
                            style={[styles.tapeToggle, { borderColor: withAlpha(colors.accent.purple, 0.3), backgroundColor: withAlpha(colors.accent.purple, 0.08) }]}
                        >
                            <Ionicons name="resize-outline" size={18} color={colors.accent.purple} />
                            <Text style={[typography.subhead, { color: colors.accent.purple, fontWeight: '700', flex: 1, marginLeft: 8 }]}>
                                {showAdvanced ? 'Hide Tape Measurements' : 'Add Tape Measurements'}
                            </Text>
                            <Ionicons name={showAdvanced ? 'chevron-up' : 'chevron-down'} size={20} color={colors.accent.purple} />
                        </PressableScale>

                        {showAdvanced && (
                            <Animated.View entering={FadeInDown.duration(220)} style={{ marginTop: 16 }}>
                                <View style={{ flexDirection: 'row', gap: 12 }}>
                                    <View style={{ flex: 1 }}><MeasurementInput label="Chest (cm)" value={chest} onChange={setChest} placeholder="105" error={chestError} /></View>
                                    <View style={{ flex: 1 }}><MeasurementInput label="Arms (cm)" value={arm} onChange={setArm} placeholder="38" error={armError} /></View>
                                </View>
                                <View style={{ flexDirection: 'row', gap: 12 }}>
                                    <View style={{ flex: 1 }}><MeasurementInput label="Waist (cm)" value={waist} onChange={setWaist} placeholder="85" error={waistError} /></View>
                                    <View style={{ flex: 1 }}><MeasurementInput label="Hips (cm)" value={hips} onChange={setHips} placeholder="100" error={hipsError} /></View>
                                </View>
                                <View style={{ flexDirection: 'row', gap: 12 }}>
                                    <View style={{ flex: 1 }}><MeasurementInput label="Thighs (cm)" value={thigh} onChange={setThigh} placeholder="60" error={thighError} /></View>
                                    <View style={{ flex: 1 }}><MeasurementInput label="Calves (cm)" value={calf} onChange={setCalf} placeholder="40" error={calfError} /></View>
                                </View>
                            </Animated.View>
                        )}

                        {hasErrors ? (
                            <Text style={[typography.caption, { color: colors.accent.red, marginTop: 16, textAlign: 'center' }]}>
                                Fix the highlighted fields to save.
                            </Text>
                        ) : null}

                        {/* In-card peak-end "ending": the affirmation toast + one-time milestone
                            badge land right where the user just acted. The full-lime SAVE control
                            now lives in the pinned bottom bar below (sole lime action). */}
                        {showToast ? (
                            <MetricsSavedToast
                                key={toastKey}
                                milestone={milestoneToast}
                                onDone={() => setShowToast(false)}
                                style={{ marginTop: 20 }}
                            />
                        ) : null}
                        </View>
                    </GlassCard>
                </Animated.View>

                {/* ── History List ───────────────────────────────────────────────────── */}
                <Animated.View entering={enter(4)} style={{ paddingHorizontal: spacing.xl, marginTop: spacing.xl }}>
                    <Text style={[typography.h3, { color: colors.text.primary, marginBottom: spacing.md }]}>History</Text>
                    {historyQuery.isLoading ? (
                        <GlassCard radius={borderRadius['2xl']}>
                            <View style={styles.historyCardBody}>
                                {Array.from({ length: 4 }).map((_, i) => (
                                    <View key={i} style={[styles.historyRow, i < 3 && { borderBottomWidth: 1, borderBottomColor: colors.border.default }]}>
                                        <View>
                                            <Skeleton width={120} height={15} />
                                            <Skeleton width={90} height={12} style={{ marginTop: spacing.xs + 2 }} />
                                        </View>
                                        <Skeleton width={48} height={20} radius={borderRadius.sm} />
                                    </View>
                                ))}
                            </View>
                        </GlassCard>
                    ) : historyQuery.isError ? (
                        <EmptyState
                            icon="cloud-offline-outline"
                            title="Couldn't load history"
                            subtitle="Something went wrong fetching your measurements. Check your connection and try again."
                            actionLabel="Try Again"
                            onAction={() => historyQuery.refetch()}
                        />
                    ) : (historyQuery.data ?? []).length === 0 ? (
                        <EmptyState
                            icon="speedometer-outline"
                            title="No measurements yet"
                            subtitle="Log your weight, body fat, or tape measurements above to start tracking your progress over time."
                            actionLabel="Log first snapshot"
                            onAction={scrollToForm}
                        />
                    ) : (
                        <GlassCard radius={borderRadius['2xl']}>
                            <View style={styles.historyCardBody}>
                                {(historyQuery.data ?? []).map((entry, idx, arr) => {
                                    // Clean '--' fallbacks (matching the hero) so an absent value never
                                    // prints 'undefinedkg' or the sloppy '??' placeholder.
                                    const dateStr = new Date(entry.recordedAt ?? entry.date).toLocaleDateString();
                                    const wStr = entry.weightKg ?? '--';
                                    const bfStr = entry.bodyFatPct ?? '--';
                                    return (
                                        <View
                                            key={entry.id}
                                            // Static summary row — there is no per-entry detail screen, so it
                                            // carries no chevron / onPress. Described as one text node for SRs.
                                            accessibilityRole="text"
                                            accessibilityLabel={`${dateStr}: ${wStr} kilograms, ${bfStr} percent body fat${entry.waistCm ? `, waist ${entry.waistCm} centimetres` : ''}`}
                                            style={[styles.historyRow, idx < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border.default }]}
                                        >
                                            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                                                {/* Muted dot — list decoration, not a lime indicator. */}
                                                <View style={[styles.historyDot, { backgroundColor: withAlpha(colors.text.secondary, 0.1) }]}>
                                                    <Ionicons name="body-outline" size={16} color={colors.text.secondary} />
                                                </View>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={[typography.bodyMedium, { color: colors.text.primary, fontWeight: '600' }]}>
                                                        {dateStr}
                                                    </Text>
                                                    <Text style={[typography.caption, TABULAR, { color: colors.text.secondary }]}>
                                                        {wStr} kg • {bfStr}% BF
                                                    </Text>
                                                </View>
                                            </View>
                                            {entry.waistCm ? (
                                                <View style={[styles.miniBadge, { backgroundColor: colors.background.tertiary }]}>
                                                    <Text style={[typography.caption, TABULAR, { fontSize: 10, color: colors.text.secondary }]}>W: {entry.waistCm}</Text>
                                                </View>
                                            ) : null}
                                        </View>
                                    );
                                })}
                            </View>
                        </GlassCard>
                    )}
                </Animated.View>
            </ScrollView>

            {/* ── Pinned thumb-zone action bar ──────────────────────────────────────
                The ONE full-lime, ink-on-lime control, parked in the bottom third and
                safe-area-aware so it stays reachable however far the form scrolls (and
                regardless of the expanded tape section). The ScrollView reserves
                matching bottom padding so this never covers the last row. */}
            <View
                style={[
                    styles.actionBar,
                    {
                        paddingBottom: insets.bottom + 12,
                        backgroundColor: withAlpha(colors.background.primary, 0.96),
                        borderTopColor: colors.border.default,
                    },
                ]}
            >
                <PressableScale
                    accessibilityRole="button"
                    accessibilityLabel="Save snapshot"
                    accessibilityState={{ disabled: saveDisabled, busy: mutation.isPending }}
                    style={[styles.submitBtn, { backgroundColor: colors.accent.coral, borderRadius: borderRadius.xl }, saveDisabled && { opacity: 0.5 }, !saveDisabled && shadows.glow(colors.accent.coral)]}
                    onPress={handleLog}
                    disabled={saveDisabled}
                >
                    {mutation.isPending ? (
                        <ActivityIndicator color={colors.text.inverse} />
                    ) : (
                        <>
                            <Ionicons name="add-circle" size={19} color={colors.text.inverse} />
                            <Text style={[typography.subhead, { color: colors.text.inverse, fontWeight: '800', marginLeft: 8 }]}>Save Snapshot</Text>
                        </>
                    )}
                </PressableScale>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1 },
    headerBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },

    // ── Hero ────────────────────────────────────────────────────────────────
    heroBody: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 22, paddingBottom: 18 },
    heroLeft: { flex: 1, paddingRight: 12 },
    heroValueRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 4, position: 'relative' },
    // Soft bloom behind the numeral for the save celebration (opacity-animated, 0 at rest).
    heroGlow: { position: 'absolute', left: -10, top: -6, width: 150, height: 70, borderRadius: 40, opacity: 0 },
    // The VALUE dominates: oversized Barlow Condensed numeral, label is a small overline above.
    heroValue: { fontFamily: typo.display.fontFamily, fontSize: 56, lineHeight: 60 },
    heroUnit: { fontFamily: typo.statTiny.fontFamily, fontSize: 18, marginLeft: 6 },
    deltaChip: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, marginTop: 10 },
    ringValue: { fontFamily: typo.statSmall.fontFamily, fontSize: 22, lineHeight: 24 },
    heroStrip: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, paddingHorizontal: 22, paddingVertical: 14 },
    heroStripItem: { flex: 1 },
    heroStripDivider: { width: 1, height: 30, marginHorizontal: 16 },
    stripValue: { fontFamily: typo.statSmall.fontFamily, fontSize: 24, lineHeight: 28, marginTop: 4 },
    stripUnit: { fontFamily: typo.statTiny.fontFamily, fontSize: 13 },
    stripValueSm: { fontFamily: typo.statSmall.fontFamily, fontSize: 20, lineHeight: 26, marginTop: 4 },

    // ── Cards / charts ────────────────────────────────────────────────────────
    cardBody: { padding: 18 },
    cardHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    headerBadge: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    chartEmpty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 36, paddingHorizontal: 20 },
    trendAxis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, paddingHorizontal: 2 },

    // ── Measurements grid ─────────────────────────────────────────────────────
    grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6 },
    gridCell: { width: '50%', paddingHorizontal: 6, marginBottom: 12 },
    tileBody: { padding: 14 },
    tileValue: { fontFamily: typo.statMedium.fontFamily, fontSize: 28, lineHeight: 34, marginBottom: 2 },
    tileUnit: { fontFamily: typo.statTiny.fontFamily, fontSize: 13 },
    tapeHint: { flexDirection: 'row', alignItems: 'center', padding: 16 },

    // ── Form ──────────────────────────────────────────────────────────────────
    form: {},
    // Restores the legacy Card padding="2xl" (24) the form rendered with — moved
    // into a body View because GlassCard carries no internal padding.
    formBody: { padding: 24 },
    input: { padding: 14, fontSize: 16, borderWidth: 1 },
    tapeToggle: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 13, borderRadius: 14, borderWidth: 1, marginVertical: 12 },
    submitBtn: { height: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
    // Pinned thumb-zone bar: hairline top border + safe-area padding applied inline.
    actionBar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 12, borderTopWidth: 1 },

    // ── History ────────────────────────────────────────────────────────────────
    historyCardBody: { paddingHorizontal: 16 },
    historyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14 },
    historyDot: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
    miniBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
});
