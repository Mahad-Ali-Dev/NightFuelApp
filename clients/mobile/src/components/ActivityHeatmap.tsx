/**
 * ActivityHeatmap — GitHub-style workout activity grid.
 * Ported from the web ActivityHeatmap component.
 * Shows 16 weeks of workout activity with intensity-based colour coding.
 */
import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useTheme } from '@/theme';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { getRecent } from '@/api/exercises';
import { withAlpha } from '@/theme/utils';
import { localDateKey } from '@/components/activityHeatmapDate';

const CELL   = 10;   // px per cell
const GAP    = 2;    // px gap between cells
const WEEKS  = 16;   // weeks to display (~4 months)

const DAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

const INTENSITY_COLORS: string[] = [
    'rgba(255,255,255,0.05)',  // 0 — no activity
    'rgba(16,185,129,0.20)',   // 1 — light
    'rgba(16,185,129,0.45)',   // 2 — moderate
    'rgba(16,185,129,0.72)',   // 3 — intense
    '#10B981',                  // 4 — max
];

function getIntensity(minutes: number): number {
    if (minutes === 0)  return 0;
    if (minutes <= 20)  return 1;
    if (minutes <= 45)  return 2;
    if (minutes <= 75)  return 3;
    return 4;
}

// localDateKey lives in ./activityHeatmapDate (pure, dependency-free) so it can
// be unit-tested without loading this RN/expo component. Re-export for any
// existing importer of `@/components/ActivityHeatmap`.
export { localDateKey };

interface CellData {
    date:      string;
    day:       number;   // 0 = Sun
    week:      number;
    intensity: number;
    minutes:   number;
}

export function ActivityHeatmap() {
    const { colors } = useTheme();

    // Fetch recent workout logs (same endpoint as web component)
    const { data: workouts = [] } = useQuery({
        queryKey: ['exercises-heatmap'],
        queryFn:  () => getRecent(200).catch(() => []),
        staleTime: 60_000,
        retry: 1,
    });

    // Build date → {duration, count} map
    const workoutMap = useMemo(() => {
        const map = new Map<string, { duration: number; count: number }>();
        (workouts as any[]).forEach((w: any) => {
            const raw: string = w.createdAt ?? w.date ?? '';
            if (!raw) return;
            // Key by the LOCAL calendar day so a workout lands in the same column
            // the grid (which iterates local days) draws for that day. For a full
            // ISO instant we parse and read LOCAL fields (a bare `split('T')[0]`
            // would use the UTC day instead — the bug). A date-only value (no time
            // component) already names a calendar day with no zone, so we take it
            // verbatim rather than re-interpreting it as a UTC instant.
            let date: string;
            if (raw.includes('T')) {
                const parsed = new Date(raw);
                date = Number.isNaN(parsed.getTime()) ? (raw.split('T')[0] as string) : localDateKey(parsed);
            } else {
                date = raw.split('T')[0] as string;
            }
            if (!date) return;
            const existing = map.get(date);
            if (existing) {
                existing.duration += (w.duration as number | undefined) ?? 0;
                existing.count    += 1;
            } else {
                map.set(date, { duration: (w.duration as number | undefined) ?? 0, count: 1 });
            }
        });
        return map;
    }, [workouts]);

    // Generate flat cell list
    const grid = useMemo<CellData[]>(() => {
        const cells: CellData[] = [];
        const today    = new Date();
        const startDay = new Date(today);
        startDay.setDate(startDay.getDate() - (WEEKS * 7 - 1));
        startDay.setDate(startDay.getDate() - startDay.getDay()); // align to Sunday

        let week = 0;
        const cursor = new Date(startDay);
        while (cursor <= today) {
            const dateStr  = localDateKey(cursor); // local frame — matches grid iteration
            const dayOfWeek = cursor.getDay();
            const wo        = workoutMap.get(dateStr);
            cells.push({
                date:      dateStr,
                day:       dayOfWeek,
                week,
                intensity: getIntensity(wo?.duration ?? 0),
                minutes:   wo?.duration ?? 0,
            });
            cursor.setDate(cursor.getDate() + 1);
            if (dayOfWeek === 6) week++;
        }
        return cells;
    }, [workoutMap]);

    // Group by week index
    const weekGroups = useMemo(() => {
        const groups: CellData[][] = [];
        grid.forEach(cell => {
            if (!groups[cell.week]) groups[cell.week] = [];
            groups[cell.week]!.push(cell);
        });
        return groups;
    }, [grid]);

    // Month labels
    const monthLabels = useMemo(() => {
        const labels: { label: string; week: number }[] = [];
        let lastMonth = -1;
        grid.forEach(cell => {
            // cell.date is a LOCAL `YYYY-MM-DD` key. Parse it back as LOCAL
            // midnight (not `new Date('YYYY-MM-DD')`, which is UTC midnight and
            // would read one day earlier for users behind UTC) so the month label
            // stays in the same frame as the grid.
            const [y, m, d] = cell.date.split('-').map(Number) as [number, number, number];
            const local = new Date(y, m - 1, d);
            const month = local.getMonth();
            if (month !== lastMonth && cell.day === 0) {
                labels.push({
                    label: local.toLocaleString('default', { month: 'short' }),
                    week:  cell.week,
                });
                lastMonth = month;
            }
        });
        return labels;
    }, [grid]);

    const activeDays   = workoutMap.size;
    const totalMinutes = Array.from(workoutMap.values()).reduce((s, d) => s + d.duration, 0);
    const todayStr     = localDateKey(new Date()); // local frame — matches cell date keys

    return (
        <View style={[s.card, {
            backgroundColor: colors.background.secondary,
            borderColor:     withAlpha(colors.text.primary, 0.06),
        }]}>
            {/* ── Header ── */}
            <View style={s.header}>
                <View style={s.headerLeft}>
                    <View style={[s.iconWrap, { backgroundColor: withAlpha('#10B981', 0.15) }]}>
                        <Ionicons name="flame" size={16} color="#10B981" />
                    </View>
                    <View>
                        <Text style={[s.title, { color: colors.text.primary }]}>Activity Heatmap</Text>
                        <Text style={[s.sub,   { color: colors.text.tertiary }]}>
                            {activeDays} active days · {Math.round(totalMinutes / 60)}h total
                        </Text>
                    </View>
                </View>

                {/* Legend */}
                <View style={s.legend}>
                    <Text style={[s.legendTxt, { color: colors.text.tertiary }]}>Less</Text>
                    {INTENSITY_COLORS.map((c, i) => (
                        <View key={i} style={[s.legendCell, { backgroundColor: c }]} />
                    ))}
                    <Text style={[s.legendTxt, { color: colors.text.tertiary }]}>More</Text>
                </View>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={s.gridWrap}>
                    {/* Month labels row */}
                    <View style={s.monthRow}>
                        <View style={{ width: 28 }} />
                        {monthLabels.map((m, i) => (
                            <View
                                key={i}
                                style={[s.monthLabel, { left: 28 + m.week * (CELL + GAP) }]}
                                pointerEvents="none"
                            >
                                <Text style={[s.monthTxt, { color: colors.text.tertiary }]}>{m.label}</Text>
                            </View>
                        ))}
                    </View>

                    {/* Day labels + week columns */}
                    <View style={s.gridBody}>
                        {/* Day labels */}
                        <View style={s.dayLabelCol}>
                            {DAY_LABELS.map((label, i) => (
                                <View key={i} style={{ height: CELL + GAP, justifyContent: 'center' }}>
                                    <Text style={[s.dayTxt, { color: colors.text.tertiary }]}>{label}</Text>
                                </View>
                            ))}
                        </View>

                        {/* Week columns */}
                        {weekGroups.map((weekCells, weekIdx) => (
                            <View key={weekIdx} style={s.weekCol}>
                                {Array.from({ length: 7 }).map((_, dayIdx) => {
                                    const cell = weekCells?.find(c => c.day === dayIdx);
                                    if (!cell) {
                                        return <View key={dayIdx} style={{ width: CELL, height: CELL }} />;
                                    }
                                    const isToday   = cell.date === todayStr;
                                    const bgColor   = INTENSITY_COLORS[cell.intensity] ?? INTENSITY_COLORS[0]!;
                                    return (
                                        <View
                                            key={dayIdx}
                                            style={[
                                                s.cell,
                                                { backgroundColor: bgColor },
                                                isToday && s.todayCell,
                                            ]}
                                        />
                                    );
                                })}
                            </View>
                        ))}
                    </View>
                </View>
            </ScrollView>
        </View>
    );
}

const s = StyleSheet.create({
    card:        { borderRadius: 20, borderWidth: 1, padding: 16 },
    header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
    headerLeft:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
    iconWrap:    { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
    title:       { fontSize: 13, fontWeight: '700' },
    sub:         { fontSize: 11, fontWeight: '500', marginTop: 1 },
    legend:      { flexDirection: 'row', alignItems: 'center', gap: 3 },
    legendTxt:   { fontSize: 9, fontWeight: '500' },
    legendCell:  { width: 10, height: 10, borderRadius: 2 },

    gridWrap:    { position: 'relative' },
    monthRow:    { flexDirection: 'row', height: 14, marginBottom: 2, position: 'relative' },
    monthLabel:  { position: 'absolute' },
    monthTxt:    { fontSize: 9, fontWeight: '600' },

    gridBody:    { flexDirection: 'row', gap: GAP },
    dayLabelCol: { width: 24, gap: GAP },
    dayTxt:      { fontSize: 9, fontWeight: '600', textAlign: 'right' },

    weekCol:     { flexDirection: 'column', gap: GAP },
    cell:        { width: CELL, height: CELL, borderRadius: 2 },
    todayCell:   { borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)' },
});
