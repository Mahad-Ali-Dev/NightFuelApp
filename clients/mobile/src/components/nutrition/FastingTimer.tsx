import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme';

interface FastingTimerProps {
    isFasting: boolean;
    elapsedMinutes: number;
    targetMinutes?: number; // e.g., 960 for 16:8
    onToggle?: () => void;
}

export function FastingTimer({ isFasting, elapsedMinutes, targetMinutes = 960, onToggle }: FastingTimerProps) {
    const { colors } = useTheme();
    const styles = useMemo(() => makeStyles(colors), [colors]);
    const [elapsed, setElapsed] = useState(elapsedMinutes);

    useEffect(() => {
        setElapsed(elapsedMinutes);
        if (!isFasting) return;
        const interval = setInterval(() => setElapsed((e) => e + 1), 60000);
        return () => clearInterval(interval);
    }, [elapsedMinutes, isFasting]);

    const hours = Math.floor(elapsed / 60);
    const mins = elapsed % 60;
    const pct = Math.min(100, (elapsed / targetMinutes) * 100);
    const targetH = Math.floor(targetMinutes / 60);

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <View style={styles.headerLeft}>
                    <Ionicons name="timer" size={18} color="#A8CC3C" />
                    <Text style={styles.headerText}>FASTING</Text>
                </View>
                <Text style={styles.protocol}>{targetH}:{String(targetMinutes % 60).padStart(2, '0')} Protocol</Text>
            </View>

            <View style={styles.timerRow}>
                <Text style={styles.time}>{String(hours).padStart(2, '0')}:{String(mins).padStart(2, '0')}</Text>
                <Text style={styles.unit}> / {targetH}h</Text>
            </View>

            <View style={styles.barBg}>
                <View style={[styles.barFill, { width: `${pct}%` }]} />
            </View>

            <TouchableOpacity style={[styles.toggleBtn, isFasting ? styles.stopBtn : styles.startBtn]} onPress={onToggle} activeOpacity={0.85}>
                <Ionicons name={isFasting ? 'stop-circle' : 'play-circle'} size={20} color="#FFFFFF" />
                <Text style={styles.toggleText}>{isFasting ? 'Break Fast' : 'Start Fast'}</Text>
            </TouchableOpacity>
        </View>
    );
}

const makeStyles = (colors: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
    container: { backgroundColor: colors.background.secondary, borderRadius: 24, padding: 20, borderWidth: 1, borderColor: colors.border.default, marginBottom: 16 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    headerText: { color: '#A8CC3C', fontWeight: '800', fontSize: 12, letterSpacing: 1 },
    protocol: { color: colors.text.secondary, fontSize: 12 },
    timerRow: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 16 },
    time: { color: '#FFFFFF', fontSize: 42, fontWeight: '800', fontFamily: 'monospace' },
    unit: { color: colors.text.secondary, fontSize: 16 },
    barBg: { height: 6, backgroundColor: colors.border.light, borderRadius: 3, marginBottom: 16 },
    barFill: { height: '100%', backgroundColor: '#A8CC3C', borderRadius: 3 },
    toggleBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 44, borderRadius: 22, gap: 8 },
    startBtn: { backgroundColor: '#00D4AA' },
    stopBtn: { backgroundColor: '#FF4444' },
    toggleText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
});
