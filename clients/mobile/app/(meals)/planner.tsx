import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getPlanByDate, generatePlan, ratePlan } from '@/api/plans';
import { getCurrent as getCurrentShift } from '@/api/shifts';
import { format, addDays, startOfWeek } from 'date-fns';
import { LinearGradient } from 'expo-linear-gradient';
import { withAlpha } from '@/theme/utils';
import { getErrorMessage } from '@/utils/validation';
import { shadows } from '@/theme/shadows';
import { spacing, borderRadius } from '@/theme/spacing';
import { Skeleton, EmptyState } from '@/components/ui';
// Per-meal accent stripes use canonical Aurora theme accent hexes (module scope
// can't read the hook): amber / emerald / purple / cyan from '@/theme/colors'.
const MEAL_COLORS: Record<string,string> = { breakfast:'#FFB300', lunch:'#10B981', dinner:'#7C4DFF', snack:'#00D4AA' };
// Bundled Aurora meal art (dark-glass) so the timeline thumbnails never depend
// on an external host (no 404 / rate-limit). '@/*' resolves to ./src, so assets
// are required by relative path (same pattern as the exercise fallbacks).
const MEAL_IMGS: Record<string,number> = {
    breakfast:require('../../assets/images/meal-breakfast.png'),
    lunch:require('../../assets/images/meal-lunch.png'),
    dinner:require('../../assets/images/meal-dinner.png'),
    snack:require('../../assets/images/meal-snack.png'),
};
export default function MealPlannerScreen() {
    const { colors, typography } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const qc = useQueryClient();
    const [selDate, setSelDate] = useState(new Date());
    const [rating, setRating] = useState(0);
    const dateStr = format(selDate,'yyyy-MM-dd');
    const planQ = useQuery({ queryKey:['nutrition-plan',dateStr], queryFn:()=>getPlanByDate(dateStr), retry:false });
    const shiftQ = useQuery({ queryKey:['current-shift'], queryFn:()=>getCurrentShift(), retry:false });
    const genM = useMutation({
        mutationFn:()=>generatePlan({
            date:dateStr,
            shiftId: shiftQ.data?.id,
            shiftType: shiftQ.data?.type,
        }),
        onSuccess:()=>{ qc.invalidateQueries({queryKey:['nutrition-plan',dateStr]}); Alert.alert('Plan Generated','Your AI-powered nutrition protocol is ready.'); },
        onError:(err:unknown)=>Alert.alert('Generation Failed', getErrorMessage(err)),
    });
    const rateM = useMutation({
        mutationFn:(rating:number)=>ratePlan(planQ.data!.id,rating),
        onSuccess:()=>qc.invalidateQueries({queryKey:['nutrition-plan',dateStr]}),
        onError:(err:unknown)=>Alert.alert('Rating Failed', getErrorMessage(err)),
    });
    const weekDays = useMemo(()=>{ const start=startOfWeek(new Date(),{weekStartsOn:1}); return Array.from({length:7}).map((_,i)=>addDays(start,i)); },[]);
    const plan = planQ.data;
    return (
        <View style={[s.container,{backgroundColor:colors.background.primary}]}>
            <StatusBar style="light" />
            <View style={[s.header,{paddingTop:insets.top+16,borderBottomColor:colors.border.default}]}>
                <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Go back" onPress={()=>router.back()} style={[s.iconBtn,{backgroundColor:colors.background.secondary,borderColor:colors.border.default}]}><Ionicons name="arrow-back" size={22} color={colors.text.primary} /></TouchableOpacity>
                <Text style={[typography.h2,{color:colors.text.primary}]}>Meal Planner</Text>
                <View style={{width:40}} />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{paddingHorizontal:20,gap:10,paddingVertical:14}} style={{flexGrow:0,borderBottomWidth:1,borderBottomColor:colors.border.default}}>
                {weekDays.map((d)=>{
                    const isSel=format(d,'yyyy-MM-dd')===dateStr;
                    return (
                        <TouchableOpacity key={d.toISOString()} activeOpacity={0.85} accessibilityRole="button" accessibilityState={{ selected: isSel }} accessibilityLabel={format(d,'EEEE, MMMM d')} style={[s.dayCard,{backgroundColor:isSel?colors.accent.emerald:colors.background.secondary,borderColor:isSel?colors.accent.emerald:colors.border.default},isSel&&shadows.glow(colors.accent.emerald)]} onPress={()=>setSelDate(d)}>
                            <Text style={[typography.overline,{color:isSel?'#FFF':colors.text.tertiary,fontSize:10,letterSpacing:1}]}>{format(d,'EEE').toUpperCase()}</Text>
                            <Text style={[typography.statSmall,{color:isSel?'#FFF':colors.text.primary,fontSize:18,lineHeight:24,marginTop:4}]}>{format(d,'d')}</Text>
                        </TouchableOpacity>
                    );
                })}
            </ScrollView>
            <ScrollView contentContainerStyle={{padding:20,paddingBottom:100}} showsVerticalScrollIndicator={false}>
                <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
                    <Text style={[typography.h1,{color:colors.text.primary}]}>{format(selDate,'MMMM do')}</Text>
                    {plan&&<View style={[s.aiBadge,{backgroundColor:withAlpha(colors.accent.purple,0.15),borderColor:withAlpha(colors.accent.purple,0.28)}]}><Ionicons name="sparkles" size={11} color={colors.accent.purple} style={{marginRight:5}} /><Text style={[typography.overline,{color:colors.accent.purple,fontSize:10,letterSpacing:1}]}>AI OPTIMIZED</Text></View>}
                </View>
                {planQ.isLoading?(
                    <View>
                        <Skeleton width="100%" height={72} radius={borderRadius.lg} style={{marginBottom:spacing.lg}} />
                        <Skeleton width={90} height={12} radius={6} style={{marginVertical:spacing.lg}} />
                        {[0,1,2,3].map((i)=>(
                            <View key={i} style={{flexDirection:'row',marginBottom:spacing.lg}}>
                                <Skeleton width={40} height={12} radius={6} style={{marginTop:14,marginRight:16}} />
                                <Skeleton width="100%" height={64} radius={borderRadius.lg} style={{flex:1}} />
                            </View>
                        ))}
                    </View>
                ):
                planQ.isError?(
                    <EmptyState
                        icon="cloud-offline-outline"
                        title="Couldn't load your plan"
                        subtitle="Something went wrong reaching the Ria nutrition engine. Check your connection and try again."
                        actionLabel="Retry"
                        onAction={()=>planQ.refetch()}
                    />
                ):
                !plan?(
                    <View style={s.emptyState}>
                        <View style={[s.emptyIcon,{backgroundColor:withAlpha(colors.accent.purple,0.12),borderColor:withAlpha(colors.accent.purple,0.24),borderWidth:1},shadows.glow(colors.accent.purple)]}><Ionicons name="sparkles" size={48} color={colors.accent.purple} /></View>
                        <Text style={[typography.overline,{color:colors.accent.purple,textAlign:'center',marginTop:24}]}>RIA NUTRITION ENGINE</Text>
                        <Text style={[typography.h2,{color:colors.text.primary,textAlign:'center',marginTop:8}]}>No plan for this day</Text>
                        <Text style={[typography.body,{color:colors.text.secondary,textAlign:'center',marginTop:8,maxWidth:300}]}>Let Ria analyze your shift schedule and build a perfect nutrition protocol.</Text>
                        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Generate AI plan" accessibilityState={{ disabled: genM.isPending }} style={[s.genBtnWrap,{marginTop:32},!genM.isPending&&shadows.glow(colors.accent.coral)]} onPress={()=>genM.mutate()} disabled={genM.isPending} activeOpacity={0.85}>
                            <LinearGradient colors={colors.gradients.coral} start={{x:0,y:0}} end={{x:1,y:0}} style={s.genBtn}>
                                <Ionicons name="sparkles" size={20} color="#FFF" />
                                <Text style={[typography.subhead,{color:'#FFF',fontWeight:'900',marginLeft:8}]}>{genM.isPending?'GENERATING...':'GENERATE AI PLAN'}</Text>
                            </LinearGradient>
                        </TouchableOpacity>
                    </View>
                ):(
                    <View>
                        <View style={[s.summaryRow,{backgroundColor:colors.background.secondary,borderColor:colors.border.default}]}>
                            {[{l:'CALORIES',v:Math.round(plan.meals.reduce((a:number,m:any)=>a+(m.macros?.calories||0),0)),u:'kcal',c:colors.accent.coral},{l:'PROTEIN',v:Math.round(plan.meals.reduce((a:number,m:any)=>a+(m.macros?.protein||0),0)),u:'g',c:colors.accent.emerald},{l:'HYDRATION',v:(plan.hydrationTargetMl/1000).toFixed(1),u:'L',c:colors.accent.cyan}].map((m)=>(
                                <View key={m.l} style={{alignItems:'center',flex:1}}>
                                    <Text style={[typography.statMedium,{color:m.c,fontSize:26,lineHeight:32}]}>{m.v}</Text>
                                    <Text style={[typography.overline,{color:colors.text.secondary,fontSize:9,letterSpacing:1,marginTop:4}]}>{m.l}</Text>
                                </View>
                            ))}
                        </View>
                        <Text style={[typography.overline,{color:colors.text.secondary,marginVertical:16}]}>TIMELINE</Text>
                        {plan.meals.map((meal:any,idx:number)=>{
                            const mKey:string = ((meal.label||'snack') as string).toLowerCase().split(' ')[0]??'snack';
                            const mc = MEAL_COLORS[mKey]??colors.accent.coral;
                            const mi = MEAL_IMGS[mKey]??MEAL_IMGS['snack']!;
                            return (
                                <View key={idx} style={s.mealItem}>
                                    <View style={s.timeLeft}>
                                        <Text style={[typography.caption,{color:colors.text.secondary,fontWeight:'bold',fontSize:10}]}>{meal.time}</Text>
                                        {idx<plan.meals.length-1&&<View style={[s.timeline,{backgroundColor:colors.border.default}]} />}
                                    </View>
                                    <TouchableOpacity activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={meal.label} style={[s.mealCard,{backgroundColor:colors.background.secondary,borderColor:colors.border.default}]} onPress={()=>router.push({pathname:'/(meals)/log-meal',params:{preset:meal.label}})}>
                                        <Image source={mi} style={s.mealThumb} contentFit="cover" cachePolicy="memory-disk" transition={200} />
                                        <View style={[s.mealAccent,{backgroundColor:mc}]} />
                                        <View style={{flex:1,paddingLeft:12}}>
                                            <Text style={[typography.subhead,{color:colors.text.primary,fontWeight:'bold'}]}>{meal.label}</Text>
                                            <Text style={[typography.caption,{color:colors.text.secondary,marginTop:2}]} numberOfLines={1}>{meal.description}</Text>
                                        </View>
                                        <Ionicons name="chevron-forward" size={18} color={colors.text.tertiary} />
                                    </TouchableOpacity>
                                </View>
                            );
                        })}
                        {plan.supplements&&plan.supplements.length>0&&(
                            <View style={{marginTop:24}}>
                                <Text style={[typography.overline,{color:colors.text.secondary,marginBottom:12}]}>SUPPLEMENTS</Text>
                                <View style={[s.suppCard,{backgroundColor:colors.background.secondary,borderColor:colors.border.default}]}>
                                    {plan.supplements.map((sup:string,i:number)=>(
                                        <View key={i} style={[s.suppRow,i!==plan.supplements.length-1&&{borderBottomWidth:1,borderBottomColor:colors.border.default}]}>
                                            <Ionicons name="medical" size={18} color={colors.accent.purple} />
                                            <Text style={[typography.body,{color:colors.text.primary,marginLeft:12}]}>{sup}</Text>
                                        </View>
                                    ))}
                                </View>
                            </View>
                        )}
                        <View style={{marginTop:40,alignItems:'center'}}>
                            <Text style={[typography.caption,{color:colors.text.secondary,marginBottom:12}]}>How was this plan?</Text>
                            <View style={{flexDirection:'row'}}>
                                {[1,2,3,4,5].map((v)=>(
                                    <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={`Rate ${v} star${v>1?'s':''}`} key={v} onPress={()=>{ setRating(v); rateM.mutate(v); }}>
                                        <Ionicons name={v<=rating?"star":"star-outline"} size={32} color={colors.accent.amber} style={{marginHorizontal:4}} />
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>
                        <TouchableOpacity activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Regenerate plan" accessibilityState={{ disabled: genM.isPending, busy: genM.isPending }} style={[s.genBtn,{backgroundColor:colors.background.secondary,marginTop:32,borderWidth:1,borderColor:colors.border.default},genM.isPending&&{opacity:0.6}]} onPress={()=>genM.mutate()} disabled={genM.isPending}>
                            {genM.isPending
                                ? <ActivityIndicator size="small" color={colors.text.primary} />
                                : <Ionicons name="refresh" size={20} color={colors.text.primary} />}
                            <Text style={[typography.subhead,{color:colors.text.primary,fontWeight:'900',marginLeft:8}]}>{genM.isPending?'GENERATING...':'REGENERATE PLAN'}</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </ScrollView>
        </View>
    );
}
const s = StyleSheet.create({
    container:{flex:1}, header:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingHorizontal:20,paddingBottom:16,borderBottomWidth:1},
    iconBtn:{width:40,height:40,borderRadius:12,borderWidth:1,alignItems:'center',justifyContent:'center'},
    dayCard:{width:56,height:76,alignItems:'center',justifyContent:'center',borderRadius:14,borderWidth:1},
    aiBadge:{flexDirection:'row',alignItems:'center',paddingHorizontal:10,paddingVertical:5,borderRadius:999,borderWidth:1},
    emptyState:{alignItems:'center',justifyContent:'center',marginTop:40},
    emptyIcon:{width:100,height:100,borderRadius:50,alignItems:'center',justifyContent:'center'},
    summaryRow:{flexDirection:'row',padding:16,borderRadius:14,borderWidth:1,marginBottom:8},
    mealItem:{flexDirection:'row',marginBottom:16}, timeLeft:{width:56,alignItems:'center',paddingTop:14},
    timeline:{width:2,flex:1,marginVertical:4},
    mealCard:{flex:1,flexDirection:'row',alignItems:'center',padding:10,borderRadius:14,borderWidth:1,overflow:'hidden'},
    mealThumb:{width:44,height:44,borderRadius:8}, mealAccent:{width:3,height:'70%',borderRadius:2,marginLeft:8},
    suppCard:{borderRadius:14,borderWidth:1,padding:4}, suppRow:{flexDirection:'row',alignItems:'center',padding:14},
    genBtnWrap:{width:'100%',borderRadius:28,overflow:'hidden'},
    genBtn:{height:56,borderRadius:28,flexDirection:'row',alignItems:'center',justifyContent:'center',marginBottom:20},
});
