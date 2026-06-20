import React, { useState, useEffect } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    Dimensions, Alert
} from 'react-native';

import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getFastingLogs, startFasting, endFasting, FastingLog } from '@/api/meals';
import { CircularProgress } from '@/components/ui/CircularProgress';
import { Button, Card, GlassCard, CtaButton, Skeleton, EmptyState } from '@/components/ui';
import { shadows } from '@/theme/shadows';
import { withAlpha } from '@/theme/utils';
import { getErrorMessage } from '@/utils/validation';
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
        onError: (err: unknown) => { Alert.alert('Error', getErrorMessage(err)); },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['fasting-logs'] }),
    });

    const endMutation = useMutation({
        mutationFn: () => endFasting(),
        onError: (err: unknown) => { Alert.alert('Error', getErrorMessage(err)); },
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
            <StatusBar style="light" />
            {/* Header */}
            <View style={[styles.header, { paddingTop: insets.top + 20, borderBottomColor: colors.border.default }]}>
                <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
                    <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
                </TouchableOpacity>
                <Text style={[typography.h2, { color: colors.text.primary }]}>Fasting</Text>
                <View style={{ width: 40 }} />
            </View>

            {fastingQuery.isLoading ? (
                <ScrollView contentContainerStyle={{ padding: 20, alignItems: 'center', paddingBottom: 100 }}>
                    <Skeleton width={width * 0.75} height={width * 0.75} radius={borderRadius.full} style={{ marginTop: 40 }} />
                    <View style={styles.infoRow}>
                        <Skeleton width="48%" height={76} radius={borderRadius.xl} />
                        <Skeleton width="48%" height={76} radius={borderRadius.xl} />
                    </View>
                    <Skeleton width="100%" height={60} radius={borderRadius.xl} style={{ marginTop: 40 }} />
                    <Skeleton width="100%" height={110} radius={borderRadius.xl} style={{ marginTop: 40 }} />
                </ScrollView>
            ) : fastingQuery.isError ? (
                <EmptyState
                    icon="cloud-offline-outline"
                    title="Couldn't load fasting"
                    subtitle="Something went wrong loading your fasting status. Check your connection and try again."
                    actionLabel="Try Again"
                    onAction={() => fastingQuery.refetch()}
                />
            ) : (
            <ScrollView contentContainerStyle={{ padding: 20, alignItems: 'center', paddingBottom: 100 }}>
                {/* Timer Circle */}
                <View style={[styles.timerContainer, activeFast && shadows.glow(colors.accent.cyan)]}>
                    <CircularProgress
                        progress={progress}
                        size={width * 0.75}
                        strokeWidth={20}
                        color={colors.accent.cyan}
                        trackColor={colors.background.tertiary}
                    />
                    <View style={styles.timerCenter}>
                        <Text style={[typography.overline, { color: colors.text.secondary }]}>
                            {activeFast ? 'ELAPSED TIME' : 'READY TO START'}
                        </Text>
                        <Text style={[typography.statLarge, { color: colors.text.primary, marginVertical: 8 }]}>
                            {activeFast ? formatTime(elapsed) : '00:00:00'}
                        </Text>
                        {activeFast && (
                            <Text style={[typography.overline, { color: colors.accent.cyan }]}>
                                {Math.round(progress * 100)}% COMPLETE
                            </Text>
                        )}
                    </View>
                </View>

                {/* Info Cards */}
                <View style={styles.infoRow}>
                    <GlassCard style={styles.infoCard} radius={borderRadius.xl}>
                        <View style={styles.infoCardInner}>
                            <Text style={[typography.overline, { color: colors.text.secondary }]}>Target</Text>
                            <Text style={[typography.statSmall, { color: colors.text.primary, marginTop: 4 }]}>
                                {activeFast ? activeFast.targetHours : selectedHours}h
                            </Text>
                        </View>
                    </GlassCard>
                    <GlassCard style={styles.infoCard} radius={borderRadius.xl}>
                        <View style={styles.infoCardInner}>
                            <Text style={[typography.overline, { color: colors.text.secondary }]}>Ends At</Text>
                            <Text style={[typography.statSmall, { color: colors.text.primary, marginTop: 4 }]}>
                                {activeFast?.startedAt
                                    ? (() => { try { return format(addHours(parseISO(activeFast.startedAt), activeFast.targetHours), 'HH:mm'); } catch { return '--:--'; } })()
                                    : '--:--'}
                            </Text>
                        </View>
                    </GlassCard>
                </View>

                {/* Protocol Selection */}
                {!activeFast && (
                    <View style={{ width: '100%', marginTop: 32 }}>
                        <Text style={[typography.overline, { color: colors.text.secondary, marginBottom: 12 }]}>SELECT PROTOCOL</Text>
                        <View style={styles.protocolGrid}>
                            {PROTOCOLS.map((p) => {
                                const active = selectedHours === p.hours;
                                return (
                                <TouchableOpacity
                                    key={p.label}
                                    accessibilityRole="button"
                                    accessibilityState={{ selected: active }}
                                    accessibilityLabel={`${p.label} fasting protocol`}
                                    style={[styles.protocolBtn, { backgroundColor: active ? colors.accent.cyan : colors.background.secondary, borderColor: active ? colors.accent.cyan : colors.border.default }, active && shadows.glow(colors.accent.cyan)]}
                                    onPress={() => setSelectedHours(p.hours)}
                                >
                                    <Text style={[typography.subhead, { color: active ? colors.background.primary : colors.text.primary, fontWeight: 'bold' }]}>{p.label}</Text>
                                </TouchableOpacity>
                                );
                            })}
                        </View>
                    </View>
                )}

                {/* Action Button */}
                {activeFast ? (
                    <Button
                        title={elapsed >= activeFast.targetHours * 3600 ? 'COMPLETE FAST' : 'END FAST EARLY'}
                        variant="outline"
                        style={{ width: '100%', marginTop: 40, height: 60 }}
                        onPress={() => endMutation.mutate()}
                        loading={startMutation.isPending || endMutation.isPending}
                        disabled={startMutation.isPending || endMutation.isPending}
                    />
                ) : (
                    <CtaButton
                        size="lg"
                        label="START FASTING"
                        style={{ width: '100%', marginTop: 40, height: 60 }}
                        onPress={() => startMutation.mutate(selectedHours)}
                        loading={startMutation.isPending || endMutation.isPending}
                        disabled={startMutation.isPending || endMutation.isPending}
                    />
                )}

                {/* Tips Card */}
                <Card style={[styles.tipsCard, { backgroundColor: withAlpha(colors.accent.cyan, 0.08), borderColor: withAlpha(colors.accent.cyan, 0.4), marginTop: 40 }]}>
                    <View style={styles.tipsHeader}>
                        <Ionicons name="bulb-outline" size={20} color={colors.accent.cyan} />
                        <Text style={[typography.subhead, { color: colors.accent.cyan, fontWeight: 'bold', marginLeft: 12 }]}>Ria's Fasting Tip</Text>
                    </View>
                    <Text style={[typography.body, { color: colors.text.secondary, marginTop: 8 }]}>
                        Drinking water or black coffee won't break your metabolic fast. Stay hydrated to maintain mental clarity during the final hours.
                    </Text>
                </Card>
            </ScrollView>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1 },
    backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1 },
    timerContainer: { marginTop: 40, alignItems: 'center', justifyContent: 'center' },
    timerCenter: { position: 'absolute', alignItems: 'center' },
    infoRow: { flexDirection: 'row', gap: 16, marginTop: 40, width: '100%' },
    infoCard: { flex: 1 },
    infoCardInner: { padding: 16, alignItems: 'center' },
    protocolGrid: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
    protocolBtn: { flex: 1, height: 60, alignItems: 'center', justifyContent: 'center', borderRadius: 16, borderWidth: 1, minWidth: '45%' },
    tipsCard: { padding: 20 },
    tipsHeader: { flexDirection: 'row', alignItems: 'center' },
});
