# Zeitra — Master Design System

> **Source of truth for every Zeitra mockup, screen, and component.**
> If a design decision is not described here, default to the closest pattern that *is*. When in doubt, copy the token — never invent a one-off hex, radius, or spacing value.
>
> This document is mirrored from the live React Native implementation in `clients/mobile/src/theme/*` and `clients/mobile/src/components/ui/*`. The token tables below are the real exported values, so a designer (or a GPT rendering HTML / Figma / Stitch) can reproduce any screen pixel-accurately.

**How to use this doc**
- **Designer / Figma:** read §1–§4 for tokens and component recipes, §6 for screen composition, §8 for a fully worked screen.
- **GPT rendering HTML / a mockup:** start at §9 (copy-paste token block: CSS variables + JSON) and §7 (cheat-sheet), then pull component recipes from §4. Honor the Golden Rule (ink on lime) and the Do/Don't list in §10.
- **Engineer:** these tables are generated from the code; if you change a token, update this file in the same change (see footer).

---

## 0. Brand

| Attribute | Value |
|---|---|
| **Product** | Zeitra — circadian-aware fitness, nutrition & recovery for shift workers and high performers. |
| **Personality** | Athletic, premium, high-contrast, energetic. Confident, never loud. |
| **Tagline** | **STRONG TODAY. BETTER EVERYDAY.** (set in an overline / all-caps treatment) |
| **Logo** | Lime **"Z"** fused with a dumbbell, on near-black. Asset: `clients/mobile/assets/images/zeitra-logo.png` |
| **Feel** | Dark "Aurora" glass surfaces + a single energetic lime accent. Think a premium training wearable's companion app, not a neon gym poster. |

**Three rules that define the whole look:**

1. **Ink-on-lime, never white-on-lime.** Every lime-filled CTA uses ink (`#0A0C12`) text + icons. White text on lime is forbidden — it reads cheap and fails contrast.
2. **One accent.** Lime is the only brand accent. The functional colors (cyan / purple / amber / red) are *semantic* — used sparingly to mean something. Don't decorate with them.
3. **Glass, not flat.** Surfaces are dark frosted glass: a translucent fill, a 1px hairline border at ~6–10% white, generous padding, and a large radius. Avoid hard, fully-opaque cards.

---

## 1. Color

> Implementation: `clients/mobile/src/theme/colors.ts`.
> **Naming note for engineers:** the brand accent token is historically keyed `accent.coral` (a legacy name from the pre-rebrand "Aurora coral" palette). The *value* is lime. Treat `accent.coral` === "Zeitra lime". New code should read the token, not hardcode the hex.

### 1.1 Backgrounds (surfaces)

| Token | Hex | Usage |
|---|---|---|
| `background.primary` | `#0A0C12` | App background. Deep, cool near-black. Also the **ink** color for text/icons on lime. |
| `background.secondary` | `#13161F` | Default card / surface fill. |
| `background.tertiary` | `#1B2030` | Elevated surface — raised cards, secondary buttons, chips' neutral fill. |
| `background.quaternary` | `#242B3D` | Highest elevation — popovers, stacked sheets. |

### 1.2 Borders & dividers (glass hairlines)

| Token | Hex / value | Usage |
|---|---|---|
| `border.default` | `#222838` | Standard 1px card border / divider. |
| `border.light` | `#2F3650` | Slightly brighter border for emphasis. |
| `border.focus` | `#A8CC3C` | Focus ring (= lime). |
| **Glass hairline** | `rgba(255,255,255,0.06–0.10)` | The signature frosted border. Glass cards use **0.10**; tab bar / subtle dividers use **0.06–0.08**. Produced via `withAlpha(colors.text.primary, 0.10)`. |

### 1.3 Brand accent — Zeitra lime

| Token | Hex | Usage |
|---|---|---|
| `accent.coral` *(= lime)* | **`#A8CC3C`** | **PRIMARY.** CTAs, active tab, progress fills, selected states, accent icons, links / "VIEW ALL". |
| `accent.coralLight` | `#C5E06B` | Lighter lime for highlights / hover sheen. |
| `accent.coralDark` | `#93B82E` | Deeper lime — the dark stop of the CTA gradient ("lime-deep"). |
| `accent.pink` *(= lime-deep)* | `#93B82E` | Aurora gradient partner (identical to `coralDark`). |

### 1.4 Functional / semantic colors

| Token | Hex | Meaning — use *only* for this |
|---|---|---|
| `accent.cyan` / `success` | `#00D4AA` | Success, completion, positive progress (e.g. macros on target, meal logged). |
| `accent.purple` | `#7C4DFF` | AI & Coach ("Ria"). The AI FAB, AI-generated content, coach surfaces. |
| `accent.amber` / `warning` | `#FFB300` | Caution, "approaching limit", soft warnings. |
| `accent.red` / `error` | `#FF4444` | Danger, destructive actions, errors. |
| `accent.blue` / `info` | `#4FC3F7` | Informational accents, neutral data callouts. |
| `accent.emerald` | `#10B981` | Positive/active alt (rarely needed; prefer cyan). |
| `accent.orange` | `#F97316` | Warm highlight (rare). |

Each accent also has `…Light` / `…Dark` variants in the token file for hover/press states (`coralLight #C5E06B` / `coralDark #93B82E`, `cyanLight #33DDBB` / `cyanDark #00B894`, `purpleLight #9E7BFF` / `purpleDark #6233CC`, `blueLight #81D4FA`, `redLight #FF6B6B`, `amberLight #FFC940`).

### 1.5 Text

| Token | Hex | Contrast | Usage |
|---|---|---|---|
| `text.primary` | `#FFFFFF` | 19.5:1 on `#0A0C12` | Headings, numerals, body on dark. |
| `text.secondary` | `#9BA3B4` | ~7.4:1 on `#0A0C12` (AA/AAA body) | Supporting copy, captions, descriptions. |
| `text.tertiary` | `#7B8497` | ~5.2:1 on `#0A0C12` (AA) | Faint labels, inactive tab tint, timestamps, placeholders. **Do not go fainter** — `#5A6373` was retired for failing AA. |
| `text.accent` | `#A8CC3C` | ~9.7:1 on `#0A0C12` | Lime text (links, "VIEW ALL", eyebrows that need to pop). |
| `text.inverse` | `#0A0C12` | — | **Ink** — text/icons on any lime fill. |

### 1.6 Gradients

| Token | Stops | Usage |
|---|---|---|
| `gradients.coral` | `#A8CC3C → #93B82E` | Brand hero gradient (decorative lime discs, the centre Quick-Log button). |
| `gradients.coralCta` | `#A8CC3C → #93B82E` | **The single CTA fill.** Every primary lime button renders this — left→right (`x:0→1`). Keeps all CTAs byte-identical. |
| `gradients.cyan` | `#00D4AA → #4FC3F7` | Success / progress accents. |
| `gradients.purple` | `#7C4DFF → #B47CFF` | AI / Coach (the Ria FAB). |
| `gradients.dark` | `#13161F → #0A0C12` | Subtle surface depth. |
| `gradients.card` | `rgba(25,29,40,0.72) → rgba(12,14,20,0.88)` | Glass-card fill when not using a true blur. |

**Image scrims (for art-backed cards):** overlay a vertical `rgba(0,0,0,0.05) → rgba(0,0,0,0.82)` (or `0.12 → 0.88`) so white titles read against any photo.

### 1.7 Contrast pairs (what is safe on what)

Design AA-first (4.5:1 for body text, 3:1 for large/bold ≥24px and for UI/icon boundaries).

| Foreground | On surface | Ratio | Verdict |
|---|---|---|---|
| `#FFFFFF` text | `#0A0C12` / `#13161F` / `#1B2030` | 19.5 / ~18 / ~15 | ✅ everywhere |
| `#9BA3B4` (secondary) | `#0A0C12` → `#1B2030` | ~7.4 → ~5.8 | ✅ body |
| `#7B8497` (tertiary) | `#0A0C12` | ~5.2 | ✅ (floor — don't go fainter) |
| `#7B8497` (tertiary) | `#1B2030` | ~4.1 | ✅ large/labels only |
| `#A8CC3C` lime text | `#0A0C12` | ~9.7 | ✅ |
| **`#0A0C12` ink** | **`#A8CC3C` lime fill** | **~9.0** | ✅ **the CTA pairing** |
| **`#FFFFFF`** | **`#A8CC3C` lime fill** | **~1.7** | ❌ **FORBIDDEN** (the Golden Rule) |

### 1.8 Light mode

A light palette exists (`colors.light.*`: bg `#F4F5F7` / surfaces `#FFFFFF` / text `#16181D`) and the lime accent is unchanged. **Dark is the canonical, designed-for-brand mode** — design every mockup dark-first. A "Night Read" deep-red variant also exists for overnight readability (`theme/nightRead.ts`); it is an accessibility mode, not a design target.

---

## 2. Typography

> Implementation: `clients/mobile/src/theme/typography.ts`.
> **Fonts:** **Inter** for all UI/text; **JetBrains Mono** for stats/data numerals. The big "scoreboard" numbers are mono on purpose — it reads athletic and keeps digits tabular. Web fallback stack: `Inter, -apple-system, "Segoe UI", Roboto, sans-serif` and `"JetBrains Mono", "SF Mono", ui-monospace, monospace`.

### 2.1 Type scale (Inter)

| Style | Font / weight | Size / line-height | Tracking | Usage |
|---|---|---|---|---|
| `display` | Inter ExtraBold (800) | 36 / 44 | −0.5 | Hero numerals & screen-defining headlines. |
| `h1` | Inter Bold (700) | 28 / 36 | −0.3 | Screen titles. |
| `h2` | Inter Bold (700) | 24 / 32 | −0.2 | Section titles. |
| `h3` / `heading` | Inter SemiBold (600) | 20 / 28 | 0 | Card titles, sheet titles. |
| `subtitle` / `subhead` | Inter SemiBold (600) | 16 / 24 | 0 | Card headers, list-row titles. |
| `body` | Inter Regular (400) | 15 / 22 | 0 | Default body copy. |
| `bodyMedium` | Inter Medium (500) | 15 / 22 | 0 | Emphasized body. |
| `bodySm` | Inter Regular (400) | 14 / 20 | 0 | Dense body, descriptions. |
| `caption` | Inter Regular (400) | 12 / 16 | 0 | Captions, metadata. |
| `captionMedium` | Inter Medium (500) | 12 / 16 | 0 | Emphasized captions, chip text. |
| **`overline`** | Inter SemiBold (600) | 11 / 16 | **+1.5** | **UPPERCASE section eyebrows / labels.** The signature label style — muted, all-caps, wide-tracked. |

> **Brand note on weight:** the prompt-level brand brief calls for display numerals/headings at **weight 900**. Inter ships ExtraBold (800) as its heaviest loaded face here, so headings render at 800 in-app, and art-backed card titles push to **900** where a Black face is available (e.g. category/grid titles below). Treat "800–900, big and bold" as the rule; use 900 on hero/art titles when you can.

### 2.2 Stat / data numerals (JetBrains Mono)

| Style | Font / weight | Size / line-height | Usage |
|---|---|---|---|
| `statLarge` | JetBrains Mono Bold (700) | 48 / 56 | The biggest single number on a screen (hero ring center, big total). |
| `statMedium` | JetBrains Mono SemiBold (600) | 32 / 40 | Prominent metric. |
| `statSmall` | JetBrains Mono SemiBold (600) | 24 / 32 | Stat-card numerals (often rendered ~22 for a 3-up grid). |
| `statTiny` | JetBrains Mono Regular (400) | 16 / 22 | Inline data, units. |

### 2.3 Type rules

- **Display numerals & headings are heavy:** 28–36px at weight 800 (→900 on art titles). Big, bold, confident.
- **Section headers are overlines:** 11px, UPPERCASE, +1.5 letter-spacing, in `text.secondary` (or lime when it should pop). Pair with an optional 13–14px lime icon to the left.
- **Body sits at 13–15px.** Never smaller than 12 for readable copy; 11 is reserved for overlines/labels only.
- **Cap dynamic-type scaling** on tight elements (`maxFontSizeMultiplier` ~1.2–1.4) so big numerals and CTAs don't break layout. (CtaButton caps its label at 1.4.)

---

## 3. Spacing, radius, sizing

> Implementation: `clients/mobile/src/theme/spacing.ts`. **Base grid = 4px.**

### 3.1 Spacing scale

| Token | px | Typical use |
|---|---|---|
| `xxs` | 2 | Hairline gaps. |
| `xs` | 4 | Icon-to-label micro gap. |
| `sm` | 8 | Tight internal gaps. |
| `md` | 12 | Default gutter between grid cards / chips. |
| `lg` | 16 | Standard card padding, vertical rhythm. |
| `xl` | 20 | **Screen horizontal padding (page margin).** |
| `2xl` | 24 | Section spacing, generous card padding. |
| `3xl` | 32 | Large section breaks. |
| `4xl`–`8xl` | 40 / 48 / 64 / 80 / 96 | Hero/empty-state whitespace. |

**Layout conventions actually used:**
- **Page horizontal padding: 20px** (`xl`) on every screen edge.
- **Grid gutter: 12px** (`md`). Two-column card width = `(screenWidth − 2·20 − 12) / 2`.
- **Section bottom margin: 20–24px** between major blocks.
- Card inner padding: **16–22px** (hero/feature cards lean to 18–22).

### 3.2 Radius

| Token | px | Usage |
|---|---|---|
| `sm` | 4 | Tiny chips/badges-on-art. |
| `md` | 10 | Small buttons, inputs. |
| `lg` | 14 | **CTA buttons**, medium controls. |
| `xl` | 20 | **Standard card** radius (stat cards, grid cards, routine cards). |
| `2xl` | 24 | **Glass card** default radius (feature/hero cards, sheets). |
| `3xl` | 28 | Extra-round feature surfaces. |
| `full` | 9999 | Pills, chips, avatars, circular buttons. |

> Brand rule of thumb: **cards 16–24, CTAs 12–14, pills full.**

### 3.3 Icon sizes

`xs 16 · sm 20 · md 24 · lg 28 · xl 32 · 2xl 40 · 3xl 48`. Tab icons = 22. Inline-with-overline icons = 13–14. CTA leading icons = 15–19 (scales with button size). **Icon set: Ionicons** (outline by default, filled for active/selected states).

### 3.4 Worked grid math (so columns line up exactly)

Page padding 20 each side; gutter 12.

| Viewport width | 2-col card width | 3-col card width (gutter 12) |
|---|---|---|
| 360 | `(360 − 40 − 12)/2 = 154` | `(360 − 40 − 24)/3 ≈ 98.7` |
| 390 (iPhone 14) | `(390 − 40 − 12)/2 = 169` | `(390 − 40 − 24)/3 ≈ 108.7` |
| 414 | `(414 − 40 − 12)/2 = 181` | `(414 − 40 − 24)/3 ≈ 116.7` |

Art-backed category cards in code use a slightly tighter `GRID_CARD_W = (screenWidth − 52) / 2` (≈ 169 at 390) — i.e. 20+20 padding + 12 gutter folded into one constant. Use **`(W − 52)/2`** for 2-up art tiles.

### 3.5 Elevation & glow

> Implementation: `clients/mobile/src/theme/shadows.ts`.

| Token | iOS shadow (color #000) | Android |
|---|---|---|
| `shadows.sm` | y1, opacity .16, radius 2 | elevation 2 |
| `shadows.md` | y2, opacity .20, radius 4 | elevation 4 |
| `shadows.lg` | y4, opacity .24, radius 8 | elevation 8 |
| `shadows.xl` | y8, opacity .32, radius 16 | elevation 12 |
| **`shadows.glow(color)`** | color halo: offset 0, **opacity .18, radius 9** | elevation 4 |

**The glow is deliberately subtle** — a premium halo, *not* a neon ring. Apply `shadows.glow(lime)` under CTAs and selected cards. Raised brand discs (centre Quick-Log) use a stronger custom shadow (opacity .45, radius 12) because they float above the bar.
**CSS equivalent of `glow(lime)`:** `box-shadow: 0 0 9px rgba(168,204,60,0.18);` (for CTAs / selected cards). On art discs that float: `0 6px 12px rgba(168,204,60,0.45)`.

---

## 4. Component library

> Primitives live in `clients/mobile/src/components/ui/` and are re-exported from `ui/index.ts`. Higher-level cards live in feature folders (e.g. `components/TrainingCards.tsx`). Each spec below gives the exact recipe so a mockup matches the code.

### 4.1 CTA Button — `CtaButton` (the primary action)

The one lime call-to-action. **Ink text + icon on a lime gradient.**

- **Fill:** `gradients.coralCta` (`#A8CC3C → #93B82E`), left→right (`x:0→1`).
- **Text/icon color:** **`#0A0C12` ink**, weight 800, letter-spacing +0.3. **No text shadow** (ink on lime is already max-contrast).
- **Radius:** 14 · **gap** icon↔label: 8 · centered row (`flexDirection:row, alignItems/justifyContent:center`).
- **Glow:** `shadows.glow(lime)` (subtle).
- **Pressed:** scale **0.97**.
- **Disabled / loading:** opacity 0.6; spinner is ink (`#0A0C12`); press blocked.
- **Sizes:**
  | size | minHeight | padV | fontSize | icon | spinner |
  |---|---|---|---|---|---|
  | `sm` | 40 | 9 | 13 | 15 | 15 |
  | `md` *(default)* | 48 | 13 | 15 | 17 | small |
  | `lg` | 56 | 16 | 17 | 19 | 19 |
- **a11y:** `role="button"`, label (falls back to `label`), disabled/busy state.

> The centre **Quick-Log** tab control and the **Ria AI FAB** are *icon-only* brand-gradient discs (no text label inside the fill) — so they may use a white "+"/"sparkles" glyph. The ink-on-lime rule applies only to **labeled** CTAs.

**CSS recipe:**
```css
.cta { display:flex; align-items:center; justify-content:center; gap:8px;
  min-height:48px; padding:13px 18px; border-radius:14px; border:0; cursor:pointer;
  background:linear-gradient(90deg,#A8CC3C,#93B82E);
  color:#0A0C12; font-weight:800; letter-spacing:.3px; font-size:15px;
  box-shadow:0 0 9px rgba(168,204,60,.18); transition:transform .1s; }
.cta:active { transform:scale(.97); }
.cta svg, .cta .icon { color:#0A0C12; fill:#0A0C12; }   /* ink icon — never white */
```

### 4.2 Secondary / variant buttons — `Button`

Multi-variant pressable. `primary` is identical to the CTA (lime gradient, ink text). Other variants:

| variant | fill | text | border |
|---|---|---|---|
| `primary` | lime gradient (`coralCta`) | ink `#0A0C12` | — + glow |
| `secondary` | `background.tertiary` `#1B2030` | `text.primary` `#FFFFFF` | — |
| `outline` | transparent | lime `#A8CC3C` | 1.5px lime |
| `ghost` | transparent | `text.secondary` `#9BA3B4` | — |
| `danger` | `accent.red` `#FF4444` | `text.primary` `#FFFFFF` | — |

Sizes: `sm` h36 / r10 / 13px / padH12 · `md` h48 / r14 / 15px / padH20 · `lg` h56 / r20 / 17px / padH24. Row gap 8, weight 600, tracking +0.2. Pressed: **scale 0.98** (+ opacity 0.85 on the gradient / 0.8 on the others).

### 4.3 Glass Card — `GlassCard` (the signature surface)

The frosted dark-glass primitive used for every feature/hero card and sheet.

- **Structure:** outer `View` owns radius + 1px hairline border + clip (`overflow:hidden`) + optional glow; inner blur owns the frosted fill.
- **Border:** `rgba(255,255,255,0.10)` (= `withAlpha(text.primary, 0.10)`).
- **Radius:** default **24** (`2xl`); pass `radius` to override (cards often 20).
- **Blur:** `intensity` default 40, `tint="dark"` (uses a `SafeBlurView` that degrades to a semi-opaque fill on Android < 12 so it never crashes).
- **Glow:** pass `glow={lime}` to add a soft halo (used for *selected* state).
- **Padding:** the card itself is padding-less; wrap children in a `View` with `padding: 16–22`.

**Static fallback (non-blur, e.g. for HTML/Figma mockups):** fill `gradients.card` (`rgba(25,29,40,0.72)→rgba(12,14,20,0.88)`) + a faint top sheen `rgba(255,255,255,0.06)→transparent` over the top ~56px + the same 1px hairline. This is exactly what `Card variant="glass"` renders.

**CSS recipe (static glass):**
```css
.glass { position:relative; border-radius:24px; padding:18px; overflow:hidden;
  border:1px solid rgba(255,255,255,.10);
  background:linear-gradient(180deg, rgba(25,29,40,.72), rgba(12,14,20,.88));
  backdrop-filter:blur(20px); }
.glass::before { content:""; position:absolute; inset:0 0 auto 0; height:56px;
  background:linear-gradient(180deg, rgba(255,255,255,.06), transparent); pointer-events:none; }
.glass--selected { border-color:#A8CC3C; box-shadow:0 0 9px rgba(168,204,60,.18); }
```

### 4.4 Plain Card — `Card`

Simpler opaque surface. `variant`: `default` (fill `#13161F`), `elevated` (fill `#1B2030`), `glass` (gradient + sheen as above). Radius 20 (`xl`), 1px `border.default` `#222838`, padding from spacing scale (default 16). Use for list rows and dense content where a blur is overkill.

### 4.5 Stat Card

A dark-glass tile: accent-tinted icon chip, a big mono numeral, a muted caption. Used in 2-up / 3-up grids.

- **Surface:** fill `background.secondary` `#13161F`, 1px `border.default` `#222838`, radius **20** (`xl`), `flex:1`.
- **Padding:** 14 vertical / 12 horizontal.
- **Icon chip:** 30×30, `borderRadius 15`, fill `withAlpha(accent, 0.14)`, border `withAlpha(accent, 0.28)`, 16px icon in the accent color. `marginBottom 10`.
- **Value:** `statSmall` mono, `text.primary`, ~22px in a 3-up grid.
- **Label:** `caption` 12px, `text.secondary`, `marginTop 2`, single line.
- **Entrance:** `FadeInDown.delay(120 + index*60).springify().damping(18)` — staggered per tile.

The `accent` is chosen by meaning (lime for volume/streak, cyan for completion, purple for AI-derived, etc.).

### 4.6 Grid / Category Card (2-col, art-backed)

Full-bleed image tile for collections (muscle groups, programs).

- **Size:** `GRID_CARD_W` = `(screenWidth − 52) / 2`, height ~132, radius 20, `overflow:hidden`, 1px border `withAlpha(accent, 0.4)`.
- **Image:** absolute-fill, `contentFit:cover`.
- **Scrim:** vertical `rgba(0,0,0,0.05) → rgba(0,0,0,0.82)` so the title reads.
- **Accent pill (top-left of content):** fill `withAlpha(accent, 0.25)`, border `accent`, radius 6, 9px uppercase accent-colored label.
- **Title:** white, **17px weight 900**, anchored bottom.
- **Entrance:** `FadeInDown.delay(160 + index*70).springify().damping(18)`.

### 4.7 Carousel / Routine Card (horizontal snap)

Collections scroll horizontally and **snap**, with the next card peeking to signal swipeability.

**Mechanics (the app convention):**
```
horizontal · showsHorizontalScrollIndicator={false}
decelerationRate="fast"
snapToInterval = CARD_W + GAP   (e.g. 200 + 16, or 12)
snapToAlignment="start"
contentContainerStyle={{ paddingHorizontal: 20, gap: 16 }}
```
- **Card width:** fixed (~200) or ~64% of viewport capped at 240, so the next card peeks.
- **Routine card:** height ~168, radius 20, art fill + `rgba(0,0,0,0.12)→rgba(0,0,0,0.88)` scrim, an ordinal ring top-right, title bottom.
- **Section header above a rail:** an overline eyebrow (+ optional 14px lime icon) on the left, a lime **"VIEW ALL"** caption (weight bold) on the right.

### 4.8 Chip / Pill (filters, status, momentum)

Small rounded-full token. Two flavors:

**Filled accent chip (status / insight / momentum):**
- Fill `withAlpha(accent, 0.10–0.12)`, border `withAlpha(accent, 0.22–0.30)` (1px), radius 20 (or full).
- Padding ~`10–14 H / 5–9 V`, `gap 5–7`.
- Leading 13px accent icon + `captionMedium` (12px) text in the accent color, `alignSelf:flex-start`.

**Selectable filter pill:** inactive = neutral (`background.tertiary` `#1B2030` fill, `border.default`, `text.secondary`); active = lime (lime fill *or* lime hairline + lime text). Always rounded-full. Keep border **width constant** between states (only swap color) so the row never reflows.

### 4.9 Badge — `Badge`

Tiny rounded-full status label. Variants `default / coral(=lime) / cyan / purple / red / amber`. Each non-default = `withAlpha(color, 0.14)` fill + `withAlpha(color, 0.28)` border + the color as text. `default` = `background.tertiary` fill / `border.default` / `text.secondary`. Sizes `sm` (11px, pad 8/2) / `md` (13px, pad 12/4), weight 600, **hairline** border, `alignSelf:flex-start`.

### 4.10 Circular Progress Ring — `CircularProgress`

SVG ring for readiness / score / macro completion.

- Two concentric circles: **track** (`border.default` `#222838`) + **progress** (accent, default lime), `strokeWidth` default **8**, `strokeLinecap="round"`, rotated **−90°** so it starts at 12 o'clock.
- Geometry: `radius = (size − strokeWidth)/2`; `circumference = 2πr`; `dashoffset = circumference·(1 − pct)`.
- Accepts `progress` as a **0–1 fraction or 0–100 percent** (auto-normalized: ≤1 ⇒ treated as a fraction).
- Center content: a big mono `value` (24px statSmall), optional `unit` (12px secondary), optional uppercase `label` (11px secondary, +0.5 tracking) — or arbitrary `children`.
- Color the ring by meaning: lime for readiness/score, cyan for "on target", amber/red as a value approaches/exceeds a limit.

**SVG recipe:** `<circle>` track + `<circle>` progress with `stroke-dasharray="{C}"`, `stroke-dashoffset="{C*(1-pct)}"`, `stroke-linecap="round"`, `transform="rotate(-90 cx cy)"`.

### 4.11 Linear Progress Bar — `ProgressBar`

Rounded track + fill. Height default **6** (radius = height/2), track `border.default` `#222838`, fill solid `accent` (default lime) **or** a 2-stop gradient (left→right). `overflow:hidden`, width clamped 0–100%. Animate the width on mount/update (see §5).

### 4.12 Bottom Tab Bar

> Implementation: `clients/mobile/app/(tabs)/_layout.tsx`.

The primary navigation. **5 slots:** `Home · Train · ⊕ (centre Quick-Log) · Feed · More`.

- **Conceptual model from the brand brief:** Home / Train / Fuel / Circadian / More. In the shipped app the centre slot is a raised **Quick-Log** control (Meal / Workout / Sleep chooser) and "Fuel"(nutrition) + "Circadian" are reached from it / from Home — but **active = lime icon + lime label, inactive = muted (`text.tertiary` `#7B8497`)** holds throughout. For a clean conceptual mockup, label the five as **Home / Train / Fuel / Circadian / More** with the centre raised; for an app-accurate mockup use **Home / Train / ⊕ / Feed / More**.
- **Bar surface:** absolute, transparent background over a `SafeBlurView` (dark, intensity 40); 1px top border `rgba(255,255,255,0.10)`; height **88 iOS / 72 Android**.
- **Icons:** 22px Ionicons, outline when inactive, filled when active. Active tab also shows a tiny **4×4 lime dot** under the icon.
- **Labels:** 10px, weight 600. Active tint = lime (`accent.coral`); inactive = `text.tertiary`.
- **Centre control:** a 58px lime brand-gradient disc (`gradients.coral`) with a white "+" glyph, lifted above the bar with a lime shadow (opacity .45 / radius 12), a "Log" caption beneath. Press = scale **0.92** (UI-thread). Opens a glass bottom-sheet chooser.
- **Ria AI FAB (global):** a 56px **purple** gradient disc (`gradients.purple`) with a white "sparkles" glyph + a cyan notification dot, floating bottom-right **above** the tab bar (`bottom = TAB_BAR_H + 14`, `right: 20`). Purple = AI everywhere.

### 4.13 Bottom Sheet / Modal chooser

Native modal, slide-up, dark `rgba(0,0,0,0.55)` backdrop (tap-to-dismiss). Body is a `GlassCard` (intensity ~50, padding 18) with: a centered 40×4 grabber (`rgba(255,255,255,0.25)`), a title (`heading` 18px), then rows. **Rows:** ~64px min-height, 1px hairline border, radius 16, a 44×44 accent-gradient icon disc on the left, title + caption stacked, a `chevron-forward` in `text.tertiary` on the right; pressed row tints `rgba(255,255,255,0.06)`.

### 4.14 Other primitives (in `ui/`)

`Input`, `SearchBar`, `Avatar`, `FAB`, `Skeleton`/`SkeletonCard` (loading shimmer — use card-shaped skeletons at the real dimensions while data loads), `EmptyState`, `GeneratingSteps` (AI progress), `DateTimeField`, `ProgressBar`. Reuse these rather than rebuilding. (Full barrel: `Card, GlassCard, Button, CtaButton, CircularProgress, ProgressBar, Badge, Input, FAB, SearchBar, Avatar, Skeleton, SkeletonCard, EmptyState, GeneratingSteps, DateTimeField`.)

---

## 5. Motion & animation

> Library: **Reanimated** (the app is React Native; do **not** use GSAP/Framer — those are web-only). Motion is premium and *purposeful*: entrances orient, presses confirm, progress animates.

### 5.1 Entrance — staggered `FadeInDown`

Every screen's sections enter with `FadeInDown`, **staggered by section** so content cascades in:

```
entering={FadeInDown.delay(D).duration(420–460)}
```

- **Stagger ladder (per screen):** start the first block at ~60–90ms and step subsequent blocks by ~40–60ms — e.g. `80 · 130 · 180 · 220 · 240…` (real values from the Dashboard).
- **Within a list/grid, stagger by index:** `FadeInDown.delay(base + index*60)` (stat cards) or `index*70` (grid/category cards).
- **Duration:** 420–460ms for the fade variants.

### 5.2 Springy card reveals

For cards that should feel tactile rather than slide, use a spring instead of a fixed duration:

```
entering={FadeInDown.delay(D).springify().damping(18)}
```

Used for stat cards, plan cards, category cards. `damping(18)` gives a confident settle with a hint of overshoot.

### 5.3 Pressed-scale feedback

Tactile press on anything interactive:

- **Cards & selectable tiles:** scale to **0.96** on press-in (`withTiming … 110ms`), back to 1 on press-out (~140ms).
- **CTAs / buttons:** scale to **0.97** (CtaButton) / **0.98** (Button) while pressed.
- **Raised brand discs (centre tab):** scale to **0.92**, driven on the UI thread via a shared value + `GestureDetector` (no JS round-trip), animating transform only.

### 5.4 Animated progress

- **Rings & bars animate to their value** on mount and on change (don't pop to final). Drive stroke-dashoffset / width with `withTiming`.
- **Selection glow:** when a card becomes selected, lift it to a lime hairline + `shadows.glow(lime)` + swap its icon medallion to a solid lime fill with an ink glyph and reveal a lime check badge. Keep border **width constant** (only change color) so neighbors never reflow.

### 5.5 Motion principles

1. **GPU-only props.** Animate `transform` (scale/translate) and `opacity` — never layout-affecting props in hot paths.
2. **Subtle, not bouncy.** Short durations (90–460ms), modest spring overshoot. This is a premium athletic app, not a toy.
3. **Respect reduced-motion** and cap dynamic type so motion/scale never breaks legibility.
4. **Image transitions:** fade art in (~200ms) with `memory-disk` caching; never flash a hard swap.

---

## 6. Layout patterns (how a screen is composed)

A canonical Zeitra screen, top → bottom:

1. **Header row** — greeting / screen title (`h1`/`display`), optional avatar or icon buttons (38px circular). A momentum/status **chip** can sit in the sub-header beside the date.
2. **Hero block** — a `GlassCard` feature (e.g. "TONIGHT'S SESSION") with a readiness **ring**, key copy, and a lime **CTA** (ink text). Enters first (~80ms).
3. **Insight chip** — a single filled accent chip with a circadian/AI insight.
4. **Stat grid** — 2-up or 3-up **StatCards**, 12px gutter, staggered entrance.
5. **Section(s)** — each introduced by an **overline eyebrow** (+ optional lime icon), then either a **2-col grid** (collections) or a **horizontal snapping carousel** (rails) with a lime "VIEW ALL".
6. **Bottom rhythm** — generous 20–24px section gaps; content padded clear of the tab bar + FAB (bottom padding ≥ `TAB_BAR_H + 24`).

**Global chrome:** the blurred bottom **tab bar** (active = lime) and the floating **purple Ria FAB** are present on every tab screen.

---

## 7. Quick reference (cheat-sheet for rendering a mockup)

```
BG            #0A0C12   (ink — also text/icon color on lime)
SURFACE       #13161F   ELEVATED #1B2030   HIGHEST #242B3D
HAIRLINE      rgba(255,255,255,0.06–0.10)   BORDER #222838 / light #2F3650
LIME          #A8CC3C   (CTA / active / progress)  · deep #93B82E · light #C5E06B
CTA GRADIENT  #A8CC3C → #93B82E,  INK text, radius 14, subtle lime glow, press 0.97
CYAN  #00D4AA success · PURPLE #7C4DFF AI · AMBER #FFB300 caution · RED #FF4444 danger · BLUE #4FC3F7 info
TEXT          #FFFFFF / #9BA3B4 / #7B8497   ACCENT #A8CC3C   INK #0A0C12
HEADINGS      Inter 800–900, 28–36   OVERLINE Inter 600, 11, UPPERCASE, +1.5 tracking, muted
NUMERALS      JetBrains Mono, 22–48 (statSmall 24 · statMedium 32 · statLarge 48)
PAGE PADDING  20    GRID GUTTER 12    SECTION GAP 20–24    GRID CARD W = (vw−52)/2
RADIUS        card 20–24 · CTA 12–14 · input/sm-btn 10 · pill full
CARD          dark glass · 1px hairline · radius 20–24 · padding 16–22 · subtle glow
GLOW          0 0 9px rgba(168,204,60,.18)
RING          track #222838 + lime progress, stroke 8, round cap, start 12 o'clock
TABBAR        blur dark · 1px top hairline · 5 slots · active lime icon+label · inactive #7B8497 · centre lime ⊕ disc · purple AI FAB
MOTION        FadeInDown staggered (60→240ms), springify().damping(18), press-scale 0.96–0.98
GOLDEN RULE   INK on LIME — never white on lime.
```

---

## 8. Worked example — the Dashboard (render-ready)

A concrete instantiation of §6 so a GPT can produce a faithful screen without guessing values. Dark page `#0A0C12`, 20px side padding.

1. **Header** (`FadeInDown.delay(80)`): left — overline `GOOD EVENING` (`#9BA3B4`, +1.5) over `h1` "Alex" (white 28/800). Right — 38px circular avatar with a 1px hairline.
2. **Hero card** (`FadeInDown.delay(130)`): a `GlassCard` (radius 24, padding 20). Overline `TONIGHT'S SESSION` lime. Left column: title "Push • Strength" (`subtitle` white) + caption "52 min · 6 exercises" (`#9BA3B4`). Right: a 92px `CircularProgress` ring (lime, stroke 8) with mono center value `78` + overline `READY`. Full-width `CtaButton` "START SESSION" (icon `play`) at the bottom — lime gradient, **ink** label, glow, radius 14.
3. **Insight chip** (`FadeInDown.delay(180)`): a single filled purple chip (AI), `withAlpha(#7C4DFF,.12)` fill / `.28` border, leading 13px `sparkles`, `captionMedium` text "Your window peaks 6–8 PM."
4. **Stat grid** (`FadeInDown.delay(220)` then per-tile `+index*60`): three `StatCard`s in a row, gutter 12 — `Streak 12d` (lime `flame`), `Sleep 7.4h` (cyan `moon`), `Protein 96g` (amber `nutrition`). Each: `#13161F` fill, radius 20, 30×30 tinted icon chip, mono value ~22, caption.
5. **Rail** (`FadeInDown.delay(260)`): section header — overline `RECOMMENDED` (+ 14px lime icon) left, lime **VIEW ALL** right. Then a horizontal snapping carousel of art-backed routine cards (width ~200, gap 16, radius 20, dark scrim, white 900 title, ordinal ring top-right).
6. **Chrome:** blurred bottom tab bar (Home active = lime + 4px lime dot), raised lime ⊕ centre, purple Ria FAB bottom-right above the bar. Content bottom padding clears the bar (≥ ~112).

---

## 9. Copy-paste tokens (for HTML / Figma / GPT)

### 9.1 CSS custom properties

```css
:root {
  /* surfaces */
  --bg: #0A0C12; --surface: #13161F; --elevated: #1B2030; --highest: #242B3D;
  --border: #222838; --border-light: #2F3650;
  --hairline: rgba(255,255,255,0.10);
  /* brand lime */
  --lime: #A8CC3C; --lime-light: #C5E06B; --lime-deep: #93B82E;
  /* semantic */
  --cyan: #00D4AA; --purple: #7C4DFF; --amber: #FFB300; --red: #FF4444; --blue: #4FC3F7;
  /* text */
  --text: #FFFFFF; --text-2: #9BA3B4; --text-3: #7B8497; --ink: #0A0C12;
  /* gradients */
  --cta: linear-gradient(90deg,#A8CC3C,#93B82E);
  --glass: linear-gradient(180deg, rgba(25,29,40,.72), rgba(12,14,20,.88));
  --scrim: linear-gradient(180deg, rgba(0,0,0,.05), rgba(0,0,0,.82));
  /* radius */
  --r-sm:4px; --r-md:10px; --r-cta:14px; --r-card:20px; --r-glass:24px; --r-pill:9999px;
  /* spacing (4px grid) */
  --s-xs:4px; --s-sm:8px; --s-md:12px; --s-lg:16px; --s-xl:20px; --s-2xl:24px; --s-3xl:32px;
  /* glow */
  --glow-lime: 0 0 9px rgba(168,204,60,.18);
  /* type */
  --font-ui: Inter, -apple-system, "Segoe UI", Roboto, sans-serif;
  --font-mono: "JetBrains Mono", "SF Mono", ui-monospace, monospace;
}
body { background: var(--bg); color: var(--text); font-family: var(--font-ui); }
```

### 9.2 JSON tokens

```json
{
  "color": {
    "bg": "#0A0C12", "surface": "#13161F", "elevated": "#1B2030", "highest": "#242B3D",
    "border": "#222838", "borderLight": "#2F3650", "hairline": "rgba(255,255,255,0.10)",
    "lime": "#A8CC3C", "limeLight": "#C5E06B", "limeDeep": "#93B82E",
    "cyan": "#00D4AA", "purple": "#7C4DFF", "amber": "#FFB300", "red": "#FF4444", "blue": "#4FC3F7",
    "text": "#FFFFFF", "textSecondary": "#9BA3B4", "textTertiary": "#7B8497", "ink": "#0A0C12"
  },
  "gradient": {
    "cta": ["#A8CC3C", "#93B82E"],
    "glass": ["rgba(25,29,40,0.72)", "rgba(12,14,20,0.88)"],
    "cyan": ["#00D4AA", "#4FC3F7"], "purple": ["#7C4DFF", "#B47CFF"]
  },
  "radius": { "sm": 4, "md": 10, "cta": 14, "card": 20, "glass": 24, "pill": 9999 },
  "space": { "xs": 4, "sm": 8, "md": 12, "lg": 16, "xl": 20, "2xl": 24, "3xl": 32 },
  "type": {
    "display": { "family": "Inter", "weight": 800, "size": 36, "line": 44, "tracking": -0.5 },
    "h1": { "family": "Inter", "weight": 700, "size": 28, "line": 36, "tracking": -0.3 },
    "overline": { "family": "Inter", "weight": 600, "size": 11, "line": 16, "tracking": 1.5, "case": "upper" },
    "body": { "family": "Inter", "weight": 400, "size": 15, "line": 22 },
    "statLarge": { "family": "JetBrains Mono", "weight": 700, "size": 48, "line": 56 },
    "statSmall": { "family": "JetBrains Mono", "weight": 600, "size": 24, "line": 32 }
  },
  "glow": "0 0 9px rgba(168,204,60,0.18)",
  "layout": { "pagePadding": 20, "gridGutter": 12, "sectionGap": 24, "tabBarH": { "ios": 88, "android": 72 } }
}
```

---

## 10. Do / Don't (guardrails)

**Do**
- Put **ink (`#0A0C12`) on every lime fill** — text and icons.
- Use **one accent (lime)** for brand; reserve cyan/purple/amber/red for their semantic meaning.
- Build surfaces as **dark glass**: translucent fill + 1px ~10% hairline + radius 20–24 + generous padding.
- Lead sections with an **overline eyebrow** (11px, UPPERCASE, +1.5, muted).
- Set big numerals in **JetBrains Mono**; headings in **heavy Inter (800–900)**.
- Enter content with **staggered `FadeInDown`**; confirm taps with a **0.96–0.98 press-scale**.
- Keep the **glow subtle** (`0 0 9px rgba(168,204,60,.18)`).
- Use **GRID for collections**, **snapping CAROUSELS for rails**, **pills/chips for filters**, **rings for progress**.

**Don't**
- ❌ White text/icons on lime (the cardinal sin).
- ❌ Neon/blown-out glows, heavy drop shadows, or pure-black flat cards.
- ❌ Decorate with the semantic colors, or introduce a second brand accent.
- ❌ Body copy below 12px; 11px is overlines/labels only. Faint text below `#7B8497` (fails AA).
- ❌ One-off hexes, radii, or spacings — pull a token.
- ❌ GSAP / Framer Motion (web-only) for the RN app — use **Reanimated**.
- ❌ Animate layout-affecting props in hot paths, or let a selected card change border *width* (only color) and reflow neighbors.

---

*Maintained alongside the live tokens. If you change `theme/colors.ts`, `theme/typography.ts`, `theme/spacing.ts`, `theme/shadows.ts`, or a `ui/` primitive, update this file in the same change.*
