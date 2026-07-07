import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useTheme } from '@/theme';

interface CircadianClockProps {
    currentPhase?: string;
    melatoninOnset?: string;
    alertnessScore?: number;
    size?: number;
}

function CircadianClockComponent({ currentPhase = 'Active', alertnessScore = 72, size = 160 }: CircadianClockProps) {
    const { colors } = useTheme();
    const styles = useMemo(() => makeStyles(colors), [colors]);
    const radius = (size - 16) / 2;
    const circumference = 2 * Math.PI * radius;
    const progress = alertnessScore / 100;

    return (
        <View style={[styles.container, { width: size, height: size }]}>
            <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                <Circle
                    cx={size / 2} cy={size / 2} r={radius}
                    stroke={colors.border.light} strokeWidth={8} fill="none"
                />
                <Circle
                    cx={size / 2} cy={size / 2} r={radius}
                    stroke="#00D4AA" strokeWidth={8} fill="none"
                    strokeDasharray={`${circumference * progress} ${circumference * (1 - progress)}`}
                    strokeLinecap="round"
                    transform={`rotate(-90 ${size / 2} ${size / 2})`}
                />
            </Svg>
            <View style={styles.center}>
                <Text style={styles.score}>{alertnessScore}</Text>
                <Text style={styles.phase}>{currentPhase}</Text>
            </View>
        </View>
    );
}

/**
 * Memoized: all props are primitives and there's no state — a pure SVG gauge.
 */
export const CircadianClock = React.memo(CircadianClockComponent);

const makeStyles = (colors: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
    container: { alignItems: 'center', justifyContent: 'center' },
    center: { position: 'absolute', alignItems: 'center' },
    score: { color: '#FFFFFF', fontSize: 32, fontWeight: '800' },
    phase: { color: colors.text.secondary, fontSize: 12, marginTop: 2 },
});
