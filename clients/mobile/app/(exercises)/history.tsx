import React, { useMemo } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { getRecent, getHeatmap } from '@/api/exercises';
import { format } from 'date-fns';
import { withAlpha } from '@/theme/utils';
import { Skeleton, EmptyState } from '@/components/ui';

export default function WorkoutHistoryScreen() {
    const { colors, typography, spacing, borderRadius } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();

    const historyQuery = useQuery({
        queryKey: ['exercise-history'],
        queryFn: () => getRecent(50),
        staleTime: 2 * 60 * 1000,
    });

    const heatmapQuery = useQuery({
        queryKey: ['exercise-heatmap'],
        queryFn: getHeatmap,
        staleTime: 10 * 60 * 1000,
    });

    const history = (historyQuery.data ?? []) as any[];
    const heatmap = heatmapQuery.data ?? { activeDays: 0, heatmapData: [] };

    // ── Summary Stats ───────────────────────────────────────────────────────
    const stats = useMemo(() => {
        const totalWorkouts = history.length;
        const totalDurationMins = history.reduce((sum, w) => sum + (w.duration || 0), 0);
        const totalVolumeKg = history.reduce((sum, w) => sum + (w.totalVolume || 0), 0);

        return [
            { label: 'Workouts', value: totalWorkouts, icon: 'fitness', color: colors.accent.purple },
            { label: 'Minutes', value: totalDurationMins, icon: 'time', color: colors.accent.cyan },
            { label: 'Volume (kg)', value: Math.round(totalVolumeKg), icon: 'barbell', color: colors.accent.amber },
        ];
    }, [history, colors]);

    const onRefresh = () => {
        historyQuery.refetch();
        heatmapQuery.refetch();
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
            <StatusBar style="light" />
            {/* Header */}
            <View style={[styles.header, { paddingTop: insets.top, borderBottomColor: colors.border.default }]}>
                <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
                </TouchableOpacity>
                <Text style={[typography.heading, { color: colors.text.primary, fontSize: 18 }]}>Workout History</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView
                refreshControl={<RefreshControl refreshing={historyQuery.isFetching} onRefresh={onRefresh} tintColor={colors.accent.coral} />}
                contentContainerStyle={{ paddingBottom: 100 }}
            >
                {/* Stats Grid */}
                <View style={styles.statsGrid}>
                    {stats.map((s) => (
                        <View key={s.label} style={[styles.statCard, { backgroundColor: colors.background.secondary, borderRadius: borderRadius.xl, borderColor: colors.border.default }]}>
                            <View style={[styles.statIcon, { backgroundColor: withAlpha(s.color, 0.14) }]}>
                                <Ionicons name={s.icon as any} size={18} color={s.color} />
                            </View>
                            <Text style={[typography.statSmall, { color: colors.text.primary, fontSize: 22, marginTop: 10 }]}>{s.value}</Text>
                            <Text style={[typography.overline, { color: colors.text.secondary, fontSize: 9, marginTop: 2 }]}>{s.label}</Text>
                        </View>
                    ))}
                </View>

                {/* Heatmap Section */}
                <View style={{ paddingHorizontal: spacing.xl, marginTop: spacing.xl }}>
                    <View style={[styles.card, { backgroundColor: colors.background.secondary, borderRadius: borderRadius['2xl'], borderColor: colors.border.default }]}>
                        <View style={styles.cardHeader}>
                            <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: 'bold' }]}>Activity Heatmap</Text>
                            <Text style={[typography.caption, { color: colors.accent.emerald }]}>{heatmap.activeDays} Active Days</Text>
                        </View>

                        <View style={styles.heatmapGrid}>
                            {Array.isArray(heatmap.heatmapData) && heatmap.heatmapData.slice(-35).map((day: any, i: number) => (
                                <View
                                    key={i}
                                    style={[styles.heatmapCell, {
                                        backgroundColor: day.count > 3 ? colors.accent.cyan : day.count > 1 ? `${colors.accent.cyan}80` : day.count > 0 ? `${colors.accent.cyan}30` : colors.background.tertiary,
                                        borderRadius: 3,
                                    }]}
                                />
                            ))}
                        </View>
                        <View style={styles.heatmapLegend}>
                            <Text style={[typography.caption, { color: colors.text.secondary, fontSize: 9 }]}>Less</Text>
                            <View style={[styles.heatmapCell, { backgroundColor: colors.background.tertiary, width: 10, height: 10 }]} />
                            <View style={[styles.heatmapCell, { backgroundColor: `${colors.accent.cyan}30`, width: 10, height: 10 }]} />
                            <View style={[styles.heatmapCell, { backgroundColor: `${colors.accent.cyan}80`, width: 10, height: 10 }]} />
                            <View style={[styles.heatmapCell, { backgroundColor: colors.accent.cyan, width: 10, height: 10 }]} />
                            <Text style={[typography.caption, { color: colors.text.secondary, fontSize: 9 }]}>More</Text>
                        </View>
                    </View>
                </View>

                {/* Workout List */}
                <View style={{ paddingHorizontal: spacing.xl, marginTop: spacing['2xl'] }}>
                    <Text style={[typography.heading, { color: colors.text.primary, marginBottom: spacing.md }]}>Workout Logs</Text>

                    {historyQuery.isLoading ? (
                        <View>
                            {[0, 1, 2, 3].map((i) => (
                                <View key={i} style={[styles.workoutRow, { backgroundColor: colors.background.secondary, borderRadius: borderRadius.xl, borderColor: colors.border.default, borderWidth: 1 }]}>
                                    <Skeleton width={50} height={55} radius={borderRadius.lg} />
                                    <View style={{ flex: 1, marginLeft: 16 }}>
                                        <Skeleton width="60%" height={16} radius={borderRadius.sm} />
                                        <Skeleton width="40%" height={12} radius={borderRadius.sm} style={{ marginTop: spacing.sm }} />
                                    </View>
                                </View>
                            ))}
                        </View>
                    ) : historyQuery.isError ? (
                        <EmptyState
                            icon="cloud-offline-outline"
                            title="Couldn't load history"
                            subtitle="Something went wrong fetching your workouts. Check your connection and try again."
                            actionLabel="Try Again"
                            onAction={() => historyQuery.refetch()}
                        />
                    ) : history.length === 0 ? (
                        <EmptyState
                            icon="calendar-outline"
                            title="No workouts logged yet"
                            subtitle="Finish a session and it'll show up here with your stats and streaks."
                            actionLabel="Start a Workout"
                            onAction={() => router.push('/(tabs)/training' as any)}
                        />
                    ) : (
                        history.map((w, idx) => {
                            // Guard against a workout log missing both timestamps:
                            // new Date(undefined) is Invalid Date and date-fns `format`
                            // throws a RangeError on it, which would crash the list.
                            const ts = w.completedAt || w.startedAt;
                            const when = ts ? new Date(ts) : null;
                            const validWhen = when && !isNaN(when.getTime()) ? when : null;
                            return (
                            <TouchableOpacity
                                key={w.id || idx}
                                accessibilityRole="button"
                                accessibilityLabel={`${w.title || w.type || 'Strength Training'} workout details`}
                                style={[styles.workoutRow, { backgroundColor: colors.background.secondary, borderRadius: borderRadius.xl, borderColor: colors.border.default, borderWidth: 1 }]}
                                onPress={() => router.push({ pathname: '/(exercises)/report', params: { workoutId: w.id } })}
                                activeOpacity={0.85}
                            >
                                <View style={[styles.dateBox, { backgroundColor: colors.background.tertiary, borderRadius: borderRadius.lg }]}>
                                    <Text style={[typography.overline, { color: colors.accent.coral, fontSize: 10 }]}>
                                        {validWhen ? format(validWhen, 'MMM') : '--'}
                                    </Text>
                                    <Text style={[typography.statTiny, { color: colors.text.primary, fontSize: 18, marginTop: -1 }]}>
                                        {validWhen ? format(validWhen, 'dd') : '--'}
                                    </Text>
                                </View>

                                <View style={{ flex: 1, marginLeft: 16 }}>
                                    <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: 'bold' }]}>
                                        {w.title || w.type || 'Strength Training'}
                                    </Text>
                                    <View style={styles.metaRow}>
                                        <Ionicons name="time-outline" size={12} color={colors.text.tertiary} />
                                        <Text style={[typography.caption, { color: colors.text.secondary, marginLeft: 4 }]}>
                                            {w.duration}m
                                        </Text>
                                        <View style={[styles.dot, { backgroundColor: colors.border.default }]} />
                                        <Ionicons name="barbell-outline" size={12} color={colors.text.tertiary} />
                                        <Text style={[typography.caption, { color: colors.text.secondary, marginLeft: 4 }]}>
                                            {w.exercises?.length || 0} Ex.
                                        </Text>
                                        <View style={[styles.badge, { backgroundColor: `${colors.accent.cyan}15`, marginLeft: 8 }]}>
                                            <Text style={[styles.badgeText, { color: colors.accent.cyan }]}>{w.intensity}</Text>
                                        </View>
                                    </View>
                                </View>

                                <Ionicons name="chevron-forward" size={18} color={colors.text.tertiary} />
                            </TouchableOpacity>
                            );
                        })
                    )}
                </View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1 },
    backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    statsGrid: { flexDirection: 'row', paddingHorizontal: 20, gap: 12, marginTop: 20 },
    statCard: { flex: 1, padding: 12, borderWidth: 1, alignItems: 'center' },
    statIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    card: { padding: 20, borderWidth: 1 },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    heatmapGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, justifyContent: 'center' },
    heatmapCell: { width: 14, height: 14 },
    heatmapLegend: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 16 },
    workoutRow: { flexDirection: 'row', alignItems: 'center', padding: 12, marginBottom: 12 },
    dateBox: { width: 50, height: 55, alignItems: 'center', justifyContent: 'center' },
    metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
    dot: { width: 3, height: 3, borderRadius: 1.5, marginHorizontal: 8 },
    badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
    badgeText: { fontSize: 8, fontWeight: 'bold', textTransform: 'uppercase' },
});
