// Zeitra hero-model generator — consistent male + female brand cast (fixed seed each) in 3 poses,
// plus a cycle tile. FLUX-dev (gen) -> birefnet (transparent cutout). Writes ./app_images/ready/<file>.png
// Usage: node _gen-heroes.js   (reads ./replicate-token.txt). Safe to re-run: skips existing files.
const fs = require('fs');
const path = require('path');
const TOKEN = fs.readFileSync(path.join(__dirname, 'replicate-token.txt'), 'utf8').trim();
const OUT = path.join(__dirname, 'app_images', 'ready');
fs.mkdirSync(OUT, { recursive: true });
const H = { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json', Prefer: 'wait' };

const MALE = 'a fit athletic man in his late 20s, short dark brown hair, light stubble, lean muscular build, wearing a fitted black athletic tank top and black training leggings with subtle electric-lime green accents and black training shoes';
const FEMALE = 'a fit athletic woman in her late 20s, dark hair in a high ponytail, toned athletic build, wearing a black athletic sports bra and high-waist black training leggings with subtle electric-lime green accents and black training shoes';
const SCENE = 'full body head to toe, centered, plain solid medium-grey studio background, soft studio lighting with a subtle electric-lime green rim light from the top-left, photorealistic, high detail, sharp focus, aspirational, athletic, tasteful and non-objectifying, no text';
const P = (who, pose) => `Full-body premium studio fitness photograph of ${who}, ${pose}, ${SCENE}.`;
const OBJ = s => `Premium studio product photograph of ${s}, a single object centered on a plain solid medium-grey background, smooth premium finish, soft studio lighting with a subtle electric-lime green rim light along the top-left edge, photorealistic, high detail, sharp focus, no text, no other objects.`;

// [filename, prompt, seed] — fixed seed per model keeps the same person across poses
const jobs = [
  ['hero-male-1',   P(MALE,   'standing confidently facing the camera, arms relaxed at the sides, calm strong expression'), 4242],
  ['hero-male-2',   P(MALE,   'standing with arms crossed in a slight three-quarter turn, confident'), 4242],
  ['hero-male-3',   P(MALE,   'a dynamic athletic mid-stride pose, energetic and powerful'), 4242],
  ['hero-female-1', P(FEMALE, 'standing confidently facing the camera, arms relaxed at the sides, calm strong expression'), 7777],
  ['hero-female-2', P(FEMALE, 'standing with hands on hips in a slight three-quarter turn, confident'), 7777],
  ['hero-female-3', P(FEMALE, 'a dynamic athletic pose mid-movement, energetic and graceful'), 7777],
  ['qa-cycle',      OBJ('a delicate blooming flower with soft rounded petals, a small crescent moon nestled beside it'), 909],
];

let BIREFNET_VER = null;
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function flux(prompt, seed) {
  const r = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-dev/predictions', { method: 'POST', headers: H, body: JSON.stringify({ input: { prompt, aspect_ratio: '1:1', output_format: 'png', num_outputs: 1, seed } }) });
  const j = await r.json(); const o = Array.isArray(j.output) ? j.output[0] : j.output; return o || null;
}
async function rembg(url) {
  const r = await fetch('https://api.replicate.com/v1/predictions', { method: 'POST', headers: H, body: JSON.stringify({ version: BIREFNET_VER, input: { image: url } }) });
  const j = await r.json(); const o = Array.isArray(j.output) ? j.output[0] : j.output; return o || null;
}
async function one(file, prompt, seed, attempt = 1) {
  const dest = path.join(OUT, file + '.png');
  if (fs.existsSync(dest)) return `skip ${file}`;
  try {
    const img = await flux(prompt, seed); if (!img) throw new Error('flux empty');
    const cut = await rembg(img) || img;
    const buf = Buffer.from(await (await fetch(cut)).arrayBuffer());
    fs.writeFileSync(dest, buf);
    return `ok   ${file} (${Math.round(buf.length / 1024)}kb)`;
  } catch (e) {
    if (attempt < 3) { await sleep(2000); return one(file, prompt, seed, attempt + 1); }
    return `FAIL ${file}: ${e.message}`;
  }
}
(async () => {
  const m = await (await fetch('https://api.replicate.com/v1/models/men1scus/birefnet', { headers: { Authorization: 'Bearer ' + TOKEN } })).json();
  BIREFNET_VER = m.latest_version && m.latest_version.id;
  if (!BIREFNET_VER) { console.log('could not get birefnet version'); return; }
  console.log(`Generating ${jobs.length} hero images -> ${OUT}`);
  const CONC = 3; let i = 0, done = 0;
  async function worker() { while (i < jobs.length) { const [f, p, s] = jobs[i++]; const r = await one(f, p, s); done++; console.log(`[${done}/${jobs.length}] ${r}`); } }
  await Promise.all(Array.from({ length: CONC }, worker));
  console.log('DONE');
})().catch(e => console.log('FATAL', e.message));
