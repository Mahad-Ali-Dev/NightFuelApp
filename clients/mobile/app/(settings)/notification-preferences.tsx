import React, { useState, useEffect } from 'react';
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
        iconColor: '#00D4FF',
        category: 'Training & Health',
    },
    {
        key: 'mealReminderEnabled',
        label: 'Meal & Nutrition',
        description: 'Reminders to log meals and chrono-nutrition tips',
        icon: 'restaurant-outline',
        iconColor: '#FF6B35',
        category: 'Training & Health',
    },
    {
        key: 'shiftAlertEnabled',
        label: 'Shift Alerts',
        description: 'Pre-shift prep and circadian rhythm notifications',
        icon: 'time-outline',
        iconColor: '#A855F7',
        category: 'Training & Health',
    },
    {
        key: 'sleepReminderEnabled',
        label: 'Sleep Reminders',
        description: 'Wind-down and sleep hygiene reminders',
        icon: 'bed-outline',
        iconColor: '#6366F1',
        category: 'Training & Health',
    },
    {
        key: 'planReadyEnabled',
        label: 'Plan Ready',
        description: 'Notified when your daily workout or meal plan is ready',
        icon: 'checkmark-circle-outline',
        iconColor: '#2ECC71',
        category: 'Training & Health',
    },
    {
        key: 'adherenceAlertEnabled',
        label: 'Adherence Alerts',
        description: 'Gentle nudges when you fall behind your nutrition plan',
        icon: 'alert-circle-outline',
        iconColor: '#F59E0B',
        category: 'Training & Health',
    },

    // Progress & Insights
    {
        key: 'weeklyReportEnabled',
        label: 'Weekly Report',
        description: 'Your weekly performance summary from Coach Ria',
        icon: 'analytics-outline',
        iconColor: '#2ECC71',
        category: 'Progress & Insights',
    },
    {
        key: 'streakUpdateEnabled',
        label: 'Streak Updates',
        description: 'Stay motivated with streak milestones and warnings',
        icon: 'flame-outline',
        iconColor: '#EF4444',
        category: 'Progress & Insights',
    },

    // Coaching
    {
        key: 'coachMessageEnabled',
        label: 'Coach Messages',
        description: 'Messages and check-ins from your AI Coach Ria',
        icon: 'chatbubble-ellipses-outline',
        iconColor: '#A855F7',
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

    // Group items by category
    const categories = PREFERENCE_ITEMS.reduce<Record<string, PreferenceItem[]>>((acc, item) => {
        if (!acc[item.category]) acc[item.category] = [];
        acc[item.category]!.push(item);
        return acc;
    }, {});

    if (prefsQuery.isLoading || !prefs) {
        return (
            <View style={[styles.container, { backgroundColor: colors.background.primary, paddingTop: insets.top }]}>
                <Header router={router} colors={colors} typography={typography} hasChanges={false} onSave={handleSave} isSaving={false} />
                <View style={styles.center}>
                    <ActivityIndicator size="large" color={colors.accent.coral} />
                </View>
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
                            color: colors.text.tertiary,
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
                                            <Text style={[typography.caption, { color: colors.text.tertiary, marginTop: 2, lineHeight: 17 }]}>
                                                {item.description}
                                            </Text>
                                        </View>
                                        <Switch
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
                    color: colors.text.tertiary,
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
                        <View style={[styles.iconBox, { backgroundColor: withAlpha('#6366F1', 0.12) }]}>
                            <Ionicons name="moon-outline" size={20} color="#6366F1" />
                        </View>
                        <View style={{ flex: 1, marginHorizontal: 14 }}>
                            <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: '600' }]}>
                                Quiet Hours
                            </Text>
                            <Text style={[typography.caption, { color: colors.text.tertiary, marginTop: 2, lineHeight: 17 }]}>
                                Suppress non-critical notifications during sleep hours
                            </Text>
                        </View>
                        <Switch
                            value={quietHoursExpanded}
                            onValueChange={setQuietHoursExpanded}
                            trackColor={{ false: colors.border.default, true: withAlpha('#6366F1', 0.4) }}
                            thumbColor={quietHoursExpanded ? '#6366F1' : colors.text.tertiary}
                            ios_backgroundColor={colors.background.tertiary}
                        />
                    </View>

                    {/* Time range display — shown when quiet hours is toggled on */}
                    {quietHoursExpanded && (
                        <View style={[styles.quietHoursRow, { borderTopColor: colors.border.default }]}>
                            <TimeDisplay label="FROM" time={prefs.quietHoursStart} colors={colors} typography={typography} iconColor="#6366F1" />
                            <Ionicons name="arrow-forward" size={16} color={colors.text.tertiary} />
                            <TimeDisplay label="TO" time={prefs.quietHoursEnd} colors={colors} typography={typography} iconColor="#6366F1" />
                        </View>
                    )}
                </View>

                {/* Master Disable Banner */}
                <View style={{ paddingHorizontal: 20, marginTop: 24 }}>
                    <TouchableOpacity
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
                    style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 20 }}
                    onPress={() => Alert.alert('Open Settings', 'Go to Settings → Notifications → NightFuel to manage system-level permissions.')}
                >
                    <Ionicons name="settings-outline" size={16} color={colors.text.tertiary} />
                    <Text style={[typography.caption, { color: colors.text.tertiary, marginLeft: 8 }]}>
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
            <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
                <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
            </TouchableOpacity>
            <Text style={[typography.heading, { color: colors.text.primary, fontSize: 18, fontWeight: '800' }]}>
                Notification Settings
            </Text>
            <TouchableOpacity
                onPress={onSave}
                disabled={!hasChanges || isSaving}
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
            <Text style={[typography.caption, { color: colors.text.tertiary, fontSize: 10, fontWeight: 'bold', marginBottom: 4 }]}>
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
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 14,
        borderBottomWidth: 1,
    },
    infoBanner: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginHorizontal: 20,
        marginTop: 16,
        padding: 14,
        borderRadius: 12,
        borderWidth: 1,
    },
    section: {
        marginHorizontal: 20,
        borderRadius: 16,
        borderWidth: 1,
        overflow: 'hidden',
    },
    prefRow: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
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
