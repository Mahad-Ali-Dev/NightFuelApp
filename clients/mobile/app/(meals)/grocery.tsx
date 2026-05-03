import React, { useState, useEffect, useCallback } from 'react';
import {
    Alert, View, Text, StyleSheet, ScrollView, TouchableOpacity,
    ActivityIndicator, Dimensions, Modal, TextInput, KeyboardAvoidingView, Platform
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { getGroceryList, GroceryItem } from '@/api/meals';

const { width } = Dimensions.get('window');
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

export default function GroceryListScreen() {
    const { colors, typography, spacing, borderRadius } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();

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
    const groupedCustom = customItems.reduce<Record<string, CustomGroceryItem[]>>((acc, item) => {
        if (!acc[item.category]) acc[item.category] = [];
        acc[item.category].push(item);
        return acc;
    }, {});

    // ── Backend data ────────────────────────────────────────────────────────
    const rawData = groceryQuery.data as any;
    const planItems = rawData?.list ?? [];

    const hasAnyItems = customItems.length > 0 || planItems.length > 0;
    const checkedCount = customItems.filter(i => i.checked).length;

    return (
        <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
            {/* Header */}
            <View style={[styles.header, { paddingTop: insets.top + 20, borderBottomColor: colors.border.default }]}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
                </TouchableOpacity>
                <Text style={[typography.heading, { color: colors.text.primary, fontSize: 18 }]}>Grocery List</Text>
                <TouchableOpacity style={styles.backBtn} onPress={() => {
                    if (checkedCount > 0) clearChecked();
                }}>
                    {checkedCount > 0 ? (
                        <Ionicons name="trash-outline" size={22} color={colors.accent.coral || '#FF6B6B'} />
                    ) : (
                        <Ionicons name="share-outline" size={24} color={colors.text.primary} />
                    )}
                </TouchableOpacity>
            </View>

            <View style={{ flex: 1 }}>
                {groceryQuery.isLoading ? (
                    <ActivityIndicator size="large" color={colors.accent.emerald} style={{ marginTop: 40 }} />
                ) : !hasAnyItems ? (
                    <View style={styles.emptyState}>
                        <View style={[styles.emptyIcon, { backgroundColor: `${colors.accent.emerald}10` }]}>
                            <Ionicons name="cart-outline" size={48} color={colors.accent.emerald} />
                        </View>
                        <Text style={[typography.heading, { color: colors.text.primary, textAlign: 'center', marginTop: 20 }]}>
                            List is empty
                        </Text>
                        <Text style={[typography.body, { color: colors.text.tertiary, textAlign: 'center', marginTop: 8, paddingHorizontal: 40 }]}>
                            Tap the + button to add your weekly grocery items.
                        </Text>
                    </View>
                ) : (
                    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
                        {/* Summary bar */}
                        <View style={[styles.summaryBar, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <Ionicons name="basket" size={20} color={colors.accent.emerald} />
                                <Text style={[typography.body, { color: colors.text.primary, fontWeight: 'bold', marginLeft: 8 }]}>
                                    {customItems.length + planItems.length} items
                                </Text>
                            </View>
                            {checkedCount > 0 && (
                                <Text style={[typography.caption, { color: colors.accent.emerald }]}>
                                    {checkedCount} done
                                </Text>
                            )}
                        </View>

                        {/* Custom items grouped by category */}
                        {Object.keys(groupedCustom).map((category) => (
                            <View key={category} style={styles.categorySection}>
                                <Text style={[typography.caption, { color: colors.accent.emerald, fontWeight: 'bold', marginBottom: 12, letterSpacing: 1 }]}>
                                    {category.toUpperCase()}
                                </Text>
                                <View style={[styles.itemStack, { backgroundColor: colors.background.secondary, borderRadius: borderRadius.xl, borderColor: colors.border.default }]}>
                                    {groupedCustom[category].map((item, i) => {
                                        const isChecked = item.checked;
                                        return (
                                            <TouchableOpacity
                                                key={item.id}
                                                style={[styles.itemRow, i !== groupedCustom[category].length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border.default }]}
                                                onPress={() => toggleCustomItem(item.id)}
                                                onLongPress={() => removeItem(item.id)}
                                            >
                                                <Ionicons
                                                    name={isChecked ? "checkbox" : "square-outline"}
                                                    size={24}
                                                    color={isChecked ? colors.accent.emerald : colors.text.tertiary}
                                                />
                                                <View style={{ flex: 1, marginLeft: 16 }}>
                                                    <Text style={[typography.body, {
                                                        color: isChecked ? colors.text.tertiary : colors.text.primary,
                                                        textDecorationLine: isChecked ? 'line-through' : 'none'
                                                    }]}>
                                                        {item.name}
                                                    </Text>
                                                    <Text style={[typography.caption, { color: colors.text.tertiary }]}>
                                                        Qty: {item.quantity}
                                                    </Text>
                                                </View>
                                                <TouchableOpacity onPress={() => removeItem(item.id)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                                                    <Ionicons name="close-circle-outline" size={20} color={colors.text.tertiary} />
                                                </TouchableOpacity>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                            </View>
                        ))}

                        {/* Backend plan items */}
                        {planItems.length > 0 && (
                            <View style={styles.categorySection}>
                                <Text style={[typography.caption, { color: colors.text.tertiary, fontWeight: 'bold', marginBottom: 12, letterSpacing: 1 }]}>
                                    WEEKLY PLAN ITEMS
                                </Text>
                                <View style={[styles.itemStack, { backgroundColor: colors.background.secondary, borderRadius: borderRadius.xl, borderColor: colors.border.default }]}>
                                    {planItems.map((item: any, i: number) => {
                                        const key = `plan-Weekly Plan Items-${item.name}`;
                                        const isChecked = checkedItems[key];
                                        return (
                                            <TouchableOpacity
                                                key={i}
                                                style={[styles.itemRow, i !== planItems.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border.default }]}
                                                onPress={() => togglePlanItem('Weekly Plan Items', item.name)}
                                            >
                                                <Ionicons
                                                    name={isChecked ? "checkbox" : "square-outline"}
                                                    size={24}
                                                    color={isChecked ? colors.accent.emerald : colors.text.tertiary}
                                                />
                                                <View style={{ flex: 1, marginLeft: 16 }}>
                                                    <Text style={[typography.body, {
                                                        color: isChecked ? colors.text.tertiary : colors.text.primary,
                                                        textDecorationLine: isChecked ? 'line-through' : 'none'
                                                    }]}>
                                                        {item.name}
                                                    </Text>
                                                    {item.amount && (
                                                        <Text style={[typography.caption, { color: colors.text.tertiary }]}>{item.amount} {item.unit || ''}</Text>
                                                    )}
                                                </View>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                            </View>
                        )}
                    </ScrollView>
                )}
            </View>

            {/* Floating Action Button */}
            <TouchableOpacity
                style={[styles.fab, { backgroundColor: colors.accent.emerald }]}
                onPress={() => setShowAddModal(true)}
                activeOpacity={0.85}
            >
                <Ionicons name="add" size={32} color="#FFF" />
            </TouchableOpacity>

            {/* ── Add Item Modal ──────────────────────────────────────────────── */}
            <Modal visible={showAddModal} transparent animationType="slide">
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={styles.modalOverlay}
                >
                    <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowAddModal(false)}>
                        <TouchableOpacity activeOpacity={1} onPress={() => { /* prevent close */ }}>
                            <View style={[styles.modalContent, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
                                {/* Modal Header */}
                                <View style={styles.modalHeader}>
                                    <Text style={[typography.heading, { color: colors.text.primary, fontSize: 18 }]}>
                                        Add Grocery Item
                                    </Text>
                                    <TouchableOpacity onPress={() => setShowAddModal(false)}>
                                        <Ionicons name="close" size={24} color={colors.text.tertiary} />
                                    </TouchableOpacity>
                                </View>

                                {/* Item Name */}
                                <Text style={[typography.caption, { color: colors.text.tertiary, fontWeight: 'bold', marginBottom: 8, marginTop: 20 }]}>
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
                                <Text style={[typography.caption, { color: colors.text.tertiary, fontWeight: 'bold', marginBottom: 8, marginTop: 16 }]}>
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
                                <Text style={[typography.caption, { color: colors.text.tertiary, fontWeight: 'bold', marginBottom: 8, marginTop: 16 }]}>
                                    CATEGORY
                                </Text>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 24 }}>
                                    {CATEGORIES.map((cat) => (
                                        <TouchableOpacity
                                            key={cat}
                                            style={[
                                                styles.categoryChip,
                                                {
                                                    backgroundColor: itemCategory === cat ? colors.accent.emerald : colors.background.primary,
                                                    borderColor: itemCategory === cat ? colors.accent.emerald : colors.border.default,
                                                }
                                            ]}
                                            onPress={() => setItemCategory(cat)}
                                        >
                                            <Text style={[typography.caption, {
                                                color: itemCategory === cat ? '#FFF' : colors.text.secondary,
                                                fontWeight: itemCategory === cat ? 'bold' : 'normal',
                                            }]}>
                                                {cat}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>

                                {/* Add Button */}
                                <TouchableOpacity
                                    style={[styles.addButton, { backgroundColor: colors.accent.emerald }]}
                                    onPress={handleAddItem}
                                    activeOpacity={0.85}
                                >
                                    <Ionicons name="add-circle" size={22} color="#FFF" />
                                    <Text style={[typography.subhead, { color: '#FFF', fontWeight: '900', marginLeft: 8, fontSize: 16 }]}>
                                        ADD TO LIST
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </TouchableOpacity>
                    </TouchableOpacity>
                </KeyboardAvoidingView>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1 },
    backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    summaryBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 20 },
    categorySection: { marginBottom: 24 },
    itemStack: { borderWidth: 1, overflow: 'hidden' },
    itemRow: { flexDirection: 'row', alignItems: 'center', padding: 16 },
    emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, marginTop: 40 },
    emptyIcon: { width: 100, height: 100, borderRadius: 50, alignItems: 'center', justifyContent: 'center' },
    fab: { position: 'absolute', bottom: 30, right: 20, width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', elevation: 8, shadowColor: '#00D4AA', shadowOpacity: 0.3, shadowRadius: 10 },
    modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
    modalContent: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, borderWidth: 1, borderBottomWidth: 0 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    input: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, height: 48, fontSize: 15 },
    categoryChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, marginRight: 8 },
    addButton: { height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 28 },
});
