#!/usr/bin/env node
/**
 * NightFuel — OPTIONAL, non-gating content check for curated demo URLs.
 *
 * Background (client item 9): the curated demo map in
 * clients/mobile/src/constants/curatedDemos.ts points at two kinds of external
 * URLs that are shown to users in the workout player / catalog:
 *
 *   - FEDB frame pairs  — `0.jpg|1.jpg` HTTPS images on
 *     raw.githubusercontent.com (free-exercise-db, MIT), built by `fedbPair`.
 *   - YouTube watch URLs — specific demo videos (the grandfathered + pending
 *     tranches).
 *
 * Those URLs live on third-party CDNs that can rot (a repo gets renamed, a
 * video gets pulled). This script spot-checks a SAMPLE of them and reports any
 * that no longer return HTTP 200.
 *
 * IMPORTANT — this is deliberately OPTIONAL / NON-GATING:
 *
 *   - It is a STANDALONE script. It is NOT wired into scripts/gate.js and adds
 *     NO new mandatory step there. `node scripts/gate.js` is completely
 *     unaffected by this file.
 *   - It is NETWORK-DEPENDENT, so it MUST NOT fail a CI run just because the
 *     box is offline. On ANY network/transport error (DNS failure, timeout,
 *     connection refused, offline sandbox) it prints a clear
 *     "network unavailable — skipping" message and exits 0 (a no-op). The cache
 *     is simply not populated in that case.
 *   - It exits 1 ONLY when the network was reachable AND a fetched URL returned
 *     a non-200 status. That is the single failure mode — a genuinely dead
 *     curated URL — and even then it's only meaningful when run intentionally
 *     (it is not part of the gate).
 *
 * On-disk cache (so repeat runs are cheap):
 *
 *   - Results are cached in scripts/.cache/demo-urls/demo-url-cache.json as a
 *     map of `url -> { status, checkedAt }` (checkedAt is an ISO-8601 string).
 *   - A cached entry younger than CACHE_TTL_MS (7 days) is reused and the URL
 *     is NOT re-fetched. So a second run within the week does little/no network
 *     I/O — and a run that hits only cached URLs needs no network at all.
 *   - Only successful checks (a real HTTP status was obtained) are cached.
 *     Network errors are never cached, so a transient outage doesn't poison the
 *     cache; the next online run re-checks those URLs.
 *
 * Dependency-free on purpose — uses only Node's built-in `https`, `http`, `fs`,
 * `path`, and `url`. It adds NO npm dependency to any package.json (the only
 * package.json edit owned by this item is the `check:demo-urls` script entry).
 *
 * Usage:   node scripts/check-demo-urls.js
 *          npm run check:demo-urls
 * Exit:    0 = all sampled URLs returned 200, OR the network was unavailable
 *              (no-op skip), OR every sampled URL was served from a fresh cache.
 *          1 = the network was reachable and at least one fetched URL returned a
 *              non-200 status (a dead curated demo URL).
 *
 * Internals are re-exported on `module.exports.__test` so a future unit test can
 * exercise the parser / sampler / cache helpers without a child process or any
 * real network I/O.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');

// Repo root is one level up from /scripts.
const REPO_ROOT = path.resolve(__dirname, '..');

// Source of curated demo URLs (parsed as plain text — no `require()` so we do
// not pull in TypeScript or any runtime dep, mirroring check-demo-maps-in-sync.js).
const CURATED_DEMOS_TS = path.join(
    REPO_ROOT,
    'clients',
    'mobile',
    'src',
    'constants',
    'curatedDemos.ts',
);

// On-disk cache. The directory ships with a .gitkeep so it exists in a fresh
// checkout; the JSON file itself is runtime state (created on first online run).
const CACHE_DIR = path.join(REPO_ROOT, 'scripts', '.cache', 'demo-urls');
const CACHE_FILE = path.join(CACHE_DIR, 'demo-url-cache.json');

// Reuse a cached result for this long before re-fetching. 7 days keeps repeat
// runs cheap while still re-checking each URL roughly weekly.
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Cap the sample so the check stays cheap (and polite to the upstream CDNs).
// We take the FIRST N distinct URLs in source order.
const SAMPLE_SIZE = 15;

// Per-request timeout. Short on purpose: an unreachable host should surface as
// a skip quickly rather than hanging the run.
const REQUEST_TIMEOUT_MS = 8000;

// Network/transport error codes that mean "the network is unavailable" rather
// than "the URL is dead". Any of these (or a timeout) makes the whole run a
// no-op skip — we NEVER fail on them.
const NETWORK_ERROR_CODES = new Set([
    'ENOTFOUND', // DNS lookup failed (offline / no resolver)
    'EAI_AGAIN', // transient DNS failure
    'ETIMEDOUT', // connection timed out
    'ECONNREFUSED', // nothing listening
    'ECONNRESET', // peer reset the connection
    'ENETUNREACH', // no route to host network
    'EHOSTUNREACH', // no route to host
    'EPIPE',
    'ECONNABORTED',
]);

// ---------------------------------------------------------------------------
// URL extraction
// ---------------------------------------------------------------------------

/**
 * Extract candidate demo URLs from the curatedDemos.ts source text.
 *
 * Two URL families appear in the file:
 *   1. FEDB frame pairs built by `fedbPair(slug)` as
 *      `${FEDB_BASE}/${slug}/0.jpg|${FEDB_BASE}/${slug}/1.jpg`. We resolve
 *      FEDB_BASE from its literal, then expand every `'<slug>'` value in the
 *      FEDB_BACKED_SLUGS map into its 0.jpg / 1.jpg URLs and SPLIT the pair so
 *      each individual image is a checkable URL.
 *   2. Bare `https://...` URLs (the YouTube watch URLs in GRANDFATHERED and
 *      YOUTUBE_PENDING, plus any literal http(s) URL). Picked up by a generic
 *      single-quoted-https scan.
 *
 * Returns a de-duplicated `string[]` in source order. Pure text parsing — never
 * touches the network and never `require()`s the TS module.
 */
function extractDemoUrls(source) {
    const urls = [];
    const seen = new Set();
    const push = (u) => {
        if (u && !seen.has(u)) {
            seen.add(u);
            urls.push(u);
        }
    };

    // --- FEDB frame pairs -------------------------------------------------
    // Resolve the FEDB_BASE literal:  const FEDB_BASE = 'https://...';
    const baseMatch = /const\s+FEDB_BASE\s*=\s*'([^']+)'/.exec(source);
    const fedbBase = baseMatch ? baseMatch[1] : null;

    if (fedbBase) {
        // Slug values live as `'<slug>'` inside the FEDB_BACKED_SLUGS map. Scope
        // the scan to that declaration's body so we don't sweep unrelated string
        // literals. The block runs from the opener to the next top-level `};`.
        const slugBlock = extractBlock(
            source,
            'const FEDB_BACKED_SLUGS: Readonly<Record<string, string>> = {',
        );
        if (slugBlock !== null) {
            // Entries look like:  'Display Name': 'Slug_Value',
            // We only need the slug (the second single-quoted token).
            const entryRe = /:\s*'([^']+)'\s*,?\s*$/gm;
            let m;
            while ((m = entryRe.exec(slugBlock)) !== null) {
                const slug = m[1];
                // Mirror fedbPair(): `${FEDB_BASE}/${slug}/0.jpg|.../1.jpg`,
                // then split the pair into two individually-checkable URLs.
                push(`${fedbBase}/${slug}/0.jpg`);
                push(`${fedbBase}/${slug}/1.jpg`);
            }
        }
    }

    // --- Bare https URLs (YouTube watch URLs, any literal http(s) URL) -----
    // Single-quoted https/http literal anywhere in the file. We intentionally
    // include these AFTER the FEDB images so a mixed sample favours an image
    // first, but de-dup keeps order stable either way.
    const urlRe = /'(https?:\/\/[^']+)'/g;
    let um;
    while ((um = urlRe.exec(source)) !== null) {
        const raw = um[1];
        // Skip the bare FEDB_BASE literal — it's the directory prefix used to
        // BUILD the frame URLs above, not a checkable demo URL itself (the base
        // path has no 0.jpg/1.jpg and would 404). We already expanded every
        // real FEDB frame URL from the slug map.
        if (fedbBase && raw === fedbBase) continue;
        // A FEDB pair literal would contain a `|` — but those are built at
        // runtime by fedbPair(), not written as literals, so we won't see them
        // here. Defensive: if a `|`-joined literal ever appears, split it.
        if (raw.includes('|')) {
            for (const part of raw.split('|')) push(part);
        } else {
            push(raw);
        }
    }

    return urls;
}

/**
 * Extract the substring of `source` between the `openerLiteral` line and the
 * first subsequent line whose trimmed content is `};`. Mirrors the helper in
 * check-demo-maps-in-sync.js so the two scripts parse the file identically.
 *
 * Returns `null` when the opener or close cannot be found.
 */
function extractBlock(source, openerLiteral) {
    const openIdx = source.indexOf(openerLiteral);
    if (openIdx === -1) return null;

    const afterOpener = source.indexOf('\n', openIdx);
    if (afterOpener === -1) return null;

    const rest = source.slice(afterOpener + 1);
    const closeRe = /^\s*\};\s*$/m;
    const closeMatch = closeRe.exec(rest);
    if (!closeMatch) return null;

    return rest.slice(0, closeMatch.index);
}

/**
 * Take the first `size` entries of `urls` (already de-duplicated, source order).
 * Kept as a named helper so the sampler is unit-testable.
 */
function sampleUrls(urls, size) {
    return urls.slice(0, Math.max(0, size));
}

// ---------------------------------------------------------------------------
// On-disk cache
// ---------------------------------------------------------------------------

/**
 * Load the cache JSON. Returns a plain object `{ [url]: { status, checkedAt } }`
 * or `{}` if the file is missing or unreadable/corrupt — a bad cache file must
 * never crash the check; we just treat it as empty and rebuild it.
 */
function loadCache() {
    try {
        const raw = fs.readFileSync(CACHE_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return parsed;
        }
        return {};
    } catch (_err) {
        return {};
    }
}

/**
 * Persist the cache object. Best-effort: a write failure (e.g. read-only FS) is
 * logged but never fails the run — the cache is an optimization, not a contract.
 * Ensures the cache directory exists first (it ships with a .gitkeep, but a
 * pruned checkout or a moved .cache could be absent).
 */
function saveCache(cache) {
    try {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
        fs.writeFileSync(CACHE_FILE, `${JSON.stringify(cache, null, 2)}\n`, 'utf8');
    } catch (err) {
        console.warn(`check-demo-urls: could not write cache (${err.message}) — continuing.`);
    }
}

/**
 * True when `entry` is a usable cache hit younger than the TTL relative to
 * `now` (ms epoch). Defensive against a missing/garbage `checkedAt`.
 */
function isFresh(entry, now) {
    if (!entry || typeof entry.status !== 'number' || !entry.checkedAt) return false;
    const checked = Date.parse(entry.checkedAt);
    if (Number.isNaN(checked)) return false;
    return now - checked < CACHE_TTL_MS;
}

// ---------------------------------------------------------------------------
// HTTP probing
// ---------------------------------------------------------------------------

/**
 * Probe a single URL and resolve to one of:
 *   - { kind: 'status', status: <number> } — a real HTTP status was obtained.
 *   - { kind: 'neterr', code: <string> }   — a network/transport error (the
 *                                             whole run will treat this as the
 *                                             "offline" signal and no-op).
 *
 * Strategy: issue a GET but abort the response as soon as the status line
 * arrives (we never read the body — we only care about the status code). GET is
 * used rather than HEAD because some CDNs (and YouTube) answer HEAD with 405 or
 * inconsistent codes while answering GET with the true 200/404. We follow a
 * small number of redirects (3xx + Location) so a canonical-redirect doesn't
 * read as a failure.
 *
 * Never throws — all errors resolve as `{ kind: 'neterr' }`.
 */
function probeUrl(rawUrl, { timeout = REQUEST_TIMEOUT_MS, maxRedirects = 5 } = {}) {
    return new Promise((resolve) => {
        let settled = false;
        const done = (val) => {
            if (!settled) {
                settled = true;
                resolve(val);
            }
        };

        const visit = (current, redirectsLeft) => {
            let parsed;
            try {
                parsed = new URL(current);
            } catch (_err) {
                // A malformed URL is a content problem, not a network one — but
                // there's nothing to fetch, so surface it as a non-200 status.
                done({ kind: 'status', status: 0 });
                return;
            }

            const lib = parsed.protocol === 'http:' ? http : https;
            const req = lib.request(
                parsed,
                {
                    method: 'GET',
                    timeout,
                    headers: {
                        // A UA keeps some CDNs from short-circuiting to a 403.
                        'User-Agent': 'nightfuel-demo-url-check/1.0 (+https://nightfuel.app)',
                        Accept: '*/*',
                    },
                },
                (res) => {
                    const status = res.statusCode || 0;

                    // Follow redirects (without reading the body).
                    if (status >= 300 && status < 400 && res.headers.location && redirectsLeft > 0) {
                        res.resume(); // drain & discard
                        let next;
                        try {
                            next = new URL(res.headers.location, parsed).toString();
                        } catch (_err) {
                            done({ kind: 'status', status });
                            return;
                        }
                        visit(next, redirectsLeft - 1);
                        return;
                    }

                    // We have the final status — discard the body and resolve.
                    res.resume();
                    done({ kind: 'status', status });
                },
            );

            req.on('timeout', () => {
                req.destroy(); // triggers an 'error' with ECONNRESET/ECanceled on some platforms
                done({ kind: 'neterr', code: 'ETIMEDOUT' });
            });

            req.on('error', (err) => {
                done({ kind: 'neterr', code: err && err.code ? err.code : 'EUNKNOWN' });
            });

            req.end();
        };

        visit(rawUrl, maxRedirects);
    });
}

/**
 * Classify a probe result against the network-error set. Returns true when the
 * result means "the network is unavailable" (so the run should no-op).
 */
function isNetworkUnavailable(result) {
    return result && result.kind === 'neterr' && NETWORK_ERROR_CODES.has(result.code);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
    // Read + parse the curated demos file. A missing source file is a real bug,
    // but this is an OPTIONAL check — so we print a clear message and no-op
    // (exit 0) rather than failing, consistent with the "never gate" contract.
    let source;
    try {
        source = fs.readFileSync(CURATED_DEMOS_TS, 'utf8');
    } catch (err) {
        console.log(
            `check-demo-urls: cannot read ${path.relative(REPO_ROOT, CURATED_DEMOS_TS)} (${err.message}) — skipping (optional, non-gating).`,
        );
        process.exit(0);
    }

    const allUrls = extractDemoUrls(source);
    if (allUrls.length === 0) {
        console.log('check-demo-urls: no demo URLs found to check — skipping (no-op).');
        process.exit(0);
    }

    const sample = sampleUrls(allUrls, SAMPLE_SIZE);
    console.log(
        `check-demo-urls: ${allUrls.length} demo URL(s) found; checking a sample of ${sample.length} (cap ${SAMPLE_SIZE}).`,
    );

    const cache = loadCache();
    const now = Date.now();

    let networkUnavailable = false;
    let fetched = 0;
    let fromCache = 0;
    const failures = []; // { url, status } — reachable but non-200

    for (const url of sample) {
        // Fresh cache hit → reuse, no network.
        const cached = cache[url];
        if (isFresh(cached, now)) {
            fromCache++;
            if (cached.status !== 200) {
                failures.push({ url, status: cached.status, cached: true });
            }
            continue;
        }

        const result = await probeUrl(url);

        // The first network error flips the whole run into "offline" mode: we
        // stop fetching and no-op. We do NOT cache network errors (so a
        // transient outage never poisons the cache).
        if (isNetworkUnavailable(result)) {
            networkUnavailable = true;
            break;
        }
        // A non-network error kind (shouldn't happen) — treat conservatively as
        // an offline signal too, never as a hard failure.
        if (result.kind === 'neterr') {
            networkUnavailable = true;
            break;
        }

        fetched++;
        // Cache the real HTTP status.
        cache[url] = { status: result.status, checkedAt: new Date(now).toISOString() };
        if (result.status !== 200) {
            failures.push({ url, status: result.status, cached: false });
        }
    }

    // If we obtained ANY real statuses, persist the (updated) cache — even on an
    // eventual offline break, the statuses we DID get are worth keeping.
    if (fetched > 0) {
        saveCache(cache);
    }

    // OFFLINE → no-op, ALWAYS exit 0. The cache is simply not (fully) populated.
    if (networkUnavailable) {
        console.log(
            'check-demo-urls: network unavailable — skipping (cache not populated). ' +
                'This check is optional/non-gating; run it on a network-enabled machine to validate demo URLs.',
        );
        process.exit(0);
    }

    console.log(
        `check-demo-urls: checked ${sample.length} URL(s) — ${fetched} fetched, ${fromCache} from cache.`,
    );

    // REACHABLE + at least one non-200 → the only hard-failure path.
    if (failures.length > 0) {
        console.error(`check-demo-urls: ${failures.length} demo URL(s) did NOT return HTTP 200:`);
        for (const f of failures) {
            console.error(`  [${f.status}]${f.cached ? ' (cached)' : ''} ${f.url}`);
        }
        process.exit(1);
    }

    console.log('check-demo-urls: OK — every sampled demo URL returned HTTP 200.');
    process.exit(0);
}

// Run main() only when invoked as a script — a (future) unit test imports this
// file for the helpers without wanting the side-effect of an exit or network I/O.
if (require.main === module) {
    main().catch((err) => {
        // A truly unexpected error must still NOT fail this optional check. Log
        // it and no-op (exit 0) so the script can never break a workflow that
        // runs it.
        console.log(
            `check-demo-urls: unexpected error (${err && err.message ? err.message : err}) — skipping (optional, non-gating).`,
        );
        process.exit(0);
    });
}

// Expose internals for a future unit-test suite.
module.exports.__test = {
    extractDemoUrls,
    extractBlock,
    sampleUrls,
    loadCache,
    saveCache,
    isFresh,
    probeUrl,
    isNetworkUnavailable,
    CURATED_DEMOS_TS,
    CACHE_DIR,
    CACHE_FILE,
    CACHE_TTL_MS,
    SAMPLE_SIZE,
    NETWORK_ERROR_CODES,
};
