import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/utils';
import { Card } from '@/components/ui/Card';
import { Skeleton, EmptyState, GeneratingSteps } from '@/components/ui';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { TAB_BAR_H } from './_layout';
import { useQuery, useMutation } from '@tanstack/react-query';
import { getCurrent as getCurrentShift } from '@/api/shifts';
import { generatePlan } from '@/api/ai';
import { getModel } from '@/api/circadian';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/Button';
import { getErrorMessage } from '@/utils/validation';

// Staged status lines shown while the AI protocol is generated (10–30s).
const PROTOCOL_GEN_STEPS = [
    'Reading your circadian profile…',
    'Calculating macro targets…',
    'Timing your meals to your shift…',
    'Scheduling your activation window…',
    'Finalizing your plan…',
];

export default function CircadianScreen() {
    const { colors, typography, spacing, borderRadius, shadows } = useTheme();
    const insets = useSafeAreaInsets();
    const { user } = useAuthStore();
    const router = useRouter();
    const [selectedTab, setSelectedTab] = useState<'profile' | 'plan'>('profile');

    const { data: currentShift, isLoading: isLoadingShift } = useQuery({
        queryKey: ['current-shift'],
        queryFn: getCurrentShift,
    });

    const { data: circadianModel } = useQuery({
        queryKey: ['circadian-model'],
        queryFn: getModel,
        enabled: !!currentShift,
    });

    const { data: plan, isPending: isLoadingPlan, mutate: generateAIPlan } = useMutation({
        mutationFn: () => {
            const currentUserId = user?.id ? String(user.id) : 'unknown';
            return generatePlan({
                userId: currentUserId,
                date: new Date().toISOString().split('T')[0] as string,
                shiftId: String(currentShift?.id ?? ''),
                shiftType: (currentShift?.type as string) || 'night',
            });
        },
        onError: (error: unknown) => {
            Alert.alert('Error', getErrorMessage(error));
        },
    });

    const profileMetrics = useMemo(() => {
        if (!currentShift) return null;

        // Use circadian model data if available, otherwise estimate from shift times
        if (circadianModel) {
            return {
                melatoninStart: circadianModel.melatoninOnset || '--:--',
                caffeineCutoff: circadianModel.caffeineCutoff || '--:--',
                insulinStart: circadianModel.insulinPeak || '--:--',
                peakTemp: circadianModel.peakTemperature || '--:--',
                entrainmentScore: circadianModel.entrainmentScore ?? null,
            };
        }

        const endTime = new Date(currentShift.endTime);
        const melatoninStart = new Date(endTime.getTime() + 1 * 60 * 60 * 1000);
        const caffeineCutoff = new Date(endTime.getTime() - 6 * 60 * 60 * 1000);
        const insulinStart = new Date(currentShift.startTime);

        return {
            melatoninStart: melatoninStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            caffeineCutoff: caffeineCutoff.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            insulinStart: insulinStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            peakTemp: new Date(currentShift.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            entrainmentScore: null as number | null,
        };
    }, [currentShift, circadianModel]);

    // Use AI plan data if available, otherwise estimate from shift
    const protocol = useMemo(() => {
        if (plan && Array.isArray((plan as any).items)) {
            return (plan as any).items;
        }
        // Fallback estimation from shift data
        return [
            { type: 'meal', title: 'Pre-Shift Protein', time: profileMetrics?.insulinStart || '20:00', macros: '40P / 20C / 15F' },
            { type: 'workout', title: 'Activation Protocol', time: '21:00', duration: '30m' },
            { type: 'meal', title: 'Mid-Shift Fuel', time: '01:00', macros: '30P / 40C / 10F' },
            { type: 'action', title: 'Caffeine Cutoff', time: profileMetrics?.caffeineCutoff || '02:00', note: 'Switch to water/decaf' },
            { type: 'meal', title: 'Recovery Fast', time: '06:00', macros: 'Fasting Window Starts' },
        ];
    }, [plan, profileMetrics]);

    const entrainmentScore = profileMetrics?.entrainmentScore ?? (circadianModel as any)?.score ?? null;

    // ── Metric tiles config (keeps bindings identical, removes repetition) ──
    const metricTiles = [
        { key: 'melatonin', accent: colors.accent.blue, icon: 'moon' as const, label: 'Melatonin Onset', value: profileMetrics?.melatoninStart || '--:--' },
        { key: 'caffeine', accent: colors.accent.amber, icon: 'cafe' as const, label: 'Caffeine Cutoff', value: profileMetrics?.caffeineCutoff || '--:--' },
        { key: 'insulin', accent: colors.accent.cyan, icon: 'restaurant' as const, label: 'Insulin Peak', value: profileMetrics?.insulinStart || '--:--' },
        { key: 'temp', accent: colors.accent.coral, icon: 'thermometer' as const, label: 'Peak Temp', value: profileMetrics?.peakTemp || '--:--' },
    ];

    const shiftType = (currentShift?.type ?? (currentShift as any)?.shiftType) as string | undefined;
    const shiftLabel = shiftType
        ? `${shiftType.charAt(0).toUpperCase()}${shiftType.slice(1)} Shift`
        : currentShift
            ? 'Active Shift'
            : 'No active shift';
    const shiftIcon: keyof typeof Ionicons.glyphMap = shiftType === 'day' ? 'sunny' : 'moon';

    // ── Loading: layout-matched skeleton scaffold (no bare spinner) ──
    if (isLoadingShift) {
        return (
            <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background.primary }]}>
                <View style={[styles.header, { paddingHorizontal: spacing['2xl'], marginTop: spacing.lg }]}>
                    <Skeleton width={130} height={13} radius={borderRadius.sm} />
                    <Skeleton width="100%" height={120} radius={borderRadius['2xl']} style={{ marginTop: spacing.md }} />
                </View>
                <View style={[styles.tabSelector, { paddingHorizontal: spacing['2xl'], borderBottomColor: withAlpha(colors.text.primary, 0.05) }]}>
                    <Skeleton width={96} height={18} radius={borderRadius.sm} style={{ marginRight: spacing['2xl'] }} />
                    <Skeleton width={88} height={18} radius={borderRadius.sm} />
                </View>
                <View style={{ padding: spacing.lg }}>
                    <Skeleton width={150} height={12} radius={borderRadius.sm} style={{ marginBottom: spacing.lg }} />
                    <View style={styles.grid}>
                        {[0, 1, 2, 3].map((i) => (
                            <Skeleton key={i} width="48%" height={132} radius={borderRadius.xl} />
                        ))}
                    </View>
                    <Skeleton width="100%" height={180} radius={borderRadius['2xl']} style={{ marginTop: spacing['2xl'] }} />
                </View>
            </View>
        );
    }

    return (
        <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background.primary }]}>
            {/* ══ HERO ════════════════════════════════════════════════════ */}
            <View style={[styles.header, { paddingHorizontal: spacing['2xl'], marginTop: spacing.lg }]}>
                <Text style={[typography.overline, { color: colors.text.secondary, marginBottom: spacing.sm }]}>
                    Chronobiology
                </Text>
                <Card
                    variant="glass"
                    noPadding
                    style={[
                        styles.heroCard,
                        { borderColor: withAlpha(colors.accent.coral, 0.28), borderRadius: borderRadius['2xl'] },
                        shadows.glow(colors.accent.coral),
                    ]}
                >
                    <LinearGradient
                        colors={[withAlpha(colors.accent.coral, 0.16), 'transparent']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={StyleSheet.absoluteFillObject}
                        pointerEvents="none"
                    />
                    <View style={[styles.heroBody, { padding: spacing.xl }]}>
                        <View style={{ flex: 1, paddingRight: spacing.md }}>
                            <Text style={[typography.display, { color: colors.text.primary, fontSize: 32, lineHeight: 38 }]}>
                                Circadian
                            </Text>
                            <Text style={[typography.display, { color: colors.accent.coral, fontSize: 32, lineHeight: 38 }]}>
                                Optimizer
                            </Text>
                            <View
                                style={[
                                    styles.shiftChip,
                                    {
                                        backgroundColor: withAlpha(currentShift ? colors.accent.coral : colors.text.secondary, 0.12),
                                        borderColor: withAlpha(currentShift ? colors.accent.coral : colors.text.secondary, 0.28),
                                        marginTop: spacing.lg,
                                        paddingVertical: spacing.xs + 2,
                                        paddingHorizontal: spacing.md,
                                    },
                                ]}
                            >
                                <Ionicons
                                    name={shiftIcon}
                                    size={13}
                                    color={currentShift ? colors.accent.coral : colors.text.secondary}
                                />
                                <Text
                                    style={[
                                        typography.captionMedium,
                                        { color: currentShift ? colors.text.primary : colors.text.secondary, marginLeft: spacing.xs + 2 },
                                    ]}
                                >
                                    {currentShift ? `Active ${shiftLabel}` : shiftLabel}
                                </Text>
                            </View>
                        </View>
                        <View
                            style={[
                                styles.heroIcon,
                                {
                                    backgroundColor: withAlpha(colors.accent.coral, 0.14),
                                    borderColor: withAlpha(colors.accent.coral, 0.3),
                                },
                            ]}
                        >
                            <Ionicons name="pulse" size={28} color={colors.accent.coral} />
                        </View>
                    </View>
                </Card>
            </View>

            {/* ══ TAB SELECTOR ════════════════════════════════════════════ */}
            <View style={[styles.tabSelector, { paddingHorizontal: spacing['2xl'], borderBottomColor: withAlpha(colors.text.primary, 0.06) }]}>
                <TouchableOpacity
                    activeOpacity={0.85}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: selectedTab === 'profile' }}
                    style={[styles.tab, selectedTab === 'profile' && { borderBottomColor: colors.accent.coral, borderBottomWidth: 2 }]}
                    onPress={() => setSelectedTab('profile')}
                >
                    <Text style={[typography.subhead, { color: selectedTab === 'profile' ? colors.accent.coral : colors.text.secondary }]}>
                        Profile Hub
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    activeOpacity={0.85}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: selectedTab === 'plan' }}
                    style={[styles.tab, selectedTab === 'plan' && { borderBottomColor: colors.accent.coral, borderBottomWidth: 2 }]}
                    onPress={() => setSelectedTab('plan')}
                >
                    <Text style={[typography.subhead, { color: selectedTab === 'plan' ? colors.accent.coral : colors.text.secondary }]}>
                        AI Protocol
                    </Text>
                </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: TAB_BAR_H + 80 }} showsVerticalScrollIndicator={false}>
                {selectedTab === 'profile' && (
                    <View>
                        {!currentShift ? (
                            <EmptyState
                                icon="moon-outline"
                                title="No shift to sync to"
                                subtitle="Log your current shift and we'll map your melatonin, caffeine and insulin windows to keep your body clock aligned."
                                actionLabel="Schedule a shift"
                                onAction={() => router.push('/(tabs)/schedule' as any)}
                            />
                        ) : (
                            <>
                                <Text style={[typography.overline, { color: colors.text.secondary, marginBottom: spacing.lg }]}>
                                    Biological Windows
                                </Text>
                                <View style={styles.grid}>
                                    {metricTiles.map((tile) => (
                                        <Card
                                            key={tile.key}
                                            variant="glass"
                                            style={[styles.metricCard, { borderColor: withAlpha(tile.accent, 0.25) }]}
                                        >
                                            <View style={[styles.metricIcon, { backgroundColor: withAlpha(tile.accent, 0.14) }]}>
                                                <Ionicons name={tile.icon} size={22} color={tile.accent} />
                                            </View>
                                            <Text style={[typography.caption, { color: colors.text.secondary, marginTop: spacing.md + 2 }]}>
                                                {tile.label}
                                            </Text>
                                            <Text style={[typography.statSmall, { color: colors.text.primary, marginTop: spacing.xs }]}>
                                                {tile.value}
                                            </Text>
                                        </Card>
                                    ))}
                                </View>

                                {/* Entrainment Score */}
                                <Card
                                    variant="glass"
                                    style={[
                                        styles.scoreCard,
                                        { borderColor: withAlpha(colors.accent.cyan, 0.3), borderRadius: borderRadius['2xl'], marginTop: spacing['2xl'] },
                                        shadows.glow(colors.accent.cyan),
                                    ]}
                                >
                                    <LinearGradient
                                        colors={[withAlpha(colors.accent.cyan, 0.1), 'transparent']}
                                        start={{ x: 0, y: 0 }}
                                        end={{ x: 0, y: 1 }}
                                        style={StyleSheet.absoluteFillObject}
                                        pointerEvents="none"
                                    />
                                    <Text style={[typography.overline, { color: colors.text.secondary, textAlign: 'center' }]}>
                                        Entrainment Score
                                    </Text>
                                    <Text style={[typography.statLarge, { color: colors.accent.cyan, textAlign: 'center', marginVertical: spacing.sm }]}>
                                        {entrainmentScore ?? '--'}
                                        <Text style={[typography.statSmall, { color: colors.text.secondary }]}>/100</Text>
                                    </Text>
                                    <Text style={[typography.bodySm, { color: colors.text.secondary, textAlign: 'center', paddingHorizontal: spacing.lg }]}>
                                        {entrainmentScore != null && entrainmentScore >= 80
                                            ? 'Good alignment. Try getting 15m of sunlight upon waking to improve this score.'
                                            : entrainmentScore != null
                                                ? 'Room for improvement. Focus on consistent sleep/wake times.'
                                                : 'Log more shifts to calculate your score.'}
                                    </Text>
                                </Card>
                            </>
                        )}
                    </View>
                )}

                {selectedTab === 'plan' && (
                    <View>
                        <View style={[styles.planHeader, { marginBottom: spacing.xl }]}>
                            <Text style={[typography.overline, { color: colors.text.secondary }]}>Today's Protocol</Text>
                            <Button
                                title="Regenerate"
                                size="sm"
                                variant="outline"
                                icon={<Ionicons name="sparkles" size={14} color={colors.accent.coral} />}
                                onPress={() => generateAIPlan()}
                                disabled={isLoadingPlan}
                            />
                        </View>

                        {isLoadingPlan ? (
                            <View>
                                <Card
                                    variant="glass"
                                    style={[
                                        styles.genCard,
                                        { borderColor: withAlpha(colors.accent.coral, 0.25), marginBottom: spacing.xl },
                                    ]}
                                >
                                    <GeneratingSteps
                                        active={isLoadingPlan}
                                        steps={PROTOCOL_GEN_STEPS}
                                        color={colors.accent.coral}
                                        layout="column"
                                    />
                                </Card>
                                {[0, 1, 2, 3].map((i) => (
                                    <View key={i} style={[styles.timelineItem, { marginBottom: spacing.lg }]}>
                                        <View style={styles.timeColumn}>
                                            <Skeleton width={40} height={12} radius={borderRadius.sm} />
                                        </View>
                                        <Skeleton width="100%" height={72} radius={borderRadius.xl} style={{ flex: 1 }} />
                                    </View>
                                ))}
                            </View>
                        ) : (
                            <View>
                                {protocol.map((item: any, idx: number) => {
                                    const accent = item.type === 'meal'
                                        ? colors.accent.cyan
                                        : item.type === 'workout'
                                            ? colors.accent.amber
                                            : colors.accent.coral;
                                    return (
                                        <View key={idx} style={[styles.timelineItem, { marginBottom: spacing.lg }]}>
                                            <View style={styles.timeColumn}>
                                                <Text style={[typography.statTiny, { color: colors.text.primary, fontSize: 13 }]}>{item.time}</Text>
                                                {idx !== protocol.length - 1 && (
                                                    <View style={[styles.timelineLine, { backgroundColor: colors.border.light }]} />
                                                )}
                                            </View>
                                            <Card variant="glass" style={[styles.protocolCard, { borderColor: withAlpha(accent, 0.2) }]}>
                                                <View style={styles.protocolRow}>
                                                    <View style={[styles.protocolIcon, { backgroundColor: withAlpha(accent, 0.14) }]}>
                                                        <Ionicons
                                                            name={item.type === 'meal' ? 'restaurant' : item.type === 'workout' ? 'barbell' : 'warning'}
                                                            size={18}
                                                            color={accent}
                                                        />
                                                    </View>
                                                    <View style={{ flex: 1 }}>
                                                        <Text style={[typography.subhead, { color: colors.text.primary }]}>{item.title}</Text>
                                                        <Text style={[typography.caption, { color: colors.text.secondary, marginTop: spacing.xxs }]}>
                                                            {item.type === 'meal' ? item.macros : item.type === 'workout' ? item.duration : item.note}
                                                        </Text>
                                                    </View>
                                                    {item.type === 'meal' && (
                                                        <TouchableOpacity
                                                            activeOpacity={0.85}
                                                            accessibilityRole="button"
                                                            accessibilityLabel={`Swap ${item.title}`}
                                                            style={[styles.swapBtn, { backgroundColor: withAlpha(colors.text.primary, 0.06) }]}
                                                            onPress={() => router.push('/(modals)/build-plate' as any)}
                                                        >
                                                            <Ionicons name="swap-horizontal" size={16} color={colors.text.secondary} />
                                                            <Text style={[typography.caption, { color: colors.text.secondary, marginLeft: spacing.xs }]}>Swap</Text>
                                                        </TouchableOpacity>
                                                    )}
                                                </View>
                                            </Card>
                                        </View>
                                    );
                                })}
                            </View>
                        )}
                    </View>
                )}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { marginBottom: 16 },
    heroCard: {
        overflow: 'hidden',
    },
    heroBody: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    heroIcon: {
        width: 56,
        height: 56,
        borderRadius: 18,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    shiftChip: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        borderWidth: 1,
        borderRadius: 999,
    },
    tabSelector: {
        flexDirection: 'row',
        marginBottom: 16,
        borderBottomWidth: 1,
    },
    tab: {
        marginRight: 24,
        paddingBottom: 12,
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
    },
    metricCard: {
        width: '48%',
        padding: 18,
    },
    metricIcon: {
        width: 44,
        height: 44,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    scoreCard: {
        padding: 28,
        alignItems: 'center',
        overflow: 'hidden',
    },
    planHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    genCard: {
        paddingVertical: 24,
        paddingHorizontal: 20,
        alignItems: 'center',
    },
    timelineItem: {
        flexDirection: 'row',
    },
    timeColumn: {
        width: 60,
        alignItems: 'center',
    },
    timelineLine: {
        width: 2,
        flex: 1,
        marginTop: 8,
        borderRadius: 1,
    },
    protocolCard: {
        flex: 1,
        padding: 16,
    },
    protocolRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    protocolIcon: {
        width: 40,
        height: 40,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    swapBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 10,
    }
});
