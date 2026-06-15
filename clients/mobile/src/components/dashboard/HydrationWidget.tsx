import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/ui/Card';
import { colors } from '@/theme';

interface HydrationWidgetProps {
    currentMl: number;
    targetMl: number;
    onAddWater?: (ml: number) => void;
}

function HydrationWidgetComponent({ currentMl, targetMl, onAddWater }: HydrationWidgetProps) {
    const currentL = (currentMl / 1000).toFixed(1);
    const targetL = (targetMl / 1000).toFixed(1);
    const pct = Math.min(100, (currentMl / targetMl) * 100);

    return (
        <Card style={styles.card}>
            <View style={styles.header}>
                <Text style={styles.title}>Hydration</Text>
                <Ionicons name="water" size={20} color="#4FC3F7" />
            </View>
            <View style={styles.metrics}>
                <Text style={styles.currentValue}>{currentL}</Text>
                <Text style={styles.target}>/ {targetL} L</Text>
            </View>
            <View style={styles.barBg}>
                <View style={[styles.barFill, { width: `${pct}%` }]} />
            </View>
            <TouchableOpacity style={styles.addBtn} onPress={() => onAddWater?.(250)} activeOpacity={0.85}>
                <Text style={styles.addBtnText}>+ Add 250ml</Text>
            </TouchableOpacity>
        </Card>
    );
}

/**
 * Memoized: numeric props plus a stable `onAddWater` callback, no state.
 */
export const HydrationWidget = React.memo(HydrationWidgetComponent);

const styles = StyleSheet.create({
    card: { flex: 1, backgroundColor: colors.background.secondary, borderColor: colors.border.default, borderWidth: 1, borderRadius: 20, padding: 16 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
    title: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
    metrics: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
    currentValue: { color: '#FFFFFF', fontSize: 28, fontWeight: '700' },
    target: { color: colors.text.secondary, fontSize: 14, marginLeft: 4, marginTop: 8 },
    barBg: { height: 8, backgroundColor: colors.border.light, borderRadius: 4, marginBottom: 16 },
    barFill: { height: '100%', backgroundColor: '#4FC3F7', borderRadius: 4 },
    addBtn: { alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderWidth: 1, borderColor: '#4FC3F740', borderRadius: 16 },
    addBtnText: { color: '#4FC3F7', fontWeight: '600', fontSize: 12 },
});
