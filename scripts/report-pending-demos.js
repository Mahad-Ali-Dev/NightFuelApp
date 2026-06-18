#!/usr/bin/env node
/**
 * Zeitra — reviewer report for the demo-maps human-review pipeline.
 *
 * Background: clients/mobile/src/constants/curatedDemos.ts ships a curated demo
 * for >=100 exercise names in three shapes (kind: 'youtube' | 'fedb_frames' |
 * 'gif'). The 35 GRANDFATHERED youtube entries are `verified: true` (already
 * shown to users); EVERY other tranche ships `verified: false` until a human
 * reviewer eyeballs the URL and (in a SEPARATE, user-gated step) flips it to
 * true. The youtube subset of those unreviewed entries is mirrored, id-for-id,
 * into clients/mobile/src/constants/pendingHumanReviewIds.json so a reviewer
 * has a flat checklist of video ids.
 *
 * Reviewing that backlog today means reading curatedDemos.ts by hand and
 * mentally cross-referencing the JSON. This script removes that toil: it prints
 * an at-a-glance report of every `verified: false` entry grouped by kind (name
 * + URL + a per-kind count) and FLAGS any drift between the unreviewed youtube
 * ids and pendingHumanReviewIds.json — in BOTH directions.
 *
 * It is deliberately:
 *   - DEPENDENCY-FREE  — only Node built-ins `fs` and `path`, exactly like its
 *     sibling guard scripts/check-demo-maps-in-sync.js, so it runs in any CI
 *     environment with no prior `npm install` of a parser/AST package.
 *   - INFORMATIONAL    — it ALWAYS exits 0. It is wired as the OPTIONAL npm
 *     script `report:pending-demos` only; it is NOT a step in scripts/gate.js
 *     and can never block a merge.
 *   - READ-ONLY        — it NEVER writes, and NEVER flips any `verified` flag
 *     (that review step is user-gated and out of scope here).
 *
 * Why parse curatedDemos.ts as TEXT (not `require()` it): the harness-self-test
 * jest pass that runs this script's unit test uses `--transform '{}'`, which
 * disables the babel/ts transform stack — so a `.ts` module cannot be imported.
 * We read the source as a string and scan it with the same narrow,
 * well-commented regexes the sibling guard uses.
 *
 * HOW the `verified: false` entries are derived (mirrors the file's own
 * architecture — see buildCuratedDemos() in curatedDemos.ts):
 *
 *   - GRANDFATHERED        → kind:'youtube', verified:TRUE  (the ONLY verified
 *                            block; intentionally NOT reported here).
 *   - FEDB_BACKED_SLUGS    → kind:'fedb_frames', verified:FALSE. Source shape is
 *                            `'Name': 'Slug'`; the runtime URL is the pipe-joined
 *                            `<base>/<slug>/0.jpg|<base>/<slug>/1.jpg` pair, which
 *                            we reconstruct with the same FEDB_BASE + fedbPair
 *                            logic the module uses.
 *   - YOUTUBE_PENDING      → kind:'youtube', verified:FALSE. Source shape is
 *                            `'Name': 'https://www.youtube.com/watch?v=<id>'`.
 *   - GIF_PENDING          → kind:'gif', verified:FALSE. Source shape is
 *                            `'Name': 'https://upload.wikimedia.org/.../x.gif'`.
 *
 * Because GRANDFATHERED is the only verified:true block, every entry in those
 * three pending blocks IS a verified:false entry by construction — the same
 * invariant getPendingHumanReviewIds() relies on (it picks youtube + !verified,
 * which only YOUTUBE_PENDING satisfies). So parsing the three pending blocks
 * yields exactly the verified:false set, grouped by kind, with no need to
 * evaluate the TypeScript.
 *
 * Drift (youtube only — the JSON mirror is youtube-ids-only by design):
 *   - the unreviewed youtube ids extracted from YOUTUBE_PENDING urls, vs
 *   - the ids listed in pendingHumanReviewIds.json
 *   reported in BOTH directions:
 *     * `pending-in-source-missing-from-json` — an unreviewed youtube id in
 *       curatedDemos.ts with no matching json entry (the reviewer's checklist
 *       is missing a real backlog item).
 *     * `in-json-no-unreviewed-youtube-entry` — a json id that no longer maps
 *       to any verified:false youtube entry (stale — e.g. the entry was flipped
 *       to verified:true or removed, but the json was not pruned).
 *
 * Usage:   node scripts/report-pending-demos.js
 * Exit:    ALWAYS 0 (informational). It prints the report + a drift section; a
 *          non-empty drift section is surfaced loudly in the output but does NOT
 *          change the exit code.
 *
 * Internals are re-exported on `module.exports.__test` so the unit test
 * (scripts/__tests__/report-pending-demos.test.js) can exercise the pure
 * parser on inline fixture strings without booting a child process.
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Repo root is one level up from /scripts.
const REPO_ROOT = path.resolve(__dirname, '..');

// The single source-of-truth files. Absolute so the script can be invoked from
// any cwd (CI, an npm script, a developer's terminal, etc).
const CURATED_DEMOS_TS = path.join(
    REPO_ROOT,
    'clients',
    'mobile',
    'src',
    'constants',
    'curatedDemos.ts',
);
const PENDING_REVIEW_JSON = path.join(
    REPO_ROOT,
    'clients',
    'mobile',
    'src',
    'constants',
    'pendingHumanReviewIds.json',
);

// FEDB frame-pair base — mirror of the FEDB_BASE / fedbPair() constants in
// curatedDemos.ts. Kept in lock-step so the reconstructed fedb_frames URL in
// the report matches the runtime URL byte-for-byte. (If the module's base ever
// changes, update this too — it is display-only here, never networked.)
const FEDB_BASE =
    'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises';

/** Build the pipe-joined `0.jpg|1.jpg` HTTPS frame-pair URL for a FEDB slug. */
function fedbPair(slug) {
    return `${FEDB_BASE}/${slug}/0.jpg|${FEDB_BASE}/${slug}/1.jpg`;
}

/**
 * Extract the substring of `source` between the `openerLiteral` line and the
 * FIRST subsequent line whose trimmed content is `};`.
 *
 * Identical in spirit to check-demo-maps-in-sync.js's extractBlock: the opener
 * is matched as a plain substring (robust to whitespace inside the type
 * annotation), then we walk forward to the first `};` at the start of a line.
 * Returns `null` if the opener or the close cannot be found — the caller treats
 * that as a hard parse failure for that block (it is logged; the script still
 * exits 0 because it is informational).
 */
function extractBlock(source, openerLiteral) {
    const openIdx = source.indexOf(openerLiteral);
    if (openIdx === -1) return null;

    // Start scanning AFTER the opener line so we never match a `};` on the
    // opener's own line.
    const afterOpener = source.indexOf('\n', openIdx);
    if (afterOpener === -1) return null;

    const rest = source.slice(afterOpener + 1);
    // First `};` (optional trailing whitespace) at the start of a line. `m`
    // makes `^` match per-line; leading whitespace is tolerated so an indented
    // close from a future wrapping refactor still terminates the block.
    const closeRe = /^\s*\};\s*$/m;
    const closeMatch = closeRe.exec(rest);
    if (!closeMatch) return null;

    return rest.slice(0, closeMatch.index);
}

/**
 * Parse `'Name': 'value'` string-valued entries out of a block body.
 *
 * Returns an array of `{ name, value }` tuples in source order. Comment lines
 * (`// …`) and blank/non-matching lines are silently skipped — those are the
 * section-header comments inside each declaration.
 *
 * Both the key and the value are single-quoted, matching every entry in the
 * FEDB_BACKED_SLUGS (`'Name': 'Slug'`), YOUTUBE_PENDING (`'Name': 'https://…'`)
 * and GIF_PENDING (`'Name': 'https://…'`) blocks. The value is captured
 * verbatim; the caller decides how to interpret it (a slug vs a URL). A trailing
 * comma is OPTIONAL so the LAST entry (no trailing comma) is still captured.
 *
 * NOTE: keys themselves never contain a single quote in this file (e.g.
 * "World's Greatest Stretch" is DOUBLE-quoted at its declaration); the
 * double-quoted variant is handled by parseStringEntriesDq below.
 */
function parseStringEntries(body) {
    const out = [];
    const entryRe = /^\s*'([^']+)'\s*:\s*'([^']*)'\s*,?\s*$/gm;
    let m;
    while ((m = entryRe.exec(body)) !== null) {
        out.push({ name: m[1], value: m[2] });
    }
    return out;
}

/**
 * Parse `"Name": 'value'` entries whose KEY is double-quoted.
 *
 * curatedDemos.ts uses a double-quoted key only when the name itself contains a
 * single quote (an apostrophe) — e.g. `"World's Greatest Stretch"`. Such a key
 * cannot be matched by the single-quoted-key regex above, so it would silently
 * drop from the report. This companion scan captures those entries. The VALUE
 * stays single-quoted (the file never double-quotes a url/slug value).
 *
 * Returns `{ name, value }` tuples in source order.
 */
function parseStringEntriesDq(body) {
    const out = [];
    const entryRe = /^\s*"([^"]+)"\s*:\s*'([^']*)'\s*,?\s*$/gm;
    let m;
    while ((m = entryRe.exec(body)) !== null) {
        out.push({ name: m[1], value: m[2] });
    }
    return out;
}

/**
 * Parse ALL `'Name': 'value'` / `"Name": 'value'` string entries from a block
 * body, merging the single- and double-quoted-key scans into one source-ordered
 * list. De-dupes by name (first occurrence wins) so the two scans never
 * double-count an entry.
 */
function parseAllStringEntries(body) {
    const seen = new Set();
    const out = [];
    for (const e of parseStringEntries(body).concat(parseStringEntriesDq(body))) {
        if (seen.has(e.name)) continue;
        seen.add(e.name);
        out.push(e);
    }
    return out;
}

/**
 * Extract a YouTube video id from a `…watch?v=<id>` URL.
 *
 * Same logic as getPendingHumanReviewIds() in curatedDemos.ts: take the
 * substring after `watch?v=`, then stop at the first `&` or `#` so an extra
 * query param can never leak into the id. Returns `null` when the marker is
 * absent or the id is empty.
 */
function youtubeIdFromUrl(url) {
    const marker = 'watch?v=';
    const at = url.indexOf(marker);
    if (at === -1) return null;
    const rest = url.slice(at + marker.length);
    const id = rest.split(/[&#]/)[0];
    return id || null;
}

/**
 * Parse curatedDemos.ts source text into the grouped `verified: false` report
 * model.
 *
 * Reads the three PENDING source blocks (each is verified:false by construction
 * — see the file header) and produces, per kind:
 *   - 'youtube'      from YOUTUBE_PENDING   (value is the watch URL)
 *   - 'fedb_frames'  from FEDB_BACKED_SLUGS (value is a slug → fedbPair() URL)
 *   - 'gif'          from GIF_PENDING       (value is the gif URL)
 *
 * Returns:
 *   {
 *     byKind: {
 *       youtube:     [{ name, url }],
 *       fedb_frames: [{ name, url, slug }],
 *       gif:         [{ name, url }],
 *     },
 *     counts:        { youtube, fedb_frames, gif, total },
 *     youtubeIds:    string[]  // de-duped + sorted unreviewed youtube ids
 *     missingBlocks: string[]  // human-readable names of any block we could
 *                              // not locate (parse-failure diagnostics)
 *   }
 *
 * Pure: no I/O. The caller reads the file and passes its text in. GRANDFATHERED
 * (verified:true) is intentionally NOT parsed — it is not part of the review
 * backlog.
 */
function parseCuratedDemosSource(source) {
    const missingBlocks = [];

    const youtubeBody = extractBlock(
        source,
        'const YOUTUBE_PENDING: Readonly<Record<string, string>> = {',
    );
    const fedbBody = extractBlock(
        source,
        'const FEDB_BACKED_SLUGS: Readonly<Record<string, string>> = {',
    );
    const gifBody = extractBlock(
        source,
        'const GIF_PENDING: Readonly<Record<string, string>> = {',
    );

    if (youtubeBody === null) missingBlocks.push('YOUTUBE_PENDING');
    if (fedbBody === null) missingBlocks.push('FEDB_BACKED_SLUGS');
    if (gifBody === null) missingBlocks.push('GIF_PENDING');

    // youtube: value is the watch URL, used verbatim.
    const youtube = (youtubeBody === null ? [] : parseAllStringEntries(youtubeBody)).map(
        ({ name, value }) => ({ name, url: value }),
    );

    // fedb_frames: value is a FEDB slug; reconstruct the pipe-joined frame-pair
    // URL the same way the module's fedbPair() does at build time.
    const fedb_frames = (fedbBody === null ? [] : parseAllStringEntries(fedbBody)).map(
        ({ name, value }) => ({ name, slug: value, url: fedbPair(value) }),
    );

    // gif: value is the gif URL, used verbatim.
    const gif = (gifBody === null ? [] : parseAllStringEntries(gifBody)).map(
        ({ name, value }) => ({ name, url: value }),
    );

    const counts = {
        youtube: youtube.length,
        fedb_frames: fedb_frames.length,
        gif: gif.length,
        total: youtube.length + fedb_frames.length + gif.length,
    };

    // De-duped + sorted unreviewed youtube ids, derived from the youtube urls.
    // Mirrors getPendingHumanReviewIds()' output contract so the drift compare
    // against pendingHumanReviewIds.json is apples-to-apples.
    const idSet = new Set();
    for (const { url } of youtube) {
        const id = youtubeIdFromUrl(url);
        if (id) idSet.add(id);
    }
    const youtubeIds = Array.from(idSet).sort();

    return {
        byKind: { youtube, fedb_frames, gif },
        counts,
        youtubeIds,
        missingBlocks,
    };
}

/**
 * Compute youtube-id drift between the unreviewed source ids and the JSON
 * mirror, in BOTH directions.
 *
 *   - `pendingInSourceMissingFromJson`: ids derived from verified:false youtube
 *     entries in curatedDemos.ts that are NOT in pendingHumanReviewIds.json
 *     (the reviewer's checklist is incomplete).
 *   - `inJsonNoUnreviewedYoutubeEntry`: ids in pendingHumanReviewIds.json that
 *     have NO matching verified:false youtube entry (stale json — the entry was
 *     flipped to verified:true or removed but the json was not pruned).
 *
 * Both arrays are sorted for stable output. `sourceIds` / `jsonIds` may be in
 * any order; this normalizes via Set membership.
 */
function computeDrift(sourceIds, jsonIds) {
    const sourceSet = new Set(sourceIds);
    const jsonSet = new Set(jsonIds);

    const pendingInSourceMissingFromJson = sourceIds
        .filter((id) => !jsonSet.has(id))
        .sort();
    const inJsonNoUnreviewedYoutubeEntry = jsonIds
        .filter((id) => !sourceSet.has(id))
        .sort();

    return { pendingInSourceMissingFromJson, inJsonNoUnreviewedYoutubeEntry };
}

/**
 * Render the full human-readable report (report body + drift section) to an
 * array of lines. Pure (no console, no I/O) so the unit test can assert on the
 * rendered text deterministically; main() joins + prints it.
 *
 * `jsonIds` is the parsed pendingHumanReviewIds.json array (or null if the file
 * could not be read/parsed — rendered as a diagnostic line).
 */
function renderReport(model, jsonIds) {
    const lines = [];
    lines.push('Zeitra — pending demo review report (informational; verified:false entries)');
    lines.push('');

    if (model.missingBlocks.length > 0) {
        lines.push(
            `WARNING: could not locate these source block(s) in curatedDemos.ts: ${model.missingBlocks.join(', ')} — their entries are omitted below (did the declaration get renamed?).`,
        );
        lines.push('');
    }

    const KIND_LABEL = {
        youtube: 'youtube (verified:false — awaiting human review)',
        fedb_frames: 'fedb_frames (verified:false — auto frame-pair, no review id)',
        gif: 'gif (verified:false — awaiting human review)',
    };

    for (const kind of ['youtube', 'fedb_frames', 'gif']) {
        const entries = model.byKind[kind];
        lines.push(`== ${KIND_LABEL[kind]} — ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'} ==`);
        if (entries.length === 0) {
            lines.push('  (none)');
        } else {
            for (const e of entries) {
                lines.push(`  - ${e.name}`);
                lines.push(`      ${e.url}`);
            }
        }
        lines.push('');
    }

    lines.push(
        `TOTAL verified:false entries: ${model.counts.total} (youtube ${model.counts.youtube}, fedb_frames ${model.counts.fedb_frames}, gif ${model.counts.gif})`,
    );
    lines.push('');

    // Drift section (youtube ids only — the JSON mirror is youtube-ids-only).
    lines.push('-- youtube-id drift vs pendingHumanReviewIds.json --');
    if (jsonIds === null) {
        lines.push(
            '  WARNING: could not read/parse pendingHumanReviewIds.json — drift not computed.',
        );
        return lines;
    }

    const { pendingInSourceMissingFromJson, inJsonNoUnreviewedYoutubeEntry } = computeDrift(
        model.youtubeIds,
        jsonIds,
    );

    lines.push(
        `  source unreviewed youtube ids: ${model.youtubeIds.length} | json ids: ${jsonIds.length}`,
    );

    if (
        pendingInSourceMissingFromJson.length === 0 &&
        inJsonNoUnreviewedYoutubeEntry.length === 0
    ) {
        lines.push('  OK — pendingHumanReviewIds.json is in sync with the unreviewed youtube entries.');
    } else {
        if (pendingInSourceMissingFromJson.length > 0) {
            lines.push(
                `  [pending-in-source-missing-from-json] ${pendingInSourceMissingFromJson.length} id(s) — unreviewed youtube entries with NO json checklist row:`,
            );
            for (const id of pendingInSourceMissingFromJson) {
                lines.push(`      ${id}`);
            }
        }
        if (inJsonNoUnreviewedYoutubeEntry.length > 0) {
            lines.push(
                `  [in-json-no-unreviewed-youtube-entry] ${inJsonNoUnreviewedYoutubeEntry.length} id(s) — json rows with NO matching verified:false youtube entry (stale?):`,
            );
            for (const id of inJsonNoUnreviewedYoutubeEntry) {
                lines.push(`      ${id}`);
            }
        }
        lines.push(
            '  NOTE: this is INFORMATIONAL — fixing drift is a human-gated step; this script never edits curatedDemos.ts, the json, or any verified flag.',
        );
    }

    return lines;
}

function main() {
    // Read curatedDemos.ts as TEXT (never require it). A missing file is logged
    // but does NOT change the exit code — this tool is informational and must
    // never block a merge.
    let curatedSrc;
    try {
        curatedSrc = fs.readFileSync(CURATED_DEMOS_TS, 'utf8');
    } catch (err) {
        console.log(
            `report-pending-demos: cannot read ${path.relative(REPO_ROOT, CURATED_DEMOS_TS)} — ${err.message}. Nothing to report.`,
        );
        process.exit(0);
        return;
    }

    // Read pendingHumanReviewIds.json via JSON.parse. A read/parse failure (or a
    // non-array shape) yields null so renderReport prints a diagnostic instead
    // of throwing.
    let jsonIds = null;
    try {
        const raw = fs.readFileSync(PENDING_REVIEW_JSON, 'utf8');
        const parsed = JSON.parse(raw);
        jsonIds = Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : null;
    } catch (_err) {
        jsonIds = null;
    }

    const model = parseCuratedDemosSource(curatedSrc);
    const lines = renderReport(model, jsonIds);
    console.log(lines.join('\n'));

    // ALWAYS exit 0 — informational only. Drift, if any, is surfaced in the
    // printed report above but never affects the exit code (this script is the
    // optional `report:pending-demos` npm script, NOT a gate step).
    process.exit(0);
}

// Run main() only when invoked as a script — the unit test imports this file
// for the pure helpers without wanting the side-effect of reading files /
// exiting.
if (require.main === module) {
    main();
}

// Expose internals for the unit test fixture suite.
module.exports.__test = {
    extractBlock,
    parseStringEntries,
    parseStringEntriesDq,
    parseAllStringEntries,
    youtubeIdFromUrl,
    fedbPair,
    parseCuratedDemosSource,
    computeDrift,
    renderReport,
    FEDB_BASE,
    CURATED_DEMOS_TS,
    PENDING_REVIEW_JSON,
};
