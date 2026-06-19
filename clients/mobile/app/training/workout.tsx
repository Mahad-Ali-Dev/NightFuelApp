import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    TextInput, Alert, Modal, Dimensions,
    KeyboardAvoidingView, Platform
} from 'react-native';

import { useTheme } from '@/theme';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { CircularProgress } from '@/components/ui/CircularProgress';
import { Skeleton, EmptyState } from '@/components/ui';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getActiveSession, logSessionExercise, endSession, startSession, getRoutines, getById } from '@/api/exercises';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeBlurView } from '@/components/SafeBlurView';
import { StatusBar } from 'expo-status-bar';
import { Image } from 'expo-image';
import ConfettiCannon from 'react-native-confetti-cannon';
import { withAlpha } from '@/theme/utils';
import { typography as typo } from '@/theme/typography';
import { getCuratedDemo, getCuratedDemoFrames } from '@/constants/curatedDemos';

// Bundled neutral placeholder shown when a resolved exercise has no curated
// thumbnail (no network hit). Reuses the same asset the exercise-detail screen
// ships, so the look stays consistent across screens.
const EXERCISE_THUMB_FALLBACK = require('../../assets/images/exercise-detail-fallback.png');

// Resolve a small, cacheable thumbnail SOURCE for an exercise name from the
// curated demo data (zero network for FEDB frame pairs — they reuse data the
// app already ships). Returns a `{ uri }` for the first FEDB frame / a gif, or
// `null` when nothing curated exists so the caller falls back to the bundled
// placeholder. Pure lookup — safe to call on the render path.
function curatedThumbSource(name: string): { uri: string } | null {
    const frames = getCuratedDemoFrames(name);
    if (frames && frames.length > 0 && typeof frames[0] === 'string' && frames[0].trim()) {
        return { uri: frames[0] };
    }
    const demo = getCuratedDemo(name);
    if (demo && demo.kind === 'gif' && demo.url.trim()) return { uri: demo.url };
    return null;
}

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
    /**
     * Id of the matched seeded LibraryExercise, when this exercise was seeded
     * from an AI/saved routine whose names were resolved server-side. Non-null →
     * the card shows a rich thumbnail/demo + equipment and deep-links to the
     * exercise detail; null/undefined → a clean text-only card. Optional so
     * exercises added ad-hoc (browse / paramExercise) stay text-only.
     */
    libraryId?: string | null;
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

// ─── Resolved-exercise rich-card pieces ───────────────────────────────────────
// Rendered only for an exercise that resolved to a seeded LibraryExercise
// (libraryId != null). Both pieces are React.memo'd and derive their own data,
// so toggling a set on another card never re-renders them
// (list-performance-function-references / list-performance-callbacks).
const THUMB = 44;

// Leading visual: a curated demo thumbnail (FEDB first-frame / gif — zero
// network for FEDB, which reuses data the app already ships), falling back to
// the bundled placeholder. expo-image with memory-disk caching so a scrolled-
// away card pays no network on return (ui-expo-image, list-performance-images).
const ResolvedExerciseThumb = React.memo(function ResolvedExerciseThumb({
    name,
    libraryId,
    backgroundColor,
}: {
    name: string;
    libraryId: string;
    backgroundColor: string;
}) {
    const thumbSource = useMemo(() => curatedThumbSource(name), [name]);
    return (
        <Image
            source={thumbSource ?? EXERCISE_THUMB_FALLBACK}
            placeholder={EXERCISE_THUMB_FALLBACK}
            // recyclingKey keeps a recycled row from flashing a neighbour's frame.
            recyclingKey={libraryId}
            style={{ width: THUMB, height: THUMB, borderRadius: 12, backgroundColor }}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={200}
            accessibilityIgnoresInvertColors
        />
    );
});

// Equipment subtitle, read from the SAME cached query key the detail screen uses
// (['exercise-detail', libraryId]) so tapping the card opens a warm detail. Only
// fires while a resolved card is mounted; renders nothing until/unless equipment
// is known, so it never shows a blank "Equipment:" stub.
const ResolvedExerciseEquipment = React.memo(function ResolvedExerciseEquipment({
    libraryId,
    style,
}: {
    libraryId: string;
    style: any;
}) {
    const { data: detail } = useQuery({
        queryKey: ['exercise-detail', libraryId],
        queryFn: () => getById(libraryId),
        enabled: !!libraryId,
        staleTime: 5 * 60 * 1000,
    });
    const equipment = detail?.equipment?.trim();
    if (!equipment) return null;
    return (
        <Text style={style} numberOfLines={1} ellipsizeMode="tail">
            {equipment}
        </Text>
    );
});

export default function ActiveWorkoutScreen() {
    const { colors, typography, spacing, borderRadius, shadows } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const queryClient = useQueryClient();
    const { sessionId: paramSessionId, exercise: paramExercise, routineId: paramRoutineId } = useLocalSearchParams<{ sessionId: string, exercise?: string, routineId?: string }>();

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
    // `isError`/`refetch` drive the honest retryable error state below: when the
    // active-session fetch fails we surface a retry instead of hanging forever on
    // the loading skeleton (init only runs once `sessionReady` is true, and a
    // failed query never flips `isLoading` back off on its own). The react-query
    // cache stays the single source of truth — we never mirror the error flag
    // into local state (react-state-fallback).
    const {
        data: session,
        isLoading: isSessionLoading,
        isError: isSessionError,
        refetch: refetchSession,
    } = useQuery({
        queryKey: ['active-session', sessionId],
        queryFn: getActiveSession,
        enabled: !!sessionId,
    });

    // When launched from a routine (START button), fetch routines so we can seed
    // the session with that routine's exercises — the backend creates an empty
    // session, so without this the workout would open with no exercises. Same
    // error contract as the session query: a failed routine fetch (only enabled
    // when we arrived via a routine) surfaces a retry rather than seeding an
    // empty, exercise-less workout.
    const {
        data: routines,
        isLoading: routinesLoading,
        isError: isRoutinesError,
        refetch: refetchRoutines,
    } = useQuery({
        queryKey: ['routines'],
        queryFn: getRoutines,
        enabled: !!paramRoutineId,
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
                        const newSess = await startSession(paramRoutineId);
                        resumedSessionId = newSess.id;
                    } catch (e) {
                        console.warn('Failed to start session', e);
                    }
                }

                setSessionId(resumedSessionId);
                setIsInitialized(true);
                return;
            }

            // Fallback: Initial state from session, or seed from the routine when
            // the user started one (the backend creates an empty session, so we
            // hydrate exercises from the routine definition here).
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
            } else if (paramRoutineId && Array.isArray(routines)) {
                const routine = routines.find((r) => r.id === paramRoutineId);
                if (routine && Array.isArray(routine.exercises)) {
                    initialExercises = routine.exercises.map((ex) => ({
                        name: ex.name,
                        muscleGroup: 'Other',
                        sets: Array.from({ length: ex.sets || 3 }, () => ({
                            kg: 0,
                            reps: ex.reps || 10,
                            completed: false,
                        })),
                        restSeconds: DEFAULT_REST_SECONDS,
                        // Carry the server-resolved catalogue id through so the card
                        // can render a rich demo/thumbnail + deep-link to detail.
                        libraryId: ex.libraryId ?? null,
                    }));
                }
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

        const sessionReady = session || !isSessionLoading;
        const routineReady = !paramRoutineId || !routinesLoading;
        // Hold off initialization while a relevant query is in error: a failed
        // load must surface the retry EmptyState below (and refetch on tap),
        // not initialize an empty, exercise-less session off undefined data.
        // A successful refetch clears the flag and re-runs this effect → init().
        const loadErrored = isSessionError || (!!paramRoutineId && isRoutinesError);
        if (sessionReady && routineReady && !loadErrored) {
            init();
        }
    }, [session, isSessionLoading, isSessionError, paramExercise, sessionId, paramRoutineId, routines, routinesLoading, isRoutinesError]);

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

    // Single hoisted handler shared by every resolved card (list-performance-
    // callbacks): the card passes its own libraryId, so we never allocate a new
    // closure per row on each render. Opens the exercise detail (same route +
    // cache key the library uses), so the tap lands on a warm screen.
    const openExerciseDetail = useCallback((libraryId: string) => {
        if (libraryId) router.push(`/(exercises)/${libraryId}` as any);
    }, [router]);

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

        // Real session metrics for the summary screen (replaces hardcoded values).
        const totalVolume = Math.round(exerciseStates.reduce((acc, ex) =>
            acc + ex.sets.filter(s => s.completed).reduce((a, s) => a + (s.kg || 0) * (s.reps || 0), 0), 0));
        const totalKcal = Math.round((finalElapsed / 60) * 6); // ≈6 kcal/min for resistance training
        const summaryParams = { elapsed: String(finalElapsed), volume: String(totalVolume), kcal: String(totalKcal) };

        setShowConfetti(true);

        // Clear persisted state FIRST (before any async calls)
        await AsyncStorage.removeItem(STORAGE_KEY_STATE);

        try {
            if (!sessionId) {
                setTimeout(() => {
                    router.replace({ pathname: '/training/complete', params: summaryParams });
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
                router.replace({ pathname: '/training/complete', params: summaryParams });
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
                <Text style={[typography.overline, { color: colors.text.secondary }]}>
                    ACTIVE WORKOUT
                </Text>
                <Text
                    style={[styles.timer, {
                        color: colors.accent.cyan,
                        textShadowColor: withAlpha(colors.accent.cyan, 0.35),
                        textShadowOffset: { width: 0, height: 0 },
                        textShadowRadius: 12,
                    }]}
                    maxFontSizeMultiplier={1.3}
                >
                    {formatTime(elapsedSeconds)}
                </Text>
            </View>
            <Button
                variant="primary"
                size="md"
                title="FINISH"
                onPress={handleEnd}
                accessibilityLabel="Finish workout"
                icon={<Ionicons name="flag" size={16} color="#FFF" />}
            />
        </View>
    );

    // A failed session fetch (or, when we arrived via a routine, a failed routine
    // fetch) must surface a retry rather than hanging on the loading skeleton or
    // silently opening an empty, exercise-less workout. The retry refetches only
    // the query that actually errored (and the other only when it is relevant),
    // which re-runs the init effect on success. Active-workout session logic,
    // timers, and persistence are untouched — this branch is reached only before
    // a session has initialized.
    const routineRelevant = !!paramRoutineId;
    const loadError = isSessionError || (routineRelevant && isRoutinesError);
    if (!isInitialized && loadError) {
        return (
            <View style={[styles.container, { backgroundColor: colors.background.primary, justifyContent: 'center' }]}>
                <StatusBar style="light" />
                <EmptyState
                    icon="cloud-offline-outline"
                    title="Couldn't start your workout"
                    subtitle="Something went wrong loading your session. Check your connection and try again."
                    actionLabel="Try Again"
                    onAction={() => {
                        if (isSessionError) refetchSession();
                        if (routineRelevant && isRoutinesError) refetchRoutines();
                    }}
                />
            </View>
        );
    }

    if (!isInitialized) {
        // Honest loading scaffold mirroring the active-workout chrome (header +
        // an expanded exercise card with set rows) instead of a bare spinner, so
        // the screen doesn't "pop" when the session initializes.
        return (
            <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
                <StatusBar style="light" />
                <View style={{ paddingTop: insets.top, flex: 1 }}>
                    {/* Header placeholder: ACTIVE WORKOUT overline + timer block on
                        the left, FINISH button block on the right. */}
                    <View style={[styles.header, { borderBottomColor: colors.border.default }]}>
                        <View>
                            <Skeleton width={110} height={11} radius={borderRadius.sm} />
                            <Skeleton width={90} height={34} radius={borderRadius.md} style={{ marginTop: 6 }} />
                        </View>
                        <Skeleton width={96} height={44} radius={borderRadius.lg} />
                    </View>

                    <View style={{ padding: spacing.lg }}>
                        {Array.from({ length: 3 }).map((_, i) => (
                            <Card
                                key={i}
                                variant="glass"
                                noPadding
                                style={{ marginBottom: spacing.md, borderColor: colors.border.default }}
                            >
                                <View style={styles.exHeader}>
                                    <View style={styles.exTitleRow}>
                                        <Skeleton width={44} height={44} radius={12} />
                                        <View style={{ flex: 1, marginLeft: spacing.md }}>
                                            <Skeleton width="60%" height={16} radius={borderRadius.sm} />
                                            <Skeleton width="40%" height={12} radius={borderRadius.sm} style={{ marginTop: 8 }} />
                                        </View>
                                    </View>
                                    {/* First card expanded: a couple of set-row placeholders so the
                                        scaffold matches the default-expanded loaded layout. */}
                                    {i === 0 ? (
                                        <View style={{ marginTop: spacing.md }}>
                                            {Array.from({ length: 3 }).map((__, s) => (
                                                <Skeleton
                                                    key={s}
                                                    width="100%"
                                                    height={40}
                                                    radius={borderRadius.md}
                                                    style={{ marginBottom: 8 }}
                                                />
                                            ))}
                                        </View>
                                    ) : null}
                                </View>
                            </Card>
                        ))}
                    </View>
                </View>
            </View>
        );
    }

    const isStarting = startupCountdown !== null && startupCountdown > 0;

    // The ring fraction is restSeconds over the rest period the timer opened with.
    // toggleSetComplete seeds `restSeconds` from the active exercise's `restSeconds`,
    // so we read it back from that exercise (no handler change needed). +15s can push
    // restSeconds past the initial value; CircularProgress clamps the fraction to 1.
    const initialRest = exerciseStates[restExerciseIdx]?.restSeconds || DEFAULT_REST_SECONDS;

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={[styles.container, { backgroundColor: colors.background.primary }]}
        >
            <StatusBar style="light" />
            <View style={{ paddingTop: insets.top, flex: 1 }}>
                {renderHeader()}

                <ScrollView
                    contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}
                    keyboardShouldPersistTaps="handled"
                >
                    {exerciseStates.map((ex, eIdx) => {
                        const isExpanded = expandedIndex === eIdx;
                        const completedCount = ex.sets.filter(s => s.completed).length;
                        const firstIncompleteIndex = ex.sets.findIndex(s => !s.completed);
                        // Resolved → seeded LibraryExercise: render the rich, tappable
                        // card (thumbnail + sets×reps + equipment + deep-link). Null →
                        // a clean text-only card. Never drops/hides the exercise.
                        const libraryId = ex.libraryId ?? null;
                        const isResolved = !!libraryId;
                        const targetReps = ex.sets[0]?.reps ?? 0;

                        return (
                            <Card
                                // Stable key: name + index survives reorder/recycle better
                                // than a bare index, without assuming names are unique
                                // within a routine (list-performance-function-references).
                                key={`${ex.name}-${eIdx}`}
                                variant="glass"
                                noPadding
                                style={{
                                    marginBottom: spacing.md,
                                    borderColor: isExpanded ? colors.accent.coral : colors.border.default,
                                    ...(isExpanded ? shadows.glow(colors.accent.coral) : null),
                                }}
                            >
                                <TouchableOpacity
                                    style={styles.exHeader}
                                    onPress={() => setExpandedIndex(isExpanded ? -1 : eIdx)}
                                    activeOpacity={0.7}
                                    accessibilityRole="button"
                                    accessibilityState={{ expanded: isExpanded }}
                                    accessibilityLabel={`${ex.name}, ${completedCount} of ${ex.sets.length} sets done`}
                                >
                                    <View style={styles.exTitleRow}>
                                        {isResolved ? (
                                            // Thumbnail doubles as the deep-link into the
                                            // exercise detail (>=44pt touch target). Stops
                                            // propagation so the row's expand toggle and the
                                            // detail tap don't fight.
                                            <TouchableOpacity
                                                accessibilityRole="button"
                                                accessibilityLabel={`View ${ex.name} details`}
                                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                                activeOpacity={0.8}
                                                onPress={() => openExerciseDetail(libraryId!)}
                                            >
                                                <ResolvedExerciseThumb
                                                    name={ex.name}
                                                    libraryId={libraryId!}
                                                    backgroundColor={colors.background.tertiary}
                                                />
                                            </TouchableOpacity>
                                        ) : (
                                            <View style={[styles.iconBox, { backgroundColor: withAlpha(colors.accent.coral, 0.12) }]}>
                                                <Ionicons name="barbell" size={22} color={colors.accent.coral} />
                                            </View>
                                        )}
                                        <View style={{ flex: 1, marginLeft: spacing.md }}>
                                            <Text
                                                style={[typography.subhead, { color: colors.text.primary, fontWeight: '600' }]}
                                                numberOfLines={1}
                                                ellipsizeMode="tail"
                                            >
                                                {ex.name}
                                            </Text>
                                            <Text style={[typography.caption, { color: colors.text.secondary }]}>
                                                {completedCount}/{ex.sets.length} Sets Done
                                                {isResolved && targetReps > 0
                                                    ? ` · ${ex.sets.length} × ${targetReps}`
                                                    : ` · ${ex.muscleGroup}`}
                                            </Text>
                                            {isResolved ? (
                                                <ResolvedExerciseEquipment
                                                    libraryId={libraryId!}
                                                    style={[typography.caption, { color: colors.text.tertiary, marginTop: 2 }]}
                                                />
                                            ) : null}
                                        </View>
                                        {isResolved ? (
                                            <TouchableOpacity
                                                accessibilityRole="button"
                                                accessibilityLabel={`Open ${ex.name} details`}
                                                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                                activeOpacity={0.7}
                                                onPress={() => openExerciseDetail(libraryId!)}
                                                style={{ paddingHorizontal: 4 }}
                                            >
                                                <Ionicons name="information-circle-outline" size={20} color={colors.accent.cyan} />
                                            </TouchableOpacity>
                                        ) : null}
                                        <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={20} color={colors.text.tertiary} />
                                    </View>
                                </TouchableOpacity>

                                {isExpanded && (
                                    <View style={styles.exContent}>
                                        <View style={styles.rowLabel}>
                                            <Text style={[styles.label, { color: colors.text.secondary, width: 36 }]}>SET</Text>
                                            <Text style={[styles.label, { color: colors.text.secondary, flex: 1, textAlign: 'center' }]}>KG</Text>
                                            <Text style={[styles.label, { color: colors.text.secondary, flex: 1, textAlign: 'center' }]}>REPS</Text>
                                            <Text style={[styles.label, { color: colors.text.secondary, width: 44, textAlign: 'right' }]}>DONE</Text>
                                        </View>

                                        {ex.sets.map((set, sIdx) => {
                                            const numberColor = set.completed
                                                ? colors.accent.cyan
                                                : (firstIncompleteIndex === sIdx ? colors.accent.coral : colors.text.secondary);
                                            const inputDisabledStyle = set.completed
                                                ? { opacity: 0.55, color: colors.text.secondary }
                                                : null;

                                            return (
                                                <View key={sIdx} style={styles.setRow}>
                                                    <View style={[styles.setNum, { backgroundColor: colors.background.tertiary }]}>
                                                        <Text
                                                            style={[styles.setNumText, { color: numberColor }]}
                                                            maxFontSizeMultiplier={1.2}
                                                        >
                                                            {sIdx + 1}
                                                        </Text>
                                                    </View>

                                                    <TextInput
                                                        style={[styles.setInput, { color: colors.text.primary, backgroundColor: colors.background.tertiary, borderColor: colors.border.default }, inputDisabledStyle]}
                                                        keyboardType="numeric"
                                                        value={set.kg.toString()}
                                                        onChangeText={(v) => updateSet(eIdx, sIdx, 'kg', parseFloat(v) || 0)}
                                                        editable={!set.completed}
                                                        selectionColor={colors.accent.coral}
                                                        maxFontSizeMultiplier={1.3}
                                                    />

                                                    <TextInput
                                                        style={[styles.setInput, { color: colors.text.primary, backgroundColor: colors.background.tertiary, borderColor: colors.border.default }, inputDisabledStyle]}
                                                        keyboardType="numeric"
                                                        value={set.reps.toString()}
                                                        onChangeText={(v) => updateSet(eIdx, sIdx, 'reps', parseInt(v) || 0)}
                                                        editable={!set.completed}
                                                        selectionColor={colors.accent.coral}
                                                        maxFontSizeMultiplier={1.3}
                                                    />

                                                    <TouchableOpacity
                                                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                                        accessibilityRole="button"
                                                        accessibilityLabel={set.completed ? 'Mark set incomplete' : 'Complete set'}
                                                        accessibilityState={{ checked: set.completed }}
                                                        style={[
                                                            styles.checkBtn,
                                                            set.completed
                                                                ? { backgroundColor: colors.accent.emerald, ...shadows.glow(colors.accent.emerald) }
                                                                : { backgroundColor: colors.background.tertiary, borderWidth: 1, borderColor: colors.border.light },
                                                        ]}
                                                        onPress={() => toggleSetComplete(eIdx, sIdx)}
                                                    >
                                                        <Ionicons name="checkmark" size={18} color={set.completed ? '#FFF' : colors.text.tertiary} />
                                                    </TouchableOpacity>

                                                    {ex.sets.length > 1 && (
                                                        <TouchableOpacity
                                                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                                            accessibilityRole="button"
                                                            accessibilityLabel="Remove set"
                                                            style={styles.removeSetBtn}
                                                            onPress={() => removeSet(eIdx, sIdx)}
                                                        >
                                                            <Ionicons name="close" size={16} color={colors.text.tertiary} />
                                                        </TouchableOpacity>
                                                    )}
                                                </View>
                                            );
                                        })}

                                        <TouchableOpacity
                                            activeOpacity={0.7}
                                            accessibilityRole="button"
                                            accessibilityLabel="Add set"
                                            style={[styles.addSetBtn, { borderColor: colors.border.light }]}
                                            onPress={() => addSet(eIdx)}
                                        >
                                            <Ionicons name="add" size={16} color={colors.text.secondary} />
                                            <Text style={[typography.caption, { color: colors.text.secondary, marginLeft: 6, fontWeight: '600' }]}>ADD SET</Text>
                                        </TouchableOpacity>
                                    </View>
                                )}
                            </Card>
                        );
                    })}

                    {exerciseStates.length === 0 && (
                        <View style={{ alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 }}>
                            <Ionicons name="barbell-outline" size={56} color={colors.text.tertiary} />
                            <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: 'bold', marginTop: 16, textAlign: 'center' }]}>
                                No exercises yet
                            </Text>
                            <Text style={[typography.body, { color: colors.text.secondary, marginTop: 6, textAlign: 'center' }]}>
                                Add your first exercise to this session using the button below.
                            </Text>
                        </View>
                    )}

                    <TouchableOpacity
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityLabel="Browse exercises"
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
                    <SafeBlurView intensity={80} tint="dark" style={[StyleSheet.absoluteFillObject, { justifyContent: 'center', alignItems: 'center' }]}>
                        <Text
                            style={[styles.countdownNum, {
                                color: colors.accent.coral,
                                textShadowColor: withAlpha(colors.accent.coral, 0.5),
                                textShadowOffset: { width: 0, height: 0 },
                                textShadowRadius: 24,
                            }]}
                            maxFontSizeMultiplier={1.15}
                        >
                            {startupCountdown}
                        </Text>
                        <Text style={[typography.h3, { color: colors.text.primary, marginTop: 20, letterSpacing: 2 }]} maxFontSizeMultiplier={1.3}>
                            GET READY!
                        </Text>
                    </SafeBlurView>
                </View>
            )}

            {/* Rest Timer Modal */}
            <Modal transparent visible={showRestTimer && !isStarting} animationType="fade">
                <View style={styles.modalOverlay}>
                    <SafeBlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
                    <Card
                        variant="glass"
                        style={{
                            width: '100%',
                            padding: 30,
                            alignItems: 'center',
                            borderRadius: borderRadius['2xl'],
                            ...shadows.glow(colors.accent.coral),
                            ...shadows.xl,
                        }}
                        accessibilityViewIsModal={true}
                        accessibilityLabel={`Rest timer, ${restSeconds} seconds remaining. Up next: ${exerciseStates[restExerciseIdx]?.name ?? 'next exercise'}`}
                    >
                        <Text style={[typography.overline, { color: colors.text.secondary, marginBottom: 16 }]}>REST</Text>

                        <CircularProgress
                            size={180}
                            strokeWidth={10}
                            progress={initialRest > 0 ? restSeconds / initialRest : 0}
                            color={colors.accent.coral}
                            trackColor={withAlpha(colors.text.primary, 0.08)}
                        >
                            <Text
                                style={{ fontFamily: typography.statLarge.fontFamily, fontSize: 48, lineHeight: 56, color: colors.text.primary }}
                                maxFontSizeMultiplier={1.2}
                            >
                                {formatTime(restSeconds)}
                            </Text>
                        </CircularProgress>

                        <Text style={[typography.subhead, { color: colors.text.secondary, marginTop: spacing.lg }]} numberOfLines={1}>
                            Up next: {exerciseStates[restExerciseIdx]?.name ?? 'next exercise'}
                        </Text>

                        <View style={styles.modalActions}>
                            <TouchableOpacity
                                activeOpacity={0.85}
                                accessibilityRole="button"
                                accessibilityLabel="Add 15 seconds"
                                style={[styles.restChip, { backgroundColor: colors.background.tertiary, borderWidth: 1, borderColor: colors.border.default }]}
                                onPress={() => setRestSeconds(prev => prev + 15)}
                            >
                                <Text style={[typography.body, { color: colors.text.primary, fontWeight: 'bold' }]}>+15s</Text>
                            </TouchableOpacity>
                            <Button
                                variant="primary"
                                size="md"
                                title="SKIP"
                                style={{ flex: 1, height: 50 }}
                                accessibilityLabel="Skip rest"
                                onPress={() => setShowRestTimer(false)}
                            />
                        </View>
                    </Card>
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
    timer: { fontFamily: typo.statMedium.fontFamily, fontSize: 32, lineHeight: 38, marginTop: 2 },
    exHeader: { padding: 16, minHeight: 64, justifyContent: 'center' },
    exTitleRow: { flexDirection: 'row', alignItems: 'center' },
    iconBox: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    exContent: { paddingHorizontal: 16, paddingBottom: 16 },
    rowLabel: { flexDirection: 'row', marginBottom: 8, paddingHorizontal: 4, alignItems: 'center' },
    label: { fontSize: 10, fontWeight: 'bold', letterSpacing: 1 },
    setRow: { flexDirection: 'row', gap: 10, alignItems: 'center', height: 48, marginBottom: 8 },
    setNum: { width: 32, height: 32, borderRadius: 9999, alignItems: 'center', justifyContent: 'center' },
    setNumText: { fontFamily: typo.statTiny.fontFamily, fontSize: 16, fontWeight: 'bold' },
    setInput: { flex: 1, height: 40, borderRadius: 10, borderWidth: 1, textAlign: 'center', fontWeight: 'bold', fontSize: 16 },
    checkBtn: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    removeSetBtn: { paddingLeft: 2, alignItems: 'center', justifyContent: 'center' },
    addSetBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, minHeight: 44, borderStyle: 'dashed' as any, borderWidth: 1, borderRadius: 10, marginTop: 4 },
    modalOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
    countdownNum: { fontFamily: typo.statLarge.fontFamily, fontSize: 120, lineHeight: 130 },
    modalActions: { flexDirection: 'row', gap: 16, marginTop: 20, alignSelf: 'stretch' },
    restChip: { flex: 1, height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
