import React, { useMemo } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme';
import { shadows } from '@/theme/shadows';
import { withAlpha } from '@/theme/utils';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { getProfile } from '@/api/users';
import { getStatus } from '@/api/subscriptions';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuthStore } from '@/store/authStore';
import { useThemeStore } from '@/store/themeStore';
import Constants from 'expo-constants';

export default function SettingsIndexScreen() {
    const { colors, typography, spacing, borderRadius } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();

    const { user } = useAuthStore();
    const { theme, setTheme, isDarkTheme } = useThemeStore();

    const { data: profile } = useQuery({
        queryKey: ['user-profile'],
        queryFn: getProfile,
    });

    // Mirror subscription.tsx's query so the cache is shared. While loading,
    // `subscription` is undefined and the row shows no value (see useMemo below).
    const { data: subscription } = useQuery({
        queryKey: ['subscription-status'],
        queryFn: getStatus,
    });

    const appVersion = Constants.expoConfig?.version ?? '1.0.0';

    type SettingItemType = {
        label: string;
        icon: string;
        route?: string;
        url?: string;
        value?: string | boolean;
        isSwitch?: boolean;
    };

    const SETTINGS_SECTIONS: { title: string; items: SettingItemType[] }[] = useMemo(() => [
        {
            title: 'Account',
            items: [
                { label: 'Edit Profile', icon: 'person-outline', route: '/(tabs)/profile/edit' },
                { label: 'Preferences', icon: 'settings-outline', route: '/(tabs)/profile/preferences' },
                { label: 'Manage Subscription', icon: 'star-outline', route: '/(settings)/subscription', value: subscription?.tier },
            ]
        },
        {
            title: 'App Settings',
            items: [
                { label: 'Notifications', icon: 'notifications-outline', route: '/(settings)/notifications' },
                { label: 'Notification Settings', icon: 'options-outline', route: '/(settings)/notification-preferences' },
                { label: 'Connected Devices', icon: 'watch-outline', route: '/(settings)/devices' }, // Mock route for now
                { label: 'Dark Mode', icon: 'moon-outline', isSwitch: true, value: true },
            ]
        },
        {
            title: 'Support',
            items: [
                { label: 'Help Center', icon: 'help-circle-outline', url: 'https://nightfuel.app/support' },
                { label: 'Terms of Service', icon: 'document-text-outline', url: 'https://nightfuel.app/terms' },
            ]
        }
    ], [subscription?.tier]);

    return (
        <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background.primary }]}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.border.default }]}>
                <TouchableOpacity activeOpacity={0.85} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={{ padding: 4 }}>
                    <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
                </TouchableOpacity>
                <Text style={[typography.heading, { color: colors.text.primary, fontSize: 20 }]}>Settings</Text>
                <View style={{ width: 32 }} />
            </View>

            <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
                {/* Profile Summary */}
                <View style={[styles.profileCard, { borderBottomColor: colors.border.default }]}>
                    <Image
                        source={(profile?.data as any)?.avatarUrl || 'https://i.pravatar.cc/150'}
                        style={[styles.avatar, { borderColor: colors.border.default }]}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                        transition={200}
                    />
                    <View style={{ marginLeft: 16 }}>
                        <Text style={[typography.heading, { color: colors.text.primary, fontSize: 22 }]}>
                            {(profile?.data as any)?.name || user?.name || 'User'}
                        </Text>
                        <Text style={[typography.body, { color: colors.text.secondary }]}>
                            {(profile?.data as any)?.email || user?.email || ''}
                        </Text>
                        <LinearGradient
                            colors={colors.gradients.coral}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={[styles.badge, shadows.glow(colors.accent.coral)]}
                        >
                            <Text style={[typography.overline, { color: colors.text.primary }]}>NightFuel</Text>
                        </LinearGradient>
                    </View>
                </View>

                {/* Settings Sections */}
                {SETTINGS_SECTIONS.map((section, idx) => (
                    <View key={idx} style={{ marginTop: spacing['2xl'] }}>
                        <Text style={[typography.overline, { color: colors.text.secondary, marginLeft: spacing.xl, marginBottom: spacing.sm }]}>
                            {section.title}
                        </Text>
                        <View style={[styles.sectionGroup, shadows.md, { backgroundColor: colors.background.secondary, borderColor: colors.border.default, borderRadius: borderRadius.xl, marginHorizontal: spacing.lg }]}>
                            {section.items.map((item, itemIdx) => (
                                <TouchableOpacity
                                    key={itemIdx}
                                    activeOpacity={0.85}
                                    accessibilityRole={item.isSwitch ? undefined : (item.url ? 'link' : 'button')}
                                    accessibilityLabel={item.label}
                                    accessibilityState={{ disabled: !item.route && !item.url && !item.isSwitch }}
                                    style={[styles.settingItem, itemIdx !== section.items.length - 1 && { borderBottomColor: colors.border.default, borderBottomWidth: 1 }]}
                                    onPress={() => {
                                        if (item.route) router.push(item.route as any);
                                        else if (item.url) Linking.openURL(item.url);
                                    }}
                                    disabled={!item.route && !item.url && !item.isSwitch}
                                >
                                    <View style={styles.itemLeft}>
                                        <Ionicons name={item.icon as any} size={22} color={colors.text.primary} />
                                        <Text style={[typography.body, { color: colors.text.primary, marginLeft: 12, fontWeight: '500' }]}>{item.label}</Text>
                                    </View>

                                    {item.isSwitch ? (
                                        <Switch
                                            accessibilityRole="switch"
                                            accessibilityLabel={item.label}
                                            accessibilityState={{ checked: item.label === 'Dark Mode' ? theme === 'dark' : item.value as boolean }}
                                            value={item.label === 'Dark Mode' ? theme === 'dark' : item.value as boolean}
                                            onValueChange={(val) => {
                                                if (item.label === 'Dark Mode') setTheme(val ? 'dark' : 'light');
                                            }}
                                            trackColor={{ false: colors.border.default, true: colors.accent.coral }}
                                        />
                                    ) : (
                                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                            {item.value && <Text style={[typography.subhead, { color: colors.text.secondary, marginRight: 8 }]}>{item.value}</Text>}
                                            <Ionicons name="chevron-forward" size={20} color={colors.text.tertiary} />
                                        </View>
                                    )}
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>
                ))}

                {/* Logout Button */}
                <TouchableOpacity
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel="Log Out"
                    style={[styles.logoutBtn, shadows.glow(colors.accent.coral), { borderColor: colors.accent.coral, backgroundColor: withAlpha(colors.accent.coral, 0.08), borderRadius: borderRadius.lg, marginHorizontal: spacing.lg }]}
                    onPress={async () => {
                        await useAuthStore.getState().logout();
                        router.replace('/(auth)/login');
                    }}
                >
                    <Text style={[typography.subhead, { color: colors.accent.coral, fontWeight: '700' }]}>Log Out</Text>
                </TouchableOpacity>

                <Text style={[typography.captionMedium, { color: colors.text.secondary, textAlign: 'center', marginTop: spacing['3xl'] }]}>
                    NightFuel v{appVersion}
                </Text>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1 },
    profileCard: { flexDirection: 'row', alignItems: 'center', padding: 24, borderBottomWidth: 1 },
    avatar: { width: 80, height: 80, borderRadius: 40, borderWidth: 2 },
    badge: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 9999, marginTop: 10 },
    sectionGroup: { borderWidth: 1, overflow: 'hidden' },
    settingItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
    itemLeft: { flexDirection: 'row', alignItems: 'center' },
    logoutBtn: { marginTop: 40, padding: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
});
