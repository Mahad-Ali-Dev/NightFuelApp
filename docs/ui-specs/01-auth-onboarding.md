# Zeitra UI Spec — 01 · Auth & Onboarding

> **Purpose.** Paste-into-GPT mockup spec for every Auth & Onboarding screen. Each screen below is reverse-engineered from the live React Native source in `clients/mobile/app/(auth)/*` and `clients/mobile/app/(onboarding)/*`, with token values mirrored from `clients/mobile/src/theme/*` and component recipes from `clients/mobile/src/components/ui/*`. Nothing here is invented — every element, string, color token, radius, spacing, and animation is taken from the code.
>
> Render order to follow: read the **Condensed Design System** first (so the file is self-contained), then render each screen top-to-bottom exactly as its **Layout** section lists.

---

## ⚠️ Two things GPT must know before rendering

1. **`accent.coral` IS lime.** The brand accent token is historically keyed `accent.coral` (legacy name). Its *value* is Zeitra lime **`#A8CC3C`**. Every time this spec or the code says "coral", render **lime `#A8CC3C`**. There is no coral/orange/pink anywhere — `gradients.coral` and `gradients.coralCta` both resolve to `['#A8CC3C', '#93B82E']` (lime → lime-deep).
2. **File names ≠ screen content.** Several onboarding route files are misnamed. The *rendered* screen is what matters. Map:

| Route file | Actual on-screen title | What it collects |
|---|---|---|
| `(onboarding)/metrics-goals.tsx` | **Your Biological Profile** | DOB, weight, height, biological sex |
| `(onboarding)/cycle-basics.tsx` | **Cycle tracking** | Menstrual-cycle opt-in (FEMALE only) |
| `(onboarding)/shift-type.tsx` | **What is your primary goal?** | Fitness goal (grid + carousel) |
| `(onboarding)/sleep-schedule.tsx` | **Your Lifestyle** | Shift pattern, lifestyle, experience, activity, sleep window, health conditions |
| `(onboarding)/dietary-needs.tsx` | **Your Nutrition** | Dietary preference + diet mode |
| `(onboarding)/environment.tsx` | **Work Environment** | Activity level (re-asked, richer copy) |
| `(onboarding)/ai-optimization.tsx` | **AI Optimization** | Coach intensity level |
| `(onboarding)/permissions.tsx` | **Final Steps** | Notifications + Apple Health toggles |
| `(onboarding)/profile-summary.tsx` | **Your Onboarding Summary** | Read-only recap + Finish & Sync |

> **Onboarding flow note (actual runtime order, from the `router.push` calls):**
> Register → **Biological Profile** (`metrics-goals`) → *(FEMALE only)* **Cycle tracking** (`cycle-basics`) → **Goal** (`shift-type`) → **Lifestyle** (`sleep-schedule`) → **Nutrition** (`dietary-needs`) → **Summary** (`profile-summary`).
> `environment.tsx` and `ai-optimization.tsx` exist and are fully styled but are **not** in the linear push-chain from register (they route to each other / to summary). Spec them as standalone screens; they share the onboarding visual language.

---

## Condensed Zeitra Design System (self-contained)

**Brand.** Athletic, premium, high-contrast, energetic. Tagline **"STRONG TODAY. BETTER EVERYDAY."** Logo = lime "Z" + dumbbell on near-black. Feel: a premium training-wearable companion app, not a neon gym poster. Dark "Aurora" frosted-glass surfaces + a single energetic lime accent.

**Golden rules.** (1) **Ink-on-lime, never white-on-lime** — every lime CTA uses ink `#0A0C12` text + icons. (2) **One accent** — lime is the only brand color; cyan/purple/amber/red are *semantic*, used sparingly. (3) **Glass, not flat** — translucent fill, 1px hairline border at 6–10% white, generous padding, large radius.

### Color tokens

| Token | Hex | Use |
|---|---|---|
| `background.primary` | `#0A0C12` | App bg (deep near-black). Also = **ink** for text/icons on lime. |
| `background.secondary` | `#13161F` | Default card / input fill. |
| `background.tertiary` | `#1B2030` | Elevated surface, neutral icon boxes. |
| `background.quaternary` | `#242B3D` | Highest elevation. |
| `border.default` | `#222838` | 1px card border / divider. |
| `border.light` | `#2F3650` | Brighter border. |
| **Glass hairline** | `rgba(255,255,255,0.10)` | Signature frosted border on GlassCard (= `withAlpha(text.primary, 0.10)`). |
| `accent.coral` **(= LIME)** | **`#A8CC3C`** | **PRIMARY.** CTAs, active states, progress, selected rings, accent icons, links. |
| `accent.coralDark` / `pink` | `#93B82E` | Lime-deep (CTA gradient end). |
| `accent.cyan` / `success` | `#00D4AA` | Success, progress, biological/lifestyle accents, "Now" pill, checkmarks in option lists. |
| `accent.purple` | `#7C4DFF` | AI / Coach (Maximum Optimization). |
| `accent.blue` | `#4FC3F7` | Informational (Gentle Guidance). |
| `accent.emerald` | `#10B981` | Positive affirmations (passwords-match, strong-pw, met requirements). |
| `warning` / `amber` | `#FFB300` | Caution (Fair password tier). |
| `error` / `red` | `#FF4444` | Danger, validation errors, Weak tier. |
| `text.primary` | `#FFFFFF` | Headlines, values, active labels. |
| `text.secondary` | `#9BA3B4` | Body, subtitles, inactive labels. |
| `text.tertiary` | `#7B8497` | Hints, placeholders, faint captions. |
| `text.inverse` | `#0A0C12` | Ink on lime fills. |

**Gradients:** `coral`/`coralCta` = `['#A8CC3C','#93B82E']` (horizontal, x0→x1, lime→lime-deep — used on every CtaButton & the Permissions/Summary hero badges via `gradients.coral`). `cyan` = `['#00D4AA','#4FC3F7']` (Summary hero badge). `purple` = `['#7C4DFF','#B47CFF']`. `card` = `['rgba(25,29,40,0.72)','rgba(12,14,20,0.88)']` (Card glass variant).

### Spacing scale (4px grid)
`xxs 2 · xs 4 · sm 8 · md 12 · lg 16 · xl 20 · 2xl 24 · 3xl 32 · 4xl 40 · 5xl 48 · 6xl 64`.

### Radius scale
`sm 4 · md 10 · lg 14 · xl 20 · 2xl 24 · 3xl 28 · full 9999`.

### Icon sizes
`xs 16 · sm 20 · md 24 · lg 28 · xl 32 · 2xl 40 · 3xl 48`.

### Typography (Inter for UI, JetBrains Mono for stats)

| Style | Font | Size / line-height | Tracking | Notes |
|---|---|---|---|---|
| `display` | Inter ExtraBold (800) | 36 / 44 | -0.5 | Screen titles. (Login overrides to 40/46, register/forgot to 32/40.) |
| `h1` | Inter Bold (700) | 28 / 36 | -0.3 | |
| `h2` | Inter Bold (700) | 24 / 32 | -0.2 | Forgot-success title. |
| `h3` / `heading` | Inter SemiBold (600) | 20 / 28 | — | Card titles, option labels. |
| `subtitle` / `subhead` | Inter SemiBold (600) | 16 / 24 | — | Option row labels, rail card title. |
| `body` | Inter Regular (400) | 15 / 22 | — | Body copy. |
| `bodySm` | Inter Regular (400) | 14 / 20 | — | |
| `caption` | Inter Regular (400) | 12 / 16 | — | Descriptions, hints. |
| `captionMedium` | Inter Medium (500) | 12 / 16 | — | Chips, "Now". |
| `overline` | Inter SemiBold (600) | 11 / 16 | **1.5**, UPPERCASE | Section eyebrows / kickers. |
| `statSmall` | JetBrains Mono SemiBold | 24 / 32 | — | Summary stat values. |

### Shared component recipes (used across these screens)

- **CtaButton** (primary action). Lime gradient fill `gradients.coralCta` (horizontal), **radius 14**, `overflow:hidden`, row + center, gap 8. **Ink** label `#0A0C12` weight 800 tracking 0.3, **ink** leading icon. Subtle lime **glow** halo (`shadows.glow` = shadowColor lime, opacity 0.18, radius 9 / Android elevation 4). Sizes: sm h40 / fs13 / icon15 · **md h48 / fs15 / icon17** (default) · **lg h56 / fs17 / icon19**. `loading` → ink `ActivityIndicator` replaces content. `disabled`/`loading` → opacity 0.6. **Pressed → scale 0.97.**
- **Button** (secondary). Variants: `primary` (same lime gradient, ink text), `outline` (transparent, 1.5px lime border, lime text), `ghost` (transparent, secondary-gray text), `secondary` (tertiary bg), `danger` (red bg). Sizes sm h36 / md h48 / lg h56; radii md/lg/xl respectively. Pressed → scale 0.98 + opacity dip.
- **GlassCard** (frosted surface). Outer View owns radius (**default 24**, override via `radius`), `overflow:hidden`, **1px border `rgba(255,255,255,0.10)`**; inner is a dark BlurView (intensity 40). Optional `glow={color}` adds a soft halo. This is the standard container for forms and option panels.
- **Card** (`variant="glass"`). LinearGradient `gradients.card` fill, **radius 20 (xl)**, 1px `border.default`, plus a faint top sheen highlight (white 0.06→0). `variant="elevated"` = solid `background.tertiary` fill, radius 20. Used for selectable option rows; selected rows add a 1.5px accent border + accent glow.
- **Input** (text field). Label 13px/500 secondary above. Field: `background.secondary` fill, **radius 14**, **height 52**, horizontal pad 16, leading Ionicon 20px in `text.tertiary`, text 15px white, placeholder `text.tertiary`. Border 1px `border.default`; **focused → 1px lime border**; **error → 1.5px red border + red 12px error text below**. Optional right icon (20px tertiary) as a pressable (used for password show/hide). Container `marginBottom 16`.
- **DateTimeField** (native picker trigger). Optional 16px/600 white label (`heading`, marginBottom 12). Trigger row: bordered box `background.secondary` fill, **radius 14**, **height 52**, pad-h 12, leading calendar/clock Ionicon 20px secondary, then value text 16px (white if set, tertiary placeholder `YYYY-MM-DD` / `HH:MM` if empty). Error → red border + red 12px text below. Optional lime/cyan "Now" pill to the right. Pressed → opacity 0.7. Opens native spinner (iOS) / dialog (Android), 24-hour.
- **Skeleton.** Soft glass block: `background.tertiary` fill, pulsing opacity 0.4↔1 (750ms each way). Used by Summary while syncing.

### Motion language
Reanimated entrance: **`FadeInDown`** with **staggered per-section delays** (springy or duration-based). Cards reveal with spring physics; CTAs/cards get **pressed-scale 0.97** (CtaButton) / **0.96** (selection tiles/rail) / **0.98** (Button). Selected option toggles only swap border *color* (width stays constant) to avoid layout jitter.

---

# AUTH

---

## A1 · Login — `app/(auth)/login.tsx`

**Purpose.** Returning-user sign-in. Branded hero + email/password form + trust cue + register link. On success routes to `/` (index decides onboarding vs tabs).

### Layout (top → bottom)
Root: `SafeAreaView`, bg `background.primary`, **light** status bar. `KeyboardAvoidingView` (iOS padding). Vertically-centered `ScrollView` (content `justifyContent:center`), horizontal pad **24 (2xl)**, top pad 40 (4xl), bottom pad 32 (3xl). No bottom tab bar (auth context).

1. **Branded hero** (left-aligned, `alignItems:flex-start`, marginBottom 32):
   - **Logo badge** — 72×72 rounded square, **radius 24 (2xl)**, bg lime @10% (`withAlpha(accent.coral,0.1)`), 1px lime @30% border, lime **glow**. Contains the Zeitra logo image (`assets/images/zeitra-logo.png`), 42×42, contain-fit. marginBottom 20 (xl).
   - **Kicker** overline: **"Welcome back"** in lime, marginBottom 4 (xs).
   - **Wordmark title** — display, **40px / lineHeight 46 / letterSpacing -1**: renders **"Zeit"** in white + **"ra"** in lime (one line). `accessibilityRole=header`.
   - **Subtitle** — subtitle style (body font), `text.secondary`, marginTop 8: **"Fuel your shift. Pick up right where you left off."**
   - **Trust chip** — pill (`radius full`), bg `background.secondary`, 1px `border.default`, pad-h 12 / pad-v 4, marginTop 16, self-start, row gap 4: lime `shield-checkmark` icon (13px) + caption (500, `text.tertiary`): **"Encrypted, private sign-in"**.

2. **Form** — `GlassCard`, padding 20 (xl):
   - Section label overline (`text.secondary`, marginBottom 16): **"Sign in to your account"**.
   - **Email Input** — label "Email", placeholder **"you@example.com"**, `mail-outline` leading icon, email keyboard, autocomplete email. Inline blur validation: on blur, if non-empty & invalid → red error below: **"Enter a valid email, e.g. you@example.com"**.
   - **Password Input** — label "Password", placeholder **"Enter your password"**, `lock-closed-outline` leading icon, secure entry, right icon toggles `eye-outline` ↔ `eye-off-outline` (a11y "Show password"/"Hide password"). `returnKeyType=go`, submit → sign in.
   - **Forgot link** — right-aligned, lime, bodySm/600, marginTop -8 / marginBottom 20: **"Forgot password?"** → navigates `/(auth)/forgot-password`. Pressed → opacity 0.6.
   - **Error box** (conditional) — row, red @10% bg, 1.5px red @25% border, **radius 14**, pad 12, marginBottom 16, gap 8: red `alert-circle` (16px) + red error text (`accessibilityRole=alert`).
   - **CtaButton** "Sign In", **size lg**, icon `log-in-outline`, full width, `loading` while submitting.

3. **Register row** (centered, marginTop 32): `text.secondary` body **"Don't have an account? "** + lime body/700 link **"Sign Up"** → `/(auth)/register`. Pressed → opacity 0.6.

### Data / text
Kicker "Welcome back" · title "Zeit**ra**" · subtitle "Fuel your shift. Pick up right where you left off." · trust "Encrypted, private sign-in" · section "Sign in to your account" · fields Email (ph `you@example.com`) / Password (ph `Enter your password`) · "Forgot password?" · CTA "Sign In" · "Don't have an account? Sign Up".

### Interactions & navigation
- Email blur → inline email validity check.
- Submit guard: empty fields → form error **"Please fill in all fields"** (also announced); invalid email → **"Please enter a valid email address"**; on auth failure → server message or **"Login failed. Please try again."** in the error box.
- Success → `router.replace('/')`.
- Forgot link → forgot-password. Sign Up → register.

### States
- **Loading:** CTA shows ink spinner, dims to 0.6, press blocked.
- **Empty:** initial — no errors shown.
- **Error:** inline email error under field (blur) and/or the red form error box (submit/auth). `accessibilityLiveRegion=assertive`.

### Styling per element
Logo badge bg `withAlpha(#A8CC3C,0.1)` / border `withAlpha(#A8CC3C,0.3)` / glow lime. Title white + lime split, ls -1. Trust/forgot/register links all lime. Error box red `#FF4444` @10/25%. CTA = standard lime gradient ink-label lg.

### Animations
Staggered entrance via `enter(i) = FadeInDown.springify().damping(18).mass(0.9).delay(80 + i*45)`: **hero (i0)** → **form (i1)** → **register row (i2)** cascade in ~45ms apart. CTA pressed-scale 0.97. Links pressed opacity 0.6.

---

## A2 · Register — `app/(auth)/register.tsx`

**Purpose.** New-account creation with full validation + live password-strength meter. On success routes into onboarding at `metrics-goals` (Biological Profile).

### Layout (top → bottom)
Root: plain `View`, bg `background.primary`, light status bar, `KeyboardAvoidingView` (iOS padding). `ScrollView`, horizontal pad 24, top pad `insets.top + 16`, bottom pad `insets.bottom + 32`.

1. **Back button** — 44×44 circle (`radius full`), bg `background.secondary`, 1px `border.default`, `arrow-back` 22px white, marginBottom 20. → `router.back()`. Pressed opacity 0.6.

2. **Header** (marginBottom 24):
   - **Logo badge** — 56×56 rounded square radius 24, bg lime @12%, 1px lime @35% border, lime glow; contains a lime `moon` icon (26px).
   - **Kicker** overline lime: **"Get started"** (marginBottom 8).
   - **Title** display, **32 / 40**: **"Create your"** (white) line break **"account"** (lime).
   - **Subtitle** body `text.secondary` marginTop 8: **"Start optimizing your shift nutrition today"**.

3. **Form** — `GlassCard`, padding 20:
   - **Section header row** (space-between, marginBottom 16): overline `text.secondary` **"Your details"** + caption `text.tertiary` **"* Required"** (asterisk lime).
   - **Full Name** — visible 13px/secondary `FieldLabel` "Full Name *" (asterisk lime), then Input placeholder **"John Doe"**, `person-outline` icon, words-capitalize. Blur empty → **"Please enter your name"**.
   - **Email** — label "Email *", Input placeholder **"you@example.com"**, `mail-outline`. Blur → empty **"Email is required"** / invalid **"Enter a valid email address"**.
   - **Password** — label "Password *", Input placeholder **"Min 8 characters"**, `lock-closed-outline`, secure, right eye toggle. Blur → empty **"Password is required"** / weak **"Password does not meet the requirements below"**.
   - **Password Strength** (renders only when password length > 0) — a card: bg white @4%, 1px `border.default`, **radius 14**, pad 12, gap 8:
     - Header row: overline (10px, ls 1, `text.tertiary`) **"Password strength"** + tier label (captionMedium/700) colored by tier — **"Strong"** (`emerald`) / **"Fair"** (`amber`) / **"Weak"** (`error`).
     - **Segmented bar** — 3 segments, each flex-1, height 5, `radius full`, track white @8%; filled segments (count = met rules) animate in (`FadeInDown` 220ms) in the tier color.
     - **Requirements checklist** — 3 rows, each icon (`checkmark-circle` emerald if met / `ellipse-outline` tertiary if unmet, 14px) + label: **"At least 8 characters"**, **"One uppercase letter (A-Z)"**, **"One number (0-9)"**. Met label → secondary; unmet → tertiary.
   - **Confirm Password** — label "Confirm Password *", Input placeholder **"Repeat your password"**, `shield-checkmark-outline` icon, secure (mirrors show/hide via same toggle). Blur → empty **"Please re-enter your password"** / mismatch **"Passwords do not match"**.
   - **Match affirmation** (conditional, when confirm non-empty & equal & no error): row, marginTop -8 / marginBottom 16, gap 6: emerald `checkmark-circle` (14px) + emerald caption/600 **"Passwords match"**.
   - **Error box** (conditional, same recipe as Login) — red @10% bg, 1.5px red @25% border, radius 14, `alert-circle` + red text, `accessibilityLiveRegion=assertive`.

4. **CtaButton** — placed **outside** the GlassCard (so the lime glow halo reads on the dark bg), full width, marginTop 20: **"Create Account"**, **size lg**, icon `rocket-outline`, `loading` while submitting.

5. **Login row** (centered, marginTop 32): `text.secondary` body **"Already have an account? "** + lime body/700 **"Sign In"** → `/(auth)/login`.

### Data / text
Kicker "Get started" · title "Create your / account" · subtitle "Start optimizing your shift nutrition today" · "Your details" / "* Required" · fields: Full Name (ph John Doe), Email (ph you@example.com), Password (ph Min 8 characters), Confirm Password (ph Repeat your password) · strength tiers Strong/Fair/Weak · rules "At least 8 characters" / "One uppercase letter (A-Z)" / "One number (0-9)" · "Passwords match" · CTA "Create Account" · "Already have an account? Sign In".

### Interactions & navigation
- Per-field blur validation (independent inline errors below each field; typing clears the field's error).
- Submit guards (form-level error box + screen-reader announce): missing fields **"Please fill in all fields"** · invalid email **"Please enter a valid email address"** · mismatch **"Passwords do not match"** · weak **"Password must be at least 8 characters with a number and uppercase letter"**.
- Success → `register({displayName,email,password,region:'US'})` then `router.replace('/(onboarding)/metrics-goals')`.
- Failure → server message or **"Registration failed. Please try again."**.
- Back → previous; "Sign In" → login.

### States
- **Loading:** CTA ink spinner, dim, blocked.
- **Empty:** strength meter hidden until typing begins.
- **Validation:** inline per-field red errors; strength tier recolors live; positive match affirmation in emerald.
- **Error:** red form error box at bottom of card.

### Styling per element
Logo badge lime @12% / border lime @35%; moon glyph lime. Title white + lime. Strength card border `border.default`, fills/tier text in emerald/amber/red per tier. Match + met-requirement affirmations emerald `#10B981`. CTA standard lime lg with `rocket-outline`.

### Animations
`FadeInDown` sequence by delay: back (360ms) · header (delay 60 / 420ms) · form (delay 120 / 440ms) · CTA (delay 180 / 440ms) · login row (delay 240 / 440ms). Strength segment fills animate in 220ms. CTA pressed-scale 0.97; links opacity 0.6.

---

## A3 · Forgot Password — `app/(auth)/forgot-password.tsx`

**Purpose.** Account recovery request. Two states: the **form** (enter email) and the **success/"Almost there"** confirmation (email reset isn't live yet → directs to support).

### Layout (top → bottom)
Root: `SafeAreaView`, bg `background.primary`, light status bar.

- **Back button** — 44×44 circle, bg `background.secondary`, 1px `border.default`, `arrow-back` 22px white, marginLeft 24 / marginTop 8. → `router.back()`. Pressed opacity 0.6.

**FORM state** (`KeyboardAvoidingView`, content pad-h 24 / pad-top 32):
1. **Header** — kicker overline lime **"Account recovery"** (marginBottom 8); title display **32/40** marginBottom 16: **"Reset your"** (white) / **"password"** (lime).
2. **GlassCard** padding 24 (2xl):
   - Subtitle body `text.secondary` marginBottom 16: **"Enter the email address associated with your account and we'll send you a link to reset your password."**
   - **Email Input** — label "Email", placeholder **"you@example.com"**, `mail-outline`, email keyboard.
   - **CtaButton** "Send Reset Link", **size lg**, full width, `loading` while submitting.

**SUCCESS state** (plain `View`, content pad-h 24 / pad-top 32):
1. **Header** — title only (kicker hidden in success): **"Reset your / password"** (same display split).
2. **GlassCard** padding 24, centered, gap 12, marginTop 40 (4xl):
   - **Success icon medallion** — 88×88 circle (`radius full`), bg `success` @12%, 1px `success` @35% border, success glow; `checkmark-circle` 48px in `success` cyan.
   - **Kicker** overline `success`: **"Request received"**.
   - **Title** h2 white marginTop 2: **"Almost there"**.
   - **Body** centered `text.secondary`: **"Password reset by email isn't available just yet. Please contact support and we'll help you reset your password."**
   - **Hint row** — pill-ish row, bg `background.secondary`, 1px `border.default`, **radius 14**, pad-v 8 / pad-h 12, marginTop 8, gap 8: `mail-outline` 16px tertiary + caption tertiary **"Reach us at support@zeitra.app"**.
   - **Button** (outline variant) "Back to Sign In", full width, size lg, marginTop 24 → `router.replace('/(auth)/login')`.

### Data / text
Kicker "Account recovery" · title "Reset your / password" · form subtitle (full sentence above) · field Email (ph you@example.com) · CTA "Send Reset Link". Success: "Request received" / "Almost there" / body sentence / "Reach us at support@zeitra.app" / "Back to Sign In".

### Interactions & navigation
- Submit guards via **native `Alert`** (not inline): empty → Alert "Error" / "Please enter your email address." · invalid → Alert "Error" / "Please enter a valid email address."
- On success → set `sent=true`, swap to success state; screen-reader announce: "Request received. Password reset by email is not available yet. Reach us at support@zeitra.app".
- On API error → Alert "Error" with server message or "Failed to send reset link. Please try again."
- "Back to Sign In" → replace to login. Back button → previous.

### States
- **Form:** default.
- **Loading:** CTA ink spinner.
- **Success:** full success card replaces the form.
- **Error:** native Alert dialogs.

### Styling per element
Success medallion + kicker use **cyan `#00D4AA`** (`success`). Title lime split. Hint row neutral glass. Outline button = transparent + 1.5px lime border + lime label.

### Animations
No Reanimated entrance on this screen (state swap only). CTA pressed-scale 0.97; back/buttons pressed opacity dip.

---

# ONBOARDING

> **Common onboarding chrome (applies to every screen below unless noted):** root plain `View`, bg `background.primary`, **light** status bar. Content in a `ScrollView`, padding 20 (xl). A **fixed bottom footer** holds the primary **CtaButton "Continue"** (size lg), pad-h 20, bottom pad 24 (3xl on iOS where noted), with a 1px top hairline (`border.default` or `withAlpha(text.primary,0.06)`) and the page bg. **No bottom tab bar** during onboarding. Continue is **disabled (opacity 0.6)** until the step's `isValid` passes.

---

## O1 · Biological Profile — `app/(onboarding)/metrics-goals.tsx`

**Purpose.** Collect DOB, weight, height, biological sex to compute macro/caloric targets. Branches FEMALE → cycle-basics, everyone else → shift-type (goal).

### Layout (top → bottom)
1. **Title** display white, marginBottom 8: **"Your "** + **"Biological Profile"** (in **cyan** `#00D4AA`).
2. **Subtitle** body `text.secondary`, marginBottom 24: **"We use this to calculate your personalized macro targets and caloric needs."**
3. **Date of Birth** — `DateTimeField` mode=date, label **"Date of Birth"**, `maximumDate=today`, placeholder `YYYY-MM-DD`. Inline error if typed & invalid: **"Enter a valid past date as YYYY-MM-DD"**.
4. **Weight / Height row** (two columns, 12px gutter):
   - **Weight (kg)** Input, placeholder **"75"**, numeric, maxLength 6. Error if >0 fails: **"Enter a weight greater than 0"**.
   - **Height (cm)** Input, placeholder **"180"**, numeric, maxLength 6. Error: **"Enter a height greater than 0"**.
5. **Biological Sex** — overline `text.secondary` **"Biological Sex"** (marginTop 20 / marginBottom 12). Then a **`GlassCard` panel** (pad 12, gap 8) wrapping 4 selectable **Card** rows (each `optionCard`: row, pad 18). Options with leading Ionicon (24px) + `subhead` label, and on select a trailing cyan `checkmark-circle` (20px, pushed right):
     - `male` — **"Male"**
     - `female` — **"Female"**
     - `person` — **"Other"**
     - `help-circle` — **"Prefer not to say"**
   Selected row: Card `variant=elevated`, **1.5px cyan border + cyan glow**, icon + label switch to cyan/white.
6. **Validation summary** (conditional) — polite live-region red caption (marginTop 12) joining active field errors (DOB/weight/height).
7. **Footer** — CtaButton **"Continue"** (lg), disabled until `isValidDob && weight>0 && height>0 && sex`.

### Data / text
Title "Your Biological Profile" · subtitle (above) · "Date of Birth" · "Weight (kg)" ph 75 · "Height (cm)" ph 180 · "Biological Sex" · options Male/Female/Other/Prefer not to say · "Continue".

### Interactions & navigation
- Tap a sex Card → selects (tap again deselects).
- Continue → persists `dateOfBirth, weightKg, heightCm, biologicalSex`; routes **FEMALE → `/(onboarding)/cycle-basics`**, else **→ `/(onboarding)/shift-type`**.

### States
- **Empty/invalid:** Continue disabled; per-field red errors + summary alert.
- **Valid:** Continue enabled (lime).
- No explicit loading/empty here (local form).

### Styling per element
Accent for this screen is **cyan** (title word, selected borders/glows/checkmarks). Inputs/DateTimeField standard. Footer hairline `border.default`-ish, page bg.

### Animations
No staggered entrance; selection Cards get the Card pressed/active state. Continue pressed-scale 0.97. (Selected state swaps border to 1.5px cyan + glow.)

---

## O2 · Cycle Tracking — `app/(onboarding)/cycle-basics.tsx`  *(FEMALE only, opt-in, skippable)*

**Purpose.** Optional menstrual-cycle setup so Zeitra can estimate cycle phase. Default OFF; Continue always available.

### Layout (top → bottom)
1. **Title** display: **"Cycle "** (white) + **"tracking"** (**lime**), marginBottom 8.
2. **Subtitle** body `text.secondary`, marginBottom 20: **"Optional. If you turn this on, Zeitra can show an estimate of your current cycle phase. You can skip this and continue without it."**
3. **Disclaimer card** — `GlassCard` radius 16, 1px lime @22% border, pad 14, marginBottom 16: row with lime `information-circle-outline` (18px) + caption `text.secondary`: **"This is a wellness estimate, not medical advice."**
4. **Opt-in toggle card** — `GlassCard` radius 16, pad 12: row — left stack: heading white **"Enable cycle tracking"** + caption secondary **"Off by default. Turn on to add the optional details below."**; right: native **Switch** (off track `border.default`, **on track lime**, white thumb).
5. **Conditional detail block** (only when toggle ON):
   - **First day of last period** — `DateTimeField` date, label **"First day of your last period"**, max=today. Error: **"Enter a valid past date as YYYY-MM-DD"**.
   - **Two-column row:** **"Avg cycle length (days)"** Input ph **"28"** (numeric, maxLength 2; error **"Cycle length is usually 21-45 days"**) · **"Avg period length (days)"** Input ph **"5"** (maxLength 2; error **"Period length is usually 1-10 days"**).
   - **Regularity** — overline `text.secondary` **"How regular is your cycle?"**, then `GlassCard` panel (pad 12, gap 8) of 3 selectable **Card** rows (icon 22px + title `subhead` + caption desc; selected → 1.5px **lime** border + glow + lime trailing `checkmark-circle`):
     - `checkmark-circle` — **"Regular"** / desc **"My cycle is fairly predictable"**
     - `shuffle` — **"Irregular"** / desc **"My cycle varies a lot"**
     - `help-circle` — **"Not sure"** / desc **"I'd rather just track for now"**
   - **Hormonal contraception card** — `GlassCard` radius 16, pad 12: heading **"Hormonal contraception"** + caption **"If you use it, we just track — no phase estimate is shown."** + Switch (lime on-track).
   - **Validation summary** (conditional) — polite red caption joining active errors.
6. **Footer** — CtaButton **"Continue"** (lg). **Disabled only** when ON *and* a typed value is out of range (`blockingError`); otherwise always enabled.

### Data / text
Title "Cycle tracking" · subtitle (above) · disclaimer "This is a wellness estimate, not medical advice." · toggle "Enable cycle tracking" / "Off by default…" · "First day of your last period" · "Avg cycle length (days)" ph 28 / "Avg period length (days)" ph 5 · "How regular is your cycle?" + 3 options · "Hormonal contraception" / "If you use it, we just track…" · "Continue".

### Interactions & navigation
- Toggle ON → reveals detail block; OFF → hides it and clears any typed detail.
- Regularity tap → select/deselect.
- Continue → persists the cycle fields (or the opt-out) → `router.push('/(onboarding)/shift-type')`.

### States
- **Off (default):** only disclaimer + toggle shown; Continue enabled (skip).
- **On + valid:** details shown; Continue enabled.
- **On + out-of-range typed value:** inline red errors + summary; Continue disabled.

### Styling per element
Accent = **lime** (title word, selected rings/checkmarks, switch on-track, disclaimer/info icons). Disclaimer border lime @22%. Switches: off track `border.default`, on track lime, thumb white.

### Animations
No staggered entrance; Card selections animate active state. Continue pressed-scale 0.97.

---

## O3 · Goal — `app/(onboarding)/shift-type.tsx`

**Purpose.** The first goal decision, surfaced as hero step **"01"**. Two synced entry points: a recommended-goals **carousel** and an all-goals **2-col grid** (both drive the same selection).

### Layout (top → bottom)
1. **Hero step header** (pad-h 20, marginBottom 24):
   - **Eyebrow row** (row, gap 12): a **huge lime numeral** **"01"** (display font, one-off **fontSize 56 / lineHeight 60**) + a small block: h3 `text.tertiary` **"/ 04"** (denominator = **05 for FEMALE flow**, else 04, derived) above an overline lime **"YOUR GOAL"**.
   - **Title** display white marginTop 12 / marginBottom 8: **"What is your "** + **"primary goal"** (lime) + **"?"**.
   - **Subtitle** body `text.secondary`: **"Choose the objective that best describes what you want to achieve with Zeitra."**
2. **Recommended carousel** — `GoalRecommendationRail`, horizontal snapping FlatList, edge pad 20, marginBottom 24:
   - Header row: lime `sparkles` (14px) + overline lime **"POPULAR WITH SHIFT WORKERS"**.
   - Cards (~64% viewport width, capped 240, min-height 132, peeking next card, snap, `decelerationRate=fast`, 12px gaps): each a `GlassCard` radius 20, 1.5px border (lime when selected / white @10% otherwise), containing a 44×44 icon medallion (lime @14% bg / lime @28% border; **selected → solid lime fill + ink glyph + glow**), optional lime `checkmark` badge (24×24) when selected, `subtitle` label + 2-line caption desc. Curated subset = **Fat Loss, General Health, Muscle Gain** (same values as grid).
3. **"ALL GOALS"** overline `text.tertiary` (pad-h 20, marginBottom 12).
4. **2-col grid** (pad-h 20, space-between, 48% columns, 16px row gap) of `GoalGridCard` tiles (min-height 168). Each tile = `GlassCard` radius 24, 1.5px border (lime if selected), padding 16: top row holds a 52×52 lime icon medallion (selected → solid lime + ink icon + glow) and, when selected, a 26×26 lime `checkmark` badge; below, h3 white title + 2-line bodySm secondary description. Items:
   - `flame` — **"Fat Loss"** / **"Lose weight and body fat"**
   - `barbell` — **"Muscle Gain"** / **"Build size and strength"**
   - `body` — **"Maintenance"** / **"Maintain current weight"**
   - `walk` — **"Endurance"** / **"Improve stamina and performance"**
   - `heart` — **"General Health"** / **"Optimal well-being"** (last odd item → full-width)
5. **Clear hint** (conditional, when a goal is selected) — row (pad-h 20, marginTop 4, gap 6): tertiary `information-circle-outline` (14px) + caption tertiary **"Tap your selected goal again to clear it."**
6. **Footer** — CtaButton **"Continue"** (lg), disabled until a goal is chosen.

### Data / text
Hero "01" / "/ 04" / "YOUR GOAL" · title "What is your primary goal?" · subtitle (above) · rail "POPULAR WITH SHIFT WORKERS" (Fat Loss / General Health / Muscle Gain) · "ALL GOALS" · 5 grid goals (labels + descriptions above) · clear hint · "Continue".

### Interactions & navigation
- Tap any rail card **or** grid tile → selects that goal (re-tap the active one → clears it → Continue disables). Both surfaces share one selection state.
- Continue → persists `fitnessGoal` → `router.push('/(onboarding)/sleep-schedule')` (Lifestyle).

### States
- **Empty:** Continue disabled; no clear hint.
- **Selected:** chosen card/tile lifts to lime ring + glow + ink medallion + checkmark; clear hint appears; Continue enabled.

### Styling per element
Everything accent = **lime**. Hero numeral one-off 56px lime. Medallions: idle lime @14% fill / lime @28% border / lime glyph → selected solid lime fill / ink glyph / glow. Borders always 1.5px (color-only change on select).

### Animations
- Header `FadeInDown` 420ms.
- Rail wrapper `FadeInDown.delay(90).duration(440)`.
- Grid tiles **staggered**: `FadeInDown.delay(120 + index*70).duration(440)`.
- Clear hint `FadeInDown` 280ms.
- Rail/grid cards: pressed-in **scale 0.96** (110ms) → out 1.0 (140ms). Continue pressed-scale 0.97.

---

## O4 · Lifestyle — `app/(onboarding)/sleep-schedule.tsx`

**Purpose.** Capture shift pattern, lifestyle, training experience, activity level, sleep window, and optional health conditions to align meal timing + recovery.

### Layout (top → bottom)
1. **Title** display: **"Your "** (white) + **"Lifestyle"** (**lime**), marginBottom 8.
2. **Subtitle** body `text.secondary`, marginBottom 24: **"These signals let us align your meal timing and recovery with how you actually live and work."**
3. **Four single-select chip groups** (each: overline label `text.secondary` marginBottom 12, then a wrapping row of **pill chips** — `radius full`, bg `background.secondary`, 1px `border.default`, pad-h 16 / pad-v 10, captionMedium label; **active chip → lime fill + lime border + lime glow + white label**; 8px gaps):
   - **"Shift Work Pattern"** → Fixed Night · Rotating · Split · Irregular
   - **"Primary Lifestyle"** → Night Shift · Office/Day · Student · Athlete · Freelancer
   - **"Training Experience"** → Beginner · Intermediate · Advanced · Athlete
   - **"Activity Level"** → Sedentary · Light · Moderate · Very Active · Extreme
4. **Sleep Window** — overline `text.secondary` **"Sleep Window"**, then a 2-col row: **DateTimeField** time **"Bedtime"** (default `08:00`) + 12px gutter + **DateTimeField** time **"Wake Up"** (default `16:00`). Each errors with **"Enter a valid time as HH:MM"** if typed invalid.
5. **Validation summary** (conditional) — polite red caption joining active time errors (marginTop 12).
6. **Health Conditions (Optional)** — overline `text.secondary` **"Health Conditions (Optional)"**, then a **`GlassCard` panel** (pad 12) of **multi-select** chips (same pill shape; **active → cyan @16% fill + cyan border + cyan label**): Acne · Injuries · Allergies · Diabetes · Hypertension.
7. Spacer (100px) so content clears the footer.
8. **Footer** (absolute, bg `background.primary` @92%, 1px top hairline `border.default`, pad-h 20, bottom pad 32 iOS / 24 Android) — CtaButton **"Continue"** (lg), disabled until all four single-selects chosen **and** both times valid.

### Data / text
Title "Your Lifestyle" · subtitle (above) · 4 group labels + their chip sets (above) · "Sleep Window" / Bedtime (08:00) / Wake Up (16:00) · "Health Conditions (Optional)" + 5 condition chips · "Continue".

### Interactions & navigation
- Single-select chips: tap to select; tap active again → clears (sets null).
- Health chips: toggle independently (multi-select).
- Bedtime/Wake Up open native time pickers (24h).
- Continue → persists `shiftType, lifestyleType, experienceLevel, activityLevel, sleepWindowStart, sleepWindowEnd, healthConditions` → `router.push('/(onboarding)/dietary-needs')` (Nutrition).

### States
- **Incomplete/invalid:** Continue disabled; time errors inline + summary.
- **Complete:** Continue enabled.

### Styling per element
Single-select active chips = **lime** fill/border/glow (white label). Health (multi) active chips = **cyan** (`#00D4AA`) @16% fill / cyan border / cyan label. Footer is a translucent (92%) bg bar with hairline-width top border.

### Animations
No staggered entrance on this screen; chips use `TouchableOpacity` activeOpacity 0.85. Continue pressed-scale 0.97.

---

## O5 · Nutrition — `app/(onboarding)/dietary-needs.tsx`

**Purpose.** Capture dietary preference + diet mode so plans respect how the user eats.

### Layout (top → bottom)
1. **Title** display: **"Your "** (white) + **"Nutrition"** (**cyan**), marginBottom 8.
2. **Subtitle** body `text.secondary`, marginBottom 16: **"Tell us how you eat so every plan respects your preferences and goals."**
3. **"Dietary Preference"** overline `text.secondary` (marginTop 12 / marginBottom 12), then a **`GlassCard` panel** (pad 12, gap 8) of single-select **Card** rows (`optionCard`: row, pad 18; leading Ionicon 20px + `subhead` label; selected → `variant=elevated`, 1.5px **cyan** border + glow, trailing cyan `checkmark-circle` 24px):
   - `restaurant` — **"No Restrictions"**
   - `leaf` — **"Vegetarian"**
   - `nutrition` — **"Vegan"**
   - `apps` — **"Keto"**
   - `moon` — **"Halal"**
   - `close-circle` — **"Gluten Free"**
4. **"Diet Mode"** overline `text.secondary` (marginTop 20 / marginBottom 12), then a `GlassCard` panel of single-select Card rows (each with a **title + description** stack, selected → cyan border/glow + cyan checkmark):
   - **"Balanced"** / **"Standard healthy focus"**
   - **"Mass Gain"** / **"Surplus for building"**
   - **"Cutting"** / **"Deficit for fat loss"**
   - **"Budget"** / **"Walllet friendly meals"**  *(string in code is misspelled "Walllet" — reproduce as-is)*
   - **"Acne Safe"** / **"Skin health focus"**
   - **"Ramadan"** / **"Fasting friendly"**
5. Spacer (100px).
6. **Footer** — CtaButton **"Continue"** (lg), disabled until both a preference and a mode are chosen.

### Data / text
Title "Your Nutrition" · subtitle (above) · "Dietary Preference" + 6 options · "Diet Mode" + 6 options (labels + descriptions above, incl. literal "Walllet friendly meals") · "Continue".

### Interactions & navigation
- Tap preference / mode Card → select (tap again → deselect).
- Continue → persists `dietaryPreference, dietMode` → `router.push('/(onboarding)/profile-summary')`.

### States
- **Incomplete:** Continue disabled.
- **Complete:** Continue enabled.

### Styling per element
Accent = **cyan** (title word, selected borders/glows/checkmarks). Default preference pre-selected = **"No Restrictions"** (`DietaryPreference.NONE`) on entry.

### Animations
No staggered entrance; Card press uses activeOpacity 0.85, selected = elevated + cyan border/glow. Continue pressed-scale 0.97.

---

## O6 · Work Environment — `app/(onboarding)/environment.tsx`  *(standalone; not in register→summary chain)*

**Purpose.** Ask how physically active the user's shift is, to compute TDEE. Richer, descriptive 4-option list.

### Layout (top → bottom)
1. **Title** display: **"Work "** (white) + **"Environment"** (**cyan**), marginBottom 8.
2. **Subtitle** body `text.secondary`, marginBottom 24: **"How active is your shift? We use this to calculate your total daily energy expenditure (TDEE)."**
3. **`GlassCard` panel** (pad 12, gap 12) of 4 single-select **Card** rows (`envCard`, pad 16). Each row = a **48×48 rounded-24 icon box** (idle bg `background.tertiary` / selected bg cyan @16%) with a 24px icon, a text stack (**heading** label + caption desc, marginTop 4), and a trailing cyan `checkmark-circle` (24px) when selected. Selected → `variant=elevated`, 1.5px **cyan** border + glow:
   - `desktop` — **"Sedentary"** / **"Mostly sitting, desk work, driving"**
   - `walk` — **"Lightly Active"** / **"Some walking, light physical tasks"**
   - `medkit` — **"Moderately Active"** / **"Frequent movement, nurse, retail"**
   - `hammer` — **"Very Active"** / **"Heavy physical labor, construction, warehouse"**
4. **Footer** — CtaButton **"Continue"** (lg), disabled until one is chosen.

### Data / text
Title "Work Environment" · subtitle (above) · 4 options (labels + descriptions above) · "Continue".

### Interactions & navigation
- Tap a Card → select (tap again → deselect).
- Continue → persists `activityLevel` → `router.push('/(onboarding)/ai-optimization')`.

### States
- **Empty:** Continue disabled. **Selected:** enabled.

### Styling per element
Accent = **cyan**. Icon box idle `background.tertiary` → selected cyan @16% with cyan glyph. Card selected = elevated + 1.5px cyan border + glow.

### Animations
No staggered entrance; activeOpacity 0.85 press. Continue pressed-scale 0.97.

---

## O7 · AI Optimization — `app/(onboarding)/ai-optimization.tsx`  *(standalone)*

**Purpose.** Choose how aggressively Coach Ria optimizes the schedule. Three multi-colored intensity cards. Default = **medium**.

### Layout (top → bottom)
1. **Title** display: **"AI "** (white) + **"Optimization"** (**purple** `#7C4DFF`), marginBottom 8.
2. **Subtitle** body `text.secondary`, marginBottom 24: **"How deeply should Coach Ria optimize your schedule?"**
3. **`GlassCard` panel** (pad 12, gap 12) of 3 single-select **Card** tiles (`levelCard`, pad 20). Each tile: a header row with a **48×48 rounded-24 icon box** (bg = level color @14%) holding a 24px level-colored icon, plus a trailing level-colored `checkmark-circle` (24px) when selected; then a **heading** title (marginBottom 8) + caption description. Selected → `variant=elevated`, 1.5px **level-colored** border + matching glow:
   - `flash`, **purple** `#7C4DFF` — **"Maximum Optimization"** / **"Strict meal timing, precise caffeine cutoffs, dynamic lighting alerts"**
   - `leaf`, **cyan** `#00D4AA` — **"Balanced Approach"** / **"Core circadian principles with flexibility for social life and cravings"**
   - `water`, **blue** `#4FC3F7` — **"Gentle Guidance"** / **"Just tracking and basic recommendations without strict rules"**
4. **Footer** — CtaButton **"Build My Profile"** (lg), icon `sparkles`. Always enabled (a level is always selected; defaults medium).

### Data / text
Title "AI Optimization" · subtitle (above) · 3 levels (labels + descriptions above) · CTA "Build My Profile".

### Interactions & navigation
- Tap a level → selects it (no deselect — one is always active).
- CTA → persists `aiOptimizationLevel` → `router.push('/(onboarding)/profile-summary')`.

### States
- Always valid; selected tile shows its colored border + glow + checkmark.

### Styling per element
**Per-card accent color** (purple / cyan / blue) drives icon, icon-box tint, border, glow, checkmark. Title word in **purple**. This is the one onboarding screen that uses three different functional accent colors at once (semantic: intensity).

### Animations
No staggered entrance; activeOpacity 0.85 press. CTA pressed-scale 0.97.

---

## O8 · Final Steps (Permissions) — `app/(onboarding)/permissions.tsx`

**Purpose.** Offer Push Notifications + Apple Health permission toggles, then enter the app. Honest about Health availability (never fakes a connection).

### Layout (top → bottom)
1. **Hero badge** — 64×64 rounded-20 **LinearGradient** (lime `gradients.coral`, diagonal x0y0→x1y1) with lime glow, holding a white `rocket` icon (28px). marginBottom 16.
2. **Title** display: **"Final "** (white) + **"Steps"** (**cyan**), marginBottom 8.
3. **Subtitle** body `text.secondary`, marginBottom 24: **"Enable permissions to let Zeitra keep your circadian clock synchronized automatically."**
4. **"Recommended access"** overline `text.secondary` (marginBottom 12).
5. **Push Notifications card** — `Card variant=glass`, pad 20: header row — **48×48 rounded-24 icon box** (lime @14% bg) with lime `notifications` icon (24px); text stack heading **"Push Notifications"** + caption secondary **"Meal reminders & caffeine cutoffs"**; trailing **Switch** (off `border.default`, **on lime**, white thumb).
6. Spacer 16.
7. **Apple Health card** — `Card variant=glass`, pad 20: header row — 48×48 icon box (cyan @14% bg) with cyan `heart` icon; text stack heading **"Apple Health"** + caption **"Sync sleep/activity from Oura, Apple Watch"**; trailing **Switch** (on **cyan**). Below, a conditional honest notice (only after a failed connect): caption `text.tertiary`, e.g. **"Health sync is unavailable on this build."** (live-region alert).
8. **Footer** — CtaButton **"Start Zeitra"** (lg), icon `rocket`; below it a **ghost Button** **"Skip for now"** (full width, marginTop 12).

### Data / text
Hero rocket · title "Final Steps" · subtitle (above) · "Recommended access" · "Push Notifications" / "Meal reminders & caffeine cutoffs" · "Apple Health" / "Sync sleep/activity from Oura, Apple Watch" · honest Health-unavailable notice · CTA "Start Zeitra" · "Skip for now".

### Interactions & navigation
- Notifications switch: pure local toggle.
- Health switch: drives the health-sync adapter — on success stays ON; on failure **snaps back OFF** and shows the honest reason (never a fake "connected").
- **"Start Zeitra"** and **"Skip for now"** both → `router.replace('/(tabs)')`.

### States
- **Default:** both switches OFF, no notice.
- **Health connected:** Health switch ON.
- **Health unavailable:** switch OFF + tertiary notice line.

### Styling per element
Hero badge = lime gradient + white rocket (note: badge glyph is white here, distinct from ink-on-lime CTA rule because it's a gradient *badge*, not a CTA). Notifications accent **lime**; Health accent **cyan**. Switches: off `border.default`, on accent, thumb white. "Skip" is a muted ghost button.

### Animations
No Reanimated entrance. CtaButton pressed-scale 0.97; ghost Button pressed opacity/scale dip.

---

## O9 · Onboarding Summary — `app/(onboarding)/profile-summary.tsx`

**Purpose.** Read-only recap of everything collected + the final **"Finish & Sync"** that writes profile/preferences to the backend, creates a best-effort shift, and enters the app.

### Layout (top → bottom)
Root `View` bg `background.primary`, top pad = safe-area inset, light status bar. `ScrollView` content pad 24.

1. **Hero badge** — 64×64 rounded-20 **LinearGradient** (**cyan** `gradients.cyan`, diagonal) + cyan glow, holding an **ink** `sparkles` icon (28px, `text.inverse`). Centered, marginBottom 16.
2. **Overline** `accent.cyan`, centered, marginBottom 8: **"ANALYSIS COMPLETE"**.
3. **Title** display centered, marginBottom 24: **"Your Onboarding "** (white) + **"Summary"** (**cyan**).
4. **Summary card** — `GlassCard` radius 24, pad 24. Animated in (fade + slide-up). Contains:
   - **2-column grid** (16px gap):
     - **Left column** — heading **"Biological"** in cyan (marginBottom 12), then 3 **SummaryItem** rows (each: a 28×28 rounded-14 cyan @12% mini-icon box with a 14px cyan icon + a label caption secondary over a body/600 white value, fallback **"Not set"**): **Height** `resize` → `{heightCm} cm` · **Weight** `fitness` → `{weightKg} kg` · **Sex** `person` → biological sex.
     - **Right column** — heading **"Lifestyle"** cyan, then: **Goal** `trophy` → fitness goal · **Shift** `moon` → shift type · **Experience** `star` → experience level.
   - **Divider** — hairline `border.default`, vertical margin 24.
   - **Stats row** (space-around): two stat items separated by a vertical hairline divider — each a `statSmall` (JetBrains Mono, 24px) white value over an overline secondary label: value = `dietaryPreference || 'Any'` / label **"DIET"** · value = `dietMode || 'Balanced'` / label **"MODE"**.
5. **Insight box** — `GlassCard` glow=lime, radius 16, 1px lime @22% border, marginTop 24, pad 16: row with lime `sparkles` (20px) + body `text.secondary`: **"Based on your {shiftType} schedule, we've optimized your metabolic window for maximum performance."** (shift type lower-cased, `_`→space).
6. **Footer** (bg `background.primary` @92%, 1px top hairline `border.default`, pad-h 20, bottom pad = max(inset, 24)) — CtaButton, **size lg**: label **"Finish & Sync"** with `checkmark-circle` icon → while saving becomes **"Saving Profile..."** (no icon), `loading` spinner, disabled.

### Loading / syncing state
While `isLoading`, the summary + insight cards are replaced by a **SyncingSkeleton**: a `GlassCard` mirroring the layout with shimmer `Skeleton` blocks — two columns (a 60%-wide title block + three rows of a 28×28 circle skeleton beside two stacked text-line skeletons), a divider, and a two-stat row of skeleton blocks (88×28 value + 40×10 label each). The footer CTA shows the ink spinner + "Saving Profile...".

### Data / text
Hero sparkles · "ANALYSIS COMPLETE" · title "Your Onboarding Summary" · column headers "Biological" / "Lifestyle" · item labels Height/Weight/Sex/Goal/Shift/Experience (values from store, fallback "Not set") · stats DIET (`Any` fallback) / MODE (`Balanced` fallback) · insight sentence · CTA "Finish & Sync" / "Saving Profile...".

### Interactions & navigation
- **Finish & Sync** → `updateProfile` (+ FEMALE-only cycle fields) → `updatePreferences` (with enum mappings: FAT_LOSS→WEIGHT_LOSS, EXTREMELY_ACTIVE→EXTRA_ACTIVE, etc.) → `updateOnboarding({step:4,completed:true})` → set local `onboardingComplete` → reset onboarding draft → **best-effort create shift** from the sleep window (guarded, non-blocking) → `router.replace('/(tabs)')`.

### Error state
On submission failure → native **Alert** "Submission Failed" with a status-aware message:
- 404 → **"User service is not reachable. Please make sure the server is running and try again."**
- 400 → **"Validation error: {server message or 'check your inputs'}"**
- else → server message or **"Could not save your profile. Please check your connection and try again."**
`isLoading` resets so the user can retry.

### Styling per element
Accent = **cyan** (hero gradient + ink sparkles, "ANALYSIS COMPLETE", title word, column headers, mini-icons). Insight box accent = **lime** (icon + glow + border). Stat values in mono. Footer translucent bar + hairline.

### Animations
- **Entrance:** legacy RN `Animated` parallel — `fadeAnim` opacity 0→1 over **800ms** + `slideAnim` translateY 50→0 over **600ms** (native driver) on the summary block. (No Reanimated `FadeInDown` here.)
- **Syncing:** Skeleton pulse opacity 0.4↔1 (750ms each).
- CTA pressed-scale 0.97 (disabled while saving).

---

## Quick render cheatsheet (per-screen accent + primary CTA)

| Screen | Accent word color | Primary CTA label / icon |
|---|---|---|
| Login | lime | "Sign In" / `log-in-outline` |
| Register | lime | "Create Account" / `rocket-outline` |
| Forgot | lime (success = cyan) | "Send Reset Link" → "Back to Sign In" (outline) |
| Biological Profile | cyan | "Continue" |
| Cycle tracking | lime | "Continue" |
| Goal | lime | "Continue" |
| Lifestyle | lime (health chips cyan) | "Continue" |
| Nutrition | cyan | "Continue" |
| Work Environment | cyan | "Continue" |
| AI Optimization | purple (per-card purple/cyan/blue) | "Build My Profile" / `sparkles` |
| Final Steps | cyan (notif lime / health cyan) | "Start Zeitra" / `rocket` + "Skip for now" (ghost) |
| Summary | cyan (insight lime) | "Finish & Sync" / `checkmark-circle` |

**Universal reminders for the renderer:** ink-on-lime CTAs only; glass cards = translucent fill + `rgba(255,255,255,0.10)` 1px border + radius 24 (forms) / 20 (Card rows) / 14–16 where noted; selected option states change border *color* to the accent at 1.5px + add the soft accent glow + a trailing `checkmark-circle`; all inputs/date fields are 52px tall, radius 14, with a leading icon; bottom **CtaButton** footer on every onboarding screen, disabled (0.6) until valid; **no bottom tab bar** anywhere in Auth & Onboarding.
