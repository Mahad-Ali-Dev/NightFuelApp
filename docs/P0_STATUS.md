# P0 (Production Blockers) — Status

Tracks the P0 items from the production-readiness review: what was fixed in code,
and what still needs an owner (credentials, decisions, or infra access).

_Last updated: 2026-06-04_

---

## ✅ Fixed in code (verified)

### P0.1 — Clean-build break (the "18/18 passing" badge was false on a fresh clone)
**Root cause:** `*.tsbuildinfo` files were committed (despite being in `.gitignore`).
On a fresh clone, stale incremental state told `tsc` "already emitted" so it skipped
writing the `.d.ts` files for `@nightfuel/types`, and every downstream package failed.
A second issue: services build with bare `tsc` but their Prisma client (gitignored)
was never generated on a clean checkout.

**Changes:**
- Untracked all committed `*.tsbuildinfo` (`git rm --cached`); they stay gitignored.
- Prepended `prisma generate &&` to the `build` script of all 13 Prisma-backed services.
- `turbo.json` `build.outputs` now includes `dist/**` (was `.next/**` only → service
  build output wasn't being cached).
- Fixed `clients/web/app/dashboard/messages/page.tsx`: wrapped the `useSearchParams()`
  consumer in `<Suspense>` (it broke `next build` prerendering; the other two pages
  using `useSearchParams` already had the boundary).

**Verified:** `turbo run build` from a fully clean state → **18/18 successful**.

### P0.2 — Missing Prisma migrations (3 services)
`notification-service`, `progress-service`, `subscription-service` had **no**
`prisma/migrations/`. Their Dockerfiles ran `prisma migrate deploy`, which found
nothing and created no tables.

**Changes:**
- Generated baseline `20260604000000_init` migrations via `prisma migrate diff`
  (offline, no DB). **Verified identical** to each service's existing hand-written
  `create_all.sql`, so they're safe for existing databases.
- Rewrote `notification-service/Dockerfile` — it was **completely broken**: it used
  `pnpm` + `pnpm-workspace.yaml` + `pnpm-lock.yaml`, none of which exist in this
  npm-based repo (it would fail at the first `COPY`). It now mirrors the working
  `turbo prune` + npm pattern used by every other service, and its `CMD` now actually
  runs `prisma migrate deploy` (the old CMD skipped it).
- Moved `prisma` from devDependencies → dependencies in `notification-service`.

> ⚠️ **Baselining existing databases:** For any DB that already has these tables
> (created earlier via `create_all.sql`), `migrate deploy` will error with "table
> already exists." Baseline first, per service:
> ```bash
> npx prisma migrate resolve --applied 20260604000000_init
> ```
> Fresh/empty databases need no baselining — `migrate deploy` just creates everything.

> The `create_all.sql` files and `update_db_sqls.js` (which hardcodes a foreign dev
> path) are now superseded by real migrations and can be deleted once prod is baselined.

### P0.4 — Invalid / inconsistent Claude model IDs
Three different model strings were hardcoded across the AI pipeline, and the streaming
telemetry reported `claude-sonnet-4-6` while the code actually called Haiku.

**Changes:**
- New single source of truth: `services/ai-pipeline/app/llm_config.py` — env-configurable
  with current valid defaults (`claude-sonnet-4-6` for quality, `claude-haiku-4-5-20251001`
  for fast; OpenAI fallbacks). Documented in `.env.example`.
- `plan_generator`, `audit_generator`, `coach_chat_stream` all reference it; the
  deprecated `claude-3-5-sonnet-20240620` is gone and the telemetry model now matches
  the model actually invoked.

### P0.5 (partial) — Web legal pages
`/privacy`, `/terms`, `/support` did not exist (Apple + legal requirement).

**Changes:**
- Added all three Next.js routes; `/privacy` and `/terms` render `docs/PRIVACY.md` /
  `docs/TERMS.md` (copied into `clients/web/content/` for deploy self-containment),
  stripping the internal "Legal review required" note. `/support` lists contact emails
  + FAQ. All three **prerender as static** (verified in `next build`).

> Keep `clients/web/content/{privacy,terms}.md` in sync with `docs/` (canonical source).

---

## ⛔ Still requires the owner (cannot be done from code)

### P0.2 — Run baselining on existing prod DBs
See the baselining note above. One `migrate resolve --applied` per service, per DB,
before the first `migrate deploy` against an already-populated database.

### P0.3 — Provision production secrets (none are in the repo by design)
Set per-service in the host (Railway/etc.). Compose currently falls back to dev
placeholders (`dev-secret-change-in-prod`, `sk_test_placeholder`, `mock-key`, VAPID
placeholders) — **none are production-safe.**
- [ ] `JWT_SECRET` — `openssl rand -base64 32`
- [ ] 13× `*_DATABASE_URL` / `*_DIRECT_URL` (Supabase, per service)
- [ ] `REDIS_URL` (Upstash)
- [ ] `ANTHROPIC_API_KEY` (ai-pipeline) — without a real key the pipeline silently
      returns canned demo text via a `"mock-key"` short-circuit
- [ ] `OPENAI_API_KEY` (embeddings/fallback)
- [ ] `STRIPE_SECRET_KEY` (live) + `STRIPE_WEBHOOK_SECRET` + price IDs
- [ ] `APPLE_SHARED_SECRET` + `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` (subscription-service)
- [ ] `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` — `npx web-push generate-vapid-keys`
- [ ] **Rotate the leaked Stitch GCP key** (scrubbed from history but never revoked) —
      GCP Console → APIs & Services → Credentials.

### P0.5 — `.well-known` Team ID / SHA + CSP hardening + deploy
- [ ] Replace `REPLACE_WITH_APPLE_TEAM_ID` in
      `clients/web/public/.well-known/apple-app-site-association` (Apple Developer → Membership).
- [ ] Replace `REPLACE_WITH_SHA256_FINGERPRINT_FROM_EAS` in
      `clients/web/public/.well-known/assetlinks.json` (`eas credentials -p android`
      after the first Android build).
- [ ] Harden CSP in `clients/web/next.config.js` for prod: re-enable HSTS and
      `upgrade-insecure-requests` (currently commented out), drop `ws://localhost:*`
      from `connect-src`, and tighten/remove `'unsafe-inline'`/`'unsafe-eval'` for
      scripts. **Test thoroughly — Next.js may need `'unsafe-inline'` for styles;
      verify the app still loads before shipping.**
- [ ] Deploy `clients/web` and point `nightfuel.app` DNS at it; point
      `api.nightfuel.app` at the nginx gateway. Verify the legal/well-known URLs return
      200 with the right content-type.
- [ ] Add footer links to `/privacy` and `/terms` on the landing page (polish).

---

## 🔎 Needs a Docker build to confirm (I can't run Docker here)
- The `notification-service` Dockerfile rewrite and the 3 services' `migrate deploy`
  CMDs are correct by inspection but were not built. Run:
  `docker compose -f infra/docker/docker-compose.yml build notification-service progress-service subscription-service`
- `.env.example` port map is stale vs `docker-compose.yml` (sleep/sub swapped;
  `STATE_PORT`/`DECISION_PORT` missing) — reconcile before prod env setup (this is a
  P2 item from the review, noted here so it isn't lost).
