import React, { useState, useEffect, useMemo } from 'react';
import {
    View, Text, StyleSheet, ScrollView, Switch, Pressable,
    ActivityIndicator, Alert,
} from 'react-native';
import Animated, { FadeInDown, FadeIn, FadeOut } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
    getNotificationPreferences,
    saveNotificationPreferences,
    type NotificationPreferences,
} from '@/api/notifications';
import { withAlpha } from '@/theme/utils';
import { spacing, borderRadius as br } from '@/theme/spacing';
import { EmptyState, Skeleton, GlassCard, CtaButton } from '@/components/ui';

// ── Preference Categories ─────────────────────────────────────────────────────

// Only the boolean keys — quietHoursStart/End are handled separately
type PrefKey = keyof Omit<NotificationPreferences, 'quietHoursStart' | 'quietHoursEnd'>;

/** Accent key driving each preference row's icon chip — resolved against the
 *  active theme inside the component so the chips re-tint per theme. */
type AccentKey = 'cyan' | 'orange' | 'purple' | 'blue' | 'emerald' | 'amber' | 'red';

interface PreferenceItemBase {
    key: PrefKey;
    label: string;
    description: string;
    icon: string;
    iconColorKey: AccentKey;
    category: string;
}

interface PreferenceItem extends Omit<PreferenceItemBase, 'iconColorKey'> {
    iconColor: string;
}

const PREFERENCE_ITEMS: PreferenceItemBase[] = [
    // Training & Health
    {
        key: 'workoutReminderEnabled',
        label: 'Workout Reminders',
        description: 'Get reminded before your scheduled workouts',
        icon: 'barbell-outline',
        iconColorKey: 'cyan',
        category: 'Training & Health',
    },
    {
        key: 'mealReminderEnabled',
        label: 'Meal & Nutrition',
        description: 'Reminders to log meals and chrono-nutrition tips',
        icon: 'restaurant-outline',
        // Functional warm hue — NOT the reserved brand lime (accent.coral). A
        // single non-primary toggle must not borrow "the" accent; orange reads
        // as warmth/food and keeps lime exclusive to the one primary action.
        iconColorKey: 'orange',
        category: 'Training & Health',
    },
    {
        key: 'shiftAlertEnabled',
        label: 'Shift Alerts',
        description: 'Pre-shift prep and circadian rhythm notifications',
        icon: 'time-outline',
        iconColorKey: 'purple',
        category: 'Training & Health',
    },
    {
        key: 'sleepReminderEnabled',
        label: 'Sleep Reminders',
        description: 'Wind-down and sleep hygiene reminders',
        icon: 'bed-outline',
        iconColorKey: 'blue',
        category: 'Training & Health',
    },
    {
        key: 'planReadyEnabled',
        label: 'Plan Ready',
        description: 'Notified when your daily workout or meal plan is ready',
        icon: 'checkmark-circle-outline',
        iconColorKey: 'emerald',
        category: 'Training & Health',
    },
    {
        key: 'adherenceAlertEnabled',
        label: 'Adherence Alerts',
        description: 'Gentle nudges when you fall behind your nutrition plan',
        icon: 'alert-circle-outline',
        iconColorKey: 'amber',
        category: 'Training & Health',
    },

    // Progress & Insights
    {
        key: 'weeklyReportEnabled',
        label: 'Weekly Report',
        description: 'Your weekly performance summary from Coach Ria',
        icon: 'analytics-outline',
        iconColorKey: 'emerald',
        category: 'Progress & Insights',
    },
    {
        key: 'streakUpdateEnabled',
        label: 'Streak Updates',
        description: 'Stay motivated with streak milestones and warnings',
        icon: 'flame-outline',
        iconColorKey: 'red',
        category: 'Progress & Insights',
    },

    // Coaching
    {
        key: 'coachMessageEnabled',
        label: 'Coach Messages',
        description: 'Messages and check-ins from your AI Coach Ria',
        icon: 'chatbubble-ellipses-outline',
        iconColorKey: 'purple',
        category: 'Coaching',
    },
];

const BOOLEAN_PREF_KEYS: PrefKey[] = PREFERENCE_ITEMS.map(i => i.key);

// Each category gets a quiet leading glyph for its overline header. The icon is
// the only decoration on the header — it stays neutral (text.secondary), never
// lime, so lime is reserved for the one primary action + the live "on" count.
const CATEGORY_ICONS: Record<string, string> = {
    'Training & Health': 'fitness-outline',
    'Progress & Insights': 'trending-up-outline',
    Coaching: 'sparkles-outline',
};

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function NotificationPreferencesScreen() {
    const { colors, typography } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();

    const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
    const [hasChanges, setHasChanges] = useState(false);
    // Outcome of the LAST save attempt — null = idle (no banner), 'success' /
    // 'error' = show the inline status surface. This is genuine state (the real
    // result of the mutation), not a derived visual; the banner JSX is derived
    // from it. We surface save feedback INLINE (a GlassCard the screen reader
    // announces via role="alert" + a polite live region) instead of Alert.alert,
    // matching the inline-notice pattern used by devices.tsx / circadian.tsx.
    const [saveStatus, setSaveStatus] = useState<null | 'success' | 'error'>(null);
    // Local UI state — Quiet Hours section expand/collapse
    const [quietHoursExpanded, setQuietHoursExpanded] = useState(true);

    const prefsQuery = useQuery({
        queryKey: ['notification-preferences'],
        queryFn: getNotificationPreferences,
    });

    useEffect(() => {
        if (prefsQuery.data && !prefs) {
            setPrefs(prefsQuery.data);
        }
    }, [prefsQuery.data, prefs]);

    const saveMutation = useMutation({
        mutationFn: (p: Partial<NotificationPreferences>) => saveNotificationPreferences(p),
        onSuccess: () => {
            setHasChanges(false);
            setSaveStatus('success');
        },
        onError: () => {
            setSaveStatus('error');
        },
    });

    const toggle = (key: PrefKey) => {
        if (!prefs) return;
        setPrefs({ ...prefs, [key]: !prefs[key] });
        setHasChanges(true);
    };

    const handleSave = () => {
        if (!prefs) return;
        // Reset the inline banner so a fresh attempt starts clean — the next
        // onSuccess/onError sets it again. (A retry from the error banner also
        // routes through here, clearing the stale 'error' before re-saving.)
        setSaveStatus(null);
        saveMutation.mutate(prefs);
    };

    // The FROM/TO chips are now real role="button" controls. An on-device time
    // picker isn't wired into this screen's data path (no mutation changes the
    // quiet-hours window here), so the control surfaces where editing lives
    // rather than presenting a dead, button-looking chip. This keeps the
    // affordance honest (tappable + announced) without inventing data wiring or
    // pulling in a new picker dependency.
    const handleEditQuietHours = () => {
        Alert.alert(
            'Quiet Hours',
            'Adjust your sleep window in Settings → Sleep & Circadian. Quiet Hours follows the schedule you set there.',
        );
    };

    // Group items by category, resolving each row's icon chip colour against the
    // active theme so the chips re-tint when the user switches themes.
    const categories = useMemo(
        () => PREFERENCE_ITEMS.reduce<Record<string, PreferenceItem[]>>((acc, base) => {
            const item: PreferenceItem = { ...base, iconColor: colors.accent[base.iconColorKey] };
            if (!acc[item.category]) acc[item.category] = [];
            acc[item.category]!.push(item);
            return acc;
        }, {}),
        [colors],
    );

    const categoryEntries = Object.entries(categories);

    // Error (and no cached prefs to fall back on): show a friendly retry state
    // instead of a spinner that would otherwise hang forever.
    if (prefsQuery.isError && !prefs) {
        return (
            <View style={[styles.container, { backgroundColor: colors.background.primary, paddingTop: insets.top }]}>
                <Header router={router} colors={colors} typography={typography} hasChanges={false} onSave={handleSave} isSaving={false} />
                <EmptyState
                    icon="cloud-offline-outline"
                    title="Couldn't load preferences"
                    subtitle="We couldn't fetch your notification settings. Check your connection and try again."
                    actionLabel="Try Again"
                    onAction={() => prefsQuery.refetch()}
                />
            </View>
        );
    }

    if (prefsQuery.isLoading || !prefs) {
        return (
            <View style={[styles.container, { backgroundColor: colors.background.primary, paddingTop: insets.top }]}>
                <Header router={router} colors={colors} typography={typography} hasChanges={false} onSave={handleSave} isSaving={false} />
                <ScrollView showsVerticalScrollIndicator={false} scrollEnabled={false} contentContainerStyle={{ paddingBottom: 100 }}>
                    {/* Info banner placeholder */}
                    <Skeleton width="auto" height={56} radius={br.lg} style={{ marginHorizontal: spacing.xl, marginTop: spacing.lg }} />

                    {/* Two category groups, each with a header + a few rows */}
                    {[3, 2].map((rowCount, groupIdx) => (
                        <View key={groupIdx} style={{ marginBottom: spacing.sm }}>
                            <Skeleton width="40%" height={11} radius={br.sm} style={{ marginHorizontal: spacing.xl, marginTop: spacing['2xl'], marginBottom: spacing.sm }} />
                            <View style={[styles.section, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
                                {Array.from({ length: rowCount }).map((_, idx) => (
                                    <View key={idx} style={styles.prefRow}>
                                        <Skeleton width={40} height={40} radius={20} />
                                        <View style={{ flex: 1, marginHorizontal: 14 }}>
                                            <Skeleton width="50%" height={16} radius={br.sm} />
                                            <Skeleton width="80%" height={12} radius={br.sm} style={{ marginTop: 6 }} />
                                        </View>
                                        <Skeleton width={44} height={26} radius={br.full} />
                                    </View>
                                ))}
                            </View>
                        </View>
                    ))}
                </ScrollView>
            </View>
        );
    }

    // How many categories rendered before Quiet Hours — used to keep the
    // staggered entrance delays monotonic across the whole list.
    const sectionCount = categoryEntries.length;

    return (
        <View style={[styles.container, { backgroundColor: colors.background.primary, paddingTop: insets.top }]}>
            <StatusBar style="light" />
            <Header
                router={router}
                colors={colors}
                typography={typography}
                hasChanges={hasChanges}
                onSave={handleSave}
                isSaving={saveMutation.isPending}
            />

            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: (hasChanges ? 132 : spacing['4xl']) + insets.bottom }}
            >
                {/* Info Banner */}
                <Animated.View entering={FadeInDown.duration(360).springify().damping(18)}>
                    <View style={[styles.infoBanner, { backgroundColor: withAlpha(colors.accent.cyan, 0.1), borderColor: withAlpha(colors.accent.cyan, 0.25) }]}>
                        <Ionicons name="information-circle-outline" size={18} color={colors.accent.cyan} />
                        <Text style={[typography.caption, { color: colors.text.secondary, marginLeft: 10, flex: 1, lineHeight: 18 }]}>
                            Customize which alerts you receive. Critical shift and health alerts may still appear when disabled.
                        </Text>
                    </View>
                </Animated.View>

                {/* Inline save-feedback status surface (replaces the old
                    Alert.alert on the save path). Rendered with an explicit
                    ternary-null per rules/rendering-no-falsy-and.md — saveStatus
                    is null | 'success' | 'error', never a falsy 0/"" that could
                    leak into the JSX tree. As a GlassCard from @/components/ui (no
                    inline glass), it carries accessibilityRole="alert" + a polite
                    live region so a screen reader announces the result as a
                    status. The error variant offers a working Retry that
                    re-invokes handleSave. */}
                {saveStatus === 'success' ? (
                    <Animated.View entering={FadeIn.duration(220)}>
                        <GlassCard radius={br.lg} style={styles.statusCard} testID="save-status-success">
                            <View style={styles.statusRow}>
                                {/* The a11y alert semantics live on this inner View
                                    (NOT the GlassCard, which only forwards
                                    style/radius/testID), mirroring devices.tsx: ONE
                                    accessible node — icon + copy — that a screen reader
                                    announces as a polite live region, its label the
                                    verbatim visible copy. The Dismiss control is a
                                    SIBLING (not a child) so it stays independently
                                    focusable rather than being collapsed into the
                                    alert. */}
                                <View
                                    style={styles.statusContent}
                                    accessible
                                    accessibilityRole="alert"
                                    accessibilityLiveRegion="polite"
                                    accessibilityLabel="Saved. Your notification preferences have been updated."
                                >
                                    <Ionicons name="checkmark-circle" size={20} color={colors.accent.emerald} />
                                    <Text style={[typography.subhead, styles.statusText, { color: colors.text.primary }]}>
                                        Saved. Your notification preferences have been updated.
                                    </Text>
                                </View>
                                <Pressable
                                    onPress={() => setSaveStatus(null)}
                                    accessibilityRole="button"
                                    accessibilityLabel="Dismiss"
                                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                    style={styles.statusDismiss}
                                    testID="save-status-dismiss"
                                >
                                    <Ionicons name="close" size={18} color={colors.text.tertiary} />
                                </Pressable>
                            </View>
                        </GlassCard>
                    </Animated.View>
                ) : null}

                {saveStatus === 'error' ? (
                    <Animated.View entering={FadeIn.duration(220)}>
                        <GlassCard radius={br.lg} style={styles.statusCard} testID="save-status-error">
                            <View style={styles.statusRow}>
                                {/* a11y alert semantics on the inner content View (see
                                    the success variant above). The Retry Pressable is a
                                    SIBLING and re-invokes handleSave — the genuine save
                                    path — never a fabricated success. */}
                                <View
                                    style={styles.statusContent}
                                    accessible
                                    accessibilityRole="alert"
                                    accessibilityLiveRegion="polite"
                                    accessibilityLabel="Save failed. Try again."
                                >
                                    <Ionicons name="alert-circle" size={20} color={colors.accent.red} />
                                    <Text style={[typography.subhead, styles.statusText, { color: colors.text.primary }]}>
                                        Save failed
                                    </Text>
                                </View>
                                <Pressable
                                    onPress={handleSave}
                                    disabled={saveMutation.isPending}
                                    accessibilityRole="button"
                                    accessibilityLabel="Try again"
                                    accessibilityState={{ disabled: saveMutation.isPending, busy: saveMutation.isPending }}
                                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                    style={({ pressed }) => [
                                        styles.retryBtn,
                                        {
                                            borderColor: withAlpha(colors.accent.red, 0.4),
                                            backgroundColor: withAlpha(colors.accent.red, pressed ? 0.16 : 0.08),
                                        },
                                    ]}
                                    testID="save-status-retry"
                                >
                                    <Ionicons name="refresh-outline" size={15} color={colors.accent.red} />
                                    <Text style={[typography.caption, styles.retryLabel, { color: colors.accent.red }]}>
                                        Try again
                                    </Text>
                                </Pressable>
                            </View>
                        </GlassCard>
                    </Animated.View>
                ) : null}

                {/* Category Groups — or, defensively, an empty state if the
                    catalog ever renders zero categories (so the screen is never a
                    blank scroll: icon + one line of guidance + a CTA back). */}
                {categoryEntries.length === 0 ? (
                    <EmptyState
                        icon="notifications-outline"
                        title="No notifications to tune"
                        subtitle="There are no alert categories to configure right now. Check back after you set up your plan."
                        actionLabel="Back to Settings"
                        onAction={() => router.back()}
                    />
                ) : (
                    categoryEntries.map(([category, items], sectionIdx) => {
                        const onCount = items.filter(i => prefs[i.key] as boolean).length;
                        return (
                            <Animated.View
                                key={category}
                                entering={FadeInDown.delay(60 + sectionIdx * 60).duration(360).springify().damping(18)}
                                style={{ marginBottom: spacing.sm }}
                            >
                                <SectionHeader
                                    label={category}
                                    icon={CATEGORY_ICONS[category] ?? 'ellipse-outline'}
                                    onCount={onCount}
                                    total={items.length}
                                    colors={colors}
                                    typography={typography}
                                />

                                <View style={[styles.section, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
                                    {items.map((item, idx) => (
                                        <View key={item.key}>
                                            {idx > 0 && <View style={[styles.divider, { backgroundColor: colors.border.default }]} />}
                                            <View style={styles.prefRow}>
                                                <View style={[styles.iconBox, { backgroundColor: withAlpha(item.iconColor, 0.12) }]}>
                                                    <Ionicons name={item.icon as any} size={20} color={item.iconColor} />
                                                </View>
                                                <View style={{ flex: 1, marginHorizontal: 14 }}>
                                                    <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: '600' }]}>
                                                        {item.label}
                                                    </Text>
                                                    <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 2, lineHeight: 17 }]}>
                                                        {item.description}
                                                    </Text>
                                                </View>
                                                <Switch
                                                    accessibilityRole="switch"
                                                    accessibilityLabel={item.label}
                                                    accessibilityState={{ checked: prefs[item.key] as boolean }}
                                                    value={prefs[item.key] as boolean}
                                                    onValueChange={() => toggle(item.key)}
                                                    // Toggles render LIME when on (mockup + wave spec): the brand
                                                    // accent owns the "on" state. The per-category iconColor still
                                                    // tints the leading icon chip; only the track adopts lime.
                                                    trackColor={{ false: colors.border.default, true: colors.accent.coral }}
                                                    thumbColor={colors.text.primary}
                                                    ios_backgroundColor={colors.background.tertiary}
                                                />
                                            </View>
                                        </View>
                                    ))}
                                </View>
                            </Animated.View>
                        );
                    })
                )}

                {/* Quiet Hours Section */}
                <Animated.View entering={FadeInDown.delay(60 + sectionCount * 60).duration(360).springify().damping(18)}>
                    <SectionHeader
                        label="Quiet Hours"
                        icon="moon-outline"
                        colors={colors}
                        typography={typography}
                    />

                    <View style={[styles.section, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
                        {/* Toggle to show/hide the time pickers */}
                        <View style={styles.prefRow}>
                            <View style={[styles.iconBox, { backgroundColor: withAlpha(colors.accent.blue, 0.12) }]}>
                                <Ionicons name="moon-outline" size={20} color={colors.accent.blue} />
                            </View>
                            <View style={{ flex: 1, marginHorizontal: 14 }}>
                                <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: '600' }]}>
                                    Quiet Hours
                                </Text>
                                <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 2, lineHeight: 17 }]}>
                                    Suppress non-critical notifications during sleep hours
                                </Text>
                            </View>
                            <Switch
                                accessibilityRole="switch"
                                accessibilityLabel="Quiet Hours"
                                accessibilityState={{ checked: quietHoursExpanded }}
                                value={quietHoursExpanded}
                                onValueChange={setQuietHoursExpanded}
                                // Lime "on" track (mockup + wave spec) — consistent with every
                                // other toggle on this screen; the blue stays on the icon chip.
                                trackColor={{ false: colors.border.default, true: colors.accent.coral }}
                                thumbColor={colors.text.primary}
                                ios_backgroundColor={colors.background.tertiary}
                            />
                        </View>

                        {/* Time range display — shown when quiet hours is toggled on.
                            A visual FROM → TO timeline (not a text date list) makes
                            the shift legible at a glance. The reveal animates with
                            the same FadeInDown spring / FadeOut used across the
                            screen instead of popping in/out (MOTION: spring,
                            transform/opacity only). */}
                        {quietHoursExpanded ? (
                            <Animated.View
                                entering={FadeInDown.duration(240).springify().damping(18)}
                                exiting={FadeOut.duration(160)}
                                style={[styles.quietHoursRow, { borderTopColor: colors.border.default }]}
                            >
                                <TimeDisplay label="FROM" time={prefs.quietHoursStart} colors={colors} typography={typography} iconColor={colors.accent.blue} onPress={handleEditQuietHours} />
                                <Ionicons name="arrow-forward" size={16} color={colors.text.tertiary} />
                                <TimeDisplay label="TO" time={prefs.quietHoursEnd} colors={colors} typography={typography} iconColor={colors.accent.blue} onPress={handleEditQuietHours} />
                            </Animated.View>
                        ) : null}
                    </View>
                </Animated.View>

                {/* ── Danger Zone — destructive controls, visually separated and
                    red-tinted so they never read as a normal row. ─────────────── */}
                <Animated.View entering={FadeInDown.delay(60 + (sectionCount + 1) * 60).duration(360).springify().damping(18)}>
                    <SectionHeader
                        label="Danger Zone"
                        icon="warning-outline"
                        tone={colors.accent.red}
                        colors={colors}
                        typography={typography}
                    />

                    {/* Master Disable Banner — destructive: RED + separated, never
                        the brand lime. Pressable (not activeOpacity) so it shares
                        the same pressed-scale micro-interaction as the CTA. */}
                    <View style={{ paddingHorizontal: spacing.xl }}>
                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Disable All Non-Critical Notifications"
                            style={({ pressed }) => [
                                styles.disableAllBtn,
                                {
                                    borderColor: withAlpha(colors.accent.red, 0.4),
                                    backgroundColor: withAlpha(colors.accent.red, pressed ? 0.12 : 0.06),
                                },
                                pressed && { transform: [{ scale: 0.97 }] },
                            ]}
                            onPress={() => {
                                Alert.alert(
                                    'Disable All Notifications',
                                    'This will turn off all non-critical notifications. You can re-enable them at any time.',
                                    [
                                        { text: 'Cancel', style: 'cancel' },
                                        {
                                            text: 'Disable All',
                                            style: 'destructive',
                                            onPress: () => {
                                                const allOff = BOOLEAN_PREF_KEYS.reduce<Partial<NotificationPreferences>>(
                                                    (acc, key) => ({ ...acc, [key]: false }),
                                                    {},
                                                );
                                                setPrefs(p => p ? { ...p, ...allOff } : p);
                                                setHasChanges(true);
                                            },
                                        },
                                    ],
                                );
                            }}
                        >
                            <Ionicons name="notifications-off-outline" size={18} color={colors.accent.red} />
                            <Text style={[typography.subhead, { color: colors.accent.red, fontWeight: '700', marginLeft: 10 }]}>
                                Disable All Non-Critical Notifications
                            </Text>
                        </Pressable>
                    </View>
                </Animated.View>

                {/* System-level notification link */}
                <Animated.View entering={FadeInDown.delay(60 + (sectionCount + 2) * 60).duration(360).springify().damping(18)}>
                    <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Manage system notification permissions"
                        style={({ pressed }) => [
                            styles.systemLink,
                            pressed && { transform: [{ scale: 0.97 }] },
                        ]}
                        onPress={() => Alert.alert('Open Settings', 'Go to Settings → Notifications → Zeitra to manage system-level permissions.')}
                    >
                        <Ionicons name="settings-outline" size={16} color={colors.text.tertiary} />
                        <Text style={[typography.caption, { color: colors.text.secondary, marginLeft: 8 }]}>
                            Manage system notification permissions
                        </Text>
                        <Ionicons name="chevron-forward" size={14} color={colors.text.tertiary} style={{ marginLeft: 4 }} />
                    </Pressable>
                </Animated.View>
            </ScrollView>

            {/* ── Thumb-zone primary CTA ────────────────────────────────────────
                The one primary action lives in the bottom third, ink-on-lime, and
                slides up only when there are unsaved edits — so the bright lime
                fill is reserved for the single decision the screen is asking for.
                It re-invokes the SAME handleSave path as the header Save (which is
                preserved above for parity / muscle memory). */}
            {hasChanges ? (
                <Animated.View
                    entering={FadeInDown.duration(260).springify().damping(20)}
                    style={[
                        styles.ctaBar,
                        {
                            paddingBottom: insets.bottom + spacing.md,
                            backgroundColor: withAlpha(colors.background.primary, 0.92),
                            borderTopColor: colors.border.default,
                        },
                    ]}
                >
                    <CtaButton
                        label="Save Changes"
                        icon="checkmark"
                        size="lg"
                        loading={saveMutation.isPending}
                        onPress={handleSave}
                        accessibilityLabel="Save notification preferences"
                        testID="save-cta"
                    />
                </Animated.View>
            ) : null}
        </View>
    );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Header({ router, colors, typography, hasChanges, onSave, isSaving }: any) {
    return (
        <View style={[styles.header, { borderBottomColor: colors.border.default }]}>
            <Pressable
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel="Go back"
                onPress={() => router.back()}
                style={({ pressed }) => [{ padding: 4 }, pressed && { transform: [{ scale: 0.96 }] }]}
            >
                <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
            </Pressable>
            <Text style={[typography.heading, { color: colors.text.primary, fontSize: 18, fontWeight: '800' }]}>
                Notification Settings
            </Text>
            {/* Header Save is NEUTRAL (text.primary / text.tertiary), not lime —
                the single bright-lime save affordance is the thumb-zone CtaButton.
                Two simultaneous lime save controls would dilute the 10% accent. */}
            <Pressable
                onPress={onSave}
                disabled={!hasChanges || isSaving}
                accessibilityRole="button"
                accessibilityLabel="Save notification preferences"
                accessibilityState={{ disabled: !hasChanges || isSaving, busy: isSaving }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={({ pressed }) => [{ padding: 4 }, pressed && { transform: [{ scale: 0.96 }] }]}
            >
                {isSaving ? (
                    <ActivityIndicator size="small" color={colors.text.secondary} />
                ) : (
                    <Text style={[typography.caption, {
                        color: hasChanges ? colors.text.primary : colors.text.tertiary,
                        fontWeight: 'bold',
                        fontSize: 14,
                    }]}>
                        Save
                    </Text>
                )}
            </Pressable>
        </View>
    );
}

// Grouped-list section header: quiet leading glyph + overline label, with a
// trailing live "N on" count as the data that dominates the label. The count
// pill stays NEUTRAL (text.secondary on background.tertiary) for the normal
// 0..n-1 case — a pill reading "1/6 on" is not a primary action and must not
// borrow the reserved lime. A faint lime tint is reserved for the genuine
// all-on state only (a real "everything armed" indicator). When `tone` is
// passed (Danger Zone) the glyph + label adopt that hue instead.
function SectionHeader({ label, icon, onCount, total, tone, colors, typography }: any) {
    const headerColor = tone ?? colors.text.secondary;
    const showCount = typeof onCount === 'number' && typeof total === 'number';
    const allOn = showCount && total > 0 && onCount === total;
    return (
        <View
            style={styles.sectionHeader}
            accessibilityRole="header"
            accessibilityLabel={showCount ? `${label}, ${onCount} of ${total} on` : label}
        >
            <Ionicons name={icon} size={14} color={headerColor} />
            <Text style={[typography.overline, { color: headerColor, marginLeft: 6 }]}>
                {label}
            </Text>
            <View style={styles.sectionHeaderSpacer} />
            {showCount ? (
                <View
                    style={[
                        styles.countPill,
                        {
                            backgroundColor: allOn
                                ? withAlpha(colors.accent.coral, 0.14)
                                : colors.background.tertiary,
                        },
                    ]}
                >
                    <Text
                        style={[
                            typography.caption,
                            styles.countText,
                            { color: allOn ? colors.accent.coral : colors.text.secondary },
                        ]}
                    >
                        {onCount}/{total} on
                    </Text>
                </View>
            ) : null}
        </View>
    );
}

// A real role="button" control — not a dead, button-looking chip. Tappable
// (opens the edit affordance via onPress), announced ("Quiet hours start,
// 22:00, change"), >= 44pt target, and shares the pressed-scale 0.96 micro-
// interaction used elsewhere.
function TimeDisplay({ label, time, colors, typography, iconColor, onPress }: any) {
    return (
        <View style={{ alignItems: 'center' }}>
            <Text style={[typography.caption, { color: colors.text.secondary, fontSize: 10, fontWeight: 'bold', marginBottom: 4 }]}>
                {label}
            </Text>
            <Pressable
                onPress={onPress}
                accessibilityRole="button"
                accessibilityLabel={`Quiet hours ${label === 'FROM' ? 'start' : 'end'}, ${time}, change`}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={({ pressed }) => [
                    styles.timeBox,
                    { backgroundColor: withAlpha(iconColor, pressed ? 0.18 : 0.1), borderColor: withAlpha(iconColor, 0.3) },
                    pressed && { transform: [{ scale: 0.96 }] },
                ]}
            >
                <Text style={[typography.subhead, { color: iconColor, fontWeight: '700', fontSize: 16 }]}>
                    {time}
                </Text>
            </Pressable>
        </View>
    );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: spacing.xl,
        paddingVertical: spacing.md,
        borderBottomWidth: 1,
    },
    infoBanner: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginHorizontal: spacing.xl,
        marginTop: spacing.lg,
        padding: spacing.lg,
        borderRadius: 14,
        borderWidth: 1,
    },
    // Inline save-feedback surface (GlassCard wrapper margins; the GlassCard owns
    // the frosted fill + hairline border + radius).
    statusCard: {
        marginHorizontal: spacing.xl,
        marginTop: spacing.lg,
    },
    statusRow: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: spacing.lg,
    },
    // The announced alert content (icon + copy). Flexes to fill the row so the
    // trailing Dismiss/Retry sibling sits flush right.
    statusContent: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
    },
    statusText: {
        flex: 1,
        marginLeft: spacing.md,
        fontWeight: '600',
        lineHeight: 19,
    },
    statusDismiss: {
        marginLeft: spacing.sm,
        padding: spacing.xs,
    },
    retryBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        marginLeft: spacing.sm,
        minHeight: 44,
        paddingHorizontal: spacing.lg,
        borderRadius: br.lg,
        borderWidth: 1,
    },
    retryLabel: {
        fontWeight: '700',
    },
    // Grouped-section header (leading glyph + overline label + trailing count).
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: spacing.xl,
        paddingTop: spacing['2xl'],
        paddingBottom: spacing.sm,
    },
    sectionHeaderSpacer: { flex: 1 },
    countPill: {
        paddingHorizontal: spacing.sm,
        paddingVertical: 3,
        borderRadius: br.full,
    },
    countText: {
        fontWeight: '700',
        fontSize: 11,
        letterSpacing: 0.3,
    },
    section: {
        marginHorizontal: spacing.xl,
        borderRadius: 20,
        borderWidth: 1,
        overflow: 'hidden',
    },
    prefRow: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: spacing.lg,
    },
    iconBox: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    divider: {
        height: 1,
        marginLeft: 70,
    },
    quietHoursRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        paddingVertical: 16,
        borderTopWidth: 1,
        marginHorizontal: 16,
        marginBottom: 4,
    },
    timeBox: {
        minHeight: 44,
        minWidth: 88,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 10,
        borderWidth: 1,
    },
    disableAllBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderRadius: 14,
        padding: 14,
    },
    systemLink: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: spacing.xl,
        paddingVertical: spacing.xl,
    },
    // Thumb-zone CTA bar — pinned to the bottom third, hairline top divider, the
    // single bright-lime decision surface.
    ctaBar: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        paddingHorizontal: spacing.xl,
        paddingTop: spacing.md,
        borderTopWidth: 1,
    },
});
