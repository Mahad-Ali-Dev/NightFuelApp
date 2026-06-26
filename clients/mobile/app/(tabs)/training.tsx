import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions, ImageBackground } from 'react-native';
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
import { Skeleton, EmptyState, GlassCard, CtaButton } from '@/components/ui';
import { LinearGradient } from 'expo-linear-gradient';
import { StatCard, CategoryCard, MuscleCard, RoutineCard, CAROUSEL_CARD_W, MUSCLE_CARD_W } from '@/components/TrainingCards';
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
// Gender-neutral muscle-group tiles (male art per the "Workouts grid" mockup;
// the muscle browser itself swaps to female art from the profile). Bundled →
// offline-safe; '@/*' resolves to ./src so we require by relative path.
const MUSCLE_CHEST_M = require('../../assets/images/muscle-chest-male.png');
const MUSCLE_BACK_M = require('../../assets/images/muscle-back-male.png');
const MUSCLE_SHOULDERS_M = require('../../assets/images/muscle-shoulders-male.png');
const MUSCLE_ARMS_M = require('../../assets/images/muscle-arms-male.png');
const MUSCLE_CORE_M = require('../../assets/images/muscle-core-male.png');
const MUSCLE_LEGS_M = require('../../assets/images/muscle-legs-male.png');
// Workout-category bento tiles. `route` keeps the EXISTING deep-links into the
// exercise library (?category=…); `icon` + `color` drive the lime-glow card.
// Colors are the exact Aurora accent hex values from '@/theme/colors' (module
// scope can't read the useTheme() hook). `span` lays the bento out 2-up with a
// tall lead tile, matching the mockup's interlocking grid design language.
const CATS = [
    { id:'gym', title:'Strength', icon:'barbell', img:CAT_GYM_IMG, route:'/(exercises)?category=gym', color:'#A8CC3C', span:'lead' as const },
    { id:'cardio', title:'Cardio', icon:'heart', img:CAT_CARDIO_IMG, route:'/(exercises)?category=cardio', color:'#00D4AA', span:'half' as const },
    { id:'home', title:'Home', icon:'home', img:CAT_HOME_IMG, route:'/(exercises)?category=home', color:'#10B981', span:'half' as const },
    { id:'recover', title:'Recovery', icon:'leaf', img:CAT_RECOVERY_IMG, route:'/(exercises)?category=kegel', color:'#7C4DFF', span:'full' as const },
];
// Muscle-group carousel — each card deep-links into the real Muscle Map browser
// (/(exercises)/muscles), preserving navigation while adding a fast entry point.
const MUSCLES = [
    { id:'chest', label:'Chest', img:MUSCLE_CHEST_M },
    { id:'back', label:'Back', img:MUSCLE_BACK_M },
    { id:'shoulders', label:'Shoulders', img:MUSCLE_SHOULDERS_M },
    { id:'arms', label:'Arms', img:MUSCLE_ARMS_M },
    { id:'core', label:'Core', img:MUSCLE_CORE_M },
    { id:'legs', label:'Legs', img:MUSCLE_LEGS_M },
];
// Bento tile widths — derived once from the window width (20px page padding
// both sides, 12px inter-tile gutter). The lead tile takes the larger column
// and the stacked half-tiles share the remainder; the full tile spans the row.
const BENTO_GUTTER = 12;
const BENTO_FULL_W = width - 40;
const BENTO_LEAD_W = Math.round((BENTO_FULL_W - BENTO_GUTTER) * 0.46);
const BENTO_HALF_W = BENTO_FULL_W - BENTO_GUTTER - BENTO_LEAD_W;
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
                        <TouchableOpacity activeOpacity={0.9} accessibilityRole="button" accessibilityLabel="Start new session" style={{marginHorizontal:20,marginBottom:14}} onPress={()=>router.push('/training/onboarding' as any)}>
                            <GlassCard glow={colors.accent.coral} radius={18} style={{borderColor:colors.border.light}}>
                                <View style={s.wodCard}>
                                    <Image source={HERO_TRAINING} style={StyleSheet.absoluteFillObject} contentFit="cover" cachePolicy="memory-disk" transition={200} />
                                    <LinearGradient colors={['rgba(8,10,16,0.35)','rgba(8,10,16,0.62)','rgba(8,10,16,0.92)']} start={{x:0,y:0}} end={{x:0,y:1}} style={StyleSheet.absoluteFillObject} />
                                    {/* Center play affordance */}
                                    <View style={s.wodPlayWrap} pointerEvents="none">
                                        <View style={s.wodPlay}><Ionicons name="play" size={23} color="#FFF" /></View>
                                    </View>
                                    {/* Bottom-left title + duration */}
                                    <View style={s.wodMeta}>
                                        <Text style={[typography.h2,{color:'#FFF',fontWeight:'800'}]}>Start New Session</Text>
                                        <Text style={[typography.body,{color:'rgba(255,255,255,0.78)',marginTop:2}]}>Pick a routine or go freestyle</Text>
                                    </View>
                                    {/* Bottom-right Start pill (lime) */}
                                    <View style={[s.wodStart,shadows.glow(colors.accent.coral)]}>
                                        <Text maxFontSizeMultiplier={1.3} style={[s.wodStartTxt,{color:colors.text.inverse}]}>Start</Text>
                                    </View>
                                </View>
                            </GlassCard>
                        </TouchableOpacity>
                        {/* Page dots */}
                        <View style={s.dotsRow}>
                            {[0,1,2,3].map((d)=>(
                                <View key={d} style={d===0?[s.dotActive,{backgroundColor:colors.accent.coral}]:[s.dot,{backgroundColor:colors.border.light}]} />
                            ))}
                        </View>
                        </Animated.View>
                    )}
                    <Animated.View entering={FadeInDown.delay(120).duration(420)} style={s.statRow}>
                        <StatCard index={0} label="Routines" value={routineCount} icon="albums-outline" accent={colors.accent.coral} />
                        <StatCard index={1} label="Exercises" value={totalExercises} icon="barbell-outline" accent={colors.accent.cyan} />
                        <StatCard index={2} label="Weekly Sets" value={totalSets} icon="flame-outline" accent={colors.accent.purple} />
                    </Animated.View>
                    <View style={s.secHd}><Text style={[typography.heading,{color:colors.text.primary,fontSize:18}]}>Workouts</Text></View>
                    <View style={s.bentoGrid}>
                        {/* Top row: tall lead tile + a stacked pair of half tiles */}
                        <View style={s.bentoLead}>
                            <CategoryCard
                                index={0}
                                title={CATS[0]!.title}
                                img={CATS[0]!.img}
                                icon={CATS[0]!.icon as any}
                                accent={CATS[0]!.color}
                                cardWidth={BENTO_LEAD_W}
                                height={172}
                                accessibilityLabel={`${CATS[0]!.title} workouts`}
                                onPress={()=>router.push(CATS[0]!.route as any)}
                            />
                        </View>
                        <View style={s.bentoStack}>
                            {[CATS[1]!,CATS[2]!].map((cat,i)=>(
                                <CategoryCard
                                    key={cat.id}
                                    index={i+1}
                                    title={cat.title}
                                    img={cat.img}
                                    icon={cat.icon as any}
                                    accent={cat.color}
                                    cardWidth={BENTO_HALF_W}
                                    height={80}
                                    accessibilityLabel={`${cat.title} workouts`}
                                    onPress={()=>router.push(cat.route as any)}
                                />
                            ))}
                        </View>
                        {/* Full-width tile */}
                        <CategoryCard
                            index={3}
                            title={CATS[3]!.title}
                            img={CATS[3]!.img}
                            icon={CATS[3]!.icon as any}
                            accent={CATS[3]!.color}
                            cardWidth={BENTO_FULL_W}
                            height={88}
                            accessibilityLabel={`${CATS[3]!.title} workouts`}
                            onPress={()=>router.push(CATS[3]!.route as any)}
                        />
                    </View>
                    <View style={s.secHd}><Text style={[typography.heading,{color:colors.text.primary,fontSize:18}]}>Muscle groups</Text><TouchableOpacity activeOpacity={0.85} accessibilityRole="button" hitSlop={{top:8,bottom:8,left:8,right:8}} onPress={()=>router.push('/(exercises)/muscles' as any)}><Text style={[typography.caption,{color:colors.accent.coral,fontWeight:'bold'}]}>VIEW ALL</Text></TouchableOpacity></View>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} decelerationRate="fast" snapToInterval={MUSCLE_CARD_W+11} snapToAlignment="start" contentContainerStyle={{paddingHorizontal:20,gap:11,paddingBottom:8}}>
                        {MUSCLES.map((m,idx)=>(
                            <MuscleCard
                                key={m.id}
                                index={idx}
                                label={m.label}
                                img={m.img}
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
    // "Workout of the Day" hero (inside GlassCard): full-bleed art + scrim, a
    // center play disc, bottom-left meta, bottom-right lime Start pill.
    wodCard:{height:150,overflow:'hidden'},
    wodPlayWrap:{...StyleSheet.absoluteFillObject,alignItems:'center',justifyContent:'center'},
    wodPlay:{width:52,height:52,borderRadius:26,backgroundColor:'rgba(255,255,255,0.12)',borderWidth:1.5,borderColor:'#FFF',alignItems:'center',justifyContent:'center'},
    wodMeta:{position:'absolute',left:14,bottom:13,right:96},
    wodStart:{position:'absolute',right:14,bottom:15,backgroundColor:'#A8CC3C',paddingHorizontal:19,paddingVertical:9,borderRadius:11},
    wodStartTxt:{fontSize:13,fontWeight:'800',letterSpacing:0.3},
    dotsRow:{flexDirection:'row',justifyContent:'center',alignItems:'center',gap:6,marginBottom:22},
    dot:{width:6,height:6,borderRadius:3},
    dotActive:{width:18,height:6,borderRadius:3},
    secHd:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingHorizontal:20,marginBottom:16,marginTop:8},
    statRow:{flexDirection:'row',gap:10,paddingHorizontal:20,marginBottom:24},
    // Bento grid: a top row (tall lead tile + a stacked half-tile pair) then a
    // full-width tile beneath. Wraps so the lead + stack sit side by side.
    bentoGrid:{flexDirection:'row',flexWrap:'wrap',paddingHorizontal:20,gap:12,marginBottom:24},
    bentoLead:{},
    bentoStack:{flex:1,justifyContent:'space-between',gap:12},
    emptyR:{width:CAROUSEL_CARD_W,height:168,alignItems:'center',justifyContent:'center',padding:16},
    emptyRIcon:{width:48,height:48,borderRadius:24,borderWidth:1,alignItems:'center',justifyContent:'center'},
    planCard:{height:220,borderRadius:20,overflow:'hidden'}, planImg:{width:'100%',height:220,position:'absolute'},
    planOvr:{position:'absolute',bottom:0,left:0,right:0,padding:20},
    planBadge:{alignSelf:'flex-start',paddingHorizontal:8,paddingVertical:3,borderRadius:6,borderWidth:1},
    exRow:{flexDirection:'row',alignItems:'center',padding:14,marginBottom:10,borderRadius:14,borderWidth:1},
    exDot:{width:8,height:8,borderRadius:4},
});
