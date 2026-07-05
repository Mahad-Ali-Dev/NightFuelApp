/**
 * 30-Day Challenges — a gallery of Leap-style, gender-specific day-by-day plans
 * built over the EXISTING exercise library. Mirrors Body Focus (women.tsx): a
 * scroll of hero-image cards, each opening its 30-day calendar (challenge-30/[id]).
 *
 * The shown set defaults to the user's gender (profile biologicalSex) but a
 * Male/Female toggle keeps all 8 reachable. Progress (from the persisted
 * thirtyDayStore) is surfaced right on each card so a started challenge reads as
 * "in progress · N% · X/26 days".
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
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
import { THIRTY_DAY_CHALLENGES, thirtyDayHero, type ThirtyDayChallenge } from '@/features/train/thirtyDayChallenges';
import {
  useThirtyDayStore,
  getProgress,
  challengeProgress,
  WORKOUT_DAY_COUNT,
} from '@/features/train/thirtyDayStore';

export default function ThirtyDayGalleryScreen() {
  const { colors, typography } = useTheme();
  const isLight = isLightHex(colors.background.primary);
  const tint = heroCardTint(isLight);
  const insets = useSafeAreaInsets();
  const router = useRouter();

  // Default the shown set to the profile's gender (shared 'my-profile' cache —
  // no extra fetch), but let the user flip to see all of them.
  const { data: profile } = useQuery({ queryKey: ['my-profile'], queryFn: getMyProfile });
  const profileSex = ((profile as any)?.biologicalSex ?? '').toString().toUpperCase();
  const profileGender: 'Male' | 'Female' = profileSex === 'MALE' ? 'Male' : 'Female';
  const [gender, setGender] = useState<'Male' | 'Female'>(profileGender);

  // Persisted per-challenge progress (drives the on-card status pill).
  const progressMap = useThirtyDayStore((s) => s.progress);

  const shown = THIRTY_DAY_CHALLENGES.filter((c) => c.gender === gender);

  const open = (c: ThirtyDayChallenge) => {
    router.push({ pathname: '/(exercises)/challenge-30/[id]', params: { id: c.id } } as any);
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
        <Text style={[typography.h1, { color: colors.text.primary, marginTop: 14 }]}>30-Day Challenges</Text>
        <View style={styles.subtitleRow}>
          <View style={[styles.subtitleAccent, { backgroundColor: colors.accent.lime }]} />
          <Text style={[typography.body, { color: colors.text.secondary }]}>
            Pick a focus. One day at a time.
          </Text>
        </View>

        {/* Male / Female segmented toggle — defaults to the profile gender but
            keeps every challenge reachable. */}
        <View style={[styles.segment, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
          {(['Female', 'Male'] as const).map((g) => {
            const active = gender === g;
            return (
              <TouchableOpacity
                key={g}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${g} challenges`}
                onPress={() => setGender(g)}
                style={[styles.segmentBtn, active && { backgroundColor: colors.accent.lime }]}
              >
                <Ionicons
                  name={g === 'Male' ? 'male' : 'female'}
                  size={14}
                  color={active ? colors.text.inverse : colors.text.secondary}
                />
                <Text
                  style={[
                    typography.caption,
                    { fontWeight: '800', fontSize: 13, color: active ? colors.text.inverse : colors.text.secondary },
                  ]}
                >
                  {g}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 18, paddingTop: 8, paddingBottom: insets.bottom + 28 }}
        showsVerticalScrollIndicator={false}
      >
        {shown.map((c, i) => {
          const prog = getProgress({ progress: progressMap }, c.id);
          const started = !!prog.startedAt;
          const pct = challengeProgress(prog);
          const doneCount = (prog.completed ?? []).length;
          return (
            <Animated.View key={c.id} entering={FadeInDown.delay(Math.min(i, 9) * 55).duration(420)}>
              <TouchableOpacity
                activeOpacity={0.9}
                accessibilityRole="button"
                accessibilityLabel={`${c.title}, ${c.area}${started ? `, ${pct}% complete` : ''}`}
                onPress={() => open(c)}
                style={[styles.card, { borderColor: withAlpha(c.accent, 0.45) }]}
              >
                <Image
                  source={thirtyDayHero(c, isLight)}
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
                {/* Accent rail — a non-color-dependent cue keyed to the challenge. */}
                <View style={[styles.rail, { backgroundColor: c.accent }]} />
                <View style={styles.cardInner}>
                  <View style={[styles.tag, { backgroundColor: withAlpha(c.accent, 0.18), borderColor: withAlpha(c.accent, 0.5) }]}>
                    <Text style={[styles.tagTxt, { color: c.accent }]}>{c.tag}</Text>
                  </View>
                  <View style={{ flex: 1 }} />
                  <Text style={[styles.cardTitle, { color: tint.title }]} numberOfLines={1}>{c.title}</Text>
                  <Text style={[styles.cardSub, { color: tint.sub }]} numberOfLines={2}>{c.blurb}</Text>

                  {/* Progress rail — only once started. */}
                  {started && (
                    <View style={styles.progWrap}>
                      <View style={[styles.progTrack, isLight && { backgroundColor: 'rgba(20,23,30,0.14)' }]}>
                        <View style={[styles.progFill, { width: `${pct}%`, backgroundColor: c.accent }]} />
                      </View>
                      <Text style={[styles.progTxt, { color: tint.sub }]}>{pct}% · {doneCount}/{WORKOUT_DAY_COUNT} days</Text>
                    </View>
                  )}
                </View>

                {/* Corner badge: "IN PROGRESS" once started, else the forward arrow. */}
                {started ? (
                  <View style={[styles.badge, { backgroundColor: withAlpha(c.accent, 0.2), borderColor: withAlpha(c.accent, 0.55) }]}>
                    <Text style={[styles.badgeTxt, { color: c.accent }]}>IN PROGRESS</Text>
                  </View>
                ) : (
                  <View style={[styles.arrow, { backgroundColor: withAlpha(c.accent, 0.18), borderColor: withAlpha(c.accent, 0.5) }]}>
                    <Ionicons name="arrow-forward" size={14} color={c.accent} />
                  </View>
                )}
              </TouchableOpacity>
            </Animated.View>
          );
        })}
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
  segment: { flexDirection: 'row', marginTop: 14, padding: 4, borderRadius: 14, borderWidth: 1, gap: 4 },
  segmentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 10,
  },
  card: {
    height: 196,
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
  cardTitle: { color: '#FFF', fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  cardSub: { color: 'rgba(255,255,255,0.86)', fontSize: 13, lineHeight: 18, marginTop: 4 },
  progWrap: { alignSelf: 'stretch', marginTop: 12 },
  progTrack: { height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.22)', overflow: 'hidden' },
  progFill: { height: '100%', borderRadius: 3 },
  progTxt: { color: 'rgba(255,255,255,0.9)', fontSize: 11.5, fontWeight: '700', marginTop: 6 },
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
  badge: {
    position: 'absolute',
    top: 14,
    right: 14,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  badgeTxt: { fontSize: 9.5, letterSpacing: 0.8, fontWeight: '800' },
});
