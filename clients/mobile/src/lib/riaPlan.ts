/**
 * Ria structured-plan parser.
 *
 * Ria appends a machine-readable block to her chat reply when she recommends a
 * specific meal or workout (see the ai-pipeline CHAT_PROMPT "STRUCTURED MEALS &
 * WORKOUTS" directive):
 *
 *   ...natural coaching prose... [ZEITRA_PLAN]{"meals":[...],"workout":{...}}[/ZEITRA_PLAN]
 *
 * This module splits that block off so the chat shows CLEAN prose (also what
 * text-to-speech reads) and the app renders tap-to-add cards from the JSON.
 *
 * STREAMING-SAFE: while a reply is still streaming the block may be half-arrived
 * (an opening tag with no close, or partial JSON). In that case we hide
 * everything from the opening tag onward and return plan=null — so raw JSON
 * never flashes in the bubble; the card appears only once the block is complete.
 */

export type RiaMealType = 'BREAKFAST' | 'LUNCH' | 'DINNER' | 'SNACK';

export interface RiaMealItem {
  name: string;
  amount?: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface RiaMeal {
  title: string;
  mealType: RiaMealType;
  items: RiaMealItem[];
}

export interface RiaWorkoutExercise {
  name: string;
  sets: number;
  reps: string;
}

export interface RiaWorkout {
  title: string;
  durationMin?: number;
  exercises: RiaWorkoutExercise[];
}

export interface RiaPlan {
  meals?: RiaMeal[];
  workout?: RiaWorkout;
}

const OPEN = '[ZEITRA_PLAN]';
const CLOSE = '[/ZEITRA_PLAN]';

/**
 * Extract the first balanced JSON object starting at/after `from`, ignoring
 * braces inside strings. Returns null when the object never closes (a
 * still-streaming / truncated block). This deliberately does NOT rely on the
 * closing [/ZEITRA_PLAN] sentinel — LLMs occasionally mangle it (e.g.
 * "}/[ZEITRA_PLAN]"), but the JSON itself is always self-delimiting.
 */
function extractBalancedJson(s: string, from: number): string | null {
  const start = s.indexOf('{', from);
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null; // unbalanced → incomplete
}

const MEAL_TYPES: RiaMealType[] = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'];
const num = (v: unknown, d = 0): number => (typeof v === 'number' && isFinite(v) ? v : d);

function coerceMeal(raw: any): RiaMeal | null {
  if (!raw || !Array.isArray(raw.items) || raw.items.length === 0) return null;
  const items: RiaMealItem[] = raw.items
    .filter((it: any) => it && typeof it.name === 'string')
    .slice(0, 12)
    .map((it: any) => ({
      name: String(it.name).slice(0, 120),
      amount: it.amount ? String(it.amount).slice(0, 40) : undefined,
      calories: num(it.calories),
      protein: num(it.protein),
      carbs: num(it.carbs),
      fat: num(it.fat),
    }));
  if (items.length === 0) return null;
  const mt = String(raw.mealType ?? '').toUpperCase();
  return {
    title: raw.title ? String(raw.title).slice(0, 80) : 'Meal',
    mealType: (MEAL_TYPES.includes(mt as RiaMealType) ? mt : 'SNACK') as RiaMealType,
    items,
  };
}

function coerceWorkout(raw: any): RiaWorkout | null {
  if (!raw || !Array.isArray(raw.exercises) || raw.exercises.length === 0) return null;
  const exercises: RiaWorkoutExercise[] = raw.exercises
    .filter((e: any) => e && typeof e.name === 'string')
    .slice(0, 8)
    .map((e: any) => ({
      name: String(e.name).slice(0, 120),
      sets: Math.max(1, Math.min(20, num(e.sets, 3))),
      reps: e.reps != null ? String(e.reps).slice(0, 16) : '10',
    }));
  if (exercises.length === 0) return null;
  return {
    title: raw.title ? String(raw.title).slice(0, 80) : 'Workout',
    durationMin: raw.durationMin ? num(raw.durationMin) : undefined,
    exercises,
  };
}

export interface ParsedRiaMessage {
  /** Prose with the plan block removed — safe to display + read aloud. */
  cleanText: string;
  /** The parsed plan, or null if absent / not yet fully streamed / invalid. */
  plan: RiaPlan | null;
}

export function parseRiaPlan(text: string): ParsedRiaMessage {
  const openIdx = text ? text.indexOf(OPEN) : -1;
  if (openIdx === -1) {
    return { cleanText: text ?? '', plan: null };
  }

  // The block is always LAST (per the prompt), so clean prose is everything
  // before the opening tag — this also hides a half-arrived block mid-stream
  // and any mangled closing sentinel after the JSON.
  const cleanText = text.slice(0, openIdx).replace(/\n{3,}/g, '\n\n').trim();

  const jsonStr = extractBalancedJson(text, openIdx + OPEN.length);
  if (!jsonStr) {
    return { cleanText, plan: null }; // JSON not fully arrived yet
  }

  let plan: RiaPlan | null = null;
  try {
    const raw = JSON.parse(jsonStr);
    const meals: RiaMeal[] = Array.isArray(raw?.meals)
      ? raw.meals.map(coerceMeal).filter((m: RiaMeal | null): m is RiaMeal => m !== null).slice(0, 4)
      : [];
    const workout = raw?.workout ? coerceWorkout(raw.workout) : null;
    if (meals.length > 0 || workout) {
      plan = { ...(meals.length > 0 ? { meals } : {}), ...(workout ? { workout } : {}) };
    }
  } catch {
    plan = null; // malformed JSON → just show the clean prose, no card
  }

  return { cleanText, plan };
}

export { CLOSE, OPEN };
