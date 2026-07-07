/**
 * demo-urls.ts
 *
 * Curated map of exercise demo videos. Keyed by the exact
 * `LibraryExercise.name` (same string used as the seed key in seed-library.ts),
 * each value is a verified full YouTube *watch* URL (not a search link).
 *
 * This is the data backbone that unblocks demo media for the exercise library.
 * Covers the local FALLBACK_EXERCISES + KEGEL_EXERCISES (see src/exercisedb.ts).
 * The exercise-service surfaces these on the library endpoints, preferring any
 * value stored in the `demo_url` column and falling back to this map so it works
 * before the catalog is re-seeded.
 *
 * Lookup is case-insensitive and whitespace-trimmed via `resolveDemoUrl()`.
 */

export const DEMO_URLS: Record<string, string> = {
    // ── Gym (FALLBACK_EXERCISES) ──────────────────────────────────────────────
    'Barbell Bench Press': 'https://www.youtube.com/watch?v=rT7DgCr-3pg',
    'Barbell Deadlift': 'https://www.youtube.com/watch?v=op9kVnSso6Q',
    'Barbell Back Squat': 'https://www.youtube.com/watch?v=ultWZbUMPL8',
    'Overhead Press': 'https://www.youtube.com/watch?v=2yjwXTZQDDI',
    'Pull-Up': 'https://www.youtube.com/watch?v=eGo4IYlbE5g',
    'Dumbbell Incline Press': 'https://www.youtube.com/watch?v=8iPEnn-ltC8',
    'Cable Lat Pulldown': 'https://www.youtube.com/watch?v=CAwf7n6Luuc',
    'Dumbbell Lateral Raise': 'https://www.youtube.com/watch?v=3VcKaXpzqRo',
    'Barbell Row': 'https://www.youtube.com/watch?v=9efgcAjQe7E',
    'Leg Press': 'https://www.youtube.com/watch?v=IZxyjW7MPJQ',
    'Romanian Deadlift': 'https://www.youtube.com/watch?v=JCXUYuzwNrM',
    'Dumbbell Bicep Curl': 'https://www.youtube.com/watch?v=ykJmrZ5v0Oo',
    'Tricep Pushdown': 'https://www.youtube.com/watch?v=2-LAMcpzODU',

    // ── Home (FALLBACK_EXERCISES) ─────────────────────────────────────────────
    'Push-Up': 'https://www.youtube.com/watch?v=IODxDxX7oi4',
    'Bodyweight Squat': 'https://www.youtube.com/watch?v=aclHkVaku9U',
    'Plank': 'https://www.youtube.com/watch?v=pSHjTRCQxIw',
    'Burpee': 'https://www.youtube.com/watch?v=TU8QYVW0gDU',
    'Lunges': 'https://www.youtube.com/watch?v=QOVaHwm-Q6U',
    'Pike Push-Up': 'https://www.youtube.com/watch?v=x7_I6gZDeBk',
    'Mountain Climbers': 'https://www.youtube.com/watch?v=nmwgirgXLYM',
    'Tricep Dips': 'https://www.youtube.com/watch?v=6kALZikXxLc',
    'Glute Bridge': 'https://www.youtube.com/watch?v=OUgsJ8-Vi0E',
    'Superman': 'https://www.youtube.com/watch?v=cc6UVRS7PW4',

    // ── Cardio (FALLBACK_EXERCISES) ───────────────────────────────────────────
    'Jumping Jacks': 'https://www.youtube.com/watch?v=c4DAnQ6DtF8',
    'High Knees': 'https://www.youtube.com/watch?v=oDdkytliOqE',
    'Jump Rope': 'https://www.youtube.com/watch?v=u3zgHI8QnqE',
    'Box Jump': 'https://www.youtube.com/watch?v=52r_Ul5k03g',

    // ── Pelvic floor (KEGEL_EXERCISES) ────────────────────────────────────────
    'Basic Kegel Squeeze': 'https://www.youtube.com/watch?v=PMHc5W2YO9o',
    'Quick-Flick Kegels': 'https://www.youtube.com/watch?v=lFKYltA2tA8',
    'Elevator Kegel': 'https://www.youtube.com/watch?v=jWj4iBxQ0Xc',

    // ── Widened tranche (also in the FEDB slug index for in-app frames) ────────
    // Additive curated set, kept key-for-key in sync with the mobile
    // `DEMO_FALLBACK` map (clients/mobile/src/constants/exerciseDemos.ts). Each
    // value is a verified full YouTube watch URL, never a search/results page.
    'Hammer Curls': 'https://www.youtube.com/watch?v=tjyraFISkbg',
    'Hanging Leg Raise': 'https://www.youtube.com/watch?v=Pr1ieGZ5atk',
    'Face Pull': 'https://www.youtube.com/watch?v=rep-qVOkqgk',
    'Goblet Squat': 'https://www.youtube.com/watch?v=MeIiIdhvXT4',
    'Barbell Hip Thrust': 'https://www.youtube.com/watch?v=LM8XHLYJoYs',
};

// Pre-lowercased index for case-insensitive lookups.
const DEMO_URLS_LC: Record<string, string> = Object.fromEntries(
    Object.entries(DEMO_URLS).map(([name, url]) => [name.toLowerCase(), url]),
);

/**
 * Resolve a curated demo video URL for an exercise by its display name.
 * Lowercases + trims the input, returning the matching watch URL or null.
 */
export function resolveDemoUrl(name: string | null | undefined): string | null {
    if (!name) return null;
    return DEMO_URLS_LC[name.trim().toLowerCase()] ?? null;
}
