/**
 * More tab — the hub for every secondary destination (account, insights,
 * settings, support). Zeitra premium reskin: a lime-washed profile hero carries
 * the avatar in a brand ring above a big Barlow-Condensed stat band (honest
 * counts derived from the static section map — destinations + grouped sections),
 * settings are organised into grouped dark-glass cards with tinted icon chips +
 * chevrons, and the screen enters with a STAGGERED Reanimated FadeInDown. Rows
 * use the local <MoreSettingRow> for a springy pressed-scale 0.96.
 *
 * VISUAL redesign only — every data hook (useAuthStore / useThemeStore /
 * getProfile), the SETTINGS_SECTIONS map, all routes/urls, the Dark Mode switch
 * wiring, the honest disabled-row contract, the logout handler, appVersion and
 * every a11y label are preserved exactly.
 */
import React, { useMemo } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
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
import { MoreSettingRow } from '@/components/MoreSettingRow';
import { ProfileRing } from '@/components/ProfileRing';
import { withAlpha } from '@/theme/utils';
import { getStreak } from '@/api/progress';
import { TAB_BAR_H } from './_layout';

type SettingItemType = {
    label: string;
    icon: string;
    route?: string;
    // External link target (e.g. Help Center / Terms) opened via Linking.openURL.
    // Mirrors the (settings)/index.tsx Support rows so both screens are honest:
    // a row with a `url` is a real link, not a silent no-op.
    url?: string;
    value?: string | boolean;
    isSwitch?: boolean;
    // Purely-visual per-row accent for the icon chip / value pill. Additive — it
    // never affects routing or behaviour; defaults to the brand lime when unset.
    tint?: string;
};

// Static settings layout — built per active theme so the per-row `tint` accents
// re-tint on a theme switch. The structure (labels/icons/routes/switch wiring) is
// constant; only the token-sourced tints come from the active palette. Built via
// useMemo(colors) in the component below. (The Dark Mode switch state is derived
// from the theme store at render.)
const makeSettingsSections = (
    colors: ReturnType<typeof useTheme>['colors'],
): { title: string; icon: string; items: SettingItemType[] }[] => [
    {
        title: 'Account',
        icon: 'person-outline',
        items: [
            { label: 'My Profile & Preferences', icon: 'person-circle-outline', route: '/(tabs)/profile', tint: colors.accent.coral },
            { label: 'Manage Subscription', icon: 'star-outline', route: '/(settings)/subscription', value: 'Pro Tier', tint: colors.accent.coral },
        ]
    },
    {
        title: 'Insights & Tools',
        icon: 'bulb-outline',
        items: [
            { label: 'Analytics Dashboard', icon: 'stats-chart-outline', route: '/(tabs)/analytics', tint: colors.accent.coral },
            { label: 'Achievements & Badges', icon: 'trophy-outline', route: '/(community)/achievements', tint: colors.accent.coral },
            // AI is the single reserved hue — purple flags the "AI & Coach" surface
            // (matching the theme's purpleDark intent) so lime stays THE brand accent
            // everywhere else.
            { label: 'AI Workout Planner', icon: 'sparkles-outline', route: '/(exercises)/ai-planner', tint: colors.accent.purple },
            { label: 'Calculators (1RM & Macros)', icon: 'calculator-outline', route: '/(exercises)/calculator', tint: colors.accent.coral },
        ]
    },
    {
        title: 'App Settings',
        icon: 'options-outline',
        items: [
            { label: 'Notification Settings', icon: 'notifications-outline', route: '/(settings)/notification-preferences', tint: colors.accent.coral },
            { label: 'Notification History', icon: 'list-outline', route: '/(settings)/notifications', tint: colors.accent.coral },
            { label: 'Connected Devices', icon: 'watch-outline', route: '/(settings)/devices', tint: colors.accent.coral },
            { label: 'Dark Mode', icon: 'moon-outline', isSwitch: true, value: true, tint: colors.accent.coral },
        ]
    },
    {
        title: 'Support',
        icon: 'help-buoy-outline',
        items: [
            { label: 'Help Center', icon: 'help-circle-outline', url: 'https://zeitra.app/support', tint: colors.accent.coral },
            { label: 'Terms of Service', icon: 'document-text-outline', url: 'https://zeitra.app/terms', tint: colors.accent.coral },
        ]
    }
];

// Honest hero count — the real number of destinations the hub links to, derived
// purely from the static section structure (NOT a backend fetch). Counts the
// items off a colorless probe of the section map so it stays a module constant
// (the labels/items never change with the theme). The other two stat cells carry
// live, user-meaningful data (day streak + profile completion).
const TOTAL_DESTINATIONS = makeSettingsSections({ accent: {} } as any).reduce(
    (n, s) => n + s.items.length,
    0,
);

export default function MoreScreen() {
    const { colors, typography, spacing, borderRadius, shadows } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();

    const { user } = useAuthStore();
    const { theme, setTheme } = useThemeStore();

    // Per-row settings layout rebuilt from the ACTIVE theme so each row's `tint`
    // accent re-tints on a theme switch (structure is constant; only the
    // token-sourced tints change).
    const settingsSections = useMemo(() => makeSettingsSections(colors), [colors]);

    const { data: profile } = useQuery({
        queryKey: ['user-profile'],
        queryFn: getProfile,
    });

    // Real day-streak signal (same read-only source the Profile tab uses). On a
    // fetch failure we surface an honest '—' rather than a fake '0' so a broken
    // request never masquerades as a genuinely zeroed brand-new user.
    const { data: streak, isError: streakError } = useQuery({
        queryKey: ['profile-streak'],
        queryFn: getStreak,
    });
    const streakDays = streak?.current ?? 0;

    const appVersion = Constants.expoConfig?.version ?? '1.0.0';

    // ── Honest hero gamification (computed, never fabricated) ────────────────
    // Profile-completion %: a deterministic fraction of the profile fields we have
    // actually loaded (name, email, avatar). This is the value the avatar ring
    // animates to AND the "Complete" stat cell shows — so the ring is a real
    // progress signal, not decoration, and never implies data we don't have.
    const p = (profile?.data as any) ?? {};
    const displayName: string = p.name || user?.name || '';
    const displayEmail: string = p.email || user?.email || '';
    const avatarUrl: string | undefined = p.avatarUrl || undefined;
    const completionParts = [!!displayName, !!displayEmail, !!avatarUrl];
    const completionPct = Math.round(
        (completionParts.filter(Boolean).length / completionParts.length) * 100,
    );
    // Branded fallback initials for the avatar hole (replaces the off-brand
    // external random-face service). Empty → a person glyph is rendered instead.
    const initials = displayName
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase() ?? '')
        .join('');

    return (
        <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background.primary }]}>
            <StatusBar style="light" translucent backgroundColor="transparent" />

            {/* Header */}
            <View style={styles.header}>
                <Text style={[typography.overline, { color: colors.accent.coral, marginBottom: 2 }]}>ZEITRA</Text>
                <Text style={[typography.display, { color: colors.text.primary }]}>More</Text>
            </View>

            <ScrollView
                contentContainerStyle={{ paddingBottom: TAB_BAR_H + 40, paddingTop: spacing.sm }}
                showsVerticalScrollIndicator={false}
            >
                {/* Profile Summary — shared glass hero with brand ring + glow, now
                    carrying a big condensed stat band beneath the identity row. */}
                <Animated.View entering={FadeInDown.duration(380).springify().damping(18)}>
                    <GlassCard radius={24} glow={colors.accent.coral} style={{ marginHorizontal: spacing.md }}>
                        {/* Warm wash layered inside GlassCard, above its blur fill, below the row content */}
                        <LinearGradient
                            colors={[withAlpha(colors.accent.coral, 0.12), withAlpha(colors.accent.coral, 0.03)]}
                            style={StyleSheet.absoluteFillObject}
                            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                            pointerEvents="none"
                        />
                        <View style={styles.profileInner}>
                            {/* Avatar wrapped in a REAL animated progress ring — the arc
                                springs to the live profile-completion %, gamifying the
                                hero instead of the old decorative gradient border. The
                                hole hosts the avatar, or a branded initials / person
                                fallback (never an external random-face service). */}
                            <View style={shadows.glow(colors.accent.coral)}>
                                <ProfileRing progress={completionPct / 100} size={84} strokeWidth={4} color={colors.accent.coral}>
                                    {avatarUrl ? (
                                        <Image
                                            source={avatarUrl}
                                            style={[styles.avatar, { borderColor: colors.background.secondary }]}
                                            cachePolicy="memory-disk"
                                            transition={200}
                                        />
                                    ) : (
                                        <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: withAlpha(colors.accent.coral, 0.14), borderColor: colors.background.secondary }]}>
                                            {initials ? (
                                                <Text style={[typography.h3, { color: colors.accent.coral }]} maxFontSizeMultiplier={1.2}>{initials}</Text>
                                            ) : (
                                                <Ionicons name="person" size={30} color={colors.accent.coral} />
                                            )}
                                        </View>
                                    )}
                                </ProfileRing>
                            </View>
                            <View style={{ marginLeft: spacing.lg, flex: 1 }}>
                                <Text style={[typography.h2, { color: colors.text.primary }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                                    {displayName || 'User'}
                                </Text>
                                <Text style={[typography.bodySm, { color: colors.text.secondary, marginTop: 2 }]} numberOfLines={1} maxFontSizeMultiplier={1.4}>
                                    {displayEmail}
                                </Text>
                                <View style={[styles.badge, { backgroundColor: withAlpha(colors.accent.coral, 0.14), borderColor: withAlpha(colors.accent.coral, 0.30) }]}>
                                    <Ionicons name="flash" size={11} color={colors.accent.coral} />
                                    <Text style={[typography.captionMedium, { color: colors.accent.coral, marginLeft: 5 }]} maxFontSizeMultiplier={1.4}>Zeitra Pro</Text>
                                </View>
                            </View>
                        </View>

                        {/* Hero stat band — big condensed numerals carrying data that
                            means something: a live day streak (lime hero cell), the
                            profile-completion % the ring tracks, and the honest count of
                            hub destinations. Stronger divider + tighter band so it reads
                            as a deliberate stat module on OLED, not an afterthought. */}
                        <View style={[styles.statBand, { borderTopColor: colors.border.light }]}>
                            <View
                                style={styles.statCell}
                                accessibilityRole="text"
                                accessibilityLabel={streakError ? 'Day streak unavailable' : `${streakDays} day streak`}
                            >
                                <Text style={[typography.statMedium, { color: colors.accent.coral }]} maxFontSizeMultiplier={1.25}>
                                    {streakError ? '—' : streakDays}
                                </Text>
                                <Text style={[typography.overline, { color: colors.text.secondary }]} maxFontSizeMultiplier={1.3}>Day Streak</Text>
                            </View>
                            <View style={[styles.statDivider, { backgroundColor: colors.border.light }]} />
                            <View
                                style={styles.statCell}
                                accessibilityRole="text"
                                accessibilityLabel={`Profile ${completionPct} percent complete`}
                            >
                                <Text style={[typography.statMedium, { color: colors.text.primary }]} maxFontSizeMultiplier={1.25}>{completionPct}%</Text>
                                <Text style={[typography.overline, { color: colors.text.secondary }]} maxFontSizeMultiplier={1.3}>Complete</Text>
                            </View>
                            <View style={[styles.statDivider, { backgroundColor: colors.border.light }]} />
                            <View
                                style={styles.statCell}
                                accessibilityRole="text"
                                accessibilityLabel={`${TOTAL_DESTINATIONS} tools`}
                            >
                                <Text style={[typography.statMedium, { color: colors.text.primary }]} maxFontSizeMultiplier={1.25}>{TOTAL_DESTINATIONS}</Text>
                                <Text style={[typography.overline, { color: colors.text.secondary }]} maxFontSizeMultiplier={1.3}>Tools</Text>
                            </View>
                        </View>
                    </GlassCard>
                </Animated.View>

                {/* Settings Sections */}
                {settingsSections.map((section, idx) => (
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
                            {/* Grouped-list wash inside GlassCard, above blur fill, below rows */}
                            <LinearGradient
                                colors={colors.gradients.card}
                                style={StyleSheet.absoluteFillObject}
                                pointerEvents="none"
                            />
                            {section.items.map((item, itemIdx) => {
                                // A row is genuinely actionless only when it has no
                                // route, no external url, and is not a switch. Such a
                                // row is rendered explicitly disabled (dimmed, no
                                // chevron, accessibilityState.disabled) so the UI never
                                // implies a tap target that does nothing.
                                const isDisabled = !item.route && !item.url && !item.isSwitch;
                                return (
                                    <MoreSettingRow
                                        key={itemIdx}
                                        label={item.label}
                                        icon={item.icon}
                                        tint={item.tint}
                                        valueText={typeof item.value === 'string' ? item.value : undefined}
                                        isSwitch={item.isSwitch}
                                        switchValue={item.label === 'Dark Mode' ? theme === 'dark' : (item.value as boolean)}
                                        onSwitchChange={(val) => {
                                            if (item.label === 'Dark Mode') setTheme(val ? 'dark' : 'light');
                                        }}
                                        disabled={isDisabled}
                                        showDivider={itemIdx !== section.items.length - 1}
                                        accessibilityRole={item.isSwitch ? undefined : (item.url ? 'link' : 'button')}
                                        accessibilityLabel={item.isSwitch ? undefined : item.label}
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

                {/* Sign-out Button — bespoke coral outline (not a filled CTA). Reads
                    "Sign out" everywhere (visible + a11y), never the word "Log". */}
                <Animated.View entering={FadeInDown.delay(90 + settingsSections.length * 45).springify().damping(18)}>
                    <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityLabel="Sign out"
                        style={[styles.logoutBtn, { borderColor: withAlpha(colors.accent.coral, 0.40), backgroundColor: withAlpha(colors.accent.coral, 0.08), borderRadius: borderRadius.lg, marginHorizontal: spacing.md }]}
                        onPress={async () => {
                            await useAuthStore.getState().logout();
                            router.replace('/(auth)/login');
                        }}
                        activeOpacity={0.8}
                    >
                        <Ionicons name="log-out-outline" size={18} color={colors.accent.coral} />
                        <Text style={[typography.subhead, { color: colors.accent.coral, fontWeight: '700', marginLeft: spacing.sm }]} maxFontSizeMultiplier={1.4}>Sign out</Text>
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
    // Left gutter unified to spacing.md (12) so the header title's left edge lines
    // up exactly with the card stack (every card uses marginHorizontal: spacing.md),
    // killing the prior 8px vertical-rhythm break.
    header: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 16 },
    profileInner: { flexDirection: 'row', alignItems: 'center', padding: 20 },
    // Avatar nests inside the 84px ProfileRing with a clean gap from the 4px arc.
    avatar: { width: 72, height: 72, borderRadius: 36, borderWidth: 3 },
    avatarFallback: { alignItems: 'center', justifyContent: 'center' },
    badge: { flexDirection: 'row', alignSelf: 'flex-start', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1, marginTop: 10 },
    // 1px (not hairline) top rule reads as a deliberate module boundary on OLED.
    statBand: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, paddingTop: 16, paddingBottom: 16, paddingHorizontal: 8 },
    statCell: { flex: 1, alignItems: 'center', gap: 2 },
    statDivider: { width: 1, height: 28, borderRadius: 1 },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', marginLeft: 12, marginBottom: 8 },
    logoutBtn: { flexDirection: 'row', marginTop: 40, padding: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
});
