# Zeitra — Per-Screen UI Redesign Plan

Skimmable redesign brief for the five hero screens. Grounded in the **real** data each
screen already queries and the **real** design tokens in `clients/mobile/src/theme`.

> Rule of the house: every color/space/type value goes through `useTheme()` tokens —
> **never a raw hex**. CTAs use `<CtaButton/>` or `<Button variant="primary"/>` (ink-on-lime).
> Motion is **react-native-reanimated v4 only**. Add **zero** new dependencies.

---

## 1 · Design-System Summary

### Brand
- **Vibe:** premium, athletic, high-contrast. "STRONG TODAY. BETTER EVERYDAY."
- Large bold numerals, lime accents/rings/progress, dark-glass cards, generous spacing.

### Color tokens (`theme/colors.ts` — keys are stable, values are "Aurora")
- **Backgrounds:** `background.primary #0A0C12` (deep near-black) · `.secondary #13161F` (card) · `.tertiary #1B2030` (elevated) · `.quaternary #242B3D`.
- **PRIMARY = electric lime:** `accent.coral #C2F03C` (legacy key name) + `accent.coralDark`/`accent.pink #A6D62E`. NB: the brand gradient is **lime-monochrome**, not coral→pink — `gradients.coral` = `[#C2F03C, #A6D62E]`, `gradients.coralCta` = same. Treat any "coral/pink" naming as **lime**.
- **Secondary accents:** `cyan #00D4AA` (success/progress) · `blue #4FC3F7` (info) · `purple #7C4DFF` (AI/coach) · `amber #FFB300` (caution) · `emerald #10B981` (active) · `red #FF4444`.
- **Text:** `text.primary #FFFFFF` · `text.secondary #9BA3B4` · `text.tertiary #7B8497` (AA-safe).
- **Borders:** `border.default #222838` · `border.light #2F3650` · glass hairlines via `withAlpha(accent, 0.20–0.35)`.

### Typography (`theme/typography.ts`)
- **Display/heads:** `display 36` · `h1 28` · `h2 24` · `h3/heading 20` · `subhead 16`.
- **Body:** `body 15` · `bodySm 14` · `caption 12` · `captionMedium 12` · `overline 11` (uppercase, tracked — the section-label workhorse).
- **Numerals = JetBrains Mono:** `statLarge 48` · `statMedium 32` · `statSmall 24` · `statTiny 16`. Use these for every hero metric / ring center / countdown.

### Spacing & radius (`theme/spacing.ts` — 4px grid)
- Space: `xs 4 · sm 8 · md 12 · lg 16 · xl 20 · 2xl 24 · 3xl 32 · 4xl 40`. Screen gutter = **20** (`xl`). Card gap = **12** (`md`).
- Radius: `md 10 · lg 14 · xl 20 · 2xl 24 · 3xl 28 · full`. Cards = `xl–2xl`; chips/pills = `full`.

### Shared primitives (always reuse — guarded by `check-no-inline-glass` / `cta`)
- `<GlassCard intensity radius glow style>` — the ONE frosted dark-glass surface. Never hand-roll glass.
- `<CtaButton size icon label onPress>` — the ONE primary action (ink `#0A0C12` on lime fill, lime glow). Never white-on-lime.
- `<CircularProgress progress size strokeWidth color trackColor>` · `<Skeleton>` · `<EmptyState icon title subtitle actionLabel onAction>` · `<GeneratingSteps>`.
- `shadows.glow(accent)` for accent halos; `withAlpha(token, a)` for tints/hairlines.

### Required layout patterns (apply where they fit)
- **2-col GRID** stat/category cards · horizontal snapping **CAROUSELS** for collections · **section headers** (`overline` + optional "View all") · **pill/chip** filters · **stat cards** with mono numerals · **circular progress rings**.

### Motion system (Reanimated v4 — one shared vocabulary)
- **Entrance:** `FadeInDown.delay(n).springify()` on cards/sections, **staggered** ~60–80ms per index down a list.
- **Press:** `useAnimatedStyle` + `withSpring` scale **0.96–0.97** on every tappable card (replace bare `activeOpacity`).
- **Progress:** animate ring sweep + bar width with `withTiming`/`useDerivedValue` (count-up numerals via `withTiming` on a shared value).
- **Carousels:** `Animated.ScrollView` with `snapToInterval`; subtle parallax/scale on the focused card via `useAnimatedScrollHandler`.
- **Caps:** keep `maxFontSizeMultiplier` on giant numerals/micro-pills (1.3–1.4) so Dynamic Type can't clip them.

---

## 2 · Home / Dashboard — `app/(tabs)/index.tsx`

**Data it already has:** current shift (`getCurrentShift`) · upcoming shifts (`listShifts`) · today plan + `plan.meals` (`getTodayPlan`) · today progress incl. hydration (`getTodayProgress`) · per-category exercise counts (`searchLibrary`). Plus circadian helper cards (NextShift, ShiftTransition, LightPlan, AnchorSleep, TodayCircadianTimeline, CaffeineTimer) and `WeeklyRecap` + `ActivityHeatmap`.

### Layout (top → bottom)
- **Header:** lime-glow avatar (initials) + greeting + `display`/`h1` name; right = live shift badge (cyan dot) + bell. `formattedDate` line.
- **Shift-countdown HERO** (full-bleed `GlassCard`, lime gradient when active / cyan glass at rest): `overline` label + `statLarge` countdown numeral + circular icon chip.
- **Circadian insight chip** (time-of-day, accent-tinted pill, `full` radius).
- **UP NEXT meal card** (`GlassCard`): UP-NEXT badge + time, `h2` meal name, desc, **macro pills** (P/C/F), `<CtaButton label="Log Meal">`.
- Circadian helper-card stack (keep as-is, restyle to shared rhythm).
- **Sleep + Hydration + Caffeine mini-cards** (2-col, third wraps): icon chip, `overline` label, mono value, hydration bar + "+250ml".
- **QUICK ACTIONS** — 2×2 image grid (Log Meal/Workout/Sleep/Progress).
- **EXPLORE** — exercise-category 2×2 image grid (live counts as badges).
- **MORE FEATURES** image grid · **WORKOUT ACTIVITY** heatmap · **24H SCHEDULE** timeline · **WEEKLY RECAP**.

### Key components & patterns
- **Stat hero** (mono `statLarge`) · **2-col GRID** for minis/quick-actions/categories/features · image cards w/ dark-gradient scrim + accent count badge · **vertical timeline** with NOW pip + past-checkmarks · section headers w/ `overline` + "View Full →".
- **Upgrade to a CAROUSEL:** turn EXPLORE categories into a horizontal snapping rail (frees vertical space, matches the "collections = carousel" rule).

### Motion (Reanimated v4)
- Header `FadeInDown` (delay 0) → hero (60) → insight chip (120) → UP NEXT (180); **staggered** section reveals on scroll-in.
- Hero countdown: **count-up** numeral on mount + slow pulsing lime glow ring while a shift is active.
- Every image/mini/quick-action card: `withSpring` press-scale 0.96.
- Hydration bar + heatmap cells: `withTiming` fill on data-load; timeline NOW dot gentle scale-loop.

---

## 3 · Training — `app/(tabs)/training.tsx`

**Data it already has:** `getRoutines` (routine list) · `getActiveSession` (in-progress session). `activePlan = routines[0]`. Two-tab switcher: **TRAINING** / **MY PLAN**.

### Layout
- **Header:** `display` "Training" + subtitle + history icon button.
- **Segmented switcher** (pill, lime-fill active w/ glow) — TRAINING / MY PLAN.
- **TRAINING tab:**
  - **Resume/Start hero:** if `activeSession` → lime-`coralCta` "SESSION IN PROGRESS" card; else `GlassCard` "Start New Session" with lime BEGIN badge + ghost flash icon.
  - **Explore Workouts** — 2×2 category image grid (Gym/Home/Cardio/Recovery, accent-tinted tag).
  - **Your Routines** — horizontal **carousel** of routine cards (image, split-type tag, exercise count) + "VIEW ALL".
- **MY PLAN tab:** active-routine hero image card (ACTIVE badge, `statSmall` exercise count) → exercise list rows (accent dot, `name`, `sets×reps`) → `<CtaButton label="START SESSION">`.

### Key components & patterns
- **Segmented control** (chip/pill filter) · **2×2 category GRID** · **routine CAROUSEL** · **stat callout** (mono exercise count) · accent-dotted list rows · image card w/ gradient scrim + tag.
- Restyle the active-session card to the shared `coralCta` recipe and exercise rows into `GlassCard`-consistent surfaces.

### Motion (Reanimated v4)
- Switcher: animate the active-pill background with `withTiming`/layout transition (slide, don't hard-cut); cross-fade tab bodies (`FadeIn`/`FadeOut`).
- Start/Resume hero: entrance `FadeInDown`; resume card slow lime/pink glow pulse to signal "live".
- Category grid + routine carousel: **staggered** `FadeInDown`, press-scale 0.96, focused-card scale in the rail.
- MY PLAN exercise rows: staggered slide-in (60ms each); count numeral count-up.

---

## 4 · Nutrition — `app/(tabs)/nutrition.tsx`

**Data it already has:** today plan (`getPlanByDate`) · meal logs (`getMealLogs`) · daily progress/targets (`getTodayProgress`) · fasting log (`getFastingLogs`). Computes consumed vs target macros (NaN-safe `finiteNum`).

### Layout
- **Header:** `overline` date · `display` "Nutrition" · "Fueling your {shift} shift" · receipt/log icon.
- **Macro dashboard** (`GlassCard`): centered **`<CircularProgress>` ring** (180, emerald) with `statLarge` **KCAL LEFT** in center + consumed/target caption, then 3 **macro bars** (Protein/Carbs/Fat) — each `overline` label + `current/target g` + accent fill bar.
- **Today's Meals** (`GlassCard`): logged rows (`mealType` label + `kcal · g protein`) ending in a TOTAL row; honest loading/error/empty states.
- **Quick Tools** — 3-up row: Library / Recipes / Grocery (icon chips).
- **Daily Plan** (`GlassCard` rows): per-meal time chip + label/desc + add-circle, or dashed "Generate plan" empty card. "EDIT PLAN" link.
- **Fasting card** (cyan-glow `GlassCard`): 16:8 protocol + IN PROGRESS/IDLE badge + START/VIEW action.

### Key components & patterns
- **Circular progress ring** as the hero stat (the screen's centerpiece) · **macro stat bars** · **3-col tool GRID** · time-chip plan rows · status-badge card.
- **Upgrade:** make the three macro readouts a 3-col **stat-card grid** (mini ring or radial per macro) above the bars for a more "dashboard" feel; keep bars as the detail.

### Motion (Reanimated v4)
- Ring: animate `progress` 0→value with `withTiming` (ease-out ~900ms) on load; **count-up** the KCAL-LEFT numeral via a shared value.
- Macro bars: staggered width-fill `withTiming` (Protein→Carbs→Fat).
- Cards: `FadeInDown` per section (macro → meals → tools → plan → fasting), 60–80ms stagger.
- Tool cards + plan rows + fasting action: press-scale 0.96; fasting "IN PROGRESS" badge slow pulse.

---

## 5 · Circadian — `app/(tabs)/circadian.tsx`

**Data it already has:** current shift (`getCurrentShift`) · circadian model (`getModel`) → melatonin onset / caffeine cutoff / insulin peak / peak temp / entrainment score · AI protocol (`generatePlan` → `plan.meals`, normalized to timeline rows). Two tabs: **Profile Hub** / **AI Protocol**. Handles AI quota (429) + generation-error states.

### Layout
- **Hero** (`overline` "Chronobiology" + lime-glow `GlassCard`): `display` "Circadian / Optimizer" (2-line, second line lime) + shift chip + pulse icon.
- **Underline tab selector:** Profile Hub / AI Protocol (lime active underline).
- **Profile Hub:**
  - **Biological Windows** — 2×2 **metric GRID** of `GlassCard`s (Melatonin/Caffeine/Insulin/Temp), each icon chip + label + mono `statSmall` time.
  - **Entrainment Score** (cyan-glow card): big `statLarge /100` + advice copy.
  - No shift → `EmptyState` + `<CtaButton "Schedule a shift">`.
- **AI Protocol:** "Today's Protocol" header + Regenerate pill → quota/error notices (`GlassCard` + `<CtaButton "Upgrade">`) → `<GeneratingSteps>` loader while generating → **vertical timeline** of protocol rows (time column + line, icon chip, title, macros/note, "Log this") → honest "No protocol yet" `EmptyState`.

### Key components & patterns
- **2×2 metric stat GRID** (mono numerals) · **big score stat card w/ ring potential** · **underline tab control** · **vertical connected timeline** · inline notice cards · `GeneratingSteps`.
- **Upgrade:** wrap the Entrainment Score numeral in a `<CircularProgress>` ring (score/100) so it reads as a gauge, not just text — reinforces the "rings" pattern.

### Motion (Reanimated v4)
- Tab switch: animate underline position (`withTiming` translateX) + body cross-fade.
- Metric grid: **staggered** `FadeInDown` (4 tiles, 70ms each); each time value count-up.
- Entrainment ring/score: sweep `withTiming` + count-up to score on load.
- AI timeline: rows reveal top-down staggered (`FadeInDown`) as the plan lands; "Log this" press-scale; Regenerate icon spin (`withRepeat` rotation) while pending.

---

## 6 · Exercise Library — `app/(exercises)/index.tsx`

**Data it already has:** `searchLibrary({query, category, muscleGroup, limit})` (enabled when a filter/search is active) · category param deep-link. State: `activeCategory` · `activeMuscle` · `searchQuery`; `showBrowse` when all empty.

### Layout
- **Header:** filter back-row (lime "X EXERCISES" when filtered) · `h1` "Exercise Library" · result-count/"Browse by category" subtitle · history icon.
- **Search row:** `GlassCard` search field + cyan-glow muscles/body icon button.
- **Browse state (no filter):**
  - **Categories** — 2×2 image **GRID** (Gym/Home/Cardio/Recovery, gradient scrim + description).
  - **Browse by Muscle** — **chip/pill** wrap (Chest…Full Body).
- **Results state:** 2-col **`FlatList`** of exercise cards (`GlassCard`: image + demo-play badge, name, body part, equipment pill). Loading = 2-col skeleton grid; empty = `EmptyState` "Clear Filters".

### Key components & patterns
- **2-col image GRID** (categories) · **pill/chip filters** (muscles) · **2-col results FlatList** of glass stat-ish cards w/ equipment pills + demo badge · search-in-glass.
- **Upgrade:** add a horizontal **category chip rail** that stays pinned above results (so users can re-filter without returning to Browse); make active category a filled lime chip.

### Motion (Reanimated v4)
- Browse: category grid + muscle chips `FadeInDown` **staggered** (60ms); chip press-scale + selected-state lime fill transition (`withTiming`).
- Results `FlatList`: per-item entrance via `itemLayoutAnimation` / `FadeInDown.delay(index*40)` on `Animated.FlatList` (cap stagger so long lists don't lag); card press-scale 0.96.
- Filter change: cross-fade list body (`FadeIn`/`FadeOut`) instead of hard swap; `LinearTransition` on the grid when chips toggle.
- Keep `removeClippedSubviews` (Android) + `initialNumToRender` budget; entrance animations must not regress list perf.

---

## Cross-screen consistency checklist
- One **section-header** style everywhere: `overline` (`text.secondary`) + optional lime "View all →".
- One **card** surface: `<GlassCard>` (no inline glass) · one **CTA**: `<CtaButton>` (ink-on-lime, no white-on-lime).
- All hero numerals = **JetBrains Mono** stat tokens with `maxFontSizeMultiplier` caps.
- All tappable cards get **`withSpring` press-scale 0.96** + **staggered `FadeInDown`** entrances.
- Rings + bars + count-ups animate on data-load via `withTiming`. **No new deps.**
