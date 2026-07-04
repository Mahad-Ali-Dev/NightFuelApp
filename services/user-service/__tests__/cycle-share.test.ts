/**
 * cycleShare util suite — locks the TWO privacy-critical primitives behind the
 * "share my cycle with a partner" grant (src/utils/cycleShare.ts):
 *
 *   1. generateShareCode()          — must be long, opaque, URL-safe, unique.
 *   2. sanitizeSharedCycleSummary() — the ALLOW-LIST. The core privacy guarantee
 *      is proven adversarially: even when fed a forecast/status stuffed with
 *      sensitive fields (per-day logged calendar, machine `reason`, symptom /
 *      activity / notes, UserStatus secrets), the output must contain ONLY the
 *      named safe summary keys and NONE of the sensitive material.
 *
 * PURE unit suite — no DB / Redis / Fastify. `today` is injected for the countdown.
 */
import {
    generateShareCode,
    sanitizeSharedCycleSummary,
    SharedCycleSummary,
} from '../src/utils/cycleShare';
import type { CycleForecast } from '../src/utils/cycleForecast';

const utc = (y: number, mZeroBased: number, d: number): Date =>
    new Date(Date.UTC(y, mZeroBased, d, 0, 0, 0, 0));

// The exact, complete set of keys a partner may EVER receive. If sanitize ever
// grows a key, this test forces a conscious update (and a privacy re-review).
const ALLOWED_TOP_LEVEL_KEYS = [
    'owner',
    'currentPhase',
    'predictedNextPeriodStart',
    'predictedOvulationDate',
    'fertileWindow',
    'daysUntilNextPeriod',
    'confidence',
    'trackingOnly',
    'scopes',
].sort();

// A realistic HIGH-confidence forecast, but DELIBERATELY loaded with the sensitive
// fields the sanitizer must strip: a per-day `days` calendar carrying `isLogged`
// (the actual logged period days) and a `reason` that leaks a health fact.
const RICH_FORECAST: CycleForecast = {
    confidence: 'HIGH',
    trackingOnly: false,
    predictedNextPeriodStart: '2026-07-20',
    predictedOvulationDate: '2026-07-06',
    fertileWindow: { start: '2026-07-05', end: '2026-07-07' },
    days: [
        { date: '2026-07-01', phase: 'FOLLICULAR', confidence: 'HIGH', isPredictedFertile: false, isPredictedOvulation: false, isLogged: true },
        { date: '2026-07-06', phase: 'OVULATORY', confidence: 'HIGH', isPredictedFertile: true, isPredictedOvulation: true, isLogged: false },
    ],
    reason: 'ok',
};

describe('generateShareCode() — long, opaque, URL-safe, unique', () => {
    it('is a URL-safe base64url string with no +, /, or = padding', () => {
        const code = generateShareCode();
        expect(typeof code).toBe('string');
        expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
        expect(code).not.toContain('+');
        expect(code).not.toContain('/');
        expect(code).not.toContain('=');
    });

    it('is long enough to be un-guessable (>= 32 chars for 24 random bytes)', () => {
        expect(generateShareCode().length).toBeGreaterThanOrEqual(32);
    });

    it('produces a unique code every time (no collisions over 5000 draws)', () => {
        const seen = new Set<string>();
        for (let i = 0; i < 5000; i++) {
            const code = generateShareCode();
            expect(seen.has(code)).toBe(false);
            expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
            seen.add(code);
        }
        expect(seen.size).toBe(5000);
    });
});

describe('sanitizeSharedCycleSummary() — allow-list (privacy core)', () => {
    it('emits EXACTLY the allowed top-level keys and nothing else', () => {
        const out = sanitizeSharedCycleSummary({
            displayName: 'Alex',
            cyclePhase: 'OVULATORY',
            forecast: RICH_FORECAST,
            today: utc(2026, 6, 4),
        });
        expect(Object.keys(out).sort()).toEqual(ALLOWED_TOP_LEVEL_KEYS);
        // owner sub-object exposes ONLY displayName.
        expect(Object.keys(out.owner)).toEqual(['displayName']);
    });

    it('NEVER leaks the per-day calendar, isLogged, or the machine reason', () => {
        const out = sanitizeSharedCycleSummary({
            displayName: 'Alex',
            cyclePhase: 'OVULATORY',
            forecast: RICH_FORECAST,
        });
        const serialized = JSON.stringify(out);
        expect(out).not.toHaveProperty('days');
        expect(out).not.toHaveProperty('reason');
        expect(serialized).not.toContain('isLogged');
        expect(serialized).not.toContain('isPredictedFertile');
        expect(serialized).not.toContain('reason');
    });

    it('cannot leak a health-revealing reason even when the forecast carries one', () => {
        // A tracking-only forecast whose reason discloses hormonal contraception —
        // exactly the kind of health fact a partner must never infer from the code.
        const trackingOnly: CycleForecast = {
            confidence: 'NONE',
            trackingOnly: true,
            predictedNextPeriodStart: null,
            predictedOvulationDate: null,
            fertileWindow: null,
            days: [],
            reason: 'hormonal_contraception',
        };
        const out = sanitizeSharedCycleSummary({ displayName: 'Sam', cyclePhase: 'UNKNOWN', forecast: trackingOnly });
        expect(JSON.stringify(out)).not.toContain('hormonal_contraception');
        expect(out.trackingOnly).toBe(true);
        expect(out.currentPhase).toBe('UNKNOWN');
        expect(out.predictedNextPeriodStart).toBeNull();
        expect(out.fertileWindow).toBeNull();
    });

    it('does not carry stray symptom / activity / notes keys even if injected', () => {
        // Adversarial: cast an object with extra sensitive keys through the forecast
        // slot. The allow-list must copy ONLY the named fields, dropping the rest.
        const polluted = {
            ...RICH_FORECAST,
            activity: 'UNPROTECTED',
            discharge: 'EGG_WHITE',
            notes: 'private note',
            fatigueScore: 0.9,
        } as unknown as CycleForecast;
        const out = sanitizeSharedCycleSummary({ displayName: 'Alex', cyclePhase: 'LUTEAL', forecast: polluted });
        const serialized = JSON.stringify(out);
        expect(serialized).not.toContain('UNPROTECTED');
        expect(serialized).not.toContain('EGG_WHITE');
        expect(serialized).not.toContain('private note');
        expect(serialized).not.toContain('fatigueScore');
        expect(out).not.toHaveProperty('activity');
        expect(out).not.toHaveProperty('discharge');
        expect(out).not.toHaveProperty('notes');
    });

    it('copies the summary PREDICTIONS through verbatim', () => {
        const out = sanitizeSharedCycleSummary({
            displayName: 'Alex',
            cyclePhase: 'OVULATORY',
            forecast: RICH_FORECAST,
            today: utc(2026, 6, 4),
        });
        expect(out.owner.displayName).toBe('Alex');
        expect(out.currentPhase).toBe('OVULATORY');
        expect(out.predictedNextPeriodStart).toBe('2026-07-20');
        expect(out.predictedOvulationDate).toBe('2026-07-06');
        expect(out.fertileWindow).toEqual({ start: '2026-07-05', end: '2026-07-07' });
        expect(out.confidence).toBe('HIGH');
        expect(out.trackingOnly).toBe(false);
    });

    it('computes daysUntilNextPeriod from the injected today (UTC, clamped >= 0)', () => {
        // 2026-07-04 -> 2026-07-20 is 16 days out.
        const out = sanitizeSharedCycleSummary({
            displayName: 'Alex',
            cyclePhase: 'LUTEAL',
            forecast: RICH_FORECAST,
            today: utc(2026, 6, 4),
        });
        expect(out.daysUntilNextPeriod).toBe(16);
    });

    it('clamps daysUntilNextPeriod to 0 for a past predicted date (never negative)', () => {
        const out = sanitizeSharedCycleSummary({
            displayName: 'Alex',
            cyclePhase: 'MENSTRUAL',
            forecast: RICH_FORECAST,
            today: utc(2026, 7, 1), // after 2026-07-20
        });
        expect(out.daysUntilNextPeriod).toBe(0);
    });

    it('normalizes an unexpected phase string to UNKNOWN', () => {
        const out = sanitizeSharedCycleSummary({
            displayName: null,
            cyclePhase: 'NOT_A_REAL_PHASE',
            forecast: RICH_FORECAST,
        });
        expect(out.currentPhase).toBe('UNKNOWN');
        expect(out.owner.displayName).toBeNull();
    });

    it('defaults scopes to summary-only, and echoes provided scopes', () => {
        const dflt = sanitizeSharedCycleSummary({ cyclePhase: 'LUTEAL', forecast: RICH_FORECAST });
        expect(dflt.scopes).toEqual(['summary']);

        const echoed = sanitizeSharedCycleSummary({ cyclePhase: 'LUTEAL', forecast: RICH_FORECAST, scopes: ['summary'] });
        expect(echoed.scopes).toEqual(['summary']);
    });

    it('nulls daysUntilNextPeriod when there is no predicted next period', () => {
        const noPrediction: CycleForecast = { ...RICH_FORECAST, predictedNextPeriodStart: null };
        const out = sanitizeSharedCycleSummary({ cyclePhase: 'UNKNOWN', forecast: noPrediction, today: utc(2026, 6, 4) });
        expect(out.daysUntilNextPeriod).toBeNull();
    });
});

// Compile-time guard: the sanitized shape is exactly SharedCycleSummary.
const _typecheck: SharedCycleSummary = sanitizeSharedCycleSummary({ cyclePhase: 'UNKNOWN', forecast: RICH_FORECAST });
void _typecheck;
