/**
 * Coach reminders — daily LOCAL notifications (workout + the 3 meals) while a plan
 * is active, mirroring useCircadianReminders. The notifications carry a vibration
 * pattern (Android channel; iOS vibrates by default), so "remind + vibrate" is the
 * scheduled path. Foreground haptics + the torch blink (best-effort, see
 * TorchBlinker) layer on when the app is open.
 *
 * NOTE: local scheduled notifications + the torch require a DEVELOPMENT BUILD on a
 * physical device — not Expo Go (SDK 53+). Everything no-ops gracefully otherwise.
 */
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Haptics from 'expo-haptics';
import type { CoachPlan } from './types';

const IS_EXPO_GO = Constants.appOwnership === 'expo';
const TAG = 'nfCoachReminderId';

interface DailyReminder {
    id: string;
    hour: number;
    minute: number;
    title: string;
    body: string;
}

/** Daily workout + meal nudges, referencing the active day. */
export function buildCoachReminders(plan: CoachPlan): DailyReminder[] {
    const active = plan.days.find((d) => d.status === 'active') ?? plan.days[0];
    const focus = active ? `Day ${active.day} · ${active.title}` : 'your plan';
    return [
        { id: 'coach-breakfast', hour: 8, minute: 0, title: 'Breakfast time', body: "Log Ria's breakfast pick to stay on your macros." },
        { id: 'coach-lunch', hour: 13, minute: 0, title: 'Lunch time', body: 'Time for your planned lunch.' },
        { id: 'coach-workout', hour: 18, minute: 0, title: 'Time to train', body: `${focus} — your AI workout is ready.` },
        { id: 'coach-dinner', hour: 19, minute: 30, title: 'Dinner time', body: 'Round out your day with your planned dinner.' },
    ];
}

/** (Re)schedule the coach's daily reminders. Returns how many were scheduled. */
export async function scheduleCoachReminders(plan: CoachPlan | null): Promise<number> {
    if (IS_EXPO_GO || !plan) return 0;
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const Notifications = require('expo-notifications');

        const perm = await Notifications.getPermissionsAsync();
        let status = perm.status;
        if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
        if (status !== 'granted') return 0;

        if (Platform.OS === 'android') {
            await Notifications.setNotificationChannelAsync('coach', {
                name: 'Coach Ria',
                importance: Notifications.AndroidImportance.HIGH,
                vibrationPattern: [0, 300, 200, 300],
            });
        }

        await cancelCoachReminders();

        const reminders = buildCoachReminders(plan);
        for (const r of reminders) {
            await Notifications.scheduleNotificationAsync({
                content: { title: r.title, body: r.body, sound: 'default', data: { [TAG]: r.id, url: '/(challenge)' } },
                trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: r.hour, minute: r.minute, channelId: 'coach' },
            });
        }
        return reminders.length;
    } catch {
        return 0;
    }
}

/** Cancel only the coach's reminders (tagged), leaving other schedules intact. */
export async function cancelCoachReminders(): Promise<void> {
    if (IS_EXPO_GO) return;
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const Notifications = require('expo-notifications');
        const scheduled = await Notifications.getAllScheduledNotificationsAsync();
        await Promise.all(
            scheduled
                .filter((n: any) => typeof n?.content?.data?.[TAG] === 'string')
                .map((n: any) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
        );
    } catch { /* best-effort */ }
}

// ── Birth-control PILL reminder (Period P2) ─────────────────────────────────────
// A single DAILY local notification at the user's chosen 'HH:MM'. Reuses the EXACT
// expo-notifications path as the coach reminders (perm gate → Android channel →
// cancel-then-schedule with a DAILY trigger), but tagged separately so it can be
// (re)scheduled / cancelled WITHOUT touching the coach's schedule. The cycle UI
// calls scheduleDailyPillReminder on enable/time-change and cancelDailyPillReminder
// on disable.
const PILL_TAG = 'nfPillReminderId';
const PILL_ID = 'pill-daily';

/**
 * (Re)schedule the daily pill reminder at { hour, minute }. Cancels any existing
 * pill reminder first (so a time change replaces rather than stacks). Returns true
 * when a notification was scheduled, false when it no-oped (Expo Go / permission
 * denied / bad time). Mirrors scheduleCoachReminders' permission + channel dance.
 */
export async function scheduleDailyPillReminder(hour: number, minute: number): Promise<boolean> {
    if (IS_EXPO_GO) return false;
    if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
        return false;
    }
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const Notifications = require('expo-notifications');

        const perm = await Notifications.getPermissionsAsync();
        let status = perm.status;
        if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
        if (status !== 'granted') return false;

        if (Platform.OS === 'android') {
            await Notifications.setNotificationChannelAsync('pill', {
                name: 'Pill reminder',
                importance: Notifications.AndroidImportance.HIGH,
                vibrationPattern: [0, 300, 200, 300],
            });
        }

        // Replace, don't stack: clear the previous pill reminder before scheduling.
        await cancelDailyPillReminder();

        await Notifications.scheduleNotificationAsync({
            content: {
                title: 'Pill reminder',
                body: "Time to take today's pill.",
                sound: 'default',
                data: { [PILL_TAG]: PILL_ID, url: '/(performance)/cycle' },
            },
            trigger: {
                type: Notifications.SchedulableTriggerInputTypes.DAILY,
                hour,
                minute,
                channelId: 'pill',
            },
        });
        return true;
    } catch {
        return false;
    }
}

/** Cancel only the pill reminder (tagged), leaving coach + other schedules intact. */
export async function cancelDailyPillReminder(): Promise<void> {
    if (IS_EXPO_GO) return;
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const Notifications = require('expo-notifications');
        const scheduled = await Notifications.getAllScheduledNotificationsAsync();
        await Promise.all(
            scheduled
                .filter((n: any) => typeof n?.content?.data?.[PILL_TAG] === 'string')
                .map((n: any) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
        );
    } catch { /* best-effort */ }
}

/** A buzz for the in-app/foreground nudge (a scheduled notification vibrates on its own). */
export async function nudgeHaptic(): Promise<void> {
    try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch { /* unsupported */ }
}

/** Fire a one-off "test" notification immediately so the user can preview a reminder. */
export async function fireTestReminder(): Promise<boolean> {
    if (IS_EXPO_GO) return false;
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const Notifications = require('expo-notifications');
        const perm = await Notifications.getPermissionsAsync();
        let status = perm.status;
        if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
        if (status !== 'granted') return false;
        await Notifications.scheduleNotificationAsync({
            content: { title: 'Coach Ria', body: 'This is how your reminders will nudge you.', sound: 'default', data: { [TAG]: 'coach-test', url: '/(challenge)' } },
            trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 2 },
        });
        return true;
    } catch {
        return false;
    }
}
