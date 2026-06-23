import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Share, Platform } from 'react-native';
import { useTheme } from '@/theme';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';
import Animated, {
    FadeInDown,
    FadeIn,
    useSharedValue,
    useAnimatedProps,
    withTiming,
    withDelay,
    Easing,
} from 'react-native-reanimated';
import { EmptyState } from '@/components/ui';
import { CountUpText } from '@/components/CountUpText';
import { withAlpha } from '@/theme/utils';
import { typography as typo } from '@/theme/typography';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

function formatElapsed(totalSeconds: number): string {
    const hours = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    if (hours > 0) {
        return `${hours}h ${mins}m`;
    }
    if (mins > 0) {
        return `${mins}m ${secs}s`;
    }
    return `${secs}s`;
}

/* ------------------------------------------------------------------ */
/* Hero badge — the peak moment: a lime accent ring sweeping in around */
/* a trophy, with a soft lime halo. The ONE full-lime key indicator.   */
/* ------------------------------------------------------------------ */
function HeroBadge({ color, glow }: { color: string; glow: import('react-native').ViewStyle }) {
    const { colors } = useTheme();
    const SIZE = 132;
    const STROKE = 4;
    const radius = (SIZE - STROKE) / 2;
    const circumference = 2 * Math.PI * radius;
    const center = SIZE / 2;

    const sweep = useSharedValue(0);
    useEffect(() => {
        sweep.value = withDelay(120, withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) }));
    }, [sweep]);

    const animatedProps = useAnimatedProps(() => ({
        strokeDashoffset: circumference - sweep.value * circumference,
    }));

    return (
        <View
            style={[{ width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' }, glow]}
            accessible
            accessibilityRole="image"
            accessibilityLabel="Workout complete badge"
        >
            <Svg width={SIZE} height={SIZE} style={StyleSheet.absoluteFill}>
                <Circle
                    cx={center}
                    cy={center}
                    r={radius}
                    stroke={withAlpha(color, 0.18)}
                    strokeWidth={STROKE}
                    fill="none"
                />
                <AnimatedCircle
                    cx={center}
                    cy={center}
                    r={radius}
                    stroke={color}
                    strokeWidth={STROKE}
                    fill="none"
                    strokeDasharray={circumference}
                    animatedProps={animatedProps}
                    strokeLinecap="round"
                    transform={`rotate(-90 ${center} ${center})`}
                />
            </Svg>
            <View
                style={[
                    styles.badgeInner,
                    { backgroundColor: withAlpha(color, 0.12), borderColor: withAlpha(color, 0.3) },
                ]}
            >
                <Ionicons name="trophy" size={52} color={color} />
            </View>
        </View>
    );
}

/* ------------------------------------------------------------------ */
/* Stat tile — value DOMINATES its overline label. Count-up numerals   */
/* for volume / burn; a static condensed value for time / PRs.         */
/* ------------------------------------------------------------------ */
interface StatTileProps {
    icon: keyof typeof Ionicons.glyphMap;
    tint: string;
    label: string;
    delay: number;
    /** Provide `value` for an animated count-up, or `text` for a static value. */
    value?: number;
    suffix?: string;
    text?: string;
    unit?: string;
    a11y: string;
}

function StatTile({ icon, tint, label, delay, value, suffix, text, unit, a11y }: StatTileProps) {
    const { colors } = useTheme();
    return (
        <Animated.View
            entering={FadeInDown.springify().damping(20).mass(0.9).delay(delay)}
            style={styles.statTile}
            accessible
            accessibilityLabel={a11y}
        >
            <LinearGradient
                colors={colors.gradients.card}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.statTileFill}
            >
                <View style={[styles.statIconChip, { backgroundColor: withAlpha(tint, 0.14) }]}>
                    <Ionicons name={icon} size={18} color={tint} />
                </View>
                <View style={styles.statValueRow}>
                    {typeof value === 'number' ? (
                        <CountUpText
                            value={value}
                            suffix={suffix}
                            style={[styles.statValue, { color: colors.text.primary }]}
                            accessibilityLabel={a11y}
                        />
                    ) : (
                        <Text style={[styles.statValue, { color: colors.text.primary }]} maxFontSizeMultiplier={1.2}>
                            {text}
                        </Text>
                    )}
                    {unit ? <Text style={[styles.statUnit, { color: colors.text.secondary }]}>{unit}</Text> : null}
                </View>
                <Text style={[styles.statLabel, { color: colors.text.tertiary }]}>{label}</Text>
            </LinearGradient>
        </Animated.View>
    );
}

export default function WorkoutCompleteScreen() {
    const { colors, typography, shadows } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const queryClient = useQueryClient();
    const { elapsed, volume, kcal, prs } = useLocalSearchParams<{ elapsed?: string; volume?: string; kcal?: string; prs?: string }>();

    const elapsedSeconds = elapsed ? parseInt(elapsed, 10) : 0;
    const displayTime = formatElapsed(isNaN(elapsedSeconds) ? 0 : elapsedSeconds);
    const totalVolume = volume ? Math.max(0, Math.round(parseFloat(volume))) : 0;
    const totalKcal = kcal ? Math.max(0, Math.round(parseFloat(kcal))) : 0;
    // Optional PR count — purely additive. Absent for every existing caller, so
    // the PR tile only appears when a finisher passes a positive `prs` param.
    const prCount = prs ? Math.max(0, Math.round(parseFloat(prs))) : 0;

    // Honest-states guard for the raw deep-link / cold-reload / aborted-finish
    // mount: when ALL three params are absent or non-finite there is nothing
    // real to celebrate, so we render an EmptyState instead of three zeroed
    // stat cards. The normal path (a finite elapsed plus any positive metric)
    // is unchanged. `totalVolume`/`totalKcal` are already finite (Math.max
    // floors NaN-derived values to 0 via parseFloat) and `elapsedSeconds` may
    // be NaN, which `Number.isFinite` rejects — so this stays finite-safe.
    const hasAnyMetric =
        Number.isFinite(elapsedSeconds) && (elapsedSeconds > 0 || totalVolume > 0 || totalKcal > 0);

    const handleReturn = () => {
        queryClient.invalidateQueries({ queryKey: ['active-session'] });
        queryClient.invalidateQueries({ queryKey: ['workout-active-session'] });
        router.dismissAll();
        router.replace('/(tabs)');
    };

    const handleShare = async () => {
        try {
            const parts = [`Session complete on Zeitra.`];
            if (totalVolume > 0) parts.push(`Volume ${totalVolume.toLocaleString()} kg`);
            if (hasAnyMetric) parts.push(`Time ${displayTime}`);
            if (totalKcal > 0) parts.push(`Burn ${totalKcal} kcal`);
            if (prCount > 0) parts.push(`${prCount} new PR${prCount === 1 ? '' : 's'}`);
            await Share.share({ message: parts.join(' • ') });
        } catch {
            // Share sheet dismissed / unavailable — non-fatal, nothing to log.
        }
    };

    // Affirming line scales with effort — a PR makes it a peak.
    const affirm = prCount > 0 ? 'New personal record' : 'Strong session';

    return (
        <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
            <StatusBar style="light" />
            {/* Lime-tinted top wash for the peak — kept low-opacity (60/30/10). */}
            <LinearGradient
                colors={[withAlpha(colors.accent.coral, 0.16), 'transparent']}
                style={styles.topWash}
            />

            {/* Dismiss affordance — top-right X within the safe area. */}
            <TouchableOpacity
                style={[styles.closeBtn, { top: insets.top + 8, backgroundColor: withAlpha(colors.text.primary, 0.06) }]}
                onPress={handleReturn}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityRole="button"
                accessibilityLabel="Close and return to dashboard"
            >
                <Ionicons name="close" size={22} color={colors.text.secondary} />
            </TouchableOpacity>

            <View style={[styles.content, { paddingTop: insets.top + 56, paddingBottom: insets.bottom + 16 }]}>
                <Animated.View entering={FadeIn.duration(420)} style={styles.heroWrap}>
                    <HeroBadge color={colors.accent.coral} glow={shadows.glow(colors.accent.coral)} />
                </Animated.View>

                {hasAnyMetric ? (
                    <Animated.View entering={FadeInDown.springify().damping(20).mass(0.9).delay(60)} style={styles.affirmChip}>
                        <View style={[styles.affirmDot, { backgroundColor: colors.accent.coral }]} />
                        <Text style={[typography.overline, { color: colors.accent.coral }]}>{affirm}</Text>
                    </Animated.View>
                ) : null}

                <Animated.Text
                    entering={FadeInDown.springify().damping(20).mass(0.9).delay(100)}
                    style={[typography.display, styles.title, { color: colors.text.primary }]}
                    maxFontSizeMultiplier={1.2}
                >
                    Session{'\n'}Complete
                </Animated.Text>

                <Animated.Text
                    entering={FadeInDown.springify().damping(20).mass(0.9).delay(150)}
                    style={[typography.body, styles.subtitle, { color: colors.text.secondary }]}
                >
                    {hasAnyMetric
                        ? "Amazing work. You've logged another powerful session, optimizing your performance window."
                        : 'Your session is wrapped up. Head back to your dashboard to keep your window dialed in.'}
                </Animated.Text>

                {hasAnyMetric ? (
                    <>
                        <View style={styles.statsRow}>
                            <StatTile
                                icon="flash-outline"
                                tint={colors.accent.coral}
                                label="VOLUME"
                                value={totalVolume}
                                unit="kg"
                                delay={210}
                                a11y={`Volume ${totalVolume.toLocaleString()} kilograms`}
                            />
                            <StatTile
                                icon="time-outline"
                                tint={colors.accent.cyan}
                                label="TIME"
                                text={displayTime}
                                delay={260}
                                a11y={`Time ${displayTime}`}
                            />
                            <StatTile
                                icon="flame-outline"
                                tint={colors.accent.amber}
                                label="BURN"
                                value={totalKcal}
                                unit="kcal"
                                delay={310}
                                a11y={`Burn ${totalKcal} kilocalories`}
                            />
                        </View>

                        {prCount > 0 ? (
                            <Animated.View
                                entering={FadeInDown.springify().damping(20).mass(0.9).delay(360)}
                                style={[styles.prBanner, { backgroundColor: withAlpha(colors.accent.coral, 0.1), borderColor: withAlpha(colors.accent.coral, 0.28) }]}
                                accessible
                                accessibilityLabel={`${prCount} new personal record${prCount === 1 ? '' : 's'} this session`}
                            >
                                <Ionicons name="ribbon" size={20} color={colors.accent.coral} />
                                <Text style={[typography.subtitle, { color: colors.text.primary, marginLeft: 10 }]}>
                                    {prCount} new PR{prCount === 1 ? '' : 's'}
                                </Text>
                                <Text style={[typography.bodySm, { color: colors.text.secondary, marginLeft: 6 }]}>this session</Text>
                            </Animated.View>
                        ) : null}
                    </>
                ) : (
                    <EmptyState
                        icon="barbell-outline"
                        title="No session data"
                        subtitle="We couldn't find any metrics for this session. Nothing was lost — just return to your dashboard."
                        style={styles.emptyState}
                    />
                )}

                <View style={{ flex: 1 }} />

                {/* Thumb-zone CTAs: secondary Share (glass) + primary Done (lime, ink). */}
                <Animated.View entering={FadeInDown.springify().damping(22).delay(hasAnyMetric ? 410 : 200)} style={styles.ctaCol}>
                    {hasAnyMetric ? (
                        <TouchableOpacity
                            style={[styles.shareBtn, { borderColor: colors.border.light, backgroundColor: withAlpha(colors.text.primary, 0.04) }]}
                            onPress={handleShare}
                            activeOpacity={0.85}
                            accessibilityRole="button"
                            accessibilityLabel="Share session"
                        >
                            <Ionicons name="share-social-outline" size={18} color={colors.text.primary} />
                            <Text style={[typography.h3, { color: colors.text.primary, marginLeft: 8 }]}>Share</Text>
                        </TouchableOpacity>
                    ) : null}

                    <TouchableOpacity
                        style={[styles.returnBtn, shadows.glow(colors.accent.coral)]}
                        onPress={handleReturn}
                        activeOpacity={0.9}
                        accessibilityRole="button"
                        accessibilityLabel="Return to dashboard"
                    >
                        <LinearGradient
                            colors={colors.gradients.coralCta}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.returnBtnInner}
                        >
                            <Text style={[typography.h3, { color: colors.text.inverse, fontWeight: '700' }]}>Done</Text>
                        </LinearGradient>
                    </TouchableOpacity>
                </Animated.View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    topWash: { position: 'absolute', top: 0, left: 0, right: 0, height: 360 },
    closeBtn: {
        position: 'absolute',
        right: 16,
        zIndex: 10,
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    content: { flex: 1, paddingHorizontal: 24, alignItems: 'center' },
    heroWrap: { marginTop: 8 },
    badgeInner: {
        width: 104,
        height: 104,
        borderRadius: 52,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    affirmChip: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 22,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 9999,
    },
    affirmDot: { width: 6, height: 6, borderRadius: 3, marginRight: 8 },
    title: { fontSize: 40, marginTop: 10, textAlign: 'center' },
    subtitle: { textAlign: 'center', marginTop: 12, marginHorizontal: 24 },
    statsRow: { flexDirection: 'row', gap: 10, marginTop: 32, width: '100%' },
    statTile: { flex: 1, borderRadius: 20, overflow: 'hidden' },
    statTileFill: {
        paddingVertical: 16,
        paddingHorizontal: 10,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.04)',
        alignItems: 'center',
    },
    statIconChip: {
        width: 36,
        height: 36,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 12,
    },
    statValueRow: { flexDirection: 'row', alignItems: 'flex-end' },
    statValue: { fontFamily: typo.statMedium.fontFamily, fontSize: 30, lineHeight: 34 },
    statUnit: { fontFamily: typo.statTiny.fontFamily, fontSize: 12, marginLeft: 3, marginBottom: 4 },
    statLabel: {
        fontFamily: typo.overline.fontFamily,
        fontSize: 10,
        letterSpacing: 1.4,
        textTransform: 'uppercase',
        marginTop: 6,
    },
    prBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 14,
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 16,
        borderWidth: 1,
        width: '100%',
        justifyContent: 'center',
    },
    emptyState: { marginTop: 24, width: '100%' },
    ctaCol: { width: '100%', gap: 12 },
    shareBtn: {
        width: '100%',
        height: 52,
        borderRadius: 26,
        borderWidth: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
    returnBtn: { width: '100%', height: 56, borderRadius: 28 },
    returnBtnInner: { flex: 1, borderRadius: 28, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
});
