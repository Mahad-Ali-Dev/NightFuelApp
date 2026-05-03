/**
 * Circadian time helpers.
 * Utilities for calculating shift phases, melatonin windows,
 * cortisol peaks, and time-relative formatting.
 */

export type ShiftPhase = 'pre-shift' | 'early-shift' | 'mid-shift' | 'late-shift' | 'post-shift' | 'sleep-window';

/**
 * Determine the current shift phase based on start/end times.
 */
export function getShiftPhase(
    shiftStart: Date | string,
    shiftEnd: Date | string,
    now: Date = new Date(),
): ShiftPhase {
    const start = new Date(shiftStart).getTime();
    const end = new Date(shiftEnd).getTime();
    const current = now.getTime();
    const duration = end - start;

    if (current < start) return 'pre-shift';
    if (current > end) return 'post-shift';

    const elapsed = current - start;
    const progress = elapsed / duration;

    if (progress < 0.25) return 'early-shift';
    if (progress < 0.75) return 'mid-shift';
    return 'late-shift';
}

/**
 * Calculate estimated melatonin onset time.
 * Typically 14–16 hours after wake time (dim light melatonin onset).
 */
export function estimateMelatoninOnset(wakeTime: Date | string): Date {
    const wake = new Date(wakeTime);
    return new Date(wake.getTime() + 14 * 60 * 60 * 1000); // +14h
}

/**
 * Calculate cortisol peak time.
 * Cortisol typically peaks ~30 min after waking (Cortisol Awakening Response).
 */
export function estimateCortisolPeak(wakeTime: Date | string): Date {
    const wake = new Date(wakeTime);
    return new Date(wake.getTime() + 30 * 60 * 1000); // +30 min
}

/**
 * Calculate caffeine cutoff time.
 * Caffeine has ~6h half-life; cutoff 8h before target sleep.
 */
export function calculateCaffeineCutoff(targetSleepTime: Date | string): Date {
    const sleep = new Date(targetSleepTime);
    return new Date(sleep.getTime() - 8 * 60 * 60 * 1000); // -8h
}

/**
 * Get optimal meal windows for a shift pattern.
 * Returns array of recommended meal times.
 */
export function getOptimalMealWindows(
    shiftStart: Date | string,
    shiftEnd: Date | string,
    mealCount: number = 3,
): Date[] {
    const start = new Date(shiftStart).getTime();
    const end = new Date(shiftEnd).getTime();
    const duration = end - start;
    const interval = duration / (mealCount + 1);

    return Array.from({ length: mealCount }, (_, i) =>
        new Date(start + interval * (i + 1)),
    );
}

/**
 * Format a remaining time as "Xh Ym".
 */
export function formatTimeRemaining(ms: number): string {
    if (ms <= 0) return '0m';
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const mins = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
}

/**
 * Calculate alertness score (0-100) based on circadian phase.
 * Simplified model: lowest from 3-5 AM, highest noon-2 PM.
 */
export function estimateAlertness(now: Date = new Date()): number {
    const hour = now.getHours() + now.getMinutes() / 60;
    // Sinusoidal model centered on ~14:00 (2 PM) peak
    const radians = ((hour - 14) / 24) * 2 * Math.PI;
    const raw = Math.cos(radians) * 50 + 50;
    return Math.round(Math.max(0, Math.min(100, raw)));
}
