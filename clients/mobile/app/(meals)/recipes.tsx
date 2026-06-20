import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { getRecipes, getRecipe } from '@/api/meals';
import { LinearGradient } from 'expo-linear-gradient';
import { withAlpha } from '@/theme/utils';
import { shadows } from '@/theme/shadows';
import { spacing, borderRadius } from '@/theme/spacing';
import { Skeleton, EmptyState, CtaButton, GlassCard } from '@/components/ui';
// Bundled Aurora dark-glass placeholder so imageless recipes never depend on an
// external host (no 404 / rate-limit). '@/*' resolves to ./src, so the asset is
// required by relative path (same pattern as the exercise fallbacks).
const RECIPE_FALLBACK = require('../../assets/images/recipe-fallback.png');
// Filter accents map to canonical Aurora theme tokens. Module scope can't read
// the hook, so we use the exact accent hex values from '@/theme/colors'.
const TAGS = [
    { id:'all', label:'All', color:'#FF6B35' },          // accent.coral
    { id:'high-protein', label:'High Protein', color:'#FF4444' }, // accent.red
    { id:'keto', label:'Keto', color:'#FFB300' },        // accent.amber
    { id:'vegan', label:'Vegan', color:'#10B981' },      // accent.emerald
    { id:'meal-prep', label:'Meal Prep', color:'#7C4DFF' }, // accent.purple
    { id:'under-30', label:'Under 30m', color:'#00D4AA' }, // accent.cyan
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
            <StatusBar style="light" />
            <View style={[s.header,{paddingTop:insets.top+16,borderBottomColor:colors.border.default}]}>
                <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Go back" onPress={()=>router.back()} style={[s.iconBtn,{backgroundColor:colors.background.secondary,borderColor:colors.border.default}]}><Ionicons name="arrow-back" size={22} color={colors.text.primary} /></TouchableOpacity>
                <Text style={[typography.h2,{color:colors.text.primary}]}>Ria's Kitchen</Text>
                <View style={{width:40}} />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{paddingHorizontal:20,gap:8,paddingVertical:14}} style={{flexGrow:0,borderBottomWidth:1,borderBottomColor:colors.border.default}}>
                {TAGS.map((tag)=>(
                    <TouchableOpacity key={tag.id} activeOpacity={0.85} accessibilityRole="button" accessibilityState={{ selected: selTag===tag.id }} accessibilityLabel={tag.label} style={[s.tagChip,{backgroundColor:selTag===tag.id?tag.color:colors.background.secondary,borderColor:selTag===tag.id?tag.color:colors.border.default},selTag===tag.id&&shadows.glow(tag.color)]} onPress={()=>setSelTag(tag.id)}>
                        <Text style={[typography.caption,{color:selTag===tag.id?'#FFF':colors.text.secondary,fontWeight:'bold'}]}>{tag.label.toUpperCase()}</Text>
                    </TouchableOpacity>
                ))}
            </ScrollView>
            {recipesQ.isLoading?(
                <View style={{padding:20}}>
                    {[0,1,2].map((i)=>(
                        <Skeleton key={i} width="100%" height={220} radius={borderRadius['2xl']} style={{marginBottom:16}} />
                    ))}
                </View>
            ):
            recipesQ.isError?(
                <EmptyState
                    icon="cloud-offline-outline"
                    title="Couldn't load recipes"
                    subtitle="Something went wrong loading Ria's Kitchen. Check your connection and try again."
                    actionLabel="Try Again"
                    onAction={()=>recipesQ.refetch()}
                />
            ):
            recipes.length===0?(
                <EmptyState
                    icon="restaurant-outline"
                    title={selTag==='all'?'No recipes yet':'No matches found'}
                    subtitle={selTag==='all'?"Ria's Kitchen is warming up. Check back soon for chef-crafted, protocol-ready meals.":'Nothing matches this filter right now. Try another tag or browse the full collection.'}
                    actionLabel={selTag==='all'?undefined:'Browse all recipes'}
                    onAction={selTag==='all'?undefined:()=>setSelTag('all')}
                />
            ):(
                <ScrollView contentContainerStyle={{padding:20,paddingBottom:100}} showsVerticalScrollIndicator={false}>
                    {recipes.map((r)=>(
                        <TouchableOpacity key={r.id} accessibilityRole="button" accessibilityLabel={r.title} style={[s.recCard,{borderColor:colors.border.default},shadows.lg]} activeOpacity={0.9} onPress={()=>setDetailId(r.id)}>
                            <Image source={r.image ? { uri: r.image } : RECIPE_FALLBACK} style={StyleSheet.absoluteFillObject} contentFit="cover" cachePolicy="memory-disk" transition={200} />
                            <LinearGradient colors={['rgba(0,0,0,0.05)','rgba(0,0,0,0.88)']} style={StyleSheet.absoluteFillObject} />
                            <View style={s.topRow}>
                                <View style={[s.badge,{backgroundColor:'rgba(0,0,0,0.5)'}]}><Ionicons name="time-outline" size={12} color="#FFF" /><Text style={[typography.caption,{color:'#FFF',fontWeight:'bold',fontSize:11,marginLeft:4}]}>{(r.prepTimeMins||0)+(r.cookTimeMins||0)}m</Text></View>
                                <View style={[s.badge,{backgroundColor:'rgba(0,0,0,0.5)'}]}><Text style={[typography.caption,{color:'#FFF',fontWeight:'bold',fontSize:11}]}>{r.servings} serv.</Text></View>
                            </View>
                            <View style={s.recInfo}>
                                <Text style={[typography.h2,{color:'#FFF'}]}>{r.title}</Text>
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
                        {detailQ.isLoading?(
                            <View>
                                <Skeleton width="100%" height={300} radius={0} />
                                <View style={s.modalBody}>
                                    <Skeleton width="70%" height={28} radius={borderRadius.md} />
                                    <View style={{flexDirection:'row',justifyContent:'space-around',paddingVertical:20,marginTop:8}}>
                                        {[0,1,2].map((i)=>(
                                            <View key={i} style={{alignItems:'center'}}>
                                                <Skeleton width={48} height={24} radius={borderRadius.sm} />
                                                <Skeleton width={36} height={10} radius={6} style={{marginTop:8}} />
                                            </View>
                                        ))}
                                    </View>
                                    <Skeleton width={120} height={20} radius={borderRadius.sm} style={{marginTop:8,marginBottom:16}} />
                                    {[0,1,2,3].map((i)=>(
                                        <Skeleton key={i} width="100%" height={16} radius={6} style={{marginTop:12}} />
                                    ))}
                                </View>
                            </View>
                        ):detailQ.data?(
                            <ScrollView showsVerticalScrollIndicator={false}>
                                <Image source={detailQ.data.image ? { uri: detailQ.data.image } : RECIPE_FALLBACK} style={s.modalHero} contentFit="cover" cachePolicy="memory-disk" transition={300} />
                                <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Close" style={[s.closeBtn,{backgroundColor:'rgba(0,0,0,0.5)',top:insets.top+12}]} onPress={()=>setDetailId(null)}><Ionicons name="close" size={24} color="#FFF" /></TouchableOpacity>
                                <View style={s.modalBody}>
                                    <Text style={[typography.display,{color:colors.text.primary,fontSize:26,fontWeight:'900'}]}>{detailQ.data.title}</Text>
                                    <GlassCard radius={borderRadius.lg} style={{marginBottom:8}}>
                                        <View style={{flexDirection:'row',justifyContent:'space-around',paddingVertical:20}}>
                                            {[{v:detailQ.data.prepTimeMins,l:'PREP'},{v:detailQ.data.cookTimeMins,l:'COOK'},{v:Math.round(detailQ.data.calories),l:'KCAL'}].map((m)=>(
                                                <View key={m.l} style={{alignItems:'center'}}><Text style={[typography.statSmall,{color:colors.text.primary}]}>{m.v}</Text><Text style={[typography.overline,{color:colors.text.secondary,marginTop:4}]}>{m.l}</Text></View>
                                            ))}
                                        </View>
                                    </GlassCard>
                                    <Text style={[typography.h3,{color:colors.text.primary,borderBottomWidth:1,borderBottomColor:colors.border.default,paddingBottom:8,marginTop:8}]}>Ingredients</Text>
                                    {detailQ.data.ingredients.map((ing:any,i:number)=>(
                                        <View key={i} style={{flexDirection:'row',alignItems:'center',marginTop:12}}>
                                            <Ionicons name="radio-button-on" size={12} color={colors.accent.emerald} />
                                            <Text style={[typography.body,{color:colors.text.primary,flex:1,marginLeft:12}]}>{typeof ing === 'string' ? ing : ing.name}</Text>
                                            {typeof ing !== 'string' && <Text style={[typography.body,{color:colors.text.secondary}]}>{ing.amount} {ing.unit||''}</Text>}
                                        </View>
                                    ))}
                                    <Text style={[typography.h3,{color:colors.text.primary,borderBottomWidth:1,borderBottomColor:colors.border.default,paddingBottom:8,marginTop:28}]}>Instructions</Text>
                                    {detailQ.data.instructions.map((step:string,i:number)=>(
                                        <View key={i} style={{flexDirection:'row',marginTop:18}}>
                                            <View style={[s.stepNum,{backgroundColor:colors.background.secondary}]}><Text style={[typography.caption,{color:colors.text.primary,fontWeight:'bold'}]}>{i+1}</Text></View>
                                            <Text style={[typography.body,{color:colors.text.secondary,flex:1,marginLeft:14,lineHeight:22}]}>{step}</Text>
                                        </View>
                                    ))}
                                    <CtaButton
                                        label="LOG AS MEAL"
                                        icon="restaurant"
                                        size="lg"
                                        accessibilityLabel="Log as meal"
                                        style={[s.ctaWrap,{marginTop:40}]}
                                        onPress={()=>{ setDetailId(null); router.push({pathname:'/(meals)/log-meal',params:{recipeId:detailQ.data?.id}}); }}
                                    />
                                </View>
                            </ScrollView>
                        ):(
                            <EmptyState
                                icon="cloud-offline-outline"
                                title="Couldn't load recipe"
                                subtitle="Something went wrong loading this recipe. Please close and try again."
                                actionLabel="Close"
                                onAction={()=>setDetailId(null)}
                            />
                        )}
                    </View>
                </View>
            </Modal>
        </View>
    );
}
const s = StyleSheet.create({
    container:{flex:1}, header:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:20,paddingBottom:16,borderBottomWidth:1},
    iconBtn:{width:40,height:40,borderRadius:12,borderWidth:1,alignItems:'center',justifyContent:'center'},
    tagChip:{paddingHorizontal:14,paddingVertical:8,borderRadius:20,borderWidth:1},
    recCard:{height:220,borderRadius:24,borderWidth:1,overflow:'hidden',marginBottom:16,justifyContent:'space-between'},
    topRow:{flexDirection:'row',gap:8,padding:14}, badge:{flexDirection:'row',alignItems:'center',paddingHorizontal:8,paddingVertical:4,borderRadius:8},
    recInfo:{padding:16},
    modalCnt:{flex:1,marginTop:60,borderTopLeftRadius:28,borderTopRightRadius:28,overflow:'hidden'},
    modalHero:{width:'100%',height:300},
    closeBtn:{position:'absolute',right:20,width:44,height:44,borderRadius:22,alignItems:'center',justifyContent:'center'},
    modalBody:{padding:24,marginTop:-40},
    stepNum:{width:30,height:30,borderRadius:15,alignItems:'center',justifyContent:'center'},
    ctaWrap:{height:60,borderRadius:30,marginBottom:40},
});
