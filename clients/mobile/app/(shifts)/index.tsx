import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Pressable } from 'react-native';
import { useTheme, spacing, borderRadius } from '@/theme';
import { withAlpha } from '@/theme/utils';
import { Card } from '@/components/ui/Card';
import { Skeleton, EmptyState, GeneratingSteps, GlassCard, CtaButton } from '@/components/ui';
import Animated, { FadeInDown } from 'react-native-reanimated';

// Staged status lines shown while the AI nutrition plan is generated (10–30s).
const NUTRITION_GEN_STEPS = [
    'Reading your circadian profile…',
    'Calculating macro targets…',
    'Timing your meals to your shift…',
    'Balancing energy windows…',
    'Finalizing your plan…',
];

/**
 * Human-readable label for a linked session's `scheduledAt` ISO timestamp,
 * rendered in the device's LOCAL timezone (e.g. "Sat, Jun 20 · 6:00 PM").
 *
 * Deliberately RE-IMPLEMENTED here (rather than imported) so this read-only
 * shift-detail section has NO dependency on (performance)/calendar.tsx, which
 * owns create/link. The format intentionally mirrors that screen's
 * `formatSessionWhen` (toLocaleDateString + ' · ' + toLocaleTimeString) so the
 * two surfaces read identically. Falls back to the raw string when the value
 * is unparseable so a row never renders "Invalid Date".
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
 * Short HH:MM label for an active shift's `startTime` / `endTime` ISO, in the
 * device's LOCAL timezone. Defined ONCE at module scope (js-hoist-intl) so the
 * three timeline renders below — the start–end header plus the "Shift Starts" /
 * "Shift Ends" nodes — share one helper rather than each constructing a
 * per-render formatter. Returns a neutral '--:--' sentinel for an empty or
 * unparseable value so a slot never renders the literal 'Invalid Date'
 * (rendering-no-falsy-and: a string sentinel, never a bare falsy value).
 */
const formatShiftTime = (iso: string): string => {
    const d = new Date(iso);
    if (!iso || Number.isNaN(d.getTime())) return '--:--';
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

/**
 * Short weekday label ("Sat") for the shift-start ISO in LOCAL time, used as the
 * small overline beside the hero start time. Hoisted (no per-render Intl alloc)
 * and returns '' on an unparseable value so the slot simply renders nothing
 * rather than 'Invalid Date'.
 */
const formatShiftDay = (iso: string): string => {
    const d = new Date(iso);
    if (!iso || Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString(undefined, { weekday: 'short' });
};

/**
 * Whole-hours duration between two shift ISO timestamps, rendered as the hero's
 * dominant VALUE (e.g. "8h", "8.5h"). Purely DERIVED from the existing
 * start/end on `currentShift` — NOT a new data hook — so it inherits the same
 * ground truth as the timeline. Returns '' when either bound is missing or
 * unparseable, or when end ≤ start (overnight spans that cross midnight are
 * normalised by adding 24h), so the slot never shows a nonsense value.
 */
const formatShiftDuration = (startIso: string, endIso: string): string => {
    const s = new Date(startIso);
    const e = new Date(endIso);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return '';
    let mins = (e.getTime() - s.getTime()) / 60000;
    if (mins <= 0) mins += 24 * 60; // overnight rotation crossing midnight
    if (mins <= 0 || mins > 24 * 60) return '';
    const rounded = Math.round((mins / 60) * 10) / 10;
    return `${rounded}h`;
};
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation } from '@tanstack/react-query';
import { getCurrent } from '@/api/shifts';
import { getScheduledSessionsForShift, type ScheduledSession } from '@/api/training';
import { generatePlan } from '@/api/plans';
// This screen drives the METERED plan-service generate (POST /v1/plans/generate
// via `@/api/plans` generatePlan), so a daily-cap failure arrives as the SHARED
// 429 { error:'ai_quota_exceeded', limit, plan, resetsAt }. We REUSE the
// canonical parser from '@/api/ai' (the single, endpoint-agnostic home of the
// AiQuotaError contract) to flip into the distinct upgrade state instead of the
// old destructive Alert — same pattern as (meals)/planner.tsx / ai-planner.tsx.
import { parseAiQuotaError, type AiQuotaError } from '@/api/ai';
import { getErrorMessage } from '@/utils/validation';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';

// Human-readable "resets" line for the daily-limit upgrade block. Renders a
// short local clock time ("Resets at 6:00 AM") when `resetsAt` is a parseable
// ISO timestamp, else a sensible fallback so the block never shows a raw date
// or "Invalid Date". Hoisted to module scope (no per-render Intl alloc); copied
// verbatim from (meals)/planner.tsx / ai-planner.tsx's formatResetsAt.
function formatResetsAt(resetsAt: string): string {
    if (!resetsAt) return 'Resets at midnight UTC';
    const when = new Date(resetsAt);
    if (Number.isNaN(when.getTime())) return 'Resets at midnight UTC';
    const time = when.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    return `Resets at ${time}`;
}

export default function ShiftCalendarScreen() {
    const { colors, typography, spacing, borderRadius, shadows } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();

    // ── Plan-generation failure ground truth — two MUTUALLY-EXCLUSIVE vars ───
    // `quota` holds the parsed daily-AI-limit 429 (the distinct upgrade state);
    // `genError` holds any other failure message (the retryable inline notice).
    // Exactly one is ever non-null — onMutate + onSuccess clear BOTH, and onError
    // sets precisely one. The visible notices are DERIVED from whichever is set
    // (state = ground truth, not the rendered output — state-ground-truth.md).
    const [quota, setQuota] = useState<AiQuotaError | null>(null);
    const [genError, setGenError] = useState<string | null>(null);

    const { data: currentShift, isLoading, isError, refetch } = useQuery({
        queryKey: ['current-shift'],
        queryFn: getCurrent,
    });

    // Read-only inverse of the calendar's create/link flow: the sessions the
    // user has linked to THIS shift. Reuses getScheduledSessionsForShift (a
    // client-side filter over GET /v1/training/scheduled-sessions), so it
    // inherits that endpoint's honest contract — the backend answers `200 []`
    // while the user-gated scheduled_sessions migration is un-run, which simply
    // renders the zero-data state below (NOT an error). `enabled` gates the
    // query on a present shift so it never fires (or references a missing id)
    // before the current-shift query resolves.
    const linkedSessionsQuery = useQuery({
        queryKey: ['shift-linked-sessions', currentShift?.id],
        queryFn: () => getScheduledSessionsForShift(currentShift!.id),
        enabled: !!currentShift,
    });
    const linkedSessions: ScheduledSession[] = linkedSessionsQuery.data ?? [];

    const generateMutation = useMutation({
        mutationFn: (payload: any) => generatePlan(payload),
        // Clear BOTH failure surfaces the instant a (re)generation begins, so a
        // stale upgrade/error notice never lingers under an in-flight request.
        onMutate: () => { setQuota(null); setGenError(null); },
        onError: (err: unknown) => {
            // A 429 daily-AI-limit flips into the distinct upgrade state; any
            // other error (network / 5xx / non-quota 4xx) takes the retryable
            // inline error path. Set exactly one, clear the other — NO Alert.
            const q = parseAiQuotaError(err);
            if (q) { setQuota(q); setGenError(null); }
            else { setQuota(null); setGenError(getErrorMessage(err)); }
        },
        onSuccess: () => {
            // Success clears both notices and navigates to the nutrition tab so
            // the freshly-generated plan is front-and-centre (the prior
            // non-destructive success Alert is dropped — navigation is the
            // confirmation). Mirrors the other generate callers' onSuccess reset.
            setQuota(null);
            setGenError(null);
            router.push('/(tabs)/nutrition' as any);
        },
    });

    // Clear any prior failure state and kick off generation against the active
    // shift (used by BOTH the generate hero button and the inline "Try again").
    // `onMutate` also resets the notices, so this stays correct even if called
    // from elsewhere; building the payload here keeps the retry identical to the
    // first attempt. Guarded on a present shift (the CTA only renders then).
    const runGenerate = () => {
        if (!currentShift) return;
        setQuota(null);
        setGenError(null);
        generateMutation.mutate({
            date: new Date().toISOString().slice(0, 10),
            shiftId: currentShift.id,
            shiftType: currentShift.type,
        });
    };

    // Hardcoded logic removed. Instead, user routes to the new modal to pick details.

    // Derived hero values (NOT new data) — read straight off the active shift so
    // the big VALUE (duration) can dominate its small label, per the brief.
    const shiftDuration = currentShift
        ? formatShiftDuration(currentShift.startTime, currentShift.endTime)
        : '';
    const shiftDay = currentShift ? formatShiftDay(currentShift.startTime) : '';

    return (
        <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
            <StatusBar style="light" />
            <ImageBackgroundGradient />

            <View style={[styles.header, { paddingTop: insets.top }]}>
                <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()}
                    style={[styles.headerBtn, { backgroundColor: withAlpha(colors.text.primary, 0.06), borderColor: colors.border.default, borderWidth: 1 }]}
                >
                    <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
                </TouchableOpacity>
                <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Sleep optimizer"
                    onPress={() => router.push('/(shifts)/sleep-optimizer' as any)}
                    style={[styles.headerBtn, { backgroundColor: withAlpha(colors.accent.purple, 0.1), borderColor: withAlpha(colors.accent.purple, 0.25), borderWidth: 1 }]}
                >
                    <Ionicons name="moon-outline" size={22} color={colors.accent.purple} />
                </TouchableOpacity>
            </View>

            {isLoading ? (
                <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 150 }} showsVerticalScrollIndicator={false}>
                    {/* Title block */}
                    <Skeleton width={150} height={12} radius={borderRadius.sm} style={{ marginBottom: spacing.md }} />
                    <Skeleton width={220} height={40} radius={borderRadius.md} style={{ marginBottom: spacing.lg }} />
                    <Skeleton width="100%" height={16} radius={borderRadius.sm} style={{ marginBottom: spacing.xs }} />
                    <Skeleton width="80%" height={16} radius={borderRadius.sm} style={{ marginBottom: spacing['3xl'] }} />

                    {/* Active shift card */}
                    <Skeleton width="100%" height={236} radius={borderRadius.xl} style={{ marginBottom: spacing.lg }} />

                    {/* Action buttons */}
                    <Skeleton width="100%" height={56} radius={borderRadius.lg} style={{ marginBottom: spacing.md }} />
                    <Skeleton width="100%" height={56} radius={borderRadius.lg} />
                </ScrollView>
            ) : isError ? (
                // Full-screen error branch — rendered OUTSIDE the ScrollView, so it
                // gets its own safe-area guard: a flex:1 centering wrapper whose
                // top pad clears the header block and whose bottom pad clears the
                // home indicator (insets.bottom), so the centered EmptyState can
                // never tuck under the header notch on very tall status bars.
                <View style={[styles.fullScreenState, { paddingTop: insets.top + spacing['5xl'], paddingBottom: insets.bottom + spacing.xl }]}>
                    <EmptyState
                        icon="cloud-offline-outline"
                        title="Couldn't load your schedule"
                        subtitle="Something went wrong fetching your active shift. Check your connection and try again."
                        actionLabel="Try Again"
                        onAction={() => refetch()}
                    />
                </View>
            ) : (
                <>
                <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: currentShift ? 150 : insets.bottom + spacing['3xl'] }} showsVerticalScrollIndicator={false}>
                    <Animated.View entering={FadeInDown.delay(40).springify().damping(18).mass(0.7)}>
                        <Text style={[typography.overline, { color: colors.text.tertiary, marginBottom: spacing.sm }]}>CIRCADIAN PLANNER</Text>
                        <Text style={[typography.display, { color: colors.text.primary, marginBottom: spacing.md }]}>Your Schedule</Text>
                        <Text style={[typography.body, { color: colors.text.secondary, marginBottom: spacing['2xl'] }]}>
                            Manage your active shift block to ensure your circadian rhythm aligns perfectly with your body’s needs.
                        </Text>
                    </Animated.View>

                    {currentShift ? (
                        <>
                            {/* ── NEXT-SHIFT HERO — the VALUE (duration) dominates its
                                label; lime is reserved here as the one accent that
                                marks the active block (60/30/10). ───────────────── */}
                            <Animated.View entering={FadeInDown.delay(90).springify().damping(18).mass(0.7)}>
                            <Card variant="glass" style={[styles.shiftCard, { borderColor: withAlpha(colors.accent.coral, 0.34) }, shadows.glow(colors.accent.coral)]}>
                                <LinearGradient
                                    colors={[withAlpha(colors.accent.coral, 0.12), 'transparent']}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 1 }}
                                    style={StyleSheet.absoluteFillObject}
                                    pointerEvents="none"
                                />
                                <View style={styles.cardHeader}>
                                    <View style={[styles.iconBox, { backgroundColor: withAlpha(colors.accent.coral, 0.14), borderColor: withAlpha(colors.accent.coral, 0.3) }]}>
                                        <Ionicons name="moon" size={24} color={colors.text.secondary} />
                                    </View>
                                    <View style={{ flex: 1, marginLeft: spacing.lg }}>
                                        <Text style={[typography.overline, { color: colors.accent.coral, marginBottom: spacing.xxs }]}>Active Shift</Text>
                                        <Text style={[typography.h3, { color: colors.text.primary, textTransform: 'capitalize' }]}>{currentShift.type}</Text>
                                        <Text style={[typography.statTiny, { color: colors.text.secondary, marginTop: spacing.xs }]}>
                                            {formatShiftTime(currentShift.startTime)} - {formatShiftTime(currentShift.endTime)}
                                        </Text>
                                    </View>
                                    <Pressable hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Edit shift" onPress={() => router.push('/(modals)/log-shift' as any)} style={({ pressed }) => [styles.editBtn, { backgroundColor: withAlpha(colors.text.primary, 0.06), borderColor: colors.border.default, borderWidth: 1 }, pressed && { transform: [{ scale: 0.96 }], opacity: 0.85 }]}>
                                        <Ionicons name="create-outline" size={20} color={colors.text.secondary} />
                                    </Pressable>
                                </View>

                                {/* Momentum strip — DERIVED stats only, no new data. The
                                    big duration is the lone dominant (lime) VALUE; the
                                    start/end CLOCK times are intentionally NOT repeated
                                    here (the timeline below already carries them) so the
                                    duration reads without duplication. The supporting
                                    cell is the start WEEKDAY, which the timeline does not
                                    show — so it adds context rather than echoing it. */}
                                <View style={[styles.statStrip, { borderColor: colors.border.default, backgroundColor: withAlpha(colors.text.primary, 0.03) }]}>
                                    <View style={styles.statCell}>
                                        <Text style={[typography.statSmall, { color: colors.accent.coral }]}>{shiftDuration || '--'}</Text>
                                        <Text style={[typography.caption, { color: colors.text.tertiary, marginTop: spacing.xxs }]}>On shift</Text>
                                    </View>
                                    <View style={[styles.statDivider, { backgroundColor: colors.border.default }]} />
                                    <View style={styles.statCell}>
                                        <Text style={[typography.statSmall, { color: colors.text.primary }]}>{shiftDay || '--'}</Text>
                                        <Text style={[typography.caption, { color: colors.text.tertiary, marginTop: spacing.xxs }]}>Starts</Text>
                                    </View>
                                </View>

                                <Text style={[typography.overline, { color: colors.text.secondary, marginTop: spacing['2xl'], marginBottom: spacing.lg }]}>Today's Timeline</Text>
                                {/* Timeline node icons are deliberately ONE neutral tone
                                    (text.secondary on a faint neutral fill) rather than
                                    three separate functional accents — so the card no
                                    longer reads as amber/cyan/purple at once and lime
                                    stays the protagonist. The lone surviving accents are
                                    the two ACTIVE time VALUES (Shift Starts → cyan/success,
                                    Shift Ends → purple/calm), which mark the live events. */}
                                <View style={[styles.timelineContainer, { borderLeftColor: colors.border.light }]}>
                                    <View style={styles.timelineLine} />
                                    <View style={styles.timelineNode}>
                                        <View style={[styles.timelineDot, { backgroundColor: withAlpha(colors.text.primary, 0.06), borderColor: colors.border.default, borderWidth: 1 }]}>
                                            <Ionicons name="sunny" size={14} color={colors.text.secondary} />
                                        </View>
                                        <Text style={[typography.bodySm, { color: colors.text.primary, marginLeft: spacing.md }]}>Awake</Text>
                                    </View>
                                    <View style={styles.timelineNode}>
                                        <View style={[styles.timelineDot, { backgroundColor: withAlpha(colors.text.primary, 0.06), borderColor: colors.border.default, borderWidth: 1 }]}>
                                            <Ionicons name="briefcase" size={14} color={colors.text.secondary} />
                                        </View>
                                        <Text style={[typography.bodySm, { color: colors.text.primary, marginLeft: spacing.md }]}>Shift Starts</Text>
                                        <View style={{ flex: 1 }} />
                                        <Text style={[typography.statTiny, { color: colors.accent.cyan, fontSize: 14 }]}>{formatShiftTime(currentShift.startTime)}</Text>
                                    </View>
                                    <View style={styles.timelineNode}>
                                        <View style={[styles.timelineDot, { backgroundColor: withAlpha(colors.text.primary, 0.06), borderColor: colors.border.default, borderWidth: 1 }]}>
                                            <Ionicons name="bed" size={14} color={colors.text.secondary} />
                                        </View>
                                        <Text style={[typography.bodySm, { color: colors.text.primary, marginLeft: spacing.md }]}>Shift Ends</Text>
                                        <View style={{ flex: 1 }} />
                                        <Text style={[typography.statTiny, { color: colors.accent.purple, fontSize: 14 }]}>{formatShiftTime(currentShift.endTime)}</Text>
                                    </View>
                                </View>
                            </Card>
                            </Animated.View>

                            <Animated.View entering={FadeInDown.delay(140).springify().damping(18).mass(0.7)}>
                            <Pressable
                                accessibilityRole="button"
                                accessibilityLabel="Optimize sleep window"
                                style={({ pressed }) => [styles.optimizeBtn, { backgroundColor: withAlpha(colors.accent.purple, 0.1), borderColor: withAlpha(colors.accent.purple, 0.4) }, pressed && { transform: [{ scale: 0.96 }], opacity: 0.9 }]}
                                onPress={() => router.push('/(shifts)/sleep-optimizer' as any)}
                            >
                                <Ionicons name="analytics" size={20} color={colors.accent.purple} style={{ marginRight: spacing.sm }} />
                                <Text style={[typography.subhead, { color: colors.accent.purple, fontWeight: '700' }]}>Optimize Sleep Window</Text>
                            </Pressable>
                            </Animated.View>

                            {/* ── Mutually-exclusive generate-failure notices ──
                                Surfaced ONLY when no generation is in flight (the
                                thumb-zone CTA shows GeneratingSteps while pending)
                                and placed in the scroll body so the message sits
                                with the schedule it explains. Each surface is a
                                GlassCard (imports-design-system-folder.md — the
                                sanctioned Aurora surface; NO inline SafeBlurView /
                                coral-CTA gradient) and the two are guarded with
                                explicit `!!`-coercion so an empty-string value can
                                never leak as a raw text child (rendering-no-falsy-
                                and.md). The Upgrade action is the shared CtaButton
                                (a Pressable under the hood — ui-pressable.md). The
                                Try-again control reuses this screen's existing
                                TouchableOpacity idiom (every other tappable here is
                                a TouchableOpacity) for visual consistency, matching
                                the proven ai-planner.tsx / (meals)/planner.tsx
                                retry control. */}
                            {!!quota && !generateMutation.isPending && (
                                <GlassCard style={styles.noticeCard} glow={colors.accent.coral}>
                                    <View style={styles.noticeInner} accessibilityRole="alert">
                                        <View style={styles.noticeHeaderRow}>
                                            <Ionicons name="flash-outline" size={20} color={colors.accent.coral} style={{ marginTop: 1 }} />
                                            <View style={{ flex: 1, marginLeft: spacing.sm }}>
                                                <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: '700' }]}>Daily AI limit reached</Text>
                                                <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 2, lineHeight: 18 }]}>
                                                    {`You've used all ${quota.limit} of your ${quota.plan === 'pro' ? 'Pro' : 'free'} daily AI plans. ${formatResetsAt(quota.resetsAt)}.`}
                                                </Text>
                                            </View>
                                        </View>
                                        <CtaButton
                                            label="Upgrade"
                                            icon="sparkles"
                                            size="sm"
                                            onPress={() => router.push('/(modals)/premium' as any)}
                                            accessibilityLabel="Upgrade to remove the daily AI limit"
                                            style={{ alignSelf: 'flex-start', marginTop: spacing.md }}
                                        />
                                    </View>
                                </GlassCard>
                            )}
                            {!!genError && !generateMutation.isPending && (
                                <GlassCard style={styles.noticeCard}>
                                    <View style={styles.noticeInner} accessibilityRole="alert">
                                        <View style={styles.noticeHeaderRow}>
                                            <Ionicons name="alert-circle" size={20} color={colors.accent.red} style={{ marginTop: 1 }} />
                                            <View style={{ flex: 1, marginLeft: spacing.sm }}>
                                                <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: '700' }]}>Generation Failed</Text>
                                                <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 2, lineHeight: 18 }]}>{genError}</Text>
                                            </View>
                                        </View>
                                        <TouchableOpacity
                                            style={[styles.tryAgainBtn, { borderColor: withAlpha(colors.accent.red, 0.5) }]}
                                            onPress={runGenerate}
                                            accessibilityRole="button"
                                            accessibilityLabel="Try again"
                                            activeOpacity={0.85}
                                        >
                                            <Ionicons name="refresh" size={16} color={colors.accent.red} />
                                            <Text style={[typography.caption, { color: colors.accent.red, fontWeight: '700', marginLeft: spacing.xs }]}>Try Again</Text>
                                        </TouchableOpacity>
                                    </View>
                                </GlassCard>
                            )}

                            {/* Training around this shift — READ-ONLY inverse of
                                the calendar's create/link flow. Honest states
                                mirror the rest of the app: loading → skeletons,
                                error → retryable EmptyState, zero-data →
                                EmptyState (also the normal state while the
                                user-gated scheduled_sessions migration returns
                                []). Create/link lives on (performance)/calendar
                                — there is intentionally NO add affordance here. */}
                            <Animated.View entering={FadeInDown.delay(190).springify().damping(18).mass(0.7)}>
                            <Text style={[typography.overline, { color: colors.text.secondary, marginTop: spacing['3xl'], marginBottom: spacing.xs }]}>TRAINING</Text>
                            <Text style={[typography.h3, { color: colors.text.primary, marginBottom: spacing.md }]}>Around this shift</Text>
                            </Animated.View>
                            {linkedSessionsQuery.isLoading ? (
                                <View style={{ gap: spacing.md }}>
                                    <Skeleton width="100%" height={76} radius={borderRadius.xl} />
                                    <Skeleton width="100%" height={76} radius={borderRadius.xl} />
                                </View>
                            ) : linkedSessionsQuery.isError ? (
                                <EmptyState
                                    icon="cloud-offline-outline"
                                    title="Couldn't load sessions"
                                    subtitle="We couldn't reach the sessions linked to this shift. Check your connection and try again."
                                    actionLabel="Retry"
                                    onAction={() => linkedSessionsQuery.refetch()}
                                />
                            ) : linkedSessions.length > 0 ? (
                                <View style={{ gap: spacing.md }}>
                                    {linkedSessions.map((session, i) => (
                                        <Animated.View key={session.id} entering={FadeInDown.delay(230 + i * 45).springify().damping(18).mass(0.7)}>
                                        <Pressable
                                            accessibilityRole="button"
                                            accessibilityLabel={`Open ${session.title} on your training calendar, ${formatSessionWhen(session.scheduledAt)}`}
                                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                            onPress={() => router.push('/(performance)/calendar' as any)}
                                            style={({ pressed }) => pressed && { transform: [{ scale: 0.96 }], opacity: 0.9 }}
                                        >
                                            <Card variant="glass" padding="lg">
                                                <View style={styles.sessionRow}>
                                                    <View style={[styles.sessionIcon, { backgroundColor: withAlpha(colors.accent.cyan, 0.12), borderColor: withAlpha(colors.accent.cyan, 0.26) }]}>
                                                        <Ionicons name="barbell-outline" size={20} color={colors.accent.cyan} />
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
                                                    <Ionicons name="chevron-forward" size={18} color={colors.text.tertiary} style={styles.sessionChevron} />
                                                </View>
                                            </Card>
                                        </Pressable>
                                        </Animated.View>
                                    ))}
                                </View>
                            ) : (
                                <EmptyState
                                    icon="calendar-outline"
                                    title="No sessions linked to this shift yet"
                                    subtitle="Sessions you link to this shift on your training calendar will appear here."
                                />
                            )}
                        </>
                    ) : (
                        <EmptyState
                            icon="calendar-outline"
                            title="No Active Shift"
                            subtitle="Set up your next shift rotation to start generating circadian predictions and your AI nutrition plan."
                            actionLabel="Add Shift"
                            onAction={() => router.push('/(modals)/log-shift' as any)}
                            style={styles.emptyState}
                        />
                    )}
                </ScrollView>

                {/* ── THUMB-ZONE primary CTA — pinned to the bottom third over a
                    fade scrim so the single most-important action (generate the
                    AI nutrition plan) is always one thumb-tap away regardless of
                    scroll. Rendered OUTSIDE the ScrollView; it only mounts when a
                    shift exists (the no-shift path's Add-Shift CTA lives in the
                    EmptyState above). The pending state keeps the exact same
                    GeneratingSteps treatment; handler, a11y, disabled + busy
                    state and gradient fill are preserved verbatim. ───────────── */}
                {currentShift ? (
                    <View pointerEvents="box-none" style={[styles.footer, { paddingBottom: insets.bottom + spacing.lg }]}>
                        <LinearGradient
                            colors={['transparent', withAlpha(colors.background.primary, 0.92), colors.background.primary]}
                            style={StyleSheet.absoluteFillObject}
                            pointerEvents="none"
                        />
                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Generate AI nutrition plan"
                            accessibilityState={{ disabled: generateMutation.isPending, busy: generateMutation.isPending }}
                            disabled={generateMutation.isPending}
                            style={({ pressed }) => [styles.heroBtn, shadows.glow(colors.accent.coral), pressed && !generateMutation.isPending && { transform: [{ scale: 0.96 }] }]}
                            onPress={runGenerate}
                        >
                            <View style={styles.heroBtnGradient}>
                                <LinearGradient
                                    colors={colors.gradients.coral}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 0 }}
                                    style={StyleSheet.absoluteFillObject}
                                />
                                {generateMutation.isPending ? (
                                    <GeneratingSteps
                                        active={generateMutation.isPending}
                                        steps={NUTRITION_GEN_STEPS}
                                        color={colors.text.inverse}
                                        textColor={colors.text.inverse}
                                        showDots={false}
                                    />
                                ) : (
                                    <>
                                        <Ionicons name="restaurant" size={20} color={colors.text.inverse} style={{ marginRight: spacing.sm }} />
                                        <Text style={[typography.subhead, { color: colors.text.inverse, fontWeight: '800' }]}>Generate AI Nutrition Plan</Text>
                                    </>
                                )}
                            </View>
                        </Pressable>
                    </View>
                ) : null}
                </>
            )}
        </View>
    );
}

function ImageBackgroundGradient() {
    const { colors } = useTheme();
    return (
        <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
            <LinearGradient
                colors={[withAlpha(colors.accent.coral, 0.1), withAlpha(colors.accent.pink, 0.04), 'transparent']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ height: 360, width: '100%' }}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.xl, paddingTop: spacing['4xl'], paddingBottom: spacing.lg },
    headerBtn: {
        width: 44,
        height: 44,
        borderRadius: borderRadius.full,
        alignItems: 'center',
        justifyContent: 'center',
    },
    shiftCard: {
        padding: spacing.xl,
        marginBottom: spacing.lg,
    },
    cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xl },
    iconBox: {
        width: 52,
        height: 52,
        borderRadius: borderRadius.lg,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    editBtn: {
        width: 40,
        height: 40,
        borderRadius: borderRadius.md,
        alignItems: 'center',
        justifyContent: 'center',
    },
    // Derived momentum strip — three equal cells (duration / start / end) split
    // by hairline dividers. The duration cell carries the lone lime value so the
    // strip reads as one dominant stat with two supporting times.
    statStrip: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderRadius: borderRadius.lg,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.sm,
    },
    statCell: { flex: 1, alignItems: 'center' },
    statDivider: { width: 1, alignSelf: 'stretch', marginVertical: spacing.xs },
    timelineContainer: {
        paddingLeft: spacing.sm,
        marginLeft: spacing.lg,
        borderLeftWidth: 2,
        paddingBottom: spacing.sm,
    },
    timelineLine: { display: 'none' }, // Using borderLeft instead for simplicity
    timelineNode: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: spacing.lg,
        marginLeft: -19,
        backgroundColor: 'transparent',
    },
    timelineDot: {
        width: 32,
        height: 32,
        borderRadius: borderRadius.full,
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyState: {
        marginTop: spacing['4xl'],
    },
    // Safe-area guard for the full-screen branches rendered OUTSIDE the ScrollView
    // (currently the load-error EmptyState). flex:1 centers the state; the screen
    // supplies insets-aware top/bottom padding inline so the content clears the
    // header notch and the home indicator on tall status bars.
    fullScreenState: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    optimizeBtn: {
        flexDirection: 'row',
        height: 56,
        borderRadius: borderRadius.lg,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: spacing.lg,
    },
    // Pinned thumb-zone CTA bar. The fade scrim behind it lets the schedule
    // scroll up underneath while the action stays anchored in the bottom third.
    footer: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        paddingHorizontal: spacing.xl,
        paddingTop: spacing['4xl'],
    },
    heroBtn: {
        height: 56,
        borderRadius: borderRadius.lg,
        overflow: 'hidden',
    },
    heroBtnGradient: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
    // Generate-failure notice surfaces. The surface itself is a GlassCard (owns
    // the radius + hairline + blur + Android<12 fallback), so `noticeCard` is only
    // the outer wrapper spacing; `noticeInner` is the padded content View dropped
    // inside the blur fill (GlassCard does not pad its children). Mirrors the
    // errorCard/tryAgainBtn recipe from ai-planner.tsx / (meals)/planner.tsx,
    // re-homed onto the sanctioned glass surface for this screen.
    noticeCard: { marginTop: spacing.lg },
    noticeInner: { padding: spacing.lg },
    noticeHeaderRow: { flexDirection: 'row', alignItems: 'flex-start' },
    tryAgainBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        alignSelf: 'flex-start',
        marginTop: spacing.md,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.sm,
        borderRadius: borderRadius.full,
        borderWidth: 1.5,
    },
    // Linked-session row visual language, re-implemented locally (NOT imported
    // from (performance)/calendar) to match its session-row look: a small accent
    // icon box beside a title + formatted local "when" + optional notes.
    sessionRow: { flexDirection: 'row', alignItems: 'center' },
    sessionIcon: { width: 40, height: 40, borderRadius: borderRadius.lg, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginRight: spacing.lg },
    sessionInfo: { flex: 1 },
    // Trailing affordance hinting the row is tappable → (performance)/calendar.
    // `sessionInfo`'s flex:1 already pushes this to the row end; the marginLeft
    // is just breathing room between the text block and the chevron.
    sessionChevron: { marginLeft: spacing.md },
});
