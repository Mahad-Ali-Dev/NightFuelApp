# Deploy the Zeitra backend to your own VPS

This brings up the **entire API backend** (Postgres + Redis + Nginx gateway + 16
services) with one Docker Compose command, so the mobile app's login, onboarding,
meals, exercises, AI, etc. all work against your server instead of a dead
`api.zeitra.app`.

> **You do NOT need the web client for mobile testing.** `nginx` only depends on
> the 16 API services, so `docker compose up -d --build nginx` skips the heavy
> Next.js build and starts only what the phone talks to.

---

## 0. What you need

| Item | Notes |
|------|-------|
| **VPS** | Ubuntu/Debian recommended. **≥ 4 GB RAM** (8 GB comfortable) — it builds 16 Node images. On 2 GB add swap (see Troubleshooting). |
| **Root/sudo SSH access** | To install Docker and open the firewall. |
| **A domain (optional but recommended)** | e.g. `api.zeitra.app` → your VPS IP. Needed for HTTPS/TLS. Without it you can test over `http://<vps-ip>` from Android Expo Go only. |
| **Anthropic API key (optional)** | For real AI plans/coach. Without it the AI pipeline returns canned demo text — everything else still works. |

---

## 1. Install Docker on the VPS

```bash
# Ubuntu/Debian — official convenience script
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER          # so you can run docker without sudo
newgrp docker                          # apply the group now (or re-login)
docker --version && docker compose version
```

## 2. Get the code onto the VPS

**Option A — git (if you have the repo on GitHub):**
```bash
git clone <your-repo-url> nightfuel
cd nightfuel
```

**Option B — copy from this machine (no remote needed):** from your PC
```bash
# from the folder that contains the repo, on your local machine
scp -r D:\nightfuel\repo  user@<vps-ip>:~/nightfuel
# then on the VPS:  cd ~/nightfuel
```

## 3. Configure secrets

```bash
cd ~/nightfuel/infra/docker
cp .env.production.example .env
nano .env          # fill in the values below
```

Minimum to set:
```bash
# REQUIRED — generate with:  openssl rand -base64 48
JWT_SECRET=<paste-a-long-random-string>

# OPTIONAL — real AI. Leave as-is for canned demo responses.
ANTHROPIC_API_KEY=sk-ant-...
```
Everything else (Stripe, VAPID, Apple) can stay as placeholders for testing — those
features degrade gracefully.

## 4. Build & launch (API only — what the mobile app needs)

```bash
cd ~/nightfuel/infra/docker
docker compose --env-file .env up -d --build nginx
```
First build takes ~5–15 min (16 services). Watch progress:
```bash
docker compose logs -f --tail=50
```
Each service runs `prisma migrate deploy` on start, so the database schema is
created automatically on first boot — no manual migration step.

> Want the marketing/legal website too? Also run:
> `docker compose --env-file .env up -d --build web` (heavier; not needed for the app).

## 5. Verify it's up

```bash
# gateway health (from the VPS)
curl -i http://localhost/health            # -> 200 OK

# an actual service through the gateway
curl -i http://localhost/v1/auth/health    # -> 200 (or a JSON body)

# from your laptop, replace with the VPS IP
curl -i http://<vps-ip>/health
```
Open port 80 (and 443 if using TLS) in the firewall:
```bash
sudo ufw allow 80/tcp && sudo ufw allow 443/tcp && sudo ufw allow OpenSSH && sudo ufw enable
```

## 6. Point the mobile app at your VPS

Create `clients/mobile/.env` on **your dev machine** (where you run `expo start`):

```bash
# HTTPS (after step 7) — works in Expo Go AND production builds:
EXPO_PUBLIC_NF_API_BASE_URL=https://api.yourdomain.com

# OR quick HTTP test (Android Expo Go only — iOS blocks cleartext):
EXPO_PUBLIC_NF_API_BASE_URL=http://<vps-ip>
```
The API client keeps the `/v1/...` prefix automatically for these URLs (it only
strips `/v1` for the `:3000/api` dev-gateway pattern), which is exactly what Nginx
expects. Then restart Metro:
```bash
# in clients/mobile
npx expo start --clear
```
Re-scan the QR — register/login now hits your VPS.

## 7. (Recommended) Domain + HTTPS

The built app blocks cleartext HTTP (`usesCleartextTraffic:false` / iOS ATS), so for
anything beyond an Android Expo Go smoke test you want TLS. Easiest is **Caddy** as a
TLS-terminating reverse proxy in front of Nginx (auto Let's Encrypt):

1. Point an `A` record: `api.yourdomain.com → <vps-ip>`.
2. Add a Caddy container (or host Caddy) with:
   ```
   api.yourdomain.com {
       reverse_proxy localhost:80
   }
   ```
   Caddy fetches + renews the cert automatically. (Or use `certbot --nginx` if you
   prefer Nginx-native TLS — then add a `443 ssl` server block to `nginx.conf`.)
3. Set `EXPO_PUBLIC_NF_API_BASE_URL=https://api.yourdomain.com` (step 6).

## 8. Security hardening (before real users)

- **Do NOT expose Postgres/Redis publicly.** In `docker-compose.yml`, remove the
  `ports: ["5432:5432"]` and `["6379:6379"]` mappings (services reach them over the
  internal Docker network anyway). Only Nginx (80/443) should be public.
- Change the Postgres password from the default `postgrespassword` (update it in the
  compose `POSTGRES_PASSWORD` **and** every `*_DATABASE_URL`).
- Rotate `JWT_SECRET` to a fresh random value (you did this in step 3).
- Provide real `STRIPE_*`, `VAPID_*`, and `APPLE_SHARED_SECRET` before enabling those
  features in production.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Build killed / OOM on a small VPS | Add swap: `sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile`. Then rebuild. |
| A service restart-loops | `docker compose logs <service>` — usually a missing env var or it can't reach Postgres. Confirm `postgres` is `healthy`: `docker compose ps`. |
| `relation does not exist` errors | A migration didn't run. `docker compose exec <service> npx prisma migrate deploy`. For a pre-existing DB see `docs/P0_STATUS.md` baselining note. |
| Phone can't reach it | Firewall (step 5) + confirm `curl http://<vps-ip>/health` works from your laptop, not just the VPS. |
| iOS Expo Go won't connect over http | Expected (ATS). Use HTTPS (step 7). |

---

## One-glance command summary

```bash
# on the VPS
curl -fsSL https://get.docker.com | sudo sh && sudo usermod -aG docker $USER && newgrp docker
cd ~/nightfuel/infra/docker
cp .env.production.example .env && nano .env      # set JWT_SECRET
docker compose --env-file .env up -d --build nginx
curl -i http://localhost/health
# on your dev machine: set clients/mobile/.env EXPO_PUBLIC_NF_API_BASE_URL, then `npx expo start --clear`
```
