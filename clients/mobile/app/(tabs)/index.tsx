/**
 * Dashboard — Zeitra home screen.
 * Restyled to the "home-preview" mockup (greeting + avatar + shift chip · a
 * TONIGHT'S-SESSION hero with a muscle-model motif + readiness ring · a "Next ·
 * pre-shift meal" hero card · a "Picked for your shift" horizontal carousel · an
 * asymmetric BENTO grid — training-tall + sleep/water/steps/calories tiles with
 * done-checks · the circadian training-window bar · the full circadian section
 * stack (next shift / transition / light / anchor sleep / "your rhythm tonight"
 * timeline / sleep+hydration+caffeine) · EXPLORE + MORE grids · heatmap · 24h
 * schedule · weekly recap · a Coach Ria insight card). Reanimated staggered
 * FadeInDown entrance.
 *
 * VISUAL re-skin ONLY — every data hook, query, navigation call, handler, prop,
 * route and testID is preserved from the prior revision (the screen still drives
 * the same shift countdown, next meal, hydration logging, readiness roll-up,
 * circadian timeline and quick actions). No shared ui/* or theme/* file changed.
 */
import React, { useState, useMemo, useCallback } from 'react';
import {
    View, Text, StyleSheet, ScrollView, RefreshControl,
    TouchableOpacity, Dimensions, ImageBackground
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { useTheme, colors as palette, typography, spacing, borderRadius } from '@/theme';
import { Skeleton, EmptyState, GlassCard, CtaButton } from '@/components/ui';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { getCurrent as getCurrentShift, list as listShifts } from '@/api/shifts';
import { getToday as getTodayPlan, PlanMeal } from '@/api/plans';
import { getToday as getTodayProgress, logHydration } from '@/api/progress';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/store/authStore';
import { withAlpha } from '@/theme/utils';
import { WeeklyRecap } from '@/components/WeeklyRecap';
import { ActivityHeatmap } from '@/components/ActivityHeatmap';
import { searchLibrary } from '@/api/exercises';
import NextShiftCard from '@/components/home/NextShiftCard';
import ShiftTransitionCard from '@/components/home/ShiftTransitionCard';
import LightPlanCard from '@/components/home/LightPlanCard';
import AnchorSleepCard from '@/components/home/AnchorSleepCard';
import TodayCircadianTimeline from '@/components/home/TodayCircadianTimeline';
import { CaffeineTimerTile } from '@/components/home/CaffeineTimerTile';
import { ReadinessRing, StatCard, TrainingWindowBar } from '@/components/home/HomeHeroExtras';
import { TAB_BAR_H } from './_layout';

const { width } = Dimensions.get('window');
const H_PAD = 20;
const CARD_GAP = 12;
const MINI_W = (width - H_PAD * 2 - CARD_GAP) / 2;
// 3-up stat grid: three equal cards across the content width.
const STAT_W = (width - H_PAD * 2 - CARD_GAP * 2) / 3;
// "Picked for your shift" carousel cards — wide enough to peek the next card.
const QA_CARD_W = 150;

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

// Optimal circadian training window (physiological alertness/strength peak,
// late afternoon). Purely visual framing for the TrainingWindowBar — mirrors the
// circadian coaching already surfaced by getInsight().
const TRAIN_START_H = 15;
const TRAIN_END_H = 19;

// Bundled Aurora dark-glass art (no external host → works offline, no 404 /
// rate-limit / privacy leak). '@/*' resolves to ./src, so assets are required
// by relative path — same module-scope require pattern as (exercises)/index.tsx.
const QA_MEAL = require('../../assets/images/qa-meal.png');
const QA_WORKOUT = require('../../assets/images/qa-workout.png');
const QA_SLEEP = require('../../assets/images/qa-sleep.png');
const QA_STATS = require('../../assets/images/qa-stats.png');
const HERO_TRAINING = require('../../assets/images/hero-training.png');
const HERO_MUSCLE = require('../../assets/images/muscle-chest-male.png');
const CAT_GYM_IMG = require('../../assets/images/cat-gym.png');
const CAT_HOME_IMG = require('../../assets/images/cat-home.png');
const CAT_CARDIO_IMG = require('../../assets/images/cat-cardio.png');
const CAT_RECOVERY_IMG = require('../../assets/images/cat-recovery.png');
const MUSCLE_SHOULDERS_IMG = require('../../assets/images/muscle-shoulders.png');
const MUSCLE_ARMS_IMG = require('../../assets/images/muscle-arms.png');
const MEAL_BREAKFAST_IMG = require('../../assets/images/meal-breakfast.png');

// Primary "Log Meal" CTA is the shared <CtaButton> (Aurora lime fill via the
// `gradients.coralCta` token, lime glow, ink label) — the screen-local
// LinearGradient copy was retired so this tab + Training render the same button
// from one source. Glass surfaces below use the shared <GlassCard>.

// ─── Static data ─────────────────────────────────────────────────────────────

// "Picked for your shift" carousel cards (formerly QUICK ACTIONS). Same ids /
// routes / labels / icons — only the card presentation changed to the mockup's
// image-top + title-below style. A short `sub` line was added per card (purely
// descriptive copy, no new data dependency).
const QUICK_ACTIONS = [
    { id: 'meal', label: 'Log Meal', sub: 'Fuel your shift', icon: 'restaurant', color: palette.accent.cyan, image: QA_MEAL, route: '/(tabs)/nutrition' },
    { id: 'workout', label: 'Log Workout', sub: 'Train now', icon: 'flame', color: palette.accent.coral, image: QA_WORKOUT, route: '/(tabs)/training' },
    { id: 'sleep', label: 'Log Sleep', sub: 'Anchor rest', icon: 'moon', color: palette.accent.purple, image: QA_SLEEP, route: '/(modals)/log-sleep' },
    { id: 'stats', label: 'Progress', sub: 'Track trends', icon: 'stats-chart', color: palette.accent.blue, image: QA_STATS, route: '/(performance)' },
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

// ─── BentoStat ─────────────────────────────────────────────────────────────────
// A single bento tile matching the mockup's stat tiles: a small icon+label row
// (with an optional lime "done" check), a big condensed numeral with a muted
// unit, and an optional thin progress bar. Pure presentation — the screen owns
// the data and passes already-derived strings/flags down. Pressable when an
// `onPress` is supplied (so the existing stat → screen navigation is preserved).
const BentoStat = React.memo(function BentoStat({
    icon, label, value, unit, accent, done, progressPct, onPress, accessibilityLabel,
}: {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    value: string;
    unit?: string;
    accent: string;
    done?: boolean;
    progressPct?: number;
    onPress?: () => void;
    accessibilityLabel?: string;
}) {
    const { colors } = useTheme();
    const body = (
        <GlassCard intensity={40} radius={18} style={{ flex: 1 }}>
            <View style={bs.inner}>
                <View style={bs.topRow}>
                    <View style={bs.lblRow}>
                        <Ionicons name={icon} size={13} color={colors.text.secondary} />
                        <Text style={[typography.captionMedium, bs.lbl, { color: colors.text.secondary }]} numberOfLines={1}>
                            {label}
                        </Text>
                    </View>
                    {done && (
                        <View style={[bs.check, { backgroundColor: withAlpha(colors.accent.coral, 0.18) }]}>
                            <Ionicons name="checkmark" size={11} color={colors.accent.coral} />
                        </View>
                    )}
                </View>
                <View style={bs.valRow}>
                    <Text
                        style={[typography.statSmall, { color: colors.text.primary }]}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        maxFontSizeMultiplier={STAT_MAX_SCALE}
                    >
                        {value}
                    </Text>
                    {!!unit && (
                        <Text style={[typography.captionMedium, bs.unit, { color: colors.text.secondary }]}>
                            {unit}
                        </Text>
                    )}
                </View>
                {typeof progressPct === 'number' && (
                    <View style={[bs.barBg, { backgroundColor: withAlpha(colors.text.primary, 0.10) }]}>
                        <View style={[bs.barFill, { width: (Math.max(0, Math.min(100, progressPct)) + '%') as any, backgroundColor: accent }]} />
                    </View>
                )}
            </View>
        </GlassCard>
    );

    if (!onPress) return <View style={{ flex: 1 }}>{body}</View>;
    return (
        <TouchableOpacity
            style={{ flex: 1 }}
            onPress={onPress}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel ?? `${label}, ${value}${unit ? ' ' + unit : ''}`}
        >
            {body}
        </TouchableOpacity>
    );
});
const bs = StyleSheet.create({
    inner: { padding: 13, minHeight: 78, justifyContent: 'space-between' },
    topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    lblRow: { flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 1 },
    lbl: { flexShrink: 1 },
    check: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
    valRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, marginTop: 6 },
    unit: { marginBottom: 3 },
    barBg: { height: 4, borderRadius: 4, marginTop: 9, overflow: 'hidden' },
    barFill: { height: '100%', borderRadius: 4 },
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
    // The user's shifts (±366d window) — drives the NextShiftCard countdown to
    // the soonest UPCOMING clock-in. Separate from ['current-shift'] (which is
    // the ACTIVE shift powering the hero); this activates the previously-dormant
    // api/shifts.list query. The card owns its own loading/error/empty branches.
    const { data: upcomingShifts, isLoading: upcomingLoading, isError: upcomingError, refetch: upcomingRefetch } =
        useQuery({ queryKey: ['shifts-upcoming'], queryFn: listShifts, retry: 1 });
    const { data: progress, isError: progressError, refetch: progressRefetch } =
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

    // Current fractional hour for the live NOW marker on the training-window bar.
    const nowHour = nowMin / 60;

    // ── Visual-only derived figures (no new data calls) ──
    // First name for a warmer hero greeting; falls back to the full displayName.
    const firstName = useMemo(() => String(displayName).split(' ')[0] || displayName, [displayName]);

    // Readiness ring (0–100): a composite of today's hydration progress and meal
    // adherence — both already on `progress`. No new query; purely a visual roll-
    // up of signals the dashboard already shows.
    const readiness = useMemo(() => {
        if (!progress) return 0;
        const hyd = hydPct; // 0–100
        const adh = progress.isAdherent ? 100 : Math.min((progress.mealsLogged ?? 0) * 25, 75);
        return Math.round(hyd * 0.5 + adh * 0.5);
    }, [progress, hydPct]);

    // Bento / stat values from existing `progress` fields.
    const hydL = progress ? ((progress.hydrationActual || progress.hydrationMl || 0) / 1000).toFixed(1) : '0.0';
    const kcal = progress ? String(Math.round(progress.caloriesActual || 0)) : '0';
    const steps = progress
        ? (progress.stepCount >= 1000 ? (progress.stepCount / 1000).toFixed(1) + 'k' : String(progress.stepCount))
        : '0';
    // Sleep hours (mockup bento tile). Read whatever the progress payload exposes
    // (sleepHours / sleepActual / sleepMinutes); default to a dash when absent so
    // we never render a fabricated number. Purely a visual roll-up of existing
    // signals — no new query.
    const sleepH = useMemo(() => {
        const p = progress as any;
        if (!p) return '—';
        const hrs = p.sleepHours ?? p.sleepActual
            ?? (typeof p.sleepMinutes === 'number' ? p.sleepMinutes / 60 : undefined)
            ?? (typeof p.sleepActualMinutes === 'number' ? p.sleepActualMinutes / 60 : undefined);
        return typeof hrs === 'number' && hrs > 0 ? (Math.round(hrs * 10) / 10).toFixed(1) : '—';
    }, [progress]);
    // Per-tile "done" flags (mockup shows lime checks on met goals). Derived from
    // existing targets where present; absent target → no check.
    const stepsDone = !!progress && progress.stepCount >= ((progress as any)?.stepGoal ?? 10000);
    const kcalTarget = progress?.caloriesTarget ? Math.round(progress.caloriesTarget) : undefined;
    const sleepDone = sleepH !== '—' && parseFloat(sleepH) >= 7;

    // NB: we no longer block the whole dashboard on `shiftLoading`. The
    // ShiftTransitionCard owns its own loading + error skeleton, and every
    // other section (UP NEXT meal, hydration mini, etc.) similarly handles its
    // own loading/error/empty branches. This keeps the layout stable while any
    // single query is in flight and lets each section surface its own retry.
    const heroColor = countdown ? colors.accent.coral : colors.accent.cyan;
    // Shift chip sub-label ("Night · 3h in" in the mockup) — only the elapsed
    // portion is computed, and only when the active shift exposes a parseable
    // startTime; otherwise we show just the shift type.
    const shiftElapsed = useMemo(() => {
        const start = shift?.startTime ? parseTimeStr(shift.startTime) : null;
        if (!start) return null;
        const now = new Date();
        if (start > now) return null;
        const min = Math.floor((now.getTime() - start.getTime()) / 60000);
        if (min < 60) return `${min}m in`;
        return `${Math.floor(min / 60)}h in`;
    }, [shift]);

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
                <Animated.View entering={FadeInDown.duration(420)}>
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
                            <View style={{ flexShrink: 1 }}>
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
                                    <Ionicons name="moon" size={11} color={colors.accent.cyan} />
                                    <Text style={[s.shiftTxt, { color: colors.accent.cyan }]} numberOfLines={1}>
                                        {shiftElapsed ? `${shift.type} · ${shiftElapsed}` : shift.type}
                                    </Text>
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

                    {/* Date + momentum chip (real adherence signal, not a fabricated streak) */}
                    <View style={s.subHeaderRow}>
                        <Text style={[typography.bodySm, s.dateTxt, { color: colors.text.secondary }]}>{formattedDate}</Text>
                        <View style={[s.momentumChip, {
                            backgroundColor: withAlpha(colors.accent.coral, 0.12),
                            borderColor: withAlpha(colors.accent.coral, 0.30),
                        }]}>
                            <Ionicons name="flame" size={12} color={colors.accent.coral} />
                            <Text style={[typography.caption, s.momentumTxt, { color: colors.accent.coral }]} maxFontSizeMultiplier={MICRO_MAX_SCALE}>
                                {progress?.isAdherent ? 'ON TRACK' : `${progress?.mealsLogged ?? 0} LOGGED`}
                            </Text>
                        </View>
                    </View>
                </Animated.View>

                {/* ══ TONIGHT'S SESSION HERO (muscle-model motif) ═════════════ */}
                <Animated.View entering={FadeInDown.delay(80).duration(460)}>
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
                            {/* Muscle-model artwork bleeds in from the right, masked
                                by the brand gradient so the copy stays legible. */}
                            <Image
                                source={HERO_MUSCLE}
                                style={s.heroArt}
                                contentFit="cover"
                                contentPosition="top"
                                cachePolicy="memory-disk"
                                transition={200}
                            />
                            <LinearGradient
                                colors={[withAlpha(heroColor, 0.16), withAlpha(heroColor, 0.02)]}
                                style={StyleSheet.absoluteFillObject}
                                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                            />
                            <LinearGradient
                                colors={['rgba(10,12,18,0.05)', 'rgba(10,12,18,0.55)', colors.background.primary]}
                                start={{ x: 1, y: 0 }} end={{ x: 0, y: 0 }}
                                style={StyleSheet.absoluteFillObject}
                            />
                            <View style={s.heroInner}>
                                {/* Left: label · countdown · START */}
                                <View style={s.heroLeft}>
                                    <View style={[s.heroTag, { backgroundColor: withAlpha(heroColor, 0.14) }]}>
                                        <View style={[s.heroTagDot, { backgroundColor: heroColor }]} />
                                        <Text style={[typography.overline, { color: heroColor }]}>
                                            {countdown ? "TONIGHT'S SESSION" : 'REST MODE'}
                                        </Text>
                                    </View>
                                    <Text
                                        style={[typography.statLarge, s.heroVal, { color: colors.text.primary }]}
                                        numberOfLines={1}
                                        adjustsFontSizeToFit
                                        maxFontSizeMultiplier={STAT_MAX_SCALE}
                                    >
                                        {countdown ?? 'Recover'}
                                    </Text>
                                    <Text style={[typography.bodySm, s.heroSub, { color: colors.text.secondary }]} numberOfLines={1}>
                                        {countdown ? 'until your shift ends' : 'No active shift — restore & rebuild'}
                                    </Text>
                                    <View style={s.heroCtaRow}>
                                        <CtaButton
                                            size="md"
                                            icon="play"
                                            label="START"
                                            onPress={() => router.push('/(tabs)/training' as any)}
                                            accessibilityLabel="Start training session"
                                            style={s.heroCta}
                                        />
                                    </View>
                                </View>
                                {/* Right: readiness ring */}
                                <View style={s.heroRingWrap}>
                                    <ReadinessRing percent={readiness} size={94} color={heroColor} label="READY" />
                                </View>
                            </View>
                        </GlassCard>
                    </TouchableOpacity>
                </Animated.View>

                {/* ══ NEXT · PRE-SHIFT MEAL (hero meal card) ══════════════════ */}
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
                        <Skeleton width="100%" height={104} radius={borderRadius.lg} />
                        <View style={s.upNextTop}>
                            <Skeleton width={150} height={24} radius={borderRadius.sm} />
                            <Skeleton width={64} height={34} radius={borderRadius.md} />
                        </View>
                        <Skeleton width="55%" height={14} radius={borderRadius.sm} style={{ marginTop: spacing.sm }} />
                    </View>
                ) : nextMeal ? (
                    <GlassCard intensity={40} radius={24} style={{ marginBottom: 18 }}>
                        {/* Photo header strip with the UP NEXT badge floated on it. */}
                        <View style={s.mealPhotoWrap}>
                            <Image
                                source={MEAL_BREAKFAST_IMG}
                                style={StyleSheet.absoluteFillObject}
                                contentFit="cover"
                                cachePolicy="memory-disk"
                                transition={200}
                            />
                            <LinearGradient
                                colors={['rgba(0,0,0,0.15)', 'rgba(10,12,18,0.9)']}
                                style={StyleSheet.absoluteFillObject}
                            />
                            <View style={[s.upNextBadge, { backgroundColor: withAlpha(colors.accent.coral, 0.92) }]}>
                                <Text style={[typography.overline, s.upNextLbl, { color: colors.text.inverse }]}>UP NEXT</Text>
                                <Text style={[s.upNextTime, { color: colors.text.inverse }]}> · {nextMeal.time}</Text>
                            </View>
                        </View>
                        <View style={s.upNextInner}>
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

                {/* ══ PICKED FOR YOUR SHIFT (horizontal carousel) ═════════════ */}
                <View style={s.sectionRow}>
                    <Text style={[typography.subtitle, s.sectionTitle, { color: colors.text.primary }]}>Picked for your shift</Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.text.secondary} />
                </View>
                <Animated.View entering={FadeInDown.delay(240).duration(460)}>
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        decelerationRate="fast"
                        snapToInterval={QA_CARD_W + CARD_GAP}
                        snapToAlignment="start"
                        contentContainerStyle={s.qaCarousel}
                    >
                        {QUICK_ACTIONS.map(a => (
                            <TouchableOpacity
                                key={a.id}
                                onPress={() => router.push(a.route as any)}
                                activeOpacity={0.85}
                                accessibilityRole="button"
                                accessibilityLabel={a.label}
                                style={s.qaCardWrap}
                            >
                                <GlassCard intensity={40} radius={16} style={{ width: '100%' }}>
                                    <View style={s.qaPhoto}>
                                        <Image
                                            source={a.image}
                                            style={StyleSheet.absoluteFillObject}
                                            contentFit="cover"
                                            cachePolicy="memory-disk"
                                            transition={200}
                                        />
                                        <LinearGradient
                                            colors={['transparent', 'rgba(0,0,0,0.55)']}
                                            style={StyleSheet.absoluteFillObject}
                                        />
                                        <View style={[s.qaIcon, { backgroundColor: withAlpha(a.color, 0.22) }]}>
                                            <Ionicons name={a.icon as any} size={15} color={a.color} />
                                        </View>
                                    </View>
                                    <View style={s.qaMeta}>
                                        <Text style={[typography.bodyMedium, s.qaLabel, { color: colors.text.primary }]} numberOfLines={1}>{a.label}</Text>
                                        <Text style={[typography.caption, s.qaSub, { color: colors.text.secondary }]} numberOfLines={1}>{a.sub}</Text>
                                    </View>
                                </GlassCard>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </Animated.View>

                {/* ══ BENTO GRID (training-tall + sleep/water/steps/calories) ═ */}
                <Animated.View entering={FadeInDown.delay(180).duration(460)} style={s.bentoRow}>
                    {/* Tall training tile (left column) */}
                    <TouchableOpacity
                        style={s.bentoTall}
                        onPress={() => router.push('/(tabs)/training' as any)}
                        activeOpacity={0.85}
                        accessibilityRole="button"
                        accessibilityLabel="Today's training, start workout"
                    >
                        <GlassCard intensity={40} radius={18} style={{ flex: 1 }}>
                            <View style={s.bentoTallPhoto}>
                                <Image
                                    source={CAT_GYM_IMG}
                                    style={StyleSheet.absoluteFillObject}
                                    contentFit="cover"
                                    cachePolicy="memory-disk"
                                    transition={200}
                                />
                                <LinearGradient
                                    colors={['transparent', 'rgba(10,12,18,0.85)']}
                                    style={StyleSheet.absoluteFillObject}
                                />
                            </View>
                            <View style={s.bentoTallMeta}>
                                <Text style={[typography.caption, { color: colors.text.secondary }]}>Today · training</Text>
                                <Text style={[typography.h3, s.bentoTallTitle, { color: colors.text.primary }]}>Push day</Text>
                                <CtaButton
                                    size="sm"
                                    icon="play"
                                    label="Start workout"
                                    onPress={() => router.push('/(tabs)/training' as any)}
                                    accessibilityLabel="Start workout"
                                    style={{ marginTop: 10 }}
                                />
                            </View>
                        </GlassCard>
                    </TouchableOpacity>

                    {/* Right column: 2×2 stat tiles */}
                    <View style={s.bentoCol}>
                        <View style={s.bentoPairRow}>
                            <BentoStat
                                icon="moon"
                                label="Sleep"
                                value={sleepH}
                                unit={sleepH === '—' ? undefined : 'h'}
                                accent={colors.accent.purple}
                                done={sleepDone}
                                onPress={() => router.push('/(shifts)/sleep-optimizer' as any)}
                                accessibilityLabel={`Sleep, ${sleepH === '—' ? 'not logged' : sleepH + ' hours'}`}
                            />
                            <BentoStat
                                icon="water"
                                label="Water"
                                value={hydL}
                                unit="/2.5L"
                                accent={colors.accent.blue}
                                progressPct={hydPct}
                                onPress={() => router.push('/(performance)' as any)}
                                accessibilityLabel={`Water, ${hydL} of 2.5 litres`}
                            />
                        </View>
                        <View style={s.bentoPairRow}>
                            <BentoStat
                                icon="footsteps"
                                label="Steps"
                                value={steps}
                                accent={colors.accent.cyan}
                                done={stepsDone}
                                onPress={() => router.push('/(performance)' as any)}
                                accessibilityLabel={`Steps, ${steps} today`}
                            />
                            <BentoStat
                                icon="flame"
                                label="Calories"
                                value={kcal}
                                unit={kcalTarget ? `/${kcalTarget}` : 'kcal'}
                                accent={colors.accent.coral}
                                onPress={() => router.push('/(tabs)/nutrition' as any)}
                                accessibilityLabel={`Calories, ${kcal} today`}
                            />
                        </View>
                    </View>
                </Animated.View>

                {/* ══ CIRCADIAN TRAINING-WINDOW BAR ═══════════════════════════ */}
                <Animated.View entering={FadeInDown.delay(220).duration(460)}>
                    <TrainingWindowBar
                        startHour={TRAIN_START_H}
                        endHour={TRAIN_END_H}
                        nowHour={nowHour}
                        accent={colors.accent.coral}
                    />
                </Animated.View>

                {/* ══ NEXT SHIFT (countdown to the soonest upcoming clock-in) ══ */}
                <NextShiftCard
                    shifts={upcomingShifts ?? null}
                    loading={upcomingLoading}
                    error={upcomingError}
                    onRetry={() => upcomingRefetch()}
                />

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

                {/* ══ YOUR RHYTHM TONIGHT (composed circadian day-plan timeline) */}
                <Text style={[typography.subtitle, s.rhythmTitle, { color: colors.text.primary }]}>Your rhythm tonight</Text>
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
                            <View style={[s.catBadge, { backgroundColor: withAlpha(cat.accent, 0.18) }]}>
                                <Text style={[s.catBadgeTxt, { color: cat.accent }]}>{cat.count}</Text>
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

                {/* ══ WEEKLY RECAP (streak + this-week signal) ════════════════ */}
                <Text style={[typography.overline, s.sectionLbl, { color: colors.text.secondary, marginTop: 4 }]}>WEEKLY RECAP</Text>
                <WeeklyRecap />

                {/* ══ COACH RIA (circadian insight card) ══════════════════════ */}
                <Animated.View entering={FadeInDown.delay(130).duration(460)}>
                    <GlassCard intensity={40} radius={20} style={s.riaCard} glow={insight.color}>
                        <View style={s.riaInner}>
                            <View style={[s.riaIcon, { backgroundColor: withAlpha(insight.color, 0.16) }]}>
                                <Ionicons name="sparkles" size={18} color={insight.color} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={[typography.captionMedium, s.riaName, { color: colors.text.primary }]}>Coach Ria</Text>
                                <Text style={[typography.bodySm, s.riaTxt, { color: colors.text.secondary }]}>{insight.text}</Text>
                            </View>
                        </View>
                    </GlassCard>
                </Animated.View>

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
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 1 },
    headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
    avatarTxt: { fontSize: 15, fontWeight: '800' },
    greetTxt: {},
    nameTxt: { marginTop: 1 },
    shiftBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1, maxWidth: 150 },
    shiftTxt: { fontSize: 12, fontWeight: '700' },
    iconBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },

    // Sub-header (date + momentum chip)
    subHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2, marginBottom: 20 },
    dateTxt: { flexShrink: 1 },
    momentumChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
    momentumTxt: { fontWeight: '800', letterSpacing: 0.6 },

    // Hero
    // Press wrapper owns only the outer spacing now; the GlassCard owns the
    // radius/hairline/glow and the heroInner View owns the row layout + padding.
    heroPress: { marginBottom: 16 },
    // Muscle-model art bleeds in from the right half of the hero card.
    heroArt: { position: 'absolute', top: 0, bottom: 0, right: 0, width: '62%' },
    heroInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 22, gap: 16 },
    heroLeft: { flex: 1 },
    heroTag: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, alignSelf: 'flex-start', marginBottom: 12 },
    heroTagDot: { width: 6, height: 6, borderRadius: 3 },
    heroVal: { marginBottom: 2 },
    heroSub: { marginBottom: 16 },
    heroCtaRow: { flexDirection: 'row' },
    heroCta: { alignSelf: 'flex-start', paddingHorizontal: 28 },
    heroRingWrap: { alignItems: 'center', justifyContent: 'center' },

    // Coach Ria insight card
    riaCard: { marginBottom: 20 },
    riaInner: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, padding: 14 },
    riaIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
    riaName: { fontWeight: '700' },
    riaTxt: { marginTop: 3 },

    // Bento grid (training-tall + 2×2 stat tiles)
    bentoRow: { flexDirection: 'row', gap: CARD_GAP, marginBottom: 24 },
    bentoTall: { width: MINI_W },
    bentoTallPhoto: { height: 104, width: '100%' },
    bentoTallMeta: { padding: 13 },
    bentoTallTitle: { marginTop: 1 },
    bentoCol: { flex: 1, gap: CARD_GAP, justifyContent: 'space-between' },
    bentoPairRow: { flexDirection: 'row', gap: CARD_GAP },

    // NEXT meal hero card
    upNextInner: { padding: 18, paddingTop: 14 },
    upNextSkeleton: { borderRadius: 24, borderWidth: 1, borderColor: palette.border.default, backgroundColor: withAlpha(palette.background.secondary, 0.5), marginBottom: 18, overflow: 'hidden', padding: 0 },
    mealPhotoWrap: { height: 104, width: '100%', position: 'relative', justifyContent: 'flex-end' },
    upNextTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14 },
    upNextBadge: { position: 'absolute', left: 14, bottom: 12, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
    upNextLbl: {},
    upNextTime: { fontSize: 11, fontWeight: '700' },
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

    // "Picked for your shift" carousel
    qaCarousel: { paddingRight: H_PAD, gap: CARD_GAP },
    qaCardWrap: { width: QA_CARD_W },
    qaPhoto: { height: 92, width: '100%', position: 'relative' },
    qaIcon: { position: 'absolute', top: 10, left: 10, width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
    qaMeta: { paddingHorizontal: 11, paddingVertical: 9 },
    qaLabel: { fontWeight: '700' },
    qaSub: { marginTop: 2 },

    // Exercise category cards (2×2 image grid)
    catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: CARD_GAP, marginBottom: 28 },
    catCard: { width: MINI_W, height: 110, borderRadius: 18, overflow: 'hidden', position: 'relative' },
    catBadge: { position: 'absolute', top: 10, right: 10, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
    catBadgeTxt: { color: '#fff', fontSize: 10, fontWeight: '900' },
    catLabel: { position: 'absolute', bottom: 10, left: 10, right: 10 },
    catLabelTxt: { color: '#fff', fontSize: 13, fontWeight: '800', textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },

    // Section labels
    sectionLbl: { marginBottom: 14 },
    // Mockup section headers — sentence-case white titles (e.g. "Picked for your shift").
    sectionTitle: { fontWeight: '600', flexShrink: 1 },
    rhythmTitle: { fontWeight: '600', marginBottom: 12, marginTop: 4 },

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
    // Ink "NOW" pip on the solid lime fill — max contrast, no shadow (ink-on-lime).
    nowTxt: {
        color: '#0A0C12', fontSize: 10, fontWeight: '900', letterSpacing: 0.5,
    },
});
