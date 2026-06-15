import React from 'react';
import { Stack } from 'expo-router';
import { colors } from '@/theme';

export default function ShiftsLayout() {
    return (
        <Stack
            screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.background.primary },
                animation: 'slide_from_right',
            }}
        >
            <Stack.Screen name="index" />
            <Stack.Screen name="sleep-optimizer" />
        </Stack>
    );
}
