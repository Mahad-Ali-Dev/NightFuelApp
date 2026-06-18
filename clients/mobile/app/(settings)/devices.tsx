import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '@/theme';
import { spacing, borderRadius as br } from '@/theme/spacing';
import { shadows } from '@/theme/shadows';
import { withAlpha } from '@/theme/utils';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '@/components/ui';

/**
 * Connected Devices screen.
 *
 * Reachable from Settings > Connected Devices and the More tab. Previously the
 * row navigated to a non-existent route, dropping the user on expo-router's
 * "Unmatched Route" screen. This is the real destination: an honest empty state
 * until wearable / health-app sync is wired up.
 */
export default function ConnectedDevicesScreen() {
    const { colors, typography } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();

    return (
        <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
            <StatusBar style="light" />
            <View style={[styles.header, { paddingTop: insets.top + 16, borderBottomColor: colors.border.default }]}>
                <TouchableOpacity activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
                </TouchableOpacity>
                <Text style={[typography.heading, { color: colors.text.primary, fontSize: 18 }]}>Connected Devices</Text>
                <View style={{ width: 24 }} />
            </View>

            <ScrollView contentContainerStyle={{ padding: spacing['2xl'] }} showsVerticalScrollIndicator={false}>
                <GlassCard radius={br.xl} style={[styles.emptyCard, { padding: spacing['3xl'] }]}>
                    <View style={styles.empty}>
                        <View style={[styles.iconMedallion, shadows.glow(colors.accent.coral), { backgroundColor: withAlpha(colors.accent.coral, 0.12), borderColor: withAlpha(colors.accent.coral, 0.28) }]}>
                            <Ionicons name="watch-outline" size={48} color={colors.accent.coral} />
                        </View>
                        <Text style={[typography.h2, { color: colors.text.primary, textAlign: 'center', marginTop: spacing.xl }]}>
                            No devices connected
                        </Text>
                        <Text style={[typography.body, { color: colors.text.secondary, textAlign: 'center', marginTop: spacing.md, lineHeight: 22 }]}>
                            Wearable and health-app integrations — Apple Health, Google Health Connect, and fitness trackers —
                            are coming soon. Once connected, Zeitra will sync your sleep, heart rate, and activity to sharpen
                            your chrono-nutrition plan.
                        </Text>
                    </View>
                </GlassCard>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: spacing.xl,
        paddingBottom: spacing.lg,
        borderBottomWidth: 1,
    },
    emptyCard: { marginTop: spacing['2xl'] },
    empty: { alignItems: 'center', paddingVertical: spacing.lg, paddingHorizontal: spacing.md },
    iconMedallion: {
        width: 96,
        height: 96,
        borderRadius: br.full,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
});
