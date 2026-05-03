import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions, ActivityIndicator, ImageBackground } from 'react-native';
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
import { LinearGradient } from 'expo-linear-gradient';
const { width } = Dimensions.get('window');
const CATS = [
    { id:'gym', title:'Gym', img:'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400&q=70', route:'/(exercises)?category=gym', color:'#FF6B35' },
    { id:'home', title:'Home', img:'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=400&q=70', route:'/(exercises)?category=home', color:'#00D4FF' },
    { id:'cardio', title:'Cardio', img:'https://images.unsplash.com/photo-1538805060514-97d9cc17730c?w=400&q=70', route:'/(exercises)?category=cardio', color:'#2ECC71' },
    { id:'recover', title:'Recovery', img:'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=400&q=70', route:'/(exercises)?category=kegel', color:'#A855F7' },
];
type TTab = 'train'|'plan';
export default function TrainingHubScreen() {
    const { colors, typography, borderRadius } = useTheme();
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
        <ImageBackground blurRadius={4} source={{uri:'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&q=70'}} style={[s.container,{backgroundColor:colors.background.primary}]} imageStyle={{opacity:0.35}}>
            <LinearGradient colors={['rgba(10,10,13,0.8)',colors.background.primary]} style={StyleSheet.absoluteFillObject} />
            <View style={[s.hdr,{paddingTop:insets.top+20}]}>
                <View><Text style={[typography.display,{color:colors.text.primary,fontSize:32,fontWeight:'900'}]}>Training</Text><Text style={[typography.body,{color:colors.text.tertiary}]}>Level up your strength today.</Text></View>
                <TouchableOpacity style={[s.iconBtn,{backgroundColor:colors.background.secondary}]} onPress={()=>router.push('/(exercises)/history' as any)}><Ionicons name="time-outline" size={24} color={colors.text.primary} /></TouchableOpacity>
            </View>
            <View style={[s.switcher,{backgroundColor:colors.background.secondary,marginHorizontal:20,marginBottom:20}]}>
                {(['train','plan'] as TTab[]).map((t)=>(
                    <TouchableOpacity key={t} style={[s.swBtn,tab===t&&{backgroundColor:colors.accent.coral}]} onPress={()=>setTab(t)}>
                        <Text style={[typography.caption,{color:tab===t?'#FFF':colors.text.tertiary,fontWeight:'bold'}]}>{t==='train'?'TRAINING':'MY PLAN'}</Text>
                    </TouchableOpacity>
                ))}
            </View>
            {tab==='train'?(
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{paddingBottom:TAB_BAR_H+80}}>
                    {activeSession ? (
                        <TouchableOpacity activeOpacity={0.9} style={[s.activeCard,{backgroundColor:colors.accent.coral,marginHorizontal:20,marginBottom:24}]} onPress={()=>router.push('/training/workout' as any)}>
                            <View style={s.activeRow}><View style={s.activeIcon}><Ionicons name="play" size={24} color={colors.accent.coral} /></View><View style={{flex:1,marginLeft:16}}><Text style={[typography.subhead,{color:'#FFF',fontWeight:'900'}]}>SESSION IN PROGRESS</Text><Text style={[typography.caption,{color:'rgba(255,255,255,0.8)'}]}>Touch to resume</Text></View><Ionicons name="chevron-forward" size={24} color="#FFF" /></View>
                        </TouchableOpacity>
                    ) : (
                        <TouchableOpacity activeOpacity={0.9} style={[s.startWrap,{borderColor:withAlpha(colors.text.primary,0.1),marginHorizontal:20,marginBottom:24}]} onPress={()=>router.push('/training/onboarding' as any)}>
                            <BlurView tint="dark" intensity={40} style={s.startCard}>
                                <LinearGradient colors={[colors.accent.purple+'30','transparent']} style={StyleSheet.absoluteFillObject} />
                                <View style={{zIndex:1}}><Text style={[typography.heading,{color:colors.text.primary,fontSize:24}]}>Start New Session</Text><Text style={[typography.body,{color:colors.text.secondary,marginTop:4}]}>Pick a routine or go freestyle.</Text><View style={[s.beginBadge,{backgroundColor:colors.accent.purple}]}><Ionicons name="add" size={16} color="#FFF" /><Text style={s.badgeTxt}>BEGIN</Text></View></View>
                                <Ionicons name="flash" size={80} color={colors.accent.purple+'10'} style={s.bgIco} />
                            </BlurView>
                        </TouchableOpacity>
                    )}
                    <View style={s.secHd}><Text style={[typography.heading,{color:colors.text.primary}]}>Explore Workouts</Text></View>
                    <View style={s.catGrid}>
                        {CATS.map((cat)=>(
                            <TouchableOpacity key={cat.id} style={[s.catCard,{borderRadius:borderRadius.xl}]} activeOpacity={0.85} onPress={()=>router.push(cat.route as any)}>
                                <Image source={{uri:cat.img}} style={StyleSheet.absoluteFillObject} contentFit="cover" />
                                <LinearGradient colors={['rgba(0,0,0,0.05)','rgba(0,0,0,0.78)']} style={[StyleSheet.absoluteFillObject,{borderRadius:borderRadius.xl}]} />
                                <View style={[s.catBadge,{backgroundColor:withAlpha(cat.color,0.25),borderColor:cat.color}]}><Text style={[typography.caption,{color:cat.color,fontWeight:'bold',fontSize:9}]}>{cat.title.toUpperCase()}</Text></View>
                                <Text style={[typography.heading,{color:'#FFF',fontSize:17,fontWeight:'900',zIndex:1}]}>{cat.title}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                    <View style={s.secHd}><Text style={[typography.heading,{color:colors.text.primary}]}>Your Routines</Text><TouchableOpacity onPress={()=>router.push('/(exercises)/routines' as any)}><Text style={[typography.caption,{color:colors.accent.coral,fontWeight:'bold'}]}>VIEW ALL</Text></TouchableOpacity></View>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{paddingHorizontal:20,gap:16,paddingBottom:8}}>
                        {routinesQ.isLoading?<ActivityIndicator color={colors.accent.purple} style={{marginLeft:20}} />:
                        routines.length===0?<View style={[s.emptyR,{backgroundColor:colors.background.secondary,borderRadius:borderRadius.xl}]}><Text style={[typography.caption,{color:colors.text.tertiary}]}>No routines</Text></View>:
                        routines.map((r:any,idx:number)=>{
                            const imgs=['https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400&q=60','https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=400&q=60','https://images.unsplash.com/photo-1526506118085-60ce8714f8c5?w=400&q=60','https://images.unsplash.com/photo-1518611012118-696072aa579a?w=400&q=60'][idx%4]!;
                            const ac=[colors.accent.coral,colors.accent.cyan,colors.accent.emerald,colors.accent.purple][idx%4]!;
                            return (
                                <TouchableOpacity key={r.id||idx} style={[s.routCard,{borderRadius:borderRadius.xl}]} onPress={()=>router.push({pathname:'/training/onboarding',params:{routineId:r.id}})}>
                                    <Image source={{uri:imgs}} style={StyleSheet.absoluteFillObject} contentFit="cover" />
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
                    {routinesQ.isLoading?<ActivityIndicator color={colors.accent.coral} style={{marginTop:40}} />:(
                        activePlan ? (
                            <View>
                                <View style={[s.planCard,{marginBottom:24}]}>
                                    <Image source={{uri:'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=600&q=70'}} style={s.planImg} contentFit="cover" />
                                    <LinearGradient colors={['transparent','rgba(0,0,0,0.92)']} style={StyleSheet.absoluteFillObject} />
                                    <View style={s.planOvr}>
                                        <View style={[s.planBadge,{backgroundColor:withAlpha(colors.accent.coral,0.3),borderColor:colors.accent.coral}]}><Text style={[typography.caption,{color:colors.accent.coral,fontWeight:'bold',fontSize:10}]}>ACTIVE ROUTINE</Text></View>
                                        <Text style={[typography.heading,{color:'#FFF',fontSize:20,fontWeight:'900',marginTop:8}]}>{activePlan.name}</Text>
                                        <Text style={[typography.caption,{color:'rgba(255,255,255,0.6)',marginTop:4}]}>{activePlan.exercises?.length??0} exercises</Text>
                                    </View>
                                </View>
                                <Text style={[typography.heading,{color:colors.text.primary,marginBottom:14}]}>Exercises</Text>
                                {(activePlan.exercises??[]).slice(0,6).map((ex,i)=>{
                                    const ac=[colors.accent.coral,colors.accent.cyan,colors.accent.emerald,colors.accent.purple,colors.accent.amber,colors.accent.cyan][i%6]!;
                                    return (
                                        <View key={i} style={[s.exRow,{backgroundColor:colors.background.secondary,borderColor:colors.border.default}]}>
                                            <View style={[s.exDot,{backgroundColor:ac}]} />
                                            <Text style={[typography.subhead,{color:colors.text.primary,fontWeight:'bold',flex:1,marginLeft:12}]}>{ex.name}</Text>
                                            <Text style={[typography.caption,{color:colors.text.tertiary}]}>{ex.sets}×{ex.reps}</Text>
                                        </View>
                                    );
                                })}
                                {(activePlan.exercises?.length??0)>6&&<Text style={[typography.caption,{color:colors.text.tertiary,textAlign:'center',marginTop:8}]}>+{(activePlan.exercises?.length??0)-6} more exercises</Text>}
                                <TouchableOpacity style={[s.todayBtn,{backgroundColor:colors.accent.coral,marginTop:20}]} onPress={()=>router.push({pathname:'/training/onboarding',params:{routineId:activePlan.id}} as any)}>
                                    <Ionicons name="flash" size={20} color="#FFF" /><Text style={[typography.subhead,{color:'#FFF',fontWeight:'900',marginLeft:8}]}>START SESSION</Text>
                                </TouchableOpacity>
                            </View>
                        ) : (
                            <View style={[s.noPlan,{borderColor:colors.accent.coral,backgroundColor:withAlpha(colors.accent.coral,0.05)}]}>
                                <Ionicons name="calendar-outline" size={36} color={colors.accent.coral} />
                                <Text style={[typography.heading,{color:colors.text.primary,marginTop:12,textAlign:'center'}]}>No Routines Yet</Text>
                                <Text style={[typography.body,{color:colors.text.tertiary,textAlign:'center',marginTop:6}]}>Create a routine to track your weekly training progress.</Text>
                                <TouchableOpacity style={[s.todayBtn,{backgroundColor:colors.accent.coral,marginTop:20,width:'100%'}]} onPress={()=>router.push('/(exercises)/routines' as any)}>
                                    <Text style={[typography.subhead,{color:'#FFF',fontWeight:'900'}]}>CREATE ROUTINE</Text>
                                </TouchableOpacity>
                            </View>
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
    activeCard:{borderRadius:24,padding:20}, activeRow:{flexDirection:'row',alignItems:'center'},
    activeIcon:{width:40,height:40,borderRadius:20,backgroundColor:'#FFF',alignItems:'center',justifyContent:'center'},
    startWrap:{borderRadius:20,overflow:'hidden',borderWidth:1}, startCard:{padding:28,height:160,justifyContent:'center',overflow:'hidden'},
    beginBadge:{alignSelf:'flex-start',flexDirection:'row',alignItems:'center',paddingHorizontal:12,paddingVertical:6,borderRadius:20,marginTop:16},
    badgeTxt:{color:'#FFF',fontSize:10,fontWeight:'900',marginLeft:4}, bgIco:{position:'absolute',right:-10,bottom:-10},
    secHd:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingHorizontal:20,marginBottom:16,marginTop:8},
    catGrid:{flexDirection:'row',flexWrap:'wrap',paddingHorizontal:20,gap:12,marginBottom:24},
    catCard:{width:(width-52)/2,height:130,overflow:'hidden',justifyContent:'flex-end',padding:12},
    catBadge:{alignSelf:'flex-start',paddingHorizontal:7,paddingVertical:3,borderRadius:6,borderWidth:1,marginBottom:6},
    routCard:{width:180,height:150,overflow:'hidden'}, routContent:{padding:14,justifyContent:'flex-end',flex:1},
    routTag:{alignSelf:'flex-start',paddingHorizontal:6,paddingVertical:2,borderRadius:4,marginBottom:6},
    tagTxt:{color:'#FFF',fontSize:8,fontWeight:'bold'}, emptyR:{width:180,height:150,alignItems:'center',justifyContent:'center'},
    planCard:{height:220,borderRadius:20,overflow:'hidden'}, planImg:{width:'100%',height:220,position:'absolute'},
    planOvr:{position:'absolute',bottom:0,left:0,right:0,padding:20},
    planBadge:{alignSelf:'flex-start',paddingHorizontal:8,paddingVertical:3,borderRadius:6,borderWidth:1},
    exRow:{flexDirection:'row',alignItems:'center',padding:14,marginBottom:10,borderRadius:14,borderWidth:1},
    exDot:{width:8,height:8,borderRadius:4},
    todayBtn:{height:56,borderRadius:28,flexDirection:'row',alignItems:'center',justifyContent:'center'},
    noPlan:{borderWidth:1.5,borderStyle:'dashed',borderRadius:20,padding:32,alignItems:'center'},
});
