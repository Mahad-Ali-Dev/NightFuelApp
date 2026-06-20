import React from 'react';
import { Redirect } from 'expo-router';
import { useAuthStore } from '@/store/authStore';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Skeleton } from '@/components/ui';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';

/**
 * Auth gate / pre-redirect splash.
 *
 * While the auth store rehydrates the session (`isLoading`), this is a brief
 * splash with NO content layout to mirror — so instead of a bare, unannounced
 * full-screen <ActivityIndicator> (the spinner-debt anti-pattern), we render a
 * single ACCESSIBLE loading container: `accessibilityRole="progressbar"` +
 * `accessibilityLabel` + `accessibilityState={{ busy: true }}` so screen
 * readers announce "Loading your account, busy". The container keeps the
 * branded background and holds a logo/tagline Skeleton placeholder above a
 * small spinner — the spinner is acceptable here because it lives INSIDE the
 * labelled, announced container (it is no longer the bare full-screen pattern).
 *
 * Behaviour is preserved: the redirect logic below (onboarding / tabs / login)
 * is unchanged. The auth store exposes only `isLoading` + `isAuthenticated`
 * (no error / refetch), so there is no error/empty path to render here.
 *
 * RN rules applied (see ~/.claude/skills/react-native-skills/rules):
 *  - rendering-no-falsy-and: this file uses early returns only (no `x && <JSX>`
 *    leaked-render), so there is no falsy-value render-crash surface.
 *  - ui-styling: StyleSheet tokens (spacing + theme colors); hierarchy via the
 *    Skeleton blocks, no ad-hoc multi-font-size scaffolding.
 *  - react-state-fallback: n/a — there is no local component state here; the
 *    loading flag is the auth store's ground truth, read directly.
 *  - ui-pressable / a11y: no pressables on this splash; the a11y fix is the
 *    announced progressbar container (role + label + busy) replacing the
 *    silent spinner so assistive tech reports the wait instead of dead air.
 *  - ui-safe-area-scroll: n/a — this is a single centered, non-scrolling splash
 *    with no list/content that could collide with the safe-area insets; it is
 *    replaced by a redirect the instant `isLoading` flips, so there is nothing
 *    to scroll and no SafeAreaView/contentInset to add.
 */
export default function RootIndex() {
  const { isAuthenticated, isLoading, user } = useAuthStore();

  if (isLoading) {
    return (
      <View
        style={styles.loading}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel="Loading your account"
        accessibilityState={{ busy: true }}
      >
        <View style={styles.brandBlock}>
          <Skeleton width={140} height={28} radius={8} />
          <Skeleton width={200} height={14} radius={7} />
        </View>
        <ActivityIndicator size="large" color={colors.accent.coral} />
      </View>
    );
  }

  if (isAuthenticated && user && !user.onboardingComplete) {
    return <Redirect href="/(onboarding)/metrics-goals" />;
  }

  if (isAuthenticated) {
    return <Redirect href="/(tabs)" />;
  }

  return <Redirect href="/(auth)/login" />;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xl,
    backgroundColor: colors.background.primary,
  },
  brandBlock: {
    alignItems: 'center',
    gap: spacing.sm,
  },
});
