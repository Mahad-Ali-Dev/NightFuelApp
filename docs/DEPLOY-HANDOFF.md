# Zeitra — Deploy Handoff (owner-gated steps)

**Single source of truth for everything the owner must run or provide _outside_ an
agent session.** Nothing in this document has been executed. Every item here was
deliberately left undone because it touches a live database, a paid third-party
account, or a signed native build — none of which an automated/agent session may do.

> ## ⛔ DO NOT RUN ANY COMMAND IN THIS DOC FROM AN AGENT SESSION
> Every command below is **owner-only**, run by a human against the **live VPS /
> production accounts**. Agents (including Claude Code) must treat this file as
> **read-only reference** and never execute, SSH, `docker compose exec`, run a
> migration/seed, hit a store API, or touch a build credential. The repo work is
> file-only by design. If you are an agent: stop here and hand this back to the owner.

The backend (16-service Docker stack + Postgres + Redis + Nginx) is brought up per
`docs/DEPLOY_VPS.md`. This handoff covers the deltas that doc does **not** auto-apply
plus the external accounts the app needs before real users.

Replace every `<PLACEHOLDER>` with a real value. Secrets are **never** committed —
they live only in the host env (`infra/docker/.env`) or the relevant provider console.

---

## Contents

1. [Three unapplied DB migrations](#1-three-unapplied-db-migrations)
2. [Recipe catalog re-seed](#2-recipe-catalog-re-seed)
3. [AI-call accounting — `aiGenerated` flag (SKETCH, not applied)](#3-ai-call-accounting--aigenerated-flag-sketch-not-applied)
4. [Payments — RevenueCat + App Store / Play product IDs](#4-payments--revenuecat--app-store--play-product-ids)
5. [Push delivery — EAS dev build + APNs/FCM](#5-push-delivery--eas-dev-build--apnsfcm)
6. [Fitness-watch native pairing — dev build required](#6-fitness-watch-native-pairing--dev-build-required)

---

## 1. Three unapplied DB migrations

**What.** Three services gained a new column / table this sprint. The migration
**files** are committed; whether they auto-apply on `docker compose up` depends on
the service's startup command (its `Dockerfile` `CMD`), which differs per service —
see the table. Run the explicit command below **only if** the column/table is missing
on your live DB (e.g. an already-running stack that you `git pull`-ed without
rebuilding/restarting that service).

**Why gated.** There is no database in CI or in an agent session, so nothing here was
executed against a real DB. Applying schema changes to the **live** database is an
owner-only, out-of-band action — the chat migration file even says so in its header.

| Service | New schema element | Migration file (committed) | How it reaches the DB on `up` | Manual command (only if missing) |
|---|---|---|---|---|
| `chat-service` | `conversations.request_state` (TEXT, default `'pending'`) + `messages.read_at` (TIMESTAMP, nullable) | `services/chat-service/prisma/migrations/20260619_chat_requests_readat/migration.sql` | `Dockerfile` `CMD` runs **`prisma migrate deploy`** → this migration applies automatically on (re)start | `docker compose exec chat-service npx prisma migrate deploy` |
| `community-service` | new `follows` table (`follower_id`, `following_id`, unique pair, index on `following_id`) | `services/community-service/prisma/migrations/20260619_follow/migration.sql` | `Dockerfile` `CMD` runs **`prisma migrate deploy`** → applies automatically on (re)start | `docker compose exec community-service npx prisma migrate deploy` |
| `user-service` | `user_profiles.is_private` (BOOLEAN, default `false`) | `services/user-service/prisma/migrations/20260619_user_isprivate/migration.sql` | `Dockerfile` `CMD` runs **`prisma db push`** (NOT migrate deploy — see drift note) → the column is reconciled from `schema.prisma` on (re)start | `docker compose exec user-service npx prisma db push --skip-generate --accept-data-loss` |

> ### Why user-service uses `db push`, not `migrate deploy`
> Repo migration-drift convention (see `services/user-service/Dockerfile` comment and
> `docs/P0_STATUS.md`): user-service's hand-written migrations historically omit
> columns the Prisma schema already has (e.g. `user_profiles.region`), so
> `migrate deploy` would leave the DB **out of sync** and queries fail with `P2022`.
> Its `Dockerfile` therefore syncs straight from `schema.prisma` with
> `prisma db push --accept-data-loss`. The `20260619_user_isprivate/migration.sql`
> file is kept as the human-readable record of the change; `db push` creates the
> `is_private` column because the field already exists in `schema.prisma`
> (`isPrivate Boolean @default(false) @map("is_private")`). chat-service and
> community-service do **not** have this drift, so they keep `migrate deploy`.

> ### ⛔ DO NOT run from an agent session
> These run `docker compose exec` **against the live VPS** stack. Owner-only, from the
> compose directory (`cd ~/zeitra/infra/docker`, or wherever the stack lives). Never
> from Claude Code or any automated session.

**Verification after applying (owner, on the VPS):**

```bash
# chat-service: both new columns present
docker compose exec postgres psql -U postgres -d chat_service \
  -c '\d conversations' -c '\d messages'

# user-service: is_private present
docker compose exec postgres psql -U postgres -d user_service -c '\d user_profiles'

# community-service: follows table present
docker compose exec postgres psql -U postgres -d community_service -c '\d follows'
```

(Adjust `-d <db>` / `-U <user>` to your actual Postgres connection — Supabase
deployments connect via the per-service `*_DATABASE_URL` instead of a local
`postgres` container.)

---

## 2. Recipe catalog re-seed

**What.** Re-seed (or top up) the meal-service recipe catalog — the 50 curated
recipes the mobile **Recipes** screen lists. Seeder:
`services/meal-service/src/seed-recipes.ts`.

**Why gated.** It writes rows to the live meal-service database. The seeder was made
**idempotent this sprint** (guard-by-title: for each recipe it does
`findFirst({ where: { title } })`, then **UPDATEs** the matched row or **CREATEs** a
new one — `Recipe` has no `@unique` on `title`, so a bare `upsert` would need a
user-gated migration). A second full pass therefore yields **zero net new rows**, so
it is safe to re-run. Idempotency is locked by
`services/meal-service/__tests__/seed-idempotent.test.ts` (cold DB → N creates / 0
updates; warm DB → 0 creates / N updates).

**Command — in-container (recommended; the stack is already running):**

```bash
# from infra/docker on the VPS
docker compose exec meal-service npm run seed:recipes
```

**Command — service-local (if running meal-service outside Docker):**

```bash
cd services/meal-service
npm run seed:recipes          # ts-node src/seed-recipes.ts
```

`npm run seed:recipes` maps to `ts-node src/seed-recipes.ts` (see
`services/meal-service/package.json`). It auto-runs only when invoked directly
(`require.main === module`), so importing the module in tests never writes to a DB.

> ### ⛔ DO NOT run from an agent session
> This writes to the **live** meal-service DB. Owner-only. Re-running is safe (no
> duplicates) but it is still a production write — never trigger it from an automated
> session.

---

## 3. AI-call accounting — `aiGenerated` flag (SKETCH, not applied)

**What (today's behavior).** The daily AI-generation quota in two services counts
**every** row a user created since UTC midnight, because neither table has a flag
marking a row as AI-generated vs. manually created:

- **exercise-service** — `services/exercise-service/src/index.ts` (~L366–369):
  ```ts
  const startOfUtcDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const usedToday = await prisma.workoutRoutine.count({
      where: { userId, createdAt: { gte: startOfUtcDay } },
  });
  ```
  This counts **all** `WorkoutRoutine` rows since UTC midnight (the source comment
  spells this out). A user manually creating a routine therefore **consumes AI quota**.

- **plan-service** — `services/plan-service/src/routes.ts` (~L98–100):
  ```ts
  const startOfUtcDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const usedToday: number = await (planService as any).prisma.dayPlan.count({
      where: { userId, createdAt: { gte: startOfUtcDay } },
  });
  ```
  Same pattern: **all** `DayPlan` rows since UTC midnight count, AI-generated or not.

**Why gated / why only a sketch.** Fixing this cleanly needs a real schema change
(a new column) on two production databases — an owner-only migration. It is **out of
scope for this in-repo sprint** and intentionally left as a documented sketch.

> ### ⚠️ NOT APPLIED — do NOT create migration files for this
> The SQL below is a **design sketch only**. It is **not** committed as a migration,
> **no** `prisma/migrations/` directory exists for it, and the Prisma schemas
> (`services/exercise-service/prisma/schema.prisma`,
> `services/plan-service/prisma/schema.prisma`) do **not** declare an `aiGenerated`
> field. Do not add it from an agent session — this is a future, owner-approved change.

**Sketch — the column the owner would add (NOT APPLIED):**

```sql
-- exercise-service DB — services/exercise-service/prisma/schema.prisma → model WorkoutRoutine (@@map("workout_routines"))
ALTER TABLE "WorkoutRoutine" ADD COLUMN "aiGenerated" BOOLEAN NOT NULL DEFAULT false;

-- plan-service DB — services/plan-service/prisma/schema.prisma → model DayPlan (@@map("day_plans"))
ALTER TABLE "DayPlan" ADD COLUMN "aiGenerated" BOOLEAN NOT NULL DEFAULT false;
```

> Note on table names: Prisma `@@map`s these models to snake_case
> (`workout_routines`, `day_plans`). The Prisma-model-named form above is shown to
> mirror the model; the actual `ALTER TABLE` the owner runs must target the real
> table name (`"workout_routines"` / `"day_plans"`). Either way this is a sketch.

**How the code would change once that column exists (future, owner-gated):**

1. The **generators** (the AI routine/plan creation paths) would set
   `aiGenerated: true` on the row they write; all other create paths leave the
   default `false`.
2. The two quota COUNTs above would add `aiGenerated: true` to the filter so only AI
   creations consume quota, e.g.:
   ```ts
   // exercise-service
   where: { userId, aiGenerated: true, createdAt: { gte: startOfUtcDay } }
   // plan-service
   where: { userId, aiGenerated: true, createdAt: { gte: startOfUtcDay } }
   ```

> ### ⛔ DO NOT run from an agent session
> Adding this column is a live migration on two databases plus a code change across
> generators and quota checks. Owner-only, and only after deciding to do it.

---

## 4. Payments — RevenueCat + App Store / Play product IDs

**What.** Create the in-app-purchase products and wire RevenueCat so the paywall and
subscription entitlements work. The app uses store-native IAP (Apple/Google), so the
products must be created in **each store** and mirrored in **RevenueCat**.

**Why gated.** Requires the owner's **Apple Developer**, **Google Play Console**, and
**RevenueCat** accounts and billing/banking details. None of these credentials are in
the repo (by design) and none can be created from a session.

**Owner steps:**

1. **App Store Connect** → My Apps → Zeitra → **Subscriptions**. Create the
   subscription group + products. Record each product ID:
   ```
   APPLE_PRODUCT_ID_MONTHLY=<e.g. app.zeitra.pro.monthly>
   APPLE_PRODUCT_ID_ANNUAL=<e.g. app.zeitra.pro.annual>
   APPLE_SHARED_SECRET=<App Store Connect → App Information → App-Specific Shared Secret>
   ```
2. **Google Play Console** → Zeitra → **Monetize → Subscriptions**. Create matching
   products:
   ```
   GOOGLE_PRODUCT_ID_MONTHLY=<e.g. zeitra_pro_monthly>
   GOOGLE_PRODUCT_ID_ANNUAL=<e.g. zeitra_pro_annual>
   GOOGLE_PLAY_SERVICE_ACCOUNT_JSON=<path to the Play service-account JSON>
   ```
3. **RevenueCat** → create the Zeitra project, add the iOS + Android apps, attach the
   App Store shared secret and the Play service-account JSON, and create an
   **entitlement** (e.g. `pro`) mapped to all four products. Record the public SDK keys:
   ```
   REVENUECAT_API_KEY_IOS=appl_<...>
   REVENUECAT_API_KEY_ANDROID=goog_<...>
   REVENUECAT_ENTITLEMENT_ID=pro
   ```
4. Put the **server-side** secrets into the host env (`infra/docker/.env` for the
   subscription-service: `APPLE_SHARED_SECRET`, `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`,
   and any `STRIPE_*` if web billing is enabled — see `docs/P0_STATUS.md` P0.3). The
   **public** RevenueCat SDK keys go into the mobile build's public env
   (`clients/mobile/.env`, `EXPO_PUBLIC_*`). Do **not** commit any of them.

> ### ⛔ DO NOT run from an agent session
> Creating store products, uploading banking info, and pasting live store secrets are
> all manual owner actions in external consoles. An agent cannot and must not do this.

---

## 5. Push delivery — EAS dev build + APNs/FCM

**What.** Enable real push notifications end to end (the circadian local-reminder
engine works in Expo Go, but **remote** push does not). Requires a **custom dev/prod
build** (not Expo Go) plus APNs (iOS) and FCM (Android) credentials.

**Why gated.** Remote push needs signed native builds and the owner's Apple/Google
push credentials — EAS build + store credential management, none of which run from a
session.

**Owner steps:**

1. **EAS build** — see `docs/EAS_SETUP.md`. Build a dev client / internal build (push
   does not work in Expo Go):
   ```bash
   cd clients/mobile
   eas login
   eas build --profile development --platform ios
   eas build --profile development --platform android
   ```
2. **iOS / APNs** — EAS manages the APNs key when you grant App Store Connect access:
   ```bash
   eas credentials -p ios          # create/attach the APNs key
   ```
3. **Android / FCM** — provide the FCM server credentials so EAS/Expo can deliver:
   ```bash
   eas credentials -p android      # attach the FCM (server) key / service account
   ```
4. Provide the push secrets the **notification-service** needs in the host env
   (`infra/docker/.env`) and confirm the device registers its Expo push token after
   login.

> ### ⛔ DO NOT run from an agent session
> `eas build` / `eas credentials` create signed binaries and manage Apple/Google push
> keys. Owner-only, on the owner's machine with their developer accounts. Never run
> these from an agent session.

---

## 6. Fitness-watch native pairing — dev build required

**What.** Pair a fitness watch / health source (Apple HealthKit, Google Health
Connect, or a wearable SDK). These rely on native modules + OS permission prompts that
**do not exist in Expo Go** — they require a custom dev/prod build.

**Why gated.** Same root cause as push: native capability + signed build + per-OS
entitlements. Cannot be exercised in Expo Go and cannot be built from a session.

**Owner steps:**

1. Build a custom dev client (Expo Go cannot load the native health modules):
   ```bash
   cd clients/mobile
   eas build --profile development --platform ios
   eas build --profile development --platform android
   ```
2. **iOS** — ensure the HealthKit entitlement + usage-description strings are present,
   then test the OS permission prompt on a physical device (HealthKit is unavailable
   in the simulator).
3. **Android** — ensure the Health Connect permissions are declared, then test the
   grant flow on a physical device with Health Connect installed.
4. Pair an actual watch/health source on-device and confirm data flows into the app.

> ### ⛔ DO NOT run from an agent session
> Requires a signed native build and on-device OS permission grants on the owner's
> hardware. An agent cannot build, install, or grant device permissions — owner-only.

---

## Quick checklist (all owner-only)

- [ ] Apply / confirm the 3 migrations on the live DBs (§1) — chat & community via
      `migrate deploy`, user via `db push`.
- [ ] Re-seed recipes if the catalog is empty/stale (§2) — safe to re-run.
- [ ] (Future, optional) Add the `aiGenerated` column + filter the quota COUNTs (§3) —
      **not applied; sketch only.**
- [ ] Create store IAP products + wire RevenueCat (§4).
- [ ] EAS dev build + APNs/FCM for remote push (§5).
- [ ] EAS dev build + on-device health permissions for watch pairing (§6).

_This document modifies no code and executes nothing. It links other files by path
only; it does not edit them._
