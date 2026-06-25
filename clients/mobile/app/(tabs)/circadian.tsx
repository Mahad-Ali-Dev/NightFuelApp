import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Pressable, Dimensions } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/utils';
import { GlassCard } from '@/components/ui/GlassCard';
import { Skeleton, EmptyState, GeneratingSteps, CtaButton } from '@/components/ui';
import { CircadianRing } from '@/components/CircadianRing';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { TAB_BAR_H } from './_layout';
import { useQuery, useMutation } from '@tanstack/react-query';
import { getCurrent as getCurrentShift } from '@/api/shifts';
// Plan generation goes through the METERED plan-service path (see mutationFn
// below), not '@/api/ai'. We still REUSE the shared 429 parser from '@/api/ai'
// — it is endpoint-agnostic and the single home of the AiQuotaError contract.
import { generatePlan } from '@/api/plans';
import { parseAiQuotaError, type AiQuotaError } from '@/api/ai';
import { getModel } from '@/api/circadian';
import { getErrorMessage } from '@/utils/validation';
// Single source of truth for the entrainment-advice copy + the no-model
// fallback biological-window math (src/lib/circadian/entrainment.ts). Adopting
// the helper kills the inline advice ternary and the inline endTime±h
// arithmetic so ENTRAINMENT_ADVICE / WINDOW_OFFSETS can't drift between this
// screen and its sibling consumer (dashboard EntrainmentCard).
import { entrainmentAdvice, deriveWindowsFromShift } from '@/lib/circadian/entrainment';

// Staged status lines shown while the AI protocol is generated (10–30s).
const PROTOCOL_GEN_STEPS = [
    'Reading your circadian profile…',
    'Calculating macro targets…',
    'Timing your meals to your shift…',
    'Scheduling your activation window…',
    'Finalizing your plan…',
];

// Width of a "Window Playbook" carousel card. Roughly 72% of the viewport so the
// next card peeks (signalling swipeability) and snapToInterval lands cleanly.
// Module scope = computed once, no per-render Dimensions read.
const CAROUSEL_CARD_W = Math.round(Math.min(Dimensions.get('window').width * 0.72, 280));

// Human-readable "resets" line for the daily-limit upgrade block. Renders a
// short local clock time ("Resets at 6:00 AM") when `resetsAt` is a parseable
// ISO timestamp, else a sensible fallback so the block never shows a raw date
// or "Invalid Date". Mirrors ai-planner.tsx's formatResetsAt (hoisted to
// module scope per the hoist-Intl rule — no per-render allocation).
function formatResetsAt(resetsAt: string): string {
    if (!resetsAt) return 'Resets at midnight UTC';
    const when = new Date(resetsAt);
    if (Number.isNaN(when.getTime())) return 'Resets at midnight UTC';
    const time = when.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    return `Resets at ${time}`;
}

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

/**
 * Render a plan meal's `macros` OBJECT ({protein,carbs,fat,calories}) as the
 * compact "40P / 20C / 15F" string the timeline row + the log-planned-meal
 * `macrosText` consume. The plan-service returns macros as an object (see
 * api/plans.ts PlanMeal.macros), NOT a pre-formatted string, so we format here.
 * Returns '' when no finite macro is present (the row then shows no subtitle).
 */
function macrosToText(macros: any): string {
    const p = toNum(macros?.protein);
    const c = toNum(macros?.carbs);
    const f = toNum(macros?.fat);
    const parts: string[] = [];
    if (p !== undefined) parts.push(`${Math.round(p)}P`);
    if (c !== undefined) parts.push(`${Math.round(c)}C`);
    if (f !== undefined) parts.push(`${Math.round(f)}F`);
    return parts.join(' / ');
}

/**
 * Adapt ONE plan-service meal (the real wire shape from POST /v1/plans/generate,
 * normalized by api/plans.ts → { time, label, description, macros:{...} }) into
 * the internal timeline-row shape the renderer + normalizePlannedMeal + the
 * "Log this" → log-planned-meal flow already speak:
 *   • type   'meal'  — every plan-service row IS a meal (no workout/action rows)
 *   • title  ← label — the slot title (drives mealTypeFromSlot + the row header)
 *   • note   ← description — the row subtitle copy
 *   • macros ← formatted string from the macros object (row subtitle + target)
 * The macros OBJECT is preserved under `plannedMacros` so normalizePlannedMeal
 * reads the real numbers (protein/carbs/fat/calories) for the log flow.
 */
function planMealToRow(meal: any) {
    return {
        type: 'meal' as const,
        time: meal?.time,
        title: meal?.label ?? meal?.title ?? '',
        note: meal?.description,
        macros: macrosToText(meal?.macros),
        plannedMacros: meal?.macros ?? undefined,
        // Forward the meal's itemized foods (normalizePlan maps the AI shape's
        // `items[]` → `suggestedFoods`) so the "Log this" → Confirm-Meal flow
        // prefills the real foods. normalizePlannedMeal reads this next.
        suggestedFoods: Array.isArray(meal?.suggestedFoods) ? meal.suggestedFoods : undefined,
    };
}

export default function CircadianScreen() {
    const { colors, typography, spacing, borderRadius } = useTheme();
    const insets = useSafeAreaInsets();
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

    // ── Plan generation failure ground truth — two MUTUALLY-EXCLUSIVE vars ───
    // `quota` holds the parsed daily-AI-limit 429 (the distinct upgrade state);
    // `genError` holds any other failure message (the retryable inline notice).
    // Exactly one is ever non-null — both are cleared on mutate start + success,
    // and onError sets precisely one. The visible block is DERIVED from whichever
    // is set (state = ground truth, not the rendered output).
    const [quota, setQuota] = useState<AiQuotaError | null>(null);
    const [genError, setGenError] = useState<string | null>(null);

    const { data: plan, isPending: isLoadingPlan, mutate: generateAIPlan } = useMutation({
        // METERED path: POST /v1/plans/generate (plan-service). Unlike '@/api/ai'
        // generatePlan (ai-pipeline /v1/ai/generate-plan, whose 429 is a plain
        // {error:'Rate limit exceeded',retryAfterSeconds}), this endpoint counts
        // toward the per-plan generations quota and returns the SHARED
        // 429 { error:'ai_quota_exceeded', limit, plan, resetsAt } contract — so
        // parseAiQuotaError below is real here, not dead code.
        mutationFn: () =>
            generatePlan({
                date: new Date().toISOString().split('T')[0] as string,
                circadianProfile: circadianModel ?? undefined,
                // Send `undefined` (NOT '') when there is no shift: the server
                // validates shiftId with z.string().uuid().optional(), so an
                // empty string fails the uuid() check → 400. Omitting the key
                // hits the .optional() branch instead. Mirrors planner.tsx,
                // which passes shiftQ.data?.id directly.
                shiftId: currentShift?.id ? String(currentShift.id) : undefined,
                shiftType: shiftType || 'night',
            }),
        onMutate: () => {
            // New attempt → clear any prior failure state so the timeline/loader
            // is the only thing showing while it runs.
            setQuota(null);
            setGenError(null);
        },
        onSuccess: () => {
            setQuota(null);
            setGenError(null);
        },
        onError: (error: unknown) => {
            // A 429 daily-AI-limit flips into the distinct upgrade state; any
            // other error (network / 5xx / non-quota 4xx) takes the retryable
            // inline error path. Set exactly one; clear the other.
            const q = parseAiQuotaError(error);
            if (q) {
                setQuota(q);
                setGenError(null);
            } else {
                setQuota(null);
                setGenError(getErrorMessage(error));
            }
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

        // No AI model yet → fall back to the shared window math (single source of
        // truth: src/lib/circadian/entrainment.ts; mirrors the dashboard
        // EntrainmentCard consumer). deriveWindowsFromShift THROWS on a malformed
        // timestamp, so wrap it: a bad ISO yields the '--:--' placeholders instead
        // of crashing the whole screen. entrainmentScore stays null in this branch
        // (no model = no score), preserved across both the success and catch paths.
        //
        // Rules: js-hoist-intl.md — the helper owns the toLocaleTimeString
        // formatting, so this branch adds NO per-render Intl/formatter allocation
        // (formatResetsAt likewise stays hoisted at module scope). state-ground-
        // truth.md — these windows are DERIVED from currentShift inside useMemo,
        // not stored as state; the only ground-truth state here remains the
        // mutually-exclusive quota/genError pair set by the mutation lifecycle.
        try {
            const windows = deriveWindowsFromShift({
                startTime: currentShift.startTime,
                endTime: currentShift.endTime,
            });
            return {
                melatoninStart: windows.melatoninStart,
                caffeineCutoff: windows.caffeineCutoff,
                insulinStart: windows.insulinStart,
                peakTemp: windows.peakTemp,
                entrainmentScore: null as number | null,
            };
        } catch {
            return {
                melatoninStart: '--:--',
                caffeineCutoff: '--:--',
                insulinStart: '--:--',
                peakTemp: '--:--',
                entrainmentScore: null as number | null,
            };
        }
    }, [currentShift, circadianModel]);

    // Real AI plan ONLY — there is NO fabricated fallback timeline. Previously
    // this returned a hardcoded 5-row Wake/Activation/Mid/Caffeine/Recovery
    // estimate whenever the real `plan` was absent, which meant a user who had
    // never generated a plan saw an invented meal/workout timeline with tappable
    // "Log this" buttons that pushed made-up macros into the meal log — the
    // fabricated-timeline / no-honest-empty-state anti-pattern. We now surface
    // ONLY what the AI actually returned.
    //
    // CONTRACT: the plan-service (POST /v1/plans/generate, normalized in
    // api/plans.ts) returns the day plan as `plan.meals` — an array of
    // { time, label, description, macros:{protein,carbs,fat,calories} } — and
    // NEVER `plan.items`. Reading `.items` therefore always saw `undefined`, so
    // the timeline was permanently empty even on a successful generation. We read
    // the field that actually exists (`plan.meals`, same as usePlan.ts) and adapt
    // each meal (planMealToRow) into the internal row shape the renderer speaks;
    // when `meals` is empty/absent the timeline is empty and the render shows the
    // honest "No protocol yet" EmptyState (state-ground-truth — never fabricate).
    //
    // Every row is then normalized to ALSO carry the four fields the plan->meal
    // "Log this" flow needs, derived from the meal's real shape:
    //   • mealType      — BREAKFAST|LUNCH|DINNER|SNACK (mapped from the slot)
    //   • plannedMacros — the meal's macros object (real protein/carbs/fat/cals)
    //   • suggestedFoods — the plan's itemized foods for that meal (if any)
    //   • planMealId    — the originating plan-meal id (when the plan supplies one)
    const protocol = useMemo(() => {
        const meals = Array.isArray((plan as any)?.meals) ? ((plan as any).meals as any[]) : [];
        if (meals.length > 0) {
            return meals.map((meal) => normalizePlannedMeal(planMealToRow(meal)));
        }
        // No real plan → no rows. The render branches to the honest EmptyState
        // (a single CTA wired to generateAIPlan); it never invents a timeline.
        return [] as any[];
    }, [plan]);

    // Whether the AI returned a real, non-empty plan. Drives the honest no-plan
    // EmptyState (the timeline maps `protocol`, which is empty unless this is
    // true) — derived from the SAME ground-truth `plan.meals`, never stored as
    // state. Reads `.meals` (the real field), not the phantom `.items`.
    const hasRealPlan = Array.isArray((plan as any)?.meals) && (plan as any).meals.length > 0;

    // Resolved entrainment score — SINGLE source of truth, typed (no `as any`).
    // `profileMetrics.entrainmentScore` already folds in the model's score in its
    // model-present branch (and is null in the no-model fallback). The second read
    // is a typed defensive fallthrough on the SAME field — `circadianModel`'s
    // `entrainmentScore?: number` (src/api/circadian.ts), the ONLY entrainment key
    // the model carries (there is no `score`). Same precedence, same null fallback.
    const resolvedEntrainmentScore: number | null =
        profileMetrics?.entrainmentScore ?? circadianModel?.entrainmentScore ?? null;

    // ── Metric tiles config (keeps bindings identical, removes repetition) ──
    // `hint` is purely descriptive copy for the new window-detail carousel; it
    // adds no data dependency — the value bindings below are byte-identical to
    // the originals (melatoninStart / caffeineCutoff / insulinStart / peakTemp).
    const metricTiles = [
        { key: 'melatonin', accent: colors.accent.blue, icon: 'moon' as const, label: 'Melatonin Onset', value: profileMetrics?.melatoninStart || '--:--', hint: 'Wind-down begins — dim lights, ease off screens.' },
        { key: 'caffeine', accent: colors.accent.amber, icon: 'cafe' as const, label: 'Caffeine Cutoff', value: profileMetrics?.caffeineCutoff || '--:--', hint: 'Last call for caffeine to protect deep sleep.' },
        { key: 'insulin', accent: colors.accent.cyan, icon: 'restaurant' as const, label: 'Insulin Peak', value: profileMetrics?.insulinStart || '--:--', hint: 'Best window to fuel — carbs are tolerated well.' },
        { key: 'temp', accent: colors.accent.coral, icon: 'thermometer' as const, label: 'Peak Temp', value: profileMetrics?.peakTemp || '--:--', hint: 'Core temperature peaks — your strength window.' },
    ];

    // Ring markers + the lime "optimal feeding / activation" arc are DERIVED from
    // the same profileMetrics strings the grid already shows (no new data hook):
    // the optimal window runs from the insulin-friendly feeding time to the
    // caffeine cutoff — the daily "go" band the brand highlights in lime.
    const ringMarkers = [
        { key: 'melatonin', time: profileMetrics?.melatoninStart, color: colors.accent.blue },
        { key: 'caffeine', time: profileMetrics?.caffeineCutoff, color: colors.accent.amber },
        { key: 'insulin', time: profileMetrics?.insulinStart, color: colors.accent.cyan },
        { key: 'temp', time: profileMetrics?.peakTemp, color: colors.accent.coral },
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
                    <Skeleton width="100%" height={300} radius={borderRadius['2xl']} style={{ marginBottom: spacing['2xl'] }} />
                    <Skeleton width={150} height={12} radius={borderRadius.sm} style={{ marginBottom: spacing.lg }} />
                    <View style={styles.grid}>
                        {[0, 1, 2, 3].map((i) => (
                            <Skeleton key={i} width="48%" height={132} radius={borderRadius['2xl']} />
                        ))}
                    </View>
                </View>
            </View>
        );
    }

    return (
        <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background.primary }]}>
            <StatusBar style="light" />
            {/* ══ HERO ════════════════════════════════════════════════════ */}
            <Animated.View entering={FadeInDown.duration(420)} style={[styles.header, { paddingHorizontal: spacing['2xl'], marginTop: spacing.lg }]}>
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
            </Animated.View>

            {/* ══ TAB SELECTOR ════════════════════════════════════════════ */}
            <Animated.View entering={FadeInDown.delay(60).duration(420)} style={[styles.tabSelector, { paddingHorizontal: spacing['2xl'], borderBottomColor: withAlpha(colors.text.primary, 0.06) }]}>
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
            </Animated.View>

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
                                {/* Reserved PRIMARY coralCta fill (#93B82E→#93B82E) — the EmptyState
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
                                {/* ══ CIRCADIAN CLOCK — the USP centrepiece ════════════
                                    A 24h SVG dial: the lime arc is the optimal feeding /
                                    activation window (insulin-peak → caffeine-cutoff),
                                    the dots are the biological-window markers, and the
                                    centre carries the SAME resolvedEntrainmentScore +
                                    entrainmentAdvice copy the old score card showed (no
                                    data change — only the presentation). */}
                                <Animated.View entering={FadeInDown.delay(120).duration(460)}>
                                    <GlassCard
                                        glow={colors.accent.coral}
                                        style={[styles.clockCard, { borderColor: withAlpha(colors.accent.coral, 0.26) }]}
                                    >
                                        <LinearGradient
                                            colors={[withAlpha(colors.accent.coral, 0.12), 'transparent']}
                                            start={{ x: 0.5, y: 0 }}
                                            end={{ x: 0.5, y: 1 }}
                                            style={StyleSheet.absoluteFillObject}
                                            pointerEvents="none"
                                        />
                                        <Text style={[typography.overline, { color: colors.text.secondary, textAlign: 'center', marginBottom: spacing.lg }]}>
                                            24-Hour Body Clock
                                        </Text>
                                        <CircadianRing
                                            size={244}
                                            score={resolvedEntrainmentScore}
                                            optimalStart={profileMetrics?.insulinStart}
                                            optimalEnd={profileMetrics?.caffeineCutoff}
                                            markers={ringMarkers}
                                            trackColor={colors.border.light}
                                            optimalColor={colors.accent.coral}
                                            scoreColor={colors.text.primary}
                                            labelColor={colors.text.secondary}
                                            centerLabel="Entrainment"
                                            scoreFontFamily={typography.statLarge.fontFamily}
                                        />
                                        {/* Legend: optimal window + the marker key. */}
                                        <View style={styles.legendRow}>
                                            <View style={styles.legendItem}>
                                                <View style={[styles.legendBar, { backgroundColor: colors.accent.coral }]} />
                                                <Text style={[typography.caption, { color: colors.text.secondary }]}>Optimal window</Text>
                                            </View>
                                        </View>
                                        {/* Advice copy from the shared helper — ENTRAINMENT_ADVICE is the
                                            single source of truth (no inline ternary). entrainmentAdvice
                                            always returns a non-empty string, so this Text child can't leak a
                                            falsy number outside <Text> (rendering-no-falsy-and.md). */}
                                        <Text style={[typography.bodySm, { color: colors.text.secondary, textAlign: 'center', marginTop: spacing.md, paddingHorizontal: spacing.lg }]}>
                                            {entrainmentAdvice(resolvedEntrainmentScore)}
                                        </Text>
                                    </GlassCard>
                                </Animated.View>

                                {/* ══ SHIFT-AWARE STATUS CARD ══════════════════════════
                                    A glance at what the clock is synced to. shiftLabel /
                                    shiftIcon derive from the SAME single resolved shiftType. */}
                                <Animated.View entering={FadeInDown.delay(180).duration(460)}>
                                    <GlassCard style={[styles.shiftCard, { borderColor: withAlpha(colors.accent.coral, 0.2) }]}>
                                        <View style={[styles.shiftIconWrap, { backgroundColor: withAlpha(colors.accent.coral, 0.14), borderColor: withAlpha(colors.accent.coral, 0.3) }]}>
                                            <Ionicons name={shiftIcon} size={22} color={colors.accent.coral} />
                                        </View>
                                        <View style={{ flex: 1, marginLeft: spacing.md }}>
                                            <Text style={[typography.overline, { color: colors.text.tertiary }]}>Synced to</Text>
                                            <Text style={[typography.subhead, { color: colors.text.primary, marginTop: 2 }]}>{shiftLabel}</Text>
                                        </View>
                                        <Pressable
                                            accessibilityRole="button"
                                            accessibilityLabel="Open schedule"
                                            hitSlop={8}
                                            onPress={() => router.push('/(tabs)/schedule' as any)}
                                            style={({ pressed }) => [
                                                styles.shiftEditBtn,
                                                { borderColor: withAlpha(colors.accent.coral, 0.4) },
                                                pressed ? { transform: [{ scale: 0.96 }], backgroundColor: withAlpha(colors.accent.coral, 0.08) } : null,
                                            ]}
                                        >
                                            <Ionicons name="calendar-outline" size={14} color={colors.accent.coral} />
                                        </Pressable>
                                    </GlassCard>
                                </Animated.View>

                                {/* ══ BIOLOGICAL WINDOWS — 2-col stat grid ════════════ */}
                                <Animated.View entering={FadeInDown.delay(240).duration(460)}>
                                    <Text style={[typography.overline, { color: colors.text.secondary, marginTop: spacing['2xl'], marginBottom: spacing.lg }]}>
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
                                </Animated.View>

                                {/* ══ WINDOW PLAYBOOK — horizontal snapping carousel ══
                                    Same metricTiles bindings, surfaced as swipeable
                                    coaching cards (value + what to do in that window). */}
                                <Animated.View entering={FadeInDown.delay(300).duration(460)}>
                                    <Text style={[typography.overline, { color: colors.text.secondary, marginTop: spacing['2xl'], marginBottom: spacing.lg }]}>
                                        Window Playbook
                                    </Text>
                                </Animated.View>
                                <ScrollView
                                    horizontal
                                    showsHorizontalScrollIndicator={false}
                                    decelerationRate="fast"
                                    snapToInterval={CAROUSEL_CARD_W + 12}
                                    snapToAlignment="start"
                                    contentContainerStyle={styles.carouselContent}
                                >
                                    {metricTiles.map((tile) => (
                                        <GlassCard
                                            key={tile.key}
                                            style={[styles.playbookCard, { width: CAROUSEL_CARD_W, borderColor: withAlpha(tile.accent, 0.28) }]}
                                        >
                                            <LinearGradient
                                                colors={[withAlpha(tile.accent, 0.12), 'transparent']}
                                                start={{ x: 0, y: 0 }}
                                                end={{ x: 1, y: 1 }}
                                                style={StyleSheet.absoluteFillObject}
                                                pointerEvents="none"
                                            />
                                            <View style={styles.playbookTop}>
                                                <View style={[styles.metricIcon, { backgroundColor: withAlpha(tile.accent, 0.16) }]}>
                                                    <Ionicons name={tile.icon} size={20} color={tile.accent} />
                                                </View>
                                                <Text
                                                    style={[typography.statSmall, { color: tile.accent }]}
                                                    maxFontSizeMultiplier={1.3}
                                                >
                                                    {tile.value}
                                                </Text>
                                            </View>
                                            <Text style={[typography.subhead, { color: colors.text.primary, marginTop: spacing.md }]}>
                                                {tile.label}
                                            </Text>
                                            <Text style={[typography.caption, { color: colors.text.secondary, marginTop: spacing.xs, lineHeight: 18 }]}>
                                                {tile.hint}
                                            </Text>
                                        </GlassCard>
                                    ))}
                                </ScrollView>
                            </>
                        )}
                    </View>
                )}

                {selectedTab === 'plan' && (
                    <Animated.View entering={FadeInDown.delay(120).duration(460)}>
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

                        {/* Daily-AI-limit 429 → distinct upgrade state (NOT the
                            retryable error). Mutually exclusive with `genError`;
                            hidden while a fresh generation is in flight. The
                            surface is a GlassCard and the action a CtaButton —
                            the sanctioned Aurora primitives (no inline glass/CTA). */}
                        {!!quota && !isLoadingPlan && (
                            <GlassCard
                                glow={colors.accent.coral}
                                style={[styles.noticeCard, { borderColor: withAlpha(colors.accent.coral, 0.35), marginBottom: spacing.xl }]}
                            >
                                <View accessibilityRole="alert">
                                    <View style={styles.noticeHead}>
                                        <Ionicons name="flash-outline" size={20} color={colors.accent.coral} style={{ marginTop: 1 }} />
                                        <View style={{ flex: 1, marginLeft: spacing.sm + 2 }}>
                                            <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: '700' }]}>
                                                Daily AI limit reached
                                            </Text>
                                            <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 2, lineHeight: 18 }]}>
                                                {`You've used all ${quota.limit} of your ${quota.plan === 'pro' ? 'Pro' : 'free'} daily AI plans. ${formatResetsAt(quota.resetsAt)}.`}
                                            </Text>
                                        </View>
                                    </View>
                                    <CtaButton
                                        label="Upgrade"
                                        icon="sparkles"
                                        size="sm"
                                        onPress={() => router.push('/(modals)/premium')}
                                        accessibilityLabel="Upgrade to remove the daily AI limit"
                                        style={{ alignSelf: 'flex-start', marginTop: spacing.md }}
                                    />
                                </View>
                            </GlassCard>
                        )}

                        {/* Persistent, retryable inline error — survives until a
                            retry succeeds. Mutually exclusive with `quota`. */}
                        {!!genError && !isLoadingPlan && (
                            <GlassCard
                                style={[styles.noticeCard, { borderColor: withAlpha(colors.accent.coral, 0.35), marginBottom: spacing.xl }]}
                            >
                                <View accessibilityRole="alert">
                                    <View style={styles.noticeHead}>
                                        <Ionicons name="alert-circle" size={20} color={colors.accent.coral} style={{ marginTop: 1 }} />
                                        <View style={{ flex: 1, marginLeft: spacing.sm + 2 }}>
                                            <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: '700' }]}>
                                                Generation failed
                                            </Text>
                                            <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 2, lineHeight: 18 }]}>
                                                {genError}
                                            </Text>
                                        </View>
                                    </View>
                                    <TouchableOpacity
                                        style={[styles.tryAgainBtn, { borderColor: withAlpha(colors.accent.coral, 0.5), marginTop: spacing.md }]}
                                        onPress={() => generateAIPlan()}
                                        accessibilityRole="button"
                                        accessibilityLabel="Try again"
                                        activeOpacity={0.85}
                                    >
                                        <Ionicons name="refresh" size={16} color={colors.accent.coral} />
                                        <Text style={[typography.caption, { color: colors.accent.coral, fontWeight: '700', marginLeft: spacing.xs + 2 }]}>
                                            Try Again
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            </GlassCard>
                        )}

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
                        ) : !hasRealPlan && !quota && !genError ? (
                            /* Honest zero-data state: the AI has not produced a
                               plan yet, so we show NOTHING fabricated — just the
                               EmptyState with ONE CTA wired to the EXISTING
                               generateAIPlan mutation (no inline coral CTA; the
                               EmptyState action renders the sanctioned Button
                               primitive). Mutually exclusive with the loader and
                               with the quota/genError notices above. Ternary-null,
                               not `&&` (rendering-no-falsy-and). */
                            <EmptyState
                                icon="sparkles-outline"
                                title="No protocol yet"
                                subtitle="Generate today's circadian-timed meal & training plan."
                                actionLabel="Generate protocol"
                                onAction={() => generateAIPlan()}
                            />
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
                                                            {item.type === 'meal'
                                                                ? (item.macros || item.note || '')
                                                                : item.type === 'workout' ? item.duration : item.note}
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
                    </Animated.View>
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
    // Circadian clock centrepiece (Profile tab hero).
    clockCard: {
        padding: 24,
        alignItems: 'center',
        overflow: 'hidden',
    },
    legendRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 18,
    },
    legendItem: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    legendBar: {
        width: 18,
        height: 5,
        borderRadius: 3,
        marginRight: 8,
    },
    // Shift-aware status card.
    shiftCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        marginTop: 16,
    },
    shiftIconWrap: {
        width: 44,
        height: 44,
        borderRadius: 14,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    shiftEditBtn: {
        width: 40,
        height: 40,
        borderRadius: 12,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    // Window Playbook horizontal carousel.
    carouselContent: {
        gap: 12,
        paddingRight: 4,
        paddingBottom: 4,
    },
    playbookCard: {
        padding: 18,
        overflow: 'hidden',
    },
    playbookTop: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
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
    // Inline upgrade / retryable-error notice surface (rendered inside a
    // GlassCard on the AI Protocol tab — replaces the old destructive Alert).
    noticeCard: {
        padding: 16,
    },
    noticeHead: {
        flexDirection: 'row',
        alignItems: 'flex-start',
    },
    tryAgainBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        alignSelf: 'flex-start',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        borderWidth: 1.5,
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
