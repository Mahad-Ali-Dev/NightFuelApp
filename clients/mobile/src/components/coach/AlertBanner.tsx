import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface AlertBannerProps {
    title: string;
    message: string;
    severity?: 'high' | 'medium' | 'low';
    onDismiss?: () => void;
    onAction?: () => void;
    actionLabel?: string;
}

const SEVERITY = {
    high: { bg: '#FF444420', border: '#FF4444', icon: 'alert-circle' as const, color: '#FF4444' },
    medium: { bg: '#FFB30020', border: '#FFB300', icon: 'warning' as const, color: '#FFB300' },
    low: { bg: '#4FC3F720', border: '#4FC3F7', icon: 'information-circle' as const, color: '#4FC3F7' },
};

export function AlertBanner({ title, message, severity = 'high', onDismiss, onAction, actionLabel = 'View' }: AlertBannerProps) {
    const s = SEVERITY[severity];

    return (
        <View style={[styles.container, { backgroundColor: s.bg, borderColor: s.border }]}>
            <View style={styles.headerRow}>
                <Ionicons name={s.icon} size={20} color={s.color} />
                <Text style={[styles.title, { color: s.color }]}>{title}</Text>
                {onDismiss && (
                    <TouchableOpacity onPress={onDismiss} style={{ marginLeft: 'auto' }}>
                        <Ionicons name="close" size={18} color="#8B949E" />
                    </TouchableOpacity>
                )}
            </View>
            <Text style={styles.message}>{message}</Text>
            {onAction && (
                <TouchableOpacity style={[styles.actionBtn, { borderColor: s.color }]} onPress={onAction}>
                    <Text style={[styles.actionText, { color: s.color }]}>{actionLabel}</Text>
                </TouchableOpacity>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { borderRadius: 16, padding: 16, borderWidth: 1, marginBottom: 12 },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    title: { fontSize: 14, fontWeight: '700' },
    message: { color: '#C9D1D9', fontSize: 13, lineHeight: 20 },
    actionBtn: { alignSelf: 'flex-start', marginTop: 12, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 6 },
    actionText: { fontSize: 12, fontWeight: '700' },
});
