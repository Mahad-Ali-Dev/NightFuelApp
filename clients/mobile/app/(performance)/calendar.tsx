import React, { useMemo, useState } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { getHistory } from '@/api/progress';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui';
import { withAlpha } from '@/theme/utils';

const { width } = Dimensions.get('window');

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];

/** Zero-pad a 1- or 2-digit number for ISO date assembly. */
const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);

/**
 * Build a `YYYY-MM-DD` string from LOCAL date parts. We deliberately avoid
 * `Date.toISOString()` (which converts to UTC) so a cell's date matches the
 * user's local calendar day rather than silently shifting across the date
 * line. `month` is 0-indexed (JS convention).
 */
const toLocalISODate = (year: number, month: number, day: number) =>
    `${year}-${pad2(month + 1)}-${pad2(day)}`;

export default function TrainingCalendarScreen() {
    const { colors, typography, spacing } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();

    // Displayed month/year. Seeded to the current month so the calendar opens
    // on "today" rather than a hardcoded literal. `month` is 0-indexed.
    const [cursor, setCursor] = useState(() => {
        const now = new Date();
        return { year: now.getFullYear(), month: now.getMonth() };
    });

    const goToPrevMonth = () =>
        setCursor(({ year, month }) =>
            month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 },
        );

    const goToNextMonth = () =>
        setCursor(({ year, month }) =>
            month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 },
        );

    const historyQuery = useQuery({
        queryKey: ['activity-history'],
        queryFn: () => getHistory(30),
    });

    const history = historyQuery.data ?? [];

    // Today's LOCAL ISO date for the highlight; recomputed only when the day
    // boundary could plausibly matter (cursor change re-renders anyway).
    const todayISO = useMemo(() => {
        const now = new Date();
        return toLocalISODate(now.getFullYear(), now.getMonth(), now.getDate());
    }, []);

    const monthLabel = `${MONTH_NAMES[cursor.month]} ${cursor.year}`;

    // Real geometry for the displayed month: how many days it has, and how many
    // leading blanks a Monday-first grid needs (JS getDay(): Sun=0..Sat=6 →
    // Mon-first offset where Mon=0..Sun=6).
    const { daysInMonth, leadingBlanks } = useMemo(() => {
        const days = new Date(cursor.year, cursor.month + 1, 0).getDate();
        const firstWeekday = new Date(cursor.year, cursor.month, 1).getDay();
        const blanks = (firstWeekday + 6) % 7;
        return { daysInMonth: days, leadingBlanks: blanks };
    }, [cursor.year, cursor.month]);

    return (
        <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background.primary }]}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.border.default }]}>
                <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Go back" activeOpacity={0.85} onPress={() => router.back()} style={[styles.headerBtn, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
                    <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
                </TouchableOpacity>
                <Text style={[typography.h3, { color: colors.text.primary }]}>Training Calendar</Text>
                {/* Balancing spacer (mirrors the back button's width) so the title
                    stays centered. There is no honest "add" action on this screen
                    yet: activity is logged by completing a workout, and scheduling
                    sessions has no backend, so a header "+" would have been a
                    no-op. Reinstate a real TouchableOpacity here once a concrete
                    add-flow exists. */}
                <View style={{ width: 40 }} />
            </View>

            <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
                {/* Calendar Grid */}
                <View style={{ paddingHorizontal: spacing.xl, marginTop: spacing.xl }}>
                    <Card variant="glass" style={styles.calendarBox} padding="xl">
                        <View style={styles.calHeader}>
                            <Text style={[typography.h3, { color: colors.text.primary }]}>{monthLabel}</Text>
                            <View style={{ flexDirection: 'row', gap: 16 }}>
                                <TouchableOpacity
                                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                    accessibilityRole="button"
                                    accessibilityLabel="Previous month"
                                    activeOpacity={0.7}
                                    onPress={goToPrevMonth}
                                >
                                    <Ionicons name="chevron-back" size={20} color={colors.text.secondary} />
                                </TouchableOpacity>
                                <TouchableOpacity
                                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                    accessibilityRole="button"
                                    accessibilityLabel="Next month"
                                    activeOpacity={0.7}
                                    onPress={goToNextMonth}
                                >
                                    <Ionicons name="chevron-forward" size={20} color={colors.text.secondary} />
                                </TouchableOpacity>
                            </View>
                        </View>

                        <View style={styles.dayLabels}>
                            {DAYS.map(d => <Text key={d} style={[styles.dayLabel, { color: colors.text.secondary }]}>{d[0]}</Text>)}
                        </View>

                        {historyQuery.isError ? (
                            <EmptyState
                                icon="cloud-offline-outline"
                                title="Couldn't load activity"
                                subtitle="We couldn't reach your training history. Check your connection and try again."
                                actionLabel="Retry"
                                onAction={() => historyQuery.refetch()}
                            />
                        ) : history.length === 0 && !historyQuery.isLoading ? (
                            <EmptyState
                                icon="calendar-outline"
                                title="No activity logged this month"
                                subtitle="Complete a workout to start filling in your training calendar."
                            />
                        ) : (
                            <View style={styles.grid}>
                                {/* Leading blanks so day 1 lands under its real weekday. */}
                                {Array.from({ length: leadingBlanks }).map((_, i) => (
                                    <View key={`blank-${i}`} style={styles.dayCell} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
                                ))}
                                {Array.from({ length: daysInMonth }).map((_, i) => {
                                    const day = i + 1;
                                    const cellISO = toLocalISODate(cursor.year, cursor.month, day);
                                    const hasActivity = history.some(h => h.date.slice(0, 10) === cellISO);
                                    const isToday = cellISO === todayISO;
                                    return (
                                        <TouchableOpacity
                                            key={cellISO}
                                            activeOpacity={0.7}
                                            accessibilityRole="button"
                                            accessibilityLabel={`Day ${day}${hasActivity ? ', has activity' : ''}`}
                                            accessibilityState={{ selected: isToday }}
                                            style={[styles.dayCell, isToday && { backgroundColor: withAlpha(colors.accent.coral, 0.18), borderRadius: 12, borderWidth: 1, borderColor: withAlpha(colors.accent.coral, 0.35) }]}
                                        >
                                            <Text style={[typography.body, { color: isToday ? colors.accent.coral : colors.text.primary, fontWeight: isToday ? '700' : '400' }]}>{day}</Text>
                                            {hasActivity && <View style={[styles.activityDot, { backgroundColor: colors.success }]} />}
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        )}
                    </Card>
                </View>

                {/* Upcoming sessions — honest empty state.
                    There is no planned-sessions read path in the mobile API layer
                    (no getPlannedSessions / scheduledSessions endpoint exists), so
                    we surface a truthful zero-data state rather than fabricating
                    sessions. See risks: backend scheduled-sessions endpoint. */}
                <View style={{ paddingHorizontal: spacing.xl, marginTop: spacing['2xl'] }}>
                    <Text style={[typography.h3, { color: colors.text.primary, marginBottom: spacing.md }]}>Scheduled Sessions</Text>
                    <EmptyState
                        icon="calendar-outline"
                        title="No sessions scheduled"
                        subtitle="Upcoming training sessions will appear here once scheduling is available."
                    />
                </View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1 },
    headerBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    calendarBox: {},
    calHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    dayLabels: { flexDirection: 'row', marginBottom: 12 },
    dayLabel: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '700' },
    grid: { flexDirection: 'row', flexWrap: 'wrap' },
    dayCell: { width: (width - 80) / 7, height: 45, alignItems: 'center', justifyContent: 'center' },
    activityDot: { width: 4, height: 4, borderRadius: 2, position: 'absolute', bottom: 8 },
});
