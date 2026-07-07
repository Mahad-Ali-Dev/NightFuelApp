// One-off: generate premium Zeitra landing imagery via Replicate Flux 1.1 Pro.
// Reads REPLICATE_API_TOKEN from ../../.env.replicate. Saves to public/images/.
import { readFileSync, mkdirSync, createWriteStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dir, 'public', 'images');
mkdirSync(OUT, { recursive: true });

// Load token from the repo-root .env.replicate (KEY=VALUE lines).
const envPath = join(__dir, '..', '..', '.env.replicate');
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const TOKEN = env.REPLICATE_API_TOKEN || env.REPLICATE_TOKEN;
if (!TOKEN) { console.error('No REPLICATE_API_TOKEN in .env.replicate'); process.exit(1); }

const BRAND = 'dark moody cinematic, subtle lime-green (#a8cc3c) accent light, teal and charcoal tones, premium health-tech brand photography, ultra detailed, high-end';

const IMAGES = [
  { name: 'hero', ar: '16:9', prompt: `Cinematic wide editorial shot, a female night-shift nurse in scrubs walking through a dimly lit hospital corridor at 3am, glancing at her phone, atmospheric ${BRAND}, shallow depth of field, film grain` },
  { name: 'lifestyle-nurse', ar: '3:4', prompt: `Portrait of a confident female night-shift nurse in scrubs holding a smartphone and a healthy meal-prep container, ${BRAND}, rim light, authentic` },
  { name: 'lifestyle-athlete', ar: '3:4', prompt: `Portrait of a fit woman athlete checking her fitness smartwatch after a workout, sweat, determined, low-key lighting, ${BRAND}` },
  { name: 'food', ar: '1:1', prompt: `Overhead dramatic food photography of a vibrant healthy high-protein meal bowl on a dark slate surface, directional moody lighting, ${BRAND}, michelin plating, appetizing` },
  { name: 'wearable', ar: '1:1', prompt: `Macro product shot of a sleek fitness smartwatch on a dark surface, heart-rate glow on screen, lime-green UI accent, dramatic studio lighting, ${BRAND}` },
  { name: 'abstract-clock', ar: '16:9', prompt: `Abstract 3D render of a circadian-rhythm clock, concentric glowing rings and a 24-hour timeline, ${BRAND}, minimal elegant tech hero graphic` },
];

async function gen({ name, ar, prompt }) {
  const res = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-1.1-pro/predictions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', Prefer: 'wait' },
    body: JSON.stringify({ input: { prompt, aspect_ratio: ar, output_format: 'webp', output_quality: 90, safety_tolerance: 2, prompt_upsampling: true } }),
  });
  const data = await res.json();
  if (data.status !== 'succeeded' || !data.output) throw new Error(`${name}: ${data.status} ${JSON.stringify(data.error || data.detail || '')}`);
  const url = Array.isArray(data.output) ? data.output[0] : data.output;
  const img = await fetch(url);
  const file = join(OUT, `${name}.webp`);
  await new Promise((resolve, reject) => {
    const ws = createWriteStream(file);
    Readable.fromWeb(img.body).pipe(ws).on('finish', resolve).on('error', reject);
  });
  console.log(`OK  ${name}.webp`);
}

for (const img of IMAGES) {
  try { await gen(img); } catch (e) { console.error(`FAIL ${img.name}: ${e.message}`); }
}
console.log('done');
