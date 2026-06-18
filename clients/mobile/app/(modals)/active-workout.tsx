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
import { useQuery } from '@tanstack/react-query';
import { getActiveSession, getLastSet, LastSet, SessionExercise } from '@/api/exercises';
import { ExerciseDemo } from '@/components/exercise/ExerciseDemo';
import { resolveDemo, resolveDemoFrames } from '@/constants/exerciseDemos';
import { getCuratedDemo, getCuratedDemoFrames } from '@/constants/curatedDemos';

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
};

/**
 * One exercise in the active workout: a compact in-app demo (animated FEDB frame
 * pair, curated still + "Full tutorial" link, or the honest "coming soon" state —
 * resolved via {@link resolveDemoInputs}, the SAME precedence the exercise-detail
 * screen uses) followed by the set-logging rows, the previous-set hints, and the
 * "Add Set" control. Behaviour of the rows/timers/handlers is unchanged — only
 * the demo player is new.
 */
function ExerciseCard({ exercise: ex, exIndex, lastSet, onToggleSet, onUpdateSet }: ExerciseCardProps) {
    const { colors, typography } = useTheme();
    // Memoize the per-exercise demo resolution so the precedence walk + curated
    // lookup only re-runs when the exercise NAME changes (the resolvers key on it).
    const demo = useMemo(() => resolveDemoInputs(ex.name), [ex.name]);

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

            <TouchableOpacity activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Add set" style={styles.addSetBtn}>
                <Text style={[typography.subhead, { color: colors.text.secondary, textAlign: 'center' }]}>+ Add Set</Text>
            </TouchableOpacity>
        </Card>
    );
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
                    <ExerciseCard
                        key={ex.id}
                        exercise={ex}
                        exIndex={exIndex}
                        lastSet={lastSets?.[ex.name] ?? null}
                        onToggleSet={toggleSet}
                        onUpdateSet={updateSet}
                    />
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
    }
});
