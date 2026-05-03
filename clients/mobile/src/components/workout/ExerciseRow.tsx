import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface ExerciseRowProps {
    name: string;
    sets: number;
    reps: number;
    weight?: number;
    isCompleted?: boolean;
    isActive?: boolean;
    onPress?: () => void;
}

export function ExerciseRow({ name, sets, reps, weight, isCompleted, isActive, onPress }: ExerciseRowProps) {
    return (
        <TouchableOpacity style={[styles.row, isActive && styles.rowActive]} onPress={onPress} activeOpacity={0.7}>
            <View style={[styles.indicator, isCompleted ? styles.completed : isActive ? styles.active : styles.pending]} />
            <View style={styles.info}>
                <Text style={[styles.name, isCompleted && styles.nameCompleted]}>{name}</Text>
                <Text style={styles.meta}>{sets} sets × {reps} reps{weight ? ` • ${weight}kg` : ''}</Text>
            </View>
            {isCompleted ? (
                <Ionicons name="checkmark-circle" size={22} color="#00D4AA" />
            ) : (
                <Ionicons name="chevron-forward" size={18} color="#484F58" />
            )}
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#161B22' },
    rowActive: { backgroundColor: '#1C212820' },
    indicator: { width: 4, height: 32, borderRadius: 2, marginRight: 14 },
    completed: { backgroundColor: '#00D4AA' },
    active: { backgroundColor: '#FF6B35' },
    pending: { backgroundColor: '#2D3748' },
    info: { flex: 1 },
    name: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
    nameCompleted: { color: '#8B949E', textDecorationLine: 'line-through' },
    meta: { color: '#8B949E', fontSize: 12, marginTop: 2 },
});
