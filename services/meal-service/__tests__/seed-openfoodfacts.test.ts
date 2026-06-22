/**
 * Pure-mapper suite — the Open Food Facts seeder's row -> Prisma-data mapping
 * (prisma/seed-openfoodfacts.ts `mapSeedRowToFoodItem` + the `planFoodWrite`
 * decision helper).
 *
 * This locks the DATA TRANSFORM, not any DB or HTTP behaviour. It imports ONLY
 * the pure exports; seed-openfoodfacts.ts guards its CLI auto-run behind
 * `require.main === module`, so importing the module here opens NO DB connection
 * and writes nothing (and does not require the seed JSON file to exist).
 *
 * It asserts:
 *   1. nutrition fields (calories/protein/carbs/fat/fiber/sugar/sodiumMg) map
 *      through unchanged;
 *   2. imageUrl + imageAttribution carry over verbatim;
 *   3. dietary flags (isVegan/isGlutenFree/isHalal) pass through;
 *   4. `category` is folded into `foodGroup`, and `source` is forced to
 *      'OPENFOODFACTS';
 *   5. a MALFORMED row — missing `name`, or missing/non-numeric `calories` — is
 *      rejected (returns null) so the seeder skips it; and
 *   6. the pure create-vs-update decision helper.
 *
 * If anyone drops a nutrition field, stops carrying the image columns, lets a
 * nameless / calorie-less row through, or changes the source tag, this goes red.
 */
import { describe, it, expect } from '@jest/globals';
import {
    mapSeedRowToFoodItem,
    planFoodWrite,
    OPENFOODFACTS_SOURCE,
} from '../prisma/seed-openfoodfacts';

// A representative, fully-formed Open Food Facts row. Tests clone-and-override
// only the field under examination so the reason a row maps or is rejected is
// never in doubt.
function baseRow(overrides: Record<string, unknown> = {}) {
    return {
        name: 'Organic Crunchy Peanut Butter',
        category: 'Spreads',
        calories: 588,
        protein: 25,
        carbs: 20,
        fat: 50,
        fiber: 6,
        sugar: 9,
        sodiumMg: 17,
        servingSize: '100g',
        isVegan: true,
        isGlutenFree: true,
        isHalal: true,
        imageUrl: 'https://images.openfoodfacts.org/images/products/peanut-butter.jpg',
        imageAttribution: 'Photo © Open Food Facts contributors, CC-BY-SA 3.0',
        source: 'OPENFOODFACTS',
        ...overrides,
    };
}

describe('Open Food Facts seeder — mapSeedRowToFoodItem (pure)', () => {
    // ── (1) Nutrition fields map through unchanged ───────────────────────────
    it('maps every nutrition field through unchanged', () => {
        const data = mapSeedRowToFoodItem(baseRow());
        expect(data).not.toBeNull();
        expect(data!.calories).toBe(588);
        expect(data!.protein).toBe(25);
        expect(data!.carbs).toBe(20);
        expect(data!.fat).toBe(50);
        expect(data!.fiber).toBe(6);
        expect(data!.sugar).toBe(9);
        expect(data!.sodiumMg).toBe(17);
    });

    // ── (2) Image columns carry over verbatim ────────────────────────────────
    it('carries imageUrl and imageAttribution over verbatim', () => {
        const data = mapSeedRowToFoodItem(baseRow())!;
        expect(data.imageUrl).toBe(
            'https://images.openfoodfacts.org/images/products/peanut-butter.jpg',
        );
        expect(data.imageAttribution).toBe(
            'Photo © Open Food Facts contributors, CC-BY-SA 3.0',
        );
    });

    it('nulls the image columns when the row has no photo', () => {
        const data = mapSeedRowToFoodItem(
            baseRow({ imageUrl: undefined, imageAttribution: undefined }),
        )!;
        expect(data.imageUrl).toBeNull();
        expect(data.imageAttribution).toBeNull();
    });

    // ── (3) Dietary flags pass through ───────────────────────────────────────
    it('passes the dietary flags through', () => {
        const vegan = mapSeedRowToFoodItem(baseRow())!;
        expect(vegan.isVegan).toBe(true);
        expect(vegan.isGlutenFree).toBe(true);
        expect(vegan.isHalal).toBe(true);

        const notVegan = mapSeedRowToFoodItem(
            baseRow({ isVegan: false, isGlutenFree: false, isHalal: false }),
        )!;
        expect(notVegan.isVegan).toBe(false);
        expect(notVegan.isGlutenFree).toBe(false);
        expect(notVegan.isHalal).toBe(false);
    });

    it('defaults absent dietary flags to false', () => {
        const data = mapSeedRowToFoodItem(
            baseRow({ isVegan: undefined, isGlutenFree: undefined, isHalal: undefined }),
        )!;
        expect(data.isVegan).toBe(false);
        expect(data.isGlutenFree).toBe(false);
        expect(data.isHalal).toBe(false);
    });

    // ── (4) category -> foodGroup, source forced ─────────────────────────────
    it('folds category into foodGroup', () => {
        const data = mapSeedRowToFoodItem(baseRow({ category: 'Dairy' }))!;
        expect(data.foodGroup).toBe('Dairy');
    });

    it('prefers an explicit foodGroup over category', () => {
        const data = mapSeedRowToFoodItem(
            baseRow({ category: 'Spreads', foodGroup: 'Nut Butters' }),
        )!;
        expect(data.foodGroup).toBe('Nut Butters');
    });

    it('forces source to OPENFOODFACTS regardless of the row value', () => {
        const data = mapSeedRowToFoodItem(baseRow({ source: 'CUSTOM' }))!;
        expect(data.source).toBe(OPENFOODFACTS_SOURCE);
        expect(data.source).toBe('OPENFOODFACTS');
    });

    it('only ever emits valid FoodItem columns', () => {
        const allowed = [
            'name', 'calories', 'protein', 'carbs', 'fat', 'fiber', 'sugar',
            'sodiumMg', 'servingSize', 'isVegan', 'isGlutenFree', 'isHalal',
            'foodGroup', 'source', 'imageUrl', 'imageAttribution',
        ];
        const data = mapSeedRowToFoodItem(baseRow())!;
        for (const key of Object.keys(data)) {
            expect(allowed).toContain(key);
        }
    });

    // ── (5) Malformed rows are rejected ──────────────────────────────────────
    it('rejects a row missing name', () => {
        expect(mapSeedRowToFoodItem(baseRow({ name: undefined }))).toBeNull();
        expect(mapSeedRowToFoodItem(baseRow({ name: '' }))).toBeNull();
        expect(mapSeedRowToFoodItem(baseRow({ name: '   ' }))).toBeNull();
    });

    it('rejects a row missing calories', () => {
        expect(mapSeedRowToFoodItem(baseRow({ calories: undefined }))).toBeNull();
    });

    it('rejects a row whose calories is not a finite number', () => {
        expect(mapSeedRowToFoodItem(baseRow({ calories: 'lots' }))).toBeNull();
        expect(mapSeedRowToFoodItem(baseRow({ calories: NaN }))).toBeNull();
        expect(mapSeedRowToFoodItem(baseRow({ calories: null }))).toBeNull();
    });

    it('rejects a present-but-garbage macro value', () => {
        expect(mapSeedRowToFoodItem(baseRow({ protein: 'a-lot' }))).toBeNull();
    });

    it('rejects a non-object row', () => {
        expect(mapSeedRowToFoodItem(null)).toBeNull();
        expect(mapSeedRowToFoodItem(undefined)).toBeNull();
        expect(mapSeedRowToFoodItem('nope')).toBeNull();
    });

    it('defaults absent optional macros to 0 (keeps the row)', () => {
        const data = mapSeedRowToFoodItem(
            baseRow({ fiber: undefined, sugar: undefined, sodiumMg: undefined }),
        )!;
        expect(data).not.toBeNull();
        expect(data.fiber).toBe(0);
        expect(data.sugar).toBe(0);
        expect(data.sodiumMg).toBe(0);
    });

    // ── (6) Pure create-vs-update decision ───────────────────────────────────
    describe('planFoodWrite() pure helper', () => {
        it('returns "create" when no row exists', () => {
            expect(planFoodWrite(null)).toBe('create');
        });

        it('returns "update" when a row exists', () => {
            expect(planFoodWrite({ id: 'abc-123' })).toBe('update');
        });
    });
});
