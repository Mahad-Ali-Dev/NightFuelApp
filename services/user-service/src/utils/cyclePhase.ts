/**
 * computeCyclePhase — PURE, fully-unit-testable derivation of a menstrual-cycle
 * phase from a user's persisted cycle inputs.
 *
 * DESIGN PHILOSOPHY (non-negotiable): TRACK-FIRST, SUGGESTION-SECOND.
 * The science here is weak and individual variation dominates, so this function
 * is deliberately CONSERVATIVE: it returns 'UNKNOWN' (meaning "do NOT apply any
 * phase-syncing") unless EVERY gate below is satisfied. UNKNOWN is the safe
 * default that covers male / non-female users, opted-out users, hormonal
 * contraception, irregular / PCOS-like cycles, out-of-range cycle lengths,
 * missing data, and a likely-missed period (stale). Non-tracking users always
 * resolve to UNKNOWN and behave exactly as before this feature existed.
 *
 * ALGORITHM (calendar, fixed-luteal — the textbook approximation):
 *   L            = avgCycleLengthDays
 *   dayInCycle   = ((today - lastPeriodStartDate) mod L) + 1   // 1-based
 *   ovulationDay = L - 14                                       // fixed luteal
 *   ovulatory window = [ovulationDay - 1, ovulationDay + 1]
 *     dayInCycle <= avgPeriodLengthDays  -> MENSTRUAL
 *     dayInCycle <  window.start         -> FOLLICULAR
 *     dayInCycle <= window.end           -> OVULATORY
 *     else                               -> LUTEAL
 *
 * All date math is UTC date-only (mirrors the F23 calculateAge UTC fix): both
 * `today` and `lastPeriodStartDate` are normalized to UTC midnight before the
 * day-difference is taken, so DST / timezone offsets cannot shift a phase.
 */

export type CyclePhase = 'MENSTRUAL' | 'FOLLICULAR' | 'OVULATORY' | 'LUTEAL' | 'UNKNOWN';

export interface CyclePhaseInput {
    cycleTrackingEnabled?: boolean | null;
    biologicalSex?: string | null;
    hormonalContraception?: boolean | null;
    cycleRegularity?: string | null; // REGULAR | IRREGULAR | UNKNOWN
    avgCycleLengthDays?: number | null;
    avgPeriodLengthDays?: number | null;
    lastPeriodStartDate?: Date | string | null;
}

// Inclusive gate on the average cycle length. Outside this range the fixed-luteal
// approximation is not meaningful, so we degrade to UNKNOWN.
const MIN_CYCLE_LENGTH = 21;
const MAX_CYCLE_LENGTH = 40;
// A period is considered "likely missed" (STALE) once we are more than
// ~1.5 * L days past the last recorded period start — at that point the stored
// lastPeriodStartDate can no longer be trusted to place us in the current cycle.
const STALE_CYCLE_MULTIPLIER = 1.5;
// Fixed luteal-phase length (days) — the standard clinical assumption that the
// luteal phase is ~constant and cycle-length variation lives in the follicular
// phase. ovulationDay = L - LUTEAL_PHASE_LENGTH.
const LUTEAL_PHASE_LENGTH = 14;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Normalize any Date to UTC midnight as an epoch-ms value (date-only math). */
function toUtcMidnightMs(d: Date): number {
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * Parse the persisted lastPeriodStartDate into a Date, or null if unusable.
 * Strings are interpreted exactly like the YYYY-MM-DD dateOfBirth field (UTC
 * midnight via `new Date(...)`); Date instances pass through.
 */
function parseLastPeriod(value: Date | string | null | undefined): Date | null {
    if (value == null) return null;
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d;
}

/**
 * Compute the derived cycle phase. PURE — no I/O, no globals (today is injected).
 *
 * @param input  the user's persisted cycle inputs (raw profile fields)
 * @param today  the reference "now" (defaults to current time); normalized to UTC date
 */
export function computeCyclePhase(input: CyclePhaseInput, today: Date = new Date()): CyclePhase {
    // ── Gate 1: tracking explicitly enabled ──────────────────────────────────
    if (input.cycleTrackingEnabled !== true) return 'UNKNOWN';

    // ── Gate 2: biological sex must be FEMALE ────────────────────────────────
    if ((input.biologicalSex ?? '').toUpperCase() !== 'FEMALE') return 'UNKNOWN';

    // ── Gate 3: hormonal contraception suppresses the natural cycle ──────────
    if (input.hormonalContraception === true) return 'UNKNOWN';

    // ── Gate 4: irregular / PCOS-like cycles are tracking-only ───────────────
    if ((input.cycleRegularity ?? '').toUpperCase() === 'IRREGULAR') return 'UNKNOWN';

    // ── Gate 5: cycle length must be present and in [21, 40] ──────────────────
    const L = input.avgCycleLengthDays;
    if (L == null || !Number.isFinite(L) || L < MIN_CYCLE_LENGTH || L > MAX_CYCLE_LENGTH) {
        return 'UNKNOWN';
    }

    // Period length: fall back to a clinical default if missing/invalid, clamped
    // so it can never exceed the cycle length.
    let periodLen = input.avgPeriodLengthDays;
    if (periodLen == null || !Number.isFinite(periodLen) || periodLen < 1) periodLen = 5;
    if (periodLen >= L) periodLen = Math.max(1, L - 1);

    // ── Gate 6: lastPeriodStartDate must be present and parseable ─────────────
    const lastPeriod = parseLastPeriod(input.lastPeriodStartDate);
    if (!lastPeriod) return 'UNKNOWN';

    const todayMs = toUtcMidnightMs(today);
    const lastMs = toUtcMidnightMs(lastPeriod);

    // A lastPeriodStartDate in the FUTURE is nonsensical input -> UNKNOWN.
    if (lastMs > todayMs) return 'UNKNOWN';

    const daysSince = Math.floor((todayMs - lastMs) / MS_PER_DAY);

    // ── Gate 7: staleness — a period was likely missed -> UNKNOWN ────────────
    if (daysSince > STALE_CYCLE_MULTIPLIER * L) return 'UNKNOWN';

    // ── Phase computation (calendar, fixed-luteal) ───────────────────────────
    const dayInCycle = (daysSince % L) + 1; // 1-based day within the current cycle
    const ovulationDay = L - LUTEAL_PHASE_LENGTH;
    const windowStart = ovulationDay - 1;
    const windowEnd = ovulationDay + 1;

    if (dayInCycle <= periodLen) return 'MENSTRUAL';
    if (dayInCycle < windowStart) return 'FOLLICULAR';
    if (dayInCycle <= windowEnd) return 'OVULATORY';
    return 'LUTEAL';
}
