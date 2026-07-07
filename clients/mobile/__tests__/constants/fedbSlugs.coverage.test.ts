/**
 * fedbSlugs.coverage.test.ts
 *
 * Data-driven proof that the committed FEDB catalogue fixture (873 rows) stays
 * in lock-step with the bundled `FEDB_SLUGS` index in
 * `src/constants/exerciseDemos.ts`, and that EVERY row emits the canonical
 * frame URL shape the in-app player relies on.
 *
 *   - row count === number of entries in FEDB_SLUGS (parsed from source);
 *   - every frame0Url / frame1Url matches the strict
 *     `raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/<slug>/(0|1).jpg`
 *     shape;
 *   - both frame URLs share the same slug directory;
 *   - that slug directory matches the row's own `slug` field;
 *   - and the resolver in exerciseDemos.ts produces the IDENTICAL [0,1] pair
 *     for every catalogued name (resolveDemoFrames is the in-app contract).
 *
 * If the fixture and the source map drift (entry added, removed, or
 * re-slugged), the count assertion fails first with an actionable diff; the
 * per-row assertions then pin every other invariant. Re-generate the fixture
 * by running `node scripts/build-fedb-fixture.js` from this package's root.
 *
 * No network, no React — pure data validation.
 */
import * as fs from 'fs';
import * as path from 'path';

import { resolveDemoFrames } from '@/constants/exerciseDemos';

import fixture from '../fixtures/fedb-catalog-slugs.json';

interface FixtureRow {
  readonly normalizedName: string;
  readonly slug: string;
  readonly frame0Url: string;
  readonly frame1Url: string;
}

const ROWS = fixture as ReadonlyArray<FixtureRow>;

const RAW_BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises';
// Strict shape: HTTPS, exact origin, /exercises/<slug>/(0|1).jpg. The slug
// segment forbids `/` so a stray nested path can't masquerade as a slug.
const FRAME_URL_RE = /^https:\/\/raw\.githubusercontent\.com\/yuhonas\/free-exercise-db\/main\/exercises\/([^/]+)\/(0|1)\.jpg$/;

/**
 * Count the entries of `FEDB_SLUGS` straight from the exerciseDemos.ts source.
 * We deliberately don't `import` FEDB_SLUGS — it isn't exported, and changing
 * that would be a behaviour change to the production module. Parsing the
 * source is the same technique the sibling exerciseDemos.test.ts uses for the
 * backend DEMO_URLS sync check, so the convention is already established.
 */
function countFedbSlugsInSource(): number {
  const file = path.resolve(__dirname, '../../src/constants/exerciseDemos.ts');
  const src = fs.readFileSync(file, 'utf8');
  const declRe = /const\s+FEDB_SLUGS\s*:\s*Record<string,\s*string>\s*=\s*\{/;
  const m = declRe.exec(src);
  expect(m).not.toBeNull(); // the declaration must still exist & be named
  const braceStart = m!.index + m![0].length - 1;
  // Walk to the matching closing brace so we don't slurp later object
  // literals (TIPS_BY_BODYPART starts further down the file).
  let depth = 0;
  let blockEnd = -1;
  for (let i = braceStart; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        blockEnd = i;
        break;
      }
    }
  }
  expect(blockEnd).toBeGreaterThan(braceStart);
  const body = src.slice(braceStart + 1, blockEnd);
  // Each entry is `'<key>': '<value>'`. Count by key — values are slugs which
  // also contain neither escaped quotes nor newlines, so the regex is stable.
  const entryRe = /'([^']+)'\s*:\s*'([^']+)'/g;
  let n = 0;
  while (entryRe.exec(body) !== null) n++;
  return n;
}

describe('FEDB catalogue fixture — committed shape', () => {
  test('the committed fixture has exactly 873 rows', () => {
    expect(ROWS.length).toBe(873);
  });

  test('fixture row count equals the FEDB_SLUGS entry count in the source', () => {
    // Sentinel against silent drift: deleting/adding a fixture row OR mutating
    // FEDB_SLUGS without re-running the generator breaks this assertion first.
    expect(ROWS.length).toBe(countFedbSlugsInSource());
  });

  test('every normalizedName is unique (no key collisions)', () => {
    const names = ROWS.map((r) => r.normalizedName);
    expect(new Set(names).size).toBe(names.length);
  });

  test('every slug is unique (no slug collisions)', () => {
    const slugs = ROWS.map((r) => r.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

describe('FEDB catalogue fixture — per-row URL contract', () => {
  // One test case per row so a regression points straight at the offending
  // slug rather than at a generic "some row failed" assertion.
  test.each(ROWS.map((row) => [row.slug, row]))(
    '%s → frame URLs match the strict raw.githubusercontent /exercises/<slug>/(0|1).jpg shape',
    (_slug, row) => {
      const m0 = FRAME_URL_RE.exec(row.frame0Url);
      const m1 = FRAME_URL_RE.exec(row.frame1Url);
      expect(m0).not.toBeNull();
      expect(m1).not.toBeNull();
      // frame indices are 0 and 1 specifically (not e.g. both 0).
      expect(m0![2]).toBe('0');
      expect(m1![2]).toBe('1');
      // Both URLs share the same slug directory, and that directory matches
      // the row's own `slug` field — so a renamed slug can't silently keep an
      // out-of-date frame URL alive on either index.
      expect(m0![1]).toBe(m1![1]);
      expect(m0![1]).toBe(row.slug);
      // Spot-check the URL is reproducible from the slug via the same builder
      // shape the in-app resolver uses.
      expect(row.frame0Url).toBe(`${RAW_BASE}/${row.slug}/0.jpg`);
      expect(row.frame1Url).toBe(`${RAW_BASE}/${row.slug}/1.jpg`);
    },
  );
});

describe('FEDB catalogue fixture — resolver lock-step', () => {
  // The whole point of the fixture: prove that the in-app `resolveDemoFrames`
  // produces the EXACT frame pair the fixture commits for every catalogue
  // entry — not just by construction, but by running the resolver on each
  // row's normalized name.
  test.each(ROWS.map((row) => [row.slug, row]))(
    '%s → resolveDemoFrames(name) emits the same [frame0, frame1] pair the fixture commits',
    (_slug, row) => {
      // The normalizedName in the fixture is the post-normalisation key. The
      // resolver re-normalises whatever name it receives, so passing the
      // normalized key (a snake_case lowercase string) is a valid input —
      // normaliseExerciseName is idempotent on already-normalised strings.
      const frames = resolveDemoFrames({ name: row.normalizedName });
      expect(frames).not.toBeNull();
      expect(frames).toEqual([row.frame0Url, row.frame1Url]);
    },
  );
});
