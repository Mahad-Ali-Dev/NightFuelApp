import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
    FadeIn,
    FadeOut,
    ZoomIn,
    useAnimatedStyle,
    useSharedValue,
    withSequence,
    withTiming,
    withDelay,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, borderRadius } from '@/theme';
import { withAlpha } from '@/theme/utils';
import { GlassCard } from '@/components/ui/GlassCard';

/**
 * In-app peak-end success affirmation for the Sleep Optimizer's "Log Rest Block"
 * action. Replaces the previous blocking `Alert.alert('Sleep Logged', …)` system
 * modal with the rewarding in-app confirmation the design brief mandates: a
 * spring-in check inside a calm purple-glow ring (the screen's sleep palette),
 * NOT white-on-lime — the tick is the functional cyan "success" accent, glow is
 * purple. Auto-dismisses after a short hold via `onHide`.
 *
 * Self-contained and non-blocking: it floats above the screen (absolute, pinned
 * just under the header, safe-area-top aware) and never traps focus the way the
 * old Alert did. Transform/opacity only (Reanimated) — never layout.
 */
interface SleepLoggedToastProps {
    /** When true the toast animates in; flips false after `durationMs` via onHide. */
    visible: boolean;
    /** Fired once the auto-hide timer elapses so the parent can clear `visible`. */
    onHide: () => void;
    /** How long the affirmation stays up before auto-hiding. Default 2200ms. */
    durationMs?: number;
}

function SleepLoggedToastComponent({ visible, onHide, durationMs = 2200 }: SleepLoggedToastProps) {
    const { colors, typography, spacing, shadows } = useTheme();
    const insets = useSafeAreaInsets();

    // A soft glow pulse on the success ring — a single ease-out swell that reads
    // as a gentle "breath" of light rather than a flashing neon. Drives the ring's
    // shadow opacity via opacity on an overlay (transform/opacity only).
    const pulse = useSharedValue(0);

    useEffect(() => {
        if (!visible) return;
        pulse.value = 0;
        pulse.value = withDelay(
            80,
            withSequence(withTiming(1, { duration: 320 }), withTiming(0.55, { duration: 520 })),
        );
        const t = setTimeout(onHide, durationMs);
        return () => clearTimeout(t);
    }, [visible, durationMs, onHide, pulse]);

    const glowStyle = useAnimatedStyle(() => ({ opacity: 0.25 + pulse.value * 0.55 }));

    if (!visible) return null;

    return (
        <Animated.View
            entering={FadeIn.duration(180)}
            exiting={FadeOut.duration(180)}
            pointerEvents="none"
            style={[styles.wrap, { top: insets.top + spacing['5xl'] }]}
        >
            <Animated.View
                entering={ZoomIn.springify().damping(15).mass(0.7)}
                accessibilityRole="text"
                accessibilityLabel="Sleep logged. Your rest block has been recorded."
                accessibilityLiveRegion="polite"
                accessible
            >
                <GlassCard
                    glow={colors.accent.purple}
                    style={[styles.card, { borderColor: withAlpha(colors.accent.purple, 0.35) }]}
                >
                    <View style={styles.row}>
                        <View style={styles.ringWrap}>
                            {/* Pulsing purple halo behind the success tick. */}
                            <Animated.View
                                style={[
                                    StyleSheet.absoluteFillObject,
                                    styles.ring,
                                    shadows.glow(colors.accent.purple),
                                    { backgroundColor: withAlpha(colors.accent.purple, 0.16) },
                                    glowStyle,
                                ]}
                            />
                            <View
                                style={[
                                    styles.ring,
                                    {
                                        backgroundColor: withAlpha(colors.accent.cyan, 0.16),
                                        borderColor: withAlpha(colors.accent.cyan, 0.4),
                                    },
                                ]}
                            >
                                <Ionicons name="checkmark" size={22} color={colors.accent.cyan} />
                            </View>
                        </View>
                        <View style={styles.textCol}>
                            <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: '700' }]}>
                                Sleep logged
                            </Text>
                            <Text style={[typography.bodySm, { color: colors.text.secondary }]}>
                                Recovery recorded.
                            </Text>
                        </View>
                    </View>
                </GlassCard>
            </Animated.View>
        </Animated.View>
    );
}

/**
 * Memoized: `visible`/`durationMs` are primitives and the parent passes a stable
 * `onHide`. No internal state beyond the Reanimated shared value.
 */
export const SleepLoggedToast = React.memo(SleepLoggedToastComponent);

const styles = StyleSheet.create({
    wrap: {
        position: 'absolute',
        left: 0,
        right: 0,
        alignItems: 'center',
        zIndex: 50,
    },
    card: {
        paddingVertical: 14,
        paddingHorizontal: 18,
        borderRadius: borderRadius.xl,
    },
    row: { flexDirection: 'row', alignItems: 'center' },
    ringWrap: { width: 40, height: 40, marginRight: 14, alignItems: 'center', justifyContent: 'center' },
    ring: {
        width: 40,
        height: 40,
        borderRadius: borderRadius.full,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    textCol: { justifyContent: 'center' },
});
