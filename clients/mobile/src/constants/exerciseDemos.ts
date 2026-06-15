/**
 * exerciseDemos.ts
 *
 * Client-side fallback data for the exercise detail screen so it degrades
 * gracefully when the backend response is incomplete:
 *
 *  - DEMO_FALLBACK    — exercise name -> verified YouTube *watch* URL (a specific
 *                       video, never a search). Mirrors the backend curated map in
 *                       services/exercise-service/prisma/demo-urls.ts so a "Watch
 *                       demo" deep-link works even when `exercise.demoUrl` is null.
 *  - TIPS_BY_BODYPART — coaching cues keyed by ExerciseDB body-part label
 *                       ("chest", "back", "upper legs", "waist", ...). Picked so
 *                       two different exercises (e.g. Bench Press vs Plank) show
 *                       DISTINCT tips instead of one generic list.
 *  - GENERAL_TIPS     — fallback cues when a body part has no specific entry.
 *
 * Helpers (`resolveDemo`, `tipsFor`) own the case-insensitive / trimmed lookup
 * and the fallback logic so the screen stays declarative.
 */

/**
 * Curated demo videos keyed by the exact `LibraryExercise.name`.
 * Kept in sync with the backend `DEMO_URLS` map (demo-urls.ts). Each value is a
 * full YouTube watch URL — a specific demonstration, not a results/search page.
 */
export const DEMO_FALLBACK: Record<string, string> = {
  // ── Gym ─────────────────────────────────────────────────────────────────
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

  // ── Home ────────────────────────────────────────────────────────────────
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

  // ── Cardio ──────────────────────────────────────────────────────────────
  'Jumping Jacks': 'https://www.youtube.com/watch?v=c4DAnQ6DtF8',
  'High Knees': 'https://www.youtube.com/watch?v=oDdkytliOqE',
  'Jump Rope': 'https://www.youtube.com/watch?v=u3zgHI8QnqE',
  'Box Jump': 'https://www.youtube.com/watch?v=52r_Ul5k03g',

  // ── Pelvic floor ────────────────────────────────────────────────────────
  'Basic Kegel Squeeze': 'https://www.youtube.com/watch?v=PMHc5W2YO9o',
  'Quick-Flick Kegels': 'https://www.youtube.com/watch?v=lFKYltA2tA8',
  'Elevator Kegel': 'https://www.youtube.com/watch?v=jWj4iBxQ0Xc',
};

// Pre-lowercased index for case-insensitive, whitespace-trimmed lookups.
const DEMO_FALLBACK_LC: Record<string, string> = Object.fromEntries(
  Object.entries(DEMO_FALLBACK).map(([name, url]) => [name.toLowerCase(), url]),
);

// ---------------------------------------------------------------------------
// In-app demo media (no browser hand-off, no new npm dependency)
// ---------------------------------------------------------------------------
//
// free-exercise-db (MIT, no API key) ships TWO HTTPS frames per exercise —
// `0.jpg` (start of the movement) and `1.jpg` (end). expo-image (already
// installed) renders these inline; alternating the two frames on a timer in
// <ExerciseDemo/> produces a real looping motion demo entirely in-app.
//
// NOTE: the raw repo serves static JPG frames, NOT animated GIFs, so we loop a
// 2-frame sequence rather than relying on a single animated file. Each value
// below is therefore the ORDERED list of frame URLs for one exercise; the
// helpers expose both the frame list (`resolveDemoFrames`, preferred by the
// player) and a single-URL accessor (`resolveDemoGif`, kept for the documented
// name / any single-image caller).
//
// Keyed by the EXACT `LibraryExercise.name` used in DEMO_FALLBACK so the curated
// YouTube map and the in-app frames line up one-to-one. Every slug below is a
// verified directory in the free-exercise-db `exercises/` tree.
const FEDB_BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises';

/** Build the ordered [start, end] HTTPS frame URLs for a free-exercise-db slug. */
const fedb = (slug: string): readonly string[] => [`${FEDB_BASE}/${slug}/0.jpg`, `${FEDB_BASE}/${slug}/1.jpg`];

/**
 * In-app looping demo frames keyed by the exact `LibraryExercise.name`.
 * Each entry is an ordered list of HTTPS frame URLs (start → end of the rep)
 * that <ExerciseDemo/> cross-fades between to animate the movement.
 */
export const DEMO_FRAMES: Record<string, readonly string[]> = {
  // ── Gym ─────────────────────────────────────────────────────────────────
  'Barbell Bench Press': fedb('Barbell_Bench_Press_-_Medium_Grip'),
  'Barbell Deadlift': fedb('Barbell_Deadlift'),
  'Barbell Back Squat': fedb('Barbell_Full_Squat'),
  'Overhead Press': fedb('Standing_Military_Press'),
  'Pull-Up': fedb('Pullups'),
  'Dumbbell Incline Press': fedb('Incline_Dumbbell_Press'),
  'Cable Lat Pulldown': fedb('Wide-Grip_Lat_Pulldown'),
  'Dumbbell Lateral Raise': fedb('Side_Lateral_Raise'),
  'Barbell Row': fedb('Bent_Over_Barbell_Row'),
  'Leg Press': fedb('Leg_Press'),
  'Romanian Deadlift': fedb('Romanian_Deadlift'),
  'Dumbbell Bicep Curl': fedb('Dumbbell_Bicep_Curl'),
  'Tricep Pushdown': fedb('Triceps_Pushdown'),

  // ── Home ────────────────────────────────────────────────────────────────
  'Push-Up': fedb('Pushups'),
  'Bodyweight Squat': fedb('Bodyweight_Squat'),
  'Plank': fedb('Plank'),
  'Lunges': fedb('Bodyweight_Walking_Lunge'),
  'Pike Push-Up': fedb('Handstand_Push-Ups'),
  'Mountain Climbers': fedb('Mountain_Climbers'),
  'Tricep Dips': fedb('Bench_Dips'),
  'Glute Bridge': fedb('Single_Leg_Glute_Bridge'),
  'Superman': fedb('Superman'),

  // ── Cardio ──────────────────────────────────────────────────────────────
  'Box Jump': fedb('Front_Box_Jump'),
  'Jump Rope': fedb('Rope_Jumping'),
};

/**
 * Single-frame demo image keyed by the exact `LibraryExercise.name`. This is the
 * first (start-of-movement) frame of {@link DEMO_FRAMES}; kept under the
 * documented `DEMO_GIF` name for callers that want a single still rather than the
 * animated loop. (Despite the historical name, the source is a static JPG frame.)
 */
export const DEMO_GIF: Record<string, string> = Object.fromEntries(
  Object.entries(DEMO_FRAMES)
    .map(([name, frames]) => [name, frames[0]] as const)
    .filter((entry): entry is readonly [string, string] => typeof entry[1] === 'string'),
);

// Pre-lowercased index for case-insensitive, whitespace-trimmed frame lookups.
const DEMO_FRAMES_LC: Record<string, readonly string[]> = Object.fromEntries(
  Object.entries(DEMO_FRAMES).map(([name, frames]) => [name.toLowerCase(), frames]),
);

/**
 * Body-part-specific coaching cues. Keys are the lowercase ExerciseDB body-part
 * labels surfaced by the API (`exercise.bodyPart`). Each list has 3–5 cues so
 * different muscle groups read distinctly.
 */
export const TIPS_BY_BODYPART: Record<string, string[]> = {
  chest: [
    'Retract and depress your shoulder blades, then keep them pinned to the bench.',
    'Lower the bar to the lower-chest/nipple line — not the throat — for a safe shoulder angle.',
    'Drive through your mid-foot and keep a slight natural arch; glutes stay on the bench.',
    'Lead the press with your chest, not your shoulders, and stop just short of locking out.',
  ],
  back: [
    'Initiate every rep by pulling your shoulder blades down and back before the arms move.',
    'Think about driving your elbows toward your hips rather than yanking with your hands.',
    'Pause for a beat at full contraction and feel the squeeze before the controlled return.',
    'Keep a braced, neutral spine — let the lats do the work, not lower-back momentum.',
  ],
  'upper legs': [
    'Break at the hips and knees together; sit back as if reaching for a chair behind you.',
    'Keep your knees tracking over your toes — never let them cave inward under load.',
    'Hit at least parallel depth with a tall chest and a braced, neutral spine.',
    'Drive the floor away through your heels and squeeze your glutes to stand tall.',
  ],
  'lower legs': [
    'Move through the fullest pain-free range — deep stretch at the bottom, hard squeeze at the top.',
    'Pause for one second at peak contraction; calves respond to time under tension.',
    'Keep the motion smooth and controlled — no bouncing out of the bottom.',
    'Train both a straight-knee and bent-knee variation to hit gastroc and soleus.',
  ],
  waist: [
    'Brace your core as if about to take a punch and keep your ribs pulled down.',
    'Maintain a straight line from head to heels — no sagging hips, no piking up.',
    'Breathe steadily; never hold your breath through the brace.',
    'Quality over duration — stop the set the moment your form breaks down.',
  ],
  'upper arms': [
    'Keep your elbows pinned to your sides so the target muscle does the work.',
    'Control the lowering phase — resist gravity for 2–3 seconds on the way down.',
    'Avoid swinging or using momentum; if you have to heave it, lighten the load.',
    'Get a full squeeze at the top and a full stretch at the bottom each rep.',
  ],
  'lower arms': [
    'Move slowly and deliberately — forearm work rewards strict tempo over heavy load.',
    'Take the wrist through its complete range, pausing briefly at end positions.',
    'Keep the rest of your arm still so only the wrist and forearm move.',
    'Train both flexion and extension to keep the forearm balanced.',
  ],
  shoulders: [
    'Press in a straight line and keep your core braced so you do not arch the lower back.',
    'For raises, lead with the elbows and stop around shoulder height — no higher.',
    'Keep a slight bend in the elbow and avoid shrugging the traps into the movement.',
    'Control the descent; lower under tension rather than letting the weight drop.',
  ],
  neck: [
    'Move through a small, controlled range — the neck does not need heavy resistance.',
    'Never jerk or bounce; keep every rep slow and deliberate.',
    'Stop immediately if you feel any pinching, and reduce the range or load.',
    'Balance the work across flexion, extension, and both sides.',
  ],
  cardio: [
    'Find a sustainable pace you can hold with full range — consistency beats all-out bursts.',
    'Land softly through the mid-foot and stay light on your feet to protect your joints.',
    'Keep your core engaged and posture tall instead of hunching as you fatigue.',
    'Breathe rhythmically and steadily; let your breath set the tempo.',
  ],
  'pelvic floor': [
    'Squeeze as if stopping the flow of urine — lift and hold, then fully relax.',
    'Isolate the pelvic floor: keep your glutes, thighs, and abs relaxed.',
    'Never hold your breath — breathe normally throughout each squeeze.',
    'The relax phase matters as much as the squeeze; give the muscle time to release.',
  ],
};

/** Generic cues used when a body part has no specific entry above. */
export const GENERAL_TIPS: string[] = [
  'Move through a full range of motion and own a controlled lowering phase.',
  'Brace your core to keep your spine stable throughout the movement.',
  'Exhale on the effort (the hardest part) and inhale on the way back.',
  'Prioritise clean form over heavier load — quality reps build the result.',
  'Apply progressive overload: add a little weight or a rep once the top of your range feels easy.',
];

/**
 * Resolve a curated demo video URL for an exercise. Prefers any backend-provided
 * `demoUrl`, then falls back to the client map (case-insensitive, trimmed).
 * Returns null when nothing matches so the caller can hide the button.
 */
export function resolveDemo(exercise: { name?: string | null; demoUrl?: string | null } | null | undefined): string | null {
  if (!exercise) return null;
  if (exercise.demoUrl) return exercise.demoUrl;
  const name = exercise.name;
  if (!name) return null;
  return DEMO_FALLBACK_LC[name.trim().toLowerCase()] ?? null;
}

/**
 * Resolve the ordered in-app demo frame URLs for an exercise (start → end of the
 * rep). Prefers a backend-provided `demoGifUrl` if the API ever supplies one
 * (treated as a single frame), then the curated client map (case-insensitive,
 * trimmed). Returns null when nothing matches so the caller can fall back to the
 * static image / "coming soon" state. URLs are always HTTPS (ATS-safe).
 */
export function resolveDemoFrames(
  exercise: { name?: string | null; demoGifUrl?: string | null } | null | undefined,
): readonly string[] | null {
  if (!exercise) return null;
  if (exercise.demoGifUrl) return [exercise.demoGifUrl];
  const name = exercise.name;
  if (!name) return null;
  return DEMO_FRAMES_LC[name.trim().toLowerCase()] ?? null;
}

/**
 * Resolve a single in-app demo image URL for an exercise (the first/start frame).
 * Mirrors {@link resolveDemo}: prefers backend `demoGifUrl`, then the client map.
 * Returns null when nothing matches.
 */
export function resolveDemoGif(
  exercise: { name?: string | null; demoGifUrl?: string | null } | null | undefined,
): string | null {
  const frames = resolveDemoFrames(exercise);
  return frames && frames.length > 0 ? frames[0] ?? null : null;
}

/**
 * Return coaching cues for a body part, falling back to GENERAL_TIPS.
 * The second element of the tuple flags whether the generic list was used so the
 * UI can relabel the section header (e.g. "Training Tips" vs "Coach's Tips").
 */
export function tipsFor(bodyPart: string | null | undefined): { tips: string[]; isGeneral: boolean } {
  const key = bodyPart?.trim().toLowerCase();
  const specific = key ? TIPS_BY_BODYPART[key] : undefined;
  if (specific && specific.length > 0) return { tips: specific, isGeneral: false };
  return { tips: GENERAL_TIPS, isGeneral: true };
}
