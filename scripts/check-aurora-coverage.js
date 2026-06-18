#!/usr/bin/env node
/**
 * NightFuel — Aurora-adoption COVERAGE REPORT (informational, NON-blocking).
 *
 * Unlike its sibling guards (check-no-inline-glass.js / check-no-inline-cta.js),
 * which FAIL the gate when a forbidden inline pattern reappears, this script does
 * NOT enforce anything. It is a pure reporting tool: it walks the mobile
 * app-screen tree (clients/mobile/app) and reports, as counts AND percentages,
 * how many screens have adopted each Aurora UI primitive —
 *
 *     GlassCard   (the dark-glass card primitive, src/components/ui)
 *     CtaButton   (the coral-CTA primitive,        src/components/ui)
 *     StatusBar   (the expo-status-bar light status bar at the screen root)
 *
 * — so the team has an at-a-glance read on Aurora migration progress over time.
 *
 *   ALWAYS EXIT 0 ───────────────────────────────────────────────────────────
 *     This is a metric, not a gate. The script prints a clear
 *     `INFORMATIONAL (non-blocking)` banner and ALWAYS `process.exit(0)` — even
 *     at 0% coverage, even when the app tree is missing. It is wired into
 *     scripts/gate.js as a NON-fatal reporting step whose exit code is IGNORED,
 *     so the coverage numbers can NEVER block a merge. The hard Aurora contracts
 *     are owned by the two guards above; this just measures adoption.
 *
 * DENOMINATOR — what counts as a "screen":
 *   Every *.tsx under clients/mobile/app EXCEPT the non-screen route files:
 *     • files named `_layout.tsx` (Expo Router layout wrappers — not screens), and
 *     • `+not-found.tsx` (the 404 fallback route — not a product screen).
 *   We deliberately keep the rule SIMPLE: we do NOT try to detect UI-less
 *   index.tsx route-stubs (an index.tsx that merely <Redirect>s) — those still
 *   count as screens. SKIP_DIRS (build outputs / the test tree / vendored deps)
 *   are never descended into, matching the sibling guards.
 *
 * DETECTORS — per screen:
 *   (a) GlassCard — a `<GlassCard` JSX tag, OR a `GlassCard` specifier in an
 *       `import { … } from '@/components/ui'` statement. (Either signals the
 *       screen uses the glass-card primitive; some screens import it and render
 *       it via a wrapper, so the import alone counts.)
 *   (b) CtaButton — a `<CtaButton` JSX tag (the rendered primary call-to-action).
 *   (c) StatusBar — BOTH an `expo-status-bar` import AND a `<StatusBar` JSX tag.
 *       (Requiring both avoids counting a stray import or an unrelated
 *       react-native StatusBar tag — the Aurora pattern is the expo-status-bar
 *       `<StatusBar style="light" />` at the screen root.)
 *
 * ROBUSTNESS — comment false-match immunity (Node built-ins only):
 *   Each detector runs over the RIGHT view of the source, and BOTH views have
 *   their comment CONTENTS blanked so a mention inside a `// …` or block comment
 *   can never inflate a count:
 *     • TAG detectors (`<GlassCard` / `<CtaButton` / `<StatusBar`) run over the
 *       comment+string-STRIPPED source (stripCommentsAndStrings, ported verbatim
 *       in behaviour from check-no-inline-glass.js / check-no-inline-cta.js) — so
 *       a `<GlassCard` written inside a comment OR a string literal (e.g. a
 *       doc-comment example) is immune.
 *     • IMPORT detectors (`from '@/components/ui'` / `from 'expo-status-bar'`)
 *       run over a comment-only-STRIPPED source (stripComments) — because the
 *       module specifier we must read IS a string literal, the full string-strip
 *       would erase it, so for imports we blank only comments and KEEP strings.
 *       A commented-out import therefore still doesn't count.
 *   Both passes preserve newlines and total length, so offsets map onto `src`.
 *
 * Dependency-free on purpose (only Node's built-in `fs` + `path`): runs in any
 * CI environment, reads ONLY local files (no network), writes nothing. Mirrors
 * the sibling guards in style (collectTsxFiles walk, the same SKIP_DIRS family,
 * stripCommentsAndStrings, `module.exports.__test`, the require.main === module
 * guard). It carries NO allowlist and NO offender concept — it only counts.
 *
 * Usage:   node scripts/check-aurora-coverage.js
 * Exit:    ALWAYS 0 (informational / non-blocking). Prints a coverage table.
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Repo root is one level up from /scripts.
const REPO_ROOT = path.resolve(__dirname, '..');
// The mobile app-screen tree. Every Aurora screen lives here.
const APP_DIR = path.join(REPO_ROOT, 'clients', 'mobile', 'app');

// Directories the walk never descends into (build outputs, vendored deps, the
// Expo cache, and the test tree). Same family as the sibling guards' SKIP_DIRS.
const SKIP_DIRS = new Set([
    'node_modules',
    '__tests__',
    '.expo',
    'dist',
    'build',
    '.next',
    '.turbo',
]);

// Non-screen route files excluded from the denominator. `_layout.tsx` files are
// Expo Router layout wrappers (not product screens); `+not-found.tsx` is the 404
// fallback. Every OTHER *.tsx under app/ counts as a screen (we keep the rule
// simple — UI-less index.tsx redirect stubs still count).
const NON_SCREEN_BASENAMES = new Set([
    '_layout.tsx',
    '+not-found.tsx',
]);

// A `<GlassCard …>` / `<CtaButton …>` / `<StatusBar …>` opening JSX tag. The
// `(?=[\s/>])` lookahead means a closing tag (`</GlassCard>` — the `<` is
// preceded by `/`) and a longer component name (`<GlassCardX`) never match —
// only the real opening tag, immediately followed by whitespace, `/`, or `>`.
const GLASS_CARD_TAG_RE = /<GlassCard(?=[\s/>])/;
const CTA_BUTTON_TAG_RE = /<CtaButton(?=[\s/>])/;
const STATUS_BAR_TAG_RE = /<StatusBar(?=[\s/>])/;

// The expo-status-bar import — a `from 'expo-status-bar'` / `from
// "expo-status-bar"` clause. (We match the module specifier rather than the
// imported name so a renamed `{ StatusBar as Bar }` still counts; the paired
// `<StatusBar` tag check below confirms the tag is actually rendered.)
const EXPO_STATUS_BAR_IMPORT_RE = /from\s+['"]expo-status-bar['"]/;

/**
 * Recursively collect all *.tsx files under `dir`, skipping SKIP_DIRS so the
 * walk stays fast on a cold repo. Mirrors the sibling guards' collectTsxFiles.
 * Missing/unreadable dirs are treated as empty (a fresh checkout may not have
 * the mobile client yet).
 */
function collectTsxFiles(dir, out) {
    let entries;
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
        return;
    }
    for (const ent of entries) {
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) {
            if (SKIP_DIRS.has(ent.name)) continue;
            collectTsxFiles(full, out);
        } else if (ent.isFile() && ent.name.endsWith('.tsx')) {
            out.push(full);
        }
    }
}

/**
 * Tolerant tokenizer pass (ported verbatim in behaviour from check-no-inline-
 * glass.js / check-no-inline-cta.js): return a copy of `src` with the CONTENTS
 * of comments and string/template literals blanked to spaces, PRESERVING
 * newlines (and every line/column position). After this pass a `<GlassCard` /
 * `<CtaButton` / `<StatusBar` tag or a `from 'expo-status-bar'` import that lived
 * inside a `// …` comment, a block comment, or a string/template literal is gone,
 * so the detectors see only real code. Length is never changed (chars are
 * blanked, not removed), so offsets map straight back onto `src`.
 *
 * Single forward scan over a small state machine — Node built-ins only, no AST.
 * A template `${ … }` expression returns to CODE state (its contents are real
 * code), with `{}` nesting tracked so an inner object `}` doesn't close it early.
 */
function stripCommentsAndStrings(src) {
    const out = new Array(src.length);
    let state = 'code'; // 'code' | 'line' | 'block' | 'sq' | 'dq' | 'tmpl'
    const tmplExprDepth = [];
    let i = 0;
    const blank = (idx) => {
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
            if (tmplExprDepth.length > 0) {
                if (c === '{') {
                    tmplExprDepth[tmplExprDepth.length - 1]++;
                } else if (c === '}') {
                    tmplExprDepth[tmplExprDepth.length - 1]--;
                    if (tmplExprDepth[tmplExprDepth.length - 1] === 0) {
                        tmplExprDepth.pop();
                        state = 'tmpl';
                        blank(i); // the closing `}` belongs to the template
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
            if (c === '\n') { state = 'code'; out[i] = '\n'; i++; continue; }
            blank(i); i++;
            continue;
        }
        if (state === 'tmpl') {
            if (c === '\\') { blank(i); blank(i + 1); i += 2; continue; }
            if (c === '`') { state = 'code'; blank(i); i++; continue; }
            if (c === '$' && next === '{') {
                tmplExprDepth.push(1);
                state = 'code';
                blank(i); blank(i + 1);
                i += 2;
                continue;
            }
            blank(i); i++;
            continue;
        }
        out[i] = c;
        i++;
    }
    return out.join('');
}

/**
 * Comment-ONLY tolerant strip: return a copy of `src` with the CONTENTS of line
 * comments (`// …`) and block comments blanked to spaces, but STRING/TEMPLATE
 * LITERALS PRESERVED VERBATIM. Newlines and total length are preserved.
 *
 * Why a second pass: the import detectors must read a module specifier — e.g.
 * `from 'expo-status-bar'` / `from '@/components/ui'` — which is itself a string
 * literal. stripCommentsAndStrings would blank those characters, hiding the
 * import. So for imports we strip ONLY comments (a commented-out import must not
 * count) while keeping string contents intact.
 *
 * To avoid a `/` inside a regex/string being mistaken for a comment start, the
 * scanner still tracks string/template state (it just doesn't blank those
 * regions): a `//` or block-comment open only triggers while in CODE state.
 * Node built-ins only, no AST — same state-machine shape as the full strip.
 */
function stripComments(src) {
    const out = new Array(src.length);
    let state = 'code'; // 'code' | 'line' | 'block' | 'sq' | 'dq' | 'tmpl'
    const tmplExprDepth = [];
    let i = 0;
    const blank = (idx) => {
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
            // Enter — but do NOT blank — string/template state so a `/` inside a
            // literal can't be read as a comment open.
            if (c === "'") { state = 'sq'; out[i] = c; i++; continue; }
            if (c === '"') { state = 'dq'; out[i] = c; i++; continue; }
            if (c === '`') { state = 'tmpl'; out[i] = c; i++; continue; }
            if (tmplExprDepth.length > 0) {
                if (c === '{') {
                    tmplExprDepth[tmplExprDepth.length - 1]++;
                } else if (c === '}') {
                    tmplExprDepth[tmplExprDepth.length - 1]--;
                    if (tmplExprDepth[tmplExprDepth.length - 1] === 0) {
                        tmplExprDepth.pop();
                        state = 'tmpl';
                        out[i] = c; // the closing `}` belongs to the template
                        i++;
                        continue;
                    }
                }
            }
            out[i] = c;
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
            // Keep string contents verbatim (including the escape pair).
            if (c === '\\') { out[i] = c; if (i + 1 < src.length) out[i + 1] = src[i + 1]; i += 2; continue; }
            if (c === closer) { state = 'code'; out[i] = c; i++; continue; }
            if (c === '\n') { state = 'code'; out[i] = '\n'; i++; continue; }
            out[i] = c; i++;
            continue;
        }
        if (state === 'tmpl') {
            if (c === '\\') { out[i] = c; if (i + 1 < src.length) out[i + 1] = src[i + 1]; i += 2; continue; }
            if (c === '`') { state = 'code'; out[i] = c; i++; continue; }
            if (c === '$' && next === '{') {
                tmplExprDepth.push(1);
                state = 'code';
                out[i] = c; out[i + 1] = next;
                i += 2;
                continue;
            }
            out[i] = c; i++;
            continue;
        }
        out[i] = c;
        i++;
    }
    return out.join('');
}

/**
 * True when `basename` (a file's base name, e.g. `index.tsx`) is a SCREEN — a
 * *.tsx that is not one of the excluded non-screen route files (`_layout.tsx`,
 * `+not-found.tsx`). Used to build the coverage denominator.
 */
function isScreenFile(basename) {
    if (!basename.endsWith('.tsx')) return false;
    return !NON_SCREEN_BASENAMES.has(basename);
}

/**
 * True when `code` imports the GlassCard primitive from '@/components/ui'.
 * `code` is expected to be the comment-ONLY-stripped view (stripComments) so the
 * `'@/components/ui'` module specifier — a string literal — is still present
 * while a commented-out import is gone. We match a `GlassCard` specifier inside
 * an `import { … } from '@/components/ui'` clause. Robust to multi-name imports
 * (`{ Skeleton, GlassCard, CtaButton }`), to a `GlassCard as X` rename, to a
 * `import type { … }` form, and to whitespace/newlines inside the brace group.
 */
function importsGlassCardFromUi(code) {
    // Match the named-import brace group immediately before a
    // `from '@/components/ui'` / `from "@/components/ui"`. `[^{}]*` keeps the
    // brace group flat (named imports have no nested braces).
    const re = /import\s+(?:type\s+)?\{([^{}]*)\}\s*from\s+['"]@\/components\/ui['"]/g;
    let m;
    while ((m = re.exec(code)) !== null) {
        const names = m[1];
        // `GlassCard` as a whole specifier token (allow `GlassCard as X`). The
        // `(?![\w$])` boundary stops `GlassCardX` from matching.
        if (/\bGlassCard(?![\w$])/.test(names)) {
            return true;
        }
    }
    return false;
}

/**
 * Detect GlassCard adoption on one screen's source. Takes BOTH views:
 *   • `tagCode`    — comment+string-stripped (for the `<GlassCard` tag), and
 *   • `importCode` — comment-only-stripped (for the `import … from
 *     '@/components/ui'` specifier, whose module path is a string literal).
 * Adopted when EITHER a `<GlassCard` tag is rendered OR GlassCard is imported
 * from '@/components/ui'. For ergonomics the second arg defaults to the first, so
 * a caller passing a single already-correct view still works in tests.
 */
function detectGlassCard(tagCode, importCode) {
    const imp = importCode == null ? tagCode : importCode;
    return GLASS_CARD_TAG_RE.test(tagCode) || importsGlassCardFromUi(imp);
}

/**
 * Detect CtaButton adoption: a `<CtaButton` tag in the comment+string-stripped
 * `tagCode`.
 */
function detectCtaButton(tagCode) {
    return CTA_BUTTON_TAG_RE.test(tagCode);
}

/**
 * Detect StatusBar adoption: BOTH an `expo-status-bar` import (read from the
 * comment-only-stripped `importCode`, since the module specifier is a string
 * literal) AND a `<StatusBar` tag (read from the comment+string-stripped
 * `tagCode`). Requiring both avoids counting a stray import with no tag, or an
 * unrelated `<StatusBar` (e.g. react-native's) with no expo-status-bar import.
 * `importCode` defaults to `tagCode` for single-view test callers.
 */
function detectStatusBar(tagCode, importCode) {
    const imp = importCode == null ? tagCode : importCode;
    return EXPO_STATUS_BAR_IMPORT_RE.test(imp) && STATUS_BAR_TAG_RE.test(tagCode);
}

/**
 * Run all three detectors over a raw source string. Computes the two views once
 * (comment+string-stripped for TAGS, comment-only-stripped for import
 * SPECIFIERS) and dispatches each detector to the right one. Returns
 * { glassCard, ctaButton, statusBar } booleans. Pure + side-effect-free so the
 * unit test can drive every branch directly.
 */
function detectScreen(src) {
    const tagCode = stripCommentsAndStrings(src);
    const importCode = stripComments(src);
    return {
        glassCard: detectGlassCard(tagCode, importCode),
        ctaButton: detectCtaButton(tagCode),
        statusBar: detectStatusBar(tagCode, importCode),
    };
}

/**
 * Integer percentage of `count` out of `total`, rounded to the nearest whole
 * number. `total === 0` yields 0 (no screens → 0% by convention, never NaN /
 * divide-by-zero). Pure.
 */
function pct(count, total) {
    if (!total) return 0;
    return Math.round((count / total) * 100);
}

/**
 * Summarize Aurora-primitive coverage over a list of screen files. Each input
 * entry is `{ path, source }` (path is informational; only `source` is read), so
 * the unit test can pass small in-memory fixtures and production passes the real
 * files it read off disk.
 *
 * Returns:
 *   {
 *     total,                          // number of screens (denominator)
 *     glassCard: { count, percent },  // screens adopting GlassCard
 *     ctaButton: { count, percent },  // screens adopting CtaButton
 *     statusBar: { count, percent },  // screens adopting StatusBar
 *   }
 *
 * Pure + side-effect-free.
 */
function computeCoverage(files) {
    const list = Array.isArray(files) ? files : [];
    const total = list.length;
    let glass = 0;
    let cta = 0;
    let status = 0;
    for (const f of list) {
        const src = (f && typeof f.source === 'string') ? f.source : '';
        const hit = detectScreen(src);
        if (hit.glassCard) glass++;
        if (hit.ctaButton) cta++;
        if (hit.statusBar) status++;
    }
    return {
        total,
        glassCard: { count: glass, percent: pct(glass, total) },
        ctaButton: { count: cta, percent: pct(cta, total) },
        statusBar: { count: status, percent: pct(status, total) },
    };
}

/**
 * Collect the screen files (path + source) under APP_DIR for the report. Reads
 * each screen off disk; an unreadable file is skipped (treated as absent) rather
 * than crashing the report. Returns [] when the app tree is missing.
 */
function collectScreens() {
    if (!fs.existsSync(APP_DIR)) return [];
    const tsx = [];
    collectTsxFiles(APP_DIR, tsx);
    const screens = [];
    for (const file of tsx) {
        if (!isScreenFile(path.basename(file))) continue;
        let source;
        try {
            source = fs.readFileSync(file, 'utf8');
        } catch (err) {
            continue; // unreadable — skip rather than crash the report
        }
        const rel = path.relative(REPO_ROOT, file).split(path.sep).join('/');
        screens.push({ path: rel, source });
    }
    return screens;
}

/**
 * Render the coverage summary as printable lines. Returned (rather than printed)
 * so the unit test can assert on the exact text without capturing stdout. Each
 * primitive line reads e.g. `StatusBar: 78/120 screens (65%)`.
 */
function formatReport(summary) {
    const lines = [];
    lines.push('═══════════════════════════════════════════════════════════════');
    lines.push(' Aurora coverage report — INFORMATIONAL (non-blocking)');
    lines.push('═══════════════════════════════════════════════════════════════');
    lines.push(`Total screens: ${summary.total}`);
    const row = (label, m) => `  ${label}: ${m.count}/${summary.total} screens (${m.percent}%)`;
    lines.push(row('GlassCard', summary.glassCard));
    lines.push(row('CtaButton', summary.ctaButton));
    lines.push(row('StatusBar', summary.statusBar));
    lines.push('───────────────────────────────────────────────────────────────');
    lines.push('INFORMATIONAL (non-blocking) — these numbers never fail the gate.');
    lines.push('═══════════════════════════════════════════════════════════════');
    return lines;
}

function main() {
    const screens = collectScreens();
    const summary = computeCoverage(screens);
    for (const line of formatReport(summary)) {
        console.log(line);
    }
    // ALWAYS succeed — this is a metric, not a gate. Even at 0% coverage, or with
    // no app tree at all, we exit 0 so the report can never block a merge.
    process.exit(0);
}

// Run main() only when invoked as a script — the unit test imports this file
// for the pure helpers without wanting the side-effect of an exit.
if (require.main === module) {
    main();
}

// Expose the pure helpers for the unit test in scripts/__tests__/.
module.exports.__test = {
    GLASS_CARD_TAG_RE,
    CTA_BUTTON_TAG_RE,
    STATUS_BAR_TAG_RE,
    EXPO_STATUS_BAR_IMPORT_RE,
    NON_SCREEN_BASENAMES,
    collectTsxFiles,
    stripCommentsAndStrings,
    stripComments,
    isScreenFile,
    importsGlassCardFromUi,
    detectGlassCard,
    detectCtaButton,
    detectStatusBar,
    detectScreen,
    pct,
    computeCoverage,
    collectScreens,
    formatReport,
};
