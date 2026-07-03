# Zeitra — Google Play submission package

Everything needed to submit to Google Play, copy-paste ready. Prepared 2026-07-03.

- **Package name:** `com.zeitra.app`
- **AAB build:** EAS production profile → download the `.aab` from the build page, upload to Play Console.
- **Privacy Policy URL:** https://zeitra.app/privacy  *(required — already live)*
- **App category:** Health & Fitness
- **Contact email:** support@zeitra.app  ·  **Website:** https://zeitra.app

---

## 1. Store listing text

### App name (30 char max)
```
Zeitra: Shift Work Nutrition
```
*(28 chars. Alt options: "Zeitra: Shift Work Fitness" · "Zeitra — Fuel Your Shifts")*

### Short description (80 char max)
```
AI coach that times your meals, training & sleep to the shifts you actually work.
```
*(80 chars exactly.)*

### Full description (4000 char max)
```
Your body runs on shifts. So should your fuel.

Every other nutrition and fitness app assumes you wake at 7, eat breakfast at 8, and sleep at 11. If you work nights, rotating rosters, or long shifts, that advice quietly fails you. Zeitra is built for the 1.8 billion shift workers the 9-to-5 apps forget.

Zeitra is your AI coach, Ria — she times your meals, training, caffeine and sleep to the hours you actually work, and adapts every time your rota changes.

WHY ZEITRA IS DIFFERENT
• Shift-aware by design. Tell Zeitra your real schedule — nights, earlies, doubles, on-call — and it re-times everything around it.
• Chrono-nutrition. When you eat matters as much as what you eat. Zeitra plans your anchor meal, your mid-shift fuel, and your caffeine cut-off so you stay sharp on shift and still sleep after it.
• Ria, your AI coach. Chat or talk to Ria for instant, personal plans. Snap a photo of your plate and she logs the calories and macros for you.

WHAT'S INSIDE
• AI meal planning around your shift, with full macros
• 86,000+ food database + barcode scanner + AI photo logging
• 300+ shift-friendly recipes
• Personalized workout plans that flex with your energy and rota
• Sleep and recovery tracking built for day-sleepers
• Caffeine cut-off timing that protects your sleep
• Connect Apple Health, Health Connect, or any Bluetooth wearable
• A community (the Crew) of people who also eat "dinner" at 6am

BUILT FOR WOMEN ON SHIFTS
Zeitra adapts your nutrition and training to your menstrual cycle — gentler sessions and iron-forward meals when you need them, progression when your energy peaks. Log symptoms in a tap and Ria adjusts your day. Cycle tracking is always optional, private, and never sold.

PERFECT FOR
Nurses, doctors, and healthcare workers • Warehouse, logistics and factory teams • First responders, security and emergency services • Hospitality and retail • Pilots, drivers and anyone on a rotating roster

PRIVACY FIRST
Your data is never sold. Cycle and health data are treated as sensitive, consent-based, and you can export or delete everything in one tap from Settings. Traffic is encrypted end to end.

MEMBERSHIP
Start with a 7-day free trial, then Zeitra Pro is $9.99/month or $59/year. Cancel anytime.

Zeitra is educational wellness guidance, not medical advice. If you have a medical condition, are pregnant, or take medication, consult a qualified healthcare provider.

Eat with your clock. Train on your time. Download Zeitra.
```

### ASO keyword targets (weave naturally; Google indexes the descriptions)
`shift work`, `night shift`, `nurses`, `circadian`, `meal timing`, `chrono nutrition`, `macro tracker`, `cycle syncing`, `shift worker diet`, `AI fitness coach`, `photo food log`, `caffeine`.

---

## 2. Graphic assets (files generated in `docs/store-assets/`)

| Asset | Spec | File |
|---|---|---|
| App icon | 512×512 PNG, 32-bit | `icon-512.png` |
| Feature graphic | 1024×500 PNG/JPG | `feature-graphic.png` |
| Phone screenshots | 2–8, min 320px, 9:16-ish PNG | `screenshot-1..8.png` |

Screenshots included (real app screens): home, tonight's rhythm timeline, Ria chat, plate + macros, cycle phase, Crew community, workout, insights. **Add a 1–2 word caption band to each in Play Console** (optional but lifts conversion).

Optional: a 30-second promo video (YouTube link) — highest-converting asset if you can record a screen walkthrough later.

---

## 3. Data Safety form (Play Console → App content → Data safety)

**Does your app collect or share user data?** YES (collect), NO (share — no data sold or shared with third parties for their own use).
**Is all data encrypted in transit?** YES.
**Do you provide a way to request data deletion?** YES — in-app (Settings → Privacy & Data → Delete account) and via privacy@zeitra.app.

Declare these **collected** data types (all: purpose = App functionality + Account management; NOT shared; NOT for ads):

| Category | Types | Optional? |
|---|---|---|
| Personal info | Name, Email address | Required |
| Health & fitness | Health info (weight, sleep, cycle, symptoms), Fitness info (workouts) | Optional |
| Photos | Photos (meal photos, sent to AI for macro estimation) | Optional |
| App activity | In-app actions, other user-generated content (posts/comments) | Optional |
| App info & performance | Crash logs, Diagnostics | Required |
| Device or other IDs | Device ID (crash reporting only) | Required |

**Financial info:** NOT collected (all payment handled by Google Play — the app never sees card data).
**Location:** NOT collected (region/timezone are user-provided settings, not device location).

---

## 4. Content rating (IARC questionnaire)

Category: **Utility / Health & Fitness** (not a game).
- Violence, sexual content, profanity, controlled substances, gambling: **No** to all.
- **Does the app let users interact / communicate?** **Yes** (Crew community + coach chat).
- **Can users share content / user-generated content?** **Yes** (community posts, comments).
- **Does it share user location with other users?** **No.**

Expected rating: **Everyone / PEGI 3** (the UGC answers add a "users interact" disclosure but don't raise the age rating for wellness content).

---

## 5. Subscription products (Play Console → Monetize → Subscriptions)

Create two subscriptions. **Product IDs must match the server's `productIdToTier` mapping in `services/subscription-service/src/iap-validator.ts` — verify/align before going live.**

| Product ID (suggested) | Name | Base plan | Price | Intro offer |
|---|---|---|---|---|
| `zeitra_pro_monthly` | Zeitra Pro (Monthly) | Auto-renew, 1 month | $9.99 | 7-day free trial |
| `zeitra_pro_annual` | Zeitra Pro (Annual) | Auto-renew, 1 year | $59.00 | 7-day free trial |

Grace period: 7 days (recommended). Account hold: on.

⚠️ **These do nothing until Play Billing is wired in the app — see §7.**

---

## 6. Pre-launch checklist

- [ ] Upload AAB to **Internal testing** track first (fast review, add yourself as a tester)
- [ ] Complete Store listing (§1) + upload assets (§2)
- [ ] Complete Data safety (§3) + Content rating (§4)
- [ ] Set up App access (if any feature is behind login, give Google a test account)
- [ ] Fill legal placeholders in privacy.md/terms.md (company address, governing law) before Production
- [ ] Create subscription products (§5)
- [ ] **Wire + test Play Billing (§7) on the internal track**
- [ ] Promote Internal → Closed/Open testing → Production

---

## 7. ⚠️ The money path is NOT wired yet (blocker for paid launch)

Current state: the paywall's "Upgrade" button calls a server `upgrade({tier})` that grants Pro **without charging** — a dev stub. There is **no billing library** in the app, so no real purchase can happen. Server-side receipt *validators* exist (`iap-validator.ts`) but nothing generates a receipt.

To actually charge users, one of:
- **RevenueCat** (recommended for speed): `react-native-purchases`, free under $2.5k/mo, handles the Google purchase + receipt validation + entitlements. ~1 day to wire + test.
- **`react-native-iap` + existing server validators**: more control, more wiring/testing (~1–2 days). Reuses `validateGoogleReceipt`.

Either way, Play Billing can only be **fully tested after** the AAB is on an internal track with the products live + a license tester. So: submit to internal testing now (unblocks review + listing), wire billing in parallel, promote to production once a real test purchase succeeds.
