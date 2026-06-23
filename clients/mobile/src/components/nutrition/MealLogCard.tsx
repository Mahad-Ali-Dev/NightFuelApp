import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/ui/Card';
import { colors } from '@/theme';

interface MealLogCardProps {
    name: string;
    time: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    mealType?: string;
    onPress?: () => void;
}

function MealLogCardComponent({ name, time, calories, protein, carbs, fat, mealType = 'Meal', onPress }: MealLogCardProps) {
    return (
        <TouchableOpacity activeOpacity={0.8} onPress={onPress}>
            <Card style={styles.card}>
                <View style={styles.row}>
                    <View style={styles.iconBg}>
                        <Ionicons name="restaurant" size={18} color="#A8CC3C" />
                    </View>
                    <View style={styles.info}>
                        <Text style={styles.name}>{name}</Text>
                        <Text style={styles.meta}>{mealType} • {time}</Text>
                    </View>
                    <Text style={styles.calories}>{calories} kcal</Text>
                </View>
                <View style={styles.macrosRow}>
                    <View style={styles.macroPill}><Text style={[styles.macroText, { color: '#A8CC3C' }]}>P {protein}g</Text></View>
                    <View style={styles.macroPill}><Text style={[styles.macroText, { color: '#4FC3F7' }]}>C {carbs}g</Text></View>
                    <View style={styles.macroPill}><Text style={[styles.macroText, { color: '#FFB300' }]}>F {fat}g</Text></View>
                </View>
            </Card>
        </TouchableOpacity>
    );
}

/**
 * Memoized: all props are primitives plus a stable `onPress`. Rendered in meal
 * log lists where the parent re-renders on every new entry.
 */
export const MealLogCard = React.memo(MealLogCardComponent);

const styles = StyleSheet.create({
    card: { padding: 16, marginBottom: 12 },
    row: { flexDirection: 'row', alignItems: 'center' },
    iconBg: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#A8CC3C15', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
    info: { flex: 1 },
    name: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
    meta: { color: colors.text.secondary, fontSize: 12, marginTop: 2 },
    calories: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
    macrosRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
    macroPill: { backgroundColor: colors.background.primary, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
    macroText: { fontSize: 12, fontWeight: '600' },
});
