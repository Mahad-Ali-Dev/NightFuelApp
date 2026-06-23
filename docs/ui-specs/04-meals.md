# Zeitra — UI Mockup Spec 04: Meals & Nutrition

> Paste this whole file into GPT (or hand to a designer) to render every screen in this section pixel-accurately. Each screen section is self-contained and exhaustive. Every value below was read from the real `clients/mobile/app/(meals)/*.tsx` source — nothing invented.

---

## ZEITRA DESIGN SYSTEM (condensed — applies to EVERY mockup)

**Brand:** Athletic, premium, high-contrast, energetic. Tagline "STRONG TODAY. BETTER EVERYDAY." Logo = lime "Z" + dumbbell on black.

**Colors (exact tokens used in code — note: the token literally named `accent.coral` resolves to softened LIME `#A8CC3C`, this is the PRIMARY brand color in this codebase):**
- Backgrounds: `background.primary #0A0C12` (deep near-black, app canvas) · `background.secondary #13161F` (card surface) · `background.tertiary #1B2030` (elevated surface / track color) · `background.quaternary #242B3D`.
- Borders (1px glass hairlines): `border.default #222838` · `border.light #2F3650` · `border.focus #A8CC3C`.
- **PRIMARY = lime** `accent.coral #A8CC3C` (CTAs, brand, active states, calorie accent) · `coralLight #C5E06B` · `coralDark/pink #93B82E` (CTA gradient end).
- Functional accents: `cyan #00D4AA` (success / progress / fasting / carbs) · `purple #7C4DFF` (AI / Ria / coach) · `amber #FFB300` (caution / fat / ratings) · `red #FF4444` (danger / high-protein tag) · `emerald #10B981` (positive / active / protein / grocery checks) · `blue #4FC3F7`.
- Text: `text.primary #FFFFFF` · `text.secondary #9BA3B4` (muted) · `text.tertiary #7B8497` (faint) · `text.inverse #0A0C12` (ink, used on lime fills).
- Gradients: `gradients.coral = ['#A8CC3C','#93B82E']` (lime→deep-lime brand) · `gradients.cyan = ['#00D4AA','#4FC3F7']` · `gradients.purple = ['#7C4DFF','#B47CFF']`.

**CTAs (`CtaButton` primitive):** LIME fill (`gradients.coral`) with **INK `#0A0C12` text + icons** — NEVER white on lime. Bold, rounded radius 12–14 (large pill CTAs use radius 28–30 / height 56–60), subtle (not neon) lime glow. Sizes `sm`/`lg`. Props: `label`, `icon` (Ionicon), `size`, `loading` (spinner), `disabled` (dimmed), `onPress`. (In a few legacy spots an in-card chip uses white text on emerald/cyan — those are selection chips, not primary CTAs; noted per-screen.)

**Cards (`GlassCard` primitive):** dark-glass surface (`background.secondary` w/ subtle blur), radius 14–24, 1px `border.default` hairline, generous padding. Optional `glow={color}` prop adds a soft colored shadow.

**Typography scale (named styles used in code):** `display`/`h1` (28–34px, weight 900, display numerals & screen titles) · `h2` (~24px bold) · `h3` (~20px bold) · `subhead` (15px, often bold) · `body` (14–15px) · `caption` (12–13px) · `overline` (10–11px, letter-spacing ~1–1.5px, UPPERCASE, muted) · `statLarge`/`statMedium`/`statSmall`/`statTiny` (big bold numerals for stats). Macro stat numerals are colored by macro.

**Layout:** 4px grid spacing (2/4/8/12/16/20/24/32/40). Overline section headers. GRID layouts (2-col cards). Horizontal snapping CAROUSELS for collections (days, meal types, filter chips). Pill/chip filters. Circular progress RINGS. Stat cards. Custom header at top (back button + title), absolute footer CTA on form screens. Radius scale: `sm 4 · md 10 · lg 14 · xl 20 · 2xl 24 · 3xl 28 · full 9999`.

**Motion (premium):** Reanimated entrance animations — `FadeInDown` with staggered per-section delays (e.g. `.delay(60)`, `.delay(120 + idx*60)`), `.springify().damping(18)` card reveals, animated progress rings/bars, pressed-scale `0.97` on cards/CTAs (`activeOpacity 0.85`). Modals use native `animationType="slide"` from the bottom. Images use `expo-image` with `transition={200}` cross-fade + `cachePolicy="memory-disk"`.

**Shared `EmptyState` component (used on every screen):** vertically centered block — a 96×96 circle filled `accent.coral @12%` alpha with a 1px `accent.coral @24%` border holding a 40px lime Ionicon, then an `h3` white title (centered), a `body` secondary subtitle (centered, max-width 280), and an optional LIME primary `Button` ("Try Again" / "Retry" / "Add Item" / etc.). Generous vertical padding (40px).

**Shared header pattern (all 7 screens):** Row at top, `paddingTop = safe-area-top + 16–20`, `paddingBottom 16`, 1px bottom border `border.default`. Left = 40×40 back button (rounded 12, `background.secondary` fill, 1px border, `arrow-back` 22px white icon) with generous hitSlop. Center = screen title. Right = either a 40px spacer (to center the title) or an action icon. Status bar is light (white) on the near-black canvas.

**Bottom tab bar (present app-wide; these (meals) screens are pushed routes ABOVE the tab bar — render the tab bar in mockups for app context, with NO tab active/highlighted since these are stack screens over the Fuel tab):** Home · Train · Fuel · Circadian · More. Active tab = lime icon + lime label; inactive = muted `text.tertiary`. Dark `background.secondary` bar with a top hairline border. (For these meal screens, the user reached them from the **Fuel** tab, so if you show an active state, Fuel is the origin.)

---

# SCREEN 1 — Food Encyclopedia (`encyclopedia.tsx`)

### 1. Purpose
Searchable food database / nutrition reference. Browse foods by category or search by name, view full nutrition facts (macros, fiber/sugar, micronutrients) in a bottom-sheet, set servings + meal type, and log the food as a meal. Includes a barcode-scanner shortcut.

### 2. Top-to-bottom layout
1. **Header row** (search-integrated): 
   - Left: `arrow-back` icon (24px, `text.primary`) — bare icon, NOT in a boxed button here (only generous hitSlop).
   - Center (flex:1): **Search box** — pill, `background.secondary` fill, 1px `border.default`, radius 12, height 44, horizontal padding 12, gap 8. Contains: `search` icon 16px (`text.tertiary`), a `TextInput` (15px, white text), and — only when text is present — a `close-circle` clear icon 16px (`text.tertiary`).
   - Right: `barcode-outline` icon (24px, **lime `accent.coral`**) — opens the barcode scanner modal.
2. **Body — two mutually exclusive modes:**

   **MODE A — Browse (default; shown when query < 3 chars AND no category selected):**
   - ScrollView, padding 20, paddingBottom 100.
   - `h2` title: **"Browse by Category"** (white, marginBottom 16).
   - **2-column category GRID** (`catGrid`, wrap, gap 12). 6 tiles, each `catCard`: width 47%, height 104, radius 20, 1px border, `shadows.md`, overflow hidden, content bottom-aligned, padding 12. Each tile = a full-bleed bundled food image (`food-fallback.png`, cover) + a bottom-up black gradient overlay (`transparent → rgba(0,0,0,0.82)`) + a small vertical category-color **accent bar** (`catBar`: 3px wide × 18 tall, radius 2) + the category label (`subhead`, white, bold, 13px).
     - Tiles & their accent-bar colors: **Fruits** (`#F59E0B` amber-orange), **Vegetables** (`#2ECC71` green), **Proteins** (`#EF4444` red), **Dairy** (`#00D4FF` cyan), **Grains** (`#A855F7` purple), **Snacks** (`#A8CC3C` lime).

   **MODE B — Results (shown when query ≥ 3 chars OR a category is selected):**
   - If a category is selected: a **filter bar** (`filterBar`, padding-h 20, padding-v 12, 1px bottom border) holding one **active filter chip** — LIME fill (`accent.coral`), radius 20, with a white `close` icon (12px) + the category label in white bold `caption`. Tapping it clears the filter.
   - **Results list** = `FlatList` of food cards, padding 20, paddingBottom 100. Each **food card** (`foodCard`): row, `background.secondary` fill, 1px border, radius 14, padding 16, marginBottom 12. Left (flex:1): food **name** (`subhead`, white, bold); a `caption` sub-line "`{foodGroup||'General'} • {servingSize}`" (`text.secondary`); then a macro row (gap 12, marginTop 6) of 3 mini-chips — a 6×6 colored dot + label: **P** (emerald dot) `P: {protein}g`, **C** (cyan dot) `C: {carbs}g`, **F** (amber dot) `F: {fat}g`, each 10px caption. Right (flex-end): big **calorie number** (`statSmall`, **lime `accent.coral`**, 20px) over an overline "**KCAL**" (9px, letter-spacing 1, `text.secondary`).

3. **Serving / Log bottom-sheet `Modal`** (slides up; transparent backdrop `rgba(0,0,0,0.8)`; sheet anchored bottom, height 85%, radius top-corners 28, padding 24, `background.primary` fill):
   - Top row: `h3` title **"Add to Plate"** + a 36×36 round close button (`background.secondary`, 1px border, `close` 20px white).
   - Scrollable content:
     - `h1` food name (white).
     - `body` sub: "`{servingSize} per serving`" (`text.secondary`, marginBottom 20).
     - **Food image** (only if `imageUrl` present): full-width 180-tall image radius 16; below it the required CC-BY-SA `imageAttribution` text (`caption`, `text.tertiary`, 11px) if present.
     - Overline "**HOW MANY SERVINGS?**" → numeric `TextInput` (`numInput`: height 56, padding-h 16, font 20 bold, `background.secondary`, 1px border, radius 14), default value "1".
     - Overline "**MEAL TYPE**" → 4 wrapping selection chips (`typeBtn`: flex, min-width 45%, height 44, radius 22, 1px border): **BREAKFAST · LUNCH · DINNER · SNACK**. Active chip = **emerald `#10B981` fill + emerald glow + white bold text**; inactive = `background.secondary` fill, `border.default`, `text.secondary` text.
     - **Nutrition Summary** `GlassCard` (radius 14, inner padding 20): `subhead` bold "Nutrition Summary" + a 4-up row of macro stats (each a colored `statSmall` 18px value over an overline unit): **Calories** (lime, "kcal") · **Protein** (emerald, "g") · **Carbs** (cyan, "g") · **Fat** (amber, "g") — all multiplied by the serving qty. If `fiber`/`sugar` present: a hairline-topped secondary row showing "Fiber {n}g" and/or "Sugar {n}g" (caption labels secondary, values white bold), scaled by qty.
     - **Micronutrients** `GlassCard` (only if any micros present; radius 14, inner padding 20): `subhead` bold "Micronutrients" + `caption` "Per 100g" (`text.tertiary`) + one hairline-separated row per present micro: label (`body`, secondary) on the left, formatted amount+unit (`body`, white bold) on the right. Amounts are per-100g reference values (NOT serving-scaled).
     - **CTA** `CtaButton` "**LOG MEAL**", size lg, height 60 radius 30, lime fill / ink text, marginTop 24, shows spinner while logging.

### 3. Data / text shown
- Placeholder: "Search food encyclopedia…". Browse title: "Browse by Category". Category labels: Fruits, Vegetables, Proteins, Dairy, Grains, Snacks. Per food: name, foodGroup (fallback "General"), servingSize, P/C/F grams (rounded), calories (rounded). Modal: "Add to Plate", "{servingSize} per serving", "HOW MANY SERVINGS?", "MEAL TYPE", BREAKFAST/LUNCH/DINNER/SNACK, "Nutrition Summary", units kcal/g, "Micronutrients", "Per 100g", "LOG MEAL".
- Empty (search active, no results): title "No results found", subtitle "Nothing matched that search. Try a different food name or browse by category." 
- Empty (search idle): title "Start your search", subtitle "Type a food name above or pick a category to explore nutrition facts." (icon `nutrition-outline`).

### 4. Interactions + navigation
- Type ≥3 chars → triggers `searchFoods` query (also fires if a category is selected). Clear (✕) resets query.
- Tap `barcode-outline` → push `/(modals)/barcode-scanner`.
- Tap a category tile → sets that food-group filter (switches to results mode).
- Tap the active filter chip → clears the filter (back to browse).
- Tap a food card → opens the serving/log bottom-sheet for that food.
- In sheet: edit qty, pick meal type, tap **LOG MEAL** → calls `logMeal`, then on success closes sheet, invalidates both calorie rings, and pushes `/(tabs)/nutrition`. On error → Alert "Error" with the server message.

### 5. Loading / empty / error states
- **Loading (results mode):** 5 stacked `Skeleton` blocks, 100% wide × 92 tall, radius lg (14), 12 gap. (Browse mode has no skeletons.)
- **Error (results mode):** `EmptyState` icon `cloud-offline-outline`, title "Couldn't load foods", subtitle "Something went wrong searching the food encyclopedia. Check your connection and try again.", action "Try Again" → refetch.
- **Empty:** see §3.

### 6. Exact Zeitra styling
- Canvas `background.primary`. Header bottom hairline `border.default`. Search/filter pill radius 12/20. Food cards radius 14, `background.secondary`, 1px border. Calorie numerals lime; macro dots emerald/cyan/amber. Modal sheet radius-top 28. Selection chips emerald-active. CTA lime/ink radius 30.

### 7. Animations
- Modal slides up (native slide). Images cross-fade in (`transition 200`). Cards use `activeOpacity 0.85` press feedback. (No `FadeInDown` stagger on this screen — keep it crisp.)

---

# SCREEN 2 — Fasting (`fasting.tsx`)

### 1. Purpose
Intermittent-fasting timer. Pick a protocol, start a fast, watch a live circular timer count up toward the target, then end/complete the fast. Includes target/ends-at info cards and a coach tip from "Ria".

### 2. Top-to-bottom layout
1. **Header** (standard 3-col): boxed back button · centered `h2` "**Fasting**" · 40px spacer.
2. **Body** (ScrollView, padding 20, center-aligned, paddingBottom 100):
   - **Timer circle** (`timerContainer`, marginTop 40): a `CircularProgress` ring, size = 75% of screen width, strokeWidth 20, **cyan `#00D4AA`** progress over a `background.tertiary` track. When a fast is ACTIVE the whole container gets a **cyan glow** shadow. Centered inside (`timerCenter`, absolute):
     - Overline: "**ELAPSED TIME**" (active) or "**READY TO START**" (idle), `text.secondary`.
     - `statLarge` time `HH:MM:SS` (white) — live ticking when active, else "00:00:00".
     - When active: overline "**{n}% COMPLETE**" in **cyan**.
   - **Info cards row** (`infoRow`, gap 16, marginTop 40, 2 equal cards):
     - **Target** `GlassCard` (radius xl=20, inner padding 16, centered): overline "Target" + `statSmall` "`{targetHours||selectedHours}h`".
     - **Ends At** `GlassCard`: overline "Ends At" + `statSmall` "`HH:mm`" (computed from start + target; "--:--" if no active fast).
   - **Protocol selection** (only when NO active fast; width 100%, marginTop 32): overline "**SELECT PROTOCOL**" (marginBottom 12) + a wrapping grid (`protocolGrid`, gap 10) of 4 buttons (`protocolBtn`: flex, height 60, radius 16, 1px border, min-width 45%): **16:8 · 18:6 · 20:4 · 24h**. Active = **cyan `#00D4AA` fill + cyan glow + ink (`background.primary`) bold label**; inactive = `background.secondary`, `border.default`, white label.
   - **Action button** (width 100%, marginTop 40, height 60):
     - Active fast → `Button` variant **outline**, title "**END FAST EARLY**" (or "**COMPLETE FAST**" once elapsed ≥ target).
     - No active fast → `CtaButton` size lg "**START FASTING**" (lime fill / ink text).
   - **Tips card** (`tipsCard`, marginTop 40, padding 20): tinted **cyan @8%** background, 1px cyan @40% border, radius default. Header row: `bulb-outline` 20px cyan + `subhead` bold cyan "**Ria's Fasting Tip**". Body (`body`, `text.secondary`, marginTop 8): "Drinking water or black coffee won't break your metabolic fast. Stay hydrated to maintain mental clarity during the final hours."

### 3. Data / text shown
- "Fasting", "ELAPSED TIME"/"READY TO START", HH:MM:SS, "{n}% COMPLETE", "Target", "{h}h", "Ends At", "HH:mm"/"--:--", "SELECT PROTOCOL", protocol labels 16:8/18:6/20:4/24h, button titles START FASTING / END FAST EARLY / COMPLETE FAST, "Ria's Fasting Tip" + tip body.
- Default selected protocol = 16:8 (16h). Timer formats with zero-padded H/M/S.

### 4. Interactions + navigation
- Back → `router.back()`.
- Tap a protocol → sets `selectedHours`.
- **START FASTING** → `startFasting(selectedHours)`; on success invalidates `fasting-logs`; on error Alert.
- **END FAST EARLY / COMPLETE FAST** → `endFasting()`; same success/error handling.
- A 1-second interval recomputes elapsed seconds while a fast is active.

### 5. Loading / empty / error states
- **Loading:** centered skeletons — a big circle (75%w square, radius full, marginTop 40), a 2-up info row (48%×76, radius xl), a 100%×60 bar (marginTop 40), and a 100%×110 block (marginTop 40).
- **Error:** `EmptyState` icon `cloud-offline-outline`, title "Couldn't load fasting", subtitle "Something went wrong loading your fasting status. Check your connection and try again.", action "Try Again" → refetch.
- No dedicated "empty" — idle state IS the ready-to-start timer.

### 6. Exact Zeitra styling
- Fasting is the **cyan** screen: ring, active protocol, %-complete, tip card all cyan `#00D4AA`. Track = `background.tertiary`. Info cards = GlassCard radius 20. Protocol active-fill cyan with ink label. Primary CTA lime; the end-fast control is an outline button (de-emphasized, destructive-ish).

### 7. Animations
- Live ticking timer (1s interval) and animated ring fill. Active-fast cyan glow. Press feedback on protocol buttons. (No FadeInDown.)

---

# SCREEN 3 — Grocery List (`grocery.tsx`)

### 1. Purpose
Combined shopping list = locally-stored custom items (AsyncStorage, grouped by category, checkable, removable) + read-only "Weekly Plan Items" from the active nutrition plan (backend). Add items via a bottom-sheet, check them off, clear checked, and share the list.

### 2. Top-to-bottom layout
1. **Header** (standard): boxed back button · `h2` "**Grocery List**" · **right action icon that swaps**: if any items are checked → `trash-outline` 22px **coral-ish red `#FF6B6B`** (clear checked); else → `share-outline` 24px white (share list).
2. **Body** (flex:1):
   - **Summary bar** `GlassCard` (radius 14, marginBottom 20, inner padding 14): row — left: `basket` icon 20px **emerald** + `body` bold "`{N} items`"; right (only if any checked): `caption` **emerald** "`{n} done`".
   - **Custom items, grouped by category** — for each category: an **overline** header in **emerald** (`{CATEGORY}`, uppercase) + an `itemStack` (rounded xl=20, `background.secondary`, 1px border, overflow hidden) of rows. Each **item row** (`itemRow`: row, padding 16, hairline bottom-divider except last): a checkbox icon (`checkbox` filled emerald when checked / `square-outline` tertiary when not, 24px) + a body block (item **name**, strike-through + tertiary color when checked; `caption` "Qty: {quantity}" secondary) + a trailing `close-circle-outline` 20px (`text.tertiary`) remove button.
   - **Weekly Plan Items** (backend, only if present): overline "**WEEKLY PLAN ITEMS**" (`text.secondary`) + an `itemStack` of rows identical in layout, but read-only-ish: checkbox toggles a local checked state only; body shows name (+ strike-through when checked) and, if present, a `caption` "{amount} {unit}". No remove button on plan rows.
3. **Floating Action Button** (`fab`): bottom 30 / right 20, 64×64 circle, lime **coral glow**, containing a **lime `gradients.coral` LinearGradient** with a white `add` icon 32px. Opens the Add-Item sheet. (Note: this FAB uses a white "+" on the lime gradient — it's an icon-only FAB, the one sanctioned exception to the ink-on-lime rule for the "+".)
4. **Add Item `Modal`** (slide up, backdrop `rgba(0,0,0,0.5)`, KeyboardAvoiding): a `GlassCard` (radius 24, bottom corners squared) anchored bottom, inner padding 24:
   - Header row: `h3` "**Add Grocery Item**" + 36×36 round close button (`background.tertiary`, 1px border, `close` 20px secondary).
   - Overline "**ITEM NAME \***" → `TextInput` (radius 14, height 48, `background.primary` fill, 1px border, 15px), placeholder "e.g. Chicken Breast, Milk, Rice…", autofocus.
   - Overline "**QUANTITY**" → `TextInput` (same style), placeholder "e.g. 2 kg, 1 pack, 500g…".
   - Overline "**CATEGORY**" → horizontal scroll of **category chips** (`categoryChip`: padding-h 14, padding-v 8, radius 20, 1px border, gap 8). Selected = **emerald fill + emerald border + white bold**; unselected = `background.primary` fill, `border.default`, secondary text. Categories: **Fruits & Vegetables · Dairy & Eggs · Meat & Seafood · Grains & Bread · Snacks & Beverages · Pantry Staples · Other** (default "Other").
   - **CTA** `CtaButton` "**ADD TO LIST**" with `add-circle` icon, size lg, height 56 radius 28 (lime/ink).

### 3. Data / text shown
- "Grocery List", "{N} items", "{n} done", category names (uppercased), "Qty: {quantity}", "WEEKLY PLAN ITEMS", "{amount} {unit}". Modal: "Add Grocery Item", "ITEM NAME *", "QUANTITY", "CATEGORY", placeholders above, "ADD TO LIST". Share text starts "🛒 Grocery List — Zeitra".
- Alerts: "Missing Name" / "Please enter a grocery item name."; "Remove Item" / "Remove this item from your grocery list?" (Cancel / Remove-destructive); "Clear Checked" / "Remove all checked items from your list?" (Cancel / Clear-destructive).

### 4. Interactions + navigation
- Back → `router.back()`. Header right → clears checked (if any) else shares.
- Tap a custom row → toggle checked (persists to AsyncStorage). Long-press a custom row OR tap its ✕ → confirm remove.
- Tap a plan row → toggles its local checked state (not persisted, no backend write).
- FAB or empty-state action → open Add sheet. In sheet: type name (required) + qty + pick category → **ADD TO LIST** prepends the item and persists. Backdrop tap closes; inner tap is swallowed.

### 5. Loading / empty / error states
- **Loading:** a 100%×50 skeleton (radius lg) + two category sections each = a 140×12 label skeleton + a 100%×170 block (radius xl).
- **Empty (no active plan, status 400, no custom items):** `EmptyState` icon `cart-outline`, title "No grocery list yet", subtitle "Generate a nutrition plan first and your weekly grocery items will show up here.", action "Add Item" → open sheet.
- **Error (other failure, no items):** `EmptyState` icon `cloud-offline-outline`, title "Couldn't load your list", subtitle "Something went wrong fetching your grocery items. Check your connection and try again.", action "Try Again" → refetch.
- **Empty (no items, no error):** `EmptyState` icon `cart-outline`, title "List is empty", subtitle "Add your weekly grocery items and check them off as you shop.", action "Add Item".

### 6. Exact Zeitra styling
- Grocery is the **emerald** screen: section headers, checked checkboxes, summary basket icon, selected category chips all emerald `#10B981`. FAB = lime gradient with coral glow. Item stacks `background.secondary` radius 20. Modal GlassCard radius 24. Primary CTA lime/ink.

### 7. Animations
- Modal slides up. Press feedback `activeOpacity 0.85` on rows/chips. FAB lime glow. (No FadeInDown.)

---

# SCREEN 4 — Log Meal (`log-meal.tsx`)

### 1. Purpose
Free-form meal builder. Pick a meal type, search the food DB, add items to a "plate", adjust per-item quantity, see live macro totals, and log the whole plate at once. Can be pre-filled by a `foodId`, `recipeId`, `preset`, or barcode-scanner params.

### 2. Top-to-bottom layout
1. **Header** (standard): boxed back button · `h2` "**Log Meal**" · 40px spacer.
2. **Body** (ScrollView, paddingBottom 120, keyboard-persist taps):
   - Overline "**SELECT MEAL TYPE**" (padding-h 20, marginTop 24).
   - **Meal-type carousel** (horizontal scroll, padding-h 20, gap 12, marginBottom 24): 4 image **meal cards** (`mealCard`: 88×96, radius 14, overflow hidden, bottom-aligned, padding 10, 1px transparent border). Each = full-bleed bundled meal photo (cover) + a bottom black gradient (`rgba(0,0,0,0.05) → rgba(0,0,0,0.75)`) + the label `caption` white bold 11px UPPERCASE. Selected card gets a **2px colored border** in its meal color + a small check badge top-right (20px circle in the meal color, white `checkmark` 12px). Cards & colors: **BREAKFAST** (`#F59E0B`), **LUNCH** (`#2ECC71`), **DINNER** (`#A855F7`), **SNACK** (`#00D4FF`).
   - Overline "**ADD FOOD**" (padding-h 20).
   - **Search** `GlassCard` (radius 14, margin-h 20): inner search box (row, padding-h 14, height 48, gap 8): `search` icon 18px tertiary + `TextInput` 15px white (placeholder "Search food…") + clear ✕ when text present.
   - **Search results** (when query >2 & results): up to 6 rows (`searchResult`: row, `background.secondary`, 1px border, radius 12, padding 14): name (`subhead` bold white) + `caption` "{kcal} kcal per serving" secondary, with a trailing **lime `add-circle`** 24px. Tapping a result adds it to the plate (dedup by name) and clears the search.
   - **Your Plate** (when plate non-empty): a header row — `h3` "Your Plate" + `caption` "{n} item(s)" secondary. Then per item a **plate row** (`plateRow`: row, `background.secondary`, 1px border, radius 14, padding 12, overflow hidden): a 4px vertical **accent stripe** in the meal color + a body block (name `subhead` bold, 1-line; `caption` "{kcal} kcal • P:{protein}g") + a **qty stepper** (`remove-circle-outline` tertiary, "{qty}x" bold, `add-circle-outline` **lime**) stepping by 0.5 (floored at 0.5) + a trailing **lime `trash-outline`** 18px delete.
   - **Macro totals** `GlassCard` (radius 14, marginTop 10, marginBottom 24): a 4-up row of colored `statSmall` 20px numerals over overline labels: **KCAL** (lime) · **PROTEIN** (emerald) · **CARBS** (cyan) · **FAT** (amber) — live totals.
3. **Footer** (absolute, bottom, padding-h 20, padding-bottom = max(safe-bottom, 20)): `CtaButton` "**LOG MEAL**" with `checkmark-circle` icon, size lg, height 60 radius 30 (lime/ink), **disabled when plate empty**, spinner while logging.

### 3. Data / text shown
- "Log Meal", "SELECT MEAL TYPE", meal labels (uppercased), "ADD FOOD", placeholder "Search food…", "{kcal} kcal per serving", "Your Plate", "{n} item(s)", "{kcal} kcal • P:{protein}g", "{qty}x", macro labels KCAL/PROTEIN/CARBS/FAT, "LOG MEAL".
- Default meal type = BREAKFAST. Search fires at >2 chars. Quantity math guards against NaN/non-positive values (corrupt qty contributes 0).

### 4. Interactions + navigation
- Back → `router.back()`. Tap meal-type card → set meal type. Search → results; tap `add-circle` → add to plate. Qty −/+ steppers (0.5 step). Trash → remove item.
- **LOG MEAL** → builds payload from usable items only, calls `logMeal`; on success invalidates both rings and pushes `/(tabs)/nutrition`; on error Alert. (If nothing usable remains, mutation doesn't fire.)
- Pre-fill: a `foodId`/`recipeId` param seeds one plate item; barcode params seed a named item with resolved macros.

### 5. Loading / empty / error states
- **Search loading:** 3 stacked skeletons (100%×62, radius md).
- **Search error (query >2):** inline `EmptyState` icon `cloud-offline-outline`, title "Search failed", subtitle "Couldn't reach the food database. Check your connection and try again.", action "Try Again" → refetch.
- **Empty plate (no search):** `EmptyState` icon `restaurant-outline`, title "Build your plate", subtitle "Search for a food above to start adding items, then log them all at once."

### 6. Exact Zeitra styling
- Meal-type cards use per-meal accent colors for the selected border + check badge + plate accent stripe. Lime is reserved for the +/add/trash actions and the primary CTA. Macro numerals colored by macro. Plate rows / search rows `background.secondary` radius 12–14. CTA lime/ink radius 30, disabled-dimmed when empty.

### 7. Animations
- Images cross-fade (`transition 200`). Press feedback `activeOpacity 0.85`. Absolute footer CTA respects safe area + keyboard. (No FadeInDown.)

---

# SCREEN 5 — Confirm Planned Meal (`log-planned-meal.tsx`)

### 1. Purpose
One-tap "plan → meal" confirm screen, opened from the Circadian "AI Protocol" timeline ("Log this" on a planned meal). Arrives **pre-filled** with that slot's meal type, planned macro target, and suggested foods. The user confirms (or de-selects suggestions / searches in extras) and logs in one tap, correlating the log to its plan slot via `planMealId`.

### 2. Top-to-bottom layout
1. **Header** (standard): boxed back button · `h2` "**Confirm Meal**" · 40px spacer.
2. **Body** (ScrollView, padding 20, paddingBottom 140, keyboard-persist):
   - **Planned-slot summary** `GlassCard` (with **cyan glow**, 1px cyan @28% border, padding 18): row — a 48×48 rounded-14 icon tile (cyan @14% fill) with a `restaurant` icon 22px cyan + a body block: overline "`{Breakfast} • From your protocol`" (`text.secondary`) + `h3` slot **title** (white, up to 2 lines) + (if present) `caption` "Target: {macrosText}" (`text.secondary`).
   - **Macro totals row** (`macroRow`: `background.secondary`, 1px border, radius 14, padding 14, marginTop 16): 4-up colored `statSmall` 20px numerals over overlines — **KCAL** (lime) · **PROTEIN** (emerald) · **CARBS** (cyan) · **FAT** (amber). Live, derived from current plate.
   - Overline "**SUGGESTED FOODS**" (marginTop 24, marginBottom 12).
     - If suggestions exist: a list of **SuggestedFoodRow**s (memoized; `row`: `background.secondary`, radius 12, 1px border, padding 12). Each = a 44×44 thumb (food `imageUrl` cover, OR a cyan @12% fallback tile with `nutrition-outline` 18px cyan) + a body block (name `subhead` 1-line; `caption` sub = "{amount} • {kcal} kcal" or "{kcal} kcal • P:{protein}g", 1-line) + a trailing toggle icon: **included** = `checkmark-circle` 24px **cyan**, with a cyan @40% border and full opacity; **excluded** = `ellipse-outline` 24px tertiary, default border, **opacity 0.55**.
     - If no suggestions: `EmptyState` icon `sparkles-outline`, title "No itemized foods", subtitle (macro case) "This slot is a macro target. Log it as-is, or search to add the foods you actually ate." or (no-macro case) "This slot has no macros or foods to log. Search to add what you ate."
   - Overline "**ADD MORE (OPTIONAL)**" (marginTop 24) → a **search box** (`searchBox`: `background.secondary`, 1px border, radius 14, height 48, gap 8): `search` 18px tertiary + `TextInput` (placeholder "Search food…") + clear ✕.
     - **Search results** (query >2): up to 6 **SearchResultRow**s (`searchRow`: `background.secondary`, radius 12, 1px border, padding 14): name `subhead` 1-line + `caption` "{kcal} kcal per serving", trailing **lime `add-circle`** 24px.
   - **ADDED** section (when extras added): overline "**ADDED**" + per item an `addedRow` (`background.secondary`, radius 12, 1px border, padding 12): name `subhead` 1-line + `caption` "{kcal} kcal • P:{protein}g", trailing **lime `trash-outline`** 18px remove.
3. **Footer** (absolute, bottom, padding-h 20, padding-top 12, padding-bottom = max(safe-bottom, 20), translucent `background.primary` @96%): `CtaButton` "**LOG THIS MEAL**" (or "**NOTHING TO LOG**" when nothing loggable) with `checkmark-circle` icon, size lg, height 56 radius 28 (lime/ink), **disabled when nothing to log**, spinner while logging.

### 3. Data / text shown
- "Confirm Meal", "{MealType} • From your protocol", slot title, "Target: {macrosText}", macro labels KCAL/PROTEIN/CARBS/FAT, "SUGGESTED FOODS", per-food name + amount/kcal/protein, "ADD MORE (OPTIONAL)", placeholder "Search food…", "{kcal} kcal per serving", "ADDED", "LOG THIS MEAL"/"NOTHING TO LOG".
- Meal type falls back to SNACK if missing; slot title falls back to the meal-type label.

### 4. Interactions + navigation
- Back → `router.back()`. Tap a suggested row → toggle include/exclude (visually dims excluded). Search >2 → results; tap `add-circle` → add extra (dedup); trash → remove an added extra.
- **LOG THIS MEAL** → logs current plate; if plate empty but macros exist, synthesizes one line from the planned macros; forwards `planMealId`; on success invalidates both rings and `router.back()`; on error Alert. CTA disabled if neither plate items nor macros exist.

### 5. Loading / empty / error states
- **Search loading:** 3 skeletons (100%×58, radius 12).
- **Search error:** `EmptyState` `cloud-offline-outline`, "Search failed", "Couldn't reach the food database. Check your connection and try again.", "Try Again".
- **Search no-match:** `EmptyState` `search-outline`, "No matches", "Nothing found for \"{query}\". Try a different term."
- **No suggestions:** see §2 (the SUGGESTED FOODS empty state).

### 6. Exact Zeitra styling
- This is a **cyan**-accented confirm screen (summary glow, included-check, fallback thumbs all cyan `#00D4AA`). Lime reserved for add/trash actions + the primary CTA. Excluded suggestion rows dim to 0.55 opacity. Macro numerals colored by macro. CTA lime/ink radius 28, disabled-state copy "NOTHING TO LOG".

### 7. Animations
- Thumbnails cross-fade (`transition 200`). Press feedback `activeOpacity 0.85`. Memoized rows. Absolute translucent footer over the scroll. (No FadeInDown.)

---

# SCREEN 6 — Meal Planner (`planner.tsx`)

### 1. Purpose
AI nutrition-plan view, branded "RIA NUTRITION". Pick a day from a week strip, see (or generate) an AI-optimized plan: a calorie ring + protein/hydration hero, a 2-col grid of meal slots, supplements, a 5-star rating, and regenerate. Handles AI daily-quota and generation-error states.

### 2. Top-to-bottom layout
1. **Header** (standard, branded center): boxed back button · center stack: overline "**RIA NUTRITION**" (10px, letter-spacing 1.5, **lime**) over `h3` "**Meal Planner**" (white) · 40px spacer.
2. **Day-selector carousel** (its own `FadeInDown` strip with a 1px bottom border): horizontal scroll, padding-h 20, gap 10, padding-v 16. 7 **day cards** (Mon-start week; `dayCard`: 60×84, radius 18, 1px border, continuous curve): overline weekday "EEE" (10px) over `statSmall` day-number 20px, plus a 5×5 dot. **Selected** = **lime `accent.coral` fill + lime glow**, with **ink** weekday/number (`text.inverse`); today's dot is lime (or ink when the day is selected). Unselected = `background.secondary`, `border.default`, tertiary weekday, white number, transparent dot unless today.
3. **Body** (ScrollView, padding 20, paddingBottom 100):
   - **Date + AI badge row** (`FadeInDown.delay(40)`): `h1` "{MMMM do}" (e.g. "June 23rd") + (when a plan exists) an **AI OPTIMIZED** badge — pill, purple @15% fill, purple @28% border, `sparkles` 11px purple + overline "AI OPTIMIZED" purple.
   - **Loaded-plan content** (`FadeInDown.delay(60)`):
     - **Macro summary hero** `GlassCard` (radius 20): row (padding 18, gap 18) — left: a `CircularProgress` ring (size 108, stroke 9, **lime** progress over `border.default` track, fill = totalKcal/2500) centered on `statMedium` 26px total-kcal over overline "KCAL". Right (`summaryStats`): two stat rows separated by a hairline divider — **PROTEIN** (8px emerald dot + `statSmall` 22px "{g} g" + overline "PROTEIN") and **HYDRATION** (cyan dot + `statSmall` 22px "{L} L" + overline "HYDRATION", from `hydrationTargetMl/1000`).
     - **Section header row**: overline "**MEAL SLOTS**" + a count pill (min-width 26, height 22, radius 11, 1px border, `background.secondary`) showing the meal count.
     - **Meal-slot 2-col GRID** (`mealGrid`, space-between; each cell 48% wide, marginBottom 14, staggered `FadeInDown.delay(120 + idx*60).springify().damping(18)`). Each **meal card** (`Pressable` `mealCard`: radius 18, 1px border, continuous curve, overflow hidden; pressed → scale 0.97 + the meal-color border @50%): a 92-tall **thumb header** (bundled meal image cover) with a 4px left **accent stripe** (meal color) + a **time chip** top-left (`timeChip`: `background.primary` @72%, radius full, padding) holding a per-meal glyph (`sunny-outline`/`restaurant-outline`/`moon-outline`/`nutrition-outline`) in the meal color + `caption` bold 10px "{time}". Body (padding 12): meal **label** `subhead` bold 15px 1-line + `caption` description 2-line secondary + a footer row: per-meal kcal as `statTiny` 13px in the meal color "{n} kcal" (or empty) + a trailing **`add-circle` 20px in the meal color**.
       - Per-meal accent colors & glyphs: **breakfast** `#FFB300` amber / sunny · **lunch** `#10B981` emerald / restaurant · **dinner** `#7C4DFF` purple / moon · **snack** `#00D4AA` cyan / nutrition.
     - **Supplements** (if any; `FadeInDown.delay(180)`, marginTop 24): overline "**SUPPLEMENTS**" + a `suppCard` (`background.secondary`, radius 18, 1px border, padding 4) of rows (`suppRow`: padding 12, hairline divider except last): a 32×32 rounded-10 purple @14% icon tile with `medical` 16px purple + `body` supplement name white.
     - **Rating block** (`FadeInDown.delay(220)`, marginTop 40, centered): `caption` "How was this plan?" + a row of 5 stars (`star`/`star-outline` 32px **amber**). Tapping sets the rating and submits.
     - **Failure notices** (see §5) when present (marginTop 32).
     - **Regenerate button** (`genBtn`: height 56, radius 28, `background.secondary`, 1px border, marginTop 32; dims to 0.6 + shows spinner while generating): a `refresh` icon 20px white (or spinner) + `subhead` weight-900 "**REGENERATE PLAN**" (or "**GENERATING…**").

### 3. Data / text shown
- "RIA NUTRITION", "Meal Planner", weekday/day numerals, "{MMMM do}", "AI OPTIMIZED", "KCAL", "{g} g"/"PROTEIN", "{L} L"/"HYDRATION", "MEAL SLOTS", meal labels/descriptions/times, "{n} kcal", "SUPPLEMENTS", supplement names, "How was this plan?", "REGENERATE PLAN"/"GENERATING…".
- kcal ring target = 2500 (reference only). Macro/hydration totals summed from `plan.meals` + `plan.hydrationTargetMl`.
- Success Alert: "Plan Generated" / "Your AI-powered nutrition protocol is ready."

### 4. Interactions + navigation
- Back → `router.back()`. Tap a day → set selected date (re-queries that day's plan). Tap a meal card → push `/(meals)/log-meal` with `{preset: meal.label}`. Tap a star → set + submit rating (`ratePlan`). Tap **GENERATE AI PLAN** (empty) / **REGENERATE PLAN** → `generatePlan` for the selected date + current shift.
- Upgrade CTA (quota state) → push `/(modals)/premium`.

### 5. Loading / empty / error states
- **Loading:** a 100%×140 skeleton (radius xl) + a 90×12 label + a 2×2 grid of 48%×150 skeletons (radius xl).
- **Plan-load error:** `EmptyState` `cloud-offline-outline`, title "Couldn't load your plan", subtitle "Something went wrong reaching the Ria nutrition engine. Check your connection and try again.", action "Retry" → refetch.
- **No plan (empty, `FadeInDown.delay(60)`):** centered — a 100×100 circle (purple @12% fill, purple @24% border, **purple glow**) with `sparkles` 48px purple, overline "**RIA NUTRITION ENGINE**" purple, `h2` "No plan for this day", `body` "Let Ria analyze your shift schedule and build a perfect nutrition protocol." (max-width 300), then a `CtaButton` size lg with `sparkles` icon "**GENERATE AI PLAN**" (lime/ink, marginTop 32, spinner while generating). Failure notices render below if present.
- **Daily-AI-limit (429) notice card** (`noticeCard`: coral @8% fill, coral @35% border, radius 16, padding 16): `flash-outline` 20px lime + `subhead` bold "Daily AI limit reached" + `caption` "You've used all {limit} of your {Pro|free} daily AI plans. {Resets at {time}}." + a `CtaButton` "Upgrade" with `sparkles` icon, size sm (left-aligned).
- **Generation-failed notice card** (same surface): `alert-circle` 20px lime + `subhead` bold "Generation Failed" + `caption` "{error message}" + a "Try Again" outline pill (`tryAgainBtn`: coral @50% border, radius 20) with a `refresh` 16px lime + lime bold "Try Again". (Quota and error are mutually exclusive; only one shows.)
- Rating-failed Alert: "Rating Failed" + message.

### 6. Exact Zeitra styling
- Brand overline + day-strip selection + calorie ring + generate CTA are **lime** (`accent.coral`). AI badge + empty-state engine + supplements are **purple** (`accent.purple`). Per-meal cards carry their own accent (amber/emerald/purple/cyan). Stars **amber**. Notice cards coral-tinted. `borderCurve:'continuous'` on day/meal/supp cards for smooth squircles.

### 7. Animations
- `FadeInDown` everywhere: day strip (.duration 380), date row (.delay 40), hero (.delay 60), meal cards staggered (.delay 120 + idx*60, springify damping 18), supplements (.delay 180), rating (.delay 220). Meal cards press-scale to 0.97 with a meal-color border. Animated calorie ring fill. Regenerate button dims + spins while generating. Images cross-fade.

---

# SCREEN 7 — Ria's Kitchen / Recipes (`recipes.tsx`)

### 1. Purpose
Recipe collection branded "Ria's Kitchen". Filter recipes by dietary tag, browse a vertical feed of image recipe cards, open a full-screen detail sheet (hero image, prep/cook/kcal stats, ingredients, numbered instructions), and log a recipe as a meal.

### 2. Top-to-bottom layout
1. **Header** (standard): boxed back button · `h2` "**Ria's Kitchen**" · 40px spacer.
2. **Tag-filter carousel** (horizontal scroll, padding-h 20, gap 8, padding-v 14, 1px bottom border): 6 **tag chips** (`tagChip`: padding-h 14, padding-v 8, radius 20, 1px border). Selected = the tag's **own color** fill + matching glow + white bold UPPERCASE label; unselected = `background.secondary`, `border.default`, secondary label. Tags & colors: **All** (`#A8CC3C` lime) · **High Protein** (`#FF4444` red) · **Keto** (`#FFB300` amber) · **Vegan** (`#10B981` emerald) · **Meal Prep** (`#7C4DFF` purple) · **Under 30m** (`#00D4AA` cyan). Default = All.
3. **Recipe feed** (ScrollView, padding 20, paddingBottom 100): a vertical stack of **recipe cards** (`recCard`: height 220, radius 24, 1px border, overflow hidden, marginBottom 16, `shadows.lg`, space-between layout). Each = full-bleed recipe image (or `recipe-fallback.png`, cover) + a top-to-bottom black gradient (`rgba(0,0,0,0.05) → rgba(0,0,0,0.88)`):
   - **Top row** (`topRow`: padding 14, gap 8): two badges (`badge`: `rgba(0,0,0,0.5)`, radius 8) — a `time-outline` 12px + "{prep+cook}m", and a "{servings} serv." badge (white bold 11px).
   - **Bottom info** (`recInfo`: padding 16): `h2` recipe **title** (white) + a macro row (gap 14, marginTop 8) of 3 colored captions: "{kcal} kcal" (**lime**), "{protein}g PRO" (**emerald**), "{carbs}g CHO" (**cyan**), all 11px bold.
4. **Recipe detail `Modal`** (slide up, backdrop `rgba(0,0,0,0.9)`; sheet `modalCnt`: marginTop 60, radius top-corners 28, overflow hidden, `background.primary`):
   - **Hero image** (`modalHero`: full-width 300 tall, cover) with a floating close button top-right (`closeBtn`: 44×44 circle, `rgba(0,0,0,0.5)`, `close` 24px white, offset to safe-area-top + 12).
   - **Body** (`modalBody`: padding 24, marginTop −40 so it overlaps the hero):
     - `display` title 26px weight-900 white.
     - **Stats** `GlassCard` (radius lg=14): 3-up row (padding-v 20) — **PREP**, **COOK**, **KCAL** each a `statSmall` value over an overline label.
     - `h3` "**Ingredients**" (1px bottom border, padding-bottom 8) → per ingredient a row (marginTop 12): `radio-button-on` 12px **emerald** + `body` ingredient text (flex), and if structured, a right-aligned `body` "{amount} {unit}" secondary.
     - `h3` "**Instructions**" (1px bottom border, marginTop 28) → per step a row (marginTop 18): a 30×30 round step-number badge (`background.secondary`, `caption` bold number) + `body` step text secondary (flex, line-height 22).
     - **CTA** `CtaButton` "**LOG AS MEAL**" with `restaurant` icon, size lg, height 60 radius 30 (lime/ink), marginTop 40 / marginBottom 40.

### 3. Data / text shown
- "Ria's Kitchen", tag labels (uppercased), per card: "{prep+cook}m", "{servings} serv.", title, "{kcal} kcal"/"{protein}g PRO"/"{carbs}g CHO". Detail: title, "PREP"/"COOK"/"KCAL" + values, "Ingredients", ingredient text + "{amount} {unit}", "Instructions", numbered steps, "LOG AS MEAL".

### 4. Interactions + navigation
- Back → `router.back()`. Tap a tag chip → filter recipes (re-query). Tap a recipe card → open detail modal (fetch full recipe). Close (✕) → dismiss modal. **LOG AS MEAL** → close modal + push `/(meals)/log-meal` with `{recipeId}`.

### 5. Loading / empty / error states
- **Feed loading:** 3 stacked skeletons (100%×220, radius 2xl=24).
- **Feed error:** `EmptyState` `cloud-offline-outline`, title "Couldn't load recipes", subtitle "Something went wrong loading Ria's Kitchen. Check your connection and try again.", action "Try Again" → refetch.
- **Empty (All tag):** `EmptyState` `restaurant-outline`, title "No recipes yet", subtitle "Ria's Kitchen is warming up. Check back soon for chef-crafted, protocol-ready meals." (no action).
- **Empty (filtered):** `EmptyState` `restaurant-outline`, title "No matches found", subtitle "Nothing matches this filter right now. Try another tag or browse the full collection.", action "Browse all recipes" → reset to All.
- **Detail loading:** skeletons — a 100%×300 hero (radius 0) + body skeletons (70%×28 title, a 3-up stat row of 48×24 + 36×10, a 120×20 label, then 4× 100%×16 lines).
- **Detail error:** `EmptyState` `cloud-offline-outline`, title "Couldn't load recipe", subtitle "Something went wrong loading this recipe. Please close and try again.", action "Close" → dismiss.

### 6. Exact Zeitra styling
- Each tag chip uses its own brand-mapped color when active (lime/red/amber/emerald/purple/cyan). Recipe cards radius 24 with `shadows.lg` and heavy bottom gradient for legible white text. Macro captions colored lime/emerald/cyan. Detail sheet radius-top 28, hero 300, body overlaps −40. Ingredient bullets emerald, step badges `background.secondary`. CTA lime/ink radius 30.

### 7. Animations
- Modal slides up (native). Images cross-fade (`transition 200`/`300`). Press feedback `activeOpacity 0.85–0.9`. (No FadeInDown on this screen.)

---

## Cross-screen notes for the renderer
- **Lime is the spine.** Treat `accent.coral #A8CC3C` as the primary brand lime; every primary `CtaButton` is the lime→deep-lime gradient with **ink `#0A0C12`** label + icon. Each screen layers ONE functional accent on top: encyclopedia = lime/coral kcal; fasting = **cyan**; grocery = **emerald**; log-meal = per-meal colors; planned-meal = **cyan**; planner = **lime + purple (AI)**; recipes = per-tag colors.
- **Canvas & cards:** always `background.primary #0A0C12` canvas; cards `background.secondary #13161F` with 1px `border.default #222838`; elevated/tracks `background.tertiary #1B2030`.
- **Headers** are identical in skeleton (boxed back button, centered title, optional right action), 1px bottom hairline, safe-area-top padding.
- **Macro color legend (consistent everywhere):** Calories/KCAL = lime · Protein = emerald · Carbs = cyan · Fat = amber.
- **EmptyState** is the shared component on every screen (lime circle-icon + h3 + secondary subtitle + optional lime button). **Skeletons** are dark rounded shimmer blocks sized per §5.
- **Bottom tab bar** (Home/Train/Fuel/Circadian/More) sits beneath these pushed screens; render it for context with **Fuel** as the origin tab.
