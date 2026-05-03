/**
 * /api/exercises-free
 *
 * Fetches 873 free exercises from the yuhonas/free-exercise-db GitHub repo.
 * Data is cached by Next.js ISR for 24 hours — zero cost, unlimited users.
 * Images served from GitHub CDN (static JPGs).
 *
 * Source: https://github.com/yuhonas/free-exercise-db (MIT License)
 */

import { NextRequest, NextResponse } from 'next/server';

// ─── Source Data Types ────────────────────────────────────────────────────────

interface RawExercise {
    id: string;
    name: string;
    force: string | null;
    level: 'beginner' | 'intermediate' | 'expert';
    mechanic: string | null;
    equipment: string | null;
    primaryMuscles: string[];
    secondaryMuscles: string[];
    instructions: string[];
    category: string;
    images: string[];
}

// ─── Our Normalized Exercise ──────────────────────────────────────────────────

export interface FreeExercise {
    id: string;
    name: string;
    bodyPart: string;
    target: string;
    equipment: string;
    level: string;
    category: string;
    imageUrl: string;
    imageUrl2: string;
    instructions: string[];
    secondaryMuscles: string[];
}

// ─── Muscle → BodyPart Mapping ────────────────────────────────────────────────

const MUSCLE_TO_BODY_PART: Record<string, string> = {
    abdominals: 'waist',
    obliques: 'waist',
    chest: 'chest',
    pectorals: 'chest',
    lats: 'back',
    'middle back': 'back',
    'lower back': 'back',
    traps: 'back',
    rhomboids: 'back',
    quadriceps: 'upper legs',
    hamstrings: 'upper legs',
    glutes: 'upper legs',
    calves: 'lower legs',
    'hip flexors': 'upper legs',
    adductors: 'upper legs',
    abductors: 'upper legs',
    biceps: 'upper arms',
    triceps: 'upper arms',
    shoulders: 'shoulders',
    'front deltoids': 'shoulders',
    'middle deltoids': 'shoulders',
    'rear deltoids': 'shoulders',
    deltoids: 'shoulders',
    forearms: 'lower arms',
    neck: 'neck',
    'cardiovascular system': 'cardio',
};

function muscleToBodyPart(muscles: string[]): string {
    for (const m of muscles) {
        const bp = MUSCLE_TO_BODY_PART[m.toLowerCase()];
        if (bp) return bp;
    }
    return 'full body';
}

// ─── Category → our category mapping ─────────────────────────────────────────

function getAppCategory(exercise: RawExercise): 'home' | 'gym' | 'cardio' {
    if (exercise.category === 'cardio') return 'cardio';
    if (!exercise.equipment || exercise.equipment === 'body only') return 'home';
    return 'gym';
}

// ─── Image URL builder ────────────────────────────────────────────────────────

const IMAGE_BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises';

function buildImageUrl(exercise: RawExercise, idx: number): string {
    if (exercise.images && exercise.images[idx]) {
        return `${IMAGE_BASE}/${exercise.images[idx]}`;
    }
    return '';
}

// ─── Transform raw → normalized ───────────────────────────────────────────────

function transform(raw: RawExercise): FreeExercise {
    return {
        id: raw.id,
        name: raw.name,
        bodyPart: raw.category === 'cardio' ? 'cardio' : muscleToBodyPart(raw.primaryMuscles),
        target: raw.primaryMuscles[0] ?? '',
        equipment: raw.equipment ?? 'body only',
        level: raw.level,
        category: raw.category,
        imageUrl: buildImageUrl(raw, 0),
        imageUrl2: buildImageUrl(raw, 1),
        instructions: raw.instructions,
        secondaryMuscles: raw.secondaryMuscles,
    };
}

// ─── Fetch & Cache ────────────────────────────────────────────────────────────

const DATA_URL =
    'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json';

let cache: FreeExercise[] | null = null;
let cacheTime = 0;
const CACHE_TTL = 1000 * 60 * 60 * 24; // 24 hours in-memory

async function getAllExercises(): Promise<FreeExercise[]> {
    if (cache && Date.now() - cacheTime < CACHE_TTL) return cache;

    const res = await fetch(DATA_URL, {
        next: { revalidate: 86400 }, // Next.js ISR: re-fetch max once per 24h
    });

    if (!res.ok) throw new Error('Failed to fetch exercises');

    const raw: RawExercise[] = await res.json();
    cache = raw.map(transform);
    cacheTime = Date.now();
    return cache;
}

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = req.nextUrl;
        const category = searchParams.get('category'); // 'home' | 'gym' | 'cardio'
        const bodyPart = searchParams.get('bodyPart');
        const level = searchParams.get('level');
        const q = searchParams.get('q')?.toLowerCase();
        const id = searchParams.get('id');
        const limit = Math.min(Math.max(parseInt(searchParams.get('limit') ?? '100'), 1), 200);
        const offset = Math.max(parseInt(searchParams.get('offset') ?? '0'), 0);

        const all = await getAllExercises();

        // ── Single exercise by ID ──────────────────────────────────────────
        if (id) {
            const found = all.find((ex) => ex.id === id);
            if (!found) return NextResponse.json({ error: 'Not found' }, { status: 404 });
            return NextResponse.json(found);
        }

        // ── Filter ────────────────────────────────────────────────────────
        let filtered = all;

        if (category) {
            if (category === 'home') {
                filtered = filtered.filter(
                    (ex) => !ex.equipment || ex.equipment === 'body only'
                );
            } else if (category === 'gym') {
                filtered = filtered.filter(
                    (ex) =>
                        ex.equipment &&
                        ex.equipment !== 'body only' &&
                        ex.category !== 'cardio'
                );
            } else if (category === 'cardio') {
                filtered = filtered.filter((ex) => ex.category === 'cardio');
            }
        }

        if (bodyPart) {
            filtered = filtered.filter((ex) =>
                ex.bodyPart.toLowerCase().includes(bodyPart.toLowerCase())
            );
        }

        if (level) {
            filtered = filtered.filter((ex) => ex.level === level);
        }

        if (q) {
            filtered = filtered.filter(
                (ex) =>
                    ex.name.toLowerCase().includes(q) ||
                    ex.target.toLowerCase().includes(q) ||
                    ex.bodyPart.toLowerCase().includes(q) ||
                    ex.equipment.toLowerCase().includes(q) ||
                    ex.secondaryMuscles.some((m) => m.toLowerCase().includes(q))
            );
        }

        // ── Paginate ─────────────────────────────────────────────────────
        const total = filtered.length;
        const page = filtered.slice(offset, offset + limit);

        return NextResponse.json(
            { total, count: page.length, offset, limit, exercises: page },
            {
                headers: {
                    'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=3600',
                },
            }
        );
    } catch (err) {
        console.error('[exercises-free] Error:', err);
        return NextResponse.json({ error: 'Failed to load exercises' }, { status: 500 });
    }
}
