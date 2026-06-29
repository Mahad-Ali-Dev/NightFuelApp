/**
 * useCoachSync — syncs the coach plan with the server (exercise-service blob).
 *
 * On mount (authed only): if there's no local plan, pull the server copy so a
 * reinstall / new device restores it. Then debounce-backs-up the plan to the
 * server whenever it changes (generate / complete / toggle / add). Gated on auth
 * so it never 401s on the login screen (which would trip the session-expired
 * redirect — the same class of bug as the badge poll).
 */
import { useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useCoachStore } from './coachStore';
import { getCoachPlan, saveCoachPlan } from '@/api/coach';

export function useCoachSync() {
    const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

    useEffect(() => {
        if (!isAuthenticated) return;
        let cancelled = false;

        // 1. Restore from the server if we have nothing locally.
        if (!useCoachStore.getState().plan) {
            getCoachPlan()
                .then((server) => {
                    if (!cancelled && server && !useCoachStore.getState().plan) {
                        useCoachStore.setState({ plan: server, status: 'ready' });
                    }
                })
                .catch(() => { /* offline / never built — local stays authoritative */ });
        }

        // 2. Debounced backup whenever the plan object changes (immutable updates
        // give a new reference per mutation; status-only changes are ignored).
        let timer: ReturnType<typeof setTimeout> | undefined;
        let lastPlan = useCoachStore.getState().plan;
        const unsub = useCoachStore.subscribe((state) => {
            if (state.plan === lastPlan) return;
            lastPlan = state.plan;
            if (!state.plan) return;
            const plan = state.plan;
            clearTimeout(timer);
            timer = setTimeout(() => { saveCoachPlan(plan).catch(() => {}); }, 1200);
        });

        return () => { cancelled = true; clearTimeout(timer); unsub(); };
    }, [isAuthenticated]);
}
