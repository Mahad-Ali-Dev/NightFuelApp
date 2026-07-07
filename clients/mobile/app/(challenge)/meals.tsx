/**
 * Meal plan — Ria's picked meals for the active plan day (breakfast/lunch/dinner/
 * snack), the meals analog of the workout challenge. Each card shows the recipe +
 * macros; "Add" logs it (→ today's macros) and flips to added. No plan → build.
 */
import React, { useMemo, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useThemedPalette, type ThemedPalette } from '@/theme/useThemedPalette';
import { withAlpha } from '@/theme/utils';
import { safeImageUri } from '@/lib/imageUrl';
import { useCoachStore } from '@/features/coach/coachStore';
import { logMeal } from '@/api/meals';
import { GOAL_LABELS, type DayMeal } from '@/features/coach/types';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function MealPlanScreen() {
    const D = useThemedPalette();
    const st = useMemo(() => makeStyles(D), [D]);
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const qc = useQueryClient();

    const plan = useCoachStore((s) => s.plan);
    const ensureDayFilled = useCoachStore((s) => s.ensureDayFilled);
    const addMeal = useCoachStore((s) => s.addMeal);

    // The day whose meals we surface: the active day (else the last day).
    const day = plan ? (plan.days.find((d) => d.status === 'active') ?? plan.days[plan.days.length - 1]) : undefined;

    useEffect(() => { if (day) ensureDayFilled(day.day); }, [day?.day, ensureDayFilled]);

    const onAddMeal = async (m: DayMeal) => {
        if (!day || m.added) return;
        addMeal(day.day, m.recipeId);
        try {
            await logMeal({
                mealType: m.mealType,
                foodItems: [{ name: m.title, quantity: 1, calories: m.kcal ?? 0, protein: m.protein ?? 0, carbs: m.carbs ?? 0, fat: m.fat ?? 0 }],
            });
            qc.invalidateQueries({ queryKey: ['today-progress'] });
            qc.invalidateQueries({ queryKey: ['meal-logs'] });
        } catch { /* best-effort */ }
    };

    if (!plan || !day) {
        return (
            <View style={[st.root, st.center, { paddingTop: insets.top }]}>
                <StatusBar style="light" />
                <Ionicons name="restaurant" size={42} color={D.lime} />
                <Text style={st.emptyTitle}>No meal plan yet</Text>
                <Text style={st.emptySub}>Let Ria build a workout + meal plan around your goal &amp; diet.</Text>
                <TouchableOpacity onPress={() => router.push('/(challenge)/build' as any)} activeOpacity={0.9} style={st.cta}>
                    <Ionicons name="flash" size={18} color={D.ink} />
                    <Text style={st.ctaTxt}>Build my plan</Text>
                </TouchableOpacity>
            </View>
        );
    }

    const kcalTotal = day.meals.reduce((a, m) => a + (m.kcal ?? 0), 0);

    return (
        <View style={st.root}>
            <StatusBar style="light" />
            <View style={[st.header, { paddingTop: insets.top + 8 }]}>
                <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="Go back" style={st.back}>
                    <Ionicons name="chevron-back" size={22} color={D.text} />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                    <Text style={st.hTitle}>Meal plan</Text>
                    <Text style={st.hSub}><Ionicons name="flash" size={11} color={D.lime} /> Day {day.day} · {GOAL_LABELS[plan.inputs.goal]} · {cap(plan.inputs.diet)}</Text>
                </View>
            </View>

            <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: insets.bottom + 24 }} showsVerticalScrollIndicator={false}>
                {day.meals.length === 0 ? (
                    <Text style={st.dim}>Ria is picking today's meals…</Text>
                ) : (
                    <>
                        <Text style={st.totalTxt}>~{kcalTotal} kcal · {day.meals.length} meals</Text>
                        {day.meals.map((m) => {
                            const uri = safeImageUri(m.imageUrl);
                            return (
                                <View key={m.recipeId} style={st.card}>
                                    <View style={st.thumb}>
                                        {uri ? (
                                            <Image source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" cachePolicy="memory-disk" transition={150} />
                                        ) : (
                                            <Ionicons name="restaurant" size={22} color="#3A4150" />
                                        )}
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={st.mealType}>{cap(m.mealType)}</Text>
                                        <Text style={st.mealTitle} numberOfLines={2}>{m.title}</Text>
                                        <Text style={st.macros}>
                                            {m.kcal ?? 0} kcal · P{Math.round(m.protein ?? 0)} C{Math.round(m.carbs ?? 0)} F{Math.round(m.fat ?? 0)}
                                        </Text>
                                    </View>
                                    <TouchableOpacity
                                        onPress={() => onAddMeal(m)}
                                        accessibilityRole="button"
                                        accessibilityLabel={m.added ? 'Added' : `Add ${m.title}`}
                                        style={[st.addBtn, m.added && st.addBtnOn]}
                                    >
                                        <Ionicons name={m.added ? 'checkmark' : 'add'} size={18} color={m.added ? D.ink : D.lime} />
                                    </TouchableOpacity>
                                </View>
                            );
                        })}
                    </>
                )}
            </ScrollView>
        </View>
    );
}

const makeStyles = (D: ThemedPalette) => StyleSheet.create({
    root: { flex: 1, backgroundColor: D.bg },
    center: { alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
    dim: { color: D.muted, fontSize: 13 },
    emptyTitle: { color: D.text, fontSize: 20, fontWeight: '700', marginTop: 6 },
    emptySub: { color: D.muted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 10 },
    back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    hTitle: { color: D.text, fontSize: 20, fontWeight: '700', letterSpacing: -0.4 },
    hSub: { color: D.muted, fontSize: 12, marginTop: 1 },
    totalTxt: { color: D.lime, fontSize: 12.5, fontWeight: '600', marginBottom: 12 },
    card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: D.card, borderWidth: 1, borderColor: D.border, borderRadius: 14, padding: 11, marginBottom: 10 },
    thumb: { width: 60, height: 60, borderRadius: 12, backgroundColor: '#EDEFF3', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    mealType: { color: D.lime, fontSize: 10.5, letterSpacing: 0.6, textTransform: 'uppercase', fontWeight: '700' },
    mealTitle: { color: D.text, fontSize: 14.5, fontWeight: '600', marginTop: 2 },
    macros: { color: D.muted, fontSize: 11.5, marginTop: 3 },
    addBtn: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: D.lime, alignItems: 'center', justifyContent: 'center', backgroundColor: withAlpha(D.lime, 0.12) },
    addBtnOn: { backgroundColor: D.lime, borderColor: D.lime },
    cta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: D.lime, borderRadius: 14, paddingVertical: 13, paddingHorizontal: 22, marginTop: 14 },
    ctaTxt: { color: D.ink, fontSize: 15, fontWeight: '600' },
});
