import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/theme';
import { useCycleAccents } from '@/theme/useCycleAccents';
import { phaseArt } from '@/features/cycle/phaseArt';
import { GlassCard } from '@/components/ui';
import { withAlpha } from '@/theme/utils';
import type { CycleForecast } from '@/api/cycle';
import type { UserStatus } from '@/api/profile';

/**
 * CyclePhaseHero — the calm, phase-aware HERO that crowns the Cycle screen.
 *
 * Purely PRESENTATIONAL + DERIVED: it reads the SAME `cyclePhase` the status
 * query already exposes (GET /v1/users/me/status), the SAME forecast the screen
 * already fetches (GET /v1/users/me/cycle/forecast), and a few small DERIVED
 * scalars the screen computes from data it already holds (the profile's
 * lastPeriodStartDate / avgCycleLengthDays + the forecast predictions). It
 * introduces NO new network call, hook, mutation or navigation — it just
 * re-presents data the screen already has.
 *
 * VISUAL (Zeitra cycle mockup): a big circular cycle RING — a coral elapsed arc
 * (how far through the cycle you are) over a faint track, with a lime OVULATION
 * marker — wrapping a centered "DAY N / <phase>" readout. Below it a soft
 * "Next period in X days · ovulation in Y" line, then a horizontal 4-phase strip
 * (Period / Follicular / Ovulation / Luteal) with the current phase highlighted.
 * Coral (#FF7A90) is the period/cycle accent; brand lime is the ovulation accent.
 *
 * HONEST + OPT-IN-AWARE (unchanged contract, mirroring CyclePhaseCard):
 *  - `cyclePhase == null` → renders nothing (tracking never enabled).
 *  - 'UNKNOWN' → a neutral "tracking on, no estimate yet" hero (no fake phase,
 *    no day number, no predictions).
 *  - a concrete phase → the phase ring + name, and (only when the forecast is
 *    confident enough) the derived day number + next-period / ovulation line —
 *    always worded as an estimate, never as fact. When a derived scalar is
 *    unavailable we simply omit that bit rather than fabricate it.
 */

type Phase = NonNullable<UserStatus['cyclePhase']>;
type ConcretePhase = Exclude<Phase, 'UNKNOWN'>;

// Coral is the period/cycle accent for this screen; it's theme-aware — see
// useCycleAccents (dark #FF7A90, darkened on light). CycleRing receives it (and
// the lime ovulation-marker colour) as props; the card sources it per-render.

/** Phase descriptor: ordered position + a gentle, non-prescriptive line. */
const PHASE_META: Record<
    ConcretePhase,
    { label: string; line: string; icon: keyof typeof import('@expo/vector-icons').Ionicons.glyphMap }
> = {
    MENSTRUAL: { label: 'Menstrual', line: 'A time to rest and be gentle with yourself.', icon: 'moon-outline' },
    FOLLICULAR: { label: 'Follicular', line: 'Energy tends to rise — a fresh, open window.', icon: 'leaf-outline' },
    OVULATORY: { label: 'Ovulation', line: 'You may feel your strongest right about now.', icon: 'sunny-outline' },
    LUTEAL: { label: 'Luteal', line: 'A natural wind-down — steady routines help.', icon: 'cloud-outline' },
};

/** The four phases in cycle order — drives the bottom phase strip. */
const PHASE_ORDER: ConcretePhase[] = ['MENSTRUAL', 'FOLLICULAR', 'OVULATORY', 'LUTEAL'];

/** Short labels + relative weights for the bottom 4-phase strip (≈ mockup). */
const STRIP_META: Record<ConcretePhase, { short: string; flex: number }> = {
    MENSTRUAL: { short: 'Period', flex: 1 },
    FOLLICULAR: { short: 'Follicular', flex: 1.4 },
    OVULATORY: { short: 'Ovul.', flex: 0.6 },
    LUTEAL: { short: 'Luteal', flex: 1.6 },
};

export interface CyclePhaseHeroProps {
    /** Phase from GET /v1/users/me/status. undefined => tracking never enabled. */
    cyclePhase?: UserStatus['cyclePhase'];
    /** Forecast from GET /v1/users/me/cycle/forecast — used for the soft
     * prediction copy (next period / ovulation). Optional / may be loading. */
    forecast?: CycleForecast;
    /**
     * DERIVED in the screen from data it already holds (profile / forecast). All
     * optional — when absent the hero degrades gracefully (omits the day number /
     * arc / line bit rather than inventing a value). NEVER a new fetch.
     */
    /** Current 1-based day within the cycle (e.g. 9 → "DAY 9"). */
    cycleDay?: number | null;
    /** Estimated total length of the current cycle, in days (ring denominator). */
    cycleLengthDays?: number | null;
    /** Whole days until the predicted next period start (>= 0). */
    daysUntilNextPeriod?: number | null;
    /** Whole days until the predicted ovulation day (may be negative if passed). */
    daysUntilOvulation?: number | null;
    /** 1-based day-of-cycle of predicted ovulation (positions the lime marker). */
    ovulationDayOfCycle?: number | null;
}

/**
 * The big cycle RING: a faint full track, a coral ELAPSED arc (fraction of the
 * cycle completed) drawn from the top clockwise, and a small lime OVULATION
 * marker at its day-of-cycle position. Drawn with react-native-svg, the same
 * technique the app's other SVG dials use.
 */
function CycleRing({
    size,
    progress,
    ovulationFraction,
    trackColor,
    arcColor,
    markerColor,
}: {
    size: number;
    /** 0..1 fraction of the cycle elapsed (coral arc length). null => no arc. */
    progress: number | null;
    /** 0..1 position of the ovulation marker. null => no marker. */
    ovulationFraction: number | null;
    trackColor: string;
    /** Period/elapsed arc colour (theme-aware coral). */
    arcColor: string;
    /** Ovulation-marker colour (theme-aware lime). */
    markerColor: string;
}) {
    const strokeWidth = 11;
    const radius = (size - strokeWidth) / 2;
    const center = size / 2;
    const circumference = 2 * Math.PI * radius;

    // Clamp helpers so a slightly-out-of-range derived value can never overdraw.
    const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
    const elapsed = progress == null ? null : clamp01(progress);
    const ovStop = ovulationFraction == null ? null : clamp01(ovulationFraction);

    const arcLen = elapsed == null ? 0 : elapsed * circumference;
    // The lime ovulation marker is a short, fixed-length arc centred on its
    // fraction so it reads as a distinct tick rather than a second progress arc.
    const markerLen = circumference * 0.05;
    const markerOffset = ovStop == null ? 0 : ovStop * circumference - markerLen / 2;

    return (
        <Svg width={size} height={size}>
            {/* Faint full track under everything. */}
            <Circle
                cx={center}
                cy={center}
                r={radius}
                stroke={trackColor}
                strokeWidth={strokeWidth}
                fill="none"
            />
            {/* Coral elapsed arc — clockwise from the top (rotate -90). */}
            {elapsed != null && arcLen > 0 ? (
                <Circle
                    cx={center}
                    cy={center}
                    r={radius}
                    stroke={arcColor}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    fill="none"
                    strokeDasharray={`${arcLen} ${circumference - arcLen}`}
                    strokeDashoffset={0}
                    transform={`rotate(-90, ${center}, ${center})`}
                />
            ) : null}
            {/* Lime ovulation marker — a short tick at its day-of-cycle position,
                in the brand lime so it reads distinct from the coral elapsed arc. */}
            {ovStop != null ? (
                <Circle
                    cx={center}
                    cy={center}
                    r={radius}
                    stroke={markerColor}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    fill="none"
                    strokeDasharray={`${markerLen} ${circumference - markerLen}`}
                    strokeDashoffset={-markerOffset}
                    transform={`rotate(-90, ${center}, ${center})`}
                />
            ) : null}
        </Svg>
    );
}

export function CyclePhaseHero({
    cyclePhase,
    forecast,
    cycleDay,
    cycleLengthDays,
    daysUntilNextPeriod,
    daysUntilOvulation,
    ovulationDayOfCycle,
}: CyclePhaseHeroProps) {
    const { colors, typography, borderRadius } = useTheme();
    const { coral: CORAL, lime: LIME } = useCycleAccents();

    // Opt-in gate — identical to CyclePhaseCard: render nothing with no phase.
    const isUnknown = cyclePhase === 'UNKNOWN';
    const concrete: ConcretePhase | null = useMemo(() => {
        if (cyclePhase == null || cyclePhase === 'UNKNOWN') return null;
        return cyclePhase as ConcretePhase;
    }, [cyclePhase]);

    if (cyclePhase == null) return null;

    const meta = concrete ? PHASE_META[concrete] : null;

    // Predictions are only honest when the forecast is confident enough.
    const canPredict = !!forecast && !forecast.trackingOnly && forecast.confidence !== 'NONE';

    // Ring fractions — derived, only drawn for a concrete phase with real inputs.
    const progress =
        concrete && cycleDay != null && cycleLengthDays != null && cycleLengthDays > 0
            ? cycleDay / cycleLengthDays
            : null;
    const ovulationFraction =
        concrete && canPredict && ovulationDayOfCycle != null && cycleLengthDays != null && cycleLengthDays > 0
            ? ovulationDayOfCycle / cycleLengthDays
            : null;

    const showDay = concrete != null && cycleDay != null && cycleDay > 0;

    // "Next period in X days · ovulation in Y" — each half shown only when its
    // value is a real, non-negative whole-day estimate.
    const nextPeriodDays =
        canPredict && daysUntilNextPeriod != null && daysUntilNextPeriod >= 0 ? daysUntilNextPeriod : null;
    const ovulationDays =
        canPredict && daysUntilOvulation != null && daysUntilOvulation >= 0 ? daysUntilOvulation : null;

    return (
        <GlassCard
            glow={withAlpha(CORAL, 0.16)}
            radius={borderRadius['2xl']}
            style={styles.card}
            testID="cycle-phase-hero"
        >
            {/* Phase-art backdrop — a subtle on-brand photo behind the ring, under a
                scrim so the DAY number + phase name stay fully legible. Concrete
                phases only (UNKNOWN has no art). */}
            {concrete && phaseArt(concrete) ? (
                <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
                    <Image
                        source={phaseArt(concrete)}
                        style={[StyleSheet.absoluteFillObject, { opacity: 0.2 }]}
                        contentFit="cover"
                        transition={200}
                    />
                    <LinearGradient
                        colors={[withAlpha(colors.background.secondary, 0.2), colors.background.secondary]}
                        style={StyleSheet.absoluteFillObject}
                    />
                </View>
            ) : null}

            {/* Calm coral wash — the surface carries a faint period tint. */}
            <View
                pointerEvents="none"
                style={[StyleSheet.absoluteFillObject, { backgroundColor: withAlpha(CORAL, 0.04) }]}
            />

            <View style={styles.inner}>
                {/* ── The big cycle ring + centered DAY / phase readout ── */}
                <View style={styles.ringWrap}>
                    <CycleRing
                        size={188}
                        progress={progress}
                        ovulationFraction={ovulationFraction}
                        trackColor={withAlpha(colors.text.primary, 0.08)}
                        arcColor={CORAL}
                        markerColor={LIME}
                    />
                    <View style={styles.ringCenter} pointerEvents="none">
                        {showDay ? (
                            <>
                                <Text style={[typography.overline, { color: colors.text.tertiary }]}>DAY</Text>
                                <Text style={[typography.display, styles.dayNum, { color: colors.text.primary }]}>
                                    {cycleDay}
                                </Text>
                            </>
                        ) : (
                            <View
                                style={[
                                    styles.iconDisc,
                                    { backgroundColor: withAlpha(CORAL, 0.14), borderColor: withAlpha(CORAL, 0.3) },
                                ]}
                            >
                                <Ionicons
                                    name={isUnknown ? 'ellipse-outline' : meta!.icon}
                                    size={28}
                                    color={CORAL}
                                />
                            </View>
                        )}
                        <Text style={[typography.subtitle, styles.phaseName, { color: CORAL }]} numberOfLines={1}>
                            {isUnknown ? 'Tracking' : meta!.label}
                        </Text>
                    </View>
                </View>

                {/* ── "Next period in X days · ovulation in Y" (estimates) ── */}
                {nextPeriodDays != null || ovulationDays != null ? (
                    <Text
                        style={[typography.bodySm, styles.predictionLine, { color: colors.text.secondary }]}
                        accessibilityRole="text"
                    >
                        {nextPeriodDays != null ? (
                            <>
                                Next period in{' '}
                                <Text style={{ color: colors.text.primary }}>
                                    {nextPeriodDays} {nextPeriodDays === 1 ? 'day' : 'days'}
                                </Text>
                            </>
                        ) : null}
                        {nextPeriodDays != null && ovulationDays != null ? '  ·  ' : null}
                        {ovulationDays != null ? (
                            <>
                                ovulation in <Text style={{ color: colors.accent.coral }}>{ovulationDays}</Text>
                            </>
                        ) : null}
                    </Text>
                ) : (
                    <Text style={[typography.bodySm, styles.predictionLine, { color: colors.text.secondary }]}>
                        {isUnknown
                            ? "We're tracking — not enough yet for a phase estimate."
                            : meta!.line}
                    </Text>
                )}

                {/* ── Horizontal 4-phase strip (current phase highlighted) ── */}
                {concrete ? (
                    <View style={styles.strip} accessibilityRole="tablist">
                        {PHASE_ORDER.map((p) => {
                            const isActive = p === concrete;
                            const s = STRIP_META[p];
                            return (
                                <View
                                    key={p}
                                    style={[styles.stripItem, { flex: s.flex }]}
                                    accessible
                                    accessibilityLabel={`${PHASE_META[p].label}${isActive ? ', current phase' : ''}`}
                                >
                                    <View
                                        style={[
                                            styles.stripBar,
                                            {
                                                backgroundColor: isActive ? CORAL : withAlpha(colors.text.primary, 0.12),
                                            },
                                        ]}
                                    />
                                    <Text
                                        style={[
                                            typography.caption,
                                            styles.stripLabel,
                                            {
                                                color: isActive ? CORAL : colors.text.tertiary,
                                                fontWeight: isActive ? '600' : '400',
                                            },
                                        ]}
                                        numberOfLines={1}
                                    >
                                        {s.short}
                                    </Text>
                                </View>
                            );
                        })}
                    </View>
                ) : null}
            </View>
        </GlassCard>
    );
}

const styles = StyleSheet.create({
    card: { marginTop: 4 },
    inner: { padding: 18, alignItems: 'center' },
    ringWrap: { width: 188, height: 188, alignItems: 'center', justifyContent: 'center' },
    ringCenter: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
    dayNum: { fontSize: 48, lineHeight: 52, marginTop: 0 },
    phaseName: { marginTop: 2 },
    iconDisc: {
        width: 56,
        height: 56,
        borderRadius: 999,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 2,
    },
    predictionLine: { textAlign: 'center', marginTop: 14 },
    // Bottom phase strip — weighted segments, current one lit coral.
    strip: { flexDirection: 'row', alignSelf: 'stretch', gap: 6, marginTop: 20 },
    stripItem: { alignItems: 'center' },
    stripBar: { height: 5, borderRadius: 3, alignSelf: 'stretch' },
    stripLabel: { marginTop: 6, fontSize: 10 },
});

export default CyclePhaseHero;
