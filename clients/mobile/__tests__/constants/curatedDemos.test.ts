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

import {
  CURATED_DEMOS,
  getCuratedDemo,
  getCuratedDemoFrames,
  getCuratedDemoVerified,
  getPendingHumanReviewIds,
  type CuratedDemo,
} from '@/constants/curatedDemos';
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

// ---------------------------------------------------------------------------
// (e) The new GIF_PENDING tranche (kind:'gif', verified:false)
// ---------------------------------------------------------------------------
//
// These are FREE static animated-GIF demos (Wikimedia Commons) for a few
// high-frequency movements. <ExerciseDemo/> renders kind:'gif' as a PLAYING
// demo (expo-image animates the .gif natively), and verified:false makes the
// "Unreviewed" chip render until a human eyeballs each clip. They live OUTSIDE
// the GRANDFATHERED block, so they are NOT mirrored by the cross-package sync
// guard and are NOT in pendingHumanReviewIds.json (which tracks YouTube ids).
describe('CURATED_DEMOS — GIF_PENDING tranche', () => {
  // Authoring-time aliases that the grandfathered/FEDB maps deliberately do not
  // cover (so the precedence rule does not drop them).
  const GIF_NAMES = ['Pushup', 'Air Squat', 'Burpees', 'High Knee', 'Situp'] as const;

  test.each(GIF_NAMES)('getCuratedDemo(%j) returns a verified:false kind:"gif" entry', (name) => {
    const demo = getCuratedDemo(name);
    expect(demo).not.toBeNull();
    expect(demo!.kind).toBe('gif');
    expect(demo!.verified).toBe(false);
    // The URL is an HTTPS .gif (possibly URL-encoded) — matches the gif contract.
    expect(demo!.url).toMatch(/^https:\/\/[^\s]+\.gif$/);
  });

  test.each(GIF_NAMES)('getCuratedDemoFrames(%j) is null — a gif is not a frame pair', (name) => {
    expect(getCuratedDemoFrames(name)).toBeNull();
  });

  test.each(GIF_NAMES)('getCuratedDemoVerified(%j) === false (renders the "Unreviewed" chip)', (name) => {
    expect(getCuratedDemoVerified(name)).toBe(false);
  });

  test('resolution is case-insensitive / whitespace-trimmed, like every other kind', () => {
    expect(getCuratedDemo('  PUSHUP ')).toEqual(getCuratedDemo('Pushup'));
  });

  test('every gif entry ships verified:false (no gif is auto-promoted to verified)', () => {
    const gifEntries = CURATED_ENTRIES.filter(([, d]) => d.kind === 'gif');
    // Sanity: the tranche is actually present (guards against a refactor that
    // drops every gif via the precedence rule and silently passes the above).
    expect(gifEntries.length).toBeGreaterThanOrEqual(GIF_NAMES.length);
    for (const [, demo] of gifEntries) {
      expect(demo.verified).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// (f) The widened FEDB-backed tranche (kind:'fedb_frames', verified:false)
// ---------------------------------------------------------------------------
//
// A representative slice of the names added on top of the original FEDB-backed
// block. Every one maps to a slug directory that already exists in FEDB_SLUGS
// (exerciseDemos.ts), so it resolves to a 2-frame [0.jpg, 1.jpg] HTTPS pair with
// NO new network fetch and ships verified:false (human GIF/video review is
// user-gated). These live OUTSIDE the GRANDFATHERED block, so the cross-package
// sync guard and pendingHumanReviewIds.json (YouTube ids only) both ignore them.
describe('CURATED_DEMOS — widened FEDB-backed tranche', () => {
  // Representative new keys spanning the added categories (press, squat,
  // deadlift, rows, delts, biceps, triceps, chest, core, calves, kettlebell).
  const NEW_FEDB_NAMES = [
    'Smith Machine Bench Press',
    'Front Squat (Clean Grip)',
    'Glute Ham Raise',
    'Lying T-Bar Row',
    'Cable Rear Delt Fly',
    'High Cable Curls',
    'JM Press',
    'Low Cable Crossover',
    'Dead Bug',
    'Smith Machine Calf Raise',
    'Kettlebell Windmill',
    'Battling Ropes',
  ] as const;

  // Per-frame shape: each frame is an HTTPS raw.githubusercontent FEDB JPG. The
  // capture group is the slug dir so we can assert BOTH frames share one slug.
  const FEDB_SINGLE_FRAME_RE =
    /^https:\/\/raw\.githubusercontent\.com\/yuhonas\/free-exercise-db\/main\/exercises\/([^/]+)\/([01])\.jpg$/;

  test.each(NEW_FEDB_NAMES)('getCuratedDemo(%j) is a verified:false kind:"fedb_frames" entry', (name) => {
    const demo = getCuratedDemo(name);
    expect(demo).not.toBeNull();
    expect(demo!.kind).toBe('fedb_frames');
    expect(demo!.verified).toBe(false);
    // Stored shape is the pipe-joined 0.jpg|1.jpg pair (same contract the suite
    // asserts globally), and every segment is HTTPS (ATS-safe).
    expect(demo!.url).toMatch(FEDB_FRAME_PAIR_RE);
    for (const part of demo!.url.split('|')) {
      expect(part.startsWith('https://')).toBe(true);
    }
  });

  test.each(NEW_FEDB_NAMES)(
    'getCuratedDemoFrames(%j) yields an ordered 2-element HTTPS [0.jpg, 1.jpg] pair',
    (name) => {
      const frames = getCuratedDemoFrames(name);
      expect(frames).not.toBeNull();
      // Exactly two frames: start (0.jpg) then end (1.jpg).
      expect(frames!.length).toBe(2);

      const m0 = FEDB_SINGLE_FRAME_RE.exec(frames![0]!);
      const m1 = FEDB_SINGLE_FRAME_RE.exec(frames![1]!);
      expect(m0).not.toBeNull();
      expect(m1).not.toBeNull();
      // Both HTTPS.
      expect(frames![0]!.startsWith('https://')).toBe(true);
      expect(frames![1]!.startsWith('https://')).toBe(true);
      // Ordered 0 → 1.
      expect(m0![2]).toBe('0');
      expect(m1![2]).toBe('1');
      // Same slug directory for both frames (a real start/end pair, not two
      // different exercises).
      expect(m0![1]).toBe(m1![1]);
      expect(m0![1]!.length).toBeGreaterThan(0);
    },
  );

  test.each(NEW_FEDB_NAMES)('getCuratedDemoVerified(%j) === false (renders the "Unreviewed" chip)', (name) => {
    expect(getCuratedDemoVerified(name)).toBe(false);
  });

  test('resolution is case-insensitive / whitespace-trimmed for the new tranche', () => {
    expect(getCuratedDemo('  smith MACHINE bench press ')).toEqual(getCuratedDemo('Smith Machine Bench Press'));
  });

  test('none of the new FEDB names collide with a grandfathered (verified:true) entry', () => {
    // The precedence rule in buildCuratedDemos() keeps a grandfathered entry over
    // a same-named FEDB one; assert the representative slice did NOT land on a
    // verified YouTube key (which would silently drop the fedb_frames mapping).
    for (const name of NEW_FEDB_NAMES) {
      const demo = getCuratedDemo(name);
      expect(demo).not.toBeNull();
      expect(demo!.kind).toBe('fedb_frames');
    }
  });

  test('the FEDB-backed tranche is large (the widening actually took effect)', () => {
    const fedbEntries = CURATED_ENTRIES.filter(([, d]) => d.kind === 'fedb_frames');
    // Original block was ~152; the widening adds dozens more. Assert a healthy
    // floor so a future refactor that drops the new tranche fails loudly,
    // without pinning an exact count that legitimate edits would churn.
    expect(fedbEntries.length).toBeGreaterThanOrEqual(200);
  });
});

// ---------------------------------------------------------------------------
// (g) The "tranche #4" FEDB-backed additions resolve to a real catalogue slug
// ---------------------------------------------------------------------------
//
// These names were added DATA-ONLY by reusing FEDB slugs already shipped in
// exerciseDemos.ts (no new HTTP fetch). Beyond the generic shape checks above,
// this block pins each new key explicitly AND cross-checks that the slug
// directory both frames point at is a real entry in the 873-slug FEDB catalogue
// fixture (__tests__/fixtures/fedb-catalog-slugs.json) — i.e. the demo will
// actually load, not 404. Each ships kind:'fedb_frames', verified:false.
describe('CURATED_DEMOS — FEDB-backed tranche #4 (data-only additions)', () => {
  // Exact display-name keys added in tranche #4 of curatedDemos.ts.
  const TRANCHE_4_NAMES = [
    'Decline EZ Bar Triceps Extension',
    'Incline Barbell Triceps Extension',
    'Seated Bent-Over One-Arm Dumbbell Triceps Extension',
    'Dumbbell One-Arm Shoulder Press',
    'Cable Shoulder Press',
    'Machine Shoulder (Military) Press',
    'Smith Machine Upright Row',
    'Standing Cable Chest Press',
    'Lying Machine Squat',
    'Single Leg Glute Bridge',
    'Cable Shrug',
  ] as const;

  // Per-frame shape with the slug dir captured (group 1) and frame index (group 2).
  const FEDB_FRAME_RE =
    /^https:\/\/raw\.githubusercontent\.com\/yuhonas\/free-exercise-db\/main\/exercises\/([^/]+)\/([01])\.jpg$/;

  // The authoritative 873-slug FEDB catalogue fixture — every tranche-#4 slug
  // MUST be present here (and therefore in FEDB_SLUGS, which is the same set), so
  // the frame URLs resolve to real images.
  const CATALOG_SLUGS: ReadonlySet<string> = (() => {
    const fixturePath = path.resolve(__dirname, '../fixtures/fedb-catalog-slugs.json');
    const raw = fs.readFileSync(fixturePath, 'utf8');
    const parsed = JSON.parse(raw) as Array<{ slug: string }>;
    expect(Array.isArray(parsed)).toBe(true);
    return new Set(parsed.map((e) => e.slug));
  })();

  test('the catalogue fixture loaded a healthy set of slugs', () => {
    // Sanity: guards against a refactor that empties the fixture and makes the
    // membership checks below vacuously pass.
    expect(CATALOG_SLUGS.size).toBeGreaterThanOrEqual(800);
  });

  test.each(TRANCHE_4_NAMES)('getCuratedDemo(%j) is a verified:false kind:"fedb_frames" entry', (name) => {
    const demo = getCuratedDemo(name);
    expect(demo).not.toBeNull();
    expect(demo!.kind).toBe('fedb_frames');
    expect(demo!.verified).toBe(false);
    expect(demo!.url).toMatch(FEDB_FRAME_PAIR_RE);
  });

  test.each(TRANCHE_4_NAMES)(
    'getCuratedDemoFrames(%j) is an ordered 2-element HTTPS [0.jpg, 1.jpg] pair on a real catalogue slug',
    (name) => {
      const frames = getCuratedDemoFrames(name);
      expect(frames).not.toBeNull();
      expect(frames!.length).toBe(2);

      const m0 = FEDB_FRAME_RE.exec(frames![0]!);
      const m1 = FEDB_FRAME_RE.exec(frames![1]!);
      expect(m0).not.toBeNull();
      expect(m1).not.toBeNull();
      // Both HTTPS (ATS-safe).
      expect(frames![0]!.startsWith('https://')).toBe(true);
      expect(frames![1]!.startsWith('https://')).toBe(true);
      // Ordered start (0) → end (1).
      expect(m0![2]).toBe('0');
      expect(m1![2]).toBe('1');
      // A genuine start/end pair: both frames share ONE slug directory…
      expect(m0![1]).toBe(m1![1]);
      // …and that slug is a real entry in the shipped FEDB catalogue (so the
      // demo loads rather than 404s).
      expect(CATALOG_SLUGS.has(m0![1]!)).toBe(true);
    },
  );

  test.each(TRANCHE_4_NAMES)('getCuratedDemoVerified(%j) === false (renders the "Unreviewed" chip)', (name) => {
    expect(getCuratedDemoVerified(name)).toBe(false);
  });

  test('no tranche-#4 name is a YouTube/gif entry (each is a pure fedb_frames addition)', () => {
    for (const name of TRANCHE_4_NAMES) {
      const demo = getCuratedDemo(name);
      expect(demo).not.toBeNull();
      // Never silently landed on a grandfathered YouTube key or a gif alias.
      expect(demo!.kind).toBe('fedb_frames');
      expect(getCuratedDemoFrames(name)).not.toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// (h) The "tranche #5" FEDB-backed additions resolve to a real catalogue slug
// ---------------------------------------------------------------------------
//
// Same contract as tranche #4: DATA-ONLY additions that reuse FEDB slugs already
// shipped in exerciseDemos.ts (no new HTTP fetch). This block pins a few of the
// NEW tranche-#5 keys explicitly AND cross-checks that the slug directory both
// frames point at is a real entry in the 873-slug FEDB catalogue fixture
// (__tests__/fixtures/fedb-catalog-slugs.json) — i.e. the demo will actually
// load, not 404. Each ships kind:'fedb_frames', verified:false.
describe('CURATED_DEMOS — FEDB-backed tranche #5 (data-only additions)', () => {
  // A representative slice of the display-name keys added in tranche #5,
  // spanning chest, back, shoulders, biceps, triceps and legs.
  const TRANCHE_5_NAMES = [
    'Incline Dumbbell Press',
    'Cable Chest Press',
    'Leverage Chest Press',
    'Incline Bench Pull',
    'Leverage High Row',
    'Cuban Press',
    'Side Laterals to Front Raise',
    'Overhead Cable Curl',
    'Zottman Preacher Curl',
    'Standing Leg Curl',
    'Glute Kickback',
    'Weighted Sissy Squat',
  ] as const;

  // Per-frame shape with the slug dir captured (group 1) and frame index (group 2).
  const FEDB_FRAME_RE =
    /^https:\/\/raw\.githubusercontent\.com\/yuhonas\/free-exercise-db\/main\/exercises\/([^/]+)\/([01])\.jpg$/;

  // The authoritative 873-slug FEDB catalogue fixture — every tranche-#5 slug
  // MUST be present here (and therefore in FEDB_SLUGS, the same set), so the
  // frame URLs resolve to real images.
  const CATALOG_SLUGS: ReadonlySet<string> = (() => {
    const fixturePath = path.resolve(__dirname, '../fixtures/fedb-catalog-slugs.json');
    const raw = fs.readFileSync(fixturePath, 'utf8');
    const parsed = JSON.parse(raw) as Array<{ slug: string }>;
    expect(Array.isArray(parsed)).toBe(true);
    return new Set(parsed.map((e) => e.slug));
  })();

  test('the catalogue fixture loaded a healthy set of slugs', () => {
    // Sanity: guards against a refactor that empties the fixture and makes the
    // membership checks below vacuously pass.
    expect(CATALOG_SLUGS.size).toBeGreaterThanOrEqual(800);
  });

  test.each(TRANCHE_5_NAMES)('getCuratedDemo(%j) is a verified:false kind:"fedb_frames" entry', (name) => {
    const demo = getCuratedDemo(name);
    expect(demo).not.toBeNull();
    expect(demo!.kind).toBe('fedb_frames');
    expect(demo!.verified).toBe(false);
    expect(demo!.url).toMatch(FEDB_FRAME_PAIR_RE);
  });

  test.each(TRANCHE_5_NAMES)(
    'getCuratedDemoFrames(%j) is an ordered 2-element HTTPS [0.jpg, 1.jpg] pair on a real catalogue slug',
    (name) => {
      const frames = getCuratedDemoFrames(name);
      expect(frames).not.toBeNull();
      expect(frames!.length).toBe(2);

      const m0 = FEDB_FRAME_RE.exec(frames![0]!);
      const m1 = FEDB_FRAME_RE.exec(frames![1]!);
      expect(m0).not.toBeNull();
      expect(m1).not.toBeNull();
      // Both HTTPS (ATS-safe).
      expect(frames![0]!.startsWith('https://')).toBe(true);
      expect(frames![1]!.startsWith('https://')).toBe(true);
      // Ordered start (0) → end (1).
      expect(m0![2]).toBe('0');
      expect(m1![2]).toBe('1');
      // A genuine start/end pair: both frames share ONE slug directory…
      expect(m0![1]).toBe(m1![1]);
      // …and that slug is a real entry in the shipped FEDB catalogue (so the
      // demo loads rather than 404s).
      expect(CATALOG_SLUGS.has(m0![1]!)).toBe(true);
    },
  );

  test.each(TRANCHE_5_NAMES)('getCuratedDemoVerified(%j) === false (renders the "Unreviewed" chip)', (name) => {
    expect(getCuratedDemoVerified(name)).toBe(false);
  });

  test('no tranche-#5 name is a YouTube/gif entry (each is a pure fedb_frames addition)', () => {
    for (const name of TRANCHE_5_NAMES) {
      const demo = getCuratedDemo(name);
      expect(demo).not.toBeNull();
      // Never silently landed on a grandfathered YouTube key or a gif alias.
      expect(demo!.kind).toBe('fedb_frames');
      expect(getCuratedDemoFrames(name)).not.toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// (i) The "tranche #7" FEDB-backed additions resolve to a real catalogue slug
// ---------------------------------------------------------------------------
//
// Same contract as tranches #4/#5: DATA-ONLY additions that reuse FEDB slugs
// already shipped in exerciseDemos.ts (no new HTTP fetch). This block pins a
// representative slice of the NEW tranche-#7 keys explicitly AND cross-checks
// that the slug directory both frames point at is a real entry in the 873-slug
// FEDB catalogue fixture (__tests__/fixtures/fedb-catalog-slugs.json) — i.e. the
// demo will actually load, not 404. Each ships kind:'fedb_frames', verified:false.
describe('CURATED_DEMOS — FEDB-backed tranche #7 (data-only additions)', () => {
  // A representative slice spanning chest, shoulders, back, biceps, triceps,
  // legs, core, Olympic lifts and kettlebell.
  const TRANCHE_7_NAMES = [
    'Pushups Close and Wide Hand Positions',
    'One Arm Dumbbell Bench Press',
    'Dumbbell Lying Rear Lateral Raise',
    'Bent Over Two-Arm Long Bar Row',
    'Alternate Hammer Curl',
    'Triceps Overhead Extension with Rope',
    'Dumbbell Squat To A Bench',
    'Seated Barbell Twist',
    'Otis-Up',
    'Power Clean',
    'Clean and Jerk',
    'One-Arm Kettlebell Snatch',
  ] as const;

  // Per-frame shape with the slug dir captured (group 1) and frame index (group 2).
  const FEDB_FRAME_RE =
    /^https:\/\/raw\.githubusercontent\.com\/yuhonas\/free-exercise-db\/main\/exercises\/([^/]+)\/([01])\.jpg$/;

  // The authoritative 873-slug FEDB catalogue fixture — every tranche-#7 slug
  // MUST be present here (and therefore in FEDB_SLUGS, the same set), so the
  // frame URLs resolve to real images.
  const CATALOG_SLUGS: ReadonlySet<string> = (() => {
    const fixturePath = path.resolve(__dirname, '../fixtures/fedb-catalog-slugs.json');
    const raw = fs.readFileSync(fixturePath, 'utf8');
    const parsed = JSON.parse(raw) as Array<{ slug: string }>;
    expect(Array.isArray(parsed)).toBe(true);
    return new Set(parsed.map((e) => e.slug));
  })();

  test('the catalogue fixture loaded a healthy set of slugs', () => {
    // Sanity: guards against a refactor that empties the fixture and makes the
    // membership checks below vacuously pass.
    expect(CATALOG_SLUGS.size).toBeGreaterThanOrEqual(800);
  });

  test.each(TRANCHE_7_NAMES)('getCuratedDemo(%j) is a verified:false kind:"fedb_frames" entry', (name) => {
    const demo = getCuratedDemo(name);
    expect(demo).not.toBeNull();
    expect(demo!.kind).toBe('fedb_frames');
    expect(demo!.verified).toBe(false);
    expect(demo!.url).toMatch(FEDB_FRAME_PAIR_RE);
  });

  test.each(TRANCHE_7_NAMES)(
    'getCuratedDemoFrames(%j) is an ordered 2-element HTTPS [0.jpg, 1.jpg] pair on a real catalogue slug',
    (name) => {
      const frames = getCuratedDemoFrames(name);
      expect(frames).not.toBeNull();
      expect(frames!.length).toBe(2);

      const m0 = FEDB_FRAME_RE.exec(frames![0]!);
      const m1 = FEDB_FRAME_RE.exec(frames![1]!);
      expect(m0).not.toBeNull();
      expect(m1).not.toBeNull();
      // Both HTTPS (ATS-safe).
      expect(frames![0]!.startsWith('https://')).toBe(true);
      expect(frames![1]!.startsWith('https://')).toBe(true);
      // Ordered start (0) → end (1).
      expect(m0![2]).toBe('0');
      expect(m1![2]).toBe('1');
      // A genuine start/end pair: both frames share ONE slug directory…
      expect(m0![1]).toBe(m1![1]);
      // …and that slug is a real entry in the shipped FEDB catalogue (so the
      // demo loads rather than 404s).
      expect(CATALOG_SLUGS.has(m0![1]!)).toBe(true);
    },
  );

  test.each(TRANCHE_7_NAMES)('getCuratedDemoVerified(%j) === false (renders the "Unreviewed" chip)', (name) => {
    expect(getCuratedDemoVerified(name)).toBe(false);
  });

  test('no tranche-#7 name is a YouTube/gif entry (each is a pure fedb_frames addition)', () => {
    for (const name of TRANCHE_7_NAMES) {
      const demo = getCuratedDemo(name);
      expect(demo).not.toBeNull();
      // Never silently landed on a grandfathered YouTube key or a gif alias.
      expect(demo!.kind).toBe('fedb_frames');
      expect(getCuratedDemoFrames(name)).not.toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// (j) The widened GIF_PENDING alias additions (kind:'gif', verified:false)
// ---------------------------------------------------------------------------
//
// A few extra common spelling/locale variants mapped to the SAME proven Commons
// clip URLs already shipped in the original GIF tranche (no new CDN path, so no
// dead-link risk), each on a DISTINCT alias key the grandfathered/FEDB maps do
// not claim. <ExerciseDemo/> renders kind:'gif' as a PLAYING demo, and
// verified:false keeps the "Unreviewed" chip until a human eyeballs each alias.
// They live OUTSIDE the GRANDFATHERED block, so the cross-package sync guard and
// pendingHumanReviewIds.json (YouTube ids only) both ignore them.
describe('CURATED_DEMOS — widened GIF_PENDING alias tranche', () => {
  const NEW_GIF_NAMES = ['Press Up', 'Bodyweight Squats', 'Sit Up', 'Burpee (CrossFit)'] as const;

  test.each(NEW_GIF_NAMES)('getCuratedDemo(%j) returns a verified:false kind:"gif" entry', (name) => {
    const demo = getCuratedDemo(name);
    expect(demo).not.toBeNull();
    expect(demo!.kind).toBe('gif');
    expect(demo!.verified).toBe(false);
    expect(demo!.url).toMatch(GIF_URL_RE);
  });

  test.each(NEW_GIF_NAMES)('getCuratedDemoFrames(%j) is null — a gif is not a frame pair', (name) => {
    expect(getCuratedDemoFrames(name)).toBeNull();
  });

  test.each(NEW_GIF_NAMES)('getCuratedDemoVerified(%j) === false (renders the "Unreviewed" chip)', (name) => {
    expect(getCuratedDemoVerified(name)).toBe(false);
  });

  test('resolution is case-insensitive / whitespace-trimmed for the new gif aliases', () => {
    expect(getCuratedDemo('  PRESS up ')).toEqual(getCuratedDemo('Press Up'));
  });
});

// ---------------------------------------------------------------------------
// (k) The "tranche #8" FEDB-backed additions resolve to a real catalogue slug
// ---------------------------------------------------------------------------
//
// Same contract as tranches #4/#5/#7: DATA-ONLY additions that reuse FEDB slugs
// already shipped in exerciseDemos.ts (no new HTTP fetch). This block pins a
// representative slice of the NEW tranche-#8 keys explicitly AND cross-checks
// that the slug directory both frames point at is a real entry in the 873-slug
// FEDB catalogue fixture (__tests__/fixtures/fedb-catalog-slugs.json) — i.e. the
// demo will actually load, not 404. Each ships kind:'fedb_frames', verified:false.
describe('CURATED_DEMOS — FEDB-backed tranche #8 (data-only additions)', () => {
  // A representative slice spanning press, squat, deadlift/posterior chain, rows,
  // pulldowns, delts, biceps, triceps, calves, core and kettlebell.
  const TRANCHE_8_NAMES = [
    'Smith Machine Close-Grip Bench Press',
    'Close-Grip EZ-Bar Press',
    'Bent-Arm Barbell Pullover',
    'Narrow Stance Hack Squats',
    'Smith Machine Stiff-Legged Deadlift',
    'Natural Glute Ham Raise',
    'Lying Cambered Barbell Row',
    'Rope Straight-Arm Pulldown',
    'Cable Rope Rear-Delt Rows',
    'Preacher Hammer Dumbbell Curl',
    'Triceps Pushdown (Rope Attachment)',
    'Barbell Seated Calf Raise',
    'Cable Reverse Crunch',
    'Two-Arm Kettlebell Military Press',
  ] as const;

  // Per-frame shape with the slug dir captured (group 1) and frame index (group 2).
  const FEDB_FRAME_RE =
    /^https:\/\/raw\.githubusercontent\.com\/yuhonas\/free-exercise-db\/main\/exercises\/([^/]+)\/([01])\.jpg$/;

  // The authoritative 873-slug FEDB catalogue fixture — every tranche-#8 slug
  // MUST be present here (and therefore in FEDB_SLUGS, the same set), so the
  // frame URLs resolve to real images.
  const CATALOG_SLUGS: ReadonlySet<string> = (() => {
    const fixturePath = path.resolve(__dirname, '../fixtures/fedb-catalog-slugs.json');
    const raw = fs.readFileSync(fixturePath, 'utf8');
    const parsed = JSON.parse(raw) as Array<{ slug: string }>;
    expect(Array.isArray(parsed)).toBe(true);
    return new Set(parsed.map((e) => e.slug));
  })();

  test('the catalogue fixture loaded a healthy set of slugs', () => {
    // Sanity: guards against a refactor that empties the fixture and makes the
    // membership checks below vacuously pass.
    expect(CATALOG_SLUGS.size).toBeGreaterThanOrEqual(800);
  });

  test.each(TRANCHE_8_NAMES)('getCuratedDemo(%j) is a verified:false kind:"fedb_frames" entry', (name) => {
    const demo = getCuratedDemo(name);
    expect(demo).not.toBeNull();
    expect(demo!.kind).toBe('fedb_frames');
    expect(demo!.verified).toBe(false);
    expect(demo!.url).toMatch(FEDB_FRAME_PAIR_RE);
  });

  test.each(TRANCHE_8_NAMES)(
    'getCuratedDemoFrames(%j) is an ordered 2-element HTTPS [0.jpg, 1.jpg] pair on a real catalogue slug',
    (name) => {
      const frames = getCuratedDemoFrames(name);
      expect(frames).not.toBeNull();
      expect(frames!.length).toBe(2);

      const m0 = FEDB_FRAME_RE.exec(frames![0]!);
      const m1 = FEDB_FRAME_RE.exec(frames![1]!);
      expect(m0).not.toBeNull();
      expect(m1).not.toBeNull();
      // Both HTTPS (ATS-safe).
      expect(frames![0]!.startsWith('https://')).toBe(true);
      expect(frames![1]!.startsWith('https://')).toBe(true);
      // Ordered start (0) → end (1).
      expect(m0![2]).toBe('0');
      expect(m1![2]).toBe('1');
      // A genuine start/end pair: both frames share ONE slug directory…
      expect(m0![1]).toBe(m1![1]);
      // …and that slug is a real entry in the shipped FEDB catalogue (so the
      // demo loads rather than 404s).
      expect(CATALOG_SLUGS.has(m0![1]!)).toBe(true);
    },
  );

  test.each(TRANCHE_8_NAMES)('getCuratedDemoVerified(%j) === false (renders the "Unreviewed" chip)', (name) => {
    expect(getCuratedDemoVerified(name)).toBe(false);
  });

  test('no tranche-#8 name is a YouTube/gif entry (each is a pure fedb_frames addition)', () => {
    for (const name of TRANCHE_8_NAMES) {
      const demo = getCuratedDemo(name);
      expect(demo).not.toBeNull();
      // Never silently landed on a grandfathered YouTube key or a gif alias.
      expect(demo!.kind).toBe('fedb_frames');
      expect(getCuratedDemoFrames(name)).not.toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// (l) The "tranche #9" FEDB-backed additions resolve to a real catalogue slug
// ---------------------------------------------------------------------------
//
// Same contract as tranches #4/#5/#7/#8: DATA-ONLY additions that reuse FEDB
// slugs already shipped in exerciseDemos.ts (no new HTTP fetch). This block pins
// EVERY new tranche-#9 key explicitly AND cross-checks that the slug directory
// both frames point at is a real entry in the 873-slug FEDB catalogue fixture
// (__tests__/fixtures/fedb-catalog-slugs.json) — i.e. the demo will actually
// load, not 404. Each ships kind:'fedb_frames', verified:false. The block also
// asserts getPendingHumanReviewIds() is UNCHANGED (no new YouTube ids) and that
// the CURATED_DEMOS count grew by exactly the tranche size.
describe('CURATED_DEMOS — FEDB-backed tranche #9 (data-only additions)', () => {
  // The COMPLETE set of display-name keys added in tranche #9 of curatedDemos.ts
  // (every key is asserted, not just a representative slice).
  const TRANCHE_9_NAMES = [
    // Dumbbell — flyes / raises / curls
    'One-Arm Flat Bench Dumbbell Flye',
    'Alternate Incline Dumbbell Curl',
    'Dumbbell Prone Incline Curl',
    'Lying Supine Dumbbell Curl',
    'Dumbbell Scaption',
    'Alternating Deltoid Raise',
    'Lying One-Arm Lateral Raise',
    'Front Incline Dumbbell Raise',
    'Lying Rear Delt Raise',
    // Cable / machine — chest / shoulders / back
    'Single-Arm Cable Crossover',
    'Incline Cable Chest Press',
    'Alternating Cable Shoulder Press',
    'Low Pulley Row To Neck',
    'Leverage Iso Row',
    'Leverage Decline Chest Press',
    // Triceps — dumbbell / cable
    'Standing One-Arm Dumbbell Triceps Extension',
    'Seated Bent-Over Two-Arm Dumbbell Triceps Extension',
    'Cable Incline Pushdown',
    'Dumbbell Tricep Extension (Pronated Grip)',
    // Back / pulls / dips
    'One Arm Chin-Up',
    'Bent Over One-Arm Long Bar Row',
    'Dips (Chest Version)',
    'Inverted Row with Straps',
    // Legs / glutes / hamstrings
    'Ball Leg Curl',
    'Single-Leg Leg Extension',
    'Single-Leg High Box Squat',
    'Kneeling Squat',
    'Freehand Jump Squat',
    // Core / abs
    'Decline Oblique Crunch',
    'Flat Bench Lying Leg Raise',
    'Gorilla Chin Crunch',
    'Tuck Crunch',
    'Cocoons',
    // Kettlebell / conditioning
    'Kettlebell Arnold Press',
    'One-Arm Kettlebell Row',
    'Two-Arm Kettlebell Clean',
    // Calves
    'Calf Raise On A Dumbbell',
    'Dumbbell Seated One-Leg Calf Raise',
  ] as const;

  // Per-frame shape with the slug dir captured (group 1) and frame index (group 2).
  const FEDB_FRAME_RE =
    /^https:\/\/raw\.githubusercontent\.com\/yuhonas\/free-exercise-db\/main\/exercises\/([^/]+)\/([01])\.jpg$/;

  // The authoritative 873-slug FEDB catalogue fixture — every tranche-#9 slug
  // MUST be present here (and therefore in FEDB_SLUGS, the same set), so the
  // frame URLs resolve to real images.
  const CATALOG_SLUGS: ReadonlySet<string> = (() => {
    const fixturePath = path.resolve(__dirname, '../fixtures/fedb-catalog-slugs.json');
    const raw = fs.readFileSync(fixturePath, 'utf8');
    const parsed = JSON.parse(raw) as Array<{ slug: string }>;
    expect(Array.isArray(parsed)).toBe(true);
    return new Set(parsed.map((e) => e.slug));
  })();

  test('the catalogue fixture loaded a healthy set of slugs', () => {
    // Sanity: guards against a refactor that empties the fixture and makes the
    // membership checks below vacuously pass.
    expect(CATALOG_SLUGS.size).toBeGreaterThanOrEqual(800);
  });

  test('every tranche-#9 key is a NEW distinct CURATED_DEMOS entry', () => {
    // The tranche is internally distinct…
    expect(new Set(TRANCHE_9_NAMES).size).toBe(TRANCHE_9_NAMES.length);
    // …and every name actually resolved into the frozen map (none dropped by the
    // never-overwrite precedence rule because of a stale collision).
    for (const name of TRANCHE_9_NAMES) {
      expect(Object.prototype.hasOwnProperty.call(CURATED_DEMOS, name)).toBe(true);
    }
  });

  test.each(TRANCHE_9_NAMES)('getCuratedDemo(%j) is a verified:false kind:"fedb_frames" entry', (name) => {
    const demo = getCuratedDemo(name);
    expect(demo).not.toBeNull();
    expect(demo!.kind).toBe('fedb_frames');
    expect(demo!.verified).toBe(false);
    expect(demo!.url).toMatch(FEDB_FRAME_PAIR_RE);
  });

  test.each(TRANCHE_9_NAMES)(
    'getCuratedDemoFrames(%j) is an ordered 2-element HTTPS [0.jpg, 1.jpg] pair on a real catalogue slug',
    (name) => {
      const frames = getCuratedDemoFrames(name);
      expect(frames).not.toBeNull();
      expect(frames!.length).toBe(2);

      const m0 = FEDB_FRAME_RE.exec(frames![0]!);
      const m1 = FEDB_FRAME_RE.exec(frames![1]!);
      expect(m0).not.toBeNull();
      expect(m1).not.toBeNull();
      // Both HTTPS (ATS-safe).
      expect(frames![0]!.startsWith('https://')).toBe(true);
      expect(frames![1]!.startsWith('https://')).toBe(true);
      // Ordered start (0) → end (1).
      expect(m0![2]).toBe('0');
      expect(m1![2]).toBe('1');
      // A genuine start/end pair: both frames share ONE slug directory…
      expect(m0![1]).toBe(m1![1]);
      // …and that slug is a real entry in the shipped FEDB catalogue (so the
      // demo loads rather than 404s).
      expect(CATALOG_SLUGS.has(m0![1]!)).toBe(true);
    },
  );

  test.each(TRANCHE_9_NAMES)('getCuratedDemoVerified(%j) === false (renders the "Unreviewed" chip)', (name) => {
    expect(getCuratedDemoVerified(name)).toBe(false);
  });

  test('no tranche-#9 name is a YouTube/gif entry (each is a pure fedb_frames addition)', () => {
    for (const name of TRANCHE_9_NAMES) {
      const demo = getCuratedDemo(name);
      expect(demo).not.toBeNull();
      // Never silently landed on a grandfathered YouTube key or a gif alias.
      expect(demo!.kind).toBe('fedb_frames');
      expect(getCuratedDemoFrames(name)).not.toBeNull();
    }
  });

  test('tranche #9 leaves getPendingHumanReviewIds() unchanged (no new YouTube ids)', () => {
    // tranche #9 is fedb_frames-only, so the human-review YouTube id set must be
    // exactly the union of the GRANDFATHERED-excluded YOUTUBE_PENDING ids — none
    // of the new names contribute a YouTube id. Cross-check against the on-disk
    // mirror so a stray youtube entry sneaking into this tranche fails loudly.
    const ids = getPendingHumanReviewIds();
    const pendingJsonPath = path.resolve(__dirname, '../../src/constants/pendingHumanReviewIds.json');
    const mirror = JSON.parse(fs.readFileSync(pendingJsonPath, 'utf8')) as string[];
    expect([...ids].sort()).toEqual([...mirror].sort());
    // And not one tranche-#9 name resolves to a youtube kind (belt + braces).
    for (const name of TRANCHE_9_NAMES) {
      expect(getCuratedDemo(name)!.kind).not.toBe('youtube');
    }
  });

  test('CURATED_DEMOS count grew by exactly the tranche-#9 size over the pre-#9 baseline', () => {
    // The pre-#9 map = everything EXCEPT the tranche-#9 keys. Removing them must
    // drop the count by exactly TRANCHE_9_NAMES.length, proving the tranche added
    // that many brand-new entries (no silent collisions / drops).
    const all = Object.keys(CURATED_DEMOS);
    const tranche9 = new Set<string>(TRANCHE_9_NAMES);
    const withoutTranche9 = all.filter((k) => !tranche9.has(k));
    expect(all.length - withoutTranche9.length).toBe(TRANCHE_9_NAMES.length);
    // Every tranche-#9 key was genuinely present to be removed (no typo'd key
    // that silently never existed in the map).
    expect(all.length - withoutTranche9.length).toBe(tranche9.size);
  });
});

// ---------------------------------------------------------------------------
// (m) The "tranche #10" FEDB-backed additions resolve to a real catalogue slug
// ---------------------------------------------------------------------------
//
// Same contract as tranches #4/#5/#7/#8/#9: DATA-ONLY additions that reuse FEDB
// slugs already shipped in exerciseDemos.ts (no new HTTP fetch). This block pins
// EVERY new tranche-#10 key explicitly AND cross-checks that the slug directory
// both frames point at is a real entry in the 873-slug FEDB catalogue fixture
// (__tests__/fixtures/fedb-catalog-slugs.json) — i.e. the demo will actually
// load, not 404. Each ships kind:'fedb_frames', verified:false. The block also
// asserts getPendingHumanReviewIds() is UNCHANGED (no new YouTube ids) and that
// the CURATED_DEMOS count grew by exactly the tranche size.
describe('CURATED_DEMOS — FEDB-backed tranche #10 (data-only additions)', () => {
  // The COMPLETE set of display-name keys added in tranche #10 of curatedDemos.ts
  // (every key is asserted, not just a representative slice).
  const TRANCHE_10_NAMES = [
    // Forearms / wrist curls
    'Palms-Down Wrist Curl Over A Bench',
    'Palms-Up Barbell Wrist Curl Over A Bench',
    'Cable Wrist Curl',
    'Standing Palms-Up Barbell Behind The Back Wrist Curl',
    'Seated Dumbbell Palms-Down Wrist Curl',
    // Grip / strongman
    'Plate Pinch',
    "Farmer's Walk",
    'Atlas Stones',
    // Olympic / power — dumbbell clean
    'Dumbbell Clean',
    'Bottoms-Up Clean From The Hang Position',
    'Single-Arm Linear Jammer',
    // Core / abs — rollouts & suspended/crawl variants
    'Barbell Ab Rollout',
    'Barbell Ab Rollout - On Knees',
    'Spider Crawl',
    'Suspended Push-Up',
    'Suspended Row',
    'Suspended Reverse Crunch',
    // Mobility / stretch staples
    'Cat Stretch',
    "Child's Pose",
    'Standing Hip Flexors',
  ] as const;

  // Per-frame shape with the slug dir captured (group 1) and frame index (group 2).
  const FEDB_FRAME_RE =
    /^https:\/\/raw\.githubusercontent\.com\/yuhonas\/free-exercise-db\/main\/exercises\/([^/]+)\/([01])\.jpg$/;

  // The authoritative 873-slug FEDB catalogue fixture — every tranche-#10 slug
  // MUST be present here (and therefore in FEDB_SLUGS, the same set), so the
  // frame URLs resolve to real images.
  const CATALOG_SLUGS: ReadonlySet<string> = (() => {
    const fixturePath = path.resolve(__dirname, '../fixtures/fedb-catalog-slugs.json');
    const raw = fs.readFileSync(fixturePath, 'utf8');
    const parsed = JSON.parse(raw) as Array<{ slug: string }>;
    expect(Array.isArray(parsed)).toBe(true);
    return new Set(parsed.map((e) => e.slug));
  })();

  test('the catalogue fixture loaded a healthy set of slugs', () => {
    // Sanity: guards against a refactor that empties the fixture and makes the
    // membership checks below vacuously pass.
    expect(CATALOG_SLUGS.size).toBeGreaterThanOrEqual(800);
  });

  test('every tranche-#10 key is a NEW distinct CURATED_DEMOS entry', () => {
    // The tranche is internally distinct…
    expect(new Set(TRANCHE_10_NAMES).size).toBe(TRANCHE_10_NAMES.length);
    // …and every name actually resolved into the frozen map (none dropped by the
    // never-overwrite precedence rule because of a stale collision).
    for (const name of TRANCHE_10_NAMES) {
      expect(Object.prototype.hasOwnProperty.call(CURATED_DEMOS, name)).toBe(true);
    }
  });

  test.each(TRANCHE_10_NAMES)('getCuratedDemo(%j) is a verified:false kind:"fedb_frames" entry', (name) => {
    const demo = getCuratedDemo(name);
    expect(demo).not.toBeNull();
    expect(demo!.kind).toBe('fedb_frames');
    expect(demo!.verified).toBe(false);
    expect(demo!.url).toMatch(FEDB_FRAME_PAIR_RE);
  });

  test.each(TRANCHE_10_NAMES)(
    'getCuratedDemoFrames(%j) is an ordered 2-element HTTPS [0.jpg, 1.jpg] pair on a real catalogue slug',
    (name) => {
      const frames = getCuratedDemoFrames(name);
      expect(frames).not.toBeNull();
      expect(frames!.length).toBe(2);

      const m0 = FEDB_FRAME_RE.exec(frames![0]!);
      const m1 = FEDB_FRAME_RE.exec(frames![1]!);
      expect(m0).not.toBeNull();
      expect(m1).not.toBeNull();
      // Both HTTPS (ATS-safe).
      expect(frames![0]!.startsWith('https://')).toBe(true);
      expect(frames![1]!.startsWith('https://')).toBe(true);
      // Ordered start (0) → end (1).
      expect(m0![2]).toBe('0');
      expect(m1![2]).toBe('1');
      // A genuine start/end pair: both frames share ONE slug directory…
      expect(m0![1]).toBe(m1![1]);
      // …and that slug is a real entry in the shipped FEDB catalogue (so the
      // demo loads rather than 404s).
      expect(CATALOG_SLUGS.has(m0![1]!)).toBe(true);
    },
  );

  test.each(TRANCHE_10_NAMES)('getCuratedDemoVerified(%j) === false (renders the "Unreviewed" chip)', (name) => {
    expect(getCuratedDemoVerified(name)).toBe(false);
  });

  test('no tranche-#10 name is a YouTube/gif entry (each is a pure fedb_frames addition)', () => {
    for (const name of TRANCHE_10_NAMES) {
      const demo = getCuratedDemo(name);
      expect(demo).not.toBeNull();
      // Never silently landed on a grandfathered YouTube key or a gif alias.
      expect(demo!.kind).toBe('fedb_frames');
      expect(getCuratedDemoFrames(name)).not.toBeNull();
    }
  });

  test('tranche #10 leaves getPendingHumanReviewIds() unchanged (no new YouTube ids)', () => {
    // tranche #10 is fedb_frames-only, so the human-review YouTube id set must be
    // exactly the on-disk mirror — none of the new names contribute a YouTube id.
    const ids = getPendingHumanReviewIds();
    const pendingJsonPath = path.resolve(__dirname, '../../src/constants/pendingHumanReviewIds.json');
    const mirror = JSON.parse(fs.readFileSync(pendingJsonPath, 'utf8')) as string[];
    expect([...ids].sort()).toEqual([...mirror].sort());
    // And not one tranche-#10 name resolves to a youtube kind (belt + braces).
    for (const name of TRANCHE_10_NAMES) {
      expect(getCuratedDemo(name)!.kind).not.toBe('youtube');
    }
  });

  test('CURATED_DEMOS count grew by exactly the tranche-#10 size over the pre-#10 baseline', () => {
    // The pre-#10 map = everything EXCEPT the tranche-#10 keys. Removing them must
    // drop the count by exactly TRANCHE_10_NAMES.length, proving the tranche added
    // that many brand-new entries (no silent collisions / drops).
    const all = Object.keys(CURATED_DEMOS);
    const tranche10 = new Set<string>(TRANCHE_10_NAMES);
    const withoutTranche10 = all.filter((k) => !tranche10.has(k));
    expect(all.length - withoutTranche10.length).toBe(TRANCHE_10_NAMES.length);
    // Every tranche-#10 key was genuinely present to be removed (no typo'd key
    // that silently never existed in the map).
    expect(all.length - withoutTranche10.length).toBe(tranche10.size);
  });
});

// ---------------------------------------------------------------------------
// (n) The "tranche #11" FEDB-backed additions resolve to a real catalogue slug
// ---------------------------------------------------------------------------
//
// Same contract as tranches #4/#5/#7/#8/#9/#10: DATA-ONLY additions that reuse
// FEDB slugs already shipped in exerciseDemos.ts (no new HTTP fetch). This block
// pins EVERY new tranche-#11 key explicitly AND cross-checks that the slug
// directory both frames point at is a real entry in the 873-slug FEDB catalogue
// fixture (__tests__/fixtures/fedb-catalog-slugs.json) — i.e. the demo will
// actually load, not 404. Each ships kind:'fedb_frames', verified:false. The
// block also asserts every key is unique across the WHOLE CURATED_DEMOS map,
// that getPendingHumanReviewIds() is UNCHANGED (no new YouTube ids), and that
// the CURATED_DEMOS count grew by exactly the tranche size.
describe('CURATED_DEMOS — FEDB-backed tranche #11 (data-only additions)', () => {
  // The COMPLETE set of display-name keys added in tranche #11 of curatedDemos.ts
  // (every key is asserted, not just a representative slice).
  const TRANCHE_11_NAMES = [
    // Machines / cable isolation
    'Ab Crunch Machine',
    'Calf-Machine Shoulder Shrug',
    'Cable Internal Rotation',
    'Cable Seated Crunch',
    'Cable Iron Cross',
    // Barbell / Smith variants
    'Barbell Guillotine Bench Press',
    'Barbell Incline Shoulder Raise',
    'Barbell Shrug Behind The Back',
    'Bradford Rocky Presses',
    'Bent Press',
    // Dumbbell / pulley variants
    'Bent Over Two-Dumbbell Row With Palms In',
    'Bent Over Low-Pulley Side Lateral',
    'Car Drivers',
    // Bodyweight / core
    'Bent-Knee Hip Raise',
    'Body Tricep Press',
    'Bodyweight Mid Row',
    'Bodyweight Flyes',
    'Butt Lift Bridge',
    'Ab Roller',
    'Barbell Rollout from Bench',
    // Conditioning / plyo
    'Bench Jump',
    'Bench Sprint',
    'Box Skip',
    'Catch and Overhead Throw',
    // Strongman
    'Atlas Stone Trainer',
    'Axle Deadlift',
    'Car Deadlift',
  ] as const;

  // Per-frame shape with the slug dir captured (group 1) and frame index (group 2).
  const FEDB_FRAME_RE =
    /^https:\/\/raw\.githubusercontent\.com\/yuhonas\/free-exercise-db\/main\/exercises\/([^/]+)\/([01])\.jpg$/;

  // The authoritative 873-slug FEDB catalogue fixture — every tranche-#11 slug
  // MUST be present here (and therefore in FEDB_SLUGS, the same set), so the
  // frame URLs resolve to real images.
  const CATALOG_SLUGS: ReadonlySet<string> = (() => {
    const fixturePath = path.resolve(__dirname, '../fixtures/fedb-catalog-slugs.json');
    const raw = fs.readFileSync(fixturePath, 'utf8');
    const parsed = JSON.parse(raw) as Array<{ slug: string }>;
    expect(Array.isArray(parsed)).toBe(true);
    return new Set(parsed.map((e) => e.slug));
  })();

  test('the catalogue fixture loaded a healthy set of slugs', () => {
    // Sanity: guards against a refactor that empties the fixture and makes the
    // membership checks below vacuously pass.
    expect(CATALOG_SLUGS.size).toBeGreaterThanOrEqual(800);
  });

  test('tranche #11 adds at least 20 new entries (the work item floor)', () => {
    expect(TRANCHE_11_NAMES.length).toBeGreaterThanOrEqual(20);
  });

  test('every tranche-#11 key is a NEW distinct CURATED_DEMOS entry (unique across the whole map)', () => {
    // The tranche is internally distinct…
    expect(new Set(TRANCHE_11_NAMES).size).toBe(TRANCHE_11_NAMES.length);
    // …and every name actually resolved into the frozen map (none dropped by the
    // never-overwrite precedence rule because of a stale collision).
    for (const name of TRANCHE_11_NAMES) {
      expect(Object.prototype.hasOwnProperty.call(CURATED_DEMOS, name)).toBe(true);
    }
    // Each tranche-#11 key appears EXACTLY once among the map's keys — i.e. it is
    // unique across the entire CURATED_DEMOS map, not just within the tranche.
    const allKeys = Object.keys(CURATED_DEMOS);
    for (const name of TRANCHE_11_NAMES) {
      expect(allKeys.filter((k) => k === name).length).toBe(1);
    }
  });

  test.each(TRANCHE_11_NAMES)('getCuratedDemo(%j) is a verified:false kind:"fedb_frames" entry', (name) => {
    const demo = getCuratedDemo(name);
    expect(demo).not.toBeNull();
    expect(demo!.kind).toBe('fedb_frames');
    expect(demo!.verified).toBe(false);
    expect(demo!.url).toMatch(FEDB_FRAME_PAIR_RE);
  });

  test.each(TRANCHE_11_NAMES)(
    'getCuratedDemoFrames(%j) is an ordered 2-element HTTPS [0.jpg, 1.jpg] pair on a real catalogue slug',
    (name) => {
      const frames = getCuratedDemoFrames(name);
      expect(frames).not.toBeNull();
      expect(frames!.length).toBe(2);

      const m0 = FEDB_FRAME_RE.exec(frames![0]!);
      const m1 = FEDB_FRAME_RE.exec(frames![1]!);
      expect(m0).not.toBeNull();
      expect(m1).not.toBeNull();
      // Both HTTPS (ATS-safe).
      expect(frames![0]!.startsWith('https://')).toBe(true);
      expect(frames![1]!.startsWith('https://')).toBe(true);
      // Ordered start (0) → end (1).
      expect(m0![2]).toBe('0');
      expect(m1![2]).toBe('1');
      // A genuine start/end pair: both frames share ONE slug directory…
      expect(m0![1]).toBe(m1![1]);
      // …and that slug is a real entry in the shipped FEDB catalogue (so the
      // demo loads rather than 404s).
      expect(CATALOG_SLUGS.has(m0![1]!)).toBe(true);
    },
  );

  test.each(TRANCHE_11_NAMES)('getCuratedDemoVerified(%j) === false (renders the "Unreviewed" chip)', (name) => {
    expect(getCuratedDemoVerified(name)).toBe(false);
  });

  test('no tranche-#11 name is a YouTube/gif entry (each is a pure fedb_frames addition)', () => {
    for (const name of TRANCHE_11_NAMES) {
      const demo = getCuratedDemo(name);
      expect(demo).not.toBeNull();
      // Never silently landed on a grandfathered YouTube key or a gif alias.
      expect(demo!.kind).toBe('fedb_frames');
      expect(getCuratedDemoFrames(name)).not.toBeNull();
    }
  });

  test('tranche #11 leaves getPendingHumanReviewIds() unchanged (no new YouTube ids)', () => {
    // tranche #11 is fedb_frames-only, so the human-review YouTube id set must be
    // exactly the on-disk mirror — none of the new names contribute a YouTube id.
    const ids = getPendingHumanReviewIds();
    const pendingJsonPath = path.resolve(__dirname, '../../src/constants/pendingHumanReviewIds.json');
    const mirror = JSON.parse(fs.readFileSync(pendingJsonPath, 'utf8')) as string[];
    expect([...ids].sort()).toEqual([...mirror].sort());
    // And not one tranche-#11 name resolves to a youtube kind (belt + braces).
    for (const name of TRANCHE_11_NAMES) {
      expect(getCuratedDemo(name)!.kind).not.toBe('youtube');
    }
  });

  test('CURATED_DEMOS count grew by exactly the tranche-#11 size over the pre-#11 baseline', () => {
    // The pre-#11 map = everything EXCEPT the tranche-#11 keys. Removing them must
    // drop the count by exactly TRANCHE_11_NAMES.length, proving the tranche added
    // that many brand-new entries (no silent collisions / drops).
    const all = Object.keys(CURATED_DEMOS);
    const tranche11 = new Set<string>(TRANCHE_11_NAMES);
    const withoutTranche11 = all.filter((k) => !tranche11.has(k));
    expect(all.length - withoutTranche11.length).toBe(TRANCHE_11_NAMES.length);
    // Every tranche-#11 key was genuinely present to be removed (no typo'd key
    // that silently never existed in the map).
    expect(all.length - withoutTranche11.length).toBe(tranche11.size);
  });
});

// ---------------------------------------------------------------------------
// (o) The "tranche #12" FEDB-backed additions resolve to a real catalogue slug
// ---------------------------------------------------------------------------
//
// Same contract as tranches #4/#5/#7/#8/#9/#10/#11: DATA-ONLY additions that reuse
// FEDB slugs already shipped in exerciseDemos.ts (no new HTTP fetch). This block
// pins EVERY new tranche-#12 key explicitly AND cross-checks that the slug
// directory both frames point at is a real entry in the 873-slug FEDB catalogue
// fixture (__tests__/fixtures/fedb-catalog-slugs.json) — i.e. the demo will
// actually load, not 404. Each ships kind:'fedb_frames', verified:false. The
// block also asserts every key is unique across the WHOLE CURATED_DEMOS map,
// that getPendingHumanReviewIds() is UNCHANGED (no new YouTube ids), and that
// the CURATED_DEMOS count grew by exactly the tranche size.
describe('CURATED_DEMOS — FEDB-backed tranche #12 (data-only additions)', () => {
  // The COMPLETE set of display-name keys added in tranche #12 of curatedDemos.ts
  // (every key is asserted, not just a representative slice).
  const TRANCHE_12_NAMES = [
    // Chest / push-up variants
    'Reverse Band Bench Press',
    'Clock Push-Up',
    'Close-Grip Push-Up off of a Dumbbell',
    'Push-Ups - Close Triceps Position',
    // Back / rows / vertical pulls
    'Alternating Renegade Row',
    'Alternating Kettlebell Row',
    'Kneeling Single-Arm High Pulley Row',
    'Mixed Grip Chin',
    'Band Assisted Pull-Up',
    'Band Pull Apart',
    // Shoulders / delts / traps
    'One-Arm Incline Lateral Raise',
    'Dumbbell Lying One-Arm Rear Lateral Raise',
    'Leverage Shrug',
    'Clean Shrug',
    // Biceps
    'Finger Curls',
    'Incline Inner Biceps Curl',
    'Standing One-Arm Dumbbell Curl Over Incline Bench',
    // Triceps
    'Band Skull Crusher',
    'One Arm Pronated Dumbbell Triceps Extension',
    'One Arm Supinated Dumbbell Triceps Extension',
    // Legs / squats / posterior chain / glutes
    'Barbell Squat To A Bench',
    'Front Barbell Squat To A Bench',
    'One-Legged Cable Kickback',
    'Kettlebell One-Legged Deadlift',
    // Core / obliques
    'Dumbbell Side Bend',
    'Rope Crunch',
    'Plate Twist',
    'Side Jackknife',
  ] as const;

  // Per-frame shape with the slug dir captured (group 1) and frame index (group 2).
  const FEDB_FRAME_RE =
    /^https:\/\/raw\.githubusercontent\.com\/yuhonas\/free-exercise-db\/main\/exercises\/([^/]+)\/([01])\.jpg$/;

  // The authoritative 873-slug FEDB catalogue fixture — every tranche-#12 slug
  // MUST be present here (and therefore in FEDB_SLUGS, the same set), so the
  // frame URLs resolve to real images.
  const CATALOG_SLUGS: ReadonlySet<string> = (() => {
    const fixturePath = path.resolve(__dirname, '../fixtures/fedb-catalog-slugs.json');
    const raw = fs.readFileSync(fixturePath, 'utf8');
    const parsed = JSON.parse(raw) as Array<{ slug: string }>;
    expect(Array.isArray(parsed)).toBe(true);
    return new Set(parsed.map((e) => e.slug));
  })();

  test('the catalogue fixture loaded a healthy set of slugs', () => {
    // Sanity: guards against a refactor that empties the fixture and makes the
    // membership checks below vacuously pass.
    expect(CATALOG_SLUGS.size).toBeGreaterThanOrEqual(800);
  });

  test('every tranche-#12 key is a NEW distinct CURATED_DEMOS entry (unique across the whole map)', () => {
    // The tranche is internally distinct…
    expect(new Set(TRANCHE_12_NAMES).size).toBe(TRANCHE_12_NAMES.length);
    // …and every name actually resolved into the frozen map (none dropped by the
    // never-overwrite precedence rule because of a stale collision).
    for (const name of TRANCHE_12_NAMES) {
      expect(Object.prototype.hasOwnProperty.call(CURATED_DEMOS, name)).toBe(true);
    }
    // Each tranche-#12 key appears EXACTLY once among the map's keys — i.e. it is
    // unique across the entire CURATED_DEMOS map, not just within the tranche.
    const allKeys = Object.keys(CURATED_DEMOS);
    for (const name of TRANCHE_12_NAMES) {
      expect(allKeys.filter((k) => k === name).length).toBe(1);
    }
  });

  test.each(TRANCHE_12_NAMES)('getCuratedDemo(%j) is a verified:false kind:"fedb_frames" entry', (name) => {
    const demo = getCuratedDemo(name);
    expect(demo).not.toBeNull();
    expect(demo!.kind).toBe('fedb_frames');
    expect(demo!.verified).toBe(false);
    expect(demo!.url).toMatch(FEDB_FRAME_PAIR_RE);
  });

  test.each(TRANCHE_12_NAMES)(
    'getCuratedDemoFrames(%j) is an ordered 2-element HTTPS [0.jpg, 1.jpg] pair on a real catalogue slug',
    (name) => {
      const frames = getCuratedDemoFrames(name);
      expect(frames).not.toBeNull();
      expect(frames!.length).toBe(2);

      const m0 = FEDB_FRAME_RE.exec(frames![0]!);
      const m1 = FEDB_FRAME_RE.exec(frames![1]!);
      expect(m0).not.toBeNull();
      expect(m1).not.toBeNull();
      // Both HTTPS (ATS-safe).
      expect(frames![0]!.startsWith('https://')).toBe(true);
      expect(frames![1]!.startsWith('https://')).toBe(true);
      // Ordered start (0) → end (1).
      expect(m0![2]).toBe('0');
      expect(m1![2]).toBe('1');
      // A genuine start/end pair: both frames share ONE slug directory…
      expect(m0![1]).toBe(m1![1]);
      // …and that slug is a real entry in the shipped FEDB catalogue (so the
      // demo loads rather than 404s).
      expect(CATALOG_SLUGS.has(m0![1]!)).toBe(true);
    },
  );

  test.each(TRANCHE_12_NAMES)('getCuratedDemoVerified(%j) === false (renders the "Unreviewed" chip)', (name) => {
    expect(getCuratedDemoVerified(name)).toBe(false);
  });

  test('no tranche-#12 name is a YouTube/gif entry (each is a pure fedb_frames addition)', () => {
    for (const name of TRANCHE_12_NAMES) {
      const demo = getCuratedDemo(name);
      expect(demo).not.toBeNull();
      // Never silently landed on a grandfathered YouTube key or a gif alias.
      expect(demo!.kind).toBe('fedb_frames');
      expect(getCuratedDemoFrames(name)).not.toBeNull();
    }
  });

  test('tranche #12 leaves getPendingHumanReviewIds() unchanged (no new YouTube ids)', () => {
    // tranche #12 is fedb_frames-only, so the human-review YouTube id set must be
    // exactly the on-disk mirror — none of the new names contribute a YouTube id.
    const ids = getPendingHumanReviewIds();
    const pendingJsonPath = path.resolve(__dirname, '../../src/constants/pendingHumanReviewIds.json');
    const mirror = JSON.parse(fs.readFileSync(pendingJsonPath, 'utf8')) as string[];
    expect([...ids].sort()).toEqual([...mirror].sort());
    // And not one tranche-#12 name resolves to a youtube kind (belt + braces).
    for (const name of TRANCHE_12_NAMES) {
      expect(getCuratedDemo(name)!.kind).not.toBe('youtube');
    }
  });

  test('CURATED_DEMOS count grew by exactly the tranche-#12 size over the pre-#12 baseline', () => {
    // The pre-#12 map = everything EXCEPT the tranche-#12 keys. Removing them must
    // drop the count by exactly TRANCHE_12_NAMES.length, proving the tranche added
    // that many brand-new entries (no silent collisions / drops).
    const all = Object.keys(CURATED_DEMOS);
    const tranche12 = new Set<string>(TRANCHE_12_NAMES);
    const withoutTranche12 = all.filter((k) => !tranche12.has(k));
    expect(all.length - withoutTranche12.length).toBe(TRANCHE_12_NAMES.length);
    // Every tranche-#12 key was genuinely present to be removed (no typo'd key
    // that silently never existed in the map).
    expect(all.length - withoutTranche12.length).toBe(tranche12.size);
  });
});

// ---------------------------------------------------------------------------
// (p) The "tranche #13" FEDB-backed additions resolve to a real catalogue slug
// ---------------------------------------------------------------------------
//
// Same contract as tranches #4/#5/#7/#8/#9/#10/#11/#12: DATA-ONLY additions that
// reuse FEDB slugs already shipped in exerciseDemos.ts (no new HTTP fetch). This
// block pins EVERY new tranche-#13 key explicitly AND cross-checks that the slug
// directory both frames point at is a real entry in the 873-slug FEDB catalogue
// fixture (__tests__/fixtures/fedb-catalog-slugs.json) — i.e. the demo will
// actually load, not 404. Each ships kind:'fedb_frames', verified:false. The
// block also asserts every key is unique across the WHOLE CURATED_DEMOS map,
// that getPendingHumanReviewIds() is UNCHANGED (no new YouTube ids), and that
// the CURATED_DEMOS count grew by exactly the tranche size.
describe('CURATED_DEMOS — FEDB-backed tranche #13 (data-only additions)', () => {
  // The COMPLETE set of display-name keys added in tranche #13 of curatedDemos.ts
  // (every key is asserted, not just a representative slice).
  const TRANCHE_13_NAMES = [
    // Olympic / power — clean & snatch family
    'Clean',
    'Snatch',
    'Clean Pull',
    'Snatch Pull',
    'Muscle Snatch',
    'Power Jerk',
    'Split Jerk',
    'Split Clean',
    'Snatch Balance',
    // Strongman / loaded carries
    'Log Lift',
    'Tire Flip',
    'Yoke Walk',
    'Sled Push',
    'Sled Row',
    'Keg Load',
    // Plyometric / conditioning
    'Knee Tuck Jump',
    'Star Jump',
    'Rocket Jump',
    'Standing Long Jump',
    'Lateral Box Jump',
    // Triceps / forearms isolation
    'Standing Bent-Over Two-Arm Dumbbell Triceps Extension',
    'Seated Dumbbell Palms-Up Wrist Curl',
    // Core / abs
    'Scissor Kick',
    'Stomach Vacuum',
  ] as const;

  // Per-frame shape with the slug dir captured (group 1) and frame index (group 2).
  const FEDB_FRAME_RE =
    /^https:\/\/raw\.githubusercontent\.com\/yuhonas\/free-exercise-db\/main\/exercises\/([^/]+)\/([01])\.jpg$/;

  // The authoritative 873-slug FEDB catalogue fixture — every tranche-#13 slug
  // MUST be present here (and therefore in FEDB_SLUGS, the same set), so the
  // frame URLs resolve to real images.
  const CATALOG_SLUGS: ReadonlySet<string> = (() => {
    const fixturePath = path.resolve(__dirname, '../fixtures/fedb-catalog-slugs.json');
    const raw = fs.readFileSync(fixturePath, 'utf8');
    const parsed = JSON.parse(raw) as Array<{ slug: string }>;
    expect(Array.isArray(parsed)).toBe(true);
    return new Set(parsed.map((e) => e.slug));
  })();

  test('the catalogue fixture loaded a healthy set of slugs', () => {
    // Sanity: guards against a refactor that empties the fixture and makes the
    // membership checks below vacuously pass.
    expect(CATALOG_SLUGS.size).toBeGreaterThanOrEqual(800);
  });

  test('tranche #13 adds at least 20 new entries (the work item floor)', () => {
    expect(TRANCHE_13_NAMES.length).toBeGreaterThanOrEqual(20);
  });

  test('every tranche-#13 key is a NEW distinct CURATED_DEMOS entry (unique across the whole map)', () => {
    // The tranche is internally distinct…
    expect(new Set(TRANCHE_13_NAMES).size).toBe(TRANCHE_13_NAMES.length);
    // …and every name actually resolved into the frozen map (none dropped by the
    // never-overwrite precedence rule because of a stale collision).
    for (const name of TRANCHE_13_NAMES) {
      expect(Object.prototype.hasOwnProperty.call(CURATED_DEMOS, name)).toBe(true);
    }
    // Each tranche-#13 key appears EXACTLY once among the map's keys — i.e. it is
    // unique across the entire CURATED_DEMOS map, not just within the tranche.
    const allKeys = Object.keys(CURATED_DEMOS);
    for (const name of TRANCHE_13_NAMES) {
      expect(allKeys.filter((k) => k === name).length).toBe(1);
    }
  });

  test.each(TRANCHE_13_NAMES)('getCuratedDemo(%j) is a verified:false kind:"fedb_frames" entry', (name) => {
    const demo = getCuratedDemo(name);
    expect(demo).not.toBeNull();
    expect(demo!.kind).toBe('fedb_frames');
    expect(demo!.verified).toBe(false);
    expect(demo!.url).toMatch(FEDB_FRAME_PAIR_RE);
  });

  test.each(TRANCHE_13_NAMES)(
    'getCuratedDemoFrames(%j) is an ordered 2-element HTTPS [0.jpg, 1.jpg] pair on a real catalogue slug',
    (name) => {
      const frames = getCuratedDemoFrames(name);
      expect(frames).not.toBeNull();
      expect(frames!.length).toBe(2);

      const m0 = FEDB_FRAME_RE.exec(frames![0]!);
      const m1 = FEDB_FRAME_RE.exec(frames![1]!);
      expect(m0).not.toBeNull();
      expect(m1).not.toBeNull();
      // Both HTTPS (ATS-safe).
      expect(frames![0]!.startsWith('https://')).toBe(true);
      expect(frames![1]!.startsWith('https://')).toBe(true);
      // Ordered start (0) → end (1).
      expect(m0![2]).toBe('0');
      expect(m1![2]).toBe('1');
      // A genuine start/end pair: both frames share ONE slug directory…
      expect(m0![1]).toBe(m1![1]);
      // …and that slug is a real entry in the shipped FEDB catalogue (so the
      // demo loads rather than 404s).
      expect(CATALOG_SLUGS.has(m0![1]!)).toBe(true);
    },
  );

  test.each(TRANCHE_13_NAMES)('getCuratedDemoVerified(%j) === false (renders the "Unreviewed" chip)', (name) => {
    expect(getCuratedDemoVerified(name)).toBe(false);
  });

  test('resolution is case-insensitive / whitespace-trimmed for the new tranche', () => {
    expect(getCuratedDemo('  snatch BALANCE ')).toEqual(getCuratedDemo('Snatch Balance'));
  });

  test('no tranche-#13 name is a YouTube/gif entry (each is a pure fedb_frames addition)', () => {
    for (const name of TRANCHE_13_NAMES) {
      const demo = getCuratedDemo(name);
      expect(demo).not.toBeNull();
      // Never silently landed on a grandfathered YouTube key or a gif alias.
      expect(demo!.kind).toBe('fedb_frames');
      expect(getCuratedDemoFrames(name)).not.toBeNull();
    }
  });

  test('tranche #13 leaves getPendingHumanReviewIds() unchanged (no new YouTube ids)', () => {
    // tranche #13 is fedb_frames-only, so the human-review YouTube id set must be
    // exactly the on-disk mirror — none of the new names contribute a YouTube id.
    const ids = getPendingHumanReviewIds();
    const pendingJsonPath = path.resolve(__dirname, '../../src/constants/pendingHumanReviewIds.json');
    const mirror = JSON.parse(fs.readFileSync(pendingJsonPath, 'utf8')) as string[];
    expect([...ids].sort()).toEqual([...mirror].sort());
    // And not one tranche-#13 name resolves to a youtube kind (belt + braces).
    for (const name of TRANCHE_13_NAMES) {
      expect(getCuratedDemo(name)!.kind).not.toBe('youtube');
    }
  });

  test('CURATED_DEMOS count grew by exactly the tranche-#13 size over the pre-#13 baseline', () => {
    // The pre-#13 map = everything EXCEPT the tranche-#13 keys. Removing them must
    // drop the count by exactly TRANCHE_13_NAMES.length, proving the tranche added
    // that many brand-new entries (no silent collisions / drops).
    const all = Object.keys(CURATED_DEMOS);
    const tranche13 = new Set<string>(TRANCHE_13_NAMES);
    const withoutTranche13 = all.filter((k) => !tranche13.has(k));
    expect(all.length - withoutTranche13.length).toBe(TRANCHE_13_NAMES.length);
    // Every tranche-#13 key was genuinely present to be removed (no typo'd key
    // that silently never existed in the map).
    expect(all.length - withoutTranche13.length).toBe(tranche13.size);
  });

  test('tranche #13 adds ONLY verified:false fedb_frames — no verified flag was flipped', () => {
    // Belt + braces against the "DATA-ONLY, no flips" acceptance: the verified:true
    // population is exactly the 35 grandfathered DEMO_FALLBACK YouTube videos (the
    // GRANDFATHERED block — including its already-verified marquee compounds — is
    // the ONLY source of verified:true entries; every other tranche ships
    // verified:false). Adding a fedb_frames tranche must NOT change that count, and
    // every verified:true entry must still be a YouTube one (no fedb_frames/gif was
    // silently promoted). The count is derived from DEMO_FALLBACK (asserted === 35
    // elsewhere) rather than hard-coded, so it tracks the grandfather set exactly.
    const verifiedTrue = CURATED_ENTRIES.filter(([, d]) => d.verified);
    expect(verifiedTrue.length).toBe(Object.keys(DEMO_FALLBACK).length);
    for (const [, demo] of verifiedTrue) {
      expect(demo.kind).toBe('youtube');
    }
    // The 35 grandfathered DEMO_FALLBACK names specifically stay verified:true with
    // their original URL (no silent demotion to verified:false, no URL change).
    for (const name of Object.keys(DEMO_FALLBACK)) {
      const demo = getCuratedDemo(name);
      expect(demo).not.toBeNull();
      expect(demo!.kind).toBe('youtube');
      expect(demo!.verified).toBe(true);
      expect(demo!.url).toBe(DEMO_FALLBACK[name]);
    }
  });
});

// ---------------------------------------------------------------------------
// (q) The "tranche #14" FEDB-backed additions resolve to a real catalogue slug
// ---------------------------------------------------------------------------
//
// Same contract as tranches #4/#5/#7/#8/#9/#10/#11/#12/#13: DATA-ONLY additions
// that reuse FEDB slugs already shipped in exerciseDemos.ts (no new HTTP fetch).
// This block pins EVERY new tranche-#14 key explicitly AND cross-checks that the
// slug directory both frames point at is a real entry in the 873-slug FEDB
// catalogue fixture (__tests__/fixtures/fedb-catalog-slugs.json) — i.e. the demo
// will actually load, not 404. Each ships kind:'fedb_frames', verified:false. The
// block also asserts every key is unique across the WHOLE CURATED_DEMOS map, that
// getPendingHumanReviewIds() is UNCHANGED (no new YouTube ids) in BOTH directions
// against the on-disk pendingHumanReviewIds.json mirror, and that the
// CURATED_DEMOS count grew by exactly the tranche size.
describe('CURATED_DEMOS — FEDB-backed tranche #14 (data-only additions)', () => {
  // The COMPLETE set of display-name keys added in tranche #14 of curatedDemos.ts
  // (every key is asserted, not just a representative slice).
  const TRANCHE_14_NAMES = [
    // Mobility / stretch staples
    'Hamstring Stretch',
    'Quad Stretch',
    'All Fours Quad Stretch',
    'Kneeling Hip Flexor',
    'Middle Back Stretch',
    'Chin To Chest Stretch',
    'Behind Head Chest Stretch',
    'Dynamic Chest Stretch',
    // Neck
    'Isometric Neck Exercise - Front And Back',
    'Isometric Neck Exercise - Sides',
    'Seated Head Harness Neck Resistance',
    // Forearm / wrist
    'Palms-Down Dumbbell Wrist Curl Over A Bench',
    'Palms-Up Dumbbell Wrist Curl Over A Bench',
    'Seated Palm-Up Barbell Wrist Curl',
    'Seated Palms-Down Barbell Wrist Curl',
    'Wrist Circles',
    // Lower-leg / calf / tibialis / ankle
    'Ankle Circles',
    'Smith Machine Reverse Calf Raises',
    'Seated Leg Tucks',
    // Glutes / hip accessory (band)
    'Hip Extension with Bands',
    'Thigh Abductor',
    'Band Hip Adductions',
  ] as const;

  // Per-frame shape with the slug dir captured (group 1) and frame index (group 2).
  const FEDB_FRAME_RE =
    /^https:\/\/raw\.githubusercontent\.com\/yuhonas\/free-exercise-db\/main\/exercises\/([^/]+)\/([01])\.jpg$/;

  // The authoritative 873-slug FEDB catalogue fixture — every tranche-#14 slug
  // MUST be present here (and therefore in FEDB_SLUGS, the same set), so the
  // frame URLs resolve to real images.
  const CATALOG_SLUGS: ReadonlySet<string> = (() => {
    const fixturePath = path.resolve(__dirname, '../fixtures/fedb-catalog-slugs.json');
    const raw = fs.readFileSync(fixturePath, 'utf8');
    const parsed = JSON.parse(raw) as Array<{ slug: string }>;
    expect(Array.isArray(parsed)).toBe(true);
    return new Set(parsed.map((e) => e.slug));
  })();

  test('the catalogue fixture loaded a healthy set of slugs', () => {
    // Sanity: guards against a refactor that empties the fixture and makes the
    // membership checks below vacuously pass.
    expect(CATALOG_SLUGS.size).toBeGreaterThanOrEqual(800);
  });

  test('tranche #14 adds at least 18 new entries (the work item floor)', () => {
    expect(TRANCHE_14_NAMES.length).toBeGreaterThanOrEqual(18);
  });

  test('every tranche-#14 key is a NEW distinct CURATED_DEMOS entry (unique across the whole map)', () => {
    // The tranche is internally distinct…
    expect(new Set(TRANCHE_14_NAMES).size).toBe(TRANCHE_14_NAMES.length);
    // …and every name actually resolved into the frozen map (none dropped by the
    // never-overwrite precedence rule because of a stale collision).
    for (const name of TRANCHE_14_NAMES) {
      expect(Object.prototype.hasOwnProperty.call(CURATED_DEMOS, name)).toBe(true);
    }
    // Each tranche-#14 key appears EXACTLY once among the map's keys — i.e. it is
    // unique across the entire CURATED_DEMOS map, not just within the tranche.
    const allKeys = Object.keys(CURATED_DEMOS);
    for (const name of TRANCHE_14_NAMES) {
      expect(allKeys.filter((k) => k === name).length).toBe(1);
    }
  });

  test.each(TRANCHE_14_NAMES)('getCuratedDemo(%j) is a verified:false kind:"fedb_frames" entry', (name) => {
    const demo = getCuratedDemo(name);
    expect(demo).not.toBeNull();
    expect(demo!.kind).toBe('fedb_frames');
    expect(demo!.verified).toBe(false);
    expect(demo!.url).toMatch(FEDB_FRAME_PAIR_RE);
  });

  test.each(TRANCHE_14_NAMES)(
    'getCuratedDemoFrames(%j) is an ordered 2-element HTTPS [0.jpg, 1.jpg] pair on a real catalogue slug',
    (name) => {
      const frames = getCuratedDemoFrames(name);
      expect(frames).not.toBeNull();
      expect(frames!.length).toBe(2);

      const m0 = FEDB_FRAME_RE.exec(frames![0]!);
      const m1 = FEDB_FRAME_RE.exec(frames![1]!);
      expect(m0).not.toBeNull();
      expect(m1).not.toBeNull();
      // Both HTTPS (ATS-safe).
      expect(frames![0]!.startsWith('https://')).toBe(true);
      expect(frames![1]!.startsWith('https://')).toBe(true);
      // Ordered start (0) → end (1).
      expect(m0![2]).toBe('0');
      expect(m1![2]).toBe('1');
      // A genuine start/end pair: both frames share ONE slug directory…
      expect(m0![1]).toBe(m1![1]);
      // …and that slug is a real entry in the shipped FEDB catalogue (so the
      // demo loads rather than 404s).
      expect(CATALOG_SLUGS.has(m0![1]!)).toBe(true);
    },
  );

  test.each(TRANCHE_14_NAMES)('getCuratedDemoVerified(%j) === false (renders the "Unreviewed" chip)', (name) => {
    expect(getCuratedDemoVerified(name)).toBe(false);
  });

  test('resolution is case-insensitive / whitespace-trimmed for the new tranche', () => {
    expect(getCuratedDemo('  hamstring STRETCH ')).toEqual(getCuratedDemo('Hamstring Stretch'));
  });

  test('no tranche-#14 name is a YouTube/gif entry (each is a pure fedb_frames addition)', () => {
    for (const name of TRANCHE_14_NAMES) {
      const demo = getCuratedDemo(name);
      expect(demo).not.toBeNull();
      // Never silently landed on a grandfathered YouTube key or a gif alias.
      expect(demo!.kind).toBe('fedb_frames');
      expect(getCuratedDemoFrames(name)).not.toBeNull();
    }
  });

  test('tranche #14 leaves getPendingHumanReviewIds() unchanged (no new YouTube ids), both directions', () => {
    // tranche #14 is fedb_frames-only, so the human-review YouTube id set must be
    // exactly the on-disk mirror — none of the new names contribute a YouTube id.
    // Assert set-equality in BOTH directions (nothing missing, no orphans).
    const ids = getPendingHumanReviewIds();
    const pendingJsonPath = path.resolve(__dirname, '../../src/constants/pendingHumanReviewIds.json');
    const mirror = JSON.parse(fs.readFileSync(pendingJsonPath, 'utf8')) as string[];
    const idSet = new Set(ids);
    const mirrorSet = new Set(mirror);
    const missingFromMirror = [...idSet].filter((id) => !mirrorSet.has(id));
    const orphansInMirror = [...mirrorSet].filter((id) => !idSet.has(id));
    expect({ missingFromMirror, orphansInMirror }).toEqual({ missingFromMirror: [], orphansInMirror: [] });
    expect([...ids].sort()).toEqual([...mirror].sort());
    // And not one tranche-#14 name resolves to a youtube kind (belt + braces).
    for (const name of TRANCHE_14_NAMES) {
      expect(getCuratedDemo(name)!.kind).not.toBe('youtube');
    }
  });

  test('CURATED_DEMOS count grew by exactly the tranche-#14 size over the pre-#14 baseline', () => {
    // The pre-#14 map = everything EXCEPT the tranche-#14 keys. Removing them must
    // drop the count by exactly TRANCHE_14_NAMES.length, proving the tranche added
    // that many brand-new entries (no silent collisions / drops).
    const all = Object.keys(CURATED_DEMOS);
    const tranche14 = new Set<string>(TRANCHE_14_NAMES);
    const withoutTranche14 = all.filter((k) => !tranche14.has(k));
    expect(all.length - withoutTranche14.length).toBe(TRANCHE_14_NAMES.length);
    // Every tranche-#14 key was genuinely present to be removed (no typo'd key
    // that silently never existed in the map).
    expect(all.length - withoutTranche14.length).toBe(tranche14.size);
  });

  test('tranche #14 adds ONLY verified:false fedb_frames — no verified flag was flipped', () => {
    // Belt + braces against the "DATA-ONLY, no flips" acceptance: the verified:true
    // population is exactly the GRANDFATHERED block, which is key-for-key the 35
    // DEMO_FALLBACK YouTube videos (the marquee compounds like "Goblet Squat" /
    // "Barbell Hip Thrust" live in DEMO_FALLBACK too). It is the ONLY source of
    // verified:true entries; every tranche — including this one — ships
    // verified:false. Adding a fedb_frames tranche must NOT change that count, and
    // every verified:true entry must still be a YouTube one (no fedb_frames/gif was
    // silently promoted). The count is derived from DEMO_FALLBACK (asserted === 35
    // elsewhere) rather than hard-coded, so it tracks the grandfather set exactly.
    const verifiedTrue = CURATED_ENTRIES.filter(([, d]) => d.verified);
    expect(verifiedTrue.length).toBe(Object.keys(DEMO_FALLBACK).length);
    for (const [, demo] of verifiedTrue) {
      expect(demo.kind).toBe('youtube');
    }
    // And the 35 grandfathered DEMO_FALLBACK names specifically stay verified:true
    // with their original URL (no silent demotion, no URL change).
    for (const name of Object.keys(DEMO_FALLBACK)) {
      const demo = getCuratedDemo(name);
      expect(demo).not.toBeNull();
      expect(demo!.kind).toBe('youtube');
      expect(demo!.verified).toBe(true);
      expect(demo!.url).toBe(DEMO_FALLBACK[name]);
    }
  });
});

// ---------------------------------------------------------------------------
// (r) The "tranche #15" FEDB-backed additions resolve to a real catalogue slug
// ---------------------------------------------------------------------------
//
// Same contract as tranches #4/#5/#7/#8/#9/#10/#11/#12/#13/#14: DATA-ONLY
// additions that reuse FEDB slugs already shipped in exerciseDemos.ts (no new
// HTTP fetch). This block pins EVERY new tranche-#15 key explicitly AND
// cross-checks that the slug directory both frames point at is a real entry in
// the 873-slug FEDB catalogue fixture (__tests__/fixtures/fedb-catalog-slugs.json)
// — i.e. the demo will actually load, not 404. Each ships kind:'fedb_frames',
// verified:false. The block also asserts every key is unique across the WHOLE
// CURATED_DEMOS map, that getPendingHumanReviewIds() is UNCHANGED (no new YouTube
// ids) in BOTH directions against the on-disk pendingHumanReviewIds.json mirror,
// and that the CURATED_DEMOS count grew by exactly the tranche size.
describe('CURATED_DEMOS — FEDB-backed tranche #15 (data-only additions)', () => {
  // The COMPLETE set of display-name keys added in tranche #15 of curatedDemos.ts
  // (every key is asserted, not just a representative slice).
  const TRANCHE_15_NAMES = [
    // Mobility / stretch staples (lower body)
    'Lying Hamstring Stretch',
    'Seated Hamstring Stretch',
    'Standing Toe Touches',
    'Runners Stretch',
    'On Your Back Quad Stretch',
    'Standing Elevated Quad Stretch',
    'Lying Glute Stretch',
    'Knee To Chest',
    'IT Band and Glute Stretch',
    'Standing Gastrocnemius Calf Stretch',
    // Mobility / stretch (upper body / spine)
    'Upper Back Stretch',
    'Side Neck Stretch',
    'Shoulder Stretch',
    'Triceps Stretch',
    'Standing Biceps Stretch',
    'Spinal Stretch',
    // Foam-roll / self-myofascial release (-SMR)
    'Hamstring SMR',
    'Quadriceps SMR',
    'Calves SMR',
    'Latissimus Dorsi SMR',
    // Band posterior-chain / shoulder accessory
    'Band Good Morning',
    'Hip Lift with Band',
    'External Rotation with Band',
    'Lateral Raise with Bands',
  ] as const;

  // Per-frame shape with the slug dir captured (group 1) and frame index (group 2).
  const FEDB_FRAME_RE =
    /^https:\/\/raw\.githubusercontent\.com\/yuhonas\/free-exercise-db\/main\/exercises\/([^/]+)\/([01])\.jpg$/;

  // The authoritative 873-slug FEDB catalogue fixture — every tranche-#15 slug
  // MUST be present here (and therefore in FEDB_SLUGS, the same set), so the
  // frame URLs resolve to real images.
  const CATALOG_SLUGS: ReadonlySet<string> = (() => {
    const fixturePath = path.resolve(__dirname, '../fixtures/fedb-catalog-slugs.json');
    const raw = fs.readFileSync(fixturePath, 'utf8');
    const parsed = JSON.parse(raw) as Array<{ slug: string }>;
    expect(Array.isArray(parsed)).toBe(true);
    return new Set(parsed.map((e) => e.slug));
  })();

  test('the catalogue fixture loaded a healthy set of slugs', () => {
    // Sanity: guards against a refactor that empties the fixture and makes the
    // membership checks below vacuously pass.
    expect(CATALOG_SLUGS.size).toBeGreaterThanOrEqual(800);
  });

  test('tranche #15 adds at least 18 new entries (the work item floor)', () => {
    expect(TRANCHE_15_NAMES.length).toBeGreaterThanOrEqual(18);
  });

  test('every tranche-#15 key is a NEW distinct CURATED_DEMOS entry (unique across the whole map)', () => {
    // The tranche is internally distinct…
    expect(new Set(TRANCHE_15_NAMES).size).toBe(TRANCHE_15_NAMES.length);
    // …and every name actually resolved into the frozen map (none dropped by the
    // never-overwrite precedence rule because of a stale collision).
    for (const name of TRANCHE_15_NAMES) {
      expect(Object.prototype.hasOwnProperty.call(CURATED_DEMOS, name)).toBe(true);
    }
    // Each tranche-#15 key appears EXACTLY once among the map's keys — i.e. it is
    // unique across the entire CURATED_DEMOS map, not just within the tranche.
    const allKeys = Object.keys(CURATED_DEMOS);
    for (const name of TRANCHE_15_NAMES) {
      expect(allKeys.filter((k) => k === name).length).toBe(1);
    }
  });

  test.each(TRANCHE_15_NAMES)('getCuratedDemo(%j) is a verified:false kind:"fedb_frames" entry', (name) => {
    const demo = getCuratedDemo(name);
    expect(demo).not.toBeNull();
    expect(demo!.kind).toBe('fedb_frames');
    expect(demo!.verified).toBe(false);
    expect(demo!.url).toMatch(FEDB_FRAME_PAIR_RE);
  });

  test.each(TRANCHE_15_NAMES)(
    'getCuratedDemoFrames(%j) is an ordered 2-element HTTPS [0.jpg, 1.jpg] pair on a real catalogue slug',
    (name) => {
      const frames = getCuratedDemoFrames(name);
      expect(frames).not.toBeNull();
      expect(frames!.length).toBe(2);

      const m0 = FEDB_FRAME_RE.exec(frames![0]!);
      const m1 = FEDB_FRAME_RE.exec(frames![1]!);
      expect(m0).not.toBeNull();
      expect(m1).not.toBeNull();
      // Both HTTPS (ATS-safe).
      expect(frames![0]!.startsWith('https://')).toBe(true);
      expect(frames![1]!.startsWith('https://')).toBe(true);
      // Ordered start (0) → end (1).
      expect(m0![2]).toBe('0');
      expect(m1![2]).toBe('1');
      // A genuine start/end pair: both frames share ONE slug directory…
      expect(m0![1]).toBe(m1![1]);
      // …and that slug is a real entry in the shipped FEDB catalogue (so the
      // demo loads rather than 404s).
      expect(CATALOG_SLUGS.has(m0![1]!)).toBe(true);
    },
  );

  test.each(TRANCHE_15_NAMES)('getCuratedDemoVerified(%j) === false (renders the "Unreviewed" chip)', (name) => {
    expect(getCuratedDemoVerified(name)).toBe(false);
  });

  test('resolution is case-insensitive / whitespace-trimmed for the new tranche', () => {
    expect(getCuratedDemo('  lying HAMSTRING stretch ')).toEqual(getCuratedDemo('Lying Hamstring Stretch'));
  });

  test('no tranche-#15 name is a YouTube/gif entry (each is a pure fedb_frames addition)', () => {
    for (const name of TRANCHE_15_NAMES) {
      const demo = getCuratedDemo(name);
      expect(demo).not.toBeNull();
      // Never silently landed on a grandfathered YouTube key or a gif alias.
      expect(demo!.kind).toBe('fedb_frames');
      expect(getCuratedDemoFrames(name)).not.toBeNull();
    }
  });

  test('tranche #15 leaves getPendingHumanReviewIds() unchanged (no new YouTube ids), both directions', () => {
    // tranche #15 is fedb_frames-only, so the human-review YouTube id set must be
    // exactly the on-disk mirror — none of the new names contribute a YouTube id.
    // Assert set-equality in BOTH directions (nothing missing, no orphans).
    const ids = getPendingHumanReviewIds();
    const pendingJsonPath = path.resolve(__dirname, '../../src/constants/pendingHumanReviewIds.json');
    const mirror = JSON.parse(fs.readFileSync(pendingJsonPath, 'utf8')) as string[];
    const idSet = new Set(ids);
    const mirrorSet = new Set(mirror);
    const missingFromMirror = [...idSet].filter((id) => !mirrorSet.has(id));
    const orphansInMirror = [...mirrorSet].filter((id) => !idSet.has(id));
    expect({ missingFromMirror, orphansInMirror }).toEqual({ missingFromMirror: [], orphansInMirror: [] });
    expect([...ids].sort()).toEqual([...mirror].sort());
    // And not one tranche-#15 name resolves to a youtube kind (belt + braces).
    for (const name of TRANCHE_15_NAMES) {
      expect(getCuratedDemo(name)!.kind).not.toBe('youtube');
    }
  });

  test('CURATED_DEMOS count grew by exactly the tranche-#15 size over the pre-#15 baseline', () => {
    // The pre-#15 map = everything EXCEPT the tranche-#15 keys. Removing them must
    // drop the count by exactly TRANCHE_15_NAMES.length, proving the tranche added
    // that many brand-new entries (no silent collisions / drops).
    const all = Object.keys(CURATED_DEMOS);
    const tranche15 = new Set<string>(TRANCHE_15_NAMES);
    const withoutTranche15 = all.filter((k) => !tranche15.has(k));
    expect(all.length - withoutTranche15.length).toBe(TRANCHE_15_NAMES.length);
    // Every tranche-#15 key was genuinely present to be removed (no typo'd key
    // that silently never existed in the map).
    expect(all.length - withoutTranche15.length).toBe(tranche15.size);
  });

  test('tranche #15 adds ONLY verified:false fedb_frames — no verified flag was flipped', () => {
    // Belt + braces against the "DATA-ONLY, no flips" acceptance: the verified:true
    // population is exactly the GRANDFATHERED block, which is key-for-key the 35
    // DEMO_FALLBACK YouTube videos. It is the ONLY source of verified:true entries;
    // every tranche — including this one — ships verified:false. Adding a fedb_frames
    // tranche must NOT change that count, and every verified:true entry must still be
    // a YouTube one (no fedb_frames/gif was silently promoted). The count is derived
    // from DEMO_FALLBACK (asserted === 35 elsewhere) rather than hard-coded, so it
    // tracks the grandfather set exactly.
    const verifiedTrue = CURATED_ENTRIES.filter(([, d]) => d.verified);
    expect(verifiedTrue.length).toBe(Object.keys(DEMO_FALLBACK).length);
    for (const [, demo] of verifiedTrue) {
      expect(demo.kind).toBe('youtube');
    }
    // And the 35 grandfathered DEMO_FALLBACK names specifically stay verified:true
    // with their original URL (no silent demotion, no URL change).
    for (const name of Object.keys(DEMO_FALLBACK)) {
      const demo = getCuratedDemo(name);
      expect(demo).not.toBeNull();
      expect(demo!.kind).toBe('youtube');
      expect(demo!.verified).toBe(true);
      expect(demo!.url).toBe(DEMO_FALLBACK[name]);
    }
  });
});

// ---------------------------------------------------------------------------
// (s) The "tranche #16" FEDB-backed additions resolve to a real catalogue slug
// ---------------------------------------------------------------------------
//
// Same contract as tranches #4/#5/#7/#8/#9/#10/#11/#12/#13/#14/#15: DATA-ONLY
// additions that reuse FEDB slugs already shipped in exerciseDemos.ts (no new
// HTTP fetch). This block pins EVERY new tranche-#16 key explicitly AND
// cross-checks that the slug directory both frames point at is a real entry in
// the 873-slug FEDB catalogue fixture (__tests__/fixtures/fedb-catalog-slugs.json)
// — i.e. the demo will actually load, not 404. Each ships kind:'fedb_frames',
// verified:false. The block also asserts every key is unique across the WHOLE
// CURATED_DEMOS map, that getPendingHumanReviewIds() is UNCHANGED (no new YouTube
// ids) in BOTH directions against the on-disk pendingHumanReviewIds.json mirror,
// and that the CURATED_DEMOS count grew by exactly the tranche size.
describe('CURATED_DEMOS — FEDB-backed tranche #16 (data-only additions)', () => {
  // The COMPLETE set of display-name keys added in tranche #16 of curatedDemos.ts
  // (every key is asserted, not just a representative slice).
  const TRANCHE_16_NAMES = [
    // Agility / plyometric / conditioning
    'Lateral Bound',
    'Lateral Cone Hops',
    'Hurdle Hops',
    'Split Jump',
    'Scissors Jump',
    'Frog Hops',
    // Sled / strongman loaded carries
    'Backward Drag',
    'Conans Wheel',
    'Rickshaw Carry',
    'Sandbag Load',
    // Medicine ball / power
    'Medicine Ball Chest Pass',
    'Overhead Slam',
    // Stationary cardio / mobility
    'Recumbent Bike',
    'Arm Circles',
  ] as const;

  // Per-frame shape with the slug dir captured (group 1) and frame index (group 2).
  const FEDB_FRAME_RE =
    /^https:\/\/raw\.githubusercontent\.com\/yuhonas\/free-exercise-db\/main\/exercises\/([^/]+)\/([01])\.jpg$/;

  // The authoritative 873-slug FEDB catalogue fixture — every tranche-#16 slug
  // MUST be present here (and therefore in FEDB_SLUGS, the same set), so the
  // frame URLs resolve to real images.
  const CATALOG_SLUGS: ReadonlySet<string> = (() => {
    const fixturePath = path.resolve(__dirname, '../fixtures/fedb-catalog-slugs.json');
    const raw = fs.readFileSync(fixturePath, 'utf8');
    const parsed = JSON.parse(raw) as Array<{ slug: string }>;
    expect(Array.isArray(parsed)).toBe(true);
    return new Set(parsed.map((e) => e.slug));
  })();

  test('the catalogue fixture loaded a healthy set of slugs', () => {
    // Sanity: guards against a refactor that empties the fixture and makes the
    // membership checks below vacuously pass.
    expect(CATALOG_SLUGS.size).toBeGreaterThanOrEqual(800);
  });

  test('tranche #16 adds at least 12 new entries (the work item floor)', () => {
    expect(TRANCHE_16_NAMES.length).toBeGreaterThanOrEqual(12);
  });

  test('every tranche-#16 key is a NEW distinct CURATED_DEMOS entry (unique across the whole map)', () => {
    // The tranche is internally distinct…
    expect(new Set(TRANCHE_16_NAMES).size).toBe(TRANCHE_16_NAMES.length);
    // …and every name actually resolved into the frozen map (none dropped by the
    // never-overwrite precedence rule because of a stale collision).
    for (const name of TRANCHE_16_NAMES) {
      expect(Object.prototype.hasOwnProperty.call(CURATED_DEMOS, name)).toBe(true);
    }
    // Each tranche-#16 key appears EXACTLY once among the map's keys — i.e. it is
    // unique across the entire CURATED_DEMOS map, not just within the tranche.
    const allKeys = Object.keys(CURATED_DEMOS);
    for (const name of TRANCHE_16_NAMES) {
      expect(allKeys.filter((k) => k === name).length).toBe(1);
    }
  });

  test.each(TRANCHE_16_NAMES)('getCuratedDemo(%j) is a verified:false kind:"fedb_frames" entry', (name) => {
    const demo = getCuratedDemo(name);
    expect(demo).not.toBeNull();
    expect(demo!.kind).toBe('fedb_frames');
    expect(demo!.verified).toBe(false);
    expect(demo!.url).toMatch(FEDB_FRAME_PAIR_RE);
  });

  test.each(TRANCHE_16_NAMES)(
    'getCuratedDemoFrames(%j) is an ordered 2-element HTTPS [0.jpg, 1.jpg] pair on a real catalogue slug',
    (name) => {
      const frames = getCuratedDemoFrames(name);
      expect(frames).not.toBeNull();
      expect(frames!.length).toBe(2);

      const m0 = FEDB_FRAME_RE.exec(frames![0]!);
      const m1 = FEDB_FRAME_RE.exec(frames![1]!);
      expect(m0).not.toBeNull();
      expect(m1).not.toBeNull();
      // Both HTTPS (ATS-safe).
      expect(frames![0]!.startsWith('https://')).toBe(true);
      expect(frames![1]!.startsWith('https://')).toBe(true);
      // Ordered start (0) → end (1).
      expect(m0![2]).toBe('0');
      expect(m1![2]).toBe('1');
      // A genuine start/end pair: both frames share ONE slug directory…
      expect(m0![1]).toBe(m1![1]);
      // …and that slug is a real entry in the shipped FEDB catalogue (so the
      // demo loads rather than 404s).
      expect(CATALOG_SLUGS.has(m0![1]!)).toBe(true);
    },
  );

  test.each(TRANCHE_16_NAMES)('getCuratedDemoVerified(%j) === false (renders the "Unreviewed" chip)', (name) => {
    expect(getCuratedDemoVerified(name)).toBe(false);
  });

  test('resolution is case-insensitive / whitespace-trimmed for the new tranche', () => {
    expect(getCuratedDemo('  lateral BOUND ')).toEqual(getCuratedDemo('Lateral Bound'));
  });

  test('no tranche-#16 name is a YouTube/gif entry (each is a pure fedb_frames addition)', () => {
    for (const name of TRANCHE_16_NAMES) {
      const demo = getCuratedDemo(name);
      expect(demo).not.toBeNull();
      // Never silently landed on a grandfathered YouTube key or a gif alias.
      expect(demo!.kind).toBe('fedb_frames');
      expect(getCuratedDemoFrames(name)).not.toBeNull();
    }
  });

  test('tranche #16 leaves getPendingHumanReviewIds() unchanged (no new YouTube ids), both directions', () => {
    // tranche #16 is fedb_frames-only, so the human-review YouTube id set must be
    // exactly the on-disk mirror — none of the new names contribute a YouTube id.
    // Assert set-equality in BOTH directions (nothing missing, no orphans).
    const ids = getPendingHumanReviewIds();
    const pendingJsonPath = path.resolve(__dirname, '../../src/constants/pendingHumanReviewIds.json');
    const mirror = JSON.parse(fs.readFileSync(pendingJsonPath, 'utf8')) as string[];
    const idSet = new Set(ids);
    const mirrorSet = new Set(mirror);
    const missingFromMirror = [...idSet].filter((id) => !mirrorSet.has(id));
    const orphansInMirror = [...mirrorSet].filter((id) => !idSet.has(id));
    expect({ missingFromMirror, orphansInMirror }).toEqual({ missingFromMirror: [], orphansInMirror: [] });
    expect([...ids].sort()).toEqual([...mirror].sort());
    // And not one tranche-#16 name resolves to a youtube kind (belt + braces).
    for (const name of TRANCHE_16_NAMES) {
      expect(getCuratedDemo(name)!.kind).not.toBe('youtube');
    }
  });

  test('CURATED_DEMOS count grew by exactly the tranche-#16 size over the pre-#16 baseline', () => {
    // The pre-#16 map = everything EXCEPT the tranche-#16 keys. Removing them must
    // drop the count by exactly TRANCHE_16_NAMES.length, proving the tranche added
    // that many brand-new entries (no silent collisions / drops).
    const all = Object.keys(CURATED_DEMOS);
    const tranche16 = new Set<string>(TRANCHE_16_NAMES);
    const withoutTranche16 = all.filter((k) => !tranche16.has(k));
    expect(all.length - withoutTranche16.length).toBe(TRANCHE_16_NAMES.length);
    // Every tranche-#16 key was genuinely present to be removed (no typo'd key
    // that silently never existed in the map).
    expect(all.length - withoutTranche16.length).toBe(tranche16.size);
  });

  test('tranche #16 adds ONLY verified:false fedb_frames — no verified flag was flipped', () => {
    // Belt + braces against the "DATA-ONLY, no flips" acceptance: the verified:true
    // population is exactly the GRANDFATHERED block, which is key-for-key the 35
    // DEMO_FALLBACK YouTube videos. It is the ONLY source of verified:true entries;
    // every tranche — including this one — ships verified:false. Adding a fedb_frames
    // tranche must NOT change that count, and every verified:true entry must still be
    // a YouTube one (no fedb_frames/gif was silently promoted). The count is derived
    // from DEMO_FALLBACK (asserted === 35 elsewhere) rather than hard-coded, so it
    // tracks the grandfather set exactly.
    const verifiedTrue = CURATED_ENTRIES.filter(([, d]) => d.verified);
    expect(verifiedTrue.length).toBe(Object.keys(DEMO_FALLBACK).length);
    for (const [, demo] of verifiedTrue) {
      expect(demo.kind).toBe('youtube');
    }
    // And the 35 grandfathered DEMO_FALLBACK names specifically stay verified:true
    // with their original URL (no silent demotion, no URL change).
    for (const name of Object.keys(DEMO_FALLBACK)) {
      const demo = getCuratedDemo(name);
      expect(demo).not.toBeNull();
      expect(demo!.kind).toBe('youtube');
      expect(demo!.verified).toBe(true);
      expect(demo!.url).toBe(DEMO_FALLBACK[name]);
    }
  });
});

// ---------------------------------------------------------------------------
// (t) The "tranche #17" FEDB-backed additions resolve to a real catalogue slug
// ---------------------------------------------------------------------------
//
// Same contract as tranches #4/#5/#7/#8/#9/#10/#11/#12/#13/#14/#15/#16: DATA-ONLY
// additions that reuse FEDB slugs already shipped in exerciseDemos.ts (no new HTTP
// fetch). This block pins EVERY new tranche-#17 key explicitly AND cross-checks
// that the slug directory both frames point at is a real entry in the 873-slug
// FEDB catalogue fixture (__tests__/fixtures/fedb-catalog-slugs.json) — i.e. the
// demo will actually load, not 404. Each ships kind:'fedb_frames', verified:false.
// The block also asserts every key is unique across the WHOLE CURATED_DEMOS map,
// that getPendingHumanReviewIds() is UNCHANGED (no new YouTube ids) in BOTH
// directions against the on-disk pendingHumanReviewIds.json mirror, that the
// CURATED_DEMOS count grew by exactly the tranche size, and that NO verified flag
// was flipped (verified:true stays exactly the GRANDFATHERED YouTube set).
describe('CURATED_DEMOS — FEDB-backed tranche #17 (data-only additions)', () => {
  // The COMPLETE set of display-name keys added in tranche #17 of curatedDemos.ts
  // (every key is asserted, not just a representative slice).
  const TRANCHE_17_NAMES = [
    // Chest / floor press & dumbbell-press variants
    'Alternating Floor Press',
    'One-Arm Floor Press',
    'Leg-Over Floor Press',
    'Standing Palms-In Dumbbell Press',
    // Shoulders / delts
    'Dumbbell Raise',
    'One-Arm Side Laterals',
    'Reverse Flyes With External Rotation',
    // Biceps / forearm supination
    'Dumbbell Lying Supination',
    'Reverse Plate Curls',
    'Standing Inner-Biceps Curl',
    'Flexor Incline Dumbbell Curls',
    // Triceps
    'Standing Bent-Over One-Arm Dumbbell Triceps Extension',
    // Back / pullovers / rows / chins
    'Wide-Grip Decline Barbell Pullover',
    'Front Raise And Pullover',
    'Middle Back Shrug',
    'Side To Side Chins',
    'Shotgun Row',
    'Lower Back Curl',
    // Core / abs — leg-pull-in family
    'Frog Sit-Ups',
    'Leg Pull-In',
    'Flat Bench Leg Pull-In',
    // Kettlebell accessory
    'Kettlebell Figure 8',
    'Kettlebell Hang Clean',
    'One-Arm Kettlebell Floor Press',
  ] as const;

  // Per-frame shape with the slug dir captured (group 1) and frame index (group 2).
  const FEDB_FRAME_RE =
    /^https:\/\/raw\.githubusercontent\.com\/yuhonas\/free-exercise-db\/main\/exercises\/([^/]+)\/([01])\.jpg$/;

  // The authoritative 873-slug FEDB catalogue fixture — every tranche-#17 slug
  // MUST be present here (and therefore in FEDB_SLUGS, the same set), so the
  // frame URLs resolve to real images.
  const CATALOG_SLUGS: ReadonlySet<string> = (() => {
    const fixturePath = path.resolve(__dirname, '../fixtures/fedb-catalog-slugs.json');
    const raw = fs.readFileSync(fixturePath, 'utf8');
    const parsed = JSON.parse(raw) as Array<{ slug: string }>;
    expect(Array.isArray(parsed)).toBe(true);
    return new Set(parsed.map((e) => e.slug));
  })();

  test('the catalogue fixture loaded a healthy set of slugs', () => {
    // Sanity: guards against a refactor that empties the fixture and makes the
    // membership checks below vacuously pass.
    expect(CATALOG_SLUGS.size).toBeGreaterThanOrEqual(800);
  });

  test('tranche #17 adds at least 20 new entries (the work item floor)', () => {
    expect(TRANCHE_17_NAMES.length).toBeGreaterThanOrEqual(20);
  });

  test('every tranche-#17 key is a NEW distinct CURATED_DEMOS entry (unique across the whole map)', () => {
    // The tranche is internally distinct…
    expect(new Set(TRANCHE_17_NAMES).size).toBe(TRANCHE_17_NAMES.length);
    // …and every name actually resolved into the frozen map (none dropped by the
    // never-overwrite precedence rule because of a stale collision).
    for (const name of TRANCHE_17_NAMES) {
      expect(Object.prototype.hasOwnProperty.call(CURATED_DEMOS, name)).toBe(true);
    }
    // Each tranche-#17 key appears EXACTLY once among the map's keys — i.e. it is
    // unique across the entire CURATED_DEMOS map, not just within the tranche.
    const allKeys = Object.keys(CURATED_DEMOS);
    for (const name of TRANCHE_17_NAMES) {
      expect(allKeys.filter((k) => k === name).length).toBe(1);
    }
  });

  test.each(TRANCHE_17_NAMES)('getCuratedDemo(%j) is a verified:false kind:"fedb_frames" entry', (name) => {
    const demo = getCuratedDemo(name);
    expect(demo).not.toBeNull();
    expect(demo!.kind).toBe('fedb_frames');
    expect(demo!.verified).toBe(false);
    expect(demo!.url).toMatch(FEDB_FRAME_PAIR_RE);
  });

  test.each(TRANCHE_17_NAMES)(
    'getCuratedDemoFrames(%j) is an ordered 2-element HTTPS [0.jpg, 1.jpg] pair on a real catalogue slug',
    (name) => {
      const frames = getCuratedDemoFrames(name);
      expect(frames).not.toBeNull();
      expect(frames!.length).toBe(2);

      const m0 = FEDB_FRAME_RE.exec(frames![0]!);
      const m1 = FEDB_FRAME_RE.exec(frames![1]!);
      expect(m0).not.toBeNull();
      expect(m1).not.toBeNull();
      // Both HTTPS (ATS-safe).
      expect(frames![0]!.startsWith('https://')).toBe(true);
      expect(frames![1]!.startsWith('https://')).toBe(true);
      // Ordered start (0) → end (1).
      expect(m0![2]).toBe('0');
      expect(m1![2]).toBe('1');
      // A genuine start/end pair: both frames share ONE slug directory…
      expect(m0![1]).toBe(m1![1]);
      // …and that slug is a real entry in the shipped FEDB catalogue (so the
      // demo loads rather than 404s).
      expect(CATALOG_SLUGS.has(m0![1]!)).toBe(true);
    },
  );

  test.each(TRANCHE_17_NAMES)('getCuratedDemoVerified(%j) === false (renders the "Unreviewed" chip)', (name) => {
    expect(getCuratedDemoVerified(name)).toBe(false);
  });

  test('no tranche-#17 name is a YouTube/gif entry (each is a pure fedb_frames addition)', () => {
    for (const name of TRANCHE_17_NAMES) {
      const demo = getCuratedDemo(name);
      expect(demo).not.toBeNull();
      // Never silently landed on a grandfathered YouTube key or a gif alias.
      expect(demo!.kind).toBe('fedb_frames');
      expect(getCuratedDemoFrames(name)).not.toBeNull();
    }
  });

  test('tranche #17 leaves getPendingHumanReviewIds() unchanged (no new YouTube ids), both directions', () => {
    // tranche #17 is fedb_frames-only, so the human-review YouTube id set must be
    // exactly the on-disk mirror — none of the new names contribute a YouTube id.
    // Assert set-equality in BOTH directions (nothing missing, no orphans).
    const ids = getPendingHumanReviewIds();
    const pendingJsonPath = path.resolve(__dirname, '../../src/constants/pendingHumanReviewIds.json');
    const mirror = JSON.parse(fs.readFileSync(pendingJsonPath, 'utf8')) as string[];
    const idSet = new Set(ids);
    const mirrorSet = new Set(mirror);
    const missingFromMirror = [...idSet].filter((id) => !mirrorSet.has(id));
    const orphansInMirror = [...mirrorSet].filter((id) => !idSet.has(id));
    expect({ missingFromMirror, orphansInMirror }).toEqual({ missingFromMirror: [], orphansInMirror: [] });
    expect([...ids].sort()).toEqual([...mirror].sort());
    // And not one tranche-#17 name resolves to a youtube kind (belt + braces).
    for (const name of TRANCHE_17_NAMES) {
      expect(getCuratedDemo(name)!.kind).not.toBe('youtube');
    }
  });

  test('CURATED_DEMOS count grew by exactly the tranche-#17 size over the pre-#17 baseline', () => {
    // The pre-#17 map = everything EXCEPT the tranche-#17 keys. Removing them must
    // drop the count by exactly TRANCHE_17_NAMES.length, proving the tranche added
    // that many brand-new entries (no silent collisions / drops).
    const all = Object.keys(CURATED_DEMOS);
    const tranche17 = new Set<string>(TRANCHE_17_NAMES);
    const withoutTranche17 = all.filter((k) => !tranche17.has(k));
    expect(all.length - withoutTranche17.length).toBe(TRANCHE_17_NAMES.length);
    // Every tranche-#17 key was genuinely present to be removed (no typo'd key
    // that silently never existed in the map).
    expect(all.length - withoutTranche17.length).toBe(tranche17.size);
  });

  test('tranche #17 adds ONLY verified:false fedb_frames — no verified flag was flipped', () => {
    // Belt + braces against the "DATA-ONLY, no flips" acceptance: the verified:true
    // population is exactly the GRANDFATHERED block, which is key-for-key the 35
    // DEMO_FALLBACK YouTube videos. It is the ONLY source of verified:true entries;
    // every tranche — including this one — ships verified:false. Adding a fedb_frames
    // tranche must NOT change that count, and every verified:true entry must still be
    // a YouTube one (no fedb_frames/gif was silently promoted). The count is derived
    // from DEMO_FALLBACK (asserted === 35 elsewhere) rather than hard-coded, so it
    // tracks the grandfather set exactly.
    const verifiedTrue = CURATED_ENTRIES.filter(([, d]) => d.verified);
    expect(verifiedTrue.length).toBe(Object.keys(DEMO_FALLBACK).length);
    for (const [, demo] of verifiedTrue) {
      expect(demo.kind).toBe('youtube');
    }
    // And the 35 grandfathered DEMO_FALLBACK names specifically stay verified:true
    // with their original URL (no silent demotion, no URL change).
    for (const name of Object.keys(DEMO_FALLBACK)) {
      const demo = getCuratedDemo(name);
      expect(demo).not.toBeNull();
      expect(demo!.kind).toBe('youtube');
      expect(demo!.verified).toBe(true);
      expect(demo!.url).toBe(DEMO_FALLBACK[name]);
    }
  });
});

// ---------------------------------------------------------------------------
// (t) The "tranche #18" FEDB-backed additions resolve to a real catalogue slug
// ---------------------------------------------------------------------------
//
// Same contract as tranches #4-#17: DATA-ONLY additions that reuse FEDB slugs
// already shipped in exerciseDemos.ts (no new HTTP fetch). This block pins
// EVERY new tranche-#18 key explicitly AND cross-checks that the slug directory
// both frames point at is a real entry in the 873-slug FEDB catalogue fixture
// (__tests__/fixtures/fedb-catalog-slugs.json) — i.e. the demo will actually
// load, not 404. Each ships kind:'fedb_frames', verified:false. The block also
// asserts getPendingHumanReviewIds() is UNCHANGED (no new YouTube ids) and that
// the CURATED_DEMOS count grew by exactly the tranche size.
describe('CURATED_DEMOS — FEDB-backed tranche #18 (data-only additions)', () => {
  // The COMPLETE set of display-name keys added in tranche #18 of curatedDemos.ts
  // (every key is asserted, not just a representative slice).
  const TRANCHE_18_NAMES = [
    // Band / chain-resisted barbell compounds
    'Bench Press with Bands',
    'Squat with Bands',
    'Deadlift with Bands',
    'Deadlift with Chains',
    'Box Squat with Bands',
    'Sumo Deadlift with Bands',
    'Shoulder Press with Bands',
    'Upright Row with Bands',
    // Kettlebell — jerk / press / clean accessory
    'Double Kettlebell Jerk',
    'Double Kettlebell Push Press',
    'Two-Arm Kettlebell Jerk',
    'Kettlebell Seated Press',
    'Kettlebell Seesaw Press',
    'One-Arm Kettlebell Push Press',
    'Kettlebell Dead Clean',
    // Sled / strongman loaded carries
    'Sled Drag (Harness)',
    'Sled Overhead Triceps Extension',
    'Sled Reverse Flye',
    'Rickshaw Deadlift',
    'Power Stairs',
    // Plyometric / conditioning
    'Front Box Jump',
    'Kneeling Jump Squat',
    'Weighted Jump Squat',
    'Depth Jump Leap',
    // Mobility / stretch staples
    'Worlds Greatest Stretch (Dynamic)',
    'Seated Calf Stretch',
    'Standing Lateral Stretch',
    'Upward Stretch',
    'Groiners',
    'Inchworm',
  ] as const;

  // Per-frame shape with the slug dir captured (group 1) and frame index (group 2).
  const FEDB_FRAME_RE =
    /^https:\/\/raw\.githubusercontent\.com\/yuhonas\/free-exercise-db\/main\/exercises\/([^/]+)\/([01])\.jpg$/;

  // The authoritative 873-slug FEDB catalogue fixture — every tranche-#18 slug
  // MUST be present here (and therefore in FEDB_SLUGS, the same set), so the
  // frame URLs resolve to real images.
  const CATALOG_SLUGS: ReadonlySet<string> = (() => {
    const fixturePath = path.resolve(__dirname, '../fixtures/fedb-catalog-slugs.json');
    const raw = fs.readFileSync(fixturePath, 'utf8');
    const parsed = JSON.parse(raw) as Array<{ slug: string }>;
    expect(Array.isArray(parsed)).toBe(true);
    return new Set(parsed.map((e) => e.slug));
  })();

  test('the catalogue fixture loaded a healthy set of slugs', () => {
    // Sanity: guards against a refactor that empties the fixture and makes the
    // membership checks below vacuously pass.
    expect(CATALOG_SLUGS.size).toBeGreaterThanOrEqual(800);
  });

  test('tranche #18 adds at least 20 new entries (the work item floor)', () => {
    expect(TRANCHE_18_NAMES.length).toBeGreaterThanOrEqual(20);
  });

  test('every tranche-#18 key is a NEW distinct CURATED_DEMOS entry (unique across the whole map)', () => {
    // The tranche is internally distinct…
    expect(new Set(TRANCHE_18_NAMES).size).toBe(TRANCHE_18_NAMES.length);
    // …and every name actually resolved into the frozen map (none dropped by the
    // never-overwrite precedence rule because of a stale collision).
    for (const name of TRANCHE_18_NAMES) {
      expect(Object.prototype.hasOwnProperty.call(CURATED_DEMOS, name)).toBe(true);
    }
    // Each tranche-#18 key appears EXACTLY once among the map's keys — i.e. it is
    // unique across the entire CURATED_DEMOS map, not just within the tranche.
    const allKeys = Object.keys(CURATED_DEMOS);
    for (const name of TRANCHE_18_NAMES) {
      expect(allKeys.filter((k) => k === name).length).toBe(1);
    }
  });

  test.each(TRANCHE_18_NAMES)('getCuratedDemo(%j) is a verified:false kind:"fedb_frames" entry', (name) => {
    const demo = getCuratedDemo(name);
    expect(demo).not.toBeNull();
    expect(demo!.kind).toBe('fedb_frames');
    expect(demo!.verified).toBe(false);
    expect(demo!.url).toMatch(FEDB_FRAME_PAIR_RE);
  });

  test.each(TRANCHE_18_NAMES)(
    'getCuratedDemoFrames(%j) is an ordered 2-element HTTPS [0.jpg, 1.jpg] pair on a real catalogue slug',
    (name) => {
      const frames = getCuratedDemoFrames(name);
      expect(frames).not.toBeNull();
      expect(frames!.length).toBe(2);

      const m0 = FEDB_FRAME_RE.exec(frames![0]!);
      const m1 = FEDB_FRAME_RE.exec(frames![1]!);
      expect(m0).not.toBeNull();
      expect(m1).not.toBeNull();
      // Both HTTPS (ATS-safe).
      expect(frames![0]!.startsWith('https://')).toBe(true);
      expect(frames![1]!.startsWith('https://')).toBe(true);
      // Ordered start (0) → end (1).
      expect(m0![2]).toBe('0');
      expect(m1![2]).toBe('1');
      // A genuine start/end pair: both frames share ONE slug directory…
      expect(m0![1]).toBe(m1![1]);
      // …and that slug is a real entry in the shipped FEDB catalogue (so the
      // demo loads rather than 404s).
      expect(CATALOG_SLUGS.has(m0![1]!)).toBe(true);
    },
  );

  test.each(TRANCHE_18_NAMES)('getCuratedDemoVerified(%j) === false (renders the "Unreviewed" chip)', (name) => {
    expect(getCuratedDemoVerified(name)).toBe(false);
  });

  test('no tranche-#18 name is a YouTube/gif entry (each is a pure fedb_frames addition)', () => {
    for (const name of TRANCHE_18_NAMES) {
      const demo = getCuratedDemo(name);
      expect(demo).not.toBeNull();
      // Never silently landed on a grandfathered YouTube key or a gif alias.
      expect(demo!.kind).toBe('fedb_frames');
      expect(getCuratedDemoFrames(name)).not.toBeNull();
    }
  });

  test('tranche #18 leaves getPendingHumanReviewIds() unchanged (no new YouTube ids), both directions', () => {
    // tranche #18 is fedb_frames-only, so the human-review YouTube id set must be
    // exactly the on-disk mirror — none of the new names contribute a YouTube id.
    // Assert set-equality in BOTH directions (nothing missing, no orphans).
    const ids = getPendingHumanReviewIds();
    const pendingJsonPath = path.resolve(__dirname, '../../src/constants/pendingHumanReviewIds.json');
    const mirror = JSON.parse(fs.readFileSync(pendingJsonPath, 'utf8')) as string[];
    const idSet = new Set(ids);
    const mirrorSet = new Set(mirror);
    const missingFromMirror = [...idSet].filter((id) => !mirrorSet.has(id));
    const orphansInMirror = [...mirrorSet].filter((id) => !idSet.has(id));
    expect({ missingFromMirror, orphansInMirror }).toEqual({ missingFromMirror: [], orphansInMirror: [] });
    expect([...ids].sort()).toEqual([...mirror].sort());
    // And not one tranche-#18 name resolves to a youtube kind (belt + braces).
    for (const name of TRANCHE_18_NAMES) {
      expect(getCuratedDemo(name)!.kind).not.toBe('youtube');
    }
  });

  test('CURATED_DEMOS count grew by exactly the tranche-#18 size over the pre-#18 baseline', () => {
    // The pre-#18 map = everything EXCEPT the tranche-#18 keys. Removing them must
    // drop the count by exactly TRANCHE_18_NAMES.length, proving the tranche added
    // that many brand-new entries (no silent collisions / drops).
    const all = Object.keys(CURATED_DEMOS);
    const tranche18 = new Set<string>(TRANCHE_18_NAMES);
    const withoutTranche18 = all.filter((k) => !tranche18.has(k));
    expect(all.length - withoutTranche18.length).toBe(TRANCHE_18_NAMES.length);
    // Every tranche-#18 key was genuinely present to be removed (no typo'd key
    // that silently never existed in the map).
    expect(all.length - withoutTranche18.length).toBe(tranche18.size);
  });

  test('tranche #18 adds ONLY verified:false fedb_frames — no verified flag was flipped', () => {
    // Belt + braces against the "DATA-ONLY, no flips" acceptance: the verified:true
    // population is exactly the GRANDFATHERED block, which is key-for-key the 35
    // DEMO_FALLBACK YouTube videos. It is the ONLY source of verified:true entries;
    // every tranche — including this one — ships verified:false. Adding a fedb_frames
    // tranche must NOT change that count, and every verified:true entry must still be
    // a YouTube one (no fedb_frames/gif was silently promoted). The count is derived
    // from DEMO_FALLBACK (asserted === 35 elsewhere) rather than hard-coded, so it
    // tracks the grandfather set exactly.
    const verifiedTrue = CURATED_ENTRIES.filter(([, d]) => d.verified);
    expect(verifiedTrue.length).toBe(Object.keys(DEMO_FALLBACK).length);
    for (const [, demo] of verifiedTrue) {
      expect(demo.kind).toBe('youtube');
    }
    // And the 35 grandfathered DEMO_FALLBACK names specifically stay verified:true
    // with their original URL (no silent demotion, no URL change).
    for (const name of Object.keys(DEMO_FALLBACK)) {
      const demo = getCuratedDemo(name);
      expect(demo).not.toBeNull();
      expect(demo!.kind).toBe('youtube');
      expect(demo!.verified).toBe(true);
      expect(demo!.url).toBe(DEMO_FALLBACK[name]);
    }
  });
});

// ---------------------------------------------------------------------------
// (u) The "tranche #19" FEDB-backed additions resolve to a real catalogue slug
// ---------------------------------------------------------------------------
//
// Same contract as tranches #4-#18: DATA-ONLY additions that reuse FEDB slugs
// already shipped in exerciseDemos.ts (no new HTTP fetch). This block pins
// EVERY new tranche-#19 key explicitly AND cross-checks that the slug directory
// both frames point at is a real entry in the 873-slug FEDB catalogue fixture
// (__tests__/fixtures/fedb-catalog-slugs.json) — i.e. the demo will actually
// load, not 404. Each ships kind:'fedb_frames', verified:false. The block also
// asserts getPendingHumanReviewIds() is UNCHANGED (no new YouTube ids) and that
// the CURATED_DEMOS count grew by exactly the tranche size.
describe('CURATED_DEMOS — FEDB-backed tranche #19 (data-only additions)', () => {
  // The COMPLETE set of display-name keys added in tranche #19 of curatedDemos.ts
  // (every key is asserted, not just a representative slice).
  const TRANCHE_19_NAMES = [
    // Cardio / conditioning machines
    'Stationary Bike',
    'Elliptical Trainer',
    'Rowing Machine',
    'Stair Stepper',
    'Treadmill Running',
    'Treadmill Walking',
    'Treadmill Jogging',
    'Stairmaster Climb',
    'Skipping Rope',
    // Self-myofascial release (foam rolling / SMR)
    'Foam Roll Lower Back',
    'Foam Roll Peroneals',
    'Foam Roll Piriformis',
    'Foam Roll Rhomboids',
    'Foam Roll Anterior Tibialis',
    'Foam Roll Brachialis',
    'Foam Roll Iliotibial Tract',
    // Seated / standing flexibility stretches
    'Childs Pose',
    'Knee To Chest Stretch',
    'Standing Pelvic Tilt',
    'Overhead Reach Stretch',
    'Seated Overhead Stretch',
    'Standing Soleus And Achilles Stretch',
    'Torso Rotation Stretch',
    'Shoulder Circles',
    // Olympic-from-blocks barbell pulls
    'Clean From Blocks',
    'Snatch From Blocks',
    'Power Clean From Blocks',
    'Power Snatch From Blocks',
    // Kettlebell jerk / snatch accessory
    'One-Arm Kettlebell Jerk',
    'One-Arm Kettlebell Split Jerk',
    'One-Arm Kettlebell Split Snatch',
    'One-Arm Kettlebell Clean and Jerk',
  ] as const;

  // Per-frame shape with the slug dir captured (group 1) and frame index (group 2).
  const FEDB_FRAME_RE =
    /^https:\/\/raw\.githubusercontent\.com\/yuhonas\/free-exercise-db\/main\/exercises\/([^/]+)\/([01])\.jpg$/;

  // The authoritative 873-slug FEDB catalogue fixture — every tranche-#19 slug
  // MUST be present here (and therefore in FEDB_SLUGS, the same set), so the
  // frame URLs resolve to real images.
  const CATALOG_SLUGS: ReadonlySet<string> = (() => {
    const fixturePath = path.resolve(__dirname, '../fixtures/fedb-catalog-slugs.json');
    const raw = fs.readFileSync(fixturePath, 'utf8');
    const parsed = JSON.parse(raw) as Array<{ slug: string }>;
    expect(Array.isArray(parsed)).toBe(true);
    return new Set(parsed.map((e) => e.slug));
  })();

  test('the catalogue fixture loaded a healthy set of slugs', () => {
    // Sanity: guards against a refactor that empties the fixture and makes the
    // membership checks below vacuously pass.
    expect(CATALOG_SLUGS.size).toBeGreaterThanOrEqual(800);
  });

  test('tranche #19 adds at least 20 new entries (the work item floor)', () => {
    expect(TRANCHE_19_NAMES.length).toBeGreaterThanOrEqual(20);
  });

  test('every tranche-#19 key is a NEW distinct CURATED_DEMOS entry (unique across the whole map)', () => {
    // The tranche is internally distinct…
    expect(new Set(TRANCHE_19_NAMES).size).toBe(TRANCHE_19_NAMES.length);
    // …and every name actually resolved into the frozen map (none dropped by the
    // never-overwrite precedence rule because of a stale collision).
    for (const name of TRANCHE_19_NAMES) {
      expect(Object.prototype.hasOwnProperty.call(CURATED_DEMOS, name)).toBe(true);
    }
    // Each tranche-#19 key appears EXACTLY once among the map's keys — i.e. it is
    // unique across the entire CURATED_DEMOS map, not just within the tranche.
    const allKeys = Object.keys(CURATED_DEMOS);
    for (const name of TRANCHE_19_NAMES) {
      expect(allKeys.filter((k) => k === name).length).toBe(1);
    }
  });

  test.each(TRANCHE_19_NAMES)('getCuratedDemo(%j) is a verified:false kind:"fedb_frames" entry', (name) => {
    const demo = getCuratedDemo(name);
    expect(demo).not.toBeNull();
    expect(demo!.kind).toBe('fedb_frames');
    expect(demo!.verified).toBe(false);
    expect(demo!.url).toMatch(FEDB_FRAME_PAIR_RE);
  });

  test.each(TRANCHE_19_NAMES)(
    'getCuratedDemoFrames(%j) is an ordered 2-element HTTPS [0.jpg, 1.jpg] pair on a real catalogue slug',
    (name) => {
      const frames = getCuratedDemoFrames(name);
      expect(frames).not.toBeNull();
      expect(frames!.length).toBe(2);

      const m0 = FEDB_FRAME_RE.exec(frames![0]!);
      const m1 = FEDB_FRAME_RE.exec(frames![1]!);
      expect(m0).not.toBeNull();
      expect(m1).not.toBeNull();
      // Both HTTPS (ATS-safe).
      expect(frames![0]!.startsWith('https://')).toBe(true);
      expect(frames![1]!.startsWith('https://')).toBe(true);
      // Ordered start (0) → end (1).
      expect(m0![2]).toBe('0');
      expect(m1![2]).toBe('1');
      // A genuine start/end pair: both frames share ONE slug directory…
      expect(m0![1]).toBe(m1![1]);
      // …and that slug is a real entry in the shipped FEDB catalogue (so the
      // demo loads rather than 404s).
      expect(CATALOG_SLUGS.has(m0![1]!)).toBe(true);
    },
  );

  test.each(TRANCHE_19_NAMES)('getCuratedDemoVerified(%j) === false (renders the "Unreviewed" chip)', (name) => {
    expect(getCuratedDemoVerified(name)).toBe(false);
  });

  test('no tranche-#19 name is a YouTube/gif entry (each is a pure fedb_frames addition)', () => {
    for (const name of TRANCHE_19_NAMES) {
      const demo = getCuratedDemo(name);
      expect(demo).not.toBeNull();
      // Never silently landed on a grandfathered YouTube key or a gif alias.
      expect(demo!.kind).toBe('fedb_frames');
      expect(getCuratedDemoFrames(name)).not.toBeNull();
    }
  });

  test('tranche #19 leaves getPendingHumanReviewIds() unchanged (no new YouTube ids), both directions', () => {
    // tranche #19 is fedb_frames-only, so the human-review YouTube id set must be
    // exactly the on-disk mirror — none of the new names contribute a YouTube id.
    // Assert set-equality in BOTH directions (nothing missing, no orphans).
    const ids = getPendingHumanReviewIds();
    const pendingJsonPath = path.resolve(__dirname, '../../src/constants/pendingHumanReviewIds.json');
    const mirror = JSON.parse(fs.readFileSync(pendingJsonPath, 'utf8')) as string[];
    const idSet = new Set(ids);
    const mirrorSet = new Set(mirror);
    const missingFromMirror = [...idSet].filter((id) => !mirrorSet.has(id));
    const orphansInMirror = [...mirrorSet].filter((id) => !idSet.has(id));
    expect({ missingFromMirror, orphansInMirror }).toEqual({ missingFromMirror: [], orphansInMirror: [] });
    expect([...ids].sort()).toEqual([...mirror].sort());
    // And not one tranche-#19 name resolves to a youtube kind (belt + braces).
    for (const name of TRANCHE_19_NAMES) {
      expect(getCuratedDemo(name)!.kind).not.toBe('youtube');
    }
  });

  test('CURATED_DEMOS count grew by exactly the tranche-#19 size over the pre-#19 baseline', () => {
    // The pre-#19 map = everything EXCEPT the tranche-#19 keys. Removing them must
    // drop the count by exactly TRANCHE_19_NAMES.length, proving the tranche added
    // that many brand-new entries (no silent collisions / drops).
    const all = Object.keys(CURATED_DEMOS);
    const tranche19 = new Set<string>(TRANCHE_19_NAMES);
    const withoutTranche19 = all.filter((k) => !tranche19.has(k));
    expect(all.length - withoutTranche19.length).toBe(TRANCHE_19_NAMES.length);
    // Every tranche-#19 key was genuinely present to be removed (no typo'd key
    // that silently never existed in the map).
    expect(all.length - withoutTranche19.length).toBe(tranche19.size);
  });

  test('tranche #19 adds ONLY verified:false fedb_frames — no verified flag was flipped', () => {
    // Belt + braces against the "DATA-ONLY, no flips" acceptance: the verified:true
    // population is exactly the GRANDFATHERED block, which is key-for-key the 35
    // DEMO_FALLBACK YouTube videos. It is the ONLY source of verified:true entries;
    // every tranche — including this one — ships verified:false. Adding a fedb_frames
    // tranche must NOT change that count, and every verified:true entry must still be
    // a YouTube one (no fedb_frames/gif was silently promoted). The count is derived
    // from DEMO_FALLBACK (asserted === 35 elsewhere) rather than hard-coded, so it
    // tracks the grandfather set exactly.
    const verifiedTrue = CURATED_ENTRIES.filter(([, d]) => d.verified);
    expect(verifiedTrue.length).toBe(Object.keys(DEMO_FALLBACK).length);
    for (const [, demo] of verifiedTrue) {
      expect(demo.kind).toBe('youtube');
    }
    // And the 35 grandfathered DEMO_FALLBACK names specifically stay verified:true
    // with their original URL (no silent demotion, no URL change).
    for (const name of Object.keys(DEMO_FALLBACK)) {
      const demo = getCuratedDemo(name);
      expect(demo).not.toBeNull();
      expect(demo!.kind).toBe('youtube');
      expect(demo!.verified).toBe(true);
      expect(demo!.url).toBe(DEMO_FALLBACK[name]);
    }
  });
});
