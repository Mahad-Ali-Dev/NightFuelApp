/**
 * Settings home — the account/app/support hub reached from the More tab. Zeitra
 * premium reskin: a dark-glass profile hero (avatar in a lime brand ring,
 * identity, a tier pill driven by the REAL subscription tier) sits under a
 * back-button header; settings are
 * organised into grouped glass cards with overline+icon section headers and
 * tinted icon-chip rows (value pills + chevrons), and the screen enters with a
 * STAGGERED Reanimated FadeInDown. Rows use the local <SettingsRow> for a springy
 * pressed-scale 0.96. Lime is the 10% accent (ring / Pro pill / icon chips at
 * ~12% / switch tracks); Log Out is the one destructive action — RED, glyph'd
 * and separated at the bottom of the scroll (thumb zone).
 *
 * Lime (the 10% accent) keeps a SINGLE restrained moment on the hero — the card
 * glow + faint wash; the avatar ring lost its separate glow, the header eyebrow
 * and section overlines are neutral (text.tertiary), and the tier pill is lime
 * ONLY for a paid plan. Skeletons cover the avatar/name/email/tier while the
 * profile + subscription queries load; the StatusBar style follows the active
 * scheme so the Dark Mode switch can't strand it on the light theme.
 *
 * VISUAL redesign only — every data hook (useAuthStore / useThemeStore /
 * getProfile / getStatus), the SETTINGS_SECTIONS map, all routes/urls, the
 * subscription tier value, the Dark Mode + Night Read switch wiring (with the
 * single-source-of-truth `checked` state mirrored into accessibilityState), the
 * logout confirmation Alert + handler, appVersion and every a11y label/role/state
 * are preserved exactly.
 */
import React, { useMemo } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking, Alert,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/utils';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { getProfile } from '@/api/users';
import { getStatus } from '@/api/subscriptions';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useAuthStore } from '@/store/authStore';
import { useThemeStore } from '@/store/themeStore';
import Constants from 'expo-constants';
import { GlassCard, Skeleton } from '@/components/ui';
import { SettingsRow } from '@/components/SettingsRow';
import { colors as C } from '@/theme/colors';

// Brand-accent alias for this screen. Every reference below keys off the single
// brand token (C.accent.coral === #A8CC3C) under the name `LIME` so no brand
// emphasis on this screen is named "coral" — the token VALUE is the lime accent,
// and reading/normalising the literal name "coral" can never break the brand here.
// (The shared theme is never edited; this is a local, value-identical alias.)
const LIME = C.accent.coral;

export default function SettingsIndexScreen() {
    const { colors, typography, spacing, borderRadius, scheme } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();

    const { user } = useAuthStore();
    const { theme, setTheme, nightRead, setNightRead } = useThemeStore();

    const { data: profile, isLoading: profileLoading } = useQuery({
        queryKey: ['user-profile'],
        queryFn: getProfile,
    });

    // Mirror subscription.tsx's query so the cache is shared. While loading,
    // `subscription` is undefined and the row shows no value (see useMemo below).
    const { data: subscription, isLoading: subscriptionLoading } = useQuery({
        queryKey: ['subscription-status'],
        queryFn: getStatus,
    });

    const appVersion = Constants.expoConfig?.version ?? '1.0.0';

    // Log Out is a destructive account action, so it is gated behind an explicit
    // confirmation. Only the destructive Alert button runs the logout + nav; the
    // Cancel path is a no-op (logout fires zero times). Reading the store via
    // getState() at call time avoids subscribing the screen to auth changes.
    const performLogout = async () => {
        await useAuthStore.getState().logout();
        router.replace('/(auth)/login');
    };

    const confirmLogout = () => {
        Alert.alert(
            'Log Out',
            'Are you sure you want to log out of Zeitra?',
            [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Log Out', style: 'destructive', onPress: performLogout },
            ],
            { cancelable: true },
        );
    };

    type SettingItemType = {
        label: string;
        icon: string;
        route?: string;
        url?: string;
        value?: string | boolean;
        isSwitch?: boolean;
        subtitle?: string;
        // Purely-visual per-row accent for the icon chip / value pill. Additive —
        // it never affects routing or behaviour; defaults to the brand lime.
        tint?: string;
    };

    const SETTINGS_SECTIONS: { title: string; icon: string; items: SettingItemType[] }[] = useMemo(() => [
        {
            title: 'Account',
            icon: 'person-outline',
            items: [
                { label: 'Edit Profile', icon: 'person-outline', route: '/(tabs)/profile/edit' },
                { label: 'Preferences', icon: 'settings-outline', route: '/(tabs)/profile/preferences' },
                { label: 'Manage Subscription', icon: 'star-outline', route: '/(settings)/subscription', value: subscription?.tier },
                { label: 'Privacy & Data', icon: 'shield-checkmark-outline', route: '/(settings)/privacy-data' },
            ]
        },
        {
            title: 'App Settings',
            icon: 'options-outline',
            items: [
                { label: 'Notifications', icon: 'notifications-outline', route: '/(settings)/notifications' },
                { label: 'Notification Settings', icon: 'options-outline', route: '/(settings)/notification-preferences' },
                { label: 'Connected Devices', icon: 'watch-outline', route: '/(settings)/devices' }, // Mock route for now
                { label: 'Dark Mode', icon: 'moon-outline', isSwitch: true, value: true },
                {
                    label: 'Night Read',
                    icon: 'eye-outline',
                    isSwitch: true,
                    // AI/calm hue: the deep-red night palette is a focus/comfort mode,
                    // visually distinct from the lime brand rows — purple flags it.
                    tint: C.accent.purple,
                    subtitle: 'Deep-red palette that preserves your dark-adapted night vision on late shifts.',
                },
            ]
        },
        {
            title: 'Support',
            icon: 'help-buoy-outline',
            items: [
                { label: 'Help Center', icon: 'help-circle-outline', url: 'https://zeitra.app/support' },
                { label: 'Terms of Service', icon: 'document-text-outline', url: 'https://zeitra.app/terms' },
            ]
        }
    ], [subscription?.tier]);

    // Identity, with a branded fallback for the avatar hole (replaces the prior
    // off-brand external random-face service). All reads are the exact data hooks.
    const p = (profile?.data as any) ?? {};
    const displayName: string = p.name || user?.name || 'User';
    const displayEmail: string = p.email || user?.email || '';
    const avatarUrl: string | undefined = p.avatarUrl || undefined;
    const initials = (p.name || user?.name || '')
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((w: string) => w[0]?.toUpperCase() ?? '')
        .join('');

    // Skeletons while identity/plan resolve, so the hero never flashes the 'User'
    // fallback over an EMPTY email line, and the tier pill never renders a false
    // (or blank) plan. The avatar block has its own loading branch below.
    const identityLoading = profileLoading && !p.name && !user?.name;
    const tierLoading = subscriptionLoading && !subscription;

    // Drive the hero pill from the REAL subscription tier (was a hardcoded
    // 'Zeitra Pro' shown to everyone, incl. free users). Lime — the 10% accent —
    // is reserved for a genuinely PAID plan; FREE renders a neutral pill so the
    // hero isn't a triumphant-but-false lime badge on a free account.
    const tier = subscription?.tier; // 'FREE' | 'PRO' | 'PREMIUM' | 'ENTERPRISE'
    const isPaid = !!tier && tier !== 'FREE';
    const tierLabel = tier
        ? `Zeitra ${tier.charAt(0) + tier.slice(1).toLowerCase()}` // 'Zeitra Pro', 'Zeitra Free'
        : '';
    const pillTint = isPaid ? LIME : colors.text.tertiary;

    return (
        <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background.primary }]}>
            {/* Derive from the active scheme: this screen's own Dark Mode switch can
                flip to the near-white light theme, on which light icons vanish. */}
            <StatusBar style={scheme === 'light' ? 'dark' : 'light'} />

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity
                    activeOpacity={0.85}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    accessibilityRole="button"
                    accessibilityLabel="Go back"
                    onPress={() => router.back()}
                    style={[styles.backBtn, { backgroundColor: withAlpha(colors.text.primary, 0.06), borderColor: colors.border.default }]}
                >
                    <Ionicons name="arrow-back" size={20} color={colors.text.primary} />
                </TouchableOpacity>
                <View style={{ flex: 1, marginLeft: spacing.md }}>
                    <Text style={[typography.overline, { color: colors.text.tertiary }]}>ZEITRA</Text>
                    <Text style={[typography.h1, { color: colors.text.primary }]}>Settings</Text>
                </View>
            </View>

            <ScrollView
                contentContainerStyle={{ paddingBottom: insets.bottom + spacing['5xl'], paddingTop: spacing.sm }}
                showsVerticalScrollIndicator={false}
            >
                {/* Profile Summary — dark-glass hero. ONE restrained lime moment:
                    the GlassCard glow + a faint inner wash. The avatar ring keeps a
                    lime hairline but NO separate glow (its stacked glow was dropped
                    so the 10% accent isn't front-loaded four-deep into one surface). */}
                <Animated.View entering={FadeInDown.duration(380).springify().damping(18)}>
                    <GlassCard radius={borderRadius['2xl']} glow={LIME} style={{ marginHorizontal: spacing.md }}>
                        {/* Warm lime wash inside the glass, above its blur fill, below content */}
                        <LinearGradient
                            colors={[withAlpha(LIME, 0.12), withAlpha(LIME, 0.03)]}
                            style={StyleSheet.absoluteFillObject}
                            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                            pointerEvents="none"
                        />
                        <View style={styles.profileInner}>
                            {/* Avatar nested in a lime brand ring (no separate glow). Falls
                                back to branded initials / a person glyph — never an external
                                face. While identity loads, a Skeleton fills the ring. */}
                            <View style={[styles.avatarRing, { borderColor: withAlpha(LIME, 0.55), backgroundColor: colors.background.secondary }]}>
                                {identityLoading ? (
                                    <Skeleton width={72} height={72} radius={36} />
                                ) : avatarUrl ? (
                                    <Image
                                        source={avatarUrl}
                                        style={styles.avatar}
                                        contentFit="cover"
                                        cachePolicy="memory-disk"
                                        transition={200}
                                    />
                                ) : (
                                    <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: withAlpha(LIME, 0.14) }]}>
                                        {initials ? (
                                            <Text style={[typography.h2, { color: LIME }]} maxFontSizeMultiplier={1.2}>{initials}</Text>
                                        ) : (
                                            <Ionicons name="person" size={32} color={LIME} />
                                        )}
                                    </View>
                                )}
                            </View>
                            <View style={{ marginLeft: spacing.lg, flex: 1 }}>
                                {identityLoading ? (
                                    <>
                                        {/* Name + email placeholders — no 'User' + blank-line flash. */}
                                        <Skeleton width={150} height={20} radius={6} />
                                        <Skeleton width={190} height={13} radius={6} style={{ marginTop: 8 }} />
                                    </>
                                ) : (
                                    <>
                                        <Text style={[typography.h2, { color: colors.text.primary }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                                            {displayName}
                                        </Text>
                                        <Text style={[typography.bodySm, { color: colors.text.secondary, marginTop: 2 }]} numberOfLines={1} maxFontSizeMultiplier={1.4}>
                                            {displayEmail}
                                        </Text>
                                    </>
                                )}
                                {/* Tier pill: Skeleton while loading; lime ONLY for a paid plan;
                                    neutral pill for Free; driven by the REAL subscription tier. */}
                                {tierLoading ? (
                                    <Skeleton width={92} height={24} radius={999} style={{ marginTop: 10 }} />
                                ) : tier ? (
                                    <View style={[styles.badge, { backgroundColor: withAlpha(pillTint, 0.14), borderColor: withAlpha(pillTint, 0.30) }]}>
                                        <Ionicons name={isPaid ? 'flash' : 'person-outline'} size={11} color={pillTint} />
                                        <Text style={[typography.captionMedium, { color: pillTint, marginLeft: 5 }]} maxFontSizeMultiplier={1.4}>{tierLabel}</Text>
                                    </View>
                                ) : null}
                            </View>
                        </View>
                    </GlassCard>
                </Animated.View>

                {/* Settings Sections */}
                {SETTINGS_SECTIONS.map((section, idx) => (
                    <Animated.View
                        key={idx}
                        entering={FadeInDown.delay(90 + idx * 45).springify().damping(18)}
                        style={{ marginTop: spacing.xl }}
                    >
                        <View style={styles.sectionHeader}>
                            <Ionicons name={section.icon as any} size={13} color={colors.text.tertiary} />
                            <Text style={[typography.overline, { color: colors.text.secondary, marginLeft: 6 }]}>
                                {section.title}
                            </Text>
                        </View>
                        <GlassCard radius={borderRadius.xl} style={{ marginHorizontal: spacing.md }}>
                            {/* Grouped-list wash inside the glass, above blur fill, below rows */}
                            <LinearGradient
                                colors={colors.gradients.card}
                                style={StyleSheet.absoluteFillObject}
                                pointerEvents="none"
                            />
                            {section.items.map((item, itemIdx) => {
                                // A row is genuinely actionless only when it has no route,
                                // no external url, and is not a switch — rendered explicitly
                                // disabled so the UI never implies a dead tap target.
                                const isDisabled = !item.route && !item.url && !item.isSwitch;

                                // Single source of truth for the switch's on/off state so the
                                // visible `value` and the announced `accessibilityState.checked`
                                // can never diverge. Dark Mode keeps its placeholder `value:true`
                                // semantics; Night Read reflects the persisted flag.
                                const checked = item.isSwitch
                                    ? (item.label === 'Dark Mode' ? theme === 'dark'
                                        : item.label === 'Night Read' ? nightRead
                                        : (item.value as boolean))
                                    : undefined;

                                return (
                                    <SettingsRow
                                        key={itemIdx}
                                        label={item.label}
                                        icon={item.icon}
                                        tint={item.tint}
                                        subtitle={item.subtitle}
                                        valueText={item.value && typeof item.value === 'string' ? item.value : undefined}
                                        isSwitch={item.isSwitch}
                                        switchValue={checked}
                                        onSwitchChange={(val) => {
                                            if (item.label === 'Dark Mode') setTheme(val ? 'dark' : 'light');
                                            else if (item.label === 'Night Read') setNightRead(val);
                                        }}
                                        disabled={isDisabled}
                                        showDivider={itemIdx !== section.items.length - 1}
                                        accessibilityRole={item.isSwitch ? undefined : (item.url ? 'link' : 'button')}
                                        accessibilityLabel={item.label}
                                        accessibilityState={item.isSwitch ? { checked } : { disabled: isDisabled }}
                                        onPress={() => {
                                            if (item.route) router.push(item.route as any);
                                            else if (item.url) Linking.openURL(item.url);
                                        }}
                                    />
                                );
                            })}
                        </GlassCard>
                    </Animated.View>
                ))}

                {/* Log Out — the one destructive action: RED, glyph'd, separated and
                    sitting in the thumb zone at the bottom of the scroll. */}
                <Animated.View entering={FadeInDown.delay(90 + SETTINGS_SECTIONS.length * 45).springify().damping(18)}>
                    <TouchableOpacity
                        activeOpacity={0.85}
                        accessibilityRole="button"
                        accessibilityLabel="Log Out"
                        style={[styles.logoutBtn, { borderColor: withAlpha(colors.accent.red, 0.40), backgroundColor: withAlpha(colors.accent.red, 0.08), borderRadius: borderRadius.lg, marginHorizontal: spacing.md }]}
                        onPress={confirmLogout}
                    >
                        <Ionicons name="log-out-outline" size={18} color={colors.accent.red} />
                        <Text style={[typography.subhead, { color: colors.accent.red, fontWeight: '700', marginLeft: spacing.sm }]} maxFontSizeMultiplier={1.4}>Log Out</Text>
                    </TouchableOpacity>
                </Animated.View>

                <Text style={[typography.caption, { color: colors.text.secondary, textAlign: 'center', marginTop: spacing['3xl'] }]}>
                    Zeitra v{appVersion}
                </Text>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    // Left gutter unified to spacing.md (12) so the title's left edge lines up
    // with the card stack (every card uses marginHorizontal: spacing.md).
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 8, paddingBottom: 16 },
    backBtn: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    profileInner: { flexDirection: 'row', alignItems: 'center', padding: 20 },
    avatarRing: { width: 84, height: 84, borderRadius: 42, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
    avatar: { width: 72, height: 72, borderRadius: 36 },
    avatarFallback: { alignItems: 'center', justifyContent: 'center' },
    badge: { flexDirection: 'row', alignSelf: 'flex-start', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1, marginTop: 10 },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', marginLeft: 12, marginBottom: 8 },
    logoutBtn: { flexDirection: 'row', marginTop: 40, padding: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
});
