import React from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    Alert,
} from 'react-native';

import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getToday, logHydration } from '@/api/progress';
import { CircularProgress } from '@/components/ui/CircularProgress';
import { EmptyState, GlassCard, Skeleton } from '@/components/ui';
import { PressableScale } from '@/components/ui/PressableScale';
import { CountUpText } from '@/components/CountUpText';
import { LinearGradient } from 'expo-linear-gradient';
import { withAlpha } from '@/theme/utils';
import { typography as typo } from '@/theme/typography';
import Animated, { FadeInDown } from 'react-native-reanimated';


const PRESETS = [250, 500, 750];
// One glass of water ≈ 250 ml — used to render the "glasses toward goal" row,
// a derived visual of today's real intake (current/target), not invented data.
const GLASS_ML = 250;
const MAX_GLASS_DOTS = 12;

export default function HydrationTrackerScreen() {
    const { colors, typography, spacing, borderRadius, shadows } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const queryClient = useQueryClient();

    const todayQuery = useQuery({
        queryKey: ['today-progress'],
        queryFn: getToday,
    });

    const mutation = useMutation({
        mutationFn: (amount: number) => logHydration(amount),
        onError: (err: any) => { Alert.alert('Error', err?.response?.data?.message ?? err?.message ?? 'Something went wrong'); },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['today-progress'] });
        },
    });

    const progress = todayQuery.data;
    const current = progress?.hydrationActual || progress?.hydrationMl || 0;
    const target = progress?.hydrationTargetMl ?? 3000;
    const pct = Math.min(1, current / target);
    const pctLabel = Math.round(pct * 100);
    const remaining = Math.max(0, target - current);
    const goalReached = current >= target && current > 0;
    // Derived "glasses" visual of today's real intake (current ÷ glass size).
    const glassesDone = Math.floor(current / GLASS_ML);
    const glassesGoal = Math.min(MAX_GLASS_DOTS, Math.max(1, Math.ceil(target / GLASS_ML)));

    const handleAdd = (amount: number) => {
        mutation.mutate(amount);
    };

    const isLoading = todayQuery.isLoading;

    return (
        <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background.primary }]}>
            <StatusBar style="light" />
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.border.default }]}>
                <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Go back" activeOpacity={0.85} onPress={() => router.back()} style={[styles.headerBtn, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
                    <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
                </TouchableOpacity>
                <Text style={[typography.h3, { color: colors.text.primary }]}>Hydration</Text>
                <View style={{ width: 40 }} />
            </View>

            {todayQuery.isError ? (
                <View style={styles.centered}>
                    <EmptyState
                        icon="cloud-offline-outline"
                        title="Couldn't load hydration"
                        subtitle="Something went wrong fetching today's intake. Check your connection and try again."
                        actionLabel="Try Again"
                        onAction={() => todayQuery.refetch()}
                    />
                </View>
            ) : (
              <>
            <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 132 }} showsVerticalScrollIndicator={false}>
                {/* Hero — water ring with the day total dominating */}
                <Animated.View entering={FadeInDown.duration(420)} style={styles.centerSection}>
                    <View style={styles.ringWrapper}>
                        {/* Soft halo — celebratory when the goal is reached */}
                        <View style={[styles.glow, { backgroundColor: goalReached ? colors.accent.coral : colors.accent.cyan, opacity: goalReached ? 0.18 : 0.12 }]} />
                        <View style={shadows.glow(goalReached ? colors.accent.coral : colors.accent.cyan)}>
                            <CircularProgress progress={pct} size={236} strokeWidth={16} color={goalReached ? colors.accent.coral : colors.accent.cyan} trackColor={colors.border.default} />
                        </View>
                        <View style={styles.ringInner}>
                            <Ionicons name="water" size={30} color={goalReached ? colors.accent.coral : colors.accent.cyan} />
                            {isLoading ? (
                                <Skeleton width={120} height={56} radius={borderRadius.md} style={{ marginTop: spacing.sm }} />
                            ) : (
                                <View style={styles.bigStatRow}>
                                    <CountUpText
                                        value={current}
                                        accessibilityLabel={`${current} of ${target} millilitres`}
                                        style={[styles.bigStat, { color: colors.text.primary }]}
                                    />
                                    <Text style={[styles.bigStatUnit, { color: colors.text.secondary }]}>ml</Text>
                                </View>
                            )}
                            <Text style={[typography.overline, { color: colors.text.tertiary, marginTop: spacing.xxs }]}>
                                OF {target} ML
                            </Text>
                            {/* Percent / milestone pill */}
                            <View style={[styles.pill, { backgroundColor: withAlpha(goalReached ? colors.accent.coral : colors.accent.cyan, 0.14) }]}>
                                <Ionicons name={goalReached ? 'checkmark-circle' : 'trending-up'} size={13} color={goalReached ? colors.accent.coral : colors.accent.cyan} />
                                <Text style={[styles.pillText, { color: goalReached ? colors.accent.coral : colors.accent.cyan }]}>
                                    {goalReached ? 'Goal reached' : `${pctLabel}% of goal`}
                                </Text>
                            </View>
                        </View>
                    </View>
                </Animated.View>

                {/* Stat strip — value dominates the label */}
                <Animated.View entering={FadeInDown.duration(420).delay(60)} style={{ paddingHorizontal: spacing.xl }}>
                    <GlassCard radius={borderRadius.xl}>
                        <View style={styles.statRow}>
                            <View style={styles.statCell}>
                                <Text style={[styles.statValue, { color: colors.text.primary }]}>{(target / 1000).toFixed(1)}</Text>
                                <Text style={[typography.overline, { color: colors.text.tertiary }]}>GOAL L</Text>
                            </View>
                            <View style={[styles.statDivider, { backgroundColor: colors.border.default }]} />
                            <View style={styles.statCell}>
                                <Text style={[styles.statValue, { color: goalReached ? colors.accent.cyan : colors.text.primary }]}>{remaining}</Text>
                                <Text style={[typography.overline, { color: colors.text.tertiary }]}>LEFT ML</Text>
                            </View>
                            <View style={[styles.statDivider, { backgroundColor: colors.border.default }]} />
                            <View style={styles.statCell}>
                                <Text style={[styles.statValue, { color: colors.text.primary }]}>{pctLabel}<Text style={[styles.statUnit, { color: colors.text.secondary }]}>%</Text></Text>
                                <Text style={[typography.overline, { color: colors.text.tertiary }]}>PROGRESS</Text>
                            </View>
                        </View>
                    </GlassCard>
                </Animated.View>

                {/* Quick add — amount buttons (the dominant +250 lives in the thumb zone below) */}
                <Animated.View entering={FadeInDown.duration(420).delay(120)} style={{ paddingHorizontal: spacing.xl, marginTop: spacing['2xl'] }}>
                    <Text style={[typography.overline, { color: colors.text.tertiary, marginBottom: spacing.md }]}>QUICK ADD</Text>
                    <View style={styles.presetsRow}>
                        {PRESETS.map((amount) => (
                            <PressableScale
                                key={amount}
                                accessibilityRole="button"
                                accessibilityLabel={`Add ${amount} ml`}
                                accessibilityState={{ disabled: mutation.isPending }}
                                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                                style={styles.presetBtn}
                                onPress={() => handleAdd(amount)}
                                disabled={mutation.isPending}
                            >
                                <GlassCard radius={borderRadius.xl} style={styles.presetGlass}>
                                    <View style={styles.presetInner}>
                                        <View style={[styles.presetIcon, { backgroundColor: withAlpha(colors.accent.cyan, 0.12), borderColor: withAlpha(colors.accent.cyan, 0.22) }]}>
                                            <Ionicons name="add" size={20} color={colors.accent.cyan} />
                                        </View>
                                        <Text style={[styles.presetValue, { color: colors.text.primary }]}>{amount}</Text>
                                        <Text style={[typography.caption, { color: colors.text.tertiary }]}>ml</Text>
                                    </View>
                                </GlassCard>
                            </PressableScale>
                        ))}
                    </View>
                </Animated.View>

                {/* Today's intake — glasses toward goal (empty state when nothing logged) */}
                <Animated.View entering={FadeInDown.duration(420).delay(180)} style={{ paddingHorizontal: spacing.xl, marginTop: spacing['2xl'] }}>
                    <Text style={[typography.overline, { color: colors.text.tertiary, marginBottom: spacing.md }]}>TODAY'S INTAKE</Text>
                    <GlassCard radius={borderRadius.xl}>
                        {isLoading ? (
                            <View style={styles.glassesCard}>
                                <Skeleton width="100%" height={28} radius={borderRadius.md} />
                            </View>
                        ) : current === 0 ? (
                            <View style={styles.emptyIntake}>
                                <View style={[styles.emptyIcon, { backgroundColor: withAlpha(colors.accent.cyan, 0.12) }]}>
                                    <Ionicons name="water-outline" size={22} color={colors.accent.cyan} />
                                </View>
                                <Text style={[typography.bodyMedium, { color: colors.text.primary, textAlign: 'center' }]}>No water logged yet</Text>
                                <Text style={[typography.caption, { color: colors.text.secondary, textAlign: 'center', marginTop: spacing.xxs }]}>
                                    Tap a quick-add below to start your day.
                                </Text>
                            </View>
                        ) : (
                            <View style={styles.glassesCard}>
                                <View style={styles.glassesRow}>
                                    {Array.from({ length: glassesGoal }).map((_, i) => {
                                        const filled = i < glassesDone;
                                        return (
                                            <Ionicons
                                                key={i}
                                                name={filled ? 'water' : 'water-outline'}
                                                size={22}
                                                color={filled ? colors.accent.cyan : withAlpha(colors.text.tertiary, 0.5)}
                                                style={styles.glassIcon}
                                            />
                                        );
                                    })}
                                </View>
                                <Text style={[typography.caption, { color: colors.text.secondary, marginTop: spacing.md }]}>
                                    {glassesDone} of {glassesGoal} glasses · {current} ml so far
                                </Text>
                            </View>
                        )}
                    </GlassCard>
                </Animated.View>

                {/* Ending — affirmation + a hydration cue */}
                <Animated.View entering={FadeInDown.duration(420).delay(240)} style={{ paddingHorizontal: spacing.xl, marginTop: spacing['2xl'] }}>
                    <GlassCard radius={borderRadius.xl}>
                        <View style={styles.tipCard}>
                            <View style={[styles.tipIcon, { backgroundColor: withAlpha(goalReached ? colors.accent.coral : colors.accent.cyan, 0.12) }]}>
                                <Ionicons name={goalReached ? 'sparkles' : 'bulb-outline'} size={20} color={goalReached ? colors.accent.coral : colors.accent.cyan} />
                            </View>
                            <Text style={[typography.body, { color: colors.text.primary, marginLeft: spacing.md, flex: 1 }]}>
                                {goalReached
                                    ? 'Hydration goal complete — you showed up for your body today.'
                                    : 'Sip consistently through the day to keep your focus and output sharp.'}
                            </Text>
                        </View>
                    </GlassCard>
                </Animated.View>
            </ScrollView>

            {/* Primary action — thumb zone. Lime is the single hero action; ink on lime. */}
            <View pointerEvents="box-none" style={[styles.ctaDock, { paddingBottom: insets.bottom + spacing.lg }]}>
                <LinearGradient
                    colors={[withAlpha(colors.background.primary, 0), colors.background.primary]}
                    style={styles.ctaFade}
                    pointerEvents="none"
                />
                <PressableScale
                    accessibilityRole="button"
                    accessibilityLabel="Add 250 ml of water"
                    accessibilityState={{ disabled: mutation.isPending }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={[styles.cta, shadows.glow(colors.accent.coral)]}
                    onPress={() => handleAdd(250)}
                    disabled={mutation.isPending}
                >
                    <LinearGradient
                        colors={colors.gradients.coralCta}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.ctaGradient}
                    >
                        <Ionicons name="add" size={24} color={colors.text.inverse} />
                        <Text style={[styles.ctaText, { color: colors.text.inverse }]}>Add 250 ml</Text>
                    </LinearGradient>
                </PressableScale>
            </View>
              </>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1 },
    headerBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    centerSection: { alignItems: 'center', justifyContent: 'center', marginTop: 28, marginBottom: 28, height: 300 },
    ringWrapper: { width: 236, height: 236, alignItems: 'center', justifyContent: 'center' },
    ringInner: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
    glow: { position: 'absolute', width: 272, height: 272, borderRadius: 136 },
    bigStatRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 6 },
    bigStat: { fontFamily: typo.statLarge.fontFamily, fontSize: 56, lineHeight: 62 },
    bigStatUnit: { fontFamily: typo.statTiny.fontFamily, fontSize: 16, marginLeft: 4 },
    pill: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 12, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 9999 },
    pillText: { fontFamily: typo.captionMedium.fontFamily, fontSize: 12 },
    statRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 18, paddingHorizontal: 8 },
    statCell: { flex: 1, alignItems: 'center', gap: 4 },
    statValue: { fontFamily: typo.statSmall.fontFamily, fontSize: 26, lineHeight: 30 },
    statUnit: { fontFamily: typo.statTiny.fontFamily, fontSize: 15 },
    statDivider: { width: 1, height: 34, opacity: 0.8 },
    presetsRow: { flexDirection: 'row', justifyContent: 'center', gap: 12 },
    presetBtn: { flex: 1 },
    presetGlass: { flex: 1 },
    presetInner: { paddingVertical: 18, alignItems: 'center' },
    presetIcon: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
    presetValue: { fontFamily: typo.statSmall.fontFamily, fontSize: 22, lineHeight: 26 },
    glassesCard: { padding: 20, alignItems: 'center' },
    glassesRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10 },
    glassIcon: { marginHorizontal: 1 },
    emptyIntake: { paddingVertical: 24, paddingHorizontal: 20, alignItems: 'center' },
    emptyIcon: { width: 48, height: 48, borderRadius: 24, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
    tipCard: { flexDirection: 'row', padding: 16, alignItems: 'center' },
    tipIcon: { width: 40, height: 40, borderRadius: 20, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center' },
    ctaDock: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 8 },
    ctaFade: { position: 'absolute', left: 0, right: 0, top: -32, height: 32 },
    cta: { height: 60, borderRadius: 18, borderCurve: 'continuous', overflow: 'hidden' },
    ctaGradient: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 18 },
    ctaText: { fontFamily: typo.h3.fontFamily, fontSize: 18 },
});
