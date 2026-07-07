#!/usr/bin/env node
/**
 * NightFuel — CI guard: keep DEMO_URLS (backend) and GRANDFATHERED (mobile)
 * key-for-key + URL-for-URL in sync.
 *
 * Background: there are TWO hand-maintained curated-YouTube maps in the repo:
 *
 *   - services/exercise-service/src/exercise.service.ts          → DEMO_URLS
 *   - clients/mobile/src/constants/curatedDemos.ts               → GRANDFATHERED
 *     (the `verified: true` block inside curatedDemos.ts)
 *
 * The exercise-service map is consumed by the public REST endpoints that
 * resolve a stored `demo_url` per LibraryExercise; the mobile map is the
 * client-side fallback shown in the workout player. Both render the SAME
 * curated YouTube watch URL to the user. If they drift, the user sees one
 * video on the catalog screen and a DIFFERENT video on the player screen for
 * the same exercise — a silent UX regression with no log signal.
 *
 * This script parses BOTH files as plain text (no `require()` so it does not
 * pull in TypeScript or any runtime dep) and fails (exit 1) on:
 *
 *   - any name in DEMO_URLS that is absent from GRANDFATHERED,
 *   - any name in GRANDFATHERED that is absent from DEMO_URLS,
 *   - any name present in both whose YouTube URL differs.
 *
 * The script is intentionally dependency-free (only Node built-ins `fs` and
 * `path`) so it runs in any CI environment and inside scripts/gate.js without
 * a prior `npm install` of a parser/AST package. The parser is a pair of
 * narrow regexes anchored on the exact opening literal of each declaration:
 *
 *   DEMO_URLS opener:       `const DEMO_URLS: Record<string, string> = {`
 *   GRANDFATHERED opener:   `const GRANDFATHERED: Readonly<Record<string, CuratedDemo>> = {`
 *
 * Inside each declaration's body (up to the next `};` at the start of a line)
 * the script extracts `(name, url)` tuples:
 *
 *   - DEMO_URLS entries:    `'Name': 'https://www.youtube.com/watch?v=...'`
 *   - GRANDFATHERED entries: `'Name': { kind: 'youtube', url: 'https://...', verified: true }`
 *
 * Only `kind: 'youtube'` GRANDFATHERED entries are considered — the
 * `fedb_frames` / `gif` entries (added in later tranches of curatedDemos.ts)
 * are NOT mirrored by the backend map and must be ignored, otherwise the
 * script would flag every non-YouTube entry as missing from DEMO_URLS.
 *
 * Output:
 *   - Clean state:   prints `OK`, exits 0.
 *   - Drift found:   prints a key-by-key diff (one line per offending name),
 *                    then exits 1. Three classes of failure are reported:
 *                      * `[only-in-DEMO_URLS]    <name> = <url>`
 *                      * `[only-in-GRANDFATHERED] <name> = <url>`
 *                      * `[url-mismatch]         <name>
 *                           DEMO_URLS    = <url>
 *                           GRANDFATHERED = <url>`
 *
 * Internals are re-exported on `module.exports.__test` so the unit test
 * (scripts/__tests__/check-demo-maps-in-sync.test.js, if added by a future
 * sprint) can exercise the parser against fixture snippets without booting
 * a child process.
 *
 * Usage:   node scripts/check-demo-maps-in-sync.js
 * Exit:    0 = clean (prints 'OK'); 1 = drift detected (prints diff).
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Repo root is one level up from /scripts.
const REPO_ROOT = path.resolve(__dirname, '..');

// The two source-of-truth files. Paths are absolute so this script can be
// invoked from any cwd (CI, husky, gate.js, a developer's terminal, etc).
const EXERCISE_SERVICE_TS = path.join(
    REPO_ROOT,
    'services',
    'exercise-service',
    'src',
    'exercise.service.ts',
);
const CURATED_DEMOS_TS = path.join(
    REPO_ROOT,
    'clients',
    'mobile',
    'src',
    'constants',
    'curatedDemos.ts',
);

/**
 * Extract the substring of `source` that lies between the `openerLiteral`
 * line and the FIRST subsequent line whose trimmed content equals `};`.
 *
 * The opener is matched as a plain substring (no regex), which is robust to
 * any whitespace inside the type annotation that a future refactor might
 * tweak. We then walk lines forward until we hit a `};` close — that matches
 * the actual closing brace of the object literal as written in both files
 * (`};` on its own line, top-level indentation 0).
 *
 * Returns `null` if either the opener or the close cannot be found — the
 * caller treats that as a hard parse failure (the script's structure
 * assumption no longer holds; better to fail loud than silently report a
 * stale diff).
 */
function extractBlock(source, openerLiteral) {
    const openIdx = source.indexOf(openerLiteral);
    if (openIdx === -1) return null;

    // Start scanning AFTER the opener line so we don't immediately match a
    // `};` that sits on the same line (it won't for either real file, but
    // belt + braces).
    const afterOpener = source.indexOf('\n', openIdx);
    if (afterOpener === -1) return null;

    const rest = source.slice(afterOpener + 1);
    // Match the first `};` (optionally with trailing whitespace) at the
    // start of a line. The `m` flag makes `^` match per-line. We do NOT
    // require column 0 indentation — `};` could be indented under a wrapping
    // block in some future refactor — but the regex still requires `};` to
    // appear at the beginning of its own (post-trim) line, which both real
    // files satisfy.
    const closeRe = /^\s*\};\s*$/m;
    const closeMatch = closeRe.exec(rest);
    if (!closeMatch) return null;

    return rest.slice(0, closeMatch.index);
}

/**
 * Parse `'Name': 'https://...'` entries out of the DEMO_URLS block body.
 *
 * Returns an array of `{ name, url }` tuples in source order. Lines that
 * look like comments (`// ...`) or do not match the entry shape are
 * silently skipped — those are the section-header comments inside the
 * declaration, plus any blank lines.
 *
 * The regex is intentionally narrow:
 *   - Key is single-quoted.
 *   - URL must start with `https://` so we never accept a non-URL value
 *     (defends against a future refactor that inlines a non-URL placeholder).
 *   - Trailing comma is OPTIONAL so the LAST entry (no trailing comma) is
 *     still captured.
 */
function parseDemoUrlsBody(body) {
    const out = [];
    // Use a global regex to walk every entry. Single-quoted key + single-
    // quoted URL with an `https://` schema.
    const entryRe = /^\s*'([^']+)'\s*:\s*'(https:\/\/[^']+)'\s*,?\s*$/gm;
    let m;
    while ((m = entryRe.exec(body)) !== null) {
        out.push({ name: m[1], url: m[2] });
    }
    return out;
}

/**
 * Parse `'Name': { kind: 'youtube', url: 'https://...', verified: true }`
 * entries out of the GRANDFATHERED block body.
 *
 * Returns an array of `{ name, url }` tuples (the `verified` flag is checked
 * by the regex itself but not surfaced — every GRANDFATHERED entry is
 * `verified: true` by construction, and this script does not need to know).
 *
 * The regex is anchored on `kind: 'youtube'` to deliberately exclude
 * `fedb_frames` / `gif` entries that live elsewhere in the same file but in
 * other declarations (and that, if a future refactor moved them into
 * GRANDFATHERED, must NOT be mirror-checked against the backend's text-only
 * DEMO_URLS map).
 */
function parseGrandfatheredBody(body) {
    const out = [];
    // The shape we expect:
    //   'Name': { kind: 'youtube', url: 'https://...', verified: true },
    // Fields can be in any order in principle, but every real entry in
    // curatedDemos.ts uses this exact order. The regex tolerates either
    // ordering via two passes (kind/url/verified or url/kind/verified or
    // verified-first) only if needed — for now we anchor on the actual
    // shape because the file is consistent and the parser is only ever as
    // forgiving as it needs to be.
    const entryRe =
        /^\s*'([^']+)'\s*:\s*\{\s*kind:\s*'youtube'\s*,\s*url:\s*'(https:\/\/[^']+)'\s*,\s*verified:\s*true\s*\}\s*,?\s*$/gm;
    let m;
    while ((m = entryRe.exec(body)) !== null) {
        out.push({ name: m[1], url: m[2] });
    }
    return out;
}

/**
 * Convert an array of `{ name, url }` tuples into a `Map<string, string>`,
 * detecting duplicate keys along the way (a duplicate key in EITHER file
 * would silently overwrite in JS at runtime, but here we want to surface it
 * because two entries for the same exercise name is itself a drift bug).
 *
 * Returns `{ map, duplicates: string[] }`. `duplicates` is non-empty if any
 * key appeared more than once; the caller treats that as a hard failure
 * separate from the cross-file diff.
 */
function tuplesToMap(tuples) {
    const map = new Map();
    const duplicates = [];
    for (const { name, url } of tuples) {
        if (map.has(name)) {
            duplicates.push(name);
        } else {
            map.set(name, url);
        }
    }
    return { map, duplicates };
}

/**
 * Diff two name -> url maps. Returns three sorted arrays:
 *   - `onlyInA`:    names in `a` but not `b`.
 *   - `onlyInB`:    names in `b` but not `a`.
 *   - `mismatched`: names in both, where `a.get(name) !== b.get(name)`.
 *     Each mismatch carries both URLs so the failure log shows the diff.
 */
function diffMaps(a, b) {
    const onlyInA = [];
    const onlyInB = [];
    const mismatched = [];

    for (const [name, urlA] of a) {
        if (!b.has(name)) {
            onlyInA.push({ name, url: urlA });
        } else {
            const urlB = b.get(name);
            if (urlA !== urlB) {
                mismatched.push({ name, urlA, urlB });
            }
        }
    }
    for (const [name, urlB] of b) {
        if (!a.has(name)) {
            onlyInB.push({ name, url: urlB });
        }
    }

    // Sort by name for stable output across runs — important so the failure
    // log diffs cleanly in CI when the underlying source files are edited.
    onlyInA.sort((x, y) => x.name.localeCompare(y.name));
    onlyInB.sort((x, y) => x.name.localeCompare(y.name));
    mismatched.sort((x, y) => x.name.localeCompare(y.name));

    return { onlyInA, onlyInB, mismatched };
}

function main() {
    // Read both files. If either is missing the script fails loudly — a
    // missing source-of-truth file is a more serious bug than the drift this
    // script normally catches.
    let exerciseServiceSrc;
    try {
        exerciseServiceSrc = fs.readFileSync(EXERCISE_SERVICE_TS, 'utf8');
    } catch (err) {
        console.error(
            `check-demo-maps-in-sync: cannot read ${path.relative(REPO_ROOT, EXERCISE_SERVICE_TS)} — ${err.message}`,
        );
        process.exit(1);
    }
    let curatedDemosSrc;
    try {
        curatedDemosSrc = fs.readFileSync(CURATED_DEMOS_TS, 'utf8');
    } catch (err) {
        console.error(
            `check-demo-maps-in-sync: cannot read ${path.relative(REPO_ROOT, CURATED_DEMOS_TS)} — ${err.message}`,
        );
        process.exit(1);
    }

    // Slice each file down to just the body of the relevant declaration.
    // The opener literals are matched verbatim so a future rename (e.g. to
    // `DEMO_URLS_V2`) immediately surfaces as a parser failure rather than
    // a silently-empty diff.
    const demoUrlsBody = extractBlock(
        exerciseServiceSrc,
        'const DEMO_URLS: Record<string, string> = {',
    );
    if (demoUrlsBody === null) {
        console.error(
            `check-demo-maps-in-sync: could not locate \`const DEMO_URLS: Record<string, string> = { ... };\` in ${path.relative(REPO_ROOT, EXERCISE_SERVICE_TS)}. Did the declaration get renamed?`,
        );
        process.exit(1);
    }
    const grandfatheredBody = extractBlock(
        curatedDemosSrc,
        'const GRANDFATHERED: Readonly<Record<string, CuratedDemo>> = {',
    );
    if (grandfatheredBody === null) {
        console.error(
            `check-demo-maps-in-sync: could not locate \`const GRANDFATHERED: Readonly<Record<string, CuratedDemo>> = { ... };\` in ${path.relative(REPO_ROOT, CURATED_DEMOS_TS)}. Did the declaration get renamed?`,
        );
        process.exit(1);
    }

    // Parse each block body into a list of (name, url) tuples.
    const demoUrlsTuples = parseDemoUrlsBody(demoUrlsBody);
    const grandfatheredTuples = parseGrandfatheredBody(grandfatheredBody);

    // Sanity check: both blocks MUST contain at least one entry. An empty
    // parse usually means the regex stopped matching — better to fail
    // loud than to silently report "OK" because both sides are empty.
    if (demoUrlsTuples.length === 0) {
        console.error(
            `check-demo-maps-in-sync: parser found 0 entries in DEMO_URLS — the file shape may have changed. Refusing to report \`OK\` on a zero-entry parse.`,
        );
        process.exit(1);
    }
    if (grandfatheredTuples.length === 0) {
        console.error(
            `check-demo-maps-in-sync: parser found 0 entries in GRANDFATHERED — the file shape may have changed. Refusing to report \`OK\` on a zero-entry parse.`,
        );
        process.exit(1);
    }

    const { map: demoUrlsMap, duplicates: demoUrlsDupes } = tuplesToMap(demoUrlsTuples);
    const { map: grandfatheredMap, duplicates: grandfatheredDupes } =
        tuplesToMap(grandfatheredTuples);

    const failures = [];

    if (demoUrlsDupes.length > 0) {
        failures.push(
            `duplicate key(s) in DEMO_URLS: ${demoUrlsDupes.join(', ')}`,
        );
    }
    if (grandfatheredDupes.length > 0) {
        failures.push(
            `duplicate key(s) in GRANDFATHERED: ${grandfatheredDupes.join(', ')}`,
        );
    }

    const { onlyInA, onlyInB, mismatched } = diffMaps(demoUrlsMap, grandfatheredMap);

    if (onlyInA.length > 0 || onlyInB.length > 0 || mismatched.length > 0) {
        for (const { name, url } of onlyInA) {
            failures.push(`[only-in-DEMO_URLS]      '${name}' = '${url}'`);
        }
        for (const { name, url } of onlyInB) {
            failures.push(`[only-in-GRANDFATHERED]  '${name}' = '${url}'`);
        }
        for (const { name, urlA, urlB } of mismatched) {
            failures.push(
                `[url-mismatch]           '${name}'\n      DEMO_URLS      = '${urlA}'\n      GRANDFATHERED  = '${urlB}'`,
            );
        }
    }

    if (failures.length > 0) {
        console.error(
            'check-demo-maps-in-sync: DEMO_URLS (services/exercise-service/src/exercise.service.ts) and GRANDFATHERED (clients/mobile/src/constants/curatedDemos.ts) are out of sync.',
        );
        console.error(
            'Both maps MUST be edited together so the user sees the same curated YouTube video on the catalog and the player.',
        );
        for (const line of failures) {
            console.error(`  ${line}`);
        }
        process.exit(1);
    }

    console.log('OK');
    process.exit(0);
}

// Run main() only when invoked as a script — the (future) unit test imports
// this file for the parser helpers without wanting the side-effect of an
// exit.
if (require.main === module) {
    main();
}

// Expose internals for the unit test fixture suite.
module.exports.__test = {
    extractBlock,
    parseDemoUrlsBody,
    parseGrandfatheredBody,
    tuplesToMap,
    diffMaps,
    EXERCISE_SERVICE_TS,
    CURATED_DEMOS_TS,
};
