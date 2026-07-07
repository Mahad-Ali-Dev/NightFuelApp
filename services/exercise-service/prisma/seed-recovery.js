/**
 * Seed the Recovery / Kegel category (app `category: 'kegel'`, labelled "Recovery ·
 * Pelvic Floor · Stability"). The free-exercise-db seed never derives a `kegel`
 * category, so this bucket was empty in the app. This script:
 *   1) Remaps existing real stretch / foam-roll exercises (which were filed under
 *      home/gym) into the Recovery bucket — they keep their CDN images.
 *   2) Inserts a curated set of real pelvic-floor + mobility/recovery exercises.
 *
 * Run INSIDE the exercise-service container (has the generated Prisma client +
 * EXERCISE_DATABASE_URL):
 *   docker cp seed-recovery.js <exercise-service-container>:/tmp/seed-recovery.js
 *   docker exec <exercise-service-container> node /tmp/seed-recovery.js
 *
 * Idempotent: createMany with skipDuplicates (name is unique); remap is a no-op
 * once rows already sit in the kegel category.
 */
let PrismaClient;
try { ({ PrismaClient } = require('/app/services/exercise-service/dist/generated/prisma')); }
catch (_) {
  try { ({ PrismaClient } = require('../src/generated/prisma')); }
  catch (__) { ({ PrismaClient } = require('@prisma/client')); }
}

const prisma = new PrismaClient();

// Curated, real recovery + pelvic-floor exercises. equipment defaults to body weight.
const RECOVERY = [
  { name: 'Kegel Hold', muscleGroup: 'Core', bodyPart: 'waist',
    instructions: "Sit or lie down with your glutes and abs relaxed.\nTighten the muscles you would use to stop the flow of urine.\nHold for 5 seconds while breathing normally, then fully relax for 5 seconds.\nRepeat for 10 reps, gradually building to 10-second holds." },
  { name: 'Quick-Flick Kegels', muscleGroup: 'Core', bodyPart: 'waist',
    instructions: "Contract your pelvic floor muscles as quickly and firmly as you can.\nRelease immediately and completely.\nPerform 10 rapid contractions in a row.\nRest, then repeat for 3 sets." },
  { name: 'Pelvic Tilt', muscleGroup: 'Core', bodyPart: 'waist',
    instructions: "Lie on your back with knees bent and feet flat on the floor.\nGently flatten your lower back into the floor by tilting your pelvis upward.\nHold for 5 seconds while breathing normally.\nRelease and repeat for 12 reps." },
  { name: 'Glute Bridge', muscleGroup: 'Legs', bodyPart: 'upper legs',
    instructions: "Lie on your back with knees bent and feet hip-width apart.\nDrive through your heels and lift your hips until your body forms a straight line.\nSqueeze your glutes and pelvic floor at the top.\nLower slowly and repeat for 15 reps." },
  { name: 'Bird Dog', muscleGroup: 'Core', bodyPart: 'waist',
    instructions: "Start on all fours with a neutral, flat spine.\nExtend your right arm and left leg until they are parallel to the floor.\nHold briefly, keeping your hips level and core braced.\nReturn and switch sides; perform 10 reps per side." },
  { name: 'Dead Bug', muscleGroup: 'Core', bodyPart: 'waist',
    instructions: "Lie on your back with arms reaching toward the ceiling and knees bent at 90 degrees.\nSlowly lower your right arm and left leg toward the floor.\nKeep your lower back pressed down throughout.\nReturn and alternate for 10 reps per side." },
  { name: 'Cat-Cow Flow', muscleGroup: 'Back', bodyPart: 'back',
    instructions: "Begin on all fours with hands under shoulders and knees under hips.\nDrop your belly and lift your gaze for Cow.\nRound your spine toward the ceiling and tuck your chin for Cat.\nFlow slowly between the two for 10 breaths." },
  { name: 'Diaphragmatic Breathing', muscleGroup: 'Core', bodyPart: 'waist',
    instructions: "Lie down with one hand on your chest and one on your belly.\nBreathe in slowly through your nose so only your belly rises.\nExhale fully, gently drawing your pelvic floor and lower abs in.\nRepeat for 10 slow, controlled breaths." },
  { name: 'Clamshell', muscleGroup: 'Legs', bodyPart: 'upper legs',
    instructions: "Lie on your side with knees bent and feet, hips, and shoulders stacked.\nKeeping your feet together, lift your top knee like a clam opening.\nPause at the top, then lower under control.\nPerform 15 reps per side." },
  { name: 'Side-Lying Leg Lift', muscleGroup: 'Legs', bodyPart: 'upper legs',
    instructions: "Lie on your side with legs straight and stacked.\nLift your top leg toward the ceiling without rolling backward.\nLower slowly under control.\nComplete 15 reps per side." },
  { name: 'Kneeling Hip Flexor Stretch', muscleGroup: 'Legs', bodyPart: 'upper legs',
    instructions: "Kneel on one knee with the other foot planted in front.\nTuck your pelvis under and shift your weight gently forward.\nFeel the stretch in the front of the kneeling hip.\nHold for 30 seconds per side." },
  { name: "Child's Pose", muscleGroup: 'Back', bodyPart: 'back',
    instructions: "Kneel and sit back onto your heels.\nFold forward, reaching your arms out in front of you.\nRest your forehead on the floor and breathe into your back.\nHold for 30 to 60 seconds." },
  { name: 'Supine Figure-4 Stretch', muscleGroup: 'Legs', bodyPart: 'upper legs',
    instructions: "Lie on your back and cross your right ankle over your left thigh.\nReach through and pull the left thigh toward your chest.\nFeel the stretch in your right glute and hip.\nHold for 30 seconds per side." },
  { name: 'Standing Forward Fold', muscleGroup: 'Legs', bodyPart: 'upper legs',
    instructions: "Stand tall, then hinge at the hips and fold forward.\nLet your head and arms hang heavy toward the floor.\nSoften your knees to release the hamstrings and lower back.\nHold for 30 seconds." },
  { name: 'Quadruped Thoracic Rotation', muscleGroup: 'Back', bodyPart: 'back',
    instructions: "Start on all fours and place one hand behind your head.\nRotate that elbow up toward the ceiling, following it with your eyes.\nReturn under control to the start.\nPerform 10 reps per side." },
  { name: '90/90 Hip Switch', muscleGroup: 'Legs', bodyPart: 'upper legs',
    instructions: "Sit with both knees bent at 90 degrees, one shin in front and one out to the side.\nRotate your hips to switch both knees to the other side.\nMove slowly and keep your chest tall.\nAlternate for 10 reps per side." },
  { name: 'Standing Calf Stretch', muscleGroup: 'Calves', bodyPart: 'lower legs',
    instructions: "Step one foot back and press the heel firmly into the floor.\nKeep the back leg straight and lean into a wall.\nFeel the stretch through your calf.\nHold for 30 seconds per side." },
  { name: 'Foam Roll Quads', muscleGroup: 'Legs', bodyPart: 'upper legs', equipment: 'foam roller',
    instructions: "Lie face down with a foam roller under your thighs.\nSupport your upper body on your forearms.\nRoll slowly from hip to knee, pausing on tender spots.\nContinue for 30 to 60 seconds per leg." },
];

(async () => {
  // 1) Remap existing real stretches / foam-rolling into the Recovery (kegel) bucket.
  const remap = await prisma.libraryExercise.updateMany({
    where: {
      category: { in: ['home', 'gym'] },
      OR: [
        { name: { contains: 'stretch', mode: 'insensitive' } },
        { name: { contains: 'foam roll', mode: 'insensitive' } },
        { name: { contains: 'mobility', mode: 'insensitive' } },
      ],
    },
    data: { category: 'kegel' },
  });

  // 2) Insert the curated pelvic-floor + recovery exercises.
  const rows = RECOVERY.map((r) => ({
    name: r.name,
    muscleGroup: r.muscleGroup,
    equipment: r.equipment || 'body weight',
    instructions: r.instructions,
    imageUrl: r.imageUrl || null,
    difficulty: r.difficulty || 'beginner',
    bodyPart: r.bodyPart,
    category: 'kegel',
  }));
  const ins = await prisma.libraryExercise.createMany({ data: rows, skipDuplicates: true });

  const byCat = {};
  for (const c of ['gym', 'home', 'cardio', 'kegel']) {
    byCat[c] = await prisma.libraryExercise.count({ where: { category: c } });
  }
  const total = await prisma.libraryExercise.count();
  console.log(JSON.stringify({ remapped: remap.count, inserted: ins.count, total, byCategory: byCat }, null, 2));
  await prisma.$disconnect();
})().catch((e) => { console.error('SEED FAILED:', e.message); process.exit(1); });
