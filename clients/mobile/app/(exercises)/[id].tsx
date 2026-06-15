import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions, Linking } from 'react-native';
import { Image } from 'expo-image';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { getById, getAnalytics } from '@/api/exercises';
import { LinearGradient } from 'expo-linear-gradient';
import { withAlpha } from '@/theme/utils';
import { shadows } from '@/theme/shadows';
import { spacing } from '@/theme/spacing';
import { Skeleton, EmptyState } from '@/components/ui';
import { LineChart } from 'react-native-gifted-charts';
import { resolveDemo, tipsFor } from '@/constants/exerciseDemos';
const { width } = Dimensions.get('window');
// Bundled neutral placeholder shown when an exercise has no image (no network hit).
const FALLBACK_IMAGE = require('../../assets/images/exercise-detail-fallback.png');
const DIFF_COLORS: Record<string, string> = { Beginner: '#2ECC71', Intermediate: '#F59E0B', Expert: '#EF4444' };
type DetailTab = 'howto' | 'muscles' | 'tips' | 'progress';
const TABS: { key: DetailTab; label: string }[] = [{ key: 'howto', label: 'How To' },{ key: 'muscles', label: 'Muscles' },{ key: 'tips', label: 'Pro Tips' },{ key: 'progress', label: 'Progress' }];
export default function ExerciseDetailScreen() {
    const { colors, typography, borderRadius } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const { id } = useLocalSearchParams<{ id: string }>();
    const [activeTab, setActiveTab] = useState<DetailTab>('howto');
    const exerciseQuery = useQuery({ queryKey: ['exercise-detail', id], queryFn: () => getById(id!), enabled: !!id });
    const exercise = exerciseQuery.data;
    const analyticsQuery = useQuery({ queryKey: ['exercise-analytics', exercise?.name], queryFn: () => getAnalytics(exercise?.name || ''), enabled: !!exercise?.name && activeTab === 'progress' });
    // Parse instruction text into discrete steps. Deterministic: if the source has
    // real line breaks, split on those; otherwise fall back to sentence boundaries.
    // A leading "1. " / "2) " numbering is stripped so we never double-number.
    const instructions = useMemo<string[]>(() => {
        const raw = typeof exercise?.instructions === 'string' ? exercise.instructions.trim() : '';
        if (!raw) return [];
        const parts = /\n/.test(raw) ? raw.split(/\n+/) : raw.split(/(?<=[.!?])\s+/);
        return parts
            .map((s: string) => s.replace(/^\s*\d+[.)]\s*/, '').trim())
            .filter((s: string) => s.length > 0);
    }, [exercise?.instructions]);
    // A single chunk reads better as a flowing paragraph than a lone "1." bullet.
    const isSingleParagraph = instructions.length === 1;
    // Demo media: prefer backend demoUrl, fall back to the curated client map.
    const demoUrl = useMemo(() => resolveDemo(exercise), [exercise]);
    // Body-part-specific coaching cues (distinct per muscle group); generic fallback.
    const { tips, isGeneral: tipsAreGeneral } = useMemo(() => tipsFor(exercise?.bodyPart), [exercise?.bodyPart]);
    // Secondary muscles — guarded: the API may not surface this field yet.
    const secondaryMuscles: string[] = Array.isArray(exercise?.secondaryMuscles)
        ? exercise.secondaryMuscles.filter((m: unknown): m is string => typeof m === 'string' && m.trim().length > 0)
        : [];
    // Display label: prefer bodyPart (e.g. "chest") over muscleGroup (e.g. "pectoralis major")
    const targetLabel = exercise?.bodyPart
        ? exercise.bodyPart.charAt(0).toUpperCase() + exercise.bodyPart.slice(1)
        : (exercise?.muscleGroup ?? 'N/A');
    const chartData = useMemo(() => { if (!analyticsQuery.data || !Array.isArray(analyticsQuery.data)) return []; return analyticsQuery.data.map((e: any) => ({ value: e.maxWeight || 0, label: new Date(e.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) })).slice(-10); }, [analyticsQuery.data]);
    const diffColor = DIFF_COLORS[exercise?.difficulty ?? ''] ?? colors.accent.coral;
    if (exerciseQuery.isLoading) return (
        <View style={[s.container, { backgroundColor: colors.background.primary }]}>
            <Skeleton width="100%" height={320} radius={0} />
            <View style={{ padding: 20, marginTop: -40 }}>
                <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md }}>
                    <Skeleton width={88} height={22} radius={8} />
                    <Skeleton width={104} height={22} radius={8} />
                </View>
                <Skeleton width="72%" height={32} radius={10} />
                <Skeleton width={160} height={16} radius={6} style={{ marginTop: spacing.md }} />
                <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl }}>
                    {[0, 1, 2].map((i) => <Skeleton key={i} width={(width - 60) / 3} height={104} radius={14} />)}
                </View>
                <View style={{ flexDirection: 'row', gap: spacing.xl, marginTop: spacing['3xl'] }}>
                    {[0, 1, 2, 3].map((i) => <Skeleton key={i} width={52} height={14} radius={6} />)}
                </View>
                <View style={{ marginTop: spacing.xl, gap: spacing.lg }}>
                    {[0, 1, 2].map((i) => <Skeleton key={i} width="100%" height={18} radius={6} />)}
                </View>
            </View>
        </View>
    );
    if (!exercise) return (
        <View style={[s.container, { backgroundColor: colors.background.primary }]}>
            <View style={[s.headerRow, { paddingTop: insets.top + 8 }]}>
                <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Go back" style={[s.overlayBtn, { backgroundColor: 'rgba(0,0,0,0.45)' }]} onPress={() => router.back()} activeOpacity={0.85}><Ionicons name="arrow-back" size={22} color="#FFF" /></TouchableOpacity>
            </View>
            <View style={{ flex: 1, justifyContent: 'center' }}>
                <EmptyState
                    icon="barbell-outline"
                    title="Exercise not found"
                    subtitle="We couldn't load this exercise. It may have been removed or there was a connection hiccup."
                    actionLabel="Back to Library"
                    onAction={() => router.back()}
                />
            </View>
        </View>
    );
    return (
        <View style={[s.container, { backgroundColor: colors.background.primary }]}>
            <View style={[s.headerRow, { paddingTop: insets.top + 8 }]}>
                <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Go back" style={[s.overlayBtn, { backgroundColor: 'rgba(0,0,0,0.45)' }]} onPress={() => router.back()} activeOpacity={0.85}><Ionicons name="arrow-back" size={22} color="#FFF" /></TouchableOpacity>
                {demoUrl ? (
                    <TouchableOpacity
                        style={[s.overlayBtn, { backgroundColor: 'rgba(0,0,0,0.55)', width: 'auto', paddingHorizontal: 14, flexDirection: 'row', gap: 6 }]}
                        accessibilityRole="link"
                        accessibilityLabel="Watch demo video"
                        onPress={() => Linking.openURL(demoUrl)}
                        activeOpacity={0.85}
                    >
                        <Ionicons name="logo-youtube" size={18} color={colors.accent.red} /><Text style={{ color: '#FFF', fontWeight: '700', fontSize: 12 }}>Watch demo</Text>
                    </TouchableOpacity>
                ) : null}
            </View>
            <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
                <View style={{ width: '100%', height: 320 }}>
                    <Image source={exercise.imageUrl || exercise.image ? { uri: exercise.imageUrl || exercise.image } : FALLBACK_IMAGE} placeholder={FALLBACK_IMAGE} style={{ width: '100%', height: 320 }} contentFit="cover" cachePolicy="memory-disk" transition={400} />
                    <LinearGradient colors={['transparent', 'rgba(0,0,0,0.7)', colors.background.primary]} style={StyleSheet.absoluteFillObject} />
                </View>
                <View style={{ padding: 20, marginTop: -40 }}>
                    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
                        <View style={[s.badge, { backgroundColor: withAlpha(diffColor, 0.15), borderColor: diffColor }]}><Text style={[typography.caption, { color: diffColor, fontWeight: 'bold', fontSize: 10 }]}>{(exercise.difficulty||'N/A').toUpperCase()}</Text></View>
                        {exercise.muscleGroup && <View style={[s.badge, { backgroundColor: withAlpha(colors.accent.cyan, 0.15), borderColor: colors.accent.cyan }]}><Text style={[typography.caption, { color: colors.accent.cyan, fontWeight: 'bold', fontSize: 10 }]}>{exercise.muscleGroup.toUpperCase()}</Text></View>}
                    </View>
                    <Text style={[typography.display, { color: colors.text.primary, fontSize: 28, fontWeight: '900' }]}>{exercise.name}</Text>
                    {exercise.equipment && <Text style={[typography.body, { color: colors.text.secondary, marginTop: 4 }]}>Equipment: {exercise.equipment}</Text>}
                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
                        {[{ icon:'body', label:'Target', value:targetLabel, color:colors.accent.coral },{ icon:'barbell', label:'Equipment', value:exercise.equipment||'None', color:colors.accent.cyan },{ icon:'bar-chart', label:'Level', value:exercise.difficulty||'N/A', color:diffColor }].map((c)=>(
                            <View key={c.label} style={[s.infoCard, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
                                <View style={{ width:40,height:40,borderRadius:20,alignItems:'center',justifyContent:'center',backgroundColor:withAlpha(c.color,0.14) }}><Ionicons name={c.icon as any} size={18} color={c.color} /></View>
                                <Text style={[typography.caption, { color: colors.text.secondary, fontSize: 10, marginTop: 8 }]}>{c.label.toUpperCase()}</Text>
                                <Text style={[typography.caption, { color: colors.text.primary, fontWeight: 'bold', marginTop: 2 }]} numberOfLines={1}>{c.value}</Text>
                            </View>
                        ))}
                    </View>
                    <View style={[s.tabRow, { borderBottomColor: colors.border.default, marginTop: 28 }]}>
                        {TABS.map((tab) => (<TouchableOpacity key={tab.key} activeOpacity={0.85} accessibilityRole="tab" accessibilityState={{ selected: activeTab===tab.key }} accessibilityLabel={tab.label} onPress={() => setActiveTab(tab.key)} style={[s.tab, activeTab===tab.key && { borderBottomColor: colors.accent.coral }]}><Text style={[typography.caption, { color: activeTab===tab.key ? colors.text.primary : colors.text.tertiary, fontWeight:'bold', fontSize:11 }]}>{tab.label.toUpperCase()}</Text></TouchableOpacity>))}
                    </View>
                    <View style={{ marginTop: 20 }}>
                        {activeTab==='howto' && <View style={{ gap:20 }}>{instructions.length===0?<Text style={[typography.body,{color:colors.text.secondary,lineHeight:24}]}>No instructions available.</Text>:isSingleParagraph?<Text style={[typography.body,{color:colors.text.secondary,lineHeight:24}]}>{instructions[0]}</Text>:instructions.map((step:string,idx:number)=>(<View key={idx} style={{ flexDirection:'row',gap:14,alignItems:'flex-start' }}><View style={[s.stepNum,{backgroundColor:withAlpha(colors.accent.coral,0.15),borderColor:withAlpha(colors.accent.coral,0.3)}]}><Text style={[typography.caption,{color:colors.accent.coral,fontWeight:'bold'}]}>{idx+1}</Text></View><Text style={[typography.body,{color:colors.text.secondary,flex:1,lineHeight:24}]}>{step}</Text></View>))}</View>}
                        {activeTab==='muscles' && <View style={[s.sectionCard,{backgroundColor:colors.background.secondary,borderColor:colors.border.default}]}><Text style={[typography.caption,{color:colors.text.secondary,fontWeight:'bold',marginBottom:8}]}>PRIMARY MUSCLES</Text><View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{[exercise.bodyPart, exercise.muscleGroup].filter((v,i,a)=>v&&a.indexOf(v)===i).map((m:string,i:number)=>(<View key={i} style={[s.chip,{backgroundColor:withAlpha(colors.accent.coral,0.15),borderColor:colors.accent.coral}]}><Text style={[typography.caption,{color:colors.accent.coral,fontWeight:'bold'}]}>{m.charAt(0).toUpperCase()+m.slice(1)}</Text></View>))}</View>{secondaryMuscles.length>0 && <><Text style={[typography.caption,{color:colors.text.secondary,fontWeight:'bold',marginTop:18,marginBottom:8}]}>SECONDARY MUSCLES</Text><View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{secondaryMuscles.map((m:string,i:number)=>(<View key={i} style={[s.chip,{backgroundColor:withAlpha(colors.accent.cyan,0.15),borderColor:colors.accent.cyan}]}><Text style={[typography.caption,{color:colors.accent.cyan,fontWeight:'bold'}]}>{m.charAt(0).toUpperCase()+m.slice(1)}</Text></View>))}</View></>}</View>}
                        {activeTab==='tips' && <View style={[s.sectionCard,{backgroundColor:colors.background.secondary,borderColor:colors.border.default}]}><View style={{flexDirection:'row',alignItems:'center',marginBottom:16}}><View style={{width:36,height:36,borderRadius:18,alignItems:'center',justifyContent:'center',backgroundColor:withAlpha(colors.accent.amber,0.15)}}><Ionicons name="bulb" size={20} color={colors.accent.amber} /></View><Text style={[typography.heading,{color:colors.text.primary,marginLeft:12,fontSize:16}]}>{tipsAreGeneral?'Training Tips':"Coach's Tips"}</Text></View>{tips.map((tip,i)=>(<View key={i} style={{flexDirection:'row',gap:10,marginBottom:12}}><View style={{width:6,height:6,borderRadius:3,marginTop:8,backgroundColor:colors.accent.amber}} /><Text style={[typography.body,{color:colors.text.secondary,flex:1,lineHeight:22}]}>{tip}</Text></View>))}</View>}
                        {activeTab==='progress' && (analyticsQuery.isLoading?<View style={[s.sectionCard,{backgroundColor:colors.background.secondary,borderColor:colors.border.default}]}><Skeleton width={180} height={18} radius={6} style={{marginBottom:spacing.xl}} /><Skeleton width="100%" height={180} radius={borderRadius.md} /></View>:analyticsQuery.isError?<EmptyState icon="cloud-offline-outline" title="Couldn't load progress" subtitle="We hit a snag fetching your weight progression. Check your connection and try again." actionLabel="Retry" onAction={()=>analyticsQuery.refetch()} />:chartData.length>0?<View style={[s.sectionCard,{backgroundColor:colors.background.secondary,borderColor:colors.border.default}]}><Text style={[typography.subhead,{color:colors.text.primary,fontWeight:'bold',marginBottom:20}]}>Weight Progression (KG)</Text><LineChart data={chartData} width={width-100} height={180} color={colors.accent.cyan} thickness={3} startFillColor={colors.accent.cyan} startOpacity={0.4} endOpacity={0.1} initialSpacing={20} noOfSections={4} yAxisColor={colors.border.default} xAxisColor={colors.border.default} yAxisTextStyle={{color:colors.text.secondary,fontSize:10}} xAxisLabelTextStyle={{color:colors.text.secondary,fontSize:10}} /></View>:<EmptyState icon="stats-chart-outline" title="No progress yet" subtitle="Log a set of this exercise and your weight progression will start charting here." actionLabel="Log This Exercise" onAction={()=>router.push({pathname:'/training/workout',params:{exercise:exercise.name}})} />)}
                    </View>
                </View>
            </ScrollView>
            <View style={[s.footer,{paddingBottom:Math.max(insets.bottom,20)}]}>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="Log this exercise" style={shadows.glow(colors.accent.coral)} onPress={()=>router.push({pathname:'/training/workout',params:{exercise:exercise.name}})} activeOpacity={0.85}>
                    <LinearGradient colors={colors.gradients.coral} start={{x:0,y:0}} end={{x:1,y:0}} style={s.ctaBtn}>
                        <Ionicons name="add-circle" size={22} color="#FFF" /><Text style={[typography.subhead,{color:'#FFF',fontWeight:'900',marginLeft:8,fontSize:16}]}>LOG THIS EXERCISE</Text>
                    </LinearGradient>
                </TouchableOpacity>
            </View>
        </View>
    );
}
const s = StyleSheet.create({
    container:{flex:1}, headerRow:{position:'absolute',top:0,left:0,right:0,zIndex:10,flexDirection:'row',justifyContent:'space-between',paddingHorizontal:20,paddingBottom:8},
    overlayBtn:{width:40,height:40,borderRadius:20,alignItems:'center',justifyContent:'center'},
    badge:{paddingHorizontal:10,paddingVertical:4,borderRadius:8,borderWidth:1},
    infoCard:{flex:1,borderRadius:14,borderWidth:1,padding:14,alignItems:'center'},
    tabRow:{flexDirection:'row',borderBottomWidth:1}, tab:{paddingVertical:12,marginRight:20,borderBottomWidth:2,borderBottomColor:'transparent'},
    stepNum:{width:30,height:30,borderRadius:15,alignItems:'center',justifyContent:'center',borderWidth:1},
    sectionCard:{borderRadius:14,borderWidth:1,padding:16}, chip:{paddingHorizontal:12,paddingVertical:6,borderRadius:8,borderWidth:1},
    footer:{position:'absolute',bottom:0,left:0,right:0,paddingHorizontal:20},
    ctaBtn:{height:60,flexDirection:'row',alignItems:'center',justifyContent:'center',borderRadius:30},
});
