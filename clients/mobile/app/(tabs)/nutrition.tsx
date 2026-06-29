/**
 * Meals — Zeitra nutrition screen.
 *
 * Rebuilt 1:1 from the design mockup `app_images/backups/meals-preview.html`.
 * Flat dark (#0A0C12), brighter design-lime (#C2F03C, the theme brand). Sections:
 *   1. header — "Meals" title + a circular search button (→ encyclopedia)
 *   2. next-meal hero slider (NextMealSlider) — photo card + lime badge + title +
 *      flame meta + "View meal"/"Add" pills + dots
 *   3. "Today's macros" — MacroRingsCard (4 donut rings: protein/carbs/fat/water)
 *   4. "Explore meals" — the interlocking bento (BentoBrowse, extended with a
 *      subtitle + cover-photo mode; same L-shape as Train's "Browse by style")
 *   5. "Browse by food group" — FoodGroupCarousel (Protein/Vegetables/…)
 * Drops the previous nutrition hub's calorie dashboard, logged-meals list,
 * hydration/fasting, daily-plan grid, recipes rail and quick-tools — all still
 * reachable from the meals sub-routes. Macros + next meal are REAL data; the
 * explore/food-group counts mirror the mockup (no count endpoint exists).
 */
import React, { useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { useTheme, typography } from '@/theme';
import { useThemedPalette, type ThemedPalette } from '@/theme/useThemedPalette';
import { getPlanByDate } from '@/api/plans';
import { getMealLogs } from '@/api/meals';
import { getToday as getTodayProgress } from '@/api/progress';
import {
    NextMealSlider, MacroRingsCard, FoodGroupCarousel,
    type NextMealSlide, type MacroRing, type FoodGroupCardData,
} from '@/components/NutritionCards';
import { BentoBrowse, type BentoItem } from '@/components/TrainingCards';
import { RecipeRail } from '@/components/nutrition/RecipeRail';
import { TAB_BAR_H } from './_layout';

// Bundled food/meal art (offline-safe — '@/*' → ./src, required by relative path).
const MEAL_LUNCH = require('../../assets/images/meal-lunch.png');
const MEAL_DINNER = require('../../assets/images/meal-dinner.png');
const MEAL_BREAKFAST = require('../../assets/images/meal-breakfast.png');
const MEAL_SNACK = require('../../assets/images/meal-snack.png');
const MEAL_RECOVERY = require('../../assets/images/meal-recovery.png');
const FOOD_MEAT = require('../../assets/images/food-meat.png');
const FOOD_VEGETABLES = require('../../assets/images/food-vegetables.png');
const FOOD_FRUITS = require('../../assets/images/food-fruits.png');
const FOOD_GRAINS = require('../../assets/images/food-grains.png');
const FOOD_SEAFOOD = require('../../assets/images/food-seafood.png');
const FOOD_DAIRY = require('../../assets/images/food-dairy.png');

/** Sum-safe number coercion (a NaN in any log can't poison the totals). */
function finiteNum(v: unknown): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}
/** "in 1h 20m" relative label to a HH:MM meal time (today, else tomorrow). */
function untilLabel(time?: string): string | null {
    if (!time) return null;
    const [h, m] = String(time).split(':');
    if (h === undefined) return null;
    const end = new Date(); end.setHours(parseInt(h, 10), parseInt(m ?? '0', 10), 0, 0);
    const now = new Date();
    if (end < now) end.setDate(end.getDate() + 1);
    const min = Math.floor((end.getTime() - now.getTime()) / 60000);
    if (min <= 0) return 'now';
    const hh = Math.floor(min / 60), mm = min % 60;
    return hh > 0 ? `in ${hh}h ${mm}m` : `in ${mm}m`;
}

export default function MealsScreen() {
    const D = useThemedPalette();
    const st = useMemo(() => makeStyles(D), [D]);
    const { colors } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const todayStr = format(new Date(), 'yyyy-MM-dd');

    // ── Queries (next meal + macros) ──
    const planQuery = useQuery({ queryKey: ['nutrition-plan', todayStr], queryFn: () => getPlanByDate(todayStr) });
    const logsQuery = useQuery({ queryKey: ['meal-logs', todayStr], queryFn: () => getMealLogs(todayStr) });
    const progressQuery = useQuery({ queryKey: ['daily-progress', todayStr], queryFn: getTodayProgress });

    const plan = planQuery.data;
    const progress = progressQuery.data;
    const logs = Array.isArray(logsQuery.data) ? logsQuery.data : [];

    // ── Macros (real: consumed from logs, targets from progress) ──
    const stats = useMemo(() => ({
        target: {
            calories: progress?.caloriesTarget || 2400,
            protein: progress?.proteinTarget || 180,
            carbs: progress?.carbsTarget || 200,
            fat: progress?.fatTarget || 70,
        },
        consumed: logs.reduce((a, l) => ({
            calories: a.calories + finiteNum(l.totalCalories),
            protein: a.protein + finiteNum(l.totalProtein),
            carbs: a.carbs + finiteNum(l.totalCarbs),
            fat: a.fat + finiteNum(l.totalFat),
        }), { calories: 0, protein: 0, carbs: 0, fat: 0 }),
    }), [progress, logs]);

    const hydrationActual = finiteNum((progress as any)?.hydrationActual ?? (progress as any)?.hydrationMl);
    const hydrationTarget = finiteNum((progress as any)?.hydrationTargetMl) || 3000;

    const ringFor = (cur: number, tgt: number, color: string, label: string): MacroRing => {
        const frac = tgt > 0 ? Math.min(1, Math.max(0, finiteNum(cur) / tgt)) : 0;
        return { label, color, fraction: frac, percent: Math.round(frac * 100) };
    };
    const macroRings: MacroRing[] = [
        ringFor(stats.consumed.protein, stats.target.protein, colors.macro.protein, 'Protein'),
        ringFor(stats.consumed.carbs, stats.target.carbs, colors.macro.carbs, 'Carbs'),
        ringFor(stats.consumed.fat, stats.target.fat, colors.macro.fat, 'Fat'),
        ringFor(hydrationActual, hydrationTarget, colors.macro.water, 'Water'),
    ];
    const consumedKcal = Math.round(stats.consumed.calories);
    const targetKcal = Math.round(stats.target.calories);

    // ── Next-meal slider (real: labelled plan meals, next first) ──
    const HERO_IMGS = [MEAL_LUNCH, MEAL_DINNER, MEAL_BREAKFAST, MEAL_SNACK];
    const shiftType = (progress as any)?.shiftType;
    const nextMealSlides: NextMealSlide[] = useMemo(() => {
        const labelled = (plan?.meals || []).filter((m: any) => m && (m.label || m.name));
        return labelled.map((m: any, i: number) => {
            const title = m.label || m.name;
            const kcal = finiteNum(m.calories ?? m.macros?.calories);
            const protein = finiteNum(m.protein ?? m.macros?.protein);
            const meta = [kcal > 0 ? `${Math.round(kcal)} kcal` : null, protein > 0 ? `${Math.round(protein)}g protein` : null]
                .filter(Boolean).join(' · ') || undefined;
            const until = i === 0 ? untilLabel(m.time) : null;
            const eyebrow = [i === 0 ? 'Next' : 'Later', shiftType, until]
                .filter(Boolean).join(' · ').toUpperCase();
            const goLog = () => router.push({ pathname: '/(meals)/log-meal', params: { preset: title } } as any);
            return { key: m.id ?? `${title}-${i}`, eyebrow, title, meta, img: HERO_IMGS[i % HERO_IMGS.length]!, onPress: goLog, onAdd: goLog };
        });
    }, [plan, shiftType, router]);

    // ── "Explore meals" interlocking bento (z-order: quick/protein-L/recovery/vegan/budget/comfort).
    //    All tiles are cover food photos (mockup uses object-fit:cover throughout). ──
    // Each tile passes the EXACT recipe tag the backend filters by (Recipe.tags has)
    // so the Explore grid lands on real, filtered results (not the unfiltered list).
    const recipe = (tags: string) => () => router.push({ pathname: '/(meals)/recipes', params: { tags } } as any);
    const exploreBento: BentoItem[] = [
        { id: 'quick', title: 'Quick & easy', subtitle: 'Under 30 min', icon: 'flash', img: MEAL_SNACK, cover: true, onPress: recipe('Under 30m') },
        { id: 'protein', title: 'High protein', subtitle: 'Training nights', icon: 'restaurant', img: FOOD_MEAT, cover: true, onPress: recipe('High Protein') },
        { id: 'keto', title: 'Keto', subtitle: 'Low carb', icon: 'flame', img: MEAL_RECOVERY, cover: true, onPress: recipe('Keto') },
        { id: 'vegan', title: 'Vegan', subtitle: 'Plant-based', icon: 'leaf', img: FOOD_VEGETABLES, cover: true, onPress: recipe('Vegan') },
        { id: 'vegetarian', title: 'Vegetarian', subtitle: 'Meat-free', icon: 'nutrition', img: FOOD_GRAINS, cover: true, onPress: recipe('Vegetarian') },
        { id: 'mealprep', title: 'Meal prep', subtitle: 'Make ahead', icon: 'cube', img: MEAL_DINNER, cover: true, onPress: recipe('Meal Prep') },
    ];

    // ── "Browse by food group" → the food encyclopedia, filtered by the real
    //    food_group (8,641-food catalog). Counts are live-catalog snapshots; the
    //    label maps to the DB group the encyclopedia substring-matches. ──
    const fg = (group: string) => () => router.push({ pathname: '/(meals)/encyclopedia', params: { group } } as any);
    const foodGroups: FoodGroupCardData[] = [
        { key: 'protein', title: 'Protein', countLabel: '1,921 foods', img: FOOD_MEAT, onPress: fg('Meat') },
        { key: 'vegetables', title: 'Vegetables', countLabel: '938 foods', img: FOOD_VEGETABLES, onPress: fg('Vegetables') },
        { key: 'fruits', title: 'Fruits', countLabel: '467 foods', img: FOOD_FRUITS, onPress: fg('Fruits') },
        { key: 'grains', title: 'Grains', countLabel: '385 foods', img: FOOD_GRAINS, onPress: fg('Grains') },
        { key: 'seafood', title: 'Seafood', countLabel: '264 foods', img: FOOD_SEAFOOD, onPress: fg('Seafood') },
        { key: 'dairy', title: 'Dairy', countLabel: '291 foods', img: FOOD_DAIRY, onPress: fg('Dairy') },
    ];

    return (
        <View style={[st.root, { backgroundColor: D.bg }]}>
            <StatusBar style="light" />

            {/* ══ HEADER ══════════════════════════════════════════════════ */}
            <View style={[st.header, { paddingTop: insets.top + 10 }]}>
                <Text style={st.title}>Meals</Text>
                <TouchableOpacity
                    style={st.searchBtn} activeOpacity={0.85}
                    onPress={() => router.push('/(meals)/encyclopedia' as any)}
                    accessibilityRole="button" accessibilityLabel="Search foods"
                >
                    <Ionicons name="search" size={20} color={D.text} />
                </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: TAB_BAR_H + 96 }}>
                {/* ══ NEXT-MEAL HERO SLIDER ═══════════════════════════════ */}
                {nextMealSlides.length > 0 && (
                    <View style={{ marginTop: 10 }}>
                        <NextMealSlider slides={nextMealSlides} />
                    </View>
                )}

                {/* ══ TODAY'S MACROS ══════════════════════════════════════ */}
                {!progressQuery.isError && (
                    <View style={{ marginTop: 16 }}>
                        <MacroRingsCard rings={macroRings} consumedKcal={consumedKcal} targetKcal={targetKcal} />
                    </View>
                )}

                {/* ══ RIA'S MEAL PLAN ═════════════════════════════════════ */}
                <TouchableOpacity
                    activeOpacity={0.9}
                    accessibilityRole="button"
                    accessibilityLabel="Open your AI meal plan from Coach Ria"
                    onPress={() => router.push('/(challenge)/meals' as any)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: D.card, borderWidth: 1.5, borderColor: D.lime, borderRadius: 16, padding: 13, marginTop: 16 }}
                >
                    <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: D.avBg, alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="flash" size={20} color={D.lime} />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={{ color: D.text, fontSize: 15, fontWeight: '600' }}>Ria's meal plan</Text>
                        <Text style={{ color: D.muted, fontSize: 12, marginTop: 2 }}>AI-picked meals for your goal — tap to add</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={D.lime} />
                </TouchableOpacity>

                {/* ══ BROWSE BY FOOD GROUP (directly under macros) ════════ */}
                <Animated.View entering={FadeInDown.delay(110).duration(440)} style={{ marginHorizontal: -16 }}>
                    <View style={st.fgHead}>
                        <Text style={st.sectionTitle2}>Browse by food group</Text>
                        <TouchableOpacity
                            style={st.allLink} activeOpacity={0.85} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            onPress={() => router.push('/(meals)/encyclopedia' as any)}
                            accessibilityRole="button" accessibilityLabel="All food groups"
                        >
                            <Text style={st.allTxt}>All</Text>
                            <Ionicons name="chevron-forward" size={15} color={D.muted} />
                        </TouchableOpacity>
                    </View>
                    <FoodGroupCarousel groups={foodGroups} />
                </Animated.View>

                {/* ══ EXPLORE MEALS (bento) ═══════════════════════════════ */}
                <Animated.View entering={FadeInDown.delay(150).duration(440)}>
                    <Text style={[st.sectionTitle, { marginTop: 22 }]}>Explore meals</Text>
                    <BentoBrowse items={exploreBento} />
                </Animated.View>

                {/* ══ FRESH RECIPES RAIL ══════════════════════════════════ */}
                <View style={{ marginHorizontal: -16 }}>
                    <RecipeRail title="Fresh recipes" />
                </View>
            </ScrollView>
        </View>
    );
}

const makeStyles = (D: ThemedPalette) => StyleSheet.create({
    root: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingBottom: 6 },
    title: [typography.h2, { color: D.text, fontSize: 24, fontWeight: '600', letterSpacing: -0.4 }] as any,
    searchBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: D.card, borderWidth: 1, borderColor: D.border, alignItems: 'center', justifyContent: 'center' },
    sectionTitle: [typography.subtitle, { color: D.text, fontSize: 16, paddingBottom: 10 }] as any,
    sectionTitle2: [typography.subtitle, { color: D.text, fontSize: 16 }] as any,
    fgHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 24, paddingBottom: 12 },
    allLink: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    allTxt: [typography.caption, { color: D.muted, fontSize: 12.5 }] as any,
});
