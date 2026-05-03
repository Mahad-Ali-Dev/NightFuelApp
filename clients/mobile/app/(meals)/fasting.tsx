import React, { useState, useEffect } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    ActivityIndicator, Dimensions, Alert
} from 'react-native';

import { useRouter } from 'expo-router';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getFastingLogs, startFasting, endFasting, FastingLog } from '@/api/meals';
import { CircularProgress } from '@/components/ui/CircularProgress';
import { Button, Card } from '@/components/ui';
import { format, differenceInSeconds, parseISO, addHours } from 'date-fns';

const { width } = Dimensions.get('window');

const PROTOCOLS = [
    { label: '16:8', hours: 16 },
    { label: '18:6', hours: 18 },
    { label: '20:4', hours: 20 },
    { label: '24h', hours: 24 },
];

export default function FastingScreen() {
    const { colors, typography, spacing, borderRadius } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const queryClient = useQueryClient();

    const [selectedHours, setSelectedHours] = useState(16);
    const [elapsed, setElapsed] = useState(0);

    // ── Queries ─────────────────────────────────────────────────────────────
    const fastingQuery = useQuery({
        queryKey: ['fasting-logs'],
        queryFn: () => getFastingLogs(1),
    });

    const startMutation = useMutation({
        mutationFn: (h: number) => startFasting(h),
        onError: (err: any) => { Alert.alert('Error', err?.response?.data?.message ?? err?.message ?? 'Something went wrong'); },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['fasting-logs'] }),
    });

    const endMutation = useMutation({
        mutationFn: () => endFasting(),
        onError: (err: any) => { Alert.alert('Error', err?.response?.data?.message ?? err?.message ?? 'Something went wrong'); },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['fasting-logs'] }),
    });

    const activeFast = fastingQuery.data?.[0]?.status === 'ACTIVE' ? fastingQuery.data[0] : null;

    useEffect(() => {
        let interval: ReturnType<typeof setInterval>;
        if (activeFast?.startedAt) {
            interval = setInterval(() => {
                try {
                    const seconds = differenceInSeconds(new Date(), parseISO(activeFast.startedAt));
                    setElapsed(seconds);
                } catch { /* guard against malformed dates */ }
            }, 1000);
        } else {
            setElapsed(0);
        }
        return () => clearInterval(interval);
    }, [activeFast]);

    const progress = activeFast?.targetHours ? Math.min(1, elapsed / (activeFast.targetHours * 3600)) : 0;

    const formatTime = (totalSeconds: number) => {
        const h = Math.floor(totalSeconds / 3600);
        const m = Math.floor((totalSeconds % 3600) / 60);
        const s = totalSeconds % 60;
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
            {/* Header */}
            <View style={[styles.header, { paddingTop: insets.top + 20, borderBottomColor: colors.border.default }]}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
                </TouchableOpacity>
                <Text style={[typography.heading, { color: colors.text.primary, fontSize: 18 }]}>Fasting Tracker</Text>
                <TouchableOpacity style={styles.backBtn}>
                    <Ionicons name="stats-chart-outline" size={24} color={colors.text.primary} />
                </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: 20, alignItems: 'center', paddingBottom: 100 }}>
                {/* Timer Circle */}
                <View style={styles.timerContainer}>
                    <CircularProgress
                        progress={progress}
                        size={width * 0.75}
                        strokeWidth={20}
                        color={colors.accent.cyan}
                        trackColor={colors.background.tertiary}
                    />
                    <View style={styles.timerCenter}>
                        <Text style={[typography.caption, { color: colors.text.tertiary, fontWeight: 'bold' }]}>
                            {activeFast ? 'ELAPSED TIME' : 'READY TO START'}
                        </Text>
                        <Text style={[typography.display, { color: colors.text.primary, fontSize: 48, letterSpacing: -1, marginVertical: 8 }]}>
                            {activeFast ? formatTime(elapsed) : '00:00:00'}
                        </Text>
                        {activeFast && (
                            <Text style={[typography.caption, { color: colors.accent.cyan, fontWeight: 'bold' }]}>
                                {Math.round(progress * 100)}% COMPLETE
                            </Text>
                        )}
                    </View>
                </View>

                {/* Info Cards */}
                <View style={styles.infoRow}>
                    <View style={[styles.infoCard, { backgroundColor: colors.background.secondary, borderRadius: borderRadius.xl }]}>
                        <Text style={[typography.caption, { color: colors.text.tertiary }]}>Target</Text>
                        <Text style={[typography.heading, { color: colors.text.primary, fontSize: 20 }]}>
                            {activeFast ? activeFast.targetHours : selectedHours}h
                        </Text>
                    </View>
                    <View style={[styles.infoCard, { backgroundColor: colors.background.secondary, borderRadius: borderRadius.xl }]}>
                        <Text style={[typography.caption, { color: colors.text.tertiary }]}>Ends At</Text>
                        <Text style={[typography.heading, { color: colors.text.primary, fontSize: 20 }]}>
                            {activeFast?.startedAt
                                ? (() => { try { return format(addHours(parseISO(activeFast.startedAt), activeFast.targetHours), 'HH:mm'); } catch { return '--:--'; } })()
                                : '--:--'}
                        </Text>
                    </View>
                </View>

                {/* Protocol Selection */}
                {!activeFast && (
                    <View style={{ width: '100%', marginTop: 32 }}>
                        <Text style={[typography.caption, { color: colors.text.tertiary, fontWeight: 'bold', marginBottom: 12 }]}>SELECT PROTOCOL</Text>
                        <View style={styles.protocolGrid}>
                            {PROTOCOLS.map((p) => (
                                <TouchableOpacity
                                    key={p.label}
                                    style={[styles.protocolBtn, { backgroundColor: selectedHours === p.hours ? colors.accent.cyan : colors.background.secondary, borderColor: colors.border.default }]}
                                    onPress={() => setSelectedHours(p.hours)}
                                >
                                    <Text style={[typography.subhead, { color: selectedHours === p.hours ? colors.background.primary : colors.text.primary, fontWeight: 'bold' }]}>{p.label}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>
                )}

                {/* Action Button */}
                <Button
                    title={activeFast ? (elapsed >= activeFast.targetHours * 3600 ? 'COMPLETE FAST' : 'END FAST EARLY') : 'START FASTING'}
                    variant={activeFast ? "outline" : "primary"}
                    style={{ width: '100%', marginTop: 40, height: 60 }}
                    onPress={() => activeFast ? endMutation.mutate() : startMutation.mutate(selectedHours)}
                    disabled={startMutation.isPending || endMutation.isPending}
                />

                {/* Tips Card */}
                <Card style={[styles.tipsCard, { backgroundColor: `${colors.accent.cyan}10`, borderColor: colors.accent.cyan, marginTop: 40 }]}>
                    <View style={styles.tipsHeader}>
                        <Ionicons name="bulb-outline" size={20} color={colors.accent.cyan} />
                        <Text style={[typography.subhead, { color: colors.accent.cyan, fontWeight: 'bold', marginLeft: 12 }]}>Ria's Fasting Tip</Text>
                    </View>
                    <Text style={[typography.body, { color: colors.text.secondary, marginTop: 8 }]}>
                        Drinking water or black coffee won't break your metabolic fast. Stay hydrated to maintain mental clarity during the final hours.
                    </Text>
                </Card>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1 },
    backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    timerContainer: { marginTop: 40, alignItems: 'center', justifyContent: 'center' },
    timerCenter: { position: 'absolute', alignItems: 'center' },
    infoRow: { flexDirection: 'row', gap: 16, marginTop: 40, width: '100%' },
    infoCard: { flex: 1, padding: 20, alignItems: 'center' },
    protocolGrid: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
    protocolBtn: { flex: 1, height: 60, alignItems: 'center', justifyContent: 'center', borderRadius: 16, borderWidth: 1, minWidth: '45%' },
    tipsCard: { padding: 20 },
    tipsHeader: { flexDirection: 'row', alignItems: 'center' },
});
