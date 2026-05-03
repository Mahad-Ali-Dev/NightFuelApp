import { z } from 'zod';

export const UserStateSchema = z.object({
    userId: z.string(),
    currentWeightKg: z.number(),
    targetWeightKg: z.number().optional(),
    last7DaysAdherence: z.number(), // 0 to 1
    avgSleepQuality: z.number(), // 1 to 10
    fatigueLevel: z.number(), // 1 to 10
    currentCalorieTarget: z.number(),
    currentProteinTargetG: z.number(),
    trainingPhase: z.string().default('HYPERTROPHY'), // HYPERTROPHY, STRENGTH, DELOAD
    cycleWeek: z.number().int().default(1),
});

export const DecisionInputSchema = z.object({
    userState: UserStateSchema,
    goal: z.enum(['FAT_LOSS', 'MUSCLE_GAIN', 'MAINTENANCE', 'STRENGTH', 'ENDURANCE']),
    planHistory: z.array(z.object({
        date: z.string(),
        adherence: z.boolean(),
        weightKg: z.number().optional(),
    })).optional(),
});

export type DecisionInput = z.infer<typeof DecisionInputSchema>;

export interface DecisionOutput {
    calories: number;
    protein_g: number;
    volume_modifier: number;
    training_split: string;
    deload: boolean;
}

export class DecisionEngine {
    computeParams(input: DecisionInput): DecisionOutput {
        const { userState, goal } = input;
        let {
            currentCalorieTarget,
            currentProteinTargetG,
            last7DaysAdherence,
            fatigueLevel,
            avgSleepQuality,
            trainingPhase,
            cycleWeek
        } = userState;

        let calories = currentCalorieTarget;
        let protein_g = currentProteinTargetG;
        let volume_modifier = 1.0;
        let deload = false;

        // 1. Periodization Logic (Volume Ramp-up)
        if (trainingPhase === 'HYPERTROPHY') {
            if (cycleWeek === 1) volume_modifier = 1.0;
            else if (cycleWeek === 2) volume_modifier = 1.05;
            else if (cycleWeek === 3) volume_modifier = 1.1;
            else if (cycleWeek >= 4) {
                volume_modifier = 0.6;
                deload = true;
            }
        } else if (trainingPhase === 'STRENGTH') {
            if (cycleWeek === 1) volume_modifier = 1.0;
            else if (cycleWeek === 2) volume_modifier = 1.1;
            else if (cycleWeek === 3) volume_modifier = 1.2;
            else if (cycleWeek >= 4) {
                volume_modifier = 0.5;
                deload = true;
            }
        } else if (trainingPhase === 'DELOAD') {
            volume_modifier = 0.5;
            deload = true;
        }

        // 2. Adherence logic: If adherence is low (< 0.7), simplify or reduce intensity
        if (last7DaysAdherence < 0.7) {
            volume_modifier *= 0.8; // Reduce volume to improve adherence
        }

        // 3. Fatigue logic: If fatigue is high or sleep is poor, reduce volume or trigger deload
        // "Smart Rest Day": If fatigueLevel > 9 and adherence is high, explicitly recommend a rest day.
        if (fatigueLevel > 8 || avgSleepQuality < 5) {
            volume_modifier *= 0.7;
            if (fatigueLevel >= 9) {
                deload = true;
                // We'll signal a rest day by setting volume_modifier to 0
                if (last7DaysAdherence > 0.8) {
                    volume_modifier = 0.0;
                }
            }
        }

        // 4. Goal-based adjustments (simple deterministic rules)
        if (goal === 'FAT_LOSS') {
            // Logic for fat loss goals
        } else if (goal === 'MUSCLE_GAIN') {
            protein_g = Math.max(protein_g, userState.currentWeightKg * 2.2); // Ensure high protein
        }

        return {
            calories: Math.round(calories),
            protein_g: Math.round(protein_g),
            volume_modifier: parseFloat(volume_modifier.toFixed(2)),
            training_split: 'PUSH_PULL_LEGS', // Default or from preferences
            deload,
        };
    }
}
