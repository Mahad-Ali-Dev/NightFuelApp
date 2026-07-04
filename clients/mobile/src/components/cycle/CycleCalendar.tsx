import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme';
import { useCycleAccents } from '@/theme/useCycleAccents';
import { GlassCard } from '@/components/ui';
import { withAlpha } from '@/theme/utils';
import type { CyclePhase, Confidence, ForecastDay } from '@/api/cycle';

/**
 * CycleCalendar — a month grid that color-codes each day by its predicted phase
 * and overlays logged period days + the predicted fertile window + predicted
 * ovulation day.
 *
 * UNCERTAINTY-AWARE (the research must-have):
 *  - LOGGED / confirmed days (forecast day.isLogged === true) render SOLID — a
 *    filled coral disc. These are facts the user told us.
 *  - PREDICTED / uncertain days (fertile window, ovulation, future phase) render
 *    FADED with a DOTTED border — never a solid block. We never present a
 *    prediction as fact.
 *  - When the forecast confidence is LOW or NONE we show a small
 *    "Low confidence — log more cycles" note and (for NONE) hide the prediction
 *    overlays entirely, falling back to a track-only month.
 *
 * Driven entirely by the F28 forecast `days[]` (each carries date / phase /
 * confidence / isLogged / isPredictedFertile / isPredictedOvulation), so the
 * calendar can never disagree with the live phase card or the server.
 *
 * Month prev/next nav walks within the forecast window; days outside the window
 * render as plain (no phase) cells.
 */

// The coral period accent is theme-aware — see useCycleAccents (dark #FF7A90,
// darkened on light for contrast). Logged period days, the fertile/ovulation
// overlays and the legend all read in it; sourced per-render in the component.

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];

export interface CycleCalendarProps {
    days: ForecastDay[];
    confidence: Confidence;
    /** True when the server can only track, not predict (confidence NONE). */
    trackingOnly?: boolean;
    /** Optional initial month (YYYY-MM); defaults to the current month. */
    initialMonth?: string;
}

/** Phase → accent color key. UNKNOWN renders with no phase tint. */
function phaseColor(phase: CyclePhase, colors: ReturnType<typeof useTheme>['colors']): string | null {
    switch (phase) {
        case 'MENSTRUAL':
            return colors.accent.red;
        case 'FOLLICULAR':
            return colors.accent.cyan;
        case 'OVULATORY':
            return colors.accent.purple;
        case 'LUTEAL':
            return colors.accent.amber;
        default:
            return null; // UNKNOWN
    }
}

const PHASE_LABEL: Record<Exclude<CyclePhase, 'UNKNOWN'>, string> = {
    MENSTRUAL: 'Menstrual',
    FOLLICULAR: 'Follicular',
    OVULATORY: 'Ovulatory',
    LUTEAL: 'Luteal',
};

/** Parse a 'YYYY-MM' label into {year, month0}. */
function parseMonthKey(key: string): { year: number; month0: number } {
    const parts = key.split('-');
    const y = parseInt(parts[0] ?? '0', 10);
    const m = parseInt(parts[1] ?? '1', 10);
    return { year: y, month0: m - 1 };
}

function monthKey(year: number, month0: number): string {
    return `${year}-${String(month0 + 1).padStart(2, '0')}`;
}

function currentMonthKey(): string {
    const now = new Date();
    return monthKey(now.getUTCFullYear(), now.getUTCMonth());
}

export function CycleCalendar({
    days,
    confidence,
    trackingOnly = false,
    initialMonth,
}: CycleCalendarProps) {
    const { colors, typography, borderRadius } = useTheme();
    const { coral: CORAL } = useCycleAccents();

    // Index the forecast days by ISO date for O(1) cell lookup.
    const byDate = useMemo(() => {
        const map = new Map<string, ForecastDay>();
        for (const d of days) map.set(d.date, d);
        return map;
    }, [days]);

    // Bound the prev/next nav to the months actually covered by the forecast.
    const { minKey, maxKey } = useMemo(() => {
        if (days.length === 0) {
            const k = currentMonthKey();
            return { minKey: k, maxKey: k };
        }
        const sorted = [...days].map((d) => d.date.slice(0, 7)).sort();
        const fallback = currentMonthKey();
        return { minKey: sorted[0] ?? fallback, maxKey: sorted[sorted.length - 1] ?? fallback };
    }, [days]);

    const [month, setMonth] = useState<string>(initialMonth ?? currentMonthKey());

    const { year, month0 } = parseMonthKey(month);

    // Build the 6-row grid: leading blanks for the weekday offset, then each day.
    const cells = useMemo(() => {
        const firstDow = new Date(Date.UTC(year, month0, 1)).getUTCDay();
        const daysInMonth = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
        const out: Array<{ day: number; iso: string } | null> = [];
        for (let i = 0; i < firstDow; i++) out.push(null);
        for (let d = 1; d <= daysInMonth; d++) {
            const iso = `${year}-${String(month0 + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            out.push({ day: d, iso });
        }
        return out;
    }, [year, month0]);

    const canPrev = month > minKey;
    const canNext = month < maxKey;
    const lowConfidence = confidence === 'LOW' || confidence === 'NONE';
    // Predictions are only meaningful when we are NOT in track-only / NONE mode.
    const showPredictions = !trackingOnly && confidence !== 'NONE';

    const step = (delta: number) => {
        let m = month0 + delta;
        let y = year;
        if (m < 0) { m = 11; y -= 1; }
        if (m > 11) { m = 0; y += 1; }
        setMonth(monthKey(y, m));
    };

    return (
        <GlassCard glow={withAlpha(CORAL, 0.12)} radius={borderRadius['2xl']} style={styles.card}>
            <View style={styles.inner}>
                {/* ── Month header + prev/next nav ── */}
                <View style={styles.headerRow}>
                    <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Previous month"
                        accessibilityState={{ disabled: !canPrev }}
                        disabled={!canPrev}
                        onPress={() => step(-1)}
                        hitSlop={10}
                        style={({ pressed }) => [styles.navBtn, (!canPrev || pressed) && { opacity: 0.4 }]}
                    >
                        <Ionicons name="chevron-back" size={22} color={colors.text.primary} />
                    </Pressable>

                    <Text style={[typography.h3, { color: colors.text.primary }]}>
                        {MONTH_NAMES[month0]} {year}
                    </Text>

                    <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Next month"
                        accessibilityState={{ disabled: !canNext }}
                        disabled={!canNext}
                        onPress={() => step(1)}
                        hitSlop={10}
                        style={({ pressed }) => [styles.navBtn, (!canNext || pressed) && { opacity: 0.4 }]}
                    >
                        <Ionicons name="chevron-forward" size={22} color={colors.text.primary} />
                    </Pressable>
                </View>

                {/* ── Weekday header ── */}
                <View style={styles.weekRow}>
                    {WEEKDAYS.map((w, i) => (
                        <Text
                            key={`${w}-${i}`}
                            style={[typography.caption, styles.weekday, { color: colors.text.tertiary }]}
                        >
                            {w}
                        </Text>
                    ))}
                </View>

                {/* ── Day grid ── */}
                <View style={styles.grid}>
                    {cells.map((cell, idx) => {
                        if (!cell) return <View key={`blank-${idx}`} style={styles.cell} />;

                        const fd = byDate.get(cell.iso);
                        const tint = fd ? phaseColor(fd.phase, colors) : null;
                        const isLogged = !!fd?.isLogged;
                        const isFertile = showPredictions && !!fd?.isPredictedFertile;
                        const isOvulation = showPredictions && !!fd?.isPredictedOvulation;

                        // LOGGED = SOLID filled disc. PREDICTED (fertile/ovulation) =
                        // FADED fill + DOTTED border (never solid). Phase tint sits as a
                        // faint background under non-logged days.
                        let bg: string | undefined;
                        let borderStyle: 'solid' | 'dotted' = 'solid';
                        let borderColor: string | undefined;
                        let borderWidth = 0;

                        if (isLogged) {
                            bg = CORAL; // confirmed period — solid coral
                        } else if (isOvulation) {
                            bg = withAlpha(colors.accent.purple, 0.22);
                            borderStyle = 'dotted';
                            borderColor = colors.accent.purple;
                            borderWidth = 1.5;
                        } else if (isFertile) {
                            bg = withAlpha(colors.accent.purple, 0.12);
                            borderStyle = 'dotted';
                            borderColor = withAlpha(colors.accent.purple, 0.5);
                            borderWidth = 1.5;
                        } else if (tint) {
                            bg = withAlpha(tint, 0.16); // faint phase wash
                        }

                        const a11yParts: string[] = [`${MONTH_NAMES[month0]} ${cell.day}`];
                        if (fd && fd.phase !== 'UNKNOWN') a11yParts.push(`${PHASE_LABEL[fd.phase]} phase`);
                        if (isLogged) a11yParts.push('logged period');
                        if (isOvulation) a11yParts.push('predicted ovulation');
                        else if (isFertile) a11yParts.push('predicted fertile');

                        return (
                            <View key={cell.iso} style={styles.cell}>
                                <View
                                    accessible
                                    accessibilityLabel={a11yParts.join(', ')}
                                    testID={`cell-${cell.iso}`}
                                    style={[
                                        styles.dayDisc,
                                        bg ? { backgroundColor: bg } : null,
                                        borderWidth
                                            ? { borderWidth, borderColor, borderStyle }
                                            : null,
                                    ]}
                                >
                                    <Text
                                        style={[
                                            typography.caption,
                                            { color: isLogged ? colors.text.inverse : colors.text.primary },
                                        ]}
                                    >
                                        {cell.day}
                                    </Text>
                                </View>
                            </View>
                        );
                    })}
                </View>

                {/* ── Low-confidence note (research must-have) ── */}
                {lowConfidence ? (
                    <View style={styles.noteRow} accessibilityRole="alert">
                        <Ionicons name="alert-circle-outline" size={15} color={colors.warning} />
                        <Text style={[typography.caption, { color: colors.text.secondary, marginLeft: 6, flex: 1 }]}>
                            Low confidence — log more cycles for better predictions.
                        </Text>
                    </View>
                ) : null}

                {/* ── Legend: distinguishes LOGGED (solid) vs PREDICTED (dotted) ── */}
                <View style={styles.legend}>
                    <LegendItem color={CORAL} label="Logged period" solid colors={colors} typography={typography} />
                    {showPredictions ? (
                        <LegendItem
                            color={colors.accent.purple}
                            label="Predicted fertile"
                            solid={false}
                            colors={colors}
                            typography={typography}
                        />
                    ) : null}
                    <LegendItem color={colors.accent.cyan} label="Phase (estimate)" solid={false} faded colors={colors} typography={typography} />
                </View>
            </View>
        </GlassCard>
    );
}

function LegendItem({
    color,
    label,
    solid,
    faded,
    colors,
    typography,
}: {
    color: string;
    label: string;
    solid: boolean;
    faded?: boolean;
    colors: ReturnType<typeof useTheme>['colors'];
    typography: ReturnType<typeof useTheme>['typography'];
}) {
    return (
        <View style={styles.legendItem}>
            <View
                style={[
                    styles.legendDot,
                    solid
                        ? { backgroundColor: color }
                        : {
                              backgroundColor: faded ? withAlpha(color, 0.16) : withAlpha(color, 0.12),
                              borderWidth: 1.5,
                              borderStyle: 'dotted',
                              borderColor: faded ? 'transparent' : color,
                          },
                ]}
            />
            <Text style={[typography.caption, { color: colors.text.secondary, marginLeft: 6 }]}>{label}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    card: { marginTop: 12 },
    inner: { padding: 16 },
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    navBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    weekRow: { flexDirection: 'row', marginTop: 12 },
    weekday: { flex: 1, textAlign: 'center', letterSpacing: 0.5 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 },
    cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', padding: 2 },
    dayDisc: {
        width: '88%',
        aspectRatio: 1,
        borderRadius: 999,
        alignItems: 'center',
        justifyContent: 'center',
    },
    noteRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 12,
        paddingHorizontal: 4,
    },
    legend: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 14, gap: 14 },
    legendItem: { flexDirection: 'row', alignItems: 'center' },
    legendDot: { width: 14, height: 14, borderRadius: 7 },
});

export default CycleCalendar;
