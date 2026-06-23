# Zeitra — UI Mockup Spec · Section 03 · Exercises & Training

> Paste-ready spec for GPT (or any designer) to render every screen in the **Exercises & Training** flow of the Zeitra mobile app. Each screen below is described top-to-bottom with every element, all data/text, all interactions + destinations, all loading/empty/error states, exact styling tokens, and entrance/press animations. Read literally — nothing here is invented; it is transcribed from the live React Native code.

---

## ZEITRA DESIGN SYSTEM (condensed — applies to every mockup)

**Brand:** athletic, premium, high-contrast, energetic. Tagline **"STRONG TODAY. BETTER EVERYDAY."** Logo = lime "Z" + dumbbell on black.

**Colors (exact tokens — note: the codebase key `accent.coral` is the LIME brand color, a legacy key name):**
- Background ink `#0A0C12` (deep near-black). Surfaces: `secondary #13161F` (card), `tertiary #1B2030` (elevated), `quaternary #242B3D`.
- Borders / hairlines: `border.default #222838`, `border.light #2F3650`, focus `#A8CC3C`. (Spec target: 1px rgba(255,255,255,0.06–0.10).)
- **PRIMARY = softened lime `#A8CC3C`** (token `accent.coral`); light `#C5E06B`, deep `#93B82E` (token `accent.coralDark` / `accent.pink`). Used for accents, active states, progress, small fills, primary CTAs.
- Functional: cyan `#00D4AA` (`accent.cyan`, success/progress), purple `#7C4DFF` (`accent.purple`, AI/Coach), amber `#FFB300` (`accent.amber`, caution), red `#FF4444` (`accent.red`, danger), emerald `#10B981` (`accent.emerald`, positive/active), blue `#4FC3F7` (info).
- Text: primary `#FFFFFF`, secondary `#9BA3B4` (muted), tertiary `#7B8497` (faint), inverse `#0A0C12` (ink-on-lime).
- Gradients: `coral = [#A8CC3C → #93B82E]` (brand hero), `cyan = [#00D4AA → #4FC3F7]`, `purple = [#7C4DFF → #B47CFF]`.

**CTAs:** LIME fill with INK (`#0A0C12`) text + icons (code currently passes `#FFF` on some lime buttons — render as **ink on lime** per brand). Bold, radius 12–14 (or fully-rounded pill `9999` on large CTAs), subtle (not neon) lime glow shadow.

**Cards:** dark-glass surfaces (`#13161F`), radius 16–20 (continuous corner curve), generous padding, subtle 1px border `#222838`. `GlassCard` = the frosted-fill primitive that owns radius + hairline + clip.

**Typography (Inter for UI, JetBrains Mono for stats/numerals):**
- `display` 36/extra-bold, `h1` 28/bold (-0.3 ls), `h2` 24/bold, `h3`/`heading` 20/semibold, `subhead`/`subtitle` 16/semibold, `body` 15/regular, `bodySm` 14, `caption` 12, `captionMedium` 12/medium.
- `overline` 11/semibold, letter-spacing **1.5**, UPPERCASE, muted — used for section labels.
- Mono stats: `statLarge` 48, `statMedium` 32, `statSmall` 24, `statTiny` 16.
- Big bold display numerals/headings are weight 800–900.

**Spacing (4px grid):** xxs 2, xs 4, sm 8, md 12, lg 16, xl 20, 2xl 24, 3xl 32, 4xl 40. Radii: sm 4, md 10, lg 14, xl 20, 2xl 24, 3xl 28, full 9999.

**Layout language:** overline section headers preceded by a 3px-wide lime accent rail; GRID layouts (2-col cards); horizontal snapping CAROUSELS for collections; pill/chip filters; circular progress RINGS; stat cards; a bottom tab bar.

**Bottom tab bar (global, frosted blur over ink, 1px top hairline rgba(255,255,255,0.10), height 88 iOS / 72 Android):**
5 slots — **Home** (home icon) · **Train** (barbell) · **[Quick-Log centre]** · **Feed** (people) · **More** (menu). Active tab = LIME icon + label + a 4px lime dot under the icon; inactive = faint `#7B8497`. The **centre Quick-Log** is a raised 58px lime→deep-lime gradient disc with a white "+" (30px) and a tiny lime "Log" caption beneath; pressing it opens a Quick-Log chooser sheet (Log a meal / Start a workout / Log sleep). A floating **Ria AI Coach FAB** (56px purple→violet gradient disc, white "sparkles" icon, tiny cyan notification dot top-right) sits bottom-right, 14px above the tab bar, on every tab screen.

> NOTE: The Exercises/Training screens below are mostly **pushed routes** (full-screen, own back button). The bottom tab bar is visible only on the Library index (which lives over the tab area) — the detail/sub-screens cover it. Where relevant it is called out per screen.

**Motion (premium, Reanimated):** `FadeInDown` entrances with staggered per-section delays; springy card reveals (`.springify().damping(18).mass(0.7)`); `FadeIn` for result grids; animated progress/charts; pressed-scale **0.96** on cards (spring damping 18 / stiffness 320) and CTAs.

---

# SCREEN 1 — Exercise Library (index)

**Route:** `/(exercises)/index` · **Purpose:** the catalog browse + search hub. Two visual modes: **Browse** (category cards + muscle grid, default) and **Results** (2-col exercise grid) once a search/category/muscle filter is active.

### Top-to-bottom layout
1. **Status bar:** light content. Screen bg `#0A0C12`.
2. **Header** (paddingTop = safe-area top + 16, horizontal 20):
   - **(Conditional) Back/clear row** — only when a filter is active: a left `arrow-back` (20px, LIME) + bold caption label in LIME. Label text = active muscle uppercased + `" EXERCISES"`, else active category label uppercased + `" EXERCISES"`, else `"BACK"`. Tapping clears all filters.
   - **Title row** (space-between, top-aligned):
     - Left: `h1` "**Exercise Library**" (white). Below it a subtitle row = a 3px×14 LIME accent bar + `body` muted text. Subtitle = `"Browse by category"` in Browse mode, or `"{N} exercises found"` in Results mode.
     - Right: a **History icon button** — 48×48, radius 14, surface `#13161F`, 1px `#222838` border, `time-outline` icon (22px, white). → pushes `/(exercises)/history`.
3. **Search row** (horizontal 20, gap 10, marginBottom 14; enters `FadeInDown` 420ms):
   - **Search field** (flex, `GlassCard` radius 14, inner height 48, padding-h 14, gap 8): `search` icon (18px, faint `#7B8497`) + `TextInput` (15px Inter, white). Placeholder **"Search exercises…"** (faint). When text present, a trailing `close-circle` clear icon (18px, faint).
   - **Muscles icon button** — 48×48, radius 14, surface `#13161F`, 1px CYAN-tinted border (cyan @35% alpha), CYAN glow shadow, `body-outline` icon (22px, CYAN). → pushes `/(exercises)/muscles`.
4. **Muscle-group filter chips** — horizontal snapping carousel (enters `FadeInDown` delay 80 / 420ms; snapToInterval 104, fast deceleration, no scrollbar; padding-h 20, gap 8). Chips for: **Chest · Back · Shoulders · Arms · Core · Legs · Glutes · Full Body**. Each chip = pill (radius 999, padding 16×9, 1px border), label `caption` 12.5px weight 800. **Active chip** = LIME fill + LIME border + LIME glow, label color = ink `#0A0C12`. **Inactive** = surface `#13161F`, border `#222838`, label white. Tapping toggles that muscle filter (re-tap clears).

5a. **BROWSE MODE** (no search/category/muscle) — vertical ScrollView (padding 20, bottom = tab bar + 40):
   - **Section header "Categories"** — 3px×13 LIME rail + `overline` muted label.
   - **Category grid** — 2 columns, gap 12. **4 cards**, each (width ≈ (screen−52)/2, height 168, radius 20 continuous, clipped), staggered entrance `FadeInDown` delay (120 + i·60) springy:
     - Full-bleed bundled art image (cover) + bottom dark gradient (`transparent → rgba(0,0,0,0.9)`).
     - Left **accent rail** 3px in the category color.
     - Bottom content (padding 14): category label `heading` 20px weight 900 white; sub-line `caption` 11px white@62%.
     - Top-right **arrow chip** — 28px circle, fill = catColor@18%, 1px catColor@50% border, `arrow-forward` 14px in catColor.
     - The 4 categories (label · sub · color): **Gym** · "Barbell · Dumbbell · Machines" · LIME `#A8CC3C`; **Home** · "Bodyweight · Anywhere" · `#00D4FF`; **Cardio** · "HIIT · Endurance · Fat Burn" · `#2ECC71`; **Recovery** · "Pelvic Floor · Stability" · `#A855F7`. Tapping sets that category → switches to Results mode.
   - **Section header "Browse by Muscle"** (marginTop 32) — same rail + overline.
   - **Muscle grid** — wrap row, gap 10. Same 8 muscle chips, each a pill (surface `#13161F`, 1px border, radius 20, padding 16×10) = a 6px LIME dot + `caption` bold white label. Staggered `FadeInDown` delay (260 + i·35). Tapping sets that muscle → Results mode.

5b. **RESULTS MODE** (search OR category OR muscle active):
   - **Loading:** a 2-col skeleton grid of 6 `GlassCard`s (radius 20): each = a 138px image-block skeleton + an 11px-padding info area with an 85%-wide 14px line and a 55%-wide 11px line.
   - **Empty:** centered `EmptyState` — icon `fitness-outline`, title **"No exercises found"**, subtitle = if searching: `Nothing matched "{query}". Try a different search or clear your filters.` else `No exercises here yet. Try another category, muscle group, or clear your filters.`, action button **"Clear Filters"**.
   - **Loaded:** a 2-col `FlatList` of **ExerciseGridCard** tiles (enters `FadeIn` 300ms; padding 16, columnGap 12, rowGap 12, bottom = tab bar + 40). Pull-to-refresh spinner tinted LIME.

### ExerciseGridCard (each result tile)
- `GlassCard` radius 20; width = (screen−44)/2. Pressed-scale 0.96 spring; entrance `FadeInDown` staggered (index·45, capped at 9).
- **Image area** (full width, height 138): cover thumbnail (real `imageUrl` or bundled category-art fallback) + bottom gradient (`transparent → rgba(0,0,0,0.65)`).
  - **Top-left LEVEL badge** (only if difficulty present): pill radius 999, fill = levelColor@18%, 1px levelColor@85% border; a 5px levelColor dot + uppercase level text 9px weight 800. Level colors: beginner `#2ECC71`, intermediate `#FFB300`, advanced/expert `#FF4444`.
  - **Top-right DEMO chip** (only if exercise has a demo gif/video): 24px LIME circle with white `play` glyph (11px).
- **Info area** (padding 11, gap 5): exercise **name** `subhead` 14px weight 700 white (max 2 lines); a meta row = 5px LIME dot + target muscle `caption` 11px muted (1 line); optional **equipment pill** (if equipment ≠ "body weight") = cyan-tinted (cyan@10% fill, cyan@40% border, radius 6) `barbell-outline` 9px + uppercase equipment text 9px cyan.
- Tap → pushes `/(exercises)/{id}`.

### Data / behavior notes
- Filters drive one backend query (`searchLibrary`) keyed on query/category/muscle, limit 200, only enabled when a filter is set.
- Bottom **tab bar visible** on this screen (it lives over the tab area).

---

# SCREEN 2 — Exercise Detail

**Route:** `/(exercises)/[id]` · **Purpose:** full exercise page — animated demo "player", stats, tabbed How-To / Muscles / Pro Tips / Progress, and a Log CTA.

### Top-to-bottom layout
1. **Floating overlay header** (absolute, z 10, top = safe-area + 8, horizontal 20, space-between):
   - Left: **back button** — 40px circle, fill rgba(0,0,0,0.45), white `arrow-back` (22px) → `router.back()`.
   - Right (conditional, only if a tutorial/YouTube URL resolved): **"Watch demo"** pill — fill rgba(0,0,0,0.6), `logo-youtube` icon (18px, RED `#FF4444`) + white "Watch demo" text 12px weight 700 → opens the URL externally.
2. **ExerciseDemo player** (full width, height 320, black bg) — the hero. Behavior precedence:
   - **MP4 video** (if a self-hosted clip + native engine): looping muted autoplay; bottom-left **"Demo"** pill (rgba(0,0,0,0.5), cyan `sync` icon + white text).
   - **Animated frames / GIF:** cross-fades start↔end frames in a boomerang loop (frame 900ms, fade 320ms). Tap to pause → dim overlay + a 64px LIME `play` badge; bottom-left pill toggles **"Demo"** (cyan `sync`) ↔ **"Paused"** (cyan `pause`).
   - **No demo:** shows the exercise image (or bundled fallback) + bottom-left **"Video demo coming soon"** pill (rgba(0,0,0,0.55), `videocam-outline` + muted text), and if a tutorial URL exists a second **"Full tutorial"** pill (LIME `open-outline` + white text).
   - All variants: a bottom gradient `transparent → rgba(0,0,0,0.7) → #0A0C12` so the player melts into the page.
3. **Body** (ScrollView, padding 20, pulled up marginTop −40 to overlap the player, bottom 120):
   - **(Conditional) "Unreviewed" chip** (only when the curated demo is explicitly not human-reviewed): outline-only pill, 1px faint border, faint text 10px bold.
   - **Badge row** (gap 8): a **difficulty badge** (fill = diffColor@15%, 1px diffColor border, radius 8) uppercase difficulty 10px bold in diffColor (diff colors: beginner `#2ECC71`, intermediate `#F59E0B`/amber, advanced/expert `#EF4444`/red; fallback LIME). If muscleGroup present, a **muscle badge** (cyan@15% fill, cyan border) uppercase muscleGroup 10px bold cyan.
   - **Title** — `display` 28px weight 900 white (the exercise name).
   - **(Conditional) Equipment line** — `body` muted: `"Equipment: {equipment}"`.
   - **Stat trio** (3 glass cards, gap 10, marginTop 20): each card (glass, padding 14, centered) = a 40px circle icon-chip (fill = color@14%) + an `overline`-style 10px muted caption + a bold value (1 line). The three:
     - **TARGET** — `body` icon, LIME, value = human target muscle label (e.g. "Chest", "Legs"; raw "upper legs" mapped → "Legs").
     - **EQUIPMENT** — `barbell` icon, CYAN, value = equipment or "None".
     - **LEVEL** — `bar-chart` icon, diffColor, value = difficulty or "N/A".
   - **Tab bar** (row, 1px bottom border, marginTop 28): 4 tabs **HOW TO · MUSCLES · PRO TIPS · PROGRESS** (each `caption` 11px bold uppercase, padding-v 12, 2px bottom border). Active tab = white label + LIME bottom border; inactive = muted label, transparent border.
   - **Tab content** (marginTop 20):
     - **HOW TO:** If instructions exist AND TTS available, a header row = `heading` 16px "How to perform" + a **Listen** pill (radius 999, 1px LIME@45% border, LIME@13% fill; `volume-high` 16px LIME + "Listen" 12px bold LIME). While speaking it becomes **Stop** (`stop` icon, fill LIME@22%). Then the steps:
       - If **no instructions**: `heading` 16px "Instructions coming soon" + muted note "Step-by-step instructions aren't available yet. In the meantime, keep these coaching cues in mind:" then a bulleted list of coaching tips (6px LIME dot + `body` muted, lineHeight 22).
       - If **one paragraph**: a single flowing `body` muted paragraph (lineHeight 24).
       - If **multiple steps**: numbered list — each = a 30px circle step-number (LIME@15% fill, LIME@30% border, LIME number bold) + `body` muted step text (lineHeight 24), gap 14.
     - **MUSCLES:** a glass `Card` — overline "PRIMARY MUSCLES" + a wrap of LIME chips (fill LIME@15%, 1px LIME border, radius 8) for each primary muscle (deduped bodyPart + muscleGroup). If secondary muscles exist (deduped vs primary): overline "SECONDARY MUSCLES" + a wrap of CYAN chips (cyan@15% fill, cyan border).
     - **PRO TIPS:** a glass `Card` — header = a 36px amber-tinted circle with `bulb` icon (20px amber) + `heading` 16px title ("Coach's Tips" if body-part-specific, else "Training Tips"). Then a bulleted list — 6px amber dot + `body` muted tip (lineHeight 22), gap 12.
     - **PROGRESS:** weight-progression line chart.
       - **Loading:** glass Card with a 180px-wide 18px skeleton + a full-width 180px skeleton chart block.
       - **Error:** `EmptyState` icon `cloud-offline-outline`, title "Couldn't load progress", subtitle "We hit a snag fetching your weight progression. Check your connection and try again.", action **"Retry"**.
       - **Has data:** glass Card — `subhead` bold "Weight Progression (KG)" + a `LineChart` (width screen−100, height 180, CYAN line thickness 3, cyan area fill fading 0.4→0.1, 4 sections, axes in `#222838`, axis labels 10px muted, last 10 points, x-labels = "MMM d").
       - **No data:** `EmptyState` icon `stats-chart-outline`, title "No progress yet", subtitle "Log a set of this exercise and your weight progression will start charting here.", action **"Log This Exercise"** → pushes `/training/workout?exercise={name}`.
4. **Sticky footer CTA** (absolute bottom, padding-h 20, paddingBottom = max(safe-area,20)): a `transparent → #0A0C12` fade behind it, then a full-width **primary Button** size lg: **"LOG THIS EXERCISE"** with a white `add-circle` icon (22px). → pushes `/training/workout?exercise={name}`. (Render as ink-on-lime per brand.)

### Loading / empty states (whole screen)
- **Loading:** a 320px image skeleton, then (marginTop −40, padding 20) two badge skeletons (88×22, 104×22), a 72%-wide 32px title skeleton, a 160×16 line, a row of 3 stat-card skeletons (104px tall), a row of 4 small tab skeletons (52×14), and 3 full-width 18px line skeletons.
- **Not found:** floating back button (as above) + centered `EmptyState` — icon `barbell-outline`, title "Exercise not found", subtitle "We couldn't load this exercise. It may have been removed or there was a connection hiccup.", action **"Back to Library"**.

### Animations
- Tab switches swap content instantly; demo player cross-fade + pause overlay as above; CTA pressed-scale.

---

# SCREEN 3 — AI Workout Planner

**Route:** `/(exercises)/ai-planner` · **Purpose:** configure goal/level/days/focus/equipment, then let "Coach Ria" generate a routine. Accent identity = **purple** header, but the active-selection color follows the chosen GOAL's color.

### Top-to-bottom layout
1. **Header** (LinearGradient `purple@18% → transparent`, paddingTop = safe-area + 16, horizontal 20):
   - Left: `arrow-back` (24px, white) → back.
   - Center (flex): `h2` "**AI Workout Planner**" white + `caption` muted "Coach Ria builds your perfect routine".
   - Right: **Ria avatar** — 44px purple-gradient disc with PURPLE glow, white `sparkles` icon (20px).
2. **ScrollView** (bottom padding 120). Each section is preceded by a `SectionTitle` (caption 11px bold, letter-spacing 1, muted, padding-h 20, top 24 / bottom 12):
   - **"WHAT'S YOUR GOAL?"** — horizontal carousel (padding-h 20, gap 12). **5 goal cards** (width 120, padding 16, radius 16, 1.5px border, centered): a 44px icon-chip (fill = goalColor@15%) + label `subhead` weight 800 + a 2-line `caption` 10px desc. **Selected** = fill goalColor@18%, goalColor border, label in goalColor, plus a top-right 18px goalColor check-badge with white `checkmark`. The 5 goals (label · icon · color · desc):
     - **Strength** · `barbell-outline` · LIME `#A8CC3C` · "Max force, progressive overload"
     - **Muscle** · `body-outline` · purple `#A855F7` · "Hypertrophy & muscle growth"
     - **Endurance** · `heart-outline` · `#00D4FF` · "Cardio capacity & stamina"
     - **Fat Loss** · `flame-outline` · red `#EF4444` · "High intensity calorie burn"
     - **General** · `fitness-outline` · `#2ECC71` · "Balanced all-around fitness" (default selected)
   - **"YOUR EXPERIENCE"** — vertical list of 3 **level rows** (padding 16, radius 14, 1.5px border): left = label `subhead` weight 700 + `caption` desc; right = a 22px radio (2px border; filled with a 12px goalColor dot when selected). Selected row tinted goalColor@15% + goalColor border, label in goalColor. Levels: **Beginner** "< 6 months training"; **Intermediate** "6 months – 2 years" (default); **Advanced** "2+ years consistent training".
   - **"DAYS PER WEEK"** — row of 5 square buttons (flex, aspect 1, radius 14, 1.5px border): big mono number 22px + `overline` 9px "DAYS". Options **2 · 3 · 4 · 5 · 6** (default 3). Selected = solid goalColor fill, white number + "DAYS" @85% white.
   - **"MUSCLE FOCUS (OPTIONAL)"** — wrap of chips (padding 14×8, radius 20, 1.5px border): **Chest · Back · Legs · Shoulders · Arms · Core · Glutes · Full Body**. Multi-select; active = goalColor@18% fill + goalColor border + goalColor label; inactive = surface + muted label.
   - **"AVAILABLE EQUIPMENT"** — wrap of icon-chips (row, padding 14×10, radius 14, 1.5px border): icon + label. Options: **Full Gym** (`business-outline`, default) · **Home (Dumbbells)** (`home-outline`) · **Calisthenics** (`body-outline`) · **Kettlebell** (`ellipse-outline`). Single-select; active styling = goalColor like above.
   - **Summary card** (marginTop 24, padding 16, radius 16, fill goalColor@8%, 1px goalColor@25% border): header = `sparkles` icon (goalColor) + overline-ish "RIAS PLAN SUMMARY" (11px bold goalColor, ls 1). Body `body` white: `"{days}-day {level} {goal} program"` + (if focus areas) `" · {areas joined}"` + `" · {equipment}"`. Sub-line `caption` muted: "Ria will create a full exercise list with sets, reps, and progression logic for your shift schedule."
3. **Sticky footer** (absolute bottom, padding-h 20, paddingBottom = max(safe-area,20)):
   - **(Conditional) Daily-AI-limit card** (when a 429 quota error, not while pending): fill LIME@8%, 1px LIME@35% border, radius 16. `flash-outline` icon (LIME) + title `subhead` weight 700 white "Daily AI limit reached" + `caption` muted body `"You've used all {limit} of your {Pro|free} daily AI plans. {Resets at {time}}."`. Then an **Upgrade** CtaButton (size sm, `sparkles` icon) → pushes `/(modals)/premium`.
   - **(Conditional) Generation-failed card** (retryable, non-quota errors): fill goalColor@8%, 1px goalColor@35% border, radius 16. `alert-circle` (goalColor) + title "Generation Failed" + `caption` muted = the error message. Then a **"Try Again"** outline button (1.5px goalColor border, radius 20, `refresh` icon + goalColor text) → re-runs generation.
   - **Generate CTA** — full-width pill, height 60, radius 30, solid goalColor fill + goalColor glow. Idle: white `sparkles` (22px) + **"GENERATE MY PLAN"** 16px weight 900 white. Pending: shows **GeneratingSteps** (animated rotating status lines, white): "Reading your training profile…" → "Selecting exercises for your goal…" → "Balancing sets, reps & volume…" → "Sequencing your weekly split…" → "Finalizing your plan…". Disabled+0.7 opacity while pending. (Render fill as lime, text as ink per brand.)

### Success / interactions
- **On success:** native alert "🎯 Plan Created!" body `"{routine name}" is ready. Tap it in My Routines to start.`, button **"View Routines"** → replaces to `/(exercises)/routines`.
- Bottom tab bar NOT shown (full-screen pushed route).

---

# SCREEN 4 — Performance Analytics

**Route:** `/(exercises)/analytics` · **Purpose:** strength dashboard — overall stats, a progression chart for a chosen PR, the top personal records list, and a volume-distribution donut.

### Top-to-bottom layout
1. **Header** (paddingTop = safe-area + 20, horizontal 20, 1px bottom border, space-between): back arrow (24px white) · centered `heading` 18px "Performance Analytics" · a 40px spacer (keeps title centered).
2. **ScrollView** (bottom padding 100):
   - **Overall stats strip** (row, padding 24, gap 20): two centered items split by a 1px×40 divider:
     - LIME `statMedium` value = **active days** + `overline` muted "ACTIVE DAYS".
     - CYAN `statMedium` value = **records count** + `overline` muted "RECORDS".
   - **Strength Progression card** (padding-h 20; card padding 20, radius 24, surface, 1px border):
     - Header row: a stack of `subhead` bold "Strength Progression" + `caption` muted = selected exercise name OR "Select an exercise below"; right = `trending-up` icon (20px, EMERALD).
     - Body (height ~160):
       - No exercise selected → empty chart: `bar-chart-outline` (40px faint) + `caption` muted "Choose a personal record to track".
       - Loading → a full-width 160px skeleton.
       - Error → `cloud-offline-outline` (32px faint) + muted "Couldn't load progression. Pull to refresh or pick another record."
       - >1 point → `LineChart` (width screen−80, height 160, LIME line thickness 3, lime area fading 0.2→0, 4 sections, no axis lines, last 15 points, labels 10px muted).
       - ≤1 point → muted "Not enough data to plot progression".
   - **Personal Records (1RM) section** (padding-h 20, marginTop 24): `heading` "Personal Records (1RM)" then:
     - **Loading:** 4 skeleton rows (40px round avatar skeleton + 55%/40% text lines + a 48×18 value skeleton).
     - **Error:** `EmptyState` `cloud-offline-outline`, "Couldn't load records", subtitle "Something went wrong fetching your personal records. Check your connection and try again.", action **"Try Again"**.
     - **Empty:** `EmptyState` `trophy-outline`, "No records yet", subtitle "Log a lift in the 1RM calculator to start tracking your personal records and strength progression.", action **"Open 1RM Calculator"** → pushes `/(exercises)/calculator`.
     - **Loaded:** top 5 PR rows. Each row (surface, radius 20, 1px border, padding 16, row): a 40px amber-tinted circle with `trophy` icon (18px amber) + a stack of `subhead` bold exercise name + `caption` muted date ("MMM d, yyyy") + right-aligned `statTiny` 18px CYAN `"{1RM}kg"` over an `overline` 9px muted "PR". **Tapping** a row selects it (drives the chart above) and gives it a LIME border.
   - **Volume Distribution card** (padding-h 20, marginTop 24; card padding 20, radius 24, surface, 1px border): `subhead` bold "Volume Distribution" then:
     - **Has data:** a row = a donut `PieChart` (radius 70, inner 45, white slice text 10px, focus-on-press) + a legend (each = an 8px colored dot + `caption` muted exercise name). Slice colors cycle LIME → CYAN → PURPLE → AMBER.
     - **Empty:** `EmptyState` `pie-chart-outline`, "No volume data yet", subtitle "Log lifts in the 1RM calculator to see how your training volume is distributed across exercises."
- Bottom tab bar NOT shown.

---

# SCREEN 5 — 1RM Calculator

**Route:** `/(exercises)/calculator` · **Purpose:** estimate one-rep-max from weight×reps (3 formulas), save it as a PR, and show training-zone percentages.

### Top-to-bottom layout
1. **Header** (paddingTop = safe-area, horizontal 20, 1px bottom border, space-between): back arrow (24px white) · `heading` 18px "1RM Calculator" · 40px spacer.
2. **KeyboardAvoidingView → ScrollView** (padding 20, bottom 100):
   - **Input card** (`GlassCard` intensity 40, radius 24; inner padding 24):
     - Row of two inputs (gap 16): **"WEIGHT (KG)"** caption + a 56px input (centered, 20px bold, fill `#1B2030`, radius 20), placeholder "0", default **"100"**. **"REPS"** caption + same input, placeholder "0", default **"5"**.
     - **"EXERCISE"** caption + a full-width input (same style), placeholder **"e.g. Bench Press"** (default empty).
   - **Result ring** (centered, marginVertical 30): a 224px LIME-gradient ring (with LIME glow) wrapping a 208px inner disc (surface `#13161F`, centered): `overline` muted "ESTIMATED 1RM", then a huge `statLarge` 48px white number = the estimated 1RM, then `subhead` bold muted "KILOGRAMS".
   - **Formula selector** (segmented row, fill `#1B2030`, radius 20, padding 6, gap 4): 3 segments **EPLEY · BRZYCKI · LANDER**, each = formula name 10px bold over its computed value `"{n}kg"` 14px weight 800. **Active** segment = LIME@18% fill, 1px LIME@40% border, radius 14, all text in LIME; inactive = faint name + muted value. (Default = Epley.)
   - **"SAVE TO RECORDS" CTA** (`CtaButton` size lg, `trophy` icon, height 56, radius 20, marginTop 24). Disabled when weight ≤ 0 or estimate ≤ 0; shows loading spinner while saving.
   - **(Conditional) disabled hint** (when save is guarded off): `caption` AMBER centered "Enter a weight and reps that give a 1RM above 0 to save."
   - **Save status surface** (driven by mutation state, inside a `GlassCard` radius 20):
     - **Error:** body with 1px red@40% border — `alert-circle` (20px red) + `subhead` bold "Couldn't save your record" + `caption` muted = server/error message; plus a **"Retry"** outline button (1px red@50% border, radius 14, red text) → re-fires save.
     - **Success:** body with 1px cyan@40% border — `checkmark-circle` (20px cyan) + `subhead` bold "Saved" + `caption` muted "Your 1RM record has been saved successfully." (Then auto-navigates back.)
   - **Training Zones** (heading "Training Zones", marginTop 24) — a `GlassCard` (radius 24) with 8 rows (each padding 16, 1px bottom divider except last): left = `subhead` bold `"{pct}%"` + `caption` muted zone label; right = `statTiny` 18px CYAN `"{estimated1RM × pct}kg"` + `caption` 10px muted `"~{reps} reps"`. The 8 zones (pct · label · reps):
     - 100% · Max Power · 1
     - 95% · Power · 2
     - 90% · Power/Strength · 3
     - 85% · Strength · 5
     - 80% · Strength/Hypertrophy · 7-8
     - 75% · Hypertrophy · 10
     - 70% · Hypertrophy/Endurance · 12-15
     - 60% · Endurance · 20+
- On successful save the screen pops back to the previous list. Bottom tab bar NOT shown.

---

# SCREEN 6 — Workout History

**Route:** `/(exercises)/history` · **Purpose:** logged-workout history — summary stats, a 35-day activity heatmap, and a tappable list of past sessions.

### Top-to-bottom layout
1. **Header** (paddingTop = safe-area, horizontal 20, 1px bottom border, space-between): back arrow (24px white) · `heading` 18px "Workout History" · 40px spacer.
2. **ScrollView** (pull-to-refresh, LIME tint; bottom 100):
   - **Stats grid** (3 stat cards, row, padding-h 20, gap 12, marginTop 20): each (surface, radius 20, 1px border, padding 12, centered) = a 28px tinted icon-chip + a `statSmall` 22px white value + an `overline` 9px muted label. The 3:
     - **Workouts** — `fitness` icon, PURPLE — total workouts.
     - **Minutes** — `time` icon, CYAN — summed duration.
     - **Volume (kg)** — `barbell` icon, AMBER — summed total volume (rounded).
   - **Activity Heatmap card** (padding-h 20, marginTop 20; card padding 20, radius 24, surface, 1px border):
     - Header: `subhead` bold "Activity Heatmap" + right `caption` EMERALD `"{N} Active Days"`.
     - **Heatmap grid** (wrap, centered, gap 4): up to 35 cells, each 14×14, radius 3. Cell color by day count: 0 → `#1B2030`; >0 → cyan@30% (`#00D4AA30`); >1 → cyan@80% (`#00D4AA80`); >3 → solid CYAN.
     - **Legend** (row, right-aligned): "Less" (9px muted) + four 10px swatches (tertiary → cyan@30 → cyan@80 → cyan) + "More".
   - **Workout Logs section** (padding-h 20, marginTop 24): `heading` "Workout Logs" then:
     - **Loading:** 4 skeleton rows (50×55 date-box skeleton + 60%/40% text lines).
     - **Error:** `EmptyState` `cloud-offline-outline`, "Couldn't load history", subtitle "Something went wrong fetching your workouts. Check your connection and try again.", action **"Try Again"**.
     - **Empty:** `EmptyState` `calendar-outline`, "No workouts logged yet", subtitle "Finish a session and it'll show up here with your stats and streaks.", action **"Start a Workout"** → pushes `/(tabs)/training`.
     - **Loaded:** a list of workout rows. Each row (surface, radius 20, 1px border, padding 12, row, marginBottom 12): a 50×55 **date box** (fill `#1B2030`, radius 14) = `overline` 10px LIME month ("MMM") over `statTiny` 18px white day ("dd") (or "--" if no valid date); then a stack = `subhead` bold title (`title || type || "Strength Training"`) + a meta row [`time-outline` 12px + `"{duration}m"` muted · a 3px dot divider · `barbell-outline` 12px + `"{N} Ex."` muted · a cyan badge `"{intensity}"` 8px bold uppercase]; then a trailing `chevron-forward` (18px faint). **Tap** → pushes `/(exercises)/report?workoutId={id}`.
- Bottom tab bar NOT shown.

---

# SCREEN 7 — Muscle Groups (Muscle Map)

**Route:** `/(exercises)/muscles` · **Purpose:** browse exercises by muscle group or stretching category; selecting a card reveals a filtered exercise list below.

### Top-to-bottom layout
1. **Header** (paddingTop = safe-area + 16, horizontal 20, 1px bottom border, space-between): back arrow (24px white) · `heading` 20px "Muscle Groups" · 24px spacer.
2. **Segmented switcher** (surface `#13161F`, radius 14, padding 4, margin 20 / bottom 4): two tabs **MUSCLES · STRETCHING** (each `caption` bold uppercase, padding-v 10, radius 10). Active = LIME fill + LIME glow + white label; inactive = faint label. Switching tabs resets the selection.
3. **FlatList** (padding 20, bottom 100) whose **header** holds the cards + (when selected) the section title and loading/empty/error states; the list body virtualizes the exercise rows:
   - **Group cards** (vertical stack, gap 10). Each card (height 72, radius 16, clipped, 1px transparent border): full-bleed bundled art (cover) + a left→bottom gradient (when selected, the left stop is groupColor@50%; bottom always rgba(0,0,0,0.8)). Content row (padding 14): a 4px×32 groupColor bar + label `subhead` bold white + a trailing `chevron-forward` (16px white@50%). **Selected** card gets a 2px groupColor border + a top-right 22px groupColor check disc with white `checkmark`.
     - **MUSCLES tab** groups (label · color): **Chest** LIME `#A8CC3C` · **Back** `#00D4FF` · **Shoulders** `#A855F7` · **Arms** `#F59E0B` · **Core & Abs** `#2ECC71` · **Legs** `#EF4444` · **Glutes** `#EC4899` · **Cardio** `#06B6D4`.
     - **STRETCHING tab** items: **Upper Body Stretch** `#A855F7` · **Lower Body Stretch** `#2ECC71` · **Yoga & Mobility** `#F59E0B`.
   - **(When a card is selected)** a section (marginTop 24): a header row = `heading` "{group} Exercises" + (when loaded & non-empty) right `caption` muted `"{N} total"`. Then:
     - **Loading:** 5 skeleton exercise rows (52×52 thumb skeleton + 65%/45% text lines).
     - **Error:** `EmptyState` `cloud-offline-outline`, "Couldn't load exercises", subtitle "Something went wrong. Check your connection and try again.", action **"Try Again"**.
     - **Empty:** `EmptyState` `barbell-outline`, "No exercises found", subtitle `"We don't have any {group} exercises tagged yet. Try another group."`.
   - **Exercise rows** (the virtualized list body): each (surface, radius 14, 1px border, padding 12, row, marginBottom 10): a 52px rounded thumbnail (real image or bundled fallback) + a stack = `subhead` bold name + `caption` muted `"{equipment} • {difficulty}"` + a trailing `chevron-forward` (16px faint). **Tap** → pushes `/(exercises)/{id}`.
- Bottom tab bar NOT shown.

---

# SCREEN 8 — Workout Report (session summary)

**Route:** `/(exercises)/report?workoutId=…` · **Purpose:** post-session recap — hero stats, per-exercise performance breakdown, an intensity/calories card, and share.

### Top-to-bottom layout
1. **Header** (paddingTop = safe-area, horizontal 20, 1px bottom border, space-between): left **close** (`close` 24px white) → back · `heading` 18px "Workout Summary" · right **share** (`share-outline` 24px white) → opens the OS share sheet.
2. **ScrollView** (bottom 100):
   - **Hero** (surface `#13161F`, padding 30 / top 44, centered, 1px bottom border, overflow hidden) with a top→bottom **LIME glow** gradient overlay (LIME@16% → transparent):
     - `overline` LIME = the formatted date ("EEEE, MMMM do") or "Recent session".
     - `h1` white centered = `title || type || "Great Session!"`.
     - **Stat trio** (row, marginTop 30, gap 20, two 1px×30 dividers): each centered = `statMedium` white value + `overline` muted label:
       - duration → **MINUTES**
       - rounded total volume → **VOL (KG)**
       - exercise count → **EXERCISES**
   - **Performance Breakdown** (padding 20): `heading` "Performance Breakdown" then one **exercise card** per logged exercise (surface, radius 20, 1px border, **4px CYAN left border**, padding 20, marginBottom 16):
     - Header row: `subhead` bold exercise name + a `checkmark-circle` (20px EMERALD).
     - Log row (4 columns, space-between): each = a `caption` muted label over a value: **SETS** (`body` bold) · **REPS** (`body` bold) · **WEIGHT** (`body` bold `"{kg}kg"`) · **1RM** (`statTiny` CYAN `"{Epley estimate}kg"`).
   - **Intensity / calories card** (`#1B2030`, radius 20, 1px border, marginTop 20, row, padding 20): a 40px amber-tinted circle with `flash` icon (20px amber) + a stack = `subhead` bold `"Intensity: {intensity}"` + `caption` muted `"You burned approximately {calories or duration×8} kcal during this session."`.
3. **Sticky footer** (absolute bottom, padding-h 20, paddingBottom = max(safe-area,20)): a full-width **"BACK TO TRAINING"** `CtaButton` size lg (height 60, fully-rounded) → pushes `/(tabs)/training`.

### Loading / error / not-found
- **Loading:** skeleton header (28px back + 150px title + 28px share) + skeleton hero (140px label, 220px title, 3 stat skeletons) + a "Performance Breakdown" skeleton + 3 full-width 108px card skeletons.
- **Error:** header with close + title + spacer, centered `EmptyState` `cloud-offline-outline`, "Couldn't load report", subtitle "We couldn't reach your workout data. Check your connection and try again.", action **"Try Again"**.
- **Not found:** same header, centered `EmptyState` `barbell-outline`, "Workout not found", subtitle "We couldn't load this session. It may have been removed, or there was a connection hiccup.", action **"Back to Training"** → pushes `/(tabs)/training`.
- **Share payload:** text `"💪 {title} — Zeitra\n⏱ {duration} min · 🏋️ {volume} kg volume · {N} exercises"`.
- Bottom tab bar NOT shown.

---

# SCREEN 9 — Workout Routines

**Route:** `/(exercises)/routines` · **Purpose:** list saved routines, jump to the AI planner, and create a routine (name + picked exercises) via two modals.

### Top-to-bottom layout
1. **Header** (paddingTop = safe-area + 16, horizontal 20, 1px bottom border, space-between): back arrow (24px white) · `heading` 20px "Workout Routines" · right **add** button = a 36px LIME-gradient disc (with LIME glow), white `add` icon (20px) → opens the Create modal.
2. **AI Planner banner** (margin-h 20, marginTop 16; row, 1.5px border, radius 16, padding 14; fill purple@10%, purple@30% border): a 40px purple-tinted circle with `sparkles` (22px purple) + a stack = `subhead` weight 800 PURPLE "Generate with Ria AI" + `caption` muted "Let Coach Ria build a personalized routine for your goals" + a trailing `arrow-forward` (20px purple). → pushes `/(exercises)/ai-planner`.
3. **ScrollView** (pull-to-refresh LIME tint; paddingTop 12, bottom 100):
   - **My Routines** (only when routines exist or loading; padding 20): `heading` "My Routines" then:
     - **Loading:** 3 skeleton bars (full-width, 68px, radius 20).
     - **Loaded:** one **routine card** per routine (surface, radius 16, 1px border, row, clipped, minHeight 68, marginBottom 12): a 4px full-height **color bar** (color cycles LIME → CYAN → EMERALD → PURPLE by index) + a stack (paddingLeft 16) = `heading` 17px name (`name || title`) + `caption` muted `"{N} exercises"` + a trailing **START** button (solid cycle-color pill, radius 20, padding 14×8, white "START" 11px bold) → pushes `/training/workout?routineId={id}`. **Tapping the card body** → pushes `/training/onboarding?routineId={id}`.
   - **Error state** (not loading): `EmptyState` `cloud-offline-outline`, "Couldn't load routines", subtitle "We couldn't reach your routines. Check your connection and try again.", action **"Retry"**.
   - **Empty state** (not loading, no error, zero routines): `EmptyState` `barbell-outline`, "No routines yet", subtitle "Build a routine of your favorite exercises, or let Coach Ria generate one for your goals.", action **"Create Your First Routine"** → opens the Create modal.
4. **Create Routine modal** (slide-up, full-screen over ink, paddingTop = safe-area):
   - Modal header (1px bottom border): **"Cancel"** (muted body) · `heading` "New Routine" · **"Save"** (LIME bold when valid, faint when disabled). Save is disabled until a name is entered AND ≥1 exercise is added (and not while creating). On save it creates the routine and closes.
   - Body (ScrollView, padding 20): a **"Routine name…"** text input (height 56, surface `#13161F`, 1px border, radius 12, faint placeholder). Then a row = `heading` 16px "Exercises" + a **"+ ADD"** action (CYAN bold caption) → opens the Picker modal. Then the selected-exercise rows (surface, radius 12, 1px border, padding 14, marginBottom 10): `subhead` bold name + `caption` muted `"{sets}x{reps}"` (default 3×10) + a trailing `trash-outline` (20px LIME) to remove.
   - **On create error:** native alert "Error" with the server message (or "Failed to create.").
5. **Exercise Picker modal** (slide-up bottom sheet over rgba(0,0,0,0.8); sheet height 80%, top corners radius 28, padding 24):
   - Sheet header (1px bottom border): `heading` "Select Exercise" + a `close` icon (24px white).
   - **Search input** (height 50, surface `#13161F`, radius 12, faint placeholder "Search…", autofocus).
   - Results (search enabled only when query length > 1):
     - **Loading:** 5 skeleton rows (55%/35% text lines + a 24px round skeleton).
     - **Error (query > 1):** `EmptyState` `cloud-offline-outline`, "Search failed", subtitle "Couldn't reach the exercise library. Check your connection and try again.", action **"Try Again"**.
     - **Results list:** rows (row, 1px bottom divider, padding-v 14) = a stack `subhead` bold name + `caption` muted muscleGroup + a trailing `add-circle` (24px CYAN). Tapping adds it (default 3×10) and closes the picker (dupes by name are ignored).
     - **Empty:** centered `caption` muted = "No results" (query > 1) or "Start typing…".
- Bottom tab bar NOT shown.

---

## Cross-screen consistency checklist (for the renderer)
- Always deep near-black `#0A0C12` background; cards `#13161F` with 1px `#222838` hairline + 16–20 radius.
- LIME `#A8CC3C` for the primary accent/active/CTA; ink text on lime CTAs; subtle (not neon) lime glow.
- CYAN for success/progress/secondary chips & charts; PURPLE for anything AI/Ria; AMBER for caution/calorie/PR-trophy chips; RED for danger/destructive.
- Section headers = overline (11px, ls 1.5, uppercase, muted) preceded by a 3px lime rail.
- Stats use mono numerals (JetBrains Mono); big and bold.
- Back buttons are top-left; pushed sub-screens cover the tab bar; the Library index shows the 5-slot frosted tab bar + the centre lime Quick-Log disc + the floating purple Ria FAB.
- Entrance = `FadeInDown` staggered; cards/CTAs press to scale 0.96 (spring).
