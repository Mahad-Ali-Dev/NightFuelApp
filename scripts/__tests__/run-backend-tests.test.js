/**
 * Unit test — scripts/run-backend-tests.js harness contract.
 *
 * run-backend-tests.js is the backend half of the CI gate: it discovers every
 * services/<svc>/ with a __tests__ folder + a `test` script, runs each suite,
 * and parses jest/vitest's summary line into pass/fail counts. Two pure helpers
 * carry the gate-truth and are the ones a regression would silently break:
 *
 *   1) parseSuiteSummary(output) — turns a captured jest/vitest summary into
 *      { passed, failed, total }, or null when no summary is found. The null
 *      case is load-bearing: the caller treats an unparseable run as a FAIL so
 *      a broken harness cannot sneak past the gate (fail-closed).
 *   2) discoverServices() — enumerates the runnable services. Must return an
 *      array and must not throw on this repo's real services/ tree.
 *
 * This suite locks both shapes in. If anyone rewrites parseSuiteSummary so a
 * failing run reads as passing — or so an unparseable run reads as a pass
 * instead of null — these assertions go red BEFORE the change reaches CI.
 *
 * Plain JS (not TS) on purpose: the script under test is plain JS too, so the
 * test stays close to the production surface and runs without the babel/ts-jest
 * transform stack. We import via the script's `module.exports.__test` back-door
 * — the same constants the harness uses at runtime. Importing the module is
 * safe: main() only runs under the require.main === module guard.
 *
 * Run from repo root: `npx jest scripts/__tests__/run-backend-tests.test.js`
 */

'use strict';

const path = require('path');

const { __test } = require(path.resolve(__dirname, '..', 'run-backend-tests.js'));
const { discoverServices, parseSuiteSummary, generatePrismaClient } = __test;

describe('run-backend-tests — parseSuiteSummary (jest)', () => {
    test('all-green jest summary parses with zero failures', () => {
        const out = 'Test Suites: 5 passed, 5 total';
        expect(parseSuiteSummary(out)).toEqual({ passed: 5, failed: 0, total: 5 });
    });

    test('mixed jest summary reports the failed count (so a failing run is NOT read as pass)', () => {
        const out = 'Test Suites: 1 failed, 4 passed, 5 total';
        const summary = parseSuiteSummary(out);
        expect(summary).toEqual({ passed: 4, failed: 1, total: 5 });
        // The caller's PASS branch requires summary.failed === 0; guard that a
        // failing run can never satisfy it.
        expect(summary.failed).toBeGreaterThan(0);
    });

    test('all-failed jest summary parses with no passes', () => {
        const out = 'Test Suites: 3 failed, 3 total';
        expect(parseSuiteSummary(out)).toEqual({ passed: 0, failed: 3, total: 3 });
    });

    test('skipped-only jest summary parses (passed 0, failed 0)', () => {
        const out = 'Test Suites: 5 skipped, 5 total';
        expect(parseSuiteSummary(out)).toEqual({ passed: 0, failed: 0, total: 5 });
    });
});

describe('run-backend-tests — parseSuiteSummary (vitest)', () => {
    test('all-green vitest summary parses', () => {
        const out = 'Test Files  5 passed (5)';
        expect(parseSuiteSummary(out)).toEqual({ passed: 5, failed: 0, total: 5 });
    });

    test('mixed vitest summary reports the failed count', () => {
        const out = 'Test Files  1 failed | 4 passed (5)';
        expect(parseSuiteSummary(out)).toEqual({ passed: 4, failed: 1, total: 5 });
    });
});

describe('run-backend-tests — parseSuiteSummary (fail-closed)', () => {
    test('output with no recognizable summary returns null (caller treats null as FAIL)', () => {
        // An empty run, a crash before jest prints its tail, or a future
        // harness with a different shape must NOT be read as a pass — the
        // caller only PASSes when summary is truthy AND summary.failed === 0.
        expect(parseSuiteSummary('')).toBeNull();
        expect(parseSuiteSummary('Cannot find module ./src/generated/prisma')).toBeNull();
        expect(parseSuiteSummary('Error: spawn npm ENOENT')).toBeNull();
    });

    test('a "Test Suites:" header without a total count does not parse as a pass', () => {
        // Partial/garbled header — no `N total`, so the jest branch must not
        // match and we fall through to null (FAIL), never a silent pass.
        expect(parseSuiteSummary('Test Suites: running...')).toBeNull();
    });
});

describe('run-backend-tests — discoverServices', () => {
    test('returns an array and does not throw on the real services/ tree', () => {
        const services = discoverServices();
        expect(Array.isArray(services)).toBe(true);
        // Every discovered entry carries a dir + name the runner relies on.
        for (const svc of services) {
            if (svc.broken) continue;
            expect(typeof svc.dir).toBe('string');
            expect(typeof svc.name).toBe('string');
            expect(svc.name.length).toBeGreaterThan(0);
        }
    });
});

describe('run-backend-tests — fail-closed surface', () => {
    test('generatePrismaClient helper is exported for the missing-client path', () => {
        // The fail-closed regenerate step depends on this helper existing; if a
        // refactor drops it, the SKIP-as-pass hole could silently return.
        expect(typeof generatePrismaClient).toBe('function');
    });
});
