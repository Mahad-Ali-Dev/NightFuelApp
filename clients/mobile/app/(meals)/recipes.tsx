import React, { useState } from 'react';
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
