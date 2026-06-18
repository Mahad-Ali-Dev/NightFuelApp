#!/usr/bin/env node
/**
 * NightFuel — CI drift guard: no app screen renders an inline coral-CTA
 * <LinearGradient> (a labeled primary call-to-action filled with the coral CTA
 * token) outside the sanctioned CtaButton primitive.
 *
 * Contract enforced over the mobile app-screen tree (clients/mobile/app):
 *
 *   ONE CTA-BUTTON HOME ──────────────────────────────────────────────────────
 *     The Aurora primary call-to-action is owned by ONE primitive —
 *     src/components/ui/CtaButton.tsx. It wraps the single sanctioned coral→pink
 *     gradient fill (the AA-lifted `gradients.coralCta` token), a white label
 *     with a textShadow for AA on the bright fill, a coral glow halo, and the
 *     pressed scale. Re-introducing the duplicated inline pattern
 *
 *         <LinearGradient colors={colors.gradients.coral} style={styles.cta}>
 *           <Ionicons … /><Text>SAVE</Text>
 *         </LinearGradient>
 *
 *     on a migrated screen is exactly the drift this guard catches: it forks the
 *     CTA look (wrong gradient stop → white-on-coral fails AA), drops the glow /
 *     pressed-scale / a11y the primitive owns, and re-opens the per-screen copy
 *     CtaButton was built to retire. After the conversion landed, the ONLY
 *     app-tree files that still render a coral-token <LinearGradient> are the
 *     NON-CTA fills (overlay scrims, FABs / avatar rings, icon-only hero badges)
 *     and the small set of legitimate inline CTAs this sprint did not convert
 *     (path-allowlisted below) — so this guard exits 0. A future regression that
 *     drops a labeled coral-CTA <LinearGradient> back into an app screen can't
 *     merge.
 *
 *     This mirrors check-no-inline-glass.js: a structural, dependency-free static
 *     guard that drift-proofs a cross-screen UI-primitive contract. CtaButton is
 *     the coral-CTA analogue of GlassCard.
 *
 * What is (and isn't) an offense — we are deliberately CONSERVATIVE so the
 * post-conversion tree stays green. For each <LinearGradient> opening tag whose
 * `colors=` is the coral CTA token (`gradients.coral` and/or `gradients.coralCta`)
 * we classify the tag and flag ONLY a labeled-button signature:
 *
 *   ALLOWED — NON-CTA coral gradients (never flagged):
 *     (a) OVERLAY / BACKGROUND fills — `style` is StyleSheet.absoluteFill /
 *         absoluteFillObject, or an ARRAY anchored by one of those. Covers the
 *         (tabs)/index.tsx hero scrim (the `countdown ? gradients.coral : …`
 *         absoluteFillObject fill, ~line 360) and the (tabs)/training.tsx
 *         beginBadge fill, and the (meals)/log-meal black scrim.
 *     (b) FABs / icon-only round buttons / avatar rings / badges — `style`
 *         references a name matching /fab|ring|badge|avatar/i. Covers the
 *         (community)/index.tsx + (tabs)/community.tsx avatar rings, the
 *         (tabs)/more.tsx avatarRing, the (meals)/grocery.tsx + (community)/
 *         index.tsx FAB gradients, the (onboarding)/permissions.tsx +
 *         profile-summary.tsx hero badges, and the (exercises)/calculator.tsx
 *         result ring.
 *     (c) HERO BADGES / decorative fills — a coral <LinearGradient> that wraps
 *         only an <Ionicons> (and/or non-text content) with NO <Text> child.
 *         An icon-only fill is a decorative chip, not a labeled CTA. Covers the
 *         (exercises)/routines.tsx add button, the (community)/[postId].tsx +
 *         messages/[id].tsx send buttons (icon-only), and the permissions hero
 *         badge.
 *     • a coral <LinearGradient> with NO `colors=` we can read, or whose colors
 *       are not the coral CTA token (e.g. a custom withAlpha scrim) — nothing
 *       CTA-shaped to assert.
 *
 *   FLAGGED — labeled coral-CTA signature (the inline-CTA drift):
 *     • a <LinearGradient colors={…gradients.coral|coralCta}> that is NOT an
 *       overlay fill (a) and NOT a fab/ring/badge/avatar-named fill (b) and that
 *       contains a <Text> child before its matching </LinearGradient> — i.e. a
 *       coral gradient acting as a labeled button fill. This is precisely the
 *       CtaButton recipe (coral gradient + white Text label) inlined onto a
 *       screen instead of using the primitive.
 *
 * ROBUSTNESS — comment/string false-match immunity (Node built-ins only):
 *   The whole detection runs over a COMMENT/STRING-STRIPPED copy of the source
 *   (stripCommentsAndStrings, ported from check-no-inline-glass.js): the CONTENTS
 *   of line comments (`// …`), block comments, and string/template literals are
 *   blanked to spaces while NEWLINES (and therefore line numbers) are preserved.
 *   So a `<LinearGradient colors={colors.gradients.coral}>` written inside a
 *   comment or a string — e.g. the `gradients.coralCta` mentions in the
 *   (tabs)/index.tsx and (tabs)/training.tsx header doc-comments — can never trip
 *   the guard, while a real-code tag still does. Offsets in the stripped text map
 *   1:1 onto the original, so reported line numbers are exact.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ALLOWLIST (repo-relative POSIX paths) — two kinds:
 *
 *   The CtaButton primitive itself:
 *     • clients/mobile/src/components/ui/CtaButton.tsx
 *         The primitive — owns the ONE sanctioned coral→pink CTA gradient fill
 *         (gradients.coralCta + white label + glow + pressed scale + a11y). It
 *         lives under src/, not app/, so the app-screen walk never reaches it; it
 *         is documented here for completeness (exactly like GlassCard.tsx is in
 *         check-no-inline-glass.js).
 *
 *   Legitimate inline coral CTAs this sprint does NOT convert (PATH-allowlisted
 *   so the guard exits 0 on the CURRENT tree and only catches NEW drift). Each is
 *   skipped before detection; remove its entry the moment the screen is migrated
 *   to CtaButton so the guard re-arms on it:
 *     • clients/mobile/app/(community)/userProfile.tsx
 *         The "MESSAGE this member" CTA (icon + Text label).
 *     • clients/mobile/app/(community)/[postId].tsx
 *         The comment "Send message" button (icon-only today, but path-pinned so
 *         a future label can't slip a new inline CTA past the guard).
 *     • clients/mobile/app/messages/[id].tsx
 *         The coral chat bubble fill (own-message bubble carries Text) + the
 *         icon-only send button.
 *     • clients/mobile/app/(exercises)/report.tsx
 *         The "BACK TO TRAINING" CTA (Text label).
 *     • clients/mobile/app/(exercises)/calculator.tsx
 *         The "SAVE TO RECORDS" CTA (icon + Text label). (Its result-ring fill is
 *         separately a /ring/ non-CTA, signature-allowed.)
 *     • clients/mobile/app/(tabs)/training.tsx
 *         The "SESSION IN PROGRESS" active-session card (coralCta + Text).
 *     • clients/mobile/app/(shifts)/index.tsx
 *         The "Generate nutrition" hero CTA.
 *     • clients/mobile/app/(settings)/index.tsx
 *         The "NightFuel" membership badge (badge-styled, also Text). Path-pinned
 *         in addition to its /badge/ signature, belt-and-suspenders.
 *     • clients/mobile/app/training/onboarding.tsx
 *         The "Start Workout" CTA (Text + icon).
 *
 * Files in the allowlist are skipped before detection; the detector's own
 * overlay / named-signature / no-Text classification then keeps every genuine
 * non-CTA gradient (and any future one of those shapes) green regardless. If a
 * coral gradient cannot be positively tied to the labeled-CTA signature, it is
 * NOT flagged (default-allow) so the guard stays green.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Dependency-free on purpose (only Node's built-in `fs` + `path`): runs in any
 * CI environment, reads ONLY local files (no network), writes nothing, and is
 * safe to chain into the root gate. Mirrors check-no-inline-glass.js in style
 * (collectTsxFiles walk, the same SKIP_DIRS family, `module.exports.__test`,
 * the require.main === module guard).
 *
 * Usage:   node scripts/check-no-inline-cta.js
 * Exit:    0 = clean (prints 'OK'); 1 = offender(s) found (prints each offender
 *               as `<file>:<line>` naming the inline coral-CTA gradient).
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
// coral <LinearGradient>). Same family as check-no-inline-glass's SKIP_DIRS.
const SKIP_DIRS = new Set([
    'node_modules',
    '__tests__',
    '.expo',
    'dist',
    'build',
    '.next',
    '.turbo',
]);

// Repo-relative (POSIX) paths that legitimately render a coral-CTA
// <LinearGradient> and are therefore skipped before detection. See the ALLOWLIST
// block in the header for the rationale on each. CtaButton.tsx lives under src/
// (outside the app/ walk) so it never actually reaches the matcher, but it is
// listed here so the sanctioned home of the one allowed CTA fill is documented
// in code (mirrors how check-no-inline-glass.js lists GlassCard.tsx).
const ALLOWLIST = new Set([
    'clients/mobile/src/components/ui/CtaButton.tsx',
    'clients/mobile/app/(community)/userProfile.tsx',
    'clients/mobile/app/(community)/[postId].tsx',
    'clients/mobile/app/messages/[id].tsx',
    'clients/mobile/app/(exercises)/report.tsx',
    'clients/mobile/app/(exercises)/calculator.tsx',
    'clients/mobile/app/(tabs)/training.tsx',
    'clients/mobile/app/(shifts)/index.tsx',
    'clients/mobile/app/(settings)/index.tsx',
    'clients/mobile/app/training/onboarding.tsx',
]);

// An opening <LinearGradient …> JSX tag. The `(?=[\s/>])` lookahead means a
// closing `</LinearGradient>` (the `<` is preceded by `/`) and a longer
// component name (`<LinearGradientX`) never match — only the real opening tag,
// immediately followed by whitespace, `/`, or `>`. Global so we can iterate
// every tag and read each one's attributes.
const LINEAR_GRADIENT_OPEN_RE = /<LinearGradient(?=[\s/>])/g;

// The coral CTA colors token, as a member-access reference inside `colors={…}`.
// Matches any object prefix (colors / theme.colors / t.colors / c …) ending in
// `.gradients.coral` or `.gradients.coralCta`, so both `colors.gradients.coral`
// and a destructured `gradients.coralCta` form are caught. The `(?![\w$])`
// boundary stops `coral` from also matching a longer identifier like
// `coralFaint`, while still allowing the exact `coral` and `coralCta` tokens.
const CORAL_TOKEN_RE = /gradients\.coral(?:Cta)?(?![\w$])/;

// Style-name signature for genuine non-CTA fills (FABs, icon-only round buttons,
// avatar rings, decorative badges). When the `style=` expression references a
// name containing one of these words, the gradient is a chrome/decorative fill,
// not a labeled CTA — never flagged. Case-insensitive; matched anywhere in the
// style expression text (covers `styles.fabGradient`, `styles.avatarRing`,
// `[styles.heroBadge, …]`, `styles.badge`, `[styles.resultRing, …]`).
const NON_CTA_STYLE_NAME_RE = /fab|ring|badge|avatar/i;

// A <Text …> opening tag inside a gradient's children (the label signature). The
// `(?=[\s/>])` boundary excludes a longer name like <TextInput> and a closing
// </Text>. <TextInput> is deliberately NOT treated as a label (it is an input
// field, not a CTA caption).
const TEXT_CHILD_RE = /<Text(?=[\s/>])/;

/**
 * Recursively collect all *.tsx files under `dir`, skipping SKIP_DIRS so the
 * walk stays fast on a cold repo. Mirrors check-no-inline-glass's
 * collectTsxFiles. Missing/unreadable dirs are treated as empty (a fresh
 * checkout may not have the mobile client yet).
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
 * glass.js): return a copy of `src` with the CONTENTS of comments and
 * string/template literals blanked to spaces, PRESERVING newlines (and every
 * line/column position). After this pass a `<LinearGradient` that lived inside a
 * `// …` comment, a block comment, or a string/template literal is gone, so the
 * tag scanner sees only real JSX. Length is never changed (chars are blanked,
 * not removed), so a downstream offset maps straight back onto `src`.
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
 * From the index of a `<LinearGradient` match in `code`, return the opening tag
 * info. `attrs` is everything after `LinearGradient` up to (but not including)
 * the `>` that closes the opening tag. JSX attribute values can carry nested
 * `{ … }` / `[ … ]` and a `>` inside an expression (e.g. an arrow fn or a
 * comparison), so we scan with brace/bracket/paren depth tracking and stop at the
 * first `>` seen at depth 0. A self-closing `/>` ends the same way (the `>` is at
 * depth 0; the trailing `/` is included in `attrs`, harmless).
 *
 * Operates on comment/string-stripped `code`, so any `>` that lived in a string
 * is already blanked and cannot end the tag prematurely.
 *
 * Returns { attrs, tagEnd, selfClosing }: the attribute text, the index of the
 * closing `>` of the opening tag (or -1 if unterminated), and whether the tag
 * self-closes (`/>`).
 */
function readOpeningTag(code, matchIndex) {
    let i = matchIndex + '<LinearGradient'.length;
    let depth = 0;
    const start = i;
    let tagEnd = -1;
    while (i < code.length) {
        const c = code[i];
        if (c === '{' || c === '[' || c === '(') depth++;
        else if (c === '}' || c === ']' || c === ')') {
            if (depth > 0) depth--;
        } else if (c === '>' && depth === 0) {
            tagEnd = i;
            break;
        }
        i++;
    }
    const attrs = code.slice(start, tagEnd === -1 ? code.length : tagEnd);
    const selfClosing = /\/\s*$/.test(attrs);
    return { attrs, tagEnd, selfClosing };
}

/**
 * Shared helper: pull the balanced `{ … }` value of the JSX attribute `name`
 * from `attrs`, returning the inner text (trimmed) or null when the attribute is
 * absent / not a `{…}` expression value. Tracks `{}` nesting so an inner object
 * brace doesn't close the value early.
 */
function extractBracedAttr(attrs, name) {
    const re = new RegExp('\\b' + name + '\\s*=\\s*');
    const m = re.exec(attrs);
    if (!m) return null;
    let i = m.index + m[0].length;
    if (attrs[i] !== '{') return null; // not a JSX expression value
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
    return null; // unbalanced (malformed) — treat as no extractable value
}

/**
 * Extract the raw `colors={ … }` expression value from an opening tag's
 * attribute text — the text BETWEEN the outer braces of `colors={…}`. Returns
 * null when the tag has no `colors=` attribute.
 */
function extractColorsExpr(attrs) {
    return extractBracedAttr(attrs, 'colors');
}

/**
 * Extract the raw `style={ … }` expression value from an opening tag's attribute
 * text. Returns null when the tag has no `style=` attribute.
 */
function extractStyleExpr(attrs) {
    return extractBracedAttr(attrs, 'style');
}

/**
 * True when `colorsExpr` (the inside of `colors={…}`) references the coral CTA
 * token — `gradients.coral` or `gradients.coralCta`. A ternary such as
 * `countdown ? colors.gradients.coral : […]` still matches (it CAN render the
 * coral fill); such cases are kept green by the overlay/style classification, not
 * by pretending they are non-coral.
 */
function isCoralToken(colorsExpr) {
    if (colorsExpr == null) return false;
    return CORAL_TOKEN_RE.test(colorsExpr);
}

/**
 * True when `styleExpr` (the inside of `style={…}`) is a NON-CTA OVERLAY fill
 * that must NEVER be flagged:
 *   • exactly `StyleSheet.absoluteFill` or `StyleSheet.absoluteFillObject`, OR
 *   • an array `[ … ]` whose FIRST member is one of those (extra members don't
 *     matter; the absoluteFill base makes it a full-bleed scrim, not a CTA).
 * Mirrors check-no-inline-glass.js's isOverlayFill.
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
 * True when `styleExpr` references a fab / ring / badge / avatar style name —
 * the signature of a genuine non-CTA chrome fill (FAB, icon-only round button,
 * avatar ring, decorative badge). Never flagged. A null/absent style is NOT a
 * named non-CTA fill (returns false) — the no-Text check below still covers the
 * styleless icon-only case.
 */
function isNonCtaNamedStyle(styleExpr) {
    if (styleExpr == null) return false;
    return NON_CTA_STYLE_NAME_RE.test(styleExpr);
}

/**
 * Return the raw children text of a <LinearGradient> element: the source between
 * the end of its opening tag and the START of its matching </LinearGradient>,
 * honouring nested <LinearGradient> … </LinearGradient> pairs so an inner
 * gradient's close doesn't terminate the outer element early. A self-closing
 * `<LinearGradient … />` has no children → ''. `code` must be the comment/string
 * -stripped source so a `</LinearGradient>` inside a string can't mis-close.
 *
 * openTagEnd is the index of the `>` that closes the opening tag (-1 = none).
 */
function readChildren(code, openTagEnd, selfClosing) {
    if (selfClosing || openTagEnd < 0) return '';
    const openRe = /<LinearGradient(?=[\s/>])/g;
    const closeRe = /<\/LinearGradient\s*>/g;
    let depth = 1;
    let cursor = openTagEnd + 1;
    const childStart = cursor;
    while (cursor < code.length) {
        openRe.lastIndex = cursor;
        closeRe.lastIndex = cursor;
        const nextOpen = openRe.exec(code);
        const nextClose = closeRe.exec(code);
        if (!nextClose) {
            // No matching close (malformed/truncated) — return what we have so a
            // <Text> already seen still counts.
            return code.slice(childStart);
        }
        if (nextOpen && nextOpen.index < nextClose.index) {
            // A nested opening tag — but a self-closing nested gradient opens and
            // closes itself and does not change depth.
            const nested = readOpeningTag(code, nextOpen.index);
            if (!nested.selfClosing) depth++;
            cursor = (nested.tagEnd === -1 ? code.length : nested.tagEnd) + 1;
            continue;
        }
        depth--;
        if (depth === 0) {
            return code.slice(childStart, nextClose.index);
        }
        cursor = nextClose.index + nextClose[0].length;
    }
    return code.slice(childStart);
}

/**
 * True when `childrenText` contains a <Text> child — the labeled-button
 * signature. Operates on the comment/string-stripped children, so a `<Text` in a
 * comment/string doesn't count.
 */
function hasTextChild(childrenText) {
    return TEXT_CHILD_RE.test(childrenText);
}

/**
 * Scan a source string for inline coral-CTA <LinearGradient> surfaces. Returns
 * an array of 1-based LINE NUMBERS (in the ORIGINAL source) at which a flagged
 * coral-CTA opening tag begins. Empty array = clean.
 *
 * Pipeline: strip comments/strings (so a tag mentioned in a comment/string is
 * immune), then for each real `<LinearGradient` tag: read its opening-tag attrs,
 * require its `colors=` to be the coral CTA token, then flag it ONLY when it is
 * NOT an overlay fill (a), NOT a fab/ring/badge/avatar-named fill (b), and DOES
 * contain a <Text> child (the labeled-CTA signature; an icon-only/no-text fill
 * (c) is allowed). Line numbers come from counting newlines up to the match
 * offset in the stripped text, which is offset-identical to `src`.
 *
 * Pure + side-effect-free so the unit test can drive every branch directly.
 */
function findInlineCtaGradients(src) {
    const code = stripCommentsAndStrings(src);
    const lines = [];
    LINEAR_GRADIENT_OPEN_RE.lastIndex = 0;
    let m;
    while ((m = LINEAR_GRADIENT_OPEN_RE.exec(code)) !== null) {
        const { attrs, tagEnd, selfClosing } = readOpeningTag(code, m.index);

        // Only coral-CTA-token gradients are candidates.
        const colorsExpr = extractColorsExpr(attrs);
        if (!isCoralToken(colorsExpr)) continue;

        const styleExpr = extractStyleExpr(attrs);
        // (a) overlay scrims and (b) fab/ring/badge/avatar fills are always OK.
        if (isOverlayFill(styleExpr)) continue;
        if (isNonCtaNamedStyle(styleExpr)) continue;

        // (c) icon-only / no-Text decorative fills are OK; a <Text> child is the
        // labeled-CTA signature we flag.
        const children = readChildren(code, tagEnd, selfClosing);
        if (!hasTextChild(children)) continue;

        // 1-based line number of the match offset in the stripped text
        // (== the original, offsets preserved).
        const line = code.slice(0, m.index).split('\n').length;
        lines.push(line);
    }
    return lines;
}

/**
 * Convenience predicate used by the unit test: does `src` contain at least one
 * inline coral-CTA <LinearGradient>?
 */
function fileHasInlineCta(src) {
    return findInlineCtaGradients(src).length > 0;
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
        // Allowlisted screens legitimately render a coral-CTA <LinearGradient>.
        // Skip them before detection.
        if (ALLOWLIST.has(rel)) continue;

        let src;
        try {
            src = fs.readFileSync(file, 'utf8');
        } catch (err) {
            continue; // unreadable — skip rather than crash the guard
        }

        const lineNos = findInlineCtaGradients(src);
        for (const line of lineNos) {
            offenders.push(`${rel}:${line}`);
        }
    }

    if (offenders.length > 0) {
        console.error(
            'check-no-inline-cta: app screen(s) render an inline coral-CTA <LinearGradient> (a labeled coral button fill) — use CtaButton from \'@/components/ui\' (it owns the coralCta gradient + white label + glow + pressed scale + a11y):',
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
    LINEAR_GRADIENT_OPEN_RE,
    CORAL_TOKEN_RE,
    NON_CTA_STYLE_NAME_RE,
    TEXT_CHILD_RE,
    ALLOWLIST,
    collectTsxFiles,
    stripCommentsAndStrings,
    readOpeningTag,
    extractColorsExpr,
    extractStyleExpr,
    extractBracedAttr,
    isCoralToken,
    isOverlayFill,
    firstArrayMember,
    isNonCtaNamedStyle,
    readChildren,
    hasTextChild,
    findInlineCtaGradients,
    fileHasInlineCta,
};
