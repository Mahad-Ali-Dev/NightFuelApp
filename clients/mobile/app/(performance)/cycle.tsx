import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { EmptyState, Skeleton } from '@/components/ui';
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
 */
export default function CycleScreen() {
    const { colors, typography, spacing } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();

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

    const Header = (
        <View style={[styles.header, { borderBottomColor: colors.border.default }]}>
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
            <Text style={[typography.h3, { color: colors.text.primary }]}>Cycle</Text>
            <View style={{ width: 40 }} />
        </View>
    );

    return (
        <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background.primary }]}>
            <StatusBar style="light" />
            {Header}

            {profileQuery.isLoading ? (
                <View style={{ padding: spacing.xl }}>
                    <Skeleton height={120} />
                </View>
            ) : !eligible ? (
                // GATED: non-tracking / non-female users never see the feature.
                <View style={styles.centered} testID="cycle-not-enabled">
                    <EmptyState
                        icon="ellipse-outline"
                        title="Cycle tracking is off"
                        subtitle="Turn on cycle tracking in your profile to estimate your phase, log periods, and see your history."
                    />
                </View>
            ) : (
                <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 100 }}>
                    {/* Phase card (reused) — reads cyclePhase from status. */}
                    <CyclePhaseCard cyclePhase={(statusQuery.data as any)?.cyclePhase} />

                    {/* Best foods for the user's CONCRETE phase. Self-gates: renders
                        nothing for null / 'UNKNOWN', exactly like CyclePhaseCard. */}
                    <PhaseFoodsCard phase={(statusQuery.data as any)?.cyclePhase} />

                    {/* Calendar — logged-vs-predicted + confidence-aware. */}
                    {forecastQuery.isLoading ? (
                        <View style={{ marginTop: 12 }}><Skeleton height={320} /></View>
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

                    {/* Log a period (today or a past day). */}
                    <LogPeriodCard />

                    {/* History + averages + variability range. */}
                    {historyQuery.isLoading ? (
                        <View style={{ marginTop: 12 }}><Skeleton height={160} /></View>
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

                    {/* Consent-aware wellness disclaimer. */}
                    <MedicalDisclaimerBanner
                        text="Cycle phases and predictions are wellness estimates, not medical advice. They are not a contraceptive method or a substitute for professional care."
                        style={{ marginTop: 16 }}
                    />
                </ScrollView>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 14,
        borderBottomWidth: 1,
    },
    headerBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
