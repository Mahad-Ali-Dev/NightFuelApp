# Zeitra — UI Image Generation Prompt Pack

> **Hand this entire file to GPT (or any image model).** It contains the brand rules, the reusable style blocks, and every image the app needs — so the whole set comes out as one cohesive, on‑brand collection instead of 80 random pictures.

---

## 0. How to use this file

1. Read **Section 1 (Brand & Theme)** and **Section 2 (Universal Rules)** — they apply to **every** image.
2. For each subject in **Section 4**, build the final prompt by taking the matching **Style Block** (① Object or ② Model) from Section 3 and dropping the subject into the `[ ]`.
3. Generate, then export per **Section 5 (Output Spec)** using the suggested filename.
4. **Keep lighting + material identical across the whole set** — that consistency is the entire point. If one looks off‑brand, regenerate it, don't ship a mismatched grid.

> **GPT instruction:** Generate one image per row in Section 4. Always start from the correct Style Block, substitute the bracketed subject, and obey every Universal Rule. Never add text, never add a background scene, always export with a transparent background.

---

## 1. Brand & theme — Zeitra

Zeitra is a premium chrono‑nutrition + fitness app for **shift workers** (nurses, drivers, night‑shift). The look is **dark, sleek, premium "dark‑glass,"** with one signature accent colour.

| Token | Value | Use |
|---|---|---|
| **Primary accent (lime)** | `#A8CC3C` | rim‑light, glow, the one pop of colour |
| **Secondary accent (cyan)** | `#00D4AA` | faint fill light only — never dominant |
| **Surface (near‑black)** | `#0A0C12` | the tile colour the icons sit on — but **export on transparent** |
| **Foreground (off‑white)** | `#F4F6FB` | reference for any light material |

**Mood:** modern, calm, aspirational, circadian / night‑shift, high‑end.
**Avoid:** busy backgrounds, any text or letters, cartoonish/childish styles, neon overload, harsh drop shadows, watermarks, more than one object per icon.

---

## 2. Universal rules (apply to every image)

- **Transparent background** — PNG with alpha. No box, no scene, no gradient backdrop.
- **One subject only**, centered, with generous padding around it.
- **1:1 square** composition.
- **Consistent lighting:** soft studio light + an **electric‑lime (`#A8CC3C`) rim‑light from the top‑left** + a faint cool‑cyan fill.
- **Material:** smooth matte‑and‑glass, soft rounded forms, premium finish.
- **No text, no ground shadow, no logos.**
- Same style + lighting + scale across the entire set, so the app grid reads as one family.

---

## 3. Style blocks

### ① OBJECT STYLE — food, nutrition, circadian, app sections, equipment

> A single premium 3D‑rendered app icon of **[SUBJECT]**, floating centered on a fully transparent background (PNG, alpha). Smooth matte‑and‑glass material with soft rounded forms. Studio lighting with an electric‑lime (#A8CC3C) rim‑light from the top‑left and a faint cool‑cyan fill light. No text, no ground shadow, no background scene. Clean, modern, high detail, 1:1 square, generous padding. Premium dark fitness‑app aesthetic.

### ② MODEL STYLE — muscle groups / training (generate a **male** AND a **female** version of each)

> A tasteful, aspirational 3D‑stylized **[male / female]** athlete in minimal dark athletic wear with a subtle lime accent, mid‑pose engaging the **[MUSCLE GROUP]**, flattering studio angle. Floating centered on a fully transparent background (PNG, alpha). Electric‑lime (#A8CC3C) rim‑light from the top‑left, faint cyan fill. Clean, respectful, non‑objectifying, no text, 1:1 square. Premium dark fitness‑app look.

> *Alternative if you don't want full models:* swap to OBJECT STYLE with a **stylized anatomical muscle highlight** (e.g. "a stylized human torso with the chest muscle group glowing in lime"). Pick one approach and stay consistent.

---

## 4. Full subject list

> Style column tells you which block to use. Filename column is the suggested export name (kebab‑case).

### 🍽 Meals — shift windows & macros · *Style ①*

| Subject `[SUBJECT]` | Filename |
|---|---|
| a pre‑shift fuel plate (balanced meal) | `meal-pre-shift.png` |
| a compact mid‑shift snack box | `meal-mid-shift.png` |
| a post‑shift recovery meal bowl | `meal-recovery.png` |
| a light sleep‑prep meal | `meal-sleep-prep.png` |
| a bowl of oatmeal topped with blueberries (breakfast) | `meal-breakfast.png` |
| a balanced lunch plate | `meal-lunch.png` |
| a balanced dinner plate | `meal-dinner.png` |
| a grilled chicken breast (protein) | `macro-protein.png` |
| a small bowl of cooked rice (carbs) | `macro-carbs.png` |
| a halved avocado (healthy fats) | `macro-fats.png` |
| a bundle of leafy greens (fiber) | `macro-fiber.png` |
| a frosted glass of water with a lime wedge (hydration) | `meal-hydration.png` |
| a steaming coffee cup (caffeine) | `meal-caffeine.png` |
| an electrolyte / mineral‑salt sachet | `meal-electrolytes.png` |

### 🥗 Food groups & diet modes · *Style ①*

| Subject | Filename |
|---|---|
| a cluster of fresh vegetables | `food-vegetables.png` |
| a cluster of fresh fruit | `food-fruits.png` |
| a small stack of grains / bread | `food-grains.png` |
| a glass of milk + cheese wedge (dairy) | `food-dairy.png` |
| a cut of lean red meat | `food-meat.png` |
| a fillet of fish (seafood) | `food-seafood.png` |
| a small pile of nuts & seeds | `food-nuts-seeds.png` |
| a bowl of legumes / beans | `food-legumes.png` |
| a single green leaf (vegan) | `diet-vegan.png` |
| an egg + cheese (vegetarian) | `diet-vegetarian.png` |
| an avocado + egg (keto) | `diet-keto.png` |
| a crescent moon over a plate (halal) | `diet-halal.png` |
| a fish symbol (pescatarian) | `diet-pescatarian.png` |
| a wheat sprig with a slash (gluten‑free) | `diet-gluten-free.png` |
| a date fruit beside a crescent moon (Ramadan) | `diet-ramadan.png` |

### 💪 Muscle groups — Training · *Style ② — make `-male` AND `-female`*

| `[MUSCLE GROUP]` | Filenames |
|---|---|
| chest | `muscle-chest-male.png` · `muscle-chest-female.png` |
| back | `muscle-back-male.png` · `muscle-back-female.png` |
| shoulders | `muscle-shoulders-male.png` · `muscle-shoulders-female.png` |
| biceps | `muscle-biceps-male.png` · `muscle-biceps-female.png` |
| triceps | `muscle-triceps-male.png` · `muscle-triceps-female.png` |
| forearms | `muscle-forearms-male.png` · `muscle-forearms-female.png` |
| upper arms | `muscle-upper-arms-male.png` · `muscle-upper-arms-female.png` |
| legs (quadriceps) | `muscle-legs-male.png` · `muscle-legs-female.png` |
| calves | `muscle-calves-male.png` · `muscle-calves-female.png` |
| hips / glutes | `muscle-hips-male.png` · `muscle-hips-female.png` |
| waist / core | `muscle-waist-male.png` · `muscle-waist-female.png` |
| neck | `muscle-neck-male.png` · `muscle-neck-female.png` |
| full‑body cardio (running pose) | `muscle-cardio-male.png` · `muscle-cardio-female.png` |

### 🏋 Equipment & training categories · *Style ①*

| Subject | Filename |
|---|---|
| a barbell (gym) | `equip-gym.png` |
| a resistance band (home) | `equip-home.png` |
| a minimalist body silhouette (bodyweight) | `equip-bodyweight.png` |
| a single dumbbell | `equip-dumbbell.png` |
| a cable / weight machine | `equip-machine.png` |
| a rolled yoga mat (stretch & mobility) | `equip-stretch.png` |

### 🌙 Circadian / Shifts / Sleep · *Style ①*

| Subject | Filename |
|---|---|
| a crescent moon with two small stars (sleep) | `circadian-sleep.png` |
| a sun / bright lamp (light exposure) | `circadian-light.png` |
| a coffee cup beside a clock (caffeine cutoff) | `circadian-caffeine-cutoff.png` |
| a moon‑shaped pill (melatonin window) | `circadian-melatonin.png` |
| a cozy dimmed lamp (wind‑down) | `circadian-winddown.png` |
| a sun (day shift) | `shift-day.png` |
| a sunset (evening shift) | `shift-evening.png` |
| a moon (night shift) | `shift-night.png` |
| circular rotation arrows (rotating shift) | `shift-rotating.png` |
| a plate beside a clock (meal timing) | `circadian-meal-timing.png` |
| a 24‑hour clock face with a lime arc | `circadian-24h-clock.png` |

### 📱 App sections · *Style ①*

| Subject | Filename |
|---|---|
| a dashboard / home tile | `section-dashboard.png` |
| a fork + knife plate (meals) | `section-meals.png` |
| a dumbbell (training) | `section-training.png` |
| a crescent moon (sleep) | `section-sleep.png` |
| a shift clock (shifts) | `section-shifts.png` |
| a friendly glowing AI orb with a lime glow (Coach Ria) | `section-coach.png` |
| three connected person figures (community) | `section-community.png` |
| a rising progress chart (progress) | `section-progress.png` |
| a gear (settings) | `section-settings.png` |

---

## 5. Output spec

- **Format:** PNG with a **transparent** background.
- **Size:** **1024×1024** preferred (512×512 minimum).
- **Naming:** exactly the kebab‑case filenames above.
- **Delivery:** a flat folder of files, or a zip.
- Muscle groups ship in **pairs** (`-male` + `-female`) so the app can match the user's selected gender.

---

## 6. Tips for a clean, consistent set

- Generate a **single reference image first** (e.g. `macro-protein.png`), lock in the lighting/material you like, then tell GPT *"match the exact lighting, material, lime rim‑light and camera framing of the reference"* for everything else.
- Do the **OBJECT** set in one session and the **MODEL** set in another, so each batch stays internally consistent.
- Re‑roll anything where the lime rim‑light, framing, or padding drifts — one odd tile breaks the grid.
- Keep subjects **simple and singular** — a single recognizable object reads far better at app‑tile size than a busy scene.

---

*Total: ~80 images (≈54 object + 26 model). This covers every category the Zeitra app uses today; once the code‑side audit finishes I'll flag any tile here the app doesn't actually need, and any extra one it does, so you don't waste generations.*
