import React, { useState } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
    ActivityIndicator, Alert, KeyboardAvoidingView, Platform
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createPost } from '@/api/community';
import { withAlpha } from '@/theme/utils';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { GlassCard, CtaButton } from '@/components/ui';
import { PressableScale } from '@/components/ui/PressableScale';

// Soft character budget — drives the live character-feedback ring/count only.
// It is purely advisory: posting is gated solely on non-empty content (exactly
// as before), so this never blocks the mutation — it just tints amber as the
// author nears it and red just past it, the way a polished composer guides.
const MAX_CHARS = 500;

// Where this post goes. The create-post API takes only (content, image) and
// publishes to the shared community feed — there is no per-post visibility on
// the wire. So rather than surface a privacy control ("Followers" / "Only me")
// that silently has zero effect on who sees the post, we state the one true
// destination. This is an honest, neutral affordance, not a non-functional
// toggle: every post here is shared to the Community feed, full stop.
const DESTINATION = { label: 'Community feed', icon: 'earth' as const };

export default function CreatePostModal() {
    const { colors, typography, borderRadius, spacing } = useTheme();
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

    // ── Derived UI state ─────────────────────────────────────────────────────
    const charCount = content.length;
    const hasContent = content.trim().length > 0;
    const isComposing = hasContent || !!image;
    const overLimit = charCount > MAX_CHARS;
    const nearLimit = charCount > MAX_CHARS * 0.85;
    // Character-feedback color: neutral → amber (near) → red (over). Never the
    // only signal — the numeric remaining count carries the same information.
    const countColor = overLimit
        ? colors.accent.red
        : nearLimit
            ? colors.accent.amber
            : colors.text.tertiary;
    const remaining = MAX_CHARS - charCount;

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={[styles.container, { backgroundColor: colors.background.primary }]}
        >
            <StatusBar style="light" />

            {/* Drag handle — sheet dismiss affordance */}
            <View style={{ paddingTop: insets.top + 8, alignItems: 'center' }}>
                <View style={[styles.grabber, { backgroundColor: withAlpha(colors.text.primary, 0.18) }]} />
            </View>

            {/* Header */}
            <View style={[styles.header, { borderBottomColor: withAlpha(colors.border.default, 0.6) }]}>
                <PressableScale
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    accessibilityRole="button"
                    accessibilityLabel="Close"
                    onPress={() => router.back()}
                    style={[styles.iconBtn, { backgroundColor: withAlpha(colors.text.primary, 0.06) }]}
                >
                    <Ionicons name="close" size={22} color={colors.text.primary} />
                </PressableScale>

                <View style={styles.headerTitleWrap}>
                    <Text style={[typography.overline, { color: colors.text.tertiary }]}>COMMUNITY</Text>
                    <Text style={[typography.h3, { color: colors.text.primary }]}>New Post</Text>
                </View>

                {/* Live character feedback — value dominates, near/over states tint */}
                <View
                    style={styles.counterWrap}
                    accessibilityLabel={
                        overLimit
                            ? `${charCount} characters, ${charCount - MAX_CHARS} over the limit`
                            : `${remaining} characters remaining`
                    }
                >
                    <Text
                        style={[
                            typography.statTiny,
                            // Zeitra rule: stats/counters render in the condensed stat
                            // face. statTiny is the body family bumped to 18; borrow
                            // statSmall's fontFamily so the numeral reads tall/athletic
                            // and matches the rest of the system.
                            { color: countColor, fontSize: 18, lineHeight: 20, fontFamily: typography.statSmall.fontFamily },
                        ]}
                        maxFontSizeMultiplier={1.3}
                    >
                        {overLimit ? `+${charCount - MAX_CHARS}` : remaining}
                    </Text>
                    <Text style={[typography.caption, { color: colors.text.tertiary, fontSize: 9, letterSpacing: 0.5 }]}>
                        {overLimit ? 'OVER' : 'LEFT'}
                    </Text>
                </View>
            </View>

            <ScrollView
                contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing['2xl'] }}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            >
                {/* Destination — a single, honest statement of where this goes.
                    No privacy toggle is shown because the API has no per-post
                    visibility; every post here publishes to the Community feed. */}
                <Animated.View entering={FadeInDown.duration(360)}>
                    <Text style={[typography.overline, { color: colors.text.tertiary, marginBottom: spacing.sm }]}>
                        POSTING TO
                    </Text>
                    <View
                        style={[
                            styles.destinationBanner,
                            {
                                backgroundColor: withAlpha(colors.text.primary, 0.04),
                                borderColor: withAlpha(colors.text.primary, 0.08),
                            },
                        ]}
                        accessibilityRole="text"
                        accessibilityLabel={`Posting to ${DESTINATION.label}, visible to everyone`}
                    >
                        <Ionicons name={DESTINATION.icon} size={15} color={colors.text.secondary} />
                        <Text
                            style={[
                                typography.captionMedium,
                                { color: colors.text.secondary, marginLeft: 8 },
                            ]}
                            maxFontSizeMultiplier={1.3}
                        >
                            {DESTINATION.label}
                        </Text>
                        <Text
                            style={[
                                typography.caption,
                                { color: colors.text.tertiary, marginLeft: 8 },
                            ]}
                            maxFontSizeMultiplier={1.3}
                        >
                            · visible to everyone
                        </Text>
                    </View>
                </Animated.View>

                {/* Composer card */}
                <Animated.View entering={FadeInDown.delay(60).duration(360)}>
                    <GlassCard style={styles.composer} radius={borderRadius['2xl']}>
                        {/* Author + destination context row */}
                        <View style={styles.authorRow}>
                            <View style={[styles.avatar, { backgroundColor: withAlpha(colors.accent.coral, 0.16), borderColor: withAlpha(colors.accent.coral, 0.3) }]}>
                                {/* Decorative avatar glyph — softened lime tint so full
                                    lime stays reserved for the Post CTA + active states. */}
                                <Ionicons name="person" size={18} color={withAlpha(colors.accent.coral, 0.55)} />
                            </View>
                            <View style={{ flex: 1, marginLeft: spacing.md }}>
                                <Text style={[typography.subtitle, { color: colors.text.primary }]}>You</Text>
                                <View style={styles.audienceHint}>
                                    <Ionicons name={DESTINATION.icon} size={11} color={colors.text.tertiary} />
                                    <Text style={[typography.caption, { color: colors.text.tertiary, marginLeft: 4 }]}>
                                        {DESTINATION.label}
                                    </Text>
                                </View>
                            </View>
                        </View>

                        <View style={styles.inputArea}>
                            <TextInput
                                style={[styles.input, { color: colors.text.primary, fontFamily: typography.body.fontFamily }]}
                                placeholder="Share your progress, a recipe, or just say hi..."
                                placeholderTextColor={colors.text.tertiary}
                                multiline
                                autoFocus
                                value={content}
                                onChangeText={setContent}
                            />

                            {/* Empty-state guidance — never a blank canvas */}
                            {!isComposing && (
                                <Animated.View
                                    entering={FadeIn.duration(260)}
                                    pointerEvents="none"
                                    style={styles.emptyHint}
                                >
                                    <View style={[styles.emptyIcon, { backgroundColor: withAlpha(colors.accent.coral, 0.1) }]}>
                                        {/* Decorative empty-state glyph — softened lime
                                            tint, keeping full lime for the primary action. */}
                                        <Ionicons name="sparkles" size={20} color={withAlpha(colors.accent.coral, 0.55)} />
                                    </View>
                                    <Text style={[typography.subtitle, { color: colors.text.secondary, textAlign: 'center', marginTop: spacing.md }]}>
                                        Inspire the community
                                    </Text>
                                    <Text style={[typography.caption, { color: colors.text.tertiary, textAlign: 'center', marginTop: 2, maxWidth: 240 }]}>
                                        A milestone, a meal, or a moment — add a photo, drop an emoji, hit Post.
                                    </Text>
                                </Animated.View>
                            )}
                        </View>

                        {/* Over-limit inline note — color is never the only signal */}
                        {overLimit && (
                            <Animated.View
                                entering={FadeIn.duration(200)}
                                style={[styles.limitNote, { backgroundColor: withAlpha(colors.accent.red, 0.1), borderColor: withAlpha(colors.accent.red, 0.25) }]}
                            >
                                <Ionicons name="alert-circle" size={13} color={colors.accent.red} />
                                <Text style={[typography.caption, { color: colors.accent.red, marginLeft: 6 }]}>
                                    {charCount - MAX_CHARS} over the recommended length
                                </Text>
                            </Animated.View>
                        )}
                    </GlassCard>
                </Animated.View>

                {/* Image preview */}
                {image && (
                    <Animated.View entering={FadeInDown.duration(300)} style={[styles.imagePreview, { borderColor: withAlpha(colors.text.primary, 0.1) }]}>
                        <Image source={{ uri: image }} style={[styles.previewImg, { borderRadius: borderRadius.xl }]} />
                        <PressableScale hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Remove photo"
                            style={[styles.removeImg, { backgroundColor: withAlpha(colors.background.primary, 0.78), borderColor: colors.border.default }]}
                            onPress={() => setImage(null)}
                        >
                            <Ionicons name="close" size={18} color={colors.text.primary} />
                        </PressableScale>
                        <View style={[styles.imageBadge, { backgroundColor: withAlpha(colors.background.primary, 0.6) }]}>
                            <Ionicons name="image" size={12} color={colors.text.secondary} />
                            <Text style={[typography.caption, { color: colors.text.secondary, marginLeft: 4 }]}>Photo attached</Text>
                        </View>
                    </Animated.View>
                )}
            </ScrollView>

            {/* Emoji Picker Row — shown when emoji button is toggled */}
            {showEmojis && (
                <Animated.View entering={FadeInDown.duration(220)}>
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        style={[styles.emojiRow, { borderTopColor: withAlpha(colors.border.default, 0.6), backgroundColor: colors.background.secondary }]}
                        contentContainerStyle={{ paddingHorizontal: 12, alignItems: 'center' }}
                        keyboardShouldPersistTaps="always"
                    >
                        {FITNESS_EMOJIS.map(emoji => (
                            <TouchableOpacity
                                key={emoji}
                                activeOpacity={0.85}
                                accessibilityRole="button"
                                accessibilityLabel={`Insert ${emoji} emoji`}
                                style={[styles.emojiBtn, { backgroundColor: withAlpha(colors.text.primary, 0.05) }]}
                                onPress={() => {
                                    setContent(prev => prev + emoji);
                                    setShowEmojis(false);
                                }}
                            >
                                <Text style={{ fontSize: 24 }}>{emoji}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </Animated.View>
            )}

            {/* Toolbar + primary CTA — thumb zone, safe-area padded */}
            <View style={[styles.toolbar, { borderTopColor: withAlpha(colors.border.default, 0.6), backgroundColor: colors.background.secondary, paddingBottom: insets.bottom + spacing.md }]}>
                <View style={styles.toolActions}>
                    <PressableScale
                        accessibilityRole="button"
                        accessibilityLabel="Add photo"
                        style={[styles.toolBtn, { backgroundColor: withAlpha(colors.text.primary, 0.06) }]}
                        onPress={handlePickImage}
                    >
                        <Ionicons name="image-outline" size={22} color={image ? colors.accent.cyan : colors.text.secondary} />
                    </PressableScale>
                    <PressableScale
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        accessibilityRole="button"
                        accessibilityLabel="Mention"
                        style={[styles.toolBtn, { backgroundColor: withAlpha(colors.text.primary, 0.06) }]}
                        onPress={() => setContent(prev => prev.endsWith('@') ? prev : prev + (prev.length > 0 && !prev.endsWith(' ') ? ' @' : '@'))}
                    >
                        <Ionicons name="at-outline" size={22} color={colors.text.secondary} />
                    </PressableScale>
                    <PressableScale
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        accessibilityRole="button"
                        accessibilityLabel="Add emoji"
                        accessibilityState={{ selected: showEmojis }}
                        style={[styles.toolBtn, { backgroundColor: showEmojis ? withAlpha(colors.accent.coral, 0.14) : withAlpha(colors.text.primary, 0.06) }]}
                        onPress={() => setShowEmojis(v => !v)}
                    >
                        <Ionicons
                            name="happy-outline"
                            size={22}
                            color={showEmojis ? colors.accent.coral : colors.text.secondary}
                        />
                    </PressableScale>
                </View>

                {/* Primary lime CTA — the one full-lime action, ink label */}
                <CtaButton
                    label={postMutation.isPending ? 'Posting…' : 'Post'}
                    icon="paper-plane"
                    onPress={() => postMutation.mutate()}
                    loading={postMutation.isPending}
                    disabled={postMutation.isPending || !content.trim()}
                    accessibilityLabel="Share post"
                    style={styles.cta}
                />
            </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    grabber: { width: 40, height: 5, borderRadius: 999 },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: 12,
        paddingBottom: 14,
        borderBottomWidth: 1,
    },
    iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    headerTitleWrap: { flex: 1, alignItems: 'center' },
    counterWrap: { width: 40, alignItems: 'center', justifyContent: 'center' },

    // Destination banner — single, honest "posting to" statement
    destinationBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: 44,
        paddingHorizontal: 14,
        marginBottom: 16,
        borderRadius: 14,
        borderWidth: 1,
    },

    // Composer
    composer: { padding: 16 },
    authorRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
    avatar: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    audienceHint: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
    inputArea: { minHeight: 168, justifyContent: 'flex-start' },
    input: { fontSize: 18, lineHeight: 28, minHeight: 168, textAlignVertical: 'top' },

    // Empty-state guidance (overlays the empty input area)
    emptyHint: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 24,
    },
    emptyIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },

    limitNote: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        marginTop: 12,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 10,
        borderWidth: 1,
    },

    // Image preview
    imagePreview: { marginTop: 16, position: 'relative', borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
    previewImg: { width: '100%', height: 240 },
    removeImg: { position: 'absolute', top: 12, right: 12, width: 32, height: 32, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
    imageBadge: { position: 'absolute', bottom: 12, left: 12, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },

    // Toolbar
    toolbar: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingTop: 12,
        borderTopWidth: 1,
        gap: 12,
    },
    toolActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    toolBtn: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    cta: { flex: 1, marginLeft: 'auto' },

    // Emoji row
    emojiRow: { borderTopWidth: 1, maxHeight: 64 },
    emojiBtn: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginHorizontal: 5, marginVertical: 9 },
});
