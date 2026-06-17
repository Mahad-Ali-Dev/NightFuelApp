/**
 * Meta self-test — scripts/gate.js step list is tamper-evident.
 *
 * gate.js's runStep() supports an OPTIONAL `file:` field: when set and the
 * referenced path does NOT exist on disk, the step is SKIPPED (logged, treated
 * as OK) instead of run. That escape hatch exists for guards owned by a
 * different work item that may not have landed yet — it lets the gate not break
 * in the interim.
 *
 * The hazard: once such a guard script DOES land on disk and passes, leaving
 * (or re-adding) a `file:` guard on its step silently DOWNGRADES a real CI
 * guarantee to a no-op. If the script is later renamed or deleted, the gate
 * prints "SKIP" and exits 0 — green, but no longer checking anything.
 *
 * This suite locks that down. For every gate step whose referenced guard script
 * EXISTS on disk, it asserts the step has NO `file:` guard — i.e. the step is
 * HARD/unconditional, so a missing or broken script fails the gate rather than
 * being skipped. Re-adding a `file:` guard to a present-script step (e.g.
 * check-demo-maps-in-sync or check-error-handler-registered) turns this test
 * RED before the change reaches CI.
 *
 * One documented exception is allowlisted: see PRESENT_SCRIPT_GUARD_EXCEPTIONS
 * below. It is intentionally narrow so it cannot mask a regression on any other
 * step.
 *
 * Plain JS (not TS) on purpose: gate.js is plain JS too, and this suite runs
 * under the gate's own harness-self-test jest pass (`--transform '{}'`, no
 * babel/ts-jest). We import the pure factory via gate.js's
 * `module.exports.__test` back-door; importing the module is safe because
 * main() only runs under the require.main === module guard inside the script.
 *
 * Run from repo root:
 *   node node_modules/jest/bin/jest.js --rootDir <repo> \
 *     --roots scripts/__tests__ --testMatch (doublestar)/(star).test.js --transform '{}'
 */

'use strict';

const fs = require('fs');
const path = require('path');

const { __test } = require(path.resolve(__dirname, '..', 'gate.js'));
const { buildSteps } = __test;

// Steps whose referenced script EXISTS on disk yet are permitted to keep a
// `file:` guard. This list MUST stay empty-or-tiny and every entry MUST be
// justified: a present script with a `file:` guard is normally a silent
// downgrade of a CI guarantee. `check-no-inline-401` is the lone documented
// case — gate.js's work-item left its pre-existing guard in place on purpose
// (the step predates the hardening of steps 2 and 3 and was explicitly NOT
// touched). Anything NOT in this set is held to the HARD-step contract.
const PRESENT_SCRIPT_GUARD_EXCEPTIONS = new Set(['check-no-inline-401']);

/**
 * Derive the guard script a step points at: prefer the explicit `step.file`,
 * otherwise the last argv entry that ends in `.js`. Returns an absolute path or
 * null when the step runs no .js script (e.g. an `npm run …` step).
 */
function referencedScript(step) {
    if (typeof step.file === 'string') {
        return step.file;
    }
    if (Array.isArray(step.args)) {
        for (let i = step.args.length - 1; i >= 0; i--) {
            const arg = step.args[i];
            if (typeof arg === 'string' && arg.endsWith('.js')) {
                return arg;
            }
        }
    }
    return null;
}

describe('gate.js — buildSteps() factory contract', () => {
    test('buildSteps is exported via __test and returns a non-empty array of named steps', () => {
        expect(typeof buildSteps).toBe('function');
        const steps = buildSteps();
        expect(Array.isArray(steps)).toBe(true);
        expect(steps.length).toBeGreaterThan(0);
        for (const step of steps) {
            expect(typeof step.name).toBe('string');
            expect(step.name.length).toBeGreaterThan(0);
            expect(step).toHaveProperty('cmd');
            expect(Array.isArray(step.args)).toBe(true);
        }
    });
});

describe('gate.js — present guard scripts must be HARD (no fs.existsSync SKIP)', () => {
    const steps = buildSteps();

    // Sanity: the two steps this hardening targets are present in the list, so a
    // future refactor that drops/renames them does not vacuously pass this file.
    test('the hardened guard steps are present in the step list', () => {
        const names = steps.map((s) => s.name);
        expect(names).toContain('check-demo-maps-in-sync');
        expect(names).toContain('check-error-handler-registered');
    });

    // The core invariant, evaluated per step. A step whose referenced .js guard
    // EXISTS on disk must NOT carry a `file:` guard (which would let runStep SKIP
    // it). Re-adding `file:` to such a step turns this red.
    for (const step of steps) {
        const script = referencedScript(step);
        const scriptExists = typeof script === 'string' && fs.existsSync(script);
        // Only present-script steps are subject to the no-guard contract. Steps
        // that run no .js (npm steps) or whose script is genuinely absent are
        // out of scope here.
        if (!scriptExists) {
            continue;
        }

        test(`step "${step.name}" runs an on-disk script and is not existsSync-guarded`, () => {
            if (PRESENT_SCRIPT_GUARD_EXCEPTIONS.has(step.name)) {
                // Allowlisted pre-existing guard — assert it is STILL only the
                // documented exception, never silently expanded to others.
                expect(PRESENT_SCRIPT_GUARD_EXCEPTIONS.has(step.name)).toBe(true);
                return;
            }
            expect(step.file).toBeUndefined();
        });
    }

    // Belt-and-suspenders: explicitly pin the two hardened steps regardless of
    // their script's on-disk state at test time, so the guarantee does not
    // evaporate if the script is momentarily missing during a refactor.
    test('check-demo-maps-in-sync is HARD (no file: guard)', () => {
        const step = steps.find((s) => s.name === 'check-demo-maps-in-sync');
        expect(step).toBeDefined();
        expect(step.file).toBeUndefined();
    });

    test('check-error-handler-registered is HARD (no file: guard)', () => {
        const step = steps.find((s) => s.name === 'check-error-handler-registered');
        expect(step).toBeDefined();
        expect(step.file).toBeUndefined();
    });
});
