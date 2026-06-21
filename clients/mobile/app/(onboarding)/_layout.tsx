import { Stack, useRouter, useSegments } from 'expo-router';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useTheme } from '@/theme';
import { Ionicons } from '@expo/vector-icons';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOnboardingStore } from '@/store/onboardingStore';

export default function OnboardingLayout() {
    const { colors, typography } = useTheme();
    const router = useRouter();
    const segments = useSegments();
    const insets = useSafeAreaInsets();
    // The cycle-basics step is CONDITIONAL — only FEMALE users reach it (routing
    // branch in metrics-goals.tsx). When it's part of the flow the total step
    // count is 5, otherwise the original 4. We infer "this flow includes the
    // cycle step" from the collected biologicalSex so the "STEP X OF N"
    // denominator (previously hardcoded /4) stays accurate for both paths.
    const biologicalSex = useOnboardingStore((s) => s.data.biologicalSex);

    // Determine current step based on route
    const currentRoute = segments[segments.length - 1];
    // `currentRoute` is the expo-router segment union; compare as a string
    // (mirrors the existing `getStepTitle(currentRoute as string)` cast below)
    // since 'cycle-basics' is a real route but may not be in the generated union.
    const includesCycleStep = biologicalSex === 'FEMALE' || (currentRoute as string) === 'cycle-basics';
    const routeOrder = includesCycleStep
        ? [
            'metrics-goals',
            'cycle-basics',
            'shift-type',
            'sleep-schedule',
            'dietary-needs',
            'profile-summary',
        ]
        : [
            'metrics-goals',
            'shift-type',
            'sleep-schedule',
            'dietary-needs',
            'profile-summary',
        ];
    // profile-summary hides its own header, so the visible step count excludes it.
    const totalSteps = routeOrder.length - 1;
    const stepIndex = routeOrder.indexOf(currentRoute ?? '');
    const stepNumber = stepIndex >= 0 ? stepIndex + 1 : 1;
    const progress = Math.min(stepNumber / totalSteps, 1);

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
                    <Text style={[typography.overline, { color: colors.text.secondary }]}>
                        STEP {Math.min(stepNumber, totalSteps)} OF {totalSteps}
                    </Text>
                    <Text style={[typography.overline, { color: colors.accent.cyan }]}>
                        {Math.round(progress * 100)}%
                    </Text>
                </View>
                <ProgressBar progress={progress * 100} color={colors.accent.cyan} trackColor={colors.border.default} height={4} />
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
