import React from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { getProfile } from '@/api/users';
import { Image } from 'expo-image';
import { useAuthStore } from '@/store/authStore';
import { useThemeStore } from '@/store/themeStore';
import Constants from 'expo-constants';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { GlassCard } from '@/components/ui';
import { withAlpha } from '@/theme/utils';
import { TAB_BAR_H } from './_layout';

type SettingItemType = {
    label: string;
    icon: string;
    route?: string;
    value?: string | boolean;
    isSwitch?: boolean;
};

// Static settings layout — hoisted to module scope so it isn't rebuilt on every
// render. (The Dark Mode switch state is derived from the theme store at render.)
const SETTINGS_SECTIONS: { title: string; items: SettingItemType[] }[] = [
    {
        title: 'Account',
        items: [
            { label: 'My Profile & Preferences', icon: 'person-circle-outline', route: '/(tabs)/profile' },
            { label: 'Manage Subscription', icon: 'star-outline', route: '/(settings)/subscription', value: 'Pro Tier' },
        ]
    },
    {
        title: 'Insights & Tools',
        items: [
            { label: 'Analytics Dashboard', icon: 'stats-chart-outline', route: '/(tabs)/analytics' },
            { label: 'Achievements & Badges', icon: 'trophy-outline', route: '/(community)/achievements' },
            { label: 'AI Workout Planner', icon: 'sparkles-outline', route: '/(exercises)/ai-planner' },
            { label: 'Calculators (1RM & Macros)', icon: 'calculator-outline', route: '/(exercises)/calculator' },
        ]
    },
    {
        title: 'App Settings',
        items: [
            { label: 'Notification Settings', icon: 'notifications-outline', route: '/(settings)/notification-preferences' },
            { label: 'Notification History', icon: 'list-outline', route: '/(settings)/notifications' },
            { label: 'Connected Devices', icon: 'watch-outline', route: '/(settings)/devices' },
            { label: 'Dark Mode', icon: 'moon-outline', isSwitch: true, value: true },
        ]
    },
    {
        title: 'Support',
        items: [
            { label: 'Help Center', icon: 'help-circle-outline' },
            { label: 'Terms of Service', icon: 'document-text-outline' },
        ]
    }
];

export default function MoreScreen() {
    const { colors, typography, spacing, borderRadius, shadows } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();

    const { user } = useAuthStore();
    const { theme, setTheme } = useThemeStore();

    const { data: profile } = useQuery({
        queryKey: ['user-profile'],
        queryFn: getProfile,
    });

    const appVersion = Constants.expoConfig?.version ?? '1.0.0';

    return (
        <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background.primary }]}>
            <StatusBar style="light" translucent backgroundColor="transparent" />

            {/* Header */}
            <View style={styles.header}>
                <Text style={[typography.display, { color: colors.text.primary }]}>More</Text>
            </View>

            <ScrollView
                contentContainerStyle={{ paddingBottom: TAB_BAR_H + 40, paddingTop: spacing.sm }}
                showsVerticalScrollIndicator={false}
            >
                {/* Profile Summary — shared glass hero with coral→pink brand ring + pink glow */}
                <GlassCard radius={24} glow={colors.accent.pink} style={{ marginHorizontal: spacing.md }}>
                    <View style={styles.profileInner}>
                        {/* Warm wash layered inside GlassCard, above its blur fill, below the row content */}
                        <LinearGradient
                            colors={[withAlpha(colors.accent.coral, 0.10), withAlpha(colors.accent.pink, 0.04)]}
                            style={StyleSheet.absoluteFillObject}
                            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                            pointerEvents="none"
                        />
                        <LinearGradient
                            colors={colors.gradients.coral}
                            style={[styles.avatarRing, shadows.glow(colors.accent.pink)]}
                            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                        >
                            <Image
                                source={(profile?.data as any)?.avatarUrl || 'https://i.pravatar.cc/150'}
                                style={[styles.avatar, { borderColor: colors.background.secondary }]}
                                cachePolicy="memory-disk"
                                transition={200}
                            />
                        </LinearGradient>
                        <View style={{ marginLeft: spacing.lg, flex: 1 }}>
                            <Text style={[typography.h2, { color: colors.text.primary }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                                {(profile?.data as any)?.name || user?.name || 'User'}
                            </Text>
                            <Text style={[typography.bodySm, { color: colors.text.secondary, marginTop: 2 }]} numberOfLines={1} maxFontSizeMultiplier={1.4}>
                                {(profile?.data as any)?.email || user?.email || ''}
                            </Text>
                            <View style={[styles.badge, { backgroundColor: withAlpha(colors.accent.purple, 0.14), borderColor: withAlpha(colors.accent.purple, 0.30) }]}>
                                <Ionicons name="moon" size={11} color={colors.accent.purple} />
                                <Text style={[typography.captionMedium, { color: colors.accent.purple, marginLeft: 5 }]} maxFontSizeMultiplier={1.4}>NightFuel User</Text>
                            </View>
                        </View>
                    </View>
                </GlassCard>

                {/* Settings Sections */}
                {SETTINGS_SECTIONS.map((section, idx) => (
                    <View key={idx} style={{ marginTop: spacing.xl }}>
                        <Text style={[typography.overline, { color: colors.text.secondary, marginLeft: spacing.xl, marginBottom: spacing.sm }]}>
                            {section.title}
                        </Text>
                        <GlassCard radius={borderRadius.xl} style={{ marginHorizontal: spacing.md }}>
                            {/* Grouped-list wash inside GlassCard, above blur fill, below rows */}
                            <LinearGradient
                                colors={colors.gradients.card}
                                style={StyleSheet.absoluteFillObject}
                                pointerEvents="none"
                            />
                            {section.items.map((item, itemIdx) => (
                                <TouchableOpacity
                                    key={itemIdx}
                                    accessibilityRole={item.isSwitch ? undefined : 'button'}
                                    accessibilityLabel={item.isSwitch ? undefined : item.label}
                                    style={[
                                        styles.settingItem,
                                        itemIdx !== section.items.length - 1 && { borderBottomColor: colors.border.default, borderBottomWidth: StyleSheet.hairlineWidth },
                                        (!item.route && !item.isSwitch) && { opacity: 0.45 },
                                    ]}
                                    onPress={() => item.route && router.push(item.route as any)}
                                    disabled={!item.route && !item.isSwitch}
                                    activeOpacity={0.7}
                                >
                                    <View style={styles.itemLeft}>
                                        <View style={[styles.itemIcon, { backgroundColor: withAlpha(colors.accent.coral, 0.10) }]}>
                                            <Ionicons name={item.icon as any} size={19} color={colors.accent.coral} />
                                        </View>
                                        <Text style={[typography.bodyMedium, { color: colors.text.primary, marginLeft: spacing.md }]} maxFontSizeMultiplier={1.4}>{item.label}</Text>
                                    </View>

                                    {item.isSwitch ? (
                                        <Switch
                                            accessibilityLabel={item.label}
                                            value={item.label === 'Dark Mode' ? theme === 'dark' : item.value as boolean}
                                            onValueChange={(val) => {
                                                if (item.label === 'Dark Mode') setTheme(val ? 'dark' : 'light');
                                            }}
                                            trackColor={{ true: colors.accent.purple, false: colors.border.light }}
                                            thumbColor={colors.text.primary}
                                            ios_backgroundColor={colors.border.default}
                                        />
                                    ) : (
                                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                            {item.value && <Text style={[typography.captionMedium, { color: colors.text.secondary, marginRight: spacing.sm }]} maxFontSizeMultiplier={1.4}>{item.value}</Text>}
                                            <Ionicons name="chevron-forward" size={18} color={colors.text.tertiary} />
                                        </View>
                                    )}
                                </TouchableOpacity>
                            ))}
                        </GlassCard>
                    </View>
                ))}

                {/* Logout Button — bespoke coral outline (not a filled CTA) */}
                <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Log Out"
                    style={[styles.logoutBtn, { borderColor: withAlpha(colors.accent.coral, 0.40), backgroundColor: withAlpha(colors.accent.coral, 0.08), borderRadius: borderRadius.lg, marginHorizontal: spacing.md }]}
                    onPress={async () => {
                        await useAuthStore.getState().logout();
                        router.replace('/(auth)/login');
                    }}
                    activeOpacity={0.8}
                >
                    <Ionicons name="log-out-outline" size={18} color={colors.accent.coral} />
                    <Text style={[typography.subhead, { color: colors.accent.coral, fontWeight: '700', marginLeft: spacing.sm }]} maxFontSizeMultiplier={1.4}>Log Out</Text>
                </TouchableOpacity>

                <Text style={[typography.caption, { color: colors.text.secondary, textAlign: 'center', marginTop: spacing['3xl'] }]}>
                    NightFuel v{appVersion}
                </Text>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 },
    profileInner: { flexDirection: 'row', alignItems: 'center', padding: 20 },
    avatarRing: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center' },
    avatar: { width: 68, height: 68, borderRadius: 34, borderWidth: 3 },
    badge: { flexDirection: 'row', alignSelf: 'flex-start', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1, marginTop: 10 },
    settingItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 14 },
    itemLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    itemIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    logoutBtn: { flexDirection: 'row', marginTop: 40, padding: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
});
