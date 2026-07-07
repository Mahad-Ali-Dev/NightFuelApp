/**
 * useCoachReminders — keeps the coach's daily reminders in sync with the plan.
 *
 * Re-schedules whenever the plan (or its active day) changes, and adds a
 * foreground listener so a coach reminder arriving while the app is open gives a
 * haptic buzz. No-ops in Expo Go / without permission (see reminders.ts).
 */
import { useEffect } from 'react';
import Constants from 'expo-constants';
import { useCoachStore } from './coachStore';
import { scheduleCoachReminders, nudgeHaptic } from './reminders';

const IS_EXPO_GO = Constants.appOwnership === 'expo';

export function useCoachReminders() {
    const plan = useCoachStore((s) => s.plan);
    const activeDay = plan?.days.find((d) => d.status === 'active')?.day ?? null;

    useEffect(() => {
        // (Re)schedule on plan / active-day change (not on every exercise toggle).
        scheduleCoachReminders(plan ?? null);

        if (IS_EXPO_GO || !plan) return;
        let sub: { remove?: () => void } | undefined;
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const Notifications = require('expo-notifications');
            sub = Notifications.addNotificationReceivedListener((n: any) => {
                if (n?.request?.content?.data?.nfCoachReminderId) nudgeHaptic();
            });
        } catch { /* notifications unavailable */ }
        return () => sub?.remove?.();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [plan?.id, activeDay]);
}
