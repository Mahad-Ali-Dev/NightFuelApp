import React, { useMemo, useState } from 'react';
import {
    View, Text, StyleSheet, ScrollView, useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Animated, { FadeInDown, FadeOut } from 'react-native-reanimated';
import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/utils';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useProgress } from '@/hooks/useProgress';
import { useSleep } from '@/hooks/useSleep';
import { useQuery } from '@tanstack/react-query';
import { getUserScore } from '@/api/community';
import { Skeleton, EmptyState, GlassCard } from '@/components/ui';
import { PressableScale } from '@/components/PressableScale';
import { AnimatedRing } from '@/components/AnimatedRing';
import { AnimatedBarFill } from '@/components/AnimatedBarFill';
import { EntrainmentCard } from '@/components/dashboard/EntrainmentCard';
import { useEntrainmentScore } from '@/components/dashboard/useEntrainmentScore';
import { SleepPerformanceChart } from '@/components/analytics/SleepPerformanceChart';
import { TAB_BAR_H } from './_layout';
import { LinearGradient } from 'expo-linear-gradient';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

// Period filter chips. Purely a presentational toggle over the same weekly data
// (the underlying hooks return the rolling 7-day window); "7D" is the live view,
// the wider windows surface the brand pattern + roadmap without altering hooks.
const PERIODS = ['7D', '4W', '3M'] as const;
type Period = (typeof PERIODS)[number];

// ── Quick Action Links ────────────────────────────────────────────────────────

// Accents use the canonical Aurora theme hex values (module scope can't read the
// useTheme() hook, so we reference the exact accent hex from '@/theme/colors').
const QUICK_ACTIONS = [
    { icon: 'barbell-outline', label: 'Exercise\nHistory', route: '/(exercises)/history', color: '#4FC3F7' }, // accent.blue
    { icon: 'trophy-outline', label: 'Achievements', route: '/(community)/achievements', color: '#FFB300' }, // accent.amber
    { icon: 'podium-outline', label: 'Leaderboard', route: '/(community)/leaderboard', color: '#7C4DFF' }, // accent.purple
    { icon: 'body-outline', label: 'Muscle Map', route: '/(exercises)/muscles', color: '#10B981' }, // accent.emerald
];

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function AnalyticsScreen() {
    const { colors, typography, spacing, borderRadius, shadows } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const { width } = useWindowDimensions();

    // Local, presentational-only period selection (does not touch data hooks).
    const [period, setPeriod] = useState<Period>('7D');

    const { weekly } = useProgress();
    const { analytics } = useSleep();

    // The GENUINE circadian entrainment score + active shift for the
    // EntrainmentCard below. This is the real model-derived score (sourced from
    // getModel().entrainmentScore — melatonin-onset vs shift-end alignment), NOT
    // the sleep<->performance `correlationScore` proxy used by the Correlation
    // card. `score` is null-safe and `shift` undefined when there's no shift, so
    // the card's honest "log more shifts" path renders without throwing.
    const { score: entrainmentScore, shift: entrainmentShift } = useEntrainmentScore();

    // XP & Level from community/gamification
    const scoreQuery = useQuery({
        queryKey: ['my-score-analytics'],
        queryFn: () => getUserScore('me'),
    });
    const score = scoreQuery.data;
    const isScoreLoading = scoreQuery.isLoading;
    const isScoreError = scoreQuery.isError;

    const chartData = useMemo(() => {
        const weeklyData = (weekly as any)?.dailyBreakdown;
        return DAYS.map((day, i) => ({
            day,
            sleep: weeklyData?.[i]?.sleepQuality ?? 0,
            alert: weeklyData?.[i]?.alertnessScore ?? 0,
        }));
    }, [weekly]);

    const hasData = chartData.some(d => d.sleep > 0 || d.alert > 0);
    const fatiguePoint = (analytics as any)?.peakFatigueTime ?? '--:--';
    const deepSleep = (analytics as any)?.deepSleepDuration ?? '--';
    const deepSleepDelta = (analytics as any)?.deepSleepDelta ?? null;
    const correlationScore = (analytics as any)?.performanceCorrelation ?? null;

    // Hero averages — big condensed numbers over the live 7-day window.
    const avgSleep = useMemo(() => {
        const vals = chartData.map(d => d.sleep).filter(v => v > 0);
        return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
    }, [chartData]);
    const avgAlert = useMemo(() => {
        const vals = chartData.map(d => d.alert).filter(v => v > 0);
        return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
    }, [chartData]);

    // XP progress
    const xp = score?.xp ?? 0;
    const level = score?.level ?? 1;
    const nextLevelXp = score?.xpForNextLevel ?? 100;
    const prevLevelXp = level > 1 ? 100 * (level - 1) * level / 2 : 0;
    const levelProgress = nextLevelXp > prevLevelXp
        ? (xp - prevLevelXp) / (nextLevelXp - prevLevelXp)
        : 0;
    const levelPct = Math.min(100, Math.max(0, Math.round(levelProgress * 100)));

    // Width available inside the chart GlassCard (screen − screen padding − card padding).
    const chartInnerW = width - 20 * 2 - 20 * 2;

    return (
        <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background.primary }]}>
            <StatusBar style="light" />
            <View style={[styles.header, { borderBottomColor: colors.border.default }]}>
                <View style={{ width: 32 }} />
                <Text style={[typography.h1, { color: colors.text.primary }]}>Insights</Text>
                <PressableScale hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="History" style={styles.iconBtn} onPress={() => router.push('/(exercises)/history' as any)}>
                    <Ionicons name="time-outline" size={22} color={colors.text.secondary} />
                </PressableScale>
            </View>

            <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: TAB_BAR_H + 80 }} showsVerticalScrollIndicator={false}>

                {/* ── Period filter chips ─────────────────────────────── */}
                <Animated.View entering={FadeInDown.duration(420)} exiting={FadeOut.duration(160)} style={styles.periodRow}>
                    {PERIODS.map((p) => {
                        const active = p === period;
                        return (
                            <PressableScale
                                key={p}
                                accessibilityRole="button"
                                accessibilityLabel={`Show ${p === '7D' ? '7 day' : p === '4W' ? '4 week' : '3 month'} window`}
                                accessibilityState={{ selected: active }}
                                hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                                onPress={() => setPeriod(p)}
                                style={[
                                    styles.periodChip,
                                    {
                                        backgroundColor: active ? colors.accent.coral : colors.background.secondary,
                                        borderColor: active ? colors.accent.coral : colors.border.default,
                                    },
                                ]}
                            >
                                <Text
                                    style={[
                                        typography.captionMedium,
                                        { color: active ? colors.text.inverse : colors.text.secondary, fontWeight: '700' },
                                    ]}
                                >
                                    {p}
                                </Text>
                            </PressableScale>
                        );
                    })}
                    <View style={{ flex: 1 }} />
                    <View style={[styles.liveDot, { backgroundColor: withAlpha(colors.accent.coral, 0.14) }]}>
                        <View style={[styles.liveDotInner, { backgroundColor: colors.accent.coral }]} />
                        <Text style={[typography.caption, { color: colors.accent.coral, fontWeight: '700', fontSize: 10 }]}>LIVE</Text>
                    </View>
                </Animated.View>

                {/* ── Hero stat band — big condensed numbers ──────────── */}
                <Animated.View entering={FadeInDown.delay(40).duration(440).springify().damping(18)} exiting={FadeOut.duration(160)} style={styles.heroRow}>
                    {/* Avg Sleep Quality */}
                    <GlassCard radius={20} style={{ flex: 1 }} glow={colors.accent.coral}>
                        <View style={{ padding: 16 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <Ionicons name="moon" size={13} color={colors.accent.coral} />
                                <Text style={[typography.overline, { color: colors.text.secondary, fontSize: 10 }]}>SLEEP QUALITY</Text>
                            </View>
                            <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 6 }}>
                                <Text style={[typography.statLarge, { color: colors.text.primary }]}>
                                    {avgSleep ?? '--'}
                                </Text>
                                {avgSleep != null ? (
                                    <Text style={[typography.statSmall, { color: colors.text.tertiary, marginLeft: 2 }]}>%</Text>
                                ) : null}
                            </View>
                            <Text style={[typography.caption, { color: colors.text.tertiary, fontSize: 10 }]}>7-day average</Text>
                        </View>
                    </GlassCard>

                    {/* Avg Alertness */}
                    <GlassCard radius={20} style={{ flex: 1 }}>
                        <View style={{ padding: 16 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <Ionicons name="flash" size={13} color={colors.accent.coralLight} />
                                <Text style={[typography.overline, { color: colors.text.secondary, fontSize: 10 }]}>ALERTNESS</Text>
                            </View>
                            <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 6 }}>
                                <Text style={[typography.statLarge, { color: colors.text.primary }]}>
                                    {avgAlert ?? '--'}
                                </Text>
                                {avgAlert != null ? (
                                    <Text style={[typography.statSmall, { color: colors.text.tertiary, marginLeft: 2 }]}>%</Text>
                                ) : null}
                            </View>
                            <Text style={[typography.caption, { color: colors.text.tertiary, fontSize: 10 }]}>7-day average</Text>
                        </View>
                    </GlassCard>
                </Animated.View>

                {/* ── XP / Level Card ─────────────────────────────────── */}
                {isScoreLoading ? (
                    <Skeleton
                        width="100%"
                        height={150}
                        radius={borderRadius['2xl'] ?? 24}
                        style={{ marginBottom: spacing.lg }}
                    />
                ) : isScoreError ? (
                    // Distinct error-with-retry for the XP/Level read. Without this
                    // a failed scoreQuery silently rendered Level 1 / 0 XP, masking
                    // the failure. Retry re-runs the query in one tap.
                    <EmptyState
                        style={{ marginBottom: spacing.lg }}
                        icon="cloud-offline-outline"
                        title="Couldn't load your level"
                        subtitle="Check your connection and try again."
                        actionLabel="Retry"
                        onAction={() => scoreQuery.refetch()}
                    />
                ) : (
                <Animated.View entering={FadeInDown.delay(90).duration(460).springify().damping(18)} exiting={FadeOut.duration(180)}>
                <PressableScale onPress={() => router.push('/(community)/achievements' as any)} accessibilityRole="button" accessibilityLabel={`Fitness level ${level}, ${xp.toLocaleString()} XP total, view badges`} style={shadows.glow(colors.accent.purple)}>
                    <LinearGradient
                        colors={[colors.accent.purpleDark, colors.accent.purple, colors.accent.purpleDark]}
                        style={[styles.xpCard, { borderRadius: borderRadius['2xl'] ?? 24 }]}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    >
                        <View style={styles.xpCardTop}>
                            <View style={{ flex: 1 }}>
                                <Text style={[typography.overline, { color: withAlpha(colors.text.primary, 0.6) }]}>
                                    FITNESS LEVEL
                                </Text>
                                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 2 }}>
                                    <Text style={[typography.statLarge, { color: colors.text.primary }]}>
                                        {level}
                                    </Text>
                                    <Text style={[typography.caption, { color: withAlpha(colors.text.primary, 0.65), marginBottom: 8 }]}>
                                        / Level {level + 1}
                                    </Text>
                                </View>
                                <Text style={[typography.captionMedium, { color: colors.accent.purpleLight, fontWeight: 'bold' }]}>
                                    {xp.toLocaleString()} XP Total
                                </Text>
                            </View>

                            {/* Level progress RING — gamified, replaces the chevron block. */}
                            <View style={{ alignItems: 'center' }}>
                                <AnimatedRing
                                    size={68}
                                    strokeWidth={7}
                                    progress={levelPct}
                                    color={colors.text.primary}
                                    trackColor={withAlpha(colors.text.primary, 0.18)}
                                >
                                    <Text style={[typography.statSmall, { color: colors.text.primary, fontSize: 20 }]}>
                                        {levelPct}%
                                    </Text>
                                </AnimatedRing>
                                <View style={[styles.levelBadge, { backgroundColor: withAlpha(colors.text.primary, 0.15), borderColor: withAlpha(colors.text.primary, 0.25), marginTop: 10 }]}>
                                    <Ionicons name="sparkles" size={13} color={colors.text.primary} />
                                    <Text style={[typography.caption, { color: colors.text.primary, fontWeight: 'bold', marginLeft: 4, fontSize: 10 }]}>
                                        VIEW BADGES
                                    </Text>
                                </View>
                            </View>
                        </View>

                        {/* XP progress bar */}
                        <View style={{ marginTop: 18 }}>
                            <View style={[styles.xpProgressTrack, { backgroundColor: withAlpha(colors.text.primary, 0.15) }]}>
                                <AnimatedBarFill percent={levelPct} style={styles.xpProgressFill}>
                                    <LinearGradient
                                        colors={[colors.text.primary, colors.accent.purpleLight]}
                                        style={StyleSheet.absoluteFill}
                                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                                    />
                                </AnimatedBarFill>
                            </View>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
                                <Text style={[typography.caption, { color: withAlpha(colors.text.primary, 0.5), fontSize: 10 }]}>
                                    Lv {level}
                                </Text>
                                <Text style={[typography.caption, { color: withAlpha(colors.text.primary, 0.5), fontSize: 10 }]}>
                                    {levelPct}% → Lv {level + 1}
                                </Text>
                            </View>
                        </View>
                    </LinearGradient>
                </PressableScale>
                </Animated.View>
                )}

                {/* ── Quick Actions ────────────────────────────────────── */}
                <Animated.View entering={FadeInDown.delay(140).duration(440).springify().damping(18)} exiting={FadeOut.duration(180)} style={styles.quickActionsRow}>
                    {QUICK_ACTIONS.map((action, i) => (
                        <PressableScale
                            key={action.label}
                            accessibilityRole="button"
                            accessibilityLabel={action.label.replace(/\n/g, ' ')}
                            style={[styles.quickAction, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}
                            onPress={() => router.push(action.route as any)}
                        >
                            <View style={[styles.quickIconBox, { backgroundColor: withAlpha(action.color, 0.12) }]}>
                                <Ionicons name={action.icon as any} size={20} color={action.color} />
                            </View>
                            <Text style={[typography.caption, { color: colors.text.secondary, fontSize: 10, textAlign: 'center', marginTop: 8, lineHeight: 14 }]}>
                                {action.label}
                            </Text>
                        </PressableScale>
                    ))}
                </Animated.View>

                {/* ── Sleep vs Performance Chart ───────────────────────── */}
                <Animated.View entering={FadeInDown.delay(190).duration(460).springify().damping(18)} exiting={FadeOut.duration(180)}>
                <GlassCard radius={borderRadius['2xl'] ?? 24} style={{ marginBottom: 12 }}>
                    <View style={{ padding: 20 }}>
                    <View style={styles.chartTitleRow}>
                        <View style={{ flex: 1 }}>
                            <Text style={[typography.h3, { color: colors.text.primary }]}>Sleep vs. Performance</Text>
                            <Text style={[typography.bodySm, { color: colors.text.secondary, marginTop: 2 }]}>
                                {period === '7D' ? 'Last 7 Days' : period === '4W' ? 'Last 4 Weeks' : 'Last 3 Months'} correlation
                            </Text>
                        </View>
                        <View style={[styles.trendPill, { backgroundColor: withAlpha(colors.accent.coral, 0.12) }]}>
                            <Ionicons name="trending-up" size={13} color={colors.accent.coral} />
                            <Text style={[typography.caption, { color: colors.accent.coral, fontWeight: '700', fontSize: 10, marginLeft: 3 }]}>
                                TRACKING
                            </Text>
                        </View>
                    </View>

                    <View style={styles.legendRow}>
                        <View style={styles.legendItem}>
                            <View style={[styles.legendBox, { backgroundColor: colors.accent.coral }]} />
                            <Text style={[typography.caption, { color: colors.text.secondary }]}>Sleep Quality</Text>
                        </View>
                        <View style={styles.legendItem}>
                            <View style={[styles.legendLine, { backgroundColor: colors.accent.coralLight }]} />
                            <Text style={[typography.caption, { color: colors.text.secondary }]}>Alertness</Text>
                        </View>
                    </View>

                    {!hasData ? (
                        <EmptyState
                            style={styles.emptyChart}
                            icon="bar-chart-outline"
                            title="No data yet"
                            subtitle="Log sleep and activity to unlock your weekly correlation chart."
                            actionLabel="Log Sleep"
                            onAction={() => router.push('/(modals)/log-sleep' as any)}
                        />
                    ) : (
                        <View style={{ marginTop: 6 }}>
                            <SleepPerformanceChart data={chartData} width={chartInnerW} />
                        </View>
                    )}
                    </View>
                </GlassCard>
                </Animated.View>

                {/* ── Stats Row ─────────────────────────────────────────── */}
                <Animated.View entering={FadeInDown.delay(240).duration(460).springify().damping(18)} exiting={FadeOut.duration(180)} style={{ flexDirection: 'row', gap: 12 }}>
                    {/* Peak Fatigue */}
                    <GlassCard radius={20} style={{ flex: 1 }}>
                        <View style={{ padding: 18 }}>
                            <View style={[styles.statIconBox, { backgroundColor: withAlpha(colors.accent.coral, 0.12) }]}>
                                <Ionicons name="warning-outline" size={18} color={colors.accent.coral} />
                            </View>
                            <Text style={[typography.overline, { color: colors.text.secondary, marginTop: 12, fontSize: 10 }]}>
                                PEAK FATIGUE
                            </Text>
                            <Text style={[typography.statMedium, { color: colors.text.primary, marginTop: 4 }]}>
                                {fatiguePoint}
                            </Text>
                            <Text style={[typography.caption, { color: colors.text.tertiary, fontSize: 10, marginTop: 8 }]}>
                                Lowest predicted alertness
                            </Text>
                        </View>
                    </GlassCard>

                    {/* Deep Sleep */}
                    <GlassCard radius={20} style={{ flex: 1 }}>
                        <View style={{ padding: 18 }}>
                            <View style={[styles.statIconBox, { backgroundColor: withAlpha(colors.accent.cyan, 0.12) }]}>
                                <Ionicons name="moon-outline" size={18} color={colors.accent.cyan} />
                            </View>
                            <Text style={[typography.overline, { color: colors.text.secondary, marginTop: 12, fontSize: 10 }]}>
                                DEEP SLEEP
                            </Text>
                            <Text style={[typography.statMedium, { color: colors.text.primary, marginTop: 4 }]}>
                                {deepSleep}
                            </Text>
                            {deepSleepDelta != null ? (
                                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
                                    <Ionicons name={deepSleepDelta >= 0 ? 'trending-up' : 'trending-down'} size={12} color={deepSleepDelta >= 0 ? colors.accent.cyan : colors.accent.coral} />
                                    <Text style={[typography.caption, { color: deepSleepDelta >= 0 ? colors.accent.cyan : colors.accent.coral, marginLeft: 4, fontSize: 10, fontWeight: '700' }]}>
                                        {deepSleepDelta >= 0 ? '+' : ''}{deepSleepDelta}m vs avg
                                    </Text>
                                </View>
                            ) : (
                                <Text style={[typography.caption, { color: colors.text.tertiary, fontSize: 10, marginTop: 8 }]}>
                                    Time in deep sleep
                                </Text>
                            )}
                        </View>
                    </GlassCard>
                </Animated.View>

                {/* ── Performance Correlation Card ──────────────────────── */}
                <Animated.View entering={FadeInDown.delay(290).duration(460).springify().damping(18)} exiting={FadeOut.duration(180)}>
                <GlassCard radius={borderRadius['2xl'] ?? 24} style={{ marginTop: 12, marginBottom: 12 }}>
                    <View style={{ padding: 20 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <View style={{ flex: 1, paddingRight: 16 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <Ionicons name="git-network-outline" size={16} color={colors.accent.coral} />
                                <Text style={[typography.overline, { color: colors.accent.coral, fontSize: 11 }]}>
                                    SLEEP ↔ PERFORMANCE
                                </Text>
                            </View>
                            <Text style={[typography.bodySm, { color: colors.text.secondary, marginTop: 10 }]}>Correlation score</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 2 }}>
                                <Text style={[typography.statLarge, { color: colors.text.primary }]}>
                                    {correlationScore != null ? correlationScore : '--'}
                                </Text>
                                {correlationScore != null ? (
                                    <Text style={[typography.statSmall, { color: colors.text.tertiary, marginLeft: 2 }]}>%</Text>
                                ) : null}
                            </View>
                            <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 6, lineHeight: 18 }]}>
                                {correlationScore != null && correlationScore >= 70
                                    ? '✓ Strong correlation — sleep is driving your performance'
                                    : correlationScore != null
                                        ? 'Moderate link — improving sleep quality may boost alertness'
                                        : 'Log more data to see your correlation score'}
                            </Text>
                        </View>
                        {/* Correlation RING — value-true, ink label stays high-contrast. */}
                        <View style={shadows.glow(colors.accent.coral)}>
                            <AnimatedRing
                                size={88}
                                strokeWidth={9}
                                progress={correlationScore != null ? correlationScore : 0}
                                color={colors.accent.coral}
                                trackColor={withAlpha(colors.text.primary, 0.08)}
                            >
                                <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: '900' }]}>
                                    {correlationScore != null && correlationScore >= 70 ? 'High' : correlationScore != null ? 'Med' : '?'}
                                </Text>
                            </AnimatedRing>
                        </View>
                    </View>
                    </View>
                </GlassCard>
                </Animated.View>

                {/* ── Circadian Entrainment Insight ─────────────────────── */}
                {/* Sources the REAL circadian entrainment score from the
                    circadian model (useEntrainmentScore → getModel().
                    entrainmentScore, derived from melatonin-onset vs shift-end
                    alignment) — NOT the sleep<->performance `correlationScore`
                    above. The active shift is passed so the card's Wind-down
                    window hint renders live; both are null/undefined-safe, so
                    the honest "log more shifts" path never throws. */}
                <Animated.View entering={FadeInDown.delay(340).duration(460).springify().damping(18)} exiting={FadeOut.duration(180)}>
                    <EntrainmentCard score={entrainmentScore} shift={entrainmentShift} />
                </Animated.View>

                {/* ── Weekly AI Report ─────────────────────────────────── */}
                <Animated.View entering={FadeInDown.delay(390).duration(460).springify().damping(18)} exiting={FadeOut.duration(180)}>
                <PressableScale
                    accessibilityRole="button"
                    accessibilityLabel="Talk to Coach Ria"
                    style={[styles.aiCard, { backgroundColor: withAlpha(colors.accent.purple, 0.08), borderColor: withAlpha(colors.accent.purple, 0.3) }]}
                    onPress={() => router.push('/(modals)/ai-coach' as any)}
                >
                    <LinearGradient
                        colors={colors.gradients.purple}
                        style={styles.aiAvatarSmall}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    >
                        <Ionicons name="sparkles" size={16} color={colors.text.primary} />
                    </LinearGradient>
                    <View style={{ flex: 1, marginLeft: 14 }}>
                        <Text style={[typography.subhead, { color: colors.accent.purpleLight, fontWeight: '800', fontSize: 14 }]}>
                            Talk to Coach Ria
                        </Text>
                        <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 2 }]}>
                            Get a personalized analysis of your trends and recommendations
                        </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={colors.text.tertiary} />
                </PressableScale>
                </Animated.View>

            </ScrollView>
        </View>
    );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 14,
        borderBottomWidth: 1,
    },
    iconBtn: { width: 32, alignItems: 'flex-end' },

    // Period chips
    periodRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 16,
    },
    periodChip: {
        paddingHorizontal: 16,
        // Raised from 7 + minHeight added so the visible chip is a genuine 44pt
        // target (was ~30pt physically; only the invisible hitSlop reached 44).
        paddingVertical: 11,
        minHeight: 44,
        borderRadius: 999,
        borderWidth: 1,
        minWidth: 48,
        alignItems: 'center',
        justifyContent: 'center',
    },
    liveDot: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 999,
    },
    liveDotInner: { width: 6, height: 6, borderRadius: 3 },

    // Hero band
    heroRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },

    // XP Card
    xpCard: {
        padding: 22,
        marginBottom: 16,
        overflow: 'hidden',
    },
    xpCardTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    levelBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 10,
        borderWidth: 1,
    },
    xpProgressTrack: {
        height: 6,
        borderRadius: 3,
        overflow: 'hidden',
    },
    xpProgressFill: {
        height: '100%',
        borderRadius: 3,
    },

    // Quick Actions
    quickActionsRow: {
        flexDirection: 'row',
        gap: 10,
        marginBottom: 16,
    },
    quickAction: {
        flex: 1,
        alignItems: 'center',
        padding: 14,
        borderRadius: 18,
        borderWidth: 1,
    },
    quickIconBox: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },

    // Chart (the card surface is now the GlassCard primitive; these are its inner layout pieces)
    chartTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
    trendPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999 },
    legendRow: { flexDirection: 'row', gap: 20, marginBottom: 8 },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    legendBox: { width: 10, height: 10, borderRadius: 3 },
    legendLine: { width: 14, height: 3, borderRadius: 2 },
    emptyChart: { paddingVertical: 12, paddingHorizontal: 0 },

    // Stats cards (the card surface is now the GlassCard primitive; these are its inner pieces)
    statIconBox: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },

    // AI Card
    aiCard: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderRadius: 20,
        padding: 18,
        marginTop: 12,
    },
    aiAvatarSmall: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
});
