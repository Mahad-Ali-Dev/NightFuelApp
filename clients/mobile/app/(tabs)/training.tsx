import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ImageBackground } from 'react-native';
import { Image } from 'expo-image';
import { TAB_BAR_H } from './_layout';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/utils';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { getRoutines, getActiveSession, Routine } from '@/api/exercises';
import { Skeleton, EmptyState, CtaButton } from '@/components/ui';
import { LinearGradient } from 'expo-linear-gradient';
import { StatCard, MuscleCard, RoutineCard, WodCarousel, BentoBrowse, CAROUSEL_CARD_W, MUSCLE_CARD_W } from '@/components/TrainingCards';
// Bundled Aurora dark-glass art (no external host → offline-safe, no 404 /
// rate-limit). '@/*' resolves to ./src, so assets are required by relative path
// — same module-scope require pattern as (exercises)/index.tsx.
const HERO_TRAINING = require('../../assets/images/hero-training.png');
const CAT_GYM_IMG = require('../../assets/images/cat-gym.png');
const QA_WORKOUT_IMG = require('../../assets/images/qa-workout.png');
const MUSCLE_CHEST_IMG = require('../../assets/images/muscle-chest.png');
const MUSCLE_BACK_IMG = require('../../assets/images/muscle-back.png');
// Grayscale-figure tiles for the interlocking "Browse by style" bento. The
// mockup pairs each style with a body figure: HIIT/Yoga use the hero figures,
// Strength/Cardio/Mobility/Pilates use the muscle-<group>-male renders (already
// near-monochrome lime art on transparent backgrounds). Bundled → offline-safe;
// '@/*' resolves to ./src so we require by relative path.
const HERO_FEMALE_1 = require('../../assets/images/hero-female-1.png');
const HERO_FEMALE_2 = require('../../assets/images/hero-female-2.png');
const MUSCLE_CARDIO_M = require('../../assets/images/muscle-cardio-male.png');
// Gender-neutral muscle-group tiles (male art per the "Workouts grid" mockup;
// the muscle browser itself swaps to female art from the profile). Bundled →
// offline-safe; '@/*' resolves to ./src so we require by relative path.
const MUSCLE_CHEST_M = require('../../assets/images/muscle-chest-male.png');
const MUSCLE_BACK_M = require('../../assets/images/muscle-back-male.png');
const MUSCLE_SHOULDERS_M = require('../../assets/images/muscle-shoulders-male.png');
const MUSCLE_ARMS_M = require('../../assets/images/muscle-arms-male.png');
const MUSCLE_CORE_M = require('../../assets/images/muscle-core-male.png');
const MUSCLE_LEGS_M = require('../../assets/images/muscle-legs-male.png');
// "Browse by style" bento tiles. `route` keeps the EXISTING deep-links into the
// exercise library (?category=…) so every tile's navigation is preserved; the
// six styles map onto the real catalog categories (gym/cardio/home/kegel) the
// library understands. Order is the mockup's interlocking z-order:
//   [0] HIIT (tall TL) · [1] Strength (L-shape) · [2] Cardio (nests in notch)
//   [3] Yoga (wide) · [4] Mobility · [5] Pilates.
const STYLES = [
    { id:'hiit',     title:'HIIT',     icon:'flame' as const,    img:HERO_FEMALE_1,  route:'/(exercises)?category=cardio' },
    { id:'strength', title:'Strength', icon:'barbell' as const,  img:MUSCLE_CHEST_M, route:'/(exercises)?category=gym' },
    { id:'cardio',   title:'Cardio',   icon:'heart' as const,    img:MUSCLE_CARDIO_M, route:'/(exercises)?category=cardio' },
    { id:'yoga',     title:'Yoga',     icon:'body' as const,     img:HERO_FEMALE_2,  route:'/(exercises)?category=home' },
    { id:'mobility', title:'Mobility', icon:'accessibility' as const, img:MUSCLE_BACK_M, route:'/(exercises)?category=home' },
    { id:'pilates',  title:'Pilates',  icon:'pulse' as const,    img:MUSCLE_LEGS_M,  route:'/(exercises)?category=kegel' },
];
// Muscle-group carousel — each card deep-links into the real Muscle Map browser
// (/(exercises)/muscles), preserving navigation while adding a fast entry point.
// `count` is the indicative per-group exercise count shown in lime (mockup).
const MUSCLES = [
    { id:'chest', label:'Chest', img:MUSCLE_CHEST_M, count:24 },
    { id:'back', label:'Back', img:MUSCLE_BACK_M, count:32 },
    { id:'shoulders', label:'Shoulders', img:MUSCLE_SHOULDERS_M, count:18 },
    { id:'arms', label:'Arms', img:MUSCLE_ARMS_M, count:28 },
    { id:'core', label:'Core', img:MUSCLE_CORE_M, count:22 },
    { id:'legs', label:'Legs', img:MUSCLE_LEGS_M, count:30 },
];
// Workout-of-the-Day carousel pages. There is no WOD API yet, so these are
// curated entries; every card's "Start workout" routes through the SAME
// onboarding entry the single hero used (start handler preserved). Figures are
// the bundled muscle/hero renders.
const WODS = [
    { id:'wod-fullbody', title:'Full Body Blast', meta:'45 min · 8 exercises', img:MUSCLE_CHEST_M },
    { id:'wod-upper',    title:'Upper Power',      meta:'38 min · 7 exercises', img:MUSCLE_BACK_M },
    { id:'wod-lower',    title:'Leg Day',          meta:'42 min · 6 exercises', img:MUSCLE_LEGS_M },
    { id:'wod-core',     title:'Core Crusher',     meta:'25 min · 9 exercises', img:MUSCLE_CORE_M },
];
// Static routine-card artwork (constant — hoisted out of render to avoid
// re-allocating this array on every routine row). Bundled, rotated by index%4.
const ROUTINE_IMGS = [
    QA_WORKOUT_IMG,
    MUSCLE_CHEST_IMG,
    MUSCLE_BACK_IMG,
    CAT_GYM_IMG,
];
// CTA fills use the shared `gradients.coralCta` token (read off useTheme() as
// `colors.gradients.coralCta`): coralDark #93B82E → pink #93B82E. It starts
// darker than the brand `gradients.coral` so white text/icons clear AA on the
// fill, and is shared so Dashboard + Training render a byte-identical CTA.
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
    // Weekly-volume stat row — derived purely from the routines already in
    // scope (no new query/data call): routine count, total planned exercises,
    // and total weekly sets across every routine.
    const routineCount = routines.length;
    const totalExercises = routines.reduce((sum, r) => sum + (r.exercises?.length ?? 0), 0);
    const totalSets = routines.reduce(
        (sum, r) => sum + (r.exercises ?? []).reduce((s, ex: any) => s + (Number(ex?.sets) || 0), 0),
        0,
    );
    return (
        <ImageBackground blurRadius={4} source={HERO_TRAINING} style={[s.container,{backgroundColor:colors.background.primary}]} imageStyle={{opacity:0.35}}>
            <LinearGradient colors={['rgba(10,10,13,0.8)',colors.background.primary]} style={StyleSheet.absoluteFillObject} />
            <StatusBar style="light" />
            <Animated.View entering={FadeInDown.duration(420)} style={[s.hdr,{paddingTop:insets.top+20}]}>
                <View><Text style={[typography.display,{color:colors.text.primary,fontSize:34}]}>Training</Text><Text style={[typography.body,{color:colors.text.secondary,marginTop:2}]}>Level up your strength today.</Text></View>
                <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="History" style={[s.iconBtn,{backgroundColor:colors.background.secondary,borderWidth:1,borderColor:colors.border.default}]} onPress={()=>router.push('/(exercises)/history' as any)}><Ionicons name="time-outline" size={22} color={colors.text.primary} /></TouchableOpacity>
            </Animated.View>
            <Animated.View entering={FadeInDown.delay(60).duration(420)} style={[s.switcher,{backgroundColor:colors.background.secondary,borderWidth:1,borderColor:colors.border.default,marginHorizontal:20,marginBottom:20}]}>
                {(['train','plan'] as TTab[]).map((t)=>(
                    <TouchableOpacity key={t} activeOpacity={0.85} accessibilityRole="tab" accessibilityState={{ selected: tab===t }} style={[s.swBtn,tab===t&&{backgroundColor:colors.accent.coralDark,...shadows.glow(colors.accent.coral)}]} onPress={()=>setTab(t)}>
                        <Text maxFontSizeMultiplier={1.3} style={[typography.overline,{color:tab===t?colors.text.primary:colors.text.secondary},tab===t&&s.txtShadow]}>{t==='train'?'TRAINING':'MY PLAN'}</Text>
                    </TouchableOpacity>
                ))}
            </Animated.View>
            {tab==='train'?(
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{paddingBottom:TAB_BAR_H+80}}>
                    {activeSession ? (
                        <Animated.View entering={FadeInDown.delay(80).springify().damping(18)}>
                        <TouchableOpacity activeOpacity={0.9} accessibilityRole="button" accessibilityLabel="Session in progress, touch to resume" style={[s.activeWrap,{marginHorizontal:20,marginBottom:24},shadows.glow(colors.accent.pink)]} onPress={()=>router.push('/training/workout' as any)}>
                            <View style={s.activeCard}>
                                <LinearGradient colors={colors.gradients.coralCta} start={{x:0,y:0}} end={{x:1,y:1}} style={StyleSheet.absoluteFillObject} />
                                <View style={s.activeRow}><View style={s.activeIcon}><Ionicons name="play" size={24} color={colors.text.inverse} /></View><View style={{flex:1,marginLeft:16}}><Text style={[typography.subhead,{color:colors.text.inverse,fontWeight:'900'}]}>SESSION IN PROGRESS</Text><Text style={[typography.caption,{color:withAlpha(colors.text.inverse,0.75)}]}>Touch to resume</Text></View><Ionicons name="chevron-forward" size={24} color={colors.text.inverse} /></View>
                            </View>
                        </TouchableOpacity>
                        </Animated.View>
                    ) : (
                        <Animated.View entering={FadeInDown.delay(80).springify().damping(18)}>
                        <View style={s.secHd}><Text style={[typography.overline,{color:colors.text.secondary}]}>Workout of the Day</Text></View>
                        {/* Swipeable WOD carousel — pager + dots + lime Start-workout pill.
                            Every card's start handler is the SAME onboarding push the
                            single hero used, so the start flow is preserved. */}
                        <WodCarousel items={WODS} onStart={()=>router.push('/training/onboarding' as any)} />
                        </Animated.View>
                    )}
                    <Animated.View entering={FadeInDown.delay(120).duration(420)} style={s.statRow}>
                        <StatCard index={0} label="Routines" value={routineCount} icon="albums-outline" accent={colors.accent.coral} />
                        <StatCard index={1} label="Exercises" value={totalExercises} icon="barbell-outline" accent={colors.accent.cyan} />
                        <StatCard index={2} label="Weekly Sets" value={totalSets} icon="flame-outline" accent={colors.accent.purple} />
                    </Animated.View>
                    <View style={s.secHd}><Text style={[typography.heading,{color:colors.text.primary,fontSize:18}]}>Browse by style</Text></View>
                    {/* Interlocking L-shape bento — each tile keeps its real
                        deep-link into the exercise library (nav preserved). */}
                    <View style={s.bentoWrap}>
                        <BentoBrowse
                            items={STYLES.map((c)=>({
                                id:c.id,
                                title:c.title,
                                icon:c.icon,
                                img:c.img,
                                onPress:()=>router.push(c.route as any),
                            }))}
                        />
                    </View>
                    <View style={s.secHd}><Text style={[typography.heading,{color:colors.text.primary,fontSize:18}]}>Target a muscle group</Text><TouchableOpacity activeOpacity={0.85} accessibilityRole="button" hitSlop={{top:8,bottom:8,left:8,right:8}} onPress={()=>router.push('/(exercises)/muscles' as any)}><Text style={[typography.caption,{color:colors.accent.coral,fontWeight:'bold'}]}>VIEW ALL</Text></TouchableOpacity></View>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} decelerationRate="fast" snapToInterval={MUSCLE_CARD_W+12} snapToAlignment="start" contentContainerStyle={{paddingHorizontal:20,gap:12,paddingBottom:8}}>
                        {MUSCLES.map((m,idx)=>(
                            <MuscleCard
                                key={m.id}
                                index={idx}
                                label={m.label}
                                img={m.img}
                                count={m.count}
                                accessibilityLabel={`${m.label} exercises`}
                                onPress={()=>router.push('/(exercises)/muscles' as any)}
                            />
                        ))}
                    </ScrollView>
                    <View style={s.secHd}><Text style={[typography.overline,{color:colors.text.secondary}]}>Your Routines</Text><TouchableOpacity activeOpacity={0.85} accessibilityRole="button" hitSlop={{top:8,bottom:8,left:8,right:8}} onPress={()=>router.push('/(exercises)/routines' as any)}><Text style={[typography.caption,{color:colors.accent.coral,fontWeight:'bold'}]}>VIEW ALL</Text></TouchableOpacity></View>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} decelerationRate="fast" snapToInterval={CAROUSEL_CARD_W+16} snapToAlignment="start" contentContainerStyle={{paddingHorizontal:20,gap:16,paddingBottom:8}}>
                        {routinesQ.isLoading?
                        [0,1,2].map((i)=><Skeleton key={i} width={CAROUSEL_CARD_W} height={168} radius={borderRadius.xl} />):
                        routinesQ.isError?
                        <TouchableOpacity activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Couldn't load routines, touch to retry" onPress={()=>routinesQ.refetch()} style={[s.emptyR,{backgroundColor:colors.background.secondary,borderWidth:1,borderColor:colors.border.default,borderRadius:borderRadius.xl}]}>
                            <View style={[s.emptyRIcon,{backgroundColor:withAlpha(colors.accent.coral,0.12),borderColor:withAlpha(colors.accent.coral,0.24)}]}><Ionicons name="cloud-offline-outline" size={24} color={colors.accent.coral} /></View>
                            <Text style={[typography.subhead,{color:colors.text.primary,fontWeight:'bold',marginTop:10}]}>Couldn't load routines</Text>
                            <Text style={[typography.caption,{color:colors.text.secondary,textAlign:'center',marginTop:2}]}>Tap to try again</Text>
                        </TouchableOpacity>:
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
                                <RoutineCard
                                    key={r.id||idx}
                                    index={idx}
                                    title={r.name||r.title}
                                    tag={r.splitType||'STRENGTH'}
                                    exerciseCount={r.exercises?.length||0}
                                    img={imgs}
                                    accent={ac}
                                    onPress={()=>router.push({pathname:'/training/onboarding',params:{routineId:r.id}})}
                                />
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
                    ):routinesQ.isError?(
                        <EmptyState
                            icon="cloud-offline-outline"
                            title="Couldn't load your plan"
                            subtitle="Check your connection and try again."
                            actionLabel="Try Again"
                            onAction={()=>routinesQ.refetch()}
                        />
                    ):(
                        activePlan ? (
                            <Animated.View entering={FadeIn.duration(360)}>
                                <Animated.View entering={FadeInDown.delay(60).springify().damping(18)} style={[s.planCard,{marginBottom:24}]}>
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
                                </Animated.View>
                                <Text style={[typography.overline,{color:colors.text.secondary,marginBottom:14}]}>Exercises</Text>
                                {(activePlan.exercises??[]).slice(0,6).map((ex,i)=>{
                                    const ac=[colors.accent.coral,colors.accent.cyan,colors.accent.emerald,colors.accent.purple,colors.accent.amber,colors.accent.cyan][i%6]!;
                                    return (
                                        <Animated.View key={i} entering={FadeInDown.delay(120+i*40).springify().damping(20)} style={[s.exRow,{backgroundColor:colors.background.secondary,borderColor:colors.border.default}]}>
                                            <View style={[s.exDot,{backgroundColor:ac}]} />
                                            <Text style={[typography.subhead,{color:colors.text.primary,fontWeight:'bold',flex:1,marginLeft:12}]}>{ex.name}</Text>
                                            <Text style={[typography.caption,{color:colors.text.secondary}]}>{ex.sets}×{ex.reps}</Text>
                                        </Animated.View>
                                    );
                                })}
                                {(activePlan.exercises?.length??0)>6&&<Text style={[typography.caption,{color:colors.text.secondary,textAlign:'center',marginTop:8}]}>+{(activePlan.exercises?.length??0)-6} more exercises</Text>}
                                <CtaButton
                                    size="lg"
                                    icon="flash"
                                    label="START SESSION"
                                    accessibilityLabel="Start session"
                                    style={{marginTop:20,height:56,borderRadius:28}}
                                    onPress={()=>router.push({pathname:'/training/onboarding',params:{routineId:activePlan.id}} as any)}
                                />
                            </Animated.View>
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
    txtShadow:{textShadowColor:'rgba(0,0,0,0.35)',textShadowOffset:{width:0,height:1},textShadowRadius:2},
    iconBtn:{width:48,height:48,borderRadius:24,alignItems:'center',justifyContent:'center'},
    switcher:{flexDirection:'row',borderRadius:14,padding:4}, swBtn:{flex:1,paddingVertical:10,borderRadius:10,alignItems:'center'},
    activeWrap:{borderRadius:24,overflow:'hidden'}, activeCard:{padding:20}, activeRow:{flexDirection:'row',alignItems:'center'},
    activeIcon:{width:40,height:40,borderRadius:20,backgroundColor:'#FFF',alignItems:'center',justifyContent:'center'},
    secHd:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingHorizontal:20,marginBottom:16,marginTop:8},
    statRow:{flexDirection:'row',gap:10,paddingHorizontal:20,marginBottom:24},
    // Interlocking "Browse by style" bento (the BentoBrowse canvas is self-sized
    // and self-centred; this wrapper just owns the vertical rhythm).
    bentoWrap:{marginBottom:24},
    emptyR:{width:CAROUSEL_CARD_W,height:168,alignItems:'center',justifyContent:'center',padding:16},
    emptyRIcon:{width:48,height:48,borderRadius:24,borderWidth:1,alignItems:'center',justifyContent:'center'},
    planCard:{height:220,borderRadius:20,overflow:'hidden'}, planImg:{width:'100%',height:220,position:'absolute'},
    planOvr:{position:'absolute',bottom:0,left:0,right:0,padding:20},
    planBadge:{alignSelf:'flex-start',paddingHorizontal:8,paddingVertical:3,borderRadius:6,borderWidth:1},
    exRow:{flexDirection:'row',alignItems:'center',padding:14,marginBottom:10,borderRadius:14,borderWidth:1},
    exDot:{width:8,height:8,borderRadius:4},
});
