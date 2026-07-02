/**
 * Settings home — the account/app/support hub reached from the More tab. Zeitra
 * premium reskin aligned to the settings mockup: a COMPACT tappable identity row
 * (avatar in a lime brand ring + name + email + chevron, opening Edit Profile)
 * sits in its own grouped glass card under a back-button header; settings are
 * organised into grouped glass cards with PLAIN uppercase overline section labels
 * (no icon) and tinted icon-chip rows (value pills + chevrons), and the screen
 * enters with a STAGGERED Reanimated FadeInDown. Rows use the local <SettingsRow>
 * for a springy pressed-scale 0.96. Lime is the 10% accent (ring / icon chips at
 * ~12% / switch tracks); Log Out ("Sign out") is the one destructive action — a
 * centered RED row inside its own glass card, separated at the bottom of the
 * scroll (thumb zone). The destructive action reads "Sign out" everywhere — the
 * visible label, its accessibilityLabel, and the confirmation Alert title/button
 * (never the word "Log").
 *
 * Lime (the 10% accent) keeps a SINGLE restrained moment on the profile card —
 * the card glow + faint wash; the avatar ring has no separate glow, and section
 * overlines are neutral (text.tertiary). The REAL subscription tier is still
 * surfaced on the "Manage Subscription" row's value pill (the old hero tier pill
 * was retired with the hero). Skeletons cover the avatar/name/email while the
 * profile query loads; the StatusBar style follows the active scheme so the Dark
 * Mode switch can't strand it on the light theme.
 *
 * VISUAL redesign only — every data hook (useAuthStore / useThemeStore /
 * getProfile / getStatus), the SETTINGS_SECTIONS map (incl. the Theme picker row
 * + its 9-variant modal driving setThemeVariant), all routes/urls, the
 * subscription tier value, the Dark Mode + Night Read switch wiring (with the
 * single-source-of-truth `checked` state mirrored into accessibilityState), the
 * logout confirmation Alert + handler, appVersion and every a11y label/role/state
 * are preserved exactly.
 */
import React, { useMemo, useState } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking, Alert,
    Modal, Pressable,
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
import { themeVariantList } from '@/theme/colors';

export default function SettingsIndexScreen() {
    const { colors, typography, spacing, borderRadius, scheme } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();

    // Brand-accent alias for this screen — the active theme's primary accent
    // (its value IS the lime brand token in the default theme) under the name
    // `LIME` so the profile card's restrained brand moment re-tints per theme.
    const LIME = colors.accent.coral;

    const { user } = useAuthStore();
    const { theme, setTheme, nightRead, setNightRead, themeVariant, setThemeVariant } = useThemeStore();

    // Theme-picker sheet visibility. Purely local UI state — additive, never
    // persisted, and independent of the theme selection itself.
    const [themePickerOpen, setThemePickerOpen] = useState(false);
    // The active variant's descriptor (for the row's value pill). Falls back to
    // the first/default variant, which is always present in the list.
    const activeVariant =
        themeVariantList.find((v) => v.id === themeVariant) ?? themeVariantList[0]!;

    const { data: profile, isLoading: profileLoading } = useQuery({
        queryKey: ['user-profile'],
        queryFn: getProfile,
    });

    // Mirror subscription.tsx's query so the cache is shared. While loading,
    // `subscription` is undefined and the "Manage Subscription" row shows no value
    // pill (see useMemo below); the tier is surfaced there, not on the profile row.
    const { data: subscription } = useQuery({
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
            'Sign out',
            'Are you sure you want to sign out of Zeitra?',
            [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Sign out', style: 'destructive', onPress: performLogout },
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
        // Optional in-screen action (e.g. open a sheet) for rows that neither
        // navigate (`route`) nor open a URL. Additive — checked after route/url.
        action?: () => void;
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
                {
                    label: 'Night Read',
                    icon: 'eye-outline',
                    isSwitch: true,
                    // AI/calm hue: the deep-red night palette is a focus/comfort mode,
                    // visually distinct from the lime brand rows — purple flags it.
                    tint: colors.accent.purple,
                    subtitle: 'Deep-red palette that preserves your dark-adapted night vision on late shifts.',
                },
                {
                    // Color-theme picker — opens a sheet of 9 palette tiles. Layout is
                    // identical across themes; only color tokens swap. Shows the active
                    // variant's name as the value pill.
                    label: 'Theme',
                    icon: 'color-palette-outline',
                    value: activeVariant.name,
                    action: () => setThemePickerOpen(true),
                },
            ]
        },
        {
            title: 'Support',
            icon: 'help-buoy-outline',
            items: [
                { label: 'Help Center', icon: 'help-circle-outline', url: 'https://zeitra.app/support' },
                { label: 'Terms of Service', icon: 'document-text-outline', url: 'https://zeitra.app/terms' },
                { label: 'Privacy Policy', icon: 'lock-closed-outline', url: 'https://zeitra.app/privacy' },
            ]
        }
    ], [subscription?.tier, activeVariant.name, colors]);

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

    // Skeleton while identity resolves, so the profile row never flashes the
    // 'User' fallback over an EMPTY email line. The avatar block has its own
    // loading branch below. (The subscription tier now lives on the "Manage
    // Subscription" row's value pill, so no separate plan-loading state is needed.)
    const identityLoading = profileLoading && !p.name && !user?.name;

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
                {/* Profile Summary — compact tappable identity ROW (mockup look):
                    avatar + name + email + chevron, inside a grouped glass card.
                    Tapping opens Edit Profile (the real existing route). A single
                    restrained lime moment stays: the card glow + a faint inner wash.
                    The avatar keeps a lime ring/initials fallback — never an external
                    face. The REAL subscription tier is still surfaced on the "Manage
                    Subscription" row's value pill below, so no plan info is lost. */}
                <Animated.View entering={FadeInDown.duration(380).springify().damping(18)}>
                    <GlassCard radius={borderRadius.xl} glow={LIME} style={{ marginHorizontal: spacing.md }}>
                        {/* Warm lime wash inside the glass, above its blur fill, below content */}
                        <LinearGradient
                            colors={[withAlpha(LIME, 0.12), withAlpha(LIME, 0.03)]}
                            style={StyleSheet.absoluteFillObject}
                            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                            pointerEvents="none"
                        />
                        <TouchableOpacity
                            activeOpacity={0.85}
                            accessibilityRole="button"
                            accessibilityLabel="Edit profile"
                            onPress={() => router.push('/(tabs)/profile/edit')}
                            style={styles.profileInner}
                        >
                            {/* Avatar nested in a lime brand ring (no separate glow). Falls
                                back to branded initials / a person glyph — never an external
                                face. While identity loads, a Skeleton fills the ring. */}
                            <View style={[styles.avatarRing, { borderColor: withAlpha(LIME, 0.55), backgroundColor: colors.background.secondary }]}>
                                {identityLoading ? (
                                    <Skeleton width={54} height={54} radius={27} />
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
                                            <Text style={[typography.h3, { color: LIME }]} maxFontSizeMultiplier={1.2}>{initials}</Text>
                                        ) : (
                                            <Ionicons name="person" size={26} color={LIME} />
                                        )}
                                    </View>
                                )}
                            </View>
                            <View style={{ marginLeft: spacing.md, flex: 1 }}>
                                {identityLoading ? (
                                    <>
                                        {/* Name + email placeholders — no 'User' + blank-line flash. */}
                                        <Skeleton width={150} height={18} radius={6} />
                                        <Skeleton width={190} height={13} radius={6} style={{ marginTop: 7 }} />
                                    </>
                                ) : (
                                    <>
                                        <Text style={[typography.subhead, { color: colors.text.primary }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                                            {displayName}
                                        </Text>
                                        <Text style={[typography.bodySm, { color: colors.text.secondary, marginTop: 2 }]} numberOfLines={1} maxFontSizeMultiplier={1.4}>
                                            {displayEmail}
                                        </Text>
                                    </>
                                )}
                            </View>
                            <Ionicons name="chevron-forward" size={18} color={colors.text.tertiary} />
                        </TouchableOpacity>
                    </GlassCard>
                </Animated.View>

                {/* Settings Sections */}
                {SETTINGS_SECTIONS.map((section, idx) => (
                    <Animated.View
                        key={idx}
                        entering={FadeInDown.delay(90 + idx * 45).springify().damping(18)}
                        style={{ marginTop: spacing.xl }}
                    >
                        {/* Plain uppercase overline label (mockup look) — the per-section
                            icon is dropped; `section.icon` stays in the data map (unused
                            here) so the section schema is untouched. */}
                        <Text style={[typography.overline, styles.sectionHeader, { color: colors.text.tertiary }]}>
                            {section.title}
                        </Text>
                        <GlassCard radius={borderRadius.xl} style={{ marginHorizontal: spacing.md }}>
                            {/* Grouped-list wash inside the glass, above blur fill, below rows */}
                            <LinearGradient
                                colors={colors.gradients.card}
                                style={StyleSheet.absoluteFillObject}
                                pointerEvents="none"
                            />
                            {section.items.map((item, itemIdx) => {
                                // A row is genuinely actionless only when it has no route,
                                // no external url, no in-screen action, and is not a switch —
                                // rendered explicitly disabled so the UI never implies a dead
                                // tap target.
                                const isDisabled = !item.route && !item.url && !item.action && !item.isSwitch;

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
                                            else if (item.action) item.action();
                                        }}
                                    />
                                );
                            })}
                        </GlassCard>
                    </Animated.View>
                ))}

                {/* Log Out — the one destructive action: a centered RED row inside its
                    own grouped glass card (mockup "Sign out" look), separated and
                    sitting in the thumb zone at the bottom of the scroll. */}
                <Animated.View
                    entering={FadeInDown.delay(90 + SETTINGS_SECTIONS.length * 45).springify().damping(18)}
                    style={{ marginTop: spacing['3xl'] }}
                >
                    <GlassCard radius={borderRadius.xl} style={{ marginHorizontal: spacing.md }}>
                        <LinearGradient
                            colors={colors.gradients.card}
                            style={StyleSheet.absoluteFillObject}
                            pointerEvents="none"
                        />
                        <TouchableOpacity
                            activeOpacity={0.85}
                            accessibilityRole="button"
                            accessibilityLabel="Sign out"
                            style={styles.logoutBtn}
                            onPress={confirmLogout}
                        >
                            <Ionicons name="log-out-outline" size={18} color={colors.accent.red} />
                            {/* Visible copy, the accessibilityLabel, and the confirm Alert all
                                follow the naming rule ("Sign out", never "Log"). */}
                            <Text style={[typography.subhead, { color: colors.accent.red, fontWeight: '700', marginLeft: spacing.sm }]} maxFontSizeMultiplier={1.4}>Sign out</Text>
                        </TouchableOpacity>
                    </GlassCard>
                </Animated.View>

                <Text style={[typography.caption, { color: colors.text.secondary, textAlign: 'center', marginTop: spacing['3xl'] }]}>
                    Zeitra v{appVersion}
                </Text>
            </ScrollView>

            {/* Theme picker — a bottom sheet of 9 palette preview tiles. Selecting a
                tile calls setThemeVariant(id); the whole app (this screen included)
                re-themes live via useTheme(). Layout is identical across themes —
                only color tokens change. The sheet itself re-themes too. */}
            <Modal
                visible={themePickerOpen}
                transparent
                animationType="slide"
                onRequestClose={() => setThemePickerOpen(false)}
            >
                <Pressable
                    style={[styles.modalBackdrop, { backgroundColor: withAlpha('#000000', 0.55) }]}
                    accessibilityLabel="Close theme picker"
                    accessibilityRole="button"
                    onPress={() => setThemePickerOpen(false)}
                />
                <View
                    style={[
                        styles.sheet,
                        {
                            paddingBottom: insets.bottom + spacing.xl,
                            backgroundColor: colors.background.secondary,
                            borderColor: colors.border.default,
                        },
                    ]}
                >
                    <View style={[styles.sheetGrabber, { backgroundColor: colors.border.light }]} />
                    <Text style={[typography.overline, { color: colors.text.tertiary, marginBottom: 2 }]}>APPEARANCE</Text>
                    <Text style={[typography.h2, { color: colors.text.primary, marginBottom: spacing.lg }]}>Theme</Text>

                    <View style={styles.tileGrid}>
                        {themeVariantList.map((v) => {
                            const selected = v.id === themeVariant;
                            return (
                                <TouchableOpacity
                                    key={v.id}
                                    activeOpacity={0.85}
                                    accessibilityRole="button"
                                    accessibilityLabel={`${v.name} theme`}
                                    accessibilityState={{ selected }}
                                    onPress={() => setThemeVariant(v.id)}
                                    style={[
                                        styles.tile,
                                        {
                                            backgroundColor: v.bg,
                                            borderColor: selected ? v.accent : withAlpha(v.accent, 0.30),
                                            borderWidth: selected ? 2 : 1,
                                        },
                                    ]}
                                >
                                    {/* Preview cluster: an accent swatch + two neutral bars hint at
                                        the palette without rendering a full mock screen. */}
                                    <View style={styles.tilePreview}>
                                        <View style={[styles.tileSwatch, { backgroundColor: v.accent }]} />
                                        <View style={{ flex: 1, marginLeft: 8 }}>
                                            <View style={[styles.tileBar, { backgroundColor: withAlpha(v.accent, 0.55), width: '70%' }]} />
                                            <View style={[styles.tileBar, { backgroundColor: withAlpha(v.isDark ? '#FFFFFF' : '#000000', 0.18), width: '90%', marginTop: 5 }]} />
                                        </View>
                                        {selected ? (
                                            <View style={[styles.tileCheck, { backgroundColor: v.accent }]}>
                                                <Ionicons name="checkmark" size={13} color={v.isDark ? '#0A0C12' : '#FFFFFF'} />
                                            </View>
                                        ) : null}
                                    </View>
                                    <Text
                                        style={[typography.captionMedium, { color: v.isDark ? '#FFFFFF' : '#16161A', marginTop: 10 }]}
                                        numberOfLines={1}
                                        maxFontSizeMultiplier={1.3}
                                    >
                                        {v.name}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    <TouchableOpacity
                        activeOpacity={0.85}
                        accessibilityRole="button"
                        accessibilityLabel="Done"
                        onPress={() => setThemePickerOpen(false)}
                        style={[styles.sheetDone, { borderColor: colors.border.default }]}
                    >
                        <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: '700' }]}>Done</Text>
                    </TouchableOpacity>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    // Left gutter unified to spacing.md (12) so the title's left edge lines up
    // with the card stack (every card uses marginHorizontal: spacing.md).
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 8, paddingBottom: 16 },
    backBtn: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    // Compact identity row (mockup): smaller avatar, trailing chevron.
    profileInner: { flexDirection: 'row', alignItems: 'center', padding: 14 },
    avatarRing: { width: 60, height: 60, borderRadius: 30, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
    avatar: { width: 54, height: 54, borderRadius: 27 },
    avatarFallback: { alignItems: 'center', justifyContent: 'center' },
    // Plain uppercase overline label above each group card (mockup `.lbl`).
    sectionHeader: { marginLeft: 20, marginBottom: 8 },
    // Centered destructive row; the surrounding GlassCard owns the surface/radius.
    logoutBtn: { flexDirection: 'row', padding: 15, alignItems: 'center', justifyContent: 'center' },
    // Theme picker sheet
    modalBackdrop: { ...StyleSheet.absoluteFillObject },
    sheet: {
        position: 'absolute', left: 0, right: 0, bottom: 0,
        borderTopLeftRadius: 24, borderTopRightRadius: 24,
        borderWidth: 1, borderBottomWidth: 0,
        paddingHorizontal: 16, paddingTop: 12,
    },
    sheetGrabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: 14 },
    tileGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
    // ~3 tiles per row (each ~30%); wraps to 3 rows of 3 for the 9 variants.
    tile: { width: '31.5%', borderRadius: 16, padding: 10, marginBottom: 12 },
    tilePreview: { flexDirection: 'row', alignItems: 'center' },
    tileSwatch: { width: 22, height: 22, borderRadius: 7 },
    tileBar: { height: 5, borderRadius: 3 },
    tileCheck: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginLeft: 4 },
    sheetDone: { marginTop: 4, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 14 },
});
