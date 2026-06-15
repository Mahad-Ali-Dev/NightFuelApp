import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors } from '@/theme';

interface RestTimerProps {
    durationSeconds: number;
    isRunning: boolean;
    onFinish?: () => void;
    size?: number;
}

export function RestTimer({ durationSeconds, isRunning, onFinish, size = 140 }: RestTimerProps) {
    const [remaining, setRemaining] = useState(durationSeconds);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const radius = (size - 16) / 2;
    const circumference = 2 * Math.PI * radius;
    const progress = durationSeconds > 0 ? remaining / durationSeconds : 0;

    useEffect(() => {
        setRemaining(durationSeconds);
    }, [durationSeconds]);

    useEffect(() => {
        if (isRunning && remaining > 0) {
            intervalRef.current = setInterval(() => {
                setRemaining((prev) => {
                    if (prev <= 1) {
                        if (intervalRef.current) clearInterval(intervalRef.current);
                        onFinish?.();
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        }
        return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    }, [isRunning, durationSeconds]);

    const mins = Math.floor(remaining / 60);
    const secs = remaining % 60;

    return (
        <View style={[styles.container, { width: size, height: size }]}>
            <Svg width={size} height={size}>
                <Circle cx={size / 2} cy={size / 2} r={radius} stroke={colors.border.light} strokeWidth={10} fill="none" />
                <Circle
                    cx={size / 2} cy={size / 2} r={radius}
                    stroke="#FF6B35" strokeWidth={10} fill="none"
                    strokeDasharray={`${circumference * progress} ${circumference * (1 - progress)}`}
                    strokeLinecap="round"
                    transform={`rotate(-90 ${size / 2} ${size / 2})`}
                />
            </Svg>
            <View style={styles.center}>
                <Text style={styles.time}>{String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}</Text>
                <Text style={styles.label}>REST</Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { alignItems: 'center', justifyContent: 'center' },
    center: { position: 'absolute', alignItems: 'center' },
    time: { color: '#FFFFFF', fontSize: 32, fontWeight: '800', fontFamily: 'monospace' },
    label: { color: '#FF6B35', fontSize: 12, fontWeight: '800', letterSpacing: 2, marginTop: 4 },
});
