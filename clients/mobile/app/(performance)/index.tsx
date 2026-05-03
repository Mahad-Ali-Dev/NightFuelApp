import React from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    ActivityIndicator, Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getToday, getWeeklyStats, TodayProgress } from '@/api/progress';
import { CircularProgress } from '@/components/ui/CircularProgress';
import { LinearGradient } from 'expo-linear-gradient';

const { width } = Dimensions.get('window');

export default function DailyReportScreen() {
    const { colors, typography, spacing, borderRadius } = useTheme();
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
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.border.default }]}>
                <TouchableOpacity onPress={() => router.back()}>
                    <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
                </TouchableOpacity>
                <Text style={[typography.heading, { color: colors.text.primary, fontSize: 20 }]}>Performance Hub</Text>
                <TouchableOpacity onPress={() => queryClient.invalidateQueries({ queryKey: ['today-progress'] })}>
                    <Ionicons name="refresh" size={22} color={colors.text.secondary} />
                </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
                {/* Score Card */}
                <View style={{ padding: spacing.xl }}>
                    <LinearGradient
                        colors={[`${scoreColor}20`, `${colors.background.secondary}`]}
                        style={[styles.scoreCard, { borderRadius: borderRadius['2xl'], borderColor: scoreColor, borderWidth: 1 }]}
                    >
                        <View style={styles.scoreRow}>
                            <View style={styles.scoreRing}>
                                <CircularProgress progress={score / 100} size={100} strokeWidth={8} color={scoreColor} trackColor={colors.border.default} />
                                <View style={styles.ringInner}>
                                    <Text style={[typography.display, { color: colors.text.primary, fontSize: 32 }]}>{score}</Text>
                                    <Text style={[typography.caption, { color: colors.text.tertiary, fontSize: 10 }]}>PERF SCORE</Text>
                                </View>
                            </View>
                            <View style={styles.scoreInfo}>
                                <Text style={[typography.heading, { color: colors.text.primary }]}>Great Job!</Text>
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
                            style={[styles.gridCard, { backgroundColor: colors.background.secondary, borderColor: colors.border.default, borderRadius: borderRadius.xl }]}
                            onPress={() => router.push(item.route as any)}
                        >
                            <View style={[styles.iconBox, { backgroundColor: `${item.color}15` }]}>
                                <Ionicons name={item.icon as any} size={24} color={item.color} />
                            </View>
                            <Text style={[typography.subhead, { color: colors.text.primary, marginTop: 12, fontWeight: '700' }]}>{item.label}</Text>
                            <Text style={[typography.caption, { color: item.color, fontWeight: '800', marginTop: 4 }]}>{item.value}</Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Weekly Recap */}
                <View style={{ paddingHorizontal: spacing.xl, marginTop: spacing['2xl'] }}>
                    <Text style={[typography.heading, { color: colors.text.primary, marginBottom: spacing.md }]}>Weekly Recap</Text>
                    <View style={[styles.recapCard, { backgroundColor: colors.background.secondary, borderColor: colors.border.default, borderRadius: borderRadius.xl }]}>
                        <View style={styles.recapRow}>
                            <RecapItem label="Avg Score" value={`${weekly?.avgScore || 0}%`} icon="analytics" color={colors.accent.purple} />
                            <RecapItem label="Streak" value={`${weekly?.streakDays || 0} Days`} icon="flash" color={colors.accent.coral} />
                        </View>
                        <View style={[styles.divider, { backgroundColor: colors.border.default }]} />
                        <View style={styles.recapRow}>
                            <RecapItem label="Water" value={`${(weekly?.avgHydration || 0) / 1000}L`} icon="water" color={colors.accent.cyan} />
                            <RecapItem label="Logged" value={`${weekly?.daysLogged || 0}/7`} icon="checkmark-circle" color={colors.success} />
                        </View>
                    </View>
                </View>

                {/* Daily Checklist */}
                <View style={{ paddingHorizontal: spacing.xl, marginTop: spacing['2xl'] }}>
                    <Text style={[typography.heading, { color: colors.text.primary, marginBottom: spacing.md }]}>Optimizations</Text>
                    <View style={styles.checklist}>
                        <CheckItem label="Protein Target Met" checked={!!progress && (progress.proteinActual ?? 0) >= 140} color={colors.success} />
                        <CheckItem label="Hydration Goal" checked={!!progress && (progress.hydrationActual ?? 0) >= 2500} color={colors.accent.cyan} />
                        <CheckItem label="Light Exposure" checked={progress?.lightExposureCompleted || false} color={colors.accent.amber} />
                    </View>
                </View>
            </ScrollView>
        </View>
    );
}

function RecapItem({ label, value, icon, color }: any) {
    const { colors, typography } = useTheme();
    return (
        <View style={styles.recapItem}>
            <View style={[styles.recapIcon, { backgroundColor: `${color}15` }]}>
                <Ionicons name={icon} size={18} color={color} />
            </View>
            <View style={{ marginLeft: 12 }}>
                <Text style={[typography.caption, { color: colors.text.tertiary }]}>{label}</Text>
                <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: '700' }]}>{value}</Text>
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
    scoreCard: { padding: 24 },
    scoreRow: { flexDirection: 'row', alignItems: 'center' },
    scoreRing: { width: 100, height: 100, alignItems: 'center', justifyContent: 'center' },
    ringInner: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
    scoreInfo: { flex: 1, marginLeft: 24 },
    gridContainer: { flexDirection: 'row', paddingHorizontal: 20, flexWrap: 'wrap', gap: 12 },
    gridCard: { width: (width - 52) / 2, padding: 20, borderWidth: 1 },
    iconBox: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
    recapCard: { padding: 20, borderWidth: 1 },
    recapRow: { flexDirection: 'row', justifyContent: 'space-between' },
    recapItem: { flex: 1, flexDirection: 'row', alignItems: 'center' },
    recapIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
    divider: { height: 1, marginVertical: 16 },
    checklist: { gap: 10 },
    checkRow: { flexDirection: 'row', alignItems: 'center', padding: 16 },
});
