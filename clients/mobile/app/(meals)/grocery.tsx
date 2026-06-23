import React, { useState, useEffect, useMemo } from 'react';
import {
    Alert, View, Text, StyleSheet, ScrollView, TouchableOpacity,
    Modal, TextInput, KeyboardAvoidingView, Share, Pressable
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { getGroceryList } from '@/api/meals';
import { LinearGradient } from 'expo-linear-gradient';
import { shadows } from '@/theme/shadows';
import { Skeleton, EmptyState, CtaButton, GlassCard } from '@/components/ui';
import { withAlpha } from '@/theme/utils';
import { CountUpText } from '@/components/CountUpText';
import { AnimatedRing } from '@/components/AnimatedRing';
import { GroceryItemRow } from '@/components/GroceryItemRow';
import Animated, { FadeInDown, useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const STORAGE_KEY = '@nightfuel_weekly_grocery';

// ── Types ────────────────────────────────────────────────────────────────────
interface CustomGroceryItem {
    id: string;
    name: string;
    quantity: string;
    category: string;
    checked: boolean;
    addedAt: string;
}

const CATEGORIES = [
    'Fruits & Vegetables',
    'Dairy & Eggs',
    'Meat & Seafood',
    'Grains & Bread',
    'Snacks & Beverages',
    'Pantry Staples',
    'Other',
];

// Per-aisle icon + accent so each category section reads as a distinct shelf.
// Falls back to the generic basket / cyan for anything off the known list
// (incl. the backend "Weekly Plan Items" group).
const AISLE_META: Record<string, { icon: keyof typeof Ionicons.glyphMap; tint: string }> = {
    'Fruits & Vegetables': { icon: 'leaf', tint: '#10B981' },
    'Dairy & Eggs': { icon: 'egg', tint: '#FFB300' },
    'Meat & Seafood': { icon: 'fish', tint: '#FF6B6B' },
    'Grains & Bread': { icon: 'pizza', tint: '#F97316' },
    'Snacks & Beverages': { icon: 'cafe', tint: '#7C4DFF' },
    'Pantry Staples': { icon: 'file-tray-stacked', tint: '#4FC3F7' },
    'Other': { icon: 'basket', tint: '#00D4AA' },
};

export default function GroceryListScreen() {
    const { colors, typography, borderRadius } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();

    // FAB pressed-scale (transform-only, interruptible spring back)
    const fabScale = useSharedValue(1);
    const fabAnimStyle = useAnimatedStyle(() => ({ transform: [{ scale: fabScale.value }] }));

    // ── Backend grocery items ────────────────────────────────────────────────
    const groceryQuery = useQuery({
        queryKey: ['grocery-list'],
        queryFn: () => getGroceryList(),
    });

    // ── Local grocery items (AsyncStorage) ───────────────────────────────────
    const [customItems, setCustomItems] = useState<CustomGroceryItem[]>([]);
    const [showAddModal, setShowAddModal] = useState(false);
    const [itemName, setItemName] = useState('');
    const [itemQty, setItemQty] = useState('');
    const [itemCategory, setItemCategory] = useState('Other');
    const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});

    // Load saved items on mount
    useEffect(() => {
        loadItems();
    }, []);

    const loadItems = async () => {
        try {
            const stored = await AsyncStorage.getItem(STORAGE_KEY);
            if (stored) {
                const items: CustomGroceryItem[] = JSON.parse(stored);
                setCustomItems(items);
                // Restore checked state
                const checked: Record<string, boolean> = {};
                items.forEach(i => { if (i.checked) checked[i.id] = true; });
                setCheckedItems(prev => ({ ...prev, ...checked }));
            }
        } catch (e) {
            console.error('Failed to load grocery items:', e);
        }
    };

    const saveItems = async (items: CustomGroceryItem[]) => {
        try {
            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
        } catch (e) {
            console.error('Failed to save grocery items:', e);
        }
    };

    const handleAddItem = () => {
        if (!itemName.trim()) {
            Alert.alert('Missing Name', 'Please enter a grocery item name.');
            return;
        }

        const newItem: CustomGroceryItem = {
            id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            name: itemName.trim(),
            quantity: itemQty.trim() || '1',
            category: itemCategory,
            checked: false,
            addedAt: new Date().toISOString(),
        };

        const updated = [newItem, ...customItems];
        setCustomItems(updated);
        saveItems(updated);

        // Reset form
        setItemName('');
        setItemQty('');
        setItemCategory('Other');
        setShowAddModal(false);
    };

    // Guard accidental scrim-dismiss when the user has unsaved input in the
    // Add-Item sheet — confirm before throwing typed text away.
    const requestCloseModal = () => {
        if (itemName.trim() || itemQty.trim()) {
            Alert.alert('Discard item?', 'You have unsaved changes. Discard this grocery item?', [
                { text: 'Keep Editing', style: 'cancel' },
                { text: 'Discard', style: 'destructive', onPress: () => setShowAddModal(false) },
            ]);
            return;
        }
        setShowAddModal(false);
    };

    const toggleCustomItem = (id: string) => {
        const updated = customItems.map(i =>
            i.id === id ? { ...i, checked: !i.checked } : i
        );
        setCustomItems(updated);
        saveItems(updated);
        setCheckedItems(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const removeItem = (id: string) => {
        Alert.alert('Remove Item', 'Remove this item from your grocery list?', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Remove', style: 'destructive', onPress: () => {
                    const updated = customItems.filter(i => i.id !== id);
                    setCustomItems(updated);
                    saveItems(updated);
                }
            },
        ]);
    };

    const clearChecked = () => {
        Alert.alert('Clear Checked', 'Remove all checked items from your list?', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Clear', style: 'destructive', onPress: () => {
                    const updated = customItems.filter(i => !i.checked);
                    setCustomItems(updated);
                    saveItems(updated);
                    setCheckedItems({});
                }
            },
        ]);
    };

    const togglePlanItem = (category: string, itemName: string) => {
        const key = `plan-${category}-${itemName}`;
        setCheckedItems(prev => ({ ...prev, [key]: !prev[key] }));
    };

    // ── Group custom items by category ──────────────────────────────────────
    const groupedCustom = useMemo(() => customItems.reduce<Record<string, CustomGroceryItem[]>>((acc, item) => {
        if (!acc[item.category]) acc[item.category] = [];
        acc[item.category]!.push(item);
        return acc;
    }, {}), [customItems]);

    // ── Backend data ────────────────────────────────────────────────────────
    const rawData = groceryQuery.data as any;
    const planItems = rawData?.list ?? [];

    const hasAnyItems = customItems.length > 0 || planItems.length > 0;
    const checkedCount = customItems.filter(i => i.checked).length;

    // ── Hero progress (custom + backend plan items combined) ─────────────────
    const planCheckedCount = useMemo(
        () => planItems.filter((it: any) => checkedItems[`plan-Weekly Plan Items-${it.name}`]).length,
        [planItems, checkedItems]
    );
    const totalItems = customItems.length + planItems.length;
    const totalChecked = checkedCount + planCheckedCount;
    const remaining = Math.max(0, totalItems - totalChecked);
    const progress = totalItems > 0 ? totalChecked / totalItems : 0;
    const allDone = totalItems > 0 && totalChecked === totalItems;
    const aisleCount = Object.keys(groupedCustom).length + (planItems.length > 0 ? 1 : 0);
    // Ring + hero glyph go cyan (success) the moment everything's collected.
    const heroAccent = allDone ? colors.accent.cyan : colors.accent.coral;

    // A 400 from the grocery endpoint means "no active nutrition plan" — that's
    // an expected empty state, not a connection failure. Any other status is a
    // genuine error and keeps the connection-error messaging below.
    const isNoPlanError = (groceryQuery.error as any)?.response?.status === 400;

    const handleShare = async () => {
        const lines: string[] = ['🛒 Grocery List — Zeitra', ''];

        // Custom items grouped by category (matches the on-screen grouping)
        Object.keys(groupedCustom).forEach((category) => {
            lines.push(category.toUpperCase());
            groupedCustom[category]!.forEach((item) => {
                lines.push(`• ${item.name} (Qty: ${item.quantity})`);
            });
            lines.push('');
        });

        // Backend weekly plan items
        if (planItems.length > 0) {
            lines.push('WEEKLY PLAN ITEMS');
            planItems.forEach((item: any) => {
                const amount = item.amount ? ` (${item.amount} ${item.unit || ''})`.trimEnd() : '';
                lines.push(`• ${item.name}${amount}`);
            });
            lines.push('');
        }

        try {
            await Share.share({ message: lines.join('\n').trim() });
        } catch {
            // User dismissed the share sheet or it's unavailable — nothing to do.
        }
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
            <StatusBar style="light" />
            {/* Header */}
            <View style={[styles.header, { paddingTop: insets.top + 20, borderBottomColor: colors.border.default }]}>
                <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={[styles.iconBtn, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
                    <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
                </TouchableOpacity>
                <Text style={[typography.h2, { color: colors.text.primary }]}>Grocery List</Text>
                <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel={checkedCount > 0 ? 'Clear checked items' : 'Share grocery list'} style={styles.backBtn} onPress={() => {
                    if (checkedCount > 0) {
                        clearChecked();
                    } else {
                        handleShare();
                    }
                }}>
                    {checkedCount > 0 ? (
                        <Ionicons name="trash-outline" size={22} color={colors.accent.red} />
                    ) : (
                        <Ionicons name="share-outline" size={24} color={colors.text.primary} />
                    )}
                </TouchableOpacity>
            </View>

            <View style={{ flex: 1 }}>
                {groceryQuery.isLoading ? (
                    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 120 }} showsVerticalScrollIndicator={false}>
                        <Skeleton width="100%" height={140} radius={borderRadius.xl} style={{ marginBottom: 24 }} />
                        {[0, 1].map((section) => (
                            <View key={section} style={styles.categorySection}>
                                <Skeleton width={140} height={12} radius={borderRadius.sm} style={{ marginBottom: 12 }} />
                                <Skeleton width="100%" height={170} radius={borderRadius.xl} />
                            </View>
                        ))}
                    </ScrollView>
                ) : groceryQuery.isError && isNoPlanError && !hasAnyItems ? (
                    <EmptyState
                        icon="cart-outline"
                        title="No grocery list yet"
                        subtitle="Generate a nutrition plan first and your weekly grocery items will show up here."
                        actionLabel="Add Item"
                        onAction={() => setShowAddModal(true)}
                    />
                ) : groceryQuery.isError && !hasAnyItems ? (
                    <EmptyState
                        icon="cloud-offline-outline"
                        title="Couldn't load your list"
                        subtitle="Something went wrong fetching your grocery items. Check your connection and try again."
                        actionLabel="Try Again"
                        onAction={() => groceryQuery.refetch()}
                    />
                ) : !hasAnyItems ? (
                    <EmptyState
                        icon="cart-outline"
                        title="List is empty"
                        subtitle="Add your weekly grocery items and check them off as you shop."
                        actionLabel="Add Item"
                        onAction={() => setShowAddModal(true)}
                    />
                ) : (
                    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 120 }} showsVerticalScrollIndicator={false}>
                        {/* ── Progress hero — ring + count-up + stat pills ─────────── */}
                        <Animated.View entering={FadeInDown.springify().damping(18).mass(0.7)}>
                            <GlassCard radius={borderRadius.xl} glow={allDone ? colors.accent.cyan : undefined} style={{ marginBottom: 24 }}>
                                <View style={styles.heroInner}>
                                    {/* Ring with checked / total in the middle */}
                                    <AnimatedRing
                                        size={108}
                                        strokeWidth={10}
                                        progress={progress}
                                        color={heroAccent}
                                        trackColor={withAlpha(colors.text.primary, 0.08)}
                                    >
                                        <View style={styles.ringCenter}>
                                            <CountUpText
                                                value={totalChecked}
                                                duration={650}
                                                accessibilityLabel={`${totalChecked} of ${totalItems} collected`}
                                                style={[typography.statMedium, { color: colors.text.primary }]}
                                            />
                                            <Text style={[typography.statSmall, { color: colors.text.tertiary, marginTop: -2 }]}>
                                                / {totalItems}
                                            </Text>
                                        </View>
                                    </AnimatedRing>

                                    {/* Right column — headline + progress label + stat pills */}
                                    <View style={styles.heroRight}>
                                        <Text style={[typography.overline, { color: heroAccent }]}>
                                            {allDone ? 'ALL COLLECTED' : 'SHOPPING PROGRESS'}
                                        </Text>
                                        <View style={styles.heroBigRow}>
                                            <CountUpText
                                                value={allDone ? totalItems : remaining}
                                                duration={650}
                                                accessibilityLabel={allDone ? `${totalItems} items collected` : `${remaining} items left`}
                                                style={[typography.statLarge, { color: colors.text.primary }]}
                                            />
                                            <Text style={[typography.subtitle, { color: colors.text.secondary, marginLeft: 8, marginBottom: 6 }]}>
                                                {allDone ? 'done' : 'left'}
                                            </Text>
                                        </View>
                                    </View>
                                </View>

                                {/* Stat pills */}
                                <View style={[styles.pillRow, { borderTopColor: colors.border.default }]}>
                                    <StatPill icon="basket" tint={colors.accent.cyan} value={totalItems} label="Items" colors={colors} typography={typography} />
                                    <View style={[styles.pillDivider, { backgroundColor: colors.border.default }]} />
                                    <StatPill icon="checkmark-done" tint={colors.accent.coral} value={totalChecked} label="Done" colors={colors} typography={typography} />
                                    <View style={[styles.pillDivider, { backgroundColor: colors.border.default }]} />
                                    <StatPill icon="layers" tint={colors.accent.amber} value={aisleCount} label="Aisles" colors={colors} typography={typography} />
                                </View>
                            </GlassCard>
                        </Animated.View>

                        {/* Custom items grouped by category */}
                        {Object.keys(groupedCustom).map((category, ci) => {
                            const items = groupedCustom[category]!;
                            const aisle = AISLE_META[category] ?? { icon: 'basket' as const, tint: colors.accent.cyan };
                            const done = items.filter((it) => it.checked).length;
                            return (
                                <Animated.View
                                    key={category}
                                    entering={FadeInDown.delay(120 + ci * 50).springify().damping(18).mass(0.7)}
                                    style={styles.categorySection}
                                >
                                    <CategoryHeader icon={aisle.icon} tint={aisle.tint} title={category} done={done} total={items.length} colors={colors} typography={typography} />
                                    <GlassCard radius={borderRadius.xl} intensity={28}>
                                        {items.map((item, i) => (
                                            <GroceryItemRow
                                                key={item.id}
                                                name={item.name}
                                                meta={`Qty: ${item.quantity}`}
                                                checked={item.checked}
                                                onToggle={() => toggleCustomItem(item.id)}
                                                onRemove={() => removeItem(item.id)}
                                                showDivider={i !== items.length - 1}
                                            />
                                        ))}
                                    </GlassCard>
                                </Animated.View>
                            );
                        })}

                        {/* Backend plan items */}
                        {planItems.length > 0 && (
                            <Animated.View
                                entering={FadeInDown.delay(120 + Object.keys(groupedCustom).length * 50).springify().damping(18).mass(0.7)}
                                style={styles.categorySection}
                            >
                                <CategoryHeader icon="sparkles" tint={colors.accent.purple} title="Weekly Plan Items" done={planCheckedCount} total={planItems.length} colors={colors} typography={typography} />
                                <GlassCard radius={borderRadius.xl} intensity={28}>
                                    {planItems.map((item: any, i: number) => {
                                        const key = `plan-Weekly Plan Items-${item.name}`;
                                        const isChecked = !!checkedItems[key];
                                        return (
                                            <GroceryItemRow
                                                key={i}
                                                name={item.name}
                                                meta={item.amount ? `${item.amount} ${item.unit || ''}`.trim() : undefined}
                                                checked={isChecked}
                                                onToggle={() => togglePlanItem('Weekly Plan Items', item.name)}
                                                showDivider={i !== planItems.length - 1}
                                            />
                                        );
                                    })}
                                </GlassCard>
                            </Animated.View>
                        )}
                    </ScrollView>
                )}
            </View>

            {/* Floating Action Button */}
            <AnimatedPressable hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Add"
                style={[styles.fab, { bottom: insets.bottom + 20 }, shadows.glow(colors.accent.coral), fabAnimStyle]}
                onPress={() => setShowAddModal(true)}
                onPressIn={() => { fabScale.value = withSpring(0.96, { damping: 15, mass: 0.6 }); }}
                onPressOut={() => { fabScale.value = withSpring(1, { damping: 15, mass: 0.6 }); }}
            >
                <LinearGradient colors={colors.gradients.coral} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fabGradient}>
                    <Ionicons name="add" size={32} color={colors.text.inverse} />
                </LinearGradient>
            </AnimatedPressable>

            {/* ── Add Item Modal ──────────────────────────────────────────────── */}
            <Modal visible={showAddModal} transparent animationType="slide">
                <KeyboardAvoidingView
                    behavior="padding"
                    style={styles.modalOverlay}
                >
                    <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={requestCloseModal}>
                        <TouchableOpacity activeOpacity={1} onPress={() => { /* prevent close */ }}>
                            <GlassCard radius={24} style={{ borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}>
                              <View style={styles.modalContent}>
                                {/* Modal Header */}
                                <View style={styles.modalHeader}>
                                    <Text style={[typography.h3, { color: colors.text.primary }]}>
                                        Add Grocery Item
                                    </Text>
                                    <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Close" onPress={() => setShowAddModal(false)} style={[styles.modalClose, { backgroundColor: colors.background.tertiary, borderColor: colors.border.default }]}>
                                        <Ionicons name="close" size={20} color={colors.text.secondary} />
                                    </TouchableOpacity>
                                </View>

                                {/* Item Name */}
                                <Text style={[typography.overline, { color: colors.text.secondary, marginBottom: 8, marginTop: 20 }]}>
                                    ITEM NAME *
                                </Text>
                                <TextInput
                                    style={[styles.input, { backgroundColor: colors.background.primary, borderColor: colors.border.default, color: colors.text.primary }]}
                                    placeholder="e.g. Chicken Breast, Milk, Rice..."
                                    placeholderTextColor={colors.text.tertiary}
                                    value={itemName}
                                    onChangeText={setItemName}
                                    autoFocus
                                />

                                {/* Quantity */}
                                <Text style={[typography.overline, { color: colors.text.secondary, marginBottom: 8, marginTop: 16 }]}>
                                    QUANTITY
                                </Text>
                                <TextInput
                                    style={[styles.input, { backgroundColor: colors.background.primary, borderColor: colors.border.default, color: colors.text.primary }]}
                                    placeholder="e.g. 2 kg, 1 pack, 500g..."
                                    placeholderTextColor={colors.text.tertiary}
                                    value={itemQty}
                                    onChangeText={setItemQty}
                                />

                                {/* Category */}
                                <Text style={[typography.overline, { color: colors.text.secondary, marginBottom: 8, marginTop: 16 }]}>
                                    CATEGORY
                                </Text>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 24 }}>
                                    {CATEGORIES.map((cat) => (
                                        <TouchableOpacity
                                            key={cat}
                                            activeOpacity={0.85}
                                            accessibilityRole="button"
                                            accessibilityState={{ selected: itemCategory === cat }}
                                            accessibilityLabel={cat}
                                            style={[
                                                styles.categoryChip,
                                                {
                                                    backgroundColor: itemCategory === cat ? colors.accent.coral : colors.background.primary,
                                                    borderColor: itemCategory === cat ? colors.accent.coral : colors.border.default,
                                                }
                                            ]}
                                            onPress={() => setItemCategory(cat)}
                                        >
                                            <Text style={[typography.caption, {
                                                color: itemCategory === cat ? colors.text.inverse : colors.text.secondary,
                                                fontWeight: itemCategory === cat ? 'bold' : 'normal',
                                            }]}>
                                                {cat}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>

                                {/* Add Button */}
                                <CtaButton
                                    label="ADD TO LIST"
                                    icon="add-circle"
                                    size="lg"
                                    accessibilityLabel="Add to list"
                                    onPress={handleAddItem}
                                    style={styles.addButtonWrap}
                                />
                              </View>
                            </GlassCard>
                        </TouchableOpacity>
                    </TouchableOpacity>
                </KeyboardAvoidingView>
            </Modal>
        </View>
    );
}

// ── Local presentational helpers ─────────────────────────────────────────────

/** A tinted-icon stat pill for the hero (icon chip + big tabular value + label). */
function StatPill({ icon, tint, value, label, colors, typography }: {
    icon: keyof typeof Ionicons.glyphMap; tint: string; value: number; label: string;
    colors: any; typography: any;
}) {
    return (
        <View style={styles.pill}>
            <View style={[styles.pillIcon, { backgroundColor: withAlpha(tint, 0.16) }]}>
                <Ionicons name={icon} size={15} color={tint} />
            </View>
            <Text style={[typography.statSmall, { color: colors.text.primary, marginTop: 6 }]}>{value}</Text>
            <Text style={[typography.caption, { color: colors.text.tertiary }]}>{label}</Text>
        </View>
    );
}

/** Section header: tinted aisle chip + title + a "done / total" count badge. */
function CategoryHeader({ icon, tint, title, done, total, colors, typography }: {
    icon: keyof typeof Ionicons.glyphMap; tint: string; title: string; done: number; total: number;
    colors: any; typography: any;
}) {
    const complete = total > 0 && done === total;
    return (
        <View style={styles.catHeader}>
            <View style={[styles.catIcon, { backgroundColor: withAlpha(tint, 0.16), borderColor: withAlpha(tint, 0.3) }]}>
                <Ionicons name={icon} size={16} color={tint} />
            </View>
            <Text style={[typography.overline, { color: colors.text.secondary, flex: 1, marginLeft: 10 }]} numberOfLines={1}>
                {title.toUpperCase()}
            </Text>
            <View style={[styles.catCount, { backgroundColor: complete ? withAlpha(colors.accent.cyan, 0.16) : withAlpha(colors.text.primary, 0.06) }]}>
                <Text style={[typography.captionMedium, { color: complete ? colors.accent.cyan : colors.text.secondary }]}>
                    {done}/{total}
                </Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1 },
    backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    iconBtn: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    modalClose: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },

    // Hero
    heroInner: { flexDirection: 'row', alignItems: 'center', padding: 18 },
    ringCenter: { alignItems: 'center', justifyContent: 'center' },
    heroRight: { flex: 1, marginLeft: 18 },
    heroBigRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 2 },
    pillRow: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, paddingVertical: 14, paddingHorizontal: 6 },
    pill: { flex: 1, alignItems: 'center' },
    pillIcon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
    pillDivider: { width: 1, height: 36, alignSelf: 'center' },

    // Category
    categorySection: { marginBottom: 22 },
    catHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
    catIcon: { width: 30, height: 30, borderRadius: 9, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    catCount: { minWidth: 40, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, alignItems: 'center' },

    fab: { position: 'absolute', right: 20, width: 64, height: 64, borderRadius: 32, overflow: 'hidden' },
    fabGradient: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
    modalContent: { padding: 24 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    input: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, height: 48, fontSize: 15 },
    categoryChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, marginRight: 8 },
    addButtonWrap: { height: 56, borderRadius: 28, overflow: 'hidden' },
});
