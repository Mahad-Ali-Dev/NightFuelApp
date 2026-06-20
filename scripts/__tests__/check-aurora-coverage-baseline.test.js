/**
 * Unit test — scripts/check-aurora-coverage-baseline.js contract.
 *
 * check-aurora-coverage-baseline.js is the HARD anti-regression sibling of the
 * INFORMATIONAL scripts/check-aurora-coverage.js. It reuses that script's
 * collectScreens()+computeCoverage() helpers to count live Aurora-primitive
 * adoption over clients/mobile/app and FAILS (process.exit(1)) only when the live
 * GlassCard OR StatusBar count drops BELOW scripts/aurora-coverage-baseline.json.
 * CtaButton is reported but NEVER thresholded — the inline-coral-CTA migration is
 * complete and a CtaButton adoption percentage is not a goal, so chasing it is
 * retired.
 *
 * This suite locks the pure evaluator evaluate(current, baseline):
 *   (1) it FAILS when a simulated GlassCard count is below baseline;
 *   (2) it FAILS when a simulated StatusBar count is below baseline;
 *   (3) it PASSES when both are AT baseline, and when both are ABOVE baseline;
 *   (4) CtaButton has NO threshold — a below-baseline CtaButton count still PASSES;
 *   (5) a missing/malformed enforced-key baseline fails CLOSED;
 * plus the committed baseline JSON is self-consistent and the gate wiring places
 * the guard as a HARD step in buildSteps().
 *
 * Plain JS (not TS) on purpose: the scripts under test are plain JS too, so the
 * test runs without the babel/ts-jest transform stack — under the gate's
 * harness-self-test jest pass (`--transform '{}'`). We import the pure helpers via
 * each script's `module.exports.__test` back-door; importing the modules is safe
 * because their main()/CLI only runs under the require.main === module guard.
 *
 * Run from repo root:
 *   `npx jest scripts/__tests__/check-aurora-coverage-baseline.test.js`
 */

'use strict';

const fs = require('fs');
const path = require('path');

const BASELINE_GUARD_PATH = path.resolve(__dirname, '..', 'check-aurora-coverage-baseline.js');
const { __test } = require(BASELINE_GUARD_PATH);
const { evaluate, formatReport, baselineCount, ENFORCED_KEYS, BASELINE_PATH } = __test;

const { __test: gateTest } = require(path.resolve(__dirname, '..', 'gate.js'));
const { buildSteps, buildReportingSteps } = gateTest;

// A small helper to build a computeCoverage()-shaped summary from bare counts so
// the fixtures read clearly. (percent is irrelevant to the floor; we set it to a
// placeholder — evaluate() only ever reads `.count`.)
function summary({ glassCard, ctaButton, statusBar, total }) {
    return {
        total: total == null ? 0 : total,
        glassCard: { count: glassCard, percent: 0 },
        ctaButton: { count: ctaButton, percent: 0 },
        statusBar: { count: statusBar, percent: 0 },
    };
}

// A representative baseline used across the simulated-count tests.
const BASE = { glassCard: 40, ctaButton: 33, statusBar: 68, total: 75 };

// ─────────────────────────────────────────────────────────────────────────────
// evaluate() — GlassCard floor.
// ─────────────────────────────────────────────────────────────────────────────
describe('check-aurora-coverage-baseline — evaluate(): GlassCard floor', () => {
    test('FAILS when the live GlassCard count is below baseline', () => {
        const res = evaluate(summary({ glassCard: 39, ctaButton: 33, statusBar: 68, total: 75 }), BASE);
        expect(res.ok).toBe(false);
        const gc = res.failures.find((f) => f.key === 'glassCard');
        expect(gc).toBeDefined();
        expect(gc).toEqual({ key: 'glassCard', baseline: 40, current: 39 });
        // StatusBar (at baseline) is NOT a failure.
        expect(res.failures.some((f) => f.key === 'statusBar')).toBe(false);
    });

    test('PASSES when the live GlassCard count is exactly at baseline', () => {
        const res = evaluate(summary({ glassCard: 40, ctaButton: 33, statusBar: 68, total: 75 }), BASE);
        expect(res.ok).toBe(true);
        expect(res.failures).toEqual([]);
    });

    test('PASSES when the live GlassCard count is above baseline', () => {
        const res = evaluate(summary({ glassCard: 41, ctaButton: 33, statusBar: 68, total: 76 }), BASE);
        expect(res.ok).toBe(true);
        expect(res.failures).toEqual([]);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// evaluate() — StatusBar floor.
// ─────────────────────────────────────────────────────────────────────────────
describe('check-aurora-coverage-baseline — evaluate(): StatusBar floor', () => {
    test('FAILS when the live StatusBar count is below baseline', () => {
        const res = evaluate(summary({ glassCard: 40, ctaButton: 33, statusBar: 67, total: 75 }), BASE);
        expect(res.ok).toBe(false);
        const sb = res.failures.find((f) => f.key === 'statusBar');
        expect(sb).toBeDefined();
        expect(sb).toEqual({ key: 'statusBar', baseline: 68, current: 67 });
        expect(res.failures.some((f) => f.key === 'glassCard')).toBe(false);
    });

    test('PASSES at baseline and above', () => {
        expect(evaluate(summary({ glassCard: 40, ctaButton: 33, statusBar: 68, total: 75 }), BASE).ok).toBe(true);
        expect(evaluate(summary({ glassCard: 40, ctaButton: 33, statusBar: 70, total: 75 }), BASE).ok).toBe(true);
    });

    test('reports BOTH GlassCard and StatusBar when both regress', () => {
        const res = evaluate(summary({ glassCard: 10, ctaButton: 33, statusBar: 5, total: 75 }), BASE);
        expect(res.ok).toBe(false);
        const keys = res.failures.map((f) => f.key).sort();
        expect(keys).toEqual(['glassCard', 'statusBar']);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// evaluate() — CtaButton is INFORMATIONAL (the retired chase): never thresholded.
// ─────────────────────────────────────────────────────────────────────────────
describe('check-aurora-coverage-baseline — evaluate(): CtaButton is never a threshold', () => {
    test('a below-baseline CtaButton count still PASSES (no CtaButton failure)', () => {
        // CtaButton crashes to 0 while GlassCard/StatusBar hold — must PASS.
        const res = evaluate(summary({ glassCard: 40, ctaButton: 0, statusBar: 68, total: 75 }), BASE);
        expect(res.ok).toBe(true);
        expect(res.failures).toEqual([]);
        // And CtaButton is not one of the enforced keys at all.
        expect(ENFORCED_KEYS).not.toContain('ctaButton');
        expect(ENFORCED_KEYS.slice().sort()).toEqual(['glassCard', 'statusBar']);
    });

    test('CtaButton dropping does NOT mask a real GlassCard regression', () => {
        const res = evaluate(summary({ glassCard: 39, ctaButton: 0, statusBar: 68, total: 75 }), BASE);
        expect(res.ok).toBe(false);
        // Exactly one failure, and it is GlassCard — never CtaButton.
        expect(res.failures).toHaveLength(1);
        expect(res.failures[0].key).toBe('glassCard');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// evaluate() — fail-closed on a missing / malformed enforced-key baseline.
// ─────────────────────────────────────────────────────────────────────────────
describe('check-aurora-coverage-baseline — evaluate(): fail-closed on bad baseline', () => {
    test('a missing enforced-key baseline FAILS closed (cannot prove non-regression)', () => {
        const res = evaluate(summary({ glassCard: 999, ctaButton: 999, statusBar: 999, total: 999 }), { ctaButton: 33 });
        expect(res.ok).toBe(false);
        // Both enforced keys are missing from this baseline → both fail closed.
        const keys = res.failures.map((f) => f.key).sort();
        expect(keys).toEqual(['glassCard', 'statusBar']);
        for (const f of res.failures) {
            expect(Number.isNaN(f.baseline)).toBe(true);
        }
    });

    test('a non-numeric / negative baseline value is rejected by baselineCount', () => {
        expect(baselineCount(40)).toBe(40);
        expect(baselineCount(0)).toBe(0);
        expect(baselineCount('40')).toBeNull();
        expect(baselineCount(-1)).toBeNull();
        expect(baselineCount(NaN)).toBeNull();
        expect(baselineCount(undefined)).toBeNull();
        expect(baselineCount(null)).toBeNull();
    });

    test('a missing live metric counts as 0 (and so fails an enforced floor)', () => {
        const res = evaluate({ total: 0 }, BASE);
        expect(res.ok).toBe(false);
        // glassCard live → 0 < 40, statusBar live → 0 < 68.
        const gc = res.failures.find((f) => f.key === 'glassCard');
        expect(gc).toEqual({ key: 'glassCard', baseline: 40, current: 0 });
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// formatReport — banner reflects PASS / FAIL and labels CtaButton as not enforced.
// ─────────────────────────────────────────────────────────────────────────────
describe('check-aurora-coverage-baseline — formatReport', () => {
    test('PASS banner names the enforced primitives and marks CtaButton informational', () => {
        const cur = summary({ glassCard: 40, ctaButton: 33, statusBar: 68, total: 75 });
        const res = evaluate(cur, BASE);
        const text = formatReport(cur, BASE, res).join('\n');
        expect(text).toMatch(/PASS — GlassCard & StatusBar adoption is at or above baseline/);
        expect(text).toContain('GlassCard: 40 (baseline 40)');
        expect(text).toContain('StatusBar: 68 (baseline 68)');
        expect(text).toMatch(/CtaButton: 33 .*not thresholded/);
    });

    test('FAIL banner lists the regressed primitive with its live and baseline counts', () => {
        const cur = summary({ glassCard: 39, ctaButton: 33, statusBar: 68, total: 75 });
        const res = evaluate(cur, BASE);
        const text = formatReport(cur, BASE, res).join('\n');
        expect(text).toMatch(/FAIL — Aurora adoption regressed below baseline/);
        expect(text).toContain('glassCard: live 39 < baseline 40');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// The committed baseline JSON is well-formed and self-consistent, and the guard
// PASSES against itself (baseline compared to a summary built from the SAME
// counts — the unchanged-tree PASS property, without reading the live FS tree).
// ─────────────────────────────────────────────────────────────────────────────
describe('check-aurora-coverage-baseline — committed baseline JSON', () => {
    const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));

    test('has finite, non-negative integer counts for every tracked primitive', () => {
        for (const key of ['glassCard', 'ctaButton', 'statusBar', 'total']) {
            expect(typeof baseline[key]).toBe('number');
            expect(Number.isInteger(baseline[key])).toBe(true);
            expect(baseline[key]).toBeGreaterThanOrEqual(0);
        }
    });

    test('the enforced floors are present and numeric (so the guard is never vacuous)', () => {
        for (const key of ENFORCED_KEYS) {
            expect(baselineCount(baseline[key])).not.toBeNull();
        }
    });

    test('evaluate() PASSES when the live counts equal the committed baseline (unchanged-tree property)', () => {
        const cur = summary({
            glassCard: baseline.glassCard,
            ctaButton: baseline.ctaButton,
            statusBar: baseline.statusBar,
            total: baseline.total,
        });
        expect(evaluate(cur, baseline).ok).toBe(true);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Gate wiring — the baseline guard is a HARD step in buildSteps() with NO file:
// guard, and is NOT one of the informational reporting steps.
// ─────────────────────────────────────────────────────────────────────────────
describe('check-aurora-coverage-baseline — gate.js wiring (HARD step, no file: guard)', () => {
    test('buildSteps() includes check-aurora-coverage-baseline running the guard script, with no file: guard', () => {
        const step = buildSteps().find((s) => s.name === 'check-aurora-coverage-baseline');
        expect(step).toBeDefined();
        expect(step.file).toBeUndefined();
        const last = step.args[step.args.length - 1];
        expect(last.split(/[\\/]/).join('/')).toMatch(/scripts\/check-aurora-coverage-baseline\.js$/);
    });

    test('the baseline guard is NOT among the informational reporting steps', () => {
        const reportNames = buildReportingSteps().map((s) => s.name);
        expect(reportNames).not.toContain('check-aurora-coverage-baseline');
    });
});
