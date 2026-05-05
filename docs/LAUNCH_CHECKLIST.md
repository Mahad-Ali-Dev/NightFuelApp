# NightFuel Launch Checklist

The list of interactive steps that only you can do. Each is a checkbox you'll tick once.

After every box is checked, the app is genuinely launch-ready and Apple / Google should accept it on first review.

> **Estimated total time on your end: ~6-8 hours of active work, plus 1-7 days of waiting for app review.**
> Cost: ~$124 one-time (Apple Developer $99/yr + Google Play $25 one-time) + your TLS cert + nightfuel.app domain renewal.

---

## A. Accounts & domains (~30 min)

- [ ] **Apple Developer Program** — sign up at https://developer.apple.com/programs/enroll/ ($99/yr). Required for App Store submission.
- [ ] **Google Play Console** — sign up at https://play.google.com/console/signup ($25 one-time).
- [ ] **Expo account** — already have if you ran `eas login` — confirm at https://expo.dev/accounts/<you>.
- [ ] **Domain `nightfuel.app`** registered + DNS pointed at your hosting (Vercel / Cloudflare / wherever the web client is deployed).
- [ ] **MX records** on `nightfuel.app` so `support@`, `privacy@`, `billing@`, `legal@` work (Apple App Review will email these for verification).

---

## B. Web client must be live (~1-2 hours)

The web client serves the privacy policy, terms of service, and the `.well-known` files. Apple won't approve without working URLs.

- [ ] Deploy `clients/web` to production (Vercel recommended — `vercel deploy --prod`).
- [ ] Verify https://nightfuel.app loads.
- [ ] Verify https://nightfuel.app/privacy renders the privacy policy from `docs/PRIVACY.md` (you may need a `/privacy/page.tsx` that renders the markdown).
- [ ] Verify https://nightfuel.app/terms renders the terms of service.
- [ ] Verify https://nightfuel.app/support renders OR redirects to a support contact (email link is fine).
- [ ] **Replace `<APPLE_TEAM_ID>` placeholders** in `clients/web/public/.well-known/apple-app-site-association`. Find your Team ID at https://developer.apple.com/account → Membership.
- [ ] **Replace `<SHA256>` in `clients/web/public/.well-known/assetlinks.json`** — get from `eas credentials -p android` after your first Android build.
- [ ] Verify `curl -i https://nightfuel.app/.well-known/apple-app-site-association` returns `200 OK` with `Content-Type: application/json`.
- [ ] Verify `curl -i https://nightfuel.app/.well-known/assetlinks.json` returns `200 OK` with `Content-Type: application/json`.

---

## C. Backend deployment & secrets (~1-2 hours)

Most likely on Railway since `docker-compose.yml` mirrors that topology.

- [ ] Deploy all 14 services to Railway / your chosen host.
- [ ] Set the following env vars per service in production. **Never put any of these in git:**
  - [ ] `JWT_SECRET` — at least 32 random chars (`openssl rand -base64 32`)
  - [ ] `*_DATABASE_URL` — Supabase Postgres URLs per service
  - [ ] `REDIS_URL` — Upstash
  - [ ] `ANTHROPIC_API_KEY` — for ai-pipeline only
  - [ ] `STRIPE_SECRET_KEY` (live) + `STRIPE_WEBHOOK_SECRET` — for subscription-service
  - [ ] `APPLE_SHARED_SECRET` — for subscription-service (after IAP setup, see step E)
  - [ ] `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` (base64 of the JSON) — for subscription-service
  - [ ] `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` + `VAPID_SUBJECT` — for notification-service (`npx web-push generate-vapid-keys`)
- [ ] Rotate the **Stitch GCP key** that was scrubbed from history earlier — at https://console.cloud.google.com → APIs & Services → Credentials. The old key is still on disk somewhere; revoke it.
- [ ] DNS: point `https://api.nightfuel.app` to your gateway (nginx in `docker-compose.yml`).
- [ ] TLS cert with auto-renewal (LetsEncrypt or your provider's default).
- [ ] Health checks: `curl https://api.nightfuel.app/health` and per-service `/health` should return 200.

---

## D. Sentry hooked up to receive events (~15 min)

- [ ] `eas env:create EXPO_PUBLIC_SENTRY_DSN ... --environment preview --visibility plaintext`
- [ ] `eas env:create EXPO_PUBLIC_SENTRY_DSN ... --environment production --visibility plaintext`
- [ ] Create a Sentry auth token at https://sentry.io/settings/account/api/auth-tokens/ with scopes `project:read`, `project:releases`, `org:read`.
- [ ] `eas env:create SENTRY_AUTH_TOKEN <token> --visibility secret`
- [ ] Build a preview, force a test crash, confirm it appears at https://tase-llc.sentry.io/issues/

---

## E. App Store Connect — IAP + listing (~2 hours)

### IAP products (must match `iap.ts` exactly)

- [ ] App Store Connect → My Apps → NightFuel → **Features → In-App Purchases → Subscriptions** → create subscription group
- [ ] Create the 6 subscriptions with IDs from `EAS_SETUP.md` step 5
- [ ] Add at least English (US) localization for each
- [ ] Generate **App-Specific Shared Secret** (App Information section)
- [ ] Set as `APPLE_SHARED_SECRET` on subscription-service (step C above)

### Listing metadata

Use the copy from `docs/PRODUCTION_READINESS.md` → "APP STORE OPTIMIZATION" section:

- [ ] **App name:** NightFuel
- [ ] **Subtitle:** Night Shift Meals & Workouts (28 chars)
- [ ] **Promotional text:** the 170-char copy from PRODUCTION_READINESS.md
- [ ] **Description:** the full 4000-char copy from PRODUCTION_READINESS.md
- [ ] **Keywords:** the 99-char comma-separated list from PRODUCTION_READINESS.md
- [ ] **Support URL:** https://nightfuel.app/support
- [ ] **Marketing URL:** https://nightfuel.app
- [ ] **Privacy Policy URL:** https://nightfuel.app/privacy
- [ ] **Category:** Primary `Health & Fitness`, Secondary `Lifestyle`
- [ ] **Age Rating:** 17+ — Frequent/Intense Medical/Treatment Information

### Screenshots (Apple requires multiple device sizes)

- [ ] 6.7" iPhone screenshots (5 minimum, 10 max)
- [ ] 6.5" iPhone screenshots
- [ ] 5.5" iPhone screenshots
- [ ] 12.9" iPad screenshots (required because `app.json` has `supportsTablet: true`)
- [ ] App preview video — optional but +20% conversion lift

Tools: capture inside iOS simulators with `xcrun simctl io booted recordVideo`. Or use `https://screenshots.pro/`.

### Privacy nutrition label

App Store Connect → My Apps → NightFuel → **App Privacy** → fill exactly per the table in `PRODUCTION_READINESS.md` → "Privacy Nutrition Label."

- [ ] All "Used for tracking" answers = NO (you don't sell to advertisers)
- [ ] All "Linked to user" entries linked to the User ID

### App Review prep

- [ ] **Demo account** — create `reviewer@nightfuel.app` with a known password. Pre-seed it with sample meals, workouts, sleep entries, AI history. Add the credentials to App Review Information.
- [ ] Notes for reviewer: explain that the app is for shift workers; mention that the AI features may take a few seconds to load. If subscription is gated behind anything, explain how the reviewer can access it for free during review.

---

## F. Google Play Console — IAP + listing (~1 hour)

### IAP products

- [ ] Create 6 subscriptions matching iOS product IDs (see `EAS_SETUP.md` step 5)
- [ ] Activate each subscription (default state is draft)
- [ ] Service account: create at https://console.cloud.google.com → invite to Play Console with "Manage orders and subscriptions" permission (see `EAS_SETUP.md`)

### Listing

- [ ] App name: NightFuel
- [ ] Short description (80 chars): "Chrono-nutrition for shift workers. Meals, workouts & sleep on YOUR schedule."
- [ ] Full description: from `PRODUCTION_READINESS.md`
- [ ] Hi-res icon: 512x512 PNG
- [ ] Feature graphic: 1024x500 PNG
- [ ] Screenshots: phone (4-8) + 7-inch tablet + 10-inch tablet (because `supportsTablet: true`)
- [ ] Privacy Policy URL: https://nightfuel.app/privacy
- [ ] Data Safety form: complete based on what `PRIVACY.md` discloses
- [ ] Content Rating: complete IARC questionnaire (will land at Teen because of community feed)
- [ ] App Category: Health & Fitness

### Permissions justifications

Required for the permissions declared in `app.json`:

- [ ] HEALTH_*: justify the Apple Health / Health Connect integration
- [ ] CAMERA: justify barcode food scanning
- [ ] POST_NOTIFICATIONS: justify shift reminders + meal timing alerts

---

## G. Build, test, submit (~30 min active + days waiting)

```bash
# Production build (signs + uploads)
eas build --profile production --platform ios
eas build --profile production --platform android

# Submit to stores
eas submit --profile production --platform ios
eas submit --profile production --platform android
```

- [ ] iOS submitted → wait 24-72h for App Review
- [ ] Android submitted → Play Internal Track → wait for first review (1-7 days for new apps, hours after)
- [ ] Once Internal Track approved, promote to **Closed Testing → Open Testing → Production** in Play Console
- [ ] iOS once approved, change "Manual release" → "Release" or set scheduled date

---

## H. Post-launch monitoring (Day 1)

- [ ] Sentry dashboard open + alerts wired to your phone (Settings → Alerts → Notifications)
- [ ] Backend service health alerts (Railway / Pingdom / Better Stack)
- [ ] Stripe webhook delivery alerts (Stripe dashboard → Developers → Webhooks → set notification email)
- [ ] App Store + Play Store review responses queued (you have ~24h to reply when reviews come in — that's a ranking signal)

---

## I. Items I (Claude) explicitly couldn't close — owners

| # | Item | Owner | Why I couldn't do it |
|---|------|-------|----------------------|
| 1 | Legal review of `PRIVACY.md` + `TERMS.md` | Your attorney | Not a lawyer. The drafts are reasonable starting points, not "ready to publish" |
| 2 | Replace `[brackets]` in PRIVACY/TERMS (legal entity name, mailing address, governing law jurisdiction) | You | Legal info I don't have |
| 3 | Apple App Store Connect / Play Console account creation | You | Interactive auth |
| 4 | TLS cert generation + SPKI hash for cert pinning | You | Production secret |
| 5 | Domain DNS for nightfuel.app + .well-known hosting | You | DNS ownership |
| 6 | Stripe live keys + webhook URL setup | You | Stripe account auth |
| 7 | Apple shared secret + service account JSON for receipt validation | You | Per-account credentials |
| 8 | TestFlight beta with real shift-worker testers | You | Real human testers, not me |
| 9 | App Store screenshots (need real running app) | You | Requires built app on device |
| 10 | App preview video (optional) | You | Same |
| 11 | Demo reviewer account with seeded data | You | Account creation + manual content seeding |
| 12 | Stitch / GCP key rotation (the leaked one we scrubbed) | You | Your GCP console |
| 13 | First Android `eas build` to harvest SHA-256 fingerprint for assetlinks.json | You | Interactive `eas` |

Once all I-* items are checked, the app is launch-ready.

---

## J. Things you should NOT do (my contrarian opinion)

- **Don't skip TestFlight beta with real shift workers.** The demo account "looks fine" but real night-shift nurses + truckers will find the time-zone bugs you/I missed.
- **Don't enable certificate pinning on day 1.** Get 100 active users + a stable Sentry baseline first; then turn it on per `CERT_PINNING.md`'s rotation runbook. Pinning bricks installed apps if you mess up the rotation.
- **Don't ship Stripe-only on iOS hoping Apple won't notice.** They will. The IAP scaffold is in `iap.ts` — wire the products in App Store Connect and use it.
- **Don't claim medical benefits in App Store Connect description.** "Optimizes circadian rhythm" = fine. "Cures shift work disorder" = guideline 1.4 rejection. The current description draft sticks to the safe side.
- **Don't ignore the privacy nutrition label.** Apple is increasingly using it for 1.4 rejections. The disclosed data must match what you actually collect — under-disclose is a bigger problem than over-disclose.
