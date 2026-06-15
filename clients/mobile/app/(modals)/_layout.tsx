import React from 'react';
import { Stack } from 'expo-router';
import { colors } from '@/theme/colors';

export default function ModalsLayout() {
    return (
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background.primary } }}>
            <Stack.Screen name="active-workout" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
            <Stack.Screen name="ai-coach" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
            <Stack.Screen name="build-plate" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
            <Stack.Screen name="premium" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
            <Stack.Screen name="barcode-scanner" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
        </Stack>
    );
}
