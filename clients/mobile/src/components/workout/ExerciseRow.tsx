import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme';

interface ExerciseRowProps {
    name: string;
    sets: number;
    reps: number;
    weight?: number;
    isCompleted?: boolean;
    isActive?: boolean;
    onPress?: () => void;
}

function ExerciseRowComponent({ name, sets, reps, weight, isCompleted, isActive, onPress }: ExerciseRowProps) {
    const { colors } = useTheme();
    const styles = useMemo(() => makeStyles(colors), [colors]);
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
                <Ionicons name="chevron-forward" size={18} color={colors.text.tertiary} />
            )}
        </TouchableOpacity>
    );
}

/**
 * Memoized: primitive props plus a stable `onPress`. Designed to render in
 * exercise lists, so skipping unchanged rows on parent re-render is a win.
 */
export const ExerciseRow = React.memo(ExerciseRowComponent);

const makeStyles = (colors: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: colors.background.secondary },
    rowActive: { backgroundColor: '#1C212820' },
    indicator: { width: 4, height: 32, borderRadius: 2, marginRight: 14 },
    completed: { backgroundColor: '#00D4AA' },
    active: { backgroundColor: '#A8CC3C' },
    pending: { backgroundColor: colors.border.light },
    info: { flex: 1 },
    name: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
    nameCompleted: { color: colors.text.secondary, textDecorationLine: 'line-through' },
    meta: { color: colors.text.secondary, fontSize: 12, marginTop: 2 },
});
