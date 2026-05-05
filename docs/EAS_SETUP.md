# EAS Build & Submit — first-time setup walkthrough

This is the exact sequence you (Mahad) run once to get NightFuel mobile from "code complete" to "app actually built in the cloud and runnable on your phone." Every command here is interactive (needs your Expo / Apple / Google credentials), so it can't be automated by Claude.

Estimated time: **45 minutes** (most of it waiting for the first cloud build).

---

## Prerequisites

| Need | How to get it | Cost |
|------|---------------|------|
| Expo account | https://expo.dev/signup | Free |
| Apple Developer Program | https://developer.apple.com/programs/enroll/ | $99/year — required for App Store submission |
| Google Play Console | https://play.google.com/console/signup | $25 one-time — required for Play Store submission |
| Apple TestFlight is included | with Apple Developer Program | — |
| EAS CLI | already installed: `eas --version` should print 18.x | Free |

For a **first preview build to your own phone** (Android only) you only need Expo + EAS CLI. iOS preview builds require an Apple Developer account.

---

## 1. Login + project init

```bash
cd D:/nightfuel/repo/clients/mobile

# If `eas` is not on PATH (Windows fresh terminal):
&  "$env:APPDATA\npm\eas.cmd"  --version    # PowerShell
"$APPDATA/npm/eas.cmd" --version            # Git Bash

eas --version            # confirm — should be 18.x or 19.x
eas login                # prompts for Expo email + password
eas whoami               # confirm logged in

# Create the EAS project. Writes projectId into app.json under
# expo.extra.eas.projectId. Idempotent — re-running just confirms.
eas init
```

When `eas init` asks:
- **"Create a new EAS project?"** → Y
- **"Which Expo account?"** → pick yours
- **"Project slug?"** → accept default (`nightfuel`)

Verify: `git diff app.json` should show a new `extra.eas.projectId` field. **Commit it** so future builds know where to upload.

---

## 2. Set environment variables

NightFuel reads these at build time. Set them via EAS web dashboard OR CLI — the CLI is faster.

```bash
# Sentry (you already have a DSN from the previous session)
eas env:create EXPO_PUBLIC_SENTRY_DSN \
  "https://79ac0d934367faed73ba73c33fb480b7@o4511327399444480.ingest.us.sentry.io/4511327425462272" \
  --scope project --environment preview --visibility plaintext

eas env:create EXPO_PUBLIC_SENTRY_DSN \
  "https://79ac0d934367faed73ba73c33fb480b7@o4511327399444480.ingest.us.sentry.io/4511327425462272" \
  --scope project --environment production --visibility plaintext

# Sentry source-map upload token (create at https://sentry.io/settings/account/api/auth-tokens/
# with scopes: project:read, project:releases, org:read)
eas env:create SENTRY_AUTH_TOKEN <your-auth-token> \
  --scope project --visibility secret

# Verify
eas env:list --environment preview
eas env:list --environment production
```

For **App Store IAP** (after setting up products in App Store Connect — see step 5 below):

```bash
# Apple shared secret for verifyReceipt — find at App Store Connect →
# My Apps → [your app] → App Information → App-Specific Shared Secret
eas env:create APPLE_SHARED_SECRET <your-32-char-hex-secret> \
  --scope project --visibility secret
```

For **Google Play IAP** (after Play Console setup — step 5):

```bash
# Service account JSON (base64-encoded), with the `androidpublisher` scope
eas env:create GOOGLE_PLAY_SERVICE_ACCOUNT_JSON "$(base64 -i path/to/service-account.json)" \
  --scope project --visibility secret
```

---

## 3. First Android build (no Apple Developer needed)

This is the fastest path to seeing the app on YOUR own phone.

```bash
cd D:/nightfuel/repo/clients/mobile
eas build --profile preview --platform android
```

EAS will:
1. Upload the JS bundle (~15s)
2. Run `expo prebuild` to generate the `android/` directory
3. Run Gradle in EAS's cloud (8-15 minutes)
4. Output a `.apk` URL + a QR code

**Install on your phone:**
- Scan the QR code (it links to the .apk hosted on EAS's CDN)
- Tap "Install" — Android may warn you it's from an unknown source. Allow.

The build appears at `https://expo.dev/accounts/<you>/projects/nightfuel/builds`.

---

## 4. First iOS preview build (needs Apple Developer)

```bash
eas build --profile preview --platform ios
```

EAS will prompt for:
- **Apple ID** (your developer account email)
- **App-specific password** — generate at https://appleid.apple.com → "App-Specific Passwords"
- **Team selection** (if you're in multiple teams)

EAS will provision a **Distribution Certificate** + **Provisioning Profile** automatically. Builds take 10-20 minutes.

Output: a `.ipa` you install via TestFlight. Add yourself as an **Internal Tester** in App Store Connect to install via the TestFlight app on your phone (no Apple Developer device limit).

---

## 5. App Store Connect + Play Console setup for IAP

For subscriptions to actually work, you must create matching subscription products in BOTH stores. The product IDs MUST match `clients/mobile/src/lib/iap.ts → SUBSCRIPTION_PRODUCT_IDS`.

### App Store Connect

1. Open https://appstoreconnect.apple.com → My Apps → NightFuel
2. **Features → In-App Purchases → Subscriptions**
3. Create a **Subscription Group** named `NightFuel Subscriptions` (or anything — group name isn't user-visible)
4. Inside the group, create 6 auto-renewable subscriptions with these EXACT product IDs:

| Product ID | Reference name | Subscription duration | Price tier |
|------------|----------------|------------------------|------------|
| `com.nightfuel.app.pro.monthly` | NightFuel Pro Monthly | 1 month | $9.99 (tier 10) |
| `com.nightfuel.app.pro.yearly` | NightFuel Pro Yearly | 1 year | $79.99 (tier 80) |
| `com.nightfuel.app.premium.monthly` | NightFuel Premium Monthly | 1 month | $19.99 (tier 20) |
| `com.nightfuel.app.premium.yearly` | NightFuel Premium Yearly | 1 year | $159.99 (tier 160) |
| `com.nightfuel.app.enterprise.monthly` | NightFuel Enterprise Monthly | 1 month | $49.99 (tier 50) |
| `com.nightfuel.app.enterprise.yearly` | NightFuel Enterprise Yearly | 1 year | $399.99 (tier 400) |

For each subscription, add at least one localization (e.g. English (US)) with a display name and description that match what you advertise in-app.

5. **App Information → App-Specific Shared Secret** → click "Generate" — save this 32-char hex value as `APPLE_SHARED_SECRET` (step 2 above).

### Google Play Console

1. https://play.google.com/console → Your app → **Monetize → Products → Subscriptions**
2. Create matching subscription IDs (same names as above)
3. Set price + duration to match the iOS values
4. Create a **base plan** for each subscription (Google's terminology — they require a "base plan" object even for simple monthly/yearly)
5. **Activate** each subscription (defaults to draft)

### Service account for receipt validation

1. https://console.cloud.google.com → IAM & Admin → Service Accounts → Create
2. Name it `nightfuel-play-billing-validator`
3. Grant it the role: **Service Account User** (the granular `androidpublisher` permissions are granted in Play Console next)
4. Create a JSON key, download it
5. Back in Play Console → Users and permissions → Invite user → use the service account email → grant **View financial data, orders, and cancellation survey responses** + **Manage orders and subscriptions**
6. Set as `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` env var (step 2 above)

---

## 6. Submission

After the IAP products are configured + the app actually runs end-to-end on TestFlight / Internal Track:

```bash
eas build --profile production --platform ios
eas submit --profile production --platform ios   # uploads to App Store Connect

eas build --profile production --platform android
eas submit --profile production --platform android   # uploads to Play Console
```

For first submission, both platforms require manual review:
- **Apple**: 24-72 hours typical, sometimes longer for new apps. Health & Fitness category gets extra scrutiny.
- **Google**: 1-7 days for first submission, hours after that.

See [LAUNCH_CHECKLIST.md](./LAUNCH_CHECKLIST.md) for the full pre-submission checklist (privacy nutrition label, demo account, screenshots, etc.).
