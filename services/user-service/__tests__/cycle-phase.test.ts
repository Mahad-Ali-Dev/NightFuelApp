/**
 * computeCyclePhase() correctness + degradation suite.
 *
 * Locks the PURE menstrual-cycle phase derivation (src/utils/cyclePhase.ts) that
 * feeds UserStatus.cyclePhase and, downstream, the decision-engine / ai-pipeline
 * SMALL phase-synced modifiers. The function is TRACK-FIRST, SUGGESTION-SECOND:
 * it must return 'UNKNOWN' (no phase-syncing) for EVERY degradation gate, and only
 * emit a real phase when ALL gates pass.
 *
 * Strategy: pass an explicit `today` (the function is pure and takes today as an
 * argument — no fake timers needed) and assert exact phases. All dates are UTC
 * date-only to mirror production (the F23 calculateAge UTC basis).
 *
 * No DB / Redis / Fastify is touched — pure unit suite.
 */
import { computeCyclePhase, CyclePhaseInput } from '../src/utils/cyclePhase';

const utc = (y: number, mZeroBased: number, d: number): Date =>
    new Date(Date.UTC(y, mZeroBased, d, 0, 0, 0, 0));

// A fully-gated, tracking-eligible FEMALE user. Each phase test starts from this
// and only varies lastPeriodStartDate / today. L=28 -> ovulationDay=14,
// window=[13,15], period=5.
const BASE: CyclePhaseInput = {
    cycleTrackingEnabled: true,
    biologicalSex: 'FEMALE',
    hormonalContraception: false,
    cycleRegularity: 'REGULAR',
    avgCycleLengthDays: 28,
    avgPeriodLengthDays: 5,
    lastPeriodStartDate: utc(2026, 5, 1), // 2026-06-01
};

describe('computeCyclePhase() — phase boundaries (L=28, period=5, window=[13,15])', () => {
    it('day 1 (period start) -> MENSTRUAL', () => {
        expect(computeCyclePhase(BASE, utc(2026, 5, 1))).toBe('MENSTRUAL');
    });

    it('day 5 (last menstrual day) -> MENSTRUAL', () => {
        expect(computeCyclePhase(BASE, utc(2026, 5, 5))).toBe('MENSTRUAL');
    });

    it('day 6 (first post-period day) -> FOLLICULAR', () => {
        expect(computeCyclePhase(BASE, utc(2026, 5, 6))).toBe('FOLLICULAR');
    });

    it('day 12 (just before ovulatory window) -> FOLLICULAR', () => {
        expect(computeCyclePhase(BASE, utc(2026, 5, 12))).toBe('FOLLICULAR');
    });

    it('day 13 (window.start) -> OVULATORY', () => {
        expect(computeCyclePhase(BASE, utc(2026, 5, 13))).toBe('OVULATORY');
    });

    it('day 14 (ovulationDay) -> OVULATORY', () => {
        expect(computeCyclePhase(BASE, utc(2026, 5, 14))).toBe('OVULATORY');
    });

    it('day 15 (window.end) -> OVULATORY', () => {
        expect(computeCyclePhase(BASE, utc(2026, 5, 15))).toBe('OVULATORY');
    });

    it('day 16 (first post-ovulatory day) -> LUTEAL', () => {
        expect(computeCyclePhase(BASE, utc(2026, 5, 16))).toBe('LUTEAL');
    });

    it('day 28 (last luteal day) -> LUTEAL', () => {
        expect(computeCyclePhase(BASE, utc(2026, 5, 28))).toBe('LUTEAL');
    });

    it('wraps: day 29 (== day 1 of next cycle, within stale window) -> MENSTRUAL', () => {
        // daysSince=28 -> (28 % 28)+1 = 1; 28 <= 1.5*28=42 so NOT stale.
        expect(computeCyclePhase(BASE, utc(2026, 5, 29))).toBe('MENSTRUAL');
    });
});

describe('computeCyclePhase() — every degradation gate returns UNKNOWN', () => {
    it('not tracking (cycleTrackingEnabled=false) -> UNKNOWN', () => {
        expect(computeCyclePhase({ ...BASE, cycleTrackingEnabled: false }, utc(2026, 5, 14))).toBe('UNKNOWN');
    });

    it('tracking undefined -> UNKNOWN', () => {
        expect(computeCyclePhase({ ...BASE, cycleTrackingEnabled: undefined }, utc(2026, 5, 14))).toBe('UNKNOWN');
    });

    it('male user -> UNKNOWN', () => {
        expect(computeCyclePhase({ ...BASE, biologicalSex: 'MALE' }, utc(2026, 5, 14))).toBe('UNKNOWN');
    });

    it('non-female (OTHER / PREFER_NOT_TO_SAY / null) -> UNKNOWN', () => {
        expect(computeCyclePhase({ ...BASE, biologicalSex: 'OTHER' }, utc(2026, 5, 14))).toBe('UNKNOWN');
        expect(computeCyclePhase({ ...BASE, biologicalSex: 'PREFER_NOT_TO_SAY' }, utc(2026, 5, 14))).toBe('UNKNOWN');
        expect(computeCyclePhase({ ...BASE, biologicalSex: null }, utc(2026, 5, 14))).toBe('UNKNOWN');
    });

    it('hormonal contraception -> UNKNOWN', () => {
        expect(computeCyclePhase({ ...BASE, hormonalContraception: true }, utc(2026, 5, 14))).toBe('UNKNOWN');
    });

    it('irregular cycle -> UNKNOWN (PCOS-like / tracking-only)', () => {
        expect(computeCyclePhase({ ...BASE, cycleRegularity: 'IRREGULAR' }, utc(2026, 5, 14))).toBe('UNKNOWN');
    });

    it('cycle length below 21 -> UNKNOWN', () => {
        expect(computeCyclePhase({ ...BASE, avgCycleLengthDays: 20 }, utc(2026, 5, 14))).toBe('UNKNOWN');
    });

    it('cycle length above 40 -> UNKNOWN', () => {
        expect(computeCyclePhase({ ...BASE, avgCycleLengthDays: 41 }, utc(2026, 5, 14))).toBe('UNKNOWN');
    });

    it('cycle length null -> UNKNOWN', () => {
        expect(computeCyclePhase({ ...BASE, avgCycleLengthDays: null }, utc(2026, 5, 14))).toBe('UNKNOWN');
    });

    it('missing lastPeriodStartDate -> UNKNOWN', () => {
        expect(computeCyclePhase({ ...BASE, lastPeriodStartDate: null }, utc(2026, 5, 14))).toBe('UNKNOWN');
        expect(computeCyclePhase({ ...BASE, lastPeriodStartDate: undefined }, utc(2026, 5, 14))).toBe('UNKNOWN');
    });

    it('unparseable lastPeriodStartDate string -> UNKNOWN', () => {
        expect(computeCyclePhase({ ...BASE, lastPeriodStartDate: 'not-a-date' }, utc(2026, 5, 14))).toBe('UNKNOWN');
    });

    it('STALE: today > 1.5*L past last period (likely missed) -> UNKNOWN', () => {
        // L=28 -> stale once daysSince > 42. 2026-06-01 + 43 days = 2026-07-14.
        expect(computeCyclePhase(BASE, utc(2026, 6, 14))).toBe('UNKNOWN');
    });

    it('NOT stale at exactly 1.5*L (boundary inclusive) -> a real phase', () => {
        // daysSince=42 (== 1.5*28) is NOT stale; (42 % 28)+1 = 15 -> OVULATORY.
        expect(computeCyclePhase(BASE, utc(2026, 6, 13))).toBe('OVULATORY');
    });

    it('future lastPeriodStartDate -> UNKNOWN', () => {
        expect(computeCyclePhase({ ...BASE, lastPeriodStartDate: utc(2026, 5, 10) }, utc(2026, 5, 1))).toBe('UNKNOWN');
    });
});

describe('computeCyclePhase() — robustness of secondary inputs', () => {
    it('accepts a YYYY-MM-DD string lastPeriodStartDate (UTC midnight) like dateOfBirth', () => {
        expect(computeCyclePhase({ ...BASE, lastPeriodStartDate: '2026-06-01' }, utc(2026, 5, 3))).toBe('MENSTRUAL');
    });

    it('missing avgPeriodLengthDays falls back to 5 (default) — day 5 still MENSTRUAL', () => {
        expect(computeCyclePhase({ ...BASE, avgPeriodLengthDays: null }, utc(2026, 5, 5))).toBe('MENSTRUAL');
        expect(computeCyclePhase({ ...BASE, avgPeriodLengthDays: null }, utc(2026, 5, 6))).toBe('FOLLICULAR');
    });

    it('shorter cycle (L=21 -> ovulationDay=7, window=[6,8]) places phases correctly', () => {
        const short: CyclePhaseInput = { ...BASE, avgCycleLengthDays: 21 };
        expect(computeCyclePhase(short, utc(2026, 5, 5))).toBe('MENSTRUAL');   // day 5
        expect(computeCyclePhase(short, utc(2026, 5, 6))).toBe('OVULATORY');   // day 6 == window.start
        expect(computeCyclePhase(short, utc(2026, 5, 9))).toBe('LUTEAL');      // day 9 > window.end
    });

    it('biologicalSex is case-insensitive (female -> eligible)', () => {
        expect(computeCyclePhase({ ...BASE, biologicalSex: 'female' }, utc(2026, 5, 3))).toBe('MENSTRUAL');
    });
});
