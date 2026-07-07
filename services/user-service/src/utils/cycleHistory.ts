/**
 * cycleHistory — PURE, fully-unit-testable derivation of a user's cycle STATISTICS
 * and a cycle/period HISTORY view from their logged PeriodLog rows.
 *
 * DESIGN PHILOSOPHY (mirrors cyclePhase.ts): TRACK-FIRST, LEARN-FROM-THE-USER.
 * Once a user has logged their own periods we MUST prefer their observed data over
 * the static 28/14 clinical template — using the population template when we have
 * the individual's history is a known research anti-pattern. With too little data
 * (0 or 1 logged start) we cannot estimate a cycle length at all, so we return
 * `null` averages and regularity UNKNOWN, and downstream callers fall back to the
 * stored template (or to UNKNOWN phase).
 *
 * REGULARITY is variability-aware: we compute the sample standard deviation (SD)
 * of consecutive cycle gaps and label IRREGULAR when SD is high (or any gap is
 * physiologically out-of-range). IRREGULAR is deliberately conservative because
 * computeCyclePhase treats IRREGULAR as tracking-only (UNKNOWN phase) — i.e. we
 * would rather widen uncertainty than emit a false-precise phase.
 *
 * All date math is UTC date-only (same basis as cyclePhase.ts / calculateAge): a
 * gap is the integer count of whole days between two UTC-midnight start dates, so
 * DST / timezone offsets cannot shift a cycle length.
 */

export type CycleRegularity = 'REGULAR' | 'IRREGULAR' | 'UNKNOWN';

export interface PeriodLogInput {
    startDate: Date | string;
    endDate?: Date | string | null;
}

export interface CycleStats {
    /** Learned average cycle length (gap between consecutive starts), or null. */
    avgCycleLengthDays: number | null;
    /** Learned average period (bleed) length from logs with an endDate, or null. */
    avgPeriodLengthDays: number | null;
    /** Sample SD of cycle gaps (uncertainty signal), or null when < 2 gaps. */
    cycleLengthStdDev: number | null;
    /** Variability-aware regularity label. */
    cycleRegularity: CycleRegularity;
    /** The most recent logged period start (UTC-midnight Date), or null. */
    lastPeriodStartDate: Date | null;
    /** Count of usable logged starts (after sort/dedupe). */
    loggedCycleCount: number;
}

export interface CycleHistoryEntry {
    /** Period start (ISO YYYY-MM-DD, UTC). */
    startDate: string;
    /** Period end if logged (ISO YYYY-MM-DD, UTC), else null. */
    endDate: string | null;
    /** Days from this start to the NEXT start, or null for the most recent cycle. */
    cycleLengthDays: number | null;
    /** Bleed length (endDate - startDate + 1) if endDate logged, else null. */
    periodLengthDays: number | null;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Physiologically-plausible cycle-length band. A consecutive gap outside this is
// treated as evidence of irregularity (a likely missed/double log or true
// irregular cycle). Matches the computeCyclePhase [21,40] gate intent, with a
// little slack on the long end for skipped-cycle gaps.
const MIN_PLAUSIBLE_GAP = 21;
const MAX_PLAUSIBLE_GAP = 45;
// SD (days) above which gaps are considered IRREGULAR. ~clinically, cycle-length
// variation > ~7 days between cycles is the common "irregular" threshold.
const IRREGULAR_SD_THRESHOLD = 7;

/** Normalize any Date|string to UTC midnight ms, or null if unparseable. */
function toUtcMidnightMs(value: Date | string | null | undefined): number | null {
    if (value == null) return null;
    const d = value instanceof Date ? value : new Date(value);
    const t = d.getTime();
    if (Number.isNaN(t)) return null;
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function msToUtcDate(ms: number): Date {
    return new Date(ms);
}

function msToIso(ms: number): string {
    return msToUtcDate(ms).toISOString().slice(0, 10);
}

/** Sample standard deviation (n-1). Returns null for < 2 values. */
function sampleStdDev(values: number[]): number | null {
    if (values.length < 2) return null;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance =
        values.reduce((acc, v) => acc + (v - mean) * (v - mean), 0) / (values.length - 1);
    return Math.sqrt(variance);
}

/**
 * Parse, sort (ascending), and de-duplicate logged period starts to UTC-midnight
 * epoch-ms. Unparseable rows are dropped; same-day duplicate starts collapse to a
 * single entry (a double-tap on the same day is one period, not a 0-day cycle).
 */
function normalizeStarts(logs: PeriodLogInput[]): number[] {
    const starts = logs
        .map((l) => toUtcMidnightMs(l.startDate))
        .filter((ms): ms is number => ms != null)
        .sort((a, b) => a - b);
    const deduped: number[] = [];
    for (const ms of starts) {
        if (deduped.length === 0 || deduped[deduped.length - 1] !== ms) deduped.push(ms);
    }
    return deduped;
}

/**
 * computeCycleStatsFromLogs — derive learned averages + variability + regularity
 * from a user's PeriodLog history. PURE; no I/O.
 *
 * - 0 logs:  everything null/UNKNOWN, lastPeriodStartDate null.
 * - 1 log:   no gap is computable -> avgCycleLength null, regularity UNKNOWN, but
 *            lastPeriodStartDate is set (so the latest start is still learned).
 * - 2+ logs: avgCycleLengthDays = mean of consecutive gaps; SD computed when >= 2
 *            gaps; IRREGULAR when SD high OR any gap out of plausible band.
 *
 * avgPeriodLengthDays is the mean inclusive bleed length over logs that carry an
 * endDate (endDate - startDate + 1, clamped >= 1); null when none do.
 */
export function computeCycleStatsFromLogs(logs: PeriodLogInput[]): CycleStats {
    const empty: CycleStats = {
        avgCycleLengthDays: null,
        avgPeriodLengthDays: null,
        cycleLengthStdDev: null,
        cycleRegularity: 'UNKNOWN',
        lastPeriodStartDate: null,
        loggedCycleCount: 0,
    };
    if (!logs || logs.length === 0) return empty;

    const starts = normalizeStarts(logs);
    if (starts.length === 0) return empty;

    const lastStartMs = starts[starts.length - 1];
    const lastPeriodStartDate = msToUtcDate(lastStartMs);

    // ── Period (bleed) length: mean inclusive length over logs with an endDate ──
    const periodLengths: number[] = [];
    for (const l of logs) {
        const s = toUtcMidnightMs(l.startDate);
        const e = toUtcMidnightMs(l.endDate ?? null);
        if (s == null || e == null) continue;
        if (e < s) continue; // ignore inverted ranges
        const days = Math.floor((e - s) / MS_PER_DAY) + 1; // inclusive
        if (days >= 1) periodLengths.push(days);
    }
    const avgPeriodLengthDays =
        periodLengths.length > 0
            ? Math.round(periodLengths.reduce((a, b) => a + b, 0) / periodLengths.length)
            : null;

    // ── Cycle length: consecutive start-to-start gaps ───────────────────────────
    if (starts.length < 2) {
        return {
            ...empty,
            avgPeriodLengthDays,
            lastPeriodStartDate,
            loggedCycleCount: starts.length,
        };
    }

    const gaps: number[] = [];
    for (let i = 1; i < starts.length; i++) {
        gaps.push(Math.round((starts[i] - starts[i - 1]) / MS_PER_DAY));
    }

    const avgCycleLengthDays = Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);
    const cycleLengthStdDev = sampleStdDev(gaps);

    const anyOutOfBand = gaps.some((g) => g < MIN_PLAUSIBLE_GAP || g > MAX_PLAUSIBLE_GAP);
    const highVariability = cycleLengthStdDev != null && cycleLengthStdDev > IRREGULAR_SD_THRESHOLD;
    const cycleRegularity: CycleRegularity = anyOutOfBand || highVariability ? 'IRREGULAR' : 'REGULAR';

    return {
        avgCycleLengthDays,
        avgPeriodLengthDays,
        cycleLengthStdDev: cycleLengthStdDev == null ? null : Math.round(cycleLengthStdDev * 100) / 100,
        cycleRegularity,
        lastPeriodStartDate,
        loggedCycleCount: starts.length,
    };
}

/**
 * buildCycleHistory — present each logged cycle as {start, end, cycleLength,
 * periodLength}. PURE. The most recent cycle has cycleLengthDays = null (no next
 * start to measure against yet). Ordered most-recent-first for display.
 */
export function buildCycleHistory(logs: PeriodLogInput[]): CycleHistoryEntry[] {
    if (!logs || logs.length === 0) return [];

    // Build per-start records keyed by the normalized start ms so we can attach the
    // matching endDate (first usable end seen for that start).
    const startToEnd = new Map<number, number | null>();
    for (const l of logs) {
        const s = toUtcMidnightMs(l.startDate);
        if (s == null) continue;
        const e = toUtcMidnightMs(l.endDate ?? null);
        const existing = startToEnd.get(s);
        // Keep the first valid end for this start; don't overwrite a real end with null.
        if (existing == null) startToEnd.set(s, e != null && e >= s ? e : null);
    }

    const sortedStarts = Array.from(startToEnd.keys()).sort((a, b) => a - b);

    const entries: CycleHistoryEntry[] = sortedStarts.map((startMs, idx) => {
        const nextStartMs = idx + 1 < sortedStarts.length ? sortedStarts[idx + 1] : null;
        const endMs = startToEnd.get(startMs) ?? null;
        return {
            startDate: msToIso(startMs),
            endDate: endMs != null ? msToIso(endMs) : null,
            cycleLengthDays:
                nextStartMs != null ? Math.round((nextStartMs - startMs) / MS_PER_DAY) : null,
            periodLengthDays:
                endMs != null ? Math.floor((endMs - startMs) / MS_PER_DAY) + 1 : null,
        };
    });

    // Most-recent first for display.
    return entries.reverse();
}
