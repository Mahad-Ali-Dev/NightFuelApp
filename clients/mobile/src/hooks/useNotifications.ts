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

// Expo Go sets appOwnership to 'expo'; development/standalone builds set it to null.
const IS_EXPO_GO = Constants.appOwnership === 'expo';

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
    if (IS_EXPO_GO || !Constants.isDevice) {
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

    const tokenData = await Notifications.getExpoPushTokenAsync();
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
            const deepLink = typeof data?.deepLink === 'string' ? data.deepLink : undefined;
            const conversationId = typeof data?.conversationId === 'string' ? data.conversationId : undefined;
            const target = deepLink ?? (conversationId ? `/messages/${conversationId}` : undefined);
            if (target) {
                router.push(target as any);
            }
        });

        return () => sub.remove();
    }, [user?.id, router]);
}
