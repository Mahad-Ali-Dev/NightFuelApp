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

export interface CycleHistoryCardProps {
    history?: CycleHistoryResponse;
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
                    <Ionicons name="stats-chart-outline" size={18} color={colors.accent.coral} />
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
                        <View style={styles.statsRow}>
                            <View style={styles.stat}>
                                <Text style={[typography.h2, { color: colors.text.primary }]}>
                                    {averages!.avgCycleLengthDays}
                                </Text>
                                <Text style={[typography.caption, { color: colors.text.secondary }]}>
                                    avg cycle (days)
                                </Text>
                                {range ? (
                                    <Text style={[typography.caption, { color: colors.text.tertiary, marginTop: 2 }]}>
                                        Range {range}
                                    </Text>
                                ) : null}
                            </View>
                            <View style={styles.stat}>
                                <Text style={[typography.h2, { color: colors.text.primary }]}>
                                    {averages!.avgPeriodLengthDays ?? '—'}
                                </Text>
                                <Text style={[typography.caption, { color: colors.text.secondary }]}>
                                    avg period (days)
                                </Text>
                            </View>
                        </View>

                        {/* Past cycles list */}
                        <View style={styles.list}>
                            {cycles.map((c) => (
                                <View
                                    key={c.startDate}
                                    style={[styles.listRow, { borderTopColor: colors.border.default }]}
                                    accessible
                                    accessibilityLabel={`Cycle starting ${c.startDate}${
                                        c.cycleLengthDays != null ? `, ${c.cycleLengthDays} day cycle` : ''
                                    }${c.periodLengthDays != null ? `, ${c.periodLengthDays} day period` : ''}`}
                                >
                                    <Text style={[typography.body, { color: colors.text.primary }]}>
                                        {c.startDate}
                                    </Text>
                                    <Text style={[typography.caption, { color: colors.text.secondary }]}>
                                        {c.cycleLengthDays != null ? `${c.cycleLengthDays}d cycle` : 'current'}
                                        {c.periodLengthDays != null ? ` · ${c.periodLengthDays}d period` : ''}
                                    </Text>
                                </View>
                            ))}
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
});

export default CycleHistoryCard;
