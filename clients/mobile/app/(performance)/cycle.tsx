import React, { useRef, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';

import { useTheme } from '@/theme';
import { EmptyState, Skeleton, CtaButton } from '@/components/ui';
import { withAlpha } from '@/theme/utils';
import { CyclePhaseHero } from '@/components/cycle/CyclePhaseHero';
import { PhaseRecommendationCards } from '@/components/cycle/PhaseRecommendationCards';
import { CyclePhaseCard } from '@/components/CyclePhaseCard';
import { CycleCalendar } from '@/components/cycle/CycleCalendar';
import { CycleHistoryCard } from '@/components/cycle/CycleHistoryCard';
import { PhaseFoodsCard } from '@/components/cycle/PhaseFoodsCard';
import { LogPeriodCard } from '@/components/cycle/LogPeriodCard';
import { MedicalDisclaimerBanner } from '@/components/MedicalDisclaimer';
import { getMyProfile, getStatus, updateProfile } from '@/api/profile';
import { getCycleForecast, getCycleHistory } from '@/api/cycle';

// Coral period/cycle accent for this screen (the brand `accent.coral` token
// resolves to LIME post-rebrand, so coral is an explicit literal here).
const CORAL = '#FF7A90';
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Parse a 'YYYY-MM-DD' to UTC-midnight ms, or null if malformed. Matches the
 *  server's UTC date-only math so derived day counts never drift by a TZ. */
function isoToUtcMs(iso: string | null | undefined): number | null {
    if (!iso) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!m) return null;
    const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return Number.isNaN(ms) ? null : ms;
}

/** Today at UTC midnight (ms) — the reference "now" for all derived counts. */
function todayUtcMs(): number {
    const n = new Date();
    return Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate());
}

/**
 * Cycle screen (F28) — the dedicated home for the menstrual-cycle tracker.
 *
 * Hosts (in order): the phase card (reused CyclePhaseCard), the month CALENDAR
 * (logged-vs-predicted, confidence-aware), the LOG PERIOD action, and the cycle
 * HISTORY. Always shows the "wellness estimate, not medical advice" disclaimer.
 *
 * CONSENT / ELIGIBILITY GATE: this whole feature is hidden for users who have NOT
 * enabled cycle tracking or are not female. We read those from the profile
 * (GET /v1/users/me: cycleTrackingEnabled + biologicalSex). A non-tracking /
 * non-female user who somehow lands here sees a neutral "not enabled" empty
 * state — never the calendar / log / history UI. The Profile tab only LINKS here
 * when the same gate passes, so they never see the entry point either.
 *
 * VISUAL TREATMENT: CALM + phase-aware. A phase-tinted hero (CyclePhaseHero)
 * crowns the screen and re-tints the surface by phase (red / cyan / purple /
 * amber), with brand lime held back to the faintest tint — this is a sensitive,
 * lower-contrast space. Sections cascade in with the house staggered FadeInDown
 * spring on mount.
 */

// House entrance recipe — staggered FadeInDown spring, matching the rest of the
// performance stack (body-metrics.tsx / calendar.tsx). `i` indexes the stagger.
const enter = (i: number) => FadeInDown.delay(70 + i * 50).springify().damping(18).mass(0.7);

export default function CycleScreen() {
    const { colors, typography, spacing } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();

    // Thumb-zone shortcut → the Log Period action. The card below owns the form +
    // mutation; this persistent anchor just brings it into view on first tap so
    // the screen's core verb ("log a period") is always reachable in the bottom
    // third without a long scroll. We measure the card's Y inside the ScrollView
    // and scroll to it (never duplicating the card's mutation/handlers).
    const scrollRef = useRef<ScrollView>(null);
    const logCardY = useRef(0);
    const onLogCardLayout = useCallback((e: { nativeEvent: { layout: { y: number } } }) => {
        logCardY.current = e.nativeEvent.layout.y;
    }, []);
    const scrollToLog = useCallback(() => {
        scrollRef.current?.scrollTo({ y: Math.max(logCardY.current - 12, 0), animated: true });
    }, []);

    const profileQuery = useQuery({ queryKey: ['my-profile'], queryFn: getMyProfile });
    const statusQuery = useQuery({ queryKey: ['my-status'], queryFn: getStatus });
    const queryClient = useQueryClient();

    // Inline opt-in from the gated state. The old CTA did router.back() — a
    // no-op/wrong hop when the user arrived via the + FAB. Female users now
    // enable tracking right here (one tap, screen unlocks in place); users
    // without biologicalSex=FEMALE are routed to profile edit where that lives.
    const enableTracking = useMutation({
        mutationFn: () => updateProfile({ cycleTrackingEnabled: true }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['my-profile'] });
            queryClient.invalidateQueries({ queryKey: ['my-status'] });
        },
    });

    const profile = profileQuery.data as any;
    // Eligibility gate — opt-in + female. Treat unknown (still loading) as gated
    // closed until the profile resolves so we never flash the feature.
    const trackingEnabled = profile?.cycleTrackingEnabled === true;
    const isFemale = (profile?.biologicalSex ?? '').toString().toUpperCase() === 'FEMALE';
    const eligible = trackingEnabled && isFemale;

    // Only fetch the cycle data when the user is actually eligible.
    const forecastQuery = useQuery({
        queryKey: ['cycle-forecast', 1],
        queryFn: () => getCycleForecast(1),
        enabled: eligible,
    });
    const historyQuery = useQuery({
        queryKey: ['cycle-history'],
        queryFn: getCycleHistory,
        enabled: eligible,
    });

    const cyclePhase = (statusQuery.data as any)?.cyclePhase;

    // ── Ring scalars for the hero — DERIVED from data the screen already holds.
    // Sources, in order of preference, all already fetched (NO new request):
    //   • cycle START   = profile.lastPeriodStartDate, else history's current
    //     cycle (cycles[0].startDate, the entry whose cycleLengthDays is null).
    //   • cycle LENGTH  = profile.avgCycleLengthDays, else history averages.
    //   • next period / ovulation = the forecast's predicted dates.
    // Every value is honest (omitted when its source is missing) and never a
    // fabricated number — the hero degrades gracefully on any null.
    const ringData = useMemo(() => {
        const profileAny = profile as any;
        const forecast = forecastQuery.data;
        const history = historyQuery.data;
        const today = todayUtcMs();

        // Cycle start (most recent period start).
        const currentHistCycle = history?.cycles?.find((c) => c.cycleLengthDays == null);
        const startMs =
            isoToUtcMs(profileAny?.lastPeriodStartDate) ?? isoToUtcMs(currentHistCycle?.startDate ?? null);

        // Cycle length (ring denominator).
        const cycleLengthDays =
            (typeof profileAny?.avgCycleLengthDays === 'number' ? profileAny.avgCycleLengthDays : null) ??
            history?.averages?.avgCycleLengthDays ??
            null;

        // Day-of-cycle = whole days since start + 1 (1-based, clamped to >= 1).
        let cycleDay: number | null = null;
        if (startMs != null && startMs <= today) {
            cycleDay = Math.floor((today - startMs) / MS_PER_DAY) + 1;
        }

        // Days until predicted next period (>= 0).
        const nextMs = isoToUtcMs(forecast?.predictedNextPeriodStart ?? null);
        const daysUntilNextPeriod =
            nextMs != null ? Math.max(0, Math.round((nextMs - today) / MS_PER_DAY)) : null;

        // Days until predicted ovulation (omit once it has passed).
        const ovMs = isoToUtcMs(forecast?.predictedOvulationDate ?? null);
        const daysUntilOvulation =
            ovMs != null ? Math.round((ovMs - today) / MS_PER_DAY) : null;

        // 1-based day-of-cycle of ovulation, to position the lime ring marker.
        const ovulationDayOfCycle =
            ovMs != null && startMs != null && ovMs >= startMs
                ? Math.floor((ovMs - startMs) / MS_PER_DAY) + 1
                : null;

        return { cycleDay, cycleLengthDays, daysUntilNextPeriod, daysUntilOvulation, ovulationDayOfCycle };
    }, [profile, forecastQuery.data, historyQuery.data]);

    const Header = (
        <View style={styles.header}>
            <TouchableOpacity
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel="Go back"
                activeOpacity={0.85}
                onPress={() => router.back()}
                style={[styles.headerBtn, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}
            >
                <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
            </TouchableOpacity>
            <View style={styles.headerTitle}>
                <Text style={[typography.overline, { color: colors.text.tertiary, textAlign: 'center' }]}>
                    WELLNESS
                </Text>
                <Text style={[typography.h3, { color: colors.text.primary, textAlign: 'center' }]}>Cycle</Text>
            </View>
            <View style={{ width: 40 }} />
        </View>
    );

    return (
        <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background.primary }]}>
            <StatusBar style="light" />
            {/* Calm coral ambient wash behind the header — the period/cycle accent,
                signalling the gentler, sensitive treatment of this space. */}
            <View
                pointerEvents="none"
                style={[styles.ambient, { backgroundColor: withAlpha(CORAL, 0.06) }]}
            />
            {Header}

            {profileQuery.isLoading ? (
                <View style={{ padding: spacing.xl }}>
                    <Skeleton height={140} radius={24} />
                    <View style={{ height: 12 }} />
                    <Skeleton height={320} radius={24} />
                </View>
            ) : !eligible ? (
                // GATED: non-tracking / non-female users never see the feature.
                <View style={styles.centered} testID="cycle-not-enabled">
                    <Animated.View entering={FadeIn.duration(280)} style={styles.gatedWrap}>
                        <EmptyState
                            icon="ellipse-outline"
                            title="Cycle tracking is off"
                            subtitle={
                                isFemale
                                    ? 'Turn it on to estimate your phase, log periods, and get cycle-aware meal and training guidance.'
                                    : 'Cycle tracking is available for female profiles. Set your biological sex in profile settings to use it.'
                            }
                        />
                        {isFemale ? (
                            // One-tap opt-in — the screen unlocks in place on success.
                            <CtaButton
                                label={enableTracking.isPending ? 'Turning on…' : 'Turn on cycle tracking'}
                                icon="ellipse-outline"
                                onPress={() => {
                                    if (!enableTracking.isPending) enableTracking.mutate();
                                }}
                                accessibilityLabel="Turn on cycle tracking"
                                style={styles.gatedCta}
                            />
                        ) : (
                            // biologicalSex lives on the profile edit screen.
                            <CtaButton
                                label="Open profile settings"
                                icon="settings-outline"
                                onPress={() => router.push('/(tabs)/profile/edit' as never)}
                                accessibilityLabel="Open profile settings to set your biological sex"
                                style={styles.gatedCta}
                            />
                        )}
                        {enableTracking.isError ? (
                            <Text
                                style={{
                                    marginTop: spacing.sm,
                                    color: colors.error,
                                    ...typography.caption,
                                    textAlign: 'center',
                                }}
                            >
                                Couldn't turn on tracking — check your connection and try again.
                            </Text>
                        ) : null}
                    </Animated.View>
                </View>
            ) : (
                <>
                <ScrollView
                    ref={scrollRef}
                    contentContainerStyle={{ padding: spacing.xl, paddingTop: spacing.md, paddingBottom: insets.bottom + 96 }}
                    showsVerticalScrollIndicator={false}
                >
                    {/* Phase-aware HERO — the big cycle ring (coral elapsed arc +
                        lime ovulation marker) wrapping the DAY/phase readout, the
                        "next period / ovulation" line, and the 4-phase strip. Reads
                        cyclePhase from status + soft predictions from the already-
                        fetched forecast, plus ring scalars DERIVED above from the
                        profile/forecast/history the screen already holds (no new
                        request). Self-gates on null / UNKNOWN exactly like the card. */}
                    <Animated.View entering={enter(0)}>
                        <CyclePhaseHero
                            cyclePhase={cyclePhase}
                            forecast={forecastQuery.data}
                            cycleDay={ringData.cycleDay}
                            cycleLengthDays={ringData.cycleLengthDays}
                            daysUntilNextPeriod={ringData.daysUntilNextPeriod}
                            daysUntilOvulation={ringData.daysUntilOvulation}
                            ovulationDayOfCycle={ringData.ovulationDayOfCycle}
                        />
                    </Animated.View>

                    {/* "Tuned to your phase today" — two recommendation cards
                        (training + nutrition). Self-gates on null / UNKNOWN. */}
                    <Animated.View entering={enter(1)}>
                        <PhaseRecommendationCards phase={cyclePhase} />
                    </Animated.View>

                    {/* Phase guidance card (reused) — tip + how today's plan adjusts. */}
                    <Animated.View entering={enter(2)}>
                        <CyclePhaseCard cyclePhase={cyclePhase} />
                    </Animated.View>

                    {/* Best foods for the user's CONCRETE phase. Self-gates: renders
                        nothing for null / 'UNKNOWN', exactly like CyclePhaseCard. */}
                    <Animated.View entering={enter(3)}>
                        <PhaseFoodsCard phase={cyclePhase} />
                    </Animated.View>

                    {/* Calendar — logged-vs-predicted + confidence-aware. */}
                    <Animated.View entering={enter(4)}>
                        {forecastQuery.isLoading ? (
                            <View style={{ marginTop: 12 }}><Skeleton height={320} radius={24} /></View>
                        ) : forecastQuery.isError ? (
                            <View style={{ marginTop: 12 }}>
                                <EmptyState
                                    icon="cloud-offline-outline"
                                    title="Couldn't load calendar"
                                    subtitle="Something went wrong loading your cycle forecast. Check your connection and try again."
                                    actionLabel="Try Again"
                                    onAction={() => forecastQuery.refetch()}
                                />
                            </View>
                        ) : forecastQuery.data ? (
                            <CycleCalendar
                                days={forecastQuery.data.days}
                                confidence={forecastQuery.data.confidence}
                                trackingOnly={forecastQuery.data.trackingOnly}
                            />
                        ) : null}
                    </Animated.View>

                    {/* Log a period (today or a past day) — the primary action.
                        Measured so the thumb-zone anchor can scroll straight to it. */}
                    <Animated.View entering={enter(5)} onLayout={onLogCardLayout}>
                        <LogPeriodCard />
                    </Animated.View>

                    {/* History + averages + variability range. */}
                    <Animated.View entering={enter(6)}>
                        {historyQuery.isLoading ? (
                            <View style={{ marginTop: 12 }}><Skeleton height={160} radius={24} /></View>
                        ) : historyQuery.isError ? (
                            <View style={{ marginTop: 12 }}>
                                <EmptyState
                                    icon="cloud-offline-outline"
                                    title="Couldn't load history"
                                    subtitle="Something went wrong loading your cycle history. Check your connection and try again."
                                    actionLabel="Try Again"
                                    onAction={() => historyQuery.refetch()}
                                />
                            </View>
                        ) : (
                            <CycleHistoryCard history={historyQuery.data} />
                        )}
                    </Animated.View>

                    {/* Consent-aware wellness disclaimer. */}
                    <Animated.View entering={enter(7)}>
                        <MedicalDisclaimerBanner
                            text="Cycle phases and predictions are wellness estimates, not medical advice. They are not a contraceptive method or a substitute for professional care."
                            style={{ marginTop: 16 }}
                        />
                    </Animated.View>

                    {/* ENDING — a quiet, human affirmation closes the screen. */}
                    <Animated.View entering={enter(8)}>
                        <Text style={[typography.bodySm, styles.affirmation, { color: colors.text.tertiary }]}>
                            Your body, your pace. Tracking is just for you.
                        </Text>
                    </Animated.View>
                </ScrollView>

                    {/* Persistent THUMB-ZONE anchor — "Track today", the screen's
                        core verb, always reachable in the bottom third on first
                        paint. Floats above the safe-area inset and scrolls to the
                        Log Period form (which owns the actual mutation). A coral
                        period-accent pill (coral-tinted fill + coral text), matching
                        the cycle mockup — distinct from the app's lime CTAs so it
                        reads as the cycle action, not a second primary surface. */}
                    <Animated.View
                        entering={FadeInDown.delay(280).springify().damping(18).mass(0.7)}
                        pointerEvents="box-none"
                        style={[styles.logAnchor, { paddingBottom: insets.bottom + 12 }]}
                    >
                        <View
                            pointerEvents="none"
                            style={[styles.logAnchorScrim, { backgroundColor: colors.background.primary }]}
                        />
                        <Pressable
                            onPress={scrollToLog}
                            accessibilityRole="button"
                            accessibilityLabel="Jump to log a period"
                            testID="cycle-log-anchor"
                            style={({ pressed }) => [
                                styles.trackPill,
                                {
                                    backgroundColor: withAlpha(CORAL, 0.14),
                                    borderColor: withAlpha(CORAL, 0.4),
                                },
                                pressed ? { transform: [{ scale: 0.97 }], opacity: 0.9 } : null,
                            ]}
                        >
                            <Ionicons name="add" size={19} color={CORAL} />
                            <Text style={[typography.subtitle, styles.trackPillLabel, { color: CORAL }]}>
                                Track today
                            </Text>
                        </Pressable>
                    </Animated.View>
                </>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    ambient: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 220,
    },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
    gatedWrap: { alignItems: 'center', alignSelf: 'stretch' },
    gatedCta: { alignSelf: 'stretch', marginTop: 4, marginHorizontal: 8 },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 14,
    },
    headerBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    // flex:1 + centered keeps the WELLNESS/Cycle title block mathematically
    // centered between the 40px back button and the 40px spacer rail.
    headerTitle: { flex: 1, alignItems: 'center' },
    affirmation: { textAlign: 'center', marginTop: 20, marginBottom: 8 },
    // Floating thumb-zone shortcut to the Log Period form.
    logAnchor: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        paddingHorizontal: 20,
        paddingTop: 10,
    },
    // Soft scrim so the floating CTA reads cleanly over scrolling content.
    logAnchorScrim: {
        ...StyleSheet.absoluteFillObject,
        opacity: 0.92,
    },
    // Coral "Track today" pill — the cycle action, in the period accent.
    trackPill: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        minHeight: 48,
        paddingVertical: 13,
        borderRadius: 15,
        borderWidth: 1,
    },
    trackPillLabel: { fontWeight: '600' },
});
