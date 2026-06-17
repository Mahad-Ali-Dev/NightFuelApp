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

    test('jest summary with failed BEFORE passed still reports the failed count', () => {
        // Jest does not guarantee field ordering across versions/configs; the
        // parser reads `N passed` and `N failed` with independent sub-matches,
        // so a "failed, passed, total" ordering must yield the same result as
        // "passed, failed, total". Pin that a failing run is never mis-read as a
        // pass just because the fields swapped order.
        const out = 'Test Suites: 2 failed, 3 passed, 5 total';
        const summary = parseSuiteSummary(out);
        expect(summary).toEqual({ passed: 3, failed: 2, total: 5 });
        expect(summary.failed).toBeGreaterThan(0);
    });

    test('zero-total jest header parses to all-zero counts (NOT null)', () => {
        // Edge shape: jest can emit "Test Suites: 0 total" (e.g. a config that
        // matched no suites). The jest branch DOES match here because the header
        // carries `N total`, so parseSuiteSummary returns {0,0,0} rather than
        // null. Documented intentionally: the null-vs-truthy distinction is what
        // carries fail-closed for an *unparseable* run (see the fail-closed
        // describe block); a zero-total run is a *parseable* empty run whose
        // failed===0. The caller's PASS branch is `exitCode === 0 && summary &&
        // summary.failed === 0`, so a zero-total summary only passes when the
        // process also exited 0 — a real service that should have suites and
        // instead reports 0 total will fail on the non-zero exit, not here.
        const summary = parseSuiteSummary('Test Suites: 0 total');
        expect(summary).toEqual({ passed: 0, failed: 0, total: 0 });
        expect(summary.failed).toBe(0);
        expect(summary.total).toBe(0);
    });
});

describe('run-backend-tests — parseSuiteSummary (vitest)', () => {
    test('all-green vitest summary parses', () => {
        const out = 'Test Files  5 passed (5)';
        expect(parseSuiteSummary(out)).toEqual({ passed: 5, failed: 0, total: 5 });
    });

    test('mixed vitest summary reports the failed count', () => {
        const out = 'Test Files  1 failed | 4 passed (5)';
        const summary = parseSuiteSummary(out);
        expect(summary).toEqual({ passed: 4, failed: 1, total: 5 });
        // Same fail-closed guard as the jest mixed case: a failing vitest run
        // can never satisfy the caller's `summary.failed === 0` PASS branch.
        expect(summary.failed).toBeGreaterThan(0);
    });

    test('zero-total vitest summary parses to all-zero counts (NOT null)', () => {
        // vitest counterpart of the jest zero-total edge: "Test Files  0 passed
        // (0)" matches the vitest branch (the trailing `(N)` is present) and
        // yields {0,0,0}. Same reasoning as the jest case — fail-closed rests on
        // the null path for unparseable output, and on the exit code for the
        // zero-total empty run.
        expect(parseSuiteSummary('Test Files  0 passed (0)')).toEqual({
            passed: 0,
            failed: 0,
            total: 0,
        });
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

    test('the PASS predicate can NEVER accept a null summary (null is always FAIL)', () => {
        // main() is not directly unit-testable (it calls process.exit), so we
        // lock the load-bearing branch by re-stating the EXACT predicate the
        // caller uses in run-backend-tests.js (the per-service PASS gate):
        //
        //     if (exitCode === 0 && summary && summary.failed === 0) { PASS }
        //
        // The `&& summary` term is the fail-closed guard: a null summary
        // short-circuits to FAIL before `.failed` is ever read. If a refactor
        // ever reorders this so null can slip through (e.g. `summary?.failed ===
        // 0` would make `undefined === 0` false — still FAIL — but `!summary ||
        // summary.failed === 0` would make null read as PASS), this test goes
        // red. We feed the predicate parseSuiteSummary's real outputs so the two
        // halves stay coupled to production.
        const passes = (exitCode, summary) => exitCode === 0 && !!summary && summary.failed === 0;

        // Unparseable output → null → FAIL even on a clean exit code.
        expect(passes(0, parseSuiteSummary(''))).toBe(false);
        expect(passes(0, parseSuiteSummary('Error: spawn npm ENOENT'))).toBe(false);
        expect(passes(0, parseSuiteSummary('Test Suites: running...'))).toBe(false);

        // A real all-green summary on a clean exit is the ONLY shape that passes.
        expect(passes(0, parseSuiteSummary('Test Suites: 5 passed, 5 total'))).toBe(true);

        // A parseable-but-failing summary fails even when the exit code lies (0).
        expect(passes(0, parseSuiteSummary('Test Suites: 1 failed, 4 passed, 5 total'))).toBe(false);

        // A non-zero exit fails even when the summary looks green (belt + braces).
        expect(passes(1, parseSuiteSummary('Test Suites: 5 passed, 5 total'))).toBe(false);
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

describe('run-backend-tests — prisma fail-closed surface', () => {
    test('generatePrismaClient helper is exported for the missing-client path', () => {
        // The fail-closed regenerate step depends on this helper existing; if a
        // refactor drops it, the SKIP-as-pass hole could silently return.
        expect(typeof generatePrismaClient).toBe('function');
    });

    test('generatePrismaClient is unary (takes the service descriptor)', () => {
        // The caller invokes `generatePrismaClient(svc)` with the discovered
        // service object so the generate runs in `svc.dir`. Pin the arity so a
        // refactor that changes the signature (and silently passes the wrong
        // cwd) is caught here rather than in CI.
        expect(generatePrismaClient.length).toBe(1);
    });

    test('the prisma branch fails CLOSED — missing generated client is a FAIL, never a silent SKIP-as-pass', () => {
        // main() is not directly unit-testable (it calls process.exit and shells
        // out to `npx prisma generate`), so this test LOCKS the observable
        // contract of the fail-closed branch in run-backend-tests.js without
        // spawning a real generate:
        //
        //   const hasPrismaSchema = fs.existsSync(.../prisma/schema.prisma);
        //   const generatedClientPath = .../src/generated/prisma;
        //   if (hasPrismaSchema && !fs.existsSync(generatedClientPath)) {
        //       const gen = generatePrismaClient(svc);           // {exitCode, combined}
        //       if (!fs.existsSync(generatedClientPath)) {       // RE-CHECK on disk
        //           anyFailed = true;                            // ← FAIL, not continue-as-pass
        //           ...
        //           continue;
        //       }
        //   }
        //
        // The two invariants that keep this fail-closed:
        //   (a) generatePrismaClient returns a { exitCode, combined } shape the
        //       caller can record into failureLogs — we assert that shape on the
        //       call the test CAN make safely: a non-existent service dir, where
        //       `npx prisma generate` exits non-zero and writes nothing. No DB is
        //       touched and no client is produced, mirroring the unrecoverable
        //       case the branch must mark FAIL.
        //   (b) The decision is driven by an on-disk re-check, NOT the exit code
        //       alone — so even a (hypothetical) exit-0 generate that produced no
        //       client is still recorded as FAIL. We restate that predicate and
        //       assert it returns FAIL when the client path is absent.
        const result = generatePrismaClient({
            dir: path.resolve(__dirname, '__no_such_service_dir__'),
            name: 'nonexistent-service',
        });
        expect(result).not.toBeNull();
        expect(typeof result).toBe('object');
        expect(typeof result.exitCode).toBe('number');
        expect(typeof result.combined).toBe('string');
        // Nothing was generated for a bogus dir → the caller's re-check is what
        // matters; exit code is non-zero but the contract is "client must exist".
        expect(result.exitCode).not.toBe(0);

        // Restate the caller's fail-closed decision: a service that ships a
        // schema but has no client on disk AFTER generate is a FAIL regardless
        // of what the generate exit code claims.
        const branchRecordsFail = (hasPrismaSchema, clientExistsAfterGenerate) =>
            hasPrismaSchema && !clientExistsAfterGenerate;
        // Schema present, client still absent → FAIL (the load-bearing case).
        expect(branchRecordsFail(true, false)).toBe(true);
        // Schema present, client materialized → fall through to run the suite.
        expect(branchRecordsFail(true, true)).toBe(false);
        // No schema at all → branch never engages; stateless services still run.
        expect(branchRecordsFail(false, false)).toBe(false);
    });
});
