import React, { useState } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    TextInput, KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { log as logSleep, listSessions, SleepSession } from '@/api/sleep';
import { Button } from '@/components/ui';
import { withAlpha } from '@/theme/utils';
import { format, parseISO, differenceInMinutes } from 'date-fns';
import { getErrorMessage } from '@/utils/validation';

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDuration(mins: number | null | undefined): string {
    if (!mins) return '—';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function qualityLabel(q: number | null | undefined): string {
    if (!q) return '—';
    if (q <= 3) return '😴 Poor';
    if (q <= 5) return '😐 Fair';
    if (q <= 7) return '🙂 Good';
    return '🌟 Excellent';
}

function qualityColor(q: number | null | undefined, colors: any): string {
    if (!q) return colors.text.tertiary;
    if (q <= 3) return colors.accent.red;
    if (q <= 5) return colors.accent.amber;
    if (q <= 7) return colors.accent.cyan;
    return colors.accent.emerald;
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function LogSleepModal() {
    const { colors, typography, spacing } = useTheme();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const queryClient = useQueryClient();

    const today = format(new Date(), 'yyyy-MM-dd');
    const [startDay, setStartDay] = useState(today);
    const [startTime, setStartTime] = useState('23:00');
    const [endDay, setEndDay] = useState(today);
    const [endTime, setEndTime] = useState('07:00');
    const [quality, setQuality] = useState(7);
    const [disturbances, setDisturbances] = useState(0);
    const [notes, setNotes] = useState('');
    const [showForm, setShowForm] = useState(false);

    // ── Fetch saved sessions ───────────────────────────────────────────────────
    const { data: sessions = [], isLoading: sessionsLoading, refetch } = useQuery({
        queryKey: ['sleep-sessions'],
        queryFn: () => listSessions(15),
    });

    // ── Save mutation ──────────────────────────────────────────────────────────
    const mutation = useMutation({
        mutationFn: async () => {
            const startStr = `${startDay}T${startTime}:00.000Z`;
            const endStr = `${endDay}T${endTime}:00.000Z`;
            return logSleep({
                startTime: startStr,
                endTime: endStr,
                quality,
                disturbances,
                notes: notes.trim() || undefined,
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['today-progress'] });
            queryClient.invalidateQueries({ queryKey: ['sleep-sessions'] });
            // Reset form
            setStartTime('23:00');
            setEndTime('07:00');
            setQuality(7);
            setDisturbances(0);
            setNotes('');
            setShowForm(false);
            Alert.alert('Saved ✓', 'Sleep recovery data logged successfully.');
        },
        onError: (err) => {
            Alert.alert('Error', getErrorMessage(err));
        },
    });

    const handleSave = () => mutation.mutate();

    // ── Render helpers ─────────────────────────────────────────────────────────

    const renderSessionCard = (session: SleepSession) => {
        const start = parseISO(session.startTime);
        const end = session.endTime ? parseISO(session.endTime) : null;
        const dur = session.durationMins ?? (end ? differenceInMinutes(end, start) : null);

        return (
            <View
                key={session.id}
                style={[styles.sessionCard, {
                    backgroundColor: colors.background.secondary,
                    borderColor: colors.border.default,
                }]}
            >
                {/* Top row: date + duration badge */}
                <View style={styles.sessionHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Ionicons name="moon-outline" size={16} color={colors.accent.purple} />
                        <Text style={[typography.body, { color: colors.text.primary, marginLeft: 6, fontWeight: '600', fontSize: 14 }]}>
                            {format(start, 'MMM d, yyyy')}
                        </Text>
                    </View>
                    <View style={[styles.durationBadge, { backgroundColor: withAlpha(colors.accent.cyan, 0.15) }]}>
                        <Ionicons name="time-outline" size={12} color={colors.accent.cyan} />
                        <Text style={[typography.caption, { color: colors.accent.cyan, marginLeft: 4, fontWeight: '600' }]}>
                            {formatDuration(dur)}
                        </Text>
                    </View>
                </View>

                {/* Time row */}
                <View style={[styles.timeRow, { borderTopColor: withAlpha(colors.border.default, 0.5) }]}>
                    <View style={styles.timeBlock}>
                        <Text style={[typography.caption, { color: colors.text.tertiary, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }]}>Slept</Text>
                        <Text style={[typography.body, { color: colors.text.secondary, fontSize: 13 }]}>
                            {format(start, 'hh:mm a')}
                        </Text>
                    </View>
                    <Ionicons name="arrow-forward" size={14} color={colors.text.tertiary} />
                    <View style={styles.timeBlock}>
                        <Text style={[typography.caption, { color: colors.text.tertiary, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }]}>Woke</Text>
                        <Text style={[typography.body, { color: colors.text.secondary, fontSize: 13 }]}>
                            {end ? format(end, 'hh:mm a') : '—'}
                        </Text>
                    </View>
                    <View style={[styles.dividerVert, { backgroundColor: colors.border.default }]} />
                    <View style={styles.timeBlock}>
                        <Text style={[typography.caption, { color: colors.text.tertiary, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }]}>Quality</Text>
                        <Text style={[typography.body, { color: qualityColor(session.quality, colors), fontSize: 13, fontWeight: '600' }]}>
                            {session.quality ? `${session.quality}/10` : '—'}
                        </Text>
                    </View>
                    {(session.disturbances ?? 0) > 0 && (
                        <>
                            <View style={[styles.dividerVert, { backgroundColor: colors.border.default }]} />
                            <View style={styles.timeBlock}>
                                <Text style={[typography.caption, { color: colors.text.tertiary, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }]}>Wake-ups</Text>
                                <Text style={[typography.body, { color: colors.accent.amber, fontSize: 13, fontWeight: '600' }]}>
                                    {session.disturbances}×
                                </Text>
                            </View>
                        </>
                    )}
                </View>

                {/* Notes */}
                {session.notes ? (
                    <View style={[styles.notesRow, { backgroundColor: withAlpha(colors.accent.purple, 0.06), borderColor: withAlpha(colors.accent.purple, 0.12) }]}>
                        <Ionicons name="document-text-outline" size={13} color={colors.accent.purple} />
                        <Text style={[typography.caption, { color: colors.text.secondary, marginLeft: 6, flex: 1, lineHeight: 18 }]} numberOfLines={2}>
                            {session.notes}
                        </Text>
                    </View>
                ) : null}

                {/* Alignment score */}
                {session.circadianAlignmentScore != null && (
                    <View style={[styles.alignmentRow, { borderTopColor: withAlpha(colors.border.default, 0.3) }]}>
                        <Ionicons name="sunny-outline" size={13} color={colors.accent.amber} />
                        <Text style={[typography.caption, { color: colors.text.tertiary, marginLeft: 6 }]}>
                            Circadian Alignment: <Text style={{ color: colors.accent.cyan, fontWeight: '600' }}>{session.circadianAlignmentScore}%</Text>
                        </Text>
                    </View>
                )}
            </View>
        );
    };

    // ── Main render ────────────────────────────────────────────────────────────

    return (
        <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background.primary }]}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.border.default, backgroundColor: colors.background.secondary }]}>
                <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Ionicons name="close" size={28} color={colors.text.primary} />
                </TouchableOpacity>
                <Text style={[typography.heading, { color: colors.text.primary, fontSize: 18 }]}>Sleep & Recovery</Text>
                <View style={{ width: 28 }} />
            </View>

            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}>

                    {/* ── Add New Button ─────────────────────────────────────── */}
                    {!showForm && (
                        <TouchableOpacity
                            style={[styles.addButton, { backgroundColor: withAlpha(colors.accent.cyan, 0.12), borderColor: withAlpha(colors.accent.cyan, 0.25) }]}
                            onPress={() => setShowForm(true)}
                            activeOpacity={0.7}
                        >
                            <View style={[styles.addIconCircle, { backgroundColor: withAlpha(colors.accent.cyan, 0.2) }]}>
                                <Ionicons name="add" size={24} color={colors.accent.cyan} />
                            </View>
                            <View style={{ flex: 1, marginLeft: 14 }}>
                                <Text style={[typography.heading, { color: colors.text.primary, fontSize: 15 }]}>Log New Sleep</Text>
                                <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 2 }]}>
                                    Track your recovery for circadian optimization
                                </Text>
                            </View>
                            <Ionicons name="chevron-forward" size={20} color={colors.text.tertiary} />
                        </TouchableOpacity>
                    )}

                    {/* ── New Sleep Form ─────────────────────────────────────── */}
                    {showForm && (
                        <View style={[styles.formContainer, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
                            {/* Form header */}
                            <View style={styles.formHeader}>
                                <Text style={[typography.heading, { color: colors.accent.cyan, fontSize: 16 }]}>
                                    <Ionicons name="moon" size={16} color={colors.accent.cyan} /> New Sleep Entry
                                </Text>
                                <TouchableOpacity onPress={() => setShowForm(false)}>
                                    <Ionicons name="close-circle" size={24} color={colors.text.tertiary} />
                                </TouchableOpacity>
                            </View>

                            {/* Sleep Started */}
                            <Text style={[styles.fieldLabel, typography.caption, { color: colors.text.secondary }]}>SLEEP STARTED</Text>
                            <View style={styles.row}>
                                <View style={[styles.inputBox, { backgroundColor: colors.background.primary, borderColor: colors.border.default }]}>
                                    <Ionicons name="calendar-outline" size={18} color={colors.text.tertiary} />
                                    <TextInput
                                        style={[styles.textInput, { color: colors.text.primary }]}
                                        value={startDay}
                                        onChangeText={setStartDay}
                                        placeholder="YYYY-MM-DD"
                                        placeholderTextColor={colors.text.tertiary}
                                    />
                                </View>
                                <View style={[styles.inputBox, { backgroundColor: colors.background.primary, borderColor: colors.border.default, marginLeft: 10 }]}>
                                    <Ionicons name="time-outline" size={18} color={colors.text.tertiary} />
                                    <TextInput
                                        style={[styles.textInput, { color: colors.text.primary }]}
                                        value={startTime}
                                        onChangeText={setStartTime}
                                        placeholder="HH:MM"
                                        placeholderTextColor={colors.text.tertiary}
                                    />
                                </View>
                            </View>

                            {/* Sleep Ended */}
                            <Text style={[styles.fieldLabel, typography.caption, { color: colors.text.secondary, marginTop: 16 }]}>SLEEP ENDED</Text>
                            <View style={styles.row}>
                                <View style={[styles.inputBox, { backgroundColor: colors.background.primary, borderColor: colors.border.default }]}>
                                    <Ionicons name="calendar-outline" size={18} color={colors.text.tertiary} />
                                    <TextInput
                                        style={[styles.textInput, { color: colors.text.primary }]}
                                        value={endDay}
                                        onChangeText={setEndDay}
                                        placeholder="YYYY-MM-DD"
                                        placeholderTextColor={colors.text.tertiary}
                                    />
                                </View>
                                <View style={[styles.inputBox, { backgroundColor: colors.background.primary, borderColor: colors.border.default, marginLeft: 10 }]}>
                                    <Ionicons name="time-outline" size={18} color={colors.text.tertiary} />
                                    <TextInput
                                        style={[styles.textInput, { color: colors.text.primary }]}
                                        value={endTime}
                                        onChangeText={setEndTime}
                                        placeholder="HH:MM"
                                        placeholderTextColor={colors.text.tertiary}
                                    />
                                </View>
                            </View>

                            {/* Quality */}
                            <Text style={[styles.fieldLabel, typography.caption, { color: colors.text.secondary, marginTop: 16 }]}>
                                SLEEP QUALITY: <Text style={{ color: qualityColor(quality, colors), fontWeight: '700' }}>{quality}/10</Text> {qualityLabel(quality)}
                            </Text>
                            <View style={[styles.qualityRow, { borderColor: withAlpha(colors.text.primary, 0.05), backgroundColor: withAlpha(colors.text.primary, 0.02) }]}>
                                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                                    <TouchableOpacity
                                        key={num}
                                        style={[
                                            styles.qualityBtn,
                                            { backgroundColor: quality >= num ? qualityColor(quality, colors) : colors.background.primary },
                                        ]}
                                        onPress={() => setQuality(num)}
                                    />
                                ))}
                            </View>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                                <Text style={[typography.caption, { color: colors.text.tertiary, fontSize: 10 }]}>Poor</Text>
                                <Text style={[typography.caption, { color: colors.text.tertiary, fontSize: 10 }]}>Deep</Text>
                            </View>

                            {/* Disturbances */}
                            <Text style={[styles.fieldLabel, typography.caption, { color: colors.text.secondary, marginTop: 16 }]}>NIGHT WAKE-UPS</Text>
                            <View style={styles.disturbanceRow}>
                                <TouchableOpacity
                                    style={[styles.stepperBtn, { backgroundColor: colors.background.primary, borderColor: colors.border.default }]}
                                    onPress={() => setDisturbances(Math.max(0, disturbances - 1))}
                                >
                                    <Ionicons name="remove" size={20} color={colors.accent.coral} />
                                </TouchableOpacity>
                                <View style={[styles.disturbanceDisplay, { backgroundColor: colors.background.primary, borderColor: colors.border.default }]}>
                                    <Ionicons name="alert-circle-outline" size={16} color={disturbances > 0 ? colors.accent.amber : colors.text.tertiary} />
                                    <Text style={[typography.heading, { color: disturbances > 0 ? colors.accent.amber : colors.text.secondary, fontSize: 18, marginLeft: 6 }]}>
                                        {disturbances}
                                    </Text>
                                </View>
                                <TouchableOpacity
                                    style={[styles.stepperBtn, { backgroundColor: colors.background.primary, borderColor: colors.border.default }]}
                                    onPress={() => setDisturbances(disturbances + 1)}
                                >
                                    <Ionicons name="add" size={20} color={colors.accent.cyan} />
                                </TouchableOpacity>
                            </View>

                            {/* Notes */}
                            <Text style={[styles.fieldLabel, typography.caption, { color: colors.text.secondary, marginTop: 16 }]}>RECOVERY NOTES</Text>
                            <TextInput
                                style={[styles.notesInput, {
                                    backgroundColor: colors.background.primary,
                                    borderColor: colors.border.default,
                                    color: colors.text.primary,
                                }]}
                                value={notes}
                                onChangeText={setNotes}
                                placeholder="e.g. Woke up to bright light, felt groggy, used blackout curtains"
                                placeholderTextColor={colors.text.tertiary}
                                multiline
                                textAlignVertical="top"
                            />

                            {/* Save button */}
                            <Button
                                title="Save Recovery Data"
                                onPress={handleSave}
                                variant="primary"
                                loading={mutation.isPending}
                                style={{ marginTop: 20 }}
                            />
                        </View>
                    )}

                    {/* ── Saved Sessions ─────────────────────────────────────── */}
                    <View style={styles.sectionHeader}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Ionicons name="bed-outline" size={18} color={colors.accent.purple} />
                            <Text style={[typography.heading, { color: colors.text.primary, fontSize: 16, marginLeft: 8 }]}>
                                Recovery History
                            </Text>
                        </View>
                        <TouchableOpacity onPress={() => refetch()}>
                            <Ionicons name="refresh-outline" size={18} color={colors.text.tertiary} />
                        </TouchableOpacity>
                    </View>

                    {sessionsLoading ? (
                        <View style={styles.loadingContainer}>
                            <ActivityIndicator size="small" color={colors.accent.cyan} />
                            <Text style={[typography.caption, { color: colors.text.tertiary, marginTop: 8 }]}>
                                Loading sleep data…
                            </Text>
                        </View>
                    ) : sessions.length === 0 ? (
                        <View style={[styles.emptyState, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
                            <Ionicons name="moon-outline" size={40} color={colors.text.tertiary} />
                            <Text style={[typography.body, { color: colors.text.secondary, marginTop: 12, textAlign: 'center' }]}>
                                No sleep data yet
                            </Text>
                            <Text style={[typography.caption, { color: colors.text.tertiary, marginTop: 4, textAlign: 'center' }]}>
                                Log your first sleep to start tracking recovery
                            </Text>
                        </View>
                    ) : (
                        sessions.map(renderSessionCard)
                    )}

                </ScrollView>
            </KeyboardAvoidingView>
        </View>
    );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderBottomWidth: 1,
        elevation: 2,
    },
    // Add button
    addButton: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderRadius: 14,
        borderWidth: 1,
        marginBottom: 24,
    },
    addIconCircle: {
        width: 44,
        height: 44,
        borderRadius: 22,
        justifyContent: 'center',
        alignItems: 'center',
    },
    // Form
    formContainer: {
        borderRadius: 16,
        borderWidth: 1,
        padding: 18,
        marginBottom: 24,
    },
    formHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 18,
    },
    fieldLabel: {
        fontSize: 11,
        fontWeight: '600',
        letterSpacing: 0.8,
        marginBottom: 8,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    inputBox: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderRadius: 10,
        paddingHorizontal: 10,
        minHeight: 44,
    },
    textInput: {
        flex: 1,
        marginLeft: 6,
        fontFamily: 'Inter',
        fontSize: 15,
    },
    qualityRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        height: 36,
        borderWidth: 1,
        borderRadius: 8,
        padding: 3,
    },
    qualityBtn: {
        flex: 1,
        height: '100%',
        borderRadius: 4,
        marginHorizontal: 1.5,
    },
    // Disturbances
    disturbanceRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
    },
    stepperBtn: {
        width: 44,
        height: 44,
        borderRadius: 12,
        borderWidth: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    disturbanceDisplay: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 20,
        height: 44,
        borderRadius: 12,
        borderWidth: 1,
        minWidth: 80,
    },
    notesInput: {
        borderWidth: 1,
        borderRadius: 10,
        padding: 12,
        minHeight: 80,
        fontFamily: 'Inter',
        fontSize: 14,
    },
    // Section header
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 14,
    },
    // Session card
    sessionCard: {
        borderRadius: 14,
        borderWidth: 1,
        padding: 14,
        marginBottom: 12,
    },
    sessionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
    },
    durationBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 20,
    },
    timeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingTop: 10,
        borderTopWidth: 1,
        gap: 10,
    },
    timeBlock: {
        alignItems: 'center',
    },
    dividerVert: {
        width: 1,
        height: 28,
    },
    notesRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginTop: 10,
        padding: 10,
        borderRadius: 8,
        borderWidth: 1,
    },
    alignmentRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 10,
        paddingTop: 10,
        borderTopWidth: 1,
    },
    // States
    loadingContainer: {
        alignItems: 'center',
        paddingVertical: 32,
    },
    emptyState: {
        alignItems: 'center',
        paddingVertical: 40,
        borderRadius: 14,
        borderWidth: 1,
    },
});
