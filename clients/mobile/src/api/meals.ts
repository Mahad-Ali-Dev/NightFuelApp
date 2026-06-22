import { apiClient } from './client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FoodItem {
  id: string;
  name: string;
  brand?: string;
  foodGroup?: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  // Optional macros some richer (USDA/FooDB-enriched) rows carry. Legacy rows
  // omit them — render only when present.
  fiber?: number | null;
  sugar?: number | null;
  servingSize: string;
  servingUnit?: string;
  imageUrl?: string | null;
  /**
   * Image credit string for `imageUrl`. The enriched food images are CC-BY-SA,
   * whose license REQUIRES showing attribution wherever the image renders — so
   * the food-detail UI must surface this whenever an image is shown.
   */
  imageAttribution?: string | null;
  // ── Micronutrients (per 100g, in the unit encoded by the field suffix:
  // `Mg` → milligrams, `Mcg` → micrograms). Any may be null for a given food;
  // legacy FooDB rows omit all of them. Render only the non-null ones.
  ironMg?: number | null;
  magnesiumMg?: number | null;
  calciumMg?: number | null;
  potassiumMg?: number | null;
  zincMg?: number | null;
  vitaminCMg?: number | null;
  vitaminB6Mg?: number | null;
  vitaminB12Mcg?: number | null;
  folateMcg?: number | null;
  vitaminDMcg?: number | null;
  isVegan?: boolean;
  isGlutenFree?: boolean;
  isHalal?: boolean;
}

/**
 * The four concrete menstrual-cycle phases the phase-foods endpoint accepts.
 * Deliberately excludes 'UNKNOWN' — there is no nutrient focus for a phase we
 * can't estimate, so the caller must gate on a concrete phase before calling.
 */
export type CyclePhaseName = 'MENSTRUAL' | 'FOLLICULAR' | 'OVULATORY' | 'LUTEAL';

/**
 * Response of GET /v1/meals/phase-foods. A curated, non-prescriptive set of
 * foods that are naturally rich in the nutrient this phase tends to draw on,
 * plus a wellness-worded `rationale` the UI shows verbatim. `focusNutrient` is
 * the FoodItem micronutrient field the focus amount comes from (e.g. 'ironMg').
 */
export interface PhaseFoodsResponse {
  phase: CyclePhaseName;
  focusNutrient: keyof FoodItem;
  focusLabel: string;
  rationale: string;
  foods: FoodItem[];
}

export interface Recipe {
  id: string;
  title: string;
  description?: string;
  prepTimeMins: number;
  cookTimeMins: number;
  servings: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  ingredients: Array<{ name: string; amount: string; unit?: string }>;
  instructions: string[];
  tags: string[];
  image?: string;
}

export interface MealLog {
  id: string;
  userId: string;
  mealType: 'BREAKFAST' | 'LUNCH' | 'DINNER' | 'SNACK';
  foodItems: Array<{
    foodId: string;
    name: string;
    quantity: number;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  }>;
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  loggedAt: string;
}

export interface FastingLog {
  id: string;
  startedAt: string;
  endedAt?: string;
  targetHours: number;
  actualHours?: number;
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
}

/** Maps backend FastingLog (startTime/endTime) to mobile FastingLog (startedAt/endedAt) */
function normalizeFastingLog(raw: any): FastingLog {
  return {
    id: raw.id,
    startedAt: raw.startedAt ?? raw.startTime,
    endedAt: raw.endedAt ?? raw.endTime,
    targetHours: raw.targetHours,
    actualHours: raw.actualHours,
    status: raw.status,
  };
}

export interface GroceryItem {
  category: string;
  items: Array<{ name: string; amount: string; unit?: string; checked: boolean }>;
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

/** Food Library */
export const searchFoods = async (params: { q: string; foodGroup?: string; limit?: number }) => {
  const { data } = await apiClient.get<FoodItem[]>('/v1/meals/search', { params });
  return data;
};

export const getFoodById = async (id: string) => {
  const { data } = await apiClient.get<FoodItem>(`/v1/meals/food/${id}`);
  return data;
};

export const listFoodGroups = async () => {
  const { data } = await apiClient.get<string[]>('/v1/meals/food-groups');
  return data;
};

/**
 * Best-foods-for-your-phase: a curated set of micronutrient-rich foods for a
 * concrete menstrual-cycle phase, with a wellness-worded rationale the UI shows
 * verbatim. Callers MUST pass a concrete phase (MENSTRUAL/FOLLICULAR/OVULATORY/
 * LUTEAL) — there is no focus nutrient for 'UNKNOWN', so gate before calling.
 */
export const getPhaseFoods = async (phase: CyclePhaseName, limit?: number) => {
  const { data } = await apiClient.get<PhaseFoodsResponse>('/v1/meals/phase-foods', {
    params: { phase, limit },
  });
  return data;
};

/** Meal Logging */
export const logMeal = async (payload: { mealType: string; foodItems: any[]; planMealId?: string }) => {
  // planMealId is additive: when a meal is logged straight from a planned
  // protocol slot (the circadian "Log this" flow) the originating plan-meal id
  // is forwarded so the service can persist/echo it. Existing callers that omit
  // it send exactly the same body as before.
  const { data } = await apiClient.post<MealLog>('/v1/meals/log', payload);
  return data;
};

export const getMealLogs = async (date?: string, limit?: number) => {
  const { data } = await apiClient.get<MealLog[]>('/v1/meals/logs', { params: { date, limit } });
  return data;
};

/** Recipes */
export const getRecipes = async (tags?: string, limit?: number) => {
  const { data } = await apiClient.get<Recipe[]>('/v1/meals/recipes', { params: { tags, limit } });
  return data;
};

export const getRecipe = async (id: string) => {
  const { data } = await apiClient.get<Recipe>(`/v1/meals/recipes/${id}`);
  return data;
};

/** Fasting */
export const getFastingLogs = async (limit?: number) => {
  const { data } = await apiClient.get<any[]>('/v1/meals/fasting', { params: { limit } });
  return (data || []).map(normalizeFastingLog);
};

export const startFasting = async (targetHours: number) => {
  const { data } = await apiClient.post<any>('/v1/meals/fasting/start', { targetHours });
  return normalizeFastingLog(data);
};

export const endFasting = async () => {
  const { data } = await apiClient.post<any>('/v1/meals/fasting/end');
  return normalizeFastingLog(data);
};

/** Grocery List */
export const getGroceryList = async (date?: string) => {
  const { data } = await apiClient.get<GroceryItem[]>('/v1/meals/grocery-list', { params: { date } });
  return data;
};

// ---------------------------------------------------------------------------
// Aliases expected by hooks
// ---------------------------------------------------------------------------

/** Alias for hooks */
export const search = searchFoods;

/** Alias for hooks */
export const log = logMeal;

/** Get active fasting status */
export const getFasting = async () => {
  const logs = await getFastingLogs(1);
  const active = logs.find((l) => l.status === 'ACTIVE');
  return {
    isFasting: !!active,
    elapsedMinutes: active
      ? Math.floor((Date.now() - new Date(active.startedAt).getTime()) / 60000)
      : 0,
    currentLog: active ?? null,
  };
};

/** Alias type for hooks */
export type LogMealPayload = { mealType: string; foodItems: any[]; planMealId?: string };
