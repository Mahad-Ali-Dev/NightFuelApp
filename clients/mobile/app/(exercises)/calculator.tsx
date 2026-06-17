import React, { useState, useMemo } from 'react';
import {
    Alert,
    View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
    KeyboardAvoidingView, Platform, Dimensions
} from 'react-native';

import { useRouter } from 'expo-router';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { logOneRepMax } from '@/api/exercises';
import { SafeBlurView } from '@/components/SafeBlurView';
import { LinearGradient } from 'expo-linear-gradient';
import { shadows } from '@/theme/shadows';
import { withAlpha } from '@/theme/utils';

const { width } = Dimensions.get('window');

// ─── Formulas ───────────────────────────────────────────────────────────────

const formulas = {
    epley: (w: number, r: number) => w * (1 + r / 30),
    brzycki: (w: number, r: number) => w * (36 / (37 - r)),
    lander: (w: number, r: number) => (100 * w) / (101.3 - 2.67123 * r),
};

const ZONES = [
    { pct: 100, label: 'Max Power', reps: '1' },
    { pct: 95, label: 'Power', reps: '2' },
    { pct: 90, label: 'Power/Strength', reps: '3' },
    { pct: 85, label: 'Strength', reps: '5' },
    { pct: 80, label: 'Strength/Hypertrophy', reps: '7-8' },
    { pct: 75, label: 'Hypertrophy', reps: '10' },
    { pct: 70, label: 'Hypertrophy/Endurance', reps: '12-15' },
    { pct: 60, label: 'Endurance', reps: '20+' },
];

export default function CalculatorScreen() {
    const { colors, typography, spacing, borderRadius } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const queryClient = useQueryClient();

    const [weight, setWeight] = useState('100');
    const [reps, setReps] = useState('5');
    const [exerciseName, setExerciseName] = useState('');
    const [activeFormula, setActiveFormula] = useState<keyof typeof formulas>('epley');

    const w = parseFloat(weight) || 0;
    const r = parseInt(reps) || 0;

    const results = useMemo(() => {
        if (w <= 0 || r <= 0) return { epley: 0, brzycki: 0, lander: 0 };
        if (r === 1) return { epley: w, brzycki: w, lander: w };
        return {
            epley: Math.round(formulas.epley(w, r)),
            brzycki: Math.round(formulas.brzycki(w, r)),
            lander: Math.round(formulas.lander(w, r)),
        };
    }, [w, r]);

    const estimated1RM = results[activeFormula];

    const saveMutation = useMutation({
        mutationFn: () => logOneRepMax({
            exerciseName: exerciseName || 'Bench Press',
            weightKg: w,
            estimated1RMKg: estimated1RM,
        }),
        onSuccess: () => {
            // The 1RM list is read under two distinct query keys: ['exercise-1rm']
            // (analytics screen) and ['workout-1rm'] (useWorkout hook). Invalidate
            // both so the saved record refreshes everywhere it's shown.
            queryClient.invalidateQueries({ queryKey: ['exercise-1rm'] });
            queryClient.invalidateQueries({ queryKey: ['workout-1rm'] });
            Alert.alert('Saved', 'Your 1RM record has been saved successfully.');
            router.back();
        },
        onError: (err: any) => { Alert.alert('Error', err?.response?.data?.message ?? err?.message ?? 'Something went wrong'); },
    });

    return (
        <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
            {/* Header */}
            <View style={[styles.header, { paddingTop: insets.top, borderBottomColor: colors.border.default }]}>
                <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
                </TouchableOpacity>
                <Text style={[typography.heading, { color: colors.text.primary, fontSize: 18 }]}>1RM Calculator</Text>
                <View style={{ width: 40 }} />
            </View>

            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={{ flex: 1 }}
            >
                <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 100 }}>
                    {/* Input Card */}
                    <View style={[styles.cardOuter, { borderRadius: borderRadius['2xl'], borderColor: colors.border.default }]}>
                      <SafeBlurView tint="dark" intensity={40} style={styles.card}>
                        <View style={styles.inputRow}>
                            <View style={styles.inputStack}>
                                <Text style={[typography.caption, { color: colors.text.secondary, marginBottom: 8 }]}>WEIGHT (KG)</Text>
                                <TextInput
                                    style={[styles.input, { color: colors.text.primary, backgroundColor: colors.background.tertiary, borderRadius: borderRadius.xl }]}
                                    keyboardType="numeric"
                                    value={weight}
                                    onChangeText={setWeight}
                                    placeholder="0"
                                    placeholderTextColor={colors.text.tertiary}
                                />
                            </View>
                            <View style={styles.inputStack}>
                                <Text style={[typography.caption, { color: colors.text.secondary, marginBottom: 8 }]}>REPS</Text>
                                <TextInput
                                    style={[styles.input, { color: colors.text.primary, backgroundColor: colors.background.tertiary, borderRadius: borderRadius.xl }]}
                                    keyboardType="numeric"
                                    value={reps}
                                    onChangeText={setReps}
                                    placeholder="0"
                                    placeholderTextColor={colors.text.tertiary}
                                />
                            </View>
                        </View>

                        <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 16, marginBottom: 8 }]}>EXERCISE</Text>
                        <TextInput
                            style={[styles.input, { color: colors.text.primary, backgroundColor: colors.background.tertiary, borderRadius: borderRadius.xl }]}
                            value={exerciseName}
                            onChangeText={setExerciseName}
                            placeholder="e.g. Bench Press"
                            placeholderTextColor={colors.text.tertiary}
                        />
                      </SafeBlurView>
                    </View>

                    {/* Result Circle */}
                    <View style={styles.resultContainer}>
                        <LinearGradient
                            colors={colors.gradients.coral}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={[styles.resultRing, shadows.glow(colors.accent.coral)]}
                        >
                            <View style={[styles.resultCircle, { backgroundColor: colors.background.secondary }]}>
                                <Text style={[typography.overline, { color: colors.text.secondary }]}>ESTIMATED 1RM</Text>
                                <Text style={[typography.statLarge, { color: colors.text.primary, marginVertical: 4 }]}>
                                    {estimated1RM}
                                </Text>
                                <Text style={[typography.subhead, { color: colors.text.secondary, fontWeight: 'bold' }]}>KILOGRAMS</Text>
                            </View>
                        </LinearGradient>
                    </View>

                    {/* Formula Selector */}
                    <View style={[styles.formulaRow, { backgroundColor: colors.background.tertiary, borderRadius: borderRadius.xl }]}>
                        {(Object.keys(formulas) as Array<keyof typeof formulas>).map(f => (
                            <TouchableOpacity
                                key={f}
                                onPress={() => setActiveFormula(f)}
                                activeOpacity={0.85}
                                accessibilityRole="button"
                                accessibilityState={{ selected: activeFormula === f }}
                                accessibilityLabel={`${f} formula`}
                                style={[styles.formulaBtn, activeFormula === f && { backgroundColor: withAlpha(colors.accent.coral, 0.18), borderRadius: borderRadius.lg, borderWidth: 1, borderColor: withAlpha(colors.accent.coral, 0.4) }]}
                            >
                                <Text style={[styles.formulaText, { color: activeFormula === f ? colors.accent.coral : colors.text.tertiary }]}>
                                    {f.toUpperCase()}
                                </Text>
                                <Text style={[styles.formulaVal, { color: activeFormula === f ? colors.accent.coral : colors.text.secondary }]}>
                                    {results[f]}kg
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    <TouchableOpacity
                        style={[shadows.glow(colors.accent.coral), { borderRadius: borderRadius.xl, marginTop: 24, opacity: saveMutation.isPending ? 0.7 : 1 }]}
                        onPress={() => saveMutation.mutate()}
                        disabled={saveMutation.isPending}
                        accessibilityRole="button"
                        accessibilityLabel="Save to records"
                        accessibilityState={{ disabled: saveMutation.isPending }}
                        activeOpacity={0.85}
                    >
                        <LinearGradient
                            colors={colors.gradients.coral}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={[styles.saveBtn, { borderRadius: borderRadius.xl }]}
                        >
                            <Ionicons name="trophy" size={20} color="#FFF" />
                            <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: 'bold', marginLeft: 8 }]}>
                                {saveMutation.isPending ? 'SAVING...' : 'SAVE TO RECORDS'}
                            </Text>
                        </LinearGradient>
                    </TouchableOpacity>

                    {/* Zone Table */}
                    <Text style={[typography.heading, { color: colors.text.primary, marginTop: spacing['2xl'], marginBottom: spacing.md }]}>
                        Training Zones
                    </Text>
                    <View style={[styles.zoneTableOuter, { borderRadius: borderRadius['2xl'], borderColor: colors.border.default }]}>
                      <SafeBlurView tint="dark" intensity={40} style={styles.zoneTable}>
                        {ZONES.map((zone, idx) => (
                            <View key={zone.pct} style={[styles.zoneRow, idx < ZONES.length - 1 && { borderBottomColor: colors.border.default, borderBottomWidth: 1 }]}>
                                <View style={styles.zoneLeft}>
                                    <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: 'bold' }]}>{zone.pct}%</Text>
                                    <Text style={[typography.caption, { color: colors.text.secondary }]}>{zone.label}</Text>
                                </View>
                                <View style={styles.zoneRight}>
                                    <Text style={[typography.statTiny, { color: colors.accent.cyan, fontSize: 18 }]}>
                                        {Math.round(estimated1RM * zone.pct / 100)}kg
                                    </Text>
                                    <Text style={[typography.caption, { color: colors.text.secondary, fontSize: 10 }]}>~{zone.reps} reps</Text>
                                </View>
                            </View>
                        ))}
                      </SafeBlurView>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1 },
    backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    cardOuter: { borderWidth: 1, overflow: 'hidden' },
    card: { padding: 24, backgroundColor: 'transparent' },
    inputRow: { flexDirection: 'row', gap: 16 },
    inputStack: { flex: 1 },
    input: { height: 56, paddingHorizontal: 16, fontSize: 20, fontWeight: 'bold', textAlign: 'center' },
    resultContainer: { alignItems: 'center', marginVertical: 30 },
    resultRing: { width: 224, height: 224, borderRadius: 112, alignItems: 'center', justifyContent: 'center' },
    resultCircle: { width: 208, height: 208, borderRadius: 104, alignItems: 'center', justifyContent: 'center' },
    formulaRow: { flexDirection: 'row', padding: 6, gap: 4, marginTop: 10 },
    formulaBtn: { flex: 1, alignItems: 'center', paddingVertical: 10 },
    formulaText: { fontSize: 10, fontWeight: 'bold', marginBottom: 2 },
    formulaVal: { fontSize: 14, fontWeight: '800' },
    saveBtn: { height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
    zoneTableOuter: { borderWidth: 1, overflow: 'hidden' },
    zoneTable: { backgroundColor: 'transparent' },
    zoneRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
    zoneLeft: { flex: 1 },
    zoneRight: { alignItems: 'flex-end' },
});
