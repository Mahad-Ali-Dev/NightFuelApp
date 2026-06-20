/**
 * useCircadianReminders — the daily "circadian coach" loop.
 *
 * Schedules LOCAL notifications timed to the user's current shift: pre-shift fuel,
 * mid-shift fuel, caffeine cutoff, wind-down, and a log-sleep nudge. Local (vs
 * remote push) is deliberate: times are derived from the shift's ISO timestamps so
 * they land at the correct DEVICE-LOCAL moment, they work offline, and they don't
 * depend on remote-push delivery. Dynamic server-initiated pushes (coach replies,
 * plan-ready) are handled separately by useNotifications + the notification-service.
 *
 * Re-runs on login and whenever the active shift changes; cancels its own previously
 * scheduled reminders first (tagged via data.nfReminderId) so it never double-books.
 *
 * NOTE: requires a development build on a physical device — local scheduled
 * notifications are not delivered in Expo Go (SDK 53+). No-ops gracefully otherwise.
 */
import { useEffect } from 'react';
import Constants from 'expo-constants';
import { getCurrent as getCurrentShift } from '@/api/shifts';
import { getNotificationPreferences } from '@/api/notifications';
import { useAuthStore } from '@/store/authStore';
import { OFFSETS } from '@/lib/shiftTransition';
import { BLUE_BLOCKER_LEAD_HOURS } from '@/lib/lightPlan';
// Import the CONST only — not computeAnchorSleep — so buildShiftReminders stays
// pure and never throws on malformed ISO (mirrors the nf-avoid-light pattern
// below, which inlines the math instead of calling computeLightPlan).
import { ANCHOR_SLEEP_HOURS } from '@/lib/circadian/anchorSleep';

const IS_EXPO_GO = Constants.appOwnership === 'expo';

interface PlannedReminder {
  id: string;
  title: string;
  body: string;
  date: Date;
  /** key on NotificationPreferences; reminder is skipped if the user set it false */
  prefKey: string;
}

/** Derive reminder times from the shift's ISO timestamps (device-local via Date). */
export function buildShiftReminders(shift: { startTime: string; endTime: string }): PlannedReminder[] {
  const start = new Date(shift.startTime);
  const end = new Date(shift.endTime);
  const shift_ = (base: Date, deltaHours: number) => new Date(base.getTime() + deltaHours * 3_600_000);
  const mid = new Date((start.getTime() + end.getTime()) / 2);
  return [
    { id: 'nf-preshift-meal', prefKey: 'mealReminderEnabled', title: 'Pre-shift fuel 🍽️',
      body: 'Eat your pre-shift meal about an hour before clock-in to stay steady through the night.', date: shift_(start, -1) },
    { id: 'nf-bright-light', prefKey: 'sleepReminderEnabled', title: 'Seek bright light ☀️',
      body: 'Anchor your alertness — get bright light at the start of your shift.', date: shift_(start, OFFSETS.brightLightStartAfterStart) },
    { id: 'nf-midshift-fuel', prefKey: 'mealReminderEnabled', title: 'Mid-shift fuel ⚡',
      body: 'Time a light, protein-forward meal to hold your energy.', date: mid },
    { id: 'nf-caffeine-cutoff', prefKey: 'sleepReminderEnabled', title: 'Last call for caffeine ☕',
      body: "Cut caffeine now so it doesn't wreck your post-shift sleep.", date: shift_(end, OFFSETS.caffeineCutoffBeforeEnd) },
    { id: 'nf-winddown', prefKey: 'sleepReminderEnabled', title: 'Wind down 🌙',
      body: 'Dim the lights and start winding down — melatonin is rising.', date: shift_(end, OFFSETS.sleepStartAfterEnd) },
    { id: 'nf-log-sleep', prefKey: 'sleepReminderEnabled', title: 'How did you sleep? 😴',
      body: "Log last night's rest to keep your recovery score accurate.", date: shift_(end, OFFSETS.sleepEndAfterEnd) },
    // Blue-blocker / dim-down nudge, fired at computeLightPlan(shift).avoidLight.start
    // so the LightPlanCard's "Avoid light / blue-blockers" window and this scheduled
    // reminder tell ONE story. We compute the instant directly here rather than calling
    // computeLightPlan to keep buildShiftReminders pure (no throw on malformed ISO):
    // avoidLight.start === sleepWindow.start − BLUE_BLOCKER_LEAD_HOURS
    //                   === end + (OFFSETS.sleepStartAfterEnd − BLUE_BLOCKER_LEAD_HOURS)h,
    // which is bit-identical to computeLightPlan(shift).avoidLight.start by construction.
    // Reuses the existing sleepReminderEnabled pref — no new preference key.
    { id: 'nf-avoid-light', prefKey: 'sleepReminderEnabled', title: 'Dim the lights 🕶️',
      body: 'Switch to blue-blockers / dim light now so melatonin can rise before your recovery sleep.',
      date: shift_(end, OFFSETS.sleepStartAfterEnd - BLUE_BLOCKER_LEAD_HOURS) },
    // Anchor-sleep nudge, fired at the OPENING of the fixed core-sleep block so the
    // AnchorSleepCard's anchor window and this scheduled reminder tell ONE story.
    // We compute the instant directly here rather than calling computeAnchorSleep
    // to keep buildShiftReminders pure (no throw on malformed ISO):
    // computeAnchorSleep(shift).anchor.start === sleepWindow.start
    //                                         === end + OFFSETS.sleepStartAfterEnd h,
    // which is bit-identical to this date by construction. (The fixed block runs
    // for ANCHOR_SLEEP_HOURS from this instant — we nudge at its start; the length
    // const is imported above purely to document that relationship.) NOTE this
    // shares the exact instant of nf-winddown (also end + sleepStartAfterEnd h):
    // wind-down and the anchor open together at the recovery-sleep opportunity, and
    // that tie is intentional. Reuses the existing sleepReminderEnabled pref — no
    // new preference key.
    { id: 'nf-anchor-sleep', prefKey: 'sleepReminderEnabled', title: 'Anchor your sleep 🛏️',
      body: `Start your anchor-sleep block now and hold this ${ANCHOR_SLEEP_HOURS}h core-sleep window consistent across your rotation to keep your body clock steady.`,
      date: shift_(end, OFFSETS.sleepStartAfterEnd) },
  ];
}

export function useCircadianReminders() {
  const { user } = useAuthStore();

  useEffect(() => {
    if (IS_EXPO_GO || !user) return;
    let cancelled = false;

    (async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const Notifications = require('expo-notifications');

        const perm = await Notifications.getPermissionsAsync();
        if (perm.status !== 'granted') return; // useNotifications() owns the permission prompt

        const [shift, prefs] = await Promise.all([
          getCurrentShift().catch(() => null),
          getNotificationPreferences().catch(() => null),
        ]);
        if (cancelled || !shift || !(shift as any).startTime || !(shift as any).endTime) return;

        // Clear our previously-scheduled reminders so re-runs don't stack up.
        const scheduled = await Notifications.getAllScheduledNotificationsAsync();
        await Promise.all(
          scheduled
            .filter((n: any) => typeof n?.content?.data?.nfReminderId === 'string')
            .map((n: any) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
        );

        const now = Date.now();
        const due = buildShiftReminders(shift as any).filter(
          (r) => r.date.getTime() > now + 60_000 && (!prefs || (prefs as any)[r.prefKey] !== false),
        );

        for (const r of due) {
          await Notifications.scheduleNotificationAsync({
            content: { title: r.title, body: r.body, sound: 'default', data: { nfReminderId: r.id, url: '/(tabs)/circadian' } },
            trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: r.date },
          });
        }
        if (__DEV__) console.warn(`[CircadianReminders] scheduled ${due.length} reminder(s) for the current shift`);
      } catch {
        // Non-fatal — reminders are a best-effort enhancement.
      }
    })();

    return () => { cancelled = true; };
  }, [user?.id]);
}
