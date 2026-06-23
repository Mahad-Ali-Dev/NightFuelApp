import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/ui/Card';
import { colors } from '@/theme';

interface NextMealCardProps {
    label: string;
    description: string;
    time: string;
    macros?: { pro: number; carb: number; fat: number };
    onLog?: () => void;
    onEdit?: () => void;
}

function NextMealCardComponent({ label, description, time, macros, onLog, onEdit }: NextMealCardProps) {
    return (
        <Card style={styles.card}>
            <View style={styles.header}>
                <Text style={styles.headerLabel}>UP NEXT • {time}</Text>
                <View style={styles.iconBg}>
                    <Ionicons name="restaurant" size={20} color="#A8CC3C" />
                </View>
            </View>
            <Text style={styles.title}>{label}</Text>
            <Text style={styles.description}>{description}</Text>
            {macros && (
                <View style={styles.macrosRow}>
                    {[{ name: 'Protein', val: macros.pro }, { name: 'Carbs', val: macros.carb }, { name: 'Fat', val: macros.fat }].map((m) => (
                        <View key={m.name} style={styles.macroPill}>
                            <Text style={styles.macroLabel}>{m.name}</Text>
                            <Text style={styles.macroValue}>{m.val}g</Text>
                        </View>
                    ))}
                </View>
            )}
            <View style={styles.actions}>
                <TouchableOpacity style={styles.logBtn} onPress={onLog} activeOpacity={0.85}>
                    <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
                    <Text style={styles.logBtnText}>Log Meal</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.editBtn} onPress={onEdit} activeOpacity={0.85}>
                    <Ionicons name="pencil" size={20} color="#FFFFFF" />
                </TouchableOpacity>
            </View>
        </Card>
    );
}

/**
 * Memoized: `label`/`description`/`time` are strings and the handlers are
 * stable. `macros` is a small object — when passed inline the shallow compare
 * just won't skip, which is behavior-identical.
 */
export const NextMealCard = React.memo(NextMealCardComponent);

const styles = StyleSheet.create({
    card: { backgroundColor: colors.background.secondary, borderColor: '#A8CC3C50', borderWidth: 1, borderRadius: 24, padding: 20, marginBottom: 20, borderLeftWidth: 4, borderLeftColor: '#A8CC3C' },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
    headerLabel: { color: '#A8CC3C', fontWeight: '800', letterSpacing: 1, fontSize: 12 },
    iconBg: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#A8CC3C20', alignItems: 'center', justifyContent: 'center' },
    title: { color: '#FFFFFF', fontSize: 24, fontWeight: '700', marginTop: -12 },
    description: { color: colors.text.secondary, fontSize: 14, marginTop: 4, marginBottom: 16 },
    macrosRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
    macroPill: { backgroundColor: colors.background.primary, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center', flex: 1 },
    macroLabel: { color: colors.text.secondary, fontSize: 11 },
    macroValue: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
    actions: { flexDirection: 'row', gap: 12 },
    logBtn: { flex: 1, backgroundColor: '#A8CC3C', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 52, borderRadius: 26 },
    logBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16, marginLeft: 8 },
    editBtn: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.border.default, alignItems: 'center', justifyContent: 'center' },
});
