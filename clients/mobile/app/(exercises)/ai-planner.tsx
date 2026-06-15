/**
 * AI Workout Planner — powered by Coach Ria.
 * Let Ria generate a personalised workout routine based on goal,
 * level, days per week, and focus areas.
 */
import React, { useState } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { generateRoutineWithAI, type GenerateRoutinePayload } from '@/api/exercises';
import { LinearGradient } from 'expo-linear-gradient';
import { withAlpha } from '@/theme/utils';
import { shadows } from '@/theme/shadows';
import { GeneratingSteps } from '@/components/ui';
import { getErrorMessage } from '@/utils/validation';

// Staged status lines shown while Coach Ria builds the routine (10–30s).
const WORKOUT_GEN_STEPS = [
    'Reading your training profile…',
    'Selecting exercises for your goal…',
    'Balancing sets, reps & volume…',
    'Sequencing your weekly split…',
    'Finalizing your plan…',
];

// ── Option data ───────────────────────────────────────────────────────────────

type Goal = GenerateRoutinePayload['goal'];
type Level = GenerateRoutinePayload['level'];

const GOALS: { key: Goal; label: string; icon: string; color: string; desc: string }[] = [
    { key: 'strength',    label: 'Strength',    icon: 'barbell-outline',  color: '#FF6B35', desc: 'Max force, progressive overload' },
    { key: 'hypertrophy', label: 'Muscle',       icon: 'body-outline',     color: '#A855F7', desc: 'Hypertrophy & muscle growth' },
    { key: 'endurance',   label: 'Endurance',   icon: 'heart-outline',    color: '#00D4FF', desc: 'Cardio capacity & stamina' },
    { key: 'fat_loss',    label: 'Fat Loss',    icon: 'flame-outline',    color: '#EF4444', desc: 'High intensity calorie burn' },
    { key: 'general',     label: 'General',     icon: 'fitness-outline',  color: '#2ECC71', desc: 'Balanced all-around fitness' },
];

const LEVELS: { key: Level; label: string; desc: string }[] = [
    { key: 'beginner',     label: 'Beginner',     desc: '< 6 months training' },
    { key: 'intermediate', label: 'Intermediate',  desc: '6 months – 2 years' },
    { key: 'advanced',     label: 'Advanced',      desc: '2+ years consistent training' },
];

const DAYS_OPTIONS = [2, 3, 4, 5, 6];

const FOCUS_AREAS = ['Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core', 'Glutes', 'Full Body'];

const EQUIPMENT_OPTIONS = [
    { key: 'Full Gym',       icon: 'business-outline' },
    { key: 'Home (Dumbbells)', icon: 'home-outline' },
    { key: 'Calisthenics',   icon: 'body-outline' },
    { key: 'Kettlebell',     icon: 'ellipse-outline' },
];

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function AIWorkoutPlannerScreen() {
    const { colors, typography } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const qc = useQueryClient();

    const [goal, setGoal]           = useState<Goal>('general');
    const [level, setLevel]         = useState<Level>('intermediate');
    const [days, setDays]           = useState(3);
    const [focusAreas, setFocus]    = useState<string[]>([]);
    const [equipment, setEquipment] = useState('Full Gym');
    const [genError, setGenError]   = useState<string | null>(null);

    const selectedGoal = GOALS.find(g => g.key === goal)!;

    const generateMutation = useMutation({
        mutationFn: () => generateRoutineWithAI({ goal, level, daysPerWeek: days, focusAreas, equipment }),
        onSuccess: (routine) => {
            setGenError(null);
            qc.invalidateQueries({ queryKey: ['routines'] });
            qc.invalidateQueries({ queryKey: ['workout-routines'] });
            Alert.alert(
                '🎯 Plan Created!',
                `"${(routine as any).name ?? (routine as any).title}" is ready. Tap it in My Routines to start.`,
                [{ text: 'View Routines', onPress: () => router.replace('/(exercises)/routines' as any) }],
            );
        },
        onError: (err: unknown) => {
            setGenError(getErrorMessage(err));
        },
    });

    // Clear any prior error and kick off generation (used by CTA + Try Again).
    const runGenerate = () => {
        setGenError(null);
        generateMutation.mutate();
    };

    const toggleFocus = (area: string) => {
        setFocus(prev =>
            prev.includes(area) ? prev.filter(a => a !== area) : [...prev, area],
        );
    };

    return (
        <View style={[s.container, { backgroundColor: colors.background.primary }]}>
            {/* Header */}
            <LinearGradient
                colors={[withAlpha(colors.accent.purple, 0.18), 'transparent']}
                style={[s.headerGrad, { paddingTop: insets.top + 16 }]}
            >
                <View style={s.headerRow}>
                    <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={{ padding: 4 }}>
                        <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
                    </TouchableOpacity>
                    <View style={{ flex: 1, marginLeft: 16 }}>
                        <Text style={[typography.h2, { color: colors.text.primary }]}>
                            AI Workout Planner
                        </Text>
                        <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 2 }]}>
                            Coach Ria builds your perfect routine
                        </Text>
                    </View>
                    {/* Ria avatar */}
                    <LinearGradient colors={colors.gradients.purple} style={[s.riaAvatar, shadows.glow(colors.accent.purple)]}>
                        <Ionicons name="sparkles" size={20} color="#FFF" />
                    </LinearGradient>
                </View>
            </LinearGradient>

            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 120 }}
            >
                {/* Goal */}
                <SectionTitle label="WHAT'S YOUR GOAL?" colors={colors} typography={typography} />
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}
                >
                    {GOALS.map(g => (
                        <TouchableOpacity
                            key={g.key}
                            accessibilityRole="button"
                            accessibilityState={{ selected: goal === g.key }}
                            accessibilityLabel={g.label}
                            style={[
                                s.goalCard,
                                {
                                    backgroundColor: goal === g.key
                                        ? withAlpha(g.color, 0.18)
                                        : colors.background.secondary,
                                    borderColor: goal === g.key ? g.color : colors.border.default,
                                },
                            ]}
                            onPress={() => setGoal(g.key)}
                            activeOpacity={0.8}
                        >
                            <View style={[s.goalIcon, { backgroundColor: withAlpha(g.color, 0.15) }]}>
                                <Ionicons name={g.icon as any} size={22} color={g.color} />
                            </View>
                            <Text style={[typography.subhead, { color: goal === g.key ? g.color : colors.text.primary, fontWeight: '800', marginTop: 10 }]}>
                                {g.label}
                            </Text>
                            <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 4, fontSize: 10, textAlign: 'center' }]}>
                                {g.desc}
                            </Text>
                            {goal === g.key && (
                                <View style={[s.checkBadge, { backgroundColor: g.color }]}>
                                    <Ionicons name="checkmark" size={10} color="#FFF" />
                                </View>
                            )}
                        </TouchableOpacity>
                    ))}
                </ScrollView>

                {/* Level */}
                <SectionTitle label="YOUR EXPERIENCE" colors={colors} typography={typography} />
                <View style={{ paddingHorizontal: 20, gap: 10 }}>
                    {LEVELS.map(l => (
                        <TouchableOpacity
                            key={l.key}
                            accessibilityRole="radio"
                            accessibilityState={{ selected: level === l.key }}
                            accessibilityLabel={l.label}
                            style={[
                                s.levelRow,
                                {
                                    backgroundColor: level === l.key ? withAlpha(selectedGoal.color, 0.15) : colors.background.secondary,
                                    borderColor: level === l.key ? selectedGoal.color : colors.border.default,
                                },
                            ]}
                            onPress={() => setLevel(l.key)}
                            activeOpacity={0.85}
                        >
                            <View style={{ flex: 1 }}>
                                <Text style={[typography.subhead, { color: level === l.key ? selectedGoal.color : colors.text.primary, fontWeight: '700' }]}>
                                    {l.label}
                                </Text>
                                <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 2 }]}>
                                    {l.desc}
                                </Text>
                            </View>
                            <View style={[s.radioOuter, { borderColor: level === l.key ? selectedGoal.color : colors.border.default }]}>
                                {level === l.key && <View style={[s.radioInner, { backgroundColor: selectedGoal.color }]} />}
                            </View>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Days per week */}
                <SectionTitle label="DAYS PER WEEK" colors={colors} typography={typography} />
                <View style={s.daysRow}>
                    {DAYS_OPTIONS.map(d => (
                        <TouchableOpacity
                            key={d}
                            accessibilityRole="button"
                            accessibilityState={{ selected: days === d }}
                            accessibilityLabel={`${d} days per week`}
                            style={[
                                s.dayBtn,
                                {
                                    backgroundColor: days === d ? selectedGoal.color : colors.background.secondary,
                                    borderColor: days === d ? selectedGoal.color : colors.border.default,
                                },
                            ]}
                            onPress={() => setDays(d)}
                            activeOpacity={0.85}
                        >
                            <Text style={[typography.statSmall, { color: days === d ? '#FFF' : colors.text.primary, fontSize: 22 }]}>
                                {d}
                            </Text>
                            <Text style={[typography.overline, { color: days === d ? 'rgba(255,255,255,0.85)' : colors.text.tertiary, fontSize: 9 }]}>
                                DAYS
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Focus Areas */}
                <SectionTitle label="MUSCLE FOCUS (OPTIONAL)" colors={colors} typography={typography} />
                <View style={s.chipsRow}>
                    {FOCUS_AREAS.map(area => {
                        const active = focusAreas.includes(area);
                        return (
                            <TouchableOpacity
                                key={area}
                                accessibilityRole="button"
                                accessibilityState={{ selected: active }}
                                accessibilityLabel={area}
                                style={[
                                    s.chip,
                                    {
                                        backgroundColor: active ? withAlpha(selectedGoal.color, 0.18) : colors.background.secondary,
                                        borderColor: active ? selectedGoal.color : colors.border.default,
                                    },
                                ]}
                                onPress={() => toggleFocus(area)}
                                activeOpacity={0.85}
                            >
                                <Text style={[typography.caption, { color: active ? selectedGoal.color : colors.text.secondary, fontWeight: '600' }]}>
                                    {area}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>

                {/* Equipment */}
                <SectionTitle label="AVAILABLE EQUIPMENT" colors={colors} typography={typography} />
                <View style={s.chipsRow}>
                    {EQUIPMENT_OPTIONS.map(eq => {
                        const active = equipment === eq.key;
                        return (
                            <TouchableOpacity
                                key={eq.key}
                                accessibilityRole="button"
                                accessibilityState={{ selected: active }}
                                accessibilityLabel={eq.key}
                                style={[
                                    s.equipBtn,
                                    {
                                        backgroundColor: active ? withAlpha(selectedGoal.color, 0.18) : colors.background.secondary,
                                        borderColor: active ? selectedGoal.color : colors.border.default,
                                    },
                                ]}
                                onPress={() => setEquipment(eq.key)}
                                activeOpacity={0.85}
                            >
                                <Ionicons name={eq.icon as any} size={18} color={active ? selectedGoal.color : colors.text.tertiary} />
                                <Text style={[typography.caption, { color: active ? selectedGoal.color : colors.text.secondary, fontWeight: '600', marginLeft: 8 }]}>
                                    {eq.key}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>

                {/* Summary */}
                <View style={[s.summaryCard, { backgroundColor: withAlpha(selectedGoal.color, 0.08), borderColor: withAlpha(selectedGoal.color, 0.25), marginHorizontal: 20, marginTop: 24 }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                        <Ionicons name="sparkles" size={16} color={selectedGoal.color} />
                        <Text style={[typography.caption, { color: selectedGoal.color, fontWeight: 'bold', marginLeft: 8, fontSize: 11, letterSpacing: 1 }]}>
                            RIAS PLAN SUMMARY
                        </Text>
                    </View>
                    <Text style={[typography.body, { color: colors.text.primary }]}>
                        {`${days}-day ${LEVELS.find(l => l.key === level)!.label.toLowerCase()} ${selectedGoal.label.toLowerCase()} program`}
                        {focusAreas.length > 0 ? ` · ${focusAreas.join(', ')}` : ''}
                        {` · ${equipment}`}
                    </Text>
                    <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 6, lineHeight: 18 }]}>
                        Ria will create a full exercise list with sets, reps, and progression logic for your shift schedule.
                    </Text>
                </View>
            </ScrollView>

            {/* Generate CTA */}
            <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 20) }]}>
                {/* Persistent, retryable inline error — survives until a retry succeeds. */}
                {!!genError && !generateMutation.isPending && (
                    <View
                        style={[s.errorCard, { backgroundColor: withAlpha(selectedGoal.color, 0.08), borderColor: withAlpha(selectedGoal.color, 0.35) }]}
                        accessibilityRole="alert"
                    >
                        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                            <Ionicons name="alert-circle" size={20} color={selectedGoal.color} style={{ marginTop: 1 }} />
                            <View style={{ flex: 1, marginLeft: 10 }}>
                                <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: '700' }]}>
                                    Generation Failed
                                </Text>
                                <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 2, lineHeight: 18 }]}>
                                    {genError}
                                </Text>
                            </View>
                        </View>
                        <TouchableOpacity
                            style={[s.tryAgainBtn, { borderColor: selectedGoal.color }]}
                            onPress={runGenerate}
                            accessibilityRole="button"
                            accessibilityLabel="Try again"
                            activeOpacity={0.85}
                        >
                            <Ionicons name="refresh" size={16} color={selectedGoal.color} />
                            <Text style={[typography.caption, { color: selectedGoal.color, fontWeight: '700', marginLeft: 6 }]}>
                                Try Again
                            </Text>
                        </TouchableOpacity>
                    </View>
                )}
                <TouchableOpacity
                    style={[s.generateBtn, shadows.glow(selectedGoal.color), { backgroundColor: selectedGoal.color, opacity: generateMutation.isPending ? 0.7 : 1 }]}
                    onPress={runGenerate}
                    disabled={generateMutation.isPending}
                    accessibilityRole="button"
                    accessibilityLabel="Generate my plan"
                    accessibilityState={{ disabled: generateMutation.isPending }}
                    activeOpacity={0.85}
                >
                    {generateMutation.isPending ? (
                        <GeneratingSteps
                            active={generateMutation.isPending}
                            steps={WORKOUT_GEN_STEPS}
                            color="#FFF"
                            textColor="#FFF"
                            showDots={false}
                        />
                    ) : (
                        <>
                            <Ionicons name="sparkles" size={22} color="#FFF" />
                            <Text style={[typography.subhead, { color: '#FFF', fontWeight: '900', marginLeft: 10, fontSize: 16 }]}>
                                GENERATE MY PLAN
                            </Text>
                        </>
                    )}
                </TouchableOpacity>
            </View>
        </View>
    );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionTitle({ label, colors, typography }: any) {
    return (
        <Text style={[typography.caption, {
            color: colors.text.secondary,
            fontWeight: 'bold',
            letterSpacing: 1,
            fontSize: 11,
            paddingHorizontal: 20,
            paddingTop: 24,
            paddingBottom: 12,
        }]}>
            {label}
        </Text>
    );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
    container: { flex: 1 },
    headerGrad: { paddingHorizontal: 20, paddingBottom: 16 },
    headerRow: { flexDirection: 'row', alignItems: 'center' },
    riaAvatar: {
        width: 44, height: 44, borderRadius: 22,
        alignItems: 'center', justifyContent: 'center',
    },
    goalCard: {
        width: 120, padding: 16, borderRadius: 16, borderWidth: 1.5,
        alignItems: 'center', position: 'relative',
    },
    goalIcon: {
        width: 44, height: 44, borderRadius: 22,
        alignItems: 'center', justifyContent: 'center',
    },
    checkBadge: {
        position: 'absolute', top: 8, right: 8,
        width: 18, height: 18, borderRadius: 9,
        alignItems: 'center', justifyContent: 'center',
    },
    levelRow: {
        flexDirection: 'row', alignItems: 'center',
        padding: 16, borderRadius: 14, borderWidth: 1.5,
    },
    radioOuter: {
        width: 22, height: 22, borderRadius: 11, borderWidth: 2,
        alignItems: 'center', justifyContent: 'center',
    },
    radioInner: { width: 12, height: 12, borderRadius: 6 },
    daysRow: {
        flexDirection: 'row', paddingHorizontal: 20, gap: 10,
    },
    dayBtn: {
        flex: 1, aspectRatio: 1, borderRadius: 14, borderWidth: 1.5,
        alignItems: 'center', justifyContent: 'center',
    },
    chipsRow: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 20, gap: 10 },
    chip: {
        paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5,
    },
    equipBtn: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, borderWidth: 1.5,
    },
    summaryCard: { borderRadius: 16, borderWidth: 1, padding: 16 },
    errorCard: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 12 },
    tryAgainBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        alignSelf: 'flex-start', marginTop: 12,
        paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5,
    },
    footer: {
        position: 'absolute', bottom: 0, left: 0, right: 0,
        paddingHorizontal: 20,
    },
    generateBtn: {
        height: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        borderRadius: 30,
    },
});
