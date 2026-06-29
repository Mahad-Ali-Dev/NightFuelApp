import { Stack } from 'expo-router';
import { useTheme } from '@/theme';
import { useCoachReminders } from '@/features/coach/useCoachReminders';

export default function ChallengeLayout() {
    const { colors } = useTheme();
    useCoachReminders();
    return (
        <Stack
            screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.background.primary },
                animation: 'slide_from_right',
            }}
        />
    );
}
