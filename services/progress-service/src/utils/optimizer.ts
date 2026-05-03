import { DailyProgress, BodyMetrics } from '../generated/prisma';

export interface OptimizationResult {
    newCalorieTarget: number;
    adjustmentMade: number;
    reason: string;
}

export class AdaptiveGoalOptimizer {
    /**
     * analyzeProgress - Analyzes the last week of data and suggests an adjustment.
     * 
     * Logic:
     * - Need at least 5 days of tracking in the last 7 days.
     * - Average adherence must be > 80%.
     * - If primaryGoal is FAT_LOSS and weight loss < 0.2kg/week -> Decrease calories by 100.
     * - If primaryGoal is MUSCLE_GAIN and weight gain < 0.1kg/week -> Increase calories by 100.
     */
    static optimize(
        currentPreferences: { primaryGoal: string, targetCalories: number },
        progress: DailyProgress[],
        metrics: BodyMetrics[]
    ): OptimizationResult | null {
        const { primaryGoal, targetCalories } = currentPreferences;

        if (!targetCalories || targetCalories <= 0) return null;

        // 1. Check data density
        if (progress.length < 5) {
            return { newCalorieTarget: targetCalories, adjustmentMade: 0, reason: "Insufficient data (need >5 days of tracking)" };
        }

        // 2. Check adherence
        const avgAdherence = progress.filter(p => p.isAdherent).length / progress.length;
        if (avgAdherence < 0.8) {
            return { newCalorieTarget: targetCalories, adjustmentMade: 0, reason: "Adherence too low (<80%) to make reliable adjustments" };
        }

        // 3. Analyze weight trend
        if (metrics.length < 2) {
            return { newCalorieTarget: targetCalories, adjustmentMade: 0, reason: "Insufficient weight data points" };
        }

        const newestWeight = metrics[0].weightKg;
        const oldestWeight = metrics[metrics.length - 1].weightKg;

        if (!newestWeight || !oldestWeight) return null;

        const weightChange = newestWeight - oldestWeight;

        // 4. Optimization Logic
        if (primaryGoal === 'FAT_LOSS') {
            // Target: Loss of 0.3 - 0.7kg per week
            if (weightChange > -0.2) {
                // Not losing fast enough
                const adjustment = -100;
                return {
                    newCalorieTarget: Math.max(targetCalories + adjustment, 1200), // Safety floor
                    adjustmentMade: adjustment,
                    reason: `Weight loss stall (${weightChange}kg). Cutting calories.`
                };
            }
        } else if (primaryGoal === 'MUSCLE_GAIN') {
            // Target: Gain of 0.1 - 0.3kg per week
            if (weightChange < 0.1) {
                // Not gaining
                const adjustment = 100;
                return {
                    newCalorieTarget: Math.min(targetCalories + adjustment, 4500), // Safety cap
                    adjustmentMade: adjustment,
                    reason: `Weight gain stall (${weightChange}kg). Increasing calories.`
                };
            }
        }

        return { newCalorieTarget: targetCalories, adjustmentMade: 0, reason: "Progress is on track." };
    }
}
