import React, { useMemo, useState, useCallback } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    Dimensions, RefreshControl, type TextStyle,
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getToday, getWeeklyStats, getHistory } from '@/api/progress';
import { deriveTodayScore } from '@/hooks/useProgress';
import { Skeleton, SkeletonCard, EmptyState, GlassCard, CtaButton } from '@/components/ui';
import { CountUpText } from '@/components/CountUpText';
import { AnimatedScoreRing } from '@/components/AnimatedScoreRing';
import { PressableScale } from '@/components/ui/PressableScale';
import { LineChart } from 'react-native-gifted-charts';
import { LinearGradient } from 'expo-linear-gradient';
import { withAlpha } from '@/theme/utils';
import { typography as typo } from '@/theme/typography';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';

const { width } = Dimensions.get('window');

// House entrance recipe — staggered FadeInDown spring, matching the (exercises)
// stack (analytics.tsx / history.tsx). `i` indexes the stagger.
const enter = (i: number) => FadeInDown.delay(70 + i * 45).springify().damping(18).mass(0.7);

// Tabular figures for changing numerals so condensed digits don't jitter in
// width as they animate/update. Applied inline (shared typography is off-limits).
const TABULAR: TextStyle = { fontVariant: ['tabular-nums'] };

export default function DailyReportScreen() {
    const { colors, typography, spacing, borderRadius, shadows } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const queryClient = useQueryClient();

    const todayQuery = useQuery({
        queryKey: ['today-progress'],
        queryFn: getToday,
        staleTime: 5 * 60 * 1000,
    });

    const weeklyQuery = useQuery({
        queryKey: ['weekly-stats'],
        queryFn: getWeeklyStats,
        staleTime: 5 * 60 * 1000,
    });

    // 7-day score history powers the trend chart — additive query, leaves the
    // existing today/weekly hooks untouched. Failures degrade to an empty trend.
    const historyQuery = useQuery({
        queryKey: ['progress-history', 7],
        queryFn: () => getHistory(7),
        staleTime: 5 * 60 * 1000,
    });

    const progress = todayQuery.data;
    const weekly = weeklyQuery.data;

    // Refresh the WHOLE hub — today + weekly strip + 7-day trend — not just
    // ['today-progress']. The old handler invalidated one key while the chart and
    // week strip went stale, contradicting the unqualified "Refresh" label.
    const [refreshing, setRefreshing] = useState(false);
    const refreshAll = useCallback(async () => {
        setRefreshing(true);
        try {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['today-progress'] }),
                queryClient.invalidateQueries({ queryKey: ['weekly-stats'] }),
                queryClient.invalidateQueries({ queryKey: ['progress-history', 7] }),
            ]);
        } finally {
            setRefreshing(false);
        }
    }, [queryClient]);

    // GET /v1/progress/today returns NO `score` field (see dailyProgressResponseSchema);
    // derive it on the client from the calorie + protein adherence the response DOES
    // carry, so the hero ring shows a real value + honest color instead of always 0/coral.
    const score = deriveTodayScore(progress);
    const scoreColor = score > 80 ? colors.success : score > 50 ? colors.warning : colors.accent.coral;

    // "Nothing logged yet today" — drives the hero empty-state. True when the
    // score is 0 AND there is genuinely no input to act on (no meals, no water),
    // so we surface tappable log affordances instead of a dead-end sentence.
    const nothingLogged =
        score === 0 &&
        (progress?.mealsLogged ?? 0) === 0 &&
        (progress?.hydrationActual ?? 0) === 0;

    // Affirmation copy scales with the score — the PEAK. Headline + one human line.
    const verdict = useMemo(() => {
        if (score >= 90) return { title: 'Peak day', line: 'Elite execution. Today is one to remember.' };
        if (score >= 80) return { title: 'Dialed in', line: 'High intensity, right on target. Keep the streak alive.' };
        if (score >= 50) return { title: 'On track', line: 'Solid momentum. A little more closes the gap.' };
        if (score > 0) return { title: 'Building', line: 'Every logged day compounds. You are moving forward.' };
        return { title: 'Fresh start', line: 'Log a meal or water to set today in motion.' };
    }, [score]);

    // Trend chart series — daily performance score over the last week, lime area.
    const trend = useMemo(() => {
        const rows = historyQuery.data ?? [];
        return rows.map((e) => ({
            value: Math.max(0, Math.min(100, Math.round(e.score ?? 0))),
            // Full 3-letter weekday (Mon/Tue/…) — the old 1-char slice collapsed
            // M/T/W/T/F/S/S into colliding pairs (two T's, two S's), so 7 points
            // could not be told apart.
            label: new Date(e.date).toLocaleDateString(undefined, { weekday: 'short' }),
        }));
    }, [historyQuery.data]);

    // Latest vs first plotted score → a trend delta headline above the chart.
    const trendDelta = useMemo(() => {
        if (trend.length < 2) return 0;
        return (trend[trend.length - 1]?.value ?? 0) - (trend[0]?.value ?? 0);
    }, [trend]);

    // Nav icons carry their own FUNCTIONAL hue — none uses full brand lime, which
    // is reserved for the hero ring + trend series + the one primary CTA. Photos
    // (a secondary destination, not a primary action) was on full lime; it now
    // uses blue so saturated lime stops competing across the screen.
    const NAV_ITEMS = [
        { label: 'Heart Rate', icon: 'heart', color: colors.accent.red, route: '/(performance)/heart-rate', value: 'Live · zones' },
        { label: 'Hydration', icon: 'water', color: colors.accent.cyan, route: '/(performance)/hydration', value: `${progress?.hydrationActual || 0}ml` },
        { label: 'Body Metrics', icon: 'speedometer', color: colors.accent.purple, route: '/(performance)/body-metrics', value: 'Update' },
        { label: 'AI Reports', icon: 'sparkles', color: colors.accent.amber, route: '/(performance)/reports', value: 'Weekly' },
        { label: 'Photos', icon: 'camera', color: colors.accent.blue, route: '/(performance)/photos', value: 'Gallery' },
    ];

    // This-week headline stats — value dominates label (big condensed numeral).
    // STREAK demoted off full lime to amber (a warm "flame" hue) so the only
    // saturated-lime indicator left on the screen is the hero score ring.
    const WEEK_STATS = [
        { label: 'AVG SCORE', value: `${weekly?.avgScore || 0}`, unit: '%', icon: 'analytics', tint: colors.accent.purple },
        { label: 'STREAK', value: `${weekly?.streakDays || 0}`, unit: 'd', icon: 'flame', tint: colors.accent.amber },
        { label: 'DAYS LOGGED', value: `${weekly?.daysLogged || 0}`, unit: '/7', icon: 'checkmark-done', tint: colors.success },
    ];

    // Optimizations checklist — sourced from the user's REAL plan targets, not
    // guessed literals. Each row is included ONLY when a genuine target exists
    // (e.g. proteinTarget from today's plan); a row with no real target is
    // omitted rather than asserting a possibly-false "unmet" state. Light
    // exposure is a boolean the server tracks directly, so it always shows.
    const optimizations = useMemo(() => {
        const rows: { key: string; label: string; checked: boolean; color: string }[] = [];
        const proteinTarget = progress?.proteinTarget ?? null;
        if (proteinTarget && proteinTarget > 0) {
            rows.push({
                key: 'protein',
                label: `Protein Target (${Math.round(proteinTarget)}g)`,
                checked: (progress?.proteinActual ?? 0) >= proteinTarget,
                color: colors.success,
            });
        }
        const calorieTarget = progress?.caloriesTarget ?? null;
        if (calorieTarget && calorieTarget > 0) {
            rows.push({
                key: 'calories',
                label: `Calorie Target (${Math.round(calorieTarget)})`,
                checked: (progress?.caloriesActual ?? 0) >= calorieTarget,
                color: colors.accent.cyan,
            });
        }
        rows.push({
            key: 'light',
            label: 'Light Exposure',
            checked: progress?.lightExposureCompleted || false,
            color: colors.accent.amber,
        });
        return rows;
    }, [progress, colors]);

    return (
        <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background.primary }]}>
            <StatusBar style="light" />
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.border.default }]}>
                <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Go back" activeOpacity={0.85} onPress={() => router.back()} style={[styles.headerBtn, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
                    <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
                </TouchableOpacity>
                <Text style={[typography.h3, { color: colors.text.primary }]}>Performance Hub</Text>
                <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Refresh all performance data" activeOpacity={0.85} onPress={refreshAll} style={[styles.headerBtn, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
                    <Ionicons name="refresh" size={20} color={colors.text.secondary} />
                </TouchableOpacity>
            </View>

            {todayQuery.isLoading ? (
                <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
                    <View style={{ padding: spacing.xl }}>
                        <SkeletonCard height={176} radius={borderRadius['2xl']} />
                    </View>
                    <View style={styles.weekStrip}>
                        {Array.from({ length: 3 }).map((_, i) => (
                            <SkeletonCard key={i} height={104} radius={borderRadius.xl} style={{ width: (width - 56) / 3, marginBottom: 0 }} />
                        ))}
                    </View>
                    <View style={{ paddingHorizontal: spacing.xl, marginTop: spacing['2xl'] }}>
                        <Skeleton width={140} height={22} style={{ marginBottom: spacing.md }} />
                        <SkeletonCard height={200} radius={borderRadius['2xl']} />
                    </View>
                    <View style={styles.gridContainer}>
                        {Array.from({ length: 4 }).map((_, i) => (
                            <SkeletonCard key={i} height={126} radius={borderRadius.xl} style={{ width: (width - 52) / 2, marginBottom: 0 }} />
                        ))}
                    </View>
                </ScrollView>
            ) : todayQuery.isError ? (
                <EmptyState
                    icon="cloud-offline-outline"
                    title="Couldn't load your hub"
                    subtitle="Something went wrong fetching today's performance. Check your connection and try again."
                    actionLabel="Try Again"
                    onAction={() => todayQuery.refetch()}
                />
            ) : (
            <>
            <ScrollView
                contentContainerStyle={{ paddingBottom: 132 + insets.bottom }}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={refreshAll}
                        tintColor={colors.accent.coral}
                        colors={[colors.accent.coral]}
                        progressBackgroundColor={colors.background.secondary}
                    />
                }
            >
                {/* Hero — how am I doing? Big condensed score numeral + ring + affirmation (the PEAK). */}
                <Animated.View entering={enter(0)} style={{ padding: spacing.xl }}>
                    <LinearGradient
                        colors={[withAlpha(scoreColor, 0.18), colors.background.secondary]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={[styles.scoreCard, { borderRadius: borderRadius['2xl'], borderColor: withAlpha(scoreColor, 0.4), borderWidth: 1 }, shadows.glow(scoreColor)]}
                    >
                        <View style={styles.scoreRow}>
                            <View style={styles.scoreRing}>
                                {/* Arc fills over the same ~900ms as the count-up numeral so they
                                    land together; a soft halo pulses once at score >= 80 (the PEAK). */}
                                <AnimatedScoreRing progress={score / 100} size={104} strokeWidth={9} color={scoreColor} trackColor={colors.border.default}>
                                    <Ionicons name="pulse" size={22} color={scoreColor} />
                                </AnimatedScoreRing>
                            </View>
                            <View style={styles.scoreInfo}>
                                <Text style={[typography.overline, { color: colors.text.secondary }]}>PERFORMANCE SCORE</Text>
                                <View style={styles.scoreNumRow}>
                                    <CountUpText
                                        value={score}
                                        duration={900}
                                        accessibilityLabel={`Performance score ${score} percent`}
                                        style={[styles.scoreNum, TABULAR, { color: colors.text.primary }]}
                                    />
                                    <Text style={[styles.scorePct, { color: colors.text.tertiary }]}>%</Text>
                                </View>
                                <Text style={[typography.h3, { color: scoreColor, marginTop: 2 }]}>{verdict.title}</Text>
                            </View>
                        </View>
                        <Text style={[typography.body, { color: colors.text.secondary, marginTop: spacing.lg }]}>
                            {verdict.line}
                        </Text>
                        {/* Empty-state affordance: when nothing is logged yet, the peak slot
                            offers tappable actions (icon + guidance + CTA) instead of a
                            dead-end sentence the user can't act on. */}
                        {nothingLogged && (
                            <View style={styles.heroActions}>
                                <CtaButton
                                    label="Log a meal"
                                    icon="restaurant"
                                    size="sm"
                                    onPress={() => router.push('/(meals)/log-meal' as any)}
                                    style={styles.heroActionBtn}
                                    accessibilityLabel="Log a meal to start today"
                                />
                                <PressableScale
                                    accessibilityRole="button"
                                    accessibilityLabel="Add water"
                                    onPress={() => router.push('/(performance)/hydration' as any)}
                                    style={[styles.heroSecondaryBtn, { borderColor: withAlpha(colors.accent.cyan, 0.4), backgroundColor: withAlpha(colors.accent.cyan, 0.12) }]}
                                >
                                    <Ionicons name="water" size={16} color={colors.accent.cyan} />
                                    <Text style={[typography.captionMedium, { color: colors.accent.cyan }]}>Add water</Text>
                                </PressableScale>
                            </View>
                        )}
                    </LinearGradient>
                </Animated.View>

                {/* This week — big-value condensed stat strip (value dominates label). */}
                <Animated.View entering={enter(1)} style={styles.weekStrip}>
                    {WEEK_STATS.map((s) => (
                        <View
                            key={s.label}
                            style={{ width: (width - 56) / 3 }}
                            accessible
                            accessibilityRole="text"
                            accessibilityLabel={`${s.label.toLowerCase()}: ${s.value}${s.unit}`}
                        >
                            <GlassCard radius={borderRadius.xl} style={{ flex: 1 }}>
                                <View style={styles.weekStatInner}>
                                    <Ionicons name={s.icon as any} size={16} color={s.tint} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
                                    <View style={styles.weekStatNumRow}>
                                        <Text style={[styles.weekStatNum, TABULAR, { color: colors.text.primary }]} numberOfLines={1}>{s.value}</Text>
                                        <Text style={[typography.caption, { color: colors.text.tertiary, marginBottom: 4 }]}>{s.unit}</Text>
                                    </View>
                                    <Text style={[typography.overline, { color: colors.text.secondary, fontSize: 9 }]} numberOfLines={1}>{s.label}</Text>
                                </View>
                            </GlassCard>
                        </View>
                    ))}
                </Animated.View>

                {/* Score Trend — 7-day line (lime area), with loading + empty states. */}
                <Animated.View entering={enter(2)} style={{ paddingHorizontal: spacing.xl, marginTop: spacing['2xl'] }}>
                    <GlassCard radius={borderRadius['2xl']} style={styles.trendCard}>
                        <View style={styles.cardHeader}>
                            <View style={{ flex: 1 }}>
                                <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: '700' }]}>Score Trend</Text>
                                {/* Name the axis unit — the y-values are an otherwise-unlabeled 0–100 score. */}
                                <Text style={[typography.caption, { color: colors.text.secondary }]}>Daily score (0–100) · last 7 days</Text>
                            </View>
                            {trend.length >= 2 && trendDelta !== 0 && (
                                <View style={[styles.deltaPill, { backgroundColor: withAlpha(trendDelta > 0 ? colors.accent.emerald : colors.accent.red, 0.14) }]}>
                                    <Ionicons name={trendDelta > 0 ? 'arrow-up' : 'arrow-down'} size={12} color={trendDelta > 0 ? colors.accent.emerald : colors.accent.red} />
                                    <Text style={[typography.captionMedium, { color: trendDelta > 0 ? colors.accent.emerald : colors.accent.red }]}>{Math.abs(trendDelta)} pts</Text>
                                </View>
                            )}
                        </View>

                        {historyQuery.isLoading ? (
                            <View style={{ marginTop: spacing.md }}>
                                <Skeleton width="100%" height={150} radius={borderRadius.lg} />
                            </View>
                        ) : trend.length >= 2 ? (
                            <Animated.View entering={FadeIn.duration(280)} style={{ marginTop: spacing.md }} accessibilityRole="image" accessibilityLabel="Line chart of your daily performance score over the last 7 days, scored 0 to 100">
                                {/* Legend — names the lime data series so the unlabeled axis reads clearly. */}
                                <View style={styles.legendRow}>
                                    <View style={[styles.legendDot, { backgroundColor: colors.accent.coral }]} />
                                    <Text style={[typography.caption, { color: colors.text.secondary }]}>Performance score</Text>
                                </View>
                                <View style={{ alignItems: 'center' }}>
                                    <LineChart
                                        data={trend}
                                        width={width - 112}
                                        height={150}
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
                                        maxValue={100}
                                        yAxisThickness={0}
                                        xAxisThickness={0}
                                        rulesColor={withAlpha(colors.border.default, 0.6)}
                                        yAxisTextStyle={{ color: colors.text.secondary, fontSize: 11 }}
                                        xAxisLabelTextStyle={{ color: colors.text.secondary, fontSize: 10 }}
                                        rotateLabel
                                    />
                                </View>
                            </Animated.View>
                        ) : (
                            <View style={styles.emptyChart}>
                                <Ionicons name="pulse-outline" size={32} color={colors.text.tertiary} />
                                <Text style={[typography.caption, { color: colors.text.secondary, marginTop: spacing.sm, textAlign: 'center' }]}>
                                    Log a few days to see your score trend take shape.
                                </Text>
                            </View>
                        )}
                    </GlassCard>
                </Animated.View>

                {/* Quick links — 2-col grid */}
                <Animated.View entering={enter(3)}>
                    <Text style={[typography.h3, { color: colors.text.primary, paddingHorizontal: spacing.xl, marginTop: spacing['2xl'], marginBottom: spacing.md }]}>Explore</Text>
                    <View style={styles.gridContainer}>
                        {NAV_ITEMS.map((item) => (
                            <PressableScale
                                key={item.label}
                                accessibilityRole="button"
                                accessibilityLabel={item.label}
                                style={styles.gridCard}
                                onPress={() => router.push(item.route as any)}
                            >
                                <GlassCard radius={borderRadius.xl} style={styles.gridGlass}>
                                    <View style={styles.gridInner}>
                                        <View style={[styles.iconBox, { backgroundColor: withAlpha(item.color, 0.14), borderColor: withAlpha(item.color, 0.28), borderWidth: 1 }]}>
                                            <Ionicons name={item.icon as any} size={24} color={item.color} />
                                        </View>
                                        <Text style={[typography.subhead, { color: colors.text.primary, marginTop: 14, fontWeight: '700' }]}>{item.label}</Text>
                                        <Text style={[typography.captionMedium, { color: item.color, marginTop: 4 }]}>{item.value}</Text>
                                    </View>
                                </GlassCard>
                            </PressableScale>
                        ))}
                    </View>
                </Animated.View>

                {/* Optimizations checklist — rows sourced from the user's real plan targets. */}
                <Animated.View entering={enter(4)} style={{ paddingHorizontal: spacing.xl, marginTop: spacing['2xl'] }}>
                    <Text style={[typography.h3, { color: colors.text.primary, marginBottom: spacing.md }]}>Optimizations</Text>
                    <View style={styles.checklist}>
                        {optimizations.map((row) => (
                            <CheckItem key={row.key} label={row.label} checked={row.checked} color={row.color} />
                        ))}
                    </View>
                </Animated.View>

                {/* Peak-end ENDING — a human affirmation closing the screen. Flat glass
                    (no glow): the hero is the one luminous moment, so stacking a second
                    lime halo here would over-state the effect on the OLED bg. */}
                <Animated.View entering={enter(5)} style={{ paddingHorizontal: spacing.xl, marginTop: spacing['2xl'] }}>
                    <GlassCard radius={borderRadius['2xl']}>
                        <View style={styles.endCard}>
                            <View style={[styles.endIcon, { backgroundColor: withAlpha(scoreColor, 0.14), borderColor: withAlpha(scoreColor, 0.28) }]}>
                                <Ionicons name="heart" size={20} color={scoreColor} />
                            </View>
                            <View style={{ flex: 1, marginLeft: spacing.md }}>
                                <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: '700' }]}>You showed up today</Text>
                                <Text style={[typography.bodySm, { color: colors.text.secondary, marginTop: 2 }]}>
                                    Consistency beats perfection. Come back tomorrow and keep the line moving up.
                                </Text>
                            </View>
                        </View>
                    </GlassCard>
                </Animated.View>
            </ScrollView>

            {/* Thumb-zone PRIMARY action — pinned in the bottom third, reachable by
                thumb. The screen's single full-lime anchor (ink label per the
                ink-on-lime rule), letting the rest of lime recede. */}
            <View
                pointerEvents="box-none"
                style={[styles.ctaDock, { paddingBottom: insets.bottom + spacing.md }]}
            >
                <LinearGradient
                    colors={['transparent', colors.background.primary]}
                    style={StyleSheet.absoluteFillObject}
                    pointerEvents="none"
                />
                <Animated.View entering={FadeInDown.delay(260).springify().damping(18).mass(0.7)}>
                    <CtaButton
                        label="View Full Report"
                        icon="document-text"
                        size="lg"
                        onPress={() => router.push('/(performance)/reports' as any)}
                        accessibilityLabel="View full performance report"
                        testID="performance-view-report-cta"
                    />
                </Animated.View>
            </View>
            </>
            )}
        </View>
    );
}

function CheckItem({ label, checked, color }: any) {
    const { colors, typography, borderRadius } = useTheme();
    return (
        <GlassCard radius={borderRadius.lg}>
            <View style={styles.checkRow}>
                <Text style={[typography.body, { color: colors.text.primary, flex: 1 }]}>{label}</Text>
                <Ionicons name={checked ? 'checkbox' : 'square-outline'} size={24} color={checked ? color : colors.text.tertiary} />
            </View>
        </GlassCard>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1 },
    headerBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    // Hero score card
    scoreCard: { padding: 24 },
    scoreRow: { flexDirection: 'row', alignItems: 'center' },
    scoreRing: { width: 104, height: 104, alignItems: 'center', justifyContent: 'center' },
    scoreInfo: { flex: 1, marginLeft: 22 },
    scoreNumRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 2 },
    scoreNum: { fontFamily: typo.display.fontFamily, fontSize: 56, lineHeight: 60, padding: 0 },
    scorePct: { fontFamily: typo.statSmall.fontFamily, fontSize: 22, marginBottom: 8, marginLeft: 2 },
    // Hero empty-state actions (shown only when nothing is logged yet today)
    heroActions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16, flexWrap: 'wrap' },
    heroActionBtn: { flexShrink: 1 },
    heroSecondaryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, minHeight: 40, borderRadius: 14, borderWidth: 1 },
    // This-week stat strip
    weekStrip: { flexDirection: 'row', paddingHorizontal: 20, gap: 8 },
    weekStatInner: { paddingVertical: 16, paddingHorizontal: 12, alignItems: 'center' },
    weekStatNumRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 8 },
    weekStatNum: { fontFamily: typo.statMedium.fontFamily, fontSize: 30, lineHeight: 34 },
    // Trend chart
    trendCard: { padding: 20 },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    deltaPill: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
    emptyChart: { height: 150, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
    legendRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
    legendDot: { width: 8, height: 8, borderRadius: 4 },
    // Quick links grid
    gridContainer: { flexDirection: 'row', paddingHorizontal: 20, flexWrap: 'wrap', gap: 12 },
    gridCard: { width: (width - 52) / 2 },
    gridGlass: { flex: 1 },
    gridInner: { padding: 20 },
    iconBox: { width: 44, height: 44, borderRadius: 22, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center' },
    // Checklist
    checklist: { gap: 10 },
    checkRow: { flexDirection: 'row', alignItems: 'center', padding: 16 },
    // Peak-end ending card
    endCard: { flexDirection: 'row', alignItems: 'center', padding: 18 },
    endIcon: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    // Pinned thumb-zone CTA dock — fades into the bg so the button floats over content.
    ctaDock: { position: 'absolute', left: 20, right: 20, bottom: 0, paddingTop: 24 },
});
