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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/utils';
import { GlassCard, CtaButton, Skeleton, EmptyState } from '@/components/ui';
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

    const accent = colors.accent.cyan;
    const searchResults = (searchQ.data as FoodItem[] | undefined) ?? [];

    return (
        <View style={[s.container, { backgroundColor: colors.background.primary }]}>
            <StatusBar style="light" />

            {/* Header — custom, so safe-area top inset is applied manually. */}
            <View style={[s.header, { paddingTop: insets.top + 16, borderBottomColor: colors.border.default }]}>
                <TouchableOpacity
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    accessibilityRole="button"
                    accessibilityLabel="Go back"
                    onPress={() => router.back()}
                    style={[s.iconBtn, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}
                >
                    <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
                </TouchableOpacity>
                <Text style={[typography.h2, { color: colors.text.primary }]}>Confirm Meal</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView
                contentContainerStyle={{ padding: 20, paddingBottom: 140 }}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
            >
                {/* Planned-slot summary */}
                <GlassCard glow={accent} style={[s.summaryCard, { borderColor: withAlpha(accent, 0.28) }]}>
                    <View style={s.summaryRow}>
                        <View style={[s.summaryIcon, { backgroundColor: withAlpha(accent, 0.14) }]}>
                            <Ionicons name="restaurant" size={22} color={accent} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={[typography.overline, { color: colors.text.secondary }]}>
                                {MEAL_TYPE_LABEL[mealType]} • From your protocol
                            </Text>
                            <Text style={[typography.h3, { color: colors.text.primary, marginTop: 2 }]} numberOfLines={2}>
                                {slotTitle}
                            </Text>
                            {decoded.macrosText ? (
                                <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 4 }]}>
                                    Target: {decoded.macrosText}
                                </Text>
                            ) : null}
                        </View>
                    </View>
                </GlassCard>

                {/* Macro totals (live, derived from the current plate) */}
                <View style={[s.macroRow, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
                    {[
                        { l: 'KCAL', v: Math.round(totals.calories), c: colors.accent.coral },
                        { l: 'PROTEIN', v: Math.round(totals.protein), c: colors.accent.emerald },
                        { l: 'CARBS', v: Math.round(totals.carbs), c: colors.accent.cyan },
                        { l: 'FAT', v: Math.round(totals.fat), c: colors.accent.amber },
                    ].map((mm) => (
                        <View key={mm.l} style={{ alignItems: 'center', flex: 1 }}>
                            <Text style={[typography.statSmall, { color: mm.c, fontSize: 20, lineHeight: 26 }]} maxFontSizeMultiplier={1.3}>
                                {mm.v}
                            </Text>
                            <Text style={[typography.overline, { color: colors.text.secondary, fontSize: 9, letterSpacing: 1, marginTop: 2 }]}>
                                {mm.l}
                            </Text>
                        </View>
                    ))}
                </View>

                {/* Suggested foods (prefilled, editable include/exclude) */}
                <Text style={[typography.overline, { color: colors.text.secondary, marginTop: 24, marginBottom: 12 }]}>
                    SUGGESTED FOODS
                </Text>
                {decoded.suggestedFoods.length === 0 ? (
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
                    </View>
                )}

                {/* Optional: search to add more foods */}
                <Text style={[typography.overline, { color: colors.text.secondary, marginTop: 24, marginBottom: 12 }]}>
                    ADD MORE (OPTIONAL)
                </Text>
                <View style={[s.searchBox, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
                    <Ionicons name="search" size={18} color={colors.text.tertiary} />
                    <TextInput
                        style={[s.searchIn, { color: colors.text.primary }]}
                        placeholder="Search food…"
                        placeholderTextColor={colors.text.tertiary}
                        value={sq}
                        onChangeText={setSq}
                        autoCorrect={false}
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

                {searchQ.isLoading ? (
                    <View style={{ marginTop: 12 }}>
                        {[0, 1, 2].map((i) => (
                            <Skeleton key={i} width="100%" height={58} radius={12} style={{ marginBottom: 8 }} />
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
                    <View style={{ marginTop: 8 }}>
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
                    <View style={{ marginTop: 16 }}>
                        <Text style={[typography.overline, { color: colors.text.secondary, marginBottom: 8 }]}>ADDED</Text>
                        {added.map((a) => (
                            <View
                                key={a.name}
                                style={[s.addedRow, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}
                            >
                                <View style={{ flex: 1 }}>
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
                                    <Ionicons name="trash-outline" size={18} color={colors.accent.coral} />
                                </TouchableOpacity>
                            </View>
                        ))}
                    </View>
                ) : null}
            </ScrollView>

            {/* Footer CTA — CtaButton primitive; bottom safe-area inset applied. */}
            <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 20), backgroundColor: withAlpha(colors.background.primary, 0.96) }]}>
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
            onPress={handlePress}
            style={[
                rowStyles.row,
                {
                    backgroundColor: colors.background.secondary,
                    borderColor: included ? withAlpha(accent, 0.4) : colors.border.default,
                    opacity: included ? 1 : 0.55,
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
                    <Ionicons name="nutrition-outline" size={18} color={accent} />
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
            <Ionicons
                name={included ? 'checkmark-circle' : 'ellipse-outline'}
                size={24}
                color={included ? accent : colors.text.tertiary}
            />
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
            <View style={{ flex: 1 }}>
                <Text style={[typography.subhead, { color: colors.text.primary }]} numberOfLines={1}>
                    {name}
                </Text>
                <Text style={[typography.caption, { color: colors.text.secondary }]}>{Math.round(calories)} kcal per serving</Text>
            </View>
            <Ionicons name="add-circle" size={24} color={accent} />
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
        paddingBottom: 16,
        borderBottomWidth: 1,
    },
    iconBtn: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    summaryCard: { overflow: 'hidden', padding: 18 },
    summaryRow: { flexDirection: 'row', alignItems: 'center' },
    summaryIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
    macroRow: { flexDirection: 'row', borderWidth: 1, borderRadius: 14, padding: 14, marginTop: 16 },
    searchBox: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, height: 48, gap: 8 },
    searchIn: { flex: 1, fontSize: 15 },
    addedRow: { flexDirection: 'row', alignItems: 'center', padding: 12, marginBottom: 8, borderRadius: 12, borderWidth: 1 },
    footer: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 20, paddingTop: 12 },
    ctaWrap: { height: 56, borderRadius: 28 },
});

const rowStyles = StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', padding: 12, marginBottom: 8, borderRadius: 12, borderWidth: 1 },
    thumb: { width: 44, height: 44, borderRadius: 10 },
    thumbFallback: { alignItems: 'center', justifyContent: 'center' },
    searchRow: { flexDirection: 'row', alignItems: 'center', padding: 14, marginBottom: 8, borderRadius: 12, borderWidth: 1 },
});
