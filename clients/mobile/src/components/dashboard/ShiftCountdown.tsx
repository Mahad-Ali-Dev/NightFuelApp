import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface ShiftCountdownProps {
    shiftEndTime: Date | string | null;
}

export function ShiftCountdown({ shiftEndTime }: ShiftCountdownProps) {
    const [remaining, setRemaining] = useState({ hours: 0, mins: 0 });

    useEffect(() => {
        if (!shiftEndTime) return;
        const update = () => {
            const ms = Math.max(0, new Date(shiftEndTime).getTime() - Date.now());
            setRemaining({
                hours: Math.floor(ms / (1000 * 60 * 60)),
                mins: Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60)),
            });
        };
        update();
        const interval = setInterval(update, 30000);
        return () => clearInterval(interval);
    }, [shiftEndTime]);

    return (
        <View style={styles.container}>
            <Text style={styles.label}>Your shift ends</Text>
            <Text style={styles.countdown}>
                in <Text style={styles.hours}>{remaining.hours}h </Text>
                <Text style={styles.mins}>{remaining.mins}m</Text>
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { marginTop: 12 },
    label: { color: '#FFFFFF', fontSize: 36, fontWeight: '800', lineHeight: 42 },
    countdown: { color: '#FFFFFF', fontSize: 36, fontWeight: '800', lineHeight: 42 },
    hours: { color: '#A8CC3C' },
    mins: { color: '#A78BFA' },
});
