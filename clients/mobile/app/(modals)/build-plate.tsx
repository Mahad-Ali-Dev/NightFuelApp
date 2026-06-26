import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Animated, {
    FadeInDown,
    FadeIn,
    Layout,
    useSharedValue,
    useAnimatedStyle,
    withSequence,
    withTiming,
    withDelay,
    runOnJS,
    Easing,
} from 'react-native-reanimated';
import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/utils';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Skeleton, EmptyState } from '@/components/ui';
import { BuildPlateRings } from '@/components/BuildPlateRings';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { searchFoods, logMeal } from '@/api/meals';
import { invalidateMealAndProgress } from '@/utils/invalidateMealAndProgress';

const MEAL_TYPES = [
    { key: 'BREAKFAST', label: 'Breakfast', icon: 'cafe-outline' },
    { key: 'LUNCH',     label: 'Lunch',     icon: 'restaurant-outline' },
    { key: 'DINNER',    label: 'Dinner',    icon: 'moon-outline' },
    { key: 'SNACK',     label: 'Snack',     icon: 'nutrition-outline' },
] as const;

type MealType = typeof MEAL_TYPES[number]['key'];

export default function BuildPlateScreen() {
    const { colors, typography, spacing, shadows } = useTheme();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const queryClient = useQueryClient();

    const [plate, setPlate] = useState<any[]>([]);
    const [mealType, setMealType] = useState<MealType>('BREAKFAST');
    // Peak-end: brief rewarding "saved" confirmation (check + glow) before the
    // sheet dismisses. Purely presentational — the data invalidation + navigation
    // below are unchanged; this only delays router.back() by one satisfying beat.
    const [saved, setSaved] = useState(false);
    const successScale = useSharedValue(0.6);
    const successOpacity = useSharedValue(0);

    const { data: foodItems = [], isLoading: foodsLoading, isError: foodsError, refetch: refetchFoods } = useQuery({
        queryKey: ['foods-quick-add'],
        queryFn: () => searchFoods({ q: 'chicken rice broccoli', limit: 10 }),
        staleTime: 5 * 60 * 1000,
    });

    const saveMutation = useMutation({
        mutationFn: () => logMeal({
            mealType,
            foodItems: plate.map(item => ({
                foodId:   item.id ?? '',
                name:     item.name,
                quantity: 1,
                calories: item.calories ?? 0,
                protein:  item.protein  ?? item.macros?.pro  ?? 0,
                carbs:    item.carbs    ?? item.macros?.carb ?? 0,
                fat:      item.fat      ?? item.macros?.fat  ?? 0,
            })),
        }),
        onSuccess: () => {
            // Route through the shared helper so a plate logged here refreshes
            // BOTH calorie rings — the dashboard's ['today-progress'] AND the
            // Nutrition tab's ['daily-progress'] — not just the dashboard.
            invalidateMealAndProgress(queryClient);
            // Peak-end beat: pop a check + glow, then dismiss. router.back() still
            // fires (now on the UI thread via runOnJS) so behavior is preserved.
            setSaved(true);
            successOpacity.value = withTiming(1, { duration: 180 });
            successScale.value = withSequence(
                withTiming(1.08, { duration: 240, easing: Easing.out(Easing.back(2)) }),
                withTiming(1, { duration: 140 }),
                withDelay(160, withTiming(1, { duration: 0 }, (finished) => {
                    'worklet';
                    if (finished) runOnJS(router.back)();
                })),
            );
        },
        onError: (err: any) => {
            Alert.alert('Error', err?.response?.data?.message ?? err?.message ?? 'Failed to save meal');
        },
    });

    const successAnimStyle = useAnimatedStyle(() => ({
        opacity: successOpacity.value,
        transform: [{ scale: successScale.value }],
    }));

    const addToPlate = (item: any) => {
        setPlate(prev => [...prev, { ...item, macros: { pro: item.protein, carb: item.carbs, fat: item.fat } }]);
    };

    const removeFromPlate = (index: number) => {
        setPlate(prev => prev.filter((_, i) => i !== index));
    };

    const totals = plate.reduce((acc, curr) => ({
        kcal: acc.kcal + (curr.calories ?? 0),
        pro: acc.pro + (curr.macros?.pro ?? 0),
        carb: acc.carb + (curr.macros?.carb ?? 0),
        fat: acc.fat + (curr.macros?.fat ?? 0),
    }), { kcal: 0, pro: 0, carb: 0, fat: 0 });

    const hasItems = plate.length > 0;

    return (
        <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background.primary }]}>
            <StatusBar style="light" />

            {/* Drag-handle dismiss affordance — this is a sheet */}
            <View style={styles.handleWrap}>
                <View style={[styles.handle, { backgroundColor: colors.border.light }]} />
            </View>

            {/* Header */}
            <View style={styles.header}>
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Close"
                    onPress={() => router.back()}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    style={({ pressed }) => [
                        styles.headerBtn,
                        { backgroundColor: colors.background.secondary, borderColor: colors.border.default },
                        pressed && styles.pressedScale,
                    ]}
                >
                    <Ionicons name="close" size={22} color={colors.text.primary} />
                </Pressable>
                <View style={styles.headerTitleWrap}>
                    <Text style={[typography.overline, { color: colors.text.tertiary }]}>BUILD A PLATE</Text>
                    <Text style={[typography.h2, { color: colors.text.primary }]}>Your Meal</Text>
                </View>
                {/* Two scan entries: a photo "scan a plate" (AI estimate) beside the
                    barcode scan. Photo uses the lime brand accent, barcode keeps cyan. */}
                <View style={styles.headerActions}>
                    <Pressable
                        hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
                        accessibilityRole="button"
                        accessibilityLabel="Scan a plate with a photo"
                        onPress={() => router.push('/(modals)/food-photo' as any)}
                        style={({ pressed }) => [
                            styles.headerBtn,
                            { backgroundColor: withAlpha(colors.accent.coral, 0.12), borderColor: withAlpha(colors.accent.coral, 0.3) },
                            pressed && styles.pressedScale,
                        ]}
                    >
                        <Ionicons name="camera-outline" size={22} color={colors.accent.coral} />
                    </Pressable>
                    <Pressable
                        hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
                        accessibilityRole="button"
                        accessibilityLabel="Scan barcode"
                        onPress={() => router.push('/(modals)/barcode-scanner' as any)}
                        style={({ pressed }) => [
                            styles.headerBtn,
                            { backgroundColor: withAlpha(colors.accent.cyan, 0.12), borderColor: withAlpha(colors.accent.cyan, 0.3) },
                            pressed && styles.pressedScale,
                        ]}
                    >
                        <Ionicons name="scan-outline" size={22} color={colors.accent.cyan} />
                    </Pressable>
                </View>
            </View>

            <ScrollView contentContainerStyle={{ paddingBottom: 130 }} showsVerticalScrollIndicator={false}>
                {/* Meal Type Picker */}
                <Animated.View entering={FadeInDown.duration(360).delay(40)}>
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.mealTypesRow}
                    >
                        {MEAL_TYPES.map(mt => {
                            const selected = mealType === mt.key;
                            return (
                                <Pressable
                                    key={mt.key}
                                    accessibilityRole="button"
                                    accessibilityLabel={mt.label}
                                    accessibilityState={{ selected }}
                                    hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                                    style={({ pressed }) => [styles.mealTypeChip, {
                                        backgroundColor: selected ? withAlpha(colors.accent.coral, 0.16) : colors.background.secondary,
                                        borderColor:     selected ? colors.accent.coral : colors.border.default,
                                    }, pressed && styles.pressedScale]}
                                    onPress={() => setMealType(mt.key)}
                                >
                                    <Ionicons
                                        name={mt.icon as any}
                                        size={17}
                                        color={selected ? colors.accent.coral : colors.text.tertiary}
                                    />
                                    <Text style={[typography.captionMedium, {
                                        color:      selected ? colors.accent.coral : colors.text.secondary,
                                    }]}>
                                        {mt.label}
                                    </Text>
                                </Pressable>
                            );
                        })}
                    </ScrollView>
                </Animated.View>

                {/* Macro rings hero — running totals */}
                <Animated.View entering={FadeInDown.duration(420).delay(90)} style={styles.heroSection}>
                    <BuildPlateRings totals={totals} hasItems={hasItems} />
                    {!hasItems && (
                        <Text style={[typography.body, styles.heroHint, { color: colors.text.tertiary }]}>
                            Tap foods below to build your plate and watch the rings fill.
                        </Text>
                    )}
                </Animated.View>

                <View style={{ paddingHorizontal: spacing.xl }}>
                    {/* Quick Add */}
                    <Animated.View entering={FadeInDown.duration(360).delay(140)} style={styles.sectionHeader}>
                        <Text style={[typography.h3, { color: colors.text.primary }]}>Quick Add</Text>
                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Search foods by scanning a barcode"
                            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                            onPress={() => router.push('/(modals)/barcode-scanner' as any)}
                            style={({ pressed }) => [
                                styles.searchAffordance,
                                { backgroundColor: colors.background.secondary, borderColor: colors.border.default },
                                pressed && styles.pressedScale,
                            ]}
                        >
                            <Ionicons name="search" size={16} color={colors.text.secondary} />
                        </Pressable>
                    </Animated.View>

                    {foodsLoading ? (
                        Array.from({ length: 4 }).map((_, i) => (
                            <Card key={`food-skeleton-${i}`} variant="glass" style={styles.foodRow}>
                                <Skeleton width={40} height={40} radius={10} />
                                <View style={[styles.foodInfo, { marginLeft: spacing.md }]}>
                                    <Skeleton width="55%" height={15} />
                                    <Skeleton width="80%" height={12} style={{ marginTop: 6 }} />
                                </View>
                                <Skeleton width={24} height={24} radius={12} />
                            </Card>
                        ))
                    ) : foodsError ? (
                        <EmptyState
                            icon="cloud-offline-outline"
                            title="Couldn't load foods"
                            subtitle="Check your connection and try again."
                            actionLabel="Retry"
                            onAction={() => refetchFoods()}
                        />
                    ) : foodItems.length === 0 ? (
                        <EmptyState
                            icon="fast-food-outline"
                            title="No quick-add foods"
                            subtitle="Scan a barcode to add a food to your plate."
                            actionLabel="Scan barcode"
                            onAction={() => router.push('/(modals)/barcode-scanner' as any)}
                        />
                    ) : foodItems.map((item, i) => (
                        <Animated.View key={item.id} entering={FadeInDown.duration(320).delay(160 + i * 40)}>
                            <Pressable
                                accessibilityRole="button"
                                accessibilityLabel={`Add ${item.name} to plate`}
                                onPress={() => addToPlate(item)}
                                style={({ pressed }) => [pressed && styles.pressedScale]}
                            >
                                <Card variant="glass" style={styles.foodRow}>
                                    <View style={[styles.iconBox, { backgroundColor: colors.background.tertiary }]}>
                                        <Ionicons name="fast-food" size={20} color={colors.text.secondary} />
                                    </View>
                                    <View style={styles.foodInfo}>
                                        <Text style={[typography.subhead, { color: colors.text.primary }]} numberOfLines={1}>{item.name}</Text>
                                        <View style={styles.foodMacroLine}>
                                            <Text style={[typography.statSmall, { color: colors.text.primary, fontSize: 18, lineHeight: 22 }]}>
                                                {item.calories}
                                                <Text style={[typography.caption, { color: colors.text.tertiary }]}> kcal</Text>
                                            </Text>
                                            <Text style={[typography.caption, { color: colors.text.tertiary }]}>
                                                {item.protein}P · {item.carbs}C · {item.fat}F
                                            </Text>
                                        </View>
                                    </View>
                                    <Ionicons name="add-circle" size={26} color={colors.text.tertiary} />
                                </Card>
                            </Pressable>
                        </Animated.View>
                    ))}

                    {/* Current Plate */}
                    {hasItems && (
                        <Animated.View entering={FadeIn.duration(300)} style={{ marginTop: spacing['2xl'] }}>
                            <View style={styles.plateHeader}>
                                <Text style={[typography.h3, { color: colors.text.primary }]}>On Your Plate</Text>
                                <View style={[styles.countPill, { backgroundColor: colors.background.tertiary }]}>
                                    <Text style={[typography.overline, { color: colors.text.secondary }]}>{plate.length}</Text>
                                </View>
                            </View>

                            {plate.map((item, index) => (
                                <Animated.View
                                    key={index}
                                    entering={FadeInDown.duration(260)}
                                    layout={Layout.springify()}
                                    style={[styles.plateItemRow, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}
                                >
                                    <View style={[styles.plateDot, { backgroundColor: withAlpha(colors.text.tertiary, 0.5) }]} />
                                    <View style={styles.plateItemInfo}>
                                        <Text style={[typography.bodyMedium, { color: colors.text.primary }]} numberOfLines={1}>{item.name}</Text>
                                        <Text style={[typography.caption, { color: colors.text.tertiary, marginTop: 2 }]}>
                                            {Math.round(item.calories ?? 0)} kcal
                                        </Text>
                                    </View>
                                    <Pressable
                                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                        accessibilityRole="button"
                                        accessibilityLabel="Delete"
                                        onPress={() => removeFromPlate(index)}
                                        style={({ pressed }) => [
                                            styles.removeBtn,
                                            { backgroundColor: withAlpha(colors.accent.red, 0.10) },
                                            pressed && styles.pressedScale,
                                        ]}
                                    >
                                        <Ionicons name="trash-outline" size={18} color={colors.accent.red} />
                                    </Pressable>
                                </Animated.View>
                            ))}
                        </Animated.View>
                    )}
                </View>
            </ScrollView>

            {/* Thumb-zone CTA */}
            <View style={[styles.footer, { paddingHorizontal: spacing.xl, paddingBottom: Math.max(insets.bottom, 16), borderTopColor: colors.border.default, backgroundColor: colors.background.primary }]}>
                {hasItems && (
                    <View style={styles.footerSummary}>
                        <Text style={[typography.caption, { color: colors.text.tertiary }]}>TOTAL</Text>
                        <Text style={[typography.subhead, { color: colors.text.primary }]}>
                            {Math.round(totals.kcal)} kcal · {plate.length} {plate.length === 1 ? 'item' : 'items'}
                        </Text>
                    </View>
                )}
                <Button
                    title={saveMutation.isPending ? 'Saving…' : 'Save Meal'}
                    disabled={plate.length === 0 || saveMutation.isPending}
                    onPress={() => saveMutation.mutate()}
                    fullWidth
                />
            </View>

            {/* Peak-end: rewarding "Saved" confirmation, briefly, before dismiss */}
            {saved && (
                <View style={styles.successOverlay} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                    <Animated.View
                        style={[
                            styles.successBadge,
                            { backgroundColor: withAlpha(colors.accent.coral, 0.16), borderColor: withAlpha(colors.accent.coral, 0.4) },
                            shadows.glow(colors.accent.coral),
                            successAnimStyle,
                        ]}
                    >
                        <Ionicons name="checkmark" size={44} color={colors.accent.coral} />
                    </Animated.View>
                    <Animated.Text entering={FadeIn.delay(120)} style={[typography.subhead, styles.successLabel, { color: colors.text.primary }]}>
                        Meal saved
                    </Animated.Text>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    // Shared pressed feedback — transform-only, interruptible (brief: ~0.96).
    pressedScale: {
        transform: [{ scale: 0.96 }],
        opacity: 0.92,
    },
    handleWrap: {
        alignItems: 'center',
        paddingTop: 8,
        paddingBottom: 4,
    },
    handle: {
        width: 40,
        height: 5,
        borderRadius: 3,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: 8,
        paddingBottom: 16,
    },
    headerActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    headerBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitleWrap: {
        flex: 1,
        alignItems: 'center',
    },
    mealTypesRow: {
        paddingHorizontal: 20,
        paddingVertical: 4,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    mealTypeChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 16,
        paddingVertical: 9,
        minHeight: 44, // a11y: 44pt minimum touch target for the segmented selector
        borderRadius: 22,
        borderWidth: 1,
    },
    heroSection: {
        alignItems: 'center',
        paddingTop: 20,
        paddingBottom: 24,
        paddingHorizontal: 20,
    },
    heroHint: {
        textAlign: 'center',
        marginTop: 18,
        maxWidth: 260,
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 14,
        marginTop: 4,
    },
    searchAffordance: {
        width: 36,
        height: 36,
        borderRadius: 18,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    foodRow: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        marginBottom: 10,
    },
    iconBox: {
        width: 40,
        height: 40,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    foodInfo: {
        flex: 1,
    },
    foodMacroLine: {
        marginTop: 2,
    },
    plateHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginBottom: 12,
    },
    countPill: {
        minWidth: 24,
        height: 22,
        paddingHorizontal: 8,
        borderRadius: 11,
        alignItems: 'center',
        justifyContent: 'center',
    },
    plateItemRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderRadius: 14,
        borderWidth: 1,
        marginBottom: 8,
    },
    plateDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        marginRight: 12,
    },
    plateItemInfo: {
        flex: 1,
    },
    removeBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    footer: {
        paddingTop: 14,
        borderTopWidth: 1,
    },
    footerSummary: {
        flexDirection: 'row',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    successOverlay: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(10,12,18,0.6)',
    },
    successBadge: {
        width: 96,
        height: 96,
        borderRadius: 48,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    successLabel: {
        marginTop: 16,
    },
});
