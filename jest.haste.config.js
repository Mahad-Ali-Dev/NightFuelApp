/**
 * NightFuel — opt-in jest haste config (NON-GATE, single-owned).
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * A *root* jest run (one started with `--rootDir <repo>` from the monorepo
 * root) crawls the whole tree to build its haste map. While doing so it emits
 * `jest-haste-map: duplicate manual mock` / `jest-haste-map: @providesModule`
 * /  duplicate-name warnings, because several generated trees ship a
 * package.json whose `name` is duplicated across two on-disk copies:
 *
 *   - Each backend service has a Prisma client generated into BOTH
 *       services/<svc>/src/generated/prisma/   (source)
 *       services/<svc>/dist/generated/prisma/  (compiled output)
 *     and BOTH package.json files carry the SAME synthetic package name
 *     (e.g. "prisma-client-36d6f9…"). Two files, one name → haste collision.
 *   - clients/web/.next/ (Next.js build output, incl. .next/standalone with a
 *     fully re-nested node_modules and even a re-nested clients/web/.next) is
 *     littered with duplicate vendored package.json names.
 *
 * These warnings are pure noise — they come from build artifacts, not from any
 * test input — but they clutter a root jest log.
 *
 * WHY IT IS A SEPARATE FILE AND NOT jest.config.js (GATE SAFETY — CRITICAL)
 * ------------------------------------------------------------------------
 * There is intentionally NO root jest.config.js in this repo. The CI gate
 * (scripts/gate.js, owned elsewhere — DO NOT EDIT) has a `harness-self-tests`
 * step that invokes the repo-hoisted jest CLI with an explicit
 * `--rootDir <repo>` and a hand-rolled set of flags, but NO `--config`. Jest
 * only auto-discovers a config named exactly jest.config.{js,ts,mjs,cjs,json}
 * (or a `jest` key in package.json); it does NOT auto-discover an arbitrarily
 * named file like this one. So:
 *
 *   - Adding a root jest.config.js WOULD be auto-picked-up by that gate step
 *     under its `--rootDir <repo>` and could silently change its behaviour.
 *     That is the trap we are avoiding.
 *   - This file (jest.haste.config.js) is referenced ONLY when a caller passes
 *     it explicitly via `--config jest.haste.config.js`. It is invisible to the
 *     gate, so the gate's jest pass is byte-for-byte unaffected.
 *
 * HOW TO USE (opt-in, documented invocation — no package.json script added)
 * -------------------------------------------------------------------------
 * Run a warning-clean root jest from the repo root with:
 *
 *     jest --config jest.haste.config.js
 *
 * (We deliberately do NOT add a `test:haste-clean` npm script here: this item
 * owns only this file, and root package.json scripts are owned/edited by other
 * concurrent work-items. Documenting the one-liner keeps file ownership
 * disjoint and avoids a merge collision.)
 *
 * WHAT THE PATTERNS DO
 * --------------------
 * `modulePathIgnorePatterns` is the canonical lever: any module path matching
 * one of these regexes is excluded from the haste map entirely, so the
 * duplicated package.json `name`s are never indexed and therefore never
 * collide — the warnings disappear at the source rather than being merely
 * silenced. Patterns are written with forward-slash separators; jest's
 * `replacePathSepForRegex` rewrites `/` to the platform separator at load
 * time (`\\` on Windows, unchanged on POSIX), so a single forward-slash form
 * is correct cross-platform. `<rootDir>` expands to this config's directory
 * (the repo root) when present.
 *
 * This is PURE CONFIG: no transform, no dependency, no test-logic change. It
 * does not (and cannot) alter how any individual service/mobile suite runs,
 * because those suites are executed via their own per-package jest configs,
 * not via this root-level haste config.
 */
'use strict';

/**
 * Regex fragments (forward-slash form) for build/generated trees whose
 * duplicated package.json names cause jest-haste-map collisions. Matched
 * anywhere in the absolute module path.
 */
const IGNORED_PATH_PATTERNS = [
  // Prisma clients generated into BOTH src/ and dist/ of every service share
  // one synthetic package name → the primary duplicate-name source.
  '/generated/prisma/',
  // Per-service compiled output. dist/ mirrors src/ (incl. the generated
  // Prisma client above), so its package.json names duplicate the src copies.
  '/services/[^/]+/dist/',
  // Next.js build output for the web client: .next/ (and its re-nested
  // .next/standalone/node_modules + re-nested clients/web/.next) carry many
  // duplicate vendored package.json names. The dot is escaped so it matches a
  // literal ".next" directory.
  '/clients/web/\\.next/',
];

module.exports = {
  // Anchor the crawl at the repo root (this file's directory) so a bare
  // `jest --config jest.haste.config.js` from anywhere resolves consistently.
  rootDir: __dirname,

  // The core fix: keep the duplicated build/generated trees out of the haste
  // map so their identical package.json names never collide.
  modulePathIgnorePatterns: IGNORED_PATH_PATTERNS,

  // Belt-and-suspenders for `--watch` runs: the file watcher ignores the same
  // trees so editing a regenerated artifact never re-triggers the collision.
  watchPathIgnorePatterns: IGNORED_PATH_PATTERNS,

  // Final safety net: even if a duplicate name slips through (e.g. a tree not
  // covered above), do not hard-throw on a module-name collision in this
  // opt-in, diagnostics-only run. Equivalent collisions are otherwise just
  // warnings; this keeps the run from erroring while staying non-gate.
  haste: {
    throwOnModuleCollision: false,
  },

  // This config exists to crawl/diagnose the haste map cleanly, not to run a
  // suite. With no testMatch hits a bare invocation would otherwise exit
  // non-zero ("No tests found"); allow a clean exit so it stays a pure,
  // warning-free diagnostic.
  passWithNoTests: true,
};
