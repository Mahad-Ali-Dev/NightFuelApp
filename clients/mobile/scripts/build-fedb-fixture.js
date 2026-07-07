#!/usr/bin/env node
/**
 * build-fedb-fixture.js
 *
 * One-shot generator that materialises the in-repo `FEDB_SLUGS` index from
 * `src/constants/exerciseDemos.ts` into a flat JSON fixture used by
 * `__tests__/constants/fedbSlugs.coverage.test.ts`. The fixture proves — by
 * data, not by construction — that every catalogued slug emits the canonical
 * [`raw.githubusercontent`/.../0.jpg`, `.../1.jpg`] frame pair the in-app
 * player relies on.
 *
 * Why regex-parse the TS source instead of importing it?
 *   - Importing the module would need adding `ts-node` to the workspace just
 *     to satisfy this one-shot script; and `FEDB_SLUGS` isn't exported anyway,
 *     so even Jest can't reach it directly. The shape of FEDB_SLUGS (a single
 *     object literal with string-only entries) parses cleanly with a tiny
 *     regex — zero dependencies, fully offline.
 *
 * Run by hand whenever `FEDB_SLUGS` in exerciseDemos.ts changes:
 *
 *     node clients/mobile/scripts/build-fedb-fixture.js
 *
 * (NOT wired into CI on purpose — the committed fixture IS the contract.
 * The companion Jest suite catches drift the moment the count diverges.)
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_FILE = path.join(ROOT, 'src', 'constants', 'exerciseDemos.ts');
const OUTPUT_FILE = path.join(ROOT, '__tests__', 'fixtures', 'fedb-catalog-slugs.json');

const FEDB_BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises';

/**
 * Extract the `FEDB_SLUGS` object literal from exerciseDemos.ts and parse its
 * string-to-string entries. Scoped to the declaration block so unrelated
 * single-quoted strings later in the file (e.g. TIPS_BY_BODYPART) can't bleed
 * in. Returns an array of [normalizedName, slug] pairs in declaration order.
 */
function extractFedbSlugs(source) {
  const declRe = /const\s+FEDB_SLUGS\s*:\s*Record<string,\s*string>\s*=\s*\{/;
  const m = declRe.exec(source);
  if (!m) {
    throw new Error('Could not locate `const FEDB_SLUGS` declaration in ' + SOURCE_FILE);
  }
  const braceStart = m.index + m[0].length - 1; // position of the opening `{`
  // Walk forward, tracking brace depth, to find the matching `}` that closes
  // the object literal. The source has no nested braces inside FEDB_SLUGS, so
  // depth tracking is defensive — we still want a hard guarantee that we stop
  // at the right `}` and not at the next object literal in the file.
  let depth = 0;
  let blockEnd = -1;
  for (let i = braceStart; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        blockEnd = i;
        break;
      }
    }
  }
  if (blockEnd < 0) {
    throw new Error('Could not find closing brace for FEDB_SLUGS object literal');
  }
  const body = source.slice(braceStart + 1, blockEnd);

  // Each entry is `'<key>': '<value>'`. Keys are normalized snake_case (a-z,
  // 0-9, _) and values are FEDB slug directory names (alphanumerics + the
  // separators `_`, `-`). No escaped quotes appear in either, which keeps the
  // regex simple and robust.
  const entryRe = /'([^']+)'\s*:\s*'([^']+)'/g;
  const entries = [];
  let em;
  while ((em = entryRe.exec(body)) !== null) {
    entries.push([em[1], em[2]]);
  }
  return entries;
}

function main() {
  const source = fs.readFileSync(SOURCE_FILE, 'utf8');
  const entries = extractFedbSlugs(source);

  if (entries.length === 0) {
    throw new Error('FEDB_SLUGS extraction yielded zero entries — refusing to write an empty fixture');
  }

  // Detect duplicate normalized keys: the source is a JS object literal so a
  // dup would silently overwrite — surface it loudly here instead.
  const seen = new Set();
  for (const [key] of entries) {
    if (seen.has(key)) {
      throw new Error('Duplicate normalized key in FEDB_SLUGS: ' + key);
    }
    seen.add(key);
  }

  // Build one row per catalogue slug. The fixture stores the literal frame
  // URLs the in-app resolver is contractually required to produce, so the
  // Jest suite can assert a byte-exact match without re-implementing the
  // builder.
  const rows = entries.map(([normalizedName, slug]) => ({
    normalizedName,
    slug,
    frame0Url: `${FEDB_BASE}/${slug}/0.jpg`,
    frame1Url: `${FEDB_BASE}/${slug}/1.jpg`,
  }));

  // Ensure the destination directory exists, then write a pretty-printed JSON
  // for readable diffs when FEDB_SLUGS evolves.
  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(rows, null, 2) + '\n', 'utf8');

  process.stdout.write(
    `[build-fedb-fixture] wrote ${rows.length} rows → ${path.relative(ROOT, OUTPUT_FILE)}\n`,
  );
}

main();
