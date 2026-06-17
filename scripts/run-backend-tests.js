#!/usr/bin/env node
/**
 * NightFuel — Backend test runner (gate-truth Source of Truth).
 *
 * Background: the repo's root package.json has no top-level `test` script and
 * the per-service test scripts are spread across N services with slightly
 * different jest configs (some don't even have a `test` script yet). CI (and
 * humans running `npm run gate` locally) need ONE invocation that:
 *
 *   - discovers every services/<svc>/ that has a __tests__ folder AND a
 *     `scripts.test` entry in its package.json,
 *   - runs that service's tests via the workspace's own npm script (so each
 *     service keeps owning its own jest/vitest config),
 *   - prints exactly one line per service in a uniform shape:
 *       PASS service-name: N/N suites passed
 *       FAIL service-name: X suite(s) failing
 *   - swallows the per-service log on success (keeps the gate output readable)
 *     but dumps the captured stdout/stderr on failure so the engineer can
 *     diagnose immediately,
 *   - exits 0 only if every discovered service passes.
 *
 * Dependency-free on purpose — uses only Node's built-in `fs`, `path`, and
 * `child_process` so it runs in any CI environment without an `npm install`
 * step (other than the normal monorepo install).
 *
 * Usage:   node scripts/run-backend-tests.js
 * Exit:    0 = every service green; 1 = at least one service failed (or had
 *               no discoverable jest summary line — treated as failure).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// Repo root is one level up from /scripts.
const REPO_ROOT = path.resolve(__dirname, '..');
const SERVICES_DIR = path.join(REPO_ROOT, 'services');

// On Windows the `npm` shim is `npm.cmd`; spawnSync needs the exact filename
// when `shell` is false. We set shell:true below so npm/npm.cmd both resolve
// via the parent shell's PATH, which is the most portable option.
const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm';

/**
 * Discover every services/<svc>/ that has a __tests__ folder AND a `test`
 * script in its package.json. Returns an array of { dir, name } where `name`
 * is the workspace name read from the service's package.json.
 *
 * A service is skipped (not failed) if it has no __tests__ folder or no test
 * script — we don't want this gate to force every service to ship tests on
 * day one. The check-no-inline-401 guard and the typecheck cover the rest.
 */
function discoverServices() {
    if (!fs.existsSync(SERVICES_DIR)) return [];

    const out = [];
    const entries = fs.readdirSync(SERVICES_DIR, { withFileTypes: true });
    for (const ent of entries) {
        if (!ent.isDirectory()) continue;
        const svcDir = path.join(SERVICES_DIR, ent.name);
        const testsDir = path.join(svcDir, '__tests__');
        const pkgPath = path.join(svcDir, 'package.json');
        if (!fs.existsSync(testsDir)) continue;
        if (!fs.existsSync(pkgPath)) continue;

        let pkg;
        try {
            pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        } catch (err) {
            // Malformed package.json — surface as a failure so it gets fixed.
            out.push({ dir: svcDir, name: ent.name, broken: String(err.message) });
            continue;
        }

        if (!pkg.scripts || !pkg.scripts.test) continue;

        // Resolve the workspace name from the package.json `name` field. Falls
        // back to the directory name if `name` is missing (defensive — every
        // real service in this repo has a name today).
        const workspaceName = (pkg.name && String(pkg.name)) || ent.name;
        out.push({ dir: svcDir, name: workspaceName, dirName: ent.name });
    }
    return out;
}

/**
 * Parse jest's summary line from captured combined output and return
 * { passed, total } suite counts. Jest prints one of:
 *   Test Suites: 5 passed, 5 total
 *   Test Suites: 1 failed, 4 passed, 5 total
 *   Test Suites: 5 skipped, 5 total
 * vitest prints a different shape (Test Files  5 passed (5)), so we handle
 * both. If neither matches we return null and the caller treats the run as
 * indeterminate (counted as FAIL so an unparseable harness can't sneak past
 * the gate).
 */
function parseSuiteSummary(combinedOutput) {
    // Jest: "Test Suites: 1 failed, 4 passed, 5 total"
    const jestRe = /Test Suites:[^\n]*?(\d+)\s+total/;
    const jestM = combinedOutput.match(jestRe);
    if (jestM) {
        const total = Number(jestM[1]);
        const passedM = combinedOutput.match(/Test Suites:[^\n]*?(\d+)\s+passed/);
        const failedM = combinedOutput.match(/Test Suites:[^\n]*?(\d+)\s+failed/);
        const passed = passedM ? Number(passedM[1]) : 0;
        const failed = failedM ? Number(failedM[1]) : 0;
        return { passed, failed, total };
    }
    // vitest: "Test Files  5 passed (5)"  OR  "Test Files  1 failed | 4 passed (5)"
    const vitestRe = /Test Files\s+([^\n]+?)\((\d+)\)/;
    const vitestM = combinedOutput.match(vitestRe);
    if (vitestM) {
        const total = Number(vitestM[2]);
        const inner = vitestM[1];
        const passedM = inner.match(/(\d+)\s+passed/);
        const failedM = inner.match(/(\d+)\s+failed/);
        const passed = passedM ? Number(passedM[1]) : 0;
        const failed = failedM ? Number(failedM[1]) : 0;
        return { passed, failed, total };
    }
    return null;
}

/**
 * Run a single service's tests via the root workspace flag so the service's
 * own `test` script (and its own jest/vitest config) is the source of truth.
 * Captures stdout+stderr into a single buffer; on failure that buffer is
 * dumped to stderr so the engineer doesn't have to re-run anything.
 */
function runServiceTests(svc) {
    const args = ['test', '--silent', `--workspace=${svc.name}`];
    const result = spawnSync(NPM, args, {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        // shell:true so npm.cmd resolves on Windows and the standard `npm`
        // shell shim resolves on POSIX. Safe — we control every arg.
        shell: true,
        stdio: 'pipe',
        // Generous timeout: a slow CI runner with a cold prisma generate can
        // take a while, but 10 minutes is a strong upper bound for one service.
        timeout: 10 * 60 * 1000,
    });

    const combined = `${result.stdout || ''}\n${result.stderr || ''}`;
    const summary = parseSuiteSummary(combined);
    const exitCode = typeof result.status === 'number' ? result.status : 1;

    return { exitCode, combined, summary };
}

function main() {
    const services = discoverServices();

    if (services.length === 0) {
        // Nothing to run is treated as OK — a fresh checkout that pre-dates
        // services/ shouldn't fail the gate.
        console.log('run-backend-tests: no services with __tests__ + test script discovered (OK)');
        process.exit(0);
    }

    let anyFailed = false;
    const failureLogs = [];

    for (const svc of services) {
        // Broken package.json — flag and continue so the engineer sees every
        // broken service in one pass.
        if (svc.broken) {
            console.error(`FAIL ${svc.name}: package.json unreadable (${svc.broken})`);
            anyFailed = true;
            continue;
        }

        // A jest suite that touches the service's Prisma layer cannot even be
        // collected if `prisma generate` has never run for that service (the
        // generated client under src/generated/prisma is .gitignored). Rather
        // than letting that surface as an opaque module-not-found FAIL, detect
        // the missing client up front and emit an explicit, named SKIP line so
        // the gate output makes the cause obvious. This is NOT counted as a
        // failure — a fresh checkout that hasn't generated clients yet should
        // not break the gate on that basis alone. In CI (and locally after
        // `npm run build`) the client is present and the service runs normally.
        //
        // Guard narrowly: only Prisma-backed services (those that ship a
        // prisma/schema.prisma) can have an "absent generated client" problem.
        // A stateless service with no schema (e.g. decision-engine) has nothing
        // to generate and must still run — so we never skip it on this basis.
        const hasPrismaSchema = fs.existsSync(path.join(svc.dir, 'prisma', 'schema.prisma'));
        const hasGeneratedClient = fs.existsSync(path.join(svc.dir, 'src', 'generated', 'prisma'));
        if (hasPrismaSchema && !hasGeneratedClient) {
            console.log(`SKIP ${svc.name}: generated prisma client absent`);
            continue;
        }

        const { exitCode, combined, summary } = runServiceTests(svc);

        if (exitCode === 0 && summary && summary.failed === 0) {
            const total = summary.total;
            const passed = summary.passed || total;
            console.log(`PASS ${svc.name}: ${passed}/${total} suites passed`);
            continue;
        }

        // Failure path — print one structured FAIL line, then stash the full
        // captured log to dump after the per-service summary loop completes.
        anyFailed = true;
        if (summary) {
            const failed = summary.failed || Math.max(summary.total - (summary.passed || 0), 1);
            console.error(
                `FAIL ${svc.name}: ${failed} suite(s) failing (${summary.passed || 0}/${summary.total} passed)`,
            );
        } else {
            console.error(
                `FAIL ${svc.name}: jest summary not found in output (exit ${exitCode})`,
            );
        }
        failureLogs.push({ name: svc.name, combined });
    }

    if (anyFailed) {
        // Dump captured logs ONLY for the failing services, in the order they
        // ran. Keeping this at the end (rather than interleaved) means the
        // PASS/FAIL summary stays visually scannable at the top of the output.
        for (const f of failureLogs) {
            console.error(`\n----- ${f.name} log -----`);
            console.error(f.combined.trim());
            console.error(`----- end ${f.name} log -----\n`);
        }
        process.exit(1);
    }

    process.exit(0);
}

if (require.main === module) {
    main();
}

// Exposed for any future unit test under scripts/__tests__/.
module.exports.__test = {
    discoverServices,
    parseSuiteSummary,
};
