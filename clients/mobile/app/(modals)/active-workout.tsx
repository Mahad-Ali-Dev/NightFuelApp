import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CircularProgress } from '@/components/ui/CircularProgress';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Skeleton, EmptyState } from '@/components/ui';
import { withAlpha } from '@/theme/utils';
import { shadows } from '@/theme/shadows';
import { typography as themeTypography } from '@/theme/typography';
import { useQuery } from '@tanstack/react-query';
import { getActiveSession, SessionExercise } from '@/api/exercises';

type LocalSet = { weight: string; reps: string; done: boolean };
type LocalExercise = { id: string; name: string; sets: number; targetReps: string; loggedSets: LocalSet[] };

function sessionToLocal(se: SessionExercise, idx: number): LocalExercise {
    return {
        id: String(idx),
        name: se.exerciseName,
        sets: se.sets,
        targetReps: String(se.reps),
        loggedSets: Array.from({ length: se.sets }, () => ({
            weight: se.weightKg ? String(se.weightKg) : '',
            reps: '',
            done: false,
        })),
    };
}

export default function ActiveWorkoutScreen() {
    const { colors, typography, spacing } = useTheme();
    const router = useRouter();
    const insets = useSafeAreaInsets();

    const [timer, setTimer] = useState(0);
    const [restRemaining, setRestRemaining] = useState(0);
    const [exercises, setExercises] = useState<LocalExercise[]>([]);

    const { data: session, isLoading: sessionLoading, isError: sessionError, refetch: refetchSession } = useQuery({
        queryKey: ['active-session'],
        queryFn: getActiveSession,
    });

    // Seed exercises from active session when it loads
    useEffect(() => {
        if (session?.logs && session.logs.length > 0) {
            setExercises(session.logs.map(sessionToLocal));
        }
    }, [session]);

    // Global elapsed timer
    useEffect(() => {
        const interval = setInterval(() => {
            setTimer(t => t + 1);
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    // Rest timer
    useEffect(() => {
        if (restRemaining > 0) {
            const interval = setInterval(() => {
                setRestRemaining(r => r - 1);
            }, 1000);
            return () => clearInterval(interval);
        }
    }, [restRemaining]);

    const toggleSet = (exIndex: number, setIndex: number) => {
        const newEx = [...exercises];
        const targetSet = newEx[exIndex]?.loggedSets?.[setIndex];
        if (!targetSet) return;
        targetSet.done = !targetSet.done;
        setExercises(newEx);

        if (targetSet.done) {
            // Start 90s rest timer on set completion
            setRestRemaining(90);
        } else {
            setRestRemaining(0);
        }
    };

    const updateSet = (exIndex: number, setIndex: number, field: 'weight' | 'reps', val: string) => {
        const newEx = [...exercises];
        const targetSet = newEx[exIndex]?.loggedSets?.[setIndex];
        if (!targetSet) return;
        targetSet[field] = val;
        setExercises(newEx);
    };

    const formatTime = (secs: number) => {
        const m = Math.floor(secs / 60).toString().padStart(2, '0');
        const s = (secs % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    };

    return (
        <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background.primary }]}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.border.default }]}>
                <View>
                    <Text style={[typography.h2, { color: colors.text.primary }]}>Night Shift Prep</Text>
                    <View style={styles.headerMeta}>
                        <Text style={[typography.statTiny, { color: colors.accent.coral }]}>{formatTime(timer)}</Text>
                        <Text style={[typography.caption, { color: colors.text.secondary }]}>• Hypertrophy</Text>
                    </View>
                </View>
                <Button title="Finish" onPress={() => router.back()} size="sm" style={{ paddingHorizontal: 16 }} />
            </View>

            {/* Rest Timer Overlay */}
            {restRemaining > 0 && (
                <View style={[styles.restBanner, { backgroundColor: withAlpha(colors.accent.cyan, 0.1), borderBottomColor: withAlpha(colors.accent.cyan, 0.25) }, shadows.glow(colors.accent.cyan)]}>
                    <Ionicons name="timer" size={24} color={colors.accent.cyan} />
                    <Text style={[typography.statTiny, { color: colors.accent.cyan, marginLeft: 12, flex: 1 }]}>
                        Resting: {formatTime(restRemaining)}
                    </Text>
                    <TouchableOpacity activeOpacity={0.85} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Close" onPress={() => setRestRemaining(0)} style={{ padding: 8 }}>
                        <Ionicons name="close" size={20} color={colors.accent.cyan} />
                    </TouchableOpacity>
                </View>
            )}

            <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 100 }}>
                {sessionLoading && exercises.length === 0 && (
                    Array.from({ length: 3 }).map((_, i) => (
                        <Card key={`ex-skeleton-${i}`} variant="glass" style={styles.exerciseCard}>
                            <View style={styles.exHeader}>
                                <Skeleton width="55%" height={20} />
                                <Skeleton width={20} height={20} radius={10} />
                            </View>
                            <Skeleton width="35%" height={12} style={{ marginTop: spacing.sm, marginBottom: spacing.lg }} />
                            <Skeleton width="100%" height={36} style={{ marginBottom: spacing.sm }} />
                            <Skeleton width="100%" height={36} />
                        </Card>
                    ))
                )}

                {sessionError && exercises.length === 0 && (
                    <EmptyState
                        icon="cloud-offline-outline"
                        title="Couldn't load workout"
                        subtitle="We couldn't reach your active session. Check your connection and try again."
                        actionLabel="Retry"
                        onAction={() => refetchSession()}
                    />
                )}

                {!sessionLoading && !sessionError && exercises.length === 0 && (
                    <EmptyState
                        icon="barbell-outline"
                        title="No exercises yet"
                        subtitle="Add your first exercise to start logging this workout."
                    />
                )}

                {exercises.map((ex, exIndex) => (
                    <Card key={ex.id} variant="glass" style={styles.exerciseCard}>
                        <View style={styles.exHeader}>
                            <Text style={[typography.h3, { color: colors.text.primary }]}>{ex.name}</Text>
                            <TouchableOpacity activeOpacity={0.85} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="More options">
                                <Ionicons name="ellipsis-horizontal" size={20} color={colors.text.secondary} />
                            </TouchableOpacity>
                        </View>
                        <Text style={[typography.caption, { color: colors.text.secondary, marginBottom: 16 }]}>
                            Target: {ex.targetReps} reps
                        </Text>

                        <View style={styles.setHeaderRow}>
                            <Text style={[typography.caption, { color: colors.text.secondary, width: 32 }]}>SET</Text>
                            <Text style={[typography.caption, { color: colors.text.secondary, flex: 1, textAlign: 'center' }]}>KG</Text>
                            <Text style={[typography.caption, { color: colors.text.secondary, flex: 1, textAlign: 'center' }]}>REPS</Text>
                            <View style={{ width: 40 }} />
                        </View>

                        {ex.loggedSets.map((s, sIndex) => {
                            const prevSet = sIndex === 0 ? '-' : '135x10'; // Mock prev
                            return (
                                <View key={sIndex} style={[styles.setRow, s.done && { backgroundColor: withAlpha(colors.accent.cyan, 0.1) }]}>
                                    <Text style={[typography.subhead, { color: colors.text.secondary, width: 32 }]}>{sIndex + 1}</Text>

                                    <View style={styles.inputBox}>
                                        <TextInput
                                            style={[styles.numericInput, { color: colors.text.primary, borderBottomColor: colors.border.default }]}
                                            keyboardType="numeric"
                                            value={s.weight}
                                            onChangeText={(val) => updateSet(exIndex, sIndex, 'weight', val)}
                                            placeholder={sIndex === 0 ? "135" : ex.loggedSets[sIndex - 1]?.weight || "-"}
                                            placeholderTextColor={colors.text.tertiary}
                                        />
                                    </View>

                                    <View style={styles.inputBox}>
                                        <TextInput
                                            style={[styles.numericInput, { color: colors.text.primary, borderBottomColor: colors.border.default }]}
                                            keyboardType="numeric"
                                            value={s.reps}
                                            onChangeText={(val) => updateSet(exIndex, sIndex, 'reps', val)}
                                            placeholder={ex.targetReps.split('-')[0]}
                                            placeholderTextColor={colors.text.tertiary}
                                        />
                                    </View>

                                    <TouchableOpacity activeOpacity={0.85} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Complete set" accessibilityState={{ selected: s.done }}
                                        onPress={() => toggleSet(exIndex, sIndex)}
                                        style={[
                                            styles.checkBtn,
                                            s.done ? { backgroundColor: colors.accent.cyan } : { backgroundColor: colors.background.tertiary },
                                            s.done && shadows.glow(colors.accent.cyan),
                                        ]}
                                    >
                                        <Ionicons name="checkmark" size={20} color={s.done ? colors.background.primary : colors.text.secondary} />
                                    </TouchableOpacity>
                                </View>
                            );
                        })}

                        <TouchableOpacity activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Add set" style={styles.addSetBtn}>
                            <Text style={[typography.subhead, { color: colors.text.secondary, textAlign: 'center' }]}>+ Add Set</Text>
                        </TouchableOpacity>
                    </Card>
                ))}

                <Button
                    title="Add Exercise"
                    variant="outline"
                    icon={<Ionicons name="add" size={20} color={colors.text.primary} />}
                    onPress={() => { }}
                    style={{ marginTop: 8 }}
                />
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: 'transparent',
    },
    headerMeta: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 2,
    },
    restBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: 'transparent',
    },
    exerciseCard: {
        padding: 16,
        marginBottom: 24,
    },
    exHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    setHeaderRow: {
        flexDirection: 'row',
        marginBottom: 8,
        paddingHorizontal: 8,
    },
    setRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        paddingHorizontal: 8,
        borderRadius: 8,
        marginBottom: 4,
    },
    inputBox: {
        flex: 1,
        alignItems: 'center',
    },
    numericInput: {
        fontFamily: themeTypography.statSmall.fontFamily,
        fontSize: 18,
        minWidth: 60,
        textAlign: 'center',
        paddingVertical: 4,
        borderBottomWidth: 1,
    },
    checkBtn: {
        width: 36,
        height: 36,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: 8,
    },
    addSetBtn: {
        marginTop: 12,
        paddingVertical: 12,
    }
});
