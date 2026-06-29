import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Pressable, Alert } from 'react-native';
import { Image } from 'expo-image';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { logMeal, searchFoods, getFoodById, getRecipe, FoodItem, FoodItemMicros } from '@/api/meals';
import { getToday as getTodayProgress } from '@/api/progress';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { borderRadius } from '@/theme/spacing';
import { GlassCard, Skeleton, EmptyState, CtaButton } from '@/components/ui';
import { MealMacroSummary } from '@/components/MealMacroSummary';
import { getErrorMessage } from '@/utils/validation';
import { invalidateMealAndProgress } from '@/utils/invalidateMealAndProgress';
// Meal-type catalog is static (id/label/image); the accent COLOR is resolved from
// useTheme() tokens inside the component (mealColor) so nothing here bypasses the
// theme with raw hex — each meal maps onto the Zeitra functional palette.
const MT = [
    { id:'BREAKFAST', label:'Breakfast', img:require('../../assets/images/meal-breakfast.png') },
    { id:'LUNCH', label:'Lunch', img:require('../../assets/images/meal-lunch.png') },
    { id:'DINNER', label:'Dinner', img:require('../../assets/images/meal-dinner.png') },
    { id:'SNACK', label:'Snack', img:require('../../assets/images/meal-snack.png') },
];
// A plate item carries the 4 headline macros + an OPTIONAL `micros` bag. The bag
// is populated ONLY for an item added from a scanned barcode that reported micros
// (keys/units match the backend FoodItemMicros / parseProduct exactly); search-
// and recipe-added items leave it undefined. Per-100g micros are NOT scaled by
// quantity here — they describe the food's composition and are forwarded as-is,
// mirroring how the backend stores per-item nutrition.
type PlateItem = {name:string;calories:number;protein:number;carbs:number;fat:number;qty:number;micros?:FoodItemMicros};
// The micro keys we accept off a `barcodeMicros` param, matched EXACTLY to the
// backend FoodItemMicros / parseProduct vocabulary. Anything outside this set in
// the (untrusted) JSON param is ignored, and only finite numbers are kept — so a
// corrupt param can never inject a junk key or a NaN into the log payload.
const MICRO_KEYS: readonly (keyof FoodItemMicros)[] = [
    'fiber','sugar','saturatedFat','transFat',
    'sodium','calcium','iron','potassium','magnesium','phosphorus','zinc',
    'vitaminC','vitaminA','vitaminD','vitaminB6','vitaminB12','folate','cholesterol',
];
// Parse the JSON `barcodeMicros` deep-link param into a clean FoodItemMicros bag:
// only known keys with finite numeric values survive. Returns undefined for a
// missing / malformed / empty param, so a macro-only scan threads through with no
// micros (and pre-existing macro-only logging is completely unaffected).
const parseBarcodeMicros = (raw?: string): FoodItemMicros | undefined => {
    if (!raw) return undefined;
    let obj: unknown;
    try { obj = JSON.parse(raw); } catch { return undefined; }
    if (!obj || typeof obj !== 'object') return undefined;
    const src = obj as Record<string, unknown>;
    const out: FoodItemMicros = {};
    for (const key of MICRO_KEYS) {
        const v = src[key as string];
        if (typeof v === 'number' && Number.isFinite(v)) out[key] = v as number;
    }
    return Object.keys(out).length > 0 ? out : undefined;
};
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
        // JSON-encoded per-100g micros/secondary-macros for a scanned product
        // (present-only; omitted when the product reports none). Parsed by
        // parseBarcodeMicros and attached to the prefilled plate item so the
        // scan's micros reach the log payload.
        barcodeMicros?: string;
    }>();
    const [mealType, setMealType] = useState('BREAKFAST');
    const [sq, setSq] = useState('');
    const [plate, setPlate] = useState<PlateItem[]>([]);
    const foodQ = useQuery({ queryKey:['log-food',params.foodId], queryFn:()=>getFoodById(params.foodId!), enabled:!!params.foodId });
    const recipeQ = useQuery({ queryKey:['log-recipe',params.recipeId], queryFn:()=>getRecipe(params.recipeId!), enabled:!!params.recipeId });
    // Only fetch what the UI actually renders (.slice(0,6) below) — was limit:20,
    // an over-fetch of 14 unused rows per keystroke-debounced search.
    const searchQ = useQuery({ queryKey:['meal-search',sq], queryFn:()=>searchFoods({q:sq,limit:8}), enabled:sq.length>2 });
    // Daily macro/calorie targets (same source + query key as the Nutrition tab &
    // Dashboard) so the running-total RINGS actually sweep and the calorie "X of Y"
    // bar appears — instead of rendering three hollow grey circles. Falls back to the
    // app-wide defaults when the profile carries no explicit goal.
    const progressQ = useQuery({ queryKey:['today-progress'], queryFn:getTodayProgress, retry:1 });
    const dailyTargets = useMemo(()=>({
        calories: progressQ.data?.caloriesTarget || 2400,
        protein:  progressQ.data?.proteinTarget  || 180,
        carbs:    progressQ.data?.carbsTarget    || 200,
        fat:      progressQ.data?.fatTarget      || 70,
    }),[progressQ.data]);
    // Per-meal accent, resolved from the Zeitra functional palette via tokens:
    // Breakfast=amber (morning warmth), Lunch=emerald, Dinner=purple (AI/evening),
    // Snack=cyan (progress). No raw hex; off-palette literals (#00D4FF etc.) retired.
    const mealColor = (id:string):string => (
        id==='BREAKFAST' ? colors.accent.amber :
        id==='LUNCH'     ? colors.accent.emerald :
        id==='DINNER'    ? colors.accent.purple :
        id==='SNACK'     ? colors.accent.cyan :
        colors.accent.coral
    );
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

    // Pre-populate from barcode-scanner (Open Food Facts resolved product). Also
    // carries the scanned product's per-100g micros (parsed from the JSON
    // `barcodeMicros` param) onto the plate item so they flow into the log
    // payload; undefined for a macro-only scan.
    React.useEffect(()=>{
        if(params.barcodeName && plate.length===0){
            const micros = parseBarcodeMicros(params.barcodeMicros);
            setPlate([{
                name:     params.barcodeName,
                calories: safeNum(Number(params.barcodeCalories ?? 0)),
                protein:  safeNum(Number(params.barcodeProtein  ?? 0)),
                carbs:    safeNum(Number(params.barcodeCarbs    ?? 0)),
                fat:      safeNum(Number(params.barcodeFat      ?? 0)),
                qty:      1,
                ...(micros ? { micros } : {}),
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
        // Spread the OPTIONAL per-item `micros` bag (present only for a scanned
        // item) AFTER the macros so a scanned product's micros are forwarded to
        // the backend `foodItems` JSON. Per-100g micros are NOT multiplied by qty
        // (they describe composition, not the logged amount); the macros remain
        // qty-scaled exactly as before. Items with no micros send the unchanged
        // macro-only shape.
        const foodItems = plate
            .filter(i=>i.name && isUsableQty(i.qty))
            .map(i=>({name:i.name,quantity:i.qty,calories:safeNum(i.calories)*i.qty,protein:safeNum(i.protein)*i.qty,carbs:safeNum(i.carbs)*i.qty,fat:safeNum(i.fat)*i.qty,...(i.micros ?? {})}));
        if(foodItems.length===0) return;
        logM.mutate({ mealType, foodItems });
    };
    return (
        <View style={[s.container,{backgroundColor:colors.background.primary}]}>
            <StatusBar style="light" />
            <View style={[s.header,{paddingTop:insets.top+16,borderBottomColor:colors.border.default}]}>
                <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Go back" onPress={()=>router.back()} style={[s.iconBtn,{backgroundColor:colors.background.secondary,borderColor:colors.border.default}]}><Ionicons name="arrow-back" size={22} color={colors.text.primary} /></TouchableOpacity>
                <Text style={[typography.h2,{color:colors.text.primary}]}>Add meal</Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                    {/* AI photo analysis — point at a plate, the vision model returns macros + micros. */}
                    <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Analyze a food photo with AI" onPress={()=>router.push('/(modals)/food-photo' as any)} style={[s.iconBtn,{backgroundColor:colors.background.secondary,borderColor:colors.border.default}]}><Ionicons name="camera" size={20} color={colors.accent.coral} /></TouchableOpacity>
                    <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Scan barcode" onPress={()=>router.push('/(modals)/barcode-scanner' as any)} style={[s.iconBtn,{backgroundColor:colors.background.secondary,borderColor:colors.border.default}]}><Ionicons name="barcode-outline" size={20} color={colors.text.primary} /></TouchableOpacity>
                </View>
            </View>
            <ScrollView contentContainerStyle={{paddingBottom:140}} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <Animated.View entering={FadeInDown.duration(360).springify()}>
                    <Text style={[typography.overline,{color:colors.text.secondary,paddingHorizontal:20,marginTop:24,marginBottom:12}]}>SELECT MEAL TYPE</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{paddingHorizontal:20,gap:12,marginBottom:24}}>
                        {MT.map((mt)=>{
                            const selected = mealType===mt.id;
                            const mtColor = mealColor(mt.id);
                            return (
                            <Pressable key={mt.id} accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={mt.label} style={({pressed})=>[s.mealCard,{borderColor:colors.border.default},selected&&{borderColor:mtColor,borderWidth:2},pressed&&{transform:[{scale:0.96}]}]} onPress={()=>setMealType(mt.id)}>
                                <Image source={mt.img} style={StyleSheet.absoluteFillObject} contentFit="cover" cachePolicy="memory-disk" transition={200} />
                                <LinearGradient colors={['rgba(10,12,18,0.05)','rgba(10,12,18,0.82)']} style={StyleSheet.absoluteFillObject} />
                                {selected&&<View style={[s.mealChk,{backgroundColor:mtColor}]}><Ionicons name="checkmark" size={13} color={colors.text.inverse} /></View>}
                                <Text style={[typography.overline,{color:selected?mtColor:colors.text.primary,fontSize:11,letterSpacing:1,zIndex:1}]}>{mt.label.toUpperCase()}</Text>
                            </Pressable>
                            );
                        })}
                    </ScrollView>
                </Animated.View>
                <Animated.View entering={FadeInDown.delay(60).duration(360).springify()}>
                    <Text style={[typography.overline,{color:colors.text.secondary,paddingHorizontal:20,marginBottom:12}]}>ADD FOOD</Text>
                    <GlassCard radius={16} style={{ marginHorizontal:20, marginBottom:12 }}>
                        <View style={s.searchBox}>
                            <View style={[s.searchIconChip,{backgroundColor:colors.background.tertiary}]}>
                                <Ionicons name="search" size={16} color={colors.accent.coral} />
                            </View>
                            <TextInput style={[s.searchIn,{color:colors.text.primary,fontFamily:typography.body.fontFamily}]} placeholder="Search foods to add..." placeholderTextColor={colors.text.tertiary} value={sq} onChangeText={setSq} returnKeyType="search" autoCorrect={false} />
                            {sq.length>0?<TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Clear" onPress={()=>setSq('')}><Ionicons name="close-circle" size={20} color={colors.text.tertiary} /></TouchableOpacity>:null}
                        </View>
                    </GlassCard>
                </Animated.View>
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
                        {(searchQ.data as FoodItem[]).slice(0,6).map((item,ri)=>(
                            <Animated.View key={item.id} entering={FadeInDown.delay(ri*40).duration(280)}>
                                <Pressable accessibilityRole="button" accessibilityLabel={`Add ${item.name}`} style={({pressed})=>[s.searchResult,{backgroundColor:colors.background.secondary,borderColor:colors.border.default},pressed&&{transform:[{scale:0.96}]}]} onPress={()=>addToPlate(item)}>
                                    <View style={{flex:1,paddingRight:12}}>
                                        <Text style={[typography.subhead,{color:colors.text.primary}]} numberOfLines={1}>{item.name}</Text>
                                        <Text style={[typography.caption,{color:colors.text.secondary,marginTop:2}]}>{Math.round(item.calories)} kcal per serving</Text>
                                    </View>
                                    <View style={[s.addChip,{backgroundColor:colors.accent.coral}]}>
                                        <Ionicons name="add" size={20} color={colors.text.inverse} />
                                    </View>
                                </Pressable>
                            </Animated.View>
                        ))}
                    </View>
                ):null}
                {plate.length>0?(
                    <Animated.View entering={FadeIn.duration(280)} style={{paddingHorizontal:20}}>
                        <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
                            <Text style={[typography.h3,{color:colors.text.primary}]}>Your Plate</Text>
                            <View style={[s.countPill,{backgroundColor:colors.background.tertiary,borderColor:colors.border.default}]}>
                                <Text style={[typography.captionMedium,{color:colors.text.secondary}]}>{plate.length} item{plate.length>1?'s':''}</Text>
                            </View>
                        </View>
                        {plate.map((item,idx)=>(
                            <Animated.View key={idx} entering={FadeInDown.delay(idx*40).duration(300).springify()}>
                                <View style={[s.plateRow,{backgroundColor:colors.background.secondary,borderColor:colors.border.default}]}>
                                    <View style={[s.plateAccent,{backgroundColor:mealColor(mealType)}]} />
                                    <View style={{flex:1,paddingLeft:14}}>
                                        <Text style={[typography.subhead,{color:colors.text.primary}]} numberOfLines={1}>{item.name}</Text>
                                        {/* Per-item kcal is the row's primary datum: bump the NUMBER to statTiny in the
                                            meal accent (tabular feel) and keep the unit + protein as quiet caption. */}
                                        <Text style={[typography.caption,{color:colors.text.secondary,marginTop:2}]} numberOfLines={1}>
                                            <Text style={[typography.statTiny,{color:mealColor(mealType)}]}>{Math.round(safeNum(item.calories)*qtyForMath(item.qty))}</Text>
                                            <Text style={[typography.captionMedium,{color:colors.text.secondary}]}> kcal</Text>
                                            {'  •  P:'}{Math.round(safeNum(item.protein)*qtyForMath(item.qty))}g
                                        </Text>
                                    </View>
                                    <View style={[s.qtyRow,{backgroundColor:colors.background.tertiary,borderColor:colors.border.default}]}>
                                        <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Decrease" onPress={()=>setPlate(plate.map((p,i)=>i===idx?{...p,qty:Math.max(QTY_FLOOR,safeQty(p.qty)-0.5)}:p))}><Ionicons name="remove" size={18} color={colors.text.secondary} /></TouchableOpacity>
                                        <Text style={[typography.statTiny,{color:colors.text.primary,marginHorizontal:10,minWidth:30,textAlign:'center'}]}>{safeQty(item.qty)}x</Text>
                                        <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Increase" onPress={()=>setPlate(plate.map((p,i)=>i===idx?{...p,qty:safeQty(p.qty)+0.5}:p))}><Ionicons name="add" size={18} color={colors.accent.coral} /></TouchableOpacity>
                                    </View>
                                    <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Delete" style={{paddingLeft:10}} onPress={()=>setPlate(plate.filter((_,i)=>i!==idx))}><Ionicons name="trash-outline" size={18} color={colors.text.tertiary} /></TouchableOpacity>
                                </View>
                            </Animated.View>
                        ))}
                        <GlassCard radius={20} style={{ marginTop:14, marginBottom:24, padding:18 }}>
                            <Text style={[typography.overline,{color:colors.text.tertiary,marginBottom:10}]}>RUNNING TOTAL</Text>
                            <MealMacroSummary totals={totals} targets={dailyTargets} />
                        </GlassCard>
                    </Animated.View>
                ):null}
                {plate.length===0&&sq.length===0?(
                    <EmptyState
                        icon="restaurant-outline"
                        title="Build your plate"
                        subtitle="Search for a food above to start adding items, then log them all at once."
                    />
                ):null}
            </ScrollView>
            <LinearGradient colors={['rgba(10,12,18,0)','rgba(10,12,18,0.96)']} style={[s.footer,{paddingBottom:Math.max(insets.bottom,20)}]} pointerEvents="box-none">
                <CtaButton
                    label="Track meal"
                    icon="checkmark-circle"
                    size="lg"
                    accessibilityLabel="Track meal"
                    loading={logM.isPending}
                    disabled={plate.length===0}
                    onPress={handleLog}
                    style={s.logBtnWrap}
                />
            </LinearGradient>
        </View>
    );
}
const s = StyleSheet.create({
    container:{flex:1}, header:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingHorizontal:20,paddingBottom:16,borderBottomWidth:1},
    iconBtn:{width:40,height:40,borderRadius:12,borderWidth:1,alignItems:'center',justifyContent:'center'},
    mealCard:{width:88,height:96,borderRadius:16,overflow:'hidden',justifyContent:'flex-end',padding:10,borderWidth:1,borderColor:'transparent'},
    mealChk:{position:'absolute',top:6,right:6,width:22,height:22,borderRadius:11,alignItems:'center',justifyContent:'center'},
    searchBox:{flexDirection:'row',alignItems:'center',paddingLeft:10,paddingRight:14,height:54,gap:10},
    searchIconChip:{width:34,height:34,borderRadius:10,alignItems:'center',justifyContent:'center'},
    searchIn:{flex:1,fontSize:15},
    searchResult:{flexDirection:'row',alignItems:'center',padding:14,marginBottom:8,borderRadius:14,borderWidth:1},
    addChip:{width:34,height:34,borderRadius:17,alignItems:'center',justifyContent:'center'},
    countPill:{paddingHorizontal:10,paddingVertical:4,borderRadius:10,borderWidth:1},
    plateRow:{flexDirection:'row',alignItems:'center',padding:12,marginBottom:10,borderRadius:16,borderWidth:1,overflow:'hidden'},
    plateAccent:{width:4,alignSelf:'stretch',borderRadius:2},
    qtyRow:{flexDirection:'row',alignItems:'center',paddingHorizontal:8,paddingVertical:6,borderRadius:12,borderWidth:1},
    footer:{position:'absolute',bottom:0,left:0,right:0,paddingHorizontal:20,paddingTop:28},
    logBtnWrap:{height:60,borderRadius:30},
});
