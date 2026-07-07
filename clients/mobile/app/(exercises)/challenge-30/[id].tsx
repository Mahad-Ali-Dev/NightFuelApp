/**
 * 30-Day Challenge detail — a gated day-by-day calendar for one challenge.
 *
 * The plan is rebuilt deterministically (buildThirtyDayPlan) from ONE
 * searchLibrary(challenge.filter) fetch of the area's catalog exercises, so
 * there's no per-day API fan-out and the same challenge always yields the same
 * 30 days. Progress lives in the persisted thirtyDayStore; gating is derived
 * from it (a day unlocks once every earlier non-rest day is done — rest days
 * auto-count).
 *
 * Two views in one screen:
 *  • Calendar — a 30-tile grid (done ✓ / active / locked / rest) + a progress
 *    bar. Mirrors the coach challenge list's gated-tile visual (REFERENCE ONLY).
 *  • Day sheet — tap an unlocked/done day → a slide-up panel with that day's
 *    exercises (tap through to the existing detail/demo route) + "Mark day done".
 */
import React, { useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions, Modal, Pressable,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { withAlpha } from '@/theme/utils';
import { searchLibrary } from '@/api/exercises';
import { posterFromVideoUrl } from '@/constants/exerciseDemos';
import { EmptyState } from '@/components/ui';
import {
  getChallengeById,
  buildThirtyDayPlan,
  type PlannedDay,
  type PlannedExercise,
} from '@/features/train/thirtyDayChallenges';
import {
  useThirtyDayStore,
  getProgress,
  isDayComplete,
  isDayUnlocked,
  activeDay,
  challengeProgress,
  WORKOUT_DAY_COUNT,
} from '@/features/train/thirtyDayStore';

const { width } = Dimensions.get('window');
// 5 tiles per row with 18px page padding + 10px gaps.
const TILE = Math.floor((width - 36 - 10 * 4) / 5);

// Bundled fallback art for day-exercise rows without a library image.
const FALLBACK_IMG = require('../../../assets/images/cat-gym.png');

export default function ThirtyDayDetailScreen() {
  const { colors, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();

  const challenge = getChallengeById(typeof id === 'string' ? id : undefined);

  // One fetch of the area's catalog rows → fed to the deterministic plan builder.
  const q = useQuery({
    queryKey: ['c30-library', challenge?.id, JSON.stringify(challenge?.filter ?? {})],
    queryFn: () => searchLibrary({ ...(challenge?.filter ?? {}), limit: 1000 }),
    enabled: !!challenge,
    staleTime: 5 * 60 * 1000,
  });

  const plan: PlannedDay[] = useMemo(
    () => (challenge ? buildThirtyDayPlan(challenge, q.data ?? []) : []),
    [challenge, q.data],
  );

  // Persisted progress + actions.
  const progressMap = useThirtyDayStore((s) => s.progress);
  const start = useThirtyDayStore((s) => s.start);
  const completeDay = useThirtyDayStore((s) => s.completeDay);
  const prog = getProgress({ progress: progressMap }, challenge?.id ?? '');
  const pct = challengeProgress(prog);
  const activeD = activeDay(prog);

  // Which day's sheet is open (null = calendar only).
  const [openDay, setOpenDay] = useState<number | null>(null);
  const openPlanDay = openDay != null ? plan.find((d) => d.day === openDay) ?? null : null;

  const genderParam = challenge?.gender ?? 'Male';

  if (!challenge) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
        <StatusBar style="light" />
        <View style={{ flex: 1, paddingTop: insets.top }}>
          <EmptyState
            icon="fitness-outline"
            title="Challenge not found"
            subtitle="This challenge is no longer available."
            actionLabel="Back"
            onAction={() => router.back()}
            style={{ flex: 1 }}
          />
        </View>
      </View>
    );
  }

  const openTile = (d: PlannedDay) => {
    const unlocked = isDayUnlocked(prog, d.day);
    if (!unlocked) return;
    // First interaction with the challenge stamps startedAt.
    if (!prog.startedAt) start(challenge.id);
    setOpenDay(d.day);
  };

  const onMarkDone = () => {
    if (openPlanDay == null) return;
    completeDay(challenge.id, openPlanDay.day);
    setOpenDay(null);
  };

  const doneCount = (prog.completed ?? []).length;

  return (
    <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
      <StatusBar style="light" />

      {/* Hero header */}
      <View style={styles.hero}>
        <Image source={challenge.hero} style={StyleSheet.absoluteFillObject} contentFit="cover" cachePolicy="memory-disk" />
        <LinearGradient
          colors={['rgba(10,12,18,0.35)', 'rgba(10,12,18,0.55)', 'rgba(10,12,18,0.98)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={[styles.heroNav, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity
            onPress={() => router.back()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={[styles.backBtn, { backgroundColor: 'rgba(0,0,0,0.35)', borderColor: withAlpha(challenge.accent, 0.5) }]}
          >
            <Ionicons name="arrow-back" size={20} color="#FFF" />
          </TouchableOpacity>
        </View>
        <View style={styles.heroBody}>
          <View style={[styles.tag, { backgroundColor: withAlpha(challenge.accent, 0.2), borderColor: withAlpha(challenge.accent, 0.55) }]}>
            <Text style={[styles.tagTxt, { color: challenge.accent }]}>{challenge.tag} · {challenge.gender.toUpperCase()}</Text>
          </View>
          <Text style={styles.heroTitle}>{challenge.title}</Text>
          <Text style={styles.heroBlurb} numberOfLines={2}>{challenge.blurb}</Text>
        </View>
      </View>

      {/* Progress bar */}
      <View style={styles.progRow}>
        <View style={[styles.progTrack, { backgroundColor: colors.background.secondary }]}>
          <View style={[styles.progFill, { width: `${pct}%`, backgroundColor: challenge.accent }]} />
        </View>
        <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 6 }]}>
          {pct}% complete · {doneCount}/{WORKOUT_DAY_COUNT} workout days
          {activeD != null ? ` · Day ${activeD} up next` : ' · Challenge complete'}
        </Text>
      </View>

      {/* Calendar grid */}
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 6, paddingBottom: insets.bottom + 28 }}
        showsVerticalScrollIndicator={false}
      >
        {q.isLoading ? (
          <Text style={[typography.body, { color: colors.text.tertiary, textAlign: 'center', marginTop: 30 }]}>
            Loading your plan…
          </Text>
        ) : (
          <Animated.View entering={FadeIn.duration(300)} style={styles.grid}>
            {plan.map((d) => {
              const done = isDayComplete(prog, d.day);
              const unlocked = isDayUnlocked(prog, d.day);
              const isActive = d.day === activeD;
              const locked = !unlocked && !done;
              return (
                <TouchableOpacity
                  key={d.day}
                  disabled={locked}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: locked }}
                  accessibilityLabel={`Day ${d.day}${d.rest ? ', recovery' : ''}, ${done ? 'done' : locked ? 'locked' : 'available'}`}
                  onPress={() => openTile(d)}
                  style={[
                    styles.tile,
                    { backgroundColor: colors.background.secondary, borderColor: colors.border.default },
                    d.rest && { borderStyle: 'dashed' },
                    isActive && { borderColor: challenge.accent, borderWidth: 1.5 },
                    done && { backgroundColor: withAlpha(challenge.accent, 0.16), borderColor: withAlpha(challenge.accent, 0.6) },
                    locked && styles.tileLocked,
                  ]}
                >
                  {done ? (
                    <Ionicons name="checkmark-circle" size={20} color={challenge.accent} />
                  ) : d.rest ? (
                    <Ionicons name="bed-outline" size={18} color={colors.text.tertiary} />
                  ) : locked ? (
                    <Ionicons name="lock-closed" size={14} color={colors.text.tertiary} />
                  ) : (
                    <Text style={[styles.tileDay, { color: isActive ? challenge.accent : colors.text.primary }]}>
                      {d.day}
                    </Text>
                  )}
                  <Text style={[styles.tileLabel, { color: colors.text.tertiary }]}>
                    {d.rest ? 'REST' : `D${d.day}`}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </Animated.View>
        )}
      </ScrollView>

      {/* Day sheet — the tapped day's workout. */}
      <Modal visible={openDay != null} transparent animationType="slide" onRequestClose={() => setOpenDay(null)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setOpenDay(null)}>
          <Pressable
            style={[styles.sheet, { backgroundColor: colors.background.primary, borderColor: colors.border.default, paddingBottom: insets.bottom + 16 }]}
            onPress={(e) => e.stopPropagation()}
          >
            {openPlanDay && (
              <>
                <View style={styles.sheetHandle} />
                <View style={styles.sheetHead}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.sheetOver, { color: challenge.accent }]}>
                      {openPlanDay.rest ? 'RECOVERY' : `DAY ${openPlanDay.day} · ${challenge.area.toUpperCase()}`}
                    </Text>
                    <Text style={[typography.h2, { color: colors.text.primary, marginTop: 2 }]}>
                      {openPlanDay.rest ? 'Rest & recover' : openPlanDay.title}
                    </Text>
                    {!openPlanDay.rest && (
                      <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 2 }]}>
                        Target {openPlanDay.target} · {openPlanDay.exercises.length} exercises
                      </Text>
                    )}
                  </View>
                  <TouchableOpacity
                    onPress={() => setOpenDay(null)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    accessibilityRole="button"
                    accessibilityLabel="Close"
                    style={[styles.sheetClose, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}
                  >
                    <Ionicons name="close" size={18} color={colors.text.primary} />
                  </TouchableOpacity>
                </View>

                <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
                  {openPlanDay.rest ? (
                    <View style={styles.restCard}>
                      <Ionicons name="bed-outline" size={30} color={challenge.accent} />
                      <Text style={[typography.body, { color: colors.text.secondary, textAlign: 'center', marginTop: 10, lineHeight: 21 }]}>
                        A scheduled recovery day. Stretch, hydrate and let the work land — then mark it done to unlock the next day.
                      </Text>
                    </View>
                  ) : openPlanDay.exercises.length === 0 ? (
                    <Text style={[typography.body, { color: colors.text.tertiary, textAlign: 'center', marginTop: 20 }]}>
                      No exercises available for this area right now.
                    </Text>
                  ) : (
                    openPlanDay.exercises.map((ex: PlannedExercise, i) => {
                      const poster = posterFromVideoUrl(ex.videoUrl);
                      const src = ex.imageUrl ? { uri: ex.imageUrl } : poster ? { uri: poster } : FALLBACK_IMG;
                      return (
                        <Animated.View key={ex.id} entering={FadeInUp.delay(Math.min(i, 6) * 40).duration(320)}>
                          <TouchableOpacity
                            activeOpacity={0.85}
                            accessibilityRole="button"
                            accessibilityLabel={`${ex.name}, ${ex.sets} sets of ${ex.reps} reps`}
                            onPress={() =>
                              router.push({ pathname: '/(exercises)/[id]', params: { id: ex.id, gender: genderParam } } as any)
                            }
                            style={[styles.exRow, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}
                          >
                            <Image source={src} style={styles.exThumb} contentFit="cover" cachePolicy="memory-disk" transition={120} />
                            <View style={{ flex: 1 }}>
                              <Text style={[typography.body, { color: colors.text.primary, fontWeight: '700' }]} numberOfLines={1}>
                                {ex.name}
                              </Text>
                              <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 2 }]}>
                                {ex.sets} sets × {ex.reps} reps
                              </Text>
                            </View>
                            <Ionicons name="chevron-forward" size={18} color={colors.text.tertiary} />
                          </TouchableOpacity>
                        </Animated.View>
                      );
                    })
                  )}
                </ScrollView>

                {/* Mark day done — or a "completed" affirmation if already done. */}
                {isDayComplete(prog, openPlanDay.day) ? (
                  <View style={[styles.doneBar, { borderColor: withAlpha(challenge.accent, 0.5), backgroundColor: withAlpha(challenge.accent, 0.12) }]}>
                    <Ionicons name="checkmark-circle" size={18} color={challenge.accent} />
                    <Text style={[typography.body, { color: challenge.accent, fontWeight: '700' }]}>Day complete</Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    activeOpacity={0.9}
                    accessibilityRole="button"
                    accessibilityLabel="Mark day done"
                    onPress={onMarkDone}
                    style={[styles.cta, { backgroundColor: challenge.accent }]}
                  >
                    <Ionicons name="checkmark" size={18} color={colors.text.inverse} />
                    <Text style={[styles.ctaTxt, { color: colors.text.inverse }]}>
                      {openPlanDay.rest ? 'Mark recovery done' : 'Mark day done'}
                    </Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  hero: { height: 248, justifyContent: 'flex-end' },
  heroNav: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 18 },
  backBtn: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  heroBody: { padding: 18, paddingBottom: 14 },
  tag: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  tagTxt: { fontSize: 10.5, letterSpacing: 1, fontWeight: '800' },
  heroTitle: { color: '#FFF', fontSize: 30, fontWeight: '800', letterSpacing: -0.6, marginTop: 10 },
  heroBlurb: { color: 'rgba(255,255,255,0.86)', fontSize: 13.5, lineHeight: 19, marginTop: 4 },
  progRow: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 10 },
  progTrack: { height: 7, borderRadius: 4, overflow: 'hidden' },
  progFill: { height: '100%', borderRadius: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  tile: {
    width: TILE,
    height: TILE,
    borderRadius: 14,
    borderCurve: 'continuous',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  tileLocked: { opacity: 0.5 },
  tileDay: { fontSize: 17, fontWeight: '800' },
  tileLabel: { fontSize: 8.5, fontWeight: '700', letterSpacing: 0.5 },
  // Day sheet
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingHorizontal: 18,
    paddingTop: 10,
  },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)', marginBottom: 12 },
  sheetHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 14 },
  sheetOver: { fontSize: 11, letterSpacing: 1, fontWeight: '800' },
  sheetClose: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  restCard: { alignItems: 'center', paddingVertical: 24, paddingHorizontal: 12 },
  exRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
  },
  exThumb: { width: 52, height: 52, borderRadius: 10 },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 16,
    paddingVertical: 15,
    marginTop: 14,
  },
  ctaTxt: { fontSize: 16, fontWeight: '800' },
  doneBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 14,
    marginTop: 14,
  },
});
