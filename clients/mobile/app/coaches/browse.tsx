import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { useTheme } from '@/theme';
import { Card } from '@/components/ui/Card';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { getCoachDirectory } from '@/api/chat';
import { useRouter } from 'expo-router';

export default function CoachesBrowseScreen() {
    const { colors, typography, spacing, borderRadius } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();

    const { data: coaches, isLoading } = useQuery({
        queryKey: ['coach-directory'],
        queryFn: getCoachDirectory,
    });

    return (
        <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background.primary }]}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
                    <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
                </TouchableOpacity>
                <Text style={[typography.heading, { color: colors.text.primary, fontSize: 20 }]}>Find a Coach</Text>
                <View style={{ width: 32 }} />
            </View>

            {isLoading ? (
                <View style={styles.center}>
                    <ActivityIndicator color={colors.accent.cyan} size="large" />
                </View>
            ) : (
                <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 100 }}>
                    <Text style={[typography.body, { color: colors.text.secondary, marginBottom: 24 }]}>
                        Connect with specialized coaches to optimize your performance, nutrition, and shift work transitions.
                    </Text>

                    {coaches?.map((coach: any) => (
                        <Card key={coach.id} style={[styles.coachCard, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
                            <View style={styles.coachHeader}>
                                <View style={[styles.avatar, { borderColor: colors.accent.cyan }]}>
                                    {coach.avatarUrl ? (
                                        <Image source={{ uri: coach.avatarUrl }} style={styles.avatarImg} />
                                    ) : (
                                        <Text style={[typography.heading, { color: colors.accent.cyan, fontSize: 24 }]}>{coach.name[0]}</Text>
                                    )}
                                </View>
                                <View style={{ flex: 1, marginLeft: 16 }}>
                                    <Text style={[typography.subhead, { color: colors.text.primary, fontSize: 18 }]}>{coach.name}</Text>
                                    <Text style={[typography.caption, { color: colors.accent.cyan, marginTop: 4 }]}>{coach.speciality}</Text>
                                    <View style={styles.statsRow}>
                                        <Ionicons name="star" size={14} color={colors.accent.amber} />
                                        <Text style={[typography.caption, { color: colors.text.primary, marginLeft: 4 }]}>{coach.rating?.toFixed(1) || '5.0'}</Text>
                                        <Text style={[typography.caption, { color: colors.text.tertiary, marginLeft: 8 }]}>• {coach.clients || 0} active clients</Text>
                                    </View>
                                </View>
                            </View>

                            <View style={{ flexDirection: 'row', marginTop: 20, gap: 12 }}>
                                <TouchableOpacity
                                    style={[styles.actionBtn, { flex: 1, backgroundColor: 'transparent', borderColor: colors.border.default }]}
                                >
                                    <Text style={[typography.subhead, { color: colors.text.primary }]}>View Profile</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.actionBtn, { flex: 1, backgroundColor: colors.accent.cyan, borderColor: colors.accent.cyan }]}
                                    onPress={() => router.push(`/messages/${coach.id}` as any)}
                                >
                                    <Ionicons name="chatbubble-outline" size={18} color="#000" style={{ marginRight: 8 }} />
                                    <Text style={[typography.subhead, { color: '#000', fontWeight: '700' }]}>Message</Text>
                                </TouchableOpacity>
                            </View>
                        </Card>
                    ))}

                    {(!coaches || coaches.length === 0) && (
                        <View style={{ alignItems: 'center', marginTop: 40 }}>
                            <Ionicons name="search-outline" size={48} color={colors.text.tertiary} />
                            <Text style={[typography.subhead, { color: colors.text.secondary, marginTop: 16 }]}>No coaches available right now.</Text>
                        </View>
                    )}
                </ScrollView>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 16 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    coachCard: { padding: 20, marginBottom: 16, borderWidth: 1 },
    coachHeader: { flexDirection: 'row', alignItems: 'center' },
    avatar: { width: 64, height: 64, borderRadius: 32, borderWidth: 2, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.05)' },
    avatarImg: { width: '100%', height: '100%', borderRadius: 32 },
    statsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
    actionBtn: { flexDirection: 'row', height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
