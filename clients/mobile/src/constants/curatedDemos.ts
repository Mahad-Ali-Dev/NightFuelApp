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
 *   - `kind: 'gif'`          — a static animated demo URL (Wikimedia Commons /
 *                              similar free CDN, https only). A small
 *                              `GIF_PENDING` tranche emits this shape for a few
 *                              high-frequency movements; expo-image animates the
 *                              .gif natively from its `{ uri }` source, so
 *                              <ExerciseDemo/> treats it as a PLAYING demo.
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

  // ── Widened FEDB-backed tranche #2 (data-only, zero new fetch) ───────────────
  // More distinct catalogue movements whose names map to a slug dir that ALREADY
  // exists in FEDB_SLUGS (exerciseDemos.ts) — each resolves to a 2-frame
  // [0.jpg,1.jpg] HTTPS pair with NO new HTTP call. All keys are NEW (absent from
  // GRANDFATHERED / the FEDB block above / YOUTUBE_PENDING / GIF_PENDING), so
  // buildCuratedDemos() admits every one. kind:'fedb_frames', verified:false.
  // Each slug below was machine-verified to be present in FEDB_SLUGS.

  // Barbell / Smith — press & overhead
  'Smith Machine Bench Press': 'Smith_Machine_Bench_Press',
  'Smith Machine Incline Bench Press': 'Smith_Machine_Incline_Bench_Press',
  'Standing Barbell Press Behind Neck': 'Standing_Barbell_Press_Behind_Neck',
  'Bradford Press': 'Standing_Bradford_Press',
  // Barbell — squat & single-leg
  'Front Squat (Clean Grip)': 'Front_Squat_Clean_Grip',
  'Jefferson Squat': 'Jefferson_Squats',
  'Barbell Side Split Squat': 'Barbell_Side_Split_Squat',
  'Barbell Step Ups': 'Barbell_Step_Ups',
  'Narrow Stance Squats': 'Narrow_Stance_Squats',
  'Speed Squats': 'Speed_Squats',
  // Deadlift / posterior chain
  'Leverage Deadlift': 'Leverage_Deadlift',
  'Romanian Deadlift from Deficit': 'Romanian_Deadlift_from_Deficit',
  'Stiff Leg Barbell Good Morning': 'Stiff_Leg_Barbell_Good_Morning',
  'Glute Ham Raise': 'Glute_Ham_Raise',
  'Reverse Hyperextension': 'Reverse_Hyperextension',
  'Pull Through': 'Pull_Through',
  // Rows / vertical pulls
  'Smith Machine Bent Over Row': 'Smith_Machine_Bent_Over_Row',
  'Lying T-Bar Row': 'Lying_T-Bar_Row',
  'Straight-Arm Pulldown': 'Straight-Arm_Pulldown',
  'V-Bar Pulldown': 'V-Bar_Pulldown',
  'Underhand Cable Pulldowns': 'Underhand_Cable_Pulldowns',
  'One Arm Lat Pulldown': 'One_Arm_Lat_Pulldown',
  'Wide-Grip Rear Pull-Up': 'Wide-Grip_Rear_Pull-Up',
  'Scapular Pull-Up': 'Scapular_Pull-Up',
  'Gironda Sternum Chins': 'Gironda_Sternum_Chins',
  // Shoulders / delts
  'Standing Low-Pulley Deltoid Raise': 'Standing_Low-Pulley_Deltoid_Raise',
  'Cable Seated Lateral Raise': 'Cable_Seated_Lateral_Raise',
  'Seated Side Lateral Raise': 'Seated_Side_Lateral_Raise',
  'Front Cable Raise': 'Front_Cable_Raise',
  'Front Plate Raise': 'Front_Plate_Raise',
  'Reverse Machine Flyes': 'Reverse_Machine_Flyes',
  'Cable Rear Delt Fly': 'Cable_Rear_Delt_Fly',
  // Biceps
  'High Cable Curls': 'High_Cable_Curls',
  'Lying Cable Curl': 'Lying_Cable_Curl',
  'Standing One-Arm Cable Curl': 'Standing_One-Arm_Cable_Curl',
  'Incline Hammer Curls': 'Incline_Hammer_Curls',
  'Cable Preacher Curl': 'Cable_Preacher_Curl',
  'Machine Preacher Curls': 'Machine_Preacher_Curls',
  // Triceps
  'Cable Rope Overhead Triceps Extension': 'Cable_Rope_Overhead_Triceps_Extension',
  'Lying Triceps Press': 'Lying_Triceps_Press',
  'Seated Triceps Press': 'Seated_Triceps_Press',
  'Reverse Grip Triceps Pushdown': 'Reverse_Grip_Triceps_Pushdown',
  'JM Press': 'JM_Press',
  'Tate Press': 'Tate_Press',
  'Weighted Bench Dip': 'Weighted_Bench_Dip',
  // Chest — cable / machine / bodyweight variants
  'Low Cable Crossover': 'Low_Cable_Crossover',
  'Flat Bench Cable Flyes': 'Flat_Bench_Cable_Flyes',
  'Leverage Incline Chest Press': 'Leverage_Incline_Chest_Press',
  'Decline Push-Up': 'Decline_Push-Up',
  'Plyo Push-Up': 'Plyo_Push-up',
  'Push-Up to Side Plank': 'Push_Up_to_Side_Plank',
  // Core / abs
  'Cable Russian Twists': 'Cable_Russian_Twists',
  'Weighted Crunches': 'Weighted_Crunches',
  'Cross-Body Crunch': 'Cross-Body_Crunch',
  'Oblique Crunches': 'Oblique_Crunches',
  'Flutter Kicks': 'Flutter_Kicks',
  'Dead Bug': 'Dead_Bug',
  'Jackknife Sit-Up': 'Jackknife_Sit-Up',
  'Pallof Press With Rotation': 'Pallof_Press_With_Rotation',
  // Calves
  'Calf Press On The Leg Press Machine': 'Calf_Press_On_The_Leg_Press_Machine',
  'Smith Machine Calf Raise': 'Smith_Machine_Calf_Raise',
  'Rocking Standing Calf Raise': 'Rocking_Standing_Calf_Raise',
  // Kettlebell / conditioning
  'Kettlebell Windmill': 'Kettlebell_Windmill',
  'Two-Arm Kettlebell Row': 'Two-Arm_Kettlebell_Row',
  'Kettlebell Sumo High Pull': 'Kettlebell_Sumo_High_Pull',
  'Sledgehammer Swings': 'Sledgehammer_Swings',
  'Battling Ropes': 'Battling_Ropes',

  // ── Widened FEDB-backed tranche #3 (data-only, zero new fetch) ───────────────
  // Yet more distinct catalogue movements. Every key below is NEW — absent from
  // GRANDFATHERED, the FEDB_BACKED_SLUGS entries above, YOUTUBE_PENDING and
  // GIF_PENDING — so buildCuratedDemos() admits each one as kind:'fedb_frames',
  // verified:false. Every slug VALUE was machine-verified present in FEDB_SLUGS
  // (exerciseDemos.ts), so each resolves to an ordered 2-frame [0.jpg, 1.jpg]
  // HTTPS pair with NO new HTTP call. Strictly additive: the kind:'youtube'-only
  // sync guard (scripts/check-demo-maps-in-sync.js) and pendingHumanReviewIds.json
  // (YouTube ids only) are untouched, so check-demo-maps-in-sync stays green.
  //
  // Roughly half are ALIAS-MISS — their normalized name is NOT a FEDB_SLUGS
  // by-name index key, so resolveDemoFrames() in exerciseDemos.ts would miss them
  // and only this curated map supplies frames: 'Seated One-Arm Cable Pulley Row',
  // 'Powerlifting Bench Press', 'Cable Hammer Curls (Rope)', 'Seated Glute Stretch',
  // 'Cable Deadlift', 'Standing Dumbbell Tricep Extension'. The rest are
  // INDEX-BACKED (their normalized name already resolves), curated here for a
  // cleaner display name + an explicit verified flag.

  // Barbell / Smith — press, squat, posterior chain
  'Powerlifting Bench Press': 'Bench_Press_-_Powerlifting',
  'Bench Press with Chains': 'Bench_Press_with_Chains',
  'Wide-Grip Decline Barbell Bench Press': 'Wide-Grip_Decline_Barbell_Bench_Press',
  'Smith Machine Squat': 'Smith_Machine_Squat',
  'Smith Machine Hip Raise': 'Smith_Machine_Hip_Raise',
  'Barbell Glute Bridge': 'Barbell_Glute_Bridge',
  'Floor Glute-Ham Raise': 'Floor_Glute-Ham_Raise',
  'One-Arm Side Deadlift': 'One-Arm_Side_Deadlift',
  'Cable Deadlift': 'Cable_Deadlifts',
  // Dumbbell — press, curl, pronation
  'Decline Dumbbell Bench Press': 'Decline_Dumbbell_Bench_Press',
  'Dumbbell Bench Press with Neutral Grip': 'Dumbbell_Bench_Press_with_Neutral_Grip',
  'Standing Dumbbell Reverse Curl': 'Standing_Dumbbell_Reverse_Curl',
  'Dumbbell Lying Pronation': 'Dumbbell_Lying_Pronation',
  // Rows / pulldowns
  'Seated One-Arm Cable Pulley Row': 'Seated_One-arm_Cable_Pulley_Rows',
  'Wide-Grip Pulldown Behind The Neck': 'Wide-Grip_Pulldown_Behind_The_Neck',
  // Shoulders / delts
  'Seated Cable Shoulder Press': 'Seated_Cable_Shoulder_Press',
  'Standing Front Barbell Raise Over Head': 'Standing_Front_Barbell_Raise_Over_Head',
  'Seated Bent-Over Rear Delt Raise': 'Seated_Bent-Over_Rear_Delt_Raise',
  'Smith Machine Behind the Back Shrug': 'Smith_Machine_Behind_the_Back_Shrug',
  'Dumbbell Shrug': 'Dumbbell_Shrug',
  // Biceps
  'Cable Hammer Curls (Rope)': 'Cable_Hammer_Curls_-_Rope_Attachment',
  // Triceps
  'Lying Dumbbell Tricep Extension': 'Lying_Dumbbell_Tricep_Extension',
  'Standing Dumbbell Tricep Extension': 'Standing_Dumbbell_Triceps_Extension',
  'Dumbbell One-Arm Triceps Extension': 'Dumbbell_One-Arm_Triceps_Extension',
  'Cable Lying Triceps Extension': 'Cable_Lying_Triceps_Extension',
  'Cable One-Arm Tricep Extension': 'Cable_One_Arm_Tricep_Extension',
  // Calves
  'Standing Dumbbell Calf Raise': 'Standing_Dumbbell_Calf_Raise',
  'Standing Barbell Calf Raise': 'Standing_Barbell_Calf_Raise',
  // Adduction / core / forearms
  'Cable Hip Adduction': 'Cable_Hip_Adduction',
  'Standing Cable Wood Chop': 'Standing_Cable_Wood_Chop',
  'Seated Glute Stretch': 'Seated_Glute',
  'Wrist Roller': 'Wrist_Roller',

  // ── Widened FEDB-backed tranche #4 (data-only, zero new fetch) ───────────────
  // A further slice of distinct catalogue movements. Every KEY below is NEW —
  // absent from GRANDFATHERED, the FEDB_BACKED_SLUGS entries above (tranches #1-#3),
  // YOUTUBE_PENDING and GIF_PENDING — so buildCuratedDemos() admits each one as
  // kind:'fedb_frames', verified:false. Every slug VALUE was machine-verified to be
  // present in BOTH FEDB_SLUGS (exerciseDemos.ts) AND __tests__/fixtures/
  // fedb-catalog-slugs.json (the 873-slug catalogue), and each slug is a fresh dir
  // not already referenced by an earlier tranche — so every entry resolves to an
  // ordered 2-frame [0.jpg, 1.jpg] HTTPS pair with NO new HTTP call. Strictly
  // additive: the kind:'youtube'-only sync guard (scripts/check-demo-maps-in-sync.js)
  // and pendingHumanReviewIds.json (YouTube ids only) are both untouched, so
  // check-demo-maps-in-sync stays green.

  // Triceps — barbell / EZ-bar / dumbbell isolation
  'Decline EZ Bar Triceps Extension': 'Decline_EZ_Bar_Triceps_Extension',
  'Incline Barbell Triceps Extension': 'Incline_Barbell_Triceps_Extension',
  'Seated Bent-Over One-Arm Dumbbell Triceps Extension': 'Seated_Bent-Over_One-Arm_Dumbbell_Triceps_Extension',
  // Shoulders — dumbbell / cable / machine press
  'Dumbbell One-Arm Shoulder Press': 'Dumbbell_One-Arm_Shoulder_Press',
  'Cable Shoulder Press': 'Cable_Shoulder_Press',
  'Machine Shoulder (Military) Press': 'Machine_Shoulder_Military_Press',
  'Smith Machine Upright Row': 'Smith_Machine_Upright_Row',
  // Chest — cable
  'Standing Cable Chest Press': 'Standing_Cable_Chest_Press',
  // Legs / glutes — machine & bodyweight
  'Lying Machine Squat': 'Lying_Machine_Squat',
  'Single Leg Glute Bridge': 'Single_Leg_Glute_Bridge',
  // Traps — cable
  'Cable Shrug': 'Cable_Shrugs',

  // ── Widened FEDB-backed tranche #5 (data-only, zero new fetch) ───────────────
  // A further slice of distinct catalogue movements. Every KEY below is NEW —
  // absent from GRANDFATHERED, the FEDB_BACKED_SLUGS entries above (tranches #1-#4),
  // YOUTUBE_PENDING and GIF_PENDING — so buildCuratedDemos() admits each one as
  // kind:'fedb_frames', verified:false. Every slug VALUE was machine-verified to be
  // present in BOTH FEDB_SLUGS (exerciseDemos.ts) AND __tests__/fixtures/
  // fedb-catalog-slugs.json (the shipped 873-slug catalogue), and each is a fresh
  // slug dir not already referenced by an earlier tranche — so every entry resolves
  // to an ordered 2-frame [0.jpg, 1.jpg] HTTPS pair with NO new HTTP call. Strictly
  // additive: the kind:'youtube'-only sync guard (scripts/check-demo-maps-in-sync.js)
  // and pendingHumanReviewIds.json (YouTube ids only) are both untouched, so
  // check-demo-maps-in-sync stays green.

  // Chest — dumbbell / cable / machine variants
  'Incline Dumbbell Press': 'Incline_Dumbbell_Press',
  'Cable Chest Press': 'Cable_Chest_Press',
  'Leverage Chest Press': 'Leverage_Chest_Press',
  'Incline Cable Flye': 'Incline_Cable_Flye',
  'Bent-Arm Dumbbell Pullover': 'Bent-Arm_Dumbbell_Pullover',
  // Back / pulls
  'Incline Bench Pull': 'Incline_Bench_Pull',
  'Leverage High Row': 'Leverage_High_Row',
  'Elevated Cable Rows': 'Elevated_Cable_Rows',
  'Weighted Pull Ups': 'Weighted_Pull_Ups',
  // Shoulders / delts
  'Cuban Press': 'Cuban_Press',
  'Leverage Shoulder Press': 'Leverage_Shoulder_Press',
  'Standing Alternating Dumbbell Press': 'Standing_Alternating_Dumbbell_Press',
  'Side Laterals to Front Raise': 'Side_Laterals_to_Front_Raise',
  // Arms — biceps / triceps
  'Overhead Cable Curl': 'Overhead_Cable_Curl',
  'Reverse Cable Curl': 'Reverse_Cable_Curl',
  'Zottman Preacher Curl': 'Zottman_Preacher_Curl',
  'Standing Towel Triceps Extension': 'Standing_Towel_Triceps_Extension',
  'Decline Dumbbell Triceps Extension': 'Decline_Dumbbell_Triceps_Extension',
  // Legs / glutes
  'Standing Leg Curl': 'Standing_Leg_Curl',
  'Glute Kickback': 'Glute_Kickback',
  'One Leg Barbell Squat': 'One_Leg_Barbell_Squat',
  'Weighted Sissy Squat': 'Weighted_Sissy_Squat',

  // ── Widened FEDB-backed tranche #6 (data-only, zero new fetch) ───────────────
  // A further slice of distinct catalogue movements. Every KEY below is NEW —
  // absent from GRANDFATHERED, the FEDB_BACKED_SLUGS entries above (tranches #1-#5),
  // YOUTUBE_PENDING and GIF_PENDING — so buildCuratedDemos() admits each one as
  // kind:'fedb_frames', verified:false (precedence: an already-set name is skipped).
  // Every slug VALUE was machine-verified to be present in BOTH FEDB_SLUGS
  // (exerciseDemos.ts) AND __tests__/fixtures/fedb-catalog-slugs.json (the shipped
  // 873-slug catalogue), and each is a fresh slug dir not already referenced by an
  // earlier tranche — so every entry resolves to an ordered 2-frame [0.jpg, 1.jpg]
  // HTTPS pair via fedbPair() with NO new HTTP call. Strictly additive: the
  // kind:'youtube'-only sync guard (scripts/check-demo-maps-in-sync.js) and
  // pendingHumanReviewIds.json (YouTube ids only) are both untouched, so
  // check-demo-maps-in-sync stays green.

  // Bodyweight / dips
  'Parallel Bar Dip': 'Parallel_Bar_Dip',
  'Ring Dips': 'Ring_Dips',
  'Bench Dips': 'Bench_Dips',
  'Handstand Push-Ups': 'Handstand_Push-Ups',
  'Incline Push-Up': 'Incline_Push-Up',
  'Single-Arm Push-Up': 'Single-Arm_Push-Up',
  // Chest / press variants
  'Close-Grip Dumbbell Press': 'Close-Grip_Dumbbell_Press',
  'Board Press': 'Board_Press',
  'Pin Presses': 'Pin_Presses',
  'Svend Press': 'Svend_Press',
  'Reverse Triceps Bench Press': 'Reverse_Triceps_Bench_Press',
  // Biceps
  'Close-Grip EZ Bar Curl': 'Close-Grip_EZ_Bar_Curl',
  'Standing Concentration Curl': 'Standing_Concentration_Curl',
  'Two-Arm Dumbbell Preacher Curl': 'Two-Arm_Dumbbell_Preacher_Curl',
  // Back / pulls
  'Straight-Arm Dumbbell Pullover': 'Straight-Arm_Dumbbell_Pullover',
  'Upright Cable Row': 'Upright_Cable_Row',
  'Kneeling High Pulley Row': 'Kneeling_High_Pulley_Row',
  'V-Bar Pullup': 'V-Bar_Pullup',
  // Triceps
  'Triceps Pushdown (V-Bar Attachment)': 'Triceps_Pushdown_-_V-Bar_Attachment',
  // Legs / calves
  'Frankenstein Squat': 'Frankenstein_Squat',
  'Chair Squat': 'Chair_Squat',
  'Calf Press': 'Calf_Press',

  // ── Widened FEDB-backed tranche #7 (data-only, zero new fetch) ───────────────
  // A further slice of distinct catalogue movements. Every KEY below is NEW —
  // absent from GRANDFATHERED, the FEDB_BACKED_SLUGS entries above (tranches #1-#6),
  // YOUTUBE_PENDING and GIF_PENDING — so buildCuratedDemos() admits each one as
  // kind:'fedb_frames', verified:false (precedence: an already-set name is skipped).
  // Every slug VALUE was machine-verified to be present in BOTH FEDB_SLUGS
  // (exerciseDemos.ts) AND __tests__/fixtures/fedb-catalog-slugs.json (the shipped
  // 873-slug catalogue), and each is a fresh slug dir not already referenced by an
  // earlier tranche — so every entry resolves to an ordered 2-frame [0.jpg, 1.jpg]
  // HTTPS pair via fedbPair() with NO new HTTP call. Strictly additive: the
  // kind:'youtube'-only sync guard (scripts/check-demo-maps-in-sync.js) and
  // pendingHumanReviewIds.json (YouTube ids only) are both untouched, so
  // check-demo-maps-in-sync stays green.

  // Chest / press — barbell / dumbbell / machine / bodyweight variants
  'Pushups Close and Wide Hand Positions': 'Pushups_Close_and_Wide_Hand_Positions',
  'One Arm Dumbbell Bench Press': 'One_Arm_Dumbbell_Bench_Press',
  'Decline Smith Press': 'Decline_Smith_Press',
  'Incline Push-Up Depth Jump': 'Incline_Push-Up_Depth_Jump',
  'Around The Worlds': 'Around_The_Worlds',
  // Shoulders / delts
  'Dumbbell Lying Rear Lateral Raise': 'Dumbbell_Lying_Rear_Lateral_Raise',
  'Bent Over Dumbbell Rear Delt Raise With Head On Bench': 'Bent_Over_Dumbbell_Rear_Delt_Raise_With_Head_On_Bench',
  // Back / rows / climbs
  'Bent Over Two-Arm Long Bar Row': 'Bent_Over_Two-Arm_Long_Bar_Row',
  'Rope Climb': 'Rope_Climb',
  // Biceps
  'Alternate Hammer Curl': 'Alternate_Hammer_Curl',
  'Barbell Curls Lying Against An Incline': 'Barbell_Curls_Lying_Against_An_Incline',
  'Seated Dumbbell Inner Biceps Curl': 'Seated_Dumbbell_Inner_Biceps_Curl',
  // Triceps
  'Triceps Overhead Extension with Rope': 'Triceps_Overhead_Extension_with_Rope',
  'Cable Incline Triceps Extension': 'Cable_Incline_Triceps_Extension',
  'Dip Machine': 'Dip_Machine',
  // Legs / glutes / hamstrings
  'Dumbbell Squat To A Bench': 'Dumbbell_Squat_To_A_Bench',
  'Smith Single-Leg Split Squat': 'Smith_Single-Leg_Split_Squat',
  'Wide Stance Stiff Legs': 'Wide_Stance_Stiff_Legs',
  'Seated Band Hamstring Curl': 'Seated_Band_Hamstring_Curl',
  'Standing Hip Circles': 'Standing_Hip_Circles',
  // Core / obliques
  'Seated Barbell Twist': 'Seated_Barbell_Twist',
  'Barbell Side Bend': 'Barbell_Side_Bend',
  'Cable Judo Flip': 'Cable_Judo_Flip',
  'Decline Reverse Crunch': 'Decline_Reverse_Crunch',
  'Otis-Up': 'Otis-Up',
  'Toe Touchers': 'Toe_Touchers',
  'Seated Flat Bench Leg Pull-In': 'Seated_Flat_Bench_Leg_Pull-In',
  'Crunch - Hands Overhead': 'Crunch_-_Hands_Overhead',
  'Crunch - Legs On Exercise Ball': 'Crunch_-_Legs_On_Exercise_Ball',
  // Olympic / power
  'Hang Clean': 'Hang_Clean',
  'Power Clean': 'Power_Clean',
  'Clean and Press': 'Clean_and_Press',
  'Clean and Jerk': 'Clean_and_Jerk',
  'Hang Snatch': 'Hang_Snatch',
  'Power Snatch': 'Power_Snatch',
  // Kettlebell
  'Double Kettlebell Snatch': 'Double_Kettlebell_Snatch',
  'Kettlebell Pirate Ships': 'Kettlebell_Pirate_Ships',
  'One-Arm Kettlebell Clean': 'One-Arm_Kettlebell_Clean',
  'One-Arm Kettlebell Snatch': 'One-Arm_Kettlebell_Snatch',

  // ── Widened FEDB-backed tranche #8 (data-only, zero new fetch) ───────────────
  // A further slice of distinct catalogue movements. Every KEY below is NEW —
  // absent from GRANDFATHERED, the FEDB_BACKED_SLUGS entries above (tranches #1-#7),
  // YOUTUBE_PENDING and GIF_PENDING — so buildCuratedDemos() admits each one as
  // kind:'fedb_frames', verified:false (precedence: an already-set name is skipped).
  // Every slug VALUE was machine-verified to be present in BOTH FEDB_SLUGS
  // (exerciseDemos.ts) AND __tests__/fixtures/fedb-catalog-slugs.json (the shipped
  // 873-slug catalogue), and each is a fresh slug dir not already referenced by an
  // earlier tranche — so every entry resolves to an ordered 2-frame [0.jpg, 1.jpg]
  // HTTPS pair via fedbPair() with NO new HTTP call. Strictly additive: the
  // kind:'youtube'-only sync guard (scripts/check-demo-maps-in-sync.js) and
  // pendingHumanReviewIds.json (YouTube ids only) are both untouched, so
  // check-demo-maps-in-sync stays green.

  // Barbell / Smith / EZ-bar — press & pullover
  'Smith Machine Close-Grip Bench Press': 'Smith_Machine_Close-Grip_Bench_Press',
  'Smith Machine Overhead Shoulder Press': 'Smith_Machine_Overhead_Shoulder_Press',
  'Smith Machine Decline Press': 'Smith_Machine_Decline_Press',
  'Close-Grip EZ-Bar Press': 'Close-Grip_EZ-Bar_Press',
  'Bent-Arm Barbell Pullover': 'Bent-Arm_Barbell_Pullover',
  // Legs / squats — machine & single-leg
  'Smith Machine Leg Press': 'Smith_Machine_Leg_Press',
  'Narrow Stance Leg Press': 'Narrow_Stance_Leg_Press',
  'Narrow Stance Hack Squats': 'Narrow_Stance_Hack_Squats',
  'Smith Machine Pistol Squat': 'Smith_Machine_Pistol_Squat',
  'Split Squats': 'Split_Squats',
  // Posterior chain — deadlift / good morning / glute-ham
  'Smith Machine Stiff-Legged Deadlift': 'Smith_Machine_Stiff-Legged_Deadlift',
  'Seated Good Mornings': 'Seated_Good_Mornings',
  'Natural Glute Ham Raise': 'Natural_Glute_Ham_Raise',
  // Back / rows / pulldowns
  'Lying Cambered Barbell Row': 'Lying_Cambered_Barbell_Row',
  'Straight Bar Bench Mid Rows': 'Straight_Bar_Bench_Mid_Rows',
  'One-Arm Long Bar Row': 'One-Arm_Long_Bar_Row',
  'Rope Straight-Arm Pulldown': 'Rope_Straight-Arm_Pulldown',
  'Full Range-Of-Motion Lat Pulldown': 'Full_Range-Of-Motion_Lat_Pulldown',
  // Shoulders / delts
  'Cable Rope Rear-Delt Rows': 'Cable_Rope_Rear-Delt_Rows',
  'Seated Front Deltoid': 'Seated_Front_Deltoid',
  'Front Two-Dumbbell Raise': 'Front_Two-Dumbbell_Raise',
  // Biceps
  'Seated Close-Grip Concentration Barbell Curl': 'Seated_Close-Grip_Concentration_Barbell_Curl',
  'Preacher Hammer Dumbbell Curl': 'Preacher_Hammer_Dumbbell_Curl',
  'One Arm Dumbbell Preacher Curl': 'One_Arm_Dumbbell_Preacher_Curl',
  'Reverse Barbell Preacher Curls': 'Reverse_Barbell_Preacher_Curls',
  // Triceps
  'Kneeling Cable Triceps Extension': 'Kneeling_Cable_Triceps_Extension',
  'Low Cable Triceps Extension': 'Low_Cable_Triceps_Extension',
  'Triceps Pushdown (Rope Attachment)': 'Triceps_Pushdown_-_Rope_Attachment',
  // Calves / core
  'Barbell Seated Calf Raise': 'Barbell_Seated_Calf_Raise',
  'Cable Reverse Crunch': 'Cable_Reverse_Crunch',
  // Kettlebell
  'Two-Arm Kettlebell Military Press': 'Two-Arm_Kettlebell_Military_Press',
  'Kettlebell Pistol Squat': 'Kettlebell_Pistol_Squat',

  // ── Widened FEDB-backed tranche #9 (data-only, zero new fetch) ───────────────
  // A further slice of distinct catalogue movements. Every KEY below is NEW —
  // absent from GRANDFATHERED, the FEDB_BACKED_SLUGS entries above (tranches #1-#8),
  // YOUTUBE_PENDING and GIF_PENDING — so buildCuratedDemos() admits each one as
  // kind:'fedb_frames', verified:false (precedence: an already-set name is skipped).
  // Every slug VALUE was machine-verified to be present in BOTH FEDB_SLUGS
  // (exerciseDemos.ts) AND __tests__/fixtures/fedb-catalog-slugs.json (the shipped
  // 873-slug catalogue), and each is a fresh slug dir not already referenced by an
  // earlier tranche — so every entry resolves to an ordered 2-frame [0.jpg, 1.jpg]
  // HTTPS pair via fedbPair() with NO new HTTP call. Strictly additive: the
  // kind:'youtube'-only sync guard (scripts/check-demo-maps-in-sync.js) and
  // pendingHumanReviewIds.json (YouTube ids only) are both untouched, so
  // check-demo-maps-in-sync stays green.

  // Dumbbell — flyes / raises / curls
  'One-Arm Flat Bench Dumbbell Flye': 'One-Arm_Flat_Bench_Dumbbell_Flye',
  'Alternate Incline Dumbbell Curl': 'Alternate_Incline_Dumbbell_Curl',
  'Dumbbell Prone Incline Curl': 'Dumbbell_Prone_Incline_Curl',
  'Lying Supine Dumbbell Curl': 'Lying_Supine_Dumbbell_Curl',
  'Dumbbell Scaption': 'Dumbbell_Scaption',
  'Alternating Deltoid Raise': 'Alternating_Deltoid_Raise',
  'Lying One-Arm Lateral Raise': 'Lying_One-Arm_Lateral_Raise',
  'Front Incline Dumbbell Raise': 'Front_Incline_Dumbbell_Raise',
  'Lying Rear Delt Raise': 'Lying_Rear_Delt_Raise',
  // Cable / machine — chest / shoulders / back
  'Single-Arm Cable Crossover': 'Single-Arm_Cable_Crossover',
  'Incline Cable Chest Press': 'Incline_Cable_Chest_Press',
  'Alternating Cable Shoulder Press': 'Alternating_Cable_Shoulder_Press',
  'Low Pulley Row To Neck': 'Low_Pulley_Row_To_Neck',
  'Leverage Iso Row': 'Leverage_Iso_Row',
  'Leverage Decline Chest Press': 'Leverage_Decline_Chest_Press',
  // Triceps — dumbbell / cable
  'Standing One-Arm Dumbbell Triceps Extension': 'Standing_One-Arm_Dumbbell_Triceps_Extension',
  'Seated Bent-Over Two-Arm Dumbbell Triceps Extension': 'Seated_Bent-Over_Two-Arm_Dumbbell_Triceps_Extension',
  'Cable Incline Pushdown': 'Cable_Incline_Pushdown',
  'Dumbbell Tricep Extension (Pronated Grip)': 'Dumbbell_Tricep_Extension_-Pronated_Grip',
  // Back / pulls / dips
  'One Arm Chin-Up': 'One_Arm_Chin-Up',
  'Bent Over One-Arm Long Bar Row': 'Bent_Over_One-Arm_Long_Bar_Row',
  'Dips (Chest Version)': 'Dips_-_Chest_Version',
  'Inverted Row with Straps': 'Inverted_Row_with_Straps',
  // Legs / glutes / hamstrings
  'Ball Leg Curl': 'Ball_Leg_Curl',
  'Single-Leg Leg Extension': 'Single-Leg_Leg_Extension',
  'Single-Leg High Box Squat': 'Single-Leg_High_Box_Squat',
  'Kneeling Squat': 'Kneeling_Squat',
  'Freehand Jump Squat': 'Freehand_Jump_Squat',
  // Core / abs
  'Decline Oblique Crunch': 'Decline_Oblique_Crunch',
  'Flat Bench Lying Leg Raise': 'Flat_Bench_Lying_Leg_Raise',
  'Gorilla Chin Crunch': 'Gorilla_Chin_Crunch',
  'Tuck Crunch': 'Tuck_Crunch',
  'Cocoons': 'Cocoons',
  // Kettlebell / conditioning
  'Kettlebell Arnold Press': 'Kettlebell_Arnold_Press',
  'One-Arm Kettlebell Row': 'One-Arm_Kettlebell_Row',
  'Two-Arm Kettlebell Clean': 'Two-Arm_Kettlebell_Clean',
  // Calves
  'Calf Raise On A Dumbbell': 'Calf_Raise_On_A_Dumbbell',
  'Dumbbell Seated One-Leg Calf Raise': 'Dumbbell_Seated_One-Leg_Calf_Raise',

  // ── Widened FEDB-backed tranche #10 (data-only, zero new fetch) ──────────────
  // A further slice of distinct catalogue movements. Every KEY below is NEW —
  // absent from GRANDFATHERED, the FEDB_BACKED_SLUGS entries above (tranches #1-#9),
  // YOUTUBE_PENDING and GIF_PENDING — so buildCuratedDemos() admits each one as
  // kind:'fedb_frames', verified:false (precedence: an already-set name is skipped).
  // Every slug VALUE was machine-verified to be present in BOTH FEDB_SLUGS
  // (exerciseDemos.ts) AND __tests__/fixtures/fedb-catalog-slugs.json (the shipped
  // 873-slug catalogue), and each is a fresh slug dir not already referenced by an
  // earlier tranche — so every entry resolves to an ordered 2-frame [0.jpg, 1.jpg]
  // HTTPS pair via fedbPair() with NO new HTTP call. Strictly additive: the
  // kind:'youtube'-only sync guard (scripts/check-demo-maps-in-sync.js) and
  // pendingHumanReviewIds.json (YouTube ids only) are both untouched, so
  // check-demo-maps-in-sync stays green.

  // Forearms / wrist curls
  'Palms-Down Wrist Curl Over A Bench': 'Palms-Down_Wrist_Curl_Over_A_Bench',
  'Palms-Up Barbell Wrist Curl Over A Bench': 'Palms-Up_Barbell_Wrist_Curl_Over_A_Bench',
  'Cable Wrist Curl': 'Cable_Wrist_Curl',
  'Standing Palms-Up Barbell Behind The Back Wrist Curl': 'Standing_Palms-Up_Barbell_Behind_The_Back_Wrist_Curl',
  'Seated Dumbbell Palms-Down Wrist Curl': 'Seated_Dumbbell_Palms-Down_Wrist_Curl',
  // Grip / strongman
  'Plate Pinch': 'Plate_Pinch',
  "Farmer's Walk": 'Farmers_Walk',
  'Atlas Stones': 'Atlas_Stones',
  // Olympic / power — dumbbell clean
  'Dumbbell Clean': 'Dumbbell_Clean',
  'Bottoms-Up Clean From The Hang Position': 'Bottoms-Up_Clean_From_The_Hang_Position',
  'Single-Arm Linear Jammer': 'Single-Arm_Linear_Jammer',
  // Core / abs — rollouts & suspended/crawl variants
  'Barbell Ab Rollout': 'Barbell_Ab_Rollout',
  'Barbell Ab Rollout - On Knees': 'Barbell_Ab_Rollout_-_On_Knees',
  'Spider Crawl': 'Spider_Crawl',
  'Suspended Push-Up': 'Suspended_Push-Up',
  'Suspended Row': 'Suspended_Row',
  'Suspended Reverse Crunch': 'Suspended_Reverse_Crunch',
  // Mobility / stretch staples
  'Cat Stretch': 'Cat_Stretch',
  "Child's Pose": 'Childs_Pose',
  'Standing Hip Flexors': 'Standing_Hip_Flexors',

  // ── Widened FEDB-backed tranche #11 (data-only, zero new fetch) ──────────────
  // A further slice of distinct catalogue movements. Every KEY below is NEW —
  // absent from GRANDFATHERED, the FEDB_BACKED_SLUGS entries above (tranches #1-#10),
  // YOUTUBE_PENDING and GIF_PENDING — so buildCuratedDemos() admits each one as
  // kind:'fedb_frames', verified:false (precedence: an already-set name is skipped).
  // Every slug VALUE was machine-verified to be present in BOTH FEDB_SLUGS
  // (exerciseDemos.ts) AND __tests__/fixtures/fedb-catalog-slugs.json (the shipped
  // 873-slug catalogue), and each is a fresh slug dir not already referenced by an
  // earlier tranche — so every entry resolves to an ordered 2-frame [0.jpg, 1.jpg]
  // HTTPS pair via fedbPair() with NO new HTTP call. Strictly additive: the
  // kind:'youtube'-only sync guard (scripts/check-demo-maps-in-sync.js) and
  // pendingHumanReviewIds.json (YouTube ids only) are both untouched, so
  // check-demo-maps-in-sync stays green. A 200-ok URL is NOT a movement review,
  // so nothing here is verified:true — that stays a human-gated step.

  // Machines / cable isolation
  'Ab Crunch Machine': 'Ab_Crunch_Machine',
  'Calf-Machine Shoulder Shrug': 'Calf-Machine_Shoulder_Shrug',
  'Cable Internal Rotation': 'Cable_Internal_Rotation',
  'Cable Seated Crunch': 'Cable_Seated_Crunch',
  'Cable Iron Cross': 'Cable_Iron_Cross',
  // Barbell / Smith variants
  'Barbell Guillotine Bench Press': 'Barbell_Guillotine_Bench_Press',
  'Barbell Incline Shoulder Raise': 'Barbell_Incline_Shoulder_Raise',
  'Barbell Shrug Behind The Back': 'Barbell_Shrug_Behind_The_Back',
  'Bradford Rocky Presses': 'Bradford_Rocky_Presses',
  'Bent Press': 'Bent_Press',
  // Dumbbell / pulley variants
  'Bent Over Two-Dumbbell Row With Palms In': 'Bent_Over_Two-Dumbbell_Row_With_Palms_In',
  'Bent Over Low-Pulley Side Lateral': 'Bent_Over_Low-Pulley_Side_Lateral',
  'Car Drivers': 'Car_Drivers',
  // Bodyweight / core
  'Bent-Knee Hip Raise': 'Bent-Knee_Hip_Raise',
  'Body Tricep Press': 'Body_Tricep_Press',
  'Bodyweight Mid Row': 'Bodyweight_Mid_Row',
  'Bodyweight Flyes': 'Bodyweight_Flyes',
  'Butt Lift Bridge': 'Butt_Lift_Bridge',
  'Ab Roller': 'Ab_Roller',
  'Barbell Rollout from Bench': 'Barbell_Rollout_from_Bench',
  // Conditioning / plyo
  'Bench Jump': 'Bench_Jump',
  'Bench Sprint': 'Bench_Sprint',
  'Box Skip': 'Box_Skip',
  'Catch and Overhead Throw': 'Catch_and_Overhead_Throw',
  // Strongman
  'Atlas Stone Trainer': 'Atlas_Stone_Trainer',
  'Axle Deadlift': 'Axle_Deadlift',
  'Car Deadlift': 'Car_Deadlift',

  // ── Widened FEDB-backed tranche #12 (data-only, zero new fetch) ──────────────
  // A further slice of distinct catalogue movements. Every KEY below is NEW —
  // absent from GRANDFATHERED, the FEDB_BACKED_SLUGS entries above (tranches #1-#11),
  // YOUTUBE_PENDING and GIF_PENDING — so buildCuratedDemos() admits each one as
  // kind:'fedb_frames', verified:false (precedence: an already-set name is skipped).
  // Every slug VALUE was machine-verified (scripts derivation) to be present in BOTH
  // FEDB_SLUGS (exerciseDemos.ts) AND __tests__/fixtures/fedb-catalog-slugs.json (the
  // shipped 873-slug catalogue), and each is a fresh slug dir not already referenced
  // by an earlier tranche (nor by DEMO_FRAMES) — so every entry resolves to an ordered
  // 2-frame [0.jpg, 1.jpg] HTTPS pair via fedbPair() with NO new HTTP call. Strictly
  // additive: the kind:'youtube'-only sync guard (scripts/check-demo-maps-in-sync.js)
  // and pendingHumanReviewIds.json (YouTube ids only) are both untouched, so
  // check-demo-maps-in-sync stays green. A 200-ok URL is NOT a movement review, so
  // nothing here is verified:true — that remains a human-gated step.

  // Chest / push-up variants
  'Reverse Band Bench Press': 'Reverse_Band_Bench_Press',
  'Clock Push-Up': 'Clock_Push-Up',
  'Close-Grip Push-Up off of a Dumbbell': 'Close-Grip_Push-Up_off_of_a_Dumbbell',
  'Push-Ups - Close Triceps Position': 'Push-Ups_-_Close_Triceps_Position',
  // Back / rows / vertical pulls
  'Alternating Renegade Row': 'Alternating_Renegade_Row',
  'Alternating Kettlebell Row': 'Alternating_Kettlebell_Row',
  'Kneeling Single-Arm High Pulley Row': 'Kneeling_Single-Arm_High_Pulley_Row',
  'Mixed Grip Chin': 'Mixed_Grip_Chin',
  'Band Assisted Pull-Up': 'Band_Assisted_Pull-Up',
  'Band Pull Apart': 'Band_Pull_Apart',
  // Shoulders / delts / traps
  'One-Arm Incline Lateral Raise': 'One-Arm_Incline_Lateral_Raise',
  'Dumbbell Lying One-Arm Rear Lateral Raise': 'Dumbbell_Lying_One-Arm_Rear_Lateral_Raise',
  'Leverage Shrug': 'Leverage_Shrug',
  'Clean Shrug': 'Clean_Shrug',
  // Biceps
  'Finger Curls': 'Finger_Curls',
  'Incline Inner Biceps Curl': 'Incline_Inner_Biceps_Curl',
  'Standing One-Arm Dumbbell Curl Over Incline Bench': 'Standing_One-Arm_Dumbbell_Curl_Over_Incline_Bench',
  // Triceps
  'Band Skull Crusher': 'Band_Skull_Crusher',
  'One Arm Pronated Dumbbell Triceps Extension': 'One_Arm_Pronated_Dumbbell_Triceps_Extension',
  'One Arm Supinated Dumbbell Triceps Extension': 'One_Arm_Supinated_Dumbbell_Triceps_Extension',
  // Legs / squats / posterior chain / glutes
  'Barbell Squat To A Bench': 'Barbell_Squat_To_A_Bench',
  'Front Barbell Squat To A Bench': 'Front_Barbell_Squat_To_A_Bench',
  'One-Legged Cable Kickback': 'One-Legged_Cable_Kickback',
  'Kettlebell One-Legged Deadlift': 'Kettlebell_One-Legged_Deadlift',
  // Core / obliques
  'Dumbbell Side Bend': 'Dumbbell_Side_Bend',
  'Rope Crunch': 'Rope_Crunch',
  'Plate Twist': 'Plate_Twist',
  'Side Jackknife': 'Side_Jackknife',

  // ── Widened FEDB-backed tranche #13 (data-only, zero new fetch) ──────────────
  // A further slice of distinct catalogue movements. Every KEY below is NEW —
  // absent from GRANDFATHERED, the FEDB_BACKED_SLUGS entries above (tranches #1-#12),
  // YOUTUBE_PENDING and GIF_PENDING — so buildCuratedDemos() admits each one as
  // kind:'fedb_frames', verified:false (precedence: an already-set name is skipped).
  // Every slug VALUE was machine-verified to be present in BOTH FEDB_SLUGS
  // (exerciseDemos.ts) AND __tests__/fixtures/fedb-catalog-slugs.json (the shipped
  // 873-slug catalogue), and each is a fresh slug dir not already referenced by an
  // earlier tranche — so every entry resolves to an ordered 2-frame [0.jpg, 1.jpg]
  // HTTPS pair via fedbPair() with NO new HTTP call. Strictly additive: the
  // kind:'youtube'-only sync guard (scripts/check-demo-maps-in-sync.js) and
  // pendingHumanReviewIds.json (YouTube ids only) are both untouched, so
  // check-demo-maps-in-sync stays green. A 200-ok URL is NOT a movement review, so
  // nothing here is verified:true — that remains a human-gated step.

  // Olympic / power — clean & snatch family
  'Clean': 'Clean',
  'Snatch': 'Snatch',
  'Clean Pull': 'Clean_Pull',
  'Snatch Pull': 'Snatch_Pull',
  'Muscle Snatch': 'Muscle_Snatch',
  'Power Jerk': 'Power_Jerk',
  'Split Jerk': 'Split_Jerk',
  'Split Clean': 'Split_Clean',
  'Snatch Balance': 'Snatch_Balance',
  // Strongman / loaded carries
  'Log Lift': 'Log_Lift',
  'Tire Flip': 'Tire_Flip',
  'Yoke Walk': 'Yoke_Walk',
  'Sled Push': 'Sled_Push',
  'Sled Row': 'Sled_Row',
  'Keg Load': 'Keg_Load',
  // Plyometric / conditioning
  'Knee Tuck Jump': 'Knee_Tuck_Jump',
  'Star Jump': 'Star_Jump',
  'Rocket Jump': 'Rocket_Jump',
  'Standing Long Jump': 'Standing_Long_Jump',
  'Lateral Box Jump': 'Lateral_Box_Jump',
  // Triceps / forearms isolation
  'Standing Bent-Over Two-Arm Dumbbell Triceps Extension': 'Standing_Bent-Over_Two-Arm_Dumbbell_Triceps_Extension',
  'Seated Dumbbell Palms-Up Wrist Curl': 'Seated_Dumbbell_Palms-Up_Wrist_Curl',
  // Core / abs
  'Scissor Kick': 'Scissor_Kick',
  'Stomach Vacuum': 'Stomach_Vacuum',

  // ── Widened FEDB-backed tranche #14 (data-only, zero new fetch) ──────────────
  // A further slice of distinct catalogue movements — this tranche leans into the
  // stretch/mobility, neck, forearm/wrist and lower-leg accessory work the earlier
  // tranches under-covered. Every KEY below is NEW — absent from GRANDFATHERED, the
  // FEDB_BACKED_SLUGS entries above (tranches #1-#13), YOUTUBE_PENDING and
  // GIF_PENDING — so buildCuratedDemos() admits each one as kind:'fedb_frames',
  // verified:false (precedence: an already-set name is skipped). Every slug VALUE
  // was machine-verified to be present in BOTH FEDB_SLUGS (exerciseDemos.ts) AND
  // __tests__/fixtures/fedb-catalog-slugs.json (the shipped 873-slug catalogue),
  // and each is a fresh slug dir not already referenced by an earlier tranche — so
  // every entry resolves to an ordered 2-frame [0.jpg, 1.jpg] HTTPS pair via
  // fedbPair() with NO new HTTP call. Strictly additive: the kind:'youtube'-only
  // sync guard (scripts/check-demo-maps-in-sync.js) and pendingHumanReviewIds.json
  // (YouTube ids only) are both untouched, so check-demo-maps-in-sync stays green.
  // A 200-ok URL is NOT a movement review, so nothing here is verified:true — that
  // remains a human-gated step.

  // Mobility / stretch staples
  'Hamstring Stretch': 'Hamstring_Stretch',
  'Quad Stretch': 'Quad_Stretch',
  'All Fours Quad Stretch': 'All_Fours_Quad_Stretch',
  'Kneeling Hip Flexor': 'Kneeling_Hip_Flexor',
  'Middle Back Stretch': 'Middle_Back_Stretch',
  'Chin To Chest Stretch': 'Chin_To_Chest_Stretch',
  'Behind Head Chest Stretch': 'Behind_Head_Chest_Stretch',
  'Dynamic Chest Stretch': 'Dynamic_Chest_Stretch',
  // Neck
  'Isometric Neck Exercise - Front And Back': 'Isometric_Neck_Exercise_-_Front_And_Back',
  'Isometric Neck Exercise - Sides': 'Isometric_Neck_Exercise_-_Sides',
  'Seated Head Harness Neck Resistance': 'Seated_Head_Harness_Neck_Resistance',
  // Forearm / wrist
  'Palms-Down Dumbbell Wrist Curl Over A Bench': 'Palms-Down_Dumbbell_Wrist_Curl_Over_A_Bench',
  'Palms-Up Dumbbell Wrist Curl Over A Bench': 'Palms-Up_Dumbbell_Wrist_Curl_Over_A_Bench',
  'Seated Palm-Up Barbell Wrist Curl': 'Seated_Palm-Up_Barbell_Wrist_Curl',
  'Seated Palms-Down Barbell Wrist Curl': 'Seated_Palms-Down_Barbell_Wrist_Curl',
  'Wrist Circles': 'Wrist_Circles',
  // Lower-leg / calf / tibialis / ankle
  'Ankle Circles': 'Ankle_Circles',
  'Smith Machine Reverse Calf Raises': 'Smith_Machine_Reverse_Calf_Raises',
  'Seated Leg Tucks': 'Seated_Leg_Tucks',
  // Glutes / hip accessory (band)
  'Hip Extension with Bands': 'Hip_Extension_with_Bands',
  'Thigh Abductor': 'Thigh_Abductor',
  'Band Hip Adductions': 'Band_Hip_Adductions',

  // ── Widened FEDB-backed tranche #15 (data-only, zero new fetch) ──────────────
  // A further slice of distinct catalogue movements — this tranche leans into the
  // flexibility/stretch, self-myofascial-release (foam-roll "-SMR") and band
  // posterior-chain accessory work the earlier tranches still under-covered. Every
  // KEY below is NEW — absent from GRANDFATHERED, the FEDB_BACKED_SLUGS entries
  // above (tranches #1-#14), YOUTUBE_PENDING and GIF_PENDING — so buildCuratedDemos()
  // admits each one as kind:'fedb_frames', verified:false (precedence: an already-set
  // name is skipped). Every slug VALUE was machine-verified to be present in BOTH
  // FEDB_SLUGS (exerciseDemos.ts) AND __tests__/fixtures/fedb-catalog-slugs.json (the
  // shipped 873-slug catalogue), and each is a fresh slug dir not already referenced
  // by an earlier tranche — so every entry resolves to an ordered 2-frame
  // [0.jpg, 1.jpg] HTTPS pair via fedbPair() with NO new HTTP call. Strictly
  // additive: the kind:'youtube'-only sync guard (scripts/check-demo-maps-in-sync.js)
  // and pendingHumanReviewIds.json (YouTube ids only) are both untouched, so
  // check-demo-maps-in-sync stays green. A 200-ok URL is NOT a movement review, so
  // nothing here is verified:true — that remains a human-gated step.

  // Mobility / stretch staples (lower body)
  'Lying Hamstring Stretch': 'Lying_Hamstring',
  'Seated Hamstring Stretch': 'Seated_Hamstring',
  'Standing Toe Touches': 'Standing_Toe_Touches',
  'Runners Stretch': 'Runners_Stretch',
  'On Your Back Quad Stretch': 'On-Your-Back_Quad_Stretch',
  'Standing Elevated Quad Stretch': 'Standing_Elevated_Quad_Stretch',
  'Lying Glute Stretch': 'Lying_Glute',
  'Knee To Chest': 'One_Knee_To_Chest',
  'IT Band and Glute Stretch': 'IT_Band_and_Glute_Stretch',
  'Standing Gastrocnemius Calf Stretch': 'Standing_Gastrocnemius_Calf_Stretch',
  // Mobility / stretch (upper body / spine)
  'Upper Back Stretch': 'Upper_Back_Stretch',
  'Side Neck Stretch': 'Side_Neck_Stretch',
  'Shoulder Stretch': 'Shoulder_Stretch',
  'Triceps Stretch': 'Triceps_Stretch',
  'Standing Biceps Stretch': 'Standing_Biceps_Stretch',
  'Spinal Stretch': 'Spinal_Stretch',
  // Foam-roll / self-myofascial release (-SMR)
  'Hamstring SMR': 'Hamstring-SMR',
  'Quadriceps SMR': 'Quadriceps-SMR',
  'Calves SMR': 'Calves-SMR',
  'Latissimus Dorsi SMR': 'Latissimus_Dorsi-SMR',
  // Band posterior-chain / shoulder accessory
  'Band Good Morning': 'Band_Good_Morning',
  'Hip Lift with Band': 'Hip_Lift_with_Band',
  'External Rotation with Band': 'External_Rotation_with_Band',
  'Lateral Raise with Bands': 'Lateral_Raise_-_With_Bands',

  // ── Widened FEDB-backed tranche #16 (data-only, zero new fetch) ──────────────
  // A further slice of distinct catalogue movements — this tranche leans into the
  // agility/plyometric, sled & strongman loaded-carry, medicine-ball and stationary
  // cardio/mobility work the earlier tranches still under-covered. Every KEY below
  // is NEW — absent from GRANDFATHERED, the FEDB_BACKED_SLUGS entries above
  // (tranches #1-#15), YOUTUBE_PENDING and GIF_PENDING — so buildCuratedDemos()
  // admits each one as kind:'fedb_frames', verified:false (precedence: an
  // already-set name is skipped). Every slug VALUE was machine-verified to be
  // present in BOTH FEDB_SLUGS (exerciseDemos.ts) AND __tests__/fixtures/
  // fedb-catalog-slugs.json (the shipped 873-slug catalogue), and each is a fresh
  // slug dir not already referenced by an earlier tranche — so every entry resolves
  // to an ordered 2-frame [0.jpg, 1.jpg] HTTPS pair via fedbPair() with NO new HTTP
  // call. Strictly additive: the kind:'youtube'-only sync guard
  // (scripts/check-demo-maps-in-sync.js) and pendingHumanReviewIds.json (YouTube
  // ids only) are both untouched, so check-demo-maps-in-sync stays green. A 200-ok
  // URL is NOT a movement review, so nothing here is verified:true — that remains a
  // human-gated step.

  // Agility / plyometric / conditioning
  'Lateral Bound': 'Lateral_Bound',
  'Lateral Cone Hops': 'Lateral_Cone_Hops',
  'Hurdle Hops': 'Hurdle_Hops',
  'Split Jump': 'Split_Jump',
  'Scissors Jump': 'Scissors_Jump',
  'Frog Hops': 'Frog_Hops',
  // Sled / strongman loaded carries
  'Backward Drag': 'Backward_Drag',
  'Conans Wheel': 'Conans_Wheel',
  'Rickshaw Carry': 'Rickshaw_Carry',
  'Sandbag Load': 'Sandbag_Load',
  // Medicine ball / power
  'Medicine Ball Chest Pass': 'Medicine_Ball_Chest_Pass',
  'Overhead Slam': 'Overhead_Slam',
  // Stationary cardio / mobility
  'Recumbent Bike': 'Recumbent_Bike',
  'Arm Circles': 'Arm_Circles',

  // ── Widened FEDB-backed tranche #17 (data-only, zero new fetch) ──────────────
  // A further slice of distinct catalogue movements — this tranche leans into the
  // floor-press, dumbbell/cable arm-isolation, pullover, leg-pull-in core and
  // kettlebell accessory work the earlier tranches still under-covered. Every KEY
  // below is NEW — absent from GRANDFATHERED, the FEDB_BACKED_SLUGS entries above
  // (tranches #1-#16), YOUTUBE_PENDING and GIF_PENDING — so buildCuratedDemos()
  // admits each one as kind:'fedb_frames', verified:false (precedence: an
  // already-set name is skipped). Every slug VALUE was machine-verified to be
  // present in BOTH FEDB_SLUGS (exerciseDemos.ts) AND __tests__/fixtures/
  // fedb-catalog-slugs.json (the shipped 873-slug catalogue), and each is a fresh
  // slug dir not already referenced by an earlier tranche — so every entry resolves
  // to an ordered 2-frame [0.jpg, 1.jpg] HTTPS pair via fedbPair() with NO new HTTP
  // call. Strictly additive: the kind:'youtube'-only sync guard
  // (scripts/check-demo-maps-in-sync.js) and pendingHumanReviewIds.json (YouTube
  // ids only) are both untouched, so check-demo-maps-in-sync stays green. A 200-ok
  // URL is NOT a movement review, so nothing here is verified:true — that remains a
  // human-gated step.

  // Chest / floor press & dumbbell-press variants
  'Alternating Floor Press': 'Alternating_Floor_Press',
  'One-Arm Floor Press': 'One_Arm_Floor_Press',
  'Leg-Over Floor Press': 'Leg-Over_Floor_Press',
  'Standing Palms-In Dumbbell Press': 'Standing_Palms-In_Dumbbell_Press',
  // Shoulders / delts
  'Dumbbell Raise': 'Dumbbell_Raise',
  'One-Arm Side Laterals': 'One-Arm_Side_Laterals',
  'Reverse Flyes With External Rotation': 'Reverse_Flyes_With_External_Rotation',
  // Biceps / forearm supination
  'Dumbbell Lying Supination': 'Dumbbell_Lying_Supination',
  'Reverse Plate Curls': 'Reverse_Plate_Curls',
  'Standing Inner-Biceps Curl': 'Standing_Inner-Biceps_Curl',
  'Flexor Incline Dumbbell Curls': 'Flexor_Incline_Dumbbell_Curls',
  // Triceps
  'Standing Bent-Over One-Arm Dumbbell Triceps Extension': 'Standing_Bent-Over_One-Arm_Dumbbell_Triceps_Extension',
  // Back / pullovers / rows / chins
  'Wide-Grip Decline Barbell Pullover': 'Wide-Grip_Decline_Barbell_Pullover',
  'Front Raise And Pullover': 'Front_Raise_And_Pullover',
  'Middle Back Shrug': 'Middle_Back_Shrug',
  'Side To Side Chins': 'Side_To_Side_Chins',
  'Shotgun Row': 'Shotgun_Row',
  'Lower Back Curl': 'Lower_Back_Curl',
  // Core / abs — leg-pull-in family
  'Frog Sit-Ups': 'Frog_Sit-Ups',
  'Leg Pull-In': 'Leg_Pull-In',
  'Flat Bench Leg Pull-In': 'Flat_Bench_Leg_Pull-In',
  // Kettlebell accessory
  'Kettlebell Figure 8': 'Kettlebell_Figure_8',
  'Kettlebell Hang Clean': 'Kettlebell_Hang_Clean',
  'One-Arm Kettlebell Floor Press': 'One-Arm_Kettlebell_Floor_Press',

  // ── Widened FEDB-backed tranche #18 (data-only, zero new fetch) ──────────────
  // A further slice of distinct catalogue movements — this tranche leans into the
  // band/chain-resisted barbell compounds, kettlebell jerk/press accessory work,
  // sled & strongman loaded carries, plyometric jumps and stretch/mobility staples
  // the earlier tranches still under-covered. Every KEY below is NEW — absent from
  // GRANDFATHERED, the FEDB_BACKED_SLUGS entries above (tranches #1-#17),
  // YOUTUBE_PENDING and GIF_PENDING — so buildCuratedDemos() admits each one as
  // kind:'fedb_frames', verified:false (precedence: an already-set name is skipped).
  // Every slug VALUE was machine-verified to be present in BOTH FEDB_SLUGS
  // (exerciseDemos.ts) AND __tests__/fixtures/fedb-catalog-slugs.json (the shipped
  // 873-slug catalogue), and each is a fresh slug dir not already referenced by an
  // earlier tranche — so every entry resolves to an ordered 2-frame [0.jpg, 1.jpg]
  // HTTPS pair via fedbPair() with NO new HTTP call. Strictly additive: the
  // kind:'youtube'-only sync guard (scripts/check-demo-maps-in-sync.js) and
  // pendingHumanReviewIds.json (YouTube ids only) are both untouched, so
  // check-demo-maps-in-sync stays green. A 200-ok URL is NOT a movement review, so
  // nothing here is verified:true — that remains a human-gated step.

  // Band / chain-resisted barbell compounds
  'Bench Press with Bands': 'Bench_Press_-_With_Bands',
  'Squat with Bands': 'Squat_with_Bands',
  'Deadlift with Bands': 'Deadlift_with_Bands',
  'Deadlift with Chains': 'Deadlift_with_Chains',
  'Box Squat with Bands': 'Box_Squat_with_Bands',
  'Sumo Deadlift with Bands': 'Sumo_Deadlift_with_Bands',
  'Shoulder Press with Bands': 'Shoulder_Press_-_With_Bands',
  'Upright Row with Bands': 'Upright_Row_-_With_Bands',
  // Kettlebell — jerk / press / clean accessory
  'Double Kettlebell Jerk': 'Double_Kettlebell_Jerk',
  'Double Kettlebell Push Press': 'Double_Kettlebell_Push_Press',
  'Two-Arm Kettlebell Jerk': 'Two-Arm_Kettlebell_Jerk',
  'Kettlebell Seated Press': 'Kettlebell_Seated_Press',
  'Kettlebell Seesaw Press': 'Kettlebell_Seesaw_Press',
  'One-Arm Kettlebell Push Press': 'One-Arm_Kettlebell_Push_Press',
  'Kettlebell Dead Clean': 'Kettlebell_Dead_Clean',
  // Sled / strongman loaded carries
  'Sled Drag (Harness)': 'Sled_Drag_-_Harness',
  'Sled Overhead Triceps Extension': 'Sled_Overhead_Triceps_Extension',
  'Sled Reverse Flye': 'Sled_Reverse_Flye',
  'Rickshaw Deadlift': 'Rickshaw_Deadlift',
  'Power Stairs': 'Power_Stairs',
  // Plyometric / conditioning
  'Front Box Jump': 'Front_Box_Jump',
  'Kneeling Jump Squat': 'Kneeling_Jump_Squat',
  'Weighted Jump Squat': 'Weighted_Jump_Squat',
  'Depth Jump Leap': 'Depth_Jump_Leap',
  // Mobility / stretch staples
  'Worlds Greatest Stretch (Dynamic)': 'Worlds_Greatest_Stretch',
  'Seated Calf Stretch': 'Seated_Calf_Stretch',
  'Standing Lateral Stretch': 'Standing_Lateral_Stretch',
  'Upward Stretch': 'Upward_Stretch',
  'Groiners': 'Groiners',
  'Inchworm': 'Inchworm',

  // ── Widened FEDB-backed tranche #19 (data-only, zero new fetch) ──────────────
  // A further slice of distinct catalogue movements — this tranche leans into the
  // cardio/conditioning machines, self-myofascial-release (SMR) foam-rolling,
  // seated/standing flexibility stretches, Olympic-from-blocks barbell pulls and
  // single-arm kettlebell jerk/snatch accessory work the earlier tranches still
  // under-covered. Every KEY below is NEW — absent from GRANDFATHERED, the
  // FEDB_BACKED_SLUGS entries above (tranches #1-#18), YOUTUBE_PENDING and
  // GIF_PENDING — so buildCuratedDemos() admits each one as kind:'fedb_frames',
  // verified:false (precedence: an already-set name is skipped).
  // Every slug VALUE was machine-verified to be present in BOTH FEDB_SLUGS
  // (exerciseDemos.ts) AND __tests__/fixtures/fedb-catalog-slugs.json (the shipped
  // 873-slug catalogue), and each is a fresh slug dir not already referenced by an
  // earlier tranche — so every entry resolves to an ordered 2-frame [0.jpg, 1.jpg]
  // HTTPS pair via fedbPair() with NO new HTTP call. Strictly additive: the
  // kind:'youtube'-only sync guard (scripts/check-demo-maps-in-sync.js) and
  // pendingHumanReviewIds.json (YouTube ids only) are both untouched, so
  // check-demo-maps-in-sync stays green. A 200-ok URL is NOT a movement review, so
  // nothing here is verified:true — that remains a human-gated step.

  // Cardio / conditioning machines
  'Stationary Bike': 'Bicycling_Stationary',
  'Elliptical Trainer': 'Elliptical_Trainer',
  'Rowing Machine': 'Rowing_Stationary',
  'Stair Stepper': 'Step_Mill',
  'Treadmill Running': 'Running_Treadmill',
  'Treadmill Walking': 'Walking_Treadmill',
  'Treadmill Jogging': 'Jogging_Treadmill',
  'Stairmaster Climb': 'Stairmaster',
  'Skipping Rope': 'Rope_Jumping',
  // Self-myofascial release (foam rolling / SMR)
  'Foam Roll Lower Back': 'Lower_Back-SMR',
  'Foam Roll Peroneals': 'Peroneals-SMR',
  'Foam Roll Piriformis': 'Piriformis-SMR',
  'Foam Roll Rhomboids': 'Rhomboids-SMR',
  'Foam Roll Anterior Tibialis': 'Anterior_Tibialis-SMR',
  'Foam Roll Brachialis': 'Brachialis-SMR',
  'Foam Roll Iliotibial Tract': 'Iliotibial_Tract-SMR',
  // Seated / standing flexibility stretches
  'Childs Pose': 'Childs_Pose',
  'Knee To Chest Stretch': 'Hug_Knees_To_Chest',
  'Standing Pelvic Tilt': 'Standing_Pelvic_Tilt',
  'Overhead Reach Stretch': 'Overhead_Stretch',
  'Seated Overhead Stretch': 'Seated_Overhead_Stretch',
  'Standing Soleus And Achilles Stretch': 'Standing_Soleus_And_Achilles_Stretch',
  'Torso Rotation Stretch': 'Torso_Rotation',
  'Shoulder Circles': 'Shoulder_Circles',
  // Olympic-from-blocks barbell pulls
  'Clean From Blocks': 'Clean_from_Blocks',
  'Snatch From Blocks': 'Snatch_from_Blocks',
  'Power Clean From Blocks': 'Power_Clean_from_Blocks',
  'Power Snatch From Blocks': 'Power_Snatch_from_Blocks',
  // Kettlebell jerk / snatch accessory
  'One-Arm Kettlebell Jerk': 'One-Arm_Kettlebell_Jerk',
  'One-Arm Kettlebell Split Jerk': 'One-Arm_Kettlebell_Split_Jerk',
  'One-Arm Kettlebell Split Snatch': 'One-Arm_Kettlebell_Split_Snatch',
  'One-Arm Kettlebell Clean and Jerk': 'One-Arm_Kettlebell_Clean_and_Jerk',
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
  // Pelvic-floor / kegel variants commonly programmed in Zeitra but not in
  // the backend's curated YouTube map. Each watch URL is a specific demo, not
  // a search/results page.
  'Reverse Kegel': 'https://www.youtube.com/watch?v=Lj2KshDeEXk',
  // Mobility/recovery staples worth a dedicated demo video.
  "World's Greatest Stretch": 'https://www.youtube.com/watch?v=cs3-PMjVFGY',
  'Couch Stretch': 'https://www.youtube.com/watch?v=Az47gG1lr3o',
};

/**
 * A small tranche of high-frequency movements mapped to FREE, static animated
 * GIF demos hosted on Wikimedia Commons (`upload.wikimedia.org`, https only —
 * no paid API, no build-time/runtime fetch). expo-image plays an animated GIF
 * natively from its `{ uri }` source, so <ExerciseDemo/> renders these as a
 * PLAYING demo (with the bottom-left "Demo" pill), not a static still.
 *
 * Keyed on alias names that the GRANDFATHERED (verified:true) and
 * FEDB_BACKED_SLUGS maps DELIBERATELY do not already cover — the precedence
 * rule in buildCuratedDemos() skips any name that is already present, so these
 * must be distinct keys to take effect rather than being silently dropped.
 *
 * Every URL was resolved + HTTP-checked (200, content-type image/gif) against
 * the live Commons file at authoring time, but each entry SHIPS verified:false:
 * a human reviewer should still eyeball that the clip shows the correct
 * movement before any future flip to verified:true. These entries live OUTSIDE
 * the GRANDFATHERED block, so the kind:'youtube'-only sync guard
 * (scripts/check-demo-maps-in-sync.js) and pendingHumanReviewIds.json (YouTube
 * ids only) both correctly ignore them.
 */
const GIF_PENDING: Readonly<Record<string, string>> = {
  // Bodyweight staples. Names are common aliases NOT already in the curated map
  // (e.g. 'Push-Up'/'Bodyweight Squat'/'Burpee' are grandfathered YouTube
  // entries; these singular/plural/CrossFit variants are the gaps).
  'Pushup': 'https://upload.wikimedia.org/wikipedia/commons/8/8f/Pushups.gif',
  'Air Squat': 'https://upload.wikimedia.org/wikipedia/commons/e/e6/Squats.gif',
  'Burpees': 'https://upload.wikimedia.org/wikipedia/commons/d/df/Burpee.gif',
  'High Knee': 'https://upload.wikimedia.org/wikipedia/commons/4/4e/High_knees.gif',
  'Situp': 'https://upload.wikimedia.org/wikipedia/commons/a/a1/Sit-up_on_the_bench_draw_%28animated%29.gif',
  // Additional common spelling/locale variants, each on a DISTINCT alias key the
  // maps above don't claim. To avoid any dead-link risk these REUSE the exact
  // Commons file URLs already proven in the shipped tranche above (same clip,
  // different searchable name) rather than introducing new, unverified CDN paths.
  // Still verified:false — a human should confirm the alias maps to the right
  // movement before any future flip. Folded in by the same precedence rule, so a
  // name already claimed by an earlier map is skipped, never overwritten.
  'Press Up': 'https://upload.wikimedia.org/wikipedia/commons/8/8f/Pushups.gif',
  'Bodyweight Squats': 'https://upload.wikimedia.org/wikipedia/commons/e/e6/Squats.gif',
  'Sit Up': 'https://upload.wikimedia.org/wikipedia/commons/a/a1/Sit-up_on_the_bench_draw_%28animated%29.gif',
  'Burpee (CrossFit)': 'https://upload.wikimedia.org/wikipedia/commons/d/df/Burpee.gif',
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

  // Pending GIF entries (kind:'gif', verified:false). Folded in LAST, with the
  // same precedence rule: never overwrite a grandfathered/verified entry (nor a
  // FEDB/YouTube one that already claimed the name). expo-image animates these
  // natively, so <ExerciseDemo/> shows them as a playing demo.
  for (const [name, url] of Object.entries(GIF_PENDING)) {
    if (out[name]) continue;
    out[name] = { kind: 'gif', url, verified: false };
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

/**
 * The single source-of-truth accessor for the YouTube video-ids that still
 * await human review.
 *
 * Walks {@link CURATED_DEMOS} and, for every entry that is `kind: 'youtube'`
 * AND `verified: false`, extracts the `<id>` from its
 * `https://www.youtube.com/watch?v=<id>` URL. The returned list is de-duped and
 * sorted, giving a deterministic, stable set a reviewer (or the
 * `pendingHumanReviewIds.json` drift guard) can compare against.
 *
 * This formalizes the human-review pipeline: the JSON mirror in
 * {@link ./pendingHumanReviewIds.json} must equal exactly this set — the
 * companion test cross-checks both directions (nothing missing, no orphans).
 * Flipping any entry to `verified: true` (a user-gated review step) naturally
 * drops it from this list.
 *
 * Pure: dependency-free, no I/O, no JSON read at runtime, never throws. Derives
 * solely from the in-memory {@link CURATED_DEMOS} map. Safe on render.
 */
export function getPendingHumanReviewIds(): string[] {
  const ids = new Set<string>();
  for (const demo of Object.values(CURATED_DEMOS)) {
    if (demo.kind !== 'youtube' || demo.verified) continue;
    // Extract the id from `https://www.youtube.com/watch?v=<id>`: take the
    // substring after `watch?v=`, then stop at the first `&`/`#` (if any) so an
    // extra query param can never leak into the id. No regex/dependency needed.
    const marker = 'watch?v=';
    const at = demo.url.indexOf(marker);
    if (at === -1) continue;
    const rest = demo.url.slice(at + marker.length);
    const id = rest.split(/[&#]/)[0];
    if (id) ids.add(id);
  }
  return Array.from(ids).sort();
}
