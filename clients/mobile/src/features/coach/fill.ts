/**
 * Async fill — turns a day's `focus` into real picks from the catalog.
 *
 * For each focus group: searchLibrary(filter + gender) → rankExercises (staples
 * up, stretches down) → take a share so the day totals exercisesPerDay → attach
 * the real demo image + a level-based prescription. Meals: getRecipes(diet tag)
 * → one per meal slot. Network failures degrade to an empty list (the day still
 * renders; the user can retry).
 */
import { searchLibrary, type Exercise } from '@/api/exercises';
import { getRecipes, type Recipe } from '@/api/meals';
import type { CoachInputs, DayExercise, DayMeal, MealType } from './types';
import { FOCUS_FILTER, rankExercises, prescribe, kindForFocus, exercisesPerDay } from './select';

const DIET_TAG: Record<CoachInputs['diet'], string | undefined> = {
  balanced: undefined,
  keto: 'Keto',
  vegan: 'Vegan',
  'high-protein': 'High Protein',
};

/** Rough daily calorie targets by goal — shown next to the picked meals. */
export const KCAL_TARGET: Record<CoachInputs['goal'], number> = {
  'fat-loss': 1700,
  'muscle-gain': 2600,
  endurance: 2300,
  maintain: 2100,
};

const FULLBODY_FOCI = ['chest', 'back', 'legs', 'shoulders'];

function toDayExercise(e: Exercise, focus: string, inputs: CoachInputs): DayExercise {
  const { sets, reps } = prescribe(inputs.level, kindForFocus(focus));
  return { exerciseId: e.id, name: e.name, imageUrl: e.imageUrl, focus, sets, reps, done: false };
}

export async function fillDayExercises(focus: string[], inputs: CoachInputs): Promise<DayExercise[]> {
  // Rest / active-recovery day: a few gentle mobility picks (stretches are the
  // RIGHT choice here, unlike a working day).
  if (focus.length === 0) {
    const pool = await searchLibrary({ bodyPart: 'waist', gender: inputs.gender, limit: 60 }).catch(() => [] as Exercise[]);
    return pool.slice(0, 3).map((e) => toDayExercise(e, 'core', inputs));
  }

  const groups = focus.includes('fullbody') ? FULLBODY_FOCI : focus;
  const target = exercisesPerDay(inputs.level);
  const perGroup = Math.max(1, Math.ceil(target / groups.length));
  const picked: DayExercise[] = [];
  const seen = new Set<string>();

  for (const f of groups) {
    if (picked.length >= target) break;
    const filter = FOCUS_FILTER[f] ?? { bodyPart: f };
    const pool = await searchLibrary({ ...filter, gender: inputs.gender, limit: 80 }).catch(() => [] as Exercise[]);
    let fromGroup = 0;
    for (const e of rankExercises(pool)) {
      if (picked.length >= target || fromGroup >= perGroup) break;
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      picked.push(toDayExercise(e, f, inputs));
      fromGroup += 1;
    }
  }
  return picked.slice(0, target);
}

export async function fillDayMeals(inputs: CoachInputs): Promise<DayMeal[]> {
  const pool = await getRecipes(DIET_TAG[inputs.diet], 120).catch(() => [] as Recipe[]);
  const types: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];
  const out: DayMeal[] = [];
  const used = new Set<string>();
  const hasTag = (r: Recipe, t: string) => r.tags?.some((x) => x.toLowerCase() === t.toLowerCase());

  for (const t of types) {
    let r = pool.find((x) => !used.has(x.id) && hasTag(x, t));
    if (!r) r = pool.find((x) => !used.has(x.id)); // fall back to any unused recipe
    if (!r) continue;
    used.add(r.id);
    out.push({ recipeId: r.id, title: r.title, imageUrl: r.image, mealType: t, kcal: r.calories, protein: r.protein, carbs: r.carbs, fat: r.fat, added: false });
  }
  return out;
}
