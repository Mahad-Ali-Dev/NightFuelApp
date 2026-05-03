import React from 'react';
import { Stack } from 'expo-router';

export default function CoachLayout() {
    return (
        <Stack
            screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: '#0D1117' },
                animation: 'slide_from_right',
            }}
        >
            <Stack.Screen name="dashboard" />
        </Stack>
    );
}
