/**
 * Build my plan — the Coach onboarding. The user picks gender/level/goal/diet/
 * duration; "Generate" hands off to the store (buildDaySplit + fill day 1) and
 * routes to the gated challenge list. Mirrors the approved preview.
 */
import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useThemedPalette, type ThemedPalette } from '@/theme/useThemedPalette';
import { withAlpha } from '@/theme/utils';
import { useCoachStore, MONTHLY_PLAN_LIMIT, generationsThisMonth } from '@/features/coach/coachStore';
import type { CoachGender, CoachLevel, CoachGoal, CoachDiet, PlanDuration } from '@/features/coach/types';

const GENDERS: { v: CoachGender; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { v: 'Male', label: 'Male', icon: 'male' },
    { v: 'Female', label: 'Female', icon: 'female' },
];
const LEVELS: CoachLevel[] = ['beginner', 'intermediate', 'advanced'];
const GOALS: { v: CoachGoal; label: string }[] = [
    { v: 'fat-loss', label: 'Fat loss' }, { v: 'muscle-gain', label: 'Muscle gain' },
    { v: 'endurance', label: 'Endurance' }, { v: 'maintain', label: 'Maintain' },
];
const DIETS: { v: CoachDiet; label: string }[] = [
    { v: 'balanced', label: 'Balanced' }, { v: 'keto', label: 'Keto' },
    { v: 'vegan', label: 'Vegan' }, { v: 'high-protein', label: 'High-protein' },
];
const DURATIONS: PlanDuration[] = [3, 7, 15, 30];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function BuildPlanScreen() {
    const D = useThemedPalette();
    const st = useMemo(() => makeStyles(D), [D]);
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const generate = useCoachStore((s) => s.generate);
    const status = useCoachStore((s) => s.status);
    const generations = useCoachStore((s) => s.generations);

    const [gender, setGender] = useState<CoachGender>('Male');
    const [level, setLevel] = useState<CoachLevel>('intermediate');
    const [goal, setGoal] = useState<CoachGoal>('fat-loss');
    const [diet, setDiet] = useState<CoachDiet>('balanced');
    const [duration, setDuration] = useState<PlanDuration>(30);

    const remaining = Math.max(0, MONTHLY_PLAN_LIMIT - generationsThisMonth(generations));
    const atLimit = remaining <= 0;
    const busy = status === 'generating';
    const onGenerate = async () => {
        if (atLimit || busy) return;
        const ok = await generate({ gender, level, goal, diet, duration });
        if (ok) router.replace('/(challenge)' as any);
    };

    const chip = (on: boolean, label: string, onPress: () => void, icon?: keyof typeof Ionicons.glyphMap) => (
        <TouchableOpacity key={label} onPress={onPress} activeOpacity={0.85} accessibilityRole="button" accessibilityState={{ selected: on }} style={[st.chip, on && st.chipOn]}>
            {icon ? <Ionicons name={icon} size={14} color={on ? D.lime : D.muted} style={{ marginRight: 5 }} /> : null}
            <Text style={[st.chipTxt, on && st.chipTxtOn]}>{label}</Text>
        </TouchableOpacity>
    );

    return (
        <View style={st.root}>
            <StatusBar style="light" />
            <View style={[st.header, { paddingTop: insets.top + 8 }]}>
                <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="Go back" style={st.back}>
                    <Ionicons name="chevron-back" size={22} color={D.text} />
                </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: insets.bottom + 120 }} showsVerticalScrollIndicator={false}>
                <Text style={st.title}>Build my plan</Text>
                <Text style={st.sub}>Tell Ria a few things — she picks the rest.</Text>

                <Text style={st.over}>I am</Text>
                <View style={st.row}>{GENDERS.map((g) => chip(gender === g.v, g.label, () => setGender(g.v), g.icon))}</View>

                <Text style={st.over}>Level</Text>
                <View style={st.row}>{LEVELS.map((l) => chip(level === l, cap(l), () => setLevel(l)))}</View>

                <Text style={st.over}>Goal</Text>
                <View style={st.row}>{GOALS.map((g) => chip(goal === g.v, g.label, () => setGoal(g.v)))}</View>

                <Text style={st.over}>Diet</Text>
                <View style={st.row}>{DIETS.map((d) => chip(diet === d.v, d.label, () => setDiet(d.v)))}</View>

                <Text style={st.over}>Plan length</Text>
                <View style={st.row}>{DURATIONS.map((d) => chip(duration === d, `${d} days`, () => setDuration(d)))}</View>
            </ScrollView>
            <View style={[st.footer, { paddingBottom: insets.bottom + 14 }]}>
                <Text style={st.quota}>
                    {atLimit
                        ? "You've used all 3 plans this month — keep going with your current plan."
                        : `${remaining} of ${MONTHLY_PLAN_LIMIT} new plans left this month`}
                </Text>
                <TouchableOpacity onPress={onGenerate} disabled={busy || atLimit} activeOpacity={0.9} accessibilityRole="button" accessibilityState={{ disabled: busy || atLimit }} accessibilityLabel="Generate my plan" style={[st.cta, (busy || atLimit) && { opacity: 0.45 }]}>
                    {busy ? (
                        <ActivityIndicator color={D.ink} />
                    ) : (
                        <>
                            <Ionicons name="flash" size={18} color={D.ink} />
                            <Text style={st.ctaTxt}>{atLimit ? 'Monthly limit reached' : 'Generate my plan'}</Text>
                        </>
                    )}
                </TouchableOpacity>
            </View>
        </View>
    );
}

const makeStyles = (D: ThemedPalette) => StyleSheet.create({
    root: { flex: 1, backgroundColor: D.bg },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 4 },
    back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    title: { color: D.text, fontSize: 26, fontWeight: '700', letterSpacing: -0.5 },
    sub: { color: D.muted, fontSize: 14, marginTop: 4, marginBottom: 6 },
    over: { color: D.muted, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', marginTop: 20, marginBottom: 9 },
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: D.border, borderRadius: 10, paddingHorizontal: 13, paddingVertical: 9 },
    chipOn: { borderWidth: 1.5, borderColor: D.lime, backgroundColor: withAlpha(D.lime, 0.1) },
    chipTxt: { color: D.muted, fontSize: 13 },
    chipTxtOn: { color: D.text },
    footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 18, paddingTop: 12, backgroundColor: D.bg, borderTopWidth: 1, borderTopColor: D.border },
    quota: { color: D.muted, fontSize: 12, textAlign: 'center', marginBottom: 10 },
    cta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: D.lime, borderRadius: 14, paddingVertical: 14 },
    ctaTxt: { color: D.ink, fontSize: 15, fontWeight: '600' },
});
