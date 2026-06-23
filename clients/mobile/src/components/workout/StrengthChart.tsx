import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '@/theme';

interface DataPoint {
    date: string;
    value: number;
}

interface StrengthChartProps {
    exerciseName: string;
    data: DataPoint[];
    unit?: string;
}

function StrengthChartComponent({ exerciseName, data, unit = 'kg' }: StrengthChartProps) {
    // Derived min/max/range — memoized so we don't re-scan the series on every
    // unrelated re-render. Recomputes only when `data` changes.
    const { maxVal, minVal, range } = useMemo(() => {
        if (data.length === 0) return { maxVal: 0, minVal: 0, range: 1 };
        const max = Math.max(...data.map((d) => d.value));
        const min = Math.min(...data.map((d) => d.value));
        return { maxVal: max, minVal: min, range: max - min || 1 };
    }, [data]);

    if (data.length === 0) return null;

    return (
        <View style={styles.container}>
            <Text style={styles.title}>1RM Trend</Text>
            <Text style={styles.exercise}>{exerciseName}</Text>
            <View style={styles.chartArea}>
                {data.map((point, i) => {
                    const pct = ((point.value - minVal) / range) * 80 + 10;
                    return (
                        <View key={i} style={styles.barCol}>
                            <View style={[styles.bar, { height: `${pct}%` }]} />
                            <Text style={styles.value}>{point.value}</Text>
                            <Text style={styles.date}>{point.date}</Text>
                        </View>
                    );
                })}
            </View>
            <View style={styles.summary}>
                <View style={styles.summaryItem}>
                    <Text style={styles.summaryLabel}>Current</Text>
                    <Text style={styles.summaryValue}>{data[data.length - 1]?.value} {unit}</Text>
                </View>
                <View style={styles.summaryItem}>
                    <Text style={styles.summaryLabel}>Peak</Text>
                    <Text style={[styles.summaryValue, { color: '#00D4AA' }]}>{maxVal} {unit}</Text>
                </View>
            </View>
        </View>
    );
}

/**
 * Memoized: `exerciseName`/`unit` are strings and `data` is typically a stable
 * query result. The min/max/range scan is memoized internally via useMemo.
 */
export const StrengthChart = React.memo(StrengthChartComponent);

const styles = StyleSheet.create({
    container: { backgroundColor: colors.background.secondary, borderRadius: 24, padding: 20, borderWidth: 1, borderColor: colors.border.default },
    title: { color: '#A8CC3C', fontSize: 12, fontWeight: '800', letterSpacing: 1 },
    exercise: { color: '#FFFFFF', fontSize: 18, fontWeight: '700', marginTop: 4, marginBottom: 16 },
    chartArea: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end', height: 120, marginBottom: 16 },
    barCol: { alignItems: 'center', flex: 1 },
    bar: { width: 20, backgroundColor: '#4FC3F7', borderRadius: 4, minHeight: 4 },
    value: { color: '#FFFFFF', fontSize: 10, fontWeight: '700', marginTop: 4 },
    date: { color: colors.text.tertiary, fontSize: 9, marginTop: 2 },
    summary: { flexDirection: 'row', justifyContent: 'space-around', borderTopWidth: 1, borderTopColor: colors.border.light, paddingTop: 12 },
    summaryItem: { alignItems: 'center' },
    summaryLabel: { color: colors.text.secondary, fontSize: 12 },
    summaryValue: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', marginTop: 2 },
});
