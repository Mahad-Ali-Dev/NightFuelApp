import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Animated, ScrollView, Alert } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme';
import { CtaButton, GlassCard } from '@/components/ui';
import { Skeleton } from '@/components/ui/Skeleton';
import { shadows } from '@/theme/shadows';
import { withAlpha } from '@/theme/utils';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOnboardingStore } from '@/store/onboardingStore';
import { useAuthStore } from '@/store/authStore';
import * as userApi from '@/api/users';
import { create as createShift } from '@/api/shifts';

/** Local-calendar `YYYY-MM-DD` for `date` (defaults to now). */
function localDate(date: Date = new Date()): string {
    const y = date.getFullYear();
    const m = `${date.getMonth() + 1}`.padStart(2, '0');
    const d = `${date.getDate()}`.padStart(2, '0');
    return `${y}-${m}-${d}`;
}
/** Today as a local-calendar `YYYY-MM-DD`. */
function todayLocalDate(): string {
    return localDate();
}
/** The local-calendar `YYYY-MM-DD` one day after the given `YYYY-MM-DD`. */
function nextLocalDate(ymd: string): string {
    const d = new Date(`${ymd}T00:00:00`);
    d.setDate(d.getDate() + 1);
    return localDate(d);
}

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

            // Map ActivityLevel — the client enum uses EXTREMELY_ACTIVE but the
            // user-service preferences schema expects EXTRA_ACTIVE. Without this the
            // whole "Finish & Sync" call 400s (ZodError) for anyone who picked "Extreme".
            let mappedActivity: string | undefined = data.activityLevel ?? undefined;
            if (mappedActivity === 'EXTREMELY_ACTIVE') mappedActivity = 'EXTRA_ACTIVE';

            // Filter health conditions (remove empty strings, schema requires min(1))
            const healthConditions = (data.healthConditions || []).filter(
                (c: string) => typeof c === 'string' && c.trim().length > 0,
            );

            // 2. Update Preferences (Lifestyle & Nutrition)
            const prefsPayload = clean({
                primaryGoal,
                lifestyleType: mappedLifestyle,
                experienceLevel: data.experienceLevel,
                activityLevel: mappedActivity,
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

            // Profile is now durably saved server-side. Clear the locally
            // persisted onboarding draft so the health PII it holds (weightKg /
            // heightCm / dateOfBirth / biologicalSex / healthConditions) doesn't
            // linger on-device after onboarding is complete. The shift block
            // below still reads the captured `data` snapshot, which reset()
            // leaves untouched.
            useOnboardingStore.getState().reset();

            // 4. Best-effort: persist the selected shift so a freshly-onboarded
            // user lands on a dashboard that reflects their schedule instead of
            // "No active shift" (and the circadian tab's ['circadian-model'] query,
            // which is enabled only when a current shift exists, can run). We use
            // the collected sleep window as the proxy for the shift window — the
            // user can refine the exact times later in the log-shift modal. This
            // is intentionally guarded in its OWN try/catch: a failure here must
            // NEVER block onboarding completion / the redirect below.
            const { shiftType, sleepWindowStart, sleepWindowEnd } = data;
            if (shiftType && sleepWindowStart && sleepWindowEnd) {
                try {
                    const today = todayLocalDate();
                    // Roll the end day +1 for an overnight window (end <= start),
                    // mirroring the overnight handling in log-shift.tsx.
                    const endDate = sleepWindowEnd <= sleepWindowStart
                        ? nextLocalDate(today)
                        : today;
                    const startTime = new Date(`${today}T${sleepWindowStart}:00`).toISOString();
                    const endTime = new Date(`${endDate}T${sleepWindowEnd}:00`).toISOString();
                    await createShift({
                        shiftType,
                        shiftDate: today,
                        startTime,
                        endTime,
                    });
                } catch (shiftError: any) {
                    // Non-blocking: log and swallow so completion still proceeds.
                    console.warn('[Onboarding] Best-effort shift creation failed (non-blocking):', shiftError?.response?.status, shiftError?.response?.data || shiftError?.message);
                }
            }

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
            <View style={[styles.miniIcon, { backgroundColor: withAlpha(colors.accent.cyan, 0.12) }]}>
                <Ionicons name={icon as any} size={14} color={colors.accent.cyan} />
            </View>
            <View>
                <Text style={[typography.caption, { color: colors.text.secondary }]}>{label}</Text>
                <Text style={[typography.body, { color: colors.text.primary, fontWeight: '600' }]}>{value || 'Not set'}</Text>
            </View>
        </View>
    );

    /** Loading placeholder that mirrors the summary card while we sync to the backend. */
    const SyncingSkeleton = () => (
        <GlassCard style={styles.summaryCard}>
            <View style={styles.summaryGrid}>
                {[0, 1].map((col) => (
                    <View key={col} style={styles.summaryColumn}>
                        <Skeleton width="60%" height={20} radius={6} />
                        {[0, 1, 2].map((row) => (
                            <View key={row} style={styles.summaryItem}>
                                <Skeleton width={28} height={28} radius={14} />
                                <View style={{ flex: 1, gap: spacing.xs }}>
                                    <Skeleton width="50%" height={10} radius={4} />
                                    <Skeleton width="80%" height={14} radius={4} />
                                </View>
                            </View>
                        ))}
                    </View>
                ))}
            </View>

            <View style={[styles.divider, { backgroundColor: colors.border.default }]} />

            <View style={styles.statsRow}>
                <View style={styles.statItem}>
                    <Skeleton width={88} height={28} radius={6} />
                    <Skeleton width={40} height={10} radius={4} style={{ marginTop: spacing.sm }} />
                </View>
                <View style={[styles.verticalDivider, { backgroundColor: colors.border.default }]} />
                <View style={styles.statItem}>
                    <Skeleton width={88} height={28} radius={6} />
                    <Skeleton width={40} height={10} radius={4} style={{ marginTop: spacing.sm }} />
                </View>
            </View>
        </GlassCard>
    );

    return (
        <View style={[styles.container, { backgroundColor: colors.background.primary, paddingTop: insets.top }]}>
            <StatusBar style="light" />
            <ScrollView contentContainerStyle={styles.scrollContent}>
                <View style={styles.heroBadgeWrap}>
                    <LinearGradient
                        colors={colors.gradients.cyan}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={[styles.heroBadge, shadows.glow(colors.accent.cyan)]}
                    >
                        <Ionicons name="sparkles" size={28} color={colors.text.inverse} />
                    </LinearGradient>
                </View>
                <Text style={[typography.overline, { color: colors.accent.cyan, textAlign: 'center', marginBottom: spacing.sm }]}>
                    ANALYSIS COMPLETE
                </Text>
                <Text style={[typography.display, { color: colors.text.primary, textAlign: 'center', marginBottom: spacing['2xl'] }]}>
                    Your Onboarding <Text style={{ color: colors.accent.cyan }}>Summary</Text>
                </Text>

                {isLoading ? <SyncingSkeleton /> : (
                <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
                    <GlassCard style={styles.summaryCard}>
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

                        <View style={[styles.divider, { backgroundColor: colors.border.default }]} />

                        <View style={styles.statsRow}>
                            <View style={styles.statItem}>
                                <Text numberOfLines={1} style={[typography.statSmall, { color: colors.text.primary }]}>{data.dietaryPreference || 'Any'}</Text>
                                <Text style={[typography.overline, { color: colors.text.secondary, marginTop: spacing.xs }]}>DIET</Text>
                            </View>
                            <View style={[styles.verticalDivider, { backgroundColor: colors.border.default }]} />
                            <View style={styles.statItem}>
                                <Text numberOfLines={1} style={[typography.statSmall, { color: colors.text.primary }]}>{data.dietMode || 'Balanced'}</Text>
                                <Text style={[typography.overline, { color: colors.text.secondary, marginTop: spacing.xs }]}>MODE</Text>
                            </View>
                        </View>
                    </GlassCard>

                    <GlassCard
                        glow={colors.accent.coral}
                        radius={16}
                        style={[styles.infoBox, { borderColor: withAlpha(colors.accent.coral, 0.22) }]}
                    >
                        <View style={styles.infoBoxRow}>
                            <Ionicons name="sparkles" size={20} color={colors.accent.coral} />
                            <Text style={[typography.body, { color: colors.text.secondary, flex: 1, marginLeft: spacing.sm }]}>
                                Based on your {data.shiftType?.toLowerCase().replace('_', ' ')} schedule, we've optimized your metabolic window for maximum performance.
                            </Text>
                        </View>
                    </GlassCard>
                </Animated.View>
                )}
            </ScrollView>

            <View style={[styles.footer, { backgroundColor: withAlpha(colors.background.primary, 0.92), borderTopColor: colors.border.default, paddingHorizontal: spacing.xl, paddingBottom: Math.max(insets.bottom, spacing['2xl']) }]}>
                <CtaButton
                    label={isLoading ? 'Saving Profile...' : 'Finish & Sync'}
                    icon={!isLoading ? 'checkmark-circle' : undefined}
                    size="lg"
                    loading={isLoading}
                    onPress={handleFinish}
                    disabled={isLoading}
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
    heroBadgeWrap: {
        alignItems: 'center',
        marginBottom: 16,
    },
    heroBadge: {
        width: 64,
        height: 64,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    summaryCard: {
        padding: 24,
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
        height: StyleSheet.hairlineWidth,
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
        width: StyleSheet.hairlineWidth,
        height: 30,
    },
    infoBox: {
        marginTop: 24,
        borderWidth: 1,
    },
    infoBoxRow: {
        flexDirection: 'row',
        padding: 16,
        alignItems: 'center',
    },
    footer: {
        paddingTop: 16,
        borderTopWidth: StyleSheet.hairlineWidth,
    }
});
