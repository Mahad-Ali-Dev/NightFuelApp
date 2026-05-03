import React, { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Alert, useColorScheme } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeContext, getThemeColors, typography, spacing, borderRadius, shadows, ColorScheme } from '@/theme';
import { colors } from '@/theme/colors';
import { useAuthStore } from '@/store/authStore';
import { useThemeStore } from '@/store/themeStore';
import { setOnSessionExpired } from '@/api/client';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { NetworkStatusBar } from '@/components/NetworkStatusBar';
import BadgeToast from '@/components/BadgeToast';
import { getErrorMessage } from '@/utils/validation';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { useNotifications } from '@/hooks/useNotifications';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 2,
    },
    mutations: {
      onError: (error: unknown) => {
        Alert.alert('Error', getErrorMessage(error));
      },
    },
  },
});

export default function RootLayout() {
  const systemScheme = useColorScheme();
  const { isDarkTheme } = useThemeStore();
  const scheme = (isDarkTheme(systemScheme) ? 'dark' : 'light') as ColorScheme;
  const themeColors = getThemeColors(scheme);

  const themeValue = {
    scheme,
    colors: themeColors,
    typography,
    spacing,
    borderRadius,
    shadows,
  };

  const { loadSession } = useAuthStore();
  const router = useRouter();

  useOfflineSync();    // Drains offline queue when connectivity is restored
  useNotifications(); // Registers push token with backend

  useEffect(() => {
    loadSession();
  }, []);

  // Redirect to login when tokens expire irrecoverably
  useEffect(() => {
    setOnSessionExpired(() => {
      useAuthStore.getState().logout();
      router.replace('/(auth)/login' as any);
    });
  }, [router]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeContext.Provider value={themeValue}>
            <ErrorBoundary>
              <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
              <NetworkStatusBar />
              <BadgeToast />
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: colors.background.primary },
                  animation: 'slide_from_right',
                }}
              >
                <Stack.Screen name="index" />
                <Stack.Screen name="(auth)" options={{ animation: 'fade' }} />
                <Stack.Screen name="(onboarding)" options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
                <Stack.Screen name="(modals)" options={{ headerShown: false, presentation: 'modal' }} />
                <Stack.Screen name="(coach)" options={{ animation: 'fade' }} />
                <Stack.Screen name="(exercises)" options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="(meals)" options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="(performance)" options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="(settings)" options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="coaches/browse" options={{ animation: 'slide_from_bottom' }} />
                <Stack.Screen name="messages/[id]" options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="training" options={{ animation: 'slide_from_bottom' }} />
                <Stack.Screen name="(community)" options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="(shifts)" options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="(admin)" options={{ animation: 'slide_from_right' }} />
              </Stack>
            </ErrorBoundary>
          </ThemeContext.Provider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
