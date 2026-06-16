/**
 * curatedDemos.test.ts
 *
 * Pins the curated-demo contract that {@link ../../src/constants/curatedDemos.ts}
 * adds on top of the existing 35-entry `DEMO_FALLBACK` map:
 *
 *   - the map covers >=100 distinct exercise names;
 *   - every entry's URL matches ONE of the three documented free-source shapes
 *     (YouTube watch URL, FEDB `0.jpg|1.jpg` frame pair, wger/HTTPS GIF);
 *   - every NEW `youtube` entry (`verified: false`) is mirrored in
 *     `./pendingHumanReviewIds.json` so a human reviewer can eyeball each id
 *     before flipping it to `verified: true`;
 *   - the 35 grandfathered DEMO_FALLBACK entries all stay `verified: true`
 *     (we never silently demote an already-curated video).
 *
 * Pure data/logic — no React, no network. The companion `exerciseDemos.test.ts`
 * is left untouched: it owns the DEMO_FALLBACK shape + cross-package sync
 * checks, which this addition does not change.
 */
import * as fs from 'fs';
import * as path from 'path';

import { CURATED_DEMOS, getCuratedDemo, type CuratedDemo } from '@/constants/curatedDemos';
import { DEMO_FALLBACK, getCuratedDemo as getCuratedDemoReExport } from '@/constants/exerciseDemos';

/**
 * Typed iterator over CURATED_DEMOS — `Object.entries` widens the value type to
 * `unknown` on a `Readonly<Record<string, T>>`, so we cast once here and reuse
 * the well-typed entries throughout the suite.
 */
const CURATED_ENTRIES: ReadonlyArray<readonly [string, CuratedDemo]> = Object.entries(CURATED_DEMOS) as Array<
  [string, CuratedDemo]
>;

// The three documented URL shapes the curated map is allowed to emit. Anything
// outside these (search URLs, results pages, foreign CDNs) is a bug.
const YOUTUBE_WATCH_RE = /^https:\/\/www\.youtube\.com\/watch\?v=([\w-]{6,})$/;
const FEDB_FRAME_PAIR_RE =
  /^https:\/\/raw\.githubusercontent\.com\/yuhonas\/free-exercise-db\/main\/exercises\/[^/]+\/0\.jpg\|https:\/\/raw\.githubusercontent\.com\/yuhonas\/free-exercise-db\/main\/exercises\/[^/]+\/1\.jpg$/;
// wger ships .gif demos at https://wger.de/media/exercise-images/<id>/<file>.gif —
// but we keep the regex broad so any HTTPS .gif URL is accepted.
const GIF_URL_RE = /^https:\/\/[^\s]+\.gif$/;

function extractYouTubeId(url: string): string | null {
  const m = YOUTUBE_WATCH_RE.exec(url);
  return m && m[1] ? m[1] : null;
}

// ---------------------------------------------------------------------------
// (a) >=100 entries
// ---------------------------------------------------------------------------

describe('CURATED_DEMOS — size', () => {
  test('covers at least 100 distinct exercise names', () => {
    const entries = Object.entries(CURATED_DEMOS);
    expect(entries.length).toBeGreaterThanOrEqual(100);
    // Sanity: keys are unique (Object.entries guarantees this, but assert
    // explicitly so a future refactor can't silently introduce duplicates).
    const keys = Object.keys(CURATED_DEMOS);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test('getCuratedDemo resolves a known grandfathered name', () => {
    const demo = getCuratedDemo('Barbell Bench Press');
    expect(demo).not.toBeNull();
    expect(demo!.kind).toBe('youtube');
    expect(demo!.verified).toBe(true);
    expect(demo!.url).toBe('https://www.youtube.com/watch?v=rT7DgCr-3pg');
  });

  test('getCuratedDemo is case-insensitive and whitespace-trimmed', () => {
    expect(getCuratedDemo('  barbell BENCH press ')).toEqual(getCuratedDemo('Barbell Bench Press'));
  });

  test('getCuratedDemo returns null for an unknown name', () => {
    expect(getCuratedDemo('Totally Made Up Movement 9000')).toBeNull();
    expect(getCuratedDemo('')).toBeNull();
  });

  test('the re-export from exerciseDemos.ts is the same function', () => {
    expect(getCuratedDemoReExport).toBe(getCuratedDemo);
  });
});

// ---------------------------------------------------------------------------
// (b) Every URL matches one of the three allowed shapes
// ---------------------------------------------------------------------------

describe('CURATED_DEMOS — URL shapes', () => {
  test.each(CURATED_ENTRIES.map(([n, d]) => [n, d] as [string, CuratedDemo]))(
    '%s — url matches its kind contract',
    (_name: string, demo: CuratedDemo) => {
      switch (demo.kind) {
        case 'youtube':
          expect(demo.url).toMatch(YOUTUBE_WATCH_RE);
          // Defensive: never a search/results page.
          expect(demo.url).not.toContain('/results');
          expect(demo.url).not.toContain('search_query');
          break;
        case 'fedb_frames':
          expect(demo.url).toMatch(FEDB_FRAME_PAIR_RE);
          break;
        case 'gif':
          expect(demo.url).toMatch(GIF_URL_RE);
          break;
      }
    },
  );

  test('every entry matches at least one of the three shapes (no other URL forms allowed)', () => {
    for (const [name, demo] of CURATED_ENTRIES) {
      const isYouTube = YOUTUBE_WATCH_RE.test(demo.url);
      const isFedbFrames = FEDB_FRAME_PAIR_RE.test(demo.url);
      const isGif = GIF_URL_RE.test(demo.url);
      expect(`${name} → ${demo.url} | matches=${[isYouTube, isFedbFrames, isGif].join(',')}`).toMatch(
        // human-readable annotation; we then assert the boolean below.
        /matches=/,
      );
      expect(isYouTube || isFedbFrames || isGif).toBe(true);
    }
  });

  test('every URL is HTTPS (ATS-safe)', () => {
    for (const [, demo] of CURATED_ENTRIES) {
      // For fedb_frames the URL is two pipe-joined HTTPS URLs — assert both.
      for (const part of demo.url.split('|')) {
        expect(part.startsWith('https://')).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// (c) Every new YouTube id (verified:false) is in pendingHumanReviewIds.json
// ---------------------------------------------------------------------------

describe('pendingHumanReviewIds.json — cross-check with verified:false YouTube entries', () => {
  // Load the JSON straight from disk so the test fails if the file is missing
  // or malformed (rather than silently importing an empty array via TS).
  const PENDING_JSON_PATH = path.resolve(__dirname, '../../src/constants/pendingHumanReviewIds.json');

  function loadPending(): string[] {
    const raw = fs.readFileSync(PENDING_JSON_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    expect(Array.isArray(parsed)).toBe(true);
    return parsed as string[];
  }

  test('the JSON exists and is a non-empty array of strings', () => {
    const pending = loadPending();
    expect(pending.length).toBeGreaterThan(0);
    for (const id of pending) {
      expect(typeof id).toBe('string');
      // YouTube video ids are at least 6 chars of [A-Za-z0-9_-].
      expect(id).toMatch(/^[\w-]{6,}$/);
    }
    // No duplicate ids (would mean the same video is reviewed twice).
    expect(new Set(pending).size).toBe(pending.length);
  });

  test('every NEW youtube entry (verified:false) has its video-id in the JSON', () => {
    const pending = loadPending();
    const newYouTubeIds: string[] = [];
    for (const [name, demo] of CURATED_ENTRIES) {
      if (demo.kind !== 'youtube' || demo.verified) continue;
      const id = extractYouTubeId(demo.url);
      // The URL itself must match the watch-URL shape (anchored). The `name` is
      // included in the failure message for triangulation but not asserted on.
      expect(demo.url).toMatch(YOUTUBE_WATCH_RE);
      expect(id).not.toBeNull();
      // Failure tag with the human-readable name so a missing id is easy to find.
      if (id === null) throw new Error(`Could not extract YouTube id from ${name} → ${demo.url}`);
      newYouTubeIds.push(id);
    }
    // The JSON must list every NEW youtube id (and may not have orphans).
    const newIdSet = new Set(newYouTubeIds);
    const pendingSet = new Set(pending);

    const missingFromJson = Array.from(newIdSet).filter((id) => !pendingSet.has(id));
    const orphansInJson = Array.from(pendingSet).filter((id) => !newIdSet.has(id));
    expect({ missingFromJson, orphansInJson }).toEqual({ missingFromJson: [], orphansInJson: [] });
  });

  test('no grandfathered (verified:true) youtube id appears in the pending list', () => {
    const pending = new Set(loadPending());
    for (const [, demo] of CURATED_ENTRIES) {
      if (demo.kind !== 'youtube' || !demo.verified) continue;
      const id = extractYouTubeId(demo.url);
      expect(id).not.toBeNull();
      expect(pending.has(id!)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// (d) The 35 grandfathered entries are all verified:true
// ---------------------------------------------------------------------------

describe('CURATED_DEMOS — grandfathered DEMO_FALLBACK names stay verified', () => {
  test('every DEMO_FALLBACK key resolves to a verified:true youtube entry with the SAME url', () => {
    const fallbackKeys = Object.keys(DEMO_FALLBACK);
    // Sanity: the upstream DEMO_FALLBACK map still has the 35 entries this work
    // item was scoped around. If this drifts, the curated map's grandfather
    // assumption needs re-checking.
    expect(fallbackKeys.length).toBe(35);

    for (const name of fallbackKeys) {
      const demo = getCuratedDemo(name);
      expect(`${name} → ${demo ? JSON.stringify(demo) : 'null'}`).not.toContain('null');
      expect(demo).not.toBeNull();
      expect(demo!.kind).toBe('youtube');
      expect(demo!.verified).toBe(true);
      expect(demo!.url).toBe(DEMO_FALLBACK[name]);
    }
  });

  test('all 35 grandfathered entries are present (no silent demotion or drop)', () => {
    const grandfathered = CURATED_ENTRIES.filter(([, d]) => d.kind === 'youtube' && d.verified);
    // At LEAST the 35 — strictly equal is too brittle if a future curated YT
    // is promoted to verified, but we want to guarantee we never DROP below 35.
    expect(grandfathered.length).toBeGreaterThanOrEqual(35);
  });
});
