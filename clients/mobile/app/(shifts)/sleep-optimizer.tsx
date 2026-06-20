import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useTheme, spacing as spacingTokens, borderRadius } from '@/theme';
import { withAlpha } from '@/theme/utils';
import { GlassCard } from '@/components/ui/GlassCard';
import { Skeleton, EmptyState } from '@/components/ui';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAnalytics, log } from '@/api/sleep';
import { getCurrent } from '@/api/shifts';
import { computeLightPlan } from '@/lib/lightPlan';
import { CircularProgress } from '@/components/ui/CircularProgress';
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

export default function SleepOptimizerScreen() {
    const { colors, typography, spacing, shadows } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const queryClient = useQueryClient();

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
            queryClient.invalidateQueries({ queryKey: ['sleep-analytics'] });
            Alert.alert('Sleep Logged', 'Your sleep block has been recorded successfully.');
        },
        onError: (err: any) => {
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

    return (
        <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background.primary }]}>
            <StatusBar style="light" />
            <View style={[styles.header, { borderBottomColor: colors.border.default }]}>
                <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
                    <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
                </TouchableOpacity>
                <Text style={[typography.h3, { color: colors.text.primary }]}>Sleep Optimizer</Text>
                <View style={{ width: 40 }} />
            </View>

            {isLoading ? (
                <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
                    {/* Hero score card */}
                    <View style={{ alignItems: 'center', marginBottom: spacing['3xl'] }}>
                        <Skeleton width={140} height={140} radius={borderRadius.full} style={{ marginVertical: spacing.xl }} />
                        <Skeleton width="90%" height={14} radius={borderRadius.sm} style={{ marginBottom: spacing.sm }} />
                        <Skeleton width="70%" height={14} radius={borderRadius.sm} />
                    </View>
                    {/* Section header */}
                    <Skeleton width={180} height={16} radius={borderRadius.sm} style={{ marginBottom: spacing.lg }} />
                    {/* Window cards */}
                    <Skeleton width="100%" height={96} radius={borderRadius.xl} style={{ marginBottom: spacing.lg }} />
                    <Skeleton width="100%" height={96} radius={borderRadius.xl} style={{ marginBottom: spacing.lg }} />
                    {/* Log button */}
                    <Skeleton width="100%" height={56} radius={borderRadius.full} />
                </ScrollView>
            ) : isError ? (
                <EmptyState
                    icon="cloud-offline-outline"
                    title="Couldn't load sleep analytics"
                    subtitle="Something went wrong fetching your recovery data. Check your connection and try again."
                    actionLabel="Try Again"
                    onAction={() => refetch()}
                />
            ) : (
                <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>

                    {/* Hero Score */}
                    <GlassCard
                        glow={colors.accent.purple}
                        style={[
                            styles.heroCard,
                            { borderColor: withAlpha(colors.accent.purple, 0.3) },
                        ]}
                    >
                        <LinearGradient
                            colors={[withAlpha(colors.accent.purple, 0.14), 'transparent']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 0, y: 1 }}
                            style={StyleSheet.absoluteFillObject}
                            pointerEvents="none"
                        />
                        <Text style={[typography.overline, { color: colors.accent.purple, marginBottom: spacing.xl }]}>Sleep Quality Score</Text>
                        <View style={styles.heroSection}>
                            <View style={shadows.glow(colors.accent.purple)}>
                                <CircularProgress progress={(analytics?.qualityScore ?? 0) / 100} size={140} strokeWidth={12} color={colors.accent.purple} trackColor={colors.background.tertiary} />
                            </View>
                            <View style={styles.heroTextOverlay}>
                                <Text style={[typography.statLarge, { color: colors.text.primary }]}>{analytics?.qualityScore ?? '--'}</Text>
                                <Text style={[typography.overline, { color: colors.accent.purple, marginTop: spacing.xs }]}>QUALITY</Text>
                            </View>
                        </View>

                        <Text style={[typography.body, { color: colors.text.secondary, textAlign: 'center', marginTop: spacing.xl, marginHorizontal: spacing.sm }]}>
                            {analytics?.summary ?? 'Log a sleep block to see your recovery analytics.'}
                        </Text>
                    </GlassCard>

                    {/* Recommendations */}
                    <Text style={[typography.overline, { color: colors.text.secondary, marginBottom: spacing.lg }]}>Recommended Windows</Text>

                    <GlassCard style={[styles.windowCard, { borderColor: withAlpha(colors.accent.purple, 0.25) }]}>
                        <View style={styles.windowHeader}>
                            <View style={[styles.windowIcon, { backgroundColor: withAlpha(colors.accent.purple, 0.14), borderColor: withAlpha(colors.accent.purple, 0.28), borderWidth: 1 }]}>
                                <Ionicons name="moon" size={18} color={colors.accent.purple} />
                            </View>
                            <Text style={[typography.subhead, { color: colors.text.primary, marginLeft: spacing.md }]}>Anchor Sleep</Text>
                            <View style={{ flex: 1 }} />
                            <Text style={[typography.statTiny, { color: colors.accent.cyan }]}>{analytics?.anchorSleepWindow ?? '—'}</Text>
                        </View>
                        <Text style={[typography.bodySm, { color: colors.text.secondary, marginTop: spacing.md }]}>Total darkness required. Avoid light exposure upon shift exit.</Text>
                    </GlassCard>

                    <GlassCard style={[styles.windowCard, { borderColor: withAlpha(colors.accent.amber, 0.25) }]}>
                        <View style={styles.windowHeader}>
                            <View style={[styles.windowIcon, { backgroundColor: withAlpha(colors.accent.amber, 0.14), borderColor: withAlpha(colors.accent.amber, 0.28), borderWidth: 1 }]}>
                                <Ionicons name="battery-charging" size={18} color={colors.accent.amber} />
                            </View>
                            <Text style={[typography.subhead, { color: colors.text.primary, marginLeft: spacing.md }]}>Pre-Shift Nap</Text>
                            <View style={{ flex: 1 }} />
                            <Text style={[typography.statTiny, { color: colors.accent.amber }]}>{analytics?.preShiftNapWindow ?? '—'}</Text>
                        </View>
                        <Text style={[typography.bodySm, { color: colors.text.secondary, marginTop: spacing.md }]}>90-minute cycle to top off cognitive alertness before shift.</Text>
                    </GlassCard>

                    {/* Light timing — a seek→avoid light-exposure PLAN derived from
                        the user's current shift via the pure computeLightPlan reuse.
                        Two windows framed as an in-order timeline (anchor early →
                        dim before recovery sleep), each carrying an explicit WHY
                        line under its window. Falls back to the screen's Skeleton
                        while the shift query is loading, and to an EmptyState when
                        there's no usable shift (none scheduled, or a malformed shift
                        whose ISO made computeLightPlan throw) — never a crash.

                        react-native-skills applied here (see the diff notes):
                        • js-hoist-intl: every time is rendered through the existing
                          module-scope `formatLightTime` helper — we do NOT create a
                          per-render Intl formatter or duplicate the Intl logic.
                        • rendering-no-falsy-and: the section is selected with
                          ternaries that resolve to a component or `null` (never a
                          bare `value && <JSX/>` over a possibly-falsy value), so a
                          falsy never leaks into the tree as text.
                        • scroll-position-no-state: this is additive ScrollView
                          content only — no onScroll / scroll position is tracked in
                          state. • list-performance-inline-objects: new repeated
                          styles are hoisted into StyleSheet.create rather than
                          rebuilt as inline objects on each render. */}
                    <Text style={[typography.overline, { color: colors.text.secondary, marginTop: spacing.xl, marginBottom: spacing.lg }]}>Light Timing</Text>

                    {shiftLoading ? (
                        <Skeleton width="100%" height={200} radius={borderRadius.xl} style={styles.lightSkeleton} />
                    ) : !lightPlan ? (
                        <GlassCard style={[styles.windowCard, { borderColor: colors.border.default }]}>
                            <EmptyState
                                icon="sunny-outline"
                                title="No shift to plan light around"
                                subtitle="Log a shift to see when to seek and avoid light."
                                style={styles.lightEmpty}
                            />
                        </GlassCard>
                    ) : (
                        <GlassCard style={[styles.windowCard, { borderColor: withAlpha(colors.accent.amber, 0.25) }]}>
                            {/* Timeline framing: this card is a two-step plan read
                                top-to-bottom — anchor early, then dim before sleep. */}
                            <Text style={[typography.overline, { color: colors.accent.amber }]}>Your light plan, in order</Text>
                            <Text style={[typography.caption, styles.lightIntro, { color: colors.text.tertiary }]}>
                                Two windows across your shift — anchor alertness early, then protect your recovery sleep.
                            </Text>

                            {/* Step 1 — SEEK light early in the shift. */}
                            <View style={styles.windowHeader}>
                                <View style={[styles.windowIcon, styles.windowIconBorder, { backgroundColor: withAlpha(colors.accent.amber, 0.14), borderColor: withAlpha(colors.accent.amber, 0.28) }]}>
                                    <Ionicons name="sunny" size={18} color={colors.accent.amber} />
                                </View>
                                <Text style={[typography.subhead, styles.windowTitle, { color: colors.text.primary }]}>Seek Light</Text>
                                <View style={styles.windowSpacer} />
                                <Text style={[typography.statTiny, { color: colors.accent.amber }]}>
                                    {`${formatLightTime(lightPlan.seekLight.start)} – ${formatLightTime(lightPlan.seekLight.end)}`}
                                </Text>
                            </View>
                            <Text style={[typography.overline, styles.windowWhen, { color: colors.text.tertiary }]}>Early in your shift</Text>
                            <Text style={[typography.bodySm, styles.windowWhy, { color: colors.text.secondary }]}>
                                Bright light early in your shift anchors alertness and pushes your clock the night-worker direction.
                            </Text>

                            <View style={[styles.lightDivider, { backgroundColor: colors.border.default }]} />

                            {/* Step 2 — AVOID light before the recovery sleep. */}
                            <View style={styles.windowHeader}>
                                <View style={[styles.windowIcon, styles.windowIconBorder, { backgroundColor: withAlpha(colors.accent.purple, 0.14), borderColor: withAlpha(colors.accent.purple, 0.28) }]}>
                                    <Ionicons name="glasses-outline" size={18} color={colors.accent.purple} />
                                </View>
                                <Text style={[typography.subhead, styles.windowTitle, { color: colors.text.primary }]}>Avoid Light</Text>
                                <View style={styles.windowSpacer} />
                                <Text style={[typography.statTiny, { color: colors.accent.purple }]}>
                                    {`${formatLightTime(lightPlan.avoidLight.start)} – ${formatLightTime(lightPlan.avoidLight.end)}`}
                                </Text>
                            </View>
                            <Text style={[typography.overline, styles.windowWhen, { color: colors.text.tertiary }]}>Before recovery sleep</Text>
                            <Text style={[typography.bodySm, styles.windowWhy, { color: colors.text.secondary }]}>
                                Dim down / wear blue-blockers so rising melatonin isn't suppressed before recovery sleep.
                            </Text>
                        </GlassCard>
                    )}

                    <TouchableOpacity
                        activeOpacity={0.85}
                        accessibilityRole="button"
                        accessibilityLabel="Log rest block"
                        accessibilityState={{ disabled: logMutation.isPending, busy: logMutation.isPending }}
                        style={[styles.logBtn, shadows.glow(colors.accent.purple)]}
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
                    </TouchableOpacity>

                </ScrollView>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
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
    heroSection: { alignItems: 'center', justifyContent: 'center' },
    heroTextOverlay: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
    windowCard: { padding: spacingTokens.lg, marginBottom: spacingTokens.lg },
    windowHeader: { flexDirection: 'row', alignItems: 'center' },
    windowIcon: {
        width: 36,
        height: 36,
        borderRadius: borderRadius.md,
        alignItems: 'center',
        justifyContent: 'center',
    },
    // The tinted icon chips in the Light-timing rows carry a 1px ring; hoisted
    // here (per list-performance-inline-objects) so the borderWidth isn't a fresh
    // inline object on each render — only the per-tint color is merged inline.
    windowIconBorder: { borderWidth: 1 },
    // Static layout fragments for the Light-timing rows, hoisted out of render so
    // the seek/avoid rows reuse stable style references instead of rebuilding
    // inline objects (list-performance-inline-objects).
    windowTitle: { marginLeft: spacingTokens.md },
    windowSpacer: { flex: 1 },
    // The "in order" framing caption under the card's plan heading.
    lightIntro: { marginTop: spacingTokens.xs, marginBottom: spacingTokens.lg },
    // The per-row "when" tag (e.g. "Early in your shift") above each WHY line.
    windowWhen: { marginTop: spacingTokens.md },
    // The explicit WHY line under each window (alertness-anchoring / melatonin).
    windowWhy: { marginTop: spacingTokens.xs },
    // The shift-loading placeholder for the (now richer) Light-timing plan card.
    lightSkeleton: { marginBottom: spacingTokens.lg },
    // Hairline separator between the two light windows inside the Light-timing card.
    lightDivider: {
        height: StyleSheet.hairlineWidth,
        marginVertical: spacingTokens.lg,
        opacity: 0.6,
    },
    // Trim the EmptyState's default vertical padding so the no-shift fallback sits
    // comfortably inside the Light-timing card rather than ballooning its height.
    lightEmpty: {
        paddingVertical: spacingTokens.lg,
    },
    logBtn: {
        height: 56,
        borderRadius: borderRadius.full,
        marginTop: spacingTokens.lg,
        overflow: 'hidden',
    },
    logBtnGradient: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
});
