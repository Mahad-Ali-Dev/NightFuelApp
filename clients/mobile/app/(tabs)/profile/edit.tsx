import React, { useState, useEffect } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
    Alert, KeyboardAvoidingView, Platform
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme';
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
    const { colors, typography, spacing, borderRadius, shadows } = useTheme();
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

    const handleSave = () => {
        // Guard the mutation itself too: even if a control somehow fires while
        // invalid, never send a PUT the server will reject.
        if (saveDisabled) return;
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
                        <Skeleton width={100} height={100} radius={50} />
                        <Skeleton width={120} height={14} radius={borderRadius.sm} style={{ marginTop: 16 }} />
                    </View>
                    <View style={styles.form}>
                        {/* Single placeholder — the editor now has one persisted
                            field (DISPLAY NAME); aboutMe/occupation were removed. */}
                        <View>
                            <Skeleton width={120} height={12} radius={borderRadius.sm} style={{ marginBottom: 10 }} />
                            <Skeleton width="100%" height={56} radius={borderRadius.xl} />
                        </View>
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
                    activeOpacity={0.85}
                >
                    <Text style={[typography.subhead, { color: colors.accent.purple, fontWeight: 'bold', opacity: saveDisabled ? 0.5 : 1 }]}>Save</Text>
                </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
                {/* Avatar Edit */}
                <View style={styles.avatarSection}>
                    <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Change photo" onPress={handlePickImage} activeOpacity={0.85} style={[styles.avatarOutline, { borderColor: colors.accent.purple }, shadows.glow(colors.accent.purple)]}>
                        {form.avatarUrl ? (
                            <Image source={{ uri: form.avatarUrl }} style={styles.avatarImg} cachePolicy="memory-disk" transition={200} />
                        ) : (
                            <View style={[styles.avatarImg, { backgroundColor: colors.background.tertiary, alignItems: 'center', justifyContent: 'center' }]}>
                                <Ionicons name="camera" size={32} color={colors.text.tertiary} />
                            </View>
                        )}
                        <View style={[styles.editBadge, { backgroundColor: colors.accent.purple }]}>
                            <Ionicons name="pencil" size={14} color="#FFF" />
                        </View>
                    </TouchableOpacity>
                    <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 12 }]}>Tap to change photo</Text>
                </View>

                {/* Form Fields */}
                <View style={styles.form}>
                    <InputGroup
                        label="DISPLAY NAME"
                        value={form.name}
                        onChangeText={(t: string) => setForm(p => ({ ...p, name: t }))}
                        placeholder="Your full name"
                        error={nameError}
                    />
                </View>

                <Button
                    title={updateMutation.isPending ? 'SAVING...' : 'SAVE CHANGES'}
                    variant="primary"
                    style={{ marginTop: 40, height: 60 }}
                    onPress={handleSave}
                    disabled={saveDisabled}
                    accessibilityRole="button"
                    accessibilityLabel={updateMutation.isPending ? 'Saving changes' : 'Save changes'}
                    accessibilityState={{ disabled: saveDisabled, busy: updateMutation.isPending }}
                />
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

function InputGroup({ label, value, onChangeText, placeholder, multiline, numberOfLines, error }: any) {
    const { colors, typography, borderRadius } = useTheme();
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
                        // the inline alert below carries the same meaning for AT).
                        borderColor: hasError ? colors.accent.red : colors.border.default,
                        textAlignVertical: multiline ? 'top' : 'center',
                        height: multiline ? 120 : 56
                    }
                ]}
                value={value}
                onChangeText={onChangeText}
                placeholder={placeholder}
                placeholderTextColor={colors.text.tertiary}
                multiline={multiline}
                numberOfLines={numberOfLines}
                accessibilityLabel={label}
            />
            {hasError ? (
                <Text
                    accessibilityRole="alert"
                    accessibilityLiveRegion="polite"
                    accessibilityLabel={error}
                    style={[typography.caption, { color: colors.accent.red, marginTop: 8 }]}
                >
                    {error}
                </Text>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1 },
    backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    avatarSection: { alignItems: 'center', marginVertical: 32 },
    avatarOutline: { width: 100, height: 100, borderRadius: 50, borderWidth: 2, padding: 4 },
    avatarImg: { width: '100%', height: '100%', borderRadius: 45 },
    editBadge: { position: 'absolute', bottom: 0, right: 0, width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
    form: { gap: 24 },
    inputGroup: {},
    input: { paddingHorizontal: 16, fontSize: 16, borderWidth: 1 },
});
