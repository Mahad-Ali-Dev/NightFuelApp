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
 *  - DEMO_FRAMES      — exercise name -> ordered in-app [start, end] frame URLs.
 *                       Curated for marquee movements; `resolveDemoFrames` extends
 *                       this to the WHOLE free-exercise-db catalogue by deriving
 *                       frames from each exercise's FEDB `imageUrl` (or its name
 *                       via the bundled slug index) — see that helper's docs.
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

  // ── Widened tranche ───────────────────────────────────────────────────────
  // Common catalogue movements whose names ALSO exist in the FEDB slug index
  // (so the in-app frames resolve too). Additive: kept key-for-key in sync with
  // the backend `DEMO_URLS` map (demo-urls.ts). Each value is a verified watch URL.
  'Hammer Curls': 'https://www.youtube.com/watch?v=tjyraFISkbg',
  'Hanging Leg Raise': 'https://www.youtube.com/watch?v=Pr1ieGZ5atk',
  'Face Pull': 'https://www.youtube.com/watch?v=rep-qVOkqgk',
  'Goblet Squat': 'https://www.youtube.com/watch?v=MeIiIdhvXT4',
  'Barbell Hip Thrust': 'https://www.youtube.com/watch?v=LM8XHLYJoYs',
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

// ---------------------------------------------------------------------------
// Full-catalog auto-derivation (free-exercise-db)
// ---------------------------------------------------------------------------
//
// The hand-curated DEMO_FRAMES map above only covers ~24 marquee movements. The
// backend, however, seeds the WHOLE free-exercise-db catalog (873 exercises) and
// stores each one's `imageUrl` as a free-exercise-db CDN path that embeds the
// exercise's slug directory, e.g.
//
//   https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Barbell_Bench_Press_-_Medium_Grip/0.jpg
//
// That slug dir is exactly what `fedb()` needs, so we can derive the animated
// [start, end] frame pair for ANY catalogued exercise straight from its
// `imageUrl` — no per-exercise curation. As a second path (for exercises that
// arrive without an imageUrl, e.g. from the live wger fallback), we bundle the
// authoritative normalized-name → slug index below so a plain exercise NAME can
// also resolve to its frames. Together these lift in-app demo coverage from ~24
// to essentially the entire catalogue, entirely client-side (no reseed/migrate).

/**
 * Hosts that serve free-exercise-db exercise images. The seeder uses the
 * jsDelivr mirror; {@link FEDB_BASE} (raw.githubusercontent) is the canonical
 * origin and what we re-emit from (always HTTPS → ATS-safe). Either host's
 * `.../exercises/<Slug_Dir>/<n>.jpg` shape is accepted on input.
 */
const FEDB_IMAGE_URL_RE =
  /^https?:\/\/(?:cdn\.jsdelivr\.net\/gh\/yuhonas\/free-exercise-db(?:@[^/]+)?|raw\.githubusercontent\.com\/yuhonas\/free-exercise-db\/[^/]+)\/exercises\/(.+)$/i;

/**
 * Given a free-exercise-db CDN image URL, return its slug directory (the path
 * segment that {@link fedb} keys off), or null when the URL is not a recognised
 * free-exercise-db image. e.g.
 *   ".../exercises/Barbell_Deadlift/0.jpg" → "Barbell_Deadlift"
 */
export function fedbSlugFromImageUrl(imageUrl: string | null | undefined): string | null {
  if (!imageUrl) return null;
  const m = FEDB_IMAGE_URL_RE.exec(imageUrl.trim());
  if (!m || !m[1]) return null;
  // m[1] is the remainder after "/exercises/", e.g. "Barbell_Deadlift/0.jpg" or
  // "Barbell_Deadlift" — keep only the leading slug directory segment.
  const dir = m[1].split('/')[0];
  return dir && dir.length > 0 ? dir : null;
}

/**
 * Normalise an exercise name into the free-exercise-db slug-index key:
 * lowercase, every run of non-alphanumerics collapsed to a single space, then
 * spaces → underscores. MUST mirror the generator that built {@link FEDB_SLUGS}
 * (e.g. "Farmer's Walk" → "farmer_s_walk", "3/4 Sit-Up" → "3_4_sit_up").
 */
function normalizeExerciseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, '_');
}

/**
 * Authoritative free-exercise-db index: normalized exercise name → slug
 * directory, for all 873 catalogue entries that ship demo frames. Auto-generated
 * from the free-exercise-db `dist/exercises.json` manifest (MIT). Used as the
 * name-based fallback when an exercise has no recognised `imageUrl` to derive
 * from. Keys are produced by {@link normalizeExerciseName}.
 */
const FEDB_SLUGS: Record<string, string> = {
  '3_4_sit_up': '3_4_Sit-Up', '90_90_hamstring': '90_90_Hamstring', 'ab_crunch_machine': 'Ab_Crunch_Machine', 'ab_roller': 'Ab_Roller',
  'adductor': 'Adductor', 'adductor_groin': 'Adductor_Groin', 'advanced_kettlebell_windmill': 'Advanced_Kettlebell_Windmill', 'air_bike': 'Air_Bike',
  'all_fours_quad_stretch': 'All_Fours_Quad_Stretch', 'alternate_hammer_curl': 'Alternate_Hammer_Curl', 'alternate_heel_touchers': 'Alternate_Heel_Touchers', 'alternate_incline_dumbbell_curl': 'Alternate_Incline_Dumbbell_Curl',
  'alternate_leg_diagonal_bound': 'Alternate_Leg_Diagonal_Bound', 'alternating_cable_shoulder_press': 'Alternating_Cable_Shoulder_Press', 'alternating_deltoid_raise': 'Alternating_Deltoid_Raise', 'alternating_floor_press': 'Alternating_Floor_Press',
  'alternating_hang_clean': 'Alternating_Hang_Clean', 'alternating_kettlebell_press': 'Alternating_Kettlebell_Press', 'alternating_kettlebell_row': 'Alternating_Kettlebell_Row', 'alternating_renegade_row': 'Alternating_Renegade_Row',
  'ankle_circles': 'Ankle_Circles', 'ankle_on_the_knee': 'Ankle_On_The_Knee', 'anterior_tibialis_smr': 'Anterior_Tibialis-SMR', 'anti_gravity_press': 'Anti-Gravity_Press',
  'arm_circles': 'Arm_Circles', 'arnold_dumbbell_press': 'Arnold_Dumbbell_Press', 'around_the_worlds': 'Around_The_Worlds', 'atlas_stone_trainer': 'Atlas_Stone_Trainer',
  'atlas_stones': 'Atlas_Stones', 'axle_deadlift': 'Axle_Deadlift', 'back_flyes_with_bands': 'Back_Flyes_-_With_Bands', 'backward_drag': 'Backward_Drag',
  'backward_medicine_ball_throw': 'Backward_Medicine_Ball_Throw', 'balance_board': 'Balance_Board', 'ball_leg_curl': 'Ball_Leg_Curl', 'band_assisted_pull_up': 'Band_Assisted_Pull-Up',
  'band_good_morning': 'Band_Good_Morning', 'band_good_morning_pull_through': 'Band_Good_Morning_Pull_Through', 'band_hip_adductions': 'Band_Hip_Adductions', 'band_pull_apart': 'Band_Pull_Apart',
  'band_skull_crusher': 'Band_Skull_Crusher', 'barbell_ab_rollout': 'Barbell_Ab_Rollout', 'barbell_ab_rollout_on_knees': 'Barbell_Ab_Rollout_-_On_Knees', 'barbell_bench_press_medium_grip': 'Barbell_Bench_Press_-_Medium_Grip',
  'barbell_curl': 'Barbell_Curl', 'barbell_curls_lying_against_an_incline': 'Barbell_Curls_Lying_Against_An_Incline', 'barbell_deadlift': 'Barbell_Deadlift', 'barbell_full_squat': 'Barbell_Full_Squat',
  'barbell_glute_bridge': 'Barbell_Glute_Bridge', 'barbell_guillotine_bench_press': 'Barbell_Guillotine_Bench_Press', 'barbell_hack_squat': 'Barbell_Hack_Squat', 'barbell_hip_thrust': 'Barbell_Hip_Thrust',
  'barbell_incline_bench_press_medium_grip': 'Barbell_Incline_Bench_Press_-_Medium_Grip', 'barbell_incline_shoulder_raise': 'Barbell_Incline_Shoulder_Raise', 'barbell_lunge': 'Barbell_Lunge', 'barbell_rear_delt_row': 'Barbell_Rear_Delt_Row',
  'barbell_rollout_from_bench': 'Barbell_Rollout_from_Bench', 'barbell_seated_calf_raise': 'Barbell_Seated_Calf_Raise', 'barbell_shoulder_press': 'Barbell_Shoulder_Press', 'barbell_shrug': 'Barbell_Shrug',
  'barbell_shrug_behind_the_back': 'Barbell_Shrug_Behind_The_Back', 'barbell_side_bend': 'Barbell_Side_Bend', 'barbell_side_split_squat': 'Barbell_Side_Split_Squat', 'barbell_squat': 'Barbell_Squat',
  'barbell_squat_to_a_bench': 'Barbell_Squat_To_A_Bench', 'barbell_step_ups': 'Barbell_Step_Ups', 'barbell_walking_lunge': 'Barbell_Walking_Lunge', 'battling_ropes': 'Battling_Ropes',
  'bear_crawl_sled_drags': 'Bear_Crawl_Sled_Drags', 'behind_head_chest_stretch': 'Behind_Head_Chest_Stretch', 'bench_dips': 'Bench_Dips', 'bench_jump': 'Bench_Jump',
  'bench_press_powerlifting': 'Bench_Press_-_Powerlifting', 'bench_press_with_bands': 'Bench_Press_-_With_Bands', 'bench_press_with_chains': 'Bench_Press_with_Chains', 'bench_sprint': 'Bench_Sprint',
  'bent_arm_barbell_pullover': 'Bent-Arm_Barbell_Pullover', 'bent_arm_dumbbell_pullover': 'Bent-Arm_Dumbbell_Pullover', 'bent_knee_hip_raise': 'Bent-Knee_Hip_Raise', 'bent_over_barbell_row': 'Bent_Over_Barbell_Row',
  'bent_over_dumbbell_rear_delt_raise_with_head_on_bench': 'Bent_Over_Dumbbell_Rear_Delt_Raise_With_Head_On_Bench', 'bent_over_low_pulley_side_lateral': 'Bent_Over_Low-Pulley_Side_Lateral', 'bent_over_one_arm_long_bar_row': 'Bent_Over_One-Arm_Long_Bar_Row', 'bent_over_two_arm_long_bar_row': 'Bent_Over_Two-Arm_Long_Bar_Row',
  'bent_over_two_dumbbell_row': 'Bent_Over_Two-Dumbbell_Row', 'bent_over_two_dumbbell_row_with_palms_in': 'Bent_Over_Two-Dumbbell_Row_With_Palms_In', 'bent_press': 'Bent_Press', 'bicycling': 'Bicycling',
  'bicycling_stationary': 'Bicycling_Stationary', 'board_press': 'Board_Press', 'body_tricep_press': 'Body_Tricep_Press', 'body_up': 'Body-Up',
  'bodyweight_flyes': 'Bodyweight_Flyes', 'bodyweight_mid_row': 'Bodyweight_Mid_Row', 'bodyweight_squat': 'Bodyweight_Squat', 'bodyweight_walking_lunge': 'Bodyweight_Walking_Lunge',
  'bosu_ball_cable_crunch_with_side_bends': 'Bosu_Ball_Cable_Crunch_With_Side_Bends', 'bottoms_up': 'Bottoms_Up', 'bottoms_up_clean_from_the_hang_position': 'Bottoms-Up_Clean_From_The_Hang_Position', 'box_jump_multiple_response': 'Box_Jump_Multiple_Response',
  'box_skip': 'Box_Skip', 'box_squat': 'Box_Squat', 'box_squat_with_bands': 'Box_Squat_with_Bands', 'box_squat_with_chains': 'Box_Squat_with_Chains',
  'brachialis_smr': 'Brachialis-SMR', 'bradford_rocky_presses': 'Bradford_Rocky_Presses', 'butt_lift_bridge': 'Butt_Lift_Bridge', 'butt_ups': 'Butt-Ups',
  'butterfly': 'Butterfly', 'cable_chest_press': 'Cable_Chest_Press', 'cable_crossover': 'Cable_Crossover', 'cable_crunch': 'Cable_Crunch',
  'cable_deadlifts': 'Cable_Deadlifts', 'cable_hammer_curls_rope_attachment': 'Cable_Hammer_Curls_-_Rope_Attachment', 'cable_hip_adduction': 'Cable_Hip_Adduction', 'cable_incline_pushdown': 'Cable_Incline_Pushdown',
  'cable_incline_triceps_extension': 'Cable_Incline_Triceps_Extension', 'cable_internal_rotation': 'Cable_Internal_Rotation', 'cable_iron_cross': 'Cable_Iron_Cross', 'cable_judo_flip': 'Cable_Judo_Flip',
  'cable_lying_triceps_extension': 'Cable_Lying_Triceps_Extension', 'cable_one_arm_tricep_extension': 'Cable_One_Arm_Tricep_Extension', 'cable_preacher_curl': 'Cable_Preacher_Curl', 'cable_rear_delt_fly': 'Cable_Rear_Delt_Fly',
  'cable_reverse_crunch': 'Cable_Reverse_Crunch', 'cable_rope_overhead_triceps_extension': 'Cable_Rope_Overhead_Triceps_Extension', 'cable_rope_rear_delt_rows': 'Cable_Rope_Rear-Delt_Rows', 'cable_russian_twists': 'Cable_Russian_Twists',
  'cable_seated_crunch': 'Cable_Seated_Crunch', 'cable_seated_lateral_raise': 'Cable_Seated_Lateral_Raise', 'cable_shoulder_press': 'Cable_Shoulder_Press', 'cable_shrugs': 'Cable_Shrugs',
  'cable_wrist_curl': 'Cable_Wrist_Curl', 'calf_machine_shoulder_shrug': 'Calf-Machine_Shoulder_Shrug', 'calf_press': 'Calf_Press', 'calf_press_on_the_leg_press_machine': 'Calf_Press_On_The_Leg_Press_Machine',
  'calf_raise_on_a_dumbbell': 'Calf_Raise_On_A_Dumbbell', 'calf_raises_with_bands': 'Calf_Raises_-_With_Bands', 'calf_stretch_elbows_against_wall': 'Calf_Stretch_Elbows_Against_Wall', 'calf_stretch_hands_against_wall': 'Calf_Stretch_Hands_Against_Wall',
  'calves_smr': 'Calves-SMR', 'car_deadlift': 'Car_Deadlift', 'car_drivers': 'Car_Drivers', 'carioca_quick_step': 'Carioca_Quick_Step',
  'cat_stretch': 'Cat_Stretch', 'catch_and_overhead_throw': 'Catch_and_Overhead_Throw', 'chain_handle_extension': 'Chain_Handle_Extension', 'chain_press': 'Chain_Press',
  'chair_leg_extended_stretch': 'Chair_Leg_Extended_Stretch', 'chair_lower_back_stretch': 'Chair_Lower_Back_Stretch', 'chair_squat': 'Chair_Squat', 'chair_upper_body_stretch': 'Chair_Upper_Body_Stretch',
  'chest_and_front_of_shoulder_stretch': 'Chest_And_Front_Of_Shoulder_Stretch', 'chest_push_from_3_point_stance': 'Chest_Push_from_3_point_stance', 'chest_push_multiple_response': 'Chest_Push_multiple_response', 'chest_push_single_response': 'Chest_Push_single_response',
  'chest_push_with_run_release': 'Chest_Push_with_Run_Release', 'chest_stretch_on_stability_ball': 'Chest_Stretch_on_Stability_Ball', 'child_s_pose': 'Childs_Pose', 'chin_to_chest_stretch': 'Chin_To_Chest_Stretch',
  'chin_up': 'Chin-Up', 'circus_bell': 'Circus_Bell', 'clean': 'Clean', 'clean_and_jerk': 'Clean_and_Jerk',
  'clean_and_press': 'Clean_and_Press', 'clean_deadlift': 'Clean_Deadlift', 'clean_from_blocks': 'Clean_from_Blocks', 'clean_pull': 'Clean_Pull',
  'clean_shrug': 'Clean_Shrug', 'clock_push_up': 'Clock_Push-Up', 'close_grip_barbell_bench_press': 'Close-Grip_Barbell_Bench_Press', 'close_grip_dumbbell_press': 'Close-Grip_Dumbbell_Press',
  'close_grip_ez_bar_curl': 'Close-Grip_EZ_Bar_Curl', 'close_grip_ez_bar_curl_with_band': 'Close-Grip_EZ-Bar_Curl_with_Band', 'close_grip_ez_bar_press': 'Close-Grip_EZ-Bar_Press', 'close_grip_front_lat_pulldown': 'Close-Grip_Front_Lat_Pulldown',
  'close_grip_push_up_off_of_a_dumbbell': 'Close-Grip_Push-Up_off_of_a_Dumbbell', 'close_grip_standing_barbell_curl': 'Close-Grip_Standing_Barbell_Curl', 'cocoons': 'Cocoons', 'conan_s_wheel': 'Conans_Wheel',
  'concentration_curls': 'Concentration_Curls', 'cross_body_crunch': 'Cross-Body_Crunch', 'cross_body_hammer_curl': 'Cross_Body_Hammer_Curl', 'cross_over_with_bands': 'Cross_Over_-_With_Bands',
  'crossover_reverse_lunge': 'Crossover_Reverse_Lunge', 'crucifix': 'Crucifix', 'crunch_hands_overhead': 'Crunch_-_Hands_Overhead', 'crunch_legs_on_exercise_ball': 'Crunch_-_Legs_On_Exercise_Ball',
  'crunches': 'Crunches', 'cuban_press': 'Cuban_Press', 'dancer_s_stretch': 'Dancers_Stretch', 'dead_bug': 'Dead_Bug',
  'deadlift_with_bands': 'Deadlift_with_Bands', 'deadlift_with_chains': 'Deadlift_with_Chains', 'decline_barbell_bench_press': 'Decline_Barbell_Bench_Press', 'decline_close_grip_bench_to_skull_crusher': 'Decline_Close-Grip_Bench_To_Skull_Crusher',
  'decline_crunch': 'Decline_Crunch', 'decline_dumbbell_bench_press': 'Decline_Dumbbell_Bench_Press', 'decline_dumbbell_flyes': 'Decline_Dumbbell_Flyes', 'decline_dumbbell_triceps_extension': 'Decline_Dumbbell_Triceps_Extension',
  'decline_ez_bar_triceps_extension': 'Decline_EZ_Bar_Triceps_Extension', 'decline_oblique_crunch': 'Decline_Oblique_Crunch', 'decline_push_up': 'Decline_Push-Up', 'decline_reverse_crunch': 'Decline_Reverse_Crunch',
  'decline_smith_press': 'Decline_Smith_Press', 'deficit_deadlift': 'Deficit_Deadlift', 'depth_jump_leap': 'Depth_Jump_Leap', 'dip_machine': 'Dip_Machine',
  'dips_chest_version': 'Dips_-_Chest_Version', 'dips_triceps_version': 'Dips_-_Triceps_Version', 'donkey_calf_raises': 'Donkey_Calf_Raises', 'double_kettlebell_alternating_hang_clean': 'Double_Kettlebell_Alternating_Hang_Clean',
  'double_kettlebell_jerk': 'Double_Kettlebell_Jerk', 'double_kettlebell_push_press': 'Double_Kettlebell_Push_Press', 'double_kettlebell_snatch': 'Double_Kettlebell_Snatch', 'double_kettlebell_windmill': 'Double_Kettlebell_Windmill',
  'double_leg_butt_kick': 'Double_Leg_Butt_Kick', 'downward_facing_balance': 'Downward_Facing_Balance', 'drag_curl': 'Drag_Curl', 'drop_push': 'Drop_Push',
  'dumbbell_alternate_bicep_curl': 'Dumbbell_Alternate_Bicep_Curl', 'dumbbell_bench_press': 'Dumbbell_Bench_Press', 'dumbbell_bench_press_with_neutral_grip': 'Dumbbell_Bench_Press_with_Neutral_Grip', 'dumbbell_bicep_curl': 'Dumbbell_Bicep_Curl',
  'dumbbell_clean': 'Dumbbell_Clean', 'dumbbell_floor_press': 'Dumbbell_Floor_Press', 'dumbbell_flyes': 'Dumbbell_Flyes', 'dumbbell_incline_row': 'Dumbbell_Incline_Row',
  'dumbbell_incline_shoulder_raise': 'Dumbbell_Incline_Shoulder_Raise', 'dumbbell_lunges': 'Dumbbell_Lunges', 'dumbbell_lying_one_arm_rear_lateral_raise': 'Dumbbell_Lying_One-Arm_Rear_Lateral_Raise', 'dumbbell_lying_pronation': 'Dumbbell_Lying_Pronation',
  'dumbbell_lying_rear_lateral_raise': 'Dumbbell_Lying_Rear_Lateral_Raise', 'dumbbell_lying_supination': 'Dumbbell_Lying_Supination', 'dumbbell_one_arm_shoulder_press': 'Dumbbell_One-Arm_Shoulder_Press', 'dumbbell_one_arm_triceps_extension': 'Dumbbell_One-Arm_Triceps_Extension',
  'dumbbell_one_arm_upright_row': 'Dumbbell_One-Arm_Upright_Row', 'dumbbell_prone_incline_curl': 'Dumbbell_Prone_Incline_Curl', 'dumbbell_raise': 'Dumbbell_Raise', 'dumbbell_rear_lunge': 'Dumbbell_Rear_Lunge',
  'dumbbell_scaption': 'Dumbbell_Scaption', 'dumbbell_seated_box_jump': 'Dumbbell_Seated_Box_Jump', 'dumbbell_seated_one_leg_calf_raise': 'Dumbbell_Seated_One-Leg_Calf_Raise', 'dumbbell_shoulder_press': 'Dumbbell_Shoulder_Press',
  'dumbbell_shrug': 'Dumbbell_Shrug', 'dumbbell_side_bend': 'Dumbbell_Side_Bend', 'dumbbell_squat': 'Dumbbell_Squat', 'dumbbell_squat_to_a_bench': 'Dumbbell_Squat_To_A_Bench',
  'dumbbell_step_ups': 'Dumbbell_Step_Ups', 'dumbbell_tricep_extension_pronated_grip': 'Dumbbell_Tricep_Extension_-Pronated_Grip', 'dynamic_back_stretch': 'Dynamic_Back_Stretch', 'dynamic_chest_stretch': 'Dynamic_Chest_Stretch',
  'elbow_circles': 'Elbow_Circles', 'elbow_to_knee': 'Elbow_to_Knee', 'elbows_back': 'Elbows_Back', 'elevated_back_lunge': 'Elevated_Back_Lunge',
  'elevated_cable_rows': 'Elevated_Cable_Rows', 'elliptical_trainer': 'Elliptical_Trainer', 'exercise_ball_crunch': 'Exercise_Ball_Crunch', 'exercise_ball_pull_in': 'Exercise_Ball_Pull-In',
  'extended_range_one_arm_kettlebell_floor_press': 'Extended_Range_One-Arm_Kettlebell_Floor_Press', 'external_rotation': 'External_Rotation', 'external_rotation_with_band': 'External_Rotation_with_Band', 'external_rotation_with_cable': 'External_Rotation_with_Cable',
  'ez_bar_curl': 'EZ-Bar_Curl', 'ez_bar_skullcrusher': 'EZ-Bar_Skullcrusher', 'face_pull': 'Face_Pull', 'farmer_s_walk': 'Farmers_Walk',
  'fast_skipping': 'Fast_Skipping', 'finger_curls': 'Finger_Curls', 'flat_bench_cable_flyes': 'Flat_Bench_Cable_Flyes', 'flat_bench_leg_pull_in': 'Flat_Bench_Leg_Pull-In',
  'flat_bench_lying_leg_raise': 'Flat_Bench_Lying_Leg_Raise', 'flexor_incline_dumbbell_curls': 'Flexor_Incline_Dumbbell_Curls', 'floor_glute_ham_raise': 'Floor_Glute-Ham_Raise', 'floor_press': 'Floor_Press',
  'floor_press_with_chains': 'Floor_Press_with_Chains', 'flutter_kicks': 'Flutter_Kicks', 'foot_smr': 'Foot-SMR', 'forward_drag_with_press': 'Forward_Drag_with_Press',
  'frankenstein_squat': 'Frankenstein_Squat', 'freehand_jump_squat': 'Freehand_Jump_Squat', 'frog_hops': 'Frog_Hops', 'frog_sit_ups': 'Frog_Sit-Ups',
  'front_barbell_squat': 'Front_Barbell_Squat', 'front_barbell_squat_to_a_bench': 'Front_Barbell_Squat_To_A_Bench', 'front_box_jump': 'Front_Box_Jump', 'front_cable_raise': 'Front_Cable_Raise',
  'front_cone_hops_or_hurdle_hops': 'Front_Cone_Hops_or_hurdle_hops', 'front_dumbbell_raise': 'Front_Dumbbell_Raise', 'front_incline_dumbbell_raise': 'Front_Incline_Dumbbell_Raise', 'front_leg_raises': 'Front_Leg_Raises',
  'front_plate_raise': 'Front_Plate_Raise', 'front_raise_and_pullover': 'Front_Raise_And_Pullover', 'front_squat_clean_grip': 'Front_Squat_Clean_Grip', 'front_squats_with_two_kettlebells': 'Front_Squats_With_Two_Kettlebells',
  'front_two_dumbbell_raise': 'Front_Two-Dumbbell_Raise', 'full_range_of_motion_lat_pulldown': 'Full_Range-Of-Motion_Lat_Pulldown', 'gironda_sternum_chins': 'Gironda_Sternum_Chins', 'glute_ham_raise': 'Glute_Ham_Raise',
  'glute_kickback': 'Glute_Kickback', 'goblet_squat': 'Goblet_Squat', 'good_morning': 'Good_Morning', 'good_morning_off_pins': 'Good_Morning_off_Pins',
  'gorilla_chin_crunch': 'Gorilla_Chin_Crunch', 'groin_and_back_stretch': 'Groin_and_Back_Stretch', 'groiners': 'Groiners', 'hack_squat': 'Hack_Squat',
  'hammer_curls': 'Hammer_Curls', 'hammer_grip_incline_db_bench_press': 'Hammer_Grip_Incline_DB_Bench_Press', 'hamstring_smr': 'Hamstring-SMR', 'hamstring_stretch': 'Hamstring_Stretch',
  'handstand_push_ups': 'Handstand_Push-Ups', 'hang_clean': 'Hang_Clean', 'hang_clean_below_the_knees': 'Hang_Clean_-_Below_the_Knees', 'hang_snatch': 'Hang_Snatch',
  'hang_snatch_below_knees': 'Hang_Snatch_-_Below_Knees', 'hanging_bar_good_morning': 'Hanging_Bar_Good_Morning', 'hanging_leg_raise': 'Hanging_Leg_Raise', 'hanging_pike': 'Hanging_Pike',
  'heaving_snatch_balance': 'Heaving_Snatch_Balance', 'heavy_bag_thrust': 'Heavy_Bag_Thrust', 'high_cable_curls': 'High_Cable_Curls', 'hip_circles_prone': 'Hip_Circles_prone',
  'hip_extension_with_bands': 'Hip_Extension_with_Bands', 'hip_flexion_with_band': 'Hip_Flexion_with_Band', 'hip_lift_with_band': 'Hip_Lift_with_Band', 'hug_a_ball': 'Hug_A_Ball',
  'hug_knees_to_chest': 'Hug_Knees_To_Chest', 'hurdle_hops': 'Hurdle_Hops', 'hyperextensions_back_extensions': 'Hyperextensions_Back_Extensions', 'hyperextensions_with_no_hyperextension_bench': 'Hyperextensions_With_No_Hyperextension_Bench',
  'iliotibial_tract_smr': 'Iliotibial_Tract-SMR', 'inchworm': 'Inchworm', 'incline_barbell_triceps_extension': 'Incline_Barbell_Triceps_Extension', 'incline_bench_pull': 'Incline_Bench_Pull',
  'incline_cable_chest_press': 'Incline_Cable_Chest_Press', 'incline_cable_flye': 'Incline_Cable_Flye', 'incline_dumbbell_bench_with_palms_facing_in': 'Incline_Dumbbell_Bench_With_Palms_Facing_In', 'incline_dumbbell_curl': 'Incline_Dumbbell_Curl',
  'incline_dumbbell_flyes': 'Incline_Dumbbell_Flyes', 'incline_dumbbell_flyes_with_a_twist': 'Incline_Dumbbell_Flyes_-_With_A_Twist', 'incline_dumbbell_press': 'Incline_Dumbbell_Press', 'incline_hammer_curls': 'Incline_Hammer_Curls',
  'incline_inner_biceps_curl': 'Incline_Inner_Biceps_Curl', 'incline_push_up': 'Incline_Push-Up', 'incline_push_up_close_grip': 'Incline_Push-Up_Close-Grip', 'incline_push_up_depth_jump': 'Incline_Push-Up_Depth_Jump',
  'incline_push_up_medium': 'Incline_Push-Up_Medium', 'incline_push_up_reverse_grip': 'Incline_Push-Up_Reverse_Grip', 'incline_push_up_wide': 'Incline_Push-Up_Wide', 'intermediate_groin_stretch': 'Intermediate_Groin_Stretch',
  'intermediate_hip_flexor_and_quad_stretch': 'Intermediate_Hip_Flexor_and_Quad_Stretch', 'internal_rotation_with_band': 'Internal_Rotation_with_Band', 'inverted_row': 'Inverted_Row', 'inverted_row_with_straps': 'Inverted_Row_with_Straps',
  'iron_cross': 'Iron_Cross', 'iron_crosses_stretch': 'Iron_Crosses_stretch', 'isometric_chest_squeezes': 'Isometric_Chest_Squeezes', 'isometric_neck_exercise_front_and_back': 'Isometric_Neck_Exercise_-_Front_And_Back',
  'isometric_neck_exercise_sides': 'Isometric_Neck_Exercise_-_Sides', 'isometric_wipers': 'Isometric_Wipers', 'it_band_and_glute_stretch': 'IT_Band_and_Glute_Stretch', 'jackknife_sit_up': 'Jackknife_Sit-Up',
  'janda_sit_up': 'Janda_Sit-Up', 'jefferson_squats': 'Jefferson_Squats', 'jerk_balance': 'Jerk_Balance', 'jerk_dip_squat': 'Jerk_Dip_Squat',
  'jm_press': 'JM_Press', 'jogging_treadmill': 'Jogging_Treadmill', 'keg_load': 'Keg_Load', 'kettlebell_arnold_press': 'Kettlebell_Arnold_Press',
  'kettlebell_dead_clean': 'Kettlebell_Dead_Clean', 'kettlebell_figure_8': 'Kettlebell_Figure_8', 'kettlebell_hang_clean': 'Kettlebell_Hang_Clean', 'kettlebell_one_legged_deadlift': 'Kettlebell_One-Legged_Deadlift',
  'kettlebell_pass_between_the_legs': 'Kettlebell_Pass_Between_The_Legs', 'kettlebell_pirate_ships': 'Kettlebell_Pirate_Ships', 'kettlebell_pistol_squat': 'Kettlebell_Pistol_Squat', 'kettlebell_seated_press': 'Kettlebell_Seated_Press',
  'kettlebell_seesaw_press': 'Kettlebell_Seesaw_Press', 'kettlebell_sumo_high_pull': 'Kettlebell_Sumo_High_Pull', 'kettlebell_thruster': 'Kettlebell_Thruster', 'kettlebell_turkish_get_up_lunge_style': 'Kettlebell_Turkish_Get-Up_Lunge_style',
  'kettlebell_turkish_get_up_squat_style': 'Kettlebell_Turkish_Get-Up_Squat_style', 'kettlebell_windmill': 'Kettlebell_Windmill', 'kipping_muscle_up': 'Kipping_Muscle_Up', 'knee_across_the_body': 'Knee_Across_The_Body',
  'knee_circles': 'Knee_Circles', 'knee_hip_raise_on_parallel_bars': 'Knee_Hip_Raise_On_Parallel_Bars', 'knee_tuck_jump': 'Knee_Tuck_Jump', 'kneeling_arm_drill': 'Kneeling_Arm_Drill',
  'kneeling_cable_crunch_with_alternating_oblique_twists': 'Kneeling_Cable_Crunch_With_Alternating_Oblique_Twists', 'kneeling_cable_triceps_extension': 'Kneeling_Cable_Triceps_Extension', 'kneeling_forearm_stretch': 'Kneeling_Forearm_Stretch', 'kneeling_high_pulley_row': 'Kneeling_High_Pulley_Row',
  'kneeling_hip_flexor': 'Kneeling_Hip_Flexor', 'kneeling_jump_squat': 'Kneeling_Jump_Squat', 'kneeling_single_arm_high_pulley_row': 'Kneeling_Single-Arm_High_Pulley_Row', 'kneeling_squat': 'Kneeling_Squat',
  'landmine_180_s': 'Landmine_180s', 'landmine_linear_jammer': 'Landmine_Linear_Jammer', 'lateral_bound': 'Lateral_Bound', 'lateral_box_jump': 'Lateral_Box_Jump',
  'lateral_cone_hops': 'Lateral_Cone_Hops', 'lateral_raise_with_bands': 'Lateral_Raise_-_With_Bands', 'latissimus_dorsi_smr': 'Latissimus_Dorsi-SMR', 'leg_extensions': 'Leg_Extensions',
  'leg_lift': 'Leg_Lift', 'leg_over_floor_press': 'Leg-Over_Floor_Press', 'leg_press': 'Leg_Press', 'leg_pull_in': 'Leg_Pull-In',
  'leg_up_hamstring_stretch': 'Leg-Up_Hamstring_Stretch', 'leverage_chest_press': 'Leverage_Chest_Press', 'leverage_deadlift': 'Leverage_Deadlift', 'leverage_decline_chest_press': 'Leverage_Decline_Chest_Press',
  'leverage_high_row': 'Leverage_High_Row', 'leverage_incline_chest_press': 'Leverage_Incline_Chest_Press', 'leverage_iso_row': 'Leverage_Iso_Row', 'leverage_shoulder_press': 'Leverage_Shoulder_Press',
  'leverage_shrug': 'Leverage_Shrug', 'linear_3_part_start_technique': 'Linear_3-Part_Start_Technique', 'linear_acceleration_wall_drill': 'Linear_Acceleration_Wall_Drill', 'linear_depth_jump': 'Linear_Depth_Jump',
  'log_lift': 'Log_Lift', 'london_bridges': 'London_Bridges', 'looking_at_ceiling': 'Looking_At_Ceiling', 'low_cable_crossover': 'Low_Cable_Crossover',
  'low_cable_triceps_extension': 'Low_Cable_Triceps_Extension', 'low_pulley_row_to_neck': 'Low_Pulley_Row_To_Neck', 'lower_back_curl': 'Lower_Back_Curl', 'lower_back_smr': 'Lower_Back-SMR',
  'lunge_pass_through': 'Lunge_Pass_Through', 'lunge_sprint': 'Lunge_Sprint', 'lying_bent_leg_groin': 'Lying_Bent_Leg_Groin', 'lying_cable_curl': 'Lying_Cable_Curl',
  'lying_cambered_barbell_row': 'Lying_Cambered_Barbell_Row', 'lying_close_grip_bar_curl_on_high_pulley': 'Lying_Close-Grip_Bar_Curl_On_High_Pulley', 'lying_close_grip_barbell_triceps_extension_behind_the_head': 'Lying_Close-Grip_Barbell_Triceps_Extension_Behind_The_Head', 'lying_close_grip_barbell_triceps_press_to_chin': 'Lying_Close-Grip_Barbell_Triceps_Press_To_Chin',
  'lying_crossover': 'Lying_Crossover', 'lying_dumbbell_tricep_extension': 'Lying_Dumbbell_Tricep_Extension', 'lying_face_down_plate_neck_resistance': 'Lying_Face_Down_Plate_Neck_Resistance', 'lying_face_up_plate_neck_resistance': 'Lying_Face_Up_Plate_Neck_Resistance',
  'lying_glute': 'Lying_Glute', 'lying_hamstring': 'Lying_Hamstring', 'lying_high_bench_barbell_curl': 'Lying_High_Bench_Barbell_Curl', 'lying_leg_curls': 'Lying_Leg_Curls',
  'lying_machine_squat': 'Lying_Machine_Squat', 'lying_one_arm_lateral_raise': 'Lying_One-Arm_Lateral_Raise', 'lying_prone_quadriceps': 'Lying_Prone_Quadriceps', 'lying_rear_delt_raise': 'Lying_Rear_Delt_Raise',
  'lying_supine_dumbbell_curl': 'Lying_Supine_Dumbbell_Curl', 'lying_t_bar_row': 'Lying_T-Bar_Row', 'lying_triceps_press': 'Lying_Triceps_Press', 'machine_bench_press': 'Machine_Bench_Press',
  'machine_bicep_curl': 'Machine_Bicep_Curl', 'machine_preacher_curls': 'Machine_Preacher_Curls', 'machine_shoulder_military_press': 'Machine_Shoulder_Military_Press', 'machine_triceps_extension': 'Machine_Triceps_Extension',
  'medicine_ball_chest_pass': 'Medicine_Ball_Chest_Pass', 'medicine_ball_full_twist': 'Medicine_Ball_Full_Twist', 'medicine_ball_scoop_throw': 'Medicine_Ball_Scoop_Throw', 'middle_back_shrug': 'Middle_Back_Shrug',
  'middle_back_stretch': 'Middle_Back_Stretch', 'mixed_grip_chin': 'Mixed_Grip_Chin', 'monster_walk': 'Monster_Walk', 'mountain_climbers': 'Mountain_Climbers',
  'moving_claw_series': 'Moving_Claw_Series', 'muscle_snatch': 'Muscle_Snatch', 'muscle_up': 'Muscle_Up', 'narrow_stance_hack_squats': 'Narrow_Stance_Hack_Squats',
  'narrow_stance_leg_press': 'Narrow_Stance_Leg_Press', 'narrow_stance_squats': 'Narrow_Stance_Squats', 'natural_glute_ham_raise': 'Natural_Glute_Ham_Raise', 'neck_press': 'Neck_Press',
  'neck_smr': 'Neck-SMR', 'oblique_crunches': 'Oblique_Crunches', 'oblique_crunches_on_the_floor': 'Oblique_Crunches_-_On_The_Floor', 'olympic_squat': 'Olympic_Squat',
  'on_your_back_quad_stretch': 'On-Your-Back_Quad_Stretch', 'on_your_side_quad_stretch': 'On_Your_Side_Quad_Stretch', 'one_arm_against_wall': 'One_Arm_Against_Wall', 'one_arm_chin_up': 'One_Arm_Chin-Up',
  'one_arm_dumbbell_bench_press': 'One_Arm_Dumbbell_Bench_Press', 'one_arm_dumbbell_preacher_curl': 'One_Arm_Dumbbell_Preacher_Curl', 'one_arm_dumbbell_row': 'One-Arm_Dumbbell_Row', 'one_arm_flat_bench_dumbbell_flye': 'One-Arm_Flat_Bench_Dumbbell_Flye',
  'one_arm_floor_press': 'One_Arm_Floor_Press', 'one_arm_high_pulley_cable_side_bends': 'One-Arm_High-Pulley_Cable_Side_Bends', 'one_arm_incline_lateral_raise': 'One-Arm_Incline_Lateral_Raise', 'one_arm_kettlebell_clean': 'One-Arm_Kettlebell_Clean',
  'one_arm_kettlebell_clean_and_jerk': 'One-Arm_Kettlebell_Clean_and_Jerk', 'one_arm_kettlebell_floor_press': 'One-Arm_Kettlebell_Floor_Press', 'one_arm_kettlebell_jerk': 'One-Arm_Kettlebell_Jerk', 'one_arm_kettlebell_military_press_to_the_side': 'One-Arm_Kettlebell_Military_Press_To_The_Side',
  'one_arm_kettlebell_para_press': 'One-Arm_Kettlebell_Para_Press', 'one_arm_kettlebell_push_press': 'One-Arm_Kettlebell_Push_Press', 'one_arm_kettlebell_row': 'One-Arm_Kettlebell_Row', 'one_arm_kettlebell_snatch': 'One-Arm_Kettlebell_Snatch',
  'one_arm_kettlebell_split_jerk': 'One-Arm_Kettlebell_Split_Jerk', 'one_arm_kettlebell_split_snatch': 'One-Arm_Kettlebell_Split_Snatch', 'one_arm_kettlebell_swings': 'One-Arm_Kettlebell_Swings', 'one_arm_lat_pulldown': 'One_Arm_Lat_Pulldown',
  'one_arm_long_bar_row': 'One-Arm_Long_Bar_Row', 'one_arm_medicine_ball_slam': 'One-Arm_Medicine_Ball_Slam', 'one_arm_open_palm_kettlebell_clean': 'One-Arm_Open_Palm_Kettlebell_Clean', 'one_arm_overhead_kettlebell_squats': 'One-Arm_Overhead_Kettlebell_Squats',
  'one_arm_pronated_dumbbell_triceps_extension': 'One_Arm_Pronated_Dumbbell_Triceps_Extension', 'one_arm_side_deadlift': 'One-Arm_Side_Deadlift', 'one_arm_side_laterals': 'One-Arm_Side_Laterals', 'one_arm_supinated_dumbbell_triceps_extension': 'One_Arm_Supinated_Dumbbell_Triceps_Extension',
  'one_half_locust': 'One_Half_Locust', 'one_handed_hang': 'One_Handed_Hang', 'one_knee_to_chest': 'One_Knee_To_Chest', 'one_leg_barbell_squat': 'One_Leg_Barbell_Squat',
  'one_legged_cable_kickback': 'One-Legged_Cable_Kickback', 'open_palm_kettlebell_clean': 'Open_Palm_Kettlebell_Clean', 'otis_up': 'Otis-Up', 'overhead_cable_curl': 'Overhead_Cable_Curl',
  'overhead_lat': 'Overhead_Lat', 'overhead_slam': 'Overhead_Slam', 'overhead_squat': 'Overhead_Squat', 'overhead_stretch': 'Overhead_Stretch',
  'overhead_triceps': 'Overhead_Triceps', 'pallof_press': 'Pallof_Press', 'pallof_press_with_rotation': 'Pallof_Press_With_Rotation', 'palms_down_dumbbell_wrist_curl_over_a_bench': 'Palms-Down_Dumbbell_Wrist_Curl_Over_A_Bench',
  'palms_down_wrist_curl_over_a_bench': 'Palms-Down_Wrist_Curl_Over_A_Bench', 'palms_up_barbell_wrist_curl_over_a_bench': 'Palms-Up_Barbell_Wrist_Curl_Over_A_Bench', 'palms_up_dumbbell_wrist_curl_over_a_bench': 'Palms-Up_Dumbbell_Wrist_Curl_Over_A_Bench', 'parallel_bar_dip': 'Parallel_Bar_Dip',
  'pelvic_tilt_into_bridge': 'Pelvic_Tilt_Into_Bridge', 'peroneals_smr': 'Peroneals-SMR', 'peroneals_stretch': 'Peroneals_Stretch', 'physioball_hip_bridge': 'Physioball_Hip_Bridge',
  'pin_presses': 'Pin_Presses', 'piriformis_smr': 'Piriformis-SMR', 'plank': 'Plank', 'plate_pinch': 'Plate_Pinch',
  'plate_twist': 'Plate_Twist', 'platform_hamstring_slides': 'Platform_Hamstring_Slides', 'plie_dumbbell_squat': 'Plie_Dumbbell_Squat', 'plyo_kettlebell_pushups': 'Plyo_Kettlebell_Pushups',
  'plyo_push_up': 'Plyo_Push-up', 'posterior_tibialis_stretch': 'Posterior_Tibialis_Stretch', 'power_clean': 'Power_Clean', 'power_clean_from_blocks': 'Power_Clean_from_Blocks',
  'power_jerk': 'Power_Jerk', 'power_partials': 'Power_Partials', 'power_snatch': 'Power_Snatch', 'power_snatch_from_blocks': 'Power_Snatch_from_Blocks',
  'power_stairs': 'Power_Stairs', 'preacher_curl': 'Preacher_Curl', 'preacher_hammer_dumbbell_curl': 'Preacher_Hammer_Dumbbell_Curl', 'press_sit_up': 'Press_Sit-Up',
  'prone_manual_hamstring': 'Prone_Manual_Hamstring', 'prowler_sprint': 'Prowler_Sprint', 'pull_through': 'Pull_Through', 'pullups': 'Pullups',
  'push_press': 'Push_Press', 'push_press_behind_the_neck': 'Push_Press_-_Behind_the_Neck', 'push_up_to_side_plank': 'Push_Up_to_Side_Plank', 'push_up_wide': 'Push-Up_Wide',
  'push_ups_close_triceps_position': 'Push-Ups_-_Close_Triceps_Position', 'push_ups_with_feet_elevated': 'Push-Ups_With_Feet_Elevated', 'push_ups_with_feet_on_an_exercise_ball': 'Push-Ups_With_Feet_On_An_Exercise_Ball', 'pushups': 'Pushups',
  'pushups_close_and_wide_hand_positions': 'Pushups_Close_and_Wide_Hand_Positions', 'pyramid': 'Pyramid', 'quad_stretch': 'Quad_Stretch', 'quadriceps_smr': 'Quadriceps-SMR',
  'quick_leap': 'Quick_Leap', 'rack_delivery': 'Rack_Delivery', 'rack_pull_with_bands': 'Rack_Pull_with_Bands', 'rack_pulls': 'Rack_Pulls',
  'rear_leg_raises': 'Rear_Leg_Raises', 'recumbent_bike': 'Recumbent_Bike', 'return_push_from_stance': 'Return_Push_from_Stance', 'reverse_band_bench_press': 'Reverse_Band_Bench_Press',
  'reverse_band_box_squat': 'Reverse_Band_Box_Squat', 'reverse_band_deadlift': 'Reverse_Band_Deadlift', 'reverse_band_power_squat': 'Reverse_Band_Power_Squat', 'reverse_band_sumo_deadlift': 'Reverse_Band_Sumo_Deadlift',
  'reverse_barbell_curl': 'Reverse_Barbell_Curl', 'reverse_barbell_preacher_curls': 'Reverse_Barbell_Preacher_Curls', 'reverse_cable_curl': 'Reverse_Cable_Curl', 'reverse_crunch': 'Reverse_Crunch',
  'reverse_flyes': 'Reverse_Flyes', 'reverse_flyes_with_external_rotation': 'Reverse_Flyes_With_External_Rotation', 'reverse_grip_bent_over_rows': 'Reverse_Grip_Bent-Over_Rows', 'reverse_grip_triceps_pushdown': 'Reverse_Grip_Triceps_Pushdown',
  'reverse_hyperextension': 'Reverse_Hyperextension', 'reverse_machine_flyes': 'Reverse_Machine_Flyes', 'reverse_plate_curls': 'Reverse_Plate_Curls', 'reverse_triceps_bench_press': 'Reverse_Triceps_Bench_Press',
  'rhomboids_smr': 'Rhomboids-SMR', 'rickshaw_carry': 'Rickshaw_Carry', 'rickshaw_deadlift': 'Rickshaw_Deadlift', 'ring_dips': 'Ring_Dips',
  'rocket_jump': 'Rocket_Jump', 'rocking_standing_calf_raise': 'Rocking_Standing_Calf_Raise', 'rocky_pull_ups_pulldowns': 'Rocky_Pull-Ups_Pulldowns', 'romanian_deadlift': 'Romanian_Deadlift',
  'romanian_deadlift_from_deficit': 'Romanian_Deadlift_from_Deficit', 'rope_climb': 'Rope_Climb', 'rope_crunch': 'Rope_Crunch', 'rope_jumping': 'Rope_Jumping',
  'rope_straight_arm_pulldown': 'Rope_Straight-Arm_Pulldown', 'round_the_world_shoulder_stretch': 'Round_The_World_Shoulder_Stretch', 'rowing_stationary': 'Rowing_Stationary', 'runner_s_stretch': 'Runners_Stretch',
  'running_treadmill': 'Running_Treadmill', 'russian_twist': 'Russian_Twist', 'sandbag_load': 'Sandbag_Load', 'scapular_pull_up': 'Scapular_Pull-Up',
  'scissor_kick': 'Scissor_Kick', 'scissors_jump': 'Scissors_Jump', 'seated_band_hamstring_curl': 'Seated_Band_Hamstring_Curl', 'seated_barbell_military_press': 'Seated_Barbell_Military_Press',
  'seated_barbell_twist': 'Seated_Barbell_Twist', 'seated_bent_over_one_arm_dumbbell_triceps_extension': 'Seated_Bent-Over_One-Arm_Dumbbell_Triceps_Extension', 'seated_bent_over_rear_delt_raise': 'Seated_Bent-Over_Rear_Delt_Raise', 'seated_bent_over_two_arm_dumbbell_triceps_extension': 'Seated_Bent-Over_Two-Arm_Dumbbell_Triceps_Extension',
  'seated_biceps': 'Seated_Biceps', 'seated_cable_rows': 'Seated_Cable_Rows', 'seated_cable_shoulder_press': 'Seated_Cable_Shoulder_Press', 'seated_calf_raise': 'Seated_Calf_Raise',
  'seated_calf_stretch': 'Seated_Calf_Stretch', 'seated_close_grip_concentration_barbell_curl': 'Seated_Close-Grip_Concentration_Barbell_Curl', 'seated_dumbbell_curl': 'Seated_Dumbbell_Curl', 'seated_dumbbell_inner_biceps_curl': 'Seated_Dumbbell_Inner_Biceps_Curl',
  'seated_dumbbell_palms_down_wrist_curl': 'Seated_Dumbbell_Palms-Down_Wrist_Curl', 'seated_dumbbell_palms_up_wrist_curl': 'Seated_Dumbbell_Palms-Up_Wrist_Curl', 'seated_dumbbell_press': 'Seated_Dumbbell_Press', 'seated_flat_bench_leg_pull_in': 'Seated_Flat_Bench_Leg_Pull-In',
  'seated_floor_hamstring_stretch': 'Seated_Floor_Hamstring_Stretch', 'seated_front_deltoid': 'Seated_Front_Deltoid', 'seated_glute': 'Seated_Glute', 'seated_good_mornings': 'Seated_Good_Mornings',
  'seated_hamstring': 'Seated_Hamstring', 'seated_hamstring_and_calf_stretch': 'Seated_Hamstring_and_Calf_Stretch', 'seated_head_harness_neck_resistance': 'Seated_Head_Harness_Neck_Resistance', 'seated_leg_curl': 'Seated_Leg_Curl',
  'seated_leg_tucks': 'Seated_Leg_Tucks', 'seated_one_arm_cable_pulley_rows': 'Seated_One-arm_Cable_Pulley_Rows', 'seated_one_arm_dumbbell_palms_down_wrist_curl': 'Seated_One-Arm_Dumbbell_Palms-Down_Wrist_Curl', 'seated_one_arm_dumbbell_palms_up_wrist_curl': 'Seated_One-Arm_Dumbbell_Palms-Up_Wrist_Curl',
  'seated_overhead_stretch': 'Seated_Overhead_Stretch', 'seated_palm_up_barbell_wrist_curl': 'Seated_Palm-Up_Barbell_Wrist_Curl', 'seated_palms_down_barbell_wrist_curl': 'Seated_Palms-Down_Barbell_Wrist_Curl', 'seated_side_lateral_raise': 'Seated_Side_Lateral_Raise',
  'seated_triceps_press': 'Seated_Triceps_Press', 'seated_two_arm_palms_up_low_pulley_wrist_curl': 'Seated_Two-Arm_Palms-Up_Low-Pulley_Wrist_Curl', 'see_saw_press_alternating_side_press': 'See-Saw_Press_Alternating_Side_Press', 'shotgun_row': 'Shotgun_Row',
  'shoulder_circles': 'Shoulder_Circles', 'shoulder_press_with_bands': 'Shoulder_Press_-_With_Bands', 'shoulder_raise': 'Shoulder_Raise', 'shoulder_stretch': 'Shoulder_Stretch',
  'side_bridge': 'Side_Bridge', 'side_hop_sprint': 'Side_Hop-Sprint', 'side_jackknife': 'Side_Jackknife', 'side_lateral_raise': 'Side_Lateral_Raise',
  'side_laterals_to_front_raise': 'Side_Laterals_to_Front_Raise', 'side_leg_raises': 'Side_Leg_Raises', 'side_lying_floor_stretch': 'Side-Lying_Floor_Stretch', 'side_lying_groin_stretch': 'Side_Lying_Groin_Stretch',
  'side_neck_stretch': 'Side_Neck_Stretch', 'side_standing_long_jump': 'Side_Standing_Long_Jump', 'side_to_side_box_shuffle': 'Side_to_Side_Box_Shuffle', 'side_to_side_chins': 'Side_To_Side_Chins',
  'side_wrist_pull': 'Side_Wrist_Pull', 'single_arm_cable_crossover': 'Single-Arm_Cable_Crossover', 'single_arm_linear_jammer': 'Single-Arm_Linear_Jammer', 'single_arm_push_up': 'Single-Arm_Push-Up',
  'single_cone_sprint_drill': 'Single-Cone_Sprint_Drill', 'single_dumbbell_raise': 'Single_Dumbbell_Raise', 'single_leg_butt_kick': 'Single_Leg_Butt_Kick', 'single_leg_glute_bridge': 'Single_Leg_Glute_Bridge',
  'single_leg_high_box_squat': 'Single-Leg_High_Box_Squat', 'single_leg_hop_progression': 'Single-Leg_Hop_Progression', 'single_leg_lateral_hop': 'Single-Leg_Lateral_Hop', 'single_leg_leg_extension': 'Single-Leg_Leg_Extension',
  'single_leg_push_off': 'Single_Leg_Push-off', 'single_leg_stride_jump': 'Single-Leg_Stride_Jump', 'sit_squats': 'Sit_Squats', 'sit_up': 'Sit-Up',
  'skating': 'Skating', 'sled_drag_harness': 'Sled_Drag_-_Harness', 'sled_overhead_backward_walk': 'Sled_Overhead_Backward_Walk', 'sled_overhead_triceps_extension': 'Sled_Overhead_Triceps_Extension',
  'sled_push': 'Sled_Push', 'sled_reverse_flye': 'Sled_Reverse_Flye', 'sled_row': 'Sled_Row', 'sledgehammer_swings': 'Sledgehammer_Swings',
  'smith_incline_shoulder_raise': 'Smith_Incline_Shoulder_Raise', 'smith_machine_behind_the_back_shrug': 'Smith_Machine_Behind_the_Back_Shrug', 'smith_machine_bench_press': 'Smith_Machine_Bench_Press', 'smith_machine_bent_over_row': 'Smith_Machine_Bent_Over_Row',
  'smith_machine_calf_raise': 'Smith_Machine_Calf_Raise', 'smith_machine_close_grip_bench_press': 'Smith_Machine_Close-Grip_Bench_Press', 'smith_machine_decline_press': 'Smith_Machine_Decline_Press', 'smith_machine_hang_power_clean': 'Smith_Machine_Hang_Power_Clean',
  'smith_machine_hip_raise': 'Smith_Machine_Hip_Raise', 'smith_machine_incline_bench_press': 'Smith_Machine_Incline_Bench_Press', 'smith_machine_leg_press': 'Smith_Machine_Leg_Press', 'smith_machine_one_arm_upright_row': 'Smith_Machine_One-Arm_Upright_Row',
  'smith_machine_overhead_shoulder_press': 'Smith_Machine_Overhead_Shoulder_Press', 'smith_machine_pistol_squat': 'Smith_Machine_Pistol_Squat', 'smith_machine_reverse_calf_raises': 'Smith_Machine_Reverse_Calf_Raises', 'smith_machine_squat': 'Smith_Machine_Squat',
  'smith_machine_stiff_legged_deadlift': 'Smith_Machine_Stiff-Legged_Deadlift', 'smith_machine_upright_row': 'Smith_Machine_Upright_Row', 'smith_single_leg_split_squat': 'Smith_Single-Leg_Split_Squat', 'snatch': 'Snatch',
  'snatch_balance': 'Snatch_Balance', 'snatch_deadlift': 'Snatch_Deadlift', 'snatch_from_blocks': 'Snatch_from_Blocks', 'snatch_pull': 'Snatch_Pull',
  'snatch_shrug': 'Snatch_Shrug', 'speed_band_overhead_triceps': 'Speed_Band_Overhead_Triceps', 'speed_box_squat': 'Speed_Box_Squat', 'speed_squats': 'Speed_Squats',
  'spell_caster': 'Spell_Caster', 'spider_crawl': 'Spider_Crawl', 'spider_curl': 'Spider_Curl', 'spinal_stretch': 'Spinal_Stretch',
  'split_clean': 'Split_Clean', 'split_jerk': 'Split_Jerk', 'split_jump': 'Split_Jump', 'split_snatch': 'Split_Snatch',
  'split_squat_with_dumbbells': 'Split_Squat_with_Dumbbells', 'split_squats': 'Split_Squats', 'squat_jerk': 'Squat_Jerk', 'squat_with_bands': 'Squat_with_Bands',
  'squat_with_chains': 'Squat_with_Chains', 'squat_with_plate_movers': 'Squat_with_Plate_Movers', 'squats_with_bands': 'Squats_-_With_Bands', 'stairmaster': 'Stairmaster',
  'standing_alternating_dumbbell_press': 'Standing_Alternating_Dumbbell_Press', 'standing_barbell_calf_raise': 'Standing_Barbell_Calf_Raise', 'standing_barbell_press_behind_neck': 'Standing_Barbell_Press_Behind_Neck', 'standing_bent_over_one_arm_dumbbell_triceps_extension': 'Standing_Bent-Over_One-Arm_Dumbbell_Triceps_Extension',
  'standing_bent_over_two_arm_dumbbell_triceps_extension': 'Standing_Bent-Over_Two-Arm_Dumbbell_Triceps_Extension', 'standing_biceps_cable_curl': 'Standing_Biceps_Cable_Curl', 'standing_biceps_stretch': 'Standing_Biceps_Stretch', 'standing_bradford_press': 'Standing_Bradford_Press',
  'standing_cable_chest_press': 'Standing_Cable_Chest_Press', 'standing_cable_lift': 'Standing_Cable_Lift', 'standing_cable_wood_chop': 'Standing_Cable_Wood_Chop', 'standing_calf_raises': 'Standing_Calf_Raises',
  'standing_concentration_curl': 'Standing_Concentration_Curl', 'standing_dumbbell_calf_raise': 'Standing_Dumbbell_Calf_Raise', 'standing_dumbbell_press': 'Standing_Dumbbell_Press', 'standing_dumbbell_reverse_curl': 'Standing_Dumbbell_Reverse_Curl',
  'standing_dumbbell_straight_arm_front_delt_raise_above_head': 'Standing_Dumbbell_Straight-Arm_Front_Delt_Raise_Above_Head', 'standing_dumbbell_triceps_extension': 'Standing_Dumbbell_Triceps_Extension', 'standing_dumbbell_upright_row': 'Standing_Dumbbell_Upright_Row', 'standing_elevated_quad_stretch': 'Standing_Elevated_Quad_Stretch',
  'standing_front_barbell_raise_over_head': 'Standing_Front_Barbell_Raise_Over_Head', 'standing_gastrocnemius_calf_stretch': 'Standing_Gastrocnemius_Calf_Stretch', 'standing_hamstring_and_calf_stretch': 'Standing_Hamstring_and_Calf_Stretch', 'standing_hip_circles': 'Standing_Hip_Circles',
  'standing_hip_flexors': 'Standing_Hip_Flexors', 'standing_inner_biceps_curl': 'Standing_Inner-Biceps_Curl', 'standing_lateral_stretch': 'Standing_Lateral_Stretch', 'standing_leg_curl': 'Standing_Leg_Curl',
  'standing_long_jump': 'Standing_Long_Jump', 'standing_low_pulley_deltoid_raise': 'Standing_Low-Pulley_Deltoid_Raise', 'standing_low_pulley_one_arm_triceps_extension': 'Standing_Low-Pulley_One-Arm_Triceps_Extension', 'standing_military_press': 'Standing_Military_Press',
  'standing_olympic_plate_hand_squeeze': 'Standing_Olympic_Plate_Hand_Squeeze', 'standing_one_arm_cable_curl': 'Standing_One-Arm_Cable_Curl', 'standing_one_arm_dumbbell_curl_over_incline_bench': 'Standing_One-Arm_Dumbbell_Curl_Over_Incline_Bench', 'standing_one_arm_dumbbell_triceps_extension': 'Standing_One-Arm_Dumbbell_Triceps_Extension',
  'standing_overhead_barbell_triceps_extension': 'Standing_Overhead_Barbell_Triceps_Extension', 'standing_palm_in_one_arm_dumbbell_press': 'Standing_Palm-In_One-Arm_Dumbbell_Press', 'standing_palms_in_dumbbell_press': 'Standing_Palms-In_Dumbbell_Press', 'standing_palms_up_barbell_behind_the_back_wrist_curl': 'Standing_Palms-Up_Barbell_Behind_The_Back_Wrist_Curl',
  'standing_pelvic_tilt': 'Standing_Pelvic_Tilt', 'standing_rope_crunch': 'Standing_Rope_Crunch', 'standing_soleus_and_achilles_stretch': 'Standing_Soleus_And_Achilles_Stretch', 'standing_toe_touches': 'Standing_Toe_Touches',
  'standing_towel_triceps_extension': 'Standing_Towel_Triceps_Extension', 'standing_two_arm_overhead_throw': 'Standing_Two-Arm_Overhead_Throw', 'star_jump': 'Star_Jump', 'step_mill': 'Step_Mill',
  'step_up_with_knee_raise': 'Step-up_with_Knee_Raise', 'stiff_leg_barbell_good_morning': 'Stiff_Leg_Barbell_Good_Morning', 'stiff_legged_barbell_deadlift': 'Stiff-Legged_Barbell_Deadlift', 'stiff_legged_dumbbell_deadlift': 'Stiff-Legged_Dumbbell_Deadlift',
  'stomach_vacuum': 'Stomach_Vacuum', 'straight_arm_dumbbell_pullover': 'Straight-Arm_Dumbbell_Pullover', 'straight_arm_pulldown': 'Straight-Arm_Pulldown', 'straight_bar_bench_mid_rows': 'Straight_Bar_Bench_Mid_Rows',
  'straight_raises_on_incline_bench': 'Straight_Raises_on_Incline_Bench', 'stride_jump_crossover': 'Stride_Jump_Crossover', 'sumo_deadlift': 'Sumo_Deadlift', 'sumo_deadlift_with_bands': 'Sumo_Deadlift_with_Bands',
  'sumo_deadlift_with_chains': 'Sumo_Deadlift_with_Chains', 'superman': 'Superman', 'supine_chest_throw': 'Supine_Chest_Throw', 'supine_one_arm_overhead_throw': 'Supine_One-Arm_Overhead_Throw',
  'supine_two_arm_overhead_throw': 'Supine_Two-Arm_Overhead_Throw', 'suspended_fallout': 'Suspended_Fallout', 'suspended_push_up': 'Suspended_Push-Up', 'suspended_reverse_crunch': 'Suspended_Reverse_Crunch',
  'suspended_row': 'Suspended_Row', 'suspended_split_squat': 'Suspended_Split_Squat', 'svend_press': 'Svend_Press', 't_bar_row_with_handle': 'T-Bar_Row_with_Handle',
  'tate_press': 'Tate_Press', 'the_straddle': 'The_Straddle', 'thigh_abductor': 'Thigh_Abductor', 'thigh_adductor': 'Thigh_Adductor',
  'tire_flip': 'Tire_Flip', 'toe_touchers': 'Toe_Touchers', 'torso_rotation': 'Torso_Rotation', 'trail_running_walking': 'Trail_Running_Walking',
  'trap_bar_deadlift': 'Trap_Bar_Deadlift', 'tricep_dumbbell_kickback': 'Tricep_Dumbbell_Kickback', 'tricep_side_stretch': 'Tricep_Side_Stretch', 'triceps_overhead_extension_with_rope': 'Triceps_Overhead_Extension_with_Rope',
  'triceps_pushdown': 'Triceps_Pushdown', 'triceps_pushdown_rope_attachment': 'Triceps_Pushdown_-_Rope_Attachment', 'triceps_pushdown_v_bar_attachment': 'Triceps_Pushdown_-_V-Bar_Attachment', 'triceps_stretch': 'Triceps_Stretch',
  'tuck_crunch': 'Tuck_Crunch', 'two_arm_dumbbell_preacher_curl': 'Two-Arm_Dumbbell_Preacher_Curl', 'two_arm_kettlebell_clean': 'Two-Arm_Kettlebell_Clean', 'two_arm_kettlebell_jerk': 'Two-Arm_Kettlebell_Jerk',
  'two_arm_kettlebell_military_press': 'Two-Arm_Kettlebell_Military_Press', 'two_arm_kettlebell_row': 'Two-Arm_Kettlebell_Row', 'underhand_cable_pulldowns': 'Underhand_Cable_Pulldowns', 'upper_back_leg_grab': 'Upper_Back-Leg_Grab',
  'upper_back_stretch': 'Upper_Back_Stretch', 'upright_barbell_row': 'Upright_Barbell_Row', 'upright_cable_row': 'Upright_Cable_Row', 'upright_row_with_bands': 'Upright_Row_-_With_Bands',
  'upward_stretch': 'Upward_Stretch', 'v_bar_pulldown': 'V-Bar_Pulldown', 'v_bar_pullup': 'V-Bar_Pullup', 'vertical_swing': 'Vertical_Swing',
  'walking_treadmill': 'Walking_Treadmill', 'weighted_ball_hyperextension': 'Weighted_Ball_Hyperextension', 'weighted_ball_side_bend': 'Weighted_Ball_Side_Bend', 'weighted_bench_dip': 'Weighted_Bench_Dip',
  'weighted_crunches': 'Weighted_Crunches', 'weighted_jump_squat': 'Weighted_Jump_Squat', 'weighted_pull_ups': 'Weighted_Pull_Ups', 'weighted_sissy_squat': 'Weighted_Sissy_Squat',
  'weighted_sit_ups_with_bands': 'Weighted_Sit-Ups_-_With_Bands', 'weighted_squat': 'Weighted_Squat', 'wide_grip_barbell_bench_press': 'Wide-Grip_Barbell_Bench_Press', 'wide_grip_decline_barbell_bench_press': 'Wide-Grip_Decline_Barbell_Bench_Press',
  'wide_grip_decline_barbell_pullover': 'Wide-Grip_Decline_Barbell_Pullover', 'wide_grip_lat_pulldown': 'Wide-Grip_Lat_Pulldown', 'wide_grip_pulldown_behind_the_neck': 'Wide-Grip_Pulldown_Behind_The_Neck', 'wide_grip_rear_pull_up': 'Wide-Grip_Rear_Pull-Up',
  'wide_grip_standing_barbell_curl': 'Wide-Grip_Standing_Barbell_Curl', 'wide_stance_barbell_squat': 'Wide_Stance_Barbell_Squat', 'wide_stance_stiff_legs': 'Wide_Stance_Stiff_Legs', 'wind_sprints': 'Wind_Sprints',
  'windmills': 'Windmills', 'world_s_greatest_stretch': 'Worlds_Greatest_Stretch', 'wrist_circles': 'Wrist_Circles', 'wrist_roller': 'Wrist_Roller',
  'wrist_rotations_with_straight_bar': 'Wrist_Rotations_with_Straight_Bar', 'yoke_walk': 'Yoke_Walk', 'zercher_squats': 'Zercher_Squats', 'zottman_curl': 'Zottman_Curl',
  'zottman_preacher_curl': 'Zottman_Preacher_Curl',
};

/**
 * Derive the [start, end] demo frame pair for an exercise NAME via the bundled
 * free-exercise-db slug index. Returns null when the normalized name is not in
 * the catalogue.
 */
function framesFromName(name: string): readonly string[] | null {
  const slug = FEDB_SLUGS[normalizeExerciseName(name)];
  return slug ? fedb(slug) : null;
}

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
 * rep). Resolution precedence, first hit wins:
 *
 *   1. backend `demoGifUrl` — an explicit, already-resolved demo (single frame);
 *   2. derive from `imageUrl` — when it's a free-exercise-db CDN image, strip to
 *      its slug dir and emit the animated [0.jpg, 1.jpg] pair (covers the whole
 *      seeded catalogue, since the backend stores a FEDB image for every one);
 *   3. curated {@link DEMO_FRAMES} map — hand-picked slugs for marquee app names
 *      whose FEDB name differs (e.g. "Barbell Back Squat" → Barbell_Full_Squat);
 *   4. bundled name → slug index — derive from the exercise NAME for any other
 *      catalogued movement that arrived without a recognised `imageUrl`.
 *
 * Returns null when nothing matches so the caller can fall back to the static
 * image / "coming soon" state. All URLs are HTTPS (ATS-safe).
 *
 * The `imageUrl` field is an additive optional input: existing callers that pass
 * only `{ name, demoGifUrl }` keep working unchanged.
 */
export function resolveDemoFrames(
  exercise:
    | { name?: string | null; demoGifUrl?: string | null; imageUrl?: string | null }
    | null
    | undefined,
): readonly string[] | null {
  if (!exercise) return null;
  if (exercise.demoGifUrl) return [exercise.demoGifUrl];
  // Derive straight from a free-exercise-db CDN image URL when present.
  const slug = fedbSlugFromImageUrl(exercise.imageUrl);
  if (slug) return fedb(slug);
  const name = exercise.name;
  if (!name) return null;
  // Curated map wins over the generic index so hand-picked slugs are preserved.
  const curated = DEMO_FRAMES_LC[name.trim().toLowerCase()];
  if (curated) return curated;
  return framesFromName(name);
}

/**
 * Pure coverage metric for a catalogue of exercises: how many would resolve to
 * animated demo frames via {@link resolveDemoFrames}. Lets a test (or a dev-time
 * log) quantify in-app demo coverage across the whole library without rendering.
 */
export function demoCoverage(
  catalog: ReadonlyArray<{ name?: string | null; demoGifUrl?: string | null; imageUrl?: string | null }>,
): { matched: number; total: number } {
  let matched = 0;
  for (const ex of catalog) {
    if (resolveDemoFrames(ex)) matched++;
  }
  return { matched, total: catalog.length };
}

/**
 * Resolve a single in-app demo image URL for an exercise (the first/start frame).
 * Mirrors {@link resolveDemoFrames}'s precedence (backend `demoGifUrl` → derive
 * from a free-exercise-db `imageUrl` → curated map → name index) and returns its
 * first frame. Returns null when nothing matches.
 */
export function resolveDemoGif(
  exercise:
    | { name?: string | null; demoGifUrl?: string | null; imageUrl?: string | null }
    | null
    | undefined,
): string | null {
  const frames = resolveDemoFrames(exercise);
  return frames && frames.length > 0 ? frames[0] ?? null : null;
}

/**
 * Derive the best-frame poster (still) URL for a self-hosted MP4 demo clip.
 *
 * The VPS batch job writes a best-frame JPG next to every catalog video at an
 * IDENTICAL path with the extension swapped (`…/<file>.mp4` → `…/<file>.jpg`),
 * served by the same nginx location. So the poster URL is simply the `videoUrl`
 * with a CASE-INSENSITIVE trailing `.mp4` (before any `?query`) replaced by
 * `.jpg`. Used as the pre-play still on the video player and as the preferred
 * grid/list thumbnail for catalog (video) exercises that lack a real `imageUrl`.
 *
 * Returns undefined when there is no `videoUrl`, or when it is not an `.mp4`
 * (so the caller cleanly falls back to the existing image / placeholder). The
 * JPG may 404 transiently while the batch is still running — every consumer
 * wires an `onError` fallback so a missing poster is seamless.
 */
export function posterFromVideoUrl(videoUrl?: string | null): string | undefined {
  if (typeof videoUrl !== 'string') return undefined;
  const trimmed = videoUrl.trim();
  if (!trimmed) return undefined;
  // Split off any ?query / #hash so the `.mp4` we match is the real path suffix,
  // then re-attach the suffix unchanged (the poster lives at the same query-less
  // path; a cache-busting query, if any, is preserved verbatim).
  const suffixIdx = trimmed.search(/[?#]/);
  const pathPart = suffixIdx === -1 ? trimmed : trimmed.slice(0, suffixIdx);
  const suffix = suffixIdx === -1 ? '' : trimmed.slice(suffixIdx);
  if (!/\.mp4$/i.test(pathPart)) return undefined;
  return pathPart.replace(/\.mp4$/i, '.jpg') + suffix;
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

// ---------------------------------------------------------------------------
// Curated demo map (sibling module) — strictly additive re-export.
//
// {@link ./curatedDemos.ts} grows the 35-entry DEMO_FALLBACK map to >=100
// distinct exercise names via a single `getCuratedDemo()` accessor, tagging
// each entry with a `verified` flag and one of three source shapes:
//
//   - 'youtube'      → a specific watch URL (grandfathered + a few pending);
//   - 'fedb_frames'  → the free-exercise-db 0.jpg|1.jpg pair (zero new fetch);
//   - 'gif'          → reserved for static animated demos (currently unused).
//
// Re-exported here so callers that already import from `@/constants/exerciseDemos`
// get the new accessor without a new import path. None of the existing exports
// (DEMO_FALLBACK, DEMO_FRAMES, DEMO_GIF, resolveDemo, resolveDemoFrames,
// resolveDemoGif, tipsFor, etc.) change.
// ---------------------------------------------------------------------------
export { getCuratedDemo, CURATED_DEMOS, type CuratedDemo } from './curatedDemos';
