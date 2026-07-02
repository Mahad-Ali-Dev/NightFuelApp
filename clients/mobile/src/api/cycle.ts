import { apiClient } from './client';

/**
 * Menstrual-cycle API wrappers (F28 backend contract).
 *
 * These mirror the user-service cycle routes EXACTLY (services/user-service/src/
 * routes.ts + schemas.ts) and the PURE derivation shapes in
 * services/user-service/src/utils/cycleForecast.ts + cycleHistory.ts. Field names
 * are copied verbatim from the server response — do not rename them on the wire.
 *
 * Endpoints:
 *   - POST /v1/users/me/cycle/period   { startDate, endDate? }   -> CycleStatsResponse
 *   - GET  /v1/users/me/cycle/history                            -> CycleHistoryResponse
 *   - GET  /v1/users/me/cycle/forecast?months=                   -> CycleForecast
 *
 * UNCERTAINTY-AWARE: the forecast carries an explicit `confidence` tier and a
 * per-day `isLogged` flag (logged-vs-predicted) + `isPredictedFertile` /
 * `isPredictedOvulation` flags so the UI can render predictions as uncertain and
 * NEVER present them as fact. The cycle phase itself is surfaced on
 * GET /v1/users/me/status (cyclePhase) — see src/api/profile.ts.
 */

// ── Shared enums (match server) ────────────────────────────────────────────────
export type CyclePhase = 'MENSTRUAL' | 'FOLLICULAR' | 'OVULATORY' | 'LUTEAL' | 'UNKNOWN';
export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
export type CycleRegularity = 'REGULAR' | 'IRREGULAR' | 'UNKNOWN';

// ── POST /cycle/period ─────────────────────────────────────────────────────────
// Request body mirrors logPeriodSchema: startDate required, endDate optional, both
// YYYY-MM-DD. The server's refine guards endDate >= startDate.
export interface LogPeriodBody {
    startDate: string;            // YYYY-MM-DD (UTC date-only)
    endDate?: string | null;      // YYYY-MM-DD, optional
}

// Response = computeCycleStatsFromLogs(...) with lastPeriodStartDate serialized to
// an ISO YYYY-MM-DD string (see user.service.ts logPeriod return).
export interface CycleStatsResponse {
    avgCycleLengthDays: number | null;
    avgPeriodLengthDays: number | null;
    cycleLengthStdDev: number | null;
    cycleRegularity: CycleRegularity;
    lastPeriodStartDate: string | null;
    loggedCycleCount: number;
}

// ── GET /cycle/history ─────────────────────────────────────────────────────────
// Each past cycle: start/end + cycle length (gap to next start) + bleed length.
// Ordered most-recent-first by the server (buildCycleHistory).
export interface CycleHistoryEntry {
    startDate: string;                 // YYYY-MM-DD
    endDate: string | null;            // YYYY-MM-DD or null (no end logged)
    cycleLengthDays: number | null;    // null for the most-recent cycle
    periodLengthDays: number | null;   // null when no endDate logged
}

export interface CycleHistoryResponse {
    cycles: CycleHistoryEntry[];
    averages: {
        avgCycleLengthDays: number | null;
        avgPeriodLengthDays: number | null;
        cycleLengthStdDev: number | null;
        cycleRegularity: CycleRegularity;
        loggedCycleCount: number;
    };
}

// ── GET /cycle/forecast ────────────────────────────────────────────────────────
// Per-day calendar row. `isLogged` = actual logged period day (SOLID), while
// `isPredictedFertile` / `isPredictedOvulation` are PREDICTIONS (faded/dotted).
export interface ForecastDay {
    date: string;                  // YYYY-MM-DD (UTC)
    phase: CyclePhase;
    confidence: Confidence;
    isPredictedFertile: boolean;
    isPredictedOvulation: boolean;
    isLogged: boolean;
}

export interface CycleForecast {
    confidence: Confidence;
    trackingOnly: boolean;
    predictedNextPeriodStart: string | null;
    predictedOvulationDate: string | null;
    fertileWindow: { start: string; end: string } | null;
    days: ForecastDay[];
    reason: string;
}

// ── Wrappers ───────────────────────────────────────────────────────────────────

/** POST /v1/users/me/cycle/period — log a period start (+ optional end). */
export const logPeriod = async (body: LogPeriodBody): Promise<CycleStatsResponse> => {
    const { data } = await apiClient.post<CycleStatsResponse>('/v1/users/me/cycle/period', body);
    return data;
};

/** GET /v1/users/me/cycle/history — past cycles + learned averages/variability. */
export const getCycleHistory = async (): Promise<CycleHistoryResponse> => {
    const { data } = await apiClient.get<CycleHistoryResponse>('/v1/users/me/cycle/history');
    return data;
};

/**
 * GET /v1/users/me/cycle/forecast — uncertainty-aware per-day calendar + the
 * predicted next-period / fertile-window / ovulation summary.
 *
 * @param months half-window (1-6) around today; default 1 -> ~current month +/-1.
 */
export const getCycleForecast = async (months = 1): Promise<CycleForecast> => {
    const { data } = await apiClient.get<CycleForecast>('/v1/users/me/cycle/forecast', {
        params: { months },
    });
    return data;
};

// ── Cycle symptoms (per-day quick log) ─────────────────────────────────────────
export type SymptomFlow = 'NONE' | 'SPOTTING' | 'LIGHT' | 'MEDIUM' | 'HEAVY';

export interface CycleSymptomEntry {
    id: string;
    date: string;            // ISO date
    mood: number | null;     // 1..5
    cramps: number | null;   // 0..3
    energy: number | null;   // 1..5
    flow: SymptomFlow | null;
    notes: string | null;
}

export interface LogSymptomsBody {
    date?: string;           // YYYY-MM-DD; defaults to today server-side
    mood?: number;
    cramps?: number;
    energy?: number;
    flow?: SymptomFlow;
    notes?: string;
}

/** POST /v1/users/me/cycle/symptoms — upsert today's (or a given day's) quick log. */
export const logCycleSymptoms = async (body: LogSymptomsBody): Promise<CycleSymptomEntry> => {
    const { data } = await apiClient.post<CycleSymptomEntry>('/v1/users/me/cycle/symptoms', body);
    return data;
};

/** GET /v1/users/me/cycle/symptoms?days= — trailing window, newest first. */
export const getCycleSymptoms = async (days = 35): Promise<{ symptoms: CycleSymptomEntry[] }> => {
    const { data } = await apiClient.get<{ symptoms: CycleSymptomEntry[] }>(
        '/v1/users/me/cycle/symptoms',
        { params: { days } },
    );
    return data;
};
