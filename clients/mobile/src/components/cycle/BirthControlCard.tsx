import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Switch, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '@/theme';
import { useCycleAccents } from '@/theme/useCycleAccents';
import { GlassCard, DateTimeField } from '@/components/ui';
import { withAlpha } from '@/theme/utils';
import {
    updateCycleHealth,
    logPill,
    getPillLogs,
    type CycleHealthBody,
    type BirthControlMethod,
    type PillStatus,
    type PillLogEntry,
} from '@/api/cycle';
import { scheduleDailyPillReminder, cancelDailyPillReminder } from '@/features/coach/reminders';

/**
 * BirthControlCard — birth-control method + pill tracking (Period P2).
 *
 * A method picker (the 7 supported methods) that PATCHes
 * /v1/users/me/cycle/health { birthControlMethod } on tap. When the method is
 * PILL, an expanded block appears:
 *   • "Take today's pill" → logPill({ status:'TAKEN' }) with Skipped / Late too.
 *   • a small adherence readout — "N/7 taken this week" from getPillLogs(7).
 *   • a reminder row — a Switch + a time DateTimeField that BOTH persists
 *     (updateCycleHealth { pillReminderEnabled, pillReminderTime }) AND schedules a
 *     DAILY LOCAL notification at that time via the expo-notifications helper in
 *     features/coach/reminders (scheduleDailyPillReminder; cancelled on disable and
 *     rescheduled on a time change).
 *
 * Reads its INITIAL state from the profile row the screen already fetched
 * (birthControlMethod / pillReminderEnabled / pillReminderTime), passed as props,
 * so it owns no profile query; it self-fetches only the small pill-log window.
 *
 * Coral accent to sit with the other cycle logging cards. Wellness framing — the
 * screen's MedicalDisclaimer already notes this is not a contraceptive method.
 */

// The 7 methods, in the order they render. 'NONE' is the explicit "none" choice
// (distinct from an unset null) so a user can actively say "no method".
const METHODS: Array<{ v: BirthControlMethod; label: string; icon: string }> = [
    { v: 'PILL', label: 'Pill', icon: 'medical-outline' },
    { v: 'PATCH', label: 'Patch', icon: 'bandage-outline' },
    { v: 'RING', label: 'Ring', icon: 'ellipse-outline' },
    { v: 'INJECTION', label: 'Injection', icon: 'fitness-outline' },
    { v: 'IUD', label: 'IUD', icon: 'git-commit-outline' },
    { v: 'IMPLANT', label: 'Implant', icon: 'hardware-chip-outline' },
    { v: 'NONE', label: 'None', icon: 'close-circle-outline' },
];

// Default reminder time when the user flips the toggle on with nothing stored yet.
const DEFAULT_REMINDER_TIME = '09:00';

const todayKey = () => new Date().toISOString().slice(0, 10);

/** Parse an 'HH:MM' string → { hour, minute } for the scheduler, or null if bad. */
function parseHHMM(value: string | null | undefined): { hour: number; minute: number } | null {
    if (!value) return null;
    const m = /^(\d{2}):(\d{2})$/.exec(value);
    if (!m) return null;
    const hour = Number(m[1]);
    const minute = Number(m[2]);
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
    return { hour, minute };
}

export interface BirthControlCardProps {
    /** Persisted method from GET /v1/users/me (null/undefined = unset). */
    birthControlMethod?: BirthControlMethod | null;
    /** Persisted reminder enabled flag. */
    pillReminderEnabled?: boolean;
    /** Persisted reminder time 'HH:MM' (may be null). */
    pillReminderTime?: string | null;
}

export function BirthControlCard({
    birthControlMethod,
    pillReminderEnabled,
    pillReminderTime,
}: BirthControlCardProps) {
    const { colors, typography, borderRadius } = useTheme();
    const { coral: CORAL } = useCycleAccents();
    const queryClient = useQueryClient();

    const method = birthControlMethod ?? null;
    const isPill = method === 'PILL';

    // ── Reminder local state (seeded from the persisted profile values) ──────────
    const [reminderOn, setReminderOn] = useState<boolean>(pillReminderEnabled === true);
    const [reminderTime, setReminderTime] = useState<string>(pillReminderTime ?? DEFAULT_REMINDER_TIME);

    // Keep local reminder state in sync when the persisted values change under us
    // (e.g. a background profile refetch after another surface writes them).
    useEffect(() => {
        setReminderOn(pillReminderEnabled === true);
    }, [pillReminderEnabled]);
    useEffect(() => {
        if (pillReminderTime) setReminderTime(pillReminderTime);
    }, [pillReminderTime]);

    // ── Pill-log window (only fetched while the method is PILL) ───────────────────
    const pillsQuery = useQuery({
        queryKey: ['cycle-pills', 7],
        queryFn: () => getPillLogs(7),
        enabled: isPill,
    });

    // Today's stored pill row (if any) → highlights the active status button.
    const todaysPill: PillLogEntry | undefined = useMemo(
        () => pillsQuery.data?.pills.find((p) => (p.date ?? '').slice(0, 10) === todayKey()),
        [pillsQuery.data],
    );

    // Adherence = TAKEN (or LATE — still taken) days in the trailing 7-day window.
    const takenThisWeek = useMemo(() => {
        const pills = pillsQuery.data?.pills ?? [];
        return pills.filter((p) => p.status === 'TAKEN' || p.status === 'LATE').length;
    }, [pillsQuery.data]);

    // ── Mutations ────────────────────────────────────────────────────────────────
    const health = useMutation({
        mutationFn: (body: CycleHealthBody) => updateCycleHealth(body),
        onError: (err: any) => {
            Alert.alert('Error', err?.response?.data?.message ?? err?.message ?? 'Could not update settings');
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['my-profile'] });
        },
    });

    const pill = useMutation({
        mutationFn: (status: PillStatus) => logPill({ status }),
        onError: (err: any) => {
            Alert.alert('Error', err?.response?.data?.message ?? err?.message ?? 'Could not log pill');
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['cycle-pills', 7] });
        },
    });

    const pickMethod = (v: BirthControlMethod) => {
        // Tapping the active method again clears it back to unset (null).
        health.mutate({ birthControlMethod: method === v ? null : v });
    };

    /**
     * Toggle the daily pill reminder. Flipping ON persists { enabled:true, time }
     * AND schedules the daily local notification; flipping OFF persists
     * { enabled:false } AND cancels the scheduled notification. Scheduling is
     * best-effort (no-ops on Expo Go / denied permission) and never blocks the
     * persisted preference.
     */
    const onToggleReminder = async (next: boolean) => {
        setReminderOn(next); // optimistic — reflect the switch immediately
        if (next) {
            const t = reminderTime || DEFAULT_REMINDER_TIME;
            setReminderTime(t);
            health.mutate({ pillReminderEnabled: true, pillReminderTime: t });
            const parsed = parseHHMM(t);
            if (parsed) await scheduleDailyPillReminder(parsed.hour, parsed.minute);
        } else {
            health.mutate({ pillReminderEnabled: false });
            await cancelDailyPillReminder();
        }
    };

    /**
     * A new reminder time. Persist it, and — while the reminder is ON — reschedule
     * (the helper cancels the previous one first, so times never stack).
     */
    const onChangeReminderTime = async (t: string) => {
        setReminderTime(t);
        if (reminderOn) {
            health.mutate({ pillReminderEnabled: true, pillReminderTime: t });
            const parsed = parseHHMM(t);
            if (parsed) await scheduleDailyPillReminder(parsed.hour, parsed.minute);
        } else {
            // Store the preference even when off, so turning it on later reuses it.
            health.mutate({ pillReminderTime: t });
        }
    };

    return (
        <GlassCard radius={borderRadius['2xl']} style={styles.card}>
            <View style={styles.inner}>
                <View style={styles.header}>
                    <Ionicons name="shield-checkmark-outline" size={18} color={CORAL} />
                    <Text style={[typography.overline, styles.headerLabel, { color: colors.text.secondary }]}>
                        BIRTH CONTROL
                    </Text>
                </View>

                <Text style={[typography.caption, styles.subLabel, { color: colors.text.tertiary }]}>
                    Track your method — tap to select. This is not a contraceptive itself.
                </Text>

                {/* ── Method picker (single-select; tap active to clear) ──────────── */}
                <View style={styles.methods}>
                    {METHODS.map((mth) => {
                        const active = method === mth.v;
                        return (
                            <Pressable
                                key={mth.v}
                                onPress={() => pickMethod(mth.v)}
                                disabled={health.isPending}
                                accessibilityRole="button"
                                accessibilityState={{ selected: active }}
                                accessibilityLabel={`Birth control method: ${mth.label}`}
                                style={[
                                    styles.methodChip,
                                    {
                                        backgroundColor: active ? withAlpha(CORAL, 0.18) : 'transparent',
                                        borderColor: active ? CORAL : colors.border.light,
                                    },
                                ]}
                            >
                                <Ionicons
                                    name={mth.icon as any}
                                    size={15}
                                    color={active ? CORAL : colors.text.tertiary}
                                    style={styles.methodIcon}
                                />
                                <Text
                                    style={[
                                        typography.caption,
                                        { color: active ? colors.text.primary : colors.text.secondary },
                                    ]}
                                >
                                    {mth.label}
                                </Text>
                            </Pressable>
                        );
                    })}
                </View>

                {/* ── PILL block: log today + adherence + reminder ────────────────── */}
                {isPill ? (
                    <View style={styles.pillBlock}>
                        {/* Adherence readout (trailing 7 days). */}
                        <View style={styles.adherenceRow}>
                            <Ionicons name="checkmark-done-outline" size={15} color={CORAL} />
                            <Text style={[typography.bodySm, styles.adherenceText, { color: colors.text.secondary }]}>
                                {pillsQuery.isLoading
                                    ? 'Loading this week…'
                                    : `${takenThisWeek}/7 taken this week`}
                            </Text>
                        </View>

                        {/* Take today's pill — TAKEN / LATE / SKIPPED. The stored
                            status for today is highlighted. */}
                        <Text style={[typography.bodySm, styles.blockLabel, { color: colors.text.secondary }]}>
                            Today's pill
                        </Text>
                        <View style={styles.statusRow}>
                            {(['TAKEN', 'LATE', 'SKIPPED'] as PillStatus[]).map((st) => {
                                const active = todaysPill?.status === st;
                                const label = st === 'TAKEN' ? 'Taken' : st === 'LATE' ? 'Late' : 'Skipped';
                                const icon =
                                    st === 'TAKEN' ? 'checkmark-circle' : st === 'LATE' ? 'time-outline' : 'close-circle-outline';
                                return (
                                    <Pressable
                                        key={st}
                                        onPress={() => pill.mutate(st)}
                                        disabled={pill.isPending}
                                        accessibilityRole="button"
                                        accessibilityState={{ selected: active }}
                                        accessibilityLabel={`Mark today's pill ${label}`}
                                        style={[
                                            styles.statusChip,
                                            {
                                                backgroundColor: active ? withAlpha(CORAL, 0.2) : 'transparent',
                                                borderColor: active ? CORAL : colors.border.light,
                                            },
                                        ]}
                                    >
                                        <Ionicons
                                            name={icon as any}
                                            size={16}
                                            color={active ? CORAL : colors.text.tertiary}
                                            style={styles.methodIcon}
                                        />
                                        <Text
                                            style={[
                                                typography.bodySm,
                                                { color: active ? colors.text.primary : colors.text.secondary },
                                            ]}
                                        >
                                            {label}
                                        </Text>
                                    </Pressable>
                                );
                            })}
                        </View>

                        {/* Reminder row — persist + schedule a DAILY local notification. */}
                        <View style={styles.reminderHeaderRow}>
                            <View style={styles.reminderTextWrap}>
                                <Text style={[typography.bodySm, { color: colors.text.primary }]}>Daily reminder</Text>
                                <Text style={[typography.caption, { color: colors.text.tertiary }]}>
                                    A gentle nudge at the same time each day.
                                </Text>
                            </View>
                            <Switch
                                value={reminderOn}
                                onValueChange={onToggleReminder}
                                trackColor={{ false: colors.border.light, true: withAlpha(CORAL, 0.5) }}
                                thumbColor={reminderOn ? CORAL : undefined}
                                accessibilityLabel="Daily pill reminder"
                            />
                        </View>

                        {reminderOn ? (
                            <View style={styles.reminderTimeField}>
                                <Text style={[typography.caption, styles.fieldLabel, { color: colors.text.secondary }]}>
                                    Reminder time
                                </Text>
                                <DateTimeField
                                    mode="time"
                                    value={reminderTime}
                                    onChange={onChangeReminderTime}
                                    accessibilityLabel="Pill reminder time"
                                />
                                <Text style={[typography.caption, { color: colors.text.tertiary, marginTop: 6 }]}>
                                    Reminders need notifications enabled and a full app build (not Expo Go).
                                </Text>
                            </View>
                        ) : null}
                    </View>
                ) : null}
            </View>
        </GlassCard>
    );
}

const styles = StyleSheet.create({
    card: { marginTop: 12 },
    inner: { padding: 18 },
    header: { flexDirection: 'row', alignItems: 'center' },
    headerLabel: { marginLeft: 8, letterSpacing: 1 },
    subLabel: { marginTop: 8 },
    // Method picker chips.
    methods: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
    methodChip: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 8,
    },
    methodIcon: { marginRight: 6 },
    // PILL block sits under a slim divider so it reads as a distinct sub-surface.
    pillBlock: {
        marginTop: 16,
        paddingTop: 16,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: 'rgba(255,255,255,0.06)',
    },
    adherenceRow: { flexDirection: 'row', alignItems: 'center' },
    adherenceText: { marginLeft: 7 },
    blockLabel: { marginTop: 16, marginBottom: 8 },
    statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    statusChip: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 9,
    },
    reminderHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 18,
    },
    reminderTextWrap: { flex: 1, marginRight: 12 },
    reminderTimeField: { marginTop: 12 },
    fieldLabel: { marginBottom: 6, letterSpacing: 0.5 },
});

export default BirthControlCard;
