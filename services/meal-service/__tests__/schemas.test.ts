/**
 * Unit suite — bounded input validation on the meal schemas (src/schemas.ts).
 *
 * These assertions test the Zod `logMealBodySchema` DIRECTLY (via safeParse),
 * independent of Fastify and the DB, because schemas.ts is a standalone module
 * whose job is to reject malformed input before it reaches a route handler,
 * the per-meal totals aggregation, or Prisma. They lock the per-food-item upper
 * bounds added in this sprint:
 *
 *   quantity  .min(0.01).max(10000)
 *   calories  .min(0).max(20000)
 *   protein / carbs / fat  .min(0).max(2000) each
 *   foodItems .min(1).max(50)
 *
 * Previously each of these had only a lower bound, so an item like
 * `calories: 1e9` flowed straight into totalCalories. If anyone loosens or
 * removes a cap, this file goes red.
 */
import { describe, it, expect } from '@jest/globals';
import { logMealBodySchema } from '../src/schemas';

// The documented caps, kept as named constants so each boundary case reads
// unambiguously against the schema's own `.max(...)`.
const MAX_QUANTITY = 10000;
const MAX_CALORIES = 20000;
const MAX_MACRO_GRAMS = 2000;
const MAX_FOOD_ITEMS = 50;

// A single, fully in-bounds food item. Tests clone-and-override only the field
// under examination so the reason a payload passes or fails is never in doubt.
function baseItem(overrides: Record<string, unknown> = {}) {
    return {
        foodId: 'food-123',
        name: 'Oatmeal',
        quantity: 1,
        calories: 150,
        protein: 5,
        carbs: 27,
        fat: 3,
        ...overrides,
    };
}

function bodyWith(item: Record<string, unknown>) {
    return { mealType: 'BREAKFAST' as const, foodItems: [item] };
}

describe('meal-service schemas — logMealBodySchema bounded input validation', () => {
    it('accepts a normal in-bounds meal', () => {
        const result = logMealBodySchema.safeParse(bodyWith(baseItem()));
        expect(result.success).toBe(true);
    });

    it('accepts every field exactly at its max (boundary values)', () => {
        const result = logMealBodySchema.safeParse(
            bodyWith(
                baseItem({
                    quantity: MAX_QUANTITY,
                    calories: MAX_CALORIES,
                    protein: MAX_MACRO_GRAMS,
                    carbs: MAX_MACRO_GRAMS,
                    fat: MAX_MACRO_GRAMS,
                })
            )
        );
        expect(result.success).toBe(true);
    });

    // ── quantity bounds ──────────────────────────────────────────────────────
    it('rejects quantity above the 10000 cap', () => {
        const result = logMealBodySchema.safeParse(
            bodyWith(baseItem({ quantity: MAX_QUANTITY + 1 }))
        );
        expect(result.success).toBe(false);
    });

    it('rejects an absurd quantity (1e9) that the old unbounded schema accepted', () => {
        const result = logMealBodySchema.safeParse(bodyWith(baseItem({ quantity: 1_000_000_000 })));
        expect(result.success).toBe(false);
    });

    it('still rejects quantity below the 0.01 floor (min preserved)', () => {
        const result = logMealBodySchema.safeParse(bodyWith(baseItem({ quantity: 0 })));
        expect(result.success).toBe(false);
    });

    // ── calories bound ───────────────────────────────────────────────────────
    it('rejects calories above the 20000 cap', () => {
        const result = logMealBodySchema.safeParse(
            bodyWith(baseItem({ calories: MAX_CALORIES + 1 }))
        );
        expect(result.success).toBe(false);
    });

    // ── macro bounds (protein / carbs / fat) ─────────────────────────────────
    it('rejects protein above the 2000g cap', () => {
        const result = logMealBodySchema.safeParse(
            bodyWith(baseItem({ protein: MAX_MACRO_GRAMS + 1 }))
        );
        expect(result.success).toBe(false);
    });

    it('rejects carbs above the 2000g cap', () => {
        const result = logMealBodySchema.safeParse(
            bodyWith(baseItem({ carbs: MAX_MACRO_GRAMS + 1 }))
        );
        expect(result.success).toBe(false);
    });

    it('rejects fat above the 2000g cap', () => {
        const result = logMealBodySchema.safeParse(bodyWith(baseItem({ fat: MAX_MACRO_GRAMS + 1 })));
        expect(result.success).toBe(false);
    });

    it('still rejects a negative macro (min 0 preserved)', () => {
        const result = logMealBodySchema.safeParse(bodyWith(baseItem({ protein: -1 })));
        expect(result.success).toBe(false);
    });

    // ── array constraint preserved ───────────────────────────────────────────
    it('still rejects an empty foodItems array (min 1 preserved)', () => {
        const result = logMealBodySchema.safeParse({ mealType: 'LUNCH', foodItems: [] });
        expect(result.success).toBe(false);
    });

    // ── array upper bound (storage-amplification guard) ──────────────────────
    it('accepts a foodItems array exactly at the 50-item cap', () => {
        const foodItems = Array.from({ length: MAX_FOOD_ITEMS }, () => baseItem());
        const result = logMealBodySchema.safeParse({ mealType: 'LUNCH', foodItems });
        expect(result.success).toBe(true);
    });

    it('rejects a foodItems array above the 50-item cap (storage-amplification)', () => {
        const foodItems = Array.from({ length: MAX_FOOD_ITEMS + 1 }, () => baseItem());
        const result = logMealBodySchema.safeParse({ mealType: 'LUNCH', foodItems });
        expect(result.success).toBe(false);
    });

    it('rejects a multi-item meal where ONE item is over-bound', () => {
        const result = logMealBodySchema.safeParse({
            mealType: 'DINNER',
            foodItems: [baseItem(), baseItem({ calories: MAX_CALORIES + 1 })],
        });
        expect(result.success).toBe(false);
    });
});
