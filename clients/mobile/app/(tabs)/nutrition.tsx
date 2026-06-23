import React, { useMemo, useCallback } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    ImageBackground
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useQuery } from '@tanstack/react-query';
import { getPlanByDate } from '@/api/plans';
import { getMealLogs, getFastingLogs, getRecipes } from '@/api/meals';
import { getToday as getTodayProgress } from '@/api/progress';
import { LinearGradient } from 'expo-linear-gradient';
import { CircularProgress } from '@/components/ui/CircularProgress';
import { Skeleton, EmptyState, GlassCard } from '@/components/ui';
import {
    MacroTile, MealSlotCard, RecipeCard, RecipeDiscoverCard, HydrationRing,
    RECIPE_CARD_W, GRID_CARD_W,
} from '@/components/NutritionCards';
import { format } from 'date-fns';
import { withAlpha } from '@/theme/utils';
import { colors as themeColors } from '@/theme/colors';
import { TAB_BAR_H } from './_layout';

// Bundled Aurora dark-glass art (no external host → offline-safe, no 404 /
// rate-limit). '@/*' resolves to ./src, so assets are required by relative path
// — same module-scope require pattern as (tabs)/training.tsx.
const HERO_NUTRITION = require('../../assets/images/hero-nutrition.png');
// Static recipe-card artwork (constant — hoisted out of render). Rotated by
// index so a catalog of bundled covers maps across the carousel.
const RECIPE_FALLBACK = require('../../assets/images/recipe-fallback.png');
const FOOD_FALLBACK = require('../../assets/images/food-fallback.png');
const RECIPE_IMGS = [RECIPE_FALLBACK, FOOD_FALLBACK];

// Human-readable label for a MealLog's `mealType` enum. Mirrors the same map in
// (meals)/log-planned-meal.tsx — kept local here because that lives in a screen
// module (not a shared util we can import) and this item may only edit this
// file. Unknown / missing types fall back to a friendly default.
const MEAL_TYPE_LABEL: Record<string, string> = {
    BREAKFAST: 'Breakfast',
    LUNCH: 'Lunch',
    DINNER: 'Dinner',
    SNACK: 'Snack',
};
const mealTypeLabel = (t?: string) => MEAL_TYPE_LABEL[String(t || '').toUpperCase()] || 'Meal';

// Pick a Zeitra accent + icon for a plan meal-slot grid card by its index, so the
// grid reads as a rotating, on-brand set (lime-led) rather than a flat list.
const SLOT_ACCENTS = [
    themeColors.accent.coral,
    themeColors.accent.cyan,
    themeColors.accent.purple,
    themeColors.accent.amber,
];
const SLOT_ICONS = ['sunny-outline', 'restaurant-outline', 'moon-outline', 'cafe-outline'] as const;

// Coerce any value to a finite number, mapping undefined / null / NaN / ±Infinity
// → 0. The macro reads come from logged meals whose stored totals can be missing
// OR NaN (a bad parse upstream). A bare `(x || 0)` catches undefined but lets NaN
// through, and NaN poisons every downstream sum, the "kcal left" numeral, and the
// ring fraction fed to the shared CircularProgress (which is NOT clamped here —
// `NaN <= 1` is false there, so a NaN fraction would skip its own clamp). Funnel
// every addend / ratio operand through this so the dashboard only ever computes
// on finite numbers.
const finiteNum = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) ? n : 0);

export default function NutritionHubScreen() {
    const { colors, typography, borderRadius, shadows } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();

    const todayStr = format(new Date(), 'yyyy-MM-dd');

    // ── Queries ─────────────────────────────────────────────────────────────
    const planQuery = useQuery({
        queryKey: ['nutrition-plan', todayStr],
        queryFn: () => getPlanByDate(todayStr),
    });

    const logsQuery = useQuery({
        queryKey: ['meal-logs', todayStr],
        queryFn: () => getMealLogs(todayStr),
    });

    const progressQuery = useQuery({
        queryKey: ['daily-progress', todayStr],
        queryFn: getTodayProgress,
    });

    const fastingQuery = useQuery({
        queryKey: ['fasting-logs'],
        queryFn: () => getFastingLogs(1),
    });

    // Recipe ideas for the horizontal carousel (additive read; degrades to a
    // "Discover Recipes" terminal card when empty / still resolving). Uses the
    // existing meals/recipes endpoint — no new API surface.
    const recipesQuery = useQuery({
        queryKey: ['nutrition-recipes'],
        queryFn: () => getRecipes(undefined, 8),
    });

    // ── Calculations ────────────────────────────────────────────────────────
    const progress = progressQuery.data;
    const plan = planQuery.data;
    const logs = Array.isArray(logsQuery.data) ? logsQuery.data : [];
    const fasting = fastingQuery.data?.[0];
    const recipes = Array.isArray(recipesQuery.data) ? recipesQuery.data : [];

    // The macro dashboard is this tab's primary content; it's driven by the
    // daily-progress (targets) + meal-logs (consumed) reads. Surface explicit
    // loading / error-with-retry states for those instead of silently rendering
    // fallback defaults (2400kcal / 0 consumed) while they load or after a
    // failure. Retry re-runs every query feeding the tab in one tap.
    const macroLoading = progressQuery.isLoading || logsQuery.isLoading;
    const macroError = progressQuery.isError || logsQuery.isError;
    // The Fasting card reads only fastingQuery, so it gets its own honest
    // loading / error-with-retry states (scoped retry → fastingQuery.refetch).
    // Without these a fetch FAILURE silently rendered the IDLE / "START FAST"
    // layout, masking the error as a benign "no active fast".
    const fastingLoading = fastingQuery.isLoading;
    const fastingError = fastingQuery.isError;
    // TanStack `refetch` fns are stable across renders, so depending on them
    // keeps this callback stable too (avoids re-rendering the memoized EmptyState).
    const planRefetch = planQuery.refetch;
    const logsRefetch = logsQuery.refetch;
    const progressRefetch = progressQuery.refetch;
    const fastingRefetch = fastingQuery.refetch;
    const refetchAll = useCallback(() => {
        planRefetch();
        logsRefetch();
        progressRefetch();
        fastingRefetch();
    }, [planRefetch, logsRefetch, progressRefetch, fastingRefetch]);

    const stats = useMemo(() => {
        const target = {
            calories: progress?.caloriesTarget || 2400,
            protein: progress?.proteinTarget || 180,
            carbs: progress?.carbsTarget || 200,
            fat: progress?.fatTarget || 70,
        };

        // finiteNum (not `|| 0`) on each addend so a NaN total in any log can't
        // poison the running sums — see the helper's note.
        const consumed = logs.reduce((acc, log) => ({
            calories: acc.calories + finiteNum(log.totalCalories),
            protein: acc.protein + finiteNum(log.totalProtein),
            carbs: acc.carbs + finiteNum(log.totalCarbs),
            fat: acc.fat + finiteNum(log.totalFat),
        }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

        return { target, consumed };
    }, [progress, logs]);

    // Hydration widget reads — straight off the daily-progress payload (no new
    // query). Tolerates the legacy `hydrationMl` alias and a missing target.
    const hydrationActual = finiteNum((progress as any)?.hydrationActual ?? (progress as any)?.hydrationMl);
    const hydrationTarget = finiteNum((progress as any)?.hydrationTargetMl) || 3000;
    const hydrationPct = hydrationTarget > 0 ? Math.min(100, Math.round((hydrationActual / hydrationTarget) * 100)) : 0;

    // Stable navigation handlers so the memoized ToolCards don't re-render on
    // unrelated parent updates.
    const openLibrary = useCallback(() => router.push('/(meals)/encyclopedia' as any), [router]);
    const openRecipes = useCallback(() => router.push('/(meals)/recipes' as any), [router]);
    const openGrocery = useCallback(() => router.push('/(meals)/grocery' as any), [router]);
    // Shared by the header history button affordance and the Today's Meals
    // empty-state CTA — both route to the log-meal flow. Stable so the memoized
    // EmptyState below doesn't re-render on unrelated parent updates.
    const openLogMeal = useCallback(() => router.push('/(meals)/log-meal' as any), [router]);

    return (
        <ImageBackground
            blurRadius={4}
            source={HERO_NUTRITION}
            style={[styles.container, { backgroundColor: colors.background.primary }]}
            imageStyle={{ opacity: 0.25 }}
        >
            {/* Translucent light status bar so the blurred food photo bleeds
                under the notch. Mirrors the global root StatusBar (idempotent)
                and makes the intent explicit at the screen level. */}
            <StatusBar style="light" translucent backgroundColor="transparent" />
            <LinearGradient
                colors={['rgba(10,10,13,0.85)', colors.background.primary]}
                style={StyleSheet.absoluteFillObject}
            />

            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: TAB_BAR_H + 80 }}
            >
                {/* Header */}
                <Animated.View entering={FadeInDown.duration(420)} style={[styles.header, { paddingTop: insets.top + 20 }]}>
                    <View style={{ flex: 1 }}>
                        <Text style={[typography.overline, { color: colors.accent.coral }]}>
                            {format(new Date(), 'EEEE, MMM d').toUpperCase()}
                        </Text>
                        <Text style={[typography.display, { color: colors.text.primary, fontSize: 34, marginTop: 4 }]}>
                            Nutrition
                        </Text>
                        <Text style={[typography.body, { color: colors.text.secondary, marginTop: 2 }]}>
                            Fueling your {(progress as any)?.shiftType || 'Rotation'} shift.
                        </Text>
                    </View>
                    <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="View log"
                        activeOpacity={0.85}
                        style={[styles.historyBtn, { backgroundColor: colors.background.secondary, borderWidth: 1, borderColor: colors.border.default }, shadows.sm]}
                        onPress={openLogMeal}
                    >
                        <Ionicons name="receipt-outline" size={22} color={colors.text.primary} />
                    </TouchableOpacity>
                </Animated.View>

                {/* Macro Dashboard */}
                {macroLoading ? (
                    <GlassCard radius={borderRadius.xl} style={styles.macroDashboard}>
                        <Skeleton width={180} height={180} radius={borderRadius.full} style={{ marginBottom: 30 }} />
                        <View style={styles.macroGrid}>
                            {[0, 1, 2].map((i) => (
                                <Skeleton key={i} width="100%" height={64} radius={borderRadius.md} />
                            ))}
                        </View>
                    </GlassCard>
                ) : macroError ? (
                    <GlassCard radius={borderRadius.xl} style={styles.macroDashboard}>
                        <EmptyState
                            icon="cloud-offline-outline"
                            title="Couldn't load your macros"
                            subtitle="Check your connection and try again."
                            actionLabel="Retry"
                            onAction={refetchAll}
                        />
                    </GlassCard>
                ) : (
                <Animated.View entering={FadeInDown.delay(60).duration(420)}>
                <GlassCard glow={colors.accent.coral} radius={borderRadius.xl} style={[styles.macroDashboard, { borderColor: withAlpha(colors.accent.coral, 0.25) }]}>
                    <LinearGradient
                        colors={[withAlpha(colors.accent.coral, 0.12), 'transparent']}
                        start={{ x: 0.5, y: 0 }}
                        end={{ x: 0.5, y: 1 }}
                        style={StyleSheet.absoluteFillObject}
                    />
                    {/* SVG has no implicit text → expose the ring to TalkBack /
                        VoiceOver as a single labelled summary. accessible groups
                        the numeral + label so they aren't read as two fragments. */}
                    <View
                        style={[styles.mainCircle, shadows.glow(colors.accent.coral)]}
                        accessible
                        accessibilityRole="image"
                        accessibilityLabel={`${Math.max(0, stats.target.calories - finiteNum(stats.consumed.calories))} kcal left of ${stats.target.calories}`}
                    >
                        <CircularProgress
                            // Clamp the fraction to 0..1 HERE (CircularProgress is
                            // shared by 7 screens and must stay untouched). An
                            // over-target day (consumed > target) would otherwise
                            // push a >1 fraction in; finiteNum also keeps a NaN
                            // consumed from becoming a NaN fraction.
                            progress={stats.target.calories > 0 ? Math.min(1, Math.max(0, finiteNum(stats.consumed.calories) / stats.target.calories)) : 0}
                            size={180}
                            strokeWidth={14}
                            color={colors.accent.coral}
                            trackColor={colors.background.tertiary}
                        />
                        <View style={styles.circleText}>
                            <Text
                                style={[typography.statLarge, { color: colors.text.primary, fontSize: 46, lineHeight: 52 }]}
                                maxFontSizeMultiplier={1.3}
                                allowFontScaling
                            >
                                {Math.max(0, stats.target.calories - finiteNum(stats.consumed.calories))}
                            </Text>
                            <Text style={[typography.overline, { color: colors.accent.coral }]}>KCAL LEFT</Text>
                        </View>
                    </View>

                    {/* At-a-glance + screen-reader friendly consumed/target line. */}
                    <Text style={[typography.caption, { color: colors.text.secondary, marginBottom: 18 }]}>
                        {`consumed ${Math.round(finiteNum(stats.consumed.calories))} / target ${stats.target.calories} kcal`}
                    </Text>

                    <View style={styles.macroGrid}>
                        <MacroTile index={0} label="Protein" current={stats.consumed.protein} target={stats.target.protein} color={colors.accent.coral} unit="g" />
                        <MacroTile index={1} label="Carbs" current={stats.consumed.carbs} target={stats.target.carbs} color={colors.accent.cyan} unit="g" />
                        <MacroTile index={2} label="Fat" current={stats.consumed.fat} target={stats.target.fat} color={colors.accent.amber} unit="g" />
                    </View>
                </GlassCard>
                </Animated.View>
                )}

                {/* Today's Meals — the day's REAL logged meals (logsQuery), with
                    honest loading / error+retry / empty states. Mutually
                    exclusive ternary-null branches (rendering-no-falsy-and); no
                    fabricated rows or macros on the non-filled paths. The day
                    totals reuse the existing stats.consumed (no duplicate
                    reduce; react-state-minimize). */}
                <View style={[styles.section, { marginTop: 28 }]}>
                    <View style={styles.sectionHeader}>
                        <Text style={[typography.heading, { color: colors.text.primary }]}>Today's Meals</Text>
                    </View>

                    {logsQuery.isLoading ? (
                        <GlassCard radius={borderRadius.xl} testID="logged-meals-loading">
                            <View style={styles.loggedList}>
                                {[0, 1, 2].map((i) => (
                                    <Skeleton key={i} width="100%" height={28} radius={borderRadius.md} />
                                ))}
                            </View>
                        </GlassCard>
                    ) : logsQuery.isError ? (
                        // Distinct, retryable error — never falls through to the
                        // empty "log your first meal" CTA. Retry is SCOPED to the
                        // logs query (logsRefetch), the only read this list needs.
                        <GlassCard radius={borderRadius.xl} testID="logged-meals-error">
                            <EmptyState
                                icon="cloud-offline-outline"
                                title="Couldn't load today's meals"
                                subtitle="Check your connection and try again."
                                actionLabel="Retry"
                                onAction={logsRefetch}
                            />
                        </GlassCard>
                    ) : logs.length === 0 ? (
                        // Genuinely empty day — a real CTA that routes to the
                        // log-meal flow (EmptyState's own action button, NOT a
                        // manufactured coral CTA). No fabricated rows / totals.
                        <GlassCard radius={borderRadius.xl} testID="logged-meals-empty">
                            <EmptyState
                                icon="restaurant-outline"
                                title="No meals logged yet"
                                subtitle="Log your first meal to track today's macros."
                                actionLabel="Log a Meal"
                                onAction={openLogMeal}
                            />
                        </GlassCard>
                    ) : (
                        <GlassCard radius={borderRadius.xl} testID="logged-meals-filled">
                            <View style={styles.loggedList}>
                                {logs.map((log: any, i: number) => (
                                    <LoggedMealRow
                                        key={log?.id ?? i}
                                        label={mealTypeLabel(log?.mealType)}
                                        calories={log?.totalCalories || 0}
                                        protein={log?.totalProtein || 0}
                                    />
                                ))}
                                {/* Day totals — the EXISTING stats.consumed (no
                                    duplicate reduce, no invented numbers). */}
                                <View
                                    style={[styles.loggedTotalRow, { borderTopColor: colors.border.default }]}
                                    accessible
                                    accessibilityLabel={`Day total: ${Math.round(stats.consumed.calories)} kcal, ${Math.round(stats.consumed.protein)} grams protein`}
                                >
                                    <Text style={[typography.caption, { color: colors.text.secondary, fontWeight: 'bold' }]}>TOTAL</Text>
                                    <Text style={[typography.caption, { color: colors.text.primary }]}>
                                        {Math.round(stats.consumed.calories)} kcal · {Math.round(stats.consumed.protein)}g protein
                                    </Text>
                                </View>
                            </View>
                        </GlassCard>
                    )}
                </View>

                {/* Hydration + Fasting widget cards */}
                <View style={[styles.section, { marginTop: 4 }]}>
                    <View style={styles.widgetRow}>
                        {/* Hydration widget — reads the daily-progress payload (no
                            new query); bespoke SVG ring (not the shared
                            CircularProgress, see NutritionCards header). */}
                        <Animated.View entering={FadeInDown.delay(80).springify().damping(18)} style={{ flex: 1 }}>
                            <GlassCard radius={borderRadius.xl} style={{ borderColor: withAlpha(colors.accent.blue, 0.28) }}>
                                <View style={styles.hydrationCard}>
                                    <LinearGradient colors={[withAlpha(colors.accent.blue, 0.12), 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFillObject} />
                                    <View style={styles.widgetHeadRow}>
                                        <Ionicons name="water" size={18} color={colors.accent.blue} />
                                        <Text style={[typography.caption, { color: colors.text.secondary, fontWeight: 'bold', marginLeft: 8 }]}>HYDRATION</Text>
                                    </View>
                                    <View style={styles.hydrationBody}>
                                        <HydrationRing current={hydrationActual} target={hydrationTarget} size={76} />
                                        <View style={{ marginLeft: 14, flex: 1 }}>
                                            <Text style={[typography.statSmall, { color: colors.text.primary, fontSize: 20 }]}>{hydrationPct}%</Text>
                                            <Text style={[typography.caption, { color: colors.text.tertiary }]} numberOfLines={1}>
                                                of {(hydrationTarget / 1000).toFixed(1)}L goal
                                            </Text>
                                        </View>
                                    </View>
                                </View>
                            </GlassCard>
                        </Animated.View>

                        {/* Fasting widget — its own loading / error / idle / active
                            branches, all strings + the timer route preserved. */}
                        <Animated.View entering={FadeInDown.delay(140).springify().damping(18)} style={{ flex: 1 }}>
                            {fastingLoading ? (
                                <GlassCard radius={borderRadius.xl} style={{ height: '100%' }}>
                                    <View style={styles.fastCard}>
                                        <View style={styles.widgetHeadRow}>
                                            <Skeleton width={110} height={18} radius={borderRadius.md} />
                                        </View>
                                        <Skeleton width={90} height={20} radius={borderRadius.md} style={{ marginTop: 16 }} />
                                        <Skeleton width="100%" height={40} radius={borderRadius.lg} style={{ marginTop: 14 }} />
                                    </View>
                                </GlassCard>
                            ) : fastingError ? (
                                // Distinct, retryable error — never falls through to
                                // the idle "START FAST" layout. Retry is SCOPED to
                                // the fasting query (the only read this card needs).
                                <GlassCard radius={borderRadius.xl} style={{ height: '100%' }}>
                                    <EmptyState
                                        icon="cloud-offline-outline"
                                        title="Couldn't load your fast"
                                        subtitle="Check your connection and try again."
                                        actionLabel="Try Again"
                                        onAction={fastingRefetch}
                                    />
                                </GlassCard>
                            ) : (
                                <GlassCard
                                    glow={colors.accent.cyan}
                                    radius={borderRadius.xl}
                                    style={{ borderColor: withAlpha(colors.accent.cyan, 0.4), height: '100%' }}
                                >
                                    <View style={styles.fastCard}>
                                        <LinearGradient colors={[withAlpha(colors.accent.cyan, 0.12), 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFillObject} />
                                        <View style={styles.widgetHeadRow}>
                                            <Ionicons name="timer" size={18} color={colors.accent.cyan} />
                                            <Text style={[typography.caption, { color: colors.text.secondary, fontWeight: 'bold', marginLeft: 8 }]} numberOfLines={1}>Fasting Timer</Text>
                                        </View>
                                        <View style={[styles.fastBadge, { backgroundColor: withAlpha(colors.accent.cyan, 0.1), marginTop: 12 }]}>
                                            <Text style={[typography.caption, { color: colors.accent.cyan, fontWeight: 'bold' }]}>{fasting?.status === 'ACTIVE' ? 'IN PROGRESS' : 'IDLE'}</Text>
                                        </View>
                                        <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: '700', marginTop: 10 }]}>16:8 Windows</Text>
                                        <TouchableOpacity
                                            accessibilityRole="button"
                                            accessibilityLabel={fasting?.status === 'ACTIVE' ? 'View timer' : 'Start fast'}
                                            style={[styles.fastAction, { backgroundColor: colors.accent.cyan, marginTop: 14 }, shadows.glow(colors.accent.cyan)]}
                                            onPress={() => router.push('/(meals)/fasting' as any)}
                                            activeOpacity={0.85}
                                        >
                                            <Text style={[typography.caption, { color: themeColors.background.primary, fontWeight: 'bold' }]}>
                                                {fasting?.status === 'ACTIVE' ? 'VIEW TIMER' : 'START FAST'}
                                            </Text>
                                        </TouchableOpacity>
                                    </View>
                                </GlassCard>
                            )}
                        </Animated.View>
                    </View>
                </View>

                {/* Daily Plan — a GRID of meal slots */}
                <View style={[styles.section, { marginTop: 8 }]}>
                    <View style={styles.sectionHeader}>
                        <Text style={[typography.heading, { color: colors.text.primary }]}>Daily Plan</Text>
                        <TouchableOpacity activeOpacity={0.85} accessibilityRole="button" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} onPress={() => router.push('/(meals)/planner' as any)}>
                            <Text style={[typography.caption, { color: colors.accent.coral, fontWeight: 'bold' }]}>EDIT PLAN</Text>
                        </TouchableOpacity>
                    </View>

                    {planQuery.isLoading ? (
                        <View style={styles.slotGrid}>
                            {[0, 1, 2, 3].map((i) => (
                                <Skeleton key={i} width={GRID_CARD_W} height={132} radius={borderRadius.xl} />
                            ))}
                        </View>
                    ) : planQuery.isError ? (
                        // Distinct error tone (never falls through to the empty
                        // "Generate plan" CTA). Retry re-runs every query feeding
                        // this tab so a transient failure recovers in one tap.
                        <EmptyState
                            icon="cloud-offline-outline"
                            title="Couldn't load nutrition"
                            subtitle="Check your connection and try again."
                            actionLabel="Retry"
                            onAction={refetchAll}
                        />
                    ) : !plan || !((plan.meals || []).some((m: any) => m && (m.label || m.name))) ? (
                        <TouchableOpacity
                            activeOpacity={0.85}
                            accessibilityRole="button"
                            accessibilityLabel="No plan generated for today. Generate plan."
                            onPress={() => router.push('/(meals)/planner' as any)}
                        >
                            <GlassCard
                                radius={borderRadius.xl}
                                style={{ borderStyle: 'dashed', borderColor: colors.border.default }}
                            >
                                <View style={styles.emptyPlan}>
                                    <View style={[styles.emptyPlanIcon, { backgroundColor: withAlpha(colors.accent.coral, 0.12), borderColor: withAlpha(colors.accent.coral, 0.24) }, shadows.glow(colors.accent.coral)]}>
                                        <Ionicons name="sparkles" size={26} color={colors.accent.coral} />
                                    </View>
                                    <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: 'bold', marginTop: 14 }]}>No plan generated for today</Text>
                                    <Text style={[typography.caption, { color: colors.text.secondary, textAlign: 'center', marginTop: 6, maxWidth: 240, lineHeight: 18 }]}>Tap to let Ria build your protocol-compliant meals.</Text>
                                    <View style={[styles.emptyPlanCta, { backgroundColor: withAlpha(colors.accent.coral, 0.14) }]}>
                                        <Text style={[typography.caption, { color: colors.accent.coral, fontWeight: 'bold', letterSpacing: 0.5 }]}>GENERATE PLAN</Text>
                                    </View>
                                </View>
                            </GlassCard>
                        </TouchableOpacity>
                    ) : (
                        <View style={styles.slotGrid}>
                            {(plan.meals || []).filter((m: any) => m && (m.label || m.name)).map((m: any, i: number) => (
                                <MealSlotCard
                                    key={i}
                                    index={i}
                                    title={m.label || m.name}
                                    time={m.time}
                                    description={m.description}
                                    accent={SLOT_ACCENTS[i % SLOT_ACCENTS.length]!}
                                    icon={SLOT_ICONS[i % SLOT_ICONS.length]!}
                                    accessibilityLabel={`Log ${m.label || m.name}${m.time ? `, ${m.time}` : ''}`}
                                    onPress={() => router.push({ pathname: '/(meals)/log-meal', params: { preset: m.label } })}
                                />
                            ))}
                        </View>
                    )}
                </View>

                {/* Recipe ideas — horizontal CAROUSEL */}
                <View style={styles.sectionHeaderRow}>
                    <Text style={[typography.heading, { color: colors.text.primary }]}>Recipe Ideas</Text>
                    <TouchableOpacity activeOpacity={0.85} accessibilityRole="button" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} onPress={openRecipes}>
                        <Text style={[typography.caption, { color: colors.accent.coral, fontWeight: 'bold' }]}>VIEW ALL</Text>
                    </TouchableOpacity>
                </View>
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    decelerationRate="fast"
                    snapToInterval={RECIPE_CARD_W + 14}
                    snapToAlignment="start"
                    contentContainerStyle={{ paddingHorizontal: 20, gap: 14, paddingBottom: 4 }}
                >
                    {recipesQuery.isLoading ? (
                        [0, 1, 2].map((i) => <Skeleton key={i} width={RECIPE_CARD_W} height={168} radius={borderRadius.xl} />)
                    ) : recipes.length === 0 ? (
                        <RecipeDiscoverCard onPress={openRecipes} />
                    ) : (
                        <>
                            {recipes.map((r: any, i: number) => (
                                <RecipeCard
                                    key={r?.id ?? i}
                                    index={i}
                                    title={r?.title || r?.name || 'Recipe'}
                                    calories={r?.calories}
                                    protein={r?.protein}
                                    minutes={(finiteNum(r?.prepTimeMins) + finiteNum(r?.cookTimeMins)) || undefined}
                                    img={RECIPE_IMGS[i % RECIPE_IMGS.length]!}
                                    accent={colors.accent.coral}
                                    onPress={() => router.push({ pathname: '/(meals)/recipes', params: { id: r?.id } } as any)}
                                />
                            ))}
                            <RecipeDiscoverCard onPress={openRecipes} />
                        </>
                    )}
                </ScrollView>

                {/* Quick Tools */}
                <Text style={[typography.overline, { color: colors.text.secondary, marginHorizontal: 20, marginTop: 28, marginBottom: 12 }]}>
                    Quick Tools
                </Text>
                <View style={styles.toolRow}>
                    <ToolCard
                        icon="search"
                        title="Library"
                        color={colors.accent.cyan}
                        onPress={openLibrary}
                    />
                    <ToolCard
                        icon="restaurant"
                        title="Recipes"
                        color={colors.accent.purple}
                        onPress={openRecipes}
                    />
                    <ToolCard
                        icon="cart"
                        title="Grocery"
                        color={colors.accent.coral}
                        onPress={openGrocery}
                    />
                </View>
            </ScrollView>

        </ImageBackground>
    );
}

// One row in the Today's Meals list. Memoized (mirrors ToolCard) so re-rendering
// the parent on unrelated query updates doesn't re-render every logged row. Shows
// the meal type label + its REAL per-log macros (log.totalCalories /
// log.totalProtein) — no fabricated numbers. The label + numeric live in one
// `accessible` View so a screen reader announces a single coherent statement.
const LoggedMealRow = React.memo(function LoggedMealRow({ label, calories, protein }: any) {
    const { colors, typography } = useTheme();
    return (
        <View
            style={styles.loggedRow}
            accessible
            accessibilityLabel={`${label}: ${Math.round(calories)} kilocalories, ${Math.round(protein)} grams protein`}
        >
            <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: 'bold' }]} numberOfLines={1}>{label}</Text>
            <Text style={[typography.caption, { color: colors.text.secondary }]}>
                {Math.round(calories)} kcal · {Math.round(protein)}g
            </Text>
        </View>
    );
});

const ToolCard = React.memo(function ToolCard({ icon, title, color, onPress }: any) {
    const { colors, typography, borderRadius } = useTheme();
    return (
        <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={title}
            style={{ flex: 1 }}
            onPress={onPress}
            activeOpacity={0.85}
        >
            <GlassCard radius={borderRadius.xl}>
                <View style={styles.toolCard}>
                    <View style={[styles.toolIcon, { backgroundColor: `${color}15` }]}>
                        <Ionicons name={icon} size={22} color={color} />
                    </View>
                    <Text style={[typography.caption, { color: colors.text.primary, fontWeight: 'bold', marginTop: 8 }]}>{title}</Text>
                </View>
            </GlassCard>
        </TouchableOpacity>
    );
});

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 20 },
    historyBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
    macroDashboard: { marginHorizontal: 20, padding: 24, alignItems: 'center', overflow: 'hidden' },
    mainCircle: { width: 180, height: 180, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
    circleText: { position: 'absolute', alignItems: 'center' },
    macroGrid: { width: '100%', flexDirection: 'row', gap: 10 },
    toolRow: { flexDirection: 'row', paddingHorizontal: 20, gap: 12 },
    toolCard: { flex: 1, padding: 16, alignItems: 'center', justifyContent: 'center' },
    toolIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
    section: { paddingHorizontal: 20, marginBottom: 24 },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingHorizontal: 20, marginTop: 8 },
    emptyPlan: { paddingVertical: 36, paddingHorizontal: 24, alignItems: 'center', justifyContent: 'center' },
    emptyPlanIcon: { width: 60, height: 60, borderRadius: 30, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    emptyPlanCta: { marginTop: 16, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999 },
    slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    loggedList: { padding: 18, gap: 12 },
    loggedRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    loggedTotalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, marginTop: 2, borderTopWidth: StyleSheet.hairlineWidth },
    widgetRow: { flexDirection: 'row', gap: 12, alignItems: 'stretch' },
    widgetHeadRow: { flexDirection: 'row', alignItems: 'center' },
    hydrationCard: { padding: 16, overflow: 'hidden', minHeight: 150, justifyContent: 'space-between' },
    hydrationBody: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
    fastCard: { padding: 16, overflow: 'hidden', minHeight: 150 },
    fastBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
    fastAction: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 14, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
