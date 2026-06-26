import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme';
import { GlassCard } from '@/components/ui';
import { withAlpha } from '@/theme/utils';
import type { CycleHistoryResponse, CycleHistoryEntry } from '@/api/cycle';

/**
 * CycleHistoryCard — past cycles + learned averages from GET /v1/users/me/cycle/
 * history (F28). Renders:
 *  - the average cycle / period length, with a VARIABILITY RANGE (e.g. "28-34
 *    days") derived from the observed cycle lengths so the user sees the spread,
 *    not a single false-precise number.
 *  - a "regularity" chip (REGULAR / IRREGULAR / not-enough-data) from the
 *    learned averages.
 *  - a list of past cycles (each with its cycle length + period/bleed length).
 *
 * Honest-empty: with too little data the server returns null averages /
 * UNKNOWN regularity — we show a "log a couple of cycles" hint instead of a
 * fabricated average.
 */

// Coral period/cycle accent (the brand `accent.coral` token resolves to LIME
// post-rebrand, so coral is an explicit literal here).
const CORAL = '#FF7A90';

export interface CycleHistoryCardProps {
    history?: CycleHistoryResponse;
}

/**
 * Format a 'YYYY-MM-DD' as a soft, human "Mon 14 Jul" (UTC, locale-light).
 * Mirrors CyclePhaseHero.formatPredicted so the history reads as human dates,
 * not a raw-ISO CSV column. Falls back to the raw value if it can't parse.
 */
function formatHistoryDate(iso: string): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!m) return iso;
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    if (Number.isNaN(d.getTime())) return iso;
    const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()];
    const mo = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()];
    return `${wd} ${d.getUTCDate()} ${mo}`;
}

/** Compute an observed cycle-length range "min-max days" from the cycles list. */
function cycleLengthRange(cycles: CycleHistoryEntry[]): string | null {
    const lengths = cycles
        .map((c) => c.cycleLengthDays)
        .filter((n): n is number => n != null);
    if (lengths.length < 2) return null;
    const min = Math.min(...lengths);
    const max = Math.max(...lengths);
    return min === max ? `${min} days` : `${min}-${max} days`;
}

export function CycleHistoryCard({ history }: CycleHistoryCardProps) {
    const { colors, typography, borderRadius } = useTheme();

    const cycles = history?.cycles ?? [];
    const averages = history?.averages;

    const range = useMemo(() => cycleLengthRange(cycles), [cycles]);

    const regularity = averages?.cycleRegularity ?? 'UNKNOWN';
    const hasAverages = averages != null && averages.avgCycleLengthDays != null;

    const regularityChip = (() => {
        if (regularity === 'REGULAR') return { label: 'Regular', color: colors.accent.cyan };
        if (regularity === 'IRREGULAR') return { label: 'Irregular', color: colors.warning };
        return { label: 'Not enough data', color: colors.text.tertiary };
    })();

    return (
        <GlassCard radius={borderRadius['2xl']} style={styles.card}>
            <View style={styles.inner}>
                <View style={styles.header}>
                    <Ionicons name="stats-chart-outline" size={18} color={CORAL} />
                    <Text style={[typography.overline, styles.headerLabel, { color: colors.text.secondary }]}>
                        CYCLE HISTORY
                    </Text>
                    <View style={[styles.chip, { backgroundColor: withAlpha(regularityChip.color, 0.16) }]}>
                        <Text style={[typography.caption, { color: regularityChip.color }]}>
                            {regularityChip.label}
                        </Text>
                    </View>
                </View>

                {hasAverages ? (
                    <>
                        {/* The only hard stats on this screen — VALUE dominates its
                            small muted overline label (big Barlow-Condensed numeral
                            over a tiny uppercase caption), per the Zeitra brief. */}
                        <View style={styles.statsRow}>
                            <View style={styles.stat}>
                                <Text style={[typography.statMedium, { color: colors.text.primary }]}>
                                    {averages!.avgCycleLengthDays}
                                </Text>
                                <Text style={[typography.overline, { color: colors.text.tertiary }]}>
                                    avg cycle (days)
                                </Text>
                                {range ? (
                                    <Text style={[typography.caption, { color: colors.text.tertiary, marginTop: 4 }]}>
                                        Range {range}
                                    </Text>
                                ) : null}
                            </View>
                            <View style={styles.stat}>
                                <Text style={[typography.statMedium, { color: colors.text.primary }]}>
                                    {averages!.avgPeriodLengthDays ?? '—'}
                                </Text>
                                <Text style={[typography.overline, { color: colors.text.tertiary }]}>
                                    avg period (days)
                                </Text>
                            </View>
                        </View>

                        {/* Past cycles as a visual mini-timeline (not a raw-ISO CSV
                            column): each row pairs a phase-tinted period dot with a
                            human "Mon 14 Jul" start label. The most-recent cycle
                            (cycleLengthDays == null) is the live one — its dot reads
                            brighter so the column has a clear "now" anchor. */}
                        <View style={styles.list}>
                            {cycles.map((c) => {
                                const isCurrent = c.cycleLengthDays == null;
                                const dotColor = isCurrent
                                    ? CORAL
                                    : withAlpha(CORAL, 0.45);
                                return (
                                    <View
                                        key={c.startDate}
                                        style={[styles.listRow, { borderTopColor: colors.border.default }]}
                                        accessible
                                        accessibilityLabel={`Cycle starting ${formatHistoryDate(c.startDate)}${
                                            c.cycleLengthDays != null ? `, ${c.cycleLengthDays} day cycle` : ', current cycle'
                                        }${c.periodLengthDays != null ? `, ${c.periodLengthDays} day period` : ''}`}
                                    >
                                        <View style={styles.rowLeft}>
                                            <View style={[styles.timelineDot, { backgroundColor: dotColor }]} />
                                            <Text style={[typography.body, { color: colors.text.primary }]}>
                                                {formatHistoryDate(c.startDate)}
                                            </Text>
                                        </View>
                                        <Text style={[typography.caption, { color: colors.text.secondary }]}>
                                            {c.cycleLengthDays != null ? `${c.cycleLengthDays}d cycle` : 'current'}
                                            {c.periodLengthDays != null ? ` · ${c.periodLengthDays}d period` : ''}
                                        </Text>
                                    </View>
                                );
                            })}
                        </View>
                    </>
                ) : (
                    <Text style={[typography.body, { color: colors.text.secondary, marginTop: 10 }]}>
                        Log a couple of cycles and your average cycle and period length will show up
                        here — along with how much they vary.
                    </Text>
                )}
            </View>
        </GlassCard>
    );
}

const styles = StyleSheet.create({
    card: { marginTop: 12 },
    inner: { padding: 18 },
    header: { flexDirection: 'row', alignItems: 'center' },
    headerLabel: { marginLeft: 8, letterSpacing: 1, flex: 1 },
    chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
    statsRow: { flexDirection: 'row', marginTop: 16, gap: 24 },
    stat: { flex: 1 },
    list: { marginTop: 18 },
    listRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 12,
        borderTopWidth: 1,
    },
    rowLeft: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
    // Tiny phase-tinted marker that turns the list into a visual mini-timeline.
    timelineDot: { width: 8, height: 8, borderRadius: 4, marginRight: 10 },
});

export default CycleHistoryCard;
