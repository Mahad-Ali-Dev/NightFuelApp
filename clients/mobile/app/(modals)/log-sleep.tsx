import React, { useState } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    TextInput, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { log as logSleep, listSessions, SleepSession } from '@/api/sleep';
import { Button, Card, Skeleton, EmptyState } from '@/components/ui';
import { withAlpha } from '@/theme/utils';
import { shadows } from '@/theme/shadows';
import { typography as themeTypography } from '@/theme/typography';
import { format, parseISO, differenceInMinutes } from 'date-fns';
import { getErrorMessage } from '@/utils/validation';
import {
    validateLogSleepForm,
    fieldErrorsFromAxiosError,
} from '@/lib/logFormSchemas';

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
    // Inline field-level error copy — same shape and lifecycle as the
    // log-shift modal. Populated by the client-side validator before we POST
    // and by the server-error adapter on a Zod 400 from the API.
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

    // ── Fetch saved sessions ───────────────────────────────────────────────────
    const { data: sessions = [], isLoading: sessionsLoading, isError: sessionsError, refetch } = useQuery({
        queryKey: ['sleep-sessions'],
        queryFn: () => listSessions(15),
    });

    // ── Save mutation ──────────────────────────────────────────────────────────
    const mutation = useMutation({
        mutationFn: async () => {
            // Interpret the entered date+time as LOCAL wall-clock, then convert to
            // ISO. Appending `Z` previously treated local times as UTC, shifting
            // every entry by the user's offset (rolling the date to "tomorrow" and
            // breaking the duration). Roll the wake day forward for overnight sleep.
            const start = new Date(`${startDay}T${startTime}:00`);
            let end = new Date(`${endDay}T${endTime}:00`);
            if (isNaN(start.getTime()) || isNaN(end.getTime())) {
                throw new Error('Please enter a valid date and time (YYYY-MM-DD and HH:MM).');
            }
            if (end.getTime() <= start.getTime()) {
                end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
            }
            return logSleep({
                startTime: start.toISOString(),
                endTime: end.toISOString(),
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
            setFieldErrors({});
            setShowForm(false);
            Alert.alert('Saved ✓', 'Sleep recovery data logged successfully.');
        },
        onError: (err) => {
            // Prefer inline field-level errors over an opaque Alert when the
            // server returned a Zod ValidationError (400). 5xx and network
            // errors still fall through to the Alert.
            const fromServer = fieldErrorsFromAxiosError(err);
            if (fromServer) {
                setFieldErrors(fromServer);
                return;
            }
            Alert.alert('Error', getErrorMessage(err));
        },
    });

    const handleSave = () => {
        const result = validateLogSleepForm({
            startDay,
            startTime,
            endDay,
            endTime,
            quality,
            disturbances,
            notes,
        });
        if (!result.ok) {
            setFieldErrors(result.fieldErrors);
            return;
        }
        setFieldErrors({});
        mutation.mutate();
    };

    const hasErrors = Object.keys(fieldErrors).length > 0;

    // Helper to drop a single field error as the user edits it — keeps the
    // red helper text from lingering once the user has obviously moved on.
    const clearFieldError = (key: string) => {
        setFieldErrors((prev) => {
            if (!prev[key]) return prev;
            const { [key]: _omit, ...rest } = prev;
            return rest;
        });
    };

    // ── Render helpers ─────────────────────────────────────────────────────────

    const renderSessionCard = (session: SleepSession) => {
        const start = parseISO(session.startTime);
        const end = session.endTime ? parseISO(session.endTime) : null;
        const dur = session.durationMins ?? (end ? differenceInMinutes(end, start) : null);

        return (
            <Card
                key={session.id}
                variant="glass"
                noPadding
                style={styles.sessionCard}
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
                        <Text style={[typography.caption, { color: colors.text.secondary, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }]}>Slept</Text>
                        <Text style={[typography.body, { color: colors.text.secondary, fontSize: 13 }]}>
                            {format(start, 'hh:mm a')}
                        </Text>
                    </View>
                    <Ionicons name="arrow-forward" size={14} color={colors.text.tertiary} />
                    <View style={styles.timeBlock}>
                        <Text style={[typography.caption, { color: colors.text.secondary, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }]}>Woke</Text>
                        <Text style={[typography.body, { color: colors.text.secondary, fontSize: 13 }]}>
                            {end ? format(end, 'hh:mm a') : '—'}
                        </Text>
                    </View>
                    <View style={[styles.dividerVert, { backgroundColor: colors.border.default }]} />
                    <View style={styles.timeBlock}>
                        <Text style={[typography.caption, { color: colors.text.secondary, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }]}>Quality</Text>
                        <Text style={[typography.body, { color: qualityColor(session.quality, colors), fontSize: 13, fontWeight: '600' }]}>
                            {session.quality ? `${session.quality}/10` : '—'}
                        </Text>
                    </View>
                    {(session.disturbances ?? 0) > 0 && (
                        <>
                            <View style={[styles.dividerVert, { backgroundColor: colors.border.default }]} />
                            <View style={styles.timeBlock}>
                                <Text style={[typography.caption, { color: colors.text.secondary, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }]}>Wake-ups</Text>
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
                        <Text style={[typography.caption, { color: colors.text.secondary, marginLeft: 6 }]}>
                            Circadian Alignment: <Text style={{ color: colors.accent.cyan, fontWeight: '600' }}>{session.circadianAlignmentScore}%</Text>
                        </Text>
                    </View>
                )}
            </Card>
        );
    };

    // ── Main render ────────────────────────────────────────────────────────────

    return (
        <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background.primary }]}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.border.default, backgroundColor: colors.background.secondary }]}>
                <TouchableOpacity activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Close" onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
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
                            accessibilityRole="button"
                            accessibilityLabel="Log new sleep"
                            style={[styles.addButton, { backgroundColor: withAlpha(colors.accent.cyan, 0.12), borderColor: withAlpha(colors.accent.cyan, 0.25) }, shadows.glow(colors.accent.cyan)]}
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
                                <TouchableOpacity activeOpacity={0.85} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Clear" onPress={() => setShowForm(false)}>
                                    <Ionicons name="close-circle" size={24} color={colors.text.tertiary} />
                                </TouchableOpacity>
                            </View>

                            {/* Sleep Started */}
                            <Text style={[styles.fieldLabel, typography.caption, { color: colors.text.secondary }]}>SLEEP STARTED</Text>
                            <View style={styles.row}>
                                <View
                                    style={[
                                        styles.inputBox,
                                        {
                                            backgroundColor: colors.background.primary,
                                            borderColor: fieldErrors.startDay ? colors.accent.red : colors.border.default,
                                        },
                                    ]}
                                >
                                    <Ionicons name="calendar-outline" size={18} color={colors.text.tertiary} />
                                    <TextInput
                                        style={[styles.textInput, { color: colors.text.primary }]}
                                        value={startDay}
                                        onChangeText={(v) => {
                                            setStartDay(v);
                                            clearFieldError('startDay');
                                        }}
                                        placeholder="YYYY-MM-DD"
                                        placeholderTextColor={colors.text.tertiary}
                                    />
                                </View>
                                <View
                                    style={[
                                        styles.inputBox,
                                        {
                                            backgroundColor: colors.background.primary,
                                            borderColor: fieldErrors.startTime ? colors.accent.red : colors.border.default,
                                            marginLeft: 10,
                                        },
                                    ]}
                                >
                                    <Ionicons name="time-outline" size={18} color={colors.text.tertiary} />
                                    <TextInput
                                        style={[styles.textInput, { color: colors.text.primary }]}
                                        value={startTime}
                                        onChangeText={(v) => {
                                            setStartTime(v);
                                            clearFieldError('startTime');
                                        }}
                                        placeholder="HH:MM"
                                        placeholderTextColor={colors.text.tertiary}
                                    />
                                </View>
                            </View>
                            {fieldErrors.startDay ? (
                                <Text accessibilityRole="alert" style={{ color: colors.accent.red, marginTop: 4, fontSize: 12 }}>
                                    {fieldErrors.startDay}
                                </Text>
                            ) : null}
                            {fieldErrors.startTime ? (
                                <Text accessibilityRole="alert" style={{ color: colors.accent.red, marginTop: 4, fontSize: 12 }}>
                                    {fieldErrors.startTime}
                                </Text>
                            ) : null}

                            {/* Sleep Ended */}
                            <Text style={[styles.fieldLabel, typography.caption, { color: colors.text.secondary, marginTop: 16 }]}>SLEEP ENDED</Text>
                            <View style={styles.row}>
                                <View
                                    style={[
                                        styles.inputBox,
                                        {
                                            backgroundColor: colors.background.primary,
                                            borderColor: fieldErrors.endDay ? colors.accent.red : colors.border.default,
                                        },
                                    ]}
                                >
                                    <Ionicons name="calendar-outline" size={18} color={colors.text.tertiary} />
                                    <TextInput
                                        style={[styles.textInput, { color: colors.text.primary }]}
                                        value={endDay}
                                        onChangeText={(v) => {
                                            setEndDay(v);
                                            clearFieldError('endDay');
                                        }}
                                        placeholder="YYYY-MM-DD"
                                        placeholderTextColor={colors.text.tertiary}
                                    />
                                </View>
                                <View
                                    style={[
                                        styles.inputBox,
                                        {
                                            backgroundColor: colors.background.primary,
                                            borderColor: fieldErrors.endTime ? colors.accent.red : colors.border.default,
                                            marginLeft: 10,
                                        },
                                    ]}
                                >
                                    <Ionicons name="time-outline" size={18} color={colors.text.tertiary} />
                                    <TextInput
                                        style={[styles.textInput, { color: colors.text.primary }]}
                                        value={endTime}
                                        onChangeText={(v) => {
                                            setEndTime(v);
                                            clearFieldError('endTime');
                                        }}
                                        placeholder="HH:MM"
                                        placeholderTextColor={colors.text.tertiary}
                                    />
                                </View>
                            </View>
                            {fieldErrors.endDay ? (
                                <Text accessibilityRole="alert" style={{ color: colors.accent.red, marginTop: 4, fontSize: 12 }}>
                                    {fieldErrors.endDay}
                                </Text>
                            ) : null}
                            {fieldErrors.endTime ? (
                                <Text accessibilityRole="alert" style={{ color: colors.accent.red, marginTop: 4, fontSize: 12 }}>
                                    {fieldErrors.endTime}
                                </Text>
                            ) : null}

                            {/* Quality */}
                            <Text style={[styles.fieldLabel, typography.caption, { color: colors.text.secondary, marginTop: 16 }]}>
                                SLEEP QUALITY: <Text style={{ color: qualityColor(quality, colors), fontWeight: '700' }}>{quality}/10</Text> {qualityLabel(quality)}
                            </Text>
                            <View style={[styles.qualityRow, { borderColor: withAlpha(colors.text.primary, 0.05), backgroundColor: withAlpha(colors.text.primary, 0.02) }]}>
                                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                                    <TouchableOpacity
                                        key={num}
                                        activeOpacity={0.85}
                                        accessibilityRole="button"
                                        accessibilityLabel={`Sleep quality ${num} out of 10`}
                                        accessibilityState={{ selected: quality === num }}
                                        style={[
                                            styles.qualityBtn,
                                            { backgroundColor: quality >= num ? qualityColor(quality, colors) : colors.background.primary },
                                        ]}
                                        onPress={() => {
                                            setQuality(num);
                                            clearFieldError('quality');
                                        }}
                                    />
                                ))}
                            </View>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                                <Text style={[typography.caption, { color: colors.text.secondary, fontSize: 10 }]}>Poor</Text>
                                <Text style={[typography.caption, { color: colors.text.secondary, fontSize: 10 }]}>Deep</Text>
                            </View>
                            {fieldErrors.quality ? (
                                <Text accessibilityRole="alert" style={{ color: colors.accent.red, marginTop: 4, fontSize: 12 }}>
                                    {fieldErrors.quality}
                                </Text>
                            ) : null}

                            {/* Disturbances */}
                            <Text style={[styles.fieldLabel, typography.caption, { color: colors.text.secondary, marginTop: 16 }]}>NIGHT WAKE-UPS</Text>
                            <View style={styles.disturbanceRow}>
                                <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Decrease"
                                    style={[styles.stepperBtn, { backgroundColor: colors.background.primary, borderColor: colors.border.default }]}
                                    onPress={() => {
                                        setDisturbances(Math.max(0, disturbances - 1));
                                        clearFieldError('disturbances');
                                    }}
                                >
                                    <Ionicons name="remove" size={20} color={colors.accent.coral} />
                                </TouchableOpacity>
                                <View style={[styles.disturbanceDisplay, { backgroundColor: colors.background.primary, borderColor: colors.border.default }]}>
                                    <Ionicons name="alert-circle-outline" size={16} color={disturbances > 0 ? colors.accent.amber : colors.text.tertiary} />
                                    <Text style={[typography.statTiny, { color: disturbances > 0 ? colors.accent.amber : colors.text.secondary, fontSize: 18, marginLeft: 6 }]}>
                                        {disturbances}
                                    </Text>
                                </View>
                                <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Add"
                                    style={[styles.stepperBtn, { backgroundColor: colors.background.primary, borderColor: colors.border.default }]}
                                    onPress={() => {
                                        setDisturbances(disturbances + 1);
                                        clearFieldError('disturbances');
                                    }}
                                >
                                    <Ionicons name="add" size={20} color={colors.accent.cyan} />
                                </TouchableOpacity>
                            </View>
                            {fieldErrors.disturbances ? (
                                <Text accessibilityRole="alert" style={{ color: colors.accent.red, marginTop: 4, fontSize: 12 }}>
                                    {fieldErrors.disturbances}
                                </Text>
                            ) : null}

                            {/* Notes */}
                            <Text style={[styles.fieldLabel, typography.caption, { color: colors.text.secondary, marginTop: 16 }]}>RECOVERY NOTES</Text>
                            <TextInput
                                style={[styles.notesInput, {
                                    backgroundColor: colors.background.primary,
                                    borderColor: fieldErrors.notes ? colors.accent.red : colors.border.default,
                                    color: colors.text.primary,
                                }]}
                                value={notes}
                                onChangeText={(v) => {
                                    setNotes(v);
                                    clearFieldError('notes');
                                }}
                                placeholder="e.g. Woke up to bright light, felt groggy, used blackout curtains"
                                placeholderTextColor={colors.text.tertiary}
                                multiline
                                textAlignVertical="top"
                            />
                            {fieldErrors.notes ? (
                                <Text accessibilityRole="alert" style={{ color: colors.accent.red, marginTop: 4, fontSize: 12 }}>
                                    {fieldErrors.notes}
                                </Text>
                            ) : null}

                            {/* Save button */}
                            <Button
                                title="Save Recovery Data"
                                onPress={handleSave}
                                variant="primary"
                                loading={mutation.isPending}
                                disabled={hasErrors}
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
                        <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Refresh" onPress={() => refetch()}>
                            <Ionicons name="refresh-outline" size={18} color={colors.text.tertiary} />
                        </TouchableOpacity>
                    </View>

                    {sessionsLoading ? (
                        Array.from({ length: 3 }).map((_, i) => (
                            <Card key={`sleep-skeleton-${i}`} variant="glass" noPadding style={styles.sessionCard}>
                                <View style={styles.sessionHeader}>
                                    <Skeleton width="45%" height={14} />
                                    <Skeleton width={72} height={22} radius={20} />
                                </View>
                                <View style={[styles.timeRow, { borderTopColor: withAlpha(colors.border.default, 0.5) }]}>
                                    <Skeleton width={48} height={28} />
                                    <Skeleton width={48} height={28} />
                                    <Skeleton width={48} height={28} />
                                </View>
                            </Card>
                        ))
                    ) : sessionsError ? (
                        <EmptyState
                            icon="cloud-offline-outline"
                            title="Couldn't load sleep data"
                            subtitle="Check your connection and try again."
                            actionLabel="Retry"
                            onAction={() => refetch()}
                        />
                    ) : sessions.length === 0 ? (
                        <EmptyState
                            icon="moon-outline"
                            title="No sleep data yet"
                            subtitle="Log your first sleep to start tracking recovery."
                            actionLabel="Log New Sleep"
                            onAction={() => setShowForm(true)}
                        />
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
        fontFamily: themeTypography.body.fontFamily,
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
        fontFamily: themeTypography.body.fontFamily,
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
});
