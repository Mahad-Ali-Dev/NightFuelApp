/**
 * Mifflin-St Jeor Equation for Basal Metabolic Rate (BMR)
 * 
 * Men: BMR = (10 × weight in kg) + (6.25 × height in cm) - (5 × age in years) + 5
 * Women: BMR = (10 × weight in kg) + (6.25 × height in cm) - (5 × age in years) - 161
 */
export function calculateBMR(
    weightKg: number,
    heightCm: number,
    age: number,
    biologicalSex: 'MALE' | 'FEMALE' | string
): number {
    const base = (10 * weightKg) + (6.25 * heightCm) - (5 * age);

    if (biologicalSex.toUpperCase() === 'MALE') {
        return base + 5;
    }

    // Default to female/other profile for safety if not explicitly male
    return base - 161;
}

/**
 * Body Mass Index (BMI)
 */
export function calculateBMI(weightKg: number, heightCm: number): number {
    if (heightCm <= 0) return 0;
    const heightM = heightCm / 100;
    return weightKg / (heightM * heightM);
}

/**
 * Total Daily Energy Expenditure (TDEE)
 */
export enum ActivityLevel {
    SEDENTARY = 'SEDENTARY',
    LIGHTLY_ACTIVE = 'LIGHTLY_ACTIVE',
    MODERATELY_ACTIVE = 'MODERATELY_ACTIVE',
    VERY_ACTIVE = 'VERY_ACTIVE',
    EXTRA_ACTIVE = 'EXTRA_ACTIVE'
}

const ActivityMultipliers: Record<string, number> = {
    SEDENTARY: 1.2,
    LIGHTLY_ACTIVE: 1.375,
    MODERATELY_ACTIVE: 1.55,
    VERY_ACTIVE: 1.725,
    EXTRA_ACTIVE: 1.9
};

export function calculateTDEE(bmr: number, activityLevel: string): number {
    const multiplier = ActivityMultipliers[activityLevel.toUpperCase()] || 1.2;
    return bmr * multiplier;
}

/**
 * Helper to calculate age from Date of Birth
 */
export function calculateAge(dob: Date): number {
    const diffMs = Date.now() - dob.getTime();
    const ageDate = new Date(diffMs);
    return Math.abs(ageDate.getUTCFullYear() - 1970);
}
