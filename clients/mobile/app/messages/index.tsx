import React from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getConversations } from '@/api/chat';
import { formatDistanceToNow } from 'date-fns';

export default function MessagesListScreen() {
    const { colors, typography, borderRadius } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();

    const { data: conversations, isLoading } = useQuery({
        queryKey: ['conversations'],
        queryFn: getConversations,
    });

    return (
        <View style={[styles.container, { backgroundColor: colors.background.primary, paddingTop: insets.top }]}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.border.default }]}>
                <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
                    <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
                </TouchableOpacity>
                <Text style={[typography.heading, { color: colors.text.primary, fontSize: 18 }]}>Messages</Text>
                <View style={{ width: 32 }} />
            </View>

            {/* List */}
            {isLoading ? (
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <ActivityIndicator size="large" color={colors.accent.purple} />
                </View>
            ) : !conversations || conversations.length === 0 ? (
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 }}>
                    <Ionicons name="chatbubbles-outline" size={60} color={colors.text.tertiary} />
                    <Text style={[typography.heading, { color: colors.text.secondary, marginTop: 16 }]}>No messages yet</Text>
                    <Text style={[typography.body, { color: colors.text.tertiary, textAlign: 'center', marginTop: 8 }]}>Start a conversation from someone's profile.</Text>
                </View>
            ) : (
                <FlatList
                    data={conversations}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={{ padding: 16 }}
                    renderItem={({ item }) => (
                        <TouchableOpacity
                            style={[styles.chatRow, { backgroundColor: colors.background.secondary, borderBottomColor: colors.border.default }]}
                            onPress={() => router.push(`/messages/${item.targetId}` as any)}
                        >
                            <View style={[styles.avatar, { backgroundColor: colors.background.tertiary }]}>
                                <Ionicons name="person" size={24} color={colors.text.secondary} />
                            </View>
                            <View style={styles.chatInfo}>
                                <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: 'bold' }]}>User {item.targetId.slice(0, 4)}</Text>
                                <Text style={[typography.caption, { color: colors.text.tertiary, marginTop: 4 }]} numberOfLines={1}>
                                    Tap to view chat history...
                                </Text>
                            </View>
                            <Text style={[typography.caption, { color: colors.text.tertiary }]}>
                                {formatDistanceToNow(new Date(item.updatedAt))} ago
                            </Text>
                        </TouchableOpacity>
                    )}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, height: 56, borderBottomWidth: 1 },
    chatRow: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 16, marginBottom: 12 },
    avatar: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
    chatInfo: { flex: 1, marginLeft: 16, marginRight: 12 },
});
