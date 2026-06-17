#!/usr/bin/env node
/**
 * NightFuel — CI drift guard: no app screen renders a direct <SafeBlurView> as a
 * CARD surface outside the sanctioned GlassCard primitive.
 *
 * Contract enforced over the mobile app-screen tree (clients/mobile/app):
 *
 *   ONE GLASS-CARD HOME ─────────────────────────────────────────────────────
 *     The Aurora dark-glass CARD surface is owned by ONE primitive —
 *     src/components/ui/GlassCard.tsx. It wraps the single sanctioned
 *     <SafeBlurView> card fill in a View that owns the radius + hairline + clip
 *     + the Android<12 fallback. Re-introducing the duplicated inline pattern
 *
 *         <SafeBlurView tint="dark" intensity={40} style={styles.card}>…</SafeBlurView>
 *
 *     on a migrated screen is exactly the drift this guard catches: it doubles
 *     the hairline, clips inconsistently across iOS/Android, and re-opens the
 *     Android<12 fallback footgun GlassCard already solves. After the migration
 *     landed (more/community/calculator/[id]/fasting/planner all converted), the
 *     ONLY app-tree files that still render a <SafeBlurView> are GlassCard.tsx
 *     (the primitive — allowlisted), (tabs)/_layout.tsx (the tab-bar blur, an
 *     absoluteFill overlay), and training/workout.tsx (a full-screen countdown
 *     overlay + a rest-timer modal backdrop, both absoluteFill/absoluteFillObject
 *     overlays) — so this guard exits 0. A future regression that drops a
 *     card-shaped <SafeBlurView> back into an app screen can't merge.
 *
 *     This mirrors check-shared-logger.js: a structural, dependency-free static
 *     guard that drift-proofs a cross-screen UI-primitive contract.
 *
 * What is (and isn't) an offense — we are deliberately CONSERVATIVE so the
 * post-migration tree stays green. We classify the `style=` of each
 * <SafeBlurView> opening tag and flag ONLY a CARD signature:
 *
 *   ALLOWED — NON-card overlay fills (never flagged):
 *     • style={StyleSheet.absoluteFill}
 *     • style={StyleSheet.absoluteFillObject}
 *     • style={[StyleSheet.absoluteFill, …]}        (array whose FIRST member is
 *     • style={[StyleSheet.absoluteFillObject, …]}   an absoluteFill — extra
 *                                                     members are irrelevant)
 *     • a <SafeBlurView> with NO `style=` at all (nothing card-shaped to assert)
 *     • any style expression we cannot positively classify as a card (we
 *       default-allow ambiguity rather than risk a false positive)
 *
 *   FLAGGED — CARD signatures (the inline-glass drift):
 *     • a NAMED card style — `style={styles.card}` / `style={styles.profileCard}`
 *       / `style={styles.zoneTable}` etc. (a `styles.<name>` member used as the
 *       SafeBlurView's own style; the only sanctioned SafeBlurView styles in the
 *       tree are the inline `StyleSheet.absoluteFill*` overlays, so a NAMED
 *       StyleSheet style on a SafeBlurView is the duplicated card pattern), OR
 *     • an INLINE OBJECT carrying card layout — `style={{ padding…: …, … }}` /
 *       `style={{ flex: 1, borderRadius: …, borderWidth: 1, … }}` — i.e. an
 *       inline `{…}` (optionally the non-absoluteFill member of an array) whose
 *       keys include a card-layout prop (padding*, flex, or borderRadius — the
 *       hallmarks of a card fill, never present on a bare overlay scrim).
 *
 * ROBUSTNESS — comment/string false-match immunity (Node built-ins only):
 *   The whole detection runs over a COMMENT/STRING-STRIPPED copy of the source
 *   (stripCommentsAndStrings, ported from check-shared-logger.js): the CONTENTS
 *   of line comments (`// …`), block comments (`/* … *​/`), and string/template
 *   literals are blanked to spaces while NEWLINES (and therefore line numbers)
 *   are preserved. So a `<SafeBlurView` written inside a comment or a string —
 *   e.g. the `// … the old SafeBlurView held` note in (tabs)/index.tsx or the
 *   `* primitive (SafeBlurView), …` doc comment in (tabs)/profile.tsx — can
 *   never trip the guard, while a real-code tag still does. Offsets in the
 *   stripped text map 1:1 onto the original, so reported line numbers are exact.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ALLOWLIST (repo-relative paths that legitimately render a <SafeBlurView>):
 *
 *   (1) clients/mobile/src/components/ui/GlassCard.tsx
 *         The primitive itself — owns the ONE sanctioned <SafeBlurView> card
 *         fill (wrapped by the View that owns radius/hairline/clip/fallback).
 *         It lives under src/, not app/, so the app-screen walk never reaches it;
 *         it is documented here for completeness.
 *
 *   (2) clients/mobile/app/(tabs)/_layout.tsx
 *         The tabBarBackground tab-bar blur — a `style={StyleSheet.absoluteFill}`
 *         overlay behind the tab bar, NOT a card. Path-allowlisted AND
 *         overlay-shaped (belt-and-suspenders).
 *
 *   (3) clients/mobile/app/training/workout.tsx
 *         Two full-bleed overlays: the startup countdown overlay (~line 662,
 *         `style={[StyleSheet.absoluteFillObject, …]}`) and the rest-timer modal
 *         backdrop (~line 684, `style={StyleSheet.absoluteFill}`). Both are
 *         absoluteFill/absoluteFillObject scrims, NOT cards. Path-allowlisted AND
 *         overlay-shaped.
 *
 * Files in the allowlist are skipped before detection; the detector's own
 * overlay-fill classification then keeps these (and any future overlay scrim)
 * green regardless. If you cannot cleanly tell a card from an overlay, the match
 * is restricted to the specific card-style signature above so the guard stays
 * green.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Dependency-free on purpose (only Node's built-in `fs` + `path`): runs in any
 * CI environment, reads ONLY local files (no network), writes nothing, and is
 * safe to chain into the root gate. Mirrors check-shared-logger.js in style
 * (collectTsxFiles walk, the same SKIP_DIRS family, `module.exports.__test`,
 * the require.main === module guard).
 *
 * Usage:   node scripts/check-no-inline-glass.js
 * Exit:    0 = clean (prints 'OK'); 1 = offender(s) found (prints each offender
 *               as `<file>:<line>` naming the inline-glass card surface).
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Repo root is one level up from /scripts.
const REPO_ROOT = path.resolve(__dirname, '..');
// The mobile app-screen tree. Every Aurora screen lives here.
const APP_DIR = path.join(REPO_ROOT, 'clients', 'mobile', 'app');

// Directories the walk never descends into (build outputs, vendored deps, the
// Expo cache, and the test tree — a test fixture may legitimately mention a
// <SafeBlurView>). Same family as check-shared-logger's SKIP_DIRS.
const SKIP_DIRS = new Set([
    'node_modules',
    '__tests__',
    '.expo',
    'dist',
    'build',
    '.next',
    '.turbo',
]);

// Repo-relative (POSIX) paths that legitimately render a <SafeBlurView> and are
// therefore skipped before detection. See the ALLOWLIST block in the header for
// the rationale on each. GlassCard.tsx lives under src/ (outside the app/ walk)
// so it never actually reaches the matcher, but it is listed here so the
// sanctioned home of the one allowed card fill is documented in code.
const ALLOWLIST = new Set([
    'clients/mobile/src/components/ui/GlassCard.tsx',
    'clients/mobile/app/(tabs)/_layout.tsx',
    'clients/mobile/app/training/workout.tsx',
]);

// An opening <SafeBlurView …> JSX tag. The `(?=[\s/>])` lookahead means a
// closing `</SafeBlurView>` (the char after `SafeBlurView` is `>` — wait, the
// `<` is preceded by `/` so the literal `</` never matches `<SafeBlurView`) and
// a longer component name (`<SafeBlurViewX`) never match — only the real
// opening tag, immediately followed by whitespace, `/`, or `>`. Global +
// sticky-free so we can iterate every tag and read each one's attributes.
const SAFE_BLUR_OPEN_RE = /<SafeBlurView(?=[\s/>])/g;

// A `styles.<name>` member reference (the named-style card signature). The only
// sanctioned SafeBlurView styles in the tree are the inline StyleSheet.absolute
// Fill* overlays, so a NAMED StyleSheet style on a SafeBlurView is the
// duplicated inline-card pattern. `StyleSheet.absoluteFill` is NOT a
// `styles.<name>` reference (object is `StyleSheet`, capitalised) — and is
// excluded explicitly by isOverlayFill running first — so it never matches here.
const NAMED_STYLE_RE = /^styles\.[A-Za-z_$][\w$]*$/;

// Card-layout property keys that, when present in an inline style object, mark
// it as a CARD fill rather than a bare overlay scrim. `padding` (any variant:
// padding / paddingHorizontal / paddingVertical / paddingTop / …), `flex`
// (flex / flexDirection / flexGrow / …), and `borderRadius` are the hallmarks
// of a card surface; an absoluteFill overlay carries none of them. Matched as a
// JS object KEY (start-of-object `{` or a `,` separator, then optional space,
// then the key, then `:`).
const CARD_LAYOUT_KEY_RE = /[{,]\s*(padding[A-Za-z]*|flex[A-Za-z]*|borderRadius)\s*:/;

/**
 * Recursively collect all *.tsx files under `dir`, skipping SKIP_DIRS so the
 * walk stays fast on a cold repo. Mirrors check-shared-logger's collectTsFiles
 * but for the *.tsx app screens. Missing/unreadable dirs are treated as empty
 * (a fresh checkout may not have the mobile client yet).
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
 * Tolerant tokenizer pass (ported verbatim in behaviour from check-shared-
 * logger.js): return a copy of `src` with the CONTENTS of comments and
 * string/template literals blanked to spaces, PRESERVING newlines (and every
 * line/column position). After this pass a `<SafeBlurView` that lived inside a
 * `// …` comment, a `/* … *​/` block, or a `'…'`/`"…"`/`` `…` `` literal is gone,
 * so the tag scanner sees only real JSX. Length is never changed (chars are
 * blanked, not removed), so a downstream offset maps straight back onto `src`.
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
 * From the index of a `<SafeBlurView` match in `code`, return the raw attribute
 * text of the opening tag — everything after `SafeBlurView` up to (but not
 * including) the `>` that closes the opening tag. JSX attribute values can carry
 * nested `{ … }` / `[ … ]` and a `>` inside an expression (e.g. an arrow fn or a
 * comparison), so we scan with brace/bracket depth tracking and stop at the
 * first `>` seen at depth 0. A self-closing `/>` ends the same way (the `>` is
 * at depth 0; the trailing `/` is included in the returned attr text, harmless).
 *
 * Operates on comment/string-stripped `code`, so any `>` that lived in a string
 * is already blanked and cannot end the tag prematurely.
 */
function readOpeningTagAttrs(code, matchIndex) {
    let i = matchIndex + '<SafeBlurView'.length;
    let depth = 0;
    const start = i;
    while (i < code.length) {
        const c = code[i];
        if (c === '{' || c === '[' || c === '(') depth++;
        else if (c === '}' || c === ']' || c === ')') {
            if (depth > 0) depth--;
        } else if (c === '>' && depth === 0) {
            break;
        }
        i++;
    }
    return code.slice(start, i);
}

/**
 * Extract the raw `style={ … }` expression value from an opening tag's attribute
 * text — the text BETWEEN the outer braces of `style={…}`. Returns null when the
 * tag has no `style=` attribute (nothing card-shaped to assert → allowed).
 *
 * We locate `style=` then, expecting a JSX-expression value `{ … }`, capture the
 * balanced contents of that outer brace pair (tracking nesting so an inner object
 * `}` doesn't close it early). A non-`{` value (e.g. a bare string `style="…"`,
 * which RN doesn't use for SafeBlurView but we handle defensively) returns null.
 */
function extractStyleExpr(attrs) {
    const m = /\bstyle\s*=\s*/.exec(attrs);
    if (!m) return null;
    let i = m.index + m[0].length;
    if (attrs[i] !== '{') return null; // not a JSX expression value
    // Capture the balanced { … } expression.
    let depth = 0;
    const start = i + 1;
    for (; i < attrs.length; i++) {
        const c = attrs[i];
        if (c === '{') depth++;
        else if (c === '}') {
            depth--;
            if (depth === 0) {
                return attrs.slice(start, i).trim();
            }
        }
    }
    // Unbalanced (malformed) — treat as no extractable style.
    return null;
}

/**
 * True when `styleExpr` (the inside of `style={…}`) is a NON-card overlay fill
 * that must NEVER be flagged:
 *   • exactly `StyleSheet.absoluteFill` or `StyleSheet.absoluteFillObject`, OR
 *   • an array `[ … ]` whose FIRST member is one of those (extra members — e.g.
 *     `{ justifyContent: 'center' }` on the workout countdown overlay — don't
 *     matter; the absoluteFill base makes it a full-bleed scrim, not a card).
 */
function isOverlayFill(styleExpr) {
    if (styleExpr == null) return false;
    const s = styleExpr.trim();
    if (s === 'StyleSheet.absoluteFill' || s === 'StyleSheet.absoluteFillObject') {
        return true;
    }
    if (s.startsWith('[')) {
        const first = firstArrayMember(s);
        if (first === 'StyleSheet.absoluteFill' || first === 'StyleSheet.absoluteFillObject') {
            return true;
        }
    }
    return false;
}

/**
 * Given an array-literal style expression `[ a, b, … ]` (leading `[` required),
 * return the trimmed text of its FIRST top-level member (up to the first `,` at
 * bracket/brace depth 0, or the closing `]`). Used to test whether an array
 * style is anchored by an absoluteFill base.
 */
function firstArrayMember(arrayExpr) {
    let i = 1; // skip leading '['
    let depth = 0;
    const start = i;
    for (; i < arrayExpr.length; i++) {
        const c = arrayExpr[i];
        if (c === '{' || c === '[' || c === '(') depth++;
        else if (c === '}' || c === ']' || c === ')') {
            if (depth === 0 && c === ']') break; // end of array, single member
            depth--;
        } else if (c === ',' && depth === 0) {
            break;
        }
    }
    return arrayExpr.slice(start, i).trim();
}

/**
 * True when `styleExpr` is a CARD signature — the inline-glass drift we flag:
 *   • a NAMED card style: a bare `styles.<name>` member reference, OR
 *   • an INLINE OBJECT carrying card layout: an inline `{ … }` (either the whole
 *     style, or — for an array style not anchored by an absoluteFill — any array
 *     member) whose keys include a card-layout prop (padding*, flex*, or
 *     borderRadius).
 *
 * Conservative by construction: isOverlayFill is checked FIRST by the caller, so
 * an absoluteFill base never reaches here; and a style we can't positively tie
 * to one of the two card shapes returns false (default-allow). Pure +
 * side-effect-free so the unit test can drive it directly.
 */
function isCardStyle(styleExpr) {
    if (styleExpr == null) return false;
    const s = styleExpr.trim();

    // (1) Named card style — `styles.card` / `styles.profileCard` / `styles.zoneTable`.
    if (NAMED_STYLE_RE.test(s)) {
        return true;
    }

    // (2) Inline object carrying card layout — anywhere in the (possibly array)
    // expression. CARD_LAYOUT_KEY_RE only matches a real object KEY (`{`/`,`
    // then key then `:`), so a `styles.card` member inside an array, or a value
    // that merely contains the substring "flex", does not false-match. An
    // absoluteFill-anchored array was already short-circuited to allowed by the
    // caller (isOverlayFill), so reaching here on an array means it is NOT an
    // overlay base.
    if (CARD_LAYOUT_KEY_RE.test(s)) {
        return true;
    }

    return false;
}

/**
 * Scan a source string for inline-glass CARD <SafeBlurView> surfaces. Returns an
 * array of 1-based LINE NUMBERS (in the ORIGINAL source) at which a card-shaped
 * <SafeBlurView> opening tag begins. Empty array = clean.
 *
 * Pipeline: strip comments/strings (so a tag mentioned in a comment/string is
 * immune), then for each real `<SafeBlurView` tag read its opening-tag attrs,
 * extract `style={…}`, and flag the tag when the style is a card signature
 * (isCardStyle) and NOT an overlay fill (isOverlayFill checked first). Line
 * numbers come from counting newlines up to the match offset in the stripped
 * text, which is offset-identical to `src`.
 *
 * Pure + side-effect-free so the unit test can drive every branch directly.
 */
function findCardSafeBlurViews(src) {
    const code = stripCommentsAndStrings(src);
    const lines = [];
    SAFE_BLUR_OPEN_RE.lastIndex = 0;
    let m;
    while ((m = SAFE_BLUR_OPEN_RE.exec(code)) !== null) {
        const attrs = readOpeningTagAttrs(code, m.index);
        const styleExpr = extractStyleExpr(attrs);
        // Overlay fills (and no-style tags) are always allowed.
        if (isOverlayFill(styleExpr)) continue;
        if (isCardStyle(styleExpr)) {
            // 1-based line number of the match offset in the stripped text
            // (== the original, offsets preserved).
            const line = code.slice(0, m.index).split('\n').length;
            lines.push(line);
        }
    }
    return lines;
}

/**
 * Convenience predicate used by the unit test: does `src` contain at least one
 * card-shaped <SafeBlurView>?
 */
function fileHasInlineGlassCard(src) {
    return findCardSafeBlurViews(src).length > 0;
}

function main() {
    if (!fs.existsSync(APP_DIR)) {
        // No mobile app tree at all — nothing to guard. Treat as OK so the
        // script never fails a checkout that pre-dates clients/mobile/app.
        console.log('OK');
        process.exit(0);
    }

    const files = [];
    collectTsxFiles(APP_DIR, files);

    const offenders = [];
    for (const file of files) {
        const rel = path.relative(REPO_ROOT, file).split(path.sep).join('/');
        // Allowlisted screens legitimately render a <SafeBlurView> (tab-bar /
        // overlay scrims). Skip them before detection.
        if (ALLOWLIST.has(rel)) continue;

        let src;
        try {
            src = fs.readFileSync(file, 'utf8');
        } catch (err) {
            continue; // unreadable — skip rather than crash the guard
        }

        const lineNos = findCardSafeBlurViews(src);
        for (const line of lineNos) {
            offenders.push(`${rel}:${line}`);
        }
    }

    if (offenders.length > 0) {
        console.error(
            'check-no-inline-glass: app screen(s) render a direct <SafeBlurView> CARD surface — use GlassCard from \'@/components/ui\' (it owns radius + hairline + clip + the Android<12 fallback):',
        );
        for (const o of offenders) {
            console.error(`  ${o}`);
        }
        process.exit(1);
    }

    console.log('OK');
    process.exit(0);
}

// Run main() only when invoked as a script — the unit test imports this file
// for the pure detector(s) without wanting the side-effect of an exit.
if (require.main === module) {
    main();
}

// Expose the pure helpers for the unit test in scripts/__tests__/.
module.exports.__test = {
    SAFE_BLUR_OPEN_RE,
    NAMED_STYLE_RE,
    CARD_LAYOUT_KEY_RE,
    collectTsxFiles,
    stripCommentsAndStrings,
    readOpeningTagAttrs,
    extractStyleExpr,
    isOverlayFill,
    firstArrayMember,
    isCardStyle,
    findCardSafeBlurViews,
    fileHasInlineGlassCard,
};
