/**
 * useNotifications — registers for Expo push notifications and sends
 * the token to the backend so the server can send targeted pushes.
 *
 * NOTE: expo-notifications remote push is not supported in Expo Go (SDK 53+).
 * We lazy-require the module to avoid its module-level side effects in Expo Go.
 */
import { useEffect } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { apiClient } from '@/api/client';
import { useAuthStore } from '@/store/authStore';
import { resolveDeepLink } from '@/lib/deepLinks';
import { captureException } from '@/lib/sentry';

/** Where we send a tapped notification when its target isn't allowlisted. */
const NOTIFICATION_FALLBACK_ROUTE = '/(tabs)';

/**
 * Resolve a tapped-notification target to a safe in-app route, or `null` to
 * fall back to home.
 *
 * A push payload is attacker-influenced, so `data.deepLink` must NEVER be
 * handed to `router.push()` unchecked — that bypasses the deep-link allowlist
 * (resolveDeepLink / DEEP_LINK_ROUTES) and lets a crafted push deep-link into
 * any route. We:
 *   1. run the raw deepLink through the shared allowlist (covers reset / verify
 *      / coach-invite / subscription / share routes), and
 *   2. additionally accept the one route the notification system itself emits —
 *      `/messages/<conversationId>` — but only when the id is a safe token
 *      (no slashes / traversal / query injection). This path is not in
 *      DEEP_LINK_ROUTES because it is in-app-only and never arrives via an
 *      external URL.
 * Anything else is rejected.
 */
export function resolveNotificationTarget(
    deepLink: string | undefined,
    conversationId: string | undefined,
): string | null {
    // Only conversation ids matching a safe token are trusted (UUIDs in prod).
    const SAFE_ID = /^[A-Za-z0-9_-]+$/;
    const messagesRoute = (id: string) => `/messages/${id}`;

    if (deepLink) {
        // 1. Allowlisted external-style routes.
        const resolved = resolveDeepLink(deepLink);
        if (resolved.safe) return resolved.route;

        // 2. The in-app messages route the notification service emits.
        const m = deepLink.match(/^\/messages\/([^/?#]+)\/?$/);
        const id = m?.[1];
        if (id && SAFE_ID.test(id)) return messagesRoute(id);

        // Rejected: log a soft signal (path only — never the raw payload).
        captureException(new Error('notification_deeplink_rejected'), {
            reason: resolved.reason ?? 'unknown_path',
        });
        return null;
    }

    // No deepLink — fall back to building the messages route from a safe id.
    if (conversationId && SAFE_ID.test(conversationId)) {
        return messagesRoute(conversationId);
    }
    return null;
}

// Expo Go sets appOwnership to 'expo'; development/standalone builds set it to null.
const IS_EXPO_GO = Constants.appOwnership === 'expo';

/**
 * The EAS project id, required by `getExpoPushTokenAsync` in a standalone build
 * (it cannot infer it the way Expo Go can). We resolve it from the embedded
 * config first (`extra.eas.projectId`), then fall back to parsing the UUID out
 * of the updates URL (`https://u.expo.dev/<id>`), and finally to the known
 * literal id so a token fetch never fails for a missing/renamed config key.
 */
const EAS_PROJECT_ID_FALLBACK = '7a5e14b1-cbca-4b66-938b-dac339705833';

function resolveProjectId(): string {
    const fromExtra = Constants.expoConfig?.extra?.eas?.projectId;
    if (typeof fromExtra === 'string' && fromExtra) return fromExtra;

    // Parse the id segment out of the updates URL (u.expo.dev/<id>).
    const updatesUrl =
        Constants.expoConfig?.updates?.url ??
        (Constants as any).manifest2?.extra?.expoClient?.updates?.url;
    if (typeof updatesUrl === 'string') {
        const m = updatesUrl.match(/u\.expo\.dev\/([0-9a-f-]+)/i);
        if (m?.[1]) return m[1];
    }

    return EAS_PROJECT_ID_FALLBACK;
}

if (!IS_EXPO_GO) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Notifications = require('expo-notifications');
    Notifications.setNotificationHandler({
        handleNotification: async () => ({
            shouldShowAlert: true,
            shouldShowBanner: true,
            shouldShowList: true,
            shouldPlaySound: true,
            shouldSetBadge: false,
        }),
    });
}

async function registerForPushNotificationsAsync(): Promise<string | null> {
    // Remote push is unsupported in Expo Go (SDK 53+); a standalone/dev build is
    // required. NOTE: we deliberately do NOT gate on `Constants.isDevice` — that
    // property was removed from expo-constants in SDK 54 (it is now `undefined`),
    // so the old `!Constants.isDevice` check always early-returned and the token
    // never registered. expo-device is not a dependency, so the IS_EXPO_GO guard
    // is the device gate we keep; getExpoPushTokenAsync itself errors on a
    // simulator, which the surrounding try/catch already swallows.
    if (IS_EXPO_GO) {
        if (__DEV__) console.warn('[Notifications] Push notifications require a development build on a physical device.');
        return null;
    }

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Notifications = require('expo-notifications');

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
    }

    if (finalStatus !== 'granted') {
        if (__DEV__) console.warn('[Notifications] Permission denied.');
        return null;
    }

    if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
            name: 'Zeitra',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
        });
    }

    // An explicit projectId is required in a standalone build (Expo Go can infer
    // it, a release build cannot) — without it the fetch throws "No projectId".
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId: resolveProjectId() });
    return tokenData.data;
}

export function useNotifications() {
    const { user } = useAuthStore();
    const router = useRouter();

    useEffect(() => {
        if (IS_EXPO_GO || !user) return;

        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const Notifications = require('expo-notifications');

        registerForPushNotificationsAsync().then(async (token) => {
            if (!token) return;
            try {
                await apiClient.post('/v1/notifications/push/subscribe/expo', { expoPushToken: token });
            } catch (err) {
                console.warn('[Notifications] Failed to register push token:', err);
            }
        });

        const sub = Notifications.addNotificationResponseReceivedListener((response: any) => {
            const data = response.notification.request.content.data as Record<string, unknown>;
            if (__DEV__) console.warn('[Notifications] Tapped notification:', data);

            // Deep-link a tapped notification to its target screen. Chat-message
            // pushes carry { conversationId, deepLink: `/messages/<id>` }; fall
            // back to building the messages route from conversationId. expo-router
            // routes via the native stack (see react-native-skills:
            // navigation-native-navigators.md — use native navigators).
            //
            // The payload is attacker-influenced, so we validate the target
            // through the deep-link allowlist before navigating (see
            // resolveNotificationTarget) and fall back to home for anything
            // that isn't allowlisted.
            const deepLink = typeof data?.deepLink === 'string' ? data.deepLink : undefined;
            const conversationId = typeof data?.conversationId === 'string' ? data.conversationId : undefined;
            const target = resolveNotificationTarget(deepLink, conversationId) ?? NOTIFICATION_FALLBACK_ROUTE;
            router.push(target as any);
        });

        return () => sub.remove();
    }, [user?.id, router]);
}
