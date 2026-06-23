import React, { useRef, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';

import { useTheme } from '@/theme';
import { EmptyState, Skeleton, CtaButton } from '@/components/ui';
import { withAlpha } from '@/theme/utils';
import { CyclePhaseHero } from '@/components/cycle/CyclePhaseHero';
import { CyclePhaseCard } from '@/components/CyclePhaseCard';
import { CycleCalendar } from '@/components/cycle/CycleCalendar';
import { CycleHistoryCard } from '@/components/cycle/CycleHistoryCard';
import { PhaseFoodsCard } from '@/components/cycle/PhaseFoodsCard';
import { LogPeriodCard } from '@/components/cycle/LogPeriodCard';
import { MedicalDisclaimerBanner } from '@/components/MedicalDisclaimer';
import { getMyProfile, getStatus } from '@/api/profile';
import { getCycleForecast, getCycleHistory } from '@/api/cycle';

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
            {/* Calm purple/blue ambient wash behind the header — keeps the brand
                while signalling the gentler, sensitive treatment of this space. */}
            <View
                pointerEvents="none"
                style={[styles.ambient, { backgroundColor: withAlpha(colors.accent.purple, 0.07) }]}
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
                            subtitle="Turn on cycle tracking in your profile to estimate your phase, log periods, and see your history."
                        />
                        {/* Thumb-zone CTA back to where the toggle lives. */}
                        <CtaButton
                            label="Open profile settings"
                            icon="settings-outline"
                            onPress={() => router.back()}
                            accessibilityLabel="Go back to profile to turn on cycle tracking"
                            style={styles.gatedCta}
                        />
                    </Animated.View>
                </View>
            ) : (
                <>
                <ScrollView
                    ref={scrollRef}
                    contentContainerStyle={{ padding: spacing.xl, paddingTop: spacing.md, paddingBottom: insets.bottom + 96 }}
                    showsVerticalScrollIndicator={false}
                >
                    {/* Phase-tinted HERO — calm, phase-aware crown. Reads cyclePhase
                        from status + soft predictions from the already-fetched
                        forecast. Self-gates on null / UNKNOWN exactly like the card. */}
                    <Animated.View entering={enter(0)}>
                        <CyclePhaseHero cyclePhase={cyclePhase} forecast={forecastQuery.data} />
                    </Animated.View>

                    {/* Phase guidance card (reused) — tip + how today's plan adjusts. */}
                    <Animated.View entering={enter(1)}>
                        <CyclePhaseCard cyclePhase={cyclePhase} />
                    </Animated.View>

                    {/* Best foods for the user's CONCRETE phase. Self-gates: renders
                        nothing for null / 'UNKNOWN', exactly like CyclePhaseCard. */}
                    <Animated.View entering={enter(2)}>
                        <PhaseFoodsCard phase={cyclePhase} />
                    </Animated.View>

                    {/* Calendar — logged-vs-predicted + confidence-aware. */}
                    <Animated.View entering={enter(3)}>
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
                    <Animated.View entering={enter(4)} onLayout={onLogCardLayout}>
                        <LogPeriodCard />
                    </Animated.View>

                    {/* History + averages + variability range. */}
                    <Animated.View entering={enter(5)}>
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
                    <Animated.View entering={enter(6)}>
                        <MedicalDisclaimerBanner
                            text="Cycle phases and predictions are wellness estimates, not medical advice. They are not a contraceptive method or a substitute for professional care."
                            style={{ marginTop: 16 }}
                        />
                    </Animated.View>

                    {/* ENDING — a quiet, human affirmation closes the screen. */}
                    <Animated.View entering={enter(7)}>
                        <Text style={[typography.bodySm, styles.affirmation, { color: colors.text.tertiary }]}>
                            Your body, your pace. Tracking is just for you.
                        </Text>
                    </Animated.View>
                </ScrollView>

                    {/* Persistent THUMB-ZONE anchor — the screen's core verb,
                        always reachable in the bottom third on first paint. Floats
                        above the safe-area inset and scrolls to the Log Period form
                        (which owns the actual mutation). Compact so it reads as a
                        shortcut, not a second primary surface. */}
                    <Animated.View
                        entering={FadeInDown.delay(280).springify().damping(18).mass(0.7)}
                        pointerEvents="box-none"
                        style={[styles.logAnchor, { paddingBottom: insets.bottom + 12 }]}
                    >
                        <View
                            pointerEvents="none"
                            style={[styles.logAnchorScrim, { backgroundColor: colors.background.primary }]}
                        />
                        <CtaButton
                            label="Log period"
                            icon="add-circle-outline"
                            size="sm"
                            onPress={scrollToLog}
                            accessibilityLabel="Jump to log a period"
                            testID="cycle-log-anchor"
                        />
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
});
