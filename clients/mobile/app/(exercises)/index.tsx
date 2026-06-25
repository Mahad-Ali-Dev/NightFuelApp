import React, { useState, useCallback } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
    FlatList, Dimensions, RefreshControl, Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { searchLibrary } from '@/api/exercises';
import { LinearGradient } from 'expo-linear-gradient';
import { withAlpha } from '@/theme/utils';
import { shadows } from '@/theme/shadows';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { Skeleton, EmptyState, GlassCard } from '@/components/ui';
import { ExerciseGridCard } from '@/components/exercise/ExerciseGridCard';
import { TAB_BAR_H } from '../(tabs)/_layout';

const { width } = Dimensions.get('window');

// Bundled category art (dark-glass, accent-glow). Bundled so the browse tiles
// and imageless cards never depend on an external host (no 404 / rate-limit).
// NOTE: '@/*' resolves to ./src, so assets are required by relative path
// (same pattern as [id].tsx's FALLBACK_IMAGE).
const CAT_GYM_IMG = require('../../assets/images/cat-gym.png');
const CAT_HOME_IMG = require('../../assets/images/cat-home.png');
const CAT_CARDIO_IMG = require('../../assets/images/cat-cardio.png');
const CAT_RECOVERY_IMG = require('../../assets/images/cat-recovery.png');

const CATEGORY_IMAGES = [
    { key: 'gym', label: 'Gym', image: CAT_GYM_IMG, color: '#A8CC3C', description: 'Barbell · Dumbbell · Machines' },
    { key: 'home', label: 'Home', image: CAT_HOME_IMG, color: '#00D4FF', description: 'Bodyweight · Anywhere' },
    { key: 'cardio', label: 'Cardio', image: CAT_CARDIO_IMG, color: '#2ECC71', description: 'HIIT · Endurance · Fat Burn' },
    { key: 'kegel', label: 'Recovery', image: CAT_RECOVERY_IMG, color: '#A855F7', description: 'Pelvic Floor · Stability' },
];

// Category-specific placeholder (bundled) when an exercise has no wger image.
const CATEGORY_FALLBACK: Record<string, number> = {
    gym: CAT_GYM_IMG,
    home: CAT_HOME_IMG,
    cardio: CAT_CARDIO_IMG,
    kegel: CAT_RECOVERY_IMG,
};

const MUSCLE_GROUPS = ['Chest', 'Back', 'Shoulders', 'Arms', 'Core', 'Legs', 'Glutes', 'Full Body'];


export default function ExerciseLibraryScreen() {
    const { colors, typography, spacing } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const params = useLocalSearchParams();

    const [activeCategory, setActiveCategory] = useState<string | null>(
        (params.category as string) || null
    );
    const [activeMuscle, setActiveMuscle] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const libraryQuery = useQuery({
        queryKey: ['exercise-library', searchQuery, activeCategory, activeMuscle],
        // Pass the right filter type for each path:
        //   - Search bar typing      → query (name match)
        //   - Category card tap      → category
        //   - Muscle chip tap        → muscleGroup (matches LibraryExercise.muscleGroup,
        //                              not just exercise NAME, so we don't miss
        //                              "Bench Press" when filtering for Chest)
        queryFn: () => searchLibrary({
            query: searchQuery || null,
            category: activeCategory,
            muscleGroup: activeMuscle,
            // Fetch the full catalog (~2,232 entries) — the backend caps at 5000.
            // A 200 limit previously truncated category/muscle results.
            limit: 1000,
        }),
        enabled: !!searchQuery || !!activeCategory || !!activeMuscle,
        staleTime: 5 * 60 * 1000,
    });

    const exercises = libraryQuery.data ?? [];

    const showBrowse = !searchQuery && !activeCategory && !activeMuscle;

    const clearAllFilters = () => {
        setActiveCategory(null);
        setActiveMuscle(null);
        setSearchQuery('');
    };

    // Tapping a muscle chip toggles the filter — re-tapping the active muscle
    // clears back to browse (keeps the same setActiveMuscle data path).
    const toggleMuscle = (muscle: string) => {
        setActiveCategory(null);
        setActiveMuscle((prev) => (prev === muscle ? null : muscle));
    };

    const onRefresh = useCallback(() => {
        if (activeCategory || searchQuery || activeMuscle) libraryQuery.refetch();
    }, [activeCategory, searchQuery, activeMuscle]);

    const keyExtractor = useCallback((item: any) => item.id || item.name, []);

    const renderItem = useCallback(({ item, index }: any) => {
        // Bundled category art as the fallback module (number from require()).
        const fallbackImg = CATEGORY_FALLBACK[item.category ?? activeCategory ?? 'gym']
            ?? CATEGORY_FALLBACK.gym;
        // Real wger image -> remote { uri }; otherwise the bundled module.
        // expo-image's `source` accepts both a require-number and a { uri }.
        const imgSrc = item.imageUrl ? { uri: item.imageUrl } : fallbackImg;
        // Browse-time demo affordance: derived purely from the already-fetched
        // library item (no extra request). Shown when the backend supplied a
        // demo video / GIF for this exercise.
        const hasDemo = !!(item.demoGifUrl || item.demoUrl);
        return (
            <ExerciseGridCard
                item={item}
                imageSource={imgSrc}
                hasDemo={hasDemo}
                style={styles.exCardTouch}
                delay={Math.min(index, 9) * 45}
                onPress={() => router.push(`/(exercises)/${item.id}` as any)}
            />
        );
    }, [router, activeCategory]);

    // Active-filter label for the results header (back row + count subtitle).
    const filterLabel = activeMuscle
        ? activeMuscle.toUpperCase() + ' EXERCISES'
        : activeCategory
            ? (CATEGORY_IMAGES.find(c => c.key === activeCategory)?.label.toUpperCase() ?? '') + ' EXERCISES'
            : 'BACK';

    return (
        <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
            <StatusBar style="light" />
            {/* Header */}
            <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
                {(activeCategory || searchQuery || activeMuscle) ? (
                    <TouchableOpacity
                        style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}
                        activeOpacity={0.85}
                        accessibilityRole="button"
                        accessibilityLabel="Clear filters"
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        onPress={clearAllFilters}
                    >
                        <Ionicons name="arrow-back" size={20} color={colors.accent.coral} />
                        <Text style={[typography.caption, { color: colors.accent.coral, marginLeft: 6, fontWeight: 'bold' }]}>
                            {filterLabel}
                        </Text>
                    </TouchableOpacity>
                ) : null}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <View style={{ flex: 1, paddingRight: 12 }}>
                        <Text style={[typography.h1, { color: colors.text.primary }]}>
                            Exercise Library
                        </Text>
                        <View style={styles.subtitleRow}>
                            <View style={[styles.subtitleAccent, { backgroundColor: colors.accent.coral }]} />
                            <Text style={[typography.body, { color: colors.text.secondary }]}>
                                {showBrowse ? 'Browse by category' : `${exercises.length} exercises found`}
                            </Text>
                        </View>
                    </View>
                    <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="History"
                        style={[styles.iconBtn, { backgroundColor: colors.background.secondary, borderColor: colors.border.default, borderWidth: 1 }]}
                        onPress={() => router.push('/(exercises)/history' as any)}
                    >
                        <Ionicons name="time-outline" size={22} color={colors.text.primary} />
                    </TouchableOpacity>
                </View>
            </View>

            {/* Search Bar */}
            <Animated.View entering={FadeInDown.duration(420)} style={{ paddingHorizontal: 20, flexDirection: 'row', gap: 10, marginBottom: 14 }}>
                <GlassCard radius={14} style={styles.searchBox}>
                    <View style={styles.searchBoxInner}>
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
                            <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setSearchQuery('')}>
                                <Ionicons name="close-circle" size={18} color={colors.text.tertiary} />
                            </TouchableOpacity>
                        )}
                    </View>
                </GlassCard>
                <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Muscles"
                    style={[styles.iconBtn, shadows.glow(colors.accent.cyan), { backgroundColor: colors.background.secondary, borderColor: withAlpha(colors.accent.cyan, 0.35), borderWidth: 1 }]}
                    onPress={() => router.push('/(exercises)/muscles')}
                >
                    <Ionicons name="body-outline" size={22} color={colors.accent.cyan} />
                </TouchableOpacity>
            </Animated.View>

            {/* Muscle-group filter chips — horizontal snapping carousel. Drives the
                same setActiveMuscle data path; the active chip is lime-on-ink. */}
            <Animated.View entering={FadeInDown.delay(80).duration(420)} style={{ marginBottom: showBrowse ? 4 : 12 }}>
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.chipRow}
                    decelerationRate="fast"
                    snapToInterval={104}
                    snapToAlignment="start"
                >
                    {MUSCLE_GROUPS.map((muscle) => {
                        const active = activeMuscle === muscle;
                        return (
                            <TouchableOpacity
                                key={muscle}
                                activeOpacity={0.85}
                                accessibilityRole="button"
                                accessibilityState={{ selected: active }}
                                accessibilityLabel={`${muscle} exercises`}
                                style={[
                                    styles.filterChip,
                                    active
                                        ? { backgroundColor: colors.accent.coral, borderColor: colors.accent.coral, ...shadows.glow(colors.accent.coral) }
                                        : { backgroundColor: colors.background.secondary, borderColor: colors.border.default },
                                ]}
                                onPress={() => toggleMuscle(muscle)}
                            >
                                <Text style={[
                                    typography.caption,
                                    { fontWeight: '800', fontSize: 12.5, letterSpacing: 0.2 },
                                    { color: active ? colors.text.inverse : colors.text.primary },
                                ]}>
                                    {muscle}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            </Animated.View>


            {showBrowse ? (
                <ScrollView
                    contentContainerStyle={{ padding: 20, paddingTop: 12, paddingBottom: TAB_BAR_H + 40 }}
                    showsVerticalScrollIndicator={false}
                >
                    {/* Category Cards */}
                    <View style={styles.sectionHeader}>
                        <View style={[styles.sectionBar, { backgroundColor: colors.accent.coral }]} />
                        <Text style={[typography.overline, { color: colors.text.secondary }]}>
                            Categories
                        </Text>
                    </View>
                    <View style={styles.categoryGrid}>
                        {CATEGORY_IMAGES.map((cat, i) => (
                            <Animated.View
                                key={cat.key}
                                entering={FadeInDown.delay(120 + i * 60).springify().damping(18).mass(0.7)}
                                style={styles.categoryCardWrap}
                            >
                                <TouchableOpacity
                                    style={styles.categoryCard}
                                    activeOpacity={0.85}
                                    accessibilityRole="button"
                                    accessibilityLabel={`${cat.label} exercises`}
                                    onPress={() => setActiveCategory(cat.key)}
                                >
                                    <Image
                                        source={cat.image}
                                        style={StyleSheet.absoluteFillObject}
                                        contentFit="cover"
                                        cachePolicy="memory-disk"
                                    />
                                    <LinearGradient
                                        colors={['transparent', 'rgba(0,0,0,0.9)']}
                                        style={StyleSheet.absoluteFillObject}
                                    />
                                    {/* Accent rail keyed to the category colour. */}
                                    <View style={[styles.catAccentRail, { backgroundColor: cat.color }]} />
                                    <View style={styles.categoryContent}>
                                        <Text style={[typography.heading, { color: '#FFF', fontSize: 20, fontWeight: '900' }]}>
                                            {cat.label}
                                        </Text>
                                        <Text style={[typography.caption, { color: 'rgba(255,255,255,0.62)', fontSize: 11, marginTop: 2 }]}>
                                            {cat.description}
                                        </Text>
                                    </View>
                                    <View style={[styles.catArrow, { backgroundColor: withAlpha(cat.color, 0.18), borderColor: withAlpha(cat.color, 0.5) }]}>
                                        <Ionicons name="arrow-forward" size={14} color={cat.color} />
                                    </View>
                                </TouchableOpacity>
                            </Animated.View>
                        ))}
                    </View>

                    {/* Browse by Muscle — full grid mirroring the top carousel for
                        discoverability; same setActiveMuscle data path. */}
                    <View style={[styles.sectionHeader, { marginTop: spacing['3xl'] }]}>
                        <View style={[styles.sectionBar, { backgroundColor: colors.accent.coral }]} />
                        <Text style={[typography.overline, { color: colors.text.secondary }]}>
                            Browse by Muscle
                        </Text>
                    </View>
                    <View style={styles.muscleGrid}>
                        {MUSCLE_GROUPS.map((muscle, i) => (
                            <Animated.View key={muscle} entering={FadeInDown.delay(260 + i * 35).duration(380)}>
                                <TouchableOpacity
                                    activeOpacity={0.85}
                                    accessibilityRole="button"
                                    accessibilityLabel={`${muscle} exercises`}
                                    style={[styles.muscleChip, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}
                                    onPress={() => setActiveMuscle(muscle)}
                                >
                                    <View style={[styles.muscleDot, { backgroundColor: colors.accent.coral }]} />
                                    <Text style={[typography.caption, { color: colors.text.primary, fontWeight: 'bold' }]}>
                                        {muscle}
                                    </Text>
                                </TouchableOpacity>
                            </Animated.View>
                        ))}
                    </View>
                </ScrollView>
            ) : libraryQuery.isLoading ? (
                <ScrollView
                    contentContainerStyle={{ padding: 16, paddingBottom: TAB_BAR_H + 40 }}
                    showsVerticalScrollIndicator={false}
                >
                    <View style={styles.skeletonGrid}>
                        {Array.from({ length: 6 }).map((_, i) => (
                            <GlassCard key={i} radius={20} style={styles.exCardTouch}>
                                <Skeleton width="100%" height={138} radius={0} />
                                <View style={styles.skeletonInfo}>
                                    <Skeleton width="85%" height={14} radius={4} />
                                    <Skeleton width="55%" height={11} radius={4} style={{ marginTop: spacing.sm }} />
                                </View>
                            </GlassCard>
                        ))}
                    </View>
                </ScrollView>
            ) : exercises.length === 0 ? (
                <EmptyState
                    icon="fitness-outline"
                    title="No exercises found"
                    subtitle={
                        searchQuery
                            ? `Nothing matched "${searchQuery}". Try a different search or clear your filters.`
                            : 'No exercises here yet. Try another category, muscle group, or clear your filters.'
                    }
                    actionLabel="Clear Filters"
                    onAction={clearAllFilters}
                    style={{ flex: 1 }}
                />
            ) : (
                <Animated.View entering={FadeIn.duration(300)} style={{ flex: 1 }}>
                    <FlatList
                        data={exercises}
                        keyExtractor={keyExtractor}
                        numColumns={2}
                        contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: TAB_BAR_H + 40 }}
                        columnWrapperStyle={{ gap: 12 }}
                        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
                        removeClippedSubviews={Platform.OS === 'android'}
                        initialNumToRender={8}
                        maxToRenderPerBatch={8}
                        windowSize={7}
                        showsVerticalScrollIndicator={false}
                        refreshControl={
                            <RefreshControl refreshing={libraryQuery.isFetching} onRefresh={onRefresh} tintColor={colors.accent.coral} />
                        }
                        renderItem={renderItem}
                    />
                </Animated.View>
            )}
        </View>
    );
}

const CARD_W = (width - 44) / 2;

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { paddingHorizontal: 20, paddingBottom: 16 },
    subtitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
    subtitleAccent: { width: 3, height: 14, borderRadius: 2 },
    iconBtn: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    // Outer GlassCard wrapper for the search field — GlassCard owns the
    // radius + hairline + frosted fill; this just lets it flex beside the
    // muscles icon button (the row layout lives in searchBoxInner).
    searchBox: { flex: 1 },
    searchBoxInner: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, height: 48, gap: 8 },
    searchInput: { flex: 1, fontSize: 15, fontFamily: 'Inter' },
    // Muscle-filter chip carousel
    chipRow: { paddingHorizontal: 20, gap: 8 },
    filterChip: {
        paddingHorizontal: 16,
        paddingVertical: 9,
        borderRadius: 999,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    // Section headers (accent rail + overline)
    sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
    sectionBar: { width: 3, height: 13, borderRadius: 2 },
    categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    categoryCardWrap: { width: (width - 52) / 2 },
    categoryCard: {
        width: '100%',
        height: 168,
        borderRadius: 20,
        borderCurve: 'continuous',
        overflow: 'hidden',
        justifyContent: 'flex-end',
    },
    catAccentRail: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
    catArrow: {
        position: 'absolute',
        top: 12,
        right: 12,
        width: 28,
        height: 28,
        borderRadius: 14,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    categoryContent: { padding: 14 },
    muscleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    muscleChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 7,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 20,
        borderWidth: 1,
    },
    muscleDot: { width: 6, height: 6, borderRadius: 3 },
    skeletonGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    skeletonInfo: { padding: 11 },
    // Sizing wrapper for the exercise card — width only; the GlassCard child
    // owns the radius + hairline + clip + frosted fill (radius={20}).
    exCardTouch: { width: CARD_W, borderRadius: 20, borderCurve: 'continuous' },
});
