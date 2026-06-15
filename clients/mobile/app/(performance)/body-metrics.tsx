import React, { useState } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
    ActivityIndicator, Alert, Dimensions,
} from 'react-native';

import { useRouter } from 'expo-router';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getBodyMetrics, logBodyMetrics, BodyMetrics } from '@/api/progress';
import { Card } from '@/components/ui/Card';
import { Skeleton, SkeletonCard, EmptyState } from '@/components/ui';
import { withAlpha } from '@/theme/utils';
import { typography as typo } from '@/theme/typography';

const { width } = Dimensions.get('window');

const MeasurementInput = ({ label, value, onChange, placeholder }: any) => {
    const { colors, typography, borderRadius } = useTheme();
    return (
        <View style={{ marginBottom: 16 }}>
            <Text style={[typography.captionMedium, { color: colors.text.secondary, marginBottom: 8 }]}>{label}</Text>
            <TextInput
                style={[styles.input, { color: colors.text.primary, backgroundColor: colors.background.tertiary, borderRadius: borderRadius.lg, borderColor: colors.border.default }]}
                placeholder={placeholder}
                placeholderTextColor={colors.text.tertiary}
                keyboardType="numeric"
                value={value}
                onChangeText={onChange}
            />
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

    const handleLog = () => {
        if (!weight && !bodyFat && !chest && !arm && !waist && !hips && !thigh && !calf) return;
        mutation.mutate({
            weightKg: weight ? parseFloat(weight) : undefined,
            bodyFatPct: bodyFat ? parseFloat(bodyFat) : undefined,
            chestCm: chest ? parseFloat(chest) : undefined,
            armsCm: arm ? parseFloat(arm) : undefined,
            waistCm: waist ? parseFloat(waist) : undefined,
            hipsCm: hips ? parseFloat(hips) : undefined,
            thighsCm: thigh ? parseFloat(thigh) : undefined,
            calvesCm: calf ? parseFloat(calf) : undefined,
        });
    };

    const latest = historyQuery.data?.[0];

    return (
        <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background.primary }]}>
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
                    <Card variant="glass" style={styles.statBox}>
                        <Text style={[typography.overline, { color: colors.text.secondary }]}>Latest Weight</Text>
                        <Text style={[styles.statValue, { color: colors.text.primary }]}>
                            {latest?.weightKg || '--'} <Text style={[styles.statUnit, { color: colors.text.secondary }]}>kg</Text>
                        </Text>
                    </Card>
                    <Card variant="glass" style={styles.statBox}>
                        <Text style={[typography.overline, { color: colors.text.secondary }]}>Body Fat</Text>
                        <Text style={[styles.statValue, { color: colors.text.primary }]}>
                            {latest?.bodyFatPct || '--'}<Text style={[styles.statUnit, { color: colors.text.secondary }]}>%</Text>
                        </Text>
                    </Card>
                </View>

                {/* Log Form */}
                <View style={{ paddingHorizontal: spacing.xl, marginTop: spacing['2xl'] }}>
                    <Card variant="glass" style={styles.form} padding="2xl">
                        <Text style={[typography.h3, { color: colors.text.primary, marginBottom: 20 }]}>Log Today's Metrics</Text>

                        <MeasurementInput label="Weight (kg)" value={weight} onChange={setWeight} placeholder="e.g. 82.5" />
                        <MeasurementInput label="Body Fat %" value={bodyFat} onChange={setBodyFat} placeholder="e.g. 15.2" />

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
                                    <View style={{ flex: 1 }}><MeasurementInput label="Chest (cm)" value={chest} onChange={setChest} placeholder="105" /></View>
                                    <View style={{ flex: 1 }}><MeasurementInput label="Arms (cm)" value={arm} onChange={setArm} placeholder="38" /></View>
                                </View>
                                <View style={{ flexDirection: 'row', gap: 12 }}>
                                    <View style={{ flex: 1 }}><MeasurementInput label="Waist (cm)" value={waist} onChange={setWaist} placeholder="85" /></View>
                                    <View style={{ flex: 1 }}><MeasurementInput label="Hips (cm)" value={hips} onChange={setHips} placeholder="100" /></View>
                                </View>
                                <View style={{ flexDirection: 'row', gap: 12 }}>
                                    <View style={{ flex: 1 }}><MeasurementInput label="Thighs (cm)" value={thigh} onChange={setThigh} placeholder="60" /></View>
                                    <View style={{ flex: 1 }}><MeasurementInput label="Calves (cm)" value={calf} onChange={setCalf} placeholder="40" /></View>
                                </View>
                            </View>
                        )}

                        <TouchableOpacity
                            accessibilityRole="button"
                            accessibilityLabel="Save snapshot"
                            accessibilityState={{ disabled: mutation.isPending }}
                            style={[styles.submitBtn, { backgroundColor: colors.accent.purple, borderRadius: borderRadius.xl, marginTop: 24 }, !mutation.isPending && shadows.glow(colors.accent.purple)]}
                            onPress={handleLog}
                            disabled={mutation.isPending}
                            activeOpacity={0.9}
                        >
                            {mutation.isPending ? (
                                <ActivityIndicator color={colors.text.primary} />
                            ) : (
                                <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: '700' }]}>Save Snapshot</Text>
                            )}
                        </TouchableOpacity>
                    </Card>
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
                                {entry.waistCm && <View style={[styles.miniBadge, { backgroundColor: colors.background.tertiary }]}><Text style={[typography.caption, { fontSize: 10, color: colors.text.secondary }]}>W: {entry.waistCm}</Text></View>}
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
    statValue: { fontFamily: typo.statMedium.fontFamily, fontSize: 30, lineHeight: 38, marginTop: 6 },
    statUnit: { fontFamily: typo.statTiny.fontFamily, fontSize: 14 },
    form: {},
    input: { padding: 14, fontSize: 16, borderWidth: 1 },
    submitBtn: { height: 52, alignItems: 'center', justifyContent: 'center' },
    historyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1 },
    miniBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
});
