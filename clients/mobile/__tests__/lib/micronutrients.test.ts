/**
 * micronutrients.test.ts
 *
 * Pins src/lib/micronutrients.ts — the single source of truth for how a
 * FoodItem's micronutrient fields are labeled + united in the UI. Both the
 * food-detail micros section and the cycle phase-foods focus amount go through
 * it, so these tests lock:
 *
 *   - getPresentMicronutrients skips null / undefined / NaN and keeps only the
 *     finite numbers, in the canonical (minerals-then-vitamins) order.
 *   - the unit is derived from the field suffix: `…Mg` → mg, `…Mcg` → mcg.
 *   - formatMicro / formatMicroAmount render the right label + unit (e.g.
 *     "Iron 2.6 mg", "Folate 20 mcg") and keep one decimal for small amounts.
 *   - getMicronutrientMeta resolves a known field key and returns null for a
 *     non-micronutrient key (so a malformed backend focusNutrient degrades).
 *
 * Additive: NEW test file only.
 */

import {
  MICRONUTRIENTS,
  getPresentMicronutrients,
  getMicronutrientMeta,
  formatMicro,
  formatMicroAmount,
  formatMicroValue,
} from '@/lib/micronutrients';

describe('micronutrient metadata', () => {
  test('every field ending in Mg maps to "mg" and every Mcg maps to "mcg"', () => {
    for (const meta of MICRONUTRIENTS) {
      if (meta.key.endsWith('Mcg')) {
        expect(meta.unit).toBe('mcg');
      } else if (meta.key.endsWith('Mg')) {
        expect(meta.unit).toBe('mg');
      } else {
        throw new Error(`unexpected micronutrient key suffix: ${meta.key}`);
      }
    }
  });

  test('covers all 10 backend micronutrient fields', () => {
    const keys = MICRONUTRIENTS.map((m) => m.key).sort();
    expect(keys).toEqual(
      [
        'calciumMg',
        'folateMcg',
        'ironMg',
        'magnesiumMg',
        'potassiumMg',
        'vitaminB12Mcg',
        'vitaminB6Mg',
        'vitaminCMg',
        'vitaminDMcg',
        'zincMg',
      ].sort(),
    );
  });
});

describe('getPresentMicronutrients', () => {
  test('keeps only the finite numbers and skips null / undefined / NaN', () => {
    const food = {
      id: 'f1',
      name: 'Spinach',
      calories: 23,
      protein: 3,
      carbs: 4,
      fat: 0,
      servingSize: '100g',
      ironMg: 2.7,
      magnesiumMg: 79,
      calciumMg: null, // explicit null → skipped
      potassiumMg: undefined, // absent → skipped
      vitaminCMg: 28.1,
      folateMcg: 194,
      zincMg: NaN, // NaN → skipped
    } as any;

    const present = getPresentMicronutrients(food);
    const keys = present.map((p) => p.key);

    // Present, in canonical order (iron, magnesium before vitamins).
    expect(keys).toEqual(['ironMg', 'magnesiumMg', 'vitaminCMg', 'folateMcg']);
    // The skipped ones never appear.
    expect(keys).not.toContain('calciumMg');
    expect(keys).not.toContain('potassiumMg');
    expect(keys).not.toContain('zincMg');
    // Values carried through.
    expect(present.find((p) => p.key === 'ironMg')?.value).toBe(2.7);
  });

  test('returns [] for a legacy food carrying no micronutrients', () => {
    const legacy = {
      id: 'old',
      name: 'Mystery Food',
      calories: 100,
      protein: 1,
      carbs: 1,
      fat: 1,
      servingSize: '100g',
    } as any;
    expect(getPresentMicronutrients(legacy)).toEqual([]);
  });

  test('returns [] for null / undefined input', () => {
    expect(getPresentMicronutrients(null)).toEqual([]);
    expect(getPresentMicronutrients(undefined)).toEqual([]);
  });
});

describe('formatting', () => {
  test('formatMicroValue keeps one decimal under 10 and rounds whole above', () => {
    expect(formatMicroValue(2.64)).toBe('2.6');
    expect(formatMicroValue(8.7)).toBe('8.7');
    expect(formatMicroValue(27)).toBe('27');
    expect(formatMicroValue(420.4)).toBe('420');
  });

  test('formatMicro renders "<Label> <value> <unit>"', () => {
    const iron = getMicronutrientMeta('ironMg')!;
    const folate = getMicronutrientMeta('folateMcg')!;
    expect(formatMicro(iron, 2.64)).toBe('Iron 2.6 mg');
    expect(formatMicro(folate, 20)).toBe('Folate 20 mcg');
  });

  test('formatMicroAmount renders just "<value> <unit>"', () => {
    const vitC = getMicronutrientMeta('vitaminCMg')!;
    expect(formatMicroAmount(vitC, 8.7)).toBe('8.7 mg');
  });
});

describe('getMicronutrientMeta', () => {
  test('resolves a known micronutrient field key', () => {
    expect(getMicronutrientMeta('ironMg')).toMatchObject({ label: 'Iron', unit: 'mg' });
    expect(getMicronutrientMeta('vitaminB12Mcg')).toMatchObject({ label: 'Vitamin B12', unit: 'mcg' });
  });

  test('returns null for a non-micronutrient key (malformed focusNutrient degrades)', () => {
    expect(getMicronutrientMeta('calories')).toBeNull();
    expect(getMicronutrientMeta('protein')).toBeNull();
    expect(getMicronutrientMeta('')).toBeNull();
  });
});
