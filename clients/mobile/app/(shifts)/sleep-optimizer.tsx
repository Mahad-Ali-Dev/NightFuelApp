import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Alert } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useTheme, spacing as spacingTokens, borderRadius } from '@/theme';
import { withAlpha } from '@/theme/utils';
import { GlassCard } from '@/components/ui/GlassCard';
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
import { CircularProgress } from '@/components/ui/CircularProgress';
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
 * Height of the pinned "Log Rest Block" CTA (must match `styles.logBtn.height`).
 * Named so the ScrollView's bottom clearance is DERIVED from the docked button
 * rather than a free-floating magic number: the content padding below is
 * `LOG_BTN_HEIGHT + 2× spacing.xl` (a margin above the button and below it),
 * on top of the safe-area inset, so the last card always clears the footer and
 * the clearance tracks the button if its height ever changes.
 */
const LOG_BTN_HEIGHT = 56;

export default function SleepOptimizerScreen() {
    const { colors, typography, spacing, shadows } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const queryClient = useQueryClient();

    // Drives the in-app peak-end success affirmation (animated check + purple
    // glow) that replaces the old blocking Alert on a successful log. Cleared by
    // the toast's own auto-hide timer via onHide.
    const [showLogged, setShowLogged] = React.useState(false);
    const hideLogged = React.useCallback(() => setShowLogged(false), []);

    // Bottom clearance for the ScrollViews: the pinned CTA footer's height plus a
    // margin above and below it, on top of the device safe-area inset. Derived
    // from LOG_BTN_HEIGHT + spacing tokens (8-pt grid) so it tracks the docked
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
            // Peak-end reward: an in-app affirmation (animated check + purple glow)
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

    // The hero shows a recovery RING once there's anything to show (a score or a
    // server summary). With neither — a brand-new account that has never logged a
    // sleep block — we swap the ring for a calm, inviting empty state rather than
    // a permanent "--" ring (peak-end: the first screen shouldn't feel broken).
    const hasRecoveryData = analytics?.qualityScore != null || !!analytics?.summary;

    // Optional secondary recovery stats from the analytics payload (present once
    // sessions exist). Rendered value-dominant beneath the ring; each is omitted
    // individually when the server hasn't computed it yet, so the strip never
    // shows a bare "—".
    const avgDuration = typeof analytics?.avgDuration === 'number' ? analytics.avgDuration : null;
    const avgQuality = typeof analytics?.avgQuality === 'number' ? analytics.avgQuality : null;

    return (
        <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background.primary }]}>
            <StatusBar style="light" />
            <View style={[styles.header, { borderBottomColor: colors.border.default }]}>
                <Pressable hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={({ pressed }) => [styles.backBtn, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }, pressed && styles.pressedScale]}>
                    <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
                </Pressable>
                <Text style={[typography.h3, { color: colors.text.primary }]}>Sleep Optimizer</Text>
                <View style={{ width: 40 }} />
            </View>

            {isLoading ? (
                <ScrollView contentContainerStyle={[styles.scrollContent, { padding: spacing.xl, paddingBottom: scrollBottomPad }]} showsVerticalScrollIndicator={false}>
                    {/* Hero score card */}
                    <View style={{ alignItems: 'center', marginBottom: spacing['3xl'] }}>
                        <Skeleton width={150} height={150} radius={borderRadius.full} style={{ marginVertical: spacing.xl }} />
                        <Skeleton width="90%" height={14} radius={borderRadius.sm} style={{ marginBottom: spacing.sm }} />
                        <Skeleton width="70%" height={14} radius={borderRadius.sm} />
                    </View>
                    {/* Section header */}
                    <Skeleton width={180} height={16} radius={borderRadius.sm} style={{ marginBottom: spacing.lg }} />
                    {/* Timeline */}
                    <Skeleton width="100%" height={240} radius={borderRadius.xl} style={{ marginBottom: spacing.xl }} />
                    {/* Guidance cards */}
                    <Skeleton width="100%" height={96} radius={borderRadius.xl} style={{ marginBottom: spacing.lg }} />
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

                    {/* ── Hero: recovery ring (calm purple) ─────────────────────
                        The focal value of the screen. The big numeral dominates its
                        QUALITY label. When there's nothing yet (no score AND no
                        server summary), this becomes an inviting empty state instead
                        of a permanent "--" ring. */}
                    <Animated.View entering={enter(0)}>
                        <GlassCard
                            glow={colors.accent.purple}
                            style={[
                                styles.heroCard,
                                { borderColor: withAlpha(colors.accent.purple, 0.3) },
                            ]}
                        >
                            <LinearGradient
                                colors={[withAlpha(colors.accent.purple, 0.16), 'transparent']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 0, y: 1 }}
                                style={StyleSheet.absoluteFillObject}
                                pointerEvents="none"
                            />

                            {hasRecoveryData ? (
                                <>
                                    {/* The focal metric, announced as ONE coherent unit. The
                                        decorative ring + the score numeral + 'QUALITY' overline
                                        + summary are separate Text nodes, so without `accessible`
                                        a screen reader reads disjoint fragments ("82", "QUALITY",
                                        …) and the CircularProgress conveys no value. Collapsing
                                        them under one labelled node fixes both. */}
                                    <View
                                        accessible
                                        accessibilityRole="text"
                                        accessibilityLabel={`Sleep quality score: ${analytics?.qualityScore ?? 0} out of 100. ${analytics?.summary ?? 'Log a sleep block to see your recovery analytics.'}`}
                                        style={styles.heroScoreBlock}
                                    >
                                        <Text style={[typography.overline, { color: colors.accent.purple, marginBottom: spacing.xl }]}>Sleep Quality Score</Text>
                                        <View style={styles.heroSection}>
                                            <View style={shadows.glow(colors.accent.purple)}>
                                                <CircularProgress progress={(analytics?.qualityScore ?? 0) / 100} size={150} strokeWidth={12} color={colors.accent.purple} trackColor={colors.background.tertiary} />
                                            </View>
                                            <View style={styles.heroTextOverlay}>
                                                <Text style={[typography.statLarge, { color: colors.text.primary }]}>{analytics?.qualityScore ?? '--'}</Text>
                                                <Text style={[typography.overline, { color: colors.accent.purple, marginTop: spacing.xs }]}>QUALITY</Text>
                                            </View>
                                        </View>

                                        <Text style={[typography.body, styles.heroSummary, { color: colors.text.secondary }]}>
                                            {analytics?.summary ?? 'Log a sleep block to see your recovery analytics.'}
                                        </Text>
                                    </View>

                                    {/* Secondary recovery stats — value over label, only
                                        when the server has computed them. */}
                                    {avgDuration != null || avgQuality != null ? (
                                        <View style={[styles.statStrip, { borderTopColor: colors.border.default }]}>
                                            {avgDuration != null ? (
                                                <View style={styles.statCell}>
                                                    <Text style={[typography.statSmall, { color: colors.text.primary }]}>{avgDuration.toFixed(1)}</Text>
                                                    <Text style={[typography.overline, styles.statLabel, { color: colors.text.tertiary }]}>Avg hrs</Text>
                                                </View>
                                            ) : null}
                                            {avgDuration != null && avgQuality != null ? (
                                                <View style={[styles.statSep, { backgroundColor: colors.border.default }]} />
                                            ) : null}
                                            {avgQuality != null ? (
                                                <View style={styles.statCell}>
                                                    <Text style={[typography.statSmall, { color: colors.text.primary }]}>{Math.round(avgQuality)}</Text>
                                                    <Text style={[typography.overline, styles.statLabel, { color: colors.text.tertiary }]}>Avg quality</Text>
                                                </View>
                                            ) : null}
                                        </View>
                                    ) : null}
                                </>
                            ) : (
                                <View style={styles.heroEmpty}>
                                    <View style={[styles.heroEmptyIcon, { backgroundColor: withAlpha(colors.accent.purple, 0.14), borderColor: withAlpha(colors.accent.purple, 0.3) }]}>
                                        <Ionicons name="moon" size={32} color={colors.accent.purple} />
                                    </View>
                                    <Text style={[typography.h2, styles.heroEmptyTitle, { color: colors.text.primary }]}>No recovery data yet</Text>
                                    <Text style={[typography.body, styles.heroEmptySubtitle, { color: colors.text.secondary }]}>
                                        Log your first rest block and Zeitra will start scoring your recovery and tuning your circadian plan.
                                    </Text>
                                </View>
                            )}
                        </GlassCard>
                    </Animated.View>

                    {/* ── Circadian timeline: the night, in order ───────────────
                        A calm vertical rail that sequences the post-shift recovery
                        anchor and the two light windows as ONE ordered timeline
                        (seek light → avoid light → recovery sleep), instead of
                        scattered cards. Each node's TIME is the dominant value.

                        Loading → Skeleton while the shift query is in flight.
                        No usable shift (none scheduled, or a malformed shift whose
                        ISO made the pure libs throw → lightPlan/anchorSleep null) →
                        an EmptyState, never a crash. The displayed windows are the
                        guarded `lightPlan` / `anchorSleep` computed above (the SAME
                        shared circadian sources the dashboard renders), never a
                        phantom GET /v1/sleep/analytics field.

                        react-native-skills applied here:
                        • js-hoist-intl: every time renders through the module-scope
                          `formatLightTime` — no per-render Intl formatter.
                        • rendering-no-falsy-and: the section is chosen with
                          ternaries resolving to a component or `null`, so a falsy
                          never leaks into the tree as text.
                        • scroll-position-no-state: additive ScrollView content only;
                          no onScroll / scroll position is tracked in state.
                        • list-performance-inline-objects: repeated row styles live
                          in StyleSheet / the memoized CircadianTimelineRow, not
                          rebuilt inline each render. */}
                    <Animated.View entering={enter(1)}>
                        <Text style={[typography.overline, styles.sectionHeader, { color: colors.text.secondary }]}>Your night, in order</Text>
                    </Animated.View>

                    {shiftLoading ? (
                        <Skeleton width="100%" height={240} radius={borderRadius.xl} style={styles.timelineSkeleton} />
                    ) : !lightPlan || !anchorSleep ? (
                        <Animated.View entering={enter(2)}>
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
                        <Animated.View entering={enter(2)}>
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
                    <Animated.View entering={enter(3)}>
                        <Text style={[typography.overline, styles.sectionHeader, { color: colors.text.secondary }]}>Guidance</Text>
                    </Animated.View>

                    <Animated.View entering={enter(4)}>
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

                    <Animated.View entering={enter(5)}>
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

                </ScrollView>
            )}

            {/* ── Primary action (pinned thumb-zone footer) ─────────────────────
                Lifted OUT of the ScrollView so the one full-accent action lives in
                the bottom third at rest on this content-rich screen, instead of
                sitting below the fold. Mirrors (shifts)/index.tsx: a box-none
                wrapper (taps pass through the transparent scrim to the content
                behind), a top-fading scrim so the cards scroll up underneath, and a
                safe-area bottom inset. Only mounts in the loaded state — the loading
                Skeleton and the full-screen error own their own layouts. Purple
                gradient + handler / a11y / pending state preserved verbatim; the
                Pressable adds the mandated pressed-scale 0.96. */}
            {!isLoading && !isError ? (
                <View pointerEvents="box-none" style={[styles.footer, { paddingBottom: insets.bottom + spacing.lg }]}>
                    <LinearGradient
                        colors={['transparent', withAlpha(colors.background.primary, 0.92), colors.background.primary]}
                        style={StyleSheet.absoluteFillObject}
                        pointerEvents="none"
                    />
                    <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Log rest block"
                        accessibilityState={{ disabled: logMutation.isPending, busy: logMutation.isPending }}
                        style={({ pressed }) => [styles.logBtn, shadows.glow(colors.accent.purple), pressed && !logMutation.isPending && styles.pressedScale]}
                        onPress={() => logMutation.mutate()}
                        disabled={logMutation.isPending}
                    >
                        <LinearGradient
                            colors={colors.gradients.purple}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.logBtnGradient}
                        >
                            {logMutation.isPending ? (
                                <ActivityIndicator color={colors.text.primary} />
                            ) : (
                                <>
                                    <Ionicons name="bed" size={20} color={colors.text.primary} style={{ marginRight: spacing.sm }} />
                                    <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: '700' }]}>Log Rest Block</Text>
                                </>
                            )}
                        </LinearGradient>
                    </Pressable>
                </View>
            ) : null}

            {/* Peak-end in-app success affirmation (animated check + purple glow),
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
    heroCard: {
        alignItems: 'center',
        padding: spacingTokens['2xl'],
        marginBottom: spacingTokens['3xl'],
        overflow: 'hidden',
    },
    // Accessible wrapper that groups the overline + ring + numeral + summary into
    // one screen-reader unit. alignSelf:'stretch' + centered children preserve the
    // original centered hero layout the GlassCard supplied.
    heroScoreBlock: { alignSelf: 'stretch', alignItems: 'center' },
    heroSection: { alignItems: 'center', justifyContent: 'center' },
    heroTextOverlay: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
    heroSummary: {
        textAlign: 'center',
        marginTop: spacingTokens.xl,
        marginHorizontal: spacingTokens.sm,
    },
    // Secondary recovery-stat strip beneath the ring (avg hrs / avg quality).
    statStrip: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        alignSelf: 'stretch',
        marginTop: spacingTokens.xl,
        paddingTop: spacingTokens.lg,
        borderTopWidth: StyleSheet.hairlineWidth,
    },
    statCell: { flex: 1, alignItems: 'center' },
    statLabel: { marginTop: spacingTokens.xs },
    statSep: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', marginVertical: spacingTokens.xs },
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
    // Pinned thumb-zone CTA. Height pinned to LOG_BTN_HEIGHT so the ScrollView's
    // derived bottom clearance always matches; no marginTop now that it's the
    // footer's sole child (the footer owns the surrounding spacing).
    logBtn: {
        height: LOG_BTN_HEIGHT,
        borderRadius: borderRadius.full,
        overflow: 'hidden',
    },
    logBtnGradient: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
    // Shared pressed-scale for the hand-rolled controls (back button + CTA),
    // matching the Button primitive's spring-press. Transform/opacity only.
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
