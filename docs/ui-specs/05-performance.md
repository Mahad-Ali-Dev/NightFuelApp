# Zeitra UI Spec — 05. Performance & Body

This file is self-contained. Paste it into GPT (or hand it to a designer) to render
high-fidelity mockups of the **Performance & Body** section of the Zeitra mobile app.
Every value below is pulled from the real React Native source — colors, radii, spacing,
typography, copy, data fields, interactions, and animations.

---

## ZEITRA DESIGN SYSTEM (condensed — every mockup MUST follow this)

**Brand.** Athletic, premium, high-contrast, energetic. Tagline: **"STRONG TODAY. BETTER EVERYDAY."** Logo = lime "Z" + dumbbell on black.

**Color tokens** (these are the literal hex values the code uses; note the code key `accent.coral` is the lime brand color after the Zeitra rebrand — keys are stable, values are lime):

| Token (in code) | Hex | Use |
|---|---|---|
| `background.primary` | `#0A0C12` | App background (deep near-black) |
| `background.secondary` | `#13161F` | Card / surface, header buttons |
| `background.tertiary` | `#1B2030` | Elevated surface, inputs, image placeholders |
| `background.quaternary` | `#242B3D` | Higher elevation |
| `border.default` | `#222838` | 1px glass hairline borders, dividers, ring tracks |
| `border.light` | `#2F3650` | Lighter border |
| `accent.coral` (PRIMARY/lime) | `#A8CC3C` | Primary CTA, brand, active state, progress, the whole cycle accent |
| `accent.coralDark` / `pink` | `#93B82E` | Lime-deep (CTA gradient end) |
| `accent.cyan` | `#00D4AA` | Success / progress / hydration |
| `accent.purple` | `#7C4DFF` | AI, Coach, body-metrics accent |
| `accent.amber` / `warning` | `#FFB300` | Caution, luteal phase, AI reports accent |
| `accent.red` / `error` | `#FF4444` | Danger, delete, menstrual/logged days, validation errors |
| `accent.emerald` | `#10B981` | Positive (report highlights, success banner) |
| `success` | `#00D4AA` | = cyan |
| `text.primary` | `#FFFFFF` | Headings, values |
| `text.secondary` | `#9BA3B4` | Muted body / labels |
| `text.tertiary` | `#7B8497` | Faint captions, placeholders, inactive icons |
| Gradient `gradients.cyan` | `['#00D4AA','#4FC3F7']` | Hydration FAB |
| Gradient `gradients.coral` | `['#A8CC3C','#93B82E']` | Lime brand hero |

`withAlpha(color, a)` = that color at alpha `a` (e.g. `withAlpha('#A8CC3C', 0.18)` = lime @ 18%). Many fills/borders are alpha-tinted accents over the dark surface.

**CTAs.** LIME fill (`#A8CC3C`, gradient to `#93B82E`) with **INK `#0A0C12` text + icons — NEVER white on lime**. Radius 12–14, bold, subtle (not neon) lime glow. (Note: a few legacy buttons in this section still render white text on the accent — flagged inline; in the mockup, always use ink-on-lime.)

**Cards.** Dark-glass surfaces (`GlassCard` = `#13161F`-ish glass), radius 16–24, 1px `#222838` border, generous padding (16–24). A `GlassCard` may carry a soft `glow` (colored shadow) — keep it subtle.

**Typography** (family Inter for UI, JetBrains Mono for stat numerals):
- `display` Inter-ExtraBold 36/44, letter-spacing −0.5
- `h1` Inter-Bold 28/36 · `h2` Inter-Bold 24/32 · `h3` Inter-SemiBold 20/28 (screen titles + section headers)
- `subhead`/`subtitle` Inter-SemiBold 16/24 · `body` Inter-Regular 15/22 · `bodySm` 14/20
- `caption` Inter-Regular 12/16 · `captionMedium` Inter-Medium 12/16
- `overline` Inter-SemiBold 11/16, letter-spacing **1.5**, UPPERCASE, muted
- Stat numerals (mono): `statLarge` 48/56 · `statMedium` 32/40 · `statSmall` 24/32 · `statTiny` 16/22

**Spacing scale (4px grid):** `xxs`2 `xs`4 `sm`8 `md`12 `lg`16 `xl`20 `2xl`24 `3xl`32 `4xl`40 `5xl`48.
**Radius scale:** `sm`4 `md`10 `lg`14 `xl`20 `2xl`24 `3xl`28 `full`9999.
**Icon sizes:** `xs`16 `sm`20 `md`24 `lg`28 `xl`32. Icon set: **Ionicons**.

**Layout primitives.** Overline section headers; 2-col card grids; horizontal snapping carousels for collections; pill/chip filters; circular progress RINGS; stat cards. Every screen in this section is a **stack-pushed sub-screen** with its own custom header (back chevron + centered title + right action) — these screens do NOT show the app's bottom tab bar (they sit above the Performance/Circadian area). When rendering a full app frame, the tab bar is: **Home / Train / Fuel / Circadian / More**, active = lime icon+label, inactive muted `#7B8497`.

**Motion (premium).** Reanimated entrances: `FadeInDown` with staggered per-section delays (~60–90ms apart), springy card reveals, animated progress rings/bars that count up from 0, pressed-scale **0.97** on cards/CTAs. (The current code uses `activeOpacity` 0.7–0.9 on touchables and `Modal animationType` slide/fade; the mockup should layer the Reanimated entrances + press-scale on top of this for the premium target.)

**Standard header (used on every screen here).** Row, `paddingHorizontal:20`, `paddingVertical:14`, `borderBottomWidth:1` border `#222838`.
- Left: 40×40 circle button, bg `#13161F`, border `#222838`, radius 20, Ionicons `arrow-back` 22 white. → `router.back()`.
- Center: screen title in `h3` white.
- Right: either a 40×40 action circle (same style, or accent-tinted) or a 40-wide empty spacer for symmetry.

**Standard ScrollView padding:** `contentContainerStyle={{ paddingBottom: 100 }}` so content clears the tab/FAB zone.

---

# SECTION SCREENS

1. Performance Hub (`(performance)/index.tsx`)
2. Body Metrics (`body-metrics.tsx`)
3. Training Calendar (`calendar.tsx`)
4. Cycle (`cycle.tsx`)
5. Hydration Tracker (`hydration.tsx`)
6. Progress Photos (`photos.tsx`)
7. AI Performance Reports (`reports.tsx`)

---

## 1. Performance Hub — `(performance)/index.tsx`

### 1.1 Purpose
The hub / landing screen for the Performance section. Shows a daily **Performance Score** ring, a 2×2 grid of sub-feature entry cards, a weekly recap stat block, and a daily optimizations checklist.

### 1.2 Top-to-bottom layout
1. **Header** (standard). Left back chevron. Title **"Performance Hub"** (`h3`). Right: 40×40 circle button (bg `#13161F`, border `#222838`), Ionicons `refresh` 20 in `text.secondary` `#9BA3B4`. → invalidates the `today-progress` query (manual refresh).
2. **Score Card** (hero). Padding `xl`(20) around it. A `LinearGradient` card:
   - Gradient: `[withAlpha(scoreColor, 0.18) → background.secondary #13161F]`, top-left → bottom-right.
   - Radius `2xl`(24), border 1px `withAlpha(scoreColor, 0.4)`, plus a `shadows.glow(scoreColor)` colored glow. Inner padding 24.
   - **Row layout**: left = a **circular progress ring** (`CircularProgress` size 100, strokeWidth 8, color = `scoreColor`, track `#222838`) with centered overlay: big mono numeral (`statMedium`-family, fontSize 32) = the score, and under it overline **"PERF SCORE"** (fontSize 9, `text.secondary`).
   - Right (flex, marginLeft 24): `h3` white **"Great Job!"**, then `body` `text.secondary`: **"Your performance score is {score}% today. Keep up the high intensity!"**
   - `scoreColor` logic: score >80 → `success` cyan `#00D4AA`; >50 → `warning` amber `#FFB300`; else → `accent.coral` lime `#A8CC3C`. (Score is derived client-side from calorie+protein adherence; ranges 0–100.)
3. **Grid Metrics** — 2×2 grid (`paddingHorizontal:20`, `flexWrap`, `gap:12`, each card width `(screenWidth-52)/2`). Four `GlassCard` tiles (radius `xl`20, inner padding 20), each: a 44×44 rounded-square icon box (radius 22, bg `withAlpha(color,0.14)`, border `withAlpha(color,0.28)`), Ionicons 24 in `color`; then `subhead` white bold label (marginTop 14); then `captionMedium` value in `color` (marginTop 4):
   - **"Hydration"** — icon `water`, color cyan `#00D4AA`, value = `"{hydrationActual||0}ml"`. → `/(performance)/hydration`.
   - **"Body Metrics"** — icon `speedometer`, color purple `#7C4DFF`, value **"Update"**. → `/(performance)/body-metrics`.
   - **"AI Reports"** — icon `sparkles`, color amber `#FFB300`, value **"Weekly"**. → `/(performance)/reports`.
   - **"Photos"** — icon `camera`, color lime `#A8CC3C` (code `accent.coral`), value **"Gallery"**. → `/(performance)/photos`.
4. **Weekly Recap** — section (`paddingHorizontal:20`, marginTop `2xl`24). `h3` white **"Weekly Recap"** (marginBottom `md`12). A glass `Card` (padding 20) with two rows of two `RecapItem`s split by a 1px `#222838` divider (marginVertical 16). Each RecapItem = 34×34 circle icon (bg `withAlpha(color,0.14)`, Ionicons 18) + label (`caption` secondary) over value (mono `statTiny`-family 16, white):
   - Row 1: **"Avg Score"** = `"{avgScore||0}%"`, icon `analytics`, purple `#7C4DFF` · **"Streak"** = `"{streakDays||0} Days"`, icon `flash`, lime `#A8CC3C`.
   - Row 2: **"Water"** = `"{avgHydration/1000}L"`, icon `water`, cyan `#00D4AA` · **"Logged"** = `"{daysLogged||0}/7"`, icon `checkmark-circle`, success cyan `#00D4AA`.
5. **Optimizations** — section (`paddingHorizontal:20`, marginTop `2xl`24). `h3` white **"Optimizations"** (marginBottom `md`12). A `checklist` (gap 10) of three `CheckItem` glass rows (`GlassCard` radius `lg`14, inner row padding 16): left `body` white label (flex 1), right Ionicons `checkbox` (filled, in the item color) when checked else `square-outline` (in `text.tertiary` `#7B8497`):
   - **"Protein Target Met"** — checked when `proteinActual >= 140`, color success cyan.
   - **"Hydration Goal"** — checked when `hydrationActual >= 2500`, color cyan.
   - **"Light Exposure"** — checked when `lightExposureCompleted` true, color amber `#FFB300`.

### 1.3 Data / text
Score numeral 0–100; the four grid values; recap values `avgScore%`, `streakDays Days`, `avgHydration/1000 L`, `daysLogged/7`. Empty/zero defaults all render `0` (e.g. `0ml`, `0%`, `0 Days`, `0/7`).

### 1.4 Interactions + navigation
Back → previous screen. Refresh (header) → refetch today. Each grid card → push its route. Recap + checklist are display-only (no tap).

### 1.5 Loading / empty / error
- **Loading** (`todayQuery.isLoading`): skeleton mirror — a `SkeletonCard` height 148 radius `2xl` for the hero, four `SkeletonCard`s height 126 radius `xl` in the grid, then a 140×22 skeleton title + `SkeletonCard` 150 for recap, then a 140×22 title + three 54-tall skeleton rows.
- **Error** (`todayQuery.isError`): full-screen `EmptyState` — icon `cloud-offline-outline`, title **"Couldn't load your hub"**, subtitle **"Something went wrong fetching today's performance. Check your connection and try again."**, action button **"Try Again"** → refetch.
- No distinct empty state (zeros render as the loaded view).

### 1.6 Animations
Hero ring animates fill 0→score on mount; cards `FadeInDown` staggered (hero, then grid row, then recap, then checklist); press-scale 0.97 on grid cards.

---

## 2. Body Metrics — `body-metrics.tsx`

### 2.1 Purpose
Log today's body measurements (weight, body-fat %, optional tape measurements) and view a scrollable history of past snapshots.

### 2.2 Top-to-bottom layout
1. **Header** (standard). Title **"Body Metrics"**. Right = empty 40-wide spacer.
2. **Stats Row** (`paddingHorizontal:20`, marginTop 20, gap 12). Two equal `GlassCard` stat boxes (inner padding 16):
   - **"Latest Weight"** (overline secondary) over a big mono numeral (`statMedium`-family 30) = latest `weightKg` or `--`, with a trailing mono `statTiny` 14 unit **"kg"** in `text.secondary`.
   - **"Body Fat"** (overline) over numeral = latest `bodyFatPct` or `--`, trailing unit **"%"**.
3. **Log Form** (`paddingHorizontal:20`, marginTop `2xl`24). A `GlassCard` with inner padding 24:
   - `h3` white **"Log Today's Metrics"** (marginBottom 20).
   - **Weight (kg)** input — label `captionMedium` secondary, then a `TextInput` (numeric): padding 14, fontSize 16, bg `background.tertiary` `#1B2030`, radius `lg`14, border 1px `#222838` (→ `accent.red` `#FF4444` when invalid). Placeholder **"e.g. 82.5"** in `text.tertiary`.
   - **Body Fat %** input — placeholder **"e.g. 15.2"**.
   - **Disclosure toggle** (row, marginVertical 12): `subhead` purple `#7C4DFF` bold text **"Add Tape Measurements"** / **"Hide Tape Measurements"**, with Ionicons `chevron-down`/`chevron-up` 20 purple.
   - **Advanced (when expanded)** — three rows of two side-by-side inputs (each `flex:1`, gap 12):
     - Row: **Chest (cm)** ph **"105"** · **Arms (cm)** ph **"38"**
     - Row: **Waist (cm)** ph **"85"** · **Hips (cm)** ph **"100"**
     - Row: **Thighs (cm)** ph **"60"** · **Calves (cm)** ph **"40"**
   - **Save button** (marginTop 24): full-width, height 52, bg purple `#7C4DFF`, radius `xl`20, with `shadows.glow(purple)` when enabled. Label `subhead` bold white **"Save Snapshot"** (shows an `ActivityIndicator` white while saving). Disabled (opacity 0.5, no glow) while pending OR when any field has a validation error. *(Mockup note: keep this as the purple body-metrics CTA; it's intentionally purple, not lime, because body metrics is the purple/AI-adjacent feature.)*
   - **Validation copy** (each input, when invalid, `caption` red below it): e.g. `"Enter a valid weight greater than 0."`, `"weight must be 600 or less."`, `"body fat % must be at least 1."`, `"body fat % must be 70 or less."`, `"chest must be 300 or less."` (label substitutes per field; bounds: weight ≤600, body-fat 1–70, each tape measure ≤300; empty = valid/optional).
4. **History** (`paddingHorizontal:20`, marginTop `2xl`24). `h3` white **"History"** (marginBottom `md`12), then a list. Each entry = a row (`paddingVertical:14`, 1px bottom border `#222838`, space-between):
   - Left: `body` white semibold = `recordedAt`/`date` `.toLocaleDateString()`; under it `caption` secondary = `"{weightKg}kg • {bodyFatPct||'??'}% BF"`.
   - Right: optional mini-badge **"W: {waistCm}"** (`caption` 10, bg `background.tertiary`, radius 4, padding 6×2) when a waist value exists, then Ionicons `chevron-forward` 16 `text.tertiary`.

### 2.3 Data / text
Stat values `weightKg`/`bodyFatPct` (or `--`). History rows: localized date, `Xkg • Y% BF`, optional `W: <waist>`. Inputs collect weight, bodyFat, chest, arms, waist, hips, thighs, calves. On success: native alert **"Success" / "Metrics logged successfully"**; on error: native alert **"Error" / <server message or 'Something went wrong'>** and form clears.

### 2.4 Interactions + navigation
Back. Type into inputs (live validation gates Save). Toggle advanced section. Save → POST metrics; success clears all fields + invalidates `body-metrics`; rows are display-only (chevron is decorative — no detail nav wired).

### 2.5 Loading / empty / error (History only)
- **Loading**: four skeleton rows, each = a 120×15 + 90×12 stacked skeleton on the left and a 48×20 (radius `sm`) skeleton on the right, separated by 1px borders.
- **Error**: `EmptyState` icon `cloud-offline-outline`, title **"Couldn't load history"**, subtitle **"Something went wrong fetching your measurements. Check your connection and try again."**, action **"Try Again"** → refetch.
- **Empty**: `EmptyState` icon `speedometer-outline`, title **"No measurements yet"**, subtitle **"Log your weight, body fat, or tape measurements above to start tracking your progress over time."** (no action button).

### 2.6 Animations
Stat boxes + form `FadeInDown` staggered; advanced section expand = height/opacity reveal (springy); history rows `FadeInDown` stagger; Save press-scale 0.97 + glow pulse on enable.

---

## 3. Training Calendar — `calendar.tsx`

### 3.1 Purpose
A month calendar that dots days with logged training activity, plus a list of upcoming **Scheduled Sessions** and a modal form to create a new scheduled session (optionally linked to a work shift).

### 3.2 Top-to-bottom layout
1. **Header** (standard). Title **"Training Calendar"**. Right: 40×40 circle (bg `#13161F`, border `#222838`), Ionicons `add` 24 white → opens the New Session modal.
2. **Calendar Grid card** (`paddingHorizontal:20`, marginTop `xl`20). Glass `Card` padding `xl`20:
   - **Cal header row**: `h3` white month label = **"{MonthName} {Year}"** (e.g. "June 2026"); right = two chevron buttons (gap 16): Ionicons `chevron-back` 20 secondary (prev month) and `chevron-forward` 20 secondary (next month).
   - **Weekday labels row**: 7 cells, each centered `fontSize 12` bold `text.secondary`, single-letter Mon-first: **M T W T F S S** (uses first letter of `['Mon','Tue','Wed','Thu','Fri','Sat','Sun']`).
   - **Day grid**: wraps; each cell `width:(screenWidth-80)/7`, height 45, centered. A cell shows the day number in `body` (white). **Today** cell = bg `withAlpha(accent.coral/lime,0.18)`, radius 12, 1px border `withAlpha(lime,0.35)`, number lime `#A8CC3C` bold. A small **activity dot** (4×4, radius 2, success cyan `#00D4AA`) sits at the bottom of any day that has logged activity. Leading blank cells pad so day 1 lands under its real weekday.
3. **Scheduled Sessions** section (`paddingHorizontal:20`, marginTop `2xl`24). `h3` white **"Scheduled Sessions"** (marginBottom `md`12), then a list (gap `md`12). Each session = glass `Card` padding `lg`16 with a row:
   - 40×40 rounded-square icon (radius 12, bg `withAlpha(lime,0.14)`, border `withAlpha(lime,0.28)`), Ionicons `barbell-outline` 20 lime, marginRight 14.
   - Info (flex): `body` white bold title (1 line); `caption` secondary when-label = e.g. **"Sat, Jun 20 · 6:00 PM"** (formatted from `scheduledAt`); optional `caption` secondary notes (2 lines, marginTop 4).

### 3.3 Create-Session Modal (`Modal`, transparent, slide-up)
Overlay = `withAlpha(background.primary, 0.85)` covering screen, content pinned bottom. A glass `Card` padding `xl`20, top corners radius 24, `maxHeight 88%`:
- **Form header**: `h3` white **"New Session"** + Ionicons `close` 26 secondary (closes + resets).
- **Title** field: label `caption` secondary bold **"Title"**. Input box (row, height 52, bg `background.secondary`, border `#222838`, radius 14, padding-h 12): Ionicons `barbell-outline` 20 secondary + `TextInput` (fontSize 16, white), placeholder **"e.g. Push Day"**, maxLength 200.
- **Date** field: label **"Date"**. A `DateTimeField` (mode date, min = today) — opens the native date picker; renders the chosen date.
- **Notes (optional)** field: label **"Notes (optional)"**. A multiline box (height 96, top-aligned) `TextInput` placeholder **"Anything to remember for this session"**, maxLength 2000.
- **Link to a shift (optional)** field: label **"Link to a shift (optional)"**. A wrap of chips (gap 8), each `paddingHorizontal:14 paddingVertical:9`, radius 20 (pill), 1px border:
  - **"None"** chip (always present, default selected). Selected = bg `withAlpha(lime,0.2)`, border lime, text lime bold; unselected = bg `background.secondary`, border `#222838`, text secondary.
  - One chip per shift = label **"{TYPE} · Jun 20, 7:00 PM"** (e.g. `FIXED_NIGHT · …`), 1 line, same selected styling.
- **Submit error** (when present): `caption` red, e.g. **"Scheduling isn't available yet. Please try again later."** (503) or **"Couldn't save — check your connection and try again."**
- **Save button** (`Button` variant primary, marginTop `xl`20): disabled until a non-empty title (≤200) AND a date are set; shows loading spinner while POSTing. *(Primary Button = lime fill, ink label per design system.)*

### 3.4 Data / text
Month/year label; day numbers; activity dots; session title / when / notes; shift chip labels. Defaults: empty title placeholder, "None" default shift.

### 3.5 Interactions + navigation
Back. Prev/next month (re-render grid). Day cells are tappable (`activeOpacity` 0.7) but currently navigate nowhere (selectable today highlight only). Header `+` and the body of the modal create a session → POST `/v1/training/scheduled-sessions`; success refreshes the list + closes; errors surface inline.

### 3.6 Loading / empty / error
- **Grid**: while activity loads, the grid simply renders without dots; on error → inline `EmptyState` (replaces grid) icon `cloud-offline-outline`, title **"Couldn't load activity"**, subtitle **"We couldn't reach your training history. Check your connection and try again."**, action **"Retry"**. When history is empty (and not loading) → `EmptyState` icon `calendar-outline`, title **"No activity logged this month"**, subtitle **"Complete a workout to start filling in your training calendar."**
- **Scheduled Sessions**: error → `EmptyState` `cloud-offline-outline`, **"Couldn't load sessions"**, **"We couldn't reach your scheduled sessions. Check your connection and try again."**, action **"Retry"**. Empty → `EmptyState` `calendar-outline`, **"No sessions scheduled"**, **"Upcoming training sessions will appear here once scheduling is available."**

### 3.7 Animations
Calendar card + section `FadeInDown`; today-cell subtle pulse; session cards stagger in; modal slides up from bottom; chips press-scale 0.97.

---

## 4. Cycle — `cycle.tsx`

### 4.1 Purpose
The dedicated menstrual-cycle tracker home. **Consent/eligibility gated**: only shown to users who enabled cycle tracking AND are biologically female. Hosts (in order) the phase card, phase-foods carousel, month calendar (logged vs predicted, confidence-aware), a Log Period action, cycle history, and a wellness disclaimer. Accent for the whole screen is lime (`accent.coral` = `#A8CC3C`).

### 4.2 Top-to-bottom layout (eligible state)
1. **Header** (standard). Title **"Cycle"**. Right = empty 40-wide spacer.
2. **CyclePhaseCard** — a `GlassCard` (radius `2xl`24, subtle lime glow, inner padding 18):
   - Header row: Ionicons `ellipse-outline` 18 lime + overline secondary **"CYCLE PHASE"**.
   - `h3` white phase name (marginTop 10): **"Menstrual" / "Follicular" / "Ovulatory" / "Luteal"**, or **"Tracking on"** for UNKNOWN.
   - `body` secondary tip (marginTop 4), one of:
     - Menstrual: *"Energy may dip — be gentle with yourself and rest if you need it."*
     - Follicular: *"Energy often rises here — a good window for trying something new."*
     - Ovulatory: *"You may feel your strongest — great for higher-intensity days."*
     - Luteal: *"Wind-down phase — steady routines and good sleep can help."*
     - UNKNOWN: *"We're tracking your cycle, but there isn't enough information to estimate a phase yet. If your cycle is irregular or you use hormonal contraception, we just track — no phase estimate."*
   - **Plan-impact row** (concrete phases only; top hairline divider `#222838`, marginTop 12): Ionicons `sparkles-outline` 15 lime + overline tertiary **"YOUR PLAN TODAY"** over `caption` secondary plan text, e.g. Menstrual: *"Iron-rich foods emphasized, and training eased toward lighter, lower-impact sessions."* (Follicular/Ovulatory baseline; Luteal: *"Complex carbs emphasized and calories nudged up slightly, with training tapered toward recovery."*)
   - Footer `caption` tertiary (marginTop 10): *"This is a wellness estimate, not medical advice."*
   - *(Self-gates: renders nothing if `cyclePhase` is null.)*
3. **PhaseFoodsCard** — concrete phases only (renders nothing for null/UNKNOWN). `GlassCard` radius `2xl`24, lime glow, padding 18:
   - Header: Ionicons `nutrition-outline` 18 lime + overline secondary heading **"BEST FOODS FOR YOUR {PHASE} PHASE"**.
   - `body` secondary rationale (verbatim from backend, marginTop 8).
   - **Horizontal carousel** (no scrollbar) of food tiles, each 124 wide, radius 14, 1px `#222838` border, bg `background.secondary`, padding 10, marginRight 12: an 84-tall image (radius 10, cover; placeholder Ionicons `nutrition-outline` 28 tertiary on `background.tertiary` if no image) + `caption` white bold name (2 lines) + `caption` lime focus-nutrient text (fontSize 11), e.g. **"Iron 6.4 mg"**.
   - Footer `caption` tertiary (marginTop 10): *"General wellness guidance, not medical or dietary advice."*
4. **CycleCalendar** — `GlassCard` radius `2xl`24, faint lime glow, padding 16. Uncertainty-aware month grid:
   - Header row: `chevron-back` 22 white (prev, disabled+0.4-opacity at window edge), `h3` white **"{MonthName} {Year}"**, `chevron-forward` 22 white (next).
   - Weekday row: 7 single letters `caption` tertiary, **S M T W T F S** (Sunday-first here).
   - Grid: 7-col, each cell square; a day is a circular disc (`borderRadius:999`, 88% of cell) with the day number `caption`:
     - **Logged period** day = SOLID red `#FF4444` fill, number white.
     - **Predicted ovulation** = `withAlpha(purple,0.22)` fill + 1.5px **dotted** purple border.
     - **Predicted fertile** = `withAlpha(purple,0.12)` fill + 1.5px dotted `withAlpha(purple,0.5)` border.
     - **Phase wash** (non-logged) = faint `withAlpha(phaseColor,0.16)` bg; phase colors: Menstrual red, Follicular cyan, Ovulatory purple, Luteal amber.
   - **Low-confidence note** (when confidence LOW/NONE; role=alert): Ionicons `alert-circle-outline` 15 amber + `caption` secondary *"Low confidence — log more cycles for better predictions."*
   - **Legend** (wrap, gap 14): 14×14 dots + `caption` secondary labels — **"Logged period"** (solid red), **"Predicted fertile"** (dotted purple, only when predictions shown), **"Phase (estimate)"** (faded cyan dotted).
5. **LogPeriodCard** — `GlassCard` radius `2xl`24, padding 18:
   - Header: Ionicons `add-circle-outline` 18 lime + overline secondary **"LOG PERIOD"**.
   - **Start date** field (marginTop 14): `caption` secondary label **"Start date"** + a `DateTimeField` (mode date, max = today, with a "now/today" affordance).
   - **End date (optional)** field: label **"End date (optional)"** + `DateTimeField` (max today, min = chosen start).
   - **CTA** (`CtaButton`, marginTop 18): label **"Log Period"** with Ionicons `checkmark-circle-outline`; lime fill + ink label/icon; loading spinner while POSTing; disabled until a start date is chosen. → POST `/v1/users/me/cycle/period`, then invalidates forecast/history/status.
6. **MedicalDisclaimerBanner** (marginTop 16) — row, bg `background.secondary` `#13161F`, 1px `#222838` border, radius 10, padding 12: Ionicons `information-circle-outline` 16 secondary + `caption` secondary: *"Cycle phases and predictions are wellness estimates, not medical advice. They are not a contraceptive method or a substitute for professional care."*

### 4.3 CycleHistoryCard (rendered after LogPeriodCard) — `GlassCard` radius `2xl`24, padding 18:
- Header: Ionicons `stats-chart-outline` 18 lime + overline secondary **"CYCLE HISTORY"** + a regularity **chip** (pill, `paddingHorizontal:10 paddingVertical:4`, radius 999, bg `withAlpha(color,0.16)`, `caption`): **"Regular"** (cyan) / **"Irregular"** (amber) / **"Not enough data"** (tertiary).
- **With averages**: a stats row (gap 24) of two stats — `h2` white number over `caption` secondary label: **avg cycle (days)** (+ a `caption` tertiary **"Range 28-34 days"** when computable) and **avg period (days)** (or `—`). Then a past-cycles list, each row (top hairline border, `paddingVertical:12`, space-between): `body` white start date + `caption` secondary **"{n}d cycle · {m}d period"** (or **"current"** for the in-progress one).
- **Without averages**: `body` secondary hint: *"Log a couple of cycles and your average cycle and period length will show up here — along with how much they vary."*

### 4.4 Gated / not-enabled state
If NOT eligible (tracking off or not female): a centered `EmptyState` (icon `ellipse-outline`, title **"Cycle tracking is off"**, subtitle **"Turn on cycle tracking in your profile to estimate your phase, log periods, and see your history."**). No calendar/log/history shown.

### 4.5 Data / text
Phase name + tip + plan copy; phase-foods rationale + food name + focus nutrient amount; calendar day states; confidence note; regularity chip; avg cycle/period numbers + range; past cycle rows; disclaimers (verbatim above). On log error: native alert **"Error" / <message>**.

### 4.6 Interactions + navigation
Back. Phase-foods carousel scrolls horizontally. Calendar prev/next month (bounded to forecast window; disabled at edges). Log Period: pick start (+ optional end) → submit. All cards display-only otherwise. The Profile tab only links here when the same eligibility gate passes.

### 4.7 Loading / empty / error
- **Profile loading**: a 120-tall skeleton in `xl` padding.
- **Forecast loading**: 320-tall skeleton (marginTop 12). **Forecast error**: `EmptyState` `cloud-offline-outline`, **"Couldn't load calendar"**, **"Something went wrong loading your cycle forecast. Check your connection and try again."**, **"Try Again"**.
- **History loading**: 160-tall skeleton. **History error**: `EmptyState` `cloud-offline-outline`, **"Couldn't load history"**, **"Something went wrong loading your cycle history. Check your connection and try again."**, **"Try Again"**.
- **Phase-foods**: loading = three 120×150 skeleton tiles in a row; error = `body` secondary *"Couldn't load phase foods right now. Pull to refresh or check back later."*; empty = *"No suggestions for this phase yet."*

### 4.8 Animations
Each card `FadeInDown` staggered down the scroll; phase-foods tiles slide in from the right; calendar discs pop (spring scale); chip + CTA press-scale 0.97; Log Period CTA glow on enable.

---

## 5. Hydration Tracker — `hydration.tsx`

### 5.1 Purpose
Track daily water intake against a target via a large progress ring, quick-add preset buttons, and a floating add button.

### 5.2 Top-to-bottom layout
1. **Header** (standard). Title **"Hydration Tracker"**. Right = empty 40-wide spacer.
2. **Main Progress Circle** — a centered section (height 350, marginTop 20). A 240×240 ring wrapper:
   - An **outer glow** disc (280×280, radius 140, bg cyan `#00D4AA`, opacity 0.12) behind it.
   - `CircularProgress` size 240, strokeWidth 16, color cyan `#00D4AA`, track `#222838`, wrapped in `shadows.glow(cyan)`. Progress = `min(1, current/target)`.
   - Centered overlay: Ionicons `water` 44 cyan; big mono numeral (`statLarge`-family, fontSize 52) = `current` (ml); overline secondary (marginTop `xs`4) **"OF {target} ML"** (e.g. "OF 3000 ML").
3. **Add Liquid** section (`paddingHorizontal:20`, marginTop `2xl`24). `h3` white centered **"Add Liquid"** (marginBottom `lg`16). A centered row (gap 16) of three preset buttons, each 100 wide → a `GlassCard` (radius `xl`20, inner `paddingVertical:20`, centered): a 44×44 circle icon (radius 22, bg `withAlpha(cyan,0.14)`) with Ionicons `add` 22 cyan (marginBottom 10), then mono `statSmall`-family 22 white amount, then `caption` secondary **"ml"**. Presets: **250 · 500 · 750**.
4. **Hydration Tips** section (`paddingHorizontal:20`, marginTop `2xl`24). A `GlassCard` radius `xl`20 with a row (padding 20): Ionicons `information-circle` 24 cyan + `body` white (marginLeft 12): *"Sip water consistently throughout the day to maintain peak cognitive and physical performance."*
5. **Floating Add Button (FAB)** — absolute, bottom = `safeAreaBottom + 20`, center-aligned, 72×72, radius 36, with `shadows.glow(cyan)`. A `LinearGradient` (cyan gradient `['#00D4AA','#4FC3F7']`, TL→BR) fills it; Ionicons `water-outline` 30 white centered. Tapping logs **250 ml**.

### 5.3 Data / text
`current` ml (big), `target` ml (default 3000), preset amounts 250/500/750, the tip copy. On add error: native alert **"Error" / <message>**.

### 5.4 Interactions + navigation
Back. Tap a preset → log that amount (disabled while a log is in flight). Tap FAB → log 250 ml. Success invalidates `today-progress` (ring + number animate to new value).

### 5.5 Loading / empty / error
- No skeleton; the ring just reads `current`/`target` (0 until data arrives).
- **Error** (`todayQuery.isError`): centered `EmptyState` icon `cloud-offline-outline`, title **"Couldn't load hydration"**, subtitle **"Something went wrong fetching today's intake. Check your connection and try again."**, action **"Try Again"** → refetch. (Presets/tips/FAB hidden in this state.)

### 5.6 Animations
Ring fills 0→pct on mount and animates on each add (spring); FAB + presets press-scale 0.97; the central number can count up to `current`; subtle pulsing glow behind the ring.

---

## 6. Progress Photos — `photos.tsx`

### 6.1 Purpose
A locally-stored gallery of progress photos (camera capture), a 3-column grid, a before/after compare mode, and a full-screen lightbox with delete. Data persists on-device (AsyncStorage + FileSystem) — no backend.

### 6.2 Top-to-bottom layout
1. **Header** (standard). Title **"Progress Photos"**. Right: 40×40 circle **accent-tinted** (bg `withAlpha(purple,0.14)`, border `withAlpha(purple,0.3)`), Ionicons `add` 24 purple `#7C4DFF` → launches camera capture.
2. **Compare toggle bar** (only when ≥2 photos) — margin 20, padding 18, row, radius `xl`20, 1px border: Ionicons `git-compare` 20 + `subhead` bold (marginLeft 10). Inactive = bg `background.secondary`, border `#222838`, text white, label **"Compare Progress (Before/After)"**. Active = bg `withAlpha(purple,0.16)`, border `withAlpha(purple,0.4)`, icon+text purple, label **"Exit Compare Mode"**.
3. **Compare row** (only when comparing & ≥2 photos) — `paddingHorizontal:20`, gap 12, marginBottom 30. Two equal columns:
   - **BEFORE ({date})** overline secondary label, then a 3:4 image container (bg `background.tertiary`, radius `xl`20) with the image (cover) and a 36×36 round swap button bottom-right (bg `rgba(0,0,0,0.5)`, Ionicons `swap-horizontal` 20 white) that cycles which photo is shown.
   - **AFTER ({date})** — same, independent swap.
4. **Grid** — `paddingHorizontal:16`, wrap, gap 8. Each tile = `(screenWidth-48)/3` wide, aspect 3:4, radius `lg`14, bg `background.tertiary`: the photo (cover) + a bottom **date overlay** bar (bg `rgba(0,0,0,0.4)`, padding 4) with centered `fontSize 10` bold white date (`YYYY-MM-DD`). Tap → lightbox.
5. **Lightbox Modal** (`Modal`, transparent, fade) — full bg `rgba(0,0,0,0.95)`, centered:
   - Close button top-right (top 50, right 20): Ionicons `close` 32 white.
   - The image (width = screen, height 70%, contain).
   - Footer bar (absolute bottom 50, `paddingHorizontal:40`, space-between): `h3` white date on the left; a 50×50 round delete button (bg `rgba(255,255,255,0.1)`) with Ionicons `trash-outline` 24 red `#FF4444`.

### 6.3 Data / text
Per-photo `date` (`YYYY-MM-DD`) shown on tiles, compare labels, and lightbox footer. Permission denied alert: **"Permission Denied" / "We need camera permissions to take progress photos."** Save-fail alert: **"Error" / "Failed to save photo locally."** Delete confirm alert: **"Delete Photo" / "Are you sure you want to delete this progress photo?"** with **Cancel** / **Delete** (destructive).

### 6.4 Interactions + navigation
Back. Header `+` → request camera permission → launch camera (editing on, 3:4 aspect, quality 0.8) → save locally + prepend to grid. Toggle compare. Swap before/after photos independently. Tap a tile → lightbox. In lightbox: close, or delete (confirm → removes file + metadata, closes lightbox if it was the open photo).

### 6.5 Loading / empty / error
- **Loading** (initial metadata read): header (static, non-interactive) + a 3-col grid of 6 skeleton tiles, each `(screenWidth-48)/3` wide × that×4/3 tall, radius `lg`14.
- **Empty** (no photos): `EmptyState` (marginTop 80) icon `camera-outline`, title **"No Photos Yet"**, subtitle **"Visual progress is one of the best motivators. Take your first photo today!"**, action **"Take Photo"** → camera.
- No network-error state (local-only).

### 6.6 Animations
Grid tiles `FadeInDown` staggered; compare bar slide/scale toggle; tile press-scale 0.97; lightbox fades in, image can scale-up slightly on open.

---

## 7. AI Performance Reports — `reports.tsx`

### 7.1 Purpose
Browse AI-generated weekly performance audits: a horizontal tab strip of past weeks, a selected report with a score banner, summary, highlights, areas to improve, and next-week focus. A header sparkle action generates a new audit.

### 7.2 Top-to-bottom layout
1. **Header** (standard). Title **"AI Performance Reports"**. Right: 40×40 circle **purple-tinted** (bg `withAlpha(purple,0.14)`, border `withAlpha(purple,0.3)`), Ionicons `sparkles` 22 purple `#7C4DFF` (→ generate). While generating, the icon is replaced by a small purple `ActivityIndicator`.
2. **History tab strip** (height 80, 1px bottom border `#222838`) — a horizontal `FlatList` (no scrollbar, `paddingHorizontal:20`). Each tab = `paddingHorizontal:16 paddingVertical:10`, marginRight 10, minWidth 100, radius `lg`14, 1px border: `captionMedium` week-range label over `caption` (fontSize 10) date. **Selected** = bg `withAlpha(purple,0.16)`, border `withAlpha(purple,0.5)`, label purple, plus `shadows.glow(purple)`. Unselected = bg `background.secondary`, border `#222838`, secondary text.
3. **Audit outcome banner** (after a generate run, when not pending) — a `GlassCard` (marginHorizontal 20, marginTop 16, inner padding 16) with a colored glow (emerald on success, red on error):
   - Row: Ionicons `checkmark-circle` 20 emerald (success) / `alert-circle` 20 red (error) + a column: `subhead` white bold title **"Audit ready"** / **"Generation failed"** over `caption` secondary **"New weekly audit generated!"** / **"Failed to generate audit. Try again later."**
   - On error: a pill **Retry** button (self-start, radius 999, 1px red border): Ionicons `refresh` 16 red + `caption` red bold **"Try Again"** → re-run generate.
4. **Report body** (`ScrollView`, padding `xl`20) for the active report:
   - **Score Banner** — `GlassCard` (marginBottom 20) with a `LinearGradient` inner (`[withAlpha(scoreColor,0.18) → transparent]`, padding 24, row space-between): left column overline secondary **"Weekly Performance"** + `h2` white **weekRange** (e.g. "Jun 9 – Jun 15"); right = a 64×64 round score badge (radius 32, bg `withAlpha(scoreColor,0.16)`, 1px `withAlpha(scoreColor,0.4)` border) with a mono `statSmall`-family 26 numeral = score. `scoreColor`: ≥80 emerald `#10B981`; ≥60 amber `#FFB300`; else red `#FF4444`.
   - **Summary** — a block (padding 20, marginBottom 24, bg `withAlpha(purple,0.08)`, 1px `withAlpha(purple,0.2)` border, radius `xl`20): `body` white italic in quotes — `"{summary}"`.
   - **Highlights** (hidden if none): section-title row Ionicons `trending-up` 18 emerald + `subhead` bold white **"Highlights"**; then bullets — Ionicons `checkmark-circle` 16 emerald + `body` secondary text (one per highlight).
   - **Areas to Improve** (hidden if none; marginTop 24): row Ionicons `alert-circle` 18 amber + `subhead` bold white **"Areas to Improve"**; bullets — Ionicons `flash` 16 amber + `body` secondary.
   - **Next Week's Focus** (when present; marginTop 30) — a card (padding 20, bg `withAlpha(cyan,0.1)`, 1px `withAlpha(cyan,0.3)` border, radius `xl`20): `subhead` cyan extra-bold **"Next Week's Focus"** + `body` white focus text.

### 7.3 Data / text
Tab week-ranges + dates; score 0–100 (non-finite → 0); weekRange; summary; highlights[]; improvements[]; focusArea. Banner copy verbatim above.

### 7.4 Interactions + navigation
Back. Header sparkle → POST generate weekly audit (disabled while pending); on success refreshes list + shows success banner; on error shows error banner with Retry. Tap a history tab → select that report. Empty-state CTA + banner Retry also trigger generate.

### 7.5 Loading / empty / error
- **Loading** (whole screen): header with static back + sparkle; an 80-tall tab strip with three 100×48 skeleton tabs; body = `SkeletonCard` 108 + `SkeletonCard` 88 + a 140×20 skeleton title + three full-width 16-tall skeleton lines + a `SkeletonCard` 96.
- **Error** (whole screen): header (interactive back, empty right spacer) + centered `EmptyState` icon `cloud-offline-outline`, title **"Couldn't load reports"**, subtitle **"Something went wrong fetching your performance audits. Check your connection and try again."**, action **"Try Again"** → refetch.
- **Empty** (no reports): centered `EmptyState` icon `analytics-outline`, title **"No Reports Yet"**, subtitle **"Generate your first AI performance audit to get deep insights on your adherence and progress."**, plus a primary `Button` **"Generate First Audit"** (minWidth 220), with the outcome banner mounted below it.

### 7.6 Animations
Tab strip slides/scrolls horizontally; selected tab glow; report sections `FadeInDown` staggered (banner → summary → highlights → improvements → focus); score badge numeral counts up; bullets stagger in; banner fades in; press-scale 0.97 on tabs/buttons.

---

## Shared component reference (for consistency across the section)

- **GlassCard** — dark-glass surface, no internal padding (the screen supplies it via an inner `View`). Props: `radius`, optional `glow` (colored shadow), `style`. Border 1px `#222838`.
- **Card variant="glass"** — legacy glass card; `padding` prop maps to spacing tokens (`lg`16/`xl`20/`2xl`24).
- **CircularProgress** — SVG ring; props `progress` (0–1), `size`, `strokeWidth`, `color`, `trackColor`.
- **EmptyState** — centered icon (Ionicons, large, muted) + title (`h3`-ish white) + subtitle (`body` secondary) + optional primary action button (`actionLabel` + `onAction`).
- **Skeleton / SkeletonCard** — shimmering placeholders; props `width`, `height`, `radius`, `style`.
- **CtaButton** — lime fill, ink label + icon, loading + disabled states (used by Log Period).
- **Button variant="primary"** — primary action button (lime per design system), `loading`/`disabled`.
- **DateTimeField** — labeled control that opens the native date picker; supports `minimumDate`/`maximumDate` and a "now/today" affordance.

> Rendering note for GPT: every screen is a **dark, full-bleed `#0A0C12`** frame with the standard header. Use lime `#A8CC3C` as the primary accent except where a screen is intentionally themed otherwise (Body Metrics + AI Reports = purple `#7C4DFF`; Hydration = cyan `#00D4AA`; Cycle = lime with red/purple/amber/cyan phase coding). Numerals are JetBrains-Mono; everything else Inter. Keep glows subtle, borders hairline, corners 14–24, and layer the Reanimated `FadeInDown` + press-scale 0.97 motion described per screen.
