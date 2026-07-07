import React from 'react';
import { Stack } from 'expo-router';
import { useTheme } from '@/theme';

export default function CommunityLayout() {
    const { colors } = useTheme();
    return (
        <Stack
            screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.background.primary },
                animation: 'slide_from_right',
            }}
        >
            <Stack.Screen name="index" />
            <Stack.Screen name="leaderboard" />
            <Stack.Screen name="challenges" />
        </Stack>
    );
}
