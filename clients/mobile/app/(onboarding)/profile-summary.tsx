import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Animated, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOnboardingStore } from '@/store/onboardingStore';
import { useAuthStore } from '@/store/authStore';
import * as userApi from '@/api/users';

export default function ProfileSummaryScreen() {
    const { colors, typography, spacing } = useTheme();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { data } = useOnboardingStore();
    const { updateUser } = useAuthStore();

    const [isLoading, setIsLoading] = useState(false);
    const [fadeAnim] = useState(new Animated.Value(0));
    const [slideAnim] = useState(new Animated.Value(50));

    useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
            Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true })
        ]).start();
    }, []);

    /** Strip null / undefined keys so Zod doesn't reject them */
    const clean = (obj: Record<string, unknown>) => {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(obj)) {
            if (v !== null && v !== undefined) out[k] = v;
        }
        return out;
    };

    const handleFinish = async () => {
        setIsLoading(true);
        try {
            // 1. Update Profile (Biological)
            const profilePayload = clean({
                dateOfBirth: data.dateOfBirth,
                biologicalSex: data.biologicalSex,
                heightCm: data.heightCm,
                weightKg: data.weightKg,
            });
            console.log('[Onboarding] Profile payload:', JSON.stringify(profilePayload));
            await userApi.updateProfile(profilePayload);

            // Map FitnessGoal → PrimaryGoal
            let primaryGoal: string | undefined;
            if (data.fitnessGoal === 'FAT_LOSS') primaryGoal = 'WEIGHT_LOSS';
            else if (data.fitnessGoal === 'MUSCLE_GAIN') primaryGoal = 'MUSCLE_GAIN';
            else if (data.fitnessGoal === 'GENERAL_HEALTH') primaryGoal = 'GENERAL_HEALTH';
            else primaryGoal = 'ENERGY';

            // Map LifestyleType
            let mappedLifestyle: string | undefined = data.lifestyleType ?? undefined;
            if (mappedLifestyle === 'NIGHT_SHIFT_WORKER') mappedLifestyle = 'NIGHT_SHIFT';
            if (mappedLifestyle === 'STAY_AT_HOME' || mappedLifestyle === 'FREELANCER') mappedLifestyle = 'OTHER';

            // Filter health conditions (remove empty strings, schema requires min(1))
            const healthConditions = (data.healthConditions || []).filter(
                (c: string) => typeof c === 'string' && c.trim().length > 0,
            );

            // 2. Update Preferences (Lifestyle & Nutrition)
            const prefsPayload = clean({
                primaryGoal,
                lifestyleType: mappedLifestyle,
                experienceLevel: data.experienceLevel,
                activityLevel: data.activityLevel,
                sleepWindowStart: data.sleepWindowStart,
                sleepWindowEnd: data.sleepWindowEnd,
                dietaryPreference: data.dietaryPreference === 'GLUTEN_FREE' as any ? 'NONE' : (data.dietaryPreference ?? undefined),
                dietMode: data.dietMode,
                ...(healthConditions.length > 0 ? { healthConditions } : {}),
            });
            console.log('[Onboarding] Preferences payload:', JSON.stringify(prefsPayload));
            await userApi.updatePreferences(prefsPayload);

            // 3. Mark Onboarding as Completed
            console.log('[Onboarding] Marking onboarding complete');
            await userApi.updateOnboarding({
                step: 4,
                completed: true,
            });

            // Update local state
            updateUser({ onboardingComplete: true });

            // Final redirect to dashboard
            router.replace('/(tabs)');
        } catch (error: any) {
            console.error('[Onboarding] Submission failed:', error?.response?.status, error?.response?.data || error.message);
            const status = error?.response?.status;
            const msg =
                status === 404
                    ? 'User service is not reachable. Please make sure the server is running and try again.'
                    : status === 400
                        ? `Validation error: ${error.response?.data?.message || 'check your inputs'}`
                        : error.response?.data?.message || 'Could not save your profile. Please check your connection and try again.';
            Alert.alert('Submission Failed', msg);
        } finally {
            setIsLoading(false);
        }
    };

    const SummaryItem = ({ label, value, icon }: { label: string, value: string | number | undefined, icon: string }) => (
        <View style={styles.summaryItem}>
            <View style={[styles.miniIcon, { backgroundColor: `${colors.accent.cyan}15` }]}>
                <Ionicons name={icon as any} size={14} color={colors.accent.cyan} />
            </View>
            <View>
                <Text style={[typography.caption, { color: colors.text.tertiary }]}>{label}</Text>
                <Text style={[typography.body, { color: colors.text.primary, fontWeight: '600' }]}>{value || 'Not set'}</Text>
            </View>
        </View>
    );

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            <ScrollView contentContainerStyle={styles.scrollContent}>
                <Text style={[typography.subhead, { color: colors.text.secondary, textAlign: 'center', marginBottom: spacing.md }]}>
                    ANALYSIS COMPLETE
                </Text>
                <Text style={[typography.display, { color: colors.text.primary, textAlign: 'center', marginBottom: spacing['2xl'] }]}>
                    Your Onboarding <Text style={{ color: colors.accent.cyan }}>Summary</Text>
                </Text>

                <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
                    <Card variant="elevated" style={styles.summaryCard}>
                        <View style={styles.summaryGrid}>
                            <View style={styles.summaryColumn}>
                                <Text style={[typography.heading, { color: colors.accent.cyan, marginBottom: spacing.md }]}>Biological</Text>
                                <SummaryItem label="Height" value={`${data.heightCm} cm`} icon="resize" />
                                <SummaryItem label="Weight" value={`${data.weightKg} kg`} icon="fitness" />
                                <SummaryItem label="Sex" value={data.biologicalSex ?? undefined} icon="person" />
                            </View>
                            <View style={styles.summaryColumn}>
                                <Text style={[typography.heading, { color: colors.accent.cyan, marginBottom: spacing.md }]}>Lifestyle</Text>
                                <SummaryItem label="Goal" value={data.fitnessGoal ?? undefined} icon="trophy" />
                                <SummaryItem label="Shift" value={data.shiftType ?? undefined} icon="moon" />
                                <SummaryItem label="Experience" value={data.experienceLevel ?? undefined} icon="star" />
                            </View>
                        </View>

                        <View style={styles.divider} />

                        <View style={styles.statsRow}>
                            <View style={styles.statItem}>
                                <Text style={[typography.heading, { color: colors.text.primary }]}>{data.dietaryPreference || 'Any'}</Text>
                                <Text style={[typography.caption, { color: colors.text.tertiary }]}>DIET</Text>
                            </View>
                            <View style={styles.verticalDivider} />
                            <View style={styles.statItem}>
                                <Text style={[typography.heading, { color: colors.text.primary }]}>{data.dietMode || 'Balanced'}</Text>
                                <Text style={[typography.caption, { color: colors.text.tertiary }]}>MODE</Text>
                            </View>
                        </View>
                    </Card>

                    <View style={styles.infoBox}>
                        <Ionicons name="sparkles" size={20} color={colors.accent.coral} />
                        <Text style={[typography.body, { color: colors.text.secondary, flex: 1, marginLeft: spacing.sm }]}>
                            Based on your {data.shiftType?.toLowerCase().replace('_', ' ')} schedule, we've optimized your metabolic window for maximum performance.
                        </Text>
                    </View>
                </Animated.View>
            </ScrollView>

            <View style={[styles.footer, { paddingHorizontal: spacing.xl, paddingBottom: Math.max(insets.bottom, spacing['2xl']) }]}>
                <Button
                    title={isLoading ? 'Saving Profile...' : 'Finish & Sync'}
                    iconRight={!isLoading ? <Ionicons name="checkmark-circle" size={20} color="#fff" /> : <ActivityIndicator color="#fff" />}
                    onPress={handleFinish}
                    disabled={isLoading}
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
    scrollContent: {
        padding: 24,
    },
    summaryCard: {
        padding: 24,
        backgroundColor: 'transparent',
        borderRadius: 24,
    },
    summaryGrid: {
        flexDirection: 'row',
        gap: 16,
    },
    summaryColumn: {
        flex: 1,
        gap: 16,
    },
    summaryItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    miniIcon: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    divider: {
        height: 1,
        backgroundColor: 'transparent',
        marginVertical: 24,
    },
    statsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-around',
    },
    statItem: {
        alignItems: 'center',
    },
    verticalDivider: {
        width: 1,
        height: 30,
        backgroundColor: 'transparent',
    },
    infoBox: {
        flexDirection: 'row',
        backgroundColor: 'rgba(255, 107, 53, 0.05)',
        padding: 16,
        borderRadius: 16,
        marginTop: 24,
        borderWidth: 1,
        borderColor: 'rgba(255, 107, 53, 0.1)',
        alignItems: 'center',
    },
    footer: {
        paddingTop: 16,
        backgroundColor: 'rgba(0,0,0,0.8)',
    }
});
