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

const { width } = Dimensions.get('window');

export default function BodyMetricsScreen() {
    const { colors, typography, spacing, borderRadius } = useTheme();
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

    const MeasurementInput = ({ label, value, onChange, placeholder }: any) => (
        <View style={{ marginBottom: 16 }}>
            <Text style={[typography.caption, { color: colors.text.secondary, marginBottom: 8 }]}>{label}</Text>
            <TextInput
                style={[styles.input, { color: colors.text.primary, backgroundColor: colors.background.tertiary, borderRadius: borderRadius.lg }]}
                placeholder={placeholder}
                placeholderTextColor={colors.text.tertiary}
                keyboardType="numeric"
                value={value}
                onChangeText={onChange}
            />
        </View>
    );

    return (
        <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background.primary }]}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.border.default }]}>
                <TouchableOpacity onPress={() => router.back()}>
                    <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
                </TouchableOpacity>
                <Text style={[typography.heading, { color: colors.text.primary, fontSize: 20 }]}>Body Metrics</Text>
                <View style={{ width: 24 }} />
            </View>

            <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
                {/* Stats Row */}
                <View style={styles.statsRow}>
                    <View style={[styles.statBox, { backgroundColor: colors.background.secondary, borderColor: colors.border.default, borderRadius: borderRadius.xl }]}>
                        <Text style={[typography.caption, { color: colors.text.tertiary }]}>Latest Weight</Text>
                        <Text style={[typography.display, { color: colors.text.primary, fontSize: 28, marginTop: 4 }]}>
                            {latest?.weightKg || '--'} <Text style={{ fontSize: 14 }}>kg</Text>
                        </Text>
                    </View>
                    <View style={[styles.statBox, { backgroundColor: colors.background.secondary, borderColor: colors.border.default, borderRadius: borderRadius.xl }]}>
                        <Text style={[typography.caption, { color: colors.text.tertiary }]}>Body Fat</Text>
                        <Text style={[typography.display, { color: colors.text.primary, fontSize: 28, marginTop: 4 }]}>
                            {latest?.bodyFatPct || '--'}<Text style={{ fontSize: 14 }}>%</Text>
                        </Text>
                    </View>
                </View>

                {/* Log Form */}
                <View style={{ paddingHorizontal: spacing.xl, marginTop: spacing['2xl'] }}>
                    <View style={[styles.form, { backgroundColor: colors.background.secondary, borderRadius: borderRadius['2xl'], padding: 24 }]}>
                        <Text style={[typography.heading, { color: colors.text.primary, fontSize: 18, marginBottom: 20 }]}>Log Today's Metrics</Text>

                        <MeasurementInput label="Weight (kg)" value={weight} onChange={setWeight} placeholder="e.g. 82.5" />
                        <MeasurementInput label="Body Fat %" value={bodyFat} onChange={setBodyFat} placeholder="e.g. 15.2" />

                        <TouchableOpacity
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
                            style={[styles.submitBtn, { backgroundColor: colors.accent.purple, borderRadius: borderRadius.xl, marginTop: 24 }]}
                            onPress={handleLog}
                            disabled={mutation.isPending}
                        >
                            {mutation.isPending ? (
                                <ActivityIndicator color="#fff" />
                            ) : (
                                <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: '700' }]}>Save Snapshot</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>

                {/* History List */}
                <View style={{ paddingHorizontal: spacing.xl, marginTop: spacing['2xl'] }}>
                    <Text style={[typography.heading, { color: colors.text.primary, marginBottom: spacing.md }]}>History</Text>
                    {historyQuery.isLoading ? (
                        <ActivityIndicator color={colors.accent.purple} />
                    ) : (historyQuery.data ?? []).map((entry) => (
                        <View
                            key={entry.id}
                            style={[styles.historyRow, { borderBottomColor: colors.border.default }]}
                        >
                            <View>
                                <Text style={[typography.body, { color: colors.text.primary, fontWeight: '600' }]}>
                                    {new Date(entry.recordedAt ?? entry.date).toLocaleDateString()}
                                </Text>
                                <Text style={[typography.caption, { color: colors.text.tertiary }]}>
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
    statsRow: { flexDirection: 'row', paddingHorizontal: 20, marginTop: 20, gap: 12 },
    statBox: { flex: 1, padding: 20, borderWidth: 1 },
    form: { elevation: 2 },
    input: { padding: 14, fontSize: 16 },
    submitBtn: { height: 50, alignItems: 'center', justifyContent: 'center' },
    historyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1 },
    miniBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
});
