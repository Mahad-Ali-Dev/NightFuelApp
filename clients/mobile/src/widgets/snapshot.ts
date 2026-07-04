/**
 * Cycle home-screen widget — the CACHED DATA BRIDGE (read side + pure derivation).
 *
 * This is the ONLY module the headless widget task handler is allowed to import
 * for data, so it MUST stay headless-safe: no axios, no expo-router, no theme, no
 * React. Just AsyncStorage + pure UTC date math. The app writes a compact snapshot
 * here (see src/widgets/sync.ts) and the widget reads it back — the widget process
 * runs headless on a schedule and never has the app's network/auth context, so
 * everything it needs to render must already be in this snapshot.
 *
 * WHY WE STORE DATES, NOT A PRE-COMPUTED "days" NUMBER: Android re-runs the widget
 * task on a timer (`updatePeriodMillis`) even when the app is closed. We store the
 * predicted next-period DATE and the cycle START date, then recompute the day
 * counts against "today" at render time (`deriveView`). That way the countdown
 * ticks down correctly each day without the app having to run — it only goes stale
 * when the phase estimate itself ages out (the app refreshes it on every launch /
 * foreground, so that's rare).
 *
 * The date math mirrors app/(performance)/cycle.tsx EXACTLY (UTC date-only, matching
 * the server's forecast math) so the widget never drifts a day from the in-app hero.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
// Type-only import — erased at compile time, so this does NOT pull the axios-backed
// api/cycle module (or its expo-secure-store init) into the headless widget bundle.
import type { CyclePhase } from '@/api/cycle';

/** AsyncStorage key for the persisted snapshot. Versioned in the key so a future
 *  shape change is a clean new key, never a half-parsed old blob. */
export const CYCLE_WIDGET_SNAPSHOT_KEY = 'zeitra.cycleWidget.snapshot.v1';

/** Widget name — MUST match the `name` in the app.json plugin `widgets[]` entry
 *  and the `nameToWidget` map in the task handler. */
export const CYCLE_WIDGET_NAME = 'CyclePhase';

/** The 4 concrete phases (UNKNOWN excluded) — the only ones that render a phase. */
export type ConcretePhase = Exclude<CyclePhase, 'UNKNOWN'>;

/**
 * The compact snapshot the app persists for the widget. Deliberately tiny and
 * PII-light: a phase label + two dates + a couple of flags. No tokens, no logs, no
 * symptoms — the widget only ever shows phase + a period countdown.
 */
export interface CycleWidgetSnapshot {
    v: 1;
    /** cycleTrackingEnabled === true && biologicalSex === 'FEMALE'. When false the
     *  widget shows a neutral branded tile — never any cycle data. */
    eligible: boolean;
    /** Pregnancy mode — the app pauses period prediction, so the widget does too. */
    paused: boolean;
    /** Current phase from GET /v1/users/me/status. null => tracking never enabled. */
    phase: CyclePhase | null;
    /** Most-recent period start (YYYY-MM-DD) — drives the "DAY N" readout. */
    cycleStartDate: string | null;
    /** Predicted next period start (YYYY-MM-DD) — drives the countdown. */
    nextPeriodDate: string | null;
    /** True only when the forecast is confident enough to show the countdown
     *  (!trackingOnly && confidence !== 'NONE') — mirrors the in-app hero gate. */
    canPredict: boolean;
    /** ISO timestamp the snapshot was written — used to detect a stale phase. */
    updatedAt: string;
}

// ── Pure UTC date-only math (copied from app/(performance)/cycle.tsx) ────────────

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** A phase older than this is treated as unreliable (the phase, not the countdown,
 *  ages out). ~14 days comfortably exceeds a normal app-open cadence; past it we
 *  fall back to a neutral "open to refresh" tile rather than show a stale phase. */
export const STALE_AFTER_MS = 14 * MS_PER_DAY;

/** Parse 'YYYY-MM-DD' to UTC-midnight ms, or null if malformed. */
export function isoToUtcMs(iso: string | null | undefined): number | null {
    if (!iso) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!m) return null;
    const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return Number.isNaN(ms) ? null : ms;
}

/** A given `Date` (default now) reduced to its UTC-midnight ms. */
export function todayUtcMs(now: Date = new Date()): number {
    return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

// ── Derived render view ─────────────────────────────────────────────────────────

/** What the widget should render, derived from the snapshot + "now". Every day
 *  count is recomputed here (never read from storage) so the periodic headless
 *  refresh keeps the countdown honest as days pass. */
export interface CycleWidgetView {
    state: 'ineligible' | 'paused' | 'no-estimate' | 'phase';
    phase: ConcretePhase | null;
    /** 1-based day within the cycle (e.g. 9 → "DAY 9"), or null if not derivable. */
    cycleDay: number | null;
    /** Whole days until the predicted next period (>= 0). null when not shown. */
    daysToNextPeriod: number | null;
    /** True when the predicted next-period date is in the past (snapshot outrun). */
    nextPeriodPassed: boolean;
    /** True when the phase estimate is older than STALE_AFTER_MS. */
    stale: boolean;
}

const CONCRETE = new Set<CyclePhase>(['MENSTRUAL', 'FOLLICULAR', 'OVULATORY', 'LUTEAL']);

/**
 * Reduce a snapshot to a render view against `now`. PURE + total — any missing /
 * malformed field degrades gracefully to a quieter state, never a thrown error or a
 * fabricated number (the widget must be honest even when the data is thin).
 */
export function deriveView(
    snap: CycleWidgetSnapshot | null,
    now: Date = new Date(),
): CycleWidgetView {
    const empty: CycleWidgetView = {
        state: 'ineligible',
        phase: null,
        cycleDay: null,
        daysToNextPeriod: null,
        nextPeriodPassed: false,
        stale: false,
    };

    if (!snap || snap.v !== 1 || !snap.eligible) return empty;
    if (snap.paused) return { ...empty, state: 'paused' };

    const stale = (() => {
        const t = Date.parse(snap.updatedAt);
        return Number.isNaN(t) ? false : now.getTime() - t > STALE_AFTER_MS;
    })();

    // No concrete phase (UNKNOWN / null), or the estimate has aged out → neutral.
    if (snap.phase == null || !CONCRETE.has(snap.phase) || stale) {
        return { ...empty, state: 'no-estimate', stale };
    }

    const today = todayUtcMs(now);

    // 1-based day-of-cycle from the stored start date (omit if start is in the future).
    const startMs = isoToUtcMs(snap.cycleStartDate);
    const cycleDay =
        startMs != null && startMs <= today ? Math.floor((today - startMs) / MS_PER_DAY) + 1 : null;

    // Countdown — only when the forecast was confident enough.
    let daysToNextPeriod: number | null = null;
    let nextPeriodPassed = false;
    if (snap.canPredict) {
        const nextMs = isoToUtcMs(snap.nextPeriodDate);
        if (nextMs != null) {
            const d = Math.round((nextMs - today) / MS_PER_DAY);
            if (d >= 0) daysToNextPeriod = d;
            else nextPeriodPassed = true;
        }
    }

    return {
        state: 'phase',
        phase: snap.phase as ConcretePhase,
        cycleDay,
        daysToNextPeriod,
        nextPeriodPassed,
        stale: false,
    };
}

// ── AsyncStorage read / write ───────────────────────────────────────────────────

/** Persist the snapshot. Best-effort; a failed write just leaves the last one. */
export async function writeSnapshot(snap: CycleWidgetSnapshot): Promise<void> {
    try {
        await AsyncStorage.setItem(CYCLE_WIDGET_SNAPSHOT_KEY, JSON.stringify(snap));
    } catch {
        /* best-effort — the widget keeps rendering the previous snapshot */
    }
}

/** Read the snapshot back (headless-safe). Returns null on absent/corrupt data. */
export async function readSnapshot(): Promise<CycleWidgetSnapshot | null> {
    try {
        const raw = await AsyncStorage.getItem(CYCLE_WIDGET_SNAPSHOT_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as CycleWidgetSnapshot;
        return parsed && parsed.v === 1 ? parsed : null;
    } catch {
        return null;
    }
}
