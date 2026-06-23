import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    Alert, Modal, Dimensions,
    KeyboardAvoidingView, Platform, Keyboard
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
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getActiveSession, logSessionExercise, endSession, startSession, getRoutines, getById } from '@/api/exercises';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeBlurView } from '@/components/SafeBlurView';
import { StatusBar } from 'expo-status-bar';
import { Image } from 'expo-image';
import ConfettiCannon from 'react-native-confetti-cannon';
import Animated, { FadeInDown, FadeIn, useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import { withAlpha } from '@/theme/utils';
import { typography as typo } from '@/theme/typography';
import { getCuratedDemo, getCuratedDemoFrames } from '@/constants/curatedDemos';
import { invalidateWorkoutCaches } from '@/utils/invalidateWorkoutCaches';
// Screen-local presentation pieces: a pulsing "in motion" cyan beacon for the
// header and a segmented set-completion rail for whole-session orientation. Both
// are pure (no data/theme), so they never touch the shared primitives or theme.
import { WorkoutLiveBeacon, SetDots } from '@/components/WorkoutLiveBeacon';

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
const THUMB = 48;

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

    // ── Keyboard-aware footer ─────────────────────────────────────────────────
    // The thumb-zone FINISH bar is position:'absolute' (out of flow), so the
    // KeyboardAvoidingView's padding insertion does NOT lift it. When the user
    // taps an inline KG/REPS TextInput inside an expanded SetLogger card, the
    // floating footer would otherwise sit UNDER the keyboard (iOS) with nothing
    // adjusting on Android at all. We subscribe to the keyboard show/hide events
    // and slide the footer DOWN off-screen while the keyboard is up (transform
    // only — interruptible, off the JS thread), so the bottom set row stays
    // reachable above the keyboard and the bar returns when editing ends.
    const footerShift = useSharedValue(0);
    const footerStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: footerShift.value }],
        // Fade out as it slides so a partially-revealed bar never peeks over the
        // keyboard mid-transition.
        opacity: 1 - Math.min(1, footerShift.value / 120),
    }));
    useEffect(() => {
        const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
        const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
        const timing = { duration: 220, easing: Easing.out(Easing.cubic) };
        const onShow = () => { footerShift.value = withTiming(160, timing); };
        const onHide = () => { footerShift.value = withTiming(0, timing); };
        const showSub = Keyboard.addListener(showEvt, onShow);
        const hideSub = Keyboard.addListener(hideEvt, onHide);
        return () => { showSub.remove(); hideSub.remove(); };
    }, [footerShift]);

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

            // Refresh EVERY workout-derived reader in one place: the active
            // session, the exercise-history list, AND the heatmap grid /
            // analytics summaries (['exercise-heatmap'], ['exercises-heatmap'],
            // ['exercise-analytics']) — all of which derive from the session/
            // exercise data this FINISH just wrote. Centralised in
            // invalidateWorkoutCaches so this writer and the shift-prep
            // active-workout writer can never drift apart and leave a surface
            // (e.g. the same-screen heatmap) stale. React-Query matches keys
            // positionally from index 0, so the helper uses the exact reader keys
            // (note ['exercises-heatmap'] is a SEPARATE key from
            // ['exercise-heatmap']) and prefix-invalidates ['exercise-analytics']
            // to catch every ['exercise-analytics', <name>] variant.
            invalidateWorkoutCaches(queryClient);

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

    // ── Derived session orientation ───────────────────────────────────────────
    // Whole-session progress for the focus hero + header: total planned sets and
    // how many are completed across every exercise. Memoised on exerciseStates so
    // a set toggle is the only thing that recomputes it (cheap, pure reduce).
    const { totalSets, completedSets, progress, nextUp } = useMemo(() => {
        let total = 0;
        let done = 0;
        // The "next" set the lifter is oriented toward: the first incomplete set
        // of the first exercise that still has one. Drives the big VALUE in the
        // focus card so the screen keeps the user pointed at their current target.
        let next: { name: string; reps: number; kg: number; setNo: number; ofSets: number; eIdx: number } | null = null;
        exerciseStates.forEach((ex, eIdx) => {
            total += ex.sets.length;
            ex.sets.forEach((s) => { if (s.completed) done += 1; });
            if (!next) {
                const sIdx = ex.sets.findIndex((s) => !s.completed);
                const s = sIdx !== -1 ? ex.sets[sIdx] : undefined;
                if (s) {
                    next = { name: ex.name, reps: s.reps, kg: s.kg, setNo: sIdx + 1, ofSets: ex.sets.length, eIdx };
                }
            }
        });
        return {
            totalSets: total,
            completedSets: done,
            progress: total > 0 ? done / total : 0,
            nextUp: next as null | { name: string; reps: number; kg: number; setNo: number; ofSets: number; eIdx: number },
        };
    }, [exerciseStates]);

    const allSetsDone = totalSets > 0 && completedSets >= totalSets;

    // ── UI Components ───────────────────────────────────────────────────────

    // Sticky top bar: ACTIVE WORKOUT overline + the big condensed live clock
    // (VALUE dominates its label). The live timer keeps the functional cyan
    // (progress / "in motion"), reserving lime for the one primary action. The
    // former inline FINISH button moves to the thumb-zone footer; a thin progress
    // hairline under the bar gives constant whole-session orientation.
    const renderHeader = () => (
        <View style={[styles.header, { borderBottomColor: colors.border.default, backgroundColor: withAlpha(colors.background.primary, 0.6) }]}>
            <View style={styles.headerRow}>
                <View style={styles.headerClock}>
                    {/* Pulsing "in motion" beacon (functional cyan, never lime) —
                        the live, breathing signal that a session is recording. */}
                    <View style={styles.liveDot}>
                        <WorkoutLiveBeacon color={colors.accent.cyan} size={9} />
                    </View>
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
                </View>
                {/* Whole-session set tally — a calm secondary readout (VALUE bigger
                    than its label) so finishing the clock isn't the only sense of
                    progress. Lime stays off it; the count is text. */}
                {totalSets > 0 ? (
                    <View style={styles.headerTally}>
                        <Text style={[styles.tallyValue, { color: colors.text.primary }]} maxFontSizeMultiplier={1.3}>
                            {completedSets}
                            <Text style={[styles.tallyTotal, { color: colors.text.tertiary }]}>/{totalSets}</Text>
                        </Text>
                        <Text style={[typography.overline, { color: colors.text.tertiary }]}>SETS</Text>
                    </View>
                ) : null}
            </View>
            {/* Progress hairline — the single thin lime indicator (key active
                state) reading the whole-session completion at a glance. */}
            {totalSets > 0 ? (
                <View style={[styles.headerTrack, { backgroundColor: colors.border.default }]}>
                    <View
                        style={[styles.headerFill, {
                            // Same minimum-width floor as the focus-hero bar (:890) so the
                            // two progress readouts agree at low completion: once the first
                            // set is logged the hairline shows a visible sliver too.
                            width: `${Math.max(progress * 100, completedSets > 0 ? 4 : 0)}%`,
                            backgroundColor: colors.accent.coral,
                        }]}
                    />
                </View>
            ) : null}
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
        // focus hero + exercise cards with set rows) instead of a bare spinner, so
        // the screen doesn't "pop" when the session initializes.
        return (
            <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
                <StatusBar style="light" />
                <View style={{ paddingTop: insets.top, flex: 1 }}>
                    {/* Header placeholder: ACTIVE WORKOUT overline + timer block on
                        the left, set-tally block on the right. */}
                    <View style={[styles.header, { borderBottomColor: colors.border.default }]}>
                        <View style={styles.headerRow}>
                            <View style={styles.headerClock}>
                                <Skeleton width={8} height={8} radius={borderRadius.full} />
                                <View style={{ marginLeft: spacing.sm }}>
                                    <Skeleton width={110} height={11} radius={borderRadius.sm} />
                                    <Skeleton width={90} height={34} radius={borderRadius.md} style={{ marginTop: 6 }} />
                                </View>
                            </View>
                            <Skeleton width={48} height={40} radius={borderRadius.md} />
                        </View>
                        <Skeleton width="100%" height={4} radius={borderRadius.full} style={{ marginTop: spacing.md }} />
                    </View>

                    <View style={{ padding: spacing.lg }}>
                        {/* Focus-hero placeholder. */}
                        <Skeleton width="100%" height={132} radius={borderRadius['2xl']} style={{ marginBottom: spacing.lg }} />
                        {Array.from({ length: 3 }).map((_, i) => (
                            <Card
                                key={i}
                                variant="glass"
                                noPadding
                                style={{ marginBottom: spacing.md, borderColor: colors.border.default }}
                            >
                                <View style={styles.exHeader}>
                                    <View style={styles.exTitleRow}>
                                        <Skeleton width={48} height={48} radius={12} />
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
                    contentContainerStyle={{ padding: spacing.lg, paddingBottom: 132 }}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                    {/* ── Focus hero ──────────────────────────────────────────
                        Keeps the lifter oriented: one dominant condensed VALUE
                        (target reps × weight) for the very next set, with its
                        exercise + "Set N of M" as the quieter label. This is the
                        recurring focal point of the screen — the peak-end micro
                        beat between sets. When every planned set is logged it
                        flips to an affirming "all sets done" state that points at
                        the thumb-zone FINISH. Lime appears here only as the active
                        progress fill / the one "next" pip — used sparingly. */}
                    {exerciseStates.length > 0 ? (
                        <Animated.View entering={FadeInDown.duration(420)}>
                            <Card
                                variant="glass"
                                noPadding
                                style={{
                                    marginBottom: spacing.lg,
                                    borderColor: allSetsDone ? colors.accent.cyan : withAlpha(colors.accent.coral, 0.4),
                                    ...shadows.glow(allSetsDone ? colors.accent.cyan : colors.accent.coral),
                                }}
                            >
                                <View style={styles.focus}>
                                    <View style={styles.focusTopRow}>
                                        {/* The 'WORKOUT COMPLETE' cyan is a functional success
                                            signal (kept); 'UP NEXT' is a decorative section label,
                                            so it reads in text.secondary — lime is reserved for the
                                            progress fill + the CTA, not overlines (60/30/10). */}
                                        <Text style={[typography.overline, { color: allSetsDone ? colors.accent.cyan : colors.text.secondary }]}>
                                            {allSetsDone ? 'WORKOUT COMPLETE' : 'UP NEXT'}
                                        </Text>
                                        <Text style={[typography.overline, { color: colors.text.tertiary }]}>
                                            {Math.round(progress * 100)}%
                                        </Text>
                                    </View>

                                    {allSetsDone ? (
                                        <View style={styles.focusDoneRow}>
                                            <View style={[styles.focusDoneIcon, { backgroundColor: withAlpha(colors.accent.cyan, 0.12), borderColor: withAlpha(colors.accent.cyan, 0.3) }]}>
                                                <Ionicons name="checkmark-done" size={26} color={colors.accent.cyan} />
                                            </View>
                                            <View style={{ flex: 1 }}>
                                                <Text style={[styles.focusDoneTitle, { color: colors.text.primary }]} maxFontSizeMultiplier={1.2}>
                                                    Every set logged
                                                </Text>
                                                <Text style={[typography.bodySm, { color: colors.text.secondary }]} numberOfLines={2}>
                                                    Strong work. Tap Finish to bank the session.
                                                </Text>
                                            </View>
                                        </View>
                                    ) : nextUp ? (
                                        <>
                                            {/* The dominant VALUE: reps × weight. Condensed
                                                hero numerals; the unit + multiplier stay small
                                                so the numbers read first. */}
                                            <View style={styles.focusValueRow}>
                                                <Text style={[styles.focusValue, { color: colors.text.primary }]} maxFontSizeMultiplier={1.15}>
                                                    {nextUp.reps}
                                                    <Text style={[styles.focusValueUnit, { color: colors.text.tertiary }]}> reps</Text>
                                                </Text>
                                                <Text style={[styles.focusMult, { color: colors.text.tertiary }]}>×</Text>
                                                <Text style={[styles.focusValue, { color: colors.text.primary }]} maxFontSizeMultiplier={1.15}>
                                                    {nextUp.kg > 0 ? nextUp.kg : 'BW'}
                                                    {nextUp.kg > 0 ? (
                                                        <Text style={[styles.focusValueUnit, { color: colors.text.tertiary }]}> kg</Text>
                                                    ) : null}
                                                </Text>
                                            </View>
                                            <Text style={[typography.subhead, { color: colors.text.primary }]} numberOfLines={1} ellipsizeMode="tail">
                                                {nextUp.name}
                                            </Text>
                                            <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 2 }]}>
                                                Set {nextUp.setNo} of {nextUp.ofSets}
                                            </Text>
                                        </>
                                    ) : null}

                                    {/* Whole-session progress bar — lime active fill is the
                                        screen's key indicator; the track is neutral. */}
                                    <View style={[styles.focusTrack, { backgroundColor: colors.border.default }]}>
                                        <View
                                            style={[styles.focusFill, {
                                                width: `${Math.max(progress * 100, completedSets > 0 ? 4 : 0)}%`,
                                                backgroundColor: allSetsDone ? colors.accent.cyan : colors.accent.coral,
                                            }]}
                                        />
                                    </View>

                                    {/* Segmented set rail + count — pairs the bar with a
                                        glanceable per-set view and an explicit "n of m"
                                        so progress reads instantly (color is never the
                                        only signal). The count VALUE leads its label. */}
                                    <View style={styles.focusDotsRow}>
                                        <SetDots
                                            total={totalSets}
                                            completed={completedSets}
                                            activeColor={allSetsDone ? colors.accent.cyan : colors.accent.coral}
                                            trackColor={colors.border.light}
                                            nextColor={colors.accent.coral}
                                        />
                                        <Text style={[styles.focusCount, { color: colors.text.secondary }]} maxFontSizeMultiplier={1.3}>
                                            {completedSets}
                                            <Text style={[styles.focusCountTotal, { color: colors.text.tertiary }]}>/{totalSets} sets</Text>
                                        </Text>
                                    </View>
                                </View>
                            </Card>
                        </Animated.View>
                    ) : null}

                    {exerciseStates.map((ex, eIdx) => {
                        const isExpanded = expandedIndex === eIdx;
                        const completedCount = ex.sets.filter(s => s.completed).length;
                        const exDone = ex.sets.length > 0 && completedCount >= ex.sets.length;
                        // The exercise the focus hero is pointing at (its first
                        // incomplete set) — gets a quiet "active" accent so the
                        // active card and the hero agree.
                        const isActive = !allSetsDone && nextUp?.eIdx === eIdx;
                        // Resolved → seeded LibraryExercise: render the rich, tappable
                        // card (thumbnail + sets×reps + equipment + deep-link). Null →
                        // a clean text-only card. Never drops/hides the exercise.
                        const libraryId = ex.libraryId ?? null;
                        const isResolved = !!libraryId;
                        const targetReps = ex.sets[0]?.reps ?? 0;
                        // Accent for the card edge: cyan when this exercise is fully
                        // logged (functional success), lime ONLY for the single
                        // active exercise (the 10% accent), neutral otherwise.
                        const edgeColor = exDone
                            ? colors.accent.cyan
                            : isActive
                                ? colors.accent.coral
                                : colors.border.default;

                        return (
                            <Animated.View
                                // Stable key: name + index survives reorder/recycle better
                                // than a bare index, without assuming names are unique
                                // within a routine (list-performance-function-references).
                                key={`${ex.name}-${eIdx}`}
                                entering={FadeInDown.delay(120 + eIdx * 45).springify().damping(18).mass(0.7)}
                            >
                                <Card
                                    variant="glass"
                                    noPadding
                                    style={{
                                        marginBottom: spacing.md,
                                        borderColor: isExpanded || isActive || exDone ? edgeColor : colors.border.default,
                                        ...((isExpanded || isActive) && !exDone ? shadows.glow(colors.accent.coral) : null),
                                    }}
                                >
                                    {/* Left active-rail: a thin lime bar marks the one
                                        active exercise (sparing 10% accent), cyan marks a
                                        finished one — color is never the only signal (the
                                        chevron + done chip carry it too). */}
                                    {(isActive || exDone) ? (
                                        <View
                                            style={[styles.cardRail, { backgroundColor: exDone ? colors.accent.cyan : colors.accent.coral }]}
                                            pointerEvents="none"
                                        />
                                    ) : null}
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
                                                <View style={[styles.iconBox, {
                                                    backgroundColor: exDone
                                                        ? withAlpha(colors.accent.cyan, 0.12)
                                                        : withAlpha(colors.accent.coral, 0.12),
                                                }]}>
                                                    {/* exDone keeps the functional cyan check. The
                                                        not-done barbell glyph is neutral (text.secondary)
                                                        rather than full lime — the lime active rail +
                                                        progress bars already carry the 10% accent, so the
                                                        icon stays a tinted/calm treatment (60/30/10). */}
                                                    <Ionicons
                                                        name={exDone ? 'checkmark-done' : 'barbell'}
                                                        size={22}
                                                        color={exDone ? colors.accent.cyan : colors.text.secondary}
                                                    />
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
                                                {/* Per-exercise set progress: a value-forward
                                                    "n/m" chip + a thin meter so the card carries
                                                    its own completion at a glance. */}
                                                <View style={styles.exMetaRow}>
                                                    <Text style={[typography.caption, {
                                                        color: exDone ? colors.accent.cyan : colors.text.secondary,
                                                        fontWeight: '600',
                                                    }]}>
                                                        {completedCount}/{ex.sets.length} sets
                                                    </Text>
                                                    <Text style={[typography.caption, { color: colors.text.tertiary }]}>
                                                        {isResolved && targetReps > 0
                                                            ? `· ${ex.sets.length} × ${targetReps}`
                                                            : `· ${ex.muscleGroup}`}
                                                    </Text>
                                                </View>
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
                            </Animated.View>
                        );
                    })}

                    {/* Empty state — never a blank screen. Icon + guidance + CTA via
                        the shared primitive, routed straight to the exercise browser.
                        Ternary-null (rendering-no-falsy-and): `length === 0` is a
                        boolean here, but the explicit ternary keeps a future numeric
                        edit from leaking a falsy 0 into the tree. */}
                    {exerciseStates.length === 0 ? (
                        <Animated.View entering={FadeIn.duration(360)}>
                            <EmptyState
                                icon="barbell-outline"
                                title="No exercises yet"
                                subtitle="Add your first move to this session and start logging sets."
                                actionLabel="Browse Exercises"
                                onAction={() => router.push('/(exercises)')}
                                style={{ paddingVertical: spacing['3xl'] }}
                            />
                        </Animated.View>
                    ) : null}

                    {/* Browse — a secondary affordance kept off the lime (lime is the
                        one primary FINISH action in the footer). Cyan dashed "add"
                        target, only shown when the session already has exercises (the
                        empty state already carries its own browse CTA). */}
                    {exerciseStates.length > 0 ? (
                        <TouchableOpacity
                            activeOpacity={0.7}
                            accessibilityRole="button"
                            accessibilityLabel="Browse exercises"
                            style={[styles.browseBtn, { borderColor: withAlpha(colors.accent.cyan, 0.5) }]}
                            onPress={() => router.push('/(exercises)')}
                        >
                            <Ionicons name="add" size={20} color={colors.accent.cyan} />
                            <Text style={[typography.subhead, { color: colors.accent.cyan, marginLeft: 8 }]}>
                                Add exercise
                            </Text>
                        </TouchableOpacity>
                    ) : null}
                </ScrollView>

                {/* ── Thumb-zone footer ───────────────────────────────────────
                    The single full-lime PRIMARY action lives here, in reach of the
                    thumb, with safe-area padding. Ink label (text.inverse) on the
                    lime fill — never white on lime. A frosted bar floats it above
                    the scroll so FINISH is always one tap away. */}
                <Animated.View style={[styles.footer, footerStyle, { paddingBottom: insets.bottom + spacing.md, borderTopColor: colors.border.default }]}>
                    <SafeBlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
                    <Button
                        variant="primary"
                        size="lg"
                        fullWidth
                        title={allSetsDone ? 'FINISH WORKOUT' : 'FINISH'}
                        onPress={handleEnd}
                        accessibilityLabel="Finish workout"
                        icon={<Ionicons name="flag" size={18} color={colors.text.inverse} />}
                    />
                </Animated.View>
            </View>

            {/* Initial Startup Countdown Overlay */}
            {isStarting && (
                <View style={[StyleSheet.absoluteFillObject, { zIndex: 1000 }]}>
                    <SafeBlurView intensity={80} tint="dark" style={[StyleSheet.absoluteFillObject, { justifyContent: 'center', alignItems: 'center' }]}>
                        {/* Decorative section label → text.secondary; the big lime
                            countdown numeral below stays the single key indicator. */}
                        <Text style={[typography.overline, { color: colors.text.secondary, marginBottom: 8 }]}>GET READY</Text>
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
                        <Text style={[typography.h3, { color: colors.text.primary, marginTop: 12, letterSpacing: 2 }]} maxFontSizeMultiplier={1.3}>
                            LET'S GO!
                        </Text>
                    </SafeBlurView>
                </View>
            )}

            {/* Rest Timer Modal — presented as a bottom sheet: a drag handle + an X
                give a clear dismiss affordance, and the content is safe-area padded.
                The primary SKIP action sits in the thumb zone. */}
            <Modal transparent visible={showRestTimer && !isStarting} animationType="slide" onRequestClose={() => setShowRestTimer(false)}>
                <View style={styles.sheetRoot}>
                    <SafeBlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
                    {/* Tapping the scrim dismisses (skips) rest, like the SKIP button. */}
                    <TouchableOpacity
                        style={StyleSheet.absoluteFill}
                        activeOpacity={1}
                        accessibilityRole="button"
                        accessibilityLabel="Dismiss rest timer"
                        onPress={() => setShowRestTimer(false)}
                    />
                    <Card
                        variant="glass"
                        noPadding
                        style={{
                            width: '100%',
                            borderTopLeftRadius: borderRadius['3xl'],
                            borderTopRightRadius: borderRadius['3xl'],
                            borderBottomLeftRadius: 0,
                            borderBottomRightRadius: 0,
                            borderColor: withAlpha(colors.accent.coral, 0.4),
                            ...shadows.glow(colors.accent.coral),
                            ...shadows.xl,
                        }}
                        accessibilityViewIsModal={true}
                        accessibilityLabel={`Rest timer. Up next: ${exerciseStates[restExerciseIdx]?.name ?? 'next exercise'}`}
                    >
                        <View style={[styles.sheetBody, { paddingBottom: insets.bottom + spacing.lg }]}>
                            {/* Drag handle + dismiss affordance */}
                            <View style={[styles.dragHandle, { backgroundColor: colors.border.light }]} />
                            <TouchableOpacity
                                style={styles.sheetClose}
                                accessibilityRole="button"
                                accessibilityLabel="Close rest timer"
                                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                                onPress={() => setShowRestTimer(false)}
                            >
                                <Ionicons name="close" size={22} color={colors.text.secondary} />
                            </TouchableOpacity>

                            {/* Decorative section label → text.secondary; the RestTimer's
                                lime progress ring below remains the key indicator. */}
                            <Text style={[typography.overline, { color: colors.text.secondary, marginBottom: spacing.lg }]}>
                                REST
                            </Text>

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
                                    // Always true inside this branch (the parent already
                                    // gates on `showRestTimer && !isStarting`); pass the
                                    // literal rather than a redundant re-check.
                                    isRunning={true}
                                    onFinish={() => setShowRestTimer(false)}
                                    size={184}
                                />
                            ) : null}

                            {/* UP NEXT, framed as a self-contained chip so the lifter
                                stays oriented through the rest: the next exercise +,
                                when known, its pending target in the same reps × weight
                                language as the focus hero (value-forward). */}
                            <View style={[styles.restNext, { backgroundColor: withAlpha(colors.background.tertiary, 0.6), borderColor: colors.border.default }]}>
                                <View style={{ flex: 1 }}>
                                    <Text style={[typography.overline, { color: colors.text.tertiary }]}>
                                        UP NEXT
                                    </Text>
                                    <Text style={[typography.subhead, { color: colors.text.primary, marginTop: 2 }]} numberOfLines={1} ellipsizeMode="tail">
                                        {exerciseStates[restExerciseIdx]?.name ?? 'next exercise'}
                                    </Text>
                                </View>
                                {(() => {
                                    // Pure lookup on the render path: the first still-
                                    // pending set of the rested exercise, shown as
                                    // reps × weight. Null/no-pending → render nothing.
                                    const ex = exerciseStates[restExerciseIdx];
                                    const s = ex?.sets.find((x) => !x.completed);
                                    if (!s) return null;
                                    return (
                                        <Text style={[styles.restTarget, { color: colors.text.primary }]} maxFontSizeMultiplier={1.2}>
                                            {s.reps}
                                            <Text style={[styles.restTargetUnit, { color: colors.text.tertiary }]}>×</Text>
                                            {s.kg > 0 ? s.kg : 'BW'}
                                            {s.kg > 0 ? <Text style={[styles.restTargetUnit, { color: colors.text.tertiary }]}> kg</Text> : null}
                                        </Text>
                                    );
                                })()}
                            </View>

                            <View style={styles.modalActions}>
                                <TouchableOpacity
                                    activeOpacity={0.85}
                                    accessibilityRole="button"
                                    accessibilityLabel="Add 15 seconds"
                                    style={[styles.restChip, { backgroundColor: colors.background.tertiary, borderWidth: 1, borderColor: colors.border.default }]}
                                    onPress={() => setRestSeconds(prev => prev + 15)}
                                >
                                    <Ionicons name="add" size={18} color={colors.text.primary} />
                                    <Text style={[typography.subhead, { color: colors.text.primary }]}>15s</Text>
                                </TouchableOpacity>
                                <Button
                                    variant="primary"
                                    size="lg"
                                    title="SKIP REST"
                                    style={{ flex: 1.6 }}
                                    accessibilityLabel="Skip rest"
                                    iconRight={<Ionicons name="play-skip-forward" size={18} color={colors.text.inverse} />}
                                    onPress={() => setShowRestTimer(false)}
                                />
                            </View>
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
    header: { paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    headerClock: { flexDirection: 'row', alignItems: 'center' },
    // Wrapper that hosts the pulsing beacon (its halo extends past the core dot,
    // so a slight negative left margin keeps the visual dot optically aligned).
    liveDot: { marginLeft: -8, marginRight: 4 },
    timer: { fontFamily: typo.statMedium.fontFamily, fontSize: 34, lineHeight: 40, marginTop: 2 },
    headerTally: { alignItems: 'flex-end' },
    tallyValue: { fontFamily: typo.statMedium.fontFamily, fontSize: 26, lineHeight: 30 },
    tallyTotal: { fontFamily: typo.statSmall.fontFamily, fontSize: 16 },
    headerTrack: { height: 4, borderRadius: 2, marginTop: 12, overflow: 'hidden' },
    headerFill: { height: 4, borderRadius: 2 },

    // Focus hero
    focus: { padding: 18 },
    focusTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    focusValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginVertical: 2 },
    // The dominant beat of the screen — big condensed numerals so the target
    // reads first and its unit/label stay quiet (value>label).
    focusValue: { fontFamily: typo.statLarge.fontFamily, fontSize: 52, lineHeight: 56 },
    focusValueUnit: { fontFamily: typo.statTiny.fontFamily, fontSize: 16 },
    focusMult: { fontFamily: typo.statSmall.fontFamily, fontSize: 24 },
    focusTrack: { height: 6, borderRadius: 3, marginTop: 16, overflow: 'hidden' },
    focusFill: { height: 6, borderRadius: 3 },
    focusDotsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 12 },
    focusCount: { fontFamily: typo.statSmall.fontFamily, fontSize: 18, lineHeight: 20 },
    focusCountTotal: { fontFamily: typo.statTiny.fontFamily, fontSize: 13 },
    focusDoneRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 4 },
    focusDoneIcon: { width: 52, height: 52, borderRadius: 26, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    focusDoneTitle: { fontFamily: typo.h3.fontFamily, fontSize: 22, lineHeight: 26 },

    // Exercise cards
    exHeader: { padding: 16, paddingLeft: 18, minHeight: 64, justifyContent: 'center' },
    exTitleRow: { flexDirection: 'row', alignItems: 'center' },
    exMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
    cardRail: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, borderTopLeftRadius: 20, borderBottomLeftRadius: 20 },
    iconBox: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    exContent: { paddingHorizontal: 16, paddingBottom: 16 },
    // The per-set entry rows (setRow/setNum/setInput/checkBtn/removeSetBtn/
    // addSetBtn + their rowLabel/label header) used to live here when this screen
    // owned an inline set grid. That entry surface is now the hardened
    // <SetLogger/> (which carries its own styles), so those orphaned keys were
    // removed — no dead StyleSheet entries left behind.

    browseBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        paddingVertical: 14, borderWidth: 1, borderRadius: 20, borderStyle: 'dashed',
        marginTop: 8,
    },

    // Thumb-zone footer
    footer: {
        position: 'absolute', left: 0, right: 0, bottom: 0,
        paddingHorizontal: 20, paddingTop: 12,
        borderTopWidth: 1,
    },

    // Startup countdown
    countdownNum: { fontFamily: typo.statLarge.fontFamily, fontSize: 120, lineHeight: 130 },

    // Rest sheet
    sheetRoot: { flex: 1, justifyContent: 'flex-end' },
    sheetBody: { paddingHorizontal: 24, paddingTop: 12, alignItems: 'center' },
    dragHandle: { width: 40, height: 4, borderRadius: 2, marginBottom: 18 },
    sheetClose: { position: 'absolute', top: 14, right: 16, width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    // UP NEXT chip: full-width inside the centered sheet body, exercise label on
    // the left and its pending reps × weight target on the right.
    restNext: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        alignSelf: 'stretch', marginTop: 16,
        paddingHorizontal: 16, paddingVertical: 12,
        borderRadius: 16, borderWidth: 1,
    },
    restTarget: { fontFamily: typo.statSmall.fontFamily, fontSize: 26, lineHeight: 30 },
    restTargetUnit: { fontFamily: typo.statTiny.fontFamily, fontSize: 14 },
    modalActions: { flexDirection: 'row', gap: 12, marginTop: 16, alignSelf: 'stretch' },
    restChip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, flex: 1, height: 56, borderRadius: 16 },
});
