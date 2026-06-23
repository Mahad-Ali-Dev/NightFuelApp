# Zeitra UI Spec — 08. Modals & Active Workout

This file is self-contained. Paste it into GPT (or hand it to a designer) to render
high-fidelity mockups of the **Modals & Active Workout** section of the Zeitra mobile app.
Every value below is pulled from the real React Native source — colors, radii, spacing,
typography, copy, data fields, interactions, loading/empty/error states, and animations.
Nothing here is invented.

---

## ZEITRA DESIGN SYSTEM (condensed — every mockup MUST follow this)

**Brand.** Athletic, premium, high-contrast, energetic. Tagline: **"STRONG TODAY. BETTER EVERYDAY."** Logo = lime "Z" + dumbbell on black.

**Color tokens** (literal hex values the code uses. NOTE: after the Zeitra rebrand the code key `accent.coral` is the **lime brand color** — the key name is legacy "coral" but the value is lime. Treat `accent.coral` as PRIMARY/lime everywhere below):

| Token (in code) | Hex | Use |
|---|---|---|
| `background.primary` | `#0A0C12` | App background (deep near-black) |
| `background.secondary` | `#13161F` | Card / surface, header strip, stat tiles |
| `background.tertiary` | `#1B2030` | Elevated surface, inputs, ring tracks, progress tracks |
| `background.quaternary` | `#242B3D` | Higher elevation (Ria AI bubbles, thinking bubble) |
| `border.default` | `#222838` | 1px glass hairline borders, dividers, ring tracks |
| `border.light` | `#2F3650` | Lighter border (floated chips, dashed buttons) |
| `accent.coral` (PRIMARY / lime) | `#A8CC3C` | Primary CTA, brand, active state, set-progress, rest accent, workout accent |
| `accent.coralLight` | `#B8D95C` (brighter lime) | Lime icons inside error/upgrade chips |
| `accent.coralDark` / lime-deep | `#93B82E` | CTA gradient end |
| `accent.cyan` | `#00D4AA` | Success / progress / nutrition / sleep-duration / "Save" actions |
| `accent.purple` | `#7C4DFF` | AI, Coach Ria, sleep moon accent |
| `accent.purpleLight` | `#9B72FF` (brighter purple) | Ria text/icons, quota pill |
| `accent.amber` / warning | `#FFB300` | Caution, wake-ups, "thinking" status, quota-empty pill |
| `accent.amberLight` | `#FFC74D` | Amber text in quota-empty pill |
| `accent.red` / error | `#FF4444` | Danger, delete, validation errors |
| `accent.emerald` | `#10B981` | Positive / "Online" status / excellent sleep |
| `text.primary` | `#FFFFFF` | Headings, values |
| `text.secondary` | `#9BA3B4` | Muted body / labels |
| `text.tertiary` | `#7B8497` | Faint captions, placeholders, inactive icons |
| `text.inverse` | `#0A0C12` | **INK** text/icons ON lime/cyan fills |
| Gradient `gradients.cyan` | `['#00D4AA','#4FC3F7']` | Complete-screen Return CTA |
| Gradient `gradients.coral` | `['#A8CC3C','#93B82E']` | Lime brand hero / CtaButton fill |
| Gradient `gradients.purple` | `['#7C4DFF','#9B72FF']`-ish | Ria avatar |

`withAlpha(color, a)` = that color at alpha `a` (e.g. `withAlpha('#A8CC3C', 0.16)` = lime @ 16%). Most tinted fills/borders are alpha-accents over the dark surface.

**CTAs.** Two CTA primitives are used here:
- **`Button`** (`@/components/ui/Button`) — the standard primary button. `variant="primary"` = **LIME fill (`#A8CC3C`)** with **INK `#0A0C12` text + icons**, radius ~14, bold, subtle lime glow. `variant="outline"` = transparent fill, lime border + lime label/icon. `fullWidth` stretches it. `iconRight` / `icon` place an Ionicon.
- **`CtaButton`** (`@/components/ui/CtaButton`) — the premium gradient CTA: **lime gradient (`#A8CC3C → #93B82E`) fill, INK text + icon**, radius ~14, soft lime glow, `size` `md`/`lg`, optional leading `icon`, `loading` spinner state.
- **NEVER white-on-lime.** Ink (`#0A0C12`) on lime/cyan always.

**Cards.** `Card variant="glass"` and `GlassCard` = dark-glass surface (`#13161F`-ish with blur), radius 16–24, 1px `#222838` border, generous padding (12–24). May carry a soft colored `glow` shadow — keep subtle. `shadows.glow(color)` = a colored drop-shadow halo used on active pills, CTAs, progress fills, avatars.

**Typography** (family Inter for UI, JetBrains Mono for stat numerals):
- `display` Inter-ExtraBold 36/44, ls −0.5 · `heading`/`h2` Inter-Bold 24/32 · `h3` Inter-SemiBold 20/28
- `subhead` Inter-SemiBold 16/24 · `body` Inter-Regular 15/22 · `bodySm` 14/20
- `caption` Inter-Regular 12/16 · `overline` Inter-SemiBold 11/16, ls **1.4–1.5**, UPPERCASE, muted
- Stat numerals (mono): `statLarge` 48/56 · `statMedium` 32/40 · `statSmall` 24/32 · `statTiny` 16/22

**Spacing scale (4px grid):** `xxs`2 `xs`4 `sm`8 `md`12 `lg`16 `xl`20 `2xl`24 `3xl`32 `4xl`40 `5xl`48.
**Radius scale:** `sm`4 `md`10 `lg`14 `xl`20 `2xl`24 `3xl`28 `full`9999.
**Icon set:** **Ionicons**. Sizes mostly 13–28.

**Motion (premium).** Reanimated entrances: `FadeInDown`/`FadeIn` with staggered per-section delays (~50–200ms apart), springy card reveals (`.springify().damping(18).mass(0.7)`), animated progress rings/bars, pressed-scale **0.92–0.97** on cards/CTAs/chips (gesture-driven). Where current code only uses `activeOpacity` 0.7–0.9, the mockup should still depict the press-scale + entrance target.

**These are MODAL screens** — most are presented modally (slide-up sheet) or pushed as a full screen. **They do NOT show the app bottom tab bar** (Home / Train / Fuel / Circadian / More). They each own a **custom top bar** with a **close "X"** (Ionicons `close`, 28, white) at the leading edge and either a centered title and/or a trailing action. The one exception worth noting for full-frame context: the app's tab bar is **Home / Train / Fuel / Circadian / More**, active = lime icon+label, inactive muted `#7B8497` — but render NONE of these screens with it.

---

# SECTION SCREENS

1. **Active Workout (modal)** — `(modals)/active-workout.tsx` — "Night Shift Prep" live logger
2. **AI Coach (modal)** — `(modals)/ai-coach.tsx` — Coach Ria chat
3. **Barcode Scanner (modal)** — `(modals)/barcode-scanner.tsx` — camera food scan
4. **Build Plate (modal)** — `(modals)/build-plate.tsx` — visual meal builder
5. **Create Post (modal)** — `(modals)/create-post.tsx` — community composer
6. **Log Shift (modal)** — `(modals)/log-shift.tsx` — shift entry form
7. **Log Sleep (modal)** — `(modals)/log-sleep.tsx` — sleep & recovery
8. **Premium (modal)** — `(modals)/premium.tsx` — paywall / upgrade
9. **Active Workout (routed)** — `training/workout.tsx` — full routine logger w/ rest modal + confetti
10. **Workout Complete** — `training/complete.tsx` — session summary

---

# 1. Active Workout (modal) — `(modals)/active-workout.tsx`

### Purpose
The live "logging a workout" screen for the seeded **"Night Shift Prep"** session. A big elapsed clock + session-completion ring at top, a live stat grid, a snapping exercise rail, then one card per exercise with an animated demo, set-logging rows, previous-set hints, and "Add Set". A lime Finish CTA persists everything and routes to the Complete summary. A rest banner with a countdown ring appears after each completed set.

### Full top-to-bottom layout
**Status bar:** light. Screen bg `background.primary` `#0A0C12`, top padding = safe-area inset.

**A. Hero header** (`FadeInDown` 420ms; `paddingHorizontal:20`, `paddingBottom:16`, bottom hairline `#222838`):
- **Top row** (space-between):
  - **Left column:**
    - **Live row:** an 8×8 lime dot (`#A8CC3C`, radius 4) + overline **"ACTIVE WORKOUT"** in lime. Gap 7.
    - **Title:** `h2` white **"Night Shift Prep"** (numberOfLines 1), marginTop 4.
    - **Meta row** (gap 8, marginTop 8): Ionicons `time-outline` 16 lime + the **elapsed clock** in `statSmall` lime (format `MM:SS`, ticks every second from 00:00), then a **pill chip** (`background.tertiary` fill, `#222838` border, radius 999, padH 10 / padV 4) overline **"HYPERTROPHY"** in `text.secondary`.
  - **Right: session-completion RING** — `CircularProgress` size 84, strokeWidth 8, lime ring on `background.tertiary` track. Center: `statSmall` white **the integer percent** (e.g. `40`, fontSize 22) over overline `text.tertiary` **"% DONE"** (fontSize 9). Progress = doneSets / totalSets across all exercises.
- **Finish CTA:** `Button` title **"Finish"**, `fullWidth`, `iconRight` = Ionicons `checkmark-done` 20 ink. Lime fill, ink text. marginTop 16.

**B. Rest banner** (conditional — only while a rest is active; `FadeIn` 260ms): a lime-glass banner (`marginHorizontal:20`, `marginTop:14`, padH 16 / padV 12, radius 20, fill `withAlpha(lime,0.1)`, border `withAlpha(lime,0.3)`, lime glow). Row:
  - **Left copy:** Ionicons `timer` 22 lime, then a column: overline **"REST"** lime over `caption` `text.secondary` **"Catch your breath"**.
  - **Center:** a `RestTimer` ring (size 92) — its own countdown ring + `MM:SS` numeral, counts down from **90s** (`REST_SECONDS`). Re-arms fresh each set.
  - **Right:** a 40×40 circular **Close** button (border `withAlpha(lime,0.4)`, radius 20) Ionicons `close` 20 lime.

**C. ScrollView** (`paddingBottom:100`). Shown only when ≥1 exercise is seeded:
- **Stat GRID** (`FadeInDown` delay 60): three equal-width `StatTile`s in a row (gap 10, padH 20, padTop 18). Each tile: `background.secondary` fill, `#222838` border, radius 18, pad 12. Layout = a 30×30 rounded-square accent chip (`withAlpha(lime,0.16)` fill, radius 10) holding a 15px lime glyph, then a value row (`statSmall` white value + optional small `caption` unit), then an overline `text.tertiary` label.
  - Tile 1: icon `layers-outline`, value = **live volume** (e.g. `1.2k` when ≥1000 else the integer), unit **"kg"**, label **"VOLUME"**.
  - Tile 2: icon `checkmark-done-outline`, value **"`done`/`total`"** sets, label **"SETS DONE"**.
  - Tile 3: icon `time-outline`, value = **elapsed** `MM:SS`, label **"ELAPSED"**.
- **Rail header** (`FadeInDown` delay 110; padH 20, padTop 22, space-between): overline `text.tertiary` **"SESSION"** + `caption` `text.secondary` **"`N` exercises"**.
- **Exercise RAIL** (`FadeInDown` delay 140) — horizontal snapping carousel (`snapToInterval:172`, fast decel; padH 20, gap 12). One **160-wide pill** per exercise (`background.secondary` fill, radius 18, pad 14; border `#222838`, OR when that exercise is fully done → lime border + lime glow):
  - **Top row** (space-between): a small index badge (min-width 26 × 22, radius 7) showing the **zero-padded number** `01`,`02`… (incomplete = `withAlpha(lime,0.14)` fill + lime text; complete = solid lime fill + ink text), and a status icon `ellipse-outline` (incomplete, `text.tertiary`) / `checkmark-circle` (complete, lime), 16.
  - **Name:** `subhead` white (numberOfLines 1), marginTop 10.
  - **Counter:** `caption` **"`done`/`total` sets"** (`text.secondary`, or lime when complete), marginTop 2.
  - **Mini progress sliver:** 4px track (`background.tertiary`, radius 999) with a lime fill at `done/total` %.

**D. Exercise list** (`paddingHorizontal:xl`, `paddingTop:lg`). Each card enters with `FadeInDown.delay(160 + index*70).springify().damping(18).mass(0.7)`. **Per-exercise card** (`Card variant="glass"`, pad 16, marginBottom 20; when complete → border `withAlpha(lime,0.55)`):
  - **Demo band** (height **220**, pulled flush to card top/sides via negative margins, top corners radius 16, clipped):
    - `ExerciseDemo` — animated frame-pair loop / curated still + "Full tutorial" deep-link / honest "coming soon" still (falls back to a bundled neutral placeholder image when no media). It self-contains its states and never shows an empty player.
    - A **bottom scrim** (72px tall, `rgba(10,12,18,0.55)`) for legibility.
    - **Floated index marker** (top-left, padH 9 / padV 4, radius 999, fill `withAlpha(bg,0.72)`, border `border.light`): overline lime zero-padded number `01`.
    - **Floated set badge** (bottom-left, same chip style): Ionicons `barbell` 13 lime + overline white **"`done`/`total` SETS"**.
  - **Exercise header row** (space-between, align top): left column = `h3` white **exercise name** + a target row (Ionicons `flag-outline` 13 `text.tertiary` + `caption` `text.secondary` **"Target: `{reps}` reps"**); right = a 34×34 **More** button (radius 12, border `border.light`) Ionicons `ellipsis-horizontal` 18 `text.secondary`.
  - **Set-progress bar:** 6px track (`background.tertiary`, radius 999, marginTop 14 / marginBottom 18) with a lime fill (+ lime glow when >0) at `done/total` %.
  - **Set header row** (padH 10, marginBottom 10): overline `text.tertiary` columns — **"SET"** (width 36), **"KG"** (flex, centered), **"REPS"** (flex, centered), then a 48-wide spacer.
  - **Set rows** (one per logged set; padH/padV 10, radius 14, marginBottom 8; incomplete = `background.tertiary` fill + transparent border, complete = `withAlpha(lime,0.1)` fill + `withAlpha(lime,0.4)` border):
    - **Col 1 (width 36):** `statTiny` set number (white, or lime when done) over a tiny overline **previous-set hint** (`text.tertiary`, fontSize 9). The hint reads: for set 1, **"last time: `{weightKg}`x`{reps}`"** when cross-session history exists (else `-`); for later sets, the in-session prior set **"`{w}`x`{r}`"** (else `-`).
    - **Col 2 (KG input):** a centered numeric `TextInput` (mono `statSmall` 18px, white, `background.secondary` fill, radius 12, border `#222838` or lime-tinted when done). Placeholder = `135` for set 1, else the previous set's weight or `-`.
    - **Col 3 (REPS input):** same style; placeholder = the low end of the target reps range (e.g. `8` from `"8-12"`).
    - **Check button (44×44, radius 14, marginLeft 8):** incomplete = `background.secondary` fill + `border.light` border + `text.tertiary` checkmark; done = **solid lime fill + ink checkmark + lime glow**. Ionicons `checkmark` 22.
  - **Add Set control:** a **dashed** bordered button (full width, padV 12, radius 14, border `border.light` → lime when expanded): Ionicons `add` (or `checkmark` when expanded) 18 + label **"Add Set"** → **"Done adding"** when expanded, in `text.secondary` → lime.
  - **Revealed SetLogger** (when "Add Set" is toggled, marginTop 12): the hardened `SetLogger` component (its own glass card surface) for validated weight/reps entry; on submit it appends a completed set row and starts a rest.

- **Add Exercise CTA** (`FadeInDown` delay 200): `Button variant="outline"`, `fullWidth`, icon Ionicons `add` 20 lime, title **"Add Exercise"**, marginTop 8. → pushes the exercise catalogue.

### Data / text shown
- Title **"Night Shift Prep"**, plan tag **"HYPERTROPHY"**, status **"ACTIVE WORKOUT"**, **"REST" / "Catch your breath"**, stat labels **VOLUME / SETS DONE / ELAPSED**, **"SESSION" / "N exercises"**, per-set previous-set hints, **"Target: X reps"**, column heads **SET/KG/REPS**, **"Add Set"/"Done adding"**, **"Add Exercise"**, **"Finish"**.
- Live computed: elapsed `MM:SS`, % done, live volume (kg·reps over completed sets), done/total sets per exercise and session.
- The Finish summary forwards: `elapsed` (seconds), `volume` (kg), `kcal` (≈ elapsedMin × 6).

### Interactions + navigation
- **Tap a set checkmark** → toggles that set done; completing starts a 90s rest (banner appears with ring), un-completing stops it.
- **Edit KG/REPS** → live updates volume + the row.
- **Add Set** → reveals SetLogger; a valid entry appends a completed set + starts rest.
- **More (⋯)** → currently a non-navigating affordance (button present, no destination).
- **Finish** → logs each exercise with ≥1 completed set to the backend, ends the session, invalidates workout caches, then `router.replace('/training/complete', { elapsed, volume, kcal })`.
- **Rest Close** → stops the rest cycle.
- **Add Exercise** → `router.push('/(exercises)')` (catalogue).

### Loading / empty / error
- **Loading** (session loading, no exercises yet): 3 skeleton glass cards mimicking the card chrome (title bar + meta + two 36px set-row bars).
- **Error** (session fetch failed, no exercises): `EmptyState` icon `cloud-offline-outline`, title **"Couldn't load workout"**, subtitle **"We couldn't reach your active session. Check your connection and try again."**, action **"Retry"**.
- **Empty** (no error, no exercises): `EmptyState` icon `barbell-outline`, title **"No exercises yet"**, subtitle **"Add your first exercise to start logging this workout."** (no action button; the Add Exercise CTA still shows below).

### Styling notes
- Rest is 90s. Ring sizes: completion 84, rest 92. Demo band 220 tall. All accents = lime `#A8CC3C`. Inputs mono.

### Animations
- Header `FadeInDown` 420; stat grid 60, rail header 110, rail 140; each exercise card `160+i*70` with spring (damping 18, mass 0.7); Add Exercise 200. Rest banner `FadeIn` 260. Check button + progress fill carry lime glow when active. Press-scale 0.85–0.97 target.

---

# 2. AI Coach (modal) — `(modals)/ai-coach.tsx`

### Purpose
Full-screen chat with **Coach Ria**, the purple AI assistant. Token-by-token streaming replies, persisted history, quick-question chips, a daily message quota with an upgrade path, and an **opt-in voice** layer (tap-to-talk mic + "Ria speaks replies" TTS toggle). The **only purple-accented modal** in this section — Ria's accent is purple `#7C4DFF` / `#9B72FF`, not lime.

### Full top-to-bottom layout
**Status bar:** light, translucent. Screen bg `#0A0C12`, top padding = inset.

**A. Glass header** (full-bleed `GlassCard` radius 0, frosted; bottom hairline `border.light` `#2F3650`; padH 16 / padV 12, row space-between):
- **Left:** 40×44 hit area, Ionicons `close` 28 white → `router.back()`.
- **Center** (row, flex, centered): a **38×38 purple-gradient Ria avatar** (radius 19, purple glow) with Ionicons `sparkles` 18 white; then a column: **"Coach Ria"** (`heading`, fontSize 17, weight 800, white) over a **status badge** — a 6×6 dot + `caption` (fontSize 11, bold): when idle = **emerald** dot + **"AI Coach · Online"** (emerald); when working = **amber** dot + **"Thinking..."** (amber).
- **Right:** the **quota pill** (padH 10 / padV 5, radius 12, maxWidth 96) **"`N` left today"** — purple-tinted (`withAlpha(purple,0.14)` fill, purpleLight text) when remaining >0, amber-tinted when at 0. If history hasn't loaded yet, a 40-wide spacer instead.

**B. Body** (`KeyboardAvoidingView` → `ScrollView`, pad 20, paddingBottom 40, auto-scrolls to end):
- **Date header:** `caption` `text.secondary`, bold, centered, UPPERCASE — today's date as **"WEDNESDAY, JUN 23"** (weekday, short month, day), marginBottom 24.
- **Message bubbles** (last ≤80 rendered; full history kept in state). Each `MessageBubble` (row, align bottom, marginBottom 14):
  - **AI (Ria) bubble** — left-aligned, preceded by a 28×28 purple-gradient mini avatar (sparkles 12). Bubble: maxWidth 80%, pad 14, radius 18 with a **flattened bottom-left tail (radius 4)**, fill `background.quaternary` `#242B3D`, 1px `withAlpha(purple,0.38)` border, soft purple glow. Inside: an **"RIA"** overline label (purpleLight, fontSize 10, ls 0.5) + (while streaming) a pulsing header dot; then the message body (`body`, white, lineHeight 22) with **URLs auto-linkified** (purpleLight underlined, tappable) and a blinking **▌** cursor while streaming; then a timestamp `caption` (fontSize 10, `text.tertiary`, left-aligned) like **"11:42 PM"**.
  - **User bubble** — right-aligned, **solid purple `#7C4DFF` fill**, radius 18 with flattened bottom-right tail (4), purple glow, white body text, right-aligned timestamp (white @75%).
- **Thinking indicator** (only before any live tokens land): a left-aligned "thinking" bubble (`background.quaternary`, `withAlpha(purple,0.35)` border, purple glow) with an **"RIA"** overline + **three pulsing/glowing purple dots** (`TypingDots`, staggered phases).
- **Quota-exhausted card** (when daily limit hit) — inline `GlassCard` radius 20 with coral/lime glow, centered: a 44×44 round icon chip (`withAlpha(lime,0.16)`) Ionicons `flash` 22 coralLight; **"Daily AI limit reached"** (`heading`, 16, weight 800); body **"You've used all `{limit}` of today's `{Pro }`Ria messages. Resets `{in 3h}`."**; then a **`CtaButton`** label **"Upgrade for more"**, icon `rocket`, size md → `router.push('/(modals)/premium')`.
- **Quick Questions** (only when ≤2 messages, not typing, not exhausted, no error): overline-ish `caption` bold **"QUICK QUESTIONS"** + a wrapped row of `SuggestionChip`s (padH 14 / padV 11, radius 20, minHeight 44, `withAlpha(purple,0.14)` fill, purpleLight border). The four chips:
  - **"Why am I tired today?"**, **"Give me a quick 15-min workout"**, **"How does my sleep look?"**, **"What should I eat before my shift?"** Tapping one sends it.

**C. Glass input bar** (full-bleed `GlassCard` radius 0, frosted; top hairline `border.light`; bottom safe-area pad; pinned to keyboard):
- **If quota exhausted:** the composer is replaced by a single full-width **`CtaButton`** label **"Daily AI limit reached — Upgrade"**, icon `lock-open` → premium.
- **Else:**
  - **Voice opt-in bar** (row, space-between, minHeight 28): a **"Ria speaks replies"** toggle pill (`SpeakToggle` — Ionicons `volume-mute`/`volume-high` 14 + label, purple-tinted when on) shown only if TTS is available; on the right a live **"Listening…"** label (purpleLight) while the mic is active. If neither voice engine exists, the whole bar is just `caption` `text.tertiary` **"Voice needs a dev build"**.
  - **Input row** (align bottom, gap 10, padH 12 / padTop 12):
    - **Mic button** (44×44, radius 22): `idle` = `background.tertiary` fill + `border.default` + purpleLight `mic` glyph; `listening`/`starting` = purple fill + purpleLight border + white `mic` + purple glow; `unavailable` = dimmed (opacity .45) `mic-off` `text.tertiary`.
    - **TextInput** (flex, minHeight 44 / maxHeight 120, radius 22, padH 16, `background.tertiary` fill, border `#222838` → `withAlpha(purple,0.5)` when non-empty). Placeholder **"Ask Ria about your shift protocol..."** (or **"Listening… speak to Ria"** while listening). Multiline, maxLength 500.
    - **Send button** (44×44, radius 22): enabled = purple fill + purpleLight border + purple glow + white `arrow-up` 20; disabled = `background.tertiary` + `border.default` + `text.tertiary` glyph; busy = small white spinner.

### Data / text shown
- Header **"Coach Ria"**, status **"AI Coach · Online"** / **"Thinking..."**, quota **"`N` left today"**.
- **Seeded greeting** (when no history): **"Hi `{FirstName}`! 👋 I'm Ria, your Zeitra AI Coach. I'm here to help you optimize your nutrition, sleep, and training around your shift schedule. What's on your mind?"**
- Date header, message bodies + timestamps, **"RIA"** labels, the 4 quick-question chips, **"QUICK QUESTIONS"**.
- Quota-exhausted copy + **"Upgrade for more"** / **"Daily AI limit reached — Upgrade"**.
- Voice copy: **"Ria speaks replies"**, **"Listening…"**, **"Voice needs a dev build"**.
- Free plan = **5/day**, Pro = **20/day** (the default daily caps).
- Notices (local AI bubbles): rate-limit **"You're sending messages quickly — give me a moment and try again in `{n}`s."**, sanitize-reject **"I didn't catch that — could you type your question again?"**, generic error **"Sorry, I hit a snag: `{message}`"**.

### Interactions + navigation
- **Type + Send** (or tap a suggestion) → user bubble appears, reply **streams token-by-token** into a Ria bubble (falls back to a typed-out non-streaming reply on stream failure). If TTS on, Ria speaks the reply.
- **Mic tap** → starts/stops tap-to-talk; interim transcript previews in the input, the final transcript is sent.
- **"Ria speaks replies" toggle** → flips TTS; turning off silences current speech.
- **Quota 429** → composer flips to the locked upgrade state; pill shows "0 left today".
- **Upgrade CTAs** → `router.push('/(modals)/premium')`.
- **Close (X)** → `router.back()`.
- **Tap a link in a bubble** → opens the URL.

### Loading / empty / error
- **Loading history:** a centered purpleLight `ActivityIndicator` (paddingTop 40).
- **History-load error:** an inline `GlassCard` (radius 20, lime/coral glow) with a 44×44 icon chip (`cloud-offline-outline` 22 coralLight), **"Couldn't load your conversation"** (`heading` 16, weight 800), body **"Check your connection and try again."**, and a **bordered "Retry" pill** (Ionicons `refresh` 16 purpleLight + **"Retry"**; deliberately NOT a lime CTA). Replaces the spinner; hides the quick-questions.
- **Empty conversation:** the seeded greeting + quick-question chips.

### Styling notes
- Ria = **purple** throughout (avatar gradient, bubbles, mic/send active, suggestion chips). Status dot emerald/amber. Quota pill purple/amber. This is the only non-lime-accented screen here.

### Animations
- `TypingDots`: 3 dots, one shared 0→1 clock, each derives opacity 0.35→1 + scale 1→1.35 from a phase-offset triangle wave (GPU opacity+scale, glowing).
- Streaming cursor **▌** + header dot: blink via a shared 900ms in-out clock (opacity 0.2→1, dot scale 0.85→1.15).
- Press feedback on suggestion/send/mic/speak/retry: gesture-driven scale **0.92–0.96** + slight opacity dip.
- ScrollView auto-scrolls to end on new content.

---

# 3. Barcode Scanner (modal) — `(modals)/barcode-scanner.tsx`

### Purpose
A full-screen camera to scan a food barcode (EAN/UPC/QR), look it up, and pre-fill the log-meal screen.

### Full top-to-bottom layout
**Status bar:** light. Screen bg **pure black `#000`**.
- **Live camera** (`CameraView`) fills the whole screen (back camera).
- **Dark overlay** (`rgba(0,0,0,0.5)`, space-between column) on top:
  - **Top area** (pad 20): a leading **close** button (Ionicons `close` 28 white, at `insets.top+10`), then centered **"Scan Food Barcode"** (`heading`, white, marginTop 20).
  - **Scanner frame** (centered, **250×250**): four white **L-corner brackets** (40×40, 4px white borders) at each corner, and a **horizontal scan line** (full width, 2px, **lime `#A8CC3C`**, ~50% down, opacity .8) — the scan line **hides while a lookup is in flight**.
  - **Bottom area** (pad 40 / padBottom 60, centered): normally `caption` `#ccc` **"Position the barcode within the frame"**; while looking up → a rounded pill (`rgba(0,0,0,0.6)`, radius 24, padH 20 / padV 12) with a small lime `ActivityIndicator` + `body` white **"Looking up food…"**.

### Data / text shown
- **"Scan Food Barcode"**, **"Position the barcode within the frame"**, **"Looking up food…"**.
- Barcode types scanned: `ean13`, `ean8`, `upc_a`, `upc_e`, `qr`.
- Alert copy (see below): **"Product Not Found"**, **"Lookup Failed"**.

### Interactions + navigation
- **Successful scan + found food** → `router.navigate('/(meals)/log-meal')` pre-filled with `barcodeName / barcodeCalories / barcodeProtein / barcodeCarbs / barcodeFat`.
- **Not found / lookup failed** → an **Alert**: title **"Product Not Found"** (body **"Barcode \"`{code}`\" wasn't found in the database. You can search for it manually."**) or **"Lookup Failed"** (body **"Could not reach the food database. Check your connection and try again."**), with buttons **"Search Manually"** (→ log-meal) and **"Scan Again"** (resets to scan).
- **Close (X)** → `router.back()`.

### Loading / empty / error
- **No permission object yet:** a plain `#0A0C12` screen (nothing).
- **Permission denied:** centered `EmptyState` icon `camera-outline`, title **"Camera access needed"**, subtitle **"Allow camera access to scan food barcodes and log meals instantly."**, action **"Grant Permission"**.
- **Looking up:** the "Looking up food…" pill (scan line hidden).
- **Error:** the Alerts above.

### Styling notes
- Black canvas, white chrome, **lime scan line**. Corner brackets white 4px. The lookup pill is the only translucent surface.

### Animations
- None scripted in code beyond the camera feed; for the mockup depict the scan line as the focal lime element (an animated sweep is the intended feel).

---

# 4. Build Plate (modal) — `(modals)/build-plate.tsx`

### Purpose
A visual "build a meal on a plate" composer: pick a meal type, tap foods to add them onto a dashed circular plate, watch live macro totals, then save the meal. Cyan-accented (nutrition).

### Full top-to-bottom layout
**Status bar:** light. Screen bg `#0A0C12`, top padding = inset.

**A. Header** (row space-between, padH 20 / padV 16, bottom hairline `#222838`):
- Leading **close** (Ionicons `close` 28 white) → `router.back()`.
- Center **"Build Your Plate"** (`heading`, white).
- Trailing **scan** (Ionicons `scan-circle-outline` 28, **cyan**) → `router.push('/(modals)/barcode-scanner')`.

**B. Meal-type picker** — a horizontal chip row (padH 16 / padV 12). Four chips (padH 16 / padV 8, radius 20, marginRight 8): **Breakfast / Lunch / Dinner / Snack**. Selected = **cyan fill + cyan border + cyan glow + white bold text**; unselected = `background.secondary` fill, `#222838` border, `text.secondary` medium text. Default **Breakfast**.

**C. Plate area** (padV 24, centered, bottom hairline):
- **Circular plate** (200×200, radius 100, **2px dashed border**, padding 24): empty = `#222838` border + transparent fill + centered `caption` `text.secondary` **"Drag items or tap to add to plate"**; with items = **cyan dashed border + `withAlpha(cyan,0.06)` fill + cyan glow** and a centered Ionicons `restaurant-outline` 48 cyan.
- **Macro summary row** (space-around, width 100%, marginTop 24): four stacked stat blocks — **KCAL / PRO / CARB / FAT**, each = `statSmall` white value (PRO/CARB/FAT append a small `statTiny` `text.secondary` **"g"**) over an overline `text.secondary` label. Values are the rounded running totals.

**D. ScrollView** (pad `xl`, paddingBottom 100):
- **Section header** (row space-between, marginBottom 16): `heading` white **"Quick Add"** + Ionicons `search` 20 `text.secondary`.
- **Quick-add food list** — `Card variant="glass"` rows (row, pad 12, marginBottom 8): a 40×40 cyan-tint icon box (`withAlpha(cyan,0.12)`, radius 8) Ionicons `fast-food` 20 cyan; a column with `subhead` white **food name** + `caption` `text.secondary` macro line **"`{cal}` kcal • `{P}`P / `{C}`C / `{F}`F"**; trailing Ionicons `add-circle` 24 cyan. (Seeded from a "chicken rice broccoli" search, up to 10.)
- **Current Plate** (only when ≥1 item, marginTop 24): `heading` white **"Current Plate"** + one row per plate item (space-between, padV 12, bottom hairline): `body` white item name + a trailing Ionicons `trash-outline` 20 **coral/red** delete.

**E. Footer** (padH `xl`, bottom safe-area pad, top hairline, `background.primary`): a full-width **`Button`** **"Save Meal"** (lime, ink text), **disabled** when the plate is empty or saving; shows **"Saving…"** while saving.

### Data / text shown
- **"Build Your Plate"**, meal types, plate empty copy, **KCAL/PRO/CARB/FAT** + values, **"Quick Add"**, food name + macro line, **"Current Plate"**, **"Save Meal"/"Saving…"**.

### Interactions + navigation
- **Meal-type chip** → selects (cyan).
- **Scan icon** → barcode-scanner modal.
- **Tap a food row** → adds it to the plate (macros recompute).
- **Trash on a plate item** → removes it.
- **Save Meal** → logs the meal, invalidates the dashboard + nutrition calorie rings, `router.back()`. On error → Alert title **"Error"** + the server/error message.

### Loading / empty / error
- **Loading foods:** 4 skeleton glass rows (40×40 thumb + two text lines + a 24 round).
- **Foods error:** `EmptyState` icon `cloud-offline-outline`, **"Couldn't load foods"**, **"Check your connection and try again."**, action **"Retry"**.
- **No foods:** `EmptyState` icon `fast-food-outline`, **"No quick-add foods"**, **"Scan a barcode to add a food to your plate."**, action **"Scan barcode"** → barcode-scanner.

### Styling notes
- **Cyan** is the accent (scan icon, selected chip, plate, macros, add icons). Delete = red. CTA = lime. Plate is a dashed ring.

### Animations
- No Reanimated entrances in code (TouchableOpacity `activeOpacity` 0.8–0.85). For the mockup depict the plate fill/glow appearing as items are added; press-scale target on chips/rows.

---

# 5. Create Post (modal) — `(modals)/create-post.tsx`

### Purpose
A minimal community post composer: a big multiline text field, an optional image, an emoji picker, and a mention helper. Cyan-accented.

### Full top-to-bottom layout
**Status bar:** light. `KeyboardAvoidingView`, screen bg `#0A0C12`.

**A. Header** (row space-between, padTop `inset+20` / padBottom 16 / padH 20, bottom hairline):
- Leading 40×40 **close** (Ionicons `close` 28 white) → `router.back()`.
- Center **"New Post"** (`heading`, fontSize 18, white).
- Trailing **"Share"** text action (`subhead`, **cyan**, bold; opacity 0.5 + disabled until there's text).

**B. ScrollView** (pad 20):
- **Text input area** (minHeight 150): a borderless multiline `TextInput` (fontSize 18, lineHeight 28, white), autofocus, placeholder **"Share your progress, a recipe, or just say hi..."** (`text.tertiary`).
- **Image preview** (only when an image is picked, marginTop 20): a full-width 250-tall image (radius `lg`) with a floated **remove** button top-right (32×32, radius 16, `withAlpha(bg,0.7)` fill, `#222838` border) Ionicons `close` 20 white.

**C. Emoji picker row** (only when toggled): a horizontal scroller (maxHeight 60, top hairline, `background.secondary` bg) of 12 fitness emojis (each padH/padV 8, fontSize 26): **💪 🏃 🔥 🥗 😴 ⚡ 🎯 🙌 ❤️ 👊 🏋️ 🥤**. Tapping one appends it and closes the row.

**D. Toolbar** (row, pad 16, top hairline, bottom safe-area pad):
- **Photo** button: Ionicons `image-outline` 24 cyan + `caption` `text.secondary` **"Photo"** → opens the image library (edit on, quality 0.7).
- **Mention** button: Ionicons `at-outline` 24 cyan → inserts an `@` (smartly spaced).
- **Emoji** button: Ionicons `happy-outline` 24 — cyan normally, **coral/lime when the picker is open** → toggles the emoji row.
- **Trailing (margin-left auto):** a small cyan `ActivityIndicator` while posting.

### Data / text shown
- **"New Post"**, **"Share"**, placeholder copy, the 12 emojis, **"Photo"**.
- Error Alert: title **"Error"** + message (default **"Failed to create post"**).

### Interactions + navigation
- **Type** → enables Share.
- **Photo** → image picker → preview (removable).
- **@ / emoji** → text helpers.
- **Share** → creates the post, invalidates the community feed, `router.back()`. On error → Alert.
- **Close (X)** → `router.back()`.

### Loading / empty / error
- **Posting:** Share disabled + toolbar spinner.
- **Empty text:** Share dimmed/disabled.
- **Error:** Alert.

### Styling notes
- Cyan toolbar icons, lime/coral emoji-active, big borderless input. No card chrome — it's a clean composer.

### Animations
- None scripted; depict the emoji row sliding in and the press-scale target on toolbar buttons.

---

# 6. Log Shift (modal) — `(modals)/log-shift.tsx`

### Purpose
A form to log an upcoming/completed shift (date, start/end time, shift type, rest-day toggle, commute) so circadian recommendations align. Cyan-accented "Save".

### Full top-to-bottom layout
**Status bar:** light. Screen bg `#0A0C12`, top padding = inset.

**A. Header** (row space-between, padH 20 / padV 12, bottom hairline, **`background.secondary` fill**, subtle elevation):
- Leading **close** (Ionicons `close` 28 white) → `router.back()`.
- Center **"Log Shift"** (`heading`, fontSize 18, white).
- Trailing **"Save"** text action (`heading`, fontSize 16, **cyan**; greys to `text.tertiary` when there are validation errors; shows a small cyan spinner while saving).

**B. Body** (`KeyboardAvoidingView` → `ScrollView`, pad `xl`, paddingBottom 100):
- **Intro line:** `body` `text.secondary` **"Enter your upcoming or completed shift to align circadian recommendations."** (marginBottom 24).
- **Shift Date:** a `DateTimeField` (label **"Shift Date"**, date mode) with a "now" affordance; an inline red error below when invalid (else a 20px spacer). Default = today.
- **Times row** (two columns, gap 12): **Start Time** (default `19:00`) and **End Time** (default `07:00`), each a `DateTimeField` (time mode) + inline red error.
- **Shift Type:** `heading` white **"Shift Type"** (marginTop 24) then a **wrapped chip group** (gap 8). Five chips (padH 16 / padV 10, radius 20): **Fixed Night / Rotating / Split Shift / Irregular / 12-Hour Shift**. Selected = `withAlpha(cyan,0.2)` fill + cyan border + cyan glow + cyan bold label; unselected = `background.secondary` + `#222838` border + `text.secondary` label. Default **Fixed Night**. Inline red error below if any.
- **Rest Day toggle** (row space-between, marginTop 28 / marginBottom 20): `heading` white **"Rest Day (Day Off)"** + a `Switch` (track off `#222838` / on cyan, white thumb). Default off.
- **Commute** (`heading` white **"Commute Time (Minutes)"**): an input box (row, 52 tall, radius 12, `background.secondary` fill, `#222838` border → red on error) with a leading Ionicons `car-outline` 20 `text.secondary` + a numeric `TextInput` (white, placeholder `30`). Default `30`. Inline red error below if any.
- **Save Shift `Button`** (`variant="primary"`, lime, ink text) marginTop 40, with a `loading` spinner state, disabled when there are errors.

### Data / text shown
- **"Log Shift"**, **"Save"**, intro line, **"Shift Date"**, **"Start Time"/"End Time"**, **"Shift Type"** + the 5 type labels, **"Rest Day (Day Off)"**, **"Commute Time (Minutes)"**, **"Save Shift"**.
- Inline validation messages (red, fontSize 12) per field; otherwise an Alert title **"Error"** + message for non-validation failures.

### Interactions + navigation
- **Edit any field** → clears that field's inline error as you type/pick.
- **"now" on a DateTimeField** → fills current date/time.
- **Type chips / toggle** → select.
- **Save (header or button)** → client-validates; on success creates the shift, invalidates `current-shift` / `shifts` / `shifts-upcoming`, `router.back()`. Overnight shifts roll the end date to the next day automatically. On a server validation 400 → inline field errors; on 5xx/network → Alert.
- **Close (X)** → `router.back()`.

### Loading / empty / error
- **Saving:** header spinner + button loading; Save disabled.
- **Validation:** inline red helper text under the offending field(s); Save greyed.
- **Server/network error:** Alert.

### Styling notes
- **Cyan** for Save + selected chips + toggle. Red for errors. CTA = lime. Header has a filled `background.secondary` bar (distinct from the bare-bg modals).

### Animations
- None scripted; depict press-scale on chips/buttons.

---

# 7. Log Sleep (modal) — `(modals)/log-sleep.tsx`

### Purpose
Log a sleep session (start/end date-time, a 10-step quality bar, night wake-ups stepper, notes) and review **Recovery History**. Purple (moon) + cyan accents.

### Full top-to-bottom layout
**Status bar:** light. Screen bg `#0A0C12`, top padding = inset.

**A. Header** (row space-between, padH 20 / padV 12, bottom hairline, `background.secondary` fill, elevation):
- Leading **close** (Ionicons `close` 28 white) → `router.back()`.
- Center **"Sleep & Recovery"** (`heading`, fontSize 18, white).
- Trailing 28-wide empty spacer.

**B. Body** (`KeyboardAvoidingView` → `ScrollView`, pad `lg`, paddingBottom 40):
- **Add-new card** (only when the form is closed): a cyan-tinted row card (pad 16, radius 14, `withAlpha(cyan,0.12)` fill, `withAlpha(cyan,0.25)` border, cyan glow): a 44×44 cyan-tint circle (Ionicons `add` 24 cyan), a column **"Log New Sleep"** (`heading`, 15, white) + `caption` `text.secondary` **"Track your recovery for circadian optimization"**, and a trailing Ionicons `chevron-forward` 20 `text.tertiary`.
- **New Sleep form** (when opened) — a bordered card (`background.secondary`, radius 16, 1px border, pad 18):
  - **Form header:** `heading` cyan **"🌙 New Sleep Entry"** (Ionicons `moon` 16 cyan inline) + a trailing **close-circle** (Ionicons `close-circle` 24 `text.tertiary`).
  - **"SLEEP STARTED"** field label (overline-ish `caption`, ls 0.8) then a row: a date `DateTimeField` + a time `DateTimeField` (with a "now" that fills both). Defaults `today` + `23:00`. Inline red errors below.
  - **"SLEEP ENDED"** (marginTop 16): same date+time pair (now fills both). Defaults `today` + `07:00`. Inline red errors.
  - **"SLEEP QUALITY: `{q}`/10 `{emoji label}`"** label — the value is colored by quality. A **10-segment quality bar** (36 tall, radius 8, 1px faint border, padding 3): ten equal segments; segments ≤ the selected value are filled with the **quality color**, the rest are `background.primary`. Below it, a row **"Poor"** … **"Deep"** (`caption` fontSize 10). Default quality **7**. Inline red error.
    - Quality color scale: ≤3 = red, ≤5 = amber, ≤7 = cyan, ≥8 = emerald. Labels: **"😴 Poor" / "😐 Fair" / "🙂 Good" / "🌟 Excellent"**.
  - **"NIGHT WAKE-UPS"** (marginTop 16): a centered stepper (gap 12) — a 44×44 **minus** button (Ionicons `remove` 20 **coral/red**), a min-80 display box (Ionicons `alert-circle-outline` 16 + the count in `statTiny` 18; amber when >0 else `text.secondary`), a 44×44 **plus** button (Ionicons `add` 20 cyan). Default **0**. Inline red error.
  - **"RECOVERY NOTES"** (marginTop 16): a multiline `TextInput` (radius 10, `background.primary` fill, `#222838` border → red on error, minHeight 80), placeholder **"e.g. Woke up to bright light, felt groggy, used blackout curtains"**. Inline red error.
  - **Save `Button`** **"Save Recovery Data"** (`variant="primary"`, lime, ink) marginTop 20, `loading` state, disabled on errors.
- **Recovery History section header** (row space-between, marginBottom 14): left = Ionicons `bed-outline` 18 **purple** + `heading` white **"Recovery History"**; right = a **refresh** (Ionicons `refresh-outline` 18 `text.tertiary`).
- **Session cards** — `Card variant="glass"` (noPadding wrapper, pad 14, marginBottom 12). Per session:
  - **Top row** (space-between): Ionicons `moon-outline` 16 purple + `body` white date **"Jun 23, 2026"**; a **duration badge** (`withAlpha(cyan,0.15)` fill, radius 20) Ionicons `time-outline` 12 cyan + `caption` cyan **"7h 30m"** (or `—`).
  - **Time row** (top hairline, gap 10): a **Slept** block (overline **"SLEPT"** + time **"11:00 PM"**), an Ionicons `arrow-forward` 14, a **Woke** block (**"WOKE"** + **"07:00 AM"** or `—`), a vertical divider, a **Quality** block (**"QUALITY"** + **"7/10"** in the quality color), and — only if wake-ups >0 — another divider + a **Wake-ups** block (**"WAKE-UPS"** + **"`N`×"** in amber).
  - **Notes** (if any): a purple-tinted row (`withAlpha(purple,0.06)` fill, `withAlpha(purple,0.12)` border, radius 8) Ionicons `document-text-outline` 13 purple + the note (`caption` `text.secondary`, up to 2 lines).
  - **Alignment** (if a circadian score exists): a top-hairline row Ionicons `sunny-outline` 13 amber + `caption` **"Circadian Alignment: `{N}`%"** (the % in cyan bold).

### Data / text shown
- **"Sleep & Recovery"**, **"Log New Sleep" / "Track your recovery for circadian optimization"**, **"New Sleep Entry"**, field labels **SLEEP STARTED / SLEEP ENDED / SLEEP QUALITY / NIGHT WAKE-UPS / RECOVERY NOTES**, **"Poor"/"Deep"**, quality emoji-labels, notes placeholder, **"Save Recovery Data"**, **"Recovery History"**, per-session date/duration/times/quality/wake-ups/notes/alignment.
- Success Alert: **"Saved ✓" / "Sleep recovery data logged successfully."**. Error Alert title **"Error"** + message; validation → inline red.
- Durations formatted **"7h 30m"** / **"45m"** / `—`.

### Interactions + navigation
- **"Log New Sleep"** → opens the form (also from the empty state).
- **close-circle** → closes the form.
- **DateTimeFields / "now"** → set values; editing clears that field's error.
- **Quality segments** → set 1–10 (recolors). **Wake-ups ± steppers** → adjust (min 0).
- **Save Recovery Data** → validates; on success logs sleep, invalidates all sleep surfaces, resets the form, shows the success Alert. Overnight sleep rolls the wake day forward. Validation 400 → inline errors; 5xx/network → Alert.
- **Refresh** → refetches history.
- **Close (X)** → `router.back()`.

### Loading / empty / error
- **Loading history:** 3 skeleton session cards (date + duration-badge skeleton + three time-block skeletons).
- **History error:** `EmptyState` icon `cloud-offline-outline`, **"Couldn't load sleep data"**, **"Check your connection and try again."**, action **"Retry"**.
- **No sessions:** `EmptyState` icon `moon-outline`, **"No sleep data yet"**, **"Log your first sleep to start tracking recovery."**, action **"Log New Sleep"**.

### Styling notes
- **Purple** = moon/recovery identity; **cyan** = duration/quality-mid/plus; **amber** = wake-ups; **red** = minus/errors; **emerald** = excellent quality. CTA = lime. The quality bar is a 10-segment meter, not a slider thumb.

### Animations
- None scripted; depict the quality bar filling and press-scale on steppers/buttons.

---

# 8. Premium (modal) — `(modals)/premium.tsx`

### Purpose
The paywall: a feature list, an annual/monthly plan selector, and a sticky "Start 7-Day Free Trial" CTA. **Cyan + purple** accents (annual = cyan, monthly = purple).

### Full top-to-bottom layout
**Status bar:** light. Screen bg `#0A0C12`, top padding = inset.

**A. Header** (row, padH 20 / padV 16): a single leading **close** (Ionicons `close` 28 white) → `router.back()`. No title.

**B. ScrollView** (pad `xl`, paddingBottom 120):
- **Title area** (centered, marginBottom 32): `display` white **"Unlock "** with **"Zeitra Pro"** in **cyan**; subtitle `body` `text.secondary` **"The ultimate chrono-nutrition and fitness toolkit designed exclusively for shift workers."**
- **Feature card** — a `GlassCard` (radius 24, pad 20). Four feature rows (each: a 40×40 cyan-tint icon box `withAlpha(cyan,0.14)` radius 20 with a 20px cyan Ionicon; a column `subhead` white title + `caption` `text.secondary` desc):
  - Ionicons `flash` — **"AI Coach Ria"** / **"Unlimited chat & real-time circadian adaptations"**.
  - Ionicons `watch` — **"Wearable Sync"** / **"Connect Oura, Apple Watch, Garmin for sleep tracking"**.
  - Ionicons `stats-chart` — **"Advanced Analytics"** / **"Strength trends, 1RM tracking, sleep vs. performance"**.
  - Ionicons `moon` — **"Ramadan Mode"** / **"Automated fasting windows and hydration strategy"**.
- **Plan selector** (row, gap 16):
  - **Annual card** (`GlassCard` radius 24, minHeight 132, centered, **2px border** cyan when selected else transparent + cyan glow when selected): `heading` white **"Annually"**, `statSmall` **cyan** **"$89.99"**, `caption` `text.secondary` **"$7.50 / month"**; a floated **"SAVE 20%"** badge (cyan fill, ink text, radius 12) overlapping the top edge; a cyan check-circle (Ionicons `checkmark` 12 ink) top-right when selected. **Selected by default.**
  - **Monthly card** (same, but **purple** when selected): `heading` white **"Monthly"**, `statSmall` white **"$9.99"**, `caption` `text.secondary` **"Billed monthly"**; purple check-circle top-right when selected.

**C. Sticky CTA footer** (padH `xl`, bottom safe-area pad, top hairline, `background.primary`):
- A full-width **`CtaButton`** size `lg`, label **"Start 7-Day Free Trial"** (lime gradient, ink text; **"Processing…"** + spinner while upgrading).
- Below: `caption` `text.secondary` centered **"Cancel anytime. Subscription auto-renews."**

### Data / text shown
- **"Unlock Zeitra Pro"**, the subtitle, the 4 features (title + desc), **"Annually / $89.99 / $7.50 / month"**, **"SAVE 20%"**, **"Monthly / $9.99 / Billed monthly"**, **"Start 7-Day Free Trial" / "Processing…"**, **"Cancel anytime. Subscription auto-renews."**
- Success Alert: **"🎉 Welcome to Zeitra Pro!" / "Your 7-day free trial has started. Enjoy all premium features." / "Let's Go!"** (→ back).
- Error Alert: **"Upgrade Failed"** + message.

### Interactions + navigation
- **Tap a plan card** → selects it (annual cyan / monthly purple).
- **Start 7-Day Free Trial** → upgrades to `PRO_ANNUAL` or `PRO`, invalidates subscription/profile, shows the welcome Alert → `router.back()`. On error → Alert.
- **Close (X)** → `router.back()`.

### Loading / empty / error
- **Upgrading:** CTA shows **"Processing…"** + spinner.
- **Error:** **"Upgrade Failed"** Alert.

### Styling notes
- Annual = **cyan** (default + SAVE badge), monthly = **purple**. The **CTA is lime** (ink text). SAVE badge floats above the card so it isn't clipped.

### Animations
- None scripted; depict the selected card's 2px ring + glow and the CTA press-scale.

---

# 9. Active Workout (routed) — `training/workout.tsx`

### Purpose
The **full routine logger** (reached from a routine's START, a resumed session, or a single added exercise). A live timer + FINISH, collapsible exercise cards each driving a hardened `SetLogger`, a startup **GET READY!** countdown, a **rest-timer modal**, and a **confetti** finish that routes to the Complete summary. Cyan timer; lime/coral expanded-card + rest accent.

### Full top-to-bottom layout
**Status bar:** light. `KeyboardAvoidingView`, screen bg `#0A0C12`, top padding = inset.

**A. Header** (`renderHeader`, row space-between, padH 20 / padBottom 16, bottom hairline):
- **Left:** overline `text.secondary` **"ACTIVE WORKOUT"** over the **timer** — mono `statMedium` **`MM:SS`** in **cyan**, with a cyan text-glow. Counts up.
- **Right:** a `Button` (`variant="primary"`, size md) title **"FINISH"**, icon Ionicons `flag` 16 (note: currently white icon — render ink-on-lime for the target). → `handleEnd`.

**B. ScrollView** (pad `lg`, paddingBottom 120):
- **Exercise cards** — `Card variant="glass"` (noPadding, marginBottom `md`; border `#222838` → **lime/coral** + lime glow when expanded). One per exercise; the **first is expanded by default**.
  - **Header (TouchableOpacity, pad 16, minHeight 64):** a row:
    - **Leading visual:** for a **resolved** (catalogue-matched) exercise → a 44×44 **demo thumbnail** (radius 12, cached, with bundled fallback) that **also deep-links** to the exercise detail; for an unresolved exercise → a 44×44 `withAlpha(coral,0.12)` icon box (radius 12) Ionicons `barbell` 22 lime.
    - **Middle column:** when collapsed, the **exercise name** (`subhead` white, 1 line); always a `caption` `text.secondary` status line **"`{done}`/`{total}` Sets Done"** plus either **" · `{sets} × {targetReps}`"** (resolved) or **" · `{muscleGroup}`"**; for resolved, an optional **equipment** subtitle (`caption` `text.tertiary`). (When expanded, the name moves into the SetLogger heading, so the header name hides to avoid duplication.)
    - **Trailing:** for resolved, an Ionicons `information-circle-outline` 20 **cyan** (opens detail); always a chevron `chevron-up`/`chevron-down` 20 `text.tertiary`.
  - **Expanded content** (pad 16): the hardened **`SetLogger`** — one row per planned set, with **editable KG/REPS**, a per-set **DONE** toggle, and **add/remove** set affordances. It owns the exercise-name heading while expanded. Accepting a set marks the next planned set complete and triggers a rest.
- **Empty (no exercises):** a centered block — Ionicons `barbell-outline` 56 `text.tertiary`, `subhead` white bold **"No exercises yet"**, `body` `text.secondary` **"Add your first exercise to this session using the button below."**
- **Browse Exercises CTA:** a **dashed** bordered full-width row (padV 16, radius `xl`, cyan border) Ionicons `search` 20 cyan + `subhead` cyan bold **"BROWSE EXERCISES"** → `router.push('/(exercises)')`.

**C. Startup countdown overlay** (when the session first starts): a full-screen dark blur (`SafeBlurView` intensity 80) with a giant mono numeral (**3 → 2 → 1**, ~120px, **lime/coral** with a strong lime text-glow) over `h3` white **"GET READY!"** (letter-spacing 2).

**D. Rest Timer modal** (`Modal`, transparent, fade): a dark blur backdrop + a centered glass `Card` (radius `2xl`, pad 30, lime glow + xl shadow):
- A large **`RestTimer`** ring (size 180) counting down from the exercise's rest length.
- `subhead` `text.secondary` **"Up next: `{nextExerciseName}`"** (or "next exercise").
- **Actions row** (gap 16, stretch): a **"+15s"** chip (flex, 50 tall, radius 14, `background.tertiary` fill, `#222838` border, white bold) that adds 15s; and a **"SKIP"** `Button` (`variant="primary"`, flex, 50 tall) that closes the modal.

**E. Confetti** (on finish): a full-screen `ConfettiCannon` (200 pieces, falling from top-center, fade-out), non-interactive.

### Data / text shown
- **"ACTIVE WORKOUT"**, timer `MM:SS`, **"FINISH"**, per-card name / **"`{done}`/`{total}` Sets Done"** / **"`{sets} × {reps}`"** or muscle group / equipment, **"No exercises yet"** + copy, **"BROWSE EXERCISES"**, **"GET READY!"** + 3/2/1, **"Up next: …"**, **"+15s"**, **"SKIP"**.
- Finish forwards `elapsed` / `volume` / `kcal` to the Complete screen (same finite-guarded math as the modal version).

### Interactions + navigation
- **Tap a card header** → expand/collapse (chevron flips; lime border + glow when open).
- **Thumbnail / info icon (resolved)** → `router.push('/(exercises)/{libraryId}')` (warm detail).
- **SetLogger:** log a set (→ marks next planned set done + opens rest modal), toggle done, edit KG/REPS, add/remove sets — all persisted to the session state (and a 5s AsyncStorage snapshot).
- **+15s** → extends the current rest; **SKIP** → ends rest.
- **FINISH** → marks finished, stops timers, computes summary, fires confetti, logs each completed exercise, ends the session, invalidates workout caches, then after ~2.5s `router.replace('/training/complete', { elapsed, volume, kcal })` (or ~1s if no session id). On unexpected error → Alert **"Error" / "Failed to save workout. Please try again."**
- **BROWSE EXERCISES** → `router.push('/(exercises)')`.

### Loading / empty / error
- **Loading (pre-init):** a skeleton scaffold mirroring the chrome — a header placeholder (overline + timer block + FINISH block) and 3 skeleton glass cards (44 thumb + two text lines; the first card also shows 3 set-row skeletons).
- **Load error (session, or routine when relevant):** a centered `EmptyState` icon `cloud-offline-outline`, **"Couldn't start your workout"**, **"Something went wrong loading your session. Check your connection and try again."**, action **"Try Again"** (refetches the errored query).
- **No exercises:** the empty block above (Browse CTA still shows).

### Styling notes
- Timer = **cyan** w/ glow; expanded card + rest + startup = **lime/coral**; Browse + info icon = **cyan**. Rest modal ring 180; startup numeral ~120. Confetti on finish. This screen DOES use a `Modal` (rest) and a blur overlay (startup) — depict both.

### Animations
- Confetti cannon on finish; startup countdown ticking 3→2→1 over blur; `RestTimer` ring sweeping down; card expand/collapse (chevron). `activeOpacity` 0.7–0.85 on touchables; depict press-scale + the expanded-card lime glow.

---

# 10. Workout Complete — `training/complete.tsx`

### Purpose
The celebratory **session summary** after finishing a workout: a trophy hero, a "Session Complete" headline, three stat cards (Volume / Time / Burn), and a Return-to-Dashboard CTA. Cyan-accented with a top gradient wash.

### Full top-to-bottom layout
**Status bar:** light. Screen bg `#0A0C12`, with a **top-down gradient** (`withAlpha(cyan,0.2) → transparent`) filling the screen.

**Content** (padH 24, padTop `inset+60`, padBottom `inset+20`, centered column):
- **Trophy hero:** a **120×120 circle** (radius 60, 2px border, `withAlpha(cyan,0.1)` fill, `withAlpha(cyan,0.3)` border, cyan glow) with Ionicons `trophy` 56 **cyan**.
- **Headline:** `display` white (fontSize 40) **"Session\nComplete"** (two lines, centered), marginTop 24.
- **Subtitle** (`body` `text.secondary`, centered, marginH 32, marginTop 12): when there are metrics → **"Amazing work. You've logged another powerful session, optimizing your performance window."**; when there are none → **"Your session is wrapped up. Head back to your dashboard to keep your window dialed in."**
- **Stats row** (gap 12, width 100%, marginTop 40) — three glass `Card`s (flex, pad 16, centered):
  - **Volume:** Ionicons `flash-outline` 24 **lime/coral** + `caption` `text.secondary` **"Volume"** + `statSmall` white **"`{n.toLocaleString()}` `kg`"** (kg in `statTiny` muted).
  - **Time:** Ionicons `time-outline` 24 **cyan** + **"Time"** + `statSmall` white the formatted duration (e.g. **"42m 13s"** / **"1h 5m"** / **"45s"**).
  - **Burn:** Ionicons `flame-outline` 24 **amber** + **"Burn"** + `statSmall` white **"`{n}` `kcal`"** (kcal in `statTiny` muted).
- **Flex spacer** pushes the CTA to the bottom.
- **Return CTA:** a full-width 56-tall button (radius 28, cyan glow) filled with the **cyan gradient** (`gradients.cyan`, left→right) and `h3` **ink** **"Return to Dashboard"** (weight 700).

### Data / text shown
- **"Session Complete"**, the two possible subtitles, stat labels **Volume / Time / Burn** + values + units (kg / kcal), **"Return to Dashboard"**.
- Values come from the route params `elapsed` (seconds → formatted), `volume` (kg), `kcal`.

### Interactions + navigation
- **Return to Dashboard** → invalidates active-session caches, `router.dismissAll()` + `router.replace('/(tabs)')` (back to Home).

### Loading / empty / error
- **No metrics** (cold deep-link / aborted finish — all params absent/non-finite): the stats row is replaced by an `EmptyState` icon `barbell-outline`, title **"No session data"**, subtitle **"We couldn't find any metrics for this session. Nothing was lost — just return to your dashboard."** (and the alternate subtitle above). The Return CTA still shows.

### Styling notes
- **Cyan** hero + Time + the gradient CTA; **lime/coral** Volume icon; **amber** Burn icon. The CTA is the **cyan gradient** (ink text) — a deliberate celebratory variant distinct from the lime primary used elsewhere.

### Animations
- None scripted in this file (the confetti fires on the *previous* screen before navigating here). For the mockup, a gentle trophy/headline `FadeInDown` + count-up on the stats is the premium target; depict the CTA press-scale.

---

## Cross-screen recap for the mockup

- **Accent map:** Workout/active = **lime `#A8CC3C`** (rest, set-progress, expanded cards). Coach Ria = **purple `#7C4DFF`/`#9B72FF`**. Nutrition (Build Plate, Create Post, barcode scan icon) + "Save"/Premium-annual + Complete CTA = **cyan `#00D4AA`**. Premium-monthly + sleep-moon = purple. Errors/delete = red `#FF4444`; caution/wake-ups = amber `#FFB300`; success/online/excellent = emerald `#10B981`.
- **Every screen is a modal/pushed sheet with a leading `close` X — render NONE with the bottom tab bar.**
- **CTAs are ink-on-lime** (`Button`/`CtaButton`), except the **cyan-gradient** Return-to-Dashboard on Complete. A few legacy buttons (workout FINISH `flag` icon, plan-card check ink) are flagged inline — always use ink on colored fills.
- **Inputs are dark-glass** (`background.tertiary`/`secondary`, `#222838` borders, lime/cyan/purple accent borders when active). Numeric workout inputs use the mono stat font.
- **Skeletons + `EmptyState`** (icon + title + subtitle + optional action) are the universal loading/empty/error pattern; chat & complete use inline glass error/empty cards instead.
- **Motion target:** `FadeInDown`/`FadeIn` staggered entrances, animated rings/bars, gesture press-scale 0.92–0.97, lime/purple glows on active elements.
