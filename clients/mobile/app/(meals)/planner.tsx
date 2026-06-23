import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getPlanByDate, generatePlan, ratePlan } from '@/api/plans';
import { getCurrent as getCurrentShift } from '@/api/shifts';
// planner.tsx calls the METERED plan-service generatePlan (POST /v1/plans/generate),
// so a daily-cap failure arrives as the SHARED 429
// { error:'ai_quota_exceeded', limit, plan, resetsAt }. We REUSE the canonical
// parser from '@/api/ai' (endpoint-agnostic — the single home of the
// AiQuotaError contract) to flip into the distinct upgrade state instead of the
// old destructive Alert. Same pattern as ai-planner.tsx / circadian.tsx.
import { parseAiQuotaError, type AiQuotaError } from '@/api/ai';
import { format, addDays, startOfWeek, isSameDay } from 'date-fns';
import { withAlpha } from '@/theme/utils';
import { getErrorMessage } from '@/utils/validation';
import { shadows } from '@/theme/shadows';
import { spacing, borderRadius } from '@/theme/spacing';
import { Skeleton, EmptyState, CtaButton, GlassCard, CircularProgress } from '@/components/ui';
// Per-meal accent stripes use canonical Aurora theme accent hexes (module scope
// can't read the hook): amber / emerald / purple / cyan from '@/theme/colors'.
const MEAL_COLORS: Record<string,string> = { breakfast:'#FFB300', lunch:'#10B981', dinner:'#7C4DFF', snack:'#00D4AA' };
// Per-meal glyph so the grid slot cards read at a glance without the thumbnail.
const MEAL_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = { breakfast:'sunny-outline', lunch:'restaurant-outline', dinner:'moon-outline', snack:'nutrition-outline' };
// Bundled Aurora meal art (dark-glass) so the timeline thumbnails never depend
// on an external host (no 404 / rate-limit). '@/*' resolves to ./src, so assets
// are required by relative path (same pattern as the exercise fallbacks).
const MEAL_IMGS: Record<string,number> = {
    breakfast:require('../../assets/images/meal-breakfast.png'),
    lunch:require('../../assets/images/meal-lunch.png'),
    dinner:require('../../assets/images/meal-dinner.png'),
    snack:require('../../assets/images/meal-snack.png'),
};
// Human-readable "resets" line for the daily-limit upgrade block. Renders a
// short local clock time ("Resets at 6:00 AM") when `resetsAt` is a parseable
// ISO timestamp, else a sensible fallback so the block never shows a raw date
// or "Invalid Date". Hoisted to module scope (no per-render Intl alloc); copied
// verbatim from ai-planner.tsx / circadian.tsx's formatResetsAt.
function formatResetsAt(resetsAt:string):string {
    if (!resetsAt) return 'Resets at midnight UTC';
    const when = new Date(resetsAt);
    if (Number.isNaN(when.getTime())) return 'Resets at midnight UTC';
    const time = when.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    return `Resets at ${time}`;
}
export default function MealPlannerScreen() {
    const { colors, typography } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const qc = useQueryClient();
    const [selDate, setSelDate] = useState(new Date());
    const [rating, setRating] = useState(0);
    // ── Plan-generation failure ground truth — two MUTUALLY-EXCLUSIVE vars ───
    // `quota` holds the parsed daily-AI-limit 429 (the distinct upgrade state);
    // `genError` holds any other failure message (the retryable inline notice).
    // Exactly one is ever non-null — both clear on runGenerate + onSuccess, and
    // onError sets precisely one. The visible cards are DERIVED from whichever is
    // set (state = ground truth, not the rendered output).
    const [quota,setQuota] = useState<AiQuotaError|null>(null);
    const [genError,setGenError] = useState<string|null>(null);
    const dateStr = format(selDate,'yyyy-MM-dd');
    const planQ = useQuery({ queryKey:['nutrition-plan',dateStr], queryFn:()=>getPlanByDate(dateStr), retry:false });
    const shiftQ = useQuery({ queryKey:['current-shift'], queryFn:()=>getCurrentShift(), retry:false });
    const genM = useMutation({
        mutationFn:()=>generatePlan({
            date:dateStr,
            shiftId: shiftQ.data?.id,
            shiftType: shiftQ.data?.type,
        }),
        onSuccess:()=>{ setQuota(null); setGenError(null); qc.invalidateQueries({queryKey:['nutrition-plan',dateStr]}); Alert.alert('Plan Generated','Your AI-powered nutrition protocol is ready.'); },
        onError:(err:unknown)=>{
            // A 429 daily-AI-limit flips into the distinct upgrade state; any
            // other error (network / 5xx / non-quota 4xx) takes the retryable
            // inline error path. Set exactly one; clear the other — no Alert.
            const q=parseAiQuotaError(err);
            if(q){ setQuota(q); setGenError(null); }
            else { setQuota(null); setGenError(getErrorMessage(err)); }
        },
    });
    // Clear any prior failure state and kick off generation (used by the empty-
    // state CTA, the regenerate control, and the inline "Try Again").
    const runGenerate=()=>{ setQuota(null); setGenError(null); genM.mutate(); };
    const rateM = useMutation({
        mutationFn:(rating:number)=>ratePlan(planQ.data!.id,rating),
        onSuccess:()=>qc.invalidateQueries({queryKey:['nutrition-plan',dateStr]}),
        onError:(err:unknown)=>Alert.alert('Rating Failed', getErrorMessage(err)),
    });
    const weekDays = useMemo(()=>{ const start=startOfWeek(new Date(),{weekStartsOn:1}); return Array.from({length:7}).map((_,i)=>addDays(start,i)); },[]);
    const plan = planQ.data;
    // Derived macro totals for the hero summary (math unchanged from the old
    // inline reduce()). `kcal` doubles as the calorie-ring fill against a 2500
    // kcal reference target — visual only, never persisted.
    const totalKcal = plan ? Math.round(plan.meals.reduce((a:number,m:any)=>a+(m.macros?.calories||0),0)) : 0;
    const totalProtein = plan ? Math.round(plan.meals.reduce((a:number,m:any)=>a+(m.macros?.protein||0),0)) : 0;
    const kcalTarget = 2500;
    // Mutually-exclusive failure surfaces, rendered ONLY when no generation is in
    // flight. Defined ONCE here and dropped into BOTH render branches (empty +
    // loaded) so the message shows whether or not a plan already exists. Token
    // backgrounds only (no inline coral-CTA gradient / SafeBlurView — the Upgrade
    // action is the sanctioned CtaButton). Mirrors ai-planner.tsx lines 358-414.
    const failureNotices = !genM.isPending ? (
        <>
            {/* Daily-AI-limit 429 → distinct upgrade state (NOT the retryable
                error). Mutually exclusive with `genError`; the Upgrade action is
                the shared CtaButton routing to the premium modal. */}
            {!!quota && (
                <View style={[s.noticeCard,{backgroundColor:withAlpha(colors.accent.coral,0.08),borderColor:withAlpha(colors.accent.coral,0.35)}]} accessibilityRole="alert">
                    <View style={{flexDirection:'row',alignItems:'flex-start'}}>
                        <Ionicons name="flash-outline" size={20} color={colors.accent.coral} style={{marginTop:1}} />
                        <View style={{flex:1,marginLeft:10}}>
                            <Text style={[typography.subhead,{color:colors.text.primary,fontWeight:'700'}]}>Daily AI limit reached</Text>
                            <Text style={[typography.caption,{color:colors.text.secondary,marginTop:2,lineHeight:18}]}>{`You've used all ${quota.limit} of your ${quota.plan==='pro'?'Pro':'free'} daily AI plans. ${formatResetsAt(quota.resetsAt)}.`}</Text>
                        </View>
                    </View>
                    <CtaButton
                        label="Upgrade"
                        icon="sparkles"
                        size="sm"
                        onPress={()=>router.push('/(modals)/premium')}
                        accessibilityLabel="Upgrade to remove the daily AI limit"
                        style={{alignSelf:'flex-start',marginTop:12}}
                    />
                </View>
            )}
            {/* Persistent, retryable inline error — survives until a retry
                succeeds. Mutually exclusive with `quota`. */}
            {!!genError && (
                <View style={[s.noticeCard,{backgroundColor:withAlpha(colors.accent.coral,0.08),borderColor:withAlpha(colors.accent.coral,0.35)}]} accessibilityRole="alert">
                    <View style={{flexDirection:'row',alignItems:'flex-start'}}>
                        <Ionicons name="alert-circle" size={20} color={colors.accent.coral} style={{marginTop:1}} />
                        <View style={{flex:1,marginLeft:10}}>
                            <Text style={[typography.subhead,{color:colors.text.primary,fontWeight:'700'}]}>Generation Failed</Text>
                            <Text style={[typography.caption,{color:colors.text.secondary,marginTop:2,lineHeight:18}]}>{genError}</Text>
                        </View>
                    </View>
                    <TouchableOpacity style={[s.tryAgainBtn,{borderColor:withAlpha(colors.accent.coral,0.5)}]} onPress={runGenerate} accessibilityRole="button" accessibilityLabel="Try again" activeOpacity={0.85}>
                        <Ionicons name="refresh" size={16} color={colors.accent.coral} />
                        <Text style={[typography.caption,{color:colors.accent.coral,fontWeight:'700',marginLeft:6}]}>Try Again</Text>
                    </TouchableOpacity>
                </View>
            )}
        </>
    ) : null;
    return (
        <View style={[s.container,{backgroundColor:colors.background.primary}]}>
            <StatusBar style="light" />
            <View style={[s.header,{paddingTop:insets.top+16,borderBottomColor:colors.border.default}]}>
                <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Go back" onPress={()=>router.back()} style={[s.iconBtn,{backgroundColor:colors.background.secondary,borderColor:colors.border.default}]}><Ionicons name="arrow-back" size={22} color={colors.text.primary} /></TouchableOpacity>
                <View style={{alignItems:'center'}}>
                    <Text style={[typography.overline,{color:colors.accent.coral,fontSize:10,letterSpacing:1.5}]}>RIA NUTRITION</Text>
                    <Text style={[typography.h3,{color:colors.text.primary,marginTop:2}]}>Meal Planner</Text>
                </View>
                <View style={{width:40}} />
            </View>
            {/* ── Day-selector carousel ─────────────────────────────────────────
                Horizontal snapping week strip. Selected day = lime fill with INK
                numerals + glow; today carries a lime dot. setSelDate handler &
                a11y are unchanged. */}
            <Animated.View entering={FadeInDown.duration(380)} style={{borderBottomWidth:1,borderBottomColor:colors.border.default}}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{paddingHorizontal:20,gap:10,paddingVertical:16}} style={{flexGrow:0}}>
                    {weekDays.map((d)=>{
                        const isSel=format(d,'yyyy-MM-dd')===dateStr;
                        const isToday=isSameDay(d,new Date());
                        return (
                            <TouchableOpacity key={d.toISOString()} activeOpacity={0.85} accessibilityRole="button" accessibilityState={{ selected: isSel }} accessibilityLabel={format(d,'EEEE, MMMM d')} style={[s.dayCard,{backgroundColor:isSel?colors.accent.coral:colors.background.secondary,borderColor:isSel?colors.accent.coral:colors.border.default},isSel&&shadows.glow(colors.accent.coral)]} onPress={()=>setSelDate(d)}>
                                <Text style={[typography.overline,{color:isSel?colors.text.inverse:colors.text.tertiary,fontSize:10,letterSpacing:1}]}>{format(d,'EEE').toUpperCase()}</Text>
                                <Text style={[typography.statSmall,{color:isSel?colors.text.inverse:colors.text.primary,fontSize:20,lineHeight:26,marginTop:4}]}>{format(d,'d')}</Text>
                                <View style={[s.dayDot,{backgroundColor:isToday?(isSel?colors.text.inverse:colors.accent.coral):'transparent'}]} />
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            </Animated.View>
            <ScrollView contentContainerStyle={{padding:20,paddingBottom:100}} showsVerticalScrollIndicator={false}>
                <Animated.View entering={FadeInDown.delay(40).duration(420)} style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
                    <Text style={[typography.h1,{color:colors.text.primary}]}>{format(selDate,'MMMM do')}</Text>
                    {plan&&<View style={[s.aiBadge,{backgroundColor:withAlpha(colors.accent.purple,0.15),borderColor:withAlpha(colors.accent.purple,0.28)}]}><Ionicons name="sparkles" size={11} color={colors.accent.purple} style={{marginRight:5}} /><Text style={[typography.overline,{color:colors.accent.purple,fontSize:10,letterSpacing:1}]}>AI OPTIMIZED</Text></View>}
                </Animated.View>
                {planQ.isLoading?(
                    <View>
                        <Skeleton width="100%" height={140} radius={borderRadius.xl} style={{marginBottom:spacing.lg}} />
                        <Skeleton width={90} height={12} radius={6} style={{marginVertical:spacing.lg}} />
                        <View style={{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between'}}>
                            {[0,1,2,3].map((i)=>(
                                <Skeleton key={i} width="48%" height={150} radius={borderRadius.xl} style={{marginBottom:spacing.md}} />
                            ))}
                        </View>
                    </View>
                ):
                planQ.isError?(
                    <EmptyState
                        icon="cloud-offline-outline"
                        title="Couldn't load your plan"
                        subtitle="Something went wrong reaching the Ria nutrition engine. Check your connection and try again."
                        actionLabel="Retry"
                        onAction={()=>planQ.refetch()}
                    />
                ):
                !plan?(
                    <Animated.View entering={FadeInDown.delay(60).duration(420)} style={s.emptyState}>
                        <View style={[s.emptyIcon,{backgroundColor:withAlpha(colors.accent.purple,0.12),borderColor:withAlpha(colors.accent.purple,0.24),borderWidth:1},shadows.glow(colors.accent.purple)]}><Ionicons name="sparkles" size={48} color={colors.accent.purple} /></View>
                        <Text style={[typography.overline,{color:colors.accent.purple,textAlign:'center',marginTop:24}]}>RIA NUTRITION ENGINE</Text>
                        <Text style={[typography.h2,{color:colors.text.primary,textAlign:'center',marginTop:8}]}>No plan for this day</Text>
                        <Text style={[typography.body,{color:colors.text.secondary,textAlign:'center',marginTop:8,maxWidth:300}]}>Let Ria analyze your shift schedule and build a perfect nutrition protocol.</Text>
                        <CtaButton
                            size="lg"
                            icon="sparkles"
                            label="GENERATE AI PLAN"
                            accessibilityLabel="Generate AI plan"
                            style={[s.genBtnWrap,{marginTop:32}]}
                            onPress={runGenerate}
                            loading={genM.isPending}
                        />
                        {!!failureNotices&&<View style={{width:'100%',marginTop:8}}>{failureNotices}</View>}
                    </Animated.View>
                ):(
                    <View>
                        {/* ── Macro summary hero ────────────────────────────────
                            Calorie ring (totalKcal / 2500 reference) flanked by
                            PROTEIN + HYDRATION stat columns inside the Aurora
                            dark-glass surface. All macro math is unchanged. */}
                        <Animated.View entering={FadeInDown.delay(60).duration(420)}>
                            <GlassCard radius={20} style={{ marginBottom: 8 }}>
                                <View style={s.summaryRow}>
                                    <CircularProgress
                                        size={108}
                                        strokeWidth={9}
                                        progress={totalKcal/kcalTarget}
                                        color={colors.accent.coral}
                                        trackColor={colors.border.default}
                                    >
                                        <Text style={[typography.statMedium,{color:colors.text.primary,fontSize:26,lineHeight:30}]}>{totalKcal}</Text>
                                        <Text style={[typography.overline,{color:colors.text.secondary,fontSize:9,letterSpacing:1,marginTop:2}]}>KCAL</Text>
                                    </CircularProgress>
                                    <View style={s.summaryStats}>
                                        <View style={s.summaryStat}>
                                            <View style={[s.statDot,{backgroundColor:colors.accent.emerald}]} />
                                            <View>
                                                <Text style={[typography.statSmall,{color:colors.text.primary,fontSize:22,lineHeight:26}]}>{totalProtein}<Text style={[typography.caption,{color:colors.text.secondary}]}> g</Text></Text>
                                                <Text style={[typography.overline,{color:colors.text.secondary,fontSize:9,letterSpacing:1,marginTop:2}]}>PROTEIN</Text>
                                            </View>
                                        </View>
                                        <View style={[s.statDivider,{backgroundColor:colors.border.default}]} />
                                        <View style={s.summaryStat}>
                                            <View style={[s.statDot,{backgroundColor:colors.accent.cyan}]} />
                                            <View>
                                                <Text style={[typography.statSmall,{color:colors.text.primary,fontSize:22,lineHeight:26}]}>{(plan.hydrationTargetMl/1000).toFixed(1)}<Text style={[typography.caption,{color:colors.text.secondary}]}> L</Text></Text>
                                                <Text style={[typography.overline,{color:colors.text.secondary,fontSize:9,letterSpacing:1,marginTop:2}]}>HYDRATION</Text>
                                            </View>
                                        </View>
                                    </View>
                                </View>
                            </GlassCard>
                        </Animated.View>
                        {/* ── Meal-slot GRID ────────────────────────────────────
                            2-col grid of tappable meal cards (thumbnail, accent
                            stripe, time chip, per-meal kcal). Each routes to
                            log-meal with the same preset param; staggered entrance
                            + pressed-scale. testIDs/a11y/nav all unchanged. */}
                        <View style={s.sectionHeaderRow}>
                            <Text style={[typography.overline,{color:colors.text.secondary}]}>MEAL SLOTS</Text>
                            <View style={[s.countPill,{borderColor:colors.border.default,backgroundColor:colors.background.secondary}]}>
                                <Text style={[typography.caption,{color:colors.text.secondary,fontWeight:'700'}]}>{plan.meals.length}</Text>
                            </View>
                        </View>
                        <View style={s.mealGrid}>
                            {plan.meals.map((meal:any,idx:number)=>{
                                const mKey:string = ((meal.label||'snack') as string).toLowerCase().split(' ')[0]??'snack';
                                const mc = MEAL_COLORS[mKey]??colors.accent.coral;
                                const mi = MEAL_IMGS[mKey]??MEAL_IMGS['snack']!;
                                const mIcon = MEAL_ICONS[mKey]??'nutrition-outline';
                                const kcal = Math.round(meal.macros?.calories||0);
                                return (
                                    <Animated.View key={idx} entering={FadeInDown.delay(120+idx*60).springify().damping(18)} style={s.mealGridCell}>
                                        <Pressable accessibilityRole="button" accessibilityLabel={meal.label} onPress={()=>router.push({pathname:'/(meals)/log-meal',params:{preset:meal.label}})} style={({pressed})=>[s.mealCard,{backgroundColor:colors.background.secondary,borderColor:colors.border.default},pressed&&{transform:[{scale:0.97}],borderColor:withAlpha(mc,0.5)}]}>
                                            <View style={s.mealThumbWrap}>
                                                <Image source={mi} style={s.mealThumb} contentFit="cover" cachePolicy="memory-disk" transition={200} />
                                                <View style={[s.mealAccent,{backgroundColor:mc}]} />
                                                <View style={[s.timeChip,{backgroundColor:withAlpha(colors.background.primary,0.72)}]}>
                                                    <Ionicons name={mIcon} size={11} color={mc} style={{marginRight:4}} />
                                                    <Text style={[typography.caption,{color:colors.text.primary,fontWeight:'700',fontSize:10}]}>{meal.time}</Text>
                                                </View>
                                            </View>
                                            <View style={s.mealBody}>
                                                <Text style={[typography.subhead,{color:colors.text.primary,fontWeight:'700',fontSize:15}]} numberOfLines={1}>{meal.label}</Text>
                                                <Text style={[typography.caption,{color:colors.text.secondary,marginTop:3}]} numberOfLines={2}>{meal.description}</Text>
                                                <View style={s.mealFooter}>
                                                    {kcal>0
                                                        ? <Text style={[typography.statTiny,{color:mc,fontSize:13}]}>{kcal}<Text style={[typography.caption,{color:colors.text.tertiary}]}> kcal</Text></Text>
                                                        : <View />}
                                                    <Ionicons name="add-circle" size={20} color={mc} />
                                                </View>
                                            </View>
                                        </Pressable>
                                    </Animated.View>
                                );
                            })}
                        </View>
                        {plan.supplements&&plan.supplements.length>0&&(
                            <Animated.View entering={FadeInDown.delay(180).duration(420)} style={{marginTop:24}}>
                                <Text style={[typography.overline,{color:colors.text.secondary,marginBottom:12}]}>SUPPLEMENTS</Text>
                                <View style={[s.suppCard,{backgroundColor:colors.background.secondary,borderColor:colors.border.default}]}>
                                    {plan.supplements.map((sup:string,i:number)=>(
                                        <View key={i} style={[s.suppRow,i!==plan.supplements.length-1&&{borderBottomWidth:1,borderBottomColor:colors.border.default}]}>
                                            <View style={[s.suppIcon,{backgroundColor:withAlpha(colors.accent.purple,0.14)}]}><Ionicons name="medical" size={16} color={colors.accent.purple} /></View>
                                            <Text style={[typography.body,{color:colors.text.primary,marginLeft:12}]}>{sup}</Text>
                                        </View>
                                    ))}
                                </View>
                            </Animated.View>
                        )}
                        <Animated.View entering={FadeInDown.delay(220).duration(420)} style={{marginTop:40,alignItems:'center'}}>
                            <Text style={[typography.caption,{color:colors.text.secondary,marginBottom:12}]}>How was this plan?</Text>
                            <View style={{flexDirection:'row'}}>
                                {[1,2,3,4,5].map((v)=>(
                                    <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={`Rate ${v} star${v>1?'s':''}`} key={v} onPress={()=>{ setRating(v); rateM.mutate(v); }}>
                                        <Ionicons name={v<=rating?"star":"star-outline"} size={32} color={colors.accent.amber} style={{marginHorizontal:4}} />
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </Animated.View>
                        {!!failureNotices&&<View style={{marginTop:32}}>{failureNotices}</View>}
                        <TouchableOpacity activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Regenerate plan" accessibilityState={{ disabled: genM.isPending, busy: genM.isPending }} style={[s.genBtn,{backgroundColor:colors.background.secondary,marginTop:32,borderWidth:1,borderColor:colors.border.default},genM.isPending&&{opacity:0.6}]} onPress={runGenerate} disabled={genM.isPending}>
                            {genM.isPending
                                ? <ActivityIndicator size="small" color={colors.text.primary} />
                                : <Ionicons name="refresh" size={20} color={colors.text.primary} />}
                            <Text style={[typography.subhead,{color:colors.text.primary,fontWeight:'900',marginLeft:8}]}>{genM.isPending?'GENERATING...':'REGENERATE PLAN'}</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </ScrollView>
        </View>
    );
}
const s = StyleSheet.create({
    container:{flex:1}, header:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingHorizontal:20,paddingBottom:16,borderBottomWidth:1},
    iconBtn:{width:40,height:40,borderRadius:12,borderWidth:1,alignItems:'center',justifyContent:'center'},
    dayCard:{width:60,height:84,alignItems:'center',justifyContent:'center',borderRadius:18,borderWidth:1,borderCurve:'continuous'},
    dayDot:{width:5,height:5,borderRadius:3,marginTop:6},
    aiBadge:{flexDirection:'row',alignItems:'center',paddingHorizontal:10,paddingVertical:5,borderRadius:999,borderWidth:1},
    emptyState:{alignItems:'center',justifyContent:'center',marginTop:40},
    emptyIcon:{width:100,height:100,borderRadius:50,alignItems:'center',justifyContent:'center'},
    // Inner stat layout for the loaded-plan summary GlassCard (the glass surface —
    // radius / hairline / clip / blur / marginBottom — is owned by GlassCard).
    // Calorie ring on the left, PROTEIN + HYDRATION columns on the right.
    summaryRow:{flexDirection:'row',alignItems:'center',padding:18,gap:18},
    summaryStats:{flex:1,justifyContent:'center',gap:14},
    summaryStat:{flexDirection:'row',alignItems:'center',gap:10},
    statDot:{width:8,height:8,borderRadius:4},
    statDivider:{height:1,marginLeft:18},
    // Section header + count pill above the meal grid.
    sectionHeaderRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginTop:20,marginBottom:14},
    countPill:{minWidth:26,height:22,paddingHorizontal:8,borderRadius:11,borderWidth:1,alignItems:'center',justifyContent:'center'},
    // 2-col meal grid. Cells are 48% wide with space-between gutters; each card
    // fills its cell and carries a thumbnail header + body.
    mealGrid:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between'},
    mealGridCell:{width:'48%',marginBottom:14},
    mealCard:{borderRadius:18,borderWidth:1,borderCurve:'continuous',overflow:'hidden'},
    mealThumbWrap:{height:92,width:'100%'},
    mealThumb:{width:'100%',height:'100%'},
    mealAccent:{position:'absolute',left:0,top:0,bottom:0,width:4},
    timeChip:{position:'absolute',top:8,left:8,flexDirection:'row',alignItems:'center',paddingHorizontal:8,paddingVertical:4,borderRadius:999},
    mealBody:{padding:12},
    mealFooter:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginTop:10},
    suppCard:{borderRadius:18,borderWidth:1,borderCurve:'continuous',padding:4}, suppRow:{flexDirection:'row',alignItems:'center',padding:12},
    suppIcon:{width:32,height:32,borderRadius:10,alignItems:'center',justifyContent:'center'},
    genBtnWrap:{width:'100%',borderRadius:28,overflow:'hidden',marginBottom:20},
    genBtn:{height:56,borderRadius:28,borderCurve:'continuous',flexDirection:'row',alignItems:'center',justifyContent:'center',marginBottom:20},
    // Inline upgrade / retryable-error notice surface (token-filled View — NOT a
    // coral-CTA gradient or SafeBlurView; the Upgrade action is a CtaButton).
    // Mirrors ai-planner.tsx's errorCard/tryAgainBtn.
    noticeCard:{borderRadius:16,borderCurve:'continuous',borderWidth:1,padding:16,marginBottom:12},
    tryAgainBtn:{flexDirection:'row',alignItems:'center',justifyContent:'center',alignSelf:'flex-start',marginTop:12,paddingHorizontal:16,paddingVertical:8,borderRadius:20,borderCurve:'continuous',borderWidth:1.5},
});
