import React, { useMemo } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/utils';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useProgress } from '@/hooks/useProgress';
import { useSleep } from '@/hooks/useSleep';
import { useQuery } from '@tanstack/react-query';
import { getUserScore } from '@/api/community';
import { Skeleton, EmptyState } from '@/components/ui';
import { EntrainmentCard } from '@/components/dashboard/EntrainmentCard';
import { TAB_BAR_H } from './_layout';
import { LinearGradient } from 'expo-linear-gradient';

const { width } = Dimensions.get('window');
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

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

    const { weekly } = useProgress();
    const { analytics } = useSleep();

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

    // XP progress
    const xp = score?.xp ?? 0;
    const level = score?.level ?? 1;
    const nextLevelXp = score?.xpForNextLevel ?? 100;
    const prevLevelXp = level > 1 ? 100 * (level - 1) * level / 2 : 0;
    const levelProgress = nextLevelXp > prevLevelXp
        ? (xp - prevLevelXp) / (nextLevelXp - prevLevelXp)
        : 0;

    return (
        <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background.primary }]}>
            <StatusBar style="light" />
            <View style={[styles.header, { borderBottomColor: colors.border.default }]}>
                <View style={{ width: 32 }} />
                <Text style={[typography.h1, { color: colors.text.primary }]}>Insights</Text>
                <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="History" activeOpacity={0.85} style={styles.iconBtn} onPress={() => router.push('/(exercises)/history' as any)}>
                    <Ionicons name="time-outline" size={22} color={colors.text.secondary} />
                </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: TAB_BAR_H + 80 }} showsVerticalScrollIndicator={false}>

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
                <TouchableOpacity onPress={() => router.push('/(community)/achievements' as any)} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={`Fitness level ${level}, ${xp.toLocaleString()} XP total, view badges`} style={shadows.glow(colors.accent.purple)}>
                    <LinearGradient
                        colors={[colors.accent.purpleDark, colors.accent.purple, colors.accent.purpleDark]}
                        style={[styles.xpCard, { borderRadius: borderRadius['2xl'] ?? 24 }]}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    >
                        <View style={styles.xpCardTop}>
                            <View>
                                <Text style={[typography.overline, { color: withAlpha(colors.text.primary, 0.6) }]}>
                                    FITNESS LEVEL
                                </Text>
                                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                                    <Text style={[typography.statMedium, { color: colors.text.primary }]}>
                                        {level}
                                    </Text>
                                    <Text style={[typography.caption, { color: withAlpha(colors.text.primary, 0.65), marginBottom: 6 }]}>
                                        / Level {level + 1}
                                    </Text>
                                </View>
                                <Text style={[typography.captionMedium, { color: colors.accent.purpleLight, fontWeight: 'bold' }]}>
                                    {xp.toLocaleString()} XP Total
                                </Text>
                            </View>
                            <View style={{ alignItems: 'flex-end' }}>
                                <View style={[styles.levelBadge, { backgroundColor: withAlpha(colors.text.primary, 0.15), borderColor: withAlpha(colors.text.primary, 0.25) }]}>
                                    <Ionicons name="sparkles" size={16} color={colors.text.primary} />
                                    <Text style={[typography.caption, { color: colors.text.primary, fontWeight: 'bold', marginLeft: 4 }]}>
                                        VIEW BADGES
                                    </Text>
                                </View>
                                <Ionicons name="chevron-forward" size={20} color={withAlpha(colors.text.primary, 0.5)} style={{ marginTop: 8 }} />
                            </View>
                        </View>

                        {/* XP progress bar */}
                        <View style={{ marginTop: 18 }}>
                            <View style={[styles.xpProgressTrack, { backgroundColor: withAlpha(colors.text.primary, 0.15) }]}>
                                <LinearGradient
                                    colors={[colors.text.primary, colors.accent.purpleLight]}
                                    style={[styles.xpProgressFill, { width: `${Math.min(100, Math.round(levelProgress * 100))}%` }]}
                                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                                />
                            </View>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
                                <Text style={[typography.caption, { color: withAlpha(colors.text.primary, 0.5), fontSize: 10 }]}>
                                    Lv {level}
                                </Text>
                                <Text style={[typography.caption, { color: withAlpha(colors.text.primary, 0.5), fontSize: 10 }]}>
                                    {Math.round(levelProgress * 100)}% → Lv {level + 1}
                                </Text>
                            </View>
                        </View>
                    </LinearGradient>
                </TouchableOpacity>
                )}

                {/* ── Quick Actions ────────────────────────────────────── */}
                <View style={styles.quickActionsRow}>
                    {QUICK_ACTIONS.map((action) => (
                        <TouchableOpacity
                            key={action.label}
                            accessibilityRole="button"
                            accessibilityLabel={action.label.replace('\n', ' ')}
                            style={[styles.quickAction, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}
                            onPress={() => router.push(action.route as any)}
                            activeOpacity={0.85}
                        >
                            <View style={[styles.quickIconBox, { backgroundColor: withAlpha(action.color, 0.12) }]}>
                                <Ionicons name={action.icon as any} size={20} color={action.color} />
                            </View>
                            <Text style={[typography.caption, { color: colors.text.secondary, fontSize: 10, textAlign: 'center', marginTop: 8, lineHeight: 14 }]}>
                                {action.label}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* ── Sleep vs Performance Chart ───────────────────────── */}
                <View style={[styles.card, { backgroundColor: colors.background.secondary, borderColor: colors.border.default, borderRadius: borderRadius['2xl'] ?? 24, marginTop: 8 }]}>
                    <View style={styles.chartTitleRow}>
                        <View>
                            <Text style={[typography.h3, { color: colors.text.primary }]}>Sleep vs. Performance</Text>
                            <Text style={[typography.body, { color: colors.text.secondary, marginTop: 4 }]}>Last 7 Days Correlation</Text>
                        </View>
                    </View>

                    <View style={styles.legendRow}>
                        <View style={styles.legendItem}>
                            <View style={[styles.legendBox, { backgroundColor: colors.accent.cyan }]} />
                            <Text style={[typography.caption, { color: colors.text.secondary }]}>Sleep Quality</Text>
                        </View>
                        <View style={styles.legendItem}>
                            <View style={[styles.legendBox, { backgroundColor: colors.accent.coral }]} />
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
                        <View style={styles.chartArea}>
                            {[0.25, 0.5, 0.75].map((pos, i) => (
                                <View key={i} style={[styles.gridLine, { bottom: `${pos * 100}%`, backgroundColor: withAlpha(colors.text.tertiary, 0.15) }]} />
                            ))}

                            <View style={styles.barsContainer}>
                                {chartData.map((d, i) => (
                                    <View key={i} style={styles.barCol}>
                                        <LinearGradient
                                            colors={[colors.accent.cyan, withAlpha(colors.accent.cyan, 0.3)]}
                                            style={[styles.bar, { height: `${d.sleep}%` }]}
                                            start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
                                        />
                                        <View style={[styles.alertDot, { bottom: `${d.alert}%`, backgroundColor: colors.accent.coral }]} />
                                    </View>
                                ))}
                            </View>

                            <View style={styles.xAxis}>
                                {DAYS.map((d, i) => (
                                    <Text key={i} style={[typography.caption, { color: colors.text.secondary, fontSize: 10, flex: 1, textAlign: 'center' }]}>{d}</Text>
                                ))}
                            </View>
                        </View>
                    )}
                </View>

                {/* ── Stats Row ─────────────────────────────────────────── */}
                <View style={{ flexDirection: 'row', gap: 12, marginTop: 0 }}>
                    {/* Peak Fatigue */}
                    <View style={[styles.statCard, { backgroundColor: colors.background.secondary, borderColor: colors.border.default, flex: 1 }]}>
                        <View style={[styles.statIconBox, { backgroundColor: withAlpha(colors.accent.coral, 0.12) }]}>
                            <Ionicons name="warning-outline" size={18} color={colors.accent.coral} />
                        </View>
                        <Text style={[typography.overline, { color: colors.text.secondary, marginTop: 12, fontSize: 10 }]}>
                            PEAK FATIGUE
                        </Text>
                        <Text style={[typography.statSmall, { color: colors.text.primary, marginTop: 6 }]}>
                            {fatiguePoint}
                        </Text>
                        <View style={[styles.miniBar, { backgroundColor: colors.border.default }]}>
                            <View style={[styles.miniBarFill, { backgroundColor: colors.accent.coral, width: '70%' }]} />
                        </View>
                    </View>

                    {/* Deep Sleep */}
                    <View style={[styles.statCard, { backgroundColor: colors.background.secondary, borderColor: colors.border.default, flex: 1 }]}>
                        <View style={[styles.statIconBox, { backgroundColor: withAlpha(colors.accent.cyan, 0.12) }]}>
                            <Ionicons name="moon-outline" size={18} color={colors.accent.cyan} />
                        </View>
                        <Text style={[typography.overline, { color: colors.text.secondary, marginTop: 12, fontSize: 10 }]}>
                            DEEP SLEEP
                        </Text>
                        <Text style={[typography.statSmall, { color: colors.text.primary, marginTop: 6 }]}>
                            {deepSleep}
                        </Text>
                        {deepSleepDelta != null && (
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
                                <Ionicons name={deepSleepDelta >= 0 ? 'trending-up' : 'trending-down'} size={12} color={deepSleepDelta >= 0 ? colors.accent.cyan : colors.accent.coral} />
                                <Text style={[typography.caption, { color: deepSleepDelta >= 0 ? colors.accent.cyan : colors.accent.coral, marginLeft: 4, fontSize: 10, fontWeight: '700' }]}>
                                    {deepSleepDelta >= 0 ? '+' : ''}{deepSleepDelta}m vs avg
                                </Text>
                            </View>
                        )}
                    </View>
                </View>

                {/* ── Performance Correlation Card ──────────────────────── */}
                <View style={[styles.card, { backgroundColor: colors.background.secondary, borderColor: colors.border.default, borderRadius: borderRadius['2xl'] ?? 24, marginTop: 12 }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <Ionicons name="git-network-outline" size={16} color={colors.accent.purple} />
                                <Text style={[typography.overline, { color: colors.accent.purple, fontSize: 11 }]}>
                                    SLEEP ↔ PERFORMANCE
                                </Text>
                            </View>
                            <Text style={[typography.body, { color: colors.text.secondary, marginTop: 10 }]}>Correlation Score</Text>
                            <Text style={[typography.statMedium, { color: colors.text.primary, marginTop: 4 }]}>
                                {correlationScore != null ? `${correlationScore}%` : '--'}
                            </Text>
                            <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 6, lineHeight: 18 }]}>
                                {correlationScore != null && correlationScore >= 70
                                    ? '✓ Strong correlation — sleep is driving your performance'
                                    : correlationScore != null
                                        ? 'Moderate link — improving sleep quality may boost alertness'
                                        : 'Log more data to see your correlation score'}
                            </Text>
                        </View>
                        <View style={[styles.correlationCircle, shadows.glow(colors.accent.purple)]}>
                            <LinearGradient
                                colors={colors.gradients.purple}
                                style={StyleSheet.absoluteFillObject}
                                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                            />
                            <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: '900' }]}>
                                {correlationScore != null && correlationScore >= 70 ? 'High' : correlationScore != null ? 'Med' : '?'}
                            </Text>
                        </View>
                    </View>
                </View>

                {/* ── Circadian Entrainment Insight ─────────────────────── */}
                {/* First consumer of the F3 helper (src/lib/circadian/entrainment.ts):
                    drives its advice copy from the user's alignment score. We
                    reuse the analytics `correlationScore` (a finite 0–100 read,
                    or null when there isn't enough data yet) as the entrainment
                    score — null is default-safe and never throws. */}
                <EntrainmentCard
                    score={typeof correlationScore === 'number' ? correlationScore : null}
                />

                {/* ── Weekly AI Report ─────────────────────────────────── */}
                <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Talk to Coach Ria"
                    style={[styles.aiCard, { backgroundColor: withAlpha(colors.accent.purple, 0.08), borderColor: withAlpha(colors.accent.purple, 0.3) }]}
                    onPress={() => router.push('/(modals)/ai-coach' as any)}
                    activeOpacity={0.85}
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
                </TouchableOpacity>

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

    // Chart
    card: { borderWidth: 1, padding: 20, marginBottom: 12 },
    chartTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
    legendRow: { flexDirection: 'row', gap: 20, marginBottom: 16 },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    legendBox: { width: 10, height: 10, borderRadius: 2 },
    chartArea: { height: 180, width: '100%', position: 'relative' },
    gridLine: { position: 'absolute', width: '100%', height: 1 },
    barsContainer: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingBottom: 30 },
    barCol: { flex: 1, height: '100%', justifyContent: 'flex-end', alignItems: 'center', position: 'relative', marginHorizontal: 2 },
    bar: { width: '80%', borderRadius: 3, minHeight: 4 },
    alertDot: { position: 'absolute', width: 8, height: 8, borderRadius: 4, left: '50%', marginLeft: -4 },
    xAxis: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row' },
    emptyChart: { paddingVertical: 12, paddingHorizontal: 0 },

    // Stats cards
    statCard: { borderWidth: 1, borderRadius: 20, padding: 18 },
    statIconBox: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    miniBar: { height: 4, borderRadius: 2, marginTop: 12 },
    miniBarFill: { height: '100%', borderRadius: 2 },

    // Correlation
    correlationCircle: {
        width: 72,
        height: 72,
        borderRadius: 36,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },

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
