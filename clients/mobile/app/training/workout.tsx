import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    TextInput, ActivityIndicator, Alert, Modal, Dimensions,
    KeyboardAvoidingView, Platform
} from 'react-native';

import { useTheme } from '@/theme';
import { Card } from '@/components/ui/Card';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getActiveSession, logSessionExercise, endSession, startSession } from '@/api/exercises';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BlurView } from 'expo-blur';
import ConfettiCannon from 'react-native-confetti-cannon';

// ─── Constants ──────────────────────────────────────────────────────────────

const STORAGE_KEY_STATE = 'nf_active_workout_state';
const PERSIST_INTERVAL_MS = 5000;
const DEFAULT_REST_SECONDS = 90;

// ─── Types ──────────────────────────────────────────────────────────────────

interface SetData {
    kg: number;
    reps: number;
    completed: boolean;
}

interface ExerciseState {
    name: string;
    muscleGroup: string;
    sets: SetData[];
    restSeconds: number;
}

interface ActiveWorkoutState {
    exercises: ExerciseState[];
    elapsedSeconds: number;
    startedAt: number;
    sessionId: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatTime(totalSeconds: number): string {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export default function ActiveWorkoutScreen() {
    const { colors, typography, spacing, borderRadius } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const queryClient = useQueryClient();
    const { sessionId: paramSessionId, exercise: paramExercise } = useLocalSearchParams<{ sessionId: string, exercise?: string }>();

    // ── Workout Data ────────────────────────────────────────────────────────
    const [exerciseStates, setExerciseStates] = useState<ExerciseState[]>([]);
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const [startedAt, setStartedAt] = useState<number>(Date.now());
    const [sessionId, setSessionId] = useState<string>(paramSessionId || '');

    // ── UI State ────────────────────────────────────────────────────────────
    const [expandedIndex, setExpandedIndex] = useState<number>(0);
    const [showRestTimer, setShowRestTimer] = useState(false);
    const [showConfetti, setShowConfetti] = useState(false);
    const [restSeconds, setRestSeconds] = useState(0);
    const [restExerciseIdx, setRestExerciseIdx] = useState(-1);
    const [isInitialized, setIsInitialized] = useState(false);
    const [isFinished, setIsFinished] = useState(false);
    const [startupCountdown, setStartupCountdown] = useState<number | null>(null);

    // ── Refs ────────────────────────────────────────────────────────────────
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const restTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const persistenceRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // ── Fetch Session ───────────────────────────────────────────────────────
    const { data: session, isLoading: isSessionLoading } = useQuery({
        queryKey: ['active-session', sessionId],
        queryFn: getActiveSession,
        enabled: !!sessionId,
    });

    // ── Initialize ──────────────────────────────────────────────────────────
    useEffect(() => {
        const init = async () => {
            let restoredState: ActiveWorkoutState | null = null;
            try {
                const saved = await AsyncStorage.getItem(STORAGE_KEY_STATE);
                if (saved) {
                    const parsed = JSON.parse(saved) as ActiveWorkoutState;
                    // Only restore if it's the same session or recent
                    if (parsed.sessionId === sessionId || (Date.now() - parsed.startedAt < 8 * 3600 * 1000)) {
                        restoredState = parsed;
                    }
                }
            } catch (e) {
                console.error('Failed to restore state:', e);
            }

            if (restoredState) {
                // If we navigated here with a new exercise, add it if not exists.
                if (paramExercise && typeof paramExercise === 'string') {
                    const exists = restoredState.exercises.find(e => e.name === paramExercise);
                    if (!exists) {
                        restoredState.exercises.push({
                            name: paramExercise,
                            muscleGroup: 'Other',
                            sets: [
                                { kg: 0, reps: 10, completed: false },
                                { kg: 0, reps: 10, completed: false },
                                { kg: 0, reps: 10, completed: false }
                            ],
                            restSeconds: DEFAULT_REST_SECONDS,
                        });
                    }
                }
                setExerciseStates(restoredState.exercises);
                const resumedElapsed = Math.floor((Date.now() - restoredState.startedAt) / 1000);
                setElapsedSeconds(resumedElapsed);
                setStartedAt(restoredState.startedAt);

                let resumedSessionId = restoredState.sessionId || session?.id || '';
                if (!resumedSessionId) {
                    try {
                        const newSess = await startSession();
                        resumedSessionId = newSess.id;
                    } catch (e) {
                        console.warn('Failed to start session', e);
                    }
                }

                setSessionId(resumedSessionId);
                setIsInitialized(true);
                return;
            }

            // Fallback: Initial state from session
            let initialExercises: ExerciseState[] = [];
            if (session && session.logs && Array.isArray(session.logs) && session.logs.length > 0) {
                initialExercises = session.logs.map((ex: any) => ({
                    name: ex.exerciseName || ex.name,
                    muscleGroup: ex.muscleGroup || 'Other',
                    sets: Array.from({ length: ex.sets || 3 }, () => ({
                        kg: ex.weightKg || 0,
                        reps: ex.reps || 10,
                        completed: false,
                    })),
                    restSeconds: DEFAULT_REST_SECONDS,
                }));
            }

            if (paramExercise && typeof paramExercise === 'string') {
                const exists = initialExercises.find(e => e.name === paramExercise);
                if (!exists) {
                    initialExercises.push({
                        name: paramExercise,
                        muscleGroup: 'Other',
                        sets: [
                            { kg: 0, reps: 10, completed: false },
                            { kg: 0, reps: 10, completed: false },
                            { kg: 0, reps: 10, completed: false }
                        ],
                        restSeconds: DEFAULT_REST_SECONDS,
                    });
                }
            }

            setExerciseStates(initialExercises);

            let newSessionId = session?.id || sessionId || '';
            if (!newSessionId) {
                try {
                    const newSess = await startSession();
                    newSessionId = newSess.id;
                } catch (e) {
                    console.warn('Failed to start session', e);
                }
            }

            setSessionId(newSessionId);
            setStartedAt(Date.now());
            setIsInitialized(true);

            // Trigger countdown — this code path is only reached for brand-new sessions
            // (restored sessions return early above), so always show the countdown.
            setStartupCountdown(3);
        };

        if (session || !isSessionLoading) {
            init();
        }
    }, [session, isSessionLoading, paramExercise, sessionId]);

    // ── Timers ──────────────────────────────────────────────────────────────
    useEffect(() => {
        timerRef.current = setInterval(() => {
            setStartupCountdown(prevCd => {
                if (prevCd !== null && prevCd > 0) {
                    return prevCd - 1;
                }

                // If countdown is finished or not active, tick the main timer
                setElapsedSeconds(prev => prev + 1);
                return prevCd === 0 ? null : prevCd; // Clear it once 0
            });
        }, 1000);

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, []);

    // ── Persistence ─────────────────────────────────────────────────────────
    useEffect(() => {
        if (!isInitialized || isFinished) return;

        persistenceRef.current = setInterval(async () => {
            const state: ActiveWorkoutState = {
                exercises: exerciseStates,
                elapsedSeconds,
                startedAt,
                sessionId,
            };
            try {
                await AsyncStorage.setItem(STORAGE_KEY_STATE, JSON.stringify(state));
            } catch (e) {
                // Ignore
            }
        }, PERSIST_INTERVAL_MS);

        return () => {
            if (persistenceRef.current) clearInterval(persistenceRef.current);
        };
    }, [isInitialized, isFinished, exerciseStates, elapsedSeconds, startedAt, sessionId]);

    // ── Rest Timer Logic ────────────────────────────────────────────────────
    useEffect(() => {
        if (showRestTimer && restSeconds > 0) {
            restTimerRef.current = setInterval(() => {
                setRestSeconds(prev => {
                    if (prev <= 1) {
                        setShowRestTimer(false);
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        } else {
            if (restTimerRef.current) clearInterval(restTimerRef.current);
        }
        return () => {
            if (restTimerRef.current) clearInterval(restTimerRef.current);
        };
    }, [showRestTimer, restSeconds]);

    // ── Handlers ────────────────────────────────────────────────────────────

    const updateSet = (eIdx: number, sIdx: number, field: keyof SetData, value: any) => {
        setExerciseStates(prev => {
            const next = [...prev];
            if (!next[eIdx]?.sets?.[sIdx]) return prev;
            next[eIdx].sets[sIdx] = { ...next[eIdx].sets[sIdx], [field]: value };
            return next;
        });
    };

    const toggleSetComplete = (eIdx: number, sIdx: number) => {
        setExerciseStates(prev => {
            const next = [...prev];
            if (!next[eIdx]?.sets?.[sIdx]) return prev;
            const isCompleting = !next[eIdx].sets[sIdx].completed;
            next[eIdx].sets[sIdx].completed = isCompleting;

            if (isCompleting) {
                // Trigger rest timer
                setRestSeconds(next[eIdx].restSeconds);
                setRestExerciseIdx(eIdx);
                setShowRestTimer(true);
            }

            return next;
        });
    };

    const addSet = (eIdx: number) => {
        setExerciseStates(prev => {
            const next = [...prev];
            const exercise = next[eIdx];
            if (!exercise) return prev;
            const lastSet = exercise.sets[exercise.sets.length - 1];
            exercise.sets.push({
                kg: lastSet?.kg || 0,
                reps: lastSet?.reps || 10,
                completed: false,
            });
            return next;
        });
    };

    const removeSet = (eIdx: number, sIdx: number) => {
        setExerciseStates(prev => {
            const next = prev.map(ex => ({ ...ex, sets: [...ex.sets] })); // Deep clone to be safe
            const exercise = next[eIdx];
            if (!exercise) return prev;
            if (exercise.sets.length > 1) {
                exercise.sets.splice(sIdx, 1);
            }
            return next;
        });
    };

    const handleEnd = async () => {
        // Immediately mark as finished to stop persistence & timers
        setIsFinished(true);

        // Stop all intervals immediately
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
        if (restTimerRef.current) { clearInterval(restTimerRef.current); restTimerRef.current = null; }
        if (persistenceRef.current) { clearInterval(persistenceRef.current); persistenceRef.current = null; }

        // Capture the final elapsed time before any async work
        const finalElapsed = elapsedSeconds;

        setShowConfetti(true);

        // Clear persisted state FIRST (before any async calls)
        await AsyncStorage.removeItem(STORAGE_KEY_STATE);

        try {
            if (!sessionId) {
                setTimeout(() => {
                    router.replace({ pathname: '/training/complete', params: { elapsed: String(finalElapsed) } });
                }, 1000);
                return;
            }

            // Parallel log all completed exercises with individual catch blocks
            const logPromises = exerciseStates.map(async (ex) => {
                const completedSets = ex.sets.filter(s => s.completed);
                if (completedSets.length === 0) return Promise.resolve();

                try {
                    await logSessionExercise(sessionId, {
                        exerciseName: ex.name,
                        sets: completedSets.length,
                        reps: Math.round(completedSets.reduce((a,s)=>a+s.reps,0)/completedSets.length),
                        weightKg: Math.max(...completedSets.map(s=>s.kg)),
                        durationSecs: 0
                    });
                } catch (e) {
                    console.warn(`Failed to log exercise ${ex.name}:`, e);
                }
            });

            await Promise.all(logPromises);

            try {
                await endSession(sessionId);
            } catch (e) {
                console.error('Failed to end workout session on backend:', e);
            }

            queryClient.invalidateQueries({ queryKey: ['active-session'] });
            queryClient.invalidateQueries({ queryKey: ['workout-active-session'] });
            queryClient.invalidateQueries({ queryKey: ['exercises', 'history'] });

            // Let the confetti run for 2.5 seconds before navigating
            setTimeout(() => {
                router.replace({ pathname: '/training/complete', params: { elapsed: String(finalElapsed) } });
            }, 2500);

        } catch (e) {
            console.error('Unexpected error finishing workout:', e);
            Alert.alert('Error', 'Failed to save workout. Please try again.');
            setShowConfetti(false);
            setIsFinished(false);
        }
    };

    // ── UI Components ───────────────────────────────────────────────────────

    const renderHeader = () => (
        <View style={[styles.header, { borderBottomColor: colors.border.default }]}>
            <View>
                <Text style={[typography.caption, { color: colors.text.secondary, textTransform: 'uppercase', letterSpacing: 1 }]}>
                    Active Workout
                </Text>
                <Text style={[typography.display, { color: colors.accent.cyan, fontSize: 32, marginTop: -4 }]}>
                    {formatTime(elapsedSeconds)}
                </Text>
            </View>
            <TouchableOpacity
                style={[styles.finishBtn, { backgroundColor: colors.accent.coral }]}
                onPress={handleEnd}
            >
                <Text style={[typography.subhead, { color: '#FFF', fontWeight: 'bold' }]}>FINISH</Text>
            </TouchableOpacity>
        </View>
    );

    if (!isInitialized) {
        return (
            <View style={[styles.container, { backgroundColor: colors.background.primary, justifyContent: 'center' }]}>
                <ActivityIndicator size="large" color={colors.accent.coral} />
            </View>
        );
    }

    const isStarting = startupCountdown !== null && startupCountdown > 0;

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={[styles.container, { backgroundColor: colors.background.primary }]}
        >
            <View style={{ paddingTop: insets.top, flex: 1 }}>
                {renderHeader()}

                <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}>
                    {exerciseStates.map((ex, eIdx) => {
                        const isExpanded = expandedIndex === eIdx;
                        const completedCount = ex.sets.filter(s => s.completed).length;

                        return (
                            <Card key={eIdx} style={[styles.exCard, { backgroundColor: colors.background.secondary, borderColor: isExpanded ? colors.accent.coral : colors.border.default, marginBottom: spacing.md }]}>
                                <TouchableOpacity
                                    style={styles.exHeader}
                                    onPress={() => setExpandedIndex(isExpanded ? -1 : eIdx)}
                                    activeOpacity={0.7}
                                >
                                    <View style={styles.exTitleRow}>
                                        <View style={[styles.iconBox, { backgroundColor: `${colors.accent.coral}15` }]}>
                                            <Ionicons name="fitness" size={20} color={colors.accent.coral} />
                                        </View>
                                        <View style={{ flex: 1, marginLeft: spacing.md }}>
                                            <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: 'bold' }]}>{ex.name}</Text>
                                            <Text style={[typography.caption, { color: colors.text.secondary }]}>
                                                {completedCount}/{ex.sets.length} Sets Done · {ex.muscleGroup}
                                            </Text>
                                        </View>
                                        <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={20} color={colors.text.tertiary} />
                                    </View>
                                </TouchableOpacity>

                                {isExpanded && (
                                    <View style={styles.exContent}>
                                        <View style={styles.rowLabel}>
                                            <Text style={[styles.label, { color: colors.text.tertiary, width: 40 }]}>SET</Text>
                                            <Text style={[styles.label, { color: colors.text.tertiary, flex: 1, textAlign: 'center' }]}>KG</Text>
                                            <Text style={[styles.label, { color: colors.text.tertiary, flex: 1, textAlign: 'center' }]}>REPS</Text>
                                            <View style={{ width: 40 }} />
                                        </View>

                                        {ex.sets.map((set, sIdx) => (
                                            <View
                                                key={sIdx}
                                                style={[styles.setRow, set.completed && { opacity: 0.6 }]}
                                            >
                                                <View style={[styles.setNum, { backgroundColor: colors.background.tertiary }]}>
                                                    <Text style={[typography.caption, { color: colors.text.secondary, fontWeight: 'bold' }]}>{sIdx + 1}</Text>
                                                </View>

                                                <TextInput
                                                    style={[styles.setInput, { color: colors.text.primary, backgroundColor: colors.background.primary, borderColor: colors.border.default }]}
                                                    keyboardType="numeric"
                                                    value={set.kg.toString()}
                                                    onChangeText={(v) => updateSet(eIdx, sIdx, 'kg', parseFloat(v) || 0)}
                                                    editable={!set.completed}
                                                />

                                                <TextInput
                                                    style={[styles.setInput, { color: colors.text.primary, backgroundColor: colors.background.primary, borderColor: colors.border.default }]}
                                                    keyboardType="numeric"
                                                    value={set.reps.toString()}
                                                    onChangeText={(v) => updateSet(eIdx, sIdx, 'reps', parseInt(v) || 0)}
                                                    editable={!set.completed}
                                                />

                                                <TouchableOpacity
                                                    style={[styles.checkBtn, { backgroundColor: set.completed ? colors.accent.emerald : colors.background.tertiary }]}
                                                    onPress={() => toggleSetComplete(eIdx, sIdx)}
                                                >
                                                    <Ionicons name="checkmark" size={18} color={set.completed ? '#FFF' : colors.text.tertiary} />
                                                </TouchableOpacity>
                                            </View>
                                        ))}

                                        <TouchableOpacity
                                            style={[styles.addSetBtn, { borderColor: colors.border.default }]}
                                            onPress={() => addSet(eIdx)}
                                        >
                                            <Ionicons name="add" size={16} color={colors.text.secondary} />
                                            <Text style={[typography.caption, { color: colors.text.secondary, marginLeft: 4, fontWeight: '600' }]}>ADD SET</Text>
                                        </TouchableOpacity>
                                    </View>
                                )}
                            </Card>
                        );
                    })}

                    <TouchableOpacity
                        style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'center',
                            paddingVertical: 16,
                            borderWidth: 1,
                            borderColor: colors.accent.cyan,
                            borderRadius: borderRadius.xl,
                            marginTop: spacing.lg,
                            borderStyle: 'dashed'
                        }}
                        onPress={() => router.push('/(exercises)')}
                    >
                        <Ionicons name="search" size={20} color={colors.accent.cyan} />
                        <Text style={[typography.subhead, { color: colors.accent.cyan, marginLeft: 8, fontWeight: 'bold' }]}>
                            BROWSE EXERCISES
                        </Text>
                    </TouchableOpacity>
                </ScrollView>
            </View>

            {/* Initial Startup Countdown Overlay */}
            {isStarting && (
                <View style={[StyleSheet.absoluteFillObject, { zIndex: 1000 }]}>
                    <BlurView intensity={80} tint="dark" style={[StyleSheet.absoluteFillObject, { justifyContent: 'center', alignItems: 'center' }]}>
                        <Text style={[typography.display, { fontSize: 120, color: colors.accent.coral, textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 4 }, textShadowRadius: 10 }]}>
                            {startupCountdown}
                        </Text>
                        <Text style={[typography.heading, { color: '#FFF', marginTop: 20, letterSpacing: 2 }]}>
                            GET READY!
                        </Text>
                    </BlurView>
                </View>
            )}

            {/* Rest Timer Modal */}
            <Modal transparent visible={showRestTimer && !isStarting} animationType="fade">
                <View style={styles.modalOverlay}>
                    <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
                    <View style={[styles.modalContent, { backgroundColor: colors.background.secondary, borderRadius: borderRadius['2xl'] }]}>
                        <Text style={[typography.caption, { color: colors.text.secondary, textTransform: 'uppercase', letterSpacing: 2 }]}>Rest Timer</Text>
                        <Text style={[typography.display, { color: colors.accent.coral, fontSize: 80, marginVertical: 20 }]}>
                            {restSeconds}
                        </Text>
                        <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: 'bold' }]}>
                            Up next: {exerciseStates[restExerciseIdx]?.name}
                        </Text>

                        <View style={styles.modalActions}>
                            <TouchableOpacity
                                style={[styles.modalBtn, { backgroundColor: colors.background.tertiary }]}
                                onPress={() => setRestSeconds(prev => prev + 15)}
                            >
                                <Text style={[typography.body, { color: colors.text.primary, fontWeight: 'bold' }]}>+15s</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.modalBtn, { backgroundColor: colors.accent.coral }]}
                                onPress={() => setShowRestTimer(false)}
                            >
                                <Text style={[typography.body, { color: '#FFF', fontWeight: 'bold' }]}>SKIP</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Confetti Animation */}
            {showConfetti && (
                <View style={StyleSheet.absoluteFill} pointerEvents="none">
                    <ConfettiCannon
                        count={200}
                        origin={{ x: Dimensions.get('window').width / 2, y: -20 }}
                        fallSpeed={3000}
                        fadeOut={true}
                    />
                </View>
            )}
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1 },
    finishBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12 },
    exCard: { borderWidth: 1, overflow: 'hidden' },
    exHeader: { padding: 16 },
    exTitleRow: { flexDirection: 'row', alignItems: 'center' },
    iconBox: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    exContent: { paddingHorizontal: 16, paddingBottom: 16 },
    rowLabel: { flexDirection: 'row', marginBottom: 8, paddingHorizontal: 4 },
    label: { fontSize: 10, fontWeight: 'bold', letterSpacing: 1 },
    setRow: { flexDirection: 'row', gap: 12, alignItems: 'center', marginBottom: 10 },
    setNum: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    setInput: { flex: 1, height: 40, borderRadius: 10, borderWidth: 1, textAlign: 'center', fontWeight: 'bold', fontSize: 16 },
    checkBtn: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    addSetBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 8, borderStyle: 'dashed' as any, borderWidth: 1, borderRadius: 10, marginTop: 4 },
    modalOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
    modalContent: { width: '100%', padding: 30, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.5, shadowRadius: 20, elevation: 10 },
    modalActions: { flexDirection: 'row', gap: 16, marginTop: 20 },
    modalBtn: { flex: 1, height: 50, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }
});
