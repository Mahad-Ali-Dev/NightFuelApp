import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useTheme, spacing as spacingTokens, borderRadius } from '@/theme';
import { withAlpha } from '@/theme/utils';
import { GlassCard } from '@/components/ui/GlassCard';
import { CtaButton } from '@/components/ui/CtaButton';
import { Skeleton, EmptyState } from '@/components/ui';
import { SleepLoggedToast } from '@/components/SleepLoggedToast';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAnalytics, log } from '@/api/sleep';
import { getCurrent } from '@/api/shifts';
import { invalidateSleep } from '@/utils/invalidateSleep';
import { computeLightPlan } from '@/lib/lightPlan';
import { computeAnchorSleep } from '@/lib/circadian/anchorSleep';
import { CircadianTimelineRow } from '@/components/CircadianTimelineRow';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';

/**
 * Format an anchor instant as a short device-local time, e.g. "11:30 PM".
 * Mirrors the helper in LightPlanCard (the canonical light-plan renderer) so the
 * sleep optimizer's Light-timing windows read identically to the dashboard card,
 * with the same Intl-less fallback for RN engines lacking full Intl.
 */
function formatLightTime(d: Date): string {
    try {
        return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    } catch {
        const h = String(d.getHours()).padStart(2, '0');
        const m = String(d.getMinutes()).padStart(2, '0');
        return `${h}:${m}`;
    }
}

/**
 * Staggered entrance for the scroll content — matches the codebase's house
 * spring (see (exercises)/analytics): a short delay ramp, springified, so cards
 * settle top-to-bottom. Transform/opacity only (Reanimated), never layout.
 */
const enter = (i: number) => FadeInDown.delay(60 + i * 45).springify().damping(18).mass(0.7);

/**
 * Caffeine cut-off lead, in hours, before the recovery-sleep opening.
 *
 * This is the screen's one new advisory offset (mirroring how `lightPlan.ts`
 * documents its single `BLUE_BLOCKER_LEAD_HOURS`): caffeine's half-life means a
 * dose within ~6h of bedtime still measurably fragments sleep, so the optimizer
 * advises a hard stop this many hours before `anchorSleep.anchor.start` (the
 * recovery-sleep opening derived locally from the current shift). It is used
 * ONLY to render a guidance time when a usable shift exists; with no shift the
 * caffeine card degrades to general copy with no fabricated window.
 */
const CAFFEINE_CUTOFF_LEAD_HOURS = 6;
const HOUR_MS = 3_600_000;

/**
 * The nightly sleep TARGET, in minutes (8h). This is the SAME 480-min reference
 * the sleep-service scores duration against (`getQuality`: durationMins / 480),
 * reused here so the hero's "last night vs. target" fill and the score agree. It
 * is the screen's honest stand-in for the mockup's sleep-stages bar: the backend
 * stores no Deep/Light/REM/Awake breakdown (sleep_sessions has only start/end/
 * quality/disturbances), so rather than fabricate stage percentages we render the
 * one duration fact we DO have — how much of the 8h target last night reached.
 */
const SLEEP_TARGET_MINS = 480;

/** Weekday initials, Sun-indexed, for the weekly chart's per-night labels. */
const WEEKDAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;

/**
 * Format a minute count as a compact "7h 12m" / "48m" duration. Empty (0 / null /
 * undefined) collapses to an em-dash so a missing night never reads "0h 0m".
 */
function formatDurationMins(mins: number | null | undefined): string {
    if (mins == null || mins <= 0) return '—';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h <= 0) return `${m}m`;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/**
 * Map a 0–100 recovery quality score to the hero's short verdict badge text —
 * the real-data analogue of the mockup's static "Good" pill. Returns null below
 * any usable score so the badge is simply omitted rather than guessing.
 */
function qualityBadge(score: number | null | undefined): string | null {
    if (score == null) return null;
    if (score >= 85) return 'Excellent';
    if (score >= 70) return 'Good';
    if (score >= 55) return 'Fair';
    if (score >= 35) return 'Light';
    return 'Poor';
}

/**
 * Parse a `chartData` entry's `YYYY-MM-DD` date to a weekday initial for the
 * weekly bar labels. Falls back to '' on a malformed date so a bad row labels
 * blank instead of crashing.
 */
function weekdayInitial(isoDate: string): string {
    const d = new Date(`${isoDate}T00:00:00`);
    const i = d.getDay();
    return Number.isNaN(i) ? '' : (WEEKDAY_INITIALS[i] ?? '');
}

/**
 * Height of the pinned "Log Rest Block" CTA footer's button (drives the
 * ScrollView's bottom clearance below). Named so the content padding is DERIVED
 * from the docked button rather than a free-floating magic number: the clearance
 * is `LOG_BTN_HEIGHT + 2× spacing.xl` on top of the safe-area inset, so the last
 * card always clears the footer and tracks the button if its height ever changes.
 */
const LOG_BTN_HEIGHT = 56;

/** Fixed pixel height of the weekly chart's plot area (bars scale within this). */
const WEEK_CHART_HEIGHT = 96;

export default function SleepOptimizerScreen() {
    const { colors, typography, spacing } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const queryClient = useQueryClient();

    // Drives the in-app peak-end success affirmation (animated check + lime
    // glow) that replaces the old blocking Alert on a successful log. Cleared by
    // the toast's own auto-hide timer via onHide.
    const [showLogged, setShowLogged] = React.useState(false);
    const hideLogged = React.useCallback(() => setShowLogged(false), []);

    // Bottom clearance for the ScrollViews: the pinned CTA footer's height plus a
    // margin above and below it, on top of the device safe-area inset. Derived
    // from LOG_BTN_HEIGHT + spacing tokens (4-pt grid) so it tracks the docked
    // button instead of a hard-coded magic number.
    const scrollBottomPad = insets.bottom + LOG_BTN_HEIGHT + spacing.xl * 2;

    const { data: analytics, isLoading, isError, refetch } = useQuery({
        queryKey: ['sleep-analytics'],
        queryFn: getAnalytics,
    });

    // The user's current shift, used to derive the Light-timing windows below.
    // Keyed ['current-shift'] to match the app's existing shift-query pattern
    // (dashboard / circadian / shift-detail all key off this), so the cache is
    // shared rather than duplicated. `getCurrent` resolves null when no shift is
    // scheduled; the Light-timing section degrades to its empty state for null.
    const {
        data: shift,
        isLoading: shiftLoading,
    } = useQuery({
        queryKey: ['current-shift'],
        queryFn: getCurrent,
    });

    const logMutation = useMutation({
        mutationFn: () => {
            const end = new Date();
            const start = new Date(end.getTime() - (8 * 60 * 60 * 1000)); // 8 hours ago
            return log({ startTime: start.toISOString(), endTime: end.toISOString() });
        },
        onSuccess: () => {
            // Refresh the full sleep cache set (Recovery-History session list +
            // analytics + dashboard ring) via the shared helper, not just
            // ['sleep-analytics'] — otherwise this quick "log 8h block" leaves the
            // log-sleep modal's Recovery-History list (['sleep-sessions']) stale.
            invalidateSleep(queryClient);
            // Peak-end reward: an in-app affirmation (animated check + lime glow)
            // instead of a blocking system Alert, paired with a success haptic.
            // Both are non-blocking; the haptic is ignored on web / unsupported.
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            setShowLogged(true);
        },
        onError: (err: any) => {
            // Error stays an Alert (the path that genuinely needs acknowledgement),
            // upgraded with an error haptic for parity with the success affirmation.
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
            Alert.alert('Error', err?.response?.data?.message ?? 'Failed to log sleep. Please try again.');
        },
    });

    // ── Light-timing plan (guarded) ──────────────────────────────────────────
    // `computeLightPlan` is a pure reuse of the shift transition math; per its
    // documented contract it THROWS on a missing / malformed ISO rather than
    // returning NaN windows. We compute it defensively here so a bad shift can
    // never crash the screen: try/catch collapses any throw to `null`, and the
    // section below treats `null` (no shift, malformed shift, or a throw) the
    // same way — it falls back to the screen's existing Skeleton (while the shift
    // query is in flight) or EmptyState (no usable shift), never a crash.
    let lightPlan: ReturnType<typeof computeLightPlan> | null = null;
    if (shift) {
        try {
            lightPlan = computeLightPlan(shift);
        } catch {
            lightPlan = null;
        }
    }

    // ── Recommended sleep block (guarded) ─────────────────────────────────────
    // The "Recommended Sleep Block" window is the fixed 4h core anchor derived
    // LOCALLY from the user's current shift via the shared, pure
    // `computeAnchorSleep` (src/lib/circadian/anchorSleep.ts) — the SAME source
    // the home dashboard's AnchorSleepCard renders, so the two stay in lockstep.
    // It is NOT read off GET /v1/sleep/analytics: the server's getAnalytics never
    // returns an `anchorSleepWindow` (it returns qualityScore / avgDuration /
    // avgQuality / sessionsLogged / circadianAlignment / chartData / summary
    // only), so the old `analytics?.anchorSleepWindow` was a phantom field that
    // left this card permanently "—". Guarded exactly like `lightPlan`:
    // `computeAnchorSleep` re-throws on a malformed ISO, so the try/catch
    // collapses any throw to `null` and the card falls back to an honest "—"
    // (no shift, malformed shift, or a throw) — never a NaN window, never a crash.
    let anchorSleep: ReturnType<typeof computeAnchorSleep> | null = null;
    if (shift) {
        try {
            anchorSleep = computeAnchorSleep(shift);
        } catch {
            anchorSleep = null;
        }
    }
    const anchorSleepWindow = anchorSleep
        ? `${formatLightTime(anchorSleep.anchor.start)} – ${formatLightTime(anchorSleep.anchor.end)}`
        : '—';

    // Caffeine cut-off — a guidance INSTANT (not a clinical window) derived from
    // the same local anchor: stop caffeine CAFFEINE_CUTOFF_LEAD_HOURS before the
    // recovery-sleep opening. Honest "—" when there's no usable shift (no anchor),
    // exactly like anchorSleepWindow; never fabricated when the shift is absent.
    const caffeineCutoff = anchorSleep
        ? formatLightTime(new Date(anchorSleep.anchor.start.getTime() - CAFFEINE_CUTOFF_LEAD_HOURS * HOUR_MS))
        : '—';

    // The hero shows a recovery summary once there's anything to show (a score or
    // a server summary). With neither — a brand-new account that has never logged
    // a sleep block — we swap it for a calm, inviting empty state rather than a
    // permanent "--" card (peak-end: the first screen shouldn't feel broken).
    const hasRecoveryData = analytics?.qualityScore != null || !!analytics?.summary;

    // ── Last night + weekly series (derived from the SAME chartData the server
    // already returns; no new fetch, no fabricated values) ────────────────────
    // chartData is up to the 7 most-recent nights, oldest→newest, each
    // { date, durationMins, quality, alignmentScore }. The last entry is "last
    // night"; the whole array drives the weekly bar chart. Defensive: tolerate a
    // missing/empty array (older payloads / brand-new accounts) → no week, and a
    // last-night duration that falls back to the average when the latest row has
    // no duration yet.
    const week = Array.isArray(analytics?.chartData) ? analytics!.chartData : [];
    const lastNight = week.length > 0 ? week[week.length - 1] : null;
    const avgDuration = typeof analytics?.avgDuration === 'number' ? analytics.avgDuration : null;
    const lastNightMins =
        lastNight && lastNight.durationMins > 0 ? lastNight.durationMins : avgDuration;
    // Fraction of the 8h target last night reached (0..1), for the hero bar.
    const targetFraction =
        lastNightMins != null ? Math.min(1, Math.max(0, lastNightMins / SLEEP_TARGET_MINS)) : 0;
    // Tallest night in the week, used to normalise the weekly bar heights. Guard
    // against an all-zero week so we never divide by zero.
    const weekMax = week.reduce((m, d) => Math.max(m, d.durationMins), 0);
    const badge = qualityBadge(analytics?.qualityScore);
    const avgQuality = typeof analytics?.avgQuality === 'number' ? analytics.avgQuality : null;

    return (
        <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background.primary }]}>
            <StatusBar style="light" />
            <View style={[styles.header, { borderBottomColor: colors.border.default }]}>
                <Pressable hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={({ pressed }) => [styles.backBtn, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }, pressed && styles.pressedScale]}>
                    <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
                </Pressable>
                <Text style={[typography.h3, { color: colors.text.primary }]}>Sleep</Text>
                {/* Date pill — the mockup's "Today" affordance. Non-interactive
                    (the screen shows the latest data); kept as chrome, not a control. */}
                <View style={[styles.datePill, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
                    <Ionicons name="moon" size={12} color={colors.accent.lime} />
                    <Text style={[typography.caption, { color: colors.text.secondary, marginLeft: spacing.xs }]}>Today</Text>
                </View>
            </View>

            {isLoading ? (
                <ScrollView contentContainerStyle={[styles.scrollContent, { padding: spacing.xl, paddingBottom: scrollBottomPad }]} showsVerticalScrollIndicator={false}>
                    {/* Hero "last night" card */}
                    <Skeleton width="100%" height={168} radius={borderRadius['2xl']} style={{ marginBottom: spacing['2xl'] }} />
                    {/* Section header */}
                    <Skeleton width={120} height={16} radius={borderRadius.sm} style={{ marginBottom: spacing.lg }} />
                    {/* Weekly chart */}
                    <Skeleton width="100%" height={160} radius={borderRadius.xl} style={{ marginBottom: spacing.xl }} />
                    {/* Tip + guidance cards */}
                    <Skeleton width="100%" height={84} radius={borderRadius.xl} style={{ marginBottom: spacing.lg }} />
                    <Skeleton width="100%" height={96} radius={borderRadius.xl} />
                </ScrollView>
            ) : isError ? (
                // Full-screen error lives OUTSIDE the inset-padded ScrollView, so it
                // supplies its own safe-area bottom inset and vertical centering —
                // otherwise its 'Try Again' action could ride into the home-indicator
                // region on devices with a notch.
                <View style={[styles.fullScreenState, { paddingBottom: insets.bottom }]}>
                    <EmptyState
                        icon="cloud-offline-outline"
                        title="Couldn't load sleep analytics"
                        subtitle="Something went wrong fetching your recovery data. Check your connection and try again."
                        actionLabel="Try Again"
                        onAction={() => refetch()}
                    />
                </View>
            ) : (
                <ScrollView contentContainerStyle={[styles.scrollContent, { padding: spacing.xl, paddingBottom: scrollBottomPad }]} showsVerticalScrollIndicator={false}>

                    {/* ── Hero: "Last night" ─────────────────────────────────────
                        The focal card. Big DURATION numeral (last-night sleep, from
                        the latest chartData row, falling back to the rolling average
                        when the newest night has no duration yet) dominates; a lime
                        verdict badge (mapped from the recovery qualityScore) and the
                        quality score sit to the right; a horizontal "vs 8h target"
                        fill anchors the bottom. NB: the backend stores no sleep-stage
                        breakdown (Deep/Light/REM/Awake), so — rather than fabricate
                        stage percentages like the static mockup — the bar shows the
                        one real duration fact we have: progress toward the 8h target.
                        With no data at all this becomes an inviting empty state. */}
                    <Animated.View entering={enter(0)}>
                        <GlassCard
                            glow={colors.accent.lime}
                            style={[styles.heroCard, { borderColor: withAlpha(colors.accent.lime, 0.3) }]}
                        >
                            <LinearGradient
                                colors={[withAlpha(colors.accent.lime, 0.14), 'transparent']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 0.6, y: 1 }}
                                style={StyleSheet.absoluteFillObject}
                                pointerEvents="none"
                            />

                            {hasRecoveryData ? (
                                <View
                                    accessible
                                    accessibilityRole="text"
                                    accessibilityLabel={`Last night: ${formatDurationMins(lastNightMins)} of sleep.${badge ? ` Recovery rated ${badge}.` : ''} Quality score ${analytics?.qualityScore ?? 0} out of 100.`}
                                >
                                    <View style={styles.heroTopRow}>
                                        <View style={styles.heroFlexShrink}>
                                            <Text style={[typography.overline, { color: colors.text.tertiary }]}>Last night</Text>
                                            {/* Big hours numeral, "Xh Ym" split so the units read
                                                muted/small against the dominant figures. */}
                                            <View style={styles.heroDurationRow}>
                                                {lastNightMins != null ? (
                                                    <>
                                                        <Text style={[typography.statLarge, styles.heroNum, { color: colors.text.primary }]}>{Math.floor(lastNightMins / 60)}</Text>
                                                        <Text style={[typography.statSmall, styles.heroUnit, { color: colors.text.tertiary }]}>h</Text>
                                                        <Text style={[typography.statLarge, styles.heroNum, { color: colors.text.primary }]}>{lastNightMins % 60}</Text>
                                                        <Text style={[typography.statSmall, styles.heroUnit, { color: colors.text.tertiary }]}>m</Text>
                                                    </>
                                                ) : (
                                                    <Text style={[typography.statLarge, styles.heroNum, { color: colors.text.primary }]}>—</Text>
                                                )}
                                            </View>
                                        </View>

                                        <View style={styles.heroRight}>
                                            {badge ? (
                                                // Calm-blue verdict badge — sleep's restful secondary accent
                                                // (matching the mockup's blue "Good" pill), so the recovery
                                                // verdict reads calm rather than the energetic brand lime.
                                                <View style={[styles.qualityBadge, { backgroundColor: withAlpha(colors.accent.blue, 0.14), borderColor: withAlpha(colors.accent.blue, 0.4) }]}>
                                                    <Text style={[typography.captionMedium, { color: colors.accent.blue }]}>{badge}</Text>
                                                </View>
                                            ) : null}
                                            {analytics?.qualityScore != null ? (
                                                <Text style={[typography.caption, styles.heroScoreLine, { color: colors.text.secondary }]}>
                                                    Score <Text style={{ color: colors.text.primary, fontWeight: '700' }}>{analytics.qualityScore}</Text>/100
                                                </Text>
                                            ) : null}
                                        </View>
                                    </View>

                                    {/* Honest duration bar — last night vs the 8h target. */}
                                    <View style={[styles.heroBarTrack, { backgroundColor: colors.background.tertiary }]}>
                                        <View
                                            style={[
                                                styles.heroBarFill,
                                                { width: `${Math.round(targetFraction * 100)}%`, backgroundColor: colors.accent.lime },
                                            ]}
                                        />
                                    </View>
                                    <View style={styles.heroLegendRow}>
                                        <View style={styles.legendItem}>
                                            <View style={[styles.legendSwatch, { backgroundColor: colors.accent.lime }]} />
                                            <Text style={[typography.caption, { color: colors.text.tertiary }]}>
                                                {formatDurationMins(lastNightMins)} logged
                                            </Text>
                                        </View>
                                        <Text style={[typography.caption, { color: colors.text.tertiary }]}>8h target</Text>
                                    </View>
                                </View>
                            ) : (
                                <View style={styles.heroEmpty}>
                                    <View style={[styles.heroEmptyIcon, { backgroundColor: withAlpha(colors.accent.lime, 0.14), borderColor: withAlpha(colors.accent.lime, 0.3) }]}>
                                        <Ionicons name="moon" size={32} color={colors.accent.lime} />
                                    </View>
                                    <Text style={[typography.h2, styles.heroEmptyTitle, { color: colors.text.primary }]}>No sleep logged yet</Text>
                                    <Text style={[typography.body, styles.heroEmptySubtitle, { color: colors.text.secondary }]}>
                                        Log your first rest block and Zeitra will start scoring your recovery and tuning your circadian plan.
                                    </Text>
                                </View>
                            )}
                        </GlassCard>
                    </Animated.View>

                    {/* ── This week: 7-night duration bar chart ──────────────────
                        Built entirely from the SAME `chartData` array the analytics
                        endpoint already returns (oldest→newest), so it's real logged
                        history, not a fabricated series. Each bar's height is its
                        night's duration normalised to the week's tallest night; the
                        most-recent night is tinted lime to match the hero. An "Avg
                        this week" footer reuses the server's `avgDuration`. Hidden
                        entirely until there's at least one night to plot. */}
                    {week.length > 0 ? (
                        <>
                            <Animated.View entering={enter(1)}>
                                <Text style={[typography.subhead, styles.sectionTitle, { color: colors.text.primary }]}>This week</Text>
                            </Animated.View>
                            <Animated.View entering={enter(2)}>
                                <GlassCard style={styles.weekCard}>
                                    <View style={styles.weekChartRow}>
                                        {week.map((d, i) => {
                                            const isLatest = i === week.length - 1;
                                            const h = weekMax > 0 ? Math.max(6, Math.round((d.durationMins / weekMax) * WEEK_CHART_HEIGHT)) : 6;
                                            return (
                                                <View key={`${d.date}-${i}`} style={styles.weekCol}>
                                                    <View
                                                        style={[
                                                            styles.weekBar,
                                                            {
                                                                height: h,
                                                                backgroundColor: isLatest ? colors.accent.lime : colors.background.quaternary,
                                                            },
                                                        ]}
                                                    />
                                                    <Text style={[typography.caption, styles.weekLabel, { color: isLatest ? colors.accent.lime : colors.text.tertiary }]}>
                                                        {weekdayInitial(d.date)}
                                                    </Text>
                                                </View>
                                            );
                                        })}
                                    </View>
                                    {avgDuration != null ? (
                                        <View style={[styles.weekFooter, { borderTopColor: colors.border.default }]}>
                                            <Text style={[typography.caption, { color: colors.text.tertiary }]}>Avg this week</Text>
                                            <Text style={[typography.captionMedium, { color: colors.text.primary }]}>{formatDurationMins(avgDuration)}</Text>
                                        </View>
                                    ) : null}
                                </GlassCard>
                            </Animated.View>
                        </>
                    ) : null}

                    {/* ── Your shift sleep window (circadian tip) ────────────────
                        The mockup's moon-stars tip card, backed by the REAL local
                        anchor-sleep window (computeAnchorSleep, the same shared
                        circadian source the dashboard renders). When there's no
                        usable shift the window is an honest "—" and the copy degrades
                        to general guidance — never a fabricated time. */}
                    {!shiftLoading && anchorSleep ? (
                        <Animated.View entering={enter(3)}>
                            {/* Calm-blue shift-window tip — sleep's restful secondary
                                accent (the mockup's blue moon-stars card), so this
                                rest-guidance card reads calm rather than brand-lime. */}
                            <GlassCard style={[styles.tipCard, { borderColor: withAlpha(colors.accent.blue, 0.3) }]}>
                                <View style={[styles.tipIcon, { backgroundColor: withAlpha(colors.accent.blue, 0.14), borderColor: withAlpha(colors.accent.blue, 0.3) }]}>
                                    <Ionicons name="moon" size={20} color={colors.accent.blue} />
                                </View>
                                <View style={styles.heroFlexShrink}>
                                    <Text style={[typography.subhead, { color: colors.text.primary }]}>Your shift sleep window</Text>
                                    <Text style={[typography.bodySm, styles.tipBody, { color: colors.text.secondary }]}>
                                        Aim for <Text style={{ color: colors.accent.blue, fontWeight: '700' }}>{anchorSleepWindow}</Text> after your shift. Keep the room dark and cool — that 4h core block anchors your clock through the rotation.
                                    </Text>
                                </View>
                            </GlassCard>
                        </Animated.View>
                    ) : null}

                    {/* ── Circadian timeline: the night, in order ───────────────
                        A calm vertical rail that sequences the post-shift recovery
                        anchor and the two light windows as ONE ordered timeline
                        (seek light → avoid light → recovery sleep). Loading →
                        Skeleton while the shift query is in flight. No usable shift
                        (none scheduled, or a malformed shift whose ISO made the pure
                        libs throw → lightPlan/anchorSleep null) → an EmptyState,
                        never a crash. The displayed windows are the guarded
                        `lightPlan` / `anchorSleep` (the SAME shared circadian sources
                        the dashboard renders), never a phantom analytics field. */}
                    <Animated.View entering={enter(4)}>
                        <Text style={[typography.overline, styles.sectionHeader, { color: colors.text.secondary }]}>Your night, in order</Text>
                    </Animated.View>

                    {shiftLoading ? (
                        <Skeleton width="100%" height={240} radius={borderRadius.xl} style={styles.timelineSkeleton} />
                    ) : !lightPlan || !anchorSleep ? (
                        <Animated.View entering={enter(5)}>
                            <GlassCard style={[styles.sectionCard, { borderColor: colors.border.default }]}>
                                <EmptyState
                                    icon="sunny-outline"
                                    title="No shift to plan around"
                                    subtitle="Log a shift and Zeitra will map your light and recovery-sleep windows onto a timeline."
                                    style={styles.timelineEmpty}
                                />
                            </GlassCard>
                        </Animated.View>
                    ) : (
                        <Animated.View entering={enter(5)}>
                            <GlassCard style={[styles.sectionCard, { borderColor: withAlpha(colors.accent.blue, 0.22) }]}>
                                <Text style={[typography.bodySm, styles.timelineIntro, { color: colors.text.tertiary }]}>
                                    Three steps across your shift — anchor alertness early, dim down, then protect your recovery sleep.
                                </Text>

                                {/* Step 1 — SEEK light early. */}
                                <CircadianTimelineRow
                                    tint={colors.accent.amber}
                                    icon="sunny"
                                    overline="Early in your shift"
                                    title="Seek light"
                                    value={`${formatLightTime(lightPlan.seekLight.start)} – ${formatLightTime(lightPlan.seekLight.end)}`}
                                    why="Bright light early anchors alertness and pushes your clock the night-worker direction."
                                />

                                {/* Step 2 — AVOID light before recovery sleep. */}
                                <CircadianTimelineRow
                                    tint={colors.accent.purple}
                                    icon="glasses-outline"
                                    overline="Before recovery sleep"
                                    title="Dim the lights"
                                    value={`${formatLightTime(lightPlan.avoidLight.start)} – ${formatLightTime(lightPlan.avoidLight.end)}`}
                                    why="Dim down or wear blue-blockers so rising melatonin isn't suppressed on the way home."
                                />

                                {/* Step 3 — the fixed 4h core recovery anchor. */}
                                <CircadianTimelineRow
                                    tint={colors.accent.blue}
                                    icon="moon"
                                    overline="After your shift"
                                    title="Recovery sleep"
                                    value={anchorSleepWindow}
                                    why="A fixed 4h core block anchored to your post-shift window. Keep the room dark and cool."
                                    isLast
                                />
                            </GlassCard>
                        </Animated.View>
                    )}

                    {/* ── Guidance: light + caffeine ────────────────────────────
                        Two calm advisory cards. The caffeine card surfaces a cut-off
                        time derived locally from the recovery anchor
                        (CAFFEINE_CUTOFF_LEAD_HOURS before sleep) when a shift exists,
                        and degrades to general copy ("—") otherwise — never a
                        fabricated window. */}
                    <Animated.View entering={enter(6)}>
                        <Text style={[typography.overline, styles.sectionHeader, { color: colors.text.secondary }]}>Guidance</Text>
                    </Animated.View>

                    <Animated.View entering={enter(7)}>
                        <GlassCard style={[styles.guidanceCard, { borderColor: withAlpha(colors.accent.amber, 0.22) }]}>
                            <View style={styles.guidanceHeader}>
                                <View style={[styles.guidanceIcon, { backgroundColor: withAlpha(colors.accent.amber, 0.14), borderColor: withAlpha(colors.accent.amber, 0.28) }]}>
                                    <Ionicons name="sunny-outline" size={18} color={colors.accent.amber} />
                                </View>
                                <Text style={[typography.subhead, styles.guidanceTitle, { color: colors.text.primary }]}>Light exposure</Text>
                            </View>
                            <Text style={[typography.bodySm, styles.guidanceBody, { color: colors.text.secondary }]}>
                                Get bright light early in the shift to stay sharp, then go dim on the commute home. Blue-blocker glasses help protect melatonin before recovery sleep.
                            </Text>
                        </GlassCard>
                    </Animated.View>

                    <Animated.View entering={enter(8)}>
                        <GlassCard style={[styles.guidanceCard, { borderColor: withAlpha(colors.accent.blue, 0.22) }]}>
                            <View style={styles.guidanceHeader}>
                                <View style={[styles.guidanceIcon, { backgroundColor: withAlpha(colors.accent.blue, 0.14), borderColor: withAlpha(colors.accent.blue, 0.28) }]}>
                                    <Ionicons name="cafe-outline" size={18} color={colors.accent.blue} />
                                </View>
                                <Text style={[typography.subhead, styles.guidanceTitle, { color: colors.text.primary }]}>Caffeine cut-off</Text>
                                <View style={styles.guidanceSpacer} />
                                <Text style={[typography.statTiny, { color: colors.accent.blue }]}>{caffeineCutoff}</Text>
                            </View>
                            <Text style={[typography.bodySm, styles.guidanceBody, { color: colors.text.secondary }]}>
                                Caffeine lingers for hours — stop about {CAFFEINE_CUTOFF_LEAD_HOURS}h before your recovery sleep so it doesn't fragment your rest.
                            </Text>
                        </GlassCard>
                    </Animated.View>

                    {avgQuality != null ? (
                        <Animated.View entering={enter(9)}>
                            <Text style={[typography.caption, styles.avgQualityNote, { color: colors.text.tertiary }]}>
                                Average quality across recent nights: {Math.round(avgQuality)}/100
                            </Text>
                        </Animated.View>
                    ) : null}

                </ScrollView>
            )}

            {/* ── Primary action (pinned thumb-zone footer) ─────────────────────
                Lifted OUT of the ScrollView so the one full-accent action lives in
                the bottom third at rest on this content-rich screen. A box-none
                wrapper (taps pass through the transparent scrim to the content
                behind), a top-fading scrim so the cards scroll up underneath, and a
                safe-area bottom inset. Only mounts in the loaded state — the loading
                Skeleton and the full-screen error own their own layouts. Now the
                sanctioned CtaButton primitive (lime fill + ink label + glow +
                pressed scale + a11y), driving the same logMutation handler / pending
                state as before. */}
            {!isLoading && !isError ? (
                <View pointerEvents="box-none" style={[styles.footer, { paddingBottom: insets.bottom + spacing.lg }]}>
                    <LinearGradient
                        colors={['transparent', withAlpha(colors.background.primary, 0.92), colors.background.primary]}
                        style={StyleSheet.absoluteFillObject}
                        pointerEvents="none"
                    />
                    <CtaButton
                        label="Log Rest Block"
                        icon="bed"
                        size="lg"
                        loading={logMutation.isPending}
                        onPress={() => logMutation.mutate()}
                        accessibilityLabel="Log rest block"
                    />
                </View>
            ) : null}

            {/* Peak-end in-app success affirmation (animated check + lime glow),
                replacing the old blocking Alert. Floats above everything; auto-hides. */}
            <SleepLoggedToast visible={showLogged} onHide={hideLogged} />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    scrollContent: { flexGrow: 1 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacingTokens.xl, paddingBottom: spacingTokens.lg, borderBottomWidth: 1 },
    backBtn: {
        width: 40,
        height: 40,
        borderRadius: borderRadius.full,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    // "Today" date pill on the right of the header (mockup affordance).
    datePill: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: spacingTokens.md,
        height: 32,
        borderRadius: borderRadius.full,
        borderWidth: 1,
    },
    // ── Hero "last night" card ───────────────────────────────────────────────
    heroCard: {
        padding: spacingTokens['2xl'],
        marginBottom: spacingTokens['2xl'],
        overflow: 'hidden',
    },
    heroTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
    heroFlexShrink: { flex: 1 },
    heroDurationRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: spacingTokens.xs },
    // Tall hero numerals sit on the baseline with the small units between them.
    heroNum: { lineHeight: 52 },
    heroUnit: { marginHorizontal: spacingTokens.xxs },
    heroRight: { alignItems: 'flex-end', marginLeft: spacingTokens.md },
    qualityBadge: {
        paddingHorizontal: spacingTokens.md,
        paddingVertical: spacingTokens.xs,
        borderRadius: borderRadius.full,
        borderWidth: 1,
    },
    heroScoreLine: { marginTop: spacingTokens.sm },
    // Horizontal "vs 8h target" fill (honest stand-in for the mockup's stage bar).
    heroBarTrack: {
        height: 14,
        borderRadius: borderRadius.sm,
        overflow: 'hidden',
        marginTop: spacingTokens.xl,
    },
    heroBarFill: { height: '100%', borderRadius: borderRadius.sm },
    heroLegendRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacingTokens.sm },
    legendItem: { flexDirection: 'row', alignItems: 'center' },
    legendSwatch: { width: 9, height: 9, borderRadius: 2, marginRight: spacingTokens.xs },
    // Hero empty state (brand-new account, no sleep ever logged).
    heroEmpty: { alignItems: 'center', paddingVertical: spacingTokens.lg },
    heroEmptyIcon: {
        width: 72,
        height: 72,
        borderRadius: borderRadius.full,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: spacingTokens.xl,
    },
    heroEmptyTitle: { textAlign: 'center' },
    heroEmptySubtitle: { textAlign: 'center', marginTop: spacingTokens.sm, maxWidth: 280 },
    // ── Weekly chart ─────────────────────────────────────────────────────────
    sectionTitle: { marginBottom: spacingTokens.lg },
    weekCard: { padding: spacingTokens.xl, marginBottom: spacingTokens['2xl'] },
    weekChartRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        height: WEEK_CHART_HEIGHT,
    },
    weekCol: { flex: 1, alignItems: 'center' },
    weekBar: { width: 18, borderRadius: borderRadius.sm },
    weekLabel: { marginTop: spacingTokens.sm },
    weekFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: spacingTokens.lg,
        paddingTop: spacingTokens.md,
        borderTopWidth: StyleSheet.hairlineWidth,
    },
    // ── Shift sleep-window tip card ──────────────────────────────────────────
    tipCard: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        padding: spacingTokens.lg,
        marginBottom: spacingTokens['2xl'],
    },
    tipIcon: {
        width: 40,
        height: 40,
        borderRadius: borderRadius.md,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: spacingTokens.md,
    },
    tipBody: { marginTop: spacingTokens.xs, lineHeight: 20 },
    // Overline header that opens a grouped section.
    sectionHeader: { marginBottom: spacingTokens.lg },
    // Generic grouped-section glass card (timeline + empty fallback).
    sectionCard: { padding: spacingTokens.xl, marginBottom: spacingTokens.xl },
    timelineIntro: { marginBottom: spacingTokens.xl },
    timelineSkeleton: { marginBottom: spacingTokens.xl },
    timelineEmpty: { paddingVertical: spacingTokens.lg },
    // Light / caffeine guidance cards.
    guidanceCard: { padding: spacingTokens.lg, marginBottom: spacingTokens.lg },
    guidanceHeader: { flexDirection: 'row', alignItems: 'center' },
    guidanceIcon: {
        width: 36,
        height: 36,
        borderRadius: borderRadius.md,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    guidanceTitle: { marginLeft: spacingTokens.md },
    guidanceSpacer: { flex: 1 },
    guidanceBody: { marginTop: spacingTokens.md },
    avgQualityNote: { textAlign: 'center', marginTop: spacingTokens.sm },
    // Shared pressed-scale for the hand-rolled back button. Transform/opacity only.
    pressedScale: { transform: [{ scale: 0.96 }] },
    // Safe-area guard for the full-screen error EmptyState rendered OUTSIDE the
    // inset-padded ScrollView: flex:1 centers it; the screen supplies the bottom
    // inset inline so 'Try Again' clears the home indicator.
    fullScreenState: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    // Pinned thumb-zone CTA bar. The top-fading scrim behind it lets the content
    // scroll up underneath while the action stays anchored in the bottom third.
    footer: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        paddingHorizontal: spacingTokens.xl,
        paddingTop: spacingTokens['4xl'],
    },
});
