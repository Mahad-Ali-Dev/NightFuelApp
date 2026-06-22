/**
 * seed-openfoodfacts.ts — NightFuel Open Food Facts Seeder
 * ─────────────────────────────────────────────────────────
 * Reads prisma/data/openfoodfacts-seed.json (an array produced by the
 * Open Food Facts extraction step) and upserts each branded/packaged food
 * into the food_items table, carrying the openly-licensed product photo
 * (imageUrl) and its required license credit (imageAttribution).
 *
 * Usage (from services/meal-service/):
 *   npx tsx prisma/seed-openfoodfacts.ts
 *
 * Or via npm script:
 *   npm run seed:off
 *
 * Idempotency
 * ───────────
 * `FoodItem` has NO @unique on (name, source), so a bare Prisma `upsert`
 * would require a user-gated migration. Instead the seeder is re-runnable
 * the file-only way: for each row it guards with
 * findFirst({ where: { name (exact), source } }) and then UPDATES the matched
 * row, else CREATES a new one. Re-running a full pass therefore yields zero
 * net new rows. (No new unique constraint / migration is introduced.)
 *
 * Prereqs:
 *   1. The sibling extraction step has written prisma/data/openfoodfacts-seed.json
 *   2. Set MEAL_DATABASE_URL and MEAL_DIRECT_URL in .env
 *   3. Run: npx prisma db push   (so image_url / image_attribution exist)
 */

import { PrismaClient } from '../src/generated/prisma';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

// The fixed source tag stamped on every row this seeder writes. Matches the
// `source` filter the /search route exposes ('OPENFOODFACTS').
export const OPENFOODFACTS_SOURCE = 'OPENFOODFACTS';

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Shape of one row in prisma/data/openfoodfacts-seed.json, as produced by the
 * sibling extraction step. Everything that maps onto a FoodItem column; the
 * `category` is the Open Food Facts category string we fold into `foodGroup`.
 */
export interface OpenFoodFactsSeedRow {
    name: string;
    category?: string | null;
    foodGroup?: string | null;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber?: number | null;
    sugar?: number | null;
    sodiumMg?: number | null;
    servingSize?: string | null;
    isVegan?: boolean | null;
    isGlutenFree?: boolean | null;
    isHalal?: boolean | null;
    imageUrl?: string | null;
    imageAttribution?: string | null;
    source?: string | null;
}

/**
 * The exact, Prisma-writable FoodItem payload the seeder hands to
 * create()/update(). Keys are a subset of the FoodItem model's user-writable
 * columns (id/createdAt/updatedAt are DB-managed).
 */
export interface FoodItemSeedData {
    name: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number;
    sugar: number;
    sodiumMg: number;
    servingSize: string;
    isVegan: boolean;
    isGlutenFree: boolean;
    isHalal: boolean;
    foodGroup: string | null;
    source: string;
    imageUrl: string | null;
    imageAttribution: string | null;
}

// ── Pure mapper ─────────────────────────────────────────────────────────────

const isFiniteNumber = (v: unknown): v is number =>
    typeof v === 'number' && Number.isFinite(v);

const isNonEmptyString = (v: unknown): v is string =>
    typeof v === 'string' && v.trim().length > 0;

// Coerce an optional numeric nutrition value to a finite number, defaulting to
// 0 when absent/null. A PRESENT-but-non-numeric value (e.g. NaN, "abc") is
// treated as invalid by returning null so the row can be rejected upstream.
function optionalNumber(v: unknown): number | null {
    if (v === undefined || v === null) return 0;
    return isFiniteNumber(v) ? v : null;
}

/**
 * mapSeedRowToFoodItem — PURE row -> Prisma-data mapping.
 *
 * Returns the FoodItem create/update payload for a well-formed row, or `null`
 * when the row is malformed and must be skipped. A row is REQUIRED to carry:
 *   - a non-empty `name`, and
 *   - a finite numeric `calories` (the headline macro; without it the food is
 *     useless for logging),
 * and its core macros (protein/carbs/fat) plus the optional fiber/sugar/sodium,
 * when present, must be finite numbers (a present-but-garbage value rejects the
 * row rather than silently coercing to 0).
 *
 * Mapping notes:
 *   - `category` is folded into `foodGroup` (explicit `foodGroup` wins if both
 *     are present); null when neither is supplied.
 *   - `source` is forced to 'OPENFOODFACTS' regardless of the row's own value.
 *   - `imageUrl` + `imageAttribution` carry over verbatim (null when absent).
 *   - dietary flags pass through, defaulting to false when absent.
 */
export function mapSeedRowToFoodItem(row: unknown): FoodItemSeedData | null {
    if (row === null || typeof row !== 'object') return null;
    const r = row as Record<string, unknown>;

    // Required: name.
    if (!isNonEmptyString(r.name)) return null;

    // Required: a finite calories value.
    if (!isFiniteNumber(r.calories)) return null;

    // Core macros: default to 0 when absent, but reject a present-but-garbage value.
    const protein = optionalNumber(r.protein);
    const carbs = optionalNumber(r.carbs);
    const fat = optionalNumber(r.fat);
    const fiber = optionalNumber(r.fiber);
    const sugar = optionalNumber(r.sugar);
    const sodiumMg = optionalNumber(r.sodiumMg);
    if (
        protein === null || carbs === null || fat === null ||
        fiber === null || sugar === null || sodiumMg === null
    ) {
        return null;
    }

    // foodGroup <- explicit foodGroup, else category, else null.
    const foodGroup = isNonEmptyString(r.foodGroup)
        ? r.foodGroup.trim()
        : isNonEmptyString(r.category)
            ? (r.category as string).trim()
            : null;

    return {
        name: r.name.trim(),
        calories: r.calories,
        protein,
        carbs,
        fat,
        fiber,
        sugar,
        sodiumMg,
        servingSize: isNonEmptyString(r.servingSize) ? r.servingSize.trim() : '100g',
        isVegan: r.isVegan === true,
        isGlutenFree: r.isGlutenFree === true,
        isHalal: r.isHalal === true,
        foodGroup,
        // Always our own source tag — never trust the row's value.
        source: OPENFOODFACTS_SOURCE,
        imageUrl: isNonEmptyString(r.imageUrl) ? r.imageUrl.trim() : null,
        imageAttribution: isNonEmptyString(r.imageAttribution)
            ? r.imageAttribution.trim()
            : null,
    };
}

/**
 * planFoodWrite — PURE create-vs-update decision for the guard-by-(name,source)
 * idempotency path. 'create' when no row was found, 'update' otherwise.
 */
export function planFoodWrite(existing: { id: string } | null): 'create' | 'update' {
    return existing ? 'update' : 'create';
}

// ── Loader ────────────────────────────────────────────────────────────────────

/**
 * Load prisma/data/openfoodfacts-seed.json, resolved relative to THIS file
 * (with a cwd-relative fallback). Throws a friendly error when the file the
 * sibling extraction step produces is not present yet.
 */
export function loadOpenFoodFactsJson(): unknown[] {
    const candidates = [
        path.resolve(__dirname, 'data/openfoodfacts-seed.json'),
        path.resolve(process.cwd(), 'prisma/data/openfoodfacts-seed.json'),
    ];

    for (const p of candidates) {
        if (fs.existsSync(p)) {
            console.log(`📂 Loading Open Food Facts JSON from: ${p}`);
            const parsed = JSON.parse(fs.readFileSync(p, 'utf-8'));
            if (!Array.isArray(parsed)) {
                throw new Error(
                    `Expected ${p} to contain a JSON array of food rows.`,
                );
            }
            return parsed as unknown[];
        }
    }

    throw new Error(
        `openfoodfacts-seed.json not found. Expected at:\n` +
        candidates.map((c) => `  ${c}`).join('\n'),
    );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export async function seed(): Promise<{ inserted: number; updated: number; skipped: number }> {
    const rows = loadOpenFoodFactsJson();
    console.log(`\n🥫 Open Food Facts Seeder — ${rows.length} rows to process\n`);

    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    const batchSize = 50;

    for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);

        await Promise.allSettled(
            batch.map(async (raw) => {
                const data = mapSeedRowToFoodItem(raw);
                if (!data) {
                    skipped++;
                    return;
                }

                try {
                    // Guard by the STABLE key (exact name + source). No @unique
                    // exists on this pair, so we check-then-write instead of
                    // upsert — keeps the seeder re-runnable with no migration.
                    const existing = await prisma.foodItem.findFirst({
                        where: { name: data.name, source: data.source },
                        select: { id: true },
                    });

                    if (planFoodWrite(existing) === 'update') {
                        await prisma.foodItem.update({
                            where: { id: existing!.id },
                            data,
                        });
                        updated++;
                    } else {
                        await prisma.foodItem.create({ data });
                        inserted++;
                    }
                } catch (err) {
                    skipped++;
                    console.error(
                        `  ✗ Failed: ${data.name}`,
                        err instanceof Error ? err.message : err,
                    );
                }
            }),
        );

        const done = Math.min(i + batchSize, rows.length);
        const pct = Math.round((done / rows.length) * 100);
        process.stdout.write(`\r  Progress: ${done}/${rows.length} (${pct}%)  `);
    }

    console.log(`\n\n✅ Seed complete:`);
    console.log(`   Inserted : ${inserted}`);
    console.log(`   Updated  : ${updated}`);
    console.log(`   Skipped  : ${skipped}`);
    console.log(`   Total    : ${inserted + updated}`);

    return { inserted, updated, skipped };
}

// Only auto-run when executed directly (npx tsx prisma/seed-openfoodfacts.ts),
// NOT when imported by a test — so importing this module opens no DB connection
// and writes nothing. Mirrors the require.main guard in seed-recipes.ts.
if (require.main === module) {
    seed()
        .catch((err) => {
            console.error('\n❌ Seed failed:', err);
            process.exit(1);
        })
        .finally(() => prisma.$disconnect());
}
