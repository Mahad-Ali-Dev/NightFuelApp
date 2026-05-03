import React from 'react';
import { Alert, View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, ActivityIndicator, FlatList } from 'react-native';

import { useRouter } from 'expo-router';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAll, markRead, Notification } from '@/api/notifications';

export default function NotificationsScreen() {
    const { colors, typography, spacing, borderRadius } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const queryClient = useQueryClient();

    const { data: notifications, isLoading, refetch } = useQuery({
        queryKey: ['notifications'],
        queryFn: getAll,
    });

    const markReadMutation = useMutation({
        mutationFn: (id: string) => markRead(id),
        onError: (err: any) => { Alert.alert('Error', err?.response?.data?.message ?? err?.message ?? 'Something went wrong'); },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['notifications'] });
        }
    });

    const getIconForType = (type: string) => {
        switch (type) {
            case 'workout': return { name: 'barbell', color: colors.accent.cyan };
            case 'meal': return { name: 'restaurant', color: colors.accent.coral };
            case 'social': return { name: 'people', color: colors.accent.purple };
            case 'system': return { name: 'information-circle', color: colors.accent.amber };
            default: return { name: 'notifications', color: colors.text.secondary };
        }
    };

    const renderItem = ({ item }: { item: Notification }) => {
        const iconConfig = getIconForType(item.type);
        return (
            <TouchableOpacity
                style={[styles.notificationCard, { backgroundColor: item.read ? colors.background.primary : colors.background.secondary, borderBottomColor: colors.border.default }]}
                onPress={() => !item.read && markReadMutation.mutate(item.id)}
            >
                <View style={[styles.iconBox, { backgroundColor: `${iconConfig.color}15` }]}>
                    <Ionicons name={iconConfig.name as any} size={24} color={iconConfig.color} />
                </View>
                <View style={{ flex: 1, marginLeft: 16 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: item.read ? '500' : '700', flex: 1 }]}>
                            {item.title}
                        </Text>
                        {!item.read && <View style={[styles.unreadDot, { backgroundColor: colors.accent.coral }]} />}
                    </View>
                    <Text style={[typography.body, { color: colors.text.secondary, marginTop: 4 }]} numberOfLines={2}>
                        {item.body}
                    </Text>
                    <Text style={[typography.caption, { color: colors.text.tertiary, marginTop: 8 }]}>
                        {new Date(item.createdAt).toLocaleDateString()}
                    </Text>
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background.primary }]}>
            <View style={[styles.header, { borderBottomColor: colors.border.default }]}>
                <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
                    <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
                </TouchableOpacity>
                <Text style={[typography.heading, { color: colors.text.primary, fontSize: 20 }]}>Notifications</Text>
                <TouchableOpacity onPress={() => refetch()}>
                    <Ionicons name="refresh" size={24} color={colors.text.secondary} />
                </TouchableOpacity>
            </View>

            {isLoading ? (
                <View style={styles.center}>
                    <ActivityIndicator color={colors.accent.purple} size="large" />
                </View>
            ) : (
                <FlatList
                    data={notifications || []}
                    keyExtractor={item => item.id}
                    renderItem={renderItem}
                    contentContainerStyle={{ paddingBottom: 100 }}
                    ListEmptyComponent={
                        <View style={styles.empty}>
                            <Ionicons name="notifications-off-outline" size={48} color={colors.text.tertiary} />
                            <Text style={[typography.subhead, { color: colors.text.secondary, marginTop: 16 }]}>No notifications yet.</Text>
                        </View>
                    }
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    notificationCard: { flexDirection: 'row', padding: 20, borderBottomWidth: 1 },
    iconBox: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
    unreadDot: { width: 8, height: 8, borderRadius: 4, marginLeft: 8, marginTop: 4 },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: 100 },
});
