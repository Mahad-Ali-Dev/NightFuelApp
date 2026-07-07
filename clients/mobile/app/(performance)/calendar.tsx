import React, { useMemo, useState } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    Dimensions, Modal, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { getHistory } from '@/api/progress';
import { getScheduledSessions, createScheduledSession } from '@/api/training';
import * as shiftsApi from '@/api/shifts';
import { Card } from '@/components/ui/Card';
import { Button, EmptyState, DateTimeField } from '@/components/ui';
import { Skeleton } from '@/components/ui/Skeleton';
import { PressableScale } from '@/components/ui/PressableScale';
import { CountUpText } from '@/components/CountUpText';
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

// Heatmap cell geometry — a calendar grid that reads as a VISUAL intensity map
// rather than a text date list. Seven columns inside the glass card (xl padding
// = 20 each side, plus the card's own screen gutter), squared so the grid
// breathes on an 8pt rhythm.
const GRID_H_PAD = 20; // Card padding="xl"
const CELL_SIZE = Math.floor((width - 40 - GRID_H_PAD * 2) / 7);

// Four ascending success-tinted steps (the brand's progress colour is cyan /
// success) so a glance reads density the way a heatmap should — empty days stay
// a faint hairline wash, busy days saturate toward full cyan. Lime is reserved
// for the single primary action + the "today" ring, never spent on data cells.
const HEAT_STEPS = [0.16, 0.34, 0.58, 1] as const;

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

/** Full, human label for a selected day, e.g. "Saturday, June 21". */
const formatDayLong = (year: number, month: number, day: number): string => {
    const d = new Date(year, month, day);
    if (isNaN(d.getTime())) return `${MONTH_NAMES[month]} ${day}`;
    return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
};

export default function TrainingCalendarScreen() {
    const { colors, typography, spacing, shadows } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const queryClient = useQueryClient();

    // Displayed month/year. Seeded to the current month so the calendar opens
    // on "today" rather than a hardcoded literal. `month` is 0-indexed.
    const [cursor, setCursor] = useState(() => {
        const now = new Date();
        return { year: now.getFullYear(), month: now.getMonth() };
    });

    // Currently-tapped calendar day (`YYYY-MM-DD`) whose activity detail is
    // revealed below the grid. Pure local UI state — owns no data, fetches
    // nothing; the detail is read from the already-loaded `history`. Cleared
    // when the month changes so a stale selection can't point off-grid.
    const [selectedDay, setSelectedDay] = useState<string | null>(null);

    const goToPrevMonth = () => {
        setSelectedDay(null);
        setCursor(({ year, month }) =>
            month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 },
        );
    };

    const goToNextMonth = () => {
        setSelectedDay(null);
        setCursor(({ year, month }) =>
            month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 },
        );
    };

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

    // Activity index for the displayed month, keyed by LOCAL `YYYY-MM-DD`.
    // Presence = "has activity" (identical semantics to the prior
    // `history.some(...)`); `score` (0-100) drives the heatmap intensity step so
    // a busier day reads darker/greener. Built once per history/cursor change.
    const activityByDay = useMemo(() => {
        const map = new Map<string, number>();
        history.forEach(h => {
            const key = h.date.slice(0, 10);
            const score = typeof h.score === 'number' && isFinite(h.score) ? h.score : 0;
            // Keep the strongest score if a day appears more than once.
            map.set(key, Math.max(map.get(key) ?? 0, score));
        });
        return map;
    }, [history]);

    // ── Momentum (peak-end) ──────────────────────────────────────────────────
    // Active days logged in the displayed month, and the current run of
    // consecutive active days ending today. Both are derived from `history`
    // only — no extra request. The streak is the celebratory "peak": a run the
    // user is encouraged to protect, surfaced with the one lime flame.
    const { activeDaysThisMonth, streakDays } = useMemo(() => {
        const monthPrefix = `${cursor.year}-${pad2(cursor.month + 1)}`;
        let active = 0;
        activityByDay.forEach((_score, key) => {
            if (key.startsWith(monthPrefix)) active += 1;
        });

        // Walk back day-by-day from today; stop at the first gap.
        const loggedDays = new Set(activityByDay.keys());
        let streak = 0;
        const probe = new Date();
        // Guard against an unbounded loop; history is fetched for ~30 days.
        for (let i = 0; i < 60; i++) {
            const key = toLocalISODate(probe.getFullYear(), probe.getMonth(), probe.getDate());
            if (loggedDays.has(key)) {
                streak += 1;
                probe.setDate(probe.getDate() - 1);
            } else {
                break;
            }
        }
        return { activeDaysThisMonth: active, streakDays: streak };
    }, [activityByDay, cursor.year, cursor.month]);

    // Detail rows for the tapped day (empty when the day has no logged activity).
    const selectedScore = selectedDay ? activityByDay.get(selectedDay) ?? null : null;

    // Whether the grid is in a "show real cells" state (drives the momentum
    // hero + thumb-zone CTA visibility, which only make sense alongside data).
    const hasGrid =
        !historyQuery.isError && !(history.length === 0 && !historyQuery.isLoading);

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

            <ScrollView contentContainerStyle={{ paddingBottom: 140 }} showsVerticalScrollIndicator={false}>
                {/* ── Momentum band (peak-end) ──────────────────────────────────
                    Two value-forward stats: active days this month and the live
                    streak. The VALUE dominates (big condensed count-up) over a
                    small muted overline. Gated on LOADED data so it never flashes
                    a fake "0 active / 0 streak" during the initial fetch. The
                    streak is the celebratory PEAK — sized larger than its neighbour
                    and, when a run is alive, lit with the one lime accent + a glow
                    halo and a line of encouraging copy. Closed by a human
                    affirmation line as the emotional ENDING. */}
                {hasGrid && !historyQuery.isLoading ? (
                    <Animated.View
                        entering={FadeInDown.duration(420).springify().damping(18)}
                        style={{ paddingHorizontal: spacing.xl, marginTop: spacing.xl }}
                    >
                        <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'stretch' }}>
                            {/* Active days this month — the supporting stat */}
                            <Card variant="glass" padding="lg" style={styles.momentumCard}>
                                <View style={[styles.momentumIcon, { backgroundColor: withAlpha(colors.success, 0.14), borderColor: withAlpha(colors.success, 0.26) }]}>
                                    <Ionicons name="checkmark-done" size={18} color={colors.success} />
                                </View>
                                <CountUpText
                                    value={activeDaysThisMonth}
                                    duration={650}
                                    style={[typography.statMedium, { color: colors.text.primary }]}
                                    accessibilityLabel={`${activeDaysThisMonth} active days this month`}
                                />
                                <Text style={[typography.overline, { color: colors.text.secondary }]}>ACTIVE DAYS</Text>
                            </Card>

                            {/* Current streak — the celebratory PEAK. Larger numeral,
                                a lime border + milestone glow (the glow lives on this
                                wrapper because the Card clips its own shadow with
                                overflow:hidden) and a line of encouraging copy when a
                                run is alive. */}
                            <View style={[styles.momentumCard, streakDays > 0 && shadows.glow(colors.accent.coral)]}>
                                <Card
                                    variant="glass"
                                    padding="lg"
                                    style={[
                                        styles.streakCard,
                                        streakDays > 0 && { borderColor: withAlpha(colors.accent.coral, 0.4) },
                                    ]}
                                >
                                    <View style={[styles.momentumIcon, {
                                        backgroundColor: streakDays > 0 ? withAlpha(colors.accent.coral, 0.16) : withAlpha(colors.text.secondary, 0.1),
                                        borderColor: streakDays > 0 ? withAlpha(colors.accent.coral, 0.32) : colors.border.default,
                                    }]}>
                                        <Ionicons name="flame" size={18} color={streakDays > 0 ? colors.accent.coral : colors.text.tertiary} />
                                    </View>
                                    <View style={styles.streakRow}>
                                        <CountUpText
                                            value={streakDays}
                                            duration={650}
                                            style={[typography.statLarge, { color: streakDays > 0 ? colors.accent.coral : colors.text.primary }]}
                                            accessibilityLabel={`${streakDays} day streak`}
                                        />
                                        <Text style={[typography.statTiny, { color: colors.text.tertiary, marginLeft: 4, marginBottom: 6 }]}>{streakDays === 1 ? 'day' : 'days'}</Text>
                                    </View>
                                    <Text style={[typography.overline, { color: colors.text.secondary }]}>DAY STREAK</Text>
                                    {streakDays > 0 ? (
                                        <Text style={[typography.caption, { color: withAlpha(colors.accent.coral, 0.9), marginTop: 6 }]} numberOfLines={1}>
                                            {streakDays} {streakDays === 1 ? 'day' : 'days'} strong — keep it alive
                                        </Text>
                                    ) : null}
                                </Card>
                            </View>
                        </View>

                        {/* Emotional ENDING — a short human affirmation that closes
                            the momentum band. Celebrates showing up when there's a
                            live streak, otherwise an honest, encouraging summary of
                            the month's logged work. */}
                        <Text style={[typography.bodySm, { color: colors.text.secondary, marginTop: spacing.md, textAlign: 'center' }]}>
                            {streakDays > 0
                                ? 'You showed up today — momentum is yours.'
                                : activeDaysThisMonth > 0
                                ? `${activeDaysThisMonth} ${activeDaysThisMonth === 1 ? 'session' : 'sessions'} logged this month — keep building.`
                                : 'Log a session to start your streak.'}
                        </Text>
                    </Animated.View>
                ) : null}

                {/* Calendar Grid */}
                <Animated.View
                    entering={FadeInDown.duration(420).delay(80).springify().damping(18)}
                    style={{ paddingHorizontal: spacing.xl, marginTop: spacing.xl }}
                >
                    <Card variant="glass" style={styles.calendarBox} padding="xl">
                        <View style={styles.calHeader}>
                            <Text style={[typography.h3, { color: colors.text.primary }]}>{monthLabel}</Text>
                            <View style={{ flexDirection: 'row', gap: 8 }}>
                                <TouchableOpacity
                                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                    accessibilityRole="button"
                                    accessibilityLabel="Previous month"
                                    activeOpacity={0.7}
                                    onPress={goToPrevMonth}
                                    style={[styles.navBtn, { backgroundColor: colors.background.tertiary, borderColor: colors.border.default }]}
                                >
                                    <Ionicons name="chevron-back" size={18} color={colors.text.secondary} />
                                </TouchableOpacity>
                                <TouchableOpacity
                                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                    accessibilityRole="button"
                                    accessibilityLabel="Next month"
                                    activeOpacity={0.7}
                                    onPress={goToNextMonth}
                                    style={[styles.navBtn, { backgroundColor: colors.background.tertiary, borderColor: colors.border.default }]}
                                >
                                    <Ionicons name="chevron-forward" size={18} color={colors.text.secondary} />
                                </TouchableOpacity>
                            </View>
                        </View>

                        <View style={styles.dayLabels}>
                            {DAYS.map(d => <Text key={d} style={[styles.dayLabel, { color: colors.text.tertiary }]}>{d[0]}</Text>)}
                        </View>

                        {historyQuery.isError ? (
                            <EmptyState
                                icon="cloud-offline-outline"
                                title="Couldn't load activity"
                                subtitle="We couldn't reach your training history. Check your connection and try again."
                                actionLabel="Retry"
                                onAction={() => historyQuery.refetch()}
                            />
                        ) : historyQuery.isLoading ? (
                            // Loading — soft glass skeletons for the grid so the
                            // first paint reads as "loading", never a fake-empty
                            // month of hairline cells. A skeleton tile per day cell
                            // keeps the 7-column rhythm, capped by the legend skeleton.
                            <View accessibilityLabel="Loading activity" accessibilityRole="progressbar">
                                <View style={styles.grid}>
                                    {Array.from({ length: 35 }).map((_, i) => (
                                        <View key={`sk-${i}`} style={styles.dayCell}>
                                            <Skeleton width="100%" height={CELL_SIZE - 6} radius={10} style={styles.skeletonTile} />
                                        </View>
                                    ))}
                                </View>
                                <View style={styles.legend}>
                                    <Skeleton width={120} height={12} radius={3} />
                                </View>
                            </View>
                        ) : history.length === 0 && !historyQuery.isLoading ? (
                            <EmptyState
                                icon="calendar-outline"
                                title="No activity logged this month"
                                subtitle="Complete a workout to start filling in your training calendar."
                            />
                        ) : (
                            <>
                                <View style={styles.grid}>
                                    {/* Leading blanks so day 1 lands under its real weekday. */}
                                    {Array.from({ length: leadingBlanks }).map((_, i) => (
                                        <View key={`blank-${i}`} style={styles.dayCell} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
                                    ))}
                                    {Array.from({ length: daysInMonth }).map((_, i) => {
                                        const day = i + 1;
                                        const cellISO = toLocalISODate(cursor.year, cursor.month, day);
                                        const hasActivity = activityByDay.has(cellISO);
                                        const isToday = cellISO === todayISO;
                                        const isSelected = cellISO === selectedDay;
                                        // Map the day's score (0-100) to one of four
                                        // ascending success-tint steps. Any logged
                                        // day reads at least the lightest step; an
                                        // unlogged day stays a faint hairline wash.
                                        const score = activityByDay.get(cellISO) ?? 0;
                                        const heatAlpha = !hasActivity
                                            ? null
                                            : score >= 75 ? HEAT_STEPS[3]
                                            : score >= 50 ? HEAT_STEPS[2]
                                            : score >= 25 ? HEAT_STEPS[1]
                                            : HEAT_STEPS[0];
                                        const heatColor = heatAlpha != null
                                            ? withAlpha(colors.success, heatAlpha)
                                            : withAlpha(colors.text.primary, 0.04);
                                        return (
                                            <PressableScale
                                                key={cellISO}
                                                accessibilityRole="button"
                                                accessibilityLabel={`Day ${day}${hasActivity ? ', has activity' : ''}`}
                                                accessibilityState={{ selected: isToday }}
                                                onPress={() => setSelectedDay(prev => (prev === cellISO ? null : cellISO))}
                                                style={styles.dayCell}
                                            >
                                                <View
                                                    style={[
                                                        styles.heatTile,
                                                        { backgroundColor: heatColor },
                                                        // Today owns the lime ring (the one active highlight). Selected
                                                        // (non-today) gets a soft neutral border. When today is ALSO
                                                        // selected, the lime ring wins and the selection is shown by a
                                                        // nested inner ring (below) — so the two languages stack, not fight.
                                                        isSelected && !isToday && { borderWidth: 1.5, borderColor: withAlpha(colors.text.primary, 0.45) },
                                                        isToday && { borderWidth: 1.5, borderColor: colors.accent.coral, backgroundColor: withAlpha(colors.accent.coral, 0.18) },
                                                    ]}
                                                >
                                                    {/* Singular selection treatment: a subtle inner ring in low-alpha
                                                        text.primary that visually NESTS inside today's lime ring rather
                                                        than competing with a second outer border. */}
                                                    {isSelected && isToday ? (
                                                        <View style={[styles.selectedInnerRing, { borderColor: withAlpha(colors.text.primary, 0.5) }]} pointerEvents="none" />
                                                    ) : null}
                                                    <Text style={[typography.bodySm, { color: isToday ? colors.accent.coral : hasActivity ? colors.text.primary : colors.text.tertiary, fontWeight: isToday ? '700' : hasActivity ? '600' : '400' }]}>{day}</Text>
                                                </View>
                                            </PressableScale>
                                        );
                                    })}
                                </View>

                                {/* Heatmap legend — decodes the intensity ramp so the
                                    grid reads as data, not decoration. */}
                                <View style={styles.legend}>
                                    <Text style={[typography.caption, { color: colors.text.tertiary }]}>Less</Text>
                                    <View style={[styles.legendCell, { backgroundColor: withAlpha(colors.text.primary, 0.04) }]} />
                                    {HEAT_STEPS.map((a, idx) => (
                                        <View key={idx} style={[styles.legendCell, { backgroundColor: withAlpha(colors.success, a) }]} />
                                    ))}
                                    <Text style={[typography.caption, { color: colors.text.tertiary }]}>More</Text>
                                </View>
                            </>
                        )}
                    </Card>
                </Animated.View>

                {/* Tapped-day detail — revealed inline (no navigation/fetch). Shows
                    the activity recorded for the selected day from already-loaded
                    history, or an honest "rest day" line when none. */}
                {selectedDay ? (
                    <Animated.View
                        entering={FadeIn.duration(200)}
                        style={{ paddingHorizontal: spacing.xl, marginTop: spacing.lg }}
                    >
                        <Card variant="glass" padding="lg">
                            <View style={styles.detailRow}>
                                <View style={[styles.sessionIcon, {
                                    backgroundColor: selectedScore != null ? withAlpha(colors.success, 0.14) : withAlpha(colors.text.secondary, 0.1),
                                    borderColor: selectedScore != null ? withAlpha(colors.success, 0.28) : colors.border.default,
                                }]}>
                                    <Ionicons name={selectedScore != null ? 'flame' : 'bed-outline'} size={20} color={selectedScore != null ? colors.success : colors.text.tertiary} />
                                </View>
                                <View style={styles.sessionInfo}>
                                    <Text style={[typography.overline, { color: colors.text.secondary }]}>
                                        {(() => {
                                            const [y, m, d] = selectedDay.split('-').map(Number) as [number, number, number];
                                            return formatDayLong(y, m - 1, d);
                                        })()}
                                    </Text>
                                    {selectedScore != null ? (
                                        <View style={styles.detailScoreRow}>
                                            <Text style={[typography.statSmall, { color: colors.text.primary }]}>{Math.round(selectedScore)}</Text>
                                            <Text style={[typography.caption, { color: colors.text.tertiary, marginLeft: 6, marginBottom: 3 }]}>readiness score</Text>
                                        </View>
                                    ) : (
                                        <Text style={[typography.body, { color: colors.text.primary, marginTop: 2 }]}>Rest day — nothing logged</Text>
                                    )}
                                </View>
                                <TouchableOpacity
                                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                    accessibilityRole="button"
                                    accessibilityLabel="Close day detail"
                                    activeOpacity={0.7}
                                    onPress={() => setSelectedDay(null)}
                                >
                                    <Ionicons name="close" size={20} color={colors.text.tertiary} />
                                </TouchableOpacity>
                            </View>
                        </Card>
                    </Animated.View>
                ) : null}

                {/* Upcoming sessions — real data from shift-service /v1/training.
                    Renders the user's scheduled sessions when present; an honest
                    zero-data EmptyState when the list is empty (the backend also
                    returns [] while the scheduled_sessions migration is un-run);
                    and a connection-error EmptyState (mirroring the activity grid)
                    on failure. */}
                <Animated.View
                    entering={FadeInDown.duration(420).delay(160).springify().damping(18)}
                    style={{ paddingHorizontal: spacing.xl, marginTop: spacing['2xl'] }}
                >
                    <View style={styles.sectionHead}>
                        <Text style={[typography.h3, { color: colors.text.primary }]}>Scheduled Sessions</Text>
                        {sessions.length > 0 ? (
                            // Neutral count chip — decorative/identity, not the primary
                            // action, so it stays off lime (success/cyan tint).
                            <View style={[styles.countPill, { backgroundColor: withAlpha(colors.success, 0.12), borderColor: withAlpha(colors.success, 0.24) }]}>
                                <Text style={[typography.captionMedium, { color: colors.success }]}>{sessions.length}</Text>
                            </View>
                        ) : null}
                    </View>
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
                            {sessions.map((session, idx) => (
                                <Animated.View key={session.id} entering={FadeInDown.duration(360).delay(200 + idx * 50).springify().damping(18)}>
                                    <Card variant="glass" padding="lg">
                                        <View style={styles.sessionRow}>
                                            {/* Decorative/identity icon — neutral, not an active
                                                state, so it stays off the reserved lime accent. */}
                                            <View style={[styles.sessionIcon, { backgroundColor: withAlpha(colors.text.secondary, 0.1), borderColor: colors.border.default }]}>
                                                <Ionicons name="barbell-outline" size={20} color={colors.text.secondary} />
                                            </View>
                                            <View style={styles.sessionInfo}>
                                                <Text style={[typography.subtitle, { color: colors.text.primary }]} numberOfLines={1}>
                                                    {session.title}
                                                </Text>
                                                <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 2 }]}>
                                                    {formatSessionWhen(session.scheduledAt)}
                                                </Text>
                                                {session.notes ? (
                                                    <Text style={[typography.caption, { color: colors.text.tertiary, marginTop: 4 }]} numberOfLines={2}>
                                                        {session.notes}
                                                    </Text>
                                                ) : null}
                                            </View>
                                        </View>
                                    </Card>
                                </Animated.View>
                            ))}
                        </View>
                    ) : (
                        <EmptyState
                            icon="calendar-outline"
                            title="No sessions scheduled"
                            subtitle="Plan your next session and it will show up here, ready when you are."
                            actionLabel="Schedule a Session"
                            onAction={() => { resetForm(); setFormOpen(true); }}
                        />
                    )}
                </Animated.View>
            </ScrollView>

            {/* ── Thumb-zone primary action ──────────────────────────────────
                The one full-lime CTA, pinned in the reachable bottom third. Opens
                the same create-session form as the header "+", so the primary
                affordance lives where the thumb rests. Ink label (Button primary
                renders #0A0C12 on the lime fill) per the brand rule. */}
            <View style={[styles.ctaDock, { paddingBottom: insets.bottom + spacing.md }]} pointerEvents="box-none">
                {/* Bottom scrim — a transparent→base fade rising above the dock so
                    the ink-on-lime CTA never lands directly on an arbitrary glass
                    session card. Gives the one primary action a clean base + crisp
                    edge definition. Non-interactive so taps still pass through. */}
                <LinearGradient
                    colors={[withAlpha(colors.background.primary, 0), colors.background.primary]}
                    style={styles.ctaScrim}
                    pointerEvents="none"
                />
                <Button
                    title="Schedule a Session"
                    onPress={() => { resetForm(); setFormOpen(true); }}
                    variant="primary"
                    fullWidth
                    icon={<Ionicons name="add" size={20} color={colors.text.inverse} />}
                    accessibilityRole="button"
                    accessibilityLabel="Schedule a session"
                />
            </View>

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
                            <View style={[styles.grabber, { backgroundColor: withAlpha(colors.text.primary, 0.18) }]} />
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
                                <Text style={[typography.overline, styles.fieldLabel, { color: colors.text.secondary }]}>Title</Text>
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
                                <Text style={[typography.overline, styles.fieldLabel, { color: colors.text.secondary, marginTop: spacing.lg }]}>Date</Text>
                                <DateTimeField
                                    mode="date"
                                    value={date}
                                    onChange={setDate}
                                    accessibilityLabel="Session date"
                                    minimumDate={new Date()}
                                />

                                {/* Notes (optional) */}
                                <Text style={[typography.overline, styles.fieldLabel, { color: colors.text.secondary, marginTop: spacing.lg }]}>Notes (optional)</Text>
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
                                <Text style={[typography.overline, styles.fieldLabel, { color: colors.text.secondary, marginTop: spacing.lg }]}>Link to a shift (optional)</Text>
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
                                                backgroundColor: shiftId === null ? withAlpha(colors.text.primary, 0.1) : colors.background.secondary,
                                                borderColor: shiftId === null ? withAlpha(colors.text.primary, 0.45) : colors.border.default,
                                            },
                                        ]}
                                    >
                                        <Text style={[typography.caption, { color: shiftId === null ? colors.text.primary : colors.text.secondary, fontWeight: shiftId === null ? '700' : '500' }]}>None</Text>
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
                                                        backgroundColor: selected ? withAlpha(colors.text.primary, 0.1) : colors.background.secondary,
                                                        borderColor: selected ? withAlpha(colors.text.primary, 0.45) : colors.border.default,
                                                    },
                                                ]}
                                            >
                                                <Text style={[typography.caption, { color: selected ? colors.text.primary : colors.text.secondary, fontWeight: selected ? '700' : '500' }]} numberOfLines={1}>{label}</Text>
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

    momentumCard: { flex: 1 },
    // The streak is the celebratory PEAK; the live lime border + glow are applied
    // inline (border on the Card, glow on its non-clipping wrapper).
    streakCard: {},
    momentumIcon: { width: 34, height: 34, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
    streakRow: { flexDirection: 'row', alignItems: 'flex-end' },

    calendarBox: {},
    calHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    navBtn: { width: 34, height: 34, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    dayLabels: { flexDirection: 'row', marginBottom: 10 },
    dayLabel: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
    grid: { flexDirection: 'row', flexWrap: 'wrap' },
    dayCell: { width: CELL_SIZE, height: CELL_SIZE, alignItems: 'center', justifyContent: 'center', padding: 3 },
    heatTile: { flex: 1, alignSelf: 'stretch', borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    // Soft inner ring that nests inside today's lime ring for the selected+today
    // case, so selection reads as a single language instead of a double border.
    selectedInnerRing: { ...StyleSheet.absoluteFillObject, margin: 2, borderRadius: 7, borderWidth: 1.5 },
    skeletonTile: { alignSelf: 'stretch' },

    legend: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 16 },
    legendCell: { width: 12, height: 12, borderRadius: 3 },

    detailRow: { flexDirection: 'row', alignItems: 'center' },
    detailScoreRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 2 },

    sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
    countPill: { minWidth: 24, height: 22, borderRadius: 11, borderWidth: 1, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },

    sessionRow: { flexDirection: 'row', alignItems: 'center' },
    sessionIcon: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
    sessionInfo: { flex: 1 },

    ctaDock: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 8 },
    // Scrim rises above the dock so the CTA sits on a clean fade, not raw content.
    ctaScrim: { position: 'absolute', left: 0, right: 0, bottom: 0, top: -28 },

    modalOverlay: { flex: 1, justifyContent: 'flex-end' },
    modalKeyboard: { width: '100%' },
    formCard: { borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '88%' },
    grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: 14 },
    formHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
    fieldLabel: { marginBottom: 8 },
    inputBox: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, height: 52 },
    textInput: { flex: 1, marginLeft: 8, fontSize: 16, paddingVertical: 10 },
    notesBox: { height: 96, alignItems: 'flex-start', paddingVertical: 8 },
    notesInput: { height: '100%', textAlignVertical: 'top' },
    shiftChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    shiftChip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, borderWidth: 1, maxWidth: '100%' },
});
