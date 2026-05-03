import { Stack, useRouter, useSegments } from 'expo-router';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useTheme } from '@/theme';
import { Ionicons } from '@expo/vector-icons';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function OnboardingLayout() {
    const { colors, typography } = useTheme();
    const router = useRouter();
    const segments = useSegments();
    const insets = useSafeAreaInsets();

    // Determine current step based on route
    const currentRoute = segments[segments.length - 1];
    const routeOrder = [
        'metrics-goals',
        'shift-type',
        'sleep-schedule',
        'dietary-needs',
        'profile-summary'
    ];
    const stepIndex = routeOrder.indexOf(currentRoute ?? '');
    const stepNumber = stepIndex >= 0 ? stepIndex + 1 : 1;
    const progress = Math.min(stepNumber / 4, 1);

    // Custom header matching the design
    const CustomHeader = () => (
        <View style={[styles.headerContainer, { backgroundColor: colors.background.primary, paddingTop: Math.max(insets.top, Platform.OS === 'ios' ? 50 : 20) }]}>
            <View style={styles.headerTop}>
                <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
                </TouchableOpacity>
                <Text style={[typography.subhead, { color: colors.text.primary }]}>
                    {getStepTitle(currentRoute as string)}
                </Text>
                <View style={{ width: 24 }} />
            </View>
            <View style={styles.progressContainer}>
                <View style={styles.progressTextRow}>
                    <Text style={[typography.caption, { color: colors.text.secondary }]}>
                        STEP {Math.min(stepNumber, 4)} OF 4
                    </Text>
                    <Text style={[typography.caption, { color: colors.accent.cyan, fontWeight: '700' }]}>
                        {Math.round(progress * 100)}%
                    </Text>
                </View>
                <ProgressBar progress={progress} color={colors.accent.cyan} trackColor={colors.border.default} height={4} />
            </View>
        </View>
    );

    return (
        <Stack screenOptions={{ header: () => <CustomHeader />, contentStyle: { backgroundColor: colors.background.primary } }}>
            <Stack.Screen name="metrics-goals" />
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
    progressContainer: {
        gap: 8,
    },
    progressTextRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    }
});
