# Android home-screen widget — Cycle phase + next-period countdown (Period P3)

A resizable Android home-screen widget that shows a cycle-tracking user's **current
phase** and a **days-until-next-period countdown**, tinted in the app's phase colours.
Tapping it deep-links straight to the in-app Cycle screen.

> **This is native. It requires a dev/native build (EAS or local prebuild) — it does
> NOT work in Expo Go.** See [Build & test](#build--test). Android-only; a silent
> no-op on iOS / web.

---

## What it shows

| User state | Widget |
|---|---|
| Cycle tracking on (female, opted-in), confident forecast | Phase chip (e.g. `● Follicular`) + big **N** `days to period` + `Day N` |
| Predicted period date reached / passed before the app refreshed | `Due · Period expected` → nudge to log |
| Tracking on, no confident phase yet (or estimate aged out) | `Tracking · No estimate yet` / `Tap to refresh` |
| Pregnancy mode | `Paused · Pregnancy mode` (predictions pause in-app, so they pause here) |
| Not eligible (tracking off / non-female / not opted-in) | Neutral branded tile — **never any cycle data** |

The eligibility gate and the prediction-confidence gate are **identical** to the
in-app cycle surfaces (`app/(performance)/cycle.tsx` + `CyclePhaseHero`), so the
widget never shows a phase or countdown the app itself would hide.

## Architecture

```
GET /v1/users/me            ─┐
GET /v1/users/me/status      ├─▶  sync.ts (app)  ──▶  AsyncStorage snapshot  ──▶  widgetTaskHandler (headless)  ──▶  CycleWidget
GET /v1/users/me/cycle/forecast ─┘   compute + requestWidgetUpdate                 (read + deriveView)                (FlexWidget/TextWidget)
```

- **Config plugin** — `react-native-android-widget` (added to `app.json` `plugins`).
  It generates the native `AppWidgetProvider`, the widget XML, and wires the JS
  task handler at build time. No hand-written Kotlin/RemoteViews.
- **Widget UI** — [`src/widgets/CycleWidget.tsx`](../clients/mobile/src/widgets/CycleWidget.tsx).
  Pure/presentational, built from the library's `FlexWidget`/`TextWidget` primitives
  (it cannot use React Native views or the theme hook — it renders headless).
- **Cached data bridge** — [`src/widgets/snapshot.ts`](../clients/mobile/src/widgets/snapshot.ts)
  (headless-safe read + pure date math) and
  [`src/widgets/sync.ts`](../clients/mobile/src/widgets/sync.ts) (app-side write +
  `requestWidgetUpdate`). The app persists a tiny snapshot; the widget reads it back.
- **Task handler** — [`src/widgets/widgetTaskHandler.tsx`](../clients/mobile/src/widgets/widgetTaskHandler.tsx),
  registered in [`index.js`](../clients/mobile/index.js) (the new app entry).

### Why we cache dates, not a pre-computed number

Android re-runs the widget's headless task on a timer (`updatePeriodMillis`, 30 min)
**even when the app is closed**. The snapshot stores the predicted next-period *date*
and the cycle *start date*; the widget recomputes the day counts against "today" at
render time (`deriveView`). So the countdown ticks down each day without the app
running. Only the *phase* estimate ages out — after ~14 days without an app refresh
the widget falls back to a neutral "tap to refresh" tile rather than show a stale
phase. UTC date-only math mirrors `app/(performance)/cycle.tsx` exactly, so the
widget never drifts a day from the in-app hero.

### When the snapshot refreshes

| Trigger | Path | Notes |
|---|---|---|
| App launch + every foreground | `useCycleWidgetSync()` in `app/_layout.tsx` | Self-contained fetch; throttled to ≤ once / 10 min |
| Cycle screen data resolves / user logs a period | effect in `app/(performance)/cycle.tsx` → `pushCycleWidgetFromData()` | Uses already-fetched data, no extra request; not throttled |
| Android periodic tick (app closed) | `widgetTaskHandler` `WIDGET_UPDATE` | Re-renders from the cached snapshot; countdown stays current |

The snapshot is PII-light: a phase label, two dates, and two flags. No tokens, no
symptoms, no logs.

## Files

**Added** (`clients/mobile/`)
- `index.js` — new app entry (imports `expo-router/entry`, registers the widget task handler on Android)
- `src/widgets/snapshot.ts` — snapshot type, AsyncStorage read/write, pure `deriveView`
- `src/widgets/CycleWidget.tsx` — the widget UI
- `src/widgets/widgetTaskHandler.tsx` — headless render handler
- `src/widgets/sync.ts` — `computeSnapshot` / `pushCycleWidgetFromData` / `syncCycleWidget` / `useCycleWidgetSync`
- `assets/widget-preview/cycle.png` — widget-picker preview (placeholder art; replace with a real screenshot before store release)

**Changed**
- `package.json` — `main` → `index.js`; added `react-native-android-widget@^0.20.3`
- `app.json` — `react-native-android-widget` plugin + the `CyclePhase` widget config
- `app/_layout.tsx` — mounts `useCycleWidgetSync()`
- `app/(performance)/cycle.tsx` — pushes a fresh snapshot when its data changes
- `src/lib/deepLinks.ts` — allow-lists `zeitra://cycle` → `/(performance)/cycle` (the widget's tap target)

## Build & test

The widget needs the native module compiled in — **Expo Go cannot load it**. Use a
dev client or an internal build.

```sh
cd clients/mobile

# Option A — EAS dev client (recommended; installs on a device/emulator):
eas build -p android --profile development

# Option B — local prebuild + run (needs Android SDK + a connected device/emulator):
npx expo prebuild -p android            # generates the native project incl. the widget
npx expo run:android
```

Then, on the device/emulator:
1. Long-press the home screen → **Widgets** → find **Zeitra Cycle** → drop it on a page.
2. Open the app once while signed in as a cycle-tracking user so the first snapshot
   is written (launch/foreground sync), then watch the widget populate.
3. Tap the widget → it should deep-link to the Cycle screen.
4. Resize it; toggle pregnancy mode / turn tracking off in-app to see the paused /
   neutral states.

A distributable build uses `--profile preview` (APK) or `--profile production`.

## Limitations & future work

- **Android only.** iOS home-screen widgets need a separate WidgetKit extension —
  out of scope here; all widget code is guarded to `Platform.OS === 'android'`.
- **Min refresh cadence** is Android's ~30 min floor for `updatePeriodMillis`; the
  in-app sync + `requestWidgetUpdate` give near-instant updates while the app is used.
- **Phase staleness**: if the app isn't opened for ~14 days the widget shows a neutral
  "tap to refresh" tile instead of a possibly-wrong phase (the countdown itself stays
  correct from the stored date until it passes).
- **Preview art** is a generated placeholder — swap `assets/widget-preview/cycle.png`
  for a real widget screenshot before a store release.
- **Font**: uses the system font. Bundling the brand face (Saira) is possible via the
  plugin's `fonts: [...]` option + `fontFamily` on the text — deferred to keep v1 lean.
```
