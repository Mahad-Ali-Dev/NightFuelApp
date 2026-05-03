import React from 'react';
import { Stack } from 'expo-router';

export default function CommunityLayout() {
    return (
        <Stack
            screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: '#0D1117' },
                animation: 'slide_from_right',
            }}
        >
            <Stack.Screen name="index" />
            <Stack.Screen name="leaderboard" />
            <Stack.Screen name="challenges" />
        </Stack>
    );
}
