import React, { useState } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
    ActivityIndicator, Alert, KeyboardAvoidingView, Platform
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createPost } from '@/api/community';
import { Button } from '@/components/ui';
import { withAlpha } from '@/theme/utils';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';

export default function CreatePostModal() {
    const { colors, typography, spacing, borderRadius } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const queryClient = useQueryClient();

    const [content, setContent] = useState('');
    const [image, setImage] = useState<string | null>(null);
    const [showEmojis, setShowEmojis] = useState(false);

    const FITNESS_EMOJIS = ['💪', '🏃', '🔥', '🥗', '😴', '⚡', '🎯', '🙌', '❤️', '👊', '🏋️', '🥤'];

    const postMutation = useMutation({
        mutationFn: () => createPost(content, image || undefined),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['community-feed'] });
            router.back();
        },
        onError: (err: any) => {
            Alert.alert('Error', err.message || 'Failed to create post');
        }
    });

    const handlePickImage = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            quality: 0.7,
        });

        if (!result.canceled) {
            setImage(result.assets?.[0]?.uri ?? null);
        }
    };

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={[styles.container, { backgroundColor: colors.background.primary }]}
        >
            {/* Header */}
            <View style={[styles.header, { paddingTop: insets.top + 20, borderBottomColor: colors.border.default }]}>
                <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Close" onPress={() => router.back()} style={styles.backBtn}>
                    <Ionicons name="close" size={28} color={colors.text.primary} />
                </TouchableOpacity>
                <Text style={[typography.heading, { color: colors.text.primary, fontSize: 18 }]}>New Post</Text>
                <TouchableOpacity
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel="Share post"
                    accessibilityState={{ disabled: postMutation.isPending || !content.trim() }}
                    onPress={() => postMutation.mutate()}
                    disabled={postMutation.isPending || !content.trim()}
                >
                    <Text style={[typography.subhead, { color: colors.accent.cyan, fontWeight: 'bold', opacity: content.trim() ? 1 : 0.5 }]}>Share</Text>
                </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: 20 }}>
                <View style={styles.inputArea}>
                    <TextInput
                        style={[styles.input, { color: colors.text.primary }]}
                        placeholder="Share your progress, a recipe, or just say hi..."
                        placeholderTextColor={colors.text.tertiary}
                        multiline
                        autoFocus
                        value={content}
                        onChangeText={setContent}
                    />
                </View>

                {image && (
                    <View style={styles.imagePreview}>
                        <Image source={{ uri: image }} style={[styles.previewImg, { borderRadius: borderRadius.lg }]} />
                        <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Close"
                            style={[styles.removeImg, { backgroundColor: withAlpha(colors.background.primary, 0.7), borderColor: colors.border.default }]}
                            onPress={() => setImage(null)}
                        >
                            <Ionicons name="close" size={20} color={colors.text.primary} />
                        </TouchableOpacity>
                    </View>
                )}
            </ScrollView>

            {/* Emoji Picker Row — shown when emoji button is toggled */}
            {showEmojis && (
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={[styles.emojiRow, { borderTopColor: colors.border.default, backgroundColor: colors.background.secondary }]}
                    contentContainerStyle={{ paddingHorizontal: 12, alignItems: 'center' }}
                    keyboardShouldPersistTaps="always"
                >
                    {FITNESS_EMOJIS.map(emoji => (
                        <TouchableOpacity
                            key={emoji}
                            activeOpacity={0.85}
                            accessibilityRole="button"
                            accessibilityLabel={`Insert ${emoji} emoji`}
                            style={styles.emojiBtn}
                            onPress={() => {
                                setContent(prev => prev + emoji);
                                setShowEmojis(false);
                            }}
                        >
                            <Text style={{ fontSize: 26 }}>{emoji}</Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            )}

            {/* Toolbar */}
            <View style={[styles.toolbar, { borderTopColor: colors.border.default, paddingBottom: insets.bottom + 10 }]}>
                <TouchableOpacity activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Add photo" style={styles.toolBtn} onPress={handlePickImage}>
                    <Ionicons name="image-outline" size={24} color={colors.accent.cyan} />
                    <Text style={[typography.caption, { color: colors.text.secondary, marginLeft: 8 }]}>Photo</Text>
                </TouchableOpacity>
                <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Mention"
                    style={styles.toolBtn}
                    onPress={() => setContent(prev => prev.endsWith('@') ? prev : prev + (prev.length > 0 && !prev.endsWith(' ') ? ' @' : '@'))}
                >
                    <Ionicons name="at-outline" size={24} color={colors.accent.cyan} />
                </TouchableOpacity>
                <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Add emoji"
                    style={styles.toolBtn}
                    onPress={() => setShowEmojis(v => !v)}
                >
                    <Ionicons
                        name="happy-outline"
                        size={24}
                        color={showEmojis ? colors.accent.coral : colors.accent.cyan}
                    />
                </TouchableOpacity>

                <View style={{ marginLeft: 'auto' }}>
                    {postMutation.isPending && <ActivityIndicator size="small" color={colors.accent.cyan} />}
                </View>
            </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1 },
    backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    inputArea: { minHeight: 150 },
    input: { fontSize: 18, lineHeight: 28 },
    imagePreview: { marginTop: 20, position: 'relative' },
    previewImg: { width: '100%', height: 250 },
    removeImg: { position: 'absolute', top: 12, right: 12, width: 32, height: 32, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
    toolbar: { flexDirection: 'row', alignItems: 'center', padding: 16, borderTopWidth: 1 },
    toolBtn: { flexDirection: 'row', alignItems: 'center', marginRight: 24 },
    emojiRow: { borderTopWidth: 1, maxHeight: 60 },
    emojiBtn: { paddingHorizontal: 8, paddingVertical: 8 },
});
