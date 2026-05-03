import { DecisionEngine, DecisionInput } from '../services/decision-engine/src/engine';

async function runVerification() {
    const engine = new DecisionEngine();
    console.log("=== STRENGTH CYCLE VERIFICATION ===\n");

    const testCases = [
        // HYPERTROPHY CYCLE
        { phase: 'HYPERTROPHY', week: 1, expectedVolume: 1.0, expectedDeload: false },
        { phase: 'HYPERTROPHY', week: 2, expectedVolume: 1.05, expectedDeload: false },
        { phase: 'HYPERTROPHY', week: 3, expectedVolume: 1.1, expectedDeload: false },
        { phase: 'HYPERTROPHY', week: 4, expectedVolume: 0.6, expectedDeload: true },

        // STRENGTH CYCLE
        { phase: 'STRENGTH', week: 1, expectedVolume: 1.0, expectedDeload: false },
        { phase: 'STRENGTH', week: 2, expectedVolume: 1.1, expectedDeload: false },
        { phase: 'STRENGTH', week: 3, expectedVolume: 1.2, expectedDeload: false },
        { phase: 'STRENGTH', week: 4, expectedVolume: 0.5, expectedDeload: true },

        // FATIGUE OVERRIDE
        { phase: 'STRENGTH', week: 3, fatigue: 9, adherence: 0.9, expectedVolume: 0.0, expectedDeload: true },
        { phase: 'HYPERTROPHY', week: 2, adherence: 0.5, expectedVolume: 0.84, expectedDeload: false }, // 1.05 * 0.8 = 0.84
    ];

    const results = [];

    for (const tc of testCases) {
        const input: DecisionInput = {
            userState: {
                userId: 'test-user',
                currentWeightKg: 80,
                last7DaysAdherence: tc.adherence ?? 1.0,
                avgSleepQuality: tc.fatigue && tc.fatigue > 8 ? 4 : 8,
                fatigueLevel: tc.fatigue ?? 3,
                currentCalorieTarget: 2500,
                currentProteinTargetG: 180,
                trainingPhase: tc.phase,
                cycleWeek: tc.week
            },
            goal: 'MAINTENANCE'
        };

        const result = engine.computeParams(input);
        const volumeMatch = result.volume_modifier === tc.expectedVolume;
        const deloadMatch = result.deload === tc.expectedDeload;

        results.push({
            testCase: tc,
            actual: { volume: result.volume_modifier, deload: result.deload },
            passed: volumeMatch && deloadMatch
        });
    }

    require('fs').writeFileSync('verification_results.json', JSON.stringify(results, null, 2));
    const passedAll = results.every(r => r.passed);
    console.log(`Verification Complete: ${results.filter(r => r.passed).length}/${results.length} tests passed.`);
    process.exit(passedAll ? 0 : 1);
}

runVerification().catch(err => {
    console.error(err);
    process.exit(1);
});
