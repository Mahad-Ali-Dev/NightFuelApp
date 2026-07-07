import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '@/theme';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { CircularProgress } from '@/components/ui/CircularProgress';
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
import { invalidateWorkoutCaches } from '@/utils/invalidateWorkoutCaches';

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
 * Small derived stat tile for the hero stat grid. PURELY presentational — it
 * receives already-computed numbers (session volume / sets / pace), renders no
 * data of its own, registers no handler, and touches no query. Satisfies the
 * Zeitra stat-card + grid pattern; the colored glyph sits in a low-alpha tint
 * chip of the accent (withAlpha bg + accent glyph), per brand.
 */
function StatTile({
    icon,
    value,
    unit,
    label,
    accent,
}: {
    icon: keyof typeof Ionicons.glyphMap;
    value: string;
    unit?: string;
    label: string;
    accent: string;
}) {
    const { colors, typography } = useTheme();
    return (
        <View style={[styles.statTile, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
            <View style={[styles.statChip, { backgroundColor: withAlpha(accent, 0.16) }]}>
                <Ionicons name={icon} size={15} color={accent} />
            </View>
            <View style={styles.statValueRow}>
                <Text style={[typography.statSmall, { color: colors.text.primary }]} numberOfLines={1} adjustsFontSizeToFit>
                    {value}
                </Text>
                {unit ? (
                    <Text style={[typography.caption, { color: colors.text.tertiary, marginLeft: 3, marginBottom: 3 }]}>{unit}</Text>
                ) : null}
            </View>
            <Text style={[typography.overline, { color: colors.text.tertiary }]} numberOfLines={1}>
                {label}
            </Text>
        </View>
    );
}

/**
 * Compact horizontal "exercise rail" — a snapping carousel of pills, one per
 * exercise in the session, each showing the exercise name and a derived
 * "done / total" set count. PURELY presentational overview (it changes no data,
 * registers no new handler) so the logic contract is untouched; it satisfies the
 * Zeitra carousel pattern and lets the lifter see the whole session at a glance.
 */
function ExerciseRail({ exercises }: { exercises: LocalExercise[] }) {
    const { colors, typography } = useTheme();
    if (exercises.length === 0) return null;
    return (
        <Animated.View entering={FadeInDown.delay(140).duration(420)}>
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                decelerationRate="fast"
                snapToInterval={172}
                snapToAlignment="start"
                contentContainerStyle={styles.railContent}
            >
                {exercises.map((ex, i) => {
                    const total = ex.loggedSets.length;
                    const done = ex.loggedSets.filter(s => s.done).length;
                    const complete = total > 0 && done >= total;
                    const ratio = total > 0 ? done / total : 0;
                    return (
                        <View
                            key={ex.id}
                            style={[
                                styles.railPill,
                                {
                                    backgroundColor: colors.background.secondary,
                                    borderColor: complete ? colors.accent.coral : colors.border.default,
                                },
                                complete && shadows.glow(colors.accent.coral),
                            ]}
                        >
                            <View style={styles.railPillTop}>
                                <View style={[styles.railIndex, { backgroundColor: complete ? colors.accent.coral : withAlpha(colors.accent.coral, 0.14) }]}>
                                    <Text style={[typography.overline, { color: complete ? colors.text.inverse : colors.accent.coral, fontSize: 10 }]}>
                                        {String(i + 1).padStart(2, '0')}
                                    </Text>
                                </View>
                                <Ionicons
                                    name={complete ? 'checkmark-circle' : 'ellipse-outline'}
                                    size={16}
                                    color={complete ? colors.accent.coral : colors.text.tertiary}
                                />
                            </View>
                            <Text numberOfLines={1} style={[typography.subhead, { color: colors.text.primary, marginTop: 10, letterSpacing: 0.2 }]}>
                                {ex.name}
                            </Text>
                            <Text style={[typography.caption, { color: complete ? colors.accent.coral : colors.text.secondary, marginTop: 2 }]}>
                                {done}/{total} sets
                            </Text>
                            {/* Mini lime progress sliver — same done-flag ground truth. */}
                            <View style={[styles.railTrack, { backgroundColor: colors.background.tertiary }]}>
                                <View style={[styles.railFill, { width: `${Math.round(ratio * 100)}%`, backgroundColor: colors.accent.coral }]} />
                            </View>
                        </View>
                    );
                })}
            </ScrollView>
        </Animated.View>
    );
}

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

    // Derived set progress (state-ground-truth): the lime progress bar + the
    // "N / M" counter both read straight off the done flags, no parallel counter.
    const totalSets = ex.loggedSets.length;
    const doneSets = ex.loggedSets.filter(s => s.done).length;
    const progress = totalSets > 0 ? doneSets / totalSets : 0;
    const complete = totalSets > 0 && doneSets >= totalSets;

    return (
        <Card variant="glass" style={[styles.exerciseCard, complete && { borderColor: withAlpha(colors.accent.coral, 0.55) }]}>
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
                {/* Bottom scrim + floating set-count chip so the title/progress sit
                    legibly over any demo frame without touching <ExerciseDemo/>. */}
                <View pointerEvents="none" style={styles.demoScrim} />
                {/* Leading exercise-index marker, floated over the demo. */}
                <View style={[styles.demoIndex, { backgroundColor: withAlpha(colors.background.primary, 0.72), borderColor: colors.border.light }]}>
                    <Text style={[typography.overline, { color: colors.accent.coral }]}>{String(exIndex + 1).padStart(2, '0')}</Text>
                </View>
                <View style={[styles.demoBadge, { backgroundColor: withAlpha(colors.background.primary, 0.72), borderColor: colors.border.light }]}>
                    <Ionicons name="barbell" size={13} color={colors.accent.coral} />
                    <Text style={[typography.overline, { color: colors.text.primary, marginLeft: 6 }]}>
                        {doneSets}/{totalSets} SETS
                    </Text>
                </View>
            </View>

            <View style={styles.exHeader}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                    <Text style={[typography.h3, { color: colors.text.primary }]}>{ex.name}</Text>
                    <View style={styles.exTargetRow}>
                        <Ionicons name="flag-outline" size={13} color={colors.text.tertiary} />
                        <Text style={[typography.caption, { color: colors.text.secondary, marginLeft: 5 }]}>
                            Target: {ex.targetReps} reps
                        </Text>
                    </View>
                </View>
                <TouchableOpacity activeOpacity={0.85} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="More options" style={[styles.exMore, { borderColor: colors.border.light }]}>
                    <Ionicons name="ellipsis-horizontal" size={18} color={colors.text.secondary} />
                </TouchableOpacity>
            </View>

            {/* Lime set-progress bar — derived from the done flags. */}
            <View style={[styles.progressTrack, { backgroundColor: colors.background.tertiary }]}>
                <View
                    style={[
                        styles.progressFill,
                        { width: `${Math.round(progress * 100)}%`, backgroundColor: colors.accent.coral },
                        progress > 0 && shadows.glow(colors.accent.coral),
                    ]}
                />
            </View>

            <View style={styles.setHeaderRow}>
                <Text style={[typography.overline, { color: colors.text.tertiary, width: 36 }]}>SET</Text>
                <Text style={[typography.overline, { color: colors.text.tertiary, flex: 1, textAlign: 'center' }]}>KG</Text>
                <Text style={[typography.overline, { color: colors.text.tertiary, flex: 1, textAlign: 'center' }]}>REPS</Text>
                <View style={{ width: 48 }} />
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
                    <View
                        key={sIndex}
                        style={[
                            styles.setRow,
                            {
                                backgroundColor: s.done ? withAlpha(colors.accent.coral, 0.1) : colors.background.tertiary,
                                borderColor: s.done ? withAlpha(colors.accent.coral, 0.4) : 'transparent',
                            },
                        ]}
                    >
                        <View style={{ width: 36 }}>
                            <Text style={[typography.statTiny, { color: s.done ? colors.accent.coral : colors.text.primary }]}>{sIndex + 1}</Text>
                            <Text numberOfLines={1} style={[typography.overline, { color: colors.text.tertiary, fontSize: 9, letterSpacing: 0.4 }]}>{prevSet}</Text>
                        </View>

                        <View style={styles.inputBox}>
                            <TextInput
                                style={[styles.numericInput, { color: colors.text.primary, backgroundColor: colors.background.secondary, borderColor: s.done ? withAlpha(colors.accent.coral, 0.4) : colors.border.default }]}
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
                                style={[styles.numericInput, { color: colors.text.primary, backgroundColor: colors.background.secondary, borderColor: s.done ? withAlpha(colors.accent.coral, 0.4) : colors.border.default }]}
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
                                s.done ? { backgroundColor: colors.accent.coral } : { backgroundColor: colors.background.secondary, borderWidth: 1, borderColor: colors.border.light },
                                s.done && shadows.glow(colors.accent.coral),
                            ]}
                        >
                            <Ionicons name="checkmark" size={22} color={s.done ? colors.text.inverse : colors.text.tertiary} />
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
                style={[
                    styles.addSetBtn,
                    { borderColor: adding ? colors.accent.coral : colors.border.light },
                ]}
            >
                <Ionicons name={adding ? 'checkmark' : 'add'} size={18} color={adding ? colors.accent.coral : colors.text.secondary} />
                <Text style={[typography.subhead, { color: adding ? colors.accent.coral : colors.text.secondary, marginLeft: 6 }]}>
                    {adding ? 'Done adding' : 'Add Set'}
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

            // Refresh EVERY workout-derived reader in one place so the next read
            // reflects the just-ended session: the active session, the
            // exercise-history list, AND the heatmap grid / analytics summaries
            // (['exercise-heatmap'], ['exercises-heatmap'], ['exercise-analytics'])
            // which all derive from the session/exercise data this Finish just
            // wrote. Centralised in invalidateWorkoutCaches so this writer and the
            // full-screen workout writer can never drift apart and leave a surface
            // (e.g. the same-screen heatmap) stale. React-Query matches keys
            // positionally from index 0, so the helper uses the exact reader keys
            // (note ['exercises-heatmap'] is a SEPARATE key from
            // ['exercise-heatmap']) and prefix-invalidates ['exercise-analytics']
            // to catch every ['exercise-analytics', <name>] variant.
            invalidateWorkoutCaches(queryClient);
        }

        router.replace({ pathname: '/training/complete', params: summaryParams });
    };

    const formatTime = (secs: number) => {
        const m = Math.floor(secs / 60).toString().padStart(2, '0');
        const s = (secs % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    };

    // Session-wide derived totals for the hero strip (state-ground-truth): total
    // planned sets and how many are done. Purely presentational — no new data.
    const totalSets = exercises.reduce((a, ex) => a + ex.loggedSets.length, 0);
    const doneSets = exercises.reduce((a, ex) => a + ex.loggedSets.filter(s => s.done).length, 0);
    const sessionProgress = totalSets > 0 ? doneSets / totalSets : 0;

    // Live derived session VOLUME (kg·reps over completed sets) for the hero stat
    // grid — same finite-guarded math the Finish summary uses, just read live.
    // Purely presentational; adds no query and no handler.
    const liveVolume = exercises.reduce(
        (acc, ex) =>
            acc +
            ex.loggedSets
                .filter(s => s.done)
                .reduce((a, s) => a + finite(Number(s.weight)) * finite(Number(s.reps)), 0),
        0,
    );
    const liveVolumeLabel = liveVolume >= 1000 ? `${(liveVolume / 1000).toFixed(1)}k` : String(Math.round(liveVolume));

    return (
        <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background.primary }]}>
            <StatusBar style="light" />
            {/* Hero header — big mono elapsed clock + an athletic title, a
                hypertrophy pill, a session progress RING, and a large
                ink-on-lime Finish CTA. */}
            <Animated.View entering={FadeInDown.duration(420)} style={[styles.header, { borderBottomColor: colors.border.default }]}>
                <View style={styles.headerTopRow}>
                    <View style={styles.headerLeft}>
                        <View style={styles.liveRow}>
                            <View style={[styles.liveDot, { backgroundColor: colors.accent.coral }]} />
                            <Text style={[typography.overline, { color: colors.accent.coral }]}>ACTIVE WORKOUT</Text>
                        </View>
                        <Text style={[typography.h2, { color: colors.text.primary, marginTop: 4 }]} numberOfLines={1}>Night Shift Prep</Text>
                        <View style={styles.headerMeta}>
                            <Ionicons name="time-outline" size={16} color={colors.accent.coral} />
                            <Text style={[typography.statSmall, { color: colors.accent.coral }]}>{formatTime(timer)}</Text>
                            <View style={[styles.chip, { backgroundColor: colors.background.tertiary, borderColor: colors.border.default }]}>
                                <Text style={[typography.overline, { color: colors.text.secondary }]}>HYPERTROPHY</Text>
                            </View>
                        </View>
                    </View>

                    {/* Session-completion ring — mirrors the rest-timer ring motif.
                        Read-only render of the shared <CircularProgress/>; the lime
                        ring + center numeral derive straight off the done flags. */}
                    <CircularProgress
                        size={84}
                        strokeWidth={8}
                        progress={sessionProgress}
                        color={colors.accent.coral}
                        trackColor={colors.background.tertiary}
                    >
                        <Text style={[typography.statSmall, { color: colors.text.primary, fontSize: 22 }]}>
                            {Math.round(sessionProgress * 100)}
                        </Text>
                        <Text style={[typography.overline, { color: colors.text.tertiary, fontSize: 9 }]}>% DONE</Text>
                    </CircularProgress>
                </View>

                <Button title="Finish" onPress={handleFinish} fullWidth iconRight={<Ionicons name="checkmark-done" size={20} color={colors.text.inverse} />} style={{ marginTop: 16 }} />
            </Animated.View>

            {/* Rest banner — the per-second countdown + MM:SS are owned by the
                hardened <RestTimer/> (it fires onFinish at zero, which clears the
                rest). Lime glass banner; the timer ring and Close control are
                preserved (Close stops the rest cycle). */}
            {restActive ? (
                <Animated.View entering={FadeIn.duration(260)} style={[styles.restBanner, { backgroundColor: withAlpha(colors.accent.coral, 0.1), borderColor: withAlpha(colors.accent.coral, 0.3) }, shadows.glow(colors.accent.coral)]}>
                    <View style={styles.restCopy}>
                        <Ionicons name="timer" size={22} color={colors.accent.coral} />
                        <View style={{ marginLeft: 10 }}>
                            <Text style={[typography.overline, { color: colors.accent.coral }]}>REST</Text>
                            <Text style={[typography.caption, { color: colors.text.secondary }]}>Catch your breath</Text>
                        </View>
                    </View>
                    <View style={styles.restTimerWrap}>
                        <RestTimer
                            key={`rest-${restKey}`}
                            durationSeconds={REST_SECONDS}
                            isRunning={restActive}
                            onFinish={handleRestFinish}
                            size={92}
                        />
                    </View>
                    <TouchableOpacity activeOpacity={0.85} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Close" onPress={stopRest} style={[styles.restClose, { borderColor: withAlpha(colors.accent.coral, 0.4) }]}>
                        <Ionicons name="close" size={20} color={colors.accent.coral} />
                    </TouchableOpacity>
                </Animated.View>
            ) : null}

            <ScrollView contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
                {/* Session overview: a derived stat GRID (volume / sets / pace)
                    above the snapping exercise rail. Hidden until at least one
                    exercise is seeded. */}
                {exercises.length > 0 ? (
                    <>
                        <Animated.View entering={FadeInDown.delay(60).duration(420)} style={styles.statGrid}>
                            <StatTile
                                icon="layers-outline"
                                value={liveVolumeLabel}
                                unit="kg"
                                label="VOLUME"
                                accent={colors.accent.coral}
                            />
                            <StatTile
                                icon="checkmark-done-outline"
                                value={`${doneSets}/${totalSets}`}
                                label="SETS DONE"
                                accent={colors.accent.coral}
                            />
                            <StatTile
                                icon="time-outline"
                                value={formatTime(timer)}
                                label="ELAPSED"
                                accent={colors.accent.coral}
                            />
                        </Animated.View>

                        <Animated.View entering={FadeInDown.delay(110).duration(420)} style={styles.railHeader}>
                            <Text style={[typography.overline, { color: colors.text.tertiary }]}>SESSION</Text>
                            <Text style={[typography.caption, { color: colors.text.secondary }]}>{exercises.length} exercises</Text>
                        </Animated.View>
                        <ExerciseRail exercises={exercises} />
                    </>
                ) : null}

                <View style={{ paddingHorizontal: spacing.xl, paddingTop: spacing.lg }}>
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
                        <Animated.View key={ex.id} entering={FadeInDown.delay(160 + exIndex * 70).springify().damping(18).mass(0.7)}>
                            <ExerciseCard
                                exercise={ex}
                                exIndex={exIndex}
                                lastSet={lastSets?.[ex.name] ?? null}
                                onToggleSet={toggleSet}
                                onUpdateSet={updateSet}
                                onLogExtraSet={logExtraSet}
                            />
                        </Animated.View>
                    ))}

                    {/* Honest, functional action: browse the exercise catalogue to add
                        one (same destination the routed workout screen uses) — never a
                        silent no-op handler. */}
                    {exercises.length > 0 || (!sessionLoading && !sessionError) ? (
                        <Animated.View entering={FadeInDown.delay(200).duration(420)}>
                            <Button
                                title="Add Exercise"
                                variant="outline"
                                fullWidth
                                icon={<Ionicons name="add" size={20} color={colors.accent.coral} />}
                                onPress={() => router.push('/(exercises)')}
                                style={{ marginTop: 8 }}
                            />
                        </Animated.View>
                    ) : null}
                </View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        paddingHorizontal: 20,
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: 'transparent',
    },
    headerTopRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    headerLeft: {
        flex: 1,
        paddingRight: 12,
    },
    liveRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 7,
    },
    liveDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    headerMeta: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 8,
    },
    chip: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
        borderWidth: 1,
    },
    // Derived stat GRID under the hero — equal-width stat cards.
    statGrid: {
        flexDirection: 'row',
        gap: 10,
        paddingHorizontal: 20,
        paddingTop: 18,
    },
    statTile: {
        flex: 1,
        borderRadius: 18,
        borderWidth: 1,
        padding: 12,
    },
    statChip: {
        width: 30,
        height: 30,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 10,
    },
    statValueRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
    },
    restBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        marginHorizontal: 20,
        marginTop: 14,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 20,
        borderWidth: 1,
    },
    restCopy: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    // Centers the <RestTimer/> ring in the banner, taking the slack between the
    // leading icon/label and the trailing Close control.
    restTimerWrap: {
        flex: 1,
        alignItems: 'center',
    },
    restClose: {
        width: 40,
        height: 40,
        borderRadius: 20,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    // Header strip above the exercise rail.
    railHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: 22,
    },
    // Horizontal snapping exercise overview carousel.
    railContent: {
        paddingHorizontal: 20,
        paddingTop: 12,
        paddingBottom: 4,
        gap: 12,
    },
    railPill: {
        width: 160,
        borderRadius: 18,
        borderWidth: 1,
        padding: 14,
    },
    railPillTop: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    railIndex: {
        minWidth: 26,
        height: 22,
        borderRadius: 7,
        paddingHorizontal: 6,
        alignItems: 'center',
        justifyContent: 'center',
    },
    railTrack: {
        height: 4,
        borderRadius: 999,
        overflow: 'hidden',
        marginTop: 10,
    },
    railFill: {
        height: '100%',
        borderRadius: 999,
    },
    exerciseCard: {
        padding: 16,
        marginBottom: 20,
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
    // Subtle bottom fade so the floating chip and the title beneath read cleanly
    // over a bright demo frame. Non-interactive; never intercepts demo taps.
    demoScrim: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: 72,
        backgroundColor: 'rgba(10,12,18,0.55)',
    },
    demoIndex: {
        position: 'absolute',
        top: 12,
        left: 12,
        paddingHorizontal: 9,
        paddingVertical: 4,
        borderRadius: 999,
        borderWidth: 1,
    },
    demoBadge: {
        position: 'absolute',
        left: 12,
        bottom: 12,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 999,
        borderWidth: 1,
    },
    exHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    exTargetRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 4,
    },
    exMore: {
        width: 34,
        height: 34,
        borderRadius: 12,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    progressTrack: {
        height: 6,
        borderRadius: 999,
        overflow: 'hidden',
        marginTop: 14,
        marginBottom: 18,
    },
    progressFill: {
        height: '100%',
        borderRadius: 999,
    },
    setHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 10,
        paddingHorizontal: 10,
    },
    setRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 10,
        borderRadius: 14,
        borderWidth: 1,
        marginBottom: 8,
    },
    inputBox: {
        flex: 1,
        alignItems: 'center',
        paddingHorizontal: 6,
    },
    numericInput: {
        fontFamily: themeTypography.statSmall.fontFamily,
        fontSize: 18,
        width: '100%',
        minWidth: 56,
        textAlign: 'center',
        paddingVertical: 8,
        borderRadius: 12,
        borderWidth: 1,
    },
    checkBtn: {
        width: 44,
        height: 44,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: 8,
    },
    addSetBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 14,
        paddingVertical: 12,
        borderRadius: 14,
        borderWidth: 1,
        borderStyle: 'dashed',
    },
    // Spacing wrapper for the revealed <SetLogger/> (the component owns its own
    // card surface, padding, and border).
    addSetLogger: {
        marginTop: 12,
    },
});
