import 'dotenv/config';

export interface Exercise {
    id: string;
    name: string;
    bodyPart: string;
    target: string;
    equipment: string;
    gifUrl: string;
    instructions: string[];
    secondaryMuscles: string[];
}

export const HOME_EQUIPMENT = ['body weight', 'band', 'resistance band', 'assisted'];
export const GYM_EQUIPMENT = [
    'barbell', 'dumbbell', 'cable', 'leverage machine', 'smith machine',
    'ez barbell', 'olympic barbell', 'kettlebell', 'trap bar', 'hammer',
    'medicine ball', 'bosu ball', 'stability ball', 'weighted',
];

export const CARDIO_BODY_PARTS = ['cardio'];
export const CARDIO_EQUIPMENT = [
    'elliptical machine', 'stationary bike', 'skierg machine',
    'sled machine', 'stepmill machine', 'upper body ergometer',
];

export const KEGEL_EXERCISES: Exercise[] = [
    {
        id: 'kegel-001', name: 'Basic Kegel Squeeze', bodyPart: 'pelvic floor', target: 'pelvic diaphragm',
        equipment: 'body weight', gifUrl: '',
        secondaryMuscles: ['transverse abdominis', 'inner thighs'],
        instructions: ['Find a comfortable position.', 'Identify pelvic floor.', 'Contract firmly.', 'Relax.', 'Repeat 10-15 times.'],
    },
    {
        id: 'kegel-002', name: 'Quick-Flick Kegels', bodyPart: 'pelvic floor', target: 'pelvic diaphragm',
        equipment: 'body weight', gifUrl: '',
        secondaryMuscles: ['levator ani'],
        instructions: ['Sit comfortably.', 'Rapidly contract.', 'Aim for 10 rapid contractions.', 'Rest.', 'Perform 3-5 rounds.'],
    },
    {
        id: 'kegel-003', name: 'Elevator Kegel', bodyPart: 'pelvic floor', target: 'pelvic diaphragm',
        equipment: 'body weight', gifUrl: '',
        secondaryMuscles: ['deep core stabilizers'],
        instructions: ['Imagine an elevator.', 'Gently lift to Floor 1.', 'Continue lifting.', 'Hold.', 'Slowly release.', 'Repeat 5-8 times.'],
    },
];

export const FALLBACK_EXERCISES: Exercise[] = [
    // Gym
    {
        id: 'gym-001', name: 'Barbell Bench Press', bodyPart: 'chest', target: 'pectoralis major',
        equipment: 'barbell', gifUrl: '',
        secondaryMuscles: ['triceps', 'anterior deltoid'],
        instructions: ['Lie flat on a bench.', 'Grip the bar shoulder-width.', 'Unrack and lower to chest.', 'Drive back up to lockout.', 'Perform 3-5 sets of 5-8 reps.'],
    },
    {
        id: 'gym-002', name: 'Barbell Deadlift', bodyPart: 'back', target: 'spine',
        equipment: 'barbell', gifUrl: '',
        secondaryMuscles: ['glutes', 'hamstrings', 'traps'],
        instructions: ['Stand with feet hip-width apart.', 'Hinge at hips, grip bar.', 'Set back flat, brace core.', 'Push floor away to stand.', 'Lock out at top.', 'Perform 3-5 sets.'],
    },
    {
        id: 'gym-003', name: 'Barbell Back Squat', bodyPart: 'upper legs', target: 'quadriceps',
        equipment: 'barbell', gifUrl: '',
        secondaryMuscles: ['glutes', 'hamstrings', 'calves'],
        instructions: ['Position barbell on upper back.', 'Stand shoulder-width apart.', 'Brace core and descend.', 'Drive hips up and back to stand.', 'Perform 3-5 sets.'],
    },
    {
        id: 'gym-004', name: 'Overhead Press', bodyPart: 'shoulders', target: 'delts',
        equipment: 'barbell', gifUrl: '',
        secondaryMuscles: ['triceps', 'upper chest'],
        instructions: ['Hold barbell at shoulder height.', 'Brace core.', 'Press overhead to lockout.', 'Lower with control.', 'Perform 3-5 sets.'],
    },
    {
        id: 'gym-005', name: 'Pull-Up', bodyPart: 'back', target: 'lats',
        equipment: 'leverage machine', gifUrl: '',
        secondaryMuscles: ['biceps', 'rear deltoid'],
        instructions: ['Hang from bar with overhand grip.', 'Retract shoulder blades.', 'Pull chest to bar.', 'Lower slowly.', 'Perform 3-4 sets.'],
    },
    {
        id: 'gym-006', name: 'Dumbbell Incline Press', bodyPart: 'chest', target: 'pectoralis major',
        equipment: 'dumbbell', gifUrl: '',
        secondaryMuscles: ['anterior deltoid', 'triceps'],
        instructions: ['Set bench to 30-45° incline.', 'Hold dumbbells at chest.', 'Press to full extension.', 'Lower with control.', 'Perform 3-4 sets.'],
    },
    {
        id: 'gym-007', name: 'Cable Lat Pulldown', bodyPart: 'back', target: 'lats',
        equipment: 'cable', gifUrl: '',
        secondaryMuscles: ['biceps', 'rhomboids'],
        instructions: ['Sit at cable machine, grip bar wide.', 'Lean back slightly.', 'Pull bar to upper chest.', 'Squeeze lats at bottom.', 'Perform 3-4 sets.'],
    },
    {
        id: 'gym-008', name: 'Dumbbell Lateral Raise', bodyPart: 'shoulders', target: 'delts',
        equipment: 'dumbbell', gifUrl: '',
        secondaryMuscles: ['traps', 'serratus anterior'],
        instructions: ['Stand with dumbbells at sides.', 'Slight bend in elbows.', 'Raise arms to shoulder height.', 'Lower slowly.', 'Perform 3-4 sets.'],
    },
    {
        id: 'gym-009', name: 'Barbell Row', bodyPart: 'back', target: 'lats',
        equipment: 'barbell', gifUrl: '',
        secondaryMuscles: ['biceps', 'rear deltoid', 'rhomboids'],
        instructions: ['Hinge forward ~45°.', 'Grip bar shoulder-width.', 'Row to lower chest.', 'Lower with control.', 'Perform 3-4 sets.'],
    },
    {
        id: 'gym-010', name: 'Leg Press', bodyPart: 'upper legs', target: 'quadriceps',
        equipment: 'leverage machine', gifUrl: '',
        secondaryMuscles: ['glutes', 'hamstrings', 'calves'],
        instructions: ['Sit in leg press machine.', 'Place feet shoulder-width on platform.', 'Lower weight until knees reach 90°.', 'Press to full extension.', 'Perform 3-4 sets.'],
    },
    {
        id: 'gym-011', name: 'Romanian Deadlift', bodyPart: 'upper legs', target: 'hamstrings',
        equipment: 'barbell', gifUrl: '',
        secondaryMuscles: ['glutes', 'lower back'],
        instructions: ['Hold bar at hip level.', 'Hinge at hips, keeping back flat.', 'Lower bar to mid-shin.', 'Drive hips forward to stand.', 'Perform 3-4 sets.'],
    },
    {
        id: 'gym-012', name: 'Dumbbell Bicep Curl', bodyPart: 'upper arms', target: 'biceps',
        equipment: 'dumbbell', gifUrl: '',
        secondaryMuscles: ['brachialis', 'brachioradialis'],
        instructions: ['Stand with dumbbells at sides.', 'Curl both arms up, supinating wrist.', 'Squeeze at top.', 'Lower with control.', 'Perform 3-4 sets.'],
    },
    {
        id: 'gym-013', name: 'Tricep Pushdown', bodyPart: 'upper arms', target: 'triceps',
        equipment: 'cable', gifUrl: '',
        secondaryMuscles: ['anconeus'],
        instructions: ['Stand at cable machine with rope or bar.', 'Elbows pinned to sides.', 'Push down to full extension.', 'Release slowly.', 'Perform 3-4 sets.'],
    },
    // Home
    {
        id: 'home-001', name: 'Push-Up', bodyPart: 'chest', target: 'pectoralis major',
        equipment: 'body weight', gifUrl: '',
        secondaryMuscles: ['triceps', 'anterior deltoid'],
        instructions: ['Hands slightly wider than shoulder-width.', 'Maintain rigid plank position.', 'Lower chest to floor.', 'Push back up.', 'Perform 15-25 reps.'],
    },
    {
        id: 'home-002', name: 'Bodyweight Squat', bodyPart: 'upper legs', target: 'quadriceps',
        equipment: 'body weight', gifUrl: '',
        secondaryMuscles: ['glutes', 'hamstrings'],
        instructions: ['Feet shoulder-width apart.', 'Raise arms forward for balance.', 'Descend until thighs are parallel.', 'Drive through heels to stand.', 'Perform 20-30 reps.'],
    },
    {
        id: 'home-003', name: 'Plank', bodyPart: 'waist', target: 'abs',
        equipment: 'body weight', gifUrl: '',
        secondaryMuscles: ['lower back', 'shoulders'],
        instructions: ['Forearms and toes on floor.', 'Body forms a straight line.', 'Brace core and glutes.', 'Hold for 30-60 seconds.', 'Repeat 3 rounds.'],
    },
    {
        id: 'home-004', name: 'Burpee', bodyPart: 'cardio', target: 'cardiovascular system',
        equipment: 'body weight', gifUrl: '',
        secondaryMuscles: ['chest', 'triceps', 'legs'],
        instructions: ['Start standing.', 'Drop hands to floor.', 'Jump feet back and perform push-up.', 'Jump feet forward.', 'Jump up with arms overhead.', 'Perform 10-15 reps.'],
    },
    {
        id: 'home-005', name: 'Lunges', bodyPart: 'upper legs', target: 'quadriceps',
        equipment: 'body weight', gifUrl: '',
        secondaryMuscles: ['glutes', 'hamstrings'],
        instructions: ['Stand tall with feet together.', 'Step one foot forward.', 'Lower back knee to floor.', 'Drive through front heel to return.', 'Perform 10-15 reps per leg.'],
    },
    {
        id: 'home-006', name: 'Pike Push-Up', bodyPart: 'shoulders', target: 'delts',
        equipment: 'body weight', gifUrl: '',
        secondaryMuscles: ['triceps', 'upper chest'],
        instructions: ['Form an inverted V (downward dog).', 'Bend elbows, lowering head toward floor.', 'Press back to start.', 'Keep hips high throughout.', 'Perform 8-12 reps.'],
    },
    {
        id: 'home-007', name: 'Mountain Climbers', bodyPart: 'waist', target: 'abs',
        equipment: 'body weight', gifUrl: '',
        secondaryMuscles: ['hip flexors', 'shoulders'],
        instructions: ['Start in high plank.', 'Drive one knee to chest.', 'Quickly switch legs.', 'Keep hips level.', 'Perform for 30-60 seconds.'],
    },
    {
        id: 'home-008', name: 'Tricep Dips', bodyPart: 'upper arms', target: 'triceps',
        equipment: 'body weight', gifUrl: '',
        secondaryMuscles: ['anterior deltoid', 'chest'],
        instructions: ['Place hands on chair edge behind you.', 'Slide off the seat.', 'Lower until elbows reach 90°.', 'Press back to start.', 'Perform 10-15 reps.'],
    },
    {
        id: 'home-009', name: 'Glute Bridge', bodyPart: 'upper legs', target: 'glutes',
        equipment: 'body weight', gifUrl: '',
        secondaryMuscles: ['hamstrings', 'lower back'],
        instructions: ['Lie on back, knees bent, feet flat.', 'Drive hips up, squeezing glutes.', 'Hold 2 seconds at top.', 'Lower with control.', 'Perform 15-20 reps.'],
    },
    {
        id: 'home-010', name: 'Superman', bodyPart: 'back', target: 'spine',
        equipment: 'body weight', gifUrl: '',
        secondaryMuscles: ['glutes', 'hamstrings'],
        instructions: ['Lie face down, arms extended overhead.', 'Raise arms, chest, and legs simultaneously.', 'Hold 2-3 seconds.', 'Lower with control.', 'Perform 12-15 reps.'],
    },
    // Cardio
    {
        id: 'cardio-001', name: 'Jumping Jacks', bodyPart: 'cardio', target: 'cardiovascular system',
        equipment: 'body weight', gifUrl: '',
        secondaryMuscles: ['shoulders', 'calves'],
        instructions: ['Stand feet together, arms at sides.', 'Jump spreading feet wide, raise arms overhead.', 'Jump back to start.', 'Perform 30-60 seconds.'],
    },
    {
        id: 'cardio-002', name: 'High Knees', bodyPart: 'cardio', target: 'cardiovascular system',
        equipment: 'body weight', gifUrl: '',
        secondaryMuscles: ['hip flexors', 'calves'],
        instructions: ['Stand feet hip-width apart.', 'Run in place lifting knees to hip height.', 'Pump arms in opposition.', 'Perform 30-45 seconds.'],
    },
    {
        id: 'cardio-003', name: 'Jump Rope', bodyPart: 'cardio', target: 'cardiovascular system',
        equipment: 'body weight', gifUrl: '',
        secondaryMuscles: ['calves', 'shoulders'],
        instructions: ['Stand feet together.', 'Rotate wrists to swing rope.', 'Hop lightly on balls of feet.', 'Perform 60 seconds, rest, repeat.'],
    },
    {
        id: 'cardio-004', name: 'Box Jump', bodyPart: 'cardio', target: 'cardiovascular system',
        equipment: 'body weight', gifUrl: '',
        secondaryMuscles: ['quads', 'glutes'],
        instructions: ['Stand in front of a sturdy box.', 'Bend knees and swing arms.', 'Jump explosively onto the box.', 'Land softly with knees slightly bent.', 'Step down and repeat.', 'Perform 8-12 reps.'],
    },
];

// ── wger.de Free API ──────────────────────────────────────────────────────────
// wger.de is a free, open-source workout manager with a public REST API.
// No API key required. 800+ exercises with images, muscles, and instructions.
// Docs: https://wger.de/api/v2/

const WGER_BASE = 'https://wger.de/api/v2';

// Maps wger category names to our bodyPart values
const WGER_CATEGORY_TO_BODY_PART: Record<string, string> = {
    Abs: 'waist',
    Arms: 'upper arms',
    Legs: 'upper legs',
    Chest: 'chest',
    Back: 'back',
    Shoulders: 'shoulders',
    Calves: 'lower legs',
    Glutes: 'upper legs',
    Biceps: 'upper arms',
    Triceps: 'upper arms',
    Cardio: 'cardio',
};

// Maps wger equipment names to our format
function normalizeWgerEquipment(name: string): string {
    const n = (name || '').toLowerCase().trim();
    if (n === 'none' || n === '') return 'body weight';
    if (n.includes('barbell') || n === 'sz-bar') return 'barbell';
    if (n === 'dumbbell' || n === 'dumbbells') return 'dumbbell';
    if (n === 'kettlebell') return 'kettlebell';
    if (n.includes('cable') || n.includes('machine')) return 'cable';
    if (n.includes('pull-up') || n === 'pull-up bar') return 'leverage machine';
    if (n.includes('band') || n.includes('resistance')) return 'band';
    return n;
}

// Determines category from bodyPart and equipment
export function deriveCategory(bodyPart: string, equipment: string): string {
    const bp = bodyPart.toLowerCase();
    const eq = equipment.toLowerCase();
    if (bp === 'pelvic floor' || bp.includes('pelvic')) return 'kegel';
    if (bp === 'cardio' || CARDIO_EQUIPMENT.includes(eq)) return 'cardio';
    if (HOME_EQUIPMENT.includes(eq)) return 'home';
    if (GYM_EQUIPMENT.includes(eq)) return 'gym';
    return 'gym'; // default
}

// ── wger response interfaces ──────────────────────────────────────────────────

export interface WgerExerciseInfo {
    id: number;
    // Top-level name is already in the requested language when using ?language=2
    name: string;
    category: { id: number; name: string };
    muscles: { id: number; name_en: string; is_front: boolean }[];
    muscles_secondary: { id: number; name_en: string }[];
    equipment: { id: number; name: string }[];
    translations: {
        name: string;
        // wger v2 returns language as an integer ID (2 = English),
        // but some endpoints may return the full object — handle both.
        language: number | { id: number; short_name?: string };
        description: string;
    }[];
    images: { id: number; image: string; is_main: boolean }[];
}

interface WgerSearchResult {
    suggestions: {
        value: string;
        data: {
            id: number;
            base_id: number;
            name: string;
            category: string;
            image: string | null;
            image_thumbnail: string | null;
        };
    }[];
}

// ── Mapping helpers ───────────────────────────────────────────────────────────

// Resolve wger language field which can be an int (2) or an object ({id:2})
function isEnglishTranslation(lang: number | { id: number; short_name?: string }): boolean {
    if (typeof lang === 'number') return lang === 2;
    return lang.id === 2 || lang.short_name === 'en';
}

// Strip HTML tags from wger's rich-text description. Applied repeatedly until
// the string stops changing: a single `.replace(/<[^>]+>/g, '')` pass is unsafe
// because overlapping/nested constructs like `<scr<b>ipt>` leave a live tag
// behind (String.replace does not re-scan its own output). Looping to a fixed
// point closes the incomplete-multi-character-sanitization hole (CodeQL
// js/incomplete-multi-character-sanitization).
function stripHtmlTags(input: string): string {
    let prev = input;
    let next = prev.replace(/<[^>]+>/g, '');
    while (next !== prev) {
        prev = next;
        next = next.replace(/<[^>]+>/g, '');
    }
    return next;
}

export function mapWgerToExercise(info: WgerExerciseInfo): Exercise | null {
    // Find the English translation in the translations array.
    // wger v2 API returns language as a plain integer (2 = English).
    const engTrans = info.translations.find(t => isEnglishTranslation(t.language));

    // Fall back to the top-level name (already in the requested language
    // when the endpoint was called with ?language=2).
    const name = engTrans?.name?.trim() || info.name?.trim();
    if (!name) return null;

    const description = engTrans?.description ?? '';
    const bodyPart = WGER_CATEGORY_TO_BODY_PART[info.category.name] ?? info.category.name.toLowerCase();
    const primaryMuscle = info.muscles[0]?.name_en ?? info.category.name;
    const equipName = info.equipment[0]?.name ?? 'none';
    const imageUrl = info.images.find(img => img.is_main)?.image ?? (info.images[0]?.image ?? '');

    return {
        id: `wger-${info.id}`,
        name,
        bodyPart,
        target: primaryMuscle,
        equipment: normalizeWgerEquipment(equipName),
        gifUrl: imageUrl,
        instructions: description
            ? [stripHtmlTags(description).trim()]
            : [],
        secondaryMuscles: info.muscles_secondary.map(m => m.name_en),
    };
}

// ── Live search ───────────────────────────────────────────────────────────────

export async function searchExercisesLive(query: string): Promise<Exercise[]> {
    const timeout = AbortSignal.timeout(6000);

    if (!query) {
        try {
            const res = await fetch(
                `${WGER_BASE}/exerciseinfo/?format=json&language=2&limit=50`,
                { headers: { Accept: 'application/json' }, signal: timeout },
            );
            if (res.ok) {
                const data = await res.json() as { results: WgerExerciseInfo[] };
                const mapped = data.results
                    .map(mapWgerToExercise)
                    .filter((e): e is Exercise => e !== null);
                if (mapped.length > 0) return mapped;
            }
        } catch {
            // fall through
        }
        return [...FALLBACK_EXERCISES, ...KEGEL_EXERCISES];
    }

    // Full-text search via wger search endpoint
    try {
        const res = await fetch(
            `${WGER_BASE}/exercise/search/?term=${encodeURIComponent(query)}&language=english&format=json`,
            { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(6000) },
        );
        if (res.ok) {
            const data = await res.json() as WgerSearchResult;
            if (data.suggestions.length > 0) {
                return data.suggestions.map(s => ({
                    id: `wger-${s.data.base_id}`,
                    name: s.data.name,
                    bodyPart: WGER_CATEGORY_TO_BODY_PART[s.data.category] ?? s.data.category.toLowerCase(),
                    target: s.data.category,
                    equipment: 'body weight',
                    gifUrl: s.data.image ?? '',
                    instructions: [],
                    secondaryMuscles: [],
                }));
            }
        }
    } catch {
        // fall through
    }

    return searchExercises(query);
}

// ── Fetch single exercise by ID ───────────────────────────────────────────────

export async function fetchExerciseById(id: string): Promise<Exercise | undefined> {
    const fallback = getExerciseById(id);
    if (fallback) return fallback;

    const wgerId = id.startsWith('wger-') ? id.slice(5) : id;
    try {
        const res = await fetch(
            `${WGER_BASE}/exerciseinfo/${wgerId}/?format=json`,
            { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(6000) },
        );
        if (res.ok) {
            const info = await res.json() as WgerExerciseInfo;
            return mapWgerToExercise(info) ?? undefined;
        }
    } catch {
        // fall through
    }
    return undefined;
}

// ── Local helpers (unchanged) ─────────────────────────────────────────────────

export type ExerciseCategory = 'home' | 'gym' | 'cardio' | 'kegel';

export function getExercisesByCategory(category: ExerciseCategory, limit = 50): Exercise[] {
    if (category === 'kegel') return KEGEL_EXERCISES;

    return FALLBACK_EXERCISES.filter((ex) => {
        if (category === 'home') return HOME_EQUIPMENT.includes(ex.equipment);
        if (category === 'gym') return GYM_EQUIPMENT.includes(ex.equipment);
        if (category === 'cardio')
            return CARDIO_BODY_PARTS.includes(ex.bodyPart) || CARDIO_EQUIPMENT.includes(ex.equipment);
        return false;
    }).slice(0, limit);
}

export function searchExercises(query: string, category?: ExerciseCategory): Exercise[] {
    const pool = category ? getExercisesByCategory(category, 200) : [...FALLBACK_EXERCISES, ...KEGEL_EXERCISES];
    const q = query.toLowerCase().trim();
    if (!q) return pool;
    return pool.filter(
        (ex) =>
            ex.name.toLowerCase().includes(q) ||
            ex.bodyPart.toLowerCase().includes(q) ||
            ex.target.toLowerCase().includes(q) ||
            ex.equipment.toLowerCase().includes(q),
    );
}

export function getExerciseById(id: string): Exercise | undefined {
    return [...FALLBACK_EXERCISES, ...KEGEL_EXERCISES].find((ex) => ex.id === id);
}

export const BODY_PART_LABELS: Record<string, string> = {
    back: 'Back',
    cardio: 'Cardio',
    chest: 'Chest',
    'lower arms': 'Forearms',
    'lower legs': 'Calves',
    neck: 'Neck',
    shoulders: 'Shoulders',
    'upper arms': 'Arms',
    'upper legs': 'Legs',
    waist: 'Core / Abs',
    'pelvic floor': 'Pelvic Floor',
};
