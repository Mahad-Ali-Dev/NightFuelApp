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

/**
 * OPTIONAL per-food-item micronutrients + secondary macros. The key set + units
 * match the /food-search gateway's parseProduct (clients/web/app/api/food-search/
 * route.ts → FoodNutrition) EXACTLY — which is the shape the barcode scanner
 * carries — and the meal-service `logMealBodySchema` (MICRO_FIELDS) now retains
 * them on the logged meal's `foodItems` JSON instead of stripping them:
 *   • secondary macros fiber/sugar/saturatedFat/transFat       → grams
 *   • minerals + vitaminC / vitaminB6 / cholesterol             → milligrams (mg)
 *   • vitaminA / vitaminD / vitaminB12 / folate                 → micrograms (µg)
 * Every field is optional (a macro-only log carries none), so this never makes a
 * pre-existing payload invalid.
 */
export interface FoodItemMicros {
  // Secondary macros (g)
  fiber?: number;
  sugar?: number;
  saturatedFat?: number;
  transFat?: number;
  // Minerals (mg)
  sodium?: number;
  calcium?: number;
  iron?: number;
  potassium?: number;
  magnesium?: number;
  phosphorus?: number;
  zinc?: number;
  // Vitamins (mg / µg) + cholesterol (mg)
  vitaminC?: number;
  vitaminA?: number;
  vitaminD?: number;
  vitaminB6?: number;
  vitaminB12?: number;
  folate?: number;
  cholesterol?: number;
}

/**
 * A food recognized from a PHOTO by the /food-vision gateway. Its shape mirrors
 * /food-search's parseProduct → FoodNutrition EXACTLY (same keys + units) so the
 * photo-scan result card reuses the barcode scanner's macro + Micronutrients
 * panel and threads through the identical addToMeal → log-meal path. The 4
 * headline macros are required; every micro / secondary macro is optional and
 * present only when the model could estimate it. Units:
 *   • macros fiber/sugar/saturatedFat/transFat                  → grams
 *   • minerals + vitaminC / vitaminB6 / cholesterol             → milligrams (mg)
 *   • vitaminA / vitaminD / vitaminB12 / folate                 → micrograms (µg)
 */
export interface VisionFoodResult extends FoodItemMicros {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

/**
 * Outcome of a /food-vision call. On a confident hit `food` is set; otherwise
 * `error` carries a token the UI maps to a recoverable message (no_food /
 * low_confidence / rate_limited / timeout / vision_failed …). The gateway
 * returns its non-result errors as HTTP 200 with `{ error }` (so a missed plate
 * is not a thrown 5xx), and on a transport/5xx failure we still resolve a
 * `{ error: 'vision_failed' }` so the camera stays usable.
 */
export interface VisionRecognizeResult {
  food: VisionFoodResult | null;
  confidence?: number;
  portionNote?: string;
  error?: string;
}

export interface MealLog {
  id: string;
  userId: string;
  mealType: 'BREAKFAST' | 'LUNCH' | 'DINNER' | 'SNACK';
  // Each logged food carries the 4 headline macros, and — when it was added from
  // a scanned product that reported them — the OPTIONAL micros/secondary macros
  // above. The micros persist on the meal-service `foodItems` JSON and round-trip
  // back out here.
  foodItems: Array<{
    foodId: string;
    name: string;
    quantity: number;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  } & FoodItemMicros>;
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

/**
 * Photo food recognition — POST a base64 JPEG data URL to the /food-vision
 * gateway (the Next.js route that calls the Groq vision model server-side; the
 * API key NEVER touches the client). The gateway returns the SAME `{ food }`
 * shape /food-search emits, so the recognized food threads into the shared meal
 * UI. Mirrors how the barcode scanner calls /food-search (an un-versioned
 * gateway path, so the /v1 prefix policy doesn't apply).
 *
 * Errors are normalized so the caller never has to inspect axios internals:
 *   • The gateway returns its non-result cases (no food, low confidence, rate
 *     limit, timeout) as HTTP 200 with `{ error }` — passed straight through.
 *   • A transport failure or unexpected 5xx resolves `{ error: 'vision_failed' }`
 *     (or 'timeout' on an axios timeout) instead of throwing, so the photo screen
 *     can always offer "try again / add manually" and keep the camera usable.
 * A longer per-request timeout is used because vision inference can be slow.
 */
export const recognizeFoodPhoto = async (imageBase64: string): Promise<VisionRecognizeResult> => {
  try {
    const { data } = await apiClient.post<VisionRecognizeResult>(
      '/food-vision',
      { image: imageBase64 },
      { timeout: 30_000 },
    );
    return {
      food: data?.food ?? null,
      confidence: data?.confidence,
      portionNote: data?.portionNote,
      error: data?.food ? undefined : (data?.error ?? 'vision_failed'),
    };
  } catch (err: any) {
    const status: number | undefined = err?.response?.status;
    const serverError: string | undefined = err?.response?.data?.error;
    const isTimeout = err?.code === 'ECONNABORTED';
    return {
      food: null,
      error:
        serverError ??
        (isTimeout ? 'timeout' : status === 429 ? 'rate_limited' : 'vision_failed'),
    };
  }
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
