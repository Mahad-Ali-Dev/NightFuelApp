# Zeitra — Session Digest (returning-owner handoff)

**One accurate read for the returning owner.** What shipped across F1–F15, the exact
GREEN gate state, the complete owner-gated remaining list, what the F16 audit found,
and the explicit no-silent-drop disposition of the three F15-dropped sweeps.

> This document is **pure docs** — it modifies no code, executes nothing, and changes
> no behaviour. `node scripts/gate.js` stays green.
>
> For everything the owner must **run or provide outside an agent session** (live-DB
> migrations, store/RevenueCat accounts, EAS builds, push/health credentials), the
> **single source of truth is [`docs/DEPLOY-HANDOFF.md`](./DEPLOY-HANDOFF.md)** — that
> file's commands are **owner-only**. This digest summarises and cross-links it; it does
> not duplicate the migration table (see [§4](#4-user-gated-remaining-owner-only--do-not-execute)
> and [§8](#8-deploy-handoff-freshness-check)).

---

## Contents

1. [What shipped F1–F15](#1-what-shipped-f1f15)
2. [Current GREEN state](#2-current-green-state)
3. [Flows verified correct in code](#3-flows-verified-correct-in-code)
4. [User-gated remaining (owner-only — DO NOT execute)](#4-user-gated-remaining-owner-only--do-not-execute)
5. [What F16 found](#5-what-f16-found)
6. [F15-dropped sweep disposition (no silent drop)](#6-f15-dropped-sweep-disposition-no-silent-drop)
7. [Flows H / I / J + writers — traced-and-correct (no-finding ledger)](#7-flows-h--i--j--writers--traced-and-correct-no-finding-ledger)
8. [DEPLOY-HANDOFF freshness check](#8-deploy-handoff-freshness-check)

---

## 1. What shipped F1–F15

Feature and hardening work landed and locked by tests across the F1–F15 rounds:

- **Chat + social.** 1:1 direct messages; Instagram-style **message-requests** with
  accept / decline plus a **one-message-until-accepted lock** (a requester may send a
  single opening message; further messages are blocked until the recipient accepts);
  **follow / unfollow** social graph; **public / private profiles** (a private profile
  is visible only to accepted followers).
- **AI daily-quota metering across ALL generate endpoints.** chat-service Ria chat,
  exercise-service `POST /v1/exercises/routines/generate`, and plan-service
  `POST /v1/plans/generate` all meter a per-user, per-day AI cap. They share **one** wire
  contract: on exhaustion they return
  **`429 { error: 'ai_quota_exceeded', limit, plan, resetsAt }`**. The mobile client
  parses that exact shape with **`parseAiQuotaError`** (`clients/mobile/src/api/ai.ts:104`)
  and surfaces a **distinct Upgrade state** (not a generic error) — any non-quota error
  (network / 5xx / other 4xx / a 429 with a different `error` code) returns `null` and
  falls through to generic handling.
- **Plan → meal one-tap.** `log-planned-meal` logs a planned meal in one tap and stamps
  **`planMealId` provenance** so a logged meal is traceable back to the plan slot it came
  from.
- **Real AI exercise cards.** AI-suggested exercises resolve a real `libraryId` against
  the seeded ExerciseDB library and fall back to **curated demos** when no library match
  exists (curated demo maps are gate-guarded — see `check-demo-maps-in-sync`).
- **Recipes seed (idempotent).** The meal-service recipe seeder is guard-by-title
  (UPDATE matched / CREATE new), so a re-run yields **zero net new rows**; locked by
  `services/meal-service/__tests__/seed-idempotent.test.ts`.
- **Watch-sync scaffold.** Wiring for a future fitness-watch / health source (native
  pairing itself is owner-gated — see [§4](#4-user-gated-remaining-owner-only--do-not-execute)).
- **Circadian depth.** Anchor-sleep reconcile, light-exposure plan, entrainment score,
  a time-aware **Today** timeline, and a **Next-shift** card.
- **App-wide Aurora design system.** `GlassCard` / `CtaButton` primitives from
  `@/components/ui` with **HARD gate guards**: `check-no-inline-glass`,
  `check-no-inline-cta`, `check-no-inline-401`, `check-shared-logger`,
  `check-error-handler-registered` (see [§2](#2-current-green-state)).
- **Finite-guard / honest-state / a11y hardening.** Numeric inputs are finite-guarded,
  screens distinguish loading vs error vs empty vs data ("honest state"), and a11y roles
  / labels / state were added; plus per-service **input-bounds & redaction** tests on the
  backend.

---

## 2. Current GREEN state

`node scripts/gate.js` (a.k.a. `npm run gate`) passes. The gate is the single
merge-safety source of truth (`scripts/gate.js`). It runs **12 HARD steps** in order
(first non-zero exit fails the gate), then **2 informational reporting steps** whose exit
codes are deliberately ignored.

**12 HARD steps (in order):**

1. `check-no-inline-401`
2. `check-demo-maps-in-sync`
3. `check-error-handler-registered`
4. `check-shared-logger`
5. `check-no-inline-glass`
6. `check-no-inline-cta`
7. `check-aurora-coverage-baseline` (anti-regression ratchet vs
   `scripts/aurora-coverage-baseline.json`; GlassCard / StatusBar floor — CtaButton
   reported but never thresholded)
8. `harness-self-tests` (`scripts/__tests__/*.test.js` — locks `parseSuiteSummary`'s
   fail-closed contract and the inline-401 detectors)
9. `check-types (turbo)` — root `turbo` typecheck across all packages + services
10. `@nightfuel/config build` — `tsc -b packages/config --force` (force-emit so the
    backend redaction suites resolve a fresh `packages/config/dist`; runs **before**
    `test:backend`)
11. `test:backend` — `scripts/run-backend-tests.js` (one PASS/FAIL line per service)
12. `test:mobile` — `npm test --workspace=@nightfuel/mobile -- --ci --silent`

**2 informational steps (exit code ignored, never block the gate):**

- `aurora-coverage (informational)` — GlassCard / CtaButton / StatusBar adoption metric
- `demo-urls-sample (informational)` — sampled curated demo-URL rot check (offline →
  skip; dead URL → note; all 200 → OK)

**Test surface that is green:**

- **Backend** — **16 services** + **2 packages** (`@nightfuel/config`,
  `@nightfuel/dates`) all pass. The 16 services: `ai-pipeline`, `auth-service`,
  `chat-service`, `circadian-engine`, `community-service`, `decision-engine`,
  `exercise-service`, `meal-service`, `notification-service`, `plan-service`,
  `progress-service`, `shift-service`, `sleep-service`, `state-service`,
  `subscription-service`, `user-service`.
- **Mobile** — **143 suites / 5281 tests** pass (as of F16).

---

## 3. Flows verified correct in code

The F16 audit re-walked the major flows. **Flows A, D, E, F are correct in code.**

- **Flows D and F** (the follow / private-profile + chat-request paths) are correct in
  the code, but **render "dark" until their migrations apply** — specifically the
  chat-service `request_state` + `read_at`, community-service `follows`, and user-service
  `is_private` columns/tables (see
  [§4](#4-user-gated-remaining-owner-only--do-not-execute)). That is **expected**, **not
  a bug**: the code is correct; it simply needs the schema present on the live DB. Apply
  the migrations and the flows light up.

---

## 4. User-gated remaining (owner-only — DO NOT execute)

> **Everything in this section is owner-only.** Do **not** run any of it from an agent
> session. The authoritative commands, the per-service `migrate deploy` vs `db push`
> rationale, and the verification SQL live in
> [`docs/DEPLOY-HANDOFF.md`](./DEPLOY-HANDOFF.md). This list is the checklist; that doc
> is the source of truth.

1. **Five unapplied DB migrations** — files committed, **not applied** (no DB in CI / in
   an agent session). Exact apply commands per service:
   - **chat-service** — `conversations.request_state` (TEXT, default `'pending'`) +
     `messages.read_at` (TIMESTAMP, nullable):
     `docker compose exec chat-service npx prisma migrate deploy`
   - **community-service** — new `follows` table (`follower_id`, `following_id`, unique
     pair, index on `following_id`):
     `docker compose exec community-service npx prisma migrate deploy`
   - **user-service** — `user_profiles.is_private` (BOOLEAN, default `false`):
     `docker compose exec user-service npx prisma db push --skip-generate --accept-data-loss`
     (db push, not migrate deploy — migration-drift convention; see DEPLOY-HANDOFF §1)
   - **exercise-service** — `workout_routines.ai_generated` (BOOLEAN, NOT NULL, default
     `false`):
     `docker compose exec exercise-service npx prisma db push --skip-generate --accept-data-loss`
   - **plan-service** — `day_plans.ai_generated` (BOOLEAN, NOT NULL, default `false`):
     `docker compose exec plan-service npx prisma db push --skip-generate --accept-data-loss`

   > 🔴 **CRITICAL — the two `ai_generated` columns MUST ship in the same deploy as this
   > round's code.** This round's quota **COUNT** now filters on `aiGenerated: true`
   > (`where: { userId, aiGenerated: true, createdAt: { gte: startOfUtcDay } }` in both
   > exercise-service and plan-service). Deploying the **code without the column** makes
   > that COUNT fail with Postgres `column "ai_generated" does not exist` (Prisma
   > **`P2022`**), so the AI-routine and AI-plan generate endpoints **error on every
   > call**. Apply the column **with** the code, never code-first. Applying it early is
   > harmless (default `false`; pre-existing rows simply stop counting toward the cap —
   > the user-favourable direction).

2. **Recipe catalog re-seed** — `docker compose exec meal-service npm run seed:recipes`
   (or `npm run seed:recipes` in `services/meal-service`). **Idempotent** — safe to
   re-run; a full pass yields zero net new rows.

3. **Payments — RevenueCat + store products.** Create the IAP products in App Store
   Connect and Google Play, mirror them in RevenueCat, create the `pro` entitlement, and
   record the product IDs / shared secret / service-account JSON / public SDK keys per
   DEPLOY-HANDOFF §4. Requires the owner's Apple / Google / RevenueCat accounts.

4. **Push delivery — EAS dev build + APNs/FCM.** Remote push needs a custom dev/prod
   build (not Expo Go) plus APNs (iOS) and FCM (Android) credentials. See DEPLOY-HANDOFF
   §5.

5. **Fitness-watch native pairing — dev build required.** HealthKit / Health Connect
   rely on native modules + OS permission prompts that do not exist in Expo Go; needs a
   custom dev build and on-device grants. See DEPLOY-HANDOFF §6.

6. **On-device Expo Go visual pass.** A final manual run-through of the app on a physical
   device (layout / theming / interaction sanity) — the one check that cannot be done
   from CI or a headless session.

---

## 5. What F16 found

The F16 audit produced **three confirmed code findings** plus **one honest-state gap**.
Each is owned and fixed by its **own dedicated work-item** (this digest is the docs item
and touches no code).

| # | Finding | Location | Fix status |
|---|---|---|---|
| 1 | **Modal "Finish" dead-end** — the active-workout modal's Finish button used a bare `router.back()`, which silently discarded the just-completed set data instead of persisting it and routing to the completion summary. | `clients/mobile/app/(modals)/active-workout.tsx` (the `handleFinish` handler, ~L401, wired to the **Finish** button ~L500) | **Fixed** by its dedicated item — `handleFinish` now persists + invalidates and `router.replace`s to `/training/complete` (see the explanatory comment ~L396–L399 and the `router.replace(...)` ~L479). |
| 2 | **Shifts "upcoming" stale** — saving a new shift did not refresh the dashboard Next-shift countdown. The writer invalidated `['current-shift']` + `['shifts']`, but the dashboard card reads a **separate** key, `['shifts-upcoming']` (`app/(tabs)/index.tsx`, off `api/shifts.list`), which was invalidated nowhere — so the card stayed stale until refocus/staleTime. (`NextShiftCard.tsx` / `nextShift.ts` are **pre-existing, correct consumers** that recompute on every render — they were not the bug.) | `clients/mobile/app/(modals)/log-shift.tsx` (the mutation `onSuccess`) | **Fixed** by its dedicated item — `onSuccess` now also invalidates `['shifts-upcoming']` (~L81); locked by `clients/mobile/__tests__/screens/log-shift.test.tsx`. |
| 3 | **Meal progress split-brain** — two surfaces could disagree on the same consumed/remaining meal-progress number (a single source-of-truth issue). | meal-progress surface (owned by its dedicated meal-progress item) | **Fixed** by its dedicated item. |
| 4 | **Subscription honest-state gap** (settings) — as found, `SubscriptionScreenContent` destructured only `{ data: sub, isLoading }` with **no `isError` branch**, so when `getStatus` failed `sub` was `undefined`, `activeTierId` silently fell back to `'free'`, and the screen rendered as a healthy Free-tier page — misleading a paying user. | `clients/mobile/app/(settings)/subscription.tsx` (the `useQuery` ~L123 and the `'free'` fallback ~L128) | **Fixed** by the dedicated subscription item — the query now destructures `isError` + `refetch` (~L123) and renders an honest retry surface (GlassCard + "Try Again" → `refetch`, ~L320) instead of defaulting to Free; locked by `clients/mobile/__tests__/screens/subscription.test.tsx`. See [§6 SETTINGS](#6-f15-dropped-sweep-disposition-no-silent-drop). |

> File:line references are recorded for the returning owner's orientation and are
> **approximate ("~L…") as of F16** — concurrent edits within a round can shift exact
> line numbers by a few lines, so navigate by symbol (the handler / query / button)
> rather than the precise number. All four findings were **fixed and locked by tests
> this round** (see the Fix-status column); this digest is the docs item and changed no
> code itself.

---

## 6. F15-dropped sweep disposition (no silent drop)

Three test-coverage sweeps were dropped from the F15 plan. They are **not** silently
dropped — here is the disposition, with **cited evidence**.

### COMMUNITY — ALREADY COVERED (add nothing)

Comprehensive screen/state coverage already exists; no new community tests are warranted.
Evidence (under `clients/mobile/__tests__/`):

- `screens/achievements.test.tsx`
- `screens/challenges.states.test.tsx`
- `screens/community-feed.states.test.tsx`
- `screens/community-feed.robustness.test.tsx`
- `screens/community.feed.states.test.tsx`
- `screens/community.counts.test.tsx`
- `screens/leaderboard.states.test.tsx`
- `screens/leaderboard.test.tsx`
- `screens/requests.test.tsx`
- `screens/userProfile.test.tsx`
- `screens/userProfile.listPerf.test.tsx`
- `screens/community-postDetail.states.test.tsx`

### NUTRITION — ALREADY COVERED (add nothing)

Comprehensive coverage already exists; no new nutrition tests are warranted. Evidence
(under `clients/mobile/__tests__/`):

- `screens/encyclopedia.test.tsx`
- `screens/fasting.test.tsx`
- `screens/grocery.test.tsx`
- `screens/log-meal.test.tsx`
- `screens/log-meal.numericGuard.test.tsx`
- `screens/log-planned-meal.test.tsx`
- `screens/planner.quota.test.tsx`
- `screens/recipes.test.tsx`
- `screens/nutrition.errorStates.test.tsx`
- `screens/nutrition.macroGuards.test.tsx`

### SETTINGS — ONE REAL GAP (`subscription.tsx`)

Settings had exactly **one** real gap:
**`clients/mobile/app/(settings)/subscription.tsx`**. As found, the only test was the
**client-level** `clients/mobile/__tests__/api/subscriptions.test.ts` (no screen test),
and the screen had **no `isError` branch** — it read only `{ data, isLoading }`
(~`subscription.tsx:123`) and fell back to `'free'` on error (~L128; see
[§5](#5-what-f16-found) #4). **Closed this round by the dedicated subscription
work-item**: an honest-state `isError` retry branch was added (~L320), and a new screen
test `clients/mobile/__tests__/screens/subscription.test.tsx` now locks the loading /
error-retry / resolved-active-tier states.

---

## 7. Flows H / I / J + writers — traced-and-correct (no-finding ledger)

A consolidation-round adversarial trace re-walked four more flows — **H** (sleep →
circadian), **I** (community `likedByMe`), **J** (settings / watch) — plus the **meal /
shift / hydration cache-invalidation writers**. **Every one was found correct in code.**
This is an **honest no-finding ledger**: it exists so a reviewer can see these were
adversarially traced and found correct, **not skipped**. No code was changed for any of
them, no test was added, and no churn was manufactured — recording the disposition is the
entire deliverable. (File:line references are **approximate ("~L…")** and shift by a few
lines under concurrent edits — navigate by symbol.)

### H — sleep → circadian: correctly shift-derived, NOT sleep-fed

Logging sleep correctly does **not** (and must **not**) invalidate the circadian model,
because the model is **derived from the active shift, not from logged sleep**:

- **Mobile.** `clients/mobile/src/api/circadian.ts` `getModel()` (~L115) computes a fresh
  model purely from `getCurrentShift()` → `POST /v1/circadian/profile`. It reads **no**
  sleep log, so logged sleep cannot feed the `['circadian-model']` query — `log-sleep`
  correctly leaves that key alone.
- **Engine.** `services/circadian-engine` (a Python service) listens **only** on the
  `nightfuel:shift:shift-created` / `shift-updated` Redis streams
  (`app/events.py` ~L60) and runs `compute_profile(shift)` off the shift payload alone —
  there is **no** subscription to any sleep stream. The token "sleep" appears in that
  service only as profile **output** fields (`app/models.py` — e.g. the computed
  sleep-window / melatonin recommendations) and as `asyncio.sleep(…)` in the listener's
  retry-backoff; **none** of those is a logged-sleep **input**. So the model is
  shift-derived by design.
- **Disposition.** Correct as-is. The genuine sleep gap was the **`['sleep-analytics']`**
  surface, which is captured as its **own** item(s) — not here. H is **not** a defect.

### I — community `likedByMe`: correct-in-code, dark-until-migration

The feed cannot show a per-viewer "liked" heart yet, and that is a **schema** limitation,
not a code defect:

- **Client (intentional + documented).** `clients/mobile/app/(tabs)/community.tsx` sets
  `const liked = false` (~L368) behind an explicit comment (~L363–L368): the feed `Post`
  shape has **no** per-viewer flag, so the heart's color/glyph swap is wired off this
  single source of truth and will light up automatically **once the API returns a
  `likedByMe` field**. Inventing a field access there would break `tsc`.
- **Like mutation is fully correct.** The same screen's `likeMutation` (~L132–L160) does
  an optimistic **count** bump (`onMutate` `setQueryData`), a **snapshot rollback** on
  error (`onError` restores `ctx.previous`), and an `onSettled` **reconcile** (invalidate
  `['community-feed']`). Only the count moves — never a fabricated `likedByMe`.
- **Backend has no per-user like edge.** `services/community-service/src/community.service.ts`
  `likePost` (~L120) stores a like as a **bare counter** (`data: { likes: { increment: 1 } }`),
  and `prisma/schema.prisma` models `Post.likes` as a scalar `Int @default(0)` (~L18) with
  **no `PostLike` join table**. `likedByMe` therefore **cannot** be wired without a new,
  **user-gated UNAPPLIED migration** (a `PostLike(userId, postId)` edge).
- **Disposition.** Correct in code, **dark until that migration** — the same posture as
  flows D / F in [§3](#3-flows-verified-correct-in-code). **Not** a fixable code defect;
  the blocker is the unapplied community join-table migration, not the client or service
  code.

### J — settings / watch: honest no-op + correct, minimal invalidations

- **Notification preferences.** `clients/mobile/app/(settings)/notification-preferences.tsx`
  is the **sole** reader of `['notification-preferences']` (`prefsQuery` ~L137) and its
  `saveMutation` (~L148) **persists** via `saveNotificationPreferences`; the edited `prefs`
  is the local working copy, so there is no second consumer to reconcile and **no**
  invalidate is needed. Correct.
- **Notifications list.** `clients/mobile/app/(settings)/notifications.tsx` mark-read
  `onSuccess` invalidates `['notifications']` (~L40) — the complete set for that screen.
  Correct.
- **Devices / watch.** `clients/mobile/app/(settings)/devices.tsx` uses a **documented
  HONEST no-op** health adapter (~L24–L48): `connect()` / `syncNow()` resolve to
  `{ status: 'unavailable', reason }` (they never throw) and the screen surfaces that
  reason **verbatim** — it **never fakes a "Connected" state**. Real HealthKit /
  Health-Connect / BLE adapters slot in behind the same interface in a later dev build
  (native pairing is owner-gated — see
  [§4](#4-user-gated-remaining-owner-only--do-not-execute) #5). Correct.

### Writers — meal / shift / hydration cache invalidation: already complete

- **Meal (4 writers).** The four meal writers route through the shared
  `clients/mobile/src/utils/invalidateMealAndProgress.ts`, which invalidates `['meal-logs']`
  + `['daily-progress']` + `['today-progress']` together — the dual-ring contract that
  prevents the meal-progress split-brain ([§5](#5-what-f16-found) #3). Complete.
- **Shift.** `clients/mobile/app/(modals)/log-shift.tsx` `onSuccess` (~L74–L81) invalidates
  all three shift keys — `['current-shift']`, `['shifts']`, **and** `['shifts-upcoming']`
  (the dashboard Next-shift key fixed in [§5](#5-what-f16-found) #2). Complete.
- **Hydration.** Both `['today-progress']` hydration writers invalidate the **complete**
  set — the dashboard quick-add (`app/(tabs)/index.tsx` ~L249) and the hydration screen
  (`app/(performance)/hydration.tsx` ~L39) each invalidate `['today-progress']` only,
  which is correct because hydration affects **only** `DailyProgress.hydrationActual`.
  (The separate `src/hooks/useHydration.ts` is self-consistent on its own `['progress',
  'today']` key — it reads and writes the same key — so it is **not** a drift either.)
  Complete.

> **No-finding, by design.** This section adds **zero** code and **zero** tests — it is a
> ledger entry, not a fix. The only `likedByMe`-shaped follow-up is the **unapplied,
> user-gated community `PostLike` migration** (owner-only — see
> [§4](#4-user-gated-remaining-owner-only--do-not-execute)); everything else above is
> correct as it stands. This digest remains pure docs and `node scripts/gate.js` stays
> green (nothing the gate inspects was touched).

---

## 8. DEPLOY-HANDOFF freshness check

**Re-verified against [`docs/DEPLOY-HANDOFF.md`](./DEPLOY-HANDOFF.md) as of F16 — in
sync.** Confirmed by reading that file (not duplicated here):

- Its **gate-step list** matches `scripts/gate.js` (the same 12 HARD + 2 informational
  steps summarised in [§2](#2-current-green-state)).
- Its **5-row migration table** (DEPLOY-HANDOFF §1) still matches the committed migration
  files and this digest's [§4](#4-user-gated-remaining-owner-only--do-not-execute):
  - chat-service → **`migrate deploy`** (`request_state` + `read_at`)
  - community-service → **`migrate deploy`** (`follows` table)
  - user-service → **`db push`** (`is_private`)
  - exercise-service → **`db push`** (`workout_routines.ai_generated`)
  - plan-service → **`db push`** (`day_plans.ai_generated`)
- The **`ai_generated` CRITICAL note** ("apply the column with this round's code, never
  code-first — else the quota COUNT fails with Prisma `P2022`") is present in
  DEPLOY-HANDOFF §1 and §3.

`docs/DEPLOY-HANDOFF.md` remains the **owner-only single source of truth** for migrations
and external accounts. This digest cross-links it and does not restate its commands.

---

_This document modifies no code and executes nothing. It references other files by path
only; it does not edit them. `node scripts/gate.js` stays green._
