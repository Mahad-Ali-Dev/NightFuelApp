#!/usr/bin/env node
/**
 * NightFuel — Top-level CI gate (gate-truth Source of Truth).
 *
 * Background: before this script the gate-truth was scattered across husky
 * hooks, individual service test scripts, and ad-hoc CLI invocations. Sprint 6
 * review flagged that as ambiguous — there was no single command that, when
 * green, told you the tree was safe to merge.
 *
 * `npm run gate` (which delegates here) runs the following steps in order
 * and exits 1 on the FIRST failure with the failing step's name:
 *
 *   1. node scripts/check-no-inline-401.js       (lint-tier guard)
 *   2. node scripts/check-demo-maps-in-sync.js   (lint-tier guard — OPTIONAL,
 *      only if the file exists; this script is the responsibility of a
 *      different work item and may land later — guarding with fs.existsSync
 *      means this gate does not break in the interim)
 *   3. npm run check-types --silent              (root turbo typecheck — all
 *      packages and services)
 *   4. node scripts/run-backend-tests.js         (per-service jest/vitest
 *      runs with one PASS/FAIL line per service)
 *   5. npm test --workspace=@nightfuel/mobile -- --ci --silent
 *      (mobile jest run; --ci so it doesn't wait for an interactive watcher
 *      and disables snapshot updates)
 *
 * Dependency-free on purpose — uses only Node's built-in `fs`, `path`, and
 * `child_process`. Steps stream their output directly to the gate's stdio so
 * a CI log captures everything verbatim (the per-service log suppression
 * happens inside run-backend-tests.js; here we want every other step to be
 * fully visible).
 *
 * Usage:   node scripts/gate.js
 * Exit:    0 = every step green; 1 = at least one step failed (prints the
 *               name of the first failing step before exiting).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const NODE = process.execPath;

/**
 * Run a step and return its exit code. Streams stdio inherit so each step's
 * output goes straight to the gate's stdout/stderr — important because we
 * WANT to see typecheck errors and lint failures in real time.
 *
 * Steps are specified as { name, file?, cmd, args }:
 *   - name:  human-readable label printed before and after the step.
 *   - file:  optional absolute path to check with fs.existsSync; if set and
 *            the file does not exist, the step is skipped (logged but treated
 *            as OK). Used for optional lint-tier guards.
 *   - cmd:   executable to spawn (NODE for `node`, NPM for `npm`).
 *   - args:  string[] of argv tail.
 */
function runStep(step) {
    if (step.file && !fs.existsSync(step.file)) {
        console.log(`SKIP gate step "${step.name}" — ${path.relative(REPO_ROOT, step.file)} not present yet (optional)`);
        return 0;
    }

    console.log(`\n----- gate step: ${step.name} -----`);
    // Use shell:true ONLY for the NPM steps — Windows needs the shell to
    // resolve `npm.cmd` like a normal prompt would. Do NOT use it for the
    // NODE steps: process.execPath on Windows is `C:\Program Files\nodejs\
    // node.exe` and the unquoted space splits into a `C:\Program` token
    // under cmd.exe. Spawning node directly avoids the shell entirely.
    const useShell = step.cmd === NPM;
    const result = spawnSync(step.cmd, step.args, {
        cwd: REPO_ROOT,
        stdio: 'inherit',
        shell: useShell,
        // No timeout — let CI's outer timeout enforce the upper bound. Some
        // typecheck runs across the monorepo can take a few minutes on cold
        // caches, and we never want this script to kill an otherwise green
        // run.
    });

    const exit = typeof result.status === 'number' ? result.status : 1;
    if (exit === 0) {
        console.log(`----- gate step: ${step.name} PASS -----`);
    } else {
        console.error(`----- gate step: ${step.name} FAIL (exit ${exit}) -----`);
    }
    return exit;
}

function main() {
    // Ordered list of gate steps. Order matters: cheap lint-tier checks first,
    // then typecheck (which is faster than the test suite but slower than the
    // lint guards), then backend tests, then mobile tests last (mobile jest is
    // typically the slowest single step).
    const steps = [
        {
            name: 'check-no-inline-401',
            file: path.join(REPO_ROOT, 'scripts', 'check-no-inline-401.js'),
            cmd: NODE,
            args: [path.join(REPO_ROOT, 'scripts', 'check-no-inline-401.js')],
        },
        {
            // Optional — owned by a different work item that may not have
            // landed yet. The `file` guard above turns this into a no-op when
            // the script doesn't exist.
            name: 'check-demo-maps-in-sync',
            file: path.join(REPO_ROOT, 'scripts', 'check-demo-maps-in-sync.js'),
            cmd: NODE,
            args: [path.join(REPO_ROOT, 'scripts', 'check-demo-maps-in-sync.js')],
        },
        {
            name: 'check-types (turbo)',
            cmd: NPM,
            args: ['run', 'check-types', '--silent'],
        },
        {
            name: 'test:backend',
            cmd: NODE,
            args: [path.join(REPO_ROOT, 'scripts', 'run-backend-tests.js')],
        },
        {
            name: 'test:mobile',
            cmd: NPM,
            // The trailing `--` forwards `--ci --silent` to the underlying
            // `jest` invocation inside @nightfuel/mobile. --ci disables the
            // interactive watcher and snapshot prompting so the run is
            // deterministic; --silent keeps the gate log focused on the
            // PASS/FAIL summary instead of every individual test name.
            args: ['test', '--silent', '--workspace=@nightfuel/mobile', '--', '--ci', '--silent'],
        },
    ];

    for (const step of steps) {
        const exit = runStep(step);
        if (exit !== 0) {
            console.error(`\ngate FAILED at step: ${step.name}`);
            process.exit(1);
        }
    }

    console.log('\ngate PASS — every step green');
    process.exit(0);
}

if (require.main === module) {
    main();
}

module.exports.__test = {
    runStep,
};
