/**
 * Dashboard — Zeitra home screen.
 *
 * Rebuilt 1:1 from the design mockup `app_images/backups/home-preview.html`.
 * Flat dark (#0A0C12) surface, brighter design-lime (#C2F03C) accent, flat
 * opaque cards (#15181F / #252A33 hairline) — matching the mockup pixel-for-pixel
 * rather than the frosted "Aurora" theme. Sections, top→bottom:
 *   1. header (avatar + greeting + name + bell)
 *   2. shift pill ("Night shift · 3h in")
 *   3. hero slider ("Tonight's focus") + pagination dots
 *   4. next-meal card (photo + Add)
 *   5. "Picked for your shift" horizontal rail
 *   6. bento grid (lime-glow training card + Sleep / Water / Steps / Calories)
 *   7. 12-day streak card (7 day-dots)
 *   8. "Your rhythm tonight" circadian timeline (markers + gradient bar + 2 tiles)
 *   9. Coach Ria insight card
 * The Ria FAB and bottom tab bar are provided globally by (tabs)/_layout.tsx.
 *
 * Real data is wired where it exists (name, shift + elapsed, next meal, water /
 * steps / calories, streak). Slots with no backend source render an honest "—"
 * (sleep) or static design copy (hero focus, picked rail, training plan).
 */
import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
    View, Text, StyleSheet, ScrollView, RefreshControl,
    TouchableOpacity, Dimensions, Pressable,
    NativeSyntheticEvent, NativeScrollEvent,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { typography } from '@/theme';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RecipeRail } from '@/components/nutrition/RecipeRail';
import { CoachHomeCard } from '@/components/coach/CoachHomeCard';
import { MacrosHomeCard } from '@/components/coach/MacrosHomeCard';
import { ExerciseRail } from '@/components/exercise/ExerciseRail';
import { getCurrent as getCurrentShift } from '@/api/shifts';
import { getToday as getTodayPlan, PlanMeal } from '@/api/plans';
import { getToday as getTodayProgress, getStreak } from '@/api/progress';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/store/authStore';
import { getMyProfile } from '@/api/profile';
import { safeImageUri } from '@/lib/imageUrl';
import { useThemedPalette, type ThemedPalette } from '@/theme/useThemedPalette';
import { isLightHex } from '@/theme/utils';
import { usePedometerSteps } from '@/lib/pedometer';
import { TAB_BAR_H } from './_layout';

const { width: SCREEN_W } = Dimensions.get('window');
const H_PAD = 16;          // mockup body padding
const CARD_GAP = 11;       // mockup grid gap
// Fixed semantic hues for the Vitals block — heart-rate red + cycle coral, in the
// same spirit as the theme's fixed sleep-blue / water-cyan (a data category keeps
// its colour across themes). Decorative accents only; readable on dark + light.
const HEART = '#FF6B81';
const CYCLE = '#FF7A90';

// Bottom inset clearing the floating tab bar + the global Ria FAB.
const BOTTOM_CLEARANCE = TAB_BAR_H + 96;

// Hero pages (mockup's swipeable "Tonight's focus" slider). Static design copy;
// page 1 folds in the live shift countdown when a shift is active.
// Hero + picked + training cover photos — real model/workout shots (the muscle
// renders read as anatomy diagrams, not models). Cover-cropped behind a scrim.
const HERO_1 = require('../../assets/images/level-advanced.png');
const HERO_2 = require('../../assets/images/level-intermediate.png');
const HERO_3 = require('../../assets/images/level-beginner.png');
const PICK_HIIT = require('../../assets/images/level-intermediate-female.png');
const PICK_BOWLS = require('../../assets/images/meal-breakfast.png');
const PICK_MOB = require('../../assets/images/level-beginner-female.png');
const TRAINING_IMG = require('../../assets/images/profile-male.png');
const MEAL_IMG = require('../../assets/images/meal-recovery.png');
const RIA_AVATAR = require('../../assets/images/logo_app.png');

// "Picked for your shift" rail — gradient tiles with a lime glyph (no images, per
// mockup). Routes map onto existing destinations.
// Quick-start actions — real entry points into the core flows (was static
// decoration that all pointed at the same tabs). Each tile starts something.
const PICKED = [
    { id: 'coach', title: 'Your AI plan', sub: 'Tap to start', icon: 'flash' as const, img: PICK_HIIT, route: '/(challenge)' },
    { id: 'workout', title: 'Start a workout', sub: 'Pick & go', icon: 'barbell' as const, img: PICK_MOB, route: '/training/onboarding' },
    { id: 'meal', title: 'Log a meal', sub: 'Meals', icon: 'nutrition' as const, img: PICK_BOWLS, route: '/(tabs)/nutrition' },
];

// ~150deg gradient vector (top-left → bottom-right, steep) to match the mockup's
// linear-gradient(150deg, …) on the hero / glow card / picked tiles.
const HERO_GRAD_START = { x: 0.15, y: 0 };
const HERO_GRAD_END = { x: 0.85, y: 1 };

// ─── Helpers ───────────────────────────────────────────────────────────────
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
function getNextMeal(meals: PlanMeal[]): PlanMeal | null {
    if (!meals.length) return null;
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
    const sorted = [...meals].sort((a, b) => toMinutes(a.time) - toMinutes(b.time));
    return sorted.find(m => toMinutes(m.time) > nowMin) ?? sorted[0] ?? null;
}
// "in 1h 20m" style relative label to a HH:MM meal time (today, else tomorrow).
function untilLabel(time?: string): string | null {
    if (!time) return null;
    const end = parseTimeStr(time);
    if (!end) return null;
    const now = new Date();
    if (end < now) end.setDate(end.getDate() + 1);
    const min = Math.floor((end.getTime() - now.getTime()) / 60000);
    if (min <= 0) return 'now';
    const h = Math.floor(min / 60), m = min % 60;
    return h > 0 ? `in ${h}h ${m}m` : `in ${m}m`;
}
function insightText(hour: number): string {
    if (hour >= 22 || hour < 5) return 'Melatonin is rising — dim the lights and start winding down for anchor sleep. 🌙';
    if (hour >= 5 && hour < 9) return 'Cortisol is peaking — hold caffeine 90 min and get bright light to lock in your rhythm. ☀️';
    if (hour >= 14 && hour < 17) return 'Afternoon dip incoming — a protein-forward meal now keeps you sharp through the shift. 💪';
    if (hour >= 17 && hour < 22) return 'Your alertness window is closing — fuel up now so you train strong tonight. 🔥';
    return "You're deep in your shift — eat your pre-shift bowl now so you train fuelled. 💪";
}

// ─── Small primitives ────────────────────────────────────────────────────────

/** A bento stat tile: icon + label (+ optional done check), big value (+ unit),
 *  optional thin progress bar. Flat opaque card per the mockup. */
function StatTile({
    icon, label, value, unit, accent, done, progressPct, onPress, a11y,
}: {
    icon: keyof typeof Ionicons.glyphMap; label: string; value: string; unit?: string;
    accent: string; done?: boolean; progressPct?: number; onPress?: () => void; a11y?: string;
}) {
    const D = useThemedPalette();
    const st = useMemo(() => makeStyles(D), [D]);
    return (
        <TouchableOpacity
            style={st.tile} activeOpacity={onPress ? 0.85 : 1} onPress={onPress}
            disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined}
            accessibilityLabel={a11y ?? `${label}, ${value}${unit ? ' ' + unit : ''}`}
        >
            <Ionicons name={icon} size={20} color={accent} />
            {done && (
                <View style={st.doneDot}>
                    <Ionicons name="checkmark" size={13} color={D.ink} />
                </View>
            )}
            <Text style={st.tileVal} numberOfLines={1} adjustsFontSizeToFit maxFontSizeMultiplier={1.3}>
                {value}{!!unit && <Text style={st.tileUnit}>{unit}</Text>}
            </Text>
            <Text style={st.tileLbl} numberOfLines={1}>{label}</Text>
            {typeof progressPct === 'number' && (
                <View style={st.barBg}>
                    <View style={[st.barFill, { width: `${Math.max(0, Math.min(100, progressPct))}%`, backgroundColor: accent }]} />
                </View>
            )}
        </TouchableOpacity>
    );
}

/** Pagination dots — active dot is a wide lime pill. */
function Dots({ count, active }: { count: number; active: number }) {
    const D = useThemedPalette();
    const st = useMemo(() => makeStyles(D), [D]);
    return (
        <View style={st.dotsRow}>
            {Array.from({ length: count }).map((_, i) => (
                <View key={i} style={i === active ? st.dotActive : st.dot} />
            ))}
        </View>
    );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function DashboardScreen() {
    const D = useThemedPalette();
    const st = useMemo(() => makeStyles(D), [D]);
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const qc = useQueryClient();
    const { user } = useAuthStore();
    const [refreshing, setRefreshing] = useState(false);
    const [heroIdx, setHeroIdx] = useState(0);

    // ── Queries (each section degrades on its own; no whole-screen block) ──
    const { data: shift } = useQuery({ queryKey: ['current-shift'], queryFn: getCurrentShift, retry: 1 });
    const { data: progress } = useQuery({ queryKey: ['today-progress'], queryFn: getTodayProgress, retry: 1 });
    const { data: plan } = useQuery({ queryKey: ['today-plan'], queryFn: getTodayPlan, retry: 1 });
    const { data: streak } = useQuery({ queryKey: ['streak'], queryFn: getStreak, retry: 1 });
    // Shared cache key with the Profile screen + post-detail, so the freshest
    // avatar shows on Home with no extra fetch.
    const { data: profile } = useQuery({ queryKey: ['my-profile'], queryFn: getMyProfile, retry: 1 });

    // Phone pedometer — the "no wearable" step source. Best-effort + honest: on
    // Expo Go / an unavailable sensor it yields { steps:0, available:false } and
    // never throws. Used ONLY as a fallback below when health-sync has no steps.
    const { steps: phoneSteps, available: pedometerAvailable } = usePedometerSteps();

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        // Scope to this screen's queries (not the whole app cache).
        await Promise.all(
            ['current-shift', 'today-progress', 'today-plan', 'streak']
                .map((k) => qc.invalidateQueries({ queryKey: [k] })),
        );
        setRefreshing(false);
    }, [qc]);

    // ── Derived ──
    const greeting = useMemo(() => {
        const h = new Date().getHours();
        return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
    }, []);
    const displayName = (profile as any)?.displayName ?? (user as any)?.displayName ?? user?.name ?? 'User';
    const firstName = useMemo(() => String(displayName).split(' ')[0] || displayName, [displayName]);
    const initial = useMemo(() => String(displayName).trim().charAt(0).toUpperCase() || 'Z', [displayName]);
    // The user's real avatar (https-trust-gated); falls back to the initial disc
    // when null/non-https. Mirrors the Profile screen's avatar pattern.
    const avatarUrl = safeImageUri((profile as any)?.avatarUrl ?? (user as any)?.avatarUrl ?? undefined);
    // Female users get the Cycle tile in the Vitals block; everyone else gets Body.
    const isFemale = ((profile as any)?.biologicalSex ?? '').toString().toUpperCase() === 'FEMALE';

    const shiftElapsed = useMemo(() => {
        const start = shift?.startTime ? parseTimeStr(shift.startTime) : null;
        if (!start) return null;
        const now = new Date();
        if (start > now) return null;
        const min = Math.floor((now.getTime() - start.getTime()) / 60000);
        return min < 60 ? `${min}m in` : `${Math.floor(min / 60)}h in`;
    }, [shift]);

    // Title-cased shift label ("night" → "Night shift") to match the mockup copy.
    const shiftLabel = useMemo(() => {
        if (!shift?.type) return null;
        const t = String(shift.type).trim().toLowerCase();
        const cap = t.charAt(0).toUpperCase() + t.slice(1);
        return /shift/i.test(cap) ? cap : `${cap} shift`;
    }, [shift]);

    const nextMeal = useMemo(() => (plan?.meals ? getNextMeal(plan.meals) : null), [plan]);
    const mealMeta = useMemo(() => {
        if (!nextMeal) return null;
        const kcal = nextMeal.macros?.calories ? `${Math.round(nextMeal.macros.calories)} kcal` : null;
        const until = untilLabel(nextMeal.time);
        return [kcal, until].filter(Boolean).join(' · ');
    }, [nextMeal]);

    // Stats from existing progress fields.
    const hydMl = progress ? (progress.hydrationActual || (progress as any).hydrationMl || 0) : 0;
    const hydL = (hydMl / 1000).toFixed(1);
    const hydPct = Math.min((hydMl / 2500) * 100, 100);
    const kcal = progress ? String(Math.round(progress.caloriesActual || 0)) : '0';
    // Steps: health sync (wearable / phone health app) is PRIMARY; when it has
    // nothing (no device synced yet), fall back to the on-device pedometer so a
    // user with no wearable still sees a live count. Label/behaviour unchanged —
    // this only swaps the number's SOURCE when the primary is absent/zero.
    const healthSteps = progress?.stepCount ?? 0;
    const stepCount = healthSteps > 0 ? healthSteps : (pedometerAvailable ? phoneSteps : 0);
    const steps = stepCount >= 1000 ? (stepCount / 1000).toFixed(1) + 'k' : String(stepCount);
    const stepGoal = ((progress as any)?.stepGoal) ?? 10000;
    const stepsDone = stepCount >= stepGoal;
    // Sleep has no backend field today → honest "—" (tile keeps its shape).
    const sleepH = useMemo(() => {
        const p = progress as any;
        const hrs = p?.sleepHours ?? p?.sleepActual
            ?? (typeof p?.sleepMinutes === 'number' ? p.sleepMinutes / 60 : undefined);
        if (typeof hrs !== 'number' || hrs <= 0) return null;
        const h = Math.floor(hrs); const m = Math.round((hrs - h) * 60);
        return { h, m };
    }, [progress]);
    const sleepDone = !!sleepH && sleepH.h >= 7;

    const streakDays = streak?.current ?? 0;
    const filledDots = Math.max(0, Math.min(7, streakDays));

    const insight = useMemo(() => insightText(new Date().getHours()), []);

    // Hero pages — page 1 mirrors the mockup copy exactly; the swipeable pages 2/3
    // extend the rail (the mockup shows 3 dots → a 3-page carousel).
    const heroPages = useMemo(() => [
        { id: 'focus', badge: "Tonight's focus", title: 'Upper body strength', meta: '4 exercises · chest & arms · 45 min', img: HERO_1 },
        { id: 'shoulders', badge: 'Strength', title: 'Shoulders & delts', meta: '6 exercises · delts · 35 min', img: HERO_2 },
        { id: 'arms', badge: 'Hypertrophy', title: 'Arms & grip', meta: '7 exercises · arms · 30 min', img: HERO_3 },
    ], []);

    const onHeroScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
        const i = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
        if (i !== heroIdx) setHeroIdx(i);
    }, [heroIdx]);

    // Gentle hero auto-advance (~4.5s); pauses on drag, resumes after the swipe.
    const heroRef = useRef<ScrollView>(null);
    const heroPausedRef = useRef(false);
    useEffect(() => {
        if (heroPages.length <= 1) return;
        const id = setInterval(() => {
            if (heroPausedRef.current) return;
            setHeroIdx((prev) => {
                const next = (prev + 1) % heroPages.length;
                heroRef.current?.scrollTo({ x: next * SCREEN_W, animated: true });
                return next;
            });
        }, 4500);
        return () => clearInterval(id);
    }, [heroPages.length]);

    return (
        <View style={[st.root, { backgroundColor: D.bg }]}>
            <StatusBar style="light" />
            <ScrollView
                contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: BOTTOM_CLEARANCE }}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={D.lime} />}
                showsVerticalScrollIndicator={false}
            >
                {/* ══ HEADER ══════════════════════════════════════════════════ */}
                <Animated.View entering={FadeInDown.duration(420)}>
                    <View style={st.header}>
                        <TouchableOpacity
                            style={st.headerLeft} activeOpacity={0.8}
                            onPress={() => router.push('/(tabs)/profile' as any)}
                            accessibilityRole="button" accessibilityLabel="Profile"
                        >
                            <View style={st.avatar}>
                                {avatarUrl ? (
                                    <Image source={{ uri: avatarUrl }} style={st.avatarImg} contentFit="cover" cachePolicy="memory-disk" transition={200} accessibilityLabel={`${firstName} photo`} />
                                ) : (
                                    <Text style={st.avatarTxt}>{initial}</Text>
                                )}
                            </View>
                            <View style={{ flexShrink: 1 }}>
                                <Text style={st.greet}>{greeting}</Text>
                                <Text style={st.name} numberOfLines={1}>{firstName}</Text>
                            </View>
                        </TouchableOpacity>
                        <TouchableOpacity
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} activeOpacity={0.75}
                            onPress={() => router.push('/(settings)/notifications' as any)}
                            accessibilityRole="button" accessibilityLabel="Notifications, new"
                        >
                            <Ionicons name="notifications" size={23} color={D.text} />
                            <View style={st.bellDot} />
                        </TouchableOpacity>
                    </View>

                    {/* Shift pill */}
                    {shift && (
                        <View style={st.shiftRow}>
                            <View style={st.shiftPill}>
                                <Ionicons name="moon" size={15} color={D.lime} />
                                <Text style={st.shiftTxt} numberOfLines={1}>
                                    {shiftLabel ?? shift.type}{shiftElapsed ? ` · ${shiftElapsed}` : ''}
                                </Text>
                            </View>
                        </View>
                    )}
                </Animated.View>

                {/* ══ TONIGHT'S FOCUS — hero slider + dots ════════════════════ */}
                <Animated.View entering={FadeInDown.delay(80).duration(440)}>
                    <ScrollView
                        ref={heroRef}
                        horizontal pagingEnabled showsHorizontalScrollIndicator={false}
                        scrollEventThrottle={16}
                        onScrollBeginDrag={() => { heroPausedRef.current = true; }}
                        onMomentumScrollEnd={(e) => { onHeroScroll(e); heroPausedRef.current = false; }}
                        onScrollEndDrag={onHeroScroll}
                        style={st.heroPager}
                    >
                        {heroPages.map((p) => (
                            <View key={p.id} style={st.heroPage}>
                                <TouchableOpacity
                                    activeOpacity={0.9}
                                    onPress={() => router.push('/(tabs)/training' as any)}
                                    accessibilityRole="button" accessibilityLabel={`${p.title}. ${p.meta}`}
                                >
                                    <View style={st.hero}>
                                        <Image source={p.img} style={StyleSheet.absoluteFillObject} contentFit="cover" cachePolicy="memory-disk" transition={200} />
                                        <LinearGradient colors={['rgba(10,12,18,0.15)', 'rgba(10,12,18,0.55)', 'rgba(10,12,18,0.96)']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFillObject} />
                                        <View style={st.heroContent}>
                                            <View style={st.heroBadge}><Text style={st.heroBadgeTxt}>{p.badge}</Text></View>
                                            <Text style={st.heroTitle}>{p.title}</Text>
                                            <Text style={st.heroMeta}>{p.meta}</Text>
                                        </View>
                                    </View>
                                </TouchableOpacity>
                            </View>
                        ))}
                    </ScrollView>
                    <Dots count={heroPages.length} active={heroIdx} />
                </Animated.View>

                {/* ══ AI COACH — dedicated section (Ria's gated challenge) ════ */}
                <Animated.View entering={FadeInDown.delay(100).duration(440)} style={{ paddingHorizontal: 14, marginTop: 14 }}>
                    <CoachHomeCard />
                </Animated.View>

                {/* ══ EXERCISES TO TRY — image cards → tap for how-to ═════════ */}
                <ExerciseRail title="Exercises to try" bodyPart="chest" />

                {/* ══ FRESH RECIPES RAIL ══════════════════════════════════════ */}
                <RecipeRail title="Fresh recipes" />

                {/* ══ NEXT · PRE-SHIFT MEAL ═══════════════════════════════════ */}
                {nextMeal && (
                    <Animated.View entering={FadeInDown.delay(120).duration(440)} style={[st.section, { marginTop: 10, paddingHorizontal: 14 }]}>
                        <View style={st.mealCard}>
                            <View style={st.mealPhoto}>
                                <Image source={MEAL_IMG} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" transition={200} />
                            </View>
                            <View style={st.mealRow}>
                                <View style={{ flex: 1 }}>
                                    <Text style={st.mealEyebrow}>Next · pre-shift meal</Text>
                                    <Text style={st.mealName} numberOfLines={1}>{nextMeal.label}</Text>
                                    {!!mealMeta && <Text style={st.mealMeta}>{mealMeta}</Text>}
                                </View>
                                <TouchableOpacity
                                    style={st.addPill} activeOpacity={0.85}
                                    onPress={() => router.push('/(tabs)/nutrition' as any)}
                                    accessibilityRole="button" accessibilityLabel={`Add ${nextMeal.label}`}
                                >
                                    <Text style={st.addPillTxt}>Add</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </Animated.View>
                )}

                {/* ══ PICKED FOR YOUR SHIFT ═══════════════════════════════════ */}
                <View style={[st.sectionRow, st.pickedHead]}>
                    <Text style={st.sectionTitle}>Quick start</Text>
                    <Ionicons name="chevron-forward" size={18} color={D.muted} />
                </View>
                <Animated.View entering={FadeInDown.delay(160).duration(460)}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.pickedRail}>
                        {PICKED.map((c) => (
                            <TouchableOpacity
                                key={c.id} style={st.pickedCard} activeOpacity={0.85}
                                onPress={() => router.push(c.route as any)}
                                accessibilityRole="button" accessibilityLabel={`${c.title}, ${c.sub}`}
                            >
                                <View style={st.pickedThumb}>
                                    <Image source={c.img} style={StyleSheet.absoluteFillObject} contentFit="cover" cachePolicy="memory-disk" transition={200} />
                                    <LinearGradient colors={['transparent', 'rgba(10,12,18,0.88)']} style={StyleSheet.absoluteFillObject} />
                                    <Ionicons name={c.icon} size={20} color={D.lime} style={st.pickedIcon} />
                                </View>
                                <Text style={st.pickedTitle} numberOfLines={1}>{c.title}</Text>
                                <Text style={st.pickedSub} numberOfLines={1}>{c.sub}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </Animated.View>

                {/* ══ TODAY'S MACROS ══════════════════════════════════════════ */}
                <Animated.View entering={FadeInDown.delay(170).duration(460)} style={{ paddingHorizontal: 14, marginTop: 16 }}>
                    <MacrosHomeCard />
                </Animated.View>

                {/* ══ BENTO GRID ══════════════════════════════════════════════ */}
                <Animated.View entering={FadeInDown.delay(180).duration(460)} style={[st.section, { marginTop: 18 }]}>
                    <View style={st.bentoTop}>
                        {/* Tall lime-glow training card */}
                        <TouchableOpacity
                            style={st.glowCardWrap} activeOpacity={0.9}
                            onPress={() => router.push('/(tabs)/training' as any)}
                            accessibilityRole="button" accessibilityLabel="Tonight's training, start workout"
                        >
                            <View style={st.glowCard}>
                                <Image source={TRAINING_IMG} style={[StyleSheet.absoluteFillObject, { borderRadius: 13 }]} contentFit="cover" contentPosition="top" cachePolicy="memory-disk" transition={200} />
                                <LinearGradient colors={['rgba(10,12,18,0.45)', 'rgba(10,12,18,0.9)']} style={[StyleSheet.absoluteFillObject, { borderRadius: 13 }]} />
                                <View>
                                    <Ionicons name="barbell" size={24} color={D.lime} />
                                    <Text style={st.glowTitle}>Tonight's training</Text>
                                    <Text style={st.glowSub}>Push day · 45 min</Text>
                                </View>
                                <View style={st.glowBtn}><Text style={st.glowBtnTxt}>Start workout</Text></View>
                            </View>
                        </TouchableOpacity>

                        {/* Right column: Sleep + Water */}
                        <View style={st.bentoCol}>
                            <StatTile
                                icon="moon" label="Sleep" accent={D.blue}
                                value={sleepH ? `${sleepH.h}h ${sleepH.m}m` : '—'} done={sleepDone}
                                onPress={() => router.push('/(shifts)/sleep-optimizer' as any)}
                                a11y={sleepH ? `Sleep, ${sleepH.h} hours ${sleepH.m} minutes` : 'Sleep, not logged'}
                            />
                            <StatTile
                                icon="water" label="Water" accent={D.cyan}
                                value={hydL} unit="L" progressPct={hydPct}
                                onPress={() => router.push('/(performance)/hydration' as any)}
                                a11y={`Water, ${hydL} of 2.5 litres`}
                            />
                        </View>
                    </View>
                    {/* Bottom row: Steps + Calories */}
                    <View style={st.bentoBottom}>
                        <StatTile
                            icon="walk" label="Steps" accent={D.lime} value={steps} done={stepsDone}
                            onPress={() => router.push('/(performance)' as any)} a11y={`Steps, ${steps} today`}
                        />
                        <StatTile
                            icon="flame" label="Calories" accent={D.lime} value={kcal}
                            onPress={() => router.push('/(tabs)/nutrition' as any)} a11y={`Calories, ${kcal} today`}
                        />
                    </View>
                </Animated.View>

                {/* ══ VITALS — heart rate (camera + live) & body tracking ═══════ */}
                <Animated.View entering={FadeInDown.delay(190).duration(460)} style={[st.section, { marginTop: 22 }]}>
                    <View style={[st.sectionRow, { marginBottom: 11 }]}>
                        <Text style={st.sectionTitle}>Vitals</Text>
                        <TouchableOpacity
                            style={st.vSeeAll} activeOpacity={0.7} hitSlop={8}
                            onPress={() => router.push('/(performance)' as any)}
                            accessibilityRole="button" accessibilityLabel="View all vitals"
                        >
                            <Text style={st.vSeeAllTxt}>View all</Text>
                            <Ionicons name="chevron-forward" size={14} color={D.muted} />
                        </TouchableOpacity>
                    </View>

                    {/* Camera heart-rate — the hero action: one tap, no wearable needed */}
                    <TouchableOpacity
                        style={st.hrHero} activeOpacity={0.9}
                        onPress={() => router.push('/(performance)/heart-rate-measure' as any)}
                        accessibilityRole="button"
                        accessibilityLabel="Measure your heart rate with the camera. No device needed."
                    >
                        <View style={st.hrHeroIcon}>
                            <Ionicons name="heart" size={24} color={HEART} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <View style={st.hrHeroTitleRow}>
                                <Text style={st.hrHeroTitle}>Measure heart rate</Text>
                                <View style={st.hrHeroBadge}>
                                    <Text style={st.hrHeroBadgeTxt}>No device</Text>
                                </View>
                            </View>
                            <Text style={st.hrHeroSub}>Finger on the camera + flash · ~30s</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={20} color={D.muted} />
                    </TouchableOpacity>

                    {/* Quick vitals tiles */}
                    <View style={st.vRow}>
                        <TouchableOpacity
                            style={st.vTile} activeOpacity={0.85}
                            onPress={() => router.push('/(performance)/heart-rate' as any)}
                            accessibilityRole="button" accessibilityLabel="Heart rate. Live monitor, zones and history."
                        >
                            <Ionicons name="pulse" size={20} color={HEART} />
                            <Text style={st.vTileVal}>Heart rate</Text>
                            <Text style={st.vTileLbl}>Live · zones · history</Text>
                        </TouchableOpacity>

                        {isFemale ? (
                            <TouchableOpacity
                                style={st.vTile} activeOpacity={0.85}
                                onPress={() => router.push('/(performance)/cycle' as any)}
                                accessibilityRole="button" accessibilityLabel="Cycle. Phase and predictions."
                            >
                                <Ionicons name="flower" size={20} color={CYCLE} />
                                <Text style={st.vTileVal}>Cycle</Text>
                                <Text style={st.vTileLbl}>Phase · predictions</Text>
                            </TouchableOpacity>
                        ) : (
                            <TouchableOpacity
                                style={st.vTile} activeOpacity={0.85}
                                onPress={() => router.push('/(performance)/body-metrics' as any)}
                                accessibilityRole="button" accessibilityLabel="Body metrics. Weight and measurements."
                            >
                                <Ionicons name="body" size={20} color={D.lime} />
                                <Text style={st.vTileVal}>Body</Text>
                                <Text style={st.vTileLbl}>Weight · measurements</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </Animated.View>

                {/* ══ STREAK ══════════════════════════════════════════════════ */}
                <Animated.View entering={FadeInDown.delay(200).duration(460)} style={[st.section, { marginTop: 18 }]}>
                    <View style={st.streakCard}>
                        <View style={st.streakLeft}>
                            <Ionicons name="flame" size={26} color={D.lime} />
                            <View>
                                <Text style={st.streakNum}>{streakDays}-day streak</Text>
                                <Text style={st.streakSub}>{streakDays > 0 ? 'Keep it rolling' : 'Start one today'}</Text>
                            </View>
                        </View>
                        <View style={st.streakDots}>
                            {Array.from({ length: 7 }).map((_, i) => (
                                <View key={i} style={[st.streakDot, { backgroundColor: i < filledDots ? D.lime : D.streakOff }]} />
                            ))}
                        </View>
                    </View>
                </Animated.View>

                {/* ══ YOUR RHYTHM TONIGHT ═════════════════════════════════════ */}
                <Text style={st.rhythmTitle}>Your rhythm tonight</Text>
                <Animated.View entering={FadeInDown.delay(220).duration(460)} style={[st.section, { marginTop: 0 }]}>
                    <View style={st.rhythmCard}>
                        <View style={st.rhythmMarks}>
                            <Text style={st.rhythmMark}>21:00</Text>
                            <Text style={[st.rhythmMark, { color: D.lime }]}>NOW</Text>
                            <Text style={st.rhythmMark}>02:00</Text>
                            <Text style={st.rhythmMark}>08:00</Text>
                        </View>
                        <LinearGradient
                            colors={[D.lime, D.blue, D.border, D.border]}
                            locations={[0, 0.52, 0.52, 1]}
                            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                            style={st.rhythmBar}
                        />
                        <View style={st.rhythmTiles}>
                            <View style={st.rhythmTile}>
                                <Ionicons name="cafe" size={18} color={D.lime} />
                                <Text style={st.rhythmTileLbl}>Caffeine cutoff</Text>
                                <Text style={st.rhythmTileSub}>by 02:00</Text>
                            </View>
                            <View style={st.rhythmTile}>
                                <Ionicons name="moon" size={18} color={D.blue} />
                                <Text style={st.rhythmTileLbl}>Wind-down</Text>
                                <Text style={st.rhythmTileSub}>07:30</Text>
                            </View>
                        </View>
                    </View>
                </Animated.View>

                {/* ══ COACH RIA ═══════════════════════════════════════════════ */}
                <Animated.View entering={FadeInDown.delay(240).duration(460)} style={st.section}>
                    <Pressable
                        style={st.riaCard}
                        onPress={() => router.push('/(modals)/ai-coach' as any)}
                        accessibilityRole="button" accessibilityLabel="Open Coach Ria"
                    >
                        <View style={st.riaAvatarRing}>
                            <Image source={RIA_AVATAR} style={st.riaAvatar} contentFit="cover" cachePolicy="memory-disk" transition={200} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <View style={st.riaNameRow}>
                                <Ionicons name="sparkles" size={14} color={D.lime} />
                                <Text style={st.riaName}>Coach Ria</Text>
                            </View>
                            <Text style={st.riaTxt}>{insight}</Text>
                        </View>
                    </Pressable>
                </Animated.View>
            </ScrollView>
        </View>
    );
}

// ─── Styles (Saira via typography bases; sizes/weights match the mockup) ──────
const makeStyles = (D: ThemedPalette) => StyleSheet.create({
    root: { flex: 1 },

    // Header
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18, paddingTop: 12, paddingBottom: 4 },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 11, flexShrink: 1 },
    avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: D.avBg, borderWidth: 1.5, borderColor: D.avBd, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    avatarImg: { width: '100%', height: '100%', borderRadius: 21 },
    avatarTxt: [typography.subtitle, { color: D.lime, fontSize: 18 }] as any,
    greet: [typography.caption, { color: D.muted, fontSize: 12 }] as any,
    name: [typography.subtitle, { color: D.text, fontSize: 17, marginTop: 1 }] as any,
    bellDot: { position: 'absolute', top: -1, right: -1, width: 8, height: 8, borderRadius: 4, backgroundColor: D.lime, borderWidth: 1.5, borderColor: D.bg },

    // Shift pill
    shiftRow: { paddingHorizontal: H_PAD, paddingTop: 4, alignItems: 'flex-start' },
    shiftPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: D.card, borderWidth: 1, borderColor: '#2A2F3A', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
    shiftTxt: [typography.captionMedium, { color: D.text, fontSize: 12 }] as any,

    // Hero slider
    heroPager: { marginTop: 14 },
    heroPage: { width: SCREEN_W, paddingHorizontal: H_PAD },
    hero: { height: 152, borderRadius: 18, overflow: 'hidden', justifyContent: 'flex-end' },
    heroImg: { position: 'absolute', right: -14, bottom: 0, height: 170, width: 170 },
    heroContent: { padding: 16 },
    heroBadge: { alignSelf: 'flex-start', backgroundColor: D.lime, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 8 },
    heroBadgeTxt: [typography.subtitle, { color: D.ink, fontSize: 10, letterSpacing: 0.3 }] as any,
    heroTitle: [typography.h3, { color: '#fff', fontSize: 21, marginTop: 9 }] as any,
    heroMeta: [typography.caption, { color: D.sub, fontSize: 13, marginTop: 1 }] as any,
    dotsRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, paddingTop: 10 },
    dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: D.dotOff },
    dotActive: { width: 18, height: 6, borderRadius: 3, backgroundColor: D.lime },

    // Generic section wrapper (h-padding + top gap)
    section: { paddingHorizontal: H_PAD, marginTop: 14 },
    sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    sectionTitle: [typography.subtitle, { color: D.text, fontSize: 16, flexShrink: 1 }] as any,

    // Next meal
    mealCard: { backgroundColor: D.card, borderWidth: 1, borderColor: D.border, borderRadius: 16, overflow: 'hidden' },
    mealPhoto: { height: 104, width: '100%' },
    mealRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 13, paddingVertical: 10 },
    mealEyebrow: [typography.caption, { color: D.muted, fontSize: 11 }] as any,
    mealName: [typography.bodyMedium, { color: D.text, fontSize: 15, marginTop: 2 }] as any,
    mealMeta: [typography.caption, { color: D.muted, fontSize: 11, marginTop: 3 }] as any,
    addPill: { backgroundColor: D.tile, paddingHorizontal: 13, paddingVertical: 7, borderRadius: 10 },
    addPillTxt: [typography.captionMedium, { color: D.lime, fontSize: 12 }] as any,

    // Picked rail
    pickedHead: { paddingHorizontal: 18, marginTop: 18, marginBottom: 10 },
    pickedRail: { paddingLeft: 14, paddingRight: 14, gap: 11 },
    pickedCard: { width: 128 },
    pickedThumb: { height: 90, borderRadius: 14, overflow: 'hidden' },
    pickedIcon: { position: 'absolute', bottom: 8, left: 10 },
    pickedTitle: [typography.bodyMedium, { color: D.text, fontSize: 13, marginTop: 7 }] as any,
    pickedSub: [typography.caption, { color: D.muted, fontSize: 11 }] as any,

    // Bento
    bentoTop: { flexDirection: 'row', gap: CARD_GAP },
    glowCardWrap: { flex: 1 },
    // The lime glow halo reads premium on dark themes but smears the near-white
    // surface on light variants, so drop it (shadow + Android elevation) there.
    glowCard: { flex: 1, borderRadius: 15, borderWidth: 1.5, borderColor: D.lime, padding: 13, justifyContent: 'space-between', ...(isLightHex(D.bg) ? {} : { shadowColor: D.lime, shadowOpacity: 0.27, shadowRadius: 14, shadowOffset: { width: 0, height: 0 }, elevation: 6 }) },
    glowTitle: [typography.bodyMedium, { color: '#fff', fontSize: 16, marginTop: 8 }] as any,
    glowSub: [typography.caption, { color: D.sub, fontSize: 12, marginTop: 2 }] as any,
    glowBtn: { backgroundColor: D.lime, paddingVertical: 8, borderRadius: 10, alignItems: 'center', marginTop: 14 },
    glowBtnTxt: [typography.subtitle, { color: D.ink, fontSize: 13 }] as any,
    bentoCol: { flex: 1, gap: CARD_GAP },
    bentoBottom: { flexDirection: 'row', gap: CARD_GAP, marginTop: CARD_GAP },

    // Stat tile
    tile: { flex: 1, backgroundColor: D.card, borderWidth: 1, borderColor: D.border, borderRadius: 16, padding: 13, minHeight: 84, position: 'relative' },
    doneDot: { position: 'absolute', top: 9, right: 9, width: 20, height: 20, borderRadius: 10, backgroundColor: D.lime, alignItems: 'center', justifyContent: 'center' },
    tileVal: [typography.subtitle, { color: D.text, fontSize: 18, marginTop: 6 }] as any,
    tileUnit: [typography.caption, { color: D.muted, fontSize: 12 }] as any,
    tileLbl: [typography.caption, { color: D.muted, fontSize: 11 }] as any,
    barBg: { height: 4, borderRadius: 3, backgroundColor: D.border, marginTop: 7, overflow: 'hidden' },
    barFill: { height: '100%', borderRadius: 3 },

    // Vitals section — dedicated heart-rate + tracking block
    vSeeAll: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    vSeeAllTxt: [typography.caption, { color: D.muted, fontSize: 12 }] as any,
    // Camera-HR hero: red-tinted border + icon disc for prominence, on the theme card
    hrHero: { backgroundColor: D.card, borderWidth: 1, borderColor: 'rgba(255,107,129,0.34)', borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 13 },
    hrHeroIcon: { width: 46, height: 46, borderRadius: 14, backgroundColor: 'rgba(255,107,129,0.14)', alignItems: 'center', justifyContent: 'center' },
    hrHeroTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    hrHeroTitle: [typography.subtitle, { color: D.text, fontSize: 16 }] as any,
    hrHeroBadge: { backgroundColor: 'rgba(255,107,129,0.16)', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 7 },
    hrHeroBadgeTxt: [typography.captionMedium, { color: HEART, fontSize: 10 }] as any,
    hrHeroSub: [typography.caption, { color: D.muted, fontSize: 12, marginTop: 2 }] as any,
    vRow: { flexDirection: 'row', gap: CARD_GAP, marginTop: CARD_GAP },
    vTile: { flex: 1, backgroundColor: D.card, borderWidth: 1, borderColor: D.border, borderRadius: 16, padding: 13, minHeight: 84 },
    vTileVal: [typography.subtitle, { color: D.text, fontSize: 15, marginTop: 8 }] as any,
    vTileLbl: [typography.caption, { color: D.muted, fontSize: 11, marginTop: 2 }] as any,

    // Streak
    streakCard: { backgroundColor: D.card, borderWidth: 1, borderColor: D.border, borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    streakLeft: { flexDirection: 'row', alignItems: 'center', gap: 11, flexShrink: 1 },
    streakNum: [typography.subtitle, { color: D.text, fontSize: 17 }] as any,
    streakSub: [typography.caption, { color: D.muted, fontSize: 12 }] as any,
    streakDots: { flexDirection: 'row', gap: 5 },
    streakDot: { width: 8, height: 8, borderRadius: 4 },

    // Rhythm timeline
    rhythmTitle: [typography.subtitle, { color: D.text, fontSize: 16, paddingHorizontal: 18, paddingTop: 20, paddingBottom: 10 }] as any,
    rhythmCard: { backgroundColor: D.card, borderWidth: 1, borderColor: D.border, borderRadius: 16, padding: 15 },
    rhythmMarks: { flexDirection: 'row', justifyContent: 'space-between' },
    rhythmMark: [typography.caption, { color: D.muted, fontSize: 11 }] as any,
    rhythmBar: { height: 7, borderRadius: 4, marginTop: 9 },
    rhythmTiles: { flexDirection: 'row', gap: 9, marginTop: 13 },
    rhythmTile: { flex: 1, backgroundColor: D.tile, borderRadius: 11, padding: 10 },
    rhythmTileLbl: [typography.captionMedium, { color: D.text, fontSize: 12, marginTop: 4 }] as any,
    rhythmTileSub: [typography.caption, { color: D.muted, fontSize: 11 }] as any,

    // Coach Ria
    riaCard: { flexDirection: 'row', gap: 12, backgroundColor: D.riaBg, borderWidth: 1, borderColor: D.riaBd, borderRadius: 16, padding: 14 },
    riaAvatarRing: { width: 38, height: 38, borderRadius: 19, borderWidth: 1.5, borderColor: D.avBd, overflow: 'hidden' },
    riaAvatar: { width: '100%', height: '100%' },
    riaNameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    riaName: [typography.captionMedium, { color: D.lime, fontSize: 12 }] as any,
    riaTxt: [typography.caption, { color: '#DFE3EA', fontSize: 12.5, lineHeight: 19, marginTop: 4 }] as any,
});
