import React, { useState } from 'react';
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
