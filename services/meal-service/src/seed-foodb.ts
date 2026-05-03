/**
 * seed-foodb.ts — NightFuel FoodDB Seeder
 * ─────────────────────────────────────────
 * Reads the JSON produced by scripts/extract-foodb.py and upserts
 * 760 scientifically-validated whole food items into the food_items table.
 *
 * Usage (from services/meal-service/):
 *   npx ts-node src/seed-foodb.ts
 *
 * Or via npm script:
 *   npm run seed:foodb
 *
 * Prereqs:
 *   1. Run: python scripts/extract-foodb.py <foodb.zip> scripts/foodb-foods.json
 *   2. Set MEAL_DATABASE_URL and MEAL_DIRECT_URL in .env
 *   3. Run: npx prisma db push  (to apply schema changes)
 */

import { PrismaClient } from './generated/prisma';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

// ── Types ─────────────────────────────────────────────────────────────────────

interface FoodbFood {
    name: string;
    scientific: string | null;
    foodGroup: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number;
    servingSize: string;
    isVegan: boolean;
    isGlutenFree: boolean;
    isHalal: boolean;
    region: string | null;
    cuisineTags: string[];
    source: string;
    fooDbId: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Load the JSON file produced by extract-foodb.py.
 * Resolves relative to this file's location (or the scripts/ sibling directory).
 */
function loadFoodbJson(): FoodbFood[] {
    const candidates = [
        path.resolve(__dirname, '../scripts/foodb-foods.json'),
        path.resolve(process.cwd(), 'scripts/foodb-foods.json'),
        path.resolve(process.cwd(), 'foodb-foods.json'),
    ];

    for (const p of candidates) {
        if (fs.existsSync(p)) {
            console.log(`📂 Loading FoodDB JSON from: ${p}`);
            return JSON.parse(fs.readFileSync(p, 'utf-8')) as FoodbFood[];
        }
    }

    throw new Error(
        `foodb-foods.json not found. Run:\n` +
        `  python scripts/extract-foodb.py <foodb.zip> scripts/foodb-foods.json`
    );
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function seed() {
    const foods = loadFoodbJson();
    console.log(`\n🥗 FoodDB Seeder — ${foods.length} foods to import\n`);

    let inserted  = 0;
    let updated   = 0;
    let errored   = 0;
    const batchSize = 50;

    for (let i = 0; i < foods.length; i += batchSize) {
        const batch = foods.slice(i, i + batchSize);

        await Promise.allSettled(
            batch.map(async (f) => {
                try {
                    const existing = await prisma.foodItem.findFirst({
                        where: { name: { equals: f.name, mode: 'insensitive' } },
                        select: { id: true },
                    });

                    const data = {
                        name:         f.name,
                        calories:     f.calories,
                        protein:      f.protein,
                        carbs:        f.carbs,
                        fat:          f.fat,
                        fiber:        f.fiber,
                        sugar:        0,
                        sodiumMg:     0,
                        servingSize:  f.servingSize,
                        isVegan:      f.isVegan,
                        isGlutenFree: f.isGlutenFree,
                        isHalal:      f.isHalal,
                        region:       f.region,
                        cuisineTags:  f.cuisineTags,
                        source:       'FOODB',
                        foodGroup:    f.foodGroup,
                    };

                    if (existing) {
                        await prisma.foodItem.update({
                            where: { id: existing.id },
                            data,
                        });
                        updated++;
                    } else {
                        await prisma.foodItem.create({ data });
                        inserted++;
                    }
                } catch (err) {
                    errored++;
                    console.error(`  ✗ Failed: ${f.name}`, err instanceof Error ? err.message : err);
                }
            })
        );

        const done = Math.min(i + batchSize, foods.length);
        const pct  = Math.round((done / foods.length) * 100);
        process.stdout.write(`\r  Progress: ${done}/${foods.length} (${pct}%)  `);
    }

    console.log(`\n\n✅ Seed complete:`);
    console.log(`   Inserted : ${inserted}`);
    console.log(`   Updated  : ${updated}`);
    console.log(`   Errors   : ${errored}`);
    console.log(`   Total    : ${inserted + updated}`);
}

seed()
    .catch((err) => {
        console.error('\n❌ Seed failed:', err);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
