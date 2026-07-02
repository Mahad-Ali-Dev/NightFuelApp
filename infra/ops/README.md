# Zeitra ops — backups, watchdog, hardening runbook

Produced from the 2026-07-02 production audit. Everything here targets the
single-VPS compose deployment (`infra/docker/`).

## What runs where

| Concern | Mechanism | Where |
|---|---|---|
| DB backups | `pg-backup.sh` nightly cron (04:00) → `/home/deploy/backups/YYYY-MM-DD/` | VPS |
| Uptime alerts | `health-watchdog.sh` cron (*/5) → email via Resend on failure/recovery | VPS |
| Edge rate limit | `limit_req` zones in the gateway `nginx.conf` (20 r/s per IP global, 5 r/s on `/v1/auth`) | gateway container |
| DB password | `${POSTGRES_PASSWORD}` from `infra/docker/.env` (fallback only for local dev) | VPS `.env` |

## Cron installation (one time, on the VPS)

```bash
chmod +x /home/deploy/nightfuel/infra/ops/*.sh
crontab -l 2>/dev/null | { cat; \
  echo '0 4 * * * /home/deploy/nightfuel/infra/ops/pg-backup.sh >> /home/deploy/backups/pg-backup.log 2>&1'; \
  echo '*/5 * * * * /home/deploy/nightfuel/infra/ops/health-watchdog.sh >> /home/deploy/backups/watchdog.log 2>&1'; } | crontab -
```

## Restore a database

```bash
cd /home/deploy/nightfuel/infra/docker
gunzip -c /home/deploy/backups/<DATE>/nightfuel_auth.dump.gz \
  | docker compose exec -T postgres pg_restore -U postgres -d nightfuel_auth --clean --if-exists
```

Test restores periodically (into a scratch DB: `createdb scratch && pg_restore -d scratch ...`).

## Rotate the Postgres password

1. `openssl rand -base64 24` → NEWPASS
2. In the running cluster: `docker compose exec -T postgres psql -U postgres -c "ALTER USER postgres PASSWORD 'NEWPASS';"`
3. Set `POSTGRES_PASSWORD=NEWPASS` in `infra/docker/.env`
4. `docker compose up -d` (recreates services with the new URLs; ~1–2 min blip)
5. Verify: `docker compose ps` all healthy + `curl https://api.zeitra.app/health`

(The postgres container's own `POSTGRES_PASSWORD` env is only read on FIRST
init of an empty volume — step 2 is what actually changes it.)

## Still on the list (needs owner accounts / later scale)

- **Cloudflare in front of zeitra.app + api.zeitra.app** — free tier = CDN + WAF + edge DDoS. Owner action: add site on cloudflare.com, move the two DNS records behind the proxy (orange cloud), SSL mode "Full (strict)".
- **External uptime pinger** (UptimeRobot free) on `https://api.zeitra.app/health` — covers the watchdog's whole-box-down blind spot.
- **Sentry** — create a project, then wire `SENTRY_DSN` (privacy policy already discloses it).
- Offsite backup sync (rclone to object storage) — backups currently live on the same disk.
- At scale: Redis-backed rate limits → service replicas; managed/replicated Postgres; per-container memory limits.
