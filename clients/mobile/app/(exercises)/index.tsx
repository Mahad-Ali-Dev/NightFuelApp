import React, { useState, useCallback } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
    FlatList, ActivityIndicator, Dimensions, RefreshControl,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { searchLibrary } from '@/api/exercises';
import { LinearGradient } from 'expo-linear-gradient';
import { withAlpha } from '@/theme/utils';
import { TAB_BAR_H } from '../(tabs)/_layout';

const { width } = Dimensions.get('window');

const CATEGORY_IMAGES = [
    { key: 'gym', label: 'Gym', image: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=500&auto=format&fit=crop&q=80', color: '#FF6B35', description: 'Barbell · Dumbbell · Machines' },
    { key: 'home', label: 'Home', image: 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=500&auto=format&fit=crop&q=80', color: '#00D4FF', description: 'Bodyweight · Anywhere' },
    { key: 'cardio', label: 'Cardio', image: 'https://images.unsplash.com/photo-1538805060514-97d9cc17730c?w=500&auto=format&fit=crop&q=80', color: '#2ECC71', description: 'HIIT · Endurance · Fat Burn' },
    { key: 'kegel', label: 'Recovery', image: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=500&auto=format&fit=crop&q=80', color: '#A855F7', description: 'Pelvic Floor · Stability' },
];

// Category-specific placeholder when exercise has no wger image
const CATEGORY_FALLBACK: Record<string, string> = {
    gym: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400&auto=format&fit=crop&q=80',
    home: 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=400&auto=format&fit=crop&q=80',
    cardio: 'https://images.unsplash.com/photo-1538805060514-97d9cc17730c?w=400&auto=format&fit=crop&q=80',
    kegel: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=400&auto=format&fit=crop&q=80',
};

const MUSCLE_GROUPS = ['Chest', 'Back', 'Shoulders', 'Arms', 'Core', 'Legs', 'Glutes', 'Full Body'];


type AppCategory = 'gym' | 'home' | 'cardio' | 'kegel';

export default function ExerciseLibraryScreen() {
    const { colors, typography, spacing, borderRadius } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const params = useLocalSearchParams();

    const [activeCategory, setActiveCategory] = useState<string | null>(
        (params.category as string) || null
    );
    const [searchQuery, setSearchQuery] = useState('');
    const libraryQuery = useQuery({
        queryKey: ['exercise-library', searchQuery, activeCategory],
        queryFn: () => searchLibrary(searchQuery || null, activeCategory as AppCategory | undefined),
        enabled: !!searchQuery || !!activeCategory,
        staleTime: 5 * 60 * 1000,
    });

    const exercises = libraryQuery.data ?? [];

    const showBrowse = !searchQuery && !activeCategory;

    const onRefresh = useCallback(() => {
        if (activeCategory || searchQuery) libraryQuery.refetch();
    }, [activeCategory, searchQuery]);

    return (
        <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
            {/* Header */}
            <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
                {(activeCategory || searchQuery) ? (
                    <TouchableOpacity
                        style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}
                        onPress={() => { setActiveCategory(null); setSearchQuery(''); }}
                    >
                        <Ionicons name="arrow-back" size={20} color={colors.accent.coral} />
                        <Text style={[typography.caption, { color: colors.accent.coral, marginLeft: 6, fontWeight: 'bold' }]}>
                            {activeCategory
                                ? (CATEGORY_IMAGES.find(c => c.key === activeCategory)?.label.toUpperCase() ?? '') + ' EXERCISES'
                                : 'BACK'}
                        </Text>
                    </TouchableOpacity>
                ) : null}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <View>
                        <Text style={[typography.display, { color: colors.text.primary, fontSize: 28, fontWeight: '900' }]}>
                            Exercise Library
                        </Text>
                        <Text style={[typography.body, { color: colors.text.tertiary }]}>
                            {showBrowse ? 'Browse by category' : `${exercises.length} exercises found`}
                        </Text>
                    </View>
                    <TouchableOpacity
                        style={[styles.iconBtn, { backgroundColor: colors.background.secondary }]}
                        onPress={() => router.push('/(exercises)/history' as any)}
                    >
                        <Ionicons name="time-outline" size={22} color={colors.text.primary} />
                    </TouchableOpacity>
                </View>
            </View>

            {/* Search Bar */}
            <View style={{ paddingHorizontal: 20, flexDirection: 'row', gap: 10, marginBottom: 16 }}>
                <View style={[styles.searchBox, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
                    <Ionicons name="search" size={18} color={colors.text.tertiary} />
                    <TextInput
                        style={[styles.searchInput, { color: colors.text.primary }]}
                        placeholder="Search exercises..."
                        placeholderTextColor={colors.text.tertiary}
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        returnKeyType="search"
                    />
                    {searchQuery.length > 0 && (
                        <TouchableOpacity onPress={() => setSearchQuery('')}>
                            <Ionicons name="close-circle" size={18} color={colors.text.tertiary} />
                        </TouchableOpacity>
                    )}
                </View>
                <TouchableOpacity
                    style={[styles.iconBtn, { backgroundColor: colors.background.secondary, borderColor: colors.border.default, borderWidth: 1 }]}
                    onPress={() => router.push('/(exercises)/muscles')}
                >
                    <Ionicons name="body-outline" size={22} color={colors.accent.cyan} />
                </TouchableOpacity>
            </View>


            {showBrowse ? (
                <ScrollView
                    contentContainerStyle={{ padding: 20, paddingBottom: TAB_BAR_H + 40 }}
                    showsVerticalScrollIndicator={false}
                >
                    {/* Category Cards */}
                    <View style={styles.categoryGrid}>
                        {CATEGORY_IMAGES.map((cat) => (
                            <TouchableOpacity
                                key={cat.key}
                                style={styles.categoryCard}
                                activeOpacity={0.85}
                                onPress={() => setActiveCategory(cat.key)}
                            >
                                <Image
                                    source={{ uri: cat.image }}
                                    style={StyleSheet.absoluteFillObject}
                                    contentFit="cover"
                                />
                                <LinearGradient
                                    colors={['transparent', 'rgba(0,0,0,0.88)']}
                                    style={StyleSheet.absoluteFillObject}
                                />
                                <View style={styles.categoryContent}>
                                    <Text style={[typography.heading, { color: '#FFF', fontSize: 20, fontWeight: '900' }]}>
                                        {cat.label}
                                    </Text>
                                    <Text style={[typography.caption, { color: 'rgba(255,255,255,0.6)', fontSize: 11, marginTop: 2 }]}>
                                        {cat.description}
                                    </Text>
                                </View>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {/* Browse by Muscle */}
                    <Text style={[typography.heading, { color: colors.text.primary, marginTop: 32, marginBottom: 14 }]}>
                        Browse by Muscle
                    </Text>
                    <View style={styles.muscleGrid}>
                        {MUSCLE_GROUPS.map((muscle) => (
                            <TouchableOpacity
                                key={muscle}
                                style={[styles.muscleChip, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}
                                onPress={() => setSearchQuery(muscle)}
                            >
                                <Text style={[typography.caption, { color: colors.text.primary, fontWeight: 'bold' }]}>
                                    {muscle}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </ScrollView>
            ) : libraryQuery.isLoading ? (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                    <ActivityIndicator size="large" color={colors.accent.coral} />
                    <Text style={[typography.caption, { color: colors.text.tertiary, marginTop: 12 }]}>Searching exercises...</Text>
                </View>
            ) : exercises.length === 0 ? (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 }}>
                    <Ionicons name="fitness-outline" size={64} color={colors.text.tertiary} />
                    <Text style={[typography.heading, { color: colors.text.secondary, marginTop: 16, textAlign: 'center' }]}>
                        No exercises found
                    </Text>
                    <TouchableOpacity style={{ marginTop: 16 }} onPress={() => { setSearchQuery(''); setActiveCategory(null); }}>
                        <Text style={[typography.caption, { color: colors.accent.coral, fontWeight: 'bold' }]}>CLEAR FILTERS</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <FlatList
                    data={exercises}
                    keyExtractor={(item: any) => item.id || item.name}
                    numColumns={2}
                    contentContainerStyle={{ padding: 16, paddingBottom: TAB_BAR_H + 40 }}
                    columnWrapperStyle={{ gap: 12 }}
                    ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
                    refreshControl={
                        <RefreshControl refreshing={libraryQuery.isFetching} onRefresh={onRefresh} tintColor={colors.accent.coral} />
                    }
                    renderItem={({ item }: any) => {
                        const fallbackImg = CATEGORY_FALLBACK[item.category ?? activeCategory ?? '']
                            ?? CATEGORY_FALLBACK.gym;
                        const imgSrc = item.imageUrl || fallbackImg;
                        return (
                            <TouchableOpacity
                                style={[styles.exCard, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}
                                activeOpacity={0.85}
                                onPress={() => router.push(`/(exercises)/${item.id}` as any)}
                            >
                                <View style={styles.exImageWrapper}>
                                    <Image
                                        source={{ uri: imgSrc }}
                                        style={styles.exImage}
                                        contentFit="cover"
                                        transition={300}
                                    />
                                    <LinearGradient
                                        colors={['transparent', 'rgba(0,0,0,0.55)']}
                                        style={StyleSheet.absoluteFillObject}
                                    />

                                </View>
                                <View style={styles.exInfo}>
                                    <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: 'bold', fontSize: 13 }]} numberOfLines={2}>
                                        {item.name}
                                    </Text>
                                    <Text style={[typography.caption, { color: colors.text.tertiary, fontSize: 11, marginTop: 2 }]} numberOfLines={1}>
                                        {item.bodyPart || item.muscleGroup || ''}
                                    </Text>
                                    {item.equipment && item.equipment !== 'body weight' && (
                                        <View style={[styles.equipPill, { borderColor: withAlpha(colors.accent.cyan, 0.5) }]}>
                                            <Text style={{ color: colors.accent.cyan, fontSize: 9, fontWeight: '600' }}>
                                                {item.equipment.toUpperCase()}
                                            </Text>
                                        </View>
                                    )}
                                </View>
                            </TouchableOpacity>
                        );
                    }}
                />
            )}
        </View>
    );
}

const CARD_W = (width - 48) / 2;

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { paddingHorizontal: 20, paddingBottom: 16 },
    iconBtn: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, height: 48, gap: 8 },
    searchInput: { flex: 1, fontSize: 15, fontFamily: 'Inter' },
    categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    categoryCard: {
        width: (width - 52) / 2,
        height: 165,
        borderRadius: 20,
        overflow: 'hidden',
        justifyContent: 'flex-end',
    },
    categoryContent: { padding: 14 },
    muscleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    muscleChip: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20, borderWidth: 1 },
    exCard: { width: CARD_W, borderRadius: 16, overflow: 'hidden', borderWidth: 1 },
    exImageWrapper: { position: 'relative', width: '100%', height: 130 },
    exImage: { width: '100%', height: 130 },
    exInfo: { padding: 10 },
    equipPill: { alignSelf: 'flex-start', marginTop: 5, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 4, borderWidth: 1, backgroundColor: 'transparent' },
});
