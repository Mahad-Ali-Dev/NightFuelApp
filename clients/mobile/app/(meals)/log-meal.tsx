import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert } from 'react-native';
import { Image } from 'expo-image';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { logMeal, searchFoods, getFoodById, getRecipe, FoodItem } from '@/api/meals';
import { LinearGradient } from 'expo-linear-gradient';
import { borderRadius } from '@/theme/spacing';
import { GlassCard, Skeleton, EmptyState, CtaButton } from '@/components/ui';
import { getErrorMessage } from '@/utils/validation';
import { invalidateMealAndProgress } from '@/utils/invalidateMealAndProgress';
const MT = [
    { id:'BREAKFAST', label:'Breakfast', img:require('../../assets/images/meal-breakfast.png'), color:'#F59E0B' },
    { id:'LUNCH', label:'Lunch', img:require('../../assets/images/meal-lunch.png'), color:'#2ECC71' },
    { id:'DINNER', label:'Dinner', img:require('../../assets/images/meal-dinner.png'), color:'#A855F7' },
    { id:'SNACK', label:'Snack', img:require('../../assets/images/meal-snack.png'), color:'#00D4FF' },
];
type PlateItem = {name:string;calories:number;protein:number;carbs:number;fat:number;qty:number};
// Plate quantity is button-driven (+/- 0.5, floored at 0.5) but a barcode
// prefill or a corrupted param could still seed a non-finite/non-positive qty
// that would multiply through into fabricated macros and the log payload.
// (Number.isFinite discipline, no new dep.)
const QTY_FLOOR = 0.5;
// A qty is "usable" only when it's a finite number > 0. Anything else (NaN,
// 0, negative, Infinity) is never multiplied into a real macro.
const isUsableQty = (n:number):boolean => Number.isFinite(n) && n > 0;
// For the +/- buttons: clamp the live qty back to the 0.5 floor if it ever drifts
// non-usable, so the on-screen stepper always shows a sane positive value.
const safeQty = (n:number):number => (isUsableQty(n) ? n : QTY_FLOOR);
// For macro MATH (totals + payload): an unusable qty contributes ZERO rather than
// a fabricated/floored number — so a corrupt qty yields no macro output at all.
const qtyForMath = (n:number):number => (isUsableQty(n) ? n : 0);
// Coerce a possibly-NaN macro (e.g. Number(params.barcodeCalories)) to 0 so a
// non-numeric param can never propagate a NaN into the macro math or the payload.
const safeNum = (n:number):number => (Number.isFinite(n) ? n : 0);
export default function LogMealScreen() {
    const { colors, typography } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const qc = useQueryClient();
    const params = useLocalSearchParams<{
        foodId?: string;
        recipeId?: string;
        preset?: string;
        // Populated by barcode-scanner when it resolves a product via Open Food Facts
        barcodeName?: string;
        barcodeCalories?: string;
        barcodeProtein?: string;
        barcodeCarbs?: string;
        barcodeFat?: string;
    }>();
    const [mealType, setMealType] = useState('BREAKFAST');
    const [sq, setSq] = useState('');
    const [plate, setPlate] = useState<PlateItem[]>([]);
    const foodQ = useQuery({ queryKey:['log-food',params.foodId], queryFn:()=>getFoodById(params.foodId!), enabled:!!params.foodId });
    const recipeQ = useQuery({ queryKey:['log-recipe',params.recipeId], queryFn:()=>getRecipe(params.recipeId!), enabled:!!params.recipeId });
    const searchQ = useQuery({ queryKey:['meal-search',sq], queryFn:()=>searchFoods({q:sq,limit:20}), enabled:sq.length>2 });
    const logM = useMutation({
        mutationFn:(payload:any)=>logMeal(payload),
        // Route success invalidation through the shared helper so BOTH calorie
        // rings refresh: the Nutrition tab's ['daily-progress'] AND the dashboard's
        // ['today-progress'] (plus the ['meal-logs'] list) — see
        // invalidateMealAndProgress. Logging here previously refreshed only the
        // nutrition ring, leaving the dashboard ring stale (the split-brain).
        onSuccess:()=>{ invalidateMealAndProgress(qc); router.push('/(tabs)/nutrition' as any); },
        onError:(err:any)=>Alert.alert('Error', getErrorMessage(err)),
    });
    const totals = useMemo(()=>plate.reduce((a,i)=>{const q=qtyForMath(i.qty);return {calories:a.calories+safeNum(i.calories)*q,protein:a.protein+safeNum(i.protein)*q,carbs:a.carbs+safeNum(i.carbs)*q,fat:a.fat+safeNum(i.fat)*q};},{calories:0,protein:0,carbs:0,fat:0}),[plate]);
    const addToPlate = (item:FoodItem) => {
        if(plate.find(p=>p.name===item.name)) return;
        setPlate(prev=>[...prev,{name:item.name,calories:item.calories,protein:item.protein,carbs:item.carbs,fat:item.fat,qty:1}]);
        setSq('');
    };
    // Pre-populate from foodId / recipeId params
    React.useEffect(()=>{
        const preItem = foodQ.data||recipeQ.data;
        if(preItem&&plate.length===0){
            const isRecipe = 'title' in preItem;
            setPlate([{name:isRecipe?(preItem as any).title:preItem.name,calories:preItem.calories,protein:preItem.protein,carbs:preItem.carbs,fat:preItem.fat,qty:1}]);
        }
    },[foodQ.data,recipeQ.data]);

    // Pre-populate from barcode-scanner (Open Food Facts resolved product)
    React.useEffect(()=>{
        if(params.barcodeName && plate.length===0){
            setPlate([{
                name:     params.barcodeName,
                calories: safeNum(Number(params.barcodeCalories ?? 0)),
                protein:  safeNum(Number(params.barcodeProtein  ?? 0)),
                carbs:    safeNum(Number(params.barcodeCarbs    ?? 0)),
                fat:      safeNum(Number(params.barcodeFat      ?? 0)),
                qty:      1,
            }]);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    },[params.barcodeName]);
    const mc = MT.find(m=>m.id===mealType)!;
    const handleLog = () => {
        if(!mc||plate.length===0) return;
        // Build the payload from guarded numbers so a non-finite/non-positive qty
        // or a NaN macro can never be logged as a fabricated value: EXCLUDE any item
        // whose qty isn't a finite number > 0 (no fabricated entry), then coerce each
        // macro finite before multiplying. If nothing usable remains, don't fire the
        // mutation at all (no silent empty/garbage log).
        const foodItems = plate
            .filter(i=>i.name && isUsableQty(i.qty))
            .map(i=>({name:i.name,quantity:i.qty,calories:safeNum(i.calories)*i.qty,protein:safeNum(i.protein)*i.qty,carbs:safeNum(i.carbs)*i.qty,fat:safeNum(i.fat)*i.qty}));
        if(foodItems.length===0) return;
        logM.mutate({ mealType, foodItems });
    };
    return (
        <View style={[s.container,{backgroundColor:colors.background.primary}]}>
            <StatusBar style="light" />
            <View style={[s.header,{paddingTop:insets.top+16,borderBottomColor:colors.border.default}]}>
                <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Go back" onPress={()=>router.back()} style={[s.iconBtn,{backgroundColor:colors.background.secondary,borderColor:colors.border.default}]}><Ionicons name="arrow-back" size={22} color={colors.text.primary} /></TouchableOpacity>
                <Text style={[typography.h2,{color:colors.text.primary}]}>Log Meal</Text>
                <View style={{width:40}} />
            </View>
            <ScrollView contentContainerStyle={{paddingBottom:120}} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <Text style={[typography.overline,{color:colors.text.secondary,paddingHorizontal:20,marginTop:24,marginBottom:12}]}>SELECT MEAL TYPE</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{paddingHorizontal:20,gap:12,marginBottom:24}}>
                    {MT.map((mt)=>(
                        <TouchableOpacity key={mt.id} accessibilityRole="button" accessibilityState={{ selected: mealType===mt.id }} accessibilityLabel={mt.label} style={[s.mealCard,mealType===mt.id&&{borderColor:mt.color,borderWidth:2}]} activeOpacity={0.85} onPress={()=>setMealType(mt.id)}>
                            <Image source={mt.img} style={StyleSheet.absoluteFillObject} contentFit="cover" cachePolicy="memory-disk" transition={200} />
                            <LinearGradient colors={['rgba(0,0,0,0.05)','rgba(0,0,0,0.75)']} style={StyleSheet.absoluteFillObject} />
                            {mealType===mt.id&&<View style={[s.mealChk,{backgroundColor:mt.color}]}><Ionicons name="checkmark" size={12} color="#FFF" /></View>}
                            <Text style={[typography.caption,{color:'#FFF',fontWeight:'bold',fontSize:11,zIndex:1}]}>{mt.label.toUpperCase()}</Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
                <Text style={[typography.overline,{color:colors.text.secondary,paddingHorizontal:20,marginBottom:12}]}>ADD FOOD</Text>
                <GlassCard radius={14} style={{ marginHorizontal:20, marginBottom:12 }}>
                    <View style={s.searchBox}>
                        <Ionicons name="search" size={18} color={colors.text.tertiary} />
                        <TextInput style={[s.searchIn,{color:colors.text.primary}]} placeholder="Search food..." placeholderTextColor={colors.text.tertiary} value={sq} onChangeText={setSq} />
                        {sq.length>0?<TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Clear" onPress={()=>setSq('')}><Ionicons name="close-circle" size={18} color={colors.text.tertiary} /></TouchableOpacity>:null}
                    </View>
                </GlassCard>
                {searchQ.isLoading?(
                    <View style={{marginHorizontal:20,marginBottom:16}}>
                        {[0,1,2].map((i)=>(
                            <Skeleton key={i} width="100%" height={62} radius={borderRadius.md} style={{marginBottom:8}} />
                        ))}
                    </View>
                ):null}
                {sq.length>2&&!searchQ.isLoading&&searchQ.isError?(
                    <View style={{marginHorizontal:20,marginBottom:16}}>
                        <EmptyState
                            icon="cloud-offline-outline"
                            title="Search failed"
                            subtitle="Couldn't reach the food database. Check your connection and try again."
                            actionLabel="Try Again"
                            onAction={()=>searchQ.refetch()}
                        />
                    </View>
                ):null}
                {sq.length>2&&(searchQ.data as FoodItem[]||[]).length>0?(
                    <View style={{marginHorizontal:20,marginBottom:16}}>
                        {(searchQ.data as FoodItem[]).slice(0,6).map((item)=>(
                            <TouchableOpacity key={item.id} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={`Add ${item.name}`} style={[s.searchResult,{backgroundColor:colors.background.secondary,borderColor:colors.border.default}]} onPress={()=>addToPlate(item)}>
                                <View style={{flex:1}}>
                                    <Text style={[typography.subhead,{color:colors.text.primary,fontWeight:'bold'}]}>{item.name}</Text>
                                    <Text style={[typography.caption,{color:colors.text.secondary}]}>{Math.round(item.calories)} kcal per serving</Text>
                                </View>
                                <Ionicons name="add-circle" size={24} color={colors.accent.coral} />
                            </TouchableOpacity>
                        ))}
                    </View>
                ):null}
                {plate.length>0?(
                    <View style={{paddingHorizontal:20}}>
                        <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
                            <Text style={[typography.h3,{color:colors.text.primary}]}>Your Plate</Text>
                            <Text style={[typography.caption,{color:colors.text.secondary}]}>{plate.length} item{plate.length>1?'s':''}</Text>
                        </View>
                        {plate.map((item,idx)=>(
                            <View key={idx} style={[s.plateRow,{backgroundColor:colors.background.secondary,borderColor:colors.border.default}]}>
                                <View style={[s.plateAccent,{backgroundColor:mc?.color||colors.accent.coral}]} />
                                <View style={{flex:1,paddingLeft:12}}>
                                    <Text style={[typography.subhead,{color:colors.text.primary,fontWeight:'bold'}]} numberOfLines={1}>{item.name}</Text>
                                    <Text style={[typography.caption,{color:colors.text.secondary}]}>{Math.round(safeNum(item.calories)*qtyForMath(item.qty))} kcal • P:{Math.round(safeNum(item.protein)*qtyForMath(item.qty))}g</Text>
                                </View>
                                <View style={s.qtyRow}>
                                    <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Decrease" onPress={()=>setPlate(plate.map((p,i)=>i===idx?{...p,qty:Math.max(QTY_FLOOR,safeQty(p.qty)-0.5)}:p))}><Ionicons name="remove-circle-outline" size={20} color={colors.text.tertiary} /></TouchableOpacity>
                                    <Text style={[typography.caption,{color:colors.text.primary,fontWeight:'bold',marginHorizontal:6}]}>{safeQty(item.qty)}x</Text>
                                    <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Increase" onPress={()=>setPlate(plate.map((p,i)=>i===idx?{...p,qty:safeQty(p.qty)+0.5}:p))}><Ionicons name="add-circle-outline" size={20} color={colors.accent.coral} /></TouchableOpacity>
                                </View>
                                <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Delete" style={{paddingLeft:8}} onPress={()=>setPlate(plate.filter((_,i)=>i!==idx))}><Ionicons name="trash-outline" size={18} color={colors.accent.coral} /></TouchableOpacity>
                            </View>
                        ))}
                        <GlassCard radius={14} style={{ marginTop:10, marginBottom:24 }}>
                            <View style={s.macroRow}>
                                {[{l:'KCAL',v:Math.round(totals.calories),c:colors.accent.coral},{l:'PROTEIN',v:Math.round(totals.protein),c:colors.accent.emerald},{l:'CARBS',v:Math.round(totals.carbs),c:colors.accent.cyan},{l:'FAT',v:Math.round(totals.fat),c:colors.accent.amber}].map((m)=>(
                                    <View key={m.l} style={{alignItems:'center',flex:1}}>
                                        <Text style={[typography.statSmall,{color:m.c,fontSize:20,lineHeight:26}]}>{m.v}</Text>
                                        <Text style={[typography.overline,{color:colors.text.secondary,fontSize:9,letterSpacing:1,marginTop:2}]}>{m.l}</Text>
                                    </View>
                                ))}
                            </View>
                        </GlassCard>
                    </View>
                ):null}
                {plate.length===0&&sq.length===0?(
                    <EmptyState
                        icon="restaurant-outline"
                        title="Build your plate"
                        subtitle="Search for a food above to start adding items, then log them all at once."
                    />
                ):null}
            </ScrollView>
            <View style={[s.footer,{paddingBottom:Math.max(insets.bottom,20)}]}>
                <CtaButton
                    label="LOG MEAL"
                    icon="checkmark-circle"
                    size="lg"
                    accessibilityLabel="Log meal"
                    loading={logM.isPending}
                    disabled={plate.length===0}
                    onPress={handleLog}
                    style={s.logBtnWrap}
                />
            </View>
        </View>
    );
}
const s = StyleSheet.create({
    container:{flex:1}, header:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingHorizontal:20,paddingBottom:16,borderBottomWidth:1},
    iconBtn:{width:40,height:40,borderRadius:12,borderWidth:1,alignItems:'center',justifyContent:'center'},
    mealCard:{width:88,height:96,borderRadius:14,overflow:'hidden',justifyContent:'flex-end',padding:10,borderWidth:1,borderColor:'transparent'},
    mealChk:{position:'absolute',top:6,right:6,width:20,height:20,borderRadius:10,alignItems:'center',justifyContent:'center'},
    searchBox:{flexDirection:'row',alignItems:'center',paddingHorizontal:14,height:48,gap:8},
    searchIn:{flex:1,fontSize:15},
    searchResult:{flexDirection:'row',alignItems:'center',padding:14,marginBottom:8,borderRadius:12,borderWidth:1},
    plateRow:{flexDirection:'row',alignItems:'center',padding:12,marginBottom:10,borderRadius:14,borderWidth:1,overflow:'hidden'},
    plateAccent:{width:4,alignSelf:'stretch',borderRadius:2},
    qtyRow:{flexDirection:'row',alignItems:'center'},
    macroRow:{flexDirection:'row',padding:14},
    footer:{position:'absolute',bottom:0,left:0,right:0,paddingHorizontal:20},
    logBtnWrap:{height:60,borderRadius:30},
});
