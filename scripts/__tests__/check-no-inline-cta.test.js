/**
 * Unit test — scripts/check-no-inline-cta.js contract.
 *
 * The guard (scripts/check-no-inline-cta.js) enforces one contract over the
 * mobile app-screen tree (clients/mobile/app):
 *
 *   NO INLINE CORAL CTA — no app screen renders an inline coral-CTA
 *   <LinearGradient> (a labeled primary call-to-action filled with the coral CTA
 *   token, `colors={…gradients.coral|coralCta}`) outside the sanctioned
 *   CtaButton primitive (src/components/ui/CtaButton.tsx). A coral-token
 *   <LinearGradient> is FLAGGED only when it is acting as a labeled button fill —
 *   i.e. it is NOT an overlay scrim (StyleSheet.absoluteFill*), NOT a
 *   fab/ring/badge/avatar-named chrome fill, and DOES wrap a <Text> label. The
 *   SAFE shapes that must NEVER be flagged are: (a) absoluteFill / absoluteFill
 *   Object overlays (and arrays anchored by one), (b) fab/ring/badge/avatar-
 *   styled fills (FABs, avatar rings, decorative badges), and (c) icon-only hero
 *   badges (a coral gradient wrapping only an <Ionicons> with no <Text> child).
 *
 * This suite locks the detector in on BOTH directions. If anyone narrows it so a
 * real labeled coral CTA slips past — or widens it so it false-positives on an
 * absoluteFill overlay, a fab/ring/badge fill, an icon-only hero badge, or a
 * <LinearGradient mentioned in a comment/string — these assertions go red BEFORE
 * the change reaches CI.
 *
 * It also asserts the gate wiring: scripts/gate.js's buildSteps() includes the
 * new `check-no-inline-cta` step as a HARD step (NO `file:` existsSync guard),
 * so the gate-steps meta self-test (which enforces HARD steps for present
 * scripts) stays green.
 *
 * Plain JS (not TS) on purpose: the scripts under test are plain JS too, so the
 * test stays close to the production surface and runs without the babel/ts-jest
 * transform stack — it runs under the gate's harness-self-test jest pass
 * (`--transform '{}'`). We import the pure helpers via each script's
 * `module.exports.__test` back-door. Importing the modules is safe: their
 * main()/CLI only runs under the require.main === module guard.
 *
 * Run from repo root: `npx jest scripts/__tests__/check-no-inline-cta.test.js`
 */

'use strict';

const path = require('path');

const { __test } = require(path.resolve(__dirname, '..', 'check-no-inline-cta.js'));
const {
    findInlineCtaGradients,
    fileHasInlineCta,
    isCoralToken,
    isOverlayFill,
    isNonCtaNamedStyle,
    hasTextChild,
    readChildren,
    readOpeningTag,
    extractColorsExpr,
    extractStyleExpr,
    firstArrayMember,
    stripCommentsAndStrings,
    CORAL_TOKEN_RE,
    NON_CTA_STYLE_NAME_RE,
} = __test;

const { __test: gateTest } = require(path.resolve(__dirname, '..', 'gate.js'));
const { buildSteps } = gateTest;

// ─────────────────────────────────────────────────────────────────────────────
// Labeled coral-CTA <LinearGradient> surfaces ARE flagged (true positives).
// ─────────────────────────────────────────────────────────────────────────────
describe('check-no-inline-cta — findInlineCtaGradients: labeled coral CTAs (true positives)', () => {
    test('a coral-token <LinearGradient> with a sibling <Text> IS flagged (with its line number)', () => {
        const src = [
            'function SaveButton() {',
            '  return (',
            '    <TouchableOpacity>',
            '      <LinearGradient colors={colors.gradients.coral} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.saveBtn}>',
            '        <Ionicons name="trophy" size={20} color="#FFF" />',
            '        <Text>SAVE TO RECORDS</Text>',
            '      </LinearGradient>',
            '    </TouchableOpacity>',
            '  );',
            '}',
        ].join('\n');
        // The opening tag is on line 4.
        expect(findInlineCtaGradients(src)).toEqual([4]);
        expect(fileHasInlineCta(src)).toBe(true);
    });

    test('a `gradients.coralCta` token + sibling <Text> IS flagged (the active-session card shape)', () => {
        const src = [
            '<TouchableOpacity onPress={resume}>',
            '  <LinearGradient colors={colors.gradients.coralCta} start={{x:0,y:0}} end={{x:1,y:1}} style={s.activeCard}>',
            '    <Text>SESSION IN PROGRESS</Text>',
            '  </LinearGradient>',
            '</TouchableOpacity>',
        ].join('\n');
        expect(findInlineCtaGradients(src)).toEqual([2]);
        expect(fileHasInlineCta(src)).toBe(true);
    });

    test('a coral CTA wrapping a <Text> across multiple nested elements IS flagged', () => {
        const src = [
            '<LinearGradient colors={colors.gradients.coral} style={styles.heroBtnGradient}>',
            '  <View style={styles.row}>',
            '    <Text>GENERATE PLAN</Text>',
            '  </View>',
            '</LinearGradient>',
        ].join('\n');
        expect(findInlineCtaGradients(src)).toEqual([1]);
    });

    test('a coral CTA with an aliased theme prefix (theme.colors.gradients.coral) + <Text> IS flagged', () => {
        const src = '<LinearGradient colors={theme.colors.gradients.coral} style={styles.cta}><Text>GO</Text></LinearGradient>';
        expect(fileHasInlineCta(src)).toBe(true);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// (a) Overlay / background fills are NOT flagged (true negatives) — keeps the
// gate green on the (tabs)/index.tsx hero scrim and (tabs)/training.tsx badge fill.
// ─────────────────────────────────────────────────────────────────────────────
describe('check-no-inline-cta — overlay fills (true negatives)', () => {
    test('`style={StyleSheet.absoluteFillObject}` with a coral ternary is NOT flagged (hero scrim shape)', () => {
        // The literal (tabs)/index.tsx:360 shape: a coral-or-fallback fill behind
        // a GlassCard, anchored by absoluteFillObject. A sibling <Text> outside
        // the gradient must not implicate the overlay.
        const src = [
            '<GlassCard>',
            '  <LinearGradient',
            '    colors={countdown ? colors.gradients.coral : [withAlpha(c, 0.18), withAlpha(c, 0.02)]}',
            '    style={StyleSheet.absoluteFillObject}',
            '    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}',
            '  />',
            '  <Text>Your shift ends in</Text>',
            '</GlassCard>',
        ].join('\n');
        expect(findInlineCtaGradients(src)).toEqual([]);
        expect(fileHasInlineCta(src)).toBe(false);
        expect(isOverlayFill('StyleSheet.absoluteFillObject')).toBe(true);
    });

    test('`style={StyleSheet.absoluteFill}` coral fill is NOT flagged', () => {
        const src = '<LinearGradient colors={colors.gradients.coralCta} style={StyleSheet.absoluteFillObject} />';
        expect(findInlineCtaGradients(src)).toEqual([]);
        expect(isOverlayFill('StyleSheet.absoluteFillObject')).toBe(true);
    });

    test('an array anchored by absoluteFill is NOT flagged even with a trailing <Text>', () => {
        const src = [
            '<LinearGradient colors={colors.gradients.coral} style={[StyleSheet.absoluteFill, { padding: 8 }]}>',
            '  <Text>x</Text>',
            '</LinearGradient>',
        ].join('\n');
        expect(findInlineCtaGradients(src)).toEqual([]);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// (b) FAB / ring / badge / avatar-styled fills are NOT flagged (true negatives).
// ─────────────────────────────────────────────────────────────────────────────
describe('check-no-inline-cta — fab/ring/badge/avatar-styled fills (true negatives)', () => {
    test('a FAB-styled coral gradient (`style={styles.fabGradient}`) is NOT flagged', () => {
        const src = '<LinearGradient colors={colors.gradients.coral} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fabGradient}><Ionicons name="add" size={32} color="#FFF" /></LinearGradient>';
        expect(findInlineCtaGradients(src)).toEqual([]);
        expect(isNonCtaNamedStyle('styles.fabGradient')).toBe(true);
    });

    test('an avatar-ring coral gradient wrapping an <Image> is NOT flagged', () => {
        const src = '<LinearGradient colors={colors.gradients.coral} style={[styles.avatarRing, shadows.glow(p)]}><Image source={a} /></LinearGradient>';
        expect(findInlineCtaGradients(src)).toEqual([]);
        expect(isNonCtaNamedStyle('[styles.avatarRing, shadows.glow(p)]')).toBe(true);
    });

    test('a badge-styled coral gradient is NOT flagged even though it wraps a <Text> (the membership badge shape)', () => {
        // (settings)/index.tsx "NightFuel" badge: a /badge/ name signature wins
        // over the <Text> child — it is decorative chrome, not a CTA.
        const src = '<LinearGradient colors={colors.gradients.coral} style={[styles.badge, shadows.glow(c)]}><Text>NightFuel</Text></LinearGradient>';
        expect(findInlineCtaGradients(src)).toEqual([]);
    });

    test('a result-ring coral gradient wrapping a <View> with <Text> inside is NOT flagged', () => {
        // (exercises)/calculator.tsx result circle: /ring/ signature → allowed.
        const src = '<LinearGradient colors={colors.gradients.coral} style={[styles.resultRing, shadows.glow(c)]}><View><Text>ESTIMATED 1RM</Text></View></LinearGradient>';
        expect(findInlineCtaGradients(src)).toEqual([]);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// (c) Icon-only hero badges / decorative fills (no <Text> child) are NOT flagged.
// ─────────────────────────────────────────────────────────────────────────────
describe('check-no-inline-cta — icon-only hero badges (true negatives)', () => {
    test('a coral hero badge wrapping ONLY an <Ionicons> is NOT flagged', () => {
        const src = [
            '<View style={styles.heroBadgeWrap}>',
            '  <LinearGradient colors={colors.gradients.coral} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.heroBadge, shadows.glow(c)]}>',
            '    <Ionicons name="rocket" size={28} color="#FFF" />',
            '  </LinearGradient>',
            '</View>',
        ].join('\n');
        expect(findInlineCtaGradients(src)).toEqual([]);
        expect(fileHasInlineCta(src)).toBe(false);
    });

    test('an icon-only send button with a non-signature style name is NOT flagged (no <Text>)', () => {
        const src = '<LinearGradient colors={colors.gradients.coral} style={styles.sendBtnGradient}><Ionicons name="send" size={18} /></LinearGradient>';
        expect(findInlineCtaGradients(src)).toEqual([]);
    });

    test('a self-closing coral <LinearGradient … /> (no children) is NOT flagged', () => {
        const src = '<LinearGradient colors={colors.gradients.coral} style={styles.fill} />';
        expect(findInlineCtaGradients(src)).toEqual([]);
    });

    test('a <TextInput> child does NOT count as a <Text> label (input field, not a caption)', () => {
        const src = '<LinearGradient colors={colors.gradients.coral} style={styles.searchPill}><TextInput placeholder="x" /></LinearGradient>';
        expect(findInlineCtaGradients(src)).toEqual([]);
        expect(hasTextChild('<TextInput placeholder="x" />')).toBe(false);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Non-coral gradients are out of scope.
// ─────────────────────────────────────────────────────────────────────────────
describe('check-no-inline-cta — non-coral gradients (out of scope)', () => {
    test('a non-coral gradient (image scrim) with a <Text> label is NOT flagged', () => {
        const src = '<LinearGradient colors={["rgba(0,0,0,0.05)", "rgba(0,0,0,0.78)"]} style={styles.catCard}><Text>Strength</Text></LinearGradient>';
        expect(findInlineCtaGradients(src)).toEqual([]);
    });

    test('a coralFaint token is NOT treated as the coral CTA token (boundary)', () => {
        const src = '<LinearGradient colors={colors.gradients.coralFaint} style={styles.cta}><Text>x</Text></LinearGradient>';
        expect(findInlineCtaGradients(src)).toEqual([]);
        expect(isCoralToken('colors.gradients.coralFaint')).toBe(false);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Comment / string false-match immunity — a coral CTA mentioned in a comment or a
// string literal must NEVER trip the guard, while a real-code one still does.
// Locks the stripCommentsAndStrings tolerant-tokenizer pass.
// ─────────────────────────────────────────────────────────────────────────────
describe('check-no-inline-cta — comment/string false-match immunity', () => {
    test('a coral CTA in a // line comment is NOT flagged', () => {
        const src = [
            'import { CtaButton } from \'@/components/ui\';',
            '// legacy: <LinearGradient colors={colors.gradients.coral} style={styles.cta}><Text>SAVE</Text></LinearGradient>',
            'return <CtaButton label="Save" onPress={onSave} />;',
        ].join('\n');
        expect(findInlineCtaGradients(src)).toEqual([]);
    });

    test('a coral CTA in a /* block comment */ is NOT flagged (the (tabs)/training.tsx header shape)', () => {
        const src = [
            '/*',
            ' * CTA fills use the shared `gradients.coralCta` token (read off useTheme()',
            ' * as `colors.gradients.coralCta`). e.g.',
            ' *   <LinearGradient colors={colors.gradients.coral} style={styles.cta}><Text>X</Text></LinearGradient>',
            ' */',
            'export function T() { return null; }',
        ].join('\n');
        expect(findInlineCtaGradients(src)).toEqual([]);
    });

    test('a coral CTA inside a string literal is NOT flagged', () => {
        const src = 'const doc = "<LinearGradient colors={colors.gradients.coral} style={styles.cta}><Text>X</Text></LinearGradient>";';
        expect(findInlineCtaGradients(src)).toEqual([]);
    });

    test('a real-code coral CTA alongside a comment-mentioned one IS still flagged (only the real one)', () => {
        const src = [
            '// note: <LinearGradient colors={colors.gradients.coral} style={styles.cta}><Text>X</Text></LinearGradient> is forbidden',
            '<LinearGradient colors={colors.gradients.coral} style={styles.realCta}><Text>SAVE</Text></LinearGradient>',
        ].join('\n');
        // The comment tag (line 1) is stripped; the real tag (line 2) is flagged.
        expect(findInlineCtaGradients(src)).toEqual([2]);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Helper-level shape locks.
// ─────────────────────────────────────────────────────────────────────────────
describe('check-no-inline-cta — helper shapes', () => {
    test('extractColorsExpr / extractStyleExpr pull the balanced {…} expressions', () => {
        const { attrs } = readOpeningTag('<LinearGradient colors={colors.gradients.coral} style={{ padding: 16, x: { y: 1 } }}>', 0);
        expect(extractColorsExpr(attrs)).toBe('colors.gradients.coral');
        expect(extractStyleExpr(attrs)).toBe('{ padding: 16, x: { y: 1 } }');
    });

    test('extractColorsExpr returns null when there is no colors= attribute', () => {
        const { attrs } = readOpeningTag('<LinearGradient style={styles.x}>', 0);
        expect(extractColorsExpr(attrs)).toBe(null);
    });

    test('readOpeningTag flags a self-closing tag and finds the opening-tag end', () => {
        const code = '<LinearGradient colors={colors.gradients.coral} style={styles.x} />';
        const info = readOpeningTag(code, 0);
        expect(info.selfClosing).toBe(true);
        expect(code[info.tagEnd]).toBe('>');
    });

    test('readChildren returns the inner text and honours nested LinearGradient pairs', () => {
        const code = [
            '<LinearGradient colors={colors.gradients.coral} style={styles.outer}>',
            '  <LinearGradient colors={x} style={StyleSheet.absoluteFill} />',
            '  <Text>LABEL</Text>',
            '</LinearGradient>',
        ].join('\n');
        const open = readOpeningTag(code, 0);
        const kids = readChildren(code, open.tagEnd, open.selfClosing);
        expect(kids).toContain('<Text>LABEL</Text>');
        expect(hasTextChild(kids)).toBe(true);
    });

    test('firstArrayMember returns the first top-level member of an array style', () => {
        expect(firstArrayMember('[StyleSheet.absoluteFill, { padding: 8 }]')).toBe('StyleSheet.absoluteFill');
        expect(firstArrayMember('[styles.badge, shadows.glow(c)]')).toBe('styles.badge');
    });

    test('CORAL_TOKEN_RE matches coral / coralCta but not coralFaint', () => {
        expect(CORAL_TOKEN_RE.test('colors.gradients.coral')).toBe(true);
        expect(CORAL_TOKEN_RE.test('colors.gradients.coralCta')).toBe(true);
        expect(CORAL_TOKEN_RE.test('colors.gradients.coralFaint')).toBe(false);
        expect(CORAL_TOKEN_RE.test('colors.gradients.cyan')).toBe(false);
    });

    test('NON_CTA_STYLE_NAME_RE matches fab/ring/badge/avatar names', () => {
        expect(NON_CTA_STYLE_NAME_RE.test('styles.fabGradient')).toBe(true);
        expect(NON_CTA_STYLE_NAME_RE.test('styles.avatarRing')).toBe(true);
        expect(NON_CTA_STYLE_NAME_RE.test('styles.badge')).toBe(true);
        expect(NON_CTA_STYLE_NAME_RE.test('styles.resultRing')).toBe(true);
        expect(NON_CTA_STYLE_NAME_RE.test('styles.saveBtn')).toBe(false);
    });

    test('stripCommentsAndStrings preserves length and newline positions exactly', () => {
        const src = [
            'const a = 1; // <LinearGradient colors={colors.gradients.coral}>',
            'const b = "<LinearGradient>";',
            'const c = 2;',
        ].join('\n');
        const out = stripCommentsAndStrings(src);
        expect(out.length).toBe(src.length);
        expect(out.split('\n').length).toBe(src.split('\n').length);
        expect(out).toContain('const a = 1;');
        expect(out).toContain('const c = 2;');
        // The <LinearGradient text inside the comment and the string is gone.
        expect(out.includes('LinearGradient')).toBe(false);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Gate wiring — the new step is present and HARD (no `file:` guard), so the
// gate-steps meta self-test stays green.
// ─────────────────────────────────────────────────────────────────────────────
describe('check-no-inline-cta — gate.js wiring', () => {
    const steps = buildSteps();

    test('buildSteps() includes a `check-no-inline-cta` step', () => {
        const names = steps.map((s) => s.name);
        expect(names).toContain('check-no-inline-cta');
    });

    test('the check-no-inline-cta step is HARD (no `file:` existsSync guard)', () => {
        const step = steps.find((s) => s.name === 'check-no-inline-cta');
        expect(step).toBeDefined();
        // A `file:` guard would let runStep SKIP the present script — silently
        // downgrading the CI guarantee, and (because the script is on disk) it
        // would turn the gate-steps meta self-test RED. Pin it here directly.
        expect(step.file).toBeUndefined();
    });

    test('the check-no-inline-cta step runs `node scripts/check-no-inline-cta.js`', () => {
        const step = steps.find((s) => s.name === 'check-no-inline-cta');
        expect(Array.isArray(step.args)).toBe(true);
        const last = step.args[step.args.length - 1];
        expect(last.split(/[\\/]/).join('/')).toMatch(/scripts\/check-no-inline-cta\.js$/);
    });

    test('the check-no-inline-cta step is placed immediately AFTER check-no-inline-glass', () => {
        const names = steps.map((s) => s.name);
        const glassIdx = names.indexOf('check-no-inline-glass');
        const ctaIdx = names.indexOf('check-no-inline-cta');
        const harnessIdx = names.indexOf('harness-self-tests');
        expect(glassIdx).toBeGreaterThanOrEqual(0);
        expect(ctaIdx).toBe(glassIdx + 1);
        // …and still in the lint tier, before the harness self-tests / typecheck.
        expect(ctaIdx).toBeLessThan(harnessIdx);
    });
});
