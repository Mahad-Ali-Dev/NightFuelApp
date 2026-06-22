/**
 * cycleForecast — PURE, fully-unit-testable cycle CALENDAR / FORECAST derivation.
 *
 * Powers GET /v1/users/me/cycle/forecast: for a date window it returns, per day,
 * the predicted phase + a CONFIDENCE level + a logged-vs-predicted flag, plus the
 * predicted next-period date, fertile window, and ovulation day.
 *
 * UNCERTAINTY-AWARENESS (the research must-have): this NEVER emits a false-precise
 * single fertile day for users we can't predict well. It widens the fertile window
 * and downgrades confidence (down to 'NONE' / tracking-only) for:
 *   - hormonal contraception (natural cycle suppressed)               -> NONE
 *   - non-female / tracking disabled                                  -> NONE
 *   - IRREGULAR cycles (self-reported OR learned-from-history)        -> LOW + wide
 *   - insufficient history / out-of-gate cycle length                 -> LOW + wide
 *   - stale last period (likely missed)                              -> LOW + wide
 * Only a regular, in-gate, fresh, well-evidenced cycle yields HIGH confidence with
 * the tight (+/-1 day) ovulation window.
 *
 * Reuses computeCyclePhase for the per-day phase so the calendar and the live
 * UserStatus.cyclePhase can never disagree. All date math is UTC date-only.
 */

import { computeCyclePhase, CyclePhaseInput, CyclePhase } from './cyclePhase';

export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';

export interface ForecastInput extends CyclePhaseInput {
    /** Learned SD of cycle gaps (from computeCycleStatsFromLogs), if available. */
    cycleLengthStdDev?: number | null;
    /** How many cycles the user has actually logged (drives confidence). */
    loggedCycleCount?: number | null;
    /** Set of logged period dates (ISO YYYY-MM-DD, UTC) for logged-vs-predicted. */
    loggedPeriodDates?: string[] | null;
}

export interface ForecastDay {
    date: string; // ISO YYYY-MM-DD (UTC)
    phase: CyclePhase;
    confidence: Confidence;
    /** True if this day falls inside the predicted fertile window. */
    isPredictedFertile: boolean;
    /** True if this day is the predicted ovulation day. */
    isPredictedOvulation: boolean;
    /** True if this day overlaps an ACTUAL logged period (start..end). */
    isLogged: boolean;
}

export interface CycleForecast {
    /** Overall confidence in the prediction (also each day's confidence). */
    confidence: Confidence;
    /** True when we can only track, not predict (NONE confidence). */
    trackingOnly: boolean;
    /** Predicted next period start (ISO YYYY-MM-DD), or null if unpredictable. */
    predictedNextPeriodStart: string | null;
    /** Predicted ovulation day (ISO YYYY-MM-DD), or null. */
    predictedOvulationDate: string | null;
    /** Predicted fertile window [start,end] ISO (inclusive), or null. */
    fertileWindow: { start: string; end: string } | null;
    /** Days in the window, each carrying phase/confidence/flags. */
    days: ForecastDay[];
    /** Machine-readable reason the confidence was downgraded (or 'ok'). */
    reason: string;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MIN_CYCLE_LENGTH = 21;
const MAX_CYCLE_LENGTH = 40;
const LUTEAL_PHASE_LENGTH = 14;
const STALE_CYCLE_MULTIPLIER = 1.5;
// SD above which even an in-gate cycle is considered too variable for HIGH.
const HIGH_SD_THRESHOLD = 7;
const MEDIUM_SD_THRESHOLD = 3;

function toUtcMidnightMs(value: Date | string | null | undefined): number | null {
    if (value == null) return null;
    const d = value instanceof Date ? value : new Date(value);
    const t = d.getTime();
    if (Number.isNaN(t)) return null;
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function msToIso(ms: number): string {
    return new Date(ms).toISOString().slice(0, 10);
}

function addDays(ms: number, n: number): number {
    return ms + n * MS_PER_DAY;
}

/**
 * computeCycleForecast — PURE. Produces a per-day calendar + summary predictions
 * with explicit uncertainty.
 *
 * @param input        cycle inputs + learned variability/history signals
 * @param windowStart  first day of the calendar window (UTC date)
 * @param windowEnd    last day of the calendar window (UTC date, inclusive)
 * @param today        reference "now" (defaults to current time)
 */
export function computeCycleForecast(
    input: ForecastInput,
    windowStart: Date,
    windowEnd: Date,
    today: Date = new Date(),
): CycleForecast {
    const startMs = toUtcMidnightMs(windowStart)!;
    const endMs = toUtcMidnightMs(windowEnd)!;
    const todayMs = toUtcMidnightMs(today)!;

    // ── Pre-compute the set of ACTUAL logged days (for logged-vs-predicted). ────
    const loggedSet = new Set<string>(input.loggedPeriodDates ?? []);

    // Helper to render a tracking-only / no-prediction calendar (still shows phase
    // via computeCyclePhase, which will itself return UNKNOWN for these gates).
    const buildTrackingOnly = (reason: string): CycleForecast => {
        const days: ForecastDay[] = [];
        for (let ms = startMs; ms <= endMs; ms = addDays(ms, 1)) {
            const iso = msToIso(ms);
            days.push({
                date: iso,
                phase: computeCyclePhase(input, new Date(ms)),
                confidence: 'NONE',
                isPredictedFertile: false,
                isPredictedOvulation: false,
                isLogged: loggedSet.has(iso),
            });
        }
        return {
            confidence: 'NONE',
            trackingOnly: true,
            predictedNextPeriodStart: null,
            predictedOvulationDate: null,
            fertileWindow: null,
            days,
            reason,
        };
    };

    // ── Hard gates that mean we can only TRACK, never predict (NONE). ───────────
    if (input.cycleTrackingEnabled !== true) return buildTrackingOnly('tracking_disabled');
    if ((input.biologicalSex ?? '').toUpperCase() !== 'FEMALE') return buildTrackingOnly('not_female');
    if (input.hormonalContraception === true) return buildTrackingOnly('hormonal_contraception');

    const L = input.avgCycleLengthDays;
    if (L == null || !Number.isFinite(L) || L < MIN_CYCLE_LENGTH || L > MAX_CYCLE_LENGTH) {
        return buildTrackingOnly('cycle_length_out_of_gate');
    }

    const lastMs = toUtcMidnightMs(input.lastPeriodStartDate ?? null);
    if (lastMs == null) return buildTrackingOnly('no_last_period');
    if (lastMs > todayMs) return buildTrackingOnly('future_last_period');

    const daysSinceLast = Math.floor((todayMs - lastMs) / MS_PER_DAY);
    if (daysSinceLast > STALE_CYCLE_MULTIPLIER * L) {
        // Stale: we still predict the next start (best-effort) but at LOW confidence
        // and with a WIDE fertile window — do not pretend to know the exact day.
        return buildLowConfidenceForecast(input, L, lastMs, startMs, endMs, todayMs, loggedSet, 'stale_last_period');
    }

    // ── Confidence tiering (uncertainty-aware) ─────────────────────────────────
    // Determine the base confidence from regularity + variability + evidence.
    const sd = input.cycleLengthStdDev ?? null;
    const logged = input.loggedCycleCount ?? 0;
    const selfIrregular = (input.cycleRegularity ?? '').toUpperCase() === 'IRREGULAR';

    if (selfIrregular || (sd != null && sd > HIGH_SD_THRESHOLD)) {
        return buildLowConfidenceForecast(input, L, lastMs, startMs, endMs, todayMs, loggedSet, 'irregular');
    }

    let confidence: Confidence;
    let reason: string;
    if (logged < 2 && sd == null) {
        // Predicting purely off the (template/self-reported) cycle length with no
        // observed history -> MEDIUM at best, with a slightly widened window.
        confidence = 'MEDIUM';
        reason = 'insufficient_history';
    } else if (logged === 2 && sd == null) {
        // Exactly two logged starts gives a SINGLE observed gap with no measurable
        // variability — that lone data point is NOT high-confidence. Downgrade to
        // MEDIUM with the widened (+/-3) window rather than implying tight precision.
        confidence = 'MEDIUM';
        reason = 'single_observed_gap';
    } else if (sd != null && sd > MEDIUM_SD_THRESHOLD) {
        confidence = 'MEDIUM';
        reason = 'moderate_variability';
    } else {
        confidence = 'HIGH';
        reason = 'ok';
    }

    // Fertile-window half-width widens as confidence drops (uncertainty -> width):
    //   HIGH   = +/-1 day around ovulation (the classic fertile window)
    //   MEDIUM = +/-3 days
    const halfWidth = confidence === 'HIGH' ? 1 : 3;

    return buildForecast(input, L, lastMs, startMs, endMs, todayMs, loggedSet, confidence, reason, halfWidth);
}

/** LOW-confidence forecast: still predicts a next-start but with a WIDE window. */
function buildLowConfidenceForecast(
    input: ForecastInput,
    L: number,
    lastMs: number,
    startMs: number,
    endMs: number,
    todayMs: number,
    loggedSet: Set<string>,
    reason: string,
): CycleForecast {
    // +/-5 days: deliberately wide so we never imply false precision.
    return buildForecast(input, L, lastMs, startMs, endMs, todayMs, loggedSet, 'LOW', reason, 5);
}

/**
 * Shared forecast assembler: projects the next period start forward from lastMs in
 * steps of L until it is >= today's cycle, derives ovulation = nextStart - luteal,
 * builds the fertile window of the given half-width, and renders per-day rows.
 */
function buildForecast(
    input: ForecastInput,
    L: number,
    lastMs: number,
    startMs: number,
    endMs: number,
    todayMs: number,
    loggedSet: Set<string>,
    confidence: Confidence,
    reason: string,
    halfWidth: number,
): CycleForecast {
    // Project the NEXT period start: the FIRST projected start (lastMs + k*L) that
    // is strictly in the FUTURE relative to today, so the predicted next period —
    // and its derived fertile window / ovulation — never lands in the past for an
    // overdue-but-not-stale cycle. We anchor on lastMs and step by L.
    let nextStart = lastMs + L * MS_PER_DAY;
    while (nextStart <= todayMs) {
        nextStart += L * MS_PER_DAY;
    }

    // Ovulation ~ 14 days before the NEXT period start (fixed-luteal).
    const ovulationMs = nextStart - LUTEAL_PHASE_LENGTH * MS_PER_DAY;
    const fertileStartMs = ovulationMs - halfWidth * MS_PER_DAY;
    const fertileEndMs = ovulationMs + halfWidth * MS_PER_DAY;

    const days: ForecastDay[] = [];
    for (let ms = startMs; ms <= endMs; ms = addDays(ms, 1)) {
        const iso = msToIso(ms);
        days.push({
            date: iso,
            phase: computeCyclePhase(input, new Date(ms)),
            confidence,
            isPredictedFertile: ms >= fertileStartMs && ms <= fertileEndMs,
            isPredictedOvulation: ms === ovulationMs,
            isLogged: loggedSet.has(iso),
        });
    }

    return {
        confidence,
        trackingOnly: false,
        predictedNextPeriodStart: msToIso(nextStart),
        predictedOvulationDate: msToIso(ovulationMs),
        fertileWindow: { start: msToIso(fertileStartMs), end: msToIso(fertileEndMs) },
        days,
        reason,
    };
}
