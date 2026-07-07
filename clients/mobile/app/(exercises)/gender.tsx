import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';

// Generated dark-studio profile athletes (gender selection art).
const PROFILE_MALE = require('../../assets/images/profile-male.png');
const PROFILE_FEMALE = require('../../assets/images/profile-female.png');

/**
 * Step 1 of the guided Train-browse flow: choose a training profile.
 * Full-page Male / Female selection. The pick flows through the rest of the
 * flow (level → muscle body-map → results) and drives the gendered anatomy
 * and demo clips.
 */
export default function GenderSelectScreen() {
  const { colors, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  // Optional `category` (Gym/Home/Cardio/Recovery) carried from a "Browse by style"
  // / Explore tile — flows through to the results, skipping the muscle step.
  const params = useLocalSearchParams<{ category?: string }>();
  const category = typeof params.category === 'string' ? params.category : undefined;

  const pick = (gender: 'Male' | 'Female') =>
    router.push({ pathname: '/(exercises)/level', params: { gender, ...(category ? { category } : {}) } } as any);

  return (
    <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
      <StatusBar style="light" />
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={[styles.backBtn, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}
        >
          <Ionicons name="arrow-back" size={20} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={[typography.h1, { color: colors.text.primary, marginTop: 14 }]}>Who are you{'\n'}training?</Text>
        <Text style={[typography.body, { color: colors.text.secondary, marginTop: 6 }]}>
          Pick a profile — your demos and anatomy adapt to it.
        </Text>
      </View>

      <View style={styles.cards}>
        {(['Male', 'Female'] as const).map((g, i) => (
          <Animated.View key={g} entering={FadeInDown.delay(80 + i * 80).duration(440)} style={{ flex: 1 }}>
            <TouchableOpacity
              style={[styles.card, { borderColor: colors.border.default }]}
              activeOpacity={0.9}
              accessibilityRole="button"
              accessibilityLabel={`Train as ${g}`}
              onPress={() => pick(g)}
            >
              <Image
                source={g === 'Male' ? PROFILE_MALE : PROFILE_FEMALE}
                style={StyleSheet.absoluteFillObject}
                contentFit="cover"
                contentPosition="top"
                cachePolicy="memory-disk"
              />
              <LinearGradient colors={['transparent', 'rgba(10,12,18,0.92)']} style={StyleSheet.absoluteFillObject} />
              <View style={styles.cardLabel}>
                <Text style={[typography.h2, { color: '#FFF', fontWeight: '700' }]}>{g}</Text>
                <View style={[styles.cardIcon, { backgroundColor: colors.accent.lime }]}>
                  <Ionicons name={g === 'Male' ? 'male' : 'female'} size={18} color={colors.text.inverse} />
                </View>
              </View>
            </TouchableOpacity>
          </Animated.View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 4 },
  backBtn: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  cards: { flex: 1, flexDirection: 'column', gap: 14, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 28 },
  card: { flex: 1, borderRadius: 22, borderCurve: 'continuous', overflow: 'hidden', borderWidth: 1.5, justifyContent: 'flex-end' },
  cardLabel: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 18 },
  cardIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
