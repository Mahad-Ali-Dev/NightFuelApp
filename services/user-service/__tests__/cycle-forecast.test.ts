/**
 * computeCycleForecast() — PURE, uncertainty-aware forecast/calendar suite.
 *
 * Locks src/utils/cycleForecast.ts, which powers GET /v1/users/me/cycle/forecast.
 * Key invariants:
 *   - regular, in-gate, fresh, well-evidenced cycle -> HIGH confidence + TIGHT
 *     (+/-1 day) fertile window around ovulation (next-period - 14),
 *   - IRREGULAR (self-reported OR learned) -> LOW confidence + WIDE window,
 *   - hormonal contraception / non-female / tracking-off -> NONE (trackingOnly),
 *   - logged-vs-predicted: days overlapping a logged period are flagged isLogged.
 *
 * Pure — no DB/Redis/Fastify. `today` is injected; all dates UTC date-only.
 */
import { computeCycleForecast, ForecastInput } from '../src/utils/cycleForecast';

const utc = (y: number, mZeroBased: number, d: number): Date =>
    new Date(Date.UTC(y, mZeroBased, d, 0, 0, 0, 0));

// A fully-gated, well-evidenced REGULAR user. L=28 -> ovulation = nextStart - 14.
const REGULAR: ForecastInput = {
    cycleTrackingEnabled: true,
    biologicalSex: 'FEMALE',
    hormonalContraception: false,
    cycleRegularity: 'REGULAR',
    avgCycleLengthDays: 28,
    avgPeriodLengthDays: 5,
    lastPeriodStartDate: utc(2026, 5, 1), // 2026-06-01
    cycleLengthStdDev: 0.5,
    loggedCycleCount: 4,
    loggedPeriodDates: [],
};

const winStart = utc(2026, 5, 1); // 2026-06-01
const winEnd = utc(2026, 5, 30); // 2026-06-30
const today = utc(2026, 5, 10); // 2026-06-10

describe('computeCycleForecast() — regular user (HIGH confidence)', () => {
    const f = computeCycleForecast(REGULAR, winStart, winEnd, today);

    it('is HIGH confidence and not tracking-only', () => {
        expect(f.confidence).toBe('HIGH');
        expect(f.trackingOnly).toBe(false);
        expect(f.reason).toBe('ok');
    });

    it('predicts next period start = lastStart + L', () => {
        // 2026-06-01 + 28 = 2026-06-29
        expect(f.predictedNextPeriodStart).toBe('2026-06-29');
    });

    it('ovulation = nextStart - 14 and fertile window is TIGHT (+/-1 day)', () => {
        // 2026-06-29 - 14 = 2026-06-15
        expect(f.predictedOvulationDate).toBe('2026-06-15');
        expect(f.fertileWindow).toEqual({ start: '2026-06-14', end: '2026-06-16' });
    });

    it('flags the ovulation day and fertile days in the per-day calendar', () => {
        const ov = f.days.find((d) => d.date === '2026-06-15')!;
        expect(ov.isPredictedOvulation).toBe(true);
        expect(ov.isPredictedFertile).toBe(true);
        expect(f.days.find((d) => d.date === '2026-06-14')!.isPredictedFertile).toBe(true);
        expect(f.days.find((d) => d.date === '2026-06-16')!.isPredictedFertile).toBe(true);
        // outside the tight window
        expect(f.days.find((d) => d.date === '2026-06-13')!.isPredictedFertile).toBe(false);
    });

    it('every day carries the overall confidence', () => {
        expect(f.days.every((d) => d.confidence === 'HIGH')).toBe(true);
    });
});

describe('computeCycleForecast() — irregular widens window + lowers confidence', () => {
    it('self-reported IRREGULAR -> LOW confidence, WIDE (+/-5) fertile window', () => {
        const f = computeCycleForecast({ ...REGULAR, cycleRegularity: 'IRREGULAR' }, winStart, winEnd, today);
        expect(f.confidence).toBe('LOW');
        expect(f.reason).toBe('irregular');
        // ovulation 2026-06-15, +/-5 -> 06-10 .. 06-20
        expect(f.fertileWindow).toEqual({ start: '2026-06-10', end: '2026-06-20' });
    });

    it('high learned SD -> LOW confidence even if self-reported REGULAR', () => {
        const f = computeCycleForecast({ ...REGULAR, cycleLengthStdDev: 9 }, winStart, winEnd, today);
        expect(f.confidence).toBe('LOW');
        expect(f.reason).toBe('irregular');
    });

    it('moderate SD -> MEDIUM confidence, +/-3 window', () => {
        const f = computeCycleForecast({ ...REGULAR, cycleLengthStdDev: 4 }, winStart, winEnd, today);
        expect(f.confidence).toBe('MEDIUM');
        expect(f.fertileWindow).toEqual({ start: '2026-06-12', end: '2026-06-18' });
    });

    it('insufficient history (no SD, <2 logged) -> MEDIUM, +/-3 window', () => {
        const f = computeCycleForecast(
            { ...REGULAR, cycleLengthStdDev: null, loggedCycleCount: 1 },
            winStart,
            winEnd,
            today,
        );
        expect(f.confidence).toBe('MEDIUM');
        expect(f.reason).toBe('insufficient_history');
    });

    it('exactly 2 logged starts (single observed gap, no SD) is NOT HIGH/tight', () => {
        // LOW #8: one observed gap with no measurable variability must not imply
        // HIGH confidence with a tight (+/-1) window.
        const f = computeCycleForecast(
            { ...REGULAR, cycleLengthStdDev: null, loggedCycleCount: 2 },
            winStart,
            winEnd,
            today,
        );
        expect(f.confidence).not.toBe('HIGH');
        expect(f.confidence).toBe('MEDIUM');
        expect(f.reason).toBe('single_observed_gap');
        // widened window, not the tight +/-1 around ovulation (2026-06-15)
        expect(f.fertileWindow).toEqual({ start: '2026-06-12', end: '2026-06-18' });
    });
});

describe('computeCycleForecast() — tracking-only (NONE confidence)', () => {
    const expectTrackingOnly = (input: ForecastInput) => {
        const f = computeCycleForecast(input, winStart, winEnd, today);
        expect(f.confidence).toBe('NONE');
        expect(f.trackingOnly).toBe(true);
        expect(f.predictedNextPeriodStart).toBeNull();
        expect(f.predictedOvulationDate).toBeNull();
        expect(f.fertileWindow).toBeNull();
        // days still rendered, but no fertile/ovulation flags
        expect(f.days.length).toBeGreaterThan(0);
        expect(f.days.every((d) => !d.isPredictedFertile && !d.isPredictedOvulation)).toBe(true);
        return f;
    };

    it('hormonal contraception -> NONE (suppressed cycle)', () => {
        expect(expectTrackingOnly({ ...REGULAR, hormonalContraception: true }).reason).toBe(
            'hormonal_contraception',
        );
    });

    it('non-female -> NONE', () => {
        expect(expectTrackingOnly({ ...REGULAR, biologicalSex: 'MALE' }).reason).toBe('not_female');
    });

    it('tracking disabled -> NONE', () => {
        expect(expectTrackingOnly({ ...REGULAR, cycleTrackingEnabled: false }).reason).toBe(
            'tracking_disabled',
        );
    });

    it('cycle length out of gate -> NONE', () => {
        expect(expectTrackingOnly({ ...REGULAR, avgCycleLengthDays: 50 }).reason).toBe(
            'cycle_length_out_of_gate',
        );
    });

    it('no last period -> NONE', () => {
        expect(expectTrackingOnly({ ...REGULAR, lastPeriodStartDate: null }).reason).toBe(
            'no_last_period',
        );
    });
});

describe('computeCycleForecast() — stale last period', () => {
    it('stale (> 1.5L) -> LOW confidence + wide window, still best-effort predicts', () => {
        // last 2026-06-01, today 2026-08-01 (61 days > 42) -> stale
        const f = computeCycleForecast(
            REGULAR,
            utc(2026, 6, 1),
            utc(2026, 7, 31),
            utc(2026, 7, 1),
        );
        expect(f.confidence).toBe('LOW');
        expect(f.reason).toBe('stale_last_period');
        expect(f.predictedNextPeriodStart).not.toBeNull();
    });
});

describe('computeCycleForecast() — overdue (not stale) predicts a FUTURE next period', () => {
    it('next start / ovulation / fertile window are all strictly in the future', () => {
        // HIGH #2: last 2026-06-01, L=28 -> first projection 2026-06-29.
        // today 2026-07-05 (34 days since last; < 1.5*28=42 so NOT stale) is PAST
        // that first projection, so the predicted next start must roll forward to
        // 2026-07-27 instead of staying on the already-elapsed 2026-06-29.
        const overdueToday = utc(2026, 6, 5); // 2026-07-05
        const f = computeCycleForecast(
            REGULAR,
            utc(2026, 6, 1), // window 2026-07-01
            utc(2026, 6, 31), // .. 2026-07-31
            overdueToday,
        );
        expect(f.confidence).toBe('HIGH'); // overdue-but-fresh stays well-evidenced
        expect(f.reason).toBe('ok');
        expect(f.predictedNextPeriodStart).toBe('2026-07-27');
        // ovulation = nextStart - 14 = 2026-07-13, all in the future
        expect(f.predictedOvulationDate).toBe('2026-07-13');
        expect(f.fertileWindow).toEqual({ start: '2026-07-12', end: '2026-07-14' });

        const toMs = (iso: string) => Date.parse(iso + 'T00:00:00Z');
        const todayMs = Date.UTC(2026, 6, 5);
        expect(toMs(f.predictedNextPeriodStart!)).toBeGreaterThan(todayMs);
        expect(toMs(f.predictedOvulationDate!)).toBeGreaterThan(todayMs);
        expect(toMs(f.fertileWindow!.start)).toBeGreaterThan(todayMs);
    });
});

describe('computeCycleForecast() — logged-vs-predicted flag', () => {
    it('marks days overlapping an ACTUAL logged period as isLogged', () => {
        const f = computeCycleForecast(
            { ...REGULAR, loggedPeriodDates: ['2026-06-01', '2026-06-02', '2026-06-03'] },
            winStart,
            winEnd,
            today,
        );
        expect(f.days.find((d) => d.date === '2026-06-01')!.isLogged).toBe(true);
        expect(f.days.find((d) => d.date === '2026-06-02')!.isLogged).toBe(true);
        expect(f.days.find((d) => d.date === '2026-06-10')!.isLogged).toBe(false);
    });
});
