import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';

import { useTheme } from '@/theme';
import { useCycleAccents } from '@/theme/useCycleAccents';
import { EmptyState, Skeleton, CtaButton } from '@/components/ui';
import { withAlpha } from '@/theme/utils';
import { CyclePhaseHero } from '@/components/cycle/CyclePhaseHero';
import { PhaseRecommendationCards } from '@/components/cycle/PhaseRecommendationCards';
import { PhaseCoachCard } from '@/components/cycle/PhaseCoachCard';
import { CyclePhaseCard } from '@/components/CyclePhaseCard';
import { CycleCalendar } from '@/components/cycle/CycleCalendar';
import { CycleHistoryCard } from '@/components/cycle/CycleHistoryCard';
import { CycleStatsCard } from '@/components/cycle/CycleStatsCard';
import { PhaseFoodsCard } from '@/components/cycle/PhaseFoodsCard';
import { LogPeriodCard } from '@/components/cycle/LogPeriodCard';
import { SymptomQuickLogCard } from '@/components/cycle/SymptomQuickLogCard';
import { FertilityLogCard } from '@/components/cycle/FertilityLogCard';
import { PregnancyCard } from '@/components/cycle/PregnancyCard';
import { BirthControlCard } from '@/components/cycle/BirthControlCard';
import { PartnerShareCard } from '@/components/cycle/PartnerShareCard';
import { CycleLockGate, CycleLockToggle } from '@/components/cycle/CycleLockGate';
import { CycleTabBar, type CycleTab } from '@/components/cycle/CycleTabBar';
import { MedicalDisclaimerBanner } from '@/components/MedicalDisclaimer';
import { getMyProfile, getStatus, updateProfile } from '@/api/profile';
import { getCycleForecast, getCycleHistory } from '@/api/cycle';
import { pushCycleWidgetFromData } from '@/widgets/sync';

// The coral period accent is theme-aware — see useCycleAccents (dark #FF7A90,
// darkened on light); sourced per-render in the screen component.
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
 * Organised as a 4-TAB layout (a coral segmented bar crowns the eligible body):
 *   • TODAY    — the phase HERO (CyclePhaseHero) + Ria's phase coaching
 *                (PhaseCoachCard) + a quick-actions row that jumps to Log. In
 *                PREGNANCY MODE this tab leads with the PregnancyCard instead and
 *                the prediction surfaces pause.
 *   • CALENDAR — the month CALENDAR (CycleCalendar, logged-vs-predicted +
 *                confidence-aware) + cycle HISTORY (CycleHistoryCard).
 *   • INSIGHTS — phase foods (PhaseFoodsCard) + the training/nutrition
 *                recommendation cards (PhaseRecommendationCards) + the stats
 *                dashboard (CycleStatsCard), with the phase-coach card surfaced too.
 *   • LOG      — every logging surface: LogPeriodCard, SymptomQuickLogCard,
 *                FertilityLogCard, PregnancyCard, BirthControlCard, PartnerShareCard.
 *
 * Each tab is its own ScrollView. The "wellness estimate, not medical advice"
 * disclaimer shows on Today and Log.
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

// Today-tab quick-actions — three coral chips that switch to the Log tab (which
// owns the real forms/mutations). Kept module-level so the array identity is
// stable across renders.
const QUICK_ACTIONS: readonly {
    key: string;
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    a11y: string;
}[] = [
    { key: 'flow', label: 'Log flow', icon: 'water-outline', a11y: 'Log flow — opens the Log tab' },
    { key: 'symptoms', label: 'Symptoms', icon: 'medkit-outline', a11y: 'Log symptoms — opens the Log tab' },
    { key: 'bbt', label: 'BBT', icon: 'thermometer-outline', a11y: 'Log basal body temperature — opens the Log tab' },
] as const;

export default function CycleScreen() {
    const { colors, typography, spacing } = useTheme();
    const { coral: CORAL, isLight } = useCycleAccents();
    const insets = useSafeAreaInsets();
    const router = useRouter();

    // Active sub-screen. The Log tab replaces the old thumb-zone "scroll to the
    // log card" anchor — the quick-actions on Today just switch to it. Defaults to
    // Today so the phase hero (or, in pregnancy mode, the pregnancy tracker) leads.
    const [activeTab, setActiveTab] = useState<CycleTab>('today');

    const profileQuery = useQuery({ queryKey: ['my-profile'], queryFn: getMyProfile });
    const statusQuery = useQuery({ queryKey: ['my-status'], queryFn: getStatus });
    const queryClient = useQueryClient();

    // Privacy lock (Period P3): bumped whenever the CycleLockToggle flips, so the
    // CycleLockGate re-reads the persisted `cycleLockEnabled` flag and re-gates
    // (locking straight away when the user turns it on).
    const [lockRefresh, setLockRefresh] = useState(0);

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

    // Period P2: when pregnancy mode is ON we PAUSE the period-prediction surfaces
    // (the plan pauses forecasting during pregnancy) and lead with the pregnancy
    // tracker. Period logging + birth-control tracking stay available below.
    const pregnancyMode = profile?.pregnancyMode === true;

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

    // Mirror what this screen shows onto the Android home-screen widget, using the
    // data already fetched here (no extra request). Android-only — a no-op on iOS /
    // web (see src/widgets/sync.ts). Re-runs whenever the underlying profile /
    // status / forecast / history changes, e.g. right after the user logs a period.
    useEffect(() => {
        if (!profile) return; // wait for the profile so we don't briefly push "tracking off"
        const histStart =
            historyQuery.data?.cycles?.find((c) => c.cycleLengthDays == null)?.startDate ?? null;
        void pushCycleWidgetFromData({
            profile,
            status: eligible ? statusQuery.data : null,
            forecast: eligible ? forecastQuery.data : null,
            cycleStartDate: profile?.lastPeriodStartDate ?? histStart,
        });
    }, [eligible, profile, statusQuery.data, forecastQuery.data, historyQuery.data]);

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
            <StatusBar style={isLight ? 'dark' : 'light'} />
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
                // Privacy lock (Period P3) wraps the ENTIRE eligible screen body —
                // when the user has enabled it, everything below (predictions,
                // logging, history) is hidden behind an auth prompt until they
                // unlock (once per app session). Off → renders straight through.
                <CycleLockGate refreshKey={lockRefresh}>
                    <View style={styles.body}>
                        {/* FIXED chrome above the scrolling tab content: the privacy
                            lock toggle (Period P3 — flipping it bumps lockRefresh so
                            the gate re-reads the flag) and the coral segmented tab
                            bar. Kept out of the ScrollView so switching tabs never
                            loses the bar and it's always reachable without a scroll. */}
                        <Animated.View entering={enter(0)} style={styles.chrome}>
                            <CycleLockToggle onChange={() => setLockRefresh((n) => n + 1)} />
                            <View style={{ height: spacing.md }} />
                            <CycleTabBar active={activeTab} onChange={setActiveTab} />
                        </Animated.View>

                        {/* Each tab is its OWN ScrollView. Keying by activeTab remounts
                            the active view on switch, so the staggered FadeInDown
                            entrance replays for the newly-shown tab. */}
                        <ScrollView
                            key={activeTab}
                            contentContainerStyle={{
                                paddingHorizontal: spacing.xl,
                                paddingTop: spacing.md,
                                paddingBottom: insets.bottom + 32,
                            }}
                            showsVerticalScrollIndicator={false}
                        >
                            {/* ── TODAY ──────────────────────────────────────────────
                                Leads with the phase hero + Ria's phase coaching, then a
                                quick-actions row that jumps to the Log tab. In PREGNANCY
                                MODE it instead leads with the pregnancy tracker and the
                                prediction-heavy hero pauses (the plan pauses forecasting
                                during pregnancy). */}
                            {activeTab === 'today' ? (
                                <>
                                    {pregnancyMode ? (
                                        // Pregnancy mode ON — the weekly tracker crowns the
                                        // tab; prediction surfaces stay paused.
                                        <Animated.View entering={enter(1)}>
                                            <PregnancyCard
                                                pregnancyMode={profile?.pregnancyMode}
                                                pregnancyDueDate={profile?.pregnancyDueDate}
                                            />
                                        </Animated.View>
                                    ) : (
                                        <>
                                            {/* Phase-aware HERO — the big cycle ring (coral
                                                elapsed arc + lime ovulation marker) wrapping
                                                the DAY/phase readout, the "next period /
                                                ovulation" line, and the 4-phase strip. Reads
                                                cyclePhase from status + soft predictions from
                                                the already-fetched forecast, plus ring scalars
                                                DERIVED above (no new request). Self-gates on
                                                null / UNKNOWN exactly like the card. */}
                                            <Animated.View entering={enter(1)}>
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

                                            {/* Dedicated phase-coaching section — states what
                                                Ria adapts for today's phase + one-tap "Plan
                                                today with Ria". Self-gates like its siblings. */}
                                            <Animated.View entering={enter(2)}>
                                                <PhaseCoachCard phase={cyclePhase} />
                                            </Animated.View>
                                        </>
                                    )}

                                    {/* Quick-actions row — three coral chips that switch to
                                        the Log tab (which owns the actual forms/mutations).
                                        Available in pregnancy mode too (logging never pauses). */}
                                    <Animated.View entering={enter(3)} style={styles.quickRow}>
                                        {QUICK_ACTIONS.map((qa) => (
                                            <Pressable
                                                key={qa.key}
                                                onPress={() => setActiveTab('log')}
                                                accessibilityRole="button"
                                                accessibilityLabel={qa.a11y}
                                                testID={`cycle-quick-${qa.key}`}
                                                style={({ pressed }) => [
                                                    styles.quickChip,
                                                    {
                                                        backgroundColor: withAlpha(CORAL, 0.12),
                                                        borderColor: withAlpha(CORAL, 0.4),
                                                    },
                                                    pressed ? { transform: [{ scale: 0.97 }], opacity: 0.9 } : null,
                                                ]}
                                            >
                                                <Ionicons name={qa.icon} size={18} color={CORAL} />
                                                <Text style={[typography.captionMedium, styles.quickChipLabel, { color: CORAL }]}>
                                                    {qa.label}
                                                </Text>
                                            </Pressable>
                                        ))}
                                    </Animated.View>

                                    {/* "Log today" CTA — the screen's core verb, switching to
                                        the Log tab. Coral period-accent pill, distinct from the
                                        app's lime CTAs so it reads as the cycle action. */}
                                    <Animated.View entering={enter(4)}>
                                        <Pressable
                                            onPress={() => setActiveTab('log')}
                                            accessibilityRole="button"
                                            accessibilityLabel="Go to the Log tab to track today"
                                            testID="cycle-log-cta"
                                            style={({ pressed }) => [
                                                styles.trackPill,
                                                {
                                                    backgroundColor: withAlpha(CORAL, 0.14),
                                                    borderColor: withAlpha(CORAL, 0.4),
                                                },
                                                pressed ? { transform: [{ scale: 0.98 }], opacity: 0.9 } : null,
                                            ]}
                                        >
                                            <Ionicons name="add" size={19} color={CORAL} />
                                            <Text style={[typography.subtitle, styles.trackPillLabel, { color: CORAL }]}>
                                                Log today
                                            </Text>
                                        </Pressable>
                                    </Animated.View>

                                    {/* Consent-aware wellness disclaimer (shown on Today). */}
                                    <Animated.View entering={enter(5)}>
                                        <MedicalDisclaimerBanner
                                            text="Cycle phases and predictions are wellness estimates, not medical advice. They are not a contraceptive method or a substitute for professional care."
                                            style={{ marginTop: 16 }}
                                        />
                                    </Animated.View>

                                    {/* ENDING — a quiet, human affirmation. */}
                                    <Animated.View entering={enter(6)}>
                                        <Text style={[typography.bodySm, styles.affirmation, { color: colors.text.tertiary }]}>
                                            Your body, your pace. Tracking is just for you.
                                        </Text>
                                    </Animated.View>
                                </>
                            ) : null}

                            {/* ── CALENDAR ───────────────────────────────────────────
                                The month calendar + cycle history. In pregnancy mode the
                                prediction-driven calendar pauses (matching Today); the
                                history card still shows past cycles. */}
                            {activeTab === 'calendar' ? (
                                <>
                                    {!pregnancyMode ? (
                                        <Animated.View entering={enter(1)}>
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
                                    ) : null}

                                    {/* History + averages + variability range. */}
                                    <Animated.View entering={enter(2)}>
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
                                </>
                            ) : null}

                            {/* ── INSIGHTS ───────────────────────────────────────────
                                Phase foods + the training/nutrition recommendation cards
                                + the stats dashboard, with the phase-coach card surfaced
                                here too. The phase-driven surfaces self-gate on UNKNOWN;
                                the stats dashboard (history-based) always reads. */}
                            {activeTab === 'insights' ? (
                                <>
                                    {!pregnancyMode ? (
                                        <>
                                            <Animated.View entering={enter(1)}>
                                                <PhaseFoodsCard phase={cyclePhase} />
                                            </Animated.View>
                                            <Animated.View entering={enter(2)}>
                                                <PhaseRecommendationCards phase={cyclePhase} />
                                            </Animated.View>
                                            {/* Phase guidance card (reused) — tip + plan adjustments. */}
                                            <Animated.View entering={enter(3)}>
                                                <CyclePhaseCard cyclePhase={cyclePhase} />
                                            </Animated.View>
                                            {/* Phase-coaching also surfaced here (primary home is Today). */}
                                            <Animated.View entering={enter(4)}>
                                                <PhaseCoachCard phase={cyclePhase} />
                                            </Animated.View>
                                        </>
                                    ) : null}

                                    {/* Stats dashboard — metric tiles + a cycle-length bar
                                        chart + the most-logged symptoms. Self-fetches history
                                        + a 90-day symptom window (shares the 'cycle-history'
                                        cache key with the history card). */}
                                    <Animated.View entering={enter(5)}>
                                        <CycleStatsCard />
                                    </Animated.View>
                                </>
                            ) : null}

                            {/* ── LOG ────────────────────────────────────────────────
                                Every logging surface. Period logging + birth control stay
                                reachable in pregnancy mode; the fertility log hides then
                                (fertility signals are irrelevant), matching the paused
                                prediction surfaces. */}
                            {activeTab === 'log' ? (
                                <>
                                    {/* Pregnancy tracker also reachable here so it can be
                                        toggled from the logging area (its primary home in
                                        pregnancy mode is the Today tab). */}
                                    <Animated.View entering={enter(1)}>
                                        <PregnancyCard
                                            pregnancyMode={profile?.pregnancyMode}
                                            pregnancyDueDate={profile?.pregnancyDueDate}
                                        />
                                    </Animated.View>

                                    {/* Log a period (today or a past day) — the primary action.
                                        Kept available in pregnancy mode too. */}
                                    <Animated.View entering={enter(2)}>
                                        <LogPeriodCard />
                                    </Animated.View>

                                    {/* Full per-day log (Period P1) — flow, mood / cramps /
                                        energy, the categorized symptom multi-select, discharge,
                                        activity, a water stepper and notes. */}
                                    <Animated.View entering={enter(3)}>
                                        <SymptomQuickLogCard />
                                    </Animated.View>

                                    {/* Advanced fertility log (Period P3) — BBT + weight
                                        steppers, LH chips, a coverline chart, and the "trying
                                        to conceive" toggle. Hidden in pregnancy mode. */}
                                    {!pregnancyMode ? (
                                        <Animated.View entering={enter(4)}>
                                            <FertilityLogCard tryingToConceive={profile?.tryingToConceive} />
                                        </Animated.View>
                                    ) : null}

                                    {/* Birth control + pill tracking (Period P2) — method
                                        picker and, when PILL, take-today + adherence + a daily
                                        reminder. Stays reachable in pregnancy mode. */}
                                    <Animated.View entering={enter(5)}>
                                        <BirthControlCard
                                            birthControlMethod={profile?.birthControlMethod}
                                            pillReminderEnabled={profile?.pillReminderEnabled}
                                            pillReminderTime={profile?.pillReminderTime}
                                        />
                                    </Animated.View>

                                    {/* Share with partner (Period P3 tail) — generate / copy /
                                        share / revoke a read-only code for this user's SANITIZED
                                        cycle summary. Shown for all eligible users (incl.
                                        pregnancy mode) so an active code can always be managed. */}
                                    <Animated.View entering={enter(6)}>
                                        <PartnerShareCard />
                                    </Animated.View>

                                    {/* Consent-aware wellness disclaimer (shown on Log). */}
                                    <Animated.View entering={enter(7)}>
                                        <MedicalDisclaimerBanner
                                            text="Cycle phases and predictions are wellness estimates, not medical advice. They are not a contraceptive method or a substitute for professional care."
                                            style={{ marginTop: 16 }}
                                        />
                                    </Animated.View>
                                </>
                            ) : null}
                        </ScrollView>
                    </View>
                </CycleLockGate>
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
    // Eligible body — fills the space under the header; the fixed chrome sits
    // above the per-tab ScrollView.
    body: { flex: 1 },
    // Fixed chrome (lock toggle + tab bar) above the scrolling tab content.
    chrome: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12 },
    // Today quick-actions — a row of coral chips that jump to the Log tab.
    quickRow: { flexDirection: 'row', gap: 8, marginTop: 16 },
    quickChip: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        minHeight: 46,
        paddingVertical: 11,
        paddingHorizontal: 6,
        borderRadius: 14,
        borderWidth: 1,
    },
    quickChipLabel: { fontWeight: '600' },
    // Coral "Log today" pill — the cycle action, in the period accent.
    trackPill: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        minHeight: 48,
        paddingVertical: 13,
        borderRadius: 15,
        borderWidth: 1,
        marginTop: 16,
    },
    trackPillLabel: { fontWeight: '600' },
});
