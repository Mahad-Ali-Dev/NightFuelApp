import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '@/theme';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Skeleton, EmptyState } from '@/components/ui';
import { withAlpha } from '@/theme/utils';
import { shadows } from '@/theme/shadows';
import { typography as themeTypography } from '@/theme/typography';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getActiveSession, getLastSet, logSessionExercise, endSession, LastSet, SessionExercise } from '@/api/exercises';
import { ExerciseDemo } from '@/components/exercise/ExerciseDemo';
import { RestTimer } from '@/components/workout/RestTimer';
import { SetLogger } from '@/components/workout/SetLogger';
import { resolveDemo, resolveDemoFrames } from '@/constants/exerciseDemos';
import { getCuratedDemo, getCuratedDemoFrames } from '@/constants/curatedDemos';

// Default rest length started when a set is completed/logged. Drives the
// hardened <RestTimer/> in the rest banner (which owns its own countdown).
const REST_SECONDS = 90;

// Bundled neutral placeholder shown when an exercise has no demo media (no
// network hit). Reuses the SAME bundled asset the exercise-detail screen
// (app/(exercises)/[id].tsx) hands to <ExerciseDemo/> — no new asset added.
const DEMO_FALLBACK_IMAGE = require('../../assets/images/exercise-detail-fallback.png');

// The demo-source inputs we feed <ExerciseDemo/> for one exercise. Each slot is
// independently null so the precedence walk below falls through cleanly when no
// source resolves. Mirrors the shape used in app/(exercises)/[id].tsx.
type DemoInputs = {
    frames: readonly string[] | null;
    tutorialUrl: string | null;
    gifUrl: string | null;
};

// Resolve the demo-source inputs for an exercise NAME using the SAME precedence
// as app/(exercises)/[id].tsx: the existing resolveDemoFrames/resolveDemo win,
// and the curated map (getCuratedDemo) is consulted ONLY when both miss —
// strictly additive coverage, never overriding an existing demo. Pure data
// lookup (no network, no side effects); the CDN frame loads happen inside
// <ExerciseDemo/>, which handles onError → bundled fallback.
function resolveDemoInputs(name: string): DemoInputs {
    const existingFrames = resolveDemoFrames({ name });
    const existingUrl = resolveDemo({ name });
    if (existingFrames || existingUrl) {
        return { frames: existingFrames, tutorialUrl: existingUrl, gifUrl: null };
    }
    const curated = getCuratedDemo(name);
    if (!curated) {
        return { frames: null, tutorialUrl: null, gifUrl: null };
    }
    if (curated.kind === 'fedb_frames') {
        // Only feed the animated-loop slot a non-empty list of real frame URLs;
        // a malformed entry falls through so <ExerciseDemo/> shows the still +
        // honest "coming soon" rather than an empty/never-resolving player.
        const curatedFrames = getCuratedDemoFrames(name);
        const validFrames = curatedFrames?.filter(
            (u): u is string => typeof u === 'string' && u.trim().length > 0,
        );
        if (validFrames && validFrames.length > 0) {
            return { frames: validFrames, tutorialUrl: null, gifUrl: null };
        }
        return { frames: null, tutorialUrl: null, gifUrl: null };
    }
    if (curated.kind === 'youtube') {
        // No in-app frames — surfaces only as the "Full tutorial" deep-link.
        return { frames: null, tutorialUrl: curated.url, gifUrl: null };
    }
    // curated.kind === 'gif' — single static still fed via the gifUrl slot.
    const gifUrl = typeof curated.url === 'string' && curated.url.trim().length > 0 ? curated.url : null;
    return { frames: null, tutorialUrl: null, gifUrl };
}

type LocalSet = { weight: string; reps: string; done: boolean };
type LocalExercise = { id: string; name: string; sets: number; targetReps: string; loggedSets: LocalSet[] };

// Coerce an UNTRUSTED number to a finite value at or above `min` (default 0),
// else `min`. THIS screen's set model carries weight/reps as free-text strings
// (LocalSet.weight/reps), so the finish-time logging + summary math run
// `Number(s.weight)` through here: a blank/garbled field is NaN, and a guarded
// reduce seeded at 0 avoids `Math.max()`-of-empty → -Infinity. Mirrors the same
// helper app/training/workout.tsx uses so the modal's Finish produces the SAME
// finite/clamped totals as the routed twin — never a "NaN"/"-Infinity" summary.
const finite = (n: unknown, min = 0): number =>
    typeof n === 'number' && Number.isFinite(n) && n >= min ? n : min;

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

type ExerciseCardProps = {
    exercise: LocalExercise;
    exIndex: number;
    /** Most-recent cross-session set for this exercise, or null when none. */
    lastSet: LastSet | null;
    onToggleSet: (exIndex: number, setIndex: number) => void;
    onUpdateSet: (exIndex: number, setIndex: number, field: 'weight' | 'reps', val: string) => void;
    /**
     * Append a VALIDATED extra set to this exercise. Routed from the hardened
     * <SetLogger/> (revealed by "Add Set"), so junk never reaches here — only a
     * finite reps>=1 / weightKg>=0 entry that passed SetLogger's guard.
     */
    onLogExtraSet: (exIndex: number, setData: { reps: number; weightKg: number }) => void;
};

/**
 * One exercise in the active workout: a compact in-app demo (animated FEDB frame
 * pair, curated still + "Full tutorial" link, or the honest "coming soon" state —
 * resolved via {@link resolveDemoInputs}, the SAME precedence the exercise-detail
 * screen uses) followed by the set-logging rows, the previous-set hints, and the
 * "Add Set" control — which reveals the hardened <SetLogger/> (validated entry).
 */
function ExerciseCard({ exercise: ex, exIndex, lastSet, onToggleSet, onUpdateSet, onLogExtraSet }: ExerciseCardProps) {
    const { colors, typography } = useTheme();
    // Memoize the per-exercise demo resolution so the precedence walk + curated
    // lookup only re-runs when the exercise NAME changes (the resolvers key on it).
    const demo = useMemo(() => resolveDemoInputs(ex.name), [ex.name]);
    // "Add Set" reveals the validated <SetLogger/> for THIS card (collapsed by
    // default so the card stays scannable and no duplicate exercise title shows).
    const [adding, setAdding] = useState(false);

    return (
        <Card variant="glass" style={styles.exerciseCard}>
            {/* Compact in-app demo. <ExerciseDemo/> self-contains the still /
                animated / "coming soon" states and never renders an empty player. */}
            <View style={styles.demoWrap}>
                <ExerciseDemo
                    frames={demo.frames}
                    gifUrl={demo.gifUrl}
                    imageUrl={null}
                    fallback={DEMO_FALLBACK_IMAGE}
                    tutorialUrl={demo.tutorialUrl}
                />
            </View>
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
                // Previous-set hint. For the FIRST set we show a REAL
                // cross-session value sourced from the analytics endpoint
                // (lastSet, most-recent completed set). For later
                // sets we keep the in-session prior set. Only ever show real
                // values — never a fabricated number — and fall back to '-'
                // when there is genuinely no history and no in-session value.
                let prevSet = '-';
                if (sIndex === 0) {
                    if (lastSet) prevSet = `last time: ${lastSet.weightKg}x${lastSet.reps}`;
                } else {
                    const prev = ex.loggedSets[sIndex - 1];
                    if (prev && prev.weight && prev.reps) prevSet = `${prev.weight}x${prev.reps}`;
                }
                return (
                    <View key={sIndex} style={[styles.setRow, s.done && { backgroundColor: withAlpha(colors.accent.cyan, 0.1) }]}>
                        <View style={{ width: 32 }}>
                            <Text style={[typography.subhead, { color: colors.text.secondary }]}>{sIndex + 1}</Text>
                            <Text numberOfLines={1} style={[typography.overline, { color: colors.text.tertiary, fontSize: 9 }]}>{prevSet}</Text>
                        </View>

                        <View style={styles.inputBox}>
                            <TextInput
                                style={[styles.numericInput, { color: colors.text.primary, borderBottomColor: colors.border.default }]}
                                keyboardType="numeric"
                                accessibilityLabel={`Weight (kg), set ${sIndex + 1}`}
                                value={s.weight}
                                onChangeText={(val) => onUpdateSet(exIndex, sIndex, 'weight', val)}
                                placeholder={sIndex === 0 ? "135" : ex.loggedSets[sIndex - 1]?.weight || "-"}
                                placeholderTextColor={colors.text.tertiary}
                            />
                        </View>

                        <View style={styles.inputBox}>
                            <TextInput
                                style={[styles.numericInput, { color: colors.text.primary, borderBottomColor: colors.border.default }]}
                                keyboardType="numeric"
                                accessibilityLabel={`Reps, set ${sIndex + 1}`}
                                value={s.reps}
                                onChangeText={(val) => onUpdateSet(exIndex, sIndex, 'reps', val)}
                                placeholder={ex.targetReps.split('-')[0]}
                                placeholderTextColor={colors.text.tertiary}
                            />
                        </View>

                        <TouchableOpacity activeOpacity={0.85} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Complete set" accessibilityState={{ selected: s.done }}
                            onPress={() => onToggleSet(exIndex, sIndex)}
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

            <TouchableOpacity
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={adding ? 'Hide add set' : 'Add set'}
                accessibilityState={{ expanded: adding }}
                onPress={() => setAdding(v => !v)}
                style={styles.addSetBtn}
            >
                <Text style={[typography.subhead, { color: adding ? colors.accent.cyan : colors.text.secondary, textAlign: 'center' }]}>
                    {adding ? 'Done adding' : '+ Add Set'}
                </Text>
            </TouchableOpacity>

            {/* Validated set entry. The hardened <SetLogger/> rejects junk
                (Number.isFinite + reps>=1 / weightKg>=0) before its onLogSet
                fires, so only a valid set reaches onLogExtraSet. Remounted by a
                key tied to the current set count so its transient buffer never
                double-lists what we've already appended to the card rows. */}
            {adding ? (
                <View style={styles.addSetLogger}>
                    <SetLogger
                        key={`setlogger-${ex.loggedSets.length}`}
                        exerciseName={ex.name}
                        targetSets={Math.max(1, ex.sets)}
                        onLogSet={(setData) => onLogExtraSet(exIndex, setData)}
                    />
                </View>
            ) : null}
        </Card>
    );
}

export default function ActiveWorkoutScreen() {
    const { colors, typography, spacing } = useTheme();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const queryClient = useQueryClient();

    const [timer, setTimer] = useState(0);
    // Rest state as GROUND TRUTH (state-ground-truth): `restActive` is whether a
    // rest is in progress; the per-second countdown + MM:SS are owned by the
    // hardened <RestTimer/> in the banner, not mirrored here. `restKey` bumps on
    // each new set so the banner timer remounts and re-arms a fresh REST_SECONDS.
    const [restActive, setRestActive] = useState(false);
    const [restKey, setRestKey] = useState(0);
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

    // Cross-session "previous set" history. The active-session payload only
    // carries the *plan* for this workout — it has no record of what was lifted
    // last time. So we batch-fetch the most-recent set for every exercise in the
    // session from the existing analytics endpoint and key it by name. Each
    // entry is the real last weight x reps, or null when there's no history
    // (callers fall back to the in-session value, then '-'; never a fabrication).
    const exerciseNames = exercises.map(ex => ex.name).filter(Boolean);
    const { data: lastSets } = useQuery({
        // Sorted + joined so the key is stable regardless of seed order.
        queryKey: ['exercise-last-sets', [...exerciseNames].sort()],
        queryFn: async (): Promise<Record<string, LastSet | null>> => {
            const unique = Array.from(new Set(exerciseNames));
            const entries = await Promise.all(
                unique.map(async (name): Promise<[string, LastSet | null]> => {
                    try {
                        return [name, await getLastSet(name)];
                    } catch {
                        // A single exercise's history failing must not blank out
                        // the others — treat it as "no history" for that name.
                        return [name, null];
                    }
                }),
            );
            return Object.fromEntries(entries);
        },
        enabled: exerciseNames.length > 0,
        staleTime: 5 * 60 * 1000,
    });

    // Global elapsed timer
    useEffect(() => {
        const interval = setInterval(() => {
            setTimer(t => t + 1);
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    // Rest is driven by the hardened <RestTimer/> rendered in the banner below —
    // it owns the per-second countdown and fires onFinish at zero. No local
    // interval here (the previous inline effect registered its cleanup INSIDE the
    // `if (restRemaining > 0)` branch, leaking the last tick).
    const startRest = () => {
        // Bump the key so the banner <RestTimer/> remounts and re-arms a fresh
        // REST_SECONDS even when a previous rest had already finished.
        setRestKey(k => k + 1);
        setRestActive(true);
    };
    const stopRest = () => setRestActive(false);
    // RestTimer fires onFinish from INSIDE its own state updater (it calls the
    // callback within setRemaining as it crosses zero). Updating our state
    // straight from there would be a setState-during-another-component's-render
    // ("Cannot update a component while rendering a different component"), so we
    // defer the stop to the next macrotask — out of RestTimer's render phase.
    const handleRestFinish = () => {
        setTimeout(stopRest, 0);
    };

    const toggleSet = (exIndex: number, setIndex: number) => {
        // The rest decision reads the current render's snapshot (a tap handler is
        // recreated each render with fresh `exercises`); the STATE change goes
        // through a pure updater that rebuilds the touched exercise AND its sets
        // array — no in-place mutation of the shared set object — per
        // react-state-dispatcher / state-ground-truth.
        const willBeDone = !exercises[exIndex]?.loggedSets?.[setIndex]?.done;
        setExercises(prev => prev.map((ex, i) => {
            if (i !== exIndex) return ex;
            if (!ex.loggedSets[setIndex]) return ex;
            return {
                ...ex,
                loggedSets: ex.loggedSets.map((s, j) =>
                    j === setIndex ? { ...s, done: !s.done } : s,
                ),
            };
        }));
        // Completing a set starts a rest cycle; un-completing stops it.
        if (willBeDone) startRest();
        else stopRest();
    };

    const updateSet = (exIndex: number, setIndex: number, field: 'weight' | 'reps', val: string) => {
        setExercises(prev => prev.map((ex, i) => {
            if (i !== exIndex) return ex;
            if (!ex.loggedSets[setIndex]) return ex;
            return {
                ...ex,
                loggedSets: ex.loggedSets.map((s, j) =>
                    j === setIndex ? { ...s, [field]: val } : s,
                ),
            };
        }));
    };

    // Append a VALIDATED extra set (from <SetLogger/>) to an exercise as a done
    // row, then start a rest cycle — same "completed a set" semantics as the
    // checkmark. SetLogger has already rejected junk, so the numbers are sound.
    const logExtraSet = (exIndex: number, setData: { reps: number; weightKg: number }) => {
        setExercises(prev => prev.map((ex, i) => {
            if (i !== exIndex) return ex;
            return {
                ...ex,
                loggedSets: [
                    ...ex.loggedSets,
                    { weight: String(setData.weightKg), reps: String(setData.reps), done: true },
                ],
            };
        }));
        startRest();
    };

    // Persist the workout then navigate to the summary. Mirrors the routed twin
    // app/training/workout.tsx `handleEnd`, mapped to THIS screen's model:
    // exercises[].loggedSets (LocalSet = { weight:string, reps:string, done:boolean }).
    // The bare `router.back()` this button used to call silently DISCARDED every
    // logged set; now each completed exercise is logged via logSessionExercise,
    // the session is ended, the active-session + exercise-history caches are
    // invalidated, and we `router.replace` (not back) to the completion summary
    // with finite-guarded totals.
    const handleFinish = async () => {
        // Snapshot the in-render state (this handler is recreated each render with
        // fresh `exercises`/`timer`, matching how toggleSet reads its snapshot).
        const finishedExercises = exercises;
        const finalElapsed = timer;

        // Real session metrics for the summary screen. Each free-text weight/reps
        // is parsed via Number() then run through `finite` (NaN/negatives → 0), and
        // the rounded total is itself clamped finite/>=0 — so a blank/garbled field
        // can never surface a "NaN"/"-Infinity" volume. Same shape as workout.tsx.
        const elapsed = String(Math.max(0, finite(finalElapsed)));
        const volume = String(
            Math.max(
                0,
                finite(
                    Math.round(
                        finishedExercises.reduce(
                            (acc, ex) =>
                                acc +
                                ex.loggedSets
                                    .filter(s => s.done)
                                    .reduce((a, s) => a + finite(Number(s.weight)) * finite(Number(s.reps)), 0),
                            0,
                        ),
                    ),
                ),
            ),
        );
        const kcal = String(Math.max(0, finite(Math.round((finite(finalElapsed) / 60) * 6)))); // ≈6 kcal/min for resistance training
        const summaryParams = { elapsed, volume, kcal };

        const sessionId = session?.id;

        // No active session id (e.g. session never loaded): skip the api calls but
        // still navigate to the summary so a finished workout never dead-ends.
        if (sessionId) {
            // Log each exercise that has at least one completed set. Each call has
            // its OWN try/catch so a single failure never aborts the rest (matching
            // workout.tsx). SetLogger-appended rows are already-validated; the
            // checkmark-completed rows are parsed defensively through finite().
            const logPromises = finishedExercises.map(async (ex) => {
                const completedSets = ex.loggedSets.filter(s => s.done);
                if (completedSets.length === 0) return;
                try {
                    await logSessionExercise(sessionId, {
                        exerciseName: ex.name,
                        sets: completedSets.length,
                        // avg reps over a floor-of-1 denominator so this can never
                        // divide by zero / yield NaN even if the guard above were
                        // bypassed.
                        reps: Math.round(
                            completedSets.reduce((a, s) => a + finite(Number(s.reps)), 0) /
                                Math.max(1, completedSets.length),
                        ),
                        // max weight via a guarded reduce seeded at 0 (not
                        // Math.max(...) which is -Infinity for an empty list).
                        weightKg: completedSets.reduce((m, s) => Math.max(m, finite(Number(s.weight))), 0),
                        durationSecs: 0,
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

            // The active-session query and the exercise-history list, so the next
            // read reflects the just-ended session. The history list (see
            // app/(exercises)/history.tsx:25) reads queryKey ['exercise-history'];
            // React-Query matches keys positionally from index 0, so this must be
            // that exact single-element key (not ['exercises', 'history'], which
            // never matches and leaves the list stale until staleTime expires).
            queryClient.invalidateQueries({ queryKey: ['active-session'] });
            queryClient.invalidateQueries({ queryKey: ['exercise-history'] });
        }

        router.replace({ pathname: '/training/complete', params: summaryParams });
    };

    const formatTime = (secs: number) => {
        const m = Math.floor(secs / 60).toString().padStart(2, '0');
        const s = (secs % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    };

    return (
        <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background.primary }]}>
            <StatusBar style="light" />
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.border.default }]}>
                <View>
                    <Text style={[typography.h2, { color: colors.text.primary }]}>Night Shift Prep</Text>
                    <View style={styles.headerMeta}>
                        <Text style={[typography.statTiny, { color: colors.accent.coral }]}>{formatTime(timer)}</Text>
                        <Text style={[typography.caption, { color: colors.text.secondary }]}>• Hypertrophy</Text>
                    </View>
                </View>
                <Button title="Finish" onPress={handleFinish} size="sm" style={{ paddingHorizontal: 16 }} />
            </View>

            {/* Rest banner — the per-second countdown + MM:SS are owned by the
                hardened <RestTimer/> (it fires onFinish at zero, which clears the
                rest). Same Aurora cyan banner styling/position; the timer icon and
                Close control are preserved (Close stops the rest cycle). */}
            {restActive ? (
                <View style={[styles.restBanner, { backgroundColor: withAlpha(colors.accent.cyan, 0.1), borderBottomColor: withAlpha(colors.accent.cyan, 0.25) }, shadows.glow(colors.accent.cyan)]}>
                    <Ionicons name="timer" size={24} color={colors.accent.cyan} />
                    <Text style={[typography.statTiny, { color: colors.accent.cyan, marginLeft: 12 }]}>Rest</Text>
                    <View style={styles.restTimerWrap}>
                        <RestTimer
                            key={`rest-${restKey}`}
                            durationSeconds={REST_SECONDS}
                            isRunning={restActive}
                            onFinish={handleRestFinish}
                            size={92}
                        />
                    </View>
                    <TouchableOpacity activeOpacity={0.85} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Close" onPress={stopRest} style={{ padding: 8 }}>
                        <Ionicons name="close" size={20} color={colors.accent.cyan} />
                    </TouchableOpacity>
                </View>
            ) : null}

            <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 100 }}>
                {sessionLoading && exercises.length === 0 ? (
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
                ) : null}

                {sessionError && exercises.length === 0 ? (
                    <EmptyState
                        icon="cloud-offline-outline"
                        title="Couldn't load workout"
                        subtitle="We couldn't reach your active session. Check your connection and try again."
                        actionLabel="Retry"
                        onAction={() => refetchSession()}
                    />
                ) : null}

                {!sessionLoading && !sessionError && exercises.length === 0 ? (
                    <EmptyState
                        icon="barbell-outline"
                        title="No exercises yet"
                        subtitle="Add your first exercise to start logging this workout."
                    />
                ) : null}

                {exercises.map((ex, exIndex) => (
                    <ExerciseCard
                        key={ex.id}
                        exercise={ex}
                        exIndex={exIndex}
                        lastSet={lastSets?.[ex.name] ?? null}
                        onToggleSet={toggleSet}
                        onUpdateSet={updateSet}
                        onLogExtraSet={logExtraSet}
                    />
                ))}

                {/* Honest, functional action: browse the exercise catalogue to add
                    one (same destination the routed workout screen uses) — never a
                    silent no-op handler. */}
                <Button
                    title="Add Exercise"
                    variant="outline"
                    icon={<Ionicons name="add" size={20} color={colors.text.primary} />}
                    onPress={() => router.push('/(exercises)')}
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
    // Centers the <RestTimer/> ring in the banner, taking the slack between the
    // leading icon/label and the trailing Close control.
    restTimerWrap: {
        flex: 1,
        alignItems: 'center',
    },
    exerciseCard: {
        padding: 16,
        marginBottom: 24,
    },
    // Compact demo band: pull the 320px-tall <ExerciseDemo/> flush to the card's
    // top/side edges and crop it to a shorter strip so the card stays scannable.
    // Height 220 (vs. the original 168) keeps full-body lifts — squats, deadlifts,
    // overhead presses — legible by leaving the legs/bar in frame instead of
    // cropping them off, while still being short enough that the set-logging rows
    // stay above the fold on a standard phone viewport.
    // overflow:'hidden' clips both the crop and the card's rounded corners.
    demoWrap: {
        height: 220,
        marginTop: -16,
        marginHorizontal: -16,
        marginBottom: 16,
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        overflow: 'hidden',
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
    },
    // Spacing wrapper for the revealed <SetLogger/> (the component owns its own
    // card surface, padding, and border).
    addSetLogger: {
        marginTop: 8,
    },
});
