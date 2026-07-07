/**
 * Cycle widget — the CACHED DATA BRIDGE (write side, app context).
 *
 * The widget renders headless from a cached snapshot (src/widgets/snapshot.ts). This
 * module is what the APP uses to keep that snapshot fresh and nudge Android to
 * redraw. Two entry points:
 *
 *   - pushCycleWidgetFromData(...) — called from the Cycle screen with data it has
 *     ALREADY fetched (profile / status / forecast). Zero extra network — the
 *     freshest possible update, right after the user logs a period etc.
 *   - syncCycleWidget() — self-contained: fetches profile (+ status/forecast when
 *     eligible) and pushes a snapshot. Used by the launch / foreground hook so the
 *     widget stays current even when the user never opens the Cycle screen.
 *
 * ANDROID-ONLY + NEVER-THROWS: every public function no-ops off Android and swallows
 * all errors — a widget refresh must never surface an error into the app. The
 * react-native-android-widget module and the widget component are lazy-`require`d
 * INSIDE the Android guard so iOS / web never load the native module.
 */

import React from 'react';
import { AppState, Platform } from 'react-native';
import { getAccessToken } from '@/api/client';
import { getMyProfile, getStatus } from '@/api/profile';
import { getCycleForecast } from '@/api/cycle';
import type { CyclePhase, Confidence } from '@/api/cycle';
import {
    CYCLE_WIDGET_NAME,
    deriveView,
    writeSnapshot,
    type CycleWidgetSnapshot,
} from './snapshot';

// Structural inputs — decoupled from the full API interfaces so this stays a pure
// function of exactly the fields the widget needs (profile carries the eligibility
// + pregnancy flags; these live on the row but aren't all on the UserProfile type).
type ProfileLike =
    | {
          cycleTrackingEnabled?: boolean;
          biologicalSex?: string | null;
          pregnancyMode?: boolean;
          lastPeriodStartDate?: string | null;
      }
    | null
    | undefined;

type StatusLike = { cyclePhase?: CyclePhase } | null | undefined;

type ForecastLike =
    | { trackingOnly?: boolean; confidence?: Confidence; predictedNextPeriodStart?: string | null }
    | null
    | undefined;

export interface CycleWidgetSource {
    profile: ProfileLike;
    status: StatusLike;
    forecast: ForecastLike;
    /** Explicit cycle-start override — the Cycle screen derives this from the
     *  profile OR cycle history; the self-contained sync just uses the profile. */
    cycleStartDate?: string | null;
}

/**
 * PURE: reduce the API shapes to the compact snapshot the widget persists. Mirrors
 * the eligibility gate + prediction-confidence gate the in-app cycle screen uses, so
 * the widget shows exactly what the app would (never a phase/countdown the app hides).
 */
export function computeSnapshot(src: CycleWidgetSource): CycleWidgetSnapshot {
    const { profile, status, forecast } = src;

    const trackingEnabled = profile?.cycleTrackingEnabled === true;
    const isFemale = (profile?.biologicalSex ?? '').toString().toUpperCase() === 'FEMALE';
    const eligible = trackingEnabled && isFemale;

    // Pregnancy mode pauses forecasting in-app — the widget pauses too.
    const paused = profile?.pregnancyMode === true;

    // Confident enough to show a countdown — same gate as CyclePhaseHero.
    const canPredict = !!forecast && forecast.trackingOnly !== true && forecast.confidence !== 'NONE';

    return {
        v: 1,
        eligible,
        paused,
        phase: status?.cyclePhase ?? null,
        cycleStartDate: src.cycleStartDate ?? profile?.lastPeriodStartDate ?? null,
        nextPeriodDate: forecast?.predictedNextPeriodStart ?? null,
        canPredict,
        updatedAt: new Date().toISOString(),
    };
}

/** Persist the snapshot and ask Android to redraw any placed widget instances. */
async function pushSnapshot(snapshot: CycleWidgetSnapshot): Promise<void> {
    await writeSnapshot(snapshot);
    if (Platform.OS !== 'android') return;
    try {
        // Lazy — only load the native module + widget tree on Android.
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { requestWidgetUpdate } = require('react-native-android-widget');
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { CycleWidget } = require('./CycleWidget');
        await requestWidgetUpdate({
            widgetName: CYCLE_WIDGET_NAME,
            renderWidget: () => React.createElement(CycleWidget, { view: deriveView(snapshot) }),
            // No instances on the home screen — nothing to update, and that's fine.
            widgetNotFound: () => {},
        });
    } catch {
        /* native module absent (e.g. Expo Go) or no widget placed — ignore */
    }
}

/**
 * Update the widget from data the caller already holds (no network). Call this from
 * the Cycle screen whenever its profile / status / forecast queries resolve or the
 * user logs a period, so the tile reflects the change immediately.
 */
export async function pushCycleWidgetFromData(src: CycleWidgetSource): Promise<void> {
    if (Platform.OS !== 'android') return;
    try {
        await pushSnapshot(computeSnapshot(src));
    } catch {
        /* never throw into the app over a widget refresh */
    }
}

// Throttle the foreground sync so rapid background↔foreground churn doesn't spam the
// API. Immediate updates after a period log go through pushCycleWidgetFromData, which
// isn't throttled — this only guards the periodic "keep it fresh" backstop.
const MIN_SYNC_INTERVAL_MS = 10 * 60 * 1000;
let lastSyncMs = 0;

/**
 * Self-contained refresh: fetch what's needed and push a snapshot. No-ops off
 * Android, when signed out, or within the throttle window. Safe to call on launch
 * and on every app-foreground.
 */
export async function syncCycleWidget(options: { force?: boolean } = {}): Promise<void> {
    if (Platform.OS !== 'android') return;
    const now = Date.now();
    if (!options.force && now - lastSyncMs < MIN_SYNC_INTERVAL_MS) return;
    lastSyncMs = now;

    try {
        // Signed out → leave the last snapshot in place (don't wipe to "ineligible").
        const token = await getAccessToken();
        if (!token) return;

        const profile = (await getMyProfile()) as ProfileLike;
        const trackingEnabled = profile?.cycleTrackingEnabled === true;
        const isFemale = (profile?.biologicalSex ?? '').toString().toUpperCase() === 'FEMALE';

        // Not (or no longer) eligible → push an eligible:false snapshot so a widget a
        // user left on their home screen after turning tracking off shows the neutral
        // tile instead of stale cycle data.
        if (!trackingEnabled || !isFemale) {
            await pushSnapshot(computeSnapshot({ profile, status: null, forecast: null }));
            return;
        }

        const [status, forecast] = await Promise.all([
            getStatus().catch(() => null),
            getCycleForecast(1).catch(() => null),
        ]);
        await pushSnapshot(computeSnapshot({ profile, status, forecast }));
    } catch {
        /* network / auth error — keep the previous snapshot; never throw */
    }
}

// ── App-lifecycle hook ───────────────────────────────────────────────────────────

/**
 * Mount once near the app root. On Android it refreshes the widget snapshot on
 * launch and on each return-to-foreground (throttled). A no-op on iOS / web.
 */
export function useCycleWidgetSync(): void {
    React.useEffect(() => {
        if (Platform.OS !== 'android') return;
        void syncCycleWidget();
        const sub = AppState.addEventListener('change', (state) => {
            if (state === 'active') void syncCycleWidget();
        });
        return () => sub.remove();
    }, []);
}
