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
                <TouchableOpacity onPress={() => router.back()}>
                    <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
                </TouchableOpacity>
                <Text style={[typography.heading, { color: colors.text.primary, fontSize: 20 }]}>Training Calendar</Text>
                <TouchableOpacity>
                    <Ionicons name="add-circle-outline" size={24} color={colors.accent.coral} />
                </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
                {/* View Switcher */}
                <View style={styles.viewSwitcher}>
                    {['Week', 'Month', 'Year'].map((mode) => (
                        <TouchableOpacity
                            key={mode}
                            style={[
                                styles.modeBtn,
                                {
                                    backgroundColor: viewMode === mode ? colors.background.tertiary : 'transparent',
                                    borderRadius: borderRadius.lg,
                                }
                            ]}
                            onPress={() => setViewMode(mode)}
                        >
                            <Text style={[typography.caption, { color: viewMode === mode ? colors.text.primary : colors.text.tertiary, fontWeight: '700' }]}>{mode}</Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Calendar Grid (Simulated) */}
                <View style={{ paddingHorizontal: spacing.xl, marginTop: spacing.xl }}>
                    <View style={[styles.calendarBox, { backgroundColor: colors.background.secondary, borderColor: colors.border.default, borderRadius: borderRadius['2xl'], borderWidth: 1 }]}>
                        <View style={styles.calHeader}>
                            <Text style={[typography.heading, { color: colors.text.primary, fontSize: 18 }]}>March 2026</Text>
                            <View style={{ flexDirection: 'row', gap: 16 }}>
                                <Ionicons name="chevron-back" size={20} color={colors.text.secondary} />
                                <Ionicons name="chevron-forward" size={20} color={colors.text.secondary} />
                            </View>
                        </View>

                        <View style={styles.dayLabels}>
                            {DAYS.map(d => <Text key={d} style={[styles.dayLabel, { color: colors.text.tertiary }]}>{d[0]}</Text>)}
                        </View>

                        <View style={styles.grid}>
                            {/* Mock Grid */}
                            {Array.from({ length: 31 }).map((_, i) => {
                                const day = i + 1;
                                const hasActivity = history.some(h => new Date(h.date).getDate() === day);
                                return (
                                    <TouchableOpacity
                                        key={i}
                                        style={[styles.dayCell, isToday(day) && { backgroundColor: `${colors.accent.coral}20`, borderRadius: 12 }]}
                                    >
                                        <Text style={[typography.body, { color: isToday(day) ? colors.accent.coral : colors.text.primary, fontWeight: isToday(day) ? '700' : '400' }]}>{day}</Text>
                                        {hasActivity && <View style={[styles.activityDot, { backgroundColor: colors.success }]} />}
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    </View>
                </View>

                {/* Upcoming sessions */}
                <View style={{ paddingHorizontal: spacing.xl, marginTop: spacing['2xl'] }}>
                    <Text style={[typography.heading, { color: colors.text.primary, marginBottom: spacing.md }]}>Scheduled Sessions</Text>
                    {[
                        { title: 'Push Day - Hypertrophy', time: 'Tomorrow, 08:30', color: colors.accent.coral },
                        { title: 'Full Body Power', time: 'Friday, 17:00', color: colors.accent.cyan },
                    ].map((item, i) => (
                        <View key={i} style={[styles.eventCard, { backgroundColor: colors.background.secondary, borderColor: colors.border.default, borderRadius: borderRadius.xl }]}>
                            <View style={[styles.eventAccent, { backgroundColor: item.color }]} />
                            <View style={{ padding: 16 }}>
                                <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: '700' }]}>{item.title}</Text>
                                <Text style={[typography.caption, { color: colors.text.tertiary, marginTop: 4 }]}>{item.time}</Text>
                            </View>
                            <Ionicons name="chevron-forward" size={18} color={colors.text.tertiary} style={{ marginLeft: 'auto', marginRight: 16 }} />
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
    viewSwitcher: { flexDirection: 'row', marginHorizontal: 20, marginTop: 20, backgroundColor: 'transparent', borderRadius: 12, padding: 4 },
    modeBtn: { flex: 1, height: 32, alignItems: 'center', justifyContent: 'center' },
    calendarBox: { padding: 20 },
    calHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    dayLabels: { flexDirection: 'row', marginBottom: 12 },
    dayLabel: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '700' },
    grid: { flexDirection: 'row', flexWrap: 'wrap' },
    dayCell: { width: (width - 80) / 7, height: 45, alignItems: 'center', justifyContent: 'center' },
    activityDot: { width: 4, height: 4, borderRadius: 2, position: 'absolute', bottom: 8 },
    eventCard: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, borderWidth: 1, overflow: 'hidden' },
    eventAccent: { width: 4, height: '100%' },
});
