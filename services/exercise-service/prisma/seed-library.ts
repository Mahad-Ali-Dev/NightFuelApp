/**
 * seed-library.ts
 *
 * Populates the library_exercises table with 800+ exercises from wger.de,
 * a free open-source fitness REST API that requires no API key.
 *
 * Run with:
 *   npm run db:seed
 *
 * Prerequisites:
 *   1. Apply the migration:  npm run db:migrate:deploy
 *   2. Regenerate client:    npm run db:generate
 *   3. Run this seed:        npm run db:seed
 */

import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma';
import {
    mapWgerToExercise,
    deriveCategory,
    FALLBACK_EXERCISES,
    KEGEL_EXERCISES,
    HOME_EQUIPMENT,
    GYM_EQUIPMENT,
    CARDIO_BODY_PARTS,
    type WgerExerciseInfo,
} from '../src/exercisedb';

const prisma = new PrismaClient();
const WGER_BASE = 'https://wger.de/api/v2';
const BATCH_DELAY_MS = 300; // Be polite to the free API

// ── Fetch helpers ─────────────────────────────────────────────────────────────

async function fetchPage(offset: number, limit = 100): Promise<{ count: number; next: string | null; results: WgerExerciseInfo[] }> {
    const url = `${WGER_BASE}/exerciseinfo/?format=json&language=2&limit=${limit}&offset=${offset}`;
    const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`wger API error: ${res.status} ${res.statusText}`);
    return res.json();
}

async function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Seeding ───────────────────────────────────────────────────────────────────

async function seedWgerExercises() {
    console.log('📡 Fetching exercises from wger.de (free, no API key)...\n');

    let offset = 0;
    const limit = 100;
    let totalFetched = 0;
    let totalSeeded = 0;
    let totalSkipped = 0;

    // First page to discover total count
    const firstPage = await fetchPage(0, limit);
    const totalAvailable = firstPage.count;
    console.log(`   Found ${totalAvailable} exercises on wger.de\n`);

    const allPages: WgerExerciseInfo[][] = [firstPage.results];

    // Fetch remaining pages
    while (offset + limit < totalAvailable) {
        offset += limit;
        await sleep(BATCH_DELAY_MS);
        process.stdout.write(`   Fetching offset ${offset}/${totalAvailable}...`);
        const page = await fetchPage(offset, limit);
        allPages.push(page.results);
        process.stdout.write(` got ${page.results.length}\n`);
    }

    const allExercises = allPages.flat();
    console.log(`\n   Downloaded ${allExercises.length} exercise records. Seeding DB...\n`);

    // Map to Exercise objects, skipping any without an English name
    let noEnglishName = 0;
    const mapped: { exercise: ReturnType<typeof mapWgerToExercise> & {}; category: string }[] = [];
    for (const info of allExercises) {
        const exercise = mapWgerToExercise(info);
        if (!exercise) { noEnglishName++; continue; }
        mapped.push({ exercise, category: deriveCategory(exercise.bodyPart, exercise.equipment) });
    }

    // Upsert in parallel batches of 20 for speed
    const CHUNK = 20;
    for (let i = 0; i < mapped.length; i += CHUNK) {
        const chunk = mapped.slice(i, i + CHUNK);
        const results = await Promise.allSettled(
            chunk.map(({ exercise, category }) =>
                prisma.libraryExercise.upsert({
                    where: { name: exercise.name },
                    update: {
                        muscleGroup: exercise.target || exercise.bodyPart,
                        equipment: exercise.equipment,
                        instructions: exercise.instructions.join('\n') || null,
                        imageUrl: exercise.gifUrl || null,
                        difficulty: 'intermediate',
                        bodyPart: exercise.bodyPart,
                        category,
                    },
                    create: {
                        name: exercise.name,
                        muscleGroup: exercise.target || exercise.bodyPart,
                        equipment: exercise.equipment,
                        instructions: exercise.instructions.join('\n') || null,
                        imageUrl: exercise.gifUrl || null,
                        difficulty: 'intermediate',
                        bodyPart: exercise.bodyPart,
                        category,
                    },
                }),
            ),
        );
        for (let j = 0; j < results.length; j++) {
            const r = results[j]!;
            if (r.status === 'fulfilled') {
                totalSeeded++;
            } else {
                const err: any = r.reason;
                if (err?.code !== 'P2002') {
                    console.warn(`   ⚠  "${chunk[j]!.exercise.name}": ${err?.message ?? err}`);
                }
                totalSkipped++;
            }
        }
    }

    if (noEnglishName > 0) {
        console.log(`   ℹ  ${noEnglishName} exercises had no English name and were skipped`);
    }

    return { totalSeeded, totalSkipped };
}

async function seedFallbackExercises() {
    console.log('💪 Seeding fallback exercises (gym/home/cardio)...');
    let count = 0;

    for (const ex of FALLBACK_EXERCISES) {
        let category: string;
        if (CARDIO_BODY_PARTS.includes(ex.bodyPart)) {
            category = 'cardio';
        } else if (HOME_EQUIPMENT.includes(ex.equipment)) {
            category = 'home';
        } else if (GYM_EQUIPMENT.includes(ex.equipment)) {
            category = 'gym';
        } else {
            category = 'gym';
        }

        try {
            await prisma.libraryExercise.upsert({
                where: { name: ex.name },
                update: {
                    muscleGroup: ex.target || ex.bodyPart,
                    equipment: ex.equipment,
                    instructions: ex.instructions.join('\n'),
                    imageUrl: ex.gifUrl || null,
                    difficulty: 'intermediate',
                    bodyPart: ex.bodyPart,
                    category,
                },
                create: {
                    name: ex.name,
                    muscleGroup: ex.target || ex.bodyPart,
                    equipment: ex.equipment,
                    instructions: ex.instructions.join('\n'),
                    imageUrl: ex.gifUrl || null,
                    difficulty: 'intermediate',
                    bodyPart: ex.bodyPart,
                    category,
                },
            });
            count++;
        } catch {
            // skip duplicates
        }
    }

    console.log(`   ✓ ${count} fallback exercises seeded\n`);
}

async function seedKegelExercises() {
    console.log('🧘 Seeding Kegel exercises...');
    let count = 0;

    for (const ex of KEGEL_EXERCISES) {
        try {
            await prisma.libraryExercise.upsert({
                where: { name: ex.name },
                update: {
                    muscleGroup: ex.target,
                    equipment: ex.equipment,
                    instructions: ex.instructions.join('\n'),
                    imageUrl: null,
                    difficulty: 'beginner',
                    bodyPart: ex.bodyPart,
                    category: 'kegel',
                },
                create: {
                    name: ex.name,
                    muscleGroup: ex.target,
                    equipment: ex.equipment,
                    instructions: ex.instructions.join('\n'),
                    imageUrl: null,
                    difficulty: 'beginner',
                    bodyPart: ex.bodyPart,
                    category: 'kegel',
                },
            });
            count++;
        } catch {
            // skip duplicates
        }
    }

    console.log(`   ✓ ${count} Kegel exercises seeded\n`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
    console.log('═══════════════════════════════════════════════════');
    console.log('   NightFuel Exercise Library Seeder');
    console.log('   Source: wger.de (free, open-source, no API key)');
    console.log('═══════════════════════════════════════════════════\n');

    try {
        // Seed wger exercises first (may fail if offline — that's ok)
        const { totalSeeded, totalSkipped } = await seedWgerExercises();
        console.log(`   ✓ wger: ${totalSeeded} seeded, ${totalSkipped} skipped\n`);
    } catch (err: any) {
        console.warn(`   ⚠  Could not reach wger.de: ${err.message}`);
        console.warn('   Falling back to local exercises only.\n');
    }

    // Always seed local fallbacks + kegel (offline-safe)
    await seedFallbackExercises();
    await seedKegelExercises();

    // Print summary
    const total = await prisma.libraryExercise.count();
    console.log('═══════════════════════════════════════════════════');
    console.log(`   ✅  Library seeding complete!`);
    console.log(`   📚  Total exercises in DB: ${total}`);
    console.log('═══════════════════════════════════════════════════\n');
}

main()
    .catch((e) => {
        console.error('\n❌  Seeding failed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
