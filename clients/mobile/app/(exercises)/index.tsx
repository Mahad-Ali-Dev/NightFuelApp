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
import { getMyProfile } from '@/api/profile';
import { posterFromVideoUrl } from '@/constants/exerciseDemos';
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
// Step-1 gender-gate art (full-body athlete renders).
const GENDER_MALE_IMG = require('../../assets/images/hero-male-1.png');
const GENDER_FEMALE_IMG = require('../../assets/images/hero-female-1.png');
// "Body Focus" (women's body-area workouts) feature-banner hero. Reuses the
// full-body tone hero from the Body Focus gallery so the entry previews it.
const BODY_FOCUS_IMG = require('../../assets/images/women-tone.jpg');
// "30-Day Challenges" feature-banner hero. Reuses a challenge hero so the entry
// previews the day-by-day gender-specific plans.
const CHALLENGES_30_IMG = require('../../assets/images/c30-fullbody-male.jpg');

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

// Muscle groups keyed to the ExerciseDB `bodyPart` values the catalog is actually
// seeded with (NOT raw `muscleGroup` names like "pectoralis major") — matching
// app/(exercises)/muscles.tsx so both screens filter identically. 'Arms'/'Legs'
// use a substring that contains-matches BOTH upper+lower (backend does a `contains`
// on bodyPart). Filtering by muscleGroup-label was the cause of "No exercises found".
const MUSCLE_GROUPS: { label: string; bodyPart: string }[] = [
    { label: 'Chest', bodyPart: 'chest' },
    { label: 'Back', bodyPart: 'back' },
    { label: 'Shoulders', bodyPart: 'shoulders' },
    { label: 'Arms', bodyPart: 'arm' },
    { label: 'Core', bodyPart: 'waist' },
    { label: 'Legs', bodyPart: 'leg' },
    { label: 'Glutes', bodyPart: 'hips' },
];

// Difficulty refinement chips. Backend does a case-insensitive `contains`, so these
// also catch the few lowercase stragglers ('beginner'/'intermediate') in the data.
const DIFFICULTIES = ['Beginner', 'Intermediate', 'Advanced'];


export default function ExerciseLibraryScreen() {
    const { colors, typography, spacing } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const params = useLocalSearchParams();

    // ── STEP 1: gender gate ──────────────────────────────────────────────────
    // The flow is gender → category grid → muscle filter → results. Until a gender
    // is chosen the screen shows ONLY the Male/Female chooser. A deep link from a
    // Train muscle-card / style tile (?muscle= / ?category=) skips the gate using
    // the profile's biological sex, so those land straight on results.
    const { data: profile } = useQuery({ queryKey: ['my-profile'], queryFn: getMyProfile });
    const profileSex = ((profile as any)?.biologicalSex ?? '').toString().toUpperCase();
    const profileDefault: 'Male' | 'Female' = profileSex === 'FEMALE' ? 'Female' : 'Male';
    const deepLinked = !!(params.category || params.muscle);
    const [genderPick, setGenderPick] = useState<'Male' | 'Female' | null>(null);
    // null → show Step 1. Non-null → past the gate (picked, or deep-linked default).
    const gender: 'Male' | 'Female' | null = genderPick ?? (deepLinked ? profileDefault : null);
    const effectiveGender: 'Male' | 'Female' = gender ?? profileDefault;

    const [activeCategory, setActiveCategory] = useState<string | null>(
        (params.category as string) || null
    );
    // activeMuscle holds an ExerciseDB bodyPart key (e.g. 'chest', 'arm'), seeded
    // from a Train muscle-card tap (?muscle=) so the screen can land pre-filtered.
    const [activeMuscle, setActiveMuscle] = useState<string | null>(
        (params.muscle as string) || null
    );
    const [searchQuery, setSearchQuery] = useState('');
    // Difficulty refinement (Beginner / Intermediate / Advanced) — applied with the
    // category/muscle filters, scoped after the gender step.
    const [activeDifficulty, setActiveDifficulty] = useState<string | null>(null);
    // Optional "{gender} only" filter. OFF by default → the FULL catalog shows
    // (gender otherwise only drives the demo clip, since the catalog is Male-skewed
    // and hard gender-filtering starved Female users — 132 of 480 chest). When ON,
    // narrow to the chosen gender's (gender + unisex) exercises — a true gender list.
    const [genderOnly, setGenderOnly] = useState(false);
    const libraryQuery = useQuery({
        queryKey: ['exercise-library', searchQuery, activeCategory, activeMuscle, activeDifficulty, genderOnly ? effectiveGender : null],
        queryFn: () => searchLibrary({
            query: searchQuery || null,
            category: activeCategory,
            bodyPart: activeMuscle,
            difficulty: activeDifficulty,
            gender: genderOnly ? effectiveGender : null,
            // Fetch the full catalog (~2,232 entries) — the backend caps at 5000.
            limit: 1000,
        }),
        enabled: !!searchQuery || !!activeCategory || !!activeMuscle || !!activeDifficulty || genderOnly,
        staleTime: 5 * 60 * 1000,
    });

    const exercises = libraryQuery.data ?? [];

    const showBrowse = !searchQuery && !activeCategory && !activeMuscle && !activeDifficulty && !genderOnly;

    const clearAllFilters = () => {
        setActiveCategory(null);
        setActiveMuscle(null);
        setActiveDifficulty(null);
        setGenderOnly(false);
        setSearchQuery('');
    };

    // Toggle a muscle (bodyPart) filter. Does NOT clear the category — they
    // COMBINE so a user can drill category → then narrow by muscle group within it.
    const toggleMuscle = (bodyPart: string) => {
        setActiveMuscle((prev) => (prev === bodyPart ? null : bodyPart));
    };

    const onRefresh = useCallback(() => {
        if (activeCategory || searchQuery || activeMuscle) libraryQuery.refetch();
    }, [activeCategory, searchQuery, activeMuscle]);

    const keyExtractor = useCallback((item: any) => item.id || item.name, []);

    const renderItem = useCallback(({ item, index }: any) => {
        // Bundled category art as the fallback module (number from require()).
        const fallbackImg = CATEGORY_FALLBACK[item.category ?? activeCategory ?? 'gym']
            ?? CATEGORY_FALLBACK.gym;
        // Prefer the clean Lyfta render (`item.imageUrl`, a CDN <id>.png) as the
        // tile thumbnail over the catalog clip's best-frame poster JPG
        // (videoUrl `.mp4`→`.jpg`) — the render is a sharper, consistent image.
        // Order: imageUrl render → best-frame poster → bundled placeholder. The
        // render may 404 (e.g. before the CDN upload lands), so the card swaps via
        // onError to `fallbackSource` (the poster, else the placeholder) seamlessly.
        const poster = posterFromVideoUrl(item.videoUrl);
        const posterSrc = poster ? { uri: poster } : null;
        const imgSrc = item.imageUrl ? { uri: item.imageUrl } : (posterSrc ?? fallbackImg);
        const imgFallbackSrc = posterSrc ?? fallbackImg;
        // Browse-time demo affordance: derived purely from the already-fetched
        // library item (no extra request). Shown when the backend supplied a
        // demo video / GIF for this exercise.
        const hasDemo = !!(item.demoGifUrl || item.demoUrl || item.videoUrl);
        return (
            <ExerciseGridCard
                item={item}
                imageSource={imgSrc}
                fallbackSource={imgFallbackSrc}
                hasDemo={hasDemo}
                style={styles.exCardTouch}
                delay={Math.min(index, 9) * 45}
                onPress={() => router.push(`/(exercises)/${item.id}` as any)}
            />
        );
    }, [router, activeCategory]);

    // Active-filter label for the results header (back row + count subtitle).
    const muscleLabel = MUSCLE_GROUPS.find(g => g.bodyPart === activeMuscle)?.label;
    const filterLabel = muscleLabel
        ? muscleLabel.toUpperCase() + ' EXERCISES'
        : activeCategory
            ? (CATEGORY_IMAGES.find(c => c.key === activeCategory)?.label.toUpperCase() ?? '') + ' EXERCISES'
            : 'BACK';

    // ── STEP 1: gender gate — shown until a gender is chosen (deep links skip it) ─
    if (gender === null) {
        return (
            <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
                <StatusBar style="light" />
                <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
                    <Text style={[typography.h1, { color: colors.text.primary }]}>Exercise Library</Text>
                    <View style={styles.subtitleRow}>
                        <View style={[styles.subtitleAccent, { backgroundColor: colors.accent.coral }]} />
                        <Text style={[typography.body, { color: colors.text.secondary }]}>Who are you training?</Text>
                    </View>
                </View>
                <View style={styles.genderGate}>
                    {(['Male', 'Female'] as const).map((gx, i) => (
                        <Animated.View key={gx} entering={FadeInDown.delay(80 + i * 70).duration(440)} style={{ flex: 1 }}>
                            <TouchableOpacity
                                style={[styles.genderCard, { borderColor: colors.border.default }]}
                                activeOpacity={0.9}
                                accessibilityRole="button"
                                accessibilityLabel={`${gx} exercises`}
                                onPress={() => setGenderPick(gx)}
                            >
                                <Image source={gx === 'Male' ? GENDER_MALE_IMG : GENDER_FEMALE_IMG} style={StyleSheet.absoluteFillObject} contentFit="cover" cachePolicy="memory-disk" />
                                <LinearGradient colors={['transparent', 'rgba(0,0,0,0.88)']} style={StyleSheet.absoluteFillObject} />
                                <View style={[styles.catAccentRail, { backgroundColor: colors.accent.coral }]} />
                                <View style={styles.genderCardContent}>
                                    <Ionicons name={gx === 'Male' ? 'male' : 'female'} size={22} color={colors.accent.coral} />
                                    <Text style={[typography.heading, { color: '#FFF', fontSize: 20, fontWeight: '900', marginTop: 6 }]}>{gx}</Text>
                                </View>
                            </TouchableOpacity>
                        </Animated.View>
                    ))}
                </View>
            </View>
        );
    }

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

            {/* Chosen-gender bar — the gender context, an optional "{gender} only"
                filter (narrows to that gender + unisex), and a "Change" affordance
                back to the gate (only when the user explicitly picked, not deep-linked). */}
            {gender && (
                <Animated.View entering={FadeInDown.delay(40).duration(360)} style={styles.genderBar}>
                    <Ionicons name={effectiveGender === 'Male' ? 'male' : 'female'} size={14} color={colors.accent.coral} />
                    <Text style={[typography.caption, { color: colors.text.secondary, marginLeft: 6 }]}>
                        Showing <Text style={{ color: colors.text.primary, fontWeight: '700' }}>{effectiveGender}</Text>
                    </Text>
                    <View style={{ flex: 1 }} />
                    {/* Toggle: only this gender's exercises (gender + unisex). */}
                    <TouchableOpacity
                        onPress={() => setGenderOnly((v) => !v)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        accessibilityRole="switch"
                        accessibilityState={{ checked: genderOnly }}
                        accessibilityLabel={`${effectiveGender} exercises only`}
                        style={[styles.genderOnlyPill, genderOnly
                            ? { backgroundColor: colors.accent.coral, borderColor: colors.accent.coral }
                            : { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}
                    >
                        {genderOnly && <Ionicons name="checkmark" size={12} color={colors.text.inverse} />}
                        <Text style={[typography.caption, { fontSize: 11.5, fontWeight: '700', color: genderOnly ? colors.text.inverse : colors.text.secondary }]}>
                            {effectiveGender} only
                        </Text>
                    </TouchableOpacity>
                    {genderPick && (
                    <TouchableOpacity
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        accessibilityRole="button" accessibilityLabel="Change gender"
                        onPress={() => { setGenderPick(null); clearAllFilters(); }}
                        style={{ marginLeft: 12 }}
                    >
                        <Text style={[typography.caption, { color: colors.accent.coral, fontWeight: '700' }]}>Change</Text>
                    </TouchableOpacity>
                    )}
                </Animated.View>
            )}

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
                    {MUSCLE_GROUPS.map((g) => {
                        const active = activeMuscle === g.bodyPart;
                        return (
                            <TouchableOpacity
                                key={g.bodyPart}
                                activeOpacity={0.85}
                                accessibilityRole="button"
                                accessibilityState={{ selected: active }}
                                accessibilityLabel={`${g.label} exercises`}
                                style={[
                                    styles.filterChip,
                                    active
                                        ? { backgroundColor: colors.accent.coral, borderColor: colors.accent.coral, ...shadows.glow(colors.accent.coral) }
                                        : { backgroundColor: colors.background.secondary, borderColor: colors.border.default },
                                ]}
                                onPress={() => toggleMuscle(g.bodyPart)}
                            >
                                <Text style={[
                                    typography.caption,
                                    { fontWeight: '800', fontSize: 12.5, letterSpacing: 0.2 },
                                    { color: active ? colors.text.inverse : colors.text.primary },
                                ]}>
                                    {g.label}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            </Animated.View>

            {/* Difficulty refinement — Beginner / Intermediate / Advanced. Re-tap to
                clear. Combines with the category + muscle filters. */}
            <Animated.View entering={FadeInDown.delay(100).duration(420)} style={styles.difficultyRow}>
                {DIFFICULTIES.map((d) => {
                    const active = activeDifficulty === d;
                    return (
                        <TouchableOpacity
                            key={d}
                            activeOpacity={0.85}
                            accessibilityRole="button"
                            accessibilityState={{ selected: active }}
                            accessibilityLabel={`${d} level`}
                            style={[styles.difficultyChip, active
                                ? { backgroundColor: colors.accent.cyan, borderColor: colors.accent.cyan }
                                : { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}
                            onPress={() => setActiveDifficulty((prev) => (prev === d ? null : d))}
                        >
                            <Text style={[typography.caption, { fontWeight: '700', fontSize: 12, color: active ? colors.text.inverse : colors.text.secondary }]}>
                                {d}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </Animated.View>

            {showBrowse ? (
                <ScrollView
                    contentContainerStyle={{ padding: 20, paddingTop: 12, paddingBottom: TAB_BAR_H + 40 }}
                    showsVerticalScrollIndicator={false}
                >
                    {/* Body Focus — curated women's body-area workout programs. Surfaced
                        first (a wide hero banner) so it reads as a headline feature. It's
                        framed for her when the profile is female, but reachable by all. */}
                    <Animated.View entering={FadeInDown.duration(420)}>
                        <TouchableOpacity
                            style={styles.bodyFocusCard}
                            activeOpacity={0.9}
                            accessibilityRole="button"
                            accessibilityLabel="Body Focus — women's body-area workouts"
                            onPress={() => router.push('/(exercises)/women' as any)}
                        >
                            <Image
                                source={BODY_FOCUS_IMG}
                                style={StyleSheet.absoluteFillObject}
                                contentFit="cover"
                                contentPosition="top"
                                cachePolicy="memory-disk"
                            />
                            <LinearGradient
                                colors={['rgba(10,12,18,0.15)', 'rgba(10,12,18,0.55)', 'rgba(10,12,18,0.96)']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 0, y: 1 }}
                                style={StyleSheet.absoluteFillObject}
                            />
                            <View style={[styles.catAccentRail, { backgroundColor: colors.accent.coral }]} />
                            <View style={styles.bodyFocusContent}>
                                <View style={[styles.bodyFocusTag, { backgroundColor: withAlpha(colors.accent.coral, 0.18), borderColor: withAlpha(colors.accent.coral, 0.5) }]}>
                                    <Ionicons name="sparkles" size={11} color={colors.accent.coral} />
                                    <Text style={[typography.caption, { color: colors.accent.coral, fontSize: 10.5, fontWeight: '800', letterSpacing: 0.8 }]}>
                                        {effectiveGender === 'Female' ? 'MADE FOR YOU' : 'BODY FOCUS'}
                                    </Text>
                                </View>
                                <View style={{ flex: 1 }} />
                                <Text style={[typography.heading, { color: '#FFF', fontSize: 24, fontWeight: '900' }]}>
                                    Body Focus
                                </Text>
                                <Text style={[typography.body, { color: 'rgba(255,255,255,0.82)', fontSize: 13, marginTop: 3 }]}>
                                    Glutes · Abs · Waist · Hips & more — curated by area
                                </Text>
                            </View>
                            <View style={[styles.catArrow, { backgroundColor: withAlpha(colors.accent.coral, 0.2), borderColor: withAlpha(colors.accent.coral, 0.55) }]}>
                                <Ionicons name="arrow-forward" size={14} color={colors.accent.coral} />
                            </View>
                        </TouchableOpacity>
                    </Animated.View>

                    {/* 30-Day Challenges — Leap-style gated, gender-specific day-by-day
                        plans built over the existing library. Sits beside Body Focus as
                        a second headline feature. */}
                    <Animated.View entering={FadeInDown.delay(60).duration(420)}>
                        <TouchableOpacity
                            style={[styles.bodyFocusCard, { marginTop: 14 }]}
                            activeOpacity={0.9}
                            accessibilityRole="button"
                            accessibilityLabel="30-Day Challenges — day-by-day gender-specific plans"
                            onPress={() => router.push('/(exercises)/challenges-30' as any)}
                        >
                            <Image
                                source={CHALLENGES_30_IMG}
                                style={StyleSheet.absoluteFillObject}
                                contentFit="cover"
                                contentPosition="top"
                                cachePolicy="memory-disk"
                            />
                            <LinearGradient
                                colors={['rgba(10,12,18,0.15)', 'rgba(10,12,18,0.55)', 'rgba(10,12,18,0.96)']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 0, y: 1 }}
                                style={StyleSheet.absoluteFillObject}
                            />
                            <View style={[styles.catAccentRail, { backgroundColor: colors.accent.lime }]} />
                            <View style={styles.bodyFocusContent}>
                                <View style={[styles.bodyFocusTag, { backgroundColor: withAlpha(colors.accent.lime, 0.18), borderColor: withAlpha(colors.accent.lime, 0.5) }]}>
                                    <Ionicons name="flame" size={11} color={colors.accent.lime} />
                                    <Text style={[typography.caption, { color: colors.accent.lime, fontSize: 10.5, fontWeight: '800', letterSpacing: 0.8 }]}>
                                        30-DAY CHALLENGE
                                    </Text>
                                </View>
                                <View style={{ flex: 1 }} />
                                <Text style={[typography.heading, { color: '#FFF', fontSize: 24, fontWeight: '900' }]}>
                                    30-Day Challenges
                                </Text>
                                <Text style={[typography.body, { color: 'rgba(255,255,255,0.82)', fontSize: 13, marginTop: 3 }]}>
                                    Abs · Glutes · Chest · Arms & more — one day at a time
                                </Text>
                            </View>
                            <View style={[styles.catArrow, { backgroundColor: withAlpha(colors.accent.lime, 0.2), borderColor: withAlpha(colors.accent.lime, 0.55) }]}>
                                <Ionicons name="arrow-forward" size={14} color={colors.accent.lime} />
                            </View>
                        </TouchableOpacity>
                    </Animated.View>

                    {/* Category Cards */}
                    <View style={[styles.sectionHeader, { marginTop: spacing['3xl'] }]}>
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
                        {MUSCLE_GROUPS.map((g, i) => (
                            <Animated.View key={g.bodyPart} entering={FadeInDown.delay(260 + i * 35).duration(380)}>
                                <TouchableOpacity
                                    activeOpacity={0.85}
                                    accessibilityRole="button"
                                    accessibilityLabel={`${g.label} exercises`}
                                    style={[styles.muscleChip, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}
                                    onPress={() => setActiveMuscle(g.bodyPart)}
                                >
                                    <View style={[styles.muscleDot, { backgroundColor: colors.accent.coral }]} />
                                    <Text style={[typography.caption, { color: colors.text.primary, fontWeight: 'bold' }]}>
                                        {g.label}
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
    // Step-1 gender gate (two full-height athlete cards) + the chosen-gender bar.
    genderGate: { flex: 1, flexDirection: 'row', gap: 14, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40 },
    genderCard: { flex: 1, borderRadius: 20, borderCurve: 'continuous', overflow: 'hidden', borderWidth: 1, justifyContent: 'flex-end' },
    genderCardContent: { padding: 16 },
    genderBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginBottom: 12 },
    genderOnlyPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1 },
    // Difficulty refinement (Beginner / Intermediate / Advanced)
    difficultyRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, marginBottom: 12 },
    difficultyChip: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 9, borderRadius: 10, borderWidth: 1 },
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
    // Body Focus feature banner (wide hero → women's body-area programs)
    bodyFocusCard: {
        width: '100%',
        height: 172,
        borderRadius: 20,
        borderCurve: 'continuous',
        overflow: 'hidden',
        justifyContent: 'flex-end',
    },
    bodyFocusContent: { padding: 16, alignItems: 'flex-start' },
    bodyFocusTag: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        borderWidth: 1,
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 4,
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
