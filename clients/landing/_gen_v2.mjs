// v2 imagery for the LIGHT-theme Zeitra landing: bright, editorial, lime-accented.
// App-UI mockups (9:16) for the device frames + lifestyle shots for parallax/grid.
import { readFileSync, mkdirSync, createWriteStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dir, 'public', 'images', 'gen');
mkdirSync(OUT, { recursive: true });

const env = Object.fromEntries(
  readFileSync(join(__dir, '..', '..', '.env.replicate'), 'utf8')
    .split(/\r?\n/).filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const TOKEN = env.REPLICATE_API_TOKEN || env.REPLICATE_TOKEN;
if (!TOKEN) { console.error('No token'); process.exit(1); }

const LIGHT = 'bright airy editorial photography, soft natural daylight, clean minimal, subtle lime-green (#a8cc3c) accent, premium wellness brand, crisp, high detail';

const IMAGES = [
  // App-UI mockups for the iOS / Android device frames (phone aspect).
  { name: 'app-home', ar: '9:16', prompt: `A clean minimal mobile fitness &amp; nutrition app dashboard UI on a modern smartphone screen, soft off-white and dark cards, lime-green accents, circular macro progress rings, a meal card and a workout card, high-fidelity product mockup, dribbble quality, sharp, studio lighting` },
  { name: 'app-meals', ar: '9:16', prompt: `A clean minimal mobile nutrition app "meals" screen UI, food cards with photos, macro rings, lime-green accents, modern rounded design, high-fidelity product mockup, dribbble quality, sharp` },
  { name: 'app-workout', ar: '9:16', prompt: `A clean minimal mobile fitness app workout screen UI, exercise list with a timer ring, lime-green accents, dark-on-light modern design, high-fidelity product mockup, dribbble quality, sharp` },
  // Lifestyle / food for parallax + shuffle grid.
  { name: 'food-bowl', ar: '1:1', prompt: `Overhead of a vibrant healthy high-protein grain bowl on a light marble surface, fresh colourful ingredients, ${LIGHT}` },
  { name: 'meal-prep', ar: '4:3', prompt: `Colourful healthy meal-prep containers arranged on a bright kitchen counter, fresh vegetables, ${LIGHT}` },
  { name: 'home-workout', ar: '3:4', prompt: `A fit woman doing a bodyweight workout in a bright airy minimalist living room, lime-green yoga mat, ${LIGHT}` },
  { name: 'runner', ar: '3:4', prompt: `A runner jogging through a green city park at soft sunrise, dynamic healthy lifestyle, ${LIGHT}` },
  { name: 'wearable', ar: '1:1', prompt: `Close-up of a modern fitness smartwatch on a wrist showing a heart-rate ring, lime-green UI accent, bright clean background, premium product photography` },
  { name: 'shift-worker', ar: '3:4', prompt: `A confident nurse in scrubs smiling on a break holding a healthy smoothie, bright modern hospital cafe, ${LIGHT}` },
];

async function gen({ name, ar, prompt }) {
  const res = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-1.1-pro/predictions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', Prefer: 'wait' },
    body: JSON.stringify({ input: { prompt, aspect_ratio: ar, output_format: 'webp', output_quality: 90, prompt_upsampling: true } }),
  });
  const data = await res.json();
  if (data.status !== 'succeeded' || !data.output) throw new Error(`${name}: ${data.status} ${JSON.stringify(data.error || data.detail || '')}`);
  const url = Array.isArray(data.output) ? data.output[0] : data.output;
  const img = await fetch(url);
  await new Promise((resolve, reject) => {
    const ws = createWriteStream(join(OUT, `${name}.webp`));
    Readable.fromWeb(img.body).pipe(ws).on('finish', resolve).on('error', reject);
  });
  console.log(`OK  gen/${name}.webp`);
}

for (const img of IMAGES) {
  try { await gen(img); } catch (e) { console.error(`FAIL ${img.name}: ${e.message}`); }
}
console.log('done');
