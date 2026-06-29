/**
 * ExerciseRail — a horizontal slider of real exercises with their demo images
 * that tap through to the exercise detail (how to perform), the same flow as the
 * coach day. Self-fetches via searchLibrary, quality-ranks (reuses the coach
 * selector so staples beat stretches), and shows only image-backed moves. Drop
 * onto Home / Train with a title + optional bodyPart/gender filter.
 */
import React, { useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme';
import { safeImageUri } from '@/lib/imageUrl';
import { searchLibrary } from '@/api/exercises';
import { getMyProfile } from '@/api/profile';
import { rankExercises } from '@/features/coach/select';

export function ExerciseRail({
    title,
    bodyPart,
    gender,
    count = 10,
}: {
    title: string;
    bodyPart?: string;
    gender?: 'Male' | 'Female';
    count?: number;
}) {
    const { colors, typography } = useTheme();
    const router = useRouter();

    // Resolve the viewer's gender from their profile so the rail never shows
    // male-only moves to a female user (or vice versa). An explicit `gender` prop
    // wins; otherwise map biologicalSex → Male/Female (unknown → no filter, which
    // the backend treats as "all + unisex"). Wait for the profile so we don't
    // flash an unfiltered list.
    const profileQuery = useQuery({ queryKey: ['my-profile'], queryFn: getMyProfile, retry: 1, staleTime: 5 * 60 * 1000 });
    const bio = (profileQuery.data as any)?.biologicalSex;
    const resolvedGender: 'Male' | 'Female' | undefined =
        gender ?? (bio === 'MALE' ? 'Male' : bio === 'FEMALE' ? 'Female' : undefined);

    const { data } = useQuery({
        queryKey: ['exercise-rail', bodyPart ?? 'all', resolvedGender ?? 'any'],
        queryFn: () => searchLibrary({ bodyPart, gender: resolvedGender, limit: 60 }),
        enabled: !profileQuery.isLoading,
        staleTime: 10 * 60 * 1000,
        retry: 1,
    });

    const items = useMemo(
        () => rankExercises((data ?? []).filter((e) => !!e.imageUrl)).slice(0, count),
        [data, count],
    );

    if (items.length === 0) return null;

    return (
        <View style={st.wrap}>
            <View style={st.head}>
                <Text style={[typography.subtitle, { color: colors.text.primary, fontSize: 16 }]}>{title}</Text>
                <TouchableOpacity
                    onPress={() => router.push('/(exercises)/gender' as any)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel="See all exercises"
                >
                    <Text style={[typography.caption, { color: colors.accent.lime, fontWeight: '600' }]}>See all</Text>
                </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.rail}>
                {items.map((e) => {
                    const uri = safeImageUri(e.imageUrl);
                    return (
                        <TouchableOpacity
                            key={e.id}
                            activeOpacity={0.85}
                            accessibilityRole="button"
                            accessibilityLabel={`How to perform ${e.name}`}
                            onPress={() => router.push({ pathname: '/(exercises)/[id]', params: { id: e.id } } as any)}
                            style={[st.card, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}
                        >
                            <View style={st.thumb}>
                                {uri ? (
                                    <Image source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" cachePolicy="memory-disk" transition={150} />
                                ) : (
                                    <Ionicons name="barbell" size={26} color="#3A4150" />
                                )}
                            </View>
                            <Text style={[st.name, { color: colors.text.primary }]} numberOfLines={2}>{e.name}</Text>
                            {e.bodyPart ? <Text style={[st.meta, { color: colors.text.secondary }]} numberOfLines={1}>{e.bodyPart}</Text> : null}
                        </TouchableOpacity>
                    );
                })}
            </ScrollView>
        </View>
    );
}

const st = StyleSheet.create({
    wrap: { marginTop: 18 },
    head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 12 },
    rail: { paddingHorizontal: 16, gap: 12 },
    card: { width: 136, borderRadius: 14, borderWidth: 1, overflow: 'hidden', paddingBottom: 9 },
    thumb: { width: '100%', height: 104, backgroundColor: '#EDEFF3', alignItems: 'center', justifyContent: 'center' },
    name: { fontSize: 13, fontWeight: '600', marginTop: 8, marginHorizontal: 9, lineHeight: 17 },
    meta: { fontSize: 11, marginTop: 2, marginHorizontal: 9, textTransform: 'capitalize' },
});
