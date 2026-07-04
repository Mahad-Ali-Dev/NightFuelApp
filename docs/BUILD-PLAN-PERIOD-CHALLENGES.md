# Zeitra — Period + Challenges + Quota — Finalized Build Plan

_Scope confirmed by owner: **Period P1 + P2 + P3 (everything)**, **all themed challenges**, plus a
**per-user scan quota** and the **light-theme fix**. This doc is the source of truth for the build._

Status legend: ☐ todo · ◐ in progress · ☑ done
Deploy column: **M** = mobile-only (ships in the APK, no server deploy) · **B** = needs a backend deploy

---

## Guiding principles

1. **Extend, don't fork.** Everything below builds on systems that already exist:
   - Period → `services/user-service` cycle models (`CycleSymptomLog`, `sweepPeriodReminders`, `/v1/users/me/cycle/*`) + `app/(performance)/cycle.tsx` + `src/components/cycle/*`.
   - Challenges → the `(challenge)` AI-Coach flow (`useCoachStore`, `CoachPlan` → gated `ChallengeDay[]`, `covers.ts`, day-fill engine).
   - Quota → `@nightfuel/config` `AI_LIMITS[plan][feature]` + `assertWithinDailyLimit` + `AI_QUOTA_EXCEEDED` + `resolvePlan` (already gating Ria messages + plan generations).
2. **Dark stays byte-identical.** Every theme change routes through a hook that returns the _exact_ current
   hex in dark mode; only the light branch changes. Zero dark-mode regression is a hard requirement.
3. **Verify before deploy.** `npx tsc --noEmit` + jest (mobile), `ast.parse` (python), `npm run build`
   (landing). No prod deploy without explicit per-task authorization; always `git fetch` before any VPS checkout.
4. **Medical framing.** Cycle/pregnancy features carry the existing `MedicalDisclaimer`; predictions are
   "estimates," never diagnoses. Keeps us out of the Play "medical" category.

---

## Phase 1 — Light-theme fix  · Deploy: **M** · ◐ in progress

The cycle UI hardcodes `const CORAL = '#FF7A90'` / `LIME = '#A8CC3C'` locally in ~12 components, so light
mode renders low-contrast coral-on-white. Fix without touching dark.

- ☐ New hook `src/theme/useCycleAccents.ts` → `{ coral, lime, coralSoft, limeSoft }`.
  - Dark branch: exact `#FF7A90` / `#A8CC3C` (byte-identical — detect via `isLightHex(colors.background.primary)`).
  - Light branch: darkened for WCAG AA — coral `#D14E6E`, lime `#6E9A1E`; soft fills via `withAlpha`.
- ☐ Route every cycle component off its local literal through the hook: `CyclePhaseHero`, `CycleCalendar`,
  `LogPeriodCard`, `SymptomQuickLogCard`, `CycleHistoryCard`, `PhaseFoodsCard`, `PhaseCoachCard`,
  `PhaseRecommendationCards`, `CyclePhaseCard`, `MedicalDisclaimer`, `app/(performance)/cycle.tsx`.
- ☐ `StatusBar` style becomes theme-aware (`useThemedPalette().isDark ? 'light' : 'dark'`) on cycle +
  challenge screens (several hardcode `style="light"`).
- ☐ Sweep for any other hardcoded `style="light"` StatusBar on screens with a light background.
- **Verify:** `tsc`, jest, and a manual light/dark toggle screenshot of the cycle hub.

---

## Phase 2 — Period P1: tracking depth  · Deploy: **B**

Bring per-day logging to parity with Period Calendar / Flo. Backend: extend `user-service` cycle log model
(add columns) + widen the log/read endpoints. Mobile: a richer day-log sheet + a stats dashboard.

**Logging (expand the daily log):**
- ☐ Flow intensity: `spotting · light · medium · heavy`.
- ☐ Expanded symptom library (30+, categorized): _physical_ (cramps, headache, backache, tender breasts,
  bloating, fatigue, nausea, dizziness, joint pain), _mood_ (happy, calm, sensitive, anxious, irritable, low,
  high energy), _discharge / cervical mucus_ (dry, sticky, creamy, egg-white, watery, spotting), _digestion_
  (constipation, diarrhoea, gassy, cravings), _skin_ (acne, oily, dry).
- ☐ Mood log (multi-select, separate ring from symptoms).
- ☐ Sexual activity + protection (protected / unprotected / none) — for fertility signal, private.
- ☐ Water intake + free-text notes/diary per day.

**Stats dashboard (`CycleStatsCard` + a stats screen):**
- ☐ Avg cycle length · avg period length · shortest / longest · variability band.
- ☐ Cycle-length history bar chart (last 6–12 cycles) — flags irregularity.
- ☐ Symptom-frequency trends (which symptoms cluster in which phase).
- ☐ Fertile-window + ovulation-day surfaced from the existing `/cycle/forecast`.
- **Backend:** add `flow`, `mood[]`, `discharge`, `activity`, `water`, `note` to the cycle-log row;
  extend `logCycleSymptoms` / `getCycleSymptoms`; add a `/cycle/stats` aggregate endpoint.

---

## Phase 3 — Period P2: health modes  · Deploy: **B**

**Birth-control / pill tracking:**
- ☐ Method setup: pill (21/28-day pack), patch, ring, injection, IUD, implant, none.
- ☐ Daily pill reminder + streak; "taken / skipped / late" log; pack-position tracking for pill.
- ☐ Extend the reminder sweep to emit `cycle:pill-reminder` at the user's chosen time.

**Pregnancy mode:**
- ☐ Toggle that switches the cycle hub into a **pregnancy tracker**: week _N_ of 40, due-date countdown,
  trimester, weekly baby-size + weekly tip. Cycle predictions pause while active.
- ☐ Backend: `pregnancy` profile block (mode, dueDate, startDate) on the user cycle profile.

**Reminders engine expansion** (on top of the working `sweepPeriodReminders`):
- ☐ Ovulation / fertile-window opening · period-late nudge · "time to log" · water · pill (above).
  All honor the existing learned-IRREGULAR skip + cooldown pattern.

---

## Phase 4 — Period P3: advanced logging + platform  · Deploy: **B** (+ native for widget)

- ☐ **BBT** (basal body temperature) daily entry + line chart with coverline (ovulation confirmation).
- ☐ **Weight** logging + chart in the cycle context (reuse existing weight source if present).
- ☐ **Conception mode** (trying-to-conceive): highlight fertile window, ovulation-test (LH) logging,
  intercourse-timing hints. Complements Pregnancy mode.
- ☐ **Privacy lock**: PIN / biometric gate for the cycle section (expo-local-authentication).
- ☐ **Android home-screen widget**: next-period / current-phase countdown (native module → needs a dev build).
- ☐ **Partner sharing**: generate a share code so a partner can view cycle status/predictions (read-only).
  Actual send is user-initiated; no auto-share.
- ☐ **Data export**: CSV/JSON export of the user's own cycle history.

---

## Phase 5 — Themed challenges  · Deploy: **M** (+ image gen)

Extend the `(challenge)` flow with a **gallery of pre-built themed templates** (like Leap Fitness / competitor
challenge packs). Picking one seeds a `CoachPlan` from a curated day-split — reusing the existing day-fill,
gating, records, and reminders unchanged.

- ☐ `src/features/coach/challengeTemplates.ts` — `CHALLENGE_TEMPLATES` catalog: `{ id, title, subtitle, tag,
  hero (require), goal, duration, split: DaySkeleton[], accent }`.
- ☐ Themed gallery screen (hero-image cards + "Start challenge" CTA) — entry from the challenge tab + Home.
- ☐ "Start challenge" → build a `CoachPlan` from the template's split, then run the existing gated flow.
- ☐ Generate 6 cinematic hero images via Replicate (`_gen_train_images.py` + `.env.replicate`), bundle as
  `assets/images/challenge-<id>.jpg` (~30 KB each, matching the day-cover style).

**The 6 challenges:**
| # | Title | Goal | Duration | Angle |
|---|-------|------|----------|-------|
| 1 | Fat Loss Blitz | fat-loss | 15 / 30d | HIIT + cardio + calorie-controlled meals |
| 2 | **Night-Shift Reset** | maintain | 7d | circadian-aligned training + meal timing — Zeitra's USP |
| 3 | **Cycle Sync** (♀) | phase-based | cycle | workouts + meals synced to menstrual phase — ties Period ↔ Fitness |
| 4 | Build Muscle | muscle-gain | 30d | progressive strength split + high-protein |
| 5 | Better Sleep | maintain | 7d | evening mobility / wind-down + sleep nutrition |
| 6 | Core & Abs | fat-loss | 15d | core-focused split |

Challenges 2 & 3 are the differentiators no generic fitness app has — they fuse Zeitra's chrono-nutrition and
cycle data into the challenge itself.

---

## Phase 6 — Design refresh  · Deploy: **M**

- ☐ Cycle hub: phase ring + cleaner card hierarchy, fully theme-aware (light + dark parity).
- ☐ Challenge gallery/day cards: hero image + progress + CTA at competitor-grade polish.
- ☐ Consistent spacing/typography pass across the new surfaces.
- ☐ RiaPlanCards (chat meal/workout cards) light-mode accent polish: it renders in the
  theme-aware ai-coach modal but hardcodes coral `#FF7A90` / lime `#A8CC3C` filled CTAs +
  pill tints. Switch the workout card to `colors.accent.lime` (already theme-aware) and give
  the meal card a theme-aware coral (generalize `cycleAccentsForBackground` into a shared
  `accentPairForBackground`). Deferred from Phase 1 — it's filled buttons, not washed-out
  text, so lower priority than the cycle surface.

---

## Phase 7 — Per-user scan quota  · Deploy: **B**

Cap AI-vision + barcode scans per user — a Pro gate _and_ a per-user cost ceiling. Reuses the shared quota.

- ☐ Add `scans` to `AiFeature` + `AI_LIMITS` in `@nightfuel/config`
  (default free `3`/day, pro `30`/day; env `AI_FREE_SCANS_DAILY` / `AI_PRO_SCANS_DAILY`).
- ☐ Enforce `assertWithinDailyLimit(..., 'scans')` on `/food-vision` (AI photo) **and** the barcode lookup in
  the web service — same `resolvePlan` + `AI_QUOTA_EXCEEDED` (429) pattern as Ria / generations.
- ☐ Mobile: remaining-scans indicator on the camera/scan screen + a Pro-upsell sheet on 429 (mirror the
  existing Ria-quota UI). Ria "add meal" auto-adds are unaffected (they don't call vision).

---

## Cross-cutting / sequencing

- **Build order:** 1 (foundation) → 2 → 3 → 4 (period stack, each verifies before the next) → 5 → 6 (challenges
  + polish) → 7 (quota). Mobile-only phases (1, 5, 6) can ship in an APK without waiting on a deploy; backend
  phases (2, 3, 4, 7) batch into one deploy each to minimize prod touches.
- **Migrations:** phases 2–4 and 7 add Prisma columns/models → `prisma generate` + a migration per service;
  deploy via `git fetch` → `git checkout` → `docker compose up -d --build` (never skip the fetch).
- **⚠ Revenue blocker (unchanged):** the Pro gates here (scan quota, challenge gating, generations) only convert
  to money once **Play Billing is wired** — today `upgrade({tier})` grants Pro free. RevenueCat is the
  recommended path. This is the one thing standing between "feature-complete" and "1000 paid." Tracked separately.

---

_Generated as the finalized spec. Tasks #60–66 track these phases._
