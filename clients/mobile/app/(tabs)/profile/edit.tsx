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
    const [form, setForm] = useState({
        name: '',
        aboutMe: '',
        occupation: '',
        avatarUrl: '',
    });

    useEffect(() => {
        if (profile) {
            setForm({
                name:        profile.name        ?? '',
                aboutMe:     profile.aboutMe      ?? '',
                occupation:  profile.occupation   ?? '',
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
                        {[0, 1].map((i) => (
                            <View key={i}>
                                <Skeleton width={120} height={12} radius={borderRadius.sm} style={{ marginBottom: 10 }} />
                                <Skeleton width="100%" height={56} radius={borderRadius.xl} />
                            </View>
                        ))}
                        <View>
                            <Skeleton width={120} height={12} radius={borderRadius.sm} style={{ marginBottom: 10 }} />
                            <Skeleton width="100%" height={120} radius={borderRadius.xl} />
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
                    accessibilityState={{ disabled: updateMutation.isPending }}
                    onPress={() => updateMutation.mutate(form)}
                    disabled={updateMutation.isPending}
                    activeOpacity={0.85}
                >
                    <Text style={[typography.subhead, { color: colors.accent.purple, fontWeight: 'bold', opacity: updateMutation.isPending ? 0.5 : 1 }]}>Save</Text>
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
                    />
                    <InputGroup
                        label="PROFESSION"
                        value={form.occupation}
                        onChangeText={(t: string) => setForm(p => ({ ...p, occupation: t }))}
                        placeholder="e.g. Trauma Surgeon, Shift Lead"
                    />
                    <InputGroup
                        label="ABOUT ME"
                        value={form.aboutMe}
                        onChangeText={(t: string) => setForm(p => ({ ...p, aboutMe: t }))}
                        placeholder="Tell the community about yourself..."
                        multiline
                        numberOfLines={4}
                    />
                </View>

                <Button
                    title={updateMutation.isPending ? 'SAVING...' : 'SAVE CHANGES'}
                    variant="primary"
                    style={{ marginTop: 40, height: 60 }}
                    onPress={() => updateMutation.mutate(form)}
                    disabled={updateMutation.isPending}
                />
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

function InputGroup({ label, value, onChangeText, placeholder, multiline, numberOfLines }: any) {
    const { colors, typography, borderRadius } = useTheme();
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
                        borderColor: colors.border.default,
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
            />
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
