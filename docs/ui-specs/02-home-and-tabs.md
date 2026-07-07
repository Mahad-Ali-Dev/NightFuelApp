# Zeitra UI Spec — 02 · Home & Main Tabs

> Paste this whole file into GPT (or hand to any designer) to render every screen below as a pixel-faithful mockup. Each screen is described top-to-bottom with every element, all data/text, every interaction + destination, loading/empty/error states, exact Zeitra styling tokens, and the entrance/press animations. It is derived directly from the real React Native source — nothing here is invented.

---

## ⚠️ CRITICAL NAMING NOTE — "coral" means LIME

In the codebase the brand token is historically named `accent.coral`, but its **value is the softened Zeitra LIME `#A8CC3C`** (and `accent.pink` = lime-deep `#93B82E`). Every time the source says "coral" / `colors.accent.coral` / `gradients.coral` / `gradients.coralCta`, **render it as LIME `#A8CC3C → #93B82E`, never an actual coral/orange/pink.** All CTA fills, glows, primary accents, active tab color, and "coral" hairlines are LIME. Treat the word "coral" in this doc as a synonym for the primary lime.

---

## ZEITRA DESIGN SYSTEM (condensed — every mockup must follow this)

**Brand:** athletic, premium, high-contrast, energetic. Tagline "STRONG TODAY. BETTER EVERYDAY." Logo = lime "Z" + dumbbell on black.

**Colors (exact tokens):**
- Backgrounds: `primary #0A0C12` (deep near-black, cool), `secondary #13161F` (card), `tertiary #1B2030` (elevated), `quaternary #242B3D` (higher).
- Borders / glass hairlines: `default #222838`, `light #2F3650`, focus `#A8CC3C`. Most glass cards use a hairline of `rgba(255,255,255,0.10)` (= `withAlpha(text.primary, 0.1)`).
- **PRIMARY = lime** `accent.coral #A8CC3C` (called "coral" in code but it is LIME), `coralLight #C5E06B`, `coralDark/pink #93B82E`. Used for CTAs, active states, progress, brand glows.
- Functional accents: `cyan #00D4AA` (success/progress), `blue #4FC3F7` (info/hydration), `purple #7C4DFF` (AI/coach) + `purpleLight #9E7BFF` / `purpleDark #6233CC`, `amber #FFB300` (caution), `emerald #10B981` (positive/active), `red #FF4444` (danger).
- Text: `primary #FFFFFF`, `secondary #9BA3B4`, `tertiary #7B8497`, `inverse #0A0C12`.
- Gradients: `coral`/`coralCta` = `['#A8CC3C','#93B82E']` (lime CTA fill), `cyan` = `['#00D4AA','#4FC3F7']`, `purple` = `['#7C4DFF','#B47CFF']`, `card` = `['rgba(25,29,40,0.72)','rgba(12,14,20,0.88)']`.

**CTAs:** LIME fill (`coralCta` gradient, left→right) with **INK `#0A0C12` text + icons — never white on lime.** Bold (weight 800), letterSpacing 0.3, radius 14, a SUBTLE lime glow halo, pressed scale 0.97. Sizes: sm (minH 40 / 13px / icon 15), md (minH 48 / 15px / icon 17 — default), lg (minH 56 / 17px / icon 19).

**Cards (GlassCard):** dark-glass frosted blur (`SafeBlurView` tint dark, intensity 40), radius 20–24 (default `2xl`=24), 1px hairline `rgba(255,255,255,0.10)`, generous padding (16–24), optional soft accent glow halo. Clipped corners (overflow hidden).

**Typography (Inter UI + JetBrains Mono for stats):**
- `display` Inter-ExtraBold 36/44, ls −0.5 (screens often override to 34).
- `h1` Bold 28/36 · `h2` Bold 24/32 · `h3` SemiBold 20/28 · `heading`/`subhead` SemiBold 20/16.
- `body` 15/22 · `bodySm` 14/20 · `bodyMedium` 15/22 · `caption` 12/16 · `captionMedium` 12/16.
- `overline` SemiBold 11/16, ls 1.5, UPPERCASE, muted — section labels.
- Mono stats: `statLarge` 48/56, `statMedium` 32/40, `statSmall` 24/32, `statTiny` 16/22.

**Spacing (4px grid):** xxs 2, xs 4, sm 8, md 12, lg 16, xl 20, 2xl 24, 3xl 32, 4xl 40. **Radius:** sm 4, md 10, lg 14, xl 20, 2xl 24, 3xl 28, full 9999. **Icon sizes:** xs 16, sm 20, md 24, lg 28, xl 32, 2xl 40, 3xl 48.

**Layout language:** overline section headers; GRID layouts (2-col image cards, 3-up stat rows); horizontal snapping CAROUSELS for collections (cards peek the next one); pill/chip filters; circular progress RINGS; stat cards; bottom tab bar (Home / Train / centre Quick-Log / Feed / More).

**Motion (premium):** Reanimated `FadeInDown` entrances with staggered per-section delays (≈60ms steps), `.springify().damping(18)` springy card reveals, animated progress rings/bars, pressed-scale 0.96–0.97 on cards/CTAs.

**Iconography:** Ionicons throughout (outline variants for inactive/secondary, solid for focused/active).

---

# SHARED — BOTTOM TAB BAR & GLOBAL OVERLAYS

*(File: `app/(tabs)/_layout.tsx`. Present on every tab screen below.)*

**Tab bar (floating, absolute, blurred):**
- Position absolute bottom; transparent background with a `SafeBlurView` (intensity 40, tint dark) behind it (`tabBarBackground`); 1px top border `rgba(255,255,255,0.10)`. Height `TAB_BAR_H` = **88 iOS / 72 Android**. paddingTop 10; paddingBottom 26 iOS / 10 Android.
- **5 visible slots, left→right:**
  1. **Home** — icon `home-outline` (inactive) / `home` (focused), label "Home".
  2. **Train** — `barbell-outline` / `barbell`, label "Train".
  3. **Quick-Log centre raised control** (replaces the nutrition tab button) — a 58×58 lime gradient disc (`gradients.coral` = lime, top-left→bottom-right) with a white `add` "+" glyph (30px), elevated above the bar (lime shadow, offset y6, opacity 0.45, radius 12). Caption "Log" (10px, weight 700, **lime** color) sits BELOW the disc. Pressing opens the Quick-Log sheet (does NOT switch tab).
  4. **Feed** — `people-outline` / `people`, label "Feed".
  5. **More** — `menu-outline` / `menu`, label "More".
- **Active tab styling:** icon + label tint = **lime `#A8CC3C`** (`active`), plus a tiny 4×4 lime **dot** under the focused icon. Inactive tint = `text.tertiary #7B8497`. Label fontSize 10, weight 600.
- Icon size 22; label shown always.

**Tab icon wrapper:** centered column, gap 3 between icon and the active dot.

**Ria AI Coach FAB (global, every tab):** a 56×56 **purple** gradient disc (`gradients.purple`) floating bottom-right, `bottom = TAB_BAR_H + 14`, `right 20`, radius 28, purple shadow (offset y4, opacity 0.35, radius 10), zIndex 100. Contains a white `sparkles` icon (24) + a small cyan **notification badge** (9×9, top-right, white 1.5px border). Tap → `/(modals)/ai-coach`. Accessibility label "Generate with AI".

**Quick-Log chooser sheet (opened by centre control):** native Modal, slide-up, transparent. Backdrop `rgba(0,0,0,0.55)`, tap-to-dismiss. Sheet = a GlassCard (intensity 50, padding 18) pinned to bottom (paddingBottom = safe-area + 16, horizontal 14). Top: a centered grabber pill (40×4, `rgba(255,255,255,0.25)`). Title "Quick log" (heading, 18px, white). Then **3 rows**, each a Pressable (radius 16, 1px hairline `rgba(255,255,255,0.08)`, minHeight 64, pressed bg `rgba(255,255,255,0.06)`):
  - Icon disc 44×44 radius 14, a per-accent gradient `[accent 0.95 → accent 0.6]` with a white 20px icon.
  - Two-line text: bold white label + muted sublabel; trailing `chevron-forward` (18, tertiary).
  - Rows: **"Log a meal"** / "Food, macros & calories" / `restaurant` icon / cyan accent → `/(meals)/log-meal`. **"Start a workout"** / "Track sets & exercises" / `barbell` / lime accent → `/(modals)/active-workout`. **"Log sleep"** / "Bedtime & wake time" / `moon` / purple accent → `/(modals)/log-sleep`. Selecting a row closes the sheet then navigates.

**Hidden tabs** (registered, `href:null`, reachable only via in-screen nav): `analytics`, `profile`, `schedule`, `circadian`, `profile/edit`, `profile/preferences`. `schedule` is a pure redirect to `/(shifts)`.

**Auth gate:** if not authenticated (after auth resolves) the whole tab layout redirects to `/(auth)/login`.

**Bottom clearance:** every scroll view reserves bottom padding ≥ `TAB_BAR_H + 40..80` so content clears the bar + Ria FAB. Home reserves `TAB_BAR_H + 72`.

---

# 1 · HOME / DASHBOARD

*(File: `app/(tabs)/index.tsx`. Tab "Home".)*

### Purpose
The daily command center: greeting + momentum, the "Tonight's Session" shift hero with a readiness ring, a circadian insight chip, a 3-up stat grid, a training-window bar, quick-action carousel, then a deep circadian section stack (up-next meal, next shift, transition, light plan, anchor sleep, today timeline, sleep/hydration/caffeine minis), explore + more grids, workout heatmap, 24h schedule timeline, and a weekly recap.

### Background
Full-screen `ImageBackground` using bundled art `hero-training.png` (athletic gym photo), blurRadius 3, image opacity 0.4, over `background.primary #0A0C12`. A `LinearGradient` overlay `['rgba(10,10,13,0.7)', #0A0C12]` darkens it top→bottom. Light translucent status bar. Vertical ScrollView, paddingHorizontal 20, paddingTop = safe-area + 16, pull-to-refresh (lime tint).

### Top-to-bottom layout

1. **Header row** (FadeInDown 420ms):
   - **Left:** circular **avatar** 44×44, radius 22, lime-tinted fill `rgba(A8CC3C,0.14)`, 1.5px lime border `rgba(A8CC3C,0.35)`, lime glow; shows user **initials** (2 chars, uppercase, derived from displayName) in lime, weight 800. Tap → `/(tabs)/profile`.
   - Beside it: greeting line `"{Good morning|Good afternoon|Good evening} 👋"` (captionMedium, muted) over the **display name** (h1, white, 1 line, e.g. "User").
   - **Right:** an optional **shift badge** pill (only if an active shift) — cyan-tinted `rgba(00D4AA,0.10)` fill, cyan border, a 6px cyan dot + the shift `type` text (12px, weight 700, cyan). Then a **notifications icon button** 38×38 radius 19, fill `rgba(white,0.06)`, `notifications-outline` (20). Tap → `/(settings)/notifications`.

2. **Sub-header row:** the formatted **date** ("Monday, June 23", bodySm, muted) on the left; a **momentum chip** on the right — lime-tinted `rgba(A8CC3C,0.12)`, lime border `0.30`, a `flame` (12) + text `"ON TRACK"` (if adherent) or `"{n} LOGGED"` (meals logged count), caption, lime, weight 800, ls 0.6. marginBottom 20.

3. **TONIGHT'S SESSION hero** (FadeInDown delay 80, 460ms) — a pressable GlassCard (intensity 40, radius 24, glow + 0.25 border using `heroColor`). `heroColor` = **lime** when a shift countdown exists, else **cyan**. Inner LinearGradient wash `[heroColor 0.16 → 0.02]` diagonal. Layout = row, padding 22:
   - **Left column:** a tag pill (`heroColor` 0.14 fill, a dot + overline) reading **"TONIGHT'S SESSION"** (countdown active) or **"REST MODE"**. Below, a giant mono value (`statLarge` 48px, white, auto-shrinks to fit one line) = the **countdown string** (e.g. "5h 12m") or "Recover". A sub line (bodySm muted): "until your shift ends" or "No active shift — restore & rebuild". Then a **START CtaButton** (md, lime fill, ink "START" + `play` icon, paddingHorizontal 28, self-start) → `/(tabs)/training`.
   - **Right:** a **ReadinessRing** — a 94px lime (heroColor) `CircularProgress` ring (strokeWidth 8, track `rgba(white,0.12)`) with the readiness % numeral (statSmall, white) centered over a "READY" caption (lime 0.9, ls 1). Readiness = composite of hydration% and meal adherence (0–100).
   - Tapping the hero → `/(shifts)`.

4. **Circadian insight chip** (FadeInDown delay 130) — a single self-start pill, tinted by a time-of-day `insight.color`, 1px tinted border, an icon + coaching text (captionMedium). Copy varies by hour: 22:00–05:00 `moon` purple "Melatonin rising. Wind down screens."; 05–09 `sunny` amber "Cortisol peak. Delay caffeine 90 min."; 14–17 `water` cyan "Cortisol dip. Ideal time for protein."; 17–22 `flash` lime "Alertness window closing. Fuel up now."; else `pulse` blue "Optimal alertness window. Stay fuelled." marginBottom 20.

5. **3-up STAT GRID** (FadeInDown delay 180) — three equal `StatCard`s (gap 12). Each StatCard = GlassCard (intensity 40, radius 20), inner padding 14, minHeight 132: a 36×36 accent-tinted icon disc on top, an overline **label**, a big mono **value** (statSmall) with optional small **unit** beside it, and an accent-colored **footer** caption.
   - **Hydration** — `water` icon, blue accent, value = litres (e.g. "1.2"), unit "L", footer "of 2.5L". Tap → `/(performance)`.
   - **Calories** — `flame`, lime accent, value = kcal (rounded), unit "kcal", footer "of {target}" or "today". Tap → `/(tabs)/nutrition`.
   - **Steps** — `footsteps`, cyan accent, value (e.g. "8.4k" when ≥1000), footer "today". Tap → `/(performance)`.
   marginBottom 24.

6. **TRAINING WINDOW bar** (FadeInDown delay 220) — a `TrainingWindowBar` GlassCard (intensity 40, radius 20). Header row: a lime dot + overline "TRAINING WINDOW" on the left; on the right either "OPEN NOW" (lime, when now is inside the window) or the range "3PM–7PM" (tertiary). Below: a 24h **track** (height 10, radius 6, `rgba(white,0.08)`) with a translucent lime **band** (fill `lime 0.35`, border `lime 0.55`) spanning 15:00→19:00, and a **NOW marker** (a 2px white line + a 14px white knob ringed in lime) at the current fractional hour. Scale row beneath: "12AM · 12PM · 12AM" (caption tertiary). marginBottom 28.

7. **QUICK ACTIONS** — overline section label "QUICK ACTIONS"; a horizontal snapping **carousel** (FadeInDown delay 240, snap interval 132+12). Each card 132×118, radius 20, 1px hairline, full-bleed bundled photo with a `['transparent','rgba(0,0,0,0.82)']` bottom scrim. Top-left a 32×32 accent-tinted icon disc; bottom-left a white bold 13px **label** (text-shadow). Cards: **Log Meal** (`restaurant`, cyan) → `/(tabs)/nutrition`; **Log Workout** (`flame`, lime) → `/(tabs)/training`; **Log Sleep** (`moon`, purple) → `/(modals)/log-sleep`; **Progress** (`stats-chart`, blue) → `/(performance)`.

8. **UP NEXT MEAL** card (states):
   - **Loaded** (next meal exists): GlassCard (intensity 40, radius 24) with a lime wash. Top row: an "UP NEXT · {time}" badge (lime-tinted, overline + time) and a 34×34 amber-tinted `restaurant` icon disc. Then the meal **label** (h2, white), an optional **description** (bodySm muted, 2 lines), a **macro pill row** (three `MacroPill`s — each a tinted rounded box with a mono value over a muted label: **Protein** "{n}g" lime, **Carbs** "{n}g" cyan, **Fat** "{n}g" amber), and a full-width **"Log Meal" CtaButton** (md, lime, `checkmark` icon) → `/(tabs)/nutrition`. testID `dashboard-up-next-log-meal-cta`.
   - **Loading:** a skeleton card (padding 22, radius 24, border) — a 120×26 + 34×34 top row, then 70%/90%/100% bars.
   - **Empty (no meals):** an `EmptyState` card (radius 24) — `restaurant-outline` icon, title "No meals planned yet", subtitle "Build today's fuelling plan around your shift to see your next meal here.", action **"Plan my meals"** → `/(tabs)/nutrition`.
   - **Error:** `EmptyState` `cloud-offline-outline`, "Couldn't load", "We couldn't reach today's meal plan. Try again in a moment.", action "Retry".

9. **NEXT SHIFT card** (`NextShiftCard`) — GlassCard, padding 16. Header: a 32×32 cyan-tinted `time` icon disc + "Next shift" (subtitle). Body states: **loading** → two skeleton bars; **error** → `cloud-offline-outline` + "Couldn't load your next shift." + Retry; **empty** → EmptyState `time-outline` "No upcoming shift scheduled" / "Log your next shift to see the countdown here" / "View shifts" → `/(shifts)`; **populated** → left text "Upcoming shift" (caption) over the shift **type** (h3) over "starts in {countdown}" (cyan body) or "starting now"; right a cyan-tinted **time chip** with the absolute start time (e.g. "11:30 PM").

10. **NEXT SHIFT TRANSITION card** (`ShiftTransitionCard`) — a `Card` (glass), padding 16. Header: 32×32 purple-tinted `moon` disc + "Next shift transition". Populated body = three **anchor rows**, each a 36×36 tinted icon chip + a caption label over a subtitle value: **Recommended sleep** (`moon`, purple) "11:30 PM – 7:30 AM"; **Caffeine cutoff** (`cafe`, amber) "3:00 PM"; **Bright light** (`sunny`, cyan) range. Loading/error/empty mirror the NextShift card (empty: `moon-outline` "No shift scheduled" / "Log a shift to see your transition plan"). Malformed times → "This shift's times look off — re-log it to see your plan."

11. **LIGHT PLAN card** (`LightPlanCard`) — Card (glass). Header is a **tappable** row (deep-link) → `/(shifts)/sleep-optimizer`: 32×32 amber-tinted `sunny` disc + "Light plan" + trailing `chevron-forward`. Populated body = two light rows: **Seek bright light** (`sunny`, amber) window; **Avoid light / blue-blockers** (`glasses-outline`, purple) window. Loading/error/empty as siblings (empty `sunny-outline` "No shift scheduled" / "Log a shift to see your light plan").

12. **ANCHOR SLEEP card** (`AnchorSleepCard`) — GlassCard, body padding 16. Tappable header → `/(shifts)/sleep-optimizer`: purple `moon` disc + "Anchor sleep" + chevron. Populated: one anchor row — a 36×36 purple-tinted `moon` chip + "Anchor sleep (4h core)" caption over the window "12:00 AM – 4:00 AM" (subtitle) over a tertiary "Full sleep window  {start} – {end}" line; then a why line (bodySm muted): "A fixed core-sleep block held steady across your rotation stabilizes your body clock." Loading/error/empty as siblings.

13. **TODAY circadian timeline card** (`TodayCircadianTimeline`) — GlassCard, body padding 16. Tappable header → `/(tabs)/circadian`: cyan `time` disc + "Today" + chevron. A **countdown pill** (cyan-tinted, `hourglass-outline` + "{next label} in {Xh Ym}" or "Day plan complete"). Then a sorted **timeline** of rows (gap 12), each a 36×36 tinted icon chip + caption label over the time value. Rows (sorted by time): **Seek bright light** (`sunny` amber, window), **Caffeine cutoff** (`cafe` lime, "by {time}"), **Avoid light / blue-blockers** (`glasses-outline` purple, window), **Anchor (core) sleep** (`moon` purple, window), **Full sleep window** (`bed-outline` blue, window). Rows tint by state: past = dimmed/tertiary, current = promoted accent + brighter chip, upcoming = normal. Loading/error/empty as siblings (empty "Log a shift to see your day plan").

14. **SLEEP + HYDRATION mini-card row** (two cards, gap 12, each ~half width):
    - **Sleep Window** (pressable → `/(shifts)/sleep-optimizer`): GlassCard (intensity 40, radius 20), inner padding 16. A 40×40 purple-tinted `moon` disc; overline "Sleep Window"; value "8h" (statSmall) + " target" (captionMedium muted); a `purpleLight` footer "Melatonin guide →".
    - **Hydration:** GlassCard. 40×40 blue-tinted `water` disc; overline "Hydration"; value = litres (statMedium) + " / 2.5L"; a thin blue **progress bar** (height 4, fill by %); an **"+ Add 250ml"** button (blue-tinted, blue border, captionMedium) → logs 250 ml (optimistic, invalidates progress). On fetch error this card becomes an `EmptyState` "Couldn't load" / "Hydration is offline. Tap retry to try again." / Retry.

15. **CAFFEINE TIMER tile** (`CaffeineTimerTile`, half-width, marginBottom 28) — a plain card (bg `secondary`, 1px border, radius 14, padding 16): a 40×40 tinted `cafe` disc, overline "Caffeine", then either "Caffeine OK for {Xh Ym}" (amber tint, subtitle) before cutoff, or "No more caffeine (sleep window starts at {time})" (purple tint, bodySm) after. No shift → EmptyState `cafe-outline` "Caffeine" / "Log a shift to track your caffeine window".

16. **EXPLORE grid** — overline "EXPLORE"; a 2×2 **image card grid** (gap 12, cards ~half width × 110, radius 18). Each card: full-bleed bundled photo + bottom scrim `rgba(0,0,0,0.72)`, a top-right **count badge** (accent-tinted, 10px weight 900) and a bottom-left white bold 13px **label** (text-shadow). Cards (count from live exercise search, else fallback): **Gym Workout** ("500+", lime) / **Home Workout** ("200+", cyan) / **Cardio** ("80+", blue) / **Kegel / Pelvic** ("5", purple). Tap → `/(exercises)?category={id}`. marginBottom 28.

17. **MORE FEATURES grid** — overline "MORE FEATURES"; same 2-col image-card grid (no count badge): **Shifts** (amber) → `/(shifts)`; **Sleep Tracker** (purple) → `/(modals)/log-sleep`; **Community** (blue) → `/(community)`; **Coaches** (lime) → `/coaches/browse`; **Circadian** (purpleLight) → `/(tabs)/circadian`; **Settings** (text.secondary) → `/(settings)`. marginBottom 28.

18. **WORKOUT ACTIVITY heatmap** (`ActivityHeatmap`) — overline "WORKOUT ACTIVITY"; a card (bg `secondary`, radius 20, 1px faint border, padding 16). Header: a 34×34 emerald-tinted `flame` disc + "Activity Heatmap" (13px bold) over "{n} active days · {h}h total" (11px tertiary); right a **legend** "Less" + 5 intensity swatches + "More". Below, a horizontally scrollable GitHub-style **16-week grid**: 10px cells, 2px gaps, month labels on top, day labels (Mon/Wed/Fri) on the left, intensity-colored cells (emerald ramp: `rgba(255,255,255,0.05)` → `rgba(16,185,129,0.20/0.45/0.72)` → `#10B981`); today's cell ringed white.

19. **24H SCHEDULE timeline** — a section row: overline "24H SCHEDULE" + a lime "View Full →" link (only when meals exist) → `/(tabs)/circadian`. Then a vertical timeline:
    - **Loading:** a bordered box with 4 skeleton rows (time + dot + line).
    - **Empty:** EmptyState `calendar-outline` "Your day is a blank canvas" / "Set up a meal protocol to map your fuel, hydration and rest across all 24 hours." / "View circadian plan" → `/(tabs)/circadian`.
    - **Populated:** a GlassCard (intensity 40, radius 20). Each meal row: a left **time** (44px, 12px weight 700; lime if "now", else tertiary), a connector column with a **dot** (filled cyan if past, lime if now (scaled 1.3), hollow if future) + a connecting line, and content = the meal **label** (14px weight 700; muted if past) with a lime **"NOW" pill** (ink text on lime) on the current slot or a cyan `checkmark-circle` on past slots, plus an optional 1-line description for upcoming items.

20. **WEEKLY RECAP** (`WeeklyRecap`) — overline "WEEKLY RECAP"; then a 2×2 **stat-card grid** (each card bg `secondary`, radius 20, padding 16; a 36×36 tinted icon disc + a 20px value + a tertiary label): **Days Logged** (`calendar`, lime), **Streak** "{n}d" (`flame`, amber), **Avg Calories** (`restaurant`, emerald), **Avg Score** "{n}%" (`star`, cyan). Loading/empty → a dashed-border placeholder "Log activity to see your weekly recap."; error → same placeholder + "Couldn't load weekly recap." + a lime-outline Retry.

### Animations
Per-section `FadeInDown` with staggered delays (header 0 → hero 80 → chip 130 → stats 180 → window 220 → quick actions 240). Press: CtaButtons scale 0.97; image cards `activeOpacity` 0.82–0.88. Pull-to-refresh invalidates all queries.

---

# 2 · TRAINING HUB

*(File: `app/(tabs)/training.tsx`. Tab "Train".)*

### Purpose
Start/resume a workout, browse workout categories, see weekly volume stats and your routines, or view "My Plan" (the active routine + its exercises).

### Background
`ImageBackground` `hero-training.png` (blurRadius 4, opacity 0.35) over `#0A0C12`, with a `['rgba(10,10,13,0.8)', #0A0C12]` overlay. Light status bar.

### Top-to-bottom layout

1. **Header** (FadeInDown 420, paddingTop safe-area+20): left a **"Training"** title (display, white, 34px) over "Level up your strength today." (body, muted); right a 48×48 **history icon button** (radius 24, bg `secondary`, 1px border) `time-outline` (22) → `/(exercises)/history`.

2. **Segmented switcher** (FadeInDown delay 60) — a pill container (bg `secondary`, 1px border, radius 14, padding 4, horizontal 20). Two segments: **"TRAINING"** and **"MY PLAN"** (overline). Active segment = **lime fill** (`coralDark`) + lime glow + white text with a subtle text-shadow; inactive = muted text.

### TRAINING tab content (ScrollView, bottom padding TAB_BAR_H+80)

3a. **Session card** (FadeInDown delay 80, springy):
   - **Active session present:** a pressable card (radius 24, lime/pink glow) filled with the **lime `coralCta` gradient** (full-bleed). Row: a 40×40 white disc with a lime `play` icon, then "SESSION IN PROGRESS" (subhead, ink/inverse, weight 900) over "Touch to resume" (caption, inverse 0.75), trailing `chevron-forward` (inverse). Tap → `/training/workout`.
   - **No session:** a GlassCard (lime glow) "Start New Session" — inner padding 28, height 178, with a diagonal lime wash + a top sheen. Content: overline "READY WHEN YOU ARE" (lime), "Start New Session" (h2 white), "Pick a routine or go freestyle." (body muted), and a **"BEGIN"** badge pill (lime gradient fill, `flash` icon + ink "BEGIN", lime glow). A large faint `barbell` (86) bleeds off the bottom-right corner. Tap → `/training/onboarding`.

4a. **Weekly-volume stat row** (FadeInDown delay 120, gap 10, horizontal 20) — three `StatCard`s (bg `secondary`, 1px border, radius 20): each a 30×30 tinted icon disc + a 22px mono value + a caption label. **Routines** (`albums-outline`, lime), **Exercises** (`barbell-outline`, cyan), **Weekly Sets** (`flame-outline`, purple). Values derived from your routines (count / total exercises / total sets). Each tile FadeInDown-staggers (120 + i·60), springy.

5a. **Explore Workouts** — overline "Explore Workouts"; a 2-col **CategoryCard grid** (gap 12, horizontal 20). Each card (GRID_CARD_W × 132, radius 20, 1px accent border): full-bleed bundled art + a `['rgba(0,0,0,0.05)','rgba(0,0,0,0.82)']` scrim, a self-start accent **badge pill** with the UPPERCASE title (9px weight bold, ls 0.5), and a big white **title** (17px weight 900). Cards: **Gym** (lime `#A8CC3C`) → `/(exercises)?category=gym`; **Home** (cyan) → `?category=home`; **Cardio** (emerald `#10B981`) → `?category=cardio`; **Recovery** (purple) → `?category=kegel`. Entrance FadeInDown (160 + i·70), springy; press scale 0.96.

6a. **Your Routines** — section row: overline "Your Routines" + a lime **"VIEW ALL"** link → `/(exercises)/routines`. A horizontal snapping **carousel** (snap 200+16, horizontal 20, gap 16):
   - **Loading:** 3 skeletons (200×168, radius xl).
   - **Error:** a tappable card (200×168, bg `secondary`, border, radius xl) — a 48×48 lime-tinted `cloud-offline-outline` disc + "Couldn't load routines" (subhead bold) + "Tap to try again" — retries.
   - **Empty:** a tappable card — a 48×48 lime-tinted `add` disc + "New Routine" + "Build your first split" → `/(exercises)/routines`.
   - **Populated:** `RoutineCard`s (200×168, radius xl, 1px border): full-bleed art + `['rgba(0,0,0,0.12)','rgba(0,0,0,0.88)']` scrim, a top-right **ordinal ring** (26px, accent border, "1/2/3…"), a self-start accent **tag pill** (`splitType` or "STRENGTH", 8px weight 900, ink text), a 16px white title (2 lines), and a meta row `barbell-outline` + "{n} exercises". Accent rotates lime/cyan/emerald/purple by index. Tap → `/training/onboarding?routineId={id}`. Press scale 0.96.

### MY PLAN tab content (ScrollView padding 20)

3b. **Loading:** a 220-tall skeleton hero + a 120×14 label + four 52-tall row skeletons + a 56-tall pill skeleton.

4b. **Error:** EmptyState `cloud-offline-outline` "Couldn't load your plan" / "Check your connection and try again." / "Try Again" — retries.

5b. **Active plan present** (FadeIn 360):
   - **Plan hero** (FadeInDown 60, springy, height 220, radius 20): full-bleed `hero-training.png` + a `['transparent','rgba(0,0,0,0.92)']` scrim. Overlaid bottom-left: a lime **"ACTIVE ROUTINE"** badge (lime-tinted, lime border, 10px bold), the routine **name** (heading, white, 20px weight 900), and a baseline row — a mono **exercise count** (statSmall white) + "Exercises" (overline, white 0.6).
   - **Exercises** overline; then up to 6 **exercise rows** (each FadeInDown 120 + i·40, springy): bg `secondary`, 1px border, radius 14, padding 14 — a small accent **dot** (8px, rotating lime/cyan/emerald/purple/amber), the exercise **name** (subhead bold, flex), and a "{sets}×{reps}" caption (muted). If more than 6, a centered "+{n} more exercises" caption.
   - **"START SESSION" CtaButton** (lg, lime fill, `flash` icon, height 56, radius 28) → `/training/onboarding?routineId={id}`.

6b. **No plan:** EmptyState `calendar-outline` "No Routines Yet" / "Create a routine to track your weekly training and start every session in one tap." / "Create Routine" → `/(exercises)/routines`.

### Animations
Header + switcher + session FadeInDown; stat tiles and category/exercise cards stagger; pressed-scale 0.96 on cards; active session pulses via glow.

---

# 3 · NUTRITION HUB

*(File: `app/(tabs)/nutrition.tsx`. Reachable via Home/quick-log — the tab slot itself is the centre Quick-Log control.)*

### Purpose
The macro dashboard: calories-left ring + macro tiles, today's logged meals, hydration + fasting widgets, a daily meal-slot plan grid, a recipe-idea carousel, and quick tools (Library / Recipes / Grocery).

### Background
`ImageBackground` `hero-nutrition.png` (blurRadius 4, opacity 0.25) over `#0A0C12`, with a `['rgba(10,10,13,0.85)', #0A0C12]` overlay. Light status bar. ScrollView, bottom padding TAB_BAR_H+80.

### Top-to-bottom layout

1. **Header** (FadeInDown 420, paddingTop safe-area+20, horizontal 20): left an overline **date** "{EEEE, MMM d}" UPPERCASE (lime), a **"Nutrition"** title (display, 34px, white), and "Fueling your {shiftType|Rotation} shift." (body muted). Right a 44×44 **log icon button** (radius 22, bg `secondary`, 1px border, sm shadow) `receipt-outline` (22) → `/(meals)/log-meal`.

2. **Macro Dashboard** (the primary content):
   - **Loading:** GlassCard (radius xl, padding 24, centered): a 180×180 circular skeleton + a 3-up 64-tall tile skeleton row.
   - **Error:** GlassCard with EmptyState `cloud-offline-outline` "Couldn't load your macros" / "Check your connection and try again." / "Retry" (refetches all).
   - **Loaded** (FadeInDown 60): GlassCard (lime glow, radius xl, padding 24, centered, lime 0.25 border) with a vertical lime wash. Centre: a **CircularProgress ring** 180px, strokeWidth 14, **lime** stroke, track `background.tertiary`; centered inside — a giant mono **kcal-left** numeral (statLarge, 46px, white) over a lime **"KCAL LEFT"** overline. Below the ring: a muted caption "consumed {n} / target {n} kcal". Then a **macro tile row** (3 `MacroTile`s, gap 10): each tile (bg `tertiary` 0.5, 1px border, radius 14, padding 12) — a header (a 7px color dot + UPPERCASE label) + a mono value "{current}" with a tertiary "/{target}g", + a thin progress **bar** (height 5, color fill). **Protein** lime, **Carbs** cyan, **Fat** amber. Tiles stagger FadeInDown (180 + i·60), springy.

3. **Today's Meals** section (heading "Today's Meals"):
   - **Loading:** GlassCard with 3 row skeletons (testID `logged-meals-loading`).
   - **Error:** GlassCard EmptyState `cloud-offline-outline` "Couldn't load today's meals" / "Check your connection and try again." / "Retry" (testID `logged-meals-error`).
   - **Empty:** GlassCard EmptyState `restaurant-outline` "No meals logged yet" / "Log your first meal to track today's macros." / "Log a Meal" → `/(meals)/log-meal` (testID `logged-meals-empty`).
   - **Filled:** GlassCard (testID `logged-meals-filled`), padding 18, gap 12 — each **logged row** = a bold white meal-type label ("Breakfast"/"Lunch"/"Dinner"/"Snack"/"Meal") + a muted "{kcal} kcal · {protein}g". A **TOTAL** row (hairline top border): "TOTAL" (caption bold muted) + "{kcal} kcal · {protein}g protein".

4. **Hydration + Fasting widgets** (row, gap 12, stretch):
   - **Hydration** (FadeInDown 80, springy): GlassCard (blue 0.28 border), padding 16, minHeight 150, with a blue wash. Head: `water` (18) + "HYDRATION" (caption bold muted). Body: a bespoke SVG **HydrationRing** (76px, blue arc, "{litres}" + "L" centered) + beside it "{pct}%" (statSmall, 20px) over "of {n}L goal".
   - **Fasting** (FadeInDown 140, springy): GlassCard, padding 16, minHeight 150. **Loading** → head skeleton + two bar skeletons. **Error** → EmptyState `cloud-offline-outline` "Couldn't load your fast" / "Check your connection and try again." / "Try Again". **Idle/active** → cyan 0.4 border + cyan wash; head `timer` (18) + "Fasting Timer"; a cyan status **badge** ("IN PROGRESS" / "IDLE"), "16:8 Windows" (subhead), and a full **cyan action button** with **ink** text "VIEW TIMER" / "START FAST" → `/(meals)/fasting`.

5. **Daily Plan** section: header "Daily Plan" + a lime **"EDIT PLAN"** link → `/(meals)/planner`.
   - **Loading:** a 2-col grid of 4 skeletons (GRID_CARD_W × 132).
   - **Error:** EmptyState `cloud-offline-outline` "Couldn't load nutrition" / "Check your connection and try again." / "Retry".
   - **Empty (no plan):** a tappable dashed-border GlassCard — a 60×60 lime-tinted `sparkles` disc, "No plan generated for today" (subhead bold), "Tap to let Ria build your protocol-compliant meals." (caption), and a lime-tinted **"GENERATE PLAN"** pill → `/(meals)/planner`.
   - **Populated:** a 2-col **MealSlotCard grid** (gap 12). Each slot card (GRID_CARD_W, bg `secondary`, 1px border, radius 20, padding 14, minHeight 132): a top row with a 34×34 accent-tinted icon disc + an optional **time chip** (e.g. "08:00"); the meal **title** (subhead weight 800, 1 line); an optional 1-line description; a footer `add-circle` (accent) + "Log". Accent + icon rotate (lime/cyan/purple/amber; `sunny-outline`/`restaurant-outline`/`moon-outline`/`cafe-outline`). Tap → `/(meals)/log-meal?preset={label}`. Stagger FadeInDown (140 + i·70), springy.

6. **Recipe Ideas** carousel: header "Recipe Ideas" + a lime **"VIEW ALL"** → `/(meals)/recipes`. A horizontal snapping carousel (snap 188+14, horizontal 20, gap 14):
   - **Loading:** 3 skeletons (188×168).
   - **Empty:** a single `RecipeDiscoverCard` (188×168, bg `secondary`, lime border) — a 52×52 lime-tinted `restaurant` disc + "Discover Recipes" + "High-protein, protocol-ready" → `/(meals)/recipes`.
   - **Populated:** `RecipeCard`s (188×168, radius xl, 1px border): full-bleed art + `['rgba(0,0,0,0.10)','rgba(0,0,0,0.86)']` scrim, an optional top-right **time pill** (`time-outline` + "{m}m", lime border), a white 2-line **title**, and a meta row — a lime **calorie chip** "{n} KCAL" + "{n}g protein". Then a trailing `RecipeDiscoverCard`. Tap → `/(meals)/recipes?id={id}`. Press scale 0.96.

7. **Quick Tools** — overline "Quick Tools"; a 3-up row (gap 12) of `ToolCard`s (each a GlassCard, padding 16, centered): a 48×48 accent-tinted icon disc + a bold caption title. **Library** (`search`, cyan) → `/(meals)/encyclopedia`; **Recipes** (`restaurant`, purple) → `/(meals)/recipes`; **Grocery** (`cart`, lime) → `/(meals)/grocery`.

### Animations
Header → macro dashboard → widgets → slot/recipe cards all FadeInDown with staggered delays; springy tiles; pressed-scale 0.96; the calorie ring animates its arc.

---

# 4 · CIRCADIAN OPTIMIZER

*(File: `app/(tabs)/circadian.tsx`. Hidden tab — reached from Home/Profile/Insights.)*

### Purpose
The chronobiology USP: a 24-hour body-clock dial with entrainment score and biological windows ("Profile Hub"), and an AI-generated, circadian-timed meal/training "AI Protocol".

### Background
Plain `background.primary #0A0C12` (no hero image), paddingTop safe-area. Light status bar.

### Top-to-bottom layout

1. **Loading (whole screen):** a layout-matched skeleton — a 130×13 + 120-tall header block, two tab-label skeletons, then a 300-tall block + a 150×12 label + a 2×2 132-tall grid.

2. **HERO** (FadeInDown 420, horizontal 24): an overline "Chronobiology" (muted); then a GlassCard (lime glow, radius 2xl, lime 0.28 border) with a diagonal lime wash, padding 20, row layout: left a stacked title **"Circadian"** (display 32, white) + **"Optimizer"** (display 32, **lime**), and a **shift chip** below (pill, lime-tinted if active else muted, an icon `sunny`/`moon` + "Active {Shift} Shift" / "No active shift"); right a 56×56 lime-tinted rounded-square (radius 18, lime border) with a `pulse` icon (28, lime).

3. **TAB SELECTOR** (FadeInDown 60) — an underline tab bar (bottom hairline border), two tabs: **"Profile Hub"** and **"AI Protocol"** (subhead). Active tab = lime text + a 2px lime bottom border; inactive = muted.

### PROFILE HUB tab

4a. **No shift:** EmptyState `moon-outline` "No shift to sync to" / "Log your current shift and we'll map your melatonin, caffeine and insulin windows to keep your body clock aligned." + a lime **"Schedule a shift" CtaButton** (`calendar-outline`) → `/(tabs)/schedule`.

4b. **With shift:**
   - **24-Hour Body Clock card** (FadeInDown 120) — GlassCard (lime glow, lime 0.26 border, padding 24, centered) with a vertical lime wash. Overline "24-Hour Body Clock" (centered). A signature **`CircadianRing`** dial (244px): a faint tick ring + 24 hour ticks (quadrants emphasized), a thick **lime "optimal" arc** from insulin-peak → caffeine-cutoff, color-dot **markers** (melatonin blue / caffeine amber / insulin cyan / temp lime) pinned at clock positions, a slim "now" hand from centre, and a centered **entrainment score** numeral ("{score}/100" or "--", mono) over an "Entrainment" caption. A **legend** row (a lime bar + "Optimal window"). Below, advice copy (bodySm muted, centered) from `entrainmentAdvice(score)`.
   - **Shift-aware status card** (FadeInDown 180) — GlassCard (lime 0.2 border, row, padding 16): a 44×44 lime-tinted `sunny`/`moon` square + "Synced to" (overline tertiary) over the **shift label** (subhead); a trailing 40×40 lime-outline **calendar button** (Pressable, pressed scale 0.96) → `/(tabs)/schedule`.
   - **Biological Windows** (FadeInDown 240) — overline "Biological Windows"; a 2-col **metric tile grid** (gap 12). Each tile = a GlassCard (48% width, accent 0.25 border, padding 18): a 44×44 accent-tinted icon square (radius 14) + a caption label + a mono value (statSmall). Tiles: **Melatonin Onset** (`moon`, blue), **Caffeine Cutoff** (`cafe`, amber), **Insulin Peak** (`restaurant`, cyan), **Peak Temp** (`thermometer`, lime). Values are "HH:MM" or "--:--".
   - **Window Playbook** (FadeInDown 300) — overline "Window Playbook"; a horizontal snapping **carousel** (card width ≈ 72% viewport capped 280, snap +12). Each playbook card = a GlassCard (accent 0.28 border, padding 18) with an accent wash: a top row (a 44×44 accent icon square + the mono value, accent-colored), the label (subhead), and a coaching **hint** (caption): melatonin "Wind-down begins — dim lights, ease off screens."; caffeine "Last call for caffeine to protect deep sleep."; insulin "Best window to fuel — carbs are tolerated well."; temp "Core temperature peaks — your strength window."

### AI PROTOCOL tab (FadeInDown 120)

5. **Protocol header row:** overline "Today's Protocol" + a lime-outline **"Regenerate"** pill (Pressable, `sparkles` + "Regenerate", disabled+dimmed while generating) → triggers plan generation.

6. **Quota-reached notice** (only on a 429 daily-AI-limit, mutually exclusive with error): a GlassCard (lime glow, lime 0.35 border, `alert` role): a `flash-outline` (lime) + "Daily AI limit reached" (subhead bold) + "You've used all {limit} of your {Pro|free} daily AI plans. Resets at {time}." + a lime **"Upgrade" CtaButton** (sm, `sparkles`) → `/(modals)/premium`.

7. **Generation-failed notice** (any other error): a GlassCard (lime 0.35 border, `alert` role): `alert-circle` (lime) + "Generation failed" (subhead bold) + the error message + a lime-outline **"Try Again"** button (`refresh`) → re-generates.

8. **Generating (loading):** a GlassCard (lime 0.25 border) hosting **`GeneratingSteps`** (animated, lime, column layout) cycling: "Reading your circadian profile…", "Calculating macro targets…", "Timing your meals to your shift…", "Scheduling your activation window…", "Finalizing your plan…". Below, 4 timeline-row skeletons (a 40×12 time + a 72-tall card).

9. **No protocol yet** (idle, no plan): EmptyState `sparkles-outline` "No protocol yet" / "Generate today's circadian-timed meal & training plan." / "Generate protocol" → generates.

10. **Populated protocol:** a vertical **timeline** — each item = a left time column (60px, a mono **time** 13px + a connecting line) and a GlassCard (accent 0.2 border, padding 16): a 40×40 accent-tinted icon square (`restaurant` meal / `barbell` workout / `warning` action), a title (subhead) + a caption (macros string / duration / note), and — for meals — a lime-tinted **"Log this"** button (`add-circle-outline`) → `/(meals)/log-planned-meal` (prefilled). Accent: meal cyan, workout amber, else lime.

### Animations
Hero + tab selector + each profile/protocol section FadeInDown with staggered delays; pressed-scale 0.96 on the status/regenerate/calendar buttons; the ring + GeneratingSteps animate.

---

# 5 · COMMUNITY / FEED

*(File: `app/(tabs)/community.tsx`. Tab "Feed".)*

### Purpose
A social feed of member posts (like / comment / share) with an active-challenges strip and a create-post entry.

### Background
`ImageBackground` `hero-community.png` (blurRadius 5, opacity 0.35) over `#0A0C12`, with a `[rgba(#0A0C12,0.85), #0A0C12]` overlay. Light status bar.

### Top-to-bottom layout

1. **Header** (paddingTop safe-area+20, bottom hairline border): a **"Community"** title (h2, white) on the left; on the right two 44×44 icon buttons (radius 22, 1px hairline, bg `tertiary` 0.5): `podium-outline` (Leaderboard) → `/(community)/leaderboard`, and `chatbubbles-outline` (Messages) → `/messages/`.

2. **Active Challenges strip** (only if challenges exist, marginTop 24, marginBottom 32): a section row — overline "ACTIVE CHALLENGES" + a cyan **"SEE ALL"** → `/(community)/challenges`. Then a horizontal scroll of up to 3 **challenge cards** (160px wide, GlassCard intensity 40, padding 16): a 40×40 emerald-tinted `flash` disc + a bold 1-line **title** + "{n} participating" (caption muted). Tap → `/(community)/challenges`.

3. **Create Post action** (marginHorizontal 20, marginBottom 24): a GlassCard row (padding 16) — a 32×32 muted avatar circle (`person`) + "What's on your mind?" (body muted) + a trailing cyan `image-outline` (20). Tap → `/(modals)/create-post`.

4. **Like-failure notice** (transient, only after a failed like rolls back; auto-dismisses ~4s or on tap): a GlassCard (lime 0.35 border, `alert` role) — `alert-circle` (lime) + "Couldn't like that post. Please try again." + a trailing `close` (tertiary).

5. **Feed** (horizontal 20):
   - **Loading:** a `FeedSkeleton` — 3 PostItem-shaped GlassCard placeholders (a 32px avatar + name/time lines, two body lines, and a 220-tall image block).
   - **Error:** EmptyState `cloud-offline-outline` "Couldn't load the feed" / "Something went wrong fetching the community feed. Check your connection and try again." / "Try Again" — refetches.
   - **Empty:** EmptyState `chatbubbles-outline` "No posts yet" / "Be the first to share something with the community." / "Create a post" → `/(modals)/create-post`.
   - **Populated:** a list of **`PostItem`** cards (GlassCard intensity 40, marginBottom 16, padding 16): a tappable **header** (a 32px avatar — author photo or `person` fallback — + author name bold + relative "{time} ago") → `/(community)/userProfile?userId={id}`; the post **content** (body muted, lineHeight 22); an optional **post image** (full-width, 220 tall, radius xl); and an **actions row** (top hairline border, gap 24): a **like** button (`heart-outline`, muted, + count; turns lime/`heart` when liked) → optimistic like; a **comment** button (`chatbubble-outline` + count) → `/(community)/{postId}`; and a **share** button (`share-social-outline`) → native Share sheet ("{author} on Zeitra:\n\n\"{content}\"").

### States & interactions
Pull-to-refresh (cyan tint) refetches feed + challenges; likes are optimistic with rollback; share opens the OS share sheet. No entrance stagger here (memoized list).

---

# 6 · PROFILE

*(File: `app/(tabs)/profile.tsx`. Hidden tab — reached from Home avatar / More.)*

### Purpose
The user's profile: avatar + identity, edit/preferences actions, key stats, circadian-phase summary, optional cycle tracker, achievements, and (coach-only) a Coach Hub link.

### Background
Plain `background.primary #0A0C12`. Light status bar. ScrollView (no bounce), bottom padding TAB_BAR_H+40.

### Top-to-bottom layout

1. **Loading:** a `ProfileSkeleton` mirroring the layout (cover wash + nav skeletons, a 110px avatar, name/level skeletons, two action-button skeletons, three stat-pill skeletons, a circadian-card skeleton, an achievements-row skeleton).

2. **Cover + nav header** (height 140): a diagonal **lime cover wash** `[rgba(A8CC3C,0.18), rgba(93B82E,0.06), #0A0C12]`. Nav row: a **"Profile"** title (h1) on the left; on the right two 38×38 icon buttons — `settings-outline` (fill `rgba(white,0.06)`) → `/(settings)`, and `log-out-outline` (red, red-tinted fill) → logout.

3. **Avatar** (overlapping the cover, marginTop −55, centered, lime glow): a 110×110 ring (3.5px **lime** border, bg `primary`) holding either the avatar photo (96×96) or a `person` (56) placeholder; a small **online dot** (20px, success green, 3px border) bottom-right.

4. **Identity** (centered):
   - **Display name** (h1, white, centered).
   - A line "{occupation|Member} · Level {n}" (body muted) — "Level —" if the weekly-stats fetch errored.
   - An optional **about me** paragraph (body muted, centered).
   - **Action row** (gap 12): an **"Edit Profile" CtaButton** (lime, `create-outline`, flex) → `/(tabs)/profile/edit`; and a **"Preferences"** GlassCard button (a `options-outline` + "Preferences", flex) → `/(tabs)/profile/preferences`.
   - **Admin button** (admins only): a full-width **red** button (`shield` + "Admin Dashboard", white text) → `/(admin)`.

5. **Stats row** (3 `StatPill`s, gap 12) — each a GlassCard (flex) with a centered mono value + a tiny UPPERCASE label: **FATIGUE** "{n}%" (amber `warning`), **STREAK** "{n}d" (cyan), **ADHERENCE** "{n}%" (green `success`). On fetch error a pill shows "—" + "Unavailable" + a small `refresh` "Retry" affordance instead of a misleading 0.

6. **Circadian phase card** — GlassCard (amber glow, radius 2xl, padding 22): a header (`sunny-outline` amber + "CIRCADIAN PHASE" overline), the **phase** (h3) ("Unavailable" on error else the phase or "—"), a body line ("Your metabolic window is currently optimised for activity." or the error copy), and an amber-tinted **button**: "View Full Schedule →" → `/(tabs)/circadian` (or "Retry" on error → refetch).

7. **Cycle tracker** (only if `cycleTrackingEnabled === true && biologicalSex === 'FEMALE'`): a **`CyclePhaseCard`** (GlassCard, lime-tinted glow, padding 18) — a `ellipse-outline` (lime) + "CYCLE PHASE" overline, the phase name (h3) (or "Tracking on" when UNKNOWN), a non-prescriptive tip (body), an optional **"YOUR PLAN TODAY"** impact row (hairline top border, a `sparkles-outline` + per-phase plan copy), and a "This is a wellness estimate, not medical advice." note. Below the card, a lime-outline **"View Cycle Tracker →"** button → `/(performance)/cycle`.

8. **Achievements** — overline "ACHIEVEMENTS"; a horizontal scroll of `GlassCard`s (124px wide, padding 16, centered): a 48×48 color-tinted icon disc + a bold title + a muted desc. Static set: **Early Riser** "30 Day Streak" (`trophy`, amber `#FFB300`), **Mindful** "50 Sessions" (`body`, cyan `#00D4AA`), **Night Owl** "Top 5%" (`moon`, purple `#7C4DFF`).

9. **Coach Hub button** (coach roles only): a purple-tinted full-width row (`people` + "Open Coach Hub" + `chevron-forward`) → `/(coach)/dashboard`.

### Animations
No FadeInDown stagger here; standard `activeOpacity` presses; the avatar carries a lime glow; pressed states dim Preferences (0.85).

---

# 7 · SCHEDULE (hidden, redirect)

*(File: `app/(tabs)/schedule.tsx`.)*

A pure redirect: rendering this route immediately **`<Redirect href="/(shifts)" />`**. No UI of its own — a deep link to `/schedule` lands in the real shifts area. (No mockup needed; document as a routing alias.)

---

# 8 · ANALYTICS / INSIGHTS

*(File: `app/(tabs)/analytics.tsx`. Hidden tab "Insights" — reached from Profile/More.)*

### Purpose
Performance analytics: XP/level progress, quick links, a sleep-vs-performance chart, peak-fatigue & deep-sleep stats, a sleep↔performance correlation card, a circadian-entrainment insight, and a "Talk to Coach Ria" entry.

### Background
Plain `background.primary #0A0C12`, paddingTop safe-area. Light status bar. ScrollView padding 20, bottom TAB_BAR_H+80.

### Top-to-bottom layout

1. **Header** (bottom hairline border): a centered **"Insights"** title (h1) flanked by a spacer (left) and a 32px **history icon** (`time-outline`, 22, muted) → `/(exercises)/history`.

2. **XP / Level card:**
   - **Loading:** a 150-tall skeleton.
   - **Error:** EmptyState `cloud-offline-outline` "Couldn't load your level" / "Check your connection and try again." / "Retry".
   - **Loaded:** a pressable **purple gradient card** `[purpleDark, purple, purpleDark]` (radius 2xl, padding 22, purple glow). Top row: left "FITNESS LEVEL" (overline, white 0.6) + a baseline "{level}" (statMedium) + "/ Level {level+1}" + "{xp} XP Total" (captionMedium, purpleLight); right a **"VIEW BADGES"** badge (white-tinted, `sparkles`) + a `chevron-forward`. Below, an **XP progress bar** (white→purpleLight gradient fill on a white-tinted track) with "Lv {n}" / "{pct}% → Lv {n+1}" labels. Tap → `/(community)/achievements`.

3. **Quick Actions row** (gap 10): four tiles (bg `secondary`, 1px border, radius 18, padding 14, centered): a 36×36 tinted icon disc + a 2-line 10px caption. **Exercise History** (`barbell-outline`, blue) → `/(exercises)/history`; **Achievements** (`trophy-outline`, amber) → `/(community)/achievements`; **Leaderboard** (`podium-outline`, purple) → `/(community)/leaderboard`; **Muscle Map** (`body-outline`, emerald) → `/(exercises)/muscles`.

4. **Sleep vs. Performance chart** — a GlassCard (radius 2xl, padding 20): title "Sleep vs. Performance" (h3) over "Last 7 Days Correlation" (body muted); a **legend** (a cyan box "Sleep Quality" + a lime box "Alertness").
   - **No data:** EmptyState `bar-chart-outline` "No data yet" / "Log sleep and activity to unlock your weekly correlation chart." / "Log Sleep" → `/(modals)/log-sleep`.
   - **Data:** a 180-tall **chart area** — 3 faint horizontal grid lines, then 7 day columns each with a **cyan gradient bar** (height = sleep quality) and a lime **alert dot** (positioned by alertness %), and an x-axis of day labels Mon–Sun.

5. **Stats row** (gap 12): two GlassCards.
   - **Peak Fatigue** (radius 20, padding 18): a 36×36 lime-tinted `warning-outline` disc + "PEAK FATIGUE" overline + a mono value ("--:--" default) + a thin lime mini-bar (70%).
   - **Deep Sleep** (radius 20, padding 18): a 36×36 cyan-tinted `moon-outline` disc + "DEEP SLEEP" overline + a mono value ("--" default) + an optional delta row (`trending-up/down` + "{±}m vs avg", cyan if positive else lime).

6. **Performance Correlation card** — a GlassCard (radius 2xl, padding 20): left a `git-network-outline` (purple) + "SLEEP ↔ PERFORMANCE" overline, "Correlation Score" (body muted), a mono **score** ("{n}%" or "--", statMedium), and a one-line verdict ("✓ Strong correlation — sleep is driving your performance" ≥70 / "Moderate link — improving sleep quality may boost alertness" / "Log more data to see your correlation score"). Right a 72×72 **purple gradient circle** (purple glow) showing "High"/"Med"/"?".

7. **Circadian Entrainment insight** (`EntrainmentCard`) — a GlassCard (radius 2xl, padding 16): a header (a 32×32 tinted `sunny-outline` chip + "CIRCADIAN ENTRAINMENT" overline) tinted **cyan** when well-aligned else **amber**; a title row ("Well aligned" / "Room to improve" / "Build your baseline") with a quiet "approx." caption for a finite score; the advice copy (body muted); and an optional hint row (`moon-outline` + "Wind-down window opens around {time}").

8. **Weekly AI Report card** — a purple-tinted row (purple 0.08 fill, purple 0.3 border, radius 20, padding 18): a 40×40 **purple gradient** avatar (`sparkles`) + "Talk to Coach Ria" (subhead, purpleLight, weight 800) over "Get a personalized analysis of your trends and recommendations" (caption muted) + a trailing `chevron-forward`. Tap → `/(modals)/ai-coach`.

### Animations
No FadeInDown stagger; standard presses; XP bar + chart bars render to their values; the correlation circle + Ria avatar use purple gradients with glows.

---

# 9 · MORE (settings hub)

*(File: `app/(tabs)/more.tsx`. Tab "More".)*

### Purpose
A profile summary + grouped settings list (Account, Insights & Tools, App Settings with a Dark-Mode switch, Support links), a logout button, and the app version.

### Background
Plain `background.primary #0A0C12`, paddingTop safe-area. Light status bar. ScrollView, bottom padding TAB_BAR_H+40.

### Top-to-bottom layout

1. **Header:** a **"More"** title (display, white), horizontal 20.

2. **Profile summary** — a GlassCard (radius 24, **pink/lime glow**, marginHorizontal 12) with a warm lime wash. Row (padding 20): a 76×76 **lime gradient avatar ring** (`gradients.coral`, pink glow) holding a 68×68 avatar photo (3px border); beside it the **name** (h2, 1 line), the **email** (bodySm muted, 1 line), and a purple-tinted **"Zeitra User"** badge (`moon` + label).

3. **Settings sections** (each: an overline section title + a GlassCard list with a `gradients.card` wash). Rows (padding 14, hairline dividers between rows): a 36×36 lime-tinted icon square (radius 12) + the row label (bodyMedium) on the left; on the right either a value caption + a `chevron-forward`, or a `Switch`. Disabled rows (no route/url/switch) are dimmed 0.45 with no chevron.
   - **Account:** "My Profile & Preferences" (`person-circle-outline`) → `/(tabs)/profile`; "Manage Subscription" (`star-outline`, value "Pro Tier") → `/(settings)/subscription`.
   - **Insights & Tools:** "Analytics Dashboard" (`stats-chart-outline`) → `/(tabs)/analytics`; "Achievements & Badges" (`trophy-outline`) → `/(community)/achievements`; "AI Workout Planner" (`sparkles-outline`) → `/(exercises)/ai-planner`; "Calculators (1RM & Macros)" (`calculator-outline`) → `/(exercises)/calculator`.
   - **App Settings:** "Notification Settings" (`notifications-outline`) → `/(settings)/notification-preferences`; "Notification History" (`list-outline`) → `/(settings)/notifications`; "Connected Devices" (`watch-outline`) → `/(settings)/devices`; **"Dark Mode"** (`moon-outline`) — a **Switch** (purple track when on, white thumb) bound to the theme store.
   - **Support:** "Help Center" (`help-circle-outline`, link) → opens `https://zeitra.app/support`; "Terms of Service" (`document-text-outline`, link) → opens `https://zeitra.app/terms`.

4. **Logout button** — a bespoke **lime-outline** button (lime 0.40 border, lime 0.08 fill, radius lg, marginHorizontal 12): `log-out-outline` + "Log Out" (subhead, lime). Logs out + replaces to `/(auth)/login`.

5. **Version line:** "Zeitra v{appVersion}" (caption muted, centered).

### Animations
None special; `activeOpacity` 0.7 presses; the Switch animates; the avatar ring carries a glow.

---

# 10 · EDIT PROFILE

*(File: `app/(tabs)/profile/edit.tsx`. Hidden — pushed from Profile. Modal-like full screen.)*

### Purpose
Edit the (server-persisted) display name and avatar.

### Background
Plain `background.primary #0A0C12`, inside a `KeyboardAvoidingView`. A bottom-hairline header.

### Top-to-bottom layout

1. **Header** (paddingTop safe-area+20): a left **close** button (`close`, 28) → back; a centered **"Edit Profile"** title (h3); a right **"Save"** text button (subhead, **purple**, weight bold; dimmed 0.5 + disabled while saving or invalid).

2. **Loading:** a header + a 100px avatar skeleton + a "Tap to change photo" skeleton + one input-field skeleton (label + 56-tall field) + a 60-tall save skeleton.

3. **Avatar section** (centered, vertical margin 32): a tappable 100×100 avatar (2px **purple** outline, purple glow, padding 4) showing the picked image or a `camera` (32) placeholder, with a purple **edit badge** (`pencil`, 28px) bottom-right. Caption "Tap to change photo" (muted). Tapping opens the image picker (square crop, quality 0.7).

4. **Form:** a single **InputGroup** — overline label "DISPLAY NAME" + a `TextInput` (bg `secondary`, radius xl, 1px border, height 56, 16px text, placeholder "Your full name", placeholder color tertiary). On a validation error the field border turns **red** and an inline `alert` caption (red) appears (e.g. "Name must be at least 2 characters." / "Name must be 64 characters or fewer.").

5. **Save button** — a full-width primary **`Button`** (variant primary = lime), height 60, marginTop 40, label "SAVE CHANGES" (or "SAVING..." while pending), disabled when invalid/saving.

### States & interactions
Validation is live (trimmed length 2–64). Save sends only `displayName` (+ `avatarUrl` if set); on success shows an OS Alert "Profile updated successfully" and goes back; on failure an Alert "Error". 

### Animations
None special; pressed/disabled opacity states only.

---

# 11 · PREFERENCES

*(File: `app/(tabs)/profile/preferences.tsx`. Hidden — pushed from Profile.)*

### Purpose
Edit circadian sleep-window times, dietary preference, and allergy tags; deactivate account.

### Background
Plain `background.primary #0A0C12`. A bottom-hairline header. A time-edit Modal overlays when editing.

### Top-to-bottom layout

1. **Header** (paddingTop safe-area+20): a left **back** button (`arrow-back`, 24); a centered **"Preferences"** title (h3); a right **"Save"** text button (subhead, **cyan**, bold; dimmed while saving). Save persists the whole prefs object.

2. **Loading:** header + a 180×14 label + a 300-tall block, then a second section with a 200×14 label + a 120×12 label + a 6-tile grid skeleton.

3. **Circadian Rhythm section** — a header (`moon-outline` purple + "CIRCADIAN RHYTHM" overline, purple); a glass `Card` (1px border, radius 24, padding-x 18) with two tappable **TimeRows** (hairline divider): **"Sleep Window Start"** and **"Sleep Window End"**, each showing the value ("HH:MM" or "—") + a `chevron-forward`. Tapping opens the time-edit Modal.

4. **Metabolic Preferences section** — a header (`nutrition-outline` emerald + "METABOLIC PREFERENCES"):
   - **DIETARY PREFERENCE** overline; a wrapping **chip grid** (gap 10) of options: NONE, ANY, VEGETARIAN, VEGAN, PESCATARIAN, KETO, PALEO, HALAL, KOSHER. Each chip (radius 14, 1px border, minWidth 30%, captionMedium bold): **selected = emerald fill + emerald glow + white text**; unselected = `secondary` bg + muted text. Tapping toggles (re-tapping the selected one resets to NONE).
   - **RESTRICTIONS & ALLERGIES** overline; a `TextInput` (bg `secondary`, radius xl, height 52, placeholder "Add allergy...", auto-capitalize words; submit adds the tag). Below, a wrapping **tag grid** of added allergies — each a removable chip (`rgba(white,0.05)` fill, 1px border, the tag text + a `close-circle`); tapping removes it.

5. **Account section** — a **"DEACTIVATE ACCOUNT"** `Button` (variant outline, **lime** border, height 60).

6. **Time-edit Modal** (fade) — a dim `rgba(0,0,0,0.6)` overlay; a centered card (bg `secondary`, 1px border, radius 24, padding 24, max-width 360): a title (the field label, subhead bold), a **`DateTimeField`** (mode time, with inline error), and a footer with a **Cancel** button (border) + a **Save** button (cyan fill, **ink** "Save" text). Validates 24-hour HH:MM ("Use 24-hour HH:MM (e.g. 07:30)" on bad input).

### States & interactions
Save (header) persists prefs → OS Alert "Preferences updated" (or "Error"); the modal Save validates then writes locally (committed on the header Save). 

### Animations
Modal fade; selected diet chips carry an emerald glow; pressed-state opacities.

---

## Cross-screen consistency checklist (for the renderer)
- **Every "coral" = LIME `#A8CC3C`.** CTAs are lime fills with **ink `#0A0C12`** labels/icons. The active tab, the centre Quick-Log disc, primary glows, and "coral" hairlines are all lime.
- The **Ria purple FAB** + the **centre lime Quick-Log disc** appear on every tab screen, above the blurred bottom tab bar.
- Cards are dark frosted glass (radius 20–24, 1px `rgba(255,255,255,0.10)` hairline, subtle accent glow). Stats use the **mono** font.
- Section headers are muted UPPERCASE **overlines**; collections snap horizontally and peek the next card; image cards use full-bleed photos with a dark bottom scrim + a bold white label.
- Loading = layout-matched skeletons; empty = a centered lime-circle EmptyState with a lime CTA; error = a `cloud-offline-outline` EmptyState (or inline glass notice) with Retry — **never** a silent zero.
- Entrances are staggered `FadeInDown`; presses scale 0.96–0.97.
