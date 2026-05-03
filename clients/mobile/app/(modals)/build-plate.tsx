import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { searchFoods, logMeal } from '@/api/meals';

const MEAL_TYPES = [
    { key: 'BREAKFAST', label: 'Breakfast' },
    { key: 'LUNCH',     label: 'Lunch' },
    { key: 'DINNER',    label: 'Dinner' },
    { key: 'SNACK',     label: 'Snack' },
] as const;

type MealType = typeof MEAL_TYPES[number]['key'];

export default function BuildPlateScreen() {
    const { colors, typography, spacing } = useTheme();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const queryClient = useQueryClient();

    const [plate, setPlate] = useState<any[]>([]);
    const [mealType, setMealType] = useState<MealType>('BREAKFAST');

    const { data: foodItems = [], isLoading: foodsLoading } = useQuery({
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
            queryClient.invalidateQueries({ queryKey: ['meal-logs'] });
            queryClient.invalidateQueries({ queryKey: ['today-progress'] });
            router.back();
        },
        onError: (err: any) => {
            Alert.alert('Error', err?.response?.data?.message ?? err?.message ?? 'Failed to save meal');
        },
    });

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

    return (
        <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background.primary }]}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.border.default }]}>
                <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Ionicons name="close" size={28} color={colors.text.primary} />
                </TouchableOpacity>
                <Text style={[typography.heading, { color: colors.text.primary }]}>Build Your Plate</Text>
                <TouchableOpacity onPress={() => router.push('/(modals)/barcode-scanner' as any)}>
                    <Ionicons name="scan-circle-outline" size={28} color={colors.accent.cyan} />
                </TouchableOpacity>
            </View>

            {/* Meal Type Picker */}
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.mealTypesRow}
            >
                {MEAL_TYPES.map(mt => (
                    <TouchableOpacity
                        key={mt.key}
                        style={[styles.mealTypeChip, {
                            backgroundColor: mealType === mt.key ? colors.accent.cyan : colors.background.secondary,
                            borderColor:     mealType === mt.key ? colors.accent.cyan : colors.border.default,
                        }]}
                        onPress={() => setMealType(mt.key)}
                    >
                        <Text style={[typography.caption, {
                            color:      mealType === mt.key ? '#fff' : colors.text.secondary,
                            fontWeight: mealType === mt.key ? '700'  : '500',
                        }]}>
                            {mt.label}
                        </Text>
                    </TouchableOpacity>
                ))}
            </ScrollView>

            <View style={[styles.plateArea, { backgroundColor: colors.background.primary, borderBottomColor: colors.border.default }]}>
                <View style={[styles.circlePlate, { borderColor: colors.border.default }]}>
                    {plate.length === 0 ? (
                        <Text style={[typography.caption, { color: colors.text.tertiary, textAlign: 'center' }]}>Drag items or tap to add to plate</Text>
                    ) : (
                        <View style={{ position: 'absolute' }}>
                            <Ionicons name="restaurant-outline" size={48} color={colors.text.secondary} />
                        </View>
                    )}
                </View>

                <View style={styles.macroSummaryRow}>
                    <Text style={[typography.heading, { color: colors.text.primary }]}>{Math.round(totals.kcal)} <Text style={{ fontSize: 12, color: colors.text.tertiary }}>KCAL</Text></Text>
                    <Text style={[typography.heading, { color: colors.text.primary }]}>{Math.round(totals.pro)}g <Text style={{ fontSize: 12, color: colors.text.tertiary }}>PRO</Text></Text>
                    <Text style={[typography.heading, { color: colors.text.primary }]}>{Math.round(totals.carb)}g <Text style={{ fontSize: 12, color: colors.text.tertiary }}>CARB</Text></Text>
                    <Text style={[typography.heading, { color: colors.text.primary }]}>{Math.round(totals.fat)}g <Text style={{ fontSize: 12, color: colors.text.tertiary }}>FAT</Text></Text>
                </View>
            </View>

            <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 100 }}>
                <View style={styles.sectionHeader}>
                    <Text style={[typography.heading, { color: colors.text.primary }]}>Quick Add</Text>
                    <Ionicons name="search" size={20} color={colors.text.secondary} />
                </View>

                {foodsLoading ? (
                    <ActivityIndicator color={colors.accent.cyan} style={{ marginVertical: 20 }} />
                ) : foodItems.map((item) => (
                    <TouchableOpacity key={item.id} onPress={() => addToPlate(item)} activeOpacity={0.8}>
                        <Card style={styles.foodRow}>
                            <View style={[styles.iconBox, { backgroundColor: colors.background.tertiary }]}>
                                <Ionicons name="fast-food" size={20} color={colors.text.secondary} />
                            </View>
                            <View style={styles.foodInfo}>
                                <Text style={[typography.subhead, { color: colors.text.primary }]}>{item.name}</Text>
                                <Text style={[typography.caption, { color: colors.text.tertiary, marginTop: 4 }]}>
                                    {item.calories} kcal • {item.protein}P / {item.carbs}C / {item.fat}F
                                </Text>
                            </View>
                            <Ionicons name="add-circle" size={24} color={colors.accent.cyan} />
                        </Card>
                    </TouchableOpacity>
                ))}

                {plate.length > 0 && (
                    <View style={{ marginTop: 24 }}>
                        <Text style={[typography.heading, { color: colors.text.primary, marginBottom: 12 }]}>Current Plate</Text>
                        {plate.map((item, index) => (
                            <View key={index} style={styles.plateItemRow}>
                                <Text style={[typography.body, { color: colors.text.primary }]}>{item.name}</Text>
                                <TouchableOpacity onPress={() => removeFromPlate(index)}>
                                    <Ionicons name="trash-outline" size={20} color={colors.accent.coral} />
                                </TouchableOpacity>
                            </View>
                        ))}
                    </View>
                )}
            </ScrollView>

            <View style={[styles.footer, { paddingHorizontal: spacing.xl, paddingBottom: Math.max(insets.bottom, 16), borderTopColor: colors.border.default, backgroundColor: colors.background.primary }]}>
                <Button
                    title={saveMutation.isPending ? 'Saving…' : 'Save Meal'}
                    disabled={plate.length === 0 || saveMutation.isPending}
                    onPress={() => saveMutation.mutate()}
                    fullWidth
                />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 16,
        borderBottomWidth: 1,
    },
    mealTypesRow: {
        paddingHorizontal: 16,
        paddingVertical: 12,
        flexDirection: 'row',
        alignItems: 'center',
    },
    mealTypeChip: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        borderWidth: 1,
        marginRight: 8,
    },
    plateArea: {
        paddingVertical: 24,
        alignItems: 'center',
        borderBottomWidth: 1,
    },
    circlePlate: {
        width: 200,
        height: 200,
        borderRadius: 100,
        borderWidth: 2,
        borderStyle: 'dashed',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
    },
    macroSummaryRow: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        width: '100%',
        paddingHorizontal: 20,
        marginTop: 24,
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    foodRow: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        marginBottom: 8,
    },
    iconBox: {
        width: 40,
        height: 40,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    foodInfo: {
        flex: 1,
    },
    plateItemRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 12,
        borderBottomWidth: 1,
    },
    footer: {
        paddingTop: 16,
        borderTopWidth: 1,
    }
});
