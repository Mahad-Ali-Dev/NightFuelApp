#!/usr/bin/env node
/**
 * NightFuel — Aurora-adoption ANTI-REGRESSION guard (HARD / blocking).
 *
 * This is the enforcing sibling of scripts/check-aurora-coverage.js. That script
 * is purely INFORMATIONAL — it prints adoption counts/percentages and ALWAYS
 * exits 0. This one is a real GATE step: it asserts the live Aurora-primitive
 * adoption never silently REGRESSES below a committed floor, and exits 1 when it
 * does. The two are deliberately split so the informational metric can keep
 * exiting 0 (and stay out of the hard buildSteps() array) while the floor below
 * it is enforced HARD — wired UNGUARDED into scripts/gate.js buildSteps() (no
 * `file:` field), so a missing or broken guard fails the gate rather than
 * degrading to a silent SKIP.
 *
 *   THE RATCHET ──────────────────────────────────────────────────────────────
 *     scripts/aurora-coverage-baseline.json commits the GlassCard / CtaButton /
 *     StatusBar counts (+ a total) of the current tree. On every gate we recompute
 *     the live counts (reusing check-aurora-coverage.js's collectScreens() +
 *     computeCoverage() — we do NOT re-implement the walker or the detectors) and
 *     FAIL only when a tracked count has dropped BELOW its baseline. Adoption may
 *     rise freely (a higher live count is fine and is the goal); it may never
 *     silently fall. When intentional UI work raises adoption, re-run
 *     check-aurora-coverage.js and bump the baseline JSON in the same change.
 *
 *   WHAT IS ENFORCED — GlassCard + StatusBar ONLY ────────────────────────────
 *     We threshold exactly two primitives:
 *       • GlassCard — the dark-glass card surface should not vanish from screens
 *         that adopted it.
 *       • StatusBar — the expo-status-bar light bar at the screen root likewise.
 *     CtaButton is reported but NEVER thresholded — see below.
 *
 *   WHY CtaButton IS INFORMATIONAL (the retired chase) ───────────────────────
 *     The inline-coral-CTA → CtaButton migration is COMPLETE; the hard contract
 *     that no screen reintroduces an inline coral-CTA gradient is already owned by
 *     scripts/check-no-inline-cta.js. A CtaButton ADOPTION PERCENTAGE, by
 *     contrast, is NOT a goal: many hubs, feeds, list and detail screens
 *     legitimately have NO primary coral call-to-action, and pushing a CtaButton
 *     number upward manufactures bad-UX CTAs where the design wants none. So this
 *     guard prints the live CtaButton count for the record and NEVER fails on it
 *     (a below-baseline CtaButton count is fine — that chase is retired).
 *
 * Dependency-free on purpose (Node built-in `fs` + `path` + the sibling script's
 * already-exported pure helpers). Reads ONLY local files (the baseline JSON + the
 * screens collectScreens() reads), writes nothing, no network. Mirrors the
 * sibling guards' shape (a printed banner, `module.exports.__test`, the
 * require.main === module guard).
 *
 * Usage:   node scripts/check-aurora-coverage-baseline.js
 * Exit:    0 = live GlassCard & StatusBar counts are at/above baseline (PASS);
 *          1 = at least one of them regressed below baseline (prints which), OR
 *              the baseline JSON is missing/malformed (fail-closed).
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Reuse the informational sibling's pure helpers — the screen walker
// (collectScreens) and the coverage summarizer (computeCoverage). We deliberately
// do NOT duplicate the tree walk or the per-screen detectors: there must be ONE
// definition of "what counts", shared by the metric and its floor.
const coverage = require('./check-aurora-coverage');
const { collectScreens, computeCoverage } = coverage.__test;

// The committed baseline lives alongside this guard in scripts/.
const BASELINE_PATH = path.join(__dirname, 'aurora-coverage-baseline.json');

// The primitives this guard ENFORCES a floor on. CtaButton is intentionally
// absent — it is reported but never thresholded (see the header note on the
// retired CtaButton chase).
const ENFORCED_KEYS = ['glassCard', 'statusBar'];

/**
 * Coerce a baseline field to a finite, non-negative integer count. A baseline
 * entry may be a bare number (e.g. `"glassCard": 40`). Anything that is not a
 * finite number ≥ 0 is rejected (returns null) so a malformed baseline fails
 * closed rather than being read as 0 (which would make the floor vacuous).
 */
function baselineCount(value) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        return null;
    }
    return value;
}

/**
 * PURE evaluator — compare a live coverage summary against a committed baseline
 * and decide PASS/FAIL. No IO, no process.exit, so the unit test can drive every
 * branch with in-memory fixtures.
 *
 *   @param {object} current  — a computeCoverage() summary:
 *        { total, glassCard:{count,percent}, ctaButton:{…}, statusBar:{count,…} }
 *   @param {object} baseline — the parsed baseline JSON:
 *        { glassCard:Number, ctaButton:Number, statusBar:Number, total?:Number }
 *
 * Returns { ok:boolean, failures:Array<{ key, baseline, current }> }. A failure is
 * recorded ONLY for an ENFORCED_KEYS primitive whose live count is strictly less
 * than its baseline, OR whose baseline value is missing/malformed (fail-closed —
 * we cannot prove non-regression without a valid floor). CtaButton is never
 * inspected here, so a below-baseline CtaButton count NEVER produces a failure.
 */
function evaluate(current, baseline) {
    const failures = [];
    const cur = current && typeof current === 'object' ? current : {};
    const base = baseline && typeof baseline === 'object' ? baseline : {};

    for (const key of ENFORCED_KEYS) {
        const floor = baselineCount(base[key]);
        const liveMetric = cur[key];
        const live = liveMetric && typeof liveMetric.count === 'number' ? liveMetric.count : 0;

        if (floor === null) {
            // Missing/malformed baseline for an enforced key → fail closed. We
            // record the current count for the diagnostic but mark baseline NaN
            // so the banner makes the cause obvious.
            failures.push({ key, baseline: NaN, current: live });
            continue;
        }
        if (live < floor) {
            failures.push({ key, baseline: floor, current: live });
        }
    }

    return { ok: failures.length === 0, failures };
}

/**
 * Read + parse the committed baseline JSON. Returns the parsed object, or null
 * when the file is missing or not valid JSON (the caller fails closed on null).
 */
function readBaseline() {
    let raw;
    try {
        raw = fs.readFileSync(BASELINE_PATH, 'utf8');
    } catch (err) {
        return null;
    }
    try {
        return JSON.parse(raw);
    } catch (err) {
        return null;
    }
}

/**
 * Render the result as printable lines (returned, not printed, so the unit test
 * can assert the exact text). Shows the enforced GlassCard/StatusBar comparison,
 * the informational CtaButton count (never a threshold), and a clear PASS/FAIL
 * banner.
 */
function formatReport(current, baseline, result) {
    const cur = current && typeof current === 'object' ? current : {};
    const base = baseline && typeof baseline === 'object' ? baseline : {};
    const liveCount = (key) => (cur[key] && typeof cur[key].count === 'number' ? cur[key].count : 0);
    const fmtBase = (key) => {
        const b = baselineCount(base[key]);
        return b === null ? 'MISSING' : String(b);
    };

    const lines = [];
    lines.push('═══════════════════════════════════════════════════════════════');
    lines.push(' Aurora coverage BASELINE guard — anti-regression (HARD)');
    lines.push('═══════════════════════════════════════════════════════════════');
    lines.push(`Total screens (live): ${typeof cur.total === 'number' ? cur.total : 0}`);
    lines.push('Enforced floors (live ≥ baseline):');
    lines.push(`  GlassCard: ${liveCount('glassCard')} (baseline ${fmtBase('glassCard')})`);
    lines.push(`  StatusBar: ${liveCount('statusBar')} (baseline ${fmtBase('statusBar')})`);
    lines.push('Informational (NOT enforced — CtaButton chase is retired):');
    lines.push(`  CtaButton: ${liveCount('ctaButton')} (baseline ${fmtBase('ctaButton')}, not thresholded)`);
    lines.push('───────────────────────────────────────────────────────────────');
    if (result.ok) {
        lines.push('PASS — GlassCard & StatusBar adoption is at or above baseline.');
    } else {
        lines.push('FAIL — Aurora adoption regressed below baseline:');
        for (const f of result.failures) {
            if (Number.isNaN(f.baseline)) {
                lines.push(`  ${f.key}: baseline missing/malformed in aurora-coverage-baseline.json (fail-closed)`);
            } else {
                lines.push(`  ${f.key}: live ${f.current} < baseline ${f.baseline}`);
            }
        }
        lines.push('If this drop is intentional, re-run `node scripts/check-aurora-coverage.js`');
        lines.push('and update scripts/aurora-coverage-baseline.json in the same change.');
    }
    lines.push('═══════════════════════════════════════════════════════════════');
    return lines;
}

function main() {
    const baseline = readBaseline();
    const screens = collectScreens();
    const current = computeCoverage(screens);

    if (baseline === null) {
        // No readable baseline → fail closed. We can't prove non-regression
        // without a valid floor, and this guard is HARD.
        console.error(
            'check-aurora-coverage-baseline: scripts/aurora-coverage-baseline.json is missing or not valid JSON — cannot enforce the anti-regression floor.',
        );
        process.exit(1);
    }

    const result = evaluate(current, baseline);
    const out = result.ok ? console.log : console.error;
    for (const line of formatReport(current, baseline, result)) {
        out(line);
    }
    process.exit(result.ok ? 0 : 1);
}

// Run main() only when invoked as a script — the unit test imports this file for
// the pure evaluate()/formatReport() helpers without the side-effect of an exit.
if (require.main === module) {
    main();
}

// Expose the pure helpers for the unit test in scripts/__tests__/.
module.exports.__test = {
    ENFORCED_KEYS,
    BASELINE_PATH,
    baselineCount,
    evaluate,
    readBaseline,
    formatReport,
};
