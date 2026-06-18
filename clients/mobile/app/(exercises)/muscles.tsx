import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { searchLibrary, Exercise } from '@/api/exercises';
import { LinearGradient } from 'expo-linear-gradient';
import { withAlpha } from '@/theme/utils';
import { shadows } from '@/theme/shadows';
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
const CAT_CARDIO_IMG = require('../../assets/images/cat-cardio.png');
const CAT_RECOVERY_IMG = require('../../assets/images/cat-recovery.png');
const EXERCISE_FALLBACK_IMG = require('../../assets/images/exercise-detail-fallback.png');
const MUSCLE_GROUPS = [
    { id:'chest', label:'Chest', searchKey:'chest', color:'#FF6B35', image:MUSCLE_CHEST_IMG },
    { id:'back', label:'Back', searchKey:'back', color:'#00D4FF', image:MUSCLE_BACK_IMG },
    { id:'shoulders', label:'Shoulders', searchKey:'shoulders', color:'#A855F7', image:MUSCLE_SHOULDERS_IMG },
    { id:'arms', label:'Arms', searchKey:'upper arms', color:'#F59E0B', image:MUSCLE_ARMS_IMG },
    { id:'core', label:'Core & Abs', searchKey:'waist', color:'#2ECC71', image:MUSCLE_CORE_IMG },
    { id:'legs', label:'Legs', searchKey:'upper legs', color:'#EF4444', image:MUSCLE_LEGS_IMG },
    { id:'glutes', label:'Glutes', searchKey:'hips', color:'#EC4899', image:MUSCLE_LEGS_IMG },
    { id:'cardio', label:'Cardio', searchKey:'cardio', color:'#06B6D4', image:CAT_CARDIO_IMG },
];
const STRETCHING = [
    { id:'s-upper', label:'Upper Body Stretch', searchKey:'stretch chest', color:'#A855F7', image:MUSCLE_SHOULDERS_IMG },
    { id:'s-lower', label:'Lower Body Stretch', searchKey:'stretch legs', color:'#2ECC71', image:MUSCLE_LEGS_IMG },
    { id:'s-yoga', label:'Yoga & Mobility', searchKey:'yoga', color:'#F59E0B', image:CAT_RECOVERY_IMG },
];
type T = 'muscles'|'stretching';
export default function MuscleMapScreen() {
    const { colors, typography } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const [tab, setTab] = useState<T>('muscles');
    const [selectedId, setSelectedId] = useState<string|null>(null);
    const items = tab==='muscles' ? MUSCLE_GROUPS : STRETCHING;
    const sel = items.find(m=>m.id===selectedId);
    // Use bodyPart filter on the backend so we get every exercise tagged with
    // the muscle group, not just ones whose NAME contains the keyword.
    // (Without this, "Chest" matched "Chest Press" but missed "Bench Press".)
    const exQ = useQuery({
        queryKey:['muscle-ex', sel?.searchKey],
        queryFn:() => searchLibrary({ bodyPart: sel!.searchKey, limit: 200 }),
        enabled:!!sel,
    });
    const exercises = (exQ.data??[]) as Exercise[];
    return (
        <View style={[s.container,{backgroundColor:colors.background.primary}]}>
            <StatusBar style="light" />
            <View style={[s.header,{paddingTop:insets.top+16,borderBottomColor:colors.border.default}]}>
                <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Go back" onPress={()=>router.back()}><Ionicons name="arrow-back" size={24} color={colors.text.primary} /></TouchableOpacity>
                <Text style={[typography.heading,{color:colors.text.primary,fontSize:20}]}>Muscle Groups</Text>
                <View style={{width:24}} />
            </View>
            <View style={[s.switcher,{backgroundColor:colors.background.secondary,margin:20,marginBottom:4}]}>
                {(['muscles','stretching'] as T[]).map((t)=>(
                    <TouchableOpacity key={t} accessibilityRole="tab" accessibilityState={{ selected: tab===t }} accessibilityLabel={t} style={[s.switchBtn, tab===t&&{backgroundColor:colors.accent.coral},tab===t&&shadows.glow(colors.accent.coral)]} onPress={()=>{setTab(t);setSelectedId(null);}}>
                        <Text style={[typography.caption,{color:tab===t?'#FFF':colors.text.tertiary,fontWeight:'bold'}]}>{t.toUpperCase()}</Text>
                    </TouchableOpacity>
                ))}
            </View>
            <ScrollView contentContainerStyle={{padding:20,paddingBottom:100}} showsVerticalScrollIndicator={false}>
                <View style={{gap:10}}>
                    {items.map((m)=>{
                        const isSel = selectedId===m.id;
                        return (
                            <TouchableOpacity key={m.id} accessibilityRole="button" accessibilityState={{ selected: isSel }} accessibilityLabel={m.label} style={[s.card, isSel&&{borderColor:m.color,borderWidth:2}]} activeOpacity={0.85} onPress={()=>setSelectedId(isSel?null:m.id)}>
                                <Image source={m.image} style={StyleSheet.absoluteFillObject} contentFit="cover" cachePolicy="memory-disk" transition={200} />
                                <LinearGradient colors={[isSel?withAlpha(m.color,0.5):'transparent','rgba(0,0,0,0.8)']} style={StyleSheet.absoluteFillObject} />
                                {isSel&&<View style={[s.chk,{backgroundColor:m.color}]}><Ionicons name="checkmark" size={12} color="#FFF" /></View>}
                                <View style={s.cardContent}>
                                    <View style={[s.bar,{backgroundColor:m.color}]} />
                                    <View style={{flex:1,marginLeft:10}}>
                                        <Text style={[typography.subhead,{color:'#FFF',fontWeight:'bold'}]}>{m.label}</Text>
                                    </View>
                                    <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.5)" />
                                </View>
                            </TouchableOpacity>
                        );
                    })}
                </View>
                {sel&&(
                    <View style={{marginTop:24}}>
                        <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'baseline',marginBottom:14}}>
                            <Text style={[typography.heading,{color:colors.text.primary}]}>{sel.label} Exercises</Text>
                            {!exQ.isLoading && exercises.length > 0 && (
                                <Text style={[typography.caption,{color:colors.text.secondary}]}>{exercises.length} total</Text>
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
                                    : exercises.map((ex)=>(
                                    <TouchableOpacity key={ex.id} accessibilityRole="button" accessibilityLabel={ex.name} style={[s.exRow,{backgroundColor:colors.background.secondary,borderColor:colors.border.default}]} onPress={()=>router.push(`/(exercises)/${ex.id}` as any)} activeOpacity={0.8}>
                                        <Image source={ex.imageUrl?{uri:ex.imageUrl}:EXERCISE_FALLBACK_IMG} style={s.exThumb} contentFit="cover" cachePolicy="memory-disk" transition={200} />
                                        <View style={{flex:1,marginLeft:12}}>
                                            <Text style={[typography.subhead,{color:colors.text.primary,fontWeight:'bold'}]}>{ex.name}</Text>
                                            <Text style={[typography.caption,{color:colors.text.secondary}]}>{ex.equipment} • {ex.difficulty}</Text>
                                        </View>
                                        <Ionicons name="chevron-forward" size={16} color={colors.text.tertiary} />
                                    </TouchableOpacity>
                                ))
                        }
                    </View>
                )}
            </ScrollView>
        </View>
    );
}
const s = StyleSheet.create({
    container:{flex:1}, header:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:20,paddingBottom:16,borderBottomWidth:1},
    switcher:{flexDirection:'row',borderRadius:14,padding:4}, switchBtn:{flex:1,paddingVertical:10,borderRadius:10,alignItems:'center'},
    card:{height:72,borderRadius:16,overflow:'hidden',justifyContent:'flex-end',borderWidth:1,borderColor:'transparent'},
    chk:{position:'absolute',top:8,right:8,width:22,height:22,borderRadius:11,alignItems:'center',justifyContent:'center'},
    cardContent:{flexDirection:'row',alignItems:'center',padding:14}, bar:{width:4,height:32,borderRadius:2},
    exRow:{flexDirection:'row',alignItems:'center',padding:12,marginBottom:10,borderRadius:14,borderWidth:1},
    exThumb:{width:52,height:52,borderRadius:10},
});
