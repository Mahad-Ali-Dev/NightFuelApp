/**
 * Route params typing for all screens.
 * Used with Expo Router's typed routes.
 */

// ── Auth ────────────────────────────────────────────────────────────

export type AuthRoutes = {
    '(auth)/login': undefined;
    '(auth)/register': undefined;
    '(auth)/forgot-password': undefined;
};

// ── Onboarding ──────────────────────────────────────────────────────

export type OnboardingRoutes = {
    '(onboarding)/shift-type': undefined;
    '(onboarding)/sleep-schedule': undefined;
    '(onboarding)/metrics-goals': undefined;
    '(onboarding)/dietary-needs': undefined;
    '(onboarding)/environment': undefined;
    '(onboarding)/ai-optimization': undefined;
    '(onboarding)/profile-summary': undefined;
    '(onboarding)/permissions': undefined;
};

// ── Tabs ────────────────────────────────────────────────────────────

export type TabRoutes = {
    '(tabs)/index': undefined;
    '(tabs)/schedule': undefined;
    '(tabs)/nutrition': undefined;
    '(tabs)/training': undefined;
    '(tabs)/profile': undefined;
    '(tabs)/analytics': undefined;
    '(tabs)/circadian': undefined;
    '(tabs)/community': undefined;
};

// ── Modals ──────────────────────────────────────────────────────────

export type ModalRoutes = {
    '(modals)/ai-coach': undefined;
    '(modals)/active-workout': { routineId?: string };
    '(modals)/build-plate': { planMealIndex?: number };
    '(modals)/premium': undefined;
};

// ── Coach ───────────────────────────────────────────────────────────

export type CoachRoutes = {
    '(coach)/hub': undefined;
    '(coach)/clients': undefined;
    '(coach)/client/[id]': { id: string };
    '(coach)/roster': undefined;
    '(coach)/chat/[id]': { id: string };
};

// ── Root ────────────────────────────────────────────────────────────

export type RootRouteParams = AuthRoutes &
    OnboardingRoutes &
    TabRoutes &
    ModalRoutes &
    CoachRoutes & {
        index: undefined;
    };
