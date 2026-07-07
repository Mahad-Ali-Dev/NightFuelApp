import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { getRecipes, getRecipe } from '@/api/meals';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { shadows } from '@/theme/shadows';
import { borderRadius } from '@/theme/spacing';
import { withAlpha } from '@/theme/utils';
import { Skeleton, EmptyState, CtaButton, GlassCard, SearchBar } from '@/components/ui';
import { PressableScale } from '@/components/ui/PressableScale';
import { CountUpText } from '@/components/CountUpText';
import { MacroRings } from '@/components/nutrition/MacroRings';
// Bundled Aurora dark-glass placeholder so imageless recipes never depend on an
// external host (no 404 / rate-limit). '@/*' resolves to ./src, so the asset is
// required by relative path (same pattern as the exercise fallbacks).
const RECIPE_FALLBACK = require('../../assets/images/recipe-fallback.png');

/**
 * Recipe thumbnail with a robust fallback. Uses the recipe photo only when it's a
 * real http(s) URL AND it loads; otherwise (null / empty / broken URL / load error)
 * it shows the bundled dark-glass placeholder + a centered food glyph so an
 * imageless card reads as intentional, never as a blank/broken tile.
 */
function RecipeImage({ uri }: { uri?: string | null }) {
    const { colors } = useTheme();
    const [failed, setFailed] = useState(false);
    const usable = !!uri && /^https?:\/\//.test(uri) && !failed;
    return (
        <>
            <Image
                source={usable ? { uri } : RECIPE_FALLBACK}
                style={StyleSheet.absoluteFillObject}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={200}
                onError={() => setFailed(true)}
            />
            {!usable && (
                <View style={[StyleSheet.absoluteFillObject, { alignItems: 'center', justifyContent: 'center' }]} pointerEvents="none">
                    <Ionicons name="restaurant-outline" size={30} color={withAlpha(colors.text.primary, 0.35)} />
                </View>
            )}
        </>
    );
}
// Tag identity (id + label) is static; the accent COLOR is bound to a live theme
// token below (TAGS, inside the component) so a palette change can't leave a
// stale hex behind. Order here = render order of the filter rail.
// `id` IS the exact recipe tag string the backend filters by (Recipe.tags has),
// so the chip value matches the seeded tags ("High Protein", not "high-protein").
const TAG_DEFS = [
    { id:'all', label:'All', accent:'coral' },
    { id:'High Protein', label:'High Protein', accent:'red' },
    { id:'Keto', label:'Keto', accent:'amber' },
    { id:'Low Carb', label:'Low Carb', accent:'amber' },
    { id:'Vegan', label:'Vegan', accent:'emerald' },
    { id:'Vegetarian', label:'Vegetarian', accent:'emerald' },
    { id:'Meal Prep', label:'Meal Prep', accent:'purple' },
    { id:'Under 30m', label:'Under 30m', accent:'cyan' },
] as const;
export default function RecipesScreen() {
    const { colors, typography } = useTheme();
    // Resolve each tag's accent from the live theme token (never a raw hex), so
    // the chips re-tint automatically if the palette changes.
    const TAGS = useMemo(
        () => TAG_DEFS.map((t)=>({ id:t.id, label:t.label, color:colors.accent[t.accent] })),
        [colors]
    );
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const { width } = useWindowDimensions();
    // A `tags` param (from Explore-meals tiles / a "view all" link) preselects a
    // filter so the screen opens straight into that tag's recipes.
    const params = useLocalSearchParams<{ tags?: string; openRecipe?: string }>();
    const [selTag, setSelTag] = useState(typeof params.tags === 'string' && params.tags ? params.tags : 'all');
    const [query, setQuery] = useState('');
    // `openRecipe` (from a rail card) opens that recipe's detail modal on mount.
    const [detailId, setDetailId] = useState<string|null>(typeof params.openRecipe === 'string' ? params.openRecipe : null);
    // limit 500 (backend max raised to match) so the full ~300 catalog shows.
    const recipesQ = useQuery({ queryKey:['recipes',selTag], queryFn:()=>getRecipes(selTag==='all'?undefined:selTag, 500), staleTime:5*60*1000 });
    const detailQ = useQuery({ queryKey:['recipe-detail',detailId], queryFn:()=>getRecipe(detailId!), enabled:!!detailId });
    const recipes = (recipesQ.data??[]) as any[];
    // Client-side title search over whatever the active tag returned. Does NOT
    // touch the query key / server params — purely narrows the rendered grid.
    const q = query.trim().toLowerCase();
    const visible = useMemo(
        () => (q ? recipes.filter((r)=>String(r.title??'').toLowerCase().includes(q)) : recipes),
        [recipes, q]
    );
    // 2-col grid math: 20px outer padding + 14px gutter between cards.
    const GUTTER = 14;
    const H_PAD = 20;
    const cardW = Math.floor((width - H_PAD*2 - GUTTER) / 2);

    return (
        <View style={[s.container,{backgroundColor:colors.background.primary}]}>
            <StatusBar style="light" />
            <View style={[s.header,{paddingTop:insets.top+16,borderBottomColor:colors.border.default}]}>
                <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Go back" onPress={()=>router.back()} style={[s.iconBtn,{backgroundColor:colors.background.secondary,borderColor:colors.border.default}]}><Ionicons name="arrow-back" size={22} color={colors.text.primary} /></TouchableOpacity>
                <View style={{alignItems:'center'}}>
                    <Text style={[typography.h2,{color:colors.text.primary}]}>Ria's Kitchen</Text>
                    <Text style={[typography.overline,{color:colors.accent.coral,fontSize:10,letterSpacing:1.4}]}>CHEF-CRAFTED MEALS</Text>
                </View>
                <View style={{width:40}} />
            </View>
            {/* Search — client-side title filter, semantic search field. */}
            <View style={{paddingHorizontal:H_PAD,paddingTop:14,paddingBottom:4}}>
                <SearchBar value={query} onChangeText={setQuery} placeholder="Search recipes…" />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{paddingHorizontal:H_PAD,gap:8,paddingVertical:14}} style={{flexGrow:0,borderBottomWidth:1,borderBottomColor:colors.border.default}}>
                {TAGS.map((tag)=>{
                    const on = selTag===tag.id;
                    return (
                        <TouchableOpacity key={tag.id} activeOpacity={0.85} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={tag.label} style={[s.tagChip,{backgroundColor:on?tag.color:colors.background.secondary,borderColor:on?tag.color:colors.border.default},on&&shadows.glow(tag.color)]} onPress={()=>setSelTag(tag.id)}>
                            {/* On a lime/colored fill, the dot + ink label carry the brand contrast (never white-on-lime). */}
                            {!on && <View style={[s.tagDot,{backgroundColor:tag.color}]} />}
                            <Text style={[typography.overline,{color:on?colors.text.inverse:colors.text.secondary,fontSize:11,letterSpacing:0.8}]}>{tag.label.toUpperCase()}</Text>
                        </TouchableOpacity>
                    );
                })}
            </ScrollView>
            {recipesQ.isLoading?(
                <View style={[s.grid,{paddingHorizontal:H_PAD,paddingTop:20}]}>
                    {[0,1,2,3].map((i)=>(
                        <Skeleton key={i} width={cardW} height={232} radius={borderRadius.xl} style={{marginBottom:GUTTER}} />
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
            visible.length===0?(
                q ? (
                    <EmptyState
                        icon="search-outline"
                        title="No matches found"
                        subtitle={`Nothing matches “${query.trim()}”. Try a different search or clear it to see every recipe.`}
                        actionLabel="Clear search"
                        onAction={()=>setQuery('')}
                    />
                ) : (
                    <EmptyState
                        icon="restaurant-outline"
                        title={selTag==='all'?'No recipes yet':'No matches found'}
                        subtitle={selTag==='all'?"Ria's Kitchen is warming up. Check back soon for chef-crafted, protocol-ready meals.":'Nothing matches this filter right now. Try another tag or browse the full collection.'}
                        actionLabel={selTag==='all'?undefined:'Browse all recipes'}
                        onAction={selTag==='all'?undefined:()=>setSelTag('all')}
                    />
                )
            ):(
                <ScrollView contentContainerStyle={{paddingHorizontal:H_PAD,paddingTop:20,paddingBottom:100}} showsVerticalScrollIndicator={false}>
                    <View style={s.grid}>
                        {visible.map((r,idx)=>{
                            const totalMins = (r.prepTimeMins||0)+(r.cookTimeMins||0);
                            return (
                                <Animated.View key={r.id} entering={FadeInDown.delay(Math.min(idx,8)*45).duration(360).springify().damping(16)} style={{width:cardW,marginBottom:GUTTER}}>
                                    {/* PressableScale = the Zeitra house pressed-scale (springs to 0.96 on press-in, interruptible) — transform feedback, not opacity. */}
                                    <PressableScale accessibilityRole="button" accessibilityLabel={r.title} style={[s.recCard,{backgroundColor:colors.background.secondary,borderColor:colors.border.default},shadows.lg]} onPress={()=>setDetailId(r.id)}>
                                        {/* Image + scrim cover the top portion; info sits on the dark-glass body below. */}
                                        <View style={s.recImageWrap}>
                                            <RecipeImage uri={r.image} />
                                            <LinearGradient colors={[withAlpha(colors.background.primary,0),withAlpha(colors.background.primary,0.65)]} style={StyleSheet.absoluteFillObject} />
                                            <View style={s.topRow}>
                                                <View style={[s.badge,{backgroundColor:withAlpha(colors.background.primary,0.55)}]}><Ionicons name="time-outline" size={11} color={colors.text.primary} /><Text style={[typography.captionMedium,{color:colors.text.primary,fontSize:11,marginLeft:3}]}>{totalMins}m</Text></View>
                                                <View style={[s.badge,{backgroundColor:withAlpha(colors.background.primary,0.55)}]}><Ionicons name="people-outline" size={11} color={colors.text.primary} /><Text style={[typography.captionMedium,{color:colors.text.primary,fontSize:11,marginLeft:3}]}>{r.servings}</Text></View>
                                            </View>
                                        </View>
                                        <View style={s.recInfo}>
                                            <Text numberOfLines={2} style={[typography.subtitle,{color:colors.text.primary,minHeight:42}]}>{r.title}</Text>
                                            {/* Hero kcal — big condensed animated count-up, lime accent on glass. */}
                                            <View style={s.kcalRow}>
                                                <CountUpText value={Math.round(r.calories)} style={[typography.statMedium,{color:colors.accent.coral}]} accessibilityLabel={`${Math.round(r.calories)} calories`} />
                                                <Text style={[typography.captionMedium,{color:colors.text.tertiary,marginLeft:5,marginBottom:5}]}>kcal</Text>
                                            </View>
                                            {/* Macro pills: protein=lime, carbs=cyan, fat=amber. Condensed face (statSmall@14) for the tabular nutrition feel the spec wants. */}
                                            <View style={s.macroRow}>
                                                {[{v:Math.round(r.protein),l:'P',c:colors.accent.coral},{v:Math.round(r.carbs),l:'C',c:colors.accent.cyan},{v:Math.round(r.fat),l:'F',c:colors.accent.amber}].map((m)=>(
                                                    <View key={m.l} style={[s.macroPill,{backgroundColor:withAlpha(m.c,0.12)}]}>
                                                        <Text style={[typography.statSmall,{color:m.c,fontSize:14,lineHeight:18}]}>{m.v}</Text>
                                                        <Text style={[typography.overline,{color:m.c,fontSize:9,letterSpacing:0.5,marginLeft:2,opacity:0.85}]}>{m.l}</Text>
                                                    </View>
                                                ))}
                                            </View>
                                        </View>
                                    </PressableScale>
                                </Animated.View>
                            );
                        })}
                    </View>
                </ScrollView>
            )}
            <Modal visible={!!detailId} animationType="slide" transparent>
                {/* Animated backdrop fade — softens the slide-up against the lit grid behind it. */}
                <Animated.View entering={FadeIn.duration(220)} style={[StyleSheet.absoluteFillObject,{backgroundColor:withAlpha(colors.background.primary,0.9)}]} />
                <View style={{flex:1}}>
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
                                {/* ── Full-bleed food-photo hero ─────────────────
                                    The image fills the hero; a top→bottom scrim
                                    fades it into the body so the overlaid badge +
                                    title read cleanly (meal-detail mockup). */}
                                <View style={s.heroWrap}>
                                    <Image source={detailQ.data.image ? { uri: detailQ.data.image } : RECIPE_FALLBACK} style={StyleSheet.absoluteFillObject} contentFit="cover" cachePolicy="memory-disk" transition={300} />
                                    <LinearGradient colors={[withAlpha(colors.background.primary,0.33),withAlpha(colors.background.primary,0),withAlpha(colors.background.primary,0.95)]} locations={[0,0.4,1]} style={StyleSheet.absoluteFillObject} />
                                    <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Close" style={[s.closeBtn,{backgroundColor:withAlpha(colors.background.primary,0.5),top:insets.top+12}]} onPress={()=>setDetailId(null)}><Ionicons name="close" size={24} color={colors.text.primary} /></TouchableOpacity>
                                    {/* Overlaid badge + title pinned to the hero foot. */}
                                    <Animated.View entering={FadeInDown.delay(40).duration(360).springify().damping(16)} style={s.heroFoot}>
                                        <View style={[s.preShiftBadge,{backgroundColor:withAlpha(colors.accent.coral,0.16),borderColor:withAlpha(colors.accent.coral,0.4)}]}>
                                            <Ionicons name="moon" size={12} color={colors.accent.coral} />
                                            <Text style={[typography.overline,{color:colors.accent.coral,fontSize:10,letterSpacing:0.6,marginLeft:5}]}>BEST PRE-SHIFT</Text>
                                        </View>
                                        {/* Title — typography.display family (BarlowCondensed ExtraBold); no fontWeight override. */}
                                        <Text style={[typography.display,{color:colors.text.primary,fontSize:27,marginTop:9}]}>{detailQ.data.title}</Text>
                                    </Animated.View>
                                </View>
                                <View style={s.modalBody}>
                                    {/* Time / kcal / difficulty meta row (mockup). */}
                                    <Animated.View entering={FadeInDown.delay(60).duration(360).springify().damping(16)} style={s.metaRow}>
                                        <View style={s.metaItem}><Ionicons name="time-outline" size={16} color={colors.text.secondary} /><Text style={[typography.caption,{color:colors.text.secondary,marginLeft:5}]}>{(detailQ.data.prepTimeMins||0)+(detailQ.data.cookTimeMins||0)} min</Text></View>
                                        <View style={s.metaItem}><Ionicons name="flame-outline" size={16} color={colors.text.secondary} /><Text style={[typography.caption,{color:colors.text.secondary,marginLeft:5}]}>{Math.round(detailQ.data.calories)} kcal</Text></View>
                                        <View style={s.metaItem}><Ionicons name="restaurant-outline" size={16} color={colors.text.secondary} /><Text style={[typography.caption,{color:colors.text.secondary,marginLeft:5}]}>{detailQ.data.servings} serving{detailQ.data.servings===1?'':'s'}</Text></View>
                                    </Animated.View>
                                    <Animated.View entering={FadeInDown.delay(90).duration(360).springify().damping(16)}>
                                        <GlassCard radius={borderRadius.lg} style={{marginBottom:8}}>
                                            <View style={{paddingVertical:20,paddingHorizontal:4}}>
                                                {/* Macro RINGS — protein=lime, carbs=cyan, fat=amber. A recipe's macros ARE its composition, so each ring's current===target (fills fully); this is the detail view's biggest open canvas, exactly where the spec wants rings. */}
                                                <MacroRings
                                                    protein={{label:'Protein',current:Math.round(detailQ.data.protein),target:detailQ.data.protein,color:colors.accent.coral}}
                                                    carbs={{label:'Carbs',current:Math.round(detailQ.data.carbs),target:detailQ.data.carbs,color:colors.accent.cyan}}
                                                    fat={{label:'Fat',current:Math.round(detailQ.data.fat),target:detailQ.data.fat,color:colors.accent.amber}}
                                                />
                                                {/* PREP / COOK / KCAL — big condensed numerals that COUNT UP (matches the grid card + the brand "animated count-up for big numbers" pattern). Labels stay plain Text. */}
                                                <View style={[s.statTriRow,{borderTopColor:colors.border.default}]}>
                                                    {[{v:detailQ.data.prepTimeMins,l:'PREP'},{v:detailQ.data.cookTimeMins,l:'COOK'},{v:Math.round(detailQ.data.calories),l:'KCAL'}].map((m)=>(
                                                        <View key={m.l} style={{alignItems:'center'}}>
                                                            <CountUpText value={m.v} style={[typography.statSmall,{color:colors.text.primary}]} accessibilityLabel={`${m.v} ${m.l}`} />
                                                            <Text style={[typography.overline,{color:colors.text.secondary,marginTop:4}]}>{m.l}</Text>
                                                        </View>
                                                    ))}
                                                </View>
                                            </View>
                                        </GlassCard>
                                    </Animated.View>
                                    <Animated.Text entering={FadeInDown.delay(140).duration(360).springify().damping(16)} style={[typography.h3,{color:colors.text.primary,borderBottomWidth:1,borderBottomColor:colors.border.default,paddingBottom:8,marginTop:8}]}>Ingredients</Animated.Text>
                                    {detailQ.data.ingredients.map((ing:any,i:number)=>(
                                        <View key={i} style={{flexDirection:'row',alignItems:'center',marginTop:12}}>
                                            <Ionicons name="radio-button-on" size={12} color={colors.accent.emerald} />
                                            <Text style={[typography.body,{color:colors.text.primary,flex:1,marginLeft:12}]}>{typeof ing === 'string' ? ing : ing.name}</Text>
                                            {typeof ing !== 'string' && <Text style={[typography.body,{color:colors.text.secondary}]}>{ing.amount} {ing.unit||''}</Text>}
                                        </View>
                                    ))}
                                    <Animated.Text entering={FadeInDown.delay(190).duration(360).springify().damping(16)} style={[typography.h3,{color:colors.text.primary,borderBottomWidth:1,borderBottomColor:colors.border.default,paddingBottom:8,marginTop:28}]}>Instructions</Animated.Text>
                                    {detailQ.data.instructions.map((step:string,i:number)=>(
                                        <View key={i} style={{flexDirection:'row',marginTop:18}}>
                                            <View style={[s.stepNum,{backgroundColor:colors.background.secondary}]}><Text style={[typography.caption,{color:colors.text.primary,fontWeight:'bold'}]}>{i+1}</Text></View>
                                            <Text style={[typography.body,{color:colors.text.secondary,flex:1,marginLeft:14,lineHeight:22}]}>{step}</Text>
                                        </View>
                                    ))}
                                    <CtaButton
                                        label="Add to today"
                                        icon="checkmark"
                                        size="lg"
                                        accessibilityLabel="Add to today"
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
    tagChip:{flexDirection:'row',alignItems:'center',gap:6,paddingHorizontal:14,paddingVertical:9,borderRadius:20,borderWidth:1},
    tagDot:{width:7,height:7,borderRadius:4},
    grid:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between'},
    recCard:{borderRadius:20,borderWidth:1,overflow:'hidden'},
    recImageWrap:{height:120,width:'100%'},
    topRow:{flexDirection:'row',gap:6,padding:10,justifyContent:'space-between'}, badge:{flexDirection:'row',alignItems:'center',paddingHorizontal:8,paddingVertical:4,borderRadius:8},
    recInfo:{padding:12,paddingTop:10},
    kcalRow:{flexDirection:'row',alignItems:'flex-end',marginTop:6,marginBottom:10},
    macroRow:{flexDirection:'row',gap:6},
    macroPill:{flex:1,flexDirection:'row',alignItems:'center',justifyContent:'center',paddingVertical:5,borderRadius:10},
    // PREP/COOK/KCAL count-up row sits under the macro rings inside the GlassCard, divided by a hairline.
    statTriRow:{flexDirection:'row',justifyContent:'space-around',marginTop:18,paddingTop:16,borderTopWidth:1},
    modalCnt:{flex:1,marginTop:60,borderTopLeftRadius:28,borderTopRightRadius:28,overflow:'hidden'},
    // Full-bleed food-photo hero with overlaid badge + title at its foot.
    heroWrap:{width:'100%',height:300,justifyContent:'flex-end'},
    heroFoot:{paddingHorizontal:24,paddingBottom:18},
    preShiftBadge:{flexDirection:'row',alignItems:'center',alignSelf:'flex-start',paddingHorizontal:10,paddingVertical:5,borderRadius:999,borderWidth:1,borderCurve:'continuous'},
    // Time / kcal / difficulty meta row under the hero.
    metaRow:{flexDirection:'row',gap:16,marginBottom:18},
    metaItem:{flexDirection:'row',alignItems:'center'},
    closeBtn:{position:'absolute',right:20,width:44,height:44,borderRadius:22,alignItems:'center',justifyContent:'center'},
    modalBody:{padding:24,paddingTop:4},
    stepNum:{width:30,height:30,borderRadius:15,alignItems:'center',justifyContent:'center'},
    ctaWrap:{height:60,borderRadius:30,marginBottom:40},
});
