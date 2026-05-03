import React, { useMemo } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    ActivityIndicator, Dimensions,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { getWorkout } from '@/api/exercises';
import { format } from 'date-fns';
import { LinearGradient } from 'expo-linear-gradient';

const { width } = Dimensions.get('window');

export default function WorkoutReportScreen() {
    const { colors, typography, spacing, borderRadius } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const { workoutId } = useLocalSearchParams<{ workoutId: string }>();

    const { data: workout, isLoading } = useQuery({
        queryKey: ['workout-report', workoutId],
        queryFn: () => getWorkout(workoutId!),
        enabled: !!workoutId,
    });

    if (isLoading) {
        return (
            <View style={[styles.container, { backgroundColor: colors.background.primary, justifyContent: 'center' }]}>
                <ActivityIndicator size="large" color={colors.accent.coral} />
            </View>
        );
    }

    if (!workout) {
        return (
            <View style={[styles.container, { backgroundColor: colors.background.primary, justifyContent: 'center', alignItems: 'center' }]}>
                <Ionicons name="alert-circle" size={48} color={colors.text.tertiary} />
                <Text style={[typography.body, { color: colors.text.secondary, marginTop: 10 }]}>Workout not found</Text>
            </View>
        );
    }

    return (
        <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
            {/* Header */}
            <View style={[styles.header, { paddingTop: insets.top, borderBottomColor: colors.border.default }]}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <Ionicons name="close" size={24} color={colors.text.primary} />
                </TouchableOpacity>
                <Text style={[typography.heading, { color: colors.text.primary, fontSize: 18 }]}>Workout Summary</Text>
                <TouchableOpacity onPress={() => { }}>
                    <Ionicons name="share-outline" size={24} color={colors.text.primary} />
                </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
                {/* Hero Stats */}
                <View style={[styles.hero, { backgroundColor: colors.background.secondary }]}>
                    <Text style={[typography.caption, { color: colors.accent.coral, fontWeight: 'bold', marginBottom: 4 }]}>
                        {format(new Date(workout.completedAt || workout.startedAt), 'EEEE, MMMM do')}
                    </Text>
                    <Text style={[typography.display, { color: colors.text.primary, fontSize: 32, fontWeight: '900' }]}>
                        {workout.title || workout.type || 'Great Session!'}
                    </Text>

                    <View style={styles.statsRow}>
                        <View style={styles.statBox}>
                            <Text style={[typography.display, { color: colors.text.primary, fontSize: 24 }]}>{workout.duration}</Text>
                            <Text style={[typography.caption, { color: colors.text.tertiary }]}>MINUTES</Text>
                        </View>
                        <View style={[styles.statDivider, { backgroundColor: colors.border.default }]} />
                        <View style={styles.statBox}>
                            <Text style={[typography.display, { color: colors.text.primary, fontSize: 24 }]}>{Math.round(workout.totalVolume || 0)}</Text>
                            <Text style={[typography.caption, { color: colors.text.tertiary }]}>VOL (KG)</Text>
                        </View>
                        <View style={[styles.statDivider, { backgroundColor: colors.border.default }]} />
                        <View style={styles.statBox}>
                            <Text style={[typography.display, { color: colors.text.primary, fontSize: 24 }]}>{workout.exercises?.length || 0}</Text>
                            <Text style={[typography.caption, { color: colors.text.tertiary }]}>EXERCISES</Text>
                        </View>
                    </View>
                </View>

                {/* Exercise List */}
                <View style={{ padding: spacing.xl }}>
                    <Text style={[typography.heading, { color: colors.text.primary, marginBottom: spacing.lg }]}>Performance Breakdown</Text>

                    {workout.exercises?.map((ex: any, idx: number) => (
                        <View key={idx} style={[styles.exerciseCard, { backgroundColor: colors.background.secondary, borderRadius: borderRadius.xl, borderLeftColor: colors.accent.cyan, borderLeftWidth: 4 }]}>
                            <View style={styles.exHeader}>
                                <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: 'bold' }]}>{ex.name || ex.exerciseName}</Text>
                                <Ionicons name="checkmark-circle" size={20} color={colors.accent.emerald} />
                            </View>

                            <View style={styles.logRow}>
                                <View style={styles.logItem}>
                                    <Text style={[typography.caption, { color: colors.text.tertiary }]}>SETS</Text>
                                    <Text style={[typography.body, { color: colors.text.primary, fontWeight: 'bold' }]}>{ex.sets}</Text>
                                </View>
                                <View style={styles.logItem}>
                                    <Text style={[typography.caption, { color: colors.text.tertiary }]}>REPS</Text>
                                    <Text style={[typography.body, { color: colors.text.primary, fontWeight: 'bold' }]}>{ex.reps}</Text>
                                </View>
                                <View style={styles.logItem}>
                                    <Text style={[typography.caption, { color: colors.text.tertiary }]}>WEIGHT</Text>
                                    <Text style={[typography.body, { color: colors.text.primary, fontWeight: 'bold' }]}>{ex.weightKg}kg</Text>
                                </View>
                                <View style={styles.logItem}>
                                    <Text style={[typography.caption, { color: colors.text.tertiary }]}>1RM</Text>
                                    <Text style={[typography.body, { color: colors.accent.cyan, fontWeight: 'bold' }]}>
                                        {Math.round(ex.weightKg * (1 + ex.reps / 30))}kg
                                    </Text>
                                </View>
                            </View>
                        </View>
                    ))}

                    {/* Activity Heatmap Card */}
                    <View style={[styles.infoCard, { backgroundColor: colors.background.tertiary, borderRadius: borderRadius.xl, marginTop: spacing.xl }]}>
                        <View style={styles.infoIcon}>
                            <Ionicons name="flash" size={20} color={colors.accent.amber} />
                        </View>
                        <View style={{ flex: 1, marginLeft: 16 }}>
                            <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: 'bold' }]}>Intensity: {workout.intensity}</Text>
                            <Text style={[typography.caption, { color: colors.text.tertiary, marginTop: 2 }]}>
                                You burned approximately {workout.caloriesBurned || workout.duration * 8} kcal during this session.
                            </Text>
                        </View>
                    </View>
                </View>
            </ScrollView>

            <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 20) }]}>
                <TouchableOpacity
                    style={[styles.mainBtn, { backgroundColor: colors.accent.coral, borderRadius: 30 }]}
                    onPress={() => router.push('/(tabs)/training' as any)}
                >
                    <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: 'bold' }]}>
                        BACK TO TRAINING
                    </Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1 },
    backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    hero: { padding: 30, paddingTop: 40, alignItems: 'center' },
    statsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 30, width: '100%', gap: 20 },
    statBox: { alignItems: 'center', flex: 1 },
    statDivider: { width: 1, height: 30 },
    exerciseCard: { padding: 20, marginBottom: 16 },
    exHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    logRow: { flexDirection: 'row', justifyContent: 'space-between' },
    logItem: { alignItems: 'flex-start' },
    infoCard: { flexDirection: 'row', padding: 20, alignItems: 'center' },
    infoIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,191,0,0.1)', alignItems: 'center', justifyContent: 'center' },
    footer: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 20 },
    mainBtn: { height: 60, alignItems: 'center', justifyContent: 'center' },
});
