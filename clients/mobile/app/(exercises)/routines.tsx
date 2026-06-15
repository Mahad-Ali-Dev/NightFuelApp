import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, RefreshControl, Modal, FlatList, Platform } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createRoutine, searchLibrary, Exercise } from '@/api/exercises';
import { useWorkout } from '@/hooks/useWorkout';
import { withAlpha } from '@/theme/utils';
import { LinearGradient } from 'expo-linear-gradient';
import { shadows } from '@/theme/shadows';
import { Skeleton, EmptyState } from '@/components/ui';
export default function RoutinesScreen() {
    const { colors, typography, borderRadius } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const qc = useQueryClient();
    const { routines, isLoadingRoutines, isErrorRoutines, refetchRoutines } = useWorkout();
    const [showCreate, setShowCreate] = useState(false);
    const [newName, setNewName] = useState('');
    const [selEx, setSelEx] = useState<Array<{name:string;sets:number;reps:number}>>([]);
    const [showPicker, setShowPicker] = useState(false);
    const [sq, setSq] = useState('');
    const { data: sr, isLoading: isSrch, isError: isSrchErr, refetch: refetchSrch } = useQuery({ queryKey:['ex-search',sq], queryFn:()=>searchLibrary(sq), enabled:showPicker&&sq.length>1 });
    const createM = useMutation({
        mutationFn:()=>createRoutine({title:newName,exercises:selEx}),
        onSuccess:()=>{ qc.invalidateQueries({queryKey:['workout-routines']}); qc.invalidateQueries({queryKey:['routines']}); setShowCreate(false); setNewName(''); setSelEx([]); },
        onError:(err:any)=>Alert.alert('Error', err?.response?.data?.message??'Failed to create.'),
    });
    const addEx = useCallback((ex:Exercise) => { if(selEx.find(e=>e.name===ex.name)) return; setSelEx([...selEx,{name:ex.name,sets:3,reps:10}]); setShowPicker(false); }, [selEx]);
    const pickerKeyExtractor = useCallback((i:Exercise)=>i.id, []);
    const renderPickerItem = useCallback(({item}:{item:Exercise})=>(
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Add ${item.name}`} style={[s.pickerItem,{borderBottomColor:colors.border.default}]} onPress={()=>addEx(item)} activeOpacity={0.85}>
            <View style={{flex:1}}><Text style={[typography.subhead,{color:colors.text.primary,fontWeight:'bold'}]}>{item.name}</Text><Text style={[typography.caption,{color:colors.text.secondary}]}>{item.muscleGroup}</Text></View>
            <Ionicons name="add-circle" size={24} color={colors.accent.cyan} />
        </TouchableOpacity>
    ), [colors, typography, addEx]);
    return (
        <View style={[s.container,{backgroundColor:colors.background.primary}]}>
            <View style={[s.header,{paddingTop:insets.top+16,borderBottomColor:colors.border.default}]}>
                <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Go back" onPress={()=>router.back()}><Ionicons name="arrow-back" size={24} color={colors.text.primary} /></TouchableOpacity>
                <Text style={[typography.heading,{color:colors.text.primary,fontSize:20}]}>Workout Routines</Text>
                <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Add" style={shadows.glow(colors.accent.coral)} onPress={()=>setShowCreate(true)} activeOpacity={0.85}>
                    <LinearGradient colors={colors.gradients.coral} start={{x:0,y:0}} end={{x:1,y:1}} style={s.addBtn}><Ionicons name="add" size={20} color="#FFF" /></LinearGradient>
                </TouchableOpacity>
            </View>
            {/* AI Planner Banner */}
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Generate with Ria AI" style={[s.aiBanner,{marginHorizontal:20,marginTop:16,backgroundColor:withAlpha(colors.accent.purple,0.1),borderColor:withAlpha(colors.accent.purple,0.3)}]} onPress={()=>router.push('/(exercises)/ai-planner' as any)} activeOpacity={0.85}>
                <View style={[s.aiIcon,{backgroundColor:withAlpha(colors.accent.purple,0.2)}]}><Ionicons name="sparkles" size={22} color={colors.accent.purple} /></View>
                <View style={{flex:1,marginLeft:14}}>
                    <Text style={[typography.subhead,{color:colors.accent.purple,fontWeight:'800'}]}>Generate with Ria AI</Text>
                    <Text style={[typography.caption,{color:colors.text.secondary,marginTop:2}]}>Let Coach Ria build a personalized routine for your goals</Text>
                </View>
                <Ionicons name="arrow-forward" size={20} color={colors.accent.purple} />
            </TouchableOpacity>
            <ScrollView contentContainerStyle={{paddingBottom:100,paddingTop:12}} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={isLoadingRoutines} onRefresh={()=>qc.invalidateQueries({queryKey:['workout-routines']})} tintColor={colors.accent.coral} />}>
                {(routines.length>0||isLoadingRoutines)&&(
                    <View style={{padding:20}}>
                        <Text style={[typography.heading,{color:colors.text.primary,marginBottom:16}]}>My Routines</Text>
                        {isLoadingRoutines?[0,1,2].map((i)=>(<Skeleton key={i} width="100%" height={68} radius={borderRadius.xl} style={{marginBottom:12}} />)):routines.map((r:any,idx:number)=>{
                            const c=[colors.accent.coral,colors.accent.cyan,colors.accent.emerald,colors.accent.purple][idx%4]!;
                            return (
                                <TouchableOpacity key={r.id||idx} accessibilityRole="button" accessibilityLabel={r.name||r.title} style={[s.myCard,{backgroundColor:colors.background.secondary,borderColor:colors.border.default}]} onPress={()=>router.push({pathname:'/training/onboarding',params:{routineId:r.id}})} activeOpacity={0.85}>
                                    <View style={[s.colorBar,{backgroundColor:c}]} />
                                    <View style={{flex:1,paddingLeft:16}}>
                                        <Text style={[typography.heading,{color:colors.text.primary,fontSize:17}]}>{r.name||r.title}</Text>
                                        <Text style={[typography.caption,{color:colors.text.secondary,marginTop:2}]}>{r.exercises?.length||0} exercises</Text>
                                    </View>
                                    <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Start ${r.name||r.title}`} style={[s.startBtn,{backgroundColor:c}]} onPress={()=>router.push({pathname:'/training/workout',params:{routineId:r.id}})}>
                                        <Text style={[typography.caption,{color:'#FFF',fontWeight:'bold',fontSize:11}]}>START</Text>
                                    </TouchableOpacity>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                )}
                {!isLoadingRoutines&&isErrorRoutines&&(
                    <EmptyState
                        icon="cloud-offline-outline"
                        title="Couldn't load routines"
                        subtitle="We couldn't reach your routines. Check your connection and try again."
                        actionLabel="Retry"
                        onAction={()=>refetchRoutines()}
                    />
                )}
                {!isLoadingRoutines&&!isErrorRoutines&&routines.length===0&&(
                    <EmptyState
                        icon="barbell-outline"
                        title="No routines yet"
                        subtitle="Build a routine of your favorite exercises, or let Coach Ria generate one for your goals."
                        actionLabel="Create Your First Routine"
                        onAction={()=>setShowCreate(true)}
                    />
                )}
            </ScrollView>
            <Modal visible={showCreate} animationType="slide" transparent>
                <View style={[s.createOverlay,{backgroundColor:colors.background.primary,paddingTop:insets.top}]}>
                    <View style={[s.createHeader,{borderBottomColor:colors.border.default}]}>
                        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Cancel" onPress={()=>setShowCreate(false)}><Text style={[typography.body,{color:colors.text.secondary}]}>Cancel</Text></TouchableOpacity>
                        <Text style={[typography.heading,{color:colors.text.primary}]}>New Routine</Text>
                        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Save" accessibilityState={{ disabled: !newName||selEx.length===0||createM.isPending }} onPress={()=>createM.mutate()} disabled={!newName||selEx.length===0||createM.isPending}><Text style={[typography.body,{color:(!newName||selEx.length===0)?colors.text.tertiary:colors.accent.coral,fontWeight:'bold'}]}>Save</Text></TouchableOpacity>
                    </View>
                    <ScrollView style={{flex:1,padding:20}}>
                        <TextInput style={[s.input,{color:colors.text.primary,backgroundColor:colors.background.secondary,borderColor:colors.border.default}]} placeholder="Routine name..." placeholderTextColor={colors.text.tertiary} value={newName} onChangeText={setNewName} />
                        <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:28,marginBottom:16}}>
                            <Text style={[typography.heading,{color:colors.text.primary,fontSize:16}]}>Exercises</Text>
                            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Add exercise" onPress={()=>setShowPicker(true)}><Text style={[typography.caption,{color:colors.accent.cyan,fontWeight:'bold'}]}>+ ADD</Text></TouchableOpacity>
                        </View>
                        {selEx.map((ex,idx)=>(<View key={idx} style={[s.selRow,{backgroundColor:colors.background.secondary,borderColor:colors.border.default}]}><View style={{flex:1}}><Text style={[typography.subhead,{color:colors.text.primary,fontWeight:'bold'}]}>{ex.name}</Text><Text style={[typography.caption,{color:colors.text.secondary}]}>{ex.sets}x{ex.reps}</Text></View><TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Delete" onPress={()=>setSelEx(selEx.filter(e=>e.name!==ex.name))}><Ionicons name="trash-outline" size={20} color={colors.accent.coral} /></TouchableOpacity></View>))}
                    </ScrollView>
                </View>
            </Modal>
            <Modal visible={showPicker} animationType="slide" transparent>
                <View style={[s.pickerOverlay,{backgroundColor:'rgba(0,0,0,0.8)'}]}>
                    <View style={[s.pickerContent,{backgroundColor:colors.background.primary}]}>
                        <View style={[s.pickerHead,{borderBottomColor:colors.border.default}]}>
                            <Text style={[typography.heading,{color:colors.text.primary}]}>Select Exercise</Text>
                            <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Close" onPress={()=>setShowPicker(false)}><Ionicons name="close" size={24} color={colors.text.primary} /></TouchableOpacity>
                        </View>
                        <TextInput style={[s.pickerSearch,{color:colors.text.primary,backgroundColor:colors.background.secondary}]} placeholder="Search..." placeholderTextColor={colors.text.tertiary} value={sq} onChangeText={setSq} autoFocus />
                        {isSrch?<View style={{marginTop:8}}>{[0,1,2,3,4].map((i)=>(
                            <View key={i} style={[s.pickerItem,{borderBottomColor:colors.border.default}]}>
                                <View style={{flex:1}}>
                                    <Skeleton width="55%" height={16} radius={6} />
                                    <Skeleton width="35%" height={12} radius={6} style={{marginTop:8}} />
                                </View>
                                <Skeleton width={24} height={24} radius={12} />
                            </View>
                          ))}</View>:(isSrchErr&&sq.length>1)?(
                            <EmptyState
                                icon="cloud-offline-outline"
                                title="Search failed"
                                subtitle="Couldn't reach the exercise library. Check your connection and try again."
                                actionLabel="Try Again"
                                onAction={()=>refetchSrch()}
                            />
                          ):(
                            <FlatList data={sr} keyExtractor={pickerKeyExtractor} renderItem={renderPickerItem} removeClippedSubviews={Platform.OS === 'android'} initialNumToRender={10} maxToRenderPerBatch={10} windowSize={7} ListEmptyComponent={<View style={{padding:40,alignItems:'center'}}><Text style={[typography.caption,{color:colors.text.secondary}]}>{sq.length>1?'No results':'Start typing...'}</Text></View>} />
                        )}
                    </View>
                </View>
            </Modal>
        </View>
    );
}
const s = StyleSheet.create({
    container:{flex:1}, header:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingHorizontal:20,paddingBottom:16,borderBottomWidth:1},
    addBtn:{width:36,height:36,borderRadius:18,alignItems:'center',justifyContent:'center'},
    myCard:{flexDirection:'row',alignItems:'center',borderRadius:16,borderWidth:1,marginBottom:12,overflow:'hidden',minHeight:68},
    colorBar:{width:4,alignSelf:'stretch'}, startBtn:{paddingHorizontal:14,paddingVertical:8,borderRadius:20,marginRight:16},
    tag:{flexDirection:'row',alignItems:'center',paddingHorizontal:8,paddingVertical:4,borderRadius:6,borderWidth:1},
    aiBanner:{flexDirection:'row',alignItems:'center',borderWidth:1.5,borderRadius:16,padding:14,marginBottom:8},
    aiIcon:{width:40,height:40,borderRadius:20,alignItems:'center',justifyContent:'center'},
    createOverlay:{flex:1}, createHeader:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingHorizontal:20,paddingBottom:16,borderBottomWidth:1},
    input:{height:56,paddingHorizontal:16,fontSize:16,borderWidth:1,borderRadius:12},
    selRow:{flexDirection:'row',alignItems:'center',padding:14,marginBottom:10,borderRadius:12,borderWidth:1},
    pickerOverlay:{flex:1,justifyContent:'flex-end'}, pickerContent:{height:'80%',borderTopLeftRadius:28,borderTopRightRadius:28,padding:24},
    pickerHead:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:16,paddingBottom:16,borderBottomWidth:1},
    pickerSearch:{height:50,paddingHorizontal:16,marginBottom:16,fontSize:15,borderRadius:12},
    pickerItem:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingVertical:14,borderBottomWidth:1},
});
