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

1. [Unapplied DB migrations](#1-unapplied-db-migrations)
2. [Recipe catalog re-seed](#2-recipe-catalog-re-seed)
3. [AI-call accounting — `aiGenerated` flag (migration files committed)](#3-ai-call-accounting--aigenerated-flag-migration-files-committed)
4. [Payments — RevenueCat + App Store / Play product IDs](#4-payments--revenuecat--app-store--play-product-ids)
5. [Push delivery — EAS dev build + APNs/FCM](#5-push-delivery--eas-dev-build--apnsfcm)
6. [Fitness-watch / health sync — dev build required (F31)](#6-fitness-watch--health-sync--dev-build-required-f31)
7. [Voice for Ria — EAS dev build + native STT/TTS (F30)](#7-voice-for-ria--eas-dev-build--native-stttts-f30)

---

## 1. Unapplied DB migrations

> **Update (sprints F25–F31):** three MORE migrations landed after the original five
> — see [§1b](#1b-newer-migrations-f25f31--cycle-tracker--period-log--health-samples)
> below. All three apply via `db push` (additive, nullable/defaulted), same as the
> user/exercise/plan rows here.

**What.** Five services/columns gained a new column / table this sprint. The migration
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
| `exercise-service` | `workout_routines.ai_generated` (BOOLEAN, NOT NULL, default `false`) | `services/exercise-service/prisma/migrations/20260620_workout_ai_generated/migration.sql` | `Dockerfile` `CMD` runs **`prisma db push`** (incomplete hand-written migrations — see drift note) → the `ai_generated` column is reconciled from `schema.prisma` on (re)start (the field is declared `aiGenerated Boolean @default(false) @map("ai_generated")`) | `docker compose exec exercise-service npx prisma db push --skip-generate --accept-data-loss` |
| `plan-service` | `day_plans.ai_generated` (BOOLEAN, NOT NULL, default `false`) | `services/plan-service/prisma/migrations/20260620_plan_ai_generated/migration.sql` | `Dockerfile` `CMD` runs **`prisma db push`** (drift — see `services/plan-service/Dockerfile` comment) → the `ai_generated` column is reconciled from `schema.prisma` on (re)start | `docker compose exec plan-service npx prisma db push --skip-generate --accept-data-loss` |

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
> exercise-service and plan-service ALSO use `db push` (their hand-written
> migrations are likewise incomplete — see each `Dockerfile` comment), so their new
> `ai_generated` columns are created from `schema.prisma` on (re)start; the
> `20260620_*_ai_generated/migration.sql` files are kept as the human-readable record.

> ### 🔴 CRITICAL — apply the two `ai_generated` migrations *together with this round's code*
> The exercise-service and plan-service `ai_generated` columns are **not optional**:
> this round's code makes the daily-quota **COUNT query reference the new column**, e.g.
> ```ts
> // exercise-service src/index.ts — POST /v1/exercises/routines/generate
> where: { userId, aiGenerated: true, createdAt: { gte: startOfUtcDay } }
> // plan-service src/routes.ts — POST /v1/plans/generate
> where: { userId, aiGenerated: true, createdAt: { gte: startOfUtcDay } }
> ```
> If you deploy the **code without the column** (e.g. `git pull` + restart a stack
> whose `db push` didn't run, or a Supabase DB that wasn't reconciled), that COUNT
> fails with Postgres **`column "ai_generated" does not exist`** (Prisma **`P2022`**),
> and the AI-routine / AI-plan generate endpoints **error on every call**. So: bring up
> each service in a way that runs its `db push` (rebuild/restart so the `Dockerfile`
> `CMD` executes), **or** run the manual `db push` command in the table above, in the
> **same deploy** as this round's code — never code-first. Applying the column early is
> harmless (default `false`; pre-existing routines/plans simply stop counting toward the
> AI cap, the user-favourable direction).

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

# exercise-service: workout_routines.ai_generated present
docker compose exec postgres psql -U postgres -d exercise_service -c '\d workout_routines'

# plan-service: day_plans.ai_generated present
docker compose exec postgres psql -U postgres -d plan_service -c '\d day_plans'
```

(Adjust `-d <db>` / `-U <user>` to your actual Postgres connection — Supabase
deployments connect via the per-service `*_DATABASE_URL` instead of a local
`postgres` container.)

---

### 1b. Newer migrations (F25–F31) — cycle tracker + period log + health samples

**What.** The cycle-tracker (F25/F28) and watch/health-sync (F31) sprints added cycle
columns + two new tables. All are **additive** (nullable / defaulted columns, brand-new
tables) and all apply via **`db push`** on (re)start of the owning service — same
mechanism as the user/exercise/plan rows above. The `migration.sql` files are kept as
the human-readable record.

| Service | New schema element | Migration file (committed) | Manual command (only if missing) |
|---|---|---|---|
| `user-service` | `user_profiles` cycle columns (`cycle_tracking_enabled`, `last_period_start_date`, `avg_cycle_length_days`, `avg_period_length_days`, `cycle_regularity`, `hormonal_contraception`) + `user_status.cycle_phase` | `services/user-service/prisma/migrations/20260621_cycle_tracker/migration.sql` | `docker compose exec user-service npx prisma db push --skip-generate --accept-data-loss` |
| `user-service` | new `period_logs` table (`id`, `user_id` idx, `start_date`, `end_date?`, `created_at`) | `services/user-service/prisma/migrations/20260621_period_log/migration.sql` | (same `user-service db push` as above — one push applies both) |
| `sleep-service` | new `health_samples` table (append-only wearable archive; all metric cols nullable/defaulted) + **F33** `@@unique(userId,kind,startTime,source)` for re-sync idempotency | `services/sleep-service/prisma/migrations/20260621_health_samples/migration.sql` | `docker compose exec sleep-service npx prisma db push --skip-generate --accept-data-loss` |
| `community-service` | **F33** new `post_likes` table (`user_id`, `post_id`, `@@unique([userId,postId])`) — makes likePost idempotent / un-gameable | `services/community-service/prisma/migrations/20260621_post_like/migration.sql` | `docker compose exec community-service npx prisma db push --skip-generate --accept-data-loss` |

> **F33 idempotency unique constraints.** F33 also added `@@unique([userId,startDate])`
> to `period_logs` and `@@unique(userId,kind,startTime,source)` to `health_samples`.
> Both land on the **brand-new, not-yet-applied** F25–F31 tables, so the constraint is
> created with the table on first `db push` — **no existing rows, data-loss-free**.
> (community-service uses `db push` per its `Dockerfile`, same as the others.)

> ### 🔴 Apply these with the F28/F29/F31 code (endpoints query the new tables)
> - **`period_logs`** — `POST /v1/users/me/cycle/period` and `GET /v1/users/me/cycle/history`
>   query this table. Until it exists those routes **500**. The cycle *phase* in
>   onboarding/profile still works without it (it derives from the `user_profiles`
>   columns), but logging/history needs the table.
> - **`health_samples`** — `POST /v1/sleep/health-sync` writes here. Until the table
>   exists the endpoint errors. Lower urgency: that route is only called by the **native**
>   app after the watch dev build (§6), so it can land alongside the EAS rollout — but
>   apply it before users sync a watch.
> - **`sleep-service` now uses `db push`** (its `Dockerfile` `CMD` was switched from
>   `migrate deploy` to `prisma db push --skip-generate --accept-data-loss` this round,
>   matching the user-service drift precedent) — so the `health_samples` table is created
>   from `schema.prisma` automatically on a rebuild/restart of sleep-service.

**Verify after applying:**

```bash
# user-service: cycle columns on user_profiles + period_logs table
docker compose exec postgres psql -U postgres -d user_service -c '\d user_profiles' -c '\d period_logs'
# sleep-service: health_samples table
docker compose exec postgres psql -U postgres -d sleep_service -c '\d health_samples'
# community-service: post_likes table (F33)
docker compose exec postgres psql -U postgres -d community_service -c '\d post_likes'
```

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

## 3. AI-call accounting — `aiGenerated` flag (migration files committed)

**What (now implemented in-repo).** The daily AI-generation quota in two services used
to count **every** routine/plan a user created since UTC midnight, so creating one
**manually** burned the AI cap. This sprint added an `aiGenerated` flag to both tables;
only AI-generated rows now consume quota. The **code change is committed** and the
**migration files exist** — the only owner-gated step left is applying the new column
on the two live DBs, which is covered by **[§1](#1-five-unapplied-db-migrations)**
(both apply via `db push` on (re)start, or the manual command in that table).

What shipped, per service:

- **exercise-service** — `services/exercise-service/prisma/schema.prisma` declares
  `aiGenerated Boolean @default(false) @map("ai_generated")` on `WorkoutRoutine`;
  migration `services/exercise-service/prisma/migrations/20260620_workout_ai_generated/migration.sql`.
  The generator (`POST /v1/exercises/routines/generate`) calls
  `createRoutine(userId, routineData, /* aiGenerated */ true)`; the manual route
  (`POST /v1/exercises/routines`) leaves the default `false`. The quota COUNT in
  `src/index.ts` now filters on the flag:
  ```ts
  const usedToday = await prisma.workoutRoutine.count({
      where: { userId, aiGenerated: true, createdAt: { gte: startOfUtcDay } },
  });
  ```

- **plan-service** — `services/plan-service/prisma/schema.prisma` declares the matching
  `aiGenerated` flag on `DayPlan`; migration
  `services/plan-service/prisma/migrations/20260620_plan_ai_generated/migration.sql`.
  The AI plan generator sets `aiGenerated: true`; other create paths leave `false`;
  the quota COUNT in `src/routes.ts` filters on the flag the same way:
  ```ts
  where: { userId, aiGenerated: true, createdAt: { gte: startOfUtcDay } }
  ```

> Note on table names: Prisma `@@map`s these models to snake_case, so the real columns
> are `"workout_routines"."ai_generated"` and `"day_plans"."ai_generated"` — which is
> exactly what each `migration.sql` `ALTER TABLE` targets.

> ### 🔴 The column MUST ship with this code — see [§1](#1-five-unapplied-db-migrations)
> Because the quota COUNT above references `ai_generated`, deploying this code against a
> DB that does not yet have the column makes the generate endpoints fail with Prisma
> `P2022` (`column "ai_generated" does not exist`). Apply the migration **in the same
> deploy** as this round's code — never code-first. Full rationale + the apply/verify
> commands live in §1's **CRITICAL** callout. This was previously a "sketch, not
> applied" note; it is now implemented, so the old "do NOT create migration files"
> warning no longer applies.

> ### ⛔ DO NOT run from an agent session
> Applying the column is a live `db push` against two production databases. Owner-only —
> the repo work (schema fields, migration files, code) is file-only; the apply step is
> the owner's, per §1. Never run a migration/`db push` from Claude Code or any
> automated session.

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

## 6. Fitness-watch / health sync — dev build required (F31)

**What.** Real wearable/health sync (Apple HealthKit on iOS, Google Health Connect on
Android), READ-ONLY: sleep, steps, heart rate, resting HR, HRV, active energy, workouts.
The architecture is **fully built and gate-verified** — the backend ingestion endpoint
(`POST /v1/sleep/health-sync`), the digital-twin wiring (synced sleep + HRV/resting-HR
move `avgSleepQuality`/`fatigueLevel`, which the decision-engine reads), and the native
adapters behind the existing `getHealthSyncAdapter()` seam. The native modules are
**lazy-loaded behind the seam**, so the app runs fine without them (honest "needs a dev
build" state) until you build with them installed.

**Why gated.** Native modules + OS permission prompts + the Apple HealthKit entitlement
**do not exist in Expo Go** and cannot be built/granted from a session.

**Owner steps:**

1. **Install the native deps** (already declared in `clients/mobile/package.json`):
   ```bash
   cd clients/mobile
   npm install   # pulls @kingstinct/react-native-healthkit, react-native-health-connect, expo-dev-client
   ```
2. **Remove the gate-only shims** now that the real packages resolve:
   - delete `clients/mobile/src/types/health-native.d.ts` (ambient module shims), and
   - remove the two `react-native-health*-stub` entries from `clients/mobile/jest.config.js` `moduleNameMapper`.
   (They exist only so the gate stays green without the native packages — see the file headers.)
3. **Build a custom dev client** (Expo Go cannot load the native health modules):
   ```bash
   eas build --profile development --platform ios
   eas build --profile development --platform android
   ```
4. **iOS** — the HealthKit config plugin + entitlement + read-only `NSHealthShareUsageDescription`
   are already in `app.json`; ensure the **HealthKit entitlement is on the provisioning
   profile**, then test the OS permission prompt on a **physical device** (HealthKit is
   unavailable in the simulator). Note: `NSHealthUpdateUsageDescription` was intentionally
   **dropped** (the app is read-only) to avoid an App Store "where's the write feature?" rejection.
5. **Android** — the Health Connect plugin + `health.READ_*` permissions are already in
   `app.json`; test the grant flow on a physical device with Health Connect installed.
6. Apply the **`health_samples`** migration ([§1b](#1b-newer-migrations-f25f31--cycle-tracker--period-log--health-samples))
   before users sync, then pair a watch/health source on-device and confirm data flows
   into the app and that synced sleep/HRV shift the twin.

> ### ⛔ DO NOT run from an agent session
> Requires a signed native build and on-device OS permission grants on the owner's
> hardware. An agent cannot build, install, or grant device permissions — owner-only.

---

## 7. Voice for Ria — EAS dev build + native STT/TTS (F30)

**What.** "Talk to Ria, Ria replies in voice" — on-device speech-to-text
(`expo-speech-recognition`, interim + final transcripts) feeding the existing Ria chat
pipeline, and text-to-speech (`expo-speech`) speaking the reply. Built behind a
`getVoiceAdapter()` seam (same gate-safe pattern as health sync): the app runs fine
without the native modules (mic shows an honest "needs a dev build" state); the feature
is **opt-in / default-off**, so text chat is unchanged until a user enables it.

**Why gated.** The STT/TTS native modules + the iOS mic/speech permission prompts don't
exist in Expo Go and need a signed dev build + on-device testing.

**Owner steps:**

1. **Install the native deps** (already in `clients/mobile/package.json`):
   ```bash
   cd clients/mobile
   npm install   # pulls expo-speech, expo-speech-recognition
   ```
2. **Remove the gate-only shims** now that the packages resolve:
   - delete `clients/mobile/src/types/voice-native.d.ts`, and
   - remove the two `expo-speech*-stub` entries from `clients/mobile/jest.config.js` `moduleNameMapper`.
3. **Build a custom dev client** (`eas build --profile development -p ios|android`).
   The `expo-speech-recognition` config plugin + iOS `NSMicrophoneUsageDescription`/
   `NSSpeechRecognitionUsageDescription` are already in `app.json`.
4. On a **physical device**, open Ria, tap the mic, grant the mic + speech-recognition
   permissions, confirm interim transcript → send → spoken reply, and that barge-in
   (TTS stops when you start a new turn) works.

> ### ⛔ DO NOT run from an agent session
> Signed native build + on-device permission grants — owner-only, same as §5/§6.

---

## Quick checklist (all owner-only)

- [ ] Apply / confirm the original 5 migrations on the live DBs (§1) — chat & community
      via `migrate deploy`; user, exercise & plan via `db push`.
- [ ] Apply the 4 newer migrations (§1b) — `cycle_tracker` + `period_log` (user-service
      `db push`), `health_samples` (sleep-service `db push`), and `post_like`
      (community-service `db push`). `period_logs` is needed for cycle logging/history;
      `health_samples` before any watch sync; `post_likes` makes likes idempotent (F33).
- [ ] 🔴 Apply the exercise-service **and** plan-service `ai_generated` columns (§1/§3)
      **in the same deploy as this round's code** — the quota COUNT now references the
      column, so code-without-column makes the AI generate endpoints fail (`P2022`).
- [ ] Re-seed recipes if the catalog is empty/stale (§2) — safe to re-run.
- [ ] Create store IAP products + wire RevenueCat (§4).
- [ ] EAS dev build + APNs/FCM for remote push (§5).
- [ ] Watch/health sync (§6): `npm install` the 3 native libs, delete the health shims,
      EAS dev build, HealthKit entitlement, on-device permission grants.
- [ ] Voice for Ria (§7): `npm install` the 2 native libs, delete the voice shims, EAS
      dev build, on-device mic/speech permission grants.

_This document modifies no code and executes nothing. It links other files by path
only; it does not edit them._
