import React, { useMemo } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity, Pressable,
    RefreshControl, Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { getRecent, getHeatmap } from '@/api/exercises';
import { LineChart } from 'react-native-gifted-charts';
import { format } from 'date-fns';
import { withAlpha } from '@/theme/utils';
import { Skeleton, EmptyState } from '@/components/ui';
import Animated, {
    FadeInDown,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
} from 'react-native-reanimated';

const { width } = Dimensions.get('window');
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Compact-format large hero numbers so a 5–6 digit volume (e.g. 125000 → 125k)
// never overflows its flex card once rendered at the big condensed size.
const compact = (n: number): string => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
    if (n >= 10_000) return `${Math.round(n / 1000)}k`;
    if (n >= 1_000) return `${(n / 1000).toFixed(1)}k`;
    return `${Math.round(n)}`;
};

// One workout row — its own component so each can own a spring-driven
// pressed-scale (0.96) without re-rendering siblings. Mirrors the sibling
// (exercises)/index.tsx house pattern (spring physics, transform-only).
function WorkoutRow({
    w, idx, colors, typography, borderRadius, onPress,
}: any) {
    const scale = useSharedValue(1);
    const aStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

    // Guard against a workout log missing both timestamps:
    // new Date(undefined) is Invalid Date and date-fns `format`
    // throws a RangeError on it, which would crash the list.
    const ts = w.completedAt || w.startedAt;
    const when = ts ? new Date(ts) : null;
    const validWhen = when && !isNaN(when.getTime()) ? when : null;

    return (
        <Animated.View entering={FadeInDown.delay(idx * 40).springify().damping(18).mass(0.7)}>
            <AnimatedPressable
                accessibilityRole="button"
                accessibilityLabel={`${w.title || w.type || 'Strength Training'} workout details`}
                style={[styles.workoutRow, aStyle, { backgroundColor: colors.background.secondary, borderRadius: borderRadius.xl, borderColor: colors.border.default, borderWidth: 1 }]}
                onPress={() => onPress(w)}
                onPressIn={() => { scale.value = withSpring(0.96, { damping: 18, mass: 0.7 }); }}
                onPressOut={() => { scale.value = withSpring(1, { damping: 18, mass: 0.7 }); }}
            >
                <View style={[styles.dateBox, { backgroundColor: colors.background.tertiary, borderRadius: borderRadius.lg }]}>
                    <Text style={[typography.overline, { color: colors.accent.coral, fontSize: 10 }]}>
                        {validWhen ? format(validWhen, 'MMM') : '--'}
                    </Text>
                    <Text style={[typography.statSmall, { color: colors.text.primary, fontSize: 18, marginTop: -1 }]}>
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
                        <View style={[styles.badge, { backgroundColor: withAlpha(colors.accent.coral, 0.12), marginLeft: 8 }]}>
                            <Text style={[styles.badgeText, { color: colors.accent.coral }]}>{w.intensity}</Text>
                        </View>
                    </View>
                </View>

                <Ionicons name="chevron-forward" size={18} color={colors.text.tertiary} />
            </AnimatedPressable>
        </Animated.View>
    );
}

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

    // ── Day streak ───────────────────────────────────────────────────────────
    // Real trailing streak derived straight off the heatmap grid: count back from
    // the most recent day while each day has activity (count > 0). Honest — zero
    // when the latest day is empty; never a fabricated figure. Mirrors the
    // mockup's flame "day streak" chip (history-preview.html).
    const dayStreak = useMemo(() => {
        const cells = Array.isArray(heatmap.heatmapData) ? heatmap.heatmapData : [];
        let streak = 0;
        for (let i = cells.length - 1; i >= 0; i--) {
            if ((cells[i]?.count ?? 0) > 0) streak++;
            else break;
        }
        return streak;
    }, [heatmap.heatmapData]);

    // ── Summary Stats ───────────────────────────────────────────────────────
    // Zeitra is lime/ink monochrome with ONE accent — every stat renders in the
    // brand lime (differentiated by icon only), never a purple/cyan/amber trio.
    const stats = useMemo(() => {
        const totalWorkouts = history.length;
        const totalDurationMins = history.reduce((sum, w) => sum + (w.duration || 0), 0);
        const totalVolumeKg = history.reduce((sum, w) => sum + (w.totalVolume || 0), 0);

        return [
            { label: 'Workouts', value: `${totalWorkouts}`, icon: 'fitness' },
            { label: 'Minutes', value: compact(totalDurationMins), icon: 'time' },
            { label: 'Volume (kg)', value: compact(totalVolumeKg), icon: 'barbell' },
        ];
    }, [history]);

    // ── Volume Trend ────────────────────────────────────────────────────────
    // Recent workout volume (oldest→newest) for the lime LineChart above the
    // list — derived purely from the already-fetched history (no extra request).
    const trendData = useMemo(() => {
        return history
            .filter((w) => (w.completedAt || w.startedAt))
            .slice(0, 12)
            .reverse()
            .map((w) => {
                const ts = w.completedAt || w.startedAt;
                const d = ts ? new Date(ts) : null;
                const valid = d && !isNaN(d.getTime()) ? d : null;
                return {
                    value: Math.round(w.totalVolume || 0),
                    label: valid ? format(valid, 'd/M') : '',
                };
            });
    }, [history]);

    // ── Volume trend delta ───────────────────────────────────────────────────
    // Percent change between the first and last point of the (oldest→newest)
    // trend series, for the lime "▲ N%" pill on the Volume Trend card header
    // (mockup: history-preview.html). Null when there's too little data or the
    // baseline is zero — the pill is hidden in that case rather than show ∞/NaN.
    const trendDelta = useMemo<number | null>(() => {
        if (trendData.length < 2) return null;
        const first = trendData[0]!.value;
        const last = trendData[trendData.length - 1]!.value;
        if (!first || first <= 0) return null;
        return Math.round(((last - first) / first) * 100);
    }, [trendData]);

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
                contentContainerStyle={{ paddingBottom: 100 + insets.bottom }}
            >
                {/* Consistency hero — big active-days numeral + flame day-streak,
                    with the activity heatmap merged in beneath (mockup:
                    history-preview.html). The heatmap grid + Less/More legend that
                    used to sit lower now live here so the screen opens on the
                    "how consistent am I" beat. */}
                <View style={{ paddingHorizontal: spacing.xl, marginTop: spacing.xl }}>
                    <View style={[styles.card, { backgroundColor: colors.background.secondary, borderRadius: borderRadius['2xl'], borderColor: colors.border.default }]}>
                        <View style={styles.consistencyHeader}>
                            <View style={{ flex: 1 }}>
                                <Text style={[typography.overline, { color: colors.text.secondary }]}>CONSISTENCY · LAST 5 WEEKS</Text>
                                <View style={styles.activeDaysRow}>
                                    <Text style={[typography.statLarge, { color: colors.text.primary, fontSize: 44, lineHeight: 46 }]}>
                                        {heatmap.activeDays || 0}
                                    </Text>
                                    <Text style={[typography.bodySm, { color: colors.text.secondary, marginLeft: 8 }]}>active days</Text>
                                </View>
                            </View>
                            <View style={{ alignItems: 'flex-end' }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                    <Ionicons name="flame" size={18} color={colors.accent.coral} />
                                    <Text style={[typography.statSmall, { color: colors.text.primary, fontSize: 24 }]}>{dayStreak}</Text>
                                </View>
                                <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 2 }]}>Day streak</Text>
                            </View>
                        </View>

                        {heatmapQuery.isLoading ? (
                            <View style={[styles.heatmapGrid, { marginTop: 18 }]}>
                                {Array.from({ length: 35 }).map((_, i) => (
                                    <Skeleton key={i} width={14} height={14} radius={3} />
                                ))}
                            </View>
                        ) : !Array.isArray(heatmap.heatmapData) || heatmap.heatmapData.length === 0 ? (
                            <View style={[styles.heatmapEmpty, { marginTop: 18 }]}>
                                <View style={styles.heatmapGrid}>
                                    {Array.from({ length: 35 }).map((_, i) => (
                                        <View key={i} style={[styles.heatmapCell, { backgroundColor: colors.background.tertiary, borderRadius: 3 }]} />
                                    ))}
                                </View>
                                <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 12 }]}>
                                    No activity yet — your training days will light up here.
                                </Text>
                            </View>
                        ) : (
                            <View style={[styles.heatmapGrid, { marginTop: 18 }]}>
                                {heatmap.heatmapData.slice(-35).map((day: any, i: number) => (
                                    <View
                                        key={i}
                                        style={[styles.heatmapCell, {
                                            backgroundColor: day.count > 3 ? colors.accent.coral : day.count > 1 ? withAlpha(colors.accent.coral, 0.6) : day.count > 0 ? withAlpha(colors.accent.coral, 0.3) : colors.background.tertiary,
                                            borderRadius: 3,
                                        }]}
                                    />
                                ))}
                            </View>
                        )}
                        <View style={styles.heatmapLegend}>
                            <Text style={[typography.caption, { color: colors.text.secondary, fontSize: 10 }]}>Less</Text>
                            <View style={[styles.heatmapCell, { backgroundColor: colors.background.tertiary, width: 10, height: 10 }]} />
                            <View style={[styles.heatmapCell, { backgroundColor: withAlpha(colors.accent.coral, 0.3), width: 10, height: 10 }]} />
                            <View style={[styles.heatmapCell, { backgroundColor: withAlpha(colors.accent.coral, 0.6), width: 10, height: 10 }]} />
                            <View style={[styles.heatmapCell, { backgroundColor: colors.accent.coral, width: 10, height: 10 }]} />
                            <Text style={[typography.caption, { color: colors.text.secondary, fontSize: 10 }]}>More</Text>
                        </View>
                    </View>
                </View>

                {/* Stats Grid — hero numbers in big condensed lime, monochrome */}
                <View style={styles.statsGrid}>
                    {stats.map((s, i) => (
                        <Animated.View
                            key={s.label}
                            entering={FadeInDown.delay(i * 40).springify().damping(18).mass(0.7)}
                            style={[styles.statCard, { backgroundColor: colors.background.secondary, borderRadius: borderRadius.xl, borderColor: colors.border.default }]}
                        >
                            <View style={[styles.statIcon, { backgroundColor: withAlpha(colors.accent.coral, 0.14) }]}>
                                <Ionicons name={s.icon as any} size={18} color={colors.accent.coral} />
                            </View>
                            <Text
                                style={[typography.statMedium, { color: colors.accent.coral, marginTop: 8 }]}
                                numberOfLines={1}
                                adjustsFontSizeToFit
                            >
                                {s.value}
                            </Text>
                            <Text style={[typography.overline, { color: colors.text.secondary, marginTop: 2 }]}>{s.label}</Text>
                        </Animated.View>
                    ))}
                </View>

                {/* Volume Trend Chart — lime LineChart of recent workout volume */}
                <View style={{ paddingHorizontal: spacing.xl, marginTop: spacing.xl }}>
                    <View style={[styles.card, { backgroundColor: colors.background.secondary, borderRadius: borderRadius['2xl'], borderColor: colors.border.default }]}>
                        <View style={styles.cardHeader}>
                            <View style={{ flex: 1 }}>
                                <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: 'bold' }]}>Volume Trend</Text>
                                <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 1 }]}>Recent tonnage · last 12 sessions</Text>
                            </View>
                            {/* Lime ▲/▼ delta pill — real first→last % change; hidden when
                                there's too little data (mockup: history-preview.html). */}
                            {trendDelta != null ? (
                                <View style={[styles.trendPill, { backgroundColor: withAlpha(colors.accent.coral, trendDelta >= 0 ? 0.14 : 0.0), borderColor: withAlpha(colors.accent.coral, 0.35) }]}>
                                    <Ionicons name={trendDelta >= 0 ? 'arrow-up' : 'arrow-down'} size={12} color={colors.accent.coral} />
                                    <Text style={[typography.caption, { color: colors.accent.coral, fontWeight: '700', marginLeft: 3 }]}>
                                        {Math.abs(trendDelta)}%
                                    </Text>
                                </View>
                            ) : (
                                <Ionicons name="trending-up" size={18} color={colors.accent.coral} />
                            )}
                        </View>

                        {historyQuery.isLoading ? (
                            <Skeleton width="100%" height={140} radius={borderRadius.lg} />
                        ) : trendData.length > 1 ? (
                            <View style={{ alignItems: 'center', marginTop: 4 }}>
                                <LineChart
                                    data={trendData}
                                    width={width - 110}
                                    height={140}
                                    thickness={3}
                                    color={colors.accent.coral}
                                    dataPointsColor={colors.accent.coral}
                                    startFillColor={colors.accent.coral}
                                    startOpacity={0.22}
                                    endFillColor={colors.accent.coral}
                                    endOpacity={0}
                                    areaChart
                                    curved
                                    initialSpacing={16}
                                    noOfSections={3}
                                    yAxisThickness={0}
                                    xAxisThickness={0}
                                    rulesColor={colors.border.default}
                                    rulesType="solid"
                                    yAxisTextStyle={{ color: colors.text.secondary, fontSize: 10 }}
                                    xAxisLabelTextStyle={{ color: colors.text.secondary, fontSize: 10 }}
                                />
                            </View>
                        ) : (
                            <View style={styles.emptyChart}>
                                <Ionicons name="bar-chart-outline" size={32} color={colors.text.tertiary} />
                                <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 8 }]}>
                                    Log a couple of workouts to see your volume trend.
                                </Text>
                            </View>
                        )}
                    </View>
                </View>

                {/* Workout List */}
                <View style={{ paddingHorizontal: spacing.xl, marginTop: spacing['2xl'] }}>
                    <Text style={[typography.heading, { color: colors.text.primary, marginBottom: spacing.md }]}>Recent sessions</Text>

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
                        history.map((w, idx) => (
                            <WorkoutRow
                                key={w.id || idx}
                                w={w}
                                idx={idx}
                                colors={colors}
                                typography={typography}
                                borderRadius={borderRadius}
                                onPress={(item: any) => router.push({ pathname: '/(exercises)/report', params: { workoutId: item.id } })}
                            />
                        ))
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
    consistencyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    activeDaysRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 6 },
    trendPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
    emptyChart: { height: 140, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
    heatmapGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, justifyContent: 'center' },
    heatmapCell: { width: 14, height: 14 },
    heatmapEmpty: { alignItems: 'center' },
    heatmapLegend: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 16 },
    workoutRow: { flexDirection: 'row', alignItems: 'center', padding: 12, marginBottom: 12 },
    dateBox: { width: 50, height: 55, alignItems: 'center', justifyContent: 'center' },
    metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
    dot: { width: 3, height: 3, borderRadius: 1.5, marginHorizontal: 8 },
    badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
    badgeText: { fontSize: 8, fontWeight: 'bold', textTransform: 'uppercase' },
});
