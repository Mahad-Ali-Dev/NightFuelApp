/**
 * micronutrients.ts — the single source of truth for how a FoodItem's
 * micronutrient fields are LABELED and UNITED in the UI.
 *
 * The backend sends each micro as a number (per 100g) on a field whose suffix
 * encodes its unit: `…Mg` → milligrams, `…Mcg` → micrograms (e.g. `ironMg`,
 * `folateMcg`). Any field may be null, and legacy FooDB rows omit them all. The
 * food-detail UI renders ONLY the present (non-null, finite) ones, and the
 * cycle "best foods for your phase" section reads a single focus nutrient by
 * field name — both go through this module so the label + unit never drift.
 */
import type { FoodItem } from '@/api/meals';

/** A FoodItem field that carries a micronutrient amount. */
export type MicronutrientKey =
  | 'ironMg'
  | 'magnesiumMg'
  | 'calciumMg'
  | 'potassiumMg'
  | 'zincMg'
  | 'vitaminCMg'
  | 'vitaminB6Mg'
  | 'vitaminB12Mcg'
  | 'folateMcg'
  | 'vitaminDMcg';

/** Display unit derived from the field-name suffix. */
export type MicronutrientUnit = 'mg' | 'mcg';

export interface MicronutrientMeta {
  key: MicronutrientKey;
  /** Human label, e.g. "Iron", "Vitamin C". */
  label: string;
  /** 'mg' for `…Mg` fields, 'mcg' for `…Mcg` fields. */
  unit: MicronutrientUnit;
}

/**
 * Ordered micronutrient metadata — minerals first, then vitamins, each in a
 * stable, sensible reading order. The food-detail list renders in THIS order so
 * two foods present their micros consistently. The `unit` is derived from the
 * field suffix (Mg → mg, Mcg → mcg), matching the backend contract exactly.
 */
export const MICRONUTRIENTS: readonly MicronutrientMeta[] = [
  { key: 'ironMg', label: 'Iron', unit: 'mg' },
  { key: 'magnesiumMg', label: 'Magnesium', unit: 'mg' },
  { key: 'calciumMg', label: 'Calcium', unit: 'mg' },
  { key: 'potassiumMg', label: 'Potassium', unit: 'mg' },
  { key: 'zincMg', label: 'Zinc', unit: 'mg' },
  { key: 'vitaminCMg', label: 'Vitamin C', unit: 'mg' },
  { key: 'vitaminB6Mg', label: 'Vitamin B6', unit: 'mg' },
  { key: 'vitaminB12Mcg', label: 'Vitamin B12', unit: 'mcg' },
  { key: 'folateMcg', label: 'Folate', unit: 'mcg' },
  { key: 'vitaminDMcg', label: 'Vitamin D', unit: 'mcg' },
] as const;

/** Fast lookup by field key (used by the cycle focus-nutrient display). */
const META_BY_KEY: Record<MicronutrientKey, MicronutrientMeta> = MICRONUTRIENTS.reduce(
  (acc, m) => {
    acc[m.key] = m;
    return acc;
  },
  {} as Record<MicronutrientKey, MicronutrientMeta>,
);

/** A present micronutrient value paired with its display metadata. */
export interface PresentMicronutrient extends MicronutrientMeta {
  value: number;
}

/**
 * A micro is "present" only when it is a real, finite number. null / undefined
 * (the legacy / unknown case) and NaN are skipped so the UI never shows an
 * empty or "NaN mg" row.
 */
function isPresent(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Round a micronutrient amount for display. Values come per-100g and span a
 * wide range (e.g. 0.4 mg iron vs 420 mg potassium). We keep one decimal for
 * small (<10) amounts so trace nutrients don't collapse to "0", and round whole
 * for larger amounts to avoid noisy precision.
 */
export function formatMicroValue(value: number): string {
  const rounded = value < 10 ? Math.round(value * 10) / 10 : Math.round(value);
  // Drop a trailing ".0" so "8.0" reads "8".
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

/** Format a full labeled amount, e.g. "Iron 2.6 mg" / "Folate 20 mcg". */
export function formatMicro(meta: MicronutrientMeta, value: number): string {
  return `${meta.label} ${formatMicroValue(value)} ${meta.unit}`;
}

/** Format just the amount + unit, e.g. "2.6 mg" / "20 mcg". */
export function formatMicroAmount(meta: MicronutrientMeta, value: number): string {
  return `${formatMicroValue(value)} ${meta.unit}`;
}

/**
 * Extract the present (non-null, finite) micronutrients from a FoodItem, in the
 * canonical MICRONUTRIENTS display order. Returns [] for legacy foods that carry
 * none — the caller then renders no micros section at all.
 */
export function getPresentMicronutrients(food: Partial<FoodItem> | null | undefined): PresentMicronutrient[] {
  if (!food) return [];
  const out: PresentMicronutrient[] = [];
  for (const meta of MICRONUTRIENTS) {
    const value = (food as Record<string, unknown>)[meta.key];
    if (isPresent(value)) {
      out.push({ ...meta, value });
    }
  }
  return out;
}

/**
 * Look up display metadata for a micronutrient field key. Returns null for any
 * key that is not a known micronutrient (e.g. a macro field), so a malformed
 * `focusNutrient` from the backend degrades gracefully instead of throwing.
 */
export function getMicronutrientMeta(key: string): MicronutrientMeta | null {
  return META_BY_KEY[key as MicronutrientKey] ?? null;
}
