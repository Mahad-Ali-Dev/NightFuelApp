import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { searchLibrary, Exercise } from '@/api/exercises';
import { LinearGradient } from 'expo-linear-gradient';
import { withAlpha } from '@/theme/utils';
const MUSCLE_GROUPS = [
    { id:'chest', label:'Chest', searchKey:'chest', color:'#FF6B35', image:'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=400&auto=format&fit=crop&q=80' },
    { id:'back', label:'Back', searchKey:'back', color:'#00D4FF', image:'https://images.unsplash.com/photo-1526506118085-60ce8714f8c5?w=400&auto=format&fit=crop&q=80' },
    { id:'shoulders', label:'Shoulders', searchKey:'shoulders', color:'#A855F7', image:'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400&auto=format&fit=crop&q=80' },
    { id:'arms', label:'Arms', searchKey:'upper arms', color:'#F59E0B', image:'https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?w=400&auto=format&fit=crop&q=80' },
    { id:'core', label:'Core & Abs', searchKey:'waist', color:'#2ECC71', image:'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=400&auto=format&fit=crop&q=80' },
    { id:'legs', label:'Legs', searchKey:'upper legs', color:'#EF4444', image:'https://images.unsplash.com/photo-1434682772747-f16d3ea162c3?w=400&auto=format&fit=crop&q=80' },
    { id:'glutes', label:'Glutes', searchKey:'hips', color:'#EC4899', image:'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=400&auto=format&fit=crop&q=80' },
    { id:'cardio', label:'Cardio', searchKey:'cardio', color:'#06B6D4', image:'https://images.unsplash.com/photo-1538805060514-97d9cc17730c?w=400&auto=format&fit=crop&q=80' },
];
const STRETCHING = [
    { id:'s-upper', label:'Upper Body Stretch', searchKey:'stretch chest', color:'#A855F7', image:'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=400&auto=format&fit=crop&q=80' },
    { id:'s-lower', label:'Lower Body Stretch', searchKey:'stretch legs', color:'#2ECC71', image:'https://images.unsplash.com/photo-1552196563-55cd4e45efb3?w=400&auto=format&fit=crop&q=80' },
    { id:'s-yoga', label:'Yoga & Mobility', searchKey:'yoga', color:'#F59E0B', image:'https://images.unsplash.com/photo-1599901860904-17e6ed7083a0?w=400&auto=format&fit=crop&q=80' },
];
type T = 'muscles'|'stretching';
export default function MuscleMapScreen() {
    const { colors, typography } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const [tab, setTab] = useState<T>('muscles');
    const [selectedId, setSelectedId] = useState<string|null>(null);
    const items = tab==='muscles' ? MUSCLE_GROUPS : STRETCHING;
    const sel = items.find(m=>m.id===selectedId);
    const exQ = useQuery({ queryKey:['muscle-ex',sel?.searchKey], queryFn:()=>searchLibrary(sel!.searchKey), enabled:!!sel });
    const exercises = (exQ.data??[]) as Exercise[];
    return (
        <View style={[s.container,{backgroundColor:colors.background.primary}]}>
            <View style={[s.header,{paddingTop:insets.top+16,borderBottomColor:colors.border.default}]}>
                <TouchableOpacity onPress={()=>router.back()}><Ionicons name="arrow-back" size={24} color={colors.text.primary} /></TouchableOpacity>
                <Text style={[typography.heading,{color:colors.text.primary,fontSize:20}]}>Muscle Groups</Text>
                <View style={{width:24}} />
            </View>
            <View style={[s.switcher,{backgroundColor:colors.background.secondary,margin:20,marginBottom:4}]}>
                {(['muscles','stretching'] as T[]).map((t)=>(
                    <TouchableOpacity key={t} style={[s.switchBtn, tab===t&&{backgroundColor:colors.accent.coral}]} onPress={()=>{setTab(t);setSelectedId(null);}}>
                        <Text style={[typography.caption,{color:tab===t?'#FFF':colors.text.tertiary,fontWeight:'bold'}]}>{t.toUpperCase()}</Text>
                    </TouchableOpacity>
                ))}
            </View>
            <ScrollView contentContainerStyle={{padding:20,paddingBottom:100}} showsVerticalScrollIndicator={false}>
                <View style={{gap:10}}>
                    {items.map((m)=>{
                        const isSel = selectedId===m.id;
                        return (
                            <TouchableOpacity key={m.id} style={[s.card, isSel&&{borderColor:m.color,borderWidth:2}]} activeOpacity={0.85} onPress={()=>setSelectedId(isSel?null:m.id)}>
                                <Image source={{uri:m.image}} style={StyleSheet.absoluteFillObject} contentFit="cover" />
                                <LinearGradient colors={[isSel?withAlpha(m.color,0.5):'transparent','rgba(0,0,0,0.8)']} style={StyleSheet.absoluteFillObject} />
                                {isSel&&<View style={[s.chk,{backgroundColor:m.color}]}><Ionicons name="checkmark" size={12} color="#FFF" /></View>}
                                <View style={s.cardContent}>
                                    <View style={[s.bar,{backgroundColor:m.color}]} />
                                    <View style={{flex:1,marginLeft:10}}>
                                        <Text style={[typography.subhead,{color:'#FFF',fontWeight:'bold'}]}>{m.label}</Text>
                                    </View>
                                    <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.5)" />
                                </View>
                            </TouchableOpacity>
                        );
                    })}
                </View>
                {sel&&(
                    <View style={{marginTop:24}}>
                        <Text style={[typography.heading,{color:colors.text.primary,marginBottom:14}]}>{sel.label} Exercises</Text>
                        {exQ.isLoading?<ActivityIndicator color={sel.color} style={{marginTop:20}} />:exercises.length===0?<Text style={[typography.body,{color:colors.text.tertiary,textAlign:'center',paddingVertical:20}]}>No exercises found</Text>:exercises.slice(0,6).map((ex)=>(
                            <TouchableOpacity key={ex.id} style={[s.exRow,{backgroundColor:colors.background.secondary,borderColor:colors.border.default}]} onPress={()=>router.push(`/(exercises)/${ex.id}` as any)} activeOpacity={0.8}>
                                <Image source={{uri:ex.imageUrl||'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=200&auto=format&fit=crop&q=60'}} style={s.exThumb} contentFit="cover" />
                                <View style={{flex:1,marginLeft:12}}>
                                    <Text style={[typography.subhead,{color:colors.text.primary,fontWeight:'bold'}]}>{ex.name}</Text>
                                    <Text style={[typography.caption,{color:colors.text.tertiary}]}>{ex.equipment} • {ex.difficulty}</Text>
                                </View>
                                <Ionicons name="chevron-forward" size={16} color={colors.text.tertiary} />
                            </TouchableOpacity>
                        ))}
                    </View>
                )}
            </ScrollView>
        </View>
    );
}
const s = StyleSheet.create({
    container:{flex:1}, header:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:20,paddingBottom:16,borderBottomWidth:1},
    switcher:{flexDirection:'row',borderRadius:14,padding:4}, switchBtn:{flex:1,paddingVertical:10,borderRadius:10,alignItems:'center'},
    card:{height:72,borderRadius:16,overflow:'hidden',justifyContent:'flex-end',borderWidth:1,borderColor:'transparent'},
    chk:{position:'absolute',top:8,right:8,width:22,height:22,borderRadius:11,alignItems:'center',justifyContent:'center'},
    cardContent:{flexDirection:'row',alignItems:'center',padding:14}, bar:{width:4,height:32,borderRadius:2},
    exRow:{flexDirection:'row',alignItems:'center',padding:12,marginBottom:10,borderRadius:14,borderWidth:1},
    exThumb:{width:52,height:52,borderRadius:10},
});
