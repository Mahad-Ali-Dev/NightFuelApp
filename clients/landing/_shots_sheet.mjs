// Contact sheets of NightFuelApp/Screenshots so the keepers can be picked by
// index. Prints index -> filename, writes 2 grid images to the scratch dir.
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, '..', '..'); // NightFuelApp
const sharp = require(join(ROOT, 'node_modules', 'sharp'));

const SRC = join(ROOT, 'Screenshots');
const OUT = process.env.SHEET_OUT || __dir;

const files = readdirSync(SRC).filter((f) => f.includes('_Zeitra') && f.endsWith('.png'));
files.sort();

const TW = 108, TH = 240, COLS = 8, PAD = 6, LABEL = 22;
const perSheet = COLS * 4;

async function makeSheet(batch, sheetIdx) {
  const rows = Math.ceil(batch.length / COLS);
  const W = COLS * (TW + PAD) + PAD;
  const H = rows * (TH + LABEL + PAD) + PAD;
  const composites = [];
  for (let i = 0; i < batch.length; i++) {
    const col = i % COLS, row = Math.floor(i / COLS);
    const x = PAD + col * (TW + PAD);
    const y = PAD + row * (TH + LABEL + PAD);
    const idx = sheetIdx * perSheet + i;
    const thumb = await sharp(join(SRC, batch[i]))
      .resize(TW, TH, { fit: 'cover', position: 'top' })
      .png()
      .toBuffer();
    composites.push({ input: thumb, left: x, top: y + LABEL });
    const label = Buffer.from(
      `<svg width="${TW}" height="${LABEL}"><rect width="100%" height="100%" fill="#111"/><text x="4" y="16" font-family="Arial" font-size="14" font-weight="bold" fill="#c2f03c">#${idx}</text></svg>`,
    );
    composites.push({ input: label, left: x, top: y });
  }
  await sharp({ create: { width: W, height: H, channels: 3, background: '#222' } })
    .composite(composites)
    .jpeg({ quality: 82 })
    .toFile(join(OUT, `sheet-${sheetIdx}.jpg`));
  console.log(`sheet-${sheetIdx}.jpg (${batch.length} thumbs)`);
}

for (let s = 0; s * perSheet < files.length; s++) {
  await makeSheet(files.slice(s * perSheet, (s + 1) * perSheet), s);
}
files.forEach((f, i) => console.log(`#${i}\t${f}`));
