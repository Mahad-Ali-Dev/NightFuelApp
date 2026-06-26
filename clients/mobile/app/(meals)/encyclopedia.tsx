import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert, FlatList, Modal, Platform } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { searchFoods, logMeal, FoodItem } from '@/api/meals';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { shadows } from '@/theme/shadows';
import { borderRadius } from '@/theme/spacing';
import { Skeleton, EmptyState, CtaButton, GlassCard } from '@/components/ui';
import { invalidateMealAndProgress } from '@/utils/invalidateMealAndProgress';
import { getPresentMicronutrients, formatMicroAmount } from '@/lib/micronutrients';
import { CountUp, MacroRing, StatPill, FoodCard } from '@/components/EncyclopediaCards';
// Bundled Aurora dark-glass placeholder so the browse tiles never depend on an
// external host (no 404 / rate-limit). '@/*' resolves to ./src, so the asset is
// required by relative path (same pattern as the exercise fallbacks). The
// per-category color bar + label differentiate the tiles visually.
const FOOD_FALLBACK = require('../../assets/images/food-fallback.png');
// Per-category icon + tint differentiate the browse tiles at a glance. Every
// tint is a real Zeitra token (colors.accent.*) so NOTHING hardcodes off-brand
// — the tiles paint only colors that exist elsewhere in the app. Built inside
// the component (useMemo) because module constants can't read useTheme().
type FoodCat = { id: string; label: string; key: string; color: string; icon: keyof typeof Ionicons.glyphMap; img: number };
// Token → rgba helper so overlays/grabbers derive their alpha from a theme color
// instead of a raw rgba(...) literal (keeps the 'never raw hex' rule and lets
// dark/light stay consistent). Accepts #RGB / #RRGGBB.
const withAlpha = (hex: string, a: number): string => {
    let h = hex.replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const r = parseInt(h.slice(0, 2), 16) || 0;
    const g = parseInt(h.slice(2, 4), 16) || 0;
    const b = parseInt(h.slice(4, 6), 16) || 0;
    return `rgba(${r},${g},${b},${a})`;
};
export default function FoodEncyclopediaScreen() {
    const { colors, typography } = useTheme();
    const FOOD_CATS = useMemo<FoodCat[]>(() => [
        { id:'fruits', label:'Fruits', key:'fruit', color:colors.accent.amber, icon:'nutrition-outline', img:FOOD_FALLBACK },
        { id:'vegs', label:'Vegetables', key:'vegetable', color:colors.accent.emerald, icon:'leaf-outline', img:FOOD_FALLBACK },
        { id:'protein', label:'Proteins', key:'meat', color:colors.accent.red, icon:'flame-outline', img:FOOD_FALLBACK },
        { id:'dairy', label:'Dairy', key:'dairy', color:colors.accent.cyan, icon:'water-outline', img:FOOD_FALLBACK },
        { id:'grains', label:'Grains', key:'grain', color:colors.accent.purple, icon:'flower-outline', img:FOOD_FALLBACK },
        { id:'snacks', label:'Snacks', key:'snack', color:colors.accent.coral, icon:'fast-food-outline', img:FOOD_FALLBACK },
    ], [colors]);
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
        mutationFn:(item:FoodItem)=>{ const q=Math.max(parseFloat(qty)||0,0.01); return logMeal({mealType,foodItems:[{foodId:item.id,name:item.name,quantity:q,calories:item.calories*q,protein:item.protein*q,carbs:item.carbs*q,fat:item.fat*q}]}); },
        // Route success invalidation through the shared helper so BOTH calorie
        // rings refresh: the Nutrition tab's ['daily-progress'] AND the dashboard's
        // ['today-progress'] (plus the ['meal-logs'] list) — see
        // invalidateMealAndProgress. Logging from the encyclopedia previously
        // invalidated ONLY ['meal-logs'], leaving NEITHER ring fresh (the worst
        // split-brain case).
        onSuccess:()=>{ invalidateMealAndProgress(qc); setServingModal(null); router.push('/(tabs)/nutrition' as any); },
        onError:(err:any)=>Alert.alert('Error', err?.response?.data?.message??'Failed to log meal.'),
    });
    const results = (searchR.data??[]) as FoodItem[];
    const showBrowse = query.length<3&&!selGroup;
    const qn = parseFloat(qty||'0');
    // Tokenized modal scrim (OLED ink at 0.8) + grabber (primary text at low
    // opacity) — both derived from theme colors instead of raw rgba() literals.
    const scrim = withAlpha(colors.text.inverse, 0.8);
    const grabberColor = withAlpha(colors.text.primary, 0.18);
    const renderFood = useCallback(({item,index}:{item:FoodItem;index:number})=>(
        <Animated.View entering={FadeInDown.delay(Math.min(index,12)*40).springify().damping(18).mass(0.7)}>
            <FoodCard item={item} onPress={()=>setServingModal(item)} />
        </Animated.View>
    ),[]);
    return (
        <View style={[s.container,{backgroundColor:colors.background.primary}]}>
            <StatusBar style="light" />
            <View style={[s.header,{paddingTop:insets.top+16,borderBottomColor:colors.border.default}]}>
                <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Go back" onPress={()=>router.back()}><Ionicons name="arrow-back" size={24} color={colors.text.primary} /></TouchableOpacity>
                <View style={[s.searchBox,{backgroundColor:colors.background.secondary,borderColor:colors.border.default}]}>
                    <Ionicons name="search" size={16} color={colors.text.tertiary} />
                    <TextInput style={[s.searchIn,{color:colors.text.primary}]} placeholder="Search food encyclopedia..." placeholderTextColor={colors.text.tertiary} value={query} onChangeText={setQuery} />
                    {query.length>0&&<TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Clear search" onPress={()=>setQuery('')}><Ionicons name="close-circle" size={16} color={colors.text.tertiary} /></TouchableOpacity>}
                </View>
                <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Scan barcode" onPress={()=>router.push('/(modals)/barcode-scanner' as any)}><Ionicons name="barcode-outline" size={24} color={colors.accent.coral} /></TouchableOpacity>
            </View>
            {showBrowse ? (
                <ScrollView contentContainerStyle={{padding:20,paddingBottom:insets.bottom+24}} showsVerticalScrollIndicator={false}>
                    <Animated.View entering={FadeInDown.delay(40).springify().damping(18).mass(0.7)}>
                        <Text style={[typography.overline,{color:colors.accent.coral,marginBottom:4}]}>FOOD ENCYCLOPEDIA</Text>
                        <Text style={[typography.h1,{color:colors.text.primary}]}>Browse by Category</Text>
                        <Text style={[typography.body,{color:colors.text.secondary,marginBottom:20,marginTop:2}]}>Explore nutrition facts, macros and micronutrients across the catalog.</Text>
                    </Animated.View>
                    <View style={s.catGrid}>
                        {FOOD_CATS.map((cat,i)=>(
                            <Animated.View key={cat.id} entering={FadeInDown.delay(80+i*50).springify().damping(18).mass(0.7)} style={s.catCellWrap}>
                                <TouchableOpacity accessibilityRole="button" accessibilityLabel={cat.label} style={[s.catCard,{backgroundColor:colors.background.secondary,borderColor:withAlpha(cat.color,0.32)},shadows.md]} activeOpacity={0.85} onPress={()=>setSelGroup(cat.key)}>
                                    <Image source={cat.img} style={StyleSheet.absoluteFillObject} contentFit="cover" cachePolicy="memory-disk" transition={200} />
                                    {/* Base darkening veil (tokenized OLED ink, not a raw rgba). */}
                                    <LinearGradient colors={[withAlpha(colors.background.primary,0.45),withAlpha(colors.background.primary,0.94)]} style={StyleSheet.absoluteFillObject} />
                                    {/* Per-category tinted glow from the top-left corner — gives each
                                        tile its own hue so the six read as distinct categories at a
                                        glance (was a single neutral gradient on every tile). */}
                                    <LinearGradient colors={[withAlpha(cat.color,0.42),withAlpha(cat.color,0.08),'transparent']} start={{x:0,y:0}} end={{x:1,y:1}} locations={[0,0.45,1]} style={StyleSheet.absoluteFillObject} />
                                    <View style={[s.catIcon,{backgroundColor:withAlpha(cat.color,0.22),borderColor:withAlpha(cat.color,0.45)}]}>
                                        <Ionicons name={cat.icon} size={26} color={cat.color} />
                                    </View>
                                    <View style={s.catFooter}>
                                        <View style={[s.catBar,{backgroundColor:cat.color}]} />
                                        <Text style={[typography.subhead,{color:colors.text.primary,fontWeight:'bold',fontSize:14}]}>{cat.label}</Text>
                                    </View>
                                </TouchableOpacity>
                            </Animated.View>
                        ))}
                    </View>
                </ScrollView>
            ) : (
                <View style={{flex:1}}>
                    {selGroup&&(
                        <View style={[s.filterBar,{borderBottomColor:colors.border.default}]}>
                            <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Clear ${FOOD_CATS.find(c=>c.key===selGroup)?.label||selGroup} filter`} style={[s.filterChip,{backgroundColor:colors.accent.coral}]} activeOpacity={0.85} onPress={()=>setSelGroup(null)}>
                                <Text style={[typography.caption,{color:colors.text.inverse,fontWeight:'bold'}]}>{FOOD_CATS.find(c=>c.key===selGroup)?.label||selGroup}</Text>
                                <Ionicons name="close" size={13} color={colors.text.inverse} style={{marginLeft:5}} />
                            </TouchableOpacity>
                            {!searchR.isLoading&&!searchR.isError&&results.length>0&&(
                                <Text style={[typography.caption,{color:colors.text.tertiary,marginLeft:'auto'}]}>{results.length} foods</Text>
                            )}
                        </View>
                    )}
                    {searchR.isLoading?(
                        <View style={{padding:20}}>
                            {[0,1,2,3,4].map((i)=>(
                                <Skeleton key={i} width="100%" height={92} radius={borderRadius.xl} style={{marginBottom:12}} />
                            ))}
                        </View>
                    ):
                    searchR.isError?(
                        <EmptyState
                            icon="cloud-offline-outline"
                            title="Couldn't load foods"
                            subtitle="Something went wrong searching the food encyclopedia. Check your connection and try again."
                            actionLabel="Try Again"
                            onAction={()=>searchR.refetch()}
                        />
                    ):
                    results.length===0?(
                        <EmptyState
                            icon="nutrition-outline"
                            title={query.length>2?'No results found':'Start your search'}
                            subtitle={query.length>2?'Nothing matched that search. Try a different food name or browse by category.':'Type a food name above or pick a category to explore nutrition facts.'}
                        />
                    ):(
                        <FlatList data={results} keyExtractor={(item)=>item.id} contentContainerStyle={{padding:20,paddingBottom:insets.bottom+24}}
                            renderItem={renderFood}
                            ItemSeparatorComponent={()=><View style={{height:12}} />}
                            initialNumToRender={10}
                            maxToRenderPerBatch={10}
                            windowSize={7}
                            removeClippedSubviews={Platform.OS==='android'}
                        />
                    )}
                </View>
            )}
            <Modal visible={!!servingModal} animationType="slide" transparent>
                <View style={[s.modalOvr,{backgroundColor:scrim}]}>
                    <View style={[s.modalCnt,{backgroundColor:colors.background.primary}]}>
                        <View style={[s.grabber,{backgroundColor:grabberColor}]} />
                        <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
                            <Text style={[typography.h3,{color:colors.text.primary}]}>Add to Plate</Text>
                            <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Close" onPress={()=>setServingModal(null)} style={[s.modalClose,{backgroundColor:colors.background.secondary,borderColor:colors.border.default}]}><Ionicons name="close" size={20} color={colors.text.primary} /></TouchableOpacity>
                        </View>
                        {servingModal&&(
                            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{paddingBottom:insets.bottom+24}}>
                                <Text style={[typography.h1,{color:colors.text.primary,marginBottom:4}]}>{servingModal.name}</Text>
                                <Text style={[typography.body,{color:colors.text.secondary,marginBottom:20}]}>{servingModal.foodGroup||'General'} • {servingModal.servingSize} per serving</Text>
                                {/* Food image + REQUIRED CC-BY-SA attribution. Image-bearing rows
                                    come from Open Food Facts (seed:off populates imageUrl); the
                                    photos are CC-BY-SA, whose license requires showing the credit
                                    wherever the image renders. FooDB rows (nutrition-only) carry no
                                    imageUrl — rather than a confusing blank, we show a clearly
                                    branded "no photo" placeholder so the layout reads intentionally. */}
                                {servingModal.imageUrl ? (
                                    <View style={s.foodImgWrap} accessible accessibilityRole="image" accessibilityLabel={`Photo of ${servingModal.name}`}>
                                        <Image
                                            source={{ uri: servingModal.imageUrl }}
                                            style={s.foodImg}
                                            contentFit="cover"
                                            cachePolicy="memory-disk"
                                            transition={200}
                                        />
                                        {servingModal.imageAttribution ? (
                                            <Text style={[typography.caption,{color:colors.text.tertiary,marginTop:6,fontSize:11}]}>
                                                {servingModal.imageAttribution}
                                            </Text>
                                        ) : null}
                                    </View>
                                ) : (
                                    <View
                                        style={[s.foodImgWrap,s.foodImgPlaceholder,{backgroundColor:colors.background.secondary,borderColor:withAlpha(colors.accent.coral,0.18)}]}
                                        accessible
                                        accessibilityLabel={`No photo available for ${servingModal.name}`}
                                    >
                                        <View style={[s.foodPlaceholderIcon,{backgroundColor:withAlpha(colors.accent.coral,0.12),borderColor:withAlpha(colors.accent.coral,0.32)}]}>
                                            <Ionicons name="nutrition-outline" size={26} color={colors.accent.coral} />
                                        </View>
                                        <Text style={[typography.caption,{color:colors.text.tertiary,marginTop:8}]}>No photo for this food</Text>
                                    </View>
                                )}
                                {/* HERO nutrition card: big condensed count-up calories for the
                                    chosen serving qty, plus three macro rings (protein=lime,
                                    carbs=cyan, fat=amber) with count-up gram centers. Recomputes
                                    live as qty / serving changes. */}
                                <GlassCard radius={20} style={s.heroCard}>
                                    <View style={s.heroInner}>
                                        <View style={s.heroNumberRow}>
                                            <CountUp value={Math.round(servingModal.calories*qn)} style={[typography.statLarge,s.heroNumber,{color:colors.accent.coral}]} />
                                            {/* Condensed unit so the kcal label shares the athletic Barlow
                                                Condensed family of the 48px numeral (was statTiny = Barlow,
                                                a different typeface, which loosened the hero lockup). */}
                                            <Text style={[typography.statSmall,{fontSize:17,lineHeight:22,color:colors.text.tertiary,marginBottom:10,marginLeft:6}]}>kcal</Text>
                                        </View>
                                        <Text style={[typography.caption,{color:colors.text.secondary,marginBottom:18}]}>for {qty||'0'} serving{qn===1?'':'s'}</Text>
                                        <View style={s.ringsRow}>
                                            <MacroRing label="Protein" value={Math.round(servingModal.protein*qn)} color={colors.accent.coral} cap={50} />
                                            <MacroRing label="Carbs" value={Math.round(servingModal.carbs*qn)} color={colors.accent.cyan} cap={80} />
                                            <MacroRing label="Fat" value={Math.round(servingModal.fat*qn)} color={colors.accent.amber} cap={40} />
                                        </View>
                                    </View>
                                </GlassCard>
                                <Text style={[typography.overline,{color:colors.text.secondary,marginTop:24,marginBottom:8}]}>HOW MANY SERVINGS?</Text>
                                <TextInput style={[s.numInput,{color:colors.text.primary,backgroundColor:colors.background.secondary,borderColor:colors.border.default}]} keyboardType="numeric" value={qty} onChangeText={setQty} />
                                <Text style={[typography.overline,{color:colors.text.secondary,marginTop:20,marginBottom:8}]}>MEAL TYPE</Text>
                                <View style={{flexDirection:'row',flexWrap:'wrap',gap:10,marginBottom:24}}>
                                    {['BREAKFAST','LUNCH','DINNER','SNACK'].map((t)=>{
                                        const active=mealType===t;
                                        return (
                                        <TouchableOpacity key={t} accessibilityRole="button" accessibilityState={{ selected: active }} accessibilityLabel={t} style={[s.typeBtn,{backgroundColor:active?colors.accent.coral:colors.background.secondary,borderColor:active?colors.accent.coral:colors.border.default}]} onPress={()=>setMealType(t)}>
                                            <Text style={[typography.caption,{color:active?colors.text.inverse:colors.text.secondary,fontWeight:'bold'}]}>{t}</Text>
                                        </TouchableOpacity>
                                        );
                                    })}
                                </View>
                                <Text style={[typography.overline,{color:colors.text.secondary,marginBottom:10}]}>NUTRITION FOR THIS SERVING</Text>
                                <View style={{gap:10}}>
                                    {[{l:'Protein',v:Math.round(servingModal.protein*qn),u:'g',c:colors.accent.coral,i:'barbell-outline' as const},{l:'Carbs',v:Math.round(servingModal.carbs*qn),u:'g',c:colors.accent.cyan,i:'leaf-outline' as const},{l:'Fat',v:Math.round(servingModal.fat*qn),u:'g',c:colors.accent.amber,i:'water-outline' as const}].map((m)=>(
                                        <StatPill key={m.l} icon={m.i} label={m.l} value={m.v} unit={m.u} color={m.c} />
                                    ))}
                                    {/* Fiber + sugar: secondary macros only some enriched rows
                                        carry. Scaled by serving qty like the primary macros, and
                                        shown only when present (legacy rows omit them). */}
                                    {servingModal.fiber != null ? (
                                        <StatPill icon="nutrition-outline" label="Fiber" value={Math.round(servingModal.fiber*qn)} unit="g" color={colors.accent.emerald} />
                                    ) : null}
                                    {servingModal.sugar != null ? (
                                        <StatPill icon="ice-cream-outline" label="Sugar" value={Math.round(servingModal.sugar*qn)} unit="g" color={colors.accent.purple} />
                                    ) : null}
                                </View>
                                {/* Micronutrients: render each PRESENT (non-null) micro as a
                                    labeled row, with the unit derived from the field name
                                    (Mg→mg, Mcg→mcg). Per-100g amounts shown as-is (not
                                    serving-scaled — they're reference values). Foods with no
                                    micros (legacy FooDB rows) render nothing extra. */}
                                {(() => {
                                    const micros = getPresentMicronutrients(servingModal);
                                    if (micros.length === 0) return null;
                                    return (
                                        <GlassCard radius={16} style={s.microCard} testID="micronutrients-card">
                                            <View style={s.sumInner}>
                                                <Text style={[typography.subhead,{color:colors.text.primary,fontWeight:'bold',marginBottom:4}]}>Micronutrients</Text>
                                                <Text style={[typography.caption,{color:colors.text.tertiary,marginBottom:12}]}>Per 100g</Text>
                                                {micros.map((m,idx)=>(
                                                    <View key={m.key} style={[s.microRow, idx>0 && {borderTopColor:colors.border.default,borderTopWidth:StyleSheet.hairlineWidth}]}>
                                                        <Text style={[typography.body,{color:colors.text.secondary}]}>{m.label}</Text>
                                                        <Text style={[typography.statTiny,{color:colors.text.primary}]}>{formatMicroAmount(m,m.value)}</Text>
                                                    </View>
                                                ))}
                                            </View>
                                        </GlassCard>
                                    );
                                })()}
                                <CtaButton
                                    label="TRACK MEAL"
                                    size="lg"
                                    accessibilityLabel="Track meal"
                                    loading={logM.isPending}
                                    onPress={()=>logM.mutate(servingModal)}
                                    style={[s.logBtnWrap,{marginTop:24}]}
                                />
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
    catCellWrap:{width:'47%'},
    catCard:{width:'100%',height:120,borderRadius:20,borderWidth:1,overflow:'hidden',justifyContent:'space-between',padding:12},
    catIcon:{width:48,height:48,borderRadius:14,borderWidth:1,alignItems:'center',justifyContent:'center',alignSelf:'flex-start'},
    catFooter:{flexDirection:'row',alignItems:'center',gap:8},
    catBar:{width:3,height:18,borderRadius:2},
    filterBar:{paddingHorizontal:20,paddingVertical:12,borderBottomWidth:1,flexDirection:'row',alignItems:'center'},
    filterChip:{flexDirection:'row',alignItems:'center',paddingHorizontal:14,paddingVertical:8,borderRadius:20},
    modalOvr:{flex:1,justifyContent:'flex-end'}, modalCnt:{height:'88%',padding:24,paddingTop:12,borderTopLeftRadius:28,borderTopRightRadius:28},
    grabber:{alignSelf:'center',width:40,height:4,borderRadius:2,marginBottom:14},
    modalClose:{width:36,height:36,borderRadius:18,borderWidth:1,alignItems:'center',justifyContent:'center'},
    numInput:{height:56,paddingHorizontal:16,fontSize:20,fontWeight:'bold',borderRadius:14,borderWidth:1},
    typeBtn:{flex:1,minWidth:'45%',height:44,borderRadius:22,borderWidth:1,alignItems:'center',justifyContent:'center'},
    heroCard:{marginBottom:4}, heroInner:{padding:20},
    heroNumberRow:{flexDirection:'row',alignItems:'flex-end'},
    heroNumber:{padding:0,margin:0,includeFontPadding:false as any,textAlignVertical:'bottom' as any},
    ringsRow:{flexDirection:'row',justifyContent:'space-between',marginTop:4},
    microCard:{marginTop:16}, sumInner:{padding:20},
    foodImgWrap:{marginBottom:20},
    foodImg:{width:'100%',height:180,borderRadius:16},
    foodImgPlaceholder:{height:180,borderRadius:16,borderWidth:1,alignItems:'center',justifyContent:'center'},
    foodPlaceholderIcon:{width:56,height:56,borderRadius:16,borderWidth:1,alignItems:'center',justifyContent:'center'},
    microRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingVertical:10},
    logBtnWrap:{height:60,borderRadius:30},
});
