import React, { useState, useEffect, useRef } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    Alert, TextInput, Modal, KeyboardAvoidingView, Platform
} from 'react-native';
import Animated, {
    FadeInDown, FadeIn, FadeOut, SlideInUp, SlideOutUp,
    useSharedValue, useAnimatedStyle, withTiming, withDelay, cancelAnimation,
} from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/utils';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getPreferences, updatePreferences, UserPreferences } from '@/api/profile';
import { deleteAccount } from '@/api/users';
import { useAuthStore } from '@/store/authStore';
import { Button, Card, GlassCard, DateTimeField, Skeleton } from '@/components/ui';
import { PrefSelectCard } from '@/components/PrefSelectCard';
import { AnimatedPressable } from '@/components/AnimatedPressable';

// Server dietaryPreference enum (services/user-service/src/schemas.ts →
// updatePreferencesSchema). The screen writes these literal values so a tap
// actually persists; NONE doubles as the "no preference" / cleared state.
const DIETARY_OPTIONS = ['NONE', 'ANY', 'VEGETARIAN', 'VEGAN', 'PESCATARIAN', 'KETO', 'PALEO', 'HALAL', 'KOSHER'] as const;

// Per-option label + glyph for the selection grid. Purely presentational — the
// persisted value is still the raw enum key from DIETARY_OPTIONS.
const DIET_META: Record<(typeof DIETARY_OPTIONS)[number], { label: string; icon: keyof typeof Ionicons.glyphMap }> = {
    NONE: { label: 'No Pref', icon: 'remove-circle-outline' },
    ANY: { label: 'Anything', icon: 'restaurant-outline' },
    VEGETARIAN: { label: 'Vegetarian', icon: 'leaf-outline' },
    VEGAN: { label: 'Vegan', icon: 'flower-outline' },
    PESCATARIAN: { label: 'Pescatarian', icon: 'fish-outline' },
    KETO: { label: 'Keto', icon: 'flame-outline' },
    PALEO: { label: 'Paleo', icon: 'bonfire-outline' },
    HALAL: { label: 'Halal', icon: 'moon-outline' },
    KOSHER: { label: 'Kosher', icon: 'star-outline' },
};

// Only the sleep-window fields the server actually stores are editable here
// (server: sleepWindowStart / sleepWindowEnd). The old wakeTime / sleepTime /
// workStartTime / workEndTime / sleepTargetHours had no backing column.
type EditableTimeField = 'sleepWindowStart' | 'sleepWindowEnd';
type EditTarget = { kind: 'time'; field: EditableTimeField; label: string };

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

// Recommended adult sleep window (NSF: 7-9h). Used to size the hero progress
// bar and flag whether the chosen window lands inside the healthy band.
const SLEEP_TARGET_MIN_H = 7;
const SLEEP_TARGET_MAX_H = 9;

// Numeric in-bed hours (wrapping past midnight) from the two HH:MM strings, or
// null when either is unset/malformed. Pure presentation off existing prefs.
function sleepDurationNum(start: string | null, end: string | null): number | null {
    const sm = start && TIME_RE.exec(start);
    const em = end && TIME_RE.exec(end);
    if (!sm || !em) return null;
    let mins = (Number(em[1]) * 60 + Number(em[2])) - (Number(sm[1]) * 60 + Number(sm[2]));
    if (mins <= 0) mins += 24 * 60;
    return mins / 60;
}

// Derive sleep-window duration ("7.5" h) from the two HH:MM strings, wrapping
// past midnight. Pure presentation off existing prefs — no new data hook.
function sleepDurationHrs(start: string | null, end: string | null): string | null {
    const hrs = sleepDurationNum(start, end);
    if (hrs == null) return null;
    return Number.isInteger(hrs) ? String(hrs) : hrs.toFixed(1);
}

export default function PreferencesScreen() {
    const { colors, typography, borderRadius, shadows, spacing } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const queryClient = useQueryClient();

    const { data: initialPrefs, isLoading } = useQuery({
        queryKey: ['my-preferences'],
        queryFn: getPreferences,
    });

    const [prefs, setPrefs] = useState<UserPreferences | null>(null);
    const [editing, setEditing] = useState<EditTarget | null>(null);
    const [editValue, setEditValue] = useState('');
    const [editError, setEditError] = useState('');
    const [allergyInput, setAllergyInput] = useState('');
    // Inline save feedback (replaces the blocking OS Alert). A transient
    // toast/snackbar AND a checkmark swap on the Save pill — Alert is now
    // reserved for the irreversible deactivate confirm.
    const [toast, setToast] = useState<null | { kind: 'success' | 'error'; message: string }>(null);
    const [saveOk, setSaveOk] = useState(false);
    const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const okTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const showToast = (kind: 'success' | 'error', message: string) => {
        if (toastTimer.current) clearTimeout(toastTimer.current);
        setToast({ kind, message });
        toastTimer.current = setTimeout(() => setToast(null), 2600);
    };

    // Clear the pending timers on unmount so a fired callback can't setState on
    // an unmounted screen.
    useEffect(() => () => {
        if (toastTimer.current) clearTimeout(toastTimer.current);
        if (okTimer.current) clearTimeout(okTimer.current);
    }, []);

    useEffect(() => {
        if (initialPrefs) {
            // Defensively default the array fields the UI iterates over, in case
            // the backend omits them — prevents `.some`/`.filter`/`.map` crashes.
            setPrefs({
                ...initialPrefs,
                allergies: initialPrefs.allergies ?? [],
                healthConditions: initialPrefs.healthConditions ?? [],
            });
        }
    }, [initialPrefs]);

    const updateMutation = useMutation({
        mutationFn: updatePreferences,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['my-preferences'] });
            // Inline, non-blocking confirmation: toast + a transient checkmark on
            // the Save pill (instead of the old OS Alert).
            showToast('success', 'Preferences saved');
            if (okTimer.current) clearTimeout(okTimer.current);
            setSaveOk(true);
            okTimer.current = setTimeout(() => setSaveOk(false), 1600);
        },
        onError: (err: any) => {
            showToast('error', err?.message || 'Failed to update preferences');
        }
    });

    // GDPR account deletion (DELETE /v1/users/me) — the SAME real route the
    // Privacy & Data screen uses. On success drop every cached query, clear the
    // secure-store session and bounce to the auth stack.
    const deactivateMutation = useMutation({
        mutationFn: deleteAccount,
        onSuccess: async () => {
            queryClient.clear();
            await useAuthStore.getState().logout();
            router.replace('/(auth)/login');
        },
        onError: () => {
            Alert.alert(
                'Couldn\'t deactivate account',
                'Something went wrong deactivating your account. Please check your connection and try again.',
            );
        },
    });

    // The destructive/irreversible action lives behind an explicit confirm Alert
    // with a `destructive` "Deactivate" option (the textbook destructive-Alert
    // use). This is the one place Alert is still appropriate.
    const handleDeactivate = () => {
        if (deactivateMutation.isPending) return;
        Alert.alert(
            'Deactivate account?',
            'This permanently deactivates your Zeitra account and deletes all of your data. This cannot be undone.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Deactivate',
                    style: 'destructive',
                    onPress: () => deactivateMutation.mutate(),
                },
            ],
            { cancelable: true },
        );
    };

    if (isLoading || !prefs) {
        return (
            <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
                <View style={[styles.header, { paddingTop: insets.top + 20, borderBottomColor: colors.border.default }]}>
                    <View style={styles.backBtn}>
                        <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
                    </View>
                    <Text style={[typography.h3, { color: colors.text.primary }]}>Preferences</Text>
                    <View style={{ width: 40 }} />
                </View>
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
                    <View style={styles.section}>
                        <Skeleton width={180} height={14} radius={borderRadius.sm} style={{ marginBottom: 16 }} />
                        <Skeleton width="100%" height={300} radius={borderRadius['2xl']} />
                    </View>
                    <View style={[styles.section, { marginTop: 32 }]}>
                        <Skeleton width={200} height={14} radius={borderRadius.sm} style={{ marginBottom: 16 }} />
                        <Skeleton width={120} height={12} radius={borderRadius.sm} style={{ marginBottom: 12 }} />
                        <View style={styles.grid}>
                            {[0, 1, 2, 3, 4, 5].map((i) => (
                                <Skeleton key={i} width="47%" height={92} radius={borderRadius.xl} />
                            ))}
                        </View>
                    </View>
                </ScrollView>
            </View>
        );
    }

    // Tapping the already-selected diet clears it back to the server's NONE
    // sentinel (not '' — that isn't a valid dietaryPreference enum value, so the
    // full-object Save would 400).
    const toggleDiet = (diet: string) => {
        setPrefs(prev => prev ? ({ ...prev, dietaryPreference: prev.dietaryPreference === diet ? 'NONE' : diet }) : null);
    };

    const openEdit = (target: EditTarget) => {
        if (!prefs) return;
        // sleepWindowStart / sleepWindowEnd are nullable on the server; seed the
        // editor with '' when unset so the time field starts empty.
        setEditValue(prefs[target.field] ?? '');
        setEditError('');
        setEditing(target);
    };

    const closeEdit = () => {
        setEditing(null);
        setEditValue('');
        setEditError('');
    };

    const saveEdit = () => {
        if (!editing || !prefs) return;
        const value = editValue.trim();
        // Both editable fields are HH:MM sleep-window times (server regex
        // /^\d{2}:\d{2}$/). The stricter 24-hour TIME_RE is a superset guard.
        if (!TIME_RE.test(value)) {
            setEditError('Use 24-hour HH:MM (e.g. 07:30)');
            return;
        }
        setPrefs({ ...prefs, [editing.field]: value });
        closeEdit();
    };

    const addAllergy = () => {
        const value = allergyInput.trim();
        if (!value || !prefs) return;
        if (prefs.allergies.some(a => a.toLowerCase() === value.toLowerCase())) {
            setAllergyInput('');
            return;
        }
        setPrefs({ ...prefs, allergies: [...prefs.allergies, value] });
        setAllergyInput('');
    };

    const removeAllergy = (a: string) => {
        if (!prefs) return;
        setPrefs({ ...prefs, allergies: prefs.allergies.filter(x => x !== a) });
    };

    const duration = sleepDurationHrs(prefs.sleepWindowStart, prefs.sleepWindowEnd);
    const durationNum = sleepDurationNum(prefs.sleepWindowStart, prefs.sleepWindowEnd);
    // Hero progress bar fill: hours-in-bed vs the 9h top of the healthy band,
    // clamped 0..1. `inBand` = the window lands inside the 7-9h recommendation.
    const inBedFill = durationNum == null ? 0 : Math.max(0, Math.min(1, durationNum / SLEEP_TARGET_MAX_H));
    const inBand = durationNum != null && durationNum >= SLEEP_TARGET_MIN_H && durationNum <= SLEEP_TARGET_MAX_H;
    const dietLabel = DIET_META[prefs.dietaryPreference as (typeof DIETARY_OPTIONS)[number]]?.label
        ?? (prefs.dietaryPreference === 'NONE' ? 'No Pref' : prefs.dietaryPreference);

    return (
        <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
            {/* Header */}
            <View style={[styles.header, { paddingTop: insets.top + 20, borderBottomColor: colors.border.default }]}>
                <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.85}>
                    <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
                </TouchableOpacity>
                <Text style={[typography.h3, { color: colors.text.primary }]}>Preferences</Text>
                <AnimatedPressable
                    pressedScale={0.95}
                    accessibilityRole="button"
                    accessibilityLabel={saveOk ? 'Preferences saved' : 'Save preferences'}
                    accessibilityState={{ disabled: updateMutation.isPending }}
                    onPress={() => updateMutation.mutate(prefs)}
                    disabled={updateMutation.isPending}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    style={[styles.saveBtn, { backgroundColor: colors.accent.coral, opacity: updateMutation.isPending ? 0.5 : 1 }, shadows.glow(colors.accent.coral)]}
                >
                    {saveOk ? (
                        <Animated.View key="ok" entering={FadeIn.duration(160)} style={styles.saveBtnInner}>
                            <Ionicons name="checkmark" size={18} color={colors.text.inverse} />
                            <Text style={[typography.subhead, { color: colors.text.inverse, fontWeight: '700', marginLeft: 4 }]}>Saved</Text>
                        </Animated.View>
                    ) : (
                        <Animated.View key="save" entering={FadeIn.duration(160)} style={styles.saveBtnInner}>
                            <Text style={[typography.subhead, { color: colors.text.inverse, fontWeight: '700' }]}>Save</Text>
                        </Animated.View>
                    )}
                </AnimatedPressable>
            </View>

            {/* Inline save snackbar (non-blocking) — colour is never the only
                signal: a success/error glyph accompanies the tint. */}
            {toast && (
                <Animated.View
                    key={`${toast.kind}-${toast.message}`}
                    entering={SlideInUp.springify().damping(20).mass(0.7)}
                    exiting={SlideOutUp.duration(180)}
                    pointerEvents="none"
                    style={[
                        styles.toast,
                        {
                            top: insets.top + 64,
                            backgroundColor: colors.background.secondary,
                            borderColor: withAlpha(toast.kind === 'success' ? colors.accent.coral : colors.accent.red, 0.5),
                        },
                        shadows.glow(toast.kind === 'success' ? colors.accent.coral : colors.accent.red),
                    ]}
                    accessibilityLiveRegion="polite"
                    accessibilityRole="alert"
                    accessibilityLabel={toast.message}
                >
                    <Ionicons
                        name={toast.kind === 'success' ? 'checkmark-circle' : 'alert-circle'}
                        size={18}
                        color={toast.kind === 'success' ? colors.accent.coral : colors.accent.red}
                    />
                    <Text style={[typography.captionMedium, { color: colors.text.primary, marginLeft: 8, flex: 1 }]} numberOfLines={2}>
                        {toast.message}
                    </Text>
                </Animated.View>
            )}

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>

                {/* Hero summary — big condensed sleep-window numerals */}
                <Animated.View entering={FadeInDown.duration(420).springify().damping(18)} style={styles.section}>
                    <GlassCard radius={borderRadius['2xl']} style={[styles.heroCard, { borderColor: withAlpha(colors.accent.coral, 0.22) }]}>
                        <LinearGradient
                            colors={[withAlpha(colors.accent.coral, 0.14), 'transparent']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={StyleSheet.absoluteFillObject}
                        />
                        <View style={styles.heroTop}>
                            <View style={[styles.heroIcon, { backgroundColor: withAlpha(colors.accent.coral, 0.14), borderColor: withAlpha(colors.accent.coral, 0.28) }]}>
                                <Ionicons name="bed-outline" size={20} color={colors.accent.coral} />
                            </View>
                            <Text style={[typography.overline, { color: colors.text.secondary, marginLeft: spacing.md }]}>SLEEP WINDOW</Text>
                        </View>
                        <View style={styles.heroStatsRow}>
                            <View style={styles.heroStat}>
                                <Text style={[typography.statLarge, { color: colors.text.primary }]}>{prefs.sleepWindowStart ?? '--:--'}</Text>
                                <Text style={[typography.caption, { color: colors.text.tertiary }]}>BEDTIME</Text>
                            </View>
                            <Ionicons name="arrow-forward" size={18} color={withAlpha(colors.accent.coral, 0.6)} style={{ marginHorizontal: spacing.sm }} />
                            <View style={styles.heroStat}>
                                <Text style={[typography.statLarge, { color: colors.text.primary }]}>{prefs.sleepWindowEnd ?? '--:--'}</Text>
                                <Text style={[typography.caption, { color: colors.text.tertiary }]}>WAKE</Text>
                            </View>
                            <View style={styles.heroDivider} />
                            <View style={[styles.heroStat, { alignItems: 'flex-end' }]}>
                                <Text style={[typography.statLarge, { color: colors.accent.coral }]}>{duration ?? '--'}<Text style={[typography.statSmall, { color: colors.accent.coral }]}>h</Text></Text>
                                <Text style={[typography.caption, { color: colors.text.tertiary }]}>IN BED</Text>
                            </View>
                        </View>
                        {/* Gamified hours-in-bed progress vs the 7-9h healthy band */}
                        <SleepProgressBar fill={inBedFill} inBand={inBand} hasData={durationNum != null} />
                    </GlassCard>
                </Animated.View>

                {/* Circadian Section — sleep-window rows */}
                <Animated.View entering={FadeInDown.delay(50).springify().damping(18)} style={[styles.section, { marginTop: 28 }]}>
                    <View style={styles.sectionHeader}>
                        <Ionicons name="moon-outline" size={18} color={colors.accent.coral} />
                        <Text style={[typography.overline, { color: colors.text.secondary, marginLeft: 10 }]}>CIRCADIAN RHYTHM</Text>
                    </View>
                    <Card variant="glass" style={[styles.prefCard, { borderColor: colors.border.default }]}>
                        <TimeRow
                            icon="bed-outline"
                            label="Sleep Window Start"
                            value={prefs.sleepWindowStart ?? '—'}
                            onEdit={() => openEdit({ kind: 'time', field: 'sleepWindowStart', label: 'Sleep Window Start' })}
                        />
                        <TimeRow
                            icon="sunny-outline"
                            label="Sleep Window End"
                            value={prefs.sleepWindowEnd ?? '—'}
                            onEdit={() => openEdit({ kind: 'time', field: 'sleepWindowEnd', label: 'Sleep Window End' })}
                            isLast
                        />
                    </Card>
                </Animated.View>

                {/* Metabolic Section */}
                <Animated.View entering={FadeInDown.delay(100).springify().damping(18)} style={[styles.section, { marginTop: 32 }]}>
                    <View style={styles.sectionHeader}>
                        <Ionicons name="nutrition-outline" size={18} color={colors.accent.coral} />
                        <Text style={[typography.overline, { color: colors.text.secondary, marginLeft: 10 }]}>METABOLIC PREFERENCES</Text>
                    </View>

                    <View style={styles.subHeadRow}>
                        <Text style={[typography.overline, { color: colors.text.tertiary }]}>DIETARY PREFERENCE</Text>
                        <View style={[styles.valuePill, { backgroundColor: withAlpha(colors.accent.coral, 0.12), borderColor: withAlpha(colors.accent.coral, 0.24) }]}>
                            <Text style={[typography.captionMedium, { color: colors.accent.coral }]}>{dietLabel}</Text>
                        </View>
                    </View>
                    <View style={styles.grid}>
                        {DIETARY_OPTIONS.map(diet => {
                            const selected = prefs.dietaryPreference === diet;
                            const meta = DIET_META[diet];
                            return (
                                <PrefSelectCard
                                    key={diet}
                                    icon={meta.icon}
                                    label={meta.label}
                                    selected={selected}
                                    onPress={() => toggleDiet(diet)}
                                    accessibilityLabel={meta.label}
                                    style={styles.gridItem}
                                />
                            );
                        })}
                    </View>

                    <View style={{ marginTop: 28 }}>
                        <View style={styles.subHeadRow}>
                            <Text style={[typography.overline, { color: colors.text.tertiary }]}>RESTRICTIONS & ALLERGIES</Text>
                            {prefs.allergies.length > 0 && (
                                <Text style={[typography.statSmall, { color: colors.accent.coral }]}>{prefs.allergies.length}</Text>
                            )}
                        </View>
                        <View style={[styles.tagInputWrap, { backgroundColor: colors.background.secondary, borderRadius: borderRadius.xl, borderColor: colors.border.default }]}>
                            <Ionicons name="add-circle-outline" size={20} color={colors.text.tertiary} />
                            <TextInput
                                style={[styles.tagInput, { color: colors.text.primary }]}
                                placeholder="Add allergy..."
                                placeholderTextColor={colors.text.tertiary}
                                value={allergyInput}
                                onChangeText={setAllergyInput}
                                onSubmitEditing={addAllergy}
                                returnKeyType="done"
                                autoCapitalize="words"
                            />
                        </View>
                        {prefs.allergies.length > 0 ? (
                            <View style={styles.tagGrid}>
                                {prefs.allergies.map(a => (
                                    <TouchableOpacity
                                        key={a}
                                        onPress={() => removeAllergy(a)}
                                        style={[styles.tag, { backgroundColor: withAlpha(colors.accent.coral, 0.1), borderColor: withAlpha(colors.accent.coral, 0.24) }]}
                                        accessibilityRole="button"
                                        accessibilityLabel={`Remove ${a}`}
                                        activeOpacity={0.85}
                                    >
                                        <Text style={[typography.captionMedium, { color: colors.text.primary }]}>{a}</Text>
                                        <Ionicons name="close-circle" size={15} color={withAlpha(colors.accent.coral, 0.8)} style={{ marginLeft: 6 }} />
                                    </TouchableOpacity>
                                ))}
                            </View>
                        ) : (
                            <Text style={[typography.caption, { color: colors.text.tertiary, marginTop: 4 }]}>No restrictions added yet.</Text>
                        )}
                    </View>
                </Animated.View>

                {/* Account Section */}
                <Animated.View entering={FadeInDown.delay(150).springify().damping(18)} style={[styles.section, { marginTop: 40 }]}>
                    <Button
                        title="DEACTIVATE ACCOUNT"
                        variant="danger"
                        loading={deactivateMutation.isPending}
                        disabled={deactivateMutation.isPending}
                        onPress={handleDeactivate}
                        accessibilityRole="button"
                        accessibilityLabel="Deactivate account"
                        accessibilityState={{ disabled: deactivateMutation.isPending }}
                        style={{ height: 56 }}
                    />
                    <Text style={[typography.caption, { color: colors.text.tertiary, textAlign: 'center', marginTop: 10 }]}>
                        Permanently deletes your account and all data. This can't be undone.
                    </Text>
                </Animated.View>

            </ScrollView>

            <Modal visible={editing !== null} transparent animationType="fade" onRequestClose={closeEdit}>
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    style={styles.modalOverlay}
                >
                    <Animated.View
                        entering={SlideInUp.springify().damping(20).mass(0.7)}
                        exiting={FadeOut.duration(140)}
                        style={[styles.modalCard, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}
                    >
                        <Text style={[typography.subhead, { color: colors.text.primary, marginBottom: 16, fontWeight: 'bold' }]}>
                            {editing?.label}
                        </Text>
                        <DateTimeField
                            mode="time"
                            value={editValue}
                            onChange={(t) => { setEditValue(t); if (editError) setEditError(''); }}
                            error={editError || undefined}
                        />
                        <View style={styles.modalActions}>
                            <AnimatedPressable pressedScale={0.97} accessibilityRole="button" accessibilityLabel="Cancel" onPress={closeEdit} style={[styles.modalBtn, { borderColor: colors.border.default }]}>
                                <Text style={[typography.body, { color: colors.text.secondary, fontWeight: '600' }]}>Cancel</Text>
                            </AnimatedPressable>
                            <AnimatedPressable pressedScale={0.97} accessibilityRole="button" accessibilityLabel="Save time" onPress={saveEdit} style={[styles.modalBtn, styles.modalBtnPrimary, { backgroundColor: colors.accent.coral }]}>
                                <Text style={[typography.body, { color: colors.text.inverse, fontWeight: '700' }]}>Save</Text>
                            </AnimatedPressable>
                        </View>
                    </Animated.View>
                </KeyboardAvoidingView>
            </Modal>
        </View>
    );
}

function TimeRow({ icon, label, value, onEdit, isLast }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; onEdit: () => void; isLast?: boolean }) {
    const { colors, typography } = useTheme();
    return (
        <AnimatedPressable
            pressedScale={0.98}
            accessibilityRole="button"
            accessibilityLabel={`${label}, ${value}`}
            style={[styles.timeRow, isLast ? { borderBottomWidth: 0 } : { borderBottomColor: colors.border.default }]}
            onPress={onEdit}
            hitSlop={{ top: 4, bottom: 4, left: 0, right: 0 }}
        >
            <View style={styles.timeRowLeft}>
                <View style={[styles.timeRowIcon, { backgroundColor: withAlpha(colors.accent.coral, 0.12), borderColor: withAlpha(colors.accent.coral, 0.22) }]}>
                    <Ionicons name={icon} size={17} color={colors.accent.coral} />
                </View>
                <Text style={[typography.bodyMedium, { color: colors.text.primary, marginLeft: 12 }]}>{label}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={[typography.statSmall, { color: colors.text.primary }]}>{value}</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.text.tertiary} style={{ marginLeft: 8 }} />
            </View>
        </AnimatedPressable>
    );
}

// Thin gamified progress bar for the hero: animates its fill width on mount /
// when the sleep window changes, and tints lime when the window lands inside the
// 7-9h healthy band, amber-ish (red) when it falls short/over. A target marker
// at the 7h mark hints the recommended floor. Colour is paired with a text
// label ("IN BAND" / "AIM 7-9H") so it's never the only signal.
function SleepProgressBar({ fill, inBand, hasData }: { fill: number; inBand: boolean; hasData: boolean }) {
    const { colors, typography } = useTheme();
    const progress = useSharedValue(0);
    const tint = inBand ? colors.accent.coral : colors.accent.red;

    useEffect(() => {
        // Animate width (and re-animate on value change). Transform/opacity-free
        // width tween is fine here — it's a single short bar, not a list.
        progress.value = withDelay(220, withTiming(fill, { duration: 620 }));
        return () => cancelAnimation(progress);
    }, [fill, progress]);

    const fillStyle = useAnimatedStyle(() => ({
        width: `${Math.max(0, Math.min(1, progress.value)) * 100}%`,
    }));

    // 7h floor marker as a fraction of the 9h track.
    const markerLeft = `${(SLEEP_TARGET_MIN_H / SLEEP_TARGET_MAX_H) * 100}%`;

    return (
        <View style={styles.progressWrap}>
            <View style={[styles.progressTrack, { backgroundColor: withAlpha(colors.text.primary, 0.08) }]}>
                <Animated.View style={[styles.progressFill, fillStyle, { backgroundColor: tint }]} />
                {/* recommended-floor tick */}
                <View style={[styles.progressMarker, { left: markerLeft as any, backgroundColor: withAlpha(colors.text.primary, 0.35) }]} />
            </View>
            <View style={styles.progressLabelRow}>
                <Text style={[typography.caption, { color: colors.text.tertiary }]}>TARGET 7–9H</Text>
                <Text style={[typography.captionMedium, { color: hasData ? tint : colors.text.tertiary }]}>
                    {!hasData ? 'SET YOUR WINDOW' : inBand ? 'IN BAND' : 'OUTSIDE BAND'}
                </Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1 },
    backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    // height >= 44 so the rendered target is spec-compliant by construction
    // (not just via hitSlop).
    saveBtn: { paddingHorizontal: 18, height: 44, minWidth: 72, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
    saveBtnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
    // Inline save snackbar
    toast: { position: 'absolute', left: 20, right: 20, zIndex: 50, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderRadius: 14, borderWidth: 1 },
    section: { paddingHorizontal: 20, marginTop: 24 },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
    subHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
    valuePill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
    // Hero
    heroCard: { borderWidth: 1, padding: 20, overflow: 'hidden' },
    heroTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 18 },
    heroIcon: { width: 40, height: 40, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    heroStatsRow: { flexDirection: 'row', alignItems: 'center' },
    heroStat: { alignItems: 'flex-start' },
    heroDivider: { flex: 1 },
    // Hero progress bar
    progressWrap: { marginTop: 18 },
    progressTrack: { height: 8, borderRadius: 999, overflow: 'hidden', justifyContent: 'center' },
    progressFill: { height: 8, borderRadius: 999 },
    progressMarker: { position: 'absolute', top: -2, width: 2, height: 12, borderRadius: 1 },
    progressLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
    // Rows
    prefCard: { borderWidth: 1, paddingHorizontal: 16, borderRadius: 24 },
    timeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1 },
    timeRowLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 8 },
    timeRowIcon: { width: 36, height: 36, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    // Grid
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    gridItem: { width: '47.5%' },
    // Allergies
    tagInputWrap: { flexDirection: 'row', alignItems: 'center', height: 52, paddingHorizontal: 14, borderWidth: 1, marginBottom: 12, gap: 10 },
    tagInput: { flex: 1, height: '100%' },
    tagGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    tag: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, borderWidth: 1 },
    // Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
    modalCard: { width: '100%', maxWidth: 360, padding: 24, borderRadius: 24, borderWidth: 1 },
    modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 16 },
    modalBtn: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center', minHeight: 44 },
    modalBtnPrimary: { borderWidth: 0 },
});
