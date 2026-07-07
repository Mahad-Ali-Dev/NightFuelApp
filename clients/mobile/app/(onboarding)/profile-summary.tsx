import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Alert } from 'react-native';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme';
import { CtaButton, GlassCard } from '@/components/ui';
import { Skeleton } from '@/components/ui/Skeleton';
import { ProfileStatTile } from '@/components/ProfileStatTile';
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

/** Title-case a SCREAMING_SNAKE enum for human-readable recap display. */
function prettyEnum(v: string | null | undefined): string | undefined {
    if (!v) return undefined;
    return v
        .toLowerCase()
        .split('_')
        .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
        .join(' ');
}

export default function ProfileSummaryScreen() {
    const { colors, typography, spacing } = useTheme();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { data } = useOnboardingStore();
    const { updateUser } = useAuthStore();

    const [isLoading, setIsLoading] = useState(false);
    // Persistent inline submit-error state. A transient Alert alone strands the
    // user on the single most important action in onboarding once dismissed, so
    // we also surface a recovery banner (icon + message, role="alert") above the
    // CTA with an explicit retry. Cleared on every fresh submit attempt.
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

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
        setErrorMsg(null);
        try {
            // 1. Update Profile (Biological)
            const profilePayload = clean({
                dateOfBirth: data.dateOfBirth,
                biologicalSex: data.biologicalSex,
                heightCm: data.heightCm,
                weightKg: data.weightKg,
                // Menstrual-cycle tracking (F25) is FEMALE-only. Send the cycle
                // fields ONLY for a female profile, so a male/other/opted-out user
                // never writes cycle PII — this also covers a FEMALE→non-FEMALE
                // switch where the cycle step was skipped on the second pass (the
                // step is the only screen that resets these). The backend further
                // gates the detail fields on cycleTrackingEnabled; `clean` strips
                // null detail fields so the backend applies its 28/5 defaults.
                // lastPeriodStartDate reuses the dateOfBirth YYYY-MM-DD format.
                ...(data.biologicalSex === 'FEMALE'
                    ? {
                          cycleTrackingEnabled: data.cycleTrackingEnabled,
                          lastPeriodStartDate: data.lastPeriodStartDate,
                          avgCycleLengthDays: data.avgCycleLengthDays,
                          avgPeriodLengthDays: data.avgPeriodLengthDays,
                          cycleRegularity: data.cycleRegularity,
                          hormonalContraception: data.hormonalContraception,
                      }
                    : {}),
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
            // Persist the failure inline (recovery path survives Alert dismissal)
            // AND keep the Alert for an immediate, unmissable signal.
            setErrorMsg(msg);
            Alert.alert('Submission Failed', msg);
        } finally {
            setIsLoading(false);
        }
    };

    // Human-readable recap values, derived from the captured onboarding draft.
    // Numeric biometrics keep their unit suffix; enums get title-cased.
    const heightValue = data.heightCm ? `${data.heightCm} cm` : undefined;
    const weightValue = data.weightKg ? `${data.weightKg} kg` : undefined;
    const sexValue = prettyEnum(data.biologicalSex);
    const goalValue = prettyEnum(data.fitnessGoal);
    const shiftValue = prettyEnum(data.shiftType);
    const experienceValue = prettyEnum(data.experienceLevel);
    const dietValue = prettyEnum(data.dietaryPreference) ?? 'Any';
    const modeValue = prettyEnum(data.dietMode) ?? 'Balanced';

    // Plan-highlight sentence noun. `shiftType` is OPTIONAL in this flow, so a raw
    // interpolation can read "Based on your  schedule…" (double space, no shift).
    // Reuse the already-prettified `shiftValue` and fall back to a neutral noun so
    // the sentence is always grammatical. (prettyEnum already does a GLOBAL
    // underscore replace, unlike the prior ad-hoc `.replace('_', ' ')`.)
    const shiftSentenceNoun = shiftValue ? `${shiftValue.toLowerCase()} schedule` : 'schedule';

    /** Loading placeholder that mirrors the recap layout while we sync to the backend. */
    const SyncingSkeleton = () => (
        <View>
            <View style={styles.statGrid}>
                {[0, 1, 2, 3, 4, 5].map((i) => (
                    <GlassCard key={i} radius={20} style={[styles.statCell, styles.skeletonCell]}>
                        <View style={styles.skeletonRow}>
                            {/* Mirror the real ProfileStatTile's lime icon-medallion
                                (fill + 1px lime border) so the loaded state doesn't
                                shift when the skeleton swaps out. */}
                            <View
                                style={[
                                    styles.skeletonMedallion,
                                    {
                                        backgroundColor: withAlpha(colors.accent.coral, 0.14),
                                        borderColor: withAlpha(colors.accent.coral, 0.28),
                                    },
                                ]}
                            >
                                <Skeleton width={18} height={18} radius={9} />
                            </View>
                            <Skeleton width="50%" height={10} radius={4} style={{ marginLeft: spacing.sm }} />
                        </View>
                        <Skeleton width="70%" height={22} radius={6} style={{ marginTop: spacing.md }} />
                    </GlassCard>
                ))}
            </View>
            <GlassCard radius={20} style={[styles.infoBox, { borderColor: withAlpha(colors.accent.coral, 0.22) }]}>
                <View style={styles.infoBoxRow}>
                    <Skeleton width={28} height={28} radius={14} />
                    <View style={{ flex: 1, marginLeft: spacing.md, gap: spacing.sm }}>
                        <Skeleton width="90%" height={12} radius={4} />
                        <Skeleton width="65%" height={12} radius={4} />
                    </View>
                </View>
            </GlassCard>
        </View>
    );

    return (
        <View style={[styles.container, { backgroundColor: colors.background.primary, paddingTop: insets.top }]}>
            <StatusBar style="light" />
            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                {/* Back row — this screen's layout forces `header: () => null`,
                    so it owns its OWN safe-area-aware back affordance (44pt target).
                    Without it a wrong Height/Sex/Goal would strand the user, since
                    the only other navigation is the forward `router.replace`.
                    `router.back()` returns to the previous onboarding step to edit;
                    the "Edit answers" button by the CTA jumps to the first step. */}
                <Reanimated.View entering={FadeInDown.duration(360)} style={styles.backRow}>
                    <Pressable
                        onPress={() => router.back()}
                        accessibilityRole="button"
                        accessibilityLabel="Back"
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        style={({ pressed }) => [
                            styles.backButton,
                            { backgroundColor: colors.background.secondary, borderColor: colors.border.default },
                            pressed ? { transform: [{ scale: 0.96 }], opacity: 0.85 } : null,
                        ]}
                    >
                        <Ionicons
                            name="arrow-back"
                            size={20}
                            color={colors.text.primary}
                            accessibilityElementsHidden
                            importantForAccessibility="no-hide-descendants"
                        />
                    </Pressable>
                </Reanimated.View>

                {/* Hero — confident "you're set" recap header. Lime gradient
                    medallion + overline + large display headline. One combined
                    accessible node so VoiceOver reads a single coherent stop
                    (not four: bare checkmark image + overline + display + body). */}
                <Reanimated.View
                    entering={FadeInDown.duration(460)}
                    style={styles.hero}
                    accessible
                    accessibilityRole="header"
                    accessibilityLabel="Profile complete. You're all set. Here's the profile we'll tune your plan around."
                >
                    <View style={styles.heroBadgeWrap}>
                        <LinearGradient
                            colors={colors.gradients.coral}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={[styles.heroBadge, shadows.glow(colors.accent.coral)]}
                        >
                            <Ionicons
                                name="checkmark-sharp"
                                size={32}
                                color={colors.text.inverse}
                                accessibilityElementsHidden
                                importantForAccessibility="no-hide-descendants"
                            />
                        </LinearGradient>
                    </View>
                    <Text
                        style={[typography.overline, { color: colors.accent.coral, textAlign: 'center', marginBottom: spacing.sm }]}
                        maxFontSizeMultiplier={1.3}
                    >
                        Profile Complete
                    </Text>
                    <Text
                        style={[typography.display, { color: colors.text.primary, textAlign: 'center' }]}
                        maxFontSizeMultiplier={1.2}
                    >
                        You're all <Text style={{ color: colors.accent.coral }}>set</Text>
                    </Text>
                    <Text
                        style={[typography.body, { color: colors.text.secondary, textAlign: 'center', marginTop: spacing.sm }]}
                        maxFontSizeMultiplier={1.3}
                    >
                        Here's the profile we'll tune your plan around.
                    </Text>
                </Reanimated.View>

                {isLoading ? <SyncingSkeleton /> : (
                /* Body now relies SOLELY on the Reanimated staggered FadeInDown
                   entrances below (40ms/item) — the legacy core-Animated 800ms
                   fade + 600ms linear slide wrapper was removed: it double-animated
                   opacity/translate, fought the stagger and was slower than its
                   own children. */
                <View>
                    {/* Section label */}
                    <Reanimated.View
                        entering={FadeInDown.delay(80).duration(420)}
                        style={[styles.sectionHeadRow, { marginBottom: spacing.md }]}
                    >
                        <Text style={[typography.overline, { color: colors.text.tertiary }]}>
                            Your Profile
                        </Text>
                        <Ionicons
                            name="body-outline"
                            size={14}
                            color={colors.text.tertiary}
                            accessibilityElementsHidden
                            importantForAccessibility="no-hide-descendants"
                        />
                    </Reanimated.View>

                    {/* Recap stat grid — 2-up premium glass tiles, staggered in. */}
                    <View style={styles.statGrid}>
                        {[
                            { label: 'Height', value: heightValue, icon: 'resize-outline' as const, mono: true },
                            { label: 'Weight', value: weightValue, icon: 'barbell-outline' as const, mono: true },
                            { label: 'Sex', value: sexValue, icon: 'person-outline' as const, mono: false },
                            { label: 'Goal', value: goalValue, icon: 'trophy-outline' as const, mono: false },
                            { label: 'Shift', value: shiftValue, icon: 'moon-outline' as const, mono: false },
                            { label: 'Experience', value: experienceValue, icon: 'star-outline' as const, mono: false },
                        ].map((s, index) => (
                            <Reanimated.View
                                key={s.label}
                                entering={FadeInDown.delay(120 + index * 40).duration(420).springify()}
                                style={styles.statCell}
                            >
                                <ProfileStatTile
                                    label={s.label}
                                    value={s.value}
                                    icon={s.icon}
                                    mono={s.mono}
                                />
                            </Reanimated.View>
                        ))}
                    </View>

                    {/* Nutrition recap — two tabular stats in one wide glass card. */}
                    <Reanimated.View entering={FadeInDown.delay(360).duration(420).springify()}>
                        <GlassCard radius={20} style={styles.nutritionCard}>
                            <View style={styles.statsRow}>
                                <View style={styles.statItem} accessible accessibilityRole="text" accessibilityLabel={`Diet: ${dietValue}`}>
                                    {/* Proportional bold face (NOT the wide JetBrains-Mono
                                        stat face): these are WORDS — "No Restrictions",
                                        "Gluten Free", "Mediterranean" — that clip at 24px
                                        mono in a half-width column. adjustsFontSizeToFit +
                                        maxFontSizeMultiplier keep long labels readable. */}
                                    <Text
                                        numberOfLines={1}
                                        adjustsFontSizeToFit
                                        minimumFontScale={0.8}
                                        maxFontSizeMultiplier={1.2}
                                        style={[typography.h3, { color: colors.text.primary, textAlign: 'center' }]}
                                    >
                                        {dietValue}
                                    </Text>
                                    <Text style={[typography.overline, { color: colors.text.secondary, marginTop: spacing.xs }]} maxFontSizeMultiplier={1.3}>DIET</Text>
                                </View>
                                <View style={[styles.verticalDivider, { backgroundColor: colors.border.default }]} />
                                <View style={styles.statItem} accessible accessibilityRole="text" accessibilityLabel={`Mode: ${modeValue}`}>
                                    <Text
                                        numberOfLines={1}
                                        adjustsFontSizeToFit
                                        minimumFontScale={0.8}
                                        maxFontSizeMultiplier={1.2}
                                        style={[typography.h3, { color: colors.text.primary, textAlign: 'center' }]}
                                    >
                                        {modeValue}
                                    </Text>
                                    <Text style={[typography.overline, { color: colors.text.secondary, marginTop: spacing.xs }]} maxFontSizeMultiplier={1.3}>MODE</Text>
                                </View>
                            </View>
                        </GlassCard>
                    </Reanimated.View>

                    {/* Plan highlight — the optimized-window callout, lime-glow card. */}
                    <Reanimated.View entering={FadeInDown.delay(420).duration(420).springify()}>
                        <GlassCard
                            glow={colors.accent.coral}
                            radius={16}
                            style={[styles.infoBox, { borderColor: withAlpha(colors.accent.coral, 0.22) }]}
                        >
                            <View style={styles.infoBoxRow} accessible accessibilityRole="text">
                                <View style={[styles.infoIconWrap, { backgroundColor: withAlpha(colors.accent.coral, 0.14) }]}>
                                    <Ionicons
                                        name="sparkles"
                                        size={18}
                                        color={colors.accent.coral}
                                        accessibilityElementsHidden
                                        importantForAccessibility="no-hide-descendants"
                                    />
                                </View>
                                <Text
                                    style={[typography.bodySm, { color: colors.text.secondary, flex: 1, marginLeft: spacing.md }]}
                                    maxFontSizeMultiplier={1.3}
                                >
                                    Based on your {shiftSentenceNoun}, we've optimized your metabolic window for maximum performance.
                                </Text>
                            </View>
                        </GlassCard>
                    </Reanimated.View>
                </View>
                )}
            </ScrollView>

            <View style={[styles.footer, { backgroundColor: withAlpha(colors.background.primary, 0.92), borderTopColor: colors.border.default, paddingHorizontal: spacing.xl, paddingBottom: Math.max(insets.bottom, spacing['2xl']) }]}>
                {/* Persistent inline error + retry. Survives Alert dismissal so the
                    single most important onboarding action always shows a recovery
                    path. Icon + colored text (color is not the only signal) and
                    role="alert" so it's announced. */}
                {errorMsg ? (
                    <View
                        style={[styles.errorBanner, { backgroundColor: withAlpha(colors.error, 0.12), borderColor: withAlpha(colors.error, 0.4) }]}
                        accessibilityRole="alert"
                        accessibilityLiveRegion="assertive"
                    >
                        <Ionicons
                            name="alert-circle"
                            size={18}
                            color={colors.error}
                            accessibilityElementsHidden
                            importantForAccessibility="no-hide-descendants"
                        />
                        <Text style={[typography.bodySm, { color: colors.error, flex: 1, marginLeft: spacing.sm }]} maxFontSizeMultiplier={1.3}>
                            {errorMsg}
                        </Text>
                        <Pressable
                            onPress={handleFinish}
                            disabled={isLoading}
                            accessibilityRole="button"
                            accessibilityLabel="Retry saving your profile"
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            style={({ pressed }) => [styles.retryBtn, pressed ? { opacity: 0.6 } : null]}
                        >
                            <Text style={[typography.captionMedium, { color: colors.error, textTransform: 'uppercase', letterSpacing: 0.5 }]} maxFontSizeMultiplier={1.3}>
                                Retry
                            </Text>
                        </Pressable>
                    </View>
                ) : null}

                <CtaButton
                    label={isLoading ? 'Saving…' : 'Finish & Sync'}
                    icon={!isLoading ? 'checkmark-circle' : undefined}
                    size="lg"
                    loading={isLoading}
                    onPress={handleFinish}
                    disabled={isLoading}
                />

                {/* Secondary recovery affordance: jump back to the first editable
                    step (Biological Data → Height/Sex) to fix a wrong answer. Plain
                    text button, 44pt target, never the primary CTA. */}
                <Pressable
                    onPress={() => router.push('/(onboarding)/metrics-goals')}
                    disabled={isLoading}
                    accessibilityRole="button"
                    accessibilityLabel="Edit answers"
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={({ pressed }) => [styles.editAnswersBtn, pressed ? { opacity: 0.6 } : null, isLoading ? { opacity: 0.4 } : null]}
                >
                    <Text style={[typography.captionMedium, { color: colors.text.secondary, textTransform: 'uppercase', letterSpacing: 0.5 }]} maxFontSizeMultiplier={1.3}>
                        Edit answers
                    </Text>
                </Pressable>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: 24,
        paddingTop: 24,
        paddingBottom: 24,
    },
    hero: {
        alignItems: 'center',
        marginBottom: 28,
    },
    heroBadgeWrap: {
        alignItems: 'center',
        marginBottom: 16,
    },
    heroBadge: {
        width: 72,
        height: 72,
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
    },
    sectionHeadRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    statGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
    },
    statCell: {
        width: '48%',
        marginBottom: 12,
    },
    skeletonCell: {
        minHeight: 104,
        padding: 16,
        justifyContent: 'space-between',
    },
    skeletonRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    nutritionCard: {
        padding: 20,
        marginTop: 4,
    },
    statsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-around',
    },
    statItem: {
        // Bounded half-width column (was content-sized) so adjustsFontSizeToFit
        // has a real width to shrink long word values like "No Restrictions" into.
        flex: 1,
        alignItems: 'center',
        paddingHorizontal: 8,
    },
    verticalDivider: {
        width: StyleSheet.hairlineWidth,
        height: 30,
    },
    infoBox: {
        marginTop: 16,
        borderWidth: 1,
    },
    infoBoxRow: {
        flexDirection: 'row',
        padding: 16,
        alignItems: 'center',
    },
    infoIconWrap: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    footer: {
        paddingTop: 16,
        borderTopWidth: StyleSheet.hairlineWidth,
    },
    backRow: {
        flexDirection: 'row',
        marginBottom: 8,
    },
    backButton: {
        width: 44,
        height: 44,
        borderRadius: 14,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    skeletonMedallion: {
        width: 36,
        height: 36,
        borderRadius: 18,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    errorBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderRadius: 12,
        paddingVertical: 12,
        paddingHorizontal: 14,
        marginBottom: 12,
    },
    retryBtn: {
        minHeight: 44,
        justifyContent: 'center',
        paddingHorizontal: 8,
        marginLeft: 8,
    },
    editAnswersBtn: {
        alignSelf: 'center',
        minHeight: 44,
        justifyContent: 'center',
        paddingHorizontal: 16,
        marginTop: 8,
    },
});
