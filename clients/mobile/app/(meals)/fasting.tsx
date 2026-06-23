import React, { useState, useEffect } from 'react';
import {
    View, Text, StyleSheet, ScrollView, Pressable,
    Dimensions, Alert
} from 'react-native';

import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getFastingLogs, startFasting, endFasting } from '@/api/meals';
import { Button, GlassCard, CtaButton, Skeleton, EmptyState } from '@/components/ui';
import { FastingTimerRing } from '@/components/FastingTimerRing';
import { CountUpText } from '@/components/CountUpText';
import { withAlpha } from '@/theme/utils';
import { getErrorMessage } from '@/utils/validation';
import { format, differenceInSeconds, parseISO, addHours } from 'date-fns';
import Animated, { FadeInDown } from 'react-native-reanimated';

const { width } = Dimensions.get('window');
const RING_SIZE = Math.min(width * 0.74, 320);

// House entrance recipe — staggered FadeInDown spring (matches sibling screens).
const enter = (i: number) => FadeInDown.delay(70 + i * 45).springify().damping(18).mass(0.7);

const PROTOCOLS = [
    { label: '16:8', hours: 16, blurb: '16h fast · 8h eat' },
    { label: '18:6', hours: 18, blurb: '18h fast · 6h eat' },
    { label: '20:4', hours: 20, blurb: '20h fast · 4h eat' },
    { label: '24h', hours: 24, blurb: 'Full-day reset' },
];

export default function FastingScreen() {
    const { colors, typography, borderRadius } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const queryClient = useQueryClient();

    const [selectedHours, setSelectedHours] = useState(16);
    const [elapsed, setElapsed] = useState(0);

    // ── Queries ─────────────────────────────────────────────────────────────
    const fastingQuery = useQuery({
        queryKey: ['fasting-logs'],
        queryFn: () => getFastingLogs(1),
    });

    const startMutation = useMutation({
        mutationFn: (h: number) => startFasting(h),
        onError: (err: unknown) => { Alert.alert('Error', getErrorMessage(err)); },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['fasting-logs'] }),
    });

    const endMutation = useMutation({
        mutationFn: () => endFasting(),
        onError: (err: unknown) => { Alert.alert('Error', getErrorMessage(err)); },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['fasting-logs'] }),
    });

    const activeFast = fastingQuery.data?.[0]?.status === 'ACTIVE' ? fastingQuery.data[0] : null;

    useEffect(() => {
        let interval: ReturnType<typeof setInterval>;
        if (activeFast?.startedAt) {
            interval = setInterval(() => {
                try {
                    const seconds = differenceInSeconds(new Date(), parseISO(activeFast.startedAt));
                    setElapsed(seconds);
                } catch { /* guard against malformed dates */ }
            }, 1000);
        } else {
            setElapsed(0);
        }
        return () => clearInterval(interval);
    }, [activeFast]);

    const progress = activeFast?.targetHours ? Math.min(1, elapsed / (activeFast.targetHours * 3600)) : 0;

    const formatTime = (totalSeconds: number) => {
        const h = Math.floor(totalSeconds / 3600);
        const m = Math.floor((totalSeconds % 3600) / 60);
        const s = totalSeconds % 60;
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    // ── Derived display values ───────────────────────────────────────────────
    const targetHours = activeFast ? activeFast.targetHours : selectedHours;
    const goalReached = !!activeFast && elapsed >= activeFast.targetHours * 3600;
    const remainingSeconds = activeFast
        ? Math.max(0, activeFast.targetHours * 3600 - elapsed)
        : selectedHours * 3600;

    const endsAtLabel = activeFast?.startedAt
        ? (() => { try { return format(addHours(parseISO(activeFast.startedAt), activeFast.targetHours), 'HH:mm'); } catch { return '--:--'; } })()
        : '--:--';

    // Whole-hour value for the stat pill (minutes stay in the ring). Round UP so a
    // fast with "15h 59m" left still reads "16h" remaining, matching user expectation.
    const remainingHours = activeFast ? Math.ceil(remainingSeconds / 3600) : selectedHours;

    // Past fasts for the history strip — completed/cancelled logs from the query
    // (active one is excluded). Newest first; defensive sort on startedAt.
    const history = (fastingQuery.data ?? [])
        .filter((f) => f.status !== 'ACTIVE')
        .slice()
        .sort((a, b) => {
            const ta = a.startedAt ? new Date(a.startedAt).getTime() : 0;
            const tb = b.startedAt ? new Date(b.startedAt).getTime() : 0;
            return tb - ta;
        });

    const formatHistoryDuration = (f: { startedAt: string; endedAt?: string; actualHours?: number; targetHours: number }) => {
        if (typeof f.actualHours === 'number' && Number.isFinite(f.actualHours)) {
            const h = Math.floor(f.actualHours);
            const m = Math.round((f.actualHours - h) * 60);
            return m > 0 ? `${h}h ${m}m` : `${h}h`;
        }
        try {
            if (f.startedAt && f.endedAt) {
                const secs = differenceInSeconds(parseISO(f.endedAt), parseISO(f.startedAt));
                const h = Math.floor(secs / 3600);
                const m = Math.floor((secs % 3600) / 60);
                return `${h}h ${m.toString().padStart(2, '0')}m`;
            }
        } catch { /* fall through */ }
        return `${f.targetHours}h goal`;
    };

    const formatHistoryDate = (iso?: string) => {
        if (!iso) return '';
        try { return format(parseISO(iso), 'MMM d'); } catch { return ''; }
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
            <StatusBar style="light" />
            {/* Header */}
            <View style={[styles.header, { paddingTop: insets.top + 20, borderBottomColor: colors.border.default }]}>
                <Pressable
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    accessibilityRole="button"
                    accessibilityLabel="Go back"
                    onPress={() => router.back()}
                    style={({ pressed }) => [
                        styles.backBtn,
                        { backgroundColor: colors.background.secondary, borderColor: colors.border.default },
                        pressed && { transform: [{ scale: 0.96 }] },
                    ]}
                >
                    <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
                </Pressable>
                <Text style={[typography.h2, { color: colors.text.primary }]}>Fasting</Text>
                <View style={{ width: 44 }} />
            </View>

            {fastingQuery.isLoading ? (
                <ScrollView contentContainerStyle={{ padding: 20, alignItems: 'center', paddingBottom: insets.bottom + 100 }}>
                    <Skeleton width={RING_SIZE} height={RING_SIZE} radius={borderRadius.full} style={{ marginTop: 40 }} />
                    <View style={styles.statRow}>
                        <Skeleton width="31%" height={84} radius={borderRadius.xl} />
                        <Skeleton width="31%" height={84} radius={borderRadius.xl} />
                        <Skeleton width="31%" height={84} radius={borderRadius.xl} />
                    </View>
                    <Skeleton width="100%" height={60} radius={borderRadius.xl} style={{ marginTop: 40 }} />
                    <Skeleton width="100%" height={110} radius={borderRadius.xl} style={{ marginTop: 32 }} />
                </ScrollView>
            ) : fastingQuery.isError ? (
                <EmptyState
                    icon="cloud-offline-outline"
                    title="Couldn't load fasting"
                    subtitle="Something went wrong loading your fasting status. Check your connection and try again."
                    actionLabel="Try Again"
                    onAction={() => fastingQuery.refetch()}
                />
            ) : (
            <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, alignItems: 'center', paddingBottom: insets.bottom + 100 }} showsVerticalScrollIndicator={false}>
                {/* Status eyebrow — live region so the GOAL-REACHED milestone is spoken
                    (per-second timer stays non-live; the eyebrow flip is the announcement). */}
                <Animated.View
                    entering={enter(0)}
                    style={styles.statusPill}
                    accessibilityRole="text"
                    accessibilityLiveRegion="polite"
                    accessibilityLabel={goalReached ? 'Goal reached' : activeFast ? 'Fasting in progress' : 'Ready to start'}
                >
                    <View style={[styles.statusDot, { backgroundColor: activeFast ? colors.accent.coral : colors.text.tertiary }]} />
                    <Text style={[typography.overline, { color: activeFast ? colors.accent.coral : colors.text.secondary }]}>
                        {goalReached ? 'GOAL REACHED' : activeFast ? 'FASTING IN PROGRESS' : 'READY TO START'}
                    </Text>
                </Animated.View>

                {/* Hero timer ring */}
                <Animated.View
                    entering={enter(1)}
                    style={styles.timerContainer}
                    accessibilityRole="image"
                    accessibilityLabel={activeFast
                        ? `Fasting timer, ${formatTime(elapsed)} elapsed, ${Math.round(progress * 100)} percent of a ${targetHours} hour fast`
                        : `Ready to start a ${selectedHours} hour fast`}
                >
                    <FastingTimerRing
                        progress={progress}
                        size={RING_SIZE}
                        strokeWidth={18}
                        color={colors.accent.coral}
                        colorEnd={colors.accent.coralDark}
                        trackColor={colors.background.tertiary}
                        tickColor={colors.border.light}
                        active={!!activeFast}
                    >
                        <Text style={[typography.overline, { color: colors.text.secondary }]}>
                            {activeFast ? 'ELAPSED' : 'TARGET'}
                        </Text>
                        {activeFast ? (
                            // Live ticking HH:MM:SS — plain text (count-up would fight the per-second tick).
                            <Text style={[typography.statLarge, styles.heroTime, { color: colors.text.primary }]}>
                                {formatTime(elapsed)}
                            </Text>
                        ) : (
                            // Idle TARGET — animate the hour numeral up on mount / protocol change; ":00:00" stays static.
                            <View style={styles.heroTargetRow}>
                                <CountUpText
                                    value={selectedHours}
                                    style={[typography.statLarge, styles.heroTime, { color: colors.text.primary }]}
                                    accessibilityLabel={`${selectedHours} hour target`}
                                />
                                <Text style={[typography.statLarge, styles.heroTime, { color: colors.text.primary }]}>:00:00</Text>
                            </View>
                        )}
                        <View style={styles.heroSubRow}>
                            {activeFast ? (
                                <>
                                    <Ionicons name="flame" size={14} color={colors.accent.coral} />
                                    <Text style={[typography.captionMedium, { color: colors.accent.coral, marginLeft: 5 }]}>
                                        {Math.round(progress * 100)}% complete
                                    </Text>
                                </>
                            ) : (
                                <Text style={[typography.captionMedium, { color: colors.text.tertiary }]}>
                                    Tap start below
                                </Text>
                            )}
                        </View>
                    </FastingTimerRing>
                </Animated.View>

                {/* Stat pills — all three numerals at one statSmall size, tabular, whole-hour
                    values count up on entrance (minutes live in the ring, not the pill). */}
                <Animated.View entering={enter(2)} style={styles.statRow}>
                    <StatPill
                        icon="flag-outline"
                        tint={colors.accent.coral}
                        label="Target"
                        countValue={targetHours}
                        unit="h"
                        colors={colors}
                        typography={typography}
                        borderRadius={borderRadius}
                    />
                    <StatPill
                        icon="hourglass-outline"
                        tint={colors.accent.cyan}
                        label={activeFast ? 'Remaining' : 'Window'}
                        countValue={remainingHours}
                        unit="h"
                        colors={colors}
                        typography={typography}
                        borderRadius={borderRadius}
                    />
                    <StatPill
                        icon="time-outline"
                        tint={colors.accent.amber}
                        label="Ends At"
                        value={endsAtLabel}
                        colors={colors}
                        typography={typography}
                        borderRadius={borderRadius}
                    />
                </Animated.View>

                {/* Protocol Selection */}
                {!activeFast && (
                    <Animated.View entering={enter(3)} style={{ width: '100%', marginTop: 28 }}>
                        <Text style={[typography.overline, { color: colors.text.secondary, marginBottom: 12 }]}>SELECT PROTOCOL</Text>
                        <View style={styles.protocolGrid}>
                            {PROTOCOLS.map((p) => {
                                const active = selectedHours === p.hours;
                                return (
                                <Pressable
                                    key={p.label}
                                    accessibilityRole="button"
                                    accessibilityState={{ selected: active }}
                                    accessibilityLabel={`${p.label} fasting protocol`}
                                    style={({ pressed }) => [
                                        styles.protocolBtn,
                                        {
                                            backgroundColor: active ? withAlpha(colors.accent.coral, 0.16) : colors.background.secondary,
                                            borderColor: active ? colors.accent.coral : colors.border.default,
                                        },
                                        pressed && { transform: [{ scale: 0.96 }] },
                                    ]}
                                    onPress={() => setSelectedHours(p.hours)}
                                >
                                    <View style={styles.protocolTop}>
                                        <Text style={[typography.h3, { color: active ? colors.accent.coral : colors.text.primary }]}>{p.label}</Text>
                                        {active && <Ionicons name="checkmark-circle" size={18} color={colors.accent.coral} />}
                                    </View>
                                    <Text style={[typography.caption, { color: colors.text.tertiary, marginTop: 2 }]}>{p.blurb}</Text>
                                </Pressable>
                                );
                            })}
                        </View>
                    </Animated.View>
                )}

                {/* Action Button */}
                <Animated.View entering={enter(4)} style={{ width: '100%' }}>
                    {activeFast ? (
                        <Button
                            title={elapsed >= activeFast.targetHours * 3600 ? 'COMPLETE FAST' : 'END FAST EARLY'}
                            variant="outline"
                            style={{ width: '100%', marginTop: 36, height: 60 }}
                            onPress={() => endMutation.mutate()}
                            loading={startMutation.isPending || endMutation.isPending}
                            disabled={startMutation.isPending || endMutation.isPending}
                        />
                    ) : (
                        <CtaButton
                            size="lg"
                            label="START FASTING"
                            icon="play"
                            style={{ width: '100%', marginTop: 36, height: 60 }}
                            onPress={() => startMutation.mutate(selectedHours)}
                            loading={startMutation.isPending || endMutation.isPending}
                            disabled={startMutation.isPending || endMutation.isPending}
                        />
                    )}
                </Animated.View>

                {/* Fasting history */}
                <Animated.View entering={enter(5)} style={{ width: '100%', marginTop: 36 }}>
                    <View style={styles.sectionHeader}>
                        <Text style={[typography.overline, { color: colors.text.secondary }]}>RECENT FASTS</Text>
                        <Ionicons name="albums-outline" size={16} color={colors.text.tertiary} />
                    </View>

                    {history.length === 0 ? (
                        <GlassCard radius={borderRadius.xl} style={{ marginTop: 12 }}>
                            <View style={styles.historyEmpty}>
                                <Ionicons name="timer-outline" size={22} color={colors.text.tertiary} />
                                <Text style={[typography.bodySm, { color: colors.text.secondary, marginTop: 8, textAlign: 'center' }]}>
                                    No completed fasts yet. Your finished fasts will appear here.
                                </Text>
                            </View>
                        </GlassCard>
                    ) : (
                        <View style={{ marginTop: 12, gap: 10 }}>
                            {history.map((f) => {
                                const completed = f.status === 'COMPLETED';
                                const tint = completed ? colors.accent.cyan : colors.text.tertiary;
                                return (
                                    <GlassCard key={f.id} radius={borderRadius.lg}>
                                        <View style={styles.historyRow}>
                                            <View style={[styles.historyIcon, { backgroundColor: withAlpha(tint, 0.14) }]}>
                                                <Ionicons
                                                    name={completed ? 'checkmark' : 'close'}
                                                    size={18}
                                                    color={tint}
                                                />
                                            </View>
                                            <View style={{ flex: 1 }}>
                                                <Text style={[typography.subhead, { color: colors.text.primary }]}>
                                                    {formatHistoryDuration(f)}
                                                </Text>
                                                <Text style={[typography.caption, { color: colors.text.tertiary, marginTop: 1 }]}>
                                                    {formatHistoryDate(f.startedAt)} · {f.targetHours}h goal
                                                </Text>
                                            </View>
                                            <View style={[styles.statusTag, { backgroundColor: withAlpha(tint, 0.14) }]}>
                                                <Text style={[typography.caption, { color: tint, fontWeight: '700' }]}>
                                                    {completed ? 'Complete' : 'Ended early'}
                                                </Text>
                                            </View>
                                        </View>
                                    </GlassCard>
                                );
                            })}
                        </View>
                    )}
                </Animated.View>

                {/* Tips Card — AI (Ria) accent = purple */}
                <Animated.View
                    entering={enter(6)}
                    style={[
                        styles.tipsCard,
                        { backgroundColor: withAlpha(colors.accent.purple, 0.1), borderColor: withAlpha(colors.accent.purple, 0.4) },
                    ]}
                >
                    <View style={styles.tipsHeader}>
                        <View style={[styles.tipsIcon, { backgroundColor: withAlpha(colors.accent.purple, 0.18) }]}>
                            <Ionicons name="sparkles" size={16} color={colors.accent.purpleLight} />
                        </View>
                        <Text style={[typography.subhead, { color: colors.accent.purpleLight, marginLeft: 10 }]}>Ria's Fasting Tip</Text>
                    </View>
                    <Text style={[typography.body, { color: colors.text.secondary, marginTop: 10 }]}>
                        Drinking water or black coffee won't break your metabolic fast. Stay hydrated to maintain mental clarity during the final hours.
                    </Text>
                </Animated.View>
            </ScrollView>
            )}
        </View>
    );
}

// ── StatPill — tinted icon chip + label + condensed value/unit ────────────────
// Provide EITHER `countValue` (a whole number that animates up via CountUpText) or
// a static `value` string (e.g. the "07:30" ends-at clock). Both render at one
// consistent statSmall, tabular-nums size so the three hero-adjacent numerals match.
interface StatPillProps {
    icon: keyof typeof Ionicons.glyphMap;
    tint: string;
    label: string;
    value?: string;
    countValue?: number;
    unit?: string;
    colors: ReturnType<typeof useTheme>['colors'];
    typography: ReturnType<typeof useTheme>['typography'];
    borderRadius: ReturnType<typeof useTheme>['borderRadius'];
}

function StatPill({ icon, tint, label, value, countValue, unit, colors, typography, borderRadius }: StatPillProps) {
    return (
        <GlassCard style={styles.statPill} radius={borderRadius.xl}>
            <View style={styles.statPillInner}>
                <View style={[styles.statChip, { backgroundColor: withAlpha(tint, 0.16) }]}>
                    <Ionicons name={icon} size={15} color={tint} />
                </View>
                <Text style={[typography.overline, { color: colors.text.tertiary, marginTop: 8 }]} numberOfLines={1}>{label}</Text>
                <View style={styles.statValueRow}>
                    {typeof countValue === 'number' ? (
                        <CountUpText
                            value={countValue}
                            style={[typography.statSmall, styles.statValueNum, { color: colors.text.primary }]}
                            accessibilityLabel={`${countValue}${unit ?? ''}`}
                        />
                    ) : (
                        <Text style={[typography.statSmall, styles.statValueNum, { color: colors.text.primary }]} numberOfLines={1}>{value}</Text>
                    )}
                    {unit ? <Text style={[typography.statTiny, { color: colors.text.secondary, marginLeft: 1 }]}>{unit}</Text> : null}
                </View>
            </View>
        </GlassCard>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1 },
    backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1 },

    statusPill: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
    statusDot: { width: 8, height: 8, borderRadius: 4 },

    timerContainer: { marginTop: 18, alignItems: 'center', justifyContent: 'center' },
    heroTime: { marginVertical: 4, fontVariant: ['tabular-nums'], letterSpacing: 1 },
    heroTargetRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center' },
    heroSubRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 2 },

    statRow: { flexDirection: 'row', gap: 10, marginTop: 28, width: '100%' },
    statPill: { flex: 1 },
    statPillInner: { paddingVertical: 14, paddingHorizontal: 8, alignItems: 'center' },
    statChip: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    statValueRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 3, maxWidth: '100%' },
    statValueNum: { fontVariant: ['tabular-nums'] },

    protocolGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    protocolBtn: { flexGrow: 1, flexBasis: '46%', minHeight: 64, paddingHorizontal: 16, paddingVertical: 12, justifyContent: 'center', borderRadius: 16, borderWidth: 1 },
    protocolTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },

    sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' },
    historyEmpty: { paddingVertical: 22, paddingHorizontal: 16, alignItems: 'center' },
    historyRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, gap: 12 },
    historyIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    statusTag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 9999 },

    tipsCard: { padding: 18, borderRadius: 20, borderWidth: 1, marginTop: 28, width: '100%' },
    tipsHeader: { flexDirection: 'row', alignItems: 'center' },
    tipsIcon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
