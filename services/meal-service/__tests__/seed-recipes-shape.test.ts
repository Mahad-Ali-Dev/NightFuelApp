/**
 * Parse/shape suite — `MOCK_RECIPES` seed data (src/seed-recipes.ts).
 *
 * The meal-service recipe seeder ships a static catalog that gets spread
 * straight into `prisma.recipe.create` (see seed-recipes.ts `seed()`), and the
 * mobile Recipes screen filters that catalog by five discovery chips
 * (High Protein / Keto / Vegan / Meal Prep / Under 30m) and four meal-type
 * buckets (Breakfast / Lunch / Dinner / Snack). This suite locks the DATA, not
 * any DB or HTTP behaviour:
 *
 *   1. the catalog has grown to the agreed minimum size (>= 40 recipes),
 *   2. every entry is well-formed against the create-recipe record shape — a
 *      non-empty title/description, an http(s) image URL, all four macros plus
 *      prep/cook/servings as finite numbers, at least one `{ name, amount, unit? }`
 *      ingredient (amount is a STRING, matching routes.ts `createRecipe`), and at
 *      least one non-empty instruction step, and
 *   3. the five chips AND the four meal-type tags each appear at least once
 *      across the set, so no filter renders an empty screen.
 *
 * It imports ONLY the exported `MOCK_RECIPES` const. seed-recipes.ts guards its
 * `seed()` auto-run behind `require.main === module`, so importing the module
 * here is side-effect-free (it never opens a DB connection or writes a row).
 *
 * If anyone shrinks the catalog below 40, drops a required field, switches an
 * ingredient back to a bare string, or removes the last recipe carrying a chip
 * or meal-type tag, this file goes red.
 */
import { describe, it, expect } from '@jest/globals';
import { MOCK_RECIPES } from '../src/seed-recipes';

// The agreed lower bound on the seeded catalog size.
const MIN_RECIPES = 40;

// The five discovery chips the mobile Recipes screen filters on.
const TAG_CHIPS = ['High Protein', 'Keto', 'Vegan', 'Meal Prep', 'Under 30m'] as const;

// The four meal-type buckets, encoded as free-form tags on each recipe.
const MEAL_TYPES = ['Breakfast', 'Lunch', 'Dinner', 'Snack'] as const;

// The exact column set a recipe record may carry. The seeder spreads each
// object into prisma.recipe.create, so any stray key would be handed to Prisma
// as an unknown field — this list is what we assert against.
const ALLOWED_KEYS = [
    'title',
    'description',
    'image',
    'prepTimeMins',
    'cookTimeMins',
    'servings',
    'calories',
    'protein',
    'carbs',
    'fat',
    'tags',
    'ingredients',
    'instructions',
];

const isHttpUrl = (value: unknown): boolean =>
    typeof value === 'string' && /^https?:\/\/\S+$/.test(value);

const isFiniteNumber = (value: unknown): boolean =>
    typeof value === 'number' && Number.isFinite(value);

const isNonEmptyString = (value: unknown): boolean =>
    typeof value === 'string' && value.trim().length > 0;

describe('meal-service seed data — MOCK_RECIPES shape & coverage', () => {
    it('exports an array of at least 40 recipes', () => {
        expect(Array.isArray(MOCK_RECIPES)).toBe(true);
        expect(MOCK_RECIPES.length).toBeGreaterThanOrEqual(MIN_RECIPES);
    });

    it('every recipe has a non-empty title and description', () => {
        for (const recipe of MOCK_RECIPES) {
            expect(isNonEmptyString(recipe.title)).toBe(true);
            expect(isNonEmptyString(recipe.description)).toBe(true);
        }
    });

    it('every recipe image is an http(s) URL', () => {
        for (const recipe of MOCK_RECIPES) {
            expect(isHttpUrl(recipe.image)).toBe(true);
        }
    });

    it('every recipe carries prep + cook time and servings as finite numbers', () => {
        for (const recipe of MOCK_RECIPES) {
            expect(isFiniteNumber(recipe.prepTimeMins)).toBe(true);
            expect(isFiniteNumber(recipe.cookTimeMins)).toBe(true);
            expect(isFiniteNumber(recipe.servings)).toBe(true);
            // Servings is a portion count — it must be at least 1.
            expect(recipe.servings).toBeGreaterThanOrEqual(1);
        }
    });

    it('every recipe has all four macros as finite numbers (calories/protein/carbs/fat)', () => {
        for (const recipe of MOCK_RECIPES) {
            expect(isFiniteNumber(recipe.calories)).toBe(true);
            expect(isFiniteNumber(recipe.protein)).toBe(true);
            expect(isFiniteNumber(recipe.carbs)).toBe(true);
            expect(isFiniteNumber(recipe.fat)).toBe(true);
        }
    });

    it('every recipe has at least one well-formed ingredient { name, amount, unit? }', () => {
        for (const recipe of MOCK_RECIPES) {
            expect(Array.isArray(recipe.ingredients)).toBe(true);
            expect(recipe.ingredients.length).toBeGreaterThanOrEqual(1);

            for (const ingredient of recipe.ingredients) {
                // name + amount are required and non-empty; amount is a STRING
                // (e.g. "1/4", "200"), matching the createRecipe Zod schema.
                expect(isNonEmptyString(ingredient.name)).toBe(true);
                expect(isNonEmptyString(ingredient.amount)).toBe(true);

                // unit is optional, but when present it must be a non-empty string.
                if (ingredient.unit !== undefined) {
                    expect(isNonEmptyString(ingredient.unit)).toBe(true);
                }

                // No stray keys on an ingredient beyond name/amount/unit.
                for (const key of Object.keys(ingredient)) {
                    expect(['name', 'amount', 'unit']).toContain(key);
                }
            }
        }
    });

    it('every recipe has at least one non-empty instruction step', () => {
        for (const recipe of MOCK_RECIPES) {
            expect(Array.isArray(recipe.instructions)).toBe(true);
            expect(recipe.instructions.length).toBeGreaterThanOrEqual(1);
            for (const step of recipe.instructions) {
                expect(isNonEmptyString(step)).toBe(true);
            }
        }
    });

    it('every recipe carries at least one tag and no stray top-level keys', () => {
        for (const recipe of MOCK_RECIPES) {
            expect(Array.isArray(recipe.tags)).toBe(true);
            expect(recipe.tags.length).toBeGreaterThanOrEqual(1);
            for (const tag of recipe.tags) {
                expect(isNonEmptyString(tag)).toBe(true);
            }

            // The seeder spreads each object into prisma.recipe.create, so any
            // unexpected key would be forwarded to Prisma as an unknown field.
            for (const key of Object.keys(recipe)) {
                expect(ALLOWED_KEYS).toContain(key);
            }
        }
    });

    it.each(TAG_CHIPS)('the "%s" filter chip is covered by at least one recipe', (chip) => {
        const matches = MOCK_RECIPES.filter((recipe) => recipe.tags.includes(chip));
        expect(matches.length).toBeGreaterThanOrEqual(1);
    });

    it.each(MEAL_TYPES)('the "%s" meal type is covered by at least one recipe', (mealType) => {
        const matches = MOCK_RECIPES.filter((recipe) => recipe.tags.includes(mealType));
        expect(matches.length).toBeGreaterThanOrEqual(1);
    });

    it('collectively covers all five chips and all four meal types', () => {
        const allTags = new Set(MOCK_RECIPES.flatMap((recipe) => recipe.tags));
        for (const chip of TAG_CHIPS) {
            expect(allTags.has(chip)).toBe(true);
        }
        for (const mealType of MEAL_TYPES) {
            expect(allTags.has(mealType)).toBe(true);
        }
    });
});
