/**
 * Dashboard — NightFuel home screen.
 * Redesigned: shift countdown hero · circadian insight · UP NEXT meal ·
 *             sleep + hydration mini cards · quick actions · 24h timeline.
 */
import React, { useState, useMemo, useCallback } from 'react';
import {
    View, Text, StyleSheet, ScrollView, RefreshControl,
    TouchableOpacity, Dimensions, ActivityIndicator, Image, ImageBackground
} from 'react-native';
import { SafeBlurView } from '@/components/SafeBlurView';
import { useTheme } from '@/theme';
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

const { width } = Dimensions.get('window');
const H_PAD = 20;
const CARD_GAP = 12;
const MINI_W = (width - H_PAD * 2 - CARD_GAP) / 2;

// ─── Static data ─────────────────────────────────────────────────────────────

const QUICK_ACTIONS = [
    { id: 'meal', label: 'Log Meal', icon: 'restaurant', color: '#00D4AA', image: 'https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=400&q=80', route: '/(tabs)/nutrition' },
    { id: 'workout', label: 'Log Workout', icon: 'flame', color: '#FF4444', image: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=400&q=80', route: '/(tabs)/training' },
    { id: 'sleep', label: 'Log Sleep', icon: 'moon', color: '#7C4DFF', image: 'https://images.unsplash.com/photo-1541781774459-bb2af2f05b55?w=400&q=80', route: '/(modals)/log-sleep' },
    { id: 'stats', label: 'Progress', icon: 'stats-chart', color: '#4FC3F7', image: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=400&q=80', route: '/(performance)' },
] as const;

// Exercise categories shown as image cards
const EXERCISE_CATEGORY_META = [
    {
        id: 'gym',
        label: 'Gym Workout',
        fallbackCount: '500+',
        image: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400&q=80',
        accent: '#FF6B35',
        filter: 'gym',
    },
    {
        id: 'home',
        label: 'Home Workout',
        fallbackCount: '200+',
        image: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400&q=80',
        accent: '#00D4AA',
        filter: 'home',
    },
    {
        id: 'cardio',
        label: 'Cardio',
        fallbackCount: '80+',
        image: 'https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?w=400&q=80',
        accent: '#4FC3F7',
        filter: 'cardio',
    },
    {
        id: 'kegel',
        label: 'Kegel / Pelvic',
        fallbackCount: '5',
        image: 'https://images.unsplash.com/photo-1506629082955-511b1aa562c8?w=400&q=80',
        accent: '#7C4DFF',
        filter: 'kegel',
    },
] as const;

// More Features shown as image cards on Home
const MORE_FEATURES = [
    { id: 'shifts', label: 'Shifts', image: 'https://images.unsplash.com/photo-1506784365847-bbad939e9335?w=400&q=80', accent: '#FFB300', route: '/(shifts)' },
    { id: 'sleep', label: 'Sleep Tracker', image: 'https://images.unsplash.com/photo-1541781774459-bb2af2f05b55?w=400&q=80', accent: '#7C4DFF', route: '/(modals)/log-sleep' },
    { id: 'community', label: 'Community', image: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=400&q=80', accent: '#4FC3F7', route: '/(community)' },
    { id: 'coaches', label: 'Coaches', image: 'https://images.unsplash.com/photo-1526506114866-2679df30dc0c?w=400&q=80', accent: '#FF6B35', route: '/coaches/browse' },
    { id: 'circadian', label: 'Circadian', image: 'https://images.unsplash.com/photo-1621508643809-b69a941ea13e?w=400&q=80', accent: '#B47CFF', route: '/(tabs)/circadian' },
    { id: 'settings', label: 'Settings', image: 'https://images.unsplash.com/photo-1555448248-2571daf6344b?w=400&q=80', accent: '#8B949E', route: '/(settings)' },
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
    if (hour >= 22 || hour < 5) return { icon: 'moon' as const, text: 'Melatonin rising. Wind down screens.', color: '#7C4DFF' };
    if (hour >= 5 && hour < 9) return { icon: 'sunny' as const, text: 'Cortisol peak. Delay caffeine 90 min.', color: '#FFB300' };
    if (hour >= 14 && hour < 17) return { icon: 'water' as const, text: 'Cortisol dip. Ideal time for protein.', color: '#00D4AA' };
    if (hour >= 17 && hour < 22) return { icon: 'flash' as const, text: 'Alertness window closing. Fuel up now.', color: '#FF6B35' };
    return { icon: 'pulse' as const, text: 'Optimal alertness window. Stay fuelled.', color: '#4FC3F7' };
}

// ─── MacroPill ────────────────────────────────────────────────────────────────

function MacroPill({ label, value, color }: { label: string; value: string; color: string }) {
    const { colors } = useTheme();
    return (
        <View style={[mp.pill, { backgroundColor: withAlpha(color, 0.10) }]}>
            <Text style={[mp.val, { color }]}>{value}</Text>
            <Text style={[mp.lbl, { color: colors.text.tertiary }]}>{label}</Text>
        </View>
    );
}
const mp = StyleSheet.create({
    pill: { alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, marginRight: 8 },
    val: { fontSize: 15, fontWeight: '800' },
    lbl: { fontSize: 11, fontWeight: '500', marginTop: 2 },
});

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function DashboardScreen() {
    const { colors } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const qc = useQueryClient();
    const { user } = useAuthStore();
    const [refreshing, setRefreshing] = useState(false);

    // ── Queries ──
    const { data: shift, isLoading: shiftLoading } = useQuery({ queryKey: ['current-shift'], queryFn: getCurrentShift, retry: 1 });
    const { data: progress } = useQuery({ queryKey: ['today-progress'], queryFn: getTodayProgress, retry: 1 });
    const { data: plan } = useQuery({ queryKey: ['today-plan'], queryFn: getTodayPlan, retry: 1 });

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

    if (shiftLoading) {
        return (
            <View style={[s.loadingWrap, { backgroundColor: colors.background.primary }]}>
                <ActivityIndicator size="large" color={colors.accent.coral} />
            </View>
        );
    }

    const heroColor = countdown ? colors.accent.coral : colors.accent.cyan;

    return (
        <ImageBackground
            blurRadius={3} // Slight atmospheric blur on the raw image
            source={{ uri: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=800&auto=format&fit=crop&q=80' }}
            style={[s.root, { backgroundColor: colors.background.primary }]}
            imageStyle={{ opacity: 0.4 }}
        >
            <LinearGradient
                colors={['rgba(10,10,13,0.7)', colors.background.primary]}
                style={StyleSheet.absoluteFillObject}
            />
            <ScrollView
                contentContainerStyle={[s.scroll, { paddingTop: insets.top + 16 }]}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent.coral} />}
                showsVerticalScrollIndicator={false}
            >

                {/* ══ HEADER ══════════════════════════════════════════════════ */}
                <View style={s.header}>
                    <View style={s.headerLeft}>
                        <TouchableOpacity
                            onPress={() => router.push('/(tabs)/profile' as any)}
                            activeOpacity={0.75}
                        >
                            <View style={[s.avatar, {
                                backgroundColor: withAlpha(colors.accent.coral, 0.14),
                                borderColor: withAlpha(colors.accent.coral, 0.35),
                            }]}>
                                <Text style={[s.avatarTxt, { color: colors.accent.coral }]}>{initials}</Text>
                            </View>
                        </TouchableOpacity>
                        <View>
                            <Text style={[s.greetTxt, { color: colors.text.secondary }]}>{greeting} 👋</Text>
                            <Text style={[s.nameTxt, { color: colors.text.primary }]}>{displayName}</Text>
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
                        <TouchableOpacity
                            style={[s.iconBtn, { backgroundColor: withAlpha(colors.text.primary, 0.06) }]}
                            onPress={() => router.push('/(settings)/notifications' as any)}
                        >
                            <Ionicons name="notifications-outline" size={20} color={colors.text.primary} />
                        </TouchableOpacity>
                    </View>
                </View>
                <Text style={[s.dateTxt, { color: colors.text.tertiary }]}>{formattedDate}</Text>

                {/* ══ SHIFT COUNTDOWN HERO ════════════════════════════════════ */}
                <TouchableOpacity
                    onPress={() => router.push('/(shifts)' as any)}
                    activeOpacity={0.88}
                    style={{ borderRadius: 24, overflow: 'hidden', marginBottom: 12, borderWidth: 1, borderColor: withAlpha(colors.accent.coral, 0.15) }}
                >
                    <SafeBlurView
                        tint="dark"
                        intensity={40}
                        style={[s.heroCard, { borderWidth: 0 }]}
                    >
                        <LinearGradient
                            colors={[withAlpha(heroColor, 0.15), withAlpha(heroColor, 0.02)]}
                            style={StyleSheet.absoluteFillObject}
                            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                        />
                        <View style={{ flex: 1 }}>
                            <Text style={[s.heroLbl, { color: colors.text.secondary }]}>
                                {countdown ? 'Your shift ends in' : 'No active shift'}
                            </Text>
                            <Text style={[s.heroVal, { color: heroColor }]}>
                                {countdown ?? 'Rest Mode'}
                            </Text>
                        </View>
                        <View style={[s.heroIcon, { backgroundColor: withAlpha(heroColor, 0.12) }]}>
                            <Ionicons
                                name={countdown ? 'time-outline' : 'moon-outline'}
                                size={34}
                                color={heroColor}
                            />
                        </View>
                    </SafeBlurView>
                </TouchableOpacity>

                {/* ══ CIRCADIAN INSIGHT CHIP ══════════════════════════════════ */}
                <View style={[s.chipWrap, {
                    backgroundColor: withAlpha(insight.color, 0.10),
                    borderColor: withAlpha(insight.color, 0.22),
                }]}>
                    <Ionicons name={insight.icon} size={13} color={insight.color} />
                    <Text style={[s.chipTxt, { color: insight.color }]}>{insight.text}</Text>
                </View>

                {/* ══ UP NEXT MEAL ════════════════════════════════════════════ */}
                {nextMeal && (
                    <View style={{ borderRadius: 24, overflow: 'hidden', marginBottom: 16, borderWidth: 1, borderColor: withAlpha(colors.text.primary, 0.1) }}>
                        <SafeBlurView
                            tint="dark"
                            intensity={40}
                            style={[s.upNextCard, { borderWidth: 0 }]}
                        >
                            <LinearGradient
                                colors={[withAlpha(colors.accent.coral, 0.08), 'transparent']}
                                style={StyleSheet.absoluteFillObject}
                                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                            />
                            <View style={s.upNextTop}>
                                <View style={[s.upNextBadge, { backgroundColor: withAlpha(colors.accent.coral, 0.12) }]}>
                                    <Text style={[s.upNextLbl, { color: colors.accent.coral }]}>UP NEXT</Text>
                                    <Text style={[s.upNextTime, { color: colors.accent.coral }]}> · {nextMeal.time}</Text>
                                </View>
                                <View style={[s.mealIconWrap, { backgroundColor: withAlpha(colors.accent.amber, 0.12) }]}>
                                    <Ionicons name="restaurant" size={16} color={colors.accent.amber} />
                                </View>
                            </View>
                            <Text style={[s.mealName, { color: colors.text.primary }]}>{nextMeal.label}</Text>
                            {!!nextMeal.description && (
                                <Text style={[s.mealDesc, { color: colors.text.secondary }]} numberOfLines={2}>
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
                            <TouchableOpacity
                                style={[s.logBtn, { backgroundColor: colors.accent.coral }]}
                                onPress={() => router.push('/(tabs)/nutrition' as any)}
                            >
                                <Ionicons name="checkmark" size={17} color="#fff" />
                                <Text style={s.logBtnTxt}>Log Meal</Text>
                            </TouchableOpacity>
                        </SafeBlurView>
                    </View>
                )}

                {/* ══ SLEEP + HYDRATION MINI CARDS ════════════════════════════ */}
                <View style={s.miniRow}>
                    {/* Sleep Window */}
                    <TouchableOpacity
                        style={{ width: MINI_W, borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: withAlpha(colors.text.primary, 0.1) }}
                        onPress={() => router.push('/(shifts)/sleep-optimizer' as any)}
                        activeOpacity={0.8}
                    >
                        <SafeBlurView
                            tint="dark"
                            intensity={40}
                            style={[s.miniCard, {
                                borderColor: withAlpha(colors.text.primary, 0.1),
                            }]}
                        >
                            <View style={[s.miniIcon, { backgroundColor: withAlpha('#7C4DFF', 0.14) }]}>
                                <Ionicons name="moon" size={20} color="#7C4DFF" />
                            </View>
                            <Text style={[s.miniLbl, { color: colors.text.tertiary }]}>Sleep Window</Text>
                            <Text style={[s.miniVal, { color: colors.text.primary }]}>8h target</Text>
                            <Text style={[s.miniSub, { color: '#7C4DFF' }]}>Melatonin guide →</Text>
                        </SafeBlurView>
                    </TouchableOpacity>

                    {/* Hydration */}
                    <View style={{ width: MINI_W, borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: withAlpha(colors.text.primary, 0.1) }}>
                        <SafeBlurView
                            tint="dark"
                            intensity={40}
                            style={[s.miniCard, { borderWidth: 0, width: '100%' }]}
                        >
                            <View style={[s.miniIcon, { backgroundColor: withAlpha('#4FC3F7', 0.14) }]}>
                                <Ionicons name="water" size={20} color="#4FC3F7" />
                            </View>
                            <Text style={[s.miniLbl, { color: colors.text.tertiary }]}>Hydration</Text>
                            <Text style={[s.miniVal, { color: colors.text.primary }]}>
                                {progress ? ((progress.hydrationActual || progress.hydrationMl || 0) / 1000).toFixed(1) : '0'}
                                <Text style={[s.miniSub, { color: colors.text.tertiary }]}>
                                    {' / 2.5L'}
                                </Text>
                            </Text>
                            <View style={[s.hydBarBg, { backgroundColor: withAlpha('#4FC3F7', 0.15) }]}>
                                <View style={[s.hydBarFill, { width: (hydPct + '%') as any, backgroundColor: '#4FC3F7' }]} />
                            </View>
                            <TouchableOpacity
                                style={[s.addWaterBtn, {
                                    backgroundColor: withAlpha('#4FC3F7', 0.12),
                                    borderColor: withAlpha('#4FC3F7', 0.22),
                                }]}
                                onPress={() => addWater()}
                            >
                                <Text style={[s.addWaterTxt, { color: '#4FC3F7' }]}>+ Add 250ml</Text>
                            </TouchableOpacity>
                        </SafeBlurView>
                    </View>
                </View>

                {/* ══ QUICK ACTIONS ════════════════════════════════════════════ */}
                <Text style={[s.sectionLbl, { color: colors.text.tertiary }]}>QUICK ACTIONS</Text>
                <View style={s.quickGrid}>
                    {QUICK_ACTIONS.map(a => (
                        <TouchableOpacity
                            key={a.id}
                            onPress={() => router.push(a.route as any)}
                            activeOpacity={0.75}
                            style={{ width: MINI_W, height: 110, borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: withAlpha(colors.text.primary, 0.1) }}
                        >
                            <Image
                                source={{ uri: a.image }}
                                style={StyleSheet.absoluteFillObject}
                                resizeMode="cover"
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
                <Text style={[s.sectionLbl, { color: colors.text.tertiary }]}>EXPLORE</Text>
                <View style={s.catGrid}>
                    {exerciseCategories.map(cat => (
                        <TouchableOpacity
                            key={cat.id}
                            style={s.catCard}
                            onPress={() => router.push(`/(exercises)?category=${cat.id}` as any)}
                            activeOpacity={0.82}
                        >
                            <Image
                                source={{ uri: cat.image }}
                                style={StyleSheet.absoluteFillObject}
                                resizeMode="cover"
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
                <Text style={[s.sectionLbl, { color: colors.text.tertiary }]}>MORE FEATURES</Text>
                <View style={[s.catGrid, { marginBottom: 28 }]}>
                    {MORE_FEATURES.map(feat => (
                        <TouchableOpacity
                            key={feat.id}
                            style={s.catCard}
                            onPress={() => router.push(feat.route as any)}
                            activeOpacity={0.82}
                        >
                            <Image
                                source={{ uri: feat.image }}
                                style={StyleSheet.absoluteFillObject}
                                resizeMode="cover"
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
                <Text style={[s.sectionLbl, { color: colors.text.tertiary }]}>WORKOUT ACTIVITY</Text>
                <ActivityHeatmap />
                <View style={{ height: 20 }} />

                {/* ══ 24-HOUR SCHEDULE TIMELINE ════════════════════════════════ */}
                {sortedMeals.length > 0 && (
                    <>
                        <View style={s.sectionRow}>
                            <Text style={[s.sectionLbl, { color: colors.text.tertiary }]}>24H SCHEDULE</Text>
                            <TouchableOpacity onPress={() => router.push('/(tabs)/circadian' as any)}>
                                <Text style={[s.viewAll, { color: colors.accent.coral }]}>View Full →</Text>
                            </TouchableOpacity>
                        </View>

                        <SafeBlurView
                            tint="dark"
                            intensity={40}
                            style={[s.timeline, {
                                borderColor: withAlpha(colors.text.primary, 0.1),
                                overflow: 'hidden',
                            }]}
                        >
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
                                                        <Text style={s.nowTxt}>NOW</Text>
                                                    </View>
                                                )}
                                                {isPast && (
                                                    <Ionicons name="checkmark-circle" size={15} color={colors.accent.cyan} />
                                                )}
                                            </View>
                                            {!!meal.description && !isPast && (
                                                <Text style={[s.tlDesc, { color: colors.text.tertiary }]} numberOfLines={1}>
                                                    {meal.description}
                                                </Text>
                                            )}
                                        </View>
                                    </View>
                                );
                            })}
                        </SafeBlurView>
                    </>
                )}

                {/* ══ WEEKLY RECAP ════════════════════════════════════════════ */}
                <Text style={[s.sectionLbl, { color: colors.text.tertiary, marginTop: 4 }]}>WEEKLY RECAP</Text>
                <WeeklyRecap />

                <View style={{ height: 120 }} />
            </ScrollView>
        </ImageBackground>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
    root: { flex: 1 },
    loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    scroll: { paddingHorizontal: H_PAD },

    // Header
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
    avatarTxt: { fontSize: 15, fontWeight: '800' },
    greetTxt: { fontSize: 13, fontWeight: '500' },
    nameTxt: { fontSize: 20, fontWeight: '800', marginTop: 1 },
    shiftBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
    shiftDot: { width: 6, height: 6, borderRadius: 3 },
    shiftTxt: { fontSize: 12, fontWeight: '700' },
    iconBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
    dateTxt: { fontSize: 13, fontWeight: '500', marginBottom: 20, marginTop: 2 },

    // Hero
    heroCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 24, borderRadius: 24, borderWidth: 1, overflow: 'hidden', marginBottom: 12 },
    heroLbl: { fontSize: 14, fontWeight: '500', marginBottom: 4 },
    heroVal: { fontSize: 40, fontWeight: '900', letterSpacing: -1 },
    heroIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },

    // Insight chip
    chipWrap: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, borderWidth: 1, marginBottom: 20, alignSelf: 'flex-start' },
    chipTxt: { fontSize: 13, fontWeight: '600' },

    // UP NEXT card
    upNextCard: { padding: 22, borderRadius: 24, borderWidth: 1, overflow: 'hidden', marginBottom: 16 },
    upNextTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
    upNextBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
    upNextLbl: { fontSize: 11, fontWeight: '900', letterSpacing: 0.8 },
    upNextTime: { fontSize: 11, fontWeight: '700' },
    mealIconWrap: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
    mealName: { fontSize: 22, fontWeight: '900', marginBottom: 6 },
    mealDesc: { fontSize: 14, lineHeight: 20, marginBottom: 14 },
    macroRow: { flexDirection: 'row', marginBottom: 18 },
    logBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, borderRadius: 14 },
    logBtnTxt: { color: '#fff', fontSize: 15, fontWeight: '800' },

    // Mini cards
    miniRow: { flexDirection: 'row', gap: CARD_GAP, marginBottom: 28 },
    miniCard: { width: MINI_W, padding: 16, borderRadius: 20, borderWidth: 1 },
    miniIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
    miniLbl: { fontSize: 11, fontWeight: '600', letterSpacing: 0.5, marginBottom: 4 },
    miniVal: { fontSize: 20, fontWeight: '800', marginBottom: 4 },
    miniSub: { fontSize: 11, fontWeight: '600' },
    hydBarBg: { height: 4, borderRadius: 4, marginVertical: 10, overflow: 'hidden' },
    hydBarFill: { height: '100%', borderRadius: 4 },
    addWaterBtn: { paddingVertical: 7, borderRadius: 10, borderWidth: 1, alignItems: 'center', marginTop: 4 },
    addWaterTxt: { fontSize: 12, fontWeight: '700' },

    // Exercise category cards (2×2 image grid)
    catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: CARD_GAP, marginBottom: 28 },
    catCard: { width: MINI_W, height: 110, borderRadius: 18, overflow: 'hidden', position: 'relative' },
    catBadge: { position: 'absolute', top: 10, right: 10, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
    catBadgeTxt: { color: '#fff', fontSize: 10, fontWeight: '900' },
    catLabel: { position: 'absolute', bottom: 10, left: 10, right: 10 },
    catLabelTxt: { color: '#fff', fontSize: 13, fontWeight: '800', textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },

    // Quick actions
    sectionLbl: { fontSize: 12, fontWeight: '700', letterSpacing: 1.4, marginBottom: 14 },
    quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: CARD_GAP, marginBottom: 28 },
    quickCard: { width: MINI_W, padding: 18, borderRadius: 20, borderWidth: 1, alignItems: 'flex-start' },
    quickIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
    quickLbl: { fontSize: 14, fontWeight: '700' },

    // Section row with link
    sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
    viewAll: { fontSize: 13, fontWeight: '700' },

    // Timeline
    timeline: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 28 },
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
    nowTxt: { color: '#fff', fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
});
