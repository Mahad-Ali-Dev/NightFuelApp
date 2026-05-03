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
import { BlurView } from 'expo-blur';

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
            queryClient.invalidateQueries({ queryKey: ['1rm'] });
            Alert.alert('Saved', 'Your 1RM record has been saved successfully.');
            router.back();
        },
        onError: (err: any) => { Alert.alert('Error', err?.response?.data?.message ?? err?.message ?? 'Something went wrong'); },
    });

    return (
        <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
            {/* Header */}
            <View style={[styles.header, { paddingTop: insets.top, borderBottomColor: colors.border.default }]}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
                </TouchableOpacity>
                <Text style={[typography.heading, { color: colors.text.primary, fontSize: 18 }]}>1RM Calculator</Text>
                <View style={{ width: 40 }} />
            </View>

            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={{ flex: 1 }}
            >
                <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 100 }}>
                    {/* Input Card */}
                    <View style={[styles.card, { backgroundColor: colors.background.secondary, borderRadius: borderRadius['2xl'], borderColor: colors.border.default }]}>
                        <View style={styles.inputRow}>
                            <View style={styles.inputStack}>
                                <Text style={[typography.caption, { color: colors.text.tertiary, marginBottom: 8 }]}>WEIGHT (KG)</Text>
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
                                <Text style={[typography.caption, { color: colors.text.tertiary, marginBottom: 8 }]}>REPS</Text>
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

                        <Text style={[typography.caption, { color: colors.text.tertiary, marginTop: 16, marginBottom: 8 }]}>EXERCISE</Text>
                        <TextInput
                            style={[styles.input, { color: colors.text.primary, backgroundColor: colors.background.tertiary, borderRadius: borderRadius.xl }]}
                            value={exerciseName}
                            onChangeText={setExerciseName}
                            placeholder="e.g. Bench Press"
                            placeholderTextColor={colors.text.tertiary}
                        />
                    </View>

                    {/* Result Circle */}
                    <View style={styles.resultContainer}>
                        <View style={[styles.resultCircle, { borderColor: colors.accent.coral }]}>
                            <Text style={[typography.caption, { color: colors.text.tertiary, letterSpacing: 2 }]}>ESTIMATED 1RM</Text>
                            <Text style={[typography.display, { color: colors.accent.coral, fontSize: 56, marginVertical: 4 }]}>
                                {estimated1RM}
                            </Text>
                            <Text style={[typography.subhead, { color: colors.text.secondary, fontWeight: 'bold' }]}>KILOGRAMS</Text>
                        </View>
                    </View>

                    {/* Formula Selector */}
                    <View style={[styles.formulaRow, { backgroundColor: colors.background.tertiary, borderRadius: borderRadius.xl }]}>
                        {(Object.keys(formulas) as Array<keyof typeof formulas>).map(f => (
                            <TouchableOpacity
                                key={f}
                                onPress={() => setActiveFormula(f)}
                                style={[styles.formulaBtn, activeFormula === f && { backgroundColor: colors.accent.coral, borderRadius: borderRadius.lg }]}
                            >
                                <Text style={[styles.formulaText, { color: activeFormula === f ? '#FFF' : colors.text.tertiary }]}>
                                    {f.toUpperCase()}
                                </Text>
                                <Text style={[styles.formulaVal, { color: activeFormula === f ? '#FFF' : colors.text.secondary }]}>
                                    {results[f]}kg
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    <TouchableOpacity
                        style={[styles.saveBtn, { backgroundColor: colors.accent.coral, borderRadius: borderRadius.xl }]}
                        onPress={() => saveMutation.mutate()}
                        disabled={saveMutation.isPending}
                    >
                        <Ionicons name="trophy" size={20} color="#FFF" />
                        <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: 'bold', marginLeft: 8 }]}>
                            {saveMutation.isPending ? 'SAVING...' : 'SAVE TO RECORDS'}
                        </Text>
                    </TouchableOpacity>

                    {/* Zone Table */}
                    <Text style={[typography.heading, { color: colors.text.primary, marginTop: spacing['2xl'], marginBottom: spacing.md }]}>
                        Training Zones
                    </Text>
                    <View style={[styles.zoneTable, { backgroundColor: colors.background.secondary, borderRadius: borderRadius['2xl'], borderColor: colors.border.default }]}>
                        {ZONES.map((zone, idx) => (
                            <View key={zone.pct} style={[styles.zoneRow, idx < ZONES.length - 1 && { borderBottomColor: colors.border.default, borderBottomWidth: 1 }]}>
                                <View style={styles.zoneLeft}>
                                    <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: 'bold' }]}>{zone.pct}%</Text>
                                    <Text style={[typography.caption, { color: colors.text.tertiary }]}>{zone.label}</Text>
                                </View>
                                <View style={styles.zoneRight}>
                                    <Text style={[typography.heading, { color: colors.accent.cyan, fontSize: 18 }]}>
                                        {Math.round(estimated1RM * zone.pct / 100)}kg
                                    </Text>
                                    <Text style={[typography.caption, { color: colors.text.tertiary, fontSize: 10 }]}>~{zone.reps} reps</Text>
                                </View>
                            </View>
                        ))}
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
    card: { padding: 24, borderWidth: 1 },
    inputRow: { flexDirection: 'row', gap: 16 },
    inputStack: { flex: 1 },
    input: { height: 56, paddingHorizontal: 16, fontSize: 20, fontWeight: 'bold', textAlign: 'center' },
    resultContainer: { alignItems: 'center', marginVertical: 30 },
    resultCircle: { width: 220, height: 220, borderRadius: 110, borderWidth: 8, alignItems: 'center', justifyContent: 'center' },
    formulaRow: { flexDirection: 'row', padding: 6, gap: 4, marginTop: 10 },
    formulaBtn: { flex: 1, alignItems: 'center', paddingVertical: 10 },
    formulaText: { fontSize: 10, fontWeight: 'bold', marginBottom: 2 },
    formulaVal: { fontSize: 14, fontWeight: '800' },
    saveBtn: { height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 24 },
    zoneTable: { borderWidth: 1, overflow: 'hidden' },
    zoneRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
    zoneLeft: { flex: 1 },
    zoneRight: { alignItems: 'flex-end' },
});
