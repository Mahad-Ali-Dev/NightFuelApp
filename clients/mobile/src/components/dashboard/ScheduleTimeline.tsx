import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme';

interface TimelineEvent {
    time: string;
    title: string;
    detail?: string;
    icon?: keyof typeof Ionicons.glyphMap;
    iconColor?: string;
    status: 'past' | 'current' | 'future';
}

interface ScheduleTimelineProps {
    events: TimelineEvent[];
    onViewFull?: () => void;
}

export function ScheduleTimeline({ events, onViewFull }: ScheduleTimelineProps) {
    return (
        <View>
            <View style={styles.headerRow}>
                <Text style={styles.heading}>24h Schedule</Text>
                <TouchableOpacity onPress={onViewFull} activeOpacity={0.85}>
                    <Text style={styles.viewFull}>View Full</Text>
                </TouchableOpacity>
            </View>
            {events.map((event, i) => (
                <View key={i} style={styles.item}>
                    <View style={[styles.timeCircle, event.status === 'current' && styles.timeCircleActive, event.status === 'past' && styles.timeCircleDim]}>
                        <Text style={[styles.timeText, event.status === 'current' && styles.timeTextActive]}>{event.time}</Text>
                    </View>
                    <View style={[styles.card, event.status === 'current' && styles.cardActive, event.status === 'past' && styles.cardDim]}>
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.title, event.status === 'past' && { opacity: 0.5 }]}>{event.title}</Text>
                            {event.detail && <Text style={styles.detail}>{event.detail}</Text>}
                        </View>
                        {event.status === 'current' && (
                            <View style={styles.nowBadge}>
                                <Text style={styles.nowText}>NOW</Text>
                            </View>
                        )}
                        {event.status === 'past' && <Ionicons name="checkmark" size={18} color="#00D4AA" />}
                        {event.icon && event.status === 'future' && <Ionicons name={event.icon} size={18} color={event.iconColor || colors.text.secondary} />}
                    </View>
                </View>
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    heading: { color: '#FFFFFF', fontSize: 20, fontWeight: '700' },
    viewFull: { color: '#A8CC3C', fontWeight: '700', fontSize: 12 },
    item: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
    timeCircle: { width: 56, height: 56, borderRadius: 28, borderWidth: 1, borderColor: colors.border.light, alignItems: 'center', justifyContent: 'center', marginRight: 16 },
    timeCircleActive: { borderWidth: 2, borderColor: '#A8CC3C' },
    timeCircleDim: { opacity: 0.5 },
    timeText: { color: colors.text.secondary, fontSize: 12 },
    timeTextActive: { color: '#FFFFFF', fontWeight: '600' },
    card: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.background.secondary, borderRadius: 16, padding: 16 },
    cardActive: { backgroundColor: '#1C2128', borderLeftWidth: 3, borderLeftColor: '#A8CC3C' },
    cardDim: { opacity: 0.5 },
    title: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
    detail: { color: colors.text.secondary, fontSize: 12, marginTop: 2 },
    nowBadge: { backgroundColor: '#A8CC3C30', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
    nowText: { color: '#A8CC3C', fontSize: 10, fontWeight: '800' },
});
