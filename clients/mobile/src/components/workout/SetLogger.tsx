import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme';

interface SetLoggerProps {
    exerciseName: string;
    targetSets: number;
    onLogSet: (setData: { reps: number; weightKg: number }) => void;
}

export function SetLogger({ exerciseName, targetSets, onLogSet }: SetLoggerProps) {
    const [reps, setReps] = useState('');
    const [weight, setWeight] = useState('');
    const [loggedSets, setLoggedSets] = useState<Array<{ reps: number; weightKg: number }>>([]);

    const handleLog = () => {
        if (!reps || !weight) return;
        const setData = { reps: parseInt(reps), weightKg: parseFloat(weight) };
        setLoggedSets((prev) => [...prev, setData]);
        onLogSet(setData);
        setReps('');
        setWeight('');
    };

    return (
        <View style={styles.container}>
            <Text style={styles.exercise}>{exerciseName}</Text>
            <Text style={styles.setCount}>{loggedSets.length} / {targetSets} sets</Text>

            {/* Logged Sets */}
            {loggedSets.map((s, i) => (
                <View key={i} style={styles.loggedRow}>
                    <Text style={styles.setNum}>Set {i + 1}</Text>
                    <Text style={styles.loggedVal}>{s.reps} reps</Text>
                    <Text style={styles.loggedVal}>{s.weightKg} kg</Text>
                    <Ionicons name="checkmark-circle" size={18} color="#00D4AA" />
                </View>
            ))}

            {/* Input Row */}
            {loggedSets.length < targetSets && (
                <View style={styles.inputRow}>
                    <TextInput style={styles.input} placeholder="Reps" placeholderTextColor={colors.text.tertiary} keyboardType="numeric" value={reps} onChangeText={setReps} />
                    <TextInput style={styles.input} placeholder="Weight (kg)" placeholderTextColor={colors.text.tertiary} keyboardType="decimal-pad" value={weight} onChangeText={setWeight} />
                    <TouchableOpacity style={styles.logBtn} onPress={handleLog} activeOpacity={0.85}>
                        <Ionicons name="checkmark" size={22} color="#FFFFFF" />
                    </TouchableOpacity>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { backgroundColor: colors.background.secondary, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: colors.border.default, marginBottom: 16 },
    exercise: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
    setCount: { color: colors.text.secondary, fontSize: 13, marginTop: 4, marginBottom: 16 },
    loggedRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.background.primary, gap: 16 },
    setNum: { color: colors.text.secondary, fontSize: 12, width: 48 },
    loggedVal: { color: '#FFFFFF', fontSize: 14, fontWeight: '600', flex: 1 },
    inputRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
    input: { flex: 1, backgroundColor: colors.background.primary, borderRadius: 12, paddingHorizontal: 14, height: 44, color: '#FFFFFF', fontSize: 14, borderWidth: 1, borderColor: colors.border.light },
    logBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FF6B35', alignItems: 'center', justifyContent: 'center' },
});
