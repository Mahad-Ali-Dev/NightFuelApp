/**
 * exerciseDemos.test.ts
 *
 * Covers the in-app demo-frame resolver, focusing on the auto-derivation that
 * lifts coverage from the ~24 hand-curated movements to the whole
 * free-exercise-db catalogue:
 *
 *   - backend `demoGifUrl` wins over everything;
 *   - a free-exercise-db CDN `imageUrl` (jsDelivr OR raw.githubusercontent) is
 *     stripped to its slug dir and emitted as the animated [0.jpg, 1.jpg] pair;
 *   - a catalogued exercise NAME resolves via the bundled slug index even with
 *     no imageUrl (curated + case-insensitive/trimmed);
 *   - an unknown exercise resolves to null;
 *   - the catalogue coverage metric is materially higher than the ~24 baseline.
 *
 * Pure data/logic — no React, no network. The catalogue fixture mirrors how the
 * backend seeds `imageUrl` (jsDelivr CDN path embedding the FEDB slug dir).
 */
import * as fs from 'fs';
import * as path from 'path';

import {
  resolveDemoFrames,
  resolveDemoGif,
  demoCoverage,
  fedbSlugFromImageUrl,
  DEMO_FALLBACK,
} from '@/constants/exerciseDemos';

const RAW_BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises';
const JSDELIVR_BASE = 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises';

describe('resolveDemoFrames — precedence', () => {
  test('backend demoGifUrl wins over imageUrl and curated name', () => {
    const frames = resolveDemoFrames({
      name: 'Barbell Bench Press', // also a curated name
      demoGifUrl: 'https://cdn.example.com/explicit-demo.gif',
      imageUrl: `${JSDELIVR_BASE}/Barbell_Deadlift/0.jpg`,
    });
    expect(frames).toEqual(['https://cdn.example.com/explicit-demo.gif']);
  });

  test('a free-exercise-db jsDelivr imageUrl derives [dir/0.jpg, dir/1.jpg]', () => {
    const frames = resolveDemoFrames({
      name: 'Some Name Not In Any Map At All',
      imageUrl: `${JSDELIVR_BASE}/Barbell_Squat/0.jpg`,
    });
    expect(frames).toEqual([`${RAW_BASE}/Barbell_Squat/0.jpg`, `${RAW_BASE}/Barbell_Squat/1.jpg`]);
  });

  test('a raw.githubusercontent imageUrl is also accepted and re-emitted on HTTPS raw base', () => {
    const frames = resolveDemoFrames({
      name: 'Unmapped',
      imageUrl: `${RAW_BASE}/Front_Box_Jump/1.jpg`,
    });
    expect(frames).toEqual([`${RAW_BASE}/Front_Box_Jump/0.jpg`, `${RAW_BASE}/Front_Box_Jump/1.jpg`]);
  });

  test('derived frame URLs are always HTTPS (ATS-safe), even from an http imageUrl', () => {
    const frames = resolveDemoFrames({
      name: 'Unmapped',
      imageUrl: 'http://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Plank/0.jpg',
    });
    expect(frames).not.toBeNull();
    for (const url of frames!) {
      expect(url.startsWith('https://')).toBe(true);
    }
  });
});

describe('resolveDemoFrames — curated name map (unchanged behaviour)', () => {
  test('an exact curated name resolves to its hand-picked slug frames', () => {
    // "Barbell Back Squat" is a curated app name → Barbell_Full_Squat, a slug the
    // generic FEDB name index does NOT contain under that name. Proves curated
    // entries are preserved.
    const frames = resolveDemoFrames({ name: 'Barbell Back Squat' });
    expect(frames).toEqual([`${RAW_BASE}/Barbell_Full_Squat/0.jpg`, `${RAW_BASE}/Barbell_Full_Squat/1.jpg`]);
  });

  test('a curated name matches case-insensitively and trimmed', () => {
    const frames = resolveDemoFrames({ name: '   barbell BACK squat  ' });
    expect(frames).toEqual([`${RAW_BASE}/Barbell_Full_Squat/0.jpg`, `${RAW_BASE}/Barbell_Full_Squat/1.jpg`]);
  });
});

describe('resolveDemoFrames — name-only derivation via the bundled slug index', () => {
  test('a catalogued exercise name with no imageUrl still resolves to frames', () => {
    const frames = resolveDemoFrames({ name: 'Goblet Squat' });
    expect(frames).toEqual([`${RAW_BASE}/Goblet_Squat/0.jpg`, `${RAW_BASE}/Goblet_Squat/1.jpg`]);
  });

  test("normalises punctuation/case (e.g. apostrophes) to the right slug", () => {
    // "Farmer's Walk" → slug dir "Farmers_Walk" (apostrophe collapsed).
    const frames = resolveDemoFrames({ name: "Farmer's Walk" });
    expect(frames).toEqual([`${RAW_BASE}/Farmers_Walk/0.jpg`, `${RAW_BASE}/Farmers_Walk/1.jpg`]);
  });

  test('a "/" in the name normalises correctly (e.g. "3/4 Sit-Up")', () => {
    const frames = resolveDemoFrames({ name: '3/4 Sit-Up' });
    expect(frames).toEqual([`${RAW_BASE}/3_4_Sit-Up/0.jpg`, `${RAW_BASE}/3_4_Sit-Up/1.jpg`]);
  });
});

describe('resolveDemoFrames — misses', () => {
  test('an unknown exercise (no demoGifUrl/imageUrl/known name) resolves to null', () => {
    expect(resolveDemoFrames({ name: 'Totally Made Up Movement 9000' })).toBeNull();
  });

  test('a non-FEDB imageUrl does not derive frames (and unknown name → null)', () => {
    expect(
      resolveDemoFrames({ name: 'Unknown', imageUrl: 'https://example.com/some/other/image.jpg' }),
    ).toBeNull();
  });

  test('null / nameless inputs resolve to null', () => {
    expect(resolveDemoFrames(null)).toBeNull();
    expect(resolveDemoFrames(undefined)).toBeNull();
    expect(resolveDemoFrames({})).toBeNull();
  });

  test('resolveDemoGif returns the first (start) frame for a derived exercise', () => {
    expect(resolveDemoGif({ name: 'Unmapped', imageUrl: `${JSDELIVR_BASE}/Goblet_Squat/0.jpg` })).toBe(
      `${RAW_BASE}/Goblet_Squat/0.jpg`,
    );
  });
});

// A representative slice of the seeded library: 125 real free-exercise-db
// exercises, each with the jsDelivr `imageUrl` the backend stores. Used to prove
// catalogue coverage far exceeds the hand-curated baseline.
const CATALOG_FIXTURE: ReadonlyArray<{ name: string; imageUrl: string }> = [
  { name: '3/4 Sit-Up', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/3_4_Sit-Up/0.jpg' },
  { name: 'Air Bike', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Air_Bike/0.jpg' },
  { name: 'Alternating Deltoid Raise', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Alternating_Deltoid_Raise/0.jpg' },
  { name: 'Ankle On The Knee', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Ankle_On_The_Knee/0.jpg' },
  { name: 'Atlas Stones', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Atlas_Stones/0.jpg' },
  { name: 'Band Assisted Pull-Up', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Band_Assisted_Pull-Up/0.jpg' },
  { name: 'Barbell Ab Rollout - On Knees', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Barbell_Ab_Rollout_-_On_Knees/0.jpg' },
  { name: 'Barbell Guillotine Bench Press', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Barbell_Guillotine_Bench_Press/0.jpg' },
  { name: 'Barbell Rollout from Bench', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Barbell_Rollout_from_Bench/0.jpg' },
  { name: 'Barbell Squat', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Barbell_Squat/0.jpg' },
  { name: 'Bench Dips', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Bench_Dips/0.jpg' },
  { name: 'Bent-Arm Dumbbell Pullover', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Bent-Arm_Dumbbell_Pullover/0.jpg' },
  { name: 'Bent Over Two-Dumbbell Row', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Bent_Over_Two-Dumbbell_Row/0.jpg' },
  { name: 'Body Tricep Press', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Body_Tricep_Press/0.jpg' },
  { name: 'Bottoms Up', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Bottoms_Up/0.jpg' },
  { name: 'Bradford/Rocky Presses', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Bradford_Rocky_Presses/0.jpg' },
  { name: 'Cable Deadlifts', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Cable_Deadlifts/0.jpg' },
  { name: 'Cable Judo Flip', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Cable_Judo_Flip/0.jpg' },
  { name: 'Cable Rope Rear-Delt Rows', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Cable_Rope_Rear-Delt_Rows/0.jpg' },
  { name: 'Calf-Machine Shoulder Shrug', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Calf-Machine_Shoulder_Shrug/0.jpg' },
  { name: 'Calves-SMR', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Calves-SMR/0.jpg' },
  { name: 'Chain Press', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Chain_Press/0.jpg' },
  { name: 'Chest Push (multiple response)', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Chest_Push_multiple_response/0.jpg' },
  { name: 'Circus Bell', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Circus_Bell/0.jpg' },
  { name: 'Clean from Blocks', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Clean_from_Blocks/0.jpg' },
  { name: 'Close-Grip Front Lat Pulldown', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Close-Grip_Front_Lat_Pulldown/0.jpg' },
  { name: 'Cross Body Hammer Curl', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Cross_Body_Hammer_Curl/0.jpg' },
  { name: 'Cuban Press', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Cuban_Press/0.jpg' },
  { name: 'Decline Crunch', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Decline_Crunch/0.jpg' },
  { name: 'Decline Reverse Crunch', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Decline_Reverse_Crunch/0.jpg' },
  { name: 'Donkey Calf Raises', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Donkey_Calf_Raises/0.jpg' },
  { name: 'Downward Facing Balance', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Downward_Facing_Balance/0.jpg' },
  { name: 'Dumbbell Clean', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Dumbbell_Clean/0.jpg' },
  { name: 'Dumbbell Lying Pronation', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Dumbbell_Lying_Pronation/0.jpg' },
  { name: 'Dumbbell Raise', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Dumbbell_Raise/0.jpg' },
  { name: 'Dumbbell Side Bend', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Dumbbell_Side_Bend/0.jpg' },
  { name: 'EZ-Bar Curl', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/EZ-Bar_Curl/0.jpg' },
  { name: 'Elliptical Trainer', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Elliptical_Trainer/0.jpg' },
  { name: 'Face Pull', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Face_Pull/0.jpg' },
  { name: 'Flexor Incline Dumbbell Curls', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Flexor_Incline_Dumbbell_Curls/0.jpg' },
  { name: 'Frankenstein Squat', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Frankenstein_Squat/0.jpg' },
  { name: 'Front Cable Raise', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Front_Cable_Raise/0.jpg' },
  { name: 'Front Squat (Clean Grip)', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Front_Squat_Clean_Grip/0.jpg' },
  { name: 'Goblet Squat', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Goblet_Squat/0.jpg' },
  { name: 'Hammer Curls', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Hammer_Curls/0.jpg' },
  { name: 'Hang Snatch', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Hang_Snatch/0.jpg' },
  { name: 'High Cable Curls', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/High_Cable_Curls/0.jpg' },
  { name: 'Hurdle Hops', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Hurdle_Hops/0.jpg' },
  { name: 'Incline Bench Pull', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Incline_Bench_Pull/0.jpg' },
  { name: 'Incline Dumbbell Press', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Incline_Dumbbell_Press/0.jpg' },
  { name: 'Incline Push-Up Reverse Grip', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Incline_Push-Up_Reverse_Grip/0.jpg' },
  { name: 'Iron Cross', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Iron_Cross/0.jpg' },
  { name: 'Jackknife Sit-Up', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Jackknife_Sit-Up/0.jpg' },
  { name: 'Kettlebell Arnold Press', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Kettlebell_Arnold_Press/0.jpg' },
  { name: 'Kettlebell Pistol Squat', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Kettlebell_Pistol_Squat/0.jpg' },
  { name: 'Kettlebell Windmill', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Kettlebell_Windmill/0.jpg' },
  { name: 'Kneeling Cable Crunch With Alternating Oblique Twists', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Kneeling_Cable_Crunch_With_Alternating_Oblique_Twists/0.jpg' },
  { name: 'Kneeling Squat', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Kneeling_Squat/0.jpg' },
  { name: 'Latissimus Dorsi-SMR', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Latissimus_Dorsi-SMR/0.jpg' },
  { name: 'Leverage Chest Press', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Leverage_Chest_Press/0.jpg' },
  { name: 'Leverage Shrug', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Leverage_Shrug/0.jpg' },
  { name: 'Low Cable Crossover', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Low_Cable_Crossover/0.jpg' },
  { name: 'Lying Bent Leg Groin', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Lying_Bent_Leg_Groin/0.jpg' },
  { name: 'Lying Dumbbell Tricep Extension', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Lying_Dumbbell_Tricep_Extension/0.jpg' },
  { name: 'Lying Machine Squat', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Lying_Machine_Squat/0.jpg' },
  { name: 'Machine Bench Press', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Machine_Bench_Press/0.jpg' },
  { name: 'Medicine Ball Scoop Throw', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Medicine_Ball_Scoop_Throw/0.jpg' },
  { name: 'Muscle Snatch', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Muscle_Snatch/0.jpg' },
  { name: 'Neck Press', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Neck_Press/0.jpg' },
  { name: 'One-Arm Flat Bench Dumbbell Flye', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/One-Arm_Flat_Bench_Dumbbell_Flye/0.jpg' },
  { name: 'One-Arm Kettlebell Military Press To The Side', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/One-Arm_Kettlebell_Military_Press_To_The_Side/0.jpg' },
  { name: 'One-Arm Kettlebell Swings', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/One-Arm_Kettlebell_Swings/0.jpg' },
  { name: 'One-Legged Cable Kickback', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/One-Legged_Cable_Kickback/0.jpg' },
  { name: 'One Arm Pronated Dumbbell Triceps Extension', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/One_Arm_Pronated_Dumbbell_Triceps_Extension/0.jpg' },
  { name: 'Otis-Up', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Otis-Up/0.jpg' },
  { name: 'Pallof Press', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Pallof_Press/0.jpg' },
  { name: 'Pelvic Tilt Into Bridge', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Pelvic_Tilt_Into_Bridge/0.jpg' },
  { name: 'Plate Pinch', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Plate_Pinch/0.jpg' },
  { name: 'Power Clean', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Power_Clean/0.jpg' },
  { name: 'Preacher Curl', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Preacher_Curl/0.jpg' },
  { name: 'Push-Up Wide', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Push-Up_Wide/0.jpg' },
  { name: 'Pushups', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Pushups/0.jpg' },
  { name: 'Rack Pull with Bands', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Rack_Pull_with_Bands/0.jpg' },
  { name: 'Reverse Band Deadlift', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Reverse_Band_Deadlift/0.jpg' },
  { name: 'Reverse Flyes', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Reverse_Flyes/0.jpg' },
  { name: 'Reverse Triceps Bench Press', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Reverse_Triceps_Bench_Press/0.jpg' },
  { name: 'Rocky Pull-Ups/Pulldowns', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Rocky_Pull-Ups_Pulldowns/0.jpg' },
  { name: 'Round The World Shoulder Stretch', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Round_The_World_Shoulder_Stretch/0.jpg' },
  { name: 'Scissor Kick', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Scissor_Kick/0.jpg' },
  { name: 'Seated Bent-Over Two-Arm Dumbbell Triceps Extension', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Seated_Bent-Over_Two-Arm_Dumbbell_Triceps_Extension/0.jpg' },
  { name: 'Seated Dumbbell Curl', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Seated_Dumbbell_Curl/0.jpg' },
  { name: 'Seated Front Deltoid', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Seated_Front_Deltoid/0.jpg' },
  { name: 'Seated Leg Tucks', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Seated_Leg_Tucks/0.jpg' },
  { name: 'Seated Side Lateral Raise', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Seated_Side_Lateral_Raise/0.jpg' },
  { name: 'Shoulder Raise', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Shoulder_Raise/0.jpg' },
  { name: 'Side Laterals to Front Raise', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Side_Laterals_to_Front_Raise/0.jpg' },
  { name: 'Side to Side Box Shuffle', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Side_to_Side_Box_Shuffle/0.jpg' },
  { name: 'Single-Leg Lateral Hop', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Single-Leg_Lateral_Hop/0.jpg' },
  { name: 'Sit-Up', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Sit-Up/0.jpg' },
  { name: 'Sled Reverse Flye', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Sled_Reverse_Flye/0.jpg' },
  { name: 'Smith Machine Calf Raise', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Smith_Machine_Calf_Raise/0.jpg' },
  { name: 'Smith Machine One-Arm Upright Row', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Smith_Machine_One-Arm_Upright_Row/0.jpg' },
  { name: 'Smith Single-Leg Split Squat', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Smith_Single-Leg_Split_Squat/0.jpg' },
  { name: 'Speed Band Overhead Triceps', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Speed_Band_Overhead_Triceps/0.jpg' },
  { name: 'Split Clean', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Split_Clean/0.jpg' },
  { name: 'Squat with Bands', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Squat_with_Bands/0.jpg' },
  { name: 'Standing Barbell Press Behind Neck', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Standing_Barbell_Press_Behind_Neck/0.jpg' },
  { name: 'Standing Cable Lift', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Standing_Cable_Lift/0.jpg' },
  { name: 'Standing Dumbbell Straight-Arm Front Delt Raise Above Head', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Standing_Dumbbell_Straight-Arm_Front_Delt_Raise_Above_Head/0.jpg' },
  { name: 'Standing Hip Circles', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Standing_Hip_Circles/0.jpg' },
  { name: 'Standing Low-Pulley One-Arm Triceps Extension', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Standing_Low-Pulley_One-Arm_Triceps_Extension/0.jpg' },
  { name: 'Standing Palm-In One-Arm Dumbbell Press', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Standing_Palm-In_One-Arm_Dumbbell_Press/0.jpg' },
  { name: 'Standing Towel Triceps Extension', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Standing_Towel_Triceps_Extension/0.jpg' },
  { name: 'Stiff Leg Barbell Good Morning', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Stiff_Leg_Barbell_Good_Morning/0.jpg' },
  { name: 'Sumo Deadlift', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Sumo_Deadlift/0.jpg' },
  { name: 'Suspended Fallout', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Suspended_Fallout/0.jpg' },
  { name: 'Tate Press', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Tate_Press/0.jpg' },
  { name: 'Trail Running/Walking', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Trail_Running_Walking/0.jpg' },
  { name: 'Triceps Pushdown - V-Bar Attachment', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Triceps_Pushdown_-_V-Bar_Attachment/0.jpg' },
  { name: 'Two-Arm Kettlebell Row', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Two-Arm_Kettlebell_Row/0.jpg' },
  { name: 'Upward Stretch', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Upward_Stretch/0.jpg' },
  { name: 'Weighted Bench Dip', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Weighted_Bench_Dip/0.jpg' },
  { name: 'Wide-Grip Barbell Bench Press', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Wide-Grip_Barbell_Bench_Press/0.jpg' },
  { name: 'Wide Stance Barbell Squat', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Wide_Stance_Barbell_Squat/0.jpg' },
  { name: 'Wrist Rotations with Straight Bar', imageUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Wrist_Rotations_with_Straight_Bar/0.jpg' },
];

describe('demoCoverage — catalogue coverage far exceeds the ~24 baseline', () => {
  const BASELINE = 24; // hand-curated DEMO_FRAMES entries before auto-derivation.

  test('every fixture exercise (seeded imageUrl) resolves to demo frames', () => {
    const { matched, total } = demoCoverage(CATALOG_FIXTURE);
    // eslint-disable-next-line no-console
    console.log(
      `[exerciseDemos] in-app demo coverage: ${matched}/${total} (` +
        `${((matched / total) * 100).toFixed(1)}%) — baseline was ~${BASELINE} curated entries`,
    );
    expect(total).toBe(125);
    expect(matched).toBe(total); // all seeded exercises derive frames from imageUrl
    expect(matched).toBeGreaterThan(BASELINE);
  });

  test('coverage holds even when imageUrl is dropped (name-only derivation)', () => {
    const namesOnly = CATALOG_FIXTURE.map((e) => ({ name: e.name }));
    const { matched, total } = demoCoverage(namesOnly);
    // eslint-disable-next-line no-console
    console.log(`[exerciseDemos] name-only demo coverage: ${matched}/${total}`);
    // The bundled slug index alone resolves the overwhelming majority by name.
    expect(matched).toBeGreaterThan(BASELINE);
    expect(matched).toBeGreaterThanOrEqual(Math.floor(total * 0.9));
  });

  test('an empty catalogue yields {matched:0,total:0}', () => {
    expect(demoCoverage([])).toEqual({ matched: 0, total: 0 });
  });
});

// ---------------------------------------------------------------------------
// P1 lock-in: the precise FEDB name→slug demo-resolver guarantees the brief
// enumerates. These pin the contract the rest of the exercise-media feature
// builds on, so a regression in the regex / slug index / normalisation is
// caught here rather than as a silently-blank demo in the app.
// ---------------------------------------------------------------------------

describe('resolveDemoFrames — both CDN hosts map to the IDENTICAL canonical frames', () => {
  // The seeder may emit either the jsDelivr mirror or the raw.githubusercontent
  // origin; both must collapse to the same canonical raw [0.jpg, 1.jpg] pair so
  // the in-app player behaves identically regardless of which host was stored.
  test('jsDelivr and raw.githubusercontent inputs for the SAME slug yield the same output', () => {
    const slug = 'Barbell_Deadlift';
    const fromJsDelivr = resolveDemoFrames({ name: 'Unmapped A', imageUrl: `${JSDELIVR_BASE}/${slug}/0.jpg` });
    const fromRaw = resolveDemoFrames({ name: 'Unmapped B', imageUrl: `${RAW_BASE}/${slug}/1.jpg` });

    const expected = [`${RAW_BASE}/${slug}/0.jpg`, `${RAW_BASE}/${slug}/1.jpg`];
    expect(fromJsDelivr).toEqual(expected);
    expect(fromRaw).toEqual(expected);
    // The load-bearing guarantee: the two hosts are interchangeable on input.
    expect(fromJsDelivr).toEqual(fromRaw);
  });

  test('a versioned jsDelivr @ref and the unversioned raw ref both normalise to the raw main base', () => {
    const slug = 'Goblet_Squat';
    const fromPinnedJsDelivr = resolveDemoFrames({
      name: 'Unmapped',
      imageUrl: `https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@v1.2.3/exercises/${slug}/0.jpg`,
    });
    const fromRaw = resolveDemoFrames({ name: 'Unmapped', imageUrl: `${RAW_BASE}/${slug}/0.jpg` });
    expect(fromPinnedJsDelivr).toEqual([`${RAW_BASE}/${slug}/0.jpg`, `${RAW_BASE}/${slug}/1.jpg`]);
    expect(fromPinnedJsDelivr).toEqual(fromRaw);
  });
});

describe('resolveDemoFrames — non-FEDB image URLs yield null (still-image fallback)', () => {
  // Anything whose host is not one of the two yuhonas/free-exercise-db CDNs must
  // NOT be treated as a derivable demo frame — the caller falls back to the
  // static image instead of fabricating a /0.jpg,/1.jpg pair off a foreign host.
  test.each([
    ['a look-alike host with the FEDB path shape', 'https://evil.example/exercises/Barbell_Squat/0.jpg'],
    ['a different GitHub repo on raw.githubusercontent', 'https://raw.githubusercontent.com/someone/other-db/main/exercises/Barbell_Squat/0.jpg'],
    ['a different jsDelivr gh repo', 'https://cdn.jsdelivr.net/gh/someone/other-db@main/exercises/Barbell_Squat/0.jpg'],
    ['an unrelated CDN image', 'https://example.com/some/other/image.jpg'],
  ])('non-FEDB imageUrl (%s) with an unknown name resolves to null', (_label, imageUrl) => {
    expect(resolveDemoFrames({ name: 'Totally Unknown Movement 9000', imageUrl })).toBeNull();
  });
});

describe('resolveDemoFrames — representative names resolve with EXACT slug casing', () => {
  // A curated app-name → hand-picked FEDB slug (DEMO_FRAMES). These deliberately
  // differ from the generic name index, so they prove the curated map wins and
  // its exact directory casing is preserved.
  const CURATED_CASES: ReadonlyArray<readonly [string, string]> = [
    ['Barbell Back Squat', 'Barbell_Full_Squat'],
    ['Cable Lat Pulldown', 'Wide-Grip_Lat_Pulldown'],
    ['Tricep Pushdown', 'Triceps_Pushdown'],
    ['Pike Push-Up', 'Handstand_Push-Ups'],
  ];

  // Names resolved purely through the bundled FEDB_SLUGS index (no imageUrl, not
  // in the curated map). Casing/hyphenation here is exactly what free-exercise-db
  // ships, so an off-by-one in normalisation would surface as a 404-prone URL.
  const INDEXED_CASES: ReadonlyArray<readonly [string, string]> = [
    ['Goblet Squat', 'Goblet_Squat'],
    ['EZ-Bar Curl', 'EZ-Bar_Curl'],
    ['Calves-SMR', 'Calves-SMR'],
    ['Otis-Up', 'Otis-Up'],
    ['One-Arm Kettlebell Swings', 'One-Arm_Kettlebell_Swings'],
    ['Triceps Pushdown - V-Bar Attachment', 'Triceps_Pushdown_-_V-Bar_Attachment'],
  ];

  test.each([...CURATED_CASES, ...INDEXED_CASES])(
    '%s resolves to /exercises/%s/{0,1}.jpg with exact casing',
    (name, slug) => {
      const frames = resolveDemoFrames({ name });
      expect(frames).toEqual([`${RAW_BASE}/${slug}/0.jpg`, `${RAW_BASE}/${slug}/1.jpg`]);
      // Assert the exact slug segment & extensions explicitly (casing-sensitive),
      // independent of the RAW_BASE prefix.
      expect(frames![0]).toContain(`/exercises/${slug}/0.jpg`);
      expect(frames![1]).toContain(`/exercises/${slug}/1.jpg`);
    },
  );
});

describe('resolveDemoFrames — normalizeExerciseName edge cases (via the name index)', () => {
  // Punctuation the normaliser must fold away before hitting FEDB_SLUGS: an
  // apostrophe, a slash, and the apostrophe+digit combination.
  test.each([
    ["Farmer's Walk", 'Farmers_Walk'], // apostrophe collapsed
    ['3/4 Sit-Up', '3_4_Sit-Up'], // slash → separator, hyphen preserved in slug
    ["Landmine 180's", 'Landmine_180s'], // apostrophe adjacent to digits
  ])('%s normalises to slug %s', (name, slug) => {
    expect(resolveDemoFrames({ name })).toEqual([`${RAW_BASE}/${slug}/0.jpg`, `${RAW_BASE}/${slug}/1.jpg`]);
  });
});

describe('resolveDemoFrames — every emitted frame URL is HTTPS', () => {
  // ATS-safety: no derivation path (curated, imageUrl-derived on either host, or
  // name-indexed) may ever emit a non-HTTPS URL.
  const SAMPLES: ReadonlyArray<{ name?: string; imageUrl?: string }> = [
    { name: 'Barbell Back Squat' }, // curated
    { name: 'Goblet Squat' }, // name index
    { name: "Farmer's Walk" }, // normalised name index
    { name: 'Unmapped', imageUrl: `${JSDELIVR_BASE}/Barbell_Squat/0.jpg` }, // jsDelivr-derived
    { name: 'Unmapped', imageUrl: `${RAW_BASE}/Front_Box_Jump/1.jpg` }, // raw-derived
    { name: 'Unmapped', imageUrl: 'http://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Plank/0.jpg' }, // http input upgraded
  ];

  test('all derivation paths emit only https:// frame URLs', () => {
    for (const sample of SAMPLES) {
      const frames = resolveDemoFrames(sample);
      expect(frames).not.toBeNull();
      for (const url of frames!) {
        expect(url.startsWith('https://')).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// fedbSlugFromImageUrl — the slug extractor the whole derivation hinges on.
// Pins that the regex accepts BOTH CDN hosts (jsDelivr with/without an @ref and
// raw.githubusercontent) and rejects anything else, so a foreign URL can never
// be mistaken for a free-exercise-db frame source.
// ---------------------------------------------------------------------------
describe('fedbSlugFromImageUrl — slug-directory extraction', () => {
  test('jsDelivr WITH @ref (pinned) → slug dir', () => {
    expect(
      fedbSlugFromImageUrl(`${JSDELIVR_BASE}/Barbell_Deadlift/0.jpg`), // @main is the ref
    ).toBe('Barbell_Deadlift');
    expect(
      fedbSlugFromImageUrl(
        'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@v1.2.3/exercises/Goblet_Squat/1.jpg',
      ),
    ).toBe('Goblet_Squat');
  });

  test('jsDelivr WITHOUT @ref (bare repo) → slug dir', () => {
    expect(
      fedbSlugFromImageUrl(
        'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db/exercises/Romanian_Deadlift/0.jpg',
      ),
    ).toBe('Romanian_Deadlift');
  });

  test('raw.githubusercontent → slug dir', () => {
    expect(fedbSlugFromImageUrl(`${RAW_BASE}/Plank/1.jpg`)).toBe('Plank');
  });

  test('a bare slug dir with no trailing /<n>.jpg still extracts', () => {
    expect(fedbSlugFromImageUrl(`${RAW_BASE}/Face_Pull`)).toBe('Face_Pull');
  });

  test.each([
    ['a youtube watch URL', 'https://www.youtube.com/watch?v=op9kVnSso6Q'],
    ['an unrelated CDN image', 'https://example.com/some/other/image.jpg'],
    ['a look-alike host with the FEDB path shape', 'https://evil.example/exercises/Barbell_Squat/0.jpg'],
    ['a different GitHub repo on raw.githubusercontent', 'https://raw.githubusercontent.com/someone/other-db/main/exercises/Barbell_Squat/0.jpg'],
    ['a different jsDelivr gh repo', 'https://cdn.jsdelivr.net/gh/someone/other-db@main/exercises/Barbell_Squat/0.jpg'],
    ['an empty string', ''],
  ])('returns null for a non-FEDB URL (%s)', (_label, url) => {
    expect(fedbSlugFromImageUrl(url)).toBeNull();
  });

  test('returns null for null / undefined', () => {
    expect(fedbSlugFromImageUrl(null)).toBeNull();
    expect(fedbSlugFromImageUrl(undefined)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// resolveDemoFrames — the demoGifUrl > imageUrl > curated > name precedence
// ladder, asserted one rung at a time so a regression pinpoints which source
// stopped winning. (Companion to the precedence block at the top of the file.)
// ---------------------------------------------------------------------------
describe('resolveDemoFrames — precedence ladder, one rung each', () => {
  // Same exercise resolvable at EVERY rung, so each case isolates exactly one.
  const NAME = 'Barbell Deadlift'; // curated DEMO_FRAMES + FEDB name index entry
  const CURATED = [`${RAW_BASE}/Barbell_Deadlift/0.jpg`, `${RAW_BASE}/Barbell_Deadlift/1.jpg`];

  test('1) demoGifUrl wins over imageUrl + curated + name', () => {
    expect(
      resolveDemoFrames({
        name: NAME,
        demoGifUrl: 'https://cdn.example.com/explicit.gif',
        imageUrl: `${JSDELIVR_BASE}/Goblet_Squat/0.jpg`,
      }),
    ).toEqual(['https://cdn.example.com/explicit.gif']);
  });

  test('2) imageUrl wins over curated + name when no demoGifUrl', () => {
    // imageUrl points at a DIFFERENT slug than the curated/name slug for NAME,
    // proving the derived frames come from imageUrl, not the curated map.
    expect(
      resolveDemoFrames({ name: NAME, imageUrl: `${JSDELIVR_BASE}/Goblet_Squat/0.jpg` }),
    ).toEqual([`${RAW_BASE}/Goblet_Squat/0.jpg`, `${RAW_BASE}/Goblet_Squat/1.jpg`]);
  });

  test('3) curated map wins over the name index when no demoGifUrl/imageUrl', () => {
    // "Barbell Back Squat" → curated slug Barbell_Full_Squat, which the generic
    // name index does NOT hold under that name — so a curated hit is provable.
    expect(resolveDemoFrames({ name: 'Barbell Back Squat' })).toEqual([
      `${RAW_BASE}/Barbell_Full_Squat/0.jpg`,
      `${RAW_BASE}/Barbell_Full_Squat/1.jpg`,
    ]);
  });

  test('4) name index is the last resort (no demoGifUrl/imageUrl/curated)', () => {
    // "Goblet Squat" is NOT in the curated DEMO_FRAMES map, so resolution can
    // only come from the bundled FEDB name index.
    expect(resolveDemoFrames({ name: 'Goblet Squat' })).toEqual([
      `${RAW_BASE}/Goblet_Squat/0.jpg`,
      `${RAW_BASE}/Goblet_Squat/1.jpg`,
    ]);
  });

  test('emits the canonical raw.githubusercontent 0.jpg / 1.jpg pair', () => {
    const frames = resolveDemoFrames({ name: NAME });
    expect(frames).toEqual(CURATED);
    expect(frames![0]).toBe(`${RAW_BASE}/Barbell_Deadlift/0.jpg`);
    expect(frames![1]).toBe(`${RAW_BASE}/Barbell_Deadlift/1.jpg`);
  });
});

describe('resolveDemoFrames — real catalogue names resolve to a frame pair', () => {
  test.each([
    ['Barbell Deadlift', 'Barbell_Deadlift'],
    ['Plank', 'Plank'],
    ['Romanian Deadlift', 'Romanian_Deadlift'],
    ['Goblet Squat', 'Goblet_Squat'],
  ])('%s → non-null [0.jpg, 1.jpg] pair', (name, slug) => {
    const frames = resolveDemoFrames({ name });
    expect(frames).not.toBeNull();
    expect(frames).toHaveLength(2);
    expect(frames).toEqual([`${RAW_BASE}/${slug}/0.jpg`, `${RAW_BASE}/${slug}/1.jpg`]);
  });
});

// ---------------------------------------------------------------------------
// DEMO_FALLBACK (curated YouTube deep-links) — shape + cross-package sync guard.
//
// Shape: every value must be a YouTube *watch* URL (a specific video), never a
// search/results page, or the "Watch demo" deep-link opens the wrong thing.
//
// Sync: the mobile DEMO_FALLBACK and the backend DEMO_URLS (the source the
// exercise-service serves from) must stay key-for-key identical. We assert this
// by reading the backend file's source text at test time (a plain fs read — no
// cross-package module import, so no bundler/tsc coupling between the packages)
// and parsing out its curated keys. If the two drift, this fails loudly.
// ---------------------------------------------------------------------------
const WATCH_URL_RE = /^https:\/\/www\.youtube\.com\/watch\?v=[\w-]{6,}$/;

/**
 * Parse the string keys of the backend `DEMO_URLS` object literal straight from
 * its source file, without importing across package boundaries. Scoped to the
 * `DEMO_URLS` block so the derived `DEMO_URLS_LC` map / comments can't leak in.
 */
function backendDemoUrlsKeys(): string[] {
  const file = path.resolve(__dirname, '../../../../services/exercise-service/prisma/demo-urls.ts');
  const src = fs.readFileSync(file, 'utf8');
  const open = src.indexOf('export const DEMO_URLS');
  expect(open).toBeGreaterThanOrEqual(0); // backend map must still exist & be named
  const braceStart = src.indexOf('{', open);
  const blockEnd = src.indexOf('\n};', braceStart);
  expect(blockEnd).toBeGreaterThan(braceStart);
  const body = src.slice(braceStart, blockEnd);
  // Match `'<key>':` / `"<key>":` entries (keys may contain spaces, hyphens, /).
  const keys: string[] = [];
  const entryRe = /(['"])((?:\\.|(?!\1).)*?)\1\s*:/g;
  let m: RegExpExecArray | null;
  while ((m = entryRe.exec(body)) !== null) {
    if (m[2] !== undefined) keys.push(m[2]);
  }
  return keys;
}

describe('DEMO_FALLBACK — every value is a YouTube watch URL', () => {
  test('no entry is a search/results page or malformed', () => {
    const entries = Object.entries(DEMO_FALLBACK);
    expect(entries.length).toBeGreaterThan(0);
    for (const [name, url] of entries) {
      expect(`${name} → ${url}`).toMatch(
        new RegExp(`^.+ → https://www\\.youtube\\.com/watch\\?v=[\\w-]{6,}$`),
      );
      expect(url).toMatch(WATCH_URL_RE);
      expect(url).not.toContain('/results'); // never a search page
      expect(url).not.toContain('search_query');
    }
  });

  test('the widened tranche is present and also resolves to in-app frames', () => {
    // These names were added to BOTH maps and exist in the FEDB slug index, so
    // each one must yield a watch URL AND a non-null demo-frame pair.
    const WIDENED = ['Hammer Curls', 'Hanging Leg Raise', 'Face Pull', 'Goblet Squat', 'Barbell Hip Thrust'];
    for (const name of WIDENED) {
      expect(DEMO_FALLBACK[name]).toMatch(WATCH_URL_RE);
      expect(resolveDemoFrames({ name })).not.toBeNull();
    }
  });
});

describe('DEMO_FALLBACK ↔ backend DEMO_URLS — key-for-key identical', () => {
  test('the two curated maps share the exact same key set', () => {
    const mobileKeys = Object.keys(DEMO_FALLBACK).sort();
    const backendKeys = backendDemoUrlsKeys().sort();

    // Guard the parse itself: comparable size, both non-trivial.
    expect(backendKeys.length).toBeGreaterThan(20);
    expect(mobileKeys.length).toBe(backendKeys.length);

    // Surface any drift explicitly (which side is missing which key).
    const onlyInMobile = mobileKeys.filter((k) => !backendKeys.includes(k));
    const onlyInBackend = backendKeys.filter((k) => !mobileKeys.includes(k));
    expect({ onlyInMobile, onlyInBackend }).toEqual({ onlyInMobile: [], onlyInBackend: [] });
    expect(mobileKeys).toEqual(backendKeys);
  });
});
