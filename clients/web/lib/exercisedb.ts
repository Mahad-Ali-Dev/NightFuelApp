/**
 * ExerciseDB API Client
 * Docs: https://github.com/ExerciseDB/exercisedb-api
 * Hosted via RapidAPI: https://exercisedb.p.rapidapi.com
 *
 * Set NEXT_PUBLIC_EXERCISEDB_KEY in .env.local to enable live data.
 * Without a key, the library returns curated fallback exercises.
 */

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

// ─── Category Mappings ──────────────────────────────────────────────────────

/** Equipment types considered "home-friendly" (body weight only) */
export const HOME_EQUIPMENT = ['body weight', 'band', 'resistance band', 'assisted'];

/** Equipment types for gym workouts */
export const GYM_EQUIPMENT = [
    'barbell', 'dumbbell', 'cable', 'leverage machine', 'smith machine',
    'ez barbell', 'olympic barbell', 'kettlebell', 'trap bar', 'hammer',
    'medicine ball', 'bosu ball', 'stability ball', 'weighted',
];

/** BodyPart values that map to "Cardio" category */
export const CARDIO_BODY_PARTS = ['cardio'];

/** Equipment for cardio */
export const CARDIO_EQUIPMENT = [
    'elliptical machine', 'stationary bike', 'skierg machine',
    'sled machine', 'stepmill machine', 'upper body ergometer',
];

/** Kegel exercises (custom, not from ExerciseDB) */
export const KEGEL_EXERCISES: Exercise[] = [
    {
        id: 'kegel-001',
        name: 'Basic Kegel Squeeze',
        bodyPart: 'pelvic floor',
        target: 'pelvic diaphragm',
        equipment: 'body weight',
        gifUrl: '',
        secondaryMuscles: ['transverse abdominis', 'inner thighs'],
        instructions: [
            'Find a comfortable position — sitting, lying, or standing.',
            'Identify your pelvic floor muscles (the ones you use to stop urination mid-stream).',
            'Contract these muscles firmly and hold for 3–5 seconds.',
            'Completely relax the muscles for an equal amount of time.',
            'Repeat 10–15 times per set. Perform 3 sets daily.',
            'Keep your abdomen, thighs, and buttocks relaxed throughout.',
        ],
    },
    {
        id: 'kegel-002',
        name: 'Quick-Flick Kegels',
        bodyPart: 'pelvic floor',
        target: 'pelvic diaphragm',
        equipment: 'body weight',
        gifUrl: '',
        secondaryMuscles: ['levator ani'],
        instructions: [
            'Sit comfortably and relax your entire body.',
            'Rapidly contract and release your pelvic floor muscles in quick pulses.',
            'Aim for 10 rapid contractions in about 5 seconds.',
            'Rest for 5 seconds after each set of 10.',
            'Perform 3–5 rounds, once or twice daily.',
            'This trains fast-twitch fibers for urgency control.',
        ],
    },
    {
        id: 'kegel-003',
        name: 'Elevator Kegel (Progressive Hold)',
        bodyPart: 'pelvic floor',
        target: 'pelvic diaphragm',
        equipment: 'body weight',
        gifUrl: '',
        secondaryMuscles: ['deep core stabilizers'],
        instructions: [
            'Imagine an elevator in your pelvic region with 5 floors.',
            'Gently lift (contract) to "Floor 1" and hold 2 seconds.',
            'Continue lifting to "Floor 2", hold 2 seconds. Repeat to Floor 5.',
            'At the top, hold for 5 full seconds.',
            'Slowly release, floor by floor, back to the ground level.',
            'Perform 5–8 repetitions. Do not push down when releasing.',
        ],
    },
    {
        id: 'kegel-004',
        name: 'Bridge with Kegel',
        bodyPart: 'pelvic floor',
        target: 'glutes',
        equipment: 'body weight',
        gifUrl: '',
        secondaryMuscles: ['pelvic diaphragm', 'hamstrings', 'lower back'],
        instructions: [
            'Lie on your back with knees bent, feet flat on the floor, hip-width apart.',
            'Before lifting, activate your pelvic floor (basic kegel squeeze).',
            'While maintaining the kegel contraction, drive through your heels and lift your hips.',
            'Hold the bridge position with kegel engaged for 3–5 seconds.',
            'Slowly lower your hips while maintaining the kegel squeeze.',
            'Release the kegel at the bottom. Perform 10–15 reps.',
        ],
    },
    {
        id: 'kegel-005',
        name: 'Deep Squat Kegel',
        bodyPart: 'pelvic floor',
        target: 'hip flexors',
        equipment: 'body weight',
        gifUrl: '',
        secondaryMuscles: ['pelvic diaphragm', 'inner thighs', 'glutes'],
        instructions: [
            'Stand with feet shoulder-width apart, toes pointed slightly outward.',
            'Lower into a deep squat, thighs parallel to (or below) the floor.',
            'Engage your pelvic floor while in the squat position.',
            'Hold the contracted position for 3 seconds while breathing normally.',
            'Release the kegel contraction at the bottom of the squat.',
            'Rise back to standing. Perform 8–12 reps.',
        ],
    },
];

// ─── Fallback Data (used when ExerciseDB API key is not set) ─────────────────

export const FALLBACK_EXERCISES: Exercise[] = [
    // ── GYM ──────────────────────────────────────────────────────────────────
    {
        id: 'gym-001', name: 'Barbell Bench Press', bodyPart: 'chest', target: 'pectoralis major',
        equipment: 'barbell',
        gifUrl: 'https://v2.exercisedb.io/image/9mTHRqN7IkBwRL',
        secondaryMuscles: ['triceps', 'anterior deltoid'],
        instructions: [
            'Lie flat on a bench with eyes directly under the barbell.',
            'Grip the bar slightly wider than shoulder-width, thumbs wrapped around.',
            'Unrack the bar, positioning it directly above your chest.',
            'Lower the bar in a controlled arc to your mid-chest. Touch lightly.',
            'Drive the bar back up to the starting position, squeezing your chest.',
            'Perform 3–5 sets of 5–8 reps.',
        ],
    },
    {
        id: 'gym-002', name: 'Barbell Deadlift', bodyPart: 'back', target: 'spine',
        equipment: 'barbell',
        gifUrl: 'https://v2.exercisedb.io/image/ykJRvv97YJjM5r',
        secondaryMuscles: ['glutes', 'hamstrings', 'traps', 'forearms'],
        instructions: [
            'Stand with feet hip-width apart, bar over mid-foot.',
            'Hinge at the hips and bend knees, gripping bar just outside your legs.',
            'Set your back flat, chest up, creating tension in your lats.',
            'Push the floor away with your legs while keeping the bar against your body.',
            'Lock out at the top by squeezing glutes. Hinge back down under control.',
            'Perform 3–5 sets of 3–5 reps.',
        ],
    },
    {
        id: 'gym-003', name: 'Barbell Back Squat', bodyPart: 'upper legs', target: 'quadriceps',
        equipment: 'barbell',
        gifUrl: 'https://v2.exercisedb.io/image/6IxvNfXHHDkmFj',
        secondaryMuscles: ['glutes', 'hamstrings', 'calves', 'core'],
        instructions: [
            'Position the barbell on your upper traps (high bar) or rear delts (low bar).',
            'Stand with feet shoulder-width apart, toes slightly flared.',
            'Breathe deep, brace your core, then initiate the squat by pushing knees out.',
            'Descend until hips are at or below parallel.',
            'Drive through the entire foot to stand, keeping chest tall.',
            'Perform 3–5 sets of 5–8 reps.',
        ],
    },
    {
        id: 'gym-004', name: 'Overhead Press (OHP)', bodyPart: 'shoulders', target: 'delts',
        equipment: 'barbell',
        gifUrl: 'https://v2.exercisedb.io/image/PgpuJOIBs5Gcr5',
        secondaryMuscles: ['triceps', 'upper chest', 'traps'],
        instructions: [
            'Stand with the barbell at collarbone height, grip slightly wider than shoulder-width.',
            'Tuck your elbows slightly in front of the bar.',
            'Take a deep breath and brace your core and glutes.',
            'Press the bar overhead in a vertical path, tucking your head back slightly.',
            'At the top, shrug your shoulders up to lock out.',
            'Lower under control. Perform 3–5 sets of 6–10 reps.',
        ],
    },
    {
        id: 'gym-005', name: 'Pull-Up / Chin-Up', bodyPart: 'back', target: 'lats',
        equipment: 'leverage machine',
        gifUrl: 'https://v2.exercisedb.io/image/d9Ij7z-4X5LfSm',
        secondaryMuscles: ['biceps', 'rear deltoid', 'rhomboids'],
        instructions: [
            'Hang from a bar with an overhand (pull-up) or underhand (chin-up) grip.',
            'Retract and depress your scapulae (pull shoulder blades down and back).',
            'Drive your elbows towards your hips as you pull your chin above the bar.',
            'Lower slowly with full control, achieving a dead hang at the bottom.',
            'Avoid swinging or kipping. Perform 3–4 sets of 5–10 reps.',
        ],
    },
    {
        id: 'gym-006', name: 'Dumbbell Incline Press', bodyPart: 'chest', target: 'pectoralis major',
        equipment: 'dumbbell',
        gifUrl: 'https://v2.exercisedb.io/image/nN4A7m8XRs5Nbi',
        secondaryMuscles: ['anterior deltoid', 'triceps'],
        instructions: [
            'Set a bench to 30–45 degrees incline.',
            'Hold a dumbbell in each hand, arms extended above your chest.',
            'Lower the dumbbells to the sides of your upper chest with elbows at 45°.',
            'Press back to the top, not locking out fully to maintain tension.',
            'Perform 3–4 sets of 8–12 reps.',
        ],
    },
    {
        id: 'gym-007', name: 'Cable Lat Pulldown', bodyPart: 'back', target: 'lats',
        equipment: 'cable',
        gifUrl: 'https://v2.exercisedb.io/image/9AIR4cV0BX17xH',
        secondaryMuscles: ['biceps', 'rhomboids', 'teres major'],
        instructions: [
            'Sit at the lat pulldown machine, thighs secured under the pad.',
            'Grip the bar wider than shoulder-width with an overhand grip.',
            'Lean back slightly and pull the bar to your upper chest.',
            'Squeeze your lats at the bottom and control the return.',
            'Perform 3–4 sets of 10–15 reps.',
        ],
    },
    {
        id: 'gym-008', name: 'Dumbbell Lateral Raise', bodyPart: 'shoulders', target: 'delts',
        equipment: 'dumbbell',
        gifUrl: 'https://v2.exercisedb.io/image/6vJV5K9RQ7m9Gl',
        secondaryMuscles: ['traps', 'serratus anterior'],
        instructions: [
            'Stand with a dumbbell in each hand at your sides.',
            'With a slight bend in the elbows, raise your arms out to the sides.',
            'Stop when your arms are parallel to the floor (T-shape).',
            'Lower slowly under control — the negative is key.',
            'Perform 3–4 sets of 12–20 reps with a light-moderate weight.',
        ],
    },
    // ── HOME ─────────────────────────────────────────────────────────────────
    {
        id: 'home-001', name: 'Push-Up', bodyPart: 'chest', target: 'pectoralis major',
        equipment: 'body weight',
        gifUrl: 'https://v2.exercisedb.io/image/f_BJl1Y7kfZFmT',
        secondaryMuscles: ['triceps', 'anterior deltoid', 'core'],
        instructions: [
            'Place your hands slightly wider than shoulder-width on the floor.',
            'Maintain a rigid plank position — no sagging hips or raised glutes.',
            'Lower your chest to just above the floor, elbows at 45 degrees.',
            'Push back up explosively while keeping your core braced.',
            'Perform 3 sets of 15–25 reps, or go to near-failure.',
        ],
    },
    {
        id: 'home-002', name: 'Bodyweight Squat', bodyPart: 'upper legs', target: 'quadriceps',
        equipment: 'body weight',
        gifUrl: 'https://v2.exercisedb.io/image/qUkHh5tVoC5pXh',
        secondaryMuscles: ['glutes', 'hamstrings', 'calves'],
        instructions: [
            'Stand with feet shoulder-width apart, toes slightly out.',
            'Raise your arms to parallel for counterbalance.',
            'Break at the hips first, then bend the knees.',
            'Descend until thighs are parallel or lower.',
            'Drive through heels to return to standing.',
            'Perform 3 sets of 20–30 reps.',
        ],
    },
    {
        id: 'home-003', name: 'Plank', bodyPart: 'waist', target: 'abs',
        equipment: 'body weight',
        gifUrl: 'https://v2.exercisedb.io/image/LM3i5bVfFPjdKj',
        secondaryMuscles: ['lower back', 'shoulders', 'glutes'],
        instructions: [
            'Place forearms on the floor, elbows under shoulders.',
            'Extend legs behind you, resting on toes.',
            'Form a straight line from head to heels — no sagging or piking.',
            'Squeeze your abs, glutes, and quads throughout.',
            'Hold for 30–60 seconds. Rest 30 seconds. Perform 3 rounds.',
        ],
    },
    {
        id: 'home-004', name: 'Burpee', bodyPart: 'cardio', target: 'cardiovascular system',
        equipment: 'body weight',
        gifUrl: 'https://v2.exercisedb.io/image/nq9CfH7S07qzMp',
        secondaryMuscles: ['chest', 'triceps', 'quads', 'core'],
        instructions: [
            'Stand with feet hip-width apart.',
            'Drop your hands to the floor and jump your feet back to a push-up position.',
            'Perform one push-up (optional for added difficulty).',
            'Jump your feet forward toward your hands.',
            'Explode upward, jumping with arms overhead.',
            'Land softly and immediately repeat. Perform 3 sets of 10–15.',
        ],
    },
    {
        id: 'home-005', name: 'Lunges', bodyPart: 'upper legs', target: 'quadriceps',
        equipment: 'body weight',
        gifUrl: 'https://v2.exercisedb.io/image/EpqAjO4FIiWKQd',
        secondaryMuscles: ['glutes', 'hamstrings', 'calves'],
        instructions: [
            'Stand tall, feet together.',
            'Step forward with one foot, landing heel-first.',
            'Lower your back knee toward (but not touching) the floor.',
            'Keep your front shin vertical, torso upright.',
            'Drive through your front heel to return to standing.',
            'Perform 3 sets of 10–15 reps per leg.',
        ],
    },
    {
        id: 'home-006', name: 'Pike Push-Up', bodyPart: 'shoulders', target: 'delts',
        equipment: 'body weight',
        gifUrl: 'https://v2.exercisedb.io/image/xhJ2RjLjMF4FcR',
        secondaryMuscles: ['triceps', 'upper chest'],
        instructions: [
            'Start in a downward dog position — hips high, arms and legs straight.',
            'Bend your elbows and lower your head toward the floor between your hands.',
            'Push back up to the starting position.',
            'Maintain a strong shoulder position throughout.',
            'Perform 3–4 sets of 8–12 reps.',
        ],
    },
    {
        id: 'home-007', name: 'Mountain Climbers', bodyPart: 'waist', target: 'abs',
        equipment: 'body weight',
        gifUrl: 'https://v2.exercisedb.io/image/6Q0JBi3UrZfDNF',
        secondaryMuscles: ['hip flexors', 'shoulders', 'chest'],
        instructions: [
            'Start in a high plank position, hands under shoulders.',
            'Drive one knee toward your chest while keeping the other leg extended.',
            'Rapidly switch legs, like you are running in place.',
            'Keep your hips level and core engaged throughout.',
            'Perform for 30–60 seconds per round, 3 rounds.',
        ],
    },
    {
        id: 'home-008', name: 'Tricep Dips (Chair)', bodyPart: 'upper arms', target: 'triceps',
        equipment: 'body weight',
        gifUrl: 'https://v2.exercisedb.io/image/oC2jLdeMzGaSqK',
        secondaryMuscles: ['anterior deltoid', 'chest'],
        instructions: [
            'Sit on the edge of a sturdy chair, hands gripping the edge.',
            'Slide off the seat, supporting your weight with your arms.',
            'Lower your body by bending your elbows to about 90 degrees.',
            'Press back up to the starting position without using your legs.',
            'Keep your back close to the chair. Perform 3 sets of 10–15 reps.',
        ],
    },
    // ── CARDIO ───────────────────────────────────────────────────────────────
    {
        id: 'cardio-001', name: 'Jumping Jacks', bodyPart: 'cardio', target: 'cardiovascular system',
        equipment: 'body weight',
        gifUrl: 'https://v2.exercisedb.io/image/qjhSHVjYq3nWLh',
        secondaryMuscles: ['shoulders', 'inner thighs', 'calves'],
        instructions: [
            'Stand with feet together and arms at your sides.',
            'Jump while simultaneously spreading your feet wide and raising arms overhead.',
            'Jump again, returning arms and legs to the starting position.',
            'Maintain a soft landing on the balls of your feet.',
            'Perform for 30–60 seconds or 30–50 reps. Do 3 rounds.',
        ],
    },
    {
        id: 'cardio-002', name: 'High Knees', bodyPart: 'cardio', target: 'cardiovascular system',
        equipment: 'body weight',
        gifUrl: 'https://v2.exercisedb.io/image/E6vHCJMzsTNWlM',
        secondaryMuscles: ['hip flexors', 'quads', 'calves', 'core'],
        instructions: [
            'Stand with feet hip-width apart.',
            'Run in place, driving your knees up to hip height.',
            'Pump your arms in opposition to your legs.',
            'Land lightly on the balls of your feet and maintain an upright posture.',
            'Perform for 30–45 seconds per interval, 4–6 rounds.',
        ],
    },
    {
        id: 'cardio-003', name: 'Jump Rope (Simulation)', bodyPart: 'cardio', target: 'cardiovascular system',
        equipment: 'body weight',
        gifUrl: 'https://v2.exercisedb.io/image/bBi8mjFyFhPdI2',
        secondaryMuscles: ['calves', 'shoulders', 'forearms', 'core'],
        instructions: [
            'Stand with feet together, mimicking holding a jump rope handle in each hand.',
            'Begin rotating your wrists in small circles while hopping lightly on both feet.',
            'Stay on the balls of your feet and keep jumps low (1–2 cm off the ground).',
            'Alternate between double-leg hops and alternating-foot hops.',
            'Perform 3 rounds of 60 seconds with 30-second rest periods.',
        ],
    },
    {
        id: 'cardio-004', name: 'Box Jump', bodyPart: 'cardio', target: 'cardiovascular system',
        equipment: 'body weight',
        gifUrl: 'https://v2.exercisedb.io/image/qF8Oqnf5rMV4HO',
        secondaryMuscles: ['quads', 'glutes', 'hamstrings', 'calves'],
        instructions: [
            'Stand in front of a sturdy box or platform (12–24 inches).',
            'Bend knees, swing arms back, then explosively jump onto the box.',
            'Land softly with both feet simultaneously, absorbing impact through your hips.',
            'Stand tall to complete the rep.',
            'Step (do not jump) back down. Perform 3 sets of 8–12 reps.',
        ],
    },
    {
        id: 'cardio-005', name: 'Treadmill Intervals', bodyPart: 'cardio', target: 'cardiovascular system',
        equipment: 'elliptical machine',
        gifUrl: '',
        secondaryMuscles: ['quads', 'hamstrings', 'glutes', 'calves'],
        instructions: [
            'Warm up at 5 mph (8 km/h) for 3 minutes.',
            'Increase speed to 8–10 mph (13–16 km/h) for 30 seconds (sprint).',
            'Reduce to 3–4 mph (5–6.5 km/h) for 90 seconds (active recovery).',
            'Repeat the sprint/recovery cycle 6–10 times.',
            'Cool down at an easy pace for 3–5 minutes.',
        ],
    },
];

// ─── API Client (RapidAPI) ───────────────────────────────────────────────────

const BASE_URL = 'https://exercisedb.p.rapidapi.com';
const RAPIDAPI_HOST = 'exercisedb.p.rapidapi.com';

function getApiKey(): string {
    // Works in both Server Components and client-side (if NEXT_PUBLIC_ prefix is used)
    return (
        (typeof process !== 'undefined' && process.env?.EXERCISEDB_API_KEY) ||
        (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_EXERCISEDB_KEY) ||
        ''
    );
}

async function fetchFromAPI<T>(path: string, params?: Record<string, string>): Promise<T | null> {
    const key = getApiKey();
    if (!key) return null;

    const url = new URL(`${BASE_URL}${path}`);
    if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

    try {
        const res = await fetch(url.toString(), {
            headers: {
                'X-RapidAPI-Key': key,
                'X-RapidAPI-Host': RAPIDAPI_HOST,
            },
            next: { revalidate: 3600 },
        });
        if (!res.ok) return null;
        return res.json();
    } catch {
        return null;
    }
}

// ─── Category Helpers ────────────────────────────────────────────────────────

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

export function getExerciseById(id: string): Exercise | undefined {
    return [...FALLBACK_EXERCISES, ...KEGEL_EXERCISES].find((ex) => ex.id === id);
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
            ex.equipment.toLowerCase().includes(q)
    );
}

// ─── Live API (with fallback) ────────────────────────────────────────────────

export async function fetchExercises(category: ExerciseCategory, limit = 30): Promise<Exercise[]> {
    if (category === 'kegel') return KEGEL_EXERCISES;

    // Try live API first
    if (category === 'home') {
        const live = await fetchFromAPI<Exercise[]>('/exercises/equipment/body weight', {
            limit: String(limit), offset: '0',
        });
        if (live?.length) return live;
    }

    if (category === 'cardio') {
        const live = await fetchFromAPI<Exercise[]>('/exercises/bodyPart/cardio', {
            limit: String(limit), offset: '0',
        });
        if (live?.length) return live;
    }

    if (category === 'gym') {
        const live = await fetchFromAPI<Exercise[]>('/exercises/equipment/barbell', {
            limit: String(limit), offset: '0',
        });
        if (live?.length) return live;
    }

    // Fallback to built-in data
    return getExercisesByCategory(category, limit);
}

export async function fetchExerciseById(id: string): Promise<Exercise | undefined> {
    // Check fallback first (for custom IDs)
    const fallback = getExerciseById(id);
    if (fallback) return fallback;

    // Try live API
    const live = await fetchFromAPI<Exercise>(`/exercises/exercise/${id}`);
    return live ?? undefined;
}

export async function searchExercisesLive(name: string): Promise<Exercise[]> {
    const live = await fetchFromAPI<Exercise[]>(`/exercises/name/${encodeURIComponent(name)}`);
    if (live?.length) return live;
    return searchExercises(name);
}

// ─── Body Part → Display Label ────────────────────────────────────────────────

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

export const MUSCLE_GROUP_ICONS: Record<string, string> = {
    back: '🔙',
    cardio: '❤️',
    chest: '💪',
    'lower arms': '🤝',
    'lower legs': '🦵',
    neck: '🦒',
    shoulders: '🏋️',
    'upper arms': '💪',
    'upper legs': '🦵',
    waist: '🎯',
    'pelvic floor': '🌊',
};
