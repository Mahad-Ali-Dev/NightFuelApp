import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/ui/Card';
import { CircularProgress } from '@/components/ui/CircularProgress';
import { colors } from '@/theme';

interface SleepWindowCardProps {
    targetTime: string;
    progress: number; // 0-1
    hint?: string;
}

function SleepWindowCardComponent({ targetTime, progress, hint = 'Melatonin rising in 3h' }: SleepWindowCardProps) {
    return (
        <Card style={styles.card}>
            <View style={styles.header}>
                <Ionicons name="moon" size={20} color="#00D4AA" />
                <Text style={styles.title}>Sleep Window</Text>
            </View>
            <View style={styles.ringContainer}>
                <CircularProgress progress={progress} size={90} strokeWidth={8} color="#00D4AA" trackColor={colors.border.light} />
                <View style={styles.ringInner}>
                    <Text style={styles.time}>{targetTime}</Text>
                    <Text style={styles.label}>Target</Text>
                </View>
            </View>
            <Text style={styles.hint}>{hint}</Text>
        </Card>
    );
}

/**
 * Memoized: all props are primitives (string/number) and there's no state.
 */
export const SleepWindowCard = React.memo(SleepWindowCardComponent);

const styles = StyleSheet.create({
    card: { flex: 1, backgroundColor: colors.background.secondary, borderColor: colors.border.default, borderWidth: 1, borderRadius: 20, padding: 16 },
    header: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
    title: { color: '#FFFFFF', fontSize: 16, fontWeight: '600', marginLeft: 8 },
    ringContainer: { alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
    ringInner: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
    time: { color: '#FFFFFF', fontSize: 20, fontWeight: '700' },
    label: { color: colors.text.secondary, fontSize: 10 },
    hint: { color: colors.text.secondary, textAlign: 'center', fontSize: 12, marginTop: -4 },
});
