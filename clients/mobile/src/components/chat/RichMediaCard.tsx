import React from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

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

export function RichMediaCard({ type, title, subtitle, imageUrl, onPress }: RichMediaCardProps) {
    const config = TYPE_CONFIG[type];

    return (
        <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.8}>
            {imageUrl ? (
                <Image source={{ uri: imageUrl }} style={styles.image} />
            ) : (
                <View style={[styles.iconArea, { backgroundColor: config.bg }]}>
                    <Ionicons name={config.icon} size={24} color={config.color} />
                </View>
            )}
            <View style={styles.info}>
                <Text style={styles.title} numberOfLines={1}>{title}</Text>
                {subtitle && <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>}
            </View>
            <Ionicons name="chevron-forward" size={16} color="#484F58" />
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#161B22', borderRadius: 16, padding: 12, borderWidth: 1, borderColor: '#21262D', marginVertical: 4, maxWidth: '80%' },
    image: { width: 44, height: 44, borderRadius: 12 },
    iconArea: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    info: { flex: 1, marginHorizontal: 12 },
    title: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
    subtitle: { color: '#8B949E', fontSize: 12, marginTop: 2 },
});
