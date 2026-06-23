import React, { useMemo } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    Share, Dimensions,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { getWorkout } from '@/api/exercises';
import { format } from 'date-fns';
import { LinearGradient } from 'expo-linear-gradient';
import { withAlpha } from '@/theme/utils';
import { Skeleton, EmptyState, CtaButton, GlassCard } from '@/components/ui';
import { StatusBar } from 'expo-status-bar';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { BarChart } from 'react-native-gifted-charts';
import { PressableScale } from '@/components/report/PressableScale';

const { width } = Dimensions.get('window');

export default function WorkoutReportScreen() {
    const { colors, typography, spacing, borderRadius } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const { workoutId } = useLocalSearchParams<{ workoutId: string }>();

    const { data: workout, isLoading, isError, refetch } = useQuery({
        queryKey: ['workout-report', workoutId],
        queryFn: () => getWorkout(workoutId!),
        enabled: !!workoutId,
    });

    const handleShare = async () => {
        if (!workout) return;
        const title = workout.title || workout.type || 'Workout';
        const lines = [
            `💪 ${title} — Zeitra`,
            `⏱ ${workout.duration} min · 🏋️ ${Math.round(workout.totalVolume || 0)} kg volume · ${workout.exercises?.length || 0} exercises`,
        ];
        try {
            await Share.share({ message: lines.join('\n') });
        } catch {
            // User dismissed the share sheet or it's unavailable — nothing to do.
        }
    };

    // Per-exercise training volume (sets × reps × weight) — the textbook chart
    // surface for a "Performance Breakdown". Bars are labelled by a short form of
    // the exercise name so the BarChart stays legible. The single heaviest bar is
    // flagged so the chart + the breakdown cards share a "top set" highlight.
    const volumeBars = useMemo(() => {
        const list = workout?.exercises ?? [];
        const rows = list.map((ex: any) => {
            const sets = Number(ex.sets) || 0;
            const reps = Number(ex.reps) || 0;
            const weight = Number(ex.weightKg) || 0;
            const volume = Math.round(sets * reps * weight);
            const full = ex.name || ex.exerciseName || 'Exercise';
            return { full, volume };
        }).filter((r: { volume: number }) => r.volume > 0);

        const maxVolume = rows.reduce((m: number, r: { volume: number }) => Math.max(m, r.volume), 0);

        return rows.map((r: { full: string; volume: number }) => ({
            value: r.volume,
            label: r.full.length > 7 ? `${r.full.slice(0, 6)}…` : r.full,
            frontColor: r.volume === maxVolume && maxVolume > 0 ? colors.accent.coral : withAlpha(colors.accent.coral, 0.55),
        }));
    }, [workout?.exercises, colors.accent.coral]);

    // The heaviest single-exercise volume — used to badge the "TOP SET" card so
    // the breakdown reads as designed (one accent of hierarchy per list).
    const topVolume = useMemo(
        () => volumeBars.reduce((m: number, b: { value: number }) => Math.max(m, b.value), 0),
        [volumeBars],
    );

    if (isLoading) {
        return (
            <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
                {/* Header placeholder */}
                <View style={[styles.header, { paddingTop: insets.top, borderBottomColor: colors.border.default }]}>
                    <Skeleton width={28} height={28} radius={borderRadius.md} />
                    <Skeleton width={150} height={18} radius={borderRadius.sm} />
                    <Skeleton width={28} height={28} radius={borderRadius.md} />
                </View>

                {/* Hero placeholder */}
                <View style={[styles.hero, { backgroundColor: colors.background.secondary, borderBottomColor: colors.border.default }]}>
                    <Skeleton width={140} height={12} radius={borderRadius.sm} />
                    <Skeleton width={220} height={28} radius={borderRadius.md} style={{ marginTop: spacing.md }} />
                    <View style={styles.statsRow}>
                        {[0, 1, 2].map((i) => (
                            <View key={i} style={styles.statBox}>
                                <Skeleton width={56} height={32} radius={borderRadius.md} />
                                <Skeleton width={44} height={11} radius={borderRadius.sm} style={{ marginTop: spacing.sm }} />
                            </View>
                        ))}
                    </View>
                </View>

                {/* Exercise card placeholders */}
                <View style={{ padding: spacing.xl }}>
                    <Skeleton width={200} height={20} radius={borderRadius.md} style={{ marginBottom: spacing.lg }} />
                    {[0, 1, 2].map((i) => (
                        <Skeleton key={i} width="100%" height={108} radius={borderRadius.xl} style={{ marginBottom: spacing.lg }} />
                    ))}
                </View>
            </View>
        );
    }

    if (isError) {
        return (
            <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
                <View style={[styles.header, { paddingTop: insets.top, borderBottomColor: colors.border.default }]}>
                    <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Close" onPress={() => router.back()} style={styles.backBtn}>
                        <Ionicons name="close" size={24} color={colors.text.primary} />
                    </TouchableOpacity>
                    <Text style={[typography.heading, { color: colors.text.primary, fontSize: 18 }]}>Workout Summary</Text>
                    <View style={{ width: 40 }} />
                </View>
                <View style={{ flex: 1, justifyContent: 'center' }}>
                    <EmptyState
                        icon="cloud-offline-outline"
                        title="Couldn't load report"
                        subtitle="We couldn't reach your workout data. Check your connection and try again."
                        actionLabel="Try Again"
                        onAction={() => refetch()}
                    />
                </View>
            </View>
        );
    }

    if (!workout) {
        return (
            <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
                <View style={[styles.header, { paddingTop: insets.top, borderBottomColor: colors.border.default }]}>
                    <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Close" onPress={() => router.back()} style={styles.backBtn}>
                        <Ionicons name="close" size={24} color={colors.text.primary} />
                    </TouchableOpacity>
                    <Text style={[typography.heading, { color: colors.text.primary, fontSize: 18 }]}>Workout Summary</Text>
                    <View style={{ width: 40 }} />
                </View>
                <View style={{ flex: 1, justifyContent: 'center' }}>
                    <EmptyState
                        icon="barbell-outline"
                        title="Workout not found"
                        subtitle="We couldn't load this session. It may have been removed, or there was a connection hiccup."
                        actionLabel="Back to Training"
                        onAction={() => router.push('/(tabs)/training' as any)}
                    />
                </View>
            </View>
        );
    }

    return (
        <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
            <StatusBar style="light" />
            {/* Header */}
            <View style={[styles.header, { paddingTop: insets.top, borderBottomColor: colors.border.default }]}>
                <PressableScale hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Close" onPress={() => router.back()} style={styles.backBtn}>
                    <Ionicons name="close" size={24} color={colors.text.primary} />
                </PressableScale>
                <Text style={[typography.heading, { color: colors.text.primary, fontSize: 18 }]}>Workout Summary</Text>
                <PressableScale hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Share" onPress={handleShare} style={styles.backBtn}>
                    <Ionicons name="share-outline" size={24} color={colors.text.primary} />
                </PressableScale>
            </View>

            <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
                {/* Hero Stats */}
                <Animated.View
                    entering={FadeInDown.delay(40).springify().damping(18).mass(0.7)}
                    style={[styles.hero, { backgroundColor: colors.background.secondary, borderBottomColor: colors.border.default }]}
                >
                    {/* Aurora coral glow behind the hero */}
                    <LinearGradient
                        colors={[withAlpha(colors.accent.coral, 0.16), 'transparent']}
                        start={{ x: 0.5, y: 0 }}
                        end={{ x: 0.5, y: 1 }}
                        style={StyleSheet.absoluteFillObject}
                        pointerEvents="none"
                    />
                    <Text style={[typography.overline, { color: colors.accent.coral, marginBottom: 6 }]}>
                        {workout.completedAt || workout.startedAt
                            ? format(new Date(workout.completedAt || workout.startedAt), 'EEEE, MMMM do')
                            : 'Recent session'}
                    </Text>
                    <Text style={[typography.h1, { color: colors.text.primary, textAlign: 'center' }]}>
                        {workout.title || workout.type || 'Great Session!'}
                    </Text>

                    <View style={styles.statsRow}>
                        <View style={styles.statBox} accessible accessibilityRole="text" accessibilityLabel={`${workout.duration} minutes`}>
                            <Text style={[typography.statMedium, { color: colors.text.primary }]}>{workout.duration}</Text>
                            <Text style={[typography.overline, { color: colors.text.secondary, marginTop: 2 }]}>MINUTES</Text>
                        </View>
                        <View style={[styles.statDivider, { backgroundColor: colors.border.default }]} />
                        {/* Total volume is the headline metric — render it in statLarge. */}
                        <View style={styles.statBox} accessible accessibilityRole="text" accessibilityLabel={`Volume ${Math.round(workout.totalVolume || 0)} kilograms`}>
                            <Text style={[typography.statLarge, { color: colors.text.primary }]} numberOfLines={1} adjustsFontSizeToFit>{Math.round(workout.totalVolume || 0)}</Text>
                            <Text style={[typography.overline, { color: colors.text.secondary, marginTop: 2 }]}>VOL (KG)</Text>
                        </View>
                        <View style={[styles.statDivider, { backgroundColor: colors.border.default }]} />
                        <View style={styles.statBox} accessible accessibilityRole="text" accessibilityLabel={`${workout.exercises?.length || 0} exercises`}>
                            <Text style={[typography.statMedium, { color: colors.text.primary }]}>{workout.exercises?.length || 0}</Text>
                            <Text style={[typography.overline, { color: colors.text.secondary, marginTop: 2 }]}>EXERCISES</Text>
                        </View>
                    </View>
                </Animated.View>

                {/* Exercise List */}
                <View style={{ padding: spacing.xl }}>
                    <Animated.Text
                        entering={FadeInDown.delay(80).springify().damping(18).mass(0.7)}
                        style={[typography.heading, { color: colors.text.primary, marginBottom: spacing.lg }]}
                    >
                        Performance Breakdown
                    </Animated.Text>

                    {/* Volume by exercise — on-brand BarChart (lime data, subtle gridlines),
                        mirroring analytics.tsx / [id].tsx so it reads byte-consistent with
                        the rest of the app. Empty state when no sets carried weight. */}
                    <Animated.View entering={FadeInDown.delay(120).springify().damping(18).mass(0.7)}>
                        <GlassCard style={{ marginBottom: spacing.lg }}>
                            <View style={styles.chartCard}>
                                <View style={styles.cardHeader}>
                                    <View>
                                        <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: 'bold' }]}>Volume by Exercise</Text>
                                        <Text style={[typography.caption, { color: colors.text.secondary }]}>Sets × reps × weight (kg)</Text>
                                    </View>
                                    <Ionicons name="bar-chart" size={20} color={colors.accent.coral} />
                                </View>
                                {volumeBars.length > 0 ? (
                                    <View style={{ alignItems: 'center', marginTop: 10 }} accessibilityRole="image" accessibilityLabel="Bar chart of training volume per exercise">
                                        <BarChart
                                            data={volumeBars}
                                            width={width - 100}
                                            height={170}
                                            barWidth={Math.max(14, Math.min(34, (width - 140) / Math.max(volumeBars.length, 1) - 14))}
                                            barBorderRadius={4}
                                            noOfSections={4}
                                            initialSpacing={16}
                                            spacing={18}
                                            yAxisColor={colors.border.default}
                                            xAxisColor={colors.border.default}
                                            rulesColor={withAlpha(colors.border.default, 0.6)}
                                            yAxisTextStyle={{ color: colors.text.secondary, fontSize: 10 }}
                                            xAxisLabelTextStyle={{ color: colors.text.secondary, fontSize: 9 }}
                                        />
                                    </View>
                                ) : (
                                    <View style={styles.emptyChart}>
                                        <Ionicons name="stats-chart-outline" size={32} color={colors.text.tertiary} />
                                        <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 10, textAlign: 'center' }]}>
                                            No weighted sets logged — add a load to see volume here.
                                        </Text>
                                    </View>
                                )}
                            </View>
                        </GlassCard>
                    </Animated.View>

                    {workout.exercises?.map((ex: any, idx: number) => {
                        const est1RM = Math.round(ex.weightKg * (1 + ex.reps / 30));
                        const exVolume = Math.round((Number(ex.sets) || 0) * (Number(ex.reps) || 0) * (Number(ex.weightKg) || 0));
                        const isTopSet = exVolume > 0 && exVolume === topVolume;
                        const exName = ex.name || ex.exerciseName;
                        const a11yLabel = `${exName}, ${ex.sets} sets, ${ex.reps} reps, ${ex.weightKg} kilograms, estimated one-rep max ${est1RM} kilograms${isTopSet ? ', top set of this session' : ''}`;
                        // Lime volume bar — width is each exercise's share of the heaviest
                        // set, giving the otherwise-flat list a visual rhythm.
                        const barPct = topVolume > 0 ? Math.max(0.06, exVolume / topVolume) : 0;
                        return (
                            <Animated.View
                                key={idx}
                                entering={FadeInDown.delay(160 + idx * 40).springify().damping(18).mass(0.7)}
                            >
                                <PressableScale accessibilityRole="button" accessibilityLabel={a11yLabel} style={{ marginBottom: spacing.lg }}>
                                    <GlassCard radius={borderRadius.xl} glow={isTopSet ? colors.accent.coral : undefined}>
                                        <View style={[styles.exerciseCard, { borderLeftColor: colors.accent.coral, borderLeftWidth: 4 }]}>
                                            <View style={styles.exHeader}>
                                                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                                    <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: 'bold' }]} numberOfLines={1}>{exName}</Text>
                                                    {isTopSet ? (
                                                        <View style={[styles.topChip, { backgroundColor: withAlpha(colors.accent.coral, 0.16), borderColor: withAlpha(colors.accent.coral, 0.5) }]}>
                                                            <Text style={[typography.overline, { color: colors.accent.coral, fontSize: 9 }]}>TOP SET</Text>
                                                        </View>
                                                    ) : null}
                                                </View>
                                                <Ionicons name="checkmark-circle" size={20} color={colors.accent.emerald} />
                                            </View>

                                            <View style={styles.logRow}>
                                                <View style={styles.logItem}>
                                                    <Text style={[typography.caption, { color: colors.text.secondary }]}>SETS</Text>
                                                    <Text style={[typography.body, { color: colors.text.primary, fontWeight: 'bold' }]}>{ex.sets}</Text>
                                                </View>
                                                <View style={styles.logItem}>
                                                    <Text style={[typography.caption, { color: colors.text.secondary }]}>REPS</Text>
                                                    <Text style={[typography.body, { color: colors.text.primary, fontWeight: 'bold' }]}>{ex.reps}</Text>
                                                </View>
                                                <View style={styles.logItem}>
                                                    <Text style={[typography.caption, { color: colors.text.secondary }]}>WEIGHT</Text>
                                                    <Text style={[typography.body, { color: colors.text.primary, fontWeight: 'bold' }]}>{ex.weightKg}kg</Text>
                                                </View>
                                                <View style={[styles.logItem, { alignItems: 'flex-end' }]}>
                                                    <Text style={[typography.caption, { color: colors.text.secondary }]}>EST. 1RM</Text>
                                                    <Text style={[typography.statTiny, { color: colors.accent.coral }]} accessibilityLabel={`Estimated one-rep max ${est1RM} kilograms`}>
                                                        {est1RM}kg
                                                    </Text>
                                                </View>
                                            </View>

                                            {/* Per-card lime volume bar — share of the session's heaviest set. */}
                                            {exVolume > 0 ? (
                                                <View style={[styles.volTrack, { backgroundColor: withAlpha(colors.accent.coral, 0.12) }]}>
                                                    <View style={[styles.volFill, { width: `${Math.round(barPct * 100)}%`, backgroundColor: colors.accent.coral }]} />
                                                </View>
                                            ) : null}
                                        </View>
                                    </GlassCard>
                                </PressableScale>
                            </Animated.View>
                        );
                    })}

                    {/* Intensity Card */}
                    <Animated.View entering={FadeInDown.delay(160 + (workout.exercises?.length || 0) * 40).springify().damping(18).mass(0.7)}>
                        <GlassCard radius={borderRadius.xl} style={{ marginTop: spacing.xl }}>
                            <View
                                style={styles.infoCard}
                                accessible
                                accessibilityRole="text"
                                accessibilityLabel={`Intensity ${workout.intensity}. You burned approximately ${workout.caloriesBurned || workout.duration * 8} kilocalories during this session.`}
                            >
                                <View style={[styles.infoIcon, { backgroundColor: withAlpha(colors.accent.coral, 0.12) }]}>
                                    <Ionicons name="flash" size={20} color={colors.accent.coral} />
                                </View>
                                <View style={{ flex: 1, marginLeft: 16 }}>
                                    <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: 'bold' }]}>Intensity: {workout.intensity}</Text>
                                    <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 2 }]}>
                                        You burned approximately {workout.caloriesBurned || workout.duration * 8} kcal during this session.
                                    </Text>
                                </View>
                            </View>
                        </GlassCard>
                    </Animated.View>
                </View>
            </ScrollView>

            <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 20) }]}>
                <CtaButton
                    label="BACK TO TRAINING"
                    size="lg"
                    accessibilityLabel="Back to training"
                    onPress={() => router.push('/(tabs)/training' as any)}
                    style={[styles.mainBtn, { borderRadius: borderRadius.full }]}
                />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1 },
    backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    hero: { padding: 30, paddingTop: 44, alignItems: 'center', borderBottomWidth: 1, overflow: 'hidden' },
    statsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 30, width: '100%', gap: 20 },
    statBox: { alignItems: 'center', flex: 1 },
    statDivider: { width: 1, height: 30 },
    exerciseCard: { padding: 20 },
    exHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 10 },
    topChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
    logRow: { flexDirection: 'row', justifyContent: 'space-between' },
    logItem: { alignItems: 'flex-start' },
    volTrack: { height: 6, borderRadius: 3, marginTop: 16, overflow: 'hidden' },
    volFill: { height: 6, borderRadius: 3 },
    chartCard: { padding: 20 },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    emptyChart: { height: 160, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
    infoCard: { flexDirection: 'row', padding: 20, alignItems: 'center' },
    infoIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    footer: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 20 },
    mainBtn: { height: 60, alignItems: 'center', justifyContent: 'center' },
});
