import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors } from '@/theme';

interface MacroRing {
    label: string;
    current: number;
    target: number;
    color: string;
}

interface MacroRingsProps {
    protein: MacroRing;
    carbs: MacroRing;
    fat: MacroRing;
    calories?: { current: number; target: number };
}

function Ring({ label, current, target, color, size = 70 }: MacroRing & { size?: number }) {
    const radius = (size - 10) / 2;
    const circumference = 2 * Math.PI * radius;
    const progress = target > 0 ? Math.min(1, current / target) : 0;

    return (
        <View style={styles.ringItem}>
            <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
                <Svg width={size} height={size}>
                    <Circle cx={size / 2} cy={size / 2} r={radius} stroke={colors.border.light} strokeWidth={6} fill="none" />
                    <Circle
                        cx={size / 2} cy={size / 2} r={radius}
                        stroke={color} strokeWidth={6} fill="none"
                        strokeDasharray={`${circumference * progress} ${circumference * (1 - progress)}`}
                        strokeLinecap="round"
                        transform={`rotate(-90 ${size / 2} ${size / 2})`}
                    />
                </Svg>
                <Text style={styles.ringValue}>{current}g</Text>
            </View>
            <Text style={styles.ringLabel}>{label}</Text>
        </View>
    );
}

export function MacroRings({ protein, carbs, fat, calories }: MacroRingsProps) {
    return (
        <View style={styles.container}>
            {calories && (
                <View style={styles.calorieCenter}>
                    <Text style={styles.calorieValue}>{calories.current}</Text>
                    <Text style={styles.calorieTarget}>/ {calories.target} kcal</Text>
                </View>
            )}
            <View style={styles.ringsRow}>
                <Ring {...protein} />
                <Ring {...carbs} />
                <Ring {...fat} />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { alignItems: 'center' },
    calorieCenter: { alignItems: 'center', marginBottom: 16 },
    calorieValue: { color: '#FFFFFF', fontSize: 36, fontWeight: '800' },
    calorieTarget: { color: colors.text.secondary, fontSize: 14 },
    ringsRow: { flexDirection: 'row', justifyContent: 'space-around', width: '100%' },
    ringItem: { alignItems: 'center', gap: 6 },
    ringValue: { position: 'absolute', color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
    ringLabel: { color: colors.text.secondary, fontSize: 12, fontWeight: '600' },
});
