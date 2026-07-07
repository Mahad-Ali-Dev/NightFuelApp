# Zeitra — UI Mockup Spec 06: Community & Social

> Paste-ready spec for GPT (or any designer) to render every Community & Social screen of the Zeitra mobile app. Read top to bottom; each screen section is self-contained and exhaustive. All values below are taken from the real React Native source — nothing is invented.

---

## ZEITRA DESIGN SYSTEM (condensed — every mockup MUST follow this)

**Brand.** Athletic, premium, high-contrast, energetic. Tagline "STRONG TODAY. BETTER EVERYDAY." Logo = lime "Z" + dumbbell on black.

**Colors (exact tokens).**
- Background ink `#0A0C12` (deep near-black, `background.primary`). Card surface `#13161F` (`background.secondary`). Elevated surface `#1B2030` (`background.tertiary`). Higher elevation `#242B3D` (`background.quaternary`).
- Borders / hairlines: default `#222838` (`border.default`), light `#2F3650` (`border.light`), focus/lime `#A8CC3C` (`border.focus`). Glass cards use a 1px `rgba(255,255,255,0.10)` hairline.
- **PRIMARY = softened lime `#A8CC3C`** — this is the token literally named `accent.coral` / `gradients.coral` / `gradients.coralCta` in code (post-rebrand the "coral" tokens hold lime). Lime-light `#C5E06B` (`coralLight`), lime-deep `#93B82E` (`coralDark`, also `accent.pink`). Treat EVERY "coral" / "pink" reference in this spec as Zeitra lime.
- Functional accents: cyan `#00D4AA` (`accent.cyan` = success/progress/"pts"), purple `#7C4DFF` (`accent.purple` = AI/coach), purple-light `#9E7BFF`, purple-dark `#6233CC`, amber `#FFB300` (`accent.amber` = caution/trophy/rank-1), emerald `#10B981` (`accent.emerald` = joined/active), orange `#F97316` (`accent.orange` = rank-3 medal), red `#FF4444` (`accent.red`/`error` = danger/failed). Blue `#4FC3F7` (`accent.blue` = info).
- Text: primary `#FFFFFF`, secondary/muted `#9BA3B4`, tertiary/faint `#7B8497`, inverse (ink) `#0A0C12`.
- Gradients: `coral`/`coralCta` = `['#A8CC3C','#93B82E']` (lime, brand + CTA fill), `cyan` = `['#00D4AA','#4FC3F7']`, `purple` = `['#7C4DFF','#B47CFF']`, `dark` = `['#13161F','#0A0C12']`, `card` = `['rgba(25,29,40,0.72)','rgba(12,14,20,0.88)']`.

**CTAs.** LIME fill with INK (`#0A0C12`) text + icons — NEVER white on lime. Bold (weight 800), rounded radius 14, subtle (not neon) lime glow. The shared `CtaButton`/`Button(primary)` renders a left-to-right `coralCta` lime gradient (`absoluteFill`), ink label (letter-spacing 0.3), gap 8 between icon + label, `overflow:hidden`. Sizes: sm minHeight 40 / font 13 / icon 15; md (default) minHeight 48 / font 15 / icon 17; lg minHeight 56 / font 17 / icon 19. Disabled/loading → opacity 0.6.

**Cards.** Dark-glass surfaces. `GlassCard` = outer View with radius (default 24 / `2xl`), 1px `rgba(255,255,255,0.10)` border, `overflow:hidden`, optional soft lime/accent glow, wrapping a frosted dark blur fill (intensity 40). Default card radius 16–24; generous padding (16–20). Non-glass `Card variant="glass"` is the same frosted look.

**Typography (Inter UI + JetBrains Mono for stats).**
- `display` Inter-ExtraBold 36/44, ls −0.5. `h1` Inter-Bold 28/36 ls −0.3. `h2` Inter-Bold 24/32 ls −0.2. `h3`/`heading` Inter-SemiBold 20/28. `subtitle`/`subhead` Inter-SemiBold 16/24. `body` Inter-Regular 15/22. `bodySm` 14/20. `caption`/`captionMedium` 12/16. `overline` Inter-SemiBold 11/16, ls 1.5, UPPERCASE.
- Stats (mono): `statLarge` 48/56 bold, `statMedium` 32/40, `statSmall` 24/32, `statTiny` 16/22.

**Layout.** 4px grid: spacing xs 4 / sm 8 / md 12 / lg 16 / xl 20 / 2xl 24 / 3xl 32 / 4xl 40 / 5xl 48. Radius sm 4 / md 10 / lg 14 / xl 20 / 2xl 24 / 3xl 28 / full 9999. Icon sizes xs 16 / sm 20 / md 24 / lg 28 / xl 32. Use overline section headers, GRID layouts (2–3 col), horizontal snapping CAROUSELS for collections, pill/chip filters, circular progress RINGS, stat cards.

**Bottom tab bar (Zeitra, 5 slots).** Floating, absolute, transparent over a dark blur (intensity 40), 1px top hairline `rgba(255,255,255,0.10)`, height 88 iOS / 72 Android. Slots: **Home** (home icon) · **Train** (barbell) · **centre raised Quick-Log disc** (58px lime `coral` gradient circle, white "+" 30px, ink "Log" caption under it, elevated lime shadow — opens a Meal/Workout/Sleep chooser sheet) · **Feed** (people icon → Community) · **More** (menu icon). Active = lime icon + label (10px, weight 600) + a 4px lime dot under the active icon; inactive = faint `#7B8497`. A purple Ria AI FAB (56px `purple` gradient disc, white sparkles icon, cyan notification dot) floats bottom-right above the bar on every tab.
  - **IMPORTANT for these screens:** Only the **Community Feed** (screen 1) is a tab destination (reached via the **Feed** tab, so render the bottom tab bar with **Feed** active). ALL other screens in this section are pushed stack screens with their OWN top header + back arrow and **NO bottom tab bar** (they cover it). Do not draw the tab bar on screens 2–11.

**Motion (premium).** Reanimated entrance animations: `FadeInDown` with staggered per-section delays, springy card reveals, animated progress rings/bars, pressed-scale 0.97 on cards/CTAs (Button uses 0.98; Quick-Log disc 0.92). Note: the current source uses `activeOpacity` 0.85 on most pressables and skeleton-shimmer loaders; the mockups should ADD the staggered FadeInDown entrance + pressed-scale described per screen (this is the intended Zeitra polish).

**Global header pattern (stack screens).** Row, 20px horizontal padding, paddingTop = safe-area-top + 16–20, 16px bottom padding, 1px bottom hairline `border.default`. Left = 40×40 back button (`arrow-back` 22–24px, white; on some screens wrapped in a `background.secondary` rounded-20 chip with a 1px border). Centre = screen title (`h2` or `h3`, white). Right = a 40px spacer (or action icons). Status bar = light.

---

# SCREEN 1 — Community Feed  ·  `(community)/index.tsx`

### 1. Purpose
The social home: active-challenges carousel, a create-post entry, and the scrollable post feed. Entry point from the **Feed** tab.

### 2. Top-to-bottom layout
1. **Header** (no back button — this is a tab root). Left: title **"Community"** (`h1`, 28px white). Right: two 40×40 round icon buttons, 12px apart:
   - Achievements button — `trophy-outline` 22px in **amber `#FFB300`**, on a `withAlpha(amber,0.12)` tinted circle.
   - Leaderboard button — `podium-outline` 22px white, on a `background.tertiary` circle.
2. **Scroll body** (`paddingBottom:120`, pull-to-refresh with cyan spinner tint).
3. **Active Challenges strip** (section, marginTop 28 / marginBottom 32):
   - Section header row (20px padding): overline **"ACTIVE CHALLENGES"** (`#9BA3B4`) on the left; **"SEE ALL"** overline link in **cyan `#00D4AA`** on the right (hidden in the loading state).
   - Horizontal carousel (gap 12, 20px side padding) of up to 3 **challenge cards**: each `width 160`, padding 18, `background.tertiary` fill, radius 24 (`2xl`), 1px `border.default`. Inside: a 44×44 rounded-22 icon disc in `withAlpha(emerald,0.12)` with an emerald glow holding a `flash` icon (20px emerald `#10B981`); below (marginTop 14) the challenge **title** (`subhead`, white, 1 line); below (marginTop 2) **"{N} participating"** (`caption`, muted).
4. **Create-Post button** (full-width row, 20px margins, padding 18, `background.secondary`, radius 24, 1px border, marginBottom 24): a 32×32 rounded mini-avatar disc (`background.tertiary`) with a `person` icon (16px, tertiary); text **"What's on your mind?"** (`body`, muted, 16px left margin); a trailing `image-outline` icon (20px, **cyan**) pushed to the far right.
5. **Feed list** (20px horizontal padding): a vertical stack of **Post cards**.

**Post card** (`GlassCard`, radius 24, marginBottom 16, inner padding 18):
   - Header row: 32×32 rounded mini-avatar (author `avatarUrl` image, else `person` icon 16px tertiary on `background.tertiary`); to the right (12px) the author **name** (`subhead`, white, **bold**) and under it **"{relative time} ago"** (`caption`, muted, via date-fns `formatDistanceToNow`).
   - **Content** text (`body`, **secondary `#9BA3B4`**, marginVertical 16, lineHeight 22).
   - Optional **post image** (full width, height 220, radius 14 (`lg`), cover, marginBottom 12) — only if a safe https image URL exists.
   - **Actions row** (1px top hairline `border.default`, paddingTop 16, gap 24): Like = `heart-outline` 20px tertiary + like count (`caption`, muted, bold); Comment = `chatbubble-outline` 18px tertiary + comment count (`caption`, muted, bold); Share = `share-social-outline` 18px tertiary (no count).

### 3. Data / text shown
- Header title "Community". Section label "ACTIVE CHALLENGES", link "SEE ALL".
- Challenge card: `title`, "{participants} participating".
- Create-post placeholder: "What's on your mind?".
- Post: author `name` (fallback "User"), "{time} ago", `content`, `likes` count, `commentsCount` count.
- Share sheet message: `{author} on Zeitra:\n\n"{content}"` (author falls back to "A Zeitra member").
- Feed pulls up to 20 posts. `Post` shape: `{ id, userId, content, imageUrl?, likes, commentsCount, createdAt, author?{ id?, name, avatarUrl? } }`. `Challenge` shape: `{ id, title, description, participants, myProgress? }`.

### 4. Interactions + navigation
- Trophy → push `/(community)/achievements`. Podium → push `/(community)/leaderboard`.
- "SEE ALL" or any challenge card → push `/(community)/challenges`.
- Create-post row → push `/(modals)/create-post`.
- Post Like → `likePost(id)` mutation, then invalidate feed (optimistic count bump). Comment → push `/(community)/{postId}`. Share → native `Share.share` sheet.
- Pull-to-refresh → refetch feed + invalidate challenges.

### 5. Loading / empty / error
- **Challenges:** loading → a non-scrolling row of 2 **ChallengeSkeleton** cards (160-wide, same footprint: 44px round skeleton + title line + subtitle line). Empty/errored/undefined → the whole strip is silently omitted (secondary section).
- **Feed loading:** 3 **PostSkeleton** cards (avatar + name/time lines + two body lines + three action chips).
- **Feed error:** `EmptyState` icon `cloud-offline-outline`, title "Couldn't load the feed", subtitle "Something went wrong fetching community posts. Check your connection and try again.", lime button **"Try Again"**.
- **Feed empty:** `EmptyState` icon `chatbubbles-outline`, title "No posts yet", subtitle "Be the first to share a win, ask a question, or start the conversation.", lime button **"Create a post"**.

### 6. Exact styling per element
- Header icon circles 40×40 r20. Challenge card r24, border `#222838`. Create-post r24. Post card = GlassCard r24 with 1px `rgba(255,255,255,0.10)` border. Mini-avatars 32×32 r16. Post image r14. Action hairline `#222838`.
- Section overline `#9BA3B4`; "SEE ALL" cyan `#00D4AA`. Emerald challenge icon + glow. Counts muted bold.

### 7. Animations
- ADD: challenge cards FadeInDown staggered (carousel reveal), post cards FadeInDown staggered by index, pressed-scale 0.97 on every card/button. Like tap → heart pop. Refresh spinner cyan. Glass cards keep a subtle glow.

---

# SCREEN 2 — Post Detail  ·  `(community)/[postId].tsx`

### 1. Purpose
A single post with its full content, like/comment counts, threaded comments, and a sticky reply composer. Resolves the post by id (deep-link safe).

### 2. Top-to-bottom layout
1. **Header**: back arrow (24px white) · centre title **"Post"** (`h2`) · 40px right spacer. 1px bottom hairline.
2. **Scroll body** (`paddingBottom:100`), inside a `KeyboardAvoidingView`.
3. **Original post** (20px padding):
   - Author row: 32×32 mini-avatar (image or `person`), name (`subhead`, white, bold) + "{time} ago" (`caption`, muted).
   - **Content** (`body`, secondary, marginVertical 20, fontSize 16, lineHeight 24).
   - Optional **post image** (full width, height 300, radius 20 (`xl`), cover, marginBottom 20).
   - **Divider** (1px, `border.default`, marginVertical 20).
   - **Interaction stats** line: "**{likes}** Likes  •  **{commentsCount}** Comments" — the numbers are `statTiny` mono white, the words are `caption` muted, separated by a bullet.
4. **Comments section** (own panel: `background.secondary` fill, an 8px-thick top border in `border.default` as a visual separator, padding 20):
   - Overline **"COMMENTS"** (muted, marginBottom 20).
   - **Comment rows**: 32×32 mini-avatar + (12px right) a row with name (`caption`, white, bold) and "{time} ago" (`caption`, muted, 11px), then the comment **text** (`body`, secondary, marginTop 4). Each row paddingVertical 12, 1px bottom hairline.
5. **Sticky comment input bar** (bottom, 1px top hairline, `background.primary`, paddingBottom = max(safeArea,12)+12):
   - Multiline **TextInput**, placeholder **"Reply to this post..."** (placeholder tertiary), fill `background.secondary`, radius 25, minHeight 44 / maxHeight 100, fontSize 15.
   - **Send button** 44×44 round (r22), a lime (`gradients.coral`) gradient disc with a white `send` icon (18px); opacity 0.5 + no glow when empty, full + lime glow when text present; disabled while sending.

### 3. Data / text shown
- Title "Post". Author name (fallback "User"), "{time} ago", content. Stats "{likes} Likes • {commentsCount} Comments". Comments header "COMMENTS". Each comment: author name (fallback "User"), "{time} ago", text. Input placeholder "Reply to this post...". `Comment` shape: `{ id, userId, text, createdAt, author?{ name, avatarUrl? } }`.

### 4. Interactions + navigation
- Back → `router.back()`. Type + Send → `addComment(postId, text)`, clears input, invalidates feed, refetches comments.
- Errors → `Alert("Error", message)`.

### 5. Loading / empty / error
- **Post loading:** header + a skeleton scaffold (avatar + name/time lines, three body lines, divider, one short line).
- **Post error / not found:** header + full-screen `EmptyState` — error: `cloud-offline-outline`, "Couldn't load this post", "Something went wrong fetching this post. Check your connection and try again.", button **"Try Again"**. Not-found: `alert-circle-outline`, "Post not found", "This post may have been removed or is no longer available.", button **"Go Back"**.
- **Comments loading:** 3 comment-row skeletons (avatar + name line + body line). **Comments error:** `EmptyState` `cloud-offline-outline`, "Couldn't load comments", "Something went wrong fetching the replies. Check your connection and try again.", **"Try Again"**. **Comments empty:** `EmptyState` `chatbubble-ellipses-outline`, "No comments yet", "Be the first to reply and start the conversation." (no button).

### 6. Exact styling per element
- Post image r20, post-detail content fontSize 16/24. Divider 1px `#222838`. Comments panel `#13161F` with 8px top border. Send disc lime gradient r22 with lime glow when active.

### 7. Animations
- ADD: post + comment rows FadeInDown stagger; send disc pressed-scale 0.9 + lime glow pulse on enable; keyboard-aware composer slide.

---

# SCREEN 3 — Achievements  ·  `(community)/achievements.tsx`

### 1. Purpose
The user's level/XP and badge collection: a hero XP card, an earned-badges carousel, and the full badge catalog grouped by tier.

### 2. Top-to-bottom layout
1. **Header**: back arrow · centre title **"Achievements"** (`h2`) · 40px spacer (no bottom hairline here; paddingTop = safe-area + 16).
2. **Scroll body** (`paddingBottom:120`).
3. **XP / Level hero card** (20px margins, marginTop 16, radius 24, 1px border, padding 20, `overflow:hidden`) — a **purple gradient** `[background.tertiary, accent.purpleDark, background.tertiary]` diagonal fill with a purple-tinted border (`withAlpha(purple,0.35)`) and a **purple glow**:
   - Left column: overline **"CURRENT LEVEL"** (white@0.7); the **level number** (`statLarge` 48px mono white); **"{xp} XP total"** (`body`, white@0.75).
   - Right: an 80×80 circle (2px white@0.2 border, white@0.08 fill) with the **earned badge count** (`statSmall` mono white) over the label **"BADGES"** (10px white@0.6).
   - **Progress bar** (marginTop 16): a row with **"LEVEL {n}"** (left) and **"LEVEL {n+1} · {nextLevelXp} XP"** (right), both 10px white@0.6; a 6px track (white@0.12) with a **purple-light `#9E7BFF`** fill at `{progress}%`; then right-aligned **"{p}% to next level"** (10px white@0.5).
4. **Earned badges** (only if any; marginTop 28): heading **"🏅 Your Badges ({n})"** (`h3` white); a horizontal carousel (20px padding, gap 12) of **EarnedBadgeCard**s — each 120 wide, a tier-tinted gradient `[withAlpha(tierColor,0.25), withAlpha(tierColor,0.08)]`, radius 16, 1px tier-tinted border, padding 14, centered: the **emoji** (32px), the badge **name** (`caption` white bold, 12px), and a tier pill (`withAlpha(tier,0.2)` bg) with the **TIER** label (9px tier color, bold, uppercase).
5. **Full catalog** header: **"📚 All Badges"** (`h3`, marginTop 32) and a subtitle **"{earned} of {total} unlocked"** (`body`, muted).
6. **Tier sections** (order: Platinum → Gold → Silver → Bronze; only tiers that have badges):
   - Tier header: an 8px tier-color dot + **"{TIER} TIER"** label (`caption`, tier color, bold, ls 1, 11px, uppercase).
   - A 3-column **grid** (gap 10, 16px side margins) of **CatalogBadgeCard**s. Card width = (screen−52)/3, radius 14, 1px border, padding 12, centered, `background.secondary`. Locked cards are dimmed to opacity 0.5 with a default border; unlocked cards use a tier-tinted border. Inside: **emoji** (26px, dimmed to 0.4 if locked), **name** (`caption` 11px, white if unlocked else tertiary, 2 lines), **description** (`caption` 9px muted, 2 lines), an **"+{xp} XP"** pill (tier-tinted bg, 9px tier text) when `xpReward>0`, and — if unlocked — a top-right **check badge** (18px round tier-color circle with an ink checkmark).

### 3. Data / text shown
- "CURRENT LEVEL", level, "{xp} XP total", badge count + "BADGES". Progress: "LEVEL n", "LEVEL n+1 · {xp} XP", "{p}% to next level". "🏅 Your Badges (n)", "📚 All Badges", "{earned} of {total} unlocked", "{TIER} TIER". Badge: emoji, name, description, "+{xp} XP", tier.
- **Tier palette:** bronze `#CD7F32` (grad to `#A0522D`), silver `#C0C0C0` (→`#808080`), gold `#FFD700` (→`#FFA500`), platinum `#E5E4E2` (→`#B0C4DE`).
- `Badge` shape: `{ id, key, name, description, iconEmoji, tier, xpReward, awardedAt?, seen? }`. `UserScore`: `{ userId, xp, level, xpForNextLevel }`. XP-to-next math: `prevLevelXp = level>1 ? 100*(level-1)*level/2 : 0`; progress = (xp−prev)/(next−prev).

### 4. Interactions + navigation
- Back → `router.back()`. Badge cards are display-only (one a11y node each: "{name} badge, {tier} tier, earned" / "{name} badge, {locked|unlocked}"). Error retry refetches badges + catalog + score.

### 5. Loading / empty / error
- **Loading:** a scaffold mirroring the layout — an xpCard-shaped block (level/XP/badge-count placeholders + 6px progress track) and a 6-tile catalog grid of `SkeletonCard`s (height 130, r14).
- **Error:** `EmptyState` `cloud-offline-outline`, "Couldn't load achievements", "Something went wrong fetching your badges and level. Check your connection and try again.", **"Try Again"**.
- **Empty catalog:** `EmptyState` `trophy-outline`, "No badges yet", "Badges will appear here as the catalog fills out. Keep training and check back soon." (no button).

### 6. Exact styling per element
- XP card r24 purple gradient + purple glow. Badge count circle 80×80 r40. Progress track 6px r3, fill purple-light. EarnedBadgeCard 120 wide r16 tier gradient. CatalogBadgeCard r14, locked opacity 0.5, check badge 18px tier circle with ink check.

### 7. Animations
- ADD: XP number count-up + progress bar fill animation on mount; earned-badge carousel FadeInDown stagger; catalog tiles springy reveal; tier sections FadeInDown by group.

---

# SCREEN 4 — Challenges  ·  `(community)/challenges.tsx`

### 1. Purpose
Browse community challenges, JOIN them, and log incremental progress inline.

### 2. Top-to-bottom layout (inside a `KeyboardAvoidingView`)
1. **Header**: back arrow · centre title **"Community Challenges"** (`h3`) · 40px spacer · 1px bottom hairline.
2. **Scroll body** (padding 20, `paddingBottom:100`, `keyboardShouldPersistTaps`).
3. **Challenge cards** — each a `GlassCard` (radius 20 (`xl`), marginBottom 16). Joined cards get an **emerald border** (`withAlpha(emerald,0.4)`) + **emerald glow**.
   - **JOINED pill** (only if joined): top-left chip, `withAlpha(emerald,0.15)` bg, r8, `checkmark-circle` 12px emerald + **"JOINED"** (10px emerald bold), marginLeft 20 / marginTop 14.
   - **Body** (row, padding 20 / paddingTop 10):
     - 52×52 icon disc, r14, `withAlpha(cyan,0.1)` fill + **cyan glow**, holding a `flash` icon (28px **cyan**).
     - Details column (16px left): **title** (`heading` 17px white); **description** (`body`, muted, marginTop 4); a **meta row** (marginTop 10): `people` icon 13px tertiary + "{participants} joined"; if joined, a 3px dot separator then `stats-chart` 13px emerald + "**{myProgress}** logged" (the number `statTiny` emerald 13px, bold).
     - **CTA**:
       - Not joined → a lime **`Button` "JOIN CHALLENGE"** (variant primary, height 44, marginTop 14, full lime gradient + ink text).
       - Joined → an outlined **"LOG PROGRESS"** pill (1px `withAlpha(emerald,0.5)` border, `withAlpha(emerald,0.08)` fill, r20, padding 14×8): `add-circle-outline` 16px emerald + "LOG PROGRESS" (emerald bold). When expanded it becomes a `chevron-up` + **"CANCEL"**.
   - **Inline progress panel** (joined + expanded): a top-bordered section (1px `withAlpha(border,0.6)`, padding 20×16) with helper text "Enter how much you've completed (steps, reps, km — whatever this challenge tracks):" (`caption`, muted), then a row: a numeric **TextInput** (flex, height 46, r12, 1px border, `background.primary` fill, placeholder **"e.g. 5000"** tertiary) + a 46×46 emerald **submit** square (r23, `checkmark` 22px white, or a spinner while pending).

### 3. Data / text shown
- Title "Community Challenges". Per card: title, description, "{participants} joined", "{myProgress} logged", "JOINED". Buttons "JOIN CHALLENGE" / "LOG PROGRESS" / "CANCEL". Panel helper text + placeholder "e.g. 5000".
- Alerts: join success "Joined!" / "You are now part of this challenge. Keep going!"; progress success "Progress Logged! 🔥" / "Keep it up — your effort counts toward the leaderboard."; invalid value "Invalid value" / "Please enter a positive number."; generic "Error" / message.

### 4. Interactions + navigation
- Back → `router.back()`. "JOIN CHALLENGE" → `joinChallenge(id)` then refetch + success alert. "LOG PROGRESS" toggles the inline panel (one card open at a time via `expandedId`). Submit → validates a positive number, calls `updateChallengeProgress(id, value)`, clears input, collapses, success alert.

### 5. Loading / empty / error
- **Loading:** 3 `GlassCard` skeletons (52px icon square + title/desc/meta/button lines).
- **Error:** `EmptyState` `cloud-offline-outline`, "Couldn't load challenges", "Something went wrong fetching the community challenges. Check your connection and try again.", **"Try Again"**.
- **Empty:** `EmptyState` `trophy-outline`, "No active challenges", "There are no community challenges running right now. Check back soon to compete and earn XP." (no button).

### 6. Exact styling per element
- Card = GlassCard r20; joined → emerald border + glow. Icon disc 52×52 r14 cyan-tint + cyan glow, flash cyan. JOINED pill emerald. LOG PROGRESS pill emerald outline. Submit square 46 r23 emerald.

### 7. Animations
- ADD: cards FadeInDown stagger; inline progress panel slide/expand; submit pressed-scale; success "🔥" micro-celebration. Joined glow is steady.

---

# SCREEN 5 — Leaderboard  ·  `(community)/leaderboard.tsx`

### 1. Purpose
Ranked XP leaderboard: a top-3 podium, a virtualized list for ranks 4+, per-row follow, and a sticky "My Rank" footer.

### 2. Top-to-bottom layout
1. **Header**: back arrow · centre title **"Leaderboard"** (`h2`) · 40px spacer · 1px bottom hairline.
2. **Podium** (top 3) — a row (`justify space-around`, paddingVertical 40): three **PodiumItem**s. Rank 1 is centered and raised (marginTop −20), avatar 80px; ranks 2/3 avatars 72px. Each: a circular avatar (3px medal-color border; rank-1 gets an **amber glow**) with a **rank badge** (24px circle, medal color, 2px `background.primary` border, ink rank number bottom-right); below, the **name** (`subhead`, white, bold, 1 line); **"{score} pts"** (`statTiny` **cyan**); and (unless self) a compact **Follow** pill. Medal colors: rank 1 **amber `#FFB300`**, rank 2 **secondary `#9BA3B4`**, rank 3 **orange `#F97316`**.
3. **List** (ranks 4+) — a `FlatList` of fixed-height (64px) **LeaderRow**s: rank number (`statTiny` muted, 30px wide, centered; "–" if null) · 32px avatar · name (`subhead` white, 1 line; bold + " (You)" if self) · (unless self) a **Follow** pill · the **score** (`statTiny` cyan) at the far right.
4. **Sticky "My Rank" footer** (absolute bottom, 16px side padding, safe-area paddingBottom): the current user's `LeaderRow` rendered as a **self card** — wrapped in a `GlassCard` (radius 14, **cyan glow**, cyan-tinted 0.3 border) so it reads as a highlighted "this is you" surface; the row shows the user's rank (or "–"), name + " (You)", and score; no Follow button.

**Follow pill (`FollowButton`).** A small pill (height 30, r15, 1px border, padding 12). Not-following: `withAlpha(coral/lime,0.16)` fill, lime-tinted border, an `add` icon (14px lime) + **"Follow"** (lime, bold). Following: transparent fill, light border, a `checkmark` (14px secondary) + **"Following"** (secondary). Toggles optimistically.

### 3. Data / text shown
- Title "Leaderboard". Per row/podium: display name (fallback chain displayName → userName → name → "Athlete"), score (`score ?? xp ?? 0`, `.toLocaleString()`) + "pts" on podium, rank. Self suffix " (You)". Follow/Following labels.
- Row shape (enriched): `{ userId, displayName?, avatarUrl?, name?, userName?, xp?, score?, level?, rank? }`. Leaderboard fetch returns `{ leaderboard: [...], myScore }` (limit 50). Social shape `{ isFollowing, followers, following }`.

### 4. Interactions + navigation
- Back → `router.back()`. Tap any podium item or row → push `/(community)/userProfile?userId={id}`. Follow pill → `followUser`/`unfollowUser` (optimistic flip of cached social, rollback on error). Self rows never show a Follow button.

### 5. Loading / empty / error
- **Loading:** a podium skeleton (three avatar circles, centre taller) + 7 row skeletons (rank + 32px avatar + name line), each 64px tall.
- **Error:** `EmptyState` `cloud-offline-outline`, "Couldn't load the leaderboard", "Something went wrong fetching the rankings. Check your connection and try again.", **"Try Again"**.
- **Empty:** `EmptyState` `podium-outline`, "No rankings yet", "Earn XP by logging workouts, sleep, and challenge progress to climb the leaderboard." (no button).

### 6. Exact styling per element
- Podium avatars 80/72, 3px medal border, rank-1 amber glow; rank badge 24px. Scores cyan mono. List rows 64px. Self row = GlassCard r14 cyan glow + cyan-tint border. Follow pill 30px r15.

### 7. Animations
- ADD: podium pop-in (rank 1 last, springy), list rows FadeInDown stagger, self-footer slide-up, Follow pill press + label crossfade.

---

# SCREEN 6 — Message Requests  ·  `(community)/requests.tsx`

### 1. Purpose
Instagram-DM-style inbox of incoming message requests from people you don't follow; Accept (opens the unlocked chat) or Decline.

### 2. Top-to-bottom layout
1. **Header** (height 64, paddingTop = safe-area-top): back button in a 40×40 `background.secondary` rounded-20 chip (1px border, `arrow-back` 22px) · centre title **"Requests"** (`h3`) · 40px spacer · 1px bottom hairline.
2. **List** — a `FlatList` (16px padding) of **RequestRow**s, each a `GlassCard` (marginBottom 12, inner padding 16):
   - **Identity block** (one a11y node): a 48px `Avatar` (image or lime-gradient initials, 2px `withAlpha(purple,0.3)` border) + (14px right) the peer **name** (`subhead`, white, bold, 1 line) and **"wants to send you a message"** (`caption`, muted, 1 line).
   - **Actions row** (marginTop 16, right-aligned): a **"Decline"** outline button (minHeight 40, r14, 1px light border, secondary bold label) + an **"Accept"** lime `CtaButton` (size sm, r14, minWidth 96, ink label). Both dim (opacity 0.6) + disable once the row's action fires.

### 3. Data / text shown
- Title "Requests". Per row: peer display name (fallback "User {first4 of id}" → "Athlete"), subtitle "wants to send you a message". Buttons "Decline" / "Accept". `MessageRequest` = a `Conversation` with `requestState:'pending'` and a `peer{ userId, displayName, avatarUrl? }`.

### 4. Interactions + navigation
- Back → `router.back()`. **Accept** → optimistically removes the row, calls `acceptRequest(conversationId)`, then pushes `/messages/{peerUserId}` (opens the now-unlocked chat). **Decline** → optimistically removes the row, calls `declineRequest`. On error either mutation refetches so a failed action doesn't silently drop the row.

### 5. Loading / empty / error
- **Loading:** 5 `RequestRowSkeleton`s (48px avatar + name/subtitle lines + two 96×40 button placeholders).
- **Error:** a centered `GlassCard` (max width 420) with a 72px lime-tinted icon circle (`cloud-offline-outline` 36px lime), title "Couldn't load requests" (`h3`), body "Something went wrong fetching your message requests. Check your connection and try again.", and a lime **"Try Again"** `CtaButton` (icon `refresh`, marginTop 24, minWidth 160, r14).
- **Empty:** `EmptyState` `mail-open-outline`, "No message requests", "When someone you don't follow messages you, their request will appear here for you to accept or decline." (no button).

### 6. Exact styling per element
- Row = GlassCard r24, avatar 48px purple-tint border. Decline = outline r14; Accept = lime CtaButton sm r14. Error card 72px lime icon circle + lime CtaButton.

### 7. Animations
- ADD: rows FadeInDown stagger; on Accept/Decline the row fades+collapses out; button pressed-scale.

---

# SCREEN 7 — User Profile  ·  `(community)/userProfile.tsx`

### 1. Purpose
A public member profile: avatar, name, bio, post/follower/following stats, Follow + Message actions, and the member's posts (with a locked state for private accounts you don't follow).

### 2. Top-to-bottom layout
1. **Header** (12px side padding, paddingTop = safe-area + 10): back arrow (24px) · centre title **"Profile"** (`subhead`, white, bold) · 40px spacer · 1px bottom hairline.
2. **Scroll body** (`paddingBottom:100`).
3. **Profile section** (centered, paddingVertical 32, 1px bottom hairline):
   - **Large avatar** 80×80 r40, 2px **lime-tinted** border (`withAlpha(coral,0.4)`) + **lime glow**, `background.tertiary` fill (image or `person` 40px tertiary).
   - **Display name** (`display`, white, fontSize 28, marginTop 16).
   - **Bio** (`body`, muted, centered, marginTop 8) — only when not locked and a bio exists.
   - **Stats row** (3 boxes, gap 40, marginTop 24): **Posts** (count or "—" if locked), **Followers**, **Following** — each a `statSmall` mono white number over a `caption` muted label.
   - **Action row** (gap 12, marginTop 24): two lime `CtaButton`s side by side (each flex, maxWidth 200, r24): **"FOLLOW"** (icon `person-add`) toggling to **"FOLLOWING"** (icon `checkmark`); and **"MESSAGE"** (icon `chatbubble-ellipses`).
4. **Posts** (if not locked; 20px padding): heading **"Posts"** (`h2`, white, marginBottom 16); a stack of **PostRow** cards (`Card variant="glass"`, padding 18, marginBottom 16, radius 24, 1px border): the post **content** (`body`, secondary, marginBottom 12, lineHeight 22), an optional **image** (full width height 200 r14 cover), and "{time} ago" (`caption`, muted).
5. **Locked section** (private + not following; centered, paddingVertical 48): a 96px lime-tinted circle (1px border) holding a `lock-closed` icon (40px lime); heading **"This account is private"** (`h3`, marginTop 20); body **"Follow this member to see their posts and activity."** (`body`, muted, maxWidth 280); a lime **FOLLOW/FOLLOWING** `CtaButton` (marginTop 28, width 60%, r24).

### 3. Data / text shown
- Title "Profile". displayName (fallback: `firstName + lastName` joined, else "Athlete"). Bio. Stat labels "Posts"/"Followers"/"Following" with counts (Posts shows "—" when locked). Buttons "FOLLOW"/"FOLLOWING", "MESSAGE". "Posts" heading. Per post: content, "{time} ago". Locked copy as above.
- Follow state `{ isFollowing, followers, following }`; counts default 0. Profile is fetched from the public-profile endpoint; posts from `getUserPosts(userId)`.

### 4. Interactions + navigation
- Back → `router.back()`. FOLLOW/FOLLOWING → optimistic toggle (`followUser`/`unfollowUser`, follower count ±1, rollback on error). MESSAGE → push `/messages/{userId}`. Tap a post card → push `/(community)/{postId}`.

### 5. Loading / empty / error
- **Profile loading:** header + a skeleton (80px avatar, name line, bio line, 3 stat boxes, a wide pill for the action row).
- **Profile error / not found:** header + full-screen `EmptyState` — error: `cloud-offline-outline`, "Couldn't load profile", "Something went wrong fetching this member's profile. Check your connection and try again.", **"Try Again"**. Not-found: `person-outline`, "User not found", "This member's profile may have been removed or is no longer available.", **"Go Back"**.
- **Posts loading:** 2 glass card skeletons (two body lines + a short meta line). **Posts error:** `EmptyState` `cloud-offline-outline`, "Couldn't load posts", "Something went wrong fetching these posts. Check your connection and try again.", **"Try Again"**. **Posts empty:** `EmptyState` `document-text-outline`, "No posts yet", "This member hasn't shared anything with the community yet." (no button).

### 6. Exact styling per element
- Avatar 80×80 r40 lime-tint border + lime glow. Stat numbers mono white. Action buttons lime CtaButton r24. Post cards glass r24. Locked circle 96px lime-tint.

### 7. Animations
- ADD: profile header FadeInDown; stats count-up; post cards stagger; Follow button label/icon crossfade + count tick; pressed-scale on CTAs.

---

# SCREEN 8 — Messages (Conversations List)  ·  `messages/index.tsx`

### 1. Purpose
The inbox of 1:1 conversations (coaches + members), each row showing the peer, a status line, and a time / "Request" badge.

### 2. Top-to-bottom layout
1. **Header** (height 64, paddingTop = safe-area): back chip (40×40 `background.secondary` r20, 1px border, `arrow-back` 22px) · centre title **"Messages"** (`h3`) · 40px spacer · 1px bottom hairline.
2. **List** — a `FlatList` (16px padding) of **chat rows**, each a `background.secondary` card (radius 20, 1px border, padding 16, marginBottom 12):
   - 50px `Avatar` (image or lime-gradient initials, 2px `withAlpha(purple,0.3)` border).
   - Middle (16px left, 12px right): peer **name** (`subhead`, white, bold, 1 line); a subtitle (`caption`, muted, 1 line) = **"Message request — tap to review"** if pending, else **"Tap to view chat history…"**.
   - Right: if pending, a **"Request"** badge (pill, `withAlpha(coral/lime,0.16)` bg, lime border, lime text 10px bold); else the **relative time** (`caption`, muted).

### 3. Data / text shown
- Title "Messages". Per row: peer displayName (fallback "User {first4}" → "—"), subtitle ("Message request — tap to review" / "Tap to view chat history…"), "{time} ago" or "Request". `Conversation` shape: `{ id, userId, targetId, updatedAt, requestState?, peer?{ userId, displayName, avatarUrl? } }`.

### 4. Interactions + navigation
- Back → `router.back()`. Tap a row → push `/messages/{targetId}` (peer userId, with legacy id fallbacks).

### 5. Loading / empty / error
- **Loading:** 6 `ChatRowSkeleton`s (50px avatar + name/subtitle lines + a short time placeholder).
- **Error:** `EmptyState` `cloud-offline-outline`, "Couldn't load messages", "Something went wrong fetching your conversations. Check your connection and try again.", **"Try Again"**.
- **Empty:** `EmptyState` `chatbubbles-outline`, "No messages yet", "Start a conversation from someone's profile and it'll show up here." (no button).

### 6. Exact styling per element
- Row `#13161F` r20 1px border. Avatar 50px purple-tint border. Request badge lime-tinted pill r12. Time muted caption.

### 7. Animations
- ADD: rows FadeInDown stagger; pressed-scale on row; new/unread rows subtle highlight.

---

# SCREEN 9 — Chat Thread (Unified DM)  ·  `messages/[id].tsx`

### 1. Purpose
A realtime 1:1 chat (Socket.IO): message bubbles with delivery ticks, typing indicator, request Accept/Decline banner, and request-gated composer. Also used for the Ria AI coach thread.

### 2. Top-to-bottom layout (inside a `KeyboardAvoidingView`)
1. **Header** (height 64, paddingTop = safe-area, gap 10): back chip (40×40 r20) · a **tappable peer block** (flex row, gap 10): 36px `Avatar` (border `border.default`) + a text column with the peer **name** (`subtitle`, white, 1 line) and a **status sub-line** that is either a small purple spinner (loading), **"typing…"** (`caption`, lime, in a polite live region) when the peer is typing, or an **online row** = an 8px **cyan** dot with a cyan glow + **"Active"** (`caption`, muted). · 40px spacer · 1px bottom hairline.
2. **Request banner** (recipient of a pending request, after load): a `GlassCard` (16px margins, radius 20, inner padding 16): heading **"Message request"** (`subhead`); body **"{peer} wants to chat with you. Accept to reply."** (`bodySm`, muted); an actions row (marginTop 14, gap 10): a flex **"Decline"** outline button (height 40, r14, light border, secondary bold) + a flex **"Accept"** lime `CtaButton` (size sm, icon `checkmark`).
3. **Messages** — a `FlatList` (padding 20), auto-scrolled to the end. Each row is a **ChatBubble**:
   - **Own bubble** (right-aligned, maxWidth 80%, padding 14, radius 22 with a tightened bottom-right corner (8), `overflow:hidden`): a **lime `coralCta` gradient** fill (`absoluteFill` overlay behind the text) with a pink/lime glow; the **text** (`body`, white, lineHeight 22); a meta row (bottom-right) with the **timestamp** (`caption`, 10px white, with a dark text-shadow for legibility on lime) + a **status tick** — `time-outline` (sending, white@0.6), `checkmark` (sent, white@0.6), `checkmark-done` (read, **lime-light `#C5E06B`**), or `alert-circle` (failed, **red `#FF4444`**). Failed own bubbles are dimmed (0.7) and tappable to retry.
   - **Peer bubble** (left-aligned): `background.secondary` fill, 1px `border.default`, radius 22 with a tightened bottom-left corner (8); optional sender name (`caption`, lime, bold) for group/coach context; the **text** (`body`, white); the **timestamp** (`caption`, 10px muted, bottom-right).
   - **Typing footer** (`TypingRow`): a left-aligned peer bubble with three pulsing 7px dots (muted), in a polite live region labelled "{speaker} is typing".
4. **Composer / lock notice** (bottom):
   - If the requester already sent their one allowed message → a **lock notice** strip (1px top hairline, `background.primary`, safe-area paddingBottom): `lock-closed-outline` 16px tertiary + **"Request sent — they must accept to continue."** (`caption`, tertiary).
   - Else → the **input bar** (1px top hairline, `background.primary`, safe-area paddingBottom): a multiline **TextInput** (flex, fill `background.secondary`, radius 22, 1px border, fontSize 14, maxHeight 120, placeholder **"Type a message…"** or **"Accept the request to reply…"** when locked) + a 44×44 **Send** disc (r22): when enabled, a lime `coralCta` gradient with a white `send` icon (20px) + lime glow; when disabled, a `background.secondary` disc (1px border) with a tertiary `send` icon.

### 3. Data / text shown
- Header name (peer displayName, fallback "Chat"); status "typing…" / "Active". Banner "Message request", "{peer} wants to chat with you. Accept to reply." / "Someone wants to chat with you. Accept to reply.", "Decline"/"Accept". Bubble text + short local time ("HH:MM"); tick a11y "Sending/Sent/Read/Failed". Lock notice "Request sent — they must accept to continue." Composer placeholder. Failed-bubble a11y "Message failed to send. Tap to retry."
- Bubble speaker label "You: {text}" / "{peerName||Coach Ria}: {text}". Input maxLength 4000. `ChatMessage`/`UIMessage`: `{ id, conversationId, senderId, text, createdAt, isOwn?, status?, optimistic? }`. `requestState: 'pending'|'accepted'|'declined'`.

### 4. Interactions + navigation
- Back → `router.back()`. Tap the header peer block → push `/(community)/userProfile?userId={peerUserId}`. Type → emits debounced typing_start/stop. Send → optimistic bubble (sending → sent → read via socket acks; failed after 10s, tap-to-retry). Accept (recipient) → unlocks composer instantly + accepts the request. Decline → declines + `router.back()`. Requester is limited to exactly one message until accepted.

### 5. Loading / empty / error
- **Loading:** a skeleton list of alternating left/right bubble placeholders (widths 62/48/70/55/40%, height 48, r22); header status shows the purple spinner.
- **Error:** `EmptyState` `cloud-offline-outline`, "Couldn't load this chat", "Something went wrong loading the conversation. Check your connection and try again.", **"Try Again"**.
- **Empty:** `EmptyState` `chatbubbles-outline`, "No messages yet", subtitle = "Accept the request above to start chatting." (recipient pending) or "Say hello — your first message starts the conversation."

### 6. Exact styling per element
- Own bubble lime gradient r22 (br-corner 8) + glow, ink-shadowed white timestamp, lime-light read tick. Peer bubble `#13161F` r22 (bl-corner 8) 1px border. Send disc 44 r22 lime gradient/disabled grey. Typing dots 7px. Online dot 8px cyan + glow.

### 7. Animations
- Typing dots already animate (Reanimated triangle-wave opacity, 1s loop, phase-offset per dot). ADD: bubble enter (own from right, peer from left) with springy scale; send disc pressed-scale + glow on enable; banner FadeInDown.

---

# SCREEN 10 — Find a Coach  ·  `coaches/browse.tsx`

### 1. Purpose
Directory of specialized coaches to message: avatar, name, speciality, rating, active-client count, and a Message CTA.

### 2. Top-to-bottom layout
1. **Header** (paddingTop = safe-area, marginBottom 16): back chip (40×40 `background.secondary` r20, 1px border, `arrow-back` 22px) · centre title **"Find a Coach"** (`h3`) · 40px spacer (no bottom hairline).
2. **Scroll body** (padding 20, large bottom padding):
   - **Intro paragraph** (`body`, muted, marginBottom 24): "Connect with specialized coaches to optimize your performance, nutrition, and shift work transitions."
   - **Coach cards** — each `Card variant="glass"` (padding 20, marginBottom 16):
     - Header row: a 64×64 round avatar (r32, 2px **cyan-tinted** border, `withAlpha(cyan,0.12)` fill) — image, else the first letter of the name in `h2` cyan; to the right (16px) the **name** (`subtitle`, white), the **speciality** (`captionMedium`, **cyan**, marginTop 4), and a **stats row** (marginTop 8): a `star` icon (14px **amber**) + the **rating** (`captionMedium`, white, e.g. "5.0", `toFixed(1)`, default 5.0) + "• {N} active clients" (`caption`, muted, default 0).
     - **Message button** (full width, marginTop 20): a **cyan** filled button (height 44, r22, `accent.cyan` fill + cyan border + cyan glow) with a `chatbubble-outline` icon (18px **ink**) + **"Message"** (`subhead`, **ink**, bold). (Note: this is the one CTA in this section filled in cyan rather than lime.)

### 3. Data / text shown
- Title "Find a Coach". Intro paragraph (above). Per coach: `name`, `speciality`, rating ("5.0"), "• {clients} active clients", button "Message". Coach object: `{ id, name, speciality, rating, clients, avatarUrl? }`.

### 4. Interactions + navigation
- Back → `router.back()`. **Message** → push `/messages/{coach.id}`.

### 5. Loading / empty / error
- **Loading:** two intro skeleton lines + 4 `CoachCardSkeleton`s (64px avatar + name/speciality/stats lines + a full-width 44px button placeholder).
- **Error:** `EmptyState` `cloud-offline-outline`, "Couldn't load coaches", "Something went wrong fetching the coach directory. Check your connection and try again.", **"Try Again"**.
- **Empty:** `EmptyState` `search-outline`, "No coaches available", "There are no coaches in the directory right now. Pull to refresh or check back soon.", **"Refresh"**.

### 6. Exact styling per element
- Coach card glass, padding 20. Avatar 64×64 r32 cyan-tint border + cyan-tint fill. Speciality cyan. Rating star amber. Message button cyan fill r22 + cyan glow, ink label/icon.

### 7. Animations
- ADD: coach cards FadeInDown stagger; Message button pressed-scale + cyan glow; avatar fade-in.

---

# SCREEN 11 — Coach Dashboard  ·  `(coach)/dashboard.tsx`

### 1. Purpose
A coach's view of their roster: a total-students KPI hero and a list of student rows that open a chat.

### 2. Top-to-bottom layout
1. **Header** (paddingTop = safe-area, marginBottom 16): back chip (40×40 `background.secondary` r20, 1px border, `arrow-back` 22px) · centre title **"Coach Dashboard"** (`h3`) · right = a notifications chip (40×40, same style, `notifications-outline` 22px white).
2. **Scroll body** (padding 20, `paddingBottom:100`):
   - **Global KPI card** — a `Card variant="glass"` (noPadding) with a **lime** diagonal gradient `[withAlpha(coral,0.2), withAlpha(pink,0.06)]` and a **lime glow** (inner padding 24): overline **"Total Active Students"** (muted); the **count** (`statLarge` mono, 48px, white); a **trend row** (marginTop 6): `trending-up` 14px **cyan** + **"Growing steady"** (`captionMedium`, cyan).
   - **Section heading** **"Your Roster"** (`h3`, white, marginVertical 16).
   - **Student rows** — each a tappable `Card variant="glass"` (row, padding 16, marginBottom 12): a 44×44 round avatar (r-full, `withAlpha(purple,0.16)` fill, `withAlpha(purple,0.3)` border) with the first letter of the name (`subhead`, **purple**, bold); a middle column (flex) with the student **name** (`subhead`, white) and **email** (`caption`, muted); a trailing `chatbubble-ellipses-outline` icon (24px **purple**).

### 3. Data / text shown
- Title "Coach Dashboard". KPI overline "Total Active Students", value = roster length, trend "Growing steady". Heading "Your Roster". Per student: `name` (fallback "Unknown Student"), `email` (fallback "No email"). Student object: `{ id, name, email }`.

### 4. Interactions + navigation
- Back → `router.back()`. Notifications chip (display affordance). Tap a student row → push `/messages/{student.id}` (opens the chat).

### 5. Loading / empty / error
- **Loading:** a 140px KPI skeleton + a roster section-header skeleton + 5 row skeletons (height 76, radius 20).
- **Error:** `EmptyState` `cloud-offline-outline`, "Couldn't load your roster", "Something went wrong fetching your students. Check your connection and try again.", **"Try Again"**.
- **Empty roster:** below the KPI/heading, `EmptyState` `people-outline`, "No students yet", "Your roster is empty. Students who connect with you will appear here, ready for coaching." (no button).

### 6. Exact styling per element
- KPI card glass + lime gradient + lime glow, value mono 48px, trend cyan. Student row glass r-card, avatar 44 purple-tint, chat icon purple.

### 7. Animations
- ADD: KPI count-up on mount; roster rows FadeInDown stagger; pressed-scale on rows.

---

## CROSS-SCREEN NOTES FOR THE DESIGNER
- **Accent role consistency:** lime = brand/primary CTA + own chat bubbles + follow + leaderboard self-row; **cyan** = progress/scores/"pts"/challenge flash icon/coach speciality + Message CTA on the coach directory; **purple** = AI/coach context (Ria FAB, chat avatars, dashboard avatars/roster); **emerald** = challenge "joined"/progress; **amber** = trophy + rank-1 medal + coach rating star; **orange** = rank-3 medal; **red** = failed message tick.
- **Avatars** fall back to a **lime-gradient initials** disc (white initials, weight 700) when no image — use this everywhere an avatar appears.
- **EmptyState primitive** is always: a 96px lime-tinted icon circle (lime icon 40px) + `h3` title + `body` muted subtitle (maxWidth 280, centered) + optional lime `Button` CTA. Reuse this exact composition for every empty/error block above.
- **Glass cards** everywhere = frosted dark blur, 1px `rgba(255,255,255,0.10)` hairline, radius 16–24, optional accent glow. Keep the near-black `#0A0C12` page background behind them.
- Render the **bottom tab bar with Feed active** ONLY on Screen 1; all other screens are full-bleed stack screens with their own back-header and no tab bar.
