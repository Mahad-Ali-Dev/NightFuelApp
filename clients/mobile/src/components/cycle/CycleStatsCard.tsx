import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '@/theme';
import { useCycleAccents } from '@/theme/useCycleAccents';
import { GlassCard, Skeleton } from '@/components/ui';
import { withAlpha } from '@/theme/utils';
import { getCycleHistory, getCycleSymptoms } from '@/api/cycle';
import type { CycleHistoryEntry } from '@/api/cycle';
import { SYMPTOM_LABELS, ALL_SYMPTOM_KEYS } from '@/features/cycle/symptoms';

/**
 * CycleStatsCard — a small at-a-glance dashboard sitting beside CycleHistoryCard.
 *
 * Reads TWO already-cheap sources:
 *   • GET /v1/users/me/cycle/history — learned averages + the per-cycle lengths
 *     that drive the tiles + bar chart.
 *   • GET /v1/users/me/cycle/symptoms?days=90 — the trailing symptom window we
 *     tally to surface the user's most-logged body-feel tags.
 *
 * Renders (all honest-empty when data is thin):
 *   1. Four metric tiles — avg cycle length, avg period length, shortest and
 *      longest observed cycle (shortest/longest DERIVED from cycles[] lengths).
 *   2. A cycle-length history bar chart, built with plain Views (NO chart
 *      library) — the same bar idiom as the rest of the performance stack.
 *   3. A "top symptoms" list — the 5 most-tallied symptom keys over the window,
 *      labelled via SYMPTOM_LABELS with a count each.
 *
 * HONEST-EMPTY: with fewer than two completed cycles the server can't offer an
 * average or a spread, so we show a gentle "log a couple of cycles" hint instead
 * of a fabricated number. The symptom list only appears once anything's tallied.
 *
 * Wellness framing only — these are personal-tracking summaries, never a
 * diagnosis or medical metric.
 */

// The coral period accent is theme-aware — see useCycleAccents (dark #FF7A90,
// darkened on light); sourced per-render in every component below.

// Need at least this many cycle-length samples before a spread means anything.
const MIN_CYCLES_FOR_STATS = 2;
// How many top symptoms to surface, and how far back to tally them.
const TOP_SYMPTOM_COUNT = 5;
const SYMPTOM_WINDOW_DAYS = 90;

/** Derive the observed cycle-length samples (drops the null current cycle). */
function cycleLengths(cycles: CycleHistoryEntry[]): number[] {
    return cycles
        .map((c) => c.cycleLengthDays)
        .filter((n): n is number => n != null && n > 0);
}

/** Tally symptom keys across the window → sorted [label, count] pairs. */
function topSymptoms(
    entries: Array<{ symptoms?: string[] | null }>,
    limit: number,
): Array<{ key: string; label: string; count: number }> {
    const counts = new Map<string, number>();
    for (const e of entries) {
        for (const key of e.symptoms ?? []) {
            if (!ALL_SYMPTOM_KEYS.has(key)) continue; // ignore any retired slug
            counts.set(key, (counts.get(key) ?? 0) + 1);
        }
    }
    return Array.from(counts.entries())
        .map(([key, count]) => ({ key, label: SYMPTOM_LABELS[key] ?? key, count }))
        // Most-frequent first; tie-break alphabetically so order is stable.
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
        .slice(0, limit);
}

export function CycleStatsCard() {
    const { colors, typography, borderRadius } = useTheme();
    const { coral: CORAL } = useCycleAccents();

    // Reuse the screen-level 'cycle-history' key so this card shares the cache
    // with CycleHistoryCard (one request, both cards refresh on invalidation).
    const historyQuery = useQuery({
        queryKey: ['cycle-history'],
        queryFn: getCycleHistory,
    });
    // 90-day symptom window for the "top symptoms" tally. Distinct key from the
    // logger's 35-day ['cycle-symptoms'] so both windows can coexist in cache.
    const symptomsQuery = useQuery({
        queryKey: ['cycle-symptoms', SYMPTOM_WINDOW_DAYS],
        queryFn: () => getCycleSymptoms(SYMPTOM_WINDOW_DAYS),
    });

    const cycles = historyQuery.data?.cycles ?? [];
    const averages = historyQuery.data?.averages;

    const lengths = useMemo(() => cycleLengths(cycles), [cycles]);
    const shortest = lengths.length ? Math.min(...lengths) : null;
    const longest = lengths.length ? Math.max(...lengths) : null;
    const hasSpread = lengths.length >= MIN_CYCLES_FOR_STATS;

    const symptomTally = useMemo(
        () => topSymptoms(symptomsQuery.data?.symptoms ?? [], TOP_SYMPTOM_COUNT),
        [symptomsQuery.data],
    );
    const maxSymptomCount = symptomTally[0]?.count ?? 0;

    const loading = historyQuery.isLoading || symptomsQuery.isLoading;

    return (
        <GlassCard radius={borderRadius['2xl']} style={styles.card} testID="cycle-stats-card">
            <View style={styles.inner}>
                <View style={styles.header}>
                    <Ionicons name="analytics-outline" size={18} color={CORAL} />
                    <Text style={[typography.overline, styles.headerLabel, { color: colors.text.secondary }]}>
                        CYCLE STATS
                    </Text>
                </View>

                {loading ? (
                    <View style={styles.loadingRow}>
                        <Skeleton height={132} radius={16} style={{ flex: 1 }} />
                    </View>
                ) : (
                    <>
                        {/* ── Four metric tiles ──────────────────────────────────────
                            The value dominates its small muted overline label (big
                            Saira numeral over a tiny uppercase caption), per the
                            Zeitra brief. Em-dash when a stat can't be honestly shown. */}
                        <View style={styles.tileGrid}>
                            <MetricTile
                                value={averages?.avgCycleLengthDays ?? null}
                                label="avg cycle"
                                unit="days"
                            />
                            <MetricTile
                                value={averages?.avgPeriodLengthDays ?? null}
                                label="avg period"
                                unit="days"
                            />
                            <MetricTile
                                value={hasSpread ? shortest : null}
                                label="shortest"
                                unit="days"
                            />
                            <MetricTile
                                value={hasSpread ? longest : null}
                                label="longest"
                                unit="days"
                            />
                        </View>

                        {/* ── Cycle-length bar chart (Views only) ────────────────────
                            One bar per observed cycle length, oldest → newest (the
                            history list is newest-first, so we reverse). Bar height
                            scales to the tallest sample; each bar carries its day
                            count above it in a tall condensed numeral. */}
                        {lengths.length >= 1 ? (
                            <View style={styles.chartBlock}>
                                <Text style={[typography.caption, styles.blockLabel, { color: colors.text.tertiary }]}>
                                    CYCLE LENGTH OVER TIME
                                </Text>
                                <CycleLengthChart lengths={lengths} />
                            </View>
                        ) : (
                            <Text style={[typography.body, { color: colors.text.secondary, marginTop: 14 }]}>
                                Log a couple of cycles and your cycle-length trend, spread and most-
                                common symptoms will show up here.
                            </Text>
                        )}

                        {/* ── Top symptoms (tallied over the 90-day window) ──────────
                            Only rendered once anything's been logged — an empty list
                            simply omits the block rather than showing a bare header. */}
                        {symptomTally.length > 0 ? (
                            <View style={styles.symptomsBlock}>
                                <Text style={[typography.caption, styles.blockLabel, { color: colors.text.tertiary }]}>
                                    MOST-LOGGED SYMPTOMS · LAST 90 DAYS
                                </Text>
                                {symptomTally.map((s) => {
                                    const frac = maxSymptomCount > 0 ? s.count / maxSymptomCount : 0;
                                    return (
                                        <View
                                            key={s.key}
                                            style={styles.symptomRow}
                                            accessible
                                            accessibilityLabel={`${s.label}, logged ${s.count} ${
                                                s.count === 1 ? 'day' : 'days'
                                            }`}
                                        >
                                            <Text
                                                style={[typography.bodySm, styles.symptomLabel, { color: colors.text.primary }]}
                                                numberOfLines={1}
                                            >
                                                {s.label}
                                            </Text>
                                            {/* Horizontal meter — width ∝ share of the top count. */}
                                            <View style={[styles.symptomTrack, { backgroundColor: colors.background.tertiary }]}>
                                                <View
                                                    style={[
                                                        styles.symptomFill,
                                                        {
                                                            width: `${Math.max(8, Math.round(frac * 100))}%`,
                                                            backgroundColor: withAlpha(CORAL, 0.55),
                                                        },
                                                    ]}
                                                />
                                            </View>
                                            <Text style={[typography.caption, styles.symptomCount, { color: colors.text.secondary }]}>
                                                {s.count}
                                            </Text>
                                        </View>
                                    );
                                })}
                            </View>
                        ) : null}

                        <Text style={[typography.caption, { color: colors.text.tertiary, marginTop: 14 }]}>
                            Personal tracking summaries, not medical metrics.
                        </Text>
                    </>
                )}
            </View>
        </GlassCard>
    );
}

/** One metric tile: a big value over a muted overline + unit; em-dash when null. */
function MetricTile({
    value,
    label,
    unit,
}: {
    value: number | null;
    label: string;
    unit: string;
}) {
    const { colors, typography } = useTheme();
    const has = value != null;
    return (
        <View style={[styles.tile, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
            <Text style={[typography.statSmall, { color: has ? colors.text.primary : colors.text.tertiary }]}>
                {has ? value : '—'}
            </Text>
            <Text style={[typography.overline, { color: colors.text.tertiary }]}>{label}</Text>
            <Text style={[typography.caption, { color: colors.text.tertiary }]}>{has ? unit : ' '}</Text>
        </View>
    );
}

/**
 * Cycle-length bar chart — plain Views, no chart library. Bars are laid oldest →
 * newest (input is newest-first, so reversed here); each height scales to the
 * tallest observed length, with the day count labelled above in a tall condensed
 * numeral (Barlow Condensed — the deliberate analytics-numeral case).
 */
function CycleLengthChart({ lengths }: { lengths: number[] }) {
    const { colors, typography } = useTheme();
    const { coral: CORAL } = useCycleAccents();

    // Oldest on the left reads as a natural left→right timeline.
    const ordered = useMemo(() => [...lengths].reverse(), [lengths]);
    const max = Math.max(...ordered);

    return (
        <View style={styles.chart} accessibilityLabel="Cycle length over time bar chart">
            {ordered.map((len, i) => {
                // Scale into the plot height; floor so a short cycle stays visible.
                const h = Math.max(CHART_MIN_BAR, Math.round((len / max) * CHART_MAX_BAR));
                return (
                    <View key={`${i}-${len}`} style={styles.barCol}>
                        <Text
                            style={[typography.caption, styles.barValue, { color: colors.text.secondary }]}
                            numberOfLines={1}
                        >
                            {len}
                        </Text>
                        <View
                            style={[
                                styles.bar,
                                {
                                    height: h,
                                    backgroundColor: withAlpha(CORAL, 0.5),
                                    borderColor: withAlpha(CORAL, 0.7),
                                },
                            ]}
                        />
                    </View>
                );
            })}
        </View>
    );
}

// Bar-chart plot geometry (px). MIN keeps a short cycle from vanishing.
const CHART_MAX_BAR = 96;
const CHART_MIN_BAR = 10;

const styles = StyleSheet.create({
    card: { marginTop: 12 },
    inner: { padding: 18 },
    header: { flexDirection: 'row', alignItems: 'center' },
    headerLabel: { marginLeft: 8, letterSpacing: 1, flex: 1 },
    loadingRow: { marginTop: 16 },
    // 2×2 tile grid — wraps, each tile ~half width minus the gap.
    tileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16 },
    tile: {
        flexGrow: 1,
        flexBasis: '46%',
        borderWidth: 1,
        borderRadius: 14,
        paddingVertical: 12,
        paddingHorizontal: 14,
    },
    blockLabel: { letterSpacing: 1, marginBottom: 12 },
    chartBlock: { marginTop: 20 },
    // Bars share the row, bottom-aligned so they grow from a common baseline.
    chart: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        minHeight: CHART_MAX_BAR + 20,
        gap: 6,
    },
    barCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
    barValue: { marginBottom: 4, fontSize: 11 },
    bar: {
        width: '72%',
        maxWidth: 26,
        minWidth: 8,
        borderWidth: 1,
        borderTopLeftRadius: 6,
        borderTopRightRadius: 6,
    },
    symptomsBlock: { marginTop: 22 },
    symptomRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
    symptomLabel: { width: 96, marginRight: 10 },
    symptomTrack: {
        flex: 1,
        height: 8,
        borderRadius: 4,
        overflow: 'hidden',
    },
    symptomFill: { height: '100%', borderRadius: 4 },
    symptomCount: { width: 24, textAlign: 'right', marginLeft: 8 },
});

export default CycleStatsCard;
