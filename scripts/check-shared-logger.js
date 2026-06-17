#!/usr/bin/env node
/**
 * NightFuel — CI guard: no service hand-rolls its own pino logger.
 *
 * Contract enforced over each services/<svc>/src/ tree:
 *
 *   NO RAW PINO CONSTRUCTION ───────────────────────────────────────────────
 *     Every service MUST obtain its logger from the shared @nightfuel/config
 *     factory (`createLogger`). A service file that constructs a pino logger
 *     itself — `pino({ level, transport })` — re-implements the logger
 *     contract (level, redaction, transport, timestamp shape) inline and
 *     drifts from the single shared definition. After the subscription-service
 *     migration lands, NO services/<svc>/src file constructs a raw pino logger,
 *     so this guard exits 0; a future regression (a brand-new service, or a
 *     reverted migration, that calls `pino(...)` in its own src) can't merge.
 *
 *     This mirrors check-error-handler-registered.js: a structural, dependency-
 *     free static guard that drift-proofs a cross-service contract.
 *
 * What is (and isn't) an offense — we match the CONSTRUCTOR shape, never a type
 * import. Two constructor shapes are flagged:
 *
 *   (a) BARE CALL    — a `pino(` call anywhere in the file. This is the literal
 *       subscription-service/src/index.ts offender:
 *           import pino from 'pino';
 *           const rootLogger = pino({ level, transport });
 *       The default-import binding happens to be named `pino`, so `pino(`
 *       already catches it; (a) also catches a stray `pino(` even without the
 *       default import line being on the form (b) expects.
 *
 *   (b) RENAMED DEFAULT IMPORT + CALL — a default import under any local name
 *       used as a constructor:
 *           import makePino from 'pino';
 *           const logger = makePino({ ... });
 *       We extract the default-import identifier and flag the file when that
 *       identifier is later CALLED (`<id>(`).
 *
 * The single SAFE shape that must NEVER be flagged is a TYPE-ONLY / named
 * import of pino's `Logger` type, which the shared @nightfuel/config server.ts
 * and several service files legitimately use to TYPE a logger parameter:
 *
 *       import type { Logger } from 'pino';          // type-only
 *       import { Logger } from 'pino';                // named type import
 *       function f(logger: Logger) { ... }            // Logger used as a type
 *
 * A NAMED import (the `{ ... }` clause) is never treated as a constructor — only
 * the DEFAULT import binding is a constructor candidate — and a named import
 * with no accompanying `pino(` / `<defaultId>(` call is clean. So `Logger` used
 * purely as a type never trips the guard.
 *
 * Dependency-free on purpose (only Node's built-in `fs` + `path`): runs in any
 * CI environment, reads ONLY local files (no network), writes nothing, and is
 * safe to chain into the root gate. Mirrors check-error-handler-registered.js in
 * style (collectTsFiles walk, the same SKIP_DIRS, `module.exports.__test`).
 *
 * Usage:   node scripts/check-shared-logger.js
 * Exit:    0 = clean (prints 'OK'); 1 = offender(s) found (prints file naming
 *               the raw-pino construction).
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Repo root is one level up from /scripts.
const REPO_ROOT = path.resolve(__dirname, '..');
const SERVICES_DIR = path.join(REPO_ROOT, 'services');

// Directories the walk never descends into (build outputs, vendored deps, the
// generated Prisma client, and the test tree — test files legitimately build a
// throwaway pino logger / no-op logger to exercise the redaction helpers).
// Identical set to check-error-handler-registered.js.
const SKIP_DIRS = new Set([
    'node_modules',
    'dist',
    'generated',
    'build',
    '.next',
    '.turbo',
    '__tests__',
]);

// A default import of the `pino` module, capturing the local binding name:
//   import pino from 'pino';
//   import makePino from 'pino';
// NOT matched: `import type pino from 'pino'` (a type-only DEFAULT import binds
// a type, never a callable) and `import { Logger } from 'pino'` (named clause —
// no default binding, handled separately and always allowed).
const PINO_DEFAULT_IMPORT_RE =
    /\bimport\s+(?!type\b)([A-Za-z_$][\w$]*)\s+from\s+['"]pino['"]/;

// A bare `pino(` constructor call. `\b` so `pino-pretty` (a transport target
// string) and `pino.stdTimeFunctions` (a `.` member, not a call) never match —
// only `pino` immediately followed by optional whitespace and `(`.
const BARE_PINO_CALL_RE = /\bpino\s*\(/;

/**
 * Recursively collect all *.ts files under `dir`, skipping SKIP_DIRS so the
 * walk stays fast even on a cold repo. Identical contract to
 * check-error-handler-registered's collectTsFiles.
 */
function collectTsFiles(dir, out) {
    let entries;
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
        // Directory missing or unreadable — treat as empty (a fresh checkout
        // may not have every service yet).
        return;
    }
    for (const ent of entries) {
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) {
            if (SKIP_DIRS.has(ent.name)) continue;
            collectTsFiles(full, out);
        } else if (ent.isFile() && ent.name.endsWith('.ts')) {
            out.push(full);
        }
    }
}

/**
 * Build a regex that matches a CALL of `id` — `id(` with optional whitespace —
 * with a leading word boundary so `makePino` doesn't match inside `notMakePino`.
 */
function callRe(id) {
    return new RegExp('\\b' + escapeRe(id) + '\\s*\\(');
}

function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * True when `src` constructs a raw pino logger. Pure + side-effect-free so the
 * unit test can drive both branches directly.
 *
 *   (a) a bare `pino(` constructor call appears, OR
 *   (b) a default `import <id> from 'pino'` is present AND `<id>` is later
 *       CALLED as `<id>(`.
 *
 * A NAMED/type import alone (`import { Logger } from 'pino'`, `import type
 * { Logger } from 'pino'`) constructs nothing — there is no default binding and
 * no `pino(` call — so it returns false. `Logger` used as a type never trips it.
 */
function fileConstructsRawPino(src) {
    // (a) Bare `pino(` call — the literal subscription-service/src/index.ts
    // offender (`const rootLogger = pino({ ... })`). This also covers the common
    // `import pino from 'pino'` case, whose default binding is named `pino`.
    if (BARE_PINO_CALL_RE.test(src)) {
        return true;
    }

    // (b) Renamed default import used as a constructor: capture the local
    // default-import identifier, then look for a call of it.
    const m = PINO_DEFAULT_IMPORT_RE.exec(src);
    if (m) {
        const id = m[1];
        if (callRe(id).test(src)) {
            return true;
        }
    }

    return false;
}

function main() {
    if (!fs.existsSync(SERVICES_DIR)) {
        // No services directory at all — nothing to guard. Treat as OK so the
        // script never fails a checkout that pre-dates services/.
        console.log('OK');
        process.exit(0);
    }

    const offenders = [];

    const svcDirs = fs
        .readdirSync(SERVICES_DIR, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => ({ name: d.name, dir: path.join(SERVICES_DIR, d.name) }));

    for (const svc of svcDirs) {
        const srcDir = path.join(svc.dir, 'src');
        // A service dir without a src/ tree (a placeholder) has no logger to
        // guard — skip it.
        if (!fs.existsSync(srcDir)) continue;

        const files = [];
        collectTsFiles(srcDir, files);
        if (files.length === 0) continue;

        for (const file of files) {
            const rel = path.relative(REPO_ROOT, file).split(path.sep).join('/');
            // Defensive double-checks (collectTsFiles already excludes these):
            // never inspect the shared config package (it OWNS the pino import
            // for createLogger + the Logger type), never inspect test trees.
            if (rel.startsWith('packages/config/')) continue;
            if (rel.split('/').includes('__tests__')) continue;

            let src;
            try {
                src = fs.readFileSync(file, 'utf8');
            } catch (err) {
                continue; // unreadable — skip rather than crash the guard
            }

            if (fileConstructsRawPino(src)) {
                offenders.push(rel);
            }
        }
    }

    if (offenders.length > 0) {
        console.error(
            "check-shared-logger: service src file(s) construct a raw pino logger — import the shared createLogger from @nightfuel/config instead of calling pino(...) directly:",
        );
        for (const rel of offenders) {
            console.error(`  ${rel}`);
        }
        process.exit(1);
    }

    console.log('OK');
    process.exit(0);
}

// Run main() only when invoked as a script — the unit test imports this file
// for the pure helpers without wanting the side-effect of an exit.
if (require.main === module) {
    main();
}

// Expose the pure helpers for the unit test in scripts/__tests__/.
module.exports.__test = {
    PINO_DEFAULT_IMPORT_RE,
    BARE_PINO_CALL_RE,
    collectTsFiles,
    fileConstructsRawPino,
};
