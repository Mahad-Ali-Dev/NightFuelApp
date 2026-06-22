import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from '@/theme';
import { Card } from '@/components/ui/Card';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { EmptyState } from '@/components/ui';
import { withAlpha } from '@/theme/utils';
import { typography as typo } from '@/theme/typography';

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
    const { colors, typography, shadows } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const queryClient = useQueryClient();
    const { elapsed, volume, kcal } = useLocalSearchParams<{ elapsed?: string; volume?: string; kcal?: string }>();

    const elapsedSeconds = elapsed ? parseInt(elapsed, 10) : 0;
    const displayTime = formatElapsed(isNaN(elapsedSeconds) ? 0 : elapsedSeconds);
    const totalVolume = volume ? Math.max(0, Math.round(parseFloat(volume))) : 0;
    const totalKcal = kcal ? Math.max(0, Math.round(parseFloat(kcal))) : 0;

    // Honest-states guard for the raw deep-link / cold-reload / aborted-finish
    // mount: when ALL three params are absent or non-finite there is nothing
    // real to celebrate, so we render an EmptyState instead of three zeroed
    // stat cards. The normal path (a finite elapsed plus any positive metric)
    // is unchanged. `totalVolume`/`totalKcal` are already finite (Math.max
    // floors NaN-derived values to 0 via parseFloat) and `elapsedSeconds` may
    // be NaN, which `Number.isFinite` rejects — so this stays finite-safe.
    const hasAnyMetric =
        Number.isFinite(elapsedSeconds) && (elapsedSeconds > 0 || totalVolume > 0 || totalKcal > 0);

    const handleReturn = () => {
        queryClient.invalidateQueries({ queryKey: ['active-session'] });
        queryClient.invalidateQueries({ queryKey: ['workout-active-session'] });
        router.dismissAll();
        router.replace('/(tabs)');
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
            <StatusBar style="light" />
            <LinearGradient
                colors={[withAlpha(colors.accent.cyan, 0.2), 'transparent']}
                style={StyleSheet.absoluteFillObject}
            />

            <View style={[styles.content, { paddingTop: insets.top + 60, paddingBottom: insets.bottom + 20 }]}>
                <View style={[styles.iconCircle, { backgroundColor: withAlpha(colors.accent.cyan, 0.1), borderColor: withAlpha(colors.accent.cyan, 0.3) }, shadows.glow(colors.accent.cyan)]}>
                    <Ionicons name="trophy" size={56} color={colors.accent.cyan} />
                </View>

                <Text
                    style={[typography.display, { color: colors.text.primary, fontSize: 40, marginTop: 24, textAlign: 'center' }]}
                    maxFontSizeMultiplier={1.2}
                >
                    Session{'\n'}Complete
                </Text>

                <Text style={[typography.body, { color: colors.text.secondary, textAlign: 'center', marginTop: 12, marginHorizontal: 32 }]}>
                    {hasAnyMetric
                        ? "Amazing work. You've logged another powerful session, optimizing your performance window."
                        : 'Your session is wrapped up. Head back to your dashboard to keep your window dialed in.'}
                </Text>

                {hasAnyMetric ? (
                    <View style={styles.statsRow}>
                        <Card variant="glass" style={styles.statBox}>
                            <Ionicons name="flash-outline" size={24} color={colors.accent.coral} style={{ marginBottom: 8 }} />
                            <Text style={[typography.caption, { color: colors.text.secondary }]}>Volume</Text>
                            <Text style={[styles.statValue, { color: colors.text.primary }]} maxFontSizeMultiplier={1.3}>{totalVolume.toLocaleString()} <Text style={[styles.statUnit, { color: colors.text.secondary }]}>kg</Text></Text>
                        </Card>
                        <Card variant="glass" style={styles.statBox}>
                            <Ionicons name="time-outline" size={24} color={colors.accent.cyan} style={{ marginBottom: 8 }} />
                            <Text style={[typography.caption, { color: colors.text.secondary }]}>Time</Text>
                            <Text style={[styles.statValue, { color: colors.text.primary }]} maxFontSizeMultiplier={1.3}>{displayTime}</Text>
                        </Card>
                        <Card variant="glass" style={styles.statBox}>
                            <Ionicons name="flame-outline" size={24} color={colors.accent.amber} style={{ marginBottom: 8 }} />
                            <Text style={[typography.caption, { color: colors.text.secondary }]}>Burn</Text>
                            <Text style={[styles.statValue, { color: colors.text.primary }]} maxFontSizeMultiplier={1.3}>{totalKcal} <Text style={[styles.statUnit, { color: colors.text.secondary }]}>kcal</Text></Text>
                        </Card>
                    </View>
                ) : (
                    <EmptyState
                        icon="barbell-outline"
                        title="No session data"
                        subtitle="We couldn't find any metrics for this session. Nothing was lost — just return to your dashboard."
                        style={styles.emptyState}
                    />
                )}

                <View style={{ flex: 1 }} />

                <TouchableOpacity
                    style={[styles.returnBtn, shadows.glow(colors.accent.cyan)]}
                    onPress={handleReturn}
                    activeOpacity={0.9}
                    accessibilityRole="button"
                    accessibilityLabel="Return to dashboard"
                >
                    <LinearGradient
                        colors={colors.gradients.cyan}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.returnBtnInner}
                    >
                        <Text style={[typography.h3, { color: colors.text.inverse, fontWeight: '700' }]}>Return to Dashboard</Text>
                    </LinearGradient>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    content: { flex: 1, paddingHorizontal: 24, alignItems: 'center' },
    iconCircle: { width: 120, height: 120, borderRadius: 60, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
    statsRow: { flexDirection: 'row', gap: 12, marginTop: 40, width: '100%' },
    statBox: { flex: 1, padding: 16, alignItems: 'center' },
    emptyState: { marginTop: 24, width: '100%' },
    statValue: { fontFamily: typo.statSmall.fontFamily, fontSize: 20, lineHeight: 28, marginTop: 2 },
    statUnit: { fontFamily: typo.statTiny.fontFamily, fontSize: 13 },
    returnBtn: { width: '100%', height: 56, borderRadius: 28 },
    returnBtnInner: { flex: 1, borderRadius: 28, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
});
