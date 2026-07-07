// Crop + convert the keeper screenshots into public/images/app/<feature>.webp.
// Crop: top 60px (status bar) + bottom 100px (system nav pill), keep 720w, webp q80.
import { readdirSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, '..', '..');
const sharp = require(join(ROOT, 'node_modules', 'sharp'));

const SRC = join(ROOT, 'Screenshots');
const OUT = join(__dir, 'public', 'images', 'app');
mkdirSync(OUT, { recursive: true });

const files = readdirSync(SRC).filter((f) => f.includes('_Zeitra') && f.endsWith('.png')).sort();

// index (from the contact sheets) -> feature name
const KEEP = {
  1: 'home',
  4: 'rhythm',
  5: 'train',
  7: 'workout-styles',
  8: 'muscle-groups',
  9: 'quick-add',
  10: 'log-meal',
  11: 'scan-plate',
  12: 'barcode',
  13: 'plate-macros',
  14: 'macros',
  16: 'encyclopedia',
  19: 'recipes',
  20: 'recipe-detail',
  23: 'crew',
  24: 'feed',
  25: 'chat',
  26: 'leaderboard',
  29: 'ai-planner',
  32: 'insights',
  33: 'circadian',
  36: 'achievements',
  38: 'devices',
  39: 'themes',
  43: 'ria-chat',
  44: 'calculator',
  49: 'cycle',
  50: 'sleep-window',
};

for (const [idx, name] of Object.entries(KEEP)) {
  const file = files[Number(idx)];
  if (!file) { console.error(`missing index ${idx}`); continue; }
  const img = sharp(join(SRC, file));
  const meta = await img.metadata();
  const top = 60, bottom = 100;
  await img
    .extract({ left: 0, top, width: meta.width, height: meta.height - top - bottom })
    .webp({ quality: 80 })
    .toFile(join(OUT, `${name}.webp`));
  console.log(`OK ${name}.webp  <- #${idx} ${file}`);
}
console.log('done');
