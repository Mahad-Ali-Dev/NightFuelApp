import React, { useState, useEffect } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Pressable,
    Alert, KeyboardAvoidingView, Platform
} from 'react-native';
import Animated, {
    FadeInDown,
    useSharedValue,
    useAnimatedStyle,
    useDerivedValue,
    withTiming,
    withSpring,
    interpolateColor,
    Easing,
} from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/utils';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getMyProfile, updateProfile } from '@/api/profile';
import { Button, Skeleton } from '@/components/ui';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';

// Client-side mirror of the user-service updateProfileSchema bounds for
// `displayName` (services/user-service/src/schemas.ts → z.string().min(2).max(64)).
// Keep these IDENTICAL to the server: the server is the source of truth; this is a
// fast, accessible pre-check so we don't fire a PUT we know the API will 400.
export const DISPLAY_NAME_MIN = 2;
export const DISPLAY_NAME_MAX = 64;

// Returns inline validation copy for the display name, or null when valid.
// Mirrors the server contract: trimmed length must be DISPLAY_NAME_MIN..MAX
// (all-whitespace collapses to length 0 → rejected, same as the server min(2)).
export function validateDisplayName(name: string): string | null {
    const trimmed = name.trim();
    if (trimmed.length < DISPLAY_NAME_MIN) {
        return `Name must be at least ${DISPLAY_NAME_MIN} characters.`;
    }
    if (trimmed.length > DISPLAY_NAME_MAX) {
        return `Name must be ${DISPLAY_NAME_MAX} characters or fewer.`;
    }
    return null;
}

export default function EditProfileScreen() {
    const { colors, typography, borderRadius, shadows } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const queryClient = useQueryClient();

    const { data: profile, isLoading } = useQuery({
        queryKey: ['my-profile'],
        queryFn: getMyProfile,
    });

    // Note: useState initialises once on first render (before query resolves).
    // useEffect below syncs form state once the profile data arrives.
    // Only the fields the server actually persists are edited here: the display
    // name (server: displayName) and the avatar (server: avatarUrl). aboutMe /
    // occupation have no backing column, so they are no longer collected.
    const [form, setForm] = useState({
        name: '',
        avatarUrl: '',
    });
    // Inline validation reveals on blur (not on every keystroke) so the field
    // doesn't shout an error while the user is still mid-type. The Save gate
    // (saveDisabled, below) still keys off the LIVE nameError regardless of
    // touched, so an invalid name can never be submitted.
    const [nameTouched, setNameTouched] = useState(false);

    useEffect(() => {
        if (profile) {
            setForm({
                // The profile row exposes the name as `displayName`; fall back to
                // `name` (the authStore User mirror) before empty.
                name:        (profile as any).displayName ?? profile.name ?? '',
                avatarUrl:   profile.avatarUrl    ?? '',
            });
        }
    }, [profile]);

    const updateMutation = useMutation({
        mutationFn: updateProfile,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['my-profile'] });
            Alert.alert('Success', 'Profile updated successfully');
            router.back();
        },
        onError: (err: any) => {
            Alert.alert('Error', err.message || 'Failed to update profile');
        }
    });

    // Derived (never stored — see react-state-minimize): the inline validation copy
    // for the display name, and whether Save should be blocked. Save is disabled
    // while the mutation is in flight OR the name is out of the server bounds.
    const nameError = validateDisplayName(form.name);
    const saveDisabled = updateMutation.isPending || nameError !== null;
    // Show the inline error only once the field has been touched/blurred.
    const visibleNameError = nameTouched ? nameError : null;
    // Live character budget — a small data-driven hero numeral that mirrors the
    // server max(64) bound the user is editing against.
    const nameCount = form.name.trim().length;

    const handleSave = () => {
        // Guard the mutation itself too: even if a control somehow fires while
        // invalid, never send a PUT the server will reject.
        if (saveDisabled) {
            // Reveal any latent validation message if the user mashes Save first.
            if (nameError) setNameTouched(true);
            return;
        }
        // Send ONLY the fields the user-service updateProfileSchema accepts.
        // The server reads `displayName`, not `name` — sending `name` silently
        // no-ops (the rename never persisted, yet the success toast still fired).
        const payload: { displayName: string; avatarUrl?: string } = {
            displayName: form.name.trim(),
        };
        // avatarUrl is z.string().url() on the server — an empty string 400s.
        // Only include it when the user actually has/picked one.
        if (form.avatarUrl) payload.avatarUrl = form.avatarUrl;
        updateMutation.mutate(payload);
    };

    const handlePickImage = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.7,
        });

        if (!result.canceled && result.assets?.[0]) {
            setForm(prev => ({ ...prev, avatarUrl: result.assets[0]?.uri || '' }));
        }
    };

    const email = (profile as any)?.email ?? '';

    if (isLoading) {
        return (
            <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
                <View style={[styles.header, { paddingTop: insets.top + 20, borderBottomColor: colors.border.default }]}>
                    <View style={styles.backBtn}>
                        <Ionicons name="close" size={28} color={colors.text.primary} />
                    </View>
                    <Text style={[typography.h3, { color: colors.text.primary }]}>Edit Profile</Text>
                    <View style={{ width: 40 }} />
                </View>
                <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
                    <View style={styles.avatarSection}>
                        <Skeleton width={104} height={104} radius={52} />
                        <Skeleton width={120} height={14} radius={borderRadius.sm} style={{ marginTop: 16 }} />
                    </View>
                    <Skeleton width="100%" height={88} radius={borderRadius['2xl']} style={{ marginTop: 8 }} />
                    <View style={[styles.form, { marginTop: 28 }]}>
                        {/* Single placeholder — the editor now has one persisted
                            field (DISPLAY NAME); aboutMe/occupation were removed. */}
                        <View>
                            <Skeleton width={120} height={12} radius={borderRadius.sm} style={{ marginBottom: 10 }} />
                            <Skeleton width="100%" height={56} radius={borderRadius.xl} />
                        </View>
                        <Skeleton width="100%" height={56} radius={borderRadius.xl} />
                    </View>
                    <Skeleton width="100%" height={60} radius={borderRadius.xl} style={{ marginTop: 40 }} />
                </ScrollView>
            </View>
        );
    }

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={[styles.container, { backgroundColor: colors.background.primary }]}
        >
            <View style={[styles.header, { paddingTop: insets.top + 20, borderBottomColor: colors.border.default }]}>
                <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Close" onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.85}>
                    <Ionicons name="close" size={28} color={colors.text.primary} />
                </TouchableOpacity>
                <Text style={[typography.h3, { color: colors.text.primary }]}>Edit Profile</Text>
                <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Save"
                    accessibilityState={{ disabled: saveDisabled, busy: updateMutation.isPending }}
                    onPress={handleSave}
                    disabled={saveDisabled}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    activeOpacity={0.85}
                >
                    {/* Demoted to a NEUTRAL secondary action: lime is reserved for the
                        single bottom 'SAVE CHANGES' CTA (one primary per screen). This
                        header control still saves, but no longer competes for the eye. */}
                    <Text style={[typography.subhead, { color: colors.text.secondary, opacity: saveDisabled ? 0.5 : 1 }]}>Save</Text>
                </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 100 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                {/* Avatar Edit — the hero interaction. Tactile spring pressed-scale (0.96,
                    transform-only) replaces the flat opacity fade per the motion spec. */}
                <Animated.View entering={FadeInDown.delay(60).springify().damping(18)} style={styles.avatarSection}>
                    <AnimatedAvatar onPress={handlePickImage}>
                        {form.avatarUrl ? (
                            <Image source={{ uri: form.avatarUrl }} style={styles.avatarImg} cachePolicy="memory-disk" transition={200} />
                        ) : (
                            <View style={[styles.avatarImg, { backgroundColor: colors.background.tertiary, alignItems: 'center', justifyContent: 'center' }]}>
                                <Ionicons name="camera" size={32} color={colors.text.tertiary} />
                            </View>
                        )}
                        <View style={[styles.editBadge, { backgroundColor: colors.accent.coral, borderColor: colors.background.primary }]}>
                            <Ionicons name="pencil" size={14} color={colors.text.inverse} />
                        </View>
                    </AnimatedAvatar>
                    <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 12 }]}>Tap to change photo</Text>
                </Animated.View>

                {/* Live name-length hero stat — data-driven, mirrors the server max(64)
                    bound, now with an animated character-budget fill (gamified affordance). */}
                <Animated.View
                    entering={FadeInDown.delay(110).springify().damping(18)}
                    style={[styles.statBand, { backgroundColor: colors.background.secondary, borderColor: withAlpha(colors.text.primary, 0.08) }]}
                >
                    <View style={styles.statRow}>
                        <View style={styles.statItem}>
                            {/* HERO numeral — bumped statMedium → statLarge (48px). Keeps the
                                red tint when the name is out of bounds so colour is never the
                                ONLY cap signal (the bar's red fill reinforces, not replaces). */}
                            <Text style={[typography.statLarge, { color: nameError ? colors.accent.red : colors.text.primary }]} maxFontSizeMultiplier={1.2}>
                                {nameCount}
                            </Text>
                            <Text style={[typography.overline, { color: colors.text.tertiary, marginTop: 2 }]}>CHARACTERS</Text>
                        </View>
                        <View style={[styles.statDivider, { backgroundColor: colors.border.default }]} />
                        {/* Secondary / de-emphasised — the cap is context, not a peer hero
                            numeral. statSmall (24px) creates a clear primary↔secondary rhythm. */}
                        <View style={styles.statItemSecondary}>
                            <Text style={[typography.statSmall, { color: colors.text.secondary }]} maxFontSizeMultiplier={1.2}>
                                /{DISPLAY_NAME_MAX}
                            </Text>
                            <Text style={[typography.overline, { color: colors.text.tertiary, marginTop: 2 }]}>MAX LIMIT</Text>
                        </View>
                    </View>
                    <CharacterBudgetBar count={nameCount} max={DISPLAY_NAME_MAX} overLimit={nameError !== null} />
                </Animated.View>

                {/* IDENTITY group */}
                <Animated.View entering={FadeInDown.delay(160).springify().damping(18)} style={styles.group}>
                    <View style={styles.groupHeader}>
                        <Ionicons name="person-outline" size={18} color={colors.accent.coral} />
                        <Text style={[typography.overline, { color: colors.accent.coral, marginLeft: 10 }]}>IDENTITY</Text>
                    </View>
                    <View style={styles.form}>
                        <InputGroup
                            label="DISPLAY NAME"
                            value={form.name}
                            onChangeText={(t: string) => setForm(p => ({ ...p, name: t }))}
                            onBlur={() => setNameTouched(true)}
                            placeholder="Your full name"
                            error={visibleNameError}
                            maxLength={DISPLAY_NAME_MAX}
                            autoCapitalize="words"
                            returnKeyType="done"
                        />
                        {/* Read-only account field — surfaced for context, not editable
                            (the server does not accept an email change on this route). */}
                        <MetaRow icon="mail-outline" label="EMAIL" value={email || '—'} />
                    </View>
                </Animated.View>

                <Animated.View entering={FadeInDown.delay(210).springify().damping(18)}>
                    <Button
                        title={updateMutation.isPending ? 'SAVING...' : 'SAVE CHANGES'}
                        variant="primary"
                        style={{ marginTop: 36, height: 60 }}
                        onPress={handleSave}
                        disabled={saveDisabled}
                        accessibilityRole="button"
                        accessibilityLabel={updateMutation.isPending ? 'Saving changes' : 'Save changes'}
                        accessibilityState={{ disabled: saveDisabled, busy: updateMutation.isPending }}
                    />
                </Animated.View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

function InputGroup({ label, value, onChangeText, onBlur, placeholder, multiline, numberOfLines, error, ...rest }: any) {
    const { colors, typography, borderRadius } = useTheme();
    const [focused, setFocused] = useState(false);
    const hasError = !!error;
    return (
        <View style={styles.inputGroup}>
            <Text style={[typography.overline, { color: colors.text.secondary, marginBottom: 10 }]}>{label}</Text>
            <TextInput
                style={[
                    styles.input,
                    {
                        color: colors.text.primary,
                        backgroundColor: colors.background.secondary,
                        borderRadius: borderRadius.xl,
                        // Surface the invalid state on the field outline too (not colour alone —
                        // the inline alert below carries the same meaning for AT). The lime
                        // focus ring is the resting/active accent.
                        borderColor: hasError
                            ? colors.accent.red
                            : focused
                            ? colors.accent.coral
                            : colors.border.default,
                        borderWidth: focused || hasError ? 1.5 : 1,
                        textAlignVertical: multiline ? 'top' : 'center',
                        height: multiline ? 120 : 56
                    }
                ]}
                value={value}
                onChangeText={onChangeText}
                onFocus={() => setFocused(true)}
                onBlur={() => { setFocused(false); onBlur?.(); }}
                placeholder={placeholder}
                placeholderTextColor={colors.text.tertiary}
                multiline={multiline}
                numberOfLines={numberOfLines}
                accessibilityLabel={label}
                {...rest}
            />
            {hasError ? (
                <View style={styles.errorRow}>
                    <Ionicons name="alert-circle" size={14} color={colors.accent.red} style={{ marginRight: 6 }} />
                    <Text
                        accessibilityRole="alert"
                        accessibilityLiveRegion="polite"
                        accessibilityLabel={error}
                        style={[typography.caption, { color: colors.accent.red, flex: 1 }]}
                    >
                        {error}
                    </Text>
                </View>
            ) : null}
        </View>
    );
}

// Read-only context row inside a field group — same visual rhythm as an input
// but non-interactive (a muted lock affordance signals it can't be edited here).
function MetaRow({ icon, label, value }: { icon: any; label: string; value: string }) {
    const { colors, typography, borderRadius } = useTheme();
    return (
        <View style={styles.inputGroup}>
            <Text style={[typography.overline, { color: colors.text.secondary, marginBottom: 10 }]}>{label}</Text>
            <View
                accessible
                accessibilityLabel={`${label}, ${value}`}
                style={[
                    styles.input,
                    styles.metaRow,
                    { backgroundColor: colors.background.secondary, borderRadius: borderRadius.xl, borderColor: colors.border.default },
                ]}
            >
                <Ionicons name={icon} size={16} color={colors.text.tertiary} style={{ marginRight: 10 }} />
                <Text numberOfLines={1} style={[typography.body, { color: colors.text.secondary, flex: 1 }]}>{value}</Text>
                <Ionicons name="lock-closed" size={14} color={colors.text.tertiary} />
            </View>
        </View>
    );
}

// The avatar tap — the screen's hero interaction. A Reanimated Pressable that
// springs to a 0.96 pressed-scale (transform-only, interruptible) instead of the
// flat opacity fade the rest of the legacy screen used. All a11y/hitSlop/handler
// props are preserved exactly; only the press FEEDBACK changes.
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function AnimatedAvatar({ onPress, children }: { onPress: () => void; children: React.ReactNode }) {
    const { colors, shadows } = useTheme();
    const scale = useSharedValue(1);
    const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
    return (
        <AnimatedPressable
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Change photo"
            onPress={onPress}
            onPressIn={() => { scale.value = withSpring(0.96, { damping: 15, stiffness: 320 }); }}
            onPressOut={() => { scale.value = withSpring(1, { damping: 15, stiffness: 320 }); }}
            style={[
                styles.avatarOutline,
                { borderColor: colors.accent.coral, backgroundColor: colors.background.secondary },
                shadows.glow(colors.accent.coral),
                animatedStyle,
            ]}
        >
            {children}
        </AnimatedPressable>
    );
}

// Animated character-budget fill under the live count — a gamified progress
// affordance for the name length. Fills count/max with a spring-smoothed
// withTiming, and tints coral → red as it nears the cap. Colour is NOT the only
// cap signal: the count numeral above already turns red when over-limit; this
// reinforces it. Purely visual — reads `count`/`max`, drives no state.
function CharacterBudgetBar({ count, max, overLimit }: { count: number; max: number; overLimit: boolean }) {
    const { colors } = useTheme();
    // Clamp the visual ratio to [0,1] so an over-limit paste can't overflow the track.
    const ratio = Math.max(0, Math.min(1, max > 0 ? count / max : 0));
    const progress = useSharedValue(ratio);

    useEffect(() => {
        progress.value = withTiming(ratio, { duration: 360, easing: Easing.out(Easing.cubic) });
    }, [ratio, progress]);

    // 1 once the budget enters its final stretch (or is exceeded) — drives the
    // coral→red colour crossover so the fill warns before the hard cap.
    const danger = useDerivedValue(() => (overLimit ? 1 : progress.value > 0.85 ? 1 : 0), [overLimit]);

    const fillStyle = useAnimatedStyle(() => ({
        width: `${progress.value * 100}%`,
        backgroundColor: interpolateColor(
            danger.value,
            [0, 1],
            [colors.accent.coral, colors.accent.red],
        ),
    }));

    return (
        <View
            style={[styles.budgetTrack, { backgroundColor: withAlpha(colors.text.primary, 0.08) }]}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
        >
            <Animated.View style={[styles.budgetFill, fillStyle]} />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1 },
    backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    avatarSection: { alignItems: 'center', marginTop: 24, marginBottom: 24 },
    avatarOutline: { width: 104, height: 104, borderRadius: 52, borderWidth: 2, padding: 4 },
    avatarImg: { width: '100%', height: '100%', borderRadius: 46 },
    editBadge: { position: 'absolute', bottom: 0, right: 0, width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
    statBand: { borderRadius: 20, borderWidth: 1, paddingVertical: 16, paddingHorizontal: 16, marginBottom: 28 },
    statRow: { flexDirection: 'row', alignItems: 'flex-end' },
    statItem: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
    statItemSecondary: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 4 },
    statDivider: { width: 1, alignSelf: 'stretch', marginVertical: 4, marginHorizontal: 4 },
    budgetTrack: { height: 6, borderRadius: 3, overflow: 'hidden', marginTop: 16 },
    budgetFill: { height: '100%', borderRadius: 3 },
    group: {},
    groupHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
    form: { gap: 20 },
    inputGroup: {},
    input: { paddingHorizontal: 16, fontSize: 16, borderWidth: 1 },
    metaRow: { flexDirection: 'row', alignItems: 'center', height: 56 },
    errorRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
});
