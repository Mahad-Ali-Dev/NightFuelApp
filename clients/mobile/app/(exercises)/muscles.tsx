import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Pressable, Platform, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { searchLibrary, Exercise } from '@/api/exercises';
import { getMyProfile } from '@/api/profile';
import { LinearGradient } from 'expo-linear-gradient';
import { withAlpha } from '@/theme/utils';
import { shadows } from '@/theme/shadows';
import Animated, { FadeInDown, useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { Skeleton, EmptyState } from '@/components/ui';
// Bundled Aurora dark-glass art (no external host → offline-safe, no 404 /
// rate-limit). '@/*' resolves to ./src, so assets are required by relative path
// — same module-scope require pattern as (exercises)/index.tsx ([id].tsx FALLBACK).
const MUSCLE_CHEST_IMG = require('../../assets/images/muscle-chest.png');
const MUSCLE_BACK_IMG = require('../../assets/images/muscle-back.png');
const MUSCLE_SHOULDERS_IMG = require('../../assets/images/muscle-shoulders.png');
const MUSCLE_ARMS_IMG = require('../../assets/images/muscle-arms.png');
const MUSCLE_LEGS_IMG = require('../../assets/images/muscle-legs.png');
const MUSCLE_CORE_IMG = require('../../assets/images/muscle-core.png');
// Gender-aware muscle tiles. The biological sex collected at onboarding picks
// female vs male art (male is the default for MALE / OTHER / PREFER_NOT_TO_SAY
// / unknown). Same module-scope require() pattern as the ungendered tiles above.
const MUSCLE_GENDERED = {
    chest:     { male: require('../../assets/images/muscle-chest-male.png'),     female: require('../../assets/images/muscle-chest-female.png') },
    back:      { male: require('../../assets/images/muscle-back-male.png'),      female: require('../../assets/images/muscle-back-female.png') },
    shoulders: { male: require('../../assets/images/muscle-shoulders-male.png'), female: require('../../assets/images/muscle-shoulders-female.png') },
    arms:      { male: require('../../assets/images/muscle-arms-male.png'),      female: require('../../assets/images/muscle-arms-female.png') },
    core:      { male: require('../../assets/images/muscle-core-male.png'),      female: require('../../assets/images/muscle-core-female.png') },
    legs:      { male: require('../../assets/images/muscle-legs-male.png'),      female: require('../../assets/images/muscle-legs-female.png') },
} as const;
// Maps a tile id → one of the 6 gendered groups (chest/back/shoulders/arms/
// core/legs). Glutes rides the legs art (as it did ungendered). Tiles without
// an entry (cardio, stretching) keep their existing ungendered image.
const GROUP_FOR_TILE: Record<string, keyof typeof MUSCLE_GENDERED> = {
    chest: 'chest', back: 'back', shoulders: 'shoulders', arms: 'arms',
    core: 'core', legs: 'legs', glutes: 'legs',
};
const CAT_CARDIO_IMG = require('../../assets/images/cat-cardio.png');
const CAT_RECOVERY_IMG = require('../../assets/images/cat-recovery.png');
const EXERCISE_FALLBACK_IMG = require('../../assets/images/exercise-detail-fallback.png');
// Per-group accent COLOR-KEY (resolved against useTheme() accent tokens at
// render — no raw hex). Chest is the brand lime (accent.coral). The rest spread
// across the Aurora accent palette so each group reads distinctly while staying
// on-brand. Keys are theme tokens, not literals, so a palette swap re-themes.
type AccentKey = 'coral' | 'blue' | 'purple' | 'amber' | 'cyan' | 'red' | 'pink' | 'emerald';
const MUSCLE_GROUPS: { id: string; label: string; searchKey: string; accent: AccentKey; image: number }[] = [
    { id:'chest', label:'Chest', searchKey:'chest', accent:'coral', image:MUSCLE_CHEST_IMG },
    { id:'back', label:'Back', searchKey:'back', accent:'blue', image:MUSCLE_BACK_IMG },
    { id:'shoulders', label:'Shoulders', searchKey:'shoulders', accent:'purple', image:MUSCLE_SHOULDERS_IMG },
    { id:'arms', label:'Arms', searchKey:'upper arms', accent:'amber', image:MUSCLE_ARMS_IMG },
    { id:'core', label:'Core & Abs', searchKey:'waist', accent:'emerald', image:MUSCLE_CORE_IMG },
    { id:'legs', label:'Legs', searchKey:'upper legs', accent:'red', image:MUSCLE_LEGS_IMG },
    { id:'glutes', label:'Glutes', searchKey:'hips', accent:'pink', image:MUSCLE_LEGS_IMG },
    { id:'cardio', label:'Cardio', searchKey:'cardio', accent:'cyan', image:CAT_CARDIO_IMG },
];
const STRETCHING: { id: string; label: string; searchKey: string; accent: AccentKey; image: number }[] = [
    { id:'s-upper', label:'Upper Body Stretch', searchKey:'stretch chest', accent:'purple', image:MUSCLE_SHOULDERS_IMG },
    { id:'s-lower', label:'Lower Body Stretch', searchKey:'stretch legs', accent:'emerald', image:MUSCLE_LEGS_IMG },
    { id:'s-yoga', label:'Yoga & Mobility', searchKey:'yoga', accent:'amber', image:CAT_RECOVERY_IMG },
];
type T = 'muscles'|'stretching';

const { width } = Dimensions.get('window');
// 2-col grid: screen padding (20*2) + inter-tile gap (12).
const TILE_W = (width - 40 - 12) / 2;

// Exercise row — Pressable with an interruptible pressed-scale (0.96) + a
// staggered FadeInDown entrance. transform/opacity only.
function ExerciseRow({ ex, index, onPress, colors, typography }: any) {
    const scale = useSharedValue(1);
    const aStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
    return (
        <Animated.View entering={FadeInDown.delay(Math.min(index, 12) * 40).springify().damping(18).mass(0.7)}>
            <Animated.View style={aStyle}>
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={ex.name}
                    hitSlop={{ top: 4, bottom: 4, left: 0, right: 0 }}
                    onPressIn={() => { scale.value = withSpring(0.96, { damping: 18, mass: 0.7 }); }}
                    onPressOut={() => { scale.value = withSpring(1, { damping: 18, mass: 0.7 }); }}
                    style={[s.exRow, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}
                    onPress={onPress}
                >
                    <Image source={ex.imageUrl ? { uri: ex.imageUrl } : EXERCISE_FALLBACK_IMG} style={s.exThumb} contentFit="cover" cachePolicy="memory-disk" recyclingKey={ex.id} transition={200} />
                    <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: 'bold' }]}>{ex.name}</Text>
                        <Text style={[typography.caption, { color: colors.text.secondary }]}>{ex.equipment} • {ex.difficulty}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.text.tertiary} />
                </Pressable>
            </Animated.View>
        </Animated.View>
    );
}

// Muscle-group tile — taller image tile in a 2-col grid. FadeInDown stagger
// (i*40) + pressed-scale 0.96. Border + checkmark route through theme tokens.
function MuscleTile({ item, index, isSel, accent, onPress, colors, typography }: any) {
    const scale = useSharedValue(1);
    const aStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
    return (
        <Animated.View entering={FadeInDown.delay(index * 40).springify().damping(18).mass(0.7)} style={{ width: TILE_W }}>
            <Animated.View style={aStyle}>
                <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSel }}
                    accessibilityLabel={item.label}
                    onPressIn={() => { scale.value = withSpring(0.96, { damping: 18, mass: 0.7 }); }}
                    onPressOut={() => { scale.value = withSpring(1, { damping: 18, mass: 0.7 }); }}
                    style={[
                        s.tile,
                        { borderColor: colors.border.default },
                        isSel && { borderColor: accent, borderWidth: 2, ...shadows.glow(accent) },
                    ]}
                    onPress={onPress}
                >
                    <Image source={item.image} style={StyleSheet.absoluteFillObject} contentFit="cover" cachePolicy="memory-disk" transition={200} />
                    <LinearGradient colors={[isSel ? withAlpha(accent, 0.45) : 'transparent', 'rgba(0,0,0,0.82)']} style={StyleSheet.absoluteFillObject} />
                    {/* Accent rail — second non-color cue beyond the border. */}
                    <View style={[s.tileRail, { backgroundColor: accent }]} />
                    {isSel && (
                        <View style={[s.chk, { backgroundColor: accent }]}>
                            <Ionicons name="checkmark" size={13} color={colors.text.inverse} />
                        </View>
                    )}
                    <View style={s.tileContent}>
                        <Text style={[typography.h3, { color: colors.text.primary }]} numberOfLines={2}>{item.label}</Text>
                    </View>
                </Pressable>
            </Animated.View>
        </Animated.View>
    );
}

export default function MuscleMapScreen() {
    const { colors, typography } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const [tab, setTab] = useState<T>('muscles');
    const [selectedId, setSelectedId] = useState<string|null>(null);
    const items = tab==='muscles' ? MUSCLE_GROUPS : STRETCHING;
    const sel = items.find(m=>m.id===selectedId);
    // Gender-aware tile art. Same accessor as (performance)/cycle.tsx: the
    // 'my-profile' query is shared cache (no extra fetch), and biologicalSex is
    // read defensively (it isn't on the UserProfile TS type). FEMALE → female
    // art; everything else (MALE / OTHER / PREFER_NOT_TO_SAY / not-yet-loaded)
    // → male, which is the default. ONLY swaps the image for the 6 mapped groups.
    const { data: profile } = useQuery({ queryKey: ['my-profile'], queryFn: getMyProfile });
    const isFemale = ((profile as any)?.biologicalSex ?? '').toString().toUpperCase() === 'FEMALE';
    const imageFor = useCallback((m: { id: string; image: number }) => {
        const group = GROUP_FOR_TILE[m.id];
        return group ? MUSCLE_GENDERED[group][isFemale ? 'female' : 'male'] : m.image;
    }, [isFemale]);
    // Resolve a group's accent KEY to a live theme token (never a raw hex).
    const accentOf = useCallback((key: AccentKey) => colors.accent[key] ?? colors.accent.coral, [colors]);
    // Use bodyPart filter on the backend so we get every exercise tagged with
    // the muscle group, not just ones whose NAME contains the keyword.
    // (Without this, "Chest" matched "Chest Press" but missed "Bench Press".)
    const exQ = useQuery({
        queryKey:['muscle-ex', sel?.searchKey],
        queryFn:() => searchLibrary({ bodyPart: sel!.searchKey, limit: 200 }),
        enabled:!!sel,
    });
    const exercises = (exQ.data??[]) as Exercise[];
    const keyExtractor = useCallback((ex: Exercise) => ex.id, []);
    const renderItem = useCallback(({ item: ex, index }: { item: Exercise; index: number }) => (
        <ExerciseRow
            ex={ex}
            index={index}
            colors={colors}
            typography={typography}
            onPress={()=>router.push(`/(exercises)/${ex.id}` as any)}
        />
    ), [colors, typography, router]);
    // The muscle-group cards, the section title, and the loading/error/empty
    // states all live ABOVE the exercise list, so they ride in the FlatList
    // header. The list itself only ever virtualizes the (up to 200) exercise
    // rows — fixing the previous ScrollView+map that mounted all 200 at once.
    const ListHeader = (
        <>
            <View style={s.grid}>
                {items.map((m, i)=>{
                    const isSel = selectedId===m.id;
                    return (
                        <MuscleTile
                            key={m.id}
                            item={{ ...m, image: imageFor(m) }}
                            index={i}
                            isSel={isSel}
                            accent={accentOf(m.accent)}
                            colors={colors}
                            typography={typography}
                            onPress={()=>setSelectedId(isSel?null:m.id)}
                        />
                    );
                })}
            </View>
            {sel&&(
                <View style={{marginTop:24}}>
                    <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'flex-end',marginBottom:14}}>
                        <Text style={[typography.h2,{color:colors.text.primary}]}>{sel.label} Exercises</Text>
                        {!exQ.isLoading && exercises.length > 0 && (
                            <View style={{alignItems:'flex-end'}}>
                                <Text style={[typography.statMedium,{color:colors.text.primary}]}>{exercises.length}</Text>
                                <Text style={[typography.overline,{color:colors.accent.coral,marginTop:-2}]}>EXERCISES</Text>
                            </View>
                        )}
                    </View>
                    {exQ.isLoading
                        ? <View>{[0,1,2,3,4].map((i)=>(
                            <View key={i} style={[s.exRow,{backgroundColor:colors.background.secondary,borderColor:colors.border.default}]}>
                                <Skeleton width={52} height={52} radius={10} />
                                <View style={{flex:1,marginLeft:12}}>
                                    <Skeleton width="65%" height={16} radius={6} />
                                    <Skeleton width="45%" height={12} radius={6} style={{marginTop:8}} />
                                </View>
                            </View>
                          ))}</View>
                        : exQ.isError
                            ? <EmptyState icon="cloud-offline-outline" title="Couldn't load exercises" subtitle="Something went wrong. Check your connection and try again." actionLabel="Try Again" onAction={()=>exQ.refetch()} />
                            : exercises.length===0
                                ? <EmptyState icon="barbell-outline" title="No exercises found" subtitle={`We don't have any ${sel.label.toLowerCase()} exercises tagged yet. Try another group.`} />
                                : null
                    }
                </View>
            )}
        </>
    );
    return (
        <View style={[s.container,{backgroundColor:colors.background.primary}]}>
            <StatusBar style="light" />
            <View style={[s.header,{paddingTop:insets.top+16,borderBottomColor:colors.border.default}]}>
                <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Go back" onPress={()=>router.back()}><Ionicons name="arrow-back" size={24} color={colors.text.primary} /></TouchableOpacity>
                <Text style={[typography.h2,{color:colors.text.primary}]}>{tab==='muscles' ? 'Muscle Groups' : 'Stretching & Mobility'}</Text>
                <View style={{width:24}} />
            </View>
            <View style={[s.switcher,{backgroundColor:colors.background.secondary,margin:20,marginBottom:4}]}>
                {(['muscles','stretching'] as T[]).map((t)=>(
                    <TouchableOpacity key={t} accessibilityRole="tab" accessibilityState={{ selected: tab===t }} accessibilityLabel={t} style={[s.switchBtn, tab===t&&{backgroundColor:colors.accent.coral},tab===t&&shadows.glow(colors.accent.coral)]} onPress={()=>{setTab(t);setSelectedId(null);}}>
                        <Text style={[typography.caption,{color:tab===t?colors.text.inverse:colors.text.tertiary,fontWeight:'bold'}]}>{t.toUpperCase()}</Text>
                    </TouchableOpacity>
                ))}
            </View>
            <FlatList
                data={sel && !exQ.isLoading && !exQ.isError ? exercises : []}
                keyExtractor={keyExtractor}
                renderItem={renderItem}
                ListHeaderComponent={ListHeader}
                contentContainerStyle={{padding:20,paddingBottom:100}}
                showsVerticalScrollIndicator={false}
                removeClippedSubviews={Platform.OS === 'android'}
                initialNumToRender={10}
                maxToRenderPerBatch={10}
                windowSize={7}
                keyboardShouldPersistTaps="handled"
            />
        </View>
    );
}
const s = StyleSheet.create({
    container:{flex:1}, header:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:20,paddingBottom:16,borderBottomWidth:1},
    switcher:{flexDirection:'row',borderRadius:14,padding:4}, switchBtn:{flex:1,paddingVertical:10,borderRadius:10,alignItems:'center'},
    // 2-col grid of taller image tiles (premium hierarchy vs the old 72px bars).
    grid:{flexDirection:'row',flexWrap:'wrap',gap:12},
    tile:{height:128,borderRadius:18,borderCurve:'continuous',overflow:'hidden',justifyContent:'flex-end',borderWidth:1},
    tileRail:{position:'absolute',left:0,top:0,bottom:0,width:3},
    tileContent:{padding:12},
    chk:{position:'absolute',top:8,right:8,width:24,height:24,borderRadius:12,alignItems:'center',justifyContent:'center'},
    exRow:{flexDirection:'row',alignItems:'center',padding:12,marginBottom:10,borderRadius:14,borderWidth:1},
    exThumb:{width:52,height:52,borderRadius:10},
});
