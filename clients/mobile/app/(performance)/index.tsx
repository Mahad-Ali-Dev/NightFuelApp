import React from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getToday, getWeeklyStats, TodayProgress } from '@/api/progress';
import { CircularProgress } from '@/components/ui/CircularProgress';
import { Card } from '@/components/ui/Card';
import { Skeleton, SkeletonCard, EmptyState } from '@/components/ui';
import { LinearGradient } from 'expo-linear-gradient';
import { withAlpha } from '@/theme/utils';
import { typography as typo } from '@/theme/typography';

const { width } = Dimensions.get('window');

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

    const progress = todayQuery.data;
    const weekly = weeklyQuery.data;

    const score = progress?.score || 0;
    const scoreColor = score > 80 ? colors.success : score > 50 ? colors.warning : colors.accent.coral;

    const NAV_ITEMS = [
        { label: 'Hydration', icon: 'water', color: colors.accent.cyan, route: '/(performance)/hydration', value: `${progress?.hydrationActual || 0}ml` },
        { label: 'Body Metrics', icon: 'speedometer', color: colors.accent.purple, route: '/(performance)/body-metrics', value: 'Update' },
        { label: 'AI Reports', icon: 'sparkles', color: colors.accent.amber, route: '/(performance)/reports', value: 'Weekly' },
        { label: 'Photos', icon: 'camera', color: colors.accent.coral, route: '/(performance)/photos', value: 'Gallery' },
    ];


    return (
        <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background.primary }]}>
            <StatusBar style="light" />
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.border.default }]}>
                <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Go back" activeOpacity={0.85} onPress={() => router.back()} style={[styles.headerBtn, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
                    <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
                </TouchableOpacity>
                <Text style={[typography.h3, { color: colors.text.primary }]}>Performance Hub</Text>
                <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Refresh" activeOpacity={0.85} onPress={() => queryClient.invalidateQueries({ queryKey: ['today-progress'] })} style={[styles.headerBtn, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
                    <Ionicons name="refresh" size={20} color={colors.text.secondary} />
                </TouchableOpacity>
            </View>

            {todayQuery.isLoading ? (
                <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
                    <View style={{ padding: spacing.xl }}>
                        <SkeletonCard height={148} radius={borderRadius['2xl']} />
                    </View>
                    <View style={styles.gridContainer}>
                        {Array.from({ length: 4 }).map((_, i) => (
                            <SkeletonCard key={i} height={126} radius={borderRadius.xl} style={{ width: (width - 52) / 2, marginBottom: 0 }} />
                        ))}
                    </View>
                    <View style={{ paddingHorizontal: spacing.xl, marginTop: spacing['2xl'] }}>
                        <Skeleton width={140} height={22} style={{ marginBottom: spacing.md }} />
                        <SkeletonCard height={150} radius={borderRadius.xl} />
                    </View>
                    <View style={{ paddingHorizontal: spacing.xl, marginTop: spacing['2xl'] }}>
                        <Skeleton width={140} height={22} style={{ marginBottom: spacing.md }} />
                        {Array.from({ length: 3 }).map((_, i) => (
                            <SkeletonCard key={i} height={54} radius={borderRadius.lg} style={{ marginBottom: spacing.sm + 2 }} />
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
            <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
                {/* Score Card */}
                <View style={{ padding: spacing.xl }}>
                    <LinearGradient
                        colors={[withAlpha(scoreColor, 0.18), colors.background.secondary]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={[styles.scoreCard, { borderRadius: borderRadius['2xl'], borderColor: withAlpha(scoreColor, 0.4), borderWidth: 1 }, shadows.glow(scoreColor)]}
                    >
                        <View style={styles.scoreRow}>
                            <View style={styles.scoreRing}>
                                <CircularProgress progress={score / 100} size={100} strokeWidth={8} color={scoreColor} trackColor={colors.border.default} />
                                <View style={styles.ringInner}>
                                    <Text style={[styles.scoreNum, { color: colors.text.primary }]}>{score}</Text>
                                    <Text style={[typography.overline, { color: colors.text.secondary, fontSize: 9 }]}>PERF SCORE</Text>
                                </View>
                            </View>
                            <View style={styles.scoreInfo}>
                                <Text style={[typography.h3, { color: colors.text.primary }]}>Great Job!</Text>
                                <Text style={[typography.body, { color: colors.text.secondary, marginTop: 4 }]}>
                                    Your performance score is {score}% today. Keep up the high intensity!
                                </Text>
                            </View>
                        </View>
                    </LinearGradient>
                </View>

                {/* Grid Metrics */}
                <View style={styles.gridContainer}>
                    {NAV_ITEMS.map((item) => (
                        <TouchableOpacity
                            key={item.label}
                            activeOpacity={0.85}
                            accessibilityRole="button"
                            accessibilityLabel={item.label}
                            style={[styles.gridCard, { backgroundColor: colors.background.secondary, borderColor: colors.border.default, borderRadius: borderRadius.xl }]}
                            onPress={() => router.push(item.route as any)}
                        >
                            <View style={[styles.iconBox, { backgroundColor: withAlpha(item.color, 0.14), borderColor: withAlpha(item.color, 0.28), borderWidth: 1 }]}>
                                <Ionicons name={item.icon as any} size={24} color={item.color} />
                            </View>
                            <Text style={[typography.subhead, { color: colors.text.primary, marginTop: 14, fontWeight: '700' }]}>{item.label}</Text>
                            <Text style={[typography.captionMedium, { color: item.color, marginTop: 4 }]}>{item.value}</Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Weekly Recap */}
                <View style={{ paddingHorizontal: spacing.xl, marginTop: spacing['2xl'] }}>
                    <Text style={[typography.h3, { color: colors.text.primary, marginBottom: spacing.md }]}>Weekly Recap</Text>
                    <Card variant="glass" style={styles.recapCard}>
                        <View style={styles.recapRow}>
                            <RecapItem label="Avg Score" value={`${weekly?.avgScore || 0}%`} icon="analytics" color={colors.accent.purple} />
                            <RecapItem label="Streak" value={`${weekly?.streakDays || 0} Days`} icon="flash" color={colors.accent.coral} />
                        </View>
                        <View style={[styles.divider, { backgroundColor: colors.border.default }]} />
                        <View style={styles.recapRow}>
                            <RecapItem label="Water" value={`${(weekly?.avgHydration || 0) / 1000}L`} icon="water" color={colors.accent.cyan} />
                            <RecapItem label="Logged" value={`${weekly?.daysLogged || 0}/7`} icon="checkmark-circle" color={colors.success} />
                        </View>
                    </Card>
                </View>

                {/* Daily Checklist */}
                <View style={{ paddingHorizontal: spacing.xl, marginTop: spacing['2xl'] }}>
                    <Text style={[typography.h3, { color: colors.text.primary, marginBottom: spacing.md }]}>Optimizations</Text>
                    <View style={styles.checklist}>
                        <CheckItem label="Protein Target Met" checked={!!progress && (progress.proteinActual ?? 0) >= 140} color={colors.success} />
                        <CheckItem label="Hydration Goal" checked={!!progress && (progress.hydrationActual ?? 0) >= 2500} color={colors.accent.cyan} />
                        <CheckItem label="Light Exposure" checked={progress?.lightExposureCompleted || false} color={colors.accent.amber} />
                    </View>
                </View>
            </ScrollView>
            )}
        </View>
    );
}

function RecapItem({ label, value, icon, color }: any) {
    const { colors, typography } = useTheme();
    return (
        <View style={styles.recapItem}>
            <View style={[styles.recapIcon, { backgroundColor: withAlpha(color, 0.14) }]}>
                <Ionicons name={icon} size={18} color={color} />
            </View>
            <View style={{ marginLeft: 12 }}>
                <Text style={[typography.caption, { color: colors.text.secondary }]}>{label}</Text>
                <Text style={[styles.recapValue, { color: colors.text.primary }]}>{value}</Text>
            </View>
        </View>
    );
}

function CheckItem({ label, checked, color }: any) {
    const { colors, typography, borderRadius } = useTheme();
    return (
        <View style={[styles.checkRow, { backgroundColor: colors.background.secondary, borderRadius: borderRadius.lg, borderColor: colors.border.default, borderWidth: 1 }]}>
            <Text style={[typography.body, { color: colors.text.primary, flex: 1 }]}>{label}</Text>
            <Ionicons name={checked ? 'checkbox' : 'square-outline'} size={24} color={checked ? color : colors.text.tertiary} />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1 },
    headerBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    scoreNum: { fontFamily: typo.statMedium.fontFamily, fontSize: 32, lineHeight: 38 },
    recapValue: { fontFamily: typo.statTiny.fontFamily, fontSize: 16, marginTop: 1 },
    scoreCard: { padding: 24 },
    scoreRow: { flexDirection: 'row', alignItems: 'center' },
    scoreRing: { width: 100, height: 100, alignItems: 'center', justifyContent: 'center' },
    ringInner: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
    scoreInfo: { flex: 1, marginLeft: 24 },
    gridContainer: { flexDirection: 'row', paddingHorizontal: 20, flexWrap: 'wrap', gap: 12 },
    gridCard: { width: (width - 52) / 2, padding: 20, borderWidth: 1 },
    iconBox: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
    recapCard: { padding: 20 },
    recapRow: { flexDirection: 'row', justifyContent: 'space-between' },
    recapItem: { flex: 1, flexDirection: 'row', alignItems: 'center' },
    recapIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
    divider: { height: 1, marginVertical: 16 },
    checklist: { gap: 10 },
    checkRow: { flexDirection: 'row', alignItems: 'center', padding: 16 },
});
