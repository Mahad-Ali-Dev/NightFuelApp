import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme';

interface RichMediaCardProps {
    type: 'meal' | 'workout' | 'plan' | 'achievement';
    title: string;
    subtitle?: string;
    imageUrl?: string;
    onPress?: () => void;
}

const TYPE_CONFIG = {
    meal: { icon: 'restaurant' as const, color: '#FF6B35', bg: '#FF6B3520' },
    workout: { icon: 'barbell' as const, color: '#00D4AA', bg: '#00D4AA20' },
    plan: { icon: 'document-text' as const, color: '#7C4DFF', bg: '#7C4DFF20' },
    achievement: { icon: 'trophy' as const, color: '#FFB300', bg: '#FFB30020' },
};

function RichMediaCardComponent({ type, title, subtitle, imageUrl, onPress }: RichMediaCardProps) {
    const config = TYPE_CONFIG[type];

    return (
        <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.8}>
            {imageUrl ? (
                <Image
                    source={{ uri: imageUrl }}
                    style={styles.image}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    transition={200}
                />
            ) : (
                <View style={[styles.iconArea, { backgroundColor: config.bg }]}>
                    <Ionicons name={config.icon} size={24} color={config.color} />
                </View>
            )}
            <View style={styles.info}>
                <Text style={styles.title} numberOfLines={1}>{title}</Text>
                {subtitle && <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>}
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.text.tertiary} />
        </TouchableOpacity>
    );
}

/**
 * Memoized: props are a string union, strings and a stable `onPress`. Renders
 * inside chat message lists where unrelated messages re-render frequently.
 */
export const RichMediaCard = React.memo(RichMediaCardComponent);

const styles = StyleSheet.create({
    card: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.background.secondary, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: colors.border.default, marginVertical: 4, maxWidth: '80%' },
    image: { width: 44, height: 44, borderRadius: 12 },
    iconArea: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    info: { flex: 1, marginHorizontal: 12 },
    title: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
    subtitle: { color: colors.text.secondary, fontSize: 12, marginTop: 2 },
});
