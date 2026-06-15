import React, { useState, useMemo } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    Dimensions,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { getAnalytics, getHeatmap, getOneRepMaxes, OneRepMax } from '@/api/exercises';
import { LineChart, PieChart } from 'react-native-gifted-charts';
import { withAlpha } from '@/theme/utils';
import { Skeleton, EmptyState } from '@/components/ui';

const { width } = Dimensions.get('window');

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

    const muscleDistribution = useMemo(() => {
        // Mocking muscle distribution based on 1RM data for visual variety
        const muscles: Record<string, number> = {};
        (oneRmQuery.data ?? []).forEach(item => {
            const m = (item as any).muscleGroup || 'Other';
            muscles[m] = (muscles[m] || 0) + 1;
        });

        const data = Object.entries(muscles).map(([text, value], i) => ({
            value,
            text,
            color: [colors.accent.coral, colors.accent.cyan, colors.accent.purple, colors.accent.amber][i % 4],
        }));

        return data.length > 0 ? data : [{ value: 1, text: 'No Data', color: colors.background.tertiary }];
    }, [oneRmQuery.data, colors]);

    return (
        <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
            {/* Header */}
            <View style={[styles.header, { paddingTop: insets.top + 20, borderBottomColor: colors.border.default }]}>
                <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
                </TouchableOpacity>
                <Text style={[typography.heading, { color: colors.text.primary, fontSize: 18 }]}>Performance Analytics</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
                {/* Overall Stats */}
                <View style={styles.statsOverview}>
                    <View style={styles.ovItem}>
                        <Text style={[typography.statMedium, { color: colors.accent.coral }]}>{heatmap.activeDays}</Text>
                        <Text style={[typography.overline, { color: colors.text.secondary, marginTop: 4 }]}>ACTIVE DAYS</Text>
                    </View>
                    <View style={[styles.ovDivider, { backgroundColor: colors.border.default }]} />
                    <View style={styles.ovItem}>
                        <Text style={[typography.statMedium, { color: colors.accent.cyan }]}>{oneRmQuery.data?.length || 0}</Text>
                        <Text style={[typography.overline, { color: colors.text.secondary, marginTop: 4 }]}>RECORDS</Text>
                    </View>
                </View>

                {/* Strength Progression Chart */}
                <View style={{ paddingHorizontal: 20, marginTop: 10 }}>
                    <View style={[styles.card, { backgroundColor: colors.background.secondary, borderRadius: borderRadius['2xl'], borderColor: colors.border.default }]}>
                        <View style={styles.cardHeader}>
                            <View>
                                <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: 'bold' }]}>Strength Progression</Text>
                                <Text style={[typography.caption, { color: colors.text.secondary }]}>
                                    {selectedExercise || 'Select an exercise below'}
                                </Text>
                            </View>
                            <Ionicons name="trending-up" size={20} color={colors.accent.emerald} />
                        </View>

                        {selectedExercise ? (
                            analyticsQuery.isLoading ? (
                                <View style={{ marginTop: 10 }}>
                                    <Skeleton width="100%" height={160} radius={borderRadius.lg} />
                                </View>
                            ) : analyticsQuery.isError ? (
                                <View style={styles.emptyChart}>
                                    <Ionicons name="cloud-offline-outline" size={32} color={colors.text.tertiary} />
                                    <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 10 }]}>Couldn't load progression. Pull to refresh or pick another record.</Text>
                                </View>
                            ) : chartData.length > 1 ? (
                                <View style={{ alignItems: 'center', marginTop: 10 }}>
                                    <LineChart
                                        data={chartData}
                                        width={width - 80}
                                        height={160}
                                        thickness={3}
                                        color={colors.accent.coral}
                                        startFillColor={colors.accent.coral}
                                        startOpacity={0.2}
                                        endOpacity={0}
                                        initialSpacing={20}
                                        noOfSections={4}
                                        yAxisThickness={0}
                                        xAxisThickness={0}
                                        yAxisTextStyle={{ color: colors.text.secondary, fontSize: 10 }}
                                        xAxisLabelTextStyle={{ color: colors.text.secondary, fontSize: 10 }}
                                    />
                                </View>
                            ) : (
                                <View style={styles.emptyChart}>
                                    <Text style={[typography.caption, { color: colors.text.secondary }]}>Not enough data to plot progression</Text>
                                </View>
                            )
                        ) : (
                            <View style={styles.emptyChart}>
                                <Ionicons name="bar-chart-outline" size={40} color={colors.text.tertiary} />
                                <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 10 }]}>Choose a personal record to track</Text>
                            </View>
                        )}
                    </View>
                </View>

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
                        topExercises.map((pr: OneRepMax) => (
                            <TouchableOpacity
                                key={pr.exerciseName}
                                accessibilityRole="button"
                                accessibilityState={{ selected: selectedExercise === pr.exerciseName }}
                                accessibilityLabel={pr.exerciseName}
                                style={[styles.prRow, { backgroundColor: colors.background.secondary, borderRadius: borderRadius.xl, borderColor: selectedExercise === pr.exerciseName ? colors.accent.coral : colors.border.default }]}
                                onPress={() => setSelectedExercise(pr.exerciseName)}
                                activeOpacity={0.85}
                            >
                                <View style={[styles.prIcon, { backgroundColor: withAlpha(colors.accent.amber, 0.14) }]}>
                                    <Ionicons name="trophy" size={18} color={colors.accent.amber} />
                                </View>
                                <View style={{ flex: 1, marginLeft: 16 }}>
                                    <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: 'bold' }]}>{pr.exerciseName}</Text>
                                    <Text style={[typography.caption, { color: colors.text.secondary }]}>{new Date(pr.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</Text>
                                </View>
                                <View style={{ alignItems: 'flex-end' }}>
                                    <Text style={[typography.statTiny, { color: colors.accent.cyan, fontSize: 18 }]}>{pr.estimated1RMKg}kg</Text>
                                    <Text style={[typography.overline, { color: colors.text.secondary, fontSize: 9 }]}>PR</Text>
                                </View>
                            </TouchableOpacity>
                        ))
                    )}
                </View>

                {/* Muscle Distribution */}
                <View style={{ paddingHorizontal: 20, marginTop: 24 }}>
                    <View style={[styles.card, { backgroundColor: colors.background.secondary, borderRadius: borderRadius['2xl'], borderColor: colors.border.default }]}>
                        <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: 'bold', marginBottom: 20 }]}>Volume Distribution</Text>
                        <View style={styles.pieRow}>
                            <PieChart
                                data={muscleDistribution}
                                donut
                                showText
                                textColor="#FFF"
                                radius={70}
                                innerRadius={45}
                                textSize={10}
                                focusOnPress
                            />
                            <View style={styles.legend}>
                                {muscleDistribution.map((item, idx) => (
                                    <View key={idx} style={styles.legendItem}>
                                        <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                                        <Text style={[typography.caption, { color: colors.text.secondary }]}>{item.text}</Text>
                                    </View>
                                ))}
                            </View>
                        </View>
                    </View>
                </View>

            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1 },
    backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    statsOverview: { flexDirection: 'row', padding: 24, gap: 20 },
    ovItem: { flex: 1, alignItems: 'center' },
    ovDivider: { width: 1, height: 40 },
    card: { padding: 20, borderWidth: 1 },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    emptyChart: { height: 160, alignItems: 'center', justifyContent: 'center' },
    prRow: { flexDirection: 'row', alignItems: 'center', padding: 16, marginBottom: 12, borderWidth: 1 },
    prIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    pieRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    legend: { gap: 8, paddingLeft: 20, flex: 1 },
    legendItem: { flexDirection: 'row', alignItems: 'center' },
    legendDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
});
