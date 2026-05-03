import React from 'react';
import { Stack } from 'expo-router';

export default function TrainingLayout() {
    return (
        <Stack
            screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: '#0D1117' },
                animation: 'slide_from_right',
            }}
        >
            <Stack.Screen name="onboarding" />
            <Stack.Screen name="workout" />
            <Stack.Screen name="complete" />
        </Stack>
    );
}
