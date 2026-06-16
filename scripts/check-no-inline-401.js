#!/usr/bin/env node
/**
 * NightFuel — CI guard: no inline 401 bodies in service src trees.
 *
 * Background: the canonical 401 reply body lives in packages/config/src/auth-errors.ts
 * (exported as `sendUnauthorized` / `UNAUTHORIZED_BODY`). Every service's
 * `authenticate` decorator MUST call that helper instead of inlining its own
 * `{ statusCode: 401, error: 'Unauthorized', message: 'A valid Bearer token is required.' }`
 * literal — otherwise the bodies drift, jwtVerify()'s internal FST_JWT_* error
 * codes can leak per-service, and any future shape change has to be hand-applied
 * across N files.
 *
 * This script walks every services/<svc>/src/**\/*.ts file and fails (exit 1) if
 * any one of them re-introduces the inline literal. It is intentionally dependency-
 * free (only Node's built-in `fs` + `path`) so it runs in any CI environment,
 * reads ONLY local files (no network), and is safe to add to the root
 * `security:scan` flow.
 *
 * Detection: a line range matching
 *   /statusCode:\s*401[\s\S]{0,120}A valid Bearer token is required/
 * — that is, the `statusCode: 401` literal within ~120 characters (multi-line
 * tolerant) of the `A valid Bearer token is required` phrase. The 120-char window
 * lets a typical 3-line object literal (`{ statusCode: 401, error: '...', message: '...' }`)
 * trigger the match while keeping false-positive risk to near zero — Bearer-token
 * phrasing only appears inside this canonical body.
 *
 * Scope: scans `services/<svc>/src/` only. The `packages/config/` tree is
 * intentionally excluded because that's where the canonical body LIVES. Test
 * files (under `services/<svc>/__tests__/`) are also excluded because they
 * deliberately assert against the body shape.
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

// Multi-line tolerant detector: `statusCode: 401` within 120 chars of the
// canonical phrase. Matches the 3-line object literal form across newlines.
const INLINE_401_RE = /statusCode:\s*401[\s\S]{0,120}A valid Bearer token is required/;

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
 * CI failure.
 */
function findOffendingLine(source) {
    const lines = source.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        if (/statusCode:\s*401/.test(lines[i])) {
            return i + 1;
        }
    }
    // Fallback: line 1 (should never happen if the multi-line regex matched).
    return 1;
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

            let src;
            try {
                src = fs.readFileSync(file, 'utf8');
            } catch (err) {
                // Unreadable file — skip rather than crash the guard.
                continue;
            }

            if (INLINE_401_RE.test(src)) {
                offenders.push({ file: rel, line: findOffendingLine(src) });
            }
        }
    }

    if (offenders.length > 0) {
        console.error(
            'check-no-inline-401: inline 401 body found — use sendUnauthorized from @nightfuel/config instead:',
        );
        for (const off of offenders) {
            console.error(`  ${off.file}:${off.line}`);
        }
        process.exit(1);
    }

    console.log('OK');
    process.exit(0);
}

main();
