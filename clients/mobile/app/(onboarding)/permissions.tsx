import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import Animated, {
    FadeInDown,
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    runOnJS,
    Easing,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme';
import { CtaButton } from '@/components/ui';
import { withAlpha } from '@/theme/utils';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { PermissionCard } from '@/components/PermissionCard';
// import * as Notifications from 'expo-notifications';
import { getHealthSyncAdapter } from '@/lib/healthSync';
import { useOnboardingStore } from '@/store/onboardingStore';
import { getOnboardingStep } from '@/utils/onboardingSteps';

// This closing screen sits OUTSIDE the onboarding Stack header, so it renders
// its own "STEP X OF N" indicator. To stay honest end-to-end, the numbers are
// derived from the SAME source the header uses (getOnboardingStep): the last
// visible in-header step is its `total` (5 for the FEMALE cycle path, 4
// otherwise, since the headerless summary is excluded), and Permissions is the
// step AFTER that — so the denominator and our number are total + 1. Hardcoding
// "6 OF 6" previously contradicted the header, which only ever counted to 5/4.
//
// The bar is intentionally NOT filled here: a user still has required actions
// (grant permissions, tap "Start"), so we hold the meter just short of full and
// only animate it to 100% on completion — never showing a "done" bar before the
// flow is actually done.
const APPROACHING_FRACTION = 0.92;

export default function PermissionsScreen() {
    const { colors, typography, spacing } = useTheme();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const biologicalSex = useOnboardingStore((s) => s.data.biologicalSex);

    // The last in-header step's `total` IS the count of visible header steps;
    // Permissions is the one after it. Passing an out-of-flow route makes
    // getOnboardingStep return that flow's full `total` (5 FEMALE / 4 otherwise).
    const stepTotal = getOnboardingStep('permissions', biologicalSex).total;
    const stepNumber = stepTotal + 1;
    const totalSteps = stepTotal + 1;

    // Progress meter — held just short of full while actions remain, then
    // animated to 100% in handleFinish before we leave. Drives both the bar
    // width and the live "%" readout off the same shared value.
    const progress = useSharedValue(APPROACHING_FRACTION);
    const [progressPct, setProgressPct] = useState(Math.round(APPROACHING_FRACTION * 100));
    const barStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

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

    const goToTabs = () => {
        router.replace('/(tabs)');
    };

    const handleFinish = async () => {
        // In a real app we would request native permissions here
        // await requestPermissions();

        // Now that the flow is genuinely complete, let the meter reach 100%
        // (a satisfying close) and only then navigate. The "%" readout snaps to
        // 100 immediately so the number and the bar agree.
        setProgressPct(100);
        progress.value = withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) }, (finished) => {
            if (finished) {
                runOnJS(goToTabs)();
            }
        });
    };

    const handleSkip = () => {
        // Skip bypasses granting but still completes onboarding → tabs. No bar
        // fill here: nothing was completed, so we route immediately.
        goToTabs();
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
            <StatusBar style="light" />

            {/* Progress indicator — this closing step renders its own (it sits
                outside the onboarding Stack header), keeping the "STEP N OF N"
                rhythm consistent with the earlier steps. Same lime accent +
                track as the header bar, and the meter is animated (held just
                short of full until handleFinish drives it to 100%). */}
            <Animated.View
                entering={FadeInDown.duration(360)}
                style={[
                    styles.progressHeader,
                    {
                        paddingTop: Math.max(insets.top, spacing.xl) + spacing.sm,
                        paddingHorizontal: spacing.xl,
                        paddingBottom: spacing.lg,
                        backgroundColor: colors.background.primary,
                    },
                ]}
            >
                <View style={[styles.progressTextRow, { marginBottom: spacing.sm }]}>
                    <Text style={[typography.overline, styles.tabular, { color: colors.text.secondary }]}>
                        STEP {stepNumber} OF {totalSteps}
                    </Text>
                    <Text style={[typography.overline, styles.tabular, { color: colors.accent.coral }]}>
                        {progressPct}%
                    </Text>
                </View>
                <View
                    style={[
                        styles.progressTrack,
                        { backgroundColor: withAlpha(colors.accent.coralDark, 0.24) },
                    ]}
                >
                    <Animated.View
                        style={[styles.progressFill, barStyle, { backgroundColor: colors.accent.coral }]}
                    />
                </View>
            </Animated.View>

            <ScrollView
                contentContainerStyle={{
                    paddingHorizontal: spacing.xl,
                    paddingTop: spacing.lg,
                    paddingBottom: spacing['2xl'],
                }}
                showsVerticalScrollIndicator={false}
            >
                {/* Hero block — large bold numeral signature (matching every
                    sibling step) paired with the circadian "sparkles" badge,
                    title + intent, staggered in. The lime "NN" + muted "/ NN"
                    reads as the genuine last beat of the same progress system. */}
                <Animated.View entering={FadeInDown.delay(60).duration(420)}>
                    <View style={[styles.heroRow, { marginBottom: spacing.lg, gap: spacing.lg }]}>
                        <Text
                            style={[typography.display, styles.heroNumeral, styles.tabular, { color: colors.accent.coral }]}
                            maxFontSizeMultiplier={1.2}
                        >
                            {String(stepNumber).padStart(2, '0')}
                        </Text>
                        <View style={styles.heroNumeralMeta}>
                            <Text style={[typography.h3, styles.tabular, { color: colors.text.tertiary }]}>
                                / {String(totalSteps).padStart(2, '0')}
                            </Text>
                            <Text style={[typography.overline, { color: colors.accent.coral }]}>
                                ALMOST THERE
                            </Text>
                        </View>
                        <View style={styles.heroBadgeWrap}>
                            <LinearGradient
                                colors={colors.gradients.coral}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={styles.heroBadge}
                            >
                                <Ionicons name="sparkles" size={26} color={colors.text.inverse} />
                            </LinearGradient>
                        </View>
                    </View>

                    <Text style={[typography.display, { color: colors.text.primary, marginBottom: spacing.sm }]}>
                        Final <Text style={{ color: colors.accent.coral }}>steps</Text>
                    </Text>
                    <Text style={[typography.body, { color: colors.text.secondary }]}>
                        Grant a couple of permissions and Zeitra keeps your circadian
                        clock synced automatically. You can change these anytime in
                        Settings.
                    </Text>
                </Animated.View>

                {/* Section label */}
                <Animated.View entering={FadeInDown.delay(120).duration(420)}>
                    <Text
                        style={[
                            typography.overline,
                            { color: colors.text.tertiary, marginTop: spacing['2xl'], marginBottom: spacing.md },
                        ]}
                    >
                        Recommended access
                    </Text>
                </Animated.View>

                {/* Per-permission cards — staggered 70ms apart. Each preserves its
                    original toggle state, accessibilityLabel and handler. */}
                <Animated.View entering={FadeInDown.delay(170).duration(440)}>
                    <PermissionCard
                        icon="notifications"
                        accent={colors.accent.coral}
                        title="Push Notifications"
                        rationale="Meal reminders & caffeine cutoffs, timed to your shift."
                        value={notifications}
                        onValueChange={setNotifications}
                        switchAccessibilityLabel="Push notifications"
                        recommended
                    />
                </Animated.View>

                <Animated.View entering={FadeInDown.delay(240).duration(440)}>
                    <PermissionCard
                        icon="heart"
                        accent={colors.accent.cyan}
                        title="Apple Health"
                        rationale="Sync sleep & activity from Oura, Apple Watch and more."
                        value={healthKit}
                        onValueChange={(next) => { void handleHealthToggle(next); }}
                        switchAccessibilityLabel="Apple Health sync"
                        recommended
                        notice={healthNotice}
                    />
                </Animated.View>

                {/* Privacy reassurance — quiet trust signal, not a CTA. Rendered
                    in neutral surface + text so lime stays the screen's only
                    chromatic accent (no competing tint on the closing beat). */}
                <Animated.View
                    entering={FadeInDown.delay(310).duration(420)}
                    style={[
                        styles.privacyRow,
                        {
                            marginTop: spacing.sm,
                            padding: spacing.md,
                            borderRadius: 14,
                            backgroundColor: colors.background.secondary,
                            borderColor: colors.border.default,
                        },
                    ]}
                >
                    <Ionicons name="lock-closed" size={16} color={colors.text.tertiary} />
                    <Text style={[typography.caption, styles.privacyText, { color: colors.text.secondary }]}>
                        Your data stays private and is never sold. Skip anything you are
                        not ready for.
                    </Text>
                </Animated.View>
            </ScrollView>

            {/* Bottom action bar — one primary CTA, safe-area aware. */}
            <View
                style={[
                    styles.footer,
                    {
                        paddingHorizontal: spacing.xl,
                        paddingTop: spacing.lg,
                        paddingBottom: Math.max(insets.bottom, spacing.lg) + spacing.sm,
                        borderTopColor: withAlpha(colors.text.primary, 0.06),
                        backgroundColor: colors.background.primary,
                    },
                ]}
            >
                <CtaButton
                    label="Start Zeitra"
                    icon="rocket"
                    size="lg"
                    onPress={handleFinish}
                />
                {/* Secondary action — deliberately de-emphasised (centered,
                    text-only, not full-width) so the lime CTA above is the
                    single, unambiguous primary. Has its own skip handler and a
                    ≥44pt hit area with a subtle pressed scale. */}
                <Pressable
                    onPress={handleSkip}
                    accessibilityRole="button"
                    accessibilityLabel="Skip for now"
                    accessibilityHint="Continue to the app without granting permissions"
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={({ pressed }) => [
                        styles.skip,
                        { marginTop: spacing.md },
                        pressed ? { opacity: 0.6, transform: [{ scale: 0.98 }] } : null,
                    ]}
                >
                    <Text style={[typography.captionMedium, { color: colors.text.tertiary }]}>
                        Skip for now
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
    progressHeader: {
        // Sits above the scroll view so the bar stays pinned while content scrolls.
    },
    progressTextRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    progressTrack: {
        height: 4,
        borderRadius: 2,
        overflow: 'hidden',
        width: '100%',
    },
    progressFill: {
        height: '100%',
        borderRadius: 2,
    },
    tabular: {
        fontVariant: ['tabular-nums'],
    },
    heroRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    heroNumeral: {
        // Deliberate one-off hero display size — matches the sibling steps'
        // "large bold numeral" so this closing screen reads in the same system.
        fontSize: 56,
        lineHeight: 60,
    },
    heroNumeralMeta: {
        justifyContent: 'center',
    },
    heroBadgeWrap: {
        marginLeft: 'auto',
    },
    heroBadge: {
        width: 56,
        height: 56,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    privacyRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        borderWidth: 1,
    },
    privacyText: {
        flex: 1,
        lineHeight: 18,
    },
    footer: {
        borderTopWidth: 1,
    },
    skip: {
        alignSelf: 'center',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 44,
        paddingHorizontal: 24,
    },
});
