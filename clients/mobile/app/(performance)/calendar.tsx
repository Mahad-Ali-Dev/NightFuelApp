import React, { useState } from 'react';
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
import { withAlpha } from '@/theme/utils';

const { width } = Dimensions.get('window');

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function TrainingCalendarScreen() {
    const { colors, typography, spacing, borderRadius } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();

    const [viewMode, setViewMode] = useState('Month');

    const historyQuery = useQuery({
        queryKey: ['activity-history'],
        queryFn: () => getHistory(30),
    });

    const history = historyQuery.data ?? [];

    return (
        <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background.primary }]}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.border.default }]}>
                <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Go back" activeOpacity={0.85} onPress={() => router.back()} style={[styles.headerBtn, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
                    <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
                </TouchableOpacity>
                <Text style={[typography.h3, { color: colors.text.primary }]}>Training Calendar</Text>
                <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Add" activeOpacity={0.85} style={[styles.headerBtn, { backgroundColor: withAlpha(colors.accent.coral, 0.14), borderColor: withAlpha(colors.accent.coral, 0.3) }]}>
                    <Ionicons name="add" size={22} color={colors.accent.coral} />
                </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
                {/* View Switcher */}
                <View style={[styles.viewSwitcher, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
                    {['Week', 'Month', 'Year'].map((mode) => (
                        <TouchableOpacity
                            key={mode}
                            activeOpacity={0.85}
                            accessibilityRole="tab"
                            accessibilityLabel={mode}
                            accessibilityState={{ selected: viewMode === mode }}
                            style={[
                                styles.modeBtn,
                                {
                                    backgroundColor: viewMode === mode ? colors.background.tertiary : 'transparent',
                                    borderRadius: borderRadius.md,
                                }
                            ]}
                            onPress={() => setViewMode(mode)}
                        >
                            <Text style={[typography.captionMedium, { color: viewMode === mode ? colors.text.primary : colors.text.secondary, fontWeight: '700' }]}>{mode}</Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Calendar Grid (Simulated) */}
                <View style={{ paddingHorizontal: spacing.xl, marginTop: spacing.xl }}>
                    <Card variant="glass" style={styles.calendarBox} padding="xl">
                        <View style={styles.calHeader}>
                            <Text style={[typography.h3, { color: colors.text.primary }]}>March 2026</Text>
                            <View style={{ flexDirection: 'row', gap: 16 }}>
                                <Ionicons name="chevron-back" size={20} color={colors.text.secondary} />
                                <Ionicons name="chevron-forward" size={20} color={colors.text.secondary} />
                            </View>
                        </View>

                        <View style={styles.dayLabels}>
                            {DAYS.map(d => <Text key={d} style={[styles.dayLabel, { color: colors.text.secondary }]}>{d[0]}</Text>)}
                        </View>

                        <View style={styles.grid}>
                            {/* Mock Grid */}
                            {Array.from({ length: 31 }).map((_, i) => {
                                const day = i + 1;
                                const hasActivity = history.some(h => new Date(h.date).getDate() === day);
                                return (
                                    <TouchableOpacity
                                        key={i}
                                        activeOpacity={0.7}
                                        accessibilityRole="button"
                                        accessibilityLabel={`Day ${day}${hasActivity ? ', has activity' : ''}`}
                                        accessibilityState={{ selected: isToday(day) }}
                                        style={[styles.dayCell, isToday(day) && { backgroundColor: withAlpha(colors.accent.coral, 0.18), borderRadius: 12, borderWidth: 1, borderColor: withAlpha(colors.accent.coral, 0.35) }]}
                                    >
                                        <Text style={[typography.body, { color: isToday(day) ? colors.accent.coral : colors.text.primary, fontWeight: isToday(day) ? '700' : '400' }]}>{day}</Text>
                                        {hasActivity && <View style={[styles.activityDot, { backgroundColor: colors.success }]} />}
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    </Card>
                </View>

                {/* Upcoming sessions */}
                <View style={{ paddingHorizontal: spacing.xl, marginTop: spacing['2xl'] }}>
                    <Text style={[typography.h3, { color: colors.text.primary, marginBottom: spacing.md }]}>Scheduled Sessions</Text>
                    {[
                        { title: 'Push Day - Hypertrophy', time: 'Tomorrow, 08:30', color: colors.accent.coral },
                        { title: 'Full Body Power', time: 'Friday, 17:00', color: colors.accent.cyan },
                    ].map((item, i) => (
                        <View key={i} style={[styles.eventCard, { backgroundColor: colors.background.secondary, borderColor: colors.border.default, borderRadius: borderRadius.xl }]}>
                            <View style={[styles.eventAccent, { backgroundColor: item.color }]} />
                            <View style={{ padding: 16, flex: 1 }}>
                                <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: '700' }]}>{item.title}</Text>
                                <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 4 }]}>{item.time}</Text>
                            </View>
                            <Ionicons name="chevron-forward" size={18} color={colors.text.tertiary} style={{ marginRight: 16 }} />
                        </View>
                    ))}
                </View>
            </ScrollView>
        </View>
    );
}

const isToday = (day: number) => day === new Date().getDate();

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1 },
    headerBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    viewSwitcher: { flexDirection: 'row', marginHorizontal: 20, marginTop: 20, borderRadius: 14, borderWidth: 1, padding: 4 },
    modeBtn: { flex: 1, height: 36, alignItems: 'center', justifyContent: 'center' },
    calendarBox: {},
    calHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    dayLabels: { flexDirection: 'row', marginBottom: 12 },
    dayLabel: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '700' },
    grid: { flexDirection: 'row', flexWrap: 'wrap' },
    dayCell: { width: (width - 80) / 7, height: 45, alignItems: 'center', justifyContent: 'center' },
    activityDot: { width: 4, height: 4, borderRadius: 2, position: 'absolute', bottom: 8 },
    eventCard: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, borderWidth: 1, overflow: 'hidden' },
    eventAccent: { width: 4, height: '100%' },
});
