import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Body, { type Slug } from 'react-native-body-highlighter';
import { useTheme } from '@/theme';

/**
 * Anatomical muscle body-map. Wraps `react-native-body-highlighter` with the
 * app's 12-group taxonomy, lime theming, a Front/Back toggle, and two modes:
 *   • select  — pass `onSelect`; tapping a muscle reports its group.
 *   • display — pass `highlight` (group → 2 primary / 1 secondary) to light up
 *               the muscles a given exercise targets (used on the detail page).
 * Gendered: renders the male or female anatomy to match the chosen profile.
 */

export type MuscleGroup =
  | 'chest' | 'back' | 'biceps' | 'triceps' | 'quadriceps' | 'hamstrings'
  | 'shoulders' | 'hips' | 'calves' | 'forearms' | 'waist' | 'neck'
  // 'upperarms' is a grid-only meta-group (= biceps + triceps); not a body-map
  // selection target, so it's excluded from SLUG_TO_GROUP below.
  | 'upperarms';

/** Our group → the library's underlying anatomical slugs (front + back). */
export const GROUP_SLUGS: Record<MuscleGroup, Slug[]> = {
  chest: ['chest'],
  back: ['upper-back', 'lower-back', 'trapezius'],
  biceps: ['biceps'],
  triceps: ['triceps'],
  quadriceps: ['quadriceps'],
  hamstrings: ['hamstring'],
  shoulders: ['deltoids'],
  hips: ['gluteal'],
  calves: ['calves'],
  forearms: ['forearm'],
  waist: ['abs', 'obliques'],
  neck: ['neck'],
  upperarms: ['biceps', 'triceps'],
};

export const GROUP_LABELS: Record<MuscleGroup, string> = {
  chest: 'Chest', back: 'Back', biceps: 'Biceps', triceps: 'Triceps',
  quadriceps: 'Quadriceps', hamstrings: 'Hamstrings', shoulders: 'Shoulders',
  hips: 'Hips / Glutes', calves: 'Calves', forearms: 'Forearms',
  waist: 'Waist / Abs', neck: 'Neck', upperarms: 'Upper arms',
};

/**
 * How each group maps to the exercise-library query. Some groups share a coarse
 * `bodyPart` (biceps/triceps both = "upper arms"), so those filter by the finer
 * `muscleGroup` (case-insensitive `contains`) instead. Verified against the live
 * catalog counts.
 */
export const GROUP_FILTER: Record<MuscleGroup, { bodyPart?: string; muscleGroup?: string }> = {
  chest: { bodyPart: 'chest' },
  back: { bodyPart: 'back' },
  biceps: { muscleGroup: 'bicep' },
  triceps: { muscleGroup: 'tricep' },
  quadriceps: { muscleGroup: 'quad' },
  hamstrings: { muscleGroup: 'hamstring' },
  shoulders: { bodyPart: 'shoulders' },
  hips: { muscleGroup: 'glute' },
  calves: { bodyPart: 'lower legs' },
  forearms: { bodyPart: 'lower arms' },
  waist: { bodyPart: 'waist' },
  neck: { bodyPart: 'neck' },
  upperarms: { bodyPart: 'upper arms' },
};

const SLUG_TO_GROUP: Partial<Record<Slug, MuscleGroup>> = {};
(Object.keys(GROUP_SLUGS) as MuscleGroup[]).forEach((g) => {
  if (g === 'upperarms') return; // meta-group; its slugs belong to biceps/triceps
  GROUP_SLUGS[g].forEach((s) => { SLUG_TO_GROUP[s] = g; });
});

// Keyword matchers for mapping a raw muscle / body-part name → a group.
// Order matters: more specific patterns first (trapezius → back before neck).
const KEYWORDS: [RegExp, MuscleGroup][] = [
  [/pec|chest/i, 'chest'],
  [/bicep/i, 'biceps'],
  [/tricep/i, 'triceps'],
  [/quad/i, 'quadriceps'],
  [/hamstring/i, 'hamstrings'],
  [/glute|gluteus/i, 'hips'],
  [/calf|calv|gastrocnemius|soleus/i, 'calves'],
  [/forearm|brachioradialis/i, 'forearms'],
  [/delt|shoulder/i, 'shoulders'],
  [/lat|trap|rhomboid|spinae|teres/i, 'back'],
  [/abdominal|\babs?\b|core|oblique|waist/i, 'waist'],
  [/sternocleido|\bneck\b/i, 'neck'],
];
// Coarse fallback for ExerciseDB bodyPart keys when no keyword matched.
const COARSE: Record<string, MuscleGroup> = {
  'upper legs': 'quadriceps', 'lower legs': 'calves', 'lower arms': 'forearms',
  'upper arms': 'biceps', waist: 'waist', chest: 'chest', back: 'back',
  shoulders: 'shoulders', neck: 'neck', hips: 'hips',
};

/** Map a raw muscle / body-part token to one of our groups, else null. */
export function muscleToGroup(raw?: string | null): MuscleGroup | null {
  const t = (raw ?? '').trim().toLowerCase();
  if (!t) return null;
  for (const [re, g] of KEYWORDS) if (re.test(t)) return g;
  if (COARSE[t]) return COARSE[t];
  return null;
}

/** Build a highlight map (group → 2 primary / 1 secondary) from an exercise's muscles. */
export function exerciseHighlight(opts: {
  primary?: (string | null | undefined)[];
  secondary?: (string | null | undefined)[];
}): Partial<Record<MuscleGroup, 1 | 2>> {
  const out: Partial<Record<MuscleGroup, 1 | 2>> = {};
  for (const m of opts.secondary ?? []) { const g = muscleToGroup(m); if (g && !out[g]) out[g] = 1; }
  for (const m of opts.primary ?? []) { const g = muscleToGroup(m); if (g) out[g] = 2; }
  return out;
}

const PRIMARY_FILL = '#C2F03C';
const SECONDARY_FILL = 'rgba(194,240,60,0.34)';

export function MuscleBodyMap({
  gender,
  highlight,
  onSelect,
  height = 340,
  showToggle = true,
  initialSide = 'front',
}: {
  gender: 'Male' | 'Female';
  /** group → 2 (primary, bright) | 1 (secondary, faint). */
  highlight?: Partial<Record<MuscleGroup, 1 | 2>>;
  /** When provided, muscles become tappable and report their group. */
  onSelect?: (group: MuscleGroup) => void;
  height?: number;
  showToggle?: boolean;
  initialSide?: 'front' | 'back';
}) {
  const { colors } = useTheme();
  const [side, setSide] = useState<'front' | 'back'>(initialSide);
  const scale = height / 400; // library renders at 400*scale tall / 200*scale wide

  const data = useMemo(() => {
    const out: { slug: Slug; color: string }[] = [];
    if (highlight) {
      (Object.keys(highlight) as MuscleGroup[]).forEach((g) => {
        const color = highlight[g] === 2 ? PRIMARY_FILL : SECONDARY_FILL;
        GROUP_SLUGS[g].forEach((s) => out.push({ slug: s, color }));
      });
    }
    return out;
  }, [highlight]);

  return (
    <View style={st.wrap}>
      {showToggle && (
        <View style={[st.seg, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
          {(['front', 'back'] as const).map((s) => {
            const on = side === s;
            return (
              <Pressable
                key={s}
                onPress={() => setSide(s)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={s === 'front' ? 'Front view' : 'Back view'}
                style={[st.segBtn, on && { backgroundColor: PRIMARY_FILL }]}
              >
                <Text style={[st.segTxt, { color: on ? '#13200A' : colors.text.secondary }]}>
                  {s === 'front' ? 'Front' : 'Back'}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
      <View style={{ height, alignItems: 'center', justifyContent: 'center' }}>
        <Body
          data={data as any}
          gender={gender.toLowerCase() as 'male' | 'female'}
          side={side}
          scale={scale}
          defaultFill="#252c36"
          defaultStroke="#0d1016"
          defaultStrokeWidth={6}
          border="#2f3742"
          onBodyPartPress={
            onSelect
              ? (bp: any) => { const g = SLUG_TO_GROUP[bp?.slug as Slug]; if (g) onSelect(g); }
              : undefined
          }
        />
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { alignItems: 'center' },
  seg: { flexDirection: 'row', borderWidth: 1, borderRadius: 12, padding: 4, gap: 4, marginBottom: 8 },
  segBtn: { paddingHorizontal: 22, paddingVertical: 7, borderRadius: 9 },
  segTxt: { fontSize: 13, fontWeight: '600' },
});
