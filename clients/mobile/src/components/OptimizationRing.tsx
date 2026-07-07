import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import Animated, {
    useSharedValue,
    useAnimatedProps,
    withTiming,
    withDelay,
    Easing,
} from 'react-native-reanimated';
import { useTheme } from '@/theme';
import { typography } from '@/theme/typography';
import { withAlpha } from '@/theme/utils';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface OptimizationRingProps {
    /** Target fill, 0–1. The ring animates to this whenever it changes. */
    progress: number;
    /** Stroke color of the animated arc (the active level's accent). */
    color: string;
    /** Big tabular value rendered in the center (e.g. "100"). */
    value: string;
    /** Small unit under the value (e.g. "% optimized"). */
    unit: string;
    /** Eyebrow over the value. */
    caption: string;
    size?: number;
    strokeWidth?: number;
}

/**
 * OptimizationRing — the onboarding "building your plan" hero.
 *
 * A premium animated SVG progress ring whose arc springs to a new fill level
 * each time the selected optimization intensity changes. Reanimated drives the
 * `strokeDashoffset` of an animated <Circle> on the UI thread (transform/opacity
 * equivalent — no JS-thread re-renders per frame); the center numeral counts via
 * a sibling timing value mirrored into React only on settle. Local + purely
 * presentational; owns no app state.
 */
export function OptimizationRing({
    progress,
    color,
    value,
    unit,
    caption,
    size = 196,
    strokeWidth = 14,
}: OptimizationRingProps) {
    const { colors } = useTheme();

    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const center = size / 2;

    // Animated fill fraction (0–1). Springs to `progress` on every change.
    const fill = useSharedValue(0);

    useEffect(() => {
        const clamped = Math.min(1, Math.max(0, progress));
        // Brief settle delay so the arc reads as a deliberate "recompute" beat.
        fill.value = withDelay(
            80,
            withTiming(clamped, { duration: 900, easing: Easing.out(Easing.cubic) }),
        );
    }, [progress, fill]);

    const animatedProps = useAnimatedProps(() => ({
        strokeDashoffset: circumference * (1 - fill.value),
    }));

    return (
        <View style={[styles.wrap, { width: size, height: size }]}>
            <Svg width={size} height={size}>
                <Defs>
                    <SvgLinearGradient id="optRing" x1="0" y1="0" x2="1" y2="1">
                        <Stop offset="0" stopColor={color} stopOpacity={0.85} />
                        <Stop offset="1" stopColor={color} stopOpacity={1} />
                    </SvgLinearGradient>
                </Defs>
                {/* Track */}
                <Circle
                    cx={center}
                    cy={center}
                    r={radius}
                    stroke={withAlpha(colors.text.primary, 0.08)}
                    strokeWidth={strokeWidth}
                    fill="none"
                />
                {/* Animated arc */}
                <AnimatedCircle
                    cx={center}
                    cy={center}
                    r={radius}
                    stroke="url(#optRing)"
                    strokeWidth={strokeWidth}
                    fill="none"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    animatedProps={animatedProps}
                    transform={`rotate(-90 ${center} ${center})`}
                />
            </Svg>
            <View style={styles.center} pointerEvents="none">
                <Text style={[styles.caption, { color: colors.text.tertiary }]}>{caption}</Text>
                <View style={styles.valueRow}>
                    <Text style={[styles.value, { color: colors.text.primary }]} maxFontSizeMultiplier={1.2}>
                        {value}
                    </Text>
                    <Text style={[styles.unit, { color }]} maxFontSizeMultiplier={1.2}>
                        %
                    </Text>
                </View>
                <Text style={[styles.unitLabel, { color: colors.text.secondary }]} maxFontSizeMultiplier={1.3}>
                    {unit}
                </Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: {
        alignItems: 'center',
        justifyContent: 'center',
        alignSelf: 'center',
    },
    center: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center',
        justifyContent: 'center',
    },
    caption: {
        fontFamily: typography.overline.fontFamily,
        fontSize: 10,
        letterSpacing: 1.5,
        textTransform: 'uppercase',
        marginBottom: 2,
    },
    valueRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
    },
    value: {
        // Large bold tabular numeral — the brand's stat signature.
        fontFamily: typography.statLarge.fontFamily,
        fontSize: 52,
        lineHeight: 56,
        fontWeight: '900',
        fontVariant: ['tabular-nums'],
    },
    unit: {
        fontFamily: typography.statSmall.fontFamily,
        fontSize: 22,
        fontWeight: '800',
        marginLeft: 2,
    },
    unitLabel: {
        fontFamily: typography.overline.fontFamily,
        fontSize: 10,
        letterSpacing: 1.2,
        textTransform: 'uppercase',
        marginTop: 4,
    },
});
