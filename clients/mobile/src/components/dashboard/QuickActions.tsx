import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme';

interface QuickAction {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    color: string;
    onPress?: () => void;
}

interface QuickActionsProps {
    actions?: QuickAction[];
}

const DEFAULT_ACTIONS: QuickAction[] = [
    { icon: 'water', label: 'Hydrate', color: '#4FC3F7' },
    { icon: 'restaurant', label: 'Log Meal', color: '#A8CC3C' },
    { icon: 'barbell', label: 'Workout', color: '#00D4AA' },
    { icon: 'moon', label: 'Sleep', color: '#A78BFA' },
];

export function QuickActions({ actions = DEFAULT_ACTIONS }: QuickActionsProps) {
    const { colors } = useTheme();
    const styles = useMemo(() => makeStyles(colors), [colors]);
    return (
        <View style={styles.grid}>
            {actions.map((action) => (
                <TouchableOpacity key={action.label} style={styles.item} onPress={action.onPress} activeOpacity={0.7}>
                    <View style={[styles.iconBg, { backgroundColor: action.color + '20' }]}>
                        <Ionicons name={action.icon} size={24} color={action.color} />
                    </View>
                    <Text style={styles.label}>{action.label}</Text>
                </TouchableOpacity>
            ))}
        </View>
    );
}

const makeStyles = (colors: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
    grid: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 20 },
    item: { alignItems: 'center', flex: 1 },
    iconBg: { width: 56, height: 56, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
    label: { color: colors.text.secondary, fontSize: 12, fontWeight: '600' },
});
