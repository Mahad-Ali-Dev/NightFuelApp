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

// Gender-aware experience banners (generated dark-studio art).
const BANNERS = {
  Male: {
    Beginner: require('../../assets/images/level-beginner.png'),
    Intermediate: require('../../assets/images/level-intermediate.png'),
    Advanced: require('../../assets/images/level-advanced.png'),
  },
  Female: {
    Beginner: require('../../assets/images/level-beginner-female.png'),
    Intermediate: require('../../assets/images/level-intermediate-female.png'),
    Advanced: require('../../assets/images/level-advanced-female.png'),
  },
} as const;

const LEVELS = [
  { key: 'Beginner', desc: 'New to training · build the basics' },
  { key: 'Intermediate', desc: 'Consistent · ready to push harder' },
  { key: 'Advanced', desc: 'Experienced · high intensity' },
] as const;

/** Step 2 of the guided Train-browse flow: pick an experience level. The banners
 *  are gender-aware so the imagery matches the profile chosen in step 1. */
export default function LevelSelectScreen() {
  const { colors, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ gender?: string; category?: string }>();
  const gender: 'Male' | 'Female' = params.gender === 'Female' ? 'Female' : 'Male';
  const category = typeof params.category === 'string' ? params.category : undefined;

  // Category flow (Browse by style / Explore) skips the muscle step → straight to
  // that category's results. Muscle flow → the muscle-group grid.
  const pick = (level: string) =>
    category
      ? router.push({ pathname: '/(exercises)/results', params: { gender, category, level } } as any)
      : router.push({ pathname: '/(exercises)/target', params: { gender, level } } as any);

  return (
    <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
      <StatusBar style="light" />
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.navRow}>
          <TouchableOpacity
            onPress={() => router.back()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={[styles.backBtn, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}
          >
            <Ionicons name="arrow-back" size={20} color={colors.text.primary} />
          </TouchableOpacity>
          <View style={[styles.ctx, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
            <Ionicons name={gender === 'Male' ? 'male' : 'female'} size={13} color={colors.accent.lime} />
            <Text style={[typography.caption, { color: colors.text.primary, fontWeight: '600' }]}>{gender}</Text>
          </View>
        </View>
        <Text style={[typography.h1, { color: colors.text.primary, marginTop: 18 }]}>Your level</Text>
        <Text style={[typography.body, { color: colors.text.secondary, marginTop: 4 }]}>
          We'll match the difficulty of every exercise.
        </Text>
      </View>

      <View style={styles.list}>
        {LEVELS.map((lvl, i) => (
          <Animated.View key={lvl.key} entering={FadeInDown.delay(70 + i * 70).duration(420)}>
            <TouchableOpacity
              style={[styles.banner, { borderColor: colors.border.default }]}
              activeOpacity={0.9}
              accessibilityRole="button"
              accessibilityLabel={`${lvl.key} level`}
              onPress={() => pick(lvl.key)}
            >
              <Image source={BANNERS[gender][lvl.key]} style={StyleSheet.absoluteFillObject} contentFit="cover" cachePolicy="memory-disk" />
              <LinearGradient
                colors={['rgba(10,12,18,0.95)', 'rgba(10,12,18,0.35)', 'transparent']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={StyleSheet.absoluteFillObject}
              />
              <View style={styles.bannerText}>
                <Text style={[typography.h3, { color: '#FFF', fontWeight: '700' }]}>{lvl.key}</Text>
                <Text style={[typography.caption, { color: '#CFD3DA', marginTop: 3 }]}>{lvl.desc}</Text>
              </View>
              <View style={styles.chev}>
                <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.7)" />
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
  header: { paddingHorizontal: 20, paddingBottom: 8 },
  navRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  ctx: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 11, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  list: { paddingHorizontal: 20, paddingTop: 18, gap: 14 },
  banner: { height: 104, borderRadius: 18, borderCurve: 'continuous', overflow: 'hidden', borderWidth: 1, justifyContent: 'center' },
  bannerText: { paddingHorizontal: 18 },
  chev: { position: 'absolute', right: 14, top: 0, bottom: 0, justifyContent: 'center' },
});
