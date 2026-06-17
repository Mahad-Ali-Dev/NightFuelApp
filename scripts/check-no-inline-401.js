#!/usr/bin/env node
/**
 * NightFuel — CI guard: no inline 401 bodies in service src trees.
 *
 * Background: the canonical 401 reply bodies live in
 * packages/config/src/auth-errors.ts (exported as
 * `sendUnauthorized` / `UNAUTHORIZED_BODY` for the missing-token case and
 * `sendUnauthorizedPayload` / `UNAUTHORIZED_PAYLOAD_BODY` for the
 * payload-invalid case). Every service's `authenticate` decorator (and every
 * route that re-validates `request.user`) MUST call one of those helpers
 * instead of inlining its own `{ statusCode: 401, error: 'Unauthorized', ... }`
 * literal — otherwise the bodies drift, jwtVerify()'s internal FST_JWT_* error
 * codes can leak per-service, and any future shape change has to be hand-
 * applied across N files.
 *
 * This script walks every services/<svc>/src/**\/*.ts file and fails (exit 1) if
 * any one of them re-introduces an inline literal. It is intentionally
 * dependency-free (only Node's built-in `fs` + `path`) so it runs in any CI
 * environment, reads ONLY local files (no network), and is safe to add to the
 * root `security:scan` flow.
 *
 * Detection — two complementary regexes (a file fails if EITHER matches):
 *   1) INLINE_401_RE — the original Bearer-specific pattern. Kept because the
 *      failure log "use sendUnauthorized" is more informative when the literal
 *      is clearly the missing-token body.
 *      /statusCode:\s*401[\s\S]{0,120}A valid Bearer token is required/
 *   2) INLINE_401_GENERIC_RE — broad pattern that catches ANY `statusCode: 401`
 *      literal chained to `.send(`, multi-line tolerant up to 150 chars. This
 *      catches the payload-invalid variants ('Invalid token', 'Invalid token
 *      payload', 'Token payload is missing userId') and any future drift.
 *      /statusCode:\s*401[\s\S]{0,150}\.send\(/
 *
 * False-positive mitigation: if the matched window already contains
 * `sendUnauthorized` (i.e. the literal sits inside the canonical helper's body,
 * or a 5-line window around the call), the script treats that as the canonical
 * call site and skips. Files under `packages/config/` are skipped entirely (the
 * canonical body lives there), and any `__tests__/` segment in the path is
 * skipped (test files legitimately assert against the body shape).
 *
 * The regex constants are re-exported on `module.exports.__test` so the unit
 * test suite (scripts/__tests__/check-no-inline-401.test.js) can exercise them
 * directly against fixture snippets.
 *
 * Usage:   node scripts/check-no-inline-401.js
 * Exit:    0 = clean (prints 'OK'); 1 = inline body found (prints file:line).
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Repo root is one level up from /scripts.
const REPO_ROOT = path.resolve(__dirname, '..');
const SERVICES_DIR = path.join(REPO_ROOT, 'services');

// Multi-line tolerant detector #1: `statusCode: 401` within 120 chars of the
// canonical Bearer phrase. Matches the original 3-line object literal form.
// Kept so the failure message can keep saying "use sendUnauthorized" for the
// most common case — informative error messages matter for CI failures.
const INLINE_401_RE = /statusCode:\s*401[\s\S]{0,120}A valid Bearer token is required/;

// Multi-line tolerant detector #2: ANY `.send(` chained to `statusCode: 401`
// within 150 chars. Catches the payload-invalid bodies that the Bearer-specific
// regex missed, plus any future drift to a new message. The window is sized
// to a typical 3- or 4-line object literal printed compactly OR spread across
// lines (the chat-service/user-service style runs ~3 lines, the
// subscription-service inline style fits on one line, so 150 chars covers
// both with margin).
//
// We anchor on `.send(` BEFORE `statusCode: 401` because that's the order
// every real production call site uses — either the chained form
// `reply.status(401).send({ statusCode: 401, ... })` or the multi-line form
// `reply.code(401).send({\n  statusCode: 401,\n  ...\n})`. The Bearer regex
// above is left order-agnostic so it can still light up if someone hand-builds
// the body as an object literal first and then calls `.send(body)`.
const INLINE_401_GENERIC_RE = /\.send\([\s\S]{0,150}statusCode:\s*401/;

/**
 * Recursively collect all *.ts files under `dir`, skipping common heavy/irrelevant
 * directories so the walk stays under a second even on a cold repo.
 */
function collectTsFiles(dir, out) {
    let entries;
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
        // Directory missing or unreadable — treat as empty (a fresh checkout may
        // not have every service yet).
        return;
    }
    for (const ent of entries) {
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) {
            // Skip build outputs, vendored deps, generated Prisma client, and
            // anything outside the human-authored src tree.
            if (
                ent.name === 'node_modules' ||
                ent.name === 'dist' ||
                ent.name === 'build' ||
                ent.name === 'generated' ||
                ent.name === '.next' ||
                ent.name === '.turbo'
            ) {
                continue;
            }
            collectTsFiles(full, out);
        } else if (ent.isFile() && ent.name.endsWith('.ts')) {
            out.push(full);
        }
    }
}

/**
 * For a matched file, find the 1-indexed line number where the `statusCode: 401`
 * literal occurs — this is the most useful pointer for the engineer reading the
 * CI failure. Skips lines whose 5-line window already contains a canonical
 * helper call (`sendUnauthorized` / `sendUnauthorizedPayload`).
 */
function findOffendingLine(source) {
    const lines = source.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        if (/statusCode:\s*401/.test(lines[i])) {
            if (isWithinCanonicalCall(lines, i)) continue;
            return i + 1;
        }
    }
    // Fallback: line 1 (should never happen if the multi-line regex matched).
    return 1;
}

/**
 * True when a 5-line window centered on `idx` mentions the canonical helper
 * name. This is the pre-filter that lets the canonical body inside
 * packages/config/ (and any future call site that's clearly delegating to the
 * helper) avoid being flagged by the broad regex.
 */
function isWithinCanonicalCall(lines, idx) {
    const start = Math.max(0, idx - 2);
    const end = Math.min(lines.length, idx + 3);
    const window = lines.slice(start, end).join('\n');
    return /sendUnauthorized/.test(window);
}

function main() {
    if (!fs.existsSync(SERVICES_DIR)) {
        // No services directory at all — nothing to guard. Treat as OK so the
        // script never fails a checkout that pre-dates services/.
        console.log('OK');
        process.exit(0);
    }

    const offenders = [];

    // Iterate each services/<svc>/src/ tree. We do NOT descend into
    // services/<svc>/__tests__/ because those files legitimately assert against
    // the 401 body shape.
    const svcDirs = fs
        .readdirSync(SERVICES_DIR, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => path.join(SERVICES_DIR, d.name));

    for (const svcDir of svcDirs) {
        const srcDir = path.join(svcDir, 'src');
        if (!fs.existsSync(srcDir)) continue;

        const files = [];
        collectTsFiles(srcDir, files);

        for (const file of files) {
            const rel = path.relative(REPO_ROOT, file).split(path.sep).join('/');
            // Defensive double-check: never flag anything in packages/config/.
            // (collectTsFiles never walks there anyway because we anchor at
            // services/, but the spec calls this out explicitly.)
            if (rel.startsWith('packages/config/')) continue;
            // Defensive double-check: never flag anything under a __tests__/
            // tree, even if collectTsFiles somehow walks through one. Test
            // files deliberately assert against the body shape.
            if (rel.split('/').includes('__tests__')) continue;

            let src;
            try {
                src = fs.readFileSync(file, 'utf8');
            } catch (err) {
                // Unreadable file — skip rather than crash the guard.
                continue;
            }

            // Run BOTH detectors. The Bearer-specific one gets first crack so
            // the failure message is more informative when it triggers; the
            // generic one is the safety net for everything else.
            let matched = false;
            if (INLINE_401_RE.test(src)) matched = true;
            else if (INLINE_401_GENERIC_RE.test(src)) {
                // Pre-filter: ignore generic-regex hits whose offending line
                // sits inside a 5-line window that mentions the canonical
                // helper name. findOffendingLine() applies the same filter
                // when picking the line to report.
                const lines = src.split(/\r?\n/);
                for (let i = 0; i < lines.length; i++) {
                    if (
                        /statusCode:\s*401/.test(lines[i]) &&
                        !isWithinCanonicalCall(lines, i)
                    ) {
                        matched = true;
                        break;
                    }
                }
            }

            if (matched) {
                offenders.push({ file: rel, line: findOffendingLine(src) });
            }
        }
    }

    if (offenders.length > 0) {
        console.error(
            'check-no-inline-401: inline 401 body found — use sendUnauthorized / sendUnauthorizedPayload from @nightfuel/config instead:',
        );
        for (const off of offenders) {
            console.error(`  ${off.file}:${off.line}`);
        }
        process.exit(1);
    }

    console.log('OK');
    process.exit(0);
}

// Run main() only when invoked as a script — the unit test imports this file
// for the regex constants without wanting the side-effect of an exit.
if (require.main === module) {
    main();
}

// Expose the regex constants for the unit test in scripts/__tests__/.
module.exports.__test = {
    INLINE_401_RE,
    INLINE_401_GENERIC_RE,
    isWithinCanonicalCall,
};
