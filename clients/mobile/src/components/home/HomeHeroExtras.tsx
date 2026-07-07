/**
 * HomeHeroExtras — presentational Aurora/Zeitra building blocks for the Home
 * dashboard hero region. Pure UI (no data fetching, no navigation): the screen
 * owns all hooks/queries and passes already-derived numbers down.
 *
 *   • ReadinessRing      — a lime circular-progress ring with a big mono numeral
 *                          in the centre (built on the shared CircularProgress
 *                          primitive). Used inside the TONIGHT'S SESSION hero.
 *   • StatCard           — one glass stat card for the 3-up GRID (label, big
 *                          mono value, optional unit, accent icon, optional
 *                          footer). Pressable when `onPress` is supplied.
 *   • TrainingWindowBar  — the circadian training-window bar: a 24h track with a
 *                          highlighted optimal-training band and a NOW marker.
 *
 * All colors come from the theme via useTheme()/passed accent props — no raw
 * brand hexes. GlassCard (the sanctioned dark-glass primitive) provides the card
 * surfaces, so this file introduces no inline <SafeBlurView>.
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StyleProp, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme';
import { typography } from '@/theme/typography';
import { withAlpha } from '@/theme/utils';
import { GlassCard, CircularProgress } from '@/components/ui';

// Cap Dynamic-Type scaling on the giant numerals so a large accessibility text
// size can't blow them out of their rings / pills.
const STAT_MAX_SCALE = 1.35;

// ─── ReadinessRing ───────────────────────────────────────────────────────────

export const ReadinessRing = React.memo(function ReadinessRing({
    /** 0–100 percentage. */
    percent,
    size = 92,
    color,
    label = 'READY',
}: {
    percent: number;
    size?: number;
    color?: string;
    label?: string;
}) {
    const { colors } = useTheme();
    const ring = color ?? colors.accent.coral;
    const pct = Math.max(0, Math.min(100, Math.round(percent)));
    return (
        <CircularProgress
            size={size}
            strokeWidth={8}
            progress={pct}
            color={ring}
            trackColor={withAlpha(colors.text.primary, 0.12)}
        >
            <Text
                style={[typography.statSmall, { color: colors.text.primary }]}
                maxFontSizeMultiplier={STAT_MAX_SCALE}
            >
                {pct}
            </Text>
            <Text style={[typography.caption, { color: withAlpha(ring, 0.9), letterSpacing: 1, marginTop: 1 }]}>
                {label}
            </Text>
        </CircularProgress>
    );
});

// ─── StatCard ────────────────────────────────────────────────────────────────

export const StatCard = React.memo(function StatCard({
    icon,
    label,
    value,
    unit,
    footer,
    accent,
    onPress,
    accessibilityLabel,
    testID,
    style,
}: {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    value: string;
    unit?: string;
    footer?: string;
    accent: string;
    onPress?: () => void;
    accessibilityLabel?: string;
    testID?: string;
    style?: StyleProp<ViewStyle>;
}) {
    const { colors } = useTheme();

    const body = (
        <GlassCard intensity={40} radius={20} style={{ flex: 1 }}>
            <View style={sc.inner}>
                <View style={[sc.iconWrap, { backgroundColor: withAlpha(accent, 0.14) }]}>
                    <Ionicons name={icon} size={18} color={accent} />
                </View>
                <Text style={[typography.overline, sc.lbl, { color: colors.text.secondary }]} numberOfLines={1}>
                    {label}
                </Text>
                <View style={sc.valRow}>
                    <Text
                        style={[typography.statSmall, { color: colors.text.primary }]}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        maxFontSizeMultiplier={STAT_MAX_SCALE}
                    >
                        {value}
                    </Text>
                    {!!unit && (
                        <Text style={[typography.captionMedium, sc.unit, { color: colors.text.secondary }]}>
                            {unit}
                        </Text>
                    )}
                </View>
                {!!footer && (
                    <Text style={[typography.caption, sc.footer, { color: withAlpha(accent, 0.95) }]} numberOfLines={1}>
                        {footer}
                    </Text>
                )}
            </View>
        </GlassCard>
    );

    if (!onPress) {
        return <View style={[sc.wrap, style]}>{body}</View>;
    }
    return (
        <TouchableOpacity
            style={[sc.wrap, style]}
            onPress={onPress}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel ?? `${label}, ${value}${unit ? ' ' + unit : ''}`}
            testID={testID}
        >
            {body}
        </TouchableOpacity>
    );
});

// ─── TrainingWindowBar ───────────────────────────────────────────────────────

/**
 * A 24-hour track with a highlighted optimal-training band and a NOW marker.
 * `startHour`/`endHour` bound the lime band (0–24); `nowHour` is the current
 * fractional hour (e.g. 14.5). Purely visual — the screen decides the window.
 */
export const TrainingWindowBar = React.memo(function TrainingWindowBar({
    startHour,
    endHour,
    nowHour,
    accent,
}: {
    startHour: number;
    endHour: number;
    nowHour: number;
    accent?: string;
}) {
    const { colors } = useTheme();
    const lime = accent ?? colors.accent.coral;
    const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
    const left = clamp01(startHour / 24);
    const right = clamp01(endHour / 24);
    const bandLeftPct = `${left * 100}%` as const;
    const bandWidthPct = `${Math.max(0, right - left) * 100}%` as const;
    const nowPct = `${clamp01(nowHour / 24) * 100}%` as const;
    const inWindow = nowHour >= startHour && nowHour <= endHour;

    const fmt = (h: number) => {
        const hr = Math.floor(h) % 24;
        const ampm = hr < 12 ? 'AM' : 'PM';
        const display = hr % 12 === 0 ? 12 : hr % 12;
        return `${display}${ampm}`;
    };

    return (
        <GlassCard intensity={40} radius={20} style={{ marginBottom: 28 }}>
            <View style={tw.inner}>
                <View style={tw.headRow}>
                    <View style={tw.headLeft}>
                        <View style={[tw.dot, { backgroundColor: lime }]} />
                        <Text style={[typography.overline, { color: colors.text.secondary }]}>TRAINING WINDOW</Text>
                    </View>
                    <Text style={[typography.captionMedium, { color: inWindow ? lime : colors.text.tertiary }]}>
                        {inWindow ? 'OPEN NOW' : `${fmt(startHour)}–${fmt(endHour)}`}
                    </Text>
                </View>

                <View style={[tw.track, { backgroundColor: withAlpha(colors.text.primary, 0.08) }]}>
                    {/* Optimal band */}
                    <View
                        style={[
                            tw.band,
                            { left: bandLeftPct, width: bandWidthPct, backgroundColor: withAlpha(lime, 0.35), borderColor: withAlpha(lime, 0.55) },
                        ]}
                    />
                    {/* NOW marker */}
                    <View style={[tw.nowWrap, { left: nowPct }]}>
                        <View style={[tw.nowLine, { backgroundColor: colors.text.primary }]} />
                        <View style={[tw.nowKnob, { backgroundColor: colors.text.primary, borderColor: lime }]} />
                    </View>
                </View>

                <View style={tw.scaleRow}>
                    <Text style={[typography.caption, { color: colors.text.tertiary }]}>12AM</Text>
                    <Text style={[typography.caption, { color: colors.text.tertiary }]}>12PM</Text>
                    <Text style={[typography.caption, { color: colors.text.tertiary }]}>12AM</Text>
                </View>
            </View>
        </GlassCard>
    );
});

// ─── Styles ──────────────────────────────────────────────────────────────────

const sc = StyleSheet.create({
    wrap: { flex: 1 },
    inner: { padding: 14, minHeight: 132, justifyContent: 'space-between' },
    iconWrap: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
    lbl: { marginBottom: 6 },
    valRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
    unit: { marginBottom: 4 },
    footer: { marginTop: 6 },
});

const tw = StyleSheet.create({
    inner: { paddingHorizontal: 18, paddingVertical: 16 },
    headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
    headLeft: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    dot: { width: 7, height: 7, borderRadius: 4 },
    track: { height: 10, borderRadius: 6, marginBottom: 10, position: 'relative', overflow: 'visible' },
    band: { position: 'absolute', top: 0, bottom: 0, borderRadius: 6, borderWidth: 1 },
    nowWrap: { position: 'absolute', top: -5, alignItems: 'center', marginLeft: -7 },
    nowLine: { width: 2, height: 20, borderRadius: 1, opacity: 0.5 },
    nowKnob: { position: 'absolute', top: 4, width: 14, height: 14, borderRadius: 7, borderWidth: 2.5 },
    scaleRow: { flexDirection: 'row', justifyContent: 'space-between' },
});
