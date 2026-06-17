/**
 * curatedDemos.ts
 *
 * Companion to {@link ./exerciseDemos.ts}. Grows the curated demo coverage from
 * the 35-entry DEMO_FALLBACK map to >=100 distinct exercise names via a single
 * `getCuratedDemo()` accessor.
 *
 * Each entry is one of three shapes (no search/results pages, no live regex —
 * all URLs are static and verifiable):
 *
 *   - `kind: 'youtube'`      — a specific YouTube watch URL (a single video,
 *                              not a search). All 35 grandfathered DEMO_FALLBACK
 *                              entries land here as `verified: true`.
 *   - `kind: 'fedb_frames'`  — the pipe-joined `0.jpg|1.jpg` HTTPS frame pair
 *                              from free-exercise-db (MIT, already-shipped).
 *                              Zero network cost: it reuses data the existing
 *                              FEDB slug index already ships.
 *   - `kind: 'gif'`          — a static animated demo URL (wger / similar free
 *                              CDN). Reserved for future use; the current map
 *                              does not emit this shape, but the type and
 *                              regex are in place so callers can rely on the
 *                              contract.
 *
 * `verified` is true for the 35 grandfathered entries (their YouTube URLs were
 * curated in DEMO_FALLBACK and are already shown to users). Every NEW key
 * ships with `verified: false` so the UI can later render an "unreviewed"
 * badge — that UI work is OUT OF SCOPE this sprint.
 *
 * Strictly additive: nothing in this file mutates DEMO_FALLBACK, DEMO_FRAMES,
 * DEMO_GIF, or `resolveDemoFrames`. The module is a sibling, not a rewrite.
 *
 * NOTE: any NEW `youtube` entry whose `verified: false` is also listed in
 * `./pendingHumanReviewIds.json`, so a human reviewer can eyeball every video
 * id before flipping it to `verified: true` in a future sprint. The companion
 * test in `__tests__/constants/curatedDemos.test.ts` cross-checks this.
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** A single curated demo entry returned by {@link getCuratedDemo}. */
export type CuratedDemo = {
  /** Which source shape the `url` follows. */
  kind: 'youtube' | 'fedb_frames' | 'gif';
  /**
   * The demo URL. Shape depends on `kind`:
   *  - 'youtube'     → `https://www.youtube.com/watch?v=<id>`
   *  - 'fedb_frames' → `https://raw.githubusercontent.com/.../<slug>/0.jpg|https://.../<slug>/1.jpg`
   *                    (pipe-joined ordered start/end frame pair).
   *  - 'gif'         → a single static animated image URL (https only).
   */
  url: string;
  /**
   * Whether a human reviewer has eyeballed this URL and confirmed it shows the
   * right movement. The 35 grandfathered DEMO_FALLBACK entries are
   * `verified: true`; every NEW key ships as `verified: false` until a human
   * walks the {@link ./pendingHumanReviewIds.json} list.
   */
  verified: boolean;
};

// ---------------------------------------------------------------------------
// Shared FEDB helpers (kept private — mirror, do NOT mutate, the corresponding
// constants in exerciseDemos.ts so this module stays a self-contained sibling).
// ---------------------------------------------------------------------------

const FEDB_BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises';

/** Build the pipe-joined `0.jpg|1.jpg` HTTPS frame-pair URL for a FEDB slug. */
const fedbPair = (slug: string): string => `${FEDB_BASE}/${slug}/0.jpg|${FEDB_BASE}/${slug}/1.jpg`;

// ---------------------------------------------------------------------------
// The curated map
// ---------------------------------------------------------------------------
//
// Three layers, concatenated to build CURATED_DEMOS at the bottom:
//
//   GRANDFATHERED  — the 35 existing DEMO_FALLBACK names (kind:'youtube',
//                    verified:true). MUST stay key-for-key in sync with
//                    DEMO_FALLBACK in exerciseDemos.ts and the backend
//                    DEMO_URLS map (so the cross-package sync guard in
//                    exerciseDemos.test.ts is untouched by this addition).
//   FEDB_BACKED    — common catalogue movements whose names exist in
//                    FEDB_SLUGS. kind:'fedb_frames', verified:false.
//                    Pure data-reuse — no new HTTP fetches at runtime.
//   YOUTUBE_PENDING — a small set of marquee movements with a known watch
//                    URL but NOT yet curated upstream. kind:'youtube',
//                    verified:false. Every id listed here is mirrored to
//                    pendingHumanReviewIds.json.
// ---------------------------------------------------------------------------

/** The 35 names already in DEMO_FALLBACK, grandfathered as `verified: true`. */
const GRANDFATHERED: Readonly<Record<string, CuratedDemo>> = {
  // ── Gym ─────────────────────────────────────────────────────────────────
  'Barbell Bench Press': { kind: 'youtube', url: 'https://www.youtube.com/watch?v=rT7DgCr-3pg', verified: true },
  'Barbell Deadlift': { kind: 'youtube', url: 'https://www.youtube.com/watch?v=op9kVnSso6Q', verified: true },
  'Barbell Back Squat': { kind: 'youtube', url: 'https://www.youtube.com/watch?v=ultWZbUMPL8', verified: true },
  'Overhead Press': { kind: 'youtube', url: 'https://www.youtube.com/watch?v=2yjwXTZQDDI', verified: true },
  'Pull-Up': { kind: 'youtube', url: 'https://www.youtube.com/watch?v=eGo4IYlbE5g', verified: true },
  'Dumbbell Incline Press': { kind: 'youtube', url: 'https://www.youtube.com/watch?v=8iPEnn-ltC8', verified: true },
  'Cable Lat Pulldown': { kind: 'youtube', url: 'https://www.youtube.com/watch?v=CAwf7n6Luuc', verified: true },
  'Dumbbell Lateral Raise': { kind: 'youtube', url: 'https://www.youtube.com/watch?v=3VcKaXpzqRo', verified: true },
  'Barbell Row': { kind: 'youtube', url: 'https://www.youtube.com/watch?v=9efgcAjQe7E', verified: true },
  'Leg Press': { kind: 'youtube', url: 'https://www.youtube.com/watch?v=IZxyjW7MPJQ', verified: true },
  'Romanian Deadlift': { kind: 'youtube', url: 'https://www.youtube.com/watch?v=JCXUYuzwNrM', verified: true },
  'Dumbbell Bicep Curl': { kind: 'youtube', url: 'https://www.youtube.com/watch?v=ykJmrZ5v0Oo', verified: true },
  'Tricep Pushdown': { kind: 'youtube', url: 'https://www.youtube.com/watch?v=2-LAMcpzODU', verified: true },

  // ── Home ────────────────────────────────────────────────────────────────
  'Push-Up': { kind: 'youtube', url: 'https://www.youtube.com/watch?v=IODxDxX7oi4', verified: true },
  'Bodyweight Squat': { kind: 'youtube', url: 'https://www.youtube.com/watch?v=aclHkVaku9U', verified: true },
  'Plank': { kind: 'youtube', url: 'https://www.youtube.com/watch?v=pSHjTRCQxIw', verified: true },
  'Burpee': { kind: 'youtube', url: 'https://www.youtube.com/watch?v=TU8QYVW0gDU', verified: true },
  'Lunges': { kind: 'youtube', url: 'https://www.youtube.com/watch?v=QOVaHwm-Q6U', verified: true },
  'Pike Push-Up': { kind: 'youtube', url: 'https://www.youtube.com/watch?v=x7_I6gZDeBk', verified: true },
  'Mountain Climbers': { kind: 'youtube', url: 'https://www.youtube.com/watch?v=nmwgirgXLYM', verified: true },
  'Tricep Dips': { kind: 'youtube', url: 'https://www.youtube.com/watch?v=6kALZikXxLc', verified: true },
  'Glute Bridge': { kind: 'youtube', url: 'https://www.youtube.com/watch?v=OUgsJ8-Vi0E', verified: true },
  'Superman': { kind: 'youtube', url: 'https://www.youtube.com/watch?v=cc6UVRS7PW4', verified: true },

  // ── Cardio ──────────────────────────────────────────────────────────────
  'Jumping Jacks': { kind: 'youtube', url: 'https://www.youtube.com/watch?v=c4DAnQ6DtF8', verified: true },
  'High Knees': { kind: 'youtube', url: 'https://www.youtube.com/watch?v=oDdkytliOqE', verified: true },
  'Jump Rope': { kind: 'youtube', url: 'https://www.youtube.com/watch?v=u3zgHI8QnqE', verified: true },
  'Box Jump': { kind: 'youtube', url: 'https://www.youtube.com/watch?v=52r_Ul5k03g', verified: true },

  // ── Pelvic floor ────────────────────────────────────────────────────────
  'Basic Kegel Squeeze': { kind: 'youtube', url: 'https://www.youtube.com/watch?v=PMHc5W2YO9o', verified: true },
  'Quick-Flick Kegels': { kind: 'youtube', url: 'https://www.youtube.com/watch?v=lFKYltA2tA8', verified: true },
  'Elevator Kegel': { kind: 'youtube', url: 'https://www.youtube.com/watch?v=jWj4iBxQ0Xc', verified: true },

  // ── Widened tranche (already verified upstream) ─────────────────────────
  'Hammer Curls': { kind: 'youtube', url: 'https://www.youtube.com/watch?v=tjyraFISkbg', verified: true },
  'Hanging Leg Raise': { kind: 'youtube', url: 'https://www.youtube.com/watch?v=Pr1ieGZ5atk', verified: true },
  'Face Pull': { kind: 'youtube', url: 'https://www.youtube.com/watch?v=rep-qVOkqgk', verified: true },
  'Goblet Squat': { kind: 'youtube', url: 'https://www.youtube.com/watch?v=MeIiIdhvXT4', verified: true },
  'Barbell Hip Thrust': { kind: 'youtube', url: 'https://www.youtube.com/watch?v=LM8XHLYJoYs', verified: true },
};

/**
 * The new tranche: catalogue movements whose names exist in FEDB_SLUGS and
 * therefore resolve to a `0.jpg|1.jpg` HTTPS pair with NO new network calls.
 *
 * Each name pairs with a FEDB slug directory that is already present in the
 * FEDB_SLUGS index inside exerciseDemos.ts — i.e. the data we ship today.
 *
 * Focus: barbell/dumbbell compound movements ending in _Press / _Squat /
 * _Deadlift / _Row / _Curl plus widely-used cable / machine / bodyweight
 * compounds. Manually curated (no live regex at runtime).
 */
const FEDB_BACKED_SLUGS: Readonly<Record<string, string>> = {
  // ── Barbell compounds — Press ────────────────────────────────────────────
  'Close-Grip Barbell Bench Press': 'Close-Grip_Barbell_Bench_Press',
  'Wide-Grip Barbell Bench Press': 'Wide-Grip_Barbell_Bench_Press',
  'Decline Barbell Bench Press': 'Decline_Barbell_Bench_Press',
  'Barbell Incline Bench Press': 'Barbell_Incline_Bench_Press_-_Medium_Grip',
  'Barbell Shoulder Press': 'Barbell_Shoulder_Press',
  'Seated Barbell Military Press': 'Seated_Barbell_Military_Press',
  'Floor Press': 'Floor_Press',
  'Push Press': 'Push_Press',
  'Standing Military Press': 'Standing_Military_Press',
  // ── Barbell compounds — Squat ───────────────────────────────────────────
  'Barbell Squat': 'Barbell_Squat',
  'Front Barbell Squat': 'Front_Barbell_Squat',
  'Barbell Hack Squat': 'Barbell_Hack_Squat',
  'Box Squat': 'Box_Squat',
  'Olympic Squat': 'Olympic_Squat',
  'Wide Stance Barbell Squat': 'Wide_Stance_Barbell_Squat',
  'Overhead Squat': 'Overhead_Squat',
  'Zercher Squats': 'Zercher_Squats',
  'Barbell Walking Lunge': 'Barbell_Walking_Lunge',
  'Barbell Lunge': 'Barbell_Lunge',
  // ── Barbell compounds — Deadlift ────────────────────────────────────────
  'Sumo Deadlift': 'Sumo_Deadlift',
  'Stiff-Legged Barbell Deadlift': 'Stiff-Legged_Barbell_Deadlift',
  'Trap Bar Deadlift': 'Trap_Bar_Deadlift',
  'Rack Pulls': 'Rack_Pulls',
  'Snatch Deadlift': 'Snatch_Deadlift',
  'Clean Deadlift': 'Clean_Deadlift',
  'Deficit Deadlift': 'Deficit_Deadlift',
  // ── Barbell compounds — Row ─────────────────────────────────────────────
  'Bent Over Barbell Row': 'Bent_Over_Barbell_Row',
  'Upright Barbell Row': 'Upright_Barbell_Row',
  'T-Bar Row with Handle': 'T-Bar_Row_with_Handle',
  'Barbell Rear Delt Row': 'Barbell_Rear_Delt_Row',
  'Reverse Grip Bent-Over Rows': 'Reverse_Grip_Bent-Over_Rows',
  // ── Barbell compounds — Curl ────────────────────────────────────────────
  'Barbell Curl': 'Barbell_Curl',
  'EZ-Bar Curl': 'EZ-Bar_Curl',
  'Preacher Curl': 'Preacher_Curl',
  'Reverse Barbell Curl': 'Reverse_Barbell_Curl',
  'Wide-Grip Standing Barbell Curl': 'Wide-Grip_Standing_Barbell_Curl',
  'Close-Grip Standing Barbell Curl': 'Close-Grip_Standing_Barbell_Curl',
  'Drag Curl': 'Drag_Curl',
  'Spider Curl': 'Spider_Curl',

  // ── Dumbbell compounds — Press ──────────────────────────────────────────
  'Dumbbell Bench Press': 'Dumbbell_Bench_Press',
  'Dumbbell Shoulder Press': 'Dumbbell_Shoulder_Press',
  'Seated Dumbbell Press': 'Seated_Dumbbell_Press',
  'Arnold Dumbbell Press': 'Arnold_Dumbbell_Press',
  'Standing Dumbbell Press': 'Standing_Dumbbell_Press',
  'Dumbbell Floor Press': 'Dumbbell_Floor_Press',
  // ── Dumbbell compounds — Squat ──────────────────────────────────────────
  'Dumbbell Squat': 'Dumbbell_Squat',
  'Dumbbell Lunges': 'Dumbbell_Lunges',
  'Plie Dumbbell Squat': 'Plie_Dumbbell_Squat',
  'Dumbbell Rear Lunge': 'Dumbbell_Rear_Lunge',
  'Dumbbell Step Ups': 'Dumbbell_Step_Ups',
  // ── Dumbbell compounds — Deadlift ───────────────────────────────────────
  'Stiff-Legged Dumbbell Deadlift': 'Stiff-Legged_Dumbbell_Deadlift',
  // ── Dumbbell compounds — Row ────────────────────────────────────────────
  'One-Arm Dumbbell Row': 'One-Arm_Dumbbell_Row',
  'Bent Over Two-Dumbbell Row': 'Bent_Over_Two-Dumbbell_Row',
  'Dumbbell Incline Row': 'Dumbbell_Incline_Row',
  'Dumbbell One-Arm Upright Row': 'Dumbbell_One-Arm_Upright_Row',
  'Standing Dumbbell Upright Row': 'Standing_Dumbbell_Upright_Row',
  // ── Dumbbell compounds — Curl ───────────────────────────────────────────
  'Dumbbell Alternate Bicep Curl': 'Dumbbell_Alternate_Bicep_Curl',
  'Concentration Curls': 'Concentration_Curls',
  'Cross Body Hammer Curl': 'Cross_Body_Hammer_Curl',
  'Incline Dumbbell Curl': 'Incline_Dumbbell_Curl',
  'Seated Dumbbell Curl': 'Seated_Dumbbell_Curl',
  'Zottman Curl': 'Zottman_Curl',
  'Hammer Grip Incline DB Bench Press': 'Hammer_Grip_Incline_DB_Bench_Press',

  // ── Cable / machine / catalogue staples (round out to >=100 without YT) ─
  'Cable Crossover': 'Cable_Crossover',
  'Cable Crunch': 'Cable_Crunch',
  'Seated Cable Rows': 'Seated_Cable_Rows',
  'Triceps Pushdown': 'Triceps_Pushdown',
  'Machine Bench Press': 'Machine_Bench_Press',
  'Machine Bicep Curl': 'Machine_Bicep_Curl',
  'Machine Triceps Extension': 'Machine_Triceps_Extension',
  'Hack Squat': 'Hack_Squat',
  'Seated Calf Raise': 'Seated_Calf_Raise',
  'Standing Calf Raises': 'Standing_Calf_Raises',
  'Donkey Calf Raises': 'Donkey_Calf_Raises',
  'Leg Extensions': 'Leg_Extensions',
  'Seated Leg Curl': 'Seated_Leg_Curl',
  'Lying Leg Curls': 'Lying_Leg_Curls',
  'Good Morning': 'Good_Morning',
  'Pullups': 'Pullups',
  'Chin-Up': 'Chin-Up',
  'Inverted Row': 'Inverted_Row',
  'Wide-Grip Lat Pulldown': 'Wide-Grip_Lat_Pulldown',
  'Close-Grip Front Lat Pulldown': 'Close-Grip_Front_Lat_Pulldown',
  'Side Lateral Raise': 'Side_Lateral_Raise',
  'Front Dumbbell Raise': 'Front_Dumbbell_Raise',
  'Reverse Flyes': 'Reverse_Flyes',
  'Dumbbell Flyes': 'Dumbbell_Flyes',
  'Incline Dumbbell Flyes': 'Incline_Dumbbell_Flyes',
  'Decline Dumbbell Flyes': 'Decline_Dumbbell_Flyes',
  'Russian Twist': 'Russian_Twist',
  'Hyperextensions (Back Extensions)': 'Hyperextensions_Back_Extensions',
  'Reverse Crunch': 'Reverse_Crunch',
  'Decline Crunch': 'Decline_Crunch',
  'Exercise Ball Crunch': 'Exercise_Ball_Crunch',
  'Side Bridge': 'Side_Bridge',
  'Crunches': 'Crunches',
  'Sit-Up': 'Sit-Up',
  'Pallof Press': 'Pallof_Press',
  'Kettlebell Thruster': 'Kettlebell_Thruster',

  // ── High-traffic SHORT-NAME variants (close the "coming soon" gap) ──────────
  // Plain catalogue names users commonly search/program (e.g. "Bench Press",
  // "Squat", "Lat Pulldown") that the by-NAME index in exerciseDemos.ts misses,
  // because its FEDB_SLUGS key is the fully-qualified slug name
  // (`barbell_bench_press_medium_grip`, not `bench_press`). Each maps to a slug
  // dir that EXISTS in that same FEDB index, so frames resolve with zero new
  // network calls. These only ever take effect via [id].tsx's curated fallback
  // (consulted when resolveDemoFrames/resolveDemo both miss), so they never
  // override an existing demo. kind:'fedb_frames', verified:false.
  'Bench Press': 'Barbell_Bench_Press_-_Medium_Grip',
  'Squat': 'Barbell_Full_Squat',
  'Deadlift': 'Barbell_Deadlift',
  'Shoulder Press': 'Dumbbell_Shoulder_Press',
  'Bicep Curl': 'Dumbbell_Bicep_Curl',
  'Lat Pulldown': 'Wide-Grip_Lat_Pulldown',
  'Seated Row': 'Seated_Cable_Rows',
  'Cable Row': 'Seated_Cable_Rows',
  'Leg Curl': 'Lying_Leg_Curls',
  'Leg Extension': 'Leg_Extensions',
  'Calf Raise': 'Standing_Calf_Raises',
  'Incline Bench Press': 'Barbell_Incline_Bench_Press_-_Medium_Grip',
  'Decline Bench Press': 'Decline_Barbell_Bench_Press',
  'Dumbbell Press': 'Dumbbell_Bench_Press',
  'Dumbbell Row': 'One-Arm_Dumbbell_Row',
  'Dumbbell Curl': 'Dumbbell_Bicep_Curl',
  'Hammer Curl': 'Hammer_Curls',
  'Lateral Raise': 'Side_Lateral_Raise',
  'Front Raise': 'Front_Dumbbell_Raise',
  'Rear Delt Fly': 'Reverse_Flyes',
  'Reverse Fly': 'Reverse_Flyes',
  'Chest Fly': 'Dumbbell_Flyes',
  'Dumbbell Fly': 'Dumbbell_Flyes',
  'Pec Deck': 'Butterfly',
  'Chest Press': 'Machine_Bench_Press',
  'Hip Thrust': 'Barbell_Hip_Thrust',
  'Front Squat': 'Front_Barbell_Squat',
  'Pull Up': 'Pullups',
  'Dip': 'Dips_-_Triceps_Version',
  'Push Up': 'Pushups',
  'Crunch': 'Crunches',
  'Leg Raise': 'Hanging_Leg_Raise',
  'Lunge': 'Bodyweight_Walking_Lunge',
  'Walking Lunge': 'Bodyweight_Walking_Lunge',
  'Reverse Lunge': 'Dumbbell_Rear_Lunge',
  'Step Up': 'Dumbbell_Step_Ups',
  'Kettlebell Swing': 'One-Arm_Kettlebell_Swings',
  'Concentration Curl': 'Concentration_Curls',
  'Cable Curl': 'Standing_Biceps_Cable_Curl',
  'Skull Crusher': 'EZ-Bar_Skullcrusher',
  'Overhead Tricep Extension': 'Standing_Overhead_Barbell_Triceps_Extension',
  'Tricep Kickback': 'Tricep_Dumbbell_Kickback',
  'Shrug': 'Barbell_Shrug',
  'Upright Row': 'Upright_Barbell_Row',
  'Arnold Press': 'Arnold_Dumbbell_Press',
  'Military Press': 'Standing_Military_Press',
  'Thruster': 'Kettlebell_Thruster',
  'Bulgarian Split Squat': 'Split_Squat_with_Dumbbells',
  'Back Extension': 'Hyperextensions_Back_Extensions',
  'T-Bar Row': 'T-Bar_Row_with_Handle',
  'Standing Calf Raise': 'Standing_Calf_Raises',
  'Side Plank': 'Side_Bridge',
  'Bicycle Crunch': 'Air_Bike',
};

/**
 * Marquee movements with a known YouTube watch URL that have NOT yet been
 * curated upstream (the backend `DEMO_URLS` map). Each id appears in
 * `./pendingHumanReviewIds.json` so a human can review the video and flip
 * `verified` to `true` in a future sprint.
 *
 * Keep this list TINY — the FEDB-backed path is preferred whenever a slug
 * exists. Anything added here MUST also be appended to
 * pendingHumanReviewIds.json or the companion test will fail.
 */
const YOUTUBE_PENDING: Readonly<Record<string, string>> = {
  // Pelvic-floor / kegel variants commonly programmed in NightFuel but not in
  // the backend's curated YouTube map. Each watch URL is a specific demo, not
  // a search/results page.
  'Reverse Kegel': 'https://www.youtube.com/watch?v=Lj2KshDeEXk',
  // Mobility/recovery staples worth a dedicated demo video.
  "World's Greatest Stretch": 'https://www.youtube.com/watch?v=cs3-PMjVFGY',
  'Couch Stretch': 'https://www.youtube.com/watch?v=Az47gG1lr3o',
};

// ---------------------------------------------------------------------------
// Build the final map
// ---------------------------------------------------------------------------

function buildCuratedDemos(): Record<string, CuratedDemo> {
  const out: Record<string, CuratedDemo> = { ...GRANDFATHERED };

  // FEDB-backed entries (kind:'fedb_frames', verified:false). If a key already
  // exists in GRANDFATHERED (e.g. a marquee compound that was both a YouTube
  // entry AND has a FEDB slug — like "Goblet Squat"), the grandfathered entry
  // wins so we never silently flip verified:true → false.
  for (const [name, slug] of Object.entries(FEDB_BACKED_SLUGS)) {
    if (out[name]) continue;
    out[name] = { kind: 'fedb_frames', url: fedbPair(slug), verified: false };
  }

  // Pending YouTube entries (kind:'youtube', verified:false). Same precedence
  // rule: never overwrite a grandfathered/verified entry.
  for (const [name, url] of Object.entries(YOUTUBE_PENDING)) {
    if (out[name]) continue;
    out[name] = { kind: 'youtube', url, verified: false };
  }

  return out;
}

/**
 * The full curated demo map, frozen. Exposed so the companion test can iterate
 * and assert every entry's shape. Mutating this from runtime code is a bug.
 */
export const CURATED_DEMOS: Readonly<Record<string, CuratedDemo>> = Object.freeze(buildCuratedDemos());

// Case-insensitive / whitespace-trimmed lookup index — mirrors the pattern in
// exerciseDemos.ts (`DEMO_FALLBACK_LC`) so the resolver behaves identically.
const CURATED_DEMOS_LC: Readonly<Record<string, CuratedDemo>> = Object.freeze(
  Object.fromEntries(Object.entries(CURATED_DEMOS).map(([name, demo]) => [name.toLowerCase(), demo])),
);

/**
 * Resolve a curated demo entry for an exercise name, case-insensitive and
 * whitespace-trimmed. Returns `null` when no curated entry exists so the
 * caller can fall back to {@link resolveDemoFrames} / {@link resolveDemo}.
 *
 * Pure data lookup — no network, no side effects. Safe to call on the render
 * path.
 */
export function getCuratedDemo(name: string): CuratedDemo | null {
  if (!name) return null;
  return CURATED_DEMOS_LC[name.trim().toLowerCase()] ?? null;
}

/**
 * Typed `string[]` accessor for the `fedb_frames` curated shape.
 *
 * The on-disk storage shape for FEDB-backed entries is a single
 * `https://.../0.jpg|https://.../1.jpg` pipe-joined URL — convenient for the
 * pre-existing `DEMO_GIF` map, but brittle for downstream callers who must
 * remember to `.split('|')`. This accessor encapsulates that split so the
 * pipe-join contract stays a file-internal storage detail; callers receive a
 * ready-to-use ordered `readonly [string, string]` frame pair.
 *
 * Returns:
 *   - the 2-element start/end frame pair when {@link getCuratedDemo} hits and
 *     `demo.kind === 'fedb_frames'`;
 *   - `null` for every other kind (`'youtube'`, `'gif'`) and for unknown names.
 *
 * Pure lookup — never throws, no network, no side effects. Safe on render.
 */
export function getCuratedDemoFrames(name: string): readonly string[] | null {
  const demo = getCuratedDemo(name);
  if (!demo || demo.kind !== 'fedb_frames') return null;
  // Storage shape is `0.jpg|1.jpg` — split into the ordered start→end pair.
  const parts = demo.url.split('|');
  return parts as readonly string[];
}

/**
 * Typed `verified` accessor for a curated demo entry.
 *
 * Returns the entry's `verified` flag (true for the 35 grandfathered
 * DEMO_FALLBACK YouTube videos, false for every new tranche awaiting human
 * review), or `null` when no entry exists. Lets the UI render an "Unreviewed"
 * chip for `verified: false` without forcing the caller to also import
 * {@link getCuratedDemo} and inspect the shape.
 *
 * Pure lookup — never throws, no network, no side effects. Safe on render.
 */
export function getCuratedDemoVerified(name: string): boolean | null {
  const demo = getCuratedDemo(name);
  if (!demo) return null;
  return demo.verified;
}
