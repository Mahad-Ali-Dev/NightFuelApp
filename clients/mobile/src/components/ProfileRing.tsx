/**
 * ProfileRing — the More-tab hero avatar wrapped in a real animated progress ring.
 *
 * Replaces the old purely-decorative lime gradient border on the More screen's
 * avatar with a genuine react-native-svg progress arc that springs from 0 to the
 * supplied `progress` (0–1) on mount — gamifying the hero per the brand brief
 * (rings / progress, never a static label grid). The arc is driven on the UI
 * thread via Reanimated's `useAnimatedProps(strokeDashoffset)` exactly like the
 * onboarding `OptimizationRing`, so there are no per-frame JS re-renders.
 *
 * The center hole hosts whatever the caller passes (the avatar Image, or a
 * branded initials/person fallback) — this component owns ZERO app state or data
 * and is purely presentational. The percentage it paints is computed by the
 * screen from already-fetched profile fields, so the ring never implies data we
 * don't have.
 */
import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import Animated, {
    useSharedValue,
    useAnimatedProps,
    withDelay,
    withTiming,
    Easing,
} from 'react-native-reanimated';
import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/utils';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export interface ProfileRingProps {
    /** Target fill fraction, 0–1. The arc animates to this on mount. */
    progress: number;
    /** Overall ring diameter. */
    size?: number;
    strokeWidth?: number;
    /** Arc color. Defaults to the brand lime. */
    color?: string;
    /** Avatar / fallback rendered inside the ring hole. */
    children?: React.ReactNode;
}

export function ProfileRing({
    progress,
    size = 84,
    strokeWidth = 4,
    color,
    children,
}: ProfileRingProps) {
    const { colors } = useTheme();
    const arc = color ?? colors.accent.coral;

    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const center = size / 2;

    // Animated fill fraction (0–1). Springs to `progress` once on mount.
    const fill = useSharedValue(0);

    useEffect(() => {
        const clamped = Math.min(1, Math.max(0, progress));
        fill.value = withDelay(
            180,
            withTiming(clamped, { duration: 1000, easing: Easing.out(Easing.cubic) }),
        );
    }, [progress, fill]);

    const animatedProps = useAnimatedProps(() => ({
        strokeDashoffset: circumference * (1 - fill.value),
    }));

    return (
        <View style={[styles.wrap, { width: size, height: size }]}>
            <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
                <Defs>
                    <SvgLinearGradient id="profileRing" x1="0" y1="0" x2="1" y2="1">
                        <Stop offset="0" stopColor={arc} stopOpacity={0.85} />
                        <Stop offset="1" stopColor={arc} stopOpacity={1} />
                    </SvgLinearGradient>
                </Defs>
                {/* Track */}
                <Circle
                    cx={center}
                    cy={center}
                    r={radius}
                    stroke={withAlpha(colors.text.primary, 0.1)}
                    strokeWidth={strokeWidth}
                    fill="none"
                />
                {/* Animated arc */}
                <AnimatedCircle
                    cx={center}
                    cy={center}
                    r={radius}
                    stroke="url(#profileRing)"
                    strokeWidth={strokeWidth}
                    fill="none"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    animatedProps={animatedProps}
                    transform={`rotate(-90 ${center} ${center})`}
                />
            </Svg>
            {children}
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: { alignItems: 'center', justifyContent: 'center' },
});
