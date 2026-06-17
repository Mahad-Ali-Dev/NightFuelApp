/**
 * Unit test — scripts/check-demo-maps-in-sync.js parser + diff contract.
 *
 * The guard script (scripts/check-demo-maps-in-sync.js) keeps the TWO
 * hand-maintained curated-YouTube maps in the repo key-for-key + URL-for-URL
 * in sync:
 *
 *   - services/exercise-service/src/exercise.service.ts → DEMO_URLS
 *   - clients/mobile/src/constants/curatedDemos.ts       → GRANDFATHERED
 *     (the `verified: true`, `kind: 'youtube'` block)
 *
 * Both render the SAME curated YouTube watch URL to the user (catalog screen
 * via the backend `demo_url`/`resolveDemoUrl` pipeline; player screen via the
 * mobile `getCuratedDemo` fallback). If they drift, the user sees one video on
 * the catalog and a DIFFERENT video on the player for the same exercise — a
 * silent UX regression with no log signal.
 *
 * This suite locks the script's text parser and diff in:
 *
 *   - extractBlock         — slices the object-literal body out of each file.
 *   - parseDemoUrlsBody    — `'Name': 'https://...'` tuples.
 *   - parseGrandfatheredBody — `'Name': { kind:'youtube', url:'...', verified:true }`
 *                            tuples, deliberately IGNORING fedb_frames / gif kinds.
 *   - diffMaps             — only-in-A / only-in-B / url-mismatch reporting.
 *
 * If anyone narrows the parser so a real entry slips past, widens it so a
 * non-YouTube kind leaks in, or weakens diffMaps so drift goes unreported,
 * these assertions go red BEFORE the change reaches CI — which is what lets
 * the gate promote `check-demo-maps-in-sync.js` from an optional
 * fs.existsSync-guarded step to a HARD (non-fs-guarded) gate step.
 *
 * Plain JS (not TS) on purpose: the script under test is plain JS too, so the
 * test stays close to the production surface and runs under the gate's
 * harness-self-test jest pass (`--transform '{}'`, no babel/ts-jest). We import
 * the pure helpers via the script's `module.exports.__test` back-door.
 * Importing the module is safe: main() only runs under the
 * require.main === module guard inside the script.
 *
 * Run from repo root: `npx jest scripts/__tests__/check-demo-maps-in-sync.test.js`
 */

'use strict';

const fs = require('fs');
const path = require('path');

const { __test } = require(path.resolve(__dirname, '..', 'check-demo-maps-in-sync.js'));
const {
    extractBlock,
    parseDemoUrlsBody,
    parseGrandfatheredBody,
    tuplesToMap,
    diffMaps,
    EXERCISE_SERVICE_TS,
    CURATED_DEMOS_TS,
} = __test;

// Small helper: turn a tuple list into a plain name->url Map (the script does
// this via tuplesToMap; we reuse it so the test exercises the real path).
function mapOf(tuples) {
    return tuplesToMap(tuples).map;
}

describe('check-demo-maps-in-sync — extractBlock', () => {
    const OPENER = 'const DEMO_URLS: Record<string, string> = {';

    test('opener found → returns the body up to the first `};`', () => {
        const source = [
            '// preamble',
            OPENER,
            "    'A': 'https://www.youtube.com/watch?v=aaa',",
            "    'B': 'https://www.youtube.com/watch?v=bbb',",
            '};',
            '',
            'const SOMETHING_ELSE = {',
            "    'C': 'https://www.youtube.com/watch?v=ccc',",
            '};',
        ].join('\n');

        const body = extractBlock(source, OPENER);
        expect(body).not.toBeNull();
        // The two real entries are present…
        expect(body).toContain("'A': 'https://www.youtube.com/watch?v=aaa'");
        expect(body).toContain("'B': 'https://www.youtube.com/watch?v=bbb'");
        // …and the body STOPS at the first `};`, so the unrelated later block
        // (entry 'C') is NOT swept in.
        expect(body).not.toContain("'C'");
    });

    test('opener missing → null', () => {
        const source = [
            'const SOME_OTHER_MAP = {',
            "    'A': 'https://www.youtube.com/watch?v=aaa',",
            '};',
        ].join('\n');
        expect(extractBlock(source, OPENER)).toBeNull();
    });

    test('close (`};`) missing → null', () => {
        const source = [
            OPENER,
            "    'A': 'https://www.youtube.com/watch?v=aaa',",
            "    'B': 'https://www.youtube.com/watch?v=bbb',",
            // …intentionally no closing `};` line.
        ].join('\n');
        expect(extractBlock(source, OPENER)).toBeNull();
    });

    test('`};` matched at start of its own line even when indented', () => {
        // The close regex is /^\s*\};\s*$/m — it tolerates leading whitespace,
        // so an indented close (e.g. a future wrapping refactor) still terminates
        // the block.
        const source = [
            OPENER,
            "    'A': 'https://www.youtube.com/watch?v=aaa',",
            '    };',
        ].join('\n');
        const body = extractBlock(source, OPENER);
        expect(body).not.toBeNull();
        expect(body).toContain("'A': 'https://www.youtube.com/watch?v=aaa'");
    });
});

describe('check-demo-maps-in-sync — parseDemoUrlsBody', () => {
    test('parses single-quoted `Name: url` entries, skipping comments + blanks', () => {
        const body = [
            '    // Gym',
            "    'Barbell Bench Press': 'https://www.youtube.com/watch?v=rT7DgCr-3pg',",
            '',
            "    'Pull-Up': 'https://www.youtube.com/watch?v=eGo4IYlbE5g',",
            '    // trailing section comment',
            // Last entry with NO trailing comma must still be captured.
            "    'Plank': 'https://www.youtube.com/watch?v=pSHjTRCQxIw'",
        ].join('\n');

        const tuples = parseDemoUrlsBody(body);
        expect(tuples).toEqual([
            { name: 'Barbell Bench Press', url: 'https://www.youtube.com/watch?v=rT7DgCr-3pg' },
            { name: 'Pull-Up', url: 'https://www.youtube.com/watch?v=eGo4IYlbE5g' },
            { name: 'Plank', url: 'https://www.youtube.com/watch?v=pSHjTRCQxIw' },
        ]);
    });

    test('ignores entries whose value is not an https:// URL', () => {
        // The URL must start with https:// — a non-URL placeholder is rejected
        // so a future refactor that inlines a non-URL value never slips past.
        const body = [
            "    'Good Entry': 'https://www.youtube.com/watch?v=ok',",
            "    'Http Entry': 'http://www.youtube.com/watch?v=insecure',",
            "    'Bare Entry': 'TODO',",
        ].join('\n');
        const tuples = parseDemoUrlsBody(body);
        expect(tuples).toEqual([
            { name: 'Good Entry', url: 'https://www.youtube.com/watch?v=ok' },
        ]);
    });
});

describe('check-demo-maps-in-sync — parseGrandfatheredBody', () => {
    test('parses `kind:youtube` entries (verified:true) into name/url tuples', () => {
        const body = [
            '    // ── Gym ──',
            "    'Barbell Bench Press': { kind: 'youtube', url: 'https://www.youtube.com/watch?v=rT7DgCr-3pg', verified: true },",
            "    'Pull-Up': { kind: 'youtube', url: 'https://www.youtube.com/watch?v=eGo4IYlbE5g', verified: true },",
            // Last entry, no trailing comma — must still be captured.
            "    'Plank': { kind: 'youtube', url: 'https://www.youtube.com/watch?v=pSHjTRCQxIw', verified: true }",
        ].join('\n');

        const tuples = parseGrandfatheredBody(body);
        expect(tuples).toEqual([
            { name: 'Barbell Bench Press', url: 'https://www.youtube.com/watch?v=rT7DgCr-3pg' },
            { name: 'Pull-Up', url: 'https://www.youtube.com/watch?v=eGo4IYlbE5g' },
            { name: 'Plank', url: 'https://www.youtube.com/watch?v=pSHjTRCQxIw' },
        ]);
    });

    test('IGNORES non-youtube kinds (fedb_frames / gif) — they are not mirrored by DEMO_URLS', () => {
        // This is the crux: the backend DEMO_URLS map is YouTube-only, so a
        // fedb_frames / gif entry living in (a hypothetical move into) the
        // GRANDFATHERED block must NOT be flagged as "missing from DEMO_URLS".
        const body = [
            "    'YouTube One': { kind: 'youtube', url: 'https://www.youtube.com/watch?v=yt1', verified: true },",
            "    'Frames One': { kind: 'fedb_frames', url: 'https://raw.githubusercontent.com/x/0.jpg|https://raw.githubusercontent.com/x/1.jpg', verified: true },",
            "    'Gif One': { kind: 'gif', url: 'https://cdn.example.com/demo.gif', verified: true },",
            "    'YouTube Two': { kind: 'youtube', url: 'https://www.youtube.com/watch?v=yt2', verified: true },",
        ].join('\n');

        const tuples = parseGrandfatheredBody(body);
        expect(tuples).toEqual([
            { name: 'YouTube One', url: 'https://www.youtube.com/watch?v=yt1' },
            { name: 'YouTube Two', url: 'https://www.youtube.com/watch?v=yt2' },
        ]);
        // Belt + braces: neither non-youtube name leaks through.
        const names = tuples.map((t) => t.name);
        expect(names).not.toContain('Frames One');
        expect(names).not.toContain('Gif One');
    });

    test('requires verified:true — an http:// url or missing verified flag is ignored', () => {
        const body = [
            "    'Good': { kind: 'youtube', url: 'https://www.youtube.com/watch?v=ok', verified: true },",
            // verified:false → not part of the grandfathered mirror set.
            "    'Unverified': { kind: 'youtube', url: 'https://www.youtube.com/watch?v=pending', verified: false },",
            // insecure scheme → rejected by the https:// anchor.
            "    'Insecure': { kind: 'youtube', url: 'http://www.youtube.com/watch?v=insecure', verified: true },",
        ].join('\n');
        const tuples = parseGrandfatheredBody(body);
        expect(tuples).toEqual([
            { name: 'Good', url: 'https://www.youtube.com/watch?v=ok' },
        ]);
    });
});

describe('check-demo-maps-in-sync — diffMaps', () => {
    test('identical maps → no failures', () => {
        const a = mapOf([
            { name: 'A', url: 'https://www.youtube.com/watch?v=aaa' },
            { name: 'B', url: 'https://www.youtube.com/watch?v=bbb' },
        ]);
        const b = mapOf([
            { name: 'B', url: 'https://www.youtube.com/watch?v=bbb' },
            { name: 'A', url: 'https://www.youtube.com/watch?v=aaa' },
        ]);
        const { onlyInA, onlyInB, mismatched } = diffMaps(a, b);
        expect(onlyInA).toEqual([]);
        expect(onlyInB).toEqual([]);
        expect(mismatched).toEqual([]);
    });

    test('a name only in A → reported in onlyInA (and not as a mismatch)', () => {
        const a = mapOf([
            { name: 'A', url: 'https://www.youtube.com/watch?v=aaa' },
            { name: 'OnlyA', url: 'https://www.youtube.com/watch?v=zzz' },
        ]);
        const b = mapOf([{ name: 'A', url: 'https://www.youtube.com/watch?v=aaa' }]);
        const { onlyInA, onlyInB, mismatched } = diffMaps(a, b);
        expect(onlyInA).toEqual([{ name: 'OnlyA', url: 'https://www.youtube.com/watch?v=zzz' }]);
        expect(onlyInB).toEqual([]);
        expect(mismatched).toEqual([]);
    });

    test('a name only in B → reported in onlyInB', () => {
        const a = mapOf([{ name: 'A', url: 'https://www.youtube.com/watch?v=aaa' }]);
        const b = mapOf([
            { name: 'A', url: 'https://www.youtube.com/watch?v=aaa' },
            { name: 'OnlyB', url: 'https://www.youtube.com/watch?v=yyy' },
        ]);
        const { onlyInA, onlyInB, mismatched } = diffMaps(a, b);
        expect(onlyInA).toEqual([]);
        expect(onlyInB).toEqual([{ name: 'OnlyB', url: 'https://www.youtube.com/watch?v=yyy' }]);
        expect(mismatched).toEqual([]);
    });

    test('a name in both with a differing URL → reported as a url-mismatch carrying both URLs', () => {
        const a = mapOf([{ name: 'Shared', url: 'https://www.youtube.com/watch?v=AAA' }]);
        const b = mapOf([{ name: 'Shared', url: 'https://www.youtube.com/watch?v=BBB' }]);
        const { onlyInA, onlyInB, mismatched } = diffMaps(a, b);
        expect(onlyInA).toEqual([]);
        expect(onlyInB).toEqual([]);
        expect(mismatched).toEqual([
            { name: 'Shared', urlA: 'https://www.youtube.com/watch?v=AAA', urlB: 'https://www.youtube.com/watch?v=BBB' },
        ]);
    });

    test('reports are sorted by name for stable CI diffs', () => {
        const a = mapOf([
            { name: 'Zeta', url: 'https://www.youtube.com/watch?v=z' },
            { name: 'Alpha', url: 'https://www.youtube.com/watch?v=a' },
        ]);
        const b = new Map(); // empty → everything is only-in-A
        const { onlyInA } = diffMaps(a, b);
        expect(onlyInA.map((x) => x.name)).toEqual(['Alpha', 'Zeta']);
    });
});

describe('check-demo-maps-in-sync — end-to-end on the REAL source files (locks current in-sync state)', () => {
    // Read the two real files via the script's exported absolute paths and run
    // the exact parse + diff pipeline the guard uses. This pins the CURRENT
    // in-sync state: if anyone edits DEMO_URLS or the GRANDFATHERED youtube
    // block without mirroring the other, this assertion fails here too (in
    // addition to the standalone `node scripts/check-demo-maps-in-sync.js`).
    function loadRealMaps() {
        const exerciseSrc = fs.readFileSync(EXERCISE_SERVICE_TS, 'utf8');
        const curatedSrc = fs.readFileSync(CURATED_DEMOS_TS, 'utf8');

        const demoUrlsBody = extractBlock(
            exerciseSrc,
            'const DEMO_URLS: Record<string, string> = {',
        );
        const grandfatheredBody = extractBlock(
            curatedSrc,
            'const GRANDFATHERED: Readonly<Record<string, CuratedDemo>> = {',
        );

        return { demoUrlsBody, grandfatheredBody };
    }

    test('both declaration blocks are locatable in the real files', () => {
        const { demoUrlsBody, grandfatheredBody } = loadRealMaps();
        expect(demoUrlsBody).not.toBeNull();
        expect(grandfatheredBody).not.toBeNull();
    });

    test('both real maps parse to a non-empty set of entries', () => {
        const { demoUrlsBody, grandfatheredBody } = loadRealMaps();
        const demoTuples = parseDemoUrlsBody(demoUrlsBody);
        const grandTuples = parseGrandfatheredBody(grandfatheredBody);
        // A zero-entry parse means the regex stopped matching — the guard
        // itself fails closed on this, so we pin it here too.
        expect(demoTuples.length).toBeGreaterThan(0);
        expect(grandTuples.length).toBeGreaterThan(0);
    });

    test('diffMaps(parse(DEMO_URLS), parse(GRANDFATHERED-youtube)) yields ZERO failures on the current tree', () => {
        const { demoUrlsBody, grandfatheredBody } = loadRealMaps();
        const demoMap = mapOf(parseDemoUrlsBody(demoUrlsBody));
        const grandMap = mapOf(parseGrandfatheredBody(grandfatheredBody));

        const { onlyInA, onlyInB, mismatched } = diffMaps(demoMap, grandMap);
        // Surface the offending names if this ever fails, so the CI log is
        // self-explanatory.
        expect({
            onlyInDemoUrls: onlyInA.map((x) => x.name),
            onlyInGrandfathered: onlyInB.map((x) => x.name),
            urlMismatches: mismatched.map((x) => x.name),
        }).toEqual({ onlyInDemoUrls: [], onlyInGrandfathered: [], urlMismatches: [] });
    });

    test('editing a URL in an in-test fixture map makes diffMaps report the drift (guard is live)', () => {
        // Take the REAL parsed DEMO_URLS map, clone it, and corrupt ONE URL in
        // the clone (never the real source files). diffMaps must then report
        // exactly that one name as a url-mismatch — proving the guard would
        // catch a real drift.
        const { demoUrlsBody, grandfatheredBody } = loadRealMaps();
        const demoMap = mapOf(parseDemoUrlsBody(demoUrlsBody));
        const grandMap = mapOf(parseGrandfatheredBody(grandfatheredBody));

        const firstName = [...demoMap.keys()][0];
        const corrupted = new Map(demoMap);
        corrupted.set(firstName, 'https://www.youtube.com/watch?v=__DRIFTED__');

        const { onlyInA, onlyInB, mismatched } = diffMaps(corrupted, grandMap);
        expect(onlyInA).toEqual([]);
        expect(onlyInB).toEqual([]);
        expect(mismatched.map((x) => x.name)).toEqual([firstName]);
    });
});
