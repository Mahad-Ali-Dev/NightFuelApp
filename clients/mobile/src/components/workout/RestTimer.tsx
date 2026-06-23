import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors } from '@/theme';
import { typography as typo } from '@/theme/typography';

interface RestTimerProps {
    durationSeconds: number;
    isRunning: boolean;
    onFinish?: () => void;
    size?: number;
}

/**
 * Builds a screen-reader label from the remaining whole seconds, e.g.
 *   90 → "Rest timer, 1 minute 30 seconds remaining"
 *   60 → "Rest timer, 1 minute remaining"
 *    5 → "Rest timer, 5 seconds remaining"
 *    0 → "Rest timer, finished"
 * Pure (no clock/Date): derived purely from the `remaining` argument so it is
 * trivially testable and matches the rendered MM:SS.
 */
export function formatRestA11yLabel(remaining: number): string {
    const total = Math.max(0, Math.floor(remaining));
    if (total === 0) return 'Rest timer, finished';
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    const parts: string[] = [];
    if (mins > 0) parts.push(`${mins} ${mins === 1 ? 'minute' : 'minutes'}`);
    if (secs > 0) parts.push(`${secs} ${secs === 1 ? 'second' : 'seconds'}`);
    return `Rest timer, ${parts.join(' ')} remaining`;
}

export function RestTimer({ durationSeconds, isRunning, onFinish, size = 140 }: RestTimerProps) {
    const [remaining, setRemaining] = useState(durationSeconds);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    // Hold the latest onFinish in a ref so the ticking effect does not have to
    // depend on it (a new closure each render would otherwise tear down and
    // recreate the interval, dropping a second off the countdown).
    const onFinishRef = useRef(onFinish);
    useEffect(() => {
        onFinishRef.current = onFinish;
    }, [onFinish]);

    const radius = (size - 16) / 2;
    const circumference = 2 * Math.PI * radius;
    const progress = durationSeconds > 0 ? remaining / durationSeconds : 0;

    // Reset the countdown whenever the parent hands us a new duration.
    useEffect(() => {
        setRemaining(durationSeconds);
    }, [durationSeconds]);

    // Interval lifecycle. `remaining` is in the dependency array on purpose:
    //   - resume (isRunning false→true) and re-arm (remaining 0→positive while
    //     running) both re-run this effect, so a paused/finished timer restarts
    //     correctly — the previously-broken resume path.
    //   - the per-second decrement also re-runs it, but we always clear the
    //     prior interval first (and in cleanup), so exactly one interval is
    //     ever live and no tick is leaked.
    useEffect(() => {
        // Clear any prior interval before (re)starting so we never stack two.
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }

        if (isRunning && remaining > 0) {
            intervalRef.current = setInterval(() => {
                setRemaining((prev) => {
                    if (prev <= 1) {
                        // Clear BEFORE firing onFinish so a second tick can't
                        // re-enter and call onFinish twice.
                        if (intervalRef.current) {
                            clearInterval(intervalRef.current);
                            intervalRef.current = null;
                        }
                        onFinishRef.current?.();
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        }

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };
    }, [isRunning, remaining]);

    const mins = Math.floor(remaining / 60);
    const secs = remaining % 60;

    return (
        <View
            style={[styles.container, { width: size, height: size }]}
            accessible
            accessibilityRole="timer"
            accessibilityLabel={formatRestA11yLabel(remaining)}
        >
            <Svg width={size} height={size}>
                <Circle cx={size / 2} cy={size / 2} r={radius} stroke={colors.border.light} strokeWidth={10} fill="none" />
                <Circle
                    cx={size / 2} cy={size / 2} r={radius}
                    stroke={colors.accent.coral} strokeWidth={10} fill="none"
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
    // Big condensed stat numerals (Barlow Condensed via typo.statMedium), matching
    // the workout screen's live clock / focus value — not the off-brand 'monospace'
    // clock. Size stays 32 (statMedium.fontSize) so the dial layout is unchanged.
    time: { color: colors.text.primary, fontSize: typo.statMedium.fontSize, fontFamily: typo.statMedium.fontFamily },
    label: { color: colors.accent.coral, fontSize: 12, fontFamily: typo.overline.fontFamily, letterSpacing: 2, marginTop: 4 },
});
