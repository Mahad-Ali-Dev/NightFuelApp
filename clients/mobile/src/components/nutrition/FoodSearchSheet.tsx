import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList, ActivityIndicator, ListRenderItem, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme';

interface FoodItem {
    id: string;
    name: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
}

interface FoodSearchSheetProps {
    onSearch: (query: string) => Promise<FoodItem[]>;
    onSelect: (food: FoodItem) => void;
}

/**
 * Memoized result row. Receives the stable `onSelect` callback and a single
 * `item`; both are referentially stable across list re-renders so rows that
 * didn't change won't re-render.
 */
const FoodResultRow = React.memo(function FoodResultRow({
    item,
    onSelect,
}: {
    item: FoodItem;
    onSelect: (food: FoodItem) => void;
}) {
    return (
        <TouchableOpacity style={styles.resultRow} onPress={() => onSelect(item)} activeOpacity={0.85}>
            <View style={styles.resultInfo}>
                <Text style={styles.foodName}>{item.name}</Text>
                <Text style={styles.foodMeta}>{item.calories} kcal • P{item.protein}g C{item.carbs}g F{item.fat}g</Text>
            </View>
            <Ionicons name="add-circle" size={24} color="#FF6B35" />
        </TouchableOpacity>
    );
});

export function FoodSearchSheet({ onSearch, onSelect }: FoodSearchSheetProps) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<FoodItem[]>([]);
    const [loading, setLoading] = useState(false);

    const handleSearch = async (text: string) => {
        setQuery(text);
        if (text.length < 2) { setResults([]); return; }
        setLoading(true);
        try { const data = await onSearch(text); setResults(data); }
        catch { setResults([]); }
        finally { setLoading(false); }
    };

    const keyExtractor = useCallback((item: FoodItem) => item.id, []);
    const renderItem = useCallback<ListRenderItem<FoodItem>>(
        ({ item }) => <FoodResultRow item={item} onSelect={onSelect} />,
        [onSelect],
    );

    return (
        <View style={styles.container}>
            <View style={styles.handleBar} />
            <Text style={styles.title}>Search Foods</Text>
            <View style={styles.searchBar}>
                <Ionicons name="search" size={18} color={colors.text.secondary} />
                <TextInput style={styles.input} placeholder="Search 3M+ foods..." placeholderTextColor={colors.text.tertiary} value={query} onChangeText={handleSearch} autoFocus />
                {query.length > 0 && (
                    <TouchableOpacity onPress={() => { setQuery(''); setResults([]); }} activeOpacity={0.85}>
                        <Ionicons name="close-circle" size={18} color={colors.text.secondary} />
                    </TouchableOpacity>
                )}
            </View>
            {loading && <ActivityIndicator color="#FF6B35" style={{ marginTop: 20 }} />}
            <FlatList
                data={results}
                keyExtractor={keyExtractor}
                contentContainerStyle={{ paddingBottom: 40 }}
                renderItem={renderItem}
                initialNumToRender={10}
                maxToRenderPerBatch={10}
                windowSize={7}
                removeClippedSubviews={Platform.OS === 'android'}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background.primary, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 12 },
    handleBar: { width: 40, height: 4, backgroundColor: colors.border.light, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
    title: { color: '#FFFFFF', fontSize: 22, fontWeight: '700', marginBottom: 16 },
    searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.background.secondary, borderRadius: 16, paddingHorizontal: 16, height: 48, borderWidth: 1, borderColor: colors.border.light, marginBottom: 16 },
    input: { flex: 1, color: '#FFFFFF', fontSize: 14, marginLeft: 10 },
    resultRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.background.secondary },
    resultInfo: { flex: 1 },
    foodName: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
    foodMeta: { color: colors.text.secondary, fontSize: 12, marginTop: 2 },
});
