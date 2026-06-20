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
 *   2. node scripts/check-demo-maps-in-sync.js   (lint-tier guard — HARD /
 *      unconditional. This script now lives on disk and passes; it is run on
 *      every gate with NO fs.existsSync guard, so a missing, renamed, or broken
 *      script makes spawnSync exit non-zero and FAILS the gate rather than
 *      degrading to a silent SKIP)
 *   3. node scripts/check-error-handler-registered.js (lint-tier guard — HARD /
 *      unconditional, same as #2. No fs.existsSync guard: if the script is
 *      missing or throws, the gate fails. This guard asserts every Fastify
 *      service registers the centralized error handler and leaks no raw error
 *      body)
 *   4. node scripts/check-shared-logger.js        (lint-tier guard — HARD /
 *      unconditional, same as #2/#3. No fs.existsSync guard. This guard asserts
 *      no services/<svc>/src file constructs a raw pino logger — every service
 *      must use the shared createLogger from @nightfuel/config — so the logger
 *      contract can't drift back into per-service copies)
 *   5. node scripts/check-no-inline-glass.js      (lint-tier guard — HARD /
 *      unconditional, same as #2/#3/#4. No fs.existsSync guard. This guard
 *      asserts no clients/mobile/app screen renders a direct <SafeBlurView> as a
 *      CARD surface outside the GlassCard primitive — so the Aurora glass-card
 *      contract can't drift back into duplicated inline card fills)
 *   6. node scripts/check-no-inline-cta.js        (lint-tier guard — HARD /
 *      unconditional, same as #2/#3/#4/#5. No fs.existsSync guard. This guard
 *      asserts no clients/mobile/app screen renders an inline coral-CTA
 *      <LinearGradient> (a labeled coral button fill) outside the CtaButton
 *      primitive — so the Aurora coral-CTA contract can't drift back into
 *      duplicated inline gradient buttons. Runs immediately after the glass guard)
 *   7. harness-self-tests                         (runs scripts/__tests__/*.test.js
 *      via the already-installed jest — these lock the gate's own helpers:
 *      parseSuiteSummary's fail-closed contract and the inline-401 detectors.
 *      No new dependency: we invoke the repo-hoisted jest CLI directly as a
 *      NODE step. A regression that made parseSuiteSummary fail-OPEN, or that
 *      narrowed the 401 regexes, turns this step RED before it reaches CI)
 *   8. npm run check-types --silent              (root turbo typecheck — all
 *      packages and services)
 *   9. @nightfuel/config build                    (force-emit packages/config
 *      via `tsc -b packages/config --force`; see the long note on the step for
 *      WHY --force is mandatory — a stale tsconfig.tsbuildinfo makes a plain
 *      `tsc`/`tsc -b` report 'up to date' and emit NOTHING even when dist/ is
 *      missing, which would let the backend redaction suites import a stale or
 *      absent @nightfuel/config. Runs BEFORE test:backend so the 11
 *      shared-family redaction suites resolve packages/config/dist/index.js)
 *  10. node scripts/run-backend-tests.js         (per-service jest/vitest
 *      runs with one PASS/FAIL line per service)
 *  11. npm test --workspace=@nightfuel/mobile -- --ci --silent
 *      (mobile jest run; --ci so it doesn't wait for an interactive watcher
 *      and disables snapshot updates)
 *
 * The 11 steps above are HARD: the FIRST non-zero exit FAILS the gate. After all
 * 11 pass, the gate ALSO runs ONE informational reporting step whose exit code is
 * deliberately IGNORED:
 *
 *   • Aurora coverage report (INFORMATIONAL — node scripts/check-aurora-
 *     coverage.js): prints how many clients/mobile/app screens have adopted the
 *     GlassCard / CtaButton / StatusBar Aurora primitives, as counts AND
 *     percentages plus a total screen count. It is a METRIC, not a guard — the
 *     script always exits 0, and the gate runs it via runReportingStep (a runStep
 *     variant that streams its stdio but NEVER short-circuits main()), so the
 *     coverage numbers can never affect the gate's PASS/FAIL. It runs SEPARATELY
 *     from buildSteps() (not part of the hard step array) so the gate-steps meta
 *     self-test — which forbids on-disk guard steps from carrying a `file:` field
 *     — is unaffected, and so a 0% coverage number can never block a merge.
 *
 * Dependency-free on purpose — uses only Node's built-in `fs`, `path`, and
 * `child_process`. Steps stream their output directly to the gate's stdio so
 * a CI log captures everything verbatim (the per-service log suppression
 * happens inside run-backend-tests.js; here we want every other step to be
 * fully visible).
 *
 * Usage:   node scripts/gate.js
 * Exit:    0 = every HARD step green; 1 = at least one HARD step failed (prints
 *               the name of the first failing step before exiting). The
 *               informational coverage report NEVER changes the exit code.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const NODE = process.execPath;

// In-repo CLI entrypoints we spawn directly as NODE steps (shell:false). We
// resolve the .js entrypoint and run it with `node <entrypoint> …` rather than
// invoking the `.bin` shim through a shell. Two reasons, both already
// documented for the NODE steps below:
//   1. process.execPath on Windows is `C:\Program Files\nodejs\node.exe`; under
//      a shell the unquoted space splits into a `C:\Program` token. Spawning
//      node directly with shell:false sidesteps the shell entirely.
//   2. shell:true on Windows merely *concatenates* argv without escaping (see
//      Node DEP0190), so any arg containing quotes/braces — e.g. a jest
//      `--config '{…}'` JSON string — gets mangled by cmd.exe and jest fails to
//      parse it. Passing discrete flags as separate argv entries under
//      shell:false avoids that class of bug.
// jest is already installed (devDependency of @nightfuel/mobile, hoisted to the
// repo root node_modules); typescript is a root devDependency. Neither adds a
// new dependency to any package.json.
const TSC_CLI = path.join(REPO_ROOT, 'node_modules', 'typescript', 'bin', 'tsc');
const JEST_CLI = path.join(REPO_ROOT, 'node_modules', 'jest', 'bin', 'jest.js');

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

/**
 * Run an INFORMATIONAL reporting step: stream its stdio (so its output is fully
 * visible in the gate log) but NEVER let its exit code affect the gate. This is
 * the non-fatal sibling of runStep — main() calls it OUTSIDE the hard step loop,
 * so whatever the script prints (and whatever code it returns) the gate's
 * PASS/FAIL is untouched. Used for the Aurora coverage report, which is a metric
 * (always exits 0) rather than a guard.
 *
 * Returns the observed exit code purely for logging/diagnostics; the caller
 * ignores it by contract. A reporting step is intentionally NOT existsSync-
 * guarded here — if its script is genuinely missing, spawnSync surfaces that in
 * the log without failing the gate.
 */
function runReportingStep(step) {
    console.log(`\n----- gate report (informational, non-blocking): ${step.name} -----`);
    const useShell = step.cmd === NPM;
    const result = spawnSync(step.cmd, step.args, {
        cwd: REPO_ROOT,
        stdio: 'inherit',
        shell: useShell,
    });
    const exit = typeof result.status === 'number' ? result.status : 1;
    // Informational ONLY — we report the outcome but DO NOT propagate it. Even a
    // non-zero exit here is logged as a note, never a gate failure.
    if (exit === 0) {
        console.log(`----- gate report: ${step.name} done (informational) -----`);
    } else {
        console.log(`----- gate report: ${step.name} returned exit ${exit} — IGNORED (informational, non-blocking) -----`);
    }
    return exit;
}

/**
 * Informational reporting steps, run AFTER the hard buildSteps() loop with their
 * exit codes ignored (see runReportingStep + main()). Kept SEPARATE from
 * buildSteps() on purpose: the gate-steps meta self-test asserts that every
 * on-disk guard step in buildSteps() carries no `file:` field, so the coverage
 * report — which is not a guard — must not live in that array. Exposed via
 * module.exports.__test.buildReportingSteps so tests can assert the wiring.
 */
function buildReportingSteps() {
    return [
        {
            // Aurora-adoption coverage (GlassCard / CtaButton / StatusBar) over
            // clients/mobile/app — counts + percentages + total. INFORMATIONAL:
            // the script always exits 0 and runReportingStep ignores its exit
            // code, so these numbers can never block the gate.
            name: 'aurora-coverage (informational)',
            cmd: NODE,
            args: [path.join(REPO_ROOT, 'scripts', 'check-aurora-coverage.js')],
        },
        {
            // Sampled curated demo-URL rot check over clients/mobile/src/constants/
            // curatedDemos.ts — HEAD/GETs a small slice of the FEDB frame + YouTube
            // URLs and prints any non-200 as a NOTE. INFORMATIONAL: the script
            // ALWAYS exits 0 (offline → skip; dead URL → note; all 200 → OK) and
            // runReportingStep ignores its exit code, so a rotted third-party CDN
            // URL — or an offline CI box — can NEVER block the gate. Mirrors the
            // aurora-coverage entry above and, like it, lives OUTSIDE buildSteps()
            // so the gate-steps meta self-test (which forbids a `file:` field on
            // on-disk buildSteps guards) is unaffected. This is the NON-blocking
            // sibling of the standalone, deliberately-ungated scripts/check-demo-
            // urls.js — we wire in the SAMPLE variant only, never the hard one.
            name: 'demo-urls-sample (informational)',
            cmd: NODE,
            args: [path.join(REPO_ROOT, 'scripts', 'check-demo-urls-sample.js')],
        },
    ];
}

/**
 * Build the ordered list of gate steps. Order matters: cheap lint-tier checks
 * first, then typecheck (which is faster than the test suite but slower than
 * the lint guards), then backend tests, then mobile tests last (mobile jest is
 * typically the slowest single step).
 *
 * Exposed via module.exports.__test.buildSteps so the gate-steps meta self-test
 * can assert no present guard script has been re-wrapped in a `file:`
 * existsSync guard (which would silently downgrade a HARD step to a SKIP).
 */
function buildSteps() {
    return [
        {
            name: 'check-no-inline-401',
            file: path.join(REPO_ROOT, 'scripts', 'check-no-inline-401.js'),
            cmd: NODE,
            args: [path.join(REPO_ROOT, 'scripts', 'check-no-inline-401.js')],
        },
        {
            // HARD / unconditional — no `file` guard. The script lives on disk
            // and passes; running it on every gate means a missing, renamed, or
            // broken check-demo-maps-in-sync.js makes spawnSync exit non-zero and
            // FAILS the gate, instead of degrading to a silent SKIP that would
            // quietly drop a real CI guarantee.
            name: 'check-demo-maps-in-sync',
            cmd: NODE,
            args: [path.join(REPO_ROOT, 'scripts', 'check-demo-maps-in-sync.js')],
        },
        {
            // HARD / unconditional — no `file` guard, same as check-demo-maps-in-
            // sync above. This guard asserts every Fastify service registers the
            // centralized error handler (and leaks no raw error body); the script
            // exists and passes, so it runs every gate. A missing or throwing
            // script fails the gate rather than printing SKIP and continuing.
            name: 'check-error-handler-registered',
            cmd: NODE,
            args: [path.join(REPO_ROOT, 'scripts', 'check-error-handler-registered.js')],
        },
        {
            // HARD / unconditional — no `file` guard, same pattern as check-demo-
            // maps-in-sync and check-error-handler-registered above. This guard
            // asserts no services/<svc>/src file constructs a raw pino logger
            // (every service must use the shared createLogger from
            // @nightfuel/config); the script exists and passes, so it runs every
            // gate. A missing or throwing script fails the gate rather than
            // printing SKIP and continuing.
            name: 'check-shared-logger',
            cmd: NODE,
            args: [path.join(REPO_ROOT, 'scripts', 'check-shared-logger.js')],
        },
        {
            // HARD / unconditional — no `file` guard, same pattern as check-demo-
            // maps-in-sync / check-error-handler-registered / check-shared-logger
            // above. This guard asserts no clients/mobile/app screen renders a
            // direct <SafeBlurView> as a CARD surface outside the GlassCard
            // primitive (the Aurora glass-card contract); the script exists and
            // passes on the post-migration tree, so it runs every gate. A missing
            // or throwing script fails the gate rather than printing SKIP and
            // continuing.
            name: 'check-no-inline-glass',
            cmd: NODE,
            args: [path.join(REPO_ROOT, 'scripts', 'check-no-inline-glass.js')],
        },
        {
            // HARD / unconditional — no `file` guard, same pattern as check-demo-
            // maps-in-sync / check-error-handler-registered / check-shared-logger
            // / check-no-inline-glass above. This guard asserts no clients/mobile/
            // app screen renders an inline coral-CTA <LinearGradient> (a labeled
            // coral button fill) outside the CtaButton primitive (the Aurora
            // coral-CTA contract — the analogue of the GlassCard contract the
            // previous step enforces); the script exists and passes on the
            // post-conversion tree, so it runs every gate. A missing or throwing
            // script fails the gate rather than printing SKIP and continuing.
            // Placed immediately after check-no-inline-glass and, like it, left
            // UNGUARDED so the gate-steps meta self-test (which requires on-disk
            // guard steps to carry no `file:` field) stays green.
            name: 'check-no-inline-cta',
            cmd: NODE,
            args: [path.join(REPO_ROOT, 'scripts', 'check-no-inline-cta.js')],
        },
        {
            // Harness self-tests: run scripts/__tests__/*.test.js, which lock
            // the gate's OWN load-bearing helpers — run-backend-tests.js's
            // parseSuiteSummary (must stay fail-closed: an unparseable run reads
            // as null/FAIL, never a silent pass) and check-no-inline-401.js's
            // detection regexes. If either regresses, this step goes RED before
            // it can wave a broken gate through CI.
            //
            // These are plain CommonJS tests (no JSX/TS), so we deliberately do
            // NOT use @nightfuel/mobile's jest-expo preset — its babel transform
            // chokes on plain JS and reports "0 tests". Instead we run the
            // repo-hoisted jest CLI directly as a NODE step (shell:false) and
            // pass discrete flags: an external --rootDir at the repo root,
            // --roots scoped to scripts/__tests__, --testMatch for *.test.js, and
            // --transform '{}' to disable transforms entirely. No new dependency
            // (jest is already a @nightfuel/mobile devDependency hoisted to the
            // root) and nothing is added to any package.json.
            //
            // We intentionally omit --passWithNoTests: if the two suites ever
            // vanish or the path breaks, jest exits non-zero ("No tests found"),
            // which is the fail-closed behaviour we want — a gate step that
            // silently runs zero tests is worse than useless.
            name: 'harness-self-tests',
            cmd: NODE,
            args: [
                JEST_CLI,
                '--rootDir', REPO_ROOT,
                '--roots', path.join(REPO_ROOT, 'scripts', '__tests__'),
                '--testMatch', '**/*.test.js',
                '--transform', '{}',
                '--ci',
                '--silent',
            ],
        },
        {
            name: 'check-types (turbo)',
            cmd: NPM,
            args: ['run', 'check-types', '--silent'],
        },
        {
            // Force-emit @nightfuel/config BEFORE the backend tests run. The 11
            // shared-family redaction suites import registerFastifyErrorHandler
            // from @nightfuel/config, which resolves to its package `main`,
            // packages/config/dist/index.js. If dist/ is missing or stale those
            // suites import the wrong thing (or fail to resolve), so the gate
            // must guarantee a fresh build first.
            //
            // WHY --force (this is the crux): packages/config is a `composite`
            // TypeScript project with a tsconfig.tsbuildinfo. With a stale
            // tsbuildinfo on disk, BOTH `tsc` and `tsc -b packages/config`
            // report "up to date" and emit NOTHING — even when dist/ has been
            // deleted (verified by hand: `rm -rf packages/config/dist` then
            // `tsc -b packages/config` exits 0 but leaves dist/ absent). Only
            // `tsc -b … --force` ignores the buildinfo and regenerates the full
            // dist/ (index.js + server.js + auth-errors.js + …). So we do NOT
            // use the package's `npm run build` (a plain `tsc` that hits the
            // same no-emit trap); we invoke the repo-local tsc directly in
            // build-force mode.
            //
            // Spawned as a NODE step (shell:false) pointing at the tsc .js
            // entrypoint — same Windows-shell rationale documented on NODE/TSC
            // above (avoids the `C:\Program Files` space split). The gate
            // proceeds only on exit 0.
            name: '@nightfuel/config build',
            cmd: NODE,
            args: [TSC_CLI, '-b', 'packages/config', '--force'],
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
}

function main() {
    const steps = buildSteps();

    for (const step of steps) {
        const exit = runStep(step);
        if (exit !== 0) {
            console.error(`\ngate FAILED at step: ${step.name}`);
            process.exit(1);
        }
    }

    // All HARD steps green. Now run the INFORMATIONAL reporting steps with their
    // exit codes IGNORED — they print metrics (e.g. Aurora coverage) but never
    // change the gate's PASS/FAIL. Wrapped defensively so a throwing reporter
    // can't turn a green gate red.
    for (const report of buildReportingSteps()) {
        try {
            runReportingStep(report);
        } catch (err) {
            console.log(`----- gate report: ${report.name} threw — IGNORED (informational, non-blocking) -----`);
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
    runReportingStep,
    buildSteps,
    buildReportingSteps,
};
