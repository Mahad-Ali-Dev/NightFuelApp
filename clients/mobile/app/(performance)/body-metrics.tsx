import React, { useState } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
    ActivityIndicator, Alert, Dimensions,
} from 'react-native';

import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getBodyMetrics, logBodyMetrics, BodyMetrics } from '@/api/progress';
import { Skeleton, SkeletonCard, EmptyState, GlassCard } from '@/components/ui';
import { withAlpha } from '@/theme/utils';
import { typography as typo } from '@/theme/typography';

const { width } = Dimensions.get('window');

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

    const historyQuery = useQuery({
        queryKey: ['body-metrics'],
        queryFn: () => getBodyMetrics(30),
    });

    const mutation = useMutation({
        mutationFn: (payload: any) => logBodyMetrics(payload),
        onError: (err: any) => { Alert.alert('Error', err?.response?.data?.message ?? err?.message ?? 'Something went wrong'); },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['body-metrics'] });
            setWeight('');
            setBodyFat('');
            setChest('');
            setArm('');
            setWaist('');
            setHips('');
            setThigh('');
            setCalf('');
            Alert.alert('Success', 'Metrics logged successfully');
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
        mutation.mutate({
            weightKg: toFiniteMeasurement(weight),
            bodyFatPct: toFiniteMeasurement(bodyFat),
            chestCm: toFiniteMeasurement(chest),
            armsCm: toFiniteMeasurement(arm),
            waistCm: toFiniteMeasurement(waist),
            hipsCm: toFiniteMeasurement(hips),
            thighsCm: toFiniteMeasurement(thigh),
            calvesCm: toFiniteMeasurement(calf),
        });
    };

    const latest = historyQuery.data?.[0];

    return (
        <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background.primary }]}>
            <StatusBar style="light" />
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.border.default }]}>
                <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Go back" activeOpacity={0.85} onPress={() => router.back()} style={[styles.headerBtn, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
                    <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
                </TouchableOpacity>
                <Text style={[typography.h3, { color: colors.text.primary }]}>Body Metrics</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
                {/* Stats Row */}
                <View style={styles.statsRow}>
                    <GlassCard style={styles.statBox}>
                        <View style={styles.statBoxBody}>
                            <Text style={[typography.overline, { color: colors.text.secondary }]}>Latest Weight</Text>
                            <Text style={[styles.statValue, { color: colors.text.primary }]}>
                                {latest?.weightKg ?? '--'} <Text style={[styles.statUnit, { color: colors.text.secondary }]}>kg</Text>
                            </Text>
                        </View>
                    </GlassCard>
                    <GlassCard style={styles.statBox}>
                        <View style={styles.statBoxBody}>
                            <Text style={[typography.overline, { color: colors.text.secondary }]}>Body Fat</Text>
                            <Text style={[styles.statValue, { color: colors.text.primary }]}>
                                {latest?.bodyFatPct ?? '--'}<Text style={[styles.statUnit, { color: colors.text.secondary }]}>%</Text>
                            </Text>
                        </View>
                    </GlassCard>
                </View>

                {/* Log Form */}
                <View style={{ paddingHorizontal: spacing.xl, marginTop: spacing['2xl'] }}>
                    <GlassCard style={styles.form}>
                        <View style={styles.formBody}>
                        <Text style={[typography.h3, { color: colors.text.primary, marginBottom: 20 }]}>Log Today's Metrics</Text>

                        <MeasurementInput label="Weight (kg)" value={weight} onChange={setWeight} placeholder="e.g. 82.5" error={weightError} />
                        <MeasurementInput label="Body Fat %" value={bodyFat} onChange={setBodyFat} placeholder="e.g. 15.2" error={bodyFatError} />

                        <TouchableOpacity
                            activeOpacity={0.7}
                            accessibilityRole="button"
                            accessibilityLabel={showAdvanced ? 'Hide tape measurements' : 'Add tape measurements'}
                            accessibilityState={{ expanded: showAdvanced }}
                            onPress={() => setShowAdvanced(!showAdvanced)}
                            style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 12 }}
                        >
                            <Text style={[typography.subhead, { color: colors.accent.purple, fontWeight: '700' }]}>
                                {showAdvanced ? 'Hide Tape Measurements' : 'Add Tape Measurements'}
                            </Text>
                            <Ionicons name={showAdvanced ? 'chevron-up' : 'chevron-down'} size={20} color={colors.accent.purple} style={{ marginLeft: 6 }} />
                        </TouchableOpacity>

                        {showAdvanced && (
                            <View style={{ marginTop: 8 }}>
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
                            </View>
                        )}

                        <TouchableOpacity
                            accessibilityRole="button"
                            accessibilityLabel="Save snapshot"
                            accessibilityState={{ disabled: saveDisabled, busy: mutation.isPending }}
                            style={[styles.submitBtn, { backgroundColor: colors.accent.purple, borderRadius: borderRadius.xl, marginTop: 24 }, saveDisabled && { opacity: 0.5 }, !saveDisabled && shadows.glow(colors.accent.purple)]}
                            onPress={handleLog}
                            disabled={saveDisabled}
                            activeOpacity={0.9}
                        >
                            {mutation.isPending ? (
                                <ActivityIndicator color={colors.text.primary} />
                            ) : (
                                <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: '700' }]}>Save Snapshot</Text>
                            )}
                        </TouchableOpacity>
                        </View>
                    </GlassCard>
                </View>

                {/* History List */}
                <View style={{ paddingHorizontal: spacing.xl, marginTop: spacing['2xl'] }}>
                    <Text style={[typography.h3, { color: colors.text.primary, marginBottom: spacing.md }]}>History</Text>
                    {historyQuery.isLoading ? (
                        <View>
                            {Array.from({ length: 4 }).map((_, i) => (
                                <View key={i} style={[styles.historyRow, { borderBottomColor: colors.border.default }]}>
                                    <View>
                                        <Skeleton width={120} height={15} />
                                        <Skeleton width={90} height={12} style={{ marginTop: spacing.xs + 2 }} />
                                    </View>
                                    <Skeleton width={48} height={20} radius={borderRadius.sm} />
                                </View>
                            ))}
                        </View>
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
                        />
                    ) : (historyQuery.data ?? []).map((entry) => (
                        <View
                            key={entry.id}
                            style={[styles.historyRow, { borderBottomColor: colors.border.default }]}
                        >
                            <View>
                                <Text style={[typography.body, { color: colors.text.primary, fontWeight: '600' }]}>
                                    {new Date(entry.recordedAt ?? entry.date).toLocaleDateString()}
                                </Text>
                                <Text style={[typography.caption, { color: colors.text.secondary }]}>
                                    {entry.weightKg}kg • {entry.bodyFatPct || '??'}% BF
                                </Text>
                            </View>
                            <View style={{ flexDirection: 'row', gap: 8 }}>
                                {entry.waistCm ? (
                                    <View style={[styles.miniBadge, { backgroundColor: colors.background.tertiary }]}>
                                        <Text style={[typography.caption, { fontSize: 10, color: colors.text.secondary }]}>W: {entry.waistCm}</Text>
                                    </View>
                                ) : null}
                                <Ionicons name="chevron-forward" size={16} color={colors.text.tertiary} />
                            </View>
                        </View>
                    ))}
                </View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1 },
    headerBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    statsRow: { flexDirection: 'row', paddingHorizontal: 20, marginTop: 20, gap: 12 },
    statBox: { flex: 1 },
    // GlassCard owns no internal padding (unlike the legacy Card padding="lg"),
    // so the body View supplies the lg (16) inset the stat boxes rendered with.
    statBoxBody: { padding: 16 },
    statValue: { fontFamily: typo.statMedium.fontFamily, fontSize: 30, lineHeight: 38, marginTop: 6 },
    statUnit: { fontFamily: typo.statTiny.fontFamily, fontSize: 14 },
    form: {},
    // Restores the legacy Card padding="2xl" (24) the form rendered with — moved
    // into a body View because GlassCard carries no internal padding.
    formBody: { padding: 24 },
    input: { padding: 14, fontSize: 16, borderWidth: 1 },
    submitBtn: { height: 52, alignItems: 'center', justifyContent: 'center' },
    historyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1 },
    miniBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
});
