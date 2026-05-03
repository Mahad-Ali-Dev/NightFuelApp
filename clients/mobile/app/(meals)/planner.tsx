import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getPlanByDate, generatePlan, ratePlan } from '@/api/plans';
import { getCurrent as getCurrentShift } from '@/api/shifts';
import { format, addDays, startOfWeek } from 'date-fns';
import { LinearGradient } from 'expo-linear-gradient';
import { withAlpha } from '@/theme/utils';
const MEAL_COLORS: Record<string,string> = { breakfast:'#F59E0B', lunch:'#2ECC71', dinner:'#A855F7', snack:'#00D4FF' };
const MEAL_IMGS: Record<string,string> = {
    breakfast:'https://images.unsplash.com/photo-1533089860892-a7c6f0a88666?w=200&q=60',
    lunch:'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=200&q=60',
    dinner:'https://images.unsplash.com/photo-1476224203421-9ac39bcb3327?w=200&q=60',
    snack:'https://images.unsplash.com/photo-1574116813310-adc5f95a4fe4?w=200&q=60',
};
export default function MealPlannerScreen() {
    const { colors, typography } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const qc = useQueryClient();
    const [selDate, setSelDate] = useState(new Date());
    const dateStr = format(selDate,'yyyy-MM-dd');
    const planQ = useQuery({ queryKey:['nutrition-plan',dateStr], queryFn:()=>getPlanByDate(dateStr), retry:false });
    const shiftQ = useQuery({ queryKey:['current-shift'], queryFn:()=>getCurrentShift(), retry:false });
    const genM = useMutation({
        mutationFn:()=>generatePlan({
            date:dateStr,
            shiftId: shiftQ.data?.id,
            shiftType: shiftQ.data?.shiftType,
        }),
        onSuccess:()=>{ qc.invalidateQueries({queryKey:['nutrition-plan',dateStr]}); Alert.alert('Plan Generated','Your AI-powered nutrition protocol is ready.'); },
        onError:(err:any)=>Alert.alert('Generation Failed', err?.response?.data?.error || err.message || 'Could not connect to Ria engine.'),
    });
    const rateM = useMutation({
        mutationFn:(rating:number)=>ratePlan(planQ.data!.id,rating),
        onSuccess:()=>qc.invalidateQueries({queryKey:['nutrition-plan',dateStr]}),
    });
    const weekDays = useMemo(()=>{ const start=startOfWeek(new Date(),{weekStartsOn:1}); return Array.from({length:7}).map((_,i)=>addDays(start,i)); },[]);
    const plan = planQ.data;
    return (
        <View style={[s.container,{backgroundColor:colors.background.primary}]}>
            <View style={[s.header,{paddingTop:insets.top+16,borderBottomColor:colors.border.default}]}>
                <TouchableOpacity onPress={()=>router.back()}><Ionicons name="arrow-back" size={24} color={colors.text.primary} /></TouchableOpacity>
                <Text style={[typography.heading,{color:colors.text.primary,fontSize:20}]}>Meal Planner</Text>
                <View style={{width:24}} />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{paddingHorizontal:20,gap:10,paddingVertical:14}} style={{flexGrow:0,borderBottomWidth:1,borderBottomColor:colors.border.default}}>
                {weekDays.map((d)=>{
                    const isSel=format(d,'yyyy-MM-dd')===dateStr;
                    return (
                        <TouchableOpacity key={d.toISOString()} style={[s.dayCard,{backgroundColor:isSel?colors.accent.emerald:colors.background.secondary,borderColor:colors.border.default}]} onPress={()=>setSelDate(d)}>
                            <Text style={[typography.caption,{color:isSel?'#FFF':colors.text.tertiary,fontWeight:'bold',fontSize:10}]}>{format(d,'EEE').toUpperCase()}</Text>
                            <Text style={[typography.heading,{color:isSel?'#FFF':colors.text.primary,fontSize:18,marginTop:4}]}>{format(d,'d')}</Text>
                        </TouchableOpacity>
                    );
                })}
            </ScrollView>
            <ScrollView contentContainerStyle={{padding:20,paddingBottom:100}} showsVerticalScrollIndicator={false}>
                <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
                    <Text style={[typography.heading,{color:colors.text.primary,fontSize:22}]}>{format(selDate,'MMMM do')}</Text>
                    {plan&&<View style={[s.aiBadge,{backgroundColor:withAlpha(colors.accent.purple,0.15)}]}><Text style={[typography.caption,{color:colors.accent.purple,fontWeight:'bold'}]}>AI OPTIMIZED</Text></View>}
                </View>
                {planQ.isLoading?<ActivityIndicator size="large" color={colors.accent.emerald} style={{marginTop:60}} />:
                !plan?(
                    <View style={s.emptyState}>
                        <View style={[s.emptyIcon,{backgroundColor:withAlpha(colors.accent.emerald,0.1)}]}><Ionicons name="sparkles" size={48} color={colors.accent.emerald} /></View>
                        <Text style={[typography.heading,{color:colors.text.primary,textAlign:'center',marginTop:20}]}>No plan for this day</Text>
                        <Text style={[typography.body,{color:colors.text.tertiary,textAlign:'center',marginTop:8}]}>Let Ria analyze your shift schedule and build a perfect nutrition protocol.</Text>
                        <TouchableOpacity style={[s.genBtn,{backgroundColor:colors.accent.emerald,marginTop:32}]} onPress={()=>genM.mutate()} disabled={genM.isPending}>
                            <Ionicons name="sparkles" size={20} color="#FFF" />
                            <Text style={[typography.subhead,{color:'#FFF',fontWeight:'900',marginLeft:8}]}>{genM.isPending?'GENERATING...':'GENERATE AI PLAN'}</Text>
                        </TouchableOpacity>
                    </View>
                ):(
                    <View>
                        <View style={[s.summaryRow,{backgroundColor:colors.background.secondary,borderColor:colors.border.default}]}>
                            {[{l:'CALORIES',v:Math.round(plan.meals.reduce((a:number,m:any)=>a+(m.macros?.calories||0),0)),u:'kcal',c:colors.accent.coral},{l:'PROTEIN',v:Math.round(plan.meals.reduce((a:number,m:any)=>a+(m.macros?.protein||0),0)),u:'g',c:colors.accent.emerald},{l:'HYDRATION',v:(plan.hydrationTargetMl/1000).toFixed(1),u:'L',c:colors.accent.cyan}].map((m)=>(
                                <View key={m.l} style={{alignItems:'center',flex:1}}>
                                    <Text style={[typography.heading,{color:m.c,fontSize:18,fontWeight:'900'}]}>{m.v}</Text>
                                    <Text style={[typography.caption,{color:colors.text.tertiary,fontSize:9}]}>{m.l}</Text>
                                </View>
                            ))}
                        </View>
                        <Text style={[typography.caption,{color:colors.text.tertiary,fontWeight:'bold',marginVertical:16}]}>TIMELINE</Text>
                        {plan.meals.map((meal:any,idx:number)=>{
                            const mKey:string = ((meal.label||'snack') as string).toLowerCase().split(' ')[0]??'snack';
                            const mc = MEAL_COLORS[mKey]??colors.accent.coral;
                            const mi = MEAL_IMGS[mKey]??MEAL_IMGS['snack']!;
                            return (
                                <View key={idx} style={s.mealItem}>
                                    <View style={s.timeLeft}>
                                        <Text style={[typography.caption,{color:colors.text.tertiary,fontWeight:'bold',fontSize:10}]}>{meal.time}</Text>
                                        {idx<plan.meals.length-1&&<View style={[s.timeline,{backgroundColor:colors.border.default}]} />}
                                    </View>
                                    <TouchableOpacity style={[s.mealCard,{backgroundColor:colors.background.secondary,borderColor:colors.border.default}]} onPress={()=>router.push({pathname:'/(meals)/log-meal',params:{preset:meal.label}})}>
                                        <Image source={{uri:mi}} style={s.mealThumb} contentFit="cover" />
                                        <View style={[s.mealAccent,{backgroundColor:mc}]} />
                                        <View style={{flex:1,paddingLeft:12}}>
                                            <Text style={[typography.subhead,{color:colors.text.primary,fontWeight:'bold'}]}>{meal.label}</Text>
                                            <Text style={[typography.caption,{color:colors.text.tertiary,marginTop:2}]} numberOfLines={1}>{meal.description}</Text>
                                        </View>
                                        <Ionicons name="chevron-forward" size={18} color={colors.text.tertiary} />
                                    </TouchableOpacity>
                                </View>
                            );
                        })}
                        {plan.supplements&&plan.supplements.length>0&&(
                            <View style={{marginTop:24}}>
                                <Text style={[typography.caption,{color:colors.text.tertiary,fontWeight:'bold',marginBottom:12}]}>SUPPLEMENTS</Text>
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
                            <Text style={[typography.caption,{color:colors.text.tertiary,marginBottom:12}]}>How was this plan?</Text>
                            <View style={{flexDirection:'row'}}>
                                {[1,2,3,4,5].map((v)=>(
                                    <TouchableOpacity key={v} onPress={()=>rateM.mutate(v)}>
                                        <Ionicons name={v<=4?"star":"star-outline"} size={32} color={colors.accent.amber} style={{marginHorizontal:4}} />
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>
                        <TouchableOpacity style={[s.genBtn,{backgroundColor:colors.background.secondary,marginTop:32,borderWidth:1,borderColor:colors.border.default}]} onPress={()=>genM.mutate()} disabled={genM.isPending}>
                            <Ionicons name="refresh" size={20} color={colors.text.primary} />
                            <Text style={[typography.subhead,{color:colors.text.primary,fontWeight:'900',marginLeft:8}]}>REGENERATE PLAN</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </ScrollView>
        </View>
    );
}
const s = StyleSheet.create({
    container:{flex:1}, header:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingHorizontal:20,paddingBottom:16,borderBottomWidth:1},
    dayCard:{width:56,height:76,alignItems:'center',justifyContent:'center',borderRadius:14,borderWidth:1},
    aiBadge:{paddingHorizontal:10,paddingVertical:4,borderRadius:6},
    emptyState:{alignItems:'center',justifyContent:'center',marginTop:40},
    emptyIcon:{width:100,height:100,borderRadius:50,alignItems:'center',justifyContent:'center'},
    summaryRow:{flexDirection:'row',padding:16,borderRadius:14,borderWidth:1,marginBottom:8},
    mealItem:{flexDirection:'row',marginBottom:16}, timeLeft:{width:56,alignItems:'center',paddingTop:14},
    timeline:{width:2,flex:1,marginVertical:4},
    mealCard:{flex:1,flexDirection:'row',alignItems:'center',padding:10,borderRadius:14,borderWidth:1,overflow:'hidden'},
    mealThumb:{width:44,height:44,borderRadius:8}, mealAccent:{width:3,height:'70%',borderRadius:2,marginLeft:8},
    suppCard:{borderRadius:14,borderWidth:1,padding:4}, suppRow:{flexDirection:'row',alignItems:'center',padding:14},
    genBtn:{height:56,borderRadius:28,flexDirection:'row',alignItems:'center',justifyContent:'center',marginBottom:20},
});
