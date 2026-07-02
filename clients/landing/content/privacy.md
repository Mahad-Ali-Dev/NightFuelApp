# Zeitra Privacy Policy

**Last updated:** 2026-07-02
**Version:** 1.1

> **⚠️ Legal review required before launch.** This is a working draft tailored to Zeitra's actual data practices. Have an attorney review before posting publicly. The structure follows GDPR + CCPA + Apple App Store Connect privacy nutrition label requirements.

---

## 1. Who we are

Zeitra is operated by **Tase LLC** ("Zeitra," "we," "us," "our"). This Privacy Policy explains how we collect, use, share, and protect your personal information when you use the Zeitra mobile or web application (the "Service").

If you have questions, contact: **privacy@zeitra.app**.

## 2. What we collect

We collect only what's needed to make Zeitra work for you.

### 2.1 Account information

- Email address
- Display name
- Password (stored as a bcrypt hash — never plain text), if you sign up with email
- **Sign in with Google / Sign in with Apple** — if you use social sign-in, we receive your verified email address, your name (when the provider shares it), and a stable account identifier from Google or Apple. We verify these tokens cryptographically on our servers; we never receive your Google or Apple password.
- **Email verification codes (OTP)** — when you register with email we send a 6-digit code to verify your address. Codes are stored only as keyed cryptographic hashes and expire within 10 minutes.
- Region, timezone, locale
- Role (user, coach, etc.)

### 2.2 Health & fitness data (you provide)

- Date of birth, biological sex, height, weight
- Sleep schedule, shift type, work hours, sleep window
- Dietary preferences, dietary restrictions, allergies
- Health conditions you choose to disclose (e.g., acne, injuries, diabetes — only if you select them)
- Meal logs (foods, quantities, timestamps), hydration and fasting windows
- Workout logs (exercises, sets, reps, weights) and personal records
- Body measurements and progress photos
- Sleep and recovery logs
- **Menstrual-cycle data (optional)** — if you enable cycle tracking, we store the cycle dates and phases you log. This is sensitive health data: it is used **only** to adapt your nutrition and training recommendations, is **never sold**, is never shared with other users, and is never used for advertising. You can disable cycle tracking and delete this data at any time.

### 2.3 Health data from connected services & devices (opt-in)

- **Apple Health (HealthKit)** — with your permission we read sleep, activity, heart rate, HRV, steps, and workout data. We never write to HealthKit unless you explicitly grant write permission.
- **Health Connect (Android)** — with your permission we read the equivalent data types on Android.
- **Bluetooth wearables** — if you connect a watch or band directly over Bluetooth, we read live heart-rate and battery data from the device. Pairing happens on your phone; we store the resulting health metrics with your account like any other health data.

You can disconnect any source at any time in **Settings → Connected Devices**; disconnecting stops new collection.

### 2.4 AI features (chat, voice, photo logging)

- **Ria chat & plan generation** — messages you send to the AI coach and the resulting responses are processed by Anthropic's Claude API on our behalf. We log AI interactions on our servers for service improvement and abuse prevention.
- **Voice coaching** — if you talk to Ria, your speech is converted to text using the speech-recognition service on your device platform; the resulting text is processed like a chat message. We do not store raw audio on our servers.
- **AI photo meal logging** — when you snap a plate, the photo is transmitted to our AI provider to estimate the foods and macros, and the estimate is stored in your meal log. Don't include other people or sensitive surroundings in meal photos.

We **never** include your email, full name, or government-issued IDs in prompts sent to the AI provider. We do not allow the AI provider to use your data to train their general models.

### 2.5 Community, coaching & messages

- **Crew (community)** — posts, comments, likes, your display name, avatar and leaderboard standing are visible to other Zeitra users. Don't post health details you want to keep private.
- **Coach relationships** — if you connect with a coach, your coach can see the profile and progress data needed to coach you, and your chat messages with them are stored to provide the service.
- **Challenges & achievements** — participation and results may appear on leaderboards under your display name.

### 2.6 Device & technical data

- Device model, OS version, app version
- Anonymous device identifier (used for crash reports — not advertising)
- Locale, timezone
- IP address (used for region detection and abuse prevention; not stored long-term)
- **Push notification token** (Expo / Firebase Cloud Messaging) — only if you grant notification permission; used solely to deliver your notifications

### 2.7 Usage data

- Screens viewed, feature usage, in-app actions (event-level — used to improve the product)
- Crash reports (no identifying request bodies; PII fields like `email`, `password`, `Authorization` headers are automatically redacted before being sent to our error tracker)

### 2.8 Payment data

We do not store credit card numbers. Payment is processed by:
- **Apple App Store** (iOS in-app purchases) or **Google Play** (Android in-app purchases) — we receive only the subscription tier and renewal status.
- **Stripe** (if you purchase on the web) — we receive a tokenized payment method ID and the subscription status; full card data never touches our servers.

## 3. How we use your data

We use your information to:

- Provide the core service (chrono-nutrition timing, meal planning, workout planning, sleep tracking, AI coaching)
- Generate personalized plans and recommendations timed to your shift pattern and, if enabled, your cycle
- Operate community features, leaderboards, challenges and coach relationships
- Verify your email address and secure your account (OTP, social sign-in verification)
- Process subscriptions and payments
- Send service-related notifications (push and email — e.g., verification codes, reminders you configure, chat messages)
- Detect and prevent fraud and abuse
- Improve app reliability (crash reports, performance monitoring)
- Comply with legal obligations

We do **not** sell your personal information to third parties. We do not show targeted advertising in Zeitra.

## 4. Who we share data with

We share data only with service providers who help us run the Service, under contracts that limit their use to what we authorize:

| Provider | Purpose | Data shared |
|----------|---------|-------------|
| **Hostinger** (VPS hosting) | Application servers & databases | All application data (encrypted at rest) |
| **Anthropic** (Claude AI) | AI coaching, plan generation, photo meal estimates | Your AI prompts, meal photos and conversation context (no email/name) |
| **Google** (Sign-In, Firebase Cloud Messaging) | Social sign-in verification; Android push delivery | OAuth token verification; push token and notification payloads |
| **Apple** (Sign in with Apple, APNs) | Social sign-in verification; iOS push delivery | OAuth token verification; push token and notification payloads |
| **Resend** | Transactional email (verification codes, password resets) | Your email address and the message content |
| **Sentry** | Error tracking | Stack traces, device model, anonymous device ID; PII (email, tokens, passwords) is scrubbed before transmission |
| **Apple App Store / Google Play** | iOS/Android subscriptions | Receipt validation tokens |
| **Stripe** | Web subscription billing (if used) | Tokenized payment method, subscription state |

We may also disclose your data when required by law (court order, valid subpoena), to protect rights and safety, or in connection with a corporate transaction (merger, acquisition).

## 5. Your rights

Depending on where you live, you may have the right to:

- **Access** — request a copy of the personal data we hold about you
- **Rectify** — correct inaccurate data
- **Delete** — request deletion of your account and data ("right to be forgotten" / GDPR Art. 17)
- **Port** — receive your data in a machine-readable format (GDPR Art. 20)
- **Object** — object to certain processing
- **Restrict** — limit how we use your data
- **Withdraw consent** — at any time, where processing is based on consent (e.g., cycle tracking, connected devices)
- **Lodge a complaint** — with your local data protection authority

You can do the two most important ones **directly in the app**: **Settings → Privacy & Data** lets you **export your data** and **delete your account** without emailing anyone. For anything else, email **privacy@zeitra.app**.

We will respond within 30 days (GDPR) or 45 days (CCPA), whichever applies to you.

## 6. Retention

- **Active accounts:** while your account is open
- **Meal/workout/sleep logs:** indefinitely while account active; FREE tier history view limited to 30 days but data is retained
- **AI prompts & meal photos:** 90 days for abuse review, then auto-deleted
- **Verification codes (OTP):** consumed or expired codes are invalidated immediately and purged routinely
- **Coach chat messages:** while the coach relationship or account is active
- **Crash reports:** 90 days
- **Deleted accounts:** purged within 30 days from active databases. Backups are rotated within 90 days.

## 7. Security

- All traffic uses TLS 1.2+ in transit
- Passwords are stored as bcrypt hashes; social sign-in tokens are verified against the provider's public keys and never stored raw
- Verification codes are stored only as keyed (HMAC) hashes with short expiry and attempt limits
- Auth tokens are stored in iOS Keychain / Android EncryptedSharedPreferences (never in plain text)
- Database is encrypted at rest
- Production services authenticate to each other with mutual secrets
- We follow defense-in-depth principles (rate limiting, anti-enumeration responses, deep-link allowlists, AI input sanitization, etc.)

No system is perfectly secure. If we suffer a breach affecting your data, we will notify you and the relevant authorities within 72 hours of becoming aware (per GDPR Art. 33).

## 8. Children

Zeitra is intended for users **17 and older**. We do not knowingly collect data from children under 13. If you believe a child has signed up, contact us immediately and we will delete the account.

## 9. International transfers

If you are in the EEA, UK, or Switzerland, your data may be transferred to the United States or other countries where our service providers operate. We rely on Standard Contractual Clauses or equivalent safeguards for these transfers.

## 10. Changes to this policy

We will post any updates here and notify users in the app for material changes. Continued use after a material change means you accept the updated policy.

## 11. Contact

- **Privacy questions:** privacy@zeitra.app
- **Data subject requests:** privacy@zeitra.app (or in-app: Settings → Privacy & Data)
- **Mail:** Tase LLC, [Address — fill in before publishing]
