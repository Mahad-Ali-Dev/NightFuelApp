# Deploy runbook — Period phases (2/3/4) + scan quota (7)

_Staged, NOT executed. Prod deploys require explicit per-task authorization from the owner.
Nothing here has run. All schema changes are additive + nullable/defaulted → **zero-downtime,
no data loss** (`prisma db push` adds columns/tables without touching existing rows)._

## What ships

| Service | Change | Migration? |
|---|---|---|
| **user-service** | Period P1/P2/P3 columns on `CycleSymptomLog` + `UserProfile`, new `PillLog` model, new routes (`/cycle/health`, `/cycle/pill`), GDPR purge/export cover `PillLog` | **Yes** — `prisma db push` (additive) |
| **clients/web** (Next.js) | Scan-quota enforcement on `/api/food-vision` + `/api/food-search` (barcode) | No DB — Redis counter |
| **packages/config** | `scans` AiFeature + limits (free 3 / pro 30/day) | No — rebuilt by Docker |

Mobile changes ship in the **next APK** (EAS), not a server deploy.

## Preconditions (once, before deploy)

1. **Push the branch** with all phase work (clean push — the gitignore already excludes the 345 MB assets/screenshots/secrets):
   `git add -A && git commit && git push origin autonomous-sprints`
2. On the VPS, the **web container** needs env in `/home/deploy/nightfuel/infra/docker/.env` (compose already references them as `${VAR:-}`):
   - `JWT_SECRET` — **must equal** the value the other services already use (web verifies the mobile access token). It's already in the VPS `.env`; just confirm the web service reads the same one.
   - `REDIS_URL=redis://redis:6379` and `SUBSCRIPTION_SERVICE_URL=http://subscription-service:3010` — internal, defaulted in compose; no secret.
   - Optional: `AI_FREE_SCANS_DAILY` / `AI_PRO_SCANS_DAILY` to tune the caps.
   No new secrets are introduced; nothing secret is committed.

## Deploy sequence (on the VPS — `ssh zeitra-vps`)

> **CRITICAL (deploy gotcha):** always `git fetch` FIRST, then verify the host file actually changed before rebuild — a stale `origin` ref silently redeploys old code.

```sh
cd /home/deploy/nightfuel
git fetch origin                                  # <-- never skip; stale ref = old code
git checkout origin/autonomous-sprints -- \
  services/user-service clients/web packages/config infra/docker/docker-compose.yml
# sanity: confirm the new code is actually on disk before building
grep -q "pill_logs" services/user-service/prisma/schema.prisma && echo "user-service OK"
grep -q "scans" packages/config/src/ai-quota.ts && echo "config OK"

cd infra/docker
# 1) user-service migration (additive, no data loss). Run prisma db push in the container:
docker compose run --rm user-service npx prisma db push
# 2) rebuild + restart the changed services:
docker compose up -d --build user-service web
```

## Verify (after)

```sh
# user-service up + new routes wired
curl -s -o /dev/null -w '%{http_code}' https://api.zeitra.app/health          # 200
# scan quota: 3 photo scans then the 4th returns 429 ai_quota_exceeded (free tier)
# (exercise via the app, or a scripted call with a real free-tier token)
docker compose logs --tail=50 user-service | grep -iE "listening|error"
docker compose logs --tail=50 web | grep -iE "ready|error"
```

## Mobile (separate)

Rebuild the APK via EAS so the Period P1/P2/P3 UI, challenge gallery, and scan-quota paywall
reach devices. Uses the existing EAS token (sourced from a transient file, then deleted — never
committed):

```sh
cd clients/mobile && eas build -p android --profile apk
```

## Rollback

- Schema is additive → no rollback needed for data. To revert code: `git checkout <prev-sha> -- <paths>` then `docker compose up -d --build`.
- Scan quota is env-tunable to effectively-unlimited (`AI_FREE_SCANS_DAILY=100000`) without a redeploy if it ever misbehaves; the gate also fails open on a Redis outage.

---
_Owner authorization required before running any of the above against prod._
