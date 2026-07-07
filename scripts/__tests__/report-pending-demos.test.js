/**
 * Unit test — scripts/report-pending-demos.js parser + drift contract.
 *
 * report-pending-demos.js is an INFORMATIONAL (non-blocking) reviewer tool: it
 * reads clients/mobile/src/constants/curatedDemos.ts AS TEXT and prints every
 * `verified: false` curated demo grouped by kind (youtube / fedb_frames / gif)
 * with name + URL + per-kind counts, then FLAGS youtube-id drift against
 * clients/mobile/src/constants/pendingHumanReviewIds.json in BOTH directions.
 * It ALWAYS exits 0 and is NOT a gate step — it can never block a merge, and it
 * NEVER flips any `verified` flag.
 *
 * This suite locks the script's pure parser + drift helpers against small
 * INLINE fixture strings — it deliberately does NOT assert on the live
 * curatedDemos.ts content, so the test stays stable as the real catalogue grows
 * or shrinks. It pins:
 *
 *   - extractBlock              — slices a `const X … = { … };` object-literal
 *                                 body out of source text.
 *   - parseAllStringEntries     — `'Name': 'value'` AND `"Name": 'value'`
 *                                 (double-quoted key, e.g. an apostrophe name)
 *                                 string entries.
 *   - youtubeIdFromUrl          — `watch?v=<id>` extraction, stopping at &/#.
 *   - parseCuratedDemosSource   — groups verified:false entries by kind, counts
 *                                 them, reconstructs the fedb_frames frame-pair
 *                                 URL from a slug, and derives the sorted
 *                                 unreviewed youtube id set.
 *   - computeDrift              — both drift directions (source-missing-from-json
 *                                 and json-with-no-source-entry).
 *   - renderReport              — counts + drift surface in the rendered text.
 *
 * Plain JS (not TS) on purpose: the script under test is plain JS too, so this
 * test runs under the gate's harness-self-test jest pass (`--transform '{}'`, no
 * babel/ts-jest). We import the pure helpers via the script's
 * `module.exports.__test` back-door. Importing the module is safe: its
 * main()/CLI only runs under the require.main === module guard inside the
 * script. (harness-self-tests OMITS --passWithNoTests, so this file MUST
 * actually contain passing assertions — it does.)
 *
 * Run from repo root: `npx jest scripts/__tests__/report-pending-demos.test.js`
 */

'use strict';

const path = require('path');

const { __test } = require(path.resolve(__dirname, '..', 'report-pending-demos.js'));
const {
    extractBlock,
    parseAllStringEntries,
    youtubeIdFromUrl,
    fedbPair,
    parseCuratedDemosSource,
    computeDrift,
    renderReport,
    FEDB_BASE,
} = __test;

// A compact, fully self-contained fixture that mirrors the SHAPE of the three
// pending blocks in curatedDemos.ts (NOT its live content). Each block opener is
// byte-identical to the real declaration so extractBlock locates it. GRANDFATHERED
// (verified:true) is included so the parser proves it does NOT sweep it in.
const FIXTURE_SOURCE = [
    '// preamble comment',
    'const GRANDFATHERED: Readonly<Record<string, CuratedDemo>> = {',
    "  'Barbell Bench Press': { kind: 'youtube', url: 'https://www.youtube.com/watch?v=verified1', verified: true },",
    "  'Pull-Up': { kind: 'youtube', url: 'https://www.youtube.com/watch?v=verified2', verified: true },",
    '};',
    '',
    'const FEDB_BACKED_SLUGS: Readonly<Record<string, string>> = {',
    '  // a section comment that must be skipped',
    "  'Barbell Curl': 'Barbell_Curl',",
    "  'Front Squat': 'Front_Barbell_Squat',",
    // last entry, NO trailing comma — must still be captured.
    "  'Wrist Roller': 'Wrist_Roller'",
    '};',
    '',
    'const YOUTUBE_PENDING: Readonly<Record<string, string>> = {',
    "  'Reverse Kegel': 'https://www.youtube.com/watch?v=ytPending1',",
    // double-quoted key (apostrophe in the name) + an extra query param after
    // the id (must be stripped at the first &).
    '  "World\'s Greatest Stretch": \'https://www.youtube.com/watch?v=ytPending2&feature=share\',',
    '};',
    '',
    'const GIF_PENDING: Readonly<Record<string, string>> = {',
    "  'Pushup': 'https://upload.wikimedia.org/wikipedia/commons/8/8f/Pushups.gif',",
    "  'Air Squat': 'https://upload.wikimedia.org/wikipedia/commons/e/e6/Squats.gif'",
    '};',
].join('\n');

describe('report-pending-demos — extractBlock', () => {
    test('locates a pending block by its exact opener and stops at the first `};`', () => {
        const body = extractBlock(
            FIXTURE_SOURCE,
            'const YOUTUBE_PENDING: Readonly<Record<string, string>> = {',
        );
        expect(body).not.toBeNull();
        expect(body).toContain("'Reverse Kegel'");
        // It must NOT bleed into the later GIF_PENDING block.
        expect(body).not.toContain("'Pushup'");
        // …nor back into the earlier GRANDFATHERED block.
        expect(body).not.toContain('Barbell Bench Press');
    });

    test('missing opener → null', () => {
        expect(
            extractBlock(FIXTURE_SOURCE, 'const DOES_NOT_EXIST: Record<string, string> = {'),
        ).toBeNull();
    });
});

describe('report-pending-demos — parseAllStringEntries', () => {
    test('captures single- and double-quoted KEYS, skips comments, keeps last (no-comma) entry', () => {
        const body = [
            '  // comment',
            "  'Single Key': 'value-a',",
            '  "Double Key": \'value-b\',',
            "  'Last Entry No Comma': 'value-c'",
        ].join('\n');
        const entries = parseAllStringEntries(body);
        expect(entries).toEqual([
            { name: 'Single Key', value: 'value-a' },
            { name: 'Last Entry No Comma', value: 'value-c' },
            { name: 'Double Key', value: 'value-b' },
        ]);
    });
});

describe('report-pending-demos — youtubeIdFromUrl', () => {
    test('extracts the id and stops at the first & / #', () => {
        expect(youtubeIdFromUrl('https://www.youtube.com/watch?v=abc123')).toBe('abc123');
        expect(youtubeIdFromUrl('https://www.youtube.com/watch?v=abc123&feature=share')).toBe('abc123');
        expect(youtubeIdFromUrl('https://www.youtube.com/watch?v=abc123#t=10')).toBe('abc123');
    });

    test('returns null when there is no watch?v= marker', () => {
        expect(youtubeIdFromUrl('https://upload.wikimedia.org/x.gif')).toBeNull();
    });
});

describe('report-pending-demos — parseCuratedDemosSource (grouping + counts + ids)', () => {
    const model = parseCuratedDemosSource(FIXTURE_SOURCE);

    test('all three pending blocks were located (no parse failures)', () => {
        expect(model.missingBlocks).toEqual([]);
    });

    test('groups verified:false entries by kind and counts each kind correctly', () => {
        expect(model.counts).toEqual({
            youtube: 2,
            fedb_frames: 3,
            gif: 2,
            total: 7,
        });
        expect(model.byKind.youtube.map((e) => e.name).sort()).toEqual([
            'Reverse Kegel',
            "World's Greatest Stretch",
        ]);
        expect(model.byKind.fedb_frames.map((e) => e.name).sort()).toEqual([
            'Barbell Curl',
            'Front Squat',
            'Wrist Roller',
        ]);
        expect(model.byKind.gif.map((e) => e.name).sort()).toEqual(['Air Squat', 'Pushup']);
    });

    test('GRANDFATHERED (verified:true) is NOT reported — it is not part of the backlog', () => {
        const allNames = [
            ...model.byKind.youtube,
            ...model.byKind.fedb_frames,
            ...model.byKind.gif,
        ].map((e) => e.name);
        expect(allNames).not.toContain('Barbell Bench Press');
        expect(allNames).not.toContain('Pull-Up');
    });

    test('fedb_frames url is reconstructed from the slug as the pipe-joined frame pair', () => {
        const curl = model.byKind.fedb_frames.find((e) => e.name === 'Barbell Curl');
        expect(curl).toBeDefined();
        expect(curl.slug).toBe('Barbell_Curl');
        expect(curl.url).toBe(`${FEDB_BASE}/Barbell_Curl/0.jpg|${FEDB_BASE}/Barbell_Curl/1.jpg`);
        // …and that matches the exported fedbPair() helper exactly.
        expect(curl.url).toBe(fedbPair('Barbell_Curl'));
    });

    test('youtube urls are kept verbatim (id stripping happens only for the drift id set)', () => {
        const wgs = model.byKind.youtube.find((e) => e.name === "World's Greatest Stretch");
        expect(wgs.url).toBe('https://www.youtube.com/watch?v=ytPending2&feature=share');
    });

    test('youtubeIds is the de-duped + sorted set of unreviewed youtube ids (query param stripped)', () => {
        expect(model.youtubeIds).toEqual(['ytPending1', 'ytPending2']);
    });
});

describe('report-pending-demos — computeDrift (both directions)', () => {
    test('in-sync → both drift arrays empty', () => {
        const { pendingInSourceMissingFromJson, inJsonNoUnreviewedYoutubeEntry } = computeDrift(
            ['a', 'b'],
            ['b', 'a'],
        );
        expect(pendingInSourceMissingFromJson).toEqual([]);
        expect(inJsonNoUnreviewedYoutubeEntry).toEqual([]);
    });

    test('id pending in source but missing from json → reported in pendingInSourceMissingFromJson', () => {
        const { pendingInSourceMissingFromJson, inJsonNoUnreviewedYoutubeEntry } = computeDrift(
            ['keep', 'newPending'],
            ['keep'],
        );
        expect(pendingInSourceMissingFromJson).toEqual(['newPending']);
        expect(inJsonNoUnreviewedYoutubeEntry).toEqual([]);
    });

    test('json id with no matching unreviewed youtube entry → reported in inJsonNoUnreviewedYoutubeEntry', () => {
        const { pendingInSourceMissingFromJson, inJsonNoUnreviewedYoutubeEntry } = computeDrift(
            ['keep'],
            ['keep', 'staleId'],
        );
        expect(pendingInSourceMissingFromJson).toEqual([]);
        expect(inJsonNoUnreviewedYoutubeEntry).toEqual(['staleId']);
    });

    test('drift in BOTH directions at once, each sorted', () => {
        const { pendingInSourceMissingFromJson, inJsonNoUnreviewedYoutubeEntry } = computeDrift(
            ['zeta', 'alpha', 'shared'],
            ['shared', 'stale2', 'stale1'],
        );
        expect(pendingInSourceMissingFromJson).toEqual(['alpha', 'zeta']);
        expect(inJsonNoUnreviewedYoutubeEntry).toEqual(['stale1', 'stale2']);
    });
});

describe('report-pending-demos — renderReport surfaces counts and drift', () => {
    const model = parseCuratedDemosSource(FIXTURE_SOURCE);

    test('renders per-kind counts and the grand total', () => {
        const text = renderReport(model, model.youtubeIds).join('\n');
        expect(text).toContain('TOTAL verified:false entries: 7 (youtube 2, fedb_frames 3, gif 2)');
    });

    test('when json matches the source ids → an OK / in-sync line, no drift markers', () => {
        const text = renderReport(model, model.youtubeIds).join('\n');
        expect(text).toContain('OK — pendingHumanReviewIds.json is in sync');
        expect(text).not.toContain('[pending-in-source-missing-from-json]');
        expect(text).not.toContain('[in-json-no-unreviewed-youtube-entry]');
    });

    test('when json drifts in both directions → both drift markers appear', () => {
        // json is missing ytPending2 AND carries a stale id not in the source.
        const text = renderReport(model, ['ytPending1', 'staleId']).join('\n');
        expect(text).toContain('[pending-in-source-missing-from-json]');
        expect(text).toContain('ytPending2');
        expect(text).toContain('[in-json-no-unreviewed-youtube-entry]');
        expect(text).toContain('staleId');
    });

    test('null json (unreadable file) → a diagnostic line, never a throw', () => {
        const text = renderReport(model, null).join('\n');
        expect(text).toContain('could not read/parse pendingHumanReviewIds.json');
    });
});
