/**
 * Dashboard — Zeitra home screen.
 * Redesigned: shift countdown hero · circadian insight · UP NEXT meal ·
 *             sleep + hydration mini cards · quick actions · 24h timeline.
 */
import React, { useState, useMemo, useCallback } from 'react';
import {
    View, Text, StyleSheet, ScrollView, RefreshControl,
    TouchableOpacity, Dimensions, ImageBackground
} from 'react-native';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { useTheme, colors as palette, typography, spacing, borderRadius } from '@/theme';
import { Skeleton, EmptyState, GlassCard, CtaButton } from '@/components/ui';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { getCurrent as getCurrentShift } from '@/api/shifts';
import { getToday as getTodayPlan, PlanMeal } from '@/api/plans';
import { getToday as getTodayProgress, logHydration } from '@/api/progress';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/store/authStore';
import { withAlpha } from '@/theme/utils';
import { WeeklyRecap } from '@/components/WeeklyRecap';
import { ActivityHeatmap } from '@/components/ActivityHeatmap';
import { searchLibrary } from '@/api/exercises';
import ShiftTransitionCard from '@/components/home/ShiftTransitionCard';
import LightPlanCard from '@/components/home/LightPlanCard';
import AnchorSleepCard from '@/components/home/AnchorSleepCard';
import TodayCircadianTimeline from '@/components/home/TodayCircadianTimeline';
import { CaffeineTimerTile } from '@/components/home/CaffeineTimerTile';
import { TAB_BAR_H } from './_layout';

const { width } = Dimensions.get('window');
const H_PAD = 20;
const CARD_GAP = 12;
const MINI_W = (width - H_PAD * 2 - CARD_GAP) / 2;

// Bottom inset that clears BOTH the floating tab bar AND the purple Ria FAB
// (FAB sits at bottom: TAB_BAR_H + 14, height 56 → top edge ≈ TAB_BAR_H + 70).
// Spec asks for >= TAB_BAR_H + 48; we reserve TAB_BAR_H + 72 so the last card
// never tucks under the Ria sparkles FAB on either platform.
const BOTTOM_CLEARANCE = TAB_BAR_H + 72;

// Caps Dynamic-Type scaling on the giant hero numeral and the micro NOW/badge
// text so a large accessibility text size can't clip them out of their pills /
// the single-line hero. Body + caption text elsewhere scales freely.
const STAT_MAX_SCALE = 1.4;
const MICRO_MAX_SCALE = 1.3;

// Bundled Aurora dark-glass art (no external host → works offline, no 404 /
// rate-limit / privacy leak). '@/*' resolves to ./src, so assets are required
// by relative path — same module-scope require pattern as (exercises)/index.tsx.
const QA_MEAL = require('../../assets/images/qa-meal.png');
const QA_WORKOUT = require('../../assets/images/qa-workout.png');
const QA_SLEEP = require('../../assets/images/qa-sleep.png');
const QA_STATS = require('../../assets/images/qa-stats.png');
const HERO_TRAINING = require('../../assets/images/hero-training.png');
const CAT_GYM_IMG = require('../../assets/images/cat-gym.png');
const CAT_HOME_IMG = require('../../assets/images/cat-home.png');
const CAT_CARDIO_IMG = require('../../assets/images/cat-cardio.png');
const CAT_RECOVERY_IMG = require('../../assets/images/cat-recovery.png');
const MUSCLE_SHOULDERS_IMG = require('../../assets/images/muscle-shoulders.png');
const MUSCLE_ARMS_IMG = require('../../assets/images/muscle-arms.png');

// Primary "Log Meal" CTA is the shared <CtaButton> (Aurora coral→pink fill via
// the `gradients.coralCta` token, coral glow, AA-lifted white label) — the
// screen-local LinearGradient copy was retired so this tab + Training render the
// same button from one source. Glass surfaces below use the shared <GlassCard>.

// ─── Static data ─────────────────────────────────────────────────────────────

const QUICK_ACTIONS = [
    { id: 'meal', label: 'Log Meal', icon: 'restaurant', color: palette.accent.cyan, image: QA_MEAL, route: '/(tabs)/nutrition' },
    { id: 'workout', label: 'Log Workout', icon: 'flame', color: palette.accent.coral, image: QA_WORKOUT, route: '/(tabs)/training' },
    { id: 'sleep', label: 'Log Sleep', icon: 'moon', color: palette.accent.purple, image: QA_SLEEP, route: '/(modals)/log-sleep' },
    { id: 'stats', label: 'Progress', icon: 'stats-chart', color: palette.accent.blue, image: QA_STATS, route: '/(performance)' },
] as const;

// Exercise categories shown as image cards
const EXERCISE_CATEGORY_META = [
    {
        id: 'gym',
        label: 'Gym Workout',
        fallbackCount: '500+',
        image: CAT_GYM_IMG,
        accent: palette.accent.coral,
        filter: 'gym',
    },
    {
        id: 'home',
        label: 'Home Workout',
        fallbackCount: '200+',
        image: CAT_HOME_IMG,
        accent: palette.accent.cyan,
        filter: 'home',
    },
    {
        id: 'cardio',
        label: 'Cardio',
        fallbackCount: '80+',
        image: CAT_CARDIO_IMG,
        accent: palette.accent.blue,
        filter: 'cardio',
    },
    {
        id: 'kegel',
        label: 'Kegel / Pelvic',
        fallbackCount: '5',
        image: CAT_RECOVERY_IMG,
        accent: palette.accent.purple,
        filter: 'kegel',
    },
] as const;

// More Features shown as image cards on Home
const MORE_FEATURES = [
    { id: 'shifts', label: 'Shifts', image: HERO_TRAINING, accent: palette.accent.amber, route: '/(shifts)' },
    { id: 'sleep', label: 'Sleep Tracker', image: QA_SLEEP, accent: palette.accent.purple, route: '/(modals)/log-sleep' },
    { id: 'community', label: 'Community', image: MUSCLE_SHOULDERS_IMG, accent: palette.accent.blue, route: '/(community)' },
    { id: 'coaches', label: 'Coaches', image: MUSCLE_ARMS_IMG, accent: palette.accent.coral, route: '/coaches/browse' },
    { id: 'circadian', label: 'Circadian', image: CAT_RECOVERY_IMG, accent: palette.accent.purpleLight, route: '/(tabs)/circadian' },
    { id: 'settings', label: 'Settings', image: CAT_HOME_IMG, accent: palette.text.secondary, route: '/(settings)' },
] as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toMinutes(t?: string): number {
    if (!t) return 0;
    const [h = '0', m = '0'] = t.split(':');
    return parseInt(h, 10) * 60 + parseInt(m, 10);
}

function parseTimeStr(t: string): Date | null {
    try {
        const d = new Date(t);
        if (!isNaN(d.getTime())) return d;
        const [h, m] = t.split(':');
        if (!h) return null;
        const r = new Date();
        r.setHours(parseInt(h, 10), parseInt(m ?? '0', 10), 0, 0);
        return r;
    } catch { return null; }
}

function getCountdown(endTime: string): string | null {
    const end = parseTimeStr(endTime);
    if (!end) return null;
    const now = new Date();
    if (end < now) end.setDate(end.getDate() + 1);
    const ms = end.getTime() - now.getTime();
    if (ms <= 0) return null;
    const min = Math.floor(ms / 60000);
    return `${Math.floor(min / 60)}h ${min % 60}m`;
}

function getNextMeal(meals: PlanMeal[]): PlanMeal | null {
    if (!meals.length) return null;
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
    const sorted = [...meals].sort((a, b) => toMinutes(a.time) - toMinutes(b.time));
    return sorted.find(m => toMinutes(m.time) > nowMin) ?? sorted[0] ?? null;
}

function getInsight(hour: number) {
    if (hour >= 22 || hour < 5) return { icon: 'moon' as const, text: 'Melatonin rising. Wind down screens.', color: palette.accent.purple };
    if (hour >= 5 && hour < 9) return { icon: 'sunny' as const, text: 'Cortisol peak. Delay caffeine 90 min.', color: palette.accent.amber };
    if (hour >= 14 && hour < 17) return { icon: 'water' as const, text: 'Cortisol dip. Ideal time for protein.', color: palette.accent.cyan };
    if (hour >= 17 && hour < 22) return { icon: 'flash' as const, text: 'Alertness window closing. Fuel up now.', color: palette.accent.coral };
    return { icon: 'pulse' as const, text: 'Optimal alertness window. Stay fuelled.', color: palette.accent.blue };
}

// ─── MacroPill ────────────────────────────────────────────────────────────────

const MacroPill = React.memo(function MacroPill({ label, value, color }: { label: string; value: string; color: string }) {
    const { colors } = useTheme();
    return (
        <View style={[mp.pill, { backgroundColor: withAlpha(color, 0.10) }]}>
            <Text style={[typography.statTiny, mp.val, { color }]}>{value}</Text>
            <Text style={[typography.caption, mp.lbl, { color: colors.text.secondary }]}>{label}</Text>
        </View>
    );
});
const mp = StyleSheet.create({
    pill: { alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, marginRight: 8 },
    val: {},
    lbl: { marginTop: 2 },
});

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function DashboardScreen() {
    const { colors, shadows } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const qc = useQueryClient();
    const { user } = useAuthStore();
    const [refreshing, setRefreshing] = useState(false);

    // ── Queries ──
    // Each query exposes isError + refetch so the dashboard can render a uniform
    // "Couldn't load … / Retry" EmptyState (instead of crashing or staying
    // empty) and re-fire the request on tap.
    const { data: shift, isLoading: shiftLoading, isError: shiftError, refetch: shiftRefetch } =
        useQuery({ queryKey: ['current-shift'], queryFn: getCurrentShift, retry: 1 });
    const { data: progress, isLoading: progressLoading, isError: progressError, refetch: progressRefetch } =
        useQuery({ queryKey: ['today-progress'], queryFn: getTodayProgress, retry: 1 });
    const { data: plan, isLoading: planLoading, isError: planError, refetch: planRefetch } =
        useQuery({ queryKey: ['today-plan'], queryFn: getTodayPlan, retry: 1 });

    // Fetch exercise counts per category
    const exerciseCountQueries = EXERCISE_CATEGORY_META.map(cat => cat.filter);
    const { data: exerciseCounts } = useQuery({
        queryKey: ['exercise-counts'],
        queryFn: async () => {
            const counts: Record<string, number> = {};
            await Promise.all(
                exerciseCountQueries.map(async (category) => {
                    try {
                        const results = await searchLibrary(null, category);
                        counts[category] = results.length;
                    } catch { counts[category] = 0; }
                })
            );
            return counts;
        },
        staleTime: 30 * 60 * 1000, // 30 min cache
        retry: 1,
    });

    const exerciseCategories = useMemo(() =>
        EXERCISE_CATEGORY_META.map(cat => ({
            ...cat,
            count: exerciseCounts?.[cat.filter] != null
                ? String(exerciseCounts[cat.filter])
                : cat.fallbackCount,
        })),
        [exerciseCounts]);

    const { mutate: addWater } = useMutation({
        mutationFn: () => logHydration(250),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['today-progress'] }),
    });

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await qc.invalidateQueries();
        setRefreshing(false);
    }, [qc]);

    // ── Derived (all before any early return) ──
    const greeting = useMemo(() => {
        const h = new Date().getHours();
        return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
    }, []);

    const formattedDate = useMemo(() =>
        new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date()),
        []);

    const countdown = useMemo(() => shift?.endTime ? getCountdown(shift.endTime) : null, [shift]);
    const nextMeal = useMemo(() => plan?.meals ? getNextMeal(plan.meals) : null, [plan]);
    const insight = useMemo(() => getInsight(new Date().getHours()), []);
    const hydPct = useMemo(() => progress
        ? Math.min(((progress.hydrationActual || progress.hydrationMl || 0) / 2500) * 100, 100)
        : 0, [progress]);
    const sortedMeals = useMemo(() =>
        plan?.meals?.length ? [...plan.meals].sort((a, b) => toMinutes(a.time) - toMinutes(b.time)) : [],
        [plan?.meals]);
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
    const displayName = (user as any)?.displayName ?? user?.name ?? 'User';
    const initials = useMemo(() => {
        const name = displayName;
        return name.split(' ').map((n: string) => n[0] ?? '').join('').toUpperCase().slice(0, 2);
    }, [displayName]);

    // NB: we no longer block the whole dashboard on `shiftLoading`. The
    // ShiftTransitionCard owns its own loading + error skeleton, and every
    // other section (UP NEXT meal, hydration mini, etc.) similarly handles its
    // own loading/error/empty branches. This keeps the layout stable while any
    // single query is in flight and lets each section surface its own retry.
    const heroColor = countdown ? colors.accent.coral : colors.accent.cyan;

    return (
        <ImageBackground
            blurRadius={3} // Slight atmospheric blur on the raw image
            source={HERO_TRAINING}
            style={[s.root, { backgroundColor: colors.background.primary }]}
            imageStyle={{ opacity: 0.4 }}
        >
            {/* Translucent light status bar so the hero glow bleeds under the
                notch. Mirrors the global root StatusBar (idempotent) and makes
                the intent explicit at the screen level. */}
            <StatusBar style="light" translucent backgroundColor="transparent" />
            <LinearGradient
                colors={['rgba(10,10,13,0.7)', colors.background.primary]}
                style={StyleSheet.absoluteFillObject}
            />
            <ScrollView
                contentContainerStyle={[s.scroll, { paddingTop: insets.top + 16, paddingBottom: BOTTOM_CLEARANCE }]}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent.coral} />}
                showsVerticalScrollIndicator={false}
            >

                {/* ══ HEADER ══════════════════════════════════════════════════ */}
                <View style={s.header}>
                    <View style={s.headerLeft}>
                        <TouchableOpacity
                            onPress={() => router.push('/(tabs)/profile' as any)}
                            activeOpacity={0.75}
                            accessibilityRole="button"
                            accessibilityLabel="Profile"
                        >
                            <View style={[s.avatar, shadows.glow(colors.accent.coral), {
                                backgroundColor: withAlpha(colors.accent.coral, 0.14),
                                borderColor: withAlpha(colors.accent.coral, 0.35),
                            }]}>
                                <Text style={[s.avatarTxt, { color: colors.accent.coral }]}>{initials}</Text>
                            </View>
                        </TouchableOpacity>
                        <View>
                            <Text style={[typography.captionMedium, s.greetTxt, { color: colors.text.secondary }]}>{greeting} 👋</Text>
                            <Text style={[typography.h1, s.nameTxt, { color: colors.text.primary }]} numberOfLines={1}>{displayName}</Text>
                        </View>
                    </View>
                    <View style={s.headerRight}>
                        {shift && (
                            <View style={[s.shiftBadge, {
                                backgroundColor: withAlpha(colors.accent.cyan, 0.10),
                                borderColor: withAlpha(colors.accent.cyan, 0.25),
                            }]}>
                                <View style={[s.shiftDot, { backgroundColor: colors.accent.cyan }]} />
                                <Text style={[s.shiftTxt, { color: colors.accent.cyan }]}>{shift.type}</Text>
                            </View>
                        )}
                        <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Notifications"
                            activeOpacity={0.75}
                            style={[s.iconBtn, { backgroundColor: withAlpha(colors.text.primary, 0.06) }]}
                            onPress={() => router.push('/(settings)/notifications' as any)}
                        >
                            <Ionicons name="notifications-outline" size={20} color={colors.text.primary} />
                        </TouchableOpacity>
                    </View>
                </View>
                <Text style={[typography.bodySm, s.dateTxt, { color: colors.text.secondary }]}>{formattedDate}</Text>

                {/* ══ SHIFT COUNTDOWN HERO ════════════════════════════════════ */}
                <TouchableOpacity
                    onPress={() => router.push('/(shifts)' as any)}
                    activeOpacity={0.88}
                    accessibilityRole="button"
                    accessibilityLabel={countdown ? `Your shift ends in ${countdown}` : 'No active shift, rest mode'}
                    style={s.heroPress}
                >
                    <GlassCard
                        intensity={40}
                        radius={24}
                        glow={heroColor}
                        style={{ borderColor: withAlpha(heroColor, 0.25) }}
                    >
                        <LinearGradient
                            colors={countdown ? colors.gradients.coral : [withAlpha(heroColor, 0.18), withAlpha(heroColor, 0.02)]}
                            style={StyleSheet.absoluteFillObject}
                            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                        />
                        <View style={s.heroInner}>
                            <View style={{ flex: 1 }}>
                                <Text style={[typography.overline, s.heroLbl, { color: countdown ? withAlpha('#FFFFFF', 0.92) : colors.text.secondary }]}>
                                    {countdown ? 'Your shift ends in' : 'No active shift'}
                                </Text>
                                <Text
                                    style={[
                                        countdown ? typography.statLarge : typography.h1,
                                        s.heroVal,
                                        { color: countdown ? colors.text.primary : heroColor },
                                        // White-on-coral runs ~2.84:1; a soft dark
                                        // text shadow lifts legibility on the filled
                                        // hero. Rest-mode (cyan-on-glass) already
                                        // passes AA so it skips the shadow.
                                        countdown ? s.heroValShadow : null,
                                    ]}
                                    numberOfLines={1}
                                    adjustsFontSizeToFit
                                    maxFontSizeMultiplier={STAT_MAX_SCALE}
                                >
                                    {countdown ?? 'Rest Mode'}
                                </Text>
                            </View>
                            <View style={[s.heroIcon, { backgroundColor: countdown ? withAlpha('#FFFFFF', 0.18) : withAlpha(heroColor, 0.12) }]}>
                                <Ionicons
                                    name={countdown ? 'time-outline' : 'moon-outline'}
                                    size={34}
                                    color={countdown ? colors.text.primary : heroColor}
                                />
                            </View>
                        </View>
                    </GlassCard>
                </TouchableOpacity>

                {/* ══ CIRCADIAN INSIGHT CHIP ══════════════════════════════════ */}
                <View style={[s.chipWrap, {
                    backgroundColor: withAlpha(insight.color, 0.10),
                    borderColor: withAlpha(insight.color, 0.22),
                }]}>
                    <Ionicons name={insight.icon} size={13} color={insight.color} />
                    <Text style={[typography.captionMedium, s.chipTxt, { color: insight.color }]}>{insight.text}</Text>
                </View>

                {/* ══ UP NEXT MEAL ════════════════════════════════════════════ */}
                {planError ? (
                    <View style={s.emptyCard}>
                        <EmptyState
                            icon="cloud-offline-outline"
                            title="Couldn't load"
                            subtitle="We couldn't reach today's meal plan. Try again in a moment."
                            actionLabel="Retry"
                            onAction={() => planRefetch()}
                        />
                    </View>
                ) : planLoading ? (
                    <View style={s.upNextSkeleton}>
                        <View style={s.upNextTop}>
                            <Skeleton width={120} height={26} radius={borderRadius.md} />
                            <Skeleton width={34} height={34} radius={borderRadius.full} />
                        </View>
                        <Skeleton width="70%" height={26} radius={borderRadius.sm} style={{ marginTop: spacing.md }} />
                        <Skeleton width="90%" height={16} radius={borderRadius.sm} style={{ marginTop: spacing.sm }} />
                        <Skeleton width="100%" height={46} radius={borderRadius.lg} style={{ marginTop: spacing.xl }} />
                    </View>
                ) : nextMeal ? (
                    <GlassCard intensity={40} radius={24} style={{ marginBottom: 16 }}>
                        <LinearGradient
                            colors={[withAlpha(colors.accent.coral, 0.08), 'transparent']}
                            style={StyleSheet.absoluteFillObject}
                            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                        />
                        <View style={s.upNextInner}>
                            <View style={s.upNextTop}>
                                <View style={[s.upNextBadge, { backgroundColor: withAlpha(colors.accent.coral, 0.12) }]}>
                                    <Text style={[typography.overline, s.upNextLbl, { color: colors.accent.coral }]}>UP NEXT</Text>
                                    <Text style={[s.upNextTime, { color: colors.accent.coral }]}> · {nextMeal.time}</Text>
                                </View>
                                <View style={[s.mealIconWrap, { backgroundColor: withAlpha(colors.accent.amber, 0.12) }]}>
                                    <Ionicons name="restaurant" size={16} color={colors.accent.amber} />
                                </View>
                            </View>
                            <Text style={[typography.h2, s.mealName, { color: colors.text.primary }]}>{nextMeal.label}</Text>
                            {!!nextMeal.description && (
                                <Text style={[typography.bodySm, s.mealDesc, { color: colors.text.secondary }]} numberOfLines={2}>
                                    {nextMeal.description}
                                </Text>
                            )}
                            {nextMeal.macros && (
                                <View style={s.macroRow}>
                                    <MacroPill label="Protein" value={nextMeal.macros.protein + 'g'} color={colors.accent.coral} />
                                    <MacroPill label="Carbs" value={nextMeal.macros.carbs + 'g'} color={colors.accent.cyan} />
                                    <MacroPill label="Fat" value={nextMeal.macros.fat + 'g'} color={colors.accent.amber} />
                                </View>
                            )}
                            <CtaButton
                                testID="dashboard-up-next-log-meal-cta"
                                size="md"
                                icon="checkmark"
                                label="Log Meal"
                                onPress={() => router.push('/(tabs)/nutrition' as any)}
                            />
                        </View>
                    </GlassCard>
                ) : (
                    <View style={s.emptyCard}>
                        <EmptyState
                            icon="restaurant-outline"
                            title="No meals planned yet"
                            subtitle="Build today's fuelling plan around your shift to see your next meal here."
                            actionLabel="Plan my meals"
                            onAction={() => router.push('/(tabs)/nutrition' as any)}
                        />
                    </View>
                )}

                {/* ══ NEXT SHIFT TRANSITION (circadian readiness) ══════════════ */}
                <ShiftTransitionCard
                    shift={shift ?? null}
                    loading={shiftLoading}
                    error={shiftError}
                    onRetry={() => shiftRefetch()}
                />

                {/* ══ LIGHT PLAN (light-exposure coaching) ════════════════════ */}
                <LightPlanCard
                    shift={shift ?? null}
                    loading={shiftLoading}
                    error={shiftError}
                    onRetry={() => shiftRefetch()}
                />

                {/* ══ ANCHOR SLEEP (fixed core-sleep block) ═══════════════════ */}
                <AnchorSleepCard
                    shift={shift ?? null}
                    loading={shiftLoading}
                    error={shiftError}
                    onRetry={() => shiftRefetch()}
                />

                {/* ══ TODAY (composed circadian day-plan timeline) ═══════════ */}
                <TodayCircadianTimeline
                    shift={shift ?? null}
                    loading={shiftLoading}
                    error={shiftError}
                    onRetry={() => shiftRefetch()}
                    now={new Date()}
                />

                {/* ══ SLEEP + HYDRATION + CAFFEINE MINI CARDS ════════════════ */
                /* Sleep + Hydration share row 1; CaffeineTimerTile wraps to row
                 * 2 as the 3rd tile (kept at MINI_W width for visual rhythm). */}
                <View style={s.miniRow}>
                    {/* Sleep Window */}
                    <TouchableOpacity
                        style={{ width: MINI_W }}
                        onPress={() => router.push('/(shifts)/sleep-optimizer' as any)}
                        activeOpacity={0.8}
                        accessibilityRole="button"
                        accessibilityLabel="Sleep Window, 8 hour target, melatonin guide"
                    >
                        <GlassCard intensity={40} radius={20} style={{ width: '100%' }}>
                            <View style={s.miniInner}>
                                <View style={[s.miniIcon, { backgroundColor: withAlpha(colors.accent.purple, 0.14) }]}>
                                    <Ionicons name="moon" size={20} color={colors.accent.purple} />
                                </View>
                                <Text style={[typography.overline, s.miniLbl, { color: colors.text.secondary }]}>Sleep Window</Text>
                                <Text style={[s.miniVal, { color: colors.text.primary }]}>
                                    <Text style={typography.statSmall}>8h</Text>
                                    <Text style={[typography.captionMedium, { color: colors.text.secondary }]}> target</Text>
                                </Text>
                                {/* purpleLight (6.27:1) not purple (#7C4DFF, 4.06 — AA-large only) for AA on this small footer text. */}
                                <Text style={[typography.captionMedium, s.miniSub, { color: colors.accent.purpleLight }]}>Melatonin guide →</Text>
                            </View>
                        </GlassCard>
                    </TouchableOpacity>

                    {/* Hydration (with uniform error EmptyState on failure) */}
                    {progressError ? (
                        <View style={{ width: MINI_W }}>
                            <EmptyState
                                icon="cloud-offline-outline"
                                title="Couldn't load"
                                subtitle="Hydration is offline. Tap retry to try again."
                                actionLabel="Retry"
                                onAction={() => progressRefetch()}
                            />
                        </View>
                    ) : (
                        <GlassCard intensity={40} radius={20} style={{ width: MINI_W }}>
                            <View style={s.miniInner}>
                                <View style={[s.miniIcon, { backgroundColor: withAlpha(colors.accent.blue, 0.14) }]}>
                                    <Ionicons name="water" size={20} color={colors.accent.blue} />
                                </View>
                                <Text style={[typography.overline, s.miniLbl, { color: colors.text.secondary }]}>Hydration</Text>
                                <Text style={[s.miniVal, { color: colors.text.primary }]}>
                                    <Text style={typography.statMedium}>
                                        {progress ? ((progress.hydrationActual || progress.hydrationMl || 0) / 1000).toFixed(1) : '0'}
                                    </Text>
                                    <Text style={[typography.captionMedium, { color: colors.text.secondary }]}>
                                        {' / 2.5L'}
                                    </Text>
                                </Text>
                                <View style={[s.hydBarBg, { backgroundColor: withAlpha(colors.accent.blue, 0.15) }]}>
                                    <View style={[s.hydBarFill, { width: (hydPct + '%') as any, backgroundColor: colors.accent.blue }]} />
                                </View>
                                <TouchableOpacity
                                    style={[s.addWaterBtn, {
                                        backgroundColor: withAlpha(colors.accent.blue, 0.12),
                                        borderColor: withAlpha(colors.accent.blue, 0.22),
                                    }]}
                                    onPress={() => addWater()}
                                    activeOpacity={0.85}
                                    accessibilityRole="button"
                                    accessibilityLabel="Add 250 millilitres of water"
                                >
                                    <Text style={[typography.captionMedium, s.addWaterTxt, { color: colors.accent.blue }]}>+ Add 250ml</Text>
                                </TouchableOpacity>
                            </View>
                        </GlassCard>
                    )}
                </View>

                {/* ── Caffeine Timer (mini-card row continuation) ───────────── */}
                <View style={s.caffeineRow}>
                    <View style={{ width: MINI_W }}>
                        <CaffeineTimerTile shift={shift ?? null} />
                    </View>
                </View>

                {/* ══ QUICK ACTIONS ════════════════════════════════════════════ */}
                <Text style={[typography.overline, s.sectionLbl, { color: colors.text.secondary }]}>QUICK ACTIONS</Text>
                <View style={s.quickGrid}>
                    {QUICK_ACTIONS.map(a => (
                        <TouchableOpacity
                            key={a.id}
                            onPress={() => router.push(a.route as any)}
                            activeOpacity={0.75}
                            accessibilityRole="button"
                            accessibilityLabel={a.label}
                            style={{ width: MINI_W, height: 110, borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: withAlpha(colors.text.primary, 0.1) }}
                        >
                            <Image
                                source={a.image}
                                style={StyleSheet.absoluteFillObject}
                                contentFit="cover"
                                cachePolicy="memory-disk"
                                transition={200}
                            />
                            {/* Dark gradient for text readability */}
                            <LinearGradient
                                colors={['transparent', 'rgba(0,0,0,0.8)']}
                                style={StyleSheet.absoluteFillObject}
                            />
                            {/* Icon pill top-right */}
                            <View style={{ position: 'absolute', top: 12, right: 12, backgroundColor: withAlpha(a.color, 0.8), width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }}>
                                <Ionicons name={a.icon as any} size={16} color="#fff" />
                            </View>
                            {/* Label bottom-left */}
                            <View style={{ position: 'absolute', bottom: 12, left: 12, right: 12 }}>
                                <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800', textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 }}>
                                    {a.label}
                                </Text>
                            </View>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* ══ EXERCISE CATEGORIES ═════════════════════════════════════ */}
                <Text style={[typography.overline, s.sectionLbl, { color: colors.text.secondary }]}>EXPLORE</Text>
                <View style={s.catGrid}>
                    {exerciseCategories.map(cat => (
                        <TouchableOpacity
                            key={cat.id}
                            style={s.catCard}
                            onPress={() => router.push(`/(exercises)?category=${cat.id}` as any)}
                            activeOpacity={0.82}
                            accessibilityRole="button"
                            accessibilityLabel={`${cat.label}, ${cat.count} exercises`}
                        >
                            <Image
                                source={cat.image}
                                style={StyleSheet.absoluteFillObject}
                                contentFit="cover"
                                cachePolicy="memory-disk"
                                transition={200}
                            />
                            {/* Dark gradient overlay for readability */}
                            <LinearGradient
                                colors={['transparent', 'rgba(0,0,0,0.72)']}
                                style={StyleSheet.absoluteFillObject}
                            />
                            {/* Count badge top-right */}
                            <View style={[s.catBadge, { backgroundColor: withAlpha(cat.accent, 0.85) }]}>
                                <Text style={s.catBadgeTxt}>{cat.count}</Text>
                            </View>
                            {/* Label bottom-left */}
                            <View style={s.catLabel}>
                                <Text style={s.catLabelTxt}>{cat.label}</Text>
                            </View>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* ══ MORE FEATURES (HOME) ═════════════════════════════════════ */}
                <Text style={[typography.overline, s.sectionLbl, { color: colors.text.secondary }]}>MORE FEATURES</Text>
                <View style={[s.catGrid, { marginBottom: 28 }]}>
                    {MORE_FEATURES.map(feat => (
                        <TouchableOpacity
                            key={feat.id}
                            style={s.catCard}
                            onPress={() => router.push(feat.route as any)}
                            activeOpacity={0.82}
                            accessibilityRole="button"
                            accessibilityLabel={feat.label}
                        >
                            <Image
                                source={feat.image}
                                style={StyleSheet.absoluteFillObject}
                                contentFit="cover"
                                cachePolicy="memory-disk"
                                transition={200}
                            />
                            {/* Dark gradient overlay for readability */}
                            <LinearGradient
                                colors={['transparent', 'rgba(0,0,0,0.72)']}
                                style={StyleSheet.absoluteFillObject}
                            />
                            {/* Label bottom-left */}
                            <View style={s.catLabel}>
                                <Text style={s.catLabelTxt}>{feat.label}</Text>
                            </View>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* ══ WORKOUT ACTIVITY HEATMAP ═════════════════════════════════ */}
                <Text style={[typography.overline, s.sectionLbl, { color: colors.text.secondary }]}>WORKOUT ACTIVITY</Text>
                <ActivityHeatmap />
                <View style={{ height: 20 }} />

                {/* ══ 24-HOUR SCHEDULE TIMELINE ════════════════════════════════ */}
                <View style={s.sectionRow}>
                    <Text style={[typography.overline, s.sectionLbl, { color: colors.text.secondary }]}>24H SCHEDULE</Text>
                    {sortedMeals.length > 0 && (
                        <TouchableOpacity
                            onPress={() => router.push('/(tabs)/circadian' as any)}
                            activeOpacity={0.85}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            accessibilityRole="button"
                            accessibilityLabel="View full 24 hour schedule"
                        >
                            <Text style={[typography.captionMedium, s.viewAll, { color: colors.accent.coral }]}>View Full →</Text>
                        </TouchableOpacity>
                    )}
                </View>

                {planLoading ? (
                    <View style={[s.timeline, { borderColor: withAlpha(colors.text.primary, 0.1) }]}>
                        {[0, 1, 2, 3].map(i => (
                            <View key={i} style={s.tlRow}>
                                <Skeleton width={40} height={12} radius={borderRadius.sm} />
                                <View style={s.tlConnector}>
                                    <Skeleton width={10} height={10} radius={borderRadius.full} />
                                </View>
                                <View style={s.tlContent}>
                                    <Skeleton width="60%" height={14} radius={borderRadius.sm} />
                                </View>
                            </View>
                        ))}
                    </View>
                ) : sortedMeals.length === 0 ? (
                    <View style={s.emptyCard}>
                        <EmptyState
                            icon="calendar-outline"
                            title="Your day is a blank canvas"
                            subtitle="Set up a meal protocol to map your fuel, hydration and rest across all 24 hours."
                            actionLabel="View circadian plan"
                            onAction={() => router.push('/(tabs)/circadian' as any)}
                        />
                    </View>
                ) : (
                    <GlassCard intensity={40} radius={20} style={s.timelineWrap}>
                        <View style={s.timelineInner}>
                            {sortedMeals.map((meal, idx) => {
                                const mMin = toMinutes(meal.time);
                                const isPast = mMin < nowMin;
                                const prev = sortedMeals[idx - 1];
                                const isNow = !isPast && (idx === 0 || (prev ? toMinutes(prev.time) < nowMin : true));
                                const isLast = idx === sortedMeals.length - 1;

                                return (
                                    <View key={`${meal.time || 'unknown'}-${idx}`} style={s.tlRow}>
                                        <Text style={[s.tlTime, { color: isNow ? colors.accent.coral : colors.text.tertiary }]}>
                                            {meal.time}
                                        </Text>
                                        <View style={s.tlConnector}>
                                            <View style={[s.tlDot, {
                                                backgroundColor: isPast ? colors.accent.cyan : isNow ? colors.accent.coral : 'transparent',
                                                borderColor: isPast ? colors.accent.cyan : isNow ? colors.accent.coral : colors.border.default,
                                                transform: [{ scale: isNow ? 1.3 : 1 }],
                                            }]} />
                                            {!isLast && (
                                                <View style={[s.tlLine, { backgroundColor: withAlpha(colors.text.primary, 0.2) }]} />
                                            )}
                                        </View>
                                        <View style={s.tlContent}>
                                            <View style={s.tlTitleRow}>
                                                <Text
                                                    style={[s.tlMeal, { color: isPast ? colors.text.secondary : colors.text.primary }]}
                                                    numberOfLines={1}
                                                >
                                                    {meal.label}
                                                </Text>
                                                {isNow && (
                                                    <View style={[s.nowBadge, { backgroundColor: colors.accent.coral }]}>
                                                        <Text style={s.nowTxt} maxFontSizeMultiplier={MICRO_MAX_SCALE}>NOW</Text>
                                                    </View>
                                                )}
                                                {isPast && (
                                                    <Ionicons name="checkmark-circle" size={15} color={colors.accent.cyan} />
                                                )}
                                            </View>
                                            {!!meal.description && !isPast && (
                                                <Text style={[s.tlDesc, { color: colors.text.secondary }]} numberOfLines={1}>
                                                    {meal.description}
                                                </Text>
                                            )}
                                        </View>
                                    </View>
                                );
                            })}
                        </View>
                    </GlassCard>
                )}

                {/* ══ WEEKLY RECAP ════════════════════════════════════════════ */}
                <Text style={[typography.overline, s.sectionLbl, { color: colors.text.secondary, marginTop: 4 }]}>WEEKLY RECAP</Text>
                <WeeklyRecap />

                {/* Tail breathing room; the heavy tab-bar + Ria-FAB clearance
                    is reserved on the ScrollView's contentContainer paddingBottom
                    (BOTTOM_CLEARANCE) so we don't double-count it here. */}
                <View style={{ height: spacing.lg }} />
            </ScrollView>
        </ImageBackground>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
    root: { flex: 1 },
    scroll: { paddingHorizontal: H_PAD },

    // Header
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
    avatarTxt: { fontSize: 15, fontWeight: '800' },
    greetTxt: {},
    nameTxt: { marginTop: 1 },
    shiftBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
    shiftDot: { width: 6, height: 6, borderRadius: 3 },
    shiftTxt: { fontSize: 12, fontWeight: '700' },
    iconBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
    dateTxt: { marginBottom: 20, marginTop: 2 },

    // Hero
    // Press wrapper owns only the outer spacing now; the GlassCard owns the
    // radius/hairline/glow and the heroInner View owns the row layout + padding.
    heroPress: { marginBottom: 12 },
    heroInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 24 },
    heroLbl: { marginBottom: 6 },
    heroVal: {},
    heroValShadow: { textShadowColor: 'rgba(0,0,0,0.35)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
    heroIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },

    // Insight chip
    chipWrap: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, borderWidth: 1, marginBottom: 20, alignSelf: 'flex-start' },
    chipTxt: { flexShrink: 1 },

    // UP NEXT card
    // Inner content padding for the GlassCard-wrapped UP NEXT card.
    upNextInner: { padding: 22 },
    upNextSkeleton: { padding: 22, borderRadius: 24, borderWidth: 1, borderColor: palette.border.default, backgroundColor: withAlpha(palette.background.secondary, 0.5), marginBottom: 16 },
    upNextTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
    upNextBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
    upNextLbl: {},
    upNextTime: { fontSize: 11, fontWeight: '700' },
    mealIconWrap: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
    mealName: { marginBottom: 6 },
    mealDesc: { marginBottom: 14 },
    macroRow: { flexDirection: 'row', marginBottom: 18 },

    // Mini cards
    miniRow: { flexDirection: 'row', gap: CARD_GAP, marginBottom: 12 },
    caffeineRow: { marginBottom: 28 },
    // Inner content padding for the GlassCard-wrapped mini cards (sleep/hydration).
    miniInner: { padding: 16 },
    miniIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
    miniLbl: { marginBottom: 4 },
    miniVal: { marginBottom: 4 },
    miniSub: {},
    hydBarBg: { height: 4, borderRadius: 4, marginVertical: 10, overflow: 'hidden' },
    hydBarFill: { height: '100%', borderRadius: 4 },
    addWaterBtn: { paddingVertical: 7, borderRadius: 10, borderWidth: 1, alignItems: 'center', marginTop: 4 },
    addWaterTxt: {},

    // Empty / zero-data card (matches glass card rhythm)
    emptyCard: { borderRadius: 24, borderWidth: 1, borderColor: palette.border.default, backgroundColor: withAlpha(palette.background.secondary, 0.5), marginBottom: 28, overflow: 'hidden' },

    // Exercise category cards (2×2 image grid)
    catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: CARD_GAP, marginBottom: 28 },
    catCard: { width: MINI_W, height: 110, borderRadius: 18, overflow: 'hidden', position: 'relative' },
    catBadge: { position: 'absolute', top: 10, right: 10, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
    catBadgeTxt: { color: '#fff', fontSize: 10, fontWeight: '900' },
    catLabel: { position: 'absolute', bottom: 10, left: 10, right: 10 },
    catLabelTxt: { color: '#fff', fontSize: 13, fontWeight: '800', textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },

    // Quick actions
    sectionLbl: { marginBottom: 14 },
    quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: CARD_GAP, marginBottom: 28 },

    // Section row with link
    sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
    viewAll: {},

    // Timeline
    // `timeline` is still used by the loading-skeleton View (plain bordered box).
    // The populated timeline is now a GlassCard: `timelineWrap` carries its outer
    // margin and `timelineInner` the row padding the old SafeBlurView held.
    timeline: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 28 },
    timelineWrap: { marginBottom: 28 },
    timelineInner: { paddingHorizontal: 16, paddingVertical: 12 },
    tlRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 10 },
    tlTime: { width: 44, fontSize: 12, fontWeight: '700', paddingTop: 2 },
    tlConnector: { alignItems: 'center', width: 24, marginHorizontal: 4 },
    tlDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 2 },
    tlLine: { width: 2, flex: 1, minHeight: 24, marginTop: 2 },
    tlContent: { flex: 1, paddingBottom: 4 },
    tlTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    tlMeal: { fontSize: 14, fontWeight: '700', flex: 1 },
    tlDesc: { fontSize: 12, marginTop: 3 },
    nowBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 },
    // White-on-solid-coral is the worst contrast case (~2.5:1); a strong dark
    // textShadow lifts the tiny "NOW" pip to a legible AA-equivalent without
    // losing the punchy white-on-coral identity (matches the count-badge recipe).
    nowTxt: {
        color: '#fff', fontSize: 10, fontWeight: '900', letterSpacing: 0.5,
        textShadowColor: 'rgba(0,0,0,0.55)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2,
    },
});
