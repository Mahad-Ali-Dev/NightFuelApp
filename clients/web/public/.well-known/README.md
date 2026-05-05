# `/.well-known/` — Universal Links + App Links verification files

These files MUST be served at `https://nightfuel.app/.well-known/...` for iOS Universal Links and Android App Links to verify and bind to the NightFuel mobile app. Without them, deep links fall back to opening Safari / Chrome — but more importantly, **they can be hijacked by another app on the device**.

## Files

### `apple-app-site-association`

Used by iOS to verify Universal Links. Apple fetches this file once on first app install and again whenever the app is updated (with the right OS support).

**Filename rules:**
- ⚠️ NO file extension. Not `.json`, not `.txt`. Just `apple-app-site-association`.
- Content type **must** be `application/json` (NOT `text/json`, NOT `application/octet-stream`).
- Must be served from the apex AND any subdomains you want to claim.
- Must be reachable over HTTPS without redirects.
- Must NOT be behind any auth wall (Cloudflare Access, basic auth, etc.).

**Before publishing:**
1. Replace `REPLACE_WITH_APPLE_TEAM_ID` with your 10-character Apple Developer Team ID. Find it at https://developer.apple.com/account → Membership.
2. Verify the file with `curl -i https://nightfuel.app/.well-known/apple-app-site-association` — confirm `200 OK` + `application/json` content-type.
3. Test with Apple's validator: https://search.developer.apple.com/appsearch-validation-tool/

### `assetlinks.json`

Used by Android to verify App Links. Same purpose as `apple-app-site-association` but for Android.

**Filename rules:**
- Filename IS `assetlinks.json` (with the extension).
- Content type **must** be `application/json`.

**Before publishing:**
1. Replace `REPLACE_WITH_SHA256_FINGERPRINT_FROM_EAS` with the SHA-256 of the **upload key** EAS uses to sign your Android build. Get it via:
   ```
   eas credentials -p android
   ```
   (look for "SHA-256 Fingerprint")
2. If you have multiple keys (e.g. upload key + Play Store signing key after enrollment in Play App Signing), include both fingerprints in the array.
3. Verify with: `curl -i https://nightfuel.app/.well-known/assetlinks.json`
4. Test at: https://developers.google.com/digital-asset-links/tools/generator

## Hosting checklist

This `.well-known` directory should be served by your Next.js web client at `clients/web/`. Next.js exposes `public/` at the URL root, so files under `clients/web/public/.well-known/` will be served at `https://nightfuel.app/.well-known/`.

⚠️ **Common gotchas:**
- Some CDNs strip files with no extension by default. If `apple-app-site-association` returns 404 in production but works locally, check your CDN's allowed-extensions config.
- Vercel handles this correctly out-of-the-box. Cloudflare requires no special config either.
- A trailing redirect (`https://nightfuel.app/.well-known/...` → `https://www.nightfuel.app/.well-known/...`) breaks iOS verification. Make sure both apex and www serve the file directly without redirecting.

## After deployment

1. Trigger an EAS build (`eas build --profile preview --platform ios`) — Apple will fetch the AASA file when the app is installed.
2. On a real device, open a known deep-link URL (e.g. `https://nightfuel.app/reset?token=test`). It should open the NightFuel app, NOT Safari.
3. Repeat for Android: `eas build --profile preview --platform android`. Then `adb shell pm get-app-links com.nightfuel.app` should show `verified` for the `nightfuel.app` host.
