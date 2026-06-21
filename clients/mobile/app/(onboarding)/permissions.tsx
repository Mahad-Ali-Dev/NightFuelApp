import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Switch } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme';
import { Button } from '@/components/ui/Button';
import { CtaButton } from '@/components/ui';
import { Card } from '@/components/ui/Card';
import { shadows } from '@/theme/shadows';
import { withAlpha } from '@/theme/utils';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
// import * as Notifications from 'expo-notifications';
import { getHealthSyncAdapter } from '@/lib/healthSync';

export default function PermissionsScreen() {
    const { colors, typography, spacing } = useTheme();
    const router = useRouter();
    const insets = useSafeAreaInsets();

    const [notifications, setNotifications] = useState(false);
    const [healthKit, setHealthKit] = useState(false);
    // Honest reason surfaced when Health can't be connected on this build (Expo
    // Go / no native module): the seam's no-op adapter resolves an 'unavailable'
    // result with a human-readable reason, which we show verbatim. We NEVER fake
    // a "connected" toggle — if connect() doesn't return 'connected', the switch
    // snaps back off.
    const [healthNotice, setHealthNotice] = useState<string | null>(null);

    // Drive the Health toggle through the health-sync seam (the same
    // getHealthSyncAdapter() the Connected Devices screen uses). The adapter
    // NEVER throws — a non-connected result is surfaced as DATA (the honest
    // reason) and the toggle reflects the real outcome rather than the tap.
    const handleHealthToggle = async (next: boolean) => {
        if (!next) {
            setHealthKit(false);
            setHealthNotice(null);
            void getHealthSyncAdapter().disconnect();
            return;
        }
        const result = await getHealthSyncAdapter().connect();
        if (result.status === 'connected') {
            setHealthKit(true);
            setHealthNotice(null);
        } else {
            // Honest: keep the toggle OFF and show why (e.g. needs a dev build).
            setHealthKit(false);
            setHealthNotice(result.reason ?? 'Health sync is unavailable on this build.');
        }
    };

    const handleFinish = async () => {
        // In a real app we would request native permissions here
        // await requestPermissions();

        // Set onboarding complete in backend via API or just locally
        // Navigation to tabs
        router.replace('/(tabs)');
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
            <StatusBar style="light" />
            <ScrollView contentContainerStyle={{ padding: spacing.xl }}>
                <View style={styles.heroBadgeWrap}>
                    <LinearGradient
                        colors={colors.gradients.coral}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={[styles.heroBadge, shadows.glow(colors.accent.coral)]}
                    >
                        <Ionicons name="rocket" size={28} color={colors.text.primary} />
                    </LinearGradient>
                </View>
                <Text style={[typography.display, { color: colors.text.primary, marginBottom: spacing.sm }]}>
                    Final <Text style={{ color: colors.accent.cyan }}>Steps</Text>
                </Text>
                <Text style={[typography.body, { color: colors.text.secondary, marginBottom: spacing['2xl'] }]}>
                    Enable permissions to let Zeitra keep your circadian clock synchronized automatically.
                </Text>

                <Text style={[typography.overline, { color: colors.text.secondary, marginBottom: spacing.md }]}>
                    Recommended access
                </Text>

                <Card variant="glass" style={styles.permissionCard}>
                    <View style={styles.headerRow}>
                        <View style={[styles.iconBox, { backgroundColor: withAlpha(colors.accent.coral, 0.14) }]}>
                            <Ionicons name="notifications" size={24} color={colors.accent.coral} />
                        </View>
                        <View style={styles.textStack}>
                            <Text style={[typography.heading, { color: colors.text.primary }]}>Push Notifications</Text>
                            <Text style={[typography.caption, { color: colors.text.secondary }]}>Meal reminders & caffeine cutoffs</Text>
                        </View>
                        <Switch
                            value={notifications}
                            onValueChange={setNotifications}
                            trackColor={{ false: colors.border.default, true: colors.accent.coral }}
                            thumbColor={colors.text.primary}
                        />
                    </View>
                </Card>

                <View style={{ height: spacing.lg }} />

                <Card variant="glass" style={styles.permissionCard}>
                    <View style={styles.headerRow}>
                        <View style={[styles.iconBox, { backgroundColor: withAlpha(colors.accent.cyan, 0.14) }]}>
                            <Ionicons name="heart" size={24} color={colors.accent.cyan} />
                        </View>
                        <View style={styles.textStack}>
                            <Text style={[typography.heading, { color: colors.text.primary }]}>Apple Health</Text>
                            <Text style={[typography.caption, { color: colors.text.secondary }]}>Sync sleep/activity from Oura, Apple Watch</Text>
                        </View>
                        <Switch
                            value={healthKit}
                            onValueChange={(next) => { void handleHealthToggle(next); }}
                            trackColor={{ false: colors.border.default, true: colors.accent.cyan }}
                            thumbColor={colors.text.primary}
                        />
                    </View>
                    {/* Honest unavailable reason (explicit ternary-null per
                        rules/rendering-no-falsy-and.md). Shown only after a failed
                        connect attempt; never implies a connection. */}
                    {healthNotice ? (
                        <Text
                            style={[typography.caption, { color: colors.text.tertiary, marginTop: spacing.md }]}
                            accessibilityRole="alert"
                            accessibilityLiveRegion="polite"
                        >
                            {healthNotice}
                        </Text>
                    ) : null}
                </Card>
            </ScrollView>

            <View style={[styles.footer, { paddingHorizontal: spacing.xl, paddingBottom: spacing['2xl'] }]}>
                <CtaButton
                    label="Start Zeitra"
                    icon="rocket"
                    size="lg"
                    onPress={handleFinish}
                />
                <Button
                    title="Skip for now"
                    variant="ghost"
                    onPress={handleFinish}
                    style={{ marginTop: spacing.md }}
                    fullWidth
                />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    heroBadgeWrap: {
        marginBottom: 16,
    },
    heroBadge: {
        width: 64,
        height: 64,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    permissionCard: {
        padding: 20,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    textStack: {
        flex: 1,
        marginHorizontal: 16,
    },
    iconBox: {
        width: 48,
        height: 48,
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
    },
    footer: {
        paddingTop: 16,
    }
});
