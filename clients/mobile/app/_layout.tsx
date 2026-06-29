// Side-effect import: initializes Sentry at module load, before any React code.
// Must be the first import so SDK is up before anything else can throw.
import '@/lib/sentry';

import React, { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Alert, useColorScheme } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts, Barlow_400Regular, Barlow_500Medium, Barlow_600SemiBold, Barlow_700Bold } from '@expo-google-fonts/barlow';
import { BarlowCondensed_600SemiBold, BarlowCondensed_700Bold, BarlowCondensed_800ExtraBold } from '@expo-google-fonts/barlow-condensed';
import { Saira_400Regular, Saira_500Medium, Saira_600SemiBold, Saira_700Bold } from '@expo-google-fonts/saira';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeContext, resolveThemeColors, typography, spacing, borderRadius, ColorScheme } from '@/theme';
import { makeShadows } from '@/theme/shadows';
import { isLightHex } from '@/theme/utils';
import { useAuthStore } from '@/store/authStore';
import { useThemeStore } from '@/store/themeStore';
import { setOnSessionExpired } from '@/api/client';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { NetworkStatusBar } from '@/components/NetworkStatusBar';
import BadgeToast from '@/components/BadgeToast';
import { getErrorMessage } from '@/utils/validation';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { useNotifications } from '@/hooks/useNotifications';
import { useCircadianReminders } from '@/hooks/useCircadianReminders';
import { wrap as sentryWrap, setUser as sentrySetUser, captureException } from '@/lib/sentry';
import * as Linking from 'expo-linking';
import { resolveDeepLink } from '@/lib/deepLinks';
import {
  MedicalDisclaimerScreen,
  hasAcknowledgedMedicalDisclaimer,
} from '@/components/MedicalDisclaimer';
import { checkAndReportCompromise } from '@/lib/jailDetect';

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

// Hold the native splash until our brand fonts (Saira — the brand face — plus
// Barlow / Barlow Condensed) load, so the very first frame renders in-brand with
// no system-font flash.
SplashScreen.preventAutoHideAsync().catch(() => {});

function RootLayout() {
  const systemScheme = useColorScheme();
  const [fontsLoaded] = useFonts({
    Saira_400Regular, Saira_500Medium, Saira_600SemiBold, Saira_700Bold,
    Barlow_400Regular, Barlow_500Medium, Barlow_600SemiBold, Barlow_700Bold,
    BarlowCondensed_600SemiBold, BarlowCondensed_700Bold, BarlowCondensed_800ExtraBold,
  });
  useEffect(() => { if (fontsLoaded) SplashScreen.hideAsync().catch(() => {}); }, [fontsLoaded]);
  const { isDarkTheme, nightRead, themeVariant } = useThemeStore();
  const scheme = (isDarkTheme(systemScheme) ? 'dark' : 'light') as ColorScheme;
  // Night Read (when ON) swaps in the deep-red, melatonin-safe palette so every
  // `useTheme()` consumer re-themes (highest priority). Otherwise the selected
  // color-theme variant drives the palette (default 'midnight-lime' = the
  // unchanged Aurora dark look, so existing users see exactly the current theme).
  const themeColors = React.useMemo(
    () => resolveThemeColors(scheme, nightRead, themeVariant),
    [scheme, nightRead, themeVariant],
  );
  // Scheme-aware shadows: dark variants keep the tuned dark elevation; LIGHT
  // variants drop the Android system shadow + soften the iOS cast/halo so cards
  // don't smear the near-white surface (the "shadow over the sections" bug).
  const themedShadows = React.useMemo(
    () => makeShadows(isLightHex(themeColors.background.primary)),
    [themeColors],
  );

  // Memoized so the ThemeContext value is referentially stable across the root's
  // frequent re-renders (auth / notification / connectivity churn during startup).
  // Without this, a fresh object every render forces EVERY `useTheme()` consumer in
  // the app to re-render on each root render — which on input screens can disrupt
  // focus and read as flicker.
  const themeValue = React.useMemo(() => ({
    scheme,
    colors: themeColors,
    typography,
    spacing,
    borderRadius,
    shadows: themedShadows,
  }), [scheme, nightRead, themeVariant, themeColors, themedShadows]);

  // Per-field scoped selectors: an unscoped `useAuthStore()` destructure
  // subscribes the root to EVERY auth-store change, so any field mutation
  // (e.g. isLoading flipping during loadSession, or a profile refetch) would
  // re-render the whole root — and on the auth path that churn bounced users
  // mid-type. Scope to exactly the two fields this layout reads.
  const loadSession = useAuthStore((s) => s.loadSession);
  const user = useAuthStore((s) => s.user);
  const router = useRouter();
  const [disclaimerVisible, setDisclaimerVisible] = React.useState(false);

  // Apple guideline 1.4.1 — show medical disclaimer on first launch.
  // Persists acknowledgement to AsyncStorage so we never re-prompt.
  useEffect(() => {
    hasAcknowledgedMedicalDisclaimer().then((acked) => {
      if (!acked) setDisclaimerVisible(true);
    });
  }, []);

  // Soft jailbreak/root detection — logs a Sentry tag if the device looks
  // compromised. Doesn't block the user; just gives us aggregate visibility
  // for abuse pattern analysis.
  useEffect(() => {
    void checkAndReportCompromise();
  }, []);

  useOfflineSync();    // Drains offline queue when connectivity is restored
  useNotifications(); // Registers push token with backend
  useCircadianReminders(); // Schedules shift-timed circadian local reminders (eat / caffeine / wind-down / log sleep)

  useEffect(() => {
    loadSession();
  }, []);

  // Tag Sentry events with the current user id (never email or name —
  // those are PII and get scrubbed by `beforeSend` anyway).
  useEffect(() => {
    sentrySetUser(user?.id ?? null);
  }, [user?.id]);

  // Deep-link handling — every incoming URL passes through resolveDeepLink
  // before we navigate. Anything not on the allowlist is dropped silently
  // and logged to Sentry as a soft signal so we can spot misconfigured
  // marketing links / phishing attempts.
  useEffect(() => {
    const handle = (url: string | null | undefined) => {
      if (!url) return;
      const result = resolveDeepLink(url);
      if (result.safe) {
        router.push(result.route as any);
      } else {
        captureException(new Error('deep_link_rejected'), {
          reason: result.reason,
          // Path only — never the full URL, which may contain auth tokens.
          path: (() => {
            try { return new URL(url).pathname; } catch { return '<unparseable>'; }
          })(),
        });
      }
    };

    Linking.getInitialURL().then(handle);
    const sub = Linking.addEventListener('url', (e) => handle(e.url));
    return () => sub.remove();
  }, [router]);

  // Redirect to login when tokens expire irrecoverably
  useEffect(() => {
    setOnSessionExpired(() => {
      useAuthStore.getState().logout();
      router.replace('/(auth)/login' as any);
    });
  }, [router]);

  // Hold render until the brand fonts are ready (native splash stays up meanwhile).
  if (!fontsLoaded) return null;

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
                  contentStyle: { backgroundColor: themeColors.background.primary },
                  animation: 'slide_from_right',
                }}
              >
                <Stack.Screen name="index" />
                <Stack.Screen name="(auth)" options={{ animation: 'fade' }} />
                <Stack.Screen name="(onboarding)" options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
                <Stack.Screen name="(modals)" options={{ headerShown: false, presentation: 'modal' }} />
                <Stack.Screen name="(coach)" options={{ animation: 'fade' }} />
                <Stack.Screen name="(challenge)" options={{ animation: 'slide_from_right' }} />
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
              <MedicalDisclaimerScreen
                visible={disclaimerVisible}
                onAcknowledge={() => setDisclaimerVisible(false)}
              />
            </ErrorBoundary>
          </ThemeContext.Provider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

// Sentry.wrap adds an error boundary at the very root + Sentry profiling
// hooks. Our custom <ErrorBoundary> still wraps the navigator below — the two
// are complementary: Sentry.wrap catches errors in the providers themselves,
// our ErrorBoundary catches errors below the navigator and shows a recovery UI.
export default sentryWrap(RootLayout);
