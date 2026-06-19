/**
 * RichMediaCard — an inline chat attachment card (a meal / workout / plan /
 * achievement reference) rendered inside a transcript. Theme-driven (Aurora
 * tokens via useTheme) and a11y-labelled.
 *
 * Uses expo-image with cachePolicy="memory-disk" + contentFit + a short
 * transition (per the images skills) so thumbnails decode off-thread and cache
 * across re-renders. Memoized: a string-union `type`, strings, and a stable
 * `onPress` — it renders inside chat lists where unrelated messages re-render
 * frequently, so skipping unchanged cards pays off.
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/utils';

interface RichMediaCardProps {
    type: 'meal' | 'workout' | 'plan' | 'achievement';
    title: string;
    subtitle?: string;
    imageUrl?: string;
    onPress?: () => void;
}

// Per-type icon + accent token key. Colors resolve from the active theme at
// render so the card re-themes (Aurora / Night Read) with zero edits here.
const TYPE_CONFIG: Record<RichMediaCardProps['type'], { icon: keyof typeof Ionicons.glyphMap; accent: 'coral' | 'cyan' | 'purple' | 'amber' }> = {
    meal: { icon: 'restaurant', accent: 'coral' },
    workout: { icon: 'barbell', accent: 'cyan' },
    plan: { icon: 'document-text', accent: 'purple' },
    achievement: { icon: 'trophy', accent: 'amber' },
};

function RichMediaCardComponent({ type, title, subtitle, imageUrl, onPress }: RichMediaCardProps) {
    const { colors, typography } = useTheme();
    const config = TYPE_CONFIG[type];
    const accentColor = colors.accent[config.accent];

    return (
        <TouchableOpacity
            style={[styles.card, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}
            onPress={onPress}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={`${type}: ${title}${subtitle ? `, ${subtitle}` : ''}`}
        >
            {imageUrl ? (
                <Image
                    source={{ uri: imageUrl }}
                    style={styles.image}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    transition={200}
                />
            ) : (
                <View style={[styles.iconArea, { backgroundColor: withAlpha(accentColor, 0.16) }]}>
                    <Ionicons name={config.icon} size={24} color={accentColor} />
                </View>
            )}
            <View style={styles.info}>
                <Text style={[typography.bodySm, { color: colors.text.primary, fontWeight: '600' }]} numberOfLines={1}>{title}</Text>
                {subtitle ? <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 2 }]} numberOfLines={1}>{subtitle}</Text> : null}
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.text.tertiary} />
        </TouchableOpacity>
    );
}

export const RichMediaCard = React.memo(RichMediaCardComponent);

const styles = StyleSheet.create({
    card: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, padding: 12, borderWidth: 1, marginVertical: 4, maxWidth: '80%' },
    image: { width: 44, height: 44, borderRadius: 12 },
    iconArea: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    info: { flex: 1, marginHorizontal: 12 },
});
