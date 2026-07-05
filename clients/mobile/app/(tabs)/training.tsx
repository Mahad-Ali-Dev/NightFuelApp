/**
 * Train — Zeitra Workouts screen.
 *
 * Rebuilt 1:1 from the design mockup `app_images/backups/train-preview.html`.
 * Flat dark (#0A0C12) surface, brighter design-lime (#C2F03C, now the theme
 * brand). Sections, top→bottom:
 *   1. header — circular search button (→ exercise library) · "Workouts" title ·
 *      lime avatar (→ profile)
 *   2. "Workout of the Day" — WodCarousel (hero card + lime Start pill + dots)
 *   3. "Browse by style" — the interlocking lime-glow bento (BentoBrowse, incl.
 *      the SVG L-shape Strength card)
 *   4. "Target a muscle group" — horizontal MuscleCard carousel
 * A slim "session in progress" resume banner shows above the WOD only when a
 * workout is live (not in the mockup's happy-path state, but kept for UX).
 * The Ria FAB + bottom tab bar are provided globally by (tabs)/_layout.tsx.
 *
 * The previous build's TRAIN/PLAN switcher, weekly-stat row, "Your Routines"
 * carousel and the whole "My Plan" tab are intentionally dropped to match the
 * mockup — routines/plans remain reachable from the exercise library.
 */
import React, { useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { useRouter, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { getActiveSession } from '@/api/exercises';
import { useAuthStore } from '@/store/authStore';
import { typography } from '@/theme';
import { WodCarousel, BentoBrowse, MuscleCard, MUSCLE_CARD_W } from '@/components/TrainingCards';
import { ExerciseRail } from '@/components/exercise/ExerciseRail';
import { useThemedPalette, type ThemedPalette } from '@/theme/useThemedPalette';
import { isLightHex } from '@/theme/utils';
import { TAB_BAR_H } from './_layout';

// Bundled figure art (offline-safe — '@/*' → ./src, required by relative path).
const HERO_FEMALE_1 = require('../../assets/images/hero-female-1.png');
const HERO_FEMALE_2 = require('../../assets/images/hero-female-2.png');
const MUSCLE_CARDIO_M = require('../../assets/images/muscle-cardio-male.png');
const MUSCLE_CHEST_M = require('../../assets/images/muscle-chest-male.png');
const MUSCLE_BACK_M = require('../../assets/images/muscle-back-male.png');
const MUSCLE_SHOULDERS_M = require('../../assets/images/muscle-shoulders-male.png');
const MUSCLE_ARMS_M = require('../../assets/images/muscle-arms-male.png');
const MUSCLE_CORE_M = require('../../assets/images/muscle-core-male.png');
const MUSCLE_LEGS_M = require('../../assets/images/muscle-legs-male.png');
const CAT_GYM = require('../../assets/images/cat-gym.png');
const CAT_HOME = require('../../assets/images/cat-home.png');
const CAT_CARDIO = require('../../assets/images/cat-cardio.png');
const CAT_RECOVERY = require('../../assets/images/cat-recovery.png');
// Bright/airy light-theme variants of the category photos.
const CAT_GYM_L = require('../../assets/images/cat-gym-light.jpg');
const CAT_HOME_L = require('../../assets/images/cat-home-light.jpg');
const CAT_CARDIO_L = require('../../assets/images/cat-cardio-light.jpg');
const CAT_RECOVERY_L = require('../../assets/images/cat-recovery-light.jpg');
const { width: WIDTH } = Dimensions.get('window');

// Real exercise categories for the "Explore by category" section → guided flow.
const CATEGORIES = [
  { key: 'gym', label: 'Gym', desc: 'Barbell · Machines', img: CAT_GYM, imgLight: CAT_GYM_L },
  { key: 'home', label: 'Home', desc: 'Bodyweight · Anywhere', img: CAT_HOME, imgLight: CAT_HOME_L },
  { key: 'cardio', label: 'Cardio', desc: 'HIIT · Endurance', img: CAT_CARDIO, imgLight: CAT_CARDIO_L },
  { key: 'kegel', label: 'Recovery', desc: 'Mobility · Pelvic floor', img: CAT_RECOVERY, imgLight: CAT_RECOVERY_L },
];

// ─── Design palette — now theme-derived via useThemedPalette() inside the
// component (so Train recolors with the selected theme); styles read it through
// the makeStyles(D) factory below. ───────────────────────────────────────────

// "Browse by style" bento tiles — z-order HIIT / Strength(L) / Cardio(notch) /
// Yoga / Mobility / Pilates; each keeps its real exercise-library deep-link.
const STYLES = [
    { id: 'hiit', title: 'HIIT', icon: 'flame' as const, img: HERO_FEMALE_1, route: '/(exercises)/gender?category=cardio' },
    { id: 'strength', title: 'Strength', icon: 'barbell' as const, img: MUSCLE_CHEST_M, route: '/(exercises)/gender?category=gym' },
    { id: 'cardio', title: 'Cardio', icon: 'heart' as const, img: MUSCLE_CARDIO_M, route: '/(exercises)/gender?category=cardio' },
    { id: 'yoga', title: 'Yoga', icon: 'body' as const, img: HERO_FEMALE_2, route: '/(exercises)/gender?category=home' },
    { id: 'mobility', title: 'Mobility', icon: 'accessibility' as const, img: MUSCLE_BACK_M, route: '/(exercises)/gender?category=home' },
    { id: 'pilates', title: 'Pilates', icon: 'pulse' as const, img: MUSCLE_LEGS_M, route: '/(exercises)/gender?category=kegel' },
];

// Muscle-group carousel — order + indicative counts per the mockup. `bodyPart` is
// the ExerciseDB key the library filters by (contains-match: 'arm'→upper+lower arms,
// 'leg'→upper+lower legs, 'waist'→core/abs); tapping a card lands on the library
// pre-filtered to that muscle (and the user's gender).
const MUSCLES = [
    // Counts = live catalog totals for each bodyPart filter (arm = upper+lower arms,
    // leg = upper+lower legs). Snapshot of the prod DB (2026-06-28).
    { id: 'chest', label: 'Chest', img: MUSCLE_CHEST_M, count: 480, bodyPart: 'chest' },
    { id: 'back', label: 'Back', img: MUSCLE_BACK_M, count: 654, bodyPart: 'back' },
    { id: 'shoulders', label: 'Shoulders', img: MUSCLE_SHOULDERS_M, count: 467, bodyPart: 'shoulders' },
    { id: 'arms', label: 'Arms', img: MUSCLE_ARMS_M, count: 693, bodyPart: 'arm' },
    { id: 'legs', label: 'Legs', img: MUSCLE_LEGS_M, count: 1289, bodyPart: 'leg' },
    { id: 'core', label: 'Core', img: MUSCLE_CORE_M, count: 776, bodyPart: 'waist' },
];

// Workout-of-the-Day pages (no WOD API yet → curated; Start routes to onboarding).
const WODS = [
    { id: 'wod-fullbody', title: 'Full Body Blast', meta: '45 min · 8 exercises', img: MUSCLE_CHEST_M },
    { id: 'wod-upper', title: 'Upper Power', meta: '38 min · 7 exercises', img: MUSCLE_BACK_M },
    { id: 'wod-lower', title: 'Leg Day', meta: '42 min · 6 exercises', img: MUSCLE_LEGS_M },
    { id: 'wod-core', title: 'Core Crusher', meta: '25 min · 9 exercises', img: MUSCLE_CORE_M },
];

export default function TrainingHubScreen() {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const { user } = useAuthStore();
    const D = useThemedPalette();
    const st = useMemo(() => makeStyles(D), [D]);
    const isLight = isLightHex(D.bg);
    const initial = (((user as any)?.displayName ?? user?.name ?? 'Z').trim().charAt(0) || 'Z').toUpperCase();

    const sessionQ = useQuery({ queryKey: ['active-session'], queryFn: getActiveSession, refetchOnMount: 'always', staleTime: 0 });
    useFocusEffect(useCallback(() => { sessionQ.refetch(); }, []));
    const activeSession = sessionQ.data && !sessionQ.data.endedAt ? sessionQ.data : null;

    return (
        <View style={[st.root, { backgroundColor: D.bg }]}>
            <StatusBar style="light" />

            {/* ══ HEADER ══════════════════════════════════════════════════ */}
            <View style={[st.header, { paddingTop: insets.top + 10 }]}>
                <TouchableOpacity
                    style={st.searchBtn} activeOpacity={0.85}
                    onPress={() => router.push('/(exercises)' as any)}
                    accessibilityRole="button" accessibilityLabel="Search exercises"
                >
                    <Ionicons name="search" size={20} color={D.text} />
                </TouchableOpacity>
                <Text style={st.title}>Workouts</Text>
                <TouchableOpacity
                    style={st.avatar} activeOpacity={0.85}
                    onPress={() => router.push('/(tabs)/profile' as any)}
                    accessibilityRole="button" accessibilityLabel="Profile"
                >
                    <Text style={st.avatarTxt}>{initial}</Text>
                </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: TAB_BAR_H + 96 }}>
                {/* Resume banner — only when a workout is live. */}
                {activeSession && (
                    <Animated.View entering={FadeInDown.duration(360)}>
                        <TouchableOpacity
                            style={st.resume} activeOpacity={0.9}
                            onPress={() => router.push('/training/workout' as any)}
                            accessibilityRole="button" accessibilityLabel="Session in progress, resume"
                        >
                            <View style={st.resumeIcon}><Ionicons name="play" size={16} color={D.ink} /></View>
                            <View style={{ flex: 1 }}>
                                <Text style={st.resumeTitle}>Session in progress</Text>
                                <Text style={st.resumeSub}>Tap to resume</Text>
                            </View>
                            <Ionicons name="chevron-forward" size={20} color={D.lime} />
                        </TouchableOpacity>
                    </Animated.View>
                )}

                {/* ══ WORKOUT OF THE DAY ══════════════════════════════════ */}
                <Animated.View entering={FadeInDown.delay(60).duration(440)}>
                    <Text style={st.sectionTitle}>Workout of the Day</Text>
                    <WodCarousel items={WODS} onStart={() => router.push('/training/onboarding' as any)} />
                </Animated.View>

                {/* ══ POPULAR MOVES — image cards → tap for how-to ════════ */}
                <ExerciseRail title="Popular moves" bodyPart="back" />

                {/* ══ BROWSE BY STYLE ═════════════════════════════════════ */}
                <Animated.View entering={FadeInDown.delay(120).duration(440)}>
                    <Text style={[st.sectionTitle, { marginTop: 8 }]}>Browse by style</Text>
                    <View style={st.bentoWrap}>
                        <BentoBrowse
                            items={STYLES.map((c) => ({
                                id: c.id, title: c.title, icon: c.icon, img: c.img,
                                onPress: () => router.push(c.route as any),
                            }))}
                        />
                    </View>
                </Animated.View>

                {/* ══ TARGET A MUSCLE GROUP ═══════════════════════════════ */}
                <Animated.View entering={FadeInDown.delay(160).duration(440)}>
                    <View style={st.muscleHead}>
                        <Text style={st.sectionTitle2}>Target a muscle group</Text>
                        <TouchableOpacity
                            style={st.allLink} activeOpacity={0.85} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            onPress={() => router.push('/(exercises)/gender' as any)}
                            accessibilityRole="button" accessibilityLabel="Browse exercises by muscle"
                        >
                            <Text style={st.allTxt}>Browse</Text>
                            <Ionicons name="chevron-forward" size={15} color={D.muted} />
                        </TouchableOpacity>
                    </View>
                    <ScrollView
                        horizontal showsHorizontalScrollIndicator={false} decelerationRate="fast"
                        snapToInterval={MUSCLE_CARD_W + 12} snapToAlignment="start"
                        contentContainerStyle={{ paddingHorizontal: 16, gap: 12, paddingBottom: 4 }}
                    >
                        {MUSCLES.map((m, idx) => (
                            <MuscleCard
                                key={m.id} index={idx} label={m.label} img={m.img} count={m.count}
                                accessibilityLabel={`${m.label} exercises`}
                                onPress={() => router.push({ pathname: '/(exercises)', params: { muscle: m.bodyPart } } as any)}
                            />
                        ))}
                    </ScrollView>
                </Animated.View>

                {/* ══ EXPLORE BY CATEGORY ═══════════════════════════════ */}
                <Animated.View entering={FadeInDown.delay(200).duration(440)}>
                    <Text style={[st.sectionTitle, { paddingTop: 26 }]}>Explore by category</Text>
                    <View style={st.catGrid}>
                        {CATEGORIES.map((c) => (
                            <TouchableOpacity
                                key={c.key} style={st.catCard} activeOpacity={0.85}
                                accessibilityRole="button" accessibilityLabel={`${c.label} exercises`}
                                onPress={() => router.push(`/(exercises)/gender?category=${c.key}` as any)}
                            >
                                <Image source={isLight ? c.imgLight : c.img} style={StyleSheet.absoluteFillObject} contentFit="cover" cachePolicy="memory-disk" />
                                <LinearGradient colors={isLight ? ['transparent', 'rgba(247,249,252,0.94)'] : ['transparent', 'rgba(10,12,18,0.92)']} style={StyleSheet.absoluteFillObject} />
                                <View style={st.catText}>
                                    <Text style={[st.catLabel, isLight && { color: '#15181F' }]}>{c.label}</Text>
                                    <Text style={[st.catDesc, isLight && { color: 'rgba(21,24,31,0.62)' }]}>{c.desc}</Text>
                                </View>
                                <View style={st.catArrow}><Ionicons name="arrow-forward" size={14} color={D.lime} /></View>
                            </TouchableOpacity>
                        ))}
                    </View>
                </Animated.View>
            </ScrollView>
        </View>
    );
}

const makeStyles = (D: ThemedPalette) => StyleSheet.create({
    root: { flex: 1 },

    // Header
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingBottom: 6 },
    searchBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: D.card, borderWidth: 1, borderColor: D.border, alignItems: 'center', justifyContent: 'center' },
    title: [typography.subtitle, { color: D.text, fontSize: 19, letterSpacing: -0.2 }] as any,
    avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: D.avBg, borderWidth: 1.5, borderColor: D.avBd, alignItems: 'center', justifyContent: 'center' },
    avatarTxt: [typography.subtitle, { color: D.lime, fontSize: 16 }] as any,

    // Section titles (16px / 600 white, sentence case)
    sectionTitle: [typography.subtitle, { color: D.text, fontSize: 16, paddingHorizontal: 18, paddingTop: 14, paddingBottom: 10 }] as any,
    sectionTitle2: [typography.subtitle, { color: D.text, fontSize: 16 }] as any,

    // Resume banner
    resume: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, marginTop: 12, padding: 12, borderRadius: 16, backgroundColor: D.card, borderWidth: 1, borderColor: D.border },
    resumeIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: D.lime, alignItems: 'center', justifyContent: 'center' },
    resumeTitle: [typography.bodyMedium, { color: D.text, fontSize: 14 }] as any,
    resumeSub: [typography.caption, { color: D.muted, fontSize: 11 }] as any,

    // Browse-by-style bento (BentoBrowse self-sizes/centres; this owns the rhythm)
    bentoWrap: { marginBottom: 4 },

    // Muscle section header
    muscleHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 24, paddingBottom: 12 },
    allLink: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    allTxt: [typography.caption, { color: D.muted, fontSize: 12.5 }] as any,

    // Explore-by-category grid
    catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: 16, paddingTop: 2, paddingBottom: 4 },
    catCard: { width: (WIDTH - 44) / 2, height: 110, borderRadius: 18, borderCurve: 'continuous', overflow: 'hidden', backgroundColor: D.card, borderWidth: 1, borderColor: D.border, justifyContent: 'flex-end' },
    catText: { padding: 13 },
    catLabel: [typography.subtitle, { color: '#FFF', fontSize: 16 }] as any,
    catDesc: [typography.caption, { color: 'rgba(255,255,255,0.6)', fontSize: 10.5, marginTop: 1 }] as any,
    catArrow: { position: 'absolute', top: 10, right: 10, width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(194,240,60,0.16)', borderWidth: 1, borderColor: 'rgba(194,240,60,0.5)', alignItems: 'center', justifyContent: 'center' },
});
