import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '@/theme';
import { GlassCard } from '@/components/ui';
import { withAlpha } from '@/theme/utils';
import { searchFoods, logMeal, type FoodItem } from '@/api/meals';
import { searchLibrary, createRoutine } from '@/api/exercises';
import type { RiaPlan, RiaMeal, RiaWorkout, RiaMealItem } from '@/lib/riaPlan';

/**
 * RiaPlanCards — renders the structured meal/workout block Ria appends to a
 * chat reply (parsed by lib/riaPlan) as tap-to-add cards: a macros table with
 * DB-resolved food thumbnails, and a workout list with exercise thumbnails.
 *
 * "Log this meal" / "Add workout" resolve every item against the food (86k) /
 * exercise (library) DBs so the user NEVER hand-searches — foods get their
 * canonical macros + image, exercises get their library id + image (the server
 * resolves libraryId on save). AI-estimated macros are the fallback when a food
 * has no DB match, so nothing is ever lost.
 */

const CORAL = '#FF7A90';
const LIME = '#A8CC3C';

const httpUri = (u?: string | null): string | undefined =>
  u && /^https?:\/\//i.test(u) ? u : undefined;

// ── Thumbnail resolvers (cached per name) ─────────────────────────────────────

function useFoodMatch(name: string) {
  return useQuery({
    queryKey: ['ria-food-match', name.toLowerCase()],
    queryFn: async (): Promise<FoodItem | null> => {
      const res = await searchFoods({ q: name, limit: 1 });
      return res?.[0] ?? null;
    },
    staleTime: 30 * 60 * 1000,
    retry: 1,
  });
}

function useExerciseMatch(name: string) {
  return useQuery({
    queryKey: ['ria-ex-match', name.toLowerCase()],
    queryFn: async () => {
      const res = await searchLibrary({ query: name, limit: 1 } as any);
      return (Array.isArray(res) ? res[0] : null) ?? null;
    },
    staleTime: 30 * 60 * 1000,
    retry: 1,
  });
}

function Thumb({ uri, icon, tint }: { uri?: string; icon: keyof typeof Ionicons.glyphMap; tint: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.thumb, { backgroundColor: withAlpha(tint, 0.12), borderColor: withAlpha(tint, 0.25) }]}>
      {uri ? (
        <Image source={{ uri }} style={StyleSheet.absoluteFill as any} contentFit="cover" cachePolicy="memory-disk" transition={120} />
      ) : (
        <Ionicons name={icon} size={18} color={tint} />
      )}
    </View>
  );
}

// ── Meal card ─────────────────────────────────────────────────────────────────

function MealItemRow({ item }: { item: RiaMealItem }) {
  const { colors, typography } = useTheme();
  const { data: match } = useFoodMatch(item.name);
  const uri = httpUri(match?.imageUrl);
  return (
    <View style={styles.row}>
      <Thumb uri={uri} icon="restaurant-outline" tint={CORAL} />
      <View style={styles.rowText}>
        <Text style={[typography.bodySm, { color: colors.text.primary, fontWeight: '600' }]} numberOfLines={1}>
          {item.name}
        </Text>
        {item.amount ? (
          <Text style={[typography.caption, { color: colors.text.tertiary }]} numberOfLines={1}>
            {item.amount}
          </Text>
        ) : null}
      </View>
      <View style={styles.macroCell}>
        <Text style={[typography.bodySm, { color: colors.text.primary, fontWeight: '700' }]}>
          {Math.round(item.calories)}
        </Text>
        <Text style={[styles.macroSub, { color: colors.text.tertiary }]}>
          {Math.round(item.protein)}p · {Math.round(item.carbs)}c · {Math.round(item.fat)}f
        </Text>
      </View>
    </View>
  );
}

function MealCard({ meal }: { meal: RiaMeal }) {
  const { colors, typography, borderRadius } = useTheme();
  const queryClient = useQueryClient();
  const [done, setDone] = useState(false);

  const totals = useMemo(
    () =>
      meal.items.reduce(
        (t, i) => ({
          kcal: t.kcal + i.calories,
          p: t.p + i.protein,
          c: t.c + i.carbs,
          f: t.f + i.fat,
        }),
        { kcal: 0, p: 0, c: 0, f: 0 },
      ),
    [meal.items],
  );

  const log = useMutation({
    mutationFn: async () => {
      // Resolve every item to its DB food (canonical macros + id); fall back to
      // Ria's estimate when there's no match so nothing is dropped.
      const foodItems = await Promise.all(
        meal.items.map(async (it) => {
          let db: FoodItem | null = null;
          try {
            db = (await searchFoods({ q: it.name, limit: 1 }))?.[0] ?? null;
          } catch {
            /* fall back to AI macros */
          }
          return {
            foodId: db?.id,
            name: db?.name ?? it.name,
            quantity: 1,
            calories: db?.calories ?? it.calories,
            protein: db?.protein ?? it.protein,
            carbs: db?.carbs ?? it.carbs,
            fat: db?.fat ?? it.fat,
          };
        }),
      );
      return logMeal({ mealType: meal.mealType, foodItems });
    },
    onSuccess: () => {
      setDone(true);
      queryClient.invalidateQueries({ queryKey: ['meal-logs'] });
      queryClient.invalidateQueries({ queryKey: ['today-progress'] });
    },
  });

  return (
    <GlassCard radius={borderRadius.lg} style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="restaurant" size={16} color={CORAL} />
        <Text style={[typography.bodyMedium, { color: colors.text.primary, fontWeight: '700', flex: 1 }]} numberOfLines={1}>
          {meal.title}
        </Text>
        <View style={[styles.pill, { backgroundColor: withAlpha(CORAL, 0.14) }]}>
          <Text style={[styles.pillText, { color: CORAL }]}>{meal.mealType}</Text>
        </View>
      </View>

      <View style={styles.divider} />
      {meal.items.map((it, i) => (
        <MealItemRow key={`${it.name}-${i}`} item={it} />
      ))}
      <View style={styles.divider} />

      <View style={styles.totalsRow}>
        <Text style={[typography.bodySm, { color: colors.text.secondary, fontWeight: '600' }]}>Total</Text>
        <Text style={[typography.bodySm, { color: colors.text.primary, fontWeight: '700' }]}>
          {Math.round(totals.kcal)} kcal · {Math.round(totals.p)}p {Math.round(totals.c)}c {Math.round(totals.f)}f
        </Text>
      </View>

      <Pressable
        onPress={() => { if (!log.isPending && !done) log.mutate(); }}
        disabled={log.isPending || done}
        accessibilityRole="button"
        accessibilityLabel={`Log ${meal.title}`}
        style={({ pressed }) => [styles.cta, { backgroundColor: done ? withAlpha(CORAL, 0.3) : CORAL, opacity: pressed ? 0.85 : 1 }]}
      >
        {log.isPending ? (
          <ActivityIndicator size="small" color={colors.text.inverse} />
        ) : (
          <>
            <Ionicons name={done ? 'checkmark' : 'add'} size={17} color={colors.text.inverse} />
            <Text style={[typography.bodyMedium, { color: colors.text.inverse, fontWeight: '700' }]}>
              {done ? 'Logged to today' : 'Log this meal'}
            </Text>
          </>
        )}
      </Pressable>
      {log.isError ? (
        <Text style={[typography.caption, { color: colors.error, marginTop: 6, textAlign: 'center' }]}>
          Couldn't log — try again.
        </Text>
      ) : null}
    </GlassCard>
  );
}

// ── Workout card ──────────────────────────────────────────────────────────────

function ExerciseRow({ ex }: { ex: RiaWorkout['exercises'][number] }) {
  const { colors, typography } = useTheme();
  const { data: match } = useExerciseMatch(ex.name);
  const uri = httpUri((match as any)?.imageUrl);
  return (
    <View style={styles.row}>
      <Thumb uri={uri} icon="barbell-outline" tint={LIME} />
      <View style={styles.rowText}>
        <Text style={[typography.bodySm, { color: colors.text.primary, fontWeight: '600' }]} numberOfLines={1}>
          {ex.name}
        </Text>
        {(match as any)?.muscleGroup ? (
          <Text style={[typography.caption, { color: colors.text.tertiary }]} numberOfLines={1}>
            {(match as any).muscleGroup}
          </Text>
        ) : null}
      </View>
      <Text style={[typography.bodySm, { color: colors.text.secondary, fontWeight: '700' }]}>
        {ex.sets} × {ex.reps}
      </Text>
    </View>
  );
}

function WorkoutCard({ workout }: { workout: RiaWorkout }) {
  const { colors, typography, borderRadius } = useTheme();
  const queryClient = useQueryClient();
  const [done, setDone] = useState(false);

  const add = useMutation({
    mutationFn: () =>
      // Server resolves each name → libraryId; saved to My Routines. The routine
      // schema takes `title` + numeric reps, so we parse the AI's reps string
      // ("8", "8-12", "30s") to its leading number.
      createRoutine({
        title: workout.title,
        exercises: workout.exercises.map((e) => ({
          name: e.name,
          sets: e.sets,
          reps: parseInt(String(e.reps), 10) || 0,
        })),
      }),
    onSuccess: () => {
      setDone(true);
      queryClient.invalidateQueries({ queryKey: ['routines'] });
    },
  });

  return (
    <GlassCard radius={borderRadius.lg} style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="barbell" size={16} color={LIME} />
        <Text style={[typography.bodyMedium, { color: colors.text.primary, fontWeight: '700', flex: 1 }]} numberOfLines={1}>
          {workout.title}
        </Text>
        {workout.durationMin ? (
          <View style={[styles.pill, { backgroundColor: withAlpha(LIME, 0.14) }]}>
            <Text style={[styles.pillText, { color: LIME }]}>{workout.durationMin} min</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.divider} />
      {workout.exercises.map((ex, i) => (
        <ExerciseRow key={`${ex.name}-${i}`} ex={ex} />
      ))}
      <View style={styles.divider} />

      <Pressable
        onPress={() => { if (!add.isPending && !done) add.mutate(); }}
        disabled={add.isPending || done}
        accessibilityRole="button"
        accessibilityLabel={`Add ${workout.title} to my routines`}
        style={({ pressed }) => [styles.cta, { backgroundColor: done ? withAlpha(LIME, 0.3) : LIME, opacity: pressed ? 0.85 : 1 }]}
      >
        {add.isPending ? (
          <ActivityIndicator size="small" color={colors.text.inverse} />
        ) : (
          <>
            <Ionicons name={done ? 'checkmark' : 'add'} size={17} color={colors.text.inverse} />
            <Text style={[typography.bodyMedium, { color: colors.text.inverse, fontWeight: '700' }]}>
              {done ? 'Added to My Routines' : 'Add workout'}
            </Text>
          </>
        )}
      </Pressable>
      {add.isError ? (
        <Text style={[typography.caption, { color: colors.error, marginTop: 6, textAlign: 'center' }]}>
          Couldn't add — try again.
        </Text>
      ) : null}
    </GlassCard>
  );
}

// ── Public ────────────────────────────────────────────────────────────────────

export function RiaPlanCards({ plan }: { plan: RiaPlan }) {
  return (
    <View style={styles.wrap}>
      {plan.meals?.map((m, i) => (
        <MealCard key={`meal-${i}`} meal={m} />
      ))}
      {plan.workout ? <WorkoutCard workout={plan.workout} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10, marginTop: 8, maxWidth: 320 },
  card: { padding: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pill: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  pillText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(128,128,128,0.22)', marginVertical: 9 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  thumb: {
    width: 36,
    height: 36,
    borderRadius: 9,
    borderWidth: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  rowText: { flex: 1, minWidth: 0 },
  macroCell: { alignItems: 'flex-end', flexShrink: 0 },
  macroSub: { fontSize: 10 },
  totalsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: 12,
    paddingVertical: 11,
  },
});

export default RiaPlanCards;
