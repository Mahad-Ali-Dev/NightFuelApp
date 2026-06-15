import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert, FlatList, Modal, Platform } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { searchFoods, logMeal, FoodItem } from '@/api/meals';
import { LinearGradient } from 'expo-linear-gradient';
import { withAlpha } from '@/theme/utils';
import { shadows } from '@/theme/shadows';
import { borderRadius } from '@/theme/spacing';
import { Skeleton, EmptyState } from '@/components/ui';
// Bundled Aurora dark-glass placeholder so the browse tiles never depend on an
// external host (no 404 / rate-limit). '@/*' resolves to ./src, so the asset is
// required by relative path (same pattern as the exercise fallbacks). The
// per-category color bar + label differentiate the tiles visually.
const FOOD_FALLBACK = require('../../assets/images/food-fallback.png');
const FOOD_CATS = [
    { id:'fruits', label:'Fruits', key:'fruit', color:'#F59E0B', img:FOOD_FALLBACK },
    { id:'vegs', label:'Vegetables', key:'vegetable', color:'#2ECC71', img:FOOD_FALLBACK },
    { id:'protein', label:'Proteins', key:'meat', color:'#EF4444', img:FOOD_FALLBACK },
    { id:'dairy', label:'Dairy', key:'dairy', color:'#00D4FF', img:FOOD_FALLBACK },
    { id:'grains', label:'Grains', key:'grain', color:'#A855F7', img:FOOD_FALLBACK },
    { id:'snacks', label:'Snacks', key:'snack', color:'#FF6B35', img:FOOD_FALLBACK },
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
        mutationFn:(item:FoodItem)=>{ const q=Math.max(parseFloat(qty)||0,0.01); return logMeal({mealType,foodItems:[{foodId:item.id,name:item.name,quantity:q,calories:item.calories*q,protein:item.protein*q,carbs:item.carbs*q,fat:item.fat*q}]}); },
        onSuccess:()=>{ qc.invalidateQueries({queryKey:['meal-logs']}); setServingModal(null); router.push('/(tabs)/nutrition' as any); },
        onError:(err:any)=>Alert.alert('Error', err?.response?.data?.message??'Failed to log meal.'),
    });
    const results = (searchR.data??[]) as FoodItem[];
    const showBrowse = query.length<3&&!selGroup;
    const renderFood = useCallback(({item}:{item:FoodItem})=>(
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={item.name} style={[s.foodCard,{backgroundColor:colors.background.secondary,borderColor:colors.border.default}]} activeOpacity={0.85} onPress={()=>setServingModal(item)}>
            <View style={{flex:1}}>
                <Text style={[typography.subhead,{color:colors.text.primary,fontWeight:'bold'}]}>{item.name}</Text>
                <Text style={[typography.caption,{color:colors.text.secondary}]}>{item.foodGroup||'General'} • {item.servingSize}</Text>
                <View style={{flexDirection:'row',gap:12,marginTop:6}}>
                    {[{l:'P',v:item.protein,c:colors.accent.emerald},{l:'C',v:item.carbs,c:colors.accent.cyan},{l:'F',v:item.fat,c:colors.accent.amber}].map((m)=>(
                        <View key={m.l} style={{flexDirection:'row',alignItems:'center'}}>
                            <View style={{width:6,height:6,borderRadius:3,backgroundColor:m.c,marginRight:4}} />
                            <Text style={[typography.caption,{color:colors.text.secondary,fontSize:10}]}>{m.l}: {Math.round(m.v)}g</Text>
                        </View>
                    ))}
                </View>
            </View>
            <View style={{alignItems:'flex-end'}}>
                <Text style={[typography.statSmall,{color:colors.accent.coral,fontSize:20,lineHeight:26}]}>{Math.round(item.calories)}</Text>
                <Text style={[typography.overline,{color:colors.text.secondary,fontSize:9,letterSpacing:1}]}>KCAL</Text>
            </View>
        </TouchableOpacity>
    ),[colors,typography]);
    return (
        <View style={[s.container,{backgroundColor:colors.background.primary}]}>
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
                <ScrollView contentContainerStyle={{padding:20,paddingBottom:100}} showsVerticalScrollIndicator={false}>
                    <Text style={[typography.h2,{color:colors.text.primary,marginBottom:16}]}>Browse by Category</Text>
                    <View style={s.catGrid}>
                        {FOOD_CATS.map((cat)=>(
                            <TouchableOpacity key={cat.id} accessibilityRole="button" accessibilityLabel={cat.label} style={[s.catCard,{borderColor:colors.border.default},shadows.md]} activeOpacity={0.85} onPress={()=>setSelGroup(cat.key)}>
                                <Image source={cat.img} style={StyleSheet.absoluteFillObject} contentFit="cover" cachePolicy="memory-disk" transition={200} />
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
                            <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Clear ${FOOD_CATS.find(c=>c.key===selGroup)?.label||selGroup} filter`} style={[s.filterChip,{backgroundColor:colors.accent.coral,borderColor:colors.accent.coral}]} activeOpacity={0.85} onPress={()=>setSelGroup(null)}>
                                <Ionicons name="close" size={12} color="#FFF" style={{marginRight:4}} />
                                <Text style={[typography.caption,{color:'#FFF',fontWeight:'bold'}]}>{FOOD_CATS.find(c=>c.key===selGroup)?.label||selGroup}</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                    {searchR.isLoading?(
                        <View style={{padding:20}}>
                            {[0,1,2,3,4].map((i)=>(
                                <Skeleton key={i} width="100%" height={92} radius={borderRadius.lg} style={{marginBottom:12}} />
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
                        <FlatList data={results} keyExtractor={(item)=>item.id} contentContainerStyle={{padding:20,paddingBottom:100}}
                            renderItem={renderFood}
                            initialNumToRender={10}
                            maxToRenderPerBatch={10}
                            windowSize={7}
                            removeClippedSubviews={Platform.OS==='android'}
                        />
                    )}
                </View>
            )}
            <Modal visible={!!servingModal} animationType="slide" transparent>
                <View style={[s.modalOvr,{backgroundColor:'rgba(0,0,0,0.8)'}]}>
                    <View style={[s.modalCnt,{backgroundColor:colors.background.primary}]}>
                        <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
                            <Text style={[typography.h3,{color:colors.text.primary}]}>Add to Plate</Text>
                            <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Close" onPress={()=>setServingModal(null)} style={[s.modalClose,{backgroundColor:colors.background.secondary,borderColor:colors.border.default}]}><Ionicons name="close" size={20} color={colors.text.primary} /></TouchableOpacity>
                        </View>
                        {servingModal&&(
                            <ScrollView>
                                <Text style={[typography.h1,{color:colors.text.primary,marginBottom:4}]}>{servingModal.name}</Text>
                                <Text style={[typography.body,{color:colors.text.secondary,marginBottom:20}]}>{servingModal.servingSize} per serving</Text>
                                <Text style={[typography.overline,{color:colors.text.secondary,marginBottom:8}]}>HOW MANY SERVINGS?</Text>
                                <TextInput style={[s.numInput,{color:colors.text.primary,backgroundColor:colors.background.secondary,borderColor:colors.border.default}]} keyboardType="numeric" value={qty} onChangeText={setQty} />
                                <Text style={[typography.overline,{color:colors.text.secondary,marginTop:20,marginBottom:8}]}>MEAL TYPE</Text>
                                <View style={{flexDirection:'row',flexWrap:'wrap',gap:10,marginBottom:24}}>
                                    {['BREAKFAST','LUNCH','DINNER','SNACK'].map((t)=>{
                                        const active=mealType===t;
                                        return (
                                        <TouchableOpacity key={t} accessibilityRole="button" accessibilityState={{ selected: active }} accessibilityLabel={t} style={[s.typeBtn,{backgroundColor:active?colors.accent.emerald:colors.background.secondary,borderColor:active?colors.accent.emerald:colors.border.default},active&&shadows.glow(colors.accent.emerald)]} onPress={()=>setMealType(t)}>
                                            <Text style={[typography.caption,{color:active?'#FFF':colors.text.secondary,fontWeight:'bold'}]}>{t}</Text>
                                        </TouchableOpacity>
                                        );
                                    })}
                                </View>
                                <View style={[s.sumCard,{backgroundColor:colors.background.secondary,borderColor:colors.border.default}]}>
                                    <Text style={[typography.subhead,{color:colors.text.primary,fontWeight:'bold',marginBottom:12}]}>Nutrition Summary</Text>
                                    <View style={{flexDirection:'row',justifyContent:'space-between'}}>
                                        {[{l:'Calories',v:Math.round(servingModal.calories*parseFloat(qty||'0')),u:'kcal',c:colors.accent.coral},{l:'Protein',v:Math.round(servingModal.protein*parseFloat(qty||'0')),u:'g',c:colors.accent.emerald},{l:'Carbs',v:Math.round(servingModal.carbs*parseFloat(qty||'0')),u:'g',c:colors.accent.cyan},{l:'Fat',v:Math.round(servingModal.fat*parseFloat(qty||'0')),u:'g',c:colors.accent.amber}].map((m)=>(
                                            <View key={m.l} style={{alignItems:'center',flex:1}}>
                                                <Text style={[typography.statSmall,{color:m.c,fontSize:18,lineHeight:24}]}>{m.v}</Text>
                                                <Text style={[typography.overline,{color:colors.text.secondary,fontSize:9,letterSpacing:1,marginTop:2}]}>{m.u}</Text>
                                            </View>
                                        ))}
                                    </View>
                                </View>
                                <TouchableOpacity accessibilityRole="button" accessibilityLabel="Log meal" accessibilityState={{ disabled: logM.isPending }} style={[s.logBtnWrap,{marginTop:24},!logM.isPending&&shadows.glow(colors.accent.coral)]} onPress={()=>logM.mutate(servingModal)} disabled={logM.isPending} activeOpacity={0.85}>
                                    <LinearGradient colors={colors.gradients.coral} start={{x:0,y:0}} end={{x:1,y:0}} style={s.logBtn}>
                                        <Text style={[typography.subhead,{color:'#FFF',fontWeight:'900',fontSize:16}]}>{logM.isPending?'LOGGING...':'LOG MEAL'}</Text>
                                    </LinearGradient>
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
    catCard:{width:'47%',height:104,borderRadius:20,borderWidth:1,overflow:'hidden',justifyContent:'flex-end',padding:12},
    catBar:{width:3,height:18,borderRadius:2,marginBottom:5},
    filterBar:{paddingHorizontal:20,paddingVertical:12,borderBottomWidth:1,flexDirection:'row'},
    filterChip:{flexDirection:'row',alignItems:'center',paddingHorizontal:12,paddingVertical:7,borderRadius:20,borderWidth:1},
    foodCard:{flexDirection:'row',alignItems:'center',padding:16,marginBottom:12,borderRadius:14,borderWidth:1},
    modalOvr:{flex:1,justifyContent:'flex-end'}, modalCnt:{height:'85%',padding:24,borderTopLeftRadius:28,borderTopRightRadius:28},
    modalClose:{width:36,height:36,borderRadius:18,borderWidth:1,alignItems:'center',justifyContent:'center'},
    numInput:{height:56,paddingHorizontal:16,fontSize:20,fontWeight:'bold',borderRadius:14,borderWidth:1,marginBottom:8},
    typeBtn:{flex:1,minWidth:'45%',height:44,borderRadius:22,borderWidth:1,alignItems:'center',justifyContent:'center'},
    sumCard:{borderRadius:14,borderWidth:1,padding:20,marginBottom:8},
    logBtnWrap:{height:60,borderRadius:30,overflow:'hidden'},
    logBtn:{flex:1,height:60,borderRadius:30,alignItems:'center',justifyContent:'center'},
});
