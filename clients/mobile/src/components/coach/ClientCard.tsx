import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/ui/Card';
import { CircularProgress } from '@/components/ui/CircularProgress';
import { colors } from '@/theme';

interface ClientCardProps {
    name: string;
    avatar: string;
    shiftType: string;
    adherence: number;
    alerts: number;
    lastActive: string;
    onPress?: () => void;
    onChat?: () => void;
}

function ClientCardComponent({ name, avatar, shiftType, adherence, alerts, lastActive, onPress, onChat }: ClientCardProps) {
    const adherenceColor = adherence >= 80 ? '#00D4AA' : adherence >= 60 ? '#FFB300' : '#FF4444';

    return (
        <TouchableOpacity activeOpacity={0.8} onPress={onPress}>
            <Card style={styles.card}>
                <View style={styles.row}>
                    <View style={[styles.avatarCircle, { backgroundColor: adherenceColor + '25' }]}>
                        <Text style={[styles.avatarText, { color: adherenceColor }]}>{avatar}</Text>
                    </View>
                    <View style={styles.info}>
                        <Text style={styles.name}>{name}</Text>
                        <Text style={styles.meta}>{shiftType} • Active {lastActive}</Text>
                    </View>
                    <CircularProgress progress={adherence / 100} size={40} strokeWidth={4} color={adherenceColor} trackColor={colors.border.light} />
                </View>
                <View style={styles.footer}>
                    <View style={styles.adherenceRow}>
                        <Text style={[styles.adherenceVal, { color: adherenceColor }]}>{adherence}%</Text>
                        <Text style={styles.adherenceLabel}> adherence</Text>
                    </View>
                    <View style={styles.footerActions}>
                        {alerts > 0 && (
                            <View style={styles.alertBadge}>
                                <Ionicons name="alert-circle" size={14} color="#FF4444" />
                                <Text style={styles.alertCount}>{alerts}</Text>
                            </View>
                        )}
                        <TouchableOpacity onPress={onChat} style={styles.chatBtn} activeOpacity={0.85}>
                            <Ionicons name="chatbubble" size={16} color="#7C4DFF" />
                        </TouchableOpacity>
                    </View>
                </View>
            </Card>
        </TouchableOpacity>
    );
}

/**
 * Memoized: primitive props plus stable `onPress`/`onChat` callbacks, no
 * internal state. Rendered in the coach client roster list.
 */
export const ClientCard = React.memo(ClientCardComponent);

const styles = StyleSheet.create({
    card: { padding: 16, marginBottom: 12 },
    row: { flexDirection: 'row', alignItems: 'center' },
    avatarCircle: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
    avatarText: { fontSize: 18, fontWeight: '700' },
    info: { flex: 1 },
    name: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
    meta: { color: colors.text.secondary, fontSize: 12, marginTop: 2 },
    footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border.default },
    adherenceRow: { flexDirection: 'row', alignItems: 'center' },
    adherenceVal: { fontSize: 14, fontWeight: '700' },
    adherenceLabel: { color: colors.text.secondary, fontSize: 12 },
    footerActions: { flexDirection: 'row', gap: 12, alignItems: 'center' },
    alertBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FF444420', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
    alertCount: { color: '#FF4444', fontSize: 12, fontWeight: '700' },
    chatBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#7C4DFF15', alignItems: 'center', justifyContent: 'center' },
});
