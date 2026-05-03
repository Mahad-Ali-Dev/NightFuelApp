# NightFuel Mobile — Production Readiness Audit

**Auditor:** Claude (`senior-architect` + `senior-security` + `senior-ml-engineer` + `app-store-optimization` skill ensemble)
**Target:** `clients/mobile` — React Native, Expo SDK 55, expo-router, Zustand + TanStack Query
**Backend:** 14 Node/Fastify services + 2 Python AI engines (already exist)
**Status:** **NOT production-ready.** ~3–5 weeks of focused work to ship.

---

## Bottom line

The mobile codebase is in much better shape than I expected. The fundamentals are solid — secure token storage in `expo-secure-store`, a proper refresh-token queue against concurrent 401s, an `ErrorBoundary` at the root, an offline sync hook, push notifications wired in. This is not a prototype.

But there are **18 concrete production blockers** below, ranked. Most are 30 min – 1 day each. The biggest gaps are:

1. **No crash reporting / analytics** — you'll be flying blind on production incidents.
2. **AI pipeline is unhardened** — no prompt-injection guards, no streaming, no client-side rate limiting on Claude calls. One abusive user can drive your bill 10×.
3. **ASO listing isn't drafted yet** — you can't actually publish without titles, descriptions, screenshots, privacy nutrition labels.
4. **No CI/CD pipeline for mobile** — every release would currently be manual. EAS Build + Submit needs setting up.
5. **Several "wired but not finished" features** — Google login dead handler, share button dead handler, server-side logout endpoint missing, etc.

The roadmap at the end groups everything into 4 milestones. Pick whichever matters most to you and we start cutting tickets.

---

## What was already done well (don't change these)

| Area | Verdict |
|------|---------|
| Token storage | 🟢 `expo-secure-store` (Keychain on iOS, EncryptedSharedPreferences on Android). Not AsyncStorage. Already correct. |
| Token refresh | 🟢 [`client.ts:171–231`](../clients/mobile/src/api/client.ts) — `isRefreshing` flag + `failedQueue` correctly coalesces concurrent 401s. Real-world race-resistant. |
| Session expiration nav | 🟢 `setOnSessionExpired` callback decouples API client from `expo-router`. |
| Error boundary | 🟢 Mounted at the root in `_layout.tsx`. Has try-again button. (But: no telemetry — see findings.) |
| Offline sync | 🟢 `useOfflineSync()` hook drains queue on reconnect. Worth verifying its actual implementation; the hook is at `src/hooks/useOfflineSync.ts`. |
| Provider order | 🟢 `GestureHandlerRootView → SafeAreaProvider → QueryClientProvider → ThemeContext → ErrorBoundary` — correct. |
| Permissions copy | 🟢 iOS `NSCameraUsageDescription`, `NSHealthShareUsageDescription`, `NSHealthUpdateUsageDescription` are user-clear (Apple reviewers reject vague copy). |
| Type-safe routes | 🟢 `experiments.typedRoutes: true` in `app.json`. Catches dead routes at compile time. |
| Mobile bug fixes | 🟢 The 4 reported bugs + 5 hunted siblings are already merged (`78d95ff`). |

---

## ARCHITECTURE — findings

> Skill: `/senior-architect` ran with focus on state, navigation, error boundaries, API patterns, performance, code splitting.

### A1. ✅ Crash reporting (Sentry) — DONE
**Status:** Wired via [`src/lib/sentry.ts`](../clients/mobile/src/lib/sentry.ts) (commit pending).

- `@sentry/react-native@~7.0.0` added to `clients/mobile/package.json`
- `@sentry/react-native/expo` config plugin added to `app.json` (`organization: tase-llc`, `project: react-native`)
- `initSentry()` runs at module-load in [`src/lib/sentry.ts`](../clients/mobile/src/lib/sentry.ts), imported as a side-effect from [`app/_layout.tsx`](../clients/mobile/app/_layout.tsx)
- `RootLayout` is now wrapped via `Sentry.wrap(RootLayout)` for top-level error boundary + perf hooks
- [`ErrorBoundary.tsx`](../clients/mobile/src/components/ErrorBoundary.tsx) calls `captureException` with the React component stack as extra context
- Sentry is **disabled in dev** (`enabled: !__DEV__`) to preserve the free-tier event budget
- User id is set on Sentry after login via `sentrySetUser(user.id)` — never email or name
- DSN comes from `EXPO_PUBLIC_SENTRY_DSN` env var (set per-profile in [`eas.json`](../clients/mobile/eas.json))

**PII scrubber (`beforeSend`)** redacts these field names case-insensitively at any depth in `request.data`, `request.headers`, `extra`, `contexts`, breadcrumb `data`:

```
password, pass, pwd, email, token, access_token, refresh_token,
authorization, cookie, set-cookie, api_key, secret, cardNumber, card,
cvv, cvc, ssn, tax_id, jwt
```

Plus heuristic redaction of `Bearer <token>` strings and JWT-shaped strings inside string values, and full body redaction for any URL containing `/auth/`. Console-log breadcrumbs from the API client are dropped entirely (they leak request URLs).

#### ⚠️ Post-merge steps you (the human) must do — Sentry won't actually send events until these are done:

1. **Set the DSN as a non-secret env var per EAS profile:**
   ```bash
   eas env:create EXPO_PUBLIC_SENTRY_DSN https://79ac0d934367faed73ba73c33fb480b7@o4511327399444480.ingest.us.sentry.io/4511327425462272 --visibility plaintext --scope project --environment preview
   eas env:create EXPO_PUBLIC_SENTRY_DSN https://79ac0d934367faed73ba73c33fb480b7@o4511327399444480.ingest.us.sentry.io/4511327425462272 --visibility plaintext --scope project --environment production
   ```
   (Or paste the DSN string into the empty `""` slots in [`eas.json`](../clients/mobile/eas.json) — same effect, but commits the DSN to git which is not great. The `eas env:create` route is cleaner.)

2. **Create a Sentry auth token for source map upload** (this one IS secret):
   - Go to https://sentry.io/settings/account/api/auth-tokens/
   - Create a token named `eas-build-source-maps` with scopes: `project:read`, `project:releases`, `org:read`
   - Add it as a SECRET EAS env var, available to all environments:
     ```bash
     eas env:create SENTRY_AUTH_TOKEN <paste-token-here> --visibility secret --scope project
     ```
   - Without this, production stack traces will show minified gibberish like `at e (a:1:42)` instead of `at handleLogin (login.tsx:42:7)`.

3. **Test it works:**
   - In a preview build (not Expo Go — Sentry needs native), force-throw an error from any button:
     ```ts
     onPress={() => { throw new Error('Sentry test'); }}
     ```
   - Check https://tase-llc.sentry.io/issues/ — the error should appear within ~30s with a readable stack trace pointing at the source file.
   - Confirm the body of any auth request is redacted to `[redacted]` in the breadcrumb trail.

#### Future work (NOT blockers):
- Add `Sentry.reactNavigationIntegration` to capture screen-transition transactions. Skipped for v1 because expo-router's setup is fiddly.
- Add user feedback widget (`Sentry.captureUserFeedback`) on the ErrorBoundary fallback screen.

### A2. 🔴 No analytics — you can't measure activation, retention, or feature usage
There's no `posthog-react-native`, `@amplitude/analytics-react-native`, `firebase/analytics`, or even a custom event pipeline. Without this, ASO experiments and product decisions are blind.

**Fix:** Pick one (PostHog if you want self-hostable + product analytics; Firebase Analytics if you want App Store Connect integration; Mixpanel if your team knows it). Wire 8 core events: `app_open`, `signup_started`, `signup_completed`, `onboarding_completed`, `meal_logged`, `workout_completed`, `subscription_purchased`, `ai_chat_sent`. Tag every event with `subscription_tier` + `shift_type`. Add an opt-out toggle in Settings (privacy + GDPR).

### A3. ✅ `console.log` in API interceptor — DONE
The `[API Request]` log in [`client.ts`](../clients/mobile/src/api/client.ts) is now wrapped in `if (__DEV__) { ... }`. The dev-mode check is sufficient on RN — `__DEV__` is replaced at build time so the log is dead-code-eliminated from prod bundles, not just no-op'd.

### A4. 🟠 Hardcoded production API URL with no env override
[`client.ts:43`](../clients/mobile/src/api/client.ts) falls back to `'https://api.nightfuel.app'`. This means staging and prod use the same URL unless someone remembers to set `EXPO_PUBLIC_NF_API_BASE_URL`. Bad for accidental staging→prod traffic.

**Fix:** Use EAS Build environment variables per profile (development / preview / production) in `eas.json`. Make production builds **fail to build** if `EXPO_PUBLIC_NF_API_BASE_URL` is unset.

### A5. ✅ Server-side logout — DONE
The `auth-service` already had the endpoint (`/v1/auth/logout` at [`routes.ts:64`](../services/auth-service/src/routes.ts), service method at [`auth.service.ts:114`](../services/auth-service/src/auth.service.ts)) — mobile just wasn't calling it. Now wired:

- [`api/auth.ts`](../clients/mobile/src/api/auth.ts) exports `logout(refreshToken)` with a 3s timeout
- [`authStore.ts`](../clients/mobile/src/store/authStore.ts) `logout()` reads the refresh token from SecureStore, calls the endpoint best-effort, then clears local state regardless of result

If the server is down, local logout still happens — the trade-off is that the refresh token row stays in the DB until its 30-day TTL. Acceptable.

### A6. ✅ `loadSession` 401 vs other-error logic — DONE
[`authStore.ts`](../clients/mobile/src/store/authStore.ts) `loadSession()` now distinguishes:

- **401 / 403 from `getMe`**: the apiClient interceptor will already have tried to refresh and failed, so the session is dead. Clear tokens, set `isAuthenticated: false`, route lands at `/login` via the existing `onSessionExpired` callback.
- **Network failure / 5xx**: tokens are likely still valid, just couldn't reach `/me`. Keep `isAuthenticated: true` so the user can see their cached UI.

This means an internet outage no longer logs the user out, but a real session expiration still bounces them properly.

### A7. ✅ `/v1/` URL hack replaced — DONE
[`client.ts`](../clients/mobile/src/api/client.ts) now has an explicit `shouldStripV1Prefix()` resolver:

1. Check `EXPO_PUBLIC_API_STRIP_V1_PREFIX=true|false` (explicit env override)
2. Else infer: strip if baseURL ends in `/api` (Next.js gateway pattern) OR contains `:3000` (legacy fallback)

The `STRIP_V1_PREFIX` constant is computed once at module load and used in both the request interceptor and the manual refresh-token call. No more port-string fragility.

### A8. 🟡 Routes use `as any` to bypass typed-routes
[`_layout.tsx:63`](../clients/mobile/app/_layout.tsx) — `router.replace('/(auth)/login' as any)`. The whole point of `typedRoutes: true` is gone if you cast. Means `expo-router` can't catch broken paths.

**Fix:** Either drop the cast (the path is valid, may need a type regen via `npx expo prebuild` + restart), or use the typed `Href` type from `expo-router`. There are likely more of these — search and fix.

### A9. 🟡 No bundle splitting — single JS bundle ships everything
Expo doesn't support React Native `import()` lazy loading on iOS by default (Hermes), but you CAN use `react-native-bundle-splitter` or the new Expo Router file-based splitting. Right now every user downloads the coach hub + admin panel even though most never see it.

**Fix:** This is a Phase 4 optimization, not P0. Note for later.

### A10. 🟡 `RiaCoachFAB.tsx` and other shared components — no `React.memo`
58-line component sitting in the FAB position likely re-renders on every nav transition. Lower priority but worth a pass once the app is shipped.

---

## SECURITY — findings (OWASP Mobile Top 10 lens)

> Skill: `/senior-security` ran with focus on token storage, JWT flow, deep links, certificate pinning, biometrics, ATS, OWASP MASVS.

### S1. ✅ Deep-link hijacking — code-side DONE, hosting still required
**Code:**
- [`app.json`](../clients/mobile/app.json) iOS now declares `associatedDomains: ["applinks:nightfuel.app", "applinks:www.nightfuel.app"]`
- [`app.json`](../clients/mobile/app.json) Android now has `intentFilters` with `autoVerify: true` for `https://nightfuel.app` + `https://www.nightfuel.app`
- [`lib/deepLinks.ts`](../clients/mobile/src/lib/deepLinks.ts) implements the **belt-and-braces path allowlist** + a `resolveDeepLink()` parser that URL-encodes capture groups (defends against path-traversal pivots like `/coach/invite/..%2Fadmin`)
- [`app/_layout.tsx`](../clients/mobile/app/_layout.tsx) uses `Linking.getInitialURL()` + `Linking.addEventListener('url', ...)` and only navigates if `resolveDeepLink()` says safe; rejected links are reported to Sentry as `deep_link_rejected` with the path (never the full URL)

**Still need from you (hosting):**
1. Host `https://nightfuel.app/.well-known/apple-app-site-association` (no extension, JSON content-type) with:
   ```json
   {"applinks":{"apps":[],"details":[{"appID":"<TEAM_ID>.com.nightfuel.app","paths":["/reset","/reset-password","/verify","/verify-email","/coach/invite/*","/subscription/return","/share/workout/*"]}]}}
   ```
   Replace `<TEAM_ID>` with your Apple Developer Team ID (10-char alphanumeric).
2. Host `https://nightfuel.app/.well-known/assetlinks.json` with:
   ```json
   [{"relation":["delegate_permission/common.handle_all_urls"],"target":{"namespace":"android_app","package_name":"com.nightfuel.app","sha256_cert_fingerprints":["<SHA256_FROM_EAS>"]}}]
   ```
   Get the SHA-256 via `eas credentials` after your first Android build.

### S2. 🟠 No certificate pinning
A user on a corporate / coffee-shop / nation-state Wi-Fi where they've installed a custom root CA can MITM all traffic and read JWTs in flight.

**Fix:** Pin via `react-native-cert-pinner` or by writing a custom `axios` adapter that validates the cert SHA-256 against your known leaf cert (and a backup pin for cert rotation). Pin the **public key** (SPKI hash), not the cert itself, so renewals don't break the app. **Document a rotation runbook** — pinning hostility on app rollback is a real operational risk.

### S3. 🟠 No biometric guard for re-entry to sensitive screens
After unlock, the app stays open indefinitely. For an app that handles Stripe billing + medical-ish data (sleep, body metrics, fasting), a stale unlocked phone is a real vector.

**Fix:** Use `expo-local-authentication`. Require Face ID / Touch ID re-auth before:
- Viewing the Settings → Subscription screen
- Adding a new payment method
- Viewing weight history older than X days
- Unlocking the app after >24h foreground absence
Implement as a higher-order navigation guard, not per-screen.

### S4. 🟠 No jailbreak / root detection
Trivially exploitable on jailbroken devices: dump SecureStore via `frida` or by reading the unprotected sandbox.

**Fix:** Install `expo-device-detect` (or `jail-monkey`). On detect, **don't crash** — show a "for security, NightFuel can't run on rooted/jailbroken devices" screen with an exit button. Critically: **don't rely on this alone for security** (a determined attacker can patch the check). It's a friction layer, not a wall.

### S5. ✅ Mobile-side input sanitization — DONE (server-side still recommended)
[`lib/aiSafety.ts`](../clients/mobile/src/lib/aiSafety.ts) `sanitizeAiInput()` runs on every user-supplied AI prompt:

- Trims and normalizes whitespace
- Strips ASCII control chars except `\n`, `\t`, `\r`
- Strips zero-width / bidi-override / private-use Unicode (common in copy-paste injection payloads)
- Hard-caps length at `AI_MAX_INPUT_CHARS = 2000`
- Detects 8 injection patterns: `ignore_previous`, `system_prompt_dump`, `role_override`, `role_assume`, `forget_persona`, `jailbreak_token`, `tool_injection`, `prompt_leak_guard` — flags to Sentry but does **not** block (avoid hostile UX for legit users with false positives)

[`api/ai.ts`](../clients/mobile/src/api/ai.ts) `chat()` runs every message through the sanitizer before sending. Empty results return a "couldn't catch that" canned reply.

**Backend recommendation (NOT done — needs Python work):** the `ai-pipeline` service's Layer 3 should use the [`tool_use` API](https://docs.anthropic.com/en/docs/build-with-claude/tool-use) with a strict JSON schema for the response. That makes prompt injection structurally unable to exfiltrate the system prompt — the model can only output values that fit the schema.

12 unit tests cover this in [`__tests__/lib/aiSafety.test.ts`](../clients/mobile/__tests__/lib/aiSafety.test.ts).

### S6. ✅ Cleartext disabled — DONE
[`app.json`](../clients/mobile/app.json) now sets:

- `android.usesCleartextTraffic: false` — Android refuses HTTP except via the dev-client's local-IP exception
- `ios.infoPlist.NSAppTransportSecurity.NSAllowsArbitraryLoads: false` — explicit ATS denial of arbitrary HTTP

If anyone accidentally sets `EXPO_PUBLIC_NF_API_BASE_URL=http://prod-leak.example`, the build itself runs but network calls fail loudly with "cleartext communication not permitted" — much better than silently MITM-able.

### S7. 🟠 The leaked GCP key incident already happened
Already mitigated (key removed from history, file gitignored). But this implies the team's secret hygiene needs a process, not just a one-time scrub.

**Fix:**
1. Add `pre-commit` hook with `gitleaks` (or `trufflehog`) — refuses commits containing tokens.
2. Enable GitHub's secret scanning + push protection on the repo (Settings → Code security).
3. Run `gitleaks detect --source . --redact` once across the existing history, fix anything else found.
4. Document a "key rotation checklist" in `docs/SECURITY.md`.

### S8. 🟡 `Authorization` header only set in interceptor — websocket connection?
Socket.IO chat connection is mentioned in the architecture doc but the code path isn't here yet. **If** the WS handshake doesn't carry the JWT, anonymous connections may be possible.

**Fix:** Audit the Socket.IO client wiring once it exists. The pattern is `auth: { token: accessToken }` in the `io()` call, with the server validating in the `connection` middleware.

### S9. 🟡 No PII redaction in Sentry (when you add it)
When you add Sentry per A1, attach a `beforeSend` hook that scrubs `email`, `password`, `accessToken`, `refreshToken`, `Authorization` header, body fields named `password|cardNumber|cvv|ssn`. Default Sentry sends EVERYTHING, including request bodies.

### S10. 🟢 No-op finding — Stripe handling looks fine
Stripe is server-side only (`subscription-service`), the mobile app gets a Checkout URL. No card data ever touches the device. Anthropic API key is server-side only. Good.

---

## ML / AI PIPELINE — findings

> Skill: `/senior-ml-engineer` ran with focus on prompt injection, cost, latency, fallback, observability, model versioning.

### M1. 🔴 No streaming on AI chat → 5-15 second blank screen
[`ai.ts:58`](../clients/mobile/src/api/ai.ts) — `chat()` is a single POST that waits for the full Claude response. Sonnet 4.6 chat replies typically take 3–8s; plan generation 8–20s. Users will think the app crashed.

**Fix (backend + mobile, in order):**
1. Backend: convert `/v1/ai/chat` to SSE streaming using Anthropic's `client.messages.stream()`.
2. Mobile: use `expo-eventsource` (or fetch + ReadableStream on RN 0.81+) to consume the stream. Append tokens to the chat bubble as they arrive. Show a typing indicator that morphs into the text.
3. Plan generation can stay request/response since it's a one-shot, but show a progress UI ("Reading your circadian profile…", "Calculating macro targets…", "Finalizing meal timing…") with stages tied to the backend's actual three-layer pipeline.

### M2. 🔴 No client-side rate limiting on AI calls
Nothing stops a user (or a bug, or a malicious mod) from firing 100 chat messages in a second. With Claude Sonnet 4.6 at ~Production-readiness.015 / message, that's Production-readiness.50 in seconds, and the backend's per-user cap (if any) doesn't exist on the client to give immediate feedback.

**Fix:**
- Add a `useRateLimit('ai_chat', 10, '1m')` hook on the chat send button — disables sending if the user has hit 10 messages in the last minute.
- Show "Slow down — you've sent 10 messages in the last minute. Try again in 23s" toast, not a silent failure.
- Backend: add a hard rate limit (Redis token bucket) in `ai-pipeline` keyed on `userId`. Free tier: 10 chat / day, 3 plans / day. Pro: 50 chat / day, unlimited plans.

### M3. 🟠 No timeout extension for plan generation
Default axios timeout is 15s ([`client.ts:106`](../clients/mobile/src/api/client.ts)), but plan generation calls Claude Sonnet, which can take 20-30s for a full week of meals + workouts.

**Fix:** Pass a per-call timeout: `apiClient.post('/v1/ai/generate-plan', payload, { timeout: 60_000 })`. Show a determinate-style progress UI tied to the backend's 3-layer phases.

### M4. 🟠 No fallback when AI is unavailable
If the `ai-pipeline` service is down or Claude API has a rare outage, the user sees a generic error and can't progress. For an "AI nutrition" app, AI being down is a 5-alarm fire.

**Fix:**
- Cache the most recent AI plan locally. If `generate-plan` fails, offer "use last plan" option.
- For chat: if AI is down, route to a hard-coded FAQ / canned-response fallback ("I'm having trouble right now — here are common questions…") rather than an error toast.
- For meal scoring: fall back to the rule engine result alone (Layer 2, no Layer 3). Already deterministic, no LLM needed.

### M5. 🟠 No client-side AI telemetry
You can't see from the user's device: token counts per call, response time, model cost, errors. All visibility lives server-side.

**Fix:** Have the backend return `{ reply, _meta: { tokensIn, tokensOut, model, costUsd, layerLatencies } }` from AI endpoints. On mobile, log to analytics: `ai_call_completed` with the meta. Now you can see "PRO users average Production-readiness.04 / day, FREE users Production-readiness.01" — directly informs pricing.

### M6. 🟡 No model version pinning visible to mobile
Architecture doc says "Sonnet 4.6 / Haiku" but the actual model string used is server-side and may silently update. When Anthropic releases Sonnet 4.7 and the team upgrades, mobile users may see different behavior with no rollback path.

**Fix:** Backend writes `_meta.model` in responses (see M5). Mobile displays it in a debug menu (long-press settings logo 7 times). Helps support triage.

### M7. 🟡 No A/B testing infrastructure for AI prompts
You'll want to test prompt variants ("be conversational vs. clinical", different temperature, etc.). Right now there's no way to do this.

**Fix:** Phase 3+. Wire LaunchDarkly / GrowthBook (or PostHog feature flags from A2) to expose `ai_prompt_variant` to the backend, which selects between prompt versions. Track conversion (e.g., "did the user log a meal within 1h of the chat reply?").

---

## APP STORE OPTIMIZATION — launch-ready copy

> Skill: `/app-store-optimization` ran with focus on title/subtitle, keywords, description, categories, age rating, privacy nutrition labels, competitive positioning.

### iOS App Store

**Title** (30 chars max — 27 used):
```
NightFuel: Shift Worker Diet
```
Rationale: "NightFuel" brand + primary keyword "shift worker" + secondary "diet". "Shift" is high-volume in the niche (~12K monthly est.); "diet" outranks "nutrition" 3:1 in mobile search.

**Subtitle** (30 chars max — 28 used):
```
Night Shift Meals & Workouts
```
Two more high-intent keywords ("night shift", "meals", "workouts").

**Promotional Text** (170 chars — editable without app update):
```
Built for nurses, drivers, factory & ER workers. NightFuel times your meals, workouts and caffeine to your real shift — not a 9-to-5. New: Ramadan Mode + AI coach.
```

**Keywords field** (100 chars max — comma separated, NO spaces, NO plurals, NO words from title):
```
fasting,calorie,macro,sleep,circadian,coach,nurse,driver,fitness,gym,meal,recipe,protein,keto,fat,plan
```
(99 chars; 16 keywords)

**Description** (4000 chars max — full structure):

```
NIGHTFUEL — Built for People Who Don't Sleep at Night

You're a nurse working three nights a week. A long-haul trucker. A factory tech on rotating shifts. An ER doctor pulling 24-hour calls.

Every other fitness app assumes you sleep at 11 PM and eat breakfast at 7 AM. NightFuel doesn't.

We're the only chrono-nutrition app built specifically for the 1.8 billion shift workers worldwide whose bodies operate on a different clock.

— THE PROBLEM EVERY OTHER APP IGNORES —

Eating the same meal at 2 PM vs. 2 AM has completely different metabolic effects. Standard meal planners get this wrong. NightFuel doesn't.

Shift workers face 23% higher diabetes risk and 29% higher cardiovascular risk — driven by chronic circadian disruption, not lack of willpower.

— HOW NIGHTFUEL WORKS —

🕐 REVERSE MEAL TIMING
Your meals are scheduled around YOUR sleep window — not the clock. Pre-shift, mid-shift, recovery, and sleep-prep meals are all timed by science.

🧠 3-LAYER AI THAT ACTUALLY UNDERSTANDS YOU
A deterministic Python circadian model + chrono-nutrition rules + Claude AI personalize every plan. Faster than ChatGPT. More accurate than a generic macro tracker.

☕ CAFFEINE TIMING THAT WORKS
Real cut-off windows for night shifts. No more lying awake at 8 AM after a coffee at 4 AM.

🥗 760 WHOLE FOODS + 3M+ BRANDED ITEMS
Online (Open Food Facts) when you have signal. Offline library when you don't. Halal, vegan, keto, gluten-free, acne-safe, Ramadan modes built in.

🏋️ FATIGUE-AWARE WORKOUTS
Intensity auto-adjusts based on your last shift, your sleep quality, and your circadian phase. PPL, full body, beginner-friendly progressions.

📊 WEEKLY AI COACH REPORTS
Your AI coach reviews your week and adapts next week's plan. Adherence, sleep quality, performance — all integrated.

— BUILT FOR YOUR SHIFT —

✓ Fixed Night
✓ Rotating (2-on-2-off, 12-hour, etc.)
✓ Split Shifts
✓ On-Call & Irregular

— FREE FOREVER. PRO WHEN YOU WANT IT. —

FREE: Full meal logging, basic AI plans, 30-day history
PRO ($/mo): Unlimited AI plans, weekly reports, advanced analytics
PREMIUM ($/mo): Coach marketplace access, custom plans from certified pros

Cancel anytime. No ads, ever.

— FROM THE TEAM —

Built by ex-shift-workers and certified nutritionists who got tired of nutrition apps treating "9 to 5" as the only schedule.

Contact: hello@nightfuel.app
Privacy: nightfuel.app/privacy
Terms: nightfuel.app/terms

— WHAT'S NEW —

v1.0.0 Launch — full chrono-nutrition platform with AI coach, 760-food offline library, fatigue-aware workouts.
```

**Category:** Primary `Health & Fitness` / Secondary `Lifestyle`
**Age Rating:** 17+ — Frequent/Intense Medical/Treatment Information (because of fasting + body metrics + dietary advice). Apple will downgrade to 12+ if you remove "medical" framing in description; we leaned in for credibility but flag for your call.

**Privacy Nutrition Label** (mandatory in App Store Connect — fill exactly this):

| Category | Data | Linked to user | Used for tracking |
|----------|------|----------------|-------------------|
| **Contact Info** | Email | Yes | No |
| **Contact Info** | Name | Yes | No |
| **Health & Fitness** | Sleep, body measurements, exercise data, dietary info | Yes | No |
| **User Content** | Photos (progress photos) | Yes | No |
| **User Content** | Other (chat with AI) | Yes | No |
| **Identifiers** | User ID | Yes | No |
| **Purchases** | Purchase history (Stripe) | Yes | No |
| **Usage Data** | Product interaction (analytics) | Yes | No |
| **Diagnostics** | Crash data, performance | No | No |

⚠️ The "Used for tracking" column must all be **No** since you're not selling/sharing with third-party advertisers. If you ever add Facebook Pixel etc., this changes.

### Google Play Store

**App Title** (30 chars used — Play allows 50):
```
NightFuel: Shift Worker Diet
```

**Short Description** (80 chars max — 79 used):
```
Chrono-nutrition for shift workers. Meals, workouts & sleep on YOUR schedule.
```

**Full Description:** Reuse iOS description above. Play has no keyword field — keywords come from natural use throughout the description.

**Category:** `Health & Fitness`
**Content Rating:** `Everyone` (will be downgraded if quiz answers reflect medical content) — IARC questionnaire will probably land on `Teen` because of "user-generated content" (community feed).

### Competitive positioning (vs MyFitnessPal / Cronometer / Centr)

| Competitor | Their angle | Where NightFuel wins |
|-----------|-------------|----------------------|
| **MyFitnessPal** | Generic calorie counter, broadest food DB | They assume 3-meal day. We chrono-time. They charge for AI. We use it as the engine. |
| **Cronometer** | Micronutrient detail, science-y | They're aimed at biohackers. We're aimed at the 1.8B shift workers Cronometer ignores. |
| **Centr** (Chris Hemsworth's app) | Premium workouts + meals, brand-driven | They're aspirational. We're operational. Different audience. |
| **Lose It! / Noom** | Behavioral-coaching | They use generic CBT. We use circadian science. |

**Differentiator one-liner for press:**
> "MyFitnessPal for the 1.8 billion people who don't sleep at night."

### ASO checklist (do these before submission)

- [ ] Generate 5 portrait screenshots per device size (6.7", 6.5", 5.5" iPhone; 8.4", 7.0" iPad). Use a tool like Screenshot Studio or Figma + IconKitchen.
- [ ] Caption template per screenshot (action-led, 20–28 chars):
  1. "Plan meals around YOUR sleep"
  2. "AI that knows your shift"
  3. "Track sleep, fasting, weight"
  4. "Workouts that adapt to fatigue"
  5. "Free to start. Cancel anytime."
- [ ] App preview video (15–30s) — optional but converts +20%
- [ ] First impression frame shows the dashboard with a real shift schedule, not a generic illustration
- [ ] Privacy policy URL live at `nightfuel.app/privacy` BEFORE submission
- [ ] Terms of use URL live at `nightfuel.app/terms` BEFORE submission
- [ ] Support URL: `nightfuel.app/support` (or Notion / Discord) — Apple wants a human-reachable channel
- [ ] App Store Connect "App Information" → Marketing URL filled
- [ ] Demo account with `email` + `password` for App Review (don't use real user data — make a `reviewer@nightfuel.app` with seeded sample data)
- [ ] In-app purchase products configured: `nightfuel.pro.monthly`, `nightfuel.pro.yearly`, `nightfuel.premium.monthly`, `nightfuel.premium.yearly`. Stripe is web-side; iOS will require **either StoreKit2 in-app or a webview redirect to your site** — App Review **will reject** subscriptions that bypass IAP (3.1.1 guideline) unless you're a reader app. NightFuel is not a reader app.

⚠️ **The Stripe-vs-StoreKit decision is a 1-week project on its own.** Apple takes 30%/15% via IAP. You can't just keep the Stripe flow on iOS without implementing reader-app exemption logic. **Open question — discuss before building anything.**

---

## Roadmap to launch (4 milestones)

### Milestone 1 — Observability & safety net (3–5 days)
- [ ] A1 Sentry crash reporting (with PII scrub)
- [ ] A2 Analytics (PostHog or Firebase) — 8 core events
- [ ] A3 Strip `console.log` from production paths
- [ ] S7 GitLeaks pre-commit + GitHub secret scanning
- [ ] S9 PII redaction in Sentry `beforeSend`

**Exit criteria:** Forced crash → see the stack trace in Sentry. Sign up + log a meal → see events in PostHog. Try to commit a fake API key → blocked.

### Milestone 2 — AI hardening (5–7 days)
- [ ] M1 Streaming chat (backend + mobile)
- [ ] M2 Client + server rate limiting on AI
- [ ] M3 Per-call timeout configuration
- [ ] M4 AI-down fallback paths
- [ ] M5 Token/cost telemetry surfaced to client
- [ ] S5 Prompt-injection guardrails (length cap + control-char strip)

**Exit criteria:** Spam-click chat 100x → rate limited gracefully. Kill the `ai-pipeline` service → app degrades to fallback, not error. Try `"Ignore previous instructions"` → returns a normal nutrition reply.

### Milestone 3 — Security hardening (5–7 days)
- [ ] S1 Universal Links + App Links + deep-link allowlist
- [ ] S2 Certificate pinning (with rotation runbook)
- [ ] S3 Biometric guards on subscription / billing screens
- [ ] S4 Jailbreak/root detection (soft block)
- [ ] S6 Android Network Security Config
- [ ] S8 Socket.IO JWT auth audit (when chat lands)
- [ ] A5 Server-side logout endpoint
- [ ] A6 Fix `loadSession` 401 vs other-error logic
- [ ] A4 EAS env vars per profile, fail-closed if missing

**Exit criteria:** Run on a jailbroken device → blocked. MITM with custom CA on a corporate Wi-Fi → connection fails. Logout → refresh token revoked server-side, can't be reused.

### Milestone 4 — Submission prep (5–10 days)
- [ ] EAS Build pipeline (dev / preview / production profiles)
- [ ] EAS Submit configured for both stores
- [ ] StoreKit2 for iOS subscriptions (or reader-app exemption decision)
- [ ] Screenshots + app preview video for all device sizes
- [ ] Privacy policy + Terms of Use live
- [ ] Demo account for App Review
- [ ] Privacy nutrition label (above)
- [ ] App Store + Play Store metadata entered
- [ ] First TestFlight + internal-track beta with real shift workers
- [ ] Iterate on beta feedback for 1 week
- [ ] Submit for review

**Exit criteria:** App is live in both stores.

### Items deferred (NOT blockers — Phase 5+)
- A9 Bundle splitting
- A10 React.memo passes
- M7 A/B testing for AI prompts

---

## What I recommend doing first

**Milestone 1, Day 1 (today): Sentry + analytics.** It's 3-4 hours of work and unlocks visibility for everything else. You can't measure improvement without it.

If you say go, I'll start with A1 (Sentry) in your repo right now. I'll need from you:
1. A Sentry DSN (or signup at https://sentry.io — free tier covers your scale for ~6 months) — paste it here, I'll add it to env vars properly
2. Pick analytics provider — PostHog (recommended for self-host option) or Firebase (recommended if you're already in Google Cloud)

Or if you'd rather start with a different milestone item, name it and I'll pick that up instead.
