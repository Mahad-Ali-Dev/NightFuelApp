/**
 * pendingHumanReview.test.ts
 *
 * Drift guard for the human-review pipeline.
 *
 * {@link ../../src/constants/curatedDemos.ts} exports `getPendingHumanReviewIds()`
 * — the single source-of-truth accessor that derives the set of YouTube
 * video-ids still awaiting human review (every `kind:'youtube'`,
 * `verified:false` curated entry) directly from the in-memory CURATED_DEMOS map.
 *
 * The on-disk mirror `../../src/constants/pendingHumanReviewIds.json` is what a
 * human reviewer actually walks. This suite asserts the two are EXACTLY equal in
 * both directions:
 *   - missingFromJson === []  — every pending id is listed for review;
 *   - orphansInJson  === []   — the JSON has no stale id (e.g. one whose entry
 *                               was flipped to verified:true or removed).
 *
 * It is a DRIFT GUARD only: it never rewrites the JSON and never flips a
 * `verified` flag — promoting an entry to verified is a user-gated review step.
 * If this fails, a human either (a) added/removed a verified:false youtube entry
 * without syncing the JSON, or (b) edited the JSON out of band.
 *
 * Pure data/logic — no React, no network. Companion to `curatedDemos.test.ts`,
 * which owns the URL-shape / size / grandfather suites.
 */
import * as fs from 'fs';
import * as path from 'path';

import { getPendingHumanReviewIds } from '@/constants/curatedDemos';

// Resolve the JSON straight from disk (same path pattern as curatedDemos.test.ts)
// so a missing/malformed file fails loudly rather than silently importing an
// empty array via TS module resolution.
const PENDING_JSON_PATH = path.resolve(__dirname, '../../src/constants/pendingHumanReviewIds.json');

function loadPendingJson(): string[] {
  const raw = fs.readFileSync(PENDING_JSON_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  expect(Array.isArray(parsed)).toBe(true);
  return parsed as string[];
}

describe('getPendingHumanReviewIds() — pure accessor contract', () => {
  test('returns a de-duped, sorted array of non-empty YouTube ids', () => {
    const ids = getPendingHumanReviewIds();
    expect(Array.isArray(ids)).toBe(true);
    // Every id is a plausible YouTube video id (>=6 chars of [A-Za-z0-9_-]).
    for (const id of ids) {
      expect(typeof id).toBe('string');
      expect(id).toMatch(/^[\w-]{6,}$/);
    }
    // De-duped.
    expect(new Set(ids).size).toBe(ids.length);
    // Sorted ascending (deterministic, stable output).
    expect([...ids].sort()).toEqual(ids);
  });

  test('is pure — repeated calls return equal, independent arrays', () => {
    const a = getPendingHumanReviewIds();
    const b = getPendingHumanReviewIds();
    expect(a).toEqual(b);
    // A fresh array each call (mutating the result can never corrupt the source).
    expect(a).not.toBe(b);
  });
});

describe('pendingHumanReviewIds.json — set-equality drift guard', () => {
  test('the JSON exists and is a non-empty array of unique string ids', () => {
    const pending = loadPendingJson();
    expect(pending.length).toBeGreaterThan(0);
    for (const id of pending) {
      expect(typeof id).toBe('string');
      expect(id).toMatch(/^[\w-]{6,}$/);
    }
    expect(new Set(pending).size).toBe(pending.length);
  });

  test('getPendingHumanReviewIds() equals the JSON set exactly (no drift)', () => {
    const fromCode = new Set(getPendingHumanReviewIds());
    const fromJson = new Set(loadPendingJson());

    const missingFromJson = Array.from(fromCode).filter((id) => !fromJson.has(id)).sort();
    const orphansInJson = Array.from(fromJson).filter((id) => !fromCode.has(id)).sort();

    // Both directions must be empty: the JSON mirror is the exact set the
    // accessor derives from CURATED_DEMOS.
    expect({ missingFromJson, orphansInJson }).toEqual({ missingFromJson: [], orphansInJson: [] });
  });

  test('the de-duped/sorted accessor output is element-for-element equal to the sorted JSON', () => {
    const fromCode = getPendingHumanReviewIds();
    // getPendingHumanReviewIds() is already sorted+de-duped; sort+de-dupe the JSON
    // the same way so a (legal) reordering of the JSON file does not fail the test.
    const jsonSortedUnique = Array.from(new Set(loadPendingJson())).sort();
    expect(fromCode).toEqual(jsonSortedUnique);
  });
});
