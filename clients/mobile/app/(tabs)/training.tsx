import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions, ImageBackground } from 'react-native';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
import { TAB_BAR_H } from './_layout';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/utils';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { getRoutines, getActiveSession, Routine } from '@/api/exercises';
import { Skeleton, EmptyState } from '@/components/ui';
import { LinearGradient } from 'expo-linear-gradient';
const { width } = Dimensions.get('window');
// Bundled Aurora dark-glass art (no external host → offline-safe, no 404 /
// rate-limit). '@/*' resolves to ./src, so assets are required by relative path
// — same module-scope require pattern as (exercises)/index.tsx.
const HERO_TRAINING = require('../../assets/images/hero-training.png');
const CAT_GYM_IMG = require('../../assets/images/cat-gym.png');
const CAT_HOME_IMG = require('../../assets/images/cat-home.png');
const CAT_CARDIO_IMG = require('../../assets/images/cat-cardio.png');
const CAT_RECOVERY_IMG = require('../../assets/images/cat-recovery.png');
const QA_WORKOUT_IMG = require('../../assets/images/qa-workout.png');
const MUSCLE_CHEST_IMG = require('../../assets/images/muscle-chest.png');
const MUSCLE_BACK_IMG = require('../../assets/images/muscle-back.png');
// Category accents map to canonical Aurora theme tokens (module scope can't read
// the hook, so we use the exact accent hex values from '@/theme/colors').
const CATS = [
    { id:'gym', title:'Gym', img:CAT_GYM_IMG, route:'/(exercises)?category=gym', color:'#FF6B35' },
    { id:'home', title:'Home', img:CAT_HOME_IMG, route:'/(exercises)?category=home', color:'#00D4AA' },
    { id:'cardio', title:'Cardio', img:CAT_CARDIO_IMG, route:'/(exercises)?category=cardio', color:'#10B981' },
    { id:'recover', title:'Recovery', img:CAT_RECOVERY_IMG, route:'/(exercises)?category=kegel', color:'#7C4DFF' },
];
// Static routine-card artwork (constant — hoisted out of render to avoid
// re-allocating this array on every routine row). Bundled, rotated by index%4.
const ROUTINE_IMGS = [
    QA_WORKOUT_IMG,
    MUSCLE_CHEST_IMG,
    MUSCLE_BACK_IMG,
    CAT_GYM_IMG,
];
type TTab = 'train'|'plan';
export default function TrainingHubScreen() {
    const { colors, typography, borderRadius, spacing, shadows } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const [tab, setTab] = useState<TTab>('train');
    const routinesQ = useQuery({ queryKey:['routines'], queryFn:getRoutines });
    const sessionQ = useQuery({ queryKey:['active-session'], queryFn:getActiveSession, refetchOnMount: 'always', staleTime: 0 });
    const routines = (routinesQ.data ?? []) as Routine[];
    const activeSession = sessionQ.data && !sessionQ.data.endedAt ? sessionQ.data : null;

    // Refetch session every time this tab gains focus
    useFocusEffect(useCallback(() => { sessionQ.refetch(); }, []));
    const activePlan = routines[0] ?? null;
    return (
        <ImageBackground blurRadius={4} source={HERO_TRAINING} style={[s.container,{backgroundColor:colors.background.primary}]} imageStyle={{opacity:0.35}}>
            <LinearGradient colors={['rgba(10,10,13,0.8)',colors.background.primary]} style={StyleSheet.absoluteFillObject} />
            <View style={[s.hdr,{paddingTop:insets.top+20}]}>
                <View><Text style={[typography.display,{color:colors.text.primary,fontSize:34}]}>Training</Text><Text style={[typography.body,{color:colors.text.secondary,marginTop:2}]}>Level up your strength today.</Text></View>
                <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="History" style={[s.iconBtn,{backgroundColor:colors.background.secondary,borderWidth:1,borderColor:colors.border.default}]} onPress={()=>router.push('/(exercises)/history' as any)}><Ionicons name="time-outline" size={22} color={colors.text.primary} /></TouchableOpacity>
            </View>
            <View style={[s.switcher,{backgroundColor:colors.background.secondary,borderWidth:1,borderColor:colors.border.default,marginHorizontal:20,marginBottom:20}]}>
                {(['train','plan'] as TTab[]).map((t)=>(
                    <TouchableOpacity key={t} activeOpacity={0.85} accessibilityRole="tab" accessibilityState={{ selected: tab===t }} style={[s.swBtn,tab===t&&{backgroundColor:colors.accent.coral,...shadows.glow(colors.accent.coral)}]} onPress={()=>setTab(t)}>
                        <Text style={[typography.overline,{color:tab===t?colors.text.primary:colors.text.secondary}]}>{t==='train'?'TRAINING':'MY PLAN'}</Text>
                    </TouchableOpacity>
                ))}
            </View>
            {tab==='train'?(
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{paddingBottom:TAB_BAR_H+80}}>
                    {activeSession ? (
                        <TouchableOpacity activeOpacity={0.9} accessibilityRole="button" accessibilityLabel="Session in progress, touch to resume" style={[s.activeWrap,{marginHorizontal:20,marginBottom:24},shadows.glow(colors.accent.pink)]} onPress={()=>router.push('/training/workout' as any)}>
                            <LinearGradient colors={colors.gradients.coral} start={{x:0,y:0}} end={{x:1,y:1}} style={s.activeCard}>
                                <View style={s.activeRow}><View style={s.activeIcon}><Ionicons name="play" size={24} color={colors.accent.coral} /></View><View style={{flex:1,marginLeft:16}}><Text style={[typography.subhead,{color:colors.text.primary,fontWeight:'900'}]}>SESSION IN PROGRESS</Text><Text style={[typography.caption,{color:withAlpha(colors.text.primary,0.85)}]}>Touch to resume</Text></View><Ionicons name="chevron-forward" size={24} color={colors.text.primary} /></View>
                            </LinearGradient>
                        </TouchableOpacity>
                    ) : (
                        <TouchableOpacity activeOpacity={0.9} accessibilityRole="button" accessibilityLabel="Start new session" style={[s.startWrap,{borderColor:colors.border.default,marginHorizontal:20,marginBottom:24}]} onPress={()=>router.push('/training/onboarding' as any)}>
                            <BlurView tint="dark" intensity={40} style={s.startCard}>
                                <LinearGradient colors={[withAlpha(colors.accent.coral,0.22),withAlpha(colors.accent.pink,0.10),'transparent']} start={{x:0,y:0}} end={{x:1,y:1}} style={StyleSheet.absoluteFillObject} />
                                <LinearGradient colors={['rgba(255,255,255,0.06)','rgba(255,255,255,0)']} start={{x:0,y:0}} end={{x:0,y:1}} style={s.startSheen} pointerEvents="none" />
                                <View style={{zIndex:1}}><Text style={[typography.h2,{color:colors.text.primary}]}>Start New Session</Text><Text style={[typography.body,{color:colors.text.secondary,marginTop:4}]}>Pick a routine or go freestyle.</Text>
                                    <View style={[s.beginBadge,shadows.glow(colors.accent.pink)]}>
                                        <LinearGradient colors={colors.gradients.coral} start={{x:0,y:0}} end={{x:1,y:0}} style={StyleSheet.absoluteFillObject} />
                                        <Ionicons name="add" size={16} color={colors.text.primary} /><Text style={[s.badgeTxt,{color:colors.text.primary}]}>BEGIN</Text>
                                    </View>
                                </View>
                                <Ionicons name="flash" size={80} color={withAlpha(colors.accent.coral,0.12)} style={s.bgIco} />
                            </BlurView>
                        </TouchableOpacity>
                    )}
                    <View style={s.secHd}><Text style={[typography.overline,{color:colors.text.secondary}]}>Explore Workouts</Text></View>
                    <View style={s.catGrid}>
                        {CATS.map((cat)=>(
                            <TouchableOpacity key={cat.id} accessibilityRole="button" accessibilityLabel={`${cat.title} workouts`} style={[s.catCard,{borderRadius:borderRadius.xl}]} activeOpacity={0.85} onPress={()=>router.push(cat.route as any)}>
                                <Image source={cat.img} style={StyleSheet.absoluteFillObject} contentFit="cover" cachePolicy="memory-disk" transition={200} />
                                <LinearGradient colors={['rgba(0,0,0,0.05)','rgba(0,0,0,0.78)']} style={[StyleSheet.absoluteFillObject,{borderRadius:borderRadius.xl}]} />
                                <View style={[s.catBadge,{backgroundColor:withAlpha(cat.color,0.25),borderColor:cat.color}]}><Text style={[typography.caption,{color:cat.color,fontWeight:'bold',fontSize:9}]}>{cat.title.toUpperCase()}</Text></View>
                                <Text style={[typography.heading,{color:'#FFF',fontSize:17,fontWeight:'900',zIndex:1}]}>{cat.title}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                    <View style={s.secHd}><Text style={[typography.overline,{color:colors.text.secondary}]}>Your Routines</Text><TouchableOpacity activeOpacity={0.85} accessibilityRole="button" hitSlop={{top:8,bottom:8,left:8,right:8}} onPress={()=>router.push('/(exercises)/routines' as any)}><Text style={[typography.caption,{color:colors.accent.coral,fontWeight:'bold'}]}>VIEW ALL</Text></TouchableOpacity></View>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{paddingHorizontal:20,gap:16,paddingBottom:8}}>
                        {routinesQ.isLoading?
                        [0,1,2].map((i)=><Skeleton key={i} width={180} height={150} radius={borderRadius.xl} />):
                        routines.length===0?
                        <TouchableOpacity activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="New routine, build your first split" onPress={()=>router.push('/(exercises)/routines' as any)} style={[s.emptyR,{backgroundColor:colors.background.secondary,borderWidth:1,borderColor:colors.border.default,borderRadius:borderRadius.xl}]}>
                            <View style={[s.emptyRIcon,{backgroundColor:withAlpha(colors.accent.coral,0.12),borderColor:withAlpha(colors.accent.coral,0.24)}]}><Ionicons name="add" size={24} color={colors.accent.coral} /></View>
                            <Text style={[typography.subhead,{color:colors.text.primary,fontWeight:'bold',marginTop:10}]}>New Routine</Text>
                            <Text style={[typography.caption,{color:colors.text.secondary,textAlign:'center',marginTop:2}]}>Build your first split</Text>
                        </TouchableOpacity>:
                        routines.map((r:any,idx:number)=>{
                            const imgs=ROUTINE_IMGS[idx%4]!;
                            const ac=[colors.accent.coral,colors.accent.cyan,colors.accent.emerald,colors.accent.purple][idx%4]!;
                            return (
                                <TouchableOpacity key={r.id||idx} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={r.name||r.title} style={[s.routCard,{borderRadius:borderRadius.xl}]} onPress={()=>router.push({pathname:'/training/onboarding',params:{routineId:r.id}})}>
                                    <Image source={imgs} style={StyleSheet.absoluteFillObject} contentFit="cover" cachePolicy="memory-disk" transition={200} />
                                    <LinearGradient colors={['rgba(0,0,0,0.1)','rgba(0,0,0,0.85)']} style={StyleSheet.absoluteFillObject} />
                                    <View style={[s.routContent,{zIndex:1}]}>
                                        <View style={[s.routTag,{backgroundColor:ac}]}><Text style={s.tagTxt}>{r.splitType||'STRENGTH'}</Text></View>
                                        <Text style={[typography.heading,{color:'#FFF',fontSize:17}]} numberOfLines={2}>{r.name||r.title}</Text>
                                        <Text style={[typography.caption,{color:'rgba(255,255,255,0.6)',marginTop:4}]}>{r.exercises?.length||0} exercises</Text>
                                    </View>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
                </ScrollView>
            ) : (
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{padding:20,paddingBottom:TAB_BAR_H+80}}>
                    {routinesQ.isLoading?(
                        <View>
                            <Skeleton width="100%" height={220} radius={borderRadius.xl} style={{marginBottom:spacing['2xl']}} />
                            <Skeleton width={120} height={14} radius={6} style={{marginBottom:spacing.lg}} />
                            {[0,1,2,3].map((i)=><Skeleton key={i} width="100%" height={52} radius={borderRadius.lg} style={{marginBottom:spacing.md}} />)}
                            <Skeleton width="100%" height={56} radius={borderRadius.full} style={{marginTop:spacing.sm}} />
                        </View>
                    ):(
                        activePlan ? (
                            <View>
                                <View style={[s.planCard,{marginBottom:24}]}>
                                    <Image source={HERO_TRAINING} style={s.planImg} contentFit="cover" cachePolicy="memory-disk" transition={200} />
                                    <LinearGradient colors={['transparent','rgba(0,0,0,0.92)']} style={StyleSheet.absoluteFillObject} />
                                    <View style={s.planOvr}>
                                        <View style={[s.planBadge,{backgroundColor:withAlpha(colors.accent.coral,0.3),borderColor:colors.accent.coral}]}><Text style={[typography.caption,{color:colors.accent.coral,fontWeight:'bold',fontSize:10}]}>ACTIVE ROUTINE</Text></View>
                                        <Text style={[typography.heading,{color:'#FFF',fontSize:20,fontWeight:'900',marginTop:8}]}>{activePlan.name}</Text>
                                        <View style={{flexDirection:'row',alignItems:'baseline',marginTop:6}}>
                                            <Text style={[typography.statSmall,{color:'#FFF'}]}>{activePlan.exercises?.length??0}</Text>
                                            <Text style={[typography.overline,{color:'rgba(255,255,255,0.6)',marginLeft:8}]}>Exercises</Text>
                                        </View>
                                    </View>
                                </View>
                                <Text style={[typography.overline,{color:colors.text.secondary,marginBottom:14}]}>Exercises</Text>
                                {(activePlan.exercises??[]).slice(0,6).map((ex,i)=>{
                                    const ac=[colors.accent.coral,colors.accent.cyan,colors.accent.emerald,colors.accent.purple,colors.accent.amber,colors.accent.cyan][i%6]!;
                                    return (
                                        <View key={i} style={[s.exRow,{backgroundColor:colors.background.secondary,borderColor:colors.border.default}]}>
                                            <View style={[s.exDot,{backgroundColor:ac}]} />
                                            <Text style={[typography.subhead,{color:colors.text.primary,fontWeight:'bold',flex:1,marginLeft:12}]}>{ex.name}</Text>
                                            <Text style={[typography.caption,{color:colors.text.secondary}]}>{ex.sets}×{ex.reps}</Text>
                                        </View>
                                    );
                                })}
                                {(activePlan.exercises?.length??0)>6&&<Text style={[typography.caption,{color:colors.text.secondary,textAlign:'center',marginTop:8}]}>+{(activePlan.exercises?.length??0)-6} more exercises</Text>}
                                <TouchableOpacity activeOpacity={0.85} accessibilityRole="button" style={[s.todayBtn,{marginTop:20},shadows.glow(colors.accent.pink)]} onPress={()=>router.push({pathname:'/training/onboarding',params:{routineId:activePlan.id}} as any)}>
                                    <LinearGradient colors={colors.gradients.coral} start={{x:0,y:0}} end={{x:1,y:0}} style={s.btnFill} />
                                    <Ionicons name="flash" size={20} color={colors.text.primary} /><Text style={[typography.subhead,{color:colors.text.primary,fontWeight:'900',marginLeft:8}]}>START SESSION</Text>
                                </TouchableOpacity>
                            </View>
                        ) : (
                            <EmptyState
                                icon="calendar-outline"
                                title="No Routines Yet"
                                subtitle="Create a routine to track your weekly training and start every session in one tap."
                                actionLabel="Create Routine"
                                onAction={()=>router.push('/(exercises)/routines' as any)}
                            />
                        )
                    )}
                </ScrollView>
            )}
        </ImageBackground>
    );
}
const s = StyleSheet.create({
    container:{flex:1}, hdr:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingHorizontal:20,marginBottom:20},
    iconBtn:{width:48,height:48,borderRadius:24,alignItems:'center',justifyContent:'center'},
    switcher:{flexDirection:'row',borderRadius:14,padding:4}, swBtn:{flex:1,paddingVertical:10,borderRadius:10,alignItems:'center'},
    activeWrap:{borderRadius:24,overflow:'hidden'}, activeCard:{padding:20}, activeRow:{flexDirection:'row',alignItems:'center'},
    activeIcon:{width:40,height:40,borderRadius:20,backgroundColor:'#FFF',alignItems:'center',justifyContent:'center'},
    startWrap:{borderRadius:24,overflow:'hidden',borderWidth:1}, startCard:{padding:28,height:160,justifyContent:'center',overflow:'hidden'},
    startSheen:{position:'absolute',top:0,left:0,right:0,height:64},
    beginBadge:{alignSelf:'flex-start',flexDirection:'row',alignItems:'center',paddingHorizontal:14,paddingVertical:7,borderRadius:9999,marginTop:18,overflow:'hidden'},
    badgeTxt:{color:'#FFF',fontSize:10,fontWeight:'900',marginLeft:4,letterSpacing:0.5}, bgIco:{position:'absolute',right:-10,bottom:-10},
    secHd:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingHorizontal:20,marginBottom:16,marginTop:8},
    catGrid:{flexDirection:'row',flexWrap:'wrap',paddingHorizontal:20,gap:12,marginBottom:24},
    catCard:{width:(width-52)/2,height:130,overflow:'hidden',justifyContent:'flex-end',padding:12},
    catBadge:{alignSelf:'flex-start',paddingHorizontal:7,paddingVertical:3,borderRadius:6,borderWidth:1,marginBottom:6},
    routCard:{width:180,height:150,overflow:'hidden'}, routContent:{padding:14,justifyContent:'flex-end',flex:1},
    routTag:{alignSelf:'flex-start',paddingHorizontal:6,paddingVertical:2,borderRadius:4,marginBottom:6},
    tagTxt:{color:'#FFF',fontSize:8,fontWeight:'bold'}, emptyR:{width:180,height:150,alignItems:'center',justifyContent:'center',padding:16},
    emptyRIcon:{width:48,height:48,borderRadius:24,borderWidth:1,alignItems:'center',justifyContent:'center'},
    planCard:{height:220,borderRadius:20,overflow:'hidden'}, planImg:{width:'100%',height:220,position:'absolute'},
    planOvr:{position:'absolute',bottom:0,left:0,right:0,padding:20},
    planBadge:{alignSelf:'flex-start',paddingHorizontal:8,paddingVertical:3,borderRadius:6,borderWidth:1},
    exRow:{flexDirection:'row',alignItems:'center',padding:14,marginBottom:10,borderRadius:14,borderWidth:1},
    exDot:{width:8,height:8,borderRadius:4},
    todayBtn:{height:56,borderRadius:28,flexDirection:'row',alignItems:'center',justifyContent:'center',overflow:'hidden'},
    btnFill:{...StyleSheet.absoluteFillObject},
});
