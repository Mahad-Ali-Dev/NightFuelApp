/**
 * Seed the `library_exercises` catalog from the free, open-source free-exercise-db
 * (https://github.com/yuhonas/free-exercise-db — 870+ exercises, MIT, images on a CDN).
 *
 * The /v1/exercises/library handler reads this table first and only falls back to the
 * live wger proxy when it is empty, so seeding here gives the app a rich, reliable,
 * image-backed exercise library with zero runtime dependency.
 *
 * Run INSIDE the exercise-service container (it has the generated Prisma client + the
 * EXERCISE_DATABASE_URL datasource env):
 *   docker cp dist.json   docker-exercise-service-1:/tmp/ex.json
 *   docker cp seed.js     docker-exercise-service-1:/tmp/seed-library.js
 *   docker exec docker-exercise-service-1 node /tmp/seed-library.js /tmp/ex.json
 *
 * Idempotent: createMany with skipDuplicates (name is unique).
 */
const fs = require('fs');

let PrismaClient;
try { ({ PrismaClient } = require('/app/services/exercise-service/dist/generated/prisma')); }
catch (_) {
  try { ({ PrismaClient } = require('../src/generated/prisma')); }
  catch (__) { ({ PrismaClient } = require('@prisma/client')); }
}

const prisma = new PrismaClient();
const CDN = 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/';

// free-exercise-db primary muscle -> our wger-style bodyPart key
const MUSCLE_TO_BODYPART = {
  abdominals: 'waist', abductors: 'upper legs', adductors: 'upper legs',
  biceps: 'upper arms', calves: 'lower legs', chest: 'chest',
  forearms: 'lower arms', glutes: 'upper legs', hamstrings: 'upper legs',
  lats: 'back', 'lower back': 'back', 'middle back': 'back', neck: 'neck',
  quadriceps: 'upper legs', shoulders: 'shoulders', traps: 'back', triceps: 'upper arms',
};
// bodyPart -> human muscle-group label used by the app's filter chips
const BODYPART_LABEL = {
  waist: 'Core', 'upper legs': 'Legs', 'upper arms': 'Arms', 'lower legs': 'Calves',
  'lower arms': 'Forearms', chest: 'Chest', back: 'Back', neck: 'Neck',
  shoulders: 'Shoulders', cardio: 'Cardio',
};
const HOME_EQUIP = ['body weight', 'body only', 'none', 'bands', 'exercise ball', 'medicine ball', 'foam roll'];
const CARDIO_NAME = /\b(run|sprint|jog|cycl|row|jump rope|burpee|elliptical|stair|skip)\b/i;

function mapEquip(e) {
  const n = (e || '').toLowerCase().trim();
  if (!n || n === 'body only' || n === 'none') return 'body weight';
  if (n === 'e-z curl bar') return 'ez barbell';
  if (n === 'machine') return 'leverage machine';
  if (n === 'bands') return 'band';
  if (n === 'kettlebells') return 'kettlebell';
  if (n === 'foam roll') return 'foam roller';
  return n; // barbell, dumbbell, cable, kettlebell, exercise ball, medicine ball, etc.
}
function deriveCategory(bodyPart, equipment, fcat, name) {
  if (fcat === 'cardio' || bodyPart === 'cardio' || CARDIO_NAME.test(name)) return 'cardio';
  if (HOME_EQUIP.includes(equipment)) return 'home';
  return 'gym';
}

(async () => {
  const file = process.argv[2] || '/tmp/ex.json';
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));

  const seen = new Set();
  const rows = [];
  for (const ex of data) {
    if (!ex.name || seen.has(ex.name)) continue;
    seen.add(ex.name);
    const primary = (ex.primaryMuscles && ex.primaryMuscles[0] || '').toLowerCase();
    let bodyPart = MUSCLE_TO_BODYPART[primary] || (ex.category === 'cardio' ? 'cardio' : 'waist');
    const equipment = mapEquip(ex.equipment);
    const category = deriveCategory(bodyPart, equipment, ex.category, ex.name);
    if (category === 'cardio') bodyPart = 'cardio';
    const muscleGroup = BODYPART_LABEL[bodyPart] || (primary ? primary[0].toUpperCase() + primary.slice(1) : 'Full Body');
    rows.push({
      name: ex.name,
      muscleGroup,
      equipment,
      instructions: Array.isArray(ex.instructions) ? ex.instructions.join('\n') : (ex.instructions || null),
      imageUrl: (ex.images && ex.images[0]) ? CDN + ex.images[0] : null,
      difficulty: ex.level || 'intermediate',
      bodyPart,
      category,
    });
  }

  const res = await prisma.libraryExercise.createMany({ data: rows, skipDuplicates: true });
  const total = await prisma.libraryExercise.count();
  const withImg = await prisma.libraryExercise.count({ where: { imageUrl: { not: null } } });
  const byCat = {};
  for (const c of ['gym', 'home', 'cardio', 'kegel']) {
    byCat[c] = await prisma.libraryExercise.count({ where: { category: c } });
  }
  console.log(JSON.stringify({ inserted: res.count, total, withImage: withImg, byCategory: byCat }, null, 2));
  await prisma.$disconnect();
})().catch((e) => { console.error('SEED FAILED:', e.message); process.exit(1); });
