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
