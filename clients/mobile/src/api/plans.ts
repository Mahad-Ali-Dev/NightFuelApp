import { apiClient } from './client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** One itemized food inside a meal (the AI "Nutrition Cart" rows). */
export interface PlanFood {
  name: string;
  amount?: string;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  imageUrl?: string;
}

export interface PlanMeal {
  time: string;
  label: string;
  description: string;
  macros?: {
    protein: number;
    carbs: number;
    fat: number;
    calories: number;
  };
  /** Itemized foods for this slot (consumed by the Confirm-Meal flow). */
  suggestedFoods?: PlanFood[];
}

export interface NutritionPlan {
  id: string;
  userId: string;
  date: string;
  meals: PlanMeal[];
  supplements: string[];
  hydrationTargetMl: number;
  protocolId?: string;
  shiftId?: string;
  shiftType?: string;
  createdAt: string;
}

export interface ProtocolParameters {
  calories: number;
  protein_g: number;
  volume_modifier: number;
  deload?: boolean;
  training_split?: string;
}

export interface MealProtocol {
  id: string;
  name: string;
  description: string;
  parameters: ProtocolParameters;
  isPublic: boolean;
  creatorId?: string;
}

/**
 * Payload accepted by POST /v1/plans/protocols (createProtocolSchema).
 * `name` + `parameters` are required; `description`/`isPublic` are optional.
 */
export interface CreateProtocolPayload {
  name: string;
  description?: string;
  parameters: ProtocolParameters;
  isPublic?: boolean;
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

/** Coerce a value to a finite number, else undefined. */
const toFiniteNum = (v: unknown): number | undefined => {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

/**
 * Parse a hydration goal into millilitres. The AI pipeline returns a STRING with
 * a unit (`"3.5L"`, `"2500ml"`, `"3 L"`); the legacy/fallback shape returns a
 * numeric `hydrationTargetMl`. Returns undefined when nothing usable is present
 * so the caller can apply its own default.
 *   "3.5L" → 3500   "2500ml" → 2500   3000 → 3000   "3" → 3000 (bare L assumed)
 */
function parseHydrationMl(numericMl: unknown, goalStr: unknown): number | undefined {
  const n = toFiniteNum(numericMl);
  if (n !== undefined && n > 0) return Math.round(n);
  if (typeof goalStr === 'string') {
    const m = goalStr.match(/([\d.]+)\s*(ml|l)?/i);
    if (m && m[1]) {
      const val = Number(m[1]);
      if (Number.isFinite(val) && val > 0) {
        // No unit, or an explicit "l" → litres; "ml" → already millilitres.
        const unit = (m[2] ?? '').toLowerCase();
        return Math.round(unit === 'ml' ? val : val * 1000);
      }
    }
  }
  return undefined;
}

/**
 * Map ONE meal from whatever shape the backend produced into the flat
 * `PlanMeal` the UI renders ({ time, label, description, macros, suggestedFoods }).
 *
 * TWO wire shapes exist and BOTH must work (tolerant by design so the UI can't
 * silently blank):
 *   • AI-pipeline shape (Groq/Anthropic LLM JSON, the live path):
 *       { name, suggested_time, recommendation, items: [{ name, amount, calories,
 *         protein, carbs, fat }] }
 *     — has NO top-level `macros` object; macros are SUMMED from `items`.
 *   • Legacy / plan-service fallback shape (already UI-aligned):
 *       { time, label, description, macros: { calories, protein, carbs, fat } }
 *
 * Field reconciliation (AI → UI): name→label, suggested_time→time,
 * recommendation→description, items→suggestedFoods. Every read prefers the
 * UI-aligned key first, then the AI key, so an already-normalized meal passes
 * through unchanged.
 */
function normalizeMeal(m: any): PlanMeal {
  if (!m || typeof m !== 'object') {
    return { time: '', label: '', description: '' };
  }

  // Itemized foods: the AI shape nests them under `items`; tolerate `foods` /
  // an already-normalized `suggestedFoods` too. Keep only real { name } rows.
  const rawItems: any[] = Array.isArray(m.suggestedFoods)
    ? m.suggestedFoods
    : Array.isArray(m.items)
      ? m.items
      : Array.isArray(m.foods)
        ? m.foods
        : [];
  const suggestedFoods: PlanFood[] = rawItems
    .filter((f) => f && (f.name || f.title))
    .map((f) => ({
      name: String(f.name ?? f.title),
      amount: f.amount != null ? String(f.amount) : undefined,
      calories: toFiniteNum(f.calories),
      protein: toFiniteNum(f.protein),
      carbs: toFiniteNum(f.carbs),
      fat: toFiniteNum(f.fat),
      imageUrl: f.imageUrl ?? f.image ?? undefined,
    }));

  // Macros: prefer an explicit macros object (legacy/fallback shape); else SUM
  // the itemized foods (AI shape carries macros only at the item level). Only
  // emit a macros object when at least one component is a real number — leaving
  // it undefined otherwise lets the UI's `m.macros?.calories || 0` read cleanly.
  let macros = m.macros;
  if (!macros || typeof macros !== 'object') {
    if (suggestedFoods.length > 0) {
      const sum = (k: keyof PlanFood) =>
        suggestedFoods.reduce((a, f) => a + (toFiniteNum(f[k]) ?? 0), 0);
      const calories = sum('calories');
      const protein = sum('protein');
      const carbs = sum('carbs');
      const fat = sum('fat');
      if (calories || protein || carbs || fat) {
        macros = { calories, protein, carbs, fat };
      }
    }
  }

  return {
    ...m,
    label: m.label ?? m.name ?? m.title ?? '',
    time: m.time ?? m.suggested_time ?? '',
    description: m.description ?? m.recommendation ?? m.note ?? '',
    ...(macros ? { macros } : {}),
    ...(suggestedFoods.length ? { suggestedFoods } : {}),
  };
}

/**
 * The backend returns a Prisma DayPlan record where the structured plan
 * is nested inside a `plan` JSON field:
 *   { id, userId, planDate, plan: { meals, supplements, hydrationTargetMl, ... }, ... }
 *
 * The mobile UI expects a flat shape: { id, userId, meals, supplements, hydrationTargetMl, ... }
 * This normalizer bridges the gap.
 *
 * Crucially it ALSO reconciles the two meal/plan field vocabularies. The live
 * AI pipeline (Groq) emits meals as { name, suggested_time, recommendation,
 * items[] } with plan-level { supplement_suggestions, hydration_goal:"3.5L" },
 * while the plan-service fallback emits the UI-aligned { label, time,
 * description, macros } + { supplements, hydrationTargetMl }. We map per-meal
 * via normalizeMeal and dual-key every plan-level field so a successful AI
 * generation populates the UI instead of rendering blank.
 */
function normalizePlan(raw: any): NutritionPlan | null {
  if (!raw) return null;
  const inner = raw.plan ?? {};
  const rawMeals = inner.meals ?? raw.meals ?? [];
  const meals = Array.isArray(rawMeals) ? rawMeals.map(normalizeMeal) : [];
  return {
    id: raw.id,
    userId: raw.userId,
    date: raw.planDate ?? raw.date,
    meals,
    // AI shape names this `supplement_suggestions`; fallback uses `supplements`.
    supplements: inner.supplements ?? raw.supplements ?? inner.supplement_suggestions ?? raw.supplement_suggestions ?? [],
    // AI shape gives a `hydration_goal` STRING ("3.5L"); fallback a numeric
    // `hydrationTargetMl`. parseHydrationMl resolves both → ml; default 2500.
    hydrationTargetMl:
      parseHydrationMl(
        inner.hydrationTargetMl ?? raw.hydrationTargetMl,
        inner.hydration_goal ?? raw.hydration_goal,
      ) ?? 2500,
    protocolId: raw.protocolId,
    shiftId: raw.shiftId,
    shiftType: raw.shiftType ?? inner.shiftType,
    createdAt: raw.createdAt,
  };
}

/** Get plan for a specific date (YYYY-MM-DD) */
export const getPlanByDate = async (date: string) => {
  try {
    const { data } = await apiClient.get<any>(`/v1/plans/${date}`);
    return normalizePlan(data);
  } catch (err: any) {
    // 404 = no plan for this date — return null, don't crash
    if (err?.response?.status === 404) return null;
    throw err;
  }
};

/** Generate or regenerate a plan for a date */
export const generatePlan = async (payload: {
  date: string;
  circadianProfile?: any;
  shiftId?: string;
  shiftType?: string
}) => {
  const { data } = await apiClient.post<any>('/v1/plans/generate', payload, {
    timeout: 60000 // 60 seconds for AI generation
  });
  return normalizePlan(data);
};

/** Get plan history */
export const getPlanHistory = async () => {
  const { data } = await apiClient.get<NutritionPlan[]>('/v1/plans/history');
  return data;
};

/** Rate a plan */
export const ratePlan = async (id: string, rating: number) => {
  const { data } = await apiClient.post(`/v1/plans/${id}/rate`, { rating });
  return data;
};

/** Protocols */
export const getProtocols = async () => {
  const { data } = await apiClient.get<MealProtocol[]>('/v1/plans/protocols');
  return data;
};

export const createProtocol = async (payload: CreateProtocolPayload) => {
  const { data } = await apiClient.post<MealProtocol>('/v1/plans/protocols', payload);
  return data;
};

export const updateProtocol = async (id: string, payload: Partial<CreateProtocolPayload>) => {
  const { data } = await apiClient.patch<MealProtocol>(`/v1/plans/protocols/${id}`, payload);
  return data;
};

export const deleteProtocol = async (id: string) => {
  await apiClient.delete(`/v1/plans/protocols/${id}`);
};

// ---------------------------------------------------------------------------
// Aliases expected by hooks
// ---------------------------------------------------------------------------

/** Alias for hooks — fetches today's plan */
export const getToday = () => getPlanByDate(new Date().toISOString().slice(0, 10));

/** Alias for hooks — generates a plan */
export const generate = generatePlan;

/** Alias type for hooks */
export type GeneratePlanPayload = Parameters<typeof generatePlan>[0];

/** Alias type for hooks */
export type Plan = NutritionPlan;
