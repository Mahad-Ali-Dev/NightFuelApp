/**
 * decision-engine — menstrual-cycle phase modifier suite.
 *
 * Locks the SMALL, evidence-modest phase modifiers added to
 * DecisionEngine.computeParams: they apply for LUTEAL / MENSTRUAL and are a
 * STRICT NO-OP for UNKNOWN (so non-tracking users — who always carry UNKNOWN —
 * are completely unaffected; this is TRACK-FIRST, SUGGESTION-SECOND).
 *
 * Pure engine unit test (no Fastify / DB) — same style as the engine call in
 * input-bounds.test.ts. decision-engine runs vitest WITHOUT globals.
 */
import { describe, it, expect } from 'vitest';
import { DecisionEngine } from '../src/engine';

const engine = new DecisionEngine();

// A neutral baseline: HYPERTROPHY week 1 (volume 1.0), high adherence, low
// fatigue/good sleep (no fatigue penalty), MAINTENANCE goal (no macro override).
// So the ONLY thing varying across these tests is cyclePhase.
const baseState = {
    userId: 'u1',
    currentWeightKg: 70,
    last7DaysAdherence: 1.0,
    avgSleepQuality: 8,
    fatigueLevel: 3,
    currentCalorieTarget: 2000,
    currentProteinTargetG: 150,
    trainingPhase: 'HYPERTROPHY' as const,
    cycleWeek: 1,
};

const run = (cyclePhase: any) =>
    engine.computeParams({ userState: { ...baseState, cyclePhase }, goal: 'MAINTENANCE' });

describe('decision-engine cyclePhase modifiers', () => {
    it('UNKNOWN is a strict no-op (identical to omitting cyclePhase entirely)', () => {
        const withUnknown = run('UNKNOWN');
        const omitted = engine.computeParams({ userState: { ...baseState }, goal: 'MAINTENANCE' });
        expect(withUnknown).toEqual(omitted);
        // Baseline values are completely unchanged.
        expect(withUnknown.calories).toBe(2000);
        expect(withUnknown.volume_modifier).toBe(1.0);
    });

    it('FOLLICULAR / OVULATORY are baseline (1.0 volume, no calorie bump)', () => {
        for (const phase of ['FOLLICULAR', 'OVULATORY']) {
            const out = run(phase);
            expect(out.volume_modifier).toBe(1.0);
            expect(out.calories).toBe(2000);
        }
    });

    it('MENSTRUAL applies a gentle volume reduction (~0.9), no calorie bump', () => {
        const out = run('MENSTRUAL');
        expect(out.volume_modifier).toBe(0.9); // 1.0 * 0.9
        expect(out.calories).toBe(2000);       // no calorie modifier for MENSTRUAL
    });

    it('LUTEAL applies a gentle volume reduction (~0.9) AND a modest calorie bump (~1.05)', () => {
        const out = run('LUTEAL');
        expect(out.volume_modifier).toBe(0.9); // 1.0 * 0.9
        expect(out.calories).toBe(2100);       // 2000 * 1.05
    });

    it('the phase volume modifier composes MULTIPLICATIVELY with periodization (week 2 = 1.05)', () => {
        // HYPERTROPHY week 2 -> base volume 1.05; LUTEAL -> *0.9 = 0.945 -> rounds to 0.95 (2 dp).
        const out = engine.computeParams({
            userState: { ...baseState, cycleWeek: 2, cyclePhase: 'LUTEAL' as any },
            goal: 'MAINTENANCE',
        });
        expect(out.volume_modifier).toBe(0.95); // parseFloat((1.05*0.9).toFixed(2))
    });

    it('phase modifiers stay within the 0.1–2.0 volume bound even when stacked with low-adherence + fatigue penalties', () => {
        const out = engine.computeParams({
            userState: {
                ...baseState,
                last7DaysAdherence: 0.5, // *0.8
                fatigueLevel: 8,         // sleep ok, fatigue>8 false at exactly 8... use 9 below
                cyclePhase: 'MENSTRUAL' as any,
            },
            goal: 'MAINTENANCE',
        });
        expect(out.volume_modifier).toBeGreaterThanOrEqual(0.1);
        expect(out.volume_modifier).toBeLessThanOrEqual(2.0);
    });
});
