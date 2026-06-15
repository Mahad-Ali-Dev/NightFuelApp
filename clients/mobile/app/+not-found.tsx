import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Link, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme';

/**
 * Catch-all for unmatched routes. Without this, expo-router renders a bare
 * "Unmatched Route" screen — e.g. when a deep link targets a screen that
 * doesn't exist. This gives a friendly fallback with a way back home.
 */
export default function NotFoundScreen() {
  const { colors, typography } = useTheme();
  return (
    <>
      <Stack.Screen options={{ title: 'Not found', headerShown: false }} />
      <View style={[s.c, { backgroundColor: colors.background.primary }]}>
        <Ionicons name="compass-outline" size={64} color={colors.text.tertiary} />
        <Text style={[typography.heading, { color: colors.text.primary, marginTop: 16, fontSize: 20 }]}>
          This screen doesn&apos;t exist
        </Text>
        <Text style={[typography.body, { color: colors.text.secondary, marginTop: 8, textAlign: 'center', paddingHorizontal: 32 }]}>
          The link may be broken or the page may have moved.
        </Text>
        <Link href="/(tabs)" asChild>
          <TouchableOpacity style={[s.btn, { backgroundColor: colors.accent.coral }]} activeOpacity={0.85}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>Go to Home</Text>
          </TouchableOpacity>
        </Link>
      </View>
    </>
  );
}

const s = StyleSheet.create({
  c: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  btn: { marginTop: 24, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 28 },
});
