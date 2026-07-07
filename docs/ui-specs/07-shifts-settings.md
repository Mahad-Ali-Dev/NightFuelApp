# Zeitra UI Mockup Spec — 07 · Shifts & Settings

This file is self-contained. Paste any single screen section into GPT (or hand it to a designer) to render a pixel-faithful mockup. Every value below was read directly from the live React Native source — nothing is invented.

---

## ZEITRA DESIGN SYSTEM (condensed — obey on every mockup)

**Brand.** Athletic, premium, high-contrast, energetic. Tagline "STRONG TODAY. BETTER EVERYDAY." Logo = lime "Z" + dumbbell on black.

**IMPORTANT TOKEN NOTE (read this first).** The codebase palette was rebranded to lime *in place* but kept the original key names. So in the source, `colors.accent.coral`, `colors.accent.pink`, `colors.gradients.coral`, and `colors.text.accent` ALL resolve to **lime**, NOT coral/pink. When a screen below says "coral", render **lime `#A8CC3C`**. Treat "coral" as a legacy alias for the lime primary throughout.

**Colors (exact hex):**
- Background ink `#0A0C12` (deep near-black, app background). Card surface `#13161F`. Elevated surface `#1B2030`. Higher elevation `#242B3D`.
- Borders (glass hairlines): default `#222838`, light `#2F3650`, focus `#A8CC3C`.
- **PRIMARY = lime `#A8CC3C`** (= token `accent.coral`). Lime-light `#C5E06B` (= `coralLight`). Lime-deep `#93B82E` (= `coralDark` = `accent.pink`).
- Functional accents: cyan `#00D4AA` (success/progress), blue `#4FC3F7` (informational), purple `#7C4DFF` (AI/Coach), purple-light `#9E7BFF`, red `#FF4444` (danger), amber `#FFB300` (caution), emerald `#10B981` (positive/active).
- Text: primary `#FFFFFF`, secondary `#9BA3B4` (muted), tertiary `#7B8497` (faint), inverse `#0A0C12`.
- Semantic: success `#00D4AA`, error `#FF4444`, warning `#FFB300`, info `#4FC3F7`.
- Gradients: `coral`/`coralCta` = `#A8CC3C → #93B82E` (lime hero/CTA, L→R). `cyan` = `#00D4AA → #4FC3F7`. `purple` = `#7C4DFF → #B47CFF`. `dark` = `#13161F → #0A0C12`.

**CTAs.** Lime fill with **INK `#0A0C12`** text + icons — NEVER white on lime. Bold, radius 12–14, a SUBTLE lime glow (shadowColor lime, opacity 0.18, radius 9 — not neon). Pressed scale 0.97.

**Cards.** Dark-glass surface (`#13161F`, ~72–88% alpha frost), radius 16–20, generous padding (16–24), subtle 1px border `rgba(255,255,255,0.06–0.10)` or `#222838`. "GlassCard" = the sanctioned blur surface primitive; "CtaButton" = the sanctioned lime CTA primitive (ink label, Pressable).

**Typography (Inter UI + JetBrains Mono for stats):**
- `display` 36/44, Inter ExtraBold(800), tracking −0.5.
- `h1` 28/36 Bold, `h2` 24/32 Bold, `h3`/`heading` 20/28 SemiBold.
- `subhead`/`subtitle` 16/24 SemiBold. `body` 15/22 Regular. `bodyMedium` 15/22 Medium. `bodySm` 14/20 Regular.
- `caption` 12/16 Regular. `captionMedium` 12/16 Medium.
- `overline` 11/16 SemiBold, letter-spacing 1.5, UPPERCASE, usually muted `#9BA3B4` or an accent.
- Stats (mono): `statLarge` 48/56 Bold, `statMedium` 32/40 SemiBold, `statSmall` 24/32, `statTiny` 16/22 Regular.

**Spacing scale (4px grid):** xxs 2, xs 4, sm 8, md 12, lg 16, xl 20, 2xl 24, 3xl 32, 4xl 40, 5xl 48. **Radius:** sm 4, md 10, lg 14, xl 20, 2xl 24, 3xl 28, full 9999.

**Layout language.** Generous spacing; overline section headers; 2-col grids; horizontal snapping carousels for collections; pill/chip filters; circular progress RINGS; stat cards; circular 44×44 header icon buttons. **Bottom tab bar (Home / Train / Fuel / Circadian / More)** — active = lime icon+label, inactive muted `#7B8497`.

**Motion (premium).** Reanimated entrance: `FadeInDown` with staggered per-section delays, springy card reveals, animated progress rings/bars, pressed-scale 0.97 on cards & CTAs.

> **Bottom-tab caveat for THIS file.** All eight screens below are pushed routes inside `(shifts)` / `(settings)` / `(modals)` stacks and are presented FULL-SCREEN with their own back-button header — the global bottom tab bar is NOT visible on any of them. Where a mockup wants the tab bar for context, render it as the muted underlay the user returned from (active tab = **Circadian** for the two Shifts screens, **More** for the Settings screens), but it sits *behind*/below this pushed screen, not within it.

---

# SECTION A — SHIFTS

## A1 · Shift Calendar (Circadian Planner) — `(shifts)/index.tsx`

### 1. Purpose
The shift-rotation home: shows the user's single ACTIVE shift block, a "Today's Timeline" of circadian milestones, an entry point to the Sleep Optimizer, the metered **Generate AI Nutrition Plan** action, and a read-only list of training sessions linked to this shift. Empty when no shift is set.

### 2. Top-to-bottom layout
1. **Status bar**: light content. Full-bleed **background gradient** behind everything: a lime→lime-deep→transparent wash, top-left → bottom-right, 360px tall, ~16%→6%→0 alpha (`accent.coral 0.16 → accent.pink 0.06 → transparent`). Non-interactive.
2. **Header row** (paddingTop = safe-area top, horizontal 20, space-between):
   - **Back button** — circular 44×44, radius full, fill `rgba(255,255,255,0.06)`, 1px border `#222838`; icon `arrow-back` 22px white.
   - **Sleep-optimizer button** — circular 44×44, fill purple@10% `rgba(124,77,255,0.10)`, 1px border purple@25%; icon `moon-outline` 22px purple `#7C4DFF`.
3. **Scroll body** (padding 20, paddingBottom 150):
   - **Overline** "CIRCADIAN PLANNER" — overline type, color **lime** (`accent.coral`), margin-bottom 8.
   - **Display title** "Your Schedule" — `display` 36px ExtraBold white, margin-bottom 12.
   - **Body paragraph**: "Manage your active shift block to ensure your circadian rhythm aligns perfectly with your body's needs." — `body` 15px, secondary `#9BA3B4`, margin-bottom 32.
   - **ACTIVE SHIFT CARD** (glass `Card`, padding 20, margin-bottom 16, radius ~20, border = lime@34%, subtle lime glow). Has an internal lime→transparent diagonal gradient overlay (12%→0). Contents:
     - **Card header row**: left **icon box** 52×52 radius 14, fill lime@14%, border lime@30%, icon `moon` 24px lime. Middle text block (flex, marginLeft 16): overline "Active Shift" (lime); `h3` 20px white **capitalized** shift type (e.g. "Night"); `statTiny` mono secondary "{start} - {end}" e.g. "6:00 PM - 2:00 AM". Right **edit button** 40×40 radius 10, fill white@6%, border default; icon `create-outline` 20px secondary → opens log-shift modal.
     - **Overline** "Today's Timeline" — secondary, margin-bottom 16.
     - **Vertical timeline** (left border 2px `#2F3650`, paddingLeft 8, marginLeft 16). Three nodes, each = a 32×32 circular tinted dot (icon 14px) + label, offset left by −19 so the dot straddles the line:
       1. Dot fill amber@16% / border amber@30%, icon `sunny` amber `#FFB300`; label "Awake" (`bodySm` white).
       2. Dot fill cyan@16% / border cyan@30%, icon `briefcase` cyan `#00D4AA`; label "Shift Starts"; right-aligned time value in cyan mono 14px (= shift start).
       3. Dot fill purple@16% / border purple@30%, icon `bed` purple; label "Shift Ends"; right-aligned time value in purple mono 14px (= shift end).
   - **"Optimize Sleep Window" button** (full-width, height 56, radius 14, 1px border purple@40%, fill purple@10%): icon `analytics` 20px purple + label `subhead` 700 purple "Optimize Sleep Window". → pushes Sleep Optimizer.
   - **(Conditional) Generate-failure notices** — appear directly ABOVE the generate hero (only when not generating). Two mutually-exclusive variants, each a **GlassCard** (margin-top 16, inner padding 16):
     - *Daily-AI-limit (quota) notice* (glow lime): header row icon `flash-outline` 20px lime + title `subhead` 700 white "Daily AI limit reached"; body `caption` secondary, e.g. "You've used all 3 of your free daily AI plans. Resets at 6:00 AM." (limit & plan are dynamic; plan shows "Pro" or "free"). Below: lime **CtaButton** size sm, label "Upgrade", icon `sparkles`, ink text, self-start, margin-top 12 → pushes premium modal.
     - *Generation-failed notice* (no glow): header icon `alert-circle` 20px lime + title `subhead` 700 white "Generation Failed"; body `caption` secondary = the error message. Below: pill **"Try Again"** button (row, self-start, radius full, 1.5px border lime@50%, transparent fill, padding-h 16 / v 8): icon `refresh` 16px lime + `caption` 700 lime "Try Again" → re-runs generate.
   - **GENERATE HERO BUTTON** (full-width, height 56, radius 14, margin-top 12, overflow hidden, subtle lime glow). Fill = **lime gradient** `#A8CC3C → #93B82E` L→R. Default content: icon `restaurant` 20px **ink/white** + `subhead` 700 "Generate AI Nutrition Plan". While generating: shows the animated **GeneratingSteps** ticker cycling the five lines below (no dots). Disabled+busy while pending. → on success navigates to the Nutrition tab.
   - **Section heading** "Training around this shift" — `h3` 20px white, margin-top 32, margin-bottom 12.
   - **Linked-sessions list** (read-only; NO add button here). Each session = a glass `Card` (padding lg) row: left **icon box** 40×40 radius 14, fill lime@14% border lime@28%, icon `barbell-outline` 20px lime. Middle: title `body` 700 white (1 line); `caption` secondary local date·time e.g. "Sat, Jun 20 · 6:00 PM"; optional notes `caption` secondary (2 lines). Right chevron `chevron-forward` 18px tertiary. Tapping a row → pushes the training calendar.

### 3. Data / text shown
- Overline "CIRCADIAN PLANNER"; title "Your Schedule"; the body paragraph (verbatim above).
- Shift: `type` (capitalized), `startTime`/`endTime` formatted "h:MM AM/PM" (sentinel "--:--" if unparseable). Timeline labels "Awake", "Shift Starts", "Shift Ends".
- Generate steps (ticker): "Reading your circadian profile…", "Calculating macro targets…", "Timing your meals to your shift…", "Balancing energy windows…", "Finalizing your plan…".
- Quota copy: ``You've used all {limit} of your {Pro|free} daily AI plans. {Resets at {time} | Resets at midnight UTC}.``
- Session: `title`, formatted `scheduledAt`, optional `notes`.

### 4. Interactions + navigation
- Back → `router.back()`. Sleep-optimizer header btn & "Optimize Sleep Window" → `/(shifts)/sleep-optimizer`. Edit btn → `/(modals)/log-shift`. Generate hero / "Try Again" → POST plan generate, on success → `/(tabs)/nutrition`. "Upgrade" → `/(modals)/premium`. Session row → `/(performance)/calendar`. Empty-state "Add Shift" → `/(modals)/log-shift`.

### 5. Loading / empty / error states
- **Loading** (shift query): scroll of skeletons — title block (12px line w150, 40px block w220, two body lines 100%/80%), a 236px-tall shift-card skeleton (radius xl), then two 56px button skeletons.
- **Error** (shift query): full `EmptyState` — icon `cloud-offline-outline`, title "Couldn't load your schedule", subtitle "Something went wrong fetching your active shift. Check your connection and try again.", action **"Try Again"** → refetch.
- **No active shift**: `EmptyState` — icon `calendar-outline`, title "No Active Shift", subtitle "Set up your next shift rotation to start generating circadian predictions and your AI nutrition plan.", action **"Add Shift"** → log-shift modal (margin-top 40).
- **Linked sessions — loading**: two 76px-tall skeleton rows (radius xl, gap 12). **error**: `EmptyState` icon `cloud-offline-outline`, title "Couldn't load sessions", subtitle "We couldn't reach the sessions linked to this shift. Check your connection and try again.", action "Retry". **empty**: `EmptyState` icon `calendar-outline`, title "No sessions linked to this shift yet", subtitle "Sessions you link to this shift on your training calendar will appear here." (no action — this is also the normal pre-migration state).

### 6. Exact Zeitra styling per element
- Header icon buttons 44×44 radius full; back = white@6% fill + `#222838` border; sleep = purple@10% fill + purple@25% border.
- Shift card: glass, padding 20, radius xl(20), border lime@34%, glow(lime). Icon box 52×52 radius lg(14). Edit 40×40 radius md(10). Timeline dots 32×32 radius full; tints amber/cyan/purple at 16% fill / 30% border.
- Optimize btn: 56h radius lg, purple@10% fill, purple@40% border, purple label.
- Generate hero: 56h radius lg, lime gradient fill, ink/white content, glow(lime).
- Notice cards: GlassCard, margin-top 16, inner padding 16; quota glow lime; try-again pill radius full 1.5px lime@50%.
- Session row: glass Card padding lg; icon 40×40 radius lg lime@14%/28%; chevron tertiary `#7B8497`.

### 7. Animations
Premium entrance: `FadeInDown` staggered — overline → title → paragraph → shift card → optimize btn → hero → sessions, each delayed ~+60ms. Cards spring in. Generate hero swaps to the **GeneratingSteps** cross-fading text ticker while pending. Pressed-scale 0.97 on all touchables (activeOpacity 0.85). Background gradient is static.

---

## A2 · Sleep Optimizer — `(shifts)/sleep-optimizer.tsx`

### 1. Purpose
Recovery + circadian light-timing screen. Shows a Sleep Quality Score ring, recommended sleep/nap windows, a two-step "seek → avoid" light-exposure plan derived from the current shift, and a one-tap "Log Rest Block" (logs an 8-hour block ending now).

### 2. Top-to-bottom layout
1. **Status bar** light. Container paddingTop = safe-area top.
2. **Header bar** (row, space-between, border-bottom 1px `#222838`, padding-h 20, padding-bottom 16): **back button** 40×40 circle, fill `background.secondary` `#13161F`, 1px border default, icon `arrow-back` 22px white; centered **title** "Sleep Optimizer" (`h3` 20px white); a 40px spacer on the right to balance.
3. **Scroll body** (padding 20, paddingBottom 100):
   - **HERO SCORE CARD** (GlassCard, centered, padding 24, margin-bottom 32, border purple@30%, glow purple, internal purple→transparent vertical gradient 14%→0):
     - **Overline** "Sleep Quality Score" — purple, margin-bottom 20.
     - **Circular progress ring** 140×140, stroke 12, color purple `#7C4DFF`, track `background.tertiary` `#1B2030`, progress = qualityScore/100; wrapped in a purple glow. **Centered overlay**: `statLarge` 48px mono white = the score (or "--"); under it overline "QUALITY" purple.
     - **Summary line** `body` secondary, centered, margin-top 20: the server `summary`, fallback "Log a sleep block to see your recovery analytics."
   - **Overline** "Recommended Windows" — secondary, margin-bottom 16.
   - **WINDOW CARD — Recommended Sleep Block** (GlassCard, padding 16, margin-bottom 16, border purple@25%): header row = 36×36 radius 10 icon chip fill purple@14% border purple@28% icon `moon` 18px purple + `subhead` white "Recommended Sleep Block" + right-aligned **value** `statTiny` cyan = the 4h anchor window "11:30 PM – 3:30 AM" (or "—"). Body `bodySm` secondary: "A fixed 4h core block anchored to your post-shift recovery window. Keep the room dark and avoid light on the way home."
   - **WINDOW CARD — Pre-Shift Nap** (GlassCard, border amber@25%): icon chip amber@14%/28% icon `battery-charging` 18px amber + `subhead` "Pre-Shift Nap" + right value `statTiny` amber **"—"** (always, by design). Body `bodySm` secondary: "Aim for a 90-minute cycle before your shift to top off cognitive alertness."
   - **Overline** "Light Timing" — secondary, margin-top 20, margin-bottom 16.
   - **LIGHT-TIMING PLAN CARD** (GlassCard, padding 16, border amber@25%) — present when a usable shift exists:
     - **Overline** "Your light plan, in order" — amber.
     - **Intro caption** tertiary `#7B8497`: "Two windows across your shift — anchor alertness early, then protect your recovery sleep." (margin-bottom 16).
     - **Step 1 row** (window header): icon chip amber@14%/28% icon `sunny` 18px amber + `subhead` white "Seek Light" + right value `statTiny` amber = "{seek.start} – {seek.end}". Under it: overline tertiary "Early in your shift"; `bodySm` secondary why-line: "Bright light early in your shift anchors alertness and pushes your clock the night-worker direction."
     - **Hairline divider** (`#222838`, hairline height, opacity 0.6, vertical margin 16).
     - **Step 2 row**: icon chip purple@14%/28% icon `glasses-outline` 18px purple + `subhead` "Avoid Light" + right value `statTiny` purple = "{avoid.start} – {avoid.end}". Under it: overline tertiary "Before recovery sleep"; `bodySm` secondary why-line: "Dim down / wear blue-blockers so rising melatonin isn't suppressed before recovery sleep."
   - **LOG REST BLOCK button** (full-width, height 56, **radius full**, margin-top 16, overflow hidden, glow purple): fill = **purple gradient** `#7C4DFF → #B47CFF` L→R. Content: icon `bed` 20px white + `subhead` 700 white "Log Rest Block". While pending → centered `ActivityIndicator` white. Disabled while pending.

### 3. Data / text shown
- "Sleep Optimizer" title; "Sleep Quality Score" / "QUALITY"; score number or "--"; summary or its fallback.
- "Recommended Windows"; "Recommended Sleep Block" + cyan window value; the sleep-block body copy; "Pre-Shift Nap" + "—" + nap body copy.
- "Light Timing"; "Your light plan, in order"; intro caption; "Seek Light"/"Avoid Light" + amber/purple window values; the two "when" overlines + two why-lines.
- Button label "Log Rest Block".

### 4. Interactions + navigation
- Back → `router.back()`. **Log Rest Block** → logs an 8h block (start = now−8h, end = now); on success invalidates the whole sleep cache and fires a native **Alert** "Sleep Logged / Your sleep block has been recorded successfully." On error → Alert "Error / {message or 'Failed to log sleep. Please try again.'}". (No other navigation; light/anchor windows are computed locally from the cached current shift.)

### 5. Loading / empty / error states
- **Loading** (analytics query): centered 140×140 ring skeleton + two body-line skeletons (90%/70%); a 180px section-header skeleton; two 96px window-card skeletons; a 56px button skeleton (radius full).
- **Error** (analytics query): `EmptyState` icon `cloud-offline-outline`, title "Couldn't load sleep analytics", subtitle "Something went wrong fetching your recovery data. Check your connection and try again.", action "Try Again" → refetch.
- **Light-timing — shift loading**: a single 200px skeleton (radius xl) in place of the plan card.
- **Light-timing — no usable shift**: the plan card becomes a GlassCard (border default) wrapping an `EmptyState` (trimmed vertical padding): icon `sunny-outline`, title "No shift to plan light around", subtitle "Log a shift to see when to seek and avoid light."
- The anchor / nap values fall back to **"—"** (never NaN) when there's no usable shift.

### 6. Exact Zeitra styling per element
- Hero card: GlassCard padding 24, radius (GlassCard default ~xl), border purple@30%, glow purple. Ring 140/stroke12 purple on `#1B2030` track. Score `statLarge` 48 mono.
- Window cards: GlassCard padding 16, margin-bottom 16; icon chips 36×36 radius md(10) at 14% fill / 28% border in their tint (purple / amber). Right values `statTiny` 16 mono in the tint (sleep block uses **cyan**).
- Light card divider = hairline `#222838` opacity 0.6. Why-lines `bodySm` secondary; "when" tags overline tertiary.
- Log button 56h radius full, purple gradient, white content, glow purple.

### 7. Animations
`FadeInDown` staggered top-to-bottom (hero → "Recommended Windows" → sleep-block card → nap card → "Light Timing" → plan card → log button). Ring animates its progress sweep on mount. Pressed-scale 0.97 (activeOpacity 0.85); log button shows spinner while the mutation runs.

---

# SECTION B — SETTINGS

## B1 · Settings Home — `(settings)/index.tsx`

### 1. Purpose
Account & app settings hub: profile summary, three grouped setting sections (Account / App Settings / Support), two inline toggles (Dark Mode, Night Read), a Log Out button, and the app version.

### 2. Top-to-bottom layout
1. **Status bar** light. Container paddingTop = safe-area top.
2. **Header bar** (row, space-between, border-bottom 1px `#222838`, padding-h 20, padding-v 14): back `arrow-back` 24px white (padding 4 hit area); centered title **"Settings"** (`heading`, 20px white); 32px right spacer.
3. **Scroll body** (paddingBottom 100):
   - **PROFILE CARD** (row, padding 24, border-bottom 1px default): **avatar** 80×80 circle, 2px border default, source = profile.avatarUrl else `https://i.pravatar.cc/150` (fade-in transition 200ms). Right block (marginLeft 16): **name** `heading` 22px white (profile.name / user.name / "User"); **email** `body` secondary (profile.email / user.email / ""); **brand badge** — small pill, **lime gradient** fill `#A8CC3C→#93B82E`, padding-h 12 / v 5, radius full, glow lime, label overline white "Zeitra".
   - **THREE SETTING SECTIONS**, each: an **overline** group title (secondary, marginLeft 20, margin-bottom 8) above a rounded grouped card (fill `background.secondary` `#13161F`, 1px border default, radius xl(20), margin-h 16, shadow md). Rows are 16-padding, space-between, separated by 1px bottom borders (last row no border). Each **row**: left = Ionicon 22px white + label `body` 500 white (+ optional `caption` secondary subtitle under it). Right = either a value `subhead` secondary + chevron `chevron-forward` 20px tertiary, OR a **Switch**.
     - **Account**: "Edit Profile" (`person-outline`) → `/(tabs)/profile/edit`; "Preferences" (`settings-outline`) → `/(tabs)/profile/preferences`; "Manage Subscription" (`star-outline`, right value = current tier e.g. "pro") → `/(settings)/subscription`; "Privacy & Data" (`shield-checkmark-outline`) → `/(settings)/privacy-data`.
     - **App Settings**: "Notifications" (`notifications-outline`) → `/(settings)/notifications`; "Notification Settings" (`options-outline`) → `/(settings)/notification-preferences`; "Connected Devices" (`watch-outline`) → `/(settings)/devices`; **"Dark Mode"** (`moon-outline`, **Switch**, on when theme==='dark'); **"Night Read"** (`eye-outline`, **Switch**, subtitle "Deep-red palette that preserves your dark-adapted night vision on late shifts.", bound to the persisted nightRead flag).
     - **Support**: "Help Center" (`help-circle-outline`) → opens `https://zeitra.app/support`; "Terms of Service" (`document-text-outline`) → opens `https://zeitra.app/terms`.
   - **LOG OUT button** (margin-top 40, padding 16, centered, radius lg(14), 1px border lime, fill lime@8%, glow lime, margin-h 16): label `subhead` 700 **lime** "Log Out".
   - **Version line**: `captionMedium` secondary, centered, margin-top 32: "Zeitra v{appVersion}" (e.g. "Zeitra v1.0.0").

### 3. Data / text shown
- Title "Settings"; profile name/email; badge "Zeitra"; tier value on the subscription row; switch subtitle copy (verbatim above); "Log Out"; "Zeitra v{version}".
- Switch tracks: OFF = border-default grey, ON = **lime** `#A8CC3C`.

### 4. Interactions + navigation
- Back → `router.back()`. Route rows push the listed routes; URL rows open via `Linking.openURL`. Dark Mode switch → `setTheme('dark'|'light')`. Night Read switch → `setNightRead(bool)`. **Log Out** → confirmation **Alert** "Log Out / Are you sure you want to log out of Zeitra?" with Cancel + destructive "Log Out"; confirming runs `logout()` then `router.replace('/(auth)/login')`.

### 5. Loading / empty / error states
No dedicated loading/error UI — profile & subscription load via react-query in the background; until present, the screen falls back to `user.*` values, "User", empty email, and the subscription row simply shows no tier value (chevron only). Version falls back to "1.0.0".

### 6. Exact Zeitra styling per element
- Header border-bottom `#222838`. Profile card padding 24, avatar 80 circle 2px border, badge lime-gradient pill radius full glow lime.
- Section groups: `#13161F` fill, `#222838` border, radius 20, margin-h 16, shadow md; rows padding 16 with 1px inter-row dividers. Icons 22px white. Chevrons 20px `#7B8497`.
- Switches: ON track lime `#A8CC3C`.
- Log Out: radius 14, border lime, fill lime@8%, glow lime, lime 700 label.

### 7. Animations
`FadeInDown` staggered by section (profile → Account → App Settings → Support → Log Out → version). Pressed-scale 0.97 / activeOpacity 0.85 on rows & Log Out. Switch thumb slides with the platform Switch animation. Avatar fades in (200ms).

---

## B2 · Connected Devices — `(settings)/devices.tsx`

### 1. Purpose
Health-sync hub. Lists exactly three supported sources (Apple Health, Google Fit / Health Connect, Bluetooth wearable) as glass cards, each with a Connect CTA and a "Sync now" affordance. HONEST: in Expo Go the adapter is a no-op — Connect/Sync surface a real "unavailable, needs a native dev build" reason; it NEVER fakes a connected state.

### 2. Top-to-bottom layout
1. **Status bar** light.
2. **Header bar** (row, space-between, paddingTop = safe-area top + 16, border-bottom 1px default, padding-h 20, padding-bottom 16): back `arrow-back` 24px white; centered title **"Connected Devices"** (`heading` 18px white); 24px right spacer.
3. **Scroll body** (padding 24, paddingBottom safe-area + 32):
   - **Intro paragraph** `body` secondary, lineHeight 21, margin-bottom 20: "Sync sleep, heart rate, and activity from a wearable or health app to sharpen your chrono-nutrition plan. Connect a source below."
   - **THREE SOURCE CARDS** (each a **GlassCard**, radius xl(20), padding 20, margin-bottom 16):
     - **Header row**: **icon badge** 44×44 radius lg(14), fill tint@12%, border tint@28%, icon 22px in tint. Title block: **name** `body` 700 white (1 line) + **subtitle** `caption` tertiary (1 line).
       - Apple Health — icon `logo-apple`, subtitle "iOS · HealthKit", **tint lime** (`accent.coral`).
       - Google Fit — icon `logo-google`, subtitle "Android · Health Connect", **tint cyan** `#00D4AA`.
       - Bluetooth — icon `bluetooth-outline`, subtitle "Cross-platform · BLE wearable", **tint blue** `#4FC3F7`.
     - **Meta row** (top hairline border default, margin-top 16, padding-top 12): icon `sync-outline` 14px tertiary + `caption` secondary = **last-synced label** ("Never synced", or "Last synced {date} {time}").
     - **(Conditional) Notice box** (when last attempt returned a reason; padding 12, radius md(10), 1px border, row, gap 8, margin-top 12):
       - *Unavailable* (default): fill warning@10% / border warning@25%; icon `information-circle-outline` 16px amber `#FFB300` + `caption` secondary = the verbatim reason (e.g. "Health sync needs a native dev build…").
       - *Info* (a connected sync that returned a benign reason, e.g. "No new health data to sync."): fill tint@10% / border tint@25%; icon `checkmark-circle-outline` 16px in the source tint + reason text.
     - **Actions row** (margin-top 16, gap 12): **Connect CtaButton** (flex 1, lime fill, ink label, size sm but minHeight 44, label "Connect", icon `link-outline`); **"Sync now" button** (row, minHeight 44, padding-h 16, radius lg(14), 1px border light `#2F3650`): icon `refresh-outline` 16px secondary + `caption` 600 secondary "Sync now".

### 3. Data / text shown
- Title "Connected Devices"; the intro paragraph (verbatim). Source names (from `HEALTH_SOURCE_LABELS`) + the three subtitles. Last-synced label. Notice reason text (verbatim from the adapter). Button labels "Connect" / "Sync now".

### 4. Interactions + navigation
- Back → `router.back()`. **Connect** → `adapter.connect()`; **Sync now** → `adapter.syncNow()`. On a non-connected result the source's notice box appears with the honest reason (controls stay pressable; a11y labels add "currently unavailable"). On a connected result the notice clears (or shows the benign info confirmation) and the "Last synced" label re-derives. No screen navigation.

### 5. Loading / empty / error states
- No spinner/skeleton — this is a static 3-row list. There is **no error state**; an unavailable adapter is surfaced as the per-card notice (data, not an error). Default per card: no notice, last-synced "Never synced".

### 6. Exact Zeitra styling per element
- GlassCard rows radius 20 padding 20. Icon badges 44×44 radius 14 at 12%/28% of the source tint (lime / cyan / blue). Meta-row hairline `#222838`. Notice box radius 10, 1px border — warning amber for unavailable, source-tint for info. Connect = lime CtaButton (ink label, minHeight 44). Sync = outline button border `#2F3650`, secondary text.

### 7. Animations
`FadeInDown` staggered per card (delay ~+80ms each). CtaButton & Sync pressed-scale 0.97 (activeOpacity 0.85). Notice box fades/expands in when a reason arrives.

---

## B3 · Notifications (inbox) — `(settings)/notifications.tsx`

### 1. Purpose
The notification **inbox** — a chronological list of received alerts (workout / meal / social / system), with unread emphasis, tap-to-mark-read, and a refresh control.

### 2. Top-to-bottom layout
1. **Status bar** light. Container paddingTop = safe-area top.
2. **Header bar** (row, space-between, border-bottom 1px default, padding-h 20, padding-v 12): back `arrow-back` 24px white; centered title **"Notifications"** (`heading` 20px white); right **refresh** button `refresh` 24px secondary.
3. **(Conditional) Mark-read error banner** — a **GlassCard** (margin-h 20, margin-top 16) shown if a mark-read call failed: row with icon `alert-circle` 20px **lime** + `subhead` 600 white "Couldn't mark as read" (flex), and a trailing **Retry** pill (row, minHeight 44, padding-h 16, radius lg, 1px border lime@40%, fill lime@8% → lime@16% when pressed): icon `refresh-outline` 15px lime + `caption` 700 lime "Retry".
4. **NOTIFICATION LIST** (FlatList, paddingBottom 100):
   - Each **row** (padding 20, border-bottom 1px default; background = `background.primary` `#0A0C12` if read, `background.secondary` `#13161F` if unread): **icon box** 48×48 radius 24, fill type-color@14% / border type-color@28%, icon 24px in the type color. Right block (flex, marginLeft 16): top row = **title** `subhead` white, weight 700 if unread / 500 if read (flex) + (if unread) a small **unread dot** 8×8 lime, marginLeft 8. **Body** `body` secondary, 2 lines, margin-top 4. **Date** `caption` secondary (locale date), margin-top 8.
   - **Type → icon/color map**: workout = `barbell` cyan; meal = `restaurant` lime; social = `people` purple; system = `information-circle` amber; default = `notifications` secondary.

### 3. Data / text shown
- Title "Notifications". Per item: `title`, `body` (2-line clamp), `createdAt` as locale date (blank if unparseable), read/unread state. Error banner copy "Couldn't mark as read" + "Retry".

### 4. Interactions + navigation
- Back → `router.back()`. Refresh → refetch. Tapping an **unread** row → marks it read (optimistic invalidation); tapping a read row is a no-op. Mark-read failure → inline banner; **Retry** re-runs mark-read for the failed id. No screen navigation out of the list.

### 5. Loading / empty / error states
- **Loading**: six skeleton rows shaped like real rows — 48×48 circle + three text lines (55% / 90% / 30% widths), each padding 20 with bottom border.
- **Error**: `EmptyState` icon `cloud-offline-outline`, title "Couldn't load notifications", subtitle "Something went wrong fetching your notifications. Check your connection and try again.", action "Try Again" → refetch.
- **Empty list**: `EmptyState` icon `notifications-off-outline`, title "No notifications yet", subtitle "You're all caught up. New workout, meal, and coach alerts will show up here."

### 6. Exact Zeitra styling per element
- Header border `#222838`; refresh icon secondary `#9BA3B4`. Rows padding 20, 1px bottom border; unread bg `#13161F`, read bg `#0A0C12`. Icon box 48 radius 24 at 14%/28% of the type color. Unread dot 8×8 lime. Error banner = GlassCard, lime accent, Retry pill border lime@40% fill lime@8%.

### 7. Animations
`FadeInDown` staggered list entrance (per-row +~50ms). Pressed-scale 0.97 / activeOpacity 0.85 on rows. Error banner fades in; Retry pill darkens its fill on press. Unread→read transitions the row weight/background on next data refresh.

---

## B4 · Notification Settings (preferences) — `(settings)/notification-preferences.tsx`

### 1. Purpose
Granular per-category notification toggles (9 switches across three categories), a Quiet Hours range, a "disable all non-critical" shortcut, and a deep link to system permissions. Save is explicit (header Save) with inline success/error feedback.

### 2. Top-to-bottom layout
1. **Status bar** light. Container paddingTop = safe-area top.
2. **Header** (row, space-between, border-bottom 1px default, padding-h 20, padding-v 12): back `arrow-back` 24px white; centered title **"Notification Settings"** (`heading` 18px, weight 800, white); right **Save** action — `caption` 14px bold; **lime** when there are unsaved changes, tertiary `#7B8497` when disabled; shows a small lime `ActivityIndicator` while saving. (Save disabled unless `hasChanges` and not saving.)
3. **Scroll body** (paddingBottom 100):
   - **INFO BANNER** (row, margin-h 20, margin-top 16, padding 16, radius 14, fill cyan@10%, border cyan@25%): icon `information-circle-outline` 18px cyan + `caption` secondary "Customize which alerts you receive. Critical shift and health alerts may still appear when disabled."
   - **(Conditional) Save-status surface** — a **GlassCard** (margin-h 20, margin-top 16):
     - *Success*: row icon `checkmark-circle` 20px emerald `#10B981` + `subhead` 600 white "Saved. Your notification preferences have been updated." + trailing **Dismiss** `close` 18px tertiary.
     - *Error*: row icon `alert-circle` 20px lime + `subhead` 600 white "Save failed" + trailing **"Try again"** pill (border lime@40%, fill lime@8%→16% pressed, icon `refresh-outline` 15px lime + `caption` 700 lime).
   - **CATEGORY GROUPS** — each = an **uppercase overline** (caption 11px bold, tracking 1, padding-h 20 / top 24 / bottom 8) above a grouped card (fill `background.secondary`, 1px border default, radius 20, margin-h 20, overflow hidden). Rows separated by a 1px divider inset 70px from the left. Each **row** (padding 16): **icon box** 40×40 radius 20, fill iconColor@12%, icon 20px in iconColor; middle (flex, margin-h 14) = label `subhead` 600 white + description `caption` secondary; trailing **Switch** (track OFF = default grey, ON = iconColor@40%; thumb = iconColor when on, tertiary when off; iOS bg = `background.tertiary`).
     - **TRAINING & HEALTH**: "Workout Reminders" (`barbell-outline`, cyan) — "Get reminded before your scheduled workouts"; "Meal & Nutrition" (`restaurant-outline`, lime) — "Reminders to log meals and chrono-nutrition tips"; "Shift Alerts" (`time-outline`, purple) — "Pre-shift prep and circadian rhythm notifications"; "Sleep Reminders" (`bed-outline`, blue) — "Wind-down and sleep hygiene reminders"; "Plan Ready" (`checkmark-circle-outline`, emerald) — "Notified when your daily workout or meal plan is ready"; "Adherence Alerts" (`alert-circle-outline`, amber) — "Gentle nudges when you fall behind your nutrition plan".
     - **PROGRESS & INSIGHTS**: "Weekly Report" (`analytics-outline`, emerald) — "Your weekly performance summary from Coach Ria"; "Streak Updates" (`flame-outline`, red) — "Stay motivated with streak milestones and warnings".
     - **COACHING**: "Coach Messages" (`chatbubble-ellipses-outline`, purple) — "Messages and check-ins from your AI Coach Ria".
   - **QUIET HOURS** — uppercase overline "QUIET HOURS" above a grouped card (same style). First **row**: icon box blue@12% icon `moon-outline` 20px blue + label `subhead` 600 "Quiet Hours" + description `caption` secondary "Suppress non-critical notifications during sleep hours" + **Switch** (blue when on). When ON, an expanded **time-range row** (top border default, centered, gap 16, padding-v 16, margin-h 16): a **FROM** TimeDisplay + `arrow-forward` 16px tertiary + a **TO** TimeDisplay. Each **TimeDisplay** = a 10px-bold uppercase label ("FROM"/"TO") over a pill box (fill blue@10%, border blue@30%, radius 10, padding-h 16 / v 8) showing the time `subhead` 700 16px in blue.
   - **MASTER DISABLE button** (margin-h 20, margin-top 24, row centered, radius 14, 1px border lime@40%, fill lime@6%, padding 14): icon `notifications-off-outline` 18px lime + `caption` bold lime "Disable All Non-Critical Notifications".
   - **SYSTEM PERMISSIONS link** (row, padding-h 20 / v 20): icon `settings-outline` 16px tertiary + `caption` secondary "Manage system notification permissions" + chevron `chevron-forward` 14px tertiary.

### 3. Data / text shown
- Title "Notification Settings"; "Save"; info-banner copy; the nine label+description pairs (verbatim above); category headers; save-status copy; Quiet Hours label/description + FROM/TO times (`quietHoursStart` / `quietHoursEnd`, e.g. "22:00" / "06:00"); master-disable label; system-permissions row copy.

### 4. Interactions + navigation
- Back → `router.back()`. Each Switch toggles its pref locally and sets `hasChanges`. **Save** → persists; success/error → inline status surface (Dismiss clears success; "Try again" re-saves). Quiet Hours switch shows/hides the time row (local UI). **Disable All** → confirmation **Alert** ("Disable All Notifications / This will turn off all non-critical notifications. You can re-enable them at any time." → Cancel / destructive "Disable All" sets every boolean pref false + hasChanges). **System permissions** row → **Alert** "Open Settings / Go to Settings → Notifications → Zeitra to manage system-level permissions."

### 5. Loading / empty / error states
- **Loading** (or no prefs yet): header (Save disabled) + a non-scrolling skeleton — a 56px info-banner placeholder, then two category groups (3 rows then 2 rows), each row = 40px circle + two text lines + a 44×26 switch-shaped skeleton.
- **Error with no cached prefs**: header + `EmptyState` icon `cloud-offline-outline`, title "Couldn't load preferences", subtitle "We couldn't fetch your notification settings. Check your connection and try again.", action "Try Again" → refetch.
- Save error → inline "Save failed" surface with working Retry (NOT an Alert).

### 6. Exact Zeitra styling per element
- Info banner radius 14 cyan@10%/25%. Group cards `#13161F` fill, `#222838` border, radius 20, divider inset 70px. Icon boxes 40 radius 20 at 12% of each iconColor; switch ON track = iconColor@40%, thumb iconColor. Quiet-hours time pills blue@10%/30% radius 10. Master-disable border lime@40% fill lime@6%. Save = lime when active, tertiary when disabled.

### 7. Animations
`FadeInDown` staggered (info banner → each category group → Quiet Hours → master-disable → permissions link). Quiet-hours time row expands/collapses with the switch. Status surface fades in; Retry/Try-again pills darken on press. Switch thumbs slide. activeOpacity 0.85 throughout.

---

## B5 · Privacy & Data — `(settings)/privacy-data.tsx`

### 1. Purpose
GDPR data-export + account-deletion surface (the Apple/Play-required in-app deletion path). Export writes a JSON file and opens the OS share sheet; Delete is a typed-confirmation, irreversible flow.

### 2. Top-to-bottom layout
1. **Status bar** light. Container paddingTop = safe-area top.
2. **Header** (row, space-between, border-bottom 1px default, padding-h 20, padding-v 12): back `arrow-back` 24px white; centered title **"Privacy & Data"** (`heading` 18px weight 800 white); 32px right spacer.
3. **Scroll body** (paddingBottom 100):
   - **Section label** "YOUR DATA" — 11px bold uppercase, tracking 1, secondary, padding-h 20 / top 24 / bottom 8.
   - **EXPORT CARD** (GlassCard, radius lg(14), margin-h 20; inner padding 16): **head row** icon `download-outline` 20px **cyan** + `subhead` 700 white "Export my data". Body `caption` secondary lineHeight 18: "Download a copy of your Zeitra account data as a JSON file. We'll prepare it and open the share sheet so you can save or send it." (Conditional inline status, row margin-top 16): *success* icon `checkmark-circle` 18px emerald + `caption` white "Your data export is ready to share."; *error* icon `alert-circle` 18px lime + `caption` white "Export failed. Please try again." Then **CtaButton** (lime fill, ink label) "Export my data", icon `download-outline`, loading spinner while exporting, margin-top 16.
   - **Section label** "DANGER ZONE" — same style, margin-top 24.
   - **DELETE CARD** (GlassCard, radius lg, margin-h 20, **glow lime**; inner padding 16): **head row** icon `trash-outline` 20px lime + `subhead` 700 **lime** "Delete account". Warning body `caption` secondary: "This permanently deletes your account and all of your data. This action is irreversible — there is no way to recover your account afterwards." Then a `caption` line "Type **DELETE** to confirm." (the word DELETE in white 800). **Input** (design-system `Input`) placeholder "DELETE", autoCapitalize characters, autoCorrect off. **Delete button** (Pressable, row centered, margin-top 16, minHeight 48, radius lg, 1px border lime, fill lime@10% → lime@18% pressed; opacity 0.5 while disarmed/pending): icon `trash-outline` 17px lime + `subhead` 800 lime, label "Delete account" (or "Deleting…" while pending). Disabled until the user types DELETE.

### 3. Data / text shown
- Title "Privacy & Data"; "YOUR DATA"; export card title/body; export success/error copy; "Export my data". "DANGER ZONE"; delete card title; warning copy; "Type DELETE to confirm."; input placeholder "DELETE"; button "Delete account" / "Deleting…".

### 4. Interactions + navigation
- Back → `router.back()`. **Export my data** → `exportMyData()` → writes `zeitra-data-export-YYYY-MM-DD.json` and opens the share sheet; sets inline success/error. **Delete account** (armed only when input === "DELETE") → final confirmation **Alert** "Delete account permanently? / This permanently deletes your Zeitra account and all of your data. This cannot be undone." → Cancel / destructive "Delete"; on confirm `deleteAccount()` → clears caches, logs out, `router.replace('/(auth)/login')`; on error → Alert "Couldn't delete account / Something went wrong deleting your account. Please check your connection and try again."

### 5. Loading / empty / error states
- No screen-level loading/error. Export: button shows a loading spinner; result is the inline success/error row. Delete: button shows "Deleting…" while pending; delete error → Alert. Delete CTA renders **disabled (opacity 0.5)** until the confirm word matches.

### 6. Exact Zeitra styling per element
- Section labels 11px bold tracking 1 secondary. Cards GlassCard radius 14 margin-h 20 inner padding 16; delete card has glow lime. Export accent = **cyan**; delete accent = lime. Input = standard design-system Input. Delete button minHeight 48 radius 14 1px lime border, lime@10/18% fill, lime 800 label.

### 7. Animations
`FadeInDown` staggered (YOUR DATA label → export card → DANGER ZONE label → delete card). CtaButton pressed-scale 0.97 + spinner while exporting. Delete Pressable darkens fill on press and animates opacity as it arms/disarms. Inline status rows fade in.

---

## B6 · Subscription — `(settings)/subscription.tsx`

### 1. Purpose
The paywall / plan-management screen: a horizontal carousel of four tiers (Free / Pro / Premium / Enterprise) with localized IAP prices, upgrade CTAs, the Apple/Play-required Restore + Manage tools, and the legal auto-renew terms. Gated behind a biometric re-auth prompt.

### 2. Top-to-bottom layout
0. **Biometric gate** (wraps the whole screen): prompt "Confirm it's you to view and manage your subscription"; on skip → `router.back()`. (Auto-bypasses on devices without Face ID / Touch ID.)
1. **Status bar** light. Container paddingTop = safe-area top.
2. **Header** (row, space-between, border-bottom 1px default, padding-h 20, padding-v 12): back `arrow-back` 24px white; centered title **"Subscription"** (`heading` 20px white); 32px right spacer.
3. **Scroll body** (paddingBottom 100):
   - **Hero copy** (padding-h 32, padding-top 20, padding-bottom 32, centered): `display` 36px white "Choose Your Plan"; `body` secondary, centered, margin-top 12: "Unlock your true potential with the plan that fits your goals."
   - **TIER CAROUSEL** (horizontal ScrollView, padding-h 20, snapToInterval = 75% width + 16, decelerationRate fast). Each **tier card** = a LinearGradient panel, width 75% of screen, minHeight 450, padding 24, radius 2xl(24), margin-right 16:
     - Border + fill: when **selected**, 2px border in the tier color + the tier's gradient + a glow(tierColor); otherwise 1px border default + flat `background.secondary` fill.
     - **(Conditional) top badge** pill (self-start, padding-h 12 / v 4, radius full, margin-bottom 16): "RECOMMENDED" (caption 900, **ink `#000`** text, fill = tier color) on the Pro card when not active; "CURRENT PLAN" (caption 900 ink, fill **cyan**) on the user's active tier.
     - **Tier name** `display` 28px (tier color if selected, else white).
     - **Price row** (baseline): `statMedium` 32px mono white price + `body` bold secondary period (e.g. "$9.99" + "/mo", or "Free" + "forever"). Price is the localized IAP price when loaded, else the fallback.
     - **Divider** hairline default, vertical margin 20.
     - **Feature list** (gap 14): each row = icon `checkmark-circle` 20px tier color + `subhead` white feature text.
     - Spacer (flex) pushes the action button to the bottom.
     - **Action button** (full-width, padding-v 16, radius lg, margin-top 32): label/behavior by state — **active tier** = "Current Plan" (transparent fill, 1px tertiary border, tertiary text, disabled); **Free** = "Downgrade to Free" (disabled, `background.tertiary` fill, white text); otherwise = "Upgrade to {Name}" (fill = tier color when selected else `background.tertiary`; **ink `#000`** text when selected & paid; glow(tierColor) when selected). Shows an ink `ActivityIndicator` while a purchase is in flight for the selected tier.
   - **SUBSCRIPTION TOOLS** (padding-h 24, margin-top 24): `h2` 24px white "Subscription Tools", then two list cards (fill `background.secondary`, 1px border default, radius xl(20), padding 20, row space-between):
     - **Restore Purchases** — title `subhead` white + `caption` secondary ("Re-link a subscription tied to your Apple ID" on iOS / "…Google account" on Android); trailing `refresh` 20px tertiary (or a tertiary spinner while restoring).
     - **Manage Subscription** (margin-top 12) — title + `caption` secondary "Cancel, change plan, or update billing in {the App Store|Google Play}"; trailing `open-outline` 20px tertiary.
   - **LEGAL / TERMS** (padding-h 24, margin-top 32): `caption` secondary lineHeight 18 — the full auto-renew disclosure: "Subscriptions auto-renew at the same price for the same period unless cancelled at least 24 hours before the end of the current period. Manage or cancel any time in {Apple ID Settings|Google Play subscriptions}. Payment is charged to your {Apple ID|Google} account on confirmation. Any unused portion of a free trial is forfeited when you upgrade to paid. Prices may vary by region." Then a row (gap 16, margin-top 16) of two link buttons `caption` 600 **cyan**: "Terms of Service" → `zeitra.app/terms`, "Privacy Policy" → `zeitra.app/privacy".

### 3. Data / text shown
- Title "Subscription"; hero "Choose Your Plan" + subcopy. Four tiers with names, prices, periods, badges, and feature bullets:
  - **Free** — "Free" / "forever" — color secondary grey. Features: "Basic Workout Logging & 1RM", "ExerciseDB Library (Standard)", "Limited Meal Tracking (No AI)", "Standard Community Access".
  - **Pro** (RECOMMENDED) — "$9.99" / "/mo" — color **lime** (`accent.coral`). Features: "Advanced Analytics & Real-time Insights", "Unlimited AI Meal Planning", "Custom Workout Routines", "Advanced Circadian Fasting Timer".
  - **Premium** — "$19.99" / "/mo" — color blue `#4FC3F7`. Features: "Everything in Pro tier", "Direct Chat with Professional Coaches", "Priority Support line", "Ad-Free Experience & Export Data".
  - **Enterprise** — "$49.99" / "/mo" — color purple-light `#9E7BFF`. Features: "Client Management Dashboard (For Coaches)", "Global Template Creation", "Advanced Fleet Analytics & API Access", "Dedicated Account Manager".
- Action labels: "Current Plan" / "Downgrade to Free" / "Upgrade to {Name}". Tools copy + legal block (verbatim above). Link labels "Terms of Service" / "Privacy Policy".

### 4. Interactions + navigation
- Back → `router.back()`. Tapping a card selects it (highlights border/gradient/glow). **Upgrade to {Name}** → `requestSubscription` (IAP); if IAP unavailable → Alert "Subscribe on the web / In-app purchases aren't available on this device. You can subscribe at zeitra.app instead." → Cancel / "Open website" (`zeitra.app/pricing`). Successful purchase fires the listener → server receipt validation → Alert "Welcome to {tier}! / Your subscription is active." (or a "Purchase issue" Alert). **Restore Purchases** → `restorePurchases()` (Alerts on failure / none found). **Manage Subscription** → opens the store's manage-subscriptions sheet (or the web fallback URL). Legal links open in browser.

### 5. Loading / empty / error states
- **Loading** (status query): non-scrolling skeleton — centered hero placeholders (70% title, 90% subtitle), a horizontal row of two 75%-width × 450px tier-card skeletons, then a tools section (55% header + two 72px row skeletons).
- **Error** (status query): centered honest-error surface (NOT a defaulted grid) — a GlassCard (maxWidth 420) with a 72×72 circle (lime@12% fill, lime@24% border) + icon `cloud-offline-outline` 36px lime, `h3` white "Couldn't load your subscription", `body` secondary "We couldn't check your plan status. Check your connection and try again.", and a lime **CtaButton** "Try Again" (icon `refresh`) → refetch.
- Prices fall back to the hardcoded `fallbackPrice` until the IAP catalog loads.

### 6. Exact Zeitra styling per element
- Header border `#222838`. Tier cards width = 75% screen, minHeight 450, radius 24, padding 24; selected = 2px tier-color border + tier gradient + glow(tierColor), unselected = 1px default border + `#13161F` fill. Badges radius full, **ink `#000`** text, fill tier color (or cyan for CURRENT PLAN). Name `display` 28; price `statMedium` 32 mono. Divider hairline `#222838`. Feature check icons in tier color. Action button radius 14; selected-paid = tier-color fill + ink text + glow. Tools cards `#13161F` fill, default border, radius 20, padding 20. Legal links cyan 600.

### 7. Animations
Carousel snaps per-card (snapToInterval, fast deceleration). Selecting a card animates its border/gradient/glow on. `FadeInDown` for hero → carousel → tools → legal. Pressed-scale 0.97 (activeOpacity 0.85/0.9). Action & restore buttons swap to an ink/tertiary `ActivityIndicator` while their async op runs. Error CtaButton springs in.

---
