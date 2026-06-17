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
 * ROBUSTNESS — two hardenings, both Node-built-ins only:
 *
 *   (1) COMMENT / STRING FALSE-MATCH IMMUNITY ──────────────────────────────
 *       The `pino(` / renamed-default-call detection runs over a TOLERANT
 *       tokenizer pass (`stripCommentsAndStrings`) that blanks the CONTENTS of
 *       line comments (`// …`), block comments (`/* … *​/`), and string /
 *       template literals (`'…'`, `"…"`, `` `…` ``) — replacing each char with a
 *       space while PRESERVING newlines so line/column positions are intact.
 *       This way a `pino(` sitting inside a comment or a string literal does NOT
 *       match, while a real-code `pino(` still does. Import lines are read from
 *       the ORIGINAL source (imports never live inside a comment/string, and the
 *       default-import regex needs the literal `'pino'` module specifier, which
 *       stripping would blank). Template `${…}` expressions return to code state
 *       so a `pino(` interpolated as real code is still caught.
 *
 *   (2) `createLogger(...) as <X>` CAST-EVASION DETECTOR ────────────────────
 *       A band-aid can re-introduce a hand-rolled pino logger while still
 *       *calling* the shared factory, by casting the factory result through a
 *       hand-rolled pino-logger type:
 *           const log = createLogger('x') as SomethingHidingRawPino;
 *       We flag a `createLogger(...) as <X>` cast when its EFFECTIVE (final)
 *       cast target is NOT one of the documented, legitimate dep-nesting
 *       reconciliation shapes. The allow-list is exactly:
 *           as Logger                  // pino's Logger type (named/namespaced)
 *           as pino.Logger
 *           as unknown as Logger       // the subscription-service/src/index.ts:62
 *           as unknown as pino.Logger  //   documented two-step reconciliation
 *           as any  /  as unknown      // looser reconciliation casts in use today
 *                                      //   (plan-service worker.ts, notification
 *                                      //    -service index.ts) — TS escape hatch,
 *                                      //    NOT a hand-rolled logger
 *       For a chained `x as A as B` cast, TS resolves the type to the LAST
 *       segment (`B`), so we test the final segment (after stripping a leading
 *       `pino.` namespace qualifier) against the allow-list. `as Logger`,
 *       `as unknown as Logger`, `as any`, `as unknown` stay clean; a cast onto
 *       any OTHER named type — the hand-rolled-logger evasion — is flagged.
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
//
// NOTE: this is run over the COMMENT/STRING-STRIPPED text (see
// stripCommentsAndStrings), so a `pino(` inside a `// …` comment or a `'…'`
// string literal can never match — only a real-code `pino(` does.
const BARE_PINO_CALL_RE = /\bpino\s*\(/;

// A `createLogger(...) as <cast>` cast. We capture the WHOLE cast expression
// after `as ` (up to the statement-ish terminator: `;`, `,`, `)`, or end of
// line) so a chained `as unknown as Logger` is captured in full and we can
// resolve its EFFECTIVE (final) target type. The `createLogger\s*\([^)]*\)`
// head is single-line on purpose — every createLogger cast in the tree is on
// one line, and a `)` inside the arg list would be unusual for a logger label.
const CREATE_LOGGER_CAST_RE = /\bcreateLogger\s*\([^)]*\)\s+as\s+([^;,)\n]+)/g;

// Cast targets that are LEGITIMATE dep-nesting reconciliation shapes and must
// NEVER be flagged. We compare the EFFECTIVE (final) target of the cast chain,
// after stripping a leading `pino.` namespace qualifier:
//   • `Logger`           — pino's Logger type (the documented `as ... Logger`)
//   • `any` / `unknown`  — the TS escape-hatch reconciliation casts in live use
//                          (plan-service/src/worker.ts, notification-service/
//                          src/index.ts). These widen the type, they do NOT
//                          re-bind a hand-rolled pino logger.
// Any OTHER named target (`as SomethingHidingRawPino`) is the evasion we flag.
const ALLOWED_CAST_TARGETS = new Set(['Logger', 'any', 'unknown']);

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
 * Tolerant tokenizer pass: return a copy of `src` with the CONTENTS of comments
 * and string/template literals blanked to spaces, while PRESERVING newlines (and
 * therefore every line/column position). After this pass a `pino(` that lived
 * inside a `// …` comment or a `'…'`/`"…"`/`` `…` `` literal is gone, so the
 * `pino(` / renamed-default-call detectors see only real code.
 *
 * Single forward scan over a small state machine — Node built-ins only, no AST:
 *   • line comment   `// … <EOL>`      — blanked to EOL (newline kept)
 *   • block comment  `/* … *​/`         — blanked across lines (newlines kept)
 *   • '…' / "…"      single/double str  — blanked, honouring `\` escapes; a
 *                                         newline ends it defensively (avoids
 *                                         runaway on a malformed unterminated str)
 *   • `…`            template literal   — blanked, BUT a `${ … }` expression
 *                                         returns to CODE state (its contents are
 *                                         real code and stay verbatim), with `{}`
 *                                         nesting tracked so an inner object `}`
 *                                         doesn't close the expression early.
 * The transformation never changes the string LENGTH, only blanks chars, so
 * offsets reported by any downstream regex map straight back onto `src`.
 */
function stripCommentsAndStrings(src) {
    const out = new Array(src.length);
    // Active state: 'code' | 'line' | 'block' | 'sq' | 'dq' | 'tmpl'.
    let state = 'code';
    // Stack of `{}` depths for nested template `${…}` expressions, so leaving a
    // `${…}` returns to the correct enclosing template (handles `` `${`${x}`}` ``).
    const tmplExprDepth = [];
    let i = 0;
    const blank = (idx) => {
        // Guard the 2-char lookahead advances (`//`, `/*`, `*​/`, `\x`, `${`) so a
        // pattern starting at the very last char never writes out[src.length]
        // and lengthens the joined result.
        if (idx >= src.length) return;
        out[idx] = src[idx] === '\n' ? '\n' : ' ';
    };
    while (i < src.length) {
        const c = src[i];
        const next = src[i + 1];
        if (state === 'code') {
            if (c === '/' && next === '/') {
                state = 'line';
                blank(i); blank(i + 1);
                i += 2;
                continue;
            }
            if (c === '/' && next === '*') {
                state = 'block';
                blank(i); blank(i + 1);
                i += 2;
                continue;
            }
            if (c === "'") { state = 'sq'; blank(i); i++; continue; }
            if (c === '"') { state = 'dq'; blank(i); i++; continue; }
            if (c === '`') { state = 'tmpl'; blank(i); i++; continue; }
            // Inside a template `${…}` expression (code state), a `}` that
            // unwinds the current expression depth to 0 closes it and returns to
            // the enclosing template literal.
            if (tmplExprDepth.length > 0) {
                if (c === '{') {
                    tmplExprDepth[tmplExprDepth.length - 1]++;
                } else if (c === '}') {
                    tmplExprDepth[tmplExprDepth.length - 1]--;
                    if (tmplExprDepth[tmplExprDepth.length - 1] === 0) {
                        tmplExprDepth.pop();
                        state = 'tmpl';
                        blank(i); // the closing `}` belongs to the template, blank it
                        i++;
                        continue;
                    }
                }
            }
            out[i] = c; // real code — keep verbatim
            i++;
            continue;
        }
        if (state === 'line') {
            if (c === '\n') { state = 'code'; out[i] = '\n'; i++; continue; }
            blank(i); i++;
            continue;
        }
        if (state === 'block') {
            if (c === '*' && next === '/') {
                state = 'code';
                blank(i); blank(i + 1);
                i += 2;
                continue;
            }
            blank(i); i++;
            continue;
        }
        if (state === 'sq' || state === 'dq') {
            const closer = state === 'sq' ? "'" : '"';
            if (c === '\\') { blank(i); blank(i + 1); i += 2; continue; }
            if (c === closer) { state = 'code'; blank(i); i++; continue; }
            // A bare newline defensively closes a malformed unterminated string
            // (real single/double-quoted strings never span a raw newline).
            if (c === '\n') { state = 'code'; out[i] = '\n'; i++; continue; }
            blank(i); i++;
            continue;
        }
        if (state === 'tmpl') {
            if (c === '\\') { blank(i); blank(i + 1); i += 2; continue; }
            if (c === '`') { state = 'code'; blank(i); i++; continue; }
            if (c === '$' && next === '{') {
                // Enter a `${…}` expression: real code, tracked at depth 1.
                tmplExprDepth.push(1);
                state = 'code';
                blank(i); blank(i + 1); // blank the `${` punctuation itself
                i += 2;
                continue;
            }
            blank(i); i++;
            continue;
        }
        // Unreachable, but keep the scan total.
        out[i] = c;
        i++;
    }
    return out.join('');
}

/**
 * True when `code` (already comment/string-stripped) contains a
 * `createLogger(...) as <X>` cast whose EFFECTIVE target type is the
 * hand-rolled-logger evasion — i.e. NOT one of the allow-listed dep-nesting
 * reconciliation shapes (`Logger` / `pino.Logger` / `any` / `unknown`, in any
 * `as A as B` chain that resolves to one of those). Pure + side-effect-free so
 * the unit test can drive it directly.
 *
 * For a chain `createLogger(...) as A as B as …`, TypeScript resolves the value
 * to the type of the LAST `as` segment, so we take the final segment, strip a
 * leading `pino.` namespace qualifier, and compare it against the allow-list.
 */
function castEvadesSharedLogger(code) {
    CREATE_LOGGER_CAST_RE.lastIndex = 0;
    let m;
    while ((m = CREATE_LOGGER_CAST_RE.exec(code)) !== null) {
        const castExpr = m[1];
        // Split the chain on the `as` keyword (`unknown as Logger` → final
        // `Logger`); the effective TS type is the last segment.
        const segments = castExpr
            .split(/\bas\b/)
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
        if (segments.length === 0) continue;
        let finalTarget = segments[segments.length - 1];
        // Strip a `pino.`-style namespace qualifier so `pino.Logger` → `Logger`.
        finalTarget = finalTarget.replace(/^[A-Za-z_$][\w$]*\./, '');
        if (!ALLOWED_CAST_TARGETS.has(finalTarget)) {
            return true; // cast onto a non-allow-listed type → evasion
        }
    }
    return false;
}

/**
 * True when `src` constructs (or smuggles in) a raw pino logger. Pure +
 * side-effect-free so the unit test can drive every branch directly.
 *
 *   (a) a bare `pino(` constructor call appears in REAL CODE, OR
 *   (b) a default `import <id> from 'pino'` is present AND `<id>` is later
 *       CALLED as `<id>(` in REAL CODE, OR
 *   (c) a `createLogger(...) as <X>` cast re-introduces a hand-rolled pino
 *       logger via a non-allow-listed cast target (see castEvadesSharedLogger).
 *
 * Robustness: the `pino(` / renamed-call detection in (a)/(b) and the cast
 * detection in (c) run over the COMMENT/STRING-STRIPPED text, so a `pino(`
 * (or a `createLogger(...) as …`) inside a `// …` comment or a string/template
 * literal does NOT match — only real code does. Import lines for (b) are read
 * from the ORIGINAL `src`: an `import … from 'pino'` is never inside a comment
 * or string, and the regex needs the literal `'pino'` specifier that stripping
 * would blank.
 *
 * A NAMED/type import alone (`import { Logger } from 'pino'`, `import type
 * { Logger } from 'pino'`) constructs nothing — there is no default binding and
 * no `pino(` call — so it returns false. `Logger` used as a type never trips it.
 */
function fileConstructsRawPino(src) {
    // Blank out comments + string/template literals once; all shape detection
    // below runs over this so a `pino(` / cast inside a comment or string can't
    // false-positive. (b)'s import id is still read from the original `src`.
    const code = stripCommentsAndStrings(src);

    // (a) Bare `pino(` call in real code — the literal subscription-service/
    // src/index.ts offender (`const rootLogger = pino({ ... })`). This also
    // covers the common `import pino from 'pino'` case (default binding `pino`).
    if (BARE_PINO_CALL_RE.test(code)) {
        return true;
    }

    // (b) Renamed default import used as a constructor: capture the local
    // default-import identifier from the ORIGINAL source, then look for a call
    // of it in real code.
    const m = PINO_DEFAULT_IMPORT_RE.exec(src);
    if (m) {
        const id = m[1];
        if (callRe(id).test(code)) {
            return true;
        }
    }

    // (c) `createLogger(...) as <hand-rolled pino logger>` cast evasion. The
    // legitimate dep-nesting reconciliation casts (`as Logger`,
    // `as unknown as Logger`, `as any`, `as unknown`) are allow-listed and stay
    // clean; any other cast target is flagged.
    if (castEvadesSharedLogger(code)) {
        return true;
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
    CREATE_LOGGER_CAST_RE,
    ALLOWED_CAST_TARGETS,
    collectTsFiles,
    stripCommentsAndStrings,
    castEvadesSharedLogger,
    fileConstructsRawPino,
};
