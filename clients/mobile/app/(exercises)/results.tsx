import React, { useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Dimensions, RefreshControl, Platform } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import Animated, { FadeIn } from 'react-native-reanimated';
import { searchLibrary } from '@/api/exercises';
import { posterFromVideoUrl } from '@/constants/exerciseDemos';
import { Skeleton, EmptyState, GlassCard } from '@/components/ui';
import { ExerciseGridCard } from '@/components/exercise/ExerciseGridCard';
import { GROUP_FILTER, GROUP_LABELS, type MuscleGroup } from '@/components/exercise/MuscleBodyMap';

const { width } = Dimensions.get('window');
const CARD_W = (width - 44) / 2;

const CAT_GYM_IMG = require('../../assets/images/cat-gym.png');
const CAT_HOME_IMG = require('../../assets/images/cat-home.png');
const CAT_CARDIO_IMG = require('../../assets/images/cat-cardio.png');
const CAT_RECOVERY_IMG = require('../../assets/images/cat-recovery.png');
const CATEGORY_FALLBACK: Record<string, number> = {
  gym: CAT_GYM_IMG, home: CAT_HOME_IMG, cardio: CAT_CARDIO_IMG, kegel: CAT_RECOVERY_IMG,
};
const CATEGORY_LABELS: Record<string, string> = { gym: 'Gym', home: 'Home', cardio: 'Cardio', kegel: 'Recovery' };

/** Step 4 of the guided flow: the exercises for the chosen muscle + level. The
 *  muscle maps to either a `bodyPart` or finer `muscleGroup` filter (see
 *  GROUP_FILTER). Gender is carried into the detail page for gendered demos. */
export default function ResultsScreen() {
  const { colors, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{
    gender?: string; muscle?: string; category?: string; level?: string;
    // Additive params so a "Body Focus" program card (src/features/train) can land
    // on this same list with its own ready-made searchLibrary filter. Existing
    // muscle/category callers (target.tsx, level.tsx) never pass these, so they're
    // unaffected. `title` overrides the header label when provided.
    bodyPart?: string; muscleGroup?: string; equipment?: string; query?: string; title?: string;
  }>();
  const gender: 'Male' | 'Female' = params.gender === 'Female' ? 'Female' : 'Male';
  const level = typeof params.level === 'string' ? params.level : null;
  const category = typeof params.category === 'string' ? params.category : null;
  // A program card passes an explicit filter (bodyPart/muscleGroup/equipment/query)
  // — take that verbatim; otherwise fall back to the guided muscle/category flow.
  const explicitFilter: { bodyPart?: string; muscleGroup?: string; equipment?: string; query?: string } = {};
  if (typeof params.bodyPart === 'string') explicitFilter.bodyPart = params.bodyPart;
  if (typeof params.muscleGroup === 'string') explicitFilter.muscleGroup = params.muscleGroup;
  if (typeof params.equipment === 'string') explicitFilter.equipment = params.equipment;
  if (typeof params.query === 'string') explicitFilter.query = params.query;
  const hasExplicit = Object.keys(explicitFilter).length > 0;
  const muscle = !category && !hasExplicit ? ((params.muscle as MuscleGroup) || 'chest') : null;
  // Program filter → use it; category browse → filter by category; muscle browse →
  // bodyPart/muscleGroup.
  const filter = hasExplicit
    ? explicitFilter
    : category
      ? { category }
      : (GROUP_FILTER[muscle as MuscleGroup] ?? { bodyPart: 'chest' });
  const title = typeof params.title === 'string' && params.title
    ? params.title
    : category
      ? (CATEGORY_LABELS[category] ?? category)
      : GROUP_LABELS[muscle as MuscleGroup];

  // Gender is filtered here (the user explicitly picked it in the flow): the
  // backend matches the chosen gender + unisex rows, so Female no longer sees
  // Male-only-demo exercises.
  const q = useQuery({
    // Serialize the resolved filter into the key so two Body-Focus programs with
    // different filters (e.g. glute vs waist) never collide on the same cache slot.
    queryKey: ['exercise-results', category, muscle, JSON.stringify(filter), gender, level],
    queryFn: () => searchLibrary({ ...filter, gender, difficulty: level, limit: 1000 }),
    staleTime: 5 * 60 * 1000,
  });
  // Arrange the list: real-image cards first (placeholders sink), then alphabetical
  // — a stable, sensible order (the API returns rows in catalog/DB order).
  const exercises = useMemo(() => {
    const list = q.data ?? [];
    return [...list].sort((a, b) => {
      const ai = a.imageUrl ? 0 : 1, bi = b.imageUrl ? 0 : 1;
      if (ai !== bi) return ai - bi;
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
  }, [q.data]);

  const keyExtractor = useCallback((item: any) => item.id || item.name, []);
  const renderItem = useCallback(({ item, index }: any) => {
    const fallbackImg = CATEGORY_FALLBACK[item.category ?? 'gym'] ?? CATEGORY_FALLBACK.gym;
    const poster = posterFromVideoUrl(item.videoUrl);
    const posterSrc = poster ? { uri: poster } : null;
    const imgSrc = item.imageUrl ? { uri: item.imageUrl } : (posterSrc ?? fallbackImg);
    const imgFallbackSrc = posterSrc ?? fallbackImg;
    const hasDemo = !!(item.demoGifUrl || item.demoUrl || item.videoUrl);
    return (
      <ExerciseGridCard
        item={item}
        imageSource={imgSrc}
        fallbackSource={imgFallbackSrc}
        hasDemo={hasDemo}
        style={styles.cardTouch}
        delay={Math.min(index, 9) * 45}
        onPress={() => router.push({ pathname: '/(exercises)/[id]', params: { id: item.id, gender } } as any)}
      />
    );
  }, [router, gender]);

  const chips = [title, gender, level].filter(Boolean) as string[];

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
          {chips.map((c) => (
            <View key={c} style={[styles.ctx, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
              <Text style={[typography.caption, { color: colors.text.primary, fontWeight: '600' }]}>{c}</Text>
            </View>
          ))}
        </View>
        <Text style={[typography.h1, { color: colors.text.primary, marginTop: 14 }]}>{title}</Text>
        <Text style={[typography.body, { color: colors.text.secondary, marginTop: 2 }]}>
          {q.isLoading ? 'Loading…' : `${exercises.length} exercise${exercises.length === 1 ? '' : 's'}`}
        </Text>
      </View>

      {q.isLoading ? (
        <View style={styles.skelGrid}>
          {Array.from({ length: 6 }).map((_, i) => (
            <GlassCard key={i} radius={20} style={styles.cardTouch}>
              <Skeleton width="100%" height={138} radius={0} />
              <View style={{ padding: 11 }}>
                <Skeleton width="85%" height={14} radius={4} />
                <Skeleton width="55%" height={11} radius={4} style={{ marginTop: 8 }} />
              </View>
            </GlassCard>
          ))}
        </View>
      ) : exercises.length === 0 ? (
        <EmptyState
          icon="fitness-outline"
          title="No exercises found"
          subtitle="No exercises matched this muscle and level. Try a different level or muscle."
          actionLabel="Back"
          onAction={() => router.back()}
          style={{ flex: 1 }}
        />
      ) : (
        <Animated.View entering={FadeIn.duration(300)} style={{ flex: 1 }}>
          <FlatList
            data={exercises}
            keyExtractor={keyExtractor}
            numColumns={2}
            contentContainerStyle={{ padding: 16, paddingTop: 8, paddingBottom: insets.bottom + 32 }}
            columnWrapperStyle={{ gap: 12 }}
            ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
            removeClippedSubviews={Platform.OS === 'android'}
            initialNumToRender={8}
            maxToRenderPerBatch={8}
            windowSize={7}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={q.isFetching} onRefresh={() => q.refetch()} tintColor={colors.accent.lime} />}
            renderItem={renderItem}
          />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 14 },
  navRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  backBtn: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  ctx: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 11, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  skelGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, padding: 16 },
  cardTouch: { width: CARD_W, borderRadius: 20, borderCurve: 'continuous' },
});
