import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/ui/Card';
import { CircularProgress } from '@/components/ui/CircularProgress';

interface SleepWindowCardProps {
    targetTime: string;
    progress: number; // 0-1
    hint?: string;
}

export function SleepWindowCard({ targetTime, progress, hint = 'Melatonin rising in 3h' }: SleepWindowCardProps) {
    return (
        <Card style={styles.card}>
            <View style={styles.header}>
                <Ionicons name="moon" size={20} color="#00D4AA" />
                <Text style={styles.title}>Sleep Window</Text>
            </View>
            <View style={styles.ringContainer}>
                <CircularProgress progress={progress} size={90} strokeWidth={8} color="#00D4AA" trackColor="#2D3748" />
                <View style={styles.ringInner}>
                    <Text style={styles.time}>{targetTime}</Text>
                    <Text style={styles.label}>Target</Text>
                </View>
            </View>
            <Text style={styles.hint}>{hint}</Text>
        </Card>
    );
}

const styles = StyleSheet.create({
    card: { flex: 1, backgroundColor: '#161B22', borderColor: '#21262D', borderWidth: 1, borderRadius: 20, padding: 16 },
    header: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
    title: { color: '#FFFFFF', fontSize: 16, fontWeight: '600', marginLeft: 8 },
    ringContainer: { alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
    ringInner: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
    time: { color: '#FFFFFF', fontSize: 20, fontWeight: '700' },
    label: { color: '#8B949E', fontSize: 10 },
    hint: { color: '#8B949E', textAlign: 'center', fontSize: 12, marginTop: -4 },
});
