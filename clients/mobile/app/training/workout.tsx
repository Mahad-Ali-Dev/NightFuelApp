import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    Alert, Modal, Dimensions,
    KeyboardAvoidingView, Platform
} from 'react-native';

import { useTheme } from '@/theme';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton, EmptyState } from '@/components/ui';
// F10-hardened workout primitives. RestTimer owns a single self-resetting
// countdown interval (fixing the resume / double-interval bug the old inline
// effect in THIS screen had); SetLogger validates set entry with
// Number.isFinite + reps>=1 / weight>=0 so junk ('abc', '0', negative) can never
// reach the log path (the bare parseInt(v)||0 / parseFloat(v)||0 this screen
// used had no such guard). Both live under src/, reached via the @/ alias.
import { RestTimer } from '@/components/workout/RestTimer';
import { SetLogger } from '@/components/workout/SetLogger';
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

// Coerce an UNTRUSTED number to a finite value at or above `min` (default 0),
// else `min`. The set/timer math below sums kg/reps that originate from a
// restored AsyncStorage snapshot (JSON.parse) or a server payload — a malformed
// entry can carry a NaN/Infinity/negative the bare `|| 0` does NOT catch (NaN is
// falsy-ish only via `||`, but `NaN * 0` is still NaN, and `Math.max()` of an
// empty list is -Infinity), which would surface as a "NaN"/"-Infinity" summary
// or a negative timer. Routing every at-risk number through this keeps the
// summary/volume/timer math finite and clamped without changing any well-formed
// (already-finite, in-range) value — behaviour-identical for a normal workout.
const finite = (n: unknown, min = 0): number =>
    typeof n === 'number' && Number.isFinite(n) && n >= min ? n : min;

function formatTime(totalSeconds: number): string {
    // Defend the display formatter: a NaN/negative would render "NaN:NaN" or a
    // negative clock. Clamp to a finite, non-negative whole second first.
    const safe = Math.max(0, Math.floor(finite(totalSeconds)));
    const mins = Math.floor(safe / 60);
    const secs = safe % 60;
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
    // The rest countdown lives entirely inside <RestTimer/> now (its own single
    // self-resetting interval), so this screen no longer owns a restTimerRef.
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
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
    // The per-tick countdown is no longer driven here. <RestTimer/> (rendered in
    // the rest modal below) owns exactly one self-resetting interval and calls
    // back via onFinish — replacing the old effect that recreated its interval on
    // every [showRestTimer, restSeconds] change (the resume / double-interval
    // bug). This screen only toggles `showRestTimer` and seeds `restSeconds` (the
    // rest length), which RestTimer consumes as its `durationSeconds`.

    // ── Handlers ────────────────────────────────────────────────────────────

    // Single hoisted handler shared by every resolved card (list-performance-
    // callbacks): the card passes its own libraryId, so we never allocate a new
    // closure per row on each render. Opens the exercise detail (same route +
    // cache key the library uses), so the tap lands on a warm screen.
    const openExerciseDetail = useCallback((libraryId: string) => {
        if (libraryId) router.push(`/(exercises)/${libraryId}` as any);
    }, [router]);

    // Record one validated set for an exercise. Set entry now flows through the
    // hardened <SetLogger/> (Number.isFinite + reps>=1 / weight>=0), so the
    // { reps, weightKg } that reaches here is already clean — no bare
    // parseInt(v)||0 / parseFloat(v)||0 on the render path any longer. We mark the
    // next still-incomplete planned set as completed with the logged numbers
    // (keeping the ExerciseState.sets[].completed model handleEnd already logs
    // from), then fire the SAME rest-trigger toggleSetComplete used to:
    // seed restSeconds from the exercise, point restExerciseIdx at it, and open
    // the rest modal. If every planned set is already logged we no-op (and skip
    // the rest trigger) rather than appending past targetSets.
    const logSet = (eIdx: number, data: { reps: number; weightKg: number }) => {
        setExerciseStates(prev => {
            // Deep-clone the touched structures so we never mutate prior state.
            const next = prev.map(ex => ({ ...ex, sets: ex.sets.map(s => ({ ...s })) }));
            const exercise = next[eIdx];
            if (!exercise) return prev;
            const sIdx = exercise.sets.findIndex(s => !s.completed);
            if (sIdx === -1) return prev; // all planned sets already logged
            exercise.sets[sIdx] = { kg: data.weightKg, reps: data.reps, completed: true };

            // Same rest-trigger the old toggleSetComplete fired on completion.
            setRestSeconds(exercise.restSeconds);
            setRestExerciseIdx(eIdx);
            setShowRestTimer(true);

            return next;
        });
    };

    // ── In-row set edits PERSISTED to ground truth ────────────────────────────
    // The SetLogger renders one row per ex.sets entry (it is seeded from ALL
    // planned sets, so row i === exerciseStates[eIdx].sets[i]). These three
    // immutable dispatch updaters (react-state-dispatcher) close the former
    // display-only divergence: a DONE-toggle / reps-or-kg edit / remove in the
    // logger now reaches exerciseStates[eIdx].sets — the SAME source the header
    // `${completedCount}/${ex.sets.length} Sets Done`, the 5s AsyncStorage
    // snapshot, and handleEnd's completed-set logging all read. No new counter is
    // introduced (state-ground-truth): completed stays a per-set flag.

    // Patch one set's fields (used by an in-row reps/kg edit). The edited set is
    // also marked completed — an explicit edit of a logged set means it stands.
    const updateSet = (eIdx: number, sIdx: number, patch: Partial<SetData>) =>
        setExerciseStates((prev) =>
            prev.map((ex, i) =>
                i !== eIdx ? ex : { ...ex, sets: ex.sets.map((s, j) => (j !== sIdx ? s : { ...s, ...patch })) },
            ),
        );

    // Flip one set's completed flag (used by the per-set DONE toggle).
    const toggleSetDone = (eIdx: number, sIdx: number) =>
        setExerciseStates((prev) =>
            prev.map((ex, i) =>
                i !== eIdx
                    ? ex
                    : { ...ex, sets: ex.sets.map((s, j) => (j !== sIdx ? s : { ...s, completed: !s.completed })) },
            ),
        );

    // Drop one set entirely (used by the per-set remove). Re-indexing is fine:
    // the SetLogger re-seeds only once, so its rows + ex.sets stay aligned by the
    // same immutable filter on the next render.
    const removeSetAt = (eIdx: number, sIdx: number) =>
        setExerciseStates((prev) =>
            prev.map((ex, i) => (i !== eIdx ? ex : { ...ex, sets: ex.sets.filter((_, j) => j !== sIdx) })),
        );

    const handleEnd = async () => {
        // Immediately mark as finished to stop persistence & timers
        setIsFinished(true);

        // Stop all intervals immediately. The rest countdown is owned by
        // <RestTimer/> and tears its own interval down on unmount, so there is no
        // restTimerRef to clear here — finishing hides the modal (showRestTimer is
        // moot post-navigation) and RestTimer unmounts with the screen.
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
        if (persistenceRef.current) { clearInterval(persistenceRef.current); persistenceRef.current = null; }

        // Capture the final elapsed time before any async work
        const finalElapsed = elapsedSeconds;

        // Real session metrics for the summary screen (replaces hardcoded values).
        // Each set's kg/reps is run through `finite` (not the old bare `|| 0`,
        // which lets a NaN through `NaN * 0`), and the rounded total is itself
        // clamped finite/>=0 so a garbled restored set can never surface a
        // "NaN"/"-Infinity" volume on the summary. A well-formed set is unchanged
        // (finite(50)*finite(10) === 500), so a normal workout's volume is identical.
        const totalVolume = Math.max(0, finite(Math.round(exerciseStates.reduce((acc, ex) =>
            acc + ex.sets.filter(s => s.completed).reduce((a, s) => a + finite(s.kg) * finite(s.reps), 0), 0))));
        const totalKcal = Math.max(0, finite(Math.round((finite(finalElapsed) / 60) * 6))); // ≈6 kcal/min for resistance training
        // Clamp the forwarded elapsed too (same guard as volume/kcal) so a garbled
        // restored startedAt can't push a negative/NaN seconds onto the summary
        // route. finite(finalElapsed) === finalElapsed for a normal session.
        const summaryParams = { elapsed: String(Math.max(0, finite(finalElapsed))), volume: String(totalVolume), kcal: String(totalKcal) };

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
                        // avg reps: each rep run through `finite`, divided by a
                        // floor-of-1 denominator so even if the length===0 guard
                        // above were ever bypassed this can't divide by zero / yield
                        // NaN. For a normal list (length>=1) Math.max(1, n) === n, so
                        // the mean is identical to today.
                        reps: Math.round(completedSets.reduce((a, s) => a + finite(s.reps), 0) / Math.max(1, completedSets.length)),
                        // max weight via a guarded reduce seeded at 0 instead of
                        // `Math.max(...map(s=>s.kg))`: an empty/garbled list yields 0,
                        // not -Infinity (Math.max() of [] is -Infinity). finite()
                        // also drops any NaN/negative kg. Identical to today for a
                        // well-formed list of non-negative weights.
                        weightKg: completedSets.reduce((m, s) => Math.max(m, finite(s.kg)), 0),
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
            // The exercise-history list (see app/(exercises)/history.tsx:25) reads
            // queryKey ['exercise-history']; React-Query matches keys positionally
            // from index 0, so this must be that exact single-element key (not
            // ['exercises', 'history'], which never matches and leaves the history
            // list stale until staleTime expires / a cold refetch).
            queryClient.invalidateQueries({ queryKey: ['exercise-history'] });

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
                                            {/* When expanded, the SetLogger below owns the
                                                exercise-name heading, so the header shows the
                                                title only while collapsed — the name stays
                                                visible in both states without being rendered
                                                (and read by a screen reader) twice. The
                                                touchable's accessibilityLabel still carries
                                                the name in either state. */}
                                            {isExpanded ? null : (
                                                <Text
                                                    style={[typography.subhead, { color: colors.text.primary, fontWeight: '600' }]}
                                                    numberOfLines={1}
                                                    ellipsizeMode="tail"
                                                >
                                                    {ex.name}
                                                </Text>
                                            )}
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

                                {/* Ternary-null (rendering-no-falsy-and): never `{isExpanded && …}`. */}
                                {isExpanded ? (
                                    <View style={styles.exContent}>
                                        {/* Set entry routes through the F10-hardened SetLogger:
                                            its Number.isFinite + reps>=1 / weight>=0 guard
                                            rejects junk ('abc', '0', negative) BEFORE it reaches
                                            onLogSet — the unguarded parseFloat(v)||0 /
                                            parseInt(v)||0 TextInputs this screen used are gone.
                                            Each accepted set marks the next planned set complete
                                            and fires the rest cycle (logSet), so handleEnd's
                                            completed-set logging + AsyncStorage persistence are
                                            unchanged. */}
                                        <SetLogger
                                            exerciseName={ex.name}
                                            targetSets={ex.sets.length}
                                            // Seed from ALL planned sets carrying their REAL
                                            // completed flag, so SetLogger row i maps 1:1 to
                                            // ex.sets[i] — the index the persist callbacks
                                            // below pass straight through to ex.sets. A
                                            // resumed session still opens at N / M (the
                                            // already-completed sets keep completed:true) and
                                            // the SetLogger count agrees with the header's
                                            // `${completedCount}/${ex.sets.length} Sets Done`.
                                            // Purely visual — initialSets does NOT call
                                            // onLogSet, so handleEnd's volume (computed from
                                            // ex.sets[].completed) still counts each set once.
                                            initialSets={ex.sets.map((s) => ({
                                                reps: s.reps,
                                                weightKg: s.kg,
                                                completed: s.completed,
                                            }))}
                                            // Routed-screen in-place affordances: per-set
                                            // DONE toggle + editable KG/REPS + add/remove.
                                            // The input-row add still flows through logSet
                                            // (rest-trigger + ex.sets advance) unchanged, and
                                            // the three persist callbacks below mirror each
                                            // in-row mutation to exerciseStates[eIdx].sets so
                                            // the header count, the AsyncStorage snapshot, and
                                            // finish-time logging stop diverging from the UI.
                                            allowEdit
                                            allowAddRemove
                                            onLogSet={(data) => logSet(eIdx, data)}
                                            onToggleDone={(idx) => toggleSetDone(eIdx, idx)}
                                            onEditSet={(idx, v) =>
                                                updateSet(eIdx, idx, { reps: v.reps, kg: v.weightKg, completed: true })
                                            }
                                            onRemoveSet={(idx) => removeSetAt(eIdx, idx)}
                                        />
                                    </View>
                                ) : null}
                            </Card>
                        );
                    })}

                    {/* Ternary-null (rendering-no-falsy-and): `length === 0` is a boolean
                        here, but we keep the explicit ternary so a future numeric edit
                        can't leak a falsy 0 into the tree. */}
                    {exerciseStates.length === 0 ? (
                        <View style={{ alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 }}>
                            <Ionicons name="barbell-outline" size={56} color={colors.text.tertiary} />
                            <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: 'bold', marginTop: 16, textAlign: 'center' }]}>
                                No exercises yet
                            </Text>
                            <Text style={[typography.body, { color: colors.text.secondary, marginTop: 6, textAlign: 'center' }]}>
                                Add your first exercise to this session using the button below.
                            </Text>
                        </View>
                    ) : null}

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
                        accessibilityLabel={`Rest timer. Up next: ${exerciseStates[restExerciseIdx]?.name ?? 'next exercise'}`}
                    >
                        {/* The hardened RestTimer owns the single self-resetting
                            countdown interval (no parent interval) and announces the
                            live remaining time via its own accessibilityRole="timer".
                            durationSeconds is `restSeconds` — the rest length seeded by
                            logSet and bumped by the +15s chip below; RestTimer re-arms
                            from the new total whenever that prop changes, and onFinish
                            closes the modal at zero. Gated on the same condition as the
                            Modal's `visible`, so each new rest cycle mounts a fresh timer
                            (remaining = durationSeconds) and it tears down when the modal
                            hides — no stale 00:00 on reopen. */}
                        {showRestTimer && !isStarting ? (
                            <RestTimer
                                durationSeconds={restSeconds}
                                isRunning={showRestTimer && !isStarting}
                                onFinish={() => setShowRestTimer(false)}
                                size={180}
                            />
                        ) : null}

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
    // The per-set entry rows (setRow/setNum/setInput/checkBtn/removeSetBtn/
    // addSetBtn + their rowLabel/label header) used to live here when this screen
    // owned an inline set grid. That entry surface is now the hardened
    // <SetLogger/> (which carries its own styles), so those orphaned keys were
    // removed — no dead StyleSheet entries left behind.
    modalOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
    countdownNum: { fontFamily: typo.statLarge.fontFamily, fontSize: 120, lineHeight: 130 },
    modalActions: { flexDirection: 'row', gap: 16, marginTop: 20, alignSelf: 'stretch' },
    restChip: { flex: 1, height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
