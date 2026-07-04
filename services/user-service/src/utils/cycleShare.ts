/**
 * cycleShare — the two PURE, privacy-critical primitives behind the user-initiated
 * "share my cycle with a partner" grant (Period P3 tail).
 *
 *   1. generateShareCode()          — mints the long, opaque, un-guessable code.
 *   2. sanitizeSharedCycleSummary() — the ALLOW-LIST that decides EXACTLY which
 *                                     fields a partner may ever see.
 *
 * PRIVACY POSTURE (non-negotiable): a share code is a BEARER credential to GDPR
 * Art.9 special-category health data. The safe design is:
 *   - codes are HIGH-ENTROPY (192 bits) so they can't be guessed or enumerated;
 *   - the summary is built by an explicit ALLOW-LIST (a brand-new object with only
 *     named safe keys), NOT by deleting fields off the raw objects — so a future
 *     field added to UserStatus / the forecast can never silently leak. A partner
 *     sees ONLY the current phase + the next-period / fertile-window PREDICTIONS.
 *
 * NEVER exposed (by construction — these keys are simply never copied in):
 *   - any raw symptom / discharge / sexual-activity / notes log (those live in
 *     CycleSymptomLog and are never even read on the resolve path);
 *   - the per-day forecast calendar (`days` / `isLogged`) — it reveals the actual
 *     logged period days, which is rawer than a prediction;
 *   - the machine `reason` string — it leaks health/identity facts such as
 *     `hormonal_contraception` / `not_female` / `no_last_period`;
 *   - every other UserStatus field (fatigue, adherence, streak, TDEE, weight trend).
 *
 * Both functions are unit-tested in __tests__/cycle-share.test.ts.
 */

import { randomBytes } from 'crypto';
import type { CycleForecast, Confidence } from './cycleForecast';
import type { CyclePhase } from './cyclePhase';

// The only implemented exposure scope. The model stores a scopes[] for future
// extensibility, but the resolver ONLY ever emits this sanitized summary.
export const CYCLE_SHARE_SCOPE_SUMMARY = 'summary';
export const DEFAULT_CYCLE_SHARE_SCOPES: string[] = [CYCLE_SHARE_SCOPE_SUMMARY];

// 24 random bytes -> 192 bits of entropy -> 32-char URL-safe (base64url) string.
// Way beyond guessable/enumerable; safe to carry in a shareable link.
const SHARE_CODE_BYTES = 24;

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const VALID_PHASES = new Set<CyclePhase>(['MENSTRUAL', 'FOLLICULAR', 'OVULATORY', 'LUTEAL', 'UNKNOWN']);

/**
 * Mint a long, opaque, URL-safe partner-share code. base64url has no `+`, `/`, or
 * `=`, so the code drops straight into a link or a copy field with no escaping.
 */
export function generateShareCode(): string {
    return randomBytes(SHARE_CODE_BYTES).toString('base64url');
}

/** The exact, minimal payload a partner receives. No field here is sensitive. */
export interface SharedCycleSummary {
    /** Whose cycle this is — low-sensitivity display name so the viewer can confirm
     * they have the right person's code. Never any other profile field. */
    owner: { displayName: string | null };
    /** Current derived phase (or UNKNOWN when not predictable / not tracking). */
    currentPhase: CyclePhase;
    /** Predicted next period start (ISO YYYY-MM-DD) or null. */
    predictedNextPeriodStart: string | null;
    /** Predicted ovulation day (ISO YYYY-MM-DD) or null. */
    predictedOvulationDate: string | null;
    /** Predicted fertile window [start,end] (inclusive ISO) or null. */
    fertileWindow: { start: string; end: string } | null;
    /** Convenience countdown to the predicted next period (>= 0) or null. */
    daysUntilNextPeriod: number | null;
    /** Prediction confidence tier (so the partner UI can show uncertainty). */
    confidence: Confidence;
    /** True when the owner's cycle can only be tracked, not predicted. */
    trackingOnly: boolean;
    /** Echoes the grant's scope(s) — always summary-only in this implementation. */
    scopes: string[];
}

export interface SanitizeSharedCycleInput {
    /** Owner's display name (the only profile field copied through). */
    displayName?: string | null;
    /** Owner's current derived phase (UserStatus.cyclePhase); anything else on the
     * status row is ignored. */
    cyclePhase?: string | null;
    /** The owner's full forecast — ONLY its summary scalars are copied out. */
    forecast: CycleForecast;
    /** The grant's scopes (echoed back); defaults to summary-only. */
    scopes?: string[] | null;
    /** Reference "now" for the days-until countdown (injected for pure testing). */
    today?: Date;
}

/**
 * Build the partner-facing summary via an explicit ALLOW-LIST. Returns a brand-new
 * object containing ONLY the named safe keys, so nothing sensitive on the raw
 * status/forecast can ever ride along. PURE — no I/O, `today` is injected.
 */
export function sanitizeSharedCycleSummary(input: SanitizeSharedCycleInput): SharedCycleSummary {
    const f = input.forecast;

    // Normalize the phase to the known enum; anything unexpected -> UNKNOWN.
    const phaseRaw = (input.cyclePhase ?? 'UNKNOWN').toString().toUpperCase() as CyclePhase;
    const currentPhase: CyclePhase = VALID_PHASES.has(phaseRaw) ? phaseRaw : 'UNKNOWN';

    const predictedNextPeriodStart = f?.predictedNextPeriodStart ?? null;

    // Days until the next predicted period (UTC date-only, clamped to >= 0).
    let daysUntilNextPeriod: number | null = null;
    if (predictedNextPeriodStart) {
        const today = input.today ?? new Date();
        const todayMs = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
        const nextMs = Date.parse(`${predictedNextPeriodStart}T00:00:00.000Z`);
        if (!Number.isNaN(nextMs)) {
            daysUntilNextPeriod = Math.max(0, Math.round((nextMs - todayMs) / MS_PER_DAY));
        }
    }

    const scopes =
        input.scopes && input.scopes.length > 0 ? input.scopes.slice() : DEFAULT_CYCLE_SHARE_SCOPES.slice();

    return {
        owner: { displayName: input.displayName ?? null },
        currentPhase,
        predictedNextPeriodStart,
        predictedOvulationDate: f?.predictedOvulationDate ?? null,
        fertileWindow: f?.fertileWindow
            ? { start: f.fertileWindow.start, end: f.fertileWindow.end }
            : null,
        daysUntilNextPeriod,
        confidence: f?.confidence ?? 'NONE',
        trackingOnly: f?.trackingOnly === true,
        scopes,
    };
}
