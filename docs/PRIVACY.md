# Zeitra Privacy Policy

**Last updated:** 2026-05-04
**Version:** 1.0

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
- Password (stored as an Argon2id / bcrypt hash — never plain text)
- Region, timezone, locale
- Role (user, coach, etc.)

### 2.2 Health & fitness data (you provide)

- Date of birth, biological sex, height, weight
- Sleep schedule, shift type, work hours
- Dietary preferences, dietary restrictions, allergies
- Health conditions you choose to disclose (e.g., acne, injuries, diabetes — only if you select them)
- Meal logs (foods, quantities, timestamps)
- Workout logs (exercises, sets, reps, weights)
- Body measurements and progress photos
- Sleep logs

### 2.3 Health data (from connected services — opt-in)

If you enable Apple Health integration, we may read sleep, activity, heart rate, and workout data from HealthKit. We never write to HealthKit unless you explicitly grant write permission.

### 2.4 AI conversation data

When you use the AI coach features (chat, plan generation, meal scoring), the messages you send and the resulting AI responses are processed by Anthropic's Claude API on our behalf. The text content is transmitted in flight to Anthropic for the purpose of generating your response. We log AI interactions on our servers for service improvement and abuse prevention.

We **never** include your email, full name, or government-issued IDs in prompts sent to the AI provider.

### 2.5 Device & technical data

- Device model, OS version, app version
- Anonymous device identifier (used for crash reports — not advertising)
- Locale, timezone
- IP address (used for region detection and abuse prevention; not stored long-term)
- Push notification token (only if you grant notification permission)

### 2.6 Usage data

- Screens viewed, feature usage, in-app actions (event-level — used to improve the product)
- Crash reports (no identifying request bodies; PII fields like `email`, `password`, `Authorization` headers are automatically redacted before being sent to our error tracker)

### 2.7 Payment data

We do not store credit card numbers. Payment is processed by:
- **Apple App Store** (iOS in-app purchases) or **Google Play** (Android in-app purchases) — we receive only the subscription tier and renewal status.
- **Stripe** (web purchases) — we receive a tokenized payment method ID and the subscription status; full card data never touches our servers.

## 3. How we use your data

We use your information to:

- Provide the core service (meal planning, workout planning, sleep tracking, AI coaching)
- Generate personalized plans and recommendations
- Process subscriptions and payments
- Send service-related notifications (push and email)
- Detect and prevent fraud and abuse
- Improve app reliability (crash reports, performance monitoring)
- Comply with legal obligations

We do **not** sell your personal information to third parties. We do not show targeted advertising in Zeitra.

## 4. Who we share data with

We share data only with service providers who help us run the Service, under contracts that limit their use to what we authorize:

| Provider | Purpose | Data shared |
|----------|---------|-------------|
| **Supabase** (Postgres hosting) | Primary database | All application data (encrypted at rest) |
| **Upstash** (Redis hosting) | Caching, event bus, rate limiting | Session tokens, transient cache entries |
| **Anthropic** (Claude AI) | AI plan generation and chat | Your AI prompts and conversation context (no email/name) |
| **Sentry** | Error tracking | Stack traces, device model, anonymous device ID; PII (email, tokens, passwords) is scrubbed before transmission |
| **Apple App Store / Google Play** | iOS/Android subscriptions | Receipt validation tokens |
| **Stripe** | Web subscription billing | Tokenized payment method, subscription state |
| **AWS / Railway** | Application hosting | Server-side compute and storage |

We may also disclose your data when required by law (court order, valid subpoena), to protect rights and safety, or in connection with a corporate transaction (merger, acquisition).

## 5. Your rights

Depending on where you live, you may have the right to:

- **Access** — request a copy of the personal data we hold about you
- **Rectify** — correct inaccurate data
- **Delete** — request deletion of your account and data ("right to be forgotten" / GDPR Art. 17)
- **Port** — receive your data in a machine-readable format (GDPR Art. 20)
- **Object** — object to certain processing
- **Restrict** — limit how we use your data
- **Withdraw consent** — at any time, where processing is based on consent
- **Lodge a complaint** — with your local data protection authority

To exercise any of these rights, email **privacy@zeitra.app** or use the in-app **Settings → Privacy → Delete my account** flow.

We will respond within 30 days (GDPR) or 45 days (CCPA), whichever applies to you.

## 6. Retention

Our default stance is **storage-limitation by purpose**: we keep your data only while it serves you, and we delete it promptly when you ask. Unless a retention window is configured (below), your logged history is **kept until you delete it** (or close your account).

- **Active accounts:** while your account is open
- **Meal/workout/sleep logs and body measurements:** retained indefinitely while your account is active so your history and trends stay available; FREE tier history *view* is limited to 30 days but the data is retained. These are **never** auto-deleted on a timer — only when you delete the item, delete your account, or request erasure.
- **Wearable / health-app samples** (raw readings imported from Apple Health / Google Health Connect): retained while your account is active. Because these are a raw archive (your derived sleep history is stored separately), we can apply an optional **time-based retention window** to age out raw samples older than a configured number of days; this is **off unless explicitly enabled** by the operator.
- **AI prompts / interaction telemetry:** AI prompt text is retained up to 90 days for abuse review, then auto-deleted. AI usage/cost telemetry (token counts, no message content) is operational data we may age out on a configured retention window.
- **Crash reports:** 90 days
- **Deleted accounts:** purged within 30 days from active databases. Backups are rotated within 90 days.

> **Configurable retention (storage limitation, GDPR Art. 5(1)(e)).** Zeitra implements an optional, configurable time-based purge for **archival** data (raw health samples and AI usage telemetry). It is **disabled by default** — when no retention window is set, the data is **kept until you delete it or your account**. When the operator configures a window (N days), data of that type older than N days is automatically and permanently deleted. **User-valuable history** (sleep sessions, body measurements, period/cycle logs) is **excluded** from any automatic timer and is only ever removed at your request (account deletion / right to erasure) — see §5.

## 7. Security

- All traffic uses TLS 1.2+ in transit
- Passwords are stored as Argon2id / bcrypt hashes
- Auth tokens are stored in iOS Keychain / Android EncryptedSharedPreferences (never in plain text)
- Database is encrypted at rest
- Production services authenticate to each other with mutual JWT
- We follow defense-in-depth principles (rate limiting, deep-link allowlists, AI input sanitization, etc.)

No system is perfectly secure. If we suffer a breach affecting your data, we will notify you and the relevant authorities within 72 hours of becoming aware (per GDPR Art. 33).

## 8. Children

Zeitra is intended for users 17 and older. We do not knowingly collect data from children under 13. If you believe a child has signed up, contact us immediately and we will delete the account.

## 9. International transfers

If you are in the EEA, UK, or Switzerland, your data may be transferred to the United States or other countries where our service providers operate. We rely on Standard Contractual Clauses or equivalent safeguards for these transfers.

## 10. Changes to this policy

We will post any updates here and notify users in the app for material changes. Continued use after a material change means you accept the updated policy.

## 11. Contact

- **Privacy questions:** privacy@zeitra.app
- **Data subject requests:** privacy@zeitra.app
- **Mail:** Tase LLC, [Address — fill in before publishing]
