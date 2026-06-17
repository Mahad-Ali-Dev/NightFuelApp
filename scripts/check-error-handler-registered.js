#!/usr/bin/env node
/**
 * NightFuel — CI guard: every service registers a global error handler AND no
 * 4xx/5xx body echoes raw error text.
 *
 * Two independent contracts are enforced over each services/<svc>/src/ tree:
 *
 *   (1) ERROR-HANDLER REGISTRATION ─────────────────────────────────────────
 *       Every service MUST install a Fastify global error handler so an
 *       unhandled throw never escapes as an empty 500 (or, worse, a default
 *       Fastify body that reflects the raw message). Two shapes satisfy this:
 *         • the shared helper — `registerFastifyErrorHandler(fastify, logger)`
 *           imported from @nightfuel/config (11 services use this today), OR
 *         • an inline `<app>.setErrorHandler(...)` call in the service's own
 *           src (notification-service / subscription-service / user-service).
 *       A service whose src references NEITHER is an offender. This is the
 *       drift-proofing: a brand-new service that forgets both can't merge.
 *
 *   (2) NO RAW-ERROR LEAK ON 4xx/5xx ───────────────────────────────────────
 *       The redaction contract says a 4xx/5xx reply body must NEVER echo raw
 *       `err.message` / `error.message` / `err.stack` / `error.stack` — the
 *       real cause is logged server-side; the wire gets a fixed generic
 *       string. The single safe exception is the validation-gated ternary
 *       `error.validation ? error.message : '...'` inside a global error
 *       handler (Fastify's own schema-validation messages are user-facing).
 *
 *       Two leak shapes are caught:
 *         (2a) DIRECT  — the `.send({...})` body literally contains
 *              `err.message` / `error.message` / `.stack` outside the safe
 *              `validation ? ... message` form. e.g.
 *              `reply.code(500).send({ error: err.message })`.
 *         (2b) INDIRECT — the body interpolates `${v}` where `v` is a local
 *              bound to raw error text (`const v = err.message ...`). This is
 *              the real subscription-service/src/stripe.ts offender:
 *              `reply.status(400).send({ error: `Webhook Error: ${message}` })`
 *              with `const message = err instanceof Error ? err.message : ...`
 *              two lines above. A regex anchored only on the `.send(` line
 *              would miss it, so we extract the full balanced `.send(...)`
 *              argument and resolve interpolated identifiers against the
 *              file's `const X = ... err.message`-style bindings.
 *
 *       The detector ONLY inspects `.send(...)` arguments on a reply whose
 *       chained `.code(NNN)` / `.status(NNN)` is >= 400 (or a bare `.send(`
 *       sitting inside a `catch` block). This is what keeps it from
 *       false-positiving on the dozens of SAFE generic bodies
 *       (`{ error: 'Internal server error' }`) that merely happen to sit a few
 *       lines below an `if (err.message...)` branch or a `catch (err)` clause —
 *       the `err.message` in those windows is in CONTROL FLOW, never in the
 *       body we extract.
 *
 * Dependency-free on purpose (only Node's built-in `fs` + `path`): runs in any
 * CI environment, reads ONLY local files (no network), writes nothing, and is
 * safe to chain into the root gate. Mirrors scripts/check-no-inline-401.js in
 * style (collectTsFiles walk, findOffendingLine, `module.exports.__test`).
 *
 * Usage:   node scripts/check-error-handler-registered.js
 * Exit:    0 = clean (prints 'OK'); 1 = offender(s) found (prints file:line).
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Repo root is one level up from /scripts.
const REPO_ROOT = path.resolve(__dirname, '..');
const SERVICES_DIR = path.join(REPO_ROOT, 'services');

// Directories the walk never descends into (build outputs, vendored deps, the
// generated Prisma client, and the test tree — test files legitimately write
// down body shapes and assert against raw-error redaction).
const SKIP_DIRS = new Set([
    'node_modules',
    'dist',
    'generated',
    'build',
    '.next',
    '.turbo',
    '__tests__',
]);

// Contract (1) markers. A service src satisfies registration if it references
// either of these. We match the shared helper by name (it is only ever the
// @nightfuel/config export) OR any `.setErrorHandler(` call (the inline form).
const SHARED_HANDLER_RE = /registerFastifyErrorHandler/;
const INLINE_HANDLER_RE = /\.setErrorHandler\s*\(/;

// Contract (2) — raw error tokens that must never reach a 4xx/5xx body.
// `\b` boundaries so `error.messageKey` or `errors.message` don't false-match;
// `.stack` is matched on `err.stack` / `error.stack` specifically.
const RAW_ERROR_TOKEN_RE = /\b(?:err|error)\.message\b|\b(?:err|error)\.stack\b/;

// The single SAFE exception: a validation-gated ternary inside a global error
// handler — `error.validation ? error.message : '...'` (or the `err.` variant).
// Fastify sets `error.validation` only for its own schema errors, whose
// messages are user-facing copy and safe to reflect. We strip these spans from
// the body BEFORE looking for raw tokens, so the legitimate global-handler
// bodies (user-service / notification-service / subscription-service index.ts)
// don't trip the direct detector.
const SAFE_VALIDATION_TERNARY_RE =
    /\b(?:err|error)\.validation\s*\?\s*(?:err|error)\.message\b/g;

// A `.send(` preceded (anywhere on the same logical chain we scan back over) by
// a `.code(NNN)` or `.status(NNN)` with NNN >= 400 is an error response. We
// detect the numeric status from the chain text just before the `.send(`.
const STATUS_CALL_RE = /\.(?:code|status)\(\s*(\d{3})\s*\)/g;

/**
 * Recursively collect all *.ts files under `dir`, skipping SKIP_DIRS so the
 * walk stays fast even on a cold repo. Identical contract to
 * check-no-inline-401's collectTsFiles.
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
 * Concatenate every src file's text for a service into one blob — used for the
 * cheap registration check, which only asks "does this service reference a
 * handler ANYWHERE in src?".
 */
function serviceMentionsHandler(sources) {
    for (const src of sources) {
        if (SHARED_HANDLER_RE.test(src) || INLINE_HANDLER_RE.test(src)) {
            return true;
        }
    }
    return false;
}

/**
 * Starting at the `(` index that immediately follows a `.send`, return the
 * substring of the balanced argument list (without the outer parens), or null
 * if the parens never balance (malformed / truncated source). String and
 * template-literal contents are skipped so a `)` inside a string doesn't close
 * the argument early; we DO recurse into `${...}` template expressions because
 * those can themselves contain the identifier we care about.
 */
function extractBalancedArg(source, openParenIdx) {
    let depth = 0;
    let i = openParenIdx;
    let out = '';
    // Quote state: ' " ` — plus template-expression depth so a `}` inside a
    // `${...}` doesn't end the template string prematurely.
    let quote = null;
    let tmplExprDepth = 0;
    for (; i < source.length; i++) {
        const c = source[i];
        const prev = source[i - 1];
        if (quote) {
            // Inside a string/template. Append, watch for the close + escapes.
            if (quote === '`') {
                if (c === '$' && source[i + 1] === '{') {
                    tmplExprDepth++;
                    out += c;
                    continue;
                }
                if (c === '}' && tmplExprDepth > 0) {
                    tmplExprDepth--;
                    out += c;
                    continue;
                }
            }
            if (c === quote && prev !== '\\' && tmplExprDepth === 0) {
                quote = null;
            }
            out += c;
            continue;
        }
        if (c === "'" || c === '"' || c === '`') {
            quote = c;
            out += c;
            continue;
        }
        if (c === '(') {
            depth++;
            // Don't include the very first opening paren in the output.
            if (depth > 1) out += c;
            continue;
        }
        if (c === ')') {
            depth--;
            if (depth === 0) return out;
            out += c;
            continue;
        }
        out += c;
    }
    return null; // never balanced
}

/**
 * Collect identifiers in the file that are bound to raw error text via a simple
 * `const|let|var NAME = ... err.message|error.message|.stack ...` declaration.
 * Used by the INDIRECT (2b) detector: a body that interpolates `${NAME}` for
 * such a NAME is echoing raw error text.
 *
 * Conservative on purpose — only single-line declarations, only when the RHS
 * contains a raw-error token. This catches the stripe.ts
 * `const message = err instanceof Error ? err.message : 'Unknown'` form without
 * trying to do real dataflow.
 */
function collectErrorBoundIdentifiers(source) {
    const ids = new Set();
    const lines = source.split(/\r?\n/);
    const declRe = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(.+)$/;
    for (const line of lines) {
        const m = declRe.exec(line);
        if (!m) continue;
        const name = m[1];
        const rhs = m[2];
        if (RAW_ERROR_TOKEN_RE.test(rhs)) {
            ids.add(name);
        }
    }
    return ids;
}

/**
 * True when `body` (the extracted `.send(...)` argument text) echoes raw error
 * text. `errorBoundIds` is the set from collectErrorBoundIdentifiers.
 *
 *   • DIRECT: after stripping the safe `validation ? ...message` ternary spans,
 *     a raw `err.message` / `error.message` / `.stack` token remains.
 *   • INDIRECT: the body interpolates `${id}` where `id` is bound to raw error
 *     text. We match ONLY the `${...}` template form — a bare `id` token is
 *     deliberately NOT matched, because object KEYS collide with common bound
 *     names (e.g. `message: 'An unexpected error occurred'` would false-match a
 *     `const message = err.message` binding). Interpolation `${message}` is the
 *     real leak vector (subscription-service/src/stripe.ts:240) and cannot be a
 *     key, so it's unambiguous.
 */
function bodyEchoesRawError(body, errorBoundIds) {
    // DIRECT — strip safe validation ternary spans first, then look for tokens.
    const stripped = body.replace(SAFE_VALIDATION_TERNARY_RE, '');
    if (RAW_ERROR_TOKEN_RE.test(stripped)) return true;

    // INDIRECT — any error-bound identifier interpolated as `${... id ...}`.
    for (const id of errorBoundIds) {
        // Word-boundary inside the braces so `${messageId}` doesn't match a
        // bound `message`, but `${message}` and `${`Error: ${message}`}` do.
        const idRe = new RegExp('\\$\\{[^}]*\\b' + escapeRe(id) + '\\b[^}]*\\}');
        if (idRe.test(body)) return true;
    }
    return false;
}

function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Given the chain text immediately preceding a `.send(` (we scan back to the
 * start of the statement), return the max numeric status found via
 * `.code(NNN)` / `.status(NNN)`, or null if none.
 */
function maxStatusInChain(chainText) {
    let max = null;
    let m;
    STATUS_CALL_RE.lastIndex = 0;
    while ((m = STATUS_CALL_RE.exec(chainText)) !== null) {
        const n = parseInt(m[1], 10);
        if (max === null || n > max) max = n;
    }
    return max;
}

/**
 * Scan `source` for `.send(` call sites that ship a raw-error leak on a 4xx/5xx
 * reply. Returns an array of 1-indexed line numbers (one per offending
 * `.send(`). The heart of contract (2).
 *
 * For each `.send(` we:
 *   1) Extract the balanced argument text (handles multi-line object literals).
 *   2) Decide whether this is an ERROR response: either the preceding chain has
 *      a status >= 400, OR the `.send(` is a bare `reply.send(` sitting inside a
 *      `catch (...) {` block (per the spec's catch heuristic).
 *   3) If it is an error response AND the body echoes raw error text, flag it.
 */
function findLeakLines(source, errorBoundIds) {
    const offenders = [];
    const sendRe = /\.send\s*\(/g;
    let m;
    while ((m = sendRe.exec(source)) !== null) {
        const sendStart = m.index;
        const openParen = source.indexOf('(', sendStart);
        if (openParen === -1) continue;
        const body = extractBalancedArg(source, openParen);
        if (body === null) continue;

        // The chain text from the start of this statement up to `.send`. We scan
        // back to the previous `;`, `{`, `}` or newline-with-`return` so we
        // capture `reply.code(500).status(...)` etc. A bounded look-back of 200
        // chars is plenty for any real chained call and keeps this linear.
        const lookbackStart = Math.max(0, sendStart - 200);
        const chainText = source.slice(lookbackStart, sendStart);

        const status = maxStatusInChain(chainText);
        const isErrorStatus = status !== null && status >= 400;
        const isBareSendInCatch =
            status === null && isInsideCatch(source, sendStart);

        if (!isErrorStatus && !isBareSendInCatch) continue;

        if (bodyEchoesRawError(body, errorBoundIds)) {
            offenders.push(lineOf(source, sendStart));
        }
    }
    return offenders;
}

/**
 * Heuristic: is offset `idx` inside a `catch (...) { ... }` block? We walk
 * backwards counting brace depth; if we cross into a `catch (...)` header at
 * the depth where `idx` lives, it's a catch body. Bounded look-back keeps it
 * cheap. This only gates the BARE `.send(` (no status) case, so a false
 * negative here just means a status-less leak isn't caught — acceptable, and
 * the status-anchored path covers every real offender in the tree today.
 */
function isInsideCatch(source, idx) {
    const before = source.slice(0, idx);
    // Find the nearest enclosing `{` by brace-matching backwards.
    let depth = 0;
    for (let i = before.length - 1; i >= 0 && i > before.length - 4000; i--) {
        const c = before[i];
        if (c === '}') depth++;
        else if (c === '{') {
            if (depth === 0) {
                // This `{` opens the block containing idx. Look at the ~60 chars
                // before it for a `catch` header.
                const header = before.slice(Math.max(0, i - 60), i);
                return /catch\s*\([^)]*\)\s*$/.test(header);
            }
            depth--;
        }
    }
    return false;
}

/** 1-indexed line number of byte offset `idx` in `source`. */
function lineOf(source, idx) {
    let line = 1;
    for (let i = 0; i < idx && i < source.length; i++) {
        if (source[i] === '\n') line++;
    }
    return line;
}

function main() {
    if (!fs.existsSync(SERVICES_DIR)) {
        // No services directory at all — nothing to guard. Treat as OK so the
        // script never fails a checkout that pre-dates services/.
        console.log('OK');
        process.exit(0);
    }

    const registrationOffenders = [];
    const leakOffenders = [];

    const svcDirs = fs
        .readdirSync(SERVICES_DIR, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => ({ name: d.name, dir: path.join(SERVICES_DIR, d.name) }));

    for (const svc of svcDirs) {
        const srcDir = path.join(svc.dir, 'src');
        // A service dir without a src/ tree (e.g. a placeholder like ai-pipeline
        // / circadian-engine) has no Fastify app to guard — skip both contracts.
        if (!fs.existsSync(srcDir)) continue;

        const files = [];
        collectTsFiles(srcDir, files);
        if (files.length === 0) continue;

        const sources = [];
        const fileSources = []; // [{ rel, src }]
        for (const file of files) {
            const rel = path.relative(REPO_ROOT, file).split(path.sep).join('/');
            // Defensive double-checks (collectTsFiles already excludes these):
            // never inspect the shared config package, never inspect test trees.
            if (rel.startsWith('packages/config/')) continue;
            if (rel.split('/').includes('__tests__')) continue;

            let src;
            try {
                src = fs.readFileSync(file, 'utf8');
            } catch (err) {
                continue; // unreadable — skip rather than crash the guard
            }
            sources.push(src);
            fileSources.push({ rel, src });
        }

        // ── Contract (1): registration ──────────────────────────────────────
        if (!serviceMentionsHandler(sources)) {
            registrationOffenders.push(svc.name);
        }

        // ── Contract (2): no raw-error leak on a 4xx/5xx body ───────────────
        for (const { rel, src } of fileSources) {
            const errorBoundIds = collectErrorBoundIdentifiers(src);
            const lines = findLeakLines(src, errorBoundIds);
            for (const line of lines) {
                leakOffenders.push({ file: rel, line });
            }
        }
    }

    let failed = false;

    if (registrationOffenders.length > 0) {
        failed = true;
        console.error(
            'check-error-handler-registered: service(s) register NEITHER registerFastifyErrorHandler (from @nightfuel/config) NOR an inline .setErrorHandler():',
        );
        for (const name of registrationOffenders) {
            console.error(`  services/${name}`);
        }
    }

    if (leakOffenders.length > 0) {
        failed = true;
        console.error(
            'check-error-handler-registered: 4xx/5xx response body echoes raw err.message/error.message/.stack — log it server-side and send a fixed generic message instead:',
        );
        for (const off of leakOffenders) {
            console.error(`  ${off.file}:${off.line}`);
        }
    }

    if (failed) process.exit(1);

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
    SHARED_HANDLER_RE,
    INLINE_HANDLER_RE,
    RAW_ERROR_TOKEN_RE,
    serviceMentionsHandler,
    collectErrorBoundIdentifiers,
    extractBalancedArg,
    bodyEchoesRawError,
    maxStatusInChain,
    findLeakLines,
    isInsideCatch,
};
