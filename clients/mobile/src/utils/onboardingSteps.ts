// Single source of truth for the onboarding "STEP X OF N" progress.
//
// Previously this was derived in TWO places — the layout header
// (app/(onboarding)/_layout.tsx) and the dietary-needs screen each computed
// the same numbers independently and could silently drift. Both now consume
// this util so the header's progress bar and any in-screen hero numeral always
// agree.
//
// The cycle-basics step is CONDITIONAL — only FEMALE users reach it (routing
// branch in metrics-goals.tsx). When it's part of the flow the visible step
// count is 5, otherwise 4. We infer "this flow includes the cycle step" from
// the collected biologicalSex (and treat being ON the cycle-basics route as a
// forced cycle path, since a user can land there directly).

export type BiologicalSex = 'MALE' | 'FEMALE' | 'OTHER' | 'PREFER_NOT_TO_SAY' | null;

export interface OnboardingStep {
    /** 1-based position of the current route within the visible flow. */
    current: number;
    /** Total number of visible steps (excludes the headerless summary). */
    total: number;
    /** Progress as a 0–1 fraction, clamped. */
    fraction: number;
}

/**
 * Build the ordered list of onboarding routes for the active flow.
 * @param includesCycleStep whether the conditional FEMALE-only cycle step is present.
 */
function getRouteOrder(includesCycleStep: boolean): string[] {
    return includesCycleStep
        ? [
            'metrics-goals',
            'cycle-basics',
            'shift-type',
            'sleep-schedule',
            'dietary-needs',
            'profile-summary',
        ]
        : [
            'metrics-goals',
            'shift-type',
            'sleep-schedule',
            'dietary-needs',
            'profile-summary',
        ];
}

/**
 * Resolve the step indicator for a given route.
 *
 * @param route        the current onboarding route segment (e.g. 'dietary-needs').
 * @param biologicalSex the collected biological sex, used to decide whether the
 *                      conditional cycle step is part of the flow.
 */
export function getOnboardingStep(route: string | undefined, biologicalSex: BiologicalSex): OnboardingStep {
    const includesCycleStep = biologicalSex === 'FEMALE' || route === 'cycle-basics';
    const routeOrder = getRouteOrder(includesCycleStep);

    // profile-summary hides its own header, so the visible step count excludes it.
    const total = routeOrder.length - 1;
    const stepIndex = routeOrder.indexOf(route ?? '');
    const current = stepIndex >= 0 ? Math.min(stepIndex + 1, total) : 1;
    const fraction = Math.min(current / total, 1);

    return { current, total, fraction };
}
