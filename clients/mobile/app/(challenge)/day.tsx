/**
 * Day detail — the "perform" screen. Lazily fills the day (Ria picks the
 * exercises + meals), shows each move with its real demo image + sets/reps,
 * lets the user tap to mark it done, and unlocks "Complete day" once all are
 * done — which marks the day complete and unlocks the next (gating in the store).
 */
import React, { useMemo, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useThemedPalette, type ThemedPalette } from '@/theme/useThemedPalette';
import { withAlpha } from '@/theme/utils';
import { safeImageUri } from '@/lib/imageUrl';
import { useCoachStore } from '@/features/coach/coachStore';
import { useQueryClient } from '@tanstack/react-query';
import { logMeal } from '@/api/meals';
import { logWorkout } from '@/api/exercises';
import type { DayMeal } from '@/features/coach/types';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function DayDetailScreen() {
    const D = useThemedPalette();
    const st = useMemo(() => makeStyles(D), [D]);
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const { day: dayParam } = useLocalSearchParams<{ day?: string }>();
    const dayNum = Number(dayParam) || 1;

    const plan = useCoachStore((s) => s.plan);
    const ensureDayFilled = useCoachStore((s) => s.ensureDayFilled);
    const toggleExercise = useCoachStore((s) => s.toggleExercise);
    const completeDay = useCoachStore((s) => s.completeDay);
    const addMeal = useCoachStore((s) => s.addMeal);

    const qc = useQueryClient();
    const day = plan?.days.find((d) => d.day === dayNum);

    useEffect(() => { ensureDayFilled(dayNum); }, [dayNum, ensureDayFilled]);

    // Accept a meal → log it (so it counts toward today's macros) + mark added.
    // Best-effort: the local "added" flag flips immediately; the macros tracker
    // (Home + Meals, keyed ['today-progress']) refreshes on the logMeal success.
    const onAddMeal = async (m: DayMeal) => {
        if (m.added) return;
        addMeal(dayNum, m.recipeId);
        try {
            await logMeal({
                mealType: m.mealType,
                foodItems: [{ name: m.title, quantity: 1, calories: m.kcal ?? 0, protein: m.protein ?? 0, carbs: m.carbs ?? 0, fat: m.fat ?? 0 }],
            });
            qc.invalidateQueries({ queryKey: ['today-progress'] });
            qc.invalidateQueries({ queryKey: ['meal-logs'] });
        } catch {
            // Network hiccup — keep the local added state; macros will catch up on next log.
        }
    };

    if (!plan || !day) {
        return (
            <View style={[st.root, st.center, { paddingTop: insets.top }]}>
                <StatusBar style="light" />
                <Text style={st.dim}>Day not found.</Text>
            </View>
        );
    }

    const total = day.exercises.length;
    const doneCount = day.exercises.filter((e) => e.done).length;
    const allDone = total > 0 && doneCount === total;
    const filling = total === 0 && day.status !== 'done';
    const pct = total ? Math.round((doneCount / total) * 100) : 0;
    const alreadyDone = day.status === 'done';

    const onComplete = async () => {
        // Log the finished day to the workout records (the "track is added to
        // records" requirement), then mark complete + unlock the next day.
        if (day && day.exercises.length > 0) {
            try {
                await logWorkout({
                    type: 'coach',
                    title: `Day ${day.day} · ${day.title}`,
                    exercises: day.exercises.map((e) => ({ name: e.name, sets: e.sets, reps: parseInt(e.reps, 10) || 0, weightKg: 0 })),
                });
                qc.invalidateQueries({ queryKey: ['recent-workouts'] });
            } catch { /* best-effort — completion + gating still proceed */ }
        }
        completeDay(dayNum);
        router.back();
    };

    return (
        <View style={st.root}>
            <StatusBar style="light" />
            <View style={[st.header, { paddingTop: insets.top + 8 }]}>
                <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="Go back" style={st.back}>
                    <Ionicons name="chevron-back" size={22} color={D.text} />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                    <Text style={st.hTitle} numberOfLines={1}>Day {day.day} · {day.title}</Text>
                    <Text style={st.hSub}><Ionicons name="flash" size={11} color={D.lime} /> AI-picked · {cap(plan.inputs.level)}</Text>
                </View>
            </View>

            {!filling && total > 0 ? (
                <>
                    <View style={st.progRow}>
                        <Text style={st.dim}>{doneCount} of {total} done</Text>
                        <Text style={st.limeTxt}>{pct}%</Text>
                    </View>
                    <View style={st.barTrack}><View style={[st.barFill, { width: `${pct}%` }]} /></View>
                </>
            ) : null}

            <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: insets.bottom + 110 }} showsVerticalScrollIndicator={false}>
                {filling ? (
                    <View style={[st.center, { paddingVertical: 60 }]}>
                        <ActivityIndicator color={D.lime} />
                        <Text style={[st.dim, { marginTop: 12 }]}>Ria is picking your moves…</Text>
                    </View>
                ) : (
                    day.exercises.map((ex) => {
                        const uri = safeImageUri(ex.imageUrl);
                        return (
                            <View key={ex.exerciseId} style={[st.exRow, ex.done && st.exDone]}>
                                {/* Tap the move → its detail page (how to perform it). */}
                                <TouchableOpacity
                                    activeOpacity={0.85}
                                    accessibilityRole="button"
                                    accessibilityLabel={`How to perform ${ex.name}, ${ex.sets} by ${ex.reps}`}
                                    onPress={() => router.push({ pathname: '/(exercises)/[id]', params: { id: ex.exerciseId, gender: plan.inputs.gender } } as any)}
                                    style={st.exMain}
                                >
                                    <View style={st.thumb}>
                                        {uri ? (
                                            <Image source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" cachePolicy="memory-disk" transition={150} />
                                        ) : (
                                            <Ionicons name="barbell" size={22} color="#3A4150" />
                                        )}
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={[st.exName, ex.done && st.exNameDone]} numberOfLines={1}>{ex.name}</Text>
                                        <Text style={st.exMeta}>{ex.sets} × {ex.reps} · how to perform</Text>
                                    </View>
                                </TouchableOpacity>
                                {/* Separate done toggle. */}
                                <TouchableOpacity
                                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                    accessibilityRole="button"
                                    accessibilityState={{ checked: ex.done }}
                                    accessibilityLabel={`Mark ${ex.name} ${ex.done ? 'not done' : 'done'}`}
                                    onPress={() => toggleExercise(dayNum, ex.exerciseId)}
                                >
                                    <Ionicons name={ex.done ? 'checkmark-circle' : 'ellipse-outline'} size={26} color={ex.done ? D.lime : D.muted} />
                                </TouchableOpacity>
                            </View>
                        );
                    })
                )}

                {!filling && day.meals.length > 0 ? (
                    <>
                        <Text style={st.mealsHead}>Meals picked for the day</Text>
                        {day.meals.map((m) => (
                            <View key={m.recipeId} style={st.mealRow}>
                                <View style={{ flex: 1 }}>
                                    <Text style={st.mealType}>{cap(m.mealType)}</Text>
                                    <Text style={st.mealTitle} numberOfLines={1}>{m.title}</Text>
                                </View>
                                {m.kcal ? <Text style={st.mealKcal}>{m.kcal} kcal</Text> : null}
                                <TouchableOpacity
                                    onPress={() => onAddMeal(m)}
                                    accessibilityLabel={m.added ? 'Meal added' : `Add ${m.title} to your day`}
                                    style={[st.addBtn, m.added && st.addBtnOn]}
                                >
                                    <Ionicons name={m.added ? 'checkmark' : 'add'} size={16} color={m.added ? D.ink : D.lime} />
                                </TouchableOpacity>
                            </View>
                        ))}
                    </>
                ) : null}
            </ScrollView>

            {!filling ? (
                <View style={[st.footer, { paddingBottom: insets.bottom + 14 }]}>
                    <TouchableOpacity
                        onPress={onComplete}
                        disabled={!allDone && !alreadyDone}
                        activeOpacity={0.9}
                        accessibilityRole="button"
                        accessibilityLabel="Complete day"
                        style={[st.cta, !allDone && !alreadyDone && { opacity: 0.45 }]}
                    >
                        <Ionicons name={alreadyDone ? 'checkmark-circle' : 'checkmark-done'} size={18} color={D.ink} />
                        <Text style={st.ctaTxt}>{alreadyDone ? 'Completed' : allDone ? 'Complete day' : `Finish all ${total} moves`}</Text>
                    </TouchableOpacity>
                </View>
            ) : null}
        </View>
    );
}

const makeStyles = (D: ThemedPalette) => StyleSheet.create({
    root: { flex: 1, backgroundColor: D.bg },
    center: { alignItems: 'center', justifyContent: 'center' },
    dim: { color: D.muted, fontSize: 13 },
    limeTxt: { color: D.lime, fontSize: 12.5, fontWeight: '600' },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 8 },
    back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    hTitle: { color: D.text, fontSize: 18, fontWeight: '700', letterSpacing: -0.3 },
    hSub: { color: D.muted, fontSize: 12, marginTop: 1 },
    progRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 18, marginTop: 2, marginBottom: 6 },
    barTrack: { height: 6, borderRadius: 3, backgroundColor: D.tile, marginHorizontal: 18 },
    barFill: { height: '100%', borderRadius: 3, backgroundColor: D.lime },
    exRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: D.card, borderWidth: 1, borderColor: D.border, borderRadius: 14, padding: 10, marginBottom: 9 },
    exMain: { flexDirection: 'row', alignItems: 'center', gap: 11, flex: 1 },
    exDone: { opacity: 0.6 },
    thumb: { width: 50, height: 50, borderRadius: 10, backgroundColor: '#EDEFF3', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    exName: { color: D.text, fontSize: 14.5, fontWeight: '600' },
    exNameDone: { textDecorationLine: 'line-through', color: D.muted },
    exMeta: { color: D.muted, fontSize: 11, marginTop: 2 },
    exSr: { color: D.lime, fontSize: 13, fontWeight: '600' },
    mealsHead: { color: D.muted, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', marginTop: 18, marginBottom: 10 },
    mealRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: D.tile, borderRadius: 12, padding: 11, marginBottom: 8 },
    mealType: { color: D.muted, fontSize: 10.5 },
    mealTitle: { color: D.text, fontSize: 13.5, fontWeight: '500', marginTop: 1 },
    mealKcal: { color: D.lime, fontSize: 12, fontWeight: '600' },
    addBtn: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: D.lime, alignItems: 'center', justifyContent: 'center', backgroundColor: withAlpha(D.lime, 0.12) },
    addBtnOn: { backgroundColor: D.lime, borderColor: D.lime },
    footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 18, paddingTop: 12, backgroundColor: D.bg, borderTopWidth: 1, borderTopColor: D.border },
    cta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: D.lime, borderRadius: 14, paddingVertical: 14 },
    ctaTxt: { color: D.ink, fontSize: 15, fontWeight: '600' },
});
