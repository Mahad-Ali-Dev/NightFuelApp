import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/ui/Card';

interface NextMealCardProps {
    label: string;
    description: string;
    time: string;
    macros?: { pro: number; carb: number; fat: number };
    onLog?: () => void;
    onEdit?: () => void;
}

export function NextMealCard({ label, description, time, macros, onLog, onEdit }: NextMealCardProps) {
    return (
        <Card style={styles.card}>
            <View style={styles.header}>
                <Text style={styles.headerLabel}>UP NEXT • {time}</Text>
                <View style={styles.iconBg}>
                    <Ionicons name="restaurant" size={20} color="#FF6B35" />
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
                <TouchableOpacity style={styles.logBtn} onPress={onLog}>
                    <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
                    <Text style={styles.logBtnText}>Log Meal</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.editBtn} onPress={onEdit}>
                    <Ionicons name="pencil" size={20} color="#FFFFFF" />
                </TouchableOpacity>
            </View>
        </Card>
    );
}

const styles = StyleSheet.create({
    card: { backgroundColor: '#161B22', borderColor: '#FF6B3550', borderWidth: 1, borderRadius: 24, padding: 20, marginBottom: 20, borderLeftWidth: 4, borderLeftColor: '#FF6B35' },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
    headerLabel: { color: '#FF6B35', fontWeight: '800', letterSpacing: 1, fontSize: 12 },
    iconBg: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#FF6B3520', alignItems: 'center', justifyContent: 'center' },
    title: { color: '#FFFFFF', fontSize: 24, fontWeight: '700', marginTop: -12 },
    description: { color: '#8B949E', fontSize: 14, marginTop: 4, marginBottom: 16 },
    macrosRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
    macroPill: { backgroundColor: '#0D1117', borderRadius: 16, paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center', flex: 1 },
    macroLabel: { color: '#8B949E', fontSize: 11 },
    macroValue: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
    actions: { flexDirection: 'row', gap: 12 },
    logBtn: { flex: 1, backgroundColor: '#FF6B35', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 52, borderRadius: 26 },
    logBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16, marginLeft: 8 },
    editBtn: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#21262D', alignItems: 'center', justifyContent: 'center' },
});
