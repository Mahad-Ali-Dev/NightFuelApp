import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { GROUP_LABELS, type MuscleGroup } from '@/components/exercise/MuscleBodyMap';

const { width } = Dimensions.get('window');
const CARD_W = (width - 44) / 2;

// Gender-aware muscle render art (full-body figure, lime-highlighted muscle).
const MUSCLE_IMG: Record<'Male' | 'Female', Record<MuscleGroup, number>> = {
  Male: {
    chest: require('../../assets/images/muscle-chest-male.png'),
    back: require('../../assets/images/muscle-back-male.png'),
    biceps: require('../../assets/images/muscle-biceps-male.png'),
    triceps: require('../../assets/images/muscle-triceps-male.png'),
    upperarms: require('../../assets/images/muscle-arms-male.png'),
    forearms: require('../../assets/images/muscle-forearms-male.png'),
    shoulders: require('../../assets/images/muscle-shoulders-male.png'),
    quadriceps: require('../../assets/images/muscle-legs-male.png'),
    hamstrings: require('../../assets/images/muscle-legs-male.png'),
    hips: require('../../assets/images/muscle-hips-male.png'),
    calves: require('../../assets/images/muscle-calves-male.png'),
    waist: require('../../assets/images/muscle-waist-male.png'),
    neck: require('../../assets/images/muscle-neck-male.png'),
  },
  Female: {
    chest: require('../../assets/images/muscle-chest-female.png'),
    back: require('../../assets/images/muscle-back-female.png'),
    biceps: require('../../assets/images/muscle-biceps-female.png'),
    triceps: require('../../assets/images/muscle-triceps-female.png'),
    upperarms: require('../../assets/images/muscle-arms-female.png'),
    forearms: require('../../assets/images/muscle-forearms-female.png'),
    shoulders: require('../../assets/images/muscle-shoulders-female.png'),
    quadriceps: require('../../assets/images/muscle-legs-female.png'),
    hamstrings: require('../../assets/images/muscle-legs-female.png'),
    hips: require('../../assets/images/muscle-hips-female.png'),
    calves: require('../../assets/images/muscle-calves-female.png'),
    waist: require('../../assets/images/muscle-waist-female.png'),
    neck: require('../../assets/images/muscle-neck-female.png'),
  },
};

// Catalog snapshot counts (approximate; results screen shows the live count).
const TILES: { key: MuscleGroup; count: number }[] = [
  { key: 'chest', count: 480 }, { key: 'back', count: 654 }, { key: 'biceps', count: 317 },
  { key: 'triceps', count: 274 }, { key: 'upperarms', count: 528 }, { key: 'forearms', count: 165 },
  { key: 'shoulders', count: 467 }, { key: 'quadriceps', count: 324 }, { key: 'hamstrings', count: 82 },
  { key: 'hips', count: 836 }, { key: 'calves', count: 169 }, { key: 'waist', count: 776 }, { key: 'neck', count: 69 },
];

/** Step 3 of the guided flow: pick a target muscle from an image grid. */
export default function TargetMuscleScreen() {
  const { colors, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ gender?: string; level?: string }>();
  const gender: 'Male' | 'Female' = params.gender === 'Female' ? 'Female' : 'Male';
  const level = typeof params.level === 'string' ? params.level : undefined;

  const pick = (muscle: MuscleGroup) =>
    router.push({ pathname: '/(exercises)/results', params: { gender, muscle, ...(level ? { level } : {}) } } as any);

  const chips = [gender, level].filter(Boolean) as string[];

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
          {chips.map((c, i) => (
            <View key={c} style={[styles.ctx, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
              {i === 0 ? <Ionicons name={gender === 'Male' ? 'male' : 'female'} size={13} color={colors.accent.lime} /> : null}
              <Text style={[typography.caption, { color: colors.text.primary, fontWeight: '600' }]}>{c}</Text>
            </View>
          ))}
        </View>
        <Text style={[typography.h1, { color: colors.text.primary, marginTop: 14 }]}>Target a muscle</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingTop: 8, paddingBottom: insets.bottom + 28 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.grid}>
          {TILES.map((t, i) => (
            <Animated.View key={t.key} entering={FadeInDown.delay(Math.min(i, 9) * 35).duration(360)}>
              <TouchableOpacity
                style={[styles.tile, { borderColor: colors.border.default }]}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={`${GROUP_LABELS[t.key]} exercises`}
                onPress={() => pick(t.key)}
              >
                <Image
                  source={MUSCLE_IMG[gender][t.key]}
                  style={styles.tileImg}
                  contentFit="contain"
                  contentPosition="right"
                  cachePolicy="memory-disk"
                />
                <LinearGradient
                  colors={['#13161D', 'rgba(19,22,29,0.55)', 'transparent']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={StyleSheet.absoluteFillObject}
                />
                <View style={styles.tileText}>
                  <Text style={[typography.subhead, { color: '#FFF', fontWeight: '700', fontSize: 15 }]}>{GROUP_LABELS[t.key]}</Text>
                  <Text style={[typography.caption, { color: colors.accent.lime, fontSize: 11, fontWeight: '600', marginTop: 2 }]}>
                    {t.count} exercises
                  </Text>
                </View>
              </TouchableOpacity>
            </Animated.View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 6 },
  navRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  backBtn: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  ctx: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 11, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: {
    width: CARD_W, height: 120, borderRadius: 16, borderCurve: 'continuous',
    overflow: 'hidden', borderWidth: 1, backgroundColor: '#14171D', justifyContent: 'flex-end',
  },
  tileImg: { position: 'absolute', right: -10, top: 0, bottom: 0, width: '70%' },
  tileText: { padding: 12 },
});
