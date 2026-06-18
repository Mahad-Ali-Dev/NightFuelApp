import React, { useMemo, useState } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    Dimensions, Modal, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getHistory } from '@/api/progress';
import { getScheduledSessions, createScheduledSession } from '@/api/training';
import * as shiftsApi from '@/api/shifts';
import { Card } from '@/components/ui/Card';
import { Button, EmptyState, DateTimeField } from '@/components/ui';
import { withAlpha } from '@/theme/utils';

// Title / notes bounds mirror the backend Zod contract
// (services/shift-service/src/training.routes.ts createScheduledSessionSchema):
// title 1-200, notes ≤2000. Enforced client-side via maxLength so an
// over-length value can never reach the network.
const TITLE_MAX = 200;
const NOTES_MAX = 2000;

// Default time-of-day appended to the chosen 'YYYY-MM-DD' to build a full ISO
// scheduledAt. 09:00 local is a sensible "morning" default for a session the
// user only picks a date for; assembled via `new Date('<date>T09:00:00')` so
// the instant is the user's LOCAL 9am (toISOString then normalises to UTC).
const DEFAULT_TIME_OF_DAY = '09:00:00';

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

/**
 * Human-readable label for a scheduled session's `scheduledAt` ISO timestamp,
 * rendered in the device's LOCAL timezone (e.g. "Sat, Jun 20 · 6:00 PM"). Falls
 * back to the raw string if the value is unparseable so the row never renders
 * "Invalid Date".
 */
const formatSessionWhen = (iso: string): string => {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const date = d.toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
    });
    const time = d.toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
    });
    return `${date} · ${time}`;
};

/**
 * Assemble a full ISO-8601 datetime from a `YYYY-MM-DD` date and a default
 * morning time-of-day. `new Date('<date>T09:00:00')` is parsed in the device's
 * LOCAL timezone; `.toISOString()` then yields the UTC instant the backend's
 * `z.string().datetime()` expects. Returns null for an empty/unparseable date
 * so the caller can keep Save disabled rather than POST "Invalid Date".
 */
const buildScheduledAtISO = (date: string): string | null => {
    if (!date) return null;
    const d = new Date(`${date}T${DEFAULT_TIME_OF_DAY}`);
    return isNaN(d.getTime()) ? null : d.toISOString();
};

/**
 * Human label for a shift in the "Link to a shift" picker, e.g.
 * "FIXED_NIGHT · Jun 20, 7:00 PM". Falls back to the raw startTime when it is
 * unparseable so an option never renders "Invalid Date".
 */
const formatShiftOption = (type: string, startTime: string): string => {
    const d = new Date(startTime);
    const when = isNaN(d.getTime())
        ? startTime
        : d.toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
        });
    return `${type} · ${when}`;
};

export default function TrainingCalendarScreen() {
    const { colors, typography, spacing } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const queryClient = useQueryClient();

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

    // Scheduled (upcoming) training sessions for the list below the grid. The
    // backend returns [] while the user-gated scheduled_sessions migration is
    // un-run, so an empty array is a normal honest-empty state, not an error.
    const sessionsQuery = useQuery({
        queryKey: ['scheduled-sessions'],
        queryFn: getScheduledSessions,
    });

    const sessions = sessionsQuery.data ?? [];

    // ── Create-session form ──────────────────────────────────────────────────
    // Inline glass form opened by the header "+". Kept in-screen (a Modal over
    // this screen) so the calendar context stays visible behind it.
    const [formOpen, setFormOpen] = useState(false);
    const [title, setTitle] = useState('');
    const [date, setDate] = useState(''); // 'YYYY-MM-DD' from DateTimeField
    const [notes, setNotes] = useState('');
    const [shiftId, setShiftId] = useState<string | null>(null); // null = "None"
    // Honest inline submit error. Distinguishes a 503 (scheduling not yet
    // available — the user-gated migration is un-run) from a generic
    // network/other failure. Never thrown; surfaced as copy in the form.
    const [submitError, setSubmitError] = useState<string | null>(null);

    // Shifts for the optional link picker. Only fetched while the form is open
    // so we don't pay for the request on every calendar view. An error here is
    // non-fatal: the picker simply shows "None" and the session can still be
    // saved unlinked.
    const shiftsQuery = useQuery({
        queryKey: ['shifts'],
        queryFn: shiftsApi.list,
        enabled: formOpen,
    });
    const shiftOptions = shiftsQuery.data ?? [];

    const resetForm = () => {
        setTitle('');
        setDate('');
        setNotes('');
        setShiftId(null);
        setSubmitError(null);
    };

    const closeForm = () => {
        setFormOpen(false);
        resetForm();
    };

    const createMutation = useMutation({
        mutationFn: createScheduledSession,
        onSuccess: () => {
            // Refresh the "Scheduled Sessions" list, then close + reset.
            queryClient.invalidateQueries({ queryKey: ['scheduled-sessions'] });
            closeForm();
        },
        onError: (err: any) => {
            // Honest, classified copy. A 503 means the backend table isn't
            // migrated yet (user-gated); everything else is treated as a
            // connection/transient fault. The error is caught here and turned
            // into inline state — it never escapes as an unhandled throw/redbox.
            if (err?.response?.status === 503) {
                setSubmitError("Scheduling isn't available yet. Please try again later.");
            } else {
                setSubmitError("Couldn't save — check your connection and try again.");
            }
        },
    });

    // Save is allowed only with a non-empty, in-bounds title AND a chosen date,
    // and never while a save is already in flight.
    const trimmedTitle = title.trim();
    const canSave =
        trimmedTitle.length >= 1 &&
        trimmedTitle.length <= TITLE_MAX &&
        date.length > 0 &&
        !createMutation.isPending;

    const handleSave = () => {
        const scheduledAt = buildScheduledAtISO(date);
        if (trimmedTitle.length < 1 || !scheduledAt) return;
        setSubmitError(null);
        // Build the payload with shiftId ONLY when a shift is selected — omit
        // the key for "None" to preserve the strictly-optional backend contract.
        const payload = {
            title: trimmedTitle,
            scheduledAt,
            ...(notes.trim() ? { notes: notes.trim() } : {}),
            ...(shiftId ? { shiftId } : {}),
        };
        createMutation.mutate(payload);
    };

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
            <StatusBar style="light" />
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.border.default }]}>
                <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Go back" activeOpacity={0.85} onPress={() => router.back()} style={[styles.headerBtn, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
                    <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
                </TouchableOpacity>
                <Text style={[typography.h3, { color: colors.text.primary }]}>Training Calendar</Text>
                {/* Real add action: opens the create-scheduled-session form. The
                    POST /v1/training/scheduled-sessions endpoint exists, so this
                    is no longer a no-op spacer. */}
                <TouchableOpacity
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    accessibilityRole="button"
                    accessibilityLabel="Add scheduled session"
                    activeOpacity={0.85}
                    onPress={() => { resetForm(); setFormOpen(true); }}
                    style={[styles.headerBtn, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}
                >
                    <Ionicons name="add" size={24} color={colors.text.primary} />
                </TouchableOpacity>
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

                {/* Upcoming sessions — real data from shift-service /v1/training.
                    Renders the user's scheduled sessions when present; an honest
                    zero-data EmptyState when the list is empty (the backend also
                    returns [] while the scheduled_sessions migration is un-run);
                    and a connection-error EmptyState (mirroring the activity grid)
                    on failure. */}
                <View style={{ paddingHorizontal: spacing.xl, marginTop: spacing['2xl'] }}>
                    <Text style={[typography.h3, { color: colors.text.primary, marginBottom: spacing.md }]}>Scheduled Sessions</Text>
                    {sessionsQuery.isError ? (
                        <EmptyState
                            icon="cloud-offline-outline"
                            title="Couldn't load sessions"
                            subtitle="We couldn't reach your scheduled sessions. Check your connection and try again."
                            actionLabel="Retry"
                            onAction={() => sessionsQuery.refetch()}
                        />
                    ) : sessions.length > 0 ? (
                        <View style={{ gap: spacing.md }}>
                            {sessions.map(session => (
                                <Card key={session.id} variant="glass" padding="lg">
                                    <View style={styles.sessionRow}>
                                        <View style={[styles.sessionIcon, { backgroundColor: withAlpha(colors.accent.coral, 0.14), borderColor: withAlpha(colors.accent.coral, 0.28) }]}>
                                            <Ionicons name="barbell-outline" size={20} color={colors.accent.coral} />
                                        </View>
                                        <View style={styles.sessionInfo}>
                                            <Text style={[typography.body, { color: colors.text.primary, fontWeight: '700' }]} numberOfLines={1}>
                                                {session.title}
                                            </Text>
                                            <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 2 }]}>
                                                {formatSessionWhen(session.scheduledAt)}
                                            </Text>
                                            {session.notes ? (
                                                <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 4 }]} numberOfLines={2}>
                                                    {session.notes}
                                                </Text>
                                            ) : null}
                                        </View>
                                    </View>
                                </Card>
                            ))}
                        </View>
                    ) : (
                        <EmptyState
                            icon="calendar-outline"
                            title="No sessions scheduled"
                            subtitle="Upcoming training sessions will appear here once scheduling is available."
                        />
                    )}
                </View>
            </ScrollView>

            {/* ── Create-scheduled-session form ──────────────────────────────
                A glass modal over the calendar. Save is gated on a non-empty,
                in-bounds title AND a chosen date, and shows a saving state
                while the POST is in flight. Errors are surfaced inline (never
                a redbox): a 503 means scheduling isn't migrated yet, anything
                else reads as a connection problem. */}
            <Modal
                visible={formOpen}
                transparent
                animationType="slide"
                onRequestClose={closeForm}
            >
                <View style={[styles.modalOverlay, { backgroundColor: withAlpha(colors.background.primary, 0.85) }]}>
                    <KeyboardAvoidingView
                        style={styles.modalKeyboard}
                        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    >
                        <Card variant="glass" padding="xl" style={styles.formCard}>
                            <View style={styles.formHeader}>
                                <Text style={[typography.h3, { color: colors.text.primary }]}>New Session</Text>
                                <TouchableOpacity
                                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                    accessibilityRole="button"
                                    accessibilityLabel="Close"
                                    activeOpacity={0.85}
                                    onPress={closeForm}
                                >
                                    <Ionicons name="close" size={26} color={colors.text.secondary} />
                                </TouchableOpacity>
                            </View>

                            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: spacing.md }}>
                                {/* Title */}
                                <Text style={[typography.caption, styles.fieldLabel, { color: colors.text.secondary }]}>Title</Text>
                                <View style={[styles.inputBox, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
                                    <Ionicons name="barbell-outline" size={20} color={colors.text.secondary} />
                                    <TextInput
                                        accessibilityLabel="Session title"
                                        style={[styles.textInput, { color: colors.text.primary }]}
                                        value={title}
                                        onChangeText={setTitle}
                                        placeholder="e.g. Push Day"
                                        placeholderTextColor={colors.text.tertiary}
                                        maxLength={TITLE_MAX}
                                        returnKeyType="done"
                                    />
                                </View>

                                {/* Date */}
                                <Text style={[typography.caption, styles.fieldLabel, { color: colors.text.secondary, marginTop: spacing.lg }]}>Date</Text>
                                <DateTimeField
                                    mode="date"
                                    value={date}
                                    onChange={setDate}
                                    accessibilityLabel="Session date"
                                    minimumDate={new Date()}
                                />

                                {/* Notes (optional) */}
                                <Text style={[typography.caption, styles.fieldLabel, { color: colors.text.secondary, marginTop: spacing.lg }]}>Notes (optional)</Text>
                                <View style={[styles.inputBox, styles.notesBox, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
                                    <TextInput
                                        accessibilityLabel="Session notes"
                                        style={[styles.textInput, styles.notesInput, { color: colors.text.primary, marginLeft: 0 }]}
                                        value={notes}
                                        onChangeText={setNotes}
                                        placeholder="Anything to remember for this session"
                                        placeholderTextColor={colors.text.tertiary}
                                        maxLength={NOTES_MAX}
                                        multiline
                                    />
                                </View>

                                {/* Optional shift link */}
                                <Text style={[typography.caption, styles.fieldLabel, { color: colors.text.secondary, marginTop: spacing.lg }]}>Link to a shift (optional)</Text>
                                <View style={styles.shiftChips}>
                                    {/* "None" is always present and is the default. */}
                                    <TouchableOpacity
                                        accessibilityRole="button"
                                        accessibilityLabel="No linked shift"
                                        accessibilityState={{ selected: shiftId === null }}
                                        activeOpacity={0.85}
                                        onPress={() => setShiftId(null)}
                                        style={[
                                            styles.shiftChip,
                                            {
                                                backgroundColor: shiftId === null ? withAlpha(colors.accent.coral, 0.2) : colors.background.secondary,
                                                borderColor: shiftId === null ? colors.accent.coral : colors.border.default,
                                            },
                                        ]}
                                    >
                                        <Text style={[typography.caption, { color: shiftId === null ? colors.accent.coral : colors.text.secondary, fontWeight: shiftId === null ? '700' : '500' }]}>None</Text>
                                    </TouchableOpacity>
                                    {shiftOptions.map(shift => {
                                        const selected = shiftId === shift.id;
                                        const label = formatShiftOption(shift.type, shift.startTime);
                                        return (
                                            <TouchableOpacity
                                                key={shift.id}
                                                accessibilityRole="button"
                                                accessibilityLabel={`Link shift ${label}`}
                                                accessibilityState={{ selected }}
                                                activeOpacity={0.85}
                                                onPress={() => setShiftId(shift.id)}
                                                style={[
                                                    styles.shiftChip,
                                                    {
                                                        backgroundColor: selected ? withAlpha(colors.accent.coral, 0.2) : colors.background.secondary,
                                                        borderColor: selected ? colors.accent.coral : colors.border.default,
                                                    },
                                                ]}
                                            >
                                                <Text style={[typography.caption, { color: selected ? colors.accent.coral : colors.text.secondary, fontWeight: selected ? '700' : '500' }]} numberOfLines={1}>{label}</Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>

                                {submitError ? (
                                    <Text accessibilityRole="alert" style={[typography.caption, { color: colors.accent.red, marginTop: spacing.lg }]}>
                                        {submitError}
                                    </Text>
                                ) : null}

                                <Button
                                    title="Save"
                                    onPress={handleSave}
                                    variant="primary"
                                    loading={createMutation.isPending}
                                    disabled={!canSave}
                                    style={{ marginTop: spacing.xl }}
                                    accessibilityRole="button"
                                    accessibilityLabel={createMutation.isPending ? 'Saving session' : 'Save session'}
                                    accessibilityState={{ disabled: !canSave, busy: createMutation.isPending }}
                                />
                            </ScrollView>
                        </Card>
                    </KeyboardAvoidingView>
                </View>
            </Modal>
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
    sessionRow: { flexDirection: 'row', alignItems: 'center' },
    sessionIcon: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
    sessionInfo: { flex: 1 },
    modalOverlay: { flex: 1, justifyContent: 'flex-end' },
    modalKeyboard: { width: '100%' },
    formCard: { borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '88%' },
    formHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
    fieldLabel: { marginBottom: 8, fontWeight: '700' },
    inputBox: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, height: 52 },
    textInput: { flex: 1, marginLeft: 8, fontSize: 16, paddingVertical: 10 },
    notesBox: { height: 96, alignItems: 'flex-start', paddingVertical: 8 },
    notesInput: { height: '100%', textAlignVertical: 'top' },
    shiftChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    shiftChip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, borderWidth: 1, maxWidth: '100%' },
});
