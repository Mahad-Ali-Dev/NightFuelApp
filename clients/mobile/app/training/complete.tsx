import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image } from 'react-native';
import { useTheme } from '@/theme';
import { Card } from '@/components/ui/Card';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';

function formatElapsed(totalSeconds: number): string {
    const hours = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    if (hours > 0) {
        return `${hours}h ${mins}m`;
    }
    if (mins > 0) {
        return `${mins}m ${secs}s`;
    }
    return `${secs}s`;
}

export default function WorkoutCompleteScreen() {
    const { colors, typography, spacing } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const queryClient = useQueryClient();
    const { elapsed } = useLocalSearchParams<{ elapsed?: string }>();

    const elapsedSeconds = elapsed ? parseInt(elapsed, 10) : 0;
    const displayTime = formatElapsed(isNaN(elapsedSeconds) ? 0 : elapsedSeconds);

    const handleReturn = () => {
        queryClient.invalidateQueries({ queryKey: ['active-session'] });
        queryClient.invalidateQueries({ queryKey: ['workout-active-session'] });
        router.dismissAll();
        router.replace('/(tabs)');
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
            <LinearGradient
                colors={['rgba(0, 212, 170, 0.2)', 'transparent']}
                style={StyleSheet.absoluteFillObject}
            />

            <View style={[styles.content, { paddingTop: insets.top + 60, paddingBottom: insets.bottom + 20 }]}>
                <View style={styles.iconCircle}>
                    <Ionicons name="trophy" size={56} color="#00D4AA" />
                </View>

                <Text style={[typography.display, { color: colors.text.primary, fontSize: 40, marginTop: 24, textAlign: 'center' }]}>
                    Session{'\n'}Complete
                </Text>

                <Text style={[typography.body, { color: '#8B949E', textAlign: 'center', marginTop: 12, marginHorizontal: 32 }]}>
                    Amazing work. You've logged another powerful session, optimizing your performance window.
                </Text>

                <View style={styles.statsRow}>
                    <Card style={styles.statBox}>
                        <Ionicons name="flash-outline" size={24} color={colors.accent.coral} style={{ marginBottom: 8 }} />
                        <Text style={[typography.caption, { color: colors.text.secondary }]}>Volume</Text>
                        <Text style={[typography.heading, { color: colors.text.primary, fontSize: 20 }]}>2,450 kg</Text>
                    </Card>
                    <Card style={styles.statBox}>
                        <Ionicons name="time-outline" size={24} color={colors.accent.cyan} style={{ marginBottom: 8 }} />
                        <Text style={[typography.caption, { color: colors.text.secondary }]}>Time</Text>
                        <Text style={[typography.heading, { color: colors.text.primary, fontSize: 20 }]}>{displayTime}</Text>
                    </Card>
                    <Card style={styles.statBox}>
                        <Ionicons name="flame-outline" size={24} color={colors.accent.amber} style={{ marginBottom: 8 }} />
                        <Text style={[typography.caption, { color: colors.text.secondary }]}>Burn</Text>
                        <Text style={[typography.heading, { color: colors.text.primary, fontSize: 20 }]}>420 kcal</Text>
                    </Card>
                </View>

                <View style={{ flex: 1 }} />

                <TouchableOpacity
                    style={[styles.returnBtn, { backgroundColor: colors.accent.cyan }]}
                    onPress={handleReturn}
                >
                    <Text style={[typography.heading, { color: '#000', fontSize: 18, fontWeight: '700' }]}>Return to Dashboard</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    content: { flex: 1, paddingHorizontal: 24, alignItems: 'center' },
    iconCircle: { width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(0, 212, 170, 0.1)', borderWidth: 2, borderColor: 'rgba(0, 212, 170, 0.3)', alignItems: 'center', justifyContent: 'center' },
    statsRow: { flexDirection: 'row', gap: 12, marginTop: 40, width: '100%' },
    statBox: { flex: 1, backgroundColor: 'transparent', borderColor: 'transparent', borderWidth: 1, padding: 16, alignItems: 'center' },
    returnBtn: { width: '100%', height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', shadowColor: '#00D4AA', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 },
});
