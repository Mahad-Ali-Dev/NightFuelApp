// Capture the real Zeitra app screens (app_images/backups/*-preview.html) into
// clean phone-screen PNGs for the landing's device mockups. Uses Edge headless.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const __dir = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dir, '..', '..', 'app_images', 'backups');
const OUT = join(__dir, 'public', 'images', 'screens');
mkdirSync(OUT, { recursive: true });

const EDGE = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(existsSync);
if (!EDGE) { console.error('Edge not found'); process.exit(1); }

// Feature-showcase screens.
const SCREENS = (process.env.SCREENS && process.env.SCREENS.split(',')) || [
  'home', 'meals', 'log-meal', 'meal-result', 'meal-generator', 'active-workout',
  'cycle-calendar', 'coach-dashboard', 'analytics', 'challenges', 'community',
  'plan-result', 'devices', 'paywall',
];

// Strip the preview's own bezel so we get the clean screen; keep the app bg.
const OVERRIDE = `<style id="_ovr">
  html,body{padding:0!important;margin:0!important;min-height:0!important;background:#05060a!important;display:block!important}
  .frame{border:0!important;border-radius:0!important;box-shadow:none!important;width:340px!important;height:760px!important;margin:0!important}
  .scroll{height:760px!important;overflow:hidden!important}
</style></head>`;

const W = 340, H = 760;
for (const name of SCREENS) {
  const html = join(SRC, `${name}-preview.html`);
  if (!existsSync(html)) { console.error(`skip (missing): ${name}`); continue; }
  try {
    let src = readFileSync(html, 'utf8');
    src = src.includes('</head>') ? src.replace('</head>', OVERRIDE) : OVERRIDE + src;
    const tmp = join(tmpdir(), `zscreen_${name}.html`);
    writeFileSync(tmp, src);
    const out = join(OUT, `${name}.png`);
    const prof = join(tmpdir(), `zsp_${name}`);
    execFileSync(EDGE, [
      '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
      '--virtual-time-budget=7000', '--run-all-compositor-stages-before-draw',
      '--force-device-scale-factor=3', `--window-size=${W},${H}`,
      `--user-data-dir=${prof}`, `--screenshot=${out}`, `file:///${tmp.replace(/\\/g, '/')}`,
    ], { stdio: 'ignore', timeout: 60000 });
    console.log(`OK  screens/${name}.png`);
  } catch (e) {
    console.error(`FAIL ${name}: ${String(e.message).slice(0, 120)}`);
  }
}
console.log('done');
