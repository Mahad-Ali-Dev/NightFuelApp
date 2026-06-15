import React, { useState, useEffect, useMemo } from 'react';
import {
    View, Text, StyleSheet, ScrollView, Switch, TouchableOpacity,
    ActivityIndicator, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
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
import { colors as palette } from '@/theme/colors';
import { spacing, borderRadius as br } from '@/theme/spacing';
import { EmptyState, Skeleton } from '@/components/ui';

// ── Preference Categories ─────────────────────────────────────────────────────

// Only the boolean keys — quietHoursStart/End are handled separately
type PrefKey = keyof Omit<NotificationPreferences, 'quietHoursStart' | 'quietHoursEnd'>;

interface PreferenceItem {
    key: PrefKey;
    label: string;
    description: string;
    icon: string;
    iconColor: string;
    category: string;
}

const PREFERENCE_ITEMS: PreferenceItem[] = [
    // Training & Health
    {
        key: 'workoutReminderEnabled',
        label: 'Workout Reminders',
        description: 'Get reminded before your scheduled workouts',
        icon: 'barbell-outline',
        iconColor: palette.accent.cyan,
        category: 'Training & Health',
    },
    {
        key: 'mealReminderEnabled',
        label: 'Meal & Nutrition',
        description: 'Reminders to log meals and chrono-nutrition tips',
        icon: 'restaurant-outline',
        iconColor: palette.accent.coral,
        category: 'Training & Health',
    },
    {
        key: 'shiftAlertEnabled',
        label: 'Shift Alerts',
        description: 'Pre-shift prep and circadian rhythm notifications',
        icon: 'time-outline',
        iconColor: palette.accent.purple,
        category: 'Training & Health',
    },
    {
        key: 'sleepReminderEnabled',
        label: 'Sleep Reminders',
        description: 'Wind-down and sleep hygiene reminders',
        icon: 'bed-outline',
        iconColor: palette.accent.blue,
        category: 'Training & Health',
    },
    {
        key: 'planReadyEnabled',
        label: 'Plan Ready',
        description: 'Notified when your daily workout or meal plan is ready',
        icon: 'checkmark-circle-outline',
        iconColor: palette.accent.emerald,
        category: 'Training & Health',
    },
    {
        key: 'adherenceAlertEnabled',
        label: 'Adherence Alerts',
        description: 'Gentle nudges when you fall behind your nutrition plan',
        icon: 'alert-circle-outline',
        iconColor: palette.accent.amber,
        category: 'Training & Health',
    },

    // Progress & Insights
    {
        key: 'weeklyReportEnabled',
        label: 'Weekly Report',
        description: 'Your weekly performance summary from Coach Ria',
        icon: 'analytics-outline',
        iconColor: palette.accent.emerald,
        category: 'Progress & Insights',
    },
    {
        key: 'streakUpdateEnabled',
        label: 'Streak Updates',
        description: 'Stay motivated with streak milestones and warnings',
        icon: 'flame-outline',
        iconColor: palette.accent.red,
        category: 'Progress & Insights',
    },

    // Coaching
    {
        key: 'coachMessageEnabled',
        label: 'Coach Messages',
        description: 'Messages and check-ins from your AI Coach Ria',
        icon: 'chatbubble-ellipses-outline',
        iconColor: palette.accent.purple,
        category: 'Coaching',
    },
];

const BOOLEAN_PREF_KEYS: PrefKey[] = PREFERENCE_ITEMS.map(i => i.key);

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function NotificationPreferencesScreen() {
    const { colors, typography } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();

    const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
    const [hasChanges, setHasChanges] = useState(false);
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
            Alert.alert('Saved', 'Your notification preferences have been updated.');
        },
        onError: () => {
            Alert.alert('Error', 'Failed to save preferences. Please try again.');
        },
    });

    const toggle = (key: PrefKey) => {
        if (!prefs) return;
        setPrefs({ ...prefs, [key]: !prefs[key] });
        setHasChanges(true);
    };

    const handleSave = () => {
        if (prefs) saveMutation.mutate(prefs);
    };

    // Group items by category. PREFERENCE_ITEMS is a module-level constant, so
    // this grouping is computed once instead of on every render.
    const categories = useMemo(
        () => PREFERENCE_ITEMS.reduce<Record<string, PreferenceItem[]>>((acc, item) => {
            if (!acc[item.category]) acc[item.category] = [];
            acc[item.category]!.push(item);
            return acc;
        }, {}),
        [],
    );

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
                        <View key={groupIdx} style={{ marginBottom: 8 }}>
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

    return (
        <View style={[styles.container, { backgroundColor: colors.background.primary, paddingTop: insets.top }]}>
            <Header
                router={router}
                colors={colors}
                typography={typography}
                hasChanges={hasChanges}
                onSave={handleSave}
                isSaving={saveMutation.isPending}
            />

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
                {/* Info Banner */}
                <View style={[styles.infoBanner, { backgroundColor: withAlpha(colors.accent.cyan, 0.1), borderColor: withAlpha(colors.accent.cyan, 0.25) }]}>
                    <Ionicons name="information-circle-outline" size={18} color={colors.accent.cyan} />
                    <Text style={[typography.caption, { color: colors.text.secondary, marginLeft: 10, flex: 1, lineHeight: 18 }]}>
                        Customize which alerts you receive. Critical shift and health alerts may still appear when disabled.
                    </Text>
                </View>

                {/* Category Groups */}
                {Object.entries(categories).map(([category, items]) => (
                    <View key={category} style={{ marginBottom: 8 }}>
                        <Text style={[typography.caption, {
                            color: colors.text.secondary,
                            fontWeight: 'bold',
                            letterSpacing: 1,
                            fontSize: 11,
                            paddingHorizontal: 20,
                            paddingTop: 24,
                            paddingBottom: 8,
                        }]}>
                            {category.toUpperCase()}
                        </Text>

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
                                            trackColor={{ false: colors.border.default, true: withAlpha(item.iconColor, 0.4) }}
                                            thumbColor={prefs[item.key] ? item.iconColor : colors.text.tertiary}
                                            ios_backgroundColor={colors.background.tertiary}
                                        />
                                    </View>
                                </View>
                            ))}
                        </View>
                    </View>
                ))}

                {/* Quiet Hours Section */}
                <Text style={[typography.caption, {
                    color: colors.text.secondary,
                    fontWeight: 'bold',
                    letterSpacing: 1,
                    fontSize: 11,
                    paddingHorizontal: 20,
                    paddingTop: 24,
                    paddingBottom: 8,
                }]}>
                    QUIET HOURS
                </Text>

                <View style={[styles.section, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
                    {/* Toggle to show/hide the time pickers */}
                    <View style={styles.prefRow}>
                        <View style={[styles.iconBox, { backgroundColor: withAlpha(palette.accent.blue, 0.12) }]}>
                            <Ionicons name="moon-outline" size={20} color={palette.accent.blue} />
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
                            trackColor={{ false: colors.border.default, true: withAlpha(palette.accent.blue, 0.4) }}
                            thumbColor={quietHoursExpanded ? palette.accent.blue : colors.text.tertiary}
                            ios_backgroundColor={colors.background.tertiary}
                        />
                    </View>

                    {/* Time range display — shown when quiet hours is toggled on */}
                    {quietHoursExpanded && (
                        <View style={[styles.quietHoursRow, { borderTopColor: colors.border.default }]}>
                            <TimeDisplay label="FROM" time={prefs.quietHoursStart} colors={colors} typography={typography} iconColor={palette.accent.blue} />
                            <Ionicons name="arrow-forward" size={16} color={colors.text.tertiary} />
                            <TimeDisplay label="TO" time={prefs.quietHoursEnd} colors={colors} typography={typography} iconColor={palette.accent.blue} />
                        </View>
                    )}
                </View>

                {/* Master Disable Banner */}
                <View style={{ paddingHorizontal: 20, marginTop: 24 }}>
                    <TouchableOpacity
                        activeOpacity={0.85}
                        accessibilityRole="button"
                        accessibilityLabel="Disable All Non-Critical Notifications"
                        style={[styles.disableAllBtn, { borderColor: withAlpha(colors.accent.coral, 0.4), backgroundColor: withAlpha(colors.accent.coral, 0.06) }]}
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
                        <Ionicons name="notifications-off-outline" size={18} color={colors.accent.coral} />
                        <Text style={[typography.caption, { color: colors.accent.coral, fontWeight: 'bold', marginLeft: 10 }]}>
                            Disable All Non-Critical Notifications
                        </Text>
                    </TouchableOpacity>
                </View>

                {/* System-level notification link */}
                <TouchableOpacity
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel="Manage system notification permissions"
                    style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 20 }}
                    onPress={() => Alert.alert('Open Settings', 'Go to Settings → Notifications → NightFuel to manage system-level permissions.')}
                >
                    <Ionicons name="settings-outline" size={16} color={colors.text.tertiary} />
                    <Text style={[typography.caption, { color: colors.text.secondary, marginLeft: 8 }]}>
                        Manage system notification permissions
                    </Text>
                    <Ionicons name="chevron-forward" size={14} color={colors.text.tertiary} style={{ marginLeft: 4 }} />
                </TouchableOpacity>
            </ScrollView>
        </View>
    );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Header({ router, colors, typography, hasChanges, onSave, isSaving }: any) {
    return (
        <View style={[styles.header, { borderBottomColor: colors.border.default }]}>
            <TouchableOpacity activeOpacity={0.85} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={{ padding: 4 }}>
                <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
            </TouchableOpacity>
            <Text style={[typography.heading, { color: colors.text.primary, fontSize: 18, fontWeight: '800' }]}>
                Notification Settings
            </Text>
            <TouchableOpacity
                activeOpacity={0.85}
                onPress={onSave}
                disabled={!hasChanges || isSaving}
                accessibilityRole="button"
                accessibilityLabel="Save notification preferences"
                accessibilityState={{ disabled: !hasChanges || isSaving, busy: isSaving }}
                style={{ padding: 4 }}
            >
                {isSaving ? (
                    <ActivityIndicator size="small" color={colors.accent.coral} />
                ) : (
                    <Text style={[typography.caption, {
                        color: hasChanges ? colors.accent.coral : colors.text.tertiary,
                        fontWeight: 'bold',
                        fontSize: 14,
                    }]}>
                        Save
                    </Text>
                )}
            </TouchableOpacity>
        </View>
    );
}

function TimeDisplay({ label, time, colors, typography, iconColor }: any) {
    return (
        <View style={{ alignItems: 'center' }}>
            <Text style={[typography.caption, { color: colors.text.secondary, fontSize: 10, fontWeight: 'bold', marginBottom: 4 }]}>
                {label}
            </Text>
            <View style={[styles.timeBox, { backgroundColor: withAlpha(iconColor, 0.1), borderColor: withAlpha(iconColor, 0.3) }]}>
                <Text style={[typography.subhead, { color: iconColor, fontWeight: '700', fontSize: 16 }]}>
                    {time}
                </Text>
            </View>
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
});
