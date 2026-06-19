import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Pressable, Alert } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/utils';
import { GlassCard } from '@/components/ui/GlassCard';
import { Skeleton, EmptyState, GeneratingSteps, CtaButton } from '@/components/ui';
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
import { getErrorMessage } from '@/utils/validation';

// Staged status lines shown while the AI protocol is generated (10–30s).
const PROTOCOL_GEN_STEPS = [
    'Reading your circadian profile…',
    'Calculating macro targets…',
    'Timing your meals to your shift…',
    'Scheduling your activation window…',
    'Finalizing your plan…',
];

// ── Plan → meal normalization (module scope = stable, no per-render alloc) ──

type PlannedMacros = { protein?: number; carbs?: number; fat?: number; calories?: number };
type PlannedFood = { name: string; amount?: string; calories?: number; protein?: number; carbs?: number; fat?: number; imageUrl?: string };

const MEAL_TYPES = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'] as const;
type MealType = (typeof MEAL_TYPES)[number];

/** Map a plan slot's title/explicit field to a canonical meal type. */
function mealTypeFromSlot(item: any): MealType {
    const explicit = String(item?.mealType ?? '').toUpperCase();
    if ((MEAL_TYPES as readonly string[]).includes(explicit)) return explicit as MealType;
    const title = String(item?.title ?? item?.name ?? '').toLowerCase();
    if (/break|wake|suhoor|anchor|morning/.test(title)) return 'BREAKFAST';
    if (/lunch|midday|noon/.test(title)) return 'LUNCH';
    if (/dinner|evening|iftar|supper/.test(title)) return 'DINNER';
    return 'SNACK';
}

const toNum = (v: unknown): number | undefined => {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
};

/**
 * Normalize a plan timeline MEAL row into a shape that ALSO carries the four
 * fields the "Log this" flow consumes (mealType, plannedMacros, suggestedFoods,
 * planMealId). The plan can arrive in two shapes — a flat timeline row
 * (`{ macros: '40P / 20C / 15F' }`) or the AI "Nutrition Cart" row
 * (`{ items: [{ name, calories, protein, ... }] }`) — so we read defensively
 * and preserve every original key (spread first) for the existing renderer.
 */
function normalizePlannedMeal(item: any) {
    const rawFoods: any[] = Array.isArray(item?.suggestedFoods)
        ? item.suggestedFoods
        : Array.isArray(item?.items)
            ? item.items
            : Array.isArray(item?.foods)
                ? item.foods
                : [];

    const suggestedFoods: PlannedFood[] = rawFoods
        .filter((f) => f && (f.name || f.title))
        .map((f) => ({
            name: String(f.name ?? f.title),
            amount: f.amount ? String(f.amount) : undefined,
            calories: toNum(f.calories),
            protein: toNum(f.protein),
            carbs: toNum(f.carbs),
            fat: toNum(f.fat),
            imageUrl: f.imageUrl ?? f.image ?? undefined,
        }));

    // Prefer explicit macro fields; else sum the suggested foods; else leave undefined.
    const sum = (k: keyof PlannedFood) =>
        suggestedFoods.length
            ? suggestedFoods.reduce((a, f) => a + (toNum(f[k]) ?? 0), 0)
            : undefined;

    const plannedMacros: PlannedMacros = {
        protein: toNum(item?.protein) ?? toNum(item?.plannedMacros?.protein) ?? sum('protein'),
        carbs: toNum(item?.carbs) ?? toNum(item?.plannedMacros?.carbs) ?? sum('carbs'),
        fat: toNum(item?.fat) ?? toNum(item?.plannedMacros?.fat) ?? sum('fat'),
        calories: toNum(item?.calories) ?? toNum(item?.plannedMacros?.calories) ?? sum('calories'),
    };

    return {
        ...item,
        mealType: mealTypeFromSlot(item),
        plannedMacros,
        suggestedFoods,
        planMealId: item?.planMealId ?? item?.id ?? item?.mealId ?? undefined,
    };
}

export default function CircadianScreen() {
    const { colors, typography, spacing, borderRadius } = useTheme();
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

    // ── Resolved shift type — SINGLE source of truth ────────────────────────
    // The shift payload has been seen with the type under either `type` (current
    // contract) or `shiftType` (legacy/engine). Resolve it ONCE here, dual-key,
    // and derive everything (label, icon, timeline, plan generation) from this
    // — never re-introduce a single-key read, which previously caused a wrong
    // label / "No active shift" regression when only `shiftType` was set.
    const shiftType = (currentShift?.type ?? (currentShift as any)?.shiftType) as string | undefined;

    const { data: plan, isPending: isLoadingPlan, mutate: generateAIPlan } = useMutation({
        mutationFn: () => {
            const currentUserId = user?.id ? String(user.id) : 'unknown';
            return generatePlan({
                userId: currentUserId,
                date: new Date().toISOString().split('T')[0] as string,
                shiftId: String(currentShift?.id ?? ''),
                shiftType: shiftType || 'night',
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

    // Use AI plan data if available, otherwise estimate from shift.
    //
    // Every MEAL row is normalized to ALSO carry the four fields the plan->meal
    // "Log this" flow needs, derived from whatever shape the plan provides:
    //   • mealType      — BREAKFAST|LUNCH|DINNER|SNACK (mapped from the slot)
    //   • plannedMacros — the macro summary string shown on the row
    //   • suggestedFoods — the plan's "Nutrition Cart" items for that meal
    //   • planMealId    — the originating plan-meal id (when the plan supplies one)
    // Non-meal rows (workout/action) are passed through untouched.
    const protocol = useMemo(() => {
        if (plan && Array.isArray((plan as any).items)) {
            return ((plan as any).items as any[]).map((item) =>
                item?.type === 'meal' ? normalizePlannedMeal(item) : item
            );
        }
        // Fallback estimation from shift data. The slot labels/times lean on the
        // resolved shiftType so a day worker doesn't see night-shift copy.
        const isDay = shiftType === 'day';
        return [
            {
                type: 'meal',
                title: isDay ? 'Wake Fuel' : 'Pre-Shift Protein',
                time: profileMetrics?.insulinStart || (isDay ? '07:00' : '20:00'),
                macros: '40P / 20C / 15F',
                mealType: 'BREAKFAST',
                plannedMacros: { protein: 40, carbs: 20, fat: 15 },
                suggestedFoods: [],
            },
            { type: 'workout', title: 'Activation Protocol', time: isDay ? '08:00' : '21:00', duration: '30m' },
            {
                type: 'meal',
                title: isDay ? 'Midday Fuel' : 'Mid-Shift Fuel',
                time: isDay ? '12:30' : '01:00',
                macros: '30P / 40C / 10F',
                mealType: 'LUNCH',
                plannedMacros: { protein: 30, carbs: 40, fat: 10 },
                suggestedFoods: [],
            },
            { type: 'action', title: 'Caffeine Cutoff', time: profileMetrics?.caffeineCutoff || (isDay ? '14:00' : '02:00'), note: 'Switch to water/decaf' },
            {
                type: 'meal',
                title: isDay ? 'Evening Meal' : 'Recovery Fast',
                time: isDay ? '18:30' : '06:00',
                macros: isDay ? '35P / 30C / 15F' : 'Fasting Window Starts',
                mealType: 'DINNER',
                plannedMacros: { protein: 35, carbs: 30, fat: 15 },
                suggestedFoods: [],
            },
        ];
    }, [plan, profileMetrics, shiftType]);

    const entrainmentScore = profileMetrics?.entrainmentScore ?? (circadianModel as any)?.score ?? null;

    // ── Metric tiles config (keeps bindings identical, removes repetition) ──
    const metricTiles = [
        { key: 'melatonin', accent: colors.accent.blue, icon: 'moon' as const, label: 'Melatonin Onset', value: profileMetrics?.melatoninStart || '--:--' },
        { key: 'caffeine', accent: colors.accent.amber, icon: 'cafe' as const, label: 'Caffeine Cutoff', value: profileMetrics?.caffeineCutoff || '--:--' },
        { key: 'insulin', accent: colors.accent.cyan, icon: 'restaurant' as const, label: 'Insulin Peak', value: profileMetrics?.insulinStart || '--:--' },
        { key: 'temp', accent: colors.accent.coral, icon: 'thermometer' as const, label: 'Peak Temp', value: profileMetrics?.peakTemp || '--:--' },
    ];

    // shiftLabel / shiftIcon derive from the SINGLE resolved `shiftType` above
    // (dual-key, declared once near the queries) — never a second single-key read.
    const shiftLabel = shiftType
        ? `${shiftType.charAt(0).toUpperCase()}${shiftType.slice(1)} Shift`
        : currentShift
            ? 'Active Shift'
            : 'No active shift';
    const shiftIcon: keyof typeof Ionicons.glyphMap = shiftType === 'day' ? 'sunny' : 'moon';

    // "Log this" → open the prefilled confirm screen for THIS planned meal slot.
    // Macros + suggested foods are passed as a single JSON query param (router
    // params are string-only); the new screen JSON.parses it back. useCallback +
    // a stable factory keep the row handler reference-stable per the list-perf
    // rules even though this is a small `.map`, not a FlatList.
    const handleLogPlanned = useCallback(
        (item: any) => {
            router.push({
                pathname: '/(meals)/log-planned-meal',
                params: {
                    mealType: mealTypeFromSlot(item),
                    title: String(item?.title ?? ''),
                    planMealId: item?.planMealId ? String(item.planMealId) : '',
                    plan: JSON.stringify({
                        plannedMacros: item?.plannedMacros ?? null,
                        suggestedFoods: Array.isArray(item?.suggestedFoods) ? item.suggestedFoods : [],
                        macros: typeof item?.macros === 'string' ? item.macros : undefined,
                    }),
                },
            } as any);
        },
        [router],
    );

    // ── Loading: layout-matched skeleton scaffold (no bare spinner) ──
    if (isLoadingShift) {
        return (
            <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background.primary }]}>
                <StatusBar style="light" />
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
                            <Skeleton key={i} width="48%" height={132} radius={borderRadius['2xl']} />
                        ))}
                    </View>
                    <Skeleton width="100%" height={180} radius={borderRadius['2xl']} style={{ marginTop: spacing['2xl'] }} />
                </View>
            </View>
        );
    }

    return (
        <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background.primary }]}>
            <StatusBar style="light" />
            {/* ══ HERO ════════════════════════════════════════════════════ */}
            <View style={[styles.header, { paddingHorizontal: spacing['2xl'], marginTop: spacing.lg }]}>
                <Text style={[typography.overline, { color: colors.text.secondary, marginBottom: spacing.sm }]}>
                    Chronobiology
                </Text>
                <GlassCard
                    glow={colors.accent.coral}
                    style={[
                        styles.heroCard,
                        { borderColor: withAlpha(colors.accent.coral, 0.28), borderRadius: borderRadius['2xl'] },
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
                </GlassCard>
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
                            <>
                                <EmptyState
                                    icon="moon-outline"
                                    title="No shift to sync to"
                                    subtitle="Log your current shift and we'll map your melatonin, caffeine and insulin windows to keep your body clock aligned."
                                />
                                {/* Reserved PRIMARY coralCta fill (#E55A25→#FF4D8D) — the EmptyState
                                    CTA rendered as a CtaButton so the brand fill matches spec. */}
                                <View style={styles.emptyCta}>
                                    <CtaButton
                                        label="Schedule a shift"
                                        icon="calendar-outline"
                                        onPress={() => router.push('/(tabs)/schedule' as any)}
                                    />
                                </View>
                            </>
                        ) : (
                            <>
                                <Text style={[typography.overline, { color: colors.text.secondary, marginBottom: spacing.lg }]}>
                                    Biological Windows
                                </Text>
                                <View style={styles.grid}>
                                    {metricTiles.map((tile) => (
                                        <GlassCard
                                            key={tile.key}
                                            style={[styles.metricCard, { borderColor: withAlpha(tile.accent, 0.25) }]}
                                        >
                                            <View style={[styles.metricIcon, { backgroundColor: withAlpha(tile.accent, 0.14) }]}>
                                                <Ionicons name={tile.icon} size={22} color={tile.accent} />
                                            </View>
                                            <Text style={[typography.caption, { color: colors.text.secondary, marginTop: spacing.md + 2 }]}>
                                                {tile.label}
                                            </Text>
                                            <Text
                                                style={[typography.statSmall, { color: colors.text.primary, marginTop: spacing.xs }]}
                                                maxFontSizeMultiplier={1.3}
                                            >
                                                {tile.value}
                                            </Text>
                                        </GlassCard>
                                    ))}
                                </View>

                                {/* Entrainment Score */}
                                <GlassCard
                                    glow={colors.accent.cyan}
                                    style={[
                                        styles.scoreCard,
                                        { borderColor: withAlpha(colors.accent.cyan, 0.3), borderRadius: borderRadius['2xl'], marginTop: spacing['2xl'] },
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
                                    <Text
                                        style={[typography.statLarge, { color: colors.accent.cyan, textAlign: 'center', marginVertical: spacing.sm }]}
                                        maxFontSizeMultiplier={1.3}
                                    >
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
                                </GlassCard>
                            </>
                        )}
                    </View>
                )}

                {selectedTab === 'plan' && (
                    <View>
                        <View style={[styles.planHeader, { marginBottom: spacing.xl }]}>
                            <Text style={[typography.overline, { color: colors.text.secondary }]}>Today's Protocol</Text>
                            <Pressable
                                accessibilityRole="button"
                                accessibilityLabel="Regenerate protocol"
                                accessibilityState={{ disabled: isLoadingPlan }}
                                disabled={isLoadingPlan}
                                hitSlop={8}
                                onPress={() => generateAIPlan()}
                                style={({ pressed }) => [
                                    styles.regenerateBtn,
                                    { borderColor: withAlpha(colors.accent.coral, 0.4) },
                                    pressed && !isLoadingPlan ? { backgroundColor: withAlpha(colors.accent.coral, 0.08) } : null,
                                    isLoadingPlan ? { opacity: 0.6 } : null,
                                ]}
                            >
                                <Ionicons name="sparkles" size={14} color={colors.accent.coral} />
                                <Text style={[typography.captionMedium, { color: colors.accent.coral }]}>Regenerate</Text>
                            </Pressable>
                        </View>

                        {isLoadingPlan ? (
                            <View>
                                <GlassCard
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
                                </GlassCard>
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
                                                <Text
                                                    style={[typography.statTiny, { color: colors.text.primary, fontSize: 13 }]}
                                                    maxFontSizeMultiplier={1.3}
                                                >
                                                    {item.time}
                                                </Text>
                                                {idx !== protocol.length - 1 && (
                                                    <View style={[styles.timelineLine, { backgroundColor: colors.border.light }]} />
                                                )}
                                            </View>
                                            <GlassCard style={[styles.protocolCard, { borderColor: withAlpha(accent, 0.2) }]}>
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
                                                            accessibilityLabel={`Log ${item.title}`}
                                                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                                            style={[styles.swapBtn, { backgroundColor: withAlpha(colors.accent.coral, 0.12) }]}
                                                            onPress={() => handleLogPlanned(item)}
                                                        >
                                                            <Ionicons name="add-circle-outline" size={16} color={colors.accent.coral} />
                                                            <Text style={[typography.caption, { color: colors.accent.coral, marginLeft: spacing.xs }]}>Log this</Text>
                                                        </TouchableOpacity>
                                                    )}
                                                </View>
                                            </GlassCard>
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
    regenerateBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        paddingVertical: 8,
        paddingHorizontal: 14,
        minHeight: 40,
        borderRadius: 14,
        borderWidth: 1,
        backgroundColor: 'transparent',
    },
    // EmptyState owns generous paddingVertical (40); tuck the coralCta CTA up
    // under the subtitle and keep it from going full-bleed.
    emptyCta: {
        alignItems: 'center',
        paddingHorizontal: 24,
        marginTop: -16,
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
        paddingVertical: 8,
        borderRadius: 10,
    }
});
