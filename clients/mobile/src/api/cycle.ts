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

// ── Cycle symptoms (per-day log) ───────────────────────────────────────────────
export type SymptomFlow = 'NONE' | 'SPOTTING' | 'LIGHT' | 'MEDIUM' | 'HEAVY';
// Cervical mucus / discharge — a fertility signal (Period P1).
export type SymptomDischarge = 'DRY' | 'STICKY' | 'CREAMY' | 'EGG_WHITE' | 'WATERY' | 'SPOTTING';
// Sexual activity + protection — private (Period P1).
export type SymptomActivity = 'NONE' | 'PROTECTED' | 'UNPROTECTED' | 'HIGH_DRIVE';
// LH ovulation-test result — a fertility signal (Period P3). A positive LH surge
// typically precedes ovulation by ~a day; this is an ESTIMATE, never a diagnosis.
export type OvulationTest = 'POSITIVE' | 'NEGATIVE';

export interface CycleSymptomEntry {
    id: string;
    date: string;            // ISO date
    mood: number | null;     // 1..5
    cramps: number | null;   // 0..3
    energy: number | null;   // 1..5
    flow: SymptomFlow | null;
    notes: string | null;
    // ── Period P1 additions ────────────────────────────────────────────────────
    symptoms?: string[] | null;        // selected symptom keys (see features/cycle/symptoms)
    discharge?: SymptomDischarge | null;
    activity?: SymptomActivity | null;
    water?: number | null;             // glasses
    // ── Period P3 additions (advanced fertility signals) ────────────────────────
    bbt?: number | null;               // basal body temperature, °C (the server persists it)
    weight?: number | null;            // body weight, kg
    ovulationTest?: OvulationTest | null; // LH ovulation-test result
}

export interface LogSymptomsBody {
    date?: string;           // YYYY-MM-DD; defaults to today server-side
    mood?: number;
    cramps?: number;
    energy?: number;
    flow?: SymptomFlow;
    notes?: string;
    symptoms?: string[];
    discharge?: SymptomDischarge;
    activity?: SymptomActivity;
    water?: number;
    // ── Period P3 additions (advanced fertility signals) ────────────────────────
    bbt?: number;                 // basal body temperature, °C
    weight?: number;              // body weight, kg
    ovulationTest?: OvulationTest; // LH ovulation-test result
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

// ── Cycle health: pregnancy mode + birth-control / pill tracking (Period P2) ────
// These mirror the user-service cycle-health routes EXACTLY (services/user-service
// PATCH /cycle/health + POST/GET /cycle/pill). All PATCH fields are OPTIONAL — the
// client sends only what changed and the server patches that subset, returning the
// full updated profile row (same shape getMyProfile returns). Data minimization: a
// user opts INTO this — nothing is populated unless they turn pregnancy mode or a
// birth-control method on.

// Contraception method the profile row stores. 'NONE' clears it; null is "unset".
export type BirthControlMethod =
    | 'PILL'
    | 'PATCH'
    | 'RING'
    | 'INJECTION'
    | 'IUD'
    | 'IMPLANT'
    | 'NONE';

// Daily pill-log state (matches the server's pill status enum).
export type PillStatus = 'TAKEN' | 'SKIPPED' | 'LATE';

// One stored pill-log row (GET /cycle/pill returns these newest-first).
export interface PillLogEntry {
    id: string;
    date: string;            // YYYY-MM-DD
    status: PillStatus;
}

// PATCH /cycle/health body — every field optional (send only the delta). Dates are
// YYYY-MM-DD; pillReminderTime is 'HH:MM' (24h, same contract DateTimeField emits).
// birthControlMethod accepts the 7 methods above OR null to clear the selection.
export interface CycleHealthBody {
    pregnancyMode?: boolean;
    pregnancyDueDate?: string | null;      // YYYY-MM-DD
    pregnancyStartDate?: string | null;    // YYYY-MM-DD
    tryingToConceive?: boolean;
    birthControlMethod?: BirthControlMethod | null;
    pillReminderEnabled?: boolean;
    pillReminderTime?: string | null;      // 'HH:MM' (24h)
    pillPackStartDate?: string | null;     // YYYY-MM-DD
}

/**
 * PATCH /v1/users/me/cycle/health — update pregnancy-mode / birth-control settings.
 *
 * Send only the fields that changed; the server patches that subset and returns the
 * FULL updated profile row (identical shape to getMyProfile), so callers should
 * invalidate ['my-profile'] on success to re-read the merged state.
 */
export const updateCycleHealth = async (body: CycleHealthBody): Promise<any> => {
    const { data } = await apiClient.patch('/v1/users/me/cycle/health', body);
    return data;
};

// POST /cycle/pill body — record today's (or a given day's) pill as taken/skipped/
// late. `date` defaults to today server-side when omitted.
export interface LogPillBody {
    date?: string;           // YYYY-MM-DD; defaults to today server-side
    status: PillStatus;
}

/** POST /v1/users/me/cycle/pill — log a pill status for today (or a given day). */
export const logPill = async (body: LogPillBody): Promise<PillLogEntry> => {
    const { data } = await apiClient.post<PillLogEntry>('/v1/users/me/cycle/pill', body);
    return data;
};

/** GET /v1/users/me/cycle/pill?days= — trailing pill-log window, newest first. */
export const getPillLogs = async (days = 35): Promise<{ pills: PillLogEntry[] }> => {
    const { data } = await apiClient.get<{ pills: PillLogEntry[] }>(
        '/v1/users/me/cycle/pill',
        { params: { days } },
    );
    return data;
};

// ── Partner cycle-sharing (Period P3 tail) ──────────────────────────────────────
// The OWNER generates a long, opaque, REVOCABLE code (mirrors the user-service
// CycleShare model) and hands it to a partner. The partner opens the read-only
// viewer which resolves the code -> a SANITIZED summary (current phase + next-
// period / fertile-window PREDICTIONS only). The server NEVER exposes the raw
// symptom / discharge / sexual-activity / notes logs through this path — the
// summary is an explicit server-side allow-list.
//
// Owner endpoints (self-only, JWT):
//   - GET    /v1/users/me/cycle/share   -> { share: CycleShareGrant | null }
//   - POST   /v1/users/me/cycle/share   -> { share: CycleShareGrant }   (idempotent)
//   - DELETE /v1/users/me/cycle/share   -> { revoked, count }
// Public partner read (no auth, tight rate limit):
//   - GET    /v1/users/cycle-share/:code -> SharedCycleSummary  (404 if unknown/revoked)

/** The owner's view of their OWN share grant (safe to show the owner). */
export interface CycleShareGrant {
    code: string;          // opaque, URL-safe bearer code
    scopes: string[];      // exposure scope(s); always summary-only for now
    createdAt: string;     // ISO timestamp
    active: boolean;       // false once revoked
}

/**
 * The sanitized, partner-facing summary (mirrors user-service SharedCycleSummary).
 * Contains ONLY predictions + the current phase — never any raw log. Matches the
 * server allow-list field-for-field; do not add sensitive fields on the wire.
 */
export interface SharedCycleSummary {
    owner: { displayName: string | null };
    currentPhase: CyclePhase;
    predictedNextPeriodStart: string | null;   // YYYY-MM-DD
    predictedOvulationDate: string | null;      // YYYY-MM-DD
    fertileWindow: { start: string; end: string } | null;
    daysUntilNextPeriod: number | null;
    confidence: Confidence;
    trackingOnly: boolean;
    scopes: string[];
}

/** GET /v1/users/me/cycle/share — the caller's active share, or null. */
export const getCycleShare = async (): Promise<{ share: CycleShareGrant | null }> => {
    const { data } = await apiClient.get<{ share: CycleShareGrant | null }>('/v1/users/me/cycle/share');
    return data;
};

/**
 * POST /v1/users/me/cycle/share — generate the caller's share code. IDEMPOTENT:
 * the server returns the existing active code rather than minting a duplicate, so
 * this never silently invalidates a code already handed to a partner.
 */
export const createCycleShare = async (): Promise<{ share: CycleShareGrant }> => {
    const { data } = await apiClient.post<{ share: CycleShareGrant }>('/v1/users/me/cycle/share');
    return data;
};

/** DELETE /v1/users/me/cycle/share — revoke the caller's active share(s). */
export const revokeCycleShare = async (): Promise<{ revoked: boolean; count: number }> => {
    const { data } = await apiClient.delete<{ revoked: boolean; count: number }>('/v1/users/me/cycle/share');
    return data;
};

/**
 * GET /v1/users/cycle-share/:code — resolve a partner-presented code to the
 * owner's sanitized summary. PUBLIC (no auth needed); a 404 means the code is
 * unknown or revoked. The path is intentionally NOT under `/me/` — the caller
 * is the partner, identified only by the opaque code.
 */
export const resolveSharedCycle = async (code: string): Promise<SharedCycleSummary> => {
    const { data } = await apiClient.get<SharedCycleSummary>(
        `/v1/users/cycle-share/${encodeURIComponent(code)}`,
    );
    return data;
};
