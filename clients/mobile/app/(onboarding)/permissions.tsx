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
// import healthKit from 'react-native-health';

export default function PermissionsScreen() {
    const { colors, typography, spacing } = useTheme();
    const router = useRouter();
    const insets = useSafeAreaInsets();

    const [notifications, setNotifications] = useState(false);
    const [healthKit, setHealthKit] = useState(false);

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
                            onValueChange={setHealthKit}
                            trackColor={{ false: colors.border.default, true: colors.accent.cyan }}
                            thumbColor={colors.text.primary}
                        />
                    </View>
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
