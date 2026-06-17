/**
 * Unit test — scripts/check-no-inline-glass.js contract.
 *
 * The guard (scripts/check-no-inline-glass.js) enforces one contract over the
 * mobile app-screen tree (clients/mobile/app):
 *
 *   NO INLINE GLASS CARD — no app screen renders a direct <SafeBlurView> as a
 *   CARD surface outside the sanctioned GlassCard primitive
 *   (src/components/ui/GlassCard.tsx). A <SafeBlurView> whose `style=` is a CARD
 *   signature — a NAMED card style (`style={styles.card}` / `styles.profileCard`
 *   / `styles.zoneTable`) or an INLINE OBJECT carrying card layout
 *   (a padding / flex / borderRadius key) — is the duplicated inline-glass drift
 *   and is flagged. The SAFE shapes that must NEVER be flagged are the NON-card overlay
 *   fills: `style={StyleSheet.absoluteFill}`, `style={StyleSheet.absoluteFillObject}`,
 *   and an array `style={[StyleSheet.absoluteFill…, …]}` anchored by one of
 *   those (the tab-bar blur in (tabs)/_layout.tsx and the full-bleed overlays in
 *   training/workout.tsx).
 *
 * This suite locks the detector in on BOTH directions. If anyone narrows it so a
 * real card-shaped <SafeBlurView> slips past — or widens it so it false-positives
 * on an absoluteFill overlay or on a <SafeBlurView mentioned in a comment/string
 * — these assertions go red BEFORE the change reaches CI.
 *
 * It also asserts the gate wiring: scripts/gate.js's buildSteps() includes the
 * new `check-no-inline-glass` step as a HARD step (NO `file:` existsSync guard),
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
 * Run from repo root: `npx jest scripts/__tests__/check-no-inline-glass.test.js`
 */

'use strict';

const path = require('path');

const { __test } = require(path.resolve(__dirname, '..', 'check-no-inline-glass.js'));
const {
    findCardSafeBlurViews,
    fileHasInlineGlassCard,
    isCardStyle,
    isOverlayFill,
    extractStyleExpr,
    readOpeningTagAttrs,
    firstArrayMember,
    stripCommentsAndStrings,
    NAMED_STYLE_RE,
} = __test;

const { __test: gateTest } = require(path.resolve(__dirname, '..', 'gate.js'));
const { buildSteps } = gateTest;

// ─────────────────────────────────────────────────────────────────────────────
// CARD-shaped <SafeBlurView> surfaces ARE flagged (true positives).
// ─────────────────────────────────────────────────────────────────────────────
describe('check-no-inline-glass — findCardSafeBlurViews: inline-glass card surfaces (true positives)', () => {
    test('a NAMED card style `style={styles.profileCard}` IS flagged (with its line number)', () => {
        const src = [
            'function ProfileHeader({ children }) {',
            '  return (',
            '    <SafeBlurView tint="dark" intensity={40} style={styles.profileCard}>',
            '      {children}',
            '    </SafeBlurView>',
            '  );',
            '}',
        ].join('\n');
        // The opening tag is on line 3.
        expect(findCardSafeBlurViews(src)).toEqual([3]);
        expect(fileHasInlineGlassCard(src)).toBe(true);
    });

    test('a bare `style={styles.card}` named style IS flagged', () => {
        const src = '<SafeBlurView tint="dark" style={styles.card}>x</SafeBlurView>';
        expect(fileHasInlineGlassCard(src)).toBe(true);
        expect(isCardStyle('styles.card')).toBe(true);
    });

    test('a `style={styles.zoneTable}` named style IS flagged', () => {
        const src = '<SafeBlurView intensity={40} style={styles.zoneTable}>x</SafeBlurView>';
        expect(fileHasInlineGlassCard(src)).toBe(true);
    });

    test('an INLINE OBJECT carrying card layout (padding + borderRadius) IS flagged', () => {
        const src = '<SafeBlurView tint="dark" style={{ padding: 16, borderRadius: 24, borderWidth: 1 }}>x</SafeBlurView>';
        expect(fileHasInlineGlassCard(src)).toBe(true);
        expect(isCardStyle("{ padding: 16, borderRadius: 24, borderWidth: 1 }")).toBe(true);
    });

    test('an INLINE OBJECT carrying flex card layout IS flagged', () => {
        expect(isCardStyle('{ flex: 1, alignItems: "center" }')).toBe(true);
        expect(isCardStyle('{ flexDirection: "row", paddingHorizontal: 12 }')).toBe(true);
    });

    test('an ARRAY style NOT anchored by absoluteFill but carrying card layout IS flagged', () => {
        // First member is a named base, not an absoluteFill, so it is not an
        // overlay; the inline object member carries padding/flex card layout.
        const src = '<SafeBlurView style={[styles.base, { flex: 1, padding: 8 }]}>x</SafeBlurView>';
        expect(fileHasInlineGlassCard(src)).toBe(true);
    });

    test('a self-closing card <SafeBlurView … /> IS flagged', () => {
        const src = '<SafeBlurView tint="dark" style={styles.card} />';
        expect(fileHasInlineGlassCard(src)).toBe(true);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// NON-card overlay fills are NOT flagged (true negatives) — keeps the gate green
// on (tabs)/_layout.tsx and training/workout.tsx shapes.
// ─────────────────────────────────────────────────────────────────────────────
describe('check-no-inline-glass — findCardSafeBlurViews: overlay fills (true negatives)', () => {
    test('`style={StyleSheet.absoluteFill}` (the (tabs)/_layout.tsx tab-bar blur shape) is NOT flagged', () => {
        const src = [
            'tabBarBackground: () => (',
            '  <SafeBlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />',
            '),',
        ].join('\n');
        expect(findCardSafeBlurViews(src)).toEqual([]);
        expect(fileHasInlineGlassCard(src)).toBe(false);
        expect(isOverlayFill('StyleSheet.absoluteFill')).toBe(true);
    });

    test('`style={StyleSheet.absoluteFillObject}` is NOT flagged', () => {
        const src = '<SafeBlurView intensity={80} tint="dark" style={StyleSheet.absoluteFillObject} />';
        expect(fileHasInlineGlassCard(src)).toBe(false);
        expect(isOverlayFill('StyleSheet.absoluteFillObject')).toBe(true);
    });

    test('`style={[StyleSheet.absoluteFillObject, { justifyContent: ... }]}` (the workout countdown overlay shape) is NOT flagged', () => {
        // The literal training/workout.tsx:662 shape: absoluteFillObject base +
        // a centering object. The absoluteFill base makes it a full-bleed scrim,
        // not a card — even though the trailing object has layout-ish keys.
        const src = [
            '<SafeBlurView intensity={80} tint="dark" style={[StyleSheet.absoluteFillObject, { justifyContent: \'center\', alignItems: \'center\' }]}>',
            '  <Text>{n}</Text>',
            '</SafeBlurView>',
        ].join('\n');
        expect(findCardSafeBlurViews(src)).toEqual([]);
        expect(isOverlayFill("[StyleSheet.absoluteFillObject, { justifyContent: 'center', alignItems: 'center' }]")).toBe(true);
    });

    test('`style={[StyleSheet.absoluteFill, …]}` (array anchored by absoluteFill) is NOT flagged even with a padding member', () => {
        // Defensive: an absoluteFill-anchored array is an overlay regardless of
        // later members — the base fill dominates.
        const src = '<SafeBlurView style={[StyleSheet.absoluteFill, { padding: 8 }]}>x</SafeBlurView>';
        expect(fileHasInlineGlassCard(src)).toBe(false);
    });

    test('a <SafeBlurView> with NO style= attribute is NOT flagged', () => {
        const src = '<SafeBlurView tint="dark" intensity={40}>{children}</SafeBlurView>';
        expect(findCardSafeBlurViews(src)).toEqual([]);
    });

    test('a closing </SafeBlurView> tag is NOT matched as an opening tag', () => {
        const src = '<SafeBlurView style={StyleSheet.absoluteFill}>x</SafeBlurView>';
        // Exactly one opening tag (overlay → not flagged); the closing tag must
        // not be counted as a second <SafeBlurView.
        expect(findCardSafeBlurViews(src)).toEqual([]);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Comment / string false-match immunity — a <SafeBlurView mentioned in a comment
// or a string literal must NEVER trip the guard, while a real-code card tag still
// does. Locks the stripCommentsAndStrings tolerant-tokenizer pass.
// ─────────────────────────────────────────────────────────────────────────────
describe('check-no-inline-glass — comment/string false-match immunity', () => {
    test('a card-shaped <SafeBlurView in a // line comment is NOT flagged', () => {
        const src = [
            'import { GlassCard } from \'@/components/ui\';',
            '// legacy: <SafeBlurView style={styles.card}>…</SafeBlurView>',
            'return <GlassCard>{children}</GlassCard>;',
        ].join('\n');
        expect(findCardSafeBlurViews(src)).toEqual([]);
    });

    test('a card-shaped <SafeBlurView in a /* block comment */ is NOT flagged', () => {
        const src = [
            '/*',
            ' * Historically this screen did',
            ' *   <SafeBlurView style={styles.profileCard}>…</SafeBlurView>',
            ' * It now uses GlassCard below.',
            ' */',
            'return <GlassCard>{children}</GlassCard>;',
        ].join('\n');
        expect(findCardSafeBlurViews(src)).toEqual([]);
    });

    test('the (tabs)/profile.tsx doc-comment mention `primitive (SafeBlurView), …` is NOT flagged', () => {
        const src = [
            '/**',
            ' * Profile header. Migrated off the inline glass-card',
            ' * primitive (SafeBlurView), the primary CTA uses CtaButton.',
            ' */',
            'export function Profile() { return null; }',
        ].join('\n');
        expect(findCardSafeBlurViews(src)).toEqual([]);
    });

    test('a card-shaped <SafeBlurView inside a string literal is NOT flagged', () => {
        const src = 'const doc = "<SafeBlurView style={styles.card}>x</SafeBlurView>";';
        expect(findCardSafeBlurViews(src)).toEqual([]);
    });

    test('a real-code card <SafeBlurView alongside a comment-mentioned one IS still flagged (only the real one)', () => {
        const src = [
            '// note: <SafeBlurView style={styles.card}> is forbidden',
            '<SafeBlurView style={styles.profileCard}>x</SafeBlurView>',
        ].join('\n');
        // The comment tag (line 1) is stripped; the real tag (line 2) is flagged.
        expect(findCardSafeBlurViews(src)).toEqual([2]);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Helper-level shape locks.
// ─────────────────────────────────────────────────────────────────────────────
describe('check-no-inline-glass — helper shapes', () => {
    test('extractStyleExpr pulls the balanced style={…} expression (nested braces honoured)', () => {
        const attrs = readOpeningTagAttrs('<SafeBlurView tint="dark" style={{ padding: 16, x: { y: 1 } }}>', 0);
        expect(extractStyleExpr(attrs)).toBe('{ padding: 16, x: { y: 1 } }');
    });

    test('extractStyleExpr returns null when there is no style= attribute', () => {
        const attrs = readOpeningTagAttrs('<SafeBlurView tint="dark" intensity={40}>', 0);
        expect(extractStyleExpr(attrs)).toBe(null);
    });

    test('firstArrayMember returns the first top-level member of an array style', () => {
        expect(firstArrayMember('[StyleSheet.absoluteFill, { padding: 8 }]')).toBe('StyleSheet.absoluteFill');
        expect(firstArrayMember('[styles.base, { flex: 1 }]')).toBe('styles.base');
        expect(firstArrayMember('[StyleSheet.absoluteFillObject]')).toBe('StyleSheet.absoluteFillObject');
    });

    test('NAMED_STYLE_RE matches a styles.<name> member but not StyleSheet.absoluteFill', () => {
        expect(NAMED_STYLE_RE.test('styles.card')).toBe(true);
        expect(NAMED_STYLE_RE.test('styles.profileCard')).toBe(true);
        expect(NAMED_STYLE_RE.test('StyleSheet.absoluteFill')).toBe(false);
        // A property chain deeper than one level is not a bare named style ref.
        expect(NAMED_STYLE_RE.test('styles.card.inner')).toBe(false);
    });

    test('stripCommentsAndStrings preserves length and newline positions exactly', () => {
        const src = [
            'const a = 1; // <SafeBlurView style={styles.card}>',
            'const b = "<SafeBlurView>";',
            'const c = 2;',
        ].join('\n');
        const out = stripCommentsAndStrings(src);
        expect(out.length).toBe(src.length);
        expect(out.split('\n').length).toBe(src.split('\n').length);
        expect(out).toContain('const a = 1;');
        expect(out).toContain('const c = 2;');
        // The <SafeBlurView text inside the comment and the string is gone.
        expect(out.includes('SafeBlurView')).toBe(false);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Gate wiring — the new step is present and HARD (no `file:` guard), so the
// gate-steps meta self-test stays green.
// ─────────────────────────────────────────────────────────────────────────────
describe('check-no-inline-glass — gate.js wiring', () => {
    const steps = buildSteps();

    test('buildSteps() includes a `check-no-inline-glass` step', () => {
        const names = steps.map((s) => s.name);
        expect(names).toContain('check-no-inline-glass');
    });

    test('the check-no-inline-glass step is HARD (no `file:` existsSync guard)', () => {
        const step = steps.find((s) => s.name === 'check-no-inline-glass');
        expect(step).toBeDefined();
        // A `file:` guard would let runStep SKIP the present script — silently
        // downgrading the CI guarantee. The gate-steps meta test enforces this
        // too; we pin it here directly against this guard's own step.
        expect(step.file).toBeUndefined();
    });

    test('the check-no-inline-glass step runs `node scripts/check-no-inline-glass.js`', () => {
        const step = steps.find((s) => s.name === 'check-no-inline-glass');
        expect(Array.isArray(step.args)).toBe(true);
        const last = step.args[step.args.length - 1];
        expect(last.split(/[\\/]/).join('/')).toMatch(/scripts\/check-no-inline-glass\.js$/);
    });

    test('the check-no-inline-glass step is placed among the lint-tier guards (after check-shared-logger)', () => {
        const names = steps.map((s) => s.name);
        const sharedLoggerIdx = names.indexOf('check-shared-logger');
        const inlineGlassIdx = names.indexOf('check-no-inline-glass');
        const harnessIdx = names.indexOf('harness-self-tests');
        expect(sharedLoggerIdx).toBeGreaterThanOrEqual(0);
        expect(inlineGlassIdx).toBe(sharedLoggerIdx + 1);
        // …and still in the lint tier, before the harness self-tests / typecheck.
        expect(inlineGlassIdx).toBeLessThan(harnessIdx);
    });
});
