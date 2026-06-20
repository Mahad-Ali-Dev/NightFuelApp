#!/usr/bin/env node
/**
 * NightFuel — INFORMATIONAL, ALWAYS-NON-BLOCKING sampled demo-URL rot check.
 *
 * This is the metric/report sibling of scripts/check-demo-urls.js. Where that
 * script is a STANDALONE, intentionally HARD probe (it can exit 1 on a reachable
 * non-200 and is deliberately NOT wired into the gate), THIS script is wired into
 * scripts/gate.js as an INFORMATIONAL reporting step (runReportingStep) and
 * therefore must NEVER fail the gate. It ALWAYS exits 0 — in every path:
 *
 *   - missing curatedDemos.ts source  → print a note, exit 0;
 *   - no demo URLs found              → print a note, exit 0;
 *   - network / DNS / timeout error   → print "network unavailable, skipping",
 *                                       exit 0 (the box may be offline in CI);
 *   - a genuinely dead URL (non-200)  → print the dead URL(s) as a NOTE ONLY,
 *                                       still exit 0 (informational — a rotted
 *                                       third-party CDN URL is a heads-up, not a
 *                                       merge blocker);
 *   - all sampled URLs return 200     → print OK, exit 0.
 *
 * It samples only a SLICE of the curated demo URLs (HEAD/GET each) so the report
 * stays cheap and polite to the upstream CDNs (raw.githubusercontent.com for the
 * FEDB frame pairs, youtube.com for the watch URLs). It reads NOTHING from and
 * writes NOTHING to the on-disk cache used by check-demo-urls.js — this is a
 * read-only spot report, not the cache-populating probe.
 *
 * Dependency-free on purpose: it REUSES the dependency-free helpers
 * (extractDemoUrls / sampleUrls / probeUrl / isNetworkUnavailable + the
 * CURATED_DEMOS_TS path constant) already exported on
 * `require('./check-demo-urls').__test`, so there is exactly one parser/prober to
 * maintain and NO new npm dependency is added to any package.json. If that
 * sibling ever fails to load (it shouldn't), we fall back to a no-op exit 0 so
 * this report can never break a workflow that runs it.
 *
 * Usage:   node scripts/check-demo-urls-sample.js
 * Exit:    0 — ALWAYS (informational, non-blocking). The gate runs it via
 *              runReportingStep, whose exit code is ignored by contract.
 *
 * Internals are re-exported on `module.exports.__test` so the unit test
 * (scripts/__tests__/check-demo-urls-sample.test.js) can exercise the parser /
 * sampler and drive main() through every path without a child process or real
 * network I/O.
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Repo root is one level up from /scripts.
const REPO_ROOT = path.resolve(__dirname, '..');

// Reuse the dependency-free helpers from the HARD probe so there is a single
// parser/prober to maintain. Loaded defensively: if the sibling cannot be
// required for any reason, we degrade to a no-op (a tiny built-in shim) so this
// informational report still ALWAYS exits 0.
let helpers;
try {
    // eslint-disable-next-line global-require
    helpers = require('./check-demo-urls').__test;
} catch (_err) {
    helpers = null;
}

// The curated demos source (parsed as plain text by extractDemoUrls — no
// `require()` of the TS module). Prefer the sibling's exported constant so the
// two scripts stay pinned to the SAME file; fall back to the literal path.
const CURATED_DEMOS_TS =
    helpers && helpers.CURATED_DEMOS_TS
        ? helpers.CURATED_DEMOS_TS
        : path.join(REPO_ROOT, 'clients', 'mobile', 'src', 'constants', 'curatedDemos.ts');

// How many distinct URLs (source order) to spot-check. Kept small: this is a
// non-blocking heads-up, not an exhaustive audit, and we want it polite to the
// upstream CDNs. Independent of check-demo-urls.js's own SAMPLE_SIZE.
const SAMPLE_SIZE = 12;

// Pull the reusable helpers (with safe fallbacks so a partial/garbage export can
// never throw at module scope). extractDemoUrls/sampleUrls/probeUrl/
// isNetworkUnavailable all mirror check-demo-urls.js exactly.
const extractDemoUrls =
    helpers && typeof helpers.extractDemoUrls === 'function' ? helpers.extractDemoUrls : () => [];
const sampleUrls =
    helpers && typeof helpers.sampleUrls === 'function'
        ? helpers.sampleUrls
        : (urls, size) => (Array.isArray(urls) ? urls.slice(0, Math.max(0, size)) : []);
const probeUrl =
    helpers && typeof helpers.probeUrl === 'function'
        ? helpers.probeUrl
        : () => Promise.resolve({ kind: 'neterr', code: 'ENOTFOUND' });
const isNetworkUnavailable =
    helpers && typeof helpers.isNetworkUnavailable === 'function'
        ? helpers.isNetworkUnavailable
        : (result) => !!(result && result.kind === 'neterr');

// ---------------------------------------------------------------------------
// Main — ALWAYS exits 0.
// ---------------------------------------------------------------------------

async function main() {
    // Missing source file → note + no-op (this report is never a blocker).
    let source;
    try {
        source = fs.readFileSync(CURATED_DEMOS_TS, 'utf8');
    } catch (err) {
        console.log(
            `check-demo-urls-sample: cannot read ${path.relative(REPO_ROOT, CURATED_DEMOS_TS)} ` +
                `(${err.message}) — note only, skipping (informational, non-blocking).`,
        );
        process.exit(0);
        return;
    }

    const allUrls = extractDemoUrls(source);
    if (!allUrls || allUrls.length === 0) {
        console.log('check-demo-urls-sample: no demo URLs found to sample — note only (informational, non-blocking).');
        process.exit(0);
        return;
    }

    const sample = sampleUrls(allUrls, SAMPLE_SIZE);
    console.log(
        `check-demo-urls-sample: ${allUrls.length} demo URL(s) found; ` +
            `sampling ${sample.length} (cap ${SAMPLE_SIZE}) — informational, non-blocking.`,
    );

    let checked = 0;
    const deadUrls = []; // { url, status } — reachable but non-200

    for (const url of sample) {
        const result = await probeUrl(url);

        // ANY network/transport error (DNS failure, timeout, offline sandbox,
        // connection refused) makes the WHOLE run a no-op skip — we print the
        // "network unavailable" note and stop. We never treat offline as a
        // problem with the URLs themselves.
        if (isNetworkUnavailable(result) || (result && result.kind === 'neterr')) {
            console.log(
                'check-demo-urls-sample: network unavailable, skipping — ' +
                    'run this report on a network-enabled machine to spot-check demo URLs ' +
                    '(informational, non-blocking).',
            );
            process.exit(0);
            return;
        }

        checked++;
        // A real HTTP status was obtained. A non-200 is a NOTE ONLY — a rotted
        // third-party CDN URL is a heads-up, never a gate failure.
        if (result.status !== 200) {
            deadUrls.push({ url, status: result.status });
        }
    }

    if (deadUrls.length > 0) {
        // Print to stdout (NOT stderr) and frame as a NOTE so no log-scraper
        // mistakes this informational report for a hard failure.
        console.log(
            `check-demo-urls-sample: NOTE — ${deadUrls.length} of ${checked} sampled demo URL(s) ` +
                'did not return HTTP 200 (informational only — these are not gating):',
        );
        for (const d of deadUrls) {
            console.log(`  note [${d.status}] ${d.url}`);
        }
        // STILL exit 0 — this is a heads-up, not a blocker.
        process.exit(0);
        return;
    }

    console.log(
        `check-demo-urls-sample: OK — all ${checked} sampled demo URL(s) returned HTTP 200 ` +
            '(informational, non-blocking).',
    );
    process.exit(0);
}

// Run main() only when invoked as a script — the unit test imports this file for
// its helpers and drives main() itself.
if (require.main === module) {
    main().catch((err) => {
        // A truly unexpected error must STILL NOT fail this informational report.
        // Log it as a note and exit 0 so the script can never break a workflow.
        console.log(
            `check-demo-urls-sample: unexpected error (${err && err.message ? err.message : err}) — ` +
                'note only, skipping (informational, non-blocking).',
        );
        process.exit(0);
    });
}

// Expose internals for the unit-test suite.
module.exports.__test = {
    main,
    extractDemoUrls,
    sampleUrls,
    probeUrl,
    isNetworkUnavailable,
    CURATED_DEMOS_TS,
    SAMPLE_SIZE,
};
