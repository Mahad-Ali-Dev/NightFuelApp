/**
 * Body Focus — a women's workout gallery. Instead of dialing in a muscle group by
 * hand, the user browses 9 curated hero-image programs (Peachy Glutes, Abs Sculpt,
 * Snatched Waist, …) and taps one. Each card hands its ready-made searchLibrary
 * filter to the existing results screen (app/(exercises)/results.tsx), landing on
 * a pre-filtered list of EXISTING catalog exercises — same list, same detail
 * pipeline, just curated by body area. Mirrors the challenge gallery card layout.
 */
import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { withAlpha, isLightHex } from '@/theme/utils';
import { heroCardTint } from '@/theme/heroCard';
import { getMyProfile } from '@/api/profile';
import { WOMENS_PROGRAMS, womensHero, type WomensProgram } from '@/features/train/womensPrograms';

const { width } = Dimensions.get('window');

export default function WomensFocusScreen() {
  const { colors, typography } = useTheme();
  const isLight = isLightHex(colors.background.primary);
  const tint = heroCardTint(isLight);
  const insets = useSafeAreaInsets();
  const router = useRouter();

  // Gender for the demo clips + anatomy on the detail page. Default Female here
  // (this IS the women's section) unless the profile says otherwise. Same shared
  // 'my-profile' cache the rest of the Train flow reads (no extra fetch).
  const { data: profile } = useQuery({ queryKey: ['my-profile'], queryFn: getMyProfile });
  const profileSex = ((profile as any)?.biologicalSex ?? '').toString().toUpperCase();
  const gender: 'Male' | 'Female' = profileSex === 'MALE' ? 'Male' : 'Female';

  // Hand the program's filter to the results screen as params + a display title.
  // Only defined keys are forwarded so we never pass `undefined` through the router.
  const open = (p: WomensProgram) => {
    const f = p.filter;
    router.push({
      pathname: '/(exercises)/results',
      params: {
        gender,
        title: p.title,
        ...(f.category ? { category: f.category } : {}),
        ...(f.bodyPart ? { bodyPart: f.bodyPart } : {}),
        ...(f.muscleGroup ? { muscleGroup: f.muscleGroup } : {}),
        ...(f.equipment ? { equipment: f.equipment } : {}),
        ...(f.query ? { query: f.query } : {}),
      },
    } as any);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
      <StatusBar style="light" />

      {/* Header — back button + title, matching the (exercises) screens. */}
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
        </View>
        <Text style={[typography.h1, { color: colors.text.primary, marginTop: 14 }]}>Body Focus</Text>
        <View style={styles.subtitleRow}>
          <View style={[styles.subtitleAccent, { backgroundColor: colors.accent.coral }]} />
          <Text style={[typography.body, { color: colors.text.secondary }]}>
            Curated workouts by body area
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 18, paddingTop: 8, paddingBottom: insets.bottom + 28 }}
        showsVerticalScrollIndicator={false}
      >
        {WOMENS_PROGRAMS.map((p, i) => (
          <Animated.View key={p.id} entering={FadeInDown.delay(Math.min(i, 9) * 55).duration(420)}>
            <TouchableOpacity
              activeOpacity={0.9}
              accessibilityRole="button"
              accessibilityLabel={`${p.title}, ${p.subtitle}`}
              onPress={() => open(p)}
              style={[styles.card, { borderColor: withAlpha(p.accent, 0.45) }]}
            >
              <Image
                source={womensHero(p, isLight)}
                style={StyleSheet.absoluteFillObject}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={150}
              />
              <LinearGradient
                colors={tint.scrim}
                start={{ x: 0, y: 0 }}
                end={{ x: 0.4, y: 1 }}
                style={StyleSheet.absoluteFillObject}
              />
              {/* Accent rail — a non-color-dependent cue keyed to the program. */}
              <View style={[styles.rail, { backgroundColor: p.accent }]} />
              <View style={styles.cardInner}>
                <View style={[styles.tag, { backgroundColor: withAlpha(p.accent, 0.18), borderColor: withAlpha(p.accent, 0.5) }]}>
                  <Text style={[styles.tagTxt, { color: p.accent }]}>{p.tag}</Text>
                </View>
                <View style={{ flex: 1 }} />
                <Text style={[styles.cardTitle, { color: tint.title }]} numberOfLines={1}>{p.title}</Text>
                <Text style={[styles.cardSub, { color: tint.sub }]} numberOfLines={1}>{p.subtitle}</Text>
                <Text style={[styles.cardBlurb, { color: tint.sub }]} numberOfLines={2}>{p.blurb}</Text>
              </View>
              <View style={[styles.arrow, { backgroundColor: withAlpha(p.accent, 0.18), borderColor: withAlpha(p.accent, 0.5) }]}>
                <Ionicons name="arrow-forward" size={14} color={p.accent} />
              </View>
            </TouchableOpacity>
          </Animated.View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 8 },
  navRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  backBtn: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  subtitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  subtitleAccent: { width: 3, height: 14, borderRadius: 2 },
  card: {
    height: 188,
    borderRadius: 18,
    borderCurve: 'continuous',
    overflow: 'hidden',
    justifyContent: 'flex-end',
    marginTop: 14,
    borderWidth: 1,
  },
  cardInner: { flex: 1, padding: 15, alignItems: 'flex-start' },
  rail: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
  tag: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  tagTxt: { fontSize: 10.5, letterSpacing: 1, fontWeight: '700' },
  cardTitle: { color: '#FFF', fontSize: 22, fontWeight: '700', letterSpacing: -0.4 },
  cardSub: { color: 'rgba(255,255,255,0.72)', fontSize: 12.5, fontWeight: '600', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 },
  cardBlurb: { color: 'rgba(255,255,255,0.86)', fontSize: 13, lineHeight: 18, marginTop: 6 },
  arrow: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
