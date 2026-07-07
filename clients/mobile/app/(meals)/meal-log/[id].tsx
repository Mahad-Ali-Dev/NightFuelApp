/**
 * meal-log/[id].tsx — the LOGGED-MEAL DETAIL screen.
 *
 * Tapping a meal in the Nutrition hub's "Today's Meals" list opens this screen
 * with the FULL breakdown of that logged meal:
 *
 *   • Header — meal type + time + total calories, with the macro split shown via
 *     the shared MacroRings (protein lime / carbs amber / fat rose, the
 *     colors.macro.* tokens). A logged meal's macros ARE its composition, so each
 *     ring fills against the meal's own total (current === target).
 *   • Food items — one clean GlassCard row per foodItem: name, quantity, its
 *     calories, and its per-item P/C/F macros.
 *   • Micronutrients — the optional micros that now PERSIST on the meal-service
 *     `foodItems` JSON (FoodItemMicros: fiber/sugar/saturatedFat/transFat [g],
 *     minerals + vitaminC/vitaminB6/cholesterol [mg], vitaminA/D/B12/folate [µg]).
 *     They are AGGREGATED across every foodItem (each present value summed), and
 *     ONLY the micros present on at least one item are shown; a meal that carries
 *     no micros at all (e.g. a manually-added plate) renders no micro section.
 *
 * HOW THE MEAL REACHES THIS SCREEN — there is no per-id meal-log endpoint
 * (getMealLogs returns a whole day), so the Nutrition row passes the meal as a
 * `log` JSON param (mirrors how log-planned-meal.tsx receives its `plan` param).
 * We decode it ONCE, never throwing on a missing/garbled param — a bad decode
 * falls back to the honest "couldn't open" empty state instead of crashing.
 *
 * Constraints honoured: theme tokens only (no raw hex); the glass surface is
 * GlassCard; Saira via typography.*; Reanimated v4 FadeInDown entrances with a
 * stagger on the item list. Never the word "Log" in copy.
 */
import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { withAlpha } from '@/theme/utils';
import { EmptyState, GlassCard } from '@/components/ui';
import { PressableScale } from '@/components/ui/PressableScale';
import { MacroRings } from '@/components/nutrition/MacroRings';
import type { MealLog } from '@/api/meals';

// Human-readable label for a MealLog's `mealType` enum — same map as the
// Nutrition hub's LoggedMealRow + log-planned-meal.tsx. Unknown / missing types
// fall back to a friendly default ("Meal"), which never contains the word "Log".
const MEAL_TYPE_LABEL: Record<string, string> = {
    BREAKFAST: 'Breakfast',
    LUNCH: 'Lunch',
    DINNER: 'Dinner',
    SNACK: 'Snack',
};
const mealTypeLabel = (t?: string) => MEAL_TYPE_LABEL[String(t || '').toUpperCase()] || 'Meal';

// Coerce any value to a finite number (undefined / null / NaN / ±Infinity → 0).
// The logged totals + per-item macros can be missing or NaN from a bad upstream
// parse; a bare `(x || 0)` lets NaN through and NaN poisons every downstream sum
// and ring fraction. Funnel every addend / numeral operand through this.
const finiteNum = (n: unknown): number =>
    typeof n === 'number' && Number.isFinite(n) ? n : 0;

// ── Micronutrient + secondary-macro metadata ────────────────────────────────
// The single source of truth for HOW each persisted micro on a logged foodItem
// is labeled + united. The meal-service retains the SAME key vocabulary the
// /food-search gateway (and the barcode scanner's BARCODE_MICROS) use — `iron` /
// `vitaminB12` / `sodium` / `phosphorus` / `vitaminA` / `cholesterol` … — NOT
// the library `…Mg`/`…Mcg` field names. Ordered for a stable reading order:
// the secondary macros (grams) first, then minerals (mg), then vitamins (mg/µg)
// and cholesterol (mg) — so two meals present their micros consistently. `unit`
// matches the backend's stated unit for each field (FoodItemMicros).
type MicroKey =
    | 'fiber' | 'sugar' | 'saturatedFat' | 'transFat'
    | 'sodium' | 'potassium' | 'calcium' | 'iron' | 'magnesium' | 'phosphorus' | 'zinc'
    | 'vitaminC' | 'vitaminA' | 'vitaminD' | 'vitaminB6' | 'vitaminB12' | 'folate'
    | 'cholesterol';

interface MicroMeta { key: MicroKey; label: string; unit: 'g' | 'mg' | 'µg' }

const MEAL_MICROS: readonly MicroMeta[] = [
    // Secondary macros (g)
    { key: 'fiber', label: 'Fiber', unit: 'g' },
    { key: 'sugar', label: 'Sugar', unit: 'g' },
    { key: 'saturatedFat', label: 'Sat. Fat', unit: 'g' },
    { key: 'transFat', label: 'Trans Fat', unit: 'g' },
    // Minerals (mg)
    { key: 'sodium', label: 'Sodium', unit: 'mg' },
    { key: 'potassium', label: 'Potassium', unit: 'mg' },
    { key: 'calcium', label: 'Calcium', unit: 'mg' },
    { key: 'iron', label: 'Iron', unit: 'mg' },
    { key: 'magnesium', label: 'Magnesium', unit: 'mg' },
    { key: 'phosphorus', label: 'Phosphorus', unit: 'mg' },
    { key: 'zinc', label: 'Zinc', unit: 'mg' },
    // Vitamins (mg / µg) + cholesterol (mg)
    { key: 'vitaminC', label: 'Vitamin C', unit: 'mg' },
    { key: 'vitaminA', label: 'Vitamin A', unit: 'µg' },
    { key: 'vitaminD', label: 'Vitamin D', unit: 'µg' },
    { key: 'vitaminB6', label: 'Vitamin B6', unit: 'mg' },
    { key: 'vitaminB12', label: 'Vitamin B12', unit: 'µg' },
    { key: 'folate', label: 'Folate', unit: 'µg' },
    { key: 'cholesterol', label: 'Cholesterol', unit: 'mg' },
] as const;

interface AggregatedMicro extends MicroMeta { value: number }

// A micro contributes only when it is a real, finite number on a foodItem — null
// / undefined (the item didn't report it) and NaN are skipped. We SUM each
// present micro across all foodItems, and emit a micro ONLY when at least one
// item reported it (`present`), in the canonical MEAL_MICROS order. Returns []
// for a meal whose items carry no micros at all → no micro section renders.
const aggregateMicros = (foodItems: MealLog['foodItems'] | undefined): AggregatedMicro[] => {
    if (!Array.isArray(foodItems) || foodItems.length === 0) return [];
    const out: AggregatedMicro[] = [];
    for (const meta of MEAL_MICROS) {
        let sum = 0;
        let present = false;
        for (const item of foodItems) {
            const value = (item as unknown as Record<string, unknown>)[meta.key];
            if (typeof value === 'number' && Number.isFinite(value)) {
                sum += value;
                present = true;
            }
        }
        if (present) out.push({ ...meta, value: sum });
    }
    return out;
};

// Aggregated micro amounts span a wide range (0.4 mg iron vs 420 mg potassium),
// so keep one decimal under 10 (trace nutrients don't collapse to "0") and round
// whole above. Mirrors the barcode scanner's formatMicroValue.
const formatMicroValue = (value: number): string =>
    String(value < 10 ? Math.round(value * 10) / 10 : Math.round(value));

// Decode the `log` JSON param into a MealLog ONCE. Robust to a missing / garbled
// param: returns null (→ honest empty state) instead of throwing. We accept
// either the raw object or the `useLocalSearchParams` string form.
const decodeLog = (raw: string | string[] | undefined): MealLog | null => {
    if (typeof raw !== 'string' || raw.length === 0) return null;
    try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') return parsed as MealLog;
    } catch {
        // fall through to null — the screen renders its "couldn't open" state.
    }
    return null;
};

export default function MealLogDetailScreen() {
    const { colors, typography, borderRadius, shadows } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();

    const params = useLocalSearchParams<{ id?: string; log?: string }>();

    const log = useMemo(() => decodeLog(params.log), [params.log]);

    const foodItems = useMemo(
        () => (Array.isArray(log?.foodItems) ? log!.foodItems : []),
        [log],
    );

    // Aggregated micros across every foodItem — [] when the meal carries none, so
    // the section is omitted entirely (manually-added meals).
    const micros = useMemo(() => aggregateMicros(foodItems), [foodItems]);

    // ── Decode failure → honest, non-crashing empty state ────────────────────
    if (!log) {
        return (
            <View style={[styles.container, { backgroundColor: colors.background.primary, paddingTop: insets.top }]}>
                <StatusBar style="light" />
                <View style={[styles.header, { borderBottomColor: colors.border.default }]}>
                    <PressableScale
                        accessibilityRole="button"
                        accessibilityLabel="Go back"
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        onPress={() => router.back()}
                        style={[styles.iconBtn, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}
                    >
                        <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
                    </PressableScale>
                    <Text style={[typography.h3, { color: colors.text.primary }]}>Meal</Text>
                    <View style={{ width: 40 }} />
                </View>
                <EmptyState
                    icon="cloud-offline-outline"
                    title="Couldn't open this meal"
                    subtitle="Something went wrong opening this meal. Please go back and try again."
                    actionLabel="Go Back"
                    onAction={() => router.back()}
                />
            </View>
        );
    }

    const title = mealTypeLabel(log.mealType);
    const totalCalories = Math.round(finiteNum(log.totalCalories));
    const loggedTime = log.loggedAt ? formatTime(log.loggedAt) : null;

    return (
        <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
            <StatusBar style="light" />

            {/* Header bar — back + meal-type title */}
            <View style={[styles.header, { paddingTop: insets.top + 12, borderBottomColor: colors.border.default }]}>
                <PressableScale
                    accessibilityRole="button"
                    accessibilityLabel="Go back"
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    onPress={() => router.back()}
                    style={[styles.iconBtn, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}
                >
                    <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
                </PressableScale>
                <View style={{ alignItems: 'center' }}>
                    <Text style={[typography.h3, { color: colors.text.primary }]} numberOfLines={1}>{title}</Text>
                    <Text style={[typography.overline, { color: colors.accent.coral, fontSize: 10, letterSpacing: 1.4 }]}>
                        MEAL DETAIL
                    </Text>
                </View>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 48 }}
            >
                {/* ── Header card: total calories hero + the macro split rings ── */}
                <Animated.View entering={FadeInDown.duration(420)}>
                    <GlassCard glow={colors.accent.coral} radius={borderRadius.xl} style={[styles.headerCard, { borderColor: withAlpha(colors.accent.coral, 0.25) }]}>
                        <LinearGradient
                            colors={[withAlpha(colors.accent.coral, 0.12), 'transparent']}
                            start={{ x: 0.5, y: 0 }}
                            end={{ x: 0.5, y: 1 }}
                            style={StyleSheet.absoluteFillObject}
                        />
                        <View style={styles.headerCardInner}>
                            <View style={styles.headerMetaRow}>
                                <Text style={[typography.overline, { color: colors.accent.coral }]}>{title.toUpperCase()}</Text>
                                {loggedTime ? (
                                    <View style={styles.timeRow}>
                                        <Ionicons name="time-outline" size={13} color={colors.text.tertiary} />
                                        <Text style={[typography.caption, { color: colors.text.tertiary, marginLeft: 4 }]}>{loggedTime}</Text>
                                    </View>
                                ) : null}
                            </View>

                            {/* Hero calorie stat — value dominates its unit. */}
                            <View
                                style={styles.calRow}
                                accessible
                                accessibilityLabel={`${totalCalories} total calories`}
                            >
                                <Text style={[typography.statLarge, { color: colors.text.primary }]}>{totalCalories}</Text>
                                <Text style={[typography.subtitle, { color: colors.text.secondary, marginLeft: 8, marginBottom: 8 }]}>kcal</Text>
                            </View>

                            {/* Macro split — protein lime / carbs amber / fat rose (the
                                colors.macro.* tokens). The logged meal's macros ARE its
                                composition, so each ring fills against its own total. */}
                            <View style={styles.ringsWrap}>
                                <MacroRings
                                    protein={{ label: 'Protein', current: Math.round(finiteNum(log.totalProtein)), target: finiteNum(log.totalProtein), color: colors.macro.protein }}
                                    carbs={{ label: 'Carbs', current: Math.round(finiteNum(log.totalCarbs)), target: finiteNum(log.totalCarbs), color: colors.macro.carbs }}
                                    fat={{ label: 'Fat', current: Math.round(finiteNum(log.totalFat)), target: finiteNum(log.totalFat), color: colors.macro.fat }}
                                />
                            </View>
                        </View>
                    </GlassCard>
                </Animated.View>

                {/* ── Food items list ─────────────────────────────────────────── */}
                <Animated.View entering={FadeInDown.delay(80).duration(420)}>
                    <Text style={[typography.heading, { color: colors.text.primary, marginTop: 28, marginBottom: 14 }]}>
                        Food items
                    </Text>
                </Animated.View>

                {foodItems.length === 0 ? (
                    <GlassCard radius={borderRadius.xl} testID="meal-items-empty">
                        <View style={styles.emptyItems}>
                            <Ionicons name="restaurant-outline" size={20} color={colors.text.tertiary} />
                            <Text style={[typography.caption, { color: colors.text.secondary, marginLeft: 10 }]} numberOfLines={2}>
                                This meal has no itemized foods.
                            </Text>
                        </View>
                    </GlassCard>
                ) : (
                    foodItems.map((item, i) => {
                        const qty = finiteNum(item.quantity);
                        const itemMacros = [
                            { label: 'P', value: Math.round(finiteNum(item.protein)), color: colors.macro.protein },
                            { label: 'C', value: Math.round(finiteNum(item.carbs)), color: colors.macro.carbs },
                            { label: 'F', value: Math.round(finiteNum(item.fat)), color: colors.macro.fat },
                        ];
                        return (
                            <Animated.View
                                key={`${item.name ?? 'item'}-${i}`}
                                entering={FadeInDown.delay(120 + Math.min(i, 8) * 50).duration(380).springify().damping(16)}
                                style={{ marginBottom: 12 }}
                            >
                                <GlassCard radius={borderRadius.lg} testID="meal-item-row">
                                    <View style={styles.itemRow}>
                                        <View style={styles.itemMain}>
                                            <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: 'bold' }]} numberOfLines={2}>
                                                {item.name || 'Food item'}
                                            </Text>
                                            {qty > 0 ? (
                                                <Text style={[typography.caption, { color: colors.text.tertiary, marginTop: 2 }]}>
                                                    {qty % 1 === 0 ? qty : qty.toFixed(1)} × serving
                                                </Text>
                                            ) : null}
                                            <View style={styles.itemMacroRow}>
                                                {itemMacros.map((m) => (
                                                    <View key={m.label} style={[styles.itemMacroPill, { backgroundColor: withAlpha(m.color, 0.12) }]}>
                                                        <Text style={[typography.captionMedium, { color: m.color }]}>{m.value}g</Text>
                                                        <Text style={[typography.overline, { color: m.color, fontSize: 9, letterSpacing: 0.5, marginLeft: 3, opacity: 0.85 }]}>{m.label}</Text>
                                                    </View>
                                                ))}
                                            </View>
                                        </View>
                                        <View style={styles.itemCalCol}>
                                            <Text style={[typography.statTiny, { color: colors.text.primary }]}>{Math.round(finiteNum(item.calories))}</Text>
                                            <Text style={[typography.overline, { color: colors.text.tertiary, fontSize: 9 }]}>KCAL</Text>
                                        </View>
                                    </View>
                                </GlassCard>
                            </Animated.View>
                        );
                    })
                )}

                {/* ── Micronutrients — AGGREGATED across foodItems ─────────────────
                    Rendered ONLY when the meal carries any persisted micros; a
                    macro-only meal (no micros on any item) omits this section
                    entirely. Each present micro is a labeled summed value + unit. */}
                {micros.length > 0 ? (
                    <Animated.View entering={FadeInDown.delay(160).duration(420)}>
                        <Text style={[typography.heading, { color: colors.text.primary, marginTop: 28, marginBottom: 14 }]}>
                            Micronutrients
                        </Text>
                        <GlassCard radius={borderRadius.xl} testID="meal-micros-card">
                            <View style={styles.microCardInner}>
                                <Text style={[typography.caption, { color: colors.text.tertiary, marginBottom: 12 }]}>
                                    Totals for this meal
                                </Text>
                                <View style={styles.microGrid}>
                                    {micros.map((m) => (
                                        <View
                                            key={m.key}
                                            style={[styles.microCell, { backgroundColor: colors.background.tertiary, borderColor: colors.border.default }]}
                                            accessible
                                            accessibilityLabel={`${m.label} ${formatMicroValue(m.value)} ${m.unit}`}
                                        >
                                            <View style={styles.microValueRow}>
                                                <Text style={[typography.statTiny, { color: colors.text.primary }]}>{formatMicroValue(m.value)}</Text>
                                                <Text style={[typography.caption, { color: colors.text.tertiary, marginLeft: 2 }]}>{m.unit}</Text>
                                            </View>
                                            <Text style={[typography.caption, { color: colors.text.secondary }]} numberOfLines={1}>{m.label}</Text>
                                        </View>
                                    ))}
                                </View>
                            </View>
                        </GlassCard>
                    </Animated.View>
                ) : null}
            </ScrollView>
        </View>
    );
}

// Format an ISO timestamp as a short local time (e.g. "8:30 AM"). Tolerant of a
// bad/empty string → returns null so the time chip is simply omitted.
function formatTime(iso: string): string | null {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    let h = d.getHours();
    const m = d.getMinutes();
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    if (h === 0) h = 12;
    return `${h}:${String(m).padStart(2, '0')} ${ampm}`;
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1,
    },
    iconBtn: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    headerCard: { padding: 0, overflow: 'hidden' },
    headerCardInner: { padding: 20 },
    headerMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    timeRow: { flexDirection: 'row', alignItems: 'center' },
    calRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 8, marginBottom: 18 },
    ringsWrap: { marginTop: 4 },
    emptyItems: { flexDirection: 'row', alignItems: 'center', padding: 18 },
    itemRow: { flexDirection: 'row', alignItems: 'center', padding: 16 },
    itemMain: { flex: 1, marginRight: 12 },
    itemMacroRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
    itemMacroPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
    itemCalCol: { alignItems: 'center', minWidth: 48 },
    microCardInner: { padding: 16 },
    microGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    microCell: { width: '31%', borderRadius: 12, borderWidth: 1, paddingVertical: 10, paddingHorizontal: 10 },
    microValueRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 2 },
});
