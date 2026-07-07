import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '@/theme';
import { useCycleAccents } from '@/theme/useCycleAccents';
import { GlassCard, CtaButton, DateTimeField, nowDateString } from '@/components/ui';
import { withAlpha, isLightHex } from '@/theme/utils';
import { updateCycleHealth } from '@/api/cycle';
import type { CycleHealthBody } from '@/api/cycle';
import { pregnancyHero } from '@/features/cycle/phaseArt';

/**
 * PregnancyCard — the pregnancy-mode surface (Period P2).
 *
 * OFF state: a single toggle "I'm pregnant" that, when tapped, reveals a due-date
 * DateTimeField + a confirm CTA. Confirming PATCHes
 * /v1/users/me/cycle/health { pregnancyMode: true, pregnancyDueDate } and unlocks
 * the tracker.
 *
 * ON state: a calm pregnancy TRACKER derived entirely from the due date —
 *   • current week   = clamp(40 - ceil(daysUntilDue / 7), 1, 42)
 *   • "Week N of 40" + a progress bar
 *   • trimester      = 1 (wk ≤13) / 2 (14–27) / 3 (28+)
 *   • a days-to-due countdown
 *   • a short, GENERIC weekly wellness note (never medical advice)
 *   • a "Turn off pregnancy mode" action that PATCHes pregnancyMode:false.
 *
 * Reads its INITIAL state from the profile row the screen already fetched
 * (GET /v1/users/me → pregnancyMode + pregnancyDueDate) via props, so it needs no
 * query of its own; on any mutation it invalidates ['my-profile'] so the screen
 * (and this card) re-read the merged server state.
 *
 * Lime brand accent (a hopeful, forward-looking tone that reads distinctly from
 * the coral period surface). Wellness framing throughout — this is a tracker, not
 * a clinical tool; the screen's MedicalDisclaimer still applies.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;
// Full-term reference for the "Week N of 40" readout. The week math clamps to 42
// so a slightly overdue date still reads sensibly rather than going negative.
const TERM_WEEKS = 40;

/** Parse 'YYYY-MM-DD' → UTC-midnight ms (matches the server's date-only math), or
 *  null when malformed. Keeping the reference frame in UTC keeps the day counts
 *  from drifting by a timezone, exactly like cycle.tsx's isoToUtcMs. */
function isoToUtcMs(iso: string | null | undefined): number | null {
    if (!iso) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!m) return null;
    const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return Number.isNaN(ms) ? null : ms;
}

/** Today at UTC midnight (ms) — the "now" reference for the derived counts. */
function todayUtcMs(): number {
    const n = new Date();
    return Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate());
}

export interface PregnancyDerived {
    week: number;             // 1..42 (clamped)
    trimester: 1 | 2 | 3;
    daysUntilDue: number;     // may be negative if overdue
    note: string;             // generic weekly wellness note
}

/**
 * PURE derivation of the pregnancy readout from a due date. Exported so the
 * week/trimester math can be unit-tested without a renderer (mirrors
 * cycleAccentsForBackground's testability). Returns null when the due date is
 * missing/malformed so the caller can fall back to a gentle empty tracker.
 */
export function derivePregnancy(
    dueDateIso: string | null | undefined,
    nowMs: number = todayUtcMs(),
): PregnancyDerived | null {
    const dueMs = isoToUtcMs(dueDateIso);
    if (dueMs == null) return null;

    const daysUntilDue = Math.round((dueMs - nowMs) / MS_PER_DAY);
    // week = 40 - ceil(daysUntilDue / 7), clamped into a sane 1..42 band. When the
    // date is overdue (daysUntilDue < 0) this naturally pushes past 40, so clamp.
    const rawWeek = TERM_WEEKS - Math.ceil(daysUntilDue / 7);
    const week = Math.min(42, Math.max(1, rawWeek));

    const trimester: 1 | 2 | 3 = week <= 13 ? 1 : week <= 27 ? 2 : 3;

    return { week, trimester, daysUntilDue, note: weeklyNote(week) };
}

/**
 * A short, GENERIC, non-medical wellness note for the current week band. Tone is
 * supportive and everyday — hydration, rest, gentle movement — never diagnostic,
 * never dosing/medical guidance. The screen's MedicalDisclaimer covers the rest.
 */
function weeklyNote(week: number): string {
    if (week <= 13) {
        return 'First trimester — rest when you need to and keep sipping water. Small, frequent snacks can help settle the day.';
    }
    if (week <= 27) {
        return 'Second trimester — often a steadier stretch. Gentle movement and a comfortable routine tend to feel good now.';
    }
    if (week < 40) {
        return 'Third trimester — take it slow and listen to your body. Short walks and good rest go a long way this stretch.';
    }
    return 'You are around full term — rest up, stay comfortable, and keep your support close. Every pregnancy runs its own timeline.';
}

const TRIMESTER_LABEL: Record<1 | 2 | 3, string> = {
    1: 'First trimester',
    2: 'Second trimester',
    3: 'Third trimester',
};

export interface PregnancyCardProps {
    /** Persisted flag from GET /v1/users/me — is pregnancy mode currently on? */
    pregnancyMode?: boolean;
    /** Persisted due date 'YYYY-MM-DD' from the profile row (may be null). */
    pregnancyDueDate?: string | null;
}

export function PregnancyCard({ pregnancyMode, pregnancyDueDate }: PregnancyCardProps) {
    const { colors, typography, borderRadius } = useTheme();
    const isLight = isLightHex(colors.background.primary);
    const { lime: LIME } = useCycleAccents();
    const queryClient = useQueryClient();

    const isOn = pregnancyMode === true;

    // In the OFF state, tapping the toggle reveals the due-date prompt inline
    // (rather than a separate screen) — matching LogPeriodCard's in-card form.
    const [prompting, setPrompting] = useState(false);
    // Seed the picker with the persisted due date if present, else empty.
    const [dueDate, setDueDate] = useState<string>(pregnancyDueDate ?? '');

    // Keep the local due-date field in sync if the persisted value changes under
    // us (e.g. a background profile refetch) while we are not actively prompting.
    useEffect(() => {
        if (!prompting) setDueDate(pregnancyDueDate ?? '');
    }, [pregnancyDueDate, prompting]);

    const mutation = useMutation({
        mutationFn: (body: CycleHealthBody) => updateCycleHealth(body),
        onError: (err: any) => {
            Alert.alert('Error', err?.response?.data?.message ?? err?.message ?? 'Could not update pregnancy mode');
        },
        onSuccess: () => {
            // Re-read the merged profile row → this card + the screen refresh.
            queryClient.invalidateQueries({ queryKey: ['my-profile'] });
            queryClient.invalidateQueries({ queryKey: ['my-status'] });
            setPrompting(false);
        },
    });

    // Derive the tracker readout from the persisted due date (ON state only).
    const derived = useMemo(() => derivePregnancy(pregnancyDueDate), [pregnancyDueDate]);

    const enable = () => {
        if (!dueDate) return;
        // Turn pregnancy mode ON with the chosen due date. We also send today as the
        // pregnancyStartDate anchor so the server has a "recorded from" reference.
        mutation.mutate({ pregnancyMode: true, pregnancyDueDate: dueDate, pregnancyStartDate: nowDateString() });
    };

    const disable = () => {
        Alert.alert(
            'Turn off pregnancy mode?',
            'Your period predictions will resume. You can turn pregnancy mode back on anytime.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Turn off',
                    style: 'destructive',
                    onPress: () => mutation.mutate({ pregnancyMode: false }),
                },
            ],
        );
    };

    const today = new Date();

    // ── ON: the pregnancy tracker ────────────────────────────────────────────────
    if (isOn) {
        // Progress fraction toward 40 weeks, clamped 0..1 for the bar width.
        const progress = derived ? Math.min(1, Math.max(0, derived.week / TERM_WEEKS)) : 0;
        const daysUntilDue = derived?.daysUntilDue ?? null;

        return (
            <GlassCard radius={borderRadius['2xl']} style={styles.card}>
                <View style={styles.inner}>
                    {/* On-brand pregnancy hero banner (dark cinematic), fading into the card. */}
                    <View style={styles.heroBanner}>
                        <Image source={pregnancyHero(isLight)} style={StyleSheet.absoluteFillObject} contentFit="cover" transition={200} />
                        <LinearGradient
                            colors={['transparent', withAlpha(colors.background.secondary, 0.7), colors.background.secondary]}
                            style={StyleSheet.absoluteFillObject}
                        />
                    </View>
                    <View style={styles.header}>
                        <Ionicons name="heart-circle-outline" size={18} color={LIME} />
                        <Text style={[typography.overline, styles.headerLabel, { color: colors.text.secondary }]}>
                            PREGNANCY MODE
                        </Text>
                        {/* Small "on" affordance to turn it back off. */}
                        <Pressable
                            onPress={disable}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            accessibilityRole="button"
                            accessibilityLabel="Turn off pregnancy mode"
                            style={styles.headerAction}
                        >
                            <Text style={[typography.captionMedium, { color: colors.text.tertiary }]}>Turn off</Text>
                        </Pressable>
                    </View>

                    {derived ? (
                        <>
                            {/* Big week readout. */}
                            <View style={styles.weekBlock}>
                                <Text style={[typography.statSmall, { color: colors.text.primary }]}>
                                    Week {derived.week}
                                </Text>
                                <Text style={[typography.bodySm, { color: colors.text.secondary, marginTop: 2 }]}>
                                    Week {derived.week} of {TERM_WEEKS} · {TRIMESTER_LABEL[derived.trimester]}
                                </Text>
                            </View>

                            {/* Progress toward full term. */}
                            <View style={[styles.progressTrack, { backgroundColor: withAlpha(LIME, 0.14) }]}>
                                <View style={[styles.progressFill, { backgroundColor: LIME, width: `${progress * 100}%` }]} />
                            </View>

                            {/* Countdown to the due date (handles overdue gracefully). */}
                            <View style={styles.countdownRow}>
                                <Ionicons name="calendar-outline" size={15} color={LIME} />
                                <Text style={[typography.bodySm, styles.countdownText, { color: colors.text.secondary }]}>
                                    {daysUntilDue == null
                                        ? 'Due date set'
                                        : daysUntilDue > 0
                                            ? `${daysUntilDue} ${daysUntilDue === 1 ? 'day' : 'days'} to your due date`
                                            : daysUntilDue === 0
                                                ? 'Your due date is today'
                                                : `${Math.abs(daysUntilDue)} ${Math.abs(daysUntilDue) === 1 ? 'day' : 'days'} past your due date`}
                                </Text>
                            </View>

                            {/* Generic weekly wellness note (not medical advice). */}
                            <View style={[styles.noteBox, { backgroundColor: withAlpha(LIME, 0.08), borderColor: withAlpha(LIME, 0.25) }]}>
                                <Text style={[typography.bodySm, { color: colors.text.secondary }]}>
                                    {derived.note}
                                </Text>
                            </View>
                        </>
                    ) : (
                        // ON but no valid due date — offer to set one.
                        <View style={styles.field}>
                            <Text style={[typography.bodySm, { color: colors.text.secondary, marginBottom: 8 }]}>
                                Add your due date to see your weekly tracker.
                            </Text>
                            <DateTimeField
                                mode="date"
                                value={dueDate}
                                onChange={setDueDate}
                                minimumDate={today}
                                accessibilityLabel="Estimated due date"
                            />
                            <CtaButton
                                label="Save due date"
                                icon="checkmark-circle-outline"
                                onPress={() => mutation.mutate({ pregnancyDueDate: dueDate })}
                                loading={mutation.isPending}
                                disabled={!dueDate || mutation.isPending}
                                style={styles.cta}
                            />
                        </View>
                    )}
                </View>
            </GlassCard>
        );
    }

    // ── OFF: the enable toggle (+ inline due-date prompt) ────────────────────────
    return (
        <GlassCard radius={borderRadius['2xl']} style={styles.card}>
            <View style={styles.inner}>
                <Pressable
                    onPress={() => setPrompting((p) => !p)}
                    accessibilityRole="switch"
                    accessibilityState={{ checked: false }}
                    accessibilityLabel="Enable pregnancy mode"
                    style={styles.toggleRow}
                >
                    <View style={styles.toggleLeft}>
                        <View style={[styles.iconBadge, { backgroundColor: withAlpha(LIME, 0.14) }]}>
                            <Ionicons name="heart-circle-outline" size={18} color={LIME} />
                        </View>
                        <View style={styles.toggleText}>
                            <Text style={[typography.subtitle, { color: colors.text.primary }]}>Pregnancy mode</Text>
                            <Text style={[typography.caption, { color: colors.text.tertiary }]}>
                                Track your pregnancy by week. Period predictions pause while it's on.
                            </Text>
                        </View>
                    </View>
                    <Ionicons
                        name={prompting ? 'chevron-up' : 'chevron-forward'}
                        size={18}
                        color={colors.text.tertiary}
                    />
                </Pressable>

                {prompting ? (
                    <View style={styles.field}>
                        <Text style={[typography.caption, styles.fieldLabel, { color: colors.text.secondary }]}>
                            Estimated due date
                        </Text>
                        <DateTimeField
                            mode="date"
                            value={dueDate}
                            onChange={setDueDate}
                            minimumDate={today}
                            accessibilityLabel="Estimated due date"
                        />
                        <CtaButton
                            label="Turn on pregnancy mode"
                            icon="checkmark-circle-outline"
                            onPress={enable}
                            loading={mutation.isPending}
                            disabled={!dueDate || mutation.isPending}
                            testID="pregnancy-enable-submit"
                            style={styles.cta}
                        />
                    </View>
                ) : null}
            </View>
        </GlassCard>
    );
}

const styles = StyleSheet.create({
    card: { marginTop: 12 },
    inner: { padding: 18 },
    heroBanner: { height: 132, borderRadius: 16, overflow: 'hidden', marginBottom: 14 },
    header: { flexDirection: 'row', alignItems: 'center' },
    headerLabel: { marginLeft: 8, letterSpacing: 1, flex: 1 },
    headerAction: { paddingHorizontal: 6, paddingVertical: 2 },
    // OFF toggle row.
    toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    toggleLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 10 },
    iconBadge: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    toggleText: { flex: 1, marginLeft: 12 },
    // ON tracker.
    weekBlock: { marginTop: 14 },
    progressTrack: { height: 8, borderRadius: 4, marginTop: 12, overflow: 'hidden' },
    progressFill: { height: 8, borderRadius: 4 },
    countdownRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
    countdownText: { marginLeft: 7 },
    noteBox: { marginTop: 14, padding: 12, borderRadius: 12, borderWidth: 1 },
    // Shared form bits.
    field: { marginTop: 14 },
    fieldLabel: { marginBottom: 6, letterSpacing: 0.5 },
    cta: { marginTop: 16 },
});

export default PregnancyCard;
