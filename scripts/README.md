# scripts/

Repo-level utility scripts. Anything here is meant to be invoked directly by a
developer or by CI — these are NOT part of any service's own `npm test` or
`npm run build` flow. They live at the monorepo root so they can reach across
package boundaries without baking a relative path into a service's
`package.json`.

Conventions every script in this directory follows:

- **Dependency-free where possible.** The Node guards (`*.js`) use only
  built-in `fs`, `path`, and `child_process`. The TS/Py scripts pull in only
  what their target subsystem already ships.
- **Single command to run.** Each script prints what it does, exits 0 on
  success, exits 1 on the first failure, and never requires interactive input.
- **Idempotent** — running the same script twice on a clean tree is safe.
- **Repo-root paths.** Each script resolves its own location via
  `path.resolve(__dirname, '..')` so it can be invoked from any cwd (CI,
  husky, `scripts/gate.js`, a developer's terminal).

The remainder of this document lists every script in this directory in
alphabetical order — purpose, when to run it, and a single-command example.

---

## `check-demo-maps-in-sync.js`

CI guard that fails (exit 1) if the two hand-maintained curated-YouTube maps
in the repo drift apart. Specifically, it keeps the backend's
`DEMO_URLS` map in `services/exercise-service/src/exercise.service.ts`
key-for-key + URL-for-URL in sync with the `GRANDFATHERED` block of the
mobile app's `CURATED_DEMOS` map in
`clients/mobile/src/constants/curatedDemos.ts`. Drift here would silently
show the user one video on the catalog screen and a different video on the
workout-player screen for the same exercise. The script parses both files as
plain text (no `require()` so no TypeScript dep), extracts every entry, and
prints a key-by-key diff before exiting on any (a) name in one but not the
other or (b) URL mismatch for a shared name. Wired into the top-level
`scripts/gate.js` (via `fs.existsSync`) so a green gate guarantees no drift.

```bash
node scripts/check-demo-maps-in-sync.js
```

## `check-mobile-secrets.sh`

Guard against accidentally bundling a real secret into the Expo client. Every
`EXPO_PUBLIC_*` env var and everything under `app.json`'s `expo.extra` ships
as plaintext inside the built app bundle, so an API key or secret placed
there is trivially extractable from a shipped build. This script greps
`clients/mobile/.env*` and `clients/mobile/app.json` for forbidden patterns
(any `EXPO_PUBLIC_*KEY` / `EXPO_PUBLIC_*SECRET`, Stripe `sk_live`/`pk_live`,
Anthropic `sk-ant-`, Google `AIza`) and fails the build if any are found. The
allow-list is documented inside the script.

```bash
bash scripts/check-mobile-secrets.sh
```

## `check-no-inline-401.js`

CI guard that fails (exit 1) if any `services/<svc>/src/**/*.ts` file
re-introduces an inline `{ statusCode: 401, error: 'Unauthorized', ... }`
literal instead of calling the canonical `sendUnauthorized` /
`sendUnauthorizedPayload` helpers from `@nightfuel/config`. Without this
guard the per-service 401 bodies drift, `jwtVerify()`'s internal `FST_JWT_*`
error codes leak per-service, and any future shape change has to be hand-
applied across N files. Two complementary regexes (a Bearer-specific one for
informative error messages, a generic `.send( + statusCode: 401` window for
everything else) plus a 5-line window pre-filter that skips lines next to a
canonical helper call. Files under `packages/config/` (where the canonical
body lives) and any `__tests__/` path (legitimate body-shape assertions) are
skipped. Internals are exposed on `module.exports.__test` for the companion
unit test in `scripts/__tests__/check-no-inline-401.test.js`.

```bash
node scripts/check-no-inline-401.js
```

## `cleanup-bloat.sh`

One-time cleanup that untracks (`git rm --cached`) roughly 800 MB of
generated and binary files that were committed by mistake — Prisma-generated
DLLs, `.tmp` artifacts, and a `pandoc-*.msi` installer. The files stay on
disk locally so `prisma generate` re-creates them per service; everyone else
cloning after the cleanup commit lands gets a slim checkout. Stages the
existing `.gitignore` so the same paths cannot be re-added. Run this AFTER
the in-flight bug-fix PR has merged and you're on a fresh branch off
`origin/main`.

```bash
bash scripts/cleanup-bloat.sh
```

## `gate.js`

Top-level CI gate — the single command that, when green, says the tree is
safe to merge. Wraps every other guard in this directory plus the monorepo's
typecheck and test runs. Steps run in order and the script exits 1 on the
FIRST failure with the failing step's name:

1. `node scripts/check-no-inline-401.js`
2. `node scripts/check-demo-maps-in-sync.js` (optional — guarded by
   `fs.existsSync` so the gate does not break if the file is not present yet)
3. `npm run check-types --silent` (root turbo typecheck across every package
   and service)
4. `node scripts/run-backend-tests.js` (per-service jest/vitest runs with one
   `PASS/FAIL` line per service)
5. `npm test --workspace=@nightfuel/mobile -- --ci --silent` (mobile jest,
   non-interactive)

Dependency-free — uses only Node built-ins (`fs`, `path`, `child_process`).
Steps stream their stdio straight to the gate's terminal so a CI log captures
everything verbatim.

```bash
node scripts/gate.js
```

## `load-test.ts`

Autocannon-based smoke load test against a running service. Targets a single
URL (default `http://localhost:3001/health`, override with `TEST_URL=`), runs
for 10 s with 100 concurrent connections, and prints requests/sec, average
latency, and throughput on completion. Use it to baseline a service before
shipping a performance-relevant change. Not part of `gate.js` — load tests
need a running backend and are too noisy for CI.

```bash
TEST_URL=http://localhost:3001/health npx tsx scripts/load-test.ts
```

## `run-backend-tests.js`

Discovers every `services/<svc>/` that has a `__tests__/` folder and a
`scripts.test` entry in its `package.json`, runs that service's tests via
the workspace's own npm script (so each service keeps its own jest/vitest
config), and prints exactly one line per service in a uniform shape:

```
PASS service-name: N/N suites passed
FAIL service-name: X suite(s) failing
```

On success the per-service log is swallowed (keeps the gate output readable);
on failure the captured stdout/stderr is dumped so the engineer can diagnose
immediately. Exits 0 only if every discovered service passes. Used by
`scripts/gate.js` step 4. Dependency-free.

```bash
node scripts/run-backend-tests.js
```

## `setup-dev.sh`

Robust monorepo install with retries. Exists because the contributor's
machine has had repeated `npm install` thrashes (resolution loops, partial
installs, `ENOTEMPTY` errors) and a plain `npm install` is not reliable. The
script does the install in a way that recovers from most of those, and
accepts a single optional argument to scope the install to one target
(`mobile`, `services`, `backend`, etc.) instead of the full monorepo. Read
`docs/PRODUCTION_READINESS.md` for context on the install flakiness.

```bash
bash scripts/setup-dev.sh           # full monorepo
bash scripts/setup-dev.sh mobile    # only clients/mobile
```

## `verify-ai-regional-prompt.py`

Verification harness for the AI pipeline's regional system prompt builder
(`services/ai-pipeline/app/prompts/prompts.py::build_user_context`). Walks
the supported region codes (`us`, `eu`, `ap`), invokes the prompt builder
with a representative skeleton and a minimal user-preferences blob, and
asserts that the region tag appears in the rendered prompt. Use it after
editing the prompt templates to catch a region that was accidentally dropped
from the switch.

```bash
python scripts/verify-ai-regional-prompt.py
```

## `verify-strength-cycles.ts`

Verification harness for `services/decision-engine/src/engine.ts`'s strength-
periodisation logic. Constructs a table of expected `(phase, week,
expectedVolume, expectedDeload)` rows for the HYPERTROPHY and STRENGTH cycles
(plus the fatigue / adherence override rows), runs each through the live
`DecisionEngine`, and prints a row-by-row PASS/FAIL. Use it after editing
the periodisation rules to catch a week that drifted off the planned curve.

```bash
npx tsx scripts/verify-strength-cycles.ts
```

---

## Adding a new script

1. Drop the file into `scripts/`. Choose `.js` (Node, dep-free) for CI
   guards, `.ts` for verification harnesses that import service source, and
   `.sh` for setup / cleanup tasks.
2. Add a top-of-file header comment describing purpose, exit conventions,
   and a one-line usage example — match the style of the existing scripts.
3. Append a section to this README in alphabetical order: one paragraph
   purpose, one fenced block with the single-command run example.
4. If the new script is a CI guard that should block merges, wire it into
   `scripts/gate.js` (and `fs.existsSync`-guard the step if other branches
   may not have the file yet).
