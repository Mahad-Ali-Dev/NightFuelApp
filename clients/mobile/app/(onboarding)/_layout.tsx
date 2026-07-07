import { Stack, useRouter, useSegments } from 'expo-router';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/utils';
import { Ionicons } from '@expo/vector-icons';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOnboardingStore } from '@/store/onboardingStore';
import { getOnboardingStep } from '@/utils/onboardingSteps';

export default function OnboardingLayout() {
    const { colors, typography } = useTheme();
    const router = useRouter();
    const segments = useSegments();
    const insets = useSafeAreaInsets();
    // The "STEP X OF N" indicator is derived from a SHARED util so the header
    // and any in-screen hero numeral (e.g. dietary-needs) read one value and
    // can't drift. The util also owns the cycle-step conditional (FEMALE-only).
    const biologicalSex = useOnboardingStore((s) => s.data.biologicalSex);

    // Determine current step based on route.
    // `currentRoute` is the expo-router segment union; compare as a string
    // (mirrors the existing `getStepTitle(currentRoute as string)` cast below)
    // since 'cycle-basics' is a real route but may not be in the generated union.
    const currentRoute = segments[segments.length - 1];
    const { current: stepNumber, total: totalSteps, fraction: progress } = getOnboardingStep(
        currentRoute as string | undefined,
        biologicalSex,
    );

    // Custom header matching the design
    const CustomHeader = () => (
        <View style={[styles.headerContainer, { backgroundColor: colors.background.primary, paddingTop: Math.max(insets.top, Platform.OS === 'ios' ? 50 : 20) }]}>
            <View style={styles.headerTop}>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="Go back" activeOpacity={0.85} onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={[styles.backButton, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
                    <Ionicons name="arrow-back" size={20} color={colors.text.primary} />
                </TouchableOpacity>
                <Text style={[typography.subhead, { color: colors.text.primary }]}>
                    {getStepTitle(currentRoute as string)}
                </Text>
                <View style={{ width: 36 }} />
            </View>
            <View style={styles.progressContainer}>
                <View style={styles.progressTextRow}>
                    <Text style={[typography.overline, { color: colors.text.secondary, fontVariant: ['tabular-nums'] }]}>
                        STEP {Math.min(stepNumber, totalSteps)} OF {totalSteps}
                    </Text>
                    <Text style={[typography.overline, { color: colors.accent.coral, fontVariant: ['tabular-nums'] }]}>
                        {Math.round(progress * 100)}%
                    </Text>
                </View>
                <ProgressBar progress={progress * 100} color={colors.accent.coral} trackColor={withAlpha(colors.accent.coralDark, 0.24)} height={4} />
            </View>
        </View>
    );

    return (
        <Stack screenOptions={{ header: () => <CustomHeader />, contentStyle: { backgroundColor: colors.background.primary } }}>
            <Stack.Screen name="metrics-goals" />
            <Stack.Screen name="cycle-basics" />
            <Stack.Screen name="shift-type" />
            <Stack.Screen name="sleep-schedule" />
            <Stack.Screen name="dietary-needs" />
            <Stack.Screen name="profile-summary" options={{ header: () => null }} />
        </Stack>
    );
}

function getStepTitle(route: string): string {
    switch (route) {
        case 'metrics-goals': return 'Biological Data';
        case 'cycle-basics': return 'Cycle';
        case 'shift-type': return 'Goals';
        case 'sleep-schedule': return 'Lifestyle';
        case 'dietary-needs': return 'Nutrition';
        case 'profile-summary': return 'Summary';
        default: return 'Onboarding';
    }
}

const styles = StyleSheet.create({
    headerContainer: {
        paddingHorizontal: 20,
        paddingBottom: 16,
    },
    headerTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
    },
    backButton: {
        width: 36,
        height: 36,
        borderRadius: 12,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    progressContainer: {
        gap: 8,
    },
    progressTextRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    }
});
