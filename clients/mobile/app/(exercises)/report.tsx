import React, { useMemo } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    Dimensions, Share,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { getWorkout } from '@/api/exercises';
import { format } from 'date-fns';
import { LinearGradient } from 'expo-linear-gradient';
import { shadows } from '@/theme/shadows';
import { withAlpha } from '@/theme/utils';
import { Skeleton, EmptyState } from '@/components/ui';

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
            `💪 ${title} — NightFuel`,
            `⏱ ${workout.duration} min · 🏋️ ${Math.round(workout.totalVolume || 0)} kg volume · ${workout.exercises?.length || 0} exercises`,
        ];
        try {
            await Share.share({ message: lines.join('\n') });
        } catch {
            // User dismissed the share sheet or it's unavailable — nothing to do.
        }
    };

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
            {/* Header */}
            <View style={[styles.header, { paddingTop: insets.top, borderBottomColor: colors.border.default }]}>
                <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Close" onPress={() => router.back()} style={styles.backBtn}>
                    <Ionicons name="close" size={24} color={colors.text.primary} />
                </TouchableOpacity>
                <Text style={[typography.heading, { color: colors.text.primary, fontSize: 18 }]}>Workout Summary</Text>
                <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Share" onPress={handleShare}>
                    <Ionicons name="share-outline" size={24} color={colors.text.primary} />
                </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
                {/* Hero Stats */}
                <View style={[styles.hero, { backgroundColor: colors.background.secondary, borderBottomColor: colors.border.default }]}>
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
                        <View style={styles.statBox}>
                            <Text style={[typography.statMedium, { color: colors.text.primary }]}>{workout.duration}</Text>
                            <Text style={[typography.overline, { color: colors.text.secondary, marginTop: 2 }]}>MINUTES</Text>
                        </View>
                        <View style={[styles.statDivider, { backgroundColor: colors.border.default }]} />
                        <View style={styles.statBox}>
                            <Text style={[typography.statMedium, { color: colors.text.primary }]}>{Math.round(workout.totalVolume || 0)}</Text>
                            <Text style={[typography.overline, { color: colors.text.secondary, marginTop: 2 }]}>VOL (KG)</Text>
                        </View>
                        <View style={[styles.statDivider, { backgroundColor: colors.border.default }]} />
                        <View style={styles.statBox}>
                            <Text style={[typography.statMedium, { color: colors.text.primary }]}>{workout.exercises?.length || 0}</Text>
                            <Text style={[typography.overline, { color: colors.text.secondary, marginTop: 2 }]}>EXERCISES</Text>
                        </View>
                    </View>
                </View>

                {/* Exercise List */}
                <View style={{ padding: spacing.xl }}>
                    <Text style={[typography.heading, { color: colors.text.primary, marginBottom: spacing.lg }]}>Performance Breakdown</Text>

                    {workout.exercises?.map((ex: any, idx: number) => (
                        <View key={idx} style={[styles.exerciseCard, { backgroundColor: colors.background.secondary, borderRadius: borderRadius.xl, borderColor: colors.border.default, borderWidth: 1, borderLeftColor: colors.accent.cyan, borderLeftWidth: 4 }]}>
                            <View style={styles.exHeader}>
                                <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: 'bold' }]}>{ex.name || ex.exerciseName}</Text>
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
                                <View style={styles.logItem}>
                                    <Text style={[typography.caption, { color: colors.text.secondary }]}>1RM</Text>
                                    <Text style={[typography.statTiny, { color: colors.accent.cyan }]}>
                                        {Math.round(ex.weightKg * (1 + ex.reps / 30))}kg
                                    </Text>
                                </View>
                            </View>
                        </View>
                    ))}

                    {/* Activity Heatmap Card */}
                    <View style={[styles.infoCard, { backgroundColor: colors.background.tertiary, borderRadius: borderRadius.xl, borderColor: colors.border.default, borderWidth: 1, marginTop: spacing.xl }]}>
                        <View style={[styles.infoIcon, { backgroundColor: withAlpha(colors.accent.amber, 0.12) }]}>
                            <Ionicons name="flash" size={20} color={colors.accent.amber} />
                        </View>
                        <View style={{ flex: 1, marginLeft: 16 }}>
                            <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: 'bold' }]}>Intensity: {workout.intensity}</Text>
                            <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 2 }]}>
                                You burned approximately {workout.caloriesBurned || workout.duration * 8} kcal during this session.
                            </Text>
                        </View>
                    </View>
                </View>
            </ScrollView>

            <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 20) }]}>
                <TouchableOpacity
                    style={[shadows.glow(colors.accent.coral), { borderRadius: borderRadius.full }]}
                    accessibilityRole="button"
                    accessibilityLabel="Back to training"
                    onPress={() => router.push('/(tabs)/training' as any)}
                    activeOpacity={0.85}
                >
                    <LinearGradient
                        colors={colors.gradients.coral}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={[styles.mainBtn, { borderRadius: borderRadius.full }]}
                    >
                        <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: 'bold' }]}>
                            BACK TO TRAINING
                        </Text>
                    </LinearGradient>
                </TouchableOpacity>
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
    exerciseCard: { padding: 20, marginBottom: 16 },
    exHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    logRow: { flexDirection: 'row', justifyContent: 'space-between' },
    logItem: { alignItems: 'flex-start' },
    infoCard: { flexDirection: 'row', padding: 20, alignItems: 'center' },
    infoIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    footer: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 20 },
    mainBtn: { height: 60, alignItems: 'center', justifyContent: 'center' },
});
