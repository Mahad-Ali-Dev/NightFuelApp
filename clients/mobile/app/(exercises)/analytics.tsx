import React, { useState, useMemo } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    Dimensions, type TextStyle,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { getAnalytics, getHeatmap, getOneRepMaxes, OneRepMax } from '@/api/exercises';
import { LineChart, BarChart } from 'react-native-gifted-charts';
import { withAlpha } from '@/theme/utils';
import { fontFamilies } from '@/theme/typography';
import { Skeleton, EmptyState, GlassCard } from '@/components/ui';
import { PressableScale } from '@/components/ui/PressableScale';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';

const { width } = Dimensions.get('window');

// House entrance recipe — staggered FadeInDown spring, matching the rest of the
// (exercises) stack (history.tsx / report.tsx). `i` indexes the stagger.
const enter = (i: number) => FadeInDown.delay(80 + i * 45).springify().damping(18).mass(0.7);

// Tabular figures for every changing numeric readout (hero stats, progression
// headline, PR weights). Barlow Condensed's default proportional digits jitter
// in width as values change/animate; tabular-nums locks each glyph to one cell
// so the numbers stay rock-steady. Applied inline since the shared typography
// tokens are off-limits to edit.
const TABULAR: TextStyle = { fontVariant: ['tabular-nums'] };

export default function ExerciseAnalyticsScreen() {
    const { colors, typography, spacing, borderRadius } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const params = useLocalSearchParams<{ exercise?: string }>();

    const [selectedExercise, setSelectedExercise] = useState(params.exercise ?? '');

    // ── Queries ─────────────────────────────────────────────────────────────
    const oneRmQuery = useQuery({
        queryKey: ['exercise-1rm'],
        queryFn: getOneRepMaxes,
        staleTime: 10 * 60 * 1000,
    });

    const heatmapQuery = useQuery({
        queryKey: ['exercise-heatmap'],
        queryFn: getHeatmap,
        staleTime: 10 * 60 * 1000,
    });

    const analyticsQuery = useQuery({
        queryKey: ['exercise-analytics', selectedExercise],
        queryFn: () => getAnalytics(selectedExercise),
        enabled: !!selectedExercise,
    });

    // ── Data Formatting ─────────────────────────────────────────────────────
    const topExercises = (oneRmQuery.data ?? []).slice(0, 5);
    const heatmap = heatmapQuery.data ?? { activeDays: 0, heatmapData: [] };

    const chartData = useMemo(() => {
        if (!analyticsQuery.data || !Array.isArray(analyticsQuery.data)) return [];
        return analyticsQuery.data.map((entry: any) => ({
            value: entry.maxWeight || 0,
            label: new Date(entry.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        })).slice(-15);
    }, [analyticsQuery.data]);

    const exerciseDistribution = useMemo(() => {
        // Real distribution aggregated from logged 1RM records by exercise name.
        // The 1RM response (OneRepMax) carries exerciseName but NO muscleGroup, so
        // we bucket by the field the server actually returns — aggregating by a
        // missing field would collapse every record into a single fake slice. No
        // synthetic placeholder — when empty the UI shows an EmptyState instead.
        const counts: Record<string, number> = {};
        (oneRmQuery.data ?? []).forEach(item => {
            const name = item.exerciseName?.trim() || 'Unnamed';
            counts[name] = (counts[name] || 0) + 1;
        });

        return Object.entries(counts).map(([text, value], i) => ({
            value,
            text,
            color: [colors.accent.coral, colors.accent.cyan, colors.accent.purple, colors.accent.amber][i % 4],
        }));
    }, [oneRmQuery.data, colors]);

    // Heaviest tracked lift (kg) across all logged 1RMs — a hero stat derived
    // purely from the already-fetched 1RM list (no extra query).
    const topOneRm = useMemo(
        () => (oneRmQuery.data ?? []).reduce((m, r) => Math.max(m, r.estimated1RMKg || 0), 0),
        [oneRmQuery.data],
    );

    // Volume-comparison bars: distinct tracked lifts ranked by how many 1RM
    // records each has. Bars (sorted desc, value-labelled) read AAA-accessible
    // and avoid color-only encoding — the upgrade over a donut for this data.
    // Lime brand fill; the leader bar gets the full-strength accent. Each bar
    // carries a top-label rendering its exact value in text.secondary, so the
    // count is legible directly and the brightness distinction is redundant
    // (meaning never rides on colour alone).
    const volumeBars = useMemo(() => {
        const sorted = [...exerciseDistribution].sort((a, b) => b.value - a.value).slice(0, 6);
        const max = sorted.reduce((m, b) => Math.max(m, b.value), 0);
        return sorted.map(b => ({
            value: b.value,
            label: b.text.length > 8 ? `${b.text.slice(0, 7)}…` : b.text,
            frontColor: b.value === max && max > 0 ? colors.accent.coral : withAlpha(colors.accent.coral, 0.5),
            topLabelComponent: () => (
                <Text style={[styles.barTopLabel, TABULAR, { color: colors.text.secondary }]}>
                    {b.value}
                </Text>
            ),
        }));
    }, [exerciseDistribution, colors.accent.coral, colors.text.secondary]);

    // Latest plotted weight + delta vs the prior point — a headline above the
    // progression line so the trend reads at a glance (derived from chartData).
    const progressHeadline = useMemo(() => {
        if (chartData.length === 0) return null;
        const latest = chartData[chartData.length - 1]?.value ?? 0;
        const prev = chartData.length > 1 ? chartData[chartData.length - 2]?.value ?? latest : latest;
        return { latest, delta: latest - prev };
    }, [chartData]);

    // ── Reusable hero stat card ──────────────────────────────────────────────
    const StatCard = ({
        value, label, icon, tint, statStyle, idx, a11yValue,
    }: {
        value: React.ReactNode;
        label: string;
        icon: keyof typeof Ionicons.glyphMap;
        tint: string;
        statStyle: object;
        idx: number;
        a11yValue: string;
        // Group icon + number + overline into a single spoken unit so VoiceOver/
        // TalkBack reads "Active days: 12" instead of three disjoint nodes. The
        // wrapper owns the accessibility node (GlassCard doesn't forward a11y
        // props); the decorative icon is hidden from the tree.
    }) => (
        <Animated.View
            entering={enter(idx)}
            style={styles.statCardWrap}
            accessible
            accessibilityRole="text"
            accessibilityLabel={`${label.charAt(0) + label.slice(1).toLowerCase()}: ${a11yValue}`}
        >
            <GlassCard radius={borderRadius.xl} style={styles.statCard}>
                <View style={styles.statCardInner}>
                    <View
                        style={[styles.statIcon, { backgroundColor: withAlpha(tint, 0.14) }]}
                        accessibilityElementsHidden
                        importantForAccessibility="no-hide-descendants"
                    >
                        <Ionicons name={icon} size={16} color={tint} />
                    </View>
                    <Text style={[statStyle, TABULAR, { color: colors.text.primary, marginTop: spacing.md }]} numberOfLines={1}>
                        {value}
                    </Text>
                    <Text style={[typography.overline, { color: colors.text.secondary, marginTop: spacing.xxs }]}>
                        {label}
                    </Text>
                </View>
            </GlassCard>
        </Animated.View>
    );

    return (
        <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
            <StatusBar style="light" />
            {/* Header */}
            <View style={[styles.header, { paddingTop: insets.top + 20, borderBottomColor: colors.border.default }]}>
                <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
                </TouchableOpacity>
                <Text style={[typography.heading, { color: colors.text.primary, fontSize: 18 }]}>Performance Analytics</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }} showsVerticalScrollIndicator={false}>
                {/* Hero stat cards — big condensed numerals on dark glass */}
                <View style={styles.statGrid}>
                    <StatCard
                        idx={0}
                        value={heatmap.activeDays}
                        a11yValue={`${heatmap.activeDays}`}
                        label="ACTIVE DAYS"
                        icon="flame"
                        tint={colors.accent.coral}
                        statStyle={typography.statMedium}
                    />
                    <StatCard
                        idx={1}
                        value={oneRmQuery.data?.length || 0}
                        a11yValue={`${oneRmQuery.data?.length || 0}`}
                        label="PR RECORDS"
                        icon="trophy"
                        tint={colors.accent.amber}
                        statStyle={typography.statMedium}
                    />
                    <StatCard
                        idx={2}
                        value={topOneRm > 0 ? `${Math.round(topOneRm)}` : '—'}
                        a11yValue={topOneRm > 0 ? `${Math.round(topOneRm)} kilograms` : 'no data'}
                        label="TOP 1RM · KG"
                        icon="barbell"
                        tint={colors.accent.cyan}
                        statStyle={typography.statMedium}
                    />
                    <StatCard
                        idx={3}
                        value={exerciseDistribution.length || 0}
                        a11yValue={`${exerciseDistribution.length || 0}`}
                        label="TRACKED LIFTS"
                        icon="layers"
                        tint={colors.accent.purple}
                        statStyle={typography.statMedium}
                    />
                </View>

                {/* Exercise scope chips — drive the existing selectedExercise filter */}
                {topExercises.length > 0 && (
                    <Animated.View entering={enter(4)}>
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.chipRail}
                        >
                            {topExercises.map((pr: OneRepMax) => {
                                const active = selectedExercise === pr.exerciseName;
                                return (
                                    <PressableScale
                                        key={pr.exerciseName}
                                        accessibilityRole="button"
                                        accessibilityState={{ selected: active }}
                                        accessibilityLabel={`Filter progression by ${pr.exerciseName}`}
                                        onPress={() => setSelectedExercise(pr.exerciseName)}
                                        style={[
                                            styles.chip,
                                            {
                                                backgroundColor: active ? colors.accent.coral : colors.background.secondary,
                                                borderColor: active ? colors.accent.coral : colors.border.default,
                                            },
                                        ]}
                                    >
                                        <Text
                                            style={[
                                                typography.captionMedium,
                                                { color: active ? colors.text.inverse : colors.text.secondary },
                                            ]}
                                            numberOfLines={1}
                                        >
                                            {pr.exerciseName}
                                        </Text>
                                    </PressableScale>
                                );
                            })}
                        </ScrollView>
                    </Animated.View>
                )}

                {/* Strength Progression Chart */}
                <Animated.View entering={enter(5)} style={{ paddingHorizontal: 20, marginTop: 6 }}>
                    <GlassCard radius={borderRadius['2xl']} style={styles.card}>
                        <View style={styles.cardHeader}>
                            <View style={{ flex: 1, paddingRight: spacing.md }}>
                                <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: 'bold' }]}>Strength Progression</Text>
                                <Text style={[typography.caption, { color: colors.text.secondary }]} numberOfLines={1}>
                                    {selectedExercise || 'Select an exercise below'}
                                </Text>
                            </View>
                            <View style={[styles.headerBadge, { backgroundColor: withAlpha(colors.accent.emerald, 0.14) }]}>
                                <Ionicons name="trending-up" size={18} color={colors.accent.emerald} />
                            </View>
                        </View>

                        {/* Headline: latest plotted weight + delta */}
                        {selectedExercise && progressHeadline && chartData.length > 1 && !analyticsQuery.isLoading && !analyticsQuery.isError ? (
                            <View style={styles.progressHeadline}>
                                <Text style={[typography.statLarge, TABULAR, { color: colors.accent.coral }]}>
                                    {Math.round(progressHeadline.latest)}
                                    <Text style={[typography.statTiny, { color: colors.text.tertiary }]}> kg</Text>
                                </Text>
                                {progressHeadline.delta !== 0 && (
                                    <View style={[styles.deltaPill, { backgroundColor: withAlpha(progressHeadline.delta > 0 ? colors.accent.emerald : colors.accent.red, 0.14) }]}>
                                        <Ionicons
                                            name={progressHeadline.delta > 0 ? 'arrow-up' : 'arrow-down'}
                                            size={12}
                                            color={progressHeadline.delta > 0 ? colors.accent.emerald : colors.accent.red}
                                        />
                                        <Text style={[typography.captionMedium, { color: progressHeadline.delta > 0 ? colors.accent.emerald : colors.accent.red }]}>
                                            {Math.abs(Math.round(progressHeadline.delta))} kg
                                        </Text>
                                    </View>
                                )}
                            </View>
                        ) : null}

                        {selectedExercise ? (
                            analyticsQuery.isLoading ? (
                                <View style={{ marginTop: 10 }}>
                                    <Skeleton width="100%" height={160} radius={borderRadius.lg} />
                                </View>
                            ) : analyticsQuery.isError ? (
                                <View style={styles.emptyChart}>
                                    <Ionicons name="cloud-offline-outline" size={32} color={colors.text.tertiary} />
                                    <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 10, textAlign: 'center' }]}>Couldn't load progression. Pull to refresh or pick another record.</Text>
                                </View>
                            ) : chartData.length > 1 ? (
                                <Animated.View entering={FadeIn.duration(280)} style={{ alignItems: 'center', marginTop: 12 }} accessibilityRole="image" accessibilityLabel={`Line chart of estimated weight progression for ${selectedExercise}`}>
                                    <LineChart
                                        data={chartData}
                                        width={width - 80}
                                        height={160}
                                        thickness={3}
                                        color={colors.accent.coral}
                                        dataPointsColor={colors.accent.coral}
                                        startFillColor={colors.accent.coral}
                                        endFillColor={colors.background.secondary}
                                        areaChart
                                        startOpacity={0.22}
                                        endOpacity={0}
                                        initialSpacing={20}
                                        noOfSections={4}
                                        yAxisThickness={0}
                                        xAxisThickness={0}
                                        rulesColor={withAlpha(colors.border.default, 0.6)}
                                        yAxisTextStyle={{ color: colors.text.secondary, fontSize: 11 }}
                                        xAxisLabelTextStyle={{ color: colors.text.secondary, fontSize: 11 }}
                                    />
                                </Animated.View>
                            ) : (
                                <View style={styles.emptyChart}>
                                    <Ionicons name="pulse-outline" size={32} color={colors.text.tertiary} />
                                    <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 10 }]}>Not enough data to plot progression</Text>
                                </View>
                            )
                        ) : (
                            <View style={styles.emptyChart}>
                                <Ionicons name="bar-chart-outline" size={40} color={colors.text.tertiary} />
                                <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 10 }]}>Choose a personal record to track</Text>
                            </View>
                        )}
                    </GlassCard>
                </Animated.View>

                {/* Volume Comparison — on-brand BarChart (sorted, value-labelled, lime) */}
                <Animated.View entering={enter(6)} style={{ paddingHorizontal: 20, marginTop: 16 }}>
                    <GlassCard radius={borderRadius['2xl']} style={styles.card}>
                        <View style={styles.cardHeader}>
                            <View>
                                <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: 'bold' }]}>Volume by Lift</Text>
                                <Text style={[typography.caption, { color: colors.text.secondary }]}>Logged records per exercise</Text>
                            </View>
                            <View style={[styles.headerBadge, { backgroundColor: withAlpha(colors.accent.coral, 0.14) }]}>
                                <Ionicons name="bar-chart" size={18} color={colors.accent.coral} />
                            </View>
                        </View>
                        {oneRmQuery.isLoading ? (
                            <View style={{ marginTop: 10 }}>
                                <Skeleton width="100%" height={170} radius={borderRadius.lg} />
                            </View>
                        ) : volumeBars.length > 0 ? (
                            <>
                                <View style={{ alignItems: 'center', marginTop: 12 }} accessibilityRole="image" accessibilityLabel={`Bar chart of logged records per exercise: ${volumeBars.map(b => `${b.label}, ${b.value}`).join('; ')}`}>
                                    <BarChart
                                        data={volumeBars}
                                        width={width - 100}
                                        height={170}
                                        barWidth={Math.max(20, Math.min(40, (width - 140) / Math.max(volumeBars.length, 1) - 12))}
                                        barBorderRadius={5}
                                        noOfSections={4}
                                        initialSpacing={18}
                                        spacing={26}
                                        yAxisColor={colors.border.default}
                                        xAxisColor={colors.border.default}
                                        rulesColor={withAlpha(colors.border.default, 0.6)}
                                        yAxisTextStyle={{ color: colors.text.secondary, fontSize: 11 }}
                                        xAxisLabelTextStyle={{ color: colors.text.secondary, fontSize: 11 }}
                                        topLabelContainerStyle={styles.barTopLabelContainer}
                                    />
                                </View>
                                {/* Direct-labelling makes the bars legible without colour; this caption
                                    explains the redundant brightness cue so meaning never rides on hue alone. */}
                                <Text style={[typography.caption, { color: colors.text.tertiary, textAlign: 'center', marginTop: 10 }]}>
                                    Brightest bar = most logged
                                </Text>
                            </>
                        ) : (
                            <EmptyState
                                icon="bar-chart-outline"
                                title="No volume data yet"
                                subtitle="Log lifts in the 1RM calculator to see how your training volume is distributed across exercises."
                            />
                        )}
                    </GlassCard>
                </Animated.View>

                {/* Personal Records List */}
                <View style={{ paddingHorizontal: 20, marginTop: 24 }}>
                    <Text style={[typography.heading, { color: colors.text.primary, marginBottom: 16 }]}>Personal Records (1RM)</Text>

                    {oneRmQuery.isLoading ? (
                        <View>
                            {[0, 1, 2, 3].map((i) => (
                                <View key={i} style={[styles.prRow, { backgroundColor: colors.background.secondary, borderRadius: borderRadius.xl, borderColor: colors.border.default }]}>
                                    <Skeleton width={40} height={40} radius={borderRadius.full} />
                                    <View style={{ flex: 1, marginLeft: 16 }}>
                                        <Skeleton width="55%" height={16} radius={borderRadius.sm} />
                                        <Skeleton width="40%" height={12} radius={borderRadius.sm} style={{ marginTop: spacing.sm }} />
                                    </View>
                                    <Skeleton width={48} height={18} radius={borderRadius.sm} />
                                </View>
                            ))}
                        </View>
                    ) : oneRmQuery.isError ? (
                        <EmptyState
                            icon="cloud-offline-outline"
                            title="Couldn't load records"
                            subtitle="Something went wrong fetching your personal records. Check your connection and try again."
                            actionLabel="Try Again"
                            onAction={() => oneRmQuery.refetch()}
                        />
                    ) : topExercises.length === 0 ? (
                        <EmptyState
                            icon="trophy-outline"
                            title="No records yet"
                            subtitle="Log a lift in the 1RM calculator to start tracking your personal records and strength progression."
                            actionLabel="Open 1RM Calculator"
                            onAction={() => router.push('/(exercises)/calculator' as any)}
                        />
                    ) : (
                        topExercises.map((pr: OneRepMax, idx: number) => {
                            const active = selectedExercise === pr.exerciseName;
                            return (
                                <Animated.View key={pr.exerciseName} entering={enter(idx)}>
                                    <PressableScale
                                        accessibilityRole="button"
                                        accessibilityState={{ selected: active }}
                                        accessibilityLabel={pr.exerciseName}
                                        style={[styles.prRow, { backgroundColor: colors.background.secondary, borderRadius: borderRadius.xl, borderColor: active ? colors.accent.coral : colors.border.default }]}
                                        onPress={() => setSelectedExercise(pr.exerciseName)}
                                    >
                                        <View style={[styles.prIcon, { backgroundColor: withAlpha(active ? colors.accent.coral : colors.accent.amber, 0.14) }]}>
                                            <Ionicons name="trophy" size={18} color={active ? colors.accent.coral : colors.accent.amber} />
                                        </View>
                                        <View style={{ flex: 1, marginLeft: 16 }}>
                                            <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: 'bold' }]}>{pr.exerciseName}</Text>
                                            <Text style={[typography.caption, { color: colors.text.secondary }]}>{new Date(pr.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</Text>
                                        </View>
                                        <View style={{ alignItems: 'flex-end' }}>
                                            <Text style={[typography.statSmall, TABULAR, { color: colors.accent.cyan }]}>{pr.estimated1RMKg}<Text style={[typography.caption, { color: colors.text.tertiary }]}>kg</Text></Text>
                                            <Text style={[typography.overline, { color: colors.text.secondary, fontSize: 9 }]}>{active ? 'TRACKING' : 'PR'}</Text>
                                        </View>
                                    </PressableScale>
                                </Animated.View>
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
    // Hero stat grid — 2-col
    statGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 14, paddingTop: 18 },
    statCardWrap: { width: '50%', padding: 6 },
    statCard: { flex: 1 },
    statCardInner: { padding: 16 },
    statIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    // Chips
    chipRail: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 4, gap: 8 },
    chip: { height: 36, minWidth: 44, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    // Cards
    card: { padding: 20 },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    headerBadge: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    progressHeadline: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
    deltaPill: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
    emptyChart: { height: 160, alignItems: 'center', justifyContent: 'center' },
    // Per-bar value label sitting just above each bar (BarChart top labels).
    barTopLabel: { fontFamily: fontFamilies.barlowCondensed.semiBold, fontSize: 12, lineHeight: 14, textAlign: 'center' },
    barTopLabelContainer: { marginBottom: 4 },
    prRow: { flexDirection: 'row', alignItems: 'center', padding: 16, marginBottom: 12, borderWidth: 1 },
    prIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
