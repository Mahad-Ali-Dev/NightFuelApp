import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

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

    return (
        <View style={styles.container}>
            <View style={styles.handleBar} />
            <Text style={styles.title}>Search Foods</Text>
            <View style={styles.searchBar}>
                <Ionicons name="search" size={18} color="#8B949E" />
                <TextInput style={styles.input} placeholder="Search 3M+ foods..." placeholderTextColor="#484F58" value={query} onChangeText={handleSearch} autoFocus />
                {query.length > 0 && (
                    <TouchableOpacity onPress={() => { setQuery(''); setResults([]); }}>
                        <Ionicons name="close-circle" size={18} color="#8B949E" />
                    </TouchableOpacity>
                )}
            </View>
            {loading && <ActivityIndicator color="#FF6B35" style={{ marginTop: 20 }} />}
            <FlatList
                data={results}
                keyExtractor={(item) => item.id}
                contentContainerStyle={{ paddingBottom: 40 }}
                renderItem={({ item }) => (
                    <TouchableOpacity style={styles.resultRow} onPress={() => onSelect(item)}>
                        <View style={styles.resultInfo}>
                            <Text style={styles.foodName}>{item.name}</Text>
                            <Text style={styles.foodMeta}>{item.calories} kcal • P{item.protein}g C{item.carbs}g F{item.fat}g</Text>
                        </View>
                        <Ionicons name="add-circle" size={24} color="#FF6B35" />
                    </TouchableOpacity>
                )}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0D1117', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 12 },
    handleBar: { width: 40, height: 4, backgroundColor: '#2D3748', borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
    title: { color: '#FFFFFF', fontSize: 22, fontWeight: '700', marginBottom: 16 },
    searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#161B22', borderRadius: 16, paddingHorizontal: 16, height: 48, borderWidth: 1, borderColor: '#2D3748', marginBottom: 16 },
    input: { flex: 1, color: '#FFFFFF', fontSize: 14, marginLeft: 10 },
    resultRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#161B22' },
    resultInfo: { flex: 1 },
    foodName: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
    foodMeta: { color: '#8B949E', fontSize: 12, marginTop: 2 },
});
