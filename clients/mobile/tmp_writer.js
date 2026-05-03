const fs = require('fs');
const base = 'C:/Users/saras/Downloads/NightFule/nightfuel/clients/mobile/';

// ── training.tsx (tabs) ───────────────────────────────────────────────────────
fs.writeFileSync(base + "app/(tabs)/training.tsx", `import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions, ActivityIndicator, ImageBackground } from 'react-native';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
import { TAB_BAR_H } from './_layout';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/utils';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { getRoutines, getActiveSession } from '@/api/exercises';
import { getProtocols } from '@/api/plans';
import { LinearGradient } from 'expo-linear-gradient';
const { width } = Dimensions.get('window');
const CATS = [
    { id:'gym', title:'Gym', img:'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400&q=70', route:'/(exercises)?category=gym', color:'#FF6B35' },
    { id:'home', title:'Home', img:'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=400&q=70', route:'/(exercises)?category=home', color:'#00D4FF' },
    { id:'cardio', title:'Cardio', img:'https://images.unsplash.com/photo-1538805060514-97d9cc17730c?w=400&q=70', route:'/(exercises)?category=cardio', color:'#2ECC71' },
    { id:'recover', title:'Recovery', img:'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=400&q=70', route:'/(exercises)?category=kegel', color:'#A855F7' },
];
const DAYS = ['MON','TUE','WED','THU','FRI','SAT','SUN'];
const DTYPES = ['Chest','Back','Legs','Rest','Shoulders','Arms','Rest'];
const TODAY_IDX = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1;
type TTab = 'train'|'plan';
export default function TrainingHubScreen() {
    const { colors, typography, borderRadius } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const [tab, setTab] = useState<TTab>('train');
    const routinesQ = useQuery({ queryKey:['routines'], queryFn:getRoutines });
    const sessionQ = useQuery({ queryKey:['active-session'], queryFn:getActiveSession });
    const plansQ = useQuery({ queryKey:['suggested-plans'], queryFn:getProtocols });
    const routines = routinesQ.data ?? [];
    const plans = plansQ.data ?? [];
    const activeSession = sessionQ.data;
    const activePlan = plans[0];
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
            {tab==='train' ? (
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
                    {plansQ.isLoading?<ActivityIndicator color={colors.accent.coral} style={{marginTop:40}} />:(
                        activePlan ? (
                            <View>
                                <View style={[s.planCard,{marginBottom:24}]}>
                                    <Image source={{uri:'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=600&q=70'}} style={s.planImg} contentFit="cover" />
                                    <LinearGradient colors={['transparent','rgba(0,0,0,0.92)']} style={StyleSheet.absoluteFillObject} />
                                    <View style={s.planOvr}>
                                        <View style={[s.planBadge,{backgroundColor:withAlpha(colors.accent.coral,0.3),borderColor:colors.accent.coral}]}><Text style={[typography.caption,{color:colors.accent.coral,fontWeight:'bold',fontSize:10}]}>ACTIVE PLAN</Text></View>
                                        <Text style={[typography.heading,{color:'#FFF',fontSize:20,fontWeight:'900',marginTop:8}]}>{(activePlan as any).name||(activePlan as any).title||'My Training Plan'}</Text>
                                        <Text style={[typography.caption,{color:'rgba(255,255,255,0.6)',marginTop:4}]}>Week 1 of 8 • 37% complete</Text>
                                        <View style={[s.progBg,{marginTop:10}]}><View style={[s.progFill,{backgroundColor:colors.accent.coral,width:'37%'}]} /></View>
                                    </View>
                                </View>
                                <Text style={[typography.heading,{color:colors.text.primary,marginBottom:14}]}>This Week</Text>
                                <View style={s.weekRow}>
                                    {DAYS.map((d,i)=>{
                                        const isToday=i===TODAY_IDX; const done=i<TODAY_IDX; const isRest=DTYPES[i]==='Rest';
                                        return (
                                            <View key={d} style={[s.dayChip,{backgroundColor:isToday?withAlpha(colors.accent.coral,0.15):colors.background.secondary,borderColor:isToday?colors.accent.coral:colors.border.default}]}>
                                                <Text style={[typography.caption,{color:isToday?colors.accent.coral:colors.text.tertiary,fontWeight:'bold',fontSize:9}]}>{d}</Text>
                                                {done?<Ionicons name="checkmark-circle" size={16} color={colors.accent.emerald} style={{marginTop:3}} />:isRest?<Ionicons name="bed-outline" size={14} color={colors.text.tertiary} style={{marginTop:3}} />:<Text style={[typography.caption,{color:isToday?colors.accent.coral:colors.text.secondary,fontSize:8,marginTop:3,textAlign:'center'}]}>{DTYPES[i]}</Text>}
                                            </View>
                                        );
                                    })}
                                </View>
                                <TouchableOpacity style={[s.todayBtn,{backgroundColor:colors.accent.coral}]} onPress={()=>router.push('/training/onboarding' as any)}>
                                    <Ionicons name="flash" size={20} color="#FFF" /><Text style={[typography.subhead,{color:'#FFF',fontWeight:'900',marginLeft:8}]}>TODAY'S SESSION</Text>
                                </TouchableOpacity>
                            </View>
                        ) : (
                            <View style={[s.noPlan,{borderColor:colors.accent.coral,backgroundColor:withAlpha(colors.accent.coral,0.05)}]}>
                                <Ionicons name="calendar-outline" size={36} color={colors.accent.coral} />
                                <Text style={[typography.heading,{color:colors.text.primary,marginTop:12,textAlign:'center'}]}>No Active Plan</Text>
                                <Text style={[typography.body,{color:colors.text.tertiary,textAlign:'center',marginTop:6}]}>Start a pre-built program to track your weekly progress.</Text>
                                <TouchableOpacity style={[s.todayBtn,{backgroundColor:colors.accent.coral,marginTop:20,width:'100%'}]} onPress={()=>router.push('/(exercises)/routines' as any)}>
                                    <Text style={[typography.subhead,{color:'#FFF',fontWeight:'900'}]}>BROWSE PROGRAMS</Text>
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
    progBg:{height:4,backgroundColor:'rgba(255,255,255,0.2)',borderRadius:2}, progFill:{height:4,borderRadius:2},
    weekRow:{flexDirection:'row',gap:5,marginBottom:20,marginTop:4},
    dayChip:{flex:1,borderRadius:10,paddingVertical:8,paddingHorizontal:2,alignItems:'center',borderWidth:1},
    todayBtn:{height:56,borderRadius:28,flexDirection:'row',alignItems:'center',justifyContent:'center'},
    noPlan:{borderWidth:1.5,borderStyle:'dashed',borderRadius:20,padding:32,alignItems:'center'},
});
`);
console.log('OK training.tsx');

// ── log-meal.tsx ──────────────────────────────────────────────────────────────
fs.writeFileSync(base + "app/(meals)/log-meal.tsx", `import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Image } from 'expo-image';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { logMeal, searchFoods, getFoodById, getRecipe, FoodItem } from '@/api/meals';
import { LinearGradient } from 'expo-linear-gradient';
import { withAlpha } from '@/theme/utils';
const MT = [
    { id:'BREAKFAST', label:'Breakfast', img:'https://images.unsplash.com/photo-1533089860892-a7c6f0a88666?w=300&q=70', color:'#F59E0B' },
    { id:'LUNCH', label:'Lunch', img:'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=300&q=70', color:'#2ECC71' },
    { id:'DINNER', label:'Dinner', img:'https://images.unsplash.com/photo-1476224203421-9ac39bcb3327?w=300&q=70', color:'#A855F7' },
    { id:'SNACK', label:'Snack', img:'https://images.unsplash.com/photo-1574116813310-adc5f95a4fe4?w=300&q=70', color:'#00D4FF' },
];
type PlateItem = {name:string;calories:number;protein:number;carbs:number;fat:number;qty:number};
export default function LogMealScreen() {
    const { colors, typography } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const qc = useQueryClient();
    const params = useLocalSearchParams<{ foodId?: string; recipeId?: string; preset?: string }>();
    const [mealType, setMealType] = useState('BREAKFAST');
    const [sq, setSq] = useState('');
    const [plate, setPlate] = useState<PlateItem[]>([]);
    const foodQ = useQuery({ queryKey:['log-food',params.foodId], queryFn:()=>getFoodById(params.foodId!), enabled:!!params.foodId });
    const recipeQ = useQuery({ queryKey:['log-recipe',params.recipeId], queryFn:()=>getRecipe(params.recipeId!), enabled:!!params.recipeId });
    const searchQ = useQuery({ queryKey:['meal-search',sq], queryFn:()=>searchFoods({q:sq,limit:20}), enabled:sq.length>2 });
    const logM = useMutation({
        mutationFn:(payload:any)=>logMeal(payload),
        onSuccess:()=>{ qc.invalidateQueries({queryKey:['meal-logs']}); qc.invalidateQueries({queryKey:['daily-progress']}); router.push('/(tabs)/nutrition' as any); },
        onError:(err:any)=>Alert.alert('Error', err.message||'Could not log meal.'),
    });
    const totals = useMemo(()=>plate.reduce((a,i)=>({calories:a.calories+i.calories*i.qty,protein:a.protein+i.protein*i.qty,carbs:a.carbs+i.carbs*i.qty,fat:a.fat+i.fat*i.qty}),{calories:0,protein:0,carbs:0,fat:0}),[plate]);
    const addToPlate = (item:FoodItem) => {
        if(plate.find(p=>p.name===item.name)) return;
        setPlate(prev=>[...prev,{name:item.name,calories:item.calories,protein:item.protein,carbs:item.carbs,fat:item.fat,qty:1}]);
        setSq('');
    };
    React.useEffect(()=>{
        const preItem = foodQ.data||recipeQ.data;
        if(preItem&&plate.length===0){
            const isRecipe = 'title' in preItem;
            setPlate([{name:isRecipe?(preItem as any).title:preItem.name,calories:preItem.calories,protein:preItem.protein,carbs:preItem.carbs,fat:preItem.fat,qty:1}]);
        }
    },[foodQ.data,recipeQ.data]);
    const mc = MT.find(m=>m.id===mealType)!;
    const handleLog = () => {
        if(!mc||plate.length===0) return;
        logM.mutate({ mealType, foodItems:plate.map(i=>({name:i.name,quantity:i.qty,calories:i.calories*i.qty,protein:i.protein*i.qty,carbs:i.carbs*i.qty,fat:i.fat*i.qty})) });
    };
    return (
        <View style={[s.container,{backgroundColor:colors.background.primary}]}>
            <View style={[s.header,{paddingTop:insets.top+16,borderBottomColor:colors.border.default}]}>
                <TouchableOpacity onPress={()=>router.back()}><Ionicons name="arrow-back" size={24} color={colors.text.primary} /></TouchableOpacity>
                <Text style={[typography.heading,{color:colors.text.primary,fontSize:20}]}>Log Meal</Text>
                <View style={{width:24}} />
            </View>
            <ScrollView contentContainerStyle={{paddingBottom:120}} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <Text style={[typography.caption,{color:colors.text.tertiary,fontWeight:'bold',paddingHorizontal:20,marginTop:20,marginBottom:12}]}>SELECT MEAL TYPE</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{paddingHorizontal:20,gap:12,marginBottom:24}}>
                    {MT.map((mt)=>(
                        <TouchableOpacity key={mt.id} style={[s.mealCard,mealType===mt.id&&{borderColor:mt.color,borderWidth:2}]} activeOpacity={0.85} onPress={()=>setMealType(mt.id)}>
                            <Image source={{uri:mt.img}} style={StyleSheet.absoluteFillObject} contentFit="cover" />
                            <LinearGradient colors={['rgba(0,0,0,0.05)','rgba(0,0,0,0.75)']} style={StyleSheet.absoluteFillObject} />
                            {mealType===mt.id&&<View style={[s.mealChk,{backgroundColor:mt.color}]}><Ionicons name="checkmark" size={12} color="#FFF" /></View>}
                            <Text style={[typography.caption,{color:'#FFF',fontWeight:'bold',fontSize:11,zIndex:1}]}>{mt.label.toUpperCase()}</Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
                <Text style={[typography.caption,{color:colors.text.tertiary,fontWeight:'bold',paddingHorizontal:20,marginBottom:12}]}>ADD FOOD</Text>
                <View style={[s.searchBox,{backgroundColor:colors.background.secondary,borderColor:colors.border.default,marginHorizontal:20,marginBottom:12}]}>
                    <Ionicons name="search" size={18} color={colors.text.tertiary} />
                    <TextInput style={[s.searchIn,{color:colors.text.primary}]} placeholder="Search food..." placeholderTextColor={colors.text.tertiary} value={sq} onChangeText={setSq} />
                    {sq.length>0&&<TouchableOpacity onPress={()=>setSq('')}><Ionicons name="close-circle" size={18} color={colors.text.tertiary} /></TouchableOpacity>}
                </View>
                {searchQ.isLoading&&<ActivityIndicator color={colors.accent.coral} style={{marginTop:8}} />}
                {sq.length>2&&(searchQ.data as FoodItem[]||[]).length>0&&(
                    <View style={{marginHorizontal:20,marginBottom:16}}>
                        {(searchQ.data as FoodItem[]).slice(0,6).map((item)=>(
                            <TouchableOpacity key={item.id} style={[s.searchResult,{backgroundColor:colors.background.secondary,borderColor:colors.border.default}]} onPress={()=>addToPlate(item)}>
                                <View style={{flex:1}}>
                                    <Text style={[typography.subhead,{color:colors.text.primary,fontWeight:'bold'}]}>{item.name}</Text>
                                    <Text style={[typography.caption,{color:colors.text.tertiary}]}>{Math.round(item.calories)} kcal per serving</Text>
                                </View>
                                <Ionicons name="add-circle" size={24} color={colors.accent.coral} />
                            </TouchableOpacity>
                        ))}
                    </View>
                )}
                {plate.length>0&&(
                    <View style={{paddingHorizontal:20}}>
                        <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
                            <Text style={[typography.heading,{color:colors.text.primary,fontSize:16}]}>Your Plate</Text>
                            <Text style={[typography.caption,{color:colors.text.tertiary}]}>{plate.length} item{plate.length>1?'s':''}</Text>
                        </View>
                        {plate.map((item,idx)=>(
                            <View key={idx} style={[s.plateRow,{backgroundColor:colors.background.secondary,borderColor:colors.border.default}]}>
                                <View style={[s.plateAccent,{backgroundColor:mc?.color||colors.accent.coral}]} />
                                <View style={{flex:1,paddingLeft:12}}>
                                    <Text style={[typography.subhead,{color:colors.text.primary,fontWeight:'bold'}]} numberOfLines={1}>{item.name}</Text>
                                    <Text style={[typography.caption,{color:colors.text.tertiary}]}>{Math.round(item.calories*item.qty)} kcal • P:{Math.round(item.protein*item.qty)}g</Text>
                                </View>
                                <View style={s.qtyRow}>
                                    <TouchableOpacity onPress={()=>setPlate(plate.map((p,i)=>i===idx?{...p,qty:Math.max(0.5,p.qty-0.5)}:p))}><Ionicons name="remove-circle-outline" size={20} color={colors.text.tertiary} /></TouchableOpacity>
                                    <Text style={[typography.caption,{color:colors.text.primary,fontWeight:'bold',marginHorizontal:6}]}>{item.qty}x</Text>
                                    <TouchableOpacity onPress={()=>setPlate(plate.map((p,i)=>i===idx?{...p,qty:p.qty+0.5}:p))}><Ionicons name="add-circle-outline" size={20} color={colors.accent.coral} /></TouchableOpacity>
                                </View>
                                <TouchableOpacity style={{paddingLeft:8}} onPress={()=>setPlate(plate.filter((_,i)=>i!==idx))}><Ionicons name="trash-outline" size={18} color={colors.accent.coral} /></TouchableOpacity>
                            </View>
                        ))}
                        <View style={[s.macroRow,{backgroundColor:colors.background.secondary,borderColor:colors.border.default}]}>
                            {[{l:'KCAL',v:Math.round(totals.calories),c:colors.accent.coral},{l:'PROTEIN',v:Math.round(totals.protein),c:colors.accent.emerald},{l:'CARBS',v:Math.round(totals.carbs),c:colors.accent.cyan},{l:'FAT',v:Math.round(totals.fat),c:colors.accent.amber}].map((m)=>(
                                <View key={m.l} style={{alignItems:'center',flex:1}}>
                                    <Text style={[typography.heading,{color:m.c,fontSize:18,fontWeight:'900'}]}>{m.v}</Text>
                                    <Text style={[typography.caption,{color:colors.text.tertiary,fontSize:9}]}>{m.l}</Text>
                                </View>
                            ))}
                        </View>
                    </View>
                )}
                {plate.length===0&&sq.length===0&&(
                    <View style={[s.emptyPlate,{borderColor:colors.border.default,marginHorizontal:20}]}>
                        <Ionicons name="restaurant-outline" size={36} color={colors.text.tertiary} />
                        <Text style={[typography.body,{color:colors.text.tertiary,marginTop:8,textAlign:'center'}]}>Search and add food to your plate</Text>
                    </View>
                )}
            </ScrollView>
            <View style={[s.footer,{paddingBottom:Math.max(insets.bottom,20)}]}>
                <TouchableOpacity style={[s.logBtn,{backgroundColor:plate.length>0?(mc?.color||colors.accent.coral):colors.background.secondary}]} onPress={handleLog} disabled={plate.length===0||logM.isPending} activeOpacity={0.85}>
                    {logM.isPending?<ActivityIndicator color="#FFF" />:<><Ionicons name="checkmark-circle" size={22} color={plate.length>0?'#FFF':colors.text.tertiary} /><Text style={[typography.subhead,{color:plate.length>0?'#FFF':colors.text.tertiary,fontWeight:'900',marginLeft:8,fontSize:16}]}>LOG MEAL</Text></>}
                </TouchableOpacity>
            </View>
        </View>
    );
}
const s = StyleSheet.create({
    container:{flex:1}, header:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingHorizontal:20,paddingBottom:16,borderBottomWidth:1},
    mealCard:{width:88,height:96,borderRadius:14,overflow:'hidden',justifyContent:'flex-end',padding:10,borderWidth:1,borderColor:'transparent'},
    mealChk:{position:'absolute',top:6,right:6,width:20,height:20,borderRadius:10,alignItems:'center',justifyContent:'center'},
    searchBox:{flexDirection:'row',alignItems:'center',borderWidth:1,borderRadius:14,paddingHorizontal:14,height:48,gap:8},
    searchIn:{flex:1,fontSize:15},
    searchResult:{flexDirection:'row',alignItems:'center',padding:14,marginBottom:8,borderRadius:12,borderWidth:1},
    plateRow:{flexDirection:'row',alignItems:'center',padding:12,marginBottom:10,borderRadius:14,borderWidth:1,overflow:'hidden'},
    plateAccent:{width:4,alignSelf:'stretch',borderRadius:2},
    qtyRow:{flexDirection:'row',alignItems:'center'},
    macroRow:{flexDirection:'row',borderWidth:1,borderRadius:14,padding:14,marginTop:10,marginBottom:24},
    emptyPlate:{borderWidth:1,borderStyle:'dashed',borderRadius:20,padding:40,alignItems:'center',marginTop:8},
    footer:{position:'absolute',bottom:0,left:0,right:0,paddingHorizontal:20},
    logBtn:{height:60,flexDirection:'row',alignItems:'center',justifyContent:'center',borderRadius:30},
});
`);
console.log('OK log-meal.tsx');

// ── encyclopedia.tsx ──────────────────────────────────────────────────────────
fs.writeFileSync(base + "app/(meals)/encyclopedia.tsx", `import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Alert, FlatList, Modal } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { searchFoods, logMeal, FoodItem } from '@/api/meals';
import { LinearGradient } from 'expo-linear-gradient';
import { withAlpha } from '@/theme/utils';
const FOOD_CATS = [
    { id:'fruits', label:'Fruits', key:'fruit', color:'#F59E0B', img:'https://images.unsplash.com/photo-1490474418585-ba9bad8fd0ea?w=300&q=70' },
    { id:'vegs', label:'Vegetables', key:'vegetable', color:'#2ECC71', img:'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=300&q=70' },
    { id:'protein', label:'Proteins', key:'meat', color:'#EF4444', img:'https://images.unsplash.com/photo-1529692236671-f1f6cf9683ba?w=300&q=70' },
    { id:'dairy', label:'Dairy', key:'dairy', color:'#00D4FF', img:'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=300&q=70' },
    { id:'grains', label:'Grains', key:'grain', color:'#A855F7', img:'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=300&q=70' },
    { id:'snacks', label:'Snacks', key:'snack', color:'#FF6B35', img:'https://images.unsplash.com/photo-1621939514649-280e2ee25f60?w=300&q=70' },
];
export default function FoodEncyclopediaScreen() {
    const { colors, typography } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const qc = useQueryClient();
    const [query, setQuery] = useState('');
    const [selGroup, setSelGroup] = useState<string|null>(null);
    const [servingModal, setServingModal] = useState<FoodItem|null>(null);
    const [qty, setQty] = useState('1');
    const [mealType, setMealType] = useState('BREAKFAST');
    const searchR = useQuery({
        queryKey:['food-search',query,selGroup],
        queryFn:()=>searchFoods({q:query,foodGroup:selGroup||undefined,limit:30}),
        enabled:query.length>2||!!selGroup, staleTime:5*60*1000,
    });
    const logM = useMutation({
        mutationFn:(item:FoodItem)=>logMeal({mealType,foodItems:[{foodId:item.id,name:item.name,quantity:parseFloat(qty),calories:item.calories*parseFloat(qty),protein:item.protein*parseFloat(qty),carbs:item.carbs*parseFloat(qty),fat:item.fat*parseFloat(qty)}]}),
        onSuccess:()=>{ qc.invalidateQueries({queryKey:['meal-logs']}); setServingModal(null); router.push('/(tabs)/nutrition' as any); },
        onError:(err:any)=>Alert.alert('Error', err?.response?.data?.message??'Failed to log meal.'),
    });
    const results = (searchR.data??[]) as FoodItem[];
    const showBrowse = query.length<3&&!selGroup;
    return (
        <View style={[s.container,{backgroundColor:colors.background.primary}]}>
            <View style={[s.header,{paddingTop:insets.top+16,borderBottomColor:colors.border.default}]}>
                <TouchableOpacity onPress={()=>router.back()}><Ionicons name="arrow-back" size={24} color={colors.text.primary} /></TouchableOpacity>
                <View style={[s.searchBox,{backgroundColor:colors.background.secondary,borderColor:colors.border.default}]}>
                    <Ionicons name="search" size={16} color={colors.text.tertiary} />
                    <TextInput style={[s.searchIn,{color:colors.text.primary}]} placeholder="Search food encyclopedia..." placeholderTextColor={colors.text.tertiary} value={query} onChangeText={setQuery} />
                    {query.length>0&&<TouchableOpacity onPress={()=>setQuery('')}><Ionicons name="close-circle" size={16} color={colors.text.tertiary} /></TouchableOpacity>}
                </View>
                <TouchableOpacity><Ionicons name="barcode-outline" size={24} color={colors.accent.coral} /></TouchableOpacity>
            </View>
            {showBrowse ? (
                <ScrollView contentContainerStyle={{padding:20,paddingBottom:100}} showsVerticalScrollIndicator={false}>
                    <Text style={[typography.heading,{color:colors.text.primary,marginBottom:16}]}>Browse by Category</Text>
                    <View style={s.catGrid}>
                        {FOOD_CATS.map((cat)=>(
                            <TouchableOpacity key={cat.id} style={s.catCard} activeOpacity={0.85} onPress={()=>setSelGroup(cat.key)}>
                                <Image source={{uri:cat.img}} style={StyleSheet.absoluteFillObject} contentFit="cover" />
                                <LinearGradient colors={['transparent','rgba(0,0,0,0.82)']} style={StyleSheet.absoluteFillObject} />
                                <View style={[s.catBar,{backgroundColor:cat.color}]} />
                                <Text style={[typography.subhead,{color:'#FFF',fontWeight:'bold',fontSize:13}]}>{cat.label}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </ScrollView>
            ) : (
                <View style={{flex:1}}>
                    {selGroup&&(
                        <View style={[s.filterBar,{borderBottomColor:colors.border.default}]}>
                            <TouchableOpacity style={[s.filterChip,{backgroundColor:colors.accent.coral,borderColor:colors.accent.coral}]} onPress={()=>setSelGroup(null)}>
                                <Ionicons name="close" size={12} color="#FFF" style={{marginRight:4}} />
                                <Text style={[typography.caption,{color:'#FFF',fontWeight:'bold'}]}>{FOOD_CATS.find(c=>c.key===selGroup)?.label||selGroup}</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                    {searchR.isLoading?<ActivityIndicator size="large" color={colors.accent.coral} style={{marginTop:40}} />:
                    results.length===0?<View style={s.empty}><Ionicons name="nutrition-outline" size={64} color={colors.text.tertiary} /><Text style={[typography.body,{color:colors.text.secondary,marginTop:10}]}>{query.length>2?'No results found':'Start typing to search...'}</Text></View>:(
                        <FlatList data={results} keyExtractor={(item)=>item.id} contentContainerStyle={{padding:20,paddingBottom:100}}
                            renderItem={({item})=>(
                                <TouchableOpacity style={[s.foodCard,{backgroundColor:colors.background.secondary,borderColor:colors.border.default}]} onPress={()=>setServingModal(item)}>
                                    <View style={{flex:1}}>
                                        <Text style={[typography.subhead,{color:colors.text.primary,fontWeight:'bold'}]}>{item.name}</Text>
                                        <Text style={[typography.caption,{color:colors.text.tertiary}]}>{item.foodGroup||'General'} • {item.servingSize}</Text>
                                        <View style={{flexDirection:'row',gap:12,marginTop:6}}>
                                            {[{l:'P',v:item.protein,c:colors.accent.emerald},{l:'C',v:item.carbs,c:colors.accent.cyan},{l:'F',v:item.fat,c:colors.accent.amber}].map((m)=>(
                                                <View key={m.l} style={{flexDirection:'row',alignItems:'center'}}>
                                                    <View style={{width:6,height:6,borderRadius:3,backgroundColor:m.c,marginRight:4}} />
                                                    <Text style={[typography.caption,{color:colors.text.tertiary,fontSize:10}]}>{m.l}: {Math.round(m.v)}g</Text>
                                                </View>
                                            ))}
                                        </View>
                                    </View>
                                    <View style={{alignItems:'flex-end'}}>
                                        <Text style={[typography.heading,{color:colors.accent.coral,fontSize:18}]}>{Math.round(item.calories)}</Text>
                                        <Text style={[typography.caption,{color:colors.text.tertiary}]}>KCAL</Text>
                                    </View>
                                </TouchableOpacity>
                            )}
                        />
                    )}
                </View>
            )}
            <Modal visible={!!servingModal} animationType="slide" transparent>
                <View style={[s.modalOvr,{backgroundColor:'rgba(0,0,0,0.8)'}]}>
                    <View style={[s.modalCnt,{backgroundColor:colors.background.primary}]}>
                        <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
                            <Text style={[typography.heading,{color:colors.text.primary}]}>Add to Plate</Text>
                            <TouchableOpacity onPress={()=>setServingModal(null)}><Ionicons name="close" size={24} color={colors.text.primary} /></TouchableOpacity>
                        </View>
                        {servingModal&&(
                            <ScrollView>
                                <Text style={[typography.display,{color:colors.text.primary,fontSize:22,marginBottom:4}]}>{servingModal.name}</Text>
                                <Text style={[typography.body,{color:colors.text.tertiary,marginBottom:20}]}>{servingModal.servingSize} per serving</Text>
                                <Text style={[typography.caption,{color:colors.text.tertiary,marginBottom:8}]}>HOW MANY SERVINGS?</Text>
                                <TextInput style={[s.numInput,{color:colors.text.primary,backgroundColor:colors.background.secondary}]} keyboardType="numeric" value={qty} onChangeText={setQty} />
                                <Text style={[typography.caption,{color:colors.text.tertiary,marginTop:20,marginBottom:8}]}>MEAL TYPE</Text>
                                <View style={{flexDirection:'row',flexWrap:'wrap',gap:10,marginBottom:24}}>
                                    {['BREAKFAST','LUNCH','DINNER','SNACK'].map((t)=>(
                                        <TouchableOpacity key={t} style={[s.typeBtn,{backgroundColor:mealType===t?colors.accent.emerald:colors.background.secondary,borderColor:mealType===t?colors.accent.emerald:colors.border.default}]} onPress={()=>setMealType(t)}>
                                            <Text style={[typography.caption,{color:mealType===t?'#FFF':colors.text.secondary,fontWeight:'bold'}]}>{t}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                                <View style={[s.sumCard,{backgroundColor:colors.background.secondary}]}>
                                    <Text style={[typography.subhead,{color:colors.text.primary,fontWeight:'bold',marginBottom:12}]}>Nutrition Summary</Text>
                                    <View style={{flexDirection:'row',justifyContent:'space-between'}}>
                                        {[{l:'Calories',v:Math.round(servingModal.calories*parseFloat(qty||'0')),u:'kcal'},{l:'Protein',v:Math.round(servingModal.protein*parseFloat(qty||'0')),u:'g'},{l:'Carbs',v:Math.round(servingModal.carbs*parseFloat(qty||'0')),u:'g'},{l:'Fat',v:Math.round(servingModal.fat*parseFloat(qty||'0')),u:'g'}].map((m)=>(
                                            <View key={m.l} style={{alignItems:'center',flex:1}}>
                                                <Text style={[typography.heading,{color:colors.text.primary,fontSize:16}]}>{m.v}</Text>
                                                <Text style={[typography.caption,{color:colors.text.tertiary}]}>{m.u}</Text>
                                            </View>
                                        ))}
                                    </View>
                                </View>
                                <TouchableOpacity style={[s.logBtn,{backgroundColor:logM.isPending?colors.background.secondary:colors.accent.coral,marginTop:24}]} onPress={()=>logM.mutate(servingModal)} disabled={logM.isPending}>
                                    <Text style={[typography.subhead,{color:'#FFF',fontWeight:'900',fontSize:16}]}>{logM.isPending?'LOGGING...':'LOG MEAL'}</Text>
                                </TouchableOpacity>
                            </ScrollView>
                        )}
                    </View>
                </View>
            </Modal>
        </View>
    );
}
const s = StyleSheet.create({
    container:{flex:1}, header:{flexDirection:'row',alignItems:'center',paddingHorizontal:20,paddingBottom:16,borderBottomWidth:1,gap:12},
    searchBox:{flex:1,flexDirection:'row',alignItems:'center',borderWidth:1,borderRadius:12,paddingHorizontal:12,height:44,gap:8},
    searchIn:{flex:1,fontSize:15}, catGrid:{flexDirection:'row',flexWrap:'wrap',gap:12},
    catCard:{width:'47%',height:104,borderRadius:16,overflow:'hidden',justifyContent:'flex-end',padding:12},
    catBar:{width:3,height:18,borderRadius:2,marginBottom:5},
    filterBar:{paddingHorizontal:20,paddingVertical:12,borderBottomWidth:1,flexDirection:'row'},
    filterChip:{flexDirection:'row',alignItems:'center',paddingHorizontal:12,paddingVertical:7,borderRadius:20,borderWidth:1},
    empty:{flex:1,alignItems:'center',justifyContent:'center',padding:40},
    foodCard:{flexDirection:'row',alignItems:'center',padding:16,marginBottom:12,borderRadius:14,borderWidth:1},
    modalOvr:{flex:1,justifyContent:'flex-end'}, modalCnt:{height:'85%',padding:24,borderTopLeftRadius:28,borderTopRightRadius:28},
    numInput:{height:56,paddingHorizontal:16,fontSize:20,fontWeight:'bold',borderRadius:12,marginBottom:8},
    typeBtn:{flex:1,minWidth:'45%',height:44,borderRadius:22,borderWidth:1,alignItems:'center',justifyContent:'center'},
    sumCard:{borderRadius:14,padding:20,marginBottom:8},
    logBtn:{height:60,borderRadius:30,alignItems:'center',justifyContent:'center'},
});
`);
console.log('OK encyclopedia.tsx');

// ── recipes.tsx ───────────────────────────────────────────────────────────────
fs.writeFileSync(base + "app/(meals)/recipes.tsx", `import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Modal } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { getRecipes, getRecipe } from '@/api/meals';
import { LinearGradient } from 'expo-linear-gradient';
import { withAlpha } from '@/theme/utils';
const TAGS = [
    { id:'all', label:'All', color:'#FF6B35' },
    { id:'high-protein', label:'High Protein', color:'#EF4444' },
    { id:'keto', label:'Keto', color:'#F59E0B' },
    { id:'vegan', label:'Vegan', color:'#2ECC71' },
    { id:'meal-prep', label:'Meal Prep', color:'#A855F7' },
    { id:'under-30', label:'Under 30m', color:'#00D4FF' },
];
export default function RecipesScreen() {
    const { colors, typography } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const [selTag, setSelTag] = useState('all');
    const [detailId, setDetailId] = useState<string|null>(null);
    const recipesQ = useQuery({ queryKey:['recipes',selTag], queryFn:()=>getRecipes(selTag==='all'?undefined:selTag), staleTime:5*60*1000 });
    const detailQ = useQuery({ queryKey:['recipe-detail',detailId], queryFn:()=>getRecipe(detailId!), enabled:!!detailId });
    const recipes = (recipesQ.data??[]) as any[];
    return (
        <View style={[s.container,{backgroundColor:colors.background.primary}]}>
            <View style={[s.header,{paddingTop:insets.top+16,borderBottomColor:colors.border.default}]}>
                <TouchableOpacity onPress={()=>router.back()}><Ionicons name="arrow-back" size={24} color={colors.text.primary} /></TouchableOpacity>
                <Text style={[typography.heading,{color:colors.text.primary,fontSize:20}]}>Ria's Kitchen</Text>
                <View style={{width:24}} />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{paddingHorizontal:20,gap:8,paddingVertical:14}} style={{flexGrow:0,borderBottomWidth:1,borderBottomColor:colors.border.default}}>
                {TAGS.map((tag)=>(
                    <TouchableOpacity key={tag.id} style={[s.tagChip,{backgroundColor:selTag===tag.id?tag.color:colors.background.secondary,borderColor:selTag===tag.id?tag.color:colors.border.default}]} onPress={()=>setSelTag(tag.id)}>
                        <Text style={[typography.caption,{color:selTag===tag.id?'#FFF':colors.text.secondary,fontWeight:'bold'}]}>{tag.label.toUpperCase()}</Text>
                    </TouchableOpacity>
                ))}
            </ScrollView>
            {recipesQ.isLoading?<ActivityIndicator size="large" color={colors.accent.coral} style={{marginTop:40}} />:
            recipes.length===0?<View style={s.empty}><Ionicons name="restaurant-outline" size={64} color={colors.text.tertiary} /><Text style={[typography.body,{color:colors.text.secondary,marginTop:10}]}>No recipes match your filter</Text></View>:(
                <ScrollView contentContainerStyle={{padding:20,paddingBottom:100}} showsVerticalScrollIndicator={false}>
                    {recipes.map((r)=>(
                        <TouchableOpacity key={r.id} style={s.recCard} activeOpacity={0.9} onPress={()=>setDetailId(r.id)}>
                            <Image source={{uri:r.image||'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500&q=80'}} style={StyleSheet.absoluteFillObject} contentFit="cover" />
                            <LinearGradient colors={['rgba(0,0,0,0.05)','rgba(0,0,0,0.88)']} style={StyleSheet.absoluteFillObject} />
                            <View style={s.topRow}>
                                <View style={[s.badge,{backgroundColor:'rgba(0,0,0,0.5)'}]}><Ionicons name="time-outline" size={12} color="#FFF" /><Text style={[typography.caption,{color:'#FFF',fontWeight:'bold',fontSize:11,marginLeft:4}]}>{(r.prepTimeMins||0)+(r.cookTimeMins||0)}m</Text></View>
                                <View style={[s.badge,{backgroundColor:'rgba(0,0,0,0.5)'}]}><Text style={[typography.caption,{color:'#FFF',fontWeight:'bold',fontSize:11}]}>{r.servings} serv.</Text></View>
                            </View>
                            <View style={s.recInfo}>
                                <Text style={[typography.heading,{color:'#FFF',fontSize:20,fontWeight:'900'}]}>{r.title}</Text>
                                <View style={{flexDirection:'row',gap:14,marginTop:8}}>
                                    {[{l:Math.round(r.calories)+' kcal',c:colors.accent.coral},{l:Math.round(r.protein)+'g PRO',c:colors.accent.emerald},{l:Math.round(r.carbs)+'g CHO',c:colors.accent.cyan}].map((m)=>(
                                        <Text key={m.l} style={[typography.caption,{color:m.c,fontWeight:'bold',fontSize:11}]}>{m.l}</Text>
                                    ))}
                                </View>
                            </View>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            )}
            <Modal visible={!!detailId} animationType="slide" transparent>
                <View style={{flex:1,backgroundColor:'rgba(0,0,0,0.9)'}}>
                    <View style={[s.modalCnt,{backgroundColor:colors.background.primary}]}>
                        {detailQ.isLoading?<ActivityIndicator size="large" color={colors.accent.coral} style={{marginTop:100}} />:detailQ.data&&(
                            <ScrollView showsVerticalScrollIndicator={false}>
                                <Image source={{uri:detailQ.data.image||'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500&q=80'}} style={s.modalHero} contentFit="cover" />
                                <TouchableOpacity style={[s.closeBtn,{backgroundColor:'rgba(0,0,0,0.5)',top:insets.top+12}]} onPress={()=>setDetailId(null)}><Ionicons name="close" size={24} color="#FFF" /></TouchableOpacity>
                                <View style={s.modalBody}>
                                    <Text style={[typography.display,{color:colors.text.primary,fontSize:26,fontWeight:'900'}]}>{detailQ.data.title}</Text>
                                    <View style={{flexDirection:'row',justifyContent:'space-around',paddingVertical:20}}>
                                        {[{v:detailQ.data.prepTimeMins,l:'PREP'},{v:detailQ.data.cookTimeMins,l:'COOK'},{v:Math.round(detailQ.data.calories),l:'KCAL'}].map((m)=>(
                                            <View key={m.l} style={{alignItems:'center'}}><Text style={[typography.heading,{color:colors.text.primary,fontSize:20}]}>{m.v}</Text><Text style={[typography.caption,{color:colors.text.tertiary}]}>{m.l}</Text></View>
                                        ))}
                                    </View>
                                    <Text style={[typography.heading,{color:colors.text.primary,borderBottomWidth:1,borderBottomColor:colors.border.default,paddingBottom:8,marginTop:8}]}>Ingredients</Text>
                                    {detailQ.data.ingredients.map((ing:any,i:number)=>(
                                        <View key={i} style={{flexDirection:'row',alignItems:'center',marginTop:12}}>
                                            <Ionicons name="radio-button-on" size={12} color={colors.accent.emerald} />
                                            <Text style={[typography.body,{color:colors.text.primary,flex:1,marginLeft:12}]}>{ing.name}</Text>
                                            <Text style={[typography.body,{color:colors.text.tertiary}]}>{ing.amount} {ing.unit||''}</Text>
                                        </View>
                                    ))}
                                    <Text style={[typography.heading,{color:colors.text.primary,borderBottomWidth:1,borderBottomColor:colors.border.default,paddingBottom:8,marginTop:28}]}>Instructions</Text>
                                    {detailQ.data.instructions.map((step:string,i:number)=>(
                                        <View key={i} style={{flexDirection:'row',marginTop:18}}>
                                            <View style={[s.stepNum,{backgroundColor:colors.background.secondary}]}><Text style={[typography.caption,{color:colors.text.primary,fontWeight:'bold'}]}>{i+1}</Text></View>
                                            <Text style={[typography.body,{color:colors.text.secondary,flex:1,marginLeft:14,lineHeight:22}]}>{step}</Text>
                                        </View>
                                    ))}
                                    <TouchableOpacity style={[s.ctaBtn,{backgroundColor:colors.accent.coral,marginTop:40}]} onPress={()=>{ setDetailId(null); router.push({pathname:'/(meals)/log-meal',params:{recipeId:detailQ.data?.id}}); }}>
                                        <Ionicons name="restaurant" size={20} color="#FFF" />
                                        <Text style={[typography.subhead,{color:'#FFF',fontWeight:'900',marginLeft:8,fontSize:16}]}>LOG AS MEAL</Text>
                                    </TouchableOpacity>
                                </View>
                            </ScrollView>
                        )}
                    </View>
                </View>
            </Modal>
        </View>
    );
}
const s = StyleSheet.create({
    container:{flex:1}, header:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:20,paddingBottom:16,borderBottomWidth:1},
    tagChip:{paddingHorizontal:14,paddingVertical:8,borderRadius:20,borderWidth:1},
    empty:{flex:1,alignItems:'center',justifyContent:'center',padding:40},
    recCard:{height:220,borderRadius:20,overflow:'hidden',marginBottom:16,justifyContent:'space-between'},
    topRow:{flexDirection:'row',gap:8,padding:14}, badge:{flexDirection:'row',alignItems:'center',paddingHorizontal:8,paddingVertical:4,borderRadius:8},
    recInfo:{padding:16},
    modalCnt:{flex:1,marginTop:60,borderTopLeftRadius:28,borderTopRightRadius:28,overflow:'hidden'},
    modalHero:{width:'100%',height:300},
    closeBtn:{position:'absolute',right:20,width:44,height:44,borderRadius:22,alignItems:'center',justifyContent:'center'},
    modalBody:{padding:24,marginTop:-40},
    stepNum:{width:30,height:30,borderRadius:15,alignItems:'center',justifyContent:'center'},
    ctaBtn:{height:60,borderRadius:30,flexDirection:'row',alignItems:'center',justifyContent:'center',marginBottom:40},
});
`);
console.log('OK recipes.tsx');

// ── planner.tsx ───────────────────────────────────────────────────────────────
fs.writeFileSync(base + "app/(meals)/planner.tsx", `import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getPlanByDate, generatePlan, ratePlan } from '@/api/plans';
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
    const genM = useMutation({
        mutationFn:()=>generatePlan({date:dateStr}),
        onSuccess:()=>{ qc.invalidateQueries({queryKey:['nutrition-plan',dateStr]}); Alert.alert('Plan Generated','Your AI-powered nutrition protocol is ready.'); },
        onError:(err:any)=>Alert.alert('Generation Failed', err.message||'Could not connect to Ria engine.'),
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
`);
console.log('OK planner.tsx');

console.log('\nAll 5 files written!');
