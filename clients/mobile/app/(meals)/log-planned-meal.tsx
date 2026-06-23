/**
 * log-planned-meal — one-tap plan → meal confirm screen.
 *
 * Opened from the Circadian "AI Protocol" timeline ("Log this" on a planned MEAL
 * row). It arrives PREFILLED with that slot's mealType, planned macros and the
 * plan's suggested foods, lets the user confirm (or tweak) and logs the meal in
 * one tap — forwarding the originating `planMealId` so the log is correlated
 * with the plan slot it came from.
 *
 * React-Native skills applied (see ~/.claude/skills/react-native-skills/rules):
 *   • ui-expo-image.md          — food thumbnails use <Image> from `expo-image`
 *                                 with cachePolicy="memory-disk" + transition,
 *                                 recyclingKey, and a contentFit, not RN Image.
 *   • react-state-fallback.md   — the editable selection starts as `undefined`
 *     + state-ground-truth.md     ("user hasn't touched it") and FALLS BACK to
 *                                 the prefilled suggested foods via `??`; state
 *                                 stores only user intent (the override Map),
 *                                 visuals are derived. So if the params change
 *                                 the prefill updates reactively until edited.
 *   • list-performance-inline-objects.md + list-performance-function-references.md
 *                               — the food rows are a memoized child fed
 *                                 primitives (no inline objects), with a stable
 *                                 useCallback toggle handler.
 *   • ui-safe-area-scroll.md    — the scroll content respects the safe-area via
 *                                 useSafeAreaInsets (this screen has a custom
 *                                 header + an absolute footer, the documented
 *                                 case where contentInsetAdjustmentBehavior alone
 *                                 isn't enough; insets drive header/footer pad).
 *
 * UI: GlassCard + CtaButton primitives from '@/components/ui' and '@/theme'
 * tokens ONLY — no inline SafeBlurView card, no labeled coral LinearGradient.
 */
import React, { memo, useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert } from 'react-native';
import { Image } from 'expo-image';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/utils';
import { GlassCard, CtaButton, Skeleton, EmptyState } from '@/components/ui';
import { MealConfirmHero } from '@/components/MealConfirmHero';
import { logMeal, searchFoods, FoodItem } from '@/api/meals';
import { getErrorMessage } from '@/utils/validation';
import { invalidateMealAndProgress } from '@/utils/invalidateMealAndProgress';

// ── Param-decode types (the planned slot the circadian screen serialized) ──

type PlannedMacros = { protein?: number; carbs?: number; fat?: number; calories?: number };
type PlannedFood = { name: string; amount?: string; calories?: number; protein?: number; carbs?: number; fat?: number; imageUrl?: string };

const MEAL_TYPES = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'] as const;
type MealType = (typeof MEAL_TYPES)[number];

const MEAL_TYPE_LABEL: Record<MealType, string> = {
    BREAKFAST: 'Breakfast',
    LUNCH: 'Lunch',
    DINNER: 'Dinner',
    SNACK: 'Snack',
};

const MEAL_ICON: Record<MealType, keyof typeof Ionicons.glyphMap> = {
    BREAKFAST: 'cafe',
    LUNCH: 'restaurant',
    DINNER: 'moon',
    SNACK: 'nutrition',
};

const num = (v: unknown): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};

/** A confirmed plate line — what actually gets logged. */
type PlateItem = { name: string; calories: number; protein: number; carbs: number; fat: number; qty: number };

function toPlateItem(f: PlannedFood): PlateItem {
    return { name: f.name, calories: num(f.calories), protein: num(f.protein), carbs: num(f.carbs), fat: num(f.fat), qty: 1 };
}

export default function LogPlannedMealScreen() {
    const { colors, typography } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const qc = useQueryClient();

    const params = useLocalSearchParams<{
        mealType?: string;
        title?: string;
        planMealId?: string;
        plan?: string; // JSON: { plannedMacros, suggestedFoods, macros }
    }>();

    // Decode the planned slot ONCE. Robust to a missing/garbled param — we never
    // throw on parse, we fall back to an empty plan so the screen renders its
    // honest empty state instead of crashing.
    const decoded = useMemo(() => {
        let plannedMacros: PlannedMacros | null = null;
        let suggestedFoods: PlannedFood[] = [];
        let macrosText: string | undefined;
        try {
            if (params.plan) {
                const parsed = JSON.parse(params.plan) as { plannedMacros?: PlannedMacros; suggestedFoods?: PlannedFood[]; macros?: string };
                plannedMacros = parsed.plannedMacros ?? null;
                suggestedFoods = Array.isArray(parsed.suggestedFoods)
                    ? parsed.suggestedFoods.filter((f) => f && f.name)
                    : [];
                macrosText = typeof parsed.macros === 'string' ? parsed.macros : undefined;
            }
        } catch {
            // Leave the empty fallbacks in place.
        }
        return { plannedMacros, suggestedFoods, macrosText };
    }, [params.plan]);

    const mealType: MealType = (MEAL_TYPES as readonly string[]).includes(String(params.mealType).toUpperCase())
        ? (String(params.mealType).toUpperCase() as MealType)
        : 'SNACK';
    const slotTitle = params.title ? String(params.title) : MEAL_TYPE_LABEL[mealType];
    const planMealId = params.planMealId ? String(params.planMealId) : undefined;

    // ── Editable selection — state is USER INTENT only (skills: state-ground-truth) ──
    // We store ONLY user overrides (which prefilled foods were de-selected, plus
    // any foods searched-in). The displayed plate is DERIVED by combining the
    // prefill with these overrides. `excluded === undefined` means "user hasn't
    // touched the prefill" and falls back to "all suggested foods included".
    const [excluded, setExcluded] = useState<Record<string, true> | undefined>(undefined);
    const [added, setAdded] = useState<PlateItem[]>([]);
    const [sq, setSq] = useState('');

    const searchQ = useQuery({
        queryKey: ['planned-meal-search', sq],
        queryFn: () => searchFoods({ q: sq, limit: 20 }),
        enabled: sq.length > 2,
    });

    // Derived plate: prefilled suggestions minus user-excluded, plus user-added.
    const plate: PlateItem[] = useMemo(() => {
        const ex = excluded ?? {};
        const fromPrefill = decoded.suggestedFoods
            .filter((f) => !ex[f.name])
            .map(toPlateItem);
        // De-dupe by name so a searched-in food can't duplicate a suggestion.
        const seen = new Set(fromPrefill.map((p) => p.name));
        const merged = [...fromPrefill];
        for (const a of added) if (!seen.has(a.name)) { merged.push(a); seen.add(a.name); }
        return merged;
    }, [decoded.suggestedFoods, excluded, added]);

    const totals = useMemo(
        () =>
            plate.reduce(
                (acc, i) => ({
                    calories: acc.calories + i.calories * i.qty,
                    protein: acc.protein + i.protein * i.qty,
                    carbs: acc.carbs + i.carbs * i.qty,
                    fat: acc.fat + i.fat * i.qty,
                }),
                { calories: 0, protein: 0, carbs: 0, fat: 0 },
            ),
        [plate],
    );

    // Whether each suggested food is currently in the plate (for the row check).
    const isIncluded = useCallback((name: string) => !(excluded ?? {})[name], [excluded]);

    const toggleSuggested = useCallback((name: string) => {
        setExcluded((prev) => {
            const next = { ...(prev ?? {}) };
            if (next[name]) delete next[name];
            else next[name] = true;
            return next;
        });
    }, []);

    const addFood = useCallback((item: FoodItem) => {
        setAdded((prev) => (prev.find((p) => p.name === item.name) ? prev : [...prev, toPlateItem(item as any)]));
        setSq('');
    }, []);

    const removeAdded = useCallback((name: string) => {
        setAdded((prev) => prev.filter((p) => p.name !== name));
    }, []);

    const logM = useMutation({
        mutationFn: () => {
            // Backend requires >=1 food item. If the user logs a planned slot that
            // shipped no itemized foods (only a macro target), synthesize ONE line
            // from the planned macros so the slot can still be logged honestly.
            const m = decoded.plannedMacros;
            const foodItems =
                plate.length > 0
                    ? plate.map((i) => ({
                          name: i.name,
                          quantity: i.qty,
                          calories: i.calories * i.qty,
                          protein: i.protein * i.qty,
                          carbs: i.carbs * i.qty,
                          fat: i.fat * i.qty,
                      }))
                    : [
                          {
                              name: slotTitle,
                              quantity: 1,
                              calories: num(m?.calories),
                              protein: num(m?.protein),
                              carbs: num(m?.carbs),
                              fat: num(m?.fat),
                          },
                      ];
            return logMeal({ mealType, foodItems, ...(planMealId ? { planMealId } : {}) });
        },
        onSuccess: () => {
            // Route through the shared helper so logging a planned meal refreshes
            // BOTH calorie/macro rings: ['daily-progress'] (the Nutrition tab) and
            // ['today-progress'] (the dashboard). The old inline pair invalidated
            // only ['meal-logs'] + ['daily-progress'], leaving the dashboard ring
            // stale — the split-brain this helper exists to prevent.
            invalidateMealAndProgress(qc);
            router.back();
        },
        onError: (err: unknown) => Alert.alert('Error', getErrorMessage(err)),
    });

    // Can this slot be logged at all? Either there's a plate item, or there are
    // planned macros to synthesize a line from. If neither, we show an honest
    // empty state and keep the CTA disabled (no silent zero-calorie log).
    const hasMacros = useMemo(() => {
        const m = decoded.plannedMacros;
        return !!m && (num(m.calories) > 0 || num(m.protein) > 0 || num(m.carbs) > 0 || num(m.fat) > 0);
    }, [decoded.plannedMacros]);
    const canLog = plate.length > 0 || hasMacros;

    const accent = colors.accent.coral;
    const searchResults = (searchQ.data as FoodItem[] | undefined) ?? [];
    const includedCount = plate.length;
    const suggestedCount = decoded.suggestedFoods.length;

    return (
        <View style={[s.container, { backgroundColor: colors.background.primary }]}>
            <StatusBar style="light" />

            {/* Header — custom, so safe-area top inset is applied manually. */}
            <View style={[s.header, { paddingTop: insets.top + 12 }]}>
                <TouchableOpacity
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    accessibilityRole="button"
                    accessibilityLabel="Go back"
                    onPress={() => router.back()}
                    style={[s.iconBtn, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}
                >
                    <Ionicons name="arrow-back" size={20} color={colors.text.primary} />
                </TouchableOpacity>
                <View style={{ alignItems: 'center' }}>
                    <Text style={[typography.overline, { color: accent, letterSpacing: 1.5 }]}>FROM YOUR PROTOCOL</Text>
                    <Text style={[typography.h3, { color: colors.text.primary, marginTop: 1 }]}>Confirm Meal</Text>
                </View>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView
                contentContainerStyle={{ padding: 20, paddingBottom: 148 }}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
            >
                {/* Hero — planned slot identity + live animated rings (count-up kcal,
                    macro rings) derived from the current plate. */}
                <Animated.View entering={FadeInDown.duration(420).springify().damping(20)}>
                    <GlassCard glow={accent} style={[s.heroCard, { borderColor: withAlpha(accent, 0.26) }]}>
                        <View style={s.heroHead}>
                            <View style={[s.heroIcon, { backgroundColor: withAlpha(accent, 0.14), borderColor: withAlpha(accent, 0.3) }]}>
                                <Ionicons name={MEAL_ICON[mealType]} size={20} color={accent} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={[typography.overline, { color: colors.text.tertiary, letterSpacing: 1 }]}>
                                    {MEAL_TYPE_LABEL[mealType]}
                                </Text>
                                <Text style={[typography.h3, { color: colors.text.primary, marginTop: 1 }]} numberOfLines={2}>
                                    {slotTitle}
                                </Text>
                            </View>
                        </View>

                        {decoded.macrosText ? (
                            <View style={[s.targetPill, { backgroundColor: withAlpha(accent, 0.1), borderColor: withAlpha(accent, 0.22) }]}>
                                <Ionicons name="flag-outline" size={12} color={accent} />
                                <Text style={[typography.caption, { color: colors.text.secondary, marginLeft: 6 }]} numberOfLines={1}>
                                    Target: {decoded.macrosText}
                                </Text>
                            </View>
                        ) : null}

                        <View style={[s.heroDivider, { backgroundColor: colors.border.default }]} />

                        <MealConfirmHero
                            calories={totals.calories}
                            protein={totals.protein}
                            carbs={totals.carbs}
                            fat={totals.fat}
                            target={decoded.plannedMacros}
                            itemCount={includedCount}
                        />
                    </GlassCard>
                </Animated.View>

                {/* Suggested foods (prefilled, editable include/exclude) */}
                <Animated.View entering={FadeInDown.delay(80).duration(420).springify().damping(20)}>
                    <View style={s.sectionHead}>
                        <Text style={[typography.overline, { color: colors.text.secondary }]}>SUGGESTED FOODS</Text>
                        {suggestedCount > 0 ? (
                            <View style={[s.countPill, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
                                <Text style={[typography.caption, { color: colors.text.secondary, fontWeight: '700' }]}>
                                    {includedCount}/{suggestedCount + added.length}
                                </Text>
                            </View>
                        ) : null}
                    </View>
                    {suggestedCount === 0 ? (
                        <EmptyState
                            icon="sparkles-outline"
                            title="No itemized foods"
                            subtitle={
                                hasMacros
                                    ? "This slot is a macro target. Log it as-is, or search to add the foods you actually ate."
                                    : "This slot has no macros or foods to log. Search to add what you ate."
                            }
                        />
                    ) : (
                        <View>
                            {decoded.suggestedFoods.map((f) => (
                                <SuggestedFoodRow
                                    key={f.name}
                                    name={f.name}
                                    amount={f.amount}
                                    calories={num(f.calories)}
                                    protein={num(f.protein)}
                                    imageUrl={f.imageUrl}
                                    included={isIncluded(f.name)}
                                    accent={accent}
                                    onToggle={toggleSuggested}
                                />
                            ))}
                            <Text style={[typography.caption, { color: colors.text.tertiary, marginTop: 2, marginLeft: 2 }]}>
                                Tap a food to swap it out of this meal.
                            </Text>
                        </View>
                    )}
                </Animated.View>

                {/* Optional: search to add more foods */}
                <Animated.View entering={FadeInDown.delay(140).duration(420).springify().damping(20)}>
                    <Text style={[typography.overline, { color: colors.text.secondary, marginTop: 26, marginBottom: 12 }]}>
                        ADD MORE (OPTIONAL)
                    </Text>
                    <View style={[s.searchBox, { backgroundColor: colors.background.secondary, borderColor: sq.length > 0 ? withAlpha(accent, 0.4) : colors.border.default }]}>
                        <Ionicons name="search" size={18} color={sq.length > 0 ? accent : colors.text.tertiary} />
                        <TextInput
                            style={[s.searchIn, { color: colors.text.primary }]}
                            placeholder="Search food…"
                            placeholderTextColor={colors.text.tertiary}
                            value={sq}
                            onChangeText={setSq}
                            autoCorrect={false}
                            returnKeyType="search"
                            keyboardType="default"
                        />
                        {sq.length > 0 ? (
                            <TouchableOpacity
                                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                accessibilityRole="button"
                                accessibilityLabel="Clear search"
                                onPress={() => setSq('')}
                            >
                                <Ionicons name="close-circle" size={18} color={colors.text.tertiary} />
                            </TouchableOpacity>
                        ) : null}
                    </View>
                </Animated.View>

                {searchQ.isLoading ? (
                    <View style={{ marginTop: 12 }}>
                        {[0, 1, 2].map((i) => (
                            <Skeleton key={i} width="100%" height={64} radius={16} style={{ marginBottom: 10 }} />
                        ))}
                    </View>
                ) : null}

                {sq.length > 2 && !searchQ.isLoading && searchQ.isError ? (
                    <View style={{ marginTop: 12 }}>
                        <EmptyState
                            icon="cloud-offline-outline"
                            title="Search failed"
                            subtitle="Couldn't reach the food database. Check your connection and try again."
                            actionLabel="Try Again"
                            onAction={() => searchQ.refetch()}
                        />
                    </View>
                ) : null}

                {sq.length > 2 && !searchQ.isLoading && !searchQ.isError && searchResults.length === 0 ? (
                    <View style={{ marginTop: 12 }}>
                        <EmptyState icon="search-outline" title="No matches" subtitle={`Nothing found for "${sq}". Try a different term.`} />
                    </View>
                ) : null}

                {searchResults.length > 0 ? (
                    <View style={{ marginTop: 10 }}>
                        {searchResults.slice(0, 6).map((item) => (
                            <SearchResultRow
                                key={item.id}
                                name={item.name}
                                calories={num(item.calories)}
                                accent={colors.accent.coral}
                                item={item}
                                onAdd={addFood}
                            />
                        ))}
                    </View>
                ) : null}

                {/* Added (searched-in) foods, with quick remove */}
                {added.length > 0 ? (
                    <View style={{ marginTop: 18 }}>
                        <Text style={[typography.overline, { color: colors.text.secondary, marginBottom: 10 }]}>ADDED BY YOU</Text>
                        {added.map((a) => (
                            <View
                                key={a.name}
                                style={[s.addedRow, { backgroundColor: colors.background.secondary, borderColor: withAlpha(colors.accent.cyan, 0.3) }]}
                            >
                                <View style={[s.addedDot, { backgroundColor: withAlpha(colors.accent.cyan, 0.15) }]}>
                                    <Ionicons name="checkmark" size={16} color={colors.accent.cyan} />
                                </View>
                                <View style={{ flex: 1, paddingHorizontal: 12 }}>
                                    <Text style={[typography.subhead, { color: colors.text.primary }]} numberOfLines={1}>
                                        {a.name}
                                    </Text>
                                    <Text style={[typography.caption, { color: colors.text.secondary }]}>
                                        {Math.round(a.calories)} kcal • P:{Math.round(a.protein)}g
                                    </Text>
                                </View>
                                <TouchableOpacity
                                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                    accessibilityRole="button"
                                    accessibilityLabel={`Remove ${a.name}`}
                                    onPress={() => removeAdded(a.name)}
                                >
                                    <Ionicons name="trash-outline" size={18} color={colors.accent.red} />
                                </TouchableOpacity>
                            </View>
                        ))}
                    </View>
                ) : null}
            </ScrollView>

            {/* Footer CTA — CtaButton primitive; bottom safe-area inset applied. */}
            <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 20), backgroundColor: withAlpha(colors.background.primary, 0.96), borderTopColor: colors.border.default }]}>
                {canLog ? (
                    <Text style={[typography.caption, { color: colors.text.tertiary, textAlign: 'center', marginBottom: 10 }]}>
                        Logging {Math.round(totals.calories)} kcal{includedCount > 0 ? ` • ${includedCount} ${includedCount === 1 ? 'item' : 'items'}` : ''}
                    </Text>
                ) : null}
                <CtaButton
                    label={canLog ? 'LOG THIS MEAL' : 'NOTHING TO LOG'}
                    icon="checkmark-circle"
                    size="lg"
                    accessibilityLabel="Log this planned meal"
                    loading={logM.isPending}
                    disabled={!canLog}
                    onPress={() => logM.mutate()}
                    style={s.ctaWrap}
                />
            </View>
        </View>
    );
}

// ── Memoized rows (skills: list-performance — primitives in, stable handlers) ──

type SuggestedRowProps = {
    name: string;
    amount?: string;
    calories: number;
    protein: number;
    imageUrl?: string;
    included: boolean;
    accent: string;
    onToggle: (name: string) => void;
};

const SuggestedFoodRow = memo(function SuggestedFoodRow({
    name,
    amount,
    calories,
    protein,
    imageUrl,
    included,
    accent,
    onToggle,
}: SuggestedRowProps) {
    const { colors, typography } = useTheme();
    const handlePress = useCallback(() => onToggle(name), [onToggle, name]);
    const sub =
        amount && amount.length > 0
            ? `${amount} • ${Math.round(calories)} kcal`
            : `${Math.round(calories)} kcal • P:${Math.round(protein)}g`;
    return (
        <TouchableOpacity
            activeOpacity={0.85}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: included }}
            accessibilityLabel={`${name}, ${included ? 'included' : 'excluded'}`}
            accessibilityHint="Toggles whether this food is part of the logged meal"
            onPress={handlePress}
            style={[
                rowStyles.row,
                {
                    backgroundColor: colors.background.secondary,
                    borderColor: included ? withAlpha(accent, 0.45) : colors.border.default,
                    opacity: included ? 1 : 0.6,
                },
            ]}
        >
            {imageUrl ? (
                <Image
                    source={{ uri: imageUrl }}
                    style={rowStyles.thumb}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    transition={200}
                    recyclingKey={name}
                />
            ) : (
                <View style={[rowStyles.thumb, rowStyles.thumbFallback, { backgroundColor: withAlpha(accent, 0.12) }]}>
                    <Ionicons name="nutrition-outline" size={20} color={accent} />
                </View>
            )}
            <View style={{ flex: 1, paddingHorizontal: 12 }}>
                <Text style={[typography.subhead, { color: colors.text.primary }]} numberOfLines={1}>
                    {name}
                </Text>
                <Text style={[typography.caption, { color: colors.text.secondary }]} numberOfLines={1}>
                    {sub}
                </Text>
            </View>
            <View
                style={[
                    rowStyles.checkBadge,
                    included
                        ? { backgroundColor: withAlpha(accent, 0.16), borderColor: withAlpha(accent, 0.5) }
                        : { backgroundColor: 'transparent', borderColor: colors.border.light },
                ]}
            >
                <Ionicons
                    name={included ? 'checkmark' : 'add'}
                    size={18}
                    color={included ? accent : colors.text.tertiary}
                />
            </View>
        </TouchableOpacity>
    );
});

type SearchRowProps = {
    name: string;
    calories: number;
    accent: string;
    item: FoodItem;
    onAdd: (item: FoodItem) => void;
};

const SearchResultRow = memo(function SearchResultRow({ name, calories, accent, item, onAdd }: SearchRowProps) {
    const { colors, typography } = useTheme();
    const handleAdd = useCallback(() => onAdd(item), [onAdd, item]);
    return (
        <TouchableOpacity
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={`Add ${name}`}
            onPress={handleAdd}
            style={[rowStyles.searchRow, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}
        >
            <View style={[rowStyles.searchIconChip, { backgroundColor: withAlpha(accent, 0.12) }]}>
                <Ionicons name="restaurant-outline" size={18} color={accent} />
            </View>
            <View style={{ flex: 1, paddingHorizontal: 12 }}>
                <Text style={[typography.subhead, { color: colors.text.primary }]} numberOfLines={1}>
                    {name}
                </Text>
                <Text style={[typography.caption, { color: colors.text.secondary }]}>{Math.round(calories)} kcal per serving</Text>
            </View>
            <Ionicons name="add-circle" size={26} color={accent} />
        </TouchableOpacity>
    );
});

const s = StyleSheet.create({
    container: { flex: 1 },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingBottom: 14,
    },
    iconBtn: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    heroCard: { overflow: 'hidden', padding: 20 },
    heroHead: { flexDirection: 'row', alignItems: 'center' },
    heroIcon: { width: 44, height: 44, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
    targetPill: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        marginTop: 14,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 9999,
        borderWidth: 1,
    },
    heroDivider: { height: 1, marginTop: 18, marginBottom: 4 },
    sectionHead: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 26,
        marginBottom: 12,
    },
    countPill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 9999, borderWidth: 1 },
    searchBox: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, height: 52, gap: 8 },
    searchIn: { flex: 1, fontSize: 15, fontFamily: 'Barlow_400Regular' },
    addedRow: { flexDirection: 'row', alignItems: 'center', padding: 12, marginBottom: 10, borderRadius: 16, borderWidth: 1 },
    addedDot: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    footer: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 20, paddingTop: 14, borderTopWidth: 1 },
    ctaWrap: { height: 56, borderRadius: 18 },
});

const rowStyles = StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', padding: 12, marginBottom: 10, borderRadius: 16, borderWidth: 1 },
    thumb: { width: 48, height: 48, borderRadius: 12 },
    thumbFallback: { alignItems: 'center', justifyContent: 'center' },
    checkBadge: { width: 32, height: 32, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
    searchRow: { flexDirection: 'row', alignItems: 'center', padding: 12, marginBottom: 10, borderRadius: 16, borderWidth: 1 },
    searchIconChip: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
