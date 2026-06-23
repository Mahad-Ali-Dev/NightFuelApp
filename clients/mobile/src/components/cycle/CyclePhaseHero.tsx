import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme';
import { GlassCard } from '@/components/ui';
import { withAlpha } from '@/theme/utils';
import type { CyclePhase, CycleForecast } from '@/api/cycle';
import type { UserStatus } from '@/api/profile';

/**
 * CyclePhaseHero — the calm, phase-tinted hero for the Cycle screen.
 *
 * Purely PRESENTATIONAL + DERIVED: it reads the SAME `cyclePhase` the status
 * query already exposes (GET /v1/users/me/status) and the SAME forecast the
 * screen already fetches (GET /v1/users/me/cycle/forecast). It introduces no
 * new network call, hook, mutation or navigation — it just re-presents data the
 * screen already has as a softer, premium phase summary.
 *
 * Tone (per the Zeitra cycle brief): CALM. Lower contrast than the rest of the
 * app, brand lime used only as the faintest tint, with each phase carrying its
 * own soft functional hue (red / cyan / purple / amber) so the surface re-tints
 * by phase. The phase NAME is the dominant value (big condensed) above a small
 * muted overline label; a phase RING (4 soft arcs, the active one lit) gives a
 * quiet sense of where you are in the cycle.
 *
 * HONEST + OPT-IN-AWARE, mirroring CyclePhaseCard:
 *  - `cyclePhase == null` → renders nothing (tracking never enabled).
 *  - 'UNKNOWN' → a neutral "tracking on, no estimate yet" hero (no fake phase,
 *    no prediction chips), matching the card's honest UNKNOWN state.
 *  - a concrete phase → the phase name, a one-line gentle descriptor, and (when
 *    the forecast is confident enough) the predicted next-period date as a soft
 *    chip — never presented as fact, always worded as an estimate.
 */

type Phase = NonNullable<UserStatus['cyclePhase']>;
type ConcretePhase = Exclude<Phase, 'UNKNOWN'>;

/** Phase descriptor: ordered ring position + a gentle, non-prescriptive line. */
const PHASE_META: Record<
    ConcretePhase,
    { label: string; line: string; icon: keyof typeof import('@expo/vector-icons').Ionicons.glyphMap }
> = {
    MENSTRUAL: { label: 'Menstrual', line: 'A time to rest and be gentle with yourself.', icon: 'moon-outline' },
    FOLLICULAR: { label: 'Follicular', line: 'Energy tends to rise — a fresh, open window.', icon: 'leaf-outline' },
    OVULATORY: { label: 'Ovulatory', line: 'You may feel your strongest right about now.', icon: 'sunny-outline' },
    LUTEAL: { label: 'Luteal', line: 'A natural wind-down — steady routines help.', icon: 'cloud-outline' },
};

/** Fixed ring order (one soft arc per phase, clockwise from the top). */
const PHASE_ORDER: ConcretePhase[] = ['MENSTRUAL', 'FOLLICULAR', 'OVULATORY', 'LUTEAL'];

/** Phase → its calm functional hue. Mirrors CycleCalendar's phase coloring. */
function phaseHue(phase: ConcretePhase, colors: ReturnType<typeof useTheme>['colors']): string {
    switch (phase) {
        case 'MENSTRUAL':
            return colors.accent.red;
        case 'FOLLICULAR':
            return colors.accent.cyan;
        case 'OVULATORY':
            return colors.accent.purple;
        case 'LUTEAL':
            return colors.accent.amber;
    }
}

/** Format a 'YYYY-MM-DD' as a soft, human "Mon 14 Jul" (UTC, locale-light). */
function formatPredicted(iso: string | null | undefined): string | null {
    if (!iso) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!m) return null;
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    if (Number.isNaN(d.getTime())) return null;
    const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()];
    const mo = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()];
    return `${wd} ${d.getUTCDate()} ${mo}`;
}

export interface CyclePhaseHeroProps {
    /** Phase from GET /v1/users/me/status. undefined => tracking never enabled. */
    cyclePhase?: UserStatus['cyclePhase'];
    /** Forecast from GET /v1/users/me/cycle/forecast — used only for the soft
     * prediction chips (next period / fertile window). Optional / may be loading. */
    forecast?: CycleForecast;
}

/** The phase ring: four soft arcs, the active phase lit, drawn with react-native-svg. */
function PhaseRing({
    activeIndex,
    hue,
    size,
}: {
    activeIndex: number; // -1 when UNKNOWN (nothing lit)
    hue: string;
    size: number;
}) {
    const { colors } = useTheme();
    const strokeWidth = 10;
    const radius = (size - strokeWidth) / 2;
    const center = size / 2;
    const circumference = 2 * Math.PI * radius;

    // Four equal arcs with a small gap between them.
    const gap = circumference * 0.035;
    const seg = circumference / 4 - gap;

    return (
        <Svg width={size} height={size}>
            {/* Faint full track under everything. */}
            <Circle
                cx={center}
                cy={center}
                r={radius}
                stroke={withAlpha(colors.text.primary, 0.06)}
                strokeWidth={strokeWidth}
                fill="none"
            />
            {PHASE_ORDER.map((_, i) => {
                const isActive = i === activeIndex;
                // Rotate each segment into its quarter; -90 puts segment 0 at the top.
                const rotation = -90 + (i * 360) / 4;
                return (
                    <Circle
                        key={i}
                        cx={center}
                        cy={center}
                        r={radius}
                        stroke={isActive ? hue : withAlpha(colors.text.primary, 0.1)}
                        strokeWidth={isActive ? strokeWidth : strokeWidth - 3}
                        strokeLinecap="round"
                        fill="none"
                        strokeDasharray={`${seg} ${circumference - seg}`}
                        strokeDashoffset={0}
                        // Position via an explicit rotate-about-center transform —
                        // the same technique the app's other SVG dials use.
                        transform={`rotate(${rotation}, ${center}, ${center})`}
                    />
                );
            })}
        </Svg>
    );
}

export function CyclePhaseHero({ cyclePhase, forecast }: CyclePhaseHeroProps) {
    const { colors, typography, borderRadius } = useTheme();

    // Opt-in gate — identical to CyclePhaseCard: render nothing with no phase.
    const isUnknown = cyclePhase === 'UNKNOWN';
    const concrete: ConcretePhase | null = useMemo(() => {
        if (cyclePhase == null || cyclePhase === 'UNKNOWN') return null;
        return cyclePhase as ConcretePhase;
    }, [cyclePhase]);

    if (cyclePhase == null) return null;

    const meta = concrete ? PHASE_META[concrete] : null;
    const hue = concrete ? phaseHue(concrete, colors) : colors.accent.purple;
    const activeIndex = concrete ? PHASE_ORDER.indexOf(concrete) : -1;

    // Soft predictions — only when the forecast is confident enough to predict.
    const canPredict = !!forecast && !forecast.trackingOnly && forecast.confidence !== 'NONE';
    const nextPeriod = canPredict ? formatPredicted(forecast?.predictedNextPeriodStart) : null;
    const fertileStart = canPredict ? formatPredicted(forecast?.fertileWindow?.start) : null;

    return (
        <GlassCard
            glow={withAlpha(hue, 0.16)}
            radius={borderRadius['2xl']}
            style={styles.card}
            testID="cycle-phase-hero"
        >
            {/* Calm phase wash — the surface re-tints by phase, very low opacity. */}
            <View
                pointerEvents="none"
                style={[StyleSheet.absoluteFillObject, { backgroundColor: withAlpha(hue, 0.05) }]}
            />

            <View style={styles.inner}>
                <View style={styles.row}>
                    {/* Ring + centered phase icon */}
                    <View style={styles.ringWrap}>
                        <PhaseRing activeIndex={activeIndex} hue={hue} size={104} />
                        <View style={styles.ringCenter} pointerEvents="none">
                            <View
                                style={[
                                    styles.iconDisc,
                                    {
                                        backgroundColor: withAlpha(hue, 0.14),
                                        borderColor: withAlpha(hue, 0.3),
                                    },
                                ]}
                            >
                                <Ionicons
                                    name={isUnknown ? 'ellipse-outline' : meta!.icon}
                                    size={26}
                                    color={hue}
                                />
                            </View>
                        </View>
                    </View>

                    {/* VALUE (phase) dominates its small overline label. */}
                    <View style={styles.textWrap}>
                        <Text style={[typography.overline, { color: colors.text.tertiary }]}>
                            CURRENT PHASE
                        </Text>
                        <Text
                            style={[typography.display, styles.value, { color: colors.text.primary }]}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                        >
                            {isUnknown ? 'Tracking' : meta!.label}
                        </Text>
                        <Text style={[typography.bodySm, { color: colors.text.secondary }]} numberOfLines={2}>
                            {isUnknown
                                ? "We're tracking — not enough yet for a phase estimate."
                                : meta!.line}
                        </Text>
                    </View>
                </View>

                {/* Soft prediction chips — estimates, only when confident. */}
                {nextPeriod || fertileStart ? (
                    <View style={styles.chips}>
                        {nextPeriod ? (
                            <PredictionChip
                                icon="water-outline"
                                hue={colors.accent.red}
                                overline="NEXT PERIOD (EST.)"
                                value={nextPeriod}
                            />
                        ) : null}
                        {fertileStart ? (
                            <PredictionChip
                                icon="ellipse-outline"
                                hue={colors.accent.purple}
                                overline="FERTILE FROM (EST.)"
                                value={fertileStart}
                            />
                        ) : null}
                    </View>
                ) : null}
            </View>
        </GlassCard>
    );
}

/** A soft, low-contrast prediction chip — value over a muted overline. */
function PredictionChip({
    icon,
    hue,
    overline,
    value,
}: {
    icon: keyof typeof Ionicons.glyphMap;
    hue: string;
    overline: string;
    value: string;
}) {
    const { colors, typography } = useTheme();
    return (
        <View
            style={[styles.chip, { backgroundColor: withAlpha(hue, 0.08), borderColor: withAlpha(hue, 0.18) }]}
            accessible
            accessibilityRole="text"
            accessibilityLabel={`${overline.replace('(EST.)', 'estimated')}: ${value}`}
        >
            <Ionicons name={icon} size={14} color={hue} style={{ marginTop: 1 }} />
            <View style={styles.chipText}>
                <Text style={[typography.overline, { color: colors.text.tertiary, fontSize: 9, letterSpacing: 1 }]}>
                    {overline}
                </Text>
                <Text style={[typography.statTiny, { color: colors.text.primary, marginTop: 1 }]} numberOfLines={1}>
                    {value}
                </Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    card: { marginTop: 4 },
    inner: { padding: 18 },
    row: { flexDirection: 'row', alignItems: 'center' },
    ringWrap: { width: 104, height: 104, alignItems: 'center', justifyContent: 'center' },
    ringCenter: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
    iconDisc: {
        width: 60,
        height: 60,
        borderRadius: 999,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    textWrap: { flex: 1, marginLeft: 16 },
    value: { marginTop: 2, marginBottom: 2 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16 },
    chip: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        borderWidth: 1,
        borderRadius: 14,
        paddingHorizontal: 12,
        paddingVertical: 9,
        minHeight: 44,
        flexGrow: 1,
        flexBasis: '46%',
    },
    chipText: { marginLeft: 8, flex: 1 },
});

export default CyclePhaseHero;
